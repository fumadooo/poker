# -*- coding: utf-8 -*-
"""Simulador do JOGADOR (didático, uma aba): 6 variáveis → 6 respostas → plano dia a dia.
    python -I tools/simulador_build.py  ->  C:/Users/micha/Downloads/simulador_jogador_poker.xlsx
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import DataBarRule, FormulaRule

OUT = "C:/Users/micha/Downloads/simulador_jogador_poker.xlsx"
F = "Arial"
INK = "1F2937"; GREEN = "15803D"; LGREEN = "DCFCE7"; YEL = "FFF4CC"; LBLUE = "E0EAFF"; GREYT = "6B7280"; LINE = "D1D5DB"
fill = lambda c: PatternFill("solid", fgColor=c)
side = Side(style="thin", color=LINE); BOX = Border(left=side, right=side, top=side, bottom=side)
RS = '"R$ "#,##0;"-R$ "#,##0;"R$ 0"'; RS2 = '"R$ "#,##0.00;"-R$ "#,##0.00;"R$ 0"'; N0 = '#,##0'; N1 = '#,##0.0'; PC = '0%'
MAOS_HORA = 49      # média real por mesa (Brasa, mesa de R$ 5)
BUYIN_BB = 40       # entrada mínima de uma mesa = 40 big blinds

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Simulador"
ws.sheet_view.showGridLines = False; ws.sheet_view.zoomScale = 110
for col, w in zip("ABCDEFGHI", [3, 34, 16, 4, 20, 20, 20, 20, 3]): ws.column_dimensions[col].width = w

def put(ref, v, size=11, bold=False, color=INK, bg=None, fmt=None, al="left", wrap=False):
    c = ws[ref]; c.value = v; c.font = Font(name=F, size=size, bold=bold, color=color)
    if bg: c.fill = fill(bg)
    if fmt: c.number_format = fmt
    c.alignment = Alignment(horizontal=al, vertical="center", wrap_text=wrap)
    return c

# título
ws.row_dimensions[2].height = 30
put("B2", "Seu plano de banca no poker", 18, True)
put("B3", "Preencha os campos amarelos. O resto a planilha calcula.", 10, color=GREYT)

# -------- VARIÁVEIS (só 6)
put("B5", "VOCÊ ESCOLHE", 10, True, "FFFFFF", INK); ws["C5"].fill = fill(INK)
inputs = [("Banca inicial", 297, RS), ("Valor da ficha (big blind da mesa)", 5, RS2), ("Mesas ao mesmo tempo", 1, N0),
          ("Horas por dia", 1, N1), ("Dias do plano", 30, N0), ("Meta de lucro no plano", 1900, RS)]
I = {}
for i, (lab, val, fmt) in enumerate(inputs):
    r = 6 + i; ws.row_dimensions[r].height = 24
    put(f"B{r}", lab, 11); c = put(f"C{r}", val, 13, True, "1D4ED8", YEL, fmt, "center"); c.border = BOX
    I[lab] = f"$C${r}"
BANCA, FICHA, MESAS, HORAS, DIAS, META = (I[k] for k, _, _ in inputs)

# -------- RESPOSTAS (cartões)
put("E5", "SUA META PEDE", 10, True, "FFFFFF", INK)
for col in "FGH": ws[f"{col}5"].fill = fill(INK)
cards = [
    ("E", "Lucro por dia", f"=IF({DIAS}=0,0,{META}/{DIAS})", RS2),
    ("F", "Lucro por hora", f"=IF({DIAS}*{HORAS}=0,0,{META}/({DIAS}*{HORAS}))", RS2),
    ("G", "Mãos por dia", f"={MESAS}*{HORAS}*{MAOS_HORA}", N0),
    ("H", "Ganhar a cada 100 mãos", f"=IF({MESAS}*{HORAS}*{DIAS}*{FICHA}=0,0,{META}/({MESAS}*{HORAS}*{MAOS_HORA}*{DIAS}/100*{FICHA}))", '#,##0.0" fichas"'),
]
for col, lab, f, fmt in cards:
    put(f"{col}6", lab, 10, color=GREYT, bg=LBLUE, al="center")
    put(f"{col}7", f, 18, True, INK, LBLUE, fmt, "center"); ws.row_dimensions[7].height = 34
    ws[f"{col}8"].fill = fill(LBLUE)
cards2 = [
    ("E", "Entrada mínima da mesa", f"={FICHA}*{BUYIN_BB}", RS),
    ("F", "Você pode sentar?", f'=IF({BANCA}>={FICHA}*{BUYIN_BB},"SIM","NÃO")', "@"),
    ("G", "Entradas que a banca paga", f"=IF({FICHA}=0,0,{BANCA}/({FICHA}*{BUYIN_BB}))", N1),
    ("H", "Banca no fim do plano", f"={BANCA}+{META}", RS),
]
for col, lab, f, fmt in cards2:
    put(f"{col}9", lab, 10, color=GREYT, bg=LGREEN, al="center")
    put(f"{col}10", f, 18, True, GREEN, LGREEN, fmt, "center"); ws.row_dimensions[10].height = 34
    ws[f"{col}11"].fill = fill(LGREEN)
ws.conditional_formatting.add("F10", FormulaRule(formula=['F10="NÃO"'], font=Font(name=F, size=18, bold=True, color="B91C1C"), fill=fill("FEE2E2")))

put("B12", "Ganhar a cada 100 mãos = quantas fichas (big blinds) você precisa somar, em média, a cada 100 mãos jogadas para chegar na meta.", 9, color=GREYT, wrap=True)
ws.merge_cells("B12:H13")

# -------- PLANO DIA A DIA
put("B15", "SEU PLANO DIA A DIA", 10, True, "FFFFFF", INK)
for col in "CEFGH": ws[f"{col}15"].fill = fill(INK)
heads = [("B", "Dia"), ("C", "Mãos no dia"), ("E", "Lucro do dia"), ("F", "Lucro acumulado"), ("G", "Sua banca"), ("H", "Meta")]
for col, h in heads:
    c = put(f"{col}16", h, 10, True, INK, "F3F4F6", al="center"); c.border = BOX
ws["D16"].fill = fill("F3F4F6")
first = 17
for k in range(1, 61):
    r = first + k - 1; on = f"$B{r}<={DIAS}"
    put(f"B{r}", k, 10, al="center")
    put(f"C{r}", f"=IF({on},{MESAS}*{HORAS}*{MAOS_HORA},\"\")", 10, fmt=N0, al="center")
    put(f"E{r}", f"=IF({on},{META}/{DIAS},\"\")", 10, fmt=RS2, al="center")
    put(f"F{r}", f"=IF({on},{META}/{DIAS}*B{r},\"\")", 10, fmt=RS, al="center")
    put(f"G{r}", f"=IF({on},{BANCA}+{META}/{DIAS}*B{r},\"\")", 10, True, fmt=RS, al="center")
    put(f"H{r}", f"=IF({on},B{r}/{DIAS},\"\")", 10, fmt=PC, al="center")
    for col in "BCEFGH": ws[f"{col}{r}"].border = BOX
last = first + 59
ws.conditional_formatting.add(f"B{first}:H{last}", FormulaRule(formula=[f"$B{first}>{DIAS}"], font=Font(color="FFFFFF"), border=Border()))
ws.conditional_formatting.add(f"H{first}:H{last}", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color="22C55E"))
ws.conditional_formatting.add(f"B{first}:H{last}", FormulaRule(formula=[f"AND($B{first}<={DIAS},MOD($B{first},7)=0)"], fill=fill("F9FAFB")))
ws.freeze_panes = "A17"

put(f"B{last+2}", f"Base: {MAOS_HORA} mãos por hora em cada mesa e entrada mínima de {BUYIN_BB} fichas, médias reais de mesas online. "
                  "Poker tem altos e baixos: o plano mostra o caminho da meta, não garante o resultado. Proibido para menores de 18 anos.", 9, color=GREYT, wrap=True)
ws.merge_cells(f"B{last+2}:H{last+3}")
ws.print_area = f"A1:I{last+3}"; ws.page_setup.fitToWidth = 1; ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.page_setup.fitToHeight = 0
wb.calculation.fullCalcOnLoad = True
wb.save(OUT); print("ok", OUT)
