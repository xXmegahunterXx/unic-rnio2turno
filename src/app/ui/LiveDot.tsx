import { cn } from '@/app/lib/cn';

export type LiveDotTone = 'live' | 'brand' | 'ok' | 'pending' | 'muted';

const tones: Record<LiveDotTone, string> = {
  live: 'bg-alert',
  brand: 'bg-brand-2',
  ok: 'bg-ok',
  pending: 'bg-fg-subtle',
  muted: 'bg-fg-muted',
};

/** Ponto pulsante de "ao vivo". `pulse=false` deixa estático (pausado/encerrado). */
export function LiveDot({ tone = 'live', pulse = true, size = 8, className }: { tone?: LiveDotTone; pulse?: boolean; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {pulse ? (
        <span className={cn('absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping', tones[tone])} style={{ animationDuration: '1.8s' }} />
      ) : null}
      <span className={cn('relative inline-flex h-full w-full rounded-full', tones[tone])} />
    </span>
  );
}
