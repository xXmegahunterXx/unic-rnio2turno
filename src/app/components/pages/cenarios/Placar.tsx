/**
 * Placar do cenário (Brasil): os dois finalistas lado a lado na ordem da urna (menor número à esquerda), cada um na
 * sua cor de identificação (./cores.ts), % dos válidos rolando a cada ajuste, barra com a marca dos 50%, diferença,
 * estados e quem muda de lado — mais as premissas, sempre visíveis. Sem fotos: os números são hipotéticos (monograma
 * na cor do candidato, igual para os dois).
 *
 * `BarraFixa`: mini-placar que desce sob o cabeçalho no celular quando o placar sai da tela (quem mexe nos
 * controles lá embaixo continua vendo o resultado mudar).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Cenario, PresidenteT1Dataset, ResultadoCenario } from '@/shared/cenarios';
import { finalistasDe, margemArea, nomeCurto, pctFinalista, premissasCenario } from '@/shared/cenarios';
import { UF_NOMES } from '@/shared/constants';
import { fmtCompact, fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { brilhoDuplo, corSlot } from '@/app/lib/raceUi';
import { copiarLink, urlAbsoluta } from '@/app/lib/share';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { toast } from '@/app/ui/Toast';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { BotaoCompartilhar, type ConteudoCompartilhavel } from '@/app/components/share';
import type { CorCandidato } from '@/shared/types';
import { coresCenario, type CoresCenario } from './cores';

/** Diferença sem sinal: "2,0 p.p.". */
export const fmtMargem = (pp: number, casas: 1 | 2 = 1) => fmtPP(Math.abs(pp), casas).replace('+', '');

export type CompartilharCenario = ConteudoCompartilhavel & { descricao?: ReactNode; carregando?: boolean };

function Lado({ i, cor, nome, partido, numero, pct, votos }: { i: 0 | 1; cor: CorCandidato; nome: string; partido: string; numero: number; pct: number; votos: number }) {
  const s = corSlot(cor);
  const dir = i === 1;
  return (
    <div className={cn('min-w-0', dir && 'text-right')}>
      <div className={cn('flex min-h-[3.6rem] items-center gap-2.5', dir && 'flex-row-reverse')}>
        <CandidateAvatar nome={nome} cor={cor} size="md" />
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-[14px] font-semibold leading-tight text-fg min-[400px]:text-[15px]">{nome}</p>
          <p className="num truncate text-[12px] text-fg-muted">
            {partido} · {numero}
          </p>
        </div>
      </div>
      <NumberRoll
        value={pct}
        format={(n) => fmtPct(n)}
        smallChars="%"
        duration={380}
        className={cn('mt-2.5 font-display text-[40px] font-semibold leading-none tracking-[-0.045em] min-[400px]:text-[46px] sm:text-[58px]', s.textDisplay)}
        smallClassName="ml-[0.04em] text-[0.46em] tracking-normal"
        ariaLabel={`${nome}: ${fmtPct(pct)} dos votos válidos`}
      />
      <p className="num mt-1.5 text-[12.5px] text-fg-muted">{fmtInt(votos)} votos</p>
    </div>
  );
}

/** Barra dos dois finalistas com a marca dos 50% (largura animada), nas cores de ./cores.ts. */
export function BarraCenario({ r, cores = coresCenario(), alto = 'h-3.5', className }: { r: ResultadoCenario; cores?: CoresCenario; alto?: string; className?: string }) {
  const pa = pctFinalista(r.brasil, 0);
  return (
    <div className={cn('relative', className)} aria-hidden>
      <div className={cn('flex w-full gap-[3px] overflow-hidden rounded-full', alto)}>
        <div className={cn('h-full transition-[width] duration-300 ease-out', corSlot(cores[0]).bg)} style={{ width: `${pa}%` }} />
        <div className={cn('h-full flex-1', corSlot(cores[1]).bg)} />
      </div>
      <span className="absolute -bottom-1 -top-1 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-fg" />
    </div>
  );
}

export function PlacarCenario({
  ds,
  cenario,
  resultado: r,
  compartilhar,
}: {
  ds: PresidenteT1Dataset;
  cenario: Cenario;
  resultado: ResultadoCenario;
  compartilhar: CompartilharCenario;
}) {
  const { a, b } = finalistasDe(ds);
  const cores = coresCenario(ds);
  const m = margemArea(r.brasil);
  const premissas = premissasCenario(ds, cenario, r, { detalheCandidatos: 3 });
  const anuncio = useAnuncio(`${a.nomeUrna} ${fmtPct(pctFinalista(r.brasil, 0))}, ${b.nomeUrna} ${fmtPct(pctFinalista(r.brasil, 1))} dos votos válidos neste cenário.`);
  return (
    <section aria-labelledby="placar-cenario" className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{ background: brilhoDuplo(cores, 0.16, '60% 100%') }}
      />
      <div className="relative p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="placar-cenario" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            Seu cenário · 2º turno · Brasil
          </h2>
          <span className="shrink-0 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-fg">
            Hipotético
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Lado i={0} cor={cores[0]} nome={a.nomeUrna} partido={a.partido} numero={a.numero} pct={pctFinalista(r.brasil, 0)} votos={r.brasil.votos[0]} />
          <Lado i={1} cor={cores[1]} nome={b.nomeUrna} partido={b.partido} numero={b.numero} pct={pctFinalista(r.brasil, 1)} votos={r.brasil.votos[1]} />
        </div>
        <BarraCenario r={r} cores={cores} className="mt-4" />
        <p className="mt-2 text-center text-[11.5px] text-fg-subtle">50% dos votos válidos</p>

        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-surface-2/70 p-3 text-center">
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">Diferença</dt>
            <dd className="num mt-1 truncate text-[15px] font-semibold text-fg">{m.lider === null ? 'Empate' : fmtCompact(m.votos)}</dd>
            <dd className="num truncate text-[11.5px] text-fg-muted">{m.lider === null ? '—' : fmtMargem(m.pp)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">Estados</dt>
            <dd className="num mt-1 text-[15px] font-semibold">
              <span className={corSlot(cores[0]).text}>{fmtInt(r.estados[0])}</span>
              <span className="text-fg-subtle"> × </span>
              <span className={corSlot(cores[1]).text}>{fmtInt(r.estados[1])}</span>
            </dd>
            <dd className="truncate text-[11.5px] text-fg-muted">{r.empates ? `${fmtInt(r.empates)} empate` : 'à frente'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
              <abbr title="Estados em que fica à frente quem estava atrás, entre os dois, no 1º turno" className="no-underline">
                Viradas
              </abbr>
            </dt>
            <dd className="num mt-1 truncate text-[15px] font-semibold text-fg" title={r.mudaram.map((u) => UF_NOMES[u]).join(', ')}>
              {fmtInt(r.mudaram.length)}
            </dd>
            <dd className="truncate text-[11.5px] text-fg-muted">{r.mudaram.length ? r.mudaram.join(', ') : 'vs. 1º turno'}</dd>
          </div>
        </dl>

        <div className="mt-4 flex gap-2">
          <BotaoCompartilhar {...compartilhar} variant="primary" size="lg" label="Compartilhar meu cenário" className="flex-1" />
          <button
            type="button"
            onClick={async () => {
              const ok = await copiarLink(urlAbsoluta(compartilhar.caminho));
              toast(ok ? 'Link do cenário copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'check' : 'alerta' });
            }}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[16px] border border-line px-4 text-[14.5px] font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="link" size={18} />
            <span className="hidden min-[380px]:inline">Copiar link</span>
            <span className="sr-only min-[380px]:hidden">Copiar link</span>
          </button>
        </div>
      </div>

      <div className="relative border-t border-line bg-surface-2/40 px-4 py-4 sm:px-6">
        <Premissas itens={premissas} />
      </div>
    </section>
  );
}

/** Texto para o aria-live só depois que o valor para de mudar (arrastar um slider não vira uma enxurrada de anúncios). */
function useAnuncio(texto: string, atraso = 900) {
  const [t, setT] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setT(texto), atraso);
    return () => window.clearTimeout(id);
  }, [texto, atraso]);
  return t;
}

export function Premissas({ itens }: { itens: ReturnType<typeof premissasCenario> }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
        <Icon name="lista" size={15} className="text-brand-fg" />
        Premissas deste cenário
      </h3>
      <dl className="mt-2.5 space-y-1.5 text-[13px] leading-snug">
        {itens.map((p) => (
          <div key={p.id}>
            <dt className="inline font-semibold text-fg">{p.rotulo}: </dt>
            <dd className="inline text-fg-muted">{p.texto}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Conteúdo do mini-placar: % de cada um, barra com os 50% e estados (A sempre à esquerda). */
export function MiniPlacar({ ds, resultado: r, acao, className }: { ds: PresidenteT1Dataset; resultado: ResultadoCenario; acao?: ReactNode; className?: string }) {
  const { a, b } = finalistasDe(ds);
  const cores = coresCenario(ds);
  return (
    <div className={cn('flex items-center gap-2.5 rounded-2xl border border-line bg-surface/95 py-2 pl-3 shadow-card backdrop-blur-md', acao ? 'pr-1.5' : 'pr-3', className)}>
      <span className={cn('num font-display text-[19px] font-semibold leading-none tracking-[-0.03em]', corSlot(cores[0]).textDisplay)}>{fmtPct(pctFinalista(r.brasil, 0), 1)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 text-[11px] leading-none text-fg-muted">
          <span className="min-w-0 truncate">{nomeCurto(a.nomeUrna)}</span>
          <span className="min-w-0 truncate text-right">{nomeCurto(b.nomeUrna)}</span>
        </div>
        <BarraCenario r={r} cores={cores} alto="h-2" className="mt-1.5" />
        <div className="num mt-1.5 text-center text-[10.5px] leading-none text-fg-subtle">
          estados: <span className={corSlot(cores[0]).text}>{fmtInt(r.estados[0])}</span> × <span className={corSlot(cores[1]).text}>{fmtInt(r.estados[1])}</span>
        </div>
      </div>
      <span className={cn('num font-display text-[19px] font-semibold leading-none tracking-[-0.03em]', corSlot(cores[1]).textDisplay)}>{fmtPct(pctFinalista(r.brasil, 1), 1)}</span>
      {acao}
    </div>
  );
}

/** Mini-placar fixo (celular) enquanto o placar principal está fora da tela. */
export function BarraFixa({ ds, resultado: r, visivel, compartilhar }: { ds: PresidenteT1Dataset; resultado: ResultadoCenario; visivel: boolean; compartilhar: CompartilharCenario }) {
  const reduzir = useReducedMotion();
  return (
    <AnimatePresence>
      {visivel ? (
        <motion.div
          key="barra-fixa"
          initial={reduzir ? { opacity: 0 } : { y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduzir ? { opacity: 0 } : { y: -24, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-x-0 z-40 px-3 pt-2 lg:hidden"
          style={{ top: 'var(--app-header-h, 56px)' }}
        >
          <MiniPlacar ds={ds} resultado={r} className="mx-auto max-w-md" acao={<BotaoCompartilhar {...compartilhar} soIcone label="Compartilhar meu cenário" />} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
