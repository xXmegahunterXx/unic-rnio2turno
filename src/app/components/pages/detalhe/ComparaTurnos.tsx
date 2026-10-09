/**
 * 1º turno × 2º turno numa abrangência (município, UF): barras lado a lado por finalista com o % de
 * votos válidos oficial de cada turno e a variação em pontos percentuais. Linguagem neutra: a variação
 * é só aritmética (sem verde/vermelho, sem "ganhou/perdeu" valorativo).
 *
 * No 1º turno o % é sobre TODOS os candidatos (regra do TSE); por isso os dois finalistas tendem a
 * crescer no 2º turno — explicamos isso com a linha "Demais candidatos".
 */
import type { PrimeiroTurnoLocal, Race, Tally } from '@/shared/types';
import { pctBrancos, pctComparecimento, pctNulos, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';

/** Contagem mínima para comparar (1º turno vem de `PrimeiroTurnoLocal` ou de um `Summary`). */
export type BaseT1 = Pick<Tally, 'votos' | 'brancos' | 'nulos' | 'comparecimento'> & { eleitorado: number };

/** PrimeiroTurnoLocal/Summary → forma usada pelos cálculos de calc.ts. */
export function tallyT1(t: BaseT1 | PrimeiroTurnoLocal) {
  return {
    votos: t.votos,
    brancos: t.brancos,
    nulos: t.nulos,
    comparecimento: t.comparecimento,
    eleitoradoTotalizado: t.eleitorado,
    abstencao: Math.max(0, t.eleitorado - t.comparecimento),
  };
}

export interface ComparaTurnosProps {
  /** Corrida do 2º turno (2 finalistas) e a correspondente do 1º turno (finalistas + Outros). */
  race: Race;
  raceT1: Race;
  t2: Tally;
  t1: BaseT1 | PrimeiroTurnoLocal;
  /** Mostra comparecimento e brancos/nulos. Padrão true. */
  participacao?: boolean;
  /** Versão enxuta (painel lateral). */
  compacto?: boolean;
  className?: string;
}

export function ComparaTurnos({ race, raceT1, t2, t1, participacao = true, compacto, className }: ComparaTurnosProps) {
  const b1 = tallyT1(t1);
  const tem2 = validos(t2) > 0;
  const tem1 = validos(b1) > 0;
  const iOutros = raceT1.candidatos.findIndex((c) => c.agregado);
  const pctOutros = iOutros >= 0 && tem1 ? pctValidos(b1, iOutros) : null;

  return (
    <div className={className}>
      <ul className={cn(compacto ? 'space-y-3.5' : 'space-y-5')}>
        {race.candidatos.map((c, i) => {
          // o mesmo candidato no 1º turno (casado pelo número; os índices 0/1 coincidem por construção)
          const j = raceT1.candidatos.findIndex((x) => x.numero === c.numero && !x.agregado);
          const p1 = j >= 0 && tem1 ? pctValidos(b1, j) : null;
          const p2 = tem2 ? pctValidos(t2, i) : null;
          const s = corSlot(c.cor);
          const delta = p1 !== null && p2 !== null ? p2 - p1 : null;
          return (
            <li key={c.numero}>
              <div className="flex items-center gap-2.5">
                <CandidateAvatar candidato={c} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{c.nomeUrna}</span>
                {delta !== null ? (
                  <span
                    className="num shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-[11.5px] font-semibold text-fg"
                    title="Variação em pontos percentuais do 1º para o 2º turno"
                  >
                    {fmtPP(delta)}
                  </span>
                ) : null}
              </div>
              <div
                className={cn(
                  'mt-2 grid grid-cols-[3.25rem_minmax(0,1fr)_3.75rem] items-center gap-x-2.5',
                  compacto ? 'gap-y-1' : 'gap-y-1.5',
                )}
              >
                <Barra rotulo="1º turno" pct={p1} cls={cn(s.bg, 'opacity-40')} />
                <Barra rotulo="2º turno" pct={p2} cls={s.bg} forte vazio={tem2 ? undefined : 'aguardando'} />
              </div>
            </li>
          );
        })}
      </ul>

      {pctOutros !== null ? (
        <p className="mt-4 text-[12.5px] leading-snug text-fg-muted">
          No 1º turno, os demais candidatos somaram <span className="num font-medium text-fg">{fmtPct(pctOutros, 1)}</span> dos válidos —
          por isso os dois finalistas tendem a crescer no 2º turno.
        </p>
      ) : null}

      {participacao ? (
        <dl className="mt-4 grid grid-cols-2 gap-2.5 border-t border-line pt-4">
          <Indicador
            rotulo="Comparecimento"
            v1={tem1 || b1.eleitoradoTotalizado > 0 ? pctComparecimento(b1) : null}
            v2={t2.eleitoradoTotalizado > 0 ? pctComparecimento(t2) : null}
          />
          <Indicador
            rotulo="Brancos e nulos"
            v1={b1.comparecimento > 0 ? pctBrancos(b1) + pctNulos(b1) : null}
            v2={t2.comparecimento > 0 ? pctBrancos(t2) + pctNulos(t2) : null}
          />
        </dl>
      ) : null}
      {!compacto && b1.comparecimento > 0 ? (
        <p className="num mt-3 text-[11.5px] text-fg-subtle">
          1º turno: {fmtInt(b1.comparecimento)} votantes · {fmtInt(validos(b1))} votos válidos (resultado oficial, TSE).
        </p>
      ) : null}
    </div>
  );
}

function Barra({ rotulo, pct, cls, forte, vazio }: { rotulo: string; pct: number | null; cls: string; forte?: boolean; vazio?: string }) {
  return (
    <>
      <span className={cn('text-[11px] leading-none', forte ? 'font-semibold text-fg' : 'text-fg-muted')}>{rotulo}</span>
      <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-3">
        {pct !== null ? (
          <span
            className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out', cls)}
            style={{ width: `${Math.max(0.5, Math.min(100, pct))}%` }}
          />
        ) : null}
        {/* marca de 50% */}
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-fg/40" />
      </span>
      <span className={cn('num text-right text-[12.5px] leading-none', forte ? 'font-semibold text-fg' : 'text-fg-muted')}>
        {pct !== null ? fmtPct(pct, 1) : <span className="text-[11px] font-normal text-fg-subtle">{vazio ?? '—'}</span>}
      </span>
    </>
  );
}

function Indicador({ rotulo, v1, v2 }: { rotulo: string; v1: number | null; v2: number | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{rotulo}</dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
        <span className="num text-fg-muted">{v1 !== null ? fmtPct(v1, 1) : '—'}</span>
        <span aria-hidden className="text-fg-subtle">
          →
        </span>
        <span className="num font-semibold text-fg">{v2 !== null ? fmtPct(v2, 1) : '—'}</span>
      </dd>
      <span className="sr-only">no 1º turno e no 2º turno, respectivamente</span>
    </div>
  );
}
