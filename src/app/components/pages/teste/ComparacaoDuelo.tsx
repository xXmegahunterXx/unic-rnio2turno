/**
 * Comparação do Duelo: "Vocês ficaram do mesmo lado em N de M afirmações", a afinidade entre as duas pessoas
 * (mesma régua do teste) e a sintonia de cada uma com os candidatos, lado a lado.
 * Só duas pessoas — nunca agregados (ARCHITECTURE §1.2). Tudo calculado no navegador.
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { AvatarCandidato } from './AvatarCandidato';
import { fmtSintonia, type Autor, type ComparacaoDuelo } from './sintonia';

/**
 * Placar do Duelo como título (h1): "Vocês concordaram em N de M afirmações" (mesmo lado da escala), e uma
 * fileira de marcadores na ordem em que as afirmações apareceram.
 */
export function PlacarConcordancia({ comp, revelado, id }: { comp: ComparacaoDuelo; revelado: boolean; id?: string }) {
  const reduzir = useReducedMotion();
  const total = comp.emComum;
  return (
    <div className="flex flex-col items-center text-center">
      <h1 id={id} className="flex flex-col items-center font-display font-semibold text-fg">
        <span className="text-balance text-[22px] leading-tight tracking-[-0.025em] sm:text-[30px]">Vocês concordaram em</span>
        <span className="mt-1 flex items-baseline gap-2 tracking-[-0.05em] sm:mt-2">
          <NumberRoll value={revelado ? comp.iguais : 0} className="text-[88px] leading-[0.9] sm:text-[128px]" duration={900} ariaLabel={String(comp.iguais)} />
          <span className="num text-[30px] tracking-[-0.03em] text-fg-muted sm:text-[44px]">
            <span className="sr-only">de</span>
            <span aria-hidden>/</span> {fmtInt(total)}
          </span>
        </span>
        <span className="mt-1 text-[22px] leading-tight tracking-[-0.025em] sm:mt-2 sm:text-[30px]">{total === 1 ? 'afirmação' : 'afirmações'}</span>
      </h1>
      <ol className="mt-5 grid grid-cols-12 gap-1 sm:gap-1.5" aria-hidden>
        {comp.itens.map((t, i) => (
          <motion.li
            key={t.afirmacao.id}
            initial={reduzir ? false : { scale: 0.4, opacity: 0 }}
            animate={revelado ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
            transition={{ delay: reduzir ? 0 : 0.3 + i * 0.03, type: 'spring', stiffness: 420, damping: 24 }}
            className={cn(
              'inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border sm:h-7 sm:w-7',
              !t.comparavel ? 'border-dashed border-fg-subtle/50 text-fg-subtle' : t.mesmoLado ? 'border-brand/60 bg-brand/20 text-brand-fg' : 'border-line bg-surface-2 text-fg-subtle',
            )}
          >
            <Icon name={!t.comparavel ? 'menos' : t.mesmoLado ? 'check' : 'troca'} size={12} strokeWidth={2.5} />
          </motion.li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-fg-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-brand/60 bg-brand/20 text-brand-fg">
            <Icon name="check" size={9} strokeWidth={3} />
          </span>
          mesmo lado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line bg-surface-2">
            <Icon name="troca" size={9} strokeWidth={3} />
          </span>
          lados diferentes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 rounded-full border border-dashed border-fg-subtle/50" />
          alguém pulou
        </span>
      </p>
    </div>
  );
}

/** Afinidade entre as duas pessoas (0–100), na mesma régua do teste. */
export function AfinidadeEntreVoces({ comp, revelado }: { comp: ComparacaoDuelo; revelado: boolean }) {
  const reduzir = useReducedMotion();
  const v = comp.afinidade;
  return (
    <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14.5px] font-semibold text-fg">Afinidade entre vocês</h2>
        <span className="num font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-fg">{v === null ? '—' : fmtPct(v, 0)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        {v !== null ? (
          <motion.div
            className="h-full rounded-full bg-brand-grad"
            initial={{ width: 0 }}
            animate={{ width: revelado ? `${v}%` : 0 }}
            transition={{ duration: reduzir ? 0 : 1, delay: reduzir ? 0 : 0.6, ease: [0.22, 0.9, 0.24, 1] }}
          />
        ) : null}
      </div>
      <p className="mt-2.5 text-pretty text-[12.5px] leading-snug text-fg-muted">
        Mesma conta do teste, entre as respostas de vocês: 100% quando respondem igual, 75% com um passo de diferença na escala, 0% em
        extremos opostos.
      </p>
    </div>
  );
}

/** Sintonia de uma pessoa com os candidatos em barras (ordem da urna, mesma escala para os dois). */
export function SintoniaEmBarras({
  titulo,
  resultado,
  candidatos,
  fotos,
  revelado,
  destaque,
}: {
  titulo: string;
  resultado: ResultadoSintonia;
  candidatos: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  revelado: boolean;
  destaque?: boolean;
}) {
  const reduzir = useReducedMotion();
  return (
    <div className={cn('rounded-2xl border p-4 sm:p-5', destaque ? 'border-brand/40 bg-brand/[0.06]' : 'border-line bg-surface-2/50')}>
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full', destaque ? 'bg-brand/20 text-brand-fg' : 'bg-surface-3 text-fg-muted')}>
          <Icon name={destaque ? 'pin' : 'usuarios'} size={15} />
        </span>
        <h3 className="text-[15px] font-semibold text-fg">{titulo}</h3>
      </div>
      <ul className="mt-4 space-y-3.5">
        {candidatos.map((c, i) => {
          const s = corSlot(c.cor);
          const pct = resultado[c.numero as Autor];
          return (
            <li key={c.numero}>
              <div className="flex items-center gap-2.5">
                <AvatarCandidato candidato={c} foto={fotos[c.numero as Autor]} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{c.nomeUrna}</span>
                <span className={cn('num font-display text-[20px] font-semibold leading-none tracking-[-0.02em]', pct === null ? 'text-fg-subtle' : s.textDisplay)}>
                  {fmtSintonia(pct)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                {pct !== null ? (
                  <motion.div
                    className={cn('h-full rounded-full', s.bg)}
                    initial={{ width: 0 }}
                    animate={{ width: revelado ? `${pct}%` : 0 }}
                    transition={{ duration: reduzir ? 0 : 0.9, delay: reduzir ? 0 : 0.2 + i * 0.1, ease: [0.22, 0.9, 0.24, 1] }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="num mt-3 text-[12px] text-fg-subtle">
        {fmtInt(resultado.respondidas)} afirmações respondidas{resultado.puladas ? ` · ${fmtInt(resultado.puladas)} puladas` : ''}
      </p>
    </div>
  );
}
