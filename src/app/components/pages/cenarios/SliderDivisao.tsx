/**
 * Controles da calculadora: o "divisor" (uma barra dividida em dois lados, arrastada pelo meio) e a barra das quatro
 * partes de uma divisão (finalista A, finalista B, branco/nulo, não vota).
 *
 * O divisor é um <input type="range"> nativo (teclado: setas ±1, PageUp/PageDown ±10, Home/End; leitores de tela
 * com aria-valuetext completo) sobre uma trilha desenhada com tokens. O lado esquerdo cresce quando o divisor vai
 * para a direita: arrastar em direção a um lado DIMINUI esse lado, como empurrar a fronteira.
 */
import { useId, type ReactNode } from 'react';
import type { PartesDivisao } from '@/shared/cenarios';
import { partesPct } from '@/shared/cenarios';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';

export type CorLado = 'a' | 'b' | 'bn' | 'abs';

const TRILHA: Record<CorLado, string> = {
  a: 'bg-cand-a',
  b: 'bg-cand-b',
  bn: 'bg-cand-outros',
  abs: 'bg-surface-3 [background-image:repeating-linear-gradient(-45deg,rgb(var(--fg-subtle)/0.55)_0_2px,transparent_2px_6px)]',
};
const TEXTO: Record<CorLado, string> = { a: 'text-cand-a-fg', b: 'text-cand-b-fg', bn: 'text-fg', abs: 'text-fg-muted' };

/** Classes da cor de cada parte (barra, legenda). Escritas por extenso para o Tailwind. */
export const corParte = (c: CorLado) => TRILHA[c];
export const textoParte = (c: CorLado) => TEXTO[c];

export interface SliderDivisaoProps {
  /** % do lado esquerdo (0–100). */
  valor: number;
  onChange: (v: number) => void;
  esquerda: { rotulo: string; cor: CorLado };
  direita: { rotulo: string; cor: CorLado };
  /** Nome do controle para leitores de tela ("Eleitores de Ronaldo Caiado entre os finalistas"). */
  ariaLabel: string;
  desabilitado?: boolean;
  /** Mensagem sobre a trilha quando desabilitado. */
  avisoDesabilitado?: ReactNode;
  /** Marca do meio (50%). Padrão: sim. */
  marcaMeio?: boolean;
  className?: string;
  /** Tamanho dos rótulos. */
  tamanho?: 'md' | 'sm';
}

export function SliderDivisao({
  valor,
  onChange,
  esquerda,
  direita,
  ariaLabel,
  desabilitado,
  avisoDesabilitado,
  marcaMeio = true,
  className,
  tamanho = 'md',
}: SliderDivisaoProps) {
  const id = useId();
  const v = Math.min(100, Math.max(0, Math.round(valor)));
  const texto = `${fmtPct(v, 0)} ${esquerda.rotulo} e ${fmtPct(100 - v, 0)} ${direita.rotulo}`;
  return (
    <div className={cn('w-full', className)}>
      <div className={cn('flex items-baseline justify-between gap-3', tamanho === 'sm' ? 'text-[12.5px]' : 'text-[13.5px]')} aria-hidden>
        <span className={cn('min-w-0 truncate', desabilitado && 'opacity-50')}>
          <span className={cn('num font-semibold', TEXTO[esquerda.cor])}>{fmtPct(v, 0)}</span>{' '}
          <span className="text-fg-muted">{esquerda.rotulo}</span>
        </span>
        <span className={cn('min-w-0 truncate text-right', desabilitado && 'opacity-50')}>
          <span className="text-fg-muted">{direita.rotulo}</span>{' '}
          <span className={cn('num font-semibold', TEXTO[direita.cor])}>{fmtPct(100 - v, 0)}</span>
        </span>
      </div>
      {desabilitado ? (
        // Sem ninguém para dividir: trilha neutra com o aviso (o controle volta quando houver quem escolha).
        <div className="relative mt-1.5 flex h-11 items-center">
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full border border-dashed border-line bg-surface-2" />
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={v}
            disabled
            aria-label={ariaLabel}
            aria-valuetext={texto}
            readOnly
            className="absolute inset-0 h-full w-full appearance-none opacity-0"
          />
          {avisoDesabilitado ? (
            <span className="relative mx-auto rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-fg-muted">{avisoDesabilitado}</span>
          ) : null}
        </div>
      ) : (
        <div className="relative mt-1.5 h-11">
          <div className="absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full">
            <div className={cn('h-full transition-[width] duration-150 ease-out', TRILHA[esquerda.cor])} style={{ width: `${v}%` }} />
            <div className={cn('h-full flex-1', TRILHA[direita.cor])} />
          </div>
          {marcaMeio ? <span aria-hidden className="absolute left-1/2 top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/50" /> : null}
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            step={1}
            value={v}
            aria-label={ariaLabel}
            aria-valuetext={texto}
            onChange={(e) => onChange(Number(e.target.value))}
            className={cn(
              'peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0',
              // polegar nativo fininho: o valor acompanha o dedo em toda a largura (o desenhado fica por cima)
              '[&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-px [&::-webkit-slider-thumb]:appearance-none',
              '[&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-px [&::-moz-range-thumb]:border-0',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 flex h-8 w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded-full border border-line bg-fg',
              'shadow-[0_2px_10px_rgb(0_0_0/0.35)] transition-transform duration-150',
              'peer-hover:scale-110 peer-active:scale-110 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/50',
            )}
            style={{ left: `${v}%` }}
          >
            <span className="h-3 w-px rounded-full bg-bg/60" />
            <span className="h-3 w-px rounded-full bg-bg/60" />
          </span>
        </div>
      )}
    </div>
  );
}

/** Barra das quatro partes (A, B, branco/nulo, não vota) com legenda opcional. */
export function BarraPartes({
  partes,
  nomes,
  legenda = true,
  className,
  alto = 'h-2',
}: {
  partes: PartesDivisao;
  nomes: { a: string; b: string };
  legenda?: boolean;
  className?: string;
  alto?: string;
}) {
  const q = partesPct(partes);
  const itens: { k: CorLado; v: number; bruto: number; rotulo: string }[] = [
    { k: 'a', v: q.a, bruto: partes.a, rotulo: nomes.a },
    { k: 'b', v: q.b, bruto: partes.b, rotulo: nomes.b },
    { k: 'bn', v: q.bn, bruto: partes.bn, rotulo: 'branco/nulo' },
    { k: 'abs', v: q.abs, bruto: partes.abs, rotulo: 'não vota' },
  ];
  return (
    <div className={className}>
      <div className={cn('flex w-full gap-[2px] overflow-hidden rounded-full', alto)} aria-hidden>
        {itens.map((it) =>
          it.bruto > 0 ? <div key={it.k} className={cn('h-full transition-[flex-grow] duration-200', TRILHA[it.k])} style={{ flexGrow: it.bruto, flexBasis: 0 }} /> : null,
        )}
      </div>
      {legenda ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-fg-muted">
          {itens
            .filter((it, i) => it.v > 0 || i < 2)
            .map((it) => (
              <li key={it.k} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', TRILHA[it.k])} />
                <span className="num font-medium text-fg">{fmtPct(it.v, 0)}</span>
                <span className="truncate">{it.rotulo}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
