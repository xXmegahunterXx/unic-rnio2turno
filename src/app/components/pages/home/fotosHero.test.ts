/**
 * Hero com fotos (Home e topo da apuração): as regras de foto são as de `useFotosRace` (nunca na simulação
 * anonimizada, nunca ao lado de número simulado, espera o status), o pacote em resolução original traz só os dois
 * finalistas, com o mesmo tamanho, e os números do 1º turno fecham com os totais oficiais.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatasetMeta, FotoPacote } from '@/shared/dataset';
import type { Fase, FonteDados, Race } from '@/shared/types';
import { pctValidos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { anonimizarRace } from '@/shared/anon';
import { GRUPO_FOTOS_HD, regraFotos } from './fotosHero';
import { votosPrimeiroTurno } from './confronto';

const raiz = resolve(__dirname, '../../../../..');
const meta = JSON.parse(readFileSync(resolve(raiz, 'public/data/meta.json'), 'utf8')) as DatasetMeta;
const corrida = (id: string) => meta.races.find((r) => r.id === id) as Race;
const pres = corrida('pres');
const presT1 = corrida('pres-t1');

const st = (fonte: FonteDados, fase: Fase, anonimizado = false) => ({ simulacao: fonte === 'simulacao', fase, anonimizado });

describe('regraFotos (mesma regra de useFotosRace)', () => {
  it('espera o status e a corrida antes de decidir (sem rosto por um instante ao lado de número fictício)', () => {
    expect(regraFotos(undefined, pres)).toBe('esperar');
    expect(regraFotos(st('pre', 'pre'), undefined)).toBe('esperar');
  });

  it('simulação com nomes ocultos: nunca foto', () => {
    expect(regraFotos(st('simulacao', 'pre', true), presT1)).toBe('bloqueada');
    expect(regraFotos(st('simulacao', 'apurando', true), pres)).toBe('bloqueada');
  });

  it('números simulados do 2º turno: nunca foto, mesmo com os nomes reais ligados', () => {
    expect(regraFotos(st('simulacao', 'apurando'), pres)).toBe('bloqueada');
    expect(regraFotos(st('simulacao', 'encerrada'), pres)).toBe('bloqueada');
  });

  it("1º turno oficial, fase 'pre' e fonte 'tse': foto liberada", () => {
    expect(regraFotos(st('pre', 'pre'), presT1)).toBe('liberada');
    expect(regraFotos(st('simulacao', 'apurando'), presT1)).toBe('liberada');
    expect(regraFotos(st('tse', 'apurando'), pres)).toBe('liberada');
    expect(regraFotos(st('tse', 'encerrada'), pres)).toBe('liberada');
  });

  it('`real` libera com nomes ocultos; `desligado` sempre bloqueia', () => {
    expect(regraFotos(st('simulacao', 'apurando', true), presT1, { real: true })).toBe('liberada');
    expect(regraFotos(st('tse', 'apurando'), pres, { desligado: true })).toBe('bloqueada');
  });
});

describe('pacote presidente-hd', () => {
  const pacote = JSON.parse(readFileSync(resolve(raiz, `public/data/fotos/${GRUPO_FOTOS_HD}.json`), 'utf8')) as FotoPacote;

  /** Largura × altura de um JPEG (marcador SOF0/SOF2). */
  function dimensoesJpeg(dataUri: string): [number, number] {
    const b = Buffer.from(dataUri.split(',')[1], 'base64');
    expect(b.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    let i = 2;
    while (i < b.length) {
      const m = b[i + 1];
      if (m === 0xc0 || m === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
    throw new Error('JPEG sem SOF');
  }

  it('tem exatamente os dois finalistas a Presidente (sem vices), em JPEG', () => {
    expect(pacote.grupo).toBe(GRUPO_FOTOS_HD);
    const esperados = pres.candidatos.map((c) => c.sqcand).sort();
    expect(Object.keys(pacote.fotos).sort()).toEqual(esperados);
    for (const uri of Object.values(pacote.fotos)) expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('mesmo tamanho para os dois, maior que o pacote normal (120×160) e leve', () => {
    const dims = Object.values(pacote.fotos).map(dimensoesJpeg);
    expect(dims[0]).toEqual(dims[1]);
    expect(dims[0][0]).toBeGreaterThan(120);
    expect(JSON.stringify(pacote).length).toBeLessThan(40_000);
  });

  it('a corrida anonimizada não aponta para foto nenhuma', () => {
    for (const c of anonimizarRace(pres).candidatos) {
      expect(c.sqcand).toBeUndefined();
      expect(c.fotoGrupo).toBeUndefined();
    }
  });
});

describe('votosPrimeiroTurno (resultado oficial no cartão)', () => {
  it('os três (finalistas + Outros) somam os votos válidos oficiais e dão os % do TSE', () => {
    const v = votosPrimeiroTurno(presT1)!;
    expect(v).toHaveLength(3);
    expect(v.reduce((a, b) => a + b, 0)).toBe(meta.totaisPrimeiroTurno.validos);
    const lula = presT1.candidatos.findIndex((c) => c.numero === 13);
    const flavio = presT1.candidatos.findIndex((c) => c.numero === 22);
    expect(fmtPct(pctValidos({ votos: v }, lula))).toBe('45,16%');
    expect(fmtPct(pctValidos({ votos: v }, flavio))).toBe('47,03%');
  });

  it('ordem da urna: 13 à esquerda, 22 à direita', () => {
    const fin = presT1.candidatos.filter((c) => !c.agregado).map((c) => c.numero);
    expect(fin).toEqual([13, 22]);
  });

  it('sem o número de algum candidato, não inventa', () => {
    const r = { candidatos: presT1.candidatos.map((c, i) => (i === 0 ? { ...c, primeiroTurno: undefined } : c)) };
    expect(votosPrimeiroTurno(r)).toBeUndefined();
    expect(votosPrimeiroTurno(undefined)).toBeUndefined();
  });
});
