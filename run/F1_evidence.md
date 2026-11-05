# F1: fixes from the adversarial security review (2026-11-05, worker F1)

Raw outputs: `run/exploit_f1.out` (51 OK, PASS), `run/smoke_f1.out` (60 OK, PASS), `run/realtime_f1.out` (PASS),
`run/F1_build.log`, `run/dev_f1.log` (dev server `next dev -p 3079`, stopped afterwards). Nothing pushed or deployed.

## What changed, per finding
| # | Fix | Where |
|---|---|---|
| 1 CRITICAL mint | Settlement writes stacks by `(table_id, seat, user_id = hand player)` and only to an active row of that player. If the row is missing, the stack goes to that player as a `cashout` ("orphan"), so chips are conserved in every case. Leave is the RPC `leave_table` under the table row lock: any player of the live hand (folded or not, or ended but not yet settled) only gets `pending_leave`, and `settle_hand` pays them out. Anyone else is paid out at once, and the version is bumped when no hand is live, so a startHand built from a stale seat list gets a conflict. Sit refuses a seat (or a user) that belongs to the live hand (`SEAT_IN_HAND`). `actionMutation` takes the caller's id and acts for the seat that `state.players[].playerId === caller` holds (403 `NOT_IN_HAND` / `NOT_YOUR_TURN`). `legalFor` and `me.hole` are also keyed by user. | `0002` `leave_table`, `buyin`, `settle_hand`; `lib/server/table.ts`; routes `action`, `leave`, `state` |
| 2 HIGH seed | `publicView` never returns the seed (`seed: ''`). It returns `seedHash = sha256(seed bytes)` instead (new `seedHashOf`, type `PublicHandState`). DB: `hands.seed` moved to `hand_secrets` (RLS on, no policies, no grants to anon/authenticated); the column is dropped and `hands.seed_hash` is public. 6 existing seeds migrated and hashed. | `packages/engine/src/hand.ts`, test updated; `0002` |
| 3 HIGH buy-in race | RPC `buyin(p_user,p_table,p_seat,p_amount)`: advisory lock per user, then table row lock, then checks, then the seat upsert (reuses a `left` row) and the ledger insert in 1 transaction. Backed by the `ledger_guard` BEFORE INSERT trigger: a debit that would take a user (not the house) below 0 raises `INSUFFICIENT_BALANCE`, even for the service role. | `0002`; `sit/route.ts` |
| 4 HIGH credit race | RPC `credit_test(p_user)`: advisory lock, count for the UTC day, insert (100.000 c, max 5). | `0002`; `me/credit/route.ts` |
| 5 MED-HIGH settlement | RPC `settle_hand(p_table,p_hand_id,p_meta)`: 1 transaction under `select … for update` on the table. It writes hands (ended_at at once), hand_secrets, actions, stacks by user, rake for the house, cash-outs for busted/pending_leave seats, and `state.settled`/`settledAt` + version. Money comes only from `tables.state` in the DB; `p_meta` carries only timestamps and the action rows for the history. Idempotent: a second call returns `already`, and repairs only the `settled` marker if needed. Crash recovery: `tick` sees ended && !settled and runs `settleOnly`. `settledAt` uses the API server's clock (`p_meta.settled_at`): the DB clock is skewed against `Date.now()` and blocked the 3 s next-hand delay. | `0002`; `table.ts` (`settleIfEnded`, `mutate`, `tickMutation`) |
| 6 MED table creation | Allowed stakes sb/bb ∈ {5/10, 10/25, 25/50, 50/100, 100/200, 200/500, 500/1000}; maxSeats ∈ {2,6,9}; rakeBps must be 500, rakeCap null, noFlopNoDrop true (400 `BAD_RAKE`/`BAD_STAKES`/`BUYIN_RANGE`); buy-in within 40–200 bb; actionSeconds 10–60; RPC `create_table_limited`: 3 tables per user per UTC day (400 `TABLE_LIMIT`), atomic. | `tables/route.ts`; `0002` |
| 7 LOW Realtime spoof | Policy `poker_table_broadcast_read` on `realtime.messages` (SELECT, anon+authenticated, `extension='broadcast' and topic like 'table:%'`); there is no INSERT policy. The client subscribes with `{ config: { private: true } }`; the server broadcasts by REST with `private: true`. (`alter table realtime.messages enable rls` is not allowed for postgres, but RLS was already on.) | `0002`; `lib/server/realtime.ts`; `TableClient.tsx` (1 line) |
| 8 LOW tick by anyone | `tick` from a user who is not seated (seats or state.players): returns `{changed:false, ignored:'NOT_SEATED'}` after 1 read, with no writes. | `tick/route.ts` |

## Migration
```
$ python -I tools/migrate.py
applying 0002_security_fixes.sql (18818 bytes) ...
applied  0002_security_fixes.sql
```
(1st attempt: `must be owner of table messages`. The whole migration rolled back; the line was removed. Later edits to
`settle_hand` (repair of the marker, `settled_at`) were re-applied by running the whole idempotent file again through `--sql`.)
hands after: `id,table_id,hand_no,started_at,ended_at,board,pot_cents,rake_cents,result,log,seed_hash`; `hand_secrets` = 6 rows.

## Build + engine
- `cd app && npm run build`: `✓ Compiled successfully`, exit 0 (all routes ƒ, no errors) — `run/F1_build.log`
- `npm --workspace packages/engine test`: `tests 29 · pass 29 · fail 0` (publicView test now asserts `seed === ''` and `seedHash === sha256(seed)`)

## `python -I tools/exploit_tests.py http://localhost:3079`: exit 0
```
(c) 200=5 CREDIT_LIMIT=15                       OK exactly 5 of 20 parallel credits; ledger 5 rows, balance 500000
(b) successes=1 errors=[(400,'INSUFFICIENT_BALANCE')]   OK 1 of 10 parallel buy-ins; balance 40000 >= 0; 1 seat
    OK ledger_guard trigger refuses an overdraft insert (400)
(e) OK rakeBps 0 / 10000 / rakeCap 1 -> 400 BAD_RAKE; 7/13, 1/1000000 -> 400 BAD_STAKES; maxSeats 4 -> 400;
    minBuyin 1 / maxBuyin 1000 bb -> 400 BUYIN_RANGE; 6 parallel creates -> 3 created, 3 TABLE_LIMIT; table forced 500 bps
(f) OK C (seated, not in the hand) acts with the actor's seat -> 403 NOT_IN_HAND
    OK non-actor sends the actor's seat -> 403 NOT_YOUR_TURN ; C gets legal = null
(g) OK tick at a table where the caller is not seated -> ignored
(d) OK running + ended + anon GET state: seed '' and seedHash (64 hex, same)
    OK anon PostgREST hands?select=* -> no seed column, seed_hash == state.seedHash ; hands?select=seed -> 400
    OK anon hand_secrets -> 401 42501 ; service role: sha256(hand_secrets.seed) == seed_hash
(a) hand 2, 3 players: attacker B (seat 1) folds -> leave -> 200 pending:true, balance unchanged
    re-sit same seat -> 400 ALREADY_SEATED ; other seat -> 400 ALREADY_SEATED
    (simulated freed row) re-sit the hand's seat -> 400 SEAT_IN_HAND
    attacker stack at hand start=9995 final=9995 cashouts=[9995 'leave'] (exactly once, at settlement), seat 'left'
    OK attacker balance delta -5 == final stack - buyin (no mint)
    TABLE: buyins=30000 cashouts=9995 rake=20 stacks=19985  OK chips conserved
(g2) OK second settle_hand -> already, no new ledger rows ; anon rpc settle_hand / buyin -> 401
cleanup: TABLE buyins 30000 == cashouts 29980 + rake 20 + stacks 0
GLOBAL: sum(balances)=2370010 + sum(active stacks)=29990 = 2400000 == sum(credit_test+adjust)  OK ; no negative balance
== RESULT: PASS
```

## `python -I tools/smoke_api.py http://localhost:3079`: exit 0, `== RESULT: PASS`
Updated for the new contracts: table 40–200 bb (`minBuyin 4000`), falls back to a service-role insert when A hits
`TABLE_LIMIT` on repeated runs the same day, `seedHash` instead of a published seed, `hands.seed_hash == state.seedHash`,
buy-in below the 40 bb minimum -> `BUYIN_RANGE`. GLOBAL: balances + stacks == credits OK.

## Realtime (`run/realtime_f1.out`, node + supabase-js, anon key)
```
private subscribe (anon): SUBSCRIBED
attacker private ws send -> ok        attacker public ws send (same topic) -> ok      attacker REST anon private -> 202
server REST service private -> 202
private viewer received: [{"version":1,"via":"rest"}]      <- only the server's message
public viewer received: [{"version":777,"via":"public-ws"}] <- public and private topics are separate
RT_RESULT: PASS
```

## Ledger invariant after all tests (SQL, Management API)
`sum(ledger)=2600000 = sum(credit_test+adjust)=2600000, active stacks=0, negative user balances=0, hands without seed_hash=0`.
(The first exploit run had stopped at "hand 2 started" because of the clock skew fixed in #5. Its 3 users were taken off
their table by `leave` through the API, so the invariant holds with no manual adjustment.)

## Left open / notes
- `HAND_PARTIAL`: a hands row without `ended_at`, left by the OLD non-transactional settlement, is not repaired
  automatically (the RPC raises). The money already moved is unknown, so it needs a manual repair. It cannot happen with the RPC.
- The lobby form (`components/CreateTableForm.tsx`, owned by U1) still offers stakes, rake and buy-in outside the allowlist.
  The server answers 400. U1 should show only the allowed options (stakes pairs, 2/6/9 seats, rake 5% fixed, 40–200 bb).
- Mid-hand `pending_leave` is not version-bumped: a stale startHand read can include a leaver for 1 more hand.
  Settlement pays them out at its end, so no money is at risk.
- Spectators (anon) still receive the private broadcasts (the SELECT policy includes anon); only sending is closed.
- Deploy is needed for production (`tools/deploy.py`, not run here). Migration 0002 is already live in the Supabase DB
  that production uses. The old production code still works with it, except for writing `hands.seed` (column dropped)
  and the direct seat/credit writes. **Deploy soon**, or production settlement fails on the `seed` insert.
