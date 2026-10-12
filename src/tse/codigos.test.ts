/**
 * Conferência dos códigos do feed (TseSource.conferirCodigos) contra o `ele-c.json`: pleito, eleições de 2º turno,
 * `cdt2` (ligação 1º → 2º turno do próprio TSE) e UFs de Governador com 2º turno. Sem rede (configuração sintética no
 * formato real de 12/10/2026).
 */
import { describe, expect, it } from 'vitest';
import type { Race, TseConfig } from '../shared/types';
import type { TseConfigGeralArquivo } from './feed';
import { TseSource } from './source';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const CFG: TseConfig = {
  baseUrl: 'https://resultados.tse.jus.br/oficial',
  ciclo: 'ele2026',
  eleicaoPres: '6258',
  eleicaoGov: '6260',
  pleito: '3221',
  intervaloSeg: 15,
};
const abr = (ufs: string[], cargo: string) => ufs.map((cd) => ({ cd, cp: [{ cd: cargo, ds: '' }] }));
const ELE_C = (govUfs: string[]): TseConfigGeralArquivo => ({
  dg: '10/10/2026',
  hg: '17:29:51',
  pl: [
    {
      cd: '3220',
      c: 'ele2026',
      dt: '04/10/2026',
      e: [
        { cd: '6257', cdt2: '6258', nm: 'Federal 1º Turno', t: '1', tp: '8', abr: abr(['br'], '1') },
        { cd: '6259', cdt2: '6260', nm: 'Estadual 1º Turno', t: '1', tp: '1', abr: abr(['br'], '3') },
      ],
    },
    {
      cd: '3221',
      c: 'ele2026',
      dt: '25/10/2026',
      e: [
        { cd: '6260', nm: 'Estadual 2º Turno', t: '2', tp: '1', abr: abr(govUfs, '3') },
        { cd: '6258', nm: 'Federal 2º Turno', t: '2', tp: '8', abr: abr(['br'], '1') },
      ],
    },
  ],
});
const fonte = (c: Partial<TseConfig> = {}) => new TseSource({ config: { ...CFG, ...c }, races, fetch: async () => new Response(null, { status: 404 }) });
const govDataset = races.filter((r) => r.turno === 2 && r.cargo !== 'Presidente').flatMap((r) => r.ufs.map((u) => u.toLowerCase()));

describe('conferirCodigos', () => {
  it('códigos certos e o mesmo quadro de Governador → sem avisos; esperado vem do cdt2', () => {
    const r = fonte().conferirCodigos(ELE_C(govDataset));
    expect(r.avisos).toEqual([]);
    expect(r.esperado).toEqual({ pleito: '3221', eleicaoPres: '6258', eleicaoGov: '6260' });
  });

  it('UFs de Governador sem arquivo no TSE (ex.: RJ e TO em 12/10/2026) → aviso com a lista', () => {
    const r = fonte().conferirCodigos(ELE_C(['am', 'rn', 'df', 'es', 'ac']));
    expect(r.ufsGovTse).toEqual(['AC', 'AM', 'DF', 'ES', 'RN']);
    const faltam = govDataset.map((u) => u.toUpperCase()).filter((u) => !['AC', 'AM', 'DF', 'ES', 'RN'].includes(u));
    if (faltam.length) expect(r.avisos.join(' ')).toContain(`sem arquivo no TSE: ${faltam.sort().join(', ')}`);
  });

  it('código errado, pleito errado e ensaio com o 1º turno → avisos explicativos', () => {
    expect(fonte({ eleicaoPres: '6290' }).conferirCodigos(ELE_C(govDataset)).avisos[0]).toMatch(/6290 \(Presidente\) não está no pleito 3221 .*6258/);
    expect(fonte({ pleito: '3299' }).conferirCodigos(ELE_C(govDataset)).avisos[0]).toMatch(/pleito 3299 não aparece .*3221/);
    const ensaio = fonte({ eleicaoPres: '6257', eleicaoGov: '6259', pleito: '3220' }).conferirCodigos(ELE_C(govDataset));
    expect(ensaio.avisos.some((a) => /6257 \(Presidente\) é de 1º turno/.test(a))).toBe(true);
  });
});
