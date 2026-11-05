# Briefing — reunião Trio (Augusto Rodrigues), 05/11/2026 11:15

Fonte: trio.com.br/products, /pricing (tabela vigente a partir de 20/05/2026), home e docs.trio.com.br, lidos em 05/11/2026.
Números do poker: SPY-brasa (Brasa Poker, 04–05/11) e planilha poker_health_v2.

## O que a Trio é
Instituição de Pagamento autorizada pelo BACEN (IP 619), conexão direta ao Pix, "R$ 100 bi processados em 12 meses". Vende
conta corporativa + Pix em alto volume + pagamentos em lote + cartões corporativos pré-pagos + antecipação de recebíveis
(Trio Asset, CVM). Não vende: antifraude, KYC/validação de CPF, carteira do usuário final, checkout com cartão de crédito,
e NÃO cita apostas/iGaming/Lei 14.790 em lugar nenhum.

## Produtos que o poker precisa, com o preço público
| Necessidade | Produto Trio | Preço (Conta Trio) |
|---|---|---|
| Depósito do jogador | Pix QR Code (emissão isenta, liquidação) | R$ 0,69 por depósito |
| Saque do jogador | Transferência via Pix | R$ 0,69 por saque |
| Comissão de afiliados (5–20% do rake, benchmark Brasa) | Pagamentos em lote (Pix) ou Split de pagamento | R$ 0,69 por pagamento ou 0,25% do TPV no split |
| Mídia paga (ads) | Cartão corporativo Mastercard virtual, por centro de custo | anuidade isenta, pré-pago (sem limite de crédito) |
| Contestação de Pix (fraude, "não fui eu") | Gestão de MED 2.0 | não precificado na tabela |
| Conta, API, extrato, sandbox | Conta Trio | isentos |
| Enterprise | gerente + analista de integração + suporte 24/7 | "a negociar", sem setup |

## Onde a Trio ganha dinheiro com a gente
Por transação, não por valor: R$ 0,69 no depósito e R$ 0,69 no saque. Poker é muitas transações pequenas (buy-in médio
no Brasa R$ 57; micro R$ 7 a R$ 30), então somos o cliente ideal deles: volume de eventos alto, ticket baixo. Split (0,25%
do TPV) e Enterprise são as duas alavancas de margem deles. A planilha v2 assumia 1,5% de PSP; na Trio o custo real é
por evento: R$ 1,38 por ciclo depósito+saque, ou cerca de 1,0% a 2,0% do dinheiro movimentado dependendo do ticket.

## Volume para falar com eles (3 cenários, mês cheio)
| Cenário | Jogadores/dia | Depósitos/mês | Depositado/mês | Saques/mês | Custo Trio/mês |
|---|---|---|---|---|---|
| Mês 1 (piso da planilha) | 70 | ~1.000 | ~R$ 80 mil | ~300 | ~R$ 900 |
| Sala viva (60 simultâneos) | 1.050 | ~15.000 | ~R$ 1,2 mi | ~4.500 | ~R$ 13,5 mil |
| Escala Brasa | 2.000 | ~30.000 | ~R$ 2,4 mi | ~9.000 | ~R$ 27 mil |
Premissas: 1 depósito a cada 2 jogadores-dia, ticket médio R$ 80, 30% dos depósitos viram saque. Mais R$ 100 mil/mês
de mídia no cartão.

## Perguntas que decidem se a Trio serve
1. Vocês aceitam operação de poker online (jogo de habilidade, fora da Lei 14.790)? Já têm cliente de iGaming/apostas? Compliance exige o quê?
2. KYC: vocês validam CPF/nome/conta do destinatário do saque? Saque só para conta do mesmo CPF do depositante é possível por API?
3. MED 2.0: quem arca com Pix devolvido por fraude? Qual a taxa de MED que vocês toleram antes de bloquear a conta?
4. Preço no volume: a partir de quantas transações/mês o Enterprise cai abaixo de R$ 0,69? Tem preço por faixa?
5. Liquidação: depósito Pix cai D+0 na conta? Saque sai em segundos 24/7? Limites por transação e diários?
6. Cartão: é pré-pago? Dá para rodar R$ 100 mil/mês de Meta Ads nele? Cashback ou prazo?
7. Afiliados: pagamento em lote por API com status por item, ou split automático no depósito? Custo de cada um.
8. Integração: prazo real para ir ao ar com Pix in/out e webhooks assinados; sandbox hoje; analista dedicado.
9. Float: rendimento sobre saldo parado na conta (float dos jogadores) — alguma remuneração?
10. Contrato: exclusividade, volume mínimo, multa, prazo de aviso, quem é o gerente dedicado.

## Postura
Chegar como operador de alto volume de transações, não de alto ticket. Pedir preço por faixa desde o dia 1 (R$ 0,69
→ R$ 0,49 → R$ 0,35 conforme volume) e split de afiliados sem o 0,25%. Deixar claro que KYC e antifraude vão ficar com
outro fornecedor, então a Trio tem que expor por API os dados que esse fornecedor precisa (CPF do pagador, conta de origem).
