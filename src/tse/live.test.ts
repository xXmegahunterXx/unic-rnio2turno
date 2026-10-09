/**
 * Teste "ao vivo" contra o feed REAL do TSE. Pulado por padrão; rode com:
 *   TSE_LIVE=1 npx vitest run src/tse/live.test.ts
 * Confere o 1º turno de 2026 (dados finais) e a disponibilidade do 2º turno.
 */
import { describe, expect, it } from 'vitest';
import type { Race, TseConfig } from '../shared/types';
import { TseSource } from './source';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const CONFIG: TseConfig = {
  baseUrl: 'https://resultados.tse.jus.br/oficial',
  ciclo: 'ele2026',
  eleicaoPres: '6258',
  eleicaoGov: '6260',
  pleito: '3221',
  intervaloSeg: 15,
};
const live = !!process.env.TSE_LIVE;
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

async function ocioso(src: TseSource, maxMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const h = src.health();
    if (h.municipios.fila === 0 && h.municipios.baixando === 0 && h.http.emVoo === 0 && h.http.naFila === 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('fila não esvaziou');
}

describe.skipIf(!live)('feed real do TSE (TSE_LIVE=1)', () => {
  const src = new TseSource({ config: CONFIG, races, log: (m) => console.log(m) });

  it('testar() e 2º turno publicado', async () => {
    const t = await src.testar();
    console.log(t.detalhe);
    expect(t.ok).toBe(true);
    const n = await src.nacional('pres');
    expect(n.race).toBe('pres');
    expect(n.resumo.secoes).toBeGreaterThan(0);
  });

  it('Brasil 1º turno: totais oficiais', async () => {
    const n = await src.nacional('pres-t1');
    expect(n.resumo.votos.slice(0, 2)).toEqual([53_879_538, 56_104_503]);
    expect(n.resumo.secoes).toBe(499_248);
    // soma das UFs + ZZ = Brasil
    const ufs = Object.values(n.ufs);
    expect(ufs).toHaveLength(28);
    expect(soma(ufs.map((u) => u!.votos[0]))).toBe(53_879_538);
    expect(soma(ufs.map((u) => u!.secoes))).toBe(499_248);
  });

  it('Roraima: soma dos municípios = UF', async () => {
    await src.uf('pres-t1', 'RR');
    await ocioso(src);
    const u = await src.uf('pres-t1', 'RR');
    expect(u.municipios).toHaveLength(15);
    for (let i = 0; i < 3; i++) expect(soma(u.municipios.map((m) => m.votos[i]))).toBe(u.resumo.votos[i]);
    expect(soma(u.municipios.map((m) => m.secoes))).toBe(u.resumo.secoes);
  });

  it('São Paulo capital: soma das zonas = município; mosaico do cs real', async () => {
    const m = await src.municipio('pres-t1', 'SP', '71072');
    expect(m.zonas.length).toBeGreaterThan(50);
    for (let i = 0; i < 3; i++) expect(soma(m.zonas.map((z) => z.votos[i]))).toBe(m.resumo.votos[i]);
    expect(m.mosaico.length).toBe(m.zonas.length);
    const nSecoes = soma(m.mosaico.map((z) => z.estado.length));
    expect(nSecoes).toBe(m.resumo.secoes);
    expect(m.mosaico.every((z) => /^t+$/.test(z.estado))).toBe(true);
  });

  it('boletins de urna de 3 seções reais fecham com o comparecimento', async () => {
    for (const [uf, cod, z, s] of [
      ['AC', '01066', 4, 77],
      ['SP', '71072', 1, 1],
      ['ZZ', '29459', 1, 1695],
    ] as const) {
      const d = await src.secao('pres-t1', uf, cod, z, s);
      expect(d?.totalizada).toBe(true);
      expect(soma(d!.votos) + d!.brancos + d!.nulos).toBe(d!.comparecimento);
    }
  });
});
