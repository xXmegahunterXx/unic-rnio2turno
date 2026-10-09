/**
 * Admin: login, sessão (cookie HMAC), ataques (senha errada, sem cookie, cookie adulterado/expirado/de outro
 * segredo, força bruta), validação dos comandos (zod), persistência do estado e modo produção sem senha.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { AdminState, PresetInfo } from '../shared/types';
import { createController } from '../engine/controller';
import { COOKIE_SESSAO, LimiteTaxa, Sessoes, senhaConfere } from './auth';
import { SENHA, comando, datasetReal, login, montar, type Montado } from './test-helpers';

const post = (m: Montado, path: string, body: unknown, headers: Record<string, string> = {}) =>
  m.app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

let m: Montado;
beforeAll(async () => {
  m = await montar();
});

describe('login e sessão', () => {
  it('senha correta → cookie httpOnly, SameSite=Strict, Path=/api/admin, 12 h', async () => {
    const r = await post(m, '/api/admin/login', { senha: SENHA });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const sc = r.headers.get('set-cookie')!;
    expect(sc).toMatch(new RegExp(`^${COOKIE_SESSAO}=v1\\.`));
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('SameSite=Strict');
    expect(sc).toContain('Path=/api/admin');
    expect(sc).toContain('Max-Age=43200');
    expect(sc).not.toContain('Secure'); // dev/teste: http
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('senha errada → 401 sem cookie; corpo inválido → 400/415', async () => {
    const r = await post(m, '/api/admin/login', { senha: 'errada' });
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(((await r.json()) as { erro: string }).erro).toMatch(/Senha incorreta/);
    expect((await post(m, '/api/admin/login', { senha: '' })).status).toBe(400);
    expect((await post(m, '/api/admin/login', { senha: SENHA, extra: 1 })).status).toBe(400);
    expect((await post(m, '/api/admin/login', '{"senha":')).status).toBe(400);
    const form = await m.app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `senha=${SENHA}`,
    });
    expect(form.status).toBe(415); // CSRF por formulário não passa
  });

  it('rotas protegidas: sem cookie, cookie adulterado, de outro segredo ou expirado → 401', async () => {
    const cookie = await login(m);
    expect((await m.app.request('/api/admin/state', { headers: { cookie } })).status).toBe(200);
    expect((await m.app.request('/api/admin/state')).status).toBe(401);

    const token = cookie.split('=')[1];
    const [v, exp, nonce, sig] = token.split('.');
    // assinatura adulterada
    const sig2 = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect((await m.app.request('/api/admin/state', { headers: { cookie: `${COOKIE_SESSAO}=${v}.${exp}.${nonce}.${sig2}` } })).status).toBe(401);
    // expiração estendida sem reassinar
    const exp2 = String(Number(exp) + 86_400_000);
    expect((await m.app.request('/api/admin/state', { headers: { cookie: `${COOKIE_SESSAO}=${v}.${exp2}.${nonce}.${sig}` } })).status).toBe(401);
    // assinado com outro segredo
    const corpo = `v1.${exp}.${nonce}`;
    const falsa = createHmac('sha256', 'outro-segredo-qualquer-32-caracteres').update(corpo).digest('base64url');
    expect((await m.app.request('/api/admin/state', { headers: { cookie: `${COOKIE_SESSAO}=${corpo}.${falsa}` } })).status).toBe(401);
    // lixo
    for (const lixo of ['x', 'v1.1.2.3', 'v1..', `${'a'.repeat(300)}`]) {
      expect((await m.app.request('/api/admin/state', { headers: { cookie: `${COOKIE_SESSAO}=${lixo}` } })).status).toBe(401);
    }
    // comandos também exigem sessão
    expect((await post(m, '/api/admin/command', { tipo: 'fonte', fonte: 'simulacao' })).status).toBe(401);
    expect(m.controller.state().fonte).toBe('pre');
  });

  it('expira em 12 h e logout revoga a sessão antes disso', async () => {
    const cookie = await login(m);
    m.relogio.t += 11 * 3600_000;
    expect((await m.app.request('/api/admin/presets', { headers: { cookie } })).status).toBe(200);
    m.relogio.t += 3600_000 + 1000;
    expect((await m.app.request('/api/admin/presets', { headers: { cookie } })).status).toBe(401);

    const c2 = await login(m);
    expect((await m.app.request('/api/admin/presets', { headers: { cookie: c2 } })).status).toBe(200);
    const out = await post(m, '/api/admin/logout', {}, { cookie: c2 });
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await m.app.request('/api/admin/presets', { headers: { cookie: c2 } })).status).toBe(401);
  });

  it('força bruta: 10 tentativas por minuto por cliente → 429 com Retry-After', async () => {
    const m2 = await montar();
    const codigos: number[] = [];
    for (let i = 0; i < 12; i++) codigos.push((await post(m2, '/api/admin/login', { senha: `chute-${i}` })).status);
    expect(codigos.slice(0, 10).every((c) => c === 401)).toBe(true);
    const bloqueada = await post(m2, '/api/admin/login', { senha: SENHA });
    expect(bloqueada.status).toBe(429); // nem a senha certa passa durante o bloqueio
    expect(Number(bloqueada.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(codigos[10]).toBe(429);
    m2.relogio.t += 61_000;
    expect((await post(m2, '/api/admin/login', { senha: SENHA })).status).toBe(200);
  });
});

describe('comandos', () => {
  it.each([
    [{ tipo: 'inexistente' }, /tipo/],
    [{ tipo: 'velocidade', velocidade: -1 }, /velocidade/],
    [{ tipo: 'velocidade', velocidade: '20' }, /velocidade/],
    [{ tipo: 'velocidade', velocidade: 20, extra: true }, /extra|Unrecognized/i],
    [{ tipo: 'relogio', acao: 'explodir' }, /acao/],
    [{ tipo: 'saltar-pct', pct: 101 }, /pct/],
    [{ tipo: 'fonte', fonte: 'globo' }, /fonte/],
    [{ tipo: 'aviso', aviso: { nivel: 'info', texto: '' } }, /texto/],
    [{ tipo: 'aviso', aviso: { nivel: 'info', texto: 'x'.repeat(281) } }, /280/],
    [{ tipo: 'cenario', cenario: { alvoPres: 150 } }, /alvoPres/],
    [{ tipo: 'cenario', cenario: { ufVies: { XX: 3 } } }, /ufVies/],
    [{ tipo: 'cenario', cenario: { ritmo: 'turbo' } }, /ritmo/],
    [{ tipo: 'tse', tse: { baseUrl: 'javascript:alert(1)' } }, /baseUrl/],
    [{ tipo: 'tse', tse: { intervaloSeg: 1 } }, /intervaloSeg/],
    [[], /Comando inválido/],
  ])('rejeita %j com 400', async (cmd, re) => {
    const cookie = await login(m);
    const v0 = m.controller.state().versao;
    const r = await comando(m, cookie, cmd);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toMatch(re);
    expect(m.controller.state().versao).toBe(v0);
  });

  it('preset inexistente (validado pelo motor) → 400', async () => {
    const cookie = await login(m);
    const r = await comando(m, cookie, { tipo: 'preset', preset: 'nao-existe' });
    expect(r.status).toBe(400);
  });

  it('corpo grande demais → 413', async () => {
    const cookie = await login(m);
    const r = await comando(m, cookie, { tipo: 'aviso', aviso: { nivel: 'info', texto: 'x'.repeat(70_000) } });
    expect(r.status).toBe(413);
  });

  it('aplica comandos válidos, devolve AdminSnapshot e persiste o estado (escrita atômica)', async () => {
    const cookie = await login(m);
    const presets = (await (await m.app.request('/api/admin/presets', { headers: { cookie } })).json()) as PresetInfo[];
    expect(presets.length).toBeGreaterThanOrEqual(8);

    let r = await comando(m, cookie, { tipo: 'aviso', aviso: { nivel: 'alerta', texto: 'Instabilidade no TSE' } });
    expect(r.status).toBe(200);
    const snap = (await r.json()) as AdminSnapshot;
    expect(snap.state.aviso).toEqual({ nivel: 'alerta', texto: 'Instabilidade no TSE' });
    expect(snap.status.aviso?.texto).toBe('Instabilidade no TSE');
    expect(snap.marcos.length).toBeGreaterThan(0);
    expect(typeof snap.metrics.uptimeSeg).toBe('number');

    r = await comando(m, cookie, { tipo: 'cenario', cenario: { alvoPres: 52.5, ufVies: { BA: 3, sp: null } } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as AdminSnapshot).state.cenario.alvoPres).toBe(52.5);
    r = await comando(m, cookie, { tipo: 'tse', tse: { intervaloSeg: 20 } });
    expect(((await r.json()) as AdminSnapshot).state.tse.intervaloSeg).toBe(20);

    await m.store.flush();
    const salvo = JSON.parse(readFileSync(m.store.caminho, 'utf8')) as AdminState;
    expect(salvo.versao).toBe(m.controller.state().versao);
    expect(salvo.aviso?.texto).toBe('Instabilidade no TSE');
    expect(salvo.cenario.alvoPres).toBe(52.5);

    // restauração: um controller novo com o estado salvo fica igual
    const c2 = createController(await datasetReal(), { modo: 'servidor', initialState: salvo, now: () => m.relogio.t });
    expect(c2.state()).toEqual(m.controller.state());
  }, 30_000);
});

describe('produção', () => {
  it('sem ADMIN_PASSWORD o admin fica desabilitado (503), a API pública segue', async () => {
    const p = await montar({ env: { NODE_ENV: 'production', ADMIN_PASSWORD: undefined, SERVE_STATIC: '0' } });
    expect(p.config.adminPassword).toBeNull();
    expect((await post(p, '/api/admin/login', { senha: 'sintonia' })).status).toBe(503);
    expect((await p.app.request('/api/admin/state')).status).toBe(503);
    expect((await p.app.request('/api/status')).status).toBe(200);
    expect((await p.app.request('/api/status')).headers.get('strict-transport-security')).toMatch(/max-age=/);
  });

  it('com ADMIN_PASSWORD: cookie Secure', async () => {
    const p = await montar({ env: { NODE_ENV: 'production', SERVE_STATIC: '0' } });
    const r = await post(p, '/api/admin/login', { senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('Secure');
  });
});

describe('primitivas de autenticação', () => {
  it('senhaConfere: tempo constante, rejeita tipos estranhos', () => {
    expect(senhaConfere('abc', 'abc')).toBe(true);
    expect(senhaConfere('abd', 'abc')).toBe(false);
    expect(senhaConfere('abcd', 'abc')).toBe(false);
    expect(senhaConfere(undefined, 'abc')).toBe(false);
    expect(senhaConfere({ toString: () => 'abc' }, 'abc')).toBe(false);
    expect(senhaConfere('x'.repeat(2000), 'abc')).toBe(false);
  });

  it('Sessoes: token de um segredo não vale em outro', () => {
    const a = new Sessoes(Buffer.from('a'.repeat(32)));
    const b = new Sessoes(Buffer.from('b'.repeat(32)));
    const { token } = a.criar();
    expect(a.validar(token)).toBe(true);
    expect(b.validar(token)).toBe(false);
  });

  it('LimiteTaxa: janela deslizante', () => {
    let t = 0;
    const l = new LimiteTaxa(3, 1000, () => t);
    expect([l.tentar('x'), l.tentar('x'), l.tentar('x')]).toEqual([0, 0, 0]);
    expect(l.tentar('x')).toBeGreaterThan(0);
    expect(l.tentar('y')).toBe(0);
    t = 1001;
    expect(l.tentar('x')).toBe(0);
  });
});
