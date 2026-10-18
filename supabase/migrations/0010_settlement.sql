-- SHARIFCOIN / DOZ ONLINE — 0010: match settlement (coins, Elo, escrow) +
-- make_move / leave_room / room_public_state / cleanup replacements.
-- Every competitive result is settled atomically on the server: ratings, coins,
-- stats, ledger, escrows, matches history and risk flags.

-- ===========================================================================
-- settle_match — THE single settlement path (called only from locked RPCs).
-- ===========================================================================
create or replace function public.settle_match(
  p_room public.rooms,
  p_winner_symbol text,
  p_is_draw boolean,
  p_forfeit boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_x public.room_players;
  v_o public.room_players;
  v_rx public.player_ratings;
  v_ro public.player_ratings;
  v_sx public.player_stats;
  v_so public.player_stats;
  v_ex double precision;
  v_eo double precision;
  v_kx integer;
  v_ko integer;
  v_adv integer := public.cfg_int('elo_x_advantage', 40);
  v_score_x double precision;
  v_rating_x_before integer;
  v_rating_o_before integer;
  v_rating_x_after integer;
  v_rating_o_after integer;
  v_coins_x bigint := 0;
  v_coins_o bigint := 0;
  v_match_id uuid;
  v_rake integer := 0;
  v_stake integer := coalesce(p_room.stake, 0);
  v_escrow_x public.stake_escrows;
  v_escrow_o public.stake_escrows;
  v_cap bigint;
  v_earned bigint;
  v_grant bigint;
  v_streak integer;
  v_payout bigint;
  v_today_losses bigint;
  v_pair_count bigint;
  v_alt_count bigint;
  v_flags jsonb := '[]'::jsonb;
begin
  -- only competitive modes settle
  if p_room.mode not in ('ranked', 'stakes') then
    return jsonb_build_object('settled', false);
  end if;

  select * into v_x from public.room_players where room_id = p_room.id and symbol = 'X';
  select * into v_o from public.room_players where room_id = p_room.id and symbol = 'O';
  if v_x.profile_id is null or v_o.profile_id is null then
    return jsonb_build_object('settled', false);
  end if;

  select * into v_rx from public.player_ratings where player_id = v_x.profile_id for update;
  select * into v_ro from public.player_ratings where player_id = v_o.profile_id for update;
  select * into v_sx from public.player_stats where player_id = v_x.profile_id for update;
  select * into v_so from public.player_stats where player_id = v_o.profile_id for update;

  v_rating_x_before := v_rx.rating;
  v_rating_o_before := v_ro.rating;

  ---------------------------------------------------------------------
  -- Elo (X advantage folded into expected score)
  ---------------------------------------------------------------------
  if p_is_draw then
    v_score_x := 0.5;
  elsif p_winner_symbol = 'X' then
    v_score_x := 1.0;
  else
    v_score_x := 0.0;
  end if;

  v_ex := public.elo_expected(v_rx.rating, v_ro.rating, v_adv);
  v_eo := public.elo_expected(v_ro.rating, v_rx.rating, -v_adv);
  v_kx := public.elo_k_for(v_sx.games, v_rx.placement_left);
  v_ko := public.elo_k_for(v_so.games, v_ro.placement_left);

  v_rating_x_after := greatest(100, round(v_rx.rating + v_kx * (v_score_x - v_ex)));
  v_rating_o_after := greatest(100, round(v_ro.rating + v_ko * ((1.0 - v_score_x) - v_eo)));

  update public.player_ratings
  set rating = v_rating_x_after,
      peak_rating = greatest(peak_rating, v_rating_x_after),
      placement_left = greatest(0, placement_left - 1)
  where player_id = v_x.profile_id;

  update public.player_ratings
  set rating = v_rating_o_after,
      peak_rating = greatest(peak_rating, v_rating_o_after),
      placement_left = greatest(0, placement_left - 1)
  where player_id = v_o.profile_id;

  ---------------------------------------------------------------------
  -- Stats
  ---------------------------------------------------------------------
  if p_is_draw then
    update public.player_stats set
      games = games + 1, draws = draws + 1, win_streak = 0,
      last_played_at = now()
    where player_id = v_x.profile_id;
    update public.player_stats set
      games = games + 1, draws = draws + 1, win_streak = 0,
      last_played_at = now()
    where player_id = v_o.profile_id;
  else
    if p_winner_symbol = 'X' then
      v_streak := v_sx.win_streak + 1;
      update public.player_stats set
        games = games + 1, wins = wins + 1,
        win_streak = v_streak, best_win_streak = greatest(best_win_streak, v_streak),
        forfeits_for = forfeits_for + (case when p_forfeit then 1 else 0 end),
        last_played_at = now()
      where player_id = v_x.profile_id;
      update public.player_stats set
        games = games + 1, losses = losses + 1, win_streak = 0,
        forfeits_against = forfeits_against + (case when p_forfeit then 1 else 0 end),
        last_played_at = now()
      where player_id = v_o.profile_id;
    else
      v_streak := v_so.win_streak + 1;
      update public.player_stats set
        games = games + 1, wins = wins + 1,
        win_streak = v_streak, best_win_streak = greatest(best_win_streak, v_streak),
        forfeits_for = forfeits_for + (case when p_forfeit then 1 else 0 end),
        last_played_at = now()
      where player_id = v_o.profile_id;
      update public.player_stats set
        games = games + 1, losses = losses + 1, win_streak = 0,
        forfeits_against = forfeits_against + (case when p_forfeit then 1 else 0 end),
        last_played_at = now()
      where player_id = v_x.profile_id;
    end if;
  end if;

  if p_room.mode = 'stakes' then
    update public.player_stats set stakes_played = stakes_played + 1
    where player_id in (v_x.profile_id, v_o.profile_id);
    if not p_is_draw and p_winner_symbol = 'X' then
      update public.player_stats set stakes_won = stakes_won + 1 where player_id = v_x.profile_id;
    elsif not p_is_draw then
      update public.player_stats set stakes_won = stakes_won + 1 where player_id = v_o.profile_id;
    end if;
  end if;

  ---------------------------------------------------------------------
  -- Coins
  ---------------------------------------------------------------------
  if p_room.mode = 'ranked' then
    v_cap := public.cfg_int('daily_earning_cap', 300);

    -- X side
    if p_is_draw then
      v_grant := public.cfg_int('draw_reward', 10);
    elsif p_winner_symbol = 'X' then
      v_grant := public.cfg_int('win_reward', 25);
    else
      v_grant := public.cfg_int('loss_reward', 5);
    end if;
    -- clamp to daily cap
    v_earned := public.coins_earned_today(v_x.profile_id);
    v_grant := least(v_grant, greatest(0, v_cap - v_earned));
    if v_grant > 0 then
      perform public.coins_grant(v_x.profile_id, v_grant,
        case when p_is_draw then 'draw_reward'
             when p_winner_symbol = 'X' then 'win_reward' else 'loss_reward' end,
        p_room.id, null);
      v_coins_x := v_coins_x + v_grant;
    end if;

    -- O side
    if p_is_draw then
      v_grant := public.cfg_int('draw_reward', 10);
    elsif p_winner_symbol = 'O' then
      v_grant := public.cfg_int('win_reward', 25);
    else
      v_grant := public.cfg_int('loss_reward', 5);
    end if;
    v_earned := public.coins_earned_today(v_o.profile_id);
    v_grant := least(v_grant, greatest(0, v_cap - v_earned));
    if v_grant > 0 then
      perform public.coins_grant(v_o.profile_id, v_grant,
        case when p_is_draw then 'draw_reward'
             when p_winner_symbol = 'O' then 'win_reward' else 'loss_reward' end,
        p_room.id, null);
      v_coins_o := v_coins_o + v_grant;
    end if;

    -- first win of day + streak for the winner
    if not p_is_draw then
      declare
        v_winner uuid := case when p_winner_symbol = 'X' then v_x.profile_id else v_o.profile_id end;
        v_wstats public.player_stats;
        v_win_coins bigint := 0;
        v_first integer;
        v_streak_bonus integer;
      begin
        select * into v_wstats from public.player_stats where player_id = v_winner;
        if v_wstats.first_win_claimed_on is distinct from current_date then
          v_first := public.cfg_int('first_win_bonus', 25);
          v_earned := public.coins_earned_today(v_winner);
          v_first := least(v_first, greatest(0, v_cap - v_earned));
          if v_first > 0 then
            perform public.coins_grant(v_winner, v_first, 'first_win', p_room.id, null);
            v_win_coins := v_win_coins + v_first;
          end if;
          update public.player_stats set first_win_claimed_on = current_date where player_id = v_winner;
        end if;
        v_streak_bonus := least(
          public.cfg_int('streak_bonus', 5) * greatest(0, v_wstats.win_streak - 1),
          public.cfg_int('streak_bonus_cap', 15)
        );
        if v_streak_bonus > 0 then
          v_earned := public.coins_earned_today(v_winner);
          v_streak_bonus := least(v_streak_bonus, greatest(0, v_cap - v_earned));
          if v_streak_bonus > 0 then
            perform public.coins_grant(v_winner, v_streak_bonus, 'streak_bonus', p_room.id, null);
            v_win_coins := v_win_coins + v_streak_bonus;
          end if;
        end if;
        if p_winner_symbol = 'X' then v_coins_x := v_coins_x + v_win_coins;
        else v_coins_o := v_coins_o + v_win_coins; end if;
      end;
    end if;

  elsif p_room.mode = 'stakes' and v_stake > 0 then
    -- settle the two locked escrows
    select * into v_escrow_x from public.stake_escrows
    where room_id = p_room.id and player_id = v_x.profile_id and status = 'locked'
    order by created_at desc limit 1;
    select * into v_escrow_o from public.stake_escrows
    where room_id = p_room.id and player_id = v_o.profile_id and status = 'locked'
    order by created_at desc limit 1;

    if v_escrow_x.id is not null and v_escrow_o.id is not null then
      if p_is_draw then
        -- 5% draw-rake on each stake; 95% back
        v_rake := (2 * v_stake * public.cfg_int('draw_rake_percent', 5)) / 100;
        v_payout := (v_stake * (100 - public.cfg_int('draw_rake_percent', 5))) / 100;
        perform public.coins_grant(v_x.profile_id, v_payout, 'stake_refund', p_room.id, 'بازگشت ورودی (مساوی)');
        perform public.coins_grant(v_o.profile_id, v_payout, 'stake_refund', p_room.id, 'بازگشت ورودی (مساوی)');
        v_coins_x := v_payout - v_stake;
        v_coins_o := v_payout - v_stake;
        update public.stake_escrows set status = 'refunded', settled_at = now()
          where id in (v_escrow_x.id, v_escrow_o.id);
      else
        v_rake := least((2 * v_stake * public.cfg_int('rake_percent', 10)) / 100,
                        public.cfg_int('rake_cap', 20));
        v_payout := 2 * v_stake - v_rake;
        if p_winner_symbol = 'X' then
          perform public.coins_grant(v_x.profile_id, v_payout, 'stake_payout', p_room.id, 'برد در بازی شرطی');
          v_coins_x := v_payout - v_stake;
          v_coins_o := -v_stake;
          update public.stake_escrows set status = 'released', settled_at = now() where id = v_escrow_x.id;
          update public.stake_escrows set status = 'forfeited', settled_at = now() where id = v_escrow_o.id;
        else
          perform public.coins_grant(v_o.profile_id, v_payout, 'stake_payout', p_room.id, 'برد در بازی شرطی');
          v_coins_o := v_payout - v_stake;
          v_coins_x := -v_stake;
          update public.stake_escrows set status = 'released', settled_at = now() where id = v_escrow_o.id;
          update public.stake_escrows set status = 'forfeited', settled_at = now() where id = v_escrow_x.id;
        end if;
      end if;

      -- daily stake loss cap check → auto risk flag (net stake flow today)
      select greatest(0, -coalesce(sum(amount), 0)) into v_today_losses
      from public.wallet_ledger
      where player_id = v_x.profile_id
        and reason in ('stake_lock', 'stake_payout', 'stake_refund')
        and created_at >= date_trunc('day', now());
      if v_today_losses >= public.cfg_int('stake_daily_loss_cap', 300) then
        insert into public.risk_flags (kind, subject_id, related_id, evidence)
        values ('stake_loss_cap_hit', v_x.profile_id, v_o.profile_id,
                jsonb_build_object('net_loss_today', v_today_losses));
      end if;
      select greatest(0, -coalesce(sum(amount), 0)) into v_today_losses
      from public.wallet_ledger
      where player_id = v_o.profile_id
        and reason in ('stake_lock', 'stake_payout', 'stake_refund')
        and created_at >= date_trunc('day', now());
      if v_today_losses >= public.cfg_int('stake_daily_loss_cap', 300) then
        insert into public.risk_flags (kind, subject_id, related_id, evidence)
        values ('stake_loss_cap_hit', v_o.profile_id, v_x.profile_id,
                jsonb_build_object('net_loss_today', v_today_losses));
      end if;

      -- frequent pair flag (possible collusion / chip dumping)
      select count(*) into v_pair_count
      from public.matches
      where ((player_x = v_x.profile_id and player_o = v_o.profile_id)
          or (player_x = v_o.profile_id and player_o = v_x.profile_id))
        and mode = 'stakes'
        and finished_at > now() - interval '7 days';
      if v_pair_count >= public.cfg_int('stake_same_pair_week', 5) then
        insert into public.risk_flags (kind, subject_id, related_id, evidence)
        values ('frequent_pair', v_x.profile_id, v_o.profile_id,
                jsonb_build_object('games_7d', v_pair_count + 1));
      end if;

      -- alternating wins between the same pair (win-trading signature)
      select count(*) into v_alt_count
      from (
        select winner_symbol, lag(winner_symbol) over (order by finished_at) as prev
        from public.matches
        where ((player_x = v_x.profile_id and player_o = v_o.profile_id)
            or (player_x = v_o.profile_id and player_o = v_x.profile_id))
          and mode = 'stakes' and not is_draw
        order by finished_at desc
        limit 6
      ) t
      where t.prev is not null and t.winner_symbol <> t.prev;
      if v_alt_count >= 4 then
        insert into public.risk_flags (kind, subject_id, related_id, evidence)
        values ('alternating_wins', v_x.profile_id, v_o.profile_id,
                jsonb_build_object('alternations', v_alt_count));
      end if;
    end if;
  end if;

  ---------------------------------------------------------------------
  -- Match record + achievements + snapshot settlement on the room
  ---------------------------------------------------------------------
  insert into public.matches (
    room_id, room_code, game_number, mode, stake,
    player_x, player_o, winner_symbol, is_draw, forfeit, move_count,
    rating_x_before, rating_x_after, rating_o_before, rating_o_after,
    coins_x, coins_o, rake, started_at, finished_at
  ) values (
    p_room.id, p_room.room_code, p_room.game_number, p_room.mode, v_stake,
    v_x.profile_id, v_o.profile_id,
    case when p_is_draw then null else p_winner_symbol end,
    p_is_draw, p_forfeit, p_room.move_count,
    v_rating_x_before, v_rating_x_after, v_rating_o_before, v_rating_o_after,
    v_coins_x, v_coins_o, v_rake,
    p_room.started_at, now()
  ) returning id into v_match_id;

  perform public.check_achievements(v_x.profile_id);
  perform public.check_achievements(v_o.profile_id);

  return jsonb_build_object(
    'settled', true,
    'match_id', v_match_id,
    'rating_x', jsonb_build_object('before', v_rating_x_before, 'after', v_rating_x_after),
    'rating_o', jsonb_build_object('before', v_rating_o_before, 'after', v_rating_o_after),
    'coins_x', v_coins_x,
    'coins_o', v_coins_o,
    'rake', v_rake
  );
end;
$$;

-- ===========================================================================
-- room_public_state — extended with mode/stake/settlement (safe projection).
-- ===========================================================================
create or replace function public.room_public_state(p_room public.rooms)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'room_code', p_room.room_code,
    'status', case
      when p_room.status <> 'closed' and p_room.expires_at < now() then 'expired'
      else p_room.status
    end,
    'mode', p_room.mode,
    'stake', p_room.stake,
    'board', p_room.board,
    'current_turn', p_room.current_turn,
    'winner', p_room.winner,
    'is_draw', p_room.is_draw,
    'winning_cells', to_jsonb(p_room.winning_cells),
    'move_count', p_room.move_count,
    'game_number', p_room.game_number,
    'rematch_requested_by', p_room.rematch_requested_by,
    'version', p_room.version,
    'settlement', p_room.settlement,
    'forfeit', p_room.forfeit,
    'players', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'symbol', rp.symbol,
            'name', rp.display_name,
            'connected', (rp.last_seen_at > now() - interval '45 seconds'),
            'profile_id', rp.profile_id
          ) order by rp.symbol desc
        ),
        '[]'::jsonb
      )
      from public.room_players rp
      where rp.room_id = p_room.id
    ),
    'created_at', to_jsonb(p_room.created_at),
    'started_at', to_jsonb(p_room.started_at),
    'finished_at', to_jsonb(p_room.finished_at),
    'expires_in_seconds', greatest(0, extract(epoch from (p_room.expires_at - now())))::integer,
    'server_now', to_jsonb(now())
  );
end;
$$;

-- ===========================================================================
-- make_move — extended: settles ranked/stakes games atomically at game end.
-- ===========================================================================
create or replace function public.make_move(
  p_room_code text,
  p_token text,
  p_cell integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_player public.room_players;
  v_symbol text;
  v_board text;
  v_eval jsonb;
  v_winner text;
  v_cells integer[];
  v_draw boolean;
  v_move_count integer;
  v_ttl integer;
  v_game_ended boolean;
  v_settlement jsonb;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 8 or p_cell <> floor(p_cell) then
    raise exception 'INVALID_CELL';
  end if;

  select ps.room_ttl_hours into v_ttl from public.platform_settings ps where ps.id = 1;

  if upper(btrim(coalesce(p_room_code, ''))) !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  select * into v_room from public.rooms where room_code = upper(btrim(p_room_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player
  from public.room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  v_symbol := v_player.symbol;

  perform 1 from public.rooms where id = v_room.id for update;
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED';
  end if;
  if v_room.expires_at < now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status <> 'active' then
    raise exception 'GAME_NOT_ACTIVE';
  end if;
  if v_room.current_turn <> v_symbol then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if substr(v_room.board, p_cell + 1, 1) <> '.' then
    raise exception 'CELL_TAKEN';
  end if;

  v_board := overlay(v_room.board placing v_symbol from p_cell + 1 for 1);

  v_eval := public.evaluate_board(v_board);
  v_winner := v_eval ->> 'winner';
  select array_agg(x::integer) into v_cells
  from jsonb_array_elements_text(coalesce(v_eval -> 'winning_cells', '[]'::jsonb)) x;
  v_draw := (v_eval ->> 'is_draw')::boolean;
  v_game_ended := (v_winner is not null) or v_draw;

  v_move_count := v_room.move_count + 1;

  update public.rooms
  set board = v_board,
      current_turn = case when v_game_ended then current_turn else public.other_symbol(v_symbol) end,
      winner = v_winner,
      is_draw = v_draw,
      winning_cells = coalesce(v_cells, '{}'::integer[]),
      move_count = v_move_count,
      status = case when v_game_ended then 'finished' else 'active' end,
      finished_at = case when v_game_ended then now() else finished_at end,
      version = version + 1,
      last_activity_at = now(),
      expires_at = now() + make_interval(hours => v_ttl)
  where id = v_room.id
  returning * into v_room;

  insert into public.game_moves (room_id, game_number, move_number, symbol, cell_index, board_after)
  values (v_room.id, v_room.game_number, v_move_count, v_symbol, p_cell, v_board);

  v_settlement := '{}'::jsonb;
  if v_game_ended then
    v_settlement := public.settle_match(v_room, v_winner, v_draw, false);
    update public.rooms set settlement = v_settlement where id = v_room.id;
    v_room.settlement := v_settlement;
  end if;

  insert into public.game_events (room_id, event_type, payload)
  values (
    v_room.id,
    case when v_game_ended then 'game_finished' else 'move_made' end,
    jsonb_build_object('symbol', v_symbol, 'cell', p_cell, 'move', v_move_count)
  );

  perform public.broadcast_room_state(v_room.id);

  return jsonb_build_object('role', v_symbol, 'state', public.room_public_state(v_room));
end;
$$;

-- ===========================================================================
-- leave_room — extended: forfeit rules for competitive modes.
-- ===========================================================================
create or replace function public.leave_room(p_room_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_symbol text;
  v_winner text;
  v_settlement jsonb;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  select * into v_room from public.rooms where room_code = upper(btrim(coalesce(p_room_code, '')));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select rp.symbol into v_symbol
  from public.room_players rp
  where rp.room_id = v_room.id and rp.token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  perform 1 from public.rooms where id = v_room.id for update;
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'waiting' and v_symbol = 'X' then
    update public.rooms
    set status = 'closed', version = version + 1, last_activity_at = now()
    where id = v_room.id;
    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'room_closed', jsonb_build_object('by_symbol', v_symbol));
    perform public.broadcast_room_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'room_closed');
  end if;

  if v_room.status = 'waiting' and v_symbol = 'O' then
    delete from public.room_players where room_id = v_room.id and symbol = 'O';
    update public.rooms set version = version + 1, last_activity_at = now() where id = v_room.id;
    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'player_left', jsonb_build_object('symbol', v_symbol));
    perform public.broadcast_room_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'seat_freed');
  end if;

  -- competitive live game: leaving = forfeit
  if v_room.status = 'active' and v_room.mode in ('ranked', 'stakes') then
    v_winner := public.other_symbol(v_symbol);
    v_settlement := public.settle_match(v_room, v_winner, false, true);
    update public.rooms
    set status = 'finished',
        winner = v_winner,
        is_draw = false,
        forfeit = true,
        finished_at = now(),
        settlement = v_settlement,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;
    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'forfeit', jsonb_build_object('by_symbol', v_symbol, 'winner', v_winner));
    perform public.broadcast_room_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'forfeit');
  end if;

  insert into public.game_events (room_id, event_type, payload)
  values (v_room.id, 'player_left', jsonb_build_object('symbol', v_symbol));
  perform public.broadcast_room_state(v_room.id);
  return jsonb_build_object('ok', true, 'action', 'left');
end;
$$;

-- ===========================================================================
-- request_rematch — extended: stakes rooms re-lock both stakes per game.
-- ===========================================================================
create or replace function public.request_rematch(p_room_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_symbol text;
  v_ttl integer;
  v_player public.room_players;
  v_other public.room_players;
  v_balance bigint;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  select ps.room_ttl_hours into v_ttl from public.platform_settings ps where ps.id = 1;

  select * into v_room from public.rooms where room_code = upper(btrim(coalesce(p_room_code, '')));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player
  from public.room_players rp
  where rp.room_id = v_room.id and rp.token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;
  v_symbol := v_player.symbol;

  perform 1 from public.rooms where id = v_room.id for update;
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED';
  end if;
  if v_room.expires_at < now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status <> 'finished' then
    raise exception 'REMATCH_NOT_ALLOWED';
  end if;

  if v_room.rematch_requested_by is null then
    update public.rooms
    set rematch_requested_by = v_symbol, version = version + 1, last_activity_at = now()
    where id = v_room.id;

    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'rematch_requested', jsonb_build_object('symbol', v_symbol));

  elsif v_room.rematch_requested_by <> v_symbol then
    -- both players asked → start the next game
    if v_room.mode = 'stakes' and v_room.stake > 0 then
      -- re-lock stakes for the new game (both must afford it)
      select rp2.* into v_other from public.room_players rp2
      where rp2.room_id = v_room.id and rp2.symbol <> v_symbol limit 1;
      select balance into v_balance from public.wallets where player_id = v_player.profile_id;
      if v_player.profile_id is null or v_balance < v_room.stake then
        raise exception 'INSUFFICIENT_FUNDS';
      end if;
      select balance into v_balance from public.wallets where player_id = v_other.profile_id;
      if v_other.profile_id is null or v_balance < v_room.stake then
        raise exception 'INSUFFICIENT_FUNDS';
      end if;
      perform public.coins_grant(v_player.profile_id, -v_room.stake, 'stake_lock', v_room.id, 'قفل ورودی شرط (بازی مجدد)');
      perform public.coins_grant(v_other.profile_id, -v_room.stake, 'stake_lock', v_room.id, 'قفل ورودی شرط (بازی مجدد)');
      insert into public.stake_escrows (match_id, room_id, player_id, amount, status)
      values
        (null, v_room.id, v_player.profile_id, v_room.stake, 'locked'),
        (null, v_room.id, v_other.profile_id, v_room.stake, 'locked');
    end if;

    update public.rooms
    set board = '.........',
        winner = null,
        is_draw = false,
        winning_cells = '{}'::integer[],
        move_count = 0,
        game_number = game_number + 1,
        status = 'active',
        started_at = now(),
        finished_at = null,
        settlement = '{}'::jsonb,
        forfeit = false,
        current_turn = case when game_number % 2 = 1 then 'O' else 'X' end,
        rematch_requested_by = null,
        version = version + 1,
        last_activity_at = now(),
        expires_at = now() + make_interval(hours => v_ttl)
    where id = v_room.id;

    insert into public.game_events (room_id, event_type, payload)
    values (v_room.id, 'rematch_accepted', jsonb_build_object('game_number', v_room.game_number + 1));
  else
    return jsonb_build_object('role', v_symbol, 'state', public.room_public_state(v_room));
  end if;

  select * into v_room from public.rooms where id = v_room.id;
  perform public.broadcast_room_state(v_room.id);

  return jsonb_build_object('role', v_symbol, 'state', public.room_public_state(v_room));
end;
$$;

-- ===========================================================================
-- cleanup_expired_data — extended: stale tickets + orphan escrow refunds.
-- ===========================================================================
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow record;
begin
  -- refund locked escrows of rooms that are gone/finished long ago
  for v_escrow in
    select e.* from public.stake_escrows e
    left join public.rooms r on r.id = e.room_id
    where e.status = 'locked'
      and (r.id is null or r.expires_at < now() or r.status in ('closed', 'finished'))
      and e.created_at < now() - interval '10 minutes'
    for update
  loop
    update public.stake_escrows set status = 'refunded', settled_at = now() where id = v_escrow.id;
    perform public.coins_grant(v_escrow.player_id, v_escrow.amount, 'stake_refund',
                               v_escrow.room_id, 'بازگشت ورودی (اتاق بسته شد)');
  end loop;

  delete from public.rooms where expires_at < now() - interval '1 hour';
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.admin_sessions where expires_at < now();

  -- stale queue tickets (searching for > 30 min or closed long ago)
  delete from public.matchmaking_tickets
  where (status = 'searching' and enqueued_at < now() - interval '30 minutes')
     or (closed_at is not null and closed_at < now() - interval '2 days');
end;
$$;
