/**
 * Comparação com o 1º turno: % dos válidos de cada finalista no 1º turno (Candidate.primeiroTurno) e
 * agora, com a variação em pontos percentuais. Neutro: setas e textos sem cor de "ganho/perda".
 */
import { memo } from 'react';
import type { Race, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtCompact, fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';

export interface ComparacaoT1Props {
  race: Race;
  resumo: Summary;
  /** Corrida do 1º turno (para o total dos demais candidatos). */
  raceT1?: Race;
  className?: string;
}

export const ComparacaoT1 = memo(function ComparacaoT1({ race, resumo, raceT1, className }: ComparacaoT1Props) {
  const tem = validos(resumo) > 0;
  const outros = raceT1?.candidatos.find((c) => c.agregado)?.primeiroTurno;
  const pst = pctTotalizadas(resumo);
  return (
    <section aria-labelledby="comparacao-titulo" className={cn('min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <h2 id="comparacao-titulo" className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">
        Comparação com o 1º turno
      </h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">% dos votos válidos de cada finalista, em 4 de outubro e agora</p>

      <ul className="mt-4 space-y-5">
        {race.candidatos.map((c, i) => {
          const pt = c.primeiroTurno;
          if (!pt) return null;
          const agora = pctValidos(resumo, i);
          const delta = agora - pt.pct;
          const s = corSlot(c.cor);
          return (
            <li key={c.numero}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CandidateAvatar candidato={c} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold leading-tight text-fg">{c.nomeUrna}</div>
                    <div className="num text-[12px] text-fg-muted">
                      {c.partido} · {c.numero}
                    </div>
                  </div>
                </div>
                {tem ? (
                  <span
                    className="num inline-flex shrink-0 items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[13px] font-semibold text-fg"
                    aria-label={`Variação: ${fmtPP(delta, 2)}`}
                  >
                    <Icon name={delta >= 0 ? 'seta-cima' : 'seta-baixo'} size={14} strokeWidth={2.25} className="text-fg-muted" />
                    {fmtPP(delta)}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-2.5">
                <Linha rotulo="1º turno" pct={pt.pct} votos={pt.votos} barra={cn(s.bg, 'opacity-40')} />
                <Linha
                  rotulo="2º turno"
                  pct={tem ? agora : null}
                  votos={tem ? resumo.votos[i] : null}
                  barra={s.bg}
                  sufixo={tem && resumo.status !== 'encerrada' ? `até agora (${fmtPct(pst, 1)} das seções)` : undefined}
                  destaque
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 border-t border-line pt-3 text-[12px] leading-snug text-fg-muted">
        {outros ? (
          <>
            No 1º turno, os demais candidatos somaram <span className="num font-medium text-fg">{fmtPct(outros.pct)}</span> dos válidos (
            <span className="num">{fmtCompact(outros.votos)}</span> de votos).{' '}
          </>
        ) : null}
        No 2º turno, os votos válidos se dividem só entre os dois finalistas.
      </p>
    </section>
  );
});

function Linha({
  rotulo,
  pct,
  votos,
  barra,
  sufixo,
  destaque,
}: {
  rotulo: string;
  pct: number | null;
  votos: number | null;
  barra: string;
  sufixo?: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-[12.5px]', destaque ? 'font-semibold text-fg' : 'text-fg-muted')}>{rotulo}</span>
        <span className={cn('num text-[14px]', destaque ? 'font-semibold text-fg' : 'text-fg-muted')}>{pct !== null ? fmtPct(pct) : '—'}</span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', barra)} style={{ width: `${pct ?? 0}%` }} />
        <span className="absolute inset-y-0 left-1/2 w-px bg-fg/40" />
      </div>
      <div className="num mt-1 truncate text-[11.5px] text-fg-muted">
        {votos !== null ? `${fmtInt(votos)} votos` : 'aguardando seções totalizadas'}
        {sufixo ? ` ${sufixo}` : ''}
      </div>
    </div>
  );
}
