/**
 * Peças dos miolos dos cartões (px reais; escala pelo `k` de `useCartao()`): avatar com foto oficial ou monograma,
 * percentual gigante, barra do duelo com a marca dos 50% e rótulos.
 * Fotos só chegam aqui quando permitidas (dado real; nunca numa imagem com números simulados).
 */
import type { CSSProperties, ReactNode } from 'react';
import type { CorCandidato, Race } from '@/shared/types';
import { pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { useCartao } from '../CartaoBase';

/** Avatar redondo: foto oficial (mesmo recorte para todos) ou monograma na cor do slot. */
export function AvatarCartao({ cor, nome, size, foto, eleito, className }: { cor: CorCandidato; nome: string; size: number; foto?: string; eleito?: boolean; className?: string }) {
  const s = corSlot(cor);
  const borda = Math.max(3, Math.round(size * 0.045));
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center rounded-full font-display font-semibold', foto ? s.bg : [s.bgSoft, s.text], className)}
      style={{ width: size, height: size, fontSize: size * 0.36, padding: foto ? borda : 0, boxShadow: foto ? undefined : `inset 0 0 0 ${borda}px rgb(var(${s.cssVar}))` }}
    >
      {foto ? (
        <span className="block h-full w-full overflow-hidden rounded-full bg-surface-2" style={{ border: `${Math.max(2, borda - 1)}px solid rgb(var(--bg))` }}>
          <img src={foto} alt="" className="h-full w-full object-cover object-[50%_22%]" />
        </span>
      ) : (
        iniciais(nome)
      )}
      {eleito ? (
        <span
          className={cn('absolute flex items-center justify-center rounded-full', s.bg, s.ink)}
          style={{ width: size * 0.36, height: size * 0.36, right: -size * 0.02, bottom: -size * 0.02, boxShadow: `0 0 0 ${borda + 1}px rgb(var(--bg))` }}
        >
          <Icon name="check" size={size * 0.22} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

/** "51,23%" com o "%" menor. `cor` = slot (null = neutro). */
export function PctGigante({ valor, size, cor, apagado, casas = 2, className }: { valor: number; size: number; cor?: CorCandidato | null; apagado?: boolean; casas?: 0 | 1 | 2; className?: string }) {
  const txt = fmtPct(valor, casas).replace('%', '');
  return (
    <div
      className={cn('num font-display font-semibold leading-[0.88] tracking-[-0.045em]', apagado ? 'text-fg-subtle' : cor ? corSlot(cor).textDisplay : 'text-fg', className)}
      style={{ fontSize: size }}
    >
      {txt}
      <span className="tracking-normal" style={{ fontSize: size * 0.42, marginLeft: size * 0.03 }}>
        %
      </span>
    </div>
  );
}

/** Barra do duelo (votos válidos), na ordem da urna, com a marca dos 50%. */
export function BarraDuelo({ race, votos, alto, marca50 = true, rotulo = true }: { race: Pick<Race, 'candidatos'>; votos: number[]; alto: number; marca50?: boolean; rotulo?: boolean }) {
  const { k } = useCartao();
  const total = validos({ votos });
  const doisLados = race.candidatos.filter((c) => !c.agregado).length === 2 && !race.candidatos.some((c) => c.agregado);
  return (
    <div>
      <div className="relative">
        <div className="flex w-full overflow-hidden" style={{ height: alto, gap: Math.max(3, alto * 0.12), borderRadius: alto * 0.32 }}>
          {total > 0 ? (
            race.candidatos.map((c, i) => (
              <div key={i} className={cn('h-full', corSlot(c.cor).bg)} style={{ flexGrow: Math.max(0.0001, pctValidos({ votos }, i)), flexBasis: 0 }} />
            ))
          ) : (
            <div className="h-full w-full bg-pending" />
          )}
        </div>
        {marca50 && doisLados ? (
          <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-fg" style={{ top: -alto * 0.32, bottom: -alto * 0.32, width: Math.max(3, alto * 0.13) }} />
        ) : null}
      </div>
      {rotulo && doisLados ? (
        <div className="text-center font-medium text-fg-muted" style={{ fontSize: 15 * k, marginTop: alto * 0.5 }}>
          50% dos votos válidos
        </div>
      ) : null}
    </div>
  );
}

/** Rótulo em caixa alta, discreto. */
export function RotuloCartao({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const { k } = useCartao();
  return (
    <div className={cn('font-semibold uppercase leading-none tracking-[0.14em] text-fg-muted', className)} style={{ fontSize: 16 * k, ...style }}>
      {children}
    </div>
  );
}

/** Pílula com o % de seções totalizadas. */
export function PilulaApurado({ pct, className }: { pct: number; className?: string }) {
  const { k } = useCartao();
  return (
    <div
      className={cn('inline-flex shrink-0 items-baseline rounded-full border border-line/[2] bg-surface/80', className)}
      style={{ gap: 10 * k, padding: `${8 * k}px ${18 * k}px` }}
    >
      <span className="num font-display font-semibold leading-none tracking-[-0.02em] text-fg" style={{ fontSize: 26 * k }}>
        {fmtPct(pct)}
      </span>
      <span className="leading-none text-fg-muted" style={{ fontSize: 15 * k }}>
        das seções
      </span>
    </div>
  );
}
