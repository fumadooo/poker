# Política de Prevenção à Lavagem de Dinheiro, ao Financiamento do Terrorismo e à Proliferação de Armas de Destruição em Massa (PLD/FTP)

| Campo | Conteúdo |
|---|---|
| Código | BO-POL-01 |
| Versão | 1.0 |
| Data | 05/11/2026 |
| Empresa | BLACK OPS LTDA, CNPJ 58.557.156/0001-58 |
| Aprovação | Raphael Mendonça Barros Silva, Administrador |
| Responsável | Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP |
| Políticas relacionadas | BO-POL-02 (Conheça Seu Cliente), BO-POL-03 (Cadastro de Clientes) |
| Próxima revisão | até 05/11/2027, ou antes se ocorrer gatilho do item 15 |

## 1. Objetivo

1.1. Estabelecer as regras, os papéis e os procedimentos que a BLACK OPS LTDA ("Empresa") adota para impedir que seus produtos, sua conta de pagamento e seus parceiros sejam usados para lavagem de dinheiro, financiamento do terrorismo ou financiamento da proliferação de armas de destruição em massa ("LD/FTP").

1.2. A política segue a abordagem baseada em risco: os controles ficam mais fortes onde o risco avaliado é maior (item 5).

## 2. Abrangência

2.1. Aplica-se aos sócios, a qualquer futuro empregado, prestador de serviço ou estagiário, aos afiliados e aos fornecedores que tenham acesso a dados de clientes ou a fluxos de pagamento.

2.2. Situação da Empresa: a Empresa atua em educação digital (cursos livres e conteúdo), com faturamento de cerca de R$ 1 milhão, e está em transição para concentrar o crescimento na plataforma própria de poker online, hoje em fase pré-operacional. A atividade de educação usa meio de pagamento próprio, fica fora do escopo da conta Trio e também observa os princípios de PLD/FTP, KYC e LGPD destas políticas. Produtos e serviços cobertos por esta política: (a) plataforma própria de poker online, jogo de habilidade ("Poker"): Texas Hold'em entre jogadores, sem banca, com receita exclusivamente de rake de 5%. Hoje o Poker opera somente com fichas de teste, sem dinheiro real. As regras sobre Poker com dinheiro real passam a valer no dia em que ele for liberado. A liberação depende de três condições prévias: aprovação da Trio, parecer jurídico favorável e alteração do objeto social, que hoje (CNAE 8599-6/99 e 6391-7/00) não inclui o poker; (b) pagamento de comissões a afiliados; (c) uso da conta de pagamento na Trio, exclusivamente para o Poker: Pix de depósito e de saque dos jogadores, pagamento de afiliados em lote e cartão corporativo para mídia paga.

## 3. Marco legal e referências

3.1. Normas observadas: Lei 9.613/1998: crimes de lavagem e obrigações de identificação, registro e comunicação (arts. 9º a 11); Lei 13.260/2016: terrorismo e seu financiamento; Lei 13.810/2019: cumprimento imediato das sanções do Conselho de Segurança das Nações Unidas (CSNU), inclusive a indisponibilidade de ativos; Resolução BCB 44/2020: procedimentos de indisponibilidade, adotados como referência operacional; Circular BCB 3.978/2020: norma a que a Trio está sujeita como instituição de pagamento, adotada pela Empresa como referência voluntária de boas práticas; Resolução COAF 40/2021: definição de PEP; Lei 12.846/2013: anticorrupção; Lei 13.709/2018 (LGPD): proteção de dados pessoais; Lei 8.069/1990 (ECA): vedação de acesso de menores; Código Penal, art. 299: falsidade ideológica em declarações cadastrais.

3.2. **Situação perante o COAF (declaração expressa).** Hoje a Empresa não é sujeito obrigado cadastrado no SISCOAF. Por isso: (a) comunica operações suspeitas à Trio, que, como sujeito obrigado, decide sobre a comunicação ao COAF; (b) se houver indício de crime, comunica também às autoridades competentes (Polícia Federal ou Ministério Público); (c) se passar a se enquadrar no art. 9º da Lei 9.613/1998 ou em norma setorial que exija cadastro, a Empresa se cadastra no SISCOAF antes de iniciar essa atividade e passa a cumprir diretamente os arts. 10 e 11 da mesma lei. O enquadramento do Poker com dinheiro real será avaliado no parecer jurídico do item 2.2(a).

## 4. Definições

- **Cliente:** pessoa física que se cadastra no Poker. Pessoa jurídica não é aceita como jogadora.
- **Afiliado:** pessoa física ou jurídica remunerada por comissão pela indicação de Clientes.
- **Parceiro:** afiliado ou fornecedor relevante: bureau de KYC, fornecedor de prova de vida, Trio e provedor de infraestrutura.
- **PEP:** pessoa exposta politicamente, conforme a Resolução COAF 40/2021, incluindo familiares e estreitos colaboradores na forma da norma.
- **Listas restritivas:** lista consolidada da ONU/CSNU; lista SDN da OFAC; relação de PEP, CEIS e CNEP da CGU (Portal da Transparência); opcionalmente, lista consolidada da União Europeia.
- **Alerta:** registro gerado pelo motor de monitoramento (`tools/compliance/monitor.py`), ou por análise manual, quando uma regra do item 9 é atingida. É gravado na tabela `aml_alerts`.
- **Mesma titularidade:** conta de pagamento cujo titular tem o mesmo CPF do Cliente, ou o mesmo CNPJ ou CPF do Afiliado.
- **Chip dumping:** transferência intencional de fichas entre contas por meio de jogo perdido de propósito.
- **Conluio:** cooperação entre jogadores na mesma mesa contra terceiros.

## 5. Avaliação interna de risco

5.1. A avaliação interna de risco identifica e mede o risco de LD/FTP por produto, canal, cliente e parceiro. É refeita (a) uma vez por ano; (b) antes de qualquer produto novo, inclusive antes da liberação do Poker com dinheiro real; e (c) quando um teste de efetividade (item 14) ou um alerta confirmado revelar falha de controle. Cada avaliação é registrada em ata do Comitê de Compliance.

5.2. **Risco por produto e serviço**

| Produto/serviço | Risco | Fundamento |
|---|---|---|
| Comissões a Afiliados | Médio | Saída de recursos para terceiros. Há risco de comissão fictícia, de auto-indicação e de uso de interposta pessoa |
| Poker com dinheiro real | Alto | Há saldo, saque e interação financeira entre jogadores (chip dumping, conluio). Há também risco de fraude de identidade e de acesso de menores |
| Poker com fichas de teste | Baixo | Sem dinheiro real; as fichas não têm valor e não são conversíveis |
| Cartão corporativo (mídia paga) | Baixo | Uso interno, com pagamento a plataformas de anúncio identificadas |

5.3. **Risco por canal**

| Canal | Risco | Mitigação |
|---|---|---|
| Relacionamento 100% digital | Médio | Validação de CPF em bureau, prova de vida antes do primeiro saque, impressão digital do dispositivo e registro de IP |
| Pix (entrada e saída) | Médio | O Pix é instantâneo e irrevogável. Só se aceita pagador com o mesmo CPF do Cliente, e saque só vai para conta de mesma titularidade (BO-POL-02) |
| Captação por Afiliados | Médio | KYP (item 12) e regras AF01 e AF02 |

5.4. **Classificação do Cliente.** A classificação é gravada em `kyc_profiles` e resulta da soma dos pontos dos fatores presentes:

| Fator | Pontos |
|---|---|
| Usa o Poker com dinheiro real | 2 |
| Tem até 21 anos completos | 1 |
| Depósitos acumulados em 30 dias acima de R$ 5.000 | 2 |
| Depósitos acumulados em 30 dias acima de R$ 20.000 (substitui o fator anterior) | 3 |
| Alerta de severidade média encerrado como "não suspeito" nos últimos 12 meses | 1 |
| Uso de VPN, proxy ou IP fora do Brasil, quando detectável | 2 |
| UF do endereço diferente da UF do IP habitual por mais de 90 dias | 1 |
| Sócio de empresa listada no CEIS ou no CNEP | 2 |

O resultado é: **baixo** de 0 a 2 pontos; **médio** de 3 a 5 pontos; **alto** com 6 pontos ou mais.

5.5. **Alto risco automático**, independentemente da pontuação: (a) PEP; (b) Cliente com alerta comunicado à Trio ou a autoridade; (c) Cliente no nível 3 de verificação (BO-POL-02), enquanto durar a diligência reforçada; (d) Cliente vinculado por dispositivo, IP ou chave Pix a conta encerrada por fraude ou por LD/FTP.

5.6. **Recusa obrigatória:** (a) correspondência confirmada na lista da ONU/CSNU (item 7) ou na lista SDN da OFAC; (b) menor de 18 anos; (c) CPF com situação diferente de "regular" na Receita Federal; (d) recusa em fornecer as informações exigidas.

5.7. A classificação é recalculada automaticamente a cada novo fator registrado. O Diretor de Compliance a revisa ao encerrar cada alerta.

## 6. Diligência devida

6.1. **Simplificada.** Aplica-se ao Cliente de Poker de baixo risco que usa somente fichas de teste, sem depósito nem saque (nível 0 da BO-POL-02). Exige nome, CPF, data de nascimento, e-mail e celular verificados, e screening em todas as listas restritivas no cadastro.

6.2. **Padrão.** Aplica-se ao Cliente de Poker com dinheiro real e a todo Afiliado. Exige tudo da simplificada e também: (a) validação do CPF em bureau (para Afiliados, enquanto o bureau não estiver contratado, vale o procedimento manual da BO-POL-02, item 13.1(c)); (b) endereço completo; (c) prova de vida (selfie com documento) antes do primeiro saque ou do primeiro pagamento de comissão; (d) confirmação de mesma titularidade da conta de destino.

6.3. **Reforçada.** Aplica-se a todo Cliente ou Afiliado de alto risco. Exige tudo da padrão e também: (a) comprovação documental da origem dos recursos ou da renda (BO-POL-02, item 8); (b) pesquisa de mídia negativa em buscador público por nome e CPF, registrada no dossiê; (c) limites definidos caso a caso, nunca acima da capacidade financeira comprovada; (d) gatilhos de monitoramento reduzidos (item 9.4); (e) atualização cadastral a cada 12 meses.

6.4. **PEP**

6.4.1. A condição de PEP é verificada no cadastro, em cada atualização e na rotina diária de screening. São usadas duas fontes: a relação de PEP da CGU, baixada mensalmente pela ferramenta interna de screening (`tools/compliance/screening.py`), e a autodeclaração obrigatória.

6.4.2. O relacionamento com PEP no Poker com dinheiro real, ou com PEP Afiliado, só começa depois da diligência reforçada concluída e da aprovação escrita do Administrador, registrada em `audit_log`.

6.4.3. A condição de PEP é mantida pelo prazo previsto na Resolução COAF 40/2021 após a saída da função. Ela se estende a familiares e estreitos colaboradores na forma da mesma norma.

6.4.4. PEP omitido e descoberto depois gera alerta de severidade alta e bloqueio preventivo de saque até a conclusão da diligência reforçada.

## 7. Sanções do CSNU: bloqueio imediato e comunicação

7.1. **Quando o screening é feito.** A ferramenta interna de screening (`tools/compliance/screening.py`) confere nome, data de nascimento e documento contra as listas restritivas e grava cada resultado em `screening_results`. A conferência ocorre (a) no cadastro, antes de qualquer movimentação; (b) antes de cada saque e de cada pagamento de comissão; (c) diariamente, contra toda a base ativa, com a lista da ONU baixada da fonte oficial (https://scsanctions.un.org/resources/xml/en/consolidated.xml) a cada execução; e (d) em cada atualização cadastral.

7.2. **Correspondência confirmada na lista ONU/CSNU.** É confirmada quando o nome coincide e há pelo menos um identificador adicional (data de nascimento, documento ou nacionalidade). Sem aviso prévio ao Cliente: (a) **bloqueio imediato**, feito pela própria ferramenta no momento do resultado. Ficam indisponíveis saldo, fichas conversíveis, comissões a pagar, devoluções pendentes e qualquer saque. O cadastro é congelado; (b) comunicação à Trio no mesmo dia, pelo canal de compliance contratado; (c) comunicação no mesmo dia ao Ministério da Justiça e Segurança Pública e ao COAF, pelos canais que esses órgãos disponibilizam. A comunicação informa a pessoa, os ativos bloqueados e a data e a hora do bloqueio, conforme a Lei 13.810/2019 e, como referência, a Resolução BCB 44/2020; (d) a indisponibilidade só é levantada por exclusão da pessoa da lista ou por determinação da autoridade competente. A decisão é registrada em `audit_log`.

7.3. **Correspondência possível** (só nome ou dados parciais): a movimentação é bloqueada preventivamente e o Diretor de Compliance analisa em até 1 dia útil. Falso positivo: a evidência que o descarta é documentada em `screening_results` e a movimentação é liberada. Correspondência confirmada: aplica-se o item 7.2.

7.4. **Lista SDN da OFAC.** Correspondência confirmada gera recusa ou encerramento, bloqueio da movimentação e comunicação à Trio no mesmo dia.

7.5. **CEIS e CNEP.** São usados no KYP (item 12) e como fator de risco (item 5.4). Uma ocorrência gera análise, não bloqueio automático.

## 8. Restrições permanentes de produto

8.1. Os controles abaixo são bloqueios por desenho do sistema, não alertas: (a) não existe transferência de saldo ou de fichas entre contas de Clientes; (b) depósito só por Pix e só de pagador com o mesmo CPF do Cliente; (c) saque só por Pix e só para conta de mesma titularidade, e a tentativa de saque para terceiro é rejeitada e gera o alerta P06; (d) não são aceitos dinheiro em espécie, boleto de terceiro, criptoativo nem cartão de terceiro; (e) cada CPF tem uma única conta de Poker; (f) menor de 18 anos não pode se cadastrar.

## 9. Monitoramento de operações: regras de alerta

9.1. O motor de monitoramento (`tools/compliance/monitor.py`) aplica as regras abaixo sobre transações, mãos jogadas e dados de dispositivo e IP. Roda no mínimo a cada hora e também, de forma síncrona, antes de cada saque e de cada pagamento de comissão. Cada regra atingida grava em `aml_alerts`: identificador da regra, Cliente, valores, janela, evidências e severidade.

9.2. **Poker com dinheiro real**

| Regra | Gatilho objetivo | Severidade | Efeito automático |
|---|---|---|---|
| **P01** Depósito seguido de saque sem jogo | Saque de R$ 200 ou mais pedido em até 72 h do último depósito, com volume apostado (buy-ins + apostas) desde esse depósito menor que 1,0 vez o valor depositado | Média; alta se o saque for de R$ 2.000 ou mais | Saque retido até a análise |
| **P02** Chip dumping | Em 7 dias, num par A→B: ganho líquido de B contra A de R$ 500 ou mais, correspondente a 60% ou mais das perdas totais de A, com 3 ou mais sessões em comum | Alta | Saques de A e de B retidos |
| **P03a** Várias contas no mesmo dispositivo | 2 ou mais contas com a mesma impressão digital de dispositivo, em qualquer período | Alta | Saques de todas as contas retidos |
| **P03b** Várias contas no mesmo IP | 3 ou mais contas do mesmo IP em 30 dias; ou 2 ou mais contas do mesmo IP na mesma mesa | Média; alta se na mesma mesa | Na mesma mesa: contas separadas e saques retidos |
| **P03c** Mesma chave ou conta Pix | Mesma chave Pix, ou mesma conta de origem ou destino, associada a 2 ou mais Clientes | Alta | Saques retidos |
| **P04** Fracionamento (structuring) | (a) 4 ou mais depósitos em 24 h somando R$ 1.000 ou mais; ou (b) 2 ou mais depósitos em 7 dias entre 90% e 99,99% de uma faixa de controle (R$ 2.000, R$ 5.000 ou R$ 10.000); ou (c) depósitos mensais entre 90% e 100% do limite do nível em 2 meses seguidos | Média | Vai para análise |
| **P05** Volume incompatível com o perfil | Depósitos em 30 dias acima de 3 vezes a média mensal dos 3 meses anteriores, somando R$ 3.000 ou mais; ou acima de 50% da renda mensal declarada ou comprovada | Média; alta se acima de 100% da renda | Quando alta, novos depósitos bloqueados até a análise |
| **P06** Saque para conta de terceiro | Qualquer tentativa de saque para titular com CPF diferente do Cliente. É bloqueado por regra e nunca executado | Média; alta com 2 ou mais tentativas em 30 dias | Saque rejeitado |
| **P07** Depósito por terceiro | Pix recebido de pagador com CPF ou CNPJ diferente do CPF do Cliente | Média; alta com 2 ou mais eventos em 30 dias | Valor não creditado e devolvido ao pagador |
| **P08** Conluio em mesa | Contas na mesma mesa em 10 ou mais sessões em 30 dias, representando 50% ou mais das sessões de cada uma. Agrava se a taxa de aumentos (raise) entre elas for menor que um terço da taxa contra terceiros, ou se houver vínculo de dispositivo, IP ou geolocalização | Média; alta se agravado | Quando alta, saques retidos e contas separadas |
| **P09** Acesso de fora do Brasil ou por VPN/proxy | Sessão de dinheiro real com IP fora do Brasil ou com proxy ou VPN detectado | Baixa; média com 3 ou mais sessões em 30 dias | Sessão de dinheiro real recusada |

9.3. **Afiliados e regras gerais**

| Regra | Gatilho objetivo | Severidade | Efeito automático |
|---|---|---|---|
| **AF01** Auto-indicação de Afiliado | Indicado que compartilha CPF, dispositivo, IP ou chave Pix com o Afiliado | Alta | Comissão retida |
| **AF02** Comissão atípica | Comissão mensal acima de 3 vezes a média dos 3 meses anteriores, somando R$ 5.000 ou mais | Média | Lote do Afiliado retido até a análise |
| **G01** Lista ONU/CSNU confirmada | Item 7.2 | Crítica | Bloqueio imediato (item 7) |
| **G02** Correspondência possível ou PEP não declarado | Itens 6.4.4 e 7.3 | Alta | Bloqueio preventivo |
| **G03** Indício de menor de idade | Data de nascimento divergente no bureau, prova de vida incompatível ou denúncia | Alta | Conta suspensa |

9.4. Para Clientes de alto risco, os gatilhos de valor e de quantidade das regras P01, P04, P05 e AF02 caem pela metade.

9.5. O Diretor de Compliance revisa os gatilhos na revisão anual e sempre que o falso positivo de uma regra passar de 90% num trimestre. A alteração é aprovada pelo Comitê e registrada em ata e em `audit_log`.

9.6. O Diretor de Compliance também pode abrir alerta manual a partir de denúncia, de pedido da Trio ou de observação própria.

## 10. Análise de alertas e comunicação

10.1. **Prazos de análise**, contados da geração do alerta: crítica, imediato (item 7); alta, 5 dias úteis; média, 15 dias úteis; baixa, 30 dias. Nenhum alerta fica aberto mais de 45 dias, prazo adotado com base na Circular BCB 3.978/2020.

10.2. A análise é registrada em `aml_alerts` e contém: os fatos verificados e as consultas feitas; a explicação do Cliente, quando pedida sem revelar o alerta (item 11); a conclusão ("não suspeito", "suspeito – comunicar" ou "encerrar relacionamento"); o analista e a data.

10.3. **Comunicação.** (a) Com a conclusão "suspeito – comunicar", o Diretor de Compliance comunica à Trio até o dia útil seguinte ao da decisão, informando a operação, as partes, os valores e os fundamentos; (b) se houver indício de crime, comunica também à Polícia Federal ou ao Ministério Público; (c) se a Empresa estiver cadastrada no SISCOAF (item 3.2), comunica ao COAF pelo SISCOAF, no prazo do art. 11 da Lei 9.613/1998; (d) a decisão de não comunicar também é fundamentada e registrada.

10.4. **Segregação de funções.** O Administrador aprova os lotes de pagamento de Afiliados; o Diretor de Compliance analisa os alertas. A análise passa ao Administrador quando o alerta envolver o Diretor de Compliance, pessoa ligada a ele ou Afiliado cuja comissão ele aprovou. O conflito é registrado em `audit_log` e na ata seguinte.

10.5. **Encerramento do relacionamento.** Ocorre em caso de recusa de informação essencial, fraude documental ou conclusão "suspeito" com risco incompatível com o apetite de risco da Empresa. O saldo legítimo é devolvido somente para conta de mesma titularidade, salvo indisponibilidade (item 7).

## 11. Sigilo e vedação de dar ciência (tipping off)

11.1. É proibido informar ao Cliente, ao Afiliado ou a terceiros a existência de alerta, análise ou comunicação, nos termos do art. 11, inciso II, da Lei 9.613/1998.

11.2. Durante uma retenção, o contato com o Cliente usa somente mensagens neutras padronizadas, como: "sua conta está em verificação cadastral; envie o documento X".

11.3. Só os sócios acessam `aml_alerts` e `screening_results`. A quebra de sigilo é infração grave (item 19).

## 12. Conheça seu Parceiro (KYP)

12.1. **Afiliado.** Antes do primeiro pagamento, exige-se: (a) KYC próprio (BO-POL-02, item 9). Para PJ: CNPJ ativo, quadro societário e beneficiário final (pessoa física com 25% ou mais do capital ou que exerça controle); (b) screening da pessoa e dos sócios em todas as listas restritivas, inclusive CEIS e CNEP; (c) contrato com cláusulas de anticorrupção (Lei 12.846/2013), de LGPD, de proibição de prometer ganho e de captar menores, de direito de auditoria e de retenção de comissão em caso de fraude; (d) pagamento somente para conta de mesma titularidade.

12.2. **Fornecedor relevante.** Antes da contratação e uma vez por ano, verificam-se o CNPJ ativo, o screening da empresa e dos sócios em ONU, OFAC, CEIS e CNEP, e a existência de contrato escrito com cláusula de proteção de dados.

12.3. Ocorrência em CEIS ou CNEP leva à decisão do Comitê, registrada em ata. Correspondência em lista da ONU ou da OFAC impede a contratação.

## 13. Conheça seu Funcionário (KYE)

13.1. Antes de qualquer acesso a dados de Clientes ou a fluxos de pagamento, e depois uma vez por ano, toda pessoa (sócios, empregados e prestadores) passa por screening em todas as listas restritivas, apresenta certidão de antecedentes criminais da Polícia Federal e assina termo de confidencialidade e de ciência desta política.

13.2. Os acessos seguem o menor privilégio necessário, são revistos uma vez por ano e são revogados no dia do desligamento. O Comitê analisa os sinais de alerta: padrão de vida incompatível, resistência a compartilhar tarefas e acesso a dados sem necessidade da função.

## 14. Avaliação anual de efetividade

14.1. Todo ano, com data-base em 31 de dezembro, o Diretor de Compliance apresenta ao Comitê, até 31 de março do ano seguinte, um relatório de efetividade com no mínimo: (a) teste de cada regra do item 9 com casos sintéticos injetados no motor de monitoramento, comprovando que o alerta é gerado; (b) teste do screening com um nome de teste da lista da ONU, comprovando o bloqueio; (c) teste de saque para conta de terceiro, comprovando a rejeição; (d) revisão de amostra de alertas do ano (10% dos alertas, com mínimo de 30, ou todos se houver menos de 30), conferindo prazo e qualidade da análise; (e) indicadores: alertas por regra, falso positivo, prazo médio, comunicações feitas e cadastros com atualização vencida; (f) plano de ação com responsável e prazo.

14.2. O relatório é aprovado pelo Administrador e guardado conforme o item 17.

## 15. Revisão

15.1. A política é revisada uma vez por ano pelo Diretor de Compliance e aprovada pelo Administrador. Há revisão antecipada em caso de (a) mudança legal ou regulatória; (b) liberação do Poker com dinheiro real, antes que ela ocorra; (c) pedido da Trio; (d) deficiência relevante apontada no teste de efetividade.

## 16. Papéis e responsabilidades

| Papel | Responsabilidades |
|---|---|
| Administrador (Raphael Mendonça Barros Silva) | Aprova a política e suas revisões; aloca recursos (bureau, prova de vida, infraestrutura); aprova PEP e os lotes de pagamento de Afiliados; analisa alertas quando há conflito do Diretor; responde legalmente pela Empresa |
| Diretor de Compliance e PLD/FTP (Michael Mendonça Barros Silva) | Executa e monitora a política; analisa alertas; decide e faz as comunicações; mantém as ferramentas de screening e de monitoramento; treina; elabora a avaliação de risco e o relatório de efetividade; é o contato da Trio e das autoridades |
| Comitê de Compliance (os dois sócios) | Reunião mensal com ata sobre alertas, comunicações, pendências cadastrais, mudanças de regra e KYP; reunião extraordinária em até 24 h após alerta crítico |
| Todos os abrangidos | Cumprir a política e reportar ao Diretor de Compliance situações suspeitas, sem dar ciência ao envolvido |

## 17. Registros e guarda

17.1. Ficam guardados por no mínimo 10 anos, contados do fim do relacionamento ou da operação, o que ocorrer por último: cadastros e documentos; `screening_results`, `kyc_profiles` e `aml_alerts`; comunicações feitas; atas do Comitê; relatórios de efetividade; e `audit_log`.

17.2. Toda alteração de cadastro, classificação, limite, regra, bloqueio ou alerta gera registro em `audit_log` com autor, data e hora, valor anterior e valor novo (BO-POL-03, item 8).

17.3. Os registros são entregues à Trio ou a autoridade competente mediante solicitação formal, observada a LGPD.

## 18. Treinamento

18.1. Todos os abrangidos fazem um treinamento inicial antes de receber acesso e um treinamento anual de PLD/FTP de no mínimo 4 horas, conduzido ou selecionado pelo Diretor de Compliance. O conteúdo mínimo inclui as políticas BO-POL-01, 02 e 03, as tipologias do item 9, o procedimento de sanções, a vedação de tipping off e as mudanças normativas do ano.

18.2. Afiliados recebem, junto com o contrato, orientação sobre condutas proibidas.

18.3. Presença, carga horária e conteúdo são registrados em ata.

## 19. Sanções internas

19.1. Conforme a gravidade, o descumprimento sujeita o responsável a advertência registrada, revogação de acesso ou rescisão contratual; no caso de Afiliados, também a retenção de comissões indevidas e o descredenciamento. A medida é decidida pelo Comitê e registrada em ata.

19.2. As medidas internas não excluem a comunicação às autoridades nem a responsabilização civil e penal.

## 20. Vigência

20.1. Esta política entra em vigor na data de aprovação, por prazo indeterminado, com revisão conforme o item 15.

---

Aprovação: Raphael Mendonça Barros Silva, Administrador, 05/11/2026.
Responsável: Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP.
