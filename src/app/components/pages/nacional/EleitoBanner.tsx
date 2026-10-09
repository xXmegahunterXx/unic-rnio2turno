/**
 * Selo grande de resultado definido (substitui o painel "O que falta apurar" quando há eleito).
 * Texto neutro e sem flexão de gênero no caso de Governador (há candidatas).
 */
import type { Race, Restante, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';

export function EleitoBanner({ race, resumo, restante, className }: { race: Race; resumo: Summary; restante: Restante; className?: string }) {
  if (race.turno !== 2 || resumo.eleito === null) return null;
  const c = race.candidatos[resumo.eleito];
  if (!c) return null;
  const s = corSlot(c.cor);
  const encerrada = resumo.status === 'encerrada';
  const dif = Math.abs((resumo.votos[0] ?? 0) - (resumo.votos[1] ?? 0));
  const presidente = race.cargo === 'Presidente';
  const titulo = presidente
    ? `${c.nomeUrna} ${encerrada ? 'é eleito' : 'está matematicamente eleito'} presidente`
    : `Vitória de ${c.nomeUrna} ${encerrada ? 'confirmada' : 'matematicamente definida'}`;

  return (
    <section
      aria-label="Resultado definido"
      className={cn('relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6', className)}
    >
      <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br', s.glow)} />
      <div className="relative flex items-start gap-4">
        <CandidateAvatar candidato={c} size="lg" eleito />
        <div className="min-w-0">
          <div className={cn('flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em]', s.text)}>
            <Icon name="selo" size={15} strokeWidth={2} />
            {encerrada ? 'Resultado final' : 'Resultado definido'}
          </div>
          <h2 className="mt-1.5 text-balance font-display text-[22px] font-semibold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[26px]">{titulo}</h2>
          <p className="mt-2 text-pretty text-[14px] leading-relaxed text-fg-muted">
            {encerrada ? (
              <>
                Com 100% das seções totalizadas
                {resumo.ultimaAtualizacao ? (
                  <>
                    {' '}
                    (às <span className="num">{fmtHora(resumo.ultimaAtualizacao)}</span>)
                  </>
                ) : null}
                , {c.nomeUrna} tem <span className="num font-semibold text-fg">{fmtPct(pctValidos(resumo, resumo.eleito))}</span> dos votos válidos — diferença de{' '}
                <span className="num font-semibold text-fg">{fmtInt(dif)}</span> votos.
              </>
            ) : (
              <>
                Com <span className="num font-semibold text-fg">{fmtPct(pctTotalizadas(resumo), 1)}</span> das seções totalizadas, a diferença de{' '}
                <span className="num font-semibold text-fg">{fmtInt(dif)}</span> votos já supera o eleitorado das seções que faltam (
                <span className="num">{fmtInt(restante.eleitorado)}</span>).
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
