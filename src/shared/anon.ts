/**
 * Anonimização da SIMULAÇÃO (isomórfico: app e servidor).
 * Na fonte 'simulacao', por padrão (LiveStatus.anonimizado), os candidatos aparecem como "Candidato A/B" para que
 * números fictícios nunca circulem (prints, imagens de compartilhamento) associados a candidatos reais.
 *
 * As CORES também são neutralizadas: as de identificação de Presidente ('vermelho'/'azul', ver CORES_IDENTIDADE)
 * viram os slots neutros 'a'/'b' pela ordem da urna — vermelho ao lado de "Candidato A" seria o mesmo que dizer
 * quem é. Rótulos, número e cor saem da POSIÇÃO do candidato (nunca da cor).
 */
import { corNeutra } from './cores';
import type { Candidate, Race } from './types';

/** Partido exibido no 2º turno simulado com os nomes ocultos. */
export const PARTIDO_SIMULACAO = 'Simulação';
/**
 * Partido exibido nas corridas de 1º turno (resultado OFICIAL do TSE) com os nomes ocultos: nada de "Simulação" ao
 * lado de um número real — só se avisa que o nome está oculto.
 */
export const PARTIDO_OCULTO = 'nome oculto';

/** "A", "B"… pela posição entre os candidatos reais (ordem do número na urna). */
const rotulo = (indice: number) => String.fromCharCode(65 + indice);

/**
 * Versão anônima de uma corrida: "Candidato A/B", cores neutras, sem partido, vice, número, foto ou ficha reais.
 * No 1º turno (dado oficial) o partido vira "nome oculto" em vez de "Simulação" (ver `partidoENumero`).
 */
export function anonimizarRace(r: Race): Race {
  let k = 0;
  const oficial = r.turno === 1;
  return {
    ...r,
    candidatos: r.candidatos.map((c) => {
      if (c.agregado) return c;
      const i = k++;
      return {
        ...c,
        nomeUrna: `Candidato ${rotulo(i)}`,
        nome: `Candidato ${rotulo(i)} (${oficial ? 'nome oculto' : 'simulação'})`,
        partido: oficial ? PARTIDO_OCULTO : PARTIDO_SIMULACAO,
        coligacao: undefined,
        composicao: undefined,
        vice: undefined,
        numero: i + 1,
        cor: corNeutra(i),
        // sem chave de foto/ficha: nunca foto na simulação anonimizada (ARCHITECTURE §1.1)
        sqcand: undefined,
        fotoGrupo: undefined,
      };
    }),
  };
}

/**
 * Linha "partido · número" de um candidato ("PT · 13"). Com o nome oculto no 1º turno oficial, só "nome oculto": o
 * número da anonimização (1, 2) é fictício e não deve aparecer ao lado de um resultado real.
 */
export function partidoENumero(c: Pick<Candidate, 'partido' | 'numero'>): string {
  return c.partido === PARTIDO_OCULTO ? PARTIDO_OCULTO : `${c.partido} · ${c.numero}`;
}

/** Troca nomes reais por "Candidato A/B" num texto (ex.: títulos de eventos). Nomes mais longos primeiro. */
export function anonimizarTexto(texto: string, races: Race[]): string {
  const pares: [string, string][] = [];
  for (const r of races) {
    let k = 0;
    for (const c of r.candidatos) {
      if (c.agregado) continue;
      const i = k++;
      if (c.nomeUrna) pares.push([c.nomeUrna, `Candidato ${rotulo(i)}`]);
    }
  }
  pares.sort((x, y) => y[0].length - x[0].length);
  let out = texto;
  for (const [real, anon] of pares) out = out.split(real).join(anon);
  return out;
}
