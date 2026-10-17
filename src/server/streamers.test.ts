/**
 * Rotas dos streamers (frente G, leva 3): `GET /api/texto/placar` (I22, texto puro para bots de chat), batimento e
 * "agora" das lives (I23, contagem anônima) e o painel `/api/admin/lives`. Também a classe `Lives` (contagem, teto por
 * rede, minutos, pico, gravação) e o registro isolado com relógio falso.
 */
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { beforeAll, describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '../shared/constants';
import { LIVES, LAYOUTS_CONTADOS, type LivesResumo } from '../shared/lives';
import { TEXTO_PLACAR } from '../shared/texto-placar';
import { LAYOUTS_LIVE } from '../app/components/live/opcoes';
import { createLogger } from './log';
import { Lives, registrarStreamers } from './lives';
import { canalDoBot } from './texto-placar';
import { comando, login, montar, type Montado } from './test-helpers';

let m: Montado;
let cookie: string;
beforeAll(async () => {
  m = await montar({ env: { PUBLIC_URL: 'https://sintonia2026.com.br', TRUST_PROXY: '1' } });
  cookie = await login(m);
});

const texto = async (q = '', h: Record<string, string> = {}) => {
  const r = await m.app.request(`/api/texto/placar${q}`, { headers: h });
  return { r, t: await r.text() };
};
const NOMES = /Lula|Flávio|Bolsonaro|Candidato [AB]/;

const batimento = (corpo: unknown, h: Record<string, string> = {}) =>
  m.app.request('/api/live/batimento', {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8', 'sec-fetch-site': 'same-origin', origin: 'https://sintonia2026.com.br', 'x-real-ip': '200.1.2.3', ...h },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
const agora = async () => ((await (await m.app.request('/api/live/agora')).json()) as { agora: number | null }).agora;
const resumoAdmin = async () => (await (await m.app.request('/api/admin/lives', { headers: { cookie } })).json()) as LivesResumo;

describe('GET /api/texto/placar', () => {
  it('antes da apuração: 200, texto puro, contagem regressiva sem nomes; borda 5 s, navegador nada', async () => {
    const { r, t } = await texto();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe(`public, max-age=0, s-maxage=${TEXTO_PLACAR.bordaS}`);
    expect(r.headers.get('cloudflare-cdn-cache-control')).toMatch(/^max-age=5\b/);
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    expect(t).toMatch(/^Presidente · 2º turno: a apuração começa em 25\/10, às 17h/);
    expect(t).toMatch(/Faltam \d+ dias/);
    expect(t).toContain('sintonia2026.com.br');
    expect(t).not.toMatch(NOMES);
    expect(t.length).toBeLessThanOrEqual(TEXTO_PLACAR.max);
    // governador: o cabeçalho da disputa também antes da apuração (sem nomes)
    const gov = (await texto('?uf=governador%20df')).t;
    expect(gov).toMatch(/^Governador · Distrito Federal · 2º turno: a apuração começa/);
    expect(gov).not.toMatch(/Celina|Leandro/);
    // HEAD: os mesmos cabeçalhos, sem corpo
    const h = await m.app.request('/api/texto/placar', { method: 'HEAD' });
    expect(h.status).toBe(200);
    expect(await h.text()).toBe('');
  });

  it('dia da votação, antes das 17h: só "começa às 17h"', async () => {
    const antes = m.relogio.t;
    m.relogio.t = INICIO_APURACAO - 3 * 3_600_000;
    try {
      const { t } = await texto('?uf=sp');
      expect(t).toBe('A apuração do 2º turno começa hoje, às 17h (horário de Brasília). Acompanhe seção por seção: sintonia2026.com.br');
    } finally {
      m.relogio.t = antes;
    }
  });

  it('simulação: [SIMULAÇÃO] e nomes SEMPRE ocultos (mesmo com os nomes reais no painel); UF e governador', async () => {
    await comando(m, cookie, { tipo: 'velocidade', velocidade: 20 });
    expect((await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' })).status).toBe(200);
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 50 });
    m.relogio.t += 3000; // passa a memória de 2 s do texto
    const a = (await texto()).t;
    expect(a).toMatch(/^\[SIMULAÇÃO\] Presidente · 2º turno: Candidato A \d+,\d\d% × Candidato B \d+,\d\d% dos votos válidos/);
    expect(a).not.toMatch(/Lula|Flávio|PT|PL/);

    await comando(m, cookie, { tipo: 'nomes-reais', ativo: true });
    m.relogio.t += 3000;
    const n = (await texto()).t;
    // o texto do bot vai para o chat da live sem o contexto da página: nunca nome real com número fictício
    expect(n).toMatch(/^\[SIMULAÇÃO\] Presidente · 2º turno: Candidato A \d+,\d\d% × Candidato B \d+,\d\d%/);
    expect(n).not.toMatch(/Lula|Flávio|\(PT\)|\(PL\)|lidera/i);
    const pe = (await texto('?uf=Pernambuco')).t;
    expect(pe).toMatch(/^\[SIMULAÇÃO\] Presidente · Pernambuco · 2º turno: Candidato A/);
    expect(pe).not.toMatch(/eleito/);
    const gov = (await texto('?uf=governador%20df')).t;
    expect(gov).toMatch(/^\[SIMULAÇÃO\] Governador · Distrito Federal · 2º turno: /);
    // UF inválida = Brasil (sempre 200)
    const inv = await texto('?uf=%3Cscript%3E&race=xx');
    expect(inv.r.status).toBe(200);
    expect(inv.t).toMatch(/^\[SIMULAÇÃO\] Presidente · 2º turno: /);
    await comando(m, cookie, { tipo: 'nomes-reais', ativo: false });
  });

  it("chave 'texto-bots' desligada: só o endereço", async () => {
    expect((await comando(m, cookie, { tipo: 'texto-bots', ligado: false })).status).toBe(200);
    expect((await texto('?uf=sp')).t).toBe('sintonia2026.com.br');
    await comando(m, cookie, { tipo: 'texto-bots', ligado: true });
    m.relogio.t += 3000;
    expect((await texto()).t).not.toBe('sintonia2026.com.br');
  });

  it('limite por canal do bot (nunca por IP) e só a contagem de canais, sem nome no log', async () => {
    const canal = (nome: string) => ({ 'nightbot-channel': `name=${nome}&displayName=${nome}&provider=twitch&providerId=${nome}-id`, 'nightbot-user': 'name=alguem&provider=twitch' });
    m.relogio.t += 61_000; // janela nova
    const antes = (await resumoAdmin()).canaisBot;
    for (let i = 0; i < TEXTO_PLACAR.porCanalMin; i++) {
      const { r, t } = await texto('', canal('canalsecreto'));
      expect(r.status).toBe(200);
      expect(t).not.toBe('sintonia2026.com.br');
    }
    const lim = await texto('', canal('canalsecreto'));
    expect(lim.r.status).toBe(200);
    expect(lim.t).toBe('sintonia2026.com.br');
    expect(lim.r.headers.get('cache-control')).toBe('no-store');
    // outro canal (mesmo IP) continua
    expect((await texto('', canal('outrocanal'))).t).not.toBe('sintonia2026.com.br');
    expect((await resumoAdmin()).canaisBot).toBe(antes + 2);
    expect(JSON.stringify(m.log.recentes(500))).not.toMatch(/canalsecreto|outrocanal|alguem/);
  });

  it('enxurrada com query que fura a cópia da borda (&z=…): o teto global não deixa os outros canais só com o endereço', async () => {
    m.relogio.t += 61_000; // janela nova
    const esperado = (await texto('?race=pres')).t;
    expect(esperado).not.toBe('sintonia2026.com.br');
    // 7.000 pedidos em menos de 2 s, cada um com uma query diferente (mais que o teto global de 6.000 por minuto)
    for (let i = 0; i < 7000; i += 500) {
      const lote = await Promise.all(Array.from({ length: 500 }, (_, k) => texto(`?race=pres&z=${i + k}`)));
      for (const x of lote) expect(x.t).toBe(esperado);
    }
    // um bot de verdade, logo depois, no mesmo minuto: recebe o placar (com cache normal), não só o endereço
    const bot = await texto('?race=pres', { 'nightbot-channel': 'name=canalteste&provider=twitch&providerId=123' });
    expect(bot.t).toBe(esperado);
    expect(bot.r.headers.get('cache-control')).toBe(`public, max-age=0, s-maxage=${TEXTO_PLACAR.bordaS}`);
    // e um texto que precisa ser montado de novo (outra UF, depois dos 2 s) também sai: o lixo não gastou o teto
    m.relogio.t += 2_500;
    expect((await texto('?race=pres&uf=sp')).t).not.toBe('sintonia2026.com.br');
  });

  it('canal do bot pelos cabeçalhos', () => {
    const h = (o: Record<string, string>) => (n: string) => o[n];
    expect(canalDoBot(h({ 'nightbot-channel': 'name=abc&displayName=Abc&provider=twitch&providerId=123' }))).toBe('nightbot:twitch:123');
    expect(canalDoBot(h({ 'nightbot-channel': 'name=Abc&provider=youtube' }))).toBe('nightbot:youtube:abc');
    expect(canalDoBot(h({ 'x-fossabot-channelid': 'XYZ', 'x-fossabot-channelprovider': 'twitch' }))).toBe('fossabot:twitch:xyz');
    expect(canalDoBot(h({ 'x-streamelements-channel': 'C1' }))).toBe('streamelements:c1');
    expect(canalDoBot(h({}))).toBeNull();
    expect(canalDoBot(h({ 'nightbot-channel': 'lixo' }))).toBeNull();
  });
});

describe('lives: batimento, agora e painel', () => {
  it('conta só com Origin do site e depois de confirmada (2 batimentos ≥ 45 s); outro site 403; sem Origin (curl) aceita sem contar; corpo inválido 400/413', async () => {
    m.relogio.t += (LIVES.ativaS + 1) * 1000;
    expect((await batimento({ id: 'abcdefgh0001', layout: 'barra' })).status).toBe(204);
    expect((await resumoAdmin()).agora).toBe(0); // registrada, ainda não confirmada
    m.relogio.t += 46_000;
    expect((await batimento({ id: 'abcdefgh0001', layout: 'barra' })).status).toBe(204);
    expect((await resumoAdmin()).agora).toBe(1);
    // curl com Sec-Fetch-Site forjado e sem Origin: 204, nunca conta (nem confirmado)
    const curl = () =>
      m.app.request('/api/live/batimento', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin', 'x-real-ip': '200.5.5.5' },
        body: JSON.stringify({ id: 'curlforjado1', layout: 'barra' }),
      });
    expect((await curl()).status).toBe(204);
    m.relogio.t += 46_000;
    expect((await curl()).status).toBe(204);
    expect((await resumoAdmin()).agora).toBe(1);
    expect((await batimento({ id: 'abcdefgh0002', layout: 'barra' }, { 'sec-fetch-site': 'cross-site', origin: 'https://outro.site' })).status).toBe(403);
    const semCab = await m.app.request('/api/live/batimento', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id: 'abcdefgh0003', layout: 'barra' }) });
    expect(semCab.status).toBe(204);
    expect((await resumoAdmin()).agora).toBe(1);
    expect((await batimento({ id: 'curto', layout: 'barra' })).status).toBe(400);
    expect((await batimento({ id: 'abcdefgh0004', layout: 'tv' })).status).toBe(400);
    expect((await batimento('{lixo')).status).toBe(400);
    expect((await batimento({ id: 'abcdefgh0005', layout: 'barra', a: ['x'.repeat(190)] })).status).toBe(413);
    expect((await batimento({ id: 'abcdefgh0006', layout: 'barra' }, { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
  });

  it('"agora" público só a partir de 5 lives confirmadas; borda 30 s', async () => {
    m.relogio.t += (LIVES.ativaS + 1) * 1000;
    const r = await m.app.request('/api/live/agora');
    expect(r.headers.get('cache-control')).toBe(`public, max-age=0, s-maxage=${LIVES.agoraBordaS}`);
    expect(r.headers.get('cloudflare-cdn-cache-control')).toMatch(/^max-age=30\b/);
    expect(await agora()).toBeNull();
    const cinco = () => Promise.all(Array.from({ length: 5 }, (_, i) => batimento({ id: `fonte5vivas${i}`, layout: 'canto' }, { 'x-real-ip': `200.9.9.${i}` })));
    await cinco();
    expect(await agora()).toBeNull(); // 5 registradas, nenhuma confirmada
    m.relogio.t += 46_000;
    await cinco();
    expect(await agora()).toBe(5);
    const s = await resumoAdmin();
    expect(s.porLayout).toEqual({ canto: 5 });
    expect(s.ligado).toBe(true);
  });

  it(`teto de ${LIVES.maxFontesPorRede} fontes por rede`, async () => {
    m.relogio.t += (LIVES.ativaS + 1) * 1000;
    const todas = () =>
      Promise.all(
        Array.from({ length: LIVES.maxFontesPorRede + 5 }, (_, i) =>
          batimento({ id: `mesmarede${String(i).padStart(3, '0')}`, layout: 'placar' }, { 'x-real-ip': '177.7.7.7' }),
        ),
      );
    await todas();
    m.relogio.t += 46_000;
    await todas();
    expect((await resumoAdmin()).porLayout.placar).toBe(LIVES.maxFontesPorRede);
  });

  it('minutos: o 1º batimento só registra; o seguinte (≥ 45 s) soma 1; recarga rápida não duplica; some depois de 150 s', async () => {
    const z = await m.app.request('/api/admin/lives', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'zerar' }) });
    expect(z.status).toBe(200);
    expect(((await z.json()) as LivesResumo).minutos.total).toBe(0);
    const b = () => batimento({ id: 'minutos00001', layout: 'mapa', a: ['nao-esta-no-ar'] }, { 'x-real-ip': '201.1.1.1' });
    await b();
    m.relogio.t += 20_000;
    await b();
    expect((await resumoAdmin()).minutos.total).toBe(0);
    m.relogio.t += 40_000;
    await b();
    const s = await resumoAdmin();
    expect(s.minutos.total).toBeGreaterThanOrEqual(1);
    expect(s.minutos.porLayout.mapa).toBe(1);
    // anúncio que não está no ar não conta
    expect(s.minutos.porAnuncio).toEqual({});
    m.relogio.t += (LIVES.ativaS + 1) * 1000;
    expect((await resumoAdmin()).agora).toBe(0);
  });

  it("chave 'contar-lives' desligada: 204 sem contar e \"agora\" nulo", async () => {
    await comando(m, cookie, { tipo: 'contar-lives', ligado: false });
    for (let i = 0; i < 6; i++) expect((await batimento({ id: `desligada0${i}`, layout: 'barra' }, { 'x-real-ip': `203.0.0.${i}` })).status).toBe(204);
    // nem lê o corpo
    expect((await batimento('{lixo')).status).toBe(204);
    expect(await agora()).toBeNull();
    const s = await resumoAdmin();
    expect(s.agora).toBe(0);
    expect(s.ligado).toBe(false);
    await comando(m, cookie, { tipo: 'contar-lives', ligado: true });
  });

  it('painel: exige sessão; zerar só com { acao: "zerar" } em JSON', async () => {
    expect((await m.app.request('/api/admin/lives')).status).toBe(401);
    const post = (body: string, ct = 'application/json') => m.app.request('/api/admin/lives', { method: 'POST', headers: { cookie, 'content-type': ct }, body });
    expect((await post('{"acao":"apagar"}')).status).toBe(400);
    expect((await post('{"acao":"zerar","x":1}')).status).toBe(400);
    expect((await post('acao=zerar', 'text/plain')).status).toBe(415);
  });
});

describe('Lives (classe)', () => {
  it('layouts contados = os da /live + em pé', () => {
    expect(LAYOUTS_CONTADOS.filter((l) => l !== 'vertical')).toEqual([...LAYOUTS_LIVE]);
  });

  it('pico, por anúncio, horas e gravação de ida e volta (só contagens)', () => {
    const rel = { t: Date.UTC(2026, 9, 25, 22, 0, 0) };
    const l = new Lives(() => rel.t);
    const noAr = new Set(['marca-x']);
    for (let i = 0; i < 3; i++) l.batimento(`rede${i}`, { id: `idfonte0000${i}`, layout: 'barra', a: ['marca-x', 'fora-do-ar'] }, noAr);
    rel.t += 60_000;
    for (let i = 0; i < 3; i++) expect(l.batimento(`rede${i}`, { id: `idfonte0000${i}`, layout: 'barra', a: ['marca-x'] }, noAr)).toBe('minuto');
    l.canal('k1');
    l.canal('k2');
    l.canal('k1');
    const r = l.resumo();
    expect(r.agora).toBe(3);
    // o pico conta só as confirmadas (2º batimento, 1 min depois)
    expect(r.pico).toEqual({ n: 3, em: Date.UTC(2026, 9, 25, 22, 1, 0) });
    expect(r.minutos).toEqual({ total: 3, porLayout: { barra: 3 }, porAnuncio: { 'marca-x': 3 } });
    expect(r.agoraPorAnuncio).toEqual({ 'marca-x': 3 });
    expect(r.canaisBot).toBe(2);
    expect(r.horas).toEqual([{ h: Date.UTC(2026, 9, 25, 22), max: 3, minutos: 3 }]);
    // uma fonte que mandou um batimento só (curl, recarga) nunca vira live
    expect(l.batimento('rede-nova', { id: 'umavezso0001', layout: 'barra' }, noAr)).toBe('nova');
    expect(l.resumo().agora).toBe(3);
    expect(l.resumo().pico?.n).toBe(3);
    // id de outra rede não "rouba" a fonte
    expect(l.batimento('outra', { id: 'idfonte00000', layout: 'mapa' }, noAr)).toBe('visto');

    const json = JSON.parse(JSON.stringify(l.toJSON()));
    expect(JSON.stringify(json)).not.toMatch(/rede\d|idfonte|k1|k2/);
    const l2 = new Lives(() => rel.t);
    expect(l2.carregar(json)).toBe(true);
    const r2 = l2.resumo();
    expect(r2.agora).toBe(0); // fontes ativas não são gravadas
    expect(r2.minutos).toEqual(r.minutos);
    expect(r2.pico).toEqual(r.pico);
    expect(r2.canaisBot).toBe(2); // o maior já visto, sem somar os novos que repetem
    l2.canal('k9');
    expect(l2.resumo().canaisBot).toBe(2);
    // teto global de fontes (memória limitada)
    const cheia = new Lives(() => rel.t);
    for (let i = 0; i < LIVES.maxFontes; i++) cheia.batimento(`r${Math.floor(i / LIVES.maxFontesPorRede)}`, { id: `f${String(i).padStart(11, '0')}`, layout: 'barra' }, noAr);
    expect(cheia.fontesRegistradas()).toBe(LIVES.maxFontes);
    expect(cheia.batimento('nova-rede', { id: 'fonteextra01', layout: 'barra' }, noAr)).toBe('teto');
    expect(new Lives().carregar({ v: 2 })).toBe(false);
    expect(new Lives().carregar('lixo')).toBe(false);
    // lixo campo a campo é ignorado
    const l3 = new Lives(() => rel.t);
    expect(l3.carregar({ v: 1, minutos: { total: -5, porLayout: { barra: 2, xx: 9 }, porAnuncio: { 'A B': 1 } }, horas: [[1, 2], 'x'], pico: { n: 'a' } })).toBe(true);
    expect(l3.resumo().minutos).toEqual({ total: 0, porLayout: { barra: 2 }, porAnuncio: {} });
    expect(l3.resumo().pico).toBeNull();
  });

  it('registro isolado: grava em STATE_DIR/lives.json (atômico) e não grava no ensaio', async () => {
    const rel = { t: Date.UTC(2026, 9, 25, 22) };
    const montarIsolado = (stateDir: string, gravar?: boolean) => {
      const app = new Hono<{ Bindings: HttpBindings }>();
      const admin = new Hono<{ Bindings: HttpBindings }>();
      const log = createLogger({ saida: false });
      const s = registrarStreamers(app, admin, {
        now: () => rel.t,
        log,
        dados: {
          status: () => ({ anuncios: [] }) as never,
          race: () => {
            throw new Error('sem');
          },
          nacional: async () => {
            throw new Error('sem');
          },
          uf: async () => {
            throw new Error('sem');
          },
        },
        noite: () => ({ textoBots: true, contarLives: true }),
        clienteDe: () => 'rede-hash',
        origemPermitida: () => true,
        stateDir,
        gravar,
      });
      return { app, s };
    };
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-lives-'));
    const { app, s } = montarIsolado(dir);
    const bat = (a: typeof app, id: string, layout: string) =>
      a.request('/api/live/batimento', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin', origin: 'https://sintonia2026.com.br' },
        body: JSON.stringify({ id, layout }),
      });
    expect((await bat(app, 'isolado00001', 'vertical')).status).toBe(204);
    rel.t += 60_000;
    expect((await bat(app, 'isolado00001', 'vertical')).status).toBe(204);
    await s.persistir();
    const salvo = JSON.parse(readFileSync(join(dir, 'lives.json'), 'utf8'));
    expect(salvo.v).toBe(1);
    expect(salvo.pico.n).toBe(1);
    expect(JSON.stringify(salvo)).not.toMatch(/isolado|rede-hash/);
    // texto: dados indisponíveis → ainda 200, sem nomes
    const t = await app.request('/api/texto/placar');
    expect(t.status).toBe(200);
    expect(await t.text()).toMatch(/sintonia2026\.com\.br$/);

    const dir2 = mkdtempSync(join(tmpdir(), 'sintonia-lives-'));
    const iso2 = montarIsolado(dir2, false);
    await bat(iso2.app, 'isolado00002', 'barra');
    rel.t += 60_000;
    await bat(iso2.app, 'isolado00002', 'barra');
    await iso2.s.persistir();
    expect(existsSync(join(dir2, 'lives.json'))).toBe(false);
  });
});
