# E1 — motor `packages/engine` · evidência (2026-11-05, worker E1)

Contrato: `docs/SPEC-contracts-v1.md` §1 (nomes/assinaturas idênticos). TypeScript puro, 0 dependências de runtime, ESM,
`exports` → `dist/index.js`, tipos em `dist/index.d.ts`. Node v24.22.1, npm 11.19.1, typescript ^5.6 (devDependency).

## Arquivos
```
packages/engine/package.json         @poker/engine, type=module, scripts build/test/test:only/sim
packages/engine/tsconfig.json        ES2022, NodeNext, strict, rootDir src, outDir dist
packages/engine/src/types.ts         tipos do contrato (Card, Street, ActionKind, TableConfig, SeatIn, PlayerState, Pot, HandState, HandEvent, HandResult, LegalActions)
packages/engine/src/cards.ts         newDeck, randomSeed (crypto.randomBytes(32) hex), prngFromSeed (sfc32 determinístico), shuffle (Fisher-Yates), deckFromSeed (auditoria)
packages/engine/src/evaluate.ts      evaluate7 (5..7 cartas, 21 combinações, rank inteiro comparável, nome "Full House, Aces over Kings", best 5)
packages/engine/src/hand.ts          startHand, legalActions, applyAction, applyTimeout, publicView, computePots
packages/engine/src/rake.ts          computeRake (bps, cap em centavos, no-flop-no-drop)
packages/engine/src/index.ts         re-exports
packages/engine/src/__tests__/       evaluate.test, rake.test, hand.test, simulation.test, sim.ts (harness), simulate.ts (CLI)
```

## Comandos executados

### `cd packages/engine && npm install`
```
147 packages are looking for funding
found 0 vulnerabilities
```
(workspaces: instala no root; `package-lock.json` do root ganhou as entradas de `@poker/engine`.)

### `npm run build`
```
> @poker/engine@0.1.0 build
> tsc -p tsconfig.json
```
(sem erros; `dist/` com .js + .d.ts + maps)

### `npm test` (= build + `node --test "dist/__tests__/*.test.js"`)
```
✔ category ladder: each row beats the next (3.3047ms)
✔ ace-low straight (wheel) and its ranking (1.6789ms)
✔ kicker comparisons (2.08ms)
✔ same-rank ties (suits never matter) (0.5801ms)
✔ best 5 picks the right cards out of 7 (two pair out of three pairs, flush over straight) (0.5182ms)
✔ evaluate7 input validation (0.5771ms)
✔ heads-up: button posts SB and acts first preflop, BB acts first postflop (3.7256ms)
✔ 3+ players: SB left of button, BB next, UTG first; button rotates over empty seats (0.5111ms)
✔ min-raise rule: raise sets the next minimum; raise must be >= last increment (1.3384ms)
✔ short all-in does not reopen action for players who already acted; it does for those who have not (0.7786ms)
✔ full all-in raise reopens action (0.7873ms)
✔ when no opponent can act (all others all-in) bet/raise are not offered (0.3727ms)
✔ side pots with 3 players of different stacks; rake taken before payout; odd chip to first seat left of button (2.0749ms)
✔ split pot: odd chip goes to the first seat left of the button (2.2902ms)
✔ uncontested pot: no showdown, shown empty, no-flop-no-drop => rake 0 preflop, rake after flop (1.1767ms)
✔ everyone all-in from the blinds runs the board out immediately (0.9117ms)
✔ illegal actions throw ILLEGAL_ACTION and leave the input untouched (1.2327ms)
✔ applyAction never mutates its input (deep) (0.3421ms)
✔ timeout: fold when facing a bet, check when possible; no-op before the deadline (0.8294ms)
✔ publicView hides the deck, the seed and other players hole cards; keeps shown cards at showdown (1.0674ms)
✔ deck is reproducible from the seed (audit) and seeds differ between hands (0.5792ms)
✔ sitting-out seats stay in players (folded, no cards) and are skipped for blinds/button (0.4109ms)
✔ BB option preflop with 3 players: limps around, BB may raise (0.4997ms)
✔ 500 bps, no cap (0.7579ms)
✔ cap (0.1443ms)
✔ no flop no drop (0.1211ms)
✔ edge values (0.1221ms)
hands=10000 actions=79704 timeouts=3296 ms=5232 hands/sec=1911
showdowns=8576 uncontested=1424 splitPots=1035 handsWithSidePots=6678
totalPot=163761470 totalRake=6796785 (4.15% of pot incl. no-flop-no-drop hands)
players: 2=1393 3=1287 4=1337 5=1315 6=1353 7=1351 8=1158 9=806
board cards at end: 0=926 3=297 4=131 5=8646
hand names at showdown: Pair=13335, Two Pair=7029, High Card=5429, Three of a Kind=1483, Straight=1447, Flush=893, Full House=848, Four of a Kind=59, Straight Flush=4
✔ 10,000 random hands (2-9 players): chips conserved, no exceptions, all ended (5232.9905ms)
✔ simulation is deterministic for a given seed (320.2729ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5666.1375
```

### Simulação isolada: `node dist/__tests__/simulate.js 10000 [seed]` (2 seeds diferentes)
```
hands=10000 actions=79649 timeouts=3294 ms=5193 hands/sec=1926
showdowns=8535 uncontested=1465 splitPots=1066 handsWithSidePots=6663
totalPot=163103974 totalRake=6504646 (3.99% of pot incl. no-flop-no-drop hands)
players: 2=1454 3=1246 4=1305 5=1367 6=1324 7=1294 8=1197 9=813
board cards at end: 0=965 3=284 4=153 5=8598
hand names at showdown: Pair=13411, Two Pair=7153, High Card=5212, Three of a Kind=1493, Straight=1440, Flush=867, Full House=837, Four of a Kind=49, Straight Flush=5, Royal Flush=1
----
hands=10000 actions=78708 timeouts=3352 ms=5138 hands/sec=1946
showdowns=8601 uncontested=1399 splitPots=1160 handsWithSidePots=6627
totalPot=171139688 totalRake=6844801 (4.00% of pot incl. no-flop-no-drop hands)
players: 2=1443 3=1312 4=1298 5=1315 6=1289 7=1336 8=1221 9=786
board cards at end: 0=947 3=265 4=125 5=8663
hand names at showdown: Pair=13385, Two Pair=7085, High Card=5385, Three of a Kind=1533, Straight=1425, Flush=908, Full House=768, Four of a Kind=56, Straight Flush=5, Royal Flush=2
```
Nota: ~1.900 mãos/s inclui, a cada ação, dois `JSON.stringify` do estado inteiro (prova de não-mutação) e a reavaliação
independente de todas as mãos no showdown; o motor sozinho é bem mais rápido. Jogadores aleatórios dão all-in/raise muito
mais que gente real, daí 66% das mãos com side pot e 86% chegando ao showdown.

## Invariantes verificados em cada uma das 10.000 mãos (harness `sim.ts`)
- Σ stacks finais + rake == Σ stacks iniciais (nunca se cria nem some ficha)
- Σ `result.winners.amount` + rake == Σ `pots.amount`
- `street === 'ended'`, `result` preenchido, `toAct`/`deadlineAt` null, nenhum stack negativo
- vencedor de cada pote é elegível e tem o maior `rank` entre os elegíveis (reavaliado fora do motor)
- showdown só com board de 5 cartas; pote sem disputa tem `shown = []` e vencedor sem `hand`
- `applyAction`/`applyTimeout` não mutam a entrada; timeout antes do deadline devolve o mesmo objeto
- 2–9 jogadores, stacks de 1 centavo a 200 bb, 5% sitting out, 30% com cap de rake, 70% no-flop-no-drop, 4% das ações por timeout

## Interpretações do contrato (avisar o coordenador se discordar)
1. `rakeCap` em **centavos absolutos** (o CLAUDE.md fala em `rake_cap_bb`; o contrato tipa `number | null` e o banco tem `rake_cap_cents`). Rake = `computeRake(Σ potes)` uma vez por mão, rateado entre os potes proporcionalmente (resto no pote principal); aposta não paga é devolvida ANTES do rake (nunca se cobra rake de ficha devolvida).
2. `seed`: quando `rng` é passado, o seed de 32 bytes é derivado do `rng` e o deck SEMPRE sai de `prngFromSeed(seed)` + Fisher-Yates — o deck é reproduzível pelo seed em qualquer caso (`deckFromSeed`). `publicView` esconde o `seed` (`''`) até `ended` (senão o deck vaza); depois publica para auditoria.
3. `amount`: `bet` = fichas postas na rua; `raise` = valor **total** da rua (raise-TO), igual aos ranges de `LegalActions`. `call`/`check`/`fold`/`allin` ignoram `amount`. Eventos `action` guardam `amount` = total comprometido na rua após a ação (call/bet/raise/allin).
4. All-in menor que o min-raise: `minRaise` não muda e quem já agiu só pode pagar/foldar (`raise: null`), quem ainda não agiu pode re-raise. Aposta/raise não são oferecidos quando nenhum oponente pode mais agir (todos all-in) — call/fold/allin continuam.
5. Fold é sempre legal (mesmo podendo dar check). Blind curto (stack < bb): `currentBet` continua `bb`. Jogador com stack 0 ou `sittingOut` fica em `players` (folded, sem cartas, `sittingOut: true`) para a UI desenhar o assento; precisa de 2 ativos senão `Error('NOT_ENOUGH_PLAYERS')`. Config inválida → `Error('BAD_CONFIG: ...')`.
6. Sem burn cards (deck reproduzível é mais simples de auditar). Ordem de distribuição: 1 carta por vez a partir do assento à esquerda do botão. Botão da 1ª mão (`prevButton = null`) = menor assento ativo; depois o próximo assento ativo após `prevButton`.
7. Street `showdown` é transitória: a mão vai de river para `ended` na mesma chamada; `result.shown` lista todos os não-foldados (ninguém "mucka"). Eventos de `deal` não carregam cartas (nada privado no `log`); `showdown` carrega as cartas abertas.
8. Rake num pote sem disputa pós-flop é cobrado normalmente; pré-flop sem flop obedece `noFlopNoDrop`.
9. `root package.json` tem `test:engine: node --test packages/engine/test/` — esse caminho não existe; os testes compilados ficam em `packages/engine/dist/__tests__/` (`npm --workspace packages/engine test`). Root não é meu arquivo; o coordenador ajusta se quiser.
