/**
 * Anúncios no servidor: /api/status (imagens por URL, link de clique), /api/anuncio/img (bytes, cabeçalhos, SVG em
 * sandbox), /api/anuncio/ir/:id (clique contado + 302, nunca redirecionamento aberto), /api/anuncio/evento (impressão
 * visível: origem, repetição, limite, robôs), relatório do admin, persistência das métricas, validação do comando
 * (zod = motor) e a ida e volta das imagens pelo painel.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { AnuncioConfig, MetricaAnuncio } from '../shared/anuncios';
import type { AdminState, LiveStatus } from '../shared/types';
import { HORA_MS, LimiteJanela, MetricasAnuncios, Repeticoes, TabelaAnuncios, ehRobo, hashImagem, numeroDe } from './anuncios';
import { CC, CSP_IMAGEM, EVENTOS_ANUNCIO_MIN } from './app';
import { comando, login, montar, type Montado } from './test-helpers';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG_TXT = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const SVG = `data:image/svg+xml;base64,${Buffer.from(SVG_TXT).toString('base64')}`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
/** 15/10/2026 12:00 de Brasília. */
const AGORA = Date.UTC(2026, 9, 15, 15, 0, 0);

function anuncio(id: string, extra: Partial<AnuncioConfig> = {}): AnuncioConfig {
  return {
    id,
    marca: `Marca ${id}`,
    titulo: 'Pix na hora, sem taxa',
    texto: 'Abra sua conta em minutos.',
    cta: 'Abrir conta',
    url: `https://${id}.com.br/conta?ref=site`,
    formatos: ['topo', 'nativo', 'teste'],
    peso: 5,
    cota: 'apoio',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
    ...extra,
  };
}

async function novo(o: Parameters<typeof montar>[0] = {}) {
  const m = await montar({ agora: AGORA, env: { TRUST_PROXY: '1' }, ...o });
  const cookie = await login(m);
  return { m, cookie };
}

const status = async (m: Montado) => (await (await m.app.request('/api/status')).json()) as LiveStatus;

/** Visitante (IP pelo X-Real-IP, como o Caddy do deploy manda). */
const como = (ip: string, extra: Record<string, string> = {}) => ({ 'x-real-ip': ip, 'user-agent': UA, ...extra });

const evento = (m: Montado, corpo: unknown, headers: Record<string, string> = como('203.0.113.10')) =>
  m.app.request('/api/anuncio/evento', {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8', origin: 'http://localhost', 'sec-fetch-site': 'same-origin', ...headers },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });

const metricas = async (m: Montado, cookie: string) =>
  (await (await m.app.request('/api/admin/anuncios/metricas', { headers: { cookie } })).json()) as { metricas: MetricaAnuncio[]; desde: number };

const total = (lista: MetricaAnuncio[], id: string, f: string) => lista.find((x) => x.id === id && x.formato === f) ?? { impressoes: 0, cliques: 0 };

describe('status e imagens', () => {
  let m: Montado;
  let cookie: string;
  beforeEach(async () => {
    ({ m, cookie } = await novo());
  });

  it('status: imagens por URL do servidor, link de clique contado, contato da página Anuncie; nada de base64', async () => {
    expect((await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, imagem: PNG, cota: 'master', formatos: ['topo', 'tv'] }) })).status).toBe(200);
    expect((await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('vulpix') })).status).toBe(200);
    expect((await comando(m, cookie, { tipo: 'anuncie-contato', contato: { email: 'comercial@exemplo.com.br', whatsapp: '5511999990000' } })).status).toBe(200);
    const s = await status(m);
    expect(JSON.stringify(s)).not.toContain('base64');
    expect(s.anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
    const [lynx, vulpix] = s.anuncios!;
    expect(lynx.href).toBe('http://localhost/api/anuncio/ir/lynx');
    expect(lynx.destino).toBe('lynx.com.br');
    expect(lynx.logo).toBe(`http://localhost/api/anuncio/img?h=${hashImagem(SVG)}`);
    expect(lynx.imagem).toBe(`http://localhost/api/anuncio/img?h=${hashImagem(PNG)}`);
    expect(vulpix.logo).toBeUndefined();
    expect(s.anuncie).toEqual({ email: 'comercial@exemplo.com.br', whatsapp: '5511999990000' });
    // legado: o master com 'topo'
    expect(s.patrocinio).toMatchObject({ marca: 'Marca lynx', url: 'http://localhost/api/anuncio/ir/lynx?f=topo' });
    expect(s.patrocinio!.imagem).toMatch(/\/api\/patrocinio\/logo\?h=/);
    // PUBLIC_URL fixa a origem das URLs
    const p = await novo({ env: { PUBLIC_URL: 'https://sintonia2026.com.br' } });
    await comando(p.m, p.cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG }) });
    const sp = await status(p.m);
    expect(sp.anuncios![0].href).toBe('https://sintonia2026.com.br/api/anuncio/ir/lynx');
    expect(sp.anuncios![0].logo).toMatch(/^https:\/\/sintonia2026\.com\.br\/api\/anuncio\/img\?h=[a-f0-9]{16}$/);
  });

  it('GET /api/anuncio/img: bytes, tipo, cache imutável, ETag/304, SVG em sandbox + nosniff; hash desconhecido → 404', async () => {
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, imagem: PNG }) });
    const s = await status(m);
    const caminho = (u: string) => new URL(u).pathname + new URL(u).search;
    const svg = await m.app.request(caminho(s.anuncios![0].logo!));
    expect(svg.status).toBe(200);
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');
    expect(svg.headers.get('cache-control')).toBe(CC.anuncioImg);
    expect(svg.headers.get('cache-control')).toContain('immutable');
    expect(svg.headers.get('content-security-policy')).toBe(CSP_IMAGEM);
    expect(svg.headers.get('content-security-policy')).toContain('sandbox');
    expect(svg.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await svg.text()).toBe(SVG_TXT);
    const etag = svg.headers.get('etag')!;
    expect((await m.app.request(caminho(s.anuncios![0].logo!), { headers: { 'if-none-match': etag } })).status).toBe(304);
    const png = await m.app.request(caminho(s.anuncios![0].imagem!));
    expect(png.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await png.arrayBuffer()).equals(Buffer.from(PNG.split(',')[1], 'base64'))).toBe(true);
    // pausado: a imagem continua servida (o painel mostra a lista inteira), mas o anúncio sai do status
    await comando(m, cookie, { tipo: 'anuncio-ativo', id: 'lynx', ativo: false });
    expect((await status(m)).anuncios).toEqual([]);
    expect((await m.app.request(caminho(s.anuncios![0].logo!))).status).toBe(200);
    // removido: some
    await comando(m, cookie, { tipo: 'anuncio-remover', id: 'lynx' });
    expect((await m.app.request(caminho(s.anuncios![0].logo!))).status).toBe(404);
    expect((await m.app.request('/api/anuncio/img?h=0123456789abcdef')).status).toBe(404);
    expect((await m.app.request('/api/anuncio/img?h=../../etc')).status).toBe(400);
    // rota legada com o mesmo cabeçalho de segurança
    await comando(m, cookie, { tipo: 'patrocinio', patrocinio: { marca: 'Café', texto: 'Oferece.', url: 'https://cafe.com.br', imagem: SVG } });
    const leg = await m.app.request(caminho((await status(m)).patrocinio!.imagem!));
    expect(leg.headers.get('content-security-policy')).toBe(CSP_IMAGEM);
    expect(leg.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('painel: imagens por URL no snapshot; editar devolvendo a URL mantém a imagem (até com outro id, pelo hash)', async () => {
    const r = await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, imagem: PNG }) });
    const snap = (await r.json()) as AdminSnapshot;
    expect(JSON.stringify(snap)).not.toContain('base64');
    const salvo = snap.state.anuncios![0];
    expect(salvo.logo).toMatch(/\/api\/anuncio\/img\?h=/);
    const snapGet = (await (await m.app.request('/api/admin/state', { headers: { cookie } })).json()) as AdminSnapshot;
    expect(snapGet.state.anuncios![0]).toEqual(salvo);
    // ida e volta: só o título muda
    expect((await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: { ...salvo, titulo: 'Novo título' } })).status).toBe(200);
    const st = m.controller.state().anuncios![0];
    expect(st.titulo).toBe('Novo título');
    expect(st.logo).toBe(SVG);
    expect(st.imagem).toBe(PNG);
    // novo anúncio reaproveitando a imagem de outro (URL relativa também vale)
    const rel = new URL(salvo.logo!).pathname + new URL(salvo.logo!).search;
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx-2', { logo: rel }) });
    expect(m.controller.state().anuncios!.find((a) => a.id === 'lynx-2')!.logo).toBe(SVG);
  });

  it('comando: a mesma validação do motor (mensagens claras), campo desconhecido recusado, 1 MB de corpo para logo + peça', async () => {
    const casos: [unknown, RegExp][] = [
      [{ ...anuncio('a1'), naoPolitico: false }, /político-eleitoral/],
      [{ ...anuncio('a1'), url: 'http://a1.com.br' }, /https/],
      [{ ...anuncio('a1'), formatos: [] }, /formato/],
      [{ ...anuncio('a1'), partido: 'X' }, /campo desconhecido/],
      [{ ...anuncio('a1'), imagem: SVG }, /peça/],
      ['lixo', /Anúncio inválido/],
    ];
    for (const [a, re] of casos) {
      const r = await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: a });
      expect(r.status).toBe(400);
      const { erro } = (await r.json()) as { erro: string };
      expect(erro).toMatch(re);
      expect(erro).not.toMatch(/^Comando inválido/);
    }
    expect((await comando(m, cookie, { tipo: 'anuncio-remover', id: 'Não Existe!' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'anuncio-remover', id: 'nao-existe' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'anuncio-ativo', id: 'a1' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'anuncie-contato', contato: { email: 'x' } })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'anuncie-contato', contato: { site: 'x' } })).status).toBe(400);
    // logo de ~140 KB + peça de ~390 KB (≈ 710 KB de corpo)
    const logo = `data:image/png;base64,${'A'.repeat(186_000)}`;
    const peca = `data:image/webp;base64,${'A'.repeat(520_000)}`;
    const r = await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('grande', { logo, imagem: peca }) });
    expect(r.status).toBe(200);
    expect(m.controller.state().anuncios!.find((a) => a.id === 'grande')!.imagem!.length).toBe(peca.length);
  });
});

describe('clique: GET /api/anuncio/ir/:id', () => {
  let m: Montado;
  let cookie: string;
  beforeEach(async () => {
    ({ m, cookie } = await novo());
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
  });

  it('no ar: conta o clique e redireciona com UTM do formato; sem formato válido → UTM "link" sem contar', async () => {
    const r = await m.app.request('/api/anuncio/ir/lynx?f=nativo', { headers: como('203.0.113.1') });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://lynx.com.br/conta?ref=site&utm_source=sintonia&utm_medium=nativo&utm_campaign=lynx');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const sem = await m.app.request('/api/anuncio/ir/lynx', { headers: como('203.0.113.2') });
    expect(sem.headers.get('location')).toContain('utm_medium=link');
    // formato que o anúncio não usa (ou inventado): não conta, UTM "link"
    const tv = await m.app.request('/api/anuncio/ir/lynx?f=tv', { headers: como('203.0.113.3') });
    expect(tv.headers.get('location')).toContain('utm_medium=link');
    const lixo = await m.app.request('/api/anuncio/ir/lynx?f=https://mal.com', { headers: como('203.0.113.3') });
    expect(lixo.headers.get('location')!.startsWith('https://lynx.com.br/')).toBe(true);
    const { metricas: ms } = await metricas(m, cookie);
    expect(total(ms, 'lynx', 'nativo').cliques).toBe(1);
    expect(ms.reduce((s, x) => s + x.cliques, 0)).toBe(1);
  });

  it('nunca redirecionamento aberto: id desconhecido, inválido, pausado ou fora da janela → a home', async () => {
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('agendado', { inicio: AGORA + 3_600_000 }) });
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('pausado', { ativo: false }) });
    for (const c of ['/api/anuncio/ir/nada', '/api/anuncio/ir/agendado?f=topo', '/api/anuncio/ir/pausado?f=topo', '/api/anuncio/ir/%2F%2Fmal.com', '/api/anuncio/ir/..%2F..']) {
      const r = await m.app.request(c, { headers: como('203.0.113.4') });
      expect([302, 404]).toContain(r.status);
      if (r.status === 302) expect(r.headers.get('location')).toBe('/');
    }
    const { metricas: ms } = await metricas(m, cookie);
    expect(ms).toEqual([]);
  });

  it('repetição do mesmo visitante em 30 min não conta; outro visitante conta; robô não conta', async () => {
    const ir = (ip: string, ua = UA) => m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: { 'x-real-ip': ip, 'user-agent': ua } });
    await ir('198.51.100.1');
    await ir('198.51.100.1');
    m.relogio.t += 20 * 60_000;
    await ir('198.51.100.1');
    await ir('198.51.100.2');
    m.relogio.t += 41 * 60_000; // passou da janela (≤ 2 × 30 min)
    await ir('198.51.100.1');
    const robo = await ir('198.51.100.9', 'Mozilla/5.0 (compatible; Twitterbot/1.0)');
    expect(robo.status).toBe(302);
    await ir('198.51.100.9', 'WhatsApp/2.23.20.0');
    const { metricas: ms } = await metricas(m, cookie);
    expect(total(ms, 'lynx', 'topo').cliques).toBe(3);
  });
});

describe('clique e impressão: só do próprio site, só formatos medidos, rede IPv6 /64', () => {
  let m: Montado;
  let cookie: string;
  beforeEach(async () => {
    ({ m, cookie } = await novo());
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { formatos: ['topo', 'nativo', 'tv', 'compartilhamento'] }) });
  });

  it('clique: redireciona sempre, mas só conta navegação vinda do site (GET, documento, mesma origem) em formato com link', async () => {
    const ir = (ip: string, f: string, extra: Record<string, string> = {}, method = 'GET') =>
      m.app.request(`/api/anuncio/ir/lynx?f=${f}`, { method, headers: { ...como(ip), ...extra } });
    // não contam (mas redirecionam): <img> em outro site, outro site, HEAD, formatos sem link (tv, imagens)
    const img = await ir('198.51.100.40', 'topo', { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'image' });
    expect(img.status).toBe(302);
    expect(img.headers.get('location')).toContain('https://lynx.com.br/');
    expect((await ir('198.51.100.41', 'topo', { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'document' })).status).toBe(302);
    expect((await ir('198.51.100.42', 'topo', {}, 'HEAD')).status).toBe(302);
    expect((await ir('198.51.100.43', 'tv')).headers.get('location')).toContain('utm_medium=link');
    expect((await ir('198.51.100.44', 'compartilhamento')).headers.get('location')).toContain('utm_medium=link');
    expect((await metricas(m, cookie)).metricas).toEqual([]);
    // contam: link no próprio site (same-origin, documento), endereço digitado (none) e navegador sem os cabeçalhos
    await ir('198.51.100.50', 'topo', { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'document' });
    await ir('198.51.100.51', 'topo', { 'sec-fetch-site': 'none', 'sec-fetch-dest': 'document' });
    await ir('198.51.100.52', 'nativo');
    const { metricas: ms } = await metricas(m, cookie);
    expect(total(ms, 'lynx', 'topo').cliques).toBe(2);
    expect(total(ms, 'lynx', 'nativo').cliques).toBe(1);
  });

  it('impressão: imagens de compartilhamento não são medidas; sem Origin nem Sec-Fetch-Site → 204 sem contar', async () => {
    expect((await evento(m, { id: 'lynx', formato: 'compartilhamento' })).status).toBe(400);
    const curl = await m.app.request('/api/anuncio/evento', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', ...como('198.51.100.60') },
      body: JSON.stringify({ id: 'lynx', formato: 'topo' }),
    });
    expect(curl.status).toBe(204);
    expect((await metricas(m, cookie)).metricas).toEqual([]);
    // Modo TV: só impressão (a tela não tem link)
    expect((await evento(m, { id: 'lynx', formato: 'tv' }, como('198.51.100.61'))).status).toBe(204);
    expect(total((await metricas(m, cookie)).metricas, 'lynx', 'tv').impressoes).toBe(1);
  });

  it('IPv6: trocar o endereço dentro da mesma faixa /64 não zera repetição nem limite', async () => {
    const ip = (n: number) => `2001:db8:abcd:12::${n.toString(16)}`;
    for (let i = 1; i <= 5; i++) await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como(ip(i)) });
    for (let i = 1; i <= 5; i++) await evento(m, { id: 'lynx', formato: 'topo' }, como(ip(100 + i)));
    let r: Response | null = null;
    for (let i = 0; i <= EVENTOS_ANUNCIO_MIN; i++) r = await evento(m, { id: 'lynx', formato: 'nativo' }, como(ip(1000 + i)));
    expect(r!.status).toBe(429);
    // outra faixa /64 é outro visitante
    await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como('2001:db8:abcd:13::1') });
    const { metricas: ms } = await metricas(m, cookie);
    expect(total(ms, 'lynx', 'topo').cliques).toBe(2);
    expect(total(ms, 'lynx', 'topo').impressoes).toBe(1);
  });
});

describe('impressão: POST /api/anuncio/evento', () => {
  let m: Montado;
  let cookie: string;
  beforeEach(async () => {
    ({ m, cookie } = await novo());
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
  });

  it('204; corpo text/plain (sendBeacon) ou JSON; repetida em 5 min não conta; outro formato conta', async () => {
    expect((await evento(m, { id: 'lynx', formato: 'topo' })).status).toBe(204);
    expect((await evento(m, { id: 'lynx', formato: 'topo' })).status).toBe(204);
    expect((await evento(m, { id: 'lynx', formato: 'nativo' }, { ...como('203.0.113.10'), 'content-type': 'application/json' })).status).toBe(204);
    m.relogio.t += 4 * 60_000;
    await evento(m, { id: 'lynx', formato: 'topo' });
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.11'));
    m.relogio.t += 7 * 60_000;
    await evento(m, { id: 'lynx', formato: 'topo' });
    const { metricas: ms } = await metricas(m, cookie);
    expect(total(ms, 'lynx', 'topo').impressoes).toBe(3);
    expect(total(ms, 'lynx', 'nativo').impressoes).toBe(1);
    const r = await evento(m, { id: 'lynx', formato: 'topo' });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('recusa: outro site (403), JSON ruim (400), formato que o anúncio não usa (400), fora do ar (404), corpo grande (413)', async () => {
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, { ...como('203.0.113.12'), 'sec-fetch-site': 'cross-site', origin: 'https://mal.com' })).status).toBe(403);
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, { ...como('203.0.113.12'), 'sec-fetch-site': '', origin: 'https://mal.com' })).status).toBe(403);
    expect((await evento(m, '{nao é json')).status).toBe(400);
    expect((await evento(m, { id: 'lynx' })).status).toBe(400);
    expect((await evento(m, { id: 'lynx', formato: 'tv' })).status).toBe(400);
    expect((await evento(m, { id: 'lynx', formato: 'popup' })).status).toBe(400);
    expect((await evento(m, { id: 'outro', formato: 'topo' })).status).toBe(404);
    expect((await evento(m, { id: 'lynx', formato: 'topo', x: 'y'.repeat(4000) })).status).toBe(413);
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, { ...como('203.0.113.12'), 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    await comando(m, cookie, { tipo: 'anuncio-ativo', id: 'lynx', ativo: false });
    expect((await evento(m, { id: 'lynx', formato: 'topo' })).status).toBe(404);
    const { metricas: ms } = await metricas(m, cookie);
    expect(ms).toEqual([]);
  });

  it(`limite por visitante (${EVENTOS_ANUNCIO_MIN}/min → 429) e robôs não contam`, async () => {
    let r: Response | null = null;
    for (let i = 0; i <= EVENTOS_ANUNCIO_MIN; i++) r = await evento(m, { id: 'lynx', formato: i % 2 ? 'topo' : 'nativo' }, como('203.0.113.20'));
    expect(r!.status).toBe(429);
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.21'))).status).toBe(204);
    m.relogio.t += 61_000;
    expect((await evento(m, { id: 'lynx', formato: 'teste' }, como('203.0.113.20'))).status).toBe(204);
    await evento(m, { id: 'lynx', formato: 'teste' }, como('203.0.113.22', { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0' }));
    const { metricas: ms } = await metricas(m, cookie);
    expect(total(ms, 'lynx', 'teste').impressoes).toBe(1);
  });
});

describe('relatório do admin e persistência', () => {
  it('rota do relatório exige sessão; por hora (48 h no detalhe), totais desde sempre', async () => {
    const { m, cookie } = await novo();
    expect((await m.app.request('/api/admin/anuncios/metricas')).status).toBe(401);
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const r0 = await metricas(m, cookie);
    expect(r0.metricas).toEqual([]);
    expect(r0.desde).toBe(AGORA);
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.30'));
    m.relogio.t += HORA_MS;
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.31'));
    await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como('203.0.113.31') });
    const r1 = await metricas(m, cookie);
    const t = total(r1.metricas, 'lynx', 'topo') as MetricaAnuncio;
    expect([t.impressoes, t.cliques]).toEqual([2, 1]);
    expect(t.porHora.map((h) => [h.hora - Math.floor(AGORA / HORA_MS) * HORA_MS, h.impressoes, h.cliques])).toEqual([
      [0, 1, 0],
      [HORA_MS, 1, 1],
    ]);
    // 49 h depois: o detalhe da 1ª hora saiu; os totais ficam (a sessão de 12 h venceu: entra de novo)
    m.relogio.t += 48 * HORA_MS;
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.32'));
    const t2 = total((await metricas(m, await login(m))).metricas, 'lynx', 'topo') as MetricaAnuncio;
    expect(t2.impressoes).toBe(3);
    expect(t2.porHora.length).toBe(1);
  });

  it('grava STATE_DIR/anuncios-metricas.json (atômico) e restaura na subida; nunca grava IP nem a chave do visitante', async () => {
    const linhas: string[] = [];
    const { m, cookie } = await novo({ metricasEmDisco: true, escreverLog: (l) => linhas.push(l) });
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.77'));
    await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como('203.0.113.77') });
    const arq = join(m.stateDir, 'anuncios-metricas.json');
    expect(existsSync(arq)).toBe(false);
    await m.persistirMetricasAnuncios();
    expect(existsSync(arq)).toBe(true);
    const texto = readFileSync(arq, 'utf8');
    expect(texto).not.toContain('203.0.113');
    expect(JSON.parse(texto)).toMatchObject({ v: 1, desde: AGORA, series: [{ id: 'lynx', f: 'topo', i: 1, c: 1 }] });
    expect(linhas.join('\n')).not.toContain('203.0.113');
    // sem contagem nova: não regrava
    m.relogio.t += 60_000;
    await m.persistirMetricasAnuncios();
    expect(readFileSync(arq, 'utf8')).toBe(texto);
    // outro processo com o mesmo STATE_DIR: começa de onde parou
    const outro = await novo({ metricasEmDisco: true, stateDir: m.stateDir });
    outro.m.relogio.t = m.relogio.t;
    const r = await metricas(outro.m, outro.cookie);
    expect(total(r.metricas, 'lynx', 'topo')).toMatchObject({ impressoes: 1, cliques: 1 });
    expect(r.desde).toBe(AGORA);
  });
});

describe('peças puras', () => {
  it('MetricasAnuncios: ida e volta pelo JSON; arquivo com lixo é ignorado sem lançar', () => {
    let t = AGORA;
    const a = new MetricasAnuncios(() => t);
    a.impressao('lynx', 'topo', 'v1');
    a.impressao('lynx', 'topo', 'v2');
    a.clique('lynx', 'topo', 'v1');
    t += HORA_MS;
    a.impressao('vulpix', 'nativo', 'v1');
    const b = new MetricasAnuncios(() => t);
    expect(b.carregar(JSON.parse(JSON.stringify(a.toJSON())))).toBe(true);
    expect(b.lista()).toEqual(a.lista());
    expect(b.desde).toBe(AGORA);
    const c = new MetricasAnuncios(() => t);
    for (const lixo of [null, 'x', { v: 2 }, { v: 1, series: 'x' }, { v: 1, series: [{ id: '../x', f: 'topo' }, { id: 'ok', f: 'popup' }, { id: 'ok', f: 'topo', i: -5, c: 'x', h: [[1, 2]] }] }])
      expect(() => c.carregar(lixo)).not.toThrow();
    expect(c.lista()).toEqual([{ id: 'ok', formato: 'topo', impressoes: 0, cliques: 0, porHora: [] }]);
  });

  it('Repeticoes e LimiteJanela: memória limitada, janelas respeitadas', () => {
    let t = 0;
    const r = new Repeticoes(1000, () => t, 100);
    expect(r.visto('a')).toBe(false);
    expect(r.visto('a')).toBe(true);
    t = 1500;
    expect(r.visto('a')).toBe(true); // ainda na geração anterior (≤ 2 × janela)
    t = 4000;
    expect(r.visto('a')).toBe(false);
    for (let i = 0; i < 1000; i++) r.visto(`k${i}`);
    expect(r.tamanho).toBeLessThanOrEqual(200);
    const l = new LimiteJanela(2, 1000, () => t);
    expect([l.tentar('x'), l.tentar('x'), l.tentar('x'), l.tentar('y')]).toEqual([true, true, false, true]);
    t += 1000;
    expect(l.tentar('x')).toBe(true);
    // teto de chaves na janela: visitante novo além do teto é recusado (não conta) até a janela virar
    const lc = new LimiteJanela(5, 1000, () => t, 3);
    expect(['a', 'b', 'c', 'd'].map((k) => lc.tentar(k))).toEqual([true, true, true, false]);
    expect(lc.tentar('a')).toBe(true);
    expect(lc.tamanho).toBe(3);
    t += 1000;
    expect(lc.tentar('d')).toBe(true);
    expect(numeroDe('abc')).toBe(numeroDe('abc'));
    expect(numeroDe('abc')).not.toBe(numeroDe('abd'));
    expect(Number.isSafeInteger(numeroDe('qualquer coisa longa'.repeat(10)))).toBe(true);
  });

  it('TabelaAnuncios: resolve só URLs deste servidor com hash conhecido; ehRobo', () => {
    const t = new TabelaAnuncios();
    t.sincronizar(1, () => [anuncio('lynx', { logo: SVG })]);
    const h = hashImagem(SVG);
    expect(t.resolver(`/api/anuncio/img?h=${h}`)).toBe(SVG);
    expect(t.resolver(`https://outro.site/api/anuncio/img?h=${h}`)).toBe(SVG);
    expect(t.resolver('/api/anuncio/img?h=0000000000000000')).toBe('/api/anuncio/img?h=0000000000000000');
    expect(t.resolver('https://cdn.exemplo.com/logo.png')).toBe('https://cdn.exemplo.com/logo.png');
    expect(t.obter(h)?.tipo).toBe('image/svg+xml');
    t.sincronizar(2, () => []);
    expect(t.obter(h)).toBeNull();
    expect(ehRobo(UA)).toBe(false);
    expect(ehRobo('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0')).toBe(false);
    for (const b of ['Twitterbot/1.0', 'facebookexternalhit/1.1', 'WhatsApp/2.2', 'Googlebot/2.1', 'curl/8.4', 'Mozilla/5.0 HeadlessChrome/120', '', undefined])
      expect(ehRobo(b)).toBe(true);
  });
});

describe('contatos públicos (painel → Comunicação)', () => {
  it('comando "contatos": vai para o status, fica no admin.json e volta depois de reiniciar; null limpa', async () => {
    const { m, cookie } = await novo();
    const contatos = { geral: 'contato@sintonia2026.com.br', privacidade: 'privacidade@sintonia2026.com.br', responsavel: 'Empresa Exemplo Ltda.', cnpj: '11.222.333/0001-81' };
    expect((await comando(m, cookie, { tipo: 'contatos', contatos })).status).toBe(200);
    const s = await status(m);
    expect(s.contatos).toEqual({ ...contatos, cnpj: '11222333000181' });
    // inválidos: domínio reservado, campo desconhecido, CNPJ errado
    expect((await comando(m, cookie, { tipo: 'contatos', contatos: { imprensa: 'imprensa@sintonia.example' } })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'contatos', contatos: { telefone: '1' } })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'contatos', contatos: { responsavel: 'X Ltda', cnpj: '11222333000182' } })).status).toBe(400);
    await m.store.flush();
    const m2 = await montar({ stateDir: m.stateDir, estadoInicial: m.store.ler() as AdminState });
    expect((await status(m2)).contatos).toEqual({ ...contatos, cnpj: '11222333000181' });
    expect((await comando(m, cookie, { tipo: 'contatos', contatos: null })).status).toBe(200);
    expect((await status(m)).contatos).toBeNull();
  });

  it('e-mail provisório (example.com) nunca vai para a /anuncie: recusado no comando; salvo por versão antiga, sai só ele', async () => {
    const { m, cookie } = await novo();
    expect((await comando(m, cookie, { tipo: 'anuncie-contato', contato: { email: 'contato@example.com' } })).status).toBe(400);
    const antigo = { ...(m.store.ler() as AdminState), anuncie: { email: 'contato@example.com', whatsapp: '5511999999999' } };
    const m2 = await montar({ stateDir: m.stateDir, estadoInicial: antigo });
    expect((await status(m2)).anuncie).toEqual({ whatsapp: '5511999999999' });
  });
});
