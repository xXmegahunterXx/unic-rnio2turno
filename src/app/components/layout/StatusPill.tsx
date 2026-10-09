/**
 * Pílula de status da apuração no header: AO VIVO / SIMULAÇÃO + horário (relógio da apuração),
 * "Começa em …" antes das 17h e "Encerrada" no fim. Funciona sem API (cai na contagem local).
 */
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { useNow, estimarSimNow } from '@/app/lib/useNow';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtHoraSeg } from '@/shared/format';
import type { LiveStatus } from '@/shared/types';
import { fmtFaltam } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';

export type StatusVisual =
  | { tipo: 'pre'; faltaMs: number }
  | { tipo: 'apurando'; simulacao: boolean; simNow: number; parado: boolean }
  | { tipo: 'encerrada'; simulacao: boolean }
  | { tipo: 'indisponivel' };

/** Deriva o estado visual a partir do LiveStatus (ou do relógio local, sem API). */
export function statusVisual(status: LiveStatus | undefined, recebidoEm: number, agora: number): StatusVisual {
  if (!status) {
    return agora < INICIO_APURACAO ? { tipo: 'pre', faltaMs: INICIO_APURACAO - agora } : { tipo: 'indisponivel' };
  }
  const sim = estimarSimNow(status, recebidoEm, agora);
  if (status.fase === 'pre') {
    const ref = status.fonte === 'pre' ? agora : sim;
    return { tipo: 'pre', faltaMs: Math.max(0, status.inicioApuracao - ref) };
  }
  if (status.fase === 'encerrada') return { tipo: 'encerrada', simulacao: status.simulacao };
  return { tipo: 'apurando', simulacao: status.simulacao, simNow: sim, parado: status.pausado || status.congelado };
}

export function StatusPillView({ v, compact, className }: { v: StatusVisual; compact?: boolean; className?: string }) {
  const base =
    'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-2/80 pl-2.5 pr-3 text-[12.5px] font-medium text-fg';
  if (v.tipo === 'indisponivel') return null;
  if (v.tipo === 'pre') {
    return (
      <span className={cn(base, className)} role="status">
        <Icon name="relogio" size={15} className="text-brand-2" />
        <span className="text-fg-muted">{compact ? 'Em' : 'Começa em'}</span>
        <span className="num font-semibold">{fmtFaltam(v.faltaMs)}</span>
      </span>
    );
  }
  if (v.tipo === 'encerrada') {
    return (
      <span className={cn(base, className)} role="status">
        <Icon name="check-circulo" size={15} className="text-ok" />
        <span className="font-semibold">{v.simulacao ? 'Simulação encerrada' : 'Encerrada'}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(base, v.simulacao && 'border-[color:rgb(var(--brand)/0.35)] bg-brand/10', className)}
      role="status"
      aria-label={`${v.simulacao ? 'Simulação' : 'Ao vivo'}, ${fmtHoraSeg(v.simNow)} (horário de Brasília)`}
    >
      <LiveDot tone={v.simulacao ? 'brand' : 'live'} pulse={!v.parado} />
      <span className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', v.simulacao ? 'text-[color:color-mix(in_srgb,rgb(var(--brand))_70%,rgb(var(--fg)))] dark:text-brand-2' : 'text-fg')}>
        {v.simulacao ? (compact ? 'Sim.' : 'Simulação') : 'Ao vivo'}
      </span>
      <span className="num text-fg-muted">{compact ? fmtHora(v.simNow) : fmtHoraSeg(v.simNow)}</span>
    </span>
  );
}

/** Pílula conectada ao useStatus(). */
export function StatusPill({ compact, className }: { compact?: boolean; className?: string }) {
  const q = useStatus();
  const agora = useNow(q.data && q.data.velocidade > 1 ? 250 : 1000);
  const v = statusVisual(q.data, q.dataUpdatedAt || agora, agora);
  return <StatusPillView v={v} compact={compact} className={className} />;
}
