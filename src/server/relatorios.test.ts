/**
 * Relatório do anunciante por link privado (E17, src/server/relatorios.ts): criar e revogar no painel, a rota pública
 * `POST /api/anuncie/relatorio` (token errado/revogado → 404, cabeçalhos, limite por minuto, meta só com "mostrar meta"),
 * o arquivo com só o hash do token, a página /relatorio fora dos buscadores e o interruptor RELATORIOS=0.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnuncioConfig } from '../shared/anuncios';
import type { LinkRelatorio, RelatorioAnunciante } from '../shared/relatorio';
import { totaisDoPeriodo } from '../shared/relatorio';
import { ROBOTS_TXT } from './app';
import { PEDIDOS_RELATORIO_MIN, hashToken } from './relatorios';
import { comando, login, montar, type Montado } from './test-helpers';

/** 15/10/2026 12:00 de Brasília. */
const AGORA = Date.UTC(2026, 9, 15, 15, 0, 0);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function anuncio(id: string, extra: Partial<AnuncioConfig> = {}): AnuncioConfig {
  return {
    id,
    marca: 'Lynx',
    titulo: 'Carteira digital com Pix em tempo real e sem mensalidade',
    texto: '',
    cta: 'Abrir conta',
    url: `https://${id}.com.br`,
    formatos: ['topo', 'nativo'],
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

const admin = (m: Montado, cookie: string, corpo: unknown) =>
  m.app.request('/api/admin/relatorios', { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(corpo) });

const pedir = (m: Montado, k: unknown, ip = '203.0.113.5', extra: Record<string, string> = {}) =>
  m.app.request('/api/anuncie/relatorio', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin', 'x-real-ip': ip, 'user-agent': UA, ...extra },
    body: JSON.stringify({ k }),
  });

const evento = (m: Montado, id: string, formato: string, ip: string) =>
  m.app.request('/api/anuncio/evento', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: 'http://localhost', 'sec-fetch-site': 'same-origin', 'x-real-ip': ip, 'user-agent': UA },
    body: JSON.stringify({ id, formato }),
  });

async function criar(m: Montado, cookie: string, corpo: Record<string, unknown>) {
  const r = await admin(m, cookie, { acao: 'criar', ...corpo });
  expect(r.status).toBe(200);
  const j = (await r.json()) as { link: LinkRelatorio; url: string };
  const k = j.url.split('#k=')[1];
  return { ...j, k };
}

describe('relatório do anunciante por link privado', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('criar no painel → o link aparece uma vez; a página recebe o relatório agregado com os 3 cabeçalhos; o arquivo guarda só o hash', async () => {
    const { m, cookie } = await novo({ env: { TRUST_PROXY: '1', PUBLIC_URL: 'https://sintonia2026.com.br' } });
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG, inicio: AGORA - 3_600_000, limiteImpressoes: 50_000 }) });
    for (let i = 0; i < 30; i++) await evento(m, 'lynx', i % 3 ? 'topo' : 'nativo', `198.51.100.${i}`);
    await m.app.request('/api/anuncio/ir/lynx?f=topo', { headers: { 'x-real-ip': '198.51.100.1', 'user-agent': UA } });
    const { link, url, k } = await criar(m, cookie, { id: 'lynx', rotulo: 'Lynx · campanha da noite' });
    expect(url).toMatch(/^https:\/\/sintonia2026\.com\.br\/relatorio#k=[A-Za-z0-9_-]{22}$/);
    expect(link).toMatchObject({ id: 'lynx', rotulo: 'Lynx · campanha da noite', criadoEm: AGORA, mostrarMeta: false, acessos: 0 });
    expect(link).not.toHaveProperty('h');
    const r = await pedir(m, k);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    const rel = (await r.json()) as RelatorioAnunciante;
    expect(rel).toMatchObject({ situacao: 'no-ar', inicio: AGORA - 3_600_000, fim: null, alcance: { noite: null } });
    // estimativa (HyperLogLog; o sal muda a cada processo): 30 pessoas, ± uma colisão
    expect(rel.alcance.campanha).toBeGreaterThanOrEqual(28);
    expect(rel.alcance.campanha).toBeLessThanOrEqual(30);
    expect(rel.anuncio).toMatchObject({ id: 'lynx', marca: 'Lynx', href: '' });
    expect(rel.anuncio.logo).toMatch(/^https:\/\/sintonia2026\.com\.br\/api\/anuncio\/img\?h=/);
    expect(rel).not.toHaveProperty('meta');
    expect(JSON.stringify(rel)).not.toContain('limiteImpressoes');
    expect(JSON.stringify(rel)).not.toContain('data:image');
    expect(totaisDoPeriodo(rel, 'campanha', AGORA)).toMatchObject({ impressoes: 30, cliques: 1, alcance: rel.alcance.campanha });
    // arquivo: só o hash, permissão 600
    await m.persistirMetricasAnuncios();
    const arq = join(m.stateDir, 'relatorios.json');
    const texto = readFileSync(arq, 'utf8');
    expect(texto).not.toContain(k);
    expect(texto).toContain(hashToken(k));
    expect(statSync(arq).mode & 0o777).toBe(0o600);
    // acessos: uma abertura por rede a cada 30 min
    await pedir(m, k);
    await pedir(m, k, '203.0.113.6');
    const lista = (await (await m.app.request('/api/admin/relatorios', { headers: { cookie } })).json()) as { links: LinkRelatorio[]; ligado: boolean };
    expect(lista.ligado).toBe(true);
    expect(lista.links).toEqual([{ ...link, acessos: 2, ultimoAcessoHora: Math.floor(AGORA / 3_600_000) * 3_600_000 }]);
  });

  it('token errado, malformado ou revogado → 404 "Link inválido ou revogado."; revogar vale na hora (mesmo com o cache de 30 s)', async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const { link, k } = await criar(m, cookie, { id: 'lynx' });
    expect((await pedir(m, k)).status).toBe(200);
    for (const ruim of ['A'.repeat(22), 'x', '', 123, null, `${k}x`]) {
      const r = await pedir(m, ruim);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ erro: 'Link inválido ou revogado.' });
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
    const rv = await admin(m, cookie, { acao: 'revogar', lid: link.lid });
    expect(rv.status).toBe(200);
    expect(((await rv.json()) as { link: LinkRelatorio }).link.revogadoEm).toBe(AGORA);
    expect((await pedir(m, k)).status).toBe(404);
    // outro site não lê
    expect((await pedir(m, k, '203.0.113.9', { origin: 'https://mal.com', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    // anúncio removido: o link deixa de valer — e é revogado (não volta se o id for recriado com outra marca)
    const novoLink = await criar(m, cookie, { id: 'lynx' });
    await comando(m, cookie, { tipo: 'anuncio-remover', id: 'lynx' });
    expect((await pedir(m, novoLink.k)).status).toBe(404);
    const lista = (await (await m.app.request('/api/admin/relatorios', { headers: { cookie } })).json()) as { links: LinkRelatorio[] };
    expect(lista.links.find((l) => l.lid === novoLink.link.lid)?.revogadoEm).toBe(m.relogio.t);
    m.relogio.t += 31_000;
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { marca: 'Outra Marca' }) });
    expect((await pedir(m, novoLink.k)).status).toBe(404);
  });

  it(`${PEDIDOS_RELATORIO_MIN} pedidos por minuto por rede; o 21º → 429`, async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const { k } = await criar(m, cookie, { id: 'lynx' });
    for (let i = 0; i < PEDIDOS_RELATORIO_MIN; i++) expect((await pedir(m, k, '203.0.113.30')).status).toBe(200);
    const r = await pedir(m, k, '203.0.113.30');
    expect(r.status).toBe(429);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect((await pedir(m, k, '203.0.113.31')).status).toBe(200);
    m.relogio.t += 61_000;
    expect((await pedir(m, k, '203.0.113.30')).status).toBe(200);
  });

  it('a meta só vem com "mostrar meta" ligado no link; meta atingida aparece na situação', async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { inicio: AGORA - 60_000, limiteImpressoes: 1000 }) });
    const sem = await criar(m, cookie, { id: 'lynx' });
    const com = await criar(m, cookie, { id: 'lynx', mostrarMeta: true });
    expect(((await (await pedir(m, sem.k)).json()) as RelatorioAnunciante).meta).toBeUndefined();
    expect(((await (await pedir(m, com.k)).json()) as RelatorioAnunciante).meta).toEqual({ limite: 1000, entregue: 0 });
    for (let i = 0; i < 1000; i++) await evento(m, 'lynx', 'topo', `10.2.${i >> 8}.${i & 255}`);
    m.verificarMetas();
    m.relogio.t += 31_000;
    const rel = (await (await pedir(m, com.k, '203.0.113.40')).json()) as RelatorioAnunciante;
    expect(rel.situacao).toBe('meta-atingida');
    expect(rel.meta).toEqual({ limite: 1000, entregue: 1000 });
  });

  it('limites: 5 links ativos por anúncio (o 6º → 409); id desconhecido → 404; comando inválido → 400', async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const links: LinkRelatorio[] = [];
    for (let i = 0; i < 5; i++) links.push((await criar(m, cookie, { id: 'lynx', rotulo: `Link ${i}` })).link);
    expect((await admin(m, cookie, { acao: 'criar', id: 'lynx' })).status).toBe(409);
    await admin(m, cookie, { acao: 'revogar', lid: links[0].lid });
    expect((await admin(m, cookie, { acao: 'criar', id: 'lynx' })).status).toBe(200);
    expect((await admin(m, cookie, { acao: 'criar', id: 'nao-existe' })).status).toBe(404);
    expect((await admin(m, cookie, { acao: 'criar', id: 'lynx', rotulo: 'x'.repeat(61) })).status).toBe(400);
    expect((await admin(m, cookie, { acao: 'apagar', lid: links[1].lid })).status).toBe(400);
    expect((await admin(m, cookie, { acao: 'revogar', lid: 'ffffffffffff' })).status).toBe(404);
    // sem sessão, nada
    expect((await m.app.request('/api/admin/relatorios')).status).toBe(401);
  });

  it('os links voltam depois de reiniciar (mesmo STATE_DIR)', async () => {
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const { k } = await criar(m, cookie, { id: 'lynx' });
    await m.persistirMetricasAnuncios();
    const outro = await novo({ stateDir: m.stateDir, estadoInicial: m.controller.state() });
    expect((await pedir(outro.m, k)).status).toBe(200);
  });

  it('RELATORIOS=0: a rota pública dá 404, criar dá 404 e o painel recebe ligado: false', async () => {
    vi.stubEnv('RELATORIOS', '0');
    const { m, cookie } = await novo();
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    expect((await admin(m, cookie, { acao: 'criar', id: 'lynx' })).status).toBe(404);
    expect((await pedir(m, 'A'.repeat(22))).status).toBe(404);
    expect(await (await m.app.request('/api/admin/relatorios', { headers: { cookie } })).json()).toEqual({ links: [], ligado: false });
  });

  it('robots.txt e a página /relatorio fora dos buscadores', async () => {
    expect(ROBOTS_TXT).toContain('Disallow: /relatorio');
    const { m } = await novo();
    const r = await m.app.request('/robots.txt');
    expect(await r.text()).toContain('Disallow: /relatorio');
  });
});
