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
import type { Race } from './types';

/** "A", "B"… pela posição entre os candidatos reais (ordem do número na urna). */
const rotulo = (indice: number) => String.fromCharCode(65 + indice);

/** Versão anônima de uma corrida: "Candidato A/B", cores neutras, sem partido, vice, número, foto ou ficha reais. */
export function anonimizarRace(r: Race): Race {
  let k = 0;
  return {
    ...r,
    candidatos: r.candidatos.map((c) => {
      if (c.agregado) return c;
      const i = k++;
      return {
        ...c,
        nomeUrna: `Candidato ${rotulo(i)}`,
        nome: `Candidato ${rotulo(i)} (simulação)`,
        partido: 'Simulação',
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
