# PLAN — POKER v1: mesa jogável de ponta a ponta, play money (2026-11-05)

Dono, 2026-11-05: "cria um agente e começa a buildar nosso poker software, você já tem logado GitHub, Vercel, Supabase,
manda bala". Gate 1 pulado por ordem do dono; as decisões abaixo ficam marcadas e ele pode reverter qualquer uma.

## 1. Problema
Michael quer ser dono 100% de uma sala de poker online (sem white-label), processando PIX pela Trio. Hoje não existe
software. O benchmark (Brasa, medido pelo SPY-brasa) mostra o produto que o mercado aceita: NLH cash de bb 0,10 a 50,
6 e 9 lugares, fast-fold, rake 5% sem teto, clube/cashback, CPF validado no cadastro, motor terceirizado (Acesoft).
O maior risco do negócio não é o software, é liquidez (ver planilha v2); o software tem que nascer barato, auditável
e pronto para ser mostrado a jogadores reais com fichas de teste em dias, não meses.

## 2. Métrica de sucesso da v1
Dois navegadores diferentes sentam numa mesa publicada na Vercel, recebem cartas que só o dono vê, apostam, o pote e o
rake fecham na matemática do motor, o showdown paga o vencedor, o ledger bate (Σ saldos + Σ rake = fichas emitidas)
e a mão inteira fica gravada (histórico reproduzível). Smoke test automatizado prova isso a cada deploy.

## 3. Não-objetivos (v1)
PIX/Trio, KYC/CPF, torneios, Omaha, fast-fold, bônus/clube, app nativo, antifraude, RNG certificado, multi-moeda.

## 4. Arquitetura
```
app/            Next.js 15 (App Router, TS) — Vercel projeto "poker", time 21-days
  app/(lobby)   lista de mesas, criar/entrar, saldo
  app/table/[id] mesa (assentos, cartas, ações, timer) — assina Realtime, envia ações por fetch
  app/api/table/[id]/action  POST {action, amount} → motor → DB → broadcast
  app/api/table/[id]/tick    POST → aplica timeout vencido (chamado pelo cliente a cada 1 s quando há deadline)
  app/api/table/[id]/sit|leave|buyin
packages/engine Motor puro: deck/RNG, avaliador 7 cartas, rodadas, side pots, rake, showdown. 0 dependências.
supabase/migrations  schema + RLS + funções SQL (saldo, lock)
tools/          deploy (REST Vercel), migrate (psql via API SQL), smoke (Playwright 2 browsers), evidence
```
- **Autoridade no servidor**: a linha `tables.state` (jsonb) é o estado canônico; API route faz `select ... for update`
  via RPC SQL `apply_action` (plpgsql chama nada do motor; o motor roda no Node, mas a transação é: lock → ler →
  aplicar → gravar → commit). Concorrência: `version` inteiro na mesa, update condicional (`where version = $v`).
- **Privacidade das cartas**: `state` guarda as cartas de todos; a API publica um `public_state` sem hole cards no
  Realtime (broadcast) e cada cliente busca as próprias cartas por `GET /api/table/[id]/me` (autenticado).
- **Tempo**: `state.deadline_at`; `tick` aplica a ação padrão se vencido. Sem daemon.
- **Auth**: Supabase Auth, e-mail OTP (magic link) na v1; telefone depois.
- **Dinheiro**: tabela `ledger` (append-only): `credit_test`, `buyin`, `cashout`, `rake`, `win`. Saldo = view.
  Buy-in move do saldo para o stack (linha `buyin`), cashout o contrário. Rake vira linha `rake` para a conta `house`.

## 5. Modelo de dados (Supabase)
- `profiles(id uuid pk → auth.users, nick text unique, created_at)`
- `ledger(id bigserial, user_id uuid, kind text, amount_cents bigint, table_id uuid null, hand_id uuid null, meta jsonb, created_at)`
- `balances` (view): sum(amount_cents) por user_id
- `tables(id uuid, name, game 'nlh', sb_cents, bb_cents, max_seats, min_buyin_cents, max_buyin_cents, rake_bps, rake_cap_cents null, state jsonb, version int, deadline_at timestamptz null, created_at)`
- `seats(table_id, seat int, user_id, stack_cents, status 'sitting'|'sitout'|'left', pk(table_id, seat))`
- `hands(id uuid, table_id, hand_no int, started_at, ended_at, board text[], pot_cents, rake_cents, result jsonb, log jsonb)` — `log` = ações na ordem, reproduzível
- `actions(id bigserial, hand_id, seat, user_id, street, action, amount_cents, at)`
- RLS: profiles/ledger/seats legíveis pelo dono; `tables.state` NÃO é legível por cliente (só `public_state` via API); `hands` legível depois de `ended_at`.

## 6. Fatias (TASKS.md) e donos de arquivos
| Fatia | Arquivos | Evidência |
|---|---|---|
| E1 motor | `packages/engine/**` | `run/E1_evidence.md`: testes (avaliador contra tabela conhecida, side pots, rake), 10k mãos simuladas sem exceção, Σ fichas constante |
| D1 schema | `supabase/migrations/**`, `tools/migrate.py` | `run/D1_evidence.md`: migração aplicada no projeto, `\d` das tabelas, RLS testada com anon |
| A1 API | `app/app/api/**`, `app/lib/server/**` | `run/A1_evidence.md`: curl de sit/buyin/action/tick com respostas, mão completa via API |
| U1 UI | `app/app/(lobby)/**`, `app/app/table/**`, `app/components/**` | `run/U1_evidence.md`: screenshots lobby + mesa com 2 jogadores |
| S1 ship | `tools/deploy.py`, `tools/smoke.py`, `app/vercel.json` | `run/S1_evidence.md`: URL de produção, smoke 2 browsers verde |

## 7. Decisões tomadas sem o dono (reversíveis)
1. Supabase projeto `poker` na org `21-days` (sa-east-1), instância micro. Pode gerar custo na org; se quiser free, mover para a org `Fumado`.
2. Vercel projeto `poker` no time `21-days`, deploy por REST (sem GitHub integration), igual ao painel do Instagram.
3. GitHub: o token atual só enxerga `fumadooo/trabalhar`. O repositório local `agents/POKER` já é git; o push para `fumadooo/poker` espera o Michael criar o repo e dar acesso ao token.
4. Auth por e-mail OTP na v1 (zero custo); telefone/CPF na v2.
5. Rake default 500 bps sem teto (benchmark Brasa); teto configurável por mesa.

## 8. Verificação
- Motor: testes unitários (node:test) + simulação de 10.000 mãos com invariantes.
- API: script `tools/smoke_api.py` joga uma mão inteira por HTTP com 2 usuários de teste.
- UI: Playwright com 2 contextos (2 usuários), screenshots em `run/`.
- Ledger: query de invariante (Σ ledger por usuário ≥ 0; Σ todos + Σ rake = Σ créditos emitidos).
