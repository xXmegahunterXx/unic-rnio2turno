/**
 * Anonimização da SIMULAÇÃO (isomórfico: app e servidor).
 * Na fonte 'simulacao', por padrão (LiveStatus.anonimizado), os candidatos aparecem como "Candidato A/B" para que
 * números fictícios nunca circulem (prints, imagens de compartilhamento) associados a candidatos reais.
 */
import type { Race } from './types';

const ROTULO_SLOT = { a: 'A', b: 'B', outros: '' } as const;

/** Versão anônima de uma corrida: "Candidato A/B", sem partido, vice ou número reais. */
export function anonimizarRace(r: Race): Race {
  return {
    ...r,
    candidatos: r.candidatos.map((c) =>
      c.agregado
        ? c
        : {
            ...c,
            nomeUrna: `Candidato ${ROTULO_SLOT[c.cor]}`,
            nome: `Candidato ${ROTULO_SLOT[c.cor]} (simulação)`,
            partido: 'Simulação',
            coligacao: undefined,
            composicao: undefined,
            vice: undefined,
            numero: c.cor === 'a' ? 1 : 2,
          },
    ),
  };
}

/** Troca nomes reais por "Candidato A/B" num texto (ex.: títulos de eventos). Nomes mais longos primeiro. */
export function anonimizarTexto(texto: string, races: Race[]): string {
  const pares: [string, string][] = [];
  for (const r of races)
    for (const c of r.candidatos)
      if (!c.agregado && c.nomeUrna) pares.push([c.nomeUrna, `Candidato ${ROTULO_SLOT[c.cor]}`]);
  pares.sort((x, y) => y[0].length - x[0].length);
  let out = texto;
  for (const [real, anon] of pares) out = out.split(real).join(anon);
  return out;
}
