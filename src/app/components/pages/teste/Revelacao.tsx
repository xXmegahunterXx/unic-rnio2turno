/**
 * Revelação animada do resultado: "Você está X% em sintonia com <candidato>", um medidor por candidato,
 * SEMPRE na ordem da urna, com a mesma tipografia e o mesmo tamanho para os dois (neutralidade).
 * Cores só pelo slot (`corSlot`). Antes da revelação, monogramas "?" — depois, a autoria.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import type { Autor, Sintonia } from './sintonia';

/** Atraso até a revelação (ms). */
export const ATRASO_REVELAR = 650;

export function useRevelado(atraso = ATRASO_REVELAR): boolean {
  const reduzir = useReducedMotion();
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRevelado(true), reduzir ? 0 : atraso);
    return () => window.clearTimeout(t);
  }, [atraso, reduzir]);
  return revelado;
}

export function MedidorSintonia({
  candidato,
  pct,
  revelado,
  ordem = 0,
  tamanho = 'lg',
  rotulo = 'em sintonia com',
}: {
  candidato: Candidate;
  pct: number;
  revelado: boolean;
  ordem?: number;
  tamanho?: 'md' | 'lg';
  rotulo?: string;
}) {
  const s = corSlot(candidato.cor);
  const reduzir = useReducedMotion();
  const R = 52;
  const lg = tamanho === 'lg';
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className={cn('relative', lg ? 'h-[128px] w-[128px] sm:h-[176px] sm:w-[176px]' : 'h-[96px] w-[96px] sm:h-[112px] sm:w-[112px]')}>
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" className="stroke-surface-3" />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className={s.stroke}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: revelado ? Math.max(0.0001, pct / 100) : 0 }}
            transition={{ duration: reduzir ? 0 : 1.1, delay: reduzir ? 0 : 0.15 + ordem * 0.12, ease: [0.22, 0.9, 0.24, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center [perspective:600px]">
          <AnimatePresence mode="wait" initial={false}>
            {revelado ? (
              <motion.span
                key="cand"
                initial={reduzir ? false : { rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.32, delay: ordem * 0.12, ease: 'easeOut' }}
              >
                <CandidateAvatar candidato={candidato} size={lg ? 'xl' : 'lg'} className={lg ? 'sm:h-24 sm:w-24 sm:text-[30px]' : ''} />
              </motion.span>
            ) : (
              <motion.span
                key="oculto"
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className={cn(
                  'inline-flex items-center justify-center rounded-full border border-dashed border-fg-subtle/60 bg-surface-2 font-display font-semibold text-fg-muted',
                  lg ? 'h-20 w-20 text-[30px] sm:h-24 sm:w-24' : 'h-14 w-14 text-[22px]',
                )}
              >
                ?
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className={cn('text-fg-muted', lg ? 'mt-4 text-[13px] sm:mt-5 sm:text-[14px]' : 'mt-3 text-[12.5px]')}>Você está</p>
      <NumberRoll
        value={revelado ? pct : 0}
        format={(n) => fmtPct(n, 0)}
        smallChars="%"
        smallClassName="text-[0.45em] ml-[0.04em] font-semibold"
        ariaLabel={`${fmtPct(pct, 0)} em sintonia com ${candidato.nomeUrna}`}
        duration={1100}
        className={cn(
          'font-display font-semibold leading-none tracking-[-0.045em]',
          lg ? 'text-[52px] sm:text-[76px]' : 'text-[38px] sm:text-[44px]',
          revelado ? s.textDisplay : 'text-fg-subtle',
        )}
      />
      <p className={cn('text-fg-muted', lg ? 'mt-1.5 text-[13px] sm:text-[14px]' : 'mt-1 text-[12.5px]')}>{rotulo}</p>
      <p className={cn('mt-1 max-w-full text-balance font-display font-semibold leading-tight tracking-[-0.02em] text-fg', lg ? 'text-[19px] sm:text-[26px]' : 'text-[16px] sm:text-[18px]')}>
        {revelado ? candidato.nomeUrna : 'Candidatura oculta'}
      </p>
      <p className={cn('num mt-0.5 text-fg-muted', lg ? 'text-[12.5px] sm:text-[13.5px]' : 'text-[12px]')}>
        {revelado && candidato.partido ? `${candidato.partido} · ${candidato.numero}` : '· · ·'}
      </p>
    </div>
  );
}

/** Frase-resumo das escolhas (sempre na ordem da urna). */
export function resumoEscolhas(s: Sintonia, candidatos: Candidate[]): string {
  const partes = candidatos.map((c) => {
    const n = s.escolhas[c.numero as Autor] ?? 0;
    return `${fmtInt(n)} ${n === 1 ? 'proposta' : 'propostas'} de ${c.nomeUrna}`;
  });
  const extra: string[] = [];
  if (s.tantoFaz) extra.push(`${fmtInt(s.tantoFaz)} “tanto faz”`);
  if (s.nenhuma) extra.push(`${fmtInt(s.nenhuma)} “nenhuma das duas”`);
  return `Você escolheu ${partes.join(' e ')}${extra.length ? `, e marcou ${extra.join(' e ')}` : ''}.`;
}
