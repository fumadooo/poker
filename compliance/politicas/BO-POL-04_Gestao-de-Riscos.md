# Política de Gestão de Riscos

| Campo | Conteúdo |
|---|---|
| Código | BO-POL-04 |
| Versão | 1.0 |
| Data | 05/11/2026 |
| Aprovação | Raphael Mendonça Barros Silva, Administrador |
| Responsável | Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP |
| Empresa | BLACK OPS LTDA, CNPJ 58.557.156/0001-58 |
| Documentos relacionados | BO-GOV-01, BO-POL-01 (PLD/FTP), BO-POL-02 (KYC), BO-POL-03 (Cadastro), BO-POL-05 (Segurança da Informação), BO-POL-06 (Atendimento) |

## 1. Objetivo

1.1. Estabelecer como a BLACK OPS LTDA identifica, avalia, trata, monitora e reporta os riscos das suas atividades, com controles proporcionais ao porte da empresa (2 sócios, operação 100% digital) e executáveis pelas pessoas nomeadas nesta política.

1.2. Garantir que nenhuma atividade nova, em especial a operação de poker online com dinheiro real, comece antes que os seus riscos estejam avaliados e que os controles marcados como pré-requisito estejam implementados e verificados.

## 2. Abrangência

2.1. Aplica-se a todas as atividades da empresa:

- a) atividade atual: venda online de cursos livres e conteúdo digital (audiência no Instagram @mikhaeu_), por plataforma de infoprodutos;
- b) uso da conta de pagamento na Trio: Pix recebido e enviado (QR Code e transferência), pagamento de afiliados em lote e cartão corporativo pré-pago para mídia paga;
- c) plataforma própria de poker online (jogo de habilidade), hoje em desenvolvimento e operando apenas com fichas de teste, sem dinheiro real.

2.2. Aplica-se aos dois sócios, a qualquer colaborador ou prestador de serviço futuro e aos fornecedores, na medida dos respectivos contratos.

## 3. Definições

- **Risco**: possibilidade de um evento afetar os objetivos da empresa, os clientes ou o sistema financeiro.
- **Probabilidade (P)**: chance de o evento ocorrer em 12 meses, em escala de 1 (rara) a 5 (quase certa).
- **Impacto (I)**: consequência financeira, legal, regulatória ou reputacional, em escala de 1 (desprezível) a 5 (grave: perda da conta de pagamento, sanção, dano a cliente ou dinheiro de cliente sem cobertura).
- **Nível de risco**: P × I. Alto: 15 a 25. Médio: 8 a 14. Baixo: 1 a 7.
- **Risco residual**: nível do risco considerando os controles indicados na matriz.
- **KRI (indicador-chave de risco)**: métrica com limite de alerta e limite máximo que dispara ação.
- **MED**: Mecanismo Especial de Devolução do Pix, pelo qual valores recebidos podem ser bloqueados e devolvidos em caso de fundada suspeita de fraude ou de falha operacional.
- **Chargeback**: contestação de compra com cartão pelo portador, que reverte o valor ao comprador.
- **Ledger**: tabela contábil do software POKER (`public.ledger`) em que cada movimento de saldo é uma linha nova; o saldo de cada usuário é a soma das suas linhas.
- **Saldo de jogadores**: soma dos saldos de todos os usuários no ledger mais as fichas em mesa; na operação com dinheiro real, representa dinheiro de terceiros sob guarda da empresa.

## 4. Papéis e responsabilidades

4.1. **Administrador (Raphael)**: aprova esta política e o apetite a risco, aloca recursos para os controles, aprova as respostas a riscos altos e responde legalmente pela empresa.

4.2. **Diretor de Compliance e PLD/FTP (Michael)**: mantém a matriz de riscos e os KRIs, executa e monitora os controles, registra incidentes, propõe tratamento, reporta ao Comitê de Compliance e revisa esta política anualmente.

4.3. **Comitê de Compliance (os dois sócios)**: examina mensalmente a matriz, os KRIs e os incidentes, decide sobre riscos fora do apetite e registra as decisões em ata (BO-GOV-01).

4.4. Cada risco da matriz tem um **dono**, responsável pelo controle e pela informação do KRI correspondente.

## 5. Apetite a risco

5.1. **Tolerância zero** (o evento não é aceito em nenhuma circunstância; a ocorrência é incidente crítico):

- a) relacionamento com menor de 18 anos;
- b) relacionamento com pessoa ou entidade listada em sanções do Conselho de Segurança das Nações Unidas (Lei 13.810/2019; Resolução BCB 44/2020), ou atraso no cumprimento de indisponibilidade de bens;
- c) operar poker com dinheiro real antes de: parecer jurídico favorável, alteração do objeto social, aprovação expressa da Trio e implementação dos pré-requisitos do Anexo A;
- d) saldo de jogadores sem cobertura integral em conta segregada;
- e) saque para conta de titularidade diferente da do jogador;
- f) prometer, oferecer ou dar vantagem indevida a agente público (Lei 12.846/2013), ou aceitar vantagem indevida de qualquer pessoa;
- g) chave de serviço (`service_role`) ou credencial administrativa exposta em código de cliente, repositório ou mensagem.

5.2. **Baixo apetite** (aceito apenas dentro dos limites dos KRIs da seção 8): fraude com Pix e MED, chargeback e reembolso de vendas, alertas de PLD em atraso, divergências de reconciliação explicadas em D+1.

5.3. **Apetite moderado**: indisponibilidade técnica curta da plataforma de poker em fichas de teste; risco reputacional próprio de um criador de conteúdo com audiência pública, desde que tratado conforme o BO-POL-06.

5.4. Qualquer risco residual classificado como Alto exige plano de tratamento aprovado pelo Administrador, com prazo, registrado em ata.

## 6. Categorias de risco e controles

### 6.1. Risco operacional

Falhas de processo, de pessoas ou de sistemas. Pontos concretos: dependência de 2 pessoas; erro de cálculo de saldo no software; erro manual em pagamentos em lote.

Controles: no POKER, saldo só se move por funções transacionais no banco (`buyin`, `leave_table`, `settle_hand`, `credit_test`), executáveis apenas pelo servidor; o gatilho `ledger_guard` impede saldo negativo de usuário; o invariante do ledger é verificado por teste automatizado; pagamentos em lote são conferidos por quem não os preparou (BO-GOV-01, alçadas); procedimentos escritos permitem que um sócio execute o essencial na ausência do outro (seção 9).

### 6.2. Risco de PLD/FTP

Uso da empresa para lavagem de dinheiro ou financiamento do terrorismo (Lei 9.613/1998; Lei 13.260/2016). Pontos concretos no poker: depósito e saque sem jogo, transferência de valor entre jogadores por perda intencional (chip dumping), contas de passagem, uso de identidade de terceiros. Na atividade atual: pagamento de comissão a afiliados não identificados.

Controles: tratados no BO-POL-01, BO-POL-02 e BO-POL-03 (identificação do cliente, screening de listas, monitoramento, comunicação ao COAF). Nesta política, entram na matriz e nos KRIs.

### 6.3. Risco de fraude

- a) **Pix recebido de origem fraudulenta e MED**: um depósito feito com conta invadida ou por vítima de golpe pode ser bloqueado e devolvido pelo MED depois de o valor ter sido creditado ao jogador e eventualmente sacado ou perdido para outro jogador. Controles: crédito do depósito somente quando o CPF do pagador recebido com o Pix for igual ao CPF cadastrado do jogador; saque somente para conta do mesmo CPF; limites de depósito e de saque menores para contas novas; retenção para análise do saque de valor depositado e não jogado; resposta a toda notificação de MED dentro do prazo informado pela Trio; bloqueio cautelar da conta do jogador envolvido.
- b) **Chargeback**: hoje só existe nas vendas de cursos pagas com cartão na plataforma de infoprodutos, que processa e arbitra a contestação. Controles: política de reembolso clara (BO-POL-06), registro de entrega do acesso pela plataforma, acompanhamento da taxa mensal. A Trio não processa cartão de crédito de clientes para a empresa; o cartão corporativo é pré-pago e usado só para mídia.
- c) **Fraude interna e de afiliados**: comissão calculada sobre rake ou vendas inexistentes. Controles: comissão calculada a partir de registros de sistema (linhas de rake no ledger do POKER, relatório de vendas da plataforma de infoprodutos); lote aprovado pelo Administrador.

### 6.4. Risco de crédito

A empresa não concede crédito, não antecipa saldo a jogadores e não financia jogo. O cartão corporativo é pré-pago. A exposição de crédito existe em três pontos: valor de MED ou chargeback devolvido depois de já repassado (perda própria); comissão de afiliado paga antes da confirmação do valor que a gerou; adiantamento a fornecedor.

Controles: saldo de jogador nunca negativo (`ledger_guard`); comissão de afiliado paga só sobre período fechado e conciliado; perdas por MED e chargeback registradas e cobertas por capital próprio, nunca pelo saldo de jogadores.

### 6.5. Risco de liquidez

Na operação com dinheiro real, o saldo de jogadores é dinheiro de terceiros. Regras:

- a) o saldo de jogadores é mantido em conta (ou subconta) segregada, separada da conta operacional da empresa, e nunca é usado para despesas, mídia, comissões ou retiradas dos sócios;
- b) a cobertura (saldo da conta segregada ÷ saldo de jogadores no ledger) é de no mínimo 100% em todo fechamento diário;
- c) a reconciliação é diária: saldo de jogadores (ledger + fichas em mesa) contra o extrato da conta segregada, e cada Pix recebido e enviado no dia contra uma linha do ledger; diferença não explicada em D+1 é incidente (seção 10);
- d) o rake só é transferido da conta segregada para a conta operacional depois da reconciliação do dia;
- e) o caixa próprio da empresa deve cobrir as perdas esperadas com MED e chargeback de 1 mês.

Situação: o ledger e a verificação do invariante existem no software; a conta segregada e a rotina automática de reconciliação diária com o extrato da Trio ainda não existem e são pré-requisito para dinheiro real (Anexo A).

### 6.6. Risco legal e regulatório

- a) Enquadramento do poker online: a empresa trata o poker como jogo de habilidade, mas só operará com dinheiro real após parecer jurídico favorável, alteração do objeto social (hoje CNAE 8599-6/99 e 6391-7/00) e aprovação da Trio.
- b) Obrigações de PLD/FTP, LGPD (Lei 13.709/2018), proteção de menores (ECA, Lei 8.069/1990), defesa do consumidor (Lei 8.078/1990) e anticorrupção (Lei 12.846/2013).
- c) Exigências contratuais da Trio, que está sujeita à Circular BCB 3.978/2020, adotada pela empresa como referência voluntária de boas práticas.

Controles: acompanhamento das normas pelo Diretor; parecer jurídico externo antes de qualquer mudança de modelo de negócio; nenhuma comunicação pública que apresente o poker como promessa de ganho.

### 6.7. Risco reputacional

A empresa depende da audiência de @mikhaeu_. Pontos concretos: reclamação pública de cliente; associação da marca a jogo para menores ou a promessa de ganho fácil; afiliados com divulgação enganosa. Controles: atendimento com SLA (BO-POL-06); regras de divulgação no contrato de afiliado (proibido público menor de 18 anos, proibida promessa de ganho); acompanhamento de menções e comentários pelo próprio Michael.

### 6.8. Risco de terceiros e fornecedores

Fornecedores críticos: Trio (conta de pagamento e Pix), Supabase (banco de dados e autenticação), Vercel (hospedagem da aplicação), GitHub (código-fonte), plataforma de infoprodutos (vendas de cursos), Meta (Instagram e WhatsApp, canais de atendimento). A contratar antes de dinheiro real: fornecedor de KYC (bureau de validação de CPF).

Controles: due diligence antes da contratação (situação cadastral, documentação de segurança publicada, local de tratamento de dados, cláusulas de proteção de dados); lista de fornecedores com dono e plano de saída mantida pelo Diretor; revisão anual.

### 6.9. Risco cibernético

Invasão, vazamento de dados ou de chaves, manipulação de saldo ou de cartas, indisponibilidade por ataque. Controles detalhados no BO-POL-05: MFA nas contas administrativas, chaves só no servidor, RLS no banco, revisão adversarial e testes de exploit antes de release, seed do baralho com compromisso público por hash.

## 7. Matriz probabilidade × impacto

7.1. Avaliação inicial em 05/11/2026, tomando como cenário a operação de poker com dinheiro real (mais conservador que o estado atual, em fichas de teste). P e I são residuais, isto é, supõem os controles indicados em funcionamento; a situação de cada controle está na Tabela 7.1-B.

**Tabela 7.1-A — Avaliação**

| Risco | Categoria | P × I = nível | Dono |
|---|---|---|---|
| R01 — Depósito Pix de conta de terceiro ou de vítima de golpe, seguido de MED após o crédito | Fraude / crédito | 4 × 4 = 16 Alto | Michael |
| R02 — Saque para conta de terceiro (conta de passagem) | PLD/FTP | 2 × 5 = 10 Médio | Michael |
| R03 — Transferência de valor entre jogadores por perda intencional (chip dumping) | PLD/FTP | 3 × 4 = 12 Médio | Michael |
| R04 — Cadastro de menor de 18 anos ou com identidade falsa | Legal / PLD | 3 × 5 = 15 Alto | Michael |
| R05 — Cliente ou afiliado sancionado (CSNU/OFAC) ou PEP não identificado | PLD/FTP | 2 × 5 = 10 Médio | Michael |
| R06 — Saldo de jogadores sem cobertura ou divergência entre ledger e extrato | Liquidez | 2 × 5 = 10 Médio | Michael (executa) / Raphael (aprova ajustes) |
| R07 — Falha de software que crie ou destrua fichas (erro de liquidação, condição de corrida) | Operacional | 2 × 5 = 10 Médio | Michael |
| R08 — Vazamento da chave `service_role` ou de credencial administrativa | Cibernético | 2 × 5 = 10 Médio | Michael |
| R09 — Pessoa com acesso ao servidor joga com vantagem (vê cartas fechadas) | Fraude interna | 2 × 5 = 10 Médio | Raphael |
| R10 — Operar com dinheiro real sem enquadramento jurídico ou fora do objeto social | Legal / regulatório | 2 × 5 = 10 Médio | Raphael |
| R11 — Encerramento ou bloqueio da conta Trio (taxa de MED, descumprimento contratual) | Terceiros / liquidez | 2 × 5 = 10 Médio | Michael |
| R12 — Comissão de afiliado paga indevidamente, ou afiliado com divulgação enganosa ou para menores | Fraude / reputacional | 3 × 3 = 9 Médio | Raphael |
| R13 — Indisponibilidade de Supabase ou Vercel com mãos em andamento | Operacional / terceiros | 3 × 3 = 9 Médio | Michael |
| R14 — Ausência ou incapacidade de um dos sócios | Operacional | 2 × 4 = 8 Médio | Raphael |
| R15 — Chargeback e reembolso em vendas de cursos acima do normal | Fraude / reputacional | 2 × 2 = 4 Baixo | Michael |
| R16 — Uso do cartão corporativo fora da finalidade (mídia paga) | Operacional | 1 × 2 = 2 Baixo | Raphael |

**Tabela 7.1-B — Controles**

| Risco | Controle principal | Situação do controle |
|---|---|---|
| R01 — Pix fraudulento / MED | Crédito só se CPF do pagador = CPF do jogador; limites para conta nova; retenção de saque de valor não jogado; bloqueio cautelar | A implementar antes de dinheiro real |
| R02 — Saque a terceiro | Saque só para chave/conta do mesmo CPF; saque acima de alçada revisado (BO-GOV-01) | A implementar antes de dinheiro real |
| R03 — Chip dumping | Histórico completo de mãos e ações (`hands.log`, `actions`); regra de alerta por par de jogadores (BO-POL-01) | Registro existe; regra de alerta a implementar |
| R04 — Menor ou identidade falsa | Validação de CPF e data de nascimento em bureau de KYC; bloqueio automático de menor (BO-POL-02) | A implementar antes de dinheiro real (hoje o cadastro pede só e-mail) |
| R05 — Sancionado ou PEP | Screening em listas públicas no cadastro e diariamente (BO-POL-01) | Em implementação (`tools/compliance/screening.py`); pré-requisito para dinheiro real |
| R06 — Cobertura do saldo de jogadores | Conta segregada; reconciliação diária; cobertura ≥ 100% | Ledger existe; conta segregada e reconciliação a implementar |
| R07 — Erro de software no saldo | Funções transacionais com lock; `ledger_guard`; teste de invariante e de exploit antes de release | Implementado (evidência em `run/F1_evidence.md`) |
| R08 — Vazamento de credencial | Chave só em variável de ambiente do servidor; `.env` fora do Git; MFA; rotação (BO-POL-05) | Parcial: segregação da chave implementada; MFA e rotação a verificar e registrar |
| R09 — Jogo com vantagem interna | Proibição de sócios e pessoas com acesso administrativo jogarem em mesas com dinheiro real (BO-GOV-01); estado da mesa inacessível a clientes | Regra vigente; RLS implementado |
| R10 — Dinheiro real sem enquadramento | Proibição expressa (5.1 c); checklist do Anexo A aprovado em ata | Vigente |
| R11 — Perda da conta Trio | KRIs de MED com limite abaixo do tolerado pela Trio; comunicação proativa à Trio; plano de continuidade (seção 9) | Vigente; limite da Trio a confirmar com a Trio |
| R12 — Comissão de afiliado | Cálculo por registro de sistema; lote aprovado pelo Administrador; contrato com regras de divulgação | Vigente para vendas de cursos |
| R13 — Indisponibilidade de provedor | Liquidação idempotente por mão; recuperação de mão encerrada e não liquidada; saldos preservados no banco | Implementado |
| R14 — Pessoa-chave | Procedimentos escritos; acesso de emergência às contas críticas para o outro sócio (9.4) | A formalizar em até 30 dias desta versão |
| R15 — Chargeback e reembolso de cursos | Política de reembolso (BO-POL-06); acompanhamento mensal | Vigente |
| R16 — Cartão corporativo | Orçamento mensal aprovado pelo Administrador; conferência mensal da fatura contra as plataformas de anúncio | Vigente |

7.2. R01 e R04 estão em nível Alto. Plano de tratamento: os controles indicados são pré-requisito para dinheiro real (Anexo A); enquanto não existirem, não há depósito de jogadores e o risco não se materializa.

## 8. Indicadores (KRIs)

8.1. Medidos pelo Diretor e apresentados na reunião mensal do Comitê. No limite de alerta, o dono do risco registra a causa e a ação; no limite máximo, aplica-se a ação indicada e o Comitê se reúne extraordinariamente.

| KRI | Fórmula | Frequência | Alerta | Limite máximo | Ação no limite máximo |
|---|---|---|---|---|---|
| Taxa de MED (quantidade) | notificações de MED ÷ Pix recebidos, no mês | Semanal e mensal | ≥ 0,10% | ≥ 0,30% | Suspender cadastro de novos jogadores e reduzir limites de depósito até tratar a causa |
| Taxa de MED (valor) | valor bloqueado ou devolvido por MED ÷ valor recebido por Pix, no mês | Mensal | ≥ 0,20% | ≥ 0,50% | Idem, e comunicar a Trio |
| Chargeback em vendas de cursos | contestações ÷ vendas com cartão, no mês (relatório da plataforma) | Mensal | ≥ 0,50% | ≥ 1,00% | Revisar oferta, página de venda e público dos anúncios |
| Reembolsos de cursos | reembolsos ÷ vendas, no mês | Mensal | ≥ 7% | ≥ 12% | Revisar produto e comunicação comercial |
| Alertas de PLD em atraso | alertas sem conclusão além do prazo da sua severidade (BO-POL-01, item 10.1) | Diária | ≥ 1 | qualquer alerta aberto há mais de 30 dias, ou alerta crítico não tratado de imediato (teto absoluto do BO-POL-01: 45 dias) | Escalar ao Comitê; congelar movimentação do cliente até a conclusão |
| Divergência de reconciliação | saldo de jogadores (ledger + fichas em mesa) − saldo da conta segregada | Diária | qualquer diferença ≠ R$ 0,00 em D+1 | diferença não explicada após 3 dias úteis, ou cobertura < 100% | Suspender saques e transferência de rake; incidente crítico; aporte de capital próprio se faltar cobertura |
| Invariante do ledger | Σ saldos + Σ fichas em mesa − Σ créditos emitidos; e nº de saldos negativos | A cada release e diária | — | qualquer valor ≠ 0 | Suspender mesas; incidente crítico |
| Contas administrativas sem MFA | contas do item 5.2 do BO-POL-05 sem MFA ativo | Trimestral | — | ≥ 1 | Ativar no mesmo dia ou bloquear a conta |
| Revisão de acessos | revisão trimestral feita no prazo | Trimestral | atraso de 1 a 15 dias | atraso > 15 dias | Registro em ata e revisão imediata |
| Incidentes de segurança | incidentes classificados como altos ou críticos no mês | Mensal | ≥ 1 alto | ≥ 1 crítico | Plano de resposta (BO-POL-05) e relatório ao Comitê |
| Atendimento fora do SLA | reclamações sem primeira resposta no SLA ÷ reclamações | Mensal | ≥ 5% | ≥ 10% | Revisar a rotina de atendimento (BO-POL-06) |

8.2. Os KRIs de MED, reconciliação e alertas de PLD do poker passam a ser medidos a partir do primeiro depósito de jogador. Os demais são medidos desde a vigência desta política.

8.3. Os limites de MED serão revistos quando a Trio informar o seu limite de tolerância, de modo que o limite máximo interno fique abaixo dele.

## 9. Plano de continuidade de negócios

9.1. Funções críticas: (a) guarda e integridade do saldo de jogadores; (b) atendimento e devoluções; (c) cumprimento das obrigações de PLD/FTP e de sanções; (d) recebimento das vendas de cursos.

9.2. Cenários e respostas:

| Cenário | Resposta | Responsável |
|---|---|---|
| Supabase indisponível | As mesas param (o servidor não grava estado sem o banco); nenhum ajuste manual de saldo; ao voltar, mãos encerradas e não liquidadas são liquidadas pela rotina idempotente; aviso aos jogadores pelos canais do BO-POL-06 | Michael |
| Vercel indisponível | Aplicação fora do ar, saldos preservados no banco; aviso aos jogadores; acima de 24 horas, avaliar publicação em outro provedor a partir do código no GitHub | Michael |
| Conta Trio indisponível ou bloqueada | Suspender novos depósitos e mesas com dinheiro real; contato com o gerente da Trio; proibido movimentar saldo de jogadores por conta pessoal dos sócios ou por outra conta não segregada; comunicar aos jogadores o prazo de saque | Raphael (contato institucional) e Michael |
| Perda, roubo ou comprometimento de computador ou celular de sócio | Encerrar sessões e trocar senhas das contas administrativas; rotacionar chaves de API e a `service_role`; revisar logs de acesso; registrar incidente | Sócio afetado e Michael |
| Ausência prolongada de um sócio | O outro sócio assume as funções críticas pelos procedimentos escritos; na ausência do Diretor, decisões urgentes de PLD/FTP e sanções ficam com o Administrador, registradas em ata | Sócio presente |
| Vazamento de chave ou invasão | Plano de resposta a incidentes do BO-POL-05 | Michael |

9.3. Objetivos: restabelecer a aplicação em até 24 horas nos cenários de provedor; nenhum saldo de jogador perdido, pois o ledger é a fonte da verdade e cada mão é liquidada em uma única transação. A perda máxima de dados aceitável é a definida na política de backup do BO-POL-05.

9.4. Acesso de emergência: Raphael terá acesso próprio, com MFA, à conta Trio e aos painéis de Supabase e Vercel, para o cenário de ausência de Michael. Prazo de formalização: 30 dias a partir desta versão, registrado em ata.

9.5. O plano é testado uma vez por ano (exercício simulado com os dois sócios, registrado em ata) e sempre que um fornecedor crítico mudar.

## 10. Gestão de incidentes

10.1. **Incidente** é qualquer evento que viole o apetite a risco, atinja um limite máximo de KRI, cause perda financeira, afete dados pessoais ou interrompa função crítica.

10.2. Classificação:

| Nível | Exemplos | Início da resposta | Comunicação |
|---|---|---|---|
| Crítico | Cobertura < 100%; invariante do ledger ≠ 0; vazamento de chave; cliente sancionado identificado; menor com conta ativa | Imediato | Comitê no mesmo dia; Trio sem demora quando afetar a conta ou as transações; ANPD e titulares conforme BO-POL-05 |
| Alto | Divergência de reconciliação não explicada em D+1; KRI de MED no limite máximo; indisponibilidade > 4 horas | Até 4 horas | Comitê em até 24 horas |
| Médio | KRI em alerta; falha de controle sem perda | Até 2 dias úteis | Reunião mensal |
| Baixo | Falha isolada sem impacto | Até 10 dias úteis | Reunião mensal |

10.3. Procedimento: (1) detectar e conter; (2) lançar no registro de incidentes (data, hora, descrição, nível, pessoas e valores afetados, evidências); (3) analisar a causa; (4) corrigir e verificar a correção com evidência; (5) comunicar conforme 10.2; (6) encerrar com a lição aprendida e, se for o caso, atualizar a matriz.

10.4. Incidente com indício de lavagem de dinheiro ou de financiamento do terrorismo segue o BO-POL-01, inclusive a vedação de dar ciência ao cliente.

## 11. Registros e guarda

11.1. O Diretor mantém: matriz de riscos e suas versões, medições dos KRIs, registro de incidentes, testes do plano de continuidade e atas do Comitê.

11.2. Guarda mínima: 10 anos para registros relacionados a PLD/FTP; 5 anos para os demais registros desta política, contados do encerramento do registro.

11.3. Os registros são guardados em meio digital com controle de acesso e cópia de segurança (BO-POL-05).

## 12. Treinamento

12.1. Os dois sócios leem esta política e declaram ciência na aprovação. O Diretor conduz treinamento anual de gestão de riscos, com presença registrada em ata. Colaborador ou prestador com acesso a sistemas lê esta política antes de receber acesso.

## 13. Revisão

13.1. Revisão anual, até 05/11/2027, ou antes quando: começar a operação com dinheiro real; houver incidente crítico; mudar fornecedor crítico; mudar norma aplicável. A matriz da seção 7 é reavaliada em toda reunião mensal do Comitê.

## 14. Sanções internas

14.1. O descumprimento desta política é registrado em ata e tratado pelo Comitê, com medidas proporcionais: orientação formal, retirada de acessos, afastamento da função e, para prestadores, rescisão do contrato, sem prejuízo das consequências legais.

## 15. Vigência

15.1. Esta política entra em vigor na data da sua aprovação pela Reunião de Sócios de 05/11/2026 (ATA-01).

## Anexo A — Pré-requisitos para operar poker com dinheiro real

Nenhum depósito de jogador é aceito antes que todos os itens abaixo estejam concluídos, com evidência, e aprovados em ata:

1. Parecer jurídico favorável sobre o enquadramento da atividade.
2. Alteração do contrato social incluindo a atividade no objeto social.
3. Aprovação expressa da Trio para a atividade.
4. Fornecedor de KYC contratado; cadastro com CPF, data de nascimento e bloqueio de menor (BO-POL-02 e BO-POL-03).
5. Screening de listas (CSNU, OFAC, PEP/CGU) no cadastro e diário (BO-POL-01).
6. Regra de crédito de depósito apenas quando o CPF do pagador for igual ao do jogador, e de saque apenas para o mesmo CPF.
7. Conta segregada para o saldo de jogadores e rotina automatizada de reconciliação diária.
8. Regras de monitoramento de PLD/FTP, incluindo chip dumping, em produção.
9. Itens marcados "a implementar antes da operação com dinheiro real" no BO-POL-05.
10. Limites de depósito e autoexclusão em funcionamento (BO-POL-06).
