/**
 * Quebra por tema: a sintonia com cada candidato em cada um dos 12 temas (mesma fórmula, restrita às duas
 * afirmações do tema). Candidatos na ordem da urna, mesma escala para os dois. "—" quando não há base
 * (afirmações puladas ou planos que não tratam do assunto). Grade compacta com linhas finas.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { TEMAS, type ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { AvatarCandidato } from './AvatarCandidato';
import { fmtSintonia, type Autor } from './sintonia';
import { TemaEmoji } from './TemaEmoji';

export function PorTema({
  resultado,
  candidatos,
  fotos,
  revelado = true,
}: {
  resultado: ResultadoSintonia;
  candidatos: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  revelado?: boolean;
}) {
  const reduzir = useReducedMotion();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-line shadow-card">
      <ul className="grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-3">
        {TEMAS.map((t, ti) => {
          const p = resultado.porTema[t.id];
          const semBase = candidatos.every((c) => p[c.numero as Autor] === null);
          return (
            <li key={t.id} className="bg-surface px-3.5 py-3 sm:px-4 sm:py-3.5">
              <div className="flex items-center gap-2">
                <TemaEmoji tema={t} size="sm" className="h-7 w-7 rounded-lg text-[14px]" />
                <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{t.rotulo}</h3>
              </div>
              {semBase ? (
                <p className="mt-2.5 text-[12.5px] leading-snug text-fg-subtle">Sem base: afirmações puladas ou sem posição nos planos.</p>
              ) : (
                <ul className="mt-2.5 grid grid-cols-2 gap-x-4">
                  {candidatos.map((c, i) => {
                    const v = p[c.numero as Autor];
                    const s = corSlot(c.cor);
                    return (
                      <li key={c.numero} className="flex min-w-0 items-center gap-2" title={`${c.nomeUrna}: ${fmtSintonia(v)}`}>
                        <AvatarCandidato candidato={c} foto={fotos[c.numero as Autor]} size="xs" />
                        <span className="sr-only">{c.nomeUrna}:</span>
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                          {v !== null ? (
                            <motion.div
                              className={cn('h-full rounded-full', s.bg)}
                              initial={reduzir ? false : { width: 0 }}
                              animate={{ width: revelado ? `${v}%` : 0 }}
                              transition={{ duration: reduzir ? 0 : 0.8, delay: reduzir ? 0 : 0.1 + ti * 0.03 + i * 0.06, ease: [0.22, 0.9, 0.24, 1] }}
                            />
                          ) : null}
                        </div>
                        <span className={cn('num w-[38px] shrink-0 text-right text-[13px] font-semibold', v === null ? 'text-fg-subtle' : 'text-fg')}>
                          {fmtSintonia(v)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
