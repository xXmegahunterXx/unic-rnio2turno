/**
 * Anúncios no servidor: /api/status (imagens por URL, link de clique), /api/anuncio/img (bytes, cabeçalhos, SVG em
 * sandbox), /api/anuncio/ir/:id (clique contado + 302, nunca redirecionamento aberto), /api/anuncio/evento (impressão
 * visível: origem, repetição, limite, robôs), relatório do admin, persistência das métricas, validação do comando
 * (zod = motor) e a ida e volta das imagens pelo painel.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { AnuncioConfig, MetricaAnuncio, MetricasAnunciosResposta } from '../shared/anuncios';
import type { AdminState, LiveStatus } from '../shared/types';
import { HORA_MS, LimiteJanela, MetricasAnuncios, Repeticoes, TETO_PESSOAS, TETO_PESSOAS_ANUNCIO, TabelaAnuncios, ehRobo, hashImagem, numeroDe } from './anuncios';
import { CC, CSP_IMAGEM, EVENTOS_ANUNCIO_MIN, EVENTOS_REDE_MIN } from './app';
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

  it('comando: campos do contrato v2 aceitos pela rota (antes: "campo desconhecido"); categorias sensíveis recusadas', async () => {
    const ajuste = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' } as const;
    const v2 = anuncio('v2', {
      logo: PNG,
      logoAjuste: ajuste,
      logoEscuro: SVG,
      logoEscuroAjuste: ajuste,
      imagem: PNG,
      imagemAjuste: { ...ajuste, comFundo: true },
      reserva: true,
      limiteImpressoes: 25_000,
      inicio: AGORA,
    });
    expect((await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: v2 })).status).toBe(200);
    expect(m.controller.state().anuncios!.find((a) => a.id === 'v2')).toMatchObject({ cota: 'apoio', reserva: true, limiteImpressoes: 25_000, logoAjuste: ajuste, logoEscuro: SVG });
    expect(JSON.stringify(await status(m))).not.toContain('base64');
    const bet = await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('bet', { marca: 'Bet Brasil' }) });
    expect(bet.status).toBe(400);
    expect(((await bet.json()) as { erro: string }).erro).toMatch(/^Anúncio recusado: o Sintonia não aceita anúncios de apostas/);
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

  it('IPv6: trocar o endereço dentro da mesma faixa /64 não zera repetição nem limite (300 eventos/min por /64)', async () => {
    const ip = (n: number) => `2001:db8:abcd:12::${n.toString(16)}`;
    for (let i = 1; i <= 5; i++) await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como(ip(i)) });
    for (let i = 1; i <= 5; i++) await evento(m, { id: 'lynx', formato: 'topo' }, como(ip(100 + i)));
    let r: Response | null = null;
    for (let i = 0; i <= EVENTOS_REDE_MIN.v6; i++) r = await evento(m, { id: 'lynx', formato: 'nativo' }, como(ip(1000 + i)));
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

  it(`limite por rede (${EVENTOS_REDE_MIN.v4}/min num IPv4 → 429) e robôs não contam`, async () => {
    let r: Response | null = null;
    for (let i = 0; i <= EVENTOS_REDE_MIN.v4; i++) r = await evento(m, { id: 'lynx', formato: i % 2 ? 'topo' : 'nativo' }, como('203.0.113.20'));
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
    expect(JSON.parse(texto)).toMatchObject({ v: 1, versao: 2, desde: AGORA, series: [{ id: 'lynx', f: 'topo', i: 1, c: 1, d: [['2026-10-15', 1, 1]] }] });
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
    // 'deixa' (contagem dos anúncios): mapa cheio → a chave nova passa sem limite, sem crescer o mapa
    const ld = new LimiteJanela(1, 1000, () => t, 2, 'deixa');
    expect(['a', 'b', 'c', 'c', 'a'].map((k) => ld.tentar(k))).toEqual([true, true, true, true, false]);
    expect(ld.tamanho).toBe(2);
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

// ---- anunciantes v2 no servidor (E8, E12, E14, E15, E16) ------------------------------------------------------------

/** PNG "de verdade" (assinatura + chunks) com `bytes` de dados: passa na regra das imagens (parada, tamanho). */
function pngGrande(bytes: number, semente = 0): string {
  const dados = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) dados[i] = (i * 31 + semente * 7) & 0xff;
  const chunk = (tipo: string, corpo: Buffer) => {
    const c = Buffer.alloc(12 + corpo.length);
    c.writeUInt32BE(corpo.length, 0);
    c.write(tipo, 4, 'latin1');
    corpo.copy(c, 8);
    return c;
  };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), chunk('IDAT', dados), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
/** APNG mínimo (acTL antes do IDAT). */
const APNG = (() => {
  const partes: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [tipo, tam] of [['IHDR', 13], ['acTL', 8], ['IDAT', 10], ['IEND', 0]] as const) {
    const c = Buffer.alloc(12 + tam);
    c.writeUInt32BE(tam, 0);
    c.write(tipo, 4, 'latin1');
    partes.push(c);
  }
  return `data:image/png;base64,${Buffer.concat(partes).toString('base64')}`;
})();
const svgDe = (txt: string) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="10"><text>${txt}</text></svg>`).toString('base64')}`;
const AJUSTE = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' } as const;
/** User-Agent de navegador comum (não `headless`), variando a versão. */
const uaN = (n: number) => `Mozilla/5.0 (Linux; Android 14; SM-A${100 + (n % 900)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${100 + n}.0.0.0 Mobile Safari/537.36`;
const caminhoDe = (u: string) => new URL(u).pathname + new URL(u).search;

describe('v2: imagens (logo, versão escura e peça), anuncio-logo, interruptor geral e corpo do comando', () => {
  let m: Montado;
  let cookie: string;
  beforeEach(async () => {
    ({ m, cookie } = await novo());
  });

  it('12 anúncios com versão escura: /api/status e o painel sem nenhum data URI; a versão escura servida pelo hash, imutável', async () => {
    for (let i = 0; i < 12; i++) {
      const r = await comando(m, cookie, {
        tipo: 'anuncio-salvar',
        anuncio: anuncio(`marca-${i}`, { logo: svgDe(`claro ${i}`), logoAjuste: AJUSTE, logoEscuro: svgDe(`escuro ${i}`), logoEscuroAjuste: AJUSTE, imagem: pngGrande(200, i), imagemAjuste: AJUSTE, formatos: ['nativo'] }),
      });
      expect(r.status).toBe(200);
    }
    const s = await status(m);
    expect(s.anuncios).toHaveLength(12);
    expect(JSON.stringify(s)).not.toContain('data:image');
    const a5 = s.anuncios![5];
    expect(a5.logoEscuro).toBe(`http://localhost/api/anuncio/img?h=${hashImagem(svgDe('escuro 5'))}`);
    expect(a5.logoEscuroAjuste).toEqual(AJUSTE);
    expect(a5.logoAjuste).toEqual(AJUSTE);
    expect(a5.imagemAjuste).toEqual(AJUSTE);
    const img = await m.app.request(caminhoDe(a5.logoEscuro!));
    expect(img.status).toBe(200);
    expect(img.headers.get('cache-control')).toBe(CC.anuncioImg);
    expect(await img.text()).toContain('escuro 5');
    const snap = (await (await m.app.request('/api/admin/state', { headers: { cookie } })).json()) as AdminSnapshot;
    expect(JSON.stringify(snap)).not.toContain('data:image');
    // ida e volta pelo painel (URLs) mantém as três imagens
    const salvo = snap.state.anuncios!.find((a) => a.id === 'marca-5')!;
    expect((await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: { ...salvo, titulo: 'Outro título' } })).status).toBe(200);
    expect(m.controller.state().anuncios!.find((a) => a.id === 'marca-5')).toMatchObject({ logo: svgDe('claro 5'), logoEscuro: svgDe('escuro 5'), imagem: pngGrande(200, 5), logoEscuroAjuste: AJUSTE });
  });

  it('corpo do comando: logo de 150 KB + versão escura de 150 KB + peça de 400 KB → 200; acima de 1,5 MB → 413', async () => {
    const logo = pngGrande(150 * 1024 - 200, 1);
    const escura = pngGrande(150 * 1024 - 200, 2);
    const peca = pngGrande(400 * 1024 - 200, 3);
    const r = await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('grande', { logo, logoEscuro: escura, imagem: peca }) });
    expect(r.status).toBe(200);
    expect(m.controller.state().anuncios!.find((a) => a.id === 'grande')).toMatchObject({ logo, logoEscuro: escura, imagem: peca });
    const enorme = await m.app.request('/api/admin/command', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: 'http://localhost', 'content-length': String(1.6 * 1024 * 1024) },
      body: JSON.stringify({ tipo: 'anuncio-salvar', anuncio: anuncio('x', { imagem: `data:image/png;base64,${'A'.repeat(1_650_000)}` }) }),
    });
    expect(enorme.status).toBe(413);
  });

  it('anuncio-logo pela rota: URL do servidor vira o conteúdo (resolverAnuncio); animada → 400 "imagem parada"; id desconhecido → 400', async () => {
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, imagem: PNG }) });
    const urlLogo = (await status(m)).anuncios![0].logo!;
    // "Ajustar agora": logo nova (PNG recortado) com o ajuste; o desfazer devolve o data URI original sem ajuste
    expect((await comando(m, cookie, { tipo: 'anuncio-logo', id: 'lynx', logo: PNG, logoAjuste: AJUSTE })).status).toBe(200);
    expect(m.controller.state().anuncios![0]).toMatchObject({ logo: PNG, logoAjuste: AJUSTE, imagem: PNG });
    expect((await comando(m, cookie, { tipo: 'anuncio-logo', id: 'lynx', logo: SVG, logoAjuste: null })).status).toBe(200);
    expect(m.controller.state().anuncios![0].logo).toBe(SVG);
    expect(m.controller.state().anuncios![0].logoAjuste).toBeUndefined();
    // a URL do servidor (hash conhecido) vale como a imagem
    expect((await comando(m, cookie, { tipo: 'anuncio-logo', id: 'lynx', logoEscuro: caminhoDe(urlLogo), logoEscuroAjuste: AJUSTE })).status).toBe(200);
    expect(m.controller.state().anuncios![0]).toMatchObject({ logoEscuro: SVG, logoEscuroAjuste: AJUSTE });
    const animada = await comando(m, cookie, { tipo: 'anuncio-logo', id: 'lynx', logo: APNG });
    expect(animada.status).toBe(400);
    expect(((await animada.json()) as { erro: string }).erro).toMatch(/imagem parada/);
    const salvar = await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('outro', { logo: APNG }) });
    expect(salvar.status).toBe(400);
    expect(((await salvar.json()) as { erro: string }).erro).toMatch(/imagem parada/);
    expect((await comando(m, cookie, { tipo: 'anuncio-logo', id: 'nao-existe', logo: PNG })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'anuncio-logo', id: 'lynx', logo: PNG, marca: 'x' })).status).toBe(400);
  });

  it('interruptor geral pela rota: status sem anúncios e com anunciosSuspensos; impressão → 404; voltar devolve os mesmos', async () => {
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, cota: 'master' }) });
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('vulpix') });
    const antes = (await status(m)).anuncios;
    expect(antes).toHaveLength(2);
    expect((await comando(m, cookie, { tipo: 'anuncios-suspensao', suspender: true, motivo: 'teste' })).status).toBe(200);
    const s = await status(m);
    expect(s.anuncios).toEqual([]);
    expect(s.patrocinio).toBeNull();
    expect(s.anunciosSuspensos).toBe(true);
    expect((await evento(m, { id: 'lynx', formato: 'topo' })).status).toBe(404);
    const snap = (await (await m.app.request('/api/admin/state', { headers: { cookie } })).json()) as AdminSnapshot;
    expect(snap.state.anunciosSuspensos).toEqual({ desde: AGORA, motivo: 'teste' });
    expect((await comando(m, cookie, { tipo: 'anuncios-suspensao', suspender: true, motivo: 'x'.repeat(141) })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'anuncios-suspensao', suspender: false })).status).toBe(200);
    const depois = await status(m);
    expect(depois.anuncios).toEqual(antes);
    expect(depois.anunciosSuspensos).toBeUndefined();
  });
});

describe('v2: contagem por pessoa (rede + navegador, E14)', () => {
  let m: Montado;
  let cookie: string;
  beforeEach(async () => {
    ({ m, cookie } = await novo());
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const impressoes = async () => total((await metricas(m, cookie)).metricas, 'lynx', 'topo').impressoes;

  it('70 navegadores no mesmo IPv4 contam 70; o mesmo navegador de novo em 5 min não conta', async () => {
    for (let i = 0; i < 70; i++) expect((await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.50', { 'user-agent': uaN(i) }))).status).toBe(204);
    expect(await impressoes()).toBe(70);
    for (let i = 0; i < 70; i++) await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.50', { 'user-agent': uaN(i) }));
    expect(await impressoes()).toBe(70);
    m.relogio.t += 4 * 60_000;
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.50', { 'user-agent': uaN(0) }));
    expect(await impressoes()).toBe(70);
    m.relogio.t += 7 * 60_000;
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.50', { 'user-agent': uaN(0) }));
    expect(await impressoes()).toBe(71);
  });

  it('teto por rede num anúncio: 450 navegadores num IPv4 contam 100 + 1 (a rede); 20 num /64 de IPv6 contam 8 + 1', async () => {
    for (let i = 0; i < 450; i++) await evento(m, { id: 'lynx', formato: 'topo' }, como('198.51.100.7', { 'user-agent': uaN(i) }));
    expect(await impressoes()).toBe(TETO_PESSOAS_ANUNCIO.v4 + 1);
    for (let i = 0; i < 20; i++) await evento(m, { id: 'lynx', formato: 'nativo' }, como(`2001:db8:1:2::${(i + 1).toString(16)}`, { 'user-agent': uaN(i) }));
    expect(total((await metricas(m, cookie)).metricas, 'lynx', 'nativo').impressoes).toBe(9);
  });

  it('teto da rede inteira: 450 navegadores num IPv4 espalhados por 5 anúncios contam 400 + 1', async () => {
    const ids = ['a1', 'a2', 'a3', 'a4', 'a5'];
    for (const id of ids) await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio(id, { formatos: ['nativo'] }) });
    for (let i = 0; i < 450; i++) await evento(m, { id: ids[Math.floor(i / 90)], formato: 'nativo' }, como('198.51.100.8', { 'user-agent': uaN(i) }));
    const lista = (await metricas(m, cookie)).metricas;
    expect(ids.reduce((n, id) => n + total(lista, id, 'nativo').impressoes, 0)).toBe(TETO_PESSOAS.v4 + 1);
  });

  it('inflação trocando o User-Agent num IPv4: um anúncio com 7 formatos soma no máximo (100 + 1) × formatos em 5 min', async () => {
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('meta', { formatos: ['topo', 'nativo', 'teste'] }) });
    for (let i = 0; i < 300; i++)
      for (const formato of ['topo', 'nativo', 'teste']) await evento(m, { id: 'meta', formato }, como('198.51.100.9', { 'user-agent': uaN(i) }));
    const lista = (await metricas(m, cookie)).metricas;
    const soma = ['topo', 'nativo', 'teste'].reduce((n, f) => n + total(lista, 'meta', f).impressoes, 0);
    expect(soma).toBe((TETO_PESSOAS_ANUNCIO.v4 + 1) * 3);
  });

  it('clique também conta por pessoa (redirecionamento sempre)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como('203.0.113.60', { 'user-agent': uaN(i) }) });
      expect(r.status).toBe(302);
    }
    await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: como('203.0.113.60', { 'user-agent': uaN(0) }) });
    expect(total((await metricas(m, cookie)).metricas, 'lynx', 'topo').cliques).toBe(5);
  });

  it('ANUNCIO_PESSOA=0: conta pela rede, como antes (70 navegadores no mesmo IPv4 = 1; 60 eventos/min por rede)', async () => {
    vi.stubEnv('ANUNCIO_PESSOA', '0');
    ({ m, cookie } = await novo());
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    for (let i = 0; i < 59; i++) await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.70', { 'user-agent': uaN(i) }));
    expect(await impressoes()).toBe(1);
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.70'))).status).toBe(204);
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.70'))).status).toBe(429);
    expect(EVENTOS_ANUNCIO_MIN).toBe(60);
  });
});

describe('v2: métricas de 14 dias, alcance e meta de impressões (E15, E16)', () => {
  it('?horas= de 1 a 336 (padrão 48); entregue, esgotadoEm e alcance na resposta', async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.80'));
    m.relogio.t += 72 * HORA_MS;
    const ck = await login(m);
    await evento(m, { id: 'lynx', formato: 'topo' }, como('203.0.113.81'));
    const r48 = await metricas(m, ck);
    expect(total(r48.metricas, 'lynx', 'topo')).toMatchObject({ impressoes: 2 });
    expect((total(r48.metricas, 'lynx', 'topo') as MetricaAnuncio).porHora).toHaveLength(1);
    const r336 = (await (await m.app.request('/api/admin/anuncios/metricas?horas=336', { headers: { cookie: ck } })).json()) as MetricasAnunciosResposta;
    expect((total(r336.metricas, 'lynx', 'topo') as MetricaAnuncio).porHora).toHaveLength(2);
    expect(r336.alcance!.lynx).toEqual({ campanha: 2, noite: null }); // 2 pessoas: o teto é o nº de impressões
    expect(r336.entregue).toEqual({});
    expect(r336.esgotadoEm).toEqual({});
    for (const q of ['0', '337', 'abc', '1.5']) expect((await m.app.request(`/api/admin/anuncios/metricas?horas=${q}`, { headers: { cookie: ck } })).status).toBe(400);
  });

  it('meta de 1.000 com início agora: 1.000 impressões → sai do /api/status (e a chave do cache muda); aumentar a meta faz voltar', async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { limiteImpressoes: 1000, inicio: AGORA - 60_000 }) });
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('vulpix') });
    expect((await status(m)).anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
    for (let i = 0; i < 999; i++) await evento(m, { id: 'lynx', formato: i % 2 ? 'topo' : 'nativo' }, como(`10.${i >> 8}.${i & 255}.1`, { 'user-agent': uaN(i) }));
    m.verificarMetas();
    expect((await status(m)).anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
    await evento(m, { id: 'lynx', formato: 'teste' }, como('10.9.9.9'));
    expect(m.verificarMetas()).toBe(true);
    // mesmo segundo (o corpo do status fica em cache 1 s): a geração dos esgotados entra na chave
    const s = await status(m);
    expect(s.anuncios!.map((a) => a.id)).toEqual(['vulpix']);
    const r = (await (await m.app.request('/api/admin/anuncios/metricas', { headers: { cookie } })).json()) as MetricasAnunciosResposta;
    expect(r.entregue).toEqual({ lynx: 1000 });
    expect(r.esgotadoEm).toEqual({ lynx: AGORA });
    // impressão que ainda chegar conta (bônus)
    expect((await evento(m, { id: 'lynx', formato: 'topo' }, como('10.9.9.10'))).status).toBe(204);
    // aumentar a meta: volta na hora (o servidor confere a meta depois de cada comando)
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { limiteImpressoes: 2000, inicio: AGORA - 60_000 }) });
    expect((await status(m)).anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
    // tirar a meta também
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { limiteImpressoes: 1000, inicio: AGORA - 60_000 }) });
    expect((await status(m)).anuncios!.map((a) => a.id)).toEqual(['vulpix']);
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { inicio: AGORA - 60_000 }) });
    expect((await status(m)).anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
  });

  it('reinício: números, dias, alcance e metas atingidas continuam (arquivo v2); a v1 é lida', async () => {
    const { m, cookie } = await novo({ metricasEmDisco: true });
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { limiteImpressoes: 1000, inicio: AGORA }) });
    for (let i = 0; i < 1000; i++) await evento(m, { id: 'lynx', formato: 'topo' }, como(`10.1.${i >> 8}.${i & 255}`, { 'user-agent': uaN(i) }));
    m.verificarMetas();
    await m.persistirMetricasAnuncios();
    const outro = await novo({ metricasEmDisco: true, stateDir: m.stateDir, estadoInicial: m.controller.state() });
    outro.m.relogio.t = m.relogio.t;
    const r = (await (await outro.m.app.request('/api/admin/anuncios/metricas', { headers: { cookie: outro.cookie } })).json()) as MetricasAnunciosResposta;
    expect(total(r.metricas, 'lynx', 'topo').impressoes).toBe(1000);
    expect(r.esgotadoEm).toEqual({ lynx: AGORA });
    expect(r.alcance!.lynx.campanha).toBeGreaterThanOrEqual(950);
    expect(r.alcance!.lynx.campanha).toBeLessThanOrEqual(1000);
    expect((await status(outro.m)).anuncios).toEqual([]);
    // arquivo da versão anterior (v1): totais, horas e os dias tirados das horas
    const v1 = { v: 1, desde: AGORA - 86_400_000, salvoEm: AGORA, series: [{ id: 'lynx', f: 'topo', i: 15, c: 2, h: [[Math.floor(AGORA / HORA_MS) * HORA_MS, 10, 1]] }] };
    const mt = new MetricasAnuncios(() => AGORA);
    expect(mt.carregar(v1)).toBe(true);
    expect(mt.lista()[0]).toMatchObject({ impressoes: 15, cliques: 2 });
    expect(mt.paraRelatorio('lynx').dias).toEqual([{ dia: '2026-10-14', impressoes: 5, cliques: 1 }]);
  });
});
