# Teste Cego: fontes, método e revisão

> **AVISO: conteúdo sem revisão humana. NÃO PUBLICAR antes da revisão editorial e jurídica.**
> As 24 afirmações de `afirmacoes.ts` têm `revisado: false`. É material de pesquisa preparado por agente
> automatizado sobre uma eleição real em andamento (2º turno em 25/10/2026). Antes de ir ao ar, uma pessoa da
> redação e uma da área jurídica precisam conferir cada afirmação e cada posição contra o documento oficial do
> TSE, aprovar a redação e só então trocar `revisado` para `true`. O tipo hoje é o literal `false`, então essa
> troca é uma mudança de código consciente.

Formato atual: **v2, afirmações únicas com escala de concordância** (`src/app/content/afirmacoes.ts`).
O formato anterior, de pares de propostas, está documentado em [Versão anterior](#versão-anterior-formato-de-pares-09102026)
e o arquivo `propostas.ts` continua no repositório como referência.

Acesso às fontes: **10/10/2026**. Candidatos: **13, Lula (PT)** × **22, Flávio Bolsonaro (PL)**.

---

## 1. Por que mudamos

O dono do produto pediu: "deve ser uma pergunta única, com aquele concordo totalmente, concordo, neutro etc.
Pois assim fica MUITO na cara de quem são as propostas, e devem ser perguntas mais neutras".

No formato de pares, duas propostas reais apareciam lado a lado, uma de cada plano. O estilo e o contraste
entregavam a autoria. No formato novo (no estilo de Wahl-O-Mat e Vote Compass), a pessoa vê **uma afirmação de
política pública por vez**, escrita pela redação em linguagem neutra, e diz o quanto concorda. Só no fim
comparamos as respostas com a **posição documentada** de cada candidato.

## 2. Fontes primárias

As mesmas do formato anterior: os **programas de governo registrados no TSE**, lidos na íntegra de novo em
10/10/2026 para este formato. Os arquivos baixados nesse dia têm o mesmo SHA-256 dos lidos em 09/10/2026.

| Nº | Documento | Páginas | Cópia lida (PDF) | SHA-256 |
|---|---|---|---|---|
| 13 | *Programa de Governo* (PT/PSB e coligação), registrado no TSE em 08/08/2026 | 84 | https://static.congressoemfoco.com.br/2026/08/08/attachment/2026/08/08/32ce89_programa_governo_lula_2026.pdf | `75e2dab7b9af27454a5c1a44c3bb0d7e0eaddbd1c355ccf1536f0d0be927e47b` |
| 22 | *Para o Brasil vencer o atraso: Diretrizes do Plano de Governo 2027-2030* (PL), registrado no TSE | 76 | https://static.poder360.com.br/uploads/2026/08/plano-flavio.pdf | `a65ece32fba45e2bd13ca4f799872a8e78a492e16b5375fcd0e3756f4b77e5a4` |

Por que lemos cópias publicadas pela imprensa, e não o arquivo do TSE: ver §1 da [Versão anterior](#versão-anterior-formato-de-pares-09102026).
A pendência continua: de uma rede que acesse o TSE, comparar o SHA-256 com os PDFs oficiais.

Nos dois documentos, a página impressa no rodapé coincide com a página do PDF (conferido nas 32 páginas citadas).

## 3. Método

1. **Leitura integral** dos dois PDFs (`pdftotext`, página a página) e levantamento de **onde os planos tratam
   do mesmo assunto com posições opostas**. Isso é raro: os planos quase nunca discutem as mesmas medidas. Por
   isso há muitas posições `sem-posicao` (ver §6).
2. **Redação das afirmações** (24, sendo 2 por tema em 12 temas). Regras:
   - frase curta (74 a 107 caracteres, média de 95,5; limite de 110), afirmativa, concreta, em linguagem simples;
   - nenhum nome, partido, número, marca de programa ("voucher-creche", "cívico-militar", "arcabouço",
     "6x1"...), slogan ou palavra de enquadramento ("censura", "privilégio", "soberania", "garantir direitos"...);
     a lista está em `TERMOS_PROIBIDOS` e é testada;
   - teste dos dois lados: alguém de cada campo precisa poder concordar ou discordar com dignidade. Quando a
     frase ficava "óbvia" (ex.: preferência a produto nacional), acrescentamos o custo da escolha;
   - sem negação dupla: nenhuma frase usa "não deve", para "discordo" não virar "não não";
   - **direção alternada**: em 11 afirmações concordar aproxima do 13, em 11 aproxima do 22 e 2 são controle.
     Para isso, quatro frases (trb-b, edu-a, seg-a, seg-b) foram escritas "ao contrário" da proposta (ex.: "a idade [...] deve continuar sendo
     18 anos", cujo plano 22 propõe 16).
3. **Posição de cada candidato** em cada afirmação, só com base no texto do plano:
   - `concorda` ou `discorda` só quando o plano é **explícito**; `neutro` quando o plano assume
     explicitamente uma posição intermediária; `sem-posicao` quando o plano não trata do assunto;
   - nada de inferência por ideologia, histórico, entrevista, debate ou declaração de aliados;
   - cada posição com fonte: URL com `#page=N`, página, seção e **trecho literal**; `[…]` marca corte;
   - `confianca: 'media'` quando a posição exigiu ler o contexto, com `nota` explicando; vale revisar primeiro.
4. **Verificação automática** (script fora do repositório, rodado em 10/10/2026):
   - os **34 trechos** citados, divididos em `[…]`, são substring literal do texto da página citada depois de
     normalizar espaços: **34/34 OK**; a página citada termina com o número impresso igual: 34/34;
   - `validarAfirmacoes()` volta vazia (ver §8); `npx vitest run src/app/content/afirmacoes.test.ts` passa.

## 4. Escala e cálculo da sintonia

Respostas: **Concordo totalmente (+2) · Concordo (+1) · Neutro (0) · Discordo (−1) · Discordo totalmente (−2)**
e **Pular**. A pessoa pode marcar uma afirmação como "importante pra mim".

```
Posição do candidato:  c = +2 (concorda) · 0 (neutro) · −2 (discorda)
Afinidade no item:     a = 1 − |r − c| / 4        (0 = oposto total, 1 = idêntico)
Peso:                  w = 2 se marcada "importante", senão 1
Sintonia (0–100):      S = 100 × Σ w·a / Σ w
```

- Saem da conta de um candidato os itens pulados ou não respondidos e os itens em que o plano dele não trata
  do assunto (`sem-posicao`). Por isso o resultado informa quantos itens entraram para cada um
  (`consideradas`), e a UI deve mostrar "com base em N afirmações".
- Os dois percentuais são independentes: **não somam 100%**. Sem nenhum item válido, o resultado é `null`.
- Arredondamento: a UI mostra inteiros (`fmtPct(x, 0)`, meio ponto sobe). O código multiplica por 100 **antes** de
  dividir pelo peso total, para que um 57,5% exato não vire 57,4999… e apareça como "57%" (testado para todos os
  resultados possíveis com peso total até 48). Não há "vencedor": empate ou diferença, a UI mostra os dois números.
- Exemplo: "Concordo" (+1) numa afirmação em que o 13 concorda e o 22 discorda dá 75% com o 13
  (1 − 1/4) e 25% com o 22 (1 − 3/4). "Neutro" contra "concorda" dá 50%.
- Quem responde exatamente a posição de um candidato em tudo tem 100% com ele (testado).
- Quem responde "Concordo totalmente" em tudo tem 67,6% com o 13 e 64,7% com o 22; "Discordo totalmente" em tudo
  dá 32,4% e 35,3%; "Neutro" em tudo dá 52,9% e 50,0%. A pequena diferença vem do único `neutro` (inf-a). Com a
  direção alternada, responder sempre igual não favorece um lado de forma relevante.
- O Duelo usa a mesma régua entre duas pessoas: média de 1 − |ra − rb| / 4 nos itens que as duas responderam
  (`calcularConcordancia`).
- Por tema (`porTema`) a conta é a mesma, restrita às duas afirmações do tema.

## 5. As 24 afirmações e as posições documentadas

Legenda: ✅ concorda · ❌ discorda · ➖ neutro · ∅ sem posição no plano · (m) confiança média.
"Concordo →" indica de quem a resposta "Concordo totalmente" aproxima.

| id | Tema | Afirmação (o que a pessoa vê) | 13 | 22 | Concordo → |
|---|---|---|---|---|---|
| eco-a | Economia | As regras de controle dos gastos federais devem ficar mais rígidas, com foco em reduzir a dívida pública. | ❌ p. 49 (m) | ✅ p. 71 | 22 |
| eco-b | Economia | O investimento público deve ser um dos principais motores do crescimento da economia. | ✅ p. 48 | ❌ p. 49 (m) | 13 |
| imp-a | Impostos | A reforma dos impostos sobre o consumo, que está em fase de implantação, deve ser revista. | ❌ p. 48 (m) | ✅ p. 30 | 22 |
| imp-b | Impostos | O governo deve cortar impostos sobre combustíveis para baixar o preço, mesmo que arrecade menos. | ❌ p. 8 (m) | ✅ p. 31 | 22 |
| trb-a | Trabalho e renda | A jornada máxima de trabalho deve ser reduzida por lei para 40 horas semanais, sem corte de salário. | ✅ p. 75 | ❌ p. 45 (m) | 13 |
| trb-b | Trabalho e renda | O salário mínimo deve ser reajustado apenas pela inflação, sem aumento acima dela. | ❌ p. 74 | ∅ | 22 |
| soc-a | Programas sociais | Onde faltar vaga em creche pública, o governo deve pagar a vaga em uma creche particular. | ∅ | ✅ p. 21 | 22 |
| soc-b | Programas sociais | O governo deve ampliar os programas de transferência de renda para atender mais famílias. | ✅ p. 18 (m) | ❌ p. 43 (m) | 13 |
| sau-a | Saúde | O SUS deve usar hospitais e clínicas particulares para fazer exames e cirurgias e reduzir as filas. | ✅ p. 37 | ✅ p. 37 | controle |
| sau-b | Saúde | Cada paciente deve ter um prontuário eletrônico único, com todo o seu histórico, válido na rede pública. | ✅ p. 35 | ✅ p. 26 | controle |
| edu-a | Educação | As escolas públicas devem ser dirigidas apenas por civis, sem militares na gestão. | ∅ | ❌ p. 35 | 13 |
| edu-b | Educação | Estudantes de baixa renda do ensino médio devem receber ajuda em dinheiro para não abandonar a escola. | ✅ p. 32 | ∅ | 13 |
| seg-a | Segurança | A idade a partir da qual alguém responde por crimes como adulto deve continuar sendo 18 anos. | ∅ | ❌ p. 13 | 13 |
| seg-b | Segurança | A compra de armas de fogo e munições pela população deve ficar mais fácil. | ❌ p. 28 | ∅ | 22 |
| amb-a | Meio ambiente | Se o órgão ambiental não decidir no prazo, a licença de quem cumpriu as exigências deve ser concedida. | ∅ | ✅ p. 50 | 22 |
| amb-b | Meio ambiente | Mais terras públicas devem ser destinadas a áreas de conservação e a territórios indígenas e quilombolas. | ✅ p. 70 | ∅ | 13 |
| inf-a | Infraestrutura | Estradas, ferrovias e portos devem ser construídos e operados principalmente por empresas privadas. | ➖ p. 53 (m) | ✅ p. 50 | 22 |
| inf-b | Infraestrutura | Compras, obras e concessões do governo devem preferir produtos brasileiros, mesmo que custem um pouco mais. | ✅ p. 51 | ∅ | 13 |
| est-a | Estado e instituições | A lei deve obrigar as redes sociais a impedir a circulação de conteúdos considerados desinformação. | ✅ p. 16 (m) | ❌ p. 66 (m) | 13 |
| est-b | Estado e instituições | Decisões tomadas por um único ministro do STF devem ser limitadas, dando prioridade às decisões coletivas. | ∅ | ✅ p. 65 | 22 |
| agr-a | Agricultura | O governo deve ampliar a reforma agrária, assentando mais famílias de trabalhadores rurais. | ✅ p. 60 | ∅ | 13 |
| agr-b | Agricultura | O direito de propriedade de terras no campo deve ser garantido sem margem para exceções. | ∅ | ✅ p. 54 | 22 |
| ext-a | Relações exteriores | O Brasil deve tratar como prioridade a entrada na OCDE, organização internacional de cooperação econômica. | ∅ | ✅ p. 63 | 22 |
| ext-b | Relações exteriores | O Brasil deve aprofundar a aproximação política com o BRICS e com outros países em desenvolvimento. | ✅ p. 81 | ∅ | 13 |

Contagens (`resumoEquilibrio()`):

- **Posições opostas** (um concorda e o outro discorda): 7, sendo 4 em que o 13 concorda (eco-b, trb-a, soc-b,
  est-a) e 3 em que o 22 concorda (eco-a, imp-a, imp-b).
- **Controles** (os dois concordam): 2 (sau-a, sau-b).
- **Um lado só** (o outro plano não trata): 14, sendo 7 com posição só do 13 e 7 só do 22. Mais inf-a, em que o
  13 é neutro.
- "Concordo totalmente" aproxima do 13 em 11 afirmações, do 22 em 11 e dos dois em 2.
- Por candidato: o 13 concorda em 11, discorda em 5, é neutro em 1 e não tem posição em 7. O 22 concorda em 11,
  discorda em 6 e não tem posição em 7. Cada um tem posição em 17 das 24.

Os trechos literais, as seções e as notas estão em `afirmacoes.ts` (campo `posicoes`).

### 5.1 Por que cada redação é neutra (para a revisão)

| id | Escolhas de redação |
|---|---|
| eco-a | Eixo ordinal (endurecer ou não), sem o nome da regra nem adjetivo ("responsável", "frouxa"). A versão anterior ("as regras atuais devem ser mantidas") misturava dois eixos: quem quer conter gastos tendia a concordar ("manter os limites") e caía perto do 13, embora seja o 22 quem pede regras mais duras; quem quer gastar mais discordava e caía perto do 22. |
| eco-b | Fala do investimento público sem qualificá-lo ("ineficiente", "estratégico"); "um dos principais" deixa espaço a quem quer os dois. Direção invertida na revisão para compensar a troca de eco-a. |
| imp-a | Não julga a reforma nem repete o "IVA entre os mais altos do mundo"; pergunta só se ela deve ser revista. |
| imp-b | Traz o benefício (preço) **e** o custo (arrecadação), para não virar pergunta de resposta óbvia. O custo é justamente a objeção documentada do 13. |
| trb-a | Medida concreta, sem o slogan "fim da 6x1". Quem prefere acordo entre as partes pode discordar. |
| trb-b | Escrita na direção oposta (só a inflação) para alternar o lado; sem "valorização" ou "arrocho" e sem o "só o necessário" da versão anterior. O contexto factual (benefícios atrelados ao mínimo) mostra o que está em jogo para os dois lados. |
| soc-a | Descreve o mecanismo sem a marca "voucher-creche". |
| soc-b | "Transferência de renda" é descritivo; sem nome de programa nem "assistencialismo" ou "dependência". |
| sau-a | Controle. Evita "privatizar o SUS" e "parceria". |
| sau-b | Controle. Descreve o prontuário; quem se preocupa com privacidade pode discordar. |
| edu-a | Direção oposta (só civis); sem "cívico-militar" ou "militarização". |
| edu-b | Descreve o benefício sem a marca do programa. |
| seg-a | Direção oposta (manter 18); sem "impunidade" ou "encarceramento de jovens". O contexto explica a regra atual. |
| seg-b | Direção oposta; sem "armar a população" ou "desarmamento". |
| amb-a | Mantém a condição do plano ("quem cumpriu as exigências"); evita "licença automática" e "autolicenciamento" (termos de crítica) e "destravar" (termo de defesa). |
| amb-b | Descreve a destinação; sem "demarcação", "reparação" ou "terra improdutiva". |
| inf-a | Sem "privatizar" ou "entregar"; "principalmente" deixa espaço aos modelos mistos (por isso o 13 é neutro). |
| inf-b | Traz o custo ("mesmo que custem um pouco mais") para não virar pergunta patriótica de resposta óbvia. |
| est-a | "Considerados" deixa claro que alguém julga o conteúdo, que é justamente a objeção de quem discorda; sem "censura" nem "regulação democrática". Saiu "discurso de ódio" (puxava para o "concordo" e o plano 22 não trata disso) e "remover" virou "impedir a circulação", mais perto do texto do 13. |
| est-b | Descreve a regra sem "ativismo judicial" ou "ataque ao Supremo". O contexto explica a decisão individual. |
| agr-a | "Famílias de trabalhadores rurais", sem "sem-terra", "invasores" nem a imagem dos acampamentos (a versão anterior, "famílias que vivem em acampamentos à espera de terra", tinha apelo emocional). |
| agr-b | Traduz "sem margem para relativizações" do plano; quem defende a função social da propriedade pode discordar. |
| ext-a | Explica a OCDE sem "clube dos ricos" nem "selo de qualidade". O contexto não diz mais o ano em que a adesão foi aberta (2022 apontava um governo). |
| ext-b | Sem "Sul Global" nem "alinhamento"; o contexto explica o BRICS. |

O campo opcional `contexto` (12 afirmações) explica um termo e pode aparecer antes da resposta. Ele passa pelo
mesmo filtro de termos proibidos e evita datas que apontem um governo. Traz fatos que **precisam de checagem da
redação**: lei que limita o crescimento das despesas federais, jornada constitucional de 44 horas, benefícios
atrelados ao salário mínimo, ECA, reforma do consumo com transição até 2033, candidatura do Brasil à OCDE,
membros do BRICS, decisões individuais no STF, licença ambiental e reforma agrária.

## 6. Itens sem posição (`sem-posicao`)

Os planos raramente tratam das mesmas medidas, então 14 afirmações têm posição de um lado só. A busca no outro
plano foi feita pelo texto inteiro e por palavras-chave (ex.: "maioridade", "OCDE", "BRICS", "salário",
"licença", "reforma agrária"). Cada caso tem `nota` em `afirmacoes.ts`.

| id | Sem posição | O que o plano diz de mais próximo |
|---|---|---|
| trb-b | 22 | Nada sobre o salário mínimo. |
| soc-a | 13 | Ampliar creches públicas (p. 31); nada sobre pagar vaga na rede privada. |
| edu-a | 13 | Não menciona escolas com gestão militar. |
| edu-b | 22 | Paga alunos de bom desempenho para dar reforço (p. 35), que é outra medida. |
| seg-a | 13 | Nada sobre a idade de responsabilidade penal. |
| seg-b | 22 | Só armamento para as forças de segurança (p. 13-14). |
| amb-a | 13 | Nada sobre prazos de licenciamento. |
| amb-b | 22 | Autonomia produtiva de indígenas e quilombolas em suas terras (p. 50). |
| inf-b | 22 | Infraestrutura "sem intervenções que distorçam os incentivos de mercado" (p. 50) e abertura comercial (p. 63). Não fala de compras públicas: **não** marcamos "discorda". |
| est-b | 13 | "Diálogo permanente com os atores do judiciário, respeitada a autonomia dos Poderes" (p. 16). |
| agr-a | 22 | Titulação de pequenos proprietários e segurança do direito de propriedade (p. 54). |
| agr-b | 13 | Reforma agrária (p. 60) e regularização fundiária. Não marcamos "discorda" por inferência. |
| ext-a | 13 | A sigla OCDE só aparece numa comparação de matriz elétrica (p. 64). |
| ext-b | 22 | Negociar "com todos os que interessam ao Brasil" (p. 62); não cita o BRICS. |

## 7. Riscos editoriais e jurídicos (para a revisão)

1. **Muitos itens de um lado só.** Cada percentual usa as 17 afirmações em que aquele candidato tem posição, e os
   dois conjuntos são diferentes. A UI deve mostrar "com base em N afirmações" para cada um e não apresentar os
   dois números como placar de disputa. Alternativa editorial: trocar itens de um lado só por pares com posição
   oposta explícita, se a revisão achar mais trechos.
2. **Posições de confiança média** (10): eco-a/13, eco-b/22, imp-a/13, imp-b/13, trb-a/22, soc-b/13, soc-b/22,
   est-a/13, est-a/22 e inf-a/13 (neutro). Revisar primeiro. Os casos mais discutíveis:
   - **eco-a/13**: o plano promete "manter" as regras fiscais; o "discorda" de torná-las mais rígidas é a leitura
     direta disso, mas o plano não diz "somos contra regras mais duras".
   - **eco-b/22**: o plano apoia o crescimento "no investimento privado" e diz que o Estado "não é o empresário",
     sem rejeitar com todas as letras o investimento público como motor.
   - **imp-b/13**: o "discorda" vem de uma crítica a um corte de impostos sobre combustíveis no **passado**
     ("desoneração artificial", p. 8), não de uma promessa futura. A alternativa é `sem-posicao`.
   - **trb-a/22**: o plano chama de "retrocesso" a proposta de jornada do governo atual por ignorar o
     "negociado sobre o legislado"; não diz "somos contra 40 horas".
   - **est-a**: o 22 rejeita estruturas do **Estado** que classifiquem desinformação, sem falar diretamente de uma
     lei para as plataformas; o 13 propõe regular as plataformas para "impedir que difundam desinformação", sem
     dizer se por remoção de conteúdo.
   - **soc-b**: o 13 fala em "ampliar as políticas de proteção social" e o 22 rejeita "ter mais gente na fila do
     auxílio", mas promete manter os programas existentes.
3. **Adivinhação pelo conteúdo.** Tirar nomes não esconde tudo: 40 horas, OCDE, BRICS, maioridade penal, armas e
   reforma agrária são temas conhecidos de cada campo. Isso é inerente a propostas reais. Não inventamos nem
   suavizamos posições para esconder a autoria.
4. **Alegações dentro dos trechos.** Alguns trechos criticam o adversário (est-a/22, imp-b/13) ou trazem nome e
   marca (trb-b/13 cita "Lula", edu-b/13 cita o programa). A UI deve mostrá-los **só depois da resposta**, como
   citação do documento, entre aspas e com link, nunca como afirmação do Sintonia.
5. **Saúde sem discriminação.** As duas de Saúde são controles: os planos convergem (ver a lista de convergências
   na Versão anterior, §5). O resultado por tema em Saúde tende a ser igual para os dois, o que é informação
   verdadeira e precisa ser explicada na tela.
6. **Frases populares.** edu-b (ajuda a estudante pobre) tende a ter muita concordância. imp-b ganhou o custo
   ("mesmo que arrecade menos") na revisão de 10/10, como inf-b; a redação pode fazer o mesmo em edu-b.
7. **"Neutro" não é "não sei".** A UI deve deixar claro que "Pular" serve para "não sei / prefiro não responder".
   Um "Neutro" conta como posição do meio.
8. **Incumbência.** Afirmações sobre "regras atuais" ou "continuar" (eco-a, seg-a) são naturalmente associadas a
   quem governa ou à oposição. A direção foi escolhida para equilibrar o conjunto, não para favorecer um lado.
9. **Sem enquete e LGPD.** Nunca exibir agregados de respostas de pessoas diferentes (Lei 9.504/97, art. 33, §5º;
   ARCHITECTURE.md §1.2). As respostas não saem do navegador (§1.3): o código v2 vai depois do "#".
10. **Documento pode mudar.** Candidaturas podem substituir o plano no TSE. Reconfirmar o SHA-256 e `ACESSO`
    antes de publicar.
11. **Escopo.** Só os programas registrados. Falas de campanha, debates, entrevistas e o histórico de governo não
    foram usados, nem para "completar" posições.

## 7.1 Revisão de neutralidade (10/10/2026, segunda leitura)

Releitura das 24 frases "como eleitor de cada campo", procurando frase que entregue o autor, enquadramento
carregado ou resposta óbvia. Toda posição alterada foi reconferida no PDF (página e trecho literal).

| id | Problema | Correção |
|---|---|---|
| eco-a | "As regras atuais [...] devem ser mantidas" misturava dois eixos: quem quer conter gastos tendia a concordar ("manter os limites") e caía perto do 13, embora o 22 critique as regras atuais por frouxas; quem quer gastar mais discordava e caía perto do 22. O contexto citava "lei de 2023" (aponta um governo). | Eixo ordinal: "devem ficar mais rígidas, com foco em reduzir a dívida". 22 concorda (p. 71, trecho ampliado com a crítica às exceções), 13 discorda (p. 49, média). Contexto sem data. |
| eco-b | Para manter a direção 11 × 11 depois da troca de eco-a. | "O investimento público deve ser um dos principais motores do crescimento": 13 concorda (p. 48, agora alta), 22 discorda (p. 49, média). |
| imp-b | Só o benefício ("baixar o preço na bomba"): resposta óbvia, e o "discorda" do 13 vem de uma objeção de custo que a frase escondia. | "[...] mesmo que arrecade menos". |
| trb-b | "Só o necessário" diminuía a posição. | "Reajustado apenas pela inflação, sem aumento acima dela" + contexto factual sobre benefícios atrelados ao mínimo. |
| est-a | "Discurso de ódio" puxava para o "concordo" e não é tratado pelo plano 22; "remover" era mais forte que o texto do 13. | "Impedir a circulação de conteúdos considerados desinformação". |
| agr-a | "Famílias que vivem em acampamentos à espera de terra": imagem com apelo emocional. | "Assentando mais famílias de trabalhadores rurais". |
| imp-a, ext-a | Contextos com ano (2023, 2022) que apontam um governo. | Contextos sem ano. |
| ext-b | "Formado inicialmente por Brasil, Rússia, Índia, China e África do Sul" é impreciso (a África do Sul entrou depois). | "Que inclui Brasil, Rússia, Índia, China e África do Sul". |

Também conferidas, sem mudança: as outras 16 frases. Sorteio de 8 citações (semente 20261025: est-a/13, inf-a/13,
sau-a/13, imp-b/13, seg-b/13, amb-b/13, edu-a/22, agr-b/22) relidas no contexto da página: as 8 sustentam a posição
marcada. Por script, os 34 trechos (inclusive o novo de eco-a/22) seguem literais na página citada.

**Código de URL:** eco-a e eco-b mudaram de sentido na mesma posição do código v2. Como nenhum link v2 foi
publicado (só prévias locais), `VERSAO_CODIGO` continua "2". Se algum link v2 já tiver circulado, suba para "3".

## 8. Notas de integração (para quem faz a UI)

`import { … } from '@/app/content/afirmacoes'`:

- `AFIRMACOES` (24), `AFIRMACAO_POR_ID`, `TEMAS`, `TEMA_POR_ID`, `ESCALA` (5 níveis + Pular), `DOCUMENTOS`.
- `ordemDoTeste(seed)`: ordem de exibição determinística, sem dois itens seguidos do mesmo tema.
  `embaralhar(seed, lista?)` é o Fisher–Yates puro.
- `calcularSintonia(respostas, importantes?)` devolve `{ 13, 22, consideradas, respondidas, puladas, porTema,
  porAfirmacao }`, com valores de 0 a 100 ou `null`. `importantes` aceita lista, `Set` ou pesos por id.
- `calcularConcordancia(a, b)` serve ao Duelo.
- Código para URL v2 (30 caracteres `[0-9a-z]`): `codificar(seed, respostas, importantes)` e `decodificar(codigo)`.
  Também há `codificarRespostas`/`decodificarRespostas` (24 caracteres, só as respostas) e `novaSemente()`.
  As respostas vão na ordem canônica de `AFIRMACOES`, então a semente não altera o significado. Ao mudar a
  lista, suba `VERSAO_CODIGO`. O v1 (`pages/teste/codigo.ts`) é do formato de pares.
- Antes da resposta, mostrar só `texto`, `contexto` (opcional) e o rótulo do tema. Depois, mostrar `posicoes`:
  valor, `fonte.trecho` como citação com link `fonte.url`, `nota` e `confianca`.
- `validarAfirmacoes()` e `resumoEquilibrio()` servem a testes e à página `/metodologia`.

---

## Versão anterior (formato de pares, 09/10/2026)

Histórico do formato substituído: 12 rodadas com duas propostas reais lado a lado, uma de cada candidato
(`propostas.ts`, função `rodadas(seed)`). Mantido como registro da pesquisa; a UI nova não usa este formato.
O texto abaixo é o original, com os títulos rebaixados um nível.

> **AVISO: conteúdo sem revisão humana. NÃO PUBLICAR antes da revisão editorial e jurídica.**
> As 24 propostas em `propostas.ts` têm `revisado: false`. Isto aqui é material de pesquisa preparado por
> agente automatizado, sobre uma eleição real em andamento (2º turno em 25/10/2026). Antes de ir ao ar, uma
> pessoa da redação e uma da área jurídica precisam conferir cada item contra o documento oficial do TSE,
> aprovar a redação "cega" e só então trocar `revisado` para `true`. O tipo hoje é o literal `false`, então
> essa troca é uma mudança de código consciente.

Acesso às fontes: **09/10/2026**. Candidatos: **13, Lula (PT)** × **22, Flávio Bolsonaro (PL)**.

---

### 1. Fontes primárias

Usamos os **programas de governo registrados no TSE** pelas duas candidaturas, lidos na íntegra.

| Nº | Documento | Páginas | Cópia lida (PDF) | SHA-256 do arquivo lido |
|---|---|---|---|---|
| 13 | *Programa de Governo* (PT/PSB), registrado no TSE em 08/08/2026 | 84 | https://static.congressoemfoco.com.br/2026/08/08/attachment/2026/08/08/32ce89_programa_governo_lula_2026.pdf | `75e2dab7b9af27454a5c1a44c3bb0d7e0eaddbd1c355ccf1536f0d0be927e47b` |
| 22 | *Para o Brasil vencer o atraso: Diretrizes do Plano de Governo 2027-2030* (PL), registrado no TSE | 76 | https://static.poder360.com.br/uploads/2026/08/plano-flavio.pdf | `a65ece32fba45e2bd13ca4f799872a8e78a492e16b5375fcd0e3756f4b77e5a4` |

Página oficial do TSE que reúne os planos:
https://www.tse.jus.br/eleicoes/eleicoes-2026-content/propostas-de-governo-dos-candidatos-ao-cargo-de-presidente-da-republica-eleicoes-2026

#### Por que lemos cópias publicadas pela imprensa, e não o arquivo no servidor do TSE

- O `divulgacandcontas.tse.jus.br` (API REST e `/divulga/rest/arquivo/doc/...`) e o `www.tse.jus.br`
  responderam **HTTP 403 (Access Denied, Akamai)** a partir do ambiente de pesquisa, tanto por `curl` quanto
  por busca/fetch na web. Por isso não foi possível baixar os PDFs pelos `sqcand` (280002542548 e
  280002551544) nem pela página oficial. Uma busca indexou o programa do PT em
  `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/120016993257` ("PROGRAMA DE GOVERNO 2026
  PARTIDO DOS TRABALHADORES - PT"), mas esse endereço também deu 403 e **não foi conferido**.
- Usamos as cópias integrais publicadas por dois veículos, com estes indícios de que são o texto registrado:
  - **13:** o Congresso em Foco ("PT registra novo plano de governo de Lula no TSE; veja a íntegra",
    08/08/2026, atualizado em 10/08) informa que "a executiva nacional do PT registrou neste sábado (8) junto ao
    Tribunal Superior Eleitoral (TSE)" o plano e dá o link do PDF. Os metadados do arquivo indicam criação em
    08/08/2026 (Adobe InDesign). Tem 84 páginas.
  - **22:** o Poder360 ("Leia a íntegra do plano de governo de Flávio Bolsonaro") publica o PDF. O registro foi
    noticiado para 13/08/2026 e o arquivo lido foi gerado em 18/08/2026 (PDFium). Tem 76 páginas e a capa
    "Diretrizes do Plano de Governo 2027-2030". O Poder360 anunciou o PDF com cerca de 19 MB, mas o arquivo
    servido hoje tem 1,98 MB. Provavelmente foi recomprimido; o conteúdo e o número de páginas batem.
  - O Diário de Pernambuco ("TSE disponibiliza plano dos candidatos à Presidência da República; veja
    principais pontos", 04/10/2026) cita a página oficial do TSE e informa **84 páginas (Lula)** e
    **76 páginas (Flávio Bolsonaro)**, iguais às das cópias lidas.
- **Pendência para a revisão:** de uma rede que acesse o TSE, baixar os dois PDFs oficiais e (a) comparar o
  SHA-256 acima ou, se o arquivo for diferente, (b) conferir os 24 trechos página a página. Se o TSE trouxer
  versão substituída depois de agosto, todo o material precisa ser revisto.
- Em todos os documentos, **a página impressa no rodapé coincide com a página do PDF**. Isso foi conferido
  nas 24 páginas citadas. Os links levam a âncora `#page=N`.

### 2. Fontes secundárias (jornalismo) usadas para conferência

Lidas para confirmar que os pontos escolhidos são centrais nos planos e que a leitura bate com a cobertura.
Nenhuma proposta foi tirada só de reportagem.

- Congresso em Foco, 08/08/2026: "PT registra novo plano de governo de Lula no TSE; veja a íntegra"
  (cita 40 horas sem redução salarial, Ministério da Segurança Pública, meta de 80% de alfabetização e
  arcabouço fiscal). https://www.congressoemfoco.com.br/noticia/121121/pt-registra-novo-plano-de-governo-de-lula-no-tse-veja-a-integra
- Agência Brasil, 18/09/2026: "Flávio Bolsonaro propõe enxugar Estado e endurecer ações de segurança"
  (cita o corte de 10 ministérios, facções como narcoterroristas, método fônico, voucher, licenciamento etc.).
  https://agenciabrasil.ebc.com.br/politica/noticia/2026-09/flavio-bolsonaro-propoe-enxugar-estado-e-endurecer-acoes-de-seguranca
  - **Divergência:** a reportagem diz que o plano propõe reduzir a maioridade penal "de 18 para 14 anos".
    O texto literal (p. 13) diz **"de 18 para 16 anos"** e "punir também maiores de 14 anos que cometerem crimes
    graves". Seguimos o documento.
- Diário de Pernambuco, 04/10/2026: "TSE disponibiliza plano dos candidatos à Presidência da República; veja
  principais pontos" (6x1 e 40 horas, voucher-creche, corte de ministérios, página do TSE e número de páginas).
  https://www.diariodepernambuco.com.br/politica/2026/10/11725729-tse-disponibiliza-plano-dos-candidatos-a-presidencia-da-republica-veja-principais-pontos.html
- Poder360: só o PDF foi lido. A reportagem comparativa ("Eleições 2026: compare os planos de governo de
  Lula e Flávio") deu 403/522 e não foi lida. Pelo resumo da busca, ela aponta convergências em filas do SUS e
  escola em tempo integral, que excluímos (ver §5).

### 3. Método

1. **Leitura integral** dos dois PDFs (texto extraído com `pdftotext`, separado por página).
2. **Seleção.** Entraram só **compromissos para o próximo mandato**, sem balanço do que já foi feito,
   concretos e **distintivos**: o outro plano não propõe a mesma coisa. Cada candidato tem **1 proposta em
   cada um de 12 temas**, ou seja, 12 × 12, para o teste poder mostrar as duas lado a lado, tema a tema
   (`rodadas(seed)`).
3. **Redação cega.** Cada texto é uma frase de 90 a 123 caracteres (limite de 140) que começa por verbo no
   infinitivo e segue o trecho de perto. A frase não leva nome de pessoa, partido, slogan ou marca de
   programa. Exemplos: "Cuidotecas" virou "espaços de acolhida para crianças", "Farmácia Popular" virou
   "programa de remédios gratuitos em farmácias", "Petrobras" virou "petroleira estatal",
   "Tesouraço na Censura / Ministério da Verdade" foi omitido e "negociado sobre o legislado" foi descrito.
   O tom e o tamanho ficaram parecidos nos dois lados: média de 106,0 caracteres para o 13 e 108,3 para o 22.
   Termos institucionais neutros (SUS, IVA, OCDE, BRICS, FMI) foram mantidos.
4. **Verificação automática** (script fora do repositório, rodado em 09/10/2026):
   - cada `fonte.trecho`, dividido em `[…]`, é **substring literal** do texto da página citada, depois de
     normalizar espaços e quebras de linha: **24/24 OK**;
   - a página em `fonte.pagina` é igual à âncora `#page=` e ao número impresso no rodapé: 24/24;
   - `validarPropostas()` (exportada em `propostas.ts`) volta vazia. Ela confere 12 propostas por candidato,
     equilíbrio por tema, ids únicos, até 140 caracteres, verbo inicial, `revisado: false` e uma lista de
     pistas de autoria proibidas;
   - `embaralhar(seed)` e `rodadas(seed)` são determinísticas: mesma seed, mesma ordem.

### 4. As 24 propostas (para a revisão; não é texto de produto)

| Tema | id | Nº | Pág. | Conf. | Texto cego |
|---|---|---|---|---|---|
| Economia | eco-1 | 22 | 70 | alta | Retomar o programa nacional de desestatização, avaliando caso a caso onde a presença do Estado deixou de fazer sentido. |
| Economia | eco-2 | 13 | 67 | alta | Fazer a petroleira estatal voltar ao segmento de distribuição de combustíveis e expandir sua capacidade de refino. |
| Impostos | imp-1 | 13 | 59 | alta | Usar o imposto seletivo da reforma tributária para desestimular o consumo de produtos nocivos à saúde. |
| Impostos | imp-2 | 22 | 30 | alta | Rever a reforma tributária do consumo para reduzir a alíquota do novo IVA, projetada entre as mais altas do mundo. |
| Trabalho e renda | trb-1 | 22 | 44 | alta | Permitir que trabalhador e empresa combinem diretamente as condições de trabalho, dentro da lei, em vez de uma regra única. |
| Trabalho e renda | trb-2 | 13 | 75 | alta | Defender no Congresso o fim da escala 6x1 e a jornada de 40 horas semanais, sem redução de salário. |
| Programas sociais e cuidado | soc-1 | 22 | 21 | alta | Dar à família sem vaga em creche pública um voucher para a rede privada credenciada, até surgir a vaga pública. |
| Programas sociais e cuidado | soc-2 | 13 | 26 | alta | Apoiar espaços de acolhida para crianças de 3 a 12 anos que liberem o tempo das mulheres que cuidam delas. |
| Saúde | sau-1 | 13 | 36 | alta | Incluir exames de doenças crônicas, como hipertensão e diabetes, no programa de remédios gratuitos em farmácias. |
| Saúde | sau-2 | 22 | 37 | alta | Corrigir a tabela de pagamentos do SUS a hospitais e clínicas para cobrir o custo real do atendimento. |
| Educação | edu-1 | 22 | 35 | alta | Priorizar o método fônico na alfabetização, ensinando a criança a ligar cada som à sua letra. |
| Educação | edu-2 | 13 | 31 | alta | Chegar a 80% das crianças alfabetizadas na idade certa, com ações pactuadas com estados e municípios. |
| Segurança pública | seg-1 | 13 | 30 | alta | Criar um ministério da segurança pública, após mudança na Constituição, para coordenar ações com estados e municípios. |
| Segurança pública | seg-2 | 22 | 13 | alta | Apoiar a redução da maioridade penal de 18 para 16 anos e punir também maiores de 14 anos por crimes graves. |
| Meio ambiente | amb-1 | 22 | 50 | alta | Conceder a licença ambiental se o órgão não decidir no prazo, quando o empreendedor tiver cumprido todas as exigências. |
| Meio ambiente | amb-2 | 13 | 70 | alta | Destinar terras públicas a unidades de conservação, territórios indígenas e quilombolas ou assentamentos. |
| Infraestrutura | inf-1 | 13 | 53 | alta | Investir em aeroportos regionais e criar incentivos para a abertura de novas rotas aéreas. |
| Infraestrutura | inf-2 | 22 | 51 | alta | Investir R$ 900 bilhões em quatro anos em rodovias, ferrovias, hidrovias, portos e aeroportos. |
| Estado e instituições | est-1 | 22 | 66 | **media** | Extinguir qualquer estrutura do Estado encarregada de vigiar, rotular ou punir o que as pessoas dizem. |
| Estado e instituições | est-2 | 13 | 16 | **media** | Regular redes sociais e plataformas digitais para impedir a difusão de desinformação e de campanhas de ódio. |
| Agricultura e campo | agr-1 | 13 | 60 | **media** | Avançar na reforma agrária, assentando famílias acampadas e ampliando o acesso ao crédito para compra de terra. |
| Agricultura e campo | agr-2 | 22 | 54 | alta | Dar segurança jurídica sólida e irreversível ao direito de propriedade no campo, sem margem para relativizações. |
| Relações exteriores | ext-1 | 22 | 63 | alta | Retomar a adesão à OCDE, acabar aos poucos com o IOF sobre o câmbio e preparar uma abertura comercial. |
| Relações exteriores | ext-2 | 13 | 81 | alta | Aprofundar a aproximação com o BRICS e o Sul Global e defender a democratização do FMI e do Banco Mundial. |

Os ids têm sufixos `-1` e `-2` distribuídos de forma mista e não indicam o autor, porque podem aparecer na URL
do Duelo.

#### Itens com confiança média

- **est-1 (22):** no plano, a proposta faz parte do "Tesouraço na Censura" e parte da premissa de que o governo
  atual mantém estruturas tipo "Ministério da Verdade". Essa premissa é uma alegação contestável. O texto cego
  omite a alegação e descreve só a medida, mas o **trecho** exibido depois da revelação a contém. A revisão
  jurídica deve decidir se o trecho é mostrado inteiro ou recortado.
- **est-2 (13):** "regulação democrática" foi resumida para "regular". O trecho completo fala em impedir que as
  plataformas "difundam desinformação, acolham campanhas de ódio e outras formas de comunicação nocivas para
  a democracia". É tema polarizado e faz par direto com est-1, então a redação precisa ser revisada junto.
- **agr-1 (13):** "crédito fundiário" virou "crédito para compra de terra", que é o conceito do instrumento.
  Os editores devem confirmar que a simplificação está correta.

### 5. Propostas excluídas por aparecerem nos dois planos ("ambos")

Não entram no teste porque os dois lados defendem a mesma coisa, e a escolha não diria nada. As páginas são as
do PDF ou impressas.

| Proposta comum | 13 (pág.) | 22 (pág.) |
|---|---|---|
| Prontuário eletrônico único do paciente | 35 | 25-26 |
| IA para organizar filas e agendamento no SUS | 35, 38 | 26 |
| Usar capacidade da rede privada para exames e cirurgias do SUS | 37 | 37 |
| Telessaúde e teleconsulta | 35 | 38 |
| Escola em tempo integral | 31 | 35 |
| Internet nas escolas | 32 | 24, 35 |
| Ampliar a oferta de creches (a parte comum; o voucher do 22 é distintivo) | 31 | 21 |
| Produção nacional de fertilizantes | 63 | 32, 54 |
| Biocombustíveis e combustível sustentável de aviação | 63, 67-68 | 53, 55 |
| Seguro rural | 62 | 31, 54 |
| Regularização fundiária rural | 60 | 54 |
| Zerar desmatamento (líquido até 2030 × ilegal até 2029): metas parecidas | 70 | 58 |
| Satélite e IA contra crimes ambientais | 72 | 58 |
| Pagamento por serviços ambientais | 72 | 55, 57 |
| Agregar valor a minerais críticos no país | 52 | 55-56 |
| Asfixia financeira do crime organizado | 27 | 13 |
| Retomar territórios dominados pelo crime | 27 | 47 |
| Monitorar eletronicamente agressores de mulheres | 21 | 14, 19 |
| Saúde da mulher (prevenção, endometriose) | 38 | 21 |
| Diagnóstico e cuidado do autismo (TEA) | 39 | 39 |
| Transporte sobre trilhos e ônibus elétricos | 46 | 51 |
| Universalizar água e esgoto | 46 | 47 |
| Defesa Civil e obras contra desastres | 47 | 52 |
| Concessões e PPPs em infraestrutura | 53 | 50 |
| Armazenamento de energia em baterias | 65 | 53 |
| Defesa cibernética | 79 | 57 |
| Controle de gastos com apostas on-line (abordagens diferentes, mas próximas) | 49 | 33 |

### 6. Riscos editoriais e jurídicos (para a revisão)

1. **Adivinhação pelo conteúdo.** Tirar nomes não torna o conteúdo neutro. Quem acompanha política deve
   reconhecer alguns itens, como a maioridade penal, a escala 6x1, o BRICS e a OCDE. Isso é inerente a
   propostas reais. Não inventamos nem suavizamos nada para esconder a autoria.
2. **Efeito de incumbência.** Alguns itens do 13 vêm de políticas em curso. A redação evitou "manter" e
   "continuar" quando possível.
3. **Assimetria de escala.** O inf-2 tem valor (R$ 900 bilhões) e o inf-1 não tem, porque é assim nos planos.
   Pode influenciar a escolha. A revisão pode trocar o par de infraestrutura.
4. **Alegações embutidas nos trechos.** Os trechos são citações literais e alguns contêm críticas ao
   adversário ou alegações contestáveis (ver est-1). A UI deve apresentá-los como **citação do documento**,
   com aspas e link, nunca como afirmação do Sintonia.
5. **Autoria só depois da escolha.** `autor`, `fonte.titulo` e `fonte.trecho` revelam o candidato. Antes da
   escolha, a UI deve mostrar apenas `texto` e o tema.
6. **Documento pode mudar.** Candidaturas podem substituir o plano no TSE. Reconfirme antes de publicar e
   atualize `acessadoEm`.
7. **Sem enquete e LGPD.** Não exibir agregados de escolhas de usuários (Lei 9.504/97, art. 33, §5º, e
   ARCHITECTURE.md §1.2). As respostas não saem do navegador (§1.3).
8. **Emojis dos temas** escolhidos para serem neutros: nenhuma estrela, bandeira ou cor partidária.
9. **Escopo:** só os programas registrados. Falas de campanha, debates e entrevistas posteriores não foram
   consideradas.

### 7. Notas de integração

- `PROPOSTAS` tem 24 itens, `TEMAS` tem 12 e há também `TEMA_POR_ID`, `PROPOSTA_POR_ID` e `DOCUMENTOS`
  (metadados das fontes primárias, para a página `/metodologia`).
- `embaralhar(seed, lista?)` usa Fisher–Yates com mulberry32. A seed pode ser número ou texto.
- `rodadas(seed)` devolve 12 pares `{ tema, opcoes: [Proposta, Proposta] }` e sorteia a ordem dos temas e o
  lado de cada proposta.
- `validarPropostas()` é a checagem editorial automática e pode ser usada num teste do Vitest.
