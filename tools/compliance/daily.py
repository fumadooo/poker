# -*- coding: utf-8 -*-
"""Rotina diária de compliance (BO-POL-01 item 7 / 9): atualiza as listas públicas e refaz o screening de toda a base KYC.
Agendada no Windows (tarefa "POKER Compliance Diario", 06:00). Log em run/compliance_daily.log.
    python -I tools/compliance/daily.py
"""
import os, sys, subprocess, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import common as C, screening as S
ROOT = C.ROOT; LOG = os.path.join(ROOT, "run", "compliance_daily.log")

def log(m):
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {m}"
    open(LOG, "a", encoding="utf-8").write(line + "\n")

def main():
    flags = 0x08000000 if os.name == "nt" else 0
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "lists.py")], capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=flags)
    log(f"listas rc={r.returncode} " + (r.stdout or r.stderr).strip().splitlines()[-1:][0] if (r.stdout or r.stderr).strip() else f"listas rc={r.returncode}")
    S._DATA = None
    rows = C.db().query("select user_id, full_name, birth_date from public.kyc_profiles where status <> 'encerrado' and full_name is not null")
    n = hits = 0
    for row in rows:
        res = S.screen(row["full_name"], None, str(row["birth_date"]) if row.get("birth_date") else None)
        S.save(res, None, row["user_id"], actor="tools/compliance/daily.py"); n += 1
        hits += res["decision"] != "clear"
    log(f"screening base: {n} perfis, {hits} com resultado para análise")

if __name__ == "__main__":
    try: main()
    except Exception as e: log(f"ERRO {type(e).__name__}: {e}"); raise
