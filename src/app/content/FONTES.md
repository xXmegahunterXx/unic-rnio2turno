# Teste Cego: fontes, método e revisão

> **AVISO: conteúdo sem revisão humana. NÃO PUBLICAR antes da revisão editorial e jurídica.**
> As 24 propostas em `propostas.ts` têm `revisado: false`. Isto aqui é material de pesquisa preparado por
> agente automatizado, sobre uma eleição real em andamento (2º turno em 25/10/2026). Antes de ir ao ar, uma
> pessoa da redação e uma da área jurídica precisam conferir cada item contra o documento oficial do TSE,
> aprovar a redação "cega" e só então trocar `revisado` para `true`. O tipo hoje é o literal `false`, então
> essa troca é uma mudança de código consciente.

Acesso às fontes: **09/10/2026**. Candidatos: **13, Lula (PT)** × **22, Flávio Bolsonaro (PL)**.

---

## 1. Fontes primárias

Usamos os **programas de governo registrados no TSE** pelas duas candidaturas, lidos na íntegra.

| Nº | Documento | Páginas | Cópia lida (PDF) | SHA-256 do arquivo lido |
|---|---|---|---|---|
| 13 | *Programa de Governo* (PT/PSB), registrado no TSE em 08/08/2026 | 84 | https://static.congressoemfoco.com.br/2026/08/08/attachment/2026/08/08/32ce89_programa_governo_lula_2026.pdf | `75e2dab7b9af27454a5c1a44c3bb0d7e0eaddbd1c355ccf1536f0d0be927e47b` |
| 22 | *Para o Brasil vencer o atraso: Diretrizes do Plano de Governo 2027-2030* (PL), registrado no TSE | 76 | https://static.poder360.com.br/uploads/2026/08/plano-flavio.pdf | `a65ece32fba45e2bd13ca4f799872a8e78a492e16b5375fcd0e3756f4b77e5a4` |

Página oficial do TSE que reúne os planos:
https://www.tse.jus.br/eleicoes/eleicoes-2026-content/propostas-de-governo-dos-candidatos-ao-cargo-de-presidente-da-republica-eleicoes-2026

### Por que lemos cópias publicadas pela imprensa, e não o arquivo no servidor do TSE

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

## 2. Fontes secundárias (jornalismo) usadas para conferência

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

## 3. Método

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

## 4. As 24 propostas (para a revisão; não é texto de produto)

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

### Itens com confiança média

- **est-1 (22):** no plano, a proposta faz parte do "Tesouraço na Censura" e parte da premissa de que o governo
  atual mantém estruturas tipo "Ministério da Verdade". Essa premissa é uma alegação contestável. O texto cego
  omite a alegação e descreve só a medida, mas o **trecho** exibido depois da revelação a contém. A revisão
  jurídica deve decidir se o trecho é mostrado inteiro ou recortado.
- **est-2 (13):** "regulação democrática" foi resumida para "regular". O trecho completo fala em impedir que as
  plataformas "difundam desinformação, acolham campanhas de ódio e outras formas de comunicação nocivas para
  a democracia". É tema polarizado e faz par direto com est-1, então a redação precisa ser revisada junto.
- **agr-1 (13):** "crédito fundiário" virou "crédito para compra de terra", que é o conceito do instrumento.
  Os editores devem confirmar que a simplificação está correta.

## 5. Propostas excluídas por aparecerem nos dois planos ("ambos")

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

## 6. Riscos editoriais e jurídicos (para a revisão)

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

## 7. Notas de integração

- `PROPOSTAS` tem 24 itens, `TEMAS` tem 12 e há também `TEMA_POR_ID`, `PROPOSTA_POR_ID` e `DOCUMENTOS`
  (metadados das fontes primárias, para a página `/metodologia`).
- `embaralhar(seed, lista?)` usa Fisher–Yates com mulberry32. A seed pode ser número ou texto.
- `rodadas(seed)` devolve 12 pares `{ tema, opcoes: [Proposta, Proposta] }` e sorteia a ordem dos temas e o
  lado de cada proposta.
- `validarPropostas()` é a checagem editorial automática e pode ser usada num teste do Vitest.
