/**
 * Simulação com nomes ocultos: "Candidato A/B" E cores neutras — vermelho/azul ao lado de "Candidato A" diriam
 * quem é quem. Rótulos, número e cor saem da POSIÇÃO na urna, nunca da cor.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatasetMeta } from './dataset';
import { PARTIDO_OCULTO, anonimizarRace, anonimizarTexto, partidoENumero } from './anon';

const meta = JSON.parse(readFileSync(path.resolve(__dirname, '../../public/data/meta.json'), 'utf8')) as DatasetMeta;
const race = (id: string) => meta.races.find((r) => r.id === id)!;

describe('anonimizarRace', () => {
  it('Presidente: vermelho/azul viram turquesa/âmbar (a/b) pela ordem da urna, sem nada que identifique', () => {
    const real = race('pres');
    expect(real.candidatos.map((c) => c.cor)).toEqual(['vermelho', 'azul']);
    const a = anonimizarRace(real);
    expect(a.candidatos.map((c) => c.cor)).toEqual(['a', 'b']);
    expect(a.candidatos.map((c) => c.nomeUrna)).toEqual(['Candidato A', 'Candidato B']);
    expect(a.candidatos.map((c) => c.numero)).toEqual([1, 2]);
    for (const c of a.candidatos) {
      expect(c.partido).toBe('Simulação');
      expect(c.sqcand).toBeUndefined();
      expect(c.fotoGrupo).toBeUndefined();
      expect(c.vice).toBeUndefined();
    }
    const txt = JSON.stringify(a);
    expect(txt).not.toMatch(/vermelho|azul|Lula|Bolsonaro/);
  });

  it('1º turno: o "Outros" fica intacto; idempotente', () => {
    const a = anonimizarRace(race('pres-t1'));
    expect(a.candidatos.map((c) => c.cor)).toEqual(['a', 'b', 'outros']);
    expect(a.candidatos[2].nomeUrna).toBe('Outros');
    expect(anonimizarRace(a)).toEqual(a);
  });

  it('1º turno oficial com nomes ocultos: partido "nome oculto" (nunca "Simulação"), sem número fictício na linha', () => {
    for (const r of meta.races.filter((x) => x.turno === 1)) {
      const a = anonimizarRace(r).candidatos.filter((c) => !c.agregado);
      expect(a.map((c) => c.partido)).toEqual([PARTIDO_OCULTO, PARTIDO_OCULTO]);
      expect(a.map(partidoENumero)).toEqual(['nome oculto', 'nome oculto']);
      expect(JSON.stringify(a)).not.toMatch(/Simulação|simulação/);
    }
    // 2º turno simulado continua "Simulação · 1"; nomes reais, "PT · 13"
    expect(anonimizarRace(race('pres')).candidatos.map(partidoENumero)).toEqual(['Simulação · 1', 'Simulação · 2']);
    expect(race('pres').candidatos.map(partidoENumero)).toEqual(['PT · 13', 'PL · 22']);
  });

  it('governador continua a/b (já eram neutras)', () => {
    for (const r of meta.races.filter((x) => x.cargo === 'Governador')) {
      expect(anonimizarRace(r).candidatos.filter((c) => !c.agregado).map((c) => c.cor)).toEqual(['a', 'b']);
    }
  });
});

describe('anonimizarTexto', () => {
  it('troca os nomes pela posição (nunca "Candidato undefined" com as cores de identificação)', () => {
    const t = anonimizarTexto('Com 63,2% das seções, Flávio Bolsonaro passa à frente de Lula', meta.races);
    expect(t).toBe('Com 63,2% das seções, Candidato B passa à frente de Candidato A');
    expect(t).not.toContain('undefined');
  });
});
