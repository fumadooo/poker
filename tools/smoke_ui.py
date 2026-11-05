# -*- coding: utf-8 -*-
"""POKER · smoke de UI em produção: 2 navegadores (2 usuários de teste) sentam na mesma mesa e jogam pela interface.
Login injetado (sessão Supabase via senha → localStorage/cookie do @supabase/ssr), nada de e-mail.
    python -I tools/smoke_ui.py https://poker-beta-nine.vercel.app
"""
import os, sys, json, time, base64, re, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = {l.split("=", 1)[0]: l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, ".env"), encoding="utf-8") if "=" in l}
URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else E.get("POKER_URL", "https://poker-beta-nine.vercel.app")
SB = E["SUPABASE_URL"]; ANON = E["SUPABASE_ANON_KEY"]; SR = E["SUPABASE_SERVICE_ROLE_KEY"]
REF = E["SUPABASE_PROJECT_REF"]
OUT = os.path.join(ROOT, "run")


def post(url, body, key, token=None):
    h = {"apikey": key, "Content-Type": "application/json", "Authorization": "Bearer " + (token or key)}
    r = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method="POST")
    try: return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e: return {"_err": e.code, "_body": e.read().decode()[:200]}


def session(email, pw="Poker-Teste-2026!"):
    post(SB + "/auth/v1/admin/users", {"email": email, "password": pw, "email_confirm": True}, SR)
    s = post(SB + "/auth/v1/token?grant_type=password", {"email": email, "password": pw}, ANON)
    assert "access_token" in s, s
    return s


def api(path, token, body=None):
    r = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    try: return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e: return json.loads(e.read().decode() or "{}")


def login_ctx(browser, sess, mobile=False):
    vp = {"width": 390, "height": 844} if mobile else {"width": 1280, "height": 800}
    ctx = browser.new_context(viewport=vp)
    val = "base64-" + base64.urlsafe_b64encode(json.dumps(sess).encode()).decode().rstrip("=")
    name = f"sb-{REF}-auth-token"
    host = URL.split("//", 1)[1].split("/")[0]
    # @supabase/ssr guarda a sessão em cookie (em pedaços se grande) e o supabase-js puro em localStorage: põe nos dois
    chunks = [val[i:i + 3180] for i in range(0, len(val), 3180)]
    cookies = [{"name": name if len(chunks) == 1 else f"{name}.{i}", "value": c, "domain": host, "path": "/", "secure": True, "sameSite": "Lax"} for i, c in enumerate(chunks)]
    ctx.add_cookies(cookies)
    ctx.add_init_script(f"try{{localStorage.setItem({json.dumps(name)},{json.dumps(json.dumps(sess))})}}catch(e){{}}")
    return ctx


def main():
    errs = []
    a = session("poker-ui-1@example.com"); b = session("poker-ui-2@example.com")
    for s in (a, b): api("/api/me/credit", s["access_token"], {})
    t = api("/api/tables", a["access_token"], {"name": "Smoke UI", "sb": 50, "bb": 100, "maxSeats": 6, "rakeBps": 500, "rakeCap": None, "minBuyin": 4000, "maxBuyin": 20000})
    tid = (t.get("table") or {}).get("id") or t.get("id")
    print("mesa:", tid, "|", str(t)[:120])
    with sync_playwright() as p:
        br = p.chromium.launch()
        ca = login_ctx(br, a); cb = login_ctx(br, b, mobile=True)
        pa = ca.new_page(); pb = cb.new_page()
        for pg, who in ((pa, "A"), (pb, "B")):
            pg.on("pageerror", lambda e, w=who: errs.append(f"{w} pageerror {e}"))
            pg.on("console", lambda m, w=who: errs.append(f"{w} console {m.text}") if m.type == "error" else None)
        pa.goto(URL + "/", wait_until="networkidle"); pa.wait_for_timeout(2000)
        pa.screenshot(path=os.path.join(OUT, "S1_lobby.png"), full_page=True)
        print("lobby A:", pa.url, "| tem 'Smoke UI':", pa.get_by_text("Smoke UI").count() > 0)
        # senta pelos endpoints (o diálogo já foi testado no U1) e acompanha pela UI
        print("sit A:", api(f"/api/table/{tid}/sit", a["access_token"], {"seat": 1, "buyin": 10000}).get("ok"))
        print("sit B:", api(f"/api/table/{tid}/sit", b["access_token"], {"seat": 4, "buyin": 10000}).get("ok"))
        pa.goto(f"{URL}/table/{tid}", wait_until="networkidle"); pb.goto(f"{URL}/table/{tid}", wait_until="networkidle")
        acted = 0
        for i in range(40):
            pa.wait_for_timeout(1500)
            for pg, who in ((pa, "A"), (pb, "B")):
                for label in ("Pagar", "Passar"):
                    btn = pg.get_by_role("button", name=re.compile("^" + label))
                    if btn.count() and btn.first.is_enabled():
                        btn.first.click(); acted += 1; print(f"  {who} clicou {label}"); pg.wait_for_timeout(1200); break
            st = api(f"/api/table/{tid}/state", a["access_token"])
            street = ((st.get("state") or {}).get("street"))
            if i == 3:
                pa.screenshot(path=os.path.join(OUT, "S1_table_A_desktop.png")); pb.screenshot(path=os.path.join(OUT, "S1_table_B_mobile.png"))
            if street == "ended" or (acted >= 6 and (st.get("state") or {}).get("handNo", 0) >= 2):
                print("mão terminou pela UI | street:", street, "| ações clicadas:", acted); break
        pa.wait_for_timeout(1500)
        pa.screenshot(path=os.path.join(OUT, "S1_result_A.png")); pb.screenshot(path=os.path.join(OUT, "S1_result_B.png"))
        hands = json.load(urllib.request.urlopen(urllib.request.Request(f"{SB}/rest/v1/hands?table_id=eq.{tid}&select=hand_no,pot_cents,rake_cents,board", headers={"apikey": SR, "Authorization": "Bearer " + SR})))
        print("mãos gravadas na mesa:", hands)
        for s in (a, b): api(f"/api/table/{tid}/leave", s["access_token"], {})
        br.close()
    real = [e for e in errs if "favicon" not in e]
    print("erros de página/console:", len(real)); [print("  ", e[:200]) for e in real[:10]]
    ok = acted > 0 and len(hands) >= 1 and not [e for e in real if "pageerror" in e]
    print("== RESULT:", "PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)


if __name__ == "__main__":
    if sys.stdout: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
