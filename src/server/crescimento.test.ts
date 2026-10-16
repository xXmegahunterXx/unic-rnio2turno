import { describe, expect, it } from 'vitest';
import type { AudienciaAdmin, DivulgacaoPublica } from '../shared/audiencia';
import type { LeadsAdmin } from '../shared/leads';
import { CC_DIVULGACAO } from './crescimento';
import { login, montar, type Montado } from './test-helpers';

const UA_CEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const DO_SITE = { origin: 'http://localhost', 'sec-fetch-site': 'same-origin', 'user-agent': UA_CEL };

async function montarComLog() {
  const linhas: string[] = [];
  const m = await montar({ env: { TRUST_PROXY: '1', LOG_AMOSTRA: '1' }, escreverLog: (l) => linhas.push(l) });
  return { m, linhas };
}

const sinal = (m: Montado, corpo: unknown, headers: Record<string, string> = {}) =>
  m.app.request('/api/audiencia', { method: 'POST', headers: { ...DO_SITE, 'content-type': 'text/plain;charset=UTF-8', 'x-real-ip': '200.1.2.3', ...headers }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

const lead = (m: Montado, corpo: unknown, headers: Record<string, string> = {}) =>
  m.app.request('/api/anuncie/lead', { method: 'POST', headers: { ...DO_SITE, 'content-type': 'application/json', 'x-real-ip': '200.9.9.9', ...headers }, body: JSON.stringify(corpo) });

const PEDIDO = { nome: 'Ana Souza', empresa: 'Padaria Boa', email: 'ana@padaria.com.br', formatos: ['topo'], mensagem: 'Olá', consentimento: true, site: '', ms: 9000 };

describe('POST /api/audiencia', () => {
  it('conta a página do próprio site e diz o próximo intervalo; sem cache', async () => {
    const { m } = await montarComLog();
    const r = await sinal(m, { g: 'apuracao', o: 'twitch' });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ s: 60 });
    const d = m.crescimento.audiencia.paraAdmin().dias.at(-1)!;
    expect(d).toMatchObject({ paginas: 1, porGrupo: { apuracao: 1 }, origens: { twitch: 1 }, unicos: 1 });
  });

  it('outro site → 403; fora do navegador (sem Sec-Fetch-Site: same-origin) → aceito sem contar; tipo e tamanho', async () => {
    const { m } = await montarComLog();
    expect((await sinal(m, { g: 'inicio' }, { origin: 'https://golpe.example', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const fora = await m.app.request('/api/audiencia', { method: 'POST', headers: { 'user-agent': UA_CEL, 'content-type': 'text/plain' }, body: JSON.stringify({ g: 'inicio' }) });
    expect(fora.status).toBe(200);
    expect(m.crescimento.audiencia.paraAdmin().dias).toEqual([]);
    // curl com Origin forjado, sem Sec-Fetch-Site: aceito sem contar
    const forjado = await m.app.request('/api/audiencia', { method: 'POST', headers: { 'user-agent': UA_CEL, origin: 'http://localhost', 'content-type': 'text/plain' }, body: JSON.stringify({ g: 'inicio' }) });
    expect(forjado.status).toBe(200);
    expect(m.crescimento.audiencia.paraAdmin().dias).toEqual([]);
    expect((await sinal(m, 'não é json')).status).toBe(400);
    expect((await sinal(m, { g: 'xyz' })).status).toBe(400);
    expect((await sinal(m, { g: 'inicio' }, { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await sinal(m, { g: 'inicio', o: 'x'.repeat(600) })).status).toBe(413);
  });

  it('o log de acesso nunca leva IP, User-Agent, origem ou corpo', async () => {
    const { m, linhas } = await montarComLog();
    await sinal(m, { g: 'teste', o: 'exemplo.com.br' });
    const tudo = linhas.join('\n');
    expect(tudo).not.toContain('200.1.2.3');
    expect(tudo).not.toContain('iPhone');
    expect(tudo).not.toContain('exemplo.com.br');
  });
});

describe('GET /api/divulgacao e painel', () => {
  it('sem redes e com a audiência desligada (padrão): nada', async () => {
    const { m } = await montarComLog();
    const r = await m.app.request('/api/divulgacao');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC_DIVULGACAO);
    expect((await r.json()) as DivulgacaoPublica).toEqual({ redes: {}, audiencia: null });
    const etag = r.headers.get('etag')!;
    expect((await m.app.request('/api/divulgacao', { headers: { 'if-none-match': etag } })).status).toBe(304);
  });

  it('o painel configura as redes (só https da própria rede) e liga os números REAIS na /anuncie', async () => {
    const { m } = await montarComLog();
    const cookie = await login(m);
    const post = (corpo: unknown) =>
      m.app.request('/api/admin/divulgacao', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(corpo) });
    expect((await post({ redes: { x: 'http://x.com/s' } })).status).toBe(400);
    expect((await post({ redes: { instagram: 'https://golpe.com/ig' } })).status).toBe(400);
    expect((await post({ outra: 1 })).status).toBe(400);
    expect((await post({ redes: { x: 'https://x.com/sintonia', youtube: 'https://youtube.com/@sintonia' } })).status).toBe(200);

    await sinal(m, { g: 'inicio', o: 'direto' });
    m.crescimento.audiencia.amostrar();
    let pub = (await (await m.app.request('/api/divulgacao')).json()) as DivulgacaoPublica;
    expect(pub.redes).toEqual({ x: 'https://x.com/sintonia', youtube: 'https://youtube.com/@sintonia' });
    expect(pub.audiencia).toBeNull(); // interruptor desligado

    expect((await post({ mostrarAudiencia: true })).status).toBe(200);
    pub = (await (await m.app.request('/api/divulgacao')).json()) as DivulgacaoPublica;
    expect(pub.audiencia).toMatchObject({ paginas: 1, maiorDia: { unicos: 1 } });
    // pico: SÓ o sinal das páginas (1 aba) — o "pessoas agora" do servidor (o painel também conta: 2 clientes) fica fora
    expect(pub.audiencia?.pico?.valor).toBe(1);
    expect(Object.keys(pub.audiencia!).sort()).toEqual(['desde', 'maiorDia', 'paginas', 'pico']);
    expect(pub.redes.x).toBe('https://x.com/sintonia'); // mudar só o interruptor não apaga as redes

    const cfg = await (await m.app.request('/api/admin/divulgacao', { headers: { cookie } })).json();
    expect(cfg).toEqual({ redes: { x: 'https://x.com/sintonia', youtube: 'https://youtube.com/@sintonia' }, mostrarAudiencia: true });
  });

  it('admin da audiência exige sessão; zerar apaga', async () => {
    const { m } = await montarComLog();
    expect((await m.app.request('/api/admin/audiencia')).status).toBe(401);
    expect((await m.app.request('/api/admin/leads')).status).toBe(401);
    expect((await m.app.request('/api/admin/divulgacao')).status).toBe(401);
    const cookie = await login(m);
    await sinal(m, { g: 'inicio' });
    const a = (await (await m.app.request('/api/admin/audiencia', { headers: { cookie } })).json()) as AudienciaAdmin;
    expect(a.dias).toHaveLength(1);
    expect(a.horas).toHaveLength(48);
    const z = await m.app.request('/api/admin/audiencia', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ acao: 'zerar' }) });
    expect(((await z.json()) as AudienciaAdmin).dias).toEqual([]);
    // CSRF: POST de outro site é recusado pelo painel
    const csrf = await m.app.request('/api/admin/audiencia', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: 'https://golpe.example', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ acao: 'zerar' }),
    });
    expect(csrf.status).toBe(403);
  });
});

describe('POST /api/anuncie/lead e painel "Interessados"', () => {
  it('guarda, lista no painel, marca respondido e apaga; o log não leva o conteúdo', async () => {
    const { m, linhas } = await montarComLog();
    const r = await lead(m, PEDIDO);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const cookie = await login(m);
    const lista = (await (await m.app.request('/api/admin/leads', { headers: { cookie } })).json()) as LeadsAdmin;
    expect(lista.novos).toBe(1);
    expect(lista.leads[0]).toMatchObject({ nome: 'Ana Souza', email: 'ana@padaria.com.br', formatos: ['topo'] });
    const cmd = (corpo: unknown) => m.app.request('/api/admin/leads', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(corpo) });
    const id = lista.leads[0].id;
    expect(((await (await cmd({ acao: 'respondido', id, valor: true })).json()) as LeadsAdmin).novos).toBe(0);
    expect((await cmd({ acao: 'apagar', id: 'abcdef' })).status).toBe(404);
    expect((await cmd({ acao: 'xyz', id })).status).toBe(400);
    expect(((await (await cmd({ acao: 'apagar', id })).json()) as LeadsAdmin).leads).toEqual([]);
    const tudo = linhas.join('\n');
    expect(tudo).toContain('novo pedido de contato');
    expect(tudo).not.toContain('Ana Souza');
    expect(tudo).not.toContain('padaria');
    expect(tudo).not.toContain('200.9.9.9');
  });

  it('erros com o campo; outro site / sem Origin → 403; 415; 429 com Retry-After; isca → ok sem guardar', async () => {
    const { m } = await montarComLog();
    const e = await lead(m, { ...PEDIDO, email: 'x' });
    expect(e.status).toBe(422);
    expect(await e.json()).toMatchObject({ ok: false, campo: 'email' });
    expect((await lead(m, PEDIDO, { origin: 'https://golpe.example', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const semOrigem = await m.app.request('/api/anuncie/lead', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA_CEL }, body: JSON.stringify(PEDIDO) });
    expect(semOrigem.status).toBe(403);
    expect((await lead(m, PEDIDO, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await lead(m, { ...PEDIDO, site: 'http://spam.example' })).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await lead(m, { ...PEDIDO, mensagem: `Pedido ${i}` })).status).toBe(200);
    const lim = await lead(m, { ...PEDIDO, mensagem: 'Pedido 4' });
    expect(lim.status).toBe(429);
    expect(Number(lim.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(m.crescimento.leads.paraAdmin().leads).toHaveLength(3);
  });
});

describe('formulário "Quero anunciar" em produção: abre só com e-mail de privacidade configurado', () => {
  it('sem contatos → 503 "abre em breve" (nada guardado); com o e-mail de privacidade no painel → aceito', async () => {
    const m = await montar({ env: { NODE_ENV: 'production', PUBLIC_URL: 'http://localhost', TRUST_PROXY: '1' } });
    const fechado = await lead(m, PEDIDO);
    expect(fechado.status).toBe(503);
    expect(await fechado.json()).toMatchObject({ ok: false, erro: 'O formulário abre em breve.' });
    expect(m.crescimento.leads.paraAdmin().leads).toHaveLength(0);
    const cookie = await login(m);
    const cmd = (contatos: unknown) =>
      m.app.request('/api/admin/command', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ tipo: 'contatos', contatos }) });
    // só o geral não abre (o canal do art. 18 é o de privacidade)
    expect((await cmd({ geral: 'contato@sintonia2026.com.br' })).status).toBe(200);
    expect((await lead(m, PEDIDO)).status).toBe(503);
    // endereço reservado (.example) é recusado pelo servidor
    expect((await cmd({ privacidade: 'privacidade@sintonia.example' })).status).toBe(400);
    expect((await cmd({ geral: 'contato@sintonia2026.com.br', privacidade: 'privacidade@sintonia2026.com.br' })).status).toBe(200);
    expect((await lead(m, PEDIDO)).status).toBe(200);
    expect(m.crescimento.leads.paraAdmin().leads).toHaveLength(1);
  });
});

describe('"pessoas agora" público (conferência final)', () => {
  it('usa a presença pelo sinal das páginas (atravessa a CDN): 30 redes com a página aberta → ~30 no /api/status', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    for (let i = 0; i < 30; i++) await sinal(m, { p: 1, g: 'apuracao' }, { 'x-real-ip': `200.10.${i}.7` });
    m.crescimento.audiencia.amostrar();
    m.relogio.t += 1500; // o corpo do status é montado no máximo 1×/s
    const s = (await (await m.app.request('/api/status')).json()) as { pessoasAgora: number };
    expect(s.pessoasAgora).toBeGreaterThanOrEqual(30);
  });
});
