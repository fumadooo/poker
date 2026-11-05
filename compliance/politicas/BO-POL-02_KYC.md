# Política Conheça Seu Cliente (KYC)

| Campo | Conteúdo |
|---|---|
| Código | BO-POL-02 |
| Versão | 1.0 |
| Data | 05/11/2026 |
| Empresa | BLACK OPS LTDA, CNPJ 58.557.156/0001-58 |
| Aprovação | Raphael Mendonça Barros Silva, Administrador |
| Responsável | Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP |
| Políticas relacionadas | BO-POL-01 (PLD/FTP), BO-POL-03 (Cadastro de Clientes) |
| Próxima revisão | até 05/11/2027 |

## 1. Objetivo

1.1. Definir como a BLACK OPS LTDA ("Empresa") faz quatro coisas em relação a cada Cliente e Afiliado:

- identifica e qualifica a pessoa;
- verifica a identidade;
- conhece a origem dos recursos;
- mantém os dados atualizados.

1.2. A profundidade da verificação é proporcional ao risco, conforme a classificação da BO-POL-01, item 5, e os níveis de verificação do item 7 desta política.

## 2. Abrangência

2.1. Esta política cobre:

- Clientes pessoa física de Cursos;
- Clientes pessoa física do Poker. O Poker não aceita pessoa jurídica como jogadora;
- Afiliados pessoa física e pessoa jurídica.

2.2. Hoje o Poker opera apenas com fichas de teste. Os níveis de verificação que liberam depósito e saque (item 7) só produzem efeito financeiro após a liberação do Poker com dinheiro real, nas condições da BO-POL-01, item 2.2(c).

## 3. Marco legal

3.1. Normas observadas:

- Lei 9.613/1998 (identificação de clientes e manutenção de registros, art. 10);
- Lei 13.709/2018 (LGPD);
- Lei 8.069/1990 (ECA), que veda o acesso de menores;
- Código Penal, art. 299 (declaração falsa);
- Resolução COAF 40/2021 (PEP);
- Circular BCB 3.978/2020, adotada como referência voluntária de boas práticas.

## 4. Definições

4.1. Os termos Cliente, Afiliado, PEP, Listas restritivas e Mesma titularidade têm o sentido dado na BO-POL-01, item 4. Também se usam os termos abaixo.

- **Bureau:** fornecedor contratado de validação cadastral que consulta a situação do CPF na Receita Federal e confirma nome e data de nascimento.
- **Prova de vida:** verificação biométrica feita por fornecedor contratado. Combina uma selfie com detecção de vivacidade e a foto de um documento oficial com foto (RG, CNH ou passaporte). O resultado é a confirmação de que a pessoa está presente e é a titular do documento.
- **Nível de verificação:** estágio de KYC alcançado pelo Cliente, de 0 a 3 (item 7). É gravado em `kyc_profiles`.

## 5. Identificação e qualificação da pessoa física

5.1. **Dados exigidos de todo Cliente**, antes de qualquer compra ou movimentação:

- (a) nome completo;
- (b) CPF;
- (c) data de nascimento, com idade mínima de 18 anos completos. É vedado o cadastro de menores (ECA) e é exigida capacidade civil para contratar;
- (d) e-mail, verificado por link ou código enviado ao endereço;
- (e) celular, verificado por código de uso único (SMS ou WhatsApp);
- (f) declaração de condição de PEP;
- (g) aceite dos termos de uso e da declaração de veracidade, com ciência do art. 299 do Código Penal.

5.2. **Dados exigidos a partir do nível 1**, nos casos de Poker com dinheiro real, Cursos acima da faixa da BO-POL-01, item 6.2, e Afiliados:

- endereço residencial completo (logradouro, número, complemento, bairro, cidade, UF e CEP);
- ocupação.

5.3. **Dados exigidos no nível 3:**

- renda mensal ou faturamento;
- fonte dos recursos;
- comprovantes do item 8.

5.4. O cadastro é feito pelo próprio titular, em canal digital da Empresa. A lista completa de campos, as fontes de verificação e o tratamento de divergências estão na BO-POL-03.

## 6. Verificação de identidade

6.1. **Validação de CPF em bureau.** É obrigatória a partir do nível 1. O CPF só é aceito quando cumpre todas as condições abaixo:

- (a) situação "regular" na Receita Federal. As demais situações (suspensa, pendente de regularização, cancelada, nula ou titular falecido) levam a recusa;
- (b) nome compatível com o informado, nos critérios da BO-POL-03, item 6;
- (c) data de nascimento igual à informada e idade igual ou maior que 18 anos.

6.2. **Screening.** No mesmo momento da validação, e depois de forma recorrente, a ferramenta interna de screening (`tools/compliance/screening.py`) confere o Cliente nas listas ONU, OFAC, PEP da CGU, CEIS e CNEP. O resultado é gravado em `screening_results`. O tratamento de correspondências está na BO-POL-01, item 7.

6.3. **Prova de vida.** É obrigatória:

- (a) antes do primeiro saque;
- (b) antes de qualquer aumento para o nível 2 ou 3;
- (c) antes do primeiro pagamento de comissão a Afiliado;
- (d) sempre que o motor de monitoramento (`tools/compliance/monitor.py`) gerar os alertas P03a, G03 ou AF01.

6.4. Critérios de aprovação da prova de vida:

- vivacidade aprovada pelo fornecedor;
- correspondência facial entre a selfie e a foto do documento;
- documento válido;
- nome e data de nascimento do documento iguais aos validados no bureau.

Se qualquer critério falhar, a pessoa pode tentar de novo até 2 vezes. Na terceira falha, a análise passa a ser manual pelo Diretor de Compliance, com prazo de 5 dias úteis.

6.5. O resultado da prova de vida é gravado em `kyc_profiles`: data, fornecedor, identificador da verificação, resultado e pontuação. As imagens são guardadas conforme a BO-POL-03, item 9.

## 7. Níveis de verificação e limites iniciais (Poker com dinheiro real)

7.1. **Tabela de níveis e limites**

| Nível | Requisitos acumulados | Depósito | Saque |
|---|---|---|---|
| 0 – Cadastro iniciado | Dados do item 5.1; e-mail e celular verificados; screening sem correspondência | Não permitido (somente fichas de teste) | Não permitido |
| 1 – CPF validado | Nível 0 + CPF validado no bureau (item 6.1) + endereço e ocupação + declaração de PEP. Se for PEP, não deposita até concluir a diligência reforçada e obter a aprovação da BO-POL-01, item 6.4.2 | Até R$ 500 por dia e R$ 2.000 por mês | Não permitido |
| 2 – Identidade verificada | Nível 1 + prova de vida aprovada + chave Pix de saque com mesma titularidade confirmada | Até R$ 2.000 por dia e R$ 10.000 por mês | Até R$ 2.000 por dia e R$ 10.000 por mês, em no máximo 3 saques por dia |
| 3 – Origem comprovada (diligência reforçada) | Nível 2 + comprovação de origem dos recursos (item 8) + pesquisa de mídia negativa + aprovação do Diretor de Compliance (e do Administrador, se PEP) | Até R$ 10.000 por dia e, por mês, o menor valor entre R$ 50.000 e a renda mensal comprovada | Até R$ 10.000 por dia e R$ 50.000 por mês, em no máximo 3 saques por dia |

7.2. **Regras dos limites**

- (a) Os limites são por CPF e somam todas as transações do período. O dia vai de 00:00 a 23:59 no horário de Brasília. O mês é o calendário.
- (b) Transação acima do limite disponível é recusada antes da liquidação. Não há crédito parcial.
- (c) Não existem limites acima do nível 3 nesta versão. Ampliá-los exige revisão desta política, aprovada pelo Administrador.
- (d) O Diretor de Compliance pode reduzir os limites de qualquer Cliente com base em risco ou em alerta, e registra a decisão em `audit_log`. O aumento só ocorre pela troca de nível.
- (e) Os limites de saque valem sobre o saldo disponível do Cliente. Não autorizam sacar valor depositado e não jogado sem a análise da regra P01 (BO-POL-01, item 9.2).

7.3. **Cursos.** A compra de Cursos não depende do nível do Poker. Segue a diligência simplificada da BO-POL-01, item 6.1. A diligência sobe conforme as compras do mesmo CPF em 12 meses:

- R$ 10.000 ou mais: exige nível 1;
- R$ 30.000 ou mais: exige comprovação de origem de recursos (item 8).

## 8. Comprovação de origem de recursos

8.1. **Quando é exigida**

- (a) na subida para o nível 3;
- (b) quando o Cliente for classificado como alto risco (BO-POL-01, item 5);
- (c) quando o alerta P05 tiver severidade alta;
- (d) quando as compras de Cursos do mesmo CPF chegarem a R$ 30.000 ou mais em 12 meses.

8.2. **Documentos aceitos** (pelo menos um):

- última declaração de Imposto de Renda Pessoa Física com recibo de entrega;
- 3 últimos holerites;
- pró-labore ou distribuição de lucros com contrato social;
- extratos bancários dos últimos 3 meses que mostrem a renda.

O documento tem que estar em nome do Cliente.

8.3. O Diretor de Compliance registra em `kyc_profiles`:

- a renda mensal comprovada;
- o tipo de documento;
- a data da análise.

Ele recusa o documento quando houver incompatibilidade, rasura ou indício de adulteração. Indício de adulteração gera alerta e pode levar ao encerramento do relacionamento (item 11).

## 9. KYC de Afiliados

9.1. **Afiliado pessoa física.** Exige-se:

- dados do item 5.1 e do item 5.2;
- CPF validado no bureau;
- idade igual ou maior que 18 anos;
- screening em todas as listas;
- prova de vida antes do primeiro pagamento;
- chave Pix de recebimento com o mesmo CPF.

9.2. **Afiliado pessoa jurídica.** Exige-se:

- (a) CNPJ com situação "ativa" na Receita Federal;
- (b) razão social, endereço e CNAE;
- (c) contrato social ou certificado de MEI;
- (d) quadro de sócios e administradores e identificação do beneficiário final. Beneficiário final é a pessoa física com 25% ou mais do capital ou que exerça controle;
- (e) KYC de pessoa física do representante legal e de cada beneficiário final, com bureau e screening, e prova de vida do representante legal;
- (f) screening da empresa e de cada sócio em ONU, OFAC, PEP, CEIS e CNEP;
- (g) chave Pix de recebimento com o mesmo CNPJ.

9.3. Também se aplicam ao Afiliado:

- a classificação de risco da BO-POL-01, item 5;
- as regras AF01 e AF02;
- a atualização cadastral do item 10.

Comissão só é paga após KYC completo. Comissão devida a Afiliado com KYC incompleto fica retida até a conclusão.

## 10. Atualização cadastral por risco

10.1. **Periodicidade**

| Risco | Atualização |
|---|---|
| Alto | A cada 12 meses |
| Médio | A cada 24 meses |
| Baixo | A cada 36 meses |

10.2. **Como funciona**

- O prazo conta da última verificação completa registrada em `kyc_profiles`.
- O Cliente é avisado 30 dias antes do vencimento.
- Vencido o prazo sem atualização, ficam bloqueados novos depósitos, saques e pagamentos de comissão até a atualização (BO-POL-03, item 7).

10.3. A atualização confirma os dados do item 5, repete o screening e, para o nível 3, renova a comprovação de origem de recursos.

10.4. **Atualização antecipada.** Também é obrigatória quando:

- houver mudança de nível;
- houver alerta de severidade alta;
- surgir informação nova que mude o risco;
- a Trio pedir.

## 11. Recusa e encerramento de relacionamento

11.1. **Recusa obrigatória** do cadastro ou da subida de nível:

- (a) idade menor que 18 anos;
- (b) CPF com situação diferente de "regular";
- (c) correspondência confirmada em lista da ONU/CSNU ou da OFAC;
- (d) documento falso ou adulterado, ou dados de terceiros;
- (e) prova de vida reprovada após a análise manual;
- (f) recusa em entregar informação ou documento exigido;
- (g) segunda conta do mesmo CPF.

11.2. **Encerramento do relacionamento**, decidido pelo Diretor de Compliance e registrado em `audit_log`:

- (a) nos casos do item 11.1, descobertos depois do cadastro;
- (b) alerta concluído como "encerrar relacionamento" (BO-POL-01, item 10.5);
- (c) confirmação de chip dumping, de conluio ou de uso de várias contas;
- (d) violação dos termos de uso.

11.3. **No encerramento:**

- o saldo legítimo é devolvido somente por Pix para conta de mesma titularidade, depois de prova de vida aprovada;
- se houver indisponibilidade determinada (BO-POL-01, item 7), nada é devolvido;
- o CPF fica impedido de novo cadastro;
- o Cliente recebe mensagem neutra, sem revelar alerta ou comunicação (BO-POL-01, item 11).

## 12. Meios de pagamento e mesma titularidade

12.1. Na conta da Empresa na Trio, os recebimentos de Clientes e os pagamentos a Clientes e Afiliados são feitos **somente por Pix**. Vendas de Cursos com cartão ocorrem exclusivamente na plataforma de infoprodutos, que é a recebedora dessas vendas.

12.2. **Depósito no Poker**

- É feito por QR Code Pix gerado para o Cliente.
- Só é creditado quando o CPF do pagador informado na liquidação Pix for igual ao CPF do Cliente.
- Se o CPF for diferente, o valor não é creditado, é devolvido ao pagador original e gera o alerta P07.
- Se a liquidação não trouxer o documento do pagador, o valor não é creditado e é devolvido.

12.3. **Saque e pagamento de comissão**

- Só vão para chave Pix ou conta de **mesma titularidade** (mesmo CPF; para Afiliado PJ, mesmo CNPJ).
- Antes de cada envio, o sistema confere o documento do titular de destino retornado na consulta da chave.
- Se o documento divergir, ou se a consulta não for conclusiva, o envio não ocorre e gera o alerta P06.
- Não há exceção por pedido do Cliente.

12.4. A chave Pix de saque é cadastrada no nível 2. Trocar a chave exige nova confirmação de titularidade e suspende saques por 24 horas.

## 13. Estado de implantação (declaração expressa)

13.1. Nesta data, o estado dos controles é o seguinte:

- (a) Ativos: os dados dos itens 5.1 e 5.2, a verificação de e-mail e celular, o screening (item 6.2) e os registros em `kyc_profiles`, `screening_results` e `audit_log`.
- (b) Bureau de CPF e prova de vida: são contratados antes da liberação do Poker com dinheiro real, que não ocorre sem eles.
- (c) Afiliados antes da contratação do bureau: o CPF ou CNPJ é conferido manualmente pelo Diretor de Compliance na consulta pública de situação cadastral da Receita Federal. A identidade é conferida por videochamada, com apresentação do documento original com foto. A evidência (comprovante da consulta e registro da chamada) é anexada ao dossiê.

## 14. Papéis

| Papel | Responsabilidades |
|---|---|
| Administrador | Aprova esta política; contrata o bureau e o fornecedor de prova de vida; aprova PEP no nível 3 |
| Diretor de Compliance e PLD/FTP | Executa o KYC; analisa casos manuais, divergências e origem de recursos; decide recusa e encerramento; acompanha os vencimentos de atualização |
| Comitê de Compliance | Revisa mensalmente as pendências de KYC, as recusas e os encerramentos, com registro em ata |

## 15. Registros e guarda

15.1. Os dados e documentos de KYC, os resultados de bureau, de prova de vida e de screening, e as decisões de nível, recusa e encerramento são guardados por no mínimo 10 anos após o fim do relacionamento.

15.2. Toda mudança de nível ou de limite gera registro em `audit_log` com autor, data e hora, valor anterior e valor novo.

## 16. Treinamento, revisão, sanções e vigência

16.1. Esta política integra o treinamento anual de PLD/FTP (BO-POL-01, item 18).

16.2. A política é revisada uma vez por ano, ou antes da liberação do Poker com dinheiro real, ou a pedido da Trio, sempre com aprovação do Administrador.

16.3. O descumprimento sujeita o responsável às sanções internas da BO-POL-01, item 19. O Cliente ou Afiliado que prestar declaração falsa tem o relacionamento encerrado e pode ser comunicado às autoridades (Código Penal, art. 299).

16.4. A política vigora a partir da data de aprovação, por prazo indeterminado.

---

Aprovação: Raphael Mendonça Barros Silva, Administrador, 05/11/2026.
Responsável: Michael Mendonça Barros Silva, Diretor de Compliance e PLD/FTP.
