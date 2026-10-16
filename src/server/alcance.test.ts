/**
 * Alcance estimado (HyperLogLog, alcance.ts) e as métricas de 14 dias dos anúncios (MetricasAnuncios, E15): precisão,
 * união, ida e volta pelo arquivo, segmentos por processo (o maior vale), poda de 14 dias, leitura da v1 e o entregue
 * desde o início (meta de impressões, E16).
 */
import { describe, expect, it } from 'vitest';
import { NOITE_ELEICAO } from '../shared/relatorio';
import { AlcanceAnuncios, HLL_M, RETENCAO_SEGMENTO_MS, diaBrasilia, hllAdicionar, hllEstimar, hllUnir } from './alcance';
import { HORA_MS, MetricasAnuncios, PessoasPorAnuncio, PessoasPorRede } from './anuncios';

/** 15/10/2026 12:00 de Brasília. */
const AGORA = Date.UTC(2026, 9, 15, 15, 0, 0);
const DIA = 86_400_000;
const pessoa = (i: number) => `rede-${i % 997}|${(i * 2654435761) >>> 0}`;

describe('HyperLogLog', () => {
  it('50 mil chaves: erro abaixo de 3%; 1 chave ≈ 1; vazio = 0', () => {
    const reg = new Uint8Array(HLL_M);
    expect(hllEstimar(reg)).toBe(0);
    hllAdicionar(reg, 'só uma');
    expect(Math.round(hllEstimar(reg))).toBe(1);
    const r = new Uint8Array(HLL_M);
    for (let i = 0; i < 50_000; i++) hllAdicionar(r, pessoa(i));
    expect(Math.abs(hllEstimar(r) - 50_000) / 50_000).toBeLessThan(0.03);
  });

  it('a mesma chave repetida não muda nada; a união é idempotente e comutativa', () => {
    const a = new Uint8Array(HLL_M);
    const b = new Uint8Array(HLL_M);
    for (let i = 0; i < 3000; i++) hllAdicionar(a, pessoa(i));
    for (let i = 2000; i < 6000; i++) hllAdicionar(b, pessoa(i));
    const antes = a.slice();
    for (let i = 0; i < 3000; i++) expect(hllAdicionar(a, pessoa(i))).toBe(false);
    expect(a).toEqual(antes);
    const ab = hllUnir(a.slice(), b);
    const ba = hllUnir(b.slice(), a);
    expect(ab).toEqual(ba);
    expect(hllUnir(ab.slice(), ab)).toEqual(ab);
    expect(hllUnir(ab.slice(), a)).toEqual(ab);
    expect(Math.abs(hllEstimar(ab) - 6000) / 6000).toBeLessThan(0.03);
  });
});

describe('AlcanceAnuncios (segmentos por processo)', () => {
  it('1.000 impressões de 600 pessoas → alcance entre 580 e 620', () => {
    const m = new MetricasAnuncios(() => AGORA);
    for (let i = 0; i < 1000; i++) m.impressao('lynx', i % 2 ? 'topo' : 'nativo', pessoa(i % 600));
    const e = m.alcance.estimar('lynx', 'campanha')!;
    expect(e).toBeGreaterThanOrEqual(580);
    expect(e).toBeLessThanOrEqual(620);
    expect(m.alcance.estimar('lynx', 'noite')).toBeNull();
    expect(m.alcance.estimar('outro', 'campanha')).toBeNull();
  });

  it('campanha = união dos dias (a mesma pessoa em dois dias conta uma vez), a partir do dia do início', () => {
    let t = AGORA;
    const a = new AlcanceAnuncios(() => t);
    for (let i = 0; i < 500; i++) a.adicionar('lynx', pessoa(i));
    t += DIA;
    for (let i = 250; i < 750; i++) a.adicionar('lynx', pessoa(i));
    const camp = a.estimar('lynx', 'campanha')!;
    expect(Math.abs(camp - 750) / 750).toBeLessThan(0.03);
    // início no 2º dia: só o 2º dia
    const doDia2 = a.estimar('lynx', 'campanha', t)!;
    expect(Math.abs(doDia2 - 500) / 500).toBeLessThan(0.03);
  });

  it('noite da eleição: esboço próprio, só dentro de 25/10 17h → 26/10 2h', () => {
    let t = NOITE_ELEICAO.inicio - 60_000;
    const a = new AlcanceAnuncios(() => t);
    for (let i = 0; i < 100; i++) a.adicionar('lynx', pessoa(i));
    expect(a.estimar('lynx', 'noite')).toBeNull();
    t = NOITE_ELEICAO.inicio + HORA_MS;
    for (let i = 0; i < 300; i++) a.adicionar('lynx', pessoa(i));
    t = NOITE_ELEICAO.fim;
    for (let i = 1000; i < 1100; i++) a.adicionar('lynx', pessoa(i));
    expect(Math.abs(a.estimar('lynx', 'noite')! - 300) / 300).toBeLessThan(0.03);
    expect(diaBrasilia(NOITE_ELEICAO.inicio)).toBe('2026-10-25');
    expect(diaBrasilia(NOITE_ELEICAO.fim)).toBe('2026-10-26');
  });

  it('ida e volta pelo arquivo; reinício cria segmento novo e a estimativa é o MAIOR entre eles', () => {
    let t = AGORA;
    const p1 = new AlcanceAnuncios(() => t);
    for (let i = 0; i < 400; i++) p1.adicionar('lynx', `s1|${pessoa(i)}`);
    const arq = JSON.parse(JSON.stringify(p1.toJSON()));
    expect(arq.segmentos).toHaveLength(1);
    // outro processo (outro sal: as mesmas pessoas viram outras chaves)
    const p2 = new AlcanceAnuncios(() => t);
    expect(p2.carregar(arq)).toBe(true);
    expect(p2.segmentos).toBe(2);
    expect(p2.estimar('lynx', 'campanha')).toBe(p1.estimar('lynx', 'campanha'));
    // só o segmento anterior contou o anúncio até aqui; a noite, nenhum
    expect(p2.segmentosCom('lynx', 'campanha')).toBe(1);
    expect(p2.segmentosCom('lynx', 'noite')).toBe(0);
    for (let i = 0; i < 150; i++) p2.adicionar('lynx', `s2|${pessoa(i)}`);
    // agora os dois: reinício no período (a página avisa que a estimativa é conservadora)
    expect(p2.segmentosCom('lynx', 'campanha')).toBe(2);
    expect(p2.segmentosCom('outro', 'campanha')).toBe(0);
    // o maior (400), não a soma (550)
    expect(p2.estimar('lynx', 'campanha')).toBe(p1.estimar('lynx', 'campanha'));
    for (let i = 150; i < 900; i++) p2.adicionar('lynx', `s2|${pessoa(i)}`);
    expect(Math.abs(p2.estimar('lynx', 'campanha')! - 900) / 900).toBeLessThan(0.03);
    // carregar de novo o mesmo arquivo não duplica o segmento
    p2.carregar(arq);
    expect(p2.segmentos).toBe(2);
    const arq2 = JSON.parse(JSON.stringify(p2.toJSON()));
    expect(arq2.segmentos).toHaveLength(2);
    // lixo é ignorado sem lançar
    for (const lixo of [null, 'x', { v: 2 }, { v: 1, segmentos: [{ seg: '../', a: {} }, { seg: 'abcdef12', a: { '../x': { noite: 'AAAA' } } }] }]) {
      const p = new AlcanceAnuncios(() => t);
      p.carregar(lixo);
      expect(p.estimar('lynx', 'campanha')).toBeNull();
    }
  });

  it('poda: segmento parado há mais de 14 dias sai', () => {
    let t = AGORA;
    const p1 = new AlcanceAnuncios(() => t);
    p1.adicionar('lynx', 'x');
    const arq = JSON.parse(JSON.stringify(p1.toJSON()));
    t += RETENCAO_SEGMENTO_MS - HORA_MS;
    const p2 = new AlcanceAnuncios(() => t);
    p2.carregar(arq);
    expect(p2.segmentos).toBe(2);
    t += 2 * HORA_MS;
    expect(p2.toJSON().segmentos).toHaveLength(0);
    expect(p2.segmentos).toBe(1);
  });
});

describe('MetricasAnuncios: 14 dias de detalhe, totais por dia e entregue desde o início', () => {
  it('detalhe de 14 dias por hora; depois disso fica no total do dia; lista(48) e lista(336)', () => {
    let t = AGORA;
    const m = new MetricasAnuncios(() => t);
    m.impressao('lynx', 'topo', 'a');
    t += 3 * DIA;
    m.impressao('lynx', 'topo', 'b');
    expect(m.lista()[0].porHora).toHaveLength(1);
    expect(m.lista(336)[0].porHora).toHaveLength(2);
    t = AGORA + 15 * DIA;
    m.impressao('lynx', 'topo', 'c');
    expect(m.lista(336)[0].porHora).toHaveLength(2);
    expect(m.lista(336)[0].impressoes).toBe(3);
    const r = m.paraRelatorio('lynx');
    expect(r.horas.map((h) => h.impressoes)).toEqual([1, 1]);
    expect(r.dias).toEqual([{ dia: '2026-10-15', impressoes: 1, cliques: 0 }]);
  });

  it('paraRelatorio com início: só o que veio a partir dele (horas e dias), com a regra do entregueDesde', () => {
    let t = AGORA; // 15/10, 12:00
    const m = new MetricasAnuncios(() => t);
    m.impressao('lynx', 'topo', 'a');
    t += 2 * HORA_MS; // 14:00
    m.impressao('lynx', 'topo', 'b');
    m.clique('lynx', 'topo', 'b');
    // campanha renovada às 13:30: a hora das 12h fica de fora; a das 14h entra
    const r = m.paraRelatorio('lynx', AGORA + 90 * 60_000);
    expect(r.horas.map((h) => [h.hora, h.impressoes, h.cliques])).toEqual([[AGORA + 2 * HORA_MS, 1, 1]]);
    expect(m.paraRelatorio('lynx', null).horas).toHaveLength(2);
    // 16 dias depois: 15/10 saiu do detalhe — com início às 13:30 do dia 15 ele não conta; com início à 0h, conta
    t = AGORA + 16 * DIA;
    m.impressao('lynx', 'topo', 'c');
    expect(m.paraRelatorio('lynx', AGORA + 90 * 60_000).dias).toEqual([]);
    expect(m.paraRelatorio('lynx', Date.parse('2026-10-15T00:00:00-03:00')).dias).toEqual([{ dia: '2026-10-15', impressoes: 2, cliques: 1 }]);
  });

  it('entregueDesde: início no meio da hora conta a hora inteira; dias antes do detalhe contam inteiros (o do início só à 0h)', () => {
    let t = AGORA;
    const m = new MetricasAnuncios(() => t);
    m.impressao('lynx', 'topo', 'a'); // 12:00
    t += 30 * 60_000;
    m.impressao('lynx', 'nativo', 'b'); // 12:30
    t += HORA_MS;
    m.impressao('lynx', 'topo', 'c'); // 13:30
    m.impressao('lynx', 'compartilhamento', 'd'); // não medido: não conta
    expect(m.entregueDesde('lynx', AGORA + 45 * 60_000)).toBe(3);
    expect(m.entregueDesde('lynx', AGORA + HORA_MS + 1)).toBe(1);
    expect(m.entregueDesde('lynx', AGORA + 2 * HORA_MS)).toBe(0);
    // 16 dias depois: as horas saíram do detalhe; o dia 15/10 continua no total do dia
    t = AGORA + 16 * DIA;
    m.impressao('lynx', 'topo', 'e');
    const meiaNoite = Date.parse('2026-10-15T00:00:00-03:00');
    expect(m.entregueDesde('lynx', meiaNoite)).toBe(4);
    expect(m.entregueDesde('lynx', AGORA)).toBe(1); // o dia do início no meio: fica de fora (nunca passa do entregue)
    expect(m.entregueDesde('lynx', meiaNoite - DIA)).toBe(4);
  });

  it('metas: atinge → esgotado com a hora; aumentar ou tirar a meta → volta; anúncio sem início não entra', () => {
    let t = AGORA;
    const m = new MetricasAnuncios(() => t);
    for (let i = 0; i < 5; i++) m.impressao('lynx', 'topo', `p${i}`);
    expect(m.verificarMetas([{ id: 'lynx', inicio: AGORA, limiteImpressoes: 5 }])).toBe(true);
    expect(m.esgotadoEm.get('lynx')).toBe(AGORA);
    expect(m.geracaoEsgotados).toBe(1);
    t += 15_000;
    expect(m.verificarMetas([{ id: 'lynx', inicio: AGORA, limiteImpressoes: 5 }])).toBe(false);
    expect(m.esgotadoEm.get('lynx')).toBe(AGORA);
    expect(m.verificarMetas([{ id: 'lynx', inicio: AGORA, limiteImpressoes: 6 }])).toBe(true);
    expect(m.esgotadoEm.has('lynx')).toBe(false);
    m.verificarMetas([{ id: 'lynx', inicio: AGORA, limiteImpressoes: 5 }]);
    expect(m.verificarMetas([{ id: 'lynx', inicio: AGORA, limiteImpressoes: null }])).toBe(true);
    expect(m.esgotadoEm.size).toBe(0);
    expect(m.verificarMetas([{ id: 'lynx', inicio: null, limiteImpressoes: 5 }])).toBe(false);
    expect(m.geracaoEsgotados).toBe(4);
  });

  it('arquivo v2: ida e volta com horas, dias, alcance e esgotados', () => {
    let t = AGORA;
    const m = new MetricasAnuncios(() => t);
    for (let i = 0; i < 50; i++) m.impressao('lynx', 'topo', pessoa(i));
    m.clique('lynx', 'topo', pessoa(1));
    m.verificarMetas([{ id: 'lynx', inicio: AGORA, limiteImpressoes: 50 }]);
    const arq = JSON.parse(JSON.stringify(m.toJSON()));
    expect(arq).toMatchObject({ v: 1, versao: 2, series: [{ id: 'lynx', f: 'topo', i: 50, c: 1, d: [['2026-10-15', 50, 1]] }], esg: { lynx: AGORA } });
    t += HORA_MS;
    const m2 = new MetricasAnuncios(() => t);
    expect(m2.carregar(arq)).toBe(true);
    expect(m2.lista()).toEqual(m.lista());
    expect(m2.esgotadoEm.get('lynx')).toBe(AGORA);
    expect(m2.alcance.estimar('lynx', 'campanha')).toBe(m.alcance.estimar('lynx', 'campanha'));
    expect(m2.paraRelatorio('lynx')).toEqual(m.paraRelatorio('lynx'));
  });
});

describe('PessoasPorRede (E14, puro)', () => {
  it('5.000 navegadores numa rede IPv4: no máximo 400 + 1; num /64: 8 + 1; quem já foi contado continua o mesmo', () => {
    let t = AGORA;
    const p = new PessoasPorRede(() => t);
    const chaves = new Set<string>();
    for (let i = 0; i < 5000; i++) chaves.add(p.pessoa('rede-a', `UA ${i}`, false));
    expect(chaves.size).toBe(401);
    const v6 = new Set<string>();
    for (let i = 0; i < 100; i++) v6.add(p.pessoa('rede-b', `UA ${i}`, true));
    expect(v6.size).toBe(9);
    // na janela seguinte, quem foi contado antes continua com a mesma chave, mesmo acima do teto
    const antes = p.pessoa('rede-a', 'UA 7', false);
    t += 5 * 60_000;
    for (let i = 1000; i < 1400; i++) p.pessoa('rede-a', `UA ${i}`, false);
    expect(p.pessoa('rede-a', 'UA 7', false)).toBe(antes);
  });

  it('rede no teto: uma linha de log por janela, só com a contagem', () => {
    let t = AGORA;
    const log: number[] = [];
    const p = new PessoasPorRede(() => t, 5 * 60_000, { v4: 3, v6: 1 }, 1000, (n) => log.push(n));
    for (let i = 0; i < 10; i++) p.pessoa('rede-a', `UA ${i}`, false);
    for (let i = 0; i < 10; i++) p.pessoa('rede-b', `UA ${i}`, false);
    p.pessoa('rede-c', 'UA 1', false);
    expect(log).toEqual([]);
    t += 5 * 60_000;
    p.pessoa('rede-c', 'UA 1', false);
    expect(log).toEqual([2]);
    t += 5 * 60_000;
    p.pessoa('rede-c', 'UA 1', false);
    expect(log).toEqual([2]);
  });

  it('memória limitada: acima do teto de pares na janela, conta pela rede', () => {
    const p = new PessoasPorRede(() => AGORA, 5 * 60_000, { v4: 400, v6: 8 }, 10);
    for (let i = 0; i < 10; i++) expect(p.pessoa(`r${i}`, 'UA', false)).toBe(`r${i}|${p.pessoa(`r${i}`, 'UA', false).split('|')[1]}`);
    expect(p.pessoa('r-nova', 'UA', false)).toBe('r-nova');
    expect(p.tamanho).toBe(10);
  });
});

describe('PessoasPorAnuncio (teto de uma rede num anúncio, puro)', () => {
  const k = (rede: string, i: number, v6 = false) => ({ rede, pessoa: `${rede}|ua${i}`, v6 });

  it('100 pessoas por rede e anúncio em IPv4 (8 num /64); outro anúncio tem o próprio teto; a mesma pessoa em outro formato não gasta', () => {
    const log: number[] = [];
    let t = AGORA;
    const p = new PessoasPorAnuncio(() => t, 5 * 60_000, { v4: 100, v6: 8 }, 300_000, (n) => log.push(n));
    const a = new Set<string>();
    for (let i = 0; i < 300; i++) a.add(p.pessoa(k('r1', i), 'lynx'));
    expect(a.size).toBe(101);
    // a mesma pessoa de novo (outro formato do mesmo anúncio) continua ela mesma
    expect(p.pessoa(k('r1', 5), 'lynx')).toBe('r1|ua5');
    const b = new Set<string>();
    for (let i = 0; i < 50; i++) b.add(p.pessoa(k('r1', i), 'outro'));
    expect(b.size).toBe(50);
    const v6 = new Set<string>();
    for (let i = 0; i < 20; i++) v6.add(p.pessoa(k('r6', i, true), 'lynx'));
    expect(v6.size).toBe(9);
    // pessoa que já conta pela rede (teto da rede inteira) segue pela rede
    expect(p.pessoa({ rede: 'r9', pessoa: 'r9', v6: false }, 'lynx')).toBe('r9');
    t += 5 * 60_000;
    p.pessoa(k('r2', 0), 'lynx');
    expect(log).toEqual([2]);
  });
});
