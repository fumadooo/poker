# -*- coding: utf-8 -*-
"""Gera public/*.html a partir de src/*.html (conteúdo) + layout único. python -I build.py"""
import os, re, glob, shutil
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(H, "public")
NAV = [("/", "Empresa"), ("/compliance", "Integridade e Compliance"), ("/privacidade", "Privacidade"),
       ("/termos", "Termos de Uso"), ("/jogo-responsavel", "Jogo Responsável"), ("/contato", "Contato e Denúncia")]
LAYOUT = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex,notranslate"><meta name="googlebot" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>{title} · BLACK OPS LTDA</title>
<link rel="stylesheet" href="/styles.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml"></head>
<body><header class="top"><div class="wrap bar"><a class="brand" href="/"><span class="mark">BO</span><span>BLACK OPS <small>LTDA</small></span></a>
<button class="menu" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')">☰</button>
<nav>{nav}</nav></div></header>
<main class="wrap">{body}</main>
<footer><div class="wrap foot"><div><b>BLACK OPS LTDA</b><br>CNPJ 58.557.156/0001-58 · NIRE 42208911825<br>
Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88015-100</div>
<div><a href="/compliance">Programa de Integridade</a><br><a href="/privacidade">Política de Privacidade</a><br><a href="/contato">Canal de Denúncia</a></div>
<div class="muted">Proibido para menores de 18 anos nas atividades de jogo.<br>Documento público · atualizado em 05/11/2026</div></div></footer></body></html>"""
def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(H, "src", "*.html")):
        name = os.path.basename(f)[:-5]; raw = open(f, encoding="utf-8").read()
        title = re.search(r"<!--title:(.*?)-->", raw).group(1).strip()
        href = "/" if name == "index" else "/" + name
        nav = "".join(f'<a href="{h}"{" class=on" if h == href else ""}>{t}</a>' for h, t in NAV)
        open(os.path.join(OUT, name + ".html"), "w", encoding="utf-8").write(LAYOUT.format(title=title, nav=nav, body=raw))
    for a in ("styles.css", "favicon.svg", "robots.txt"): shutil.copy(os.path.join(H, "src", a), os.path.join(OUT, a))
    print("ok", sorted(os.listdir(OUT)))
if __name__ == "__main__": main()
