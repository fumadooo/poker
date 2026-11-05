-- 0001_init.sql — POKER v1 schema (docs/PLAN-poker-v1.md §5 + docs/SPEC-contracts-v1.md §2)
-- Idempotent: safe to run more than once. Money = integer cents (bigint). Applied by tools/migrate.py
-- through the Supabase Management API (runs as role `postgres`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- schema_migrations
-- ---------------------------------------------------------------------------
create table if not exists public.schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles
-- No FK to auth.users: the house account (00000000-0000-0000-0000-000000000001)
-- is not an auth user. Real users get a profile row from the auth.users trigger.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key,
  nick       text not null unique check (char_length(nick) between 2 and 24),
  created_at timestamptz not null default now()
);

insert into public.profiles (id, nick)
values ('00000000-0000-0000-0000-000000000001', 'house')
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := 'player_' || left(new.id::text, 6);
begin
  if exists (select 1 from public.profiles p where p.nick = v_nick) then
    v_nick := 'player_' || replace(new.id::text, '-', '');
  end if;
  insert into public.profiles (id, nick)
  values (new.id, v_nick)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tables (one row per poker table; `state` = HandState jsonb of the current hand)
-- ---------------------------------------------------------------------------
create table if not exists public.tables (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  game             text not null default 'nlh' check (game in ('nlh')),
  sb_cents         bigint not null check (sb_cents > 0),
  bb_cents         bigint not null check (bb_cents >= sb_cents),
  max_seats        int not null default 9 check (max_seats between 2 and 9),
  min_buyin_cents  bigint not null check (min_buyin_cents > 0),
  max_buyin_cents  bigint not null check (max_buyin_cents >= min_buyin_cents),
  rake_bps         int not null default 500 check (rake_bps between 0 and 10000),
  rake_cap_cents   bigint null check (rake_cap_cents is null or rake_cap_cents >= 0),
  no_flop_no_drop  boolean not null default true,
  action_seconds   int not null default 20 check (action_seconds between 5 and 120),
  state            jsonb null,                 -- NEVER readable by clients (see RLS + tables_public)
  version          int not null default 0,
  hand_no          int not null default 0,
  button           int null,
  deadline_at      timestamptz null,
  created_by       uuid null references public.profiles(id),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- seats
-- ---------------------------------------------------------------------------
create table if not exists public.seats (
  table_id      uuid not null references public.tables(id) on delete cascade,
  seat          int not null check (seat between 0 and 8),
  user_id       uuid not null references public.profiles(id),
  stack_cents   bigint not null default 0 check (stack_cents >= 0),
  status        text not null default 'sitting' check (status in ('sitting','sitout','left')),
  pending_leave boolean not null default false,
  joined_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (table_id, seat)
);

create index if not exists seats_table_id_idx on public.seats (table_id);
create index if not exists seats_user_id_idx on public.seats (user_id);
-- a user occupies at most one active seat per table
create unique index if not exists seats_one_active_per_user_idx
  on public.seats (table_id, user_id) where status <> 'left';

-- ---------------------------------------------------------------------------
-- hands
-- ---------------------------------------------------------------------------
create table if not exists public.hands (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.tables(id) on delete cascade,
  hand_no     int not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz null,
  board       text[] not null default '{}',
  pot_cents   bigint not null default 0,
  rake_cents  bigint not null default 0,
  seed        text null,                         -- RNG seed hex (audit)
  result      jsonb null,                        -- HandResult
  log         jsonb null,                        -- HandEvent[] in order (replayable)
  unique (table_id, hand_no)
);

-- (table_id, hand_no) is already indexed by the unique constraint above
drop index if exists public.hands_table_id_hand_no_idx;

-- ---------------------------------------------------------------------------
-- actions
-- ---------------------------------------------------------------------------
create table if not exists public.actions (
  id           bigserial primary key,
  hand_id      uuid not null references public.hands(id) on delete cascade,
  seat         int not null,
  user_id      uuid not null references public.profiles(id),
  street       text not null check (street in ('preflop','flop','turn','river','showdown','ended')),
  action       text not null check (action in ('fold','check','call','bet','raise','allin','timeout')),
  amount_cents bigint not null default 0,
  at           timestamptz not null default now()
);

create index if not exists actions_hand_id_idx on public.actions (hand_id);

-- ---------------------------------------------------------------------------
-- ledger (accounting from day 1; balance = sum(amount_cents))
-- ---------------------------------------------------------------------------
create table if not exists public.ledger (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles(id),
  kind         text not null check (kind in ('credit_test','buyin','cashout','rake','adjust')),
  amount_cents bigint not null,                  -- + enters the user's account, - leaves
  table_id     uuid null references public.tables(id) on delete set null,
  hand_id      uuid null references public.hands(id) on delete set null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists ledger_user_id_idx on public.ledger (user_id);
create index if not exists ledger_user_kind_created_idx on public.ledger (user_id, kind, created_at);
create index if not exists ledger_hand_id_idx on public.ledger (hand_id);

-- ---------------------------------------------------------------------------
-- views
-- balances: security_invoker so the ledger RLS (owner-only) applies through the view.
-- tables_public: definer view (owner postgres) exposing every column EXCEPT state;
--   the base table has no select policy for anon/authenticated, so this view is the
--   only public read path.
-- ---------------------------------------------------------------------------
create or replace view public.balances
  with (security_invoker = true) as
  select user_id, coalesce(sum(amount_cents), 0)::bigint as balance_cents
  from public.ledger
  group by user_id;

create or replace view public.tables_public
  with (security_invoker = false) as
  select id, name, game, sb_cents, bb_cents, max_seats, min_buyin_cents, max_buyin_cents,
         rake_bps, rake_cap_cents, no_flop_no_drop, action_seconds,
         version, hand_no, button, deadline_at, created_by, created_at
  from public.tables;

-- ---------------------------------------------------------------------------
-- apply_table_update: optimistic lock on tables.version.
-- Returns the new version, or NULL when no row matched (version conflict → API retries).
-- ---------------------------------------------------------------------------
create or replace function public.apply_table_update(
  p_table uuid, p_version int, p_state jsonb, p_deadline timestamptz, p_hand_no int, p_button int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new int;
begin
  update public.tables
     set state       = p_state,
         deadline_at = p_deadline,
         hand_no     = p_hand_no,
         button      = p_button,
         version     = version + 1
   where id = p_table and version = p_version
  returning version into v_new;
  return v_new;  -- null = conflict (0 rows updated)
end;
$$;

revoke all on function public.apply_table_update(uuid, int, jsonb, timestamptz, int, int) from public, anon, authenticated;
grant execute on function public.apply_table_update(uuid, int, jsonb, timestamptz, int, int) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- privileges + RLS. All writes go through service_role (bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.ledger            enable row level security;
alter table public.tables            enable row level security;
alter table public.seats             enable row level security;
alter table public.hands             enable row level security;
alter table public.actions           enable row level security;
alter table public.schema_migrations enable row level security;

-- no client writes anywhere (defense in depth on top of "no policy = denied")
revoke insert, update, delete, truncate, references, trigger
  on public.profiles, public.ledger, public.tables, public.seats, public.hands, public.actions, public.schema_migrations
  from anon, authenticated;
-- tables.state must never reach a client: no direct select on the base table at all
revoke select on public.tables from anon, authenticated;
revoke all on public.schema_migrations from anon, authenticated;

grant select on public.profiles, public.ledger, public.seats, public.hands, public.actions to anon, authenticated;
-- views: Supabase default privileges grant ALL on new views; tables_public is auto-updatable,
-- so strip every write privilege and leave select only
revoke all on public.tables_public, public.balances from anon, authenticated;
grant select on public.tables_public, public.balances to anon, authenticated;
-- profiles: owner may change only the nick
grant update (nick) on public.profiles to authenticated;
grant all on public.profiles, public.ledger, public.tables, public.seats, public.hands, public.actions, public.schema_migrations to service_role;
grant select on public.tables_public, public.balances to service_role;

-- profiles: public read (nick), owner-only write
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ledger: owner-only read
drop policy if exists ledger_select_owner on public.ledger;
create policy ledger_select_owner on public.ledger
  for select to authenticated using (user_id = auth.uid());

-- tables: NO select policy for anon/authenticated (read via tables_public only)

-- seats: public read
drop policy if exists seats_select_public on public.seats;
create policy seats_select_public on public.seats
  for select to anon, authenticated using (true);

-- hands: public read once ended
drop policy if exists hands_select_ended on public.hands;
create policy hands_select_ended on public.hands
  for select to anon, authenticated using (ended_at is not null);

-- actions: public read once the hand ended
drop policy if exists actions_select_ended on public.actions;
create policy actions_select_ended on public.actions
  for select to anon, authenticated
  using (exists (select 1 from public.hands h where h.id = actions.hand_id and h.ended_at is not null));
