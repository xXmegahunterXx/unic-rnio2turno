/** "Projeção do Sintonia": método município a município, âncora oficial (fonte TSE), limiares e regras de exibição. */
import { describe, expect, it } from 'vitest';
import {
  calcularProjecao,
  LIMIAR_FRACAO,
  montarProjecao,
  paresT1,
  PISO_FAIXA_PP,
  projecaoIndisponivel,
  projecaoLiberada,
  t1Projecao,
  TEXTOS_PROJECAO,
  type ContextoProjecao,
  type MunicipioProjecao,
} from './projecao';
import type { Candidate, Race } from './types';

const cand = (numero: number, extra: Partial<Candidate> = {}): Candidate => ({ numero, nomeUrna: `C${numero}`, nome: `C${numero}`, partido: 'X', cor: 'a', ...extra });
const race = { id: 'pres', candidatos: [cand(13), cand(22)] } as Pick<Race, 'id' | 'candidatos'>;

/** Município: 1º turno (fin0, fin1, outros) e 2º turno (votos, seções apuradas/total, eleitorado proporcional). */
function mun(uf: string, t1: [number, number, number] | null, t2: { v: [number, number]; st: number; s: number } | null): MunicipioProjecao {
  return {
    uf,
    t1: t1 ? { finalistas: [t1[0], t1[1]], validos: t1[0] + t1[1] + t1[2] } : null,
    t2: t2 ? { votos: t2.v, secoes: t2.s, secoesTotalizadas: t2.st, eleitorado: t2.s * 100, eleitoradoTotalizado: t2.st * 100 } : null,
  };
}

describe('pares e 1º turno', () => {
  it('casa pelo número na urna (o "Outros" fica de fora) e soma os válidos de todos', () => {
    const raceT1 = { candidatos: [cand(13), cand(22), cand(0, { agregado: true })] };
    const p = paresT1(race, raceT1);
    expect(p).toEqual([0, 1]);
    expect(t1Projecao(p, [400, 500, 100])).toEqual({ finalistas: [400, 500], validos: 1000 });
    expect(t1Projecao(p, [0, 0, 0])).toBeNull();
    expect(t1Projecao([0, -1], [1, 2, 3])).toBeNull();
    expect(paresT1(race, { candidatos: [cand(22), cand(13)] })).toEqual([1, 0]);
  });
});

describe('calcularProjecao', () => {
  it('tudo apurado: o projetado é o resultado (faixa no piso)', () => {
    const c = calcularProjecao({
      municipios: [mun('SP', [10, 10, 0], { v: [600, 400], st: 10, s: 10 }), mun('SP', [10, 10, 0], { v: [300, 700], st: 5, s: 5 })],
    })!;
    expect(c.pct[0]).toBeCloseTo(45, 9);
    expect(c.pct[0] + c.pct[1]).toBeCloseTo(100, 9);
    expect(c.fracaoApurada).toBe(1);
    expect(c.meia).toBe(PISO_FAIXA_PP);
  });

  it('município começado: o que falta segue a proporção já apurada nele (volume pelo eleitorado)', () => {
    // apurado 25% do eleitorado com 60/40 → esperado 4× os válidos, mesmo 60%
    const c = calcularProjecao({ municipios: [mun('SP', [10, 10, 0], { v: [600, 400], st: 1, s: 4 })] })!;
    expect(c.pct[0]).toBeCloseTo(60, 9);
    expect(c.validosEsperados).toBeCloseTo(4000, 6);
    expect(c.fracaoApurada).toBeCloseTo(0.25, 9);
  });

  it('município sem urnas: 1º turno entre os dois + swing médio da UF; volume pela razão dos concluídos da UF', () => {
    // concluído: 1º turno 50/50 (só os dois; outros 200), 2º turno 55/45 → swing +5 p.p.; razão 1000/1200
    const feito = mun('BA', [500, 500, 200], { v: [550, 450], st: 3, s: 3 });
    // sem urnas: 1º turno 30/70 (outros 400) → 35%; volume = 1400 × (1000/1200)
    const falta = mun('BA', [300, 700, 400], { v: [0, 0], st: 0, s: 5 });
    const c = calcularProjecao({ municipios: [feito, falta] })!;
    const ve = 1400 * (1000 / 1200);
    expect(c.validosEsperados).toBeCloseTo(1000 + ve, 6);
    expect(c.pct[0]).toBeCloseTo((100 * (550 + 0.35 * ve)) / (1000 + ve), 9);
  });

  it('UF sem nenhuma urna usa o swing (e a razão) do Brasil; limitado a [0, 100]', () => {
    const c = calcularProjecao({
      municipios: [mun('RS', [100, 900, 0], { v: [300, 700], st: 2, s: 2 }), mun('AC', [50, 950, 0], { v: [0, 0], st: 0, s: 2 })],
    })!;
    // swing do Brasil = 30% − 10% = +20 p.p. → AC: 5% + 20 = 25%
    expect(c.pct[0]).toBeCloseTo((100 * (300 + 0.25 * 1000)) / 2000, 9);
    const extremo = calcularProjecao({
      municipios: [mun('RS', [100, 900, 0], { v: [1000, 0], st: 2, s: 2 }), mun('RS', [950, 50, 0], { v: [0, 0], st: 0, s: 2 })],
    })!;
    expect(extremo.pct[0]).toBeLessThanOrEqual(100);
    expect(extremo.pct[0]).toBeCloseTo(100, 9); // 95% + 90 p.p. → limitado a 100%
  });

  it('simetria: trocar os candidatos espelha o resultado e a faixa', () => {
    const base = [
      mun('SP', [400, 500, 100], { v: [520, 480], st: 3, s: 10 }),
      mun('SP', [700, 200, 100], { v: [0, 0], st: 0, s: 8 }),
      mun('MG', [300, 600, 100], { v: [380, 560], st: 6, s: 6 }),
    ];
    const troca = (m: MunicipioProjecao): MunicipioProjecao => ({
      uf: m.uf,
      t1: m.t1 && { finalistas: [m.t1.finalistas[1], m.t1.finalistas[0]], validos: m.t1.validos },
      t2: m.t2 && { ...m.t2, votos: [m.t2.votos[1], m.t2.votos[0]] },
    });
    const a = calcularProjecao({ municipios: base })!;
    const b = calcularProjecao({ municipios: base.map(troca) })!;
    expect(a.pct[0]).toBeCloseTo(b.pct[1], 9);
    expect(a.meia).toBeCloseTo(b.meia, 12);
  });

  it('fonte TSE: o total oficial da UF ancora o já apurado dos municípios ainda não lidos', () => {
    const lido = mun('DF', [500, 500, 0], { v: [300, 200], st: 5, s: 10 });
    const naoLido = mun('DF', [400, 600, 0], null);
    // oficial: 300+200 (lido) + 100/100 (não lido, 1/4 do eleitorado dele)
    const tot = { votos: [400, 300], secoes: 20, secoesTotalizadas: 7, eleitorado: 2000, eleitoradoTotalizado: 700 };
    const c = calcularProjecao({ municipios: [lido, naoLido], totaisUf: { DF: tot } })!;
    expect(c.validosApurados).toBe(700);
    expect(c.ufsComUrnas).toBe(1);
    // sem o total, o não lido entraria como "sem urnas" e o apurado seria só o do lido
    const sem = calcularProjecao({ municipios: [lido, naoLido] })!;
    expect(sem.validosApurados).toBe(500);
    expect(c.pct[0]).toBeGreaterThan(0);
    expect(c.pct[0]).toBeLessThan(100);
  });

  it('a faixa estreita à medida que a apuração avança', () => {
    const muns = (st: number) =>
      Array.from({ length: 40 }, (_, i) => {
        const q = 0.3 + (i % 10) * 0.04;
        const s = 20;
        const k = i < 40 * (st / s) ? st : 0;
        const v0 = Math.round(k * 50 * (q + 0.03));
        return mun(i % 2 ? 'PE' : 'CE', [Math.round(1000 * q), Math.round(1000 * (1 - q)), 100], { v: [v0, k * 50 - v0], st: k, s });
      });
    const cedo = calcularProjecao({ municipios: muns(4) })!;
    const tarde = calcularProjecao({ municipios: muns(16) })!;
    expect(cedo.fracaoApurada).toBeLessThan(tarde.fracaoApurada);
    expect(cedo.meia).toBeGreaterThan(tarde.meia);
  });

  it('sem base: lista vazia, corrida com 3 candidatos ou nenhum volume', () => {
    expect(calcularProjecao({ municipios: [] })).toBeNull();
    expect(calcularProjecao({ municipios: [{ uf: 'SP', t1: null, t2: { votos: [1, 2, 3], secoes: 1, secoesTotalizadas: 1, eleitorado: 1, eleitoradoTotalizado: 1 } }] })).toBeNull();
    expect(calcularProjecao({ municipios: [mun('SP', null, { v: [0, 0], st: 0, s: 3 })] })).toBeNull();
  });
});

describe('limiares e resposta pública', () => {
  const ctx = (resumo: ContextoProjecao['resumo'], extra: Partial<ContextoProjecao> = {}): ContextoProjecao => ({ race, abrangencia: 'BR', simNow: 123, resumo, ...extra });
  const calc = (fracao: number, ufsComUrnas = 27) => ({
    pct: [52.345678, 47.654322],
    dp: 0.4,
    meia: 0.8,
    fracaoApurada: fracao,
    validosEsperados: 1000,
    validosApurados: 1000 * fracao,
    municipios: 100,
    municipiosComUrnas: 50,
    ufs: 28,
    ufsComUrnas,
  });
  const resumo = { secoes: 1000, secoesTotalizadas: 300, eleito: null };

  it(`liberada só com ${LIMIAR_FRACAO * 100}% dos válidos esperados e urnas em 5 UFs (Brasil) / 10% dos municípios (UF)`, () => {
    expect(projecaoLiberada('BR', calc(0.099))).toBe(false);
    expect(projecaoLiberada('BR', calc(0.1))).toBe(true);
    expect(projecaoLiberada('BR', calc(0.5, 4))).toBe(false);
    expect(projecaoLiberada('SP', { ...calc(0.5), municipiosComUrnas: 9 })).toBe(false);
    expect(projecaoLiberada('SP', { ...calc(0.5), municipiosComUrnas: 10 })).toBe(true);
  });

  it('disponível: candidatos na ordem da urna, faixa = pct ± meia, eco do % das seções; sem nomes', () => {
    const p = montarProjecao(ctx(resumo), calc(0.3));
    expect(p).toEqual({
      race: 'pres',
      abrangencia: 'BR',
      disponivel: true,
      fracaoApurada: 0.3,
      pctSecoes: 30,
      candidatos: [
        { indice: 0, numero: 13, pct: 52.3457, min: 51.5457, max: 53.1457 },
        { indice: 1, numero: 22, pct: 47.6543, min: 46.8543, max: 48.4543 },
      ],
      simNow: 123,
    });
    expect(JSON.stringify(p)).not.toMatch(/C13|C22/);
  });

  it('motivos: encerrada > definido > cedo (sem urnas ou abaixo do limiar) > sem-base', () => {
    expect(montarProjecao(ctx({ ...resumo, secoesTotalizadas: 1000, eleito: 0 }), calc(1)).motivo).toBe('encerrada');
    expect(montarProjecao(ctx(resumo, { encerrada: true }), calc(0.3)).motivo).toBe('encerrada');
    expect(montarProjecao(ctx({ ...resumo, eleito: 1 }), calc(0.9)).motivo).toBe('definido');
    expect(montarProjecao(ctx({ ...resumo, secoesTotalizadas: 0 }), null).motivo).toBe('cedo');
    expect(montarProjecao(ctx(null), null).motivo).toBe('cedo');
    expect(montarProjecao(ctx(resumo), calc(0.05)).motivo).toBe('cedo');
    expect(montarProjecao(ctx(resumo), null).motivo).toBe('sem-base');
    const ind = projecaoIndisponivel(ctx(resumo), 'desligada');
    expect(ind).toMatchObject({ disponivel: false, motivo: 'desligada', candidatos: [], pctSecoes: 30, fracaoApurada: 0 });
  });

  it('textos neutros e simétricos', () => {
    expect(TEXTOS_PROJECAO.titulo).toBe('Projeção do Sintonia');
    expect(TEXTOS_PROJECAO.subtitulo).toBe(
      'Estimativa estatística do resultado final com base nas urnas já apuradas e no 1º turno. Não é o resultado oficial — o resultado é o do TSE.',
    );
    expect(TEXTOS_PROJECAO.linha('52,3%', '51,5%', '53,1%')).toBe('52,3% (entre 51,5% e 53,1%)');
    expect(TEXTOS_PROJECAO.rodape('30%')).toBe('Com 30% das urnas apuradas');
  });
});
