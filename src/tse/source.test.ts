/**
 * TseSource ponta a ponta, sem rede: arquivos reais do 1º turno (fixtures) + cenários sintéticos de 2º turno
 * montados sobre o arquivo real (zerado) do 2º turno.
 */
import { describe, expect, it } from 'vitest';
import type { Race, TseConfig } from '../shared/types';
import { NotFoundError } from '../engine/api';
import { TseClient } from './client';
import { TseSource } from './source';
import type { TseAcompanhamentoArquivo, TseResultadoArquivo } from './feed';
import { BASE, criarFakeFetch, jsonFixture, type FakeFetch } from './__fixtures__/fake-fetch';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const CONFIG: TseConfig = { baseUrl: BASE, ciclo: 'ele2026', eleicaoPres: '6258', eleicaoGov: '6260', pleito: '3221', intervaloSeg: 15 };
/** Relógio do teste: 26/10/2026 00:00 de Brasília (depois de tudo). */
const AGORA = Date.UTC(2026, 9, 26, 3, 0, 0);

function criar(f: FakeFetch, extra: Partial<ConstructorParameters<typeof TseSource>[0]> = {}) {
  const logs: string[] = [];
  const client = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, now: () => AGORA });
  const src = new TseSource({ config: CONFIG, races, client, now: () => AGORA, log: (m) => logs.push(m), ...extra });
  return { src, logs };
}

async function ocioso(src: TseSource) {
  for (let i = 0; i < 400; i++) {
    const h = src.health();
    if (h.municipios.fila === 0 && h.municipios.baixando === 0 && h.http.emVoo === 0 && h.http.naFila === 0) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error('fila não esvaziou');
}

describe('corridas de 1º turno com dados reais', () => {
  it('nacional: Brasil, UFs, regiões e série', async () => {
    const { src } = criar(criarFakeFetch());
    const n = await src.nacional('PRES-T1');
    expect(n.race).toBe('pres-t1');
    expect(n.resumo.votos).toEqual([53_879_538, 56_104_503, 9_316_747]);
    expect(n.resumo.secoes).toBe(499_248);
    expect(n.resumo.status).toBe('encerrada');
    expect(n.ufs.SP!.votos).toEqual([9_505_413, 12_922_023, 2_455_512]);
    expect(n.ufs.ZZ!.votos).toEqual([157_387, 143_900, 29_595]);
    expect(n.ufs.BA!.status).toBe('aguardando'); // arquivo fora das fixtures → vazio, sem quebrar
    expect(Object.keys(n.ufs)).toHaveLength(28);
    expect(n.regioes.EX!.votos).toEqual(n.ufs.ZZ!.votos);
    expect(n.regioes.N!.votos).toEqual(n.ufs.AC!.votos);
    expect(n.serie).toHaveLength(1);
    expect(n.serie[0].pst).toBe(100);
    expect(n.eventos).toEqual([]); // 1ª observação: sem eventos inventados
    expect(n.restante).toEqual({ eleitorado: 0, validosEstimados: 0, necessarioParaVirar: null });
    expect(n.geradoEm).toBe(AGORA);
  });

  it('UF: municípios do cm, votos baixados em segundo plano, reserva pelo ab', async () => {
    const { src } = criar(criarFakeFetch());
    const u1 = await src.uf('pres-t1', 'ac');
    expect(u1.uf).toBe('AC');
    expect(u1.municipios).toHaveLength(22);
    expect(u1.resumo.votos).toEqual([134_770, 302_807, 31_489]);
    await ocioso(src);
    const u = await src.uf('pres-t1', 'AC');
    const acre = u.municipios.find((m) => m.cod === '01120')!;
    expect(acre).toMatchObject({ nome: 'Acrelândia', ibge: '1200013', capital: false, secoes: 45 });
    expect(acre.votos).toEqual([1_508, 5_940, 343]);
    expect(acre.lider).toBe(1);
    expect(acre.ultimaAtualizacao).toBe(Date.UTC(2026, 9, 4, 22, 3, 30)); // hora do Acre, pelo ab
    const rb = u.municipios.find((m) => m.cod === '01392')!;
    expect(rb.capital).toBe(true);
    expect(rb.votos).toEqual([56_423, 131_895, 18_536]);
    // Bujari: arquivo do município fora das fixtures → seções/eleitorado do ab, votos zerados
    const bujari = u.municipios.find((m) => m.cod === '01007')!;
    expect(bujari).toMatchObject({ secoes: 41, secoesTotalizadas: 41, eleitorado: 11_152, comparecimento: 8_657, lider: null });
    expect(bujari.votos).toEqual([0, 0, 0]);
  });

  it('município, zona (status das seções) e seção (BU real)', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f);
    const m = await src.municipio('pres-t1', 'AC', '1120');
    expect(m).toMatchObject({ race: 'pres-t1', uf: 'AC', cod: '01120', nome: 'Acrelândia', capital: false, primeiroTurno: null });
    expect(m.resumo.votos).toEqual([1_508, 5_940, 343]);
    expect(m.zonas).toHaveLength(1);
    expect(m.zonas[0]).toMatchObject({ zona: 8, secoes: 45 });
    expect(m.mosaico).toEqual([{ zona: 8, faixas: expect.any(String), estado: 't'.repeat(45) }]);

    const sp = await src.municipio('pres-t1', 'SP', '71072');
    expect(sp.nome).toBe('São Paulo');
    expect(sp.zonas).toHaveLength(57);
    expect(sp.zonas[0]).toMatchObject({ zona: 1, secoes: 449, votos: [61_959, 31_345, 8_967] });
    expect(sp.zonas[1].status).toBe('aguardando'); // zona sem fixture
    expect(sp.mosaico).toEqual([]); // sem cs de SP nas fixtures → mosaico vazio (ARCHITECTURE §6)

    const z = await src.zona('pres-t1', 'AC', '01066', 4);
    expect(z.resumo.votos).toEqual([3_208, 2_780, 308]); // Lula 50,95% (pvap oficial)
    expect(z.secoes).toHaveLength(34);
    expect(z.secoes[0]).toEqual({ secao: 77, totalizada: true, totalizadaEm: null, aptos: 0, comparecimento: 0, votos: [], brancos: 0, nulos: 0 });

    const s = await src.secao('pres-t1', 'AC', '01066', 4, 77);
    expect(s).toMatchObject({ race: 'pres-t1', nomeMunicipio: 'Porto Walter', zona: 4, secao: 77, totalizada: true, aptos: 289, comparecimento: 234 });
    expect(s!.votos).toEqual([99, 103, 15]);
    expect(s!.totalizadaEm).toBe(Date.UTC(2026, 9, 4, 21, 34, 8)); // aux: recebido 18:34:08
    const chamadas = f.chamadas.length;
    expect(await src.secao('pres-t1', 'AC', '01066', 4, 77)).toEqual(s); // cache
    expect(f.chamadas.length).toBe(chamadas);
    // a zona passa a mostrar os votos da seção já consultada
    const z2 = await src.zona('pres-t1', 'AC', '01066', 4);
    expect(z2.secoes[0]).toMatchObject({ secao: 77, aptos: 289, votos: [99, 103, 15] });

    // exterior: número 28 (não é candidato) vira nulo técnico; SP sem cs ainda resolve pelo aux
    expect((await src.secao('pres-t1', 'ZZ', '29459', 1, 1695))!.votos).toEqual([222, 48, 21]);
    expect((await src.secao('pres-t1', 'SP', '71072', 1, 1))!.votos).toEqual([121, 96, 28]);
    // agregada → null; inexistente → 404; existente sem BU → totalizada:false
    expect(await src.secao('pres-t1', 'AC', '01120', 8, 178)).toBeNull();
    await expect(src.secao('pres-t1', 'AC', '01120', 8, 999)).rejects.toBeInstanceOf(NotFoundError);
    const semBu = await src.secao('pres-t1', 'AC', '01120', 8, 8);
    expect(semBu).toMatchObject({ totalizada: false, secao: 8, votos: [0, 0, 0] });
  });

  it('404 coerente para escopos inexistentes', async () => {
    const { src } = criar(criarFakeFetch());
    await expect(src.nacional('xyz')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.uf('gov-rj', 'SP')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.uf('pres', 'XX')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.municipio('pres-t1', 'AC', '99999')).rejects.toBeInstanceOf(NotFoundError);
    await expect(src.zona('pres-t1', 'AC', '01120', 3)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Governador RJ 1º turno', async () => {
    const { src } = criar(criarFakeFetch());
    const n = await src.nacional('gov-rj-t1');
    expect(n.resumo.votos).toEqual([4_271_199, 3_706_984, 690_855]);
    expect(Object.keys(n.ufs)).toEqual(['RJ']);
    expect(n.regioes.SE!.votos).toEqual(n.resumo.votos);
    const rio = await src.municipio('gov-rj-t1', 'RJ', '60011');
    expect(rio.resumo.votos).toEqual([1_319_722, 1_730_683, 244_887]);
    expect(rio.zonas).toHaveLength(49);
  });
});

describe('2º turno', () => {
  it('antes da apuração: arquivos zerados/ausentes → aguardando; 1º turno local para comparação', async () => {
    const { src } = criar(criarFakeFetch());
    await src.pollOnce();
    const n = await src.nacional('pres');
    expect(n.race).toBe('pres');
    expect(n.resumo.status).toBe('aguardando');
    expect(n.resumo.votos).toEqual([0, 0]);
    expect(n.resumo.secoes).toBe(48_964); // o TSE ainda está carregando a configuração do 2º turno
    expect(n.ufs.SP!.secoes).toBe(33_403);
    const m = await src.municipio('pres', 'AC', '01120');
    expect(m.resumo.status).toBe('aguardando');
    expect(m.primeiroTurno).toEqual({ votos: [1_508, 5_940, 343], brancos: 56, nulos: 208, comparecimento: 8_055, eleitorado: 10_207 });
    const gov = await src.nacional('gov-rj');
    expect(gov.resumo.status).toBe('aguardando');
    const h = src.health();
    expect(h.ok).toBe(true);
    expect(h.corridas.find((c) => c.race === 'gov-rj')!.ausentes).toEqual(['RJ']);
    expect(h.corridas.find((c) => c.race === 'pres')!.ausentes).toContain('BA');
  });

  it('admin aponta "pres" para o 1º turno (ensaio): mapeia na corrida pres-t1', async () => {
    const { src } = criar(criarFakeFetch());
    src.setConfig({ eleicaoPres: '6257', pleito: '3220' });
    const n = await src.nacional('pres');
    expect(n.race).toBe('pres-t1');
    expect(n.resumo.votos).toEqual([53_879_538, 56_104_503, 9_316_747]);
    expect(src.health().corridas.find((c) => c.race === 'pres')!.mapeadaComo).toBe('pres-t1');
    expect((await src.secao('pres', 'AC', '01066', 4, 77))!.votos).toEqual([99, 103, 15]);
  });

  describe('apuração ao vivo (cenário sintético sobre o arquivo real do 2º turno)', () => {
    const base = jsonFixture<TseResultadoArquivo>('ele2026/6258/dados/br/br-c0001-e006258-u.json');
    const TS = 1_000;
    const TE = 100_000;
    type Passo = { st: number; lula: number; flavio: number; ht: string; eleito?: boolean };
    const arq = (p: Passo, abr: 'br' | 'sp', ts = TS): TseResultadoArquivo => {
      const d = structuredClone(base);
      const est = Math.round((TE * p.st) / ts);
      const c = p.lula + p.flavio + 30;
      Object.assign(d, { tpabr: abr === 'br' ? 'br' : 'uf', cdabr: abr, dt: p.st ? '25/10/2026' : '', ht: p.st ? p.ht : '' });
      d.tf = p.st >= ts ? 's' : 'n';
      d.and = p.st === 0 ? 'n' : p.st >= ts ? 'f' : 'p';
      Object.assign(d.s, { ts: String(ts), st: String(p.st) });
      Object.assign(d.e, { te: String(TE), est: String(est), c: String(c), a: String(est - c) });
      Object.assign(d.v, { tv: String(c), vvc: String(c - 30), vv: String(c - 30), vnom: String(c - 30), vb: '10', tvn: '20' });
      for (const cd of d.carg[0].agr.flatMap((a) => a.par.flatMap((x) => x.cand))) {
        cd.vap = String(cd.n === '13' ? p.lula : p.flavio);
        cd.e = p.eleito && cd.n === '13' ? 's' : 'n';
        cd.st = p.eleito ? (cd.n === '13' ? 'Eleito' : 'Não eleito') : '';
      }
      return d;
    };
    const passos: Passo[] = [
      { st: 0, lula: 0, flavio: 0, ht: '' },
      { st: 12, lula: 400, flavio: 600, ht: '17:04:10' },
      { st: 300, lula: 13_000, flavio: 14_000, ht: '17:40:00' },
      { st: 632, lula: 31_000, flavio: 30_000, ht: '18:20:30' },
      { st: TS, lula: 52_000, flavio: 47_000, ht: '20:01:02', eleito: true },
    ];

    function cenario() {
      const f = criarFakeFetch();
      let i = 0;
      f.rotas.set('ele2026/6258/dados/br/br-c0001-e006258-u.json', () => arq(passos[i], 'br'));
      f.rotas.set('ele2026/6258/dados/sp/sp-c0001-e006258-u.json', () => arq(passos[i], 'sp'));
      // ab de SP (6258) com São Paulo capital acompanhando o estado
      f.rotas.set('ele2026/6258/dados/sp/sp-e006258-ab.json', (): TseAcompanhamentoArquivo => {
        const p = passos[i];
        const b = arq(p, 'sp');
        return { ele: '6258', t: '2', dg: '25/10/2026', hg: p.ht, abr: [{ tpabr: 'mun', cdabr: '71072', dt: b.dt, ht: b.ht, s: b.s, e: b.e }] };
      });
      f.rotas.set('ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json', () => {
        const d = arq(passos[i], 'sp');
        return Object.assign(d, { tpabr: 'mu', cdabr: '71072' });
      });
      return { f, avancar: (k: number) => void (i = k) };
    }

    it('série, eventos neutros, virada, eleito e restante', async () => {
      const { f, avancar } = cenario();
      const { src } = criar(f);
      for (let k = 0; k < passos.length; k++) {
        avancar(k);
        await src.pollOnce();
        if (k === 3) {
          const n = await src.nacional('pres');
          expect(n.resumo.status).toBe('apurando');
          expect(n.resumo.lider).toBe(0);
          expect(n.restante.eleitorado).toBe(TE - 63_200);
          expect(n.restante.necessarioParaVirar).toBeGreaterThan(50);
        }
      }
      const n = await src.nacional('pres');
      expect(n.resumo.status).toBe('encerrada');
      expect(n.resumo.eleito).toBe(0);
      expect(n.serie.map((p) => p.pst)).toEqual([1.2, 30, 63.2, 100]);
      expect(n.serie[0].t).toBe(Date.UTC(2026, 9, 25, 20, 4, 10)); // dt/ht do arquivo Brasil
      expect(n.serie[2].pv[0]).toBeCloseTo((31_000 / 61_000) * 100, 10);
      const titulos = n.eventos.map((e) => e.titulo);
      expect(titulos).toContain('Começa a divulgação dos resultados');
      expect(titulos).toContain('Com 1,2% das seções totalizadas, Flávio Bolsonaro aparece à frente');
      expect(titulos).toContain('Com 63,2% das seções totalizadas, Lula passa à frente');
      expect(titulos).toContain('Eleição matematicamente definida: Lula');
      expect(titulos).toContain('São Paulo: Com 63,2% das seções totalizadas, Lula passa à frente');
      expect(titulos).toContain('São Paulo: totalização concluída');
      expect(n.eventos.find((e) => e.tipo === 'virada' && e.abrangencia === 'BR')!.t).toBe(Date.UTC(2026, 9, 25, 21, 20, 30));
      // mais recentes primeiro
      expect(n.eventos[n.eventos.length - 1].tipo).toBe('inicio');
      const ts = n.eventos.map((e) => e.t);
      expect([...ts].sort((a, b) => b - a)).toEqual(ts);

      const u = await src.uf('pres', 'SP');
      expect(u.serie).toHaveLength(4);
      expect(u.eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['marco', 'virada', 'uf-encerrada']));
      expect(u.eventos.every((e) => e.abrangencia === 'SP')).toBe(true);

      // histórico sobrevive a reinício
      const salvo = JSON.parse(JSON.stringify(src.exportarHistorico()));
      const { src: src2 } = criar(f, { historico: salvo });
      await src2.pollOnce();
      const n2 = await src2.nacional('pres');
      expect(n2.serie).toEqual(n.serie);
      expect(n2.eventos).toEqual(n.eventos);
    });

    it('aquecimento: UF em apuração tem os municípios atualizados em segundo plano', async () => {
      const { f, avancar } = cenario();
      const { src } = criar(f);
      avancar(3);
      await src.pollOnce();
      await ocioso(src);
      expect(f.chamadas.some((u) => u.endsWith('sp71072-c0001-e006258-u.json'))).toBe(true);
      const u = await src.uf('pres', 'SP');
      const sp = u.municipios.find((m) => m.cod === '71072')!;
      expect(sp.votos).toEqual([31_000, 30_000]);
      expect(sp.secoesTotalizadas).toBe(632);
      // UFs sem seções totalizadas e não consultadas não são varridas
      expect(f.chamadas.some((u) => u.includes('/6258/dados/ac/ac-e006258-ab.json'))).toBe(false);
    });

    it('TSE fora do ar: mantém o último dado bom e expõe a falha no health', async () => {
      const { f, avancar } = cenario();
      const { src, logs } = criar(f);
      avancar(2);
      await src.pollOnce();
      const antes = await src.nacional('pres');
      f.foraDoAr = true;
      await src.pollOnce();
      const depois = await src.nacional('pres');
      expect(depois.resumo.votos).toEqual(antes.resumo.votos);
      const h = src.health().corridas.find((c) => c.race === 'pres')!;
      expect(h.falhasConsecutivas).toBe(1);
      expect(h.erro).toMatch(/falha de rede/);
      expect(logs.some((l) => l.includes('falha ao ler'))).toBe(true);
      // arquivo corrompido também não substitui o dado bom
      f.foraDoAr = false;
      f.rotas.set('ele2026/6258/dados/br/br-c0001-e006258-u.json', { ele: '6258' });
      await src.pollOnce();
      expect((await src.nacional('pres')).resumo.votos).toEqual(antes.resumo.votos);
      avancar(3);
      f.rotas.set('ele2026/6258/dados/br/br-c0001-e006258-u.json', () => arq(passos[3], 'br'));
      await src.pollOnce();
      expect((await src.nacional('pres')).resumo.secoesTotalizadas).toBe(632);
      expect(src.health().corridas.find((c) => c.race === 'pres')!.falhasConsecutivas).toBe(0);
    });
  });

  it('testar(): resumo do feed para o admin', async () => {
    const { src } = criar(criarFakeFetch());
    const t = await src.testar();
    expect(t.ok).toBe(true);
    expect(t.detalhe).toMatch(/eleição 6258 \(2º turno\), 0 de 48964 seções/);
    const f = criarFakeFetch();
    f.foraDoAr = true;
    const { src: off } = criar(f);
    expect((await off.testar()).ok).toBe(false);
  });

  it('start()/stop() não deixam timers pendurados', async () => {
    const { src } = criar(criarFakeFetch());
    src.start();
    expect(src.ativo).toBe(true);
    await src.nacional('pres');
    src.stop();
    expect(src.ativo).toBe(false);
    expect(src.health().rodando).toBe(false);
  });
});
