# -*- coding: utf-8 -*-
"""Cartilha do jogador (método de banca) + aba da casa. Gera C:/Users/micha/Downloads/cartilha_poker_metodo_banca.xlsx
Pergunta que a planilha responde: com ESTA banca, para chegar a ESTA meta neste PRAZO, o que é necessário?
(mesa, mãos/dia, horas/dia, ganho necessário por 100 mãos, colocações de topo no torneio). Nenhuma premissa de habilidade.
    python -I tools/cartilha_build.py
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter as L

OUT = "C:/Users/micha/Downloads/cartilha_poker_metodo_banca.xlsx"
F = "Arial"
BLUE = Font(name=F, color="0000FF"); BLK = Font(name=F); BOLD = Font(name=F, bold=True); GRN = Font(name=F, color="008000")
H1 = Font(name=F, bold=True, size=14); HW = Font(name=F, bold=True, color="FFFFFF")
HEAD = PatternFill("solid", fgColor="1F2937"); YEL = PatternFill("solid", fgColor="FFF2CC"); GREY = PatternFill("solid", fgColor="F3F4F6")
thin = Side(style="thin", color="D0D5DD"); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
BRL = 'R$ #,##0;[Red]-R$ #,##0;-'; BRL2 = 'R$ #,##0.00;[Red]-R$ #,##0.00;-'; INT = '#,##0;[Red]-#,##0;-'; DEC = '#,##0.0;[Red]-#,##0.0;-'; PCT = '0.0%;[Red]-0.0%;-'

wb = openpyxl.Workbook()

def hdr(ws, row, labels, widths=None):
    for i, t in enumerate(labels, 1):
        c = ws.cell(row, i, t); c.font = HW; c.fill = HEAD; c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = BOX
    if widths:
        for i, w in enumerate(widths, 1): ws.column_dimensions[L(i)].width = w
    ws.row_dimensions[row].height = 44

def put(ws, ref, v, font=BLK, fmt=None, fill=None, note=None):
    c = ws[ref]; c.value = v; c.font = font
    if fmt: c.number_format = fmt
    if fill: c.fill = fill
    if note: c.comment = Comment(note, "cartilha")
    return c

# ---------------------------------------------------------------- Como usar
ws = wb.active; ws.title = "Como usar"
ws.column_dimensions["A"].width = 120
lines = [
    ("Cartilha do Jogador — Método de Banca (cash game e torneio)", H1),
    ("Pergunta que a planilha responde: com ESTA banca, para chegar a ESTA meta neste PRAZO, o que é necessário?", BOLD),
    ("Nada aqui supõe nível de habilidade. Cada linha mostra o que a meta EXIGE: mesa, mãos por dia, horas por dia, ganho necessário a cada 100 mãos e, no torneio, quantas colocações de topo.", BLK),
    ("", BLK),
    ("Abas", BOLD),
    ("• Premissas — tudo que você pode mudar (azul, fundo amarelo): metas, prazos, mesas, horas, regra de banca, estrutura de torneio, custo do lead.", BLK),
    ("• Mesas — tabela das mesas de cash: banca mínima pela regra, buy-in e rake medido na Brasa (SPY-brasa, 04–05/11/2026).", BLK),
    ("• Ficha 5 — PADRÃO DA CARTILHA: todos os cenários em mesas de big blind R$ 5, 10 e 25, com buy-in, mãos/h e rake medidos na Brasa.", BLK),
    ("• Cash — os cenários de cash game pela regra de banca: 5 bancas × 5 prazos × 2 metas.", BLK),
    ("• Ficha alta — cada pacote sentado em cada mesa (R$ 0,10 a R$ 5): quantas entradas a banca cobre e quanto a meta pede por 100 mãos.", BLK),
    ("• Torneio — o mesmo cenário pelo caminho do torneio: buy-in, prêmio do 1º, quantos 1º ou top-3 a meta exige.", BLK),
    ("• Rotina — o plano diário estilo academia/Duolingo por trilha (3, 7, 15, 30, 60 dias): mesas, horas, mãos, estudo, stop-loss, ofensiva.", BLK),
    ("• Casa — o que a operação ganha quando X% dos leads executam a trilha: rake gerado, impostos, cashback, custo do lead e o % de execução de empate.", BLK),
    ("", BLK),
    ("Legenda: texto AZUL em fundo amarelo = entrada para editar · PRETO = fórmula · VERDE = puxado de outra aba.", BLK),
    ("Como ler 'Ganho necessário (bb/100)': é quanto o jogador precisa ganhar, líquido de rake, a cada 100 mãos, na mesa indicada, para bater a meta no prazo com o volume escolhido.", BLK),
    ("Como ler 'Ganho antes do rake': soma o rake que ele paga na mesa (medido). É o quanto ele precisa tirar dos adversários para, depois de pagar a casa, ainda bater a meta.", BLK),
    ("Material educativo sobre gestão de banca. Poker envolve risco de perda; os números mostram exigências, não garantem resultado. Proibido para menores de 18 anos.", Font(name=F, italic=True, color="666666")),
]
for i, (t, f) in enumerate(lines, 1):
    c = ws.cell(i, 1, t); c.font = f; c.alignment = Alignment(wrap_text=True)

# ---------------------------------------------------------------- Premissas
p = wb.create_sheet("Premissas"); p.column_dimensions["A"].width = 62; p.column_dimensions["B"].width = 16; p.column_dimensions["C"].width = 70
put(p, "A1", "Premissas — edite só as células azuis", H1)
P = {}
rows = [
    ("Metas", None, None, None),
    ("Meta A: saldo final desejado (R$)", 2000, BRL, "Meta do dono: terminar o período com R$ 2.000."),
    ("Meta B: salário mínimo (R$/mês) — lucro no período, proporcional ao prazo", 1621, BRL, "Confirme o valor vigente do salário mínimo de 2026 e ajuste."),
    ("Volume (cash)", None, None, None),
    ("Mesas simultâneas", 4, INT, "Mesas abertas ao mesmo tempo."),
    ("Horas por dia", 3, DEC, "Horas de jogo por dia."),
    ("Mãos por hora por mesa", 42, INT, "Medido na Brasa: 42 mãos por jogador-hora (SPY-brasa, 04–05/11/2026). Sites de desktop: 60–90."),
    ("Regra de banca: buy-ins de 100bb para jogar a mesa", 40, INT, "Padrão conservador: 30–50. Agressivo: 20."),
    ("Ganho de referência para calcular volume (bb/100, líquido)", 5, DEC, "Só usado nas colunas 'se ganhar X'. Mude para ver quantas horas a meta pediria."),
    ("Rake", None, None, None),
    ("Prazo da aba Ficha alta (dias)", 30, INT, "A aba Ficha alta mostra todas as mesas para este prazo."),
    ("Torneio", None, None, None),
    ("Balas: em quantos torneios a banca é dividida", 15, INT, "Banca ÷ balas = buy-in escolhido."),
    ("Inscritos por torneio", 300, INT, "Tamanho do campo."),
    ("Taxa do torneio (% do buy-in)", 0.10, PCT, "Fee padrão de 10%."),
    ("% do prêmio total para o 1º lugar", 0.19, PCT, "Estrutura típica top-heavy (top 15% pagos)."),
    ("% do prêmio total somando 1º+2º+3º", 0.40, PCT, "1º ~19%, 2º ~12%, 3º ~9%."),
    ("Torneios por dia", 3, INT, None),
    ("Casa (operação)", None, None, None),
    ("Custo por lead (R$) — visualizador de status", 2.90, BRL2, "Planilha poker_health_v2: CPS 0,44 ÷ 37% ÷ 41%."),
    ("Leads por mês", 34477, INT, "Com R$ 100 mil/mês de mídia (poker_health_v2)."),
    ("% dos leads que depositam um pacote", 0.10, PCT, None),
    ("Parte do rake que fica com a casa (motor licenciado leva o resto)", 0.85, PCT, "Benchmark Brasa: 85% operador / 15% motor."),
    ("Impostos sobre a receita (PIS+COFINS+ISS+GGR)", 0.2125, PCT, "Mesmo valor da poker_health_v2 (Inputs!B85); ajuste à estrutura real."),
    ("Cashback / rakeback / bônus (% do rake)", 0.176, PCT, "Premissa da poker_health_v2."),
]
r = 2
for label, val, fmt, note in rows:
    r += 1
    if val is None:
        c = p.cell(r, 1, label); c.font = BOLD; c.fill = GREY; p.cell(r, 2).fill = GREY; p.cell(r, 3).fill = GREY; continue
    p.cell(r, 1, label).font = BLK
    c = p.cell(r, 2, val); c.font = BLUE; c.fill = YEL; c.number_format = fmt; c.border = BOX
    if note: p.cell(r, 3, note).font = Font(name=F, color="666666")
    P[label.split(" (")[0].split(":")[0]] = f"Premissas!$B${r}"
def PR(key):  # busca por prefixo
    for k, v in P.items():
        if k.startswith(key): return v
    raise KeyError(key)
r += 2
p.cell(r, 1, "Bancas iniciais (pacotes)").font = BOLD; p.cell(r, 1).fill = GREY
BANC = []
for i, v in enumerate([47, 97, 297, 497, 697]):
    c = p.cell(r + 1 + i, 1, f"Pacote {i+1}"); c2 = p.cell(r + 1 + i, 2, v); c2.font = BLUE; c2.fill = YEL; c2.number_format = BRL; c2.border = BOX
    BANC.append(f"Premissas!$B${r+1+i}")
r += 7
p.cell(r, 1, "Prazos (dias)").font = BOLD; p.cell(r, 1).fill = GREY
PRAZ = []
for i, v in enumerate([3, 7, 15, 30, 60]):
    p.cell(r + 1 + i, 1, f"Trilha {i+1}"); c2 = p.cell(r + 1 + i, 2, v); c2.font = BLUE; c2.fill = YEL; c2.number_format = INT; c2.border = BOX
    PRAZ.append(f"Premissas!$B${r+1+i}")

# ---------------------------------------------------------------- Mesas
m = wb.create_sheet("Mesas")
put(m, "A1", "Mesas de cash — banca mínima pela regra e rake medido na Brasa", H1)
hdr(m, 3, ["Big blind (R$)", "Buy-in 100bb (R$)", "Banca mínima pela regra (R$)", "Rake da mesa medido (R$)", "Mãos medidas", "Rake por mão (R$)", "Rake por jogador a cada 100 mãos (bb)", "Origem do rake", "Jogadores por mão (medido)", "Buy-in mínimo da mesa (40bb, R$)", "Buy-in médio medido na Brasa (R$)"],
    [14, 14, 18, 16, 13, 14, 20, 34, 14, 16, 16])
mesas = [(0.02, None, None, "Sem medição: usa o rake em bb da mesa de R$ 0,10", 4.7), (0.05, None, None, "Sem medição: usa o rake em bb da mesa de R$ 0,10", 4.7),
         (0.10, 2329.31, 8068, "SPY-brasa 04–05/11/2026 (cash)", 4.74), (0.25, 5124.87, 5687, "SPY-brasa", 6.25), (0.50, 10060.47, 6153, "SPY-brasa", 6.21),
         (1.00, 16533.11, 6032, "SPY-brasa", 6.17), (2.00, 33609.62, 9610, "SPY-brasa", 5.07), (5.00, 8877.41, 1057, "SPY-brasa", 6.15),
         (10.00, 7193.60, 426, "SPY-brasa", 5.29), (25.00, 12339.01, 809, "SPY-brasa (amostra pequena)", 3.22)]
for i, (bb, rk, hands, src, npl) in enumerate(mesas):
    rr = 4 + i
    put(m, f"A{rr}", bb, BLUE, BRL2, YEL); put(m, f"B{rr}", f"=A{rr}*100", fmt=BRL2)
    put(m, f"C{rr}", f"=B{rr}*{PR('Regra de banca')}", fmt=BRL)
    if rk:
        put(m, f"D{rr}", rk, BLUE, BRL, YEL); put(m, f"E{rr}", hands, BLUE, INT, YEL)
        put(m, f"F{rr}", f"=IF(E{rr}=0,0,D{rr}/E{rr})", fmt=BRL2)
        put(m, f"G{rr}", f"=IF(A{rr}*I{rr}=0,0,F{rr}/A{rr}/I{rr}*100)", fmt=DEC)
    else:
        put(m, f"G{rr}", "=$G$6", fmt=DEC)
    put(m, f"H{rr}", src, Font(name=F, color="666666")); put(m, f"I{rr}", npl, BLUE, DEC, YEL); put(m, f"J{rr}", f"=A{rr}*40", fmt=BRL2)
    bim = {0.10: 7.18, 0.25: 14.49, 0.50: 27.59, 1.00: 56.23, 2.00: 114.36, 5.00: 233.36, 10.00: 798.72, 25.00: 1837.81}.get(bb)
    put(m, f"K{rr}", bim if bim else f"=A{rr}*70", BLUE if bim else BLK, BRL2, YEL if bim else None)
put(m, "A15", "O rake da Brasa é 5% de todo pote que passa das blinds, sem teto. Por jogador, ele custa dezenas de bb a cada 100 mãos — é o 'pedágio' que o ganho antes do rake precisa cobrir. Se o contador do observador perdeu mãos, o rake real por mão é menor: edite as colunas D/E.", Font(name=F, italic=True, color="666666"))
m.merge_cells("A15:K16"); m["A15"].alignment = Alignment(wrap_text=True, vertical="top")
MESA_BB = "Mesas!$A$4:$A$13"; MESA_MIN = "Mesas!$C$4:$C$13"; MESA_RK = "Mesas!$G$4:$G$13"

# ---------------------------------------------------------------- Cash
c_ = wb.create_sheet("Cash")
put(c_, "A1", "Cash game — o que cada meta exige (sem supor habilidade)", H1)
put(c_, "A2", "Mesa escolhida pela regra de banca. Volume pelas premissas (mesas × horas × mãos/h). Edite em Premissas.", Font(name=F, color="666666"))
cols = ["Banca inicial (R$)", "Prazo (dias)", "Meta", "Saldo final alvo (R$)", "Lucro necessário (R$)", "Mesa pela regra (bb R$)", "Buy-ins na banca",
        "Mãos por dia", "Mãos no prazo", "Horas no prazo", "Lucro necessário por hora (R$)", "GANHO NECESSÁRIO (bb/100, líquido)",
        "Rake pago na mesa (bb/100)", "GANHO ANTES DO RAKE (bb/100)", "Rake pago no prazo (R$) → receita bruta da casa",
        "Se ganhar a referência: mãos necessárias", "Se ganhar a referência: horas/dia necessárias"]
hdr(c_, 4, cols, [12, 9, 22, 13, 13, 12, 10, 11, 12, 10, 12, 16, 12, 16, 18, 16, 16])
row = 5
for meta in ("A", "B"):
    for bref in BANC:
        for pref in PRAZ:
            R = row
            put(c_, f"A{R}", f"={bref}", GRN, BRL); put(c_, f"B{R}", f"={pref}", GRN, INT)
            if meta == "A":
                put(c_, f"C{R}", "Terminar com R$ 2.000"); put(c_, f"D{R}", f"={PR('Meta A')}", GRN, BRL)
            else:
                put(c_, f"C{R}", "Lucrar salário mínimo/mês"); put(c_, f"D{R}", f"=A{R}+{PR('Meta B')}*B{R}/30", fmt=BRL)
            put(c_, f"E{R}", f"=MAX(0,D{R}-A{R})", fmt=BRL)
            put(c_, f"F{R}", f"=IFERROR(LOOKUP(A{R},{MESA_MIN},{MESA_BB}),Mesas!$A$4)", fmt=BRL2)
            put(c_, f"G{R}", f"=IF(F{R}=0,0,A{R}/(F{R}*100))", fmt=DEC)
            put(c_, f"H{R}", f"={PR('Mesas simultâneas')}*{PR('Horas por dia')}*{PR('Mãos por hora')}", fmt=INT)
            put(c_, f"I{R}", f"=H{R}*B{R}", fmt=INT)
            put(c_, f"J{R}", f"={PR('Horas por dia')}*B{R}", fmt=DEC)
            put(c_, f"K{R}", f"=IF(J{R}=0,0,E{R}/J{R})", fmt=BRL2)
            put(c_, f"L{R}", f"=IF(I{R}*F{R}=0,0,E{R}/(I{R}/100*F{R}))", BOLD, DEC)
            put(c_, f"M{R}", f"=IFERROR(INDEX({MESA_RK},MATCH(F{R},{MESA_BB},0)),0)", fmt=DEC)
            put(c_, f"N{R}", f"=L{R}+M{R}", BOLD, DEC)
            put(c_, f"O{R}", f"=I{R}/100*M{R}*F{R}", fmt=BRL)
            put(c_, f"P{R}", f"=IF({PR('Ganho de referência')}*F{R}=0,0,E{R}/({PR('Ganho de referência')}*F{R})*100)", fmt=INT)
            put(c_, f"Q{R}", f"=IF(B{R}*{PR('Mesas simultâneas')}*{PR('Mãos por hora')}=0,0,P{R}/B{R}/({PR('Mesas simultâneas')}*{PR('Mãos por hora')}))", fmt=DEC)
            for col in range(1, 18): c_.cell(R, col).border = BOX
            row += 1
c_.freeze_panes = "D5"
CASH_LAST = row - 1
put(c_, f"A{row+1}", "Referência para ler a coluna L: no mercado, um jogador vencedor sólido de cash online costuma registrar algo entre 2 e 10 bb/100 líquidos. Acima de ~20 bb/100 sustentados por milhares de mãos é raríssimo.", Font(name=F, italic=True, color="666666"))

# ---------------------------------------------------------------- Ficha 5 (padrão da cartilha)
f5 = wb.create_sheet("Ficha 5", 1)
put(f5, "A1", "Ficha mínima R$ 5 — todos os cenários em mesas de big blind R$ 5, 10 e 25 (métricas medidas na Brasa)", H1)
put(f5, "A2", "Buy-in = o médio que os jogadores da Brasa usam em cada mesa. Mãos por hora e rake = medidos. Meta: terminar com R$ 2.000. Edite volume em Premissas.", Font(name=F, color="666666"))
h5 = ["Banca inicial (R$)", "Prazo (dias)", "Mesa (bb R$)", "Buy-in médio Brasa (R$)", "Buy-in mínimo (R$)", "Pode sentar?", "Entradas que a banca cobre (buy-in médio)",
      "Lucro necessário p/ R$ 2.000 (R$)", "Lucro necessário em buy-ins médios", "Mãos por dia", "Mãos no prazo", "Lucro necessário por hora (R$)",
      "GANHO NECESSÁRIO (bb/100, líquido)", "Rake pago (bb/100)", "GANHO ANTES DO RAKE (bb/100)", "Se ganhar a referência: horas/dia", "Rake pago no prazo (R$) → receita bruta da casa"]
hdr(f5, 4, h5, [11, 8, 9, 12, 11, 9, 13, 13, 13, 10, 11, 12, 15, 10, 15, 13, 16])
row = 5
for mr in (11, 12, 13):        # linhas de Mesas: bb 5, 10, 25
    for bref in BANC:
        for pref in PRAZ:
            R = row
            put(f5, f"A{R}", f"={bref}", GRN, BRL); put(f5, f"B{R}", f"={pref}", GRN, INT); put(f5, f"C{R}", f"=Mesas!$A${mr}", GRN, BRL2)
            put(f5, f"D{R}", f"=Mesas!$K${mr}", GRN, BRL2); put(f5, f"E{R}", f"=Mesas!$J${mr}", GRN, BRL2)
            put(f5, f"F{R}", f'=IF(A{R}>=E{R},"SIM","NÃO")', BOLD)
            put(f5, f"G{R}", f"=IF(D{R}=0,0,A{R}/D{R})", fmt=DEC)
            put(f5, f"H{R}", f"=MAX(0,{PR('Meta A')}-A{R})", fmt=BRL)
            put(f5, f"I{R}", f"=IF(D{R}=0,0,H{R}/D{R})", fmt=DEC)
            put(f5, f"J{R}", f"={PR('Mesas simultâneas')}*{PR('Horas por dia')}*{PR('Mãos por hora')}", fmt=INT)
            put(f5, f"K{R}", f"=J{R}*B{R}", fmt=INT)
            put(f5, f"L{R}", f"=IF({PR('Horas por dia')}*B{R}=0,0,H{R}/({PR('Horas por dia')}*B{R}))", fmt=BRL2)
            put(f5, f"M{R}", f"=IF(K{R}*C{R}=0,0,H{R}/(K{R}/100*C{R}))", BOLD, DEC)
            put(f5, f"N{R}", f"=Mesas!$G${mr}", GRN, DEC); put(f5, f"O{R}", f"=M{R}+N{R}", BOLD, DEC)
            put(f5, f"P{R}", f"=IF({PR('Ganho de referência')}*C{R}*B{R}*{PR('Mesas simultâneas')}*{PR('Mãos por hora')}=0,0,H{R}/({PR('Ganho de referência')}*C{R})*100/B{R}/({PR('Mesas simultâneas')}*{PR('Mãos por hora')}))", fmt=DEC)
            put(f5, f"Q{R}", f"=K{R}/100*N{R}*C{R}", fmt=BRL)
            for col in range(1, 18): f5.cell(R, col).border = BOX
            row += 1
        row += 1
f5.freeze_panes = "D5"
put(f5, f"A{row+1}", "Leitura: 'Pode sentar?' compara a banca com o buy-in mínimo da mesa (40 bb). 'Entradas que a banca cobre' usa o buy-in médio real da Brasa. Ganho necessário = o que a meta exige a cada 100 mãos, já pago o rake.", Font(name=F, italic=True, color="666666"))

# ---------------------------------------------------------------- Ficha alta
fa = wb.create_sheet("Ficha alta")
put(fa, "A1", "Cash ficha alta — cada pacote em cada mesa (ignora a regra de banca)", H1)
put(fa, "A2", "Com ficha maior, a meta pede menos bb/100 — e a banca cobre menos entradas. Prazo em Premissas ('Prazo da aba Ficha alta').", Font(name=F, color="666666"))
fh = ["Banca inicial (R$)", "Mesa (bb R$)", "Buy-in mínimo (40bb, R$)", "Pode sentar?", "Entradas mínimas que a banca cobre", "Buy-in cheio 100bb (R$)",
      "Entradas cheias que a banca cobre", "Prazo (dias)", "Lucro necessário p/ R$ 2.000 (R$)", "Lucro necessário em buy-ins de 100bb", "Mãos no prazo",
      "GANHO NECESSÁRIO (bb/100, líquido)", "Rake pago na mesa (bb/100)", "GANHO ANTES DO RAKE (bb/100)", "Se ganhar a referência: horas/dia", "Rake pago no prazo (R$)"]
hdr(fa, 4, fh, [12, 10, 12, 9, 12, 12, 12, 8, 14, 13, 11, 15, 12, 15, 14, 14])
row = 5
for bref in BANC:
    for k in range(2, 8):  # mesas 0,10 a 5,00
        R = row; mr = 4 + k
        put(fa, f"A{R}", f"={bref}", GRN, BRL); put(fa, f"B{R}", f"=Mesas!$A${mr}", GRN, BRL2)
        put(fa, f"C{R}", f"=Mesas!$J${mr}", GRN, BRL2)
        put(fa, f"D{R}", f'=IF(A{R}>=C{R},"SIM","NÃO")', BOLD)
        put(fa, f"E{R}", f"=IF(C{R}=0,0,A{R}/C{R})", fmt=DEC)
        put(fa, f"F{R}", f"=B{R}*100", fmt=BRL2); put(fa, f"G{R}", f"=IF(F{R}=0,0,A{R}/F{R})", fmt=DEC)
        put(fa, f"H{R}", f"={PR('Prazo da aba')}", GRN, INT)
        put(fa, f"I{R}", f"=MAX(0,{PR('Meta A')}-A{R})", fmt=BRL)
        put(fa, f"J{R}", f"=IF(F{R}=0,0,I{R}/F{R})", fmt=DEC)
        put(fa, f"K{R}", f"={PR('Mesas simultâneas')}*{PR('Horas por dia')}*{PR('Mãos por hora')}*H{R}", fmt=INT)
        put(fa, f"L{R}", f"=IF(K{R}*B{R}=0,0,I{R}/(K{R}/100*B{R}))", BOLD, DEC)
        put(fa, f"M{R}", f"=Mesas!$G${mr}", GRN, DEC); put(fa, f"N{R}", f"=L{R}+M{R}", BOLD, DEC)
        put(fa, f"O{R}", f"=IF({PR('Ganho de referência')}*B{R}*H{R}*{PR('Mesas simultâneas')}*{PR('Mãos por hora')}=0,0,I{R}/({PR('Ganho de referência')}*B{R})*100/H{R}/({PR('Mesas simultâneas')}*{PR('Mãos por hora')}))", fmt=DEC)
        put(fa, f"P{R}", f"=K{R}/100*M{R}*B{R}", fmt=BRL)
        for col in range(1, 17): fa.cell(R, col).border = BOX
        row += 1
    row += 1
fa.freeze_panes = "C5"

# ---------------------------------------------------------------- Torneio
t = wb.create_sheet("Torneio")
put(t, "A1", "Torneio — o que cada meta exige", H1)
put(t, "A2", "Buy-in = banca ÷ balas. Prêmio pela estrutura das Premissas. Mostra quantos 1º lugares (ou top-3) a meta pede.", Font(name=F, color="666666"))
tc = ["Banca inicial (R$)", "Prazo (dias)", "Meta", "Lucro necessário (R$)", "Buy-in (R$)", "Custo por entrada c/ taxa (R$)", "Prêmio total (R$)", "Prêmio do 1º (R$)",
      "Prêmio médio de um top-3 (R$)", "Torneios possíveis no prazo", "Custo de jogar todos (R$)", "1º lugares necessários", "Top-3 necessários",
      "Torneios por 1º lugar exigido", "Taxa paga no prazo (R$) → receita bruta da casa"]
hdr(t, 4, tc, [12, 9, 22, 13, 11, 13, 13, 13, 14, 13, 14, 13, 13, 15, 18])
row = 5
for meta in ("A", "B"):
    for bref in BANC:
        for pref in PRAZ:
            R = row
            put(t, f"A{R}", f"={bref}", GRN, BRL); put(t, f"B{R}", f"={pref}", GRN, INT)
            if meta == "A":
                put(t, f"C{R}", "Terminar com R$ 2.000"); put(t, f"D{R}", f"=MAX(0,{PR('Meta A')}-A{R})", fmt=BRL)
            else:
                put(t, f"C{R}", "Lucrar salário mínimo/mês"); put(t, f"D{R}", f"={PR('Meta B')}*B{R}/30", fmt=BRL)
            put(t, f"E{R}", f"=A{R}/{PR('Balas')}", fmt=BRL2)
            put(t, f"F{R}", f"=E{R}*(1+{PR('Taxa do torneio')})", fmt=BRL2)
            put(t, f"G{R}", f"=E{R}*{PR('Inscritos')}", fmt=BRL)
            put(t, f"H{R}", f"=G{R}*{PR('% do prêmio total para o 1º')}", fmt=BRL)
            put(t, f"I{R}", f"=G{R}*{PR('% do prêmio total somando')}/3", fmt=BRL)
            put(t, f"J{R}", f"={PR('Torneios por dia')}*B{R}", fmt=INT)
            put(t, f"K{R}", f"=J{R}*F{R}", fmt=BRL)
            put(t, f"L{R}", f"=IF(H{R}=0,0,(D{R}+K{R})/H{R})", BOLD, DEC)
            put(t, f"M{R}", f"=IF(I{R}=0,0,(D{R}+K{R})/I{R})", BOLD, DEC)
            put(t, f"N{R}", f"=IF(L{R}=0,0,J{R}/L{R})", fmt=DEC)
            put(t, f"O{R}", f"=J{R}*E{R}*{PR('Taxa do torneio')}", fmt=BRL)
            for col in range(1, 16): t.cell(R, col).border = BOX
            row += 1
t.freeze_panes = "D5"
put(t, f"A{row+1}", "Leitura: 'Top-3 necessários' = quantas vezes ele precisa ficar entre os 3 primeiros para pagar todas as entradas do prazo e ainda bater a meta. Num campo de 300, ficar no top-3 acontece, em média, 1 vez a cada 100 torneios (3/300) para quem joga no nível médio do campo.", Font(name=F, italic=True, color="666666"))

# ---------------------------------------------------------------- Rotina
ro = wb.create_sheet("Rotina")
put(ro, "A1", "Rotina — o treino do dia (estilo academia / Duolingo)", H1)
hdr(ro, 3, ["Trilha (dias)", "Mesas", "Horas de jogo/dia", "Mãos/dia", "Estudo/dia (min)", "Revisão de mãos/dia", "Stop-loss diário (buy-ins)", "Stop-win diário (buy-ins)",
            "Ofensiva: dias seguidos", "Marcos", "Treino A", "Treino B", "Treino C"], [10, 8, 11, 10, 11, 12, 12, 12, 12, 34, 34, 34, 34])
treinos = [("Fundamentos: posição e mãos de abertura (tabela) + 1 sessão curta", "Agressão pré-flop: 3-bet e defesa de blind + sessão", "Revisão: 10 mãos perdidas, anotar o erro + sessão"),
           ("Abertura por posição + sessão", "C-bet e jogo no flop + sessão", "Revisão de banca e de mãos + sessão"),
           ("Ranges + sessão", "Turn e river: valor x blefe + sessão", "Revisão semanal: banca, volume, erros"),
           ("Ranges + sessão longa", "Spots de 3-bet pote + sessão", "Revisão + subir/descer de mesa pela regra"),
           ("Estudo com solver/biblioteca + sessão longa", "Exploração do campo + sessão", "Revisão mensal: resultado x volume x regra de banca")]
for i, pref in enumerate(PRAZ):
    R = 4 + i
    put(ro, f"A{R}", f"={pref}", GRN, INT); put(ro, f"B{R}", f"={PR('Mesas simultâneas')}", GRN, INT); put(ro, f"C{R}", f"={PR('Horas por dia')}", GRN, DEC)
    put(ro, f"D{R}", f"=B{R}*C{R}*{PR('Mãos por hora')}", fmt=INT)
    put(ro, f"E{R}", [20, 20, 30, 30, 45][i], BLUE, INT, YEL); put(ro, f"F{R}", [10, 10, 15, 20, 20][i], BLUE, INT, YEL)
    put(ro, f"G{R}", 3, BLUE, INT, YEL); put(ro, f"H{R}", 5, BLUE, INT, YEL); put(ro, f"I{R}", f"=A{R}", fmt=INT)
    put(ro, f"J{R}", ["Dia 1: 1ª sessão · Dia 3: trilha completa", "Dia 3, 5 e 7: insígnias", "Dia 7: semana · Dia 15: quinzena", "Dia 7/15/30: níveis Bronze/Prata/Ouro", "Dia 30/45/60: Platina/Diamante"][i])
    for k, tx in enumerate(treinos[i]): put(ro, f"{L(11+k)}{R}", tx)
    for col in range(1, 14): ro.cell(R, col).border = BOX; ro.cell(R, col).alignment = Alignment(wrap_text=True, vertical="top")
put(ro, "A10", "Regras fixas do método: (1) nunca jogar mesa acima da banca pela regra; (2) parou no stop-loss, encerra o dia; (3) subir de mesa só com a banca mínima da mesa seguinte, descer quando cair abaixo da regra; (4) não depositar para recuperar perda; (5) registro diário de mãos e resultado.", Font(name=F, italic=True))
ro.merge_cells("A10:M11"); ro["A10"].alignment = Alignment(wrap_text=True, vertical="top")

# ---------------------------------------------------------------- Casa
ca = wb.create_sheet("Casa")
put(ca, "A1", "Casa — quanto a operação ganha quando X% dos leads executam a trilha (cash)", H1)
put(ca, "A2", "Rake gerado por quem executa = mãos da rotina × rake da mesa do pacote. Receita líquida = rake × parte da casa × (1 − impostos − cashback).", Font(name=F, color="666666"))
hdr(ca, 4, ["Pacote (R$)", "Mesa do pacote (bb R$)", "Rake por jogador-hora (R$)"] + [f"Receita líquida por executor — trilha {i+1}" for i in range(5)] +
    [f"% de execução para empatar com o custo do lead — trilha {i+1}" for i in range(5)], [11, 12, 13] + [14] * 10)
for i, pref in enumerate(PRAZ):
    ca.cell(3, 4 + i, f"={pref}").font = GRN; ca.cell(3, 9 + i, f"={pref}").font = GRN
ca.cell(3, 3, "dias →").font = BOLD
for i, bref in enumerate(BANC):
    R = 5 + i
    put(ca, f"A{R}", f"={bref}", GRN, BRL)
    put(ca, f"B{R}", f"=IFERROR(LOOKUP(A{R},{MESA_MIN},{MESA_BB}),Mesas!$A$4)", fmt=BRL2)
    put(ca, f"C{R}", f"=IFERROR(INDEX({MESA_RK},MATCH(B{R},{MESA_BB},0)),0)/100*B{R}*{PR('Mesas simultâneas')}*{PR('Mãos por hora')}", fmt=BRL2)
    for k in range(5):
        col = L(4 + k); dias = f"{L(4+k)}$3"
        put(ca, f"{col}{R}", f"=C{R}*{PR('Horas por dia')}*{dias}*{PR('Parte do rake')}*(1-{PR('Impostos')}-{PR('Cashback')})", fmt=BRL2)
        col2 = L(9 + k)
        put(ca, f"{col2}{R}", f"=IF({col}{R}=0,0,{PR('Custo por lead')}/({PR('% dos leads que depositam')}*{col}{R}))", BOLD, PCT)
    for col in range(1, 14): ca.cell(R, col).border = BOX
put(ca, "A11", "Leitura da coluna '% de execução para empatar': dos leads que depositam (Premissas), quantos precisam cumprir a trilha inteira para a receita líquida pagar o custo do lead. Abaixo de 100% = a coorte se paga com esse % executando.", Font(name=F, italic=True, color="666666"))
ca.merge_cells("A11:M12"); ca["A11"].alignment = Alignment(wrap_text=True, vertical="top")
put(ca, "A22", "Ficha R$ 5 (padrão da cartilha) — receita líquida por executor e % de execução para empatar", BOLD)
hdr(ca, 23, ["Mesa (bb R$)", "", "Rake por jogador-hora (R$)"] + [f"Receita líquida por executor — trilha {i+1}" for i in range(5)] + [f"% p/ empatar — trilha {i+1}" for i in range(5)])
for j, mr in enumerate((11, 12, 13)):
    R = 24 + j
    put(ca, f"A{R}", f"=Mesas!$A${mr}", GRN, BRL2)
    put(ca, f"C{R}", f"=Mesas!$G${mr}/100*A{R}*{PR('Mesas simultâneas')}*{PR('Mãos por hora')}", fmt=BRL2)
    for k in range(5):
        col = L(4 + k); dias = f"{L(4+k)}$3"
        put(ca, f"{col}{R}", f"=C{R}*{PR('Horas por dia')}*{dias}*{PR('Parte do rake')}*(1-{PR('Impostos')}-{PR('Cashback')})", fmt=BRL)
        put(ca, f"{L(9+k)}{R}", f"=IF({col}{R}=0,0,{PR('Custo por lead')}/({PR('% dos leads que depositam')}*{col}{R}))", BOLD, PCT)
    for col in range(1, 14): ca.cell(R, col).border = BOX
put(ca, "A14", "Mês cheio (todas as premissas)", BOLD)
put(ca, "A15", "Custo de mídia no mês (R$)"); put(ca, "D15", f"={PR('Leads por mês')}*{PR('Custo por lead')}", fmt=BRL)
put(ca, "A16", "Depositantes no mês"); put(ca, "D16", f"={PR('Leads por mês')}*{PR('% dos leads que depositam')}", fmt=INT)
put(ca, "A17", "% dos depositantes que executam a trilha de 30 dias"); put(ca, "D17", 0.10, BLUE, PCT, YEL)
put(ca, "A18", "Receita líquida (média dos pacotes, trilha de 30 dias)"); put(ca, "D18", "=D16*D17*AVERAGE(G5:G9)", fmt=BRL)
put(ca, "A19", "Resultado do mês (receita líquida − mídia)"); put(ca, "D19", "=D18-D15", BOLD, BRL)

for s in wb.worksheets:
    s.sheet_view.showGridLines = False
wb.calculation.fullCalcOnLoad = True
wb.save(OUT); print("ok", OUT, "| linhas cash:", CASH_LAST - 4)
