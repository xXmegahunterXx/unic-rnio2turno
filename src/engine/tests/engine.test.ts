/**
 * Motor de simulação com o dataset REAL (public/data): determinismo, invariantes em vários instantes,
 * calibragem, curva de totalização, regra de "eleito", eventos, 1º turno e desempenho.
 */
import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '../../shared/constants';
import type { MunicipioSnapshot, NationalSnapshot, Summary, UF } from '../../shared/types';
import { NotFoundError, type Controller, type LoadedDataset } from '../api';
import { createController } from '../controller';
import { buildModel, type Model } from '../model';
import { cenarioDoPreset, PRESET_IDS } from '../presets';
import { alvosNeutros, cenarioPadrao, mesclaCenario } from '../scenario';
import { buildStructure, type Structure } from '../structure';
import { checaSoma, checaTally, dataset, relogio, semGeradoEm } from './helpers';

const INI = INICIO_APURACAO;
const GOVS = ['gov-ac', 'gov-am', 'gov-df', 'gov-es', 'gov-rj', 'gov-rn', 'gov-to'];
const pct0 = (s: Summary) => (100 * s.votos[0]) / (s.votos[0] + s.votos[1]);

// carregado no topo (os blocos `describe` montam controllers durante a coleta)
const ds: LoadedDataset = await dataset();
const st: Structure = buildStructure(ds);
const modelo: Model = buildModel(st, cenarioPadrao(st));

/** Controller demo pausado, com relógio controlável, posicionado em `pct`% via comando. */
function ctrlEm(preset?: string) {
  const r = relogio(Date.UTC(2026, 9, 25, 19, 0));
  const c = createController(ds, { modo: 'demo', now: r.now });
  if (preset) c.command({ tipo: 'preset', preset });
  c.command({ tipo: 'relogio', acao: 'pausar' });
  return { c, r, ir: (pct: number) => c.command({ tipo: 'saltar-pct', pct }) };
}

describe('estrutura e dataset', () => {
  it('bate com os totais oficiais do 1º turno', () => {
    expect(st.nSec).toBe(499_248);
    expect(st.nMun).toBe(5_757);
    expect(st.nUf).toBe(28);
    const eleit = Array.from(st.ufEleitorado).reduce((a, b) => a + b, 0);
    expect(eleit).toBe(158_745_502);
    expect(eleit).toBe(ds.meta.totaisPrimeiroTurno.eleitorado);
    expect(st.govRaces.map((g) => g.id)).toEqual(GOVS);
  });
});

describe('determinismo', () => {
  it('mesmo dataset + cenário + semente ⇒ arrays idênticos (estrutura reconstruída do zero)', () => {
    const st2 = buildStructure(ds);
    const m2 = buildModel(st2, cenarioPadrao(st2));
    for (const k of ['aptos', 'comp', 'pv0', 'pv1', 'pb', 'pn', 'gv0', 'gv1', 'gb', 'gn', 'chegada', 'ordem'] as const) {
      expect(Buffer.from(m2[k].buffer).equals(Buffer.from(modelo[k].buffer)), k).toBe(true);
    }
    expect(JSON.stringify(m2.timeline)).toBe(JSON.stringify(modelo.timeline));
  });

  it('semente diferente ⇒ números diferentes, mesmos totais de eleitorado', () => {
    const m3 = buildModel(st, { ...cenarioPadrao(st), seed: 7 });
    expect(Buffer.from(m3.pv0.buffer).equals(Buffer.from(modelo.pv0.buffer))).toBe(false);
    expect(m3.aptos.reduce((a, b) => a + b, 0)).toBe(modelo.aptos.reduce((a, b) => a + b, 0));
  });

  it('impressão digital estável do cenário padrão (muda só se o modelo mudar de propósito)', () => {
    // Soma ponderada simples de todas as seções — qualquer alteração de algoritmo/constante muda isto.
    let h = 0;
    for (let i = 0; i < st.nSec; i += 1) {
      h = (h * 31 + modelo.pv0[i] * 7 + modelo.pv1[i] * 3 + modelo.comp[i] + (modelo.chegada[i] % 9973)) % 2147483647;
    }
    expect(h).toBe(FINGERPRINT);
  });

  it('dois controllers com o mesmo estado e relógio produzem snapshots idênticos', () => {
    const a = ctrlEm();
    const b = ctrlEm();
    a.ir(42.5);
    b.ir(42.5);
    expect(semGeradoEm(b.c.nacional('pres'))).toEqual(semGeradoEm(a.c.nacional('pres')));
    expect(semGeradoEm(b.c.uf('pres', 'MG'))).toEqual(semGeradoEm(a.c.uf('pres', 'MG')));
    expect(semGeradoEm(b.c.municipio('gov-rj', 'RJ', '60011'))).toEqual(semGeradoEm(a.c.municipio('gov-rj', 'RJ', '60011')));
  });
});

describe('invariantes em vários instantes', () => {
  const { c, ir } = ctrlEm('equilibrio-a');
  const instantes = [0, 0.4, 30, 70, 99.5, 100];

  for (const pct of instantes) {
    it(`${pct}%: municípios = UF, UFs (+ZZ) = Brasil, regiões = Brasil, zonas = município, seções = zona`, () => {
      ir(pct);
      const nac = c.nacional('pres');
      checaTally(nac.resumo, 'BR');
      expect(nac.resumo.secoes).toBe(499_248);
      expect(nac.resumo.eleitorado).toBe(158_745_502);
      if (pct > 0) expect((100 * nac.resumo.secoesTotalizadas) / nac.resumo.secoes).toBeGreaterThanOrEqual(pct);
      else expect(nac.resumo.secoesTotalizadas).toBe(0);
      const ufs = Object.values(nac.ufs) as Summary[];
      expect(ufs.length).toBe(28);
      checaSoma(ufs, nac.resumo, 'UFs→BR');
      checaSoma(Object.values(nac.regioes) as Summary[], nac.resumo, 'regiões→BR');
      for (const [uf, s] of Object.entries(nac.ufs) as [UF, Summary][]) {
        checaTally(s, uf);
        const snap = c.uf('pres', uf);
        expect(snap.resumo).toEqual(s);
        snap.municipios.forEach((m) => checaTally(m, `${uf}/${m.cod}`));
        checaSoma(snap.municipios, snap.resumo, `mun→${uf}`);
      }
      // zonas e seções: todos os municípios do AC, DF e exterior + capitais grandes
      const muns: [UF, string][] = [];
      for (const uf of ['AC', 'DF', 'ZZ'] as UF[]) for (const m of ds.ufs[uf]!.municipios) muns.push([uf, m.cod]);
      muns.push(['SP', '71072'], ['RJ', '60011'], ['BA', '38490']);
      for (const [uf, cod] of muns) checaMunicipio(c, 'pres', uf, cod, uf === 'ZZ' || uf === 'AC');
      // governadores: UF = soma dos municípios; mesmo comparecimento/eleitorado que Presidente na UF
      for (const g of GOVS) {
        const gn = c.nacional(g);
        const uf = g.slice(4).toUpperCase() as UF;
        checaTally(gn.resumo, g);
        const gu = c.uf(g, uf);
        checaSoma(gu.municipios, gu.resumo, `${g} mun→UF`);
        expect(gn.resumo.comparecimento).toBe(nac.ufs[uf]!.comparecimento);
        expect(gn.resumo.eleitoradoTotalizado).toBe(nac.ufs[uf]!.eleitoradoTotalizado);
        expect(gn.resumo.secoesTotalizadas).toBe(nac.ufs[uf]!.secoesTotalizadas);
      }
      checaMunicipio(c, 'gov-rj', 'RJ', '60011', false);
      checaMunicipio(c, 'gov-df', 'DF', '97012', true);
    });
  }

  function checaMunicipio(ctrl: Controller, race: string, uf: UF, cod: string, todasZonas: boolean) {
    const m: MunicipioSnapshot = ctrl.municipio(race, uf, cod);
    checaTally(m.resumo, `${uf}/${cod}`);
    checaSoma(m.zonas, m.resumo, `zonas→${uf}/${cod}`);
    expect(m.mosaico.length).toBe(m.zonas.length);
    m.zonas.forEach((z, i) => {
      checaTally(z, `${uf}/${cod}/z${z.zona}`);
      const mos = m.mosaico[i];
      expect(mos.zona).toBe(z.zona);
      expect(mos.estado.length).toBe(z.secoes);
      expect(mos.estado.replace(/0/g, '').length).toBe(z.secoesTotalizadas);
      expect(/^[0a-hxz]*$/.test(mos.estado)).toBe(true);
    });
    expect(m.primeiroTurno).not.toBeNull();
    const zs = todasZonas ? m.zonas : m.zonas.slice(0, 2);
    for (const z of zs) {
      const zs2 = ctrl.zona(race, uf, cod, z.zona);
      const { zona: _z, ...semZona } = z;
      expect(zs2.resumo).toEqual(semZona);
      const partes: Summary[] = zs2.secoes.map((s) => ({
        secoes: 1,
        secoesTotalizadas: s.totalizada ? 1 : 0,
        eleitorado: s.aptos,
        eleitoradoTotalizado: s.totalizada ? s.aptos : 0,
        comparecimento: s.comparecimento,
        abstencao: s.totalizada ? s.aptos - s.comparecimento : 0,
        votos: s.votos,
        brancos: s.brancos,
        nulos: s.nulos,
        status: 'apurando',
        lider: null,
        eleito: null,
        ultimaAtualizacao: s.totalizadaEm,
      }));
      checaSoma(partes, zs2.resumo, `seções→${uf}/${cod}/z${z.zona}`);
      for (const s of zs2.secoes) {
        expect(s.votos[0] + s.votos[1] + s.brancos + s.nulos).toBe(s.comparecimento);
        if (!s.totalizada) expect(s.comparecimento + s.votos[0] + s.votos[1] + s.brancos + s.nulos).toBe(0);
        else expect(s.comparecimento).toBeLessThanOrEqual(s.aptos);
      }
      const s0 = zs2.secoes[0];
      const det = ctrl.secao(race, uf, cod, z.zona, s0.secao)!;
      expect(det.secao).toBe(s0.secao);
      expect(det.votos).toEqual(s0.votos);
      expect(det.simulado).toBe(true);
      expect(det.codigoIdentificacao).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
      expect(det.abstencao).toBe(det.totalizada ? det.aptos - det.comparecimento : 0);
    }
  }
});

describe('calibragem', () => {
  it('padrão neutro = 1º turno com transferência 50/50 (valores derivados do dataset)', () => {
    const n = alvosNeutros(st);
    expect(n.pres).toBe(49.07);
    expect(n.gov).toEqual({
      'gov-ac': 41.25,
      'gov-am': 41.93,
      'gov-df': 57.73,
      'gov-es': 57.79,
      'gov-rj': 53.25,
      'gov-rn': 49.61,
      'gov-to': 50.79,
    });
  });

  it.each(PRESET_IDS)('preset %s: resultado final = alvo ± 0,05 p.p. (Presidente e cada governador)', (id) => {
    const cen = cenarioDoPreset(st, id, 20261025);
    const m = buildModel(st, cen);
    expect(Math.abs(m.calib.pres!.resultado - cen.alvoPres)).toBeLessThan(0.05);
    for (const g of m.calib.gov) expect(Math.abs(g.resultado - cen.alvoGov[g.race]), g.race).toBeLessThan(0.05);
    // e o snapshot a 100% mostra exatamente isso
    const { c, ir } = ctrlEm(id);
    ir(100);
    expect(Math.abs(pct0(c.nacional('pres').resumo) - cen.alvoPres)).toBeLessThan(0.05);
    for (const g of GOVS) expect(Math.abs(pct0(c.nacional(g).resumo) - cen.alvoGov[g])).toBeLessThan(0.05);
  });

  it('semente diferente mantém a calibragem', () => {
    for (const seed of [1, 99, 123456789]) {
      const m = buildModel(st, { ...cenarioPadrao(st), seed, alvoPres: 51.3 });
      expect(Math.abs(m.calib.pres!.resultado - 51.3)).toBeLessThan(0.05);
    }
  });

  it('ufVies desloca a UF e (de propósito) o resultado nacional', () => {
    const base = cenarioPadrao(st);
    const cen = mesclaCenario(base, { ufVies: { BA: 5 } }, st);
    const m = buildModel(st, cen);
    expect(m.calib.pres!.resultado).toBeGreaterThan(base.alvoPres + 0.2);
    const ba = st.ufIndex.get('BA')!;
    const soma = (mm: Model, a: Int32Array) => {
      let s = 0;
      for (let i = st.ufSecStart[ba]; i < st.ufSecEnd[ba]; i++) s += a[i];
      return s;
    };
    const p = (mm: Model) => (100 * soma(mm, mm.pv0)) / (soma(mm, mm.pv0) + soma(mm, mm.pv1));
    const d = p(m) - p(modelo);
    expect(d).toBeGreaterThan(2.5); // ~+5 p.p. no centro da escala; menos nos extremos (BA ≈ 69%)
    expect(d).toBeLessThan(6);
  });

  it('comparecimento, brancos e nulos ficam próximos do 1º turno no padrão', () => {
    const { c, ir } = ctrlEm();
    ir(100);
    const r = c.nacional('pres').resumo;
    const t = ds.meta.totaisPrimeiroTurno;
    expect(Math.abs(r.comparecimento / t.comparecimento - 1)).toBeLessThan(0.002);
    expect(Math.abs(r.brancos / t.brancos - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.nulos / t.nulos - 1)).toBeLessThan(0.01);
  });
});

describe('robustez', () => {
  it('parâmetros extremos: calibra, sem NaN, invariantes a 100%', () => {
    const extremos = [
      { alvoPres: 5, intensidadeRegional: 1.5, ruidoSecao: 1, transferenciaOutros: 0 },
      { alvoPres: 95, intensidadeRegional: 0, ruidoSecao: 0, transferenciaOutros: 1 },
      { comparecimentoDelta: -30, brancosFator: 5, nulosFator: 0, ordemRegional: 'aleatoria' as const },
      { comparecimentoDelta: 30, brancosFator: 0, nulosFator: 5, ritmo: 'rapido' as const, alvoGov: { 'gov-to': 99 } },
    ];
    for (const e of extremos) {
      const cen = mesclaCenario(cenarioPadrao(st), e, st);
      const m = buildModel(st, cen);
      expect(Math.abs(m.calib.pres!.resultado - cen.alvoPres), JSON.stringify(e)).toBeLessThan(0.05);
      for (const g of m.calib.gov) expect(Math.abs(g.resultado - cen.alvoGov[g.race])).toBeLessThan(0.05);
      for (let i = 0; i < st.nSec; i++) {
        if (!(m.comp[i] >= 0 && m.comp[i] <= m.aptos[i] && m.pv0[i] >= 0 && m.pv1[i] >= 0 && m.pb[i] >= 0 && m.pn[i] >= 0))
          throw new Error(`seção ${i} inválida com ${JSON.stringify(e)}`);
        if (m.pv0[i] + m.pv1[i] + m.pb[i] + m.pn[i] !== m.comp[i]) throw new Error(`seção ${i}: soma ≠ comparecimento`);
        if (m.gv0[i] + m.gv1[i] + m.gb[i] + m.gn[i] !== (st.ufGovSlot[st.secUf[i]] >= 0 ? m.comp[i] : 0))
          throw new Error(`seção ${i}: governador ≠ comparecimento`);
      }
    }
  });

  it('ordem aleatória: mesma curva nacional (só muda quem chega antes) e determinística', () => {
    const cen = mesclaCenario(cenarioPadrao(st), { ordemRegional: 'aleatoria' }, st);
    const a = buildModel(st, cen);
    const b = buildModel(st, cen);
    expect(Buffer.from(a.chegada.buffer).equals(Buffer.from(b.chegada.buffer))).toBe(true);
    const q = (m: Model, p: number) => m.chegadaOrd[Math.ceil((p / 100) * m.chegadaOrd.length) - 1];
    for (const p of [1, 50, 90]) expect(Math.abs(q(a, p) - q(modelo, p))).toBeLessThan(60_000);
  });

  it('restante: "para virar" entre 50% e 100% para quem está atrás; null depois de eleito', () => {
    const { c, ir } = ctrlEm('equilibrio-a');
    ir(50);
    const n = c.nacional('pres');
    expect(n.restante.eleitorado).toBe(n.resumo.eleitorado - n.resumo.eleitoradoTotalizado);
    expect(n.restante.validosEstimados).toBeGreaterThan(0);
    expect(n.restante.necessarioParaVirar).toBeGreaterThan(50);
    expect(n.restante.necessarioParaVirar).toBeLessThan(60);
    ir(100);
    expect(c.nacional('pres').restante).toEqual({ eleitorado: 0, validosEstimados: 0, necessarioParaVirar: null });
    ir(0);
    expect(c.nacional('pres').restante.necessarioParaVirar).toBeNull();
  });
});

describe('curva de totalização (ritmo normal)', () => {
  const hm = (h: number, m: number) => Date.UTC(2026, 9, 25, h + 3, m);
  const pctEm = (m: Model, t: number) => {
    let k = 0;
    const x = t - INI;
    for (let j = 0; j < m.chegadaOrd.length; j++) if (m.chegadaOrd[j] <= x) k = j + 1;
    return (100 * k) / m.chegadaOrd.length;
  };
  const tPct = (m: Model, pct: number) => INI + m.chegadaOrd[Math.ceil((pct / 100) * m.chegadaOrd.length) - 1];

  it('~1% às 17:05 · 50% entre 17:50 e 18:05 · ~90% às 18:50 · ~99% às 19:45 · 100% até 22:00', () => {
    expect(pctEm(modelo, hm(17, 5))).toBeGreaterThan(0.8);
    expect(pctEm(modelo, hm(17, 5))).toBeLessThan(1.2);
    expect(tPct(modelo, 50)).toBeGreaterThanOrEqual(hm(17, 50));
    expect(tPct(modelo, 50)).toBeLessThanOrEqual(hm(18, 5));
    expect(Math.abs(tPct(modelo, 90) - hm(18, 50))).toBeLessThanOrEqual(3 * 60_000);
    expect(Math.abs(tPct(modelo, 99) - hm(19, 45))).toBeLessThanOrEqual(3 * 60_000);
    expect(tPct(modelo, 100)).toBeLessThanOrEqual(hm(22, 0));
    expect(tPct(modelo, 100)).toBeGreaterThan(hm(21, 30));
    expect(modelo.chegadaOrd[0]).toBeGreaterThan(0); // nada às 17:00:00
  });

  it('ritmo lento/rápido escalam a curva; ufAtraso atrasa só a UF', () => {
    const lento = buildModel(st, mesclaCenario(cenarioPadrao(st), { ritmo: 'lento' }, st));
    const rapido = buildModel(st, mesclaCenario(cenarioPadrao(st), { ritmo: 'rapido' }, st));
    const d50 = tPct(modelo, 50) - INI;
    expect((tPct(lento, 50) - INI) / d50).toBeCloseTo(1.4, 2);
    expect((tPct(rapido, 50) - INI) / d50).toBeCloseTo(0.75, 2);
    const atr = buildModel(st, mesclaCenario(cenarioPadrao(st), { ufAtraso: { RS: 30 } }, st));
    const rs = st.ufIndex.get('RS')!;
    const sp = st.ufIndex.get('SP')!;
    expect(atr.chegada[st.ufSecStart[rs]] - modelo.chegada[st.ufSecStart[rs]]).toBe(30 * 60_000);
    expect(atr.chegada[st.ufSecStart[sp]]).toBe(modelo.chegada[st.ufSecStart[sp]]);
  });

  it('ordem realista: Sul antes do Nordeste (medianas por região)', () => {
    const medReg = (reg: string) => {
      const xs: number[] = [];
      for (let u = 0; u < st.nUf; u++)
        if (st.ufRegiao[u] === reg) for (let i = st.ufSecStart[u]; i < st.ufSecEnd[u]; i++) xs.push(modelo.chegada[i]);
      xs.sort((a, b) => a - b);
      return xs[xs.length >> 1];
    };
    expect(medReg('S')).toBeLessThan(medReg('SE'));
    expect(medReg('SE')).toBeLessThan(medReg('NE'));
    expect(medReg('NE')).toBeLessThan(medReg('N'));
  });
});

describe('eventos e "eleito"', () => {
  it('Summary.eleito vira exatamente no instante do evento "eleito" e segue a regra', () => {
    for (const preset of ['padrao', 'equilibrio-a', 'empate-a']) {
      const { c, r } = ctrlEm(preset);
      c.command({ tipo: 'saltar-pct', pct: 100 });
      const evs = c.nacional('pres').eventos;
      const el = evs.find((e) => e.tipo === 'eleito' && e.abrangencia === 'BR')!;
      expect(el, preset).toBeTruthy();
      // bucket de 1 s que contém o evento e o bucket anterior
      const tEv = Math.ceil(el.t / 1000) * 1000;
      c.command({ tipo: 'saltar-tempo', simNow: tEv - 1000 });
      const antes = c.nacional('pres').resumo;
      expect(antes.eleito, preset).toBeNull();
      c.command({ tipo: 'saltar-tempo', simNow: tEv });
      const depois = c.nacional('pres').resumo;
      expect(depois.eleito).toBe(el.candidato);
      expect(depois.lider).toBe(el.candidato);
      const diff = Math.abs(depois.votos[0] - depois.votos[1]);
      expect(diff > depois.eleitorado - depois.eleitoradoTotalizado || depois.status === 'encerrada').toBe(true);
      void r;
    }
  });

  it('preset realista tem virada nacional; textos neutros com nomes de urna; feed ordenado e limitado', () => {
    const { c, ir } = ctrlEm('equilibrio-a');
    ir(100);
    const nac: NationalSnapshot = c.nacional('pres');
    const evs = nac.eventos;
    expect(evs.length).toBeLessThanOrEqual(60);
    for (let i = 1; i < evs.length; i++) expect(evs[i - 1].t).toBeGreaterThanOrEqual(evs[i].t);
    const virada = evs.find((e) => e.tipo === 'virada' && e.abrangencia === 'BR');
    expect(virada).toBeTruthy();
    expect(virada!.titulo).toMatch(/^Com \d+,\d% das seções totalizadas, Lula passa à frente$/);
    const nomes = ds.meta.races.find((r) => r.id === 'pres')!.candidatos.map((x) => x.nomeUrna);
    for (const e of evs) {
      expect(e.t).toBeGreaterThanOrEqual(INI);
      expect(e.race).toBe('pres');
      expect(/[!]|esmagador|derrota|vitória (fácil|apertada)|humilh|surpreend/i.test(e.titulo + (e.detalhe ?? ''))).toBe(false);
      if (e.candidato !== undefined) expect(e.titulo.includes(nomes[e.candidato]) || e.tipo === 'uf-encerrada').toBe(true);
    }
    expect(evs.some((e) => e.titulo === 'Bahia conclui a apuração')).toBe(true);
    expect(evs.some((e) => e.titulo === 'Lula está matematicamente eleito')).toBe(true);
  });

  it('limite por UF: no máximo 1 virada por UF a cada 10 min simulados; liderança inicial só no feed da UF', () => {
    const { c, ir } = ctrlEm('equilibrio-a');
    ir(100);
    for (const uf of st.ufs) {
      const evs = c.uf('pres', uf).eventos.filter((e) => e.abrangencia === uf && (e.tipo === 'virada' || e.tipo === 'lideranca'));
      const ts = evs.map((e) => e.t).sort((a, b) => a - b);
      for (let i = 1; i < ts.length; i++) expect(ts[i] - ts[i - 1]).toBeGreaterThanOrEqual(10 * 60_000);
    }
    const nac = c.nacional('pres').eventos;
    expect(nac.some((e) => e.tipo === 'lideranca' && e.abrangencia !== 'BR')).toBe(false);
  });

  it('governadores: marcos, liderança e vitória definida (texto sem flexão de gênero)', () => {
    const { c, ir } = ctrlEm();
    ir(100);
    for (const g of GOVS) {
      const evs = c.nacional(g).eventos;
      expect(evs.some((e) => e.tipo === 'inicio')).toBe(true);
      expect(evs.filter((e) => e.tipo === 'marco').length).toBe(6);
      const el = evs.find((e) => e.tipo === 'eleito')!;
      expect(el.titulo).toMatch(/^(A vitória de .+ está matematicamente definida|Com 100% das seções totalizadas, .+ vence a eleição)$/);
      expect(c.nacional(g).resumo.eleito).toBe(el.candidato);
    }
  });

  it('série: pontos crescentes, último ponto = placar atual, % válidos somam 100', () => {
    const { c, ir } = ctrlEm('equilibrio-a');
    for (const pct of [3, 37.5, 81, 100]) {
      ir(pct);
      for (const s of [c.nacional('pres'), c.uf('pres', 'SP'), c.nacional('gov-rj')]) {
        const serie = s.serie;
        expect(serie.length).toBeGreaterThan(0);
        for (let i = 1; i < serie.length; i++) {
          expect(serie[i].t).toBeGreaterThanOrEqual(serie[i - 1].t);
          expect(serie[i].pst).toBeGreaterThanOrEqual(serie[i - 1].pst);
        }
        for (const p of serie) expect(Math.round((p.pv[0] + p.pv[1]) * 100)).toBe(10000);
        const last = serie[serie.length - 1];
        expect(last.pst).toBeCloseTo((100 * s.resumo.secoesTotalizadas) / s.resumo.secoes, 2);
        expect(last.pv[0]).toBeCloseTo(pct0(s.resumo), 2);
        expect(last.t).toBe(s.resumo.ultimaAtualizacao);
      }
    }
  });
});

describe('1º turno (dataset oficial)', () => {
  const { c } = ctrlEm();

  it('pres-t1 nacional bate com os totais oficiais', () => {
    const n = c.nacional('pres-t1');
    const t = ds.meta.totaisPrimeiroTurno;
    const r = n.resumo;
    expect(r.secoes).toBe(t.secoes);
    expect(r.secoesTotalizadas).toBe(t.secoes);
    expect(r.eleitorado).toBe(t.eleitorado);
    expect(r.comparecimento).toBe(t.comparecimento);
    expect(r.brancos).toBe(t.brancos);
    expect(r.nulos).toBe(t.nulos);
    expect(r.votos.reduce((a, b) => a + b, 0)).toBe(t.validos);
    expect(r.votos).toEqual([53_879_538, 56_104_503, 9_316_747]);
    expect(r.status).toBe('encerrada');
    expect(r.eleito).toBeNull();
    expect(r.lider).toBe(1);
    expect(n.serie).toEqual([]);
    expect(n.eventos).toEqual([]);
    checaSoma(Object.values(n.ufs) as Summary[], r, 't1 UFs→BR');
    checaSoma(Object.values(n.regioes) as Summary[], r, 't1 regiões→BR');
    for (const [uf, s] of Object.entries(n.ufs) as [UF, Summary][]) {
      checaTally(s, `t1 ${uf}`);
      const u = c.uf('pres-t1', uf);
      checaSoma(u.municipios, u.resumo, `t1 mun→${uf}`);
    }
  });

  it('gov-xx-t1: votos dos finalistas = primeiroTurno do dataset; "Outros" = válidos − finalistas', () => {
    for (const g of GOVS) {
      const race = ds.meta.races.find((r) => r.id === `${g}-t1`)!;
      const r = c.nacional(`${g}-t1`).resumo;
      expect(r.votos[0]).toBe(race.candidatos[0].primeiroTurno!.votos);
      expect(r.votos[1]).toBe(race.candidatos[1].primeiroTurno!.votos);
      expect(r.votos[2]).toBe(race.candidatos[2].primeiroTurno!.votos);
      checaTally(r, g);
    }
  });

  it('município no 1º turno: uma linha "todas as zonas" (zona 0), mosaico das zonas reais; zona/seção → 404', () => {
    const m = c.municipio('pres-t1', 'SP', '71072');
    expect(m.zonas.length).toBe(1);
    expect(m.zonas[0].zona).toBe(0);
    const { zona: _z, ...resumo } = m.zonas[0];
    expect(resumo).toEqual(m.resumo);
    expect(m.mosaico.length).toBe(57);
    const ch = m.mosaico[0].estado[0];
    expect(/[a-h]/.test(ch)).toBe(true);
    for (const z of m.mosaico) expect(z.estado).toBe(ch.repeat(z.estado.length));
    expect(m.primeiroTurno).toBeNull();
    expect(() => c.zona('pres-t1', 'SP', '71072', 1)).toThrow(NotFoundError);
    expect(() => c.secao('gov-rj-t1', 'RJ', '60011', 4, 1)).toThrow(/1º turno/);
  });

  it('município no 2º turno traz o 1º turno local na ordem da corrida -t1', () => {
    const m = c.municipio('pres', 'SP', '71072');
    const d = ds.ufs.SP!.municipios.find((x) => x.cod === '71072')!;
    expect(m.primeiroTurno!.votos[0]).toBe(d.t1.votos['13']);
    expect(m.primeiroTurno!.votos[1]).toBe(d.t1.votos['22']);
    expect(m.primeiroTurno!.comparecimento).toBe(d.t1.comparecimento);
    const g = c.municipio('gov-rj', 'RJ', '60011');
    expect(g.primeiroTurno!.votos.length).toBe(3);
  });
});

describe('escopos inexistentes → NotFoundError', () => {
  const { c } = ctrlEm();
  it.each([
    ['corrida', () => c.nacional('vereador')],
    ['UF fora da corrida', () => c.uf('gov-rj', 'SP')],
    ['UF desconhecida', () => c.uf('pres', 'XX' as UF)],
    ['exterior em governador', () => c.uf('gov-df', 'ZZ')],
    ['município', () => c.municipio('pres', 'SP', '99999')],
    ['zona', () => c.zona('pres', 'SP', '71072', 9999)],
    ['seção', () => c.secao('pres', 'SP', '71072', 1, 99999)],
  ])('%s', (_n, fn) => {
    expect(fn).toThrow(NotFoundError);
  });
  it('aceita UF/corrida em minúsculas e código sem zeros à esquerda', () => {
    expect(c.uf('PRES', 'sp' as UF).uf).toBe('SP');
    expect(c.municipio('pres', 'RO', '35').cod).toBe('00035');
  });
});

describe('desempenho', () => {
  it('constrói o modelo em < 1,5 s e responde snapshots em poucos ms', () => {
    const tempos: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      buildModel(st, { ...cenarioPadrao(st), seed: 500 + i });
      tempos.push(performance.now() - t);
    }
    const melhor = Math.min(...tempos);
    console.info(`[desempenho] buildModel: ${tempos.map((t) => t.toFixed(0)).join(' / ')} ms`);
    expect(melhor).toBeLessThan(1500);

    const { c, ir } = ctrlEm();
    const medir = (fn: () => unknown) => {
      const t = performance.now();
      fn();
      return performance.now() - t;
    };
    ir(50);
    const frio = medir(() => c.nacional('pres'));
    const quente = medir(() => c.nacional('pres'));
    const ufSp = medir(() => c.uf('pres', 'SP'));
    const munSp = medir(() => c.municipio('pres', 'SP', '71072'));
    const zona = medir(() => c.zona('pres', 'SP', '71072', 1));
    // avança 1 s de cada vez a 20× (incremental)
    const r0 = c.simNow();
    const passos: number[] = [];
    for (let i = 1; i <= 20; i++) {
      c.command({ tipo: 'saltar-tempo', simNow: r0 + i * 20_000 });
      passos.push(medir(() => c.nacional('pres')));
    }
    const medio = passos.reduce((a, b) => a + b, 0) / passos.length;
    console.info(
      `[desempenho] nacional frio ${frio.toFixed(1)} ms · cache ${quente.toFixed(2)} ms · UF SP ${ufSp.toFixed(1)} ms · ` +
        `mun SP ${munSp.toFixed(1)} ms · zona ${zona.toFixed(1)} ms · passo incremental médio ${medio.toFixed(1)} ms`,
    );
    expect(frio).toBeLessThan(100);
    expect(quente).toBeLessThan(5);
    expect(medio).toBeLessThan(30);
  });

  it('tamanhos dos payloads JSON', () => {
    const { c, ir } = ctrlEm('equilibrio-a');
    ir(100);
    const kb = (v: unknown) => JSON.stringify(v).length / 1024;
    const tam = {
      nacional: kb(c.nacional('pres')),
      ufSP: kb(c.uf('pres', 'SP')),
      munSP: kb(c.municipio('pres', 'SP', '71072')),
      zonaSP: kb(c.zona('pres', 'SP', '71072', 1)),
      secao: kb(c.secao('pres', 'SP', '71072', 1, 1)),
      status: kb(c.status()),
    };
    console.info(`[payload KB] ${Object.entries(tam).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`);
    expect(tam.nacional).toBeLessThan(80);
    expect(tam.ufSP).toBeLessThan(300);
  });
});

const FINGERPRINT = 1307193522;
