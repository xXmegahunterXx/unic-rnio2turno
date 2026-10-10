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
