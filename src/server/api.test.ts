/**
 * API pública ponta a ponta com o motor real: rotas, validação (400/404), cache (ETag/304, Cache-Control),
 * compressão e o fluxo de simulação comandado pelo admin.
 */
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PublicMeta } from '../shared/api';
import type { LiveStatus, MunicipioSnapshot, NationalSnapshot, SecaoDetalhe, UfSnapshot, ZonaSnapshot } from '../shared/types';
import { pctTotalizadas } from '../shared/calc';
import { comando, login, montar, type Montado } from './test-helpers';

let m: Montado;
const get = (path: string, headers: Record<string, string> = {}) => m.app.request(path, { headers });

beforeAll(async () => {
  m = await montar();
});

describe('rotas públicas', () => {
  it('GET /api/status: LiveStatus leve, s-maxage=1', async () => {
    const r = await get('/api/status');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=1');
    expect(r.headers.get('content-type')).toContain('application/json');
    const s = (await r.json()) as LiveStatus;
    expect(s.fonte).toBe('pre');
    expect(s.fase).toBe('pre');
    expect(s.simulacao).toBe(false);
    expect(s.races).toContain('pres');
    expect(s.races).toContain('pres-t1');
  });

  it('GET /api/meta: corridas e UFs, s-maxage=300, ETag estável', async () => {
    const r = await get('/api/meta');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
    const meta = (await r.json()) as PublicMeta;
    expect(meta.ufs).toHaveLength(28);
    expect(meta.races.find((x) => x.id === 'pres')?.candidatos).toHaveLength(2);
    const r2 = await get('/api/meta', { 'if-none-match': r.headers.get('etag')! });
    expect(r2.status).toBe(304);
  });

  it('1º turno (dataset): Brasil, UF e município batem com os totais oficiais', async () => {
    const r = await get('/api/apuracao/pres-t1/br');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('s-maxage=300');
    const n = (await r.json()) as NationalSnapshot;
    const tot = m.ds.meta.totaisPrimeiroTurno;
    expect(n.resumo.secoes).toBe(tot.secoes);
    expect(n.resumo.comparecimento).toBe(tot.comparecimento);
    expect(n.resumo.status).toBe('encerrada');
    expect(Object.keys(n.ufs)).toHaveLength(28);

    const u = (await (await get('/api/apuracao/pres-t1/uf/sp')).json()) as UfSnapshot;
    expect(u.uf).toBe('SP');
    expect(u.municipios.length).toBe(645);
    const soma = u.municipios.reduce((a, x) => a + x.votos[0], 0);
    expect(soma).toBe(u.resumo.votos[0]);

    const mun = (await (await get('/api/apuracao/pres-t1/uf/SP/mun/71072')).json()) as MunicipioSnapshot;
    expect(mun.nome).toBe('São Paulo');
    expect(mun.capital).toBe(true);
  });

  it('2º turno antes das 17h (fonte pre): tudo aguardando, 0 seções', async () => {
    const n = (await (await get('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    expect(n.race).toBe('pres');
    expect(n.resumo.secoesTotalizadas).toBe(0);
    expect(n.resumo.secoes).toBe(m.ds.meta.totaisPrimeiroTurno.secoes);
  });

  it('códigos de município aceitam zeros à esquerda omitidos (mesma resposta, mesmo ETag)', async () => {
    const a = await get('/api/apuracao/pres/uf/ac/mun/1066');
    const b = await get('/api/apuracao/pres/uf/ac/mun/01066');
    expect(a.status).toBe(200);
    expect(a.headers.get('etag')).toBe(b.headers.get('etag'));
    expect(((await a.json()) as MunicipioSnapshot).cod).toBe('01066');
  });

  it.each([
    ['/api/apuracao/xyz/br', 404, /Corrida desconhecida/],
    ['/api/apuracao/PRES!/br', 400, /Corrida inválida/],
    ['/api/apuracao/pres/uf/xx', 400, /UF inválida/],
    ['/api/apuracao/pres/uf/s', 400, /UF inválida/],
    ['/api/apuracao/gov-rj/uf/sp', 404, /não participa/],
    ['/api/apuracao/gov-rj/uf/zz', 404, /não participa/],
    ['/api/apuracao/pres/uf/sp/mun/abc', 400, /município inválido/],
    ['/api/apuracao/pres/uf/sp/mun/123456', 400, /município inválido/],
    ['/api/apuracao/pres/uf/sp/mun/99999', 404, /não encontrado/],
    ['/api/apuracao/pres/uf/sp/mun/71072/zona/0', 400, /Zona inválida/],
    ['/api/apuracao/pres/uf/sp/mun/71072/zona/x1', 400, /Zona inválida/],
    ['/api/apuracao/pres/uf/sp/mun/71072/zona/999', 404, /Zona 999 não existe/],
    ['/api/apuracao/pres/uf/sp/mun/71072/zona/1/secao/-3', 400, /Seção inválida/],
    ['/api/apuracao/pres/uf/sp/mun/71072/zona/1/secao/9999', 404, /Seção 9999 não existe/],
    ['/api/apuracao/pres-t1/uf/sp/mun/71072/zona/1', 404, /1º turno/],
    ['/api/apuracao/pres/br/extra', 404, /Rota da API inexistente/],
    ['/api/qualquer', 404, /Rota da API inexistente/],
  ])('%s → %i { erro }', async (path, status, re) => {
    const r = await get(path);
    expect(r.status).toBe(status);
    expect(r.headers.get('content-type')).toContain('application/json');
    const b = (await r.json()) as { erro: string };
    expect(b.erro).toMatch(re);
  });

  it('zona e seção existentes', async () => {
    const z = (await (await get('/api/apuracao/pres/uf/sp/mun/71072/zona/1')).json()) as ZonaSnapshot;
    expect(z.nomeMunicipio).toBe('São Paulo');
    expect(z.secoes.length).toBeGreaterThan(100);
    const n = z.secoes[0].secao;
    const r = await get(`/api/apuracao/pres/uf/sp/mun/71072/zona/1/secao/${n}`);
    expect(r.status).toBe(200);
    const s = (await r.json()) as SecaoDetalhe;
    expect(s.secao).toBe(n);
    expect(s.uf).toBe('SP');
  });
});

describe('cache HTTP', () => {
  it('ETag fraco por (versão, balde, rota) + 304 sem corpo', async () => {
    const r = await get('/api/apuracao/pres/br');
    const etag = r.headers.get('etag')!;
    expect(etag).toMatch(/^W\/"v\d+-pre-[a-z0-9]+"$/);
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=2, stale-while-revalidate=10');
    expect(r.headers.get('vary')).toBe('Accept-Encoding');
    const r304 = await get('/api/apuracao/pres/br', { 'if-none-match': etag });
    expect(r304.status).toBe(304);
    expect(await r304.text()).toBe('');
    expect(r304.headers.get('etag')).toBe(etag);
    // lista e forma forte também casam
    expect((await get('/api/apuracao/pres/br', { 'if-none-match': `"x", ${etag.slice(2)}` })).status).toBe(304);
    // outra rota → outro ETag
    const outra = await get('/api/apuracao/pres/uf/sp');
    expect(outra.headers.get('etag')).not.toBe(etag);
  });

  it('gzip e brotli conforme Accept-Encoding, mesmo conteúdo', async () => {
    const id = await get('/api/apuracao/pres-t1/uf/mg');
    const texto = await id.text();
    expect(id.headers.get('content-encoding')).toBeNull();
    const gz = await get('/api/apuracao/pres-t1/uf/mg', { 'accept-encoding': 'gzip, deflate' });
    expect(gz.headers.get('content-encoding')).toBe('gzip');
    const gzBuf = Buffer.from(await gz.arrayBuffer());
    const br = await get('/api/apuracao/pres-t1/uf/mg', { 'accept-encoding': 'gzip, deflate, br' });
    expect(br.headers.get('content-encoding')).toBe('br');
    const brBuf = Buffer.from(await br.arrayBuffer());
    const a = JSON.parse(texto);
    const b = JSON.parse(gunzipSync(gzBuf).toString());
    const c = JSON.parse(brotliDecompressSync(brBuf).toString());
    expect(b.resumo).toEqual(a.resumo);
    expect(c.municipios).toEqual(a.municipios);
    expect(gzBuf.length).toBeLessThan(texto.length / 3);
    expect(brBuf.length).toBeLessThan(gzBuf.length);
    // br;q=0 não é usado
    const semBr = await get('/api/apuracao/pres-t1/uf/mg', { 'accept-encoding': 'br;q=0, gzip' });
    expect(semBr.headers.get('content-encoding')).toBe('gzip');
  });

  it('respostas iguais no mesmo segundo vêm do cache da origem', async () => {
    const antes = m.respostas.tamanho;
    const [a, b] = await Promise.all([get('/api/apuracao/pres-t1/uf/ba'), get('/api/apuracao/pres-t1/uf/ba')]);
    expect(await a.text()).toBe(await b.text());
    expect(m.respostas.tamanho).toBe(antes + 1);
  });
});

describe('simulação comandada pelo admin', () => {
  it('iniciar → 20× → saltar para 50%: números, ETag e status acompanham', async () => {
    const cookie = await login(m);
    const e0 = (await get('/api/apuracao/pres/br')).headers.get('etag')!;

    expect((await comando(m, cookie, { tipo: 'velocidade', velocidade: 20 })).status).toBe(200);
    const r = await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    expect(r.status).toBe(200);
    const st = (await (await get('/api/status')).json()) as LiveStatus;
    expect(st.fonte).toBe('simulacao');
    expect(st.simulacao).toBe(true);
    expect(st.velocidade).toBe(20);
    // versão mudou → ETag antigo não casa mais
    expect((await get('/api/apuracao/pres/br', { 'if-none-match': e0 })).status).toBe(200);

    await comando(m, cookie, { tipo: 'saltar-pct', pct: 50 });
    const n = (await (await get('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    expect(pctTotalizadas(n.resumo)).toBeGreaterThanOrEqual(49.9);
    expect(pctTotalizadas(n.resumo)).toBeLessThan(51);
    expect(n.serie.length).toBeGreaterThan(10);
    expect(n.eventos.length).toBeGreaterThan(0);

    // relógio de parede anda 2 s → simNow anda 40 s (20×) → balde novo → outro ETag
    const e1 = (await get('/api/apuracao/pres/br')).headers.get('etag')!;
    m.relogio.t += 2000;
    const r2 = await get('/api/apuracao/pres/br', { 'if-none-match': e1 });
    expect(r2.status).toBe(200);
    const n2 = (await r2.json()) as NationalSnapshot;
    expect(n2.simNow - n.simNow).toBeGreaterThanOrEqual(39_000);
    expect(n2.resumo.secoesTotalizadas).toBeGreaterThanOrEqual(n.resumo.secoesTotalizadas);

    // pausado: o balde não muda → 304 mesmo com o relógio andando
    await comando(m, cookie, { tipo: 'relogio', acao: 'pausar' });
    const e2 = (await get('/api/apuracao/pres/br')).headers.get('etag')!;
    m.relogio.t += 5000;
    expect((await get('/api/apuracao/pres/br', { 'if-none-match': e2 })).status).toBe(304);

    // congelado: idem
    await comando(m, cookie, { tipo: 'relogio', acao: 'retomar' });
    await comando(m, cookie, { tipo: 'congelar', congelado: true });
    const e3 = (await get('/api/apuracao/pres/br')).headers.get('etag')!;
    expect(e3).toMatch(/-c\d+-/);
    m.relogio.t += 5000;
    expect((await get('/api/apuracao/pres/br', { 'if-none-match': e3 })).status).toBe(304);
    await comando(m, cookie, { tipo: 'congelar', congelado: false });
  });

  it('métricas do admin contam requisições, clientes e trazem o log', async () => {
    const cookie = await login(m);
    const r = await m.app.request('/api/admin/state', { headers: { cookie } });
    const s = (await r.json()) as { metrics: { requisicoesUltimoMinuto: number; clientesAtivosEstimados: number; log: { msg: string }[] } };
    expect(s.metrics.requisicoesUltimoMinuto).toBeGreaterThan(5);
    expect(s.metrics.clientesAtivosEstimados).toBeGreaterThanOrEqual(1);
    expect(s.metrics.log.some((l) => /Admin: comando "relogio"/.test(l.msg))).toBe(true);
    expect(s.metrics.log.some((l) => /motor: Modelo construído/.test(l.msg))).toBe(true);
  });
});
