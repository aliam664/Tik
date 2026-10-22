-- DOZ ONLINE — 0020: Sheriff Blast (crash) — virtual Sheriff Coin only.
-- Shared salon, 1% house edge, HMAC-SHA256 crash point (Kuliyev/Bustabit 52-bit).
-- No cash-out to real money. Seed revealed only after the round crashes.

create table public.crash_rounds (
  id uuid primary key default gen_random_uuid(),
  round_index bigint generated always as identity,
  seed text not null,
  seed_hash text not null,
  salt text not null,
  crash_point integer not null check (crash_point >= 100),
  phase text not null check (phase in ('betting', 'flying', 'crashed')),
  betting_started_at timestamptz not null default now(),
  betting_ends_at timestamptz not null,
  flying_started_at timestamptz,
  crash_at timestamptz,
  crashed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.crash_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.crash_rounds (id) on delete cascade,
  player_id uuid not null references public.player_profiles (id) on delete cascade,
  slot smallint not null check (slot in (0, 1)),
  amount bigint not null check (amount > 0),
  auto_at integer,
  cashed_at integer,
  payout bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (round_id, player_id, slot)
);

create table public.crash_table (
  id integer primary key default 1 check (id = 1),
  current_round_id uuid references public.crash_rounds (id)
);

insert into public.crash_table (id) values (1) on conflict do nothing;

alter table public.crash_rounds enable row level security;
alter table public.crash_bets enable row level security;
alter table public.crash_table enable row level security;

revoke all on public.crash_rounds, public.crash_bets, public.crash_table from anon, authenticated;

create or replace function public.crash_point_from_seed(p_seed text, p_salt text)
returns integer
language plpgsql
immutable
as $$
declare
  v_hmac text;
  v_r numeric;
  v_two numeric := 4503599627370496; -- 2^52
  v_raw numeric;
begin
  v_hmac := encode(
    extensions.hmac(convert_to(p_salt, 'UTF8'), decode(p_seed, 'hex'), 'sha256'),
    'hex'
  );
  v_r := (('x' || lpad(substr(v_hmac, 1, 13), 16, '0'))::bit(64)::bigint)::numeric;
  v_raw := (9900::numeric * v_two) / (100::numeric * (v_two - v_r));
  return greatest(100, least(100000000, floor(v_raw)))::integer;
end;
$$;

create or replace function public.crash_elapsed_ms(p_point integer)
returns integer
language sql
immutable
as $$
  select greatest(0, ceil(1000 * ln(greatest(p_point, 100) / 100.0) / 0.06))::integer;
$$;

create or replace function public.crash_open_round()
returns public.crash_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seed text;
  v_salt text;
  v_point integer;
  v_row public.crash_rounds;
  v_idx bigint;
begin
  v_seed := encode(extensions.gen_random_bytes(32), 'hex');
  select coalesce(max(round_index), 0) + 1 into v_idx from public.crash_rounds;
  v_salt := 'sheriff-blast:' || v_idx::text;
  v_point := public.crash_point_from_seed(v_seed, v_salt);
  insert into public.crash_rounds (
    seed, seed_hash, salt, crash_point, phase, betting_started_at, betting_ends_at
  ) values (
    v_seed,
    encode(extensions.digest(decode(v_seed, 'hex'), 'sha256'), 'hex'),
    v_salt,
    v_point,
    'betting',
    now(),
    now() + interval '5 seconds'
  ) returning * into v_row;
  update public.crash_table set current_round_id = v_row.id where id = 1;
  return v_row;
end;
$$;

create or replace function public.crash_advance_locked()
returns public.crash_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.crash_rounds;
  v_id uuid;
begin
  select current_round_id into v_id from public.crash_table where id = 1 for update;
  if v_id is null then
    return public.crash_open_round();
  end if;
  select * into v_row from public.crash_rounds where id = v_id for update;
  if v_row.phase = 'betting' and now() >= v_row.betting_ends_at then
    v_row.phase := 'flying';
    v_row.flying_started_at := v_row.betting_ends_at;
    v_row.crash_at := v_row.betting_ends_at + make_interval(secs => public.crash_elapsed_ms(v_row.crash_point) / 1000.0);
    if v_row.crash_point <= 100 then
      v_row.phase := 'crashed';
      v_row.crashed_at := v_row.flying_started_at;
    end if;
    update public.crash_rounds set
      phase = v_row.phase,
      flying_started_at = v_row.flying_started_at,
      crash_at = v_row.crash_at,
      crashed_at = v_row.crashed_at
    where id = v_row.id;
  end if;
  if v_row.phase = 'flying' and v_row.crash_at is not null and now() >= v_row.crash_at then
    v_row.phase := 'crashed';
    v_row.crashed_at := v_row.crash_at;
    update public.crash_rounds set phase = 'crashed', crashed_at = v_row.crash_at where id = v_row.id;
  end if;
  if v_row.phase = 'crashed' and v_row.crashed_at is not null
     and now() >= v_row.crashed_at + interval '2.8 seconds' then
    return public.crash_open_round();
  end if;
  return v_row;
end;
$$;

create or replace function public.crash_public_round(p_row public.crash_rounds)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'index', p_row.round_index,
    'phase', p_row.phase,
    'seed_hash', p_row.seed_hash,
    'seed', case when p_row.phase = 'crashed' then p_row.seed else null end,
    'salt', p_row.salt,
    'crash_point', case when p_row.phase = 'crashed' then p_row.crash_point else null end,
    'betting_ends_at', p_row.betting_ends_at,
    'flying_started_at', p_row.flying_started_at,
    'server_now', now()
  );
$$;

create or replace function public.crash_get_state(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.crash_rounds;
begin
  v_row := public.crash_advance_locked();
  return jsonb_build_object('round', public.crash_public_round(v_row));
end;
$$;

grant execute on function public.crash_get_state(text) to anon, authenticated;
grant execute on function public.crash_point_from_seed(text, text) to anon, authenticated;

create or replace function public.admin_crash_ops(p_admin_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_row public.crash_rounds;
begin
  v_admin := public.assert_admin_perm(p_admin_token, 'view');
  perform public.crash_advance_locked();
  select r.* into v_row
  from public.crash_table t
  join public.crash_rounds r on r.id = t.current_round_id
  where t.id = 1;

  return jsonb_build_object(
    'ok', true,
    'source', 'rpc',
    'round', case when v_row.id is null then null else public.crash_public_round(v_row) end,
    'kpis', jsonb_build_object(
      'rounds_total', (select count(*)::int from public.crash_rounds),
      'rounds_24h', (select count(*)::int from public.crash_rounds where created_at > now() - interval '24 hours'),
      'wagered', (select coalesce(sum(amount), 0)::bigint from public.crash_bets),
      'paid', (select coalesce(sum(payout), 0)::bigint from public.crash_bets),
      'bets', (select count(*)::int from public.crash_bets),
      'cashed', (select count(*)::int from public.crash_bets where cashed_at is not null)
    ),
    'recent', coalesce((
      select jsonb_agg(x)
      from (
        select r.round_index as index,
               r.crash_point,
               r.seed_hash,
               r.salt,
               case when r.phase = 'crashed' then r.seed else null end as seed,
               r.phase,
               r.crashed_at,
               (select coalesce(sum(amount), 0) from public.crash_bets b where b.round_id = r.id) as volume,
               (select coalesce(sum(payout), 0) from public.crash_bets b where b.round_id = r.id) as paid
        from public.crash_rounds r
        order by r.round_index desc
        limit 40
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_crash_ops(text) from public;
grant execute on function public.admin_crash_ops(text) to anon, authenticated;
