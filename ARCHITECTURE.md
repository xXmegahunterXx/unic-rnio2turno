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
5. **Sem deepfake e sem propaganda paga.** Nenhuma imagem gerada de candidato. Os espaços de anúncio aceitam só
   anunciantes não políticos (declaração obrigatória no cadastro), sempre rotulados ("Publicidade", "Patrocinado",
   "Oferecido por"), com link `rel="sponsored noopener noreferrer"` em nova aba, nunca dentro de placar/resultado nem
   colados a foto, nome ou número de candidato, sem pop-up, intersticial, som ou animação piscante. Exceção prevista,
   hoje DESLIGADA (revisão final, out/2026): a imagem do PLACAR e o cartão do palpite com nomes poderiam levar
   "Oferecimento: <marca>" numa faixa própria no pé — uma chave só, `OFERECIMENTO_COM_CANDIDATOS` em
   `src/shared/oferecimento.ts` (servidor OG, ShareCard do app, cartões do palpite e os textos de /anuncie e /sobre a
   seguem). Ligar é decisão do dono com o advogado: a imagem circula sem o site em volta, com foto e número de candidato.
   Métricas de anúncio só agregadas, sem cookie, sem IP e sem dado pessoal (§10.2, item 10). Nada de peça FIXA na tela
   (presa ao cabeçalho ou ao rodapé) passando por cima ou colada a resultado ao rolar: a faixa do topo rola com a página
   em todas as larguras, e a barra do rodapé (celular) e a pílula do chat se recolhem diante de qualquer bloco
   `[data-sem-anuncio-fixo]` (placar, gráfico da corrida, participação, 1º × 2º turno, mapas, tabela de estados, ficha
   do candidato inteira, que nem tem a barra) — e, como rede de segurança, diante de qualquer elemento com cor de
   candidato (`cand-*`, `--cand-*` ou `[data-candidato]`) na faixa de baixo da tela. Imagem animada (APNG, WebP animado,
   SVG com animação) é recusada. Categorias recusadas além do político-eleitoral: apostas/bets, cassino e mercados de
   previsão; bebida alcoólica fica fora do ar em 25/10 até as 17h (`anuncios-categorias.ts`). Interruptor geral "Tirar
   todos do ar" (painel e `deploy/painel.sh anuncios-suspender`): nenhum anúncio em ~5 s, nada apagado.
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
- `ele2026/6259/dados/{uf}/{uf}{cdmun}-c0003-e006259-u.json`: idem para Governador (só nas UFs com
  2º turno, `UFS_GOV_2T`).
- `ele2026/6258/dados/{uf|br}/{uf|br}-c0001-e006258-u.json`: arquivo do **2º turno**, hoje zerado e
  com os candidatos (Lula 13 × Flávio Bolsonaro 22, vices em `vs`). Será preenchido ao vivo em 25/10.

Totais oficiais do 1º turno (Presidente, Brasil + exterior), usados para conferência:
499.248 seções · eleitorado 158.745.502 · comparecimento 125.275.835 · válidos 119.300.788 ·
brancos 2.300.798 · nulos 3.674.249 · Flávio Bolsonaro 56.104.503 (47,03%) · Lula 53.879.538 (45,16%).

2º turno de Governador (TSE, `st: "2º turno"`): AC (Mailza Assis PP 11 × Alan Rick Republicanos 10),
AM (Omar Aziz PSD 55 × Profª Maria do Carmo PL 22), DF (Celina Leão PP 11 × Leandro Grass PT 13),
ES (Lorenzo Pazolini Republicanos 10 × Ricardo Ferraço MDB 15), RN (Allyson União 44 × Cadu de Lula PT 13),
TO (Profª Dorinha União 44 × Vicentinho Júnior PSDB 45). **Leia sempre do feed**, não digite à mão. Os nomes de
exibição saem do `nmu` em título.

**Quadro do 2º turno de Governador: `UFS_GOV_2T` (`src/shared/constants.ts`) é a fonte única** — pipeline, motor,
servidor, OG e textos derivam dela (`src/shared/gov2t.ts` monta quantidade, siglas e nomes; nunca número fixo em
texto). Decisões:
- **RJ fora (12/10/2026).** O TSE retotalizou Governador do RJ em **10/10/2026 15:09:50** (geração de
  `ele2026/6259/dados/rj/rj-c0003-e006259-u.json`): os 274.411 votos do nº 10, antes "anulados sub judice", viraram
  nulos técnicos e **Douglas Ruas (PL, 22) foi "Eleito" no 1º turno com 50,88%** (Eduardo Paes, PSD 55, "Não eleito",
  44,16%). `comum/config/ele-c.json` lista a eleição 6260 só para AC, AM, DF, ES e RN; o 6260 do RJ dá 404; o
  `consulta_cand` de 11/10 traz "ELEITO". O RJ passa aos governadores eleitos no 1º turno (21); `meta.json` não tem
  mais `gov-rj`/`gov-rj-t1` (14 corridas); links antigos com `gov-rj` caem em Presidente.
- **TO mantido.** Em 12/10/2026 o arquivo do 1º turno de TO ainda marca os dois finalistas como "2º turno" (resultado
  oficial publicado), embora o 6260 de TO dê 404 e TO não esteja na lista da 6260. Se o TSE confirmar o contrário,
  basta tirar TO de `UFS_GOV_2T` e rodar o pipeline (README › Dados › "Mudança no quadro do 2º turno"); os testes
  derivam o quadro da constante.

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
- fase: `pre` se `simNow` < `INICIO_APURACAO` (ou fonte `pre`), `apurando`, `encerrada` (100% + 5 min); na fonte `tse`
  o motor diz `apurando` depois das 17h e o servidor publica `encerrada` no `/api/status` quando o TSE conclui
  Presidente e nenhuma disputa de governador segue apurando (`tseTudoEncerrado`, ensaio geral de 12/10/2026);
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
  stale-while-revalidate=10`; ETag por (versão, bucket de `simNow`). Comprime com gzip/br. Na fonte `tse`: ETag pela
  MARCA dos números (hash do conteúdo da corrida, muda no instante em que o TSE publica), `s-maxage=1,
  stale-while-revalidate=1, stale-if-error=60`, e o placar nacional com `?d=<marca atual>` com `s-maxage=60` (§12.2).
- **Cabeçalho só da borda** (leva 3, I04; `CC_BORDA` em `app.ts`, `CC_OG_BORDA` em `og-rotas.ts`, `http-cache.ts`): além
  do `Cache-Control` do navegador (igual ao de antes, com o `s-maxage` como rede de segurança), cada rota manda
  `Cloudflare-CDN-Cache-Control` — status `max-age=1, stale-while-revalidate=2, stale-if-error=600`; Brasil e UF ao vivo
  `max-age=1, stale-while-revalidate=1, stale-if-error=600`; município, zona, seção e mapa por município na fonte TSE
  `max-age=10, stale-while-revalidate=10, stale-if-error=600`; `?d=<marca>` `max-age=300, stale-if-error=600`; meta, 1º
  turno, histórico e imagens OG com o TTL de antes + `stale-if-error`. `CDN_CC=0` volta ao formato antigo (reinício). As
  regras da Cloudflare têm fonte única em `deploy/cloudflare.mjs` (4 regras `sintonia_*`, modo "Cache-Control se
  presente, senão não guarda" — nunca TTL fixo), conferidas contra o DEPLOY §5.3 por `scripts/cloudflare.test.ts`.
- **HTML na borda** (I05): só com a chave `html-borda` ligada (padrão desligada; plano: 24/10, 12h, depois do ensaio) o
  HTML ganha `Cloudflare-CDN-Cache-Control: max-age=15, stale-while-revalidate=15, stale-if-error=86400`; o navegador
  continua com `no-cache`. Nunca em `/admin`, `/embed/*`, 404 ou erro; `/duelo/*` e `/relatorio` saem com
  `Cloudflare-CDN-Cache-Control: no-store` e ficam fora da regra 4 da Cloudflare (o código do Duelo vai no caminho).
- **Admin**:
  - senha no env `ADMIN_PASSWORD`; em dev, se ausente, o padrão é `sintonia` com aviso no log;
  - cookie de sessão HMAC (`ADMIN_SECRET`), httpOnly, SameSite=Strict;
  - rate limit no login;
  - todos os comandos são validados com zod.
- **Fonte `tse`**: polling do feed oficial (`src/tse`) no intervalo configurado, com cache e backoff,
  mapeado para os mesmos snapshots; o resumo Brasil de Presidente tem laço próprio, mais curto (§12.2). Detalhe por município sob demanda, com cache de 60 s. Mosaico e
  seção na fonte TSE, se indisponíveis: o mosaico fica vazio e a seção dá 404 coerente.
- **OG image**: `/api/og/apuracao.png` (satori + resvg) com o placar atual e a faixa "SIMULAÇÃO"
  quando for o caso. Na fase 3, uma imagem por tipo de página (município, seção, candidato, cargos, governadores,
  curiosidades, cenários, Teste): ver §11.7.
- **Meta tags**: ao servir `index.html`, injeta `og:title`, `og:description` e `og:image` conforme a
  rota (`<!--app-meta-->`).
- **Operação**: `GET /healthz` (vivo; usado pelo healthcheck do Docker), `GET /readyz` (pronto: dataset, modelo e build
  do app presentes; 503 durante o encerramento), `GET /api/versao` (commit/data do build, também no cabeçalho
  `x-sintonia-versao`), `GET /sitemap.xml` e `GET /robots.txt` (gerados com `PUBLIC_URL`).
  Leva 3: `GET /api/saude-noite` (`saude-noite.ts`; sempre 200 e `no-store`, `{noite:'ok'|'atencao', motivo?}` — servidor
  encerrando, TSE limitando ou parado, placar nacional parado > 3 min, troca automática atrasada, 5xx > 1% ou p99 > 1 s
  por 2 min, mais o que os alertas conferem; é o endereço do monitor externo, palavra-chave `"noite":"ok"`).
  `/sitemap.xml` virou índice de 4 arquivos (`sitemap.ts`: páginas, 5.757 municípios e cidades do exterior, 1.922 fichas,
  Senado/Câmara por UF), montados na subida, `lastmod` real, cache de 1 h. `robots.txt`: `Allow` para `/api/og/`,
  `/api/status`, `/api/meta` e `/api/apuracao/` antes do `Disallow: /api/`; `X-Robots-Tag: noindex` em toda `/api/*`
  menos `/api/og/`; borda guarda o robots por 1 h.
- **Anúncios** (`anuncios.ts`, §10.2 item 10): `/api/status` com as imagens por `/api/anuncio/img?h=<hash>` e o link
  por `/api/anuncio/ir/<id>`; clique contado + 302; `POST /api/anuncio/evento` (impressão visível); relatório no admin.
- **Chat ao vivo** (`chat.ts`, §11.11): `GET /api/chat` com `s-maxage=1` (mesma URL para todos); POSTs do próprio site;
  admin em `/api/admin/chat`; tudo em memória (nada em disco, nada de IP).
- **Crescimento** (`crescimento.ts`, §11.12): `POST /api/audiencia` (sinal agregado do app), `GET /api/divulgacao` (redes
  do Sintonia + audiência medida, se o painel ligar), `POST /api/anuncie/lead` ("Quero anunciar"); admin em
  `/api/admin/{audiencia,divulgacao,leads}`; `STATE_DIR/audiencia.json`, `leads.json` e `divulgacao.json`.
- **Produção** (`NODE_ENV=production`): troca automática `pre` → `tse` às 17h de 25/10 (`troca-auto.ts`), simulação
  travada sem `ALLOW_SIMULACAO=1`, CSP/HSTS, CSRF no admin, logs em JSON e `/kit` = 404. Ver §12.

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
  - Modos: Vencedor · Margem · % apurado · Comparecimento · Desde o 1º turno ("quem cresceu mais onde": variação de cada
    finalista em p.p. dos válidos e a diferença entre as duas, na cor de quem cresceu mais; legenda simétrica — §11.14).
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
| `/governadores` | As disputas de governador do 2º turno (`UFS_GOV_2T`) lado a lado + governadores eleitos no 1º turno |
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
| `/ao-vivo` | Sala da apuração em tela cheia: chat ao vivo moderado (§11.11) |
| `/live?layout=&fundo=&tema=&race=&posicao=` | Modo streamer: fonte de navegador do OBS/Streamlabs (fora do AppShell, fundo transparente; §11.10) |
| `/streamers` | "Use o Sintonia na sua live": layouts com prévia, URL para copiar, passo a passo do OBS, regras e contato (§11.10) |
| `/palpite`, `/palpite#<código>` | Palpite do 2º turno: a pessoa crava o % dos válidos de cada finalista até as 17h de 25/10; depois, a diferença para o resultado oficial (§11.13) |
| `/embed/placar`, `/embed/mapa`, `/embed/uf` | Widgets para incorporar em outros sites (§11.6) |
| `/kit` | Vitrine do design system (QA visual): só no `npm run dev` e no build demo; em produção, 404 |

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
10. **Anúncios** (vários anunciantes; substitui o patrocínio único). Contrato em `src/shared/anuncios.ts`:
    - **Formatos**: `topo` (faixa abaixo do cabeçalho; master tem prioridade; no celular, título inteiro em até 2 linhas),
      `rodape` (barra fixa do celular, pode ser fechada), `nativo` (cartão "Patrocinado" entre seções), `teste` ("Teste Cego
      oferecido por", só depois de revelar e longe do cartão do resultado), `tv` ("Oferecimento" na barra do topo do Modo TV;
      em retrato, faixa acima do letreiro) e `compartilhamento` ("Oferecimento: <marca>" no pé SÓ das imagens OG genéricas:
      Teste Cego, calculadora sem código, capa das curiosidades e o convite do Palpite; no app, os cartões do Palpite (§11.13);
      e — `OFERECIMENTO_NO_PLACAR`, §11.14 — os cartões do PLACAR (Brasil/UF/município, servidor e app), abaixo da marca do
      Sintonia; nunca seção, ficha, eleitos, bancadas, governadores, fato isolado ou cenário). `escolherAnuncio` (módulo próprio `anuncios-escolha.ts`, o único que entra no
      JS inicial do site; reexportado pelo contrato) faz a rotação ponderada pelo `peso`, fixa por semente, com o master
      vencendo em `FORMATOS_MASTER_PRIORITARIO` (`topo`, `tv`, `live`, `compartilhamento`) e a cota **Reserva** (empresas
      do grupo do dono, sempre cota apoio) só entrando onde nenhum pago está disponível — depois do `evitar`, então num
      cartão em que todos os pagos já apareceram a reserva preenche o lugar.
    - **Posição (regra dura)**: nada dentro de placar/resultado nem encostado em foto, nome ou número de candidato. A barra
      fixa do rodapé só entra depois da 1ª rolagem e fica escondida enquanto um bloco marcado com `data-sem-anuncio-fixo`
      (placares, cartão do confronto, PreHero, retratos/avatares, barras de votos, BU, governadores, `FotoOficial`, placar
      dos cenários) estiver na faixa de baixo da tela (`anuncios/faixaLivre.ts`); bloco novo com resultado/candidato leva o
      atributo na raiz.
    - **Nada político-eleitoral**: além da declaração, `validaAnuncio` recusa (`anuncios-politica.ts`) nomes de candidatos
      (os do dataset, passados pelo motor, + "Lula"/"Bolsonaro"), termos eleitorais, número de urna pedido como voto,
      siglas de partido em maiúsculas e destinos de governo/Legislativo/Judiciário/MP (publicidade institucional), de
      partido ou com nome de candidato. Logo depois, as **categorias sensíveis** (`anuncios-categorias.ts`, pelo texto e
      pelo domínio): apostas/bets, cassino e mercados de previsão (Polymarket, Kalshi e afins) recusados; bebida alcoólica
      gera aviso no painel (`avisoCategoria`) e é recusada se a janela do anúncio cruzar 25/10 de 0h às 17h (Brasília).
    - **Imagens (contrato v2, anunciantes v2)**: a logo aparece na **proporção natural**, sem o quadrado branco. O painel
      mede cada imagem UMA vez, no envio (`admin/analiseLogo.ts`: recorta as margens vazias na resolução original, grava
      PNG — nunca JPEG com transparência — e calcula o contraste da silhueta contra os fundos dos dois temas) e grava o
      `AjusteImagem` no anúncio (`logoAjuste`, `logoEscuroAjuste`, `imagemAjuste`: proporção, placa clara/escura/nenhuma
      por tema, origem auto/manual, `comFundo`); o site só obedece (`LogoMarca`, `apresentacaoLogo`). `logoEscuro` é a
      versão da logo para fundo escuro (tema escuro, TV/live no escuro e imagens). Interruptor `LOGO_NATURAL`
      (`src/shared/anuncios-flags.ts`, módulo folha reexportado por `anuncios.ts`: as peças do site importam de lá sem
      levar a validação para o JS do visitante): `false` = a placa clara quadrada de antes. Logos gravadas antes do ajuste: botão
      **"Ajustar agora"** no painel (o recorte é feito no navegador — o servidor não decodifica alfa de WebP) com o
      comando `anuncio-logo`, que troca SÓ a logo e os ajustes (ausente mantém, `null` apaga). **Sem animação:**
      `imagemAnimada` recusa APNG, WebP animado e SVG com animação no salvar; num estado restaurado sai só a imagem animada
      (o anúncio fica, com aviso no log); o painel sempre redesenha a imagem (o 1º quadro).
    - **Admin** (seção Anunciantes, pensada para 390 px): lista com situação (no ar · agendado · pausado · encerrado),
      formatos, cota, peso e métricas (totais, 48 h por hora); formulário com marca, id (`idDaMarca`, fixo depois de
      criado), título, texto, botão, link https, logo e peça (redimensionadas no navegador), formatos, cota, peso, ativo,
      início/fim (Brasília) e a declaração obrigatória "não político-eleitoral"; relatório de entrega com CSV; contato da
      página `/anuncie`. `PreviaAnuncio` (admin) é a prévia simples; o ponto de troca pelos componentes do site está
      comentado nele.
    - **Motor** (`AdminState.anuncios` ≤ 24, `AdminState.anuncie`, `AdminState.anunciosSuspensos`): comandos
      `anuncio-salvar` (valida com `validaAnuncio`; substitui pelo id; imagem — logo, versão escura ou peça — que volta do
      painel como URL do servidor mantém a que o anúncio já tem; **master sobreposto** — dois masters ativos, sem reserva,
      num formato prioritário e com janelas que se cruzam, `conflitoMaster` — é recusado, também ao reativar),
      `anuncio-remover`, `anuncio-ativo`, `anuncio-logo`, `anuncios-suspensao` (interruptor geral: guarda `{ desde,
      motivo }`; o status sai com `anuncios: []`, `patrocinio: null` e `anunciosSuspensos: true`; voltar devolve exatamente
      o que estava; pausar/ativar continua valendo) e `anuncie-contato`. `LiveStatus.anuncios` = anúncios no ar pelo relógio REAL (`anuncioNoAr`;
      memorizado até o próximo início/fim) como `AnuncioPublico` (link com UTM `link`, `destino` = domínio; no demo as
      imagens seguem em data URI). LEGADO: o comando `patrocinio` vira/atualiza o anúncio master `patrocinio` (formatos
      topo + nativo + tv, título = texto cortado em 60, botão "Saiba mais"); um estado salvo com o patrocínio antigo é
      migrado uma vez; `LiveStatus.patrocinio` é derivado do master (senão do 1º pago, por último da reserva) com `topo`;
      o título do legado é cortado na última palavra, sem "…". `state()` copia o estado
      compartilhando as strings (as imagens não são duplicadas a cada consulta).
    - **Servidor** (`src/server/anuncios.ts`): imagens (logo, versão escura e peça) pelo hash do conteúdo
      (`/api/anuncio/img`, cache imutável, SVG em sandbox; nenhum data URI no `/api/status`; o painel também recebe URLs,
      e o servidor troca pelo conteúdo ao salvar e no `anuncio-logo`; corpo do comando até 1,5 MB: logo + versão escura +
      peça); `/api/anuncio/ir/:id?f=` conta o
      clique e redireciona com UTM (id desconhecido → `/`; só conta GET de navegação vinda do site — `Sec-Fetch-Dest`
      documento, `Sec-Fetch-Site` same-origin/none — e só formatos com link: `topo`, `rodape`, `nativo`, `teste`);
      `POST /api/anuncio/evento` conta a impressão visível (só do próprio site: `Origin`/`Sec-Fetch-Site`, sem os dois
      → 204 sem contar; anúncio no ar com aquele formato; `compartilhamento` não é medido; aceita o `text/plain` do
      `sendBeacon`). UTM: `utm_medium` = formato, exceto o do Teste Cego, que sai `conteudo` (não revela que a visita fez
      o teste). Métricas em memória por anúncio × formato × hora (**14 dias** no detalhe), totais por dia de Brasília (para
      sempre) e desde sempre, gravadas de forma atômica em `STATE_DIR/anuncios-metricas.json` (`v: 1` com `versao: 2` — o `v: 1` é de propósito:
      a versão anterior do servidor lê o arquivo numa volta de versão; o arquivo da versão anterior também é lido) a cada
      60 s e no encerramento; `GET /api/admin/anuncios/metricas?horas=<1–336>` (padrão 48) devolve também `entregue`
      (desde o início dos anúncios com meta), `esgotadoEm` e `alcance` (`MetricasAnunciosResposta`).
    - **Contagem honesta e LGPD**: a **pessoa** é a rede (hash com sal por processo: IPv4 inteiro, IPv6 pelo prefixo /64 —
      trocar de endereço dentro da faixa não zera nada) + um hash de 32 bits do navegador (User-Agent), com **teto por
      rede** numa janela de 5 min (400 navegadores num IPv4, 8 num /64; acima disso, ou com mais de 300 mil pares na
      janela, a pessoa nova conta pela rede — quem troca de navegador para inflar não passa do teto) e, dentro disso,
      **teto por rede em cada anúncio** (`TETO_PESSOAS_ANUNCIO`: 100 num IPv4, 8 num /64, em 5 min — um script num só IPv4
      trocando o User-Agent soma no máximo ~101 impressões por formato a cada 5 min a um anúncio, em vez de ~400, e não
      esgota sozinho uma meta). Rede no teto vira uma linha de aviso no log por janela (só a contagem). Usada em memória
      como número de 53 bits para descartar repetições (impressão: mesma pessoa, anúncio e formato em 5 min; clique:
      30 min; até 600 mil chaves por geração) e limitar abusos por rede (3.000 eventos/min num IPv4, 300 num /64; cliques
      1.000/100; com mais de 100 mil redes no mesmo minuto, a rede nova passa sem esse limite em vez de perder a
      impressão); nunca é gravada. Robôs de prévia/busca não contam. Interruptor `ANUNCIO_PESSOA=0` no ambiente: conta pela
      rede, como antes (60 eventos/min por rede).
    - **Alcance** (`src/server/alcance.ts`): pessoas diferentes por ESTIMATIVA (HyperLogLog, p = 12, erro ≈ 1,6%; hash =
      8 bytes do sha256 da chave de pessoa), um esboço por anúncio e dia de Brasília e um da noite (`NOITE_ELEICAO`,
      25/10 17h → 26/10 2h). O sal muda a cada processo, então cada processo grava o seu segmento e a estimativa é o
      MAIOR entre os segmentos (conservadora; com mais de um segmento no período — reinício no meio — a página do
      relatório avisa "estimativa conservadora"); campanha = união dos dias a partir do início; segmentos parados há mais
      de 14 dias são podados. Nada de pessoa é recuperável dos registradores.
    - **Meta de impressões** (`limiteImpressoes`, 1.000 a 50 milhões, exige início; nunca vai ao site): a cada 15 s (e
      depois de cada comando do painel) o servidor compara o entregue desde o início com a meta; ao atingir, o anúncio
      sai do site (`anunciosParaSite` filtra; a geração dos esgotados entra na chave do cache do `/api/status`). As
      impressões que ainda chegarem contam (bônus); aumentar ou tirar a meta faz voltar; a reserva preenche o espaço que
      vagar. As imagens de compartilhamento não são medidas e não contam para a meta (seguem com o anúncio).
    - **Relatório por link privado** (`src/server/relatorios.ts`, página `/relatorio#k=<token>`): o painel gera o link
      (token de 128 bits mostrado uma vez; `STATE_DIR/relatorios.json` guarda só o sha256, permissão 600; até 5 ativos por
      anúncio e 100 no total; revogável); `POST /api/anuncie/relatorio { k }` devolve `RelatorioAnunciante`
      (`src/shared/relatorio.ts`: horas × formato dos 14 dias, dias anteriores — tudo a partir do início da campanha,
      como a meta e o alcance —, alcance da campanha e da noite, meta só com "mostrar meta"; remover o anúncio revoga os
      links dele), só do próprio site, 20/min por rede, `no-store`, `noindex`, `no-referrer`, 30 s em memória.
      `/relatorio` fica fora dos buscadores (`noindex` e `Disallow` no robots) e da navegação do site, sem anúncio.
      Interruptor `RELATORIOS=0`: a rota dá 404 e o painel esconde os links.
    - **Imagens OG**: com anúncio `compartilhamento` no ar, faixa própria no pé, centralizada e separada por linha, nos
      cartões genéricos (`CARTOES_COM_OFERECIMENTO` em `og-oferecimento.ts`) e no placar (og-placar.ts, só com
      `OFERECIMENTO_NO_PLACAR`): **logo ou nome** — com logo utilizável (PNG/JPEG com ajuste; a versão escura, se houver,
      e a placa do tema escuro), "Oferecimento" + a logo de 26 px numa faixa de 44 px (ícone leva também o nome);
      senão, "Oferecimento: <marca>" só em texto, na faixa de 32 px. Interruptor `OG_LOGO_OFERECIMENTO`. Nesses cartões o
      conjunto de anunciantes (com uma assinatura barata da logo) entra na chave de cache e no `&v=` das meta tags
      (`tagOferecimento`/`imagemComOferecimento`): trocar o anunciante ou a logo gera imagens novas; as demais imagens
      não mudam com o anunciante. Suspensão geral: nenhuma faixa.
    - **Site (anunciantes v2)**: escolha justa por página (`nucleo.ts`, `escolhaDaPagina`): o 1º cartão nativo evita o
      anunciante do topo (se sobrar outro) e nunca usa o da barra fixa; do 2º em diante o do topo pode entrar; nunca o
      mesmo anunciante em dois cartões; o "Anuncie no Sintonia" só quando não sobra nenhum anúncio (no máximo 1 por
      página) e nunca com a suspensão geral. A faixa do topo tem 60 px no celular e 64 px no desktop, com o logotipo no
      lugar do nome em texto (o `aria-label` continua "Publicidade de <marca>…"). Logo com placa (o contraste pediu):
      imagem com 76% da altura do espaço, folga de 12% × 20%, e a placa abraça a imagem quando a largura máxima a limita
      (nunca uma pílula grande com a marca miúda). Barra do rodapé com logotipo ou logo larga (proporção > 1,35): só a
      seta no lugar do botão com texto (o texto segue no `aria-label`) e título longo em até 3 linhas.
      Prévias num tema fixo (painel, vitrine das imagens): `TemaLocal` (contexto do `pecas.tsx`, lido por `useTemaLogo`)
      junto com `data-tema-local="claro|escuro"` no elemento, que troca os tokens de cor só ali (`styles.css`). Rede de
      segurança da barra do rodapé: `SELETOR_CANDIDATO` em `faixaLivre.ts` (`[class*="cand-"]`, `[style*="--cand-"]`,
      `[data-candidato]`, fora de `[data-sem-anuncio-fixo]`; acima de 2.000 elementos, a barra some na página); o
      `DataTable` marca `data-sem-anuncio-fixo` por padrão. Página `/relatorio` (fora do AppShell, chunk próprio, sem
      anúncio): `src/app/pages/relatorio/RelatorioPage.tsx`, contas só de `src/shared/relatorio.ts`.

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
- **Leva 3 (I08, I20, I10, I26)**: links compartilhados levam `utm_source` (`urlCompartilhada(url, canal, agora?)`:
  whatsapp, x, telegram, copiar, story; agenda, embed, tv, live, sintonia nos outros pontos) e, no X/Telegram durante a
  apuração, `h=HHMM` (hora de Brasília em passos de 5 min, para o cartão de prévia não sair velho); os parâmetros entram
  antes do `#` (o código do Duelo fica intacto) e `PARAMS_ORIGEM` (`utm_*`, `h`, `via`) fica fora do canônico, da chave
  do cache do HTML e da URL da imagem. **No celular o WhatsApp é o principal** (`prefereWhatsapp`): "Enviar no WhatsApp"
  com o PNG pelo Web Share (ou o wa.me), depois "Status / Stories" (9:16) e "Postar no X"; a caixa de texto mostra a
  mensagem do WhatsApp (sem hashtags, com "Acompanhe seção por seção:" nas páginas de apuração), que é também o que
  "Copiar texto" copia; no computador nada muda. Depois de "Copiado", "Siga o Sintonia" (`variante="linha"`, chunk
  próprio). **Carimbo do print** (`CarimboPrint`): "sintonia2026.com.br · 63,21% apurado · 18:47:12 (Brasília)" dentro
  dos mapas (abaixo do desenho no celular e no mapa da UF; pílula no canto sudoeste do Brasil a partir de 640 px;
  empilhado no cartograma) e no pé do placar, com % e hora do MESMO resumo da tela (nunca do relógio do aparelho);
  simulação = selo e sem hora; chave `carimbo-print`. **Painel → Postar** (`SecaoPostar`, `admin/postar.ts`): cartões
  prontos (convite sem nome, audiência por marco de 10/50/100 mil, até 12 momentos nacionais) com texto ≤ 220, link com
  origem e imagens 16:9/9:16 do servidor; nomes só a partir das 17h de 25/10 pelo relógio do SERVIDOR (antes, só na
  simulação com nomes ocultos). Imagem de audiência genérica `/api/og/audiencia.png` (`og-audiencia.ts`; número do
  servidor arredondado para baixo ao marco, `?m=` só baixa, `?m=0` = convite sem número; obedece ao `contador-publico`).

### 11.2 Cartões por tela

| Tela | Cartão | Dado | Foto |
|---|---|---|---|
| Nacional, UF, município | placar (`apuracao/ShareCard`): retratos oficiais GRANDES lado a lado com o "×" (como o topo da Home), números gigantes, barra dos 50%, % apurado e diferença; "Oferecimento" no pé (§11.14) | 2º turno (simulado ou TSE) ou 1º turno oficial | só com dado real e nome real (Presidente: `presidente-hd`); senão monograma no mesmo quadro |
| Seção | "Como votou a minha seção" (`cartoes/Secao`): recibo do 2º turno (carimbo de simulação) + 1º turno oficial | misto | nunca |
| Município | "Minha cidade no 1º turno" (`cartoes/MunicipioT1`) | oficial | oficial (nunca com nomes ocultos) |
| Candidato | ficha (`cartoes/Candidato`) | oficial | oficial |
| Senado, Câmara, Assembleias | mini hemiciclo + maiores bancadas; Senado com `?uf=` mostra os 2 eleitos | oficial | Senado por UF |
| Governadores | as disputas do 2º turno, uma por UF de `UFS_GOV_2T` (antes do dia 25, o 1º turno) | idem | nunca |
| Feed e "Reveja a noite" | "momento" com o placar daquele instante; o link leva `?t=` | idem placar | idem placar |
| Teste Cego | Desafio (padrão, sem resultado), Meu resultado (escolha explícita, com aviso), Duelo (placar entre duas pessoas), convite | respostas da pessoa | nunca |
| Curiosidades | fato (par simétrico dos finalistas) e resumo de 3 destaques | oficial | nunca |
| Cenários | cenário hipotético + premissas; marca "Cenário hipotético · não é pesquisa nem previsão" em três camadas | hipotético | nunca |
| Home | convite "Compartilhar o Sintonia" (data e contagem, sem número nem candidato) | — | — |
| Palpite | "Meu palpite" e "Errei por Z p.p."/"Na mosca" (`palpite/CartaoPalpite`, §11.13), com a faixa "Oferecimento" | palpite da pessoa (sem placar oficial) | nunca |

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
| `/api/og/apuracao.png?race=&uf=[&formato=]` | placar (Brasil ou UF), retratos grandes (og-placar.ts); `formato` = `og` (1200×630, padrão), `x` (1200×675), `feed` (1080×1350), `story` (1080×1920) |
| `/api/og/municipio.png?race=&uf=&cod=[&formato=]` | município: 1º turno oficial antes da apuração, placar ao vivo durante (mesmo layout e formatos) |
| `/api/og/secao.png?race=&uf=&cod=&zona=&secao=` | boletim de urna (2º turno, se houver, + 1º turno oficial) e local |
| `/api/og/candidato.png?sq=` | ficha com foto oficial (candidato inexistente → 404) |
| `/api/og/senado.png`, `/camara.png`, `/assembleia.png` (`?uf=`) | hemiciclo e maiores bancadas; Senado por UF com os eleitos |
| `/api/og/governadores.png` | as disputas do 2º turno, título com a quantidade derivada (sempre turquesa/âmbar) |
| `/api/og/curiosidade.png?f=` | fato (ou capa com 3 destaques) |
| `/api/og/cenario.png?c=` | cenário recalculado do código validado (inválido → cartão genérico da calculadora) |
| `/api/og/teste.png` | Teste Cego (genérico; o código de um Duelo nunca é lido) |
| `/api/og/palpite.png` | Palpite (genérico, sem candidato; nunca lê palpite: ele vai depois do `#` do link) — `og-palpite.ts` |

- `summary_large_image` 1200×630 em todas as rotas; títulos e descrições neutros por rota, `og:locale`, largura/altura,
  canônico só com os parâmetros que mudam a página (`utm_*` não multiplica o cache), `twitter:site` por `TWITTER_SITE`.
- Simulação: selo e **nunca foto**; com nomes ocultos, "Candidato A/B" nos dois turnos e, no 1º turno oficial, "nome
  oculto" no lugar do partido (`partidoENumero`, `src/shared/anon.ts`). Ficha, cargos, curiosidades e cenários mantêm
  nomes reais (sem número simulado).
- Fotos WebP do TSE decodificadas em TS puro (`webp.ts`, RFC 6386) para o satori; PNG em RGB (WhatsApp ignora prévia
  pesada). Cache LRU 256 imagens / 64 MB, fila limitada (503 + `Retry-After`); dado oficial com cache longo e `v=` =
  versão do dataset. `robots.txt` libera `/api/og/` (o robô do X respeita o robots também para a imagem).
- `/cenarios?c=` e `/duelo/*` ficam fora dos buscadores (`noindex`); o código do Duelo não aparece no HTML nem no canônico.
- **Leva 3 (I07)**: títulos por fase com fonte única em `src/shared/titulos.ts` (servidor e aba do app dizem o mesmo:
  "Eleição 2026 em Campinas (SP): 1º turno e apuração do 2º turno" → "Apuração ao vivo em Campinas (SP) · 2º turno 2026"
  → "Resultado do 2º turno 2026 em Campinas (SP)"; `?race=…-t1` = "1º turno 2026 …: resultado oficial"); nomes só na
  descrição, na ordem da urna. Placar da fonte TSE na descrição durante a noite (`meta-placar.ts`): lê SÓ o cache do
  TseSource (nunca baixa nada, renova no máximo a cada 10 s, cópia vale 15 min; erro = sem placar); chave `meta-placar`.
  **Dia da votação (0h–17h de 25/10, `diaDeVotacao`)**: nenhuma descrição leva nome, número ou percentual de candidato
  (apuração, município, ficha, curiosidades, cenários) e as imagens que mostram candidato (apuração — inclusive `/`,
  `/live` e `/tv` —, município, seção, governadores, ficha, curiosidades, cenários) viram a prévia genérica
  `/api/og/audiencia.png?m=0` ("Eleições 2026 · 2º turno / Apuração ao vivo"). Às 17h tudo volta.

### 11.8 Cores de identificação (decisão do dono, depois dos QAs)

Lula em vermelho e Flávio Bolsonaro em azul, com nomes reais (§1.1). Governadores e simulação com nomes ocultos seguem
em turquesa/âmbar pela ordem da urna (`anonimizarRace` neutraliza). Tokens `cand-vermelho*`/`cand-azul*` com contraste AA
nos dois temas (protegido por `src/app/lib/coresTema.test.ts`); paleta de partidos com PT = vermelho e PL = azul e os
demais otimizados contra daltonismo; mapas "% apurado" e "Comparecimento" em cinza (`fillEscalaNeutra`). Vale também
nos cartões, nas imagens de prévia, na TV e nos widgets.

### 11.9 Desempenho e limites conhecidos

- JS inicial (build de produção, gzip -9, integração da leva 3 em 17/10/2026): entrada **173,7 kB**; com os chunks da
  rota de entrada pré-carregados `/` ≈ **199,85 kB** (no limite: a próxima coisa no JS inicial precisa sair de outro
  lugar), `/teste` ≈ **198,1 kB** (meta: < 200) e `/apuracao` ≈ **298,7 kB** (ff63fb7: 172,6 / 198,1 / 197,0 / 291,9).
  A leva 3 pôs na entrada só o freio e o recuo do status (`carga.ts`, `hooks.ts`, ~1,2 kB); a faixa "Conexão instável"
  (`FaixaConexao`) é chunk carregado quando a conexão fica instável (pré-carregado 8 s depois da abertura), `carga.ts`
  não importa `chaves-noite.ts`, o cabeçalho lê "N pessoas" de `pessoasTexto.ts` (a pílula `PessoasAgora` fica no chunk
  da página nacional) e o "Siga o Sintonia" do kit de compartilhar é chunk só depois de "Copiado". A Home paga ainda
  ~0,6 kB por o `BotaoLembrete` (I29) ser chunk compartilhado com o Teste Cego e o Palpite. Para caber: o "frescor" do selo de atualização, o índice da busca da Home (`BuscaInline`
  carrega índice/recentes só ao ativar), a `ChamadaPalpite` e o "Desde o 1º turno" da página nacional (montado perto da
  tela, `useNaTela`, com altura reservada) são chunks sob demanda. Curiosidades, cenários,
  widgets e o kit de compartilhar são chunks sob demanda. Anúncios no JS inicial: só o provedor, as regras puras
  (`nucleo.ts`, `anuncios-escolha.ts`) e a decisão da faixa do topo; as peças (`FaixaTopoPeca`, `AnuncioNativoPeca`,
  `pecas.tsx`) e a barra do rodapé são chunks sob demanda — AppShell e páginas importam direto dos módulos, nunca do
  `index.ts` de anúncios (reexportar de lá puxa todas as peças).
- Pré-carga junto com o HTML (`preCarregamentoCritico` no vite.config.ts): módulos de `/`, `/teste` e `/apuracao` e, em
  `/` e `/apuracao`, `presidente-hd.json`, `/api/status` e `/api/meta` (`<link rel=preload as=fetch crossorigin>`; os
  `fetch()` do app usam credenciais 'same-origin' e reaproveitam). Celular emulado (CPU 4×, 150 ms, 1,6 Mbps): LCP da
  Home (a foto) ≈ 2,45–2,7 s (antes 2,7–3,05 s); `/apuracao` ≈ 3,8 s (antes 4,5 s); CLS ≈ 0.
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

---

### 11.10 Modo streamer (`/live`) e página para streamers (`/streamers`)

Objetivo: o Sintonia nas lives (Twitch, YouTube, Kick) com a marca do site sempre visível — é o que traz o público
das transmissões — e um espaço de anúncio próprio (formato `live`).

- **`/live`** (fora do AppShell; `src/app/pages/live/LivePage.tsx`, peças em `src/app/components/live`): layouts
  `placar` (tela cheia), `barra` (GC/lower-third, `posicao=baixo|topo`), `canto` (`posicao=topo-direita|topo-esquerda|
  baixo-direita|baixo-esquerda`) e `mapa` (Brasil por estado, `mapa=municipios`, ou a UF por município); `fundo=
  transparente|escuro|claro` (padrão: escuro nos de tela cheia, transparente nos sobrepostos), `tema=escuro|claro`
  (painéis; com fundo sólido acompanha o fundo), `race=pres|gov-xx` (`UFS_GOV_2T`). Opções e URL em `live/opcoes.ts`
  (valor inválido → padrão). Medidas em `--u = min(1vh, 0,5625vw)` (1% da altura de uma tela 16:9: o mesmo desenho em
  1920×1080 e 1280×720; `vh`, não `dvh`, por causa do navegador do OBS em versões antigas). Sem controles nem cursor;
  o mesmo polling da apuração (`useStatus`/`useNacional`); números rolam (`NumberRoll`); antes do 1º dado não desenha
  nada (transparente). Fase `pre`: 1º turno oficial + contagem regressiva. Simulação: faixa "Simulação · dados
  fictícios", nunca "Fonte: TSE", nunca foto. Fotos por `useFotosRace`; cores por `corSlot(c.cor)`; nomes nunca cortados.
- **Fundo transparente de verdade**: o script inline do `index.html` lê `fundo`/`tema` da URL da `/live` (BrowserRouter
  e HashRouter) antes da 1ª pintura — marca `html[data-fundo=transparente]` e injeta um `<style>` que zera o fundo de
  html/body — e nunca usa a preferência de tema salva. Sem isso a fonte "piscaria" com o fundo do site ao ativar a cena.
  `live/preTinta.test.ts` roda o script e confere que ele concorda com `lerOpcoesLive`. O CSP já autoriza o script pelo
  hash (calculado do template a cada build).
- **Cabeçalhos**: a fonte de navegador do OBS/Streamlabs abre a `/live` como página principal (não é iframe):
  `frame-ancestors 'self'`/`X-Frame-Options: SAMEORIGIN` não a afetam e continuam valendo (as prévias da `/streamers`
  são iframes na mesma origem). `/embed/*` segue com `frame-ancestors *`. Estúdios web que carregam a fonte em iframe de
  outra origem não funcionam (decisão consciente; abrir seria uma linha em `app.ts`). Meta: `/live` com `noindex` e
  canônico na `/streamers`; `/streamers` no sitemap.
- **Anúncio `live`** ("Oferecido por <marca>", `anuncios/OferecimentoLive.tsx`, contrato inalterado): sem link, fora do
  placar — na barra do topo (placar, mapa) ao lado da marca, separado por um filete; na barra e no canto, numa aba presa
  à faixa da marca do Sintonia (no canto, a faixa da marca troca de lado conforme o canto para ficar sempre entre o
  anúncio e as linhas dos candidatos). Escolha por `escolherAnuncio(…, 'live', …)` (master primeiro) com revezamento
  a cada 5 min entre os elegíveis. Impressão = a mesma regra dos outros formatos, uma por anúncio por carregamento da
  página: no OBS, uma fonte ligada (não é audiência da live; o painel diz isso). `?previa=1` (só as prévias da
  `/streamers`) não conta. Vitrine: `VitrineFormato` caso `live` (`live/Cena.tsx`, `MolduraLiveVitrine`: canto inferior
  de uma live 16:9 ampliado, barra em esboço neutro e a peça real em prévia).
- **`/streamers`** (no AppShell; link no rodapé e no menu "Mais"): prévia de cada layout (a própria `/live` num iframe
  1280×720 reduzido, `loading=lazy`, `color-scheme` igual ao da página de dentro para o iframe ficar transparente),
  opções, "Copiar URL" (`urlAbsoluta` → endereço público com `VITE_SITE_URL`), passo a passo do OBS/Streamlabs, regras
  (créditos "via sintonia2026.com.br", não editar números, apartidário, simulação não é resultado) e contato de parceria
  (`status.anuncie`, mensagem pronta para streamers). Sem número de audiência do site; desde a leva 3, só a pílula "O
  Sintonia está em N lives agora" a partir de 5 lives (`/api/live/agora`).
- **Live em pé** (TikTok, Shorts, Kick no celular): com a fonte em retrato (1080×1920 ou 720×1280; media query
  `orientation: portrait`), a `/live` troca `--u` para `min(1,8vw, 1vh)` e o layout `placar` vira `LayoutPlacarVertical`
  (um candidato em cima do outro, barra e "apurado · diferença" numa linha, mesmo rodapé com QR e o anúncio no
  cabeçalho, fora do placar). A mesma URL serve deitada e em pé; na `/streamers`, o cartão do placar tem "Tela da live:
  Deitada 16:9 / Em pé 9:16" (prévia 720×1280) e o passo a passo cita 1080×1920.
- **Prévias da `/streamers`** só montam perto da tela (`useNaTela`), com `src` estável (trocar opção navega dentro do
  iframe, sem recarregar a página toda) e `previa=1`: sem polling, sem medição de audiência e sem impressão de anúncio
  (números do momento em que abriu). Medido: ~8 consultas a `/api/status` em 15 s com a página parada (as da própria
  página), nenhuma das prévias.

- **Leva 3 (I22, I23, I25, I09, I08)**:
  - **`!apuracao`** (`src/shared/texto-placar.ts` + `src/server/texto-placar.ts`): `GET /api/texto/placar?race=pres&uf=sp`,
    texto puro, sempre 200, ≤ 380 caracteres (mira 200, o chat do YouTube), sempre com o endereço; candidatos na ordem
    da urna, mesmo formato para os dois, sem "lidera"; fase `pre` = contagem regressiva sem nomes; 0h–17h de 25/10
    (relógio real) = "A apuração do 2º turno começa hoje, às 17h"; simulação = "[SIMULAÇÃO]" e SEMPRE "Candidato A/B",
    mesmo com os nomes reais no painel (o texto colado num chat circula sem o prefixo); Presidente numa UF nunca diz
    "eleito"; `uf` aceita sigla ou nome. Borda 5 s, montado no máximo a cada 2 s, 20 pedidos/min por canal de bot e
    6.000/min no total (nunca por IP); dos canais só a contagem (hash com sal do processo; `Nightbot-User` nunca é lido).
    Chave `texto-bots` (desligada: só o endereço). A `/streamers` traz as linhas prontas do Nightbot, StreamElements e
    Fossabot, o timer e a prévia da resposta real.
  - **Contagem de lives** (`src/server/lives.ts`, `live/batimento.ts`, painel → Lives): a `/live` manda
    `POST /api/live/batimento` a cada 60 s com id aleatório da carga, layout e anúncios na tela (nunca na prévia
    `?previa=1`, no demo, com automação, DNT/GPC ou a página escondida). Conta só com `Origin` do site (sem Origin — curl
    — é 204 sem contar; outro site, 403); uma fonte só entra em "agora", no pico e nos quadros depois de confirmada (2
    batimentos com ≥ 45 s entre eles); ativa = batimento nos últimos 150 s; no máximo 10 fontes por rede (hash com sal,
    só na memória) e 120 batimentos/min por rede. `STATE_DIR/lives.json` (só contagens: minutos por layout e por anúncio,
    pico, detalhe por hora de 14 dias, maior número de canais de bot), gravado a cada 15 s, a cada 60 s e no
    encerramento; nada no ensaio. `GET /api/live/agora` só com N ≥ 5 (borda 30 s). É **estimativa** (um batimento pode
    ser forjado com Origin falso): o painel diz isso e o material de venda deve dizer também. Chave `contar-lives`.
  - **Estado fixo** `?uf=pe` na `/live` e na `/tv` (só Presidente, 27 UFs): placar da UF ("Votos válidos em
    Pernambuco"), nunca "eleito", mapa do estado por município, QR para `/apuracao/<uf>`; na `/tv`, sem rodízio nem
    seletor de mapa e letreiro só da UF. No mapa da UF o rótulo da capital nunca sai pela borda e o de Fernando de Noronha
    vai sob o quadro tracejado.
  - "N pessoas no site agora · estimativa" na `/live` e na `/tv` (fora do placar; `?pessoas=0` esconde; só com o número
    que o servidor manda, ≥ 500 e chave `contador-publico`). QR com `utm_source=live` / `tv`.

### 11.11 Chat ao vivo moderado ("Sala da apuração")

- **Contrato e filtros**: `src/shared/chat.ts` (isomórfico). Recusa links/domínios/perfis (@), e-mail, telefone, CPF e
  números com ≥ 10 dígitos; palavrões, ofensas, preconceito, xingamentos partidários e ameaças (acentos, leetspeak, letras
  repetidas e soltas; nomes de município como "Gado Bravo"/"Ponta Porã" são exceção); pedido de voto/propaganda
  (número de urna com nome, "vote em", hashtags de campanha, "fora X", "X lá", "faz o L"/"faz arminha", "L13"/"B22", coro
  "13 13 13"); "fraude nas urnas" e variantes (eleição roubada, urna hackeada, TSE manipulou). Letras de outros alfabetos
  e larguras (cirílico, grego, fullwidth, versalete) são lidas como latinas (`paraLatim`: NFKC + tabela de parecidas)
  antes de todos os filtros; link também com espaço antes do ponto, ponto largo ou vírgula ("golpe , com"). CAIXA ALTA
  vira minúscula; repetições são encurtadas. Listas SIMÉTRICAS entre os finalistas (`chat.test.ts` confere os pares).
  Apelido 2–20, só letras latinas (acentos do português incluídos), sem candidato (dataset + fixos, em par: Lula/Bolsonaro,
  Jair, os vices pelo nome completo, Janja/Michelle…), partido, 13/22 (também por extenso) ou nome reservado (moderador, TSE, STF, tribunal,
  juiz, ministro, Justiça Eleitoral, Sintonia…, também com leet e espaços). Texto 1–140.
- **Servidor** (`src/server/chat.ts`, `SalaChat` + `registrarChatPublico`/`registrarChatAdmin`, 2 linhas em `app.ts`):
  FECHADA por padrão; a CONFIGURAÇÃO (aberta, modo lento, fixada) fica em `STATE_DIR/chat.json` e volta igual depois
  de um reinício (update, vigia, VPS); mensagens, silenciados e limites são só da memória. Em produção a sala só recebe
  mensagens a partir das 17h de 25/10 (antes de 25/10 também, salvo `CHAT_ENSAIO=1`; de 0h às 17h de 25/10, sempre):
  aberta antes, fica "abre às 17h". `deploy/painel.sh chat-*` abre, fecha, limpa e mostra a sala pelo terminal.
  Duplicadas: a chave ignora caixa, acento, pontuação e letras repetidas, mas números e emojis CONTAM ("SP com 45%" ≠
  "SP com 80%"); a regra "a mesma mensagem de muitas pessoas" só vale para texto com ≥ 4 letras. Buffer das últimas 300
  (no máximo 12 h), 60 no GET; visitante = número de 53 bits do hash
  (`clienteDe` + token aleatório do navegador), rede = só `clienteDe`. Limites: modo lento (padrão 10 s, 3–300),
  30/hora, 20 tentativas/min por visitante e 60 por rede (trocar o token não multiplica), 12 mensagens publicadas/min por
  rede, autores novos (1ª mensagem há < 10 min) da mesma rede dividem um modo lento e no máximo 8 autores novos por rede
  por hora; sem duplicada do autor (10 min) e no máximo 3 iguais de todos em 2 min (raid). Denúncia: só conta de quem
  está com a sala na tela há ≥ 2 min (sinal de presença), por rede LARGA (/48 no IPv6); 3 redes diferentes escondem até
  o admin decidir — o número sobe com a sala cheia (1 a cada mil pessoas, até 25) — e cada rede ajuda a esconder no
  máximo 5 por hora (com 3, entra no aviso do painel). Silenciar pelo código do autor ou a REDE inteira por 1 h (as
  mensagens saem). Presença: sinal só com a sala na tela, até 10 visitantes por rede (conservador),
  intervalo de 30–180 s que sobe com a sala cheia; estimativa arredondada como "pessoas agora". Reações neutras
  (🔥 😮 👏 👀): o público vê só o TOTAL do último minuto (nunca por emoji: quatro contadores lado a lado viram
  termômetro de torcida); o painel vê por emoji. Presença e reações também param com a sala fechada pelo horário. `intervaloS` sobe sozinho se a origem receber
  muitas consultas (sem CDN). Em produção, de 0h às 17h de 25/10 a sala não recebe mensagens (Lei 9.504/97, art. 39,
  § 5º). `GET /api/chat` com query → 400 (a CDN guarda uma URL só; ignore a query na regra de cache); POST só do próprio
  site (`Sec-Fetch-Site: same-origin` ou `Origin`). Log: só a ação do admin, nunca texto nem apelido. **Registro de
  envios** (Marco Civil art. 15; DESLIGADO por padrão, `src/server/chat-registro.ts`): com `CHAT_REGISTRO_CHAVE` (chave
  PÚBLICA RSA), cada mensagem publicada vira uma linha cifrada (id, hora, IP, porta) em `STATE_DIR/chat-registro`, 6 meses,
  fora do backup; o servidor não consegue ler; a sala e a /privacidade avisam (`registro` no GET). Ligar é decisão do dono
  com o advogado; abrir: `scripts/chat-registro-abrir.ts` com a chave privada, fora da VPS.
- **App** (`src/app/components/chat`): estado único por aba (`sala.ts`: consulta só com interesse — sala na tela a cada
  `intervaloS`, só o botão a cada ≥ 10 s, sala fechada 15–30 s, aba escondida parado —, junta por id, `removidas` e
  `limpaEm`). `SalaDaApuracao` (montada pelo AppShell só em `/apuracao` e `/apuracao/:uf`; aparece com a sala aberta):
  desktop = aba vertical na borda + painel que empurra a página (`--sala-lateral`, padding do `main` e do rodapé) quando
  o layout continua o mesmo (`modoPainelDesktop` → `doca`: nacional em 1200–1359 e ≥ 1760 px; UF ≥ 1100), gaveta NÃO
  modal abaixo do cabeçalho (nacional 1360–1759; Esc fecha) ou, em tela estreita (nacional < 1200, UF < 1100), `folha`
  centralizada embaixo (até 440 px de altura: os dois percentuais do placar continuam à vista);
  celular = botão flutuante acima da tab bar e da barra de anúncio (recolhe para uma alça na margem, com o rótulo
  vertical "Chat", quando há bloco `data-sem-anuncio-fixo` na faixa de baixo — quase sempre na /apuracao) e folha
  inferior NÃO modal que começa logo abaixo da linha dos % do placar (rola o placar para ficar à vista acima; altura
  medida na abertura, entre 300 px e 58% da tela — `alturaFolhaCelular`; a folha leva `data-sem-anuncio-fixo`, então a
  barra de anúncio some; o anúncio da sala fica no PÉ da folha). Portas visíveis para a sala: a chamada "Chat ao vivo"
  na 1ª dobra da /apuracao e da UF (ao lado de "N pessoas agora"; só com a sala aberta — `chat/chamada.ts` liga a página
  à sala sem puxar o chat para o JS inicial) e o item "Chat ao vivo" do menu Mais (/ao-vivo). Regras
  compactas no pé (popover com as regras inteiras e "Trocar apelido"); quem digita antes de ter apelido escreve a mensagem
  e o apelido é pedido no envio. Mensagem enviada que o servidor não devolveu some depois da janela de consulta (não fica
  "fantasma" na tela). Demo: sala desligada com aviso.
- **Anúncio `chat`** (`anuncios/OferecimentoChat.tsx`, contrato inalterado): "Sala oferecida por <marca>" no topo da
  sala (no pé, na folha do celular), só com a sala aberta, faixa própria fora das mensagens; rotação pelo peso fixa na visita, evitando
  o anunciante do topo/rodapé; impressão visível e clique (`?f=chat`) como os demais. Vitrine: `MolduraChatVitrine`.
- **Admin**: seção "Chat ao vivo" (`SecaoChat.tsx`, pensada para 390 px).

### 11.12 Audiência real, "Siga o Sintonia" e pedidos de anunciantes

Objetivo: números REAIS (medidos pelo próprio site) para vender anúncio, reter o público depois da eleição e receber
pedidos de anunciantes. Contratos em `src/shared/audiencia.ts` e `src/shared/leads.ts`; servidor em
`src/server/audiencia.ts`, `leads.ts` e `crescimento.ts` (rotas públicas e do painel, 2 linhas em `app.ts`; stores no
`main.ts`).

- **Sinal do app** (`src/app/lib/audiencia.ts`, chunk carregado pelo `main.tsx` depois da 1ª pintura; nunca no demo):
  `POST /api/audiencia` (text/plain, sem cookie) com `{ g }` = GRUPO da rota (`grupoDaRota`: nunca caminho, query ou
  código de Duelo) a cada troca de caminho (só a query mudar não conta), `{ o }` = origem da ENTRADA (1ª página da aba,
  marcada em `sessionStorage`: `utm_source` ou família do referrer — X/t.co, WhatsApp, Instagram, Twitch, YouTube, Kick,
  Google… — ou o domínio registrável; nunca a URL) e `{ p: 1 }` (presença) enquanto a aba está VISÍVEL, no intervalo que
  o servidor devolve (`{ s }`: 60 s até 15 mil pessoas, 120 / 180 / 240 s acima — teto de ~600–800 sinais/s na origem a
  ~150 mil pessoas; a presença leva o grupo, `{ p: 1, g }`). Página aberta escondida só conta quando aparece. Não manda
  nada com `navigator.webdriver`, Global Privacy Control ou Do Not Track. `/admin`, `/kit`, widgets, `/live` e as prévias
  (`?previa=1`) não mandam presença (`GRUPOS_FORA_DE_PESSOAS`); o servidor ignora presença desses grupos.
- **Servidor** (`Audiencia`): pessoa = hash(rede LARGA + User-Agent) — rede = IPv4 inteiro ou IPv6 /56 (`chaveCliente(…,
  56)`: uma casa costuma receber um /56, e trocar de /64 não multiplica ninguém). Só aceita sinal com
  `Sec-Fetch-Site: same-origin` (Origin forjado por script não basta). Únicos/dia = conjunto em memória de chaves
  de 32 bits com sal DIÁRIO aleatório, nunca gravado, descartado à meia-noite de Brasília (fica só a contagem);
  reinício no meio do dia → os únicos do dia ficam pelo maior trecho (conservador; o painel mostra os reinícios).
  Presença = linear counting em baldes de 30 s, janela = intervalo + 60 s. **Pico** (com data/hora, total, por dia e por
  hora) = a cada 10 s SÓ a presença (sinal das páginas, que exige JavaScript e navegador e passa pela CDN). O
  `pessoasAgora` do servidor (quem chegou à origem em ~30 s) aparece no painel só como referência: um único host o infla
  com pedidos que furam o cache, então ele nunca entra no pico nem na /anuncie (CDC, art. 37). Widgets (`/embed/*`) e
  `/live` contam no grupo, mas ficam fora de páginas, únicos e pico. Limites contra inflar: 600 sinais/min por rede, 20
  páginas/min por pessoa, 50 pessoas novas por rede por dia e 10 por balde de presença; robôs/automação fora. O painel
  mostra a **concentração** (quanto as 10 maiores redes somam, agora e no pico) para conferir antes de vender. Grava `audiencia.json` (atômico) a cada 60 s
  e no encerramento: só contagens (até 400 dias, 48 h por hora, 300 origens por dia).
- **Painel → Audiência** (`SecaoAudiencia.tsx`): agora, pico, únicos e páginas de hoje, 48 h em barras, por dia, seções e
  origens (7 dias), concentração por rede, CSV (dia, hora, origens), "Zerar medição" (zere depois do deploy, antes de
  vender: tira os testes), o interruptor **"Mostrar audiência na página /anuncie"**
  (padrão DESLIGADO; `divulgacao.json`) com prévia, e os links **"Siga o Sintonia"** (X, Instagram, TikTok, canal do
  WhatsApp, Telegram, YouTube; só https no domínio da própria rede).
- **Público**: `GET /api/divulgacao` (`public, max-age=120, s-maxage=60` + ETag) → `{ redes, audiencia }`. `/anuncie`
  mostra os números medidos (pico com data/hora, maior dia em únicos, páginas vistas "desde <data>") só com o interruptor
  ligado e só os que forem > 0. "Siga o Sintonia" no rodapé (chunk próprio, fora do JS inicial), no fim do resultado do
  Teste Cego e no fim de `/anuncie`; sem rede configurada (ou no demo), nada aparece.
- **"Quero anunciar"** (`crescimento/FormLead.tsx` em `/anuncie#contato`; WhatsApp/e-mail do painel continuam ao lado):
  nome, empresa, e-mail de trabalho, WhatsApp (opcional), formatos, mensagem e consentimento obrigatório ("uso só para
  responder ao seu contato"). Campo-isca + tempo mínimo de 3 s (o app espera o que faltar; robô recebe "ok" e nada é
  guardado), 3 por rede (/56) por hora, repetido em 24 h não duplica; acima de 120 no total por hora (enxurrada), o pedido
  entra em QUARENTENA (guardado com selo no painel; cheio, a quarentena sai antes) em vez de recusar todo mundo.
  Cada pedido guarda a prova do consentimento (`consentimento: { versao, em }`, `VERSAO_CONSENTIMENTO` e o texto em
  `TEXTOS_CONSENTIMENTO`). `leads.json` (permissão 600, sem IP, no máximo 2.000; cheio, sai o respondido mais antigo;
  respondidos saem depois de 180 dias e os sem resposta depois de 1 ano). Em produção o formulário fica FECHADO ("abre
  em breve") — no app E no servidor (`POST /api/anuncie/lead` → 503) — enquanto não houver e-mail de PRIVACIDADE em
  *Painel → Comunicação → Contatos públicos*: sem canal real para o titular, não se coleta. Log: só "novo pedido".
- **Contatos públicos** (`src/shared/contatos.ts`, comando `contatos`, `LiveStatus.contatos` e `AdminState.contatos`
  opcionais): e-mails geral, de privacidade (encarregado), de imprensa e de correções, e o responsável pelo site (nome ou
  razão social; CNPJ opcional, com dígitos verificadores). Validados no painel e no servidor (domínio reservado, como
  `.example`, é recusado). Sem configuração, nenhuma linha de e-mail aparece; o geral cai no e-mail da /anuncie
  (`contatosEfetivos`). Usados em /sobre, /privacidade (controlador e canal do encarregado), /metodologia (correções;
  sem ele, o geral) e, sem contato próprio da /anuncie, em /anuncie e /streamers.
  **Painel → Interessados** (`SecaoInteressados.tsx`): lista, responder por e-mail/WhatsApp com mensagem pronta,
  marcar respondido, apagar, CSV com `csvCampo`/`csvTexto` (neutraliza fórmula também depois de vírgula, ponto e vírgula,
  tab ou quebra de linha; colunas de consentimento e quarentena), selo com o número de não respondidos no menu.

- **Medição da noite (leva 3, I14)**: curva por minuto das últimas 24 h (maior presença de cada minuto, da amostra de
  10 s; minuto sem amostra = servidor fora), horas de tela (pessoas × tempo real entre amostras, até 20 s) por hora e
  por dia, e páginas por UF (`cf-region-code`, só com país BR), país (`cf-ipcountry`; `XX`/`T1`/ausente = `ND`; até 250
  por dia, o resto em `ZZ`) e aparelho (`Sec-CH-UA-Mobile`, senão o User-Agent, senão `nd`; tablet = computador) — só
  siglas, em chaves opcionais do `audiencia.json` (`curva`, `local`, `telaHoras`); cidade, CEP, coordenadas e IP nunca
  são lidos. Detalhe por hora guardado 14 dias. Painel → Audiência: "Curva minuto a minuto" (com a linha das 17h),
  "Aparelho, estado e país" (Hoje/7/14 dias), cartões "Horas de tela hoje" e "No celular hoje" e 4 CSVs. Chave
  `medir-local` (painel, na hora) e `AUDIENCIA_LOCAL=0` (ambiente, de vez). Depende da transformação "Add visitor
  location headers" da Cloudflare (ligada pelo `cloudflare.mjs --aplicar`); um acesso direto à origem (sem a Cloudflare)
  consegue forjar as siglas — só afeta os totais por UF/país e esbarra nos limites por pessoa.
- **"Siga o Sintonia" no resultado (I28)**: variantes `faixa` (NacionalPage e UfPage, só com a fase `encerrada`, longe do
  placar e do banner do eleito) e `linha` (fim da reprise da `LinhaDoTempo` e depois de "Copiado"), com
  `utm_source=sintonia`; sem rede configurada, nada aparece. **Lembrete (I29)**: `BotaoLembrete` (extraído do
  `AcoesHome`, prop `caminho` sem query nem `#`) no fim do Teste Cego e depois de cravar o palpite (evento em
  `/palpite?utm_source=agenda`); nada do palpite nem do resultado do Teste vai no link do Google/Outlook/.ics.

### 11.13 Palpite do 2º turno (`/palpite`)

Motor viral INDIVIDUAL: até as 23h59 de 24/10 (véspera; `FIM_PALPITES`) a pessoa crava o % dos votos válidos de cada finalista de Presidente e
posta o cartão "Meu palpite"; depois do resultado oficial, a página mostra "Você errou por Z p.p." / "Na mosca" e o
cartão do resultado. Código em `src/app/components/palpite` (`nucleo.ts` puro e testado), página
`src/app/pages/palpite/PalpitePage.tsx`.

- **Nunca é enquete nem sai do aparelho** (§1.2, §1.3): nada de POST, log ou analytics com o palpite; nenhum número
  agregado de palpites existe. Fica no `localStorage` (`sintonia:palpite` = `{ v: 1, a, em }`, só conveniência) e só sai no
  link que a pessoa compartilhar, DEPOIS do `#` (`/palpite#1e0`, "1" + décimos em base 36), e na imagem gerada no
  navegador. O servidor nunca vê o código: meta tags e `/api/og/palpite.png` são genéricas.
- **Valor**: décimos de p.p. do candidato de MENOR número (ordem da urna), inteiro de 300 a 700 (30,0%–70,0%, simétrico);
  os dois lados somam 100. Divisor único com a metáfora da calculadora (arrastar na direção de um candidato aumenta a
  parte dele), trilha só de 30% a 70% (precisão de 0,1 no celular), botões simétricos de +0,1 para cada lado e "50% ·
  50%"; teclado e leitor de tela pelo `<input range>` nativo.
- **Prazo**: `FIM_PALPITES` = 0h de 25/10 em Brasília (o palpite com nomes e percentuais circulando no dia da votação
  pareceria pesquisa de boca de urna), pelo relógio do SERVIDOR (`LiveStatus.wallNow`, deslocamento do aparelho).
  `fasePalpite`: `aberto` → `votacao` (0h–17h de 25/10: palpite travado, sem compartilhar, sem chamada na Home/apuração,
  aviso na página) → `fechado` (comparação com o resultado). Sem palpite, a página só convida a acompanhar a apuração.
- **Comparação** (`resultadoOficial`): só fonte `tse`, sem simulação, fora da fase `pre`, corrida `pres` do 2º turno com
  votos; parcial ("até agora, com X% das seções…") e final (100% das seções ou `encerrada`). Diferença arredondada a 1 casa;
  abaixo de 0,5 p.p. = "Na mosca". Números simulados nunca entram (no demo a comparação não aparece).
- **Link recebido**: mostra o palpite de quem mandou, a distância para o seu e, com o resultado final, quem ficou mais perto
  (só as duas pessoas, como o Duelo). O seu palpite começa em 50/50 (sem âncora no palpite recebido).
- **Cartões** (`CartaoPalpite`, x/feed/story sobre `CartaoBase`): "Meu palpite" (lado a lado no 16:9; um em cima e outro
  embaixo no retrato, com números maiores) e "Errei por Z p.p." / "Na mosca" (com o palpite embaixo; SEM o placar oficial).
  Sem foto (números hipotéticos) e SEM número de urna (só nome e partido: nome + número circulando é a cara de um santinho),
  cores dos dados. Textos (`textos.ts`) neutros, ordem da urna, ≤ 220 de peso no X, convite "Faça o seu até 24/10".
- **Anúncios**: página = formato `teste` com o rótulo "Palpite oferecido por" (`OferecimentoPalpite`), no FIM, depois de
  "Como funciona". Cartões "Meu palpite"/resultado (nomes + percentuais): faixa "Oferecimento" só com
  `OFERECIMENTO_COM_CANDIDATOS` (hoje DESLIGADO, §1.5). A imagem-convite genérica `/api/og/palpite.png` (sem candidato)
  continua em `CARTOES_COM_OFERECIMENTO`/`imagemComOferecimento` (anunciante no `&v=`).
- **Chamadas**: `ChamadaPalpite` (chunk sob demanda) na home (1ª seção abaixo da dobra, fora do hero) e na apuração na fase
  `pre` (faixa entre a contagem e o 1º turno); some na janela da votação; depois das 17h só aparece para quem cravou. Menu
  "Mais" e sitemap.

### 11.14 Cartões do placar com retratos grandes e "Desde o 1º turno"

- **Cartão do placar no servidor** (`src/server/og-placar.ts`, substitui o antigo `layoutPlacar` de og.ts): no espírito do topo
  da Home (`DueloPresidencia`) — os dois retratos oficiais GRANDES lado a lado (quadro 4:5, moldura em degradê e brilho na cor
  de identidade que vem dos dados), o "×", números gigantes, barra dividida (os demais no meio no 1º turno, marca dos 50%), %
  apurado e horário de Brasília, `sintonia2026.com.br` (ou o host de `PUBLIC_URL`) e, só com `OFERECIMENTO_NO_PLACAR` (=
  `OFERECIMENTO_COM_CANDIDATOS`, hoje DESLIGADO, §1.5), a faixa "Oferecimento" abaixo do rodapé (no story, etiqueta acima
  da faixa livre de 150 px). 16:9: retratos no centro e cada candidato
  no seu lado; feed/story: retratos em cima e nome/partido/número embaixo; story com a pílula da diferença. Presidente usa
  `presidente-hd` (originais do TSE, 161×225, sem edição); sem ele (ou governador), o pacote da corrida; tudo ou nada.
  Simulação: monograma no MESMO quadro, selo, faixa e marca-d'água; nunca "Fonte: TSE". Nomes nunca cortados (quebram em duas
  linhas).
- **Desempenho**: satori + resvg com fundo TRANSPARENTE, e o fundo com o brilho dos cantos composto em JS (`comporSobreFundo`:
  um `radial-gradient` do tamanho do cartão custava ~200 ms no resvg); PNG RGB com filtro Paeth e deflate 6 (`pngDeRgba(…,
  6, 'paeth')`). Medido (mesma máquina, 24 imagens seguidas): antigo 1200×630 mediana 337 ms, 113 KB, RSS 303 MB → novo
  1200×630 152 ms, 262 KB (abaixo dos ~300 KB em que o WhatsApp deixa de mostrar a prévia; sem foto ≈ 130 KB), RSS 331 MB;
  story 390 ms, 520 KB. Cache e fila: os mesmos (ServicoOg); cada formato tem a sua chave (`|x`, `|feed`, `|story`).
- **Cartão no app** (`apuracao/ShareCard`, x/feed/story sobre `CartaoBase`): o mesmo desenho em DOM (html-to-image), retratos via
  `useFotosHero` (HD), o brilho limitado à área do miolo (o `overflow-hidden` da moldura cortaria em linha reta) e, só com a
  mesma chave ligada, a faixa "Oferecimento" fora da moldura (`escolherAnuncio(…, 'compartilhamento', 'og|<corrida>|<local>')`).
- **"Desde o 1º turno"** (contrato `src/shared/desde-t1.ts`, puro e isomórfico; painel `apuracao/DesdePrimeiroTurno.tsx` na
  página nacional — no lugar da antiga comparação — e na da UF): para cada finalista, a variação em p.p. dos válidos (o 1º turno
  sobre todos os candidatos, regra do TSE) e em VOTOS só onde a comparação é justa — a abrangência inteira concluída (exato) ou a
  soma das subáreas com 100% das seções (municípios), com quantas são e quanto do eleitorado cobrem. Sem nenhuma concluída, os
  votos de agora (nunca o parcial contra o total do 1º turno). "Onde cada um cresceu mais que o outro": as subáreas concluídas
  com a maior diferença entre as variações (mesma conta da camada do mapa), 3 para cada um, piso de 5 mil eleitores na UF e
  10 mil no Brasil. Brasil por município: `GET /api/apuracao/:race/br/desde-t1` (`src/server/desde-t1.ts`; só Presidente no 2º
  turno; 1º turno do dataset; 2º turno do motor ou, na fonte TSE, SÓ do cache de municípios — `TseSource.resumosMunicipaisEmCache`,
  sem baixar nada nem mexer na fila —; recalculado no máximo a cada 5 s, `s-maxage=5`, ETag; nomes ocultos → 404). No build demo
  o painel do Brasil compara por estado. Simulação: selo no bloco; nomes ocultos: o bloco não aparece (a explicação de antes).
- **Camada do mapa "Desde o 1º turno"** (`mapModes.ts`, modo `variacao`): `crescimentoDesdeT1` = (p0₂ − p0₁) − (p1₂ − p1₁),
  na cor de quem cresceu mais, saturando em ±10 p.p.; tooltip "Desde o 1º turno: Lula +5,1 · Flávio +2,0 p.p."; no mapa, a
  diferença (`rotuloCurto`). Mapa por UF, por município da UF e nacional por município (canvas).

## 12. Produção

Guia de instalação para leigos: [`DEPLOY.md`](./DEPLOY.md). Antes de divulgar: [`CHECKLIST-LANCAMENTO.md`](./CHECKLIST-LANCAMENTO.md).
Semana da eleição: [`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md). Referência das variáveis e rotas: README ("Variáveis de
ambiente do servidor", "CDN", "Segurança", "Admin").

### 12.1 Topologia e deploy

```
visitante ──HTTPS──▶ Cloudflare (leva 3: regras de deploy/cloudflare.mjs; borda pelo Cloudflare-CDN-Cache-Control, §6)
                        │  (só IPs da Cloudflare são aceitos como CF-Connecting-IP)
                        ▼
VPS Ubuntu ── Caddy 2 (80/443 + HTTP/3; Let's Encrypt; X-Real-IP calculado; segura 20 s durante reinícios)
                        │  rede interna do Docker (porta do app não publicada)
                        ▼
               app: 1 processo Node 22 (dist/ + dist-server/main.js): SPA, API, motor, adaptador do TSE, imagens OG
                        │  volume "estado" (/var/lib/sintonia): admin.json + tse-historico.json + anuncios-metricas.json + audiencia.json + leads.json + divulgacao.json + chat.json + lives.json [+ chat-registro/ e a chave pública, se ligado]
```

- **Imagem** (`Dockerfile`): multi-stage em `node:22-bookworm-slim` (glibc, por causa do binário do resvg); a final leva
  só `dist/`, `dist-server/`, o `node_modules` de produção e o `package.json`. Usuário 1000, sistema de arquivos
  somente leitura (grava só no volume e em `/tmp`), sem capacidades extras, `init: true`, `HEALTHCHECK` em `/healthz`
  com vigia que reinicia o processo travado (`deploy/healthcheck.mjs`). Commit e data do build entram por build-arg
  (`GIT_COMMIT`, `BUILD_DATE` → `SINTONIA_COMMIT`, `SINTONIA_BUILD_DATE`). `VITE_SITE_URL` também é build-arg (fica no JS).
- **Compose** (`docker-compose.yml`): `app` + `caddy`; variáveis fixas no compose (`NODE_ENV=production`,
  `TRUST_PROXY=1`, `STATE_DIR`, pastas) valem mais que o `.env`; limites de memória (app 1,5 GB, Caddy 512 MB com
  `GOMEMLIMIT`), logs com rotação. Plano B de réplicas: `docker-compose.replicas.yml`.
- **Scripts** (`deploy/`, bash, mensagens em pt-BR): `install.sh` (Docker, ufw, swap, `.env` com segredos gerados,
  build, subida, HTTPS, backup de hora em hora), `update.sh` (build com o site no ar → **ensaio** da imagem nova ao lado
  da atual, sem visitantes → backup → troca → volta sozinho se não ficar saudável; `--rollback` para a imagem
  `sintonia-app:anterior`), `backup.sh`/`restore.sh` (estado + `.env`; a versão do estado restaurado continua subindo),
  `status.sh` (situação num relance) e `painel.sh` (comandos do painel pelo terminal, por dentro do contêiner).
- **Configuração**: `.env.example` comentado; `src/server/config.ts` documenta todas as variáveis que o servidor lê e
  avisa no log sobre valores inválidos.

### 12.2 Troca automática para o TSE (`src/server/troca-auto.ts`)

- Ligada em produção (`TSE_AUTO`); horário padrão `INICIO_APURACAO` (17h de 25/10), mudável por `TSE_INICIO` (ensaio)
  ou pelo painel (comando `troca-auto`: ligar, desligar, adiar/marcar, agora). As escolhas do admin ficam em
  `AdminState.trocaAuto` (todas as instâncias, sobrevive a reinícios).
- No horário, com a fonte `pre`: confere o feed (`TseManager.testar`: arquivo Brasil da eleição de Presidente do 2º
  turno; o `ele-c.json` só gera "Atenção") com tempo-limite de 20 s. Respondeu → fonte `tse` e polling ligado. Não
  respondeu → continua `pre`, aviso público discreto "Aguardando os primeiros dados do TSE" (só sem aviso do admin) e
  novas tentativas em 15 s, 30 s, 60 s e depois a cada 2 min (±20%).
- "Feita" vale para o horário em vigor: uma troca registrada **antes** dele (ensaio) não conta. Depois de feita, não se
  repete; voltar a fonte para `pre` à mão depois do horário não dispara outra troca.
- A **fase pública** depende da data, não da fonte: até 17h de 25/10 as páginas ficam em `pre` mesmo com a fonte `tse`
  (ensaios não mudam o que o público vê). Na fonte `tse`, o `/api/status` passa a `encerrada` quando o TSE conclui
  Presidente e nenhuma disputa de governador segue apurando (`tseTudoEncerrado`).
- Na noite, o adaptador mantém o último dado bom quando o feed falha (sem aviso automático ao público; o operador
  publica um, `RUNBOOK-ELEICAO.md` §3.1).
- **"Mais rápido que a TV"** (out/2026): o resumo Brasil de Presidente (o menor arquivo e o mais olhado) é lido num laço
  próprio a cada `tse.intervaloPrioritarioSeg` (padrão 5 s, 3–600, painel → Fonte → "Placar nacional"), com pedido
  condicional (304), 1 tentativa por vez, prioridade alta na fila do cliente (≤ 8 conexões) e backoff ×2 até 30 s quando
  o TSE falha (o laço normal também se espaça até 2 min quando TODAS as disputas falham, e volta assim que o prioritário
  vê o TSE responder; a fila de municípios em segundo plano para enquanto o TSE falha — TSE falso com 503 por 90 s:
  1.062 → 224 pedidos); o laço normal (15 s) não repete o arquivo. Cópia mais antiga do CDN do TSE (geração `dg/hg`
  anterior) é descartada. A marca dos números de cada disputa vai no `/api/status` (`frescor`, com a última leitura
  boa); o app reconsulta o placar na hora em que ela muda, pede `…/br?d=<marca>` (endereço novo = nada velho no
  navegador nem na CDN) e mostra "Atualizado às HH:MM:SS · dado do TSE das HH:MM:SS" com o % apurado e uma etiqueta
  "novo" (`SeloAtualizacao`). Medido com o TSE falso (publicação a cada 7 s, CDN emulada): TSE → tela de 11,4 s em média
  (máx. 19 s; 32,6 s com pouco tráfego, pelo `stale-while-revalidate=10`) para 3,6 s (máx. 6,4 s). O cache do CDN do
  próprio TSE (`max-age` de até ~60 s) fica fora do nosso alcance; o atraso TSE → servidor medido aparece no
  `/api/admin/tse/health` (`prioritario.atrasoMs`).
- **Limite e bloqueio do TSE (leva 3, I03; `src/tse/client.ts`, `source.ts`, `src/server/tse.ts`, README do `src/tse`
  §3.1)**: teto global de pedidos por segundo (`tse.limitePorSeg`, padrão 40, de 5 a 90, painel → Fonte), contando toda
  tentativa, com folga reservada e prioridade para os arquivos Brasil/UF. `TseBloqueioError` com 429, 403 da borda do
  TSE (`Server: AkamaiGHost` ou HTML "Access Denied") ou 403 num arquivo que já deu 200/304; 404 e 403 XML de arquivo
  nunca lido continuam "ausente" (cache negativo de 60 s dobrando até 10 min, zerado quando o `-ab.json` da UF mostra o
  município andando). No bloqueio, **pausa total** pelo `Retry-After` (5 s–60 min) ou 11 min: nenhum pedido sai
  (laços, fila de municípios e consultas de visitantes respondem com o último dado bom); ao fim, 1 pedido de prova;
  log uma vez; `health().ok=false` com `bloqueadoAte`; `frescor.tseBloqueadoAte` no status (selo neutro "O TSE está
  limitando leituras; nova tentativa às HH:MM"); "Retomar agora" (`tse-retomar`) para falso positivo. Chave
  `pausa-tse`: `auto` (padrão), `restrita` (só 429 e borda do TSE — o "403 num arquivo já lido" volta a ser ausente; use
  se a pausa recomeçar sozinha a cada "Retomar") e `off` (nunca pausa, como antes; risco maior de bloqueio). Trocar para
  `restrita`/`off` encerra uma pausa em curso. A pausa não sobrevive a um reinício. `conferidoEm` só avança com 200/304
  do arquivo principal.
- **Arquivo nacional parado (I18, só o aviso)**: o arquivo Brasil de Presidente na mesma geração `dg/hg` por mais de 90 s
  (pelo relógio do TSE e pelo nosso) enquanto a soma das seções totalizadas das UFs e do exterior passa a dele →
  `frescor.nacionalParadoDesde` e o selo "O arquivo nacional do TSE não atualiza desde HH:MM · veja os estados" (rola até
  a tabela de UFs). **Nunca soma votos** (um número diferente do arquivo oficial vira munição de "fraude"). Chave
  `aviso-nacional` (`auto`/`off`; `off` tira só do público — painel e alertas continuam vendo).

### 12.3 Segurança

- **Simulação travada em produção**: sem `ALLOW_SIMULACAO=1`, comando de simulação → 403, `SIM_AUTOSTART` ignorado,
  estado salvo em simulação volta para `pre` na subida. `deploy/painel.sh` também recusa.
- **Admin**: senha comparada em tempo constante; cookie HMAC (chave derivada de `ADMIN_SECRET` e da senha: trocar a
  senha derruba as sessões), `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/admin`, 12 h; 10 logins/min por
  cliente e 300/min no total; CSRF por `Sec-Fetch-Site` + `Origin`/`Referer` (`PUBLIC_URL`); comandos validados com zod.
- **IP do visitante**: o Caddy só aceita `CF-Connecting-IP` de IPs da Cloudflare e manda ao app um `X-Real-IP`
  calculado; o app usa o último salto do `X-Forwarded-For` como reserva (forjar o começo não escapa do limite).
- **Cabeçalhos**: CSP com hash dos 2 scripts inline, HSTS de 1 ano com `includeSubDomains`, `nosniff`,
  `frame-ancestors 'self'` + `SAMEORIGIN` (exceto `/embed/*`, `*`), Permissions-Policy, COOP.
- **Limites**: URL ≤ 8 KB (414), corpo ≤ 512 KB (413), imagens OG novas ≤ `OG_LIMITE_MIN`/min por cliente (429) e fila
  de geração limitada (503); estáticos nunca servem arquivos ocultos; erros sem pilha para o cliente.
- **Privacidade**: nenhum log de IP, cookie, senha, query string ou código de Duelo (o Caddy não tem log de acesso);
  respostas do Teste Cego nunca chegam ao servidor (§1.3); métricas de anúncio só agregadas (§10.2, item 10); audiência só
  agregada, com sal diário nunca gravado, e pedidos de anunciantes sem IP (§11.12). Ver
  `CHECKLIST-LANCAMENTO.md` B1.7 sobre o Marco Civil.
- **Anúncios**: imagens do admin com CSP `sandbox` + `nosniff`; páginas com `img-src 'self'` (+ origem do `PUBLIC_URL`),
  `data:` e `blob:` (nenhum pixel de terceiro); clique só para o link cadastrado e só contado em navegação vinda do site
  (30 min entre cliques do mesmo visitante); eventos só do próprio site; visitante = hash da rede (IPv4 inteiro, IPv6
  /64); `/api/admin/command` aceita até 1 MB (logo + peça), as demais rotas 512 KB.

### 12.4 Operação

- **Saúde**: `/healthz` (vivo, usado pelo Docker e pelo monitor externo), `/readyz` (pronto; 503 encerrando),
  `/api/versao` e o cabeçalho `x-sintonia-versao`.
- **Log**: JSON por linha no stdout do contêiner, com id de requisição; rotas quentes por amostragem (1%), e sempre:
  5xx, 429, respostas ≥ 1 s, admin e a troca automática; um resumo por minuto (`reqPorSeg`, p50/p95/p99, cache, 5xx,
  429, clientes, memória). Rotação pelo Docker (5 × 20 MB).
- **Encerramento**: `SIGTERM` → `/readyz` 503, `Connection: close`, drenagem de até `ENCERRAMENTO_SEG` (8 s), estado
  gravado, saída 0 (o Docker espera 30 s). Reinício do app: ~2–4 s, com o Caddy segurando as requisições.
- **Backups**: de hora em hora (72 guardados) do volume de estado e do `.env`, com permissão 600; cópia para fora da
  VPS é tarefa humana (checklist A5).
- **Painel**: Fonte (troca automática, feed, teste de conexão), Comunicação (aviso global) e Monitor (req/s, p50/p99,
  5xx/429, event loop, memória, imagens OG). Pelo terminal: `deploy/painel.sh`.
- **Alertas da noite (leva 3, I16; `src/server/alertas.ts`, ligado no `main.ts`)**: confere a cada 15 s e manda ao
  Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`; sem eles, desligado): placar parado há mais de 3 min (ou sem
  leitura boa), TSE limitando, erros seguidos do TSE, 5xx > 1% ou p99 > 1 s por 2 min, reinício do processo (também a
  cada deploy) e, como extras, arquivo nacional parado, troca automática atrasada, laço de eventos lento e memória > 80%.
  Mensagens ≤ 200 caracteres sem dado de visitante, cada tipo no máximo 1×/10 min com "resolvido" na volta, ≤ 20 por
  10 min, envio com tempo-limite de 3 s; token e URL nunca no log. Batimento a cada 60 s em `HC_PING_URL` (vigia
  externo, homem-morto). `ALERTAS=0` desliga; o contêiner de ensaio do `update.sh` nunca manda. Painel → Fonte →
  "Enviar alerta de teste" ou `painel.sh alerta-teste`.
- **Freios (I37) e emergência no app (I05)**: Controle → Chaves da noite (ou `painel.sh freio 2|3|5 [leve]`; `freio 1`
  solta) espaça as consultas de todos em segundos, sem publicar (`LiveStatus.carga`; `pollMs` e o status × fator); o
  modo leve para o mapa por município e o "desde o 1º turno", deixa o chat 2× mais lento e faz as imagens ao vivo valerem
  120 s. O Monitor mostra os sinais de aperto (p99 > 1 s, 5xx > 1%, event loop > 300 ms) com "Puxar 2×"/"Soltar". O app
  recua o status quando o servidor falha (4, 8, 16… até 30 s, ±25%, volta a 2 s no 1º sucesso; o placar não consulta
  mais rápido que o status) e mostra "Conexão instável — mostrando o último dado recebido às HH:MM:SS" depois de 3
  falhas ou com o relógio do status parado 60 s (status velho servido pela borda); chave `faixa-conexao` (o recuo
  continua). Uma única invalidação por aba quando a versão muda (reconsulta espalhada em até 2 s).
- **Vigia do `admin.json`** (`vigia-admin.ts`): adota o estado gravado por OUTRA instância (mesmo `STATE_DIR`); a própria
  gravação (atrasada pelo debounce do `state-store`) é reconhecida pelo hash das últimas 20 (`lembrar: 20`) e nunca
  adotada — antes, com 2–3 chaves trocadas em menos de ~1 s (as chaves não sobem a versão), uma delas voltava atrás
  sozinha (corrigido na integração da leva 3; teste em `vigia-admin.test.ts`).
- **Log**: `/api/texto/` e `/api/live/` entram nas rotas quentes (amostragem), como o status.

### 12.5 Capacidade (medida em 12/10/2026)

- **Um processo** (1 núcleo): ~7–12 mil req/s conforme a rota, p99 < 0,25 s até 500 conexões, zero erros; mistura
  realista a 200 conexões: 8,4 mil req/s, p99 68 ms. Saturado (1.000 conexões), conexões novas esperam segundos: é o
  teto de um processo Node, não um defeito. Da ordem de 20–30 mil pessoas simultâneas na origem **sem CDN**.
- **Pelo Caddy em HTTPS** (500 conexões × 5 rotas, gerador na mesma máquina de 4 vCPU): 2,4–4,3 mil req/s, zero erros,
  app até 482 MB; Caddy até 381 MB com 2.500 conexões (por isso 512 MB + `GOMEMLIMIT`).
- **Com a Cloudflare**, cada ponto de presença busca cada URL da API no máximo 1× por 1–2 s: a VPS recebe algumas
  centenas de req/s mesmo com milhões de visitantes. Recomendação: **1 instância + Cloudflare**; réplicas só sem CDN
  ("pessoas agora" passa a contar ≈ 1/N e cada réplica lê o TSE sozinha).
- **Atualização sob carga**: `update.sh` em 12–47 s, 0 erros (~121 mil requisições durante as trocas no ensaio
  geral); `--rollback` em 4–6 s.
- **Limites conhecidos**: (1) o `tse-historico.json` é serializado no processo principal a cada 30 s; estimado
  ~26 MB numa noite real, ~270 ms de pausa a cada gravação no fim da noite (os clientes e a CDN absorvem; mover para
  gravação incremental é melhoria futura); (2) robôs de prévia que pedem muitas imagens novas do mesmo IP podem
  receber 429 (`OG_LIMITE_MIN`, ajustável sem rebuild); (3) "pessoas agora" conta só quem chega à origem; (4) trocar o
  cenário reconstrói o modelo na thread principal (~1 s; só na simulação).

### 12.6 Dados depois do lançamento

- Quadro de Governador: `UFS_GOV_2T` é a fonte única (§4.1); mudança = uma linha + pipeline (README › Dados). Depois do
  deploy, limpar o cache da CDN em `/data/` e `/geo/` (servidos com `s-maxage` de 1 dia); as imagens OG mudam de
  endereço sozinhas (versão do dataset no `&v=`).
- Retotalizações do TSE no 1º turno: `cargos_build.ts --refresh` e o pipeline; os scripts param com a explicação quando
  o feed e o quadro divergem.

### 12.7 Chaves da noite (leva 3)

Gravadas em `AdminState.noite` (`src/shared/chaves-noite.ts`, `CHAVES_NOITE_PADRAO`): valem na hora para todas as
instâncias, sobrevivem a reinícios, **não sobem a versão** do estado (não invalidam o cache de ninguém) e aparecem em
Painel → Controle → "Chaves da noite" e em `deploy/painel.sh chaves`. Estado salvo sem um campo = o padrão.

| Chave (comando) | Padrão | Desligada / outro valor |
|---|---|---|
| `freio` (`freio 1\|2\|3\|5 [leve]`) | 1, sem leve | consultas × fator; leve = mapa municipal e "desde o 1º turno" parados, chat 2× |
| `contador-publico` | ligado (≥ 500) | "N pessoas agora" some do site, da /live, da /tv e da imagem de audiência |
| `html-borda` | **desligada** | ligada: HTML guardado 15 s na borda (só no congelamento, depois do ensaio) |
| `medir-anuncios` | ligada | `/api/anuncio/evento` responde 204 sem contar |
| `aviso-nacional` (`auto\|off`) | `auto` | `off`: sem o aviso do arquivo nacional parado no público |
| `texto-bots` | ligado | `!apuracao` responde só o endereço |
| `contar-lives` | ligada | batimento 204 sem contar; `/api/live/agora` = null |
| `faixa-conexao` | ligada | sem a faixa "Conexão instável" (`LiveStatus.semFaixaConexao`; o recuo continua) |
| `carimbo-print` | ligado | mapas e placar sem o carimbo (`LiveStatus.semCarimbo`) |
| `meta-placar` | ligado | descrições dos links sem placar |
| `medir-local` | ligada | sem a contagem por estado, país e aparelho (`AUDIENCIA_LOCAL=0` desliga de vez) |
| `pausa-tse` (`auto\|restrita\|off`) | `auto` | `restrita`: só 429/borda do TSE; `off`: nunca pausa (encerra a pausa em curso) |

Ações (não são chaves): `tse-retomar` e `alerta-teste`. Variáveis de ambiente da leva 3 (exigem reinício): `CDN_CC`,
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, `HC_PING_URL`, `ALERTAS`, `AUDIENCIA_LOCAL` e, na VPS compartilhada,
`LIMITE_RECURSOS`/`APP_CPUS`/`APP_CPU_SHARES`/`APP_PIDS` (I19: `gerar_compose_vps` escreve `cpu_shares: 512`, CPU = núcleos
− 1 e `pids: 512` no `docker-compose.vps.yml`, só o que o Docker da máquina aplica; `deploy/limites.sh` mostra e muda na
hora com `docker update`). Ensaio de carga: `scripts/ensaio-borda.ts` (visitantes virtuais, relatório por
`cf-cache-status`, recusa a produção em 24 e 25/10) e a Cloudflare falsa `scripts/cloudflare-falso.ts` (API + mini-CDN).
