/**
 * Legenda dos mapas a partir do modo (mapModes.legendaModo) ou de uma especificação pronta.
 * Identidade nunca só pela cor: cada linha/polo traz o nome do candidato.
 */
import type { Race } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { legendaModo, type LegendItem, type LegendSpec, type MapMode } from './mapModes';
import { hachuraStyle } from './MapHatch';

export interface MapLegendProps {
  modo?: MapMode;
  race?: Pick<Race, 'candidatos'>;
  /** Especificação pronta (substitui modo/race). */
  spec?: LegendSpec;
  /** Esconde o título da legenda. */
  semTitulo?: boolean;
  /** Layout compacto em uma linha (desktop, abaixo do mapa). */
  compacta?: boolean;
  className?: string;
}

const BUCKET_CURTO = ['< 5', '5–15', '15–30', '≥ 30'];

function Swatch({ item, className }: { item: LegendItem; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-3 w-3 shrink-0 rounded-[4px] ring-1 ring-inset ring-line', className)}
      style={item.hachura ? hachuraStyle() : { background: item.fill }}
    />
  );
}

function Extras({ itens }: { itens: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {itens.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
          <Swatch item={it} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function MapLegend({ modo = 'vencedor', race, spec, semTitulo, compacta, className }: MapLegendProps) {
  const s = spec ?? (race ? legendaModo(modo, race) : null);
  if (!s) return null;

  return (
    <div className={cn('text-fg-muted', className)} role="group" aria-label={`Legenda: ${s.titulo}`}>
      {!semTitulo ? <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{s.titulo}</p> : null}
      <div className={cn('flex gap-x-6 gap-y-3', compacta ? 'flex-wrap items-end' : 'flex-col')}>
        {s.tipo === 'buckets' ? (
          <div className="inline-grid grid-cols-[auto_repeat(4,minmax(34px,46px))] items-center gap-x-1 gap-y-1">
            {s.linhas.map((l) => (
              <div key={l.nome} className="contents">
                <span className="flex max-w-[132px] items-center gap-1.5 pr-2 text-[12px] text-fg">
                  <span aria-hidden className={cn('h-[3px] w-2.5 shrink-0 rounded-full', corSlot(l.cor).bg)} />
                  <span className="truncate">{l.nome}</span>
                </span>
                {l.fills.map((f, i) => (
                  <span
                    key={i}
                    title={`${l.nome}: ${s.rotulos[i]}`}
                    className="h-3 rounded-[4px] transition-colors duration-500"
                    style={{ background: f }}
                  />
                ))}
              </div>
            ))}
            <span className="pr-2 text-right text-[10.5px] text-fg-subtle">p.p.</span>
            {BUCKET_CURTO.map((r, i) => (
              <span key={r} className="num text-center text-[10.5px] text-fg-subtle" title={s.rotulos[i]}>
                {r}
              </span>
            ))}
          </div>
        ) : (
          <div className="w-full max-w-[340px]">
            {s.polos ? (
              <div className="mb-1 flex items-center justify-between gap-3 text-[12px] text-fg">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden className={cn('h-[3px] w-2.5 shrink-0 rounded-full', corSlot(s.polos.esquerda.cor).bg)} />
                  <span className="truncate">{s.polos.esquerda.nome}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{s.polos.direita.nome}</span>
                  <span aria-hidden className={cn('h-[3px] w-2.5 shrink-0 rounded-full', corSlot(s.polos.direita.cor).bg)} />
                </span>
              </div>
            ) : null}
            <div
              aria-hidden
              className="h-2.5 rounded-full ring-1 ring-inset ring-line"
              style={{ background: `linear-gradient(90deg, ${s.stops.join(', ')})` }}
            />
            <div className="relative mt-1 h-4">
              {s.ticks.map((t) => (
                <span
                  key={t.pos}
                  className="num absolute top-0 whitespace-nowrap text-[10.5px] text-fg-subtle"
                  style={{
                    left: `${t.pos * 100}%`,
                    transform: t.pos <= 0 ? 'none' : t.pos >= 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <Extras itens={s.extras} />
      </div>
    </div>
  );
}
