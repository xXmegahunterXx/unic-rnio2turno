/**
 * Contexto do Boletim de Urna: como a seção votou em relação à zona e ao município (barras A|B na
 * mesma escala), diferença em p.p. e participação (comparecimento, brancos, nulos) lado a lado.
 */
import type { Race, Tally } from '@/shared/types';
import { pctBrancos, pctComparecimento, pctNulos, pctValidos, validos } from '@/shared/calc';
import { fmtPP, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';

export interface Abrangencia {
  rotulo: string;
  sub?: string;
  t: Tally | null;
  destaque?: boolean;
}

export function ComparaAbrangencias({ race, linhas, className }: { race: Race; linhas: Abrangencia[]; className?: string }) {
  const [a, b] = race.candidatos;
  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between text-[12px] font-medium text-fg-muted">
        <span className="flex items-center gap-1.5">
          <CandidateAvatar candidato={a} size="xs" />
          {a.nomeUrna}
        </span>
        <span className="flex items-center gap-1.5">
          {b.nomeUrna}
          <CandidateAvatar candidato={b} size="xs" />
        </span>
      </div>
      <ul className="space-y-3.5">
        {linhas.map((l) => {
          const tem = !!l.t && validos(l.t) > 0;
          return (
            <li key={l.rotulo} className={cn('rounded-xl px-3 py-2.5', l.destaque ? 'bg-brand/[0.08] ring-1 ring-inset ring-brand/25' : 'bg-surface-2')}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className={cn('truncate text-[13.5px]', l.destaque ? 'font-semibold text-fg' : 'font-medium text-fg')}>{l.rotulo}</span>
                {l.sub ? <span className="num shrink-0 text-[11.5px] text-fg-muted">{l.sub}</span> : null}
              </div>
              <div className="grid grid-cols-[3.4rem_minmax(0,1fr)_3.4rem] items-center gap-2.5">
                <span className={cn('num text-[13px] font-semibold', tem ? corSlot(a.cor).text : 'text-fg-subtle')}>
                  {tem ? fmtPct(pctValidos(l.t!, 0), 1) : '—'}
                </span>
                <VoteSplitBar votos={l.t?.votos ?? [0, 0]} cores={race.candidatos.map((c) => c.cor)} size="sm" nomes={race.candidatos.map((c) => c.nomeUrna)} />
                <span className={cn('num text-right text-[13px] font-semibold', tem ? corSlot(b.cor).text : 'text-fg-subtle')}>
                  {tem ? fmtPct(pctValidos(l.t!, 1), 1) : '—'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Nesta seção, X teve N p.p. a mais do que no município." (null se não der para comparar). */
export function fraseDiferenca(race: Race, secao: Tally, base: Tally, onde: string): string | null {
  if (validos(secao) === 0 || validos(base) === 0) return null;
  const d = pctValidos(secao, 0) - pctValidos(base, 0);
  if (Math.abs(d) < 0.05) return `Nesta seção, o resultado ficou praticamente igual ao ${onde}.`;
  const i = d > 0 ? 0 : 1;
  return `Nesta seção, ${race.candidatos[i].nomeUrna} teve ${fmtPP(Math.abs(d)).replace('+', '')} a mais do que no ${onde}.`;
}

export function ParticipacaoComparada({ secao, base, rotuloBase, className }: { secao: Tally | null; base: Tally | null; rotuloBase: string; className?: string }) {
  const itens: { rotulo: string; f: (t: Tally) => number; ok: (t: Tally) => boolean }[] = [
    { rotulo: 'Comparecimento', f: pctComparecimento, ok: (t) => t.eleitoradoTotalizado > 0 },
    { rotulo: 'Brancos', f: pctBrancos, ok: (t) => t.comparecimento > 0 },
    { rotulo: 'Nulos', f: pctNulos, ok: (t) => t.comparecimento > 0 },
  ];
  return (
    <dl className={cn('grid grid-cols-3 gap-2', className)}>
      {itens.map((it) => (
        <div key={it.rotulo} className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{it.rotulo}</dt>
          <dd className="mt-1">
            <span className="num block font-display text-[19px] font-semibold leading-tight text-fg">
              {secao && it.ok(secao) ? fmtPct(it.f(secao), 1) : '—'}
            </span>
            <span className="num block truncate text-[11.5px] text-fg-muted">
              {base && it.ok(base) ? `${fmtPct(it.f(base), 1)} ${rotuloBase}` : ' '}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
