# U1 — UI · evidência (2026-11-05, worker U1 retomada)

Contrato: `docs/SPEC-contracts-v1.md` §4 (UI), consumindo §3 (API do A1) e §1 (HandState). Next 16.4.5 + cacheComponents, Tailwind v4, pt-BR, mobile-first.

## Arquivos (só os de U1)
- `app/app/(lobby)/page.tsx` (`/`: lista de mesas + sentados, saldo, "Fichas de teste +R$ 1.000" → POST /api/me/credit, criar mesa), `(lobby)/layout.tsx` (AuthGate)
- `app/app/login/page.tsx` (e-mail OTP: `signInWithOtp` + `verifyOtp` 6 dígitos / magic link)
- `app/app/table/layout.tsx`, `table/[id]/page.tsx` (params em Suspense, sem `export const dynamic`), `table/[id]/TableClient.tsx`
- `app/components/`: ActionBar, AuthGate, BuyInDialog, CreateTableForm, HandLog, Header, PlayingCard, PokerTable, Seat, ShowdownOverlay, Timer
- `app/lib/client/`: api (fetch tipado §3), mock (NEXT_PUBLIC_MOCK=1), money (centavos → R$), supabase, types, useSession
- `app/app/globals.css`, `app/app/layout.tsx` (lang pt-BR, noindex)

## §4 coberto
Mesa oval até 9 assentos (o meu embaixo), botão D, SB/BB, stack, aposta comprometida por assento, cartas viradas dos outros,
as minhas abertas (fallback `me.hole`), board, pote(s)/side pots, timer circular no jogador da vez a partir de `deadlineAt`
(corrigido por `serverNow`), barra Desistir/Passar/Pagar X/Apostar/Aumentar com slider + atalhos Mín/½ pote/Pote/All-in
habilitados só pelo `legal` da API, diálogo de buy-in, sair (pending = sai ao fim da mão), histórico da mão à direita (desktop) /
aba (mobile), overlay de showdown com cartas mostradas; mão `ended` fica visível como "Mão liquidada" até o tick limpar (~3 s).
Cliente: Realtime `table:<id>` evento `state` → refetch; poll 1 s enquanto há deadline + POST tick quando vencido; 3 s entre mãos
(tick inicia a próxima); `version` enviado em toda ação; 409 → refetch + 1 retry.

## Correções desta retomada (vs. o motor E1)
1. `state.pots` já inclui as apostas da rua (computePots por totalCommitted) → UI não soma `committed` de novo (PokerTable, TableClient).
2. Atalhos de raise: raise-TO pote = `currentBet + (pote + toCall)` (antes somava toCall 2×); slider no máximo → `allin` sem amount;
   botão All-in extra escondido quando o call já cobre o stack.
3. HandLog: showdown do motor é 1 evento por assento `{seat, cards, data.hand}`; payout com `data.uncalled` = "devolvido (aposta não paga)".
4. Mock alinhado ao motor: fold sempre legal, `allin` = stack, bet = fichas na rua, raise-TO só se `!acted`, pots = Σ totalCommitted,
   showdown por assento, `serverNow`, tick limpa a mão encerrada após 3 s.
5. `serverNow` → skew do relógio (timer e decisão de tick no relógio local). Loop de polling não é mais recriado a cada refetch.
6. Layout: margem acima/abaixo do oval (meu assento cobria a barra de ações); blinds sem quebra no lobby mobile.

## Verificação
- `npm run build --workspace app` → EXIT 0 (TypeScript ok, 9 páginas; `/` e `/login` estáticas, `/table/[id]` PPR). Log: `run/U1_build.log`.
- Dev MOCK (`NEXT_PUBLIC_MOCK=1 next dev -p 3077`) + Playwright Chromium, 1280×800 e 390×844: lobby → +R$ 1.000 → criar mesa →
  mesa Ipanema (vez do usuário, flop) → Pagar → mesa vazia → buy-in. Todos os controles presentes nas duas larguras.
  **Console errors / page errors: 0.** Servidor encerrado ao fim (0 processos node).
- Screenshots: `U1_lobby_desktop.png`, `U1_lobby_mobile.png`, `U1_table_desktop.png`, `U1_table_mobile.png`
  (+ `U1_lobby_create_*`, `U1_table_after_call_desktop.png`, `U1_table_buyin_desktop.png`).

## Pendências (fora de U1)
- Teste com 2 contextos reais contra a API + Realtime de ponta a ponta fica para S1 (smoke com 2 usuários).
- O build travado das 09:59 (worker antigo, 21 min) e os servidores dev 3078 (A1) e `next start` 3077 foram encerrados.
