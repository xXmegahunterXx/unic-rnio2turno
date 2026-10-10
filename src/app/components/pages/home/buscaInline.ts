/**
 * Regras da busca "Como votou sua cidade ou seção" da Home (puro, testado em buscaInline.test.ts). Reaproveita o
 * índice da busca rápida (src/app/components/busca/indice.ts): municípios, UFs e o atalho "cidade + zona + seção".
 */
import type { UF } from '@/shared/types';
import { buscar, interpretarSecao, rotaSecao, type ConsultaSecao, type ItemBusca } from '@/app/components/busca/indice';

export interface ResultadoInline {
  opcoes: ItemBusca[];
  /** O texto parece "zona + seção" mas falta a cidade (ou ela não foi encontrada): mostramos a dica. */
  faltaCidade: ConsultaSecao | null;
}

const fmt4 = (n: number) => String(n).padStart(4, '0');

export function resultadosInline(consulta: string, municipios: ItemBusca[], ufs: ItemBusca[], max = 6): ResultadoInline {
  const q = consulta.trim();
  if (!q) return { opcoes: [], faltaCidade: null };
  const cs = interpretarSecao(q);
  if (cs) {
    const base = cs.uf ? municipios.filter((m) => m.id.startsWith(`m-${cs.uf}-`)) : municipios;
    const achados = cs.resto ? buscar(base, cs.resto, 4) : [];
    const opcoes = achados.map((m): ItemBusca => {
      const [, uf, cod] = m.id.split('-');
      return {
        ...m,
        id: `s-${m.id}-${cs.zona}-${cs.secao}`,
        tipo: 'secao',
        rotulo: `Zona ${fmt4(cs.zona)} · Seção ${fmt4(cs.secao)}`,
        sub: `${m.rotulo} (${uf === 'ZZ' ? 'Exterior' : uf})`,
        to: rotaSecao(uf as UF, cod, cs.zona, cs.secao),
        icone: 'urna',
      };
    });
    return { opcoes, faltaCidade: opcoes.length ? null : cs };
  }
  const muns = buscar(municipios, q, max);
  const est = buscar(ufs, q, 2);
  return { opcoes: [...muns, ...est].slice(0, max + 1), faltaCidade: null };
}
