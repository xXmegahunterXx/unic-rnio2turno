/**
 * Mapeamento feed → contratos com arquivos REAIS do 1º turno de 2026 (src/tse/__fixtures__).
 * Números conferidos à mão contra os próprios arquivos (vap/vb/tvn/e.c…) e contra o TSE (pvap).
 */
import { describe, expect, it } from 'vitest';
import type { Race, Summary } from '../shared/types';
import { decodeFaixas, pctValidos } from '../shared/calc';
import * as map from './map';
import { lerBoletimUrna } from './bu';
import type { TseAcompanhamentoArquivo, TseAuxArquivo, TseResultadoArquivo, TseSecoesArquivo } from './feed';
import { jsonFixture, lerFixture } from './__fixtures__/fake-fetch';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const R = (id: string) => races.find((r) => r.id === id)!;
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);
const res = (rel: string) => jsonFixture<TseResultadoArquivo>(`ele2026/${rel}`);

describe('primitivos', () => {
  it('números e percentuais do feed', () => {
    expect(map.int('56104503')).toBe(56104503);
    expect(map.int('')).toBe(0);
    expect(map.int(undefined)).toBe(0);
    expect(map.int('0077')).toBe(77);
    expect(map.pctFeed('47,03')).toBeCloseTo(47.03, 10);
    expect(map.pctFeed('100,00')).toBe(100);
  });

  it('data/hora de Brasília e hora local da UF', () => {
    // 05/10/2026 12:51:05 em Brasília = 15:51:05 UTC
    expect(map.dataHoraBrt('05/10/2026', '12:51:05')).toBe(Date.UTC(2026, 9, 5, 15, 51, 5));
    expect(map.dataHoraBrt('', '')).toBeNull();
    // Acre (UTC-5): o 1º município do AC totalizou "16:17:01" → 21:17:01 UTC (18:17 em Brasília)
    expect(map.dataHoraLocal('04/10/2026', '16:17:01', 'AC')).toBe(Date.UTC(2026, 9, 4, 21, 17, 1));
    expect(map.dataHoraLocal('04/10/2026', '16:33:09', 'MT')).toBe(Date.UTC(2026, 9, 4, 20, 33, 9));
    expect(map.dataHoraLocal('04/10/2026', '17:20:36', 'SP')).toBe(Date.UTC(2026, 9, 4, 20, 20, 36));
    expect(map.dataHoraUrna('20261004T154409')).toBe('04/10/2026 15:44:09');
  });

  it('nomes de lugar', () => {
    expect(map.nomeLugar('SÃO PAULO')).toBe('São Paulo');
    expect(map.nomeLugar("OLHO D'ÁGUA DO BORGES")).toBe("Olho d'Água do Borges");
    expect(map.nomeLugar('SÃO JOÃO DEL REI')).toBe('São João del Rei');
    expect(map.nomeLugar('ACRELÂNDIA')).toBe('Acrelândia');
  });
});

describe('resultado Brasil 1º turno (Presidente) → pres-t1', () => {
  const arq = res('6257/dados/br/br-c0001-e006257-u.json');
  const r = map.resumoDoResultado(arq, R('pres-t1'), races, true, 'BR');
  const s = r.resumo;

  it('totais oficiais conferidos', () => {
    expect(r.race.id).toBe('pres-t1');
    expect(R('pres-t1').candidatos.map((c) => c.numero)).toEqual([13, 22, 0]);
    // Lula 13, Flávio 22, Outros (soma dos outros 10 candidatos)
    expect(s.votos).toEqual([53_879_538, 56_104_503, 9_316_747]);
    expect(s.secoes).toBe(499_248);
    expect(s.secoesTotalizadas).toBe(499_248);
    expect(s.eleitorado).toBe(158_745_502);
    expect(s.eleitoradoTotalizado).toBe(158_745_502);
    expect(s.comparecimento).toBe(125_275_835);
    expect(s.brancos).toBe(2_300_798);
    expect(s.nulos).toBe(3_674_249);
    expect(s.abstencao).toBe(33_469_244); // oficial (seções instaladas)
    expect(soma(s.votos)).toBe(119_300_788);
    expect(soma(s.votos) + s.brancos + s.nulos).toBe(s.comparecimento);
  });

  it('percentuais de calc.ts batem com o pvap do TSE', () => {
    expect(pctValidos(s, 1).toFixed(2)).toBe('47.03');
    expect(pctValidos(s, 0).toFixed(2)).toBe('45.16');
  });

  it('status, líder e vencedor', () => {
    expect(s.status).toBe('encerrada');
    expect(s.lider).toBe(1);
    expect(s.eleito).toBe(1); // regra do contrato: apuração encerrada ⇒ vencedor
    expect(s.ultimaAtualizacao).toBe(Date.UTC(2026, 9, 5, 15, 51, 5));
    expect(r.turno).toBe(1);
    expect(r.numeros).toHaveLength(12);
  });

  it("corrida de 2º turno apontada para dados de 1º turno usa a '-t1'", () => {
    const r2 = map.resumoDoResultado(arq, R('pres'), races, true, 'BR');
    expect(r2.race.id).toBe('pres-t1');
    expect(r2.resumo.votos).toEqual(s.votos);
    // sem a corrida -t1: só os 2 candidatos, os demais válidos vão para os nulos (Σ continua fechando)
    const r3 = map.resumoDoResultado(arq, R('pres'), [R('pres')], true, 'BR');
    expect(r3.race.id).toBe('pres');
    expect(r3.resumo.votos).toEqual([53_879_538, 56_104_503]);
    expect(soma(r3.resumo.votos) + r3.resumo.brancos + r3.resumo.nulos).toBe(125_275_835);
  });
});

describe('outras abrangências reais', () => {
  it('UF (SP), exterior (ZZ) e capital (São Paulo)', () => {
    const sp = map.resumoDoResultado(res('6257/dados/sp/sp-c0001-e006257-u.json'), R('pres-t1'), races, false, 'SP').resumo;
    expect(sp.votos).toEqual([9_505_413, 12_922_023, 2_455_512]);
    expect(sp.secoes).toBe(103_656);
    expect(pctValidos(sp, 1).toFixed(2)).toBe('51.93');

    const zz = map.resumoDoResultado(res('6257/dados/zz/zz-c0001-e006257-u.json'), R('pres-t1'), races, false, 'ZZ').resumo;
    expect(zz.votos).toEqual([157_387, 143_900, 29_595]);
    expect(zz.lider).toBe(0);
    expect(zz.abstencao).toBe(574_345);

    const sampa = map.resumoDoResultado(res('6257/dados/sp/sp71072-c0001-e006257-u.json'), R('pres-t1'), races, false, 'SP').resumo;
    expect(sampa.votos).toEqual([3_052_349, 2_760_747, 739_724]);
    expect(sampa.secoes).toBe(26_683);
    expect(soma(sampa.votos) + sampa.brancos + sampa.nulos).toBe(7_006_411);
  });

  it('município pequeno (Acrelândia/AC) e sua zona única', () => {
    const mun = map.resumoDoResultado(res('6257/dados/ac/ac01120-c0001-e006257-u.json'), R('pres-t1'), races, false, 'AC').resumo;
    expect(mun.votos).toEqual([1_508, 5_940, 343]);
    expect([mun.brancos, mun.nulos, mun.comparecimento, mun.abstencao]).toEqual([56, 208, 8_055, 2_152]);
    expect([mun.secoes, mun.eleitorado]).toEqual([45, 10_207]);
    const zona = map.resumoDoResultado(res('6257/dados/ac/ac01120-z0008-c0001-e006257-u.json'), R('pres-t1'), races, false, 'AC').resumo;
    expect(zona.votos).toEqual(mun.votos);
    expect(zona.secoes).toBe(45);
  });

  it('zona de São Paulo (z0001)', () => {
    const z = map.resumoDoResultado(res('6257/dados/sp/sp71072-z0001-c0001-e006257-u.json'), R('pres-t1'), races, false, 'SP').resumo;
    expect(z.votos).toEqual([61_959, 31_345, 8_967]);
    expect(z.secoes).toBe(449);
  });

  it('Governador RJ 1º turno: "anulado sub judice" entra em Outros, como no pvap oficial', () => {
    const rj = map.resumoDoResultado(res('6259/dados/rj/rj-c0003-e006259-u.json'), R('gov-rj-t1'), races, true, 'RJ');
    expect(rj.race.id).toBe('gov-rj-t1');
    expect(R('gov-rj-t1').candidatos.map((c) => c.numero)).toEqual([22, 55, 0]);
    const s = rj.resumo;
    expect(s.votos).toEqual([4_271_199, 3_706_984, 690_855]); // Outros inclui Garotinho (274.411, sub judice)
    expect(soma(s.votos)).toBe(8_669_038); // = vvc
    expect([s.brancos, s.nulos]).toEqual([501_537, 675_292]);
    expect(soma(s.votos) + s.brancos + s.nulos).toBe(9_845_867);
    expect(pctValidos(s, 0).toFixed(2)).toBe('49.27'); // pvap oficial de Douglas Ruas
    expect(pctValidos(s, 1).toFixed(2)).toBe('42.76');
    // horário: arquivo do RJ "04/10/2026 22:19:52" (Brasília)
    expect(s.ultimaAtualizacao).toBe(Date.UTC(2026, 9, 5, 1, 19, 52));
  });
});

describe('2º turno (arquivo publicado, ainda zerado)', () => {
  const arq = res('6258/dados/br/br-c0001-e006258-u.json');
  const r = map.resumoDoResultado(arq, R('pres'), races, true, 'BR');
  it('aguardando, sem líder', () => {
    expect(r.race.id).toBe('pres');
    expect(r.turno).toBe(2);
    expect(r.resumo.status).toBe('aguardando');
    expect(r.resumo.votos).toEqual([0, 0]);
    expect(r.resumo.lider).toBeNull();
    expect(r.resumo.eleito).toBeNull();
    expect(r.resumo.ultimaAtualizacao).toBeNull();
    expect(map.restanteDe(r.resumo, R('pres').candidatos).necessarioParaVirar).toBeNull();
  });

  it('"Eleito" do TSE só vale na abrangência da disputa', () => {
    const final = structuredClone(arq);
    final.s.st = final.s.ts;
    final.tf = 's';
    const cands = map.candidatosDoArquivo(final);
    for (const c of cands) {
      c.vap = c.n === '13' ? '100' : '90';
      c.e = c.n === '13' ? 's' : 'n';
      c.st = c.n === '13' ? 'Eleito' : 'Não eleito';
    }
    final.v.vvc = '190';
    expect(map.eleitoDoTse(final, R('pres'))).toBe(0);
    expect(map.resumoDoResultado(final, R('pres'), races, true, 'BR').resumo.eleito).toBe(0);
    // numa UF onde 22 venceu, o "Eleito" (nacional) do candidato 13 não pode virar vencedor local
    for (const c of map.candidatosDoArquivo(final)) c.vap = c.n === '13' ? '10' : '20';
    final.v.vvc = '30';
    const uf = map.resumoDoResultado(final, R('pres'), races, false, 'SP').resumo;
    expect(uf.lider).toBe(1);
    expect(uf.eleito).toBe(1); // encerrada ⇒ vencedor local pela regra do contrato
    expect(map.situacaoEleito('2º turno')).toBe(false);
    expect(map.situacaoEleito('Não eleito')).toBe(false);
    expect(map.situacaoEleito('Eleita')).toBe(true);
  });
});

describe('status e regra de "eleito"', () => {
  it('statusDoFeed', () => {
    expect(map.statusDoFeed({ tf: 'n', and: 'n', s: { ts: '10', st: '0' } })).toBe('aguardando');
    expect(map.statusDoFeed({ tf: 'n', and: 'p', s: { ts: '10', st: '3' } })).toBe('apurando');
    expect(map.statusDoFeed({ tf: 'n', s: { ts: '10', st: '10' } })).toBe('encerrada');
    expect(map.statusDoFeed({ tf: 's', s: { ts: '10', st: '9' } })).toBe('encerrada');
  });

  it('matematicamente definido: diferença > eleitorado não totalizado', () => {
    const cands = R('pres').candidatos;
    const base = { ...map.tallyVazio(2), secoes: 100, secoesTotalizadas: 90, eleitorado: 1_000, eleitoradoTotalizado: 900 };
    const quase = map.resumir({ ...base, votos: [500, 400] }, cands, { status: 'apurando', ultimaAtualizacao: null });
    expect(quase.lider).toBe(0);
    expect(quase.eleito).toBeNull(); // 100 = 100 não basta
    const def = map.resumir({ ...base, votos: [501, 400] }, cands, { status: 'apurando', ultimaAtualizacao: null });
    expect(def.eleito).toBe(0);
    const emp = map.resumir({ ...base, votos: [450, 450] }, cands, { status: 'encerrada', ultimaAtualizacao: null });
    expect(emp.lider).toBeNull();
    expect(emp.eleito).toBeNull();
  });

  it('restante e "para virar" (mesma fórmula do motor)', () => {
    const s: Summary = {
      ...map.tallyVazio(2),
      secoes: 100,
      secoesTotalizadas: 50,
      eleitorado: 2_000,
      eleitoradoTotalizado: 1_000,
      comparecimento: 800,
      votos: [420, 380],
      status: 'apurando',
      lider: 0,
      eleito: null,
      ultimaAtualizacao: null,
    };
    const r = map.restanteDe(s, R('pres').candidatos);
    expect(r.eleitorado).toBe(1_000);
    expect(r.validosEstimados).toBe(800); // 1000 × 800/1000
    expect(r.necessarioParaVirar).toBeCloseTo(((40 / 800 + 1) / 2) * 100, 10); // 52,5%
  });

  it('soma de UFs por região', () => {
    const c = R('pres-t1').candidatos;
    const ac = map.resumoDoResultado(res('6257/dados/ac/ac-c0001-e006257-u.json'), R('pres-t1'), races, false, 'AC').resumo;
    const sp = map.resumoDoResultado(res('6257/dados/sp/sp-c0001-e006257-u.json'), R('pres-t1'), races, false, 'SP').resumo;
    const reg = map.regioesDe({ AC: ac, SP: sp }, c);
    expect(reg.N!.votos).toEqual(ac.votos);
    expect(reg.SE!.votos).toEqual(sp.votos);
    const tot = map.somarResumos([ac, sp], c);
    expect(tot.votos).toEqual([134_770 + 9_505_413, 302_807 + 12_922_023, 31_489 + 2_455_512]);
    expect(tot.status).toBe('encerrada');
  });
});

describe('acompanhamento (ab), municípios (cm) e seções (cs)', () => {
  it('ab da UF: seções e eleitorado por município, hora local do Acre', () => {
    const ab = jsonFixture<TseAcompanhamentoArquivo>('ele2026/6257/dados/ac/ac-e006257-ab.json');
    const porMun = map.acompanhamentoPorMunicipio(ab.abr);
    expect(porMun.size).toBe(22);
    const it = porMun.get('01120')!;
    const s = map.resumoDoAcompanhamento(it, R('pres-t1').candidatos, 'AC');
    expect([s.secoes, s.secoesTotalizadas, s.eleitorado, s.comparecimento, s.abstencao]).toEqual([45, 45, 10_207, 8_055, 2_152]);
    expect(s.votos).toEqual([0, 0, 0]);
    expect(s.lider).toBeNull();
    // "04/10/2026 17:03:30" no Acre = 19:03:30 em Brasília
    expect(s.ultimaAtualizacao).toBe(Date.UTC(2026, 9, 4, 22, 3, 30));
    expect(map.versaoAcompanhamento(it)).toBe(45);
  });

  it('cm: municípios por UF com IBGE, capital e zonas', () => {
    const cm = jsonFixture('ele2026/6257/config/mun-e006257-cm.json');
    const porUf = map.municipiosDoCm(cm);
    const ac = porUf.get('AC')!;
    expect(ac).toHaveLength(22);
    const rb = ac.find((m) => m.cod === '01392')!;
    expect(rb).toMatchObject({ nome: 'Rio Branco', ibge: '1200401', capital: true });
    const sp = porUf.get('SP')!.find((m) => m.cod === '71072')!;
    expect(sp.capital).toBe(true);
    expect(sp.zonas).toHaveLength(57);
    expect(porUf.get('ZZ')![0]).toMatchObject({ cod: '29459', nome: 'Budapeste', ibge: '' });
  });

  it('cs: seções ativas (sem as agregadas) e mosaico status-only', () => {
    const cs = map.secoesDoCs(jsonFixture<TseSecoesArquivo>('ele2026/arquivo-urna/3220/config/ac/ac-p003220-cs.json'));
    const z = cs.municipios.get('01120')!.get(8)!;
    expect(z.secoes).toHaveLength(45); // = s.ts do município
    expect(z.agregadas.get(178)).toBe(160);
    expect(z.secoes.every((s) => s.publicadaEm !== null)).toBe(true);
    const mos = map.mosaicoStatus(z);
    expect(mos.zona).toBe(8);
    expect(decodeFaixas(mos.faixas)).toEqual(z.secoes.map((s) => s.ns));
    expect(mos.estado).toBe('t'.repeat(45));
    // antes da publicação ('da' ausente) a seção fica '0'
    const parcial = map.mosaicoStatus({ zona: 8, secoes: [{ ns: 9, publicadaEm: null }, { ns: 8, publicadaEm: 1 }] });
    expect(parcial).toEqual({ zona: 8, faixas: '8-9', estado: 't0' });
    expect(map.secaoStatusOnly({ ns: 9, publicadaEm: null })).toMatchObject({ secao: 9, totalizada: false, votos: [] });
  });
});

describe('boletim de urna (bu.dat) de 3 seções reais', () => {
  const dir = 'ele2026/arquivo-urna/3220/dados';
  const carregar = (uf: string, mun: string, z: string, s: string) => {
    const base = `${dir}/${uf}/${mun}/${z}/${s}`;
    const aux = jsonFixture<TseAuxArquivo>(`${base}/p003220-${uf}-m${mun}-z${z}-s${s}-aux.json`);
    const h = map.hashVigente(aux)!;
    const nome = map.arquivoBu(h)!;
    return { aux, h, bu: lerBoletimUrna(lerFixture(`${base}/${h.hash}/${nome}`)) };
  };
  const ctx = (race: Race, uf: 'AC' | 'SP' | 'ZZ', cod: string, zona: number, secao: number, extra = {}) => ({
    race,
    uf,
    cod,
    nomeMunicipio: 'X',
    zona,
    secao,
    eleicao: 6257,
    cargo: 1,
    totalizadaEm: null,
    ...extra,
  });

  it('Porto Walter/AC, zona 4, seção 77', () => {
    const { aux, h, bu } = carregar('ac', '01066', '0004', '0077');
    expect(aux.st).toBe('Totalizada');
    expect(h.st).toBe('Totalizado');
    expect(bu).toMatchObject({ fase: 2, municipio: 1066, zona: 4, secao: 77, local: 1031, comparecimento: 234 });
    expect(map.dataHoraUrna(bu.encerramento)).toBe('04/10/2026 15:40:41'); // hora local do Acre
    const d = map.secaoDoBu(bu, ctx(R('pres-t1'), 'AC', '01066', 4, 77))!;
    expect(d.aptos).toBe(289);
    expect(d.comparecimento).toBe(234);
    expect(d.abstencao).toBe(55);
    expect(d.votos).toEqual([99, 103, 15]); // Lula, Flávio, Outros (4 + 5 + 6)
    expect([d.brancos, d.nulos]).toEqual([4, 13]);
    expect(soma(d.votos) + d.brancos + d.nulos).toBe(d.comparecimento);
    expect(d.codigoIdentificacao).toBe('093853352215815221270154');
    expect(d.simulado).toBe(false);
    // mesma urna, Governador (eleição 6259, cargo 3)
    expect(map.secaoDoBu(bu, ctx(R('gov-ac-t1'), 'AC', '01066', 4, 77, { eleicao: 6259, cargo: 3 }))!.comparecimento).toBe(234);
    // corrida de 2 candidatos: nominais de outros números viram nulos
    const d2 = map.secaoDoBu(bu, ctx(R('pres'), 'AC', '01066', 4, 77))!;
    expect(d2.votos).toEqual([99, 103]);
    expect(d2.nulos).toBe(13 + 15);
  });

  it('São Paulo, zona 1, seção 1', () => {
    const { bu } = carregar('sp', '71072', '0001', '0001');
    const d = map.secaoDoBu(bu, ctx(R('pres-t1'), 'SP', '71072', 1, 1))!;
    expect([d.aptos, d.comparecimento]).toEqual([362, 256]);
    expect(d.votos).toEqual([121, 96, 28]);
    expect([d.brancos, d.nulos]).toEqual([2, 9]);
    expect(soma(d.votos) + d.brancos + d.nulos).toBe(256);
  });

  it('Budapeste (exterior), seção 1695: número fora da disputa é nulo técnico', () => {
    const { bu } = carregar('zz', '29459', '0001', '1695');
    expect(bu.eleicoes.map((e) => e.idEleicao)).toEqual([6257]); // exterior só vota para Presidente
    const numeros = new Set(map.candidatosDoArquivo(res('6257/dados/br/br-c0001-e006257-u.json')).map((c) => map.int(c.n)));
    const d = map.secaoDoBu(bu, ctx(R('pres-t1'), 'ZZ', '29459', 1, 1695, { numerosValidos: numeros }))!;
    expect([d.aptos, d.comparecimento]).toEqual([540, 296]);
    expect(d.votos).toEqual([222, 48, 21]);
    expect([d.brancos, d.nulos]).toEqual([3, 2]); // 1 nulo + 1 voto no 28 (não é candidato)
    expect(soma(d.votos) + d.brancos + d.nulos).toBe(296);
    expect(map.secaoDoBu(bu, ctx(R('gov-ac-t1'), 'ZZ', '29459', 1, 1695, { eleicao: 6259, cargo: 3 }))).toBeNull();
  });
});
