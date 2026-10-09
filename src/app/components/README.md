# Componentes do Sintonia

Guia rápido para compor páginas. Vitrine viva: **`/kit`** (este “Core”) e **`/kit/viz`** (mapas, gráfico, mosaico).
Fixtures falsas e consistentes para testes: `src/app/fixtures/core.ts` (`coreFixtures(0 | 35 | 70 | 100)`).

<!-- core:start -->
## Core (design system, layout e dados não-mapa)

Regras que os componentes já cumprem — e que as páginas devem manter:

- **Só tokens** (`bg-surface`, `text-fg-muted`, `border-line`, `bg-cand-a`…). Cores de candidato **sempre** via
  `corSlot(candidato.cor)` de `src/app/lib/raceUi.ts` — nunca escolha cor por partido/nome.
- **Candidatos na ordem da urna** (slot `a` à esquerda/em cima). Nunca reordene por quem lidera.
- **Números**: classe `.num` + formatadores de `src/shared/format.ts`; percentuais de `src/shared/calc.ts`.
- **Simulação sinalizada**: o AppShell já mostra a faixa quando `status.simulacao`; passe `simulado` para
  `Placar`, `ShareCard`/`ShareButton` (e o BU usa `secao.simulado`).
- Evite `divide-line` e `bg-line` puros (o utilitário gerado pelo Tailwind sai com alfa 1, branco/preto chapado).
  Use `border-b border-line` em cada item, ou `bg-[rgb(var(--line)/var(--line-alpha))]`.
- Grids com conteúdo largo: use `grid-cols-1 lg:grid-cols-2` (não só `lg:grid-cols-2`), senão a trilha
  implícita `auto` estoura a largura no celular.

### Importação

```ts
import { Button, Card, Segmented, DataTable, NumberRoll, toast } from '@/app/ui';          // primitivos
import { AppShell } from '@/app/components/layout/AppShell';                               // já no router
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { Container } from '@/app/components/layout/Container';
import { Placar } from '@/app/components/apuracao/Placar';                                 // um arquivo por componente
```

---

### `src/app/lib/` (hooks e utilitários)

| Export | Assinatura / uso |
|---|---|
| `useTheme()` | `{ tema: 'dark' \| 'light', setTema(t), alternar() }` — `data-theme` no `<html>`, persiste em `localStorage['sintonia:tema']`, sincroniza `<meta name="theme-color">` e abas. `aplicarTema(t)` fora de React. |
| `useMediaQuery(q, fallback?)` | `boolean`. Atalhos `useIsDesktop()` (≥ 768 px) e `useReducedMotionPref()`. |
| `useInterval(cb, ms \| null)` | `setInterval` declarativo (`null` pausa). |
| `useNow(ms = 1000)` | relógio local que avança alinhado ao segundo; pausa com a aba oculta. |
| `estimarSimNow(status, recebidoEm, agora)` / `useSimNow(status, recebidoEm)` | interpola o relógio da apuração entre polls (`recebidoEm` = `query.dataUpdatedAt`). |
| `useRaceParam(padrao = 'pres')` | `[race, setRace(id, { replace? })]` em `?race=` (omitido quando `'pres'`; preserva os outros params). |
| `share.ts` | `compartilhar({ titulo?, texto, url? })` (Web Share → WhatsApp), `whatsappUrl(texto, url?)`, `abrirWhatsapp`, `copiarTexto`, `copiarLink(url?)`, `urlAbsoluta(caminho)` (funciona no HashRouter do demo), `hostExibicao()`, `nodeToPngBlob(node, opts)`, `downloadNodeAsPng(node, nome, opts)`, `compartilharNodeComoImagem(node, nome, input)` (html-to-image carregado sob demanda). |
| `raceUi.ts` (**contrato com mapas**) | `corSlot(cor)` → `{ bg, bgSoft, bgFaint, text, textDisplay, ink, fill, stroke, border, ring, glow, css, cssVar }`; `slotDe(race, i)`; `rgbSlot(cor, α)`; `fillMargem(cor, bucket 0–3)` → `rgb(var(--cand-a) / α)`; `MARGEM_ALPHA`, `MARGEM_ROTULOS`; `fillTally(race, tally)`; `fillApurado(pct)` / `fillApuradoTally(t)`; `fillMosaico(ch, cores?)`; `FILL_PENDENTE`, `FILL_EMPATE`, `FILL_NEUTRO`, `STROKE_DIVISA`. `text` tem contraste AA (≥ 4,5:1) nos dois temas; `textDisplay` é para números ≥ 24 px. |

### `src/app/ui/` (primitivos — `import { … } from '@/app/ui'`)

| Componente | Props principais |
|---|---|
| `Icon` | `name: IconName` (ao-vivo, mapa, lista, grade, busca, compartilhar, whatsapp, download, link, copiar, externo, seta, seta-esquerda/cima/baixo, chevron(-cima/-direita/-esquerda), ordenar, fechar, mais, menos, sol, lua, info, alerta, check, check-circulo, selo, urna, relogio, calendario, filtro, ajustes, expandir, recolher, play, pause, reset, rapido, configuracoes, troca, bandeira, olho-fechado, usuarios, globo, pin, casa, grafico, menu, pontos), `size=20`, `title?` (sem title = decorativo), `strokeWidth=1.75`. `ICON_NAMES` lista todos. |
| `Button` | `variant: 'primary'(gradiente da marca) \| 'secondary' \| 'ghost' \| 'outline'`, `size: 'sm'\|'md'\|'lg'`, `icon?`, `iconRight?`, `block?`, `loading?` + props de `<button>`. `ButtonLink` = mesmo visual com `to` (react-router). `buttonClasses()` para casos especiais. |
| `IconButton` | `icon`, `label` (obrigatório, vira aria-label/title), `variant='ghost'`, `size`. |
| `Card` / `CardHeader` | `Card`: `padding: 'none'\|'sm'\|'md'\|'lg'`, `highlight?`, `interactive?`, `as?`. `CardHeader`: `title`, `subtitle?`, `actions?`, `icon?`. |
| `Badge` / `Pill` | `Badge`: `tone: 'neutral'\|'brand'\|'ok'\|'alert'\|'pending'\|'cand-a'\|'cand-b'\|'outros'\|'solid'`, `size: 'xs'\|'sm'\|'md'`, `icon?`, `dot?`, `caps?`. `toneFromCor(cor)`. `Pill`: `active?`. |
| `Segmented<V>` | `options: { value, label, icon?, ariaLabel?, disabled? }[]`, `value`, `onChange`, `ariaLabel`, `size: 'sm'\|'md'`, `block?`, `role: 'radiogroup'\|'tablist'`. Indicador animado, setas do teclado. |
| `Tooltip` | `content`, `children` (1 elemento focável), `side: 'top'\|'bottom'`, `delay=120`. Hover, foco e toque; portal. |
| `Sheet` | `open`, `onClose`, `title`, `description?`, `footer?`, `side: 'right'\|'left'`, `width: 'sm'\|'md'\|'lg'`. Celular: painel inferior com arrastar p/ fechar; desktop: gaveta. Foco preso, Esc, rolagem travada. |
| `Dialog` | `open`, `onClose`, `title`, `description?`, `footer?`, `size: 'sm'\|'md'\|'lg'`. |
| `Skeleton` / `SkeletonText` | `rounded: 'sm'\|'md'\|'lg'\|'full'` + className de tamanho / `lines`. |
| `NumberRoll` | `value`, `format = fmtInt` (ex.: `(n) => fmtPct(n)`), `duration=700`, `smallChars` (ex.: `'%'`), `smallClassName`, `ariaLabel?`. Não anima na 1ª pintura; respeita movimento reduzido. |
| `LiveDot` | `tone: 'live'\|'brand'\|'ok'\|'pending'\|'muted'`, `pulse=true`, `size=8`. |
| `Countdown` | `target` (epoch ms), `now?` (relógio simulado), `size: 'sm'\|'md'\|'lg'`, `hideZeroDays=true`, `doneLabel`. Utilitários `partesTempo(ms)`, `fmtFaltam(ms)` ("2d 4h"). |
| `SearchBox` | `value`, `onChange(v)`, `size: 'sm'\|'md'\|'lg'`, `placeholder`, `trailing?` + props de `<input>`. |
| `Combobox` | `options: { value, label, hint?, keywords? }[]`, `onSelect(opt)`, `value?`, `label?`, `placeholder`, `maxResults=60`, `emptyText`, `size: 'md'\|'lg'`, `openOnFocus=true`. Busca sem acento/caixa, ↑/↓/Enter/Esc, realce do trecho. Helpers `casa`, `pontuar`, `realcar`. |
| `DataTable<R>` | `rows`, `columns: Column<R>[]`, `rowKey`, `onRowClick?`, `rowLabel?`, `rowClassName?`, `initialSort?` ou `sort`+`onSortChange`, `stickyHeader=true`, `stickyOffset` (padrão `var(--app-header-h)`), `maxHeight?` (rolagem interna), `pageSize?` + `itemLabel` ("Ver mais"), `density: 'auto'\|'compact'\|'comfortable'`, `caption`, `empty`. `Column`: `key`, `header`, `headerLabel?`, `cell(row)`, `sortValue?`, `firstDir?`, `align?`, `width?`, `hideBelow?: 'sm'\|'md'\|'lg'`, `grow?` (coluna elástica que trunca → tabela com layout fixo; dê `width` às demais). |
| `Toggle` | `checked`, `onChange`, `label?`, `description?`, `ariaLabel?`, `size`. `role="switch"`. |
| `Slider` | `value`, `onChange`, `min`, `max`, `step`, `label?`, `format?`, `marks?: { value, label? }[]`, `origin?` (preenche a partir dele), `disabled?`. |
| `Select` | `options: { value, label, disabled? }[]`, `label?`, `size` + props de `<select>` (nativo). |
| `Stat` | `label`, `value` (já formatado), `sub?`, `bar?` (0–100), `barClassName?`, `icon?`, `size`, `align`. |
| `ThemeToggle` | `size: 'sm'\|'md'`. |
| `toast(texto, { tone?: 'neutral'\|'ok'\|'alert', icon?, duracao? })` / `<Toaster/>` | o `Toaster` já está no AppShell. |

### `src/app/components/layout/`

| Componente | Props / notas |
|---|---|
| `AppShell` | Já é o `element` do router. Header de vidro fixo (logo, nav, `StatusPill`, `ThemeToggle`), `SimulationRibbon` quando `status.simulacao`, banner `status.aviso` (dispensável), rodapé (links, fontes TSE/IBGE, apartidarismo), tab bar no celular com safe-area, `Toaster`, `ScrollRestoration`. Funciona sem API. Define `--app-header-h` no `<html>` (para `sticky`). |
| `StatusPill` / `StatusPillView` | `StatusPill({ compact? })` lê `useStatus()`. `StatusPillView({ v })` puro, com `statusVisual(status, recebidoEm, agora)`. |
| `Logo` / `LogoMark` | `size`, `showText`. |
| `Container` | largura máx. 1200 px (`wide` → 1440) + gutters 16/24/32 px. |
| `PageHeader` | `title`, `subtitle?`, `eyebrow?`, `breadcrumbs?: Crumb[]`, `actions?`, `children?` (ex.: RaceSwitcher). |
| `Breadcrumbs` | `items: { label, to? }[]` (último = página atual; no celular rola até ele). |
| `Section` | `id?`, `title?`, `description?`, `actions?`, `card?` (envolve num cartão), `contentClassName?`. |
| `NAV` (`nav.ts`) | itens de navegação (rótulo, rota, ícone, regra de ativo). |

### `src/app/components/apuracao/` (dados, não-mapa)

| Componente | Props |
|---|---|
| `CandidateAvatar` | `candidato?` (ou `nome` + `cor`), `size: 'xs'\|'sm'\|'md'\|'lg'\|'xl'`, `eleito?`, `dim?`. Monograma (`iniciais()` ignora títulos como “Professora”). |
| `CandidateName` | `candidato`, `showPartido=true`, `showNumero=true`, `showVice?`, `size: 'sm'\|'md'\|'lg'\|'xl'`, `align`, `colored?`. |
| `Placar` | `race`, `resumo: Summary`, `variant: 'hero'\|'default'\|'compact'`, `titulo?`, `subtitulo?` (compact), `to?`/`onClick?` (compact clicável), `showProgress=true`, `showVice?`, `simulado?`, `actions?` (ex.: `<ShareButton iconOnly/>`). `aria-live` com resumo em 1 casa decimal. Selo “À frente” / “Eleito” / “Matematicamente eleito”; 1º turno mostra “Demais candidatos”. |
| `VoteSplitBar` | `votos`, `cores?`, `apurado?` (trilho), `size: 'xs'\|'sm'\|'md'\|'lg'`, `showMarker=true` (50%), `showLabels?`, `nomes?`, `ariaLabel?`. |
| `ApuracaoProgress` | `resumo` (`secoes`, `secoesTotalizadas`, `ultimaAtualizacao`, `status`), `variant: 'default'\|'compact'\|'inline'`. |
| `StatsGrid` | `t: Tally`, `showValidos?`, `variant: 'cards'\|'list'`. |
| `RestantePanel` | `race`, `resumo`, `restante`. Some quando há eleito/encerrada ou no 1º turno. |
| `EventFeed` | `eventos: FeedEvent[]`, `race?`, `variant: 'list'\|'ticker'`, `max?`, `showUf=true`, `bleed=true` (ticker sangra até a borda; use `false` em cartões), `emptyText`. |
| `RegionBars` | `race`, `regioes`, `ordem?`, `onSelect?(regiao)`. |
| `UfTable` | `race`, `ufs: Partial<Record<UF, Summary>>`, `onSelect?(uf)`, `selected?`, `incluirExterior=true`, `initialSort?`, `maxHeight?`. |
| `MunicipioTable` | `race`, `municipios: MunicipioResumo[]`, `onSelect?(m)`, `pageSize=20`, `searchable=true`, `initialSort?` (padrão: eleitorado ↓). Capital destacada. |
| `ZonaTable` | `race`, `zonas: ZonaResumo[]`, `onSelect?(zona)`, `selected?`. (em `SecaoTable.tsx`) |
| `SecaoTable` | `race`, `secoes: SecaoResumo[]`, `onSelect?(secao)`, `selected?`, `pageSize=30`, `filtros=true` (status + nº). |
| `BoletimUrna` | `secao: SecaoDetalhe`, `race`. Recibo térmico; “aguardando totalização”; carimbo SIMULAÇÃO se `secao.simulado`. |
| `RaceSwitcher` | `races: Race[]`, `value?` (padrão `?race=`), `onChange?` (padrão grava `?race=`), `uf?` (contexto de estado), `incluirPrimeiroTurno?`, `size`. |
| `ShareCard` | `race`, `resumo`, `formato: 'feed'(1080×1350) \| 'story'(1080×1920)`, `simulado?`, `local?`, `caminho='/apuracao'` + `ref` (nó a exportar). `ShareCardPreview({ formato, children })` escala a prévia. `textoCompartilhamento(race, resumo, simulado)`. |
| `ShareButton` | `race`, `resumo`, `simulado?`, `local?`, `caminho?`, `texto?`, `label`, `variant`, `size`, `iconOnly?`. Abre Sheet com prévia, formato e ações (imagem, PNG, WhatsApp, copiar link). |
| `SimulationRibbon` | `variant: 'bar'\|'badge'\|'stamp'`, `detalhe?`. |
| `EmptyState` / `ErrorState` / `LoadingState` | `EmptyState({ icon?, title, description?, action?, compact? })`; `ErrorState({ title?, message?, onRetry?, compact? })`; `LoadingState({ variant: 'placar'\|'placar-compacto'\|'tabela'\|'lista'\|'stats'\|'boletim'\|'pagina', rows? })`. |
| `cells.tsx` | `PctCell`, `MargemCell`, `ApuradoCell`, `CandHeader`, `margemAssinada`, `W` (larguras) — para montar outras tabelas no mesmo padrão. |

### Receita: página nacional (esqueleto)

```tsx
const [race] = useRaceParam();
const { data: meta } = useMeta();
const { data: status } = useStatus();
const q = useNacional(race);
const r = meta?.races.find((x) => x.id === race);
if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
if (!q.data || !r) return <Container><LoadingState variant="pagina" /></Container>;
return (
  <Container>
    <PageHeader title="Apuração" eyebrow="2º turno · 25 de outubro" actions={<ShareButton race={r} resumo={q.data.resumo} simulado={status?.simulacao} />}>
      <RaceSwitcher races={meta!.races} />
    </PageHeader>
    <Placar race={r} resumo={q.data.resumo} variant="hero" simulado={status?.simulacao} />
    <Section title="O que falta"><RestantePanel race={r} resumo={q.data.resumo} restante={q.data.restante} /></Section>
    <Section title="Participação"><StatsGrid t={q.data.resumo} /></Section>
    <Section title="Estados" card><UfTable race={r} ufs={q.data.ufs} onSelect={(uf) => navigate(`/apuracao/${uf.toLowerCase()}?race=${race}`)} /></Section>
  </Container>
);
```
<!-- core:end -->

<!-- viz:start -->
## Visualizações (mapas, gráfico da apuração, mosaico de seções)

Tudo em `src/app/components/apuracao/`, um componente por arquivo. Vitrine e bancada de QA: **`/kit/viz`**
(dados fictícios de `src/app/fixtures/viz.ts`; aceita `?pct=0–100&modo=margem&uf=SP&eixo=horario&so=ufmap|mosaico|brasil|serie`).

Regras que estes componentes já cumprem:

- **Cores só por token**: os preenchimentos são strings `rgb(var(--cand-a) / α)` de `src/app/lib/raceUi.ts`
  (`fillMargem`, `fillApurado`, `fillMosaico`…). No canvas (mosaico) os tokens são lidos do CSS em tempo de execução
  (`mapColors.ts`) e o desenho refaz sozinho quando o tema muda. Nunca hex.
- **Identidade nunca só pela cor**: toda legenda e tooltip traz o nome do candidato; rótulos sobre o mapa escolhem a
  tinta (`fg` ou `bg`) pelo contraste com o preenchimento.
- **Pendente** (nenhuma seção totalizada) = `pending` com hachura sutil, em todos os modos.
- **Acessibilidade**: BrazilMap tem foco por Tab em cada UF (Enter seleciona, Esc fecha) + tabela equivalente
  (`sr-only`); TileMap usa `<button>`; TimelineChart tem setas/Home/End e tabela de checkpoints; SecaoMosaic tem setas,
  PageUp/PageDown (zonas), Enter e anúncio `aria-live`.
- **Toque**: no celular o 1º toque mostra o placar (encaixado abaixo do mapa quando ele tem < 520 px, para não cobrir as
  UFs) e o 2º toque — ou o botão "Ver …" — seleciona.
- **Movimento**: transição de cor nas UFs, pulso quando uma UF troca de líder, desenho da linha, "acendimento" das
  seções no mosaico. Tudo respeita `prefers-reduced-motion`.

### Componentes

| Componente | Props |
|---|---|
| `BrazilMap` | `ufs: Partial<Record<UF, Summary>>` · `race` (`Pick<Race,'candidatos'>`) · `modo?: MapMode` (`'vencedor'`) · `selecionada?: UF \| null` · `onSelect?(uf: UFBr)` · `primeiroTurno?: Partial<Record<UF, { votos }>>` (modo `'variacao'`; ex.: `useNacional('pres-t1').data.ufs`) · `geo?: GeoBrasil` (senão carrega `geo/br.json`) · `rotulos?` (siglas, padrão sim) · `valores?` (valor sob a sigla nas UFs grandes; padrão: mapa ≥ 520 px) · `realcarSelecionada?` (esmaece as demais) · `rotuloAcao?(uf)` · `ariaLabel?` · `className?`. Largura 100%, altura proporcional. RN, PB, PE, AL e SE ganham caixas clicáveis fora da costa; o DF tem callout (alvo ≥ 36 px) posicionado longe das outras siglas. |
| `TileMap` | Mesmas props do BrazilMap (`onSelect?(uf: UF)`), mais `exterior?` (bloco ZZ; padrão: se houver dados de ZZ) e `valores?` (padrão sim). Grade 6 × 8 (`TILE_LAYOUT`). Ideal no celular. |
| `UfMap` | `uf` · `municipios: MunicipioResumo[]` (liga pela chave `ibge`) · `race` · `modo?` · `selecionado?: string` (cód. TSE) · `onSelect?(cod, municipio)` · `destaque?: string[]` (cód. TSE da busca: realça e esmaece o resto; um só → enquadra) · `primeiroTurno?: Record<ibge, { votos }>` (use `votosPorIbge(useUf('pres-t1', uf).data.municipios)`) · `geo?: GeoUfExt` · `alturaMax?` (padrão 70% da janela, ≤ 680 px) · `zoomNoDestaque?` (padrão sim) · `rotuloAcao?(m)`. Zoom: Ctrl/⌘ + roda ou pinça (trackpad/celular), arrastar quando ampliado, duplo clique, botões +/−/enquadrar, teclado `+ − 0` e setas. Capital com contorno e nome; encartes (Fernando de Noronha) com moldura tracejada. |
| `MapLegend` | `modo` + `race`, ou `spec: LegendSpec` pronta · `compacta?` (uma linha, sob o mapa) · `semTitulo?`. |
| `MapModeSwitch` | `value: MapMode` · `onChange(m)` · `modos?: MapMode[]` (ex.: sem `'variacao'` sem 1º turno) · `size?`. Rótulos curtos no celular, rolável. |
| `MapTooltip` | Usado pelos mapas; exportado para reuso: `titulo`, `subtitulo?`, `dados?: Tally & { status?, eleito? }`, `race`, `x`, `y`, `limites: { w, h }`, `fixo?`, `acao?: { label, onClick }`, `extra?`, `encaixado?`, `onFechar?`. |
| `MapDataTable` | Tabela equivalente (sr-only por padrão): `caption`, `race`, `linhas: { id, nome, dados? }[]`, `visivel?`. |
| `TimelineChart` | `serie: SeriePoint[]` · `race` · `eixoX?: 'secoes' \| 'horario'` · `altura?` (padrão 220 celular / 300 desktop) · `viradas?` (padrão sim) · `minPstVirada?` (ignora cruzamentos antes deste %; padrão 1) · `animar?` · `semLegenda?`. Eixo Y simétrico em torno de 50% (2 candidatos) ou 0–máx (1º turno, com "Outros"). Crosshair com mouse, arrastar no celular ou setas. |
| `SecaoMosaic` | `mosaico: ZonaMosaico[]` · `race` · `selecionada?: { zona, secao }` · `onSelect?(zona, secao)` · `zonaDestaque?` (esmaece as outras) · `alturaAlvo?` (escolhe o tamanho da célula; padrão 85% da janela, ≤ 900) · `resumo?` (cabeçalho com totais) · `legenda?` · `animar?`. Canvas com DPR ≤ 2; estados `'0'`, `'a'..'h'`, `'x'`, `'z'`, `'t'` (fonte TSE). `MosaicLegend` é exportado à parte. |

### Módulos de apoio

| Arquivo | Exporta |
|---|---|
| `geo.ts` | `useGeo()` → Brasil, `useGeo(uf)` → municípios: `{ data, error, loading }` (cache em memória, `assetUrl`); `loadGeoBrasil()`, `loadGeoUf(uf)`, `prefetchGeo(uf?)`; `GeoUfExt` (= `GeoUf` + `encartes?`), `pathBBox`, `bboxes`, `parseViewBox`. |
| `mapModes.ts` | `MapMode`, `MAP_MODES` (rótulos), `valorModo(modo, tally, { race, primeiroTurno? })` → `{ fill, pendente, rotulo, valor }`, `legendaModo(modo, race)` → `LegendSpec`, `rotuloApurado(pct)` (nunca mostra 100% antes do fim), `baseFinalistas`, `votosPorIbge`, constantes `MARGEM_MAX_PP` (40), `VARIACAO_MAX_PP` (10), `COMPARECIMENTO_DOMINIO` (68–88%). Variação = % válidos do candidato 0 agora − participação dele entre os dois finalistas no 1º turno. |
| `mapColors.ts` | `useTokenColors()` (tokens RGB do tema atual), `resolveFill(css, tokens)`, `inkToken(fill, tokens)`, `contraste`, `tokenCss(token, α)`. |
| `MapZoom.ts` | `useMapZoom({ w, h, maxK })`: gesto só em `transform` CSS (GPU), consolidado no `<g transform>` ao soltar. |
| `MosaicLayout.ts` | `layoutMosaico(zonas, largura, opts)` (puro, testado), `hitMosaico`, `cellPos`. |
| `MapHatch.tsx`, `MapHooks.ts` | hachura (`<pattern>`/CSS) e hooks (`useElementSize`, `useClickOutside`). |

### Exemplo

```tsx
const [modo, setModo] = useState<MapMode>('vencedor');
const { data: br } = useNacional(race);
const { data: t1 } = useNacional('pres-t1');
<MapModeSwitch value={modo} onChange={setModo} />
<BrazilMap ufs={br.ufs} race={r} modo={modo} primeiroTurno={t1?.ufs}
  onSelect={(uf) => navigate(`/apuracao/${uf.toLowerCase()}?race=${race}`)} />
<MapLegend modo={modo} race={r} compacta />
<TimelineChart serie={br.serie} race={r} />
// UF: <UfMap uf={uf} municipios={ufSnap.municipios} race={r} modo={modo} destaque={codsDaBusca} onSelect={(cod) => …} />
// Município: <SecaoMosaic mosaico={mun.mosaico} race={r} onSelect={(z, s) => navigate(`…/${z}/${s}`)} />
```

### Desempenho medido (build de produção, Chromium headless, `/kit/viz?so=…`)

| Cenário | Desktop 1440 px | Celular 390 px, DPR 3, CPU 4× mais lenta |
|---|---|---|
| UfMap MG (853 municípios): atualização de dados → pintura | mediana 10,5 ms · p90 16,5 ms | mediana 38 ms · p90 54 ms |
| SecaoMosaic 26.683 seções / 57 zonas: atualização → pintura | mediana 12 ms · p90 17 ms | mediana 48 ms · p90 60 ms |
| Mosaico: canvas por atualização (só as seções que mudaram) | mediana 0,1 ms · p90 3,3 ms | mediana 0,8 ms · p90 8 ms |
| Mosaico: desenho completo (só na montagem e na troca de tema) | 25–38 ms | 80–165 ms |

(Os tempos de "atualização → pintura" incluem gerar a fixture e esperar o próximo quadro.)
<!-- viz:end -->
