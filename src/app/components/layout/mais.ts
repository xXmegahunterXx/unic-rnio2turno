/**
 * Conteúdo do menu "Mais" (carregado sob demanda junto com MenuMais.tsx). Mantenha `PREFIXOS_MAIS` (nav.ts) em
 * sincronia com as rotas daqui (mais.test.ts confere).
 */
import type { IconName } from '@/app/ui/Icon';
import { nEstadosGov } from '@/shared/gov2t';
import { HORA_FIM_VOTACAO } from '@/shared/diaVotacao';

/** Ícones extras do menu "Mais" (desenhados em layout/IconesExtras.tsx). */
export type IconeExtra = 'tv' | 'codigo' | 'megafone' | 'carta' | 'chat';

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
      { to: '/pesquisas', label: 'Pesquisas do 2º turno', desc: 'Registradas no TSE, com a fonte de cada número', icon: 'lista', match: (p) => p.startsWith('/pesquisas') },
      { to: '/curiosidades', label: 'Curiosidades', desc: 'Recordes e fatos do 1º turno', icon: 'grafico', match: (p) => p.startsWith('/curiosidades') },
      { to: '/ao-vivo', label: 'Chat ao vivo', desc: `Sala da apuração, moderada (abre às ${HORA_FIM_VOTACAO} de 25/10)`, icon: 'chat', match: (p) => p.startsWith('/ao-vivo') },
      { to: '/palpite', label: 'Palpite do 2º turno', desc: `Compare com o resultado a partir das ${HORA_FIM_VOTACAO} de 25/10`, icon: 'relogio', match: (p) => p.startsWith('/palpite') },
      { to: '/cenarios', label: 'E se…? Monte seu cenário', desc: 'Calculadora do 2º turno, não é previsão', icon: 'troca', match: (p) => p.startsWith('/cenarios') },
      { to: '/governadores', label: 'Governadores', desc: `2º turno em ${nEstadosGov()}`, icon: 'grade', match: (p) => p.startsWith('/governadores') },
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
      { to: '/streamers', label: 'Para streamers', desc: 'Placar ao vivo no OBS e no Streamlabs', icon: 'ao-vivo', match: (p) => p.startsWith('/streamers') },
    ],
  },
  {
    titulo: 'Sobre',
    itens: [
      { to: '/metodologia', label: 'Metodologia', icon: 'info', match: (p) => p.startsWith('/metodologia') },
      { to: '/privacidade', label: 'Privacidade', icon: 'olho-fechado', match: (p) => p.startsWith('/privacidade') },
      { to: '/sobre', label: 'Sobre o Sintonia', icon: 'selo', match: (p) => p.startsWith('/sobre') },
      { to: '/anuncie', label: 'Anuncie no Sintonia', icon: 'megafone', match: (p) => p.startsWith('/anuncie') },
    ],
  },
];

