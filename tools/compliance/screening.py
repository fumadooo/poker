#!/usr/bin/env python3
"""screening.py — confere nome / CPF / nascimento contra ONU, OFAC, PEP (CGU), CEIS e CNEP.

Usa os arquivos normalizados de compliance/lists/ (gerados por tools/compliance/lists.py).

Por nome: normalização (sem acento, caixa alta, sem pontuação, sem partículas de/da/dos...), depois score de tokens
com fuzzy (difflib) em mão dupla: score = (Σ similaridade dos tokens da consulta achados na lista + Σ dos tokens da
lista achados na consulta) / (nº tokens consulta + nº tokens lista). Token só conta se similaridade >= TOKEN_MIN.
Nome extra de um lado derruba o score, então "MICHAEL SILVA" não vira match de "MICHAEL MENDONCA BARROS SILVA".

Por CPF: CEIS/CNEP trazem CPF completo (comparação exata). PEP traz CPF mascarado (***.123.456-**, dígitos 4 a 9):
dígitos do meio iguais + nome parecido = match forte; dígitos do meio DIFERENTES com nome igual = homônimo,
rebaixado e marcado (cpf_divergente), nunca descartado em silêncio.

Decisão: confirmed (nome >= MATCH + identificador extra: nascimento completo igual ou CPF igual — BO-POL-01 7.2),
match (nome >= MATCH, ou CPF completo igual com nome divergente), review (score >= REVIEW), clear (nenhum).
Gravado com --save --user <uuid>, a trigger screening_effects aplica no banco: ONU confirmada -> G01 (bloqueio
imediato + indisponibilidade); OFAC confirmada -> bloqueio; ONU/OFAC possível ou PEP não declarado -> G02
(bloqueio preventivo). CEIS/CNEP só geram análise (BO-POL-01 7.5).
Resultados "homonimo" (nome bate, CPF da lista diverge) aparecem na saída e no registro, mas não mudam a decisão.
Revisão humana é registrada depois em screening_results.reviewed_by / decision (false_positive / confirmed).

  python tools/compliance/screening.py "Nome Completo" [--cpf 000.000.000-00] [--nascimento 1990-01-31]
                                       [--save] [--user <uuid>] [--json]
"""
import argparse
import datetime as dt
import difflib
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

SOURCES = ["un", "ofac", "pep", "ceis", "cnep"]
TOKEN_MIN = 0.85     # similaridade mínima para um token contar
MATCH = 0.97         # score >= MATCH -> match (grafia idêntica após normalização, ou quase)
REVIEW = 0.85        # score >= REVIEW -> review (ex.: 3 tokens iguais de 3 contra 4 = 0,857)
TOP = 25             # máx. de resultados devolvidos
MAX_CAND = 3000      # candidatos pontuados por consulta (após bloqueio por token)

_DATA = None


class Lists:
    def __init__(self):
        self.recs = []
        self.names = []                 # (rec_idx, tokens)
        self.by_tok = defaultdict(list)
        self.by_pre = defaultdict(list)
        self.cpf_full = defaultdict(list)
        self.cpf_mid = defaultdict(list)
        self.loaded = {}
        man_path = os.path.join(C.LISTS_DIR, "manifest.json")
        self.manifest = json.load(open(man_path, encoding="utf-8")) if os.path.exists(man_path) else {"sources": {}}
        for s in SOURCES:
            p = os.path.join(C.LISTS_DIR, s + ".jsonl")
            if not os.path.exists(p):
                continue
            n = 0
            with open(p, encoding="utf-8") as f:
                for line in f:
                    r = json.loads(line)
                    ri = len(self.recs)
                    self.recs.append(r)
                    n += 1
                    for nm in [r.get("name")] + (r.get("aliases") or []):
                        tk = C.tokens(nm or "")
                        if not tk:
                            continue
                        ni = len(self.names)
                        self.names.append((ri, tk, nm))
                        for t in set(tk):
                            self.by_tok[t].append(ni)
                            if len(t) >= 4:
                                self.by_pre[t[:4]].append(ni)
                    if r.get("cpf_kind") == "full":
                        self.cpf_full[r["cpf"]].append(ri)
                    elif r.get("cpf_kind") == "masked":
                        self.cpf_mid[r["cpf"]].append(ri)
            self.loaded[s] = n

    def lists_checked(self):
        out = []
        for s in SOURCES:
            m = self.manifest.get("sources", {}).get(s, {})
            ok = m if m.get("status") == "ok" else (m.get("last_ok") or {})
            out.append({"source": s, "status": "ok" if s in self.loaded else "missing",
                        "manifest_status": m.get("status"), "records": self.loaded.get(s, 0),
                        "sha256": ok.get("sha256"), "downloaded_at": ok.get("downloaded_at"),
                        "data_referencia": m.get("data_referencia")})
        return out


def data():
    global _DATA
    if _DATA is None:
        _DATA = Lists()
    return _DATA


def lev(a, b, cap=3):
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def tok_sim(a, b):
    """1.0 igual; 0.9 se 1 edição (tokens >= 4 letras) ou 2 edições (>= 8 letras); senão razão do difflib."""
    if a == b:
        return 1.0
    if abs(len(a) - len(b)) > max(2, len(a) // 3):
        return 0.0
    n = min(len(a), len(b))
    if n >= 4:
        d = lev(a, b)
        if d <= 1 or (d <= 2 and n >= 8):
            return 0.9
    return difflib.SequenceMatcher(None, a, b).ratio()


def name_score(q, c):
    if not q or not c:
        return 0.0
    def side(xs, ys):
        tot = 0.0
        for x in xs:
            b = max(tok_sim(x, y) for y in ys)
            if b >= TOKEN_MIN:
                tot += b
        return tot
    return (side(q, c) + side(c, q)) / (len(q) + len(c))


def years(dobs):
    ys = set()
    for d in dobs or []:
        for y in re.findall(r"(19\d\d|20\d\d)", str(d)):
            ys.add(int(y))
    return ys


def full_dates(dobs):
    """Datas completas (AAAA-MM-DD) de formatos das listas: '10 Dec 1948', '1948-12-10', '10/12/1948'."""
    out = set()
    for d in dobs or []:
        d = str(d).strip()
        for fmt in ("%d %b %Y", "%Y-%m-%d", "%d/%m/%Y", "%d %B %Y"):
            try:
                out.add(dt.datetime.strptime(d, fmt).date().isoformat())
                break
            except ValueError:
                continue
    return out


def screen(nome, cpf=None, nascimento=None):
    """Devolve {query, decision, matches[], lists_checked[]}. matches ordenados por score desc."""
    L = data()
    q = C.tokens(nome)
    cpf_d = C.cpf_digits(cpf) if cpf and C.cpf_valid(cpf) else None   # CPF inválido não é usado
    cand = defaultdict(int)
    for t in set(q):
        for ni in L.by_tok.get(t, ()):
            cand[ni] += 2
        if len(t) >= 4:
            for ni in L.by_pre.get(t[:4], ()):
                cand[ni] += 1
    need = 2 if len(q) >= 2 else 1
    # nomes comuns (JOAO, SILVA) geram dezenas de milhares de candidatos: ordena por acertos e, no empate, pelo
    # número de tokens mais próximo da consulta, para o nome idêntico nunca cair fora do corte MAX_CAND.
    ranked = sorted((ni for ni, h in cand.items() if h >= need),
                    key=lambda ni: (-cand[ni], abs(len(L.names[ni][1]) - len(q))))[:MAX_CAND]
    best = {}
    near_all = {}
    for ni in ranked:
        ri, tk, raw = L.names[ni]
        sc = name_score(q, tk)
        if sc >= REVIEW * 0.75 and (ri not in best or sc > best[ri][0]):
            best[ri] = (sc, raw)
        if sc > 0 and (ri not in near_all or sc > near_all[ri][0]):
            near_all[ri] = (sc, raw)

    # CPF: completo (CEIS/CNEP) e mascarado (PEP)
    cpf_hits = {}
    if cpf_d:
        for ri in L.cpf_full.get(cpf_d, ()):
            cpf_hits[ri] = "cpf_completo_igual"
        for ri in L.cpf_mid.get(cpf_d[3:9], ()):
            cpf_hits[ri] = "cpf_parcial_igual"
        for ri in cpf_hits:
            if ri not in best:
                best[ri] = (name_score(q, C.tokens(L.recs[ri]["name"])), L.recs[ri]["name"])

    qy = years([nascimento]) if nascimento else set()
    qf = full_dates([nascimento]) if nascimento else set()
    out = []
    for ri, (sc, raw) in best.items():
        r = L.recs[ri]
        flags = []
        final = sc
        hit = cpf_hits.get(ri)
        if hit == "cpf_completo_igual":
            flags.append(hit)
            if sc < REVIEW:
                flags.append("nome_divergente")
            final = 1.0
        elif hit == "cpf_parcial_igual":
            flags.append(hit)
            if sc >= 0.6:
                final = min(1.0, sc + 0.15)
        elif cpf_d and r.get("cpf"):
            # lista tem CPF e não bate: homônimo
            flags.append("cpf_divergente")
            final = sc * 0.7
        ry, rf = years(r.get("dob")), full_dates(r.get("dob"))
        if qy and ry:
            if qf and rf:
                if qf & rf:
                    flags.append("nascimento_igual")
                else:
                    flags.append("nascimento_divergente")
                    final *= 0.85
            elif qy & ry:
                flags.append("nascimento_ano_igual")      # só o ano: identificador fraco, não confirma
            else:
                flags.append("nascimento_divergente")
                final *= 0.85
        if "cpf_divergente" in flags and sc >= REVIEW:
            level = "homonimo"        # nome bate mas o CPF da lista é outro: registrado, não pesa na decisão
        elif final < REVIEW and not hit:
            continue
        else:
            level = None
        level = level or ("match" if (final >= MATCH or hit == "cpf_completo_igual") else ("review" if final >= REVIEW else "cpf_only"))
        if hit == "cpf_parcial_igual" and level == "cpf_only":
            level = "review" if sc >= 0.5 else "cpf_only"
        # BO-POL-01 7.2: confirmada = nome coincide + pelo menos um identificador adicional (nascimento ou documento)
        if level == "match" and sc >= MATCH and (
                "nascimento_igual" in flags or hit in ("cpf_completo_igual", "cpf_parcial_igual")):
            level = "confirmed"
        out.append({
            "source": r["source"], "ref": r["ref"], "type": r.get("type"), "list_name": r["name"],
            "matched_name": raw, "name_score": round(sc, 3), "score": round(final, 3), "level": level,
            "flags": flags, "dob": r.get("dob") or [], "info": r.get("info") or {},
        })
    # CPF mascarado igual com nome totalmente diferente é coincidência esperada (1 em 10^6 por registro): fora.
    out = [m for m in out if m["level"] != "cpf_only"]
    seen, uniq = set(), []
    for m in sorted(out, key=lambda m: -m["score"]):          # PEP repete a pessoa por cargo: 1 linha por (fonte, ref)
        k = (m["source"], m["ref"])
        if k in seen:
            for u in uniq:
                if (u["source"], u["ref"]) == k:
                    u["also"] = u.get("also", 0) + 1
            continue
        seen.add(k)
        uniq.append(m)
    out = uniq
    out.sort(key=lambda m: (-m["score"], m["source"]))
    out = out[:TOP]
    shown = {(m["source"], m["ref"]) for m in out}
    nearest = sorted(((sc, L.recs[ri], raw) for ri, (sc, raw) in near_all.items()
                      if (L.recs[ri]["source"], L.recs[ri]["ref"]) not in shown), key=lambda x: -x[0])[:5]
    nearest = [{"source": r["source"], "list_name": r["name"], "matched_name": raw, "name_score": round(sc, 3)}
               for sc, r, raw in nearest]
    decision = ("confirmed" if any(m["level"] == "confirmed" for m in out)
                else "match" if any(m["level"] == "match" for m in out)
                else "review" if any(m["level"] == "review" for m in out) else "clear")
    return {
        "query": {"nome": nome, "nome_normalizado": " ".join(q), "cpf_informado": bool(cpf_d),
                  "cpf_valido": C.cpf_valid(cpf) if cpf else None, "nascimento": nascimento,
                  "params": {"TOKEN_MIN": TOKEN_MIN, "MATCH": MATCH, "REVIEW": REVIEW}},
        "decision": decision, "matches": out, "nearest_below_threshold": nearest, "lists_checked": L.lists_checked(),
        "screened_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
    }


def save(res, cpf=None, user_id=None, actor="tools/compliance/screening.py"):
    h = C.cpf_hash(cpf) if cpf else None
    sql = ("begin; select set_config('app.actor', " + C.lit(actor) + ", true); "
           "insert into public.screening_results (user_id, cpf_hash, full_name, lists_checked, matches, decision) values ("
           + ", ".join([C.lit(user_id) + "::uuid", C.lit(h), C.lit(res["query"]["nome"]), C.jlit(res["lists_checked"]),
                        C.jlit(res["matches"]), C.lit(res["decision"])])
           + ") returning id, decision, created_at; commit;")
    rows = C.db().query(sql)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("nome")
    ap.add_argument("--cpf")
    ap.add_argument("--nascimento", help="AAAA-MM-DD")
    ap.add_argument("--save", action="store_true", help="grava em public.screening_results")
    ap.add_argument("--user", help="user_id (uuid) do profiles, se for um cliente")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    res = screen(a.nome, a.cpf, a.nascimento)
    if a.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
    else:
        qq = res["query"]
        print(f"consulta: {qq['nome']}  ->  {qq['nome_normalizado']}"
              + (f"  cpf={'valido' if qq['cpf_valido'] else 'INVALIDO'}" if qq["cpf_informado"] else "")
              + (f"  nasc={qq['nascimento']}" if qq["nascimento"] else ""))
        print("listas: " + ", ".join(f"{x['source']}={x['records']:,}" for x in res["lists_checked"]))
        print(f"DECISÃO: {res['decision'].upper()}  ({len(res['matches'])} resultado(s) >= limiar)")
        for m in res["matches"]:
            print(f"  [{m['level']:6s}] {m['score']:.3f} (nome {m['name_score']:.3f}) {m['source']:5s} {m['ref'][:40]:40s} "
                  f"{m['list_name'][:50]}  {' '.join(m['flags'])}")
        if res["nearest_below_threshold"]:
            print("  mais próximos abaixo do limiar: " + "; ".join(
                f"{n['source']}:{n['list_name'][:40]} {n['name_score']:.2f}" for n in res["nearest_below_threshold"]))
    if a.save:
        rows = save(res, a.cpf, a.user)
        print("gravado em screening_results:", json.dumps(rows, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
