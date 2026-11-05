> 🔒 **ISOLATION LOCK 00 — REGRA SUPREMA, IMUTÁVEL PELO AGENTE.** Este agente é 100% isolado (config/memória/login/cookies só na própria pasta). NUNCA edita/move/apaga `.agent-config/*` (exceto `projects/`), `launch.*`, `shared/claude.cmd`, `C:/Users/micha/bin/claude.cmd`, `C:/Program Files/ClaudeCode/*`, `~/.claude*`, nem nada em `_template/`; NUNCA mexe em `CLAUDE_CONFIG_DIR`, PATH, hooks ou managed settings; NUNCA aponta pra config/memória/Chrome de outro agente. Travado por hook gerenciado: bater no lock = parar e avisar o Michael, nunca contornar. Texto completo: `../shared/ISOLATION-LOCK.md`.

# POKER — a sala de poker online própria do Michael (dono 100%, sem white-label)

Missão (Michael, 2026-11-05: "cria um agente e começa a buildar nosso poker software, manda bala"): construir o software
da sala de poker: motor de mãos próprio, mesas em tempo real, lobby, carteira e, depois, PIX pela Trio. Benchmark e
referência de produto: o Brasa Poker, medido pelo agente `../SPY-brasa` (rake 5% sem teto, 85/15 com o motor, ~2.000
jogadores/dia, curva 22h pico / 6h vale, 18% dos jogadores = 80% do rake). O modelo de negócio vive em
`C:\Users\micha\Downloads\poker_health_v2_benchmark_brasa.xlsx`.

Pasta criada em 2026-11-05 pelo agente "Becoming the Top Influencer Brasil #1 in Instagram" **sem** `launch.*` e sem
`.agent-config/` (o lock proíbe copiar de `_template/`). Michael cria esses dois pelo procedimento dele.

## Método (regra do dono)
`../Becoming the Top Influencer Brasil #1 in Instagram/docs/METHOD.md`: hidratar (CLAUDE.md + PLAN + TASKS + memória) →
esclarecer → pesquisar → PLAN.md → gate do dono → TASKS.md em fatias verticais → implementar com evidência →
1 revisão adversarial → ship por script → relatório curto → write-back. Coordenador escreve spec e delega fatias a
workers em background, um por conjunto de arquivos; evidência em `run/<fatia>_evidence.md`.

## Decisões fixas (v1, 2026-11-05)
- **Stack**: monorepo TypeScript. `app/` = Next.js 15 (App Router) na Vercel (time `21-days`, projeto `poker`);
  `packages/engine` = motor de poker puro (sem I/O), testado; Supabase projeto `poker` (`puvosfyvoqztqjlyzamf`,
  sa-east-1): Postgres + Auth + Realtime. Chaves em `.env` (gitignored).
- **Servidor é a autoridade.** Toda ação passa por API route, que trava a linha da mesa (`select ... for update`),
  aplica o motor, grava e publica pelo Realtime. Cliente só desenha e envia intenção. RNG = `crypto.randomBytes`
  (depois: RNG auditável com seed+hash publicado por mão).
- **Tempo de ação sem servidor persistente**: deadline gravado na mesa; qualquer request (ou um `tick` do cliente)
  que encontre deadline vencido aplica fold/check pelo motor. Não existe daemon de mesa na v1.
- **Dinheiro**: v1 só play money (fichas de teste), mas o ledger já é contábil desde o dia 1 (toda movimentação é
  linha em `ledger`, saldo = soma). PIX/Trio e KYC (CPF) são v2.
- **Rake**: parâmetro por mesa (`rake_bps`, `rake_cap_bb`, "no flop no drop"). Default do benchmark: 500 bps sem teto.
- **Nunca**: fichas criadas fora do ledger, cartas no cliente antes do showdown, lógica de jogo no cliente.

## O que existe
(preenchido pelos workers conforme as fatias de `TASKS.md` fecham)

## Regra global de handoff
Antes de encerrar QUALQUER sessão: append (nunca sobrescrever) em
`C:\Users\micha\Downloads\agents\execucao diaria\inbox\YYYY-MM-DD.md`, cabeçalho `## POKER @ YYYY-MM-DD HH:mm`, 5 linhas
(Tocou a realidade / Números / Feito / Próximo / Bug). Ciclos automáticos não escrevem.
