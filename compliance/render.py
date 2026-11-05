# -*- coding: utf-8 -*-
"""Renderiza compliance/politicas/*.md em PDF (cabeçalho BLACK OPS, rodapé com código/versão/página, bloco de assinatura).
    python compliance/render.py            # todos
"""
import os, re, sys, glob
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
F = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("Ar", F + "arial.ttf")); pdfmetrics.registerFont(TTFont("ArB", F + "arialbd.ttf"))
pdfmetrics.registerFont(TTFont("ArI", F + "ariali.ttf")); pdfmetrics.registerFont(TTFont("ArBI", F + "arialbi.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("Ar", normal="Ar", bold="ArB", italic="ArI", boldItalic="ArBI")
INK = colors.HexColor("#1a1a1a"); GREY = colors.HexColor("#5a5a5a"); LINE = colors.HexColor("#c8c8c8"); HEAD = colors.HexColor("#262626")
st = lambda **k: ParagraphStyle("x", **{**dict(fontName="Ar", fontSize=9.6, leading=13.6, textColor=INK), **k})
S = {"p": st(spaceAfter=5, alignment=4), "h1": st(fontName="ArB", fontSize=15, leading=19, spaceAfter=8, spaceBefore=4),
     "h2": st(fontName="ArB", fontSize=11.5, leading=15, spaceBefore=10, spaceAfter=5),
     "h3": st(fontName="ArB", fontSize=10.2, leading=14, spaceBefore=7, spaceAfter=3),
     "li": st(leftIndent=14, bulletIndent=4, spaceAfter=2.5, alignment=4), "td": st(fontSize=8.4, leading=11), "th": st(fontName="ArB", fontSize=8.4, leading=11, textColor=colors.white)}

def inline(t):
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t); t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<i>\1</i>", t)
    t = re.sub(r"`(.+?)`", r"<font name='Courier' size='8.6'>\1</font>", t)
    t = re.sub(r"\[(.+?)\]\((.+?)\)", r"\1 (\2)", t)
    return t

def table(rows, width):
    rows = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
    n = max(len(r) for r in rows); rows = [r + [""] * (n - len(r)) for r in rows]
    lens = [max(len(r[i]) for r in rows) + 4 for i in range(n)]; tot = sum(lens)
    cw = [width * l / tot for l in lens]
    data = [[Paragraph(inline(c), S["th"] if i == 0 else S["td"]) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), HEAD), ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f3f3")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t

def parse(md, width):
    out, lines, i = [], md.splitlines(), 0
    while i < len(lines):
        l = lines[i]
        if l.strip().startswith("|"):
            blk = []
            while i < len(lines) and lines[i].strip().startswith("|"): blk.append(lines[i]); i += 1
            out += [table(blk, width), Spacer(1, 6)]; continue
        s = l.strip(); i += 1
        if not s or s in ("---", "***"): continue
        m = re.match(r"(#{1,4})\s+(.*)", s)
        if m:
            lvl = len(m.group(1)); out.append(Paragraph(inline(m.group(2)), S["h1" if lvl == 1 else "h2" if lvl == 2 else "h3"])); continue
        m = re.match(r"(\s*)([-*•]|\d+[.)]|[a-z]\))\s+(.*)", l)
        if m:
            ind = len(m.group(1).replace("\t", "  ")) // 2
            b = "•" if m.group(2) in "-*•" else m.group(2)
            out.append(Paragraph(inline(m.group(3)), ParagraphStyle("li", parent=S["li"], leftIndent=14 + 12 * ind, bulletIndent=4 + 12 * ind), bulletText=b)); continue
        para = [s]
        while i < len(lines) and lines[i].strip() and not re.match(r"\s*(#|\||[-*•]\s|\d+[.)]\s)", lines[i]): para.append(lines[i].strip()); i += 1
        out.append(Paragraph(inline(" ".join(para)), S["p"]))
    return out

def render(md_path, pdf_path):
    md = open(md_path, encoding="utf-8").read()
    code = os.path.basename(md_path).split("_")[0]
    title = next((re.sub(r"^#\s+", "", l) for l in md.splitlines() if l.startswith("# ")), code)
    W, H = A4; M = 20 * mm
    def deco(c, d):
        c.saveState(); c.setFillColor(HEAD); c.rect(0, H - 16 * mm, W, 16 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("ArB", 12); c.drawString(M, H - 10.2 * mm, "BLACK OPS LTDA")
        c.setFont("Ar", 8); c.drawRightString(W - M, H - 10.2 * mm, "CNPJ 58.557.156/0001-58  ·  Uso interno e de parceiros autorizados")
        c.setStrokeColor(LINE); c.line(M, 14 * mm, W - M, 14 * mm); c.setFillColor(GREY); c.setFont("Ar", 7.6)
        c.drawString(M, 9.5 * mm, f"{code}  ·  {(title if len(title) <= 70 else title[:title.rfind(" ", 0, 67)] + "…")}"); c.drawRightString(W - M, 9.5 * mm, f"Versão 1.0  ·  05/11/2026  ·  Página {d.page}")
        c.restoreState()
    doc = BaseDocTemplate(pdf_path, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=24 * mm, bottomMargin=20 * mm, title=title, author="BLACK OPS LTDA")
    doc.addPageTemplates([PageTemplate(frames=[Frame(M, 20 * mm, W - 2 * M, H - 44 * mm, id="f")], onPage=deco)])
    story = parse(md, W - 2 * M)
    if not re.search(r"assinatura|_{6,}", md[-1500:], re.I):
        sig = Table([["", ""], ["Raphael Mendonça Barros Silva\nAdministrador · aprovação", "Michael Mendonça Barros Silva\nDiretor de Compliance e PLD/FTP · responsável"]],
                    colWidths=[(W - 2 * M) / 2 - 6] * 2, rowHeights=[22 * mm, None])
        sig.setStyle(TableStyle([("LINEABOVE", (0, 1), (0, 1), 0.7, INK), ("LINEABOVE", (2, 1), (2, 1), 0.7, INK), ("FONT", (0, 1), (-1, 1), "Ar", 8.4),
                                 ("TEXTCOLOR", (0, 1), (-1, 1), GREY), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        story += [Spacer(1, 10), KeepTogether([Paragraph("<b>Aprovação</b> — Florianópolis/SC, 05/11/2026.", S["p"]), sig])]
    doc.build(story)

if __name__ == "__main__":
    for f in sorted(glob.glob(os.path.join(HERE, "politicas", "*.md"))):
        out = os.path.join(HERE, "pdf", os.path.basename(f)[:-3] + ".pdf"); render(f, out); print("ok", os.path.basename(out))
