/** Contas do relatório do ensaio pela borda (scripts/ensaio-borda.ts): HIT da API pública, percentis e aprovação. */
import { describe, expect, it } from 'vitest';
import { API_PUBLICA, LIMITES, avaliar, contagemVazia, foiAOrigem, percentil, resumir, somar } from './ensaio-borda';

const hist = (ms: number, n: number) => {
  const h = new Array<number>(30_901).fill(0);
  h[ms < 100 ? Math.floor(ms * 10) : 1000 + Math.floor(ms - 100)] = n;
  return h;
};

describe('ensaio-borda: relatório', () => {
  it('HIT da API pública conta só HIT/UPDATING dos grupos da API (presença e HTML fora)', () => {
    const c = contagemVazia();
    c.porGrupo = { status: { HIT: 90, UPDATING: 6, EXPIRED: 4 }, uf: { HIT: 100 }, presenca: { DYNAMIC: 50 }, html: { DYNAMIC: 10 } };
    c.codigos = { '200': 250, '204': 10 };
    c.hist = { status: hist(5, 100), uf: hist(8, 100) };
    const r = resumir(c);
    expect(r.total).toBe(260);
    expect(r.hitApi).toBeCloseTo(196 / 200);
    expect(r.porStatus).toMatchObject({ HIT: 190, UPDATING: 6, EXPIRED: 4, DYNAMIC: 60 });
    expect(r.p.status.p95).toBeCloseTo(5.05, 1);
    expect(r.p95Api).toBeLessThan(10);
    expect(API_PUBLICA).not.toContain('presenca');
  });

  it('aprovação: origem < 300 req/s, ≥ 95% HIT/UPDATING, p95 < 300 ms e zero 5xx', () => {
    const c = contagemVazia();
    c.porGrupo = { status: { HIT: 99, EXPIRED: 1 } };
    c.codigos = { '200': 100 };
    c.hist = { status: hist(20, 100) };
    const r = resumir(c);
    expect(avaliar(r, 120).every((x) => x.ok)).toBe(true);
    expect(avaliar(r, LIMITES.origemReqS).find((x) => x.criterio.startsWith('origem'))?.ok).toBe(false);
    expect(avaliar(r, null).find((x) => x.criterio.startsWith('origem'))?.ok).toBe(false); // sem medida não aprova
    const ruim = contagemVazia();
    ruim.porGrupo = { status: { HIT: 90, MISS: 10 } };
    ruim.codigos = { '200': 99, '502': 1 };
    ruim.hist = { status: hist(450, 100) };
    const rr = resumir(ruim);
    expect(rr.erros5xx).toBe(1);
    expect(avaliar(rr, 10).filter((x) => !x.ok).map((x) => x.criterio)).toHaveLength(3);
  });

  it('origem: só o que não saiu da cópia; somar junta os processos; percentil vazio é 0', () => {
    expect(['HIT', 'UPDATING', 'STALE'].map(foiAOrigem)).toEqual([false, false, false]);
    expect(['MISS', 'EXPIRED', 'REVALIDATED', 'BYPASS', 'DYNAMIC', '—'].every(foiAOrigem)).toBe(true);
    const a = contagemVazia();
    a.porGrupo = { status: { HIT: 1 } };
    a.codigos = { '200': 1 };
    a.hist = { status: hist(1, 1) };
    const b = contagemVazia();
    b.porGrupo = { status: { HIT: 2, MISS: 1 } };
    b.codigos = { '200': 3, 'erro:ECONNRESET': 1 };
    b.hist = { status: hist(1, 3) };
    const s = somar(a, b);
    expect(s.porGrupo.status).toEqual({ HIT: 3, MISS: 1 });
    expect(resumir(s).errosRede).toBe(1);
    expect(percentil([0, 0, 0], 0.5)).toBe(0);
  });
});
