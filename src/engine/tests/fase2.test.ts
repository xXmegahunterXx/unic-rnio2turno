/**
 * Fase 2 do motor: "reveja a noite" (instante t), mapa nacional por município, patrocínio, locais de votação e
 * o 1º turno REAL por seção (com dados sintéticos coerentes com o dataset e, se existirem, os arquivos reais de
 * public/data/secao).
 */
import { describe, expect, it, vi } from 'vitest';
import { INICIO_APURACAO } from '../../shared/constants';
import type { LocaisUfDataset, MunicipiosBr } from '../../shared/dataset';
import type { AdminState, MunicipiosNacionalSnapshot, Patrocinio, Summary, UF } from '../../shared/types';
import { UFS } from '../../shared/types';
import { decodeU16 } from '../../shared/u16';
import { CommandError, NotFoundError, type Controller, type LoadedDataset } from '../api';
import { createController } from '../controller';
import { createEngineHost, type HostOut } from '../host';
import { buildModel, MODELO } from '../model';
import { fsJsonLoader } from '../node';
import { cenarioDoPreset } from '../presets';
import { cenarioPadrao } from '../scenario';
import { estadoPadrao, INICIO_SIMULACAO, parseAdminState } from '../state';
import { buildStructure } from '../structure';
import { checaSoma, checaTally, dataset, PUBLIC_DIR, relogio, semGeradoEm } from './helpers';
import { comSecaoSintetica, semSecao } from './secao-sintetica';

const INI = INICIO_APURACAO;
const ds: LoadedDataset = await dataset();
const temReal = !!ds.secao && Object.keys(ds.secao).length > 0;
const pct0 = (s: Summary) => (100 * s.votos[0]) / (s.votos[0] + s.votos[1]);

function novo(d: LoadedDataset = ds, modo: 'demo' | 'servidor' = 'demo') {
  const r = relogio(Date.UTC(2026, 9, 25, 19, 0));
  const onStateChange = vi.fn();
  const c = createController(d, { modo, now: r.now, onStateChange });
  if (modo === 'demo') c.command({ tipo: 'relogio', acao: 'pausar' });
  return { c, r, onStateChange };
}

// ---------------------------------------------------------------------------------------------
// "Reveja a noite"
// ---------------------------------------------------------------------------------------------

describe('reveja a noite (instante t)', () => {
  const { c } = novo();
  c.command({ tipo: 'saltar-pct', pct: 80 });
  const agora = c.simNow();
  // referência: outro controller com o relógio realmente posicionado no instante pedido
  const ref = novo().c;

  it('t passado = mesmo snapshot do relógio posicionado naquele instante (todos os níveis)', () => {
    for (const dt of [5 * 60_000, 47 * 60_000 + 321, 90 * 60_000]) {
      const T = agora - dt;
      ref.command({ tipo: 'saltar-tempo', simNow: T });
      expect(semGeradoEm(c.nacional('pres', T))).toEqual(semGeradoEm(ref.nacional('pres')));
      expect(semGeradoEm(c.uf('pres', 'BA', T))).toEqual(semGeradoEm(ref.uf('pres', 'BA')));
      expect(semGeradoEm(c.nacional('gov-rj', T))).toEqual(semGeradoEm(ref.nacional('gov-rj')));
      expect(semGeradoEm(c.municipio('pres', 'SP', '71072', T))).toEqual(semGeradoEm(ref.municipio('pres', 'SP', '71072')));
      expect(semGeradoEm(c.zona('pres', 'SP', '71072', 1, T))).toEqual(semGeradoEm(ref.zona('pres', 'SP', '71072', 1)));
      expect(c.secao('pres', 'DF', '97012', 1, 1, T)).toEqual(ref.secao('pres', 'DF', '97012', 1, 1));
      expect(semGeradoEm(c.municipiosBr('pres', T))).toEqual(semGeradoEm(ref.municipiosBr('pres')));
      const n = c.nacional('pres', T);
      expect(n.simNow).toBe(Math.floor(T / 1000) * 1000);
      // série e eventos fatiados por t
      for (const e of n.eventos) expect(e.t).toBeLessThanOrEqual(T);
      for (const p of n.serie) expect(p.t).toBeLessThanOrEqual(T);
    }
    // e o "agora" continua o mesmo depois de rever o passado (cache coerente)
    expect(c.nacional('pres').simNow).toBe(Math.floor(agora / 1000) * 1000);
  });

  it('nunca futuro: t > agora (ou inválido) responde o agora', () => {
    const n = c.nacional('pres');
    for (const t of [agora + 1, agora + 3600_000, Number.MAX_SAFE_INTEGER, NaN, Infinity]) {
      expect(semGeradoEm(c.nacional('pres', t)), String(t)).toEqual(semGeradoEm(n));
      expect(c.uf('pres', 'SP', t).resumo).toEqual(c.uf('pres', 'SP').resumo);
      expect(c.municipiosBr('pres', t).apurado).toEqual(c.municipiosBr('pres').apurado);
    }
  });

  it('t antes do início da simulação é limitado a 16:59:30 (0%)', () => {
    const n = c.nacional('pres', INI - 86400_000);
    expect(n.simNow).toBe(INICIO_SIMULACAO);
    expect(n.resumo.secoesTotalizadas).toBe(0);
    expect(n.eventos).toEqual([]);
    expect(c.municipiosBr('pres', 0).lider.every((x) => x === -1)).toBe(true);
  });

  it('congelado: t limitado a congeladoEm; relógio antes de 16:59:30 → nunca adianta', () => {
    const { c: k, r } = novo();
    k.command({ tipo: 'saltar-pct', pct: 30 });
    k.command({ tipo: 'relogio', acao: 'retomar' });
    k.command({ tipo: 'congelar', congelado: true });
    const tc = k.state().congeladoEm!;
    r.add(120_000);
    expect(k.simNow()).toBeGreaterThan(tc);
    expect(k.nacional('pres', k.simNow()).simNow).toBe(Math.floor(tc / 1000) * 1000);
    expect(k.nacional('pres', tc - 600_000).resumo.secoesTotalizadas).toBeLessThan(k.nacional('pres').resumo.secoesTotalizadas);
    k.command({ tipo: 'congelar', congelado: false });
    k.command({ tipo: 'relogio', acao: 'pausar' });
    k.command({ tipo: 'saltar-tempo', simNow: INI - 3600_000 }); // 16:00 (antes do início da simulação)
    expect(k.nacional('pres', INI + 3600_000).simNow).toBe(INI - 3600_000);
    expect(k.nacional('pres', INI + 3600_000).resumo.secoesTotalizadas).toBe(0);
  });

  it('fonte "pre": 2º turno em 0% com qualquer t; 1º turno ignora t', () => {
    const { c: s } = novo(ds, 'servidor');
    expect(s.nacional('pres', INI + 3600_000).resumo.secoesTotalizadas).toBe(0);
    expect(semGeradoEm(s.nacional('pres-t1', 12345))).toEqual(semGeradoEm(s.nacional('pres-t1')));
    expect(s.municipiosBr('pres-t1', 1).lider).toEqual(s.municipiosBr('pres-t1').lider);
  });

  it('cache: rever a noite em passos de 1 min responde rápido e não quebra o agora', () => {
    const t0 = performance.now();
    let n = 0;
    for (let T = INI; T <= agora; T += 60_000, n++) c.nacional('pres', T);
    const total = performance.now() - t0;
    const t1 = performance.now();
    for (let T = INI; T <= agora; T += 60_000) c.nacional('pres', T);
    const total2 = performance.now() - t1;
    console.info(`[reveja] ${n} instantes: ${total.toFixed(0)} ms (1ª passada) · ${total2.toFixed(0)} ms (2ª)`);
    expect(total / n).toBeLessThan(40);
    expect(c.nacional('pres').simNow).toBe(Math.floor(agora / 1000) * 1000);
  });
});

// ---------------------------------------------------------------------------------------------
// Mapa nacional por município
// ---------------------------------------------------------------------------------------------

/** Ordem canônica derivada: UFs em ordem alfabética, municípios na ordem do dataset, sem ZZ. */
function ordemDerivada(d: LoadedDataset): { uf: UF; cod: string }[] {
  const out: { uf: UF; cod: string }[] = [];
  for (const uf of UFS) for (const m of d.ufs[uf]!.municipios) out.push({ uf, cod: m.cod });
  return out;
}

function checaMapa(c: Controller, race: string, ordem: { uf: UF; cod: string }[], ctx: string) {
  const mb: MunicipiosNacionalSnapshot = c.municipiosBr(race);
  const n = ordem.length;
  for (const k of ['lider', 'margem', 'apurado', 'comparecimento', 'pct0'] as const) {
    expect(mb[k].length, `${ctx} ${k}`).toBe(n);
    for (const v of mb[k]) if (!Number.isInteger(v)) throw new Error(`${ctx}: ${k} não inteiro (${v})`);
  }
  // soma dos liderados + empates = municípios com votos válidos
  const comVotos = mb.lider.filter((x) => x >= 0).length;
  const empates = mb.lider.filter((x) => x === 2).length;
  expect(mb.municipiosLiderados.length).toBe(2);
  expect(mb.municipiosLiderados[0] + mb.municipiosLiderados[1] + empates, ctx).toBe(comVotos);
  // alinhamento: cada posição bate com o município do snapshot da UF
  const porUf = new Map<string, Map<string, Summary>>();
  const r = c.meta().races.find((x) => x.id === race)!;
  for (const uf of r.ufs) {
    if (uf === 'ZZ') continue;
    porUf.set(uf, new Map(c.uf(race, uf).municipios.map((m) => [m.cod, m])));
  }
  const t1 = r.turno === 1;
  for (let j = 0; j < n; j++) {
    const s = porUf.get(ordem[j].uf)?.get(ordem[j].cod);
    if (!s) {
      if (mb.lider[j] !== -1 || mb.apurado[j] !== 0) throw new Error(`${ctx} ${j}: fora da corrida com dados`);
      continue;
    }
    const val = s.votos.reduce((a, b) => a + b, 0);
    const [v0, v1] = s.votos;
    const lider = val <= 0 ? -1 : v0 > v1 ? 0 : v1 > v0 ? 1 : 2;
    const esperado = {
      lider,
      margem: val > 0 ? Math.round((1000 * Math.abs(v0 - v1)) / val) : 0,
      apurado: Math.floor((1000 * s.secoesTotalizadas) / s.secoes),
      comparecimento: s.eleitoradoTotalizado > 0 ? Math.round((1000 * s.comparecimento) / s.eleitoradoTotalizado) : 0,
      pct0: val > 0 ? Math.round((10000 * v0) / val) : 0,
    };
    const obtido = { lider: mb.lider[j], margem: mb.margem[j], apurado: mb.apurado[j], comparecimento: mb.comparecimento[j], pct0: mb.pct0[j] };
    if (JSON.stringify(obtido) !== JSON.stringify(esperado))
      throw new Error(`${ctx} ${ordem[j].uf}/${ordem[j].cod}: ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`);
    if (t1 && mb.apurado[j] !== 1000) throw new Error(`${ctx}: 1º turno deveria estar 100% apurado`);
  }
  return mb;
}

describe('municipiosBr (mapa nacional por município)', () => {
  const { c } = novo();
  const ordemArquivo: { uf: UF; cod: string }[] | null = ds.municipiosBr
    ? ds.municipiosBr.ordem.map((_, j) => ({ uf: ds.municipiosBr!.uf[j] as UF, cod: ds.municipiosBr!.cod[j] }))
    : null;
  const ordem = ordemArquivo ?? ordemDerivada(ds);

  it('ordem: 5.571 municípios; o arquivo (se existir) segue a ordem canônica derivada', () => {
    expect(ordem.length).toBe(5571);
    if (ordemArquivo) expect(ordemArquivo).toEqual(ordemDerivada(ds));
  });

  it.each([0, 0.5, 33, 77, 100])('%s%%: alinhado com os snapshots de UF, inteiros, soma de liderados', (pct) => {
    if (pct > 0) c.command({ tipo: 'saltar-pct', pct });
    else c.command({ tipo: 'saltar-tempo', simNow: INI - 1000 });
    const mb = checaMapa(c, 'pres', ordem, `pres@${pct}%`);
    if (pct === 0) expect(mb.lider.every((x) => x === -1)).toBe(true);
    if (pct === 100) {
      expect(mb.apurado.every((x) => x === 1000)).toBe(true);
      expect(mb.municipiosLiderados[0] + mb.municipiosLiderados[1]).toBeGreaterThan(5500);
    }
    checaMapa(c, 'gov-rj', ordem, `gov-rj@${pct}%`);
  });

  it('governador: só a UF da disputa tem dados; 1º turno: 100% apurado e % sobre todos os válidos', () => {
    c.command({ tipo: 'saltar-pct', pct: 100 });
    const g = c.municipiosBr('gov-am');
    ordem.forEach((o, j) => expect(g.lider[j] >= 0, `${o.uf}/${o.cod}`).toBe(o.uf === 'AM'));
    checaMapa(c, 'pres-t1', ordem, 'pres-t1');
    checaMapa(c, 'gov-df-t1', ordem, 'gov-df-t1');
  });

  it('sem municipios-br.json: ordem derivada (mesmos números)', () => {
    const d2: LoadedDataset = { ...ds, municipiosBr: null };
    const { c: c2 } = novo(d2);
    c.command({ tipo: 'saltar-pct', pct: 64 });
    c2.command({ tipo: 'saltar-pct', pct: 64 });
    const a = checaMapa(c2, 'pres', ordemDerivada(ds), 'derivada');
    if (ordemArquivo) expect(semGeradoEm(a)).toEqual(semGeradoEm(c.municipiosBr('pres')));
    // arquivo embaralhado: o motor segue a ordem do arquivo
    const inv: MunicipiosBr = {
      ordem: [...(ds.municipiosBr?.ordem ?? [])].reverse(),
      uf: [...(ds.municipiosBr?.uf ?? [])].reverse(),
      cod: [...(ds.municipiosBr?.cod ?? [])].reverse(),
      nome: [...(ds.municipiosBr?.nome ?? [])].reverse(),
    };
    if (ordemArquivo) {
      const { c: c3 } = novo({ ...ds, municipiosBr: inv });
      c3.command({ tipo: 'saltar-pct', pct: 64 });
      expect(c3.municipiosBr('pres').lider).toEqual([...a.lider].reverse());
    }
  });

  it('desempenho: < 5 ms quente; payload compacto', () => {
    c.command({ tipo: 'saltar-pct', pct: 42 });
    c.municipiosBr('pres');
    const t = performance.now();
    for (let i = 0; i < 10; i++) c.municipiosBr('pres');
    const quente = (performance.now() - t) / 10;
    c.command({ tipo: 'saltar-pct', pct: 43 });
    const t2 = performance.now();
    const mb = c.municipiosBr('pres');
    const frio = performance.now() - t2;
    const kb = JSON.stringify(mb).length / 1024;
    console.info(`[municipiosBr] frio ${frio.toFixed(2)} ms · quente ${quente.toFixed(3)} ms · ${kb.toFixed(0)} KB`);
    expect(quente).toBeLessThan(5);
    expect(kb).toBeLessThan(150);
  });
});

// ---------------------------------------------------------------------------------------------
// Patrocínio
// ---------------------------------------------------------------------------------------------

describe('patrocínio', () => {
  const st = buildStructure(semSecao(ds));
  const valido: Patrocinio = { marca: '  Padaria Pão Quente ', texto: 'Oferecido por Padaria Pão Quente', url: 'https://exemplo.com.br/promo?x=1' };
  const compartilhado = novo(ds, 'servidor');

  it('desligado por padrão; define, aparece no status, persiste e remove', () => {
    const { c, onStateChange } = novo(ds, 'servidor');
    expect(c.status().patrocinio).toBeNull();
    expect(c.state().patrocinio).toBeNull();
    const v0 = c.state().versao;
    c.command({ tipo: 'patrocinio', patrocinio: valido });
    const p = { marca: 'Padaria Pão Quente', texto: 'Oferecido por Padaria Pão Quente', url: 'https://exemplo.com.br/promo?x=1' };
    expect(c.status().patrocinio).toEqual(p);
    expect(c.state().patrocinio).toEqual(p);
    expect(c.state().versao).toBe(v0 + 1);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    // ida e volta (persistência do servidor / sincronização entre abas)
    const fb = estadoPadrao('servidor', 0, cenarioPadrao(st), st);
    const json = c.toJSON();
    const parsed = parseAdminState(json, fb, st);
    expect(parsed.patrocinio).toEqual(p);
    expect(JSON.stringify(parsed)).toBe(json);
    const c2 = createController(ds, { modo: 'servidor', initialState: parsed });
    expect(c2.status().patrocinio).toEqual(p);
    // imagem opcional
    const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    c.command({ tipo: 'patrocinio', patrocinio: { ...p, imagem: img } });
    expect(c.status().patrocinio!.imagem).toBe(img);
    c.command({ tipo: 'patrocinio', patrocinio: { ...p, imagem: 'https://cdn.exemplo.com/logo.svg' } });
    expect(c.status().patrocinio!.imagem).toBe('https://cdn.exemplo.com/logo.svg');
    c.command({ tipo: 'patrocinio', patrocinio: null });
    expect(c.status().patrocinio).toBeNull();
    expect(parseAdminState(c.toJSON(), fb, st).patrocinio).toBeNull();
  });

  it.each([
    ['sem marca', { ...valido, marca: '  ' }, /marca/],
    ['marca longa', { ...valido, marca: 'x'.repeat(61) }, /marca/],
    ['sem texto', { ...valido, texto: '' }, /texto/],
    ['texto longo', { ...valido, texto: 'x'.repeat(161) }, /texto/],
    ['http', { ...valido, url: 'http://exemplo.com.br' }, /https/],
    ['javascript:', { ...valido, url: 'javascript:alert(1)' }, /https/],
    ['com senha', { ...valido, url: 'https://user:senha@exemplo.com' }, /https/],
    ['sem domínio', { ...valido, url: 'https://localhost/x' }, /https/],
    ['imagem html', { ...valido, imagem: 'data:text/html;base64,PGgxPg==' }, /imagem/],
    ['imagem http', { ...valido, imagem: 'http://exemplo.com/logo.png' }, /imagem/],
    ['imagem gigante', { ...valido, imagem: 'data:image/png;base64,' + 'A'.repeat(210_000) }, /data URI/],
    ['não objeto', 'Acme' as never, /Patrocínio inválido/],
  ])('inválido: %s → CommandError sem alterar o estado', (_n, patrocinio, re) => {
    const { c, onStateChange } = compartilhado;
    onStateChange.mockClear();
    const antes = c.state();
    expect(() => c.command({ tipo: 'patrocinio', patrocinio: patrocinio as Patrocinio })).toThrow(CommandError);
    expect(() => c.command({ tipo: 'patrocinio', patrocinio: patrocinio as Patrocinio })).toThrow(re);
    expect(c.state()).toEqual(antes);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('estado restaurado com patrocínio inválido → null (nunca lança)', () => {
    const fb = estadoPadrao('demo', 0, cenarioPadrao(st), st);
    const s = { ...fb, patrocinio: { marca: 'X', texto: 'Y', url: 'ftp://x.com' } } as unknown as AdminState;
    expect(parseAdminState(s, fb, st).patrocinio).toBeNull();
    expect(parseAdminState({ ...fb, patrocinio: undefined }, { ...fb, patrocinio: { marca: 'A', texto: 'B', url: 'https://a.com' } }, st).patrocinio).toEqual({
      marca: 'A',
      texto: 'B',
      url: 'https://a.com',
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Locais de votação
// ---------------------------------------------------------------------------------------------

const locaisDf: LocaisUfDataset = {
  uf: 'DF',
  locais: [
    { nr: 1, cod: '97012', zona: 1, nome: 'Escola Teste Um', endereco: 'Rua A, 1', bairro: 'Centro', lat: -15.8, lon: -47.9, secoes: '1-3', aptos: 900 },
    { nr: 2, cod: '97012', zona: 1, nome: 'Escola Teste Dois', endereco: 'Rua B, 2', secoes: '4', aptos: 300 },
  ],
};

describe('locais de votação (sob demanda, com cache)', () => {
  it('ds.locais pré-carregado: zona e seção trazem `local`; seções fora dos locais ficam sem', () => {
    const { c } = novo({ ...ds, load: undefined, locais: { DF: locaisDf } });
    c.command({ tipo: 'saltar-pct', pct: 100 });
    const z = c.zona('pres', 'DF', '97012', 1);
    const s1 = z.secoes.find((s) => s.secao === 1)!;
    expect(s1.local).toEqual({ nome: 'Escola Teste Um', endereco: 'Rua A, 1', bairro: 'Centro', lat: -15.8, lon: -47.9 });
    expect(z.secoes.find((s) => s.secao === 4)!.local).toEqual({ nome: 'Escola Teste Dois', endereco: 'Rua B, 2' });
    expect(z.secoes.find((s) => s.secao === 5)?.local).toBeUndefined();
    expect(c.secao('pres', 'DF', '97012', 1, 2)!.local!.nome).toBe('Escola Teste Um');
    // sem locais (outra UF): campo ausente
    expect(c.zona('pres', 'AC', '01120', c.municipio('pres', 'AC', '01120').zonas[0].zona).secoes[0].local).toBeUndefined();
  });

  it('carregaLocais: lê data/locais/{uf}.json uma vez; 1ª consulta sem local dispara o carregamento', async () => {
    const lidos: string[] = [];
    const load = async (p: string) => {
      lidos.push(p);
      if (p === 'data/locais/df.json') return locaisDf;
      throw new Error('ENOENT ' + p);
    };
    const { c } = novo({ ...ds, load, locais: undefined });
    const z0 = c.zona('pres', 'DF', '97012', 1);
    expect(z0.secoes[0].local).toBeUndefined();
    await new Promise((r) => setTimeout(r, 10));
    expect(c.zona('pres', 'DF', '97012', 1).secoes[0].local!.nome).toBe('Escola Teste Um');
    expect(await c.carregaLocais!('df')).toBe(true);
    expect(lidos.filter((p) => p === 'data/locais/df.json').length).toBe(1);
    expect(await c.carregaLocais!('SP')).toBe(false); // ausente → false, sem rejeitar
    expect(await c.carregaLocais!('XX')).toBe(false);
    expect(lidos.filter((p) => p === 'data/locais/sp.json').length).toBe(1);
    await c.carregaLocais!('SP');
    expect(lidos.filter((p) => p === 'data/locais/sp.json').length).toBe(1); // cache do "ausente"
  });

  it('hospedeiro do demo: zona/seção aguardam os locais da UF', async () => {
    const out: HostOut[] = [];
    const base = fsJsonLoader(PUBLIC_DIR);
    const handle = createEngineHost(
      (m) => out.push(m),
      () => async (p: string) => (p === 'data/locais/df.json' ? locaisDf : p.startsWith('data/locais/') ? Promise.reject(new Error('404')) : base(p)),
    );
    await handle({ type: 'init', base: 'x', modo: 'demo', state: null });
    await handle({ type: 'call', id: 1, method: 'zona', args: ['pres', 'DF', '97012', 1] });
    const r1 = out.find((m) => m.type === 'reply' && m.id === 1) as Extract<HostOut, { type: 'reply'; ok: true }>;
    expect(r1.ok).toBe(true);
    expect((r1.result as { secoes: { local?: { nome: string } }[] }).secoes[0].local?.nome).toBe('Escola Teste Um');
    // instante t pelo RPC e municipiosBr
    await handle({ type: 'call', id: 2, method: 'municipiosBr', args: ['pres', INI + 60_000] });
    const r2 = out.find((m) => m.type === 'reply' && m.id === 2) as Extract<HostOut, { type: 'reply'; ok: true }>;
    expect(r2.ok).toBe(true);
    expect((r2.result as MunicipiosNacionalSnapshot).lider.length).toBe(5571);
    await handle({ type: 'call', id: 3, method: 'nacional', args: ['pres', INICIO_SIMULACAO] });
    const r3 = out.find((m) => m.type === 'reply' && m.id === 3) as Extract<HostOut, { type: 'reply'; ok: true }>;
    expect((r3.result as { simNow: number }).simNow).toBe(INICIO_SIMULACAO);
    await handle({ type: 'call', id: 4, method: 'command', args: [{ tipo: 'patrocinio', patrocinio: { marca: 'A', texto: 'B', url: 'https://a.com' } }] });
    await handle({ type: 'call', id: 5, method: 'status', args: [] });
    const r5 = out.find((m) => m.type === 'reply' && m.id === 5) as Extract<HostOut, { type: 'reply'; ok: true }>;
    expect((r5.result as { patrocinio: Patrocinio }).patrocinio.marca).toBe('A');
  });
});

// ---------------------------------------------------------------------------------------------
// 1º turno REAL por seção (dados sintéticos coerentes com o dataset)
// ---------------------------------------------------------------------------------------------

const SINT: UF[] = ['AC', 'DF', 'RJ', 'RN', 'ZZ'];
const dsSint = comSecaoSintetica(semSecao(ds), SINT);
const stSint = buildStructure(dsSint);

describe('1º turno real por seção (sintético: AC, DF, RJ, RN, ZZ; demais UFs no fallback)', () => {
  it('estrutura: UFs com dados, conferência por município, avisos de arquivo inválido', () => {
    expect(stSint.real!.nUfs).toBe(SINT.length);
    for (const uf of SINT) expect(stSint.real!.ufPres[stSint.ufIndex.get(uf)!], uf).toBe(1);
    expect(stSint.real!.ufPres[stSint.ufIndex.get('SP')!]).toBe(0);
    for (const uf of ['AC', 'DF', 'RJ', 'RN'] as UF[]) expect(stSint.real!.ufGov[stSint.ufIndex.get(uf)!], uf).toBe(1);
    for (const uf of SINT) {
      const u = stSint.ufIndex.get(uf)!;
      for (let m = stSint.ufMunStart[u]; m < stSint.ufMunEnd[u]; m++) expect(stSint.real!.munConfere[m]).toBe(1);
    }
    expect(stSint.real!.avisos).toEqual([]);
    const ruim = buildStructure({ ...dsSint, secao: { ...dsSint.secao, AL: { ...dsSint.secao!.AC!, uf: 'AL' } } });
    expect(ruim.real!.nUfs).toBe(SINT.length);
    expect(ruim.real!.avisos.some((a) => a.includes('secao/al.json ignorado'))).toBe(true);
  });

  it('modelo: aptos reais, determinístico, calibragem exata (padrão e presets), seções seguem a preferência real', () => {
    const cen = cenarioPadrao(stSint);
    const m = buildModel(stSint, cen);
    const m2 = buildModel(buildStructure(dsSint), cen);
    for (const k of ['aptos', 'comp', 'pv0', 'pv1', 'pb', 'pn', 'gv0', 'gv1', 'gb', 'gn', 'chegada'] as const)
      expect(Buffer.from(m2[k].buffer).equals(Buffer.from(m[k].buffer)), k).toBe(true);
    expect(m.ufsSecaoReal).toBe(SINT.length);
    const real = stSint.real!;
    for (const uf of SINT) {
      const u = stSint.ufIndex.get(uf)!;
      for (let i = stSint.ufSecStart[u]; i < stSint.ufSecEnd[u]; i++)
        if (m.aptos[i] !== real.aptos[i]) throw new Error(`${uf} seção ${i}: aptos ${m.aptos[i]} ≠ real ${real.aptos[i]}`);
    }
    expect(Math.abs(m.calib.pres!.resultado - cen.alvoPres)).toBeLessThan(0.05);
    for (const g of m.calib.gov) expect(Math.abs(g.resultado - cen.alvoGov[g.race]), g.race).toBeLessThan(0.05);
    for (const id of ['folgada-b', 'empate-a', 'uniforme']) {
      const c2 = cenarioDoPreset(stSint, id, 99);
      const mm = buildModel(stSint, c2);
      expect(Math.abs(mm.calib.pres!.resultado - c2.alvoPres), id).toBeLessThan(0.05);
      for (const g of mm.calib.gov) expect(Math.abs(g.resultado - c2.alvoGov[g.race]), `${id} ${g.race}`).toBeLessThan(0.05);
    }
    // correlação (logit) entre a preferência real da seção e a do 2º turno, dentro do RJ (seções ≥ 100 válidos)
    const u = stSint.ufIndex.get('RJ')!;
    const xs: number[] = [];
    const ys: number[] = [];
    const lg = (p: number) => Math.log(p / (1 - p));
    for (let i = stSint.ufSecStart[u]; i < stSint.ufSecEnd[u]; i++) {
      const a = real.pres.a[i];
      const b = real.pres.b[i];
      if (a + b < 100 || m.pv0[i] + m.pv1[i] < 100 || !a || !b || !m.pv0[i] || !m.pv1[i]) continue;
      xs.push(lg(a / (a + b)));
      ys.push(lg(m.pv0[i] / (m.pv0[i] + m.pv1[i])));
    }
    const corr = pearson(xs, ys);
    console.info(`[seção real] correlação logit(1º turno real) × logit(2º turno) no RJ: ${corr.toFixed(3)} (${xs.length} seções)`);
    expect(corr).toBeGreaterThan(0.85);
    // comparecimento do 2º turno segue o real da seção
    const cx: number[] = [];
    const cy: number[] = [];
    for (let i = stSint.ufSecStart[u]; i < stSint.ufSecEnd[u]; i++) {
      if (real.aptos[i] < 100) continue;
      cx.push(real.pres.comp[i] / real.aptos[i]);
      cy.push(m.comp[i] / m.aptos[i]);
    }
    expect(pearson(cx, cy)).toBeGreaterThan(0.6);
  });

  it('invariantes em vários instantes (UFs reais e fallback juntas)', () => {
    const { c } = novo(dsSint);
    c.command({ tipo: 'preset', preset: 'equilibrio-a' });
    for (const pct of [0.3, 45, 100]) {
      c.command({ tipo: 'saltar-pct', pct });
      const nac = c.nacional('pres');
      checaTally(nac.resumo, 'BR');
      checaSoma(Object.values(nac.ufs) as Summary[], nac.resumo, 'UFs→BR');
      for (const uf of [...SINT, 'SP'] as UF[]) {
        const us = c.uf('pres', uf);
        checaSoma(us.municipios, us.resumo, `mun→${uf}`);
      }
      for (const [uf, cod] of [['DF', '97012'], ['RJ', '60011'], ['AC', '01392']] as [UF, string][]) {
        for (const race of ['pres', `gov-${uf.toLowerCase()}`]) {
          const ms = c.municipio(race, uf, cod);
          checaTally(ms.resumo, `${race} ${uf}/${cod}`);
          checaSoma(ms.zonas, ms.resumo, `${race} zonas→${uf}/${cod}`);
          for (const z of ms.zonas.slice(0, 3)) {
            const zs = c.zona(race, uf, cod, z.zona);
            for (const s of zs.secoes) expect(s.votos[0] + s.votos[1] + s.brancos + s.nulos).toBe(s.comparecimento);
          }
        }
      }
    }
    expect(Math.abs(pct0(c.nacional('pres').resumo) - 50.4)).toBeLessThan(0.05);
  });

  it('pres-t1/gov-t1: zona e seção com os números REAIS; município com zonas reais e mosaico seção a seção', () => {
    const { c } = novo(dsSint);
    const real = stSint.real!;
    for (const [race, uf, cod] of [['pres-t1', 'DF', '97012'], ['pres-t1', 'RJ', '60011'], ['gov-rj-t1', 'RJ', '60011'], ['pres-t1', 'ZZ', ds.ufs.ZZ!.municipios[0].cod]] as [string, UF, string][]) {
      const gov = race.startsWith('gov');
      const col = gov ? real.gov : real.pres;
      const ms = c.municipio(race, uf, cod);
      expect(ms.zonas.length).toBe(ms.mosaico.length);
      expect(ms.zonas.every((z) => z.zona > 0)).toBe(true);
      if (gov) {
        // Governador: o eleitorado da seção é o único `aptos` (o oficial do Governador pode ser menor: trânsito)
        const semEleit = (x: Summary) => ({ ...x, eleitorado: 0, eleitoradoTotalizado: 0, abstencao: 0 });
        checaSoma(ms.zonas.map(semEleit), semEleit(ms.resumo), `${race} zonas→${uf}/${cod}`);
      } else checaSoma(ms.zonas, ms.resumo, `${race} zonas→${uf}/${cod}`);
      for (const z of ms.zonas) checaTally(z, `${race} ${uf}/${cod}/z${z.zona}`);
      const m = stSint.munKey.get(`${uf}|${cod}`)!;
      for (let p = stSint.munPairStart[m]; p < stSint.munPairEnd[m]; p++) {
        const zona = stSint.pairZona[p];
        const zs = c.zona(race, uf, cod, zona);
        expect(zs.secoes.length).toBe(stSint.pairSecEnd[p] - stSint.pairSecStart[p]);
        const zr = ms.zonas.find((z) => z.zona === zona)!;
        const { zona: _z, ...semZona } = zr;
        expect(zs.resumo).toEqual(semZona);
        const mos = ms.mosaico.find((x) => x.zona === zona)!;
        zs.secoes.forEach((s, j) => {
          const i = stSint.pairSecStart[p] + j;
          expect(s.totalizada).toBe(true);
          expect(s.totalizadaEm).toBeNull();
          expect([s.aptos, s.comparecimento, ...s.votos, s.brancos, s.nulos]).toEqual([
            real.aptos[i],
            col.comp[i],
            col.a[i],
            col.b[i],
            col.outros[i],
            col.brancos[i],
            col.nulos[i],
          ]);
          const val = col.a[i] + col.b[i] + col.outros[i];
          const ch = mos.estado[j];
          if (val === 0) expect(ch).toBe('z');
          else if (col.a[i] === col.b[i]) expect(ch).toBe('x');
          else expect(/[a-d]/.test(ch)).toBe(col.a[i] > col.b[i]);
        });
        const s0 = zs.secoes[0];
        const det = c.secao(race, uf, cod, zona, s0.secao)!;
        expect(det.simulado).toBe(false);
        expect(det.codigoIdentificacao).toBe('');
        expect(det.votos).toEqual(s0.votos);
        expect(det.abstencao).toBe(det.aptos - det.comparecimento);
        if (p - stSint.munPairStart[m] > 3) break;
      }
    }
    // UF sem arquivo de seções: comportamento da fase 1 (zona 0 + 404 coerente)
    const sp = c.municipio('pres-t1', 'SP', '71072');
    expect(sp.zonas.length).toBe(1);
    expect(sp.zonas[0].zona).toBe(0);
    expect(() => c.zona('pres-t1', 'SP', '71072', 1)).toThrow(NotFoundError);
    expect(() => c.secao('pres-t1', 'SP', '71072', 1, 1)).toThrow(/1º turno/);
    // seção inexistente numa UF com dados: 404
    expect(() => c.secao('pres-t1', 'DF', '97012', 1, 99999)).toThrow(NotFoundError);
  });

  it('ruído padrão menor (0,08) e equivalência do fallback (ruído estrutural em quadratura)', () => {
    expect(cenarioPadrao(stSint).ruidoSecao).toBe(0.08);
    expect(Math.hypot(0.08, MODELO.ruidoSemSecaoReal)).toBeCloseTo(0.25, 1);
  });
});

// ---------------------------------------------------------------------------------------------
// Arquivos REAIS de seção (se existirem)
// ---------------------------------------------------------------------------------------------

describe.runIf(temReal)('1º turno real por seção (arquivos de public/data/secao)', () => {
  const st = buildStructure(ds);

  it('arquivos válidos, seções somando o resultado oficial dos municípios', () => {
    const real = st.real!;
    console.info(`[seção real] ${real.nUfs} UFs · avisos: ${real.avisos.length ? real.avisos.join(' | ') : 'nenhum'}`);
    expect(real.nUfs).toBe(Object.keys(ds.secao!).length);
    let confere = 0;
    for (let m = 0; m < st.nMun; m++) if (real.ufPres[st.munUf[m]]) confere += real.munConfere[m];
    let comDados = 0;
    for (let m = 0; m < st.nMun; m++) if (real.ufPres[st.munUf[m]]) comDados++;
    console.info(`[seção real] municípios que conferem com o total oficial: ${confere}/${comDados}`);
    expect(confere / comDados).toBeGreaterThan(0.95);
    const d0 = ds.secao![Object.keys(ds.secao!)[0] as UF]!;
    expect(decodeU16(d0.aptos).length).toBe(d0.n);
  });

  it('calibragem exata e invariantes a 100% com o dataset real', () => {
    const { c } = novo();
    c.command({ tipo: 'saltar-pct', pct: 100 });
    const cen = c.state().cenario;
    expect(Math.abs(pct0(c.nacional('pres').resumo) - cen.alvoPres)).toBeLessThan(0.05);
    for (const g of st.govRaces) expect(Math.abs(pct0(c.nacional(g.id).resumo) - cen.alvoGov[g.id]), g.id).toBeLessThan(0.05);
    const t = ds.meta.totaisPrimeiroTurno;
    const r = c.nacional('pres').resumo;
    expect(Math.abs(r.comparecimento / t.comparecimento - 1)).toBeLessThan(0.003);
    expect(Math.abs(r.brancos / t.brancos - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.nulos / t.nulos - 1)).toBeLessThan(0.02);
  });

  it('pres-t1: zonas reais somam o município (onde confere); seção real', () => {
    const { c } = novo();
    const u = st.ufIndex.get('SP')!;
    if (!st.real!.ufPres[u]) return;
    const ms = c.municipio('pres-t1', 'SP', '71072');
    if (st.real!.munConfere[st.munKey.get('SP|71072')!]) {
      expect(ms.zonas.length).toBe(57);
      checaSoma(ms.zonas, ms.resumo, 'zonas→SP capital');
    }
    const z = c.zona('pres-t1', 'SP', '71072', 1);
    checaTally(z.resumo, 'SP/71072/z1');
    expect(c.secao('pres-t1', 'SP', '71072', 1, z.secoes[0].secao)!.simulado).toBe(false);
  });
});

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}
