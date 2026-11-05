# -*- coding: utf-8 -*-
"""Deploy do site institucional BLACK OPS na Vercel (REST). Cria o projeto/env na 1ª vez. python -I deploy.py"""
import os, sys, json, time, hashlib, secrets, urllib.request, urllib.error
H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(H); API = "https://api.vercel.com"; NAME = "blackops-ltda"
E = {l.split("=", 1)[0].strip(): l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, ".env"), encoding="utf-8") if "=" in l and not l.startswith("#")}
TEAM = E["VERCEL_TEAM_ID"]
TOK = E.get("VERCEL_TOKEN") or json.load(open(os.path.expandvars(r"%APPDATA%\com.vercel.cli\Data\auth.json")))["token"]
def req(m, p, data=None, raw=None, headers=None):
    h = {"Authorization": "Bearer " + TOK}; h.update(headers or {})
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    if raw is None and data is not None: h["Content-Type"] = "application/json"
    r = urllib.request.Request(API + p + ("&" if "?" in p else "?") + "teamId=" + TEAM, data=body, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=120) as x: return json.loads(x.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        t = e.read().decode(); 
        if e.code == 409 or e.code == 404: return {"_err": e.code, "_body": t}
        raise SystemExit(f"{m} {p} -> {e.code} {t[:300]}")
def main():
    import subprocess; subprocess.run([sys.executable, "-I", os.path.join(H, "build.py")], check=True)
    p = req("GET", f"/v9/projects/{NAME}")
    if p.get("_err") == 404:
        p = req("POST", "/v10/projects", {"name": NAME, "framework": None}); print("projeto criado", p.get("id"))
        envs = [("SUPABASE_URL", E["SUPABASE_URL"]), ("SUPABASE_SERVICE_ROLE_KEY", E["SUPABASE_SERVICE_ROLE_KEY"]), ("SITE_IP_SALT", secrets.token_hex(24))]
        for k, v in envs: req("POST", f"/v10/projects/{p['id']}/env", {"key": k, "value": v, "type": "encrypted", "target": ["production", "preview"]})
    pid = p["id"]
    files = []
    for base in ("public", "api"):
        for r, _, ns in os.walk(os.path.join(H, base)):
            for n in ns:
                full = os.path.join(r, n); rel = os.path.relpath(full, H).replace("\\", "/"); d = open(full, "rb").read()
                files.append((rel, d, hashlib.sha1(d).hexdigest(), len(d)))
    for n in ("vercel.json", "package.json"):
        d = open(os.path.join(H, n), "rb").read(); files.append((n, d, hashlib.sha1(d).hexdigest(), len(d)))
    for rel, d, sha, size in files:
        req("POST", "/v2/files", raw=d, headers={"x-vercel-digest": sha, "Content-Length": str(size), "Content-Type": "application/octet-stream"})
    dep = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", {"name": NAME, "project": pid, "target": "production",
        "projectSettings": {"framework": None, "outputDirectory": "public", "buildCommand": "", "installCommand": ""},
        "files": [{"file": rel, "sha": sha, "size": size} for rel, _, sha, size in files]})
    if "id" not in dep: raise SystemExit(dep)
    for _ in range(120):
        time.sleep(4); s = req("GET", "/v13/deployments/" + dep["id"]); st = s.get("readyState"); print("estado:", st, flush=True)
        if st == "READY": print("READY", s.get("alias")); return
        if st in ("ERROR", "CANCELED"): raise SystemExit("falhou: " + json.dumps(s)[:600])
if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8"); main()
