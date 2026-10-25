import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtPct } from '@/shared/format';
import { historico2022De, type Historico2022Arquivo } from './historico2022';

const arquivo = JSON.parse(
  readFileSync(new URL('../../../../../public/data/historico/presidente-2022-t2.json', import.meta.url), 'utf8'),
) as Historico2022Arquivo;

describe('historico2022De (2º turno de 2022, Presidente)', () => {
  it('ordena pelo número na urna (13 antes de 22) e usa os nomes e partidos do arquivo', () => {
    const h = historico2022De(arquivo, 'SP')!;
    expect(h.linhas.map((l) => [l.numero, l.nome, l.partido])).toEqual([
      [13, 'Lula', 'PT'],
      [22, 'Jair Bolsonaro', 'PL'],
    ]);
  });

  it('Brasil (com o exterior): totais oficiais do TSE', () => {
    const h = historico2022De(arquivo, 'BR')!;
    expect(h.linhas.map((l) => l.votos)).toEqual([60345999, 58206354]);
    expect(h.validos).toBe(118552353);
    expect(h.linhas.map((l) => fmtPct(l.pct))).toEqual(['50,90%', '49,10%']);
  });

  it('em todas as UFs e no exterior, o % calculado dos votos bate com o % publicado e soma 100', () => {
    const ufs = Object.keys(UF_NOMES) as UF[];
    expect(ufs).toHaveLength(28); // 26 estados, DF e exterior
    for (const uf of ufs) {
      const h = historico2022De(arquivo, uf);
      expect(h, uf).not.toBeNull();
      const publicado = arquivo.porUf[uf]!;
      for (const l of h!.linhas) expect(l.pct, `${uf} ${l.numero}`).toBeCloseTo(publicado[String(l.numero)].pct!, 2);
      expect(h!.linhas[0].pct + h!.linhas[1].pct).toBeCloseTo(100, 9);
    }
  });

  it('exemplos formatados (SE, SP, exterior)', () => {
    expect(historico2022De(arquivo, 'SE')!.linhas.map((l) => fmtPct(l.pct))).toEqual(['67,21%', '32,79%']);
    expect(historico2022De(arquivo, 'SP')!.linhas.map((l) => fmtPct(l.pct))).toEqual(['44,76%', '55,24%']);
    expect(historico2022De(arquivo, 'ZZ')!.linhas.map((l) => fmtPct(l.pct))).toEqual(['51,28%', '48,72%']);
  });

  it('arquivo ausente, malformado ou sem a abrangência → null (o bloco não aparece)', () => {
    expect(historico2022De(undefined, 'SP')).toBeNull();
    expect(historico2022De(null, 'BR')).toBeNull();
    expect(historico2022De({} as Historico2022Arquivo, 'SP')).toBeNull();
    expect(historico2022De({ ...arquivo, porUf: {} }, 'SP')).toBeNull();
    expect(historico2022De({ ...arquivo, porUf: { SP: { '13': { votos: 10 } } } }, 'SP')).toBeNull();
    expect(historico2022De({ ...arquivo, porUf: { SP: { '13': { votos: 0 }, '22': { votos: 0 } } } }, 'SP')).toBeNull();
    expect(historico2022De({ ...arquivo, porUf: { SP: { '13': { votos: Number.NaN }, '22': { votos: 5 } } } }, 'SP')).toBeNull();
  });
});
