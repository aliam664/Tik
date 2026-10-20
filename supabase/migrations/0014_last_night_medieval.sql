-- DOZ ONLINE / LAST NIGHT: MEDIEVAL SURVIVAL — 0014: Authoritative 2D Co-op Survival Backend
-- Implements server-authoritative rooms, shared Sheriff Coin team wallet,
-- medieval weapons, ancient spellbooks (max 2 equipped, mana + cooldown validated),
-- shop consumables, 4 medieval maps, 10 waves, 3 bosses, revives, and platform economy integration.

-- ---------------------------------------------------------------------------
-- 1. Tables for Last Night — Medieval Survival
-- ---------------------------------------------------------------------------
create table if not exists public.ln_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'victory', 'defeat', 'closed')),
  mode text not null default 'coop'
    check (mode in ('coop', 'ranked', 'stakes')),
  stake integer not null default 0 check (stake >= 0),
  max_players integer not null default 2 check (max_players in (2, 3)),
  wave integer not null default 1 check (wave between 1 and 10),
  map_id text not null default 'cursed_village'
    check (map_id in ('cursed_village', 'cursed_forest', 'snowy_forest', 'ancient_catacombs')),
  phase text not null default 'prep'
    check (phase in ('prep', 'combat', 'boss', 'cleared', 'transition')),
  sheriff_coins integer not null default 180 check (sheriff_coins >= 0),
  total_coins_earned integer not null default 180 check (total_coins_earned >= 0),
  total_kills integer not null default 0 check (total_kills >= 0),
  bosses_defeated text[] not null default '{}',
  objectives jsonb not null default '[]'::jsonb,
  chests_opened text[] not null default '{}',
  world_state jsonb not null default '{}'::jsonb,
  settlement jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_ln_rooms_status_expires on public.ln_rooms (status, expires_at);
create index if not exists idx_ln_rooms_last_activity on public.ln_rooms (last_activity_at desc);

create table if not exists public.ln_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.ln_rooms (id) on delete cascade,
  seat integer not null check (seat in (1, 2, 3)),
  hero_class text not null default 'warden' check (hero_class in ('warden', 'ranger', 'runepriest')),
  display_name text not null check (char_length(display_name) between 2 and 24),
  token_hash text not null unique,
  profile_id uuid references public.player_profiles (id) on delete set null,
  hp integer not null default 120 check (hp between 0 and 250),
  max_hp integer not null default 120 check (max_hp between 50 and 250),
  mana integer not null default 100 check (mana between 0 and 200),
  max_mana integer not null default 100 check (max_mana between 50 and 200),
  downed boolean not null default false,
  revive_progress numeric(5,2) not null default 0,
  pos_x numeric(8,2) not null default 640,
  pos_y numeric(8,2) not null default 420,
  facing numeric(6,3) not null default 0,
  equipped_weapon text not null default 'rusty_sword'
    check (equipped_weapon in (
      'rusty_sword', 'hunter_bow', 'battle_axe',
      'spiked_club', 'flintlock_pistol', 'hunting_musket'
    )),
  owned_weapons text[] not null default array['rusty_sword'],
  equipped_spells text[] not null default '{}'
    check (coalesce(array_length(equipped_spells, 1), 0) <= 2),
  owned_spells text[] not null default '{}',
  arrows integer not null default 20 check (arrows >= 0),
  bullets integer not null default 4 check (bullets >= 0),
  loaded_firearm boolean not null default true,
  whetstone_stacks integer not null default 0 check (whetstone_stacks between 0 and 5),
  has_lantern boolean not null default false,
  rusty_keys integer not null default 1 check (rusty_keys >= 0),
  inventory jsonb not null default '{
    "small_heal_potion": 2,
    "large_heal_potion": 0,
    "mana_potion": 1,
    "fire_oil": 0,
    "protective_charm": 0,
    "thorn_trap": 1
  }'::jsonb,
  spell_cooldowns jsonb not null default '{}'::jsonb,
  item_cooldowns jsonb not null default '{}'::jsonb,
  active_buffs jsonb not null default '{}'::jsonb,
  kills integer not null default 0 check (kills >= 0),
  damage_dealt integer not null default 0 check (damage_dealt >= 0),
  revives_performed integer not null default 0 check (revives_performed >= 0),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, seat)
);

create index if not exists idx_ln_players_room on public.ln_room_players (room_id);

create table if not exists public.ln_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.ln_rooms (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ln_events_room on public.ln_events (room_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Map & Catalog Helpers (Authoritative Server Constants)
-- ---------------------------------------------------------------------------
create or replace function public.ln_map_for_wave(p_wave integer)
returns text
language sql
immutable
as $$
  select case
    when p_wave <= 2 then 'cursed_village'
    when p_wave <= 4 then 'cursed_forest'
    when p_wave <= 7 then 'snowy_forest'
    else 'ancient_catacombs'
  end;
$$;

create or replace function public.ln_default_objectives(p_map_id text)
returns jsonb
language sql
immutable
as $$
  select case p_map_id
    when 'cursed_village' then jsonb_build_array(
      jsonb_build_object('id', 'village_torches', 'title', 'روشن کردن مشعل‌های محافظ دهکده', 'titleEn', 'Light Village Ward Torches', 'kind', 'light_torches', 'progress', 0, 'target', 3, 'reward_coins', 90, 'completed', false),
      jsonb_build_object('id', 'mill_chest', 'title', 'گشودن صندوقچه قفل‌شده آسیاب متروکه', 'titleEn', 'Unlock Abandoned Mill Chest', 'kind', 'collect_keys', 'progress', 0, 'target', 1, 'reward_coins', 110, 'completed', false),
      jsonb_build_object('id', 'north_gate', 'title', 'باز کردن دروازه سنگی شمالی', 'titleEn', 'Open Northern Stone Gate', 'kind', 'open_gate', 'progress', 0, 'target', 1, 'reward_coins', 80, 'completed', false)
    )
    when 'cursed_forest' then jsonb_build_array(
      jsonb_build_object('id', 'cursed_eggs', 'title', 'شکستن تخم‌های نفرین‌شده در لانه هیولا', 'titleEn', 'Break Cursed Monster Eggs', 'kind', 'break_eggs', 'progress', 0, 'target', 3, 'reward_coins', 130, 'completed', false),
      jsonb_build_object('id', 'graveyard_torches', 'title', 'افروختن مشعل‌های گورستان باستانی', 'titleEn', 'Light Ancient Graveyard Torches', 'kind', 'light_torches', 'progress', 0, 'target', 3, 'reward_coins', 110, 'completed', false),
      jsonb_build_object('id', 'forest_shrine', 'title', 'پاکسازی محراب نگهبان جنگل', 'titleEn', 'Cleanse Forest Boss Shrine', 'kind', 'activate_runes', 'progress', 0, 'target', 2, 'reward_coins', 120, 'completed', false)
    )
    when 'snowy_forest' then jsonb_build_array(
      jsonb_build_object('id', 'monastery_runes', 'title', 'فعال‌سازی رون‌های باستانی صومعه ویران', 'titleEn', 'Activate Ruined Monastery Runes', 'kind', 'activate_runes', 'progress', 0, 'target', 3, 'reward_coins', 160, 'completed', false),
      jsonb_build_object('id', 'frozen_braziers', 'title', 'روشن کردن آتشدان‌های غار یخی', 'titleEn', 'Light Icy Cave Braziers', 'kind', 'light_torches', 'progress', 0, 'target', 3, 'reward_coins', 130, 'completed', false),
      jsonb_build_object('id', 'sanctuary_gate', 'title', 'گشودن دروازه سنگی میدان غول یخی', 'titleEn', 'Open Ice Arena Stone Gate', 'kind', 'open_gate', 'progress', 0, 'target', 1, 'reward_coins', 140, 'completed', false)
    )
    else jsonb_build_array(
      jsonb_build_object('id', 'cursed_relics', 'title', 'نابود کردن عتیقه‌های نفرین‌شده روی محراب‌ها', 'titleEn', 'Destroy Cursed Altar Relics', 'kind', 'destroy_relics', 'progress', 0, 'target', 3, 'reward_coins', 190, 'completed', false),
      jsonb_build_object('id', 'catacomb_runes', 'title', 'فعال‌سازی رون‌های تالار پادشاه نفرین‌شده', 'titleEn', 'Activate Royal Catacomb Runes', 'kind', 'activate_runes', 'progress', 0, 'target', 3, 'reward_coins', 170, 'completed', false),
      jsonb_build_object('id', 'crypt_doors', 'title', 'باز کردن درهای سنگی قفل‌شده دخمه', 'titleEn', 'Unlock Stone Crypt Doors', 'kind', 'open_gate', 'progress', 0, 'target', 2, 'reward_coins', 160, 'completed', false)
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Public State Projection & Realtime Broadcast
-- ---------------------------------------------------------------------------
create or replace function public.ln_room_public_state(p_room public.ln_rooms)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'room_code', p_room.room_code,
    'status', case
      when p_room.status not in ('closed', 'victory', 'defeat') and p_room.expires_at < now() then 'expired'
      else p_room.status
    end,
    'mode', p_room.mode,
    'stake', p_room.stake,
    'max_players', p_room.max_players,
    'wave', p_room.wave,
    'map_id', p_room.map_id,
    'phase', p_room.phase,
    'currency_name', 'Sheriff Coin',
    'sheriff_coins', p_room.sheriff_coins,
    'total_coins_earned', p_room.total_coins_earned,
    'total_kills', p_room.total_kills,
    'bosses_defeated', to_jsonb(p_room.bosses_defeated),
    'objectives', p_room.objectives,
    'chests_opened', to_jsonb(p_room.chests_opened),
    'world_state', p_room.world_state,
    'settlement', p_room.settlement,
    'version', p_room.version,
    'players', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'seat', rp.seat,
            'hero_class', rp.hero_class,
            'name', rp.display_name,
            'connected', (rp.last_seen_at > now() - interval '45 seconds'),
            'profile_id', rp.profile_id,
            'hp', rp.hp,
            'max_hp', rp.max_hp,
            'mana', rp.mana,
            'max_mana', rp.max_mana,
            'downed', rp.downed,
            'revive_progress', rp.revive_progress,
            'pos_x', rp.pos_x,
            'pos_y', rp.pos_y,
            'facing', rp.facing,
            'equipped_weapon', rp.equipped_weapon,
            'owned_weapons', to_jsonb(rp.owned_weapons),
            'equipped_spells', to_jsonb(rp.equipped_spells),
            'owned_spells', to_jsonb(rp.owned_spells),
            'arrows', rp.arrows,
            'bullets', rp.bullets,
            'loaded_firearm', rp.loaded_firearm,
            'whetstone_stacks', rp.whetstone_stacks,
            'has_lantern', rp.has_lantern,
            'rusty_keys', rp.rusty_keys,
            'inventory', rp.inventory,
            'spell_cooldowns', rp.spell_cooldowns,
            'item_cooldowns', rp.item_cooldowns,
            'active_buffs', rp.active_buffs,
            'kills', rp.kills,
            'damage_dealt', rp.damage_dealt,
            'revives_performed', rp.revives_performed
          ) order by rp.seat asc
        ),
        '[]'::jsonb
      )
      from public.ln_room_players rp
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

create or replace function public.ln_broadcast_state(
  p_room_id uuid,
  p_event text default 'ln_state'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
begin
  select * into v_room from public.ln_rooms where id = p_room_id;
  if not found then
    return;
  end if;
  begin
    perform realtime.send(
      public.ln_room_public_state(v_room),
      p_event,
      'ln_room:' || v_room.room_code,
      false
    );
  exception
    when others then
      null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Create / Join / State RPCs
-- ---------------------------------------------------------------------------
create or replace function public.ln_create_room(
  p_display_name text,
  p_max_players integer default 2,
  p_mode text default 'coop',
  p_stake integer default 0,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_ip inet;
  v_ttl integer;
  v_max_rooms integer;
  v_code text;
  v_room public.ln_rooms;
  v_token text;
  v_profile_id uuid := null;
  v_attempts integer := 0;
  v_created boolean := false;
  v_max_p integer := case when coalesce(p_max_players, 2) = 3 then 3 else 2 end;
  v_mode text := case when p_mode in ('coop', 'ranked', 'stakes') then p_mode else 'coop' end;
begin
  select ps.room_ttl_hours, ps.max_rooms_per_ip_per_hour
  into v_ttl, v_max_rooms
  from public.platform_settings ps where ps.id = 1;

  if (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('create_room', v_ip, v_max_rooms * 2, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  if coalesce(btrim(p_profile_token), '') <> '' then
    begin
      v_profile_id := public.assert_player_token(p_profile_token);
    exception when others then
      v_profile_id := null;
    end;
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  while v_attempts < 5 and not v_created loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_room_code();
    begin
      insert into public.ln_rooms (
        room_code, status, mode, stake, max_players, wave, map_id, phase,
        sheriff_coins, total_coins_earned, objectives, expires_at
      )
      values (
        v_code, 'waiting', v_mode, greatest(0, coalesce(p_stake, 0)), v_max_p,
        1, 'cursed_village', 'prep',
        180, 180, public.ln_default_objectives('cursed_village'),
        now() + make_interval(hours => v_ttl)
      )
      returning * into v_room;
      v_created := true;
    exception
      when unique_violation then
        v_created := false;
    end;
  end loop;

  if not v_created then
    raise exception 'CODE_GENERATION_FAILED';
  end if;

  insert into public.ln_room_players (
    room_id, seat, hero_class, display_name, token_hash, profile_id, pos_x, pos_y
  )
  values (
    v_room.id, 1, 'warden', v_name, public.hash_token(v_token), v_profile_id, 600, 460
  );

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'room_created', jsonb_build_object('seat', 1, 'name', v_name));

  select * into v_room from public.ln_rooms where id = v_room.id;
  perform public.ln_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 1,
    'state', public.ln_room_public_state(v_room)
  );
end;
$$;

create or replace function public.ln_join_room(
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
  v_name text;
  v_ip inet;
  v_ttl integer;
  v_max_joins integer;
  v_code text;
  v_room public.ln_rooms;
  v_token text;
  v_profile_id uuid := null;
  v_seat integer;
  v_hero text;
  v_count integer;
begin
  select ps.room_ttl_hours, ps.max_joins_per_ip_per_hour
  into v_ttl, v_max_joins
  from public.platform_settings ps where ps.id = 1;

  if (select ps.maintenance_mode from public.platform_settings ps where ps.id = 1) then
    raise exception 'MAINTENANCE';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_ip := public.get_client_ip();

  if not public.rate_limit_check('join_room', v_ip, v_max_joins * 2, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_code := upper(btrim(coalesce(p_room_code, '')));
  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.ln_rooms where room_code = v_code for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED';
  end if;
  if v_room.expires_at < now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status not in ('waiting', 'active') then
    raise exception 'ROOM_IN_GAME';
  end if;

  if coalesce(btrim(p_profile_token), '') <> '' then
    begin
      v_profile_id := public.assert_player_token(p_profile_token);
    exception when others then
      v_profile_id := null;
    end;
  end if;

  -- Find first open seat (2 or 3)
  select s into v_seat
  from generate_series(1, v_room.max_players) as s
  where not exists (
    select 1 from public.ln_room_players rp
    where rp.room_id = v_room.id and rp.seat = s
  )
  order by s asc
  limit 1;

  if v_seat is null then
    raise exception 'ROOM_FULL';
  end if;

  v_hero := case v_seat
    when 1 then 'warden'
    when 2 then 'ranger'
    else 'runepriest'
  end;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.ln_room_players (
    room_id, seat, hero_class, display_name, token_hash, profile_id,
    pos_x, pos_y
  )
  values (
    v_room.id, v_seat, v_hero, v_name, public.hash_token(v_token), v_profile_id,
    600 + (v_seat - 1) * 64, 460
  );

  select count(*) into v_count from public.ln_room_players where room_id = v_room.id;

  update public.ln_rooms
  set status = case when v_count >= 2 then 'active' else status end,
      started_at = coalesce(started_at, case when v_count >= 2 then now() else null end),
      last_activity_at = now(),
      expires_at = now() + make_interval(hours => v_ttl),
      version = version + 1
  where id = v_room.id
  returning * into v_room;

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'player_joined', jsonb_build_object('seat', v_seat, 'name', v_name));

  perform public.ln_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', v_seat,
    'state', public.ln_room_public_state(v_room)
  );
end;
$$;

create or replace function public.ln_get_room_state(
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
  v_room public.ln_rooms;
  v_seat integer := null;
begin
  if p_room_code is null or upper(btrim(p_room_code)) !~ '^[A-Z2-9]{6}$' then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_room from public.ln_rooms where room_code = upper(btrim(p_room_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if coalesce(p_token, '') <> '' then
    select rp.seat into v_seat
    from public.ln_room_players rp
    where rp.room_id = v_room.id and rp.token_hash = public.hash_token(p_token);

    if found then
      update public.ln_room_players
      set last_seen_at = now()
      where room_id = v_room.id and seat = v_seat;
    end if;
  end if;

  select * into v_room from public.ln_rooms where id = v_room.id;

  if v_seat is not null and p_notify then
    perform public.ln_broadcast_state(v_room.id);
  end if;

  return jsonb_build_object('seat', v_seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Authoritative Shop Purchase (Weapons, Magic Books, Shop Items)
--    All prices strictly in Sheriff Coins!
-- ---------------------------------------------------------------------------
create or replace function public.ln_shop_buy(
  p_room_code text,
  p_token text,
  p_category text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_player public.ln_room_players;
  v_price integer := null;
  v_cur_count integer;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  -- 1) WEAPONS (strictly limited to the 6 medieval survival weapons)
  if p_category = 'weapon' then
    v_price := case p_item_id
      when 'rusty_sword'      then 0
      when 'hunter_bow'       then 120
      when 'spiked_club'      then 170
      when 'battle_axe'       then 250
      when 'flintlock_pistol' then 400
      when 'hunting_musket'   then 600
      else null
    end;
    if v_price is null then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    if p_item_id = any (v_player.owned_weapons) then
      -- already owned: just equip it for free
      update public.ln_room_players
      set equipped_weapon = p_item_id, last_seen_at = now()
      where id = v_player.id;
    else
      if v_room.sheriff_coins < v_price then
        raise exception 'INSUFFICIENT_FUNDS';
      end if;
      update public.ln_rooms
      set sheriff_coins = sheriff_coins - v_price,
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id;

      update public.ln_room_players
      set owned_weapons = array_append(owned_weapons, p_item_id),
          equipped_weapon = p_item_id,
          arrows = arrows + (case when p_item_id = 'hunter_bow' then 15 else 0 end),
          bullets = bullets + (case when p_item_id in ('flintlock_pistol', 'hunting_musket') then 3 else 0 end),
          loaded_firearm = true,
          last_seen_at = now()
      where id = v_player.id;
    end if;

  -- 2) MAGIC BOOKS (6 ancient spellbooks from the village witch/wizard)
  elsif p_category = 'spellbook' then
    v_price := case p_item_id
      when 'book_of_fire'       then 900
      when 'book_of_protection' then 1200
      when 'book_of_frost'      then 800
      when 'book_of_spirits'    then 1500
      when 'book_of_lightning'  then 1300
      when 'book_of_shadows'    then 1100
      else null
    end;
    if v_price is null then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    if p_item_id = any (v_player.owned_spells) then
      raise exception 'ITEM_OWNED';
    end if;
    if v_room.sheriff_coins < v_price then
      raise exception 'INSUFFICIENT_FUNDS';
    end if;

    update public.ln_rooms
    set sheriff_coins = sheriff_coins - v_price,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;

    update public.ln_room_players
    set owned_spells = array_append(owned_spells, p_item_id),
        equipped_spells = case
          when coalesce(array_length(equipped_spells, 1), 0) < 2
            then array_append(equipped_spells, p_item_id)
          else equipped_spells
        end,
        last_seen_at = now()
    where id = v_player.id;

  -- 3) SHOP ITEMS (11 exact medieval survival items)
  elsif p_category = 'item' then
    v_price := case p_item_id
      when 'small_heal_potion' then 60
      when 'large_heal_potion' then 130
      when 'mana_potion'       then 80
      when 'arrow_bundle'      then 30
      when 'gunpowder_bullet'  then 70
      when 'fire_oil'          then 100
      when 'whetstone'         then 150
      when 'protective_charm'  then 180
      when 'thorn_trap'        then 90
      when 'lantern'           then 120
      when 'rusty_key'         then 80
      else null
    end;
    if v_price is null then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    if v_room.sheriff_coins < v_price then
      raise exception 'INSUFFICIENT_FUNDS';
    end if;

    if p_item_id = 'lantern' and v_player.has_lantern then
      raise exception 'ITEM_OWNED';
    end if;
    if p_item_id = 'whetstone' and v_player.whetstone_stacks >= 5 then
      raise exception 'ITEM_OWNED';
    end if;

    update public.ln_rooms
    set sheriff_coins = sheriff_coins - v_price,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;

    if p_item_id = 'arrow_bundle' then
      update public.ln_room_players set arrows = arrows + 10, last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'gunpowder_bullet' then
      update public.ln_room_players set bullets = bullets + 1, last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'whetstone' then
      update public.ln_room_players set whetstone_stacks = least(5, whetstone_stacks + 1), last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'lantern' then
      update public.ln_room_players set has_lantern = true, last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'rusty_key' then
      update public.ln_room_players set rusty_keys = rusty_keys + 1, last_seen_at = now() where id = v_player.id;
    else
      v_cur_count := coalesce((v_player.inventory ->> p_item_id)::integer, 0);
      update public.ln_room_players
      set inventory = jsonb_set(coalesce(inventory, '{}'::jsonb), array[p_item_id], to_jsonb(v_cur_count + 1)),
          last_seen_at = now()
      where id = v_player.id;
    end if;
  else
    raise exception 'ITEM_NOT_FOUND';
  end if;

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'shop_purchase', jsonb_build_object(
    'seat', v_player.seat, 'category', p_category, 'item_id', p_item_id, 'price', v_price
  ));

  select * into v_room from public.ln_rooms where id = v_room.id;
  perform public.ln_broadcast_state(v_room.id);

  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Equip Weapon & Spellbooks (Max 2 Spellbooks Enforced)
-- ---------------------------------------------------------------------------
create or replace function public.ln_equip_loadout(
  p_room_code text,
  p_token text,
  p_weapon text default null,
  p_spells text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_player public.ln_room_players;
  v_spell text;
begin
  select * into v_room from public.ln_rooms where room_code = upper(btrim(coalesce(p_room_code, ''))) for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token) for update;
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  if p_weapon is not null then
    if not (p_weapon = any (v_player.owned_weapons)) then
      raise exception 'ITEM_NOT_FOUND';
    end if;
    update public.ln_room_players set equipped_weapon = p_weapon where id = v_player.id;
  end if;

  if p_spells is not null then
    if coalesce(array_length(p_spells, 1), 0) > 2 then
      raise exception 'MAX_TWO_SPELLBOOKS';
    end if;
    if coalesce(array_length(p_spells, 1), 0) > 0 then
      foreach v_spell in array p_spells loop
        if not (v_spell = any (v_player.owned_spells)) then
          raise exception 'ITEM_NOT_FOUND';
        end if;
      end loop;
    end if;
    update public.ln_room_players set equipped_spells = p_spells where id = v_player.id;
  end if;

  update public.ln_rooms set version = version + 1, last_activity_at = now() where id = v_room.id returning * into v_room;
  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Server-Validated Spell Casting (Mana Cost + Cooldown Enforcement)
-- ---------------------------------------------------------------------------
create or replace function public.ln_cast_spell(
  p_room_code text,
  p_token text,
  p_spell_id text,
  p_target_x numeric default 0,
  p_target_y numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_player public.ln_room_players;
  v_mana_cost integer;
  v_cooldown_sec integer;
  v_ready_at bigint;
  v_now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  v_next_ready_ms bigint;
  v_buffs jsonb;
begin
  select * into v_room from public.ln_rooms where room_code = upper(btrim(coalesce(p_room_code, ''))) for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token) for update;
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  if v_player.downed then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  if not (p_spell_id = any (v_player.equipped_spells)) then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  select mana_cost, cd_sec into v_mana_cost, v_cooldown_sec
  from (
    values
      ('book_of_fire',       30, 12),
      ('book_of_protection', 40, 45),
      ('book_of_frost',      25, 18),
      ('book_of_spirits',    45, 35),
      ('book_of_lightning',  35, 15),
      ('book_of_shadows',    30, 25)
  ) as spells(id, mana_cost, cd_sec)
  where spells.id = p_spell_id;

  if v_mana_cost is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  v_ready_at := coalesce((v_player.spell_cooldowns ->> p_spell_id)::bigint, 0);
  if v_ready_at > v_now_ms then
    raise exception 'SPELL_ON_COOLDOWN';
  end if;

  if v_player.mana < v_mana_cost then
    raise exception 'INSUFFICIENT_MANA';
  end if;

  v_next_ready_ms := v_now_ms + (v_cooldown_sec * 1000);
  v_buffs := coalesce(v_player.active_buffs, '{}'::jsonb);

  if p_spell_id = 'book_of_protection' then
    v_buffs := jsonb_set(v_buffs, '{protection_until}', to_jsonb(v_now_ms + 20000));
  elsif p_spell_id = 'book_of_spirits' then
    v_buffs := jsonb_set(v_buffs, '{spirit_until}', to_jsonb(v_now_ms + 12000));
  elsif p_spell_id = 'book_of_shadows' then
    v_buffs := jsonb_set(v_buffs, '{shadows_until}', to_jsonb(v_now_ms + 4000));
  end if;

  update public.ln_room_players
  set mana = greatest(0, mana - v_mana_cost),
      spell_cooldowns = jsonb_set(coalesce(spell_cooldowns, '{}'::jsonb), array[p_spell_id], to_jsonb(v_next_ready_ms)),
      active_buffs = v_buffs,
      last_seen_at = now()
  where id = v_player.id;

  update public.ln_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id
  returning * into v_room;

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'spell_cast', jsonb_build_object(
    'seat', v_player.seat, 'spell_id', p_spell_id, 'target_x', p_target_x, 'target_y', p_target_y
  ));

  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Server-Validated Consumable Item Use
-- ---------------------------------------------------------------------------
create or replace function public.ln_use_item(
  p_room_code text,
  p_token text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_player public.ln_room_players;
  v_count integer;
  v_cd_sec integer;
  v_ready_at bigint;
  v_now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  v_buffs jsonb;
  v_hp integer;
  v_mana integer;
begin
  select * into v_room from public.ln_rooms where room_code = upper(btrim(coalesce(p_room_code, ''))) for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token) for update;
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  if v_player.downed then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  v_count := coalesce((v_player.inventory ->> p_item_id)::integer, 0);
  if v_count <= 0 then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  v_cd_sec := case p_item_id
    when 'small_heal_potion' then 5
    when 'large_heal_potion' then 8
    when 'mana_potion'       then 6
    when 'fire_oil'          then 25
    when 'protective_charm'  then 20
    when 'thorn_trap'        then 8
    else null
  end;

  if v_cd_sec is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  v_ready_at := coalesce((v_player.item_cooldowns ->> p_item_id)::bigint, 0);
  if v_ready_at > v_now_ms then
    raise exception 'ITEM_ON_COOLDOWN';
  end if;

  v_hp := v_player.hp;
  v_mana := v_player.mana;
  v_buffs := coalesce(v_player.active_buffs, '{}'::jsonb);

  if p_item_id = 'small_heal_potion' then
    v_hp := least(v_player.max_hp, v_player.hp + 30);
  elsif p_item_id = 'large_heal_potion' then
    v_hp := least(v_player.max_hp, v_player.hp + 70);
  elsif p_item_id = 'mana_potion' then
    v_mana := least(v_player.max_mana, v_player.mana + 40);
  elsif p_item_id = 'fire_oil' then
    v_buffs := jsonb_set(v_buffs, '{fire_oil_until}', to_jsonb(v_now_ms + 20000));
  elsif p_item_id = 'protective_charm' then
    v_buffs := jsonb_set(v_buffs, '{charm_until}', to_jsonb(v_now_ms + 10000));
  end if;

  update public.ln_room_players
  set hp = v_hp,
      mana = v_mana,
      inventory = jsonb_set(v_player.inventory, array[p_item_id], to_jsonb(v_count - 1)),
      item_cooldowns = jsonb_set(coalesce(v_player.item_cooldowns, '{}'::jsonb), array[p_item_id], to_jsonb(v_now_ms + v_cd_sec * 1000)),
      active_buffs = v_buffs,
      last_seen_at = now()
  where id = v_player.id;

  update public.ln_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id
  returning * into v_room;

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'item_used', jsonb_build_object('seat', v_player.seat, 'item_id', p_item_id));

  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Authoritative Campaign Progression, Kills, Objectives, Revives & Settlement
-- ---------------------------------------------------------------------------
create or replace function public.ln_sync_action(
  p_room_code text,
  p_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_player public.ln_room_players;
  v_kills integer;
  v_coins integer;
  v_dmg integer;
  v_obj_id text;
  v_new_objs jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_reward integer := 0;
  v_chest_id text;
  v_next_wave integer;
  v_next_map text;
  v_boss_id text;
  v_target_seat integer;
  v_p record;
  v_all_down boolean;
begin
  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  if p_action = 'start_wave' then
    update public.ln_rooms
    set status = 'active',
        started_at = coalesce(started_at, now()),
        phase = case when wave in (4, 7, 10) then 'boss' else 'combat' end,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;

  elsif p_action = 'combat_sync' then
    v_kills := least(40, greatest(0, coalesce((p_payload ->> 'kills_delta')::integer, 0)));
    v_coins := least(650, greatest(0, coalesce((p_payload ->> 'coins_delta')::integer, 0)));
    v_dmg   := least(15000, greatest(0, coalesce((p_payload ->> 'damage_delta')::integer, 0)));

    update public.ln_room_players
    set hp = least(max_hp, greatest(0, coalesce((p_payload ->> 'hp')::integer, hp))),
        mana = least(max_mana, greatest(0, coalesce((p_payload ->> 'mana')::integer, mana))),
        arrows = greatest(0, coalesce((p_payload ->> 'arrows')::integer, arrows)),
        bullets = greatest(0, coalesce((p_payload ->> 'bullets')::integer, bullets)),
        loaded_firearm = coalesce((p_payload ->> 'loaded_firearm')::boolean, loaded_firearm),
        pos_x = coalesce((p_payload ->> 'pos_x')::numeric, pos_x),
        pos_y = coalesce((p_payload ->> 'pos_y')::numeric, pos_y),
        downed = coalesce((p_payload ->> 'downed')::boolean, downed),
        kills = kills + v_kills,
        damage_dealt = damage_dealt + v_dmg,
        last_seen_at = now()
    where id = v_player.id;

    update public.ln_rooms
    set sheriff_coins = sheriff_coins + v_coins,
        total_coins_earned = total_coins_earned + v_coins,
        total_kills = total_kills + v_kills,
        world_state = coalesce(p_payload -> 'world_state', world_state),
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;

    -- Check if all joined players are downed -> defeat
    select bool_and(rp.downed) into v_all_down
    from public.ln_room_players rp
    where rp.room_id = v_room.id;

    if coalesce(v_all_down, false) and (select count(*) from public.ln_room_players where room_id = v_room.id) >= 2 then
      update public.ln_rooms
      set status = 'defeat', finished_at = now(), version = version + 1
      where id = v_room.id;
    end if;

  elsif p_action = 'complete_objective' then
    v_obj_id := coalesce(p_payload ->> 'objective_id', '');
    for v_elem in select * from jsonb_array_elements(v_room.objectives) loop
      if (v_elem ->> 'id') = v_obj_id and not coalesce((v_elem ->> 'completed')::boolean, false) then
        declare
          v_prog integer := least((v_elem ->> 'target')::integer, coalesce((v_elem ->> 'progress')::integer, 0) + 1);
          v_target integer := (v_elem ->> 'target')::integer;
          v_done boolean := (v_prog >= v_target);
        begin
          if v_done then
            v_reward := coalesce((v_elem ->> 'reward_coins')::integer, 100);
          end if;
          v_elem := jsonb_set(v_elem, '{progress}', to_jsonb(v_prog));
          v_elem := jsonb_set(v_elem, '{completed}', to_jsonb(v_done));
        end;
      end if;
      v_new_objs := v_new_objs || jsonb_build_array(v_elem);
    end loop;

    update public.ln_rooms
    set objectives = v_new_objs,
        sheriff_coins = sheriff_coins + v_reward,
        total_coins_earned = total_coins_earned + v_reward,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;

  elsif p_action = 'open_chest' then
    v_chest_id := coalesce(p_payload ->> 'chest_id', '');
    if v_chest_id = '' or (v_chest_id = any (v_room.chests_opened)) then
      select * into v_room from public.ln_rooms where id = v_room.id;
      return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
    end if;

    if coalesce((p_payload ->> 'requires_key')::boolean, true) then
      if v_player.rusty_keys <= 0 then
        raise exception 'KEY_REQUIRED';
      end if;
      update public.ln_room_players
      set rusty_keys = rusty_keys - 1, last_seen_at = now()
      where id = v_player.id;
    end if;

    v_reward := least(350, greatest(60, coalesce((p_payload ->> 'reward_coins')::integer, 140)));

    update public.ln_rooms
    set chests_opened = array_append(chests_opened, v_chest_id),
        sheriff_coins = sheriff_coins + v_reward,
        total_coins_earned = total_coins_earned + v_reward,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id;

  elsif p_action = 'revive_ally' then
    v_target_seat := coalesce((p_payload ->> 'target_seat')::integer, 0);
    update public.ln_room_players
    set downed = false,
        hp = greatest(45, max_hp / 2),
        revive_progress = 0
    where room_id = v_room.id and seat = v_target_seat;

    update public.ln_room_players
    set revives_performed = revives_performed + 1, last_seen_at = now()
    where id = v_player.id;

    update public.ln_rooms set version = version + 1, last_activity_at = now() where id = v_room.id;

  elsif p_action = 'wave_cleared' then
    v_boss_id := nullif(btrim(coalesce(p_payload ->> 'boss_id', '')), '');
    v_reward := case
      when v_room.wave = 10 then 600
      when v_room.wave in (4, 7) then 350
      else 110 + (v_room.wave * 20)
    end;

    -- Heal & restore partial mana between waves
    update public.ln_room_players
    set downed = false,
        hp = least(max_hp, hp + 35),
        mana = least(max_mana, mana + 45),
        last_seen_at = now()
    where room_id = v_room.id;

    if v_room.wave >= 10 then
      -- Campaign Victory! Settle persistent rewards for linked player profiles
      for v_p in
        select * from public.ln_room_players where room_id = v_room.id and profile_id is not null
      loop
        perform public.coins_grant(v_p.profile_id, 120, 'win_reward', v_room.id, 'پیروزی در کمپین آخرین شب (۱۰ موج)');
        update public.player_stats
        set games = games + 1, wins = wins + 1, win_streak = win_streak + 1,
            best_win_streak = greatest(best_win_streak, win_streak + 1),
            last_played_at = now()
        where player_id = v_p.profile_id;
      end loop;

      update public.ln_rooms
      set status = 'victory',
          phase = 'cleared',
          sheriff_coins = sheriff_coins + v_reward,
          total_coins_earned = total_coins_earned + v_reward,
          bosses_defeated = case
            when v_boss_id is not null and not (v_boss_id = any (bosses_defeated))
              then array_append(bosses_defeated, v_boss_id)
            else bosses_defeated
          end,
          settlement = jsonb_build_object('settled', true, 'platform_bonus_sh', 120, 'campaign_cleared', true),
          finished_at = now(),
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id;
    else
      v_next_wave := v_room.wave + 1;
      v_next_map := public.ln_map_for_wave(v_next_wave);

      update public.ln_rooms
      set wave = v_next_wave,
          map_id = v_next_map,
          phase = 'prep',
          sheriff_coins = sheriff_coins + v_reward,
          total_coins_earned = total_coins_earned + v_reward,
          bosses_defeated = case
            when v_boss_id is not null and not (v_boss_id = any (bosses_defeated))
              then array_append(bosses_defeated, v_boss_id)
            else bosses_defeated
          end,
          objectives = case
            when v_next_map <> v_room.map_id then public.ln_default_objectives(v_next_map)
            else objectives
          end,
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id;
    end if;
  end if;

  select * into v_room from public.ln_rooms where id = v_room.id;
  perform public.ln_broadcast_state(v_room.id);

  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

create or replace function public.ln_leave_room(
  p_room_code text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.ln_rooms;
  v_player public.ln_room_players;
begin
  select * into v_room from public.ln_rooms where room_code = upper(btrim(coalesce(p_room_code, ''))) for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  if v_room.status = 'waiting' and v_player.seat = 1 then
    update public.ln_rooms set status = 'closed', version = version + 1, last_activity_at = now() where id = v_room.id;
    perform public.ln_broadcast_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'room_closed');
  end if;

  if v_room.status = 'waiting' then
    delete from public.ln_room_players where id = v_player.id;
    update public.ln_rooms set version = version + 1, last_activity_at = now() where id = v_room.id;
    perform public.ln_broadcast_state(v_room.id);
    return jsonb_build_object('ok', true, 'action', 'seat_freed');
  end if;

  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('ok', true, 'action', 'left');
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS Lockdown & Grants
-- ---------------------------------------------------------------------------
alter table public.ln_rooms enable row level security;
alter table public.ln_room_players enable row level security;
alter table public.ln_events enable row level security;

revoke all on public.ln_rooms, public.ln_room_players, public.ln_events from anon, authenticated;

grant execute on function public.ln_create_room(text, integer, text, integer, text) to anon, authenticated;
grant execute on function public.ln_join_room(text, text, text) to anon, authenticated;
grant execute on function public.ln_get_room_state(text, text, boolean) to anon, authenticated;
grant execute on function public.ln_shop_buy(text, text, text, text) to anon, authenticated;
grant execute on function public.ln_equip_loadout(text, text, text, text[]) to anon, authenticated;
grant execute on function public.ln_cast_spell(text, text, text, numeric, numeric) to anon, authenticated;
grant execute on function public.ln_use_item(text, text, text) to anon, authenticated;
grant execute on function public.ln_sync_action(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.ln_leave_room(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
