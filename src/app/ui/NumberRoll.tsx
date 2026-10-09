/**
 * Número com dígitos que rolam quando o valor muda (estilo placar mecânico).
 * - Cada dígito é uma coluna 0–9 deslocada com transform (GPU, sem re-layout).
 * - Respeita prefers-reduced-motion (transições zeradas pelo CSS global).
 * - Leitores de tela recebem o texto formatado inteiro (as colunas são aria-hidden).
 * - Use sempre um formatador de `src/shared/format.ts` (fmtPct, fmtInt…).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/app/lib/cn';
import { fmtInt } from '@/shared/format';

export interface NumberRollProps {
  value: number;
  /** Formatador (padrão fmtInt). Ex.: `(n) => fmtPct(n)`. */
  format?: (n: number) => string;
  className?: string;
  /** Duração da rolagem em ms (padrão 700). */
  duration?: number;
  /** Caracteres exibidos menores (ex.: '%'). */
  smallChars?: string;
  /** Classe dos caracteres pequenos. */
  smallClassName?: string;
  /** Texto para leitores de tela (padrão: o valor formatado). */
  ariaLabel?: string;
}

const DIGITOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const EASE = 'cubic-bezier(.22,.9,.24,1)';

const Coluna = memo(function Coluna({ d, delay, duration, animar }: { d: number; delay: number; duration: number; animar: boolean }) {
  return (
    <span className="relative inline-block h-[1.1em] overflow-hidden" style={{ lineHeight: '1.1em' }}>
      {/* reserva largura do dígito mais largo */}
      <span className="invisible block">0</span>
      <span
        className="absolute left-0 top-0 flex w-full flex-col items-center"
        style={{
          transform: `translate3d(0, ${-d * 1.1}em, 0)`,
          transition: animar ? `transform ${duration}ms ${EASE} ${delay}ms` : 'none',
          willChange: 'transform',
        }}
      >
        {DIGITOS.map((c) => (
          <span key={c} className="block h-[1.1em]">
            {c}
          </span>
        ))}
      </span>
    </span>
  );
});

export function NumberRoll({
  value,
  format = fmtInt,
  className,
  duration = 700,
  smallChars = '',
  smallClassName = 'text-[0.55em] ml-[0.04em] align-baseline',
  ariaLabel,
}: NumberRollProps) {
  const texto = format(Number.isFinite(value) ? value : 0);
  const chars = texto.split('');
  // Só anima depois da primeira pintura (evita rolar no carregamento inicial).
  const [animar, setAnimar] = useState(false);
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      const id = requestAnimationFrame(() => setAnimar(true));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  return (
    <span className={cn('num relative inline-flex whitespace-nowrap', className)}>
      <span className="sr-only">{ariaLabel ?? texto}</span>
      <span
        aria-hidden
        className="inline-flex items-baseline"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0, black 9%, black 91%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 9%, black 91%, transparent 100%)',
        }}
      >
        {chars.map((c, i) => {
          const posDireita = chars.length - i;
          const dig = c.charCodeAt(0) - 48;
          if (dig >= 0 && dig <= 9) {
            return <Coluna key={`d${posDireita}`} d={dig} delay={Math.min(posDireita, 8) * 18} duration={duration} animar={animar} />;
          }
          const pequeno = smallChars.includes(c);
          return (
            <span
              key={`c${posDireita}${c}`}
              className={cn('inline-block h-[1.1em] whitespace-pre', pequeno && smallClassName)}
              style={{ lineHeight: '1.1em' }}
            >
              {c}
            </span>
          );
        })}
      </span>
    </span>
  );
}
