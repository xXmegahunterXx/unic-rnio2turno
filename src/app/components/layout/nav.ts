import type { IconName } from '@/app/ui/Icon';

export interface NavItem {
  to: string;
  label: string;
  /** Rótulo curto para a tab bar do celular (e o header entre 768 e 1023 px). */
  short: string;
  icon: IconName;
  /** A rota está ativa para este caminho? */
  match: (pathname: string) => boolean;
  /** Aparece na tab bar do celular (padrão: sim). Os demais ficam na busca rápida ("Atalhos") e no rodapé. */
  tab?: boolean;
  /** Largura mínima para aparecer no header (padrão 'md'): itens secundários só a partir de 'xl'. */
  header?: 'md' | 'lg' | 'xl';
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
  { to: '/senado', label: 'Senado', short: 'Senado', icon: 'usuarios', match: (p) => p.startsWith('/senado'), tab: false, header: 'xl' },
  {
    to: '/camara',
    label: 'Câmara',
    short: 'Câmara',
    icon: 'usuarios',
    match: (p) => p.startsWith('/camara') || p.startsWith('/assembleias'),
    tab: false,
    header: 'xl',
  },
  { to: '/teste', label: 'Teste Cego', short: 'Teste Cego', icon: 'olho-fechado', match: (p) => p.startsWith('/teste') || p.startsWith('/duelo') },
  { to: '/apuracao/consulta', label: 'Consulte sua seção', short: 'Sua seção', icon: 'urna', match: (p) => p.startsWith('/apuracao/consulta') },
];

/** Itens da tab bar do celular (a busca entra no meio, como botão). */
export const NAV_TAB = NAV.filter((n) => n.tab !== false);
