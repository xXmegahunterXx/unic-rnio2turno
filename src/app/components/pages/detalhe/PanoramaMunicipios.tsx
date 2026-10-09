/**
 * "Onde cada um está à frente": quantos municípios (ou cidades, no exterior) cada candidato lidera,
 * quantos estão empatados e quantos ainda não têm seção totalizada. Simétrico (A à esquerda, B à direita).
 */
import { useMemo } from 'react';
import type { MunicipioResumo, Race } from '@/shared/types';
import { margem } from '@/shared/calc';
import { fmtCompact, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';

export interface PanoramaMunicipiosProps {
  race: Race;
  municipios: MunicipioResumo[];
  /** 'municípios' | 'cidades' */
  unidade?: string;
  /** 'card' (cartão) ou 'faixa' (uma linha, sobre o mapa). */
  variant?: 'card' | 'faixa';
  className?: string;
}

export function PanoramaMunicipios({ race, municipios, unidade = 'municípios', variant = 'card', className }: PanoramaMunicipiosProps) {
  const c = useMemo(() => {
    const n = race.candidatos.map(() => 0);
    const eleit = race.candidatos.map(() => 0);
    let pend = 0;
    let emp = 0;
    for (const m of municipios) {
      if (m.secoesTotalizadas <= 0) {
        pend++;
        continue;
      }
      const l = margem(m).lider;
      if (l === null) emp++;
      else {
        n[l]++;
        eleit[l] += m.eleitorado;
      }
    }
    return { n, eleit, pend, emp };
  }, [race, municipios]);

  const [a, b] = race.candidatos;
  const total = municipios.length || 1;
  const outros = race.candidatos.findIndex((x) => x.agregado);
  const nOutros = outros >= 0 ? c.n[outros] : 0;
  const seg = [
    { k: 'a', w: c.n[0], cls: corSlot(a.cor).bg },
    { k: 'p', w: c.pend + c.emp + nOutros, cls: 'bg-pending' },
    { k: 'b', w: c.n[1], cls: corSlot(b.cor).bg },
  ];

  const barra = (
    <div
      className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
      role="img"
      aria-label={`${a.nomeUrna} à frente em ${c.n[0]} ${unidade}; ${b.nomeUrna} em ${c.n[1]}; sem resultado: ${c.pend}`}
    >
      {seg.map((s) =>
        s.w > 0 ? (
          <span key={s.k} className={cn('h-full transition-[flex-grow] duration-700', s.cls)} style={{ flexGrow: s.w / total, flexBasis: 0 }} />
        ) : null,
      )}
    </div>
  );

  if (variant === 'faixa') {
    return (
      <div className={cn('min-w-0', className)} aria-label={`${unidade} à frente por candidato`} role="group">
        <div className="mb-2 flex items-center justify-between gap-3 text-[13px] leading-tight">
          {[0, 1].map((i) => {
            const cand = race.candidatos[i];
            return (
              <span key={cand.numero} className={cn('flex min-w-0 items-center gap-2', i === 1 && 'flex-row-reverse text-right')}>
                <CandidateAvatar candidato={cand} size="xs" />
                <span className="min-w-0 truncate font-medium text-fg">{cand.nomeUrna}</span>
                <NumberRoll value={c.n[i]} className={cn('shrink-0 font-display text-[20px] font-semibold leading-none tracking-[-0.02em]', corSlot(cand.cor).textDisplay)} />
              </span>
            );
          })}
        </div>
        {barra}
        <p className="num mt-1.5 text-center text-[11.5px] text-fg-muted">
          {unidade.charAt(0).toUpperCase() + unidade.slice(1)} onde cada um está à frente
          {c.pend > 0 ? <> · {fmtInt(c.pend)} sem seção totalizada</> : null}
          {c.emp > 0 ? <> · {fmtInt(c.emp)} empatados</> : null}
        </p>
      </div>
    );
  }

  return (
    <section aria-label={`${unidade} à frente por candidato`} className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        Onde cada um está à frente
      </h3>
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        {[0, 1].map((i) => {
          const cand = race.candidatos[i];
          const s = corSlot(cand.cor);
          return (
            <div key={cand.numero} className={cn('flex min-w-0 flex-col', i === 1 && 'items-end text-right')}>
              <span className={cn('flex min-w-0 items-center gap-1.5', i === 1 && 'flex-row-reverse')}>
                <CandidateAvatar candidato={cand} size="xs" />
                <span className="truncate text-[13px] font-medium text-fg">{cand.nomeUrna}</span>
              </span>
              <NumberRoll
                value={c.n[i]}
                className={cn('mt-2 font-display text-[30px] font-semibold leading-none tracking-[-0.03em]', s.textDisplay)}
              />
              <span className="mt-1 text-[12px] text-fg-muted">{unidade}</span>
              {c.eleit[i] > 0 ? (
                <span className="num mt-0.5 text-[11.5px] text-fg-subtle">{fmtCompact(c.eleit[i])} eleitores</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-4">{barra}</div>
      <p className="num mt-2.5 text-[12px] leading-snug text-fg-muted">
        {fmtInt(municipios.length)} {unidade}
        {c.pend > 0 ? <> · {fmtInt(c.pend)} sem seção totalizada</> : null}
        {c.emp > 0 ? <> · {fmtInt(c.emp)} empatados</> : null}
        {nOutros > 0 ? <> · {fmtInt(nOutros)} com outro candidato à frente</> : null}
      </p>
    </section>
  );
}
