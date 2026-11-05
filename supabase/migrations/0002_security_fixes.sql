-- 0002_security_fixes.sql — fixes from the adversarial security review (worker F1, 2026-11-05).
-- Idempotent. Every money-moving path becomes ONE plpgsql transaction (security definer, service_role only):
--   buyin()        advisory lock per user + table row lock: balance check, seat claim, ledger buyin   (finding 3)
--   credit_test()  advisory lock per user: 5/day counted and inserted atomically                       (finding 4)
--   leave_table()  table row lock: pending_leave for players of the live hand, cash-out otherwise      (finding 1)
--   settle_hand()  table row lock: hands + secrets + actions + stacks BY (seat,user) + rake + cashouts
--                  + state.settled in one transaction, idempotent per hand_id                         (findings 1,5)
--   create_table_limited()  3 tables per user per UTC day                                              (finding 6)
-- plus: ledger_guard trigger (no user balance ever below 0), seed moved to hand_secrets (finding 2),
-- Realtime private-channel read policy (finding 7).

-- ---------------------------------------------------------------------------
-- Finding 2: the seed never reaches a client. hands.seed -> hand_secrets (RLS on, no policies, no grants);
-- hands.seed_hash = sha256(seed bytes) is the public commitment.
-- ---------------------------------------------------------------------------
create table if not exists public.hand_secrets (
  hand_id    uuid primary key references public.hands(id) on delete cascade,
  seed       text not null,
  created_at timestamptz not null default now()
);
alter table public.hand_secrets enable row level security;
revoke all on public.hand_secrets from public, anon, authenticated;
grant all on public.hand_secrets to service_role;

alter table public.hands add column if not exists seed_hash text null;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hands' and column_name = 'seed') then
    insert into public.hand_secrets (hand_id, seed)
      select id, seed from public.hands where seed is not null and seed <> ''
      on conflict (hand_id) do nothing;
    update public.hands
       set seed_hash = encode(sha256(decode(seed, 'hex')), 'hex')
     where seed_hash is null and seed ~ '^([0-9a-f]{2})+$';
    alter table public.hands drop column seed;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ledger guard: a debit can never take a user (not the house) below zero. Serialized per user with
-- the same advisory lock key the RPCs use (xact advisory locks are re-entrant inside one transaction).
-- ---------------------------------------------------------------------------
create or replace function public.ledger_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal bigint;
begin
  if new.amount_cents < 0 and new.user_id <> '00000000-0000-0000-0000-000000000001'::uuid then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    select coalesce(sum(amount_cents), 0) into v_bal from public.ledger where user_id = new.user_id;
    if v_bal + new.amount_cents < 0 then
      raise exception 'INSUFFICIENT_BALANCE: balance % < debit %', v_bal, -new.amount_cents using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ledger_guard on public.ledger;
create trigger ledger_guard before insert on public.ledger
  for each row execute function public.ledger_guard();

-- helper: is the table's stored hand still live (running, or ended but not yet settled)?
create or replace function public.poker_hand_live(p_state jsonb)
returns boolean
language sql
immutable
as $$
  select p_state is not null
     and jsonb_typeof(p_state) = 'object'
     and not coalesce((p_state->>'settled')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- Finding 3: buy-in, atomic.
-- ---------------------------------------------------------------------------
create or replace function public.buyin(p_user uuid, p_table uuid, p_seat int, p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.tables%rowtype;
  v_bal  bigint;
  v_rows int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into t from public.tables where id = p_table for update;
  if not found then return jsonb_build_object('error', 'TABLE_NOT_FOUND'); end if;
  if p_seat < 0 or p_seat >= t.max_seats then
    return jsonb_build_object('error', 'BAD_REQUEST', 'message', format('seat must be in 0..%s', t.max_seats - 1));
  end if;
  if p_amount < t.min_buyin_cents or p_amount > t.max_buyin_cents then
    return jsonb_build_object('error', 'BUYIN_RANGE', 'message', format('buyin must be in %s..%s', t.min_buyin_cents, t.max_buyin_cents));
  end if;
  if exists (select 1 from public.seats where table_id = p_table and user_id = p_user and status <> 'left') then
    return jsonb_build_object('error', 'ALREADY_SEATED', 'message', 'you already sit at this table');
  end if;
  if exists (select 1 from public.seats where table_id = p_table and seat = p_seat and status <> 'left') then
    return jsonb_build_object('error', 'SEAT_TAKEN', 'message', 'seat is taken');
  end if;
  -- a seat (or a user) that belongs to the hand still being played stays locked until settlement
  if public.poker_hand_live(t.state) and exists (
       select 1 from jsonb_array_elements(coalesce(t.state->'players', '[]'::jsonb)) p
        where (p->>'seat')::int = p_seat or p->>'playerId' = p_user::text) then
    return jsonb_build_object('error', 'SEAT_IN_HAND', 'message', 'seat belongs to the hand in progress; wait for it to end');
  end if;
  select coalesce(sum(amount_cents), 0) into v_bal from public.ledger where user_id = p_user;
  if v_bal < p_amount then
    return jsonb_build_object('error', 'INSUFFICIENT_BALANCE', 'message', format('balance %s < buyin %s', v_bal, p_amount), 'balance', v_bal);
  end if;
  insert into public.seats (table_id, seat, user_id, stack_cents, status, pending_leave, joined_at, updated_at)
  values (p_table, p_seat, p_user, p_amount, 'sitting', false, now(), now())
  on conflict (table_id, seat) do update
     set user_id = excluded.user_id, stack_cents = excluded.stack_cents, status = 'sitting',
         pending_leave = false, joined_at = now(), updated_at = now()
   where public.seats.status = 'left';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('error', 'SEAT_TAKEN', 'message', 'seat is taken'); end if;
  insert into public.ledger (user_id, kind, amount_cents, table_id, meta)
  values (p_user, 'buyin', -p_amount, p_table, jsonb_build_object('seat', p_seat));
  return jsonb_build_object('ok', true, 'seat', p_seat, 'stack', p_amount, 'balance', v_bal - p_amount, 'version', t.version);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding 4: test credit, 100.000 cents, max 5 per UTC day, atomic.
-- ---------------------------------------------------------------------------
create or replace function public.credit_test(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   int;
  v_bal bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select count(*) into v_n from public.ledger
   where user_id = p_user and kind = 'credit_test'
     and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_n >= 5 then
    return jsonb_build_object('error', 'CREDIT_LIMIT', 'message', 'limit of 5 test credits per day reached');
  end if;
  insert into public.ledger (user_id, kind, amount_cents, meta)
  values (p_user, 'credit_test', 100000, jsonb_build_object('n', v_n + 1));
  select coalesce(sum(amount_cents), 0) into v_bal from public.ledger where user_id = p_user;
  return jsonb_build_object('ok', true, 'balance', v_bal, 'n', v_n + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding 1: leave. Under the table row lock: a player of the live hand (folded or not) only gets
-- pending_leave (cash-out happens in settle_hand); anyone else is cashed out now. When no hand is live
-- the version is bumped so an in-flight startHand built from a stale seat list conflicts and retries.
-- ---------------------------------------------------------------------------
create or replace function public.leave_table(p_user uuid, p_table uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.tables%rowtype;
  s      public.seats%rowtype;
  v_live boolean;
  v_ver  int;
  v_bal  bigint;
begin
  select * into t from public.tables where id = p_table for update;
  if not found then return jsonb_build_object('error', 'TABLE_NOT_FOUND'); end if;
  select * into s from public.seats where table_id = p_table and user_id = p_user and status <> 'left';
  if not found then return jsonb_build_object('error', 'NOT_SEATED', 'message', 'you are not seated at this table'); end if;
  v_live := public.poker_hand_live(t.state);
  if v_live and exists (select 1 from jsonb_array_elements(coalesce(t.state->'players', '[]'::jsonb)) p
                         where p->>'playerId' = p_user::text) then
    update public.seats set pending_leave = true, updated_at = now() where table_id = p_table and seat = s.seat;
    return jsonb_build_object('ok', true, 'pending', true, 'version', t.version);
  end if;
  update public.seats set status = 'left', stack_cents = 0, pending_leave = false, updated_at = now()
   where table_id = p_table and seat = s.seat;
  insert into public.ledger (user_id, kind, amount_cents, table_id, meta)
  values (p_user, 'cashout', s.stack_cents, p_table, jsonb_build_object('seat', s.seat, 'reason', 'leave'));
  v_ver := t.version;
  if not v_live then
    update public.tables set version = version + 1 where id = p_table returning version into v_ver;
  end if;
  select coalesce(sum(amount_cents), 0) into v_bal from public.ledger where user_id = p_user;
  return jsonb_build_object('ok', true, 'pending', false, 'cashout', s.stack_cents, 'balance', v_bal, 'version', v_ver);
end;
$$;

-- ---------------------------------------------------------------------------
-- Findings 1 + 5: settle an ended hand in ONE transaction, from the state stored in tables.state
-- (money never comes from the caller; p_meta only carries timestamps + action rows for the history).
-- Idempotent: a second call for the same hand_id returns {already:true}.
-- ---------------------------------------------------------------------------
create or replace function public.settle_hand(p_table uuid, p_hand_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t       public.tables%rowtype;
  st      jsonb;
  p       jsonb;
  s       public.seats%rowtype;
  v_ended timestamptz;
  v_seed  text;
  v_pot   bigint;
  v_rake  bigint;
  v_uid   uuid;
  v_seat  int;
  v_stack bigint;
  v_ver   int;
  v_orph  int := 0;
  -- settledAt in the API server's clock (the next-hand delay is measured with Date.now() there)
  v_at    bigint := coalesce((p_meta->>'settled_at')::bigint, (extract(epoch from clock_timestamp()) * 1000)::bigint);
begin
  select * into t from public.tables where id = p_table for update;
  if not found then return jsonb_build_object('error', 'TABLE_NOT_FOUND'); end if;
  if exists (select 1 from public.hands where id = p_hand_id) then
    if exists (select 1 from public.hands where id = p_hand_id and ended_at is not null) then
      -- already settled. Repair only the marker if the table still shows this hand unsettled (no money moves).
      if t.state->>'handId' = p_hand_id::text and not coalesce((t.state->>'settled')::boolean, false) then
        update public.tables
           set state = t.state || jsonb_build_object('settled', true, 'settledAt', v_at),
               deadline_at = null, version = version + 1
         where id = p_table
        returning version into v_ver;
        return jsonb_build_object('ok', true, 'already', true, 'repaired', true, 'version', v_ver);
      end if;
      return jsonb_build_object('ok', true, 'already', true, 'version', t.version);
    end if;
    raise exception 'HAND_PARTIAL: hand % has a row without ended_at (legacy partial settlement)', p_hand_id;
  end if;
  st := t.state;
  if st is null or st->>'handId' is distinct from p_hand_id::text or st->>'street' <> 'ended'
     or st->'result' is null or jsonb_typeof(st->'result') <> 'object' then
    return jsonb_build_object('error', 'NOT_ENDED', 'message', 'table does not hold this ended hand');
  end if;
  if coalesce((st->>'settled')::boolean, false) then
    return jsonb_build_object('ok', true, 'already', true, 'version', t.version);
  end if;

  v_seed  := st->>'seed';
  v_pot   := (select coalesce(sum((x->>'amount')::bigint), 0) from jsonb_array_elements(coalesce(st->'pots', '[]'::jsonb)) x);
  v_rake  := coalesce((st->>'rake')::bigint, 0);
  v_ended := coalesce((p_meta->>'ended_at')::timestamptz, now());

  insert into public.hands (id, table_id, hand_no, started_at, ended_at, board, pot_cents, rake_cents, seed_hash, result, log)
  values (p_hand_id, p_table, (st->>'handNo')::int,
          coalesce((p_meta->>'started_at')::timestamptz, now()), v_ended,
          coalesce(array(select jsonb_array_elements_text(coalesce(st->'board', '[]'::jsonb))), '{}'),
          v_pot, v_rake,
          case when v_seed ~ '^([0-9a-f]{2})+$' then encode(sha256(decode(v_seed, 'hex')), 'hex') end,
          st->'result', st->'log');
  if v_seed is not null and v_seed <> '' then
    insert into public.hand_secrets (hand_id, seed) values (p_hand_id, v_seed);
  end if;

  insert into public.actions (hand_id, seat, user_id, street, action, amount_cents, at)
  select p_hand_id, (a->>'seat')::int, (a->>'user_id')::uuid, a->>'street', a->>'action',
         coalesce((a->>'amount_cents')::bigint, 0), coalesce((a->>'at')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_meta->'actions', '[]'::jsonb)) a;

  -- final stacks: only to the seat still occupied by THAT player; otherwise straight to the player's balance
  for p in select * from jsonb_array_elements(coalesce(st->'players', '[]'::jsonb)) loop
    v_uid  := (p->>'playerId')::uuid;
    v_seat := (p->>'seat')::int;
    v_stack := coalesce(
      (select (r->>'stack')::bigint from jsonb_array_elements(coalesce(st->'result'->'stacks', '[]'::jsonb)) r
        where (r->>'seat')::int = v_seat limit 1),
      (p->>'stack')::bigint, 0);
    update public.seats set stack_cents = v_stack, updated_at = now()
     where table_id = p_table and seat = v_seat and user_id = v_uid and status <> 'left';
    if not found and v_stack > 0 then
      v_orph := v_orph + 1;
      insert into public.ledger (user_id, kind, amount_cents, table_id, hand_id, meta)
      values (v_uid, 'cashout', v_stack, p_table, p_hand_id, jsonb_build_object('seat', v_seat, 'reason', 'orphan'));
    end if;
  end loop;

  if v_rake > 0 then
    insert into public.ledger (user_id, kind, amount_cents, table_id, hand_id, meta)
    values ('00000000-0000-0000-0000-000000000001', 'rake', v_rake, p_table, p_hand_id,
            jsonb_build_object('hand_no', (st->>'handNo')::int, 'pot_cents', v_pot));
  end if;

  for s in select * from public.seats where table_id = p_table and status <> 'left'
                                      and (stack_cents = 0 or pending_leave) loop
    insert into public.ledger (user_id, kind, amount_cents, table_id, hand_id, meta)
    values (s.user_id, 'cashout', s.stack_cents, p_table, p_hand_id,
            jsonb_build_object('seat', s.seat, 'reason', case when s.stack_cents = 0 then 'busted' else 'leave' end));
    update public.seats set status = 'left', stack_cents = 0, pending_leave = false, updated_at = now()
     where table_id = p_table and seat = s.seat;
  end loop;

  update public.tables
     set state = st || jsonb_build_object('settled', true, 'settledAt', v_at),
         deadline_at = null,
         version = version + 1
   where id = p_table
  returning version into v_ver;
  return jsonb_build_object('ok', true, 'already', false, 'version', v_ver, 'pot', v_pot, 'rake', v_rake, 'orphans', v_orph);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding 6: table creation, 3 per user per UTC day (stakes/seats/rake are allowlisted in the API).
-- ---------------------------------------------------------------------------
create or replace function public.create_table_limited(
  p_user uuid, p_name text, p_sb bigint, p_bb bigint, p_max_seats int,
  p_min_buyin bigint, p_max_buyin bigint, p_action_seconds int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n  int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('create_table:' || p_user::text));
  select count(*) into v_n from public.tables
   where created_by = p_user
     and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_n >= 3 then
    return jsonb_build_object('error', 'TABLE_LIMIT', 'message', 'limit of 3 tables per day reached');
  end if;
  insert into public.tables (name, game, sb_cents, bb_cents, max_seats, min_buyin_cents, max_buyin_cents,
                             rake_bps, rake_cap_cents, no_flop_no_drop, action_seconds, created_by)
  values (p_name, 'nlh', p_sb, p_bb, p_max_seats, p_min_buyin, p_max_buyin, 500, null, true, p_action_seconds, p_user)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- privileges: service_role only
revoke all on function public.ledger_guard() from public, anon, authenticated;
revoke all on function public.buyin(uuid, uuid, int, bigint) from public, anon, authenticated;
revoke all on function public.credit_test(uuid) from public, anon, authenticated;
revoke all on function public.leave_table(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_hand(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_table_limited(uuid, text, bigint, bigint, int, bigint, bigint, int) from public, anon, authenticated;
grant execute on function public.buyin(uuid, uuid, int, bigint) to service_role;
grant execute on function public.credit_test(uuid) to service_role;
grant execute on function public.leave_table(uuid, uuid) to service_role;
grant execute on function public.settle_hand(uuid, uuid, jsonb) to service_role;
grant execute on function public.create_table_limited(uuid, text, bigint, bigint, int, bigint, bigint, int) to service_role;

-- ---------------------------------------------------------------------------
-- Finding 7: Realtime private channels. Clients may READ broadcasts on topics 'table:%';
-- no INSERT policy exists, so no client can send on a private channel (only the service role via REST).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists poker_table_broadcast_read on realtime.messages';
    execute $p$create policy poker_table_broadcast_read on realtime.messages
               for select to anon, authenticated
               using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'table:%')$p$;
  end if;
end $$;
