/**
 * Índice e regras da busca rápida (puro, sem React): municípios (5.571 + cidades no exterior), UFs, candidatos
 * com ficha, páginas e o atalho "zona/seção". Busca sem acento e sem caixa (normalize de src/shared/format.ts).
 */
import type { UF } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { normalize } from '@/shared/format';
import type { IconName } from '@/app/ui/Icon';

export type TipoItem = 'pagina' | 'uf' | 'municipio' | 'candidato' | 'secao';

export interface ItemBusca {
  id: string;
  tipo: TipoItem;
  rotulo: string;
  sub?: string;
  /** Rota de destino (react-router). */
  to: string;
  icone: IconName;
  /** Texto normalizado para casar com a consulta. */
  chave: string;
  /** Peso de desempate (ex.: capital, eleitorado). */
  peso?: number;
}

export interface MunicipioBase {
  uf: UF;
  cod: string;
  nome: string;
  pais?: string;
  capital?: boolean;
}

export interface CandidatoBase {
  sqcand: string;
  nomeUrna: string;
  numero: number;
  partido: string;
  cargo: string;
  uf: string;
}

export const PAGINAS: ItemBusca[] = [
  { id: 'p-apuracao', tipo: 'pagina', rotulo: 'Apuração do 2º turno', sub: 'Placar nacional', to: '/apuracao', icone: 'ao-vivo', chave: 'apuracao placar presidente segundo turno resultado' },
  { id: 'p-governadores', tipo: 'pagina', rotulo: 'Governadores', sub: '2º turno em 7 estados e eleitos no 1º turno', to: '/governadores', icone: 'grade', chave: 'governadores governador estados' },
  { id: 'p-senado', tipo: 'pagina', rotulo: 'Senado', sub: '54 senadores eleitos no 1º turno', to: '/senado', icone: 'usuarios', chave: 'senado senadores senador' },
  { id: 'p-camara', tipo: 'pagina', rotulo: 'Câmara dos Deputados', sub: '513 deputados federais', to: '/camara', icone: 'usuarios', chave: 'camara deputados federais deputado federal bancadas hemiciclo' },
  { id: 'p-assembleias', tipo: 'pagina', rotulo: 'Assembleias Legislativas', sub: 'Deputados estaduais e distritais', to: '/assembleias', icone: 'usuarios', chave: 'assembleias assembleia legislativa deputados estaduais distritais camara legislativa' },
  { id: 'p-consulta', tipo: 'pagina', rotulo: 'Consulte sua seção', sub: 'Boletim de urna e local de votação', to: '/apuracao/consulta', icone: 'urna', chave: 'consulte sua secao zona titulo boletim urna local de votacao' },
  { id: 'p-teste', tipo: 'pagina', rotulo: 'Teste Cego', sub: 'Escolha propostas sem saber de quem são', to: '/teste', icone: 'olho-fechado', chave: 'teste cego propostas quiz' },
  { id: 'p-metodologia', tipo: 'pagina', rotulo: 'Metodologia', sub: 'Fontes e como calculamos', to: '/metodologia', icone: 'info', chave: 'metodologia fontes como funciona tse ibge' },
];

export function itensUfs(): ItemBusca[] {
  return [...UFS, 'ZZ' as const].map((uf) => ({
    id: `uf-${uf}`,
    tipo: 'uf' as const,
    rotulo: uf === 'ZZ' ? 'Exterior' : UF_NOMES[uf],
    sub: uf === 'ZZ' ? 'Votos fora do país' : `Estado · ${uf}`,
    to: `/apuracao/${uf.toLowerCase()}`,
    icone: 'mapa' as const,
    chave: normalize(`${uf === 'ZZ' ? 'exterior fora do pais' : UF_NOMES[uf]} ${uf}`),
  }));
}

export function itensMunicipios(lista: MunicipioBase[]): ItemBusca[] {
  return lista.map((m) => ({
    id: `m-${m.uf}-${m.cod}`,
    tipo: 'municipio' as const,
    rotulo: m.nome,
    sub: m.uf === 'ZZ' ? `Exterior${m.pais ? ` · ${m.pais}` : ''}` : `${UF_NOMES[m.uf]}${m.capital ? ' · capital' : ''}`,
    to: `/apuracao/${m.uf.toLowerCase()}/${m.cod}`,
    icone: 'pin' as const,
    chave: normalize(`${m.nome} ${m.pais ?? ''}`),
    peso: m.capital ? 2 : 0,
  }));
}

export function itensCandidatos(lista: CandidatoBase[]): ItemBusca[] {
  return lista.map((c) => ({
    id: `c-${c.sqcand}`,
    tipo: 'candidato' as const,
    rotulo: c.nomeUrna,
    sub: `${c.cargo}${c.uf && c.uf !== 'BR' ? ` · ${c.uf}` : ''} · ${c.partido} ${c.numero}`,
    to: `/candidato/${c.sqcand}`,
    icone: 'usuarios' as const,
    chave: normalize(`${c.nomeUrna} ${c.partido} ${c.cargo}`),
    peso: /^(Presidente|Governador|Senador)/.test(c.cargo) ? 1 : 0,
  }));
}

/** Pontua `chave` (já normalizada) contra a consulta normalizada: -1 não casa; maior = melhor. */
export function pontuarChave(chave: string, q: string): number {
  if (!q) return 0;
  const partes = q.split(/\s+/).filter(Boolean);
  if (!partes.every((p) => chave.includes(p))) return -1;
  if (chave.startsWith(q)) return 4;
  if (chave.includes(` ${q}`)) return 3;
  if (partes.every((p) => chave.startsWith(p) || chave.includes(` ${p}`))) return 2;
  return 1;
}

/** Melhores itens de uma lista para a consulta (ordem: pontuação, peso, rótulo mais curto). */
export function buscar(itens: ItemBusca[], consulta: string, max: number): ItemBusca[] {
  const q = normalize(consulta);
  if (!q) return [];
  const out: { it: ItemBusca; s: number }[] = [];
  for (const it of itens) {
    const s = pontuarChave(it.chave, q);
    if (s >= 0) out.push({ it, s });
  }
  out.sort((a, b) => b.s - a.s || (b.it.peso ?? 0) - (a.it.peso ?? 0) || a.it.rotulo.length - b.it.rotulo.length);
  return out.slice(0, max).map((x) => x.it);
}

// ---------------------------------------------------------------------------------------------
// "zona/seção": "SP 1 123", "zona 1 seção 123", "z1 s123 campinas", "1/123 recife"
// ---------------------------------------------------------------------------------------------

export interface ConsultaSecao {
  zona: number;
  secao: number;
  uf: UF | null;
  /** Texto restante (normalizado) para achar o município. */
  resto: string;
}

const UF_POR_NOME = new Map<string, UF>([...UFS].map((u) => [normalize(UF_NOMES[u]), u]));

export function interpretarSecao(consulta: string): ConsultaSecao | null {
  let q = ` ${normalize(consulta).replace(/[.,;:/\\-]+/g, ' ')} `;
  let zona: number | null = null;
  let secao: number | null = null;
  const mz = q.match(/\s(?:zona|zn|z)\s*(\d{1,4})\s/);
  if (mz) {
    zona = Number(mz[1]);
    q = q.replace(mz[0], ' ');
  }
  const ms = q.match(/\s(?:secao|secoes|sec|s)\s*(\d{1,4})\s/);
  if (ms) {
    secao = Number(ms[1]);
    q = q.replace(ms[0], ' ');
  }
  const nums = [...q.matchAll(/\s(\d{1,4})(?=\s)/g)].map((m) => Number(m[1]));
  if (zona === null && secao === null) {
    if (nums.length !== 2) return null;
    [zona, secao] = nums;
  } else if (zona === null) {
    if (nums.length !== 1) return null;
    zona = nums[0];
  } else if (secao === null) {
    if (nums.length !== 1) return null;
    secao = nums[0];
  } else if (nums.length > 0) {
    return null;
  }
  if (!zona || !secao) return null;
  let resto = q.replace(/\s\d{1,4}(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
  let uf: UF | null = null;
  // sigla da UF em qualquer posição ("sp", "rj"…) ou nome completo
  const tokens = resto.split(' ').filter(Boolean);
  const iSigla = tokens.findIndex((t) => t.length === 2 && ((UFS as readonly string[]).includes(t.toUpperCase()) || t === 'zz'));
  if (iSigla >= 0) {
    uf = tokens[iSigla].toUpperCase() as UF;
    tokens.splice(iSigla, 1);
    resto = tokens.join(' ');
  } else if (UF_POR_NOME.has(resto)) {
    // nome do estado: restringe à UF, mas mantém o texto (pode ser a capital homônima: "Rio de Janeiro", "São Paulo")
    uf = UF_POR_NOME.get(resto)!;
  }
  return { zona, secao, uf, resto };
}

export const rotaSecao = (uf: UF, cod: string, zona: number, secao: number) => `/apuracao/${uf.toLowerCase()}/${cod}/${zona}/${secao}`;
