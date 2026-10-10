import type { IconName } from '@/app/ui/Icon';

export interface NavItem {
  to: string;
  label: string;
  /** Rótulo curto para a tab bar do celular (e o header entre 768 e 1023 px). */
  short: string;
  icon: IconName;
  /** A rota está ativa para este caminho? */
  match: (pathname: string) => boolean;
  /** Aparece na tab bar do celular (padrão: sim). Os demais ficam no menu "Mais", na busca rápida e no rodapé. */
  tab?: boolean;
  /** Largura mínima para aparecer no header (padrão 'md'; 'xxl' = 1400 px). Abaixo dela o item vive no menu "Mais". */
  header?: 'md' | 'lg' | 'xl' | 'xxl';
}

export const NAV: NavItem[] = [
  {
    to: '/apuracao',
    label: 'Apuração',
    short: 'Apuração',
    icon: 'ao-vivo',
    match: (p) => p === '/apuracao' || (p.startsWith('/apuracao/') && !p.startsWith('/apuracao/consulta')),
  },
  { to: '/governadores', label: 'Governadores', short: 'Governos', icon: 'grade', match: (p) => p.startsWith('/governadores'), tab: false, header: 'lg' },
  { to: '/teste', label: 'Teste Cego', short: 'Teste Cego', icon: 'olho-fechado', match: (p) => p.startsWith('/teste') || p.startsWith('/duelo') },
  { to: '/curiosidades', label: 'Curiosidades', short: 'Curiosidades', icon: 'grafico', match: (p) => p.startsWith('/curiosidades'), tab: false, header: 'xl' },
  { to: '/cenarios', label: 'E se…?', short: 'E se…?', icon: 'troca', match: (p) => p.startsWith('/cenarios'), tab: false, header: 'xxl' },
  { to: '/apuracao/consulta', label: 'Consulte sua seção', short: 'Sua seção', icon: 'urna', match: (p) => p.startsWith('/apuracao/consulta') },
];

/** Itens da tab bar do celular (a busca entra no meio, como botão; "Mais" fecha a barra). */
export const NAV_TAB = NAV.filter((n) => n.tab !== false);

/** Rotas que vivem no menu "Mais" (marca a aba "Mais" como ativa no celular). O conteúdo do menu está em mais.ts. */
export const PREFIXOS_MAIS = ['/curiosidades', '/cenarios', '/governadores', '/senado', '/camara', '/assembleias', '/metodologia', '/privacidade', '/sobre'];
export const ativoNoMais = (pathname: string) => PREFIXOS_MAIS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
