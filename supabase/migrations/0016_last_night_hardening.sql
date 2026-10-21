-- DOZ ONLINE / LAST NIGHT — 0016: Room lifecycle, interaction and combat hardening
-- The canvas simulation remains client-rendered; interaction rewards, ammunition,
-- room transitions and session lifecycle are validated by Postgres. Combat kills
-- and coin reports remain client-reported and are capped rather than cryptographically
-- verified. Client-supplied world_state is intentionally ignored.

alter table public.ln_rooms
  add column if not exists wave_started_at timestamptz;

alter table public.ln_room_players
  add column if not exists downed_at timestamptz,
  add column if not exists last_combat_sync_at timestamptz not null default 'epoch'::timestamptz,
  add column if not exists combat_coins_wave integer not null default 0,
  add column if not exists combat_kills_wave integer not null default 0,
  add column if not exists firearm_reload_ready_at timestamptz;

update public.ln_room_players
set downed_at = coalesce(downed_at, last_seen_at, now())
where downed and downed_at is null;

create table if not exists public.ln_room_interactions (
  room_id uuid not null references public.ln_rooms (id) on delete cascade,
  map_id text not null,
  interactable_id text not null,
  player_id uuid not null references public.ln_room_players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, map_id, interactable_id)
);

create table if not exists public.ln_combat_sync_requests (
  room_id uuid not null references public.ln_rooms (id) on delete cascade,
  player_id uuid not null references public.ln_room_players (id) on delete cascade,
  request_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, player_id, request_id)
);

-- Existing live rooms predate wave timestamps and server position validation.
update public.ln_rooms
set wave_started_at = coalesce(started_at, last_activity_at, now())
where status = 'active' and phase in ('combat', 'boss') and wave_started_at is null;
update public.ln_rooms set world_state = '{}'::jsonb where world_state <> '{}'::jsonb;
update public.ln_room_players
set last_combat_sync_at = coalesce(last_seen_at, now())
where last_combat_sync_at = 'epoch'::timestamptz;
update public.ln_room_players
set firearm_reload_ready_at = coalesce(last_seen_at, now())
where not loaded_firearm
  and equipped_weapon in ('flintlock_pistol', 'hunting_musket')
  and firearm_reload_ready_at is null;

alter table public.ln_room_interactions enable row level security;
alter table public.ln_combat_sync_requests enable row level security;
revoke all on public.ln_room_interactions from public, anon, authenticated;
revoke all on public.ln_combat_sync_requests from public, anon, authenticated;
create index if not exists ln_combat_sync_requests_created_at
  on public.ln_combat_sync_requests(created_at);

-- Preserve the original state projection and wrap it with durable interaction
-- IDs so both players can restore map objectives after reconnecting.
do $$
begin
  if to_regprocedure('public.ln_room_public_state_v1(public.ln_rooms)') is null then
    alter function public.ln_room_public_state(public.ln_rooms) rename to ln_room_public_state_v1;
  end if;
end;
$$;

create or replace function public.ln_room_public_state(p_room public.ln_rooms)
returns jsonb
language sql
stable
as $$
  with base as (
    select public.ln_room_public_state_v1(p_room) as state
  ),
  enriched_players as (
    select jsonb_set(
      base.state,
      '{players}',
      coalesce(
        (
          select jsonb_agg(
            player.value || jsonb_build_object('firearm_reload_ready_at', rp.firearm_reload_ready_at)
            order by rp.seat
          )
          from jsonb_array_elements(base.state -> 'players') as player(value)
          join public.ln_room_players rp
            on rp.room_id = p_room.id and rp.seat = (player.value ->> 'seat')::integer
        ),
        '[]'::jsonb
      ),
      true
    ) as state
    from base
  )
  select jsonb_set(
    enriched_players.state,
    '{interactions}',
    coalesce(
      (
        select jsonb_agg(i.interactable_id order by i.interactable_id)
        from public.ln_room_interactions i
        where i.room_id = p_room.id and i.map_id = p_room.map_id
      ),
      '[]'::jsonb
    ),
    true
  )
  from enriched_players;
$$;

-- Canonical server-side interactables; rewards, objective IDs, keys, and
-- proximity are never taken from the browser payload.
create or replace function public.ln_interactable_spec(p_map_id text, p_id text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'map_id', s.map_id,
    'id', s.interactable_id,
    'kind', s.kind,
    'objective_id', s.objective_id,
    'x', s.x,
    'y', s.y,
    'requires_key', s.requires_key,
    'reward_coins', s.reward_coins
  )
  from (values
    ('cursed_village','v_torch_1','torch','village_torches',500,310,false,30),
    ('cursed_village','v_torch_2','torch','village_torches',430,495,false,30),
    ('cursed_village','v_torch_3','torch','village_torches',830,495,false,30),
    ('cursed_village','v_chest_mill','chest','mill_chest',940,285,true,140),
    ('cursed_village','v_north_gate','gate','north_gate',640,80,false,80),
    ('cursed_forest','f_egg_1','egg','cursed_eggs',930,175,false,45),
    ('cursed_forest','f_egg_2','egg','cursed_eggs',1030,165,false,45),
    ('cursed_forest','f_egg_3','egg','cursed_eggs',985,240,false,45),
    ('cursed_forest','f_torch_1','torch','graveyard_torches',855,495,false,35),
    ('cursed_forest','f_torch_2','torch','graveyard_torches',1065,495,false,35),
    ('cursed_forest','f_torch_3','torch','graveyard_torches',530,350,false,35),
    ('cursed_forest','f_rune_1','rune','forest_shrine',540,150,false,60),
    ('cursed_forest','f_rune_2','rune','forest_shrine',750,150,false,60),
    ('cursed_forest','f_chest_swamp','chest','forest_shrine',290,260,true,160),
    ('snowy_forest','s_rune_1','rune','monastery_runes',165,280,false,55),
    ('snowy_forest','s_rune_2','rune','monastery_runes',345,280,false,55),
    ('snowy_forest','s_rune_3','rune','monastery_runes',640,365,false,55),
    ('snowy_forest','s_torch_1','torch','frozen_braziers',950,155,false,45),
    ('snowy_forest','s_torch_2','torch','frozen_braziers',1110,155,false,45),
    ('snowy_forest','s_torch_3','torch','frozen_braziers',355,555,false,45),
    ('snowy_forest','s_gate_arena','gate','sanctuary_gate',760,540,false,140),
    ('snowy_forest','s_chest_cave','chest','sanctuary_gate',1035,215,true,190),
    ('ancient_catacombs','c_relic_1','relic','cursed_relics',410,240,false,65),
    ('ancient_catacombs','c_relic_2','relic','cursed_relics',180,360,false,65),
    ('ancient_catacombs','c_relic_3','relic','cursed_relics',420,560,false,65),
    ('ancient_catacombs','c_rune_1','rune','catacomb_runes',895,535,false,60),
    ('ancient_catacombs','c_rune_2','rune','catacomb_runes',1030,535,false,60),
    ('ancient_catacombs','c_rune_3','rune','catacomb_runes',720,205,false,60),
    ('ancient_catacombs','c_door_1','gate','crypt_doors',650,95,false,80),
    ('ancient_catacombs','c_door_2','gate','crypt_doors',960,340,false,80),
    ('ancient_catacombs','c_chest_royal','chest','crypt_doors',1080,175,true,240)
  ) as s(map_id, interactable_id, kind, objective_id, x, y, requires_key, reward_coins)
  where s.map_id = p_map_id and s.interactable_id = p_id;
$$;

create or replace function public.ln_progress_objective(p_objectives jsonb, p_objective_id text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_new jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_id text;
  v_target integer;
  v_progress integer;
  v_reward integer := 0;
  v_found boolean := false;
begin
  if jsonb_typeof(coalesce(p_objectives, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_OBJECTIVES';
  end if;

  for v_elem in select value from jsonb_array_elements(coalesce(p_objectives, '[]'::jsonb)) loop
    v_id := v_elem ->> 'id';
    if v_id = p_objective_id then
      v_found := true;
      if not coalesce((v_elem ->> 'completed')::boolean, false) then
        v_target := greatest(1, coalesce((v_elem ->> 'target')::integer, 1));
        v_progress := least(v_target, greatest(0, coalesce((v_elem ->> 'progress')::integer, 0)) + 1);
        v_elem := jsonb_set(v_elem, '{progress}', to_jsonb(v_progress));
        v_elem := jsonb_set(v_elem, '{completed}', to_jsonb(v_progress >= v_target));
        if v_progress >= v_target then
          v_reward := least(10000, greatest(0, coalesce((v_elem ->> 'reward_coins')::integer, 100)));
        end if;
      end if;
    end if;
    v_new := v_new || jsonb_build_array(v_elem);
  end loop;

  if not v_found then
    raise exception 'OBJECTIVE_NOT_FOUND';
  end if;
  return jsonb_build_object('objectives', v_new, 'reward_coins', v_reward);
end;
$$;

create or replace function public.ln_valid_position(p_x numeric, p_y numeric)
returns boolean
language sql
immutable
as $$
  select p_x is not null and p_y is not null
     and p_x between 20 and 1260
     and p_y between 20 and 740;
$$;

create or replace function public.ln_weapon_reload_seconds(p_weapon text)
returns numeric
language sql
immutable
as $$
  select case p_weapon
    when 'flintlock_pistol' then 2.1::numeric
    when 'hunting_musket' then 2.9::numeric
    else 0::numeric
  end;
$$;

-- Shop remains available throughout a live campaign (waiting/prep, combat, and
-- between-wave intermissions), but never in a terminal or expired room.
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
  v_price integer;
  v_cur_count integer;
begin
  if coalesce(btrim(p_token), '') = '' then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.expires_at <= now() or v_room.status in ('closed', 'victory', 'defeat') then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then
    raise exception 'PLAYER_UNAUTHORIZED';
  end if;

  if p_category = 'weapon' then
    v_price := case p_item_id
      when 'rusty_sword' then 0
      when 'hunter_bow' then 120
      when 'spiked_club' then 170
      when 'battle_axe' then 250
      when 'flintlock_pistol' then 400
      when 'hunting_musket' then 600
      else null
    end;
    if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;

    if p_item_id = any(v_player.owned_weapons) then
      update public.ln_room_players
      set equipped_weapon = p_item_id,
          loaded_firearm = true,
          firearm_reload_ready_at = null,
          last_seen_at = now()
      where id = v_player.id;
      update public.ln_rooms
      set version = version + 1, last_activity_at = now()
      where id = v_room.id returning * into v_room;
    else
      if v_room.sheriff_coins < v_price then raise exception 'INSUFFICIENT_FUNDS'; end if;
      update public.ln_rooms
      set sheriff_coins = sheriff_coins - v_price,
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id returning * into v_room;

      update public.ln_room_players
      set owned_weapons = array_append(owned_weapons, p_item_id),
          equipped_weapon = p_item_id,
          arrows = least(120, arrows + case when p_item_id = 'hunter_bow' then 15 else 0 end),
          bullets = least(60, bullets + case when p_item_id in ('flintlock_pistol', 'hunting_musket') then 3 else 0 end),
          loaded_firearm = true,
          firearm_reload_ready_at = null,
          last_seen_at = now()
      where id = v_player.id;
    end if;

  elsif p_category = 'spellbook' then
    v_price := case p_item_id
      when 'book_of_fire' then 900
      when 'book_of_protection' then 1200
      when 'book_of_frost' then 800
      when 'book_of_spirits' then 1500
      when 'book_of_lightning' then 1300
      when 'book_of_shadows' then 1100
      else null
    end;
    if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
    if p_item_id = any(v_player.owned_spells) then raise exception 'ITEM_OWNED'; end if;
    if v_room.sheriff_coins < v_price then raise exception 'INSUFFICIENT_FUNDS'; end if;

    update public.ln_rooms
    set sheriff_coins = sheriff_coins - v_price,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;

    update public.ln_room_players
    set owned_spells = array_append(owned_spells, p_item_id),
        equipped_spells = case
          when coalesce(array_length(equipped_spells, 1), 0) < 2
            then array_append(equipped_spells, p_item_id)
          else equipped_spells
        end,
        last_seen_at = now()
    where id = v_player.id;

  elsif p_category = 'item' then
    v_price := case p_item_id
      when 'small_heal_potion' then 60
      when 'large_heal_potion' then 130
      when 'mana_potion' then 80
      when 'arrow_bundle' then 30
      when 'gunpowder_bullet' then 70
      when 'fire_oil' then 100
      when 'whetstone' then 150
      when 'protective_charm' then 180
      when 'thorn_trap' then 90
      when 'lantern' then 120
      when 'rusty_key' then 80
      else null
    end;
    if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
    if v_room.sheriff_coins < v_price then raise exception 'INSUFFICIENT_FUNDS'; end if;
    if p_item_id = 'lantern' and v_player.has_lantern then raise exception 'ITEM_OWNED'; end if;
    if p_item_id = 'whetstone' and v_player.whetstone_stacks >= 5 then raise exception 'ITEM_OWNED'; end if;
    if p_item_id = 'arrow_bundle' and v_player.arrows >= 120 then raise exception 'ITEM_OWNED'; end if;
    if p_item_id = 'gunpowder_bullet' and v_player.bullets >= 60 then raise exception 'ITEM_OWNED'; end if;
    if p_item_id = 'rusty_key' and v_player.rusty_keys >= 10 then raise exception 'ITEM_OWNED'; end if;

    if p_item_id not in ('arrow_bundle', 'gunpowder_bullet', 'whetstone', 'lantern', 'rusty_key') then
      v_cur_count := coalesce((v_player.inventory ->> p_item_id)::integer, 0);
      if v_cur_count >= 99 then raise exception 'ITEM_OWNED'; end if;
    end if;

    update public.ln_rooms
    set sheriff_coins = sheriff_coins - v_price,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;

    if p_item_id = 'arrow_bundle' then
      update public.ln_room_players set arrows = least(120, arrows + 10), last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'gunpowder_bullet' then
      update public.ln_room_players set bullets = least(60, bullets + 1), last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'whetstone' then
      update public.ln_room_players set whetstone_stacks = least(5, whetstone_stacks + 1), last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'lantern' then
      update public.ln_room_players set has_lantern = true, last_seen_at = now() where id = v_player.id;
    elsif p_item_id = 'rusty_key' then
      update public.ln_room_players set rusty_keys = least(10, rusty_keys + 1), last_seen_at = now() where id = v_player.id;
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

  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

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
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() or v_room.status in ('closed', 'victory', 'defeat') then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  if p_weapon is null and p_spells is null then raise exception 'INVALID_LOADOUT'; end if;

  if p_weapon is not null then
    if not (p_weapon = any(v_player.owned_weapons)) then raise exception 'ITEM_NOT_FOUND'; end if;
    update public.ln_room_players
    set equipped_weapon = p_weapon,
        loaded_firearm = true,
        firearm_reload_ready_at = null,
        last_seen_at = now()
    where id = v_player.id;
  end if;

  if p_spells is not null then
    if coalesce(array_ndims(p_spells), 1) <> 1
       or coalesce(array_lower(p_spells, 1), 1) <> 1 then
      raise exception 'INVALID_LOADOUT';
    end if;
    if coalesce(cardinality(p_spells), 0) > 2 then raise exception 'MAX_TWO_SPELLBOOKS'; end if;
    if array_position(p_spells, null) is not null then raise exception 'INVALID_LOADOUT'; end if;
    if cardinality(p_spells) = 2 and p_spells[1] = p_spells[2] then raise exception 'INVALID_LOADOUT'; end if;
    foreach v_spell in array p_spells loop
      if not (v_spell = any(v_player.owned_spells)) then raise exception 'ITEM_NOT_FOUND'; end if;
    end loop;
    update public.ln_room_players set equipped_spells = p_spells, last_seen_at = now() where id = v_player.id;
  end if;

  update public.ln_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;
  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

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
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() or v_room.status <> 'active' or v_room.phase not in ('combat', 'boss') then
    raise exception 'GAME_NOT_ACTIVE';
  end if;
  if p_target_x is null or p_target_y is null
     or p_target_x::text in ('NaN', 'Infinity', '-Infinity')
     or p_target_y::text in ('NaN', 'Infinity', '-Infinity')
     or p_target_x not between 0 and 1280 or p_target_y not between 0 and 760 then
    raise exception 'INVALID_TARGET';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  if v_player.downed then raise exception 'GAME_NOT_ACTIVE'; end if;
  if not (p_spell_id = any(v_player.equipped_spells)) then raise exception 'ITEM_NOT_FOUND'; end if;

  select mana_cost, cd_sec into v_mana_cost, v_cooldown_sec
  from (values
    ('book_of_fire', 30, 12),
    ('book_of_protection', 40, 45),
    ('book_of_frost', 25, 18),
    ('book_of_spirits', 45, 35),
    ('book_of_lightning', 35, 15),
    ('book_of_shadows', 30, 25)
  ) as spells(id, mana_cost, cd_sec)
  where spells.id = p_spell_id;
  if v_mana_cost is null then raise exception 'ITEM_NOT_FOUND'; end if;

  v_ready_at := coalesce((v_player.spell_cooldowns ->> p_spell_id)::bigint, 0);
  if v_ready_at > v_now_ms then raise exception 'SPELL_ON_COOLDOWN'; end if;
  if v_player.mana < v_mana_cost then raise exception 'INSUFFICIENT_MANA'; end if;

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
      last_combat_sync_at = now(),
      last_seen_at = now()
  where id = v_player.id;
  update public.ln_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'spell_cast', jsonb_build_object(
    'seat', v_player.seat, 'spell_id', p_spell_id,
    'target_x', p_target_x, 'target_y', p_target_y
  ));
  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

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
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() or v_room.status <> 'active' or v_room.phase not in ('combat', 'boss') then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  if v_player.downed then raise exception 'GAME_NOT_ACTIVE'; end if;

  v_count := coalesce((v_player.inventory ->> p_item_id)::integer, 0);
  if v_count <= 0 then raise exception 'ITEM_NOT_FOUND'; end if;
  v_cd_sec := case p_item_id
    when 'small_heal_potion' then 5
    when 'large_heal_potion' then 8
    when 'mana_potion' then 6
    when 'fire_oil' then 25
    when 'protective_charm' then 20
    when 'thorn_trap' then 8
    else null
  end;
  if v_cd_sec is null then raise exception 'ITEM_NOT_FOUND'; end if;

  v_ready_at := coalesce((v_player.item_cooldowns ->> p_item_id)::bigint, 0);
  if v_ready_at > v_now_ms then raise exception 'ITEM_ON_COOLDOWN'; end if;

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
      inventory = jsonb_set(coalesce(inventory, '{}'::jsonb), array[p_item_id], to_jsonb(v_count - 1)),
      item_cooldowns = jsonb_set(coalesce(item_cooldowns, '{}'::jsonb), array[p_item_id], to_jsonb(v_now_ms + v_cd_sec * 1000)),
      active_buffs = v_buffs,
      last_combat_sync_at = now(),
      last_seen_at = now()
  where id = v_player.id;
  update public.ln_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;

  insert into public.ln_events (room_id, event_type, payload)
  values (v_room.id, 'item_used', jsonb_build_object('seat', v_player.seat, 'item_id', p_item_id));
  perform public.ln_broadcast_state(v_room.id);
  return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
end;
$$;

-- Position updates share one server-side speed/bounds check across ordinary
-- combat syncs and interactions. The UI world size is 1280 x 760.
create or replace function public.ln_update_player_position(
  p_room_id uuid,
  p_player_id uuid,
  p_x numeric,
  p_y numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.ln_room_players;
  v_elapsed numeric;
  v_max_distance numeric;
begin
  if not public.ln_valid_position(p_x, p_y) then raise exception 'INVALID_POSITION'; end if;
  select * into v_player from public.ln_room_players
  where id = p_player_id and room_id = p_room_id
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  v_elapsed := least(5::numeric, greatest(0::numeric,
    extract(epoch from (now() - v_player.last_combat_sync_at))::numeric));
  v_max_distance := least(1200::numeric, 120::numeric + v_elapsed * 300::numeric);
  if sqrt(power(p_x - v_player.pos_x, 2) + power(p_y - v_player.pos_y, 2)) > v_max_distance then
    raise exception 'PLAYER_MOVED_TOO_FAST';
  end if;

  update public.ln_room_players
  set pos_x = p_x, pos_y = p_y, last_combat_sync_at = now(), last_seen_at = now()
  where id = p_player_id;
end;
$$;

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
  v_target public.ln_room_players;
  v_payload jsonb := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  v_request_id uuid;
  v_cached_response jsonb;
  v_response jsonb;
  v_interactable jsonb;
  v_objective_result jsonb;
  v_objective_id text;
  v_interactable_id text;
  v_new_objs jsonb;
  v_reward integer := 0;
  v_requested_coins integer := 0;
  v_requested_kills integer := 0;
  v_coins integer := 0;
  v_kills integer := 0;
  v_target_seat integer;
  v_expected_boss text;
  v_boss_id text;
  v_all_down boolean;
  v_player_count integer;
  v_elapsed numeric;
  v_submitted_hp integer;
  v_next_hp integer;
  v_submitted_mana integer;
  v_next_mana integer;
  v_submitted_arrows integer;
  v_next_arrows integer;
  v_submitted_bullets integer;
  v_next_bullets integer;
  v_next_downed boolean;
  v_next_downed_at timestamptz;
  v_next_loaded boolean;
  v_reload_ready_at timestamptz;
  v_coins_in_wave integer;
  v_kills_in_wave integer;
  v_now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  v_changed integer;
  v_distance numeric;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.ln_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player from public.ln_room_players
  where room_id = v_room.id and token_hash = public.hash_token(p_token)
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  -- Combat-sync retries use a client-generated UUID. Replaying a committed
  -- request returns the original response and never repeats resource rewards.
  if p_action = 'combat_sync' and v_payload ? 'request_id' then
    if coalesce(v_payload ->> 'request_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_PLAYER_STATE';
    end if;
    v_request_id := (v_payload ->> 'request_id')::uuid;
    select response into v_cached_response
    from public.ln_combat_sync_requests
    where room_id = v_room.id and player_id = v_player.id and request_id = v_request_id;
    if found then return v_cached_response; end if;
  end if;

  -- Idempotent retries after a successful transition do not repeat rewards.
  if p_action = 'wave_cleared' and v_room.status = 'victory' then
    return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
  end if;
  if p_action = 'start_wave' and v_room.status = 'active' and v_room.phase in ('combat', 'boss') then
    return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
  end if;
  if v_room.expires_at <= now() or v_room.status in ('closed', 'defeat', 'victory') then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  if p_action = 'start_wave' then
    if v_room.status not in ('waiting', 'active') or v_room.phase <> 'prep' then
      raise exception 'GAME_NOT_ACTIVE';
    end if;
    update public.ln_rooms
    set status = 'active',
        started_at = coalesce(started_at, now()),
        phase = case when wave in (4, 7, 10) then 'boss' else 'combat' end,
        wave_started_at = now(),
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;
    update public.ln_room_players
    set last_combat_sync_at = now(),
        combat_coins_wave = 0,
        combat_kills_wave = 0,
        last_seen_at = now()
    where room_id = v_room.id;
    insert into public.ln_events (room_id, event_type, payload)
    values (v_room.id, 'wave_started', jsonb_build_object('wave', v_room.wave, 'seat', v_player.seat));

  elsif p_action = 'combat_sync' then
    if v_room.status <> 'active' or v_room.phase not in ('combat', 'boss') then
      raise exception 'GAME_NOT_ACTIVE';
    end if;
    if now() - v_player.last_combat_sync_at < interval '150 milliseconds' then
      raise exception 'RATE_LIMITED';
    end if;

    v_elapsed := least(5::numeric, greatest(0::numeric,
      extract(epoch from (now() - v_player.last_combat_sync_at))::numeric));
    if v_payload ? 'pos_x' or v_payload ? 'pos_y' then
      if not (v_payload ? 'pos_x' and v_payload ? 'pos_y') then raise exception 'INVALID_POSITION'; end if;
      perform public.ln_update_player_position(
        v_room.id, v_player.id,
        (v_payload ->> 'pos_x')::numeric,
        (v_payload ->> 'pos_y')::numeric
      );
    end if;

    v_submitted_hp := v_player.hp;
    if v_payload ? 'hp' then
      if coalesce(v_payload ->> 'hp', '') !~ '^[0-9]{1,3}$' then raise exception 'INVALID_PLAYER_STATE'; end if;
      v_submitted_hp := least(v_player.max_hp, greatest(0, (v_payload ->> 'hp')::integer));
    end if;
    -- Client sync may report damage, never healing. Healing is granted only by
    -- validated consumables, revives, or a completed wave.
    v_next_hp := least(v_player.hp, v_submitted_hp);

    v_submitted_mana := v_player.mana;
    if v_payload ? 'mana' then
      if coalesce(v_payload ->> 'mana', '') !~ '^[0-9]{1,3}$' then raise exception 'INVALID_PLAYER_STATE'; end if;
      v_submitted_mana := least(v_player.max_mana, greatest(0, (v_payload ->> 'mana')::integer));
    end if;
    v_next_mana := least(v_player.max_mana,
      v_player.mana + floor(v_elapsed * 4)::integer,
      v_submitted_mana);

    v_submitted_arrows := v_player.arrows;
    if v_payload ? 'arrows' then
      if coalesce(v_payload ->> 'arrows', '') !~ '^[0-9]{1,4}$' then raise exception 'INVALID_PLAYER_STATE'; end if;
      v_submitted_arrows := (v_payload ->> 'arrows')::integer;
    end if;
    v_next_arrows := least(v_player.arrows, v_submitted_arrows, 120);

    v_submitted_bullets := v_player.bullets;
    if v_payload ? 'bullets' then
      if coalesce(v_payload ->> 'bullets', '') !~ '^[0-9]{1,4}$' then raise exception 'INVALID_PLAYER_STATE'; end if;
      v_submitted_bullets := (v_payload ->> 'bullets')::integer;
    end if;
    v_next_bullets := least(v_player.bullets, v_submitted_bullets, 60);

    v_next_loaded := v_player.loaded_firearm;
    v_reload_ready_at := v_player.firearm_reload_ready_at;
    if v_payload ? 'loaded_firearm' then
      if v_payload ->> 'loaded_firearm' not in ('true', 'false') then raise exception 'INVALID_PLAYER_STATE'; end if;
      if (v_payload ->> 'loaded_firearm')::boolean then
        if not v_player.loaded_firearm then
          if v_player.firearm_reload_ready_at is null or v_player.firearm_reload_ready_at > now() then
            raise exception 'RELOAD_NOT_READY';
          end if;
          v_next_loaded := true;
          v_reload_ready_at := null;
        end if;
      elsif v_next_bullets < v_player.bullets then
        if v_player.equipped_weapon not in ('flintlock_pistol', 'hunting_musket')
           or v_player.bullets - v_next_bullets <> 1 then
          raise exception 'INVALID_AMMO';
        end if;
        if not v_player.loaded_firearm
           and v_player.firearm_reload_ready_at is not null
           and v_player.firearm_reload_ready_at > now() then
          raise exception 'RELOAD_NOT_READY';
        end if;
        v_next_loaded := false;
        -- The small grace compensates for the client timer starting before the
        -- network round-trip, while keeping reload timing server-bounded.
        v_reload_ready_at := now() + make_interval(secs => greatest(
          0::numeric,
          public.ln_weapon_reload_seconds(v_player.equipped_weapon) - 0.15::numeric
        )::double precision);
      elsif v_player.loaded_firearm then
        raise exception 'INVALID_AMMO';
      end if;
    elsif v_next_bullets < v_player.bullets then
      raise exception 'INVALID_AMMO';
    end if;

    v_next_downed := v_player.downed;
    v_next_downed_at := v_player.downed_at;
    if v_next_hp <= 0 then
      v_next_downed := true;
      v_next_downed_at := coalesce(v_player.downed_at, now());
    elsif v_player.downed and v_payload ->> 'downed' = 'false' then
      select count(*) into v_player_count from public.ln_room_players where room_id = v_room.id;
      if v_player_count = 1 and v_player.downed_at is not null
         and v_player.downed_at <= now() - interval '3.5 seconds' then
        -- The local Squire revive is permitted only in a genuinely solo room,
        -- after the server-side downed timer has elapsed.
        v_next_downed := false;
        v_next_downed_at := null;
        v_next_hp := greatest(v_next_hp, round(v_player.max_hp * 0.55)::integer);
      end if;
    elsif not v_player.downed and v_payload ->> 'downed' = 'true' and v_next_hp = 0 then
      v_next_downed := true;
      v_next_downed_at := coalesce(v_player.downed_at, now());
    end if;

    -- A per-wave budget prevents a client from resetting its coin/kill cap by
    -- waiting for a rolling time window; the counters reset only on start_wave.
    v_coins_in_wave := v_player.combat_coins_wave;
    v_kills_in_wave := v_player.combat_kills_wave;
    if v_payload ? 'coins_delta' then
      if coalesce(v_payload ->> 'coins_delta', '') !~ '^[0-9]{1,6}$' then raise exception 'INVALID_REWARD'; end if;
      v_requested_coins := greatest(0, (v_payload ->> 'coins_delta')::integer);
    end if;
    if v_payload ? 'kills_delta' then
      if coalesce(v_payload ->> 'kills_delta', '') !~ '^[0-9]{1,4}$' then raise exception 'INVALID_REWARD'; end if;
      v_requested_kills := greatest(0, (v_payload ->> 'kills_delta')::integer);
    end if;
    -- These client-side combat events are not cryptographic proof. Cap rewards
    -- per wave (not per minute) so requests cannot mint unbounded coins/kills.
    v_coins := least(100, v_requested_coins, greatest(0, 600 - v_coins_in_wave));
    v_kills := least(10, v_requested_kills, greatest(0, 45 - v_kills_in_wave));

    update public.ln_room_players
    set hp = v_next_hp,
        mana = v_next_mana,
        arrows = v_next_arrows,
        bullets = v_next_bullets,
        loaded_firearm = v_next_loaded,
        firearm_reload_ready_at = v_reload_ready_at,
        downed = v_next_downed,
        downed_at = v_next_downed_at,
        pos_x = case when v_payload ? 'pos_x' then (v_payload ->> 'pos_x')::numeric else pos_x end,
        pos_y = case when v_payload ? 'pos_y' then (v_payload ->> 'pos_y')::numeric else pos_y end,
        kills = kills + v_kills,
        combat_coins_wave = v_coins_in_wave + v_coins,
        combat_kills_wave = v_kills_in_wave + v_kills,
        last_combat_sync_at = now(),
        last_seen_at = now()
    where id = v_player.id;

    update public.ln_rooms
    set sheriff_coins = sheriff_coins + v_coins,
        total_coins_earned = total_coins_earned + v_coins,
        total_kills = total_kills + v_kills,
        -- Never accept the browser's arbitrary world_state or boss damage.
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;

    select count(*), coalesce(bool_and(rp.downed), false)
    into v_player_count, v_all_down
    from public.ln_room_players rp where rp.room_id = v_room.id;
    if v_all_down and v_player_count >= 2 then
      update public.ln_rooms
      set status = 'defeat', phase = 'cleared', finished_at = now(),
          version = version + 1, last_activity_at = now()
      where id = v_room.id returning * into v_room;
    end if;

  elsif p_action = 'complete_objective' or p_action = 'open_chest' then
    if v_room.status <> 'active' or v_room.phase not in ('combat', 'boss') then
      raise exception 'GAME_NOT_ACTIVE';
    end if;
    if v_player.downed then raise exception 'GAME_NOT_ACTIVE'; end if;

    v_interactable_id := coalesce(v_payload ->> 'interactable_id', v_payload ->> 'chest_id', '');
    v_interactable := public.ln_interactable_spec(v_room.map_id, v_interactable_id);
    if v_interactable is null then raise exception 'INTERACTABLE_NOT_FOUND'; end if;
    if exists (
      select 1 from public.ln_room_interactions i
      where i.room_id = v_room.id and i.map_id = v_room.map_id and i.interactable_id = v_interactable_id
    ) or (
      v_interactable ->> 'kind' = 'chest'
      and v_interactable_id = any(v_room.chests_opened)
    ) then
      return jsonb_build_object(
        'seat', v_player.seat,
        'interaction_recorded', false,
        'interaction_reward_coins', 0,
        'state', public.ln_room_public_state(v_room)
      );
    end if;

    if v_payload ? 'pos_x' or v_payload ? 'pos_y' then
      if not (v_payload ? 'pos_x' and v_payload ? 'pos_y') then raise exception 'INVALID_POSITION'; end if;
      perform public.ln_update_player_position(
        v_room.id, v_player.id,
        (v_payload ->> 'pos_x')::numeric,
        (v_payload ->> 'pos_y')::numeric
      );
      select * into v_player from public.ln_room_players where id = v_player.id;
    end if;

    v_distance := sqrt(
      power(v_player.pos_x - (v_interactable ->> 'x')::numeric, 2)
      + power(v_player.pos_y - (v_interactable ->> 'y')::numeric, 2)
    );
    if v_distance > 92 then raise exception 'INTERACTABLE_TOO_FAR'; end if;

    if p_action = 'open_chest' then
      if v_interactable ->> 'kind' <> 'chest' or not coalesce((v_interactable ->> 'requires_key')::boolean, false) then
        raise exception 'INVALID_INTERACTION';
      end if;
      if v_player.rusty_keys <= 0 then raise exception 'KEY_REQUIRED'; end if;
    elsif v_interactable ->> 'kind' = 'chest' then
      raise exception 'INVALID_INTERACTION';
    end if;

    insert into public.ln_room_interactions (room_id, map_id, interactable_id, player_id)
    values (v_room.id, v_room.map_id, v_interactable_id, v_player.id)
    on conflict (room_id, map_id, interactable_id) do nothing;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then
      return jsonb_build_object(
        'seat', v_player.seat,
        'interaction_recorded', false,
        'interaction_reward_coins', 0,
        'state', public.ln_room_public_state(v_room)
      );
    end if;

    v_objective_id := v_interactable ->> 'objective_id';
    v_objective_result := public.ln_progress_objective(v_room.objectives, v_objective_id);
    v_new_objs := v_objective_result -> 'objectives';
    v_reward := coalesce((v_objective_result ->> 'reward_coins')::integer, 0);
    if p_action = 'open_chest' then
      v_reward := v_reward + coalesce((v_interactable ->> 'reward_coins')::integer, 0);
      update public.ln_room_players
      set rusty_keys = rusty_keys - 1, last_seen_at = now()
      where id = v_player.id;
      update public.ln_rooms
      set chests_opened = array_append(chests_opened, v_interactable_id),
          objectives = v_new_objs,
          sheriff_coins = sheriff_coins + v_reward,
          total_coins_earned = total_coins_earned + v_reward,
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id returning * into v_room;
    else
      update public.ln_rooms
      set objectives = v_new_objs,
          sheriff_coins = sheriff_coins + v_reward,
          total_coins_earned = total_coins_earned + v_reward,
          version = version + 1,
          last_activity_at = now()
      where id = v_room.id returning * into v_room;
    end if;

    insert into public.ln_events (room_id, event_type, payload)
    values (v_room.id, p_action, jsonb_build_object(
      'seat', v_player.seat, 'interactable_id', v_interactable_id,
      'objective_id', v_objective_id, 'reward_coins', v_reward
    ));
    perform public.ln_broadcast_state(v_room.id);
    return jsonb_build_object(
      'seat', v_player.seat,
      'interaction_recorded', true,
      'interaction_reward_coins', v_reward,
      'state', public.ln_room_public_state(v_room)
    );

  elsif p_action = 'revive_ally' then
    if v_room.status <> 'active' or v_room.phase not in ('combat', 'boss') then raise exception 'GAME_NOT_ACTIVE'; end if;
    if v_player.downed then raise exception 'GAME_NOT_ACTIVE'; end if;
    if v_payload ? 'pos_x' or v_payload ? 'pos_y' then
      if not (v_payload ? 'pos_x' and v_payload ? 'pos_y') then raise exception 'INVALID_POSITION'; end if;
      perform public.ln_update_player_position(
        v_room.id, v_player.id,
        (v_payload ->> 'pos_x')::numeric,
        (v_payload ->> 'pos_y')::numeric
      );
      select * into v_player from public.ln_room_players where id = v_player.id;
    end if;
    if coalesce(v_payload ->> 'target_seat', '') !~ '^[1-3]$' then raise exception 'INVALID_TARGET'; end if;
    v_target_seat := (v_payload ->> 'target_seat')::integer;
    if v_target_seat = v_player.seat then raise exception 'INVALID_TARGET'; end if;

    select * into v_target from public.ln_room_players
    where room_id = v_room.id and seat = v_target_seat
    for update;
    if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
    if not v_target.downed then raise exception 'TARGET_NOT_DOWNED'; end if;
    v_distance := sqrt(power(v_player.pos_x - v_target.pos_x, 2) + power(v_player.pos_y - v_target.pos_y, 2));
    if v_distance > 110 then raise exception 'TARGET_TOO_FAR'; end if;

    update public.ln_room_players
    set downed = false,
        downed_at = null,
        hp = greatest(45, max_hp / 2),
        revive_progress = 0,
        last_seen_at = now()
    where id = v_target.id and downed;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then raise exception 'TARGET_NOT_DOWNED'; end if;

    update public.ln_room_players
    set revives_performed = revives_performed + 1, last_seen_at = now()
    where id = v_player.id;
    update public.ln_rooms
    set version = version + 1, last_activity_at = now()
    where id = v_room.id returning * into v_room;
    insert into public.ln_events (room_id, event_type, payload)
    values (v_room.id, 'ally_revived', jsonb_build_object('seat', v_player.seat, 'target_seat', v_target_seat));

  elsif p_action = 'wave_cleared' then
    if v_room.status <> 'active' or v_room.phase not in ('combat', 'boss') then
      -- An already-transitioned wave is an idempotent no-op, never a second reward.
      return jsonb_build_object('seat', v_player.seat, 'state', public.ln_room_public_state(v_room));
    end if;
    if v_room.wave_started_at is null
       or extract(epoch from (now() - v_room.wave_started_at)) < greatest(
         10::numeric,
         v_room.wave * 6::numeric,
         case when v_room.wave in (4, 7, 10) then 45::numeric else 0::numeric end
       ) then
      raise exception 'WAVE_NOT_COMPLETE';
    end if;

    v_expected_boss := case v_room.wave
      when 4 then 'forest_guardian'
      when 7 then 'ice_giant'
      when 10 then 'cursed_king'
      else null
    end;
    v_boss_id := nullif(btrim(coalesce(v_payload ->> 'boss_id', '')), '');
    if v_boss_id is distinct from v_expected_boss then raise exception 'INVALID_BOSS'; end if;

    v_reward := case
      when v_room.wave = 10 then 600
      when v_room.wave in (4, 7) then 350
      else 110 + (v_room.wave * 20)
    end;
    update public.ln_room_players
    set downed = false,
        downed_at = null,
        hp = least(max_hp, hp + 35),
        mana = least(max_mana, mana + 45),
        last_seen_at = now()
    where room_id = v_room.id;

    if v_room.wave = 10 then
      for v_target in
        select * from public.ln_room_players where room_id = v_room.id and profile_id is not null
      loop
        perform public.coins_grant(v_target.profile_id, 120, 'win_reward', v_room.id, 'پیروزی در کمپین آخرین شب (۱۰ موج)');
        update public.player_stats
        set games = games + 1,
            wins = wins + 1,
            win_streak = win_streak + 1,
            best_win_streak = greatest(best_win_streak, win_streak + 1),
            last_played_at = now()
        where player_id = v_target.profile_id;
      end loop;

      update public.ln_rooms
      set status = 'victory',
          phase = 'cleared',
          wave_started_at = null,
          sheriff_coins = sheriff_coins + v_reward,
          total_coins_earned = total_coins_earned + v_reward,
          bosses_defeated = case when v_boss_id is not null and not (v_boss_id = any(bosses_defeated))
            then array_append(bosses_defeated, v_boss_id) else bosses_defeated end,
          settlement = jsonb_build_object('settled', true, 'platform_bonus_sh', 120, 'campaign_cleared', true),
          finished_at = now(), version = version + 1, last_activity_at = now()
      where id = v_room.id returning * into v_room;
    else
      update public.ln_rooms
      set wave = wave + 1,
          map_id = public.ln_map_for_wave(wave + 1),
          phase = 'prep',
          wave_started_at = null,
          sheriff_coins = sheriff_coins + v_reward,
          total_coins_earned = total_coins_earned + v_reward,
          bosses_defeated = case when v_boss_id is not null and not (v_boss_id = any(bosses_defeated))
            then array_append(bosses_defeated, v_boss_id) else bosses_defeated end,
          objectives = case when public.ln_map_for_wave(wave + 1) <> v_room.map_id
            then public.ln_default_objectives(public.ln_map_for_wave(wave + 1)) else objectives end,
          version = version + 1, last_activity_at = now()
      where id = v_room.id returning * into v_room;
    end if;
    insert into public.ln_events (room_id, event_type, payload)
    values (v_room.id, 'wave_cleared', jsonb_build_object('wave', v_room.wave - case when v_room.status = 'victory' then 0 else 1 end,
      'boss_id', v_boss_id, 'reward_coins', v_reward));

  else
    raise exception 'INVALID_ACTION';
  end if;

  perform public.ln_broadcast_state(v_room.id);
  v_response := jsonb_build_object(
    'seat', v_player.seat,
    'combat_reward_coins', v_coins,
    'combat_reward_kills', v_kills,
    'state', public.ln_room_public_state(v_room)
  );
  if p_action = 'combat_sync' and v_request_id is not null then
    insert into public.ln_combat_sync_requests (room_id, player_id, request_id, response)
    values (v_room.id, v_player.id, v_request_id, v_response)
    on conflict (room_id, player_id, request_id) do nothing;
  end if;
  return v_response;
end;
$$;

-- Extend the existing scheduled cleanup with Last Night room retention. The
-- original function is kept intact for escrow, legacy rooms, queues and sessions.
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow record;
begin
  for v_escrow in
    select e.* from public.stake_escrows e
    left join public.rooms r on r.id = e.room_id
    where e.status = 'locked'
      and (r.id is null or r.expires_at < now() or r.status in ('closed', 'finished'))
      and e.created_at < now() - interval '10 minutes'
    for update of e
  loop
    update public.stake_escrows set status = 'refunded', settled_at = now() where id = v_escrow.id;
    perform public.coins_grant(v_escrow.player_id, v_escrow.amount, 'stake_refund',
      v_escrow.room_id, 'بازگشت ورودی (اتاق بسته شد)');
  end loop;

  delete from public.rooms where expires_at < now() - interval '1 hour';
  delete from public.ln_rooms where expires_at < now() - interval '1 hour';
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.admin_sessions where expires_at < now();
  delete from public.matchmaking_tickets
  where (status = 'searching' and enqueued_at < now() - interval '30 minutes')
     or (closed_at is not null and closed_at < now() - interval '2 days');
end;
$$;

-- Internal SECURITY DEFINER helpers created after the broad lockdown migrations
-- must not become callable as public PostgREST RPCs.
revoke execute on function public.cleanup_expired_data() from public, anon, authenticated;
revoke execute on function public.ln_room_public_state_v1(public.ln_rooms) from public, anon, authenticated;
revoke execute on function public.ln_map_for_wave(integer) from public, anon, authenticated;
revoke execute on function public.ln_default_objectives(text) from public, anon, authenticated;
revoke execute on function public.ln_room_public_state(public.ln_rooms) from public, anon, authenticated;
revoke execute on function public.ln_broadcast_state(uuid, text) from public, anon, authenticated;
revoke execute on function public.ln_interactable_spec(text, text) from public, anon, authenticated;
revoke execute on function public.ln_progress_objective(jsonb, text) from public, anon, authenticated;
revoke execute on function public.ln_valid_position(numeric, numeric) from public, anon, authenticated;
revoke execute on function public.ln_weapon_reload_seconds(text) from public, anon, authenticated;
revoke execute on function public.ln_update_player_position(uuid, uuid, numeric, numeric) from public, anon, authenticated;

grant execute on function public.ln_shop_buy(text, text, text, text) to anon, authenticated;
grant execute on function public.ln_equip_loadout(text, text, text, text[]) to anon, authenticated;
grant execute on function public.ln_cast_spell(text, text, text, numeric, numeric) to anon, authenticated;
grant execute on function public.ln_use_item(text, text, text) to anon, authenticated;
grant execute on function public.ln_sync_action(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
