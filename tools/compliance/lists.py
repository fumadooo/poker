#!/usr/bin/env python3
"""lists.py — baixa e normaliza as listas públicas de sanções / PEP / inidôneos usadas no screening.

Stdlib only. Saída em compliance/lists/ (fora do git: a pasta tem um .gitignore próprio):
  raw/<arquivo>              arquivo original como baixado
  <fonte>.jsonl              registros normalizados {source, ref, type, name, aliases[], cpf, cpf_kind, dob[], info}
  manifest.json              por fonte: url pedida, url final, data/hora UTC, bytes, sha256, registros, status, erro

Fontes:
  un        ONU/CSNU consolidada (XML)       https://scsanctions.un.org/resources/xml/en/consolidated.xml
  ofac      OFAC SDN (CSV) + nomes alternativos (alt.csv)
  pep       CGU PEP (zip mensal AAAAMM_PEP.zip)
  ceis      CGU CEIS (zip diário AAAAMMDD_CEIS.zip)
  cnep      CGU CNEP (zip diário AAAAMMDD_CNEP.zip)

A data do arquivo CGU é descoberta na página do Portal da Transparência (arquivos.push({...})); se a página
falhar, recua dia a dia (CEIS/CNEP) ou mês a mês (PEP) até achar um zip que responda 200.
Uma fonte que falha fica registrada no manifesto com status=error (e o último download bom, se houver) e o
resto segue. Nada é inventado.

  python tools/compliance/lists.py              baixa tudo
  python tools/compliance/lists.py --only un,pep
  python tools/compliance/lists.py --status     mostra o manifesto
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "compliance", "lists")
RAW = os.path.join(OUT, "raw")
MANIFEST = os.path.join(OUT, "manifest.json")
UA = "Mozilla/5.0 (BLACK OPS LTDA compliance screening; contato michael@mikhaeu.com)"
PORTAL = "https://portaldatransparencia.gov.br/download-de-dados/{src}"
CGU_ZIP = "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/{src}/{stamp}_{SRC}.zip"

URLS = {
    "un": "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
    "ofac": "https://www.treasury.gov/ofac/downloads/sdn.csv",
    "ofac_alt": "https://www.treasury.gov/ofac/downloads/alt.csv",
}
ALL = ["un", "ofac", "pep", "ceis", "cnep"]


def now_utc():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def http_get(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.geturl()


def http_ok(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def save_raw(name, data):
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, name)
    with open(p, "wb") as f:
        f.write(data)
    return p


def write_jsonl(source, records):
    p = os.path.join(OUT, source + ".jsonl")
    with open(p, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return p


def digits(s):
    return re.sub(r"\D", "", s or "")


def cpf_field(raw):
    """Devolve (cpf, kind). kind: 'full' (11 dígitos) ou 'masked' (***.123.456-** -> '123456' = dígitos 4 a 9)."""
    raw = (raw or "").strip()
    if not raw:
        return None, None
    if "*" in raw:
        m = re.fullmatch(r"\*{3}\.?(\d{3})\.?(\d{3})-?\*{2}", raw)
        if m:
            return m.group(1) + m.group(2), "masked"
        return None, None
    d = digits(raw)
    if len(d) == 11:
        return d, "full"
    return None, None


# --------------------------------------------------------------------------- ONU
def parse_un(data):
    root = ET.fromstring(data)
    recs = []

    def txt(el, tag):
        x = el.find(tag)
        return (x.text or "").strip() if x is not None and x.text else ""

    for ind in root.iter("INDIVIDUAL"):
        parts = [txt(ind, t) for t in ("FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME")]
        name = " ".join(p for p in parts if p)
        aliases = [txt(a, "ALIAS_NAME") for a in ind.findall("INDIVIDUAL_ALIAS") if txt(a, "ALIAS_NAME")]
        dobs = []
        for d in ind.findall("INDIVIDUAL_DATE_OF_BIRTH"):
            v = txt(d, "DATE") or txt(d, "YEAR")
            if v:
                dobs.append(v)
        recs.append({
            "source": "un", "ref": txt(ind, "REFERENCE_NUMBER"), "type": "individual", "name": name,
            "aliases": aliases, "cpf": None, "cpf_kind": None, "dob": dobs,
            "info": {"list": txt(ind, "UN_LIST_TYPE"), "listed_on": txt(ind, "LISTED_ON")},
        })
    for ent in root.iter("ENTITY"):
        aliases = [txt(a, "ALIAS_NAME") for a in ent.findall("ENTITY_ALIAS") if txt(a, "ALIAS_NAME")]
        recs.append({
            "source": "un", "ref": txt(ent, "REFERENCE_NUMBER"), "type": "entity", "name": txt(ent, "FIRST_NAME"),
            "aliases": aliases, "cpf": None, "cpf_kind": None, "dob": [],
            "info": {"list": txt(ent, "UN_LIST_TYPE"), "listed_on": txt(ent, "LISTED_ON")},
        })
    return recs


# --------------------------------------------------------------------------- OFAC
def ofac_name(n, individual):
    n = (n or "").strip().strip('"')
    if n == "-0-":
        return ""
    if individual and "," in n:  # pessoa: "LAST, First Middle" -> "First Middle LAST"; entidade fica como está
        last, first = n.split(",", 1)
        return (first.strip() + " " + last.strip()).strip()
    return n


def parse_ofac(sdn, alt):
    alts = {}
    if alt:
        for row in csv.reader(io.StringIO(alt.decode("latin-1"))):
            if len(row) >= 4:
                alts.setdefault(row[0].strip(), []).append(row[3])
    recs = []
    for row in csv.reader(io.StringIO(sdn.decode("latin-1"))):
        if len(row) < 12 or not row[0].strip().isdigit():
            continue
        remarks = row[11].strip() if row[11].strip() != "-0-" else ""
        dobs = re.findall(r"DOB ([^;.]+)", remarks)
        typ = row[2].strip().lower()
        typ = typ if typ and typ != "-0-" else "entity"
        ind = typ == "individual"
        recs.append({
            "source": "ofac", "ref": row[0].strip(), "type": typ,
            "name": ofac_name(row[1], ind),
            "aliases": [x for x in (ofac_name(a, ind) for a in alts.get(row[0].strip(), [])) if x],
            "cpf": None, "cpf_kind": None, "dob": [d.strip() for d in dobs],
            "info": {"program": row[3].strip(), "remarks": remarks[:400]},
        })
    return recs


# --------------------------------------------------------------------------- CGU
def cgu_discover(src):
    """Devolve (stamp, url_zip, como_descobriu)."""
    SRC = src.upper()
    try:
        html, _ = http_get(PORTAL.format(src=src), timeout=60)
        found = re.findall(r'arquivos\.push\(\{"ano"\s*:\s*"(\d{4})",\s*"mes"\s*:\s*"(\d{2})",\s*"dia"\s*:\s*"(\d{0,2})"',
                           html.decode("utf-8", "replace"))
        for st in sorted({a + m + d for a, m, d in found}, reverse=True):
            url = CGU_ZIP.format(src=src, stamp=st, SRC=SRC)
            if http_ok(url):
                return st, url, "pagina do portal (arquivos.push)"
    except Exception:
        pass
    today = dt.date.today()
    if src == "pep":
        y, m = today.year, today.month
        for _ in range(12):
            st = f"{y:04d}{m:02d}"
            url = CGU_ZIP.format(src=src, stamp=st, SRC=SRC)
            if http_ok(url):
                return st, url, "recuo mes a mes"
            m -= 1
            if m == 0:
                y, m = y - 1, 12
    else:
        for i in range(31):
            st = (today - dt.timedelta(days=i)).strftime("%Y%m%d")
            url = CGU_ZIP.format(src=src, stamp=st, SRC=SRC)
            if http_ok(url):
                return st, url, "recuo dia a dia"
    raise RuntimeError(f"nenhum zip {SRC} respondeu 200 (pagina + recuo)")


def read_cgu_csv(zbytes):
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    names = [n for n in z.namelist() if n.lower().endswith(".csv")]
    if not names:
        raise RuntimeError("zip sem csv: " + ", ".join(z.namelist()))
    raw = z.read(names[0])
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    rows = list(csv.reader(io.StringIO(text), delimiter=";"))
    return names[0], rows


def _norm_header(x):
    import unicodedata
    x = unicodedata.normalize("NFKD", x.strip().upper())
    x = "".join(c for c in x if not unicodedata.combining(c))
    return re.sub(r"[\s_]+", " ", x)


def col(header, *cands, required=True):
    h = [_norm_header(x) for x in header]
    cs = [_norm_header(c) for c in cands]
    for c in cs:
        if c in h:
            return h.index(c)
    for c in cs:
        for i, x in enumerate(h):
            if c in x:
                return i
    if required:
        raise RuntimeError(f"coluna {cands} ausente no cabecalho {header}")
    return 10 ** 6


def parse_pep(rows):
    hd = rows[0]
    i_cpf, i_nome = col(hd, "CPF"), col(hd, "NOME PEP", "NOME")
    i_sig = col(hd, "SIGLA FUNCAO", required=False)
    i_desc = col(hd, "DESCRICAO FUNCAO", required=False)
    i_org = col(hd, "NOME ORGAO", required=False)
    i_ini = col(hd, "DATA INICIO EXERCICIO", required=False)
    i_fim = col(hd, "DATA FIM EXERCICIO", required=False)
    i_car = col(hd, "DATA FIM CARENCIA", required=False)
    recs = []
    for r in rows[1:]:
        if len(r) <= max(i_cpf, i_nome):
            continue
        g = lambda i: r[i].strip() if i < len(r) else ""
        cpf, kind = cpf_field(g(i_cpf))
        recs.append({
            "source": "pep", "ref": g(i_cpf) + "|" + g(i_nome), "type": "individual", "name": g(i_nome),
            "aliases": [], "cpf": cpf, "cpf_kind": kind, "dob": [],
            "info": {"funcao": (g(i_sig) + " " + g(i_desc)).strip(), "orgao": g(i_org), "inicio": g(i_ini),
                     "fim": g(i_fim), "fim_carencia": g(i_car)},
        })
    return recs


def parse_sancoes(src, rows):
    hd = rows[0]
    i_tipo = col(hd, "TIPO DE PESSOA")
    i_doc = col(hd, "CPF OU CNPJ DO SANCIONADO")
    i_nome = col(hd, "NOME DO SANCIONADO")
    i_razao = col(hd, "RAZAO SOCIAL - CADASTRO RECEITA", required=False)
    i_cat = col(hd, "CATEGORIA DA SANCAO", required=False)
    i_ini = col(hd, "DATA INICIO SANCAO", required=False)
    i_fim = col(hd, "DATA FINAL SANCAO", required=False)
    i_org = col(hd, "ORGAO SANCIONADOR", required=False)
    i_cad = col(hd, "CADASTRO", required=False)
    recs = []
    for r in rows[1:]:
        if len(r) <= max(i_doc, i_nome):
            continue
        g = lambda i: r[i].strip() if i < len(r) else ""
        pf = g(i_tipo).upper().startswith("F")
        cpf, kind = cpf_field(g(i_doc)) if pf else (None, None)
        aliases = [g(i_razao)] if g(i_razao) and g(i_razao).upper() != g(i_nome).upper() else []
        recs.append({
            "source": src, "ref": g(i_cad) + "|" + g(i_doc) + "|" + g(i_ini), "type": "individual" if pf else "entity",
            "name": g(i_nome), "aliases": aliases, "cpf": cpf, "cpf_kind": kind, "dob": [],
            "doc": None if pf else g(i_doc),
            "info": {"categoria": g(i_cat), "inicio": g(i_ini), "fim": g(i_fim), "orgao": g(i_org)},
        })
    return recs


# --------------------------------------------------------------------------- run
def fetch(src):
    entry = {"source": src, "downloaded_at": now_utc()}
    if src == "un":
        data, final = http_get(URLS["un"])
        save_raw("un_consolidated.xml", data)
        recs = parse_un(data)
        entry.update(url=URLS["un"], final_url=final.split("?")[0], bytes=len(data),
                     sha256=hashlib.sha256(data).hexdigest(), file="raw/un_consolidated.xml")
    elif src == "ofac":
        data, final = http_get(URLS["ofac"])
        save_raw("ofac_sdn.csv", data)
        alt, alt_err = None, None
        try:
            alt, _ = http_get(URLS["ofac_alt"])
            save_raw("ofac_alt.csv", alt)
        except Exception as e:
            alt_err = f"{type(e).__name__}: {e}"
        recs = parse_ofac(data, alt)
        entry.update(url=URLS["ofac"], final_url=final.split("?")[0], bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                     file="raw/ofac_sdn.csv",
                     alt={"url": URLS["ofac_alt"], "bytes": len(alt) if alt else 0,
                          "sha256": hashlib.sha256(alt).hexdigest() if alt else None, "error": alt_err})
    else:
        stamp, url, how = cgu_discover(src)
        data, final = http_get(url, timeout=300)
        fname = f"{stamp}_{src.upper()}.zip"
        save_raw(fname, data)
        csvname, rows = read_cgu_csv(data)
        recs = parse_pep(rows) if src == "pep" else parse_sancoes(src, rows)
        entry.update(url=PORTAL.format(src=src), final_url=url, data_referencia=stamp, descoberta=how,
                     bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), file="raw/" + fname, csv=csvname,
                     header=rows[0] if rows else [])
    if not recs:
        raise RuntimeError("arquivo baixado mas 0 registros normalizados (formato mudou?)")
    write_jsonl(src, recs)
    entry.update(status="ok", records=len(recs),
                 cpf_full=sum(1 for r in recs if r["cpf_kind"] == "full"),
                 cpf_masked=sum(1 for r in recs if r["cpf_kind"] == "masked"))
    return entry


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f)
    return {"sources": {}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="lista separada por vírgula: " + ",".join(ALL))
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    os.makedirs(OUT, exist_ok=True)
    gi = os.path.join(OUT, ".gitignore")
    if not os.path.exists(gi):
        with open(gi, "w") as f:
            f.write("# listas baixadas: dados de terceiros, fora do git\n*\n")
    man = load_manifest()
    if a.status:
        print(json.dumps(man, indent=2, ensure_ascii=False))
        return 0
    srcs = a.only.split(",") if a.only else ALL
    fails = 0
    for s in srcs:
        print(f"[{s}] baixando ...", flush=True)
        try:
            e = fetch(s)
            print(f"[{s}] ok  {e['bytes']:>11,} bytes  {e['records']:>8,} registros  sha256 {e['sha256'][:16]}  "
                  f"cpf completo={e['cpf_full']} mascarado={e['cpf_masked']}")
        except Exception as ex:
            fails += 1
            prev = man["sources"].get(s, {})
            e = {"source": s, "status": "error", "attempted_at": now_utc(), "error": f"{type(ex).__name__}: {ex}"[:500]}
            if prev.get("status") == "ok":
                e["last_ok"] = {k: prev.get(k) for k in ("downloaded_at", "sha256", "bytes", "records", "final_url")}
            elif prev.get("last_ok"):
                e["last_ok"] = prev["last_ok"]
            print(f"[{s}] FALHOU: {e['error']}")
        man["sources"][s] = e
    man["updated_at"] = now_utc()
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(man, f, indent=2, ensure_ascii=False)
    print(f"manifesto: {MANIFEST}")
    return 1 if fails == len(srcs) else 0


if __name__ == "__main__":
    sys.exit(main())
