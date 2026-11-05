# SPEC — contratos v1 (motor ↔ API ↔ UI). Quem muda isto avisa o coordenador; os workers programam contra isto.

Dinheiro sempre em **centavos inteiros** (`number`, nunca float). Cartas como `"As"`, `"Td"`, `"2c"` (rank `2..9,T,J,Q,K,A`, naipe `s,h,d,c`).

## 1. Motor (`packages/engine`, TypeScript puro, 0 deps, ESM, exporta de `src/index.ts`)
```ts
export type Card = string; // "As"
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
export interface TableConfig { sb: number; bb: number; maxSeats: number; rakeBps: number; rakeCap: number | null; noFlopNoDrop: boolean; actionSeconds: number }
export interface SeatIn { seat: number; playerId: string; stack: number; sittingOut?: boolean }
export interface PlayerState { seat: number; playerId: string; stack: number; committed: number; totalCommitted: number; folded: boolean; allIn: boolean; hole: Card[]; sittingOut: boolean; acted: boolean }
export interface Pot { amount: number; eligible: number[] /* seats */ }
export interface HandState {
  handId: string; handNo: number; config: TableConfig; street: Street; deck: Card[]; board: Card[];
  players: PlayerState[]; button: number; sbSeat: number; bbSeat: number; toAct: number | null; // seat
  currentBet: number; minRaise: number; lastAggressor: number | null; pots: Pot[]; rake: number;
  deadlineAt: number | null; // epoch ms
  log: HandEvent[]; result: HandResult | null; seed: string; // hex do RNG (para auditoria)
}
export interface HandEvent { t: number; kind: 'start'|'blind'|'deal'|'action'|'street'|'showdown'|'payout'|'rake'|'end'|'timeout'; seat?: number; action?: ActionKind; amount?: number; street?: Street; cards?: Card[]; data?: any }
export interface HandResult { winners: { seat: number; playerId: string; amount: number; potIndex: number; hand?: string }[]; rake: number; shown: { seat: number; hole: Card[]; hand: string }[]; stacks: { seat: number; stack: number }[] }
export interface LegalActions { seat: number; fold: boolean; check: boolean; call: number | null; bet: { min: number; max: number } | null; raise: { min: number; max: number } | null; allin: number }

export function startHand(config: TableConfig, seats: SeatIn[], handNo: number, prevButton: number | null, now: number, rng?: () => number): HandState;
export function legalActions(state: HandState, seat: number): LegalActions | null;
export function applyAction(state: HandState, seat: number, action: ActionKind, amount: number | undefined, now: number): HandState; // lança Error('ILLEGAL_ACTION: ...') se ilegal; nunca muta o estado de entrada
export function applyTimeout(state: HandState, now: number): HandState; // se deadlineAt <= now: check se possível senão fold; senão devolve o mesmo
export function publicView(state: HandState, viewerPlayerId: string | null): HandState; // remove hole de quem não é o viewer e o deck; no showdown mantém as `shown`
export function evaluate7(cards: Card[]): { rank: number; name: string; best: Card[] }; // rank maior = melhor; name ex. "Full House, Aces over Kings"
export function computeRake(pot: number, config: TableConfig, sawFlop: boolean): number;
```
Regras: NLH. Blinds: heads-up o botão é SB. Min-raise = último incremento (ou bb). All-in menor que min-raise não reabre a ação. Side pots por `totalCommitted`. Rake: `floor(pot * rakeBps / 10000)`, `min(cap)` se cap, zero se `noFlopNoDrop` e a mão acabou pré-flop sem flop (benchmark Brasa: 500 bps, sem cap, mãos que não passam das blinds não pagam). Rake sai do pote antes do pagamento. Quando todos menos um foldam: pote para ele sem showdown (`result.shown = []`). Deadline: `now + actionSeconds*1000` a cada vez que `toAct` muda; `null` quando não há ação pendente. Street `ended` com `result` preenchido e `stacks` finais. `seed`: 32 bytes hex gerados por `crypto.randomBytes` quando `rng` não é passado; o deck é embaralhado com Fisher-Yates a partir de um PRNG determinístico derivado do seed (para reprodução em auditoria).

## 2. Banco (`supabase/migrations/0001_init.sql`)
Conforme `docs/PLAN-poker-v1.md` §5. Detalhes obrigatórios:
- `tables.state jsonb` = `HandState` da mão corrente (ou `null` entre mãos); `tables.version int default 0`; `tables.hand_no int default 0`; `tables.button int null`.
- `seats.status in ('sitting','sitout','left')`; `stack_cents` é a verdade do stack ENTRE mãos; durante a mão o stack vive em `state.players[].stack` e é copiado de volta ao fechar a mão.
- `ledger.kind in ('credit_test','buyin','cashout','rake','adjust')`; `amount_cents` positivo = entra na conta do usuário, negativo = sai. Rake: linha com `user_id = '00000000-0000-0000-0000-000000000001'` (conta `house`, criada na migração em `profiles`).
- View `balances(user_id, balance_cents)`.
- RLS: `profiles` leitura pública de `nick`, escrita só do dono; `ledger` leitura só do dono; `tables` leitura pública de tudo MENOS `state` (usar view `tables_public` sem `state`; revogar select direto na tabela para `anon`/`authenticated`); `seats` leitura pública; `hands` leitura pública quando `ended_at is not null`; `actions` idem. Escrita em tudo só via `service_role` (API).
- Função SQL `apply_table_update(p_table uuid, p_version int, p_state jsonb, p_deadline timestamptz, p_hand_no int, p_button int) returns int`: `update tables set ... where id=p_table and version=p_version returning version+1`; devolve 0 linhas = conflito (API refaz).
- Tabela `schema_migrations(name text pk, applied_at)`.

## 3. API (`app/app/api/table/[id]/*`, Node runtime, `service_role` no servidor; usuário via cookie Supabase Auth)
Todas respondem JSON `{ ok: true, ... }` ou `{ ok: false, error: 'CODE', message }` com status 400/401/403/409.
- `POST /api/me/credit` → +100.000 centavos de fichas de teste (limite 5 por dia por usuário). `{ balance }`
- `GET /api/tables` → `tables_public` + sentados por mesa.
- `POST /api/tables` `{ name, sb, bb, maxSeats, rakeBps, rakeCap, minBuyin, maxBuyin }` → cria.
- `POST /api/table/[id]/sit` `{ seat, buyin }` → ledger `buyin` (−), seat `sitting` com `stack_cents = buyin`. Erros: `SEAT_TAKEN`, `INSUFFICIENT_BALANCE`, `BUYIN_RANGE`.
- `POST /api/table/[id]/leave` → se não há mão em curso ou o jogador já foldou: `cashout` (+stack) e `left`; senão marca para sair ao fim da mão.
- `POST /api/table/[id]/action` `{ action, amount?, version }` → `applyAction` → `apply_table_update`; 409 `VERSION_CONFLICT`; 403 `NOT_YOUR_TURN`; 400 `ILLEGAL_ACTION`.
- `POST /api/table/[id]/tick` → `applyTimeout` se vencido; também **inicia a próxima mão** quando `state` é `null`/`ended` e há ≥ 2 sentados com stack > 0 (após 3 s do fim). Idempotente.
- `GET /api/table/[id]/state` → `{ table, seats, state: publicView(state, me), me: { seat, hole } , version }`.
- Após cada mudança: `supabase.channel('table:'+id).send({ type:'broadcast', event:'state', payload:{ version } })` — o cliente, ao receber, faz `GET state`. (Payload leve: nunca manda cartas por broadcast.)
- Fim de mão (`street === 'ended'`): grava `hands` + `actions`, copia stacks para `seats`, ledger `rake` para a casa, remove quem ficou com stack 0 ou pediu para sair (`cashout` 0/stack), `state = null`.

## 4. UI (`app/app/**`)
- `/login` e-mail OTP (Supabase `signInWithOtp`), `/` lobby, `/table/[id]` mesa. Português do Brasil. Mobile-first (o público do Brasa joga no celular).
- Mesa: oval com até 9 assentos, botão D, blinds, stack, aposta comprometida, cartas viradas dos outros, as minhas abertas, board, pote(s), timer circular no jogador da vez, botões Fold/Check/Call X/Bet/Raise com slider + atalhos (min, 1/2 pote, pote, all-in), histórico da mão à direita (desktop) / aba (mobile), resultado com cartas mostradas no showdown.
- Cliente: assina o canal Realtime; `GET state` ao entrar, a cada broadcast e a cada 1 s enquanto `deadlineAt` existir (chamando `tick` quando vencido). Nunca calcula regras: usa `legalActions` que vem no `state` (a API inclui `legal` para o viewer).
