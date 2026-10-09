/**
 * /kit/viz — vitrine e bancada de QA das visualizações da apuração (dados FICTÍCIOS, src/app/fixtures/viz.ts).
 * Controle de "% apurado" com reprodução animada, seletor de modo e de UF, tema claro/escuro e painel de
 * desempenho (React Profiler + User Timing do mosaico). Expõe `window.__vizPerf` para os testes.
 */
import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UF, UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtHora, fmtInt, fmtPct, normalize } from '@/shared/format';
import { pctTotalizadas } from '@/shared/calc';
import { Button, Card, CardHeader, SearchBox, Segmented, Select, Slider, ThemeToggle, Toggle } from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { TileMap } from '@/app/components/apuracao/TileMap';
import { UfMap } from '@/app/components/apuracao/UfMap';
import { MapLegend } from '@/app/components/apuracao/MapLegend';
import { MapModeSwitch } from '@/app/components/apuracao/MapModeSwitch';
import { TimelineChart } from '@/app/components/apuracao/TimelineChart';
import { SecaoMosaic } from '@/app/components/apuracao/SecaoMosaic';
import type { MapMode } from '@/app/components/apuracao/mapModes';
import {
  FIX_RACE,
  carregarBaseUf,
  fixtureMunicipios,
  fixtureNacional,
  mosaicoFixture,
  mosaicoGrande,
  primeiroTurnoMunicipios,
  type MunBase,
} from '@/app/fixtures/viz';

type PerfRegistro = { id: string; fase: string; render: number; ate_pintar: number; t: number };
declare global {
  interface Window {
    __vizPerf?: PerfRegistro[];
  }
}

const UF_OPCOES = [...UFS]
  .sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'))
  .map((u) => ({ value: u, label: `${UF_NOMES[u]} (${u})` }));
const ZONAS_PEQUENAS = [{ z: 31, s: '1-23,25-31' }];

export default function KitVizPage() {
  // Estado inicial pela URL (QA): /kit/viz?pct=12&modo=margem&uf=SP&eixo=horario
  const [params] = useSearchParams();
  const [pct, setPct] = useState(() => {
    const v = Number(params.get('pct'));
    return params.has('pct') && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 42;
  });
  const [tocando, setTocando] = useState(false);
  const [modo, setModo] = useState<MapMode>(() => (params.get('modo') as MapMode | null) ?? 'vencedor');
  const [ufSel, setUfSel] = useState<UF | null>(null);
  const [uf, setUf] = useState<UFBr>(() => {
    const u = params.get('uf')?.toUpperCase() as UFBr | undefined;
    return u && (UFS as readonly string[]).includes(u) ? u : 'MG';
  });
  const [eixo, setEixo] = useState<'secoes' | 'horario'>(() =>
    params.get('eixo') === 'horario' ? 'horario' : 'secoes',
  );
  const [busca, setBusca] = useState('');
  const [munSel, setMunSel] = useState<string | null>(null);
  const [secSel, setSecSel] = useState<{ zona: number; secao: number } | null>(null);
  const [fonteTse, setFonteTse] = useState(false);
  const [base, setBase] = useState<{ uf: UFBr; lista: MunBase[] } | null>(null);
  const [perf, setPerf] = useState<Record<string, PerfRegistro>>({});
  // Isolamento para medir desempenho: ?so=ufmap | mosaico | brasil | serie
  const so = params.get('so');
  const mostrar = (k: string) => !so || so === k;
  // Gancho de QA: os testes de desempenho mudam o % sem passar pelo controle deslizante.
  useEffect(() => {
    const w = window as unknown as { __vizSetPct?: (v: number) => void; __vizSetUf?: (u: UFBr) => void };
    w.__vizSetPct = (v: number) => {
      setTocando(false);
      setPct(v);
    };
    w.__vizSetUf = (u: UFBr) => setUf(u);
  }, []);

  // Reprodução: 0 → 100% em ~24 s.
  useEffect(() => {
    if (!tocando) return;
    let raf = 0;
    let ult = performance.now();
    const passo = (now: number) => {
      const dt = now - ult;
      ult = now;
      setPct((p) => {
        const n = Math.min(100, p + dt / 240);
        if (n >= 100) setTocando(false);
        return n;
      });
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [tocando]);

  // Quantiza para não recalcular a cada frame (as visualizações atualizam ~6×/s na reprodução).
  const pctQ = tocando ? Math.floor(pct * 2) / 2 : pct;
  const nac = useMemo(() => fixtureNacional(pctQ), [pctQ]);

  useEffect(() => {
    let vivo = true;
    carregarBaseUf(uf).then((lista) => vivo && setBase({ uf, lista }));
    return () => {
      vivo = false;
    };
  }, [uf]);

  const municipios = useMemo(
    () => (base && base.uf === uf ? fixtureMunicipios(uf, base.lista, nac.fracoes[uf], nac.simNow) : []),
    [base, uf, nac],
  );
  const t1Mun = useMemo(
    () => (base && base.uf === uf ? primeiroTurnoMunicipios(uf, base.lista) : undefined),
    [base, uf],
  );
  const destaque = useMemo(() => {
    const q = normalize(busca);
    if (q.length < 2) return null;
    return municipios.filter((m) => normalize(m.nome).includes(q)).map((m) => m.cod);
  }, [busca, municipios]);

  const fracSp = nac.fracoes.SP;
  const mosaico = useMemo(
    () => (!so || so === 'mosaico' ? mosaicoGrande(Math.min(1, fracSp * 1.05), fonteTse) : []),
    [fracSp, fonteTse, so],
  );
  const mosaicoPequeno = useMemo(
    () =>
      mosaicoFixture(ZONAS_PEQUENAS, Math.min(1, nac.fracoes.PI * 1.1), { seed: 'pequeno', lean: 58, tse: fonteTse }),
    [nac.fracoes.PI, fonteTse],
  );

  // ------------------------------------------------------------ desempenho
  const onRender: ProfilerOnRenderCallback = useCallback((id, fase, actual, _base, _start, commitTime) => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        const reg: PerfRegistro = {
          id,
          fase,
          render: actual,
          ate_pintar: performance.now() - commitTime,
          t: Date.now(),
        };
        (window.__vizPerf ??= []).push(reg);
        if (window.__vizPerf.length > 400) window.__vizPerf.splice(0, 200);
        ultimoPerf.current[id] = reg;
      }, 0),
    );
  }, []);
  const ultimoPerf = useRef<Record<string, PerfRegistro>>({});
  useEffect(() => {
    const id = window.setInterval(() => setPerf({ ...ultimoPerf.current }), 700);
    return () => window.clearInterval(id);
  }, []);
  const mosaicoMs = useMemo(() => {
    const e = performance.getEntriesByName('sintonia:mosaico');
    return e.length ? e[e.length - 1].duration : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perf]);

  const r = nac.resumo;
  const pv0 = r.votos[0] + r.votos[1] > 0 ? (r.votos[0] / (r.votos[0] + r.votos[1])) * 100 : 0;
  const munNome = municipios.find((m) => m.cod === munSel)?.nome;

  return (
    <Container>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Design system · QA visual <SimulationRibbon variant="badge" />
          </span>
        }
        title="Visualizações da apuração"
        subtitle="Mapas, cartograma, corrida da apuração e mosaico de seções com geometrias reais do IBGE e números inventados."
        breadcrumbs={[{ label: 'Início', to: '/' }, { label: 'Kit', to: '/kit' }, { label: 'Visualizações' }]}
        actions={<ThemeToggle />}
      />

      {/* Controles */}
      <div
        className="glass sticky z-30 mb-6 rounded-2xl border border-line p-3 shadow-card sm:p-4"
        style={{ top: 'calc(var(--app-header-h, 64px) + 8px)' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant={tocando ? 'secondary' : 'primary'}
            icon={tocando ? 'pause' : 'play'}
            onClick={() => {
              if (!tocando && pct >= 100) setPct(0);
              setTocando((t) => !t);
            }}
            aria-label={tocando ? 'Pausar' : 'Reproduzir a apuração'}
          >
            {tocando ? 'Pausar' : 'Reproduzir'}
          </Button>
          <div className="min-w-[180px] flex-1">
            <Slider
              value={pct}
              onChange={(v) => {
                setTocando(false);
                setPct(v);
              }}
              min={0}
              max={100}
              step={0.1}
              ariaLabel="% de seções totalizadas no país"
              format={(v) => fmtPct(v, 1)}
            />
          </div>
          <p className="num text-[12.5px] text-fg-muted">
            <span className="font-semibold text-fg">{fmtPct(pctTotalizadas(r), 1)}</span> apurado ·{' '}
            {fmtHora(nac.simNow)} · {FIX_RACE.candidatos[0].nomeUrna}{' '}
            <span className="font-semibold text-fg">{fmtPct(pv0)}</span>
          </p>
        </div>
        <div className="mt-3">
          <MapModeSwitch value={modo} onChange={setModo} />
        </div>
      </div>

      {/* Brasil */}
      {mostrar('brasil') ? (
        <section id="brasil" className="grid scroll-mt-48 grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7" padding="md">
            <CardHeader title="Brasil por estado" subtitle="BrazilMap · clique numa UF (toque duas vezes no celular)" />
            <BrazilMap
              ufs={nac.ufs}
              race={FIX_RACE}
              modo={modo}
              selecionada={ufSel}
              onSelect={(u) => {
                setUfSel(u);
                setUf(u);
              }}
              primeiroTurno={nac.primeiroTurno}
            />
            <MapLegend modo={modo} race={FIX_RACE} compacta className="mt-4" />
          </Card>
          <Card className="lg:col-span-5" padding="md">
            <CardHeader title="Cartograma" subtitle="TileMap · todas as UFs com o mesmo peso visual" />
            <TileMap
              ufs={nac.ufs}
              race={FIX_RACE}
              modo={modo}
              selecionada={ufSel}
              onSelect={(u) => {
                setUfSel(u);
                if (u !== 'ZZ') setUf(u);
              }}
              primeiroTurno={nac.primeiroTurno}
            />
          </Card>
        </section>
      ) : null}

      {/* Série */}
      {mostrar('serie') ? (
        <section id="serie" className="mt-4 scroll-mt-48">
        <Card padding="md">
          <CardHeader
            title="A corrida da apuração"
            subtitle="TimelineChart · arraste sobre o gráfico"
            actions={
              <Segmented
                size="sm"
                ariaLabel="Eixo horizontal"
                value={eixo}
                onChange={setEixo}
                options={[
                  { value: 'secoes', label: '% seções' },
                  { value: 'horario', label: 'Horário' },
                ]}
              />
            }
          />
          <TimelineChart serie={nac.serie} race={FIX_RACE} eixoX={eixo} />
        </Card>
        </section>
      ) : null}

      {/* UF */}
      {mostrar('ufmap') ? (
        <section id="ufmap" className="mt-4 scroll-mt-48">
        <Card padding="md">
          <CardHeader
            title={`Municípios · ${UF_NOMES[uf]}`}
            subtitle={`UfMap · ${fmtInt(municipios.length)} municípios${munNome ? ` · selecionado: ${munNome}` : ''}`}
          />
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <Select
              aria-label="Estado"
              size="sm"
              value={uf}
              onChange={(e) => {
                setUf(e.target.value as UFBr);
                setMunSel(null);
                setBusca('');
              }}
              options={UF_OPCOES}
            />
            <SearchBox
              size="sm"
              value={busca}
              onChange={setBusca}
              placeholder="Buscar município"
              ariaLabel="Buscar município no mapa"
            />
          </div>
          <Profiler id="UfMap" onRender={onRender}>
            <UfMap
              key={uf}
              uf={uf}
              municipios={municipios}
              race={FIX_RACE}
              modo={modo}
              selecionado={munSel}
              onSelect={(cod) => setMunSel(cod)}
              destaque={destaque}
              primeiroTurno={t1Mun}
            />
          </Profiler>
          <MapLegend modo={modo} race={FIX_RACE} compacta className="mt-4" />
        </Card>
        </section>
      ) : null}

      {/* Mosaico */}
      {mostrar('mosaico') ? (
        <section id="mosaico" className="mt-4 scroll-mt-48">
        <Card padding="md">
          <CardHeader
            title="Seções · capital fictícia (57 zonas)"
            subtitle={`SecaoMosaic · ${secSel ? `selecionada: zona ${secSel.zona}, seção ${secSel.secao}` : 'passe o mouse ou toque numa seção'}`}
            actions={<Toggle size="sm" checked={fonteTse} onChange={setFonteTse} label="Fonte TSE" />}
          />
          <Profiler id="SecaoMosaic" onRender={onRender}>
            <SecaoMosaic
              mosaico={mosaico}
              race={FIX_RACE}
              selecionada={secSel}
              onSelect={(zona, secao) => setSecSel({ zona, secao })}
            />
          </Profiler>
        </Card>
        </section>
      ) : null}

      <section id="extras" className="mt-4 grid scroll-mt-48 grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5" padding="md">
          <CardHeader title="Município pequeno" subtitle="SecaoMosaic · 1 zona, 30 seções" />
          <SecaoMosaic mosaico={mosaicoPequeno} race={FIX_RACE} legenda={false} />
        </Card>
        <Card className="lg:col-span-7" padding="md">
          <CardHeader
            title="Desempenho"
            subtitle="Último render (React Profiler, só no modo de desenvolvimento) e desenho do mosaico (canvas)"
          />
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3" data-testid="perf">
            {(['UfMap', 'SecaoMosaic'] as const).map((id) => (
              <div key={id} className="contents">
                <dt className="text-fg-muted">{id}</dt>
                <dd className="text-fg">
                  {perf[id]
                    ? `${perf[id].render.toFixed(1)} ms render · ${perf[id].ate_pintar.toFixed(1)} ms até pintar`
                    : '—'}
                </dd>
                <dd className="hidden text-fg-subtle sm:block">{perf[id]?.fase ?? ''}</dd>
              </div>
            ))}
            <dt className="text-fg-muted">Canvas do mosaico</dt>
            <dd className="text-fg">{mosaicoMs !== null ? `${mosaicoMs.toFixed(1)} ms` : '—'}</dd>
          </dl>
        </Card>
      </section>
    </Container>
  );
}
