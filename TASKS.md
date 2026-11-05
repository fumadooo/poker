# TASKS — POKER v1 (fonte da verdade do estado; atualizar ao fechar cada fatia)

Legenda: [ ] a fazer · [~] em andamento · [x] feito com evidência em `run/<fatia>_evidence.md` · (P) paralelizável

## Infra (coordenador) — 2026-11-05
- [x] Supabase projeto `poker` criado (`puvosfyvoqztqjlyzamf`, sa-east-1, org 21-days); chaves em `.env`
- [x] Vercel token renovado (CLI local `vercel whoami`); time `21-days` = `team_C8W93VG78Ei3h5yrpc45srRL`
- [ ] GitHub `fumadooo/poker`: token atual não cria repo → Michael cria e libera o token (bloqueio só para push)
- [~] Scaffold: monorepo npm workspaces, `app/` Next.js 15 TS + Tailwind, `packages/engine`

## E1 — motor (P) · dono: `packages/engine/**`
- [x] Tipos + estado da mão (`HandState`), deck com `crypto`, avaliador 7 cartas (tabela de testes conhecida)
- [x] Rodadas de aposta (fold/check/call/bet/raise/all-in), min-raise, heads-up e 9-max, blinds, botão
- [x] Side pots, showdown, pagamento, rake (bps, cap, no-flop-no-drop), eventos
- [x] Simulação 10k mãos: Σ fichas constante, nenhuma exceção · `node --test` verde (29/29) · `run/E1_evidence.md`

## D1 — schema (P) · dono: `supabase/migrations/**`, `tools/migrate.py`
- [x] `0001_init.sql` conforme PLAN §5 (profiles, ledger, balances, tables, seats, hands, actions) + RLS
- [x] `tools/migrate.py` aplica via Management API (`/v1/projects/{ref}/database/query`) e registra em `schema_migrations`
- [x] Evidência: tabelas no projeto, RLS negando anon em `tables.state`, `run/D1_evidence.md` (aplicada 2026-11-05 12:50 UTC)

## A1 — API (depende de E1 + D1) · dono: `app/app/api/**`, `app/lib/server/**`
- [ ] `sit`, `leave`, `buyin`, `action`, `tick`, `me`, `state` com lock otimista (`version`) e ledger
- [ ] Broadcast `public_state` por Supabase Realtime após cada mudança
- [ ] `tools/smoke_api.py`: 2 usuários jogam 1 mão inteira por HTTP · `run/A1_evidence.md`

## U1 — UI (depende de A1 contrato) · dono: `app/app/(lobby)/**`, `app/app/table/**`, `app/components/**`
- [ ] Login e-mail OTP, lobby (mesas, sentados, saldo, "fichas de teste +1000"), criar mesa
- [ ] Mesa: assentos, cartas próprias, board, pote, ações com slider, timer, histórico da mão
- [ ] Playwright 2 contextos: screenshots em `run/` · `run/U1_evidence.md`

## S1 — ship (depende de A1 + U1) · dono: `tools/deploy.py`, `tools/smoke.py`, `app/vercel.json`
- [ ] Projeto Vercel `poker` criado por REST, env vars, deploy, URL de produção
- [ ] Smoke: login 2 users → mesa → mão inteira → ledger bate · `run/S1_evidence.md`
- [ ] Revisão adversarial única do diff (segurança: cartas nunca vazam, saldo nunca negativo, ação fora de turno rejeitada)
