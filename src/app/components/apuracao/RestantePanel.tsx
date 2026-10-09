/**
 * "O que falta apurar" — análise matemática e neutra: eleitores em seções não totalizadas e quanto
 * dos válidos restantes quem está atrás precisaria para virar. Some quando há eleito.
 */
import type { Race, Restante, Summary } from '@/shared/types';
import { pctValidos } from '@/shared/calc';
import { fmtCompact, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { CandidateAvatar } from './CandidateAvatar';

export interface RestantePanelProps {
  race: Race;
  resumo: Summary;
  restante: Restante;
  className?: string;
}

export function RestantePanel({ race, resumo, restante, className }: RestantePanelProps) {
  if (resumo.eleito !== null || resumo.status === 'encerrada' || race.turno !== 2) return null;
  const lider = resumo.lider;
  const atras = lider === null ? null : lider === 0 ? 1 : 0;
  const cAtras = atras !== null ? race.candidatos[atras] : null;
  const z = restante.necessarioParaVirar;
  const atual = atras !== null ? pctValidos(resumo, atras) : null;
  const s = cAtras ? corSlot(cAtras.cor) : corSlot('outros');

  return (
    <section aria-label="O que falta apurar" className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6', className)}>
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        <Icon name="relogio" size={15} />
        O que falta apurar
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <NumberRoll value={restante.eleitorado} className="font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[36px]" />
        <span className="text-[14px] text-fg-muted">eleitores em seções ainda não totalizadas</span>
      </div>

      {cAtras && z !== null && atual !== null ? (
        <>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-fg">
            Para virar, <strong className="font-semibold">{cAtras.nomeUrna}</strong> precisaria de{' '}
            <strong className={cn('num font-semibold', s.text)}>{fmtPct(z, 1)}</strong> dos votos válidos restantes
            <span className="text-fg-muted">
              {' '}
              (estimativa: <span className="num">{fmtCompact(restante.validosEstimados)}</span> votos válidos)
            </span>
            . Até agora, tem <span className="num font-medium">{fmtPct(atual, 1)}</span>.
          </p>
          <Medidor necessario={z} atual={atual} cor={cAtras.cor} nome={cAtras.nomeUrna} />
          <div className="mt-3 flex items-center gap-2 text-[12.5px] text-fg-muted">
            <CandidateAvatar candidato={cAtras} size="xs" />
            <span>
              Diferença atual:{' '}
              <span className="num font-medium text-fg">{fmtInt(Math.abs((resumo.votos[0] ?? 0) - (resumo.votos[1] ?? 0)))}</span> votos
            </span>
          </div>
        </>
      ) : (
        <p className="mt-4 text-[14px] text-fg-muted">A estimativa aparece quando houver votos suficientes apurados.</p>
      )}
      <p className="mt-4 border-t border-line pt-3 text-[12px] leading-snug text-fg-subtle">
        Conta aritmética com a taxa de votos válidos observada até agora. Não é previsão nem pesquisa.
      </p>
    </section>
  );
}

function Medidor({ necessario, atual, cor, nome }: { necessario: number; atual: number; cor: Race['candidatos'][number]['cor']; nome: string }) {
  const s = corSlot(cor);
  const n = Math.max(0, Math.min(100, necessario));
  const a = Math.max(0, Math.min(100, atual));
  return (
    <div className="mt-4" role="img" aria-label={`${nome}: precisa de ${fmtPct(n, 1)} dos válidos restantes; tem ${fmtPct(a, 1)} até agora`}>
      <div className="relative h-2.5 w-full rounded-full bg-surface-3">
        <div className={cn('absolute inset-y-0 left-0 rounded-full opacity-35 transition-[width] duration-700', s.bg)} style={{ width: `${n}%` }} />
        <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-700', s.bg)} style={{ width: `${Math.min(a, n)}%` }} />
        <div className="absolute inset-y-[-4px] left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-fg/70" aria-hidden />
        <div className={cn('absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow', s.bg)} style={{ left: `${n}%` }} aria-hidden />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-fg-muted">
        <span className="num">0%</span>
        <span className="num">50%</span>
        <span className="num">100%</span>
      </div>
    </div>
  );
}
