/**
 * Ícones das redes do Sintonia ("Siga o Sintonia"), no mesmo traço do kit (24×24, 1,75, `currentColor`). Desenhos
 * simplificados, monocromáticos (sem as cores das marcas).
 */
import type { RedeSintonia } from '@/shared/audiencia';
import { Icon } from '@/app/ui/Icon';

const P: Record<Exclude<RedeSintonia, 'whatsapp'>, React.ReactNode> = {
  x: (
    <>
      <path d="M4.75 4.75h4.1l10.4 14.5h-4.1L4.75 4.75Z" />
      <path d="m19 4.75-5.9 6.6M10.9 12.65 5 19.25" />
    </>
  ),
  instagram: (
    <>
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.75" />
      <circle cx="12" cy="12" r="3.75" />
      <circle cx="17.1" cy="6.9" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  tiktok: <path d="M13.25 4v10.75a3.5 3.5 0 1 1-3.5-3.5M13.25 4c.35 2.55 2.2 4.4 4.75 4.75" />,
  telegram: (
    <>
      <path d="M20.5 4.25 3.5 10.9l5.4 2.05 2.05 6.3 3.05-3.7 4.75 3.6 1.75-14.9Z" />
      <path d="m8.9 12.95 8.15-5.6-6.1 6.95" />
    </>
  ),
  youtube: (
    <>
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="3.75" />
      <path d="M10.25 9.4v5.2L14.75 12l-4.5-2.6Z" fill="currentColor" />
    </>
  ),
};

export function IconeRede({ rede, size = 20, className }: { rede: RedeSintonia; size?: number; className?: string }) {
  if (rede === 'whatsapp') return <Icon name="whatsapp" size={size} className={className} />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {P[rede]}
    </svg>
  );
}
