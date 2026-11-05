#!/usr/bin/env python3
"""migrate.py — apply supabase/migrations/*.sql to the Supabase project via the Management API.

Stdlib only. Reads .env at the project root (SUPABASE_PAT, SUPABASE_PROJECT_REF).

  python tools/migrate.py            apply every pending migration (sorted by file name)
  python tools/migrate.py --status   list applied vs pending
  python tools/migrate.py --sql "select 1"   run an ad-hoc query, print JSON rows

Each migration is sent as ONE request to POST /v1/projects/{ref}/database/query and, on success,
its file name is inserted into public.schema_migrations. The table is created first if missing.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(ROOT, "supabase", "migrations")
ENV_PATH = os.path.join(ROOT, ".env")
API = "https://api.supabase.com/v1/projects/{ref}/database/query"

SCHEMA_MIGRATIONS_DDL = """
create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
"""


def load_env(path=ENV_PATH):
    env = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("SUPABASE_PAT", "SUPABASE_PROJECT_REF"):
        env.setdefault(k, os.environ.get(k, ""))
    return env


class Db:
    def __init__(self, ref, pat):
        if not ref or not pat:
            sys.exit("missing SUPABASE_PROJECT_REF / SUPABASE_PAT in .env")
        self.url = API.format(ref=ref)
        self.pat = pat

    def query(self, sql):
        body = json.dumps({"query": sql}).encode("utf-8")
        req = urllib.request.Request(
            self.url,
            data=body,
            method="POST",
            headers={
                "Authorization": "Bearer " + self.pat,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            raise RuntimeError(f"HTTP {e.code} from Management API: {raw[:2000]}") from None
        return json.loads(raw) if raw else []


def sql_lit(s):
    return "'" + s.replace("'", "''") + "'"


def list_files():
    if not os.path.isdir(MIGRATIONS_DIR):
        return []
    return sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))


def applied_set(db):
    db.query(SCHEMA_MIGRATIONS_DDL)
    rows = db.query("select name, applied_at from public.schema_migrations order by name")
    return {r["name"]: r["applied_at"] for r in rows}


def cmd_status(db):
    applied = applied_set(db)
    files = list_files()
    for f in files:
        mark = "applied " + applied[f] if f in applied else "pending"
        print(f"{f:40s} {mark}")
    orphans = sorted(set(applied) - set(files))
    for o in orphans:
        print(f"{o:40s} applied {applied[o]} (file missing locally)")
    pending = [f for f in files if f not in applied]
    print(f"-- {len(applied)} applied, {len(pending)} pending")
    return 0


def cmd_apply(db):
    applied = applied_set(db)
    pending = [f for f in list_files() if f not in applied]
    if not pending:
        print("nothing to apply (all migrations already in schema_migrations)")
        return 0
    for f in pending:
        path = os.path.join(MIGRATIONS_DIR, f)
        with open(path, encoding="utf-8") as fh:
            sql = fh.read()
        print(f"applying {f} ({len(sql)} bytes) ...", flush=True)
        db.query(sql)
        db.query(
            "insert into public.schema_migrations (name) values ("
            + sql_lit(f)
            + ") on conflict (name) do nothing"
        )
        print(f"applied  {f}")
    return 0


def cmd_sql(db, sql):
    rows = db.query(sql)
    print(json.dumps(rows, indent=2, ensure_ascii=False, default=str))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--status", action="store_true", help="list applied vs pending migrations")
    ap.add_argument("--sql", metavar="QUERY", help="run an ad-hoc SQL query and print JSON rows")
    args = ap.parse_args()

    env = load_env()
    db = Db(env.get("SUPABASE_PROJECT_REF"), env.get("SUPABASE_PAT"))
    try:
        if args.sql:
            return cmd_sql(db, args.sql)
        if args.status:
            return cmd_status(db)
        return cmd_apply(db)
    except RuntimeError as e:
        print("ERROR:", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
