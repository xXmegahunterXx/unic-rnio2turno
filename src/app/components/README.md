# Componentes do Sintonia

Guia rápido para compor páginas. Vitrine viva: **`/kit`** (este “Core”) e **`/kit/viz`** (mapas, gráfico, mosaico).
Fixtures falsas e consistentes para testes: `src/app/fixtures/core.ts` (`coreFixtures(0 | 35 | 70 | 100)`).

<!-- core:start -->
## Core (design system, layout e dados não-mapa)

Regras que os componentes já cumprem — e que as páginas devem manter:

- **Só tokens** (`bg-surface`, `text-fg-muted`, `border-line`, `bg-cand-a`…). Cores de candidato **sempre** via
  `corSlot(candidato.cor)` de `src/app/lib/raceUi.ts`, com a cor que vem dos dados — nunca pela posição nem por
  classe fixa. `Candidate.cor`: `'vermelho'`/`'azul'` = cores de identificação de Presidente (Lula vermelho, Flávio
  Bolsonaro azul; decisão do dono do produto, fonte única `CORES_IDENTIDADE` em `src/shared/constants.ts`);
  `'a'`/`'b'` = slots neutros turquesa/âmbar (governadores e simulação com nomes ocultos — `anonimizarRace`
  neutraliza as cores); `'outros'` = cinza. Antes da revelação do Teste Cego, nada na cor de candidato.
- **Candidatos na ordem da urna** (menor número à esquerda/em cima). Nunca reordene por quem lidera.
- **Números**: classe `.num` + formatadores de `src/shared/format.ts`; percentuais de `src/shared/calc.ts`.
- **Simulação sinalizada**: o AppShell já mostra a faixa quando `status.simulacao`; passe `simulado` para
  `Placar`, `ShareCard`/`ShareButton` (e o BU usa `secao.simulado`).
- **Linhas**: `border-line`, `bg-line`, `divide-line`, `ring-line`, `decoration-line` saem sempre sutis (o alfa vem
  do tema, `--line-alpha`). O modificador multiplica esse alfa: `border-line/[2]` = 2× mais visível (hover).
- **Texto colorido** usa os tokens `*-fg` (AA ≥ 4,5:1 nos dois temas, inclusive sobre o fundo suave `bg-x/15`):
  `text-brand-fg`, `text-cand-a-fg`, `text-cand-b-fg`, `text-cand-vermelho-fg`, `text-cand-azul-fg`, `text-ok-fg`, `text-alert-fg`. As cores puras
  (`text-cand-a`, `text-brand-2`…) só em números grandes (≥ 24 px, 3:1) e ícones. `corSlot(cor).text` já devolve o `*-fg`.
- **Botões com texto branco** sobre a marca: `bg-brand-cta` (violeta → púrpura, ≥ 4,5:1). `bg-brand-grad`
  (violeta → lilás) é decorativo (barras, realces) — nunca sob texto.
- **Progresso = marca** (`bg-brand`/`bg-brand-grad`), inclusive em 100%. Não use `ok` (verde) perto de dados de
  candidato: fica parecido com o turquesa do slot neutro A.
- **Tabelas respondem à largura delas mesmas** (container query da `DataTable`): use `hideBelowWidth` nas colunas
  secundárias e `soAbaixoDe[...]` para o conteúdo que as substitui (ex.: % apurado sob o nome). Assim a mesma tabela
  fica certa no celular e num cartão de meia largura no desktop. `LARGURA` e `W` (em `cells.tsx`) trazem os padrões.
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
| `share.ts` | (Fase 3: veja "kit de compartilhamento" no fim) `compartilhar({ titulo?, texto, url? })` (Web Share → WhatsApp), `whatsappUrl(texto, url?)`, `abrirWhatsapp`, `copiarTexto`, `copiarLink(url?)`, `urlAbsoluta(caminho)` (funciona no HashRouter do demo), `hostExibicao()`, `nodeToPngBlob(node, opts)`, `downloadNodeAsPng(node, nome, opts)`, `compartilharNodeComoImagem(node, nome, input)` (html-to-image carregado sob demanda). |
| `tokens.ts` | Cores em tempo de execução (fonte única): `tokenCss(token, α)` (único construtor de `rgb(var(--x) / α)`), `useTokenColors()`/`getTokens()` (RGB do tema atual, re-renderiza na troca), `resolveFill(css, tokens)`, `inkToken(fill, tokens)`, `contraste(a, b)`, `rgbCss`. Usado pelo canvas do mosaico e pelos rótulos dos mapas. |
| `raceUi.ts` (**contrato com mapas**) | `corSlot(cor)` → `{ bg, bgSoft, bgFaint, text, textDisplay, ink, fill, stroke, border, ring, glow, css, cssVar, token }` (`text` = AA, `textDisplay` = cor pura para números grandes); `slotDe(race, i)`; `rgbSlot(cor, α)`; `fillMargem(cor, bucket 0–3)` → `rgb(var(--cand-a) / α)`; `MARGEM_ALPHA`, `MARGEM_ROTULOS`; `fillTally(race, tally)`; `fillApurado(pct)` / `fillApuradoTally(t)`; `fillMosaico(ch, cores?)`; `FILL_PENDENTE`, `FILL_EMPATE`, `FILL_NEUTRO`, `STROKE_DIVISA`. `text` tem contraste AA (≥ 4,5:1) nos dois temas; `textDisplay` é para números ≥ 24 px. |

### `src/app/ui/` (primitivos — `import { … } from '@/app/ui'`)

| Componente | Props principais |
|---|---|
| `Icon` | `name: IconName` (ao-vivo, mapa, lista, grade, busca, compartilhar, whatsapp, download, link, copiar, externo, seta, seta-esquerda/cima/baixo, chevron(-cima/-direita/-esquerda), ordenar, fechar, mais, menos, sol, lua, info, alerta, check, check-circulo, selo, urna, relogio, calendario, filtro, ajustes, expandir, recolher, play, pause, reset, rapido, configuracoes, troca, bandeira, olho-fechado, usuarios, globo, pin, casa, grafico, menu, pontos), `size=20`, `title?` (sem title = decorativo), `strokeWidth=1.75`. `ICON_NAMES` lista todos. |
| `Button` | `variant: 'primary'(gradiente da marca) \| 'secondary' \| 'ghost' \| 'outline'`, `size: 'sm'\|'md'\|'lg'`, `icon?`, `iconRight?`, `block?`, `loading?` + props de `<button>`. `ButtonLink` = mesmo visual com `to` (react-router). `buttonClasses()` para casos especiais. |
| `IconButton` | `icon`, `label` (obrigatório, vira aria-label/title), `variant='ghost'`, `size`. |
| `Card` / `CardHeader` | `Card`: `padding: 'none'\|'sm'\|'md'\|'lg'`, `highlight?`, `interactive?`, `as?`. `CardHeader`: `title`, `subtitle?`, `actions?`, `icon?`. |
| `Badge` / `Pill` | `Badge`: `tone: 'neutral'\|'brand'\|'ok'\|'alert'\|'pending'\|'cand-a'\|'cand-b'\|'outros'\|'solid'`, `size: 'xs'\|'sm'\|'md'`, `icon?`, `dot?`, `caps?`. `toneFromCor(cor)`. `Pill`: `active?`. |
| `Segmented<V>` | `options: { value, label, icon?, ariaLabel?, disabled? }[]`, `value`, `onChange`, `ariaLabel`, `size: 'sm'\|'md'`, `block?`, `role: 'radiogroup'\|'tablist'`. Indicador deslizante em CSS (mede só quando a seleção/tamanho muda; memoizado), setas do teclado. |
| `Tooltip` | `content`, `children` (1 elemento focável), `side: 'top'\|'bottom'`, `delay=120`. Hover, foco e toque; portal. |
| `Sheet` | `open`, `onClose`, `title`, `description?`, `footer?`, `side: 'right'\|'left'`, `width: 'sm'\|'md'\|'lg'`. Celular: painel inferior com arrastar p/ fechar; desktop: gaveta. Foco preso, Esc, rolagem travada. |
| `Dialog` | `open`, `onClose`, `title`, `description?`, `footer?`, `size: 'sm'\|'md'\|'lg'`. |
| `Skeleton` / `SkeletonText` | `rounded: 'sm'\|'md'\|'lg'\|'full'` + className de tamanho / `lines`. |
| `NumberRoll` | `value`, `format = fmtInt` (ex.: `(n) => fmtPct(n)`), `duration=700`, `smallChars` (ex.: `'%'`), `smallClassName`, `ariaLabel?`. Não anima na 1ª pintura; respeita movimento reduzido. |
| `LiveDot` | `tone: 'live'\|'brand'\|'ok'\|'pending'\|'muted'`, `pulse=true`, `size=8`. |
| `Countdown` | `target` (epoch ms), `now?` (relógio simulado), `size: 'sm'\|'md'\|'lg'`, `hideZeroDays=true`, `doneLabel`. Utilitários `partesTempo(ms)`, `fmtFaltam(ms)` ("2d 4h"). |
| `SearchBox` | `value`, `onChange(v)`, `size: 'sm'\|'md'\|'lg'`, `placeholder`, `trailing?` + props de `<input>`. |
| `Combobox` | `options: { value, label, hint?, keywords? }[]`, `onSelect(opt)`, `value?`, `label?`, `placeholder`, `maxResults=60`, `emptyText`, `size: 'md'\|'lg'`, `openOnFocus=true`. Busca sem acento/caixa, ↑/↓/Enter/Esc, realce do trecho. Helpers `casa`, `pontuar`, `realcar`. |
| `DataTable<R>` | `rows`, `columns: Column<R>[]`, `rowKey`, `onRowClick?`, `rowLabel?`, `rowClassName?`, `initialSort?` ou `sort`+`onSortChange`, `stickyHeader=true`, `stickyOffset` (padrão `var(--app-header-h)`), `maxHeight?` (rolagem interna), `pageSize?` + `itemLabel` ("Ver mais"), `density: 'auto'\|'compact'\|'comfortable'`, `caption`, `empty`. `Column`: `key`, `header`, `headerLabel?`, `cell(row)`, `sortValue?`, `firstDir?`, `align?`, `width?`, `hideBelow?: 'sm'\|'md'\|'lg'`, `grow?` (coluna elástica que trunca → tabela com layout fixo; dê `width` às demais). | **Colunas**: `hideBelowWidth?: 420 \| 520 \| 640 \| 760` (largura da tabela) — prefira a `hideBelow` (janela); `soAbaixoDe[w]` para conteúdo substituto. Ícone de ordenação fica no respiro da célula (não trunca o rótulo).
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
| `CandidateAvatar` | `candidato?` (ou `nome` + `cor`), `size: 'xs'\|'sm'\|'md'\|'lg'\|'xl'`, `eleito?`, `dim?`, `foto?` (data URI oficial; ausente → monograma; falhou ao carregar → monograma). Mesmo tamanho e anel na cor do slot com ou sem foto. Monograma (`iniciais()` ignora títulos como “Professora”). **Nunca escolha a foto à mão**: use `useFotosRace(race)[i]` (veja “Fase 2”). |
| `CandidateName` | `candidato`, `showPartido=true`, `showNumero=true`, `showVice?`, `size: 'sm'\|'md'\|'lg'\|'xl'`, `align`, `colored?`. |
| `Placar` | `race`, `resumo: Summary`, `variant: 'hero'\|'default'\|'compact'`, `titulo?`, `subtitulo?` (compact), `to?`/`onClick?` (compact clicável), `showProgress=true`, `showVice?`, `simulado?`, `actions?` (ex.: `<ShareButton iconOnly/>`). `aria-live` com resumo em 1 casa decimal. Selo “À frente” / “Eleito” / “Matematicamente eleito”; 1º turno mostra “Demais candidatos”. | `live?` (padrão: só no `hero`) liga o `aria-live`; cartões compactos em grade não anunciam.
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
| `ShareCard` | `race`, `resumo`, `formato: 'x'(1200×675) \| 'feed'(1080×1350) \| 'story'(1080×1920)`, `simulado?`, `local?`, `caminho='/apuracao'` + `ref` (nó a exportar). Moldura = `CartaoBase` do kit (Fase 3). `ShareCardPreview({ formato, children })` escala a prévia. `textoCompartilhamento(race, resumo, simulado, local?)`. |
| `ShareButton` | `race`, `resumo`, `simulado?`, `local?`, `caminho?`, `texto?`, `label`, `variant`, `size`, `iconOnly?`. Abre o `CompartilharSheet` do kit (X, Web Share com PNG, WhatsApp, baixar/salvar, copiar link/texto). |
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
  (`src/app/lib/tokens.ts`) e o desenho refaz sozinho quando o tema muda. Nunca hex.
- **Identidade nunca só pela cor**: toda legenda e tooltip traz o nome do candidato; rótulos sobre o mapa escolhem a
  tinta (`fg` ou `bg`) pelo contraste com o preenchimento.
- **Pendente** (nenhuma seção totalizada) = `pending` com hachura sutil, em todos os modos.
- **Acessibilidade**: BrazilMap e TileMap são **uma** parada de Tab (roving tabindex): as setas andam para a UF
  vizinha naquela direção (`vizinhoNaDirecao` em `MapHooks.ts`), Enter seleciona, Esc fecha; há tabela equivalente
  (`sr-only`) e dica de teclado via `aria-describedby`; TimelineChart tem setas/Home/End e tabela de checkpoints; SecaoMosaic tem setas,
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
| `src/app/lib/tokens.ts` | (antigo `mapColors.ts`, unificado com `raceUi`) `useTokenColors()`, `resolveFill(css, tokens)`, `inkToken(fill, tokens)`, `contraste`, `tokenCss(token, α)`. |
| `MapZoom.ts` | `useMapZoom({ w, h, maxK })`: gesto só em `transform` CSS (GPU), consolidado no `<g transform>` ao soltar. |
| `MosaicLayout.ts` | `layoutMosaico(zonas, largura, opts)` (puro, testado): zonas em "prateleiras" na ordem de leitura (Zona 1, 2, 3 \| 4, 5, 6…); `hitMosaico`, `cellPos`. |
| `MapHatch.tsx`, `MapHooks.ts` | hachura (`<pattern>`/CSS) e hooks (`useElementSize`, `useClickOutside`, `vizinhoNaDirecao`/`ehSeta` para navegação por setas). |

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

<!-- fase2a:start -->
## Fase 2 · frente A (mapa por município, fotos, reveja a noite, Modo TV, pessoas agora, patrocínio)

Tudo em `src/app/components/apuracao/`, um componente por arquivo. Testes das partes puras em `frenteA.test.ts`.

### Fotos oficiais

| Export | Uso |
|---|---|
| `useFotosRace(race, { real?, desligado? })` (`fotos.ts`) | `(string \| undefined)[]` na ordem de `race.candidatos`. Regras embutidas: **nunca** na simulação anonimizada (salvo `real: true`, para dados reais do 1º turno); **tudo ou nada** entre os finalistas (se faltar a foto de um, nenhum tem foto — mesmo tratamento); "Outros" nunca tem foto. Carrega o pacote `data/fotos/{grupo}.json` sob demanda (cache do React Query). |
| `CandidateAvatar foto={fotos[i]}` | Foto recortada em círculo (`object-cover`, sem filtro), moldura na cor do slot + filete da superfície; selo de eleito igual ao do monograma. |

Já usam fotos: `Placar` (hero 56/72 px, default 44/56 px, compact 40 px), `EventFeed` (liderança/virada/eleito: rosto com o ícone num selo), `RegionBars` (rosto de quem lidera; monograma quando anonimizado), cartões de governador/presidente, `EleitoBanner`, destaque do feed, `PreHero`, `LiderancaCard`, `ComparacaoT1` e `ShareCard` (este **só** com dados reais: nunca numa imagem de SIMULAÇÃO).

### `BrazilMunicipiosMap` (canvas, 5.571 municípios)

`snapshot: MunicipiosNacionalSnapshot \| undefined` (de `useMunicipiosBr(race, t, ativo)`) · `race` · `modo?: MapMode` · `primeiroTurno?` (snapshot `-t1`, modo `'variacao'`) · `ufsEscopo?` (governador: municípios fora da UF ficam neutros) · `onSelect?({ uf, cod, ibge, nome })` · `rotuloAcao?` · `alturaMax?` · `estatico?` (Modo TV: sem tooltip/controles) · `busca?` (padrão sim) · `onMedida?` · `ariaLabel?`.

- Carregue com `lazy()` (o chunk tem ~8 KB gzip) e só monte quando a pessoa escolher "Municípios": ele baixa `geo/br-mun.json` (~1,9 MB) e `data/municipios-br.json`. Enquanto isso, esqueleto com a silhueta das UFs.
- `Path2D` + caixas + grade de hit-test criados uma vez por sessão (`prepararMunicipios`, exportado). Três camadas: preenchimentos, divisas (municípios + contorno das UFs) e destaque. Com a mesma vista, uma atualização de dados repinta **só os municípios que mudaram de cor** (fade de 360 ms); zoom/tema/modo → redesenho completo.
- Cores: as mesmas escalas e legendas do mapa por UF (`valorMunBr`, `pctsMunBr`, `baseFinalistasMunBr` em `mapModes.ts`; `legendaModo` serve igual).
- Interação: hover (tooltip com nome, UF, % de cada um, vantagem, comparecimento); clique abre (260 ms de espera para não confundir com o duplo clique, que amplia); toque: 1º mostra (encaixado sob o mapa no celular), 2º abre. Zoom: Ctrl/⌘ + roda ou pinça, duplo clique, botões, teclado `+ − 0`/setas. Busca por nome (ícone de lupa): enquadra e fixa o tooltip.
- Medidas no contêiner: `data-prep-ms`, `data-fill-ms`, `data-fill-modo` (`completo` ou `incremental:N`), `data-borda-ms`, `data-quadro-ms`.

No `MapaPanel` da página nacional: alternância **Estados · Municípios · Blocos**, legenda e a linha "Candidato A à frente em N municípios · Candidato B em M" (`municipiosLiderados`). "Municípios" fica salvo só na sessão (não força os 2 MB em toda visita).

### `LinhaDoTempo` — "Reveja a noite"

`status` · `recebidoEm` (`statusQ.dataUpdatedAt`) · `serie` e `eventos` **ao vivo** (marcos 1/25/50/75/99% e "eleito") · `cores?` (slots, para a faixa de quem liderava em cada momento) · `t` · `onChange(t \| undefined)` · `carregando?` (`q.isPlaceholderData`: o play espera) · `grudar?` (fixa no topo enquanto revendo).

```tsx
const statusQ = useStatus();
const { t, setT } = useInstanteParam(statusQ.data, statusQ.dataUpdatedAt); // ?t=18h42 (ou epoch); nunca futuro
const q = useNacional(race, t);      // instante pedido (sem polling)
const vivo = useNacional(race).data; // marcos da régua
<LinhaDoTempo status={statusQ.data} recebidoEm={statusQ.dataUpdatedAt} serie={vivo.serie} eventos={vivo.eventos}
  cores={r.candidatos.map((c) => c.cor)} t={t} onChange={setT} carregando={q.isPlaceholderData} />
```

- Play = 1 h em 30 s, passos de 1 min (instantes cacheáveis) e só avança quando o passo anterior chegou. Arrastar confirma no máximo a cada 350 ms. Teclado: ←/→ 1 min, Shift/PageUp/PageDown 10 min, Home início, End ao vivo, Espaço play. Some na fase `'pre'`.
- Helpers: `formatarInstante(t)` → `"18h42"`, `lerInstante(s)`, `comInstante(caminho, t)` (links que levam o instante, ex.: `linkUf(uf, race, t)`), `agoraApuracao(status, recebidoEm)`.

### `PessoasAgora`, `PatrocinioSlot`

| Componente | Props |
|---|---|
| `PessoasAgora` | `status` (usa `status.pessoasAgora`; ausente → não renderiza — o demo não tem e **nunca inventamos número**), `variant: 'pill' \| 'inline'`. `textoPessoas(n)` → "12,3 mil pessoas". A `StatusPill` completa mostra o número em ≥ 1280 px. |
| `PatrocinioSlot` | `patrocinio` (`status.patrocinio`; nulo → nada), `variant: 'linha'` ("Oferecido por [logo] Marca", topo) ou `'cartao'` (marca + texto + link, fim da página), `tv?`. Link com `rel="sponsored noopener"`, rotulado como publicidade, sem modal. `urlPatrocinio`, `imagemPatrocinio` (data URI, https ou `/api/patrocinio/logo`). |

Admin: seção **Patrocínio** (`components/pages/admin/SecaoPatrocinio.tsx`, atalho 5): marca (60), texto (140), link https, logo por upload (≤ 60 KB em data URI; rasters maiores são só redimensionados — `prepararLogo`), prévia (topo, cartão e TV), confirmação obrigatória "anunciante não político", Publicar/Remover (`AdminCommand 'patrocinio'`).

### Modo TV (`/tv`, fora do AppShell)

Placar gigante com fotos, mapa grande (estados ou municípios), ticker de eventos, relógio de Brasília, faixa SIMULAÇÃO, QR + endereço (`qr.ts`: `gerarQr(texto, 'L' \| 'M')` + `qrPath`, sem dependência; matrizes conferidas com uma implementação de referência) e patrocínio. Rodízio opcional pelas 5 UFs mais disputadas a cada 12 s. Tela cheia (Fullscreen API, tolera recusa) e Wake Lock. Medidas em `--u` (≈ 1% da altura útil): legível a 3 m em 1920×1080 e 1280×720; em retrato (tablet) empilha. Parâmetros: `?race=gov-xx`, `?mapa=municipios`, `?rodizio=0`. Link "Modo TV" no topo da página nacional (`LinkModoTv`).

### Desempenho do mapa por município (Chromium headless, sem GPU — rasterização por software)

| Medida | Desktop 1440 px | Celular 390 px, DPR 3 (canvas a 2×), CPU 4× mais lenta |
|---|---|---|
| Preparo (uma vez por sessão: 5.571 `Path2D` + caixas + grade) | ~60–70 ms | ~240–265 ms (com o esqueleto na tela) |
| Atualização de dados (só os ~60–100 municípios que mudaram): comandos + rasterização | ~1 ms + ~1 ms | ~1 ms + ~5 ms |
| Redesenho completo (troca de modo, zoom, tema): comandos | mediana 4 ms (1º desenho 9–11 ms) | mediana 16 ms (1º desenho ~45 ms) |
| Redesenho completo: rasterização (software) | ~40 ms | ~170 ms |
| Divisas (municípios + UFs) | ~2 ms | ~10 ms |

Meta de < 120 ms por desenho: cumprida em todos os casos no desktop e nas atualizações ao vivo no celular; o redesenho completo no celular emulado (4× + sem GPU) passa da meta só na rasterização, que nos aparelhos reais é feita pela GPU.
<!-- fase2a:end -->

<!-- integracao:start -->
## Fase 2 · integração (revisão integrada)

| O quê | Onde / como |
|---|---|
| `useNaTela(margem?)` | `src/app/lib/useNaTela.ts` — `[ref, visto]`: libera o download de dados pesados só quando o bloco chega perto da tela. Usado por `LocaisVotacao`, `PerfilEleitorado` (prop `adiar`, padrão sim) e `EleitosUf`/fotos dos cargos. |
| Perfil do eleitorado na UF | `UfPage` → seção "Quem vota aqui" com `<PerfilEleitorado uf nome />` (sem `cod` = total da UF; exterior incluído). |
| Governadores eleitos no 1º turno | `/governadores` termina com `<GovernadoresEleitosT1 mostrarSegundoTurno={false} onSelectUf2t=… />` (as 7 disputas já aparecem acima). Nova prop `mostrarSegundoTurno` (padrão `true`). O mapa (`MapaUfs`) usa a geometria IBGE real: UFs de 2º turno com listras na cor da marca. |
| Nome → ficha | `Placar` (hero/default) liga o nome a `/candidato/:sqcand` quando a corrida tem `sqcand` — nunca na simulação anonimizada (`anonimizarRace` remove a chave) nem no `compact` (já é link). `CandidateName linkFicha` faz o mesmo. |
| Cores dos partidos | Tokens `--partido-1..10` agora em `src/app/styles.css` (escuro, claro e `prefers-color-scheme`), na ordem de `PARTIDOS_COM_COR`. `partidos.ts` não injeta mais `<style>` (`garantirPaletaPartidos` virou no-op por compatibilidade). |
| Textos com artigo | `deUf(uf, nome)` em `components/pages/detalhe/fmt.ts` ("do Amazonas", "da Bahia") — use com `emUf` em vez de "de/em" + nome. |
| `NomeLink quebra` / `PartidoChip` | `quebra` = até 2 linhas em vez de reticências (cartões estreitos do Senado); a sigla do `PartidoChip` cede espaço e o número nunca é cortado. |
<!-- integracao:end -->

### Fase 2 · ajustes finais do orquestrador

- `pages/cargos/MapaUfs` deixou de ser cartograma de blocos: agora desenha o **mapa geográfico real** (public/geo/br.json)
  com as mesmas caixas fora da costa (RN, PB, PE, AL, SE) e o callout do DF do `BrazilMap` (helpers `layoutCaixas`,
  `posicionarCalloutDf`, `OFFSHORE`, `EXTRA_DIREITA` exportados de `apuracao/BrazilMap.tsx`). `CelulaUf.especial`
  (ReactNode) virou `CelulaUf.marca?: 'segundo-turno' | 'pendente'`; duas cores diferentes = listrado (Senado: as 2 vagas;
  bancadas: empate).
- `MunicipioPage` e `ZonasExplorer` (prop `t`) leem `?t=`; a UfPage leva o instante ao abrir um município.
- Paleta: `--partido-2` (PT) e `--partido-3` (MDB) trocaram de valor para separar os dois maiores partidos (PL rosa × PT anil).

<!-- fase3-kit:start -->
## Fase 3 · kit de compartilhamento

Tudo em `src/app/components/share/` (importe de `@/app/components/share`) + `src/app/lib/share.ts`. Objetivo: toda tela
importante vira **imagem + texto + link** bonitos e neutros para o X, inclusive no navegador embutido do app do X.

### Contrato

| Export | Uso |
|---|---|
| `type FormatoCartao = 'x' \| 'feed' \| 'story'` · `DIMENSOES_CARTAO` | `x` 1200×675 (16:9: X, WhatsApp, LinkedIn) · `feed` 1080×1350 (4:5) · `story` 1080×1920 (9:16). `FORMATOS_PADRAO = ['x','feed','story']`. |
| `interface ConteudoCompartilhavel` | `titulo` (do sheet) · `texto` (neutro, **sem url**, ≤ 220 de peso do X) · `caminho` (rota do app; vira URL absoluta, funciona no HashRouter do demo) · `hashtags?` (sem `#`) · `nomeArquivo` (sem extensão) · `cartao?(formato)` (desenha o cartão em px reais) · `formatos?` (o 1º é o inicial) · `simulado?` (prefixa "[SIMULAÇÃO]" no texto, sem duplicar). |
| `BotaoCompartilhar` | `ConteudoCompartilhavel` + `label?` (padrão "Compartilhar"), `variant?`, `size?`, `className?`, `soIcone?`, `icone?`, `descricao?` (linha do sheet), `carregando?` (dados do cartão chegando: as ações de imagem esperam). O cartão só é montado com o sheet aberto. |
| `CompartilharSheet` | o mesmo + `aberto`, `onFechar`. Prévia escalada, seletor de formato, "Postar no X" (link de verdade para `x.com/intent/post`), "Compartilhar…" (Web Share com o PNG quando `canShare({files})`, senão texto+link), WhatsApp, Baixar/Salvar imagem, Copiar link, Copiar texto, contador de caracteres do X. |
| `CartaoBase` | `formato`, `simulado?`, `titulo?`, `rodape?`, `children` (o miolo), `className?` + extras: `sobrancelha?`, `caminho?` (mostrado após o domínio), `instante?` (epoch; `null` esconde; padrão agora), `rotuloInstante?` ("Dados de"), `fonte?`, `selo?` (ex.: `<SeloOficial>Resultado oficial</SeloOficial>`), `brilho?` (`'duelo'` = par neutro turquesa/âmbar, `'marca'`, `'neutro'` ou um par de cores — com candidatos use `brilhoDe(race)`, que pega as cores dos dados). Moldura: fundo com brilho em gradiente (sem blur), logo, URL apresentável (`siteExibicao()`; em prévia/localhost vira "Apuração ao vivo"), data/hora de Brasília. **Simulado** = selo no topo + faixa "SIMULAÇÃO · dados fictícios · não são resultados reais" no rodapé + marca-d'água diagonal (sobrevive a recortes). |
| `useCartao()` | `{ formato, w, h, k, retrato }` dentro do cartão: `k` = escala em relação ao 16:9 (x 1 · feed 1,3 · story 1,42). Escreva o miolo com `style={{ fontSize: 40 * k }}`. |
| `PreviaCartao` | `formato`, `children`, `ref` → nó em tamanho real (é dele que sai o PNG). `ShareCardPreview` (antigo) continua funcionando. |
| Peças | `AvatarCartao` (foto oficial ou monograma, mesmo recorte), `PctGigante`, `BarraDuelo` (marca dos 50%), `PilulaApurado`, `RotuloCartao`, `SeloSimulacao`, `SeloOficial`. |
| `gerarPngCartao(no, w, h)` | PNG 1× via html-to-image, esperando fotos e fontes; embute **só os subconjuntos latinos** das fontes usadas (cache por sessão). No WebKit desenha duas vezes (bug do 1º desenho sem fontes). |

### Textos (`textos.ts`, testados em `textos.test.ts`)

`textoPlacar(race, resumo, { simulado, local })`, `textoInstante`, `textoMomento(evento, simulado)`, `textoSecao`, `textoMunicipioT1`,
`textoGovernadores`, `textoCandidato`, `textoComposicao`, `textoSenadoUf`. Regras: só fatos e números, nada de "vai ganhar"/adjetivos,
"[SIMULAÇÃO]" quando houver número simulado, ≤ `LIMITE_TEXTO` (220) — sobra espaço para o link (23) e até ~34 de hashtags nos 280 do X.
Hashtags neutras em `HASHTAGS` / `hashtags('apuracao' | 'governador' | 'primeiroTurno' | 'senado' | 'camara' | 'assembleia' | 'candidato')`
(no máximo duas). Helpers: `comPrefixoSimulacao`, `limitarTexto`, `finalizar`, `placarEmTexto`.

### `src/app/lib/share.ts` (novidades; as funções antigas continuam)

| Export | Uso |
|---|---|
| `xIntentUrl(texto, url, hashtags?)` · `abrirX(...)` | `https://x.com/intent/post?text=…&url=…&hashtags=a,b` (encodeURIComponent; tira a URL do texto — nunca duplica; corta o texto com "…" se o post passar de 280). |
| `navegadorEmbutido()` / `detectarNavegadorEmbutido(ua)` | `'x' \| 'instagram' \| 'facebook' \| 'tiktok' \| 'linkedin' \| 'outro' \| null` (WebView genérica Android `; wv)` e iOS sem "Safari" = `'outro'`). `NOME_APP_EMBUTIDO`. |
| `podeCompartilharArquivo(file)` · `compartilharArquivo(file, { titulo, texto })` · `compartilharLink(...)` | Web Share; resultado `'compartilhado' \| 'cancelado' \| 'bloqueado' \| 'indisponivel'` (`bloqueado` = gesto expirou/iframe sem permissão → mostre a imagem para salvar). |
| `emIframe()`, `telaDeToque()`, `baixarArquivo(blob, nome)`, `blobParaDataUrl`, `abrirExterno(href)` | apoio do fallback (download silenciosamente bloqueado em WebViews/iframes → modal com `<img src=data:…>` "toque e segure para salvar"). |
| `pesoTextoX`, `pesoPostX`, `textoParaX`, `normalizarHashtags`, `textoComLink`, `LIMITE_X`, `PESO_LINK_X` | contagem ponderada do X (link = 23; fora das faixas latinas = 2). |
| `hostBonito(host)` / `siteExibicao()` | domínio apresentável nas imagens (esconde localhost, IP, portas e domínios de prévia). |

Comportamento do sheet: o PNG do formato atual é gerado **em segundo plano** assim que o sheet abre (e refeito se o cartão mudar —
`MutationObserver`); assim o `navigator.share` sai dentro do gesto do usuário (o Safari recusa se houver espera). Texto e imagem ficam
congelados do momento em que o sheet abriu. No navegador embutido aparece um aviso e "Baixar" vira "Salvar imagem" (modal).

### Cartões prontos (miolo + botão)

| Botão (`share/cartoes/…`) | Onde | Conteúdo |
|---|---|---|
| `ShareButton` (`apuracao/ShareCard.tsx`, API antiga) | Nacional, UF, município | Placar nos 3 formatos: local, % apurado, números gigantes, diferença, barra com 50%, selo "eleito". 1º turno = "Resultado oficial". |
| `BotaoCompartilharSecao` (`Secao.tsx`) | SecaoPage (topo e sob o BU) | "Como votou a minha seção": recibos do 2º turno (carimbo SIMULAÇÃO) e do 1º turno **oficial**, + resumo grande no feed. Antes do dia 25 só o 1º turno. Nunca foto. |
| `BotaoCompartilharMunicipioT1` (`MunicipioT1.tsx`) | MunicipioPage (cartão "1º × 2º turno"; no 1º turno vira o botão do topo) | "Minha cidade no 1º turno": finalistas + demais, comparecimento, brancos e nulos (oficial; fotos se a corrida tiver). |
| `BotaoCompartilharCandidato` (`Candidato.tsx`) | CandidatoPage | Ficha: foto oficial 3:4, nome de urna, número, partido (cor neutra + sigla), cargo, votos e % no 1º turno, situação. |
| `BotaoCompartilharComposicao` (`Cargos.tsx`) | Senado, Câmara (BR/UF), Assembleias (BR/UF) | Mini hemiciclo estático (`posicionar` do Hemiciclo) + maiores bancadas com sigla; cadeiras aguardando o TSE em cinza. |
| `BotaoCompartilharSenadoUf` (`Cargos.tsx`) | Senado com `?uf=` (painel da UF) | Os 2 eleitos com foto oficial (mesmo tamanho e corpo de letra para os dois). |
| `BotaoCompartilharGovernadores` (`Governadores.tsx`) | /governadores | As 7 disputas (placar, barra, % apurado, selo de definida) + resumo dos 7 estados; antes do dia 25, o 1º turno oficial. |
| `BotaoMomento` (`Momento.tsx`) | FeedPanel (nacional) e eventos da UF, via `EventFeed acao` | Evento (virada, liderança, marco, eleito, UF encerrada) + placar daquele instante; link com `?t=` no minuto seguinte (`rotaMomento`). |
| `BotaoInstante` (`Momento.tsx`) | `LinhaDoTempo` enquanto revendo | "Compartilhar este momento": placar do instante + link `?t=18h42`. A régua aceita `compartilhar={{ race, uf, simulado }}` (sem a prop deduz da rota; `false` esconde). |

`EventFeed` ganhou `acao?: (e) => ReactNode` (ação discreta por evento). Para um cartão novo: escreva o miolo com `useCartao()` dentro de
`<CartaoBase formato={f} …>` e passe `cartao={(f) => <MeuCartao formato={f} … />}` a um `BotaoCompartilhar`. Regras: nada de animação
nem `blur` no cartão; números com `.num` e `format.ts`; percentuais de `calc.ts`; **nunca foto real numa imagem com números simulados**.

### Verificação (Playwright, Chromium)

PNG real (download) nos 3 formatos em todos os cartões (≈ 290–470 KB no 16:9, 0,5–0,8 MB no feed, 0,7–1 MB no story), com as fontes da
marca embutidas. UA do app do X + `navigator.share` removido → sem botão "Compartilhar…", "Salvar imagem" abre o modal com a imagem.
Web Share mockado: recebe 1 PNG + texto com link; recusa `NotAllowedError` → modal. Intenção do X: texto sem a URL, `url` à parte.
<!-- fase3-kit:end -->

## Fase 3 · Teste Cego (motor viral)

Arquivos em `src/app/components/pages/teste/` e `src/app/pages/teste/`. Nada sai do aparelho: as imagens são geradas no navegador
(kit `@/app/components/share`) e as respostas só viajam depois do "#" do link do Duelo, com consentimento explícito.

| Peça | O quê |
|---|---|
| Escala | `OPCOES_ESCALA` (sintonia.ts): **discordo totalmente à esquerda → concordo totalmente à direita** (teclas 1–5 na mesma ordem). `EscalaConcordancia` (Quiz.tsx) é usada no quiz e na abertura; a régua do resultado (`AfirmacaoAAfirmacao`) segue a mesma direção. Sem gesto de arrastar (com "concordo" à direita, arrastar para a direita para *voltar* confundiria). |
| `Quiz` | Barra de progresso **grudada sob o header** (`top: var(--app-header-h)`, vidro quase opaco; no desktop vira pílula) — corrige o progresso escondido sob o cabeçalho no iPhone/iframe. Toque tátil (`haptica.ts`, `navigator.vibrate`, respeita movimento reduzido), avanço automático (420 ms), "Voltar", retomada da posição salva, tempo restante pelo ritmo da pessoa (`segundosRestantes`/`textoRestante`), `ids?` (subconjunto) e `selo?`. |
| `AfirmacaoEntrada` | A 1ª afirmação já respondível na abertura (`/teste` e Duelo): um toque grava só na aba e abre o quiz na seguinte. Com teste em andamento, mostra a próxima ("Continue de onde parou"). |
| Modo rápido | `/teste?s=<semente>&r=1`: 12 afirmações, uma por tema (`selecaoRapida(seed)` sorteia entre as 696 combinações equilibradas: concordar aproxima dos dois por igual ±1, opostas ±1, mesma base de cálculo ±1, ≤ 1 controle). Mesmo código de URL (as de fora vão como "não respondida" e ficam fora da conta — fórmula igual). `conjuntoRespondido(respostas)` reconhece o modo no resultado e no Duelo; o resultado oferece "Completar o teste" (retoma com as respostas dadas). |
| Revelação | `useRevelacao(chave)`: pronto (botão "Revelar minha sintonia") → analisando (~1,3 s, anéis girando, `TrilhaAnalise`) → revelado (os dois medidores viram juntos, toque tátil). Compartilhar e detalhes só aparecem depois da revelação. Já revelado na aba = abre revelado (guarda só um hash do código). |
| Compartilhar | `PainelCompartilhar`: "Desafio" (padrão, não mostra o resultado) × "Meu resultado" (opt-in com aviso de dado sensível); link sempre `/teste`. `PainelDuelo`: aviso de que quem abrir verá as respostas (e que no X o link é público) + caixa "Entendi" que libera X/WhatsApp/Enviar/Copiar/Imagem. `PainelResultadoDuelo`: só o placar entre as duas pessoas. |
| Cartões (CartaoTeste.tsx) | Sobre o `CartaoBase`, nos 3 formatos: `CartaoDesafio`, `CartaoMeuResultado` (anel em `conic-gradient`, foto só quando o teste já mostra fotos), `CartaoDuelo`, `CartaoConviteDuelo`. Sem número simulado ⇒ sem selo de simulação. |
| Textos (textosTeste.ts) | `textoDesafio`, `textoMeuResultado`, `textoDuelo`, `textoConviteDuelo`, `HASHTAGS_TESTE` (testados: ≤ 220 de peso, neutros, ordem da urna). |
