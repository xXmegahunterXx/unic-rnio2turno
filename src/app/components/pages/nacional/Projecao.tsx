/**
 * "Projeção do Sintonia": com parte das urnas apuradas, a estimativa do resultado FINAL de cada finalista (% dos votos
 * válidos) e a faixa provável (mín–máx). Cálculo no servidor (contrato `src/shared/projecao.ts`, município a município:
 * o que falta de cada município segue o que ele já mostrou; município sem urna, o 1º turno + a mudança média observada
 * no estado). Este arquivo só busca e desenha.
 *
 * Rotas: `GET /api/apuracao/:race/br/projecao` (Presidente, Brasil) e `GET /api/apuracao/:race/:uf/projecao` (Presidente
 * na UF e Governador) → `{ projecao: Projecao }`. Rota ausente, erro, payload estranho ou `disponivel: false`: o cartão
 * não aparece (nada de erro na tela). Antes do limiar (`motivo: 'cedo'`), só durante a apuração, o cartão de espera no
 * mesmo quadro: quando a estimativa aparece e a barra das seções apuradas até os ~10% (nenhum número de candidato).
 * Chave da noite 'projecao' desligada → o servidor responde `motivo: 'desligada'` e nada aparece.
 *
 * Neutralidade: ordem da urna, cor de cada finalista vinda dos dados (`corSlot(cand.cor)`, nunca pela posição), textos
 * simétricos, sem foto e sem "vencedor"/"eleito". Simulação: selo no próprio cartão; com nomes ocultos, os nomes e cores
 * neutros da corrida anonimizada (`useRace`) — o número de urna do payload nunca é exibido.
 */
import { Component, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Race, UF } from '@/shared/types';
import { LIMIAR_FRACAO, TEXTOS_PROJECAO, type MotivoSemProjecao, type Projecao, type ProjecaoCandidato } from '@/shared/projecao';
import { fmtPct } from '@/shared/format';
import { partidoENumero } from '@/shared/anon';
import { useStatus, pollMs } from '@/app/data/hooks';
import { leveDe } from '@/app/data/carga';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';

/** Intervalo mínimo entre consultas (ms): o servidor só recalcula quando o status muda; mais rápido não traz nada novo. */
const MIN_MS = 5_000;
/**
 * Modo leve do freio: a consulta continua (mais espaçada), para o cartão nunca congelar com números velhos nem ficar na
 * tela depois do resultado definido. A resposta tem ~300 B e sai do cache da CDN/servidor.
 */
const LEVE_MS = 20_000;

/** Endereço da projeção: Brasil (`br`) ou UF (sigla minúscula, como as outras rotas da apuração). */
export function urlProjecao(raceId: string, abrangencia: 'BR' | UF): string {
  const onde = abrangencia === 'BR' ? 'br' : abrangencia.toLowerCase();
  return `/api/apuracao/${encodeURIComponent(raceId.toLowerCase())}/${onde}/projecao`;
}

const ehNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Confere o formato da resposta (servidor de outra versão, proxy, cache velho): fora do contrato → null. */
export function lerProjecao(v: unknown): Projecao | null {
  const p = (v as { projecao?: unknown } | null)?.projecao as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.race !== 'string' || typeof p.abrangencia !== 'string' || typeof p.disponivel !== 'boolean') return null;
  if (!Array.isArray(p.candidatos)) return null;
  const candidatos: ProjecaoCandidato[] = [];
  for (const c of p.candidatos as Record<string, unknown>[]) {
    if (!c || !ehNum(c.indice) || !ehNum(c.numero) || !ehNum(c.pct) || !ehNum(c.min) || !ehNum(c.max)) return null;
    candidatos.push({
      indice: c.indice,
      numero: c.numero,
      pct: c.pct,
      min: c.min,
      max: c.max,
    });
  }
  return {
    race: p.race,
    abrangencia: p.abrangencia,
    disponivel: p.disponivel,
    motivo: typeof p.motivo === 'string' ? (p.motivo as MotivoSemProjecao) : undefined,
    fracaoApurada: ehNum(p.fracaoApurada) ? p.fracaoApurada : 0,
    pctSecoes: ehNum(p.pctSecoes) ? p.pctSecoes : 0,
    candidatos,
    simNow: ehNum(p.simNow) ? p.simNow : 0,
  };
}

/**
 * A projeção ao vivo de uma disputa numa abrangência. Só consulta durante a apuração (fase 'apurando'), ao vivo (sem
 * `?t=`) e fora do build demo. Intervalo: o do placar nacional (já com o freio), nunca abaixo de 5 s; no modo leve do
 * freio, a cada 20 s (nunca para). Falha: uma nova tentativa e, se falhar de novo, o cartão some (`isError`).
 */
export function useProjecao(raceId: string, abrangencia: 'BR' | UF, ativo: boolean) {
  const { data: status } = useStatus();
  const ligado = ativo && !__DEMO__ && status?.fase === 'apurando';
  return useQuery<Projecao | null>({
    queryKey: ['projecao', raceId, abrangencia],
    enabled: ligado,
    queryFn: async () => {
      const r = await fetch(urlProjecao(raceId, abrangencia), {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!r.ok)
        throw Object.assign(new Error(`Erro ${r.status}`), {
          status: r.status,
        });
      return lerProjecao(await r.json());
    },
    staleTime: 4_000,
    refetchInterval: () => {
      if (!ligado) return false;
      const ms = pollMs(status, 'br');
      if (ms === false) return false;
      return leveDe(status?.carga) ? Math.max(LEVE_MS, ms) : Math.max(MIN_MS, ms);
    },
    retry: 1,
  });
}

/** Finalista da projeção já casado com a corrida exibida (nome e cor da corrida — anonimizada, se for o caso). */
interface Linha {
  p: ProjecaoCandidato;
  cand: Race['candidatos'][number];
}

/** Casa os candidatos da projeção com a corrida pelo índice (ordem da urna); com os nomes reais, confere o número. */
function casar(race: Race, proj: Projecao, anonimizado: boolean): Linha[] | null {
  const linhas: Linha[] = [];
  for (const p of proj.candidatos) {
    const cand = race.candidatos[p.indice];
    if (!cand || cand.agregado) return null;
    if (!anonimizado && cand.numero !== p.numero) return null;
    linhas.push({ p, cand });
  }
  if (linhas.length !== 2) return null;
  return linhas.sort((a, b) => a.p.indice - b.p.indice);
}

/** Meia-janela do eixo (p.p. em torno de 50%): cabe a faixa de todos com folga, de 5 em 5, entre 5 e 50. */
export function meiaJanela(cands: readonly Pick<ProjecaoCandidato, 'pct' | 'min' | 'max'>[]): number {
  let d = 0;
  for (const c of cands) d = Math.max(d, Math.abs(c.min - 50), Math.abs(c.max - 50), Math.abs(c.pct - 50));
  return Math.min(50, Math.max(5, Math.ceil((d + 1.5) / 5) * 5));
}

/** Percentual com 1 casa, limitado a [0, 100] (a faixa nunca sai do possível). */
const pct1 = (n: number) => fmtPct(Math.min(100, Math.max(0, n)), 1);

/** "Com 34% das urnas apuradas": inteiro truncado, como o TSE; abaixo de 1%, "menos de 1%". */
const pctUrnas = (n: number) => (n > 0 && n < 1 ? 'menos de 1%' : fmtPct(Math.floor(Math.min(100, Math.max(0, n))), 0));

/**
 * % das seções como o placar mostra (`pctTotalizadas`, src/shared/calc.ts): TRUNCADO em 2 casas, como o TSE. O payload
 * traz o mesmo número com 4 casas; o +1e-6 só absorve o erro de ponto flutuante (0,29 × 100 = 28,999…).
 */
export function pctSecoesPlacar(n: number): number {
  if (!(n > 0)) return 0;
  if (n >= 100) return 100;
  return Math.floor(n * 100 + 1e-6) / 100;
}

/** Cartão antes do limiar: % das seções (como o placar), fração da barra até os ~10% (0–1) e se já chegou lá. */
export interface Aguardando {
  pct: number;
  barra: number;
  noLimiar: boolean;
}

/**
 * Estado do cartão de espera: só com `motivo: 'cedo'` (antes do limiar, inclusive com 0% das seções — o cartão já está
 * lá quando a totalização começa ou retoma). Com as seções já em ~10% e o cálculo ainda sem base (fração dos válidos
 * esperados ou UFs/municípios com urnas abaixo do limiar), a barra fica cheia e a frase muda. Qualquer outro caso → null.
 */
export function aguardandoDe(p: Pick<Projecao, 'disponivel' | 'motivo' | 'pctSecoes'>): Aguardando | null {
  if (p.disponivel || p.motivo !== 'cedo') return null;
  const pct = pctSecoesPlacar(p.pctSecoes);
  const limiar = LIMIAR_FRACAO * 100;
  return { pct, barra: Math.min(1, pct / limiar), noLimiar: pct >= limiar };
}

export interface ProjecaoCartaoProps {
  race: Race;
  /** 'BR' ou a sigla da UF. */
  abrangencia: 'BR' | UF;
  /** Ao vivo (sem `?t=` da "Reveja a noite"): só então consulta (a projeção é sempre a de agora). */
  aoVivo: boolean;
  simulado?: boolean;
  anonimizado?: boolean;
  /**
   * O placar desta abrangência já tem eleito: o cartão some no mesmo render, sem esperar a resposta 'definido' da rota.
   */
  definido?: boolean;
  className?: string;
}

/** Erro de render no cartão: some (nunca derruba a página da apuração). */
class Silencioso extends Component<{ children: ReactNode }, { erro: boolean }> {
  override state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  override render() {
    return this.state.erro ? null : this.props.children;
  }
}

/** Título "Projeção do Sintonia" + selo "Estimativa" (+ selo de simulação): o mesmo nos dois estados do cartão. */
function Cabecalho({ id, simulado }: { id: string; simulado?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <h2 id={id} className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">
        {TEXTOS_PROJECAO.titulo}
      </h2>
      <span className="inline-flex h-5 items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        Estimativa
      </span>
      {simulado ? <SimulationRibbon variant="badge" className="h-5 px-1.5 text-[9.5px]" /> : null}
    </div>
  );
}

const CLASSE_LINK =
  'font-medium text-fg underline decoration-line/[3] underline-offset-[3px] transition-colors hover:decoration-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/** "· como calculamos" (link da metodologia): nunca se separa (o ponto não fica sozinho no fim da linha). */
function ComoCalculamos() {
  return (
    <span className="inline-flex items-center gap-x-1.5 whitespace-nowrap">
      <span aria-hidden>·</span>
      <Link to="/metodologia#projecao" className={CLASSE_LINK}>
        {TEXTOS_PROJECAO.comoCalculamos}
      </Link>
    </span>
  );
}

/**
 * Cartão de espera (antes do limiar): o mesmo quadro do cartão real, compacto, com a frase de quando a estimativa
 * aparece e a barra das seções apuradas até os ~10% (o mesmo número do placar). Nenhum número de candidato — por isso
 * sem `data-sem-anuncio-fixo` e igual na simulação com nomes ocultos.
 */
function ProjecaoAguardando({ abrangencia, a, simulado, className }: { abrangencia: 'BR' | UF; a: Aguardando; simulado?: boolean; className?: string }) {
  const limiar = fmtPct(LIMIAR_FRACAO * 100, 0);
  const pct = fmtPct(a.pct);
  const valor = TEXTOS_PROJECAO.aguardandoValor(pct, limiar);
  const id = `projecao-titulo-${abrangencia}`;
  return (
    <section
      aria-labelledby={id}
      data-projecao={abrangencia}
      data-projecao-estado="aguardando"
      className={cn('min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}
    >
      {/* celular: texto e, embaixo, a barra; a partir de 640 px, a barra à direita (cartão de uma faixa só) */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <Cabecalho id={id} simulado={simulado} />
          <p className="mt-1.5 max-w-[56ch] text-pretty text-[13px] leading-snug text-fg-muted">
            <span className="num">{a.noLimiar ? TEXTOS_PROJECAO.aguardandoBase : TEXTOS_PROJECAO.aguardando(limiar)}</span>{' '}
            {/* depois do ponto final, sem "·": se quebrar a linha, o link começa a de baixo sozinho, sem pontuação solta */}
            <Link to="/metodologia#projecao" className={cn(CLASSE_LINK, 'whitespace-nowrap')}>
              {TEXTOS_PROJECAO.comoCalculamos.charAt(0).toUpperCase() + TEXTOS_PROJECAO.comoCalculamos.slice(1)}
            </Link>
          </p>
        </div>
        <div className="w-full min-w-0 sm:w-[17.5rem] sm:shrink-0">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px] leading-none">
            <span className="text-fg-muted">{TEXTOS_PROJECAO.aguardandoRotulo}</span>
            <span className="num whitespace-nowrap text-fg-muted">
              {/* "0,24% de 10%": o % das seções em destaque; já no limiar, só ele */}
              <span className="font-semibold text-fg">{pct}</span>
              {a.noLimiar ? null : valor.slice(pct.length)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={TEXTOS_PROJECAO.aguardandoRotulo}
            aria-valuemin={0}
            aria-valuemax={LIMIAR_FRACAO * 100}
            aria-valuenow={Math.min(a.pct, LIMIAR_FRACAO * 100)}
            aria-valuetext={a.noLimiar ? pct : valor}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
          >
            {/* como a barra do placar: o preenchimento DESLIZA com translateX (sem layout a cada quadro) */}
            <div
              className="h-full w-full rounded-full bg-brand-grad transition-transform duration-700 ease-out"
              style={{ transform: `translateX(${a.barra * 100 - 100}%)` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** O cartão (ou o cartão de espera antes do limiar, ou nada), protegido por um error boundary silencioso. */
export function ProjecaoCartao(props: ProjecaoCartaoProps) {
  return (
    <Silencioso key={`${props.race.id}|${props.abrangencia}`}>
      <ProjecaoCartaoInterno {...props} />
    </Silencioso>
  );
}

function ProjecaoCartaoInterno({ race, abrangencia, aoVivo, simulado, anonimizado = false, definido = false, className }: ProjecaoCartaoProps) {
  const { data: status } = useStatus();
  const ativo = aoVivo && race.turno === 2 && !definido;
  const q = useProjecao(race.id, abrangencia, ativo);
  const proj = ativo && q.data && q.data.race === race.id && q.data.abrangencia === abrangencia ? q.data : null;
  // rota falhou depois de um sucesso (o TanStack guarda o `data` anterior): some, nada de número velho na tela
  if (!proj || q.isError || status?.fase !== 'apurando') return null;

  if (!proj.disponivel) {
    // antes do limiar (motivo 'cedo'), só durante a apuração: o cartão de espera, com a barra até os ~10% e nenhum número
    // de candidato. Nos outros motivos ('sem-base', 'definido', 'encerrada', 'desligada'), nada.
    const a = aguardandoDe(proj);
    return a ? <ProjecaoAguardando abrangencia={abrangencia} a={a} simulado={simulado} className={className} /> : null;
  }

  const linhas = casar(race, proj, anonimizado);
  if (!linhas) return null;
  const w = meiaJanela(linhas.map((l) => l.p));
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - (50 - w)) / (2 * w)) * 100));

  return (
    <section
      aria-labelledby={`projecao-titulo-${abrangencia}`}
      // números de candidato: a barra fixa de anúncio do celular nunca fica por cima (anuncios/faixaLivre.ts)
      data-sem-anuncio-fixo
      data-projecao={abrangencia}
      className={cn('min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}
    >
      <div className="min-w-0">
        <Cabecalho id={`projecao-titulo-${abrangencia}`} simulado={simulado} />
        <p className="mt-1 max-w-[72ch] text-pretty text-[12.5px] leading-snug text-fg-muted">{TEXTOS_PROJECAO.subtitulo.replace('1º turno', '1º\u00a0turno')}</p>
      </div>

      {/* celular e tablet: os dois finalistas e, embaixo, as faixas; a partir de 1024 px, lado a lado (cartão mais baixo) */}
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ul className="grid grid-cols-2 gap-2 min-[380px]:gap-3">
          {linhas.map(({ p, cand }, k) => {
            const s = corSlot(cand.cor);
            return (
              <li
                key={p.indice}
                className={cn('flex min-w-0 flex-col rounded-xl border border-line bg-surface-2/60 p-2.5 min-[380px]:p-3 sm:p-3.5', k === 1 && 'text-right')}
                aria-label={`${cand.nomeUrna}: ${TEXTOS_PROJECAO.linha(pct1(p.pct), pct1(p.min), pct1(p.max))}`}
              >
                <div className={cn('flex min-w-0 items-start gap-2', k === 1 && 'flex-row-reverse')}>
                  <span aria-hidden className={cn('mt-[0.3em] h-2.5 w-2.5 shrink-0 rounded-full', s.bg)} />
                  {/* nome inteiro: quebra em duas linhas se precisar, nunca cortado */}
                  <span className="min-w-0 break-words text-[14px] font-semibold leading-tight text-fg sm:text-[15px]">{cand.nomeUrna}</span>
                </div>
                <div className={cn('num mt-0.5 truncate text-[11.5px] font-semibold sm:text-[12px]', s.text)}>{partidoENumero(cand)}</div>
                <div
                  aria-hidden
                  className={cn('num mt-auto pt-2.5 font-display text-[30px] font-semibold leading-none tracking-[-0.035em] sm:text-[36px]', s.textDisplay)}
                >
                  {pct1(p.pct)}
                </div>
                <div aria-hidden className="num mt-1.5 text-[11px] leading-snug text-fg-muted min-[380px]:text-[12px] sm:text-[12.5px]">
                  entre <span className="font-medium text-fg">{pct1(p.min)}</span> e <span className="font-medium text-fg">{pct1(p.max)}</span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* faixa de cada finalista num eixo em torno de 50% (escala marcada embaixo; só ilustra o texto ao lado). O nome vai
            em cima da linha, inteiro (quebra se precisar; nunca cortado). */}
        <div aria-hidden className="flex flex-col justify-center rounded-xl border border-line px-3 pb-2.5 pt-2.5 sm:px-4">
          <div className="space-y-2">
            {linhas.map(({ p, cand }) => {
              const s = corSlot(cand.cor);
              const a = pos(p.min);
              const b = pos(p.max);
              return (
                <div key={p.indice} className="min-w-0">
                  <span className="block break-words text-[11.5px] font-medium leading-tight text-fg-muted">{cand.nomeUrna}</span>
                  <div className="relative mt-1 h-3.5">
                    <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3" />
                    <span className="absolute -inset-y-1 left-1/2 w-px -translate-x-1/2 bg-fg-subtle/50" />
                    <span
                      className={cn('absolute inset-y-0.5 -translate-x-[3px] rounded-full opacity-40', s.bg)}
                      style={{ left: `${a}%`, width: `calc(${b - a}% + 6px)` }}
                    />
                    <span
                      className={cn(
                        // o ponto projetado: um traço fino (não esconde a faixa estreita embaixo)
                        'absolute -inset-y-0.5 w-[3px] -translate-x-1/2 rounded-full ring-1 ring-[rgb(var(--surface))]',
                        s.bg,
                      )}
                      style={{ left: `${pos(p.pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="num mt-1.5 flex justify-between text-[10.5px] text-fg-subtle">
            <span>{fmtPct(50 - w, 0)}</span>
            <span>{fmtPct(50, 0)}</span>
            <span>{fmtPct(50 + w, 0)}</span>
          </div>
        </div>
      </div>

      <p className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-3 text-[12px] leading-snug text-fg-muted">
        <Icon name="info" size={14} className="shrink-0 text-fg-subtle" />
        <span className="num">{TEXTOS_PROJECAO.rodape(pctUrnas(proj.pctSecoes))}</span>
        <ComoCalculamos />
      </p>
    </section>
  );
}
