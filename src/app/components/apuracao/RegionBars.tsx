/**
 * Resultado por região: barra dividida + % de cada candidato + % apurado, com o rosto de quem lidera
 * (foto oficial via useFotosRace; monograma quando anonimizado ou sem foto dos dois).
 */
import type { Race, Regiao, Summary } from '@/shared/types';
import { REGIAO_NOMES } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { VoteSplitBar } from './VoteSplitBar';
import { CandidateAvatar } from './CandidateAvatar';
import { useFotosRace } from './fotos';

export interface RegionBarsProps {
  race: Race;
  regioes: Partial<Record<Regiao, Summary>>;
  /** Ordem de exibição. Padrão N, NE, CO, SE, S, EX. */
  ordem?: Regiao[];
  onSelect?: (r: Regiao) => void;
  className?: string;
}

const ORDEM: Regiao[] = ['N', 'NE', 'CO', 'SE', 'S', 'EX'];

export function RegionBars({ race, regioes, ordem = ORDEM, onSelect, className }: RegionBarsProps) {
  const cores = race.candidatos.map((c) => c.cor);
  const [ca, cb] = race.candidatos;
  const fotos = useFotosRace(race);
  return (
    <ul className={cn('space-y-4', className)}>
      {ordem.map((rg) => {
        const r = regioes[rg];
        if (!r) return null;
        const tem = validos(r) > 0;
        const a = pctValidos(r, 0);
        const b = pctValidos(r, 1);
        const lider = tem ? margem(r).lider : null;
        const cLider = lider !== null ? race.candidatos[lider] : undefined;
        const conteudo = (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                {cLider && !cLider.agregado ? (
                  <span title={`${cLider.nomeUrna} à frente`} className="inline-flex">
                    <CandidateAvatar candidato={cLider} foto={fotos[lider!]} size="xs" />
                  </span>
                ) : (
                  <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-line/[2.5]" />
                )}
                <span className="truncate text-[14.5px] font-semibold text-fg">{REGIAO_NOMES[rg]}</span>
                {cLider ? <span className="sr-only">: {cLider.nomeUrna} à frente</span> : null}
              </span>
              <span className="num shrink-0 text-[12px] text-fg-muted">{fmtPct(pctTotalizadas(r), 1)} apurado</span>
            </div>
            <VoteSplitBar votos={r.votos} cores={cores} size="md" apurado={pctTotalizadas(r)} nomes={race.candidatos.map((c) => c.nomeUrna)} />
            <div className="mt-1.5 flex justify-between text-[12.5px] font-semibold">
              <span className={cn('num', tem ? corSlot(ca.cor).text : 'text-fg-subtle')}>{tem ? fmtPct(a) : '—'}</span>
              <span className={cn('num', tem ? corSlot(cb.cor).text : 'text-fg-subtle')}>{tem ? fmtPct(b) : '—'}</span>
            </div>
          </>
        );
        return (
          <li key={rg}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(rg)} className="-m-2 block w-[calc(100%+16px)] rounded-xl p-2 text-left transition-colors hover:bg-surface-2">
                {conteudo}
              </button>
            ) : (
              conteudo
            )}
          </li>
        );
      })}
    </ul>
  );
}
