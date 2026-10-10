# Sintonia: arquitetura e especificação

> **Sintonia** é um produto viral e apartidário para o 2º turno das eleições de 2026 (25/10/2026).
> Tem duas frentes: **Apuração ao vivo**, o carro-chefe, com detalhe por estado, município, zona e seção, e o
> **Teste Cego**, em que a pessoa diz o quanto concorda com afirmações tiradas dos planos de governo, sem saber de quem são.
> Há também um **Admin** que simula a noite da apuração inteira com a estrutura real do país.

Este documento é o contrato entre as partes. Todo código novo segue o que está aqui. Em caso de dúvida, a
regra é **neutralidade, precisão dos números e beleza, nesta ordem**.

---

## 1. Regras inegociáveis (eleitorais, LGPD e neutralidade)

1. **Neutralidade visual e textual.**
   - **Cores dos candidatos (decisão do dono do produto, out/2026):** Presidente com cores de identificação —
     **Lula em vermelho** (`cor: 'vermelho'`) e **Flávio Bolsonaro em azul** (`cor: 'azul'`). Disputas de governador
     e a simulação com nomes ocultos (`status.anonimizado`) usam cores neutras pela **ordem do número na urna**:
     menor número = slot `a` (turquesa), maior = slot `b` (âmbar).
     - Fonte única: `CORES_IDENTIDADE` em `src/shared/constants.ts` (e `corCandidato`/`aplicarCores` em
       `src/shared/cores.ts`); o gerador grava as cores no `meta.json` e o adaptador do TSE as reaplica.
     - `anonimizarRace` troca vermelho/azul por `a`/`b` pela ordem (vermelho ao lado de "Candidato A" diria quem é).
     - Componentes usam sempre a cor que vem dos dados (`corSlot(c.cor)`, `slotDe(race, i)`, `brilhoDe(race)`),
       nunca a posição nem classe fixa. Governador nunca herda vermelho/azul (o mesmo número muda de partido por UF).
     - Teste Cego: nenhuma cor de candidato antes da revelação.
     - Partidos (cargos do 1º turno): PT no mesmo vermelho de Lula, PL no mesmo azul de Flávio; os demais em tons
       que não se confundem com eles, nem com turquesa/âmbar nem com o violeta da marca (`partidos.ts`).
   - Textos de eventos são descritivos ("Com 63,2% das seções, X passa à frente"). Nada de adjetivos,
     torcida, "vitória esmagadora" etc.
   - Fotos: só as fotos oficiais do TSE, com o mesmo tamanho e tratamento para todos, sem edição.
     Na simulação anonimizada, nunca mostre foto; use o monograma (iniciais) com a cor do slot.
2. **Sem enquetes.** Nunca exiba números agregados de preferência de usuários (Lei 9.504/97, art. 33,
   §5º). O Teste Cego é individual e o Duelo compara só duas pessoas.
3. **LGPD.** Opinião política é dado sensível. As respostas do Teste Cego **nunca** saem do navegador:
   não há POST, não há log e não há analytics com a resposta. O Duelo carrega as respostas codificadas na
   própria URL.
4. **Simulação sempre sinalizada.** Quando `LiveStatus.simulacao === true`, o app mostra uma faixa
   "SIMULAÇÃO · dados fictícios" visível em toda página de apuração, e as imagens de compartilhamento
   levam a marca "SIMULAÇÃO".
5. **Sem deepfake e sem propaganda paga.** Nenhuma imagem gerada de candidato. Os espaços de anúncio
   (`<AdSlot/>`) aceitam só anunciantes não políticos.
6. **Fonte.** Dados reais vêm do TSE (resultados.tse.jus.br) e do IBGE (malhas). Cite as fontes na
   página `/metodologia`.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| App (SPA) | React 19, Vite 6, TypeScript 5.9, Tailwind 3.4, Framer Motion 12, React Router 6.30, TanStack Query 5, d3-geo/d3-shape/d3-scale |
| Servidor | Hono 4 em Node (`@hono/node-server`), bundle com esbuild → `dist-server/main.js` |
| Motor | TypeScript isomórfico (`src/engine`): roda no servidor **e** no navegador (Web Worker, build demo) |
| Testes | Vitest (`npm test`), Playwright (screenshots e QA visual, Chromium em `/opt/pw-browsers`) |
| Fontes | `@fontsource-variable/inter` (texto e números tabulares), `@fontsource-variable/bricolage-grotesque` (display), JetBrains Mono (códigos e BU) |

Alias de import: `@/` → `src/`. **Não instale pacotes novos**: tudo de que precisamos já está no `package.json`.
Se for indispensável, justifique no relatório final.

### Modos de build

- `npm run dev`: Vite (5173) com proxy `/api` → servidor Hono (8787, `tsx watch`).
- `npm run build && npm start`: o servidor serve `dist/` (SPA) + API, numa porta só (`PORT`, padrão 8787).
- `npm run build:demo`: **site 100% estático** em `dist-demo/` com `base: './'`, `HashRouter` e o motor
  num Web Worker (`src/app/data/local.ts`). É o preview publicado como Artifact. Precisa funcionar
  servido de qualquer subcaminho, então use **sempre caminhos relativos** para dados
  (`./data/...`, `./geo/...`), nunca `/data/...`. Use o helper `assetUrl(path)` de `src/app/lib/assets.ts`.

---

## 3. Mapa de diretórios e responsabilidade

```
src/shared/      Contratos isomórficos: types.ts, dataset.ts, api.ts, constants.ts, calc.ts, format.ts
src/engine/      Motor de simulação + Controller (máquina de estados do admin). Isomórfico.
src/tse/         Adaptador do feed oficial do TSE → mesmos snapshots do motor. Isomórfico (fetch).
src/server/      Servidor Hono: API pública, admin (auth), cache, OG images, estáticos + meta tags.
src/app/
  data/          client.ts (seleção), hooks.ts (React Query), http.ts, local.ts + worker.ts (demo)
  lib/           utilitários de UI (assets.ts, cn.ts, useTheme.ts, share.ts…)
  ui/            Primitivos do design system (Button, Card, Tabs, Sheet, Tooltip, NumberRoll…)
  components/
    layout/      AppShell (header, faixa de simulação, aviso, rodapé)
    apuracao/    Componentes de dados eleitorais (mapas, barras, gráfico, mosaico, BU…)
    teste/       Componentes do Teste Cego
  pages/         Uma página por arquivo (ver router.tsx)
  content/       Conteúdo editorial (afirmações do Teste Cego; `propostas.ts` = formato antigo, só para links velhos)
scripts/data/    Pipeline de dados (TSE + IBGE → public/data, public/geo)
scripts/preview/ Screenshots/vídeo com Playwright
public/data/     Dataset compilado (commitado)
public/geo/      Geometrias projetadas (commitadas)
```

---

## 4. Dados reais (pipeline: `scripts/data`)

### 4.1 Feed oficial do TSE (descoberto e verificado)

Base: `https://resultados.tse.jus.br/oficial`. A config geral está em `comum/config/ele-c.json`.

| Item | Código |
|---|---|
| Ciclo | `ele2026` |
| Pleito 1º turno | `3220` (04/10/2026) |
| Pleito 2º turno | `3221` (25/10/2026) |
| Eleição federal 1º turno (Presidente) | `6257` → 2º turno `6258` |
| Eleição estadual 1º turno (Governador = cargo 3) | `6259` → 2º turno `6260` |
| Cargo Presidente | `1` (arquivos `c0001`) · Governador `3` (`c0003`) |

Arquivos usados (todos JSON):

- `ele2026/6257/config/mun-e006257-cm.json`: municípios por UF com código TSE (`cd`), código IBGE
  (`cdi`), nome (`nm`, CAIXA ALTA), capital (`c: 's'|'n'`) e zonas (`z`). Inclui `zz` (exterior).
- `ele2026/arquivo-urna/3220/config/{uf}/{uf}-p003220-cs.json`: **todas as seções** por
  município → zona → seção (`ns`). Seções com `nsp` estão agregadas a outra seção e não contam.
  Seções sem `da`/`ha` não foram instaladas. O total de seções ativas deve bater com `s.ts` do arquivo `u`.
- `ele2026/6257/dados/{uf}/{uf}-e006257-ab.json`: por município, seções (`s.ts`), eleitorado (`e.te`),
  comparecimento (`e.c`) e abstenção (`e.a`).
- `ele2026/6257/dados/{uf}/{uf}{cdmun}-c0001-e006257-u.json`: **resultado do 1º turno para Presidente
  por município**. Candidatos ficam em `carg[0].agr[].par[].cand[]` (`n` = número, `vap` = votos), e os
  votos em `v`: `vb` (brancos), `tvn` (nulos), `vv` (válidos), `vnom` (nominais).
- `ele2026/6259/dados/{uf}/{uf}{cdmun}-c0003-e006259-u.json`: idem para Governador (só nas 7 UFs com
  2º turno).
- `ele2026/6258/dados/{uf|br}/{uf|br}-c0001-e006258-u.json`: arquivo do **2º turno**, hoje zerado e
  com os candidatos (Lula 13 × Flávio Bolsonaro 22, vices em `vs`). Será preenchido ao vivo em 25/10.

Totais oficiais do 1º turno (Presidente, Brasil + exterior), usados para conferência:
499.248 seções · eleitorado 158.745.502 · comparecimento 125.275.835 · válidos 119.300.788 ·
brancos 2.300.798 · nulos 3.674.249 · Flávio Bolsonaro 56.104.503 (47,03%) · Lula 53.879.538 (45,16%).

2º turno de Governador (TSE, `st: "2º turno"`): AC (Mailza Assis PP 11 × Alan Rick Republicanos 10),
AM (Omar Aziz PSD 55 × Profª Maria do Carmo PL 22), DF (Celina Leão PP 11 × Leandro Grass PT 13),
ES (Lorenzo Pazolini Republicanos 10 × Ricardo Ferraço MDB 15), RJ (Douglas Ruas PL 22 × Eduardo Paes
PSD 55), RN (Allyson União 44 × Cadu de Lula PT 13), TO (Profª Dorinha União 44 × Vicentinho Júnior
PSDB 45). **Leia sempre do feed**, não digite à mão. Os nomes de exibição saem do `nmu` em título.

Cuidados: baixe com concorrência limitada (≤ 12) e retry; guarde o bruto em `data-raw/`, que é ignorado
pelo git. Os arquivos de município são ~5.570 + exterior.

### 4.2 Geometrias (IBGE)

`https://servicodados.ibge.gov.br/api/v3/malhas/...` (GeoJSON/TopoJSON): UFs do Brasil e municípios por UF.
Projete com d3-geo, simplifique (topojson-simplify) e grave **paths SVG já projetados** com precisão de
1 casa decimal (`GeoBrasil`, `GeoUf` em `src/shared/dataset.ts`). Metas de tamanho: `br.json` < 120 KB e
`mun/{uf}.json` < 450 KB cada (MG é o maior). As chaves dos municípios são o código IBGE de 7 dígitos,
que liga ao `cdi` do TSE.

### 4.3 Saída

`public/data/meta.json` (`DatasetMeta`), `public/data/uf/{uf}.json` (`UfDataset`, 28 arquivos com `zz`),
`public/geo/br.json`, `public/geo/mun/{uf}.json`. Os tipos ficam em `src/shared/dataset.ts`.
O nome de exibição sai com `titleCasePt`.

---

## 5. Motor de simulação (`src/engine`)

Determinístico: **mesmo dataset + mesmo `ScenarioConfig` (seed incluída) ⇒ mesmos números em qualquer
máquina**. Por isso o servidor (e cada instância serverless) e o navegador produzem resultados idênticos
sem banco de dados. Só a config precisa ser compartilhada.

### 5.1 Construção do modelo (`buildModel(dataset, cenario)`, alvo < 1,5 s no Node para ~499 mil seções)

Use typed arrays (Struct of Arrays) para as seções: `mun`, `zona`, `numero`, `aptos`, `comp`, `v0`, `v1`,
`brancos`, `nulos`, `chegada` (ms após 17:00), mais `g0`, `g1`, `gb`, `gn` para Governador nas UFs com
2º turno.

1. **Aptos por seção**: o eleitorado do município é distribuído entre as seções com ruído lognormal
   (σ ≈ 0,15) e reescalado para somar exatamente o eleitorado (maior resto).
2. **Comparecimento**: a taxa do 1º turno no município + `comparecimentoDelta` + ruído por seção
   (σ ≈ 2 p.p.), limitada a [35%, 98%].
3. **Brancos e nulos**: as taxas do 1º turno no município × `brancosFator` e `nulosFator`, com ruído.
4. **Preferência no 2º turno**, por município, para o candidato 0:
   - `p1 = v0/(v0+v1)`, considerando só os dois finalistas no 1º turno;
   - `o = outros/válidos` (outros = válidos − v0 − v1);
   - a transferência local para o candidato 0 é `clamp(transferenciaOutros + 0,35·(p1 − 0,5), 0,05, 0,95)`;
   - `p = (v0 + o_t·outros) / válidos`;
   - a geografia é aplicada em logit: `L = μ + intensidadeRegional·(logit(p) − μ)`;
   - a calibragem nacional busca por bisseção um deslocamento δ tal que a soma ponderada pelos válidos
     esperados resulte em `alvoPres`. O `ufVies[uf]`, em p.p., vira um deslocamento extra em logit nas
     seções daquela UF. O alvo é aplicado *antes* do viés; o admin entende que o viés move o resultado
     nacional.
   - Governador funciona igual, com `t1gov` e o alvo `alvoGov[race]`, por corrida.
5. **Por seção**: ruído em logit (`ruidoSecao`) → votos via aproximação normal da binomial,
   arredondados, com `v0 + v1 + brancos + nulos = comp` exatamente.
6. **Chegada (totalização)**: minutos após 17:00 seguem uma lognormal com mediana por região conforme
   `ordemRegional`. No modo `realista` as medianas são S 34, SE 38, CO 42, NE 50, N 62, EX 75 minutos.
   - Fatores: capital 0,95; município pequeno (< 8 mil aptos) 0,85; interior do Norte 1,35.
   - Há ainda um efeito de zona: um deslocamento compartilhado por zona (σ ≈ 12%), que cria "rajadas"
     realistas.
   - σ da lognormal ≈ 0,55; 0,3% de seções retardatárias entre +2 h e +5 h; `ritmo` multiplica tudo
     (rápido 0,75, normal 1, lento 1,4); `ufAtraso` soma minutos por UF.
   - Calibração esperada no `normal`: ~1% às 17:05, ~50% por volta de 17:50–18:05, ~90% às 18:50,
     ~99% às 19:45, 100% às 22:00.
   - O padrão realista gera **virada** quando o Nordeste, que chega mais tarde, favorece quem está
     atrás no começo. Isso é bom para o produto e é determinístico.
7. **Exterior (ZZ)** só vota para Presidente.

### 5.2 Snapshots

- Ordene as seções por `chegada` (argsort uma vez). Para um `simNow`, totalizadas = prefixo com
  chegada ≤ `simNow − 17:00`.
- Agregação em **uma passada O(N)** por instante, com cache por (cenário, bucket de 1 s de `simNow`).
  O resultado é preenchido em arrays por município e por zona; UF, região e Brasil são somas.
- A **série** (`SeriePoint[]`) e os **eventos** (`FeedEvent[]`) da apuração completa são pré-calculados
  na construção (um ponto a cada 0,25% de seções ou 1 min simulado) e fatiados por `simNow`. Eventos:
  - início;
  - marcos de 1, 5, 10, 25, 50, 75, 90, 95, 99 e 100%;
  - mudança de liderança nacional ("virada" quando já houver > 5% apurado);
  - liderança e virada por UF (só as relevantes, no máximo 1 por UF a cada 10 min simulados);
  - UF encerrada;
  - "matematicamente eleito", Brasil e cada governador.

  Os textos são neutros, em pt-BR.
- `Summary.eleito`: se `votosLider − votosSegundo > eleitoradoNãoTotalizado` ou se a apuração estiver
  encerrada (100%).
- `Restante.necessarioParaVirar = (déficit/validosEstimados + 1)/2 × 100`, limitado a 0–100 (ou null).
- Corridas de 1º turno (`pres-t1`, `gov-xx-t1`) vêm direto do dataset (100% totalizadas, candidatos
  = 2 finalistas + "Outros"), sem seções individuais: o mosaico mostra tudo totalizado com a cor do
  vencedor do município. Zona e seção do 1º turno retornam o agregado do município, ou 404 coerente.

### 5.3 Controller (`src/engine/controller.ts`)

`SimulationController`, isomórfico, é usado pelo servidor **e** pelo worker do demo:

- guarda o `AdminState` (relógio, cenário, fonte, aviso, congelado, versão) e aplica `AdminCommand`;
- `status(wallNow): LiveStatus` e `simNow(wallNow)` segundo `ClockState`;
- quando `congelado`, os números param em `congeladoEm`;
- fase: `pre` se `simNow` < `INICIO_APURACAO` (ou fonte `pre`), `apurando`, `encerrada` (100% + 5 min);
- expõe `nacional/uf/municipio/zona/secao(race, …, wallNow)` delegando ao motor com cache;
- expõe `presets()`, `marcos()` e `fimPrevisto()`;
- serializa e restaura o estado (`toJSON` / `fromJSON`); o servidor persiste em `.server-state/admin.json`.

**Presets simétricos** (neutralidade):
- "Equilíbrio realista" (alvo 50,4 para o candidato 0, padrão realista);
- "Equilíbrio realista (espelhado)" (49,6);
- "Folgada para A" (54) e "Folgada para B" (46);
- "Empate técnico" (50,05, ruído baixo);
- "Virada tardia" (ordem norte-primeiro invertida);
- "Noite lenta (instabilidade)" (ritmo lento + atrasos);
- "Uniforme" (intensidade 0).

**Estado padrão do produto**:
- produção: `fonte = 'pre'` até o admin mudar;
- demo: `fonte = 'simulacao'`, relógio rodando a 20× a partir de 16:59:30.

---

## 6. Servidor (`src/server`)

- Hono + `@hono/node-server`. Entrada em `src/server/main.ts`. Porta pelo env `PORT`, padrão 8787.
- Dataset lido de `DATA_DIR` (padrão `public/data`, ou `dist/data` em produção).
- O motor é construído na subida (log com tempo) e reconstruído quando o cenário muda, sem bloquear:
  enquanto reconstrói, continua servindo o anterior.
- **Cache HTTP** pensado para CDN: `status` com `s-maxage=1`; snapshots com `s-maxage=2,
  stale-while-revalidate=10`; ETag por (versão, bucket de `simNow`). Comprime com gzip/br.
- **Admin**:
  - senha no env `ADMIN_PASSWORD`; em dev, se ausente, o padrão é `sintonia` com aviso no log;
  - cookie de sessão HMAC (`ADMIN_SECRET`), httpOnly, SameSite=Strict;
  - rate limit no login;
  - todos os comandos são validados com zod.
- **Fonte `tse`**: polling do feed oficial (`src/tse`) no intervalo configurado, com cache e backoff,
  mapeado para os mesmos snapshots. Detalhe por município sob demanda, com cache de 60 s. Mosaico e
  seção na fonte TSE, se indisponíveis: o mosaico fica vazio e a seção dá 404 coerente.
- **OG image**: `/api/og/apuracao.png` (satori + resvg) com o placar atual e a faixa "SIMULAÇÃO"
  quando for o caso. Na fase 3, uma imagem por tipo de página (município, seção, candidato, cargos, governadores,
  curiosidades, cenários, Teste): ver §11.7.
- **Meta tags**: ao servir `index.html`, injeta `og:title`, `og:description` e `og:image` conforme a
  rota (`<!--app-meta-->`).
- `GET /healthz`.

---

## 7. Linguagem visual

- **Tema escuro como padrão** ("noite da apuração"), com tema claro completo. Todas as cores vêm dos
  tokens de `src/app/styles.css`: `bg`, `surface`, `surface-2`, `surface-3`, `fg`, `fg-muted`,
  `fg-subtle`, `line`, `brand`, `brand-2`, `cand-a*`, `cand-b*`, `cand-vermelho*`, `cand-azul*`, `cand-outros`,
  `pending`, `ok`, `alert`, `partido-1..10`. **Nunca use hex solto em componente.** Para bordas, use a classe `border-line`.
- **Tipografia**:
  - display Bricolage Grotesque (títulos e números grandes);
  - Inter para texto;
  - **todo número em `.num`** (tabular);
  - JetBrains Mono para códigos de seção e zona e para o BU.
- **Forma**: cards `rounded-2xl bg-surface border border-line shadow-card`; espaçamentos generosos;
  grid de 12 colunas no desktop; **mobile-first** (360–430 px é o principal: tráfego vindo do WhatsApp).
- **Movimento**: Framer Motion com transições curtas (150–400 ms, spring suave).
  - Números rolam (`NumberRoll`) quando mudam.
  - Barras animam a largura.
  - Mudanças no mapa fazem fade de cor.
  - Respeite `prefers-reduced-motion`.
- **Mapa**: coroplético pelo líder, com intensidade por margem em 4 buckets (<5, 5–15, 15–30, ≥30 p.p.).
  - Território sem seção apurada usa `pending`.
  - Hover/toque mostra um tooltip com o placar; clique navega.
  - Modos: Vencedor · Margem · % apurado · Comparecimento · Variação vs 1º turno.
    "% apurado" e "Comparecimento" usam escala neutra (cinza, `fillEscalaNeutra`), nunca a marca: violeta ao lado
    do azul de Flávio Bolsonaro seria lido como cor de candidato.
  - O DF precisa de alvo de toque acessível (callout).
  - Alternativa: cartograma de blocos (tile map) das 27 UFs.
- **Acessibilidade**: contraste AA, foco visível, `aria-live="polite"` no placar principal e textos
  alternativos nos mapas (tabela equivalente).
- **Performance**: LCP < 2,5 s em 4G; JS inicial < 200 KB gzip; páginas pesadas (mapas) com lazy
  loading; o mosaico de seções em `<canvas>` quando houver mais de 2.000 seções.

---

## 8. Páginas

| Rota | Conteúdo |
|---|---|
| `/` | Hero, contagem regressiva para 17h de 25/10, chamada para a Apuração e para o Teste Cego, placar ao vivo quando apurando |
| `/apuracao?race=pres` | Placar nacional (duelo), % de seções, mapa por UF, gráfico da apuração (série), feed de eventos, regiões, ranking de UFs, comparecimento/brancos/nulos/abstenção, "para virar" |
| `/governadores` | As 7 disputas de governador lado a lado |
| `/apuracao/:uf?race=` | Placar da UF, mapa por município, tabela de municípios (busca, ordenação), série, eventos |
| `/apuracao/:uf/:cod?race=&zona=` | Placar do município, comparação com o 1º turno, zonas, **mosaico de seções** e lista de seções da zona |
| `/apuracao/:uf/:cod/:zona/:secao?race=` | **Boletim de Urna** da seção (cartão visual) |
| `/apuracao/consulta` | "Consulte sua seção": UF → município → zona → seção |
| `/teste`, `/teste/resultado`, `/duelo/:codigo` | Teste Cego |
| `/admin` | Painel de simulação (relógio, cenário, UFs, aviso, fonte, monitor, preview) |
| `/metodologia`, `/privacidade`, `/sobre` | Conteúdo institucional |
| `/curiosidades?tema=&fato=` | Fatos verificáveis do 1º turno, com cartão de compartilhar por fato (§11.3) |
| `/cenarios?c=` | "E se…? Monte seu cenário": calculadora do 2º turno a partir do 1º turno oficial (§11.4) |
| `/candidato/:sqcand`, `/senado`, `/camara`, `/assembleias/:uf` | Cargos do 1º turno e fichas (§10.2) |
| `/tv` | Modo TV (fora do AppShell) |
| `/embed/placar`, `/embed/mapa`, `/embed/uf` | Widgets para incorporar em outros sites (§11.6) |
| `/kit` | Vitrine do design system (QA visual) |

Antes de 25/10 17h, com fonte `pre`, as páginas de apuração mostram o **1º turno real** (`pres-t1`) com
a contagem regressiva. Esse conteúdo já gera tráfego antes da eleição.

---

## 9. QA

- `npm run typecheck`, `npm test` e `npm run build` precisam passar.
- QA visual com Playwright, em `scripts/preview/`: screenshots mobile (390×844) e desktop (1440×900),
  em tema escuro e claro, nos instantes 0%, ~35%, ~70% e 100% da simulação. Abra as imagens e
  corrija o que estiver feio, desalinhado, cortado ou com overflow horizontal.
- Os números precisam fechar:
  - soma dos municípios = UF;
  - soma das UFs + ZZ = Brasil;
  - % válidos dos dois somam 100,00.


---

## 10. Fase 2: dados completos do TSE e recursos inspirados no mercado

### 10.1 Fontes adicionais

| Fonte | Arquivo |
|---|---|
| Dados abertos (`https://cdn.tse.jus.br/estatistica/sead/odsele/`) | `votacao_secao/votacao_secao_2026_{BR,UF}.zip` (votos por seção, 1º turno), `detalhe_votacao_secao/detalhe_votacao_secao_2026.zip`, `eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip`, `perfil_eleitorado/perfil_eleitorado_2026.zip`, `consulta_cand/consulta_cand_2026.zip`, `bem_candidato/bem_candidato_2026.zip`, `votacao_partido_munzona/…`, `votacao_candidato_munzona/…` |
| Feed de resultados | `ele2026/{ele}/fotos/{uf\|br}/{sqcand}.jpeg` (fotos oficiais) e `ele2026/6259/dados/{uf}/{uf}-c000{3,5,6,7,8}-e006259-u.json` (governador, senador e deputados no 1º turno) |

Os formatos ficam em `src/shared/dataset.ts`, seção "FASE 2":
- `SecaoUfDataset`, com colunas Uint16 em base64 (`src/shared/u16.ts`);
- `LocaisUfDataset`, `PerfilUfDataset`, `MunicipiosBr` e `GeoBrasilMunicipios`;
- `FotoPacote`, `CandidatoFicha` e `CargoDataset`.

### 10.2 Recursos

1. **1º turno real por seção.**
   - Mosaico e Boletim de Urna do 1º turno com números reais.
   - A simulação do 2º turno passa a partir da preferência REAL de cada seção no 1º turno, em vez do município
     com ruído. A transferência dos demais e a calibragem continuam as mesmas.
2. **Locais de votação.**
   - "Consulte sua seção" mostra a escola e o endereço, com link para mapa (OpenStreetMap ou Google Maps em
     nova aba).
   - O município mostra os seções agrupados por local de votação.
3. **Mapa nacional por município.**
   - Toggle "Estados | Municípios" no mapa do Brasil, com os 5.571 municípios.
   - Desenho em `<canvas>` para performance.
   - `GET /api/apuracao/:race/br/municipios` (`MunicipiosNacionalSnapshot`).
   - Mostra "à frente em N municípios".
4. **Fotos oficiais.**
   - Aparecem no Placar, nos eventos, nas regiões, nos cartões de governador e na ficha do candidato.
   - Nunca aparecem quando anonimizado.
5. **Reveja a noite.** Régua do tempo pública (play/pause/arrastar) para ver o mapa e o placar em qualquer
   instante passado. Todas as rotas de apuração aceitam `?t=` (contrato `Instante`); nunca há instante futuro.
6. **Busca rápida** (Ctrl+K / ícone de busca): municípios, UFs, candidatos e "zona/seção".
7. **Modo TV** (`/tv`): tela cheia com mapa grande, placar e ticker, rodando por UFs; feito para transmissão.
8. **Pessoas agora:** `LiveStatus.pessoasAgora`, só no servidor. No demo fica oculto; nunca inventamos número.
9. **1º turno de todos os cargos:**
   - `/senado` (2 vagas por UF em 2026);
   - `/camara` (513 cadeiras, com hemiciclo por partido; PT e PL nas cores de Lula e Flávio, demais partidos em
     tons que não se confundem com elas; bancadas por tamanho, nunca por espectro);
   - `/assembleias/:uf`;
   - governadores eleitos no 1º turno;
   - ficha `/candidato/:sqcand`: dados públicos do TSE, patrimônio declarado e resultado.
10. **Patrocínio:**
    - slot discreto "Oferecido por", só para anunciante não político;
    - configurado no admin (`AdminCommand 'patrocinio'`, `LiveStatus.patrocinio`);
    - desligado por padrão.

---

## 11. Fase 3: viral no X

Quem chega pelo X está no celular, quase sempre no navegador embutido do app do X (WKWebView/Android WebView) e, no
demo, dentro de um iframe de outra origem (Artifact do claude.ai). Cada tela precisa causar impacto em 3 segundos,
gerar **imagem + texto + link** bonitos e neutros para postar, e funcionar sem `navigator.share` e sem download.

Regras que valem para tudo abaixo: número simulado → "SIMULAÇÃO · dados fictícios" na imagem e no texto; nunca foto real
com número simulado; com `status.anonimizado`, nunca nome real na simulação; nada de enquete, palpite agregado ou ranking
de usuários; as respostas do Teste Cego nunca saem do aparelho (exceto o link de Duelo, com aviso, depois do `#`).

### 11.1 Kit de compartilhamento (`src/app/components/share`, `src/app/lib/share.ts`)

- **Formatos** (`DIMENSOES_CARTAO`): `x` 1200×675 (16:9), `feed` 1080×1350 (4:5), `story` 1080×1920 (9:16). Os miolos
  leem `useCartao()` (`k` = escala em relação ao 16:9; `retrato`).
- **`CartaoBase`**: logo, sobrancelha, título, rodapé com domínio + rota (ou um texto quando o domínio não é apresentável),
  data/hora de Brasília e fonte. `simulado` → selo no topo, faixa no rodapé e marca-d'água diagonal (sobrevive a
  recortes). `brilho` pelas cores que vêm dos dados (`brilhoDe(race)`). Sem blur nem animação (o PNG sai do DOM).
- **`CompartilharSheet` / `BotaoCompartilhar`**: prévia, seletor X/Feed/Story, "Postar no X" (link de verdade para
  `x.com/intent/post`, texto sem a URL, `url` e hashtags à parte, peso do X ≤ 280), "Compartilhar…" (Web Share com o
  PNG), WhatsApp, Baixar/Salvar, Copiar link, Copiar texto. O PNG é gerado em segundo plano assim que o sheet abre (o
  Safari recusa `navigator.share` depois de uma espera); texto e imagem ficam congelados do momento da abertura.
- **Navegador embutido e iframe** (`navegadorEmbutido()`, `emIframe()`): sem Web Share de arquivo ou com download
  bloqueado, "Salvar imagem" abre um modal com a imagem ("toque e segure para salvar") + copiar texto. `NotAllowedError`
  no Web Share cai no mesmo modal. Esc/Tab só afetam a janela do topo (`ui/overlay.ts`).
- **`png.ts`**: html-to-image com só os subconjuntos de fonte usados no cartão (cache por sessão), duas passadas no WebKit,
  sem a textura de ruído (`data-sem-png`: o arquivo dobraria de tamanho). 16:9 ≈ 0,3–0,45 MB; story ≈ 0,7–1 MB.
- **Textos** (`textos.ts` e os `textos*.ts` de cada página): só fatos e números, ordem da urna, sem adjetivos nem "vai
  ganhar", ≤ 220 de peso antes do link, "[SIMULAÇÃO]" quando houver número simulado, `#Eleições2026` + uma temática.
- **URL pública** (`VITE_SITE_URL`, no build): `urlAbsoluta`, `hostExibicao`/`siteExibicao`, o código de incorporação e
  o rodapé das imagens passam a apontar para o site público. Sem ela vale o endereço da página — no demo, o do iframe,
  que não abre fora do claude.ai. Terminada em `#`, gera rotas de HashRouter (`https://exemplo.org/sintonia/#/teste`).

### 11.2 Cartões por tela

| Tela | Cartão | Dado | Foto |
|---|---|---|---|
| Nacional, UF, município | placar (`apuracao/ShareCard`), com 16:9 de números gigantes, diferença e % apurado | 2º turno (simulado ou TSE) ou 1º turno oficial | só com dado real e nome real |
| Seção | "Como votou a minha seção" (`cartoes/Secao`): recibo do 2º turno (carimbo de simulação) + 1º turno oficial | misto | nunca |
| Município | "Minha cidade no 1º turno" (`cartoes/MunicipioT1`) | oficial | oficial (nunca com nomes ocultos) |
| Candidato | ficha (`cartoes/Candidato`) | oficial | oficial |
| Senado, Câmara, Assembleias | mini hemiciclo + maiores bancadas; Senado com `?uf=` mostra os 2 eleitos | oficial | Senado por UF |
| Governadores | as 7 disputas (antes do dia 25, o 1º turno) | idem | nunca |
| Feed e "Reveja a noite" | "momento" com o placar daquele instante; o link leva `?t=` | idem placar | idem placar |
| Teste Cego | Desafio (padrão, sem resultado), Meu resultado (escolha explícita, com aviso), Duelo (placar entre duas pessoas), convite | respostas da pessoa | nunca |
| Curiosidades | fato (par simétrico dos finalistas) e resumo de 3 destaques | oficial | nunca |
| Cenários | cenário hipotético + premissas; marca "Cenário hipotético · não é pesquisa nem previsão" em três camadas | hipotético | nunca |
| Home | convite "Compartilhar o Sintonia" (data e contagem, sem número nem candidato) | — | — |

O cartão de cenários ajusta as premissas ao espaço (layout effect, antes da prévia e do PNG): começa com as mais
informativas (2 no 16:9, 4 no feed/story) e tira as menos informativas até nada transbordar — nunca corta uma premissa ao
meio; só se nem uma couber inteira ela vai em linha única com reticências.

### 11.3 Curiosidades (`/curiosidades`)

- Dados: `public/data/curiosidades.json` (29 fatos em 7 temas; tipos em `src/shared/curiosidades.ts`), gerado por
  `scripts/data/curiosidades.ts` (`npm run data:curiosidades`), que lê só o dataset compilado (`public/data/**`) e ABORTA
  se os totais não baterem com `meta.totaisPrimeiroTurno`, se faltar número, se título/texto passar do limite ou se
  aparecer NaN. Percentuais de `calc.ts`, números de `format.ts`. Regenere quando os dados mudarem (ex.: eleitos do AM).
- Regras editoriais: fatos dos finalistas sempre em **par** com o mesmo critério (teste confere) e palavras opinativas
  barradas ("reduto", "fraude", "vitória"…); pisos (recordes municipais só com ≥ 5.000 eleitores); **nenhuma seção
  unânime** (exporia o voto de cada eleitor e é gatilho de desinformação — removido no QA); perfil do eleitorado só com
  afirmações verdadeiras em qualquer cenário (24.547 eleitores sem gênero/idade no arquivo).
- Página: filtro `?tema=` fixo no topo, link direto `?fato=id` (rola e realça; é o link dos posts), "Fonte e critério",
  "Ver no mapa", "Como calculamos" com o JSON bruto. `DestaquesCuriosidades` na home.
- Nomes reais (dado oficial), sem foto, cores de identificação. Atenção: "Ver no mapa" leva à apuração do 1º turno, que
  durante a simulação com nomes ocultos mostra os mesmos números como "Candidato A/B" (faixa e "nome oculto" explicam).

### 11.4 Cenários (`/cenarios`, "E se…? Monte seu cenário")

- Dados: `public/data/presidente-t1.json` (12 candidatos, votos por UF + exterior), gerado por
  `scripts/data/presidente-t1.ts` (`npm run data:presidente-t1`), que confere UF a UF com o TSE e com `meta.json`.
- Lógica isomórfica (`src/shared/cenarios.ts`): cada grupo (os 10 eliminados e os brancos/nulos do 1º turno) tem três
  números — quanto escolhe um finalista, quanto disso vai para A, e quanto do resto vota branco/nulo em vez de se abster.
  Comparecimento de −10 a +10 p.p. Arredondamento por UF preservando o total e **sem desempatar os finalistas** (a
  unidade extra vai para brancos/nulos). Pontos de partida neutros: proporcional, metade para cada, todos branco/nulo.
- Link `?c=`: código versionado (base64url), validado; qualquer entrada inválida vira o ponto de partida, com aviso.
- **Divisor** (`SliderDivisao`): metáfora de "puxar" — arrastar (ou teclar) na direção de um candidato aumenta a parte
  dele. Cada metade da trilha é o território de um lado (cor suave); o preenchimento sólido vai do meio até o divisor, na
  cor de quem leva mais. O valor do `<input range>` é a posição do divisor (= parte do lado direito; seta para a direita
  dá mais ao lado direito) e o `aria-valuetext` diz as duas partes. Toque em qualquer ponto da trilha (o range nativo do
  WebKit só responde ao polegar).
- Não é pesquisa: nada é coletado nem somado; o cenário fica no aparelho (localStorage, conveniência) e só sai no link que
  a pessoa compartilha. Aviso permanente na página e marca tripla nas imagens. Sem fotos (números hipotéticos).

### 11.5 Teste Cego (motor viral)

- Escala de "Discordo totalmente" (esquerda) a "Concordo totalmente" (direita), teclas 1–5 na mesma ordem.
- Modo rápido (12 afirmações, uma por tema, `/teste?s=…&r=1`) sorteado só entre combinações equilibradas; retomada de onde
  parou; tempo restante pelo ritmo da pessoa.
- Revelação em três tempos; **nenhuma cor de candidato antes da revelação** (nem o arco de comprimento zero).
- Compartilhar: Desafio (padrão; o link é sempre `/teste`), Meu resultado (escolha explícita, aviso de dado sensível) e
  Duelo (só libera X/WhatsApp/copiar depois de "Entendi: quem abrir o link verá minhas respostas").

### 11.6 Home, navegação e widgets

- Home pensada para o celular vindo do X: na 1ª dobra, título, contagem regressiva (ou placar compacto, com selo de
  simulação) e "Faça o Teste Cego"; logo depois a busca de cidade/seção ("Campinas 33 120" leva ao boletim) e a entrada
  da apuração. Lembrete da apuração (.ics gerado no aparelho, Google, Outlook). O resto vem num chunk separado.
- Navegação: header desktop com menu "Mais"; tab bar do celular **Apuração · Teste Cego · Buscar · Sua seção · Mais**.
  **Governadores saiu da tab bar e está no "Mais"** (com Curiosidades, "E se…?", Modo TV, cargos, compartilhar,
  incorporar e institucionais). A busca rápida inclui Curiosidades e "E se…?".
- Widgets `/embed/placar`, `/embed/mapa`, `/embed/uf`: sem cabeçalho, tema pela URL (sem gravar preferência), atualização
  automática, selo SIMULAÇÃO, "via Sintonia ↗", altura avisada ao site hospedeiro por `postMessage`. O servidor libera
  `frame-ancestors *` só nessas rotas (o resto: `SAMEORIGIN`). Diálogo "Incorporar" com prévia e código.
- `manifest.webmanifest` e ícones; a cor da barra do navegador acompanha o tema desde o carregamento.

### 11.7 Imagens de prévia (OG) e meta tags (servidor)

| Rota | Conteúdo |
|---|---|
| `/api/og/apuracao.png?race=&uf=` | placar (Brasil ou UF) |
| `/api/og/municipio.png?race=&uf=&cod=` | município: 1º turno oficial antes da apuração, placar ao vivo durante |
| `/api/og/secao.png?race=&uf=&cod=&zona=&secao=` | boletim de urna (2º turno, se houver, + 1º turno oficial) e local |
| `/api/og/candidato.png?sq=` | ficha com foto oficial (candidato inexistente → 404) |
| `/api/og/senado.png`, `/camara.png`, `/assembleia.png` (`?uf=`) | hemiciclo e maiores bancadas; Senado por UF com os eleitos |
| `/api/og/governadores.png` | as 7 disputas (sempre turquesa/âmbar) |
| `/api/og/curiosidade.png?f=` | fato (ou capa com 3 destaques) |
| `/api/og/cenario.png?c=` | cenário recalculado do código validado (inválido → cartão genérico da calculadora) |
| `/api/og/teste.png` | Teste Cego (genérico; o código de um Duelo nunca é lido) |

- `summary_large_image` 1200×630 em todas as rotas; títulos e descrições neutros por rota, `og:locale`, largura/altura,
  canônico só com os parâmetros que mudam a página (`utm_*` não multiplica o cache), `twitter:site` por `TWITTER_SITE`.
- Simulação: selo e **nunca foto**; com nomes ocultos, "Candidato A/B" nos dois turnos e, no 1º turno oficial, "nome
  oculto" no lugar do partido (`partidoENumero`, `src/shared/anon.ts`). Ficha, cargos, curiosidades e cenários mantêm
  nomes reais (sem número simulado).
- Fotos WebP do TSE decodificadas em TS puro (`webp.ts`, RFC 6386) para o satori; PNG em RGB (WhatsApp ignora prévia
  pesada). Cache LRU 256 imagens / 64 MB, fila limitada (503 + `Retry-After`); dado oficial com cache longo e `v=` =
  versão do dataset. `robots.txt` libera `/api/og/` (o robô do X respeita o robots também para a imagem).
- `/cenarios?c=` e `/duelo/*` ficam fora dos buscadores (`noindex`); o código do Duelo não aparece no HTML nem no canônico.

### 11.8 Cores de identificação (decisão do dono, depois dos QAs)

Lula em vermelho e Flávio Bolsonaro em azul, com nomes reais (§1.1). Governadores e simulação com nomes ocultos seguem
em turquesa/âmbar pela ordem da urna (`anonimizarRace` neutraliza). Tokens `cand-vermelho*`/`cand-azul*` com contraste AA
nos dois temas (protegido por `src/app/lib/coresTema.test.ts`); paleta de partidos com PT = vermelho e PL = azul e os
demais otimizados contra daltonismo; mapas "% apurado" e "Comparecimento" em cinza (`fillEscalaNeutra`). Vale também
nos cartões, nas imagens de prévia, na TV e nos widgets.

### 11.9 Desempenho e limites conhecidos

- JS inicial (build de produção, gzip): entrada **165,5 kB**; com o chunk da rota de entrada pré-carregado (`/` ou
  `/teste`) ≈ **191 kB** (meta: < 200). Curiosidades, cenários, widgets e o kit de compartilhar são chunks sob demanda.
- Barras ao vivo (`VoteSplitBar`, `ApuracaoProgress`, `StatsGrid`) animam só `transform` (antes `width`/`flex-grow`, que
  faziam layout a cada quadro) e o brilho da barra de progresso usa `translateX` em vez de `background-position`. Medido
  em `/apuracao` (build demo, CPU 4× mais lenta): layout −40% (≈ 258 → 158 ms a cada 3 s) e tarefas longas −23%.
  Continuam custando: os números que rolam (`NumberRoll`), o fade de cor do mapa (`fill` no SVG) e o framer-motion
  (≈ 40 kB gzip no pacote principal).
- Worker do demo: baixa `data/uf` (2,3 MB) + `data/secao` (12 MB; ≈ 5,8 MB em gzip) ao abrir. **Não dá para adiar
  `secao` sem mudar os números**: o modelo do 2º turno usa a seção real do 1º turno (aptos, comparecimento, preferência),
  e é isso que garante números idênticos aos do servidor; montar sem ela e trocar depois faria o placar "pular". Caminho
  futuro: um pacote compacto pré-computado do modelo.
- No Artifact, "Postar no X" e "WhatsApp" abrem em nova aba: dependem de o iframe permitir pop-ups.
