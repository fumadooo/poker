# D1 evidence — schema applied to Supabase `poker` (puvosfyvoqztqjlyzamf) — 2026-11-05

Files: `supabase/migrations/0001_init.sql`, `tools/migrate.py`. Applied via Management API
(`POST /v1/projects/{ref}/database/query`, Bearer SUPABASE_PAT). Re-running the same SQL a second time
returned `[]` with no error (idempotent).

## 1. migrate.py
```
$ python tools/migrate.py --status
0001_init.sql                            pending
-- 0 applied, 1 pending
$ python tools/migrate.py
applying 0001_init.sql (12533 bytes) ...
applied  0001_init.sql
$ python tools/migrate.py --status
0001_init.sql                            applied 2026-11-05 12:50:17.801526+00
-- 1 applied, 0 pending
```

## 2. Objects in `public`
tables: actions, hands, ledger, profiles, schema_migrations, seats, tables · views: balances (security_invoker), tables_public (definer, no `state` column)
RLS enabled (`relrowsecurity = true`) on all 7 base tables. Trigger `on_auth_user_created` on `auth.users` (enabled).
Indexes: actions_hand_id_idx, ledger_user_id_idx, ledger_user_kind_created_idx, ledger_hand_id_idx, seats_table_id_idx,
seats_user_id_idx, seats_one_active_per_user_idx (unique partial, status <> 'left'), hands unique(table_id, hand_no), PKs.

## 3. Policies (`select tablename, policyname, roles, cmd from pg_policies`)
| table | policy | roles | cmd |
|---|---|---|---|
| actions | actions_select_ended | {anon,authenticated} | SELECT (hand ended_at is not null) |
| hands | hands_select_ended | {anon,authenticated} | SELECT (ended_at is not null) |
| ledger | ledger_select_owner | {authenticated} | SELECT (user_id = auth.uid()) |
| profiles | profiles_select_public | {anon,authenticated} | SELECT (true) |
| profiles | profiles_update_owner | {authenticated} | UPDATE (id = auth.uid(); column grant limited to `nick`) |
| seats | seats_select_public | {anon,authenticated} | SELECT (true) |
`tables`: no policy for anon/authenticated AND `revoke select` → direct reads are impossible. All writes: service_role only.

Grants (information_schema.table_privileges, anon/authenticated): SELECT only on profiles, ledger, seats, hands, actions,
tables_public, balances; nothing on tables and schema_migrations; `apply_table_update` executable by service_role only.

## 4. House profile row
```
[{"id": "00000000-0000-0000-0000-000000000001", "nick": "house", "created_at": "2026-11-05 12:50:10.323717+00"}]
```

## 5. RLS proof over HTTP with the anon key (a test table with state = {"secret":"hole cards"} was seeded first, then deleted)
```
== HTTP as anon ==
GET /rest/v1/tables?select=state -> 401 {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.tables TO anon;","message":"permission denied for table tables"}
GET /rest/v1/tables?select=id -> 401 {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.tables TO anon;","message":"permission denied for table tables"}
GET /rest/v1/tables_public?select=id,name,version -> 200 [{"id":"2f38fd8c-f238-45b2-8129-08d48fc7546a","name":"D1 test","version":0}]
GET /rest/v1/tables_public?select=state -> 400 {"code":"42703","details":null,"hint":null,"message":"column tables_public.state does not exist"}
PATCH /rest/v1/tables_public?id=eq.2f38fd8c-f238-45b2-8129-08d48fc7546a -> 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for view tables_public"}
POST /rest/v1/ledger -> 401 {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT INSERT ON public.ledger TO anon;","message":"permission denied for table ledger"}
GET /rest/v1/ledger?select=* -> 200 []
GET /rest/v1/profiles?select=id,nick -> 200 [{"id":"00000000-0000-0000-0000-000000000001","nick":"house"}]
GET /rest/v1/balances?select=* -> 200 []
GET /rest/v1/seats?select=* -> 200 []
GET /rest/v1/hands?select=* -> 200 []
GET /rest/v1/schema_migrations?select=* -> 401 {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.schema_migrations TO anon;","message":"permission denied for table schema_migrations"}
POST /rest/v1/rpc/apply_table_update -> 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function apply_table_update"}
```

## 6. apply_table_update + trigger (run as postgres)
```
== apply_table_update (as postgres) ==
v0 ok   : [{'new_version': 1}]
v0 again: [{'new_version': None}] (null = conflict)
v1 ok   : [{'new_version': 2}]
row     : [{'version': 2, 'hand_no': 2, 'button': 1, 'state': {'x': 3}, 'deadline_at': None}]
test table deleted

== handle_new_user trigger ==
profile : [{'id': '1568727a-cac7-4e02-8ea6-3f4e1764fe34', 'nick': 'player_156872'}]
test user + profile deleted
profiles now: [{'id': '00000000-0000-0000-0000-000000000001', 'nick': 'house'}]
tables now  : [{'n': 0}]
```

## 7. Deviations / additions vs SPEC §2 (all reversible)
- `profiles.id` has no FK to `auth.users` (house row is not an auth user); trigger `handle_new_user` creates `player_<6 hex>` (fallback: full id without dashes on nick collision).
- `apply_table_update` returns the new version or **NULL** on version conflict (a scalar `returns int` cannot return "0 rows"); supabase-js `.rpc()` gives `data === null` → API answers 409.
- Extra columns: `tables.no_flop_no_drop`, `tables.action_seconds`, `tables.created_by`; `seats.pending_leave`, `seats.updated_at`; `hands.seed`; `actions.action` also allows `'timeout'`.
- `balances` view is `security_invoker = true` so the ledger owner-only policy applies through it (otherwise everyone's balance would leak).
- Supabase default privileges granted ALL on views to anon/authenticated; the migration revokes them (tables_public is auto-updatable — would have been a write path into `tables`).
