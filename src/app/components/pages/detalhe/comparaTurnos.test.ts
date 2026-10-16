import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Race } from '@/shared/types';
import { pctValidos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { ComparaTurnos, tallyT1 } from './ComparaTurnos';

const cand = (numero: number, nomeUrna: string, cor: string, agregado = false) => ({ numero, nomeUrna, nome: nomeUrna, partido: 'X', cor, agregado });
const race2 = { id: 'pres', turno: 2, candidatos: [cand(13, 'Candidato A', 'a'), cand(22, 'Candidato B', 'b')] } as unknown as Race;
const race1 = { id: 'pres-t1', turno: 1, candidatos: [cand(13, 'Candidato A', 'a'), cand(22, 'Candidato B', 'b'), cand(0, 'Demais', 'outros', true)] } as unknown as Race;
const t1 = { votos: [466, 421, 113], brancos: 10, nulos: 20, comparecimento: 1030, eleitorado: 1300 };
const t2 = { votos: [526, 474], brancos: 10, nulos: 20, comparecimento: 1030, eleitorado: 1300, secoes: 1, secoesTotalizadas: 1, eleitoradoTotalizado: 1300, abstencao: 270 } as never;

describe('ComparaTurnos na simulação com nomes ocultos', () => {
  it('não mostra nenhum % oficial do 1º turno (identificaria o Candidato A): só o aviso', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ComparaTurnos, { race: race2, raceT1: race1, t1, t2, compacto: true, anonimizado: true })),
    );
    const pctA = fmtPct(pctValidos(tallyT1(t1) as never, 0), 1); // "46,6%" — o número que entregaria quem é quem
    expect(html).toContain('1º turno × 2º turno');
    expect(html).toContain('Candidato A');
    expect(html).not.toContain(pctA.replace('%', ''));
    expect(html).toMatch(/oculta na simulação/);
  });
});
