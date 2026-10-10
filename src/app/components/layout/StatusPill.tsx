/**
 * Pílula de status da apuração no header: AO VIVO / SIMULAÇÃO + horário (relógio da apuração),
 * "Começa em …" antes das 17h e "Encerrada" no fim. Funciona sem API (cai na contagem local).
 * Na versão completa (desktop largo), "N pessoas agora" quando `status.pessoasAgora` existir (só no servidor;
 * no demo não vem e não aparece — nunca inventamos número).
 */
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { useNow, estimarSimNow } from '@/app/lib/useNow';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtHoraSeg } from '@/shared/format';
import type { LiveStatus } from '@/shared/types';
import { fmtFaltam, partesTempo } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { pessoasAgora, textoPessoas } from '@/app/components/apuracao/PessoasAgora';

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

/** Versão curta para o header do celular: "15d 18h", "2h 05min", "45min", "30s" (o aria-label leva a completa). */
function fmtFaltamCurto(ms: number): string {
  const p = partesTempo(ms);
  if (p.dias > 0 || p.horas > 0) return fmtFaltam(ms);
  return p.min > 0 ? `${p.min}min` : `${p.seg}s`;
}

/** Segmento "· 12,3 mil pessoas agora" (só ≥ 1280 px, na pílula completa). */
function SegmentoPessoas({ n }: { n: number | null | undefined }) {
  if (!n) return null;
  return (
    <span className="num hidden items-center gap-1.5 border-l border-line pl-2 text-fg-muted xl:inline-flex" title="Pessoas acompanhando o Sintonia agora (estimativa)">
      <Icon name="usuarios" size={14} />
      {textoPessoas(n)}
      <span className="sr-only"> agora</span>
    </span>
  );
}

export function StatusPillView({ v, compact, pessoas, className }: { v: StatusVisual; compact?: boolean; pessoas?: number | null; className?: string }) {
  const base =
    'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-2/80 pl-2.5 pr-3 text-[12.5px] font-medium text-fg';
  if (v.tipo === 'indisponivel') return null;
  if (v.tipo === 'pre') {
    return (
      // role="timer" (aria-live implícito "off"): o relógio não é anunciado a cada segundo.
      <span className={cn(base, className)} role="timer" aria-label={`Apuração começa em ${fmtFaltam(v.faltaMs)}`}>
        <Icon name="relogio" size={15} className="text-brand-fg" />
        <span className={cn('text-fg-muted', compact && 'max-[359px]:hidden')}>{compact ? 'Em' : 'Começa em'}</span>
        <span className="num font-semibold">{compact ? fmtFaltamCurto(v.faltaMs) : fmtFaltam(v.faltaMs)}</span>
      </span>
    );
  }
  if (v.tipo === 'encerrada') {
    return (
      <span className={cn(base, className)}>
        <Icon name="check-circulo" size={15} className="text-ok-fg" />
        {/* No celular, só "Encerrada": a faixa de SIMULAÇÃO já sinaliza a fonte (e o header não estoura). */}
        <span className="font-semibold">
          {v.simulacao ? (
            compact ? (
              <>
                <span className="sr-only">Simulação </span>Encerrada
              </>
            ) : (
              'Simulação encerrada'
            )
          ) : (
            'Encerrada'
          )}
        </span>
        {!compact ? <SegmentoPessoas n={pessoas} /> : null}
      </span>
    );
  }
  return (
    <span
      className={cn(base, v.simulacao && 'border-brand/35 bg-brand/10', className)}
      role="timer"
      aria-label={`${v.simulacao ? 'Simulação' : 'Ao vivo'}, ${fmtHoraSeg(v.simNow)} (horário de Brasília)`}
    >
      <LiveDot tone={v.simulacao ? 'brand' : 'live'} pulse={!v.parado} />
      <span className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', v.simulacao ? 'text-brand-fg' : 'text-fg')}>
        {v.simulacao ? (compact ? 'Sim.' : 'Simulação') : 'Ao vivo'}
      </span>
      <span className="num text-fg-muted">{compact ? fmtHora(v.simNow) : fmtHoraSeg(v.simNow)}</span>
      {!compact ? <SegmentoPessoas n={pessoas} /> : null}
    </span>
  );
}

/** Pílula conectada ao useStatus(). */
export function StatusPill({ compact, className }: { compact?: boolean; className?: string }) {
  const q = useStatus();
  const agora = useNow(q.data && q.data.velocidade > 1 ? 250 : 1000);
  const v = statusVisual(q.data, q.dataUpdatedAt || agora, agora);
  return <StatusPillView v={v} compact={compact} pessoas={pessoasAgora(q.data)} className={className} />;
}
