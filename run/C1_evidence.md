# C1 — Controles técnicos de PLD/FTP e KYC: evidência

Data: 05/11/2026. Projeto Supabase `poker` (`puvosfyvoqztqjlyzamf`). Todos os comandos rodam a partir de `POKER/`.
Base: `compliance/BRIEF.md`, `compliance/politicas/BO-POL-01_PLD-FTP.md` (itens 7, 9, 10), `BO-POL-02_KYC.md` (item 7),
`BO-POL-03_Cadastro-de-Clientes.md` (status cadastrais, item 7).

Arquivos desta fatia:

| Arquivo | O que é |
|---|---|
| `supabase/migrations/0003_compliance.sql` | tabelas, triggers, RLS, limites por nível, G01/G02, ledger e audit_log append-only |
| `tools/compliance/lists.py` | download + normalização das listas ONU, OFAC, PEP, CEIS, CNEP, com manifesto |
| `tools/compliance/screening.py` | `screen(nome, cpf, nascimento)` + CLI + `--save` em `screening_results` |
| `tools/compliance/monitor.py` | motor de regras P01–P09, C01, C02, AF01, AF02, G01–G03 + `--once`, `--report`, `--selftest` |
| `tools/compliance/common.py` | conexão (Management API), HMAC do CPF, normalização de nomes |

Segredos: o PAT da Management API e o pepper do CPF (`COMPLIANCE_CPF_PEPPER`, criado nesta fatia) ficam só no `.env`,
que está no `.gitignore`. Nenhum arquivo versionado contém chave. O CPF nunca é gravado em claro:
`cpf_hash = HMAC-SHA256(pepper, 11 dígitos)`. Perder o pepper inutiliza os hashes; ele tem que ir para o cofre e para o env
da Vercel quando o app passar a usar KYC.

## 1. Migração 0003

```
$ python tools/migrate.py
applying 0003_compliance.sql (13868 bytes) ...
applied  0003_compliance.sql
$ python tools/migrate.py --status
0001_init.sql                            applied 2026-11-05 12:50:17.801526+00
0002_security_fixes.sql                  applied 2026-11-05 13:47:34.535967+00
0003_compliance.sql                      applied 2026-11-05 15:22:07.20278+00
-- 3 applied, 0 pending
```

Depois do ajuste às políticas (status cadastrais, limites, G01, ledger append-only), o arquivo foi reescrito de forma
idempotente (`create ... if not exists`, `add column if not exists`, `drop/add constraint`) e reexecutado inteiro pela
mesma Management API (`common.db().query(<arquivo>)`), duas vezes, sem erro. O `schema_migrations` continua com a
entrada de 15:22; o conteúdo do arquivo é o estado atual do banco.

O que existe no banco:

- `kyc_profiles`: nível 0–3; nome; `cpf_hash` + `cpf_last4`; nascimento; **status cadastral com os 7 valores da
  BO-POL-03** (`pendente`, `completo`, `em_divergencia`, `atualizacao_vencida`, `bloqueado`, `encerrado`, `recusado`);
  `risk_level` `baixo`/`medio`/`alto`; PEP (`is_pep`, `pep_declarado`); renda comprovada; prova de vida (data,
  fornecedor, id, resultado, pontuação); `bureau_birth_date`; `minor_report`; `last_verified_at` / `next_review_at`
  (12/24/36 meses por risco); `preventive_hold`; `sanctions_freeze` + `freeze_lift_basis`; reduções individuais de
  limite. Checks: nível 1 exige identidade, nível 2 exige prova de vida aprovada, nível 3 exige renda analisada;
  indisponibilidade CSNU implica status `bloqueado`. Trigger `kyc_guard`: `completo` exige dados e 18 anos ou mais;
  PEP e nível 3 viram risco `alto` (BO-POL-01 5.5); indisponibilidade só sai com fundamento; troca de CPF desativa os
  destinos de saque.
- `screening_results`: user_id, cpf_hash, nome, listas consultadas (fonte, sha256, data), matches em jsonb, decisão
  (`clear`/`review`/`match`/`confirmed`/`false_positive`), revisado_por, revisado_em, nota, created_at.
- `aml_alerts`: id, user_id, regra, severidade, dados jsonb, `dedupe_key` único, status
  `open`/`under_review`/`closed_no_action`/`closed_reported`, analista, nota, `conclusao`
  (`nao_suspeito`/`suspeito_comunicar`/`encerrar_relacionamento`, obrigatória para fechar), timestamps, prazo `due_at`,
  `related_users`, flags de retenção `hold_withdrawals`/`hold_deposits`/`hold_play`.
- `audit_log`: ator, ação, entidade, id, antes/depois em jsonb, ts. Append-only (triggers de UPDATE/DELETE/TRUNCATE).
  Triggers `audit_row` em `kyc_profiles`, `aml_alerts`, `screening_results`, `payout_destinations`, `payout_rejections`.
  O ator vem de `app.actor` (as ferramentas setam), senão do `sub` do JWT, senão do papel do banco.
- `payout_destinations` (user_id, cpf_titular_hash, chave, tipo, ativo) com a trigger `payout_destination_guard`:
  sem KYC, KYC fora de `completo`, nível < 2 ou titular com CPF diferente = recusa. `register_payout_destination()`
  é o caminho da aplicação: grava a tentativa recusada em `payout_rejections` (fonte da regra P06) e devolve o erro.
- `ledger`: kinds novos `deposit` e `withdrawal` (dinheiro real; 0 linhas até o Pix existir), e duas triggers novas:
  - `ledger_no_update_delete` / `ledger_no_truncate`: append-only também contra o service_role e o postgres.
  - `ledger_kyc_limits` (antes do insert, sem crédito parcial): depósito/saque exigem kyc `completo`, sem atualização
    vencida, sem bloqueio preventivo, PEP só no nível 3, nenhum alerta aberto com retenção, e respeitam os limites da
    BO-POL-02 7.1 por dia (00:00–23:59 de Brasília) e por mês calendário: nível 0 nada; nível 1 depósito R$ 500/dia e
    R$ 2.000/mês, sem saque; nível 2 R$ 2.000/dia e R$ 10.000/mês nos dois sentidos, até 3 saques/dia; nível 3
    R$ 10.000/dia, mês = menor entre R$ 50.000 e a renda comprovada (depósito) e R$ 50.000 (saque), até 3 saques/dia.
    Saque exige `meta.payout_destination_id` ativo, do próprio usuário e com o mesmo CPF do KYC. Conta bloqueada,
    encerrada, recusada ou com indisponibilidade não recebe nem fichas (`buyin`, `credit_test`); a volta da mesa
    (`cashout`) continua permitida para não travar a mão dos outros jogadores.
- `screening_effects` (trigger em `screening_results`, BO-POL-01 7.2/7.3/7.4/6.4.4): ONU confirmada → **G01**:
  `kyc_profiles.status = bloqueado`, `sanctions_freeze = true`, alerta crítico com prazo imediato e retenção de saque,
  depósito e jogo, tudo na mesma transação do resultado do screening. OFAC confirmada → `bloqueado` + alerta
  `G01-OFAC` (item 7.4; não é um ID do item 9). ONU/OFAC possível ou PEP não declarado → **G02**: `preventive_hold`,
  alerta alto com prazo de 1 dia útil (7.3). Falso positivo com revisor e nota libera o bloqueio preventivo, nunca a
  indisponibilidade.
- Prazo: `aml_due_at(severidade)`: crítica imediato; alta 5 dias úteis; média 15 dias úteis; baixa 30 dias; teto
  45 dias (BO-POL-01 10.1). Dia útil = segunda a sexta; feriados ainda não são descontados.
- RLS ligado nas 6 tabelas novas; anon/authenticated sem nenhum privilégio, exceto o usuário autenticado, que lê o
  próprio `kyc_profile` (colunas sem hash nem bloqueio). O service_role lê e insere; não tem UPDATE/DELETE em
  `audit_log` e `ledger`, nem DELETE/TRUNCATE nas tabelas de compliance (guarda de 10 anos).

Verificação de grants e RLS (as authenticated, em transação desfeita):

```
service_role: UPDATE ledger=False  DELETE ledger=False  INSERT ledger=True  UPDATE audit_log=False  DELETE aml_alerts=False
anon SELECT kyc_profiles=False   authenticated SELECT aml_alerts=False   authenticated SELECT kyc_profiles.cpf_hash=False
RES dono_ve=1 outro_ve=0 aml_alerts: permission denied for table aml_alerts | cpf_hash: permission denied for table
    kyc_profiles | update: permission denied for table kyc_profiles
```

Antes de travar o ledger, conferi que nenhum código faz UPDATE ou DELETE nele: `grep` em `app/` (fora de `.next/`),
`packages/`, `tools/` e `supabase/migrations/` só encontra `select` e `insert` (`app/lib/server/ledger.ts`,
`app/app/api/me/route.ts`, `app/app/api/table/[id]/sit/route.ts`, `tools/exploit_tests.py`, `tools/smoke_api.py`).
As funções do banco (`buyin`, `leave_table`, `settle_hand`, `credit_test`) só inserem. `credit_test` foi chamada depois
das triggers novas, em transação desfeita: `{"n": 5, "ok": true, "balance": 500560}`.

Efeito colateral que fica registrado: `ledger.table_id` e `ledger.hand_id` têm `on delete set null`. Apagar uma mesa ou
mão que já tem linha no ledger agora falha com `LEDGER_APPEND_ONLY` (o set null é um UPDATE). Testado em transação
desfeita. Isso preserva o histórico contábil; `tools/exploit_tests.py` só apaga mesas sem linhas no ledger, então
continua funcionando.

## 2. Listas (`tools/compliance/lists.py`)

```
$ python tools/compliance/lists.py
[un] ok      2,177,566 bytes     1,007 registros  sha256 46c62b9139656b5a  cpf completo=0 mascarado=0
[ofac] ok    5,815,063 bytes    19,499 registros  sha256 ebbbce82570fd05f  cpf completo=0 mascarado=0
[pep] ok     2,497,586 bytes   133,875 registros  sha256 3767967292d1c6f3  cpf completo=0 mascarado=133875
[ceis] ok    3,431,755 bytes    23,753 registros  sha256 5763bdd1551acde4  cpf completo=9157 mascarado=0
[cnep] ok      209,086 bytes     1,854 registros  sha256 5a40b72196666e5f  cpf completo=28 mascarado=0
manifesto: C:\Users\micha\Downloads\agents\POKER\compliance\lists\manifest.json
```

| Fonte | Baixado (UTC) | Referência | Bytes | Registros | sha256 | URL final |
|---|---|---|---|---|---|---|
| ONU/CSNU consolidada (XML) | 2026-11-05 15:19:50 | publicação atual | 2.177.566 | 1.007 (733 pessoas, 274 entidades) | `46c62b9139656b5a37957caeb9d6714064c95fc44da890f6bb67b19d8f8fbe59` | `scsanctions.un.org/.../consolidated.xml` → `unsolprodfiles.blob.core.windows.net/publiclegacyxmlfiles/EN/consolidatedLegacyByPRN.xml` |
| OFAC SDN (CSV) + alt.csv (1.064.485 bytes) | 2026-11-05 15:44:30 (rebaixado para limpar a URL assinada do manifesto) | publicação de 2026-11-02 | 5.815.063 | 19.499 (7.534 pessoas) | `ebbbce82570fd05f5f53db0f30eca2541a914b47f1044a1568760b51a4753654` | `treasury.gov/ofac/downloads/sdn.csv` → `sanctionslistservice.ofac.treas.gov` → S3 do Tesouro |
| CGU PEP | 2026-11-05 15:20:20 | 202609 (o zip 202610 responde 403: ainda não publicado) | 2.497.586 | 133.875 | `3767967292d1c6f321fd425f116cbb19fc2cd08cbda75c5ddc42139049a04a75` | `dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/pep/202609_PEP.zip` |
| CGU CEIS | 2026-11-05 15:20:21 | 20261104 | 3.431.755 | 23.753 (9.157 pessoas, CPF completo) | `5763bdd1551acde46422274779c84fec7d3e668ae4eb9a2b531a45df523214c4` | `.../saida/ceis/20261104_CEIS.zip` |
| CGU CNEP | 2026-11-05 15:20:22 | 20261104 | 209.086 | 1.854 (28 pessoas, CPF completo) | `5a40b72196666e5f2ca791fa2953c13c8a8a1da6bd24e1b282dfe48a4d496f70` | `.../saida/cnep/20261104_CNEP.zip` |

Como a data do arquivo CGU é descoberta: a página `portaldatransparencia.gov.br/download-de-dados/<fonte>` traz
`arquivos.push({"ano","mes","dia"})`; o script testa cada data com HEAD no `dadosabertos-download.cgu.gov.br` e usa a
primeira que responde 200. Se a página falhar, recua mês a mês (PEP) ou dia a dia (CEIS/CNEP). Fonte que falha fica no
manifesto com `status=error`, o erro e o último download bom; as outras seguem. Nenhuma fonte falhou nesta execução.
O PEP traz CPF mascarado (`***.123.456-**`: guardamos os dígitos 4 a 9); CEIS e CNEP trazem CPF completo de pessoa
física. A pasta `compliance/lists/` tem `.gitignore` próprio com `*` (dados de terceiros fora do git).

## 3. Screening (`tools/compliance/screening.py`)

Nome: normaliza (sem acento, caixa alta, sem pontuação, sem partículas de/da/dos/e…), bloqueia candidatos por token
igual ou prefixo de 4 letras e pontua os tokens em mão dupla (1,0 igual; 0,9 com 1 edição em token de 4+ letras ou 2
edições em 8+; senão difflib ≥ 0,85). Score = (Σ tokens da consulta achados + Σ tokens da lista achados) ÷ (total de
tokens dos dois lados). `MATCH` ≥ 0,97, `REVIEW` ≥ 0,85. CPF: igual completo (CEIS/CNEP) ou dígitos do meio iguais
(PEP). Dígitos do meio diferentes = homônimo (registrado como `homonimo`, não pesa na decisão). Nascimento completo
diferente reduz o score; só o ano igual não confirma. **Confirmada** (BO-POL-01 7.2) = nome ≥ MATCH + nascimento
completo igual ou CPF igual.

```
$ python tools/compliance/screening.py "Michael Mendonça Barros Silva" --cpf 376.***.***-78
DECISÃO: CLEAR  (0 resultado(s) >= limiar)
  mais próximos abaixo do limiar: pep:MICHEL DA SILVA 0.63; pep:ALMERIO BARROS DA SILVA 0.57; pep:DELÚSIA BARROS DA SILVA 0.57; ...

$ python tools/compliance/screening.py "Raphael Mendonça Barros Silva" --cpf 376.***.***-40
DECISÃO: CLEAR  (0 resultado(s) >= limiar)
  mais próximos abaixo do limiar: pep:ARTHUR MENDONÇA DA SILVA 0.57; pep:ELITA MENDONÇA DA SILVA 0.57; ...

$ python tools/compliance/screening.py "Germain Katanga" --nascimento 1978-04-28        # ONU CDi.006, DOB da lista
DECISÃO: CONFIRMED  (2 resultado(s) >= limiar)
  [confirmed] 1.000 (nome 1.000) ofac  11975     Germain KATANGA  nascimento_igual
  [confirmed] 1.000 (nome 1.000) un    CDi.006   GERMAIN KATANGA  nascimento_igual

$ python tools/compliance/screening.py "Eric Badege"                                     # ONU CDi.001, só nome
DECISÃO: MATCH  (2 resultado(s) >= limiar)
  [match ] 1.000 (nome 1.000) ofac  15718      Eric BADEGE
  [match ] 1.000 (nome 1.000) un    CDi.001    ERIC BADEGE

$ python tools/compliance/screening.py "Erik Badegé"                                     # grafia com erro
DECISÃO: REVIEW  (2 resultado(s) >= limiar)
  [review] 0.950 (nome 0.950) ofac  15718      Eric BADEGE
  [review] 0.950 (nome 0.950) un    CDi.001    ERIC BADEGE

$ python tools/compliance/screening.py "Abu Abbas" --nascimento 1948-12-10              # OFAC 2674, DOB da lista
DECISÃO: CONFIRMED  [confirmed] 1.000 ofac 2674 Abu ABBAS nascimento_igual
$ python tools/compliance/screening.py "Abu Abbas" --nascimento 1975-01-01              # mesmo nome, DOB diferente
DECISÃO: REVIEW     [review] 0.850 (nome 1.000) ofac 2674 Abu ABBAS nascimento_divergente

$ python tools/compliance/screening.py "Aldino de Oliveira Alves"                        # PEP real do arquivo 202609
DECISÃO: MATCH
  [match ] 1.000 pep ***.251.399-**|ALDINO DE OLIVEIRA ALVES
  [review] 0.967 pep ***.876.065-**|ALVINO DE OLIVEIRA ALVES
$ python tools/compliance/screening.py "Aldino de Oliveira Alves" --cpf 111.251.399-00   # CPF sintético com o meio igual
DECISÃO: CONFIRMED
  [confirmed] 1.000 pep ***.251.399-**|ALDINO DE OLIVEIRA ALVES  cpf_parcial_igual
  [homonimo] 0.677 (nome 0.967) pep ***.876.065-**|ALVINO DE OLIVEIRA ALVES  cpf_divergente
$ python tools/compliance/screening.py "Aldino de Oliveira Alves" --cpf 123.456.789-09   # CPF válido com o meio diferente
DECISÃO: CLEAR
  [homonimo] 0.700 (nome 1.000) pep ***.251.399-**|ALDINO DE OLIVEIRA ALVES  cpf_divergente

$ python tools/compliance/screening.py "Renata Bezerra Cavalcante" --cpf 086.440.924-99  # CNEP, CPF completo público
DECISÃO: CONFIRMED  [confirmed] 1.000 cnep CNEP|08644092499|12/11/2024 RENATA BEZERRA CAVALCANTE cpf_completo_igual
$ python tools/compliance/screening.py "Fulano Qualquer" --cpf 086.440.924-99            # CPF de lista com outro nome
DECISÃO: MATCH      [match ] 1.000 (nome 0.000) cnep ... cpf_completo_igual nome_divergente

$ python tools/compliance/screening.py "Joao da Silva"                                   # nome comum
DECISÃO: CLEAR
  mais próximos abaixo do limiar: pep:JOAO PAULO SILVA E SILVA 0.83; pep:JOAO DA SILVA SILVEIRA 0.80; ...
```

Resultado honesto dos sócios: **sem correspondência** em ONU, OFAC, PEP, CEIS e CNEP. Os nomes mais próximos são
homônimos parciais do PEP (pontuação ≤ 0,63, abaixo do limiar de revisão de 0,85). A data de nascimento dos sócios não
estava disponível para esta fatia, então a consulta foi feita por nome e CPF. Os dois resultados estão gravados:

```
$ python tools/compliance/screening.py "Michael Mendonça Barros Silva" --cpf ... --save
gravado em screening_results: [{"id": "a7f294d4-dd43-44af-a6e7-fee8b2711bfb", "decision": "clear", ...}]
$ python tools/compliance/screening.py "Raphael Mendonça Barros Silva" --cpf ... --save
gravado em screening_results: [{"id": "af391a1a-f187-42bd-aa26-96b23573b78a", "decision": "clear", ...}]
$ python tools/compliance/screening.py "Eric Badege" --save          # linha de teste, user_id nulo, anotada como teste
gravado em screening_results: [{"id": "e5c23e01-ee2d-4a62-992a-17fc3f6f6ee6", "decision": "match", ...}]
```

Cada gravação gerou a sua linha em `audit_log` com ator `tools/compliance/screening.py`. Sem `user_id` a trigger
G01/G02 não atua (não há conta a bloquear).

## 4. Monitor (`tools/compliance/monitor.py`)

IDs, gatilhos e severidades = BO-POL-01 item 9; números no dict `PARAMS` do topo do arquivo; cliente de alto risco
tem os gatilhos de valor e quantidade de P01, P04, P05, C01 e AF02 pela metade (9.4). Os efeitos automáticos de
retenção viram flags no alerta e a trigger `ledger_kyc_limits` recusa o movimento enquanto o alerta estiver aberto.

### 4.1 Produção

```
$ python tools/compliance/monitor.py --once
dados: 28 linhas de ledger (deposit/withdrawal/buyin), 17 mãos, 0 kyc_profiles, 25 sessões com IP, 0 destinos pix, 0 tentativas recusadas
  P01   0 alerta(s)  [sem fonte de dado ainda: 0 depósitos/saques reais no ledger (Pix não integrado)]
  P02   0 alerta(s)  [ok]
  P03a  0 alerta(s)  [sem fonte de dado ainda: o app não coleta impressão digital de dispositivo (client_sessions não existe)]
  P03b  1 alerta(s)  [ok: 25 sessões com IP (auth.sessions); parte 'mesma mesa': sem fonte de dado ainda (client_sessions não existe)]
  P03c  0 alerta(s)  [ok: 0 destino(s) de saque cadastrado(s); conta de origem: sem fonte de dado ainda (pix_in não existe)]
  P04   0 alerta(s)  [sem fonte de dado ainda: 0 depósitos reais no ledger (Pix não integrado)]
  P05   0 alerta(s)  [sem fonte de dado ainda: 0 depósitos reais no ledger (Pix não integrado)]
  P06   0 alerta(s)  [ok: 0 tentativa(s) recusada(s) em payout_rejections]
  P07   0 alerta(s)  [sem fonte de dado ainda: Pix de entrada não integrado (pix_in não existe)]
  P08   0 alerta(s)  [ok (agravante por dispositivo/geolocalização: sem fonte de dado ainda; IP de auth.sessions usado)]
  P09   0 alerta(s)  [sem fonte de dado ainda: país/VPN da sessão não são coletados (client_sessions não existe)]
  C01   0 alerta(s)  [sem fonte de dado ainda: vendas de Cursos ficam na plataforma de infoprodutos (course_orders não existe)]
  C02   0 alerta(s)  [sem fonte de dado ainda: course_orders não existe]
  AF01  0 alerta(s)  [sem fonte de dado ainda: programa de Afiliados não registrado no banco (affiliate_referrals não existe)]
  AF02  0 alerta(s)  [sem fonte de dado ainda: comissões de Afiliados não registradas no banco (affiliate_commissions não existe)]
  G01   0 alerta(s)  [ok: gerado pela trigger screening_effects no screening (0 alerta(s) G01/G01-OFAC registrados)]
  G02   0 alerta(s)  [ok: gerado pela trigger screening_effects no screening (0 alerta(s) G02 registrados)]
  G03   0 alerta(s)  [ok: denúncia (minor_report) ativa; bureau e prova de vida: sem fonte de dado ainda (não contratados)]
    - P03b medium P03b|ip|189.4.x.x|16
gravados: 1 novo(s); 0 já existia(m) (dedupe); cadastros com atualização vencida marcados: 0
$ python tools/compliance/monitor.py --once          # segunda rodada
gravados: 0 novo(s); 1 já existia(m) (dedupe)
```

O único alerta de produção é real: as 16 contas de teste (smoke e exploit tests) foram criadas e jogadas a partir do
mesmo IP (a máquina de desenvolvimento), o que atinge a regra P03b (3 ou mais contas do mesmo IP em 30 dias). Ficou
**aberto** para o Diretor de Compliance encerrar com conclusão `nao_suspeito` e a justificativa (contas de teste
internas); a ferramenta não fecha alerta sozinha. P02 e P08 rodaram sobre as 17 mãos de smoke e não acharam padrão
(cada par tem poucas mãos e nenhum fluxo de R$ 500).

Simulação (sem gravar), tratando as fichas de teste como se fossem depósito:

```
$ python tools/compliance/monitor.py --once --dry-run --include-test-credits
dados: 70 linhas de ledger (deposit/withdrawal/buyin/credit_test), 17 mãos, ...
  P03b  1 alerta(s)
  P04   7 alerta(s)   (critério a: 5 créditos de R$ 1.000 no mesmo dia, até 5 por dia no app)
  P05   7 alerta(s)   (critério média: R$ 3.000+ em 30 dias sem histórico anterior)
dry-run: nada gravado
```

Relatório:

```
$ python tools/compliance/monitor.py --report
# Relatório PLD/FTP — alertas abertos (public)
Prazos de análise: crítica imediato; alta 5 dias úteis; média 15 dias úteis; baixa 30 dias; teto 45 dias.
Totais por status: open 1.
| Regra | Sev. | Status | Conta | Criado | Prazo | SLA | Retenção | Resumo |
| P03b | média | open | `3bbf309c` | 2026-11-05 15:42 | 2026-11-26 15:42 | 21.0 d restantes | - | ip=189.4.x.x, n_contas=16, janela_dias=30 |
```

### 4.2 Cenário sintético: cada regra disparando

`--selftest` cria o schema `c1test_<data-hora>` com as mesmas colunas (`kyc_profiles` e `aml_alerts` copiados de
`public` com `like ... including constraints`, as outras no contrato documentado no topo do `monitor.py`), carrega 26
contas, 15 linhas de ledger e 41 mãos, roda as mesmas funções de regra, grava em `c1test_*.aml_alerts` duas vezes
(prova do dedupe) e apaga o schema no fim. G01 e G02 são testados no banco real, porque vivem em trigger.

```
$ python tools/compliance/monitor.py --selftest
schema sintético: c1test_20261105124123  (15 linhas de ledger, 41 mãos, 26 contas)
  P01   DISPAROU  1 alerta(s) sev=['medium']  depósito R$ 1.000 -> saque R$ 950 em 24 h, volume apostado R$ 100 (0,1x)
  P02   DISPAROU  1 alerta(s) sev=['high']    ganho líquido de B R$ 600 = 100% das perdas de A, 3 sessões em comum, 12 mãos
  P03a  DISPAROU  2 alerta(s) sev=['high']    dev-AAAA em 2 contas; dev-AF em 2 contas (afiliado + indicado)
  P03b  DISPAROU  2 alerta(s) sev=['high','medium']  3 contas no IP 203.0.113.7 (média); 2 delas na mesma mesa (alta)
  P03c  DISPAROU  1 alerta(s) sev=['high']    pix-compartilhada@example.com em 2 contas
  P04   DISPAROU  3 alerta(s) sev=['medium']  (a) 4 depósitos R$ 1.200 em 3 h; (b) 2 x R$ 4.900 em 3 dias (faixa R$ 5.000);
                                              (c) R$ 1.900 em out/2026 e nov/2026 com limite mensal de R$ 2.000 (nível 1)
  P05   DISPAROU  3 alerta(s) sev=['high','medium']  R$ 9.000 em 30 dias com renda R$ 4.000 (>100%: alta, retém depósito);
                                              R$ 9.000 e R$ 9.800 contra média 0 dos 3 meses anteriores (média)
  P06   DISPAROU  1 alerta(s) sev=['high']    2 tentativas de saque para titular diferente em 30 dias
  P07   DISPAROU  1 alerta(s) sev=['medium']  Pix de R$ 500 de pagador com CPF diferente
  P08   DISPAROU  3 alerta(s) sev=['high','medium']  par em 12 sessões (75% / 100%), raise entre elas 0,167 vs 1,0 contra
                                              terceiros (< 1/3: agravado, alta)
  P09   DISPAROU  1 alerta(s) sev=['medium']  3 sessões de dinheiro real: PT, US e BR com VPN
  C01   DISPAROU  3 alerta(s) sev=['medium']  2 reembolsos em 90 dias + 1 MED, por CPF, dispositivo e cartão
  C02   DISPAROU  2 alerta(s) sev=['medium']  pagador com CPF e nome diferentes; 3 CPFs no mesmo cartão em 30 dias
  AF01  DISPAROU  1 alerta(s) sev=['high']    indicado no mesmo dispositivo do afiliado
  AF02  DISPAROU  1 alerta(s) sev=['medium']  comissão R$ 6.000 contra média R$ 500 dos 3 meses anteriores
  G01   (trigger no banco: testado abaixo)
  G02   (trigger no banco: testado abaixo)
  G03   DISPAROU  1 alerta(s) sev=['high']    bureau: nascimento divergente e menor de 18 -> conta suspensa
  contas de controle (clean, clean2): 0 alerta(s)
  gravados em c1test_20261105124123.aml_alerts: 1a rodada 27, 2a rodada 0 (dedupe)
  prazo calculado por severidade (due_at - created_at): high=7 days, medium=21 days
SELFTEST REGRAS: OK
limpeza: drop schema c1test_20261105124123 cascade -> restam 0 schema(s) com esse nome
```

(As linhas acima resumem os valores; a saída completa traz o jsonb de cada alerta.) Os prazos batem com o item 10.1:
5 dias úteis a partir de quinta-feira = 7 dias corridos; 15 dias úteis = 21 dias corridos.

### 4.3 Controles no banco de produção (transação desfeita no fim)

A segunda parte do `--selftest` roda um bloco `DO` em `public` que cria perfis temporários, exercita as triggers reais
e termina com `raise exception`, o que desfaz tudo. A mensagem do erro carrega os resultados:

```
screening para o teste: 'Germain Katanga' 1978-04-28 -> confirmed; 'Eric Badege' -> match
  kyc nivel2 completo: risco=medio proxima_atualizacao=2028-11-05
  menor de 18 recusado: KYC_UNDERAGE
  destino mesmo CPF: true
  destino CPF de terceiro: ok=false erro=PAYOUT_HOLDER_MISMATCH tentativas_gravadas=1
  insert direto de terceiro: PAYOUT_HOLDER_MISMATCH
  deposito R$ 1.500 (nivel 2): aceito
  deposito +R$ 600 (passa R$ 2.000/dia): KYC_LIMIT
  saque sem destino: PAYOUT_DESTINATION_REQUIRED
  saque R$ 100 para destino proprio: aceito
  deposito sem KYC: KYC_REQUIRED
  UPDATE ledger: LEDGER_APPEND_ONLY
  DELETE ledger: LEDGER_APPEND_ONLY
  UPDATE audit_log: AUDIT_LOG_APPEND_ONLY
  DELETE audit_log: AUDIT_LOG_APPEND_ONLY
  audit_log de kyc/destinos/alertas nesta transação: 2
  G02: preventive_hold=true alerta=G02/high/prazo 1 day
  deposito com G02 aberto: KYC_PREVENTIVE_HOLD
  G01: kyc bloqueado freeze=true motivo=G01: correspondência confirmada na lista ONU/CSNU (screening
  G01 alerta: G01/critical/prazo 00:00:00/retem saque,deposito,jogo=true,true,true
  fichas para conta G01: ACCOUNT_BLOCKED
  levantar indisponibilidade sem fundamento: KYC_FREEZE_LOCKED
  rollback: perfis de teste restantes no banco = 0
SELFTEST BANCO: OK
```

## 5. audit_log e ledger rejeitam UPDATE e DELETE (direto na produção, como `postgres`)

```
$ python tools/migrate.py --sql "update public.audit_log set actor='x' where id=(select min(id) from public.audit_log)"
ERROR:  P0001: AUDIT_LOG_APPEND_ONLY: UPDATE em audit_log é proibido
$ python tools/migrate.py --sql "delete from public.audit_log where id=(select min(id) from public.audit_log)"
ERROR:  P0001: AUDIT_LOG_APPEND_ONLY: DELETE em audit_log é proibido
$ python tools/migrate.py --sql "truncate public.audit_log"
ERROR:  P0001: AUDIT_LOG_APPEND_ONLY: TRUNCATE em audit_log é proibido
$ python tools/migrate.py --sql "update public.ledger set amount_cents=0 where id=(select min(id) from public.ledger)"
ERROR:  P0001: LEDGER_APPEND_ONLY: UPDATE em ledger é proibido; corrija com uma linha nova (kind adjust)
$ python tools/migrate.py --sql "delete from public.ledger where id=(select min(id) from public.ledger)"
ERROR:  P0001: LEDGER_APPEND_ONLY: DELETE em ledger é proibido; corrija com uma linha nova (kind adjust)
$ python tools/migrate.py --sql "select entity, action, count(*) from audit_log group by 1,2"
aml_alerts INSERT 1 · screening_results INSERT 3 · screening_results UPDATE 1 (nota de teste na linha "Eric Badege")
```

Limite que precisa ser dito: o dono do banco (superusuário `postgres` do Supabase) consegue desligar uma trigger com
`alter table ... disable trigger`. Isso é DDL, fica fora do alcance do service_role e do app, e aparece no log de
DDL/Postgres do Supabase; não é proteção contra o próprio administrador do projeto.

## 6. O que ainda não existe (declarado, não simulado)

- Fontes de dado: Pix (entrada e saída), impressão digital de dispositivo, país/VPN da sessão, vendas e reembolsos de
  Cursos, cadastro de Afiliados e comissões, bureau de CPF e prova de vida. As regras que dependem delas estão
  implementadas e provadas no cenário sintético; na produção saem com "sem fonte de dado ainda". O contrato de colunas
  esperado está no topo de `tools/compliance/monitor.py`.
- Classificação automática de risco pela tabela de pontos do item 5.4: não implementada. O banco aplica só o alto
  risco automático para PEP e nível 3 (5.5 a e c); o resto do `risk_level` é gravado pelo analista.
- Agendamento: o monitor roda por comando (`--once`). O item 9.1 pede no mínimo de hora em hora e de forma síncrona
  antes de cada saque; o agendador e a chamada síncrona no fluxo de saque precisam ser ligados quando o saque existir.
- Screening diário de toda a base e baixa diária da lista ONU (7.1 c): as ferramentas existem; o agendamento não.
- Feriados não são descontados no cálculo de dias úteis.
- O app (`app/`) ainda não grava `kyc_profiles` nem chama `register_payout_destination`; isso é de outra fatia.
