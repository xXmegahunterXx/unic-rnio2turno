/**
 * Modo streamer (/live, "fonte de navegador" do OBS/Streamlabs): opções da URL, padrões e o endereço de cada layout.
 * Puro (testado em opcoes.test.ts). A página /streamers monta as URLs com `caminhoLive` e a /live as lê com
 * `lerOpcoesLive` — valores desconhecidos caem no padrão (uma live nunca fica em branco por um parâmetro errado).
 *
 *  - layout   placar | barra | canto | mapa
 *  - fundo    transparente | escuro | claro   (transparente = html/body sem fundo: o OBS compõe a cena por trás)
 *  - tema     escuro | claro                  (cor dos painéis; com fundo escuro/claro o tema acompanha o fundo)
 *  - race     pres | gov-xx                   (só as UFs de UFS_GOV_2T; o resto cai em Presidente)
 *  - posicao  barra: baixo | topo · canto: topo-direita | topo-esquerda | baixo-direita | baixo-esquerda
 *  - mapa     estados | municipios            (layout mapa, Presidente)
 */
import type { UF } from '@/shared/types';
import { UF_NOMES, UFS_GOV_2T } from '@/shared/constants';

export const LAYOUTS_LIVE = ['placar', 'barra', 'canto', 'mapa'] as const;
export type LayoutLive = (typeof LAYOUTS_LIVE)[number];

export const FUNDOS_LIVE = ['transparente', 'escuro', 'claro'] as const;
export type FundoLive = (typeof FUNDOS_LIVE)[number];

export type TemaLive = 'escuro' | 'claro';

export const POSICOES_BARRA = ['baixo', 'topo'] as const;
export const POSICOES_CANTO = ['topo-direita', 'topo-esquerda', 'baixo-direita', 'baixo-esquerda'] as const;
export type PosicaoBarra = (typeof POSICOES_BARRA)[number];
export type PosicaoCanto = (typeof POSICOES_CANTO)[number];
export type PosicaoLive = PosicaoBarra | PosicaoCanto;

export type MapaLive = 'estados' | 'municipios';

export interface OpcoesLive {
  layout: LayoutLive;
  fundo: FundoLive;
  /** Cor dos painéis. Com fundo sólido, é sempre a do fundo. */
  tema: TemaLive;
  /** 'pres' ou 'gov-xx' (minúsculas). */
  race: string;
  /** Só barra e canto; nos layouts de tela cheia é ignorada. */
  posicao: PosicaoLive;
  /** Só no layout mapa de Presidente. */
  mapa: MapaLive;
}

/** Domínio exibido nas lives quando o build não define VITE_SITE_URL (o endereço público do produto). */
export const DOMINIO_PADRAO = 'sintonia2026.com.br';

/** Tamanho recomendado da fonte de navegador (16:9). Todas as medidas da /live derivam da altura (`--u` ≈ 1%). */
export const TAMANHOS_LIVE = [
  { largura: 1920, altura: 1080, rotulo: 'Full HD (1920 × 1080)' },
  { largura: 1280, altura: 720, rotulo: 'HD (1280 × 720)' },
] as const;

export const ROTULO_LAYOUT: Record<LayoutLive, string> = {
  placar: 'Placar grande',
  barra: 'Barra inferior',
  canto: 'Canto da tela',
  mapa: 'Mapa',
};

export const DESCRICAO_LAYOUT: Record<LayoutLive, string> = {
  placar: 'Tela cheia com os dois finalistas, os percentuais em destaque, o total apurado e o horário do último dado.',
  barra: 'Faixa no pé (ou no topo) da tela, no estilo de gerador de caracteres: fica por cima do jogo ou da câmera.',
  canto: 'Quadro compacto num dos cantos, para deixar ligado a noite inteira sem cobrir a transmissão.',
  mapa: 'Mapa do Brasil (ou do estado) com quem está à frente em cada lugar, ao lado do placar.',
};

export const ROTULO_FUNDO: Record<FundoLive, string> = {
  transparente: 'Transparente',
  escuro: 'Escuro',
  claro: 'Claro',
};

export const ROTULO_POSICAO: Record<PosicaoLive, string> = {
  baixo: 'Embaixo',
  topo: 'Em cima',
  'topo-direita': 'Topo direito',
  'topo-esquerda': 'Topo esquerdo',
  'baixo-direita': 'Base direita',
  'baixo-esquerda': 'Base esquerda',
};

/** Disputas aceitas: Presidente + as de governador do 2º turno (fonte única: UFS_GOV_2T). */
export const RACES_LIVE: readonly string[] = ['pres', ...UFS_GOV_2T.map((u) => `gov-${u.toLowerCase()}`)];

/** Rótulo curto da disputa para seletores ("Presidente", "Governador · DF"). */
export function rotuloRaceLive(race: string): string {
  if (race === 'pres') return 'Presidente';
  const uf = race.slice(4).toUpperCase() as UF;
  return `Governador · ${UF_NOMES[uf] ?? uf}`;
}

/** Fundo padrão de cada layout: os de tela cheia vêm com fundo escuro; os sobrepostos (barra, canto), transparentes. */
export function fundoPadrao(layout: LayoutLive): FundoLive {
  return layout === 'placar' || layout === 'mapa' ? 'escuro' : 'transparente';
}

/** Posição padrão (barra: embaixo; canto: topo direito, longe do chat que costuma ficar embaixo). */
export function posicaoPadrao(layout: LayoutLive): PosicaoLive {
  return layout === 'canto' ? 'topo-direita' : 'baixo';
}

/** Tema efetivo: com fundo sólido, o do fundo; com fundo transparente, o pedido (padrão escuro). */
export function temaEfetivo(fundo: FundoLive, tema: TemaLive | null): TemaLive {
  if (fundo === 'escuro') return 'escuro';
  if (fundo === 'claro') return 'claro';
  return tema ?? 'escuro';
}

const ehLayout = (v: string): v is LayoutLive => (LAYOUTS_LIVE as readonly string[]).includes(v);
const ehFundo = (v: string): v is FundoLive => (FUNDOS_LIVE as readonly string[]).includes(v);

/** Aceita também os nomes em inglês que o OBS e os tutoriais usam (dark/light/transparent). */
function normalizarFundo(v: string | null): FundoLive | null {
  const x = (v ?? '').trim().toLowerCase();
  if (x === 'transparent' || x === 'transparente' || x === 'nenhum') return 'transparente';
  if (x === 'dark' || x === 'escuro') return 'escuro';
  if (x === 'light' || x === 'claro') return 'claro';
  return ehFundo(x) ? x : null;
}

function normalizarTema(v: string | null): TemaLive | null {
  const x = (v ?? '').trim().toLowerCase();
  if (x === 'claro' || x === 'light') return 'claro';
  if (x === 'escuro' || x === 'dark') return 'escuro';
  return null;
}

/** Lê e valida as opções da URL (valores desconhecidos caem no padrão). */
export function lerOpcoesLive(params: URLSearchParams): OpcoesLive {
  const l = (params.get('layout') ?? '').trim().toLowerCase();
  const layout: LayoutLive = ehLayout(l) ? l : 'placar';
  const fundo = normalizarFundo(params.get('fundo')) ?? fundoPadrao(layout);
  const tema = temaEfetivo(fundo, normalizarTema(params.get('tema')));
  const r = (params.get('race') ?? '').trim().toLowerCase();
  const race = RACES_LIVE.includes(r) ? r : 'pres';
  const p = (params.get('posicao') ?? '').trim().toLowerCase();
  let posicao: PosicaoLive = posicaoPadrao(layout);
  if (layout === 'barra' && (POSICOES_BARRA as readonly string[]).includes(p)) posicao = p as PosicaoBarra;
  if (layout === 'canto' && (POSICOES_CANTO as readonly string[]).includes(p)) posicao = p as PosicaoCanto;
  const mapa: MapaLive = layout === 'mapa' && race === 'pres' && (params.get('mapa') ?? '').toLowerCase() === 'municipios' ? 'municipios' : 'estados';
  return { layout, fundo, tema, race, posicao, mapa };
}

/**
 * Rota da live (sem origem): '/live?layout=barra&fundo=transparente&posicao=topo'. `layout` e `fundo` vão sempre
 * (quem cola no OBS vê o que escolheu); o resto só quando difere do padrão.
 */
export function caminhoLive(o: OpcoesLive): string {
  const p = new URLSearchParams();
  p.set('layout', o.layout);
  p.set('fundo', o.fundo);
  if (o.fundo === 'transparente' && o.tema !== 'escuro') p.set('tema', o.tema);
  if (o.race !== 'pres' && RACES_LIVE.includes(o.race)) p.set('race', o.race);
  if ((o.layout === 'barra' || o.layout === 'canto') && o.posicao !== posicaoPadrao(o.layout)) p.set('posicao', o.posicao);
  if (o.layout === 'mapa' && o.race === 'pres' && o.mapa === 'municipios') p.set('mapa', 'municipios');
  return `/live?${p.toString()}`;
}

/** Opções padrão de um layout (o que a /streamers mostra antes de a pessoa mexer). */
export function opcoesPadrao(layout: LayoutLive): OpcoesLive {
  const fundo = fundoPadrao(layout);
  return { layout, fundo, tema: temaEfetivo(fundo, null), race: 'pres', posicao: posicaoPadrao(layout), mapa: 'estados' };
}

/** Normaliza uma combinação vinda dos controles da /streamers (ex.: trocou o fundo → o tema acompanha). */
export function ajustarOpcoes(o: OpcoesLive): OpcoesLive {
  return lerOpcoesLive(new URLSearchParams(caminhoLive(o).split('?')[1]));
}
