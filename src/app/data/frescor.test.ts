/**
 * Frescor (fonte 'tse'): marcas do status, reconsulta só quando a marca muda e `?d=<marca>` no placar nacional.
 */
import { describe, expect, it } from 'vitest';
import type { LiveStatus } from '@/shared/types';
import { marcasDoStatus, marcasQueMudaram, queryMarca } from './frescor';
import { createHttpClient } from './http';

const st = (marcas: Record<string, string> | null, extra: Partial<LiveStatus> = {}) =>
  ({
    fonte: 'tse',
    versao: 7,
    ...(marcas ? { frescor: Object.fromEntries(Object.entries(marcas).map(([r, m]) => [r, { marca: m, conferidoEm: 1 }])) } : {}),
    ...extra,
  }) as unknown as LiveStatus;

describe('marcas do status', () => {
  it('lê só marcas válidas; sem frescor = vazio', () => {
    expect(marcasDoStatus(st({ pres: 'abc', 'gov-df': 'x1' }))).toEqual({ pres: 'abc', 'gov-df': 'x1' });
    expect(marcasDoStatus(st(null))).toEqual({});
    expect(marcasDoStatus(undefined)).toEqual({});
    expect(marcasDoStatus(st({ pres: '' }))).toEqual({});
    expect(marcasDoStatus(st({ pres: 'x'.repeat(40) }))).toEqual({});
  });

  it('reconsulta só quando a marca MUDA (a 1ª vista não conta; repetir não conta)', () => {
    const vistas = new Map<string, string>();
    expect(marcasQueMudaram(vistas, st({ pres: 'a', 'gov-df': 'g' }))).toEqual([]);
    expect(marcasQueMudaram(vistas, st({ pres: 'a', 'gov-df': 'g' }))).toEqual([]);
    expect(marcasQueMudaram(vistas, st({ pres: 'b', 'gov-df': 'g' }))).toEqual(['pres']);
    expect(marcasQueMudaram(vistas, st({ pres: 'b', 'gov-df': 'h' }))).toEqual(['gov-df']);
    // status sem frescor (outra fonte) não dispara nada
    expect(marcasQueMudaram(vistas, st(null))).toEqual([]);
  });

  it('queryMarca', () => {
    expect(queryMarca(undefined)).toBe('');
    expect(queryMarca('k3f9')).toBe('?d=k3f9');
  });
});

describe('cliente HTTP com a marca no placar nacional', () => {
  it('?d=<marca> no placar ao vivo da disputa; ?t= (reveja a noite) sem marca; outras rotas sem marca', async () => {
    const urls: string[] = [];
    let status = st({ pres: 'm1' });
    const f = (async (input: string) => {
      urls.push(String(input));
      const corpo = String(input).endsWith('/status') ? status : { race: 'pres' };
      return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const c = createHttpClient({ fetch: f });
    await c.nacional('pres');
    expect(urls.at(-1)).toBe('/api/apuracao/pres/br'); // sem status ainda
    await c.status();
    await c.nacional('PRES');
    expect(urls.at(-1)).toBe('/api/apuracao/pres/br?d=m1');
    await c.nacional('gov-df');
    expect(urls.at(-1)).toBe('/api/apuracao/gov-df/br'); // disputa sem marca no status
    await c.nacional('pres', { t: 1_792_960_000_123 });
    expect(urls.at(-1)).toBe('/api/apuracao/pres/br?t=1792960000000&v=7');
    await c.uf('pres', 'SP');
    expect(urls.at(-1)).toBe('/api/apuracao/pres/uf/sp');
    status = st({ pres: 'm2' });
    await c.status();
    await c.nacional('pres');
    expect(urls.at(-1)).toBe('/api/apuracao/pres/br?d=m2');
    // fonte trocada (sem frescor): volta ao endereço simples
    status = st(null, { fonte: 'simulacao' });
    await c.status();
    await c.nacional('pres');
    expect(urls.at(-1)).toBe('/api/apuracao/pres/br');
  });
});
