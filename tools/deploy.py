# -*- coding: utf-8 -*-
"""POKER · deploy por REST na Vercel (sem CLI): sobe o monorepo (raiz = workspaces, rootDirectory = app),
cria o deployment de produção e espera READY. Nunca confia em "created".

    python tools/deploy.py            # produção
    python tools/deploy.py --preview  # preview

Token: CLI auth.json (%APPDATA%/com.vercel.cli/Data/auth.json; renove com `vercel whoami`) ou VERCEL_TOKEN no .env.
"""
import os, sys, json, time, hashlib, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.vercel.com"
SKIP_DIRS = {"node_modules", ".next", ".git", ".vercel", "run", "dist", "__pycache__", ".turbo"}
SKIP_FILES = {".env", ".env.local"}


def env():
    d = {}
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1); d[k.strip()] = v.strip()
    return d


def token(e):
    if e.get("VERCEL_TOKEN"): return e["VERCEL_TOKEN"]
    a = os.path.expandvars(r"%APPDATA%\com.vercel.cli\Data\auth.json")
    if os.path.exists(a): return json.load(open(a, encoding="utf-8"))["token"]
    sys.exit("sem token Vercel")


def req(method, path, tok, team, data=None, headers=None, raw=None):
    url = API + path + ("&" if "?" in path else "?") + "teamId=" + team
    h = {"Authorization": "Bearer " + tok}
    if headers: h.update(headers)
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    if raw is None and data is not None: h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(r, timeout=120) as resp:
        t = resp.read().decode() or "{}"
        return json.loads(t)


def main():
    e = env(); tok = token(e)
    proj = json.load(open(os.path.join(ROOT, ".vercel", "project.json"), encoding="utf-8"))
    team, pid = proj["orgId"], proj["projectId"]
    target = "preview" if "--preview" in sys.argv else "production"
    # Upload = app/ como raiz + motor compilado em vendor/engine (a Vercel não enxerga fora do rootDirectory)
    import subprocess
    subprocess.run("npm --prefix packages/engine run build", shell=True, cwd=ROOT, check=True)
    files = []
    def add(base, prefix, skip_dirs):
        for root, dirs, names in os.walk(base):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for n in names:
                if n in SKIP_FILES or n.endswith((".pyc", ".log", ".png", ".map")): continue
                full = os.path.join(root, n); rel = prefix + os.path.relpath(full, base).replace("\\", "/")
                data = open(full, "rb").read()
                if rel == "package.json":
                    pj = json.loads(data); pj["dependencies"]["@poker/engine"] = "file:./vendor/engine"; data = json.dumps(pj, indent=2).encode()
                files.append((rel, data, hashlib.sha1(data).hexdigest(), len(data)))
    add(os.path.join(ROOT, "app"), "", SKIP_DIRS | {"vendor"})
    eng = os.path.join(ROOT, "packages", "engine")
    for n in ("package.json",):
        d = open(os.path.join(eng, n), "rb").read(); files.append(("vendor/engine/" + n, d, hashlib.sha1(d).hexdigest(), len(d)))
    add(os.path.join(eng, "dist"), "vendor/engine/dist/", {"__tests__"})
    files = [f for f in files if f[0] != "package-lock.json"]
    print("arquivos: %d (%.2f MB)" % (len(files), sum(f[3] for f in files) / 1e6))
    # garante settings do projeto (monorepo: app/ como raiz, install na raiz do workspace)
    req("PATCH", "/v9/projects/" + pid, tok, team, {"framework": "nextjs", "rootDirectory": None, "nodeVersion": "22.x",
        "installCommand": None, "buildCommand": None})
    for rel, data, sha, size in files:
        try:
            req("POST", "/v2/files", tok, team, raw=data, headers={"x-vercel-digest": sha, "Content-Length": str(size), "Content-Type": "application/octet-stream"})
        except urllib.error.HTTPError as ex:
            if ex.code != 409: raise
    d = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", tok, team, {
        "name": "poker", "project": pid, "target": target,
        "files": [{"file": rel, "sha": sha, "size": size} for rel, _, sha, size in files]})
    dep = d["id"]; print("deployment:", dep, d.get("url"))
    for _ in range(180):
        time.sleep(5)
        s = req("GET", "/v13/deployments/" + dep, tok, team)
        st = s.get("readyState")
        print("estado:", st, flush=True)
        if st == "READY":
            print("READY https://" + s["url"], "| aliases:", s.get("alias"))
            return
        if st in ("ERROR", "CANCELED"):
            ev = req("GET", f"/v3/deployments/{dep}/events?limit=-1&builds=1", tok, team)
            for x in (ev if isinstance(ev, list) else [])[-40:]:
                t = x.get("text") or (x.get("payload") or {}).get("text") or ""
                if t.strip(): print("  ", t[:220])
            sys.exit("deploy falhou: " + st)
    sys.exit("timeout esperando READY")


if __name__ == "__main__":
    if sys.stdout: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
