/**
 * Revelação animada do resultado: um medidor por candidato, SEMPRE na ordem da urna, com a mesma tipografia
 * e o mesmo tamanho para os dois (neutralidade). Cores só pelo slot (`corSlot`). Antes da revelação, "?" —
 * depois, foto oficial (quando disponível) ou monograma, nome, partido e número.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { AvatarCandidato } from './AvatarCandidato';

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
  foto,
  pct,
  consideradas,
  revelado,
  ordem = 0,
  tamanho = 'lg',
}: {
  candidato: Candidate;
  foto?: string;
  /** 0–100, ou null sem base de cálculo. */
  pct: number | null;
  /** Quantas afirmações entraram na conta deste candidato. */
  consideradas: number;
  revelado: boolean;
  ordem?: number;
  tamanho?: 'md' | 'lg';
}) {
  const s = corSlot(candidato.cor);
  const reduzir = useReducedMotion();
  const R = 52;
  const lg = tamanho === 'lg';
  const valor = pct ?? 0;
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
            animate={{ pathLength: revelado && pct !== null ? Math.max(0.0001, valor / 100) : 0 }}
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
                <AvatarCandidato
                  candidato={candidato}
                  foto={foto}
                  size={lg ? 'xl' : 'lg'}
                  className={lg ? 'sm:h-[104px] sm:w-[104px] sm:text-[32px]' : ''}
                />
              </motion.span>
            ) : (
              <motion.span
                key="oculto"
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className={cn(
                  'inline-flex items-center justify-center rounded-full border border-dashed border-fg-subtle/60 bg-surface-2 font-display font-semibold text-fg-muted',
                  lg ? 'h-20 w-20 text-[30px] sm:h-[104px] sm:w-[104px]' : 'h-14 w-14 text-[22px]',
                )}
              >
                ?
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      {pct === null ? (
        <span className={cn('mt-4 font-display font-semibold leading-none text-fg-subtle', lg ? 'text-[52px] sm:text-[76px]' : 'text-[38px] sm:text-[44px]')} aria-label={`Sem base de cálculo para ${candidato.nomeUrna}`}>
          —
        </span>
      ) : (
        <NumberRoll
          value={revelado ? valor : 0}
          format={(n) => fmtPct(n, 0)}
          smallChars="%"
          smallClassName="text-[0.45em] ml-[0.04em] font-semibold"
          ariaLabel={`${fmtPct(valor, 0)} de sintonia com ${candidato.nomeUrna}`}
          duration={1100}
          className={cn(
            'mt-4 font-display font-semibold leading-none tracking-[-0.045em]',
            lg ? 'text-[52px] sm:text-[76px]' : 'text-[38px] sm:text-[44px]',
            revelado ? s.textDisplay : 'text-fg-subtle',
          )}
        />
      )}
      <p className={cn('text-fg-muted', lg ? 'mt-1.5 text-[13px] sm:text-[14px]' : 'mt-1 text-[12.5px]')}>de sintonia com</p>
      <p className={cn('mt-1 max-w-full text-balance font-display font-semibold leading-tight tracking-[-0.02em] text-fg', lg ? 'text-[19px] sm:text-[26px]' : 'text-[16px] sm:text-[18px]')}>
        {revelado ? candidato.nomeUrna : 'Candidatura oculta'}
      </p>
      <p className={cn('num mt-0.5 text-fg-muted', lg ? 'text-[12.5px] sm:text-[13.5px]' : 'text-[12px]')}>
        {revelado && candidato.partido ? `${candidato.partido} · ${candidato.numero}` : '· · ·'}
      </p>
      <p className={cn('num mt-2 text-fg-subtle', lg ? 'text-[12px] sm:text-[12.5px]' : 'text-[11.5px]')}>
        com base em {fmtInt(consideradas)} {consideradas === 1 ? 'afirmação' : 'afirmações'}
      </p>
    </div>
  );
}

/** Frase-resumo das respostas (sem nenhuma referência a candidato). */
export function resumoRespostas(r: ResultadoSintonia, importantes: number, total: number): string {
  const partes = [`Você respondeu ${fmtInt(r.respondidas)} de ${fmtInt(total)} afirmações`];
  if (r.puladas) partes.push(`pulou ${fmtInt(r.puladas)}`);
  if (importantes) partes.push(`marcou ${fmtInt(importantes)} como ${importantes === 1 ? 'mais importante' : 'mais importantes'}`);
  if (partes.length === 1) return `${partes[0]}.`;
  const ultima = partes.pop();
  return `${partes.join(', ')} e ${ultima}.`;
}
