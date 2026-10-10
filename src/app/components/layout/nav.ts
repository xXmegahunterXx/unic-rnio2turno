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
  /** Largura mínima para aparecer no header (padrão 'md'). Abaixo dela o item vive no menu "Mais". */
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
  { to: '/governadores', label: 'Governadores', short: 'Governos', icon: 'grade', match: (p) => p.startsWith('/governadores'), tab: false },
  { to: '/teste', label: 'Teste Cego', short: 'Teste Cego', icon: 'olho-fechado', match: (p) => p.startsWith('/teste') || p.startsWith('/duelo') },
  { to: '/curiosidades', label: 'Curiosidades', short: 'Curiosidades', icon: 'grafico', match: (p) => p.startsWith('/curiosidades'), tab: false, header: 'lg' },
  { to: '/cenarios', label: 'E se…?', short: 'E se…?', icon: 'troca', match: (p) => p.startsWith('/cenarios'), tab: false, header: 'xl' },
  { to: '/apuracao/consulta', label: 'Consulte sua seção', short: 'Sua seção', icon: 'urna', match: (p) => p.startsWith('/apuracao/consulta') },
];

/** Itens da tab bar do celular (a busca entra no meio, como botão; "Mais" fecha a barra). */
export const NAV_TAB = NAV.filter((n) => n.tab !== false);

/** Ícones extras do menu "Mais" (desenhados em layout/IconesExtras.tsx). */
export type IconeExtra = 'tv' | 'codigo';

export interface ItemMais {
  /** Rota (react-router) ou ação ('incorporar' | 'compartilhar'). */
  to?: string;
  acao?: 'incorporar' | 'compartilhar';
  label: string;
  desc?: string;
  icon: IconName | IconeExtra;
  match?: (pathname: string) => boolean;
}

export interface GrupoMais {
  titulo: string;
  itens: ItemMais[];
}

/** Conteúdo do menu "Mais" (celular: folha inferior; desktop: painel sob o botão). */
export const MAIS: GrupoMais[] = [
  {
    titulo: 'Explore',
    itens: [
      { to: '/curiosidades', label: 'Curiosidades', desc: 'Recordes e fatos do 1º turno', icon: 'grafico', match: (p) => p.startsWith('/curiosidades') },
      { to: '/cenarios', label: 'E se…? Monte seu cenário', desc: 'Calculadora do 2º turno, não é previsão', icon: 'troca', match: (p) => p.startsWith('/cenarios') },
      { to: '/governadores', label: 'Governadores', desc: '2º turno em 7 estados', icon: 'grade', match: (p) => p.startsWith('/governadores') },
      { to: '/tv', label: 'Modo TV', desc: 'Tela cheia para transmissão', icon: 'tv' },
    ],
  },
  {
    titulo: 'Eleitos no 1º turno',
    itens: [
      { to: '/senado', label: 'Senado', desc: '54 vagas', icon: 'usuarios', match: (p) => p.startsWith('/senado') },
      { to: '/camara', label: 'Câmara dos Deputados', desc: '513 cadeiras', icon: 'usuarios', match: (p) => p.startsWith('/camara') },
      { to: '/assembleias', label: 'Assembleias', desc: 'Deputados estaduais', icon: 'usuarios', match: (p) => p.startsWith('/assembleias') },
    ],
  },
  {
    titulo: 'Leve o Sintonia',
    itens: [
      { acao: 'compartilhar', label: 'Compartilhar o Sintonia', desc: 'Imagem, texto e link prontos', icon: 'compartilhar' },
      { acao: 'incorporar', label: 'Incorporar no seu site', desc: 'Placar e mapa para blogs', icon: 'codigo' },
    ],
  },
  {
    titulo: 'Sobre',
    itens: [
      { to: '/metodologia', label: 'Metodologia', icon: 'info', match: (p) => p.startsWith('/metodologia') },
      { to: '/privacidade', label: 'Privacidade', icon: 'olho-fechado', match: (p) => p.startsWith('/privacidade') },
      { to: '/sobre', label: 'Sobre o Sintonia', icon: 'selo', match: (p) => p.startsWith('/sobre') },
    ],
  },
];

/** A rota atual está dentro do menu "Mais"? (marca a aba "Mais" como ativa no celular) */
export const ativoNoMais = (pathname: string) => MAIS.some((g) => g.itens.some((i) => i.match?.(pathname)));
