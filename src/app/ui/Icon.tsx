/**
 * Conjunto próprio de ícones (SVG inline, grade 24×24, traço 1,75 px, pontas arredondadas).
 * Herdam a cor do texto (`currentColor`). Decorativos por padrão (aria-hidden); passe `title`
 * quando o ícone for o único conteúdo significativo.
 */
import type { SVGProps } from 'react';
import { cn } from '@/app/lib/cn';

function engrenagem(dentes = 8, rExt = 9.4, rInt = 7.1, c = 12): string {
  const passo = (Math.PI * 2) / dentes;
  const pts: string[] = [];
  for (let i = 0; i < dentes; i++) {
    const a = i * passo - Math.PI / 2;
    for (const [r, da] of [
      [rInt, -0.34],
      [rExt, -0.17],
      [rExt, 0.17],
      [rInt, 0.34],
    ] as const) {
      const ang = a + da * passo;
      pts.push(`${(c + r * Math.cos(ang)).toFixed(2)} ${(c + r * Math.sin(ang)).toFixed(2)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}
const GEAR = engrenagem();

const P = {
  'ao-vivo': (
    <>
      <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 8.1a5.5 5.5 0 0 1 0 7.8M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
    </>
  ),
  mapa: (
    <>
      <path d="M9 4.5 3.75 6.4v13.1L9 17.6l6 1.9 5.25-1.9V4.5L15 6.4 9 4.5Z" />
      <path d="M9 4.5v13.1M15 6.4v13.1" />
    </>
  ),
  lista: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r=".9" fill="currentColor" />
      <circle cx="4.75" cy="12" r=".9" fill="currentColor" />
      <circle cx="4.75" cy="17.5" r=".9" fill="currentColor" />
    </>
  ),
  grade: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  busca: (
    <>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.4 15.4 4.6 4.6" />
    </>
  ),
  compartilhar: (
    <>
      <path d="M12 3.75v11M8 7.5l4-3.75 4 3.75" />
      <path d="M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4.2 19.8 5.3 16A8.25 8.25 0 1 1 8.2 18.8L4.2 19.8Z" />
      <path d="M9.3 8.3c.2-.4.5-.4.8-.4h.4c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.5.6c.4.9 1.2 1.7 2.2 2.2l.6-.5c.2-.2.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.4c0 .3 0 .6-.4.8-.5.3-1.2.5-1.9.3-2.2-.6-4.1-2.5-4.7-4.7-.2-.7 0-1.4.3-1.9Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7.75 10.75 12 15l4.25-4.25" />
      <path d="M4.75 15.5v2.25a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2V15.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.2 4.2 0 0 0 6 0l2.9-2.9a4.2 4.2 0 0 0-6-6L11.5 6.5" />
      <path d="M14 10a4.2 4.2 0 0 0-6 0l-2.9 2.9a4.2 4.2 0 0 0 6 6l1.4-1.4" />
    </>
  ),
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.25" />
      <path d="M15.5 5.75A1.75 1.75 0 0 0 13.75 4H5.75A1.75 1.75 0 0 0 4 5.75v8A1.75 1.75 0 0 0 5.75 15.5" />
    </>
  ),
  externo: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5 11 13" />
      <path d="M17.5 14v3.75a1.75 1.75 0 0 1-1.75 1.75H6.25a1.75 1.75 0 0 1-1.75-1.75V8.25A1.75 1.75 0 0 1 6.25 6.5H10" />
    </>
  ),
  seta: <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  'seta-esquerda': <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  'seta-cima': <path d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  'seta-baixo': <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  chevron: <path d="m6.5 9.25 5.5 5.5 5.5-5.5" />,
  'chevron-cima': <path d="m6.5 14.75 5.5-5.5 5.5 5.5" />,
  'chevron-direita': <path d="m9.25 6.5 5.5 5.5-5.5 5.5" />,
  'chevron-esquerda': <path d="m14.75 6.5-5.5 5.5 5.5 5.5" />,
  ordenar: <path d="M8 4.5v15M4.5 8 8 4.5 11.5 8M16 19.5v-15M12.5 16l3.5 3.5 3.5-3.5" />,
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  mais: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.75v1.75M12 19.5v1.75M2.75 12H4.5M19.5 12h1.75M5.45 5.45l1.25 1.25M17.3 17.3l1.25 1.25M5.45 18.55l1.25-1.25M17.3 6.7l1.25-1.25" />
    </>
  ),
  lua: <path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5a7.75 7.75 0 1 0 10.1 10.1Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 11v5.25" />
      <circle cx="12" cy="7.9" r=".6" fill="currentColor" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.3 4.6a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3l7-12.1Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.6" r=".6" fill="currentColor" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  'check-circulo': (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="m8.25 12.25 2.6 2.6 5-5.2" />
    </>
  ),
  selo: (
    <>
      <path d="M12 3.2l2.1 1.5 2.6-.1.8 2.5 2.1 1.5-.8 2.4.8 2.5-2.1 1.5-.8 2.5-2.6-.1L12 20.8l-2.1-1.5-2.6.1-.8-2.5-2.1-1.5.8-2.5-.8-2.4 2.1-1.5.8-2.5 2.6.1L12 3.2Z" />
      <path d="m9 12.2 2.1 2.1 3.9-4" />
    </>
  ),
  urna: (
    <>
      <path d="M8.5 9.5 7 4.75h7.5L16 9.5" />
      <path d="M4.25 9.5h15.5v9a1.75 1.75 0 0 1-1.75 1.75H6a1.75 1.75 0 0 1-1.75-1.75v-9Z" />
      <path d="M9 13.5h6" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 7.25V12l3.25 2" />
    </>
  ),
  calendario: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.25" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  filtro: <path d="M4 5.5h16l-6.25 7.25v5.5l-3.5 1.75v-7.25L4 5.5Z" />,
  ajustes: (
    <>
      <path d="M4.5 7.5h8M16.5 7.5h3M4.5 16.5h3M11.5 16.5h8" />
      <circle cx="14.5" cy="7.5" r="2" />
      <circle cx="9.5" cy="16.5" r="2" />
    </>
  ),
  expandir: <path d="M14.5 4.5h5v5M19.5 4.5l-6 6M9.5 19.5h-5v-5M4.5 19.5l6-6" />,
  recolher: <path d="M19.5 9.5h-5v-5M14.5 9.5l6-6M4.5 14.5h5v5M9.5 14.5l-6 6" />,
  play: <path d="M7.5 5.2v13.6a.9.9 0 0 0 1.37.77l11-6.8a.9.9 0 0 0 0-1.54l-11-6.8a.9.9 0 0 0-1.37.77Z" />,
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4h4" />
    </>
  ),
  rapido: (
    <>
      <path d="M3.75 6.6v10.8a.75.75 0 0 0 1.17.62L12 12.6V17.4a.75.75 0 0 0 1.17.62l7.5-5.4a.75.75 0 0 0 0-1.24l-7.5-5.4A.75.75 0 0 0 12 6.6v4.8L4.92 5.98A.75.75 0 0 0 3.75 6.6Z" />
    </>
  ),
  configuracoes: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  troca: <path d="M5 9h13.5M15 5.5 18.5 9 15 12.5M19 15H5.5M9 11.5 5.5 15 9 18.5" />,
  bandeira: (
    <>
      <path d="M5.5 20.5V4" />
      <path d="M5.5 4.5h11.25l-2.25 4 2.25 4H5.5" />
    </>
  ),
  'olho-fechado': (
    <>
      <path d="M3.5 12s3.1-6 8.5-6c1.6 0 3 .5 4.2 1.2M20.5 12s-3.1 6-8.5 6c-1.6 0-3-.5-4.2-1.2" />
      <path d="M9.9 14.1a3 3 0 0 1 4.2-4.2" />
      <path d="M4.5 19.5l15-15" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.5 19.25a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.2a5.5 5.5 0 0 1 3 5" />
    </>
  ),
  globo: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M3.25 12h17.5M12 3.25c2.4 2.4 3.6 5.3 3.6 8.75S14.4 18.35 12 20.75C9.6 18.35 8.4 15.45 8.4 12S9.6 5.65 12 3.25Z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20.75s6.25-5.4 6.25-10.5a6.25 6.25 0 0 0-12.5 0c0 5.1 6.25 10.5 6.25 10.5Z" />
      <circle cx="12" cy="10.25" r="2.25" />
    </>
  ),
  casa: (
    <>
      <path d="M4.5 10.5 12 4.25l7.5 6.25" />
      <path d="M6.25 9.25v10.5h11.5V9.25" />
      <path d="M10 19.75v-5h4v5" />
    </>
  ),
  grafico: (
    <>
      <path d="M4.5 4.5v15h15" />
      <path d="m7.5 15 3.5-4 3 2.5 5-6" />
    </>
  ),
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  pontos: (
    <>
      <circle cx="6" cy="12" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="18" cy="12" r="1.1" fill="currentColor" />
    </>
  ),
} as const;

export type IconName = keyof typeof P;
/** Lista de nomes (para a vitrine /kit). */
export const ICON_NAMES = Object.keys(P) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Tamanho em px (largura = altura). Padrão 20. */
  size?: number;
  /** Rótulo acessível; sem ele o ícone é decorativo. */
  title?: string;
  /** Espessura do traço. Padrão 1,75. */
  strokeWidth?: number;
}

export function Icon({ name, size = 20, title, strokeWidth = 1.75, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      className={cn('shrink-0', className)}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {P[name]}
    </svg>
  );
}
