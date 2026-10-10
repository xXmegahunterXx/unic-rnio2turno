/**
 * Cores dos candidatos: Lula vermelho e Flávio Bolsonaro azul (decisão do dono do produto) só na família 'pres';
 * governadores e simulação com nomes ocultos nos slots neutros 'a'/'b' pela ordem da urna.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatasetMeta } from './dataset';
import type { Candidate, Race } from './types';
import { CORES_IDENTIDADE } from './constants';
import {
  REGRA_CORES,
  aplicarCores,
  corCandidato,
  corNeutra,
  coresIdentidadePresidente,
  coresPresidente,
  ehCorIdentidade,
  familiaCor,
  neutralizarCores,
} from './cores';

const meta = JSON.parse(readFileSync(path.resolve(__dirname, '../../public/data/meta.json'), 'utf8')) as DatasetMeta;

const cand = (numero: number, cor: Candidate['cor'], extra: Partial<Candidate> = {}): Candidate => ({
  numero,
  nomeUrna: `N${numero}`,
  nome: `Nome ${numero}`,
  partido: 'X',
  cor,
  ...extra,
});

describe('fonte única das cores', () => {
  it('CORES_IDENTIDADE: Lula (13) vermelho, Flávio Bolsonaro (22) azul, só para Presidente', () => {
    expect(CORES_IDENTIDADE).toEqual({ pres: { 13: 'vermelho', 22: 'azul' } });
  });

  it('corCandidato: identidade na família pres; slot neutro pela posição nas demais', () => {
    expect(familiaCor('pres-t1')).toBe('pres');
    expect(familiaCor('gov-rj-t1')).toBe('gov-rj');
    expect(corCandidato('pres', 13, 0)).toBe('vermelho');
    expect(corCandidato('pres-t1', 22, 1)).toBe('azul');
    // governador: o mesmo número (13 = PT no DF e no RN; 22 = PL no RJ e no AM) NÃO herda vermelho/azul
    expect(corCandidato('gov-rj', 22, 0)).toBe('a');
    expect(corCandidato('gov-df', 13, 1)).toBe('b');
    expect(corCandidato('gov-rn-t1', 13, 0)).toBe('a');
    expect(corNeutra(0)).toBe('a');
    expect(corNeutra(1)).toBe('b');
    expect(ehCorIdentidade('vermelho') && ehCorIdentidade('azul')).toBe(true);
    expect(ehCorIdentidade('a') || ehCorIdentidade('b') || ehCorIdentidade('outros')).toBe(false);
  });

  it('coresPresidente segue o número (não a posição recebida); coresIdentidadePresidente na ordem da urna', () => {
    expect(coresPresidente([13, 22])).toEqual(['vermelho', 'azul']);
    expect(coresPresidente([22, 13])).toEqual(['azul', 'vermelho']);
    expect(coresIdentidadePresidente()).toEqual(['vermelho', 'azul']);
  });

  it('aplicarCores: puro, idempotente e não mexe em "Outros"', () => {
    const r: Pick<Race, 'id' | 'candidatos'> = {
      id: 'pres-t1',
      candidatos: [cand(13, 'a'), cand(22, 'b'), cand(0, 'outros', { agregado: true })],
    };
    const x = aplicarCores(r);
    expect(x.candidatos.map((c) => c.cor)).toEqual(['vermelho', 'azul', 'outros']);
    expect(r.candidatos[0].cor).toBe('a'); // não muta a entrada
    expect(aplicarCores(x)).toEqual(x);
    const gov = aplicarCores({ id: 'gov-rj', candidatos: [cand(22, 'vermelho'), cand(55, 'azul')] });
    expect(gov.candidatos.map((c) => c.cor)).toEqual(['a', 'b']);
  });

  it('neutralizarCores: vermelho/azul → a/b pela ordem (o "Outros" continua cinza)', () => {
    const n = neutralizarCores([cand(13, 'vermelho'), cand(22, 'azul'), cand(0, 'outros', { agregado: true })]);
    expect(n.map((c) => c.cor)).toEqual(['a', 'b', 'outros']);
  });

  it('meta.json (gerado por scripts/data/build-data.ts) já sai com as cores da fonte única', () => {
    for (const r of meta.races) {
      expect(aplicarCores(r).candidatos.map((c) => c.cor), r.id).toEqual(r.candidatos.map((c) => c.cor));
      const reais = r.candidatos.filter((c) => !c.agregado);
      if (r.id === 'pres' || r.id === 'pres-t1') {
        expect(reais.map((c) => [c.numero, c.cor]), r.id).toEqual([
          [13, 'vermelho'],
          [22, 'azul'],
        ]);
      } else {
        expect(reais.map((c) => c.cor), r.id).toEqual(['a', 'b']);
      }
    }
  });

  it('texto da regra cita as duas cores de identificação e as neutras, com o mesmo peso', () => {
    expect(REGRA_CORES).toContain('Lula em vermelho');
    expect(REGRA_CORES).toContain('Flávio Bolsonaro em azul');
    expect(REGRA_CORES).toContain('turquesa e âmbar');
  });
});
