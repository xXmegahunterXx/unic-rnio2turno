/**
 * O divisor do Palpite: um controle só, os dois lados somam 100% dos votos válidos. Mesma metáfora da calculadora de
 * cenários (SliderDivisao): arrastar NA DIREÇÃO de um candidato AUMENTA a parte dele; cada metade da trilha é o
 * "território" de um lado (cor suave) e o preenchimento sólido vai do meio até o divisor, na cor de quem leva mais.
 *
 * Precisão de 0,1 p.p. entre 30% e 70% (a trilha cobre só esse intervalo: no celular cada passo fica maior que no
 * 0–100). O <input type="range"> nativo é a posição do divisor (= décimos do lado DIREITO): teclado com setas ±0,1,
 * PageUp/PageDown, Home/End; leitores de tela com aria-valuetext completo. Toque tratado à mão (o range do WebKit só
 * responde a quem arrasta o próprio polegar), com `touch-pan-y` para a página continuar rolando.
 *
 * Os ajustes finos (+0,1 para cada lado) ficam com quem usa o controle (PalpitePage), simétricos.
 * Cores sempre as que vêm dos dados (`corSlot(c.cor)`), nunca pela posição.
 */
import { useId, useRef, type PointerEvent } from 'react';
import type { CorCandidato } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { valorNoTrilho } from '@/app/lib/trilho';
import { PALPITE_MAX, PALPITE_MIN, normalizarPalpite, pctsDoPalpite } from './nucleo';
import { fmtPalpite } from './textos';

export interface LadoSlider {
  nome: string;
  cor: CorCandidato;
}

export interface SliderPalpiteProps {
  /** décimos do lado ESQUERDO (candidato de menor número) */
  valor: number;
  onChange: (a: number) => void;
  esquerda: LadoSlider;
  direita: LadoSlider;
  desabilitado?: boolean;
  className?: string;
}

const AMPLITUDE = PALPITE_MAX - PALPITE_MIN;

export function SliderPalpite({ valor, onChange, esquerda, direita, desabilitado, className }: SliderPalpiteProps) {
  const id = useId();
  const a = normalizarPalpite(valor);
  /** posição do divisor (décimos do lado direito): perto de um lado = mais para esse lado */
  const pos = 1000 - a;
  /** posição na trilha (0–100%) */
  const x = ((pos - PALPITE_MIN) / AMPLITUDE) * 100;
  const trilho = useRef<HTMLDivElement>(null);
  const dedo = useRef<number | null>(null);
  const valorNoPonto = (cx: number) => {
    const r = trilho.current?.getBoundingClientRect();
    return r && r.width > 0 ? 1000 - valorNoTrilho(cx, r.left, r.width, PALPITE_MIN, PALPITE_MAX, 1) : a;
  };
  const aoTocar = (e: PointerEvent<HTMLDivElement>) => {
    if (desabilitado || e.pointerType === 'mouse') return;
    dedo.current = e.pointerId;
    const n = valorNoPonto(e.clientX);
    if (n !== a) onChange(n);
  };
  const aoArrastar = (e: PointerEvent<HTMLDivElement>) => {
    if (dedo.current !== e.pointerId) return;
    const n = valorNoPonto(e.clientX);
    if (n !== a) onChange(n);
  };
  const aoSoltar = () => {
    dedo.current = null;
  };
  const [p0, p1] = pctsDoPalpite(a);
  const texto = `${esquerda.nome} ${fmtPalpite(p0)} e ${direita.nome} ${fmtPalpite(p1)}`;
  const lider = a > 500 ? esquerda.cor : a < 500 ? direita.cor : null;
  return (
    <div className={cn('w-full', className)}>
      <div
        ref={trilho}
        className={cn('relative h-14 touch-pan-y', desabilitado && 'opacity-60')}
        onPointerDown={aoTocar}
        onPointerMove={aoArrastar}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
      >
        {/* metades = território de cada lado; sólido do meio até o divisor, na cor de quem leva mais */}
        <div className="absolute inset-x-0 top-1/2 flex h-4 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3">
          <div className={cn('h-full w-1/2 opacity-30', corSlot(esquerda.cor).bg)} />
          <div className={cn('h-full w-1/2 opacity-30', corSlot(direita.cor).bg)} />
          {lider ? (
            <div
              className={cn('absolute inset-y-0 transition-[left,right] duration-100 ease-out motion-reduce:transition-none', corSlot(lider).bg)}
              style={x <= 50 ? { left: `${x}%`, right: '50%' } : { left: '50%', right: `${100 - x}%` }}
            />
          ) : null}
        </div>
        {/* marcas de 40%, 50% e 60% (o meio, mais forte) */}
        <span aria-hidden className="absolute left-1/2 top-1/2 h-7 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/60" />
        <span aria-hidden className="absolute left-1/4 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-fg/25" />
        <span aria-hidden className="absolute left-3/4 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-fg/25" />
        <input
          id={id}
          type="range"
          min={PALPITE_MIN}
          max={PALPITE_MAX}
          step={1}
          value={pos}
          disabled={desabilitado}
          aria-label={`Divisor do palpite: arraste na direção de um candidato para aumentar a parte dele (${esquerda.nome} à esquerda, ${direita.nome} à direita)`}
          aria-valuetext={texto}
          onChange={(e) => onChange(1000 - Number(e.target.value))}
          className={cn(
            'peer absolute inset-0 z-10 h-full w-full appearance-none bg-transparent opacity-0',
            desabilitado ? 'cursor-not-allowed' : 'cursor-pointer',
            '[&::-webkit-slider-thumb]:h-14 [&::-webkit-slider-thumb]:w-px [&::-webkit-slider-thumb]:appearance-none',
            '[&::-moz-range-thumb]:h-14 [&::-moz-range-thumb]:w-px [&::-moz-range-thumb]:border-0',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 flex h-10 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded-full border border-line bg-fg',
            'shadow-[0_2px_12px_rgb(0_0_0/0.35)] transition-transform duration-150 motion-reduce:transition-none',
            'peer-hover:scale-110 peer-active:scale-110 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/50',
          )}
          style={{ left: `${x}%` }}
        >
          <span className="h-4 w-px rounded-full bg-bg/60" />
          <span className="h-4 w-px rounded-full bg-bg/60" />
        </span>
      </div>
      {/* dica da metáfora: puxar para um lado = mais para quem está desse lado */}
      <div aria-hidden className="mt-0.5 flex justify-between gap-3 text-[11.5px] font-medium text-fg-subtle">
        <span className="min-w-0">← mais para {esquerda.nome}</span>
        <span className="min-w-0 text-right">mais para {direita.nome} →</span>
      </div>
    </div>
  );
}
