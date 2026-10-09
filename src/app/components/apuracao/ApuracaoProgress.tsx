/** Progresso da totalização: % de seções, barra, "x de y seções" e horário da última atualização (Brasília). */
import type { Summary } from '@/shared/types';
import { pctTotalizadas } from '@/shared/calc';
import { fmtHoraSeg, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';

export interface ApuracaoProgressProps {
  resumo: Pick<Summary, 'secoes' | 'secoesTotalizadas' | 'ultimaAtualizacao' | 'status'>;
  /** 'default' (bloco), 'compact' (uma linha + barra fina), 'inline' (só texto). */
  variant?: 'default' | 'compact' | 'inline';
  className?: string;
}

export function ApuracaoProgress({ resumo, variant = 'default', className }: ApuracaoProgressProps) {
  const pct = pctTotalizadas(resumo);
  const encerrada = resumo.status === 'encerrada';
  const aguardando = resumo.status === 'aguardando' || resumo.secoesTotalizadas === 0;
  const hora = resumo.ultimaAtualizacao ? fmtHoraSeg(resumo.ultimaAtualizacao) : null;

  if (variant === 'inline') {
    return (
      <span className={cn('num text-[13px] text-fg-muted', className)}>
        <span className="font-semibold text-fg">{fmtPct(pct)}</span> das seções
      </span>
    );
  }

  const barra = (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100) / 100}
      aria-valuetext={`${fmtPct(pct)} das seções totalizadas`}
      className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', variant === 'compact' ? 'h-1' : 'h-1.5')}
    >
      <div
        className={cn('relative h-full rounded-full transition-[width] duration-700 ease-out', encerrada ? 'bg-ok' : 'bg-brand-grad')}
        style={{ width: `${pct}%` }}
      >
        {!encerrada && !aguardando ? (
          <span className="absolute inset-0 animate-shimmer rounded-full bg-[linear-gradient(90deg,transparent_0%,rgb(var(--brand-ink)/0.35)_50%,transparent_100%)] bg-[length:200%_100%]" />
        ) : null}
      </div>
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className={cn('w-full', className)}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="num text-fg-muted">
            <span className="font-semibold text-fg">{fmtPct(pct)}</span> das seções
          </span>
          {encerrada ? (
            <span className="inline-flex items-center gap-1 font-medium text-fg-muted">
              <Icon name="check-circulo" size={13} className="text-ok-fg" /> Encerrada
            </span>
          ) : hora ? (
            <span className="num text-fg-muted">{hora}</span>
          ) : null}
        </div>
        {barra}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <NumberRoll value={pct} format={(n) => fmtPct(n)} smallChars="%" className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[32px]" />
          <span className="text-[13.5px] text-fg-muted">das seções totalizadas</span>
        </div>
        <span className="num text-[13px] text-fg-muted">
          {fmtInt(resumo.secoesTotalizadas)} de {fmtInt(resumo.secoes)} seções
        </span>
      </div>
      <div className="mt-3">{barra}</div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
        {encerrada ? (
          <>
            <Icon name="check-circulo" size={14} className="text-ok-fg" />
            <span>
              Totalização concluída{hora ? <> às <span className="num">{hora}</span></> : null}
            </span>
          </>
        ) : aguardando ? (
          <>
            <Icon name="relogio" size={14} />
            <span>Aguardando as primeiras seções totalizadas (divulgação a partir das 17h)</span>
          </>
        ) : (
          <>
            <Icon name="relogio" size={14} />
            <span>
              Última seção totalizada às <span className="num font-medium text-fg">{hora ?? '—'}</span> (Brasília)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
