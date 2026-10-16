/**
 * /relatorio#k=<token> — relatório de entrega do anunciante (anunciantes v2, E17): link privado gerado no painel e
 * enviado a quem anunciou. Fora do AppShell: nenhum anúncio do site, nenhum conteúdo eleitoral.
 *
 *  - Lê o token do fragmento (`#k=`: nunca vai ao servidor em pedido nem no Referer) e faz `POST /api/anuncie/relatorio`
 *    (`{ k }`); atualiza a cada 60 s enquanto o anúncio está no ar.
 *  - Contas em src/shared/relatorio.ts (`totaisDoPeriodo`, `serieDoPeriodo`, `ctrPct`, `csvRelatorioAnunciante`): a
 *    página não refaz conta. Números com `.num` e os formatadores de src/shared/format.ts.
 *  - Impressão / PDF: em `beforeprint` a página passa ao tema claro (`data-tema-local` + `TemaLocal`), A4, sem botões.
 *  - Métricas só agregadas; o alcance é estimativa (LGPD: sem cookie, sem IP).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FORMATOS_ANUNCIO, FORMATOS_COM_CLIQUE, type FormatoAnuncio } from '@/shared/anuncios';
import { fmtDataHora, fmtDecimal, fmtHoraSeg, fmtInt, fmtPct } from '@/shared/format';
import {
  NOITE_ELEICAO,
  csvRelatorioAnunciante,
  ctrPct,
  serieDoPeriodo,
  totaisDoPeriodo,
  type PeriodoRelatorio,
  type RelatorioAnunciante,
  type SituacaoRelatorio,
} from '@/shared/relatorio';
import { cn } from '@/app/lib/cn';
import { Logo } from '@/app/components/layout/Logo';
import { LogoMarca, TemaLocal } from '@/app/components/anuncios/pecas';
import { VitrineFormato } from '@/app/components/anuncios/Vitrine';
import { Badge, type BadgeTone } from '@/app/ui/Badge';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Skeleton } from '@/app/ui/Skeleton';
import { ThemeToggle } from '@/app/ui/ThemeToggle';

const HORA = 3_600_000;
/** Atualização enquanto o anúncio está no ar. */
const ATUALIZA_MS = 60_000;

/** Nome curto de cada formato (tabela e vitrine). */
export const NOME_FORMATO: Record<FormatoAnuncio, string> = {
  topo: 'Faixa no topo',
  rodape: 'Barra do rodapé',
  nativo: 'Cartões no conteúdo',
  teste: 'Teste Cego',
  tv: 'Modo TV',
  compartilhamento: 'Imagens de compartilhamento',
  chat: 'Chat ao vivo',
  live: 'Lives (OBS)',
};

const SITUACAO: Record<SituacaoRelatorio, { texto: string; tom: BadgeTone }> = {
  'no-ar': { texto: 'No ar', tom: 'ok' },
  agendado: { texto: 'Agendado', tom: 'pending' },
  pausado: { texto: 'Pausado', tom: 'neutral' },
  encerrado: { texto: 'Encerrado', tom: 'neutral' },
  suspenso: { texto: 'Fora do ar (pausa geral)', tom: 'neutral' },
  'meta-atingida': { texto: 'Meta atingida', tom: 'brand' },
};

const PERIODOS: Record<PeriodoRelatorio, string> = {
  noite: 'Noite da eleição (25/10, 17h → 26/10, 2h)',
  campanha: 'Campanha inteira',
  ultimas24h: 'Últimas 24 h',
};
/** Rótulo curto do chip no celular (o período completo aparece na linha de baixo). */
const PERIODOS_CURTO: Record<PeriodoRelatorio, string> = { noite: 'Noite da eleição', campanha: 'Campanha', ultimas24h: 'Últimas 24 h' };
const DETALHE_PERIODO: Record<PeriodoRelatorio, string> = {
  noite: '25/10, 17h → 26/10, 2h (Brasília)',
  campanha: 'Desde o início da veiculação',
  ultimas24h: 'A hora atual e as 23 anteriores',
};

/** Hora cheia de Brasília (UTC−3 fixo) de um instante. */
const horaBrasilia = (ms: number) => new Date(ms - 3 * HORA).getUTCHours();
/** "25/10" (Brasília). */
const diaBrasilia = (ms: number) => {
  const d = new Date(ms - 3 * HORA);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** "20h–21h" (ou "25/10, 20h–21h" com o dia). */
export function rotuloHora(ms: number, comDia = false): string {
  const h = horaBrasilia(ms);
  const faixa = `${h}h–${(h + 1) % 24}h`;
  return comDia ? `${diaBrasilia(ms)}, ${faixa}` : faixa;
}

/** A campanha cruza a noite da eleição? */
export function cruzaNoite(r: Pick<RelatorioAnunciante, 'inicio' | 'fim'>): boolean {
  return (r.inicio ?? -Infinity) < NOITE_ELEICAO.fim && (r.fim ?? Infinity) > NOITE_ELEICAO.inicio;
}

/** Período aberto ao chegar: a noite, se a campanha a cruza e ela já começou; senão, a campanha inteira. */
export function periodoPadrao(r: Pick<RelatorioAnunciante, 'inicio' | 'fim'>, agora: number): PeriodoRelatorio {
  return cruzaNoite(r) && agora >= NOITE_ELEICAO.inicio ? 'noite' : 'campanha';
}

/** Lê o token do fragmento (`#k=…`). */
function tokenDaUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const k = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('k');
  return k && /^[A-Za-z0-9_-]{16,64}$/.test(k) ? k : null;
}

class ErroRelatorio extends Error {
  constructor(
    msg: string,
    readonly status: number,
  ) {
    super(msg);
  }
}

async function buscarRelatorio(k: string): Promise<RelatorioAnunciante> {
  let r: Response;
  try {
    r = await fetch('/api/anuncie/relatorio', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ k }),
    });
  } catch {
    throw new ErroRelatorio('rede', 0);
  }
  if (!r.ok) throw new ErroRelatorio(r.status === 404 ? 'invalido' : 'servidor', r.status);
  return (await r.json()) as RelatorioAnunciante;
}

/** Tema claro durante a impressão (o PDF sai claro, legível no papel). */
function useImprimindo(): boolean {
  const [imprimindo, setImprimindo] = useState(false);
  useEffect(() => {
    const antes = () => setImprimindo(true);
    const depois = () => setImprimindo(false);
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', depois);
    };
  }, []);
  return imprimindo;
}

export default function RelatorioPage() {
  const k = useMemo(tokenDaUrl, []);
  const imprimindo = useImprimindo();
  const q = useQuery({
    queryKey: ['relatorio-anunciante', k],
    queryFn: () => buscarRelatorio(k!),
    enabled: !!k && !__DEMO__,
    retry: (n, e) => (e as ErroRelatorio).status !== 404 && (e as ErroRelatorio).status !== 429 && n < 2,
    refetchInterval: (consulta) => (consulta.state.data?.situacao === 'no-ar' ? ATUALIZA_MS : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const marca = q.data?.anuncio.marca;
  useEffect(() => {
    const ant = document.title;
    document.title = marca ? `Relatório de entrega · ${marca} · Sintonia` : 'Relatório de entrega · Sintonia';
    return () => {
      document.title = ant;
    };
  }, [marca]);

  let corpo: ReactNode;
  if (!k || __DEMO__) corpo = <Aviso titulo="Link inválido ou revogado." texto="Peça um novo link a quem vendeu o anúncio." />;
  else if (q.data) corpo = <RelatorioConteudo r={q.data} atualizando={q.isFetching} />;
  else if (q.isError) {
    const e = q.error as ErroRelatorio;
    corpo =
      e.status === 404 ? (
        <Aviso titulo="Link inválido ou revogado." texto="Peça um novo link a quem vendeu o anúncio." />
      ) : (
        <Aviso
          titulo={e.status === 429 ? 'Muitas consultas seguidas.' : 'Não foi possível carregar o relatório.'}
          texto={e.status === 429 ? 'Tente de novo em um minuto.' : 'Confira a conexão e tente de novo.'}
          acao={
            <Button variant="outline" icon="reset" onClick={() => void q.refetch()} loading={q.isFetching}>
              Tentar de novo
            </Button>
          }
        />
      );
  } else corpo = <Carregando />;

  return (
    <TemaLocal.Provider value={imprimindo ? 'claro' : null}>
      <div data-tema-local={imprimindo ? 'claro' : undefined} className="min-h-[100dvh] bg-bg text-fg print:bg-surface">
        {/* A4, sem cabeçalho fixo nem botões */}
        <style>{'@page { size: A4; margin: 12mm; } @media print { html, body { background: transparent !important; } }'}</style>
        <header className="border-b border-line bg-surface/80 print:border-none print:bg-transparent">
          <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center gap-3 px-4 sm:px-6">
            <Logo size={26} />
            <span aria-hidden className="h-5 w-px bg-line" />
            <span className="min-w-0 truncate text-[13.5px] font-medium text-fg-muted">Relatório de entrega</span>
            <ThemeToggle size="sm" className="ml-auto print:hidden" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-5 sm:px-6 sm:pt-8 print:px-0 print:pb-0 print:pt-4">{corpo}</main>
      </div>
    </TemaLocal.Provider>
  );
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-3xl border border-line bg-surface p-6 text-center shadow-card sm:mt-12 sm:p-8">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-fg-muted">
        <Icon name="info" size={22} />
      </span>
      <h1 className="mt-4 text-balance font-display text-[21px] font-semibold tracking-[-0.02em] text-fg">{titulo}</h1>
      <p className="mt-1.5 text-pretty text-[14.5px] leading-relaxed text-fg-muted">{texto}</p>
      {acao ? <div className="mt-5">{acao}</div> : null}
    </div>
  );
}

function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando o relatório" className="space-y-5">
      <Skeleton className="h-[112px] w-full" rounded="lg" />
      <Skeleton className="h-10 w-full max-w-[520px]" rounded="lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[92px]" rounded="lg" />
        ))}
      </div>
      <Skeleton className="h-[260px] w-full" rounded="lg" />
    </div>
  );
}

/** O relatório desenhado (exportado para os testes de marcação). */
export function RelatorioConteudo({ r, atualizando }: { r: RelatorioAnunciante; atualizando?: boolean }) {
  const agora = r.geradoEm;
  const noite = cruzaNoite(r);
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>(() => periodoPadrao(r, agora));
  const t = totaisDoPeriodo(r, periodo, agora);
  const serie = serieDoPeriodo(r, periodo, agora);
  const ctr = ctrPct(t);
  const situacao = SITUACAO[r.situacao];
  const formatos = FORMATOS_ANUNCIO.filter((f) => r.anuncio.formatos.includes(f));
  const opcoes = (['noite', 'campanha', 'ultimas24h'] as const)
    .filter((p) => p !== 'noite' || noite)
    .map((p) => ({
      value: p,
      label: (
        <>
          <span className="sm:hidden">{PERIODOS_CURTO[p]}</span>
          <span className="hidden sm:inline">{PERIODOS[p]}</span>
        </>
      ),
      ariaLabel: PERIODOS[p],
    }));

  const baixarCsv = () => {
    const url = URL.createObjectURL(new Blob([csvRelatorioAnunciante(r)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sintonia-relatorio-${r.anuncio.id}-${new Date(agora - 3 * HORA).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6 sm:space-y-8 print:space-y-4">
      {/* anunciante, situação e janela */}
      <section aria-label="Anúncio" className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7 print:shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
            <LogoMarca anuncio={r.anuncio} prioridade className="[--logo-h:56px] [--logo-max:240px]" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[28px]">{r.anuncio.marca}</h1>
              <p className="mt-0.5 line-clamp-2 text-[14px] text-fg-muted">{r.anuncio.titulo}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <Badge tone={situacao.tom} size="md">
              {situacao.texto}
            </Badge>
            {r.situacao === 'no-ar' ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-muted">
                {/* ponto estático (sem piscar) */}
                <span aria-hidden className="h-2 w-2 rounded-full bg-ok" />
                Ao vivo · atualiza a cada minuto
              </span>
            ) : null}
          </div>
        </div>
        <dl className="mt-5 flex flex-col gap-x-8 gap-y-2 border-t border-line pt-4 text-[13px] sm:flex-row sm:flex-wrap">
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Veiculação:</dt>
            <dd className="num text-fg">
              {r.inicio ? fmtDataHora(r.inicio) : 'desde o cadastro'} → {r.fim ? fmtDataHora(r.fim) : 'sem data de fim'}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Contagem desde:</dt>
            <dd className="num text-fg">{fmtDataHora(r.desde)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Atualizado às:</dt>
            <dd className={cn('num text-fg transition-opacity', atualizando && 'opacity-60')}>{fmtHoraSeg(r.geradoEm)}</dd>
          </div>
        </dl>
      </section>

      {/* período */}
      <div>
        <div className="print:hidden">
          <Segmented options={opcoes} value={periodo} onChange={setPeriodo} ariaLabel="Período do relatório" block className="sm:inline-flex sm:w-auto" />
        </div>
        <p className="mt-2 text-[12.5px] text-fg-subtle print:hidden sm:hidden">{DETALHE_PERIODO[periodo]}</p>
        <p className="hidden text-[13px] font-semibold text-fg print:block">Período: {PERIODOS[periodo]}</p>
      </div>

      {/* totais */}
      <section aria-label="Totais do período" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5 print:gap-2">
        <Numero rotulo="Impressões visíveis" valor={fmtInt(t.impressoes)} className="col-span-2 sm:col-span-1" />
        <Numero
          rotulo="Pessoas alcançadas"
          nota="estimativa"
          valor={t.alcance === null ? '—' : fmtInt(t.alcance)}
          dica={
            periodo === 'ultimas24h'
              ? 'Não estimado nas últimas 24 h'
              : t.alcance !== null && (r.alcance.segmentos?.[periodo] ?? 1) > 1
                ? 'Estimativa conservadora: o servidor reiniciou no período'
                : undefined
          }
        />
        <Numero rotulo="Frequência média" nota="por pessoa" valor={t.frequencia === null ? '—' : fmtDecimal(t.frequencia, 1)} />
        <Numero rotulo="Cliques" valor={fmtInt(t.cliques)} />
        <Numero rotulo="Taxa de cliques" nota="CTR" valor={ctr === null ? '—' : fmtPct(ctr, 2)} />
      </section>

      {r.meta ? <Meta limite={r.meta.limite} entregue={r.meta.entregue} /> : null}

      <Grafico serie={serie} periodo={periodo} />

      <PorFormato linhas={t.porFormato} />

      <section aria-labelledby="rel-vitrine" className="print:hidden">
        <h2 id="rel-vitrine" className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">
          Como sua marca apareceu
        </h2>
        <p className="mt-1 text-[13.5px] text-fg-muted">Prévia de cada formato do anúncio, como o site desenha hoje.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {formatos.map((f) => (
            <figure key={f} className="min-w-0">
              <figcaption className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{NOME_FORMATO[f]}</figcaption>
              <VitrineFormato anuncio={r.anuncio} formato={f} estreita />
            </figure>
          ))}
        </div>
      </section>

      <ComoMedimos />

      <div className="flex flex-col gap-2 sm:flex-row print:hidden">
        <Button variant="outline" icon="lista" onClick={baixarCsv}>
          Baixar CSV
        </Button>
        <Button variant="outline" icon="download" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
      </div>
    </div>
  );
}

function Numero({ rotulo, nota, valor, dica, className }: { rotulo: string; nota?: string; valor: string; dica?: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface px-4 py-3.5 print:break-inside-avoid print:px-3 print:py-2.5', className)}>
      <span className="text-[12px] font-medium leading-snug text-fg-muted">{rotulo}</span>
      {nota ? <span className="text-[11.5px] leading-snug text-fg-subtle">{nota}</span> : null}
      {/* números alinhados pela base, mesmo com rótulos de alturas diferentes */}
      <span className="num mt-auto pt-2 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[28px] print:text-[22px]">{valor}</span>
      {dica ? <span className="mt-1.5 text-[11.5px] leading-snug text-fg-subtle">{dica}</span> : null}
    </div>
  );
}

function Meta({ limite, entregue }: { limite: number; entregue: number }) {
  const pct = limite > 0 ? (100 * entregue) / limite : 0;
  return (
    <section aria-label="Meta de impressões" className="rounded-2xl border border-line bg-surface p-4 sm:p-5 print:break-inside-avoid">
      <p className="text-[14px] text-fg">
        <span className="font-semibold">Meta:</span> contratado <span className="num font-semibold">{fmtInt(limite)}</span> · entregue{' '}
        <span className="num font-semibold">{fmtInt(entregue)}</span> <span className="num text-fg-muted">({fmtPct(pct, 0)})</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Entregue ${fmtPct(pct, 0)} da meta`}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-fg-subtle">Impressões visíveis contadas desde o início da veiculação.</p>
    </section>
  );
}

/** Rótulos do eixo do tempo: poucos e legíveis (uma marca a cada 1, 3 ou 6 h; na campanha longa, uma por dia). */
function marcasDoEixo(serie: { hora: number }[]): { i: number; texto: string }[] {
  const n = serie.length;
  if (n === 0) return [];
  if (n > 48) return serie.flatMap((s, i) => (horaBrasilia(s.hora) === 0 ? [{ i, texto: diaBrasilia(s.hora) }] : []));
  const passo = n <= 12 ? (n <= 9 ? 1 : 2) : n <= 30 ? 3 : 6;
  return serie.flatMap((s, i) => (horaBrasilia(s.hora) % passo === 0 ? [{ i, texto: `${horaBrasilia(s.hora)}h` }] : []));
}

/**
 * Impressões e cliques por hora: duas séries de escalas muito diferentes, então dois gráficos (cada um com o seu eixo,
 * alinhados pelo tempo), nunca dois eixos no mesmo. O destaque (toque/passar o mouse) mostra a hora e os dois números;
 * sem destaque, o pico.
 */
function Grafico({ serie, periodo }: { serie: { hora: number; impressoes: number; cliques: number }[]; periodo: PeriodoRelatorio }) {
  const [foco, setFoco] = useState<number | null>(null);
  const comDia = periodo === 'campanha';
  const maxImp = Math.max(0, ...serie.map((s) => s.impressoes));
  const maxCli = Math.max(0, ...serie.map((s) => s.cliques));
  const pico = maxImp > 0 ? serie.findIndex((s) => s.impressoes === maxImp) : -1;
  const marcas = marcasDoEixo(serie);
  const sel = foco !== null ? serie[foco] : null;
  const vazio = serie.length === 0 || maxImp === 0;
  const mensagemVazia =
    periodo === 'noite' && serie.length === 0 ? 'A noite da eleição começa em 25/10, às 17h.' : 'Ainda sem impressões contadas neste período.';

  return (
    <section aria-labelledby="rel-grafico" className="rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6 print:break-inside-avoid print:shadow-none">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="rel-grafico" className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">
          Por hora
        </h2>
        <p className="text-[13px] text-fg-muted" aria-live="polite">
          {sel ? (
            <>
              <span className="num font-semibold text-fg">{rotuloHora(sel.hora, comDia)}</span>: <span className="num">{fmtInt(sel.impressoes)}</span> impressões ·{' '}
              <span className="num">{fmtInt(sel.cliques)}</span> cliques
            </>
          ) : pico >= 0 ? (
            <>
              Pico: <span className="num font-semibold text-fg">{rotuloHora(serie[pico].hora, comDia)}</span>, <span className="num">{fmtInt(maxImp)}</span> impressões
            </>
          ) : null}
        </p>
      </div>
      {vazio ? (
        <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-10 text-center text-[14px] text-fg-muted">{mensagemVazia}</p>
      ) : (
        <div className="mt-5" onMouseLeave={() => setFoco(null)}>
          <Barras serie={serie} chave="impressoes" max={maxImp} titulo="Impressões visíveis" cor="bg-brand-2/80" altura="h-[140px] sm:h-[170px] print:h-[110px]" foco={foco} onFoco={setFoco} comDia={comDia} />
          <Barras serie={serie} chave="cliques" max={maxCli} titulo="Cliques" cor="bg-ok/80" altura="h-[56px] sm:h-[64px] print:h-[44px]" foco={foco} onFoco={setFoco} comDia={comDia} className="mt-4" />
          {/* eixo do tempo (Brasília) */}
          <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-fg-subtle">
            {marcas.map((m) => (
              <span key={m.i} className="num absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((m.i + 0.5) / serie.length) * 100}%` }}>
                {m.texto}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-fg-subtle">Horário de Brasília. Cada gráfico tem a sua escala.</p>
        </div>
      )}
    </section>
  );
}

function Barras({
  serie,
  chave,
  max,
  titulo,
  cor,
  altura,
  foco,
  onFoco,
  comDia,
  className,
}: {
  serie: { hora: number; impressoes: number; cliques: number }[];
  chave: 'impressoes' | 'cliques';
  max: number;
  titulo: string;
  cor: string;
  altura: string;
  foco: number | null;
  onFoco: (i: number | null) => void;
  comDia: boolean;
  className?: string;
}) {
  const fina = serie.length > 60;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-fg-muted">{titulo}</span>
        <span className="num text-fg-subtle">máx. {fmtInt(max)}</span>
      </div>
      <div role="img" aria-label={`${titulo} por hora; máximo de ${fmtInt(max)}`} className={cn('relative flex items-end border-b border-line', fina ? 'gap-px' : 'gap-[2px]', altura)}>
        {/* linha de meio, recessiva */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
        {serie.map((s, i) => {
          const v = s[chave];
          const pct = max > 0 ? (100 * v) / max : 0;
          return (
            <button
              key={s.hora}
              type="button"
              tabIndex={-1}
              aria-hidden
              title={`${rotuloHora(s.hora, comDia)}: ${fmtInt(v)} ${chave === 'impressoes' ? 'impressões' : 'cliques'}`}
              onMouseEnter={() => onFoco(i)}
              onClick={() => onFoco(i)}
              className="relative flex h-full min-w-0 flex-1 items-end"
            >
              <span
                // barras finas (no máximo 40 px), centradas na hora: poucas horas não viram blocos largos
                className={cn('mx-auto block w-full max-w-[40px] transition-opacity', fina ? 'rounded-t-[1px]' : 'rounded-t-[3px]', cor, foco !== null && foco !== i && 'opacity-45')}
                style={{ height: v > 0 ? `max(2px, ${pct}%)` : 0 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PorFormato({ linhas }: { linhas: { formato: FormatoAnuncio; impressoes: number; cliques: number }[] }) {
  return (
    <section aria-labelledby="rel-formatos" className="print:break-inside-avoid">
      <h2 id="rel-formatos" className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">
        Por formato
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">Impressões visíveis, cliques e taxa de cliques por formato no período</caption>
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-fg-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Formato
              </th>
              <th scope="col" className="px-2.5 py-2.5 text-right font-medium sm:px-3">
                Impressões
              </th>
              <th scope="col" className="px-2.5 py-2.5 text-right font-medium sm:px-3">
                Cliques
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                CTR
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const comClique = FORMATOS_COM_CLIQUE.includes(l.formato);
              const c = ctrPct(l);
              return (
                <tr key={l.formato} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg">
                    {NOME_FORMATO[l.formato]}
                  </th>
                  <td className="num whitespace-nowrap px-2.5 py-2.5 text-right text-fg sm:px-3">{fmtInt(l.impressoes)}</td>
                  <td className="num whitespace-nowrap px-2.5 py-2.5 text-right text-fg sm:px-3">{comClique ? fmtInt(l.cliques) : <span className="text-fg-subtle">—</span>}</td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-right text-fg-muted">{comClique && c !== null ? fmtPct(c, 2) : '—'}</td>
                </tr>
              );
            })}
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                  Sem formatos medidos neste anúncio.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-fg-subtle">
        Modo TV e lives não têm link (sem cliques). Na campanha inteira, os totais incluem os dias anteriores ao detalhe por
        hora (14 dias), que não têm a divisão por formato.
      </p>
    </section>
  );
}

function ComoMedimos() {
  const itens = [
    'Impressão visível: pelo menos 50% da peça na tela por 1 segundo, com a aba aberta. Cada pessoa conta uma vez a cada 5 minutos por formato.',
    'Pessoa: a combinação da rede e do navegador, anonimizada no servidor e mantida só em memória.',
    'Pessoas alcançadas: estimativa estatística, com margem de cerca de 2%.',
    'Sem cookie, sem endereço IP gravado e sem dado pessoal.',
    'Imagens de compartilhamento circulam fora do site e não são medidas.',
  ];
  return (
    <section aria-labelledby="rel-como" className="rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5 print:break-inside-avoid">
      <h2 id="rel-como" className="font-display text-[17px] font-semibold tracking-[-0.02em] text-fg">
        Como medimos
      </h2>
      <ul className="mt-2.5 space-y-1.5 text-[13.5px] leading-relaxed text-fg-muted">
        {itens.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
