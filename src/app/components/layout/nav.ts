import type { IconName } from '@/app/ui/Icon';

export interface NavItem {
  to: string;
  label: string;
  /** Rótulo curto para a tab bar do celular. */
  short: string;
  icon: IconName;
  /** A rota está ativa para este caminho? */
  match: (pathname: string) => boolean;
}

export const NAV: NavItem[] = [
  {
    to: '/apuracao',
    label: 'Apuração',
    short: 'Apuração',
    icon: 'ao-vivo',
    match: (p) => p === '/apuracao' || (p.startsWith('/apuracao/') && !p.startsWith('/apuracao/consulta')),
  },
  { to: '/governadores', label: 'Governadores', short: 'Governos', icon: 'grade', match: (p) => p.startsWith('/governadores') },
  { to: '/teste', label: 'Teste Cego', short: 'Teste Cego', icon: 'olho-fechado', match: (p) => p.startsWith('/teste') || p.startsWith('/duelo') },
  { to: '/apuracao/consulta', label: 'Consulte sua seção', short: 'Sua seção', icon: 'busca', match: (p) => p.startsWith('/apuracao/consulta') },
];
