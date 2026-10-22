-- =============================================================================
-- Migration 0018:
--   Part A — Word Cipher (رازواژه) Surgical Bug Fixes:
--     1. Short-word false-positive fix in clue validation (token + suffix match
--        for 2-3 char targets like "مه"/"دف", substring match only for >=4 chars)
--     2. Automatic round-timeout transition (wg_check_round_timeout) so expired
--        rounds transition cleanly to phase = 'round_result' with history entry
--     3. Server-side DUPLICATE_GUESS protection in wg_submit_guess
--   Part B — Code Breaker (رمزگشا — Real-Time 2-Player 4-Digit Cipher Duel):
--     Full PostgreSQL 17 schema, RLS zero-leak isolation, atomic row locks for
--     simultaneous submissions & near-simultaneous wins, server timestamps &
--     elapsed ms, dual-readiness gate, full dual guess histories, and rematch.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART A: WORD CIPHER (رازواژه) SURGICAL SQL FIXES
-- -----------------------------------------------------------------------------

create or replace function public.wg_clue_leaks_target(
  p_clue text,
  p_target text,
  p_target_en text,
  p_accepted text[]
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_clue_norm text := public.wg_normalize_text(p_clue);
  v_clue_key text := public.wg_compact_key(p_clue);
  v_tokens text[] := string_to_array(v_clue_norm, ' ');
  v_suffixes text[] := array['', 'ها', 'های', 'ی', 'ش', 'ت', 'م', 'ان'];
  v_forbid text;
  v_f_key text;
  v_tok text;
  v_tok_key text;
  v_sfx text;
begin
  foreach v_forbid in array array_prepend(
    coalesce(p_target, ''),
    array_prepend(coalesce(p_target_en, ''), coalesce(p_accepted, array[]::text[]))
  ) loop
    v_f_key := public.wg_compact_key(v_forbid);
    if char_length(v_f_key) = 0 then
      continue;
    end if;

    -- 1. Word-boundary + inflection check for ALL target lengths (catches "مه", "مه‌ها", "دف")
    foreach v_tok in array v_tokens loop
      v_tok_key := public.wg_compact_key(v_tok);
      if char_length(v_tok_key) = 0 then
        continue;
      end if;
      foreach v_sfx in array v_suffixes loop
        if v_tok_key = (v_f_key || v_sfx) then
          return true;
        end if;
      end loop;
    end loop;

    -- 2. Full compact substring scan ONLY for >= 4 char roots (catches "قطب نما", "آتش فشان")
    if char_length(v_f_key) >= 4 and position(v_f_key in v_clue_key) > 0 then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.wg_check_round_timeout(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_round public.wg_rounds;
  v_word public.wg_words;
  v_cat public.wg_categories;
  v_guesser_pts integer := 0;
  v_clue_pts integer := 0;
begin
  select * into v_room from public.wg_rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then
    return false;
  end if;

  select * into v_round
  from public.wg_rounds
  where room_id = v_room.id
    and game_number = v_room.game_number
    and round_number = v_room.current_round
  for update;

  if not found or v_round.phase = 'round_result' or v_round.deadline_at is null then
    return false;
  end if;

  if v_round.deadline_at > now() then
    return false;
  end if;

  if v_round.target_word_id is not null then
    select * into v_word from public.wg_words where id = v_round.target_word_id;
    select * into v_cat from public.wg_categories where id = v_word.category_id;
  end if;

  select coalesce(sum((g ->> 'points_awarded')::integer), 0)
  into v_guesser_pts
  from jsonb_array_elements(coalesce(v_round.guesses, '[]'::jsonb)) g;

  v_clue_pts := case when v_round.related_bonus_claimed then 1 else 0 end;

  update public.wg_rounds
  set phase = 'round_result',
      round_summary = jsonb_build_object(
        'outcome', 'timeout',
        'guesser_points', v_guesser_pts,
        'clue_giver_points', v_clue_pts,
        'speed_bonus', 0,
        'difficulty_bonus', 0
      )
  where id = v_round.id;

  update public.wg_rooms
  set history = v_room.history || jsonb_build_array(jsonb_build_object(
        'round_number', v_round.round_number,
        'clue_giver_seat', v_round.clue_giver_seat,
        'guesser_seat', v_round.guesser_seat,
        'target_word', coalesce(v_word.word, '—'),
        'target_word_en', coalesce(v_word.word_en, '—'),
        'category_title_fa', coalesce(v_cat.title_fa, '—'),
        'difficulty', coalesce(v_word.difficulty, 'medium'),
        'outcome', 'timeout',
        'clues_used', jsonb_array_length(coalesce(v_round.clues, '[]'::jsonb)),
        'guesses_count', jsonb_array_length(coalesce(v_round.guesses, '[]'::jsonb)),
        'guesser_points', v_guesser_pts,
        'clue_giver_points', v_clue_pts
      )),
      version = version + 1,
      last_activity_at = now()
  where id = v_room.id;

  return true;
end;
$$;

create or replace function public.wg_get_room_state(
  p_room_code text,
  p_token text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_seat integer := null;
  v_was_offline boolean := false;
  v_timed_out boolean := false;
begin
  if v_code !~ '^[A-Z2-9]{6}$' then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_room from public.wg_rooms where room_code = v_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  v_timed_out := public.wg_check_round_timeout(v_room.id);
  if v_timed_out then
    select * into v_room from public.wg_rooms where id = v_room.id;
  end if;

  if p_token is not null and btrim(p_token) <> '' then
    select * into v_player
    from public.wg_room_players
    where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token));
    if found then
      v_seat := v_player.seat;
      v_was_offline := (v_player.last_seen_at <= now() - interval '45 seconds');
      update public.wg_room_players set last_seen_at = now() where id = v_player.id;
      if p_notify or v_was_offline or v_timed_out then
        update public.wg_rooms set version = version + 1 where id = v_room.id returning * into v_room;
        perform public.wg_broadcast_state(v_room.id);
      end if;
    end if;
  elsif v_timed_out then
    perform public.wg_broadcast_state(v_room.id);
  end if;

  return jsonb_build_object(
    'seat', v_seat,
    'my_role', public.wg_role_for_seat(v_room, v_seat),
    'state', public.wg_project_state(v_room, v_seat)
  );
end;
$$;

create or replace function public.wg_submit_clue(
  p_room_code text,
  p_token text,
  p_clue_text text,
  p_kind text default 'association',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_word public.wg_words;
  v_cached jsonb;
  v_cleaned text := btrim(regexp_replace(coalesce(p_clue_text, ''), '\s+', ' ', 'g'));
  v_kind text := case when p_kind in ('association', 'category', 'narrowing') then p_kind else 'association' end;
  v_max_clues integer;
  v_resp jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;

  if public.wg_check_round_timeout(v_room.id) then
    select * into v_room from public.wg_rooms where id = v_room.id;
    perform public.wg_broadcast_state(v_room.id);
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  if v_room.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if p_request_id is not null and btrim(p_request_id) <> '' then
    select response into v_cached from public.wg_request_log
    where room_id = v_room.id and player_id = v_player.id and request_id = left(btrim(p_request_id), 64);
    if found then return v_cached; end if;
  end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found then raise exception 'GAME_NOT_ACTIVE'; end if;
  if v_player.seat <> v_round.clue_giver_seat then raise exception 'NOT_YOUR_TURN'; end if;
  if v_round.phase <> 'giving_clue' then raise exception 'NOT_YOUR_TURN'; end if;
  if v_round.target_word_id is null then raise exception 'GAME_NOT_ACTIVE'; end if;

  v_max_clues := coalesce((v_room.rules ->> 'maxCluesPerRound')::integer, 3);
  if jsonb_array_length(v_round.clues) >= v_max_clues then
    raise exception 'MAX_CLUES_REACHED';
  end if;

  if char_length(v_cleaned) < 2 then raise exception 'CLUE_EMPTY'; end if;
  if char_length(v_cleaned) > 60 then raise exception 'CLUE_TOO_LONG'; end if;

  select * into v_word from public.wg_words where id = v_round.target_word_id;
  if public.wg_clue_leaks_target(v_cleaned, v_word.word, v_word.word_en, v_word.accepted_answers) then
    raise exception 'CLUE_CONTAINS_TARGET';
  end if;

  update public.wg_rounds
  set clues = v_round.clues || jsonb_build_array(jsonb_build_object(
        'index', jsonb_array_length(v_round.clues) + 1,
        'text', v_cleaned,
        'source', 'clue_giver',
        'kind', v_kind,
        'created_at', to_jsonb(now())
      )),
      phase = 'guessing'
  where id = v_round.id;

  update public.wg_room_players set last_seen_at = now() where id = v_player.id;
  update public.wg_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;

  perform public.wg_broadcast_state(v_room.id);
  v_resp := jsonb_build_object(
    'seat', v_player.seat,
    'my_role', 'clue_giver',
    'state', public.wg_project_state(v_room, v_player.seat)
  );

  if p_request_id is not null and btrim(p_request_id) <> '' then
    insert into public.wg_request_log (room_id, player_id, request_id, response)
    values (v_room.id, v_player.id, left(btrim(p_request_id), 64), v_resp)
    on conflict do nothing;
  end if;
  return v_resp;
end;
$$;

create or replace function public.wg_submit_guess(
  p_room_code text,
  p_token text,
  p_guess_text text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_word public.wg_words;
  v_cat public.wg_categories;
  v_cached jsonb;
  v_cleaned text := btrim(regexp_replace(coalesce(p_guess_text, ''), '\s+', ' ', 'g'));
  v_guess_key text;
  v_outcome text;
  v_clue_count integer;
  v_clue_idx integer;
  v_elapsed numeric;
  v_guesser_pts integer := 0;
  v_clue_pts integer := 0;
  v_diff_bonus integer := 0;
  v_speed_bonus integer := 0;
  v_related_claimed boolean;
  v_new_guesses jsonb;
  v_max_guesses integer;
  v_max_clues integer;
  v_extra_mode text;
  v_next_phase text;
  v_round_ended boolean := false;
  v_total_guesser_round integer := 0;
  v_total_clue_round integer := 0;
  v_summary jsonb := null;
  v_auto_hint text;
  v_new_clues jsonb;
  v_new_sys_hints integer;
  v_resp jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;

  if public.wg_check_round_timeout(v_room.id) then
    select * into v_room from public.wg_rooms where id = v_room.id;
    perform public.wg_broadcast_state(v_room.id);
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  if v_room.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if p_request_id is not null and btrim(p_request_id) <> '' then
    select response into v_cached from public.wg_request_log
    where room_id = v_room.id and player_id = v_player.id and request_id = left(btrim(p_request_id), 64);
    if found then return v_cached; end if;
  end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found then raise exception 'GAME_NOT_ACTIVE'; end if;
  if v_player.seat <> v_round.guesser_seat or v_round.phase <> 'guessing' then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if char_length(v_cleaned) < 1 or char_length(v_cleaned) > 60 then
    raise exception 'INVALID_GUESS';
  end if;

  v_guess_key := public.wg_compact_key(v_cleaned);
  if char_length(v_guess_key) < 1 then
    raise exception 'INVALID_GUESS';
  end if;

  -- Reject duplicate same-round guesses without burning a guess slot!
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_round.guesses, '[]'::jsonb)) g
    where public.wg_compact_key(g ->> 'guess_text') = v_guess_key
  ) then
    raise exception 'DUPLICATE_GUESS';
  end if;

  select * into v_word from public.wg_words where id = v_round.target_word_id;
  select * into v_cat from public.wg_categories where id = v_word.category_id;

  v_outcome := public.wg_evaluate_answer(v_cleaned, v_word, v_cat, v_round.board_cards);
  v_clue_count := greatest(1, jsonb_array_length(v_round.clues));
  v_clue_idx := least(2, greatest(0, v_clue_count - 1));
  v_elapsed := greatest(1::numeric, extract(epoch from (now() - v_round.started_at))::numeric);
  v_related_claimed := v_round.related_bonus_claimed;

  if v_outcome = 'correct' then
    v_diff_bonus := coalesce((v_room.rules -> 'difficultyBonus' ->> v_word.difficulty)::integer, 0);
    if v_elapsed <= 20 then
      v_speed_bonus := coalesce((v_room.rules ->> 'speedBonusMax')::integer, 3);
    elsif v_elapsed <= 45 then
      v_speed_bonus := greatest(1, coalesce((v_room.rules ->> 'speedBonusMax')::integer, 3) / 2);
    end if;
    v_guesser_pts := coalesce((v_room.rules -> 'pointsCorrectByClue' ->> v_clue_idx)::integer, 8) + v_diff_bonus + v_speed_bonus;
    v_clue_pts := coalesce((v_room.rules -> 'pointsClueGiverBonus' ->> v_clue_idx)::integer, 5) + (v_diff_bonus / 2);
  elsif v_outcome = 'related' and not v_related_claimed then
    v_guesser_pts := coalesce((v_room.rules ->> 'pointsRelatedBonus')::integer, 2);
    v_clue_pts := 1;
    v_related_claimed := true;
  end if;

  update public.wg_room_players
  set score = score + v_guesser_pts,
      correct_guesses = correct_guesses + (case when v_outcome = 'correct' then 1 else 0 end),
      related_guesses = related_guesses + (case when v_outcome = 'related' then 1 else 0 end),
      last_seen_at = now()
  where id = v_player.id;

  if v_clue_pts > 0 or v_outcome = 'correct' then
    update public.wg_room_players
    set score = score + v_clue_pts,
        successful_clues = successful_clues + (case when v_outcome = 'correct' then 1 else 0 end)
    where room_id = v_room.id and seat = v_round.clue_giver_seat;
  end if;

  v_new_guesses := v_round.guesses || jsonb_build_array(jsonb_build_object(
    'index', jsonb_array_length(v_round.guesses) + 1,
    'seat', v_player.seat,
    'player_name', v_player.display_name,
    'guess_text', v_cleaned,
    'normalized_guess', public.wg_normalize_text(v_cleaned),
    'outcome', v_outcome,
    'points_awarded', v_guesser_pts,
    'clue_count_when_guessed', v_clue_count,
    'created_at', to_jsonb(now())
  ));

  v_max_guesses := coalesce((v_room.rules ->> 'maxGuessesPerRound')::integer, 3);
  v_max_clues := coalesce((v_room.rules ->> 'maxCluesPerRound')::integer, 3);
  v_extra_mode := coalesce(v_room.rules ->> 'extraClueMode', 'hybrid');
  v_new_clues := v_round.clues;
  v_new_sys_hints := v_round.system_hints_used;

  if v_outcome = 'correct'
     or jsonb_array_length(v_new_guesses) >= v_max_guesses
     or jsonb_array_length(v_round.clues) >= v_max_clues then
    v_round_ended := true;
    v_next_phase := 'round_result';

    select coalesce(sum((g ->> 'points_awarded')::integer), 0)
    into v_total_guesser_round
    from jsonb_array_elements(v_new_guesses) g;

    v_total_clue_round := v_clue_pts + (case when v_round.related_bonus_claimed and v_outcome = 'correct' then 1 else 0 end)
      + (case when v_outcome <> 'correct' and v_related_claimed then 1 else 0 end);

    v_summary := jsonb_build_object(
      'outcome', v_outcome,
      'guesser_points', v_total_guesser_round,
      'clue_giver_points', v_total_clue_round,
      'speed_bonus', v_speed_bonus,
      'difficulty_bonus', v_diff_bonus
    );

    update public.wg_rooms
    set history = v_room.history || jsonb_build_array(jsonb_build_object(
          'round_number', v_round.round_number,
          'clue_giver_seat', v_round.clue_giver_seat,
          'guesser_seat', v_round.guesser_seat,
          'target_word', v_word.word,
          'target_word_en', v_word.word_en,
          'category_title_fa', v_cat.title_fa,
          'difficulty', v_word.difficulty,
          'outcome', v_outcome,
          'clues_used', jsonb_array_length(v_round.clues),
          'guesses_count', jsonb_array_length(v_new_guesses),
          'guesser_points', v_total_guesser_round,
          'clue_giver_points', v_total_clue_round
        )),
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;
  else
    if v_extra_mode = 'system_hints' and v_round.system_hints_used < 2 then
      v_auto_hint := coalesce(v_word.hint_words[v_round.system_hints_used + 1], v_word.related_words[1], 'راهنمای کمکی');
      v_new_sys_hints := v_round.system_hints_used + 1;
      v_new_clues := v_round.clues || jsonb_build_array(jsonb_build_object(
        'index', jsonb_array_length(v_round.clues) + 1,
        'text', v_auto_hint,
        'source', 'system_hint',
        'kind', 'narrowing',
        'created_at', to_jsonb(now())
      ));
      v_next_phase := 'guessing';
    else
      v_next_phase := 'giving_clue';
    end if;

    update public.wg_rooms
    set version = version + 1, last_activity_at = now()
    where id = v_room.id returning * into v_room;
  end if;

  update public.wg_rounds
  set guesses = v_new_guesses,
      clues = v_new_clues,
      system_hints_used = v_new_sys_hints,
      related_bonus_claimed = v_related_claimed,
      phase = v_next_phase,
      round_summary = coalesce(v_summary, round_summary)
  where id = v_round.id;

  perform public.wg_broadcast_state(v_room.id);
  v_resp := jsonb_build_object(
    'seat', v_player.seat,
    'my_role', public.wg_role_for_seat(v_room, v_player.seat),
    'evaluation', jsonb_build_object(
      'outcome', v_outcome,
      'points_awarded', v_guesser_pts,
      'round_ended', v_round_ended
    ),
    'state', public.wg_project_state(v_room, v_player.seat)
  );

  if p_request_id is not null and btrim(p_request_id) <> '' then
    insert into public.wg_request_log (room_id, player_id, request_id, response)
    values (v_room.id, v_player.id, left(btrim(p_request_id), 64), v_resp)
    on conflict do nothing;
  end if;
  return v_resp;
end;
$$;

-- =============================================================================
-- PART B: CODE BREAKER (رمزگشا — REAL-TIME TWO-PLAYER 4-DIGIT CIPHER DUEL)
-- =============================================================================

create table if not exists public.cb_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'abandoned', 'expired')),
  current_round integer not null default 1 check (current_round >= 1),
  max_attempts_per_player integer null
    check (max_attempts_per_player is null or (max_attempts_per_player between 4 and 50)),
  past_rounds jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '6 hours')
);

create table if not exists public.cb_room_players (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.cb_rooms(id) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  display_name text not null check (char_length(display_name) between 2 and 24),
  player_token_hash text not null,
  profile_id uuid null references public.player_profiles(id) on delete set null,
  is_ready boolean not null default false,
  wins integer not null default 0 check (wins >= 0),
  connected boolean not null default true,
  joined_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  unique (room_id, seat),
  unique (room_id, player_token_hash)
);

create table if not exists public.cb_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.cb_rooms(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  -- Secret 4-digit string: ALWAYS stored as exact 4-char text ('0000'..'9999'), NEVER int!
  secret_code text null check (secret_code is null or secret_code ~ '^[0-9]{4}$'),
  started_at timestamptz null,
  ended_at timestamptz null,
  winner_seat smallint null check (winner_seat is null or winner_seat in (1, 2)),
  winning_guess_id uuid null,
  created_at timestamptz not null default clock_timestamp(),
  unique (room_id, round_number)
);

create table if not exists public.cb_guesses (
  id uuid primary key default extensions.gen_random_uuid(),
  round_id uuid not null references public.cb_rounds(id) on delete cascade,
  room_id uuid not null references public.cb_rooms(id) on delete cascade,
  round_number integer not null,
  seat smallint not null check (seat in (1, 2)),
  player_name text not null,
  player_attempt_number integer not null check (player_attempt_number >= 1),
  global_attempt_order integer not null check (global_attempt_order >= 1),
  -- Guess code preserved strictly as exact 4-char string ('0072', '9090', etc.)
  guess_code text not null check (guess_code ~ '^[0-9]{4}$'),
  digits jsonb not null,
  green_count smallint not null check (green_count between 0 and 4),
  yellow_count smallint not null check (yellow_count between 0 and 4),
  red_count smallint not null check (red_count between 0 and 4),
  is_winner boolean not null default false,
  submitted_at timestamptz not null default clock_timestamp(),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  unique (round_id, global_attempt_order),
  unique (round_id, seat, player_attempt_number)
);

create table if not exists public.cb_request_log (
  id bigserial primary key,
  bucket text not null,
  actor_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_cb_guesses_round_order on public.cb_guesses(round_id, global_attempt_order);
create index if not exists idx_cb_rounds_room_round on public.cb_rounds(room_id, round_number);
create index if not exists idx_cb_req_log_created on public.cb_request_log(created_at);

-- Zero-leak security: enable RLS with zero permissive policies + revoke direct table access
alter table public.cb_rooms enable row level security;
alter table public.cb_room_players enable row level security;
alter table public.cb_rounds enable row level security;
alter table public.cb_guesses enable row level security;
alter table public.cb_request_log enable row level security;

revoke all on public.cb_rooms from public, anon, authenticated;
revoke all on public.cb_room_players from public, anon, authenticated;
revoke all on public.cb_rounds from public, anon, authenticated;
revoke all on public.cb_guesses from public, anon, authenticated;
revoke all on public.cb_request_log from public, anon, authenticated;

-- Helper: Normalize Persian/Arabic digits -> exact 4-char ASCII string ('0000'..'9999')
create or replace function public.cb_normalize_code4(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v_clean text;
begin
  if p_raw is null then return null; end if;
  v_clean := translate(
    btrim(p_raw),
    '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',
    '01234567890123456789'
  );
  if v_clean !~ '^[0-9]{4}$' then
    return null;
  end if;
  return v_clean;
end;
$$;

-- Helper: Cryptographic 4-digit secret code generator ('0000'..'9999' uniform distribution)
create or replace function public.cb_generate_secret_code4()
returns text
language plpgsql
volatile
as $$
declare
  v_bytes bytea;
  v_raw bigint;
begin
  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_raw := (get_byte(v_bytes, 0)::bigint << 24)
           + (get_byte(v_bytes, 1)::bigint << 16)
           + (get_byte(v_bytes, 2)::bigint << 8)
           + (get_byte(v_bytes, 3)::bigint);
    exit when v_raw < 4294960000;
  end loop;
  return lpad((v_raw % 10000)::text, 4, '0');
end;
$$;

-- Helper: Deterministic two-pass 4-digit evaluation (exact duplicate handling!)
create or replace function public.cb_evaluate_guess(
  p_secret text,
  p_guess text
)
returns jsonb
language plpgsql
immutable
strict
as $$
declare
  v_colors text[] := array['red', 'red', 'red', 'red'];
  v_pool int[] := array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  v_green int := 0;
  v_yellow int := 0;
  v_red int := 0;
  i int;
  v_s_digit int;
  v_g_digit int;
  v_digits jsonb := '[]'::jsonb;
begin
  if p_secret !~ '^[0-9]{4}$' or p_guess !~ '^[0-9]{4}$' then
    raise exception 'INVALID_CODE_GUESS';
  end if;

  -- Pass 1: Exact position matches -> GREEN; non-matched secret digits populate pool
  for i in 1..4 loop
    if substr(p_guess, i, 1) = substr(p_secret, i, 1) then
      v_colors[i] := 'green';
      v_green := v_green + 1;
    else
      v_s_digit := substr(p_secret, i, 1)::int;
      v_pool[v_s_digit + 1] := v_pool[v_s_digit + 1] + 1;
    end if;
  end loop;

  -- Pass 2: Remaining non-green positions check unmatched pool (no double counting!)
  for i in 1..4 loop
    if v_colors[i] <> 'green' then
      v_g_digit := substr(p_guess, i, 1)::int;
      if v_pool[v_g_digit + 1] > 0 then
        v_colors[i] := 'yellow';
        v_pool[v_g_digit + 1] := v_pool[v_g_digit + 1] - 1;
        v_yellow := v_yellow + 1;
      else
        v_colors[i] := 'red';
        v_red := v_red + 1;
      end if;
    end if;
  end loop;

  for i in 1..4 loop
    v_digits := v_digits || jsonb_build_array(
      jsonb_build_object(
        'position', i - 1,
        'digit', substr(p_guess, i, 1),
        'color', v_colors[i]
      )
    );
  end loop;

  return jsonb_build_object(
    'digits', v_digits,
    'green_count', v_green,
    'yellow_count', v_yellow,
    'red_count', v_red,
    'is_exact_match', (v_green = 4)
  );
end;
$$;

create or replace function public.cb_check_rate(
  p_bucket text,
  p_actor text,
  p_max integer,
  p_window_sec integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := public.hash_token(coalesce(p_actor, 'anon'));
  v_cnt integer;
begin
  select count(*) into v_cnt
  from public.cb_request_log
  where bucket = p_bucket
    and actor_hash = v_hash
    and created_at >= clock_timestamp() - make_interval(secs => p_window_sec);

  if v_cnt >= p_max then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.cb_request_log(bucket, actor_hash) values (p_bucket, v_hash);
end;
$$;

create or replace function public.cb_broadcast_state(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.cb_rooms;
begin
  select * into v_room from public.cb_rooms where id = p_room_id;
  if not found then return; end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'room_code', v_room.room_code,
        'status', v_room.status,
        'current_round', v_room.current_round,
        'version', v_room.version
      ),
      'state',
      'cb_room:' || v_room.room_code,
      false
    );
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.cb_project_state(
  p_room public.cb_rooms,
  p_viewer_seat integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.cb_rounds;
  v_players jsonb;
  v_all_guesses jsonb;
  v_my_guesses jsonb;
  v_opp_guesses jsonb;
  v_winner_name text := null;
  v_now timestamptz := clock_timestamp();
  v_elapsed_ms bigint := 0;
begin
  select * into v_round
  from public.cb_rounds
  where room_id = p_room.id and round_number = p_room.current_round;

  if v_round.winner_seat is not null then
    select display_name into v_winner_name
    from public.cb_room_players
    where room_id = p_room.id and seat = v_round.winner_seat;
  end if;

  if v_round.started_at is not null then
    v_elapsed_ms := greatest(
      0,
      floor(
        extract(epoch from (coalesce(v_round.ended_at, v_now) - v_round.started_at)) * 1000
      )::bigint
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seat', p.seat,
        'name', p.display_name,
        'connected', p.connected,
        'is_ready', p.is_ready,
        'wins', p.wins,
        'attempts_this_round', (
          select count(*)::int
          from public.cb_guesses g
          where g.round_id = v_round.id and g.seat = p.seat
        )
      )
      order by p.seat asc
    ),
    '[]'::jsonb
  )
  into v_players
  from public.cb_room_players p
  where p.room_id = p_room.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'round_number', g.round_number,
        'seat', g.seat,
        'player_name', g.player_name,
        'player_attempt_number', g.player_attempt_number,
        'global_attempt_order', g.global_attempt_order,
        'guess_code', g.guess_code,
        'digits', g.digits,
        'green_count', g.green_count,
        'yellow_count', g.yellow_count,
        'red_count', g.red_count,
        'is_winner', g.is_winner,
        'submitted_at', g.submitted_at,
        'elapsed_ms', g.elapsed_ms
      )
      order by g.global_attempt_order asc
    ),
    '[]'::jsonb
  )
  into v_all_guesses
  from public.cb_guesses g
  where g.round_id = v_round.id;

  select coalesce(
    jsonb_agg(elem order by (elem->>'player_attempt_number')::int asc),
    '[]'::jsonb
  )
  into v_my_guesses
  from jsonb_array_elements(v_all_guesses) elem
  where p_viewer_seat is not null and (elem->>'seat')::int = p_viewer_seat;

  select coalesce(
    jsonb_agg(elem order by (elem->>'player_attempt_number')::int asc),
    '[]'::jsonb
  )
  into v_opp_guesses
  from jsonb_array_elements(v_all_guesses) elem
  where p_viewer_seat is not null and (elem->>'seat')::int <> p_viewer_seat;

  return jsonb_build_object(
    'room_id', p_room.id,
    'room_code', p_room.room_code,
    'status', p_room.status,
    'version', p_room.version,
    'current_round', p_room.current_round,
    'max_players', 2,
    'max_attempts_per_player', p_room.max_attempts_per_player,
    'server_now', v_now,
    'round_started_at', v_round.started_at,
    'round_ended_at', v_round.ended_at,
    'elapsed_ms', v_elapsed_ms,
    -- CRITICAL ZERO-LEAK INVARIANT: secret_code is strictly NULL until status = 'finished'!
    'secret_code', case when p_room.status = 'finished' then v_round.secret_code else null end,
    'winner_seat', v_round.winner_seat,
    'winner_name', v_winner_name,
    'winning_guess_id', v_round.winning_guess_id,
    'players', v_players,
    'my_guesses', v_my_guesses,
    'opponent_guesses', v_opp_guesses,
    'all_guesses', v_all_guesses,
    'past_rounds', coalesce(p_room.past_rounds, '[]'::jsonb)
  );
end;
$$;

-- 1. Create Code Breaker Room
create or replace function public.cb_create_room(
  p_display_name text,
  p_max_attempts integer default null,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet := public.get_client_ip();
  v_settings public.platform_settings;
  v_name text := public.validate_display_name(p_display_name);
  v_code text := '';
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_profile_id uuid := null;
  v_room public.cb_rooms;
  v_try int := 0;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.maintenance_mode then
    raise exception 'MAINTENANCE';
  end if;
  if not public.rate_limit_check('cb_create', v_ip, coalesce(v_settings.max_rooms_per_ip_per_hour, 25), interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_max_attempts is not null and (p_max_attempts < 4 or p_max_attempts > 50) then
    raise exception 'INVALID_SETTING';
  end if;

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
    v_code := public.generate_room_code();
    exit when not exists (select 1 from public.cb_rooms where room_code = v_code);
  end loop;

  insert into public.cb_rooms (room_code, status, current_round, max_attempts_per_player)
  values (v_code, 'waiting', 1, p_max_attempts)
  returning * into v_room;

  insert into public.cb_room_players (room_id, seat, display_name, player_token_hash, profile_id, is_ready)
  values (v_room.id, 1, v_name, public.hash_token(v_token), v_profile_id, false);

  insert into public.cb_rounds (room_id, round_number, secret_code, started_at)
  values (v_room.id, 1, null, null);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 1,
    'state', public.cb_project_state(v_room, 1)
  );
end;
$$;

-- 2. Join Code Breaker Room
create or replace function public.cb_join_room(
  p_room_code text,
  p_display_name text,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_name text := public.validate_display_name(p_display_name);
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_profile_id uuid := null;
  v_room public.cb_rooms;
  v_player_count int;
begin
  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if v_room.status in ('abandoned', 'expired') or v_room.expires_at <= clock_timestamp() then
    raise exception 'ROOM_EXPIRED';
  end if;

  select count(*) into v_player_count from public.cb_room_players where room_id = v_room.id;
  if v_player_count >= 2 then
    raise exception 'ROOM_FULL';
  end if;

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  insert into public.cb_room_players (room_id, seat, display_name, player_token_hash, profile_id, is_ready)
  values (v_room.id, 2, v_name, public.hash_token(v_token), v_profile_id, false);

  update public.cb_rooms
  set version = version + 1, updated_at = clock_timestamp()
  where id = v_room.id
  returning * into v_room;

  perform public.cb_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 2,
    'state', public.cb_project_state(v_room, 2)
  );
end;
$$;

-- 3. Toggle Lobby Readiness (Generates Secret Code & Starts Round Timer ONLY when BOTH Ready!)
create or replace function public.cb_set_ready(
  p_room_code text,
  p_token text,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.cb_rooms;
  v_player public.cb_room_players;
  v_ready_count int;
  v_total_players int;
  v_secret text;
begin
  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if v_room.status <> 'waiting' then
    select * into v_player
    from public.cb_room_players
    where room_id = v_room.id and player_token_hash = public.hash_token(btrim(coalesce(p_token, '')));
    if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;
    return jsonb_build_object(
      'room_code', v_room.room_code,
      'seat', v_player.seat,
      'state', public.cb_project_state(v_room, v_player.seat)
    );
  end if;

  select * into v_player
  from public.cb_room_players
  where room_id = v_room.id and player_token_hash = public.hash_token(btrim(coalesce(p_token, '')))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  update public.cb_room_players
  set is_ready = coalesce(p_ready, true),
      connected = true,
      last_seen_at = clock_timestamp()
  where id = v_player.id;

  select count(*), count(*) filter (where is_ready)
  into v_total_players, v_ready_count
  from public.cb_room_players
  where room_id = v_room.id;

  if v_total_players = 2 and v_ready_count = 2 then
    v_secret := public.cb_generate_secret_code4();

    update public.cb_rounds
    set secret_code = v_secret,
        started_at = clock_timestamp(),
        ended_at = null,
        winner_seat = null,
        winning_guess_id = null
    where room_id = v_room.id and round_number = v_room.current_round;

    update public.cb_rooms
    set status = 'active',
        version = version + 1,
        updated_at = clock_timestamp()
    where id = v_room.id
    returning * into v_room;
  else
    update public.cb_rooms
    set version = version + 1,
        updated_at = clock_timestamp()
    where id = v_room.id
    returning * into v_room;
  end if;

  perform public.cb_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'seat', v_player.seat,
    'state', public.cb_project_state(v_room, v_player.seat)
  );
end;
$$;

-- 4. Get Room State & Reconnection Handler
create or replace function public.cb_get_room_state(
  p_room_code text,
  p_token text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.cb_rooms;
  v_player public.cb_room_players;
  v_seat int := null;
  v_was_offline boolean := false;
begin
  if v_code !~ '^[A-Z2-9]{6}$' then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_room from public.cb_rooms where room_code = v_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if v_room.expires_at <= clock_timestamp() and v_room.status not in ('finished', 'abandoned', 'expired') then
    update public.cb_rooms set status = 'expired', version = version + 1 where id = v_room.id returning * into v_room;
  end if;

  if p_token is not null and btrim(p_token) <> '' then
    select * into v_player
    from public.cb_room_players
    where room_id = v_room.id and player_token_hash = public.hash_token(btrim(p_token));
    if found then
      v_seat := v_player.seat;
      v_was_offline := not v_player.connected;
      update public.cb_room_players
      set connected = true, last_seen_at = clock_timestamp()
      where id = v_player.id;
    end if;
  end if;

  if p_notify and v_was_offline then
    perform public.cb_broadcast_state(v_room.id);
  end if;

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'seat', v_seat,
    'state', public.cb_project_state(v_room, v_seat)
  );
end;
$$;

-- 5. Submit 4-Digit Guess (Atomic Row Lock Resolves Simultaneous Submissions & Wins!)
create or replace function public.cb_submit_guess(
  p_room_code text,
  p_token text,
  p_guess_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_clean_guess text := public.cb_normalize_code4(p_guess_code);
  v_room public.cb_rooms;
  v_round public.cb_rounds;
  v_player public.cb_room_players;
  v_other public.cb_room_players;
  v_eval jsonb;
  v_now timestamptz;
  v_elapsed_ms bigint;
  v_player_attempt int;
  v_global_order int;
  v_other_attempts int;
  v_is_winner boolean;
  v_guess_id uuid;
begin
  if v_clean_guess is null then
    raise exception 'INVALID_CODE_GUESS';
  end if;

  perform public.cb_check_rate('submit_guess', coalesce(p_token, 'anon'), 90, 60);

  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player
  from public.cb_room_players
  where room_id = v_room.id and player_token_hash = public.hash_token(btrim(coalesce(p_token, '')));
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if v_room.status = 'waiting' then
    raise exception 'WAITING_FOR_READY';
  end if;
  if v_room.status = 'finished' then
    raise exception 'ROUND_ALREADY_FINISHED';
  end if;
  if v_room.status <> 'active' then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  select * into v_round
  from public.cb_rounds
  where room_id = v_room.id and round_number = v_room.current_round
  for update;

  if not found or v_round.secret_code is null or v_round.started_at is null then
    raise exception 'WAITING_FOR_READY';
  end if;

  if v_round.ended_at is not null or v_round.winner_seat is not null then
    raise exception 'ROUND_ALREADY_FINISHED';
  end if;

  select count(*)::int into v_player_attempt
  from public.cb_guesses
  where round_id = v_round.id and seat = v_player.seat;

  if v_room.max_attempts_per_player is not null and v_player_attempt >= v_room.max_attempts_per_player then
    raise exception 'MAX_ATTEMPTS_REACHED';
  end if;

  select count(*)::int into v_global_order
  from public.cb_guesses
  where round_id = v_round.id;

  v_now := clock_timestamp();
  v_elapsed_ms := greatest(0, floor(extract(epoch from (v_now - v_round.started_at)) * 1000)::bigint);
  v_eval := public.cb_evaluate_guess(v_round.secret_code, v_clean_guess);
  v_is_winner := coalesce((v_eval->>'is_exact_match')::boolean, false);

  insert into public.cb_guesses (
    round_id,
    room_id,
    round_number,
    seat,
    player_name,
    player_attempt_number,
    global_attempt_order,
    guess_code,
    digits,
    green_count,
    yellow_count,
    red_count,
    is_winner,
    submitted_at,
    elapsed_ms
  )
  values (
    v_round.id,
    v_room.id,
    v_round.round_number,
    v_player.seat,
    v_player.display_name,
    v_player_attempt + 1,
    v_global_order + 1,
    v_clean_guess,
    v_eval->'digits',
    (v_eval->>'green_count')::smallint,
    (v_eval->>'yellow_count')::smallint,
    (v_eval->>'red_count')::smallint,
    v_is_winner,
    v_now,
    v_elapsed_ms
  )
  returning id into v_guess_id;

  update public.cb_room_players
  set connected = true, last_seen_at = v_now
  where id = v_player.id;

  if v_is_winner then
    update public.cb_rounds
    set ended_at = v_now,
        winner_seat = v_player.seat,
        winning_guess_id = v_guess_id
    where id = v_round.id;

    update public.cb_room_players
    set wins = wins + 1
    where id = v_player.id;

    update public.cb_rooms
    set status = 'finished',
        version = version + 1,
        updated_at = v_now
    where id = v_room.id
    returning * into v_room;

    if v_player.profile_id is not null then
      perform public.coins_grant(
        v_player.profile_id,
        35,
        'win_reward',
        v_round.id,
        'پاداش پیروزی در رمزگشا (کشف کد ۴ رقمی)'
      );
    end if;

    select * into v_other
    from public.cb_room_players
    where room_id = v_room.id and seat <> v_player.seat;
    if found and v_other.profile_id is not null then
      perform public.coins_grant(
        v_other.profile_id,
        12,
        'win_reward',
        v_round.id,
        'پاداش مشارکت در مسابقه رمزگشا'
      );
    end if;
  else
    if v_room.max_attempts_per_player is not null and (v_player_attempt + 1) >= v_room.max_attempts_per_player then
      select count(*)::int into v_other_attempts
      from public.cb_guesses
      where round_id = v_round.id and seat <> v_player.seat;

      if v_other_attempts >= v_room.max_attempts_per_player then
        update public.cb_rounds set ended_at = v_now where id = v_round.id;
        update public.cb_rooms
        set status = 'finished', version = version + 1, updated_at = v_now
        where id = v_room.id
        returning * into v_room;
      else
        update public.cb_rooms
        set version = version + 1, updated_at = v_now
        where id = v_room.id
        returning * into v_room;
      end if;
    else
      update public.cb_rooms
      set version = version + 1, updated_at = v_now
      where id = v_room.id
      returning * into v_room;
    end if;
  end if;

  perform public.cb_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'seat', v_player.seat,
    'state', public.cb_project_state(v_room, v_player.seat)
  );
end;
$$;

-- 6. Rematch (Archives finished round summary & starts fresh lobby gate WITHOUT mutating old rows!)
create or replace function public.cb_rematch(
  p_room_code text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.cb_rooms;
  v_player public.cb_room_players;
  v_prev_round public.cb_rounds;
  v_winner_name text := null;
  v_total_guesses int := 0;
  v_duration_ms bigint := 0;
  v_archive_entry jsonb;
  v_next_round int;
begin
  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player
  from public.cb_room_players
  where room_id = v_room.id and player_token_hash = public.hash_token(btrim(coalesce(p_token, '')));
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if v_room.status <> 'finished' then
    raise exception 'REMATCH_NOT_ALLOWED';
  end if;

  select * into v_prev_round
  from public.cb_rounds
  where room_id = v_room.id and round_number = v_room.current_round;

  if v_prev_round.winner_seat is not null then
    select display_name into v_winner_name
    from public.cb_room_players
    where room_id = v_room.id and seat = v_prev_round.winner_seat;
  end if;

  select count(*)::int into v_total_guesses
  from public.cb_guesses
  where round_id = v_prev_round.id;

  if v_prev_round.started_at is not null and v_prev_round.ended_at is not null then
    v_duration_ms := greatest(
      0,
      floor(extract(epoch from (v_prev_round.ended_at - v_prev_round.started_at)) * 1000)::bigint
    );
  end if;

  v_archive_entry := jsonb_build_object(
    'round_number', v_prev_round.round_number,
    'secret_code', v_prev_round.secret_code,
    'winner_seat', v_prev_round.winner_seat,
    'winner_name', v_winner_name,
    'started_at', v_prev_round.started_at,
    'ended_at', v_prev_round.ended_at,
    'duration_ms', v_duration_ms,
    'total_guesses', v_total_guesses
  );

  v_next_round := v_room.current_round + 1;

  update public.cb_room_players
  set is_ready = false,
      last_seen_at = clock_timestamp()
  where room_id = v_room.id;

  insert into public.cb_rounds (room_id, round_number, secret_code, started_at)
  values (v_room.id, v_next_round, null, null);

  update public.cb_rooms
  set status = 'waiting',
      current_round = v_next_round,
      past_rounds = coalesce(past_rounds, '[]'::jsonb) || jsonb_build_array(v_archive_entry),
      version = version + 1,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '6 hours'
  where id = v_room.id
  returning * into v_room;

  perform public.cb_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'seat', v_player.seat,
    'state', public.cb_project_state(v_room, v_player.seat)
  );
end;
$$;

-- 7. Leave Room
create or replace function public.cb_leave_room(
  p_room_code text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.cb_rooms;
  v_player public.cb_room_players;
begin
  select * into v_room from public.cb_rooms where room_code = v_code for update;
  if not found then
    return jsonb_build_object('left', true);
  end if;

  select * into v_player
  from public.cb_room_players
  where room_id = v_room.id and player_token_hash = public.hash_token(btrim(coalesce(p_token, '')));
  if not found then
    return jsonb_build_object('left', true);
  end if;

  update public.cb_room_players
  set connected = false, is_ready = false, last_seen_at = clock_timestamp()
  where id = v_player.id;

  if v_room.status in ('waiting', 'active') then
    update public.cb_rooms
    set status = 'abandoned',
        version = version + 1,
        updated_at = clock_timestamp()
    where id = v_room.id;
    perform public.cb_broadcast_state(v_room.id);
  end if;

  return jsonb_build_object('left', true);
end;
$$;

grant execute on function public.cb_create_room(text, integer, text) to anon, authenticated;
grant execute on function public.cb_join_room(text, text, text) to anon, authenticated;
grant execute on function public.cb_set_ready(text, text, boolean) to anon, authenticated;
grant execute on function public.cb_get_room_state(text, text, boolean) to anon, authenticated;
grant execute on function public.cb_submit_guess(text, text, text) to anon, authenticated;
grant execute on function public.cb_rematch(text, text) to anon, authenticated;
grant execute on function public.cb_leave_room(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
