/**
 * Avisos de fase nas páginas de detalhe:
 *  - `PreApuracaoAviso`: antes das 17h de 25/10 (ou fonte 'pre') — contagem regressiva e a explicação
 *    de que a página mostra o resultado OFICIAL do 1º turno enquanto isso.
 *  - `PrimeiroTurnoAviso`: durante/depois da apuração, quando a pessoa abriu o 1º turno de propósito.
 */
import { DATA_PRIMEIRO_TURNO } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { Button } from '@/app/ui/Button';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';

export function PreApuracaoAviso({
  inicio,
  agora,
  local,
  className,
}: {
  inicio: number;
  agora: number | null;
  /** "em São Paulo", "em Campinas (SP)" */
  local: string;
  className?: string;
}) {
  const faltaMuito = agora !== null && inicio - agora > 0;
  return (
    <section
      aria-label="A apuração do 2º turno ainda não começou"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-brand/30 bg-surface p-4 shadow-card sm:p-5',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-fg">
            <Icon name="calendario" size={15} />
            2º turno · 25 de outubro, a partir das 17h
          </p>
          <p className="mt-2 max-w-xl text-pretty text-[15px] leading-relaxed text-fg">
            A apuração ainda não começou. Enquanto isso, veja o <strong className="font-semibold">resultado oficial do 1º turno</strong>{' '}
            {local}, com os dois candidatos que disputam o 2º turno.
          </p>
        </div>
        {faltaMuito ? (
          <div className="shrink-0">
            <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.1em] text-fg-muted">Faltam</p>
            <Countdown target={inicio} now={agora ?? undefined} size="sm" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PrimeiroTurnoAviso({ onVoltar, className }: { onVoltar: () => void; className?: string }) {
  const [, mes, dia] = DATA_PRIMEIRO_TURNO.split('-');
  return (
    <div
      role="note"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="flex items-start gap-2 text-[14px] leading-snug text-fg">
        <Icon name="info" size={18} className="mt-px shrink-0 text-fg-muted" />
        <span>
          Você está vendo o <strong className="font-semibold">resultado oficial do 1º turno</strong>{' '}
          <span className="num text-fg-muted">
            ({dia}/{mes})
          </span>
          .
        </span>
      </p>
      <Button size="sm" variant="secondary" icon="ao-vivo" onClick={onVoltar} className="shrink-0 self-start sm:self-auto">
        Ver o 2º turno
      </Button>
    </div>
  );
}
