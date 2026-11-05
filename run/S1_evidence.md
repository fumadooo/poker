# S1 — ship (2026-11-05)

- Deploy por REST (`tools/deploy.py`): upload = `app/` como raiz + motor compilado em `vendor/engine` (a Vercel não
  enxerga arquivos fora do rootDirectory). 3 tentativas falharam (install fora da raiz, pacote do workspace não
  publicado, pasta fora do rootDirectory); a 4ª ficou READY.
- Produção: https://poker-beta-nine.vercel.app (alias de poker-n2w5spmzj-21-days.vercel.app).
- Smoke API em produção (`tools/smoke_api.py`, saída em `run/smoke_prod.out`): PASS. 2 usuários, mesa sb 50/bb 100,
  rake 500 bps, mão inteira até `ended`, 2ª mão sozinha, fora de turno 403, versão velha 409, ilegal 400.
  Invariantes: Σ saldos (casa incl.) 400.000 + Σ stacks 0 = Σ créditos 400.000; mesa: buy-ins 20.000 = saques 19.990 + rake 10.
- Smoke UI em produção (`tools/smoke_ui.py`, saída em `run/smoke_ui_prod.out`): 2 navegadores (desktop 1280×800 e
  celular 390×844), lobby lista a mesa, mão jogada só por cliques: 8 ações (call, check×7), 0 timeouts, mão gravada
  (pote R$ 2,00, rake R$ 0,10, board completo), 0 erros de página/console. Screenshots: `run/S1_*.png`.
- Bug achado pelo smoke e corrigido: no celular a barra de ações ficava abaixo da tela (jogador 2 estourava o tempo em
  toda rua). Agora fica fixa no rodapé, botões principais primeiro.
- Pendente: revisão adversarial única (em andamento).
