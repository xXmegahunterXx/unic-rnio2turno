/**
 * /kit — vitrine do design system e dos componentes de dados (QA visual).
 * Usa fixtures falsas (src/app/fixtures/core.ts) em 4 instantes: aguardando, 35%, 70% e 100% (eleito).
 * Parâmetros de URL: ?t=0|35|70|100 (instante) — útil para screenshots automatizados.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { LiveStatus, RaceId, UF } from '@/shared/types';
import { INICIO_APURACAO, UF_NOMES } from '@/shared/constants';
import { fmtCompact, fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { coreFixtures, INSTANTES, INSTANTE_ROTULO, RACES, type Instante } from '@/app/fixtures/core';
import { cn } from '@/app/lib/cn';
import { MARGEM_ROTULOS, fillMargem, FILL_PENDENTE } from '@/app/lib/raceUi';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Combobox,
  Countdown,
  DataTable,
  Dialog,
  Icon,
  ICON_NAMES,
  IconButton,
  LiveDot,
  NumberRoll,
  Pill,
  SearchBox,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Slider,
  Stat,
  ThemeToggle,
  Toggle,
  Tooltip,
  toast,
  type Column,
} from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { Breadcrumbs } from '@/app/components/layout/Breadcrumbs';
import { StatusPillView } from '@/app/components/layout/StatusPill';
import { ApuracaoProgress } from '@/app/components/apuracao/ApuracaoProgress';
import { BoletimUrna } from '@/app/components/apuracao/BoletimUrna';
import { CandidateAvatar, CandidateName } from '@/app/components/apuracao/CandidateAvatar';
import { EventFeed } from '@/app/components/apuracao/EventFeed';
import { MunicipioTable } from '@/app/components/apuracao/MunicipioTable';
import { Placar } from '@/app/components/apuracao/Placar';
import { RaceSwitcher } from '@/app/components/apuracao/RaceSwitcher';
import { RegionBars } from '@/app/components/apuracao/RegionBars';
import { RestantePanel } from '@/app/components/apuracao/RestantePanel';
import { SecaoTable, ZonaTable } from '@/app/components/apuracao/SecaoTable';
import { ShareButton, ShareCard, ShareCardPreview } from '@/app/components/apuracao/ShareCard';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { EmptyState, ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { StatsGrid } from '@/app/components/apuracao/StatsGrid';
import { UfTable } from '@/app/components/apuracao/UfTable';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';

type ShellModo = 'api' | 'sim' | 'vivo' | 'aviso';

const SECOES = [
  ['fundamentos', 'Fundamentos'],
  ['controles', 'Controles'],
  ['overlays', 'Sobreposições'],
  ['feedback', 'Feedback'],
  ['icones', 'Ícones'],
  ['layout', 'Layout'],
  ['placar', 'Placar'],
  ['participacao', 'Participação'],
  ['eventos', 'Eventos'],
  ['tabelas', 'Tabelas'],
  ['boletim', 'Boletim'],
  ['compartilhar', 'Compartilhar'],
  ['estados', 'Estados'],
] as const;

export default function KitPage() {
  const [params, setParams] = useSearchParams();
  const tParam = Number(params.get('t'));
  const instante: Instante = (INSTANTES as number[]).includes(tParam) ? (tParam as Instante) : 70;
  const fx = useMemo(() => coreFixtures(instante), [instante]);
  // Injeta um LiveStatus falso no cache do React Query para revisar o AppShell (pílula, faixa, aviso).
  const qc = useQueryClient();
  const [shell, setShell] = useState<ShellModo>('api');
  useEffect(() => {
    if (shell === 'api') {
      qc.removeQueries({ queryKey: ['status'] });
      return;
    }
    const st: LiveStatus = {
      ...fx.status,
      wallNow: Date.now(),
      fonte: shell === 'vivo' ? 'tse' : 'simulacao',
      simulacao: shell !== 'vivo',
      aviso:
        shell === 'aviso'
          ? { nivel: 'alerta', texto: 'O TSE informa instabilidade momentânea na divulgação. Os números podem demorar alguns minutos para atualizar.' }
          : null,
    };
    qc.setQueryData(['status'], st);
  }, [shell, fx, qc]);
  const setInstante = (v: Instante) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('t', String(v));
        return n;
      },
      { replace: true, preventScrollReset: true },
    );

  return (
    <Container>
      <PageHeader
        eyebrow="Design system · QA visual"
        title="Kit Sintonia"
        subtitle="Todos os componentes do app com dados fictícios consistentes. Troque o instante da apuração e o tema para revisar cada estado."
        breadcrumbs={[{ label: 'Início', to: '/' }, { label: 'Kit' }]}
        actions={
          <>
            <ButtonLink to="/kit/viz" variant="outline" size="sm" iconRight="seta">
              Mapas e gráficos
            </ButtonLink>
            <ThemeToggle />
          </>
        }
      />

      {/* barra de controle do kit */}
      <div className="sticky z-30 mb-2 rounded-2xl border border-line bg-surface/95 px-3 py-2.5 shadow-card backdrop-blur-md" style={{ top: 'calc(var(--app-header-h, 64px) + 8px)' }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Instante</span>
          <Segmented<`${Instante}`>
            ariaLabel="Instante da apuração"
            size="sm"
            value={String(instante) as `${Instante}`}
            onChange={(v) => setInstante(Number(v) as Instante)}
            options={INSTANTES.map((i) => ({ value: String(i) as `${Instante}`, label: INSTANTE_ROTULO[i] }))}
          />
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-muted sm:ml-2">Shell</span>
          <Segmented<ShellModo>
            ariaLabel="Status simulado do AppShell"
            size="sm"
            value={shell}
            onChange={setShell}
            options={[
              { value: 'api', label: 'Sem API' },
              { value: 'sim', label: 'Simulação' },
              { value: 'vivo', label: 'Ao vivo' },
              { value: 'aviso', label: 'Aviso' },
            ]}
          />
        </div>
        <nav aria-label="Seções do kit" className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 scrollbar-none">
          {SECOES.map(([id, nome]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              {nome}
            </a>
          ))}
        </nav>
      </div>

      <Fundamentos />
      <Controles />
      <Sobreposicoes />
      <Feedback />
      <Icones />
      <LayoutDemo />

      {/* ------------------------------------------------------------------ apuração */}
      <Section id="placar" title="Placar" description="Hero (nacional), default (UF/município) e compacto (cartões de governador). Candidatos sempre na ordem da urna.">
        <div className="space-y-4">
          <Placar race={fx.race} resumo={fx.nacional.resumo} variant="hero" simulado actions={<ShareButton race={fx.race} resumo={fx.nacional.resumo} simulado iconOnly />} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Placar race={fx.race} resumo={fx.uf.resumo} variant="default" titulo="Rio de Janeiro · Presidente" />
            <Placar race={fx.raceT1} resumo={fx.resumoT1} variant="default" titulo="Brasil · 1º turno (resultado oficial)" showProgress={false} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fx.governadores.map((g) => (
              <Placar key={g.race.id} race={g.race} resumo={g.resumo} variant="compact" titulo={UF_NOMES[g.race.abrangencia as UF]} subtitulo="Governador" to={`/kit?t=${instante}`} />
            ))}
          </div>
        </div>
      </Section>

      <Section id="barras" title="Barra dividida e progresso">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="VoteSplitBar" subtitle="Tamanhos xs → lg; trilho de % apurado; 3 segmentos (1º turno)." />
            <div className="space-y-5">
              <VoteSplitBar votos={fx.nacional.resumo.votos} size="xs" />
              <VoteSplitBar votos={fx.nacional.resumo.votos} size="sm" showLabels />
              <VoteSplitBar votos={fx.nacional.resumo.votos} size="md" apurado={(fx.nacional.resumo.secoesTotalizadas / fx.nacional.resumo.secoes) * 100} />
              <VoteSplitBar votos={fx.nacional.resumo.votos} size="lg" />
              <VoteSplitBar votos={fx.resumoT1.votos} cores={['a', 'b', 'outros']} size="md" showLabels />
              <VoteSplitBar votos={[0, 0]} size="md" />
            </div>
          </Card>
          <Card>
            <CardHeader title="ApuracaoProgress" subtitle="default · compact · inline" />
            <ApuracaoProgress resumo={fx.nacional.resumo} />
            <div className="my-5 border-t border-line" />
            <ApuracaoProgress resumo={fx.nacional.resumo} variant="compact" />
            <div className="my-5 border-t border-line" />
            <ApuracaoProgress resumo={fx.nacional.resumo} variant="inline" />
          </Card>
        </div>
      </Section>

      <Section id="participacao" title="Participação" description="Comparecimento e abstenção sobre o eleitorado apurado; brancos e nulos sobre o comparecimento.">
        <StatsGrid t={fx.nacional.resumo} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <RestantePanel race={fx.race} resumo={fx.nacional.resumo} restante={fx.nacional.restante} />
          {fx.nacional.resumo.eleito !== null || fx.nacional.resumo.status === 'encerrada' ? (
            <Card>
              <EmptyState compact icon="check-circulo" title="RestantePanel some quando há eleito" description="Troque o instante para 35% ou 70% para vê-lo." />
            </Card>
          ) : null}
          <Card>
            <CardHeader title="StatsGrid · lista" />
            <StatsGrid t={fx.uf.resumo} variant="list" />
          </Card>
        </div>
      </Section>

      <Section id="eventos" title="Eventos e regiões">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="EventFeed" subtitle="Mais recentes primeiro" icon={<Icon name="ao-vivo" size={18} />} />
            <EventFeed eventos={fx.nacional.eventos} race={fx.race} max={7} />
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="EventFeed · ticker" subtitle="Faixa deslizável (celular)" />
              <EventFeed eventos={fx.nacional.eventos} race={fx.race} variant="ticker" bleed={false} />
            </Card>
            <Card>
              <CardHeader title="RegionBars" />
              <RegionBars race={fx.race} regioes={fx.nacional.regioes} />
            </Card>
          </div>
        </div>
      </Section>

      <Section id="tabelas" title="Tabelas" description="Ordenáveis, com cabeçalho fixo e linhas clicáveis.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="UfTable" subtitle="27 UFs + exterior" />
            <UfTable race={fx.race} ufs={fx.nacional.ufs} onSelect={(uf) => toast(`Abrir ${UF_NOMES[uf]}`)} selected="RJ" maxHeight={520} />
          </Card>
          <Card>
            <CardHeader title="MunicipioTable" subtitle="Busca sem acento: tente “sao goncalo”" />
            <MunicipioTable race={fx.race} municipios={fx.uf.municipios} onSelect={(m) => toast(`Abrir ${m.nome}`)} pageSize={10} />
          </Card>
          <Card>
            <CardHeader title="ZonaTable" subtitle="Zonas do Rio de Janeiro" />
            <ZonaTable race={fx.race} zonas={fx.zonasRio.slice(0, 10)} onSelect={(z) => toast(`Zona ${z}`)} selected={4} />
          </Card>
          <Card>
            <CardHeader title="SecaoTable" subtitle={`${fx.zona.nomeMunicipio} · ${fx.zona.zona}ª zona`} />
            <SecaoTable race={fx.race} secoes={fx.zona.secoes} onSelect={(s) => toast(`Seção ${s}`)} pageSize={10} />
          </Card>
        </div>
      </Section>

      <Section id="boletim" title="Boletim de Urna" description="Estilo recibo térmico; carimbo SIMULAÇÃO quando simulado.">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <BoletimUrna secao={fx.secao} race={fx.race} />
          <BoletimUrna secao={fx.secaoPendente} race={fx.race} />
        </div>
      </Section>

      <Section id="compartilhar" title="Compartilhar" description="Cartões 1080×1350 e 1080×1920 gerados com html-to-image.">
        <div className="flex flex-wrap items-center gap-3">
          <ShareButton race={fx.race} resumo={fx.nacional.resumo} simulado />
          <ShareButton race={fx.governadores[4].race} resumo={fx.governadores[4].resumo} simulado label="Compartilhar RJ" variant="outline" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-[minmax(0,320px)_minmax(0,220px)]">
          <ShareCardPreview formato="feed">
            <ShareCard race={fx.race} resumo={fx.nacional.resumo} formato="feed" simulado />
          </ShareCardPreview>
          <ShareCardPreview formato="story">
            <ShareCard race={fx.race} resumo={fx.nacional.resumo} formato="story" simulado />
          </ShareCardPreview>
        </div>
      </Section>

      <Section id="estados" title="Estados e sinalização">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-line">
            <SimulationRibbon />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <SimulationRibbon variant="badge" />
            <SimulationRibbon variant="stamp" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card padding="none">
              <EmptyState title="Nenhuma seção nesta zona" description="Confira o número da zona no seu título de eleitor." action={<Button size="sm" variant="outline" icon="busca">Buscar seção</Button>} />
            </Card>
            <Card padding="none">
              <ErrorState onRetry={() => toast('Tentando de novo…')} />
            </Card>
            <Card>
              <LoadingState variant="placar-compacto" />
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LoadingState variant="placar" />
            <LoadingState variant="tabela" rows={5} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <LoadingState variant="stats" className="lg:col-span-2" />
            <LoadingState variant="lista" rows={4} />
          </div>
          <LoadingState variant="boletim" />
        </div>
      </Section>
    </Container>
  );
}

// -------------------------------------------------------------------------------------------------

function Swatch({ cls, nome, borda }: { cls: string; nome: string; borda?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={cn('h-14 rounded-xl', cls, borda && 'border border-line')} />
      <div className="mt-1.5 truncate font-mono text-[11px] text-fg-muted">{nome}</div>
    </div>
  );
}

function Fundamentos() {
  return (
    <Section id="fundamentos" title="Fundamentos" description="Tokens de cor (tema atual), tipografia e escala de margem dos mapas.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cores" subtitle="Superfícies, texto, marca, slots de candidato e estados" />
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            <Swatch cls="bg-bg" nome="bg" borda />
            <Swatch cls="bg-surface" nome="surface" borda />
            <Swatch cls="bg-surface-2" nome="surface-2" />
            <Swatch cls="bg-surface-3" nome="surface-3" />
            <Swatch cls="bg-fg" nome="fg" />
            <Swatch cls="bg-fg-muted" nome="fg-muted" />
            <Swatch cls="bg-brand" nome="brand" />
            <Swatch cls="bg-brand-2" nome="brand-2" />
            <Swatch cls="bg-brand-grad" nome="brand-grad" />
            <Swatch cls="bg-cand-a" nome="cand-a" />
            <Swatch cls="bg-cand-b" nome="cand-b" />
            <Swatch cls="bg-cand-vermelho" nome="cand-vermelho" />
            <Swatch cls="bg-cand-azul" nome="cand-azul" />
            <Swatch cls="bg-cand-outros" nome="cand-outros" />
            <Swatch cls="bg-ok" nome="ok" />
            <Swatch cls="bg-alert" nome="alert" />
            <Swatch cls="bg-pending" nome="pending" />
            <Swatch cls="bg-cand-a-soft" nome="cand-a-soft" />
            <Swatch cls="bg-cand-b-soft" nome="cand-b-soft" />
            <Swatch cls="bg-cand-vermelho-soft" nome="cand-vermelho-soft" />
            <Swatch cls="bg-cand-azul-soft" nome="cand-azul-soft" />
            <Swatch cls="bg-fg-subtle" nome="fg-subtle" />
            <Swatch cls="bg-brand-deep" nome="brand-deep" />
            <Swatch cls="bg-brand-cta" nome="brand-cta" />
          </div>
          <div className="mt-5">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
              Texto colorido (AA ≥ 4,5:1) · tokens <span className="font-mono normal-case tracking-normal">*-fg</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] font-semibold">
              <span className="text-brand-fg">brand-fg</span>
              <span className="text-cand-a-fg">cand-a-fg</span>
              <span className="text-cand-b-fg">cand-b-fg</span>
              <span className="text-cand-vermelho-fg">cand-vermelho-fg</span>
              <span className="text-cand-azul-fg">cand-azul-fg</span>
              <span className="text-ok-fg">ok-fg</span>
              <span className="text-alert-fg">alert-fg</span>
              <span className="text-fg-subtle">fg-subtle</span>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Margem (mapas) · raceUi.fillMargem</div>
            {(['vermelho', 'azul', 'a', 'b'] as const).map((c) => (
              <div key={c} className="mb-1.5 grid grid-cols-5 gap-1.5">
                <div className="h-7 rounded-md" style={{ background: FILL_PENDENTE }} title="pendente" />
                {([0, 1, 2, 3] as const).map((b) => (
                  <div key={b} className="h-7 rounded-md" style={{ background: fillMargem(c, b) }} title={MARGEM_ROTULOS[b]} />
                ))}
              </div>
            ))}
            <div className="grid grid-cols-5 gap-1.5 text-[10.5px] text-fg-muted">
              <span>pendente</span>
              {MARGEM_ROTULOS.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Tipografia" subtitle="Bricolage Grotesque (display) · Inter (texto) · JetBrains Mono (códigos)" />
          <div className="space-y-4">
            <div className="font-display text-[56px] font-semibold leading-none tracking-[-0.045em] text-fg">
              <span className="num">50,62</span>
              <span className="text-[0.45em]">%</span>
            </div>
            <div className="font-display text-[32px] font-semibold leading-tight tracking-[-0.03em]">Apuração ao vivo</div>
            <div className="font-display text-[20px] font-semibold tracking-[-0.02em]">Título de seção</div>
            <p className="text-[15px] leading-relaxed text-fg">
              Texto corrido em Inter, 15 px. Com <span className="num font-semibold">63,21%</span> das seções totalizadas, a
              diferença é de <span className="num font-semibold">{fmtInt(1234567)}</span> votos.
            </p>
            <p className="text-[13px] text-fg-muted">Texto secundário (fg-muted) — contraste AA nos dois temas.</p>
            <p className="font-mono text-[13px] text-fg">ZONA 0004 · SEÇÃO 0127 · 5C8E.1A2F.9B3D.47E0</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl bg-surface px-3 py-2 text-[12px] text-fg-muted shadow-card">shadow-card</span>
              <span className="rounded-xl bg-surface px-3 py-2 text-[12px] text-fg-muted shadow-glow">shadow-glow</span>
              <span className="text-grad font-display text-[22px] font-semibold">text-grad</span>
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function Controles() {
  const [seg, setSeg] = useState<'mapa' | 'lista' | 'grade'>('mapa');
  const [seg2, setSeg2] = useState<'br' | 'uf' | 'mun'>('br');
  const [on, setOn] = useState(true);
  const [on2, setOn2] = useState(false);
  const [val, setVal] = useState(50.4);
  const [delta, setDelta] = useState(-1.5);
  const [sel, setSel] = useState('normal');
  const [q, setQ] = useState('');
  const [uf, setUf] = useState<string | null>('SP');
  const [race, setRace] = useState<RaceId>('pres');
  const ufOpts = useMemo(
    () => (Object.keys(UF_NOMES) as UF[]).filter((u) => u !== 'ZZ').map((u) => ({ value: u, label: UF_NOMES[u], hint: u, keywords: u })),
    [],
  );
  return (
    <Section id="controles" title="Controles" description="Botões, selos, segmentados, interruptores, sliders, selects e busca.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Button" subtitle="primary (gradiente da marca) · secondary · outline · ghost" />
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary" icon="ao-vivo">Ver apuração</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="outline" iconRight="seta">Contorno</Button>
            <Button variant="ghost">Fantasma</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" size="sm">Pequeno</Button>
            <Button variant="primary" size="lg" iconRight="seta">Grande</Button>
            <Button variant="secondary" loading>Gerando</Button>
            <Button variant="outline" disabled>Desabilitado</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <IconButton icon="compartilhar" label="Compartilhar" />
            <IconButton icon="download" label="Baixar" variant="secondary" />
            <IconButton icon="filtro" label="Filtrar" variant="outline" />
            <IconButton icon="configuracoes" label="Configurações" size="sm" />
            <IconButton icon="expandir" label="Expandir" size="lg" variant="secondary" />
          </div>
          <div className="mt-3">
            <Button variant="primary" size="lg" block icon="olho-fechado">
              Fazer o Teste Cego
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Badge · Pill · LiveDot" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Neutro</Badge>
            <Badge tone="brand" dot>Marca</Badge>
            <Badge tone="ok" icon="check">Totalizada</Badge>
            <Badge tone="alert" icon="alerta">Instável</Badge>
            <Badge tone="pending">Aguardando</Badge>
            <Badge tone="cand-a" caps icon="seta-cima">À frente</Badge>
            <Badge tone="cand-b" caps icon="check">Eleito</Badge>
            <Badge tone="solid" size="xs">NOVO</Badge>
            <Badge tone="brand" size="md">Médio</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill>
              <LiveDot /> Ao vivo
            </Pill>
            <Pill>
              <LiveDot tone="brand" /> Simulação
            </Pill>
            <Pill>
              <LiveDot tone="ok" pulse={false} /> Encerrada
            </Pill>
            <Pill active>Ativa</Pill>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPillView v={{ tipo: 'pre', faltaMs: 15 * 86400_000 + 4 * 3600_000 }} />
            <StatusPillView v={{ tipo: 'apurando', simulacao: false, simNow: INICIO_APURACAO + 6123_000, parado: false }} />
            <StatusPillView v={{ tipo: 'apurando', simulacao: true, simNow: INICIO_APURACAO + 6123_000, parado: false }} />
            <StatusPillView v={{ tipo: 'encerrada', simulacao: false }} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {RACES[0].candidatos.map((c) => (
              <CandidateAvatar key={c.numero} candidato={c} size="xl" />
            ))}
            <CandidateAvatar candidato={RACES[0].candidatos[0]} size="lg" eleito />
            <CandidateAvatar candidato={RACES[0].candidatos[1]} size="md" />
            <CandidateAvatar nome="Professora Maria do Carmo" cor="a" size="sm" />
            <CandidateAvatar nome="Outros" cor="outros" size="xs" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <CandidateName candidato={RACES[0].candidatos[0]} showVice size="lg" />
            <CandidateName candidato={RACES[0].candidatos[1]} showVice size="lg" align="right" colored />
          </div>
        </Card>
        <Card>
          <CardHeader title="Segmented · Toggle" />
          <div className="space-y-3">
            <Segmented
              ariaLabel="Visualização"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'mapa', label: 'Mapa', icon: 'mapa' },
                { value: 'lista', label: 'Lista', icon: 'lista' },
                { value: 'grade', label: 'Blocos', icon: 'grade' },
              ]}
            />
            <Segmented
              ariaLabel="Nível"
              value={seg2}
              onChange={setSeg2}
              size="sm"
              block
              options={[
                { value: 'br', label: 'Brasil' },
                { value: 'uf', label: 'Estados' },
                { value: 'mun', label: 'Municípios' },
              ]}
            />
            <RaceSwitcher races={RACES} value={race} onChange={setRace} />
            <div className="num text-[12px] text-fg-muted">race = {race}</div>
          </div>
          <div className="mt-5 space-y-4 border-t border-line pt-4">
            <Toggle checked={on} onChange={setOn} label="Atualizar automaticamente" description="Busca novos números a cada poucos segundos." />
            <Toggle checked={on2} onChange={setOn2} label="Mostrar margem no mapa" size="sm" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Slider · Select · Busca" />
          <div className="space-y-6">
            <Slider
              label="Alvo nacional (candidato A)"
              value={val}
              onChange={setVal}
              min={40}
              max={60}
              step={0.1}
              format={(v) => fmtPct(v, 1)}
              marks={[{ value: 40, label: '40%' }, { value: 45 }, { value: 50, label: '50%' }, { value: 55 }, { value: 60, label: '60%' }]}
            />
            <Slider
              label="Comparecimento vs 1º turno"
              value={delta}
              onChange={setDelta}
              min={-5}
              max={5}
              step={0.5}
              origin={0}
              format={(v) => fmtPP(v)}
              marks={[{ value: -5, label: '−5' }, { value: 0, label: '0' }, { value: 5, label: '+5' }]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Ritmo"
                value={sel}
                onChange={(e) => setSel(e.target.value)}
                options={[
                  { value: 'rapido', label: 'Rápido' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'lento', label: 'Lento' },
                ]}
              />
              <Select label="Tamanho sm" size="sm" options={[{ value: '1', label: 'Opção um' }]} />
            </div>
            <SearchBox value={q} onChange={setQ} placeholder="Buscar município, zona ou seção" />
            <Combobox label="Estado (combobox)" options={ufOpts} value={uf} onSelect={(o) => setUf(o.value)} placeholder="Digite: “sao”, “para”, “RJ”…" />
          </div>
        </Card>
      </div>
    </Section>
  );
}

function Sobreposicoes() {
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  return (
    <Section id="overlays" title="Sobreposições" description="Tooltip (hover/foco/toque), Sheet (inferior no celular, lateral no desktop), Dialog e Toast.">
      <Card>
        <div className="flex flex-wrap items-center gap-2.5">
          <Tooltip content="Seções totalizadas: boletins já recebidos e somados pelo TSE.">
            <Button variant="outline" icon="info">
              Tooltip
            </Button>
          </Tooltip>
          <Tooltip content="Compartilhar" side="bottom">
            <IconButton icon="compartilhar" label="Compartilhar (tooltip embaixo)" showTitle={false} variant="secondary" />
          </Tooltip>
          <Button variant="secondary" icon="filtro" onClick={() => setSheet(true)}>
            Abrir Sheet
          </Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Abrir Dialog
          </Button>
          <Button variant="ghost" icon="check" onClick={() => toast('Link copiado', { tone: 'ok', icon: 'link' })}>
            Toast
          </Button>
          <Button variant="ghost" icon="alerta" onClick={() => toast('Não foi possível gerar a imagem', { tone: 'alert' })}>
            Toast de erro
          </Button>
        </div>
      </Card>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filtros do mapa"
        description="Arraste para baixo para fechar (celular)."
        footer={
          <div className="flex gap-2 pb-1">
            <Button variant="ghost" onClick={() => setSheet(false)} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => setSheet(false)} className="flex-1">
              Aplicar
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pt-2">
          <Toggle checked onChange={() => {}} label="Somente municípios apurados" />
          <Toggle checked={false} onChange={() => {}} label="Destacar capitais" />
          <SkeletonText lines={6} />
        </div>
      </Sheet>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Como lemos os números"
        description="Percentuais de votos válidos seguem a regra do TSE."
        footer={
          <Button variant="primary" onClick={() => setDialog(false)}>
            Entendi
          </Button>
        }
      >
        <p className="text-[14px] leading-relaxed text-fg-muted">
          Votos válidos são os dados a candidatos; brancos e nulos não entram na conta. Comparecimento e abstenção são calculados sobre o
          eleitorado das seções já totalizadas.
        </p>
      </Dialog>
    </Section>
  );
}

function Feedback() {
  const [n, setN] = useState(48.73);
  const [v, setV] = useState(51234567);
  return (
    <Section id="feedback" title="Feedback e números" description="NumberRoll, Countdown, Stat e Skeleton.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="NumberRoll"
            subtitle="Dígitos rolam ao mudar; respeita movimento reduzido."
            actions={
              <Button
                size="sm"
                variant="secondary"
                icon="reset"
                onClick={() => {
                  setN(40 + Math.random() * 20);
                  setV(Math.round(40e6 + Math.random() * 20e6));
                }}
              >
                Sortear
              </Button>
            }
          />
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <NumberRoll value={n} format={(x) => fmtPct(x)} smallChars="%" className="font-display text-[64px] font-semibold leading-none tracking-[-0.045em] text-cand-a" />
            <NumberRoll value={v} className="font-display text-[28px] font-semibold text-fg" />
            <NumberRoll value={v} format={fmtCompact} className="text-[18px] font-medium text-fg-muted" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Countdown" subtitle="Até 25/10, 17h (Brasília)" />
          <div className="space-y-4">
            <Countdown target={INICIO_APURACAO} size="lg" />
            <div className="flex flex-wrap items-center gap-4">
              <Countdown target={INICIO_APURACAO} size="md" />
              <Countdown target={INICIO_APURACAO} size="sm" />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Stat" />
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Stat label="Eleitorado" value={fmtCompact(158745502)} sub={`${fmtInt(158745502)} aptos`} icon={<Icon name="usuarios" size={14} />} />
            <Stat label="Comparecimento" value={fmtPct(78.92)} bar={78.92} barClassName="bg-brand" sub="do eleitorado" />
            <Stat label="Seções" value="499.248" size="lg" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Skeleton" subtitle="Brilho deslizante" />
          <div className="flex items-center gap-3">
            <Skeleton rounded="full" className="h-12 w-12" />
            <div className="flex-1">
              <SkeletonText lines={3} />
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function Icones() {
  return (
    <Section id="icones" title="Ícones" description="Conjunto próprio, traço 1,75 px, grade 24.">
      <Card>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-12">
          {ICON_NAMES.map((n) => (
            <div key={n} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-fg transition-colors hover:bg-surface-2">
              <Icon name={n} size={22} />
              <span className="w-full truncate text-center font-mono text-[10px] text-fg-muted">{n}</span>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  );
}

function LayoutDemo() {
  type Linha = { uf: UF; nome: string; eleitorado: number };
  const rows: Linha[] = (Object.keys(UF_NOMES) as UF[]).slice(0, 9).map((uf, i) => ({ uf, nome: UF_NOMES[uf], eleitorado: 400000 + ((i * 7919) % 13) * 912345 }));
  const cols: Column<Linha>[] = [
    { key: 'uf', header: 'UF', sortValue: (r) => r.uf, cell: (r) => <span className="font-mono text-[12px] font-semibold">{r.uf}</span>, width: 'w-12' },
    { key: 'nome', header: 'Nome', sortValue: (r) => r.nome, cell: (r) => r.nome },
    { key: 'el', header: 'Eleitorado', align: 'right', sortValue: (r) => r.eleitorado, cell: (r) => fmtInt(r.eleitorado) },
  ];
  return (
    <Section id="layout" title="Layout" description="PageHeader, Breadcrumbs, Section e DataTable genérica.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <Breadcrumbs items={[{ label: 'Brasil', to: '/apuracao' }, { label: 'Rio de Janeiro', to: '/apuracao/rj' }, { label: 'Rio de Janeiro', to: '/apuracao/rj/60011' }, { label: 'Zona 4 · Seção 127' }]} />
          <PageHeader
            className="pb-0 sm:pb-0"
            eyebrow="2º turno · 25 de outubro"
            title="Rio de Janeiro"
            subtitle="Presidente e Governador, município por município."
            actions={
              <>
                <Button size="sm" variant="outline" icon="compartilhar">
                  Compartilhar
                </Button>
              </>
            }
          />
        </Card>
        <Card>
          <CardHeader title="DataTable" subtitle="Clique nos cabeçalhos para ordenar" />
          <DataTable rows={rows} columns={cols} rowKey={(r) => r.uf} onRowClick={(r) => toast(r.nome)} rowLabel={(r) => `Abrir ${r.nome}`} initialSort={{ key: 'el', dir: 'desc' }} stickyHeader={false} />
        </Card>
      </div>
      <div className="mt-4 text-[13px] text-fg-muted">
        Veja também <Link to="/kit/viz" className="font-medium text-fg underline decoration-line underline-offset-4 hover:text-brand-fg">/kit/viz</Link> (mapas, gráfico e mosaico).
      </div>
    </Section>
  );
}
