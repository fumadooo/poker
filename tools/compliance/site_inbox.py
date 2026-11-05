# -*- coding: utf-8 -*-
"""Caixa do canal do site (bo-2iobkcvnv5nr.vercel.app/contato): lista mensagens não encerradas em run/site_inbox.md.
Agendada de hora em hora ("POKER Site Inbox"). Denúncias primeiro. python -I tools/compliance/site_inbox.py"""
import os, sys, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as C
rows = C.db().query("select protocol, kind, anonymous, name, email, phone, message, status, created_at from public.site_messages "
                    "where status <> 'encerrado' order by (kind='denuncia') desc, created_at")
out = [f"# Canal do site — {len(rows)} mensagem(ns) aberta(s) · gerado {dt.datetime.now():%d/%m/%Y %H:%M}", ""]
for r in rows:
    who = "ANÔNIMO" if r["anonymous"] else f"{r['name'] or '-'} · {r['email'] or '-'} · {r['phone'] or '-'}"
    out += [f"## {r['protocol']} · {r['kind'].upper()} · {r['status']} · {str(r['created_at'])[:16]}", who, "", r["message"], ""]
out.append("Encerrar: python -I tools/migrate.py --sql \"update public.site_messages set status='encerrado', answered_at=now() where protocol='BO-...'\"")
open(os.path.join(C.ROOT, "run", "site_inbox.md"), "w", encoding="utf-8").write("\n".join(out))
if sys.stdout: sys.stdout.reconfigure(encoding="utf-8"); print(out[0])
