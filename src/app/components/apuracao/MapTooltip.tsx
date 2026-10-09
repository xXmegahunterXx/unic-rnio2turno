/**
 * Tooltip rico dos mapas: nome da área, % apurado, % de cada candidato com mini barra, votos e margem.
 * Posicionado em px relativos ao contêiner do mapa (o pai precisa ser `relative`), sempre dentro dos limites.
 * No toque ele fica "fixo" (aceita clique) e pode mostrar um botão de ação ("Abrir Minas Gerais").
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Race, Summary, Tally } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { rotuloApurado } from './mapModes';

export interface MapTooltipProps {
  titulo: string;
  /** Linha secundária (ex.: "Capital · Zona eleitoral", "Sudeste"). */
  subtitulo?: string;
  /** Contagem da área. Ausente → "sem dados". */
  dados?: (Tally & Partial<Pick<Summary, 'status' | 'eleito'>>) | null;
  race: Pick<Race, 'candidatos'>;
  /** Ponto de ancoragem em px, relativo ao contêiner. */
  x: number;
  y: number;
  /** Tamanho do contêiner (para manter o tooltip dentro). */
  limites: { w: number; h: number };
  /** Fixo (toque/teclado): recebe eventos de ponteiro e mostra a ação. */
  fixo?: boolean;
  acao?: { label: string; onClick: () => void };
  /** Conteúdo extra no rodapé (ex.: variação vs 1º turno). */
  extra?: ReactNode;
  id?: string;
  className?: string;
}

const LARGURA = 256;
const MARGEM_PX = 8;
const OFFSET = 14;

export function MapTooltip({
  titulo,
  subtitulo,
  dados,
  race,
  x,
  y,
  limites,
  fixo,
  acao,
  extra,
  id,
  className,
}: MapTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [alt, setAlt] = useState(180);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && Math.abs(h - alt) > 1) setAlt(h);
  });

  const w = Math.min(LARGURA, limites.w - MARGEM_PX * 2);
  let left = x - w / 2;
  left = Math.max(MARGEM_PX, Math.min(limites.w - w - MARGEM_PX, left));
  // Acima do ponto se couber; senão, abaixo; se não couber em nenhum, encosta no topo.
  let top = y - OFFSET - alt;
  if (top < MARGEM_PX) top = y + OFFSET;
  if (top + alt > limites.h - MARGEM_PX && y - OFFSET - alt < MARGEM_PX) top = Math.max(MARGEM_PX, limites.h - alt - MARGEM_PX);

  const apurado = dados ? pctTotalizadas(dados) : 0;
  const temDados = !!dados && dados.secoesTotalizadas > 0;
  const m = temDados ? margem(dados!) : null;
  const encerrada = dados?.status === 'encerrada' || (temDados && dados!.secoesTotalizadas >= dados!.secoes);
  const candidatos = race.candidatos.map((c, i) => ({ c, i }));

  return (
    <motion.div
      ref={ref}
      id={id}
      role={fixo ? 'dialog' : 'tooltip'}
      aria-label={fixo ? titulo : undefined}
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className={cn(
        'absolute z-20 rounded-2xl border border-line bg-surface/95 p-3 text-left shadow-card backdrop-blur-md',
        fixo ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      )}
      style={{ left, top, width: w }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-semibold leading-tight text-fg">{titulo}</p>
          {subtitulo ? <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">{subtitulo}</p> : null}
        </div>
        <span
          className={cn(
            'num mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
            encerrada
              ? 'bg-fg/10 text-fg'
              : temDados
                ? 'bg-brand/15 text-[color:color-mix(in_srgb,rgb(var(--brand))_70%,rgb(var(--fg)))] dark:text-brand-2'
                : 'bg-pending/60 text-fg-muted',
          )}
        >
          {encerrada ? 'Encerrada' : temDados ? `${rotuloApurado(apurado)} apurado` : 'Aguardando'}
        </span>
      </div>

      {/* % de seções totalizadas */}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${Math.min(100, apurado)}%` }}
        />
      </div>

      {temDados ? (
        <ul className="mt-3 space-y-2">
          {candidatos.map(({ c, i }) => {
            const pct = pctValidos(dados!, i);
            const lider = m?.lider === i;
            const slot = corSlot(c.cor);
            return (
              <li key={c.numero}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className={cn('h-[3px] w-3 shrink-0 rounded-full', slot.bg)} />
                    <span className={cn('truncate text-[12.5px]', lider ? 'font-medium text-fg' : 'text-fg-muted')}>
                      {c.nomeUrna}
                    </span>
                  </span>
                  <span className={cn('num text-[14px] font-semibold', lider ? 'text-fg' : 'text-fg-muted')}>
                    {fmtPct(pct)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-500', slot.bg)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="num w-[76px] shrink-0 text-right text-[11px] text-fg-subtle">
                    {fmtInt(dados!.votos[i] ?? 0)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[12.5px] text-fg-muted">Nenhuma seção totalizada ainda.</p>
      )}

      {m && m.lider !== null ? (
        <p className="num mt-2.5 border-t border-line pt-2 text-[11.5px] text-fg-muted">
          Vantagem de <span className="font-semibold text-fg">{fmtPP(m.pp).replace(/^\+/, '')}</span>
          {' · '}
          {fmtInt(m.votos)} votos
        </p>
      ) : temDados ? (
        <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] text-fg-muted">Empate</p>
      ) : null}

      {extra ? <div className="mt-2 text-[11.5px] text-fg-muted">{extra}</div> : null}

      {fixo && acao ? (
        <button
          type="button"
          onClick={acao.onClick}
          className="mt-2.5 flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-fg text-[13px] font-semibold text-bg transition-opacity hover:opacity-90"
        >
          {acao.label}
          <span aria-hidden>→</span>
        </button>
      ) : null}
    </motion.div>
  );
}
