# Política de Cadastro de Clientes

| Campo | Conteúdo |
|---|---|
| Código | BO-POL-03 |
| Versão | 1.0 |
| Data | 05/11/2026 |
| Empresa | BLACK OPS LTDA, CNPJ 58.557.156/0001-58 |
| Aprovação | Raphael Mendonça Barros Silva, Administrador |
| Responsável | Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP, também indicado como encarregado pelo tratamento de dados pessoais |
| Políticas relacionadas | BO-POL-01 (PLD/FTP), BO-POL-02 (Conheça Seu Cliente) |
| Próxima revisão | até 05/11/2027 |

## 1. Objetivo

1.1. Esta política define, para cada tipo de cliente e parceiro da BLACK OPS LTDA ("Empresa"):

- quais dados cadastrais são obrigatórios;
- de que fontes vem a verificação desses dados;
- como as divergências são tratadas;
- quando um cadastro incompleto bloqueia movimentação;
- como as alterações são registradas;
- como os dados pessoais são tratados conforme a LGPD, incluindo base legal, retenção e direitos do titular.

## 2. Abrangência

2.1. Aplica-se a todos os cadastros mantidos pela Empresa:

- Clientes de Cursos;
- Clientes do Poker;
- Afiliados pessoa física e pessoa jurídica;
- fornecedores relevantes.

2.2. Os cadastros são mantidos no banco de dados da Empresa (Supabase). As tabelas são:

- `kyc_profiles`: dados de KYC, nível e classificação de risco;
- `screening_results`: resultados de screening;
- `aml_alerts`: alertas;
- `audit_log`: trilha de auditoria.

## 3. Marco legal

3.1. Normas observadas:

- Lei 13.709/2018 (LGPD);
- Lei 9.613/1998, art. 10 (identificação e registros);
- Lei 12.965/2014 (Marco Civil da Internet), art. 15, que obriga a guardar registros de acesso a aplicações por 6 meses;
- Lei 8.069/1990 (ECA);
- Código Penal, art. 299;
- Circular BCB 3.978/2020, adotada como referência voluntária.

## 4. Definições

4.1. Valem as definições da BO-POL-01, item 4, e da BO-POL-02, item 4. Também se usam os termos abaixo.

- **Cadastro completo:** cadastro com todos os dados obrigatórios do nível pretendido verificados e sem divergência pendente.
- **Status cadastral:** situação do cadastro, gravada em `kyc_profiles`. Pode ser:
  - `pendente`;
  - `completo`;
  - `em_divergencia`;
  - `atualizacao_vencida`;
  - `bloqueado`;
  - `encerrado`;
  - `recusado`.
- **Dado técnico:** IP, impressão digital do dispositivo, data e hora de acesso e geolocalização aproximada derivada do IP.

## 5. Dados obrigatórios por tipo de cliente

5.1. **Cliente pessoa física de Cursos.** Aplica-se a diligência simplificada.

| Dado | Obrigatório |
|---|---|
| Nome completo, CPF, data de nascimento (18 anos ou mais) | Sim |
| E-mail e celular verificados | Sim |
| Declaração de PEP | Sim |
| Aceite dos termos e da declaração de veracidade | Sim |
| Endereço e ocupação | Só a partir de R$ 10.000 em compras em 12 meses (BO-POL-02, item 7.3) |
| Comprovação de origem de recursos | Só a partir de R$ 30.000 em compras em 12 meses |
| Dados técnicos da compra | Sim |

5.2. **Cliente pessoa física do Poker**, por nível de verificação (BO-POL-02, item 7):

| Dado | Nível 0 | Nível 1 | Nível 2 | Nível 3 |
|---|---|---|---|---|
| Nome, CPF, data de nascimento, e-mail e celular verificados, declaração de PEP, aceites | Sim | Sim | Sim | Sim |
| CPF validado em bureau | – | Sim | Sim | Sim |
| Endereço completo e ocupação | – | Sim | Sim | Sim |
| Prova de vida (selfie + documento com foto) | – | – | Sim | Sim |
| Chave Pix de saque com mesma titularidade | – | – | Sim | Sim |
| Renda mensal, fonte e comprovante de origem de recursos | – | – | – | Sim |
| Pesquisa de mídia negativa | – | – | – | Sim |
| Dados técnicos (IP e dispositivo de cada sessão) | Sim | Sim | Sim | Sim |

5.3. **Afiliado pessoa física.** Exige-se:

- todos os dados do nível 2 da tabela 5.2;
- chave Pix de recebimento com o mesmo CPF;
- aceite do contrato de afiliação.

5.4. **Afiliado pessoa jurídica.** Exige-se:

- CNPJ, razão social, nome fantasia, endereço e CNAE principal;
- contrato social ou certificado de MEI;
- quadro de sócios e administradores;
- beneficiário final;
- representante legal, com os dados de pessoa física do nível 2;
- dados de pessoa física do nível 1 para cada beneficiário final;
- chave Pix de recebimento com o mesmo CNPJ;
- e-mail e celular verificados;
- aceite do contrato de afiliação.

5.5. **Fornecedor relevante.** Exige-se:

- CNPJ, razão social e endereço;
- quadro de sócios;
- contato responsável;
- objeto do contrato;
- resultado do screening (BO-POL-01, item 12.2).

5.6. **Princípio da necessidade.** Não são coletados dados além dos listados acima. Dados sensíveis só são coletados no caso da biometria da prova de vida, tratada no item 9.

## 6. Fontes de verificação e tratamento de divergência

6.1. **Fontes de verificação**

| Dado | Fonte |
|---|---|
| E-mail | Link ou código de uso único enviado ao endereço |
| Celular | Código de uso único por SMS ou WhatsApp |
| CPF: situação, nome e data de nascimento | Bureau contratado, que consulta a Receita Federal. Para Afiliados, até a contratação do bureau, consulta pública de situação cadastral da Receita Federal (BO-POL-02, item 13.1(c)) |
| CNPJ: situação, QSA e CNAE | Consulta pública de CNPJ da Receita Federal |
| Endereço | Base pública de CEP, que confere a coerência entre CEP, cidade e UF |
| Identidade da pessoa | Fornecedor de prova de vida (selfie com vivacidade + documento com foto) |
| Sanções, PEP, CEIS e CNEP | Ferramenta interna de screening (`tools/compliance/screening.py`), alimentada pelas listas ONU/CSNU, OFAC SDN e CGU (PEP, CEIS, CNEP) |
| Titularidade de pagador e de destino Pix | Dados do pagador na liquidação Pix e consulta da chave de destino, ambos fornecidos pela Trio |
| Origem de recursos | Documentos da BO-POL-02, item 8.2 |
| Dados técnicos | Coletados pela aplicação e analisados pelo motor de monitoramento (`tools/compliance/monitor.py`) |

6.2. **Critérios de comparação de nome.** Na comparação do nome informado com as fontes, desconsideram-se:

- acentos;
- diferença entre maiúsculas e minúsculas;
- espaços duplicados;
- as partículas "de", "da", "do", "dos" e "das".

A abreviação de nome intermediário é aceita quando o primeiro e o último nome coincidem exatamente. Qualquer outra diferença é divergência.

6.3. **Tratamento de divergência**

| Divergência | Ação | Status | Prazo |
|---|---|---|---|
| CPF com situação diferente de "regular" | Recusa | `recusado` | Imediato |
| Data de nascimento diferente da fonte | Bloqueio; o Cliente não pode corrigir sozinho; envia documento com foto para análise manual | `em_divergencia` | Análise em 5 dias úteis |
| Idade menor que 18 anos na fonte | Recusa + alerta G03 | `recusado` | Imediato |
| Nome diferente fora dos critérios do item 6.2 | Pedido de documento com foto; análise manual | `em_divergencia` | Análise em 5 dias úteis |
| Documento da prova de vida diferente do bureau | Análise manual; se não esclarecido, recusa | `em_divergencia` | Análise em 5 dias úteis |
| CEP incoerente com cidade e UF | Pedido de correção ao Cliente | `pendente` | Até a correção |
| CPF já cadastrado em outra conta | Recusa do segundo cadastro + alerta P03 | `recusado` | Imediato |
| CNPJ de Afiliado com situação diferente de "ativa" | Recusa | `recusado` | Imediato |
| QSA diferente do contrato social apresentado | Pedido de contrato atualizado | `em_divergencia` | Análise em 5 dias úteis |
| Pagador Pix com CPF diferente | Valor não creditado e devolvido + alerta P07 | Sem mudança | Imediato |
| Destino Pix com CPF ou CNPJ diferente | Envio não realizado + alerta P06 | Sem mudança | Imediato |
| Correspondência em lista restritiva | Tratamento da BO-POL-01, item 7 | `bloqueado` | Conforme BO-POL-01 |

6.4. **Análise manual.** É feita pelo Diretor de Compliance. Toda divergência resolvida registra em `audit_log`:

- a evidência usada;
- a decisão;
- o autor da decisão.

Se o titular não responder em 30 dias, o cadastro com divergência é encerrado.

## 7. Cadastro incompleto bloqueia movimentação

7.1. **Regra geral.** Nenhuma movimentação financeira acontece com cadastro fora do status `completo` para o nível exigido. Isso inclui depósito, saque, pagamento de comissão, compra acima das faixas e reembolso para conta diferente da de origem. O bloqueio é aplicado pelo sistema antes da liquidação. Não depende de ação manual.

7.2. **Efeito de cada status**

| Status | Efeito |
|---|---|
| `pendente` | Sem depósito, saque ou comissão. Só fichas de teste e compra de Cursos na diligência simplificada |
| `em_divergencia` | Movimentação bloqueada até a solução |
| `atualizacao_vencida` | Novos depósitos, saques e comissões bloqueados até a atualização (BO-POL-02, item 10) |
| `bloqueado` | Toda movimentação bloqueada; indisponibilidade quando for sanção do CSNU |
| `encerrado` e `recusado` | Sem movimentação. Só a devolução de saldo legítimo prevista na BO-POL-02, item 11.3 |

7.3. Para mudar o status para `completo` é preciso que todos os dados obrigatórios do nível estejam verificados. A mudança é registrada em `audit_log`.

## 8. Histórico de alterações e trilha de auditoria

8.1. **O que é registrado.** Toda criação, alteração ou exclusão lógica de dado cadastral gera registro em `audit_log`. O mesmo vale para mudanças de status, nível, classificação de risco e limite, para decisões sobre alertas e divergências e para mudanças de regras de monitoramento.

8.2. **Campos de cada registro:**

- data e hora;
- autor (titular, sistema ou sócio identificado);
- entidade e identificador do registro;
- campo alterado;
- valor anterior e valor novo;
- motivo;
- IP ou origem da ação.

8.3. **Integridade**

- A trilha de auditoria só aceita inclusão de registros. Registros não são alterados nem apagados pela aplicação.
- Uma correção é feita por um novo registro, nunca pela edição de um registro anterior.
- Dados cadastrais não são sobrescritos sem que o valor anterior fique na trilha.

8.4. **Alterações feitas pelo titular**

- O titular pode alterar sozinho e-mail, celular e endereço. A alteração de e-mail e de celular exige nova verificação.
- Nome, CPF e data de nascimento só são alterados pelo Diretor de Compliance, com documento comprobatório.
- A troca de chave Pix de saque segue a BO-POL-02, item 12.4.

8.5. **Conferência mensal.** O Comitê de Compliance confere uma amostra das alterações manuais do mês, com no mínimo 10 registros ou todos, se houver menos. A conferência é registrada em ata.

## 9. Proteção de dados pessoais (LGPD)

9.1. **Papel da Empresa e encarregado.** A Empresa é controladora dos dados de cadastro. O encarregado (art. 41 da LGPD) é o Diretor de Compliance. O canal do titular é michael@mikhaeu.com.

9.2. **Base legal de cada dado**

| Dado | Finalidade | Base legal (LGPD) |
|---|---|---|
| Nome, CPF, data de nascimento | Identificação, contratação, verificação de idade, PLD/FTP | Art. 7º, V (execução de contrato); art. 7º, II (obrigação legal, como a vedação de menores do ECA, e obrigações de PLD quando aplicáveis); art. 7º, IX (legítimo interesse em prevenção a fraude e a LD/FTP) |
| E-mail, celular | Acesso à conta, verificação, comunicações do contrato | Art. 7º, V |
| Endereço, ocupação | Qualificação e avaliação de risco | Art. 7º, V e IX |
| Renda, fonte e comprovantes de origem de recursos | Diligência reforçada e definição de limites | Art. 7º, IX; art. 7º, II, quando houver obrigação aplicável |
| Declaração e verificação de PEP | Classificação de risco | Art. 7º, IX; art. 7º, II, quando aplicável |
| Selfie, biometria facial e imagem do documento com foto | Prova de vida e prevenção a fraude de identidade | Art. 11, II, "g" (prevenção à fraude e segurança do titular em identificação e autenticação de cadastro em sistemas eletrônicos) |
| Resultados de screening e alertas | Cumprimento de sanções e PLD/FTP | Art. 7º, II (Lei 13.810/2019 e obrigações de PLD); art. 7º, IX |
| Chave Pix, dados de transações | Execução de depósitos, saques e pagamentos; mesma titularidade | Art. 7º, V e IX |
| IP, dispositivo, registros de acesso | Segurança, antifraude, regras P03 e P09 | Art. 7º, II (Marco Civil, art. 15); art. 7º, IX |
| Dados de Afiliado PJ, sócios e beneficiário final | Contratação e KYP | Art. 7º, V e IX |
| Registros mantidos após o fim do relacionamento | Defesa em processos e cooperação com autoridades | Art. 7º, VI (exercício regular de direitos); art. 7º, II |

9.3. **Legítimo interesse.** Todo tratamento baseado em legítimo interesse tem teste de balanceamento documentado e aprovado pelo Comitê, conforme o art. 10 da LGPD.

9.4. **Marketing.** Comunicações de marketing dependem de consentimento próprio (art. 7º, I). O consentimento é separado do cadastro e pode ser revogado a qualquer tempo, sem afetar o relacionamento.

9.5. **Retenção**

| Dado | Prazo |
|---|---|
| Cadastro, documentos, prova de vida, screening, alertas, transações e `audit_log` | 10 anos após o fim do relacionamento ou da operação, o que ocorrer por último (BO-POL-01, item 17) |
| Cadastro recusado: CPF, motivo, data e resultado de screening | 10 anos, para impedir novo cadastro e comprovar a decisão |
| Registros de acesso (IP e data e hora) sem vínculo com alerta ou com operação | 6 meses (Marco Civil, art. 15), seguidos de eliminação |
| Dados de consentimento de marketing | Até a revogação; depois, apenas o registro da revogação |

9.6. **Fundamento da conservação e destino após o prazo.** A conservação se fundamenta no art. 16 da LGPD (obrigação legal ou regulatória, quando aplicável) e, nos demais casos, no exercício regular de direitos e no legítimo interesse de prevenção a fraude e a LD/FTP. Ao fim do prazo, os dados são eliminados ou anonimizados.

9.7. **Direitos do titular (art. 18 da LGPD).** O titular pode pedir pelo canal do item 9.1:

- confirmação da existência de tratamento;
- acesso aos dados;
- correção de dados;
- anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;
- portabilidade;
- eliminação de dados tratados com consentimento;
- informação sobre compartilhamento;
- revogação do consentimento.

9.8. **Atendimento dos pedidos**

- A identidade do titular é confirmada antes do atendimento, pelo e-mail e celular cadastrados.
- A confirmação de existência e o acesso em formato completo são atendidos em até 15 dias do pedido (art. 19 da LGPD).
- Correções de nome, CPF e data de nascimento seguem o item 8.4.
- Pedidos de eliminação de dados sujeitos à retenção do item 9.5 são respondidos com a indicação do fundamento da conservação.
- Não se informa a existência de alerta, análise ou comunicação de PLD/FTP (BO-POL-01, item 11), observados os segredos comercial e industrial, conforme a LGPD.
- Todo pedido e toda resposta são registrados em `audit_log`.

9.9. **Compartilhamento**

- Dados são compartilhados somente com:
  - a Trio, para execução dos pagamentos e de PLD/FTP;
  - o bureau e o fornecedor de prova de vida, como operadores;
  - o provedor de infraestrutura (Supabase), como operador;
  - a plataforma de infoprodutos, nas vendas que ela processa;
  - autoridades, por obrigação legal ou ordem.
- Há contrato com cláusula de proteção de dados com cada operador.
- Quando um operador armazenar dados fora do Brasil, a transferência internacional segue as hipóteses previstas na LGPD.

9.10. **Segurança (art. 46 da LGPD)**

- Os dados trafegam com criptografia.
- Documentos e imagens ficam em armazenamento privado, sem link público.
- O acesso às tabelas de compliance é restrito aos sócios.
- As contas de administração da Trio, do Supabase e do e-mail usam autenticação em dois fatores.

9.11. **Incidentes.** Incidente de segurança que possa causar risco ou dano relevante aos titulares é comunicado à ANPD e aos titulares afetados, conforme o art. 48 da LGPD. A comunicação é feita pelo encarregado e registrada em ata do Comitê.

## 10. Papéis

| Papel | Responsabilidades |
|---|---|
| Administrador | Aprova esta política; aprova os testes de legítimo interesse; contrata os operadores com cláusula de proteção de dados |
| Diretor de Compliance e PLD/FTP (encarregado) | Mantém o cadastro e as fontes de verificação; trata divergências; atende os titulares; mantém a trilha de auditoria; comunica incidentes |
| Comitê de Compliance | Confere mensalmente as alterações manuais (item 8.5) e as pendências cadastrais, com registro em ata |

## 11. Treinamento, revisão, sanções e vigência

11.1. Esta política integra o treinamento anual de PLD/FTP (BO-POL-01, item 18), com conteúdo específico de LGPD e de tratamento de divergências.

11.2. A política é revisada uma vez por ano, ou antes em caso de mudança legal, de inclusão de novo tipo de cliente ou de pedido da Trio, sempre com aprovação do Administrador.

11.3. O descumprimento sujeita o responsável às sanções internas da BO-POL-01, item 19. Dados falsos informados pelo titular levam à recusa ou ao encerramento (BO-POL-02, item 11).

11.4. A política vigora a partir da data de aprovação, por prazo indeterminado.

---

Aprovação: Raphael Mendonça Barros Silva, Administrador, 05/11/2026.
Responsável: Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP.
