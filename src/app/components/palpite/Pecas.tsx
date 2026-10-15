/**
 * Peças de exibição do Palpite na página (não nos cartões): os dois lados com o % de cada finalista, a barra estática
 * do palpite e a versão compacta (palpite recebido por link). Ordem da urna, cores dos dados (`corSlot(c.cor)`), sem
 * foto (os números são hipotéticos): monograma igual para os dois.
 */
import type { Candidate } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { pctsDoPalpite } from './nucleo';
import { fmtPalpite } from './textos';

export type FinalistasPalpite = readonly [Candidate, Candidate];

function Lado({ c, pct, alinhar, tamanho }: { c: Candidate; pct: number; alinhar: 'esq' | 'dir'; tamanho: 'grande' | 'medio' }) {
  const s = corSlot(c.cor);
  return (
    <div className={cn('flex min-w-0 flex-col', alinhar === 'dir' ? 'items-end text-right' : 'items-start')}>
      <div className={cn('flex min-w-0 max-w-full items-center gap-2.5', alinhar === 'dir' && 'flex-row-reverse')}>
        <CandidateAvatar candidato={c} size={tamanho === 'grande' ? 'md' : 'sm'} />
        <div className="min-w-0">
          {/* nome nunca cortado: quebra em duas linhas no celular */}
          <div className={cn('break-words font-display font-semibold leading-tight tracking-[-0.02em] text-fg', tamanho === 'grande' ? 'text-[15px] sm:text-[19px]' : 'text-[14px]')}>
            {c.nomeUrna}
          </div>
          <div className="truncate text-[12px] text-fg-muted">{c.partido}</div>
        </div>
      </div>
      <div
        className={cn(
          'num font-display font-semibold leading-[0.9] tracking-[-0.045em]',
          s.textDisplay,
          tamanho === 'grande' ? 'mt-3 text-[46px] min-[400px]:text-[52px] sm:text-[72px]' : 'mt-1.5 text-[30px] sm:text-[34px]',
        )}
      >
        {fmtPalpite(pct).replace('%', '')}
        <span className="ml-0.5 text-[0.42em] tracking-normal">%</span>
      </div>
    </div>
  );
}

/** Os dois lados do palpite (o divisor, quando houver, vai logo abaixo). */
export function LadosPalpite({ finalistas, a, tamanho = 'grande', className }: { finalistas: FinalistasPalpite; a: number; tamanho?: 'grande' | 'medio'; className?: string }) {
  const [p0, p1] = pctsDoPalpite(a);
  return (
    <div className={cn('grid grid-cols-2 items-end gap-3', className)}>
      <Lado c={finalistas[0]} pct={p0} alinhar="esq" tamanho={tamanho} />
      <Lado c={finalistas[1]} pct={p1} alinhar="dir" tamanho={tamanho} />
    </div>
  );
}

/** Barra estática do palpite (ordem da urna), com a marca dos 50%. */
export function BarraPalpite({ finalistas, a, className, alto = 'h-3' }: { finalistas: FinalistasPalpite; a: number; className?: string; alto?: string }) {
  const [p0, p1] = pctsDoPalpite(a);
  return (
    <div aria-hidden className={cn('relative', className)}>
      <div className={cn('flex w-full gap-[3px] overflow-hidden rounded-full', alto)}>
        <div className={cn('h-full', corSlot(finalistas[0].cor).bg)} style={{ flexGrow: p0, flexBasis: 0 }} />
        <div className={cn('h-full', corSlot(finalistas[1].cor).bg)} style={{ flexGrow: p1, flexBasis: 0 }} />
      </div>
      <span className="absolute -inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-fg/70" />
    </div>
  );
}
