import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVISO_CENARIO,
  arredondarComSoma,
  MAX_CODIGO,
  PRESETS,
  base64UrlParaBytes,
  bytesParaBase64Url,
  calcularCenario,
  cenarioDoPreset,
  cenarioInicial,
  cenariosIguais,
  codificarCenario,
  decodificarCenario,
  definirTodos,
  eliminadosDe,
  eliminadosUniformes,
  estadosTexto,
  finalistasDe,
  lerCodigoCenario,
  mediaEliminados,
  nomeCurto,
  normalizarCenario,
  normalizarDelta,
  partesDivisao,
  partesPct,
  pctAbstencaoArea,
  pctComparecimentoArea,
  pctFinalista,
  placarCenarioTexto,
  premissasCenario,
  presetDoCenario,
  proporcaoFinalistasT1,
  rotaCenario,
  textoPartes,
  vencedorArea,
  type Cenario,
  type Divisao,
  type PresidenteT1Dataset,
} from './cenarios';
import type { DatasetMeta } from './dataset';

const DATA = path.resolve(__dirname, '../../public/data');
const ds = JSON.parse(readFileSync(path.join(DATA, 'presidente-t1.json'), 'utf8')) as PresidenteT1Dataset;
const meta = JSON.parse(readFileSync(path.join(DATA, 'meta.json'), 'utf8')) as DatasetMeta;

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r100 = (r: () => number) => Math.floor(r() * 101);
const divAleatoria = (r: () => number): Divisao => ({ escolhe: r100(r), paraA: r100(r), brancoNulo: r100(r) });
function cenarioAleatorio(seed: number): Cenario {
  const r = rng(seed);
  const eliminados: Record<string, Divisao> = {};
  for (const c of eliminadosDe(ds)) eliminados[String(c.numero)] = divAleatoria(r);
  return {
    eliminados,
    brancosNulosT1: divAleatoria(r),
    comparecimento: { delta: Math.round((r() * 20 - 10) * 2) / 2, paraA: r100(r) },
  };
}

const { a: A, b: B, ia, ib } = finalistasDe(ds);
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// =============================================================================================
describe('dataset presidente-t1.json', () => {
  it('tem os 12 candidatos, finalistas a < b e os totais oficiais', () => {
    expect(ds.candidatos).toHaveLength(12);
    expect(ds.finalistas[0]).toBeLessThan(ds.finalistas[1]);
    expect(ds.ufs).toHaveLength(28);
    expect(ds.ufs.at(-1)?.uf).toBe('ZZ');
    const t = meta.totaisPrimeiroTurno;
    expect(soma(ds.ufs.map((u) => u.eleitorado))).toBe(t.eleitorado);
    expect(soma(ds.ufs.map((u) => u.comparecimento))).toBe(t.comparecimento);
    expect(soma(ds.ufs.map((u) => u.brancos))).toBe(t.brancos);
    expect(soma(ds.ufs.map((u) => u.nulos))).toBe(t.nulos);
    expect(soma(ds.ufs.flatMap((u) => u.votos))).toBe(t.validos);
    expect(ds.totais).toMatchObject(t);
  });

  it('votos por candidato = soma das UFs; finalistas = race pres-t1', () => {
    ds.candidatos.forEach((c, i) => expect(soma(ds.ufs.map((u) => u.votos[i]))).toBe(c.votos));
    const race = meta.races.find((r) => r.id === 'pres-t1')!;
    for (const c of race.candidatos.filter((x) => !x.agregado)) {
      const d = ds.candidatos.find((x) => x.numero === c.numero)!;
      expect(d.finalista).toBe(true);
      expect(d.votos).toBe(c.primeiroTurno?.votos);
      expect(d.nomeUrna).toBe(c.nomeUrna);
    }
    const outros = race.candidatos.find((x) => x.agregado)!;
    expect(soma(eliminadosDe(ds).map((c) => c.votos))).toBe(outros.primeiroTurno?.votos);
  });

  it('comparecimento = válidos + brancos + nulos em cada UF', () => {
    for (const u of ds.ufs) expect(soma(u.votos) + u.brancos + u.nulos).toBe(u.comparecimento);
  });

  it('candidatos ordenados por votos e eliminados = 10', () => {
    for (let i = 1; i < ds.candidatos.length; i++) expect(ds.candidatos[i - 1].votos).toBeGreaterThanOrEqual(ds.candidatos[i].votos);
    expect(eliminadosDe(ds)).toHaveLength(10);
    expect(eliminadosDe(ds).some((c) => c.finalista)).toBe(false);
  });
});

// =============================================================================================
describe('divisão', () => {
  it('as quatro partes somam 100% para qualquer combinação', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const p = partesDivisao(divAleatoria(r));
      expect(p.a + p.b + p.bn + p.abs).toBeCloseTo(1, 12);
      for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0);
      const q = partesPct(p);
      expect(q.a + q.b + q.bn + q.abs).toBe(100);
    }
  });

  it('bordas', () => {
    expect(partesDivisao({ escolhe: 100, paraA: 100, brancoNulo: 0 })).toEqual({ a: 1, b: 0, bn: 0, abs: 0 });
    expect(partesDivisao({ escolhe: 0, paraA: 30, brancoNulo: 100 })).toEqual({ a: 0, b: 0, bn: 1, abs: 0 });
    expect(partesDivisao({ escolhe: 0, paraA: 30, brancoNulo: 0 })).toEqual({ a: 0, b: 0, bn: 0, abs: 1 });
    expect(partesPct({ a: 1 / 3, b: 1 / 3, bn: 1 / 3, abs: 0 })).toEqual({ a: 34, b: 33, bn: 33, abs: 0 });
    expect(partesPct({ a: 0, b: 0, bn: 0, abs: 0 })).toEqual({ a: 0, b: 0, bn: 0, abs: 100 });
  });

  it('textoPartes mantém A antes de B e omite zeros de branco/abstenção', () => {
    const t = textoPartes(partesDivisao({ escolhe: 100, paraA: 49, brancoNulo: 100 }), { a: 'Lula', b: 'Flávio Bolsonaro' });
    expect(t).toBe('49% Lula · 51% Flávio Bolsonaro');
    const t2 = textoPartes(partesDivisao({ escolhe: 50, paraA: 0, brancoNulo: 50 }), { a: 'A', b: 'B' });
    expect(t2).toBe('0% A · 50% B · 25% branco/nulo · 25% não vota');
  });
});

// =============================================================================================
describe('presets', () => {
  it('proporcional usa a proporção dos finalistas no 1º turno', () => {
    const prop = proporcaoFinalistasT1(ds);
    expect(prop).toBeCloseTo((A.votos / (A.votos + B.votos)) * 100, 10);
    const c = cenarioDoPreset('proporcional', ds);
    for (const d of Object.values(c.eliminados)) expect(d).toEqual({ escolhe: 100, paraA: Math.round(prop), brancoNulo: 100 });
    expect(Object.keys(c.eliminados)).toHaveLength(10);
  });

  it('presetDoCenario reconhece cada preset e o cenário ajustado', () => {
    for (const p of PRESETS) expect(presetDoCenario(cenarioDoPreset(p.id, ds), ds)).toBe(p.id);
    const c = cenarioDoPreset('metade', ds);
    c.eliminados['70'] = { ...c.eliminados['70'], paraA: 60 };
    expect(presetDoCenario(c, ds)).toBeNull();
    // paraA do comparecimento sem variação não conta
    const d = cenarioDoPreset('metade', ds);
    d.comparecimento.paraA = 90;
    expect(presetDoCenario(d, ds)).toBe('metade');
  });

  it('cenário inicial = proporcional', () => {
    expect(presetDoCenario(cenarioInicial(ds), ds)).toBe('proporcional');
  });
});

// =============================================================================================
describe('calcularCenario', () => {
  it('"todos votam branco/nulo" reproduz os votos dos finalistas no 1º turno, UF a UF', () => {
    const r = calcularCenario(ds, cenarioDoPreset('branco', ds));
    r.ufs.forEach((u, i) => {
      const o = ds.ufs[i];
      expect(u.votos).toEqual([o.votos[ia], o.votos[ib]]);
      expect(u.comparecimento).toBe(o.comparecimento);
      expect(u.brancosNulos).toBe(o.comparecimento - o.votos[ia] - o.votos[ib]);
    });
    expect(r.brasil.votos).toEqual([A.votos, B.votos]);
    expect(r.brasil.comparecimento).toBe(meta.totaisPrimeiroTurno.comparecimento);
    expect(r.mudaram).toEqual([]);
  });

  it('soma das UFs = Brasil e as contas fecham em qualquer cenário', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = calcularCenario(ds, cenarioAleatorio(seed));
      expect(soma(r.ufs.map((u) => u.votos[0]))).toBe(r.brasil.votos[0]);
      expect(soma(r.ufs.map((u) => u.votos[1]))).toBe(r.brasil.votos[1]);
      expect(soma(r.ufs.map((u) => u.brancosNulos))).toBe(r.brasil.brancosNulos);
      expect(soma(r.ufs.map((u) => u.comparecimento))).toBe(r.brasil.comparecimento);
      expect(r.brasil.eleitorado).toBe(meta.totaisPrimeiroTurno.eleitorado);
      for (const u of [...r.ufs, r.brasil]) {
        expect(u.votos[0] + u.votos[1] + u.brancosNulos).toBe(u.comparecimento);
        expect(u.comparecimento + u.abstencao).toBe(u.eleitorado);
        expect(Math.min(...u.votos, u.brancosNulos, u.abstencao)).toBeGreaterThanOrEqual(0);
        expect(u.comparecimento).toBeLessThanOrEqual(u.eleitorado);
        if (u.votos[0] + u.votos[1] > 0) expect(pctFinalista(u, 0) + pctFinalista(u, 1)).toBeCloseTo(100, 9);
      }
      expect(r.estados[0] + r.estados[1] + r.empates).toBe(27);
      expect(pctComparecimentoArea(r.brasil) + pctAbstencaoArea(r.brasil)).toBeCloseTo(100, 9);
    }
  });

  it('"metade para cada" soma metade dos votos dos eliminados a cada finalista (± arredondamento por UF)', () => {
    const r = calcularCenario(ds, cenarioDoPreset('metade', ds));
    const outros = soma(eliminadosDe(ds).map((c) => c.votos));
    expect(Math.abs(r.brasil.votos[0] - (A.votos + outros / 2))).toBeLessThanOrEqual(28);
    expect(Math.abs(r.brasil.votos[1] - (B.votos + outros / 2))).toBeLessThanOrEqual(28);
    expect(r.brasil.comparecimento).toBe(meta.totaisPrimeiroTurno.comparecimento);
    expect(r.fluxo.eliminados.total).toBe(outros);
  });

  it('todos os eliminados se abstêm: o comparecimento cai exatamente pelos votos deles', () => {
    const c = definirTodos(cenarioDoPreset('branco', ds), ds, { escolhe: 0, brancoNulo: 0 });
    const r = calcularCenario(ds, c);
    const outros = soma(eliminadosDe(ds).map((x) => x.votos));
    expect(r.brasil.comparecimento).toBe(meta.totaisPrimeiroTurno.comparecimento - outros);
    expect(r.brasil.votos).toEqual([A.votos, B.votos]);
  });

  it('100% para A: A ganha votos em toda UF e nunca perde estados em relação a 100% para B', () => {
    const paraA = calcularCenario(ds, definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 100 }));
    const paraB = calcularCenario(ds, definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 0 }));
    paraA.ufs.forEach((u, i) => {
      expect(u.votos[0]).toBeGreaterThanOrEqual(paraB.ufs[i].votos[0]);
      expect(u.votos[1]).toBeLessThanOrEqual(paraB.ufs[i].votos[1]);
    });
    expect(paraA.estados[0]).toBeGreaterThanOrEqual(paraB.estados[0]);
    expect(pctFinalista(paraA.brasil, 0)).toBeGreaterThan(pctFinalista(paraB.brasil, 0));
  });

  it('simetria: trocar paraA por 100 − paraA troca o fluxo entre os finalistas', () => {
    const c1 = definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 70 });
    const c2 = definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 30 });
    const r1 = calcularCenario(ds, c1);
    const r2 = calcularCenario(ds, c2);
    expect(r1.fluxo.eliminados.a).toBeCloseTo(r2.fluxo.eliminados.b, 3);
    expect(r1.fluxo.eliminados.b).toBeCloseTo(r2.fluxo.eliminados.a, 3);
  });

  it('variação do comparecimento: +10 p.p. aumenta, −10 p.p. reduz, nunca passa do eleitorado', () => {
    const base = calcularCenario(ds, cenarioDoPreset('branco', ds));
    const mais = { ...cenarioDoPreset('branco', ds), comparecimento: { delta: 10, paraA: 50 } };
    const menos = { ...cenarioDoPreset('branco', ds), comparecimento: { delta: -10, paraA: 50 } };
    const rm = calcularCenario(ds, mais);
    const rn = calcularCenario(ds, menos);
    const el = meta.totaisPrimeiroTurno.eleitorado;
    expect(rm.brasil.comparecimento - base.brasil.comparecimento).toBeGreaterThan(0.09 * el);
    expect(rm.brasil.comparecimento - base.brasil.comparecimento).toBeLessThanOrEqual(0.1 * el + 28);
    expect(base.brasil.comparecimento - rn.brasil.comparecimento).toBeGreaterThan(0.09 * el);
    for (const u of rm.ufs) expect(u.comparecimento).toBeLessThanOrEqual(u.eleitorado);
    // Quem entra com 100% para A só soma para A (e brancos/nulos)
    const tudoA = calcularCenario(ds, { ...cenarioDoPreset('branco', ds), comparecimento: { delta: 5, paraA: 100 } });
    expect(tudoA.brasil.votos[1]).toBe(B.votos);
    expect(tudoA.brasil.votos[0]).toBeGreaterThan(A.votos);
    expect(tudoA.fluxo.comparecimento.b).toBeCloseTo(0, 6);
  });

  it('brancos e nulos do 1º turno podem escolher finalista', () => {
    const c = cenarioDoPreset('branco', ds);
    c.brancosNulosT1 = { escolhe: 100, paraA: 100, brancoNulo: 0 };
    const r = calcularCenario(ds, c);
    const bn1 = meta.totaisPrimeiroTurno.brancos + meta.totaisPrimeiroTurno.nulos;
    expect(Math.abs(r.brasil.votos[0] - (A.votos + bn1))).toBeLessThanOrEqual(28);
    expect(r.brasil.votos[1]).toBe(B.votos);
  });

  it('mudaram = estados em que o líder entre os finalistas no 1º turno fica atrás', () => {
    const r = calcularCenario(ds, definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 100 }));
    for (const u of r.ufs) {
      if (u.uf === 'ZZ') continue;
      const v = vencedorArea(u);
      expect(r.mudaram.includes(u.uf)).toBe(v !== null && u.liderT1 !== null && v !== u.liderT1);
    }
    expect(r.mudaram.length).toBeGreaterThan(0);
    expect(r.mudaram).not.toContain('ZZ');
  });

  it('aceita cenário malformado sem quebrar (normaliza)', () => {
    const lixo = { eliminados: { '70': { escolhe: NaN, paraA: 500, brancoNulo: -3 } }, brancosNulosT1: null, comparecimento: { delta: Infinity } } as unknown as Cenario;
    const r = calcularCenario(ds, lixo);
    expect(Number.isFinite(r.brasil.votos[0])).toBe(true);
    const n = normalizarCenario(lixo, ds);
    expect(n.eliminados['70']).toEqual({ escolhe: 100, paraA: 100, brancoNulo: 0 });
    expect(n.comparecimento.delta).toBe(0);
    expect(n.brancosNulosT1).toEqual({ escolhe: 0, paraA: 50, brancoNulo: 100 });
  });

  it('vencedorArea com empate exato', () => {
    expect(vencedorArea({ votos: [10, 10] })).toBeNull();
    expect(vencedorArea({ votos: [0, 0] })).toBeNull();
    expect(vencedorArea({ votos: [11, 10] })).toBe(0);
    expect(vencedorArea({ votos: [1, 10] })).toBe(1);
  });
});

describe('arredondarComSoma', () => {
  it('soma exatamente o total e respeita a proporção', () => {
    expect(arredondarComSoma([1.5, 1.5, 1], 4)).toEqual([2, 1, 1]);
    expect(arredondarComSoma([0.4, 0.4, 0.2], 1)).toEqual([1, 0, 0]);
    expect(arredondarComSoma([10, 20, 30], 60)).toEqual([10, 20, 30]);
    expect(arredondarComSoma([0, 0, 0], 5)).toEqual([0, 0, 0]);
    expect(arredondarComSoma([NaN, -3, 2], 2)).toEqual([0, 0, 2]);
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const xs = [r() * 1e6, r() * 1e6, r() * 1e3];
      const total = Math.round(xs[0] + xs[1] + xs[2]);
      const out = arredondarComSoma(xs, total);
      expect(soma(out)).toBe(total);
      out.forEach((v, j) => expect(Math.abs(v - xs[j])).toBeLessThanOrEqual(1.000001));
    }
  });
});

// =============================================================================================
describe('controles "todos juntos"', () => {
  it('definirTodos aplica o valor e mediaEliminados devolve a média ponderada', () => {
    const c = definirTodos(cenarioInicial(ds), ds, { paraA: 63 });
    expect(eliminadosUniformes(c, ds)).toBe(true);
    expect(mediaEliminados(c, ds).paraA).toBe(63);
    c.eliminados['70'] = { escolhe: 100, paraA: 100, brancoNulo: 100 };
    expect(eliminadosUniformes(c, ds)).toBe(false);
    const m = mediaEliminados(c, ds);
    expect(m.paraA).toBeGreaterThan(63);
    expect(m.paraA).toBeLessThan(100);
  });

  it('média sem ninguém escolhendo cai no peso por votos', () => {
    const c = definirTodos(cenarioDoPreset('branco', ds), ds, { paraA: 20 });
    expect(mediaEliminados(c, ds)).toEqual({ escolhe: 0, paraA: 20, brancoNulo: 100 });
  });
});

// =============================================================================================
describe('codec da URL', () => {
  it('base64url ida e volta para bytes quaisquer', () => {
    const r = rng(3);
    for (let n = 0; n < 60; n++) {
      const bytes = Array.from({ length: n }, () => Math.floor(r() * 256));
      const s = bytesParaBase64Url(bytes);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlParaBytes(s)).toEqual(bytes);
    }
    expect(base64UrlParaBytes('A')).toBeNull();
    expect(base64UrlParaBytes('AB+C')).toBeNull();
  });

  it('ida e volta: presets e cenários aleatórios', () => {
    for (const p of PRESETS) {
      const c = cenarioDoPreset(p.id, ds);
      expect(decodificarCenario(codificarCenario(c), ds)).toEqual(c);
    }
    for (let seed = 100; seed < 400; seed++) {
      const c = normalizarCenario(cenarioAleatorio(seed), ds);
      const cod = codificarCenario(c);
      expect(cod.length).toBeLessThanOrEqual(64);
      expect(cod).toMatch(/^[A-Za-z0-9_-]+$/);
      const d = decodificarCenario(cod, ds)!;
      expect(d).toEqual(c);
      expect(cenariosIguais(d, c, ds)).toBe(true);
    }
  });

  it('rota do cenário é um caminho seguro', () => {
    expect(rotaCenario(cenarioInicial(ds))).toMatch(/^\/cenarios\?c=[A-Za-z0-9_-]+$/);
  });

  it('entradas inválidas viram null, sem lançar', () => {
    const ruins: unknown[] = [
      null,
      undefined,
      42,
      {},
      [],
      '',
      '   ',
      'A',
      '!!!!',
      '<script>alert(1)</script>',
      '../../etc/passwd',
      'AQ', // só a versão
      'x'.repeat(MAX_CODIGO + 1),
      bytesParaBase64Url([2, 20, 50, 0, 50, 100]), // versão desconhecida
      bytesParaBase64Url([1, 41, 50, 0, 50, 100]), // delta fora da faixa
      bytesParaBase64Url([1, 20, 101, 0, 50, 100]), // paraA do comparecimento > 100
      bytesParaBase64Url([1, 20, 50, 0, 50, 255]), // brancos do 1º turno inválidos
    ];
    for (const r of ruins) {
      expect(() => decodificarCenario(r, ds)).not.toThrow();
      expect(decodificarCenario(r, ds)).toBeNull();
      expect(lerCodigoCenario(r)).toBeNull();
    }
  });

  it('entradas parciais: ignora números desconhecidos, finalistas, repetidos, fora da faixa e bytes soltos', () => {
    const ini = cenarioInicial(ds);
    const bytes = [
      1, 24, 80, 10, 60, 50,
      70, 90, 30, 40, // válido
      70, 10, 10, 10, // repetido (ignorado)
      13, 100, 100, 100, // finalista (ignorado)
      99, 100, 100, 100, // número desconhecido (ignorado)
      55, 101, 0, 0, // fora da faixa (ignorado)
      0, 1, 2, 3, // número 0 (ignorado)
      14, 5, // incompleto (ignorado)
    ];
    const d = decodificarCenario(bytesParaBase64Url(bytes), ds)!;
    expect(d).not.toBeNull();
    expect(d.comparecimento).toEqual({ delta: 2, paraA: 80 });
    expect(d.brancosNulosT1).toEqual({ escolhe: 10, paraA: 60, brancoNulo: 50 });
    expect(d.eliminados['70']).toEqual({ escolhe: 90, paraA: 30, brancoNulo: 40 });
    expect(d.eliminados['55']).toEqual(ini.eliminados['55']);
    expect(d.eliminados['14']).toEqual(ini.eliminados['14']);
    expect(d.eliminados['13']).toBeUndefined();
    expect(d.eliminados['99']).toBeUndefined();
    expect(Object.keys(d.eliminados).sort()).toEqual(eliminadosDe(ds).map((c) => String(c.numero)).sort());
  });

  it('aceita padding "=" e espaços nas pontas', () => {
    const cod = codificarCenario(cenarioDoPreset('metade', ds));
    const comPad = cod + '='.repeat((4 - (cod.length % 4)) % 4);
    expect(decodificarCenario(`  ${comPad} `, ds)).toEqual(cenarioDoPreset('metade', ds));
  });

  it('chaves estranhas no objeto não poluem o cenário', () => {
    const c = cenarioInicial(ds) as Cenario & { eliminados: Record<string, Divisao> };
    c.eliminados.__proto__polu = { escolhe: 1, paraA: 1, brancoNulo: 1 };
    c.eliminados['abc'] = { escolhe: 1, paraA: 1, brancoNulo: 1 };
    const d = decodificarCenario(codificarCenario(c), ds)!;
    expect(Object.keys(d.eliminados)).toHaveLength(10);
  });

  it('normalizarDelta quantiza em 0,5 e limita a ±10', () => {
    expect(normalizarDelta(0.3)).toBe(0.5);
    expect(normalizarDelta(0.2)).toBe(0);
    expect(normalizarDelta(-0.1)).toBe(0);
    expect(Object.is(normalizarDelta(-0.1), -0)).toBe(false);
    expect(normalizarDelta(11)).toBe(10);
    expect(normalizarDelta(-99)).toBe(-10);
    expect(normalizarDelta('3')).toBe(0);
    expect(normalizarDelta(NaN)).toBe(0);
  });
});

// =============================================================================================
describe('premissas e textos', () => {
  const PROIBIDAS = /vai ganhar|vencerá|vitória|esmagador|favorito|pesquisa mostra|previsão de/i;

  it('premissas do cenário inicial são neutras e completas', () => {
    const c = cenarioInicial(ds);
    const p = premissasCenario(ds, c);
    const ids = p.map((x) => x.id);
    expect(ids).toEqual(['finalistas', 'eliminados', 'brancos', 'comparecimento', 'estados']);
    const tudo = p.map((x) => `${x.rotulo} ${x.texto}`).join(' ');
    expect(tudo).toContain(A.nomeUrna);
    expect(tudo).toContain(B.nomeUrna);
    expect(tudo).toContain('repete o voto');
    expect(tudo).not.toMatch(PROIBIDAS);
    expect(tudo).not.toMatch(/NaN|undefined|Infinity/);
    expect(p[1].texto).toBe(`49% ${A.nomeUrna} · 51% ${B.nomeUrna}`);
  });

  it('cenário não uniforme lista os candidatos mais votados', () => {
    const c = cenarioInicial(ds);
    c.eliminados['70'] = { escolhe: 80, paraA: 75, brancoNulo: 50 };
    c.comparecimento = { delta: -2.5, paraA: 40 };
    const p = premissasCenario(ds, c, calcularCenario(ds, c), { detalheCandidatos: 3, nomesCurtos: true });
    expect(p.find((x) => x.id === 'cand-70')?.texto).toBe('60% Lula · 20% Flávio Bolsonaro · 10% branco/nulo · 10% não vota');
    expect(p.find((x) => x.id === 'cand-70')?.rotulo).toBe('Augusto Cury');
    expect(p.find((x) => x.id === 'eliminados')?.texto.startsWith('No total:')).toBe(true);
    const comp = p.find((x) => x.id === 'comparecimento')!.texto;
    expect(comp).toMatch(/^−2,5 p\.p\. do eleitorado \(−[\d,]+\smi de eleitores\); quem deixa de votar escolheria 40% Lula · 60% Flávio Bolsonaro\.$/);
    for (const x of p) expect(`${x.rotulo} ${x.texto}`).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('placar e estados sempre com A antes de B', () => {
    const r = calcularCenario(ds, cenarioInicial(ds));
    const t = placarCenarioTexto(ds, r);
    expect(t.indexOf(A.nomeUrna)).toBeLessThan(t.indexOf(B.nomeUrna));
    expect(t).toMatch(/^Lula \d{2},\d{2}% × Flávio Bolsonaro \d{2},\d{2}%$/);
    const e = estadosTexto(ds, r);
    expect(e.indexOf(A.nomeUrna)).toBeLessThan(e.indexOf(B.nomeUrna));
    expect(e).not.toMatch(PROIBIDAS);
  });

  it('nomeCurto tira títulos e limita a duas palavras', () => {
    expect(nomeCurto('Escritor Augusto Cury')).toBe('Augusto Cury');
    expect(nomeCurto('Veterinário Wilson Grassi')).toBe('Wilson Grassi');
    expect(nomeCurto('Flávio Bolsonaro')).toBe('Flávio Bolsonaro');
    expect(nomeCurto('Rui Costa Pimenta')).toBe('Rui Costa');
    expect(nomeCurto('Lula')).toBe('Lula');
  });

  it('aviso permanente', () => {
    expect(AVISO_CENARIO).toContain('Não é pesquisa nem previsão');
  });
});
