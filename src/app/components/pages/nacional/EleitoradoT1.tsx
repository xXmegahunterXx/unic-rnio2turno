/**
 * "O eleitorado no 1º turno" (fase pre / 1º turno explícito): como os eleitores aptos se dividiram em
 * 4 de outubro — os dois finalistas, os demais candidatos, brancos e nulos e quem não compareceu.
 * Aritmética pura sobre o resultado oficial (sem projeção). Cores por slot; o resto em tons neutros.
 */
import { memo } from 'react';
import type { Race, Summary } from '@/shared/types';
import { pctAbstencao, pctBrancos, pctNulos, pctValidos } from '@/shared/calc';
import { fmtCompact, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { hachuraStyle } from '@/app/components/apuracao/MapHatch';

interface Fatia {
  chave: string;
  rotulo: string;
  votos: number;
  /** Percentual oficial, com a base explícita (calc.ts). */
  pct: string;
  cor: string;
  hachura?: boolean;
}

export const EleitoradoT1 = memo(function EleitoradoT1({ race, resumo, className }: { race: Race; resumo: Summary; className?: string }) {
  const base = resumo.eleitoradoTotalizado || resumo.eleitorado;
  if (base <= 0) return null;
  const finalistas = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  const iOutros = race.candidatos.findIndex((c) => c.agregado);
  const outros = iOutros >= 0 ? (resumo.votos[iOutros] ?? 0) : 0;
  const bn = resumo.brancos + resumo.nulos;

  const fatias: Fatia[] = [
    ...finalistas.map(({ c, i }) => ({
      chave: `c${c.numero}`,
      rotulo: c.nomeUrna,
      votos: resumo.votos[i] ?? 0,
      pct: `${fmtPct(pctValidos(resumo, i))} dos válidos`,
      cor: corSlot(c.cor).bg,
    })),
    ...(iOutros >= 0 ? [{ chave: 'outros', rotulo: 'Demais candidatos', votos: outros, pct: `${fmtPct(pctValidos(resumo, iOutros))} dos válidos`, cor: 'bg-cand-outros' }] : []),
    { chave: 'bn', rotulo: 'Brancos e nulos', votos: bn, pct: `${fmtPct(pctBrancos(resumo) + pctNulos(resumo))} dos votos`, cor: 'bg-fg-subtle/45' },
    { chave: 'abst', rotulo: 'Não compareceram', votos: resumo.abstencao, pct: `${fmtPct(pctAbstencao(resumo))} do eleitorado`, cor: '', hachura: true },
  ];
  const fora = outros + bn + resumo.abstencao;
  const dif = finalistas.length === 2 ? Math.abs((resumo.votos[finalistas[0].i] ?? 0) - (resumo.votos[finalistas[1].i] ?? 0)) : null;

  return (
    <section aria-labelledby="eleitorado-t1-titulo" className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="eleitorado-t1-titulo" className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">
          O eleitorado no 1º turno
        </h2>
        <p className="num text-[12.5px] text-fg-muted">
          <span className="font-semibold text-fg">{fmtInt(base)}</span> eleitores aptos
        </p>
      </div>

      {/* barra empilhada: largura = parcela do eleitorado (só visual; os números ficam na legenda) */}
      <div className="mt-4 flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {fatias.map((f) =>
          f.votos > 0 ? (
            <span
              key={f.chave}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', f.cor)}
              style={{ width: `${(f.votos / base) * 100}%`, ...(f.hachura ? hachuraStyle() : null) }}
            />
          ) : null,
        )}
      </div>

      {/* lista: uma linha por fatia; no desktop o cartão pode esticar e as linhas se distribuem */}
      <ul className="mt-4 flex flex-1 flex-col justify-evenly divide-y divide-line">
        {fatias.map((f) => (
          <li key={f.chave} className="flex min-w-0 items-center gap-3 py-2.5">
            <span aria-hidden className={cn('h-3 w-3 shrink-0 rounded-[4px]', f.cor)} style={f.hachura ? hachuraStyle() : undefined} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium leading-tight text-fg">{f.rotulo}</div>
              <div className="num mt-0.5 text-[12px] leading-snug text-fg-muted">{f.pct}</div>
            </div>
            <span className="num shrink-0 text-[14.5px] font-semibold text-fg">{fmtInt(f.votos)}</span>
          </li>
        ))}
      </ul>

      {dif !== null ? (
        <p className="mt-4 border-t border-line pt-3 text-pretty text-[12.5px] leading-snug text-fg-muted">
          Somados, <span className="num font-semibold text-fg">{fmtCompact(fora)}</span> de eleitores aptos não votaram em nenhum dos dois finalistas. A
          diferença entre eles foi de <span className="num font-semibold text-fg">{fmtCompact(dif)}</span> de votos.
        </p>
      ) : null}
    </section>
  );
});
