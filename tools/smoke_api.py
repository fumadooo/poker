#!/usr/bin/env python3
"""Smoke test for the POKER API (SPEC §3). Python stdlib only.

    python -I tools/smoke_api.py http://localhost:3078

Creates/uses two test users through the Supabase Admin API (service role), signs them in with the
password grant, then plays one full hand over HTTP with `Authorization: Bearer <access_token>`:
credit -> create table (allowlisted stakes, 40-200 bb) -> sit x2 -> tick (starts the hand) -> call/check (fold on the 3rd street) ->
result -> auto-start of the next hand (tick after 3 s) -> fold -> leave x2 -> ledger invariant.
Every step is printed. Exit code 0 only when every check passed.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOUSE = "00000000-0000-0000-0000-000000000001"
USERS = [
    ("poker-test-1@example.com", "PokerTest1!pass-2026"),
    ("poker-test-2@example.com", "PokerTest2!pass-2026"),
]
FAILS = []


def load_env():
    env = {}
    for path in (os.path.join(ROOT, "app", ".env.local"), os.path.join(ROOT, ".env")):
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    service = env.get("SUPABASE_SERVICE_ROLE_KEY")
    anon = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or env.get("SUPABASE_ANON_KEY") or service
    if not url or not service:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in app/.env.local or .env")
    return url.rstrip("/"), service, anon


def http(method, url, body=None, headers=None, timeout=30):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    req.add_header("accept", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode(errors="replace")


def check(cond, label):
    print(("  OK   " if cond else "  FAIL ") + label)
    if not cond:
        FAILS.append(label)
    return cond


class Supa:
    def __init__(self, url, service, anon):
        self.url, self.service, self.anon = url, service, anon
        self.h = {"apikey": service, "authorization": "Bearer " + service}

    def ensure_user(self, email, password):
        st, body = http("POST", self.url + "/auth/v1/admin/users", {"email": email, "password": password, "email_confirm": True}, self.h)
        if st in (200, 201):
            print(f"  created user {email} -> {body['id']}")
            return body["id"]
        # already exists: find it and reset the password so the login below always works
        st2, lst = http("GET", self.url + "/auth/v1/admin/users?per_page=1000", headers=self.h)
        users = lst.get("users", []) if isinstance(lst, dict) else []
        for u in users:
            if u.get("email") == email:
                http("PUT", self.url + f"/auth/v1/admin/users/{u['id']}", {"password": password, "email_confirm": True}, self.h)
                print(f"  reusing user {email} -> {u['id']}")
                return u["id"]
        sys.exit(f"cannot create/find user {email}: {st} {body}")

    def login(self, email, password):
        st, body = http("POST", self.url + "/auth/v1/token?grant_type=password", {"email": email, "password": password},
                        {"apikey": self.anon})
        if st != 200:
            sys.exit(f"login failed for {email}: {st} {body}")
        return body["access_token"], body["user"]["id"]

    def rest(self, path):
        st, body = http("GET", self.url + "/rest/v1/" + path, headers=self.h)
        if st != 200:
            sys.exit(f"REST {path} -> {st} {body}")
        return body


class Api:
    def __init__(self, base, token, name):
        self.base, self.name = base.rstrip("/"), name
        self.h = {"authorization": "Bearer " + token}

    def call(self, method, path, body=None, auth=True, quiet=False):
        st, res = http(method, self.base + path, body, self.h if auth else {})
        if not quiet:
            shown = json.dumps(res)[:160] if not isinstance(res, str) else res[:160]
            print(f"  [{self.name}] {method} {path} {json.dumps(body) if body is not None else ''} -> {st} {shown}")
        return st, res


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3078"
    url, service, anon = load_env()
    supa = Supa(url, service, anon)

    print("== 1. users (Supabase Admin API + password grant)")
    tokens, ids = [], []
    for email, pw in USERS:
        supa.ensure_user(email, pw)
        tok, uid = supa.login(email, pw)
        tokens.append(tok)
        ids.append(uid)
        print(f"  signed in {email} -> {uid}")
    A, B = Api(base, tokens[0], "A"), Api(base, tokens[1], "B")
    players = {ids[0]: A, ids[1]: B}

    print("== 2. auth gate")
    st, _ = A.call("GET", "/api/me", auth=False)
    check(st == 401, "GET /api/me without auth -> 401")
    st, _ = A.call("GET", "/api/tables", auth=False)
    check(st == 200, "GET /api/tables without auth -> 200 (public)")

    print("== 3. credit + me")
    credits_before = {}
    for api, uid in ((A, ids[0]), (B, ids[1])):
        st, me = api.call("GET", "/api/me")
        check(st == 200 and me["id"] == uid, f"GET /api/me ok for {api.name}")
        st, res = api.call("POST", "/api/me/credit")
        check(st == 200 or (st == 400 and res.get("error") == "CREDIT_LIMIT"), f"POST /api/me/credit for {api.name} (200 or CREDIT_LIMIT)")
        st, me = api.call("GET", "/api/me")
        check(me["balance"] >= 10000, f"{api.name} balance {me['balance']} >= 10000")
        credits_before[uid] = me["balance"]

    print("== 4. create table")
    tbody = {"name": "smoke " + time.strftime("%H:%M:%S"), "sb": 50, "bb": 100, "maxSeats": 6,
             "rakeBps": 500, "rakeCap": None, "minBuyin": 4000, "maxBuyin": 20000}
    st, res = A.call("POST", "/api/tables", tbody)
    if st == 400 and isinstance(res, dict) and res.get("error") == "TABLE_LIMIT":
        # 3 tables/user/day (F1): repeated smoke runs on the same day create the table with the service role
        print("  (A hit TABLE_LIMIT 3/day -> table created through the service role instead)")
        st2, rows = http("POST", supa.url + "/rest/v1/tables", {
            "name": tbody["name"], "sb_cents": 50, "bb_cents": 100, "max_seats": 6, "min_buyin_cents": 4000,
            "max_buyin_cents": 20000, "rake_bps": 500, "rake_cap_cents": None, "created_by": ids[0]},
            dict(supa.h, Prefer="return=representation"))
        st, res = (201, {"ok": True, "id": rows[0]["id"]}) if st2 == 201 else (st2, rows)
    check(st == 201 and res.get("ok"), "POST /api/tables -> 201")
    tid = res["id"]
    st, res = A.call("GET", "/api/tables", auth=False)
    check(any(t["id"] == tid and t["seated"] == 0 for t in res["tables"]), "GET /api/tables lists the table with seated=0")

    print("== 5. sit")
    st, res = A.call("POST", f"/api/table/{tid}/sit", {"seat": 0, "buyin": 999})
    check(st == 400 and res["error"] == "BUYIN_RANGE", "buyin below min -> 400 BUYIN_RANGE")
    st, res = A.call("POST", f"/api/table/{tid}/sit", {"seat": 0, "buyin": 10000})
    check(st == 200, "A sits seat 0 with 10000")
    st, res = B.call("POST", f"/api/table/{tid}/sit", {"seat": 0, "buyin": 10000})
    check(st == 400 and res["error"] == "SEAT_TAKEN", "B on seat 0 -> 400 SEAT_TAKEN")
    st, res = B.call("POST", f"/api/table/{tid}/sit", {"seat": 2, "buyin": 10000})
    check(st == 200, "B sits seat 2 with 10000")
    st, res = B.call("POST", f"/api/table/{tid}/sit", {"seat": 3, "buyin": 10000})
    check(st == 400 and res["error"] == "ALREADY_SEATED", "B again -> 400 ALREADY_SEATED")

    print("== 6. tick starts the hand")
    st, res = A.call("POST", f"/api/table/{tid}/tick")
    check(st == 200, "tick ok")
    st, sa = A.call("GET", f"/api/table/{tid}/state", quiet=True)
    s = sa["state"]
    check(s is not None and s["street"] == "preflop", "hand started: street preflop")
    check(sa["table"].get("state") is None and "state" not in sa["table"], "table public cols carry no state")
    check(s["deck"] == [] and s["seed"] == "" and len(s.get("seedHash", "")) == 64, "publicView: no deck, no seed, seedHash present")
    check(len(sa["me"]["hole"]) == 2, "A sees own 2 hole cards")
    st, sb_ = B.call("GET", f"/api/table/{tid}/state", quiet=True)
    other = [p for p in sb_["state"]["players"] if p["playerId"] == ids[0]][0]
    check(other["hole"] == [], "B does not see A's hole cards")
    st, an = A.call("GET", f"/api/table/{tid}/state", auth=False, quiet=True)
    check(st == 200 and an["state"] is not None, "anon GET state -> 200 (spectator)")
    check(all(p["hole"] == [] for p in an["state"]["players"]) and an["me"]["seat"] is None and an["me"]["hole"] == [] and an["legal"] is None,
          "anon sees no hole cards at all, me.seat null, legal null")
    check(an["state"]["deck"] == [] and an["state"]["seed"] == "", "anon: no deck, no seed")
    st, res = A.call("POST", f"/api/table/{tid}/sit", {"seat": 1, "buyin": 2000})
    check(st == 400 and res["error"] == "BUYIN_RANGE", "buyin below the 40 bb table min -> 400 BUYIN_RANGE")
    st, res = A.call("POST", f"/api/table/{tid}/tick", auth=False)
    check(st == 401, "anon tick -> 401")
    print(f"  hand {s['handId']} no={s['handNo']} button={s['button']} sb={s['sbSeat']} bb={s['bbSeat']} toAct={s['toAct']} version={sa['version']}")

    print("== 7. error paths")
    to_act = s["toAct"]
    actor_id = [p["playerId"] for p in s["players"] if p["seat"] == to_act][0]
    wrong = B if actor_id == ids[0] else A
    right = players[actor_id]
    st, res = wrong.call("POST", f"/api/table/{tid}/action", {"action": "fold", "version": sa["version"]})
    check(st == 403 and res["error"] == "NOT_YOUR_TURN", "wrong player -> 403 NOT_YOUR_TURN")
    st, res = right.call("POST", f"/api/table/{tid}/action", {"action": "call", "version": sa["version"] + 7})
    check(st == 409 and res["error"] == "VERSION_CONFLICT", "stale version -> 409 VERSION_CONFLICT")
    st, res = right.call("POST", f"/api/table/{tid}/action", {"action": "bet", "amount": 1, "version": sa["version"]})
    check(st == 400 and res["error"] == "ILLEGAL_ACTION", "bet facing the blind -> 400 ILLEGAL_ACTION")

    def play_hand(label, fold_street):
        print(f"== {label}")
        for step in range(40):
            st, sv = right.call("GET", f"/api/table/{tid}/state", quiet=True)
            s = sv["state"]
            if s is None or s["street"] == "ended":
                return sv
            actor_id = [p["playerId"] for p in s["players"] if p["seat"] == s["toAct"]][0]
            api = players[actor_id]
            st, mine = api.call("GET", f"/api/table/{tid}/state", quiet=True)
            legal = mine["legal"]
            check(legal is not None and legal["seat"] == mine["me"]["seat"], f"legal actions present for {api.name} (street {s['street']})")
            if s["street"] == fold_street:
                action = "fold"
            elif legal["check"]:
                action = "check"
            else:
                action = "call"
            st, res = api.call("POST", f"/api/table/{tid}/action", {"action": action, "version": mine["version"]})
            check(st == 200, f"{api.name} {action} on {s['street']} (version {mine['version']}) -> 200")
            if st != 200:
                return mine
        return None

    sv = play_hand("8. play: call/check, fold on the turn", "turn")
    s = sv["state"]
    check(s["street"] == "ended" and s["result"] is not None, "street ended with result")
    check(s["seed"] == "" and len(s.get("seedHash", "")) == 64, "ended hand: seed still hidden, seedHash published (F1)")
    r = s["result"]
    print(f"  board={s['board']} pots={s['pots']} rake={r['rake']} winners={r['winners']} stacks={r['stacks']}")
    check(sum(w["amount"] for w in r["winners"]) + r["rake"] == sum(p["amount"] for p in s["pots"]), "winners + rake == pots")
    check(sum(x["stack"] for x in r["stacks"]) + r["rake"] == 20000, "stacks + rake == 20000 (chips conserved)")
    hand1 = s["handId"]

    print("== 9. settlement rows")
    hands = supa.rest(f"hands?id=eq.{hand1}&select=id,hand_no,ended_at,pot_cents,rake_cents,seed_hash,board")
    check(len(hands) == 1 and hands[0]["ended_at"] is not None, "hands row exists with ended_at")
    check(hands[0]["seed_hash"] == s["seedHash"], "hands.seed_hash == state.seedHash")
    acts = supa.rest(f"actions?hand_id=eq.{hand1}&select=seat,street,action,amount_cents&order=id")
    print(f"  actions: {acts}")
    check(len(acts) == len([e for e in s['log'] if e['kind'] == 'action']), "one actions row per action event")
    seats = supa.rest(f"seats?table_id=eq.{tid}&status=neq.left&select=seat,user_id,stack_cents,status")
    check(sorted(x["stack_cents"] for x in seats) == sorted(x["stack"] for x in r["stacks"]), "seats.stack_cents == result.stacks")
    rake_rows = supa.rest(f"ledger?hand_id=eq.{hand1}&kind=eq.rake&select=user_id,amount_cents")
    check((r["rake"] == 0 and rake_rows == []) or (len(rake_rows) == 1 and rake_rows[0]["user_id"] == HOUSE and rake_rows[0]["amount_cents"] == r["rake"]), f"rake ledger row for the house == {r['rake']}")

    print("== 10. next hand auto-starts after 3 s")
    time.sleep(3.2)
    st, res = B.call("POST", f"/api/table/{tid}/tick")
    st, sv = A.call("GET", f"/api/table/{tid}/state", quiet=True)
    s = sv["state"]
    check(s is not None and s["street"] == "preflop" and s["handNo"] == 2, "hand 2 started (preflop)")
    check(s["handId"] != hand1, "new handId")
    sv = play_hand("11. hand 2: first to act folds (uncontested, no flop)", "preflop")
    s = sv["state"]
    check(s["street"] == "ended" and s["result"]["shown"] == [], "hand 2 ended uncontested, shown=[]")
    print(f"  rake={s['result']['rake']} (no flop no drop) stacks={s['result']['stacks']}")

    print("== 12. leave both (cashout)")
    for api in (A, B):
        st, res = api.call("POST", f"/api/table/{tid}/leave")
        check(st == 200 and res.get("pending") is False, f"{api.name} leaves now (cashout)")
    seats = supa.rest(f"seats?table_id=eq.{tid}&select=seat,status,stack_cents")
    check(all(x["status"] == "left" and x["stack_cents"] == 0 for x in seats), "all seats left with stack 0")
    st, res = A.call("POST", f"/api/table/{tid}/leave")
    check(st == 400 and res["error"] == "NOT_SEATED", "leave again -> 400 NOT_SEATED")

    print("== 13. ledger invariants (PostgREST, service role)")
    ledger = supa.rest("ledger?select=user_id,kind,amount_cents,table_id")
    balances = supa.rest("balances?select=user_id,balance_cents")
    seats_all = supa.rest("seats?status=neq.left&select=table_id,stack_cents")
    sum_bal = sum(b["balance_cents"] for b in balances)
    sum_stacks = sum(x["stack_cents"] for x in seats_all)
    sum_credits = sum(l["amount_cents"] for l in ledger if l["kind"] == "credit_test")
    sum_rake = sum(l["amount_cents"] for l in ledger if l["kind"] == "rake")
    print(f"  GLOBAL: sum(balances incl. house)={sum_bal} + sum(active stacks)={sum_stacks} = {sum_bal + sum_stacks} ; sum(credit_test)={sum_credits} ; house rake total={sum_rake}")
    check(sum_bal + sum_stacks == sum_credits, "GLOBAL: balances + stacks == credits")
    t_led = [l for l in ledger if l["table_id"] == tid]
    buyins = -sum(l["amount_cents"] for l in t_led if l["kind"] == "buyin")
    cashouts = sum(l["amount_cents"] for l in t_led if l["kind"] == "cashout")
    rake_t = sum(l["amount_cents"] for l in t_led if l["kind"] == "rake")
    stacks_t = sum(x["stack_cents"] for x in seats_all if x["table_id"] == tid)
    print(f"  TABLE {tid}: buyins={buyins} == cashouts={cashouts} + rake={rake_t} + stacks={stacks_t} = {cashouts + rake_t + stacks_t}")
    check(buyins == cashouts + rake_t + stacks_t, "TABLE: buyins == cashouts + rake + stacks")
    for api, uid in ((A, ids[0]), (B, ids[1])):
        st, me = api.call("GET", "/api/me", quiet=True)
        print(f"  {api.name} balance before={credits_before[uid]} after={me['balance']} delta={me['balance'] - credits_before[uid]}")
    check(sum(http("GET", base + "/api/me", headers=p.h)[1]["balance"] for p in (A, B)) == sum(credits_before.values()) - rake_t,
          "A+B balances == before - table rake")

    print("== RESULT:", "PASS" if not FAILS else f"FAIL ({len(FAILS)}): " + "; ".join(FAILS))
    sys.exit(0 if not FAILS else 1)


if __name__ == "__main__":
    main()
