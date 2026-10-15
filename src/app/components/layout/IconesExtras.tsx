/**
 * Ícones que o kit (src/app/ui/Icon.tsx) não tem — mesmo traço (1,75, `currentColor`, 24×24) — e um seletor que
 * aceita tanto os do kit quanto estes.
 */
import { Icon, type IconName } from '@/app/ui/Icon';
import type { IconeExtra } from './mais';

const EXTRAS: Record<IconeExtra, React.ReactNode> = {
  tv: (
    <>
      <rect x="2.75" y="4.75" width="18.5" height="12.5" rx="2.25" />
      <path d="M8 20.25h8M12 17.25v3" />
    </>
  ),
  codigo: <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  megafone: (
    <>
      <path d="M3.75 10.25v3.5a1.5 1.5 0 0 0 1.5 1.5H7.5l7.25 4.25V4.5L7.5 8.75H5.25a1.5 1.5 0 0 0-1.5 1.5Z" />
      <path d="M18 9.25a3.75 3.75 0 0 1 0 5.5M8.5 15.25l1.25 4.5" />
    </>
  ),
  carta: (
    <>
      <rect x="3" y="5.25" width="18" height="13.5" rx="2.25" />
      <path d="m3.75 6.75 8.25 6 8.25-6" />
    </>
  ),
};

export function IconeQualquer({ name, size = 20, className }: { name: IconName | IconeExtra; size?: number; className?: string }) {
  if (name in EXTRAS) {
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
        className={className}
      >
        {EXTRAS[name as IconeExtra]}
      </svg>
    );
  }
  return <Icon name={name as IconName} size={size} className={className} />;
}
