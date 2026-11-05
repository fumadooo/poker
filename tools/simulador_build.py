# -*- coding: utf-8 -*-
"""Simulador do jogador — UMA aba: variáveis (azul) → resultado → tabela dia a dia (banca, resultado, rake, receita da casa).
Estilo da business_health_v3 (cabeçalhos D9E2F3, totais E2EFDA, links verdes, notas cinza).
    python -I tools/simulador_build.py  ->  C:/Users/micha/Downloads/simulador_jogador_poker.xlsx
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import FormulaRule

OUT = "C:/Users/micha/Downloads/simulador_jogador_poker.xlsx"
F = "Arial"
BLUE = Font(name=F, color="0000FF"); BLK = Font(name=F); BOLD = Font(name=F, bold=True); GREY = Font(name=F, color="595959", size=9)
H1 = Font(name=F, bold=True, size=14)
SEC = PatternFill("solid", fgColor="D9E2F3"); TOT = PatternFill("solid", fgColor="E2EFDA"); YEL = PatternFill("solid", fgColor="FFF2CC")
thin = Side(style="thin", color="D0D5DD"); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
RS = '"R$ "#,##0;"(R$ "#,##0\\);\\-'; RS2 = '"R$ "#,##0.00;"(R$ "#,##0.00\\);\\-'; N0 = '#,##0;\\(#,##0\\);\\-'; N1 = '#,##0.0;\\(#,##0.0\\);\\-'; PC = '0.0%;\\(0.0%\\);\\-'

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Simulador"
ws.sheet_view.showGridLines = False
for col, w in zip("ABCDEFGHIJKLMNOP", [46, 16, 3, 7, 10, 12, 13, 13, 13, 13, 13, 12, 13, 13, 13, 13]): ws.column_dimensions[col].width = w

def cell(ref, v, font=BLK, fmt=None, fill=None):
    c = ws[ref]; c.value = v; c.font = font
    if fmt: c.number_format = fmt
    if fill: c.fill = fill
    return c
def sec(row, title):
    for col in "AB": ws[f"{col}{row}"].fill = SEC
    cell(f"A{row}", title, BOLD, fill=SEC)
def note(ref, t): cell(ref, t, GREY)

cell("A1", "Simulador do jogador — mude as variáveis azuis e veja o resultado por dia", H1)
note("A2", "Tudo é fórmula. Valores padrão = o que funciona hoje na Brasa (SPY-brasa, 04–05/11/2026). Material de gestão de banca: mostra exigências, não garante resultado.")

# ---------------- VARIÁVEIS
sec(4, "VARIÁVEIS (edite)")
V = {}
var = [
    ("banca", "Banca inicial (R$)", 297, RS, "Pacotes testados: 47 · 97 · 297 · 497 · 697."),
    ("bb", "Valor da ficha — big blind da mesa (R$)", 5, RS2, "Mesas medidas: 5 · 10 · 25."),
    ("bi_bb", "Buy-in por entrada (em big blinds)", 47, N0, "Média da Brasa na mesa de R$ 5: 47 bb (R$ 233). Mínimo da Brasa: 40 bb."),
    ("mesas", "Mesas ao mesmo tempo", 1, N0, None),
    ("horas", "Horas por dia", 1, N1, None),
    ("dias", "Dias", 30, N0, "Até 60 dias na tabela."),
    ("mph", "Mãos por hora por mesa", 49, N0, "Medido na Brasa (mesa de R$ 5): 49."),
    ("rake", "Rake pago pelo jogador (bb a cada 100 mãos)", 27.3, N1, "Medido na Brasa (mesa de R$ 5): 27,3. Mesa de R$ 10: 31,9 · R$ 25: 18,9."),
    ("meta", "Meta de lucro líquido no período (R$)", 1900, RS, None),
    ("ganho", "Ganho do jogador testado (bb a cada 100 mãos, já pago o rake)", None, N1, "Padrão = exatamente o necessário para a meta. Digite outro valor para testar."),
    ("sd", "Oscilação do poker (desvio padrão, bb a cada 100 mãos)", 95, N0, "Referência de mercado para cash 6-max: 80–100."),
    ("stop", "Stop-loss diário (em buy-ins)", 1, N1, None),
    ("casa", "Parte do rake que fica com a casa", 0.85, PC, "Benchmark Brasa: 85%."),
    ("imp", "Impostos sobre a receita da casa", 0.2125, PC, None),
    ("cb", "Cashback / rakeback ao jogador (% do rake)", 0.176, PC, None),
]
r = 5
for key, label, val, fmt, nt in var:
    cell(f"A{r}", label); V[key] = f"$B${r}"
    c = cell(f"B{r}", val, BLUE, fmt, YEL); c.border = BOX
    if nt: note(f"D{r}", nt)
    r += 1
# ganho padrão = necessário (fórmula, definida depois que o necessário existe)

# ---------------- RESULTADO
r += 1; sec(r, "RESULTADO"); cell(f"B{r}", "valor", BOLD, fill=SEC); r += 1
R = {}
res = [
    ("bi", "Buy-in por entrada (R$)", f"={V['bb']}*{V['bi_bb']}", RS2),
    ("bimin", "Buy-in mínimo para sentar (40 bb, R$)", f"={V['bb']}*40", RS2),
    ("senta", "Pode sentar?", None, "@"),
    ("entr", "Entradas que a banca cobre", None, N1),
    ("mdia", "Mãos por dia", f"={V['mesas']}*{V['horas']}*{V['mph']}", N0),
    ("mtot", "Mãos no período", None, N0),
    ("ldia", "Lucro necessário por dia (R$)", f"=IF({V['dias']}=0,0,{V['meta']}/{V['dias']})", RS2),
    ("lhora", "Lucro necessário por hora (R$)", f"=IF({V['dias']}*{V['horas']}=0,0,{V['meta']}/({V['dias']}*{V['horas']}))", RS2),
    ("lbb", "Lucro necessário em big blinds", f"=IF({V['bb']}=0,0,{V['meta']}/{V['bb']})", N0),
    ("lbi", "Lucro necessário em buy-ins", None, N1),
    ("nec", "GANHO NECESSÁRIO (bb a cada 100 mãos, já pago o rake)", None, N1),
    ("antes", "GANHO ANTES DO RAKE (bb a cada 100 mãos)", None, N1),
    ("rdia", "Resultado esperado por dia com o ganho testado (R$)", None, RS2),
    ("osc", "Oscilação típica de um dia (± R$)", None, RS2),
    ("perda", "Perda máxima num dia com o stop-loss (R$)", None, RS2),
    ("aguenta", "Dias ruins seguidos que a banca aguenta (no stop-loss)", None, N1),
    ("rtot", "Resultado esperado no período (R$)", None, RS),
    ("bfim", "Banca no fim do período (R$)", None, RS),
    ("bate", "Bate a meta?", None, "@"),
    ("dmeta", "Dias até a meta com o ganho testado", None, N1),
    ("rkdia", "Rake que o jogador paga por dia (R$)", None, RS2),
    ("rktot", "Rake que o jogador paga no período (R$)", None, RS),
    ("rcasa", "Receita líquida da casa com este jogador no período (R$)", None, RS),
]
for key, label, f, fmt in res:
    cell(f"A{r}", label, BOLD if key in ("nec", "antes", "bfim", "bate") else BLK); R[key] = f"$B${r}"
    if f: cell(f"B{r}", f, fmt=fmt)
    r += 1
def setf(key, f, fmt, font=BLK, fill=None): cell(R[key].replace("$", ""), f, font, fmt, fill)
setf("senta", f'=IF({V["banca"]}>={R["bimin"]},"SIM","NÃO — banca abaixo do mínimo")', "@", BOLD)
setf("entr", f"=IF({R['bi']}=0,0,{V['banca']}/{R['bi']})", N1)
setf("mtot", f"={R['mdia']}*{V['dias']}", N0)
setf("lbi", f"=IF({R['bi']}=0,0,{V['meta']}/{R['bi']})", N1)
setf("nec", f"=IF({R['mtot']}*{V['bb']}=0,0,{V['meta']}/({R['mtot']}/100*{V['bb']}))", N1, BOLD, TOT)
setf("antes", f"={R['nec']}+{V['rake']}", N1, BOLD, TOT)
setf("rdia", f"={R['mdia']}/100*{V['ganho']}*{V['bb']}", RS2)
setf("osc", f"={V['sd']}*SQRT({R['mdia']}/100)*{V['bb']}", RS2)
setf("perda", f"={V['stop']}*{R['bi']}", RS2)
setf("aguenta", f"=IF({R['perda']}=0,0,{V['banca']}/{R['perda']})", N1)
setf("rtot", f"={R['rdia']}*{V['dias']}", RS)
setf("bfim", f"={V['banca']}+{R['rtot']}", RS, BOLD, TOT)
setf("bate", f'=IF({R["rtot"]}>={V["meta"]}-0.01,"SIM","NÃO")', "@", BOLD, TOT)
setf("dmeta", f'=IF({R["rdia"]}<=0,"nunca",{V["meta"]}/{R["rdia"]})', N1)
setf("rkdia", f"={R['mdia']}/100*{V['rake']}*{V['bb']}", RS2)
setf("rktot", f"={R['rkdia']}*{V['dias']}", RS)
setf("rcasa", f"={R['rktot']}*{V['casa']}*(1-{V['imp']}-{V['cb']})", RS)
cell(V["ganho"].replace("$", ""), f"={R['nec']}", BLUE, N1, YEL)
note(f"D{int(R['osc'].split('$')[-1])}", "Num dia normal o resultado varia, para cima ou para baixo, cerca deste valor em torno do esperado.")
note(f"D{int(R['senta'].split('$')[-1])}", "Banca ≥ buy-in mínimo da mesa.")

# ---------------- MATRIZ RÁPIDA: ganho necessário por mesas × horas
r += 1; sec(r, "GANHO NECESSÁRIO (bb/100) — mesas ao mesmo tempo × horas por dia"); r += 1
cell(f"A{r}", "horas por dia →", BOLD)
hrs = [1, 2, 3, 4]
for j, h in enumerate(hrs): cell(f"{'BDEF'[j] if False else chr(ord('B')+j)}{r}", h, BOLD, N0)
hr = r; r += 1
for i, mz in enumerate([1, 2, 3, 4]):
    cell(f"A{r}", f"{mz} mesa(s)")
    for j in range(len(hrs)):
        col = chr(ord('B') + j)
        cell(f"{col}{r}", f"=IF({col}${hr}*{mz}*{V['mph']}*{V['dias']}*{V['bb']}=0,0,{V['meta']}/({col}${hr}*{mz}*{V['mph']}*{V['dias']}/100*{V['bb']}))", fmt=N1)
    r += 1
note(f"A{r}", "Mesma meta, mesma ficha e mesmos dias das variáveis. Quanto mais mãos, menos ganho por 100 mãos a meta exige.")
# matriz ocupa colunas B..E: afasta a tabela diária para a coluna G
# ---------------- TABELA DIA A DIA (à direita)
T0 = 4; c0 = "G"
heads = ["Dia", "Mãos do dia", "Mãos acumuladas", "Resultado esperado do dia (R$)", "Dia ruim (−1 oscilação, R$)", "Banca no início (R$)",
         "Banca no fim (R$)", "Lucro acumulado (R$)", "% da meta", "Rake pago no dia (R$)", "Receita da casa acumulada (R$)"]
cols = [chr(ord(c0) + i) for i in range(len(heads))]
for col, h in zip(cols, heads):
    c = ws[f"{col}{T0}"]; c.value = h; c.font = BOLD; c.fill = SEC; c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = BOX
ws.row_dimensions[T0].height = 44
ws.column_dimensions["G"].width = 6
for k in range(1, 61):
    rr = T0 + k; d, m, ma, res_, bad, bi_, bf, la, pm, rk, rc = cols
    on = f"{d}{rr}<={V['dias']}"
    cell(f"{d}{rr}", k, fmt=N0)
    cell(f"{m}{rr}", f"=IF({on},{R['mdia']},0)", fmt=N0)
    cell(f"{ma}{rr}", f"={m}{rr}" if k == 1 else f"={ma}{rr-1}+{m}{rr}", fmt=N0)
    cell(f"{res_}{rr}", f"={m}{rr}/100*{V['ganho']}*{V['bb']}", fmt=RS2)
    cell(f"{bad}{rr}", f"=IF({on},{res_}{rr}-{V['sd']}*SQRT({m}{rr}/100)*{V['bb']},0)", fmt=RS2)
    cell(f"{bi_}{rr}", f"={V['banca']}" if k == 1 else f"={bf}{rr-1}", fmt=RS2)
    cell(f"{bf}{rr}", f"={bi_}{rr}+{res_}{rr}", fmt=RS2)
    cell(f"{la}{rr}", f"={bf}{rr}-{V['banca']}", fmt=RS2)
    cell(f"{pm}{rr}", f"=IF({V['meta']}=0,0,{la}{rr}/{V['meta']})", fmt=PC)
    cell(f"{rk}{rr}", f"={m}{rr}/100*{V['rake']}*{V['bb']}", fmt=RS2)
    cell(f"{rc}{rr}", (f"={rk}{rr}" if k == 1 else f"={rc}{rr-1}+{rk}{rr}") + "", fmt=RS2)
    # receita líquida acumulada da casa
    ws[f"{rc}{rr}"].value = (f"={rk}{rr}*{V['casa']}*(1-{V['imp']}-{V['cb']})" if k == 1 else f"={rc}{rr-1}+{rk}{rr}*{V['casa']}*(1-{V['imp']}-{V['cb']})")
    for col in cols: ws[f"{col}{rr}"].border = BOX
last = T0 + 60
rng = f"{cols[0]}{T0+1}:{cols[-1]}{last}"
ws.conditional_formatting.add(rng, FormulaRule(formula=[f"${cols[0]}{T0+1}>{V['dias']}"], font=Font(color="BFBFBF")))
ws.conditional_formatting.add(f"{cols[8]}{T0+1}:{cols[8]}{last}", FormulaRule(formula=[f"AND(${cols[0]}{T0+1}<={V['dias']},{cols[8]}{T0+1}>=1)"], fill=TOT))
note(f"{cols[0]}{T0-1}", "Dia a dia com o ganho testado. Linhas cinza = depois do prazo. Verde = meta batida.")
ws.freeze_panes = "A4"
wb.calculation.fullCalcOnLoad = True
wb.save(OUT); print("ok", OUT)
