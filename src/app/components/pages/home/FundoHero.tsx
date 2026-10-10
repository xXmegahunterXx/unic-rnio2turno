/**
 * Fundo do hero da Home: "ondas de sintonia" (linhas senoidais na cor da marca, que deslizam em
 * velocidades diferentes e criam interferência suave), aurora violeta e ruído. Só decoração: nunca usa
 * as cores dos candidatos. Tudo em `transform` (GPU) e parado com `prefers-reduced-motion`.
 * No celular as ondas ficam paradas (poupa CPU e bateria no navegador embutido; o desenho é o mesmo).
 */
import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';

const W = 1440;
const H = 560;

interface Onda {
  /** Comprimento de onda (divide W, para o laço ser contínuo). */
  L: number;
  A: number;
  y: number;
  dur: number;
  alpha: number;
  largura: number;
  fase: number;
}

const ONDAS: Onda[] = [
  { L: 480, A: 34, y: 300, dur: 18, alpha: 0.55, largura: 1.6, fase: 0 },
  { L: 360, A: 22, y: 316, dur: 13, alpha: 0.38, largura: 1.2, fase: 0.8 },
  { L: 720, A: 52, y: 290, dur: 26, alpha: 0.3, largura: 1.2, fase: 2.1 },
  { L: 288, A: 14, y: 330, dur: 11, alpha: 0.22, largura: 1, fase: 1.4 },
  { L: 480, A: 64, y: 280, dur: 32, alpha: 0.16, largura: 1, fase: 3.2 },
];

/** Senoide de x = 0 até 2W (para deslizar uma volta inteira sem emenda). */
function caminho({ L, A, y, fase }: Onda): string {
  const passo = 12;
  let d = '';
  for (let x = 0; x <= 2 * W; x += passo) {
    const yy = y + A * Math.sin((2 * Math.PI * x) / L + fase);
    d += `${x === 0 ? 'M' : 'L'}${x} ${yy.toFixed(1)}`;
  }
  return d;
}

export function FundoHero({ className }: { className?: string }) {
  const reduzirPref = useReducedMotion();
  const largo = useMediaQuery('(min-width: 768px)');
  const reduzir = reduzirPref || !largo;
  const id = useId().replace(/:/g, '');
  const paths = useMemo(() => ONDAS.map(caminho), []);
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}>
      {/* aurora */}
      <motion.div
        className="absolute left-[-20%] top-[-180px] h-[520px] w-[640px] rounded-full bg-brand/[0.16] blur-[90px] will-change-transform dark:bg-brand/[0.22]"
        animate={reduzir ? undefined : { x: [0, 80, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-18%] top-[40px] h-[460px] w-[560px] rounded-full bg-brand-2/[0.12] blur-[100px] will-change-transform dark:bg-brand-2/[0.1]"
        animate={reduzir ? undefined : { x: [0, -70, 0], y: [0, -24, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ondas */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-x-0 top-[14%] h-[78%] w-full [mask-image:radial-gradient(ellipse_70%_60%_at_60%_50%,black_20%,transparent_75%)] sm:top-[8%] sm:h-[88%]"
      >
        <defs>
          <linearGradient id={`onda${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'rgb(var(--brand))' }} />
            <stop offset="0.5" style={{ stopColor: 'rgb(var(--brand-2))' }} />
            <stop offset="1" style={{ stopColor: 'rgb(var(--brand))' }} />
          </linearGradient>
        </defs>
        {ONDAS.map((o, i) => (
          <motion.path
            key={i}
            d={paths[i]}
            fill="none"
            stroke={`url(#onda${id})`}
            strokeWidth={o.largura}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ opacity: o.alpha }}
            className="will-change-transform"
            animate={reduzir ? undefined : { x: [0, -o.L * Math.max(1, Math.round(W / o.L / 2))] }}
            transition={{ duration: o.dur, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </svg>

      {/* grade pontilhada sutil + ruído */}
      <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(rgb(var(--line)/calc(var(--line-alpha)*1.6))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-noise" />
      {/* emenda suave com o resto da página */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
