/**
 * Cartão de uma disputa de governador (/governadores): mini mapa da UF por município, os dois
 * finalistas na ordem da urna, barra dividida, diferença, progresso e selo de resultado definido.
 * O cartão inteiro é um link para a página da UF.
 */
import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { MunicipioResumo, Race, Summary, UF } from '@/shared/types';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, toneFromCor } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { ApuracaoProgress } from '@/app/components/apuracao/ApuracaoProgress';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { MiniUfMap } from './MiniUfMap';

export interface GovernadorCardProps {
  uf: UF;
  race: Race;
  resumo: Summary;
  municipios?: MunicipioResumo[];
  to: string;
  className?: string;
}

/** Diferença (p.p.) entre os dois finalistas; null sem votos. */
export function difFinalistas(resumo: Pick<Summary, 'votos'>): number | null {
  return validos(resumo) > 0 ? Math.abs(pctValidos(resumo, 0) - pctValidos(resumo, 1)) : null;
}

export const GovernadorCard = memo(function GovernadorCard({ uf, race, resumo, municipios, to, className }: GovernadorCardProps) {
  const tem = validos(resumo) > 0;
  const t1 = race.turno === 1;
  const eleito = !t1 && resumo.eleito !== null ? race.candidatos[resumo.eleito] : null;
  const dif = difFinalistas(resumo);
  const iOutros = race.candidatos.findIndex((c) => c.agregado);
  const nome = UF_NOMES[uf];
  const resumoTexto = tem
    ? `${race.candidatos
        .filter((c) => !c.agregado)
        .map((c) => `${c.nomeUrna} ${fmtPct(pctValidos(resumo, race.candidatos.indexOf(c)), 1)}`)
        .join(', ')}, com ${fmtPct(pctTotalizadas(resumo), 1)} das seções`
    : 'aguardando votos';

  return (
    <Link
      to={to}
      aria-label={`Governador · ${nome}: ${resumoTexto}.${eleito ? ` Vitória de ${eleito.nomeUrna} definida.` : ''} Ver detalhes.`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5',
        'transition-[transform,border-color] duration-200 hover:-translate-y-px hover:border-line/[2]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      {eleito ? <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br', corSlot(eleito.cor).glow)} /> : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-surface-3 px-1.5 font-mono text-[11.5px] font-semibold text-fg">{uf}</span>
            <h3 className="truncate font-display text-[18px] font-semibold leading-tight tracking-[-0.015em] text-fg">{nome}</h3>
          </div>
          <p className="num mt-1 text-[12.5px] text-fg-muted">
            {REGIAO_NOMES[UF_REGIAO[uf]]} · {fmtInt(resumo.eleitorado)} eleitores
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {eleito ? (
            <Badge tone={toneFromCor(eleito.cor)} size="xs" caps icon="check">
              {resumo.status === 'encerrada' ? 'Final' : 'Definido'}
            </Badge>
          ) : dif !== null ? (
            <span className="num inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-fg" title="Diferença entre os dois finalistas">
              {fmtPP(dif).replace('+', '')}
            </span>
          ) : null}
          <Icon name="chevron-direita" size={18} className="text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
        </div>
      </div>

      <div className="relative mt-4 flex flex-1 items-center gap-4">
        <div className="aspect-square w-[28%] max-w-[180px] shrink-0">
          <MiniUfMap uf={uf} municipios={municipios} race={race} className="h-full w-full" />
        </div>
        <ul className="min-w-0 flex-1 space-y-3">
          {race.candidatos.map((c, i) => {
            if (c.agregado) return null;
            const s = corSlot(c.cor);
            const lider = tem && resumo.lider === i;
            return (
              <li key={c.numero} className="flex items-center gap-2.5">
                <CandidateAvatar candidato={c} size="sm" eleito={eleito === c} className="hidden sm:inline-flex" />
                <div className="min-w-0 flex-1">
                  <div className={cn('line-clamp-2 text-[14.5px] leading-tight text-fg', lider ? 'font-semibold' : 'font-medium')}>
                    {c.nomeUrna}
                  </div>
                  <div className="num mt-0.5 truncate text-[12px] text-fg-muted">
                    {c.partido} · {fmtInt(resumo.votos[i] ?? 0)}
                  </div>
                </div>
                <NumberRoll
                  value={pctValidos(resumo, i)}
                  format={(n) => fmtPct(n, 1)}
                  smallChars="%"
                  className={cn('shrink-0 font-display text-[22px] font-semibold leading-none tracking-[-0.03em]', tem ? s.textDisplay : 'text-fg-subtle')}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative mt-4">
        <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} size="sm" nomes={race.candidatos.map((c) => c.nomeUrna)} />
        {iOutros >= 0 ? (
          <p className="mt-2 text-[12px] text-fg-muted">
            Demais candidatos: <span className="num font-medium text-fg">{fmtPct(pctValidos(resumo, iOutros))}</span>
          </p>
        ) : null}
        <ApuracaoProgress resumo={resumo} variant="compact" className="mt-3.5" />
      </div>
    </Link>
  );
});
