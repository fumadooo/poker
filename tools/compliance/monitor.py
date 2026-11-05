#!/usr/bin/env python3
"""monitor.py — motor de regras de PLD/FTP da BLACK OPS LTDA (BO-POL-01_PLD-FTP.md, item 9).

Roda sobre as tabelas do POKER e grava alertas em aml_alerts, sem duplicar (dedupe_key único). Alerta é hipótese
com números para o Diretor de Compliance analisar, nunca veredito. IDs de regra, gatilhos, severidades e efeitos
automáticos são os da política; os números estão em PARAMS, logo abaixo. Prazo de análise (item 10.1): calculado
no banco por public.aml_due_at(severidade): crítica imediato, alta 5 dias úteis, média 15 dias úteis, baixa 30 dias,
teto 45 dias.

Regras (item 9.2 e 9.3): P01 P02 P03a P03b P03c P04 P05 P06 P07 P08 P09 AF01 AF02 G01 G02 G03.
  C01/C02 (reembolso/chargeback e compra de Cursos): fora de escopo. A venda de cursos tem meio de pagamento
  próprio, fora da conta Trio, que é exclusiva do Poker. Removidas dos parâmetros, da execução e do selftest.
  G01/G02 nascem no banco, na hora do screening (trigger public.screening_effects, BO-POL-01 itens 7.2/7.3/6.4.4);
  aqui só são contados. Efeitos automáticos de retenção viram flags no alerta (hold_withdrawals / hold_deposits /
  hold_play) e a trigger public.ledger_kyc_limits recusa o movimento enquanto o alerta estiver aberto.

Fontes de dado. Existem hoje: public.ledger, public.hands (+ tables), public.kyc_profiles,
public.payout_destinations, public.payout_rejections, auth.sessions (IP). Ainda não existem (contrato esperado; a
regra fica pronta e, na produção, sai com status "sem fonte de dado ainda"):
  client_sessions(user_id uuid, created_at timestamptz, ip inet, device_id text, country text, is_vpn boolean,
                  table_id uuid null, real_money boolean)                                    P03a P03b(mesa) P08 P09 AF01
  pix_in(user_id uuid, created_at timestamptz, amount_cents bigint, payer_doc_hash text, payer_account text)  P03c P07
  affiliate_referrals(affiliate_user_id uuid, referred_user_id uuid, created_at timestamptz)          AF01
  affiliate_commissions(affiliate_user_id uuid, month date, commission_cents bigint, sales_cents bigint,
                        refunded_cents bigint)                                                      AF02
Hoje o POKER só tem fichas de teste: 'credit_test' é crédito de teste e 'cashout' é a volta da mesa para a carteira
(não é saque). Depósito e saque reais são os kinds 'deposit' / 'withdrawal' (0 linhas até o Pix existir).

  python tools/compliance/monitor.py --once [--dry-run]      roda as regras na produção e grava os alertas
  python tools/compliance/monitor.py --report [--out f.md]   markdown com os alertas abertos e o SLA
  python tools/compliance/monitor.py --selftest [--keep]     cenário sintético em schema c1test_* (apagado no fim)
                                                              + testes de banco (G01/G02, limites, append-only)
                                                              em transação desfeita
"""
import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import uuid
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

HOUSE = "00000000-0000-0000-0000-000000000001"
BRT = dt.timezone(dt.timedelta(hours=-3))

# ----------------------------------------------------------------------------------------------------------------
# Parâmetros = BO-POL-01 item 9 (valores em centavos). Mudar aqui exige aprovação do Comitê (item 9.5).
# ----------------------------------------------------------------------------------------------------------------
PARAMS = {
    "lookback_days": 120,
    "high_risk_factor": 0.5,             # 9.4: cliente de alto risco -> gatilhos de valor e quantidade de P01, P04,
    "high_risk_rules": ["P01", "P04", "P05", "AF02"],   # P05 e AF02 caem pela metade
    "session_gap_min": 30,               # mãos da mesma mesa com intervalo > 30 min = sessões diferentes
    "P01": {"min_withdraw": 20_000, "high_withdraw": 200_000, "window_h": 72, "turnover_mult": 1.0},
    "P02": {"window_days": 7, "min_net": 50_000, "share_of_losses": 0.60, "min_common_sessions": 3},
    "P03a": {"min_accounts": 2},
    "P03b": {"min_accounts": 3, "window_days": 30, "same_table_min_accounts": 2},
    "P03c": {"min_accounts": 2},
    "P04": {"a_count": 4, "a_hours": 24, "a_sum": 100_000,
            "b_bands": [200_000, 500_000, 1_000_000], "b_low": 0.90, "b_high": 0.9999, "b_count": 2, "b_days": 7,
            "c_low": 0.90, "c_high": 1.00, "c_months": 2},
    "P05": {"mult_vs_avg": 3.0, "min_sum": 300_000, "window_days": 30, "avg_months": 3,
            "renda_medium": 0.50, "renda_high": 1.00},
    "P06": {"window_days": 30, "high_count": 2},
    "P07": {"window_days": 30, "high_count": 2},
    "P08": {"window_days": 30, "min_common_sessions": 10, "min_share": 0.50, "raise_ratio_max": 1 / 3},
    "P09": {"window_days": 30, "medium_count": 3},
    "AF02": {"mult_vs_avg": 3.0, "min_sum": 500_000, "avg_months": 3, "refund_rate": 0.15},
    "kyc_month_limit": {0: 0, 1: 200_000, 2: 1_000_000, 3: 5_000_000},  # BO-POL-02 7.1 (nível 3: menor entre isso e a renda)
}

RULES_DOC = {
    "P01": ("Depósito seguido de saque sem jogo", "Saque retido até a análise"),
    "P02": ("Chip dumping", "Saques de A e de B retidos"),
    "P03a": ("Várias contas no mesmo dispositivo", "Saques de todas as contas retidos"),
    "P03b": ("Várias contas no mesmo IP", "Na mesma mesa: saques retidos"),
    "P03c": ("Mesma chave ou conta Pix", "Saques retidos"),
    "P04": ("Fracionamento (structuring)", "Vai para análise"),
    "P05": ("Volume incompatível com o perfil", "Alta: novos depósitos bloqueados até a análise"),
    "P06": ("Saque para conta de terceiro", "Saque rejeitado (trigger payout_destination_guard)"),
    "P07": ("Depósito por terceiro", "Valor não creditado e devolvido ao pagador"),
    "P08": ("Conluio em mesa", "Alta: saques retidos"),
    "P09": ("Acesso de fora do Brasil ou por VPN/proxy", "Sessão de dinheiro real recusada"),
    "AF01": ("Auto-indicação de Afiliado", "Comissão da venda retida"),
    "AF02": ("Comissão atípica", "Lote do Afiliado retido até a análise"),
    "G01": ("Lista ONU/CSNU confirmada", "Bloqueio imediato + indisponibilidade (trigger screening_effects)"),
    "G02": ("Correspondência possível ou PEP não declarado", "Bloqueio preventivo (trigger screening_effects)"),
    "G03": ("Indício de menor de idade", "Conta suspensa"),
}
SEV_PT = {"critical": "crítica", "high": "alta", "medium": "média", "low": "baixa"}
NO_SOURCE = "sem fonte de dado ainda"


def i(v):
    return int(v) if v is not None else 0


def jl(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return None
    return v


def ts(s):
    if isinstance(s, dt.datetime):
        return s
    s = str(s).replace(" ", "T")
    s = re.sub(r"([+-]\d\d)$", r"\1:00", s)
    return dt.datetime.fromisoformat(s)


def brl(c):
    return "R$ " + f"{i(c) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


class Src:
    OPTIONAL = ["client_sessions", "pix_in", "affiliate_referrals", "affiliate_commissions"]

    def __init__(self, db, schema="public"):
        self.s = schema
        rows = db.query("select table_name from information_schema.tables where table_schema = " + C.lit(schema))
        self.present = {r["table_name"] for r in rows}

    def t(self, name):
        return f"{self.s}.{name}"

    def has(self, name):
        return name in self.present


# ----------------------------------------------------------------------------------------------------------------
# carga
# ----------------------------------------------------------------------------------------------------------------
def load(db, src, p=PARAMS, include_test_credits=False):
    since = f"now() - interval '{int(p['lookback_days'])} days'"
    kinds = ["deposit", "withdrawal", "buyin"] + (["credit_test"] if include_test_credits else [])
    d = {"src": src, "include_test_credits": include_test_credits}
    d["ledger"] = db.query(
        f"select id, user_id::text, kind, amount_cents, created_at, meta from {src.t('ledger')} "
        f"where kind in ({', '.join(C.lit(k) for k in kinds)}) and user_id <> '{HOUSE}' and created_at >= {since} "
        f"order by created_at, id")
    for r in d["ledger"]:
        r["at"] = ts(r["created_at"])
        r["amt"] = i(r["amount_cents"])
        r["dep"] = (r["kind"] == "deposit" or (include_test_credits and r["kind"] == "credit_test")) and r["amt"] > 0
        r["wd"] = r["kind"] == "withdrawal" and r["amt"] < 0
    hands = db.query(
        f"""select h.id::text, h.table_id::text, h.started_at, t.bb_cents,
                   h.log -> 0 -> 'data' -> 'seats' as seats, h.result -> 'stacks' as stacks,
                   h.result -> 'winners' as winners,
                   (select coalesce(jsonb_agg(jsonb_build_array(e -> 'seat', e ->> 'action')), '[]'::jsonb)
                      from jsonb_array_elements(h.log) e where e ->> 'kind' = 'action') as acts
              from {src.t('hands')} h join {src.t('tables')} t on t.id = h.table_id
             where h.result is not null and h.log -> 0 ->> 'kind' = 'start' and h.started_at >= {since}
             order by h.started_at""")
    d["hands"] = [parse_hand(h) for h in hands]
    assign_sessions(d["hands"], p["session_gap_min"])
    d["kyc"] = {r["user_id"]: r for r in db.query(
        f"select user_id::text, level, status, risk_level, cpf_hash, renda_mensal_cents, birth_date, "
        f"bureau_birth_date, liveness_resultado, minor_report from {src.t('kyc_profiles')}")}
    d["pix_dest"] = db.query(f"select user_id::text, chave from {src.t('payout_destinations')}")
    d["rejections"] = db.query(f"select id, user_id::text, created_at, reason from {src.t('payout_rejections')}")
    # IP: auth.sessions na produção (sem mesa/dispositivo); client_sessions quando existir
    d["ipsess"] = []
    if src.s == "public":
        d["ipsess"] = [dict(r, table_id=None) for r in db.query(
            "select user_id::text, host(ip) ip, created_at from auth.sessions where user_id is not null and ip is not null")]
    d["client_sessions"] = None
    if src.has("client_sessions"):
        d["client_sessions"] = db.query(
            f"select user_id::text, created_at, host(ip) ip, device_id, country, is_vpn, table_id::text, real_money "
            f"from {src.t('client_sessions')}")
        d["ipsess"] += [r for r in d["client_sessions"] if r["ip"]]
    d["pix_in"] = db.query(f"select user_id::text, created_at, amount_cents, payer_doc_hash, payer_account from {src.t('pix_in')}") \
        if src.has("pix_in") else None
    d["aff_ref"] = db.query(f"select affiliate_user_id::text, referred_user_id::text from {src.t('affiliate_referrals')}") \
        if src.has("affiliate_referrals") else None
    d["aff_com"] = db.query(f"select affiliate_user_id::text, month, commission_cents, sales_cents, refunded_cents "
                            f"from {src.t('affiliate_commissions')}") if src.has("affiliate_commissions") else None
    g = db.query(f"select rule, count(*) n from {src.t('aml_alerts')} where rule in ('G01', 'G01-OFAC', 'G02') group by 1")
    d["g_counts"] = {r["rule"]: i(r["n"]) for r in g}
    return d


def parse_hand(h):
    seats = jl(h["seats"]) or []
    stacks = {i(x["seat"]): i(x["stack"]) for x in (jl(h["stacks"]) or [])}
    won = defaultdict(int)
    for w in jl(h["winners"]) or []:
        won[i(w["seat"])] += i(w.get("amount"))
    acts = defaultdict(lambda: [0, 0, False])   # seat -> [n ações, n agressivas, foldou]
    for seat, action in jl(h["acts"]) or []:
        if seat is None:
            continue
        a = acts[i(seat)]
        a[0] += 1
        a[1] += action in ("bet", "raise", "allin")
        a[2] = a[2] or action == "fold"
    pl = {}
    for s in seats:
        seat, start = i(s["seat"]), i(s["stack"])
        end = stacks.get(seat, start)
        net = end - start
        pl[s["playerId"]] = {"seat": seat, "net": net, "contrib": max(0, won[seat] - net),
                             "n_act": acts[seat][0], "n_aggr": acts[seat][1], "folded": acts[seat][2]}
    return {"id": h["id"], "table": h["table_id"], "at": ts(h["started_at"]), "bb": max(1, i(h["bb_cents"])),
            "players": pl}


def assign_sessions(hands, gap_min):
    last = {}
    for h in sorted(hands, key=lambda x: x["at"]):
        prev = last.get(h["table"])
        if prev is None or (h["at"] - prev[0]).total_seconds() > gap_min * 60:
            sid = f"{h['table']}#{h['at'].isoformat()}"
        else:
            sid = prev[1]
        h["session"] = sid
        last[h["table"]] = (h["at"], sid)


# ----------------------------------------------------------------------------------------------------------------
# helpers de regra
# ----------------------------------------------------------------------------------------------------------------
def A(rule, severity, user_id, key, data, related=(), hold_w=False, hold_d=False, hold_p=False):
    return {"rule": rule, "severity": severity, "user_id": user_id, "dedupe_key": rule + "|" + key, "data": data,
            "related_users": sorted(set(x for x in related if x and x != user_id)),
            "hold_withdrawals": hold_w, "hold_deposits": hold_d, "hold_play": hold_p}


def factor(d, p, user, rule):
    k = d["kyc"].get(user)
    if k and k["risk_level"] == "alto" and rule in p["high_risk_rules"]:
        return p["high_risk_factor"]
    return 1.0


def halve_count(n, f):
    return max(1, math.ceil(n * f))


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def month_key(t):
    t = t.astimezone(BRT)
    return t.year * 12 + t.month - 1


# ----------------------------------------------------------------------------------------------------------------
# regras
# ----------------------------------------------------------------------------------------------------------------
def P01(d, p):
    q = p["P01"]
    if not any(r["dep"] for r in d["ledger"]) and not any(r["wd"] for r in d["ledger"]):
        return [], f"{NO_SOURCE}: 0 depósitos/saques reais no ledger (Pix não integrado)"
    out = []
    by_user = defaultdict(list)
    for r in d["ledger"]:
        by_user[r["user_id"]].append(r)
    contrib = defaultdict(list)
    for h in d["hands"]:
        for u, x in h["players"].items():
            contrib[u].append((h["at"], x["contrib"]))
    for u, rows in by_user.items():
        f = factor(d, p, u, "P01")
        for w in (r for r in rows if r["wd"]):
            deps = [r for r in rows if r["dep"] and r["at"] <= w["at"]]
            if not deps:
                continue
            dep = deps[-1]
            W = -w["amt"]
            if (w["at"] - dep["at"]).total_seconds() > q["window_h"] * 3600 or W < q["min_withdraw"] * f:
                continue
            buyins = sum(-r["amt"] for r in rows if r["kind"] == "buyin" and dep["at"] <= r["at"] <= w["at"])
            bets = sum(c for at, c in contrib[u] if dep["at"] <= at <= w["at"])
            vol = buyins + bets
            if vol < q["turnover_mult"] * dep["amt"]:
                out.append(A("P01", "high" if W >= q["high_withdraw"] * f else "medium", u, f"{u}|wd{w['id']}",
                             {"deposito_cents": dep["amt"], "deposito_em": str(dep["created_at"]), "saque_cents": W,
                              "saque_em": str(w["created_at"]), "horas_entre": round((w["at"] - dep["at"]).total_seconds() / 3600, 1),
                              "volume_apostado_cents": vol, "buyins_cents": buyins, "apostas_cents": bets,
                              "volume_sobre_deposito": round(vol / dep["amt"], 3), "fator_alto_risco": f},
                             hold_w=True))
    return out, "ok"


def P02(d, p):
    q = p["P02"]
    if not d["hands"]:
        return [], "ok (0 mãos na janela)"
    end = max(h["at"] for h in d["hands"])
    t0 = end - dt.timedelta(days=q["window_days"])
    flow = defaultdict(int)
    losses = defaultdict(int)
    sess = defaultdict(set)
    big_folds = defaultdict(int)
    hands_pair = defaultdict(int)
    for h in d["hands"]:
        if h["at"] < t0:
            continue
        pl = h["players"]
        for u in pl:
            sess[u].add(h["session"])
        pos = {u: x["net"] for u, x in pl.items() if x["net"] > 0}
        tot = sum(pos.values())
        us = sorted(pl)
        for a_ in range(len(us)):
            for b_ in range(a_ + 1, len(us)):
                hands_pair[(us[a_], us[b_])] += 1
        for u, x in pl.items():
            if x["net"] < 0:
                losses[u] += -x["net"]
                for w, wn in pos.items():
                    flow[(u, w)] += round(-x["net"] * wn / tot)
                    if x["folded"] and x["contrib"] >= 10 * h["bb"]:
                        big_folds[(u, w)] += 1
    out = []
    for (a, b), f_ab in flow.items():
        net = f_ab - flow.get((b, a), 0)
        if net <= 0 or losses[a] == 0:
            continue
        common = len(sess[a] & sess[b])
        share = net / losses[a]
        if net >= q["min_net"] and share >= q["share_of_losses"] and common >= q["min_common_sessions"]:
            out.append(A("P02", "high", b, f"{a}>{b}|{end.strftime('%G-W%V')}",
                         {"conta_a_perdedora": a, "conta_b_ganhadora": b, "ganho_liquido_b_cents": net,
                          "perdas_totais_a_cents": losses[a], "fracao_das_perdas": round(share, 3),
                          "sessoes_em_comum": common, "maos_juntos": hands_pair[tuple(sorted((a, b)))],
                          "folds_de_a_apos_10bb": big_folds[(a, b)], "janela_dias": q["window_days"]},
                         related=[a], hold_w=True))
    return out, "ok"


def P03a(d, p):
    if d["client_sessions"] is None:
        return [], f"{NO_SOURCE}: o app não coleta impressão digital de dispositivo (client_sessions não existe)"
    g = defaultdict(set)
    for s in d["client_sessions"]:
        if s["device_id"]:
            g[s["device_id"]].add(s["user_id"])
    out = []
    for dev, us in g.items():
        if len(us) >= p["P03a"]["min_accounts"]:
            us = sorted(us)
            out.append(A("P03a", "high", us[0], f"{dev}|{len(us)}", {"device_id": dev, "contas": us},
                         related=us, hold_w=True))
    return out, "ok"


def P03b(d, p):
    q = p["P03b"]
    t0 = now_utc() - dt.timedelta(days=q["window_days"])
    g = defaultdict(set)
    gt = defaultdict(set)
    for s in d["ipsess"]:
        if ts(s["created_at"]) >= t0:
            g[s["ip"]].add(s["user_id"])
            if s.get("table_id"):
                gt[(s["ip"], s["table_id"])].add(s["user_id"])
    out = []
    for ip, us in g.items():
        if len(us) >= q["min_accounts"]:
            us = sorted(us)
            out.append(A("P03b", "medium", us[0], f"ip|{ip}|{len(us)}",
                         {"ip": ip, "contas": us, "n_contas": len(us), "janela_dias": q["window_days"]}, related=us))
    for (ip, tb), us in gt.items():
        if len(us) >= q["same_table_min_accounts"]:
            us = sorted(us)
            out.append(A("P03b", "high", us[0], f"mesa|{ip}|{tb}|{len(us)}",
                         {"ip": ip, "mesa": tb, "contas": us, "efeito": "contas separadas e saques retidos"},
                         related=us, hold_w=True))
    st = f"ok: {len(d['ipsess'])} sessões com IP"
    if d["client_sessions"] is None:
        st += f" (auth.sessions); parte 'mesma mesa': {NO_SOURCE} (client_sessions não existe)"
    if not d["ipsess"]:
        st = f"{NO_SOURCE}: nenhuma sessão com IP"
    return out, st


def P03c(d, p):
    g = defaultdict(set)
    for x in d["pix_dest"]:
        g[("destino", x["chave"].strip().lower())].add(x["user_id"])
    for x in d["pix_in"] or []:
        if x["payer_account"]:
            g[("origem", x["payer_account"].strip().lower())].add(x["user_id"])
    out = []
    for (kind, val), us in g.items():
        if len(us) >= p["P03c"]["min_accounts"]:
            us = sorted(us)
            out.append(A("P03c", "high", us[0], f"{kind}|{val}|{len(us)}", {"tipo": kind, "chave_ou_conta": val, "contas": us},
                         related=us, hold_w=True))
    st = f"ok: {len(d['pix_dest'])} destino(s) de saque cadastrado(s)"
    if d["pix_in"] is None:
        st += f"; conta de origem: {NO_SOURCE} (pix_in não existe)"
    return out, st


def P04(d, p):
    q = p["P04"]
    deps = defaultdict(list)
    for r in d["ledger"]:
        if r["dep"]:
            deps[r["user_id"]].append(r)
    if not deps:
        return [], f"{NO_SOURCE}: 0 depósitos reais no ledger (Pix não integrado)"
    out = []
    for u, rows in deps.items():
        f = factor(d, p, u, "P04")
        # (a) 4+ depósitos em 24 h somando R$ 1.000+
        na, sa = halve_count(q["a_count"], f), q["a_sum"] * f
        j = 0
        for k in range(len(rows)):
            while (rows[k]["at"] - rows[j]["at"]).total_seconds() > q["a_hours"] * 3600:
                j += 1
            win = rows[j:k + 1]
            if len(win) >= na and sum(r["amt"] for r in win) >= sa:
                out.append(A("P04", "medium", u, f"a|{u}|{win[0]['id']}",
                             {"criterio": "a", "n_depositos": len(win), "total_cents": sum(r["amt"] for r in win),
                              "de": str(win[0]["created_at"]), "ate": str(win[-1]["created_at"]), "fator_alto_risco": f}))
                break
        # (b) 2+ depósitos em 7 dias entre 90% e 99,99% de uma faixa de controle
        nb = halve_count(q["b_count"], f)
        for band in q["b_bands"]:
            near = [r for r in rows if band * q["b_low"] <= r["amt"] <= band * q["b_high"]]
            j = 0
            for k in range(len(near)):
                while (near[k]["at"] - near[j]["at"]).days >= q["b_days"]:
                    j += 1
                win = near[j:k + 1]
                if len(win) >= nb:
                    out.append(A("P04", "medium", u, f"b|{u}|{band}|{win[0]['id']}",
                                 {"criterio": "b", "faixa_cents": band, "valores_cents": [r["amt"] for r in win],
                                  "de": str(win[0]["created_at"]), "ate": str(win[-1]["created_at"]), "fator_alto_risco": f}))
                    break
        # (c) total mensal entre 90% e 100% do limite do nível em 2 meses seguidos
        k = d["kyc"].get(u)
        if k:
            lim = p["kyc_month_limit"].get(i(k["level"]), 0)
            if i(k["level"]) == 3 and k["renda_mensal_cents"] is not None:
                lim = min(lim, i(k["renda_mensal_cents"]))
            if lim > 0:
                mon = defaultdict(int)
                for r in rows:
                    mon[month_key(r["at"])] += r["amt"]
                hits = sorted(m for m, v in mon.items() if q["c_low"] * lim <= v <= q["c_high"] * lim)
                for m in hits:
                    if all((m - x) in hits for x in range(q["c_months"])):
                        out.append(A("P04", "medium", u, f"c|{u}|{m}",
                                     {"criterio": "c", "limite_mensal_cents": lim,
                                      "meses": [f"{(m - x) // 12}-{(m - x) % 12 + 1:02d}" for x in range(q["c_months"])][::-1],
                                      "totais_cents": [mon[m - x] for x in range(q["c_months"])][::-1]}))
    return out, "ok"


def P05(d, p):
    q = p["P05"]
    now = now_utc()
    deps = defaultdict(list)
    for r in d["ledger"]:
        if r["dep"]:
            deps[r["user_id"]].append(r)
    if not deps:
        return [], f"{NO_SOURCE}: 0 depósitos reais no ledger (Pix não integrado)"
    out = []
    W = dt.timedelta(days=q["window_days"])
    for u, rows in deps.items():
        f = factor(d, p, u, "P05")
        d30 = sum(r["amt"] for r in rows if now - r["at"] <= W)
        prev = sum(r["amt"] for r in rows if W < now - r["at"] <= W * (1 + q["avg_months"]))
        avg = prev / q["avg_months"]
        if d30 > q["mult_vs_avg"] * avg and d30 >= q["min_sum"] * f:
            out.append(A("P05", "medium", u, f"media|{u}|{now.strftime('%Y-%m')}",
                         {"criterio": "media", "depositos_30d_cents": d30, "media_mensal_3m_cents": round(avg),
                          "fator_alto_risco": f}))
        k = d["kyc"].get(u)
        renda = i(k["renda_mensal_cents"]) if k and k["renda_mensal_cents"] is not None else None
        if renda:
            if d30 > q["renda_high"] * renda:
                out.append(A("P05", "high", u, f"renda100|{u}|{now.strftime('%Y-%m')}",
                             {"criterio": "renda>100%", "depositos_30d_cents": d30, "renda_mensal_cents": renda,
                              "efeito": "novos depósitos bloqueados até a análise"}, hold_d=True))
            elif d30 > q["renda_medium"] * renda:
                out.append(A("P05", "medium", u, f"renda50|{u}|{now.strftime('%Y-%m')}",
                             {"criterio": "renda>50%", "depositos_30d_cents": d30, "renda_mensal_cents": renda}))
    return out, "ok"


def P06(d, p):
    q = p["P06"]
    t0 = now_utc() - dt.timedelta(days=q["window_days"])
    g = defaultdict(list)
    for r in d["rejections"]:
        if ts(r["created_at"]) >= t0:
            g[r["user_id"]].append(r)
    out = []
    for u, rows in g.items():
        out.append(A("P06", "high" if len(rows) >= q["high_count"] else "medium", u, f"{u}|{max(i(r['id']) for r in rows)}",
                     {"tentativas_30d": len(rows), "motivos": sorted({r["reason"].split(":")[0] for r in rows}),
                      "efeito": "saque rejeitado e nunca executado"}))
    return out, f"ok: {len(d['rejections'])} tentativa(s) recusada(s) em payout_rejections"


def P07(d, p):
    if d["pix_in"] is None:
        return [], f"{NO_SOURCE}: Pix de entrada não integrado (pix_in não existe)"
    q = p["P07"]
    t0 = now_utc() - dt.timedelta(days=q["window_days"])
    g = defaultdict(list)
    for x in d["pix_in"]:
        k = d["kyc"].get(x["user_id"])
        if ts(x["created_at"]) >= t0 and x["payer_doc_hash"] and (not k or x["payer_doc_hash"] != k["cpf_hash"]):
            g[x["user_id"]].append(x)
    out = [A("P07", "high" if len(rows) >= q["high_count"] else "medium", u, f"{u}|{len(rows)}|{str(rows[-1]['created_at'])[:10]}",
             {"eventos_30d": len(rows), "total_cents": sum(i(x["amount_cents"]) for x in rows),
              "efeito": "valor não creditado e devolvido ao pagador"}) for u, rows in g.items()]
    return out, "ok"


def P08(d, p):
    q = p["P08"]
    t0 = now_utc() - dt.timedelta(days=q["window_days"])
    hs = [h for h in d["hands"] if h["at"] >= t0]
    sess = defaultdict(set)
    for h in hs:
        for u in h["players"]:
            sess[u].add(h["session"])
    users = sorted(sess)
    ipdev = defaultdict(set)
    for s in d["ipsess"]:
        ipdev[s["user_id"]].add(("ip", s["ip"]))
    for s in d["client_sessions"] or []:
        if s["device_id"]:
            ipdev[s["user_id"]].add(("dev", s["device_id"]))
    out = []
    for x in range(len(users)):
        for y in range(x + 1, len(users)):
            a, b = users[x], users[y]
            common = len(sess[a] & sess[b])
            if common < q["min_common_sessions"]:
                continue
            sa, sb = common / len(sess[a]), common / len(sess[b])
            if sa < q["min_share"] or sb < q["min_share"]:
                continue
            between = [0, 0]
            others = [0, 0]
            for h in hs:
                pl = h["players"]
                for me, other in ((a, b), (b, a)):
                    if me in pl and len(pl) >= 2:
                        acc = between if other in pl else others
                        acc[0] += pl[me]["n_aggr"]
                        acc[1] += pl[me]["n_act"]
            r_between = between[0] / between[1] if between[1] else None
            r_others = others[0] / others[1] if others[1] else None
            soft = r_between is not None and r_others and r_between < q["raise_ratio_max"] * r_others
            link = bool(ipdev[a] & ipdev[b])
            agr = soft or link
            out.append(A("P08", "high" if agr else "medium", a, f"{a}&{b}|{common // 10}",
                         {"conta_a": a, "conta_b": b, "sessoes_em_comum": common, "fracao_sessoes_a": round(sa, 3),
                          "fracao_sessoes_b": round(sb, 3),
                          "taxa_raise_entre_elas": None if r_between is None else round(r_between, 3),
                          "taxa_raise_contra_terceiros": None if r_others is None else round(r_others, 3),
                          "agravante_soft_play": bool(soft), "agravante_vinculo_ip_dispositivo": link},
                         related=[b], hold_w=agr))
    st = "ok"
    if d["client_sessions"] is None:
        st += f" (agravante por dispositivo/geolocalização: {NO_SOURCE}; IP de auth.sessions usado)"
    return out, st


def P09(d, p):
    if d["client_sessions"] is None:
        return [], f"{NO_SOURCE}: país/VPN da sessão não são coletados (client_sessions não existe)"
    q = p["P09"]
    t0 = now_utc() - dt.timedelta(days=q["window_days"])
    g = defaultdict(list)
    for s in d["client_sessions"]:
        if s["real_money"] and ts(s["created_at"]) >= t0 and ((s["country"] or "BR") != "BR" or s["is_vpn"]):
            g[s["user_id"]].append(s)
    return [A("P09", "medium" if len(rows) >= q["medium_count"] else "low", u, f"{u}|{len(rows)}|{now_utc().strftime('%Y-%m')}",
              {"sessoes_30d": len(rows), "paises": sorted({s["country"] or "?" for s in rows}),
               "vpn": sum(1 for s in rows if s["is_vpn"]), "efeito": "sessão de dinheiro real recusada"})
            for u, rows in g.items()], "ok"


# C01 e C02 (Cursos): fora de escopo; cursos usam meio de pagamento próprio, fora da conta Trio (BO-POL-01, item 2.2).


def AF01(d, p):
    if d["aff_ref"] is None:
        return [], f"{NO_SOURCE}: programa de Afiliados não registrado no banco (affiliate_referrals não existe)"
    ident = defaultdict(set)
    for u, k in d["kyc"].items():
        if k["cpf_hash"]:
            ident[u].add(("cpf", k["cpf_hash"]))
    for s in d["ipsess"]:
        ident[s["user_id"]].add(("ip", s["ip"]))
    for s in d["client_sessions"] or []:
        if s["device_id"]:
            ident[s["user_id"]].add(("dispositivo", s["device_id"]))
    for x in d["pix_dest"]:
        ident[x["user_id"]].add(("pix", x["chave"].strip().lower()))
    out = []
    for r in d["aff_ref"]:
        shared = ident[r["affiliate_user_id"]] & ident[r["referred_user_id"]]
        if shared:
            out.append(A("AF01", "high", r["affiliate_user_id"], f"{r['affiliate_user_id']}>{r['referred_user_id']}",
                         {"afiliado": r["affiliate_user_id"], "indicado": r["referred_user_id"],
                          "compartilha": sorted(t for t, _ in shared), "efeito": "comissão da venda retida"},
                         related=[r["referred_user_id"]]))
    return out, "ok"


def AF02(d, p):
    if d["aff_com"] is None:
        return [], f"{NO_SOURCE}: comissões de Afiliados não registradas no banco (affiliate_commissions não existe)"
    q = p["AF02"]
    by = defaultdict(dict)
    for r in d["aff_com"]:
        m = ts(str(r["month"]) + "T00:00:00+00:00")
        by[r["affiliate_user_id"]][m.year * 12 + m.month - 1] = r
    out = []
    for u, months in by.items():
        f = factor(d, p, u, "AF02")
        for m, r in months.items():
            prev = [i(months[m - k]["commission_cents"]) if (m - k) in months else 0 for k in range(1, q["avg_months"] + 1)]
            avg = sum(prev) / q["avg_months"]
            com = i(r["commission_cents"])
            lab = f"{m // 12}-{m % 12 + 1:02d}"
            if com > q["mult_vs_avg"] * avg and com >= q["min_sum"] * f:
                out.append(A("AF02", "medium", u, f"media|{u}|{lab}",
                             {"mes": lab, "comissao_cents": com, "media_3m_cents": round(avg), "efeito": "lote retido"}))
            sales = i(r["sales_cents"])
            if sales and i(r["refunded_cents"]) / sales > q["refund_rate"]:
                out.append(A("AF02", "medium", u, f"reembolso|{u}|{lab}",
                             {"mes": lab, "taxa_reembolso": round(i(r["refunded_cents"]) / sales, 3), "efeito": "lote retido"}))
    return out, "ok"


def G01(d, p):
    n = d["g_counts"].get("G01", 0) + d["g_counts"].get("G01-OFAC", 0)
    return [], f"ok: gerado pela trigger screening_effects no screening ({n} alerta(s) G01/G01-OFAC registrados)"


def G02(d, p):
    return [], f"ok: gerado pela trigger screening_effects no screening ({d['g_counts'].get('G02', 0)} alerta(s) G02 registrados)"


def G03(d, p):
    out = []
    today = dt.date.today()
    for u, k in d["kyc"].items():
        why = []
        bb = k["bureau_birth_date"]
        if bb:
            bbd = dt.date.fromisoformat(str(bb)[:10])
            if k["birth_date"] and str(k["birth_date"])[:10] != str(bb)[:10]:
                why.append("nascimento divergente no bureau")
            if (today.year - bbd.year - ((today.month, today.day) < (bbd.month, bbd.day))) < 18:
                why.append("bureau indica menor de 18")
        if k["liveness_resultado"] == "idade_incompativel":
            why.append("prova de vida incompatível com a idade")
        if k["minor_report"]:
            why.append("denúncia")
        if why:
            out.append(A("G03", "high", u, f"{u}|{'+'.join(sorted(why))}", {"indicios": why, "efeito": "conta suspensa"},
                         hold_w=True, hold_d=True, hold_p=True))
    st = f"ok: denúncia (minor_report) ativa; bureau e prova de vida: {NO_SOURCE} (não contratados)" \
        if not any(k["bureau_birth_date"] or k["liveness_resultado"] for k in d["kyc"].values()) else "ok"
    return out, st


RULES = [P01, P02, P03a, P03b, P03c, P04, P05, P06, P07, P08, P09, AF01, AF02, G01, G02, G03]


def run_rules(d, p=PARAMS):
    alerts, status = [], {}
    for fn in RULES:
        a, st = fn(d, p)
        alerts += a
        status[fn.__name__] = {"alertas": len(a), "status": st}
    return alerts, status


def save_alerts(db, src, alerts, actor="tools/compliance/monitor.py"):
    if not alerts:
        return []
    vals = []
    for a in alerts:
        rel = "array[" + ", ".join(C.lit(x) for x in a["related_users"]) + "]::uuid[]" if a["related_users"] else "'{}'::uuid[]"
        vals.append("(" + ", ".join([C.lit(a["user_id"]) + "::uuid", C.lit(a["rule"]), C.lit(a["severity"]), C.jlit(a["data"]),
                                     C.lit(a["dedupe_key"]), f"public.aml_due_at({C.lit(a['severity'])})", rel,
                                     C.lit(a["hold_withdrawals"]), C.lit(a["hold_deposits"]), C.lit(a["hold_play"])]) + ")")
    sql = ("begin; select set_config('app.actor', " + C.lit(actor) + ", true); "
           f"insert into {src.t('aml_alerts')} (user_id, rule, severity, data, dedupe_key, due_at, related_users, "
           "hold_withdrawals, hold_deposits, hold_play) values " + ", ".join(vals)
           + " on conflict (dedupe_key) do nothing returning id, rule, dedupe_key; commit;")
    # a Management API devolve o último resultado não vazio: sem linha nova, vem a linha do set_config
    return [r for r in db.query(sql) if "dedupe_key" in r]


def expire_reviews(db):
    """BO-POL-02 10.2: atualização vencida -> status atualizacao_vencida (bloqueia depósito/saque)."""
    rows = db.query("begin; select set_config('app.actor', 'tools/compliance/monitor.py', true); "
                    "update public.kyc_profiles set status = 'atualizacao_vencida' "
                    "where status = 'completo' and next_review_at < now() returning user_id; commit;")
    return [r for r in rows if "user_id" in r]


# ----------------------------------------------------------------------------------------------------------------
# relatório
# ----------------------------------------------------------------------------------------------------------------
def report(db, src, status=None):
    rows = db.query(
        f"select id::text, user_id::text, rule, severity, status, data, created_at, due_at, analyst, "
        f"hold_withdrawals, hold_deposits, hold_play, (due_at < now()) as vencido, "
        f"extract(epoch from (due_at - now())) / 3600 as horas_restantes "
        f"from {src.t('aml_alerts')} where status in ('open', 'under_review') order by (due_at < now()) desc, due_at")
    tot = db.query(f"select status, count(*) n from {src.t('aml_alerts')} group by 1 order by 1")
    now = dt.datetime.now(BRT).strftime("%d/%m/%Y %H:%M (Brasília)")
    L = [f"# Relatório PLD/FTP — alertas abertos ({src.s})", "",
         f"Gerado em {now} por `tools/compliance/monitor.py --report`. Regras e prazos: BO-POL-01, itens 9 e 10.", "",
         "Prazos de análise: crítica imediato; alta 5 dias úteis; média 15 dias úteis; baixa 30 dias; teto 45 dias.", "",
         "Totais por status: " + (", ".join(f"{r['status']} {r['n']}" for r in tot) or "nenhum alerta registrado") + ".", ""]
    if status:
        L += ["## Execução das regras", "", "| Regra | Nome | Alertas | Status de dados |", "|---|---|---|---|"]
        for k, v in status.items():
            L.append(f"| {k} | {RULES_DOC[k][0]} | {v['alertas']} | {v['status']} |")
        L.append("")
    L += ["## Alertas abertos", ""]
    if not rows:
        L.append("Nenhum alerta aberto.")
    else:
        L += ["| Regra | Sev. | Status | Conta | Criado | Prazo | SLA | Retenção | Resumo |", "|---|---|---|---|---|---|---|---|---|"]
        for r in rows:
            data = jl(r["data"]) or {}
            h = float(r["horas_restantes"] or 0)
            sla = f"VENCIDO há {abs(h) / 24:.1f} d" if r["vencido"] else f"{h / 24:.1f} d restantes"
            hold = ",".join(x for x, f in (("saque", r["hold_withdrawals"]), ("depósito", r["hold_deposits"]), ("jogo", r["hold_play"])) if f) or "-"
            resumo = ", ".join(f"{k}={v}" for k, v in list(data.items())[:5] if not isinstance(v, (list, dict)))
            L.append(f"| {r['rule']} | {SEV_PT.get(r['severity'], r['severity'])} | {r['status']} | `{(r['user_id'] or '-')[:8]}` | "
                     f"{str(r['created_at'])[:16]} | {str(r['due_at'])[:16]} | {sla} | {hold} | {resumo[:150]} |")
    L.append("")
    return "\n".join(L)


# ----------------------------------------------------------------------------------------------------------------
# selftest 1: cenário sintético (schema separado) que dispara cada regra
# ----------------------------------------------------------------------------------------------------------------
def selftest_rules(db, keep=False):
    sch = "c1test_" + dt.datetime.now().strftime("%Y%m%d%H%M%S")
    names = ["p01", "p02a", "p02b", "p03a1", "p03a2", "p03b1", "p03b2", "p03b3", "p03c1", "p03c2", "p04a", "p04b", "p04c",
             "p05", "p06", "p07", "p08a", "p08b", "p08x", "p09", "af", "afref", "afcom", "g03", "clean", "clean2"]
    U = {k: str(uuid.uuid4()) for k in names}
    T1, T2, T3 = (str(uuid.uuid4()) for _ in range(3))
    H = lambda s: C.cpf_hash(s)
    cpf = {k: H(f"{n:011d}") for n, k in enumerate(names, start=10000000001)}
    db.query(f"""
    create schema {sch};
    create table {sch}.tables (id uuid primary key, bb_cents bigint not null);
    create table {sch}.hands (id uuid primary key default gen_random_uuid(), table_id uuid not null, started_at timestamptz not null,
      result jsonb, log jsonb);
    create table {sch}.ledger (id bigserial primary key, user_id uuid not null, kind text not null, amount_cents bigint not null,
      meta jsonb not null default '{{}}', created_at timestamptz not null default now());
    create table {sch}.kyc_profiles (like public.kyc_profiles including defaults including constraints);
    create table {sch}.payout_destinations (user_id uuid not null, chave text not null);
    create table {sch}.payout_rejections (id bigserial primary key, user_id uuid not null, reason text not null,
      created_at timestamptz not null default now());
    create table {sch}.client_sessions (user_id uuid, created_at timestamptz not null default now(), ip inet, device_id text,
      country text, is_vpn boolean not null default false, table_id uuid, real_money boolean not null default true);
    create table {sch}.pix_in (user_id uuid, created_at timestamptz not null default now(), amount_cents bigint,
      payer_doc_hash text, payer_account text);
    create table {sch}.affiliate_referrals (affiliate_user_id uuid, referred_user_id uuid, created_at timestamptz default now());
    create table {sch}.affiliate_commissions (affiliate_user_id uuid, month date, commission_cents bigint, sales_cents bigint,
      refunded_cents bigint);
    create table {sch}.aml_alerts (like public.aml_alerts including defaults including constraints including indexes);
    insert into {sch}.tables values ('{T1}', 100), ('{T2}', 100), ('{T3}', 100);
    """)
    led, hands, sql = [], [], []

    def L(u, kind, amt, ago, meta=None):
        led.append(f"('{U[u]}', '{kind}', {amt}, now() - interval '{ago}', {C.jlit(meta or {})})")

    def HAND(table, ago_min, players):
        """players: [(nome, start, end, won, acoes)]; acoes = lista de 'fold'/'call'/'raise'..."""
        seats = [{"seat": n, "stack": s, "playerId": U[u]} for n, (u, s, e, w, a) in enumerate(players)]
        res = {"stacks": [{"seat": n, "stack": e} for n, (u, s, e, w, a) in enumerate(players)],
               "winners": [{"seat": n, "amount": w, "playerId": U[u]} for n, (u, s, e, w, a) in enumerate(players) if w]}
        log = [{"kind": "start", "data": {"seats": seats}}]
        for n, (u, s, e, w, a) in enumerate(players):
            log += [{"kind": "action", "seat": n, "action": x} for x in a]
        hands.append(f"('{table}', now() - interval '{ago_min} minutes', {C.jlit(res)}, {C.jlit(log)})")

    def kyc(u, level, status="completo", risk="medio", renda=None, **extra):
        cols = {"user_id": U[u], "level": level, "full_name": "Teste " + u, "cpf_hash": cpf[u], "cpf_last4": "0000",
                "birth_date": "1990-01-01", "status": status, "risk_level": risk, "renda_mensal_cents": renda,
                "renda_analisada_em": "2026-10-01" if renda else None,
                "liveness_resultado": "aprovado" if level >= 2 else None}
        cols.update(extra)
        sql.append(f"insert into {sch}.kyc_profiles ({', '.join(cols)}) values ({', '.join(C.lit(v) for v in cols.values())});")

    # P01: deposita R$ 1.000, joga R$ 100, saca R$ 950 em 24 h
    kyc("p01", 2)
    L("p01", "deposit", 100_000, "30 hours")
    L("p01", "buyin", -10_000, "29 hours")
    L("p01", "withdrawal", -95_000, "6 hours")
    # P02: em 3 sessões (intervalos de 2 h), p02a perde 12 x R$ 50 para p02b, foldando após investir >= 10 bb
    for k in range(12):
        HAND(T1, 300 - (k // 4) * 120 - k, [("p02a", 20000, 15000, 0, ["raise", "fold"]), ("p02b", 20000, 25000, 10000, ["raise"])])
    # P03a: duas contas no mesmo dispositivo
    sql.append(f"insert into {sch}.client_sessions (user_id, ip, device_id, country) values "
               f"('{U['p03a1']}', '198.51.100.10', 'dev-AAAA', 'BR'), ('{U['p03a2']}', '198.51.100.11', 'dev-AAAA', 'BR');")
    # P03b: três contas no mesmo IP em 30 dias; duas delas na mesma mesa
    sql.append(f"insert into {sch}.client_sessions (user_id, ip, device_id, country, table_id) values "
               f"('{U['p03b1']}', '203.0.113.7', 'dev-b1', 'BR', '{T2}'), ('{U['p03b2']}', '203.0.113.7', 'dev-b2', 'BR', '{T2}'),"
               f"('{U['p03b3']}', '203.0.113.7', 'dev-b3', 'BR', null);")
    # P03c: mesma chave Pix em duas contas
    sql.append(f"insert into {sch}.payout_destinations values ('{U['p03c1']}', 'pix-compartilhada@example.com'), "
               f"('{U['p03c2']}', 'pix-compartilhada@example.com');")
    # P04 (a): 4 depósitos de R$ 300 em 5 h; (b): 2 depósitos de R$ 4.900 (faixa R$ 5.000) em 3 dias;
    # (c): R$ 1.900 em cada um dos 2 últimos meses com limite mensal de R$ 2.000 (nível 1)
    kyc("p04a", 2)
    for k in range(4):
        L("p04a", "deposit", 30_000, f"{5 - k} hours")
    kyc("p04b", 3, renda=2_000_000)
    L("p04b", "deposit", 490_000, "4 days")
    L("p04b", "deposit", 490_000, "1 days")
    kyc("p04c", 1)
    m_now = dt.datetime.now(BRT).replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    m_prev = (m_now - dt.timedelta(days=1)).replace(day=1)
    led.append(f"('{U['p04c']}', 'deposit', 190000, {C.lit(m_now.isoformat())}::timestamptz + interval '1 hour', '{{}}'::jsonb)")
    led.append(f"('{U['p04c']}', 'deposit', 190000, {C.lit(m_prev.isoformat())}::timestamptz + interval '1 hour', '{{}}'::jsonb)")
    # P05: renda R$ 4.000 e R$ 9.000 depositados em 30 dias (> 100% da renda e > 3x a média de 0)
    kyc("p05", 3, renda=400_000)
    for k in range(3):
        L("p05", "deposit", 300_000, f"{10 + k} days")
    # P06: duas tentativas de saque para terceiro
    sql.append(f"insert into {sch}.payout_rejections (user_id, reason) values ('{U['p06']}', 'PAYOUT_HOLDER_MISMATCH: x'), "
               f"('{U['p06']}', 'PAYOUT_HOLDER_MISMATCH: y');")
    # P07: Pix de pagador com outro CPF
    kyc("p07", 2)
    sql.append(f"insert into {sch}.pix_in (user_id, amount_cents, payer_doc_hash, payer_account) values "
               f"('{U['p07']}', 50000, '{cpf['clean']}', 'conta-terceiro-1');")
    # P08: p08a e p08b juntos em 12 sessões, quase sem raise entre elas e com raise contra p08x
    for k in range(12):
        tb = T2 if k % 2 else T3
        HAND(tb, 20000 - k * 240, [("p08a", 10000, 10000, 0, ["call", "check"]), ("p08b", 10000, 10000, 0, ["check", "check"])])
        HAND(tb, 20000 - k * 240 - 5, [("p08a", 10000, 10100, 300, ["raise"]), ("p08b", 10000, 10000, 0, ["check"]),
                                        ("p08x", 10000, 9900, 0, ["call", "fold"])])
    for k in range(4):   # p08a e p08b raise contra terceiros em sessões sem a outra
        HAND(T1, 9000 - k * 240, [("p08a", 10000, 10100, 200, ["raise", "raise"]), ("p08x", 10000, 9900, 0, ["call"])])
    # P09: 3 sessões de dinheiro real de fora do Brasil / VPN
    sql.append(f"insert into {sch}.client_sessions (user_id, ip, device_id, country, is_vpn) values "
               f"('{U['p09']}', '192.0.2.1', 'dev-p09', 'PT', false), ('{U['p09']}', '192.0.2.2', 'dev-p09', 'BR', true), "
               f"('{U['p09']}', '192.0.2.3', 'dev-p09', 'US', false);")
    # AF01: indicado no mesmo dispositivo do afiliado; AF02: comissão 10x a média e acima de R$ 5.000
    sql.append(f"insert into {sch}.client_sessions (user_id, ip, device_id, country) values "
               f"('{U['af']}', '198.51.100.50', 'dev-AF', 'BR'), ('{U['afref']}', '198.51.100.51', 'dev-AF', 'BR');")
    sql.append(f"insert into {sch}.affiliate_referrals (affiliate_user_id, referred_user_id) values ('{U['af']}', '{U['afref']}');")
    months, mm = [], m_now.date()
    for k in range(4):                     # mês atual e os 3 anteriores
        months.append(mm)
        mm = (mm - dt.timedelta(days=1)).replace(day=1)
    sql.append(f"insert into {sch}.affiliate_commissions values " + ", ".join(
        f"('{U['afcom']}', '{m.isoformat()}', {600000 if k == 0 else 50000}, 5000000, 100000)" for k, m in enumerate(months)) + ";")
    # G03: bureau diz que tem 16 anos
    kyc("g03", 0, status="pendente", bureau_birth_date="2010-06-01")
    # controles: contas normais que não podem disparar nada
    kyc("clean", 3, risk="baixo", renda=5_000_000)
    L("clean", "deposit", 100_000, "20 days")
    HAND(T1, 25000, [("clean", 10000, 10050, 150, ["raise"]), ("clean2", 10000, 9950, 0, ["call", "fold"])])
    sql.append(f"insert into {sch}.client_sessions (user_id, ip, device_id, country) values ('{U['clean']}', '198.51.100.99', 'dev-clean', 'BR');")

    db.query(f"insert into {sch}.ledger (user_id, kind, amount_cents, created_at, meta) values " + ", ".join(led) + ";"
             + f"insert into {sch}.hands (table_id, started_at, result, log) values " + ", ".join(hands) + ";" + "".join(sql))
    rc = 0
    try:
        src = Src(db, sch)
        d = load(db, src)
        alerts, status = run_rules(d)
        ins1 = save_alerts(db, src, alerts, actor="monitor.py --selftest")
        ins2 = save_alerts(db, src, alerts, actor="monitor.py --selftest")
        nm = {v: k for k, v in U.items()}
        print(f"schema sintético: {sch}  ({len(led)} linhas de ledger, {len(hands)} mãos, {len(names)} contas)")
        fired = defaultdict(list)
        for a in alerts:
            fired[a["rule"]].append(a)
        missing = []
        for rule in RULES_DOC:
            got = fired.get(rule, [])
            if rule in ("G01", "G02"):
                print(f"  {rule:5s} (trigger no banco: testado em selftest_db)  [{status[rule]['status'][:60]}]")
                continue
            who = sorted({nm.get(x, x) for a in got for x in [a["user_id"]] + a["related_users"] if x})
            print(f"  {rule:5s} {'DISPAROU' if got else 'NAO DISPAROU':12s} {len(got)} alerta(s)  sev={sorted({a['severity'] for a in got})}  contas={who}")
            for a in got:
                print("        " + json.dumps(a["data"], ensure_ascii=False, default=str)[:260])
            if not got:
                missing.append(rule)
        clean = [a for a in alerts if U["clean"] in [a["user_id"]] + a["related_users"] or U["clean2"] in [a["user_id"]] + a["related_users"]]
        print(f"  contas de controle (clean, clean2): {len(clean)} alerta(s)")
        print(f"  gravados em {sch}.aml_alerts: 1a rodada {len(ins1)}, 2a rodada {len(ins2)} (dedupe)")
        due = db.query(f"select severity, min(due_at - created_at)::text d from {sch}.aml_alerts group by 1 order by 1")
        print("  prazo calculado por severidade (due_at - created_at): " + ", ".join(f"{r['severity']}={r['d']}" for r in due))
        ok = not missing and not clean and len(ins2) == 0 and len(ins1) == len(alerts)
        print("SELFTEST REGRAS:", "OK" if ok else f"FALHOU (sem disparo: {missing}; controle: {len(clean)})")
        rc = 0 if ok else 1
    finally:
        if keep:
            print(f"(--keep) schema {sch} mantido")
        else:
            db.query(f"drop schema {sch} cascade")
            n = db.query(f"select count(*) n from information_schema.schemata where schema_name = {C.lit(sch)}")[0]["n"]
            print(f"limpeza: drop schema {sch} cascade -> restam {n} schema(s) com esse nome")
    return rc


# ----------------------------------------------------------------------------------------------------------------
# selftest 2: controles no banco de produção, dentro de uma transação desfeita no fim (nada fica gravado)
# ----------------------------------------------------------------------------------------------------------------
def selftest_db(db):
    from screening import screen  # noqa: E402
    un = screen("Germain Katanga", None, "1978-04-28")          # nome real da lista ONU + nascimento da lista
    poss = screen("Eric Badege")                                # nome real da lista ONU, sem identificador extra
    print(f"screening para o teste: 'Germain Katanga' 1978-04-28 -> {un['decision']}; 'Eric Badege' -> {poss['decision']}")
    cpf_ok, cpf_other = C.cpf_hash("12345678909"), C.cpf_hash("11144477735")
    block = f"""
do $t$
declare
  r text[] := '{{}}';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  d1 uuid; v jsonb; n int; s text;
begin
  perform set_config('app.actor', 'monitor.py --selftest (transação desfeita)', true);
  insert into public.profiles (id, nick) values (u1, 'c1t_' || left(u1::text, 8)), (u2, 'c1t_' || left(u2::text, 8)),
                                               (u3, 'c1t_' || left(u3::text, 8)), (u4, 'c1t_' || left(u4::text, 8));
  -- KYC nível 2 completo para u1
  insert into public.kyc_profiles (user_id, level, full_name, cpf_hash, cpf_last4, birth_date, status, liveness_resultado, last_verified_at)
  values (u1, 2, 'Cliente Teste', '{cpf_ok}', '8909', '1990-01-01', 'completo', 'aprovado', now());
  r := r || ('kyc nivel2 completo: risco=' || (select risk_level from public.kyc_profiles where user_id = u1)
             || ' proxima_atualizacao=' || (select next_review_at::date from public.kyc_profiles where user_id = u1));
  -- menor de 18 não fica completo
  begin
    insert into public.kyc_profiles (user_id, level, full_name, cpf_hash, cpf_last4, birth_date, status)
    values (u4, 1, 'Menor Teste', '{C.cpf_hash("98765432100")}', '2100', current_date - interval '16 years', 'completo');
    r := r || 'FALHA: menor ficou completo'::text;
  exception when others then r := r || ('menor de 18 recusado: ' || split_part(sqlerrm, ':', 1)); end;
  -- destino de saque: mesmo CPF passa; CPF de terceiro é recusado e vira tentativa P06
  v := public.register_payout_destination(u1, '{cpf_ok}', 'cliente@example.com', 'email');
  d1 := (v ->> 'id')::uuid;
  r := r || ('destino mesmo CPF: ' || (v ->> 'ok'));
  v := public.register_payout_destination(u1, '{cpf_other}', 'terceiro@example.com', 'email');
  r := r || ('destino CPF de terceiro: ok=' || (v ->> 'ok') || ' erro=' || (v ->> 'error')
             || ' tentativas_gravadas=' || (select count(*) from public.payout_rejections where user_id = u1));
  begin
    insert into public.payout_destinations (user_id, cpf_titular_hash, chave) values (u1, '{cpf_other}', 'direto@example.com');
    r := r || 'FALHA: insert direto de terceiro passou'::text;
  exception when others then r := r || ('insert direto de terceiro: ' || split_part(sqlerrm, ':', 1)); end;
  -- limites do nível 2: depósito R$ 2.000/dia
  insert into public.ledger (user_id, kind, amount_cents) values (u1, 'deposit', 150000);
  r := r || 'deposito R$ 1.500 (nivel 2): aceito'::text;
  begin
    insert into public.ledger (user_id, kind, amount_cents) values (u1, 'deposit', 60000);
    r := r || 'FALHA: deposito acima do limite diario aceito'::text;
  exception when others then r := r || ('deposito +R$ 600 (passa R$ 2.000/dia): ' || split_part(sqlerrm, ':', 1)); end;
  -- saque: exige destino próprio; dentro do limite passa
  begin
    insert into public.ledger (user_id, kind, amount_cents) values (u1, 'withdrawal', -10000);
    r := r || 'FALHA: saque sem destino aceito'::text;
  exception when others then r := r || ('saque sem destino: ' || split_part(sqlerrm, ':', 1)); end;
  insert into public.ledger (user_id, kind, amount_cents, meta) values (u1, 'withdrawal', -10000, jsonb_build_object('payout_destination_id', d1));
  r := r || 'saque R$ 100 para destino proprio: aceito'::text;
  -- nível 0 / sem KYC não deposita
  begin
    insert into public.ledger (user_id, kind, amount_cents) values (u2, 'deposit', 1000);
    r := r || 'FALHA: sem KYC depositou'::text;
  exception when others then r := r || ('deposito sem KYC: ' || split_part(sqlerrm, ':', 1)); end;
  -- ledger append-only
  begin
    update public.ledger set amount_cents = 1 where user_id = u1;
    r := r || 'FALHA: update em ledger passou'::text;
  exception when others then r := r || ('UPDATE ledger: ' || split_part(sqlerrm, ':', 1)); end;
  begin
    delete from public.ledger where user_id = u1;
    r := r || 'FALHA: delete em ledger passou'::text;
  exception when others then r := r || ('DELETE ledger: ' || split_part(sqlerrm, ':', 1)); end;
  -- audit_log append-only
  begin
    update public.audit_log set actor = 'x' where id = (select max(id) from public.audit_log);
    r := r || 'FALHA: update em audit_log passou'::text;
  exception when others then r := r || ('UPDATE audit_log: ' || split_part(sqlerrm, ':', 1)); end;
  begin
    delete from public.audit_log where id = (select max(id) from public.audit_log);
    r := r || 'FALHA: delete em audit_log passou'::text;
  exception when others then r := r || ('DELETE audit_log: ' || split_part(sqlerrm, ':', 1)); end;
  r := r || ('audit_log de kyc/destinos/alertas nesta transação: ' ||
             (select count(*) from public.audit_log where entity_id in (u1::text, u2::text, u3::text) or entity_id = d1::text));
  -- G02: correspondência possível (nome da ONU sem identificador) -> bloqueio preventivo
  insert into public.kyc_profiles (user_id, level, full_name, cpf_hash, cpf_last4, birth_date, status, liveness_resultado)
  values (u3, 2, 'Eric Badege', '{C.cpf_hash("52998224725")}', '4725', '1971-01-01', 'completo', 'aprovado');
  insert into public.screening_results (user_id, full_name, lists_checked, matches, decision)
  values (u3, 'Eric Badege', {C.jlit(poss['lists_checked'])}, {C.jlit(poss['matches'])}, {C.lit(poss['decision'])});
  r := r || ('G02: preventive_hold=' || (select preventive_hold from public.kyc_profiles where user_id = u3)
             || ' alerta=' || (select string_agg(rule || '/' || severity || '/prazo ' || (due_at - created_at)::text, ',') from public.aml_alerts where user_id = u3));
  begin
    insert into public.ledger (user_id, kind, amount_cents) values (u3, 'deposit', 1000);
    r := r || 'FALHA: deposito com bloqueio preventivo aceito'::text;
  exception when others then r := r || ('deposito com G02 aberto: ' || split_part(sqlerrm, ':', 1)); end;
  -- G01: correspondência confirmada na lista ONU (nome + nascimento) -> bloqueio imediato + indisponibilidade
  insert into public.screening_results (user_id, full_name, lists_checked, matches, decision)
  values (u2, 'Germain Katanga', {C.jlit(un['lists_checked'])}, {C.jlit(un['matches'])}, {C.lit(un['decision'])});
  select status || ' freeze=' || sanctions_freeze || ' motivo=' || left(blocked_reason, 60) into s from public.kyc_profiles where user_id = u2;
  r := r || ('G01: kyc ' || coalesce(s, 'SEM KYC'));
  r := r || ('G01 alerta: ' || coalesce((select string_agg(rule || '/' || severity || '/prazo ' || (due_at - created_at)::text
             || '/retem saque,deposito,jogo=' || hold_withdrawals || ',' || hold_deposits || ',' || hold_play, ',')
             from public.aml_alerts where user_id = u2), 'NENHUM'));
  begin
    insert into public.ledger (user_id, kind, amount_cents) values (u2, 'credit_test', 100000);
    r := r || 'FALHA: conta G01 recebeu fichas'::text;
  exception when others then r := r || ('fichas para conta G01: ' || split_part(sqlerrm, ':', 1)); end;
  begin
    update public.kyc_profiles set sanctions_freeze = false where user_id = u2;
    r := r || 'FALHA: indisponibilidade levantada sem fundamento'::text;
  exception when others then r := r || ('levantar indisponibilidade sem fundamento: ' || split_part(sqlerrm, ':', 1)); end;
  raise exception 'C1_SELFTEST_RESULT%', E'\\n' || array_to_string(r, E'\\n');
end
$t$;"""
    try:
        db.query(block)
        print("FALHA: o bloco não terminou com o rollback esperado")
        return 1
    except C.DbError as e:
        m = re.search(r"C1_SELFTEST_RESULT(.*)", e.message, re.S)
        if not m:
            print("FALHA inesperada:", e.message[:3000])
            return 1
        lines = [x for x in m.group(1).split(chr(10)) if x.strip() and not x.startswith("CONTEXT")]
        for x in lines:
            print("  " + x)
        bad = [x for x in lines if x.startswith("FALHA")]
        left = db.query("select count(*) n from public.profiles where nick like 'c1t\\_%'")[0]["n"]
        print(f"  rollback: perfis de teste restantes no banco = {left}")
        print("SELFTEST BANCO:", "OK" if not bad and left == 0 else f"FALHOU {bad}")
        return 0 if not bad and left == 0 else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="roda as regras uma vez e grava os alertas")
    ap.add_argument("--dry-run", action="store_true", help="com --once: não grava")
    ap.add_argument("--report", action="store_true", help="markdown com alertas abertos e SLA")
    ap.add_argument("--out", help="arquivo para o relatório")
    ap.add_argument("--include-test-credits", action="store_true", help="simulação: credit_test conta como depósito (use com --dry-run)")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    db = C.db()
    if a.selftest:
        r1 = selftest_rules(db, a.keep)
        print()
        r2 = selftest_db(db)
        return r1 or r2
    if a.include_test_credits and a.once and not a.dry_run:
        sys.exit("--include-test-credits só com --dry-run (fichas de teste não são dinheiro)")
    src = Src(db, "public")
    status = None
    if a.once:
        d = load(db, src, PARAMS, a.include_test_credits)
        alerts, status = run_rules(d)
        print(f"dados: {len(d['ledger'])} linhas de ledger (deposit/withdrawal/buyin{'/credit_test' if a.include_test_credits else ''}), "
              f"{len(d['hands'])} mãos, {len(d['kyc'])} kyc_profiles, {len(d['ipsess'])} sessões com IP, "
              f"{len(d['pix_dest'])} destinos pix, {len(d['rejections'])} tentativas recusadas")
        for k, v in status.items():
            print(f"  {k:5s} {v['alertas']} alerta(s)  [{v['status']}]")
        for al in alerts:
            print(f"    - {al['rule']} {al['severity']} {al['dedupe_key'][:90]}")
        if a.dry_run:
            print("dry-run: nada gravado")
        else:
            ins = save_alerts(db, src, alerts)
            exp = expire_reviews(db)
            print(f"gravados: {len(ins)} novo(s); {len(alerts) - len(ins)} já existia(m) (dedupe); "
                  f"cadastros com atualização vencida marcados: {len(exp)}")
    if a.report or not a.once:
        md = report(db, src, status)
        if a.out:
            with open(a.out, "w", encoding="utf-8") as f:
                f.write(md)
            print("relatório:", a.out)
        else:
            print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
