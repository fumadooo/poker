"""common.py — utilitários compartilhados das ferramentas de compliance (stdlib only).

- db(): conexão pela Management API do Supabase (mesma do tools/migrate.py; PAT no .env, nunca em arquivo versionado).
- cpf_hash(): HMAC-SHA256(COMPLIANCE_CPF_PEPPER, 11 dígitos). O pepper vive só no .env.
- norm_name()/tokens(): normalização de nomes (sem acento, caixa alta, sem pontuação, sem partículas).
- lit()/jlit(): literais SQL seguros (aspas duplicadas; json como ::jsonb).
"""
import hashlib
import hmac
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
LISTS_DIR = os.path.join(ROOT, "compliance", "lists")
sys.path.insert(0, TOOLS)

import migrate  # noqa: E402  (tools/migrate.py: load_env + Db)

PARTICLES = {"DE", "DA", "DO", "DAS", "DOS", "E", "DI", "DU", "DEL", "LA", "LE", "VAN", "VON", "Y", "BIN", "BINT", "AL", "EL"}


def env():
    e = migrate.load_env()
    e.setdefault("COMPLIANCE_CPF_PEPPER", os.environ.get("COMPLIANCE_CPF_PEPPER", ""))
    return e


class DbError(RuntimeError):
    def __init__(self, status, payload):
        self.status, self.payload = status, payload
        try:
            self.message = json.loads(payload).get("message", payload)
        except ValueError:
            self.message = payload
        super().__init__(f"HTTP {status}: {self.message}")


class Db(migrate.Db):
    """migrate.Db com o erro completo (migrate corta em 2000 caracteres)."""

    def query(self, sql):
        import urllib.error
        import urllib.request
        req = urllib.request.Request(self.url, data=json.dumps({"query": sql}).encode("utf-8"), method="POST",
                                     headers={"Authorization": "Bearer " + self.pat, "Content-Type": "application/json",
                                              "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise DbError(e.code, e.read().decode("utf-8", "replace")) from None
        return json.loads(raw) if raw else []


def db():
    e = env()
    return Db(e.get("SUPABASE_PROJECT_REF"), e.get("SUPABASE_PAT"))


def cpf_digits(cpf):
    d = re.sub(r"\D", "", cpf or "")
    return d if len(d) == 11 else None


def cpf_valid(cpf):
    d = cpf_digits(cpf)
    if not d or d == d[0] * 11:
        return False
    for n in (9, 10):
        s = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        dv = (s * 10) % 11 % 10
        if dv != int(d[n]):
            return False
    return True


def cpf_hash(cpf):
    d = cpf_digits(cpf)
    if not d:
        return None
    pepper = env().get("COMPLIANCE_CPF_PEPPER")
    if not pepper:
        sys.exit("COMPLIANCE_CPF_PEPPER ausente no .env")
    return hmac.new(pepper.encode(), d.encode(), hashlib.sha256).hexdigest()


def strip_accents(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c))


def norm_name(s):
    s = strip_accents(s).upper()
    s = re.sub(r"[^A-Z0-9 ]+", " ", s.replace("'", ""))
    return re.sub(r"\s+", " ", s).strip()


def tokens(s):
    return [t for t in norm_name(s).split() if t not in PARTICLES and len(t) > 1]


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def jlit(v):
    return lit(json.dumps(v, ensure_ascii=False, default=str)) + "::jsonb"
