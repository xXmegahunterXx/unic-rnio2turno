/**
 * Produção: troca automática 'pre' → 'tse' (TSE_AUTO/TSE_INICIO e comandos do admin), trava da simulação
 * (ALLOW_SIMULACAO), CSRF, IP real atrás de proxy, sessão ligada à senha, limites de URL/corpo, arquivos ocultos,
 * Host forjado, CSP, limite de imagens OG por cliente, request id/versão, /readyz, logs em JSON, sitemap e robots.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { AdminState } from '../shared/types';
import { INICIO_APURACAO, UFS_GOV_2T } from '../shared/constants';
import { UFS } from '../shared/types';
import { cspPagina, rotasSitemap, tseTudoEncerrado } from './app';
import { loadConfig } from './config';
import { createLogger, type Nivel } from './log';
import { injetarMeta } from './meta-tags';
import { AVISO_AGUARDANDO_TSE, ESPERAS_MS } from './troca-auto';
import { SENHA, comando, login, montar, type Montado } from './test-helpers';

const PROD = { NODE_ENV: 'production', SERVE_STATIC: '0', DATA_DIR: 'public/data' };
const post = (m: Montado, path: string, body: unknown, headers: Record<string, string> = {}) =>
  m.app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const estado = async (m: Montado, cookie: string) => (await (await m.app.request('/api/admin/state', { headers: { cookie } })).json()) as AdminSnapshot;
const statusPublico = async (m: Montado) => (await (await m.app.request('/api/status')).json()) as { fonte: string; aviso: { texto: string } | null };

describe('config', () => {
  it('padrões de produção e de dev', () => {
    const p = loadConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: 'x'.repeat(20) }, '/tmp');
    expect(p.tseAuto).toBe(true);
    expect(p.tseInicio).toBe(INICIO_APURACAO);
    expect(p.permitirSimulacao).toBe(false);
    expect(p.logFormato).toBe('json');
    expect(p.logAmostra).toBe(0.01);
    expect(p.sessaoMs).toBe(12 * 3600_000);
    expect(p.avisos.some((a) => /PUBLIC_URL ausente/.test(a))).toBe(true);
    const d = loadConfig({}, '/tmp');
    expect(d.tseAuto).toBe(false);
    expect(d.permitirSimulacao).toBe(true);
    expect(d.logFormato).toBe('texto');
  });

  it('TSE_INICIO, TSE_AUTO, ALLOW_SIMULACAO, SIM_AUTOSTART e números inválidos', () => {
    const c = loadConfig({ NODE_ENV: 'production', TSE_INICIO: '2026-10-12T14:00:00-03:00', TSE_AUTO: '0', SIM_AUTOSTART: '1', LOG_AMOSTRA: '2' }, '/tmp');
    expect(c.tseInicio).toBe(Date.UTC(2026, 9, 12, 17, 0, 0));
    expect(c.tseAuto).toBe(false);
    expect(c.simAutostart).toBe('nao'); // produção sem ALLOW_SIMULACAO
    expect(c.avisos.some((a) => /SIM_AUTOSTART ignorado/.test(a))).toBe(true);
    expect(c.logAmostra).toBe(0.01);
    expect(c.avisos.some((a) => /LOG_AMOSTRA inválido/.test(a))).toBe(true);
    const s = loadConfig({ NODE_ENV: 'production', ALLOW_SIMULACAO: '1', SIM_AUTOSTART: 'force', TSE_INICIO: 'amanhã' }, '/tmp');
    expect(s.permitirSimulacao).toBe(true);
    expect(s.simAutostart).toBe('force');
    expect(s.tseInicio).toBe(INICIO_APURACAO);
    expect(s.avisos.some((a) => /TSE_INICIO inválido/.test(a))).toBe(true);
  });

  it('versão do build: SINTONIA_COMMIT (imagem Docker) e data', () => {
    const c = loadConfig({ SINTONIA_COMMIT: 'ABCDEF0123456789abcdef', SINTONIA_BUILD_DATE: '2026-10-12T12:00:00Z' }, '/tmp');
    expect(c.build.commit).toBe('abcdef012345');
    expect(c.build.data).toBe('2026-10-12T12:00:00.000Z');
    expect(loadConfig({}, '/tmp').build.commit).toBe('dev');
  });
});

describe('troca automática pre → tse', () => {
  const INI = Date.UTC(2026, 9, 12, 17, 0, 0); // ensaio: 12/10 14:00 de Brasília
  const montarTroca = async (feed: { ok: boolean }, env: Record<string, string> = {}) => {
    const chamadas: number[] = [];
    const m = await montar({
      env: { ...PROD, ADMIN_PASSWORD: SENHA, TSE_INICIO: new Date(INI).toISOString(), ...env },
      agora: INI - 60_000,
      verificarTse: async () => {
        chamadas.push(m.relogio.t);
        return feed.ok ? { ok: true, detalhe: 'Feed ok (teste)' } : { ok: false, detalhe: 'HTTP 503 (teste)' };
      },
    });
    return { m, chamadas };
  };

  it('antes do horário nada muda; no horário, feed ok → fonte tse e log', async () => {
    const { m, chamadas } = await montarTroca({ ok: true });
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('pre');
    expect(m.agendador.info().estado).toBe('agendada');
    expect(chamadas).toHaveLength(0);
    m.relogio.t = INI;
    await m.agendador.tick();
    expect(chamadas).toHaveLength(1);
    const st = m.controller.state();
    expect(st.fonte).toBe('tse');
    expect(st.trocaAuto?.feitaEm).toBe(INI);
    expect(m.agendador.info().estado).toBe('feita');
    expect(m.log.recentes(50).some((l) => /Troca automática para o TSE: FEITA na tentativa 1/.test(l.msg))).toBe(true);
    // depois de feita, voltar para 'pre' à mão não dispara de novo
    const cookie = await login(m);
    await comando(m, cookie, { tipo: 'fonte', fonte: 'pre' });
    m.relogio.t += 60_000;
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('pre');
    expect(chamadas).toHaveLength(1);
    await m.tse.encerrar();
  });

  it('feed sem resposta: continua pre, aviso público discreto e novas tentativas com espera crescente', async () => {
    const feed = { ok: false };
    const { m, chamadas } = await montarTroca(feed);
    m.relogio.t = INI;
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('pre');
    const i = m.agendador.info();
    expect(i.estado).toBe('aguardando-tse');
    expect(i.ultimoErro).toContain('HTTP 503');
    expect(i.proximaTentativa! - INI).toBeGreaterThanOrEqual(ESPERAS_MS[0]);
    const s = await statusPublico(m);
    expect(s.fonte).toBe('pre');
    expect(s.aviso?.texto).toBe(AVISO_AGUARDANDO_TSE);
    // antes da espera: não tenta de novo
    m.relogio.t = INI + 5_000;
    await m.agendador.tick();
    expect(chamadas).toHaveLength(1);
    // depois da espera: 2ª tentativa (espera seguinte maior)
    m.relogio.t = i.proximaTentativa!;
    await m.agendador.tick();
    expect(chamadas).toHaveLength(2);
    expect(m.agendador.info().proximaTentativa! - m.relogio.t).toBeGreaterThanOrEqual(ESPERAS_MS[1]);
    // o aviso do admin tem prioridade sobre o automático
    const cookie = await login(m);
    await comando(m, cookie, { tipo: 'aviso', aviso: { nivel: 'alerta', texto: 'Aviso do admin' } });
    expect((await statusPublico(m)).aviso?.texto).toBe('Aviso do admin');
    await comando(m, cookie, { tipo: 'aviso', aviso: null });
    // TSE volta: troca e o aviso automático some
    feed.ok = true;
    m.relogio.t = m.agendador.info().proximaTentativa!;
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('tse');
    expect((await statusPublico(m)).aviso).toBeNull();
    expect(m.log.recentes(80).filter((l) => /tentativa \d falhou/.test(l.msg))).toHaveLength(2);
    await m.tse.encerrar();
  });

  it('admin: desligar, adiar, voltar ao padrão, tentar agora; "executar" nunca entra pela HTTP', async () => {
    const { m } = await montarTroca({ ok: true });
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'troca-auto', acao: 'executar' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'troca-auto', acao: 'concluir' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'troca-auto', acao: 'adiar' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'troca-auto', acao: 'ligar', para: 1 })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'troca-auto', acao: 'adiar', para: 12 })).status).toBe(400);

    let r = await comando(m, cookie, { tipo: 'troca-auto', acao: 'desligar' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as AdminSnapshot).servidor?.trocaAuto.estado).toBe('desligada');
    m.relogio.t = INI + 1000;
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('pre');

    r = await comando(m, cookie, { tipo: 'troca-auto', acao: 'adiar', para: INI + 3600_000 });
    expect(r.status).toBe(200);
    expect(m.controller.state().trocaAuto).toEqual({ ligada: false, adiadaPara: INI + 3600_000, feitaEm: null });
    await comando(m, cookie, { tipo: 'troca-auto', acao: 'ligar' });
    const info = (await estado(m, cookie)).servidor!.trocaAuto;
    expect(info).toMatchObject({ habilitada: true, ligada: true, estado: 'agendada', inicio: INI + 3600_000, inicioPadrao: INI, adiada: true });
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('pre');

    await comando(m, cookie, { tipo: 'troca-auto', acao: 'adiar', para: null });
    expect((await estado(m, cookie)).servidor!.trocaAuto.inicio).toBe(INI);

    await comando(m, cookie, { tipo: 'troca-auto', acao: 'desligar' });
    r = await comando(m, cookie, { tipo: 'troca-auto', acao: 'agora' });
    expect(r.status).toBe(200);
    await m.agendador.tick();
    expect(m.controller.state().fonte).toBe('tse');
    await m.tse.encerrar();
  });

  it('no horário: fonte já tse → concluída; simulação → não aplicável (nada muda)', async () => {
    const a = await montarTroca({ ok: true }, { ALLOW_SIMULACAO: '1' });
    const cookie = await login(a.m);
    await comando(a.m, cookie, { tipo: 'fonte', fonte: 'tse' });
    a.m.relogio.t = INI;
    await a.m.agendador.tick();
    expect(a.m.controller.state().trocaAuto?.feitaEm).toBe(INI);
    expect(a.chamadas).toHaveLength(0);
    await a.m.tse.encerrar();

    const b = await montarTroca({ ok: true }, { ALLOW_SIMULACAO: '1' });
    const ck = await login(b.m);
    await comando(b.m, ck, { tipo: 'fonte', fonte: 'simulacao' });
    b.m.relogio.t = INI;
    await b.m.agendador.tick();
    expect(b.m.controller.state().fonte).toBe('simulacao');
    expect(b.m.agendador.info().estado).toBe('nao-aplicavel');
    expect(b.m.log.recentes(50).some((l) => /no horário a fonte é "simulacao"/.test(l.msg))).toBe(true);
  });

  it('troca feita num ensaio ANTES do horário em vigor não impede a troca no horário (sem "rearmar")', async () => {
    // ensaio em 07/10 (TSE_INICIO), depois o horário voltou ao da noite: o estado salvo ainda tem feitaEm do ensaio
    const ensaio = INI - 5 * 86_400_000;
    const chamadas: number[] = [];
    const m = await montar({
      env: { ...PROD, ADMIN_PASSWORD: SENHA, TSE_INICIO: new Date(INI).toISOString() },
      agora: INI - 60_000,
      estadoInicial: { trocaAuto: { ligada: true, adiadaPara: null, feitaEm: ensaio } } as unknown as AdminState,
      verificarTse: async () => {
        chamadas.push(m.relogio.t);
        return { ok: true, detalhe: 'Feed ok (teste)' };
      },
    });
    expect(m.controller.state().trocaAuto?.feitaEm).toBe(ensaio);
    expect(m.agendador.info()).toMatchObject({ estado: 'agendada', feitaEm: null });
    m.relogio.t = INI;
    await m.agendador.tick();
    expect(chamadas).toHaveLength(1);
    expect(m.controller.state().fonte).toBe('tse');
    expect(m.controller.state().trocaAuto?.feitaEm).toBe(INI);
    expect(m.agendador.info().estado).toBe('feita');
    await m.tse.encerrar();
  });

  it('TSE_AUTO=0: só mostra (desabilitada)', async () => {
    const { m, chamadas } = await montarTroca({ ok: true }, { TSE_AUTO: '0' });
    m.relogio.t = INI + 1;
    await m.agendador.tick();
    expect(chamadas).toHaveLength(0);
    expect(m.controller.state().fonte).toBe('pre');
    expect(m.agendador.info().estado).toBe('desabilitada');
  });

  it('estado salvo: trocaAuto inválida volta ao padrão; válida sobrevive', async () => {
    const m = await montar({ estadoInicial: { trocaAuto: { ligada: 'x', adiadaPara: -5, feitaEm: 'ontem' } } as unknown as AdminState });
    expect(m.controller.state().trocaAuto).toEqual({ ligada: true, adiadaPara: null, feitaEm: null });
    const v = await montar({ estadoInicial: { trocaAuto: { ligada: false, adiadaPara: INI, feitaEm: null } } as unknown as AdminState });
    expect(v.controller.state().trocaAuto).toEqual({ ligada: false, adiadaPara: INI, feitaEm: null });
  });
});

describe('fonte TSE: fase pública "encerrada" quando o TSE conclui as disputas', () => {
  const turno = (r: string) => (r.endsWith('-t1') ? 1 : 2);
  const c = (race: string, status: string | null, secoesTotalizadas = 10) => ({ race, status, secoesTotalizadas }) as never;
  it('Presidente encerrada e nenhuma disputa do 2º turno apurando → encerrada; senão não', () => {
    expect(tseTudoEncerrado(null, turno)).toBe(false);
    expect(tseTudoEncerrado({ corridas: [c('pres', 'apurando'), c('gov-am', 'encerrada')] }, turno)).toBe(false);
    expect(tseTudoEncerrado({ corridas: [c('pres', 'encerrada'), c('gov-am', 'apurando')] }, turno)).toBe(false);
    expect(tseTudoEncerrado({ corridas: [c('pres', 'encerrada'), c('gov-am', 'encerrada'), c('pres-t1', 'apurando')] }, turno)).toBe(true);
    // disputa sem arquivo publicado (ex.: TO com 404) não segura o "encerrada"
    expect(tseTudoEncerrado({ corridas: [c('pres', 'encerrada'), c('gov-to', 'aguardando', 0), c('gov-am', null, 0)] }, turno)).toBe(true);
    expect(tseTudoEncerrado({ corridas: [c('gov-am', 'encerrada')] }, turno)).toBe(false);
  });
});

describe('simulação bloqueada em produção (sem ALLOW_SIMULACAO)', () => {
  it('fonte simulacao e "iniciar" a partir de pre → 403 com o motivo; admin mostra o bloqueio', async () => {
    const m = await montar({ env: PROD });
    const cookie = await login(m);
    const r = await comando(m, cookie, { tipo: 'fonte', fonte: 'simulacao' });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/ALLOW_SIMULACAO=1/);
    expect((await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' })).status).toBe(403);
    expect(m.controller.state().fonte).toBe('pre');
    // comandos que só preparam a simulação continuam valendo (não vão ao ar)
    expect((await comando(m, cookie, { tipo: 'velocidade', velocidade: 60 })).status).toBe(200);
    expect((await comando(m, cookie, { tipo: 'fonte', fonte: 'tse' })).status).toBe(200);
    const s = await estado(m, cookie);
    expect(s.servidor?.simulacao).toEqual({ permitida: false, motivo: expect.stringMatching(/ALLOW_SIMULACAO/) });
    expect(s.servidor?.producao).toBe(true);
    await m.tse.encerrar();
  });

  it('estado salvo em simulação volta para pre na subida; com ALLOW_SIMULACAO=1 fica', async () => {
    const salvo = { fonte: 'simulacao', versao: 7 } as unknown as AdminState;
    const m = await montar({ env: PROD, estadoInicial: salvo });
    expect(m.controller.state().fonte).toBe('pre');
    expect(m.log.recentes(50).some((l) => /fonte "simulacao" trocada por "pre"/.test(l.msg))).toBe(true);
    const ok = await montar({ env: { ...PROD, ALLOW_SIMULACAO: '1' }, estadoInicial: salvo });
    expect(ok.controller.state().fonte).toBe('simulacao');
    const cookie = await login(ok);
    expect((await estado(ok, cookie)).servidor?.simulacao.permitida).toBe(true);
  });

  it('em dev a simulação é sempre permitida', async () => {
    const m = await montar();
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'fonte', fonte: 'simulacao' })).status).toBe(200);
  });
});

describe('segurança', () => {
  it('CSRF: POST do admin de outro site → 403; mesma origem, PUBLIC_URL e cliente sem Origin → passam', async () => {
    const m = await montar({ env: { ...PROD, PUBLIC_URL: 'https://sintonia.exemplo.br' } });
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { origin: 'https://malicioso.exemplo' })).status).toBe(403);
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { origin: 'null' })).status).toBe(403);
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { referer: 'https://malicioso.exemplo/x' })).status).toBe(403);
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { 'sec-fetch-site': 'same-site' })).status).toBe(403);
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { origin: 'https://sintonia.exemplo.br', 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { origin: 'http://localhost', host: 'localhost' })).status).toBe(200);
    expect((await post(m, '/api/admin/login', { senha: SENHA })).status).toBe(200); // curl
    // produção: localhost de outra porta não passa (em dev passa, por causa do proxy do Vite)
    expect((await post(m, '/api/admin/login', { senha: SENHA }, { origin: 'http://localhost:5173' })).status).toBe(403);
    const dev = await montar();
    expect((await post(dev, '/api/admin/login', { senha: SENHA }, { origin: 'http://localhost:5173' })).status).toBe(200);
    // comandos com sessão válida também passam pela conferência
    const cookie = await login(m);
    const r = await post(m, '/api/admin/command', { tipo: 'aviso', aviso: null }, { cookie, origin: 'https://malicioso.exemplo' });
    expect(r.status).toBe(403);
  });

  it('trocar ADMIN_PASSWORD derruba as sessões abertas (mesmo ADMIN_SECRET)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-sessao-'));
    const a = await montar({ stateDir: dir });
    const cookie = await login(a);
    expect((await a.app.request('/api/admin/state', { headers: { cookie } })).status).toBe(200);
    const b = await montar({ stateDir: dir, env: { ADMIN_PASSWORD: 'outra-senha-bem-longa-mesmo' } });
    expect((await b.app.request('/api/admin/state', { headers: { cookie } })).status).toBe(401);
    const c = await montar({ stateDir: dir });
    expect((await c.app.request('/api/admin/state', { headers: { cookie } })).status).toBe(200);
  });

  it('TRUST_PROXY: o limite de login usa o ÚLTIMO X-Forwarded-For (o cliente não escapa forjando o primeiro)', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    let ultimo = 0;
    for (let i = 0; i < 12; i++) {
      ultimo = (await post(m, '/api/admin/login', { senha: 'errada' }, { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.9` })).status;
    }
    expect(ultimo).toBe(429);
    // outro cliente (último salto diferente) continua podendo tentar
    expect((await post(m, '/api/admin/login', { senha: 'errada' }, { 'x-forwarded-for': '203.0.113.10' })).status).toBe(401);
    // X-Real-IP (o Caddy do deploy) vale mais que o X-Forwarded-For
    for (let i = 0; i < 10; i++) await post(m, '/api/admin/login', { senha: 'errada' }, { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': `1.1.1.${i}` });
    expect((await post(m, '/api/admin/login', { senha: 'errada' }, { 'x-real-ip': '198.51.100.7' })).status).toBe(429);
  });

  it('URL longa → 414; corpo declarado grande → 413', async () => {
    const m = await montar();
    const r = await m.app.request(`/api/status?x=${'a'.repeat(9000)}`);
    expect(r.status).toBe(414);
    const g = await m.app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) },
      body: '{}',
    });
    expect(g.status).toBe(413);
  });

  it('erros não vazam a pilha nem detalhes internos (500 genérico; detalhe só no log)', async () => {
    const m = await montar();
    const original = m.controller.status;
    m.controller.status = () => {
      throw new Error('segredo interno em /home/user/x.ts:12');
    };
    const r = await m.app.request('/api/status');
    m.controller.status = original;
    expect(r.status).toBe(500);
    const corpo = await r.text();
    expect(corpo).toBe(JSON.stringify({ erro: 'Erro interno. Tente novamente em instantes.' }));
    expect(m.log.recentes(5).some((l) => /segredo interno/.test(l.msg))).toBe(true);
  });

  it('Host forjado não contamina o HTML (sem PUBLIC_URL); padrões $ não quebram as meta tags', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-prod-'));
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(
      join(dist, 'index.html'),
      '<!doctype html><html><head><title>x</title><meta name="description" content="y" /><!--app-meta--><script>window.a=1</script></head><body></body></html>',
    );
    writeFileSync(join(dist, '.env'), 'SEGREDO=1');
    mkdirSync(join(dist, '.git'), { recursive: true });
    writeFileSync(join(dist, '.git', 'config'), '[core]');
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const mau = await (await m.app.request('/teste', { headers: { host: 'malicioso.exemplo' } })).text();
    expect(mau).toContain('http://malicioso.exemplo/teste');
    const bom = await (await m.app.request('/teste', { headers: { host: 'sintonia.exemplo.br' } })).text();
    expect(bom).toContain('http://sintonia.exemplo.br/teste');
    expect(bom).not.toContain('malicioso');
    // Host malformado vira localhost (nunca entra cru numa URL)
    const lixo = await (await m.app.request('/teste', { headers: { host: 'a"b<c>' } })).text();
    expect(lixo).toContain('http://localhost/teste');
    // arquivos ocultos nunca saem
    for (const p of ['/.env', '/.git/config', '/assets/../.env']) {
      const r = await m.app.request(p);
      expect(r.status, p).not.toBe(200);
      expect(await r.text()).not.toContain('SEGREDO');
    }
    // caminho com HTML/JS (refletido no canônico/og:url) sai escapado
    const xss = await (await m.app.request('/apuracao/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text();
    expect(xss).not.toContain('<script>alert(1)');
    expect(xss).not.toMatch(/content="[^"]*"><script/);
    // CSP com o hash do script inline do template
    const csp = (await m.app.request('/')).headers.get('content-security-policy')!;
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]{44}'/);
    // injeção: $` e $' no título não copiam pedaços do template
    const html = injetarMeta(
      '<html><head><title>t</title><!--app-meta--></head></html>',
      { titulo: "A $` B $' C $&", descricao: 'd', imagem: '/x.png', imagemAlt: 'a', status: 200 },
      'https://o',
      'https://o/p',
      '1',
    );
    expect(html).toContain("<title>A $` B $&#39; C $&amp;</title>");
    expect(html.match(/<html>/g)).toHaveLength(1);
  });

  it('CSP: hashes só dos scripts inline executáveis', () => {
    const csp = cspPagina('<script>a()</script><script src="/x.js"></script><script type="application/ld+json">{}</script>', false);
    expect(csp.match(/'sha256-/g)).toHaveLength(1);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(cspPagina('', true)).toContain('frame-ancestors *');
    // imagens: só do próprio site (e da origem pública), data: e blob: — nunca de qualquer https (pixel de terceiro)
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).not.toMatch(/img-src[^;]*https:(?!\/\/)/);
    expect(cspPagina('', false, 'https://sintonia2026.com.br')).toContain("img-src 'self' https://sintonia2026.com.br data: blob:");
  });

  it('imagens OG: limite de imagens NOVAS por cliente; imagem pronta não conta', async () => {
    const m = await montar({ env: { OG_LIMITE_MIN: '2' } });
    expect((await m.app.request('/api/og/curiosidade.png')).status).toBe(200);
    expect((await m.app.request('/api/og/cenario.png')).status).toBe(200);
    const r = await m.app.request('/api/og/camara.png');
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(r.headers.get('cache-control')).toBe('no-store');
    // as já geradas continuam saindo da memória (uma CDN pedindo de novo nunca é barrada)
    for (let i = 0; i < 5; i++) expect((await m.app.request('/api/og/curiosidade.png')).status).toBe(200);
    // outro cliente não é afetado
    const outro = await montar({ env: { OG_LIMITE_MIN: '2', TRUST_PROXY: '1' } });
    expect((await outro.app.request('/api/og/camara.png', { headers: { 'x-real-ip': '203.0.113.1' } })).status).toBe(200);
    // passada a janela, volta a gerar
    m.relogio.t += 61_000;
    expect((await m.app.request('/api/og/camara.png')).status).toBe(200);
  }, 60_000);
});

describe('operação', () => {
  it('x-request-id e x-sintonia-versao em toda resposta; /api/versao', async () => {
    const m = await montar({ env: { SINTONIA_COMMIT: 'abc1234def', TRUST_PROXY: '1' } });
    const r = await m.app.request('/api/status');
    expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f]{6}-[0-9a-z]+$/);
    expect(r.headers.get('x-sintonia-versao')).toBe('abc1234def');
    // id do proxy (bem formado) é reaproveitado; malformado é trocado
    expect((await m.app.request('/api/status', { headers: { 'x-request-id': 'caddy-req-123456' } })).headers.get('x-request-id')).toBe('caddy-req-123456');
    expect((await m.app.request('/api/status', { headers: { 'x-request-id': 'x y<z>' } })).headers.get('x-request-id')).not.toContain('<');
    const v = (await (await m.app.request('/api/versao')).json()) as { commit: string; node: string };
    expect(v.commit).toBe('abc1234def');
    expect(v.node).toBe(process.versions.node);
    const h = (await (await m.app.request('/healthz')).json()) as { ok: boolean; build: string; encerrando: boolean };
    expect(h).toMatchObject({ ok: true, build: 'abc1234def', encerrando: false });
  });

  it('/readyz: 200 pronto; 503 quando encerrando (e as respostas fecham a conexão)', async () => {
    const m = await montar();
    const r = await m.app.request('/readyz');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, motivos: [] });
    m.encerrar();
    const e = await m.app.request('/readyz');
    expect(e.status).toBe(503);
    expect(((await e.json()) as { motivos: string[] }).motivos).toContain('encerrando');
    expect((await m.app.request('/api/status')).headers.get('connection')).toBe('close');
    expect((await m.app.request('/healthz')).status).toBe(200); // vivo continua respondendo
  });

  it('/readyz: build do app ausente → 503', async () => {
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: mkdtempSync(join(tmpdir(), 'sintonia-vazio-')) } });
    const r = await m.app.request('/readyz');
    expect(r.status).toBe(503);
    expect(((await r.json()) as { motivos: string[] }).motivos[0]).toMatch(/build do app ausente/);
  });

  it('logs em JSON: um objeto por linha, requisições quentes por amostragem, erros e admin sempre', async () => {
    const linhas: { l: string; n: Nivel }[] = [];
    const m = await montar({ env: { LOG_FORMAT: 'json', LOG_AMOSTRA: '0', LOG_AMOSTRA_PAGINAS: '0' }, escreverLog: (l, n) => linhas.push({ l, n }) });
    for (let i = 0; i < 20; i++) await m.app.request('/api/status');
    await m.app.request('/api/apuracao/pres/br');
    expect(linhas.filter(({ l }) => l.includes('"msg":"req"'))).toHaveLength(0);
    await m.app.request('/api/meta');
    await login(m);
    const reqs = linhas.map(({ l }) => JSON.parse(l) as Record<string, unknown>).filter((o) => o.msg === 'req');
    expect(reqs.map((o) => o.rota)).toEqual(['/api/meta', '/api/admin/login']);
    const o = reqs[1];
    expect(o).toMatchObject({ nivel: 'info', metodo: 'POST', status: 200, amostra: 1 });
    expect(typeof o.ms).toBe('number');
    expect(o.id).toMatch(/^[0-9a-f]{6}-/);
    expect(Object.keys(o).join(',')).not.toMatch(/ip|cookie|senha/i);
    // eventos comuns também em JSON
    expect(linhas.some(({ l }) => /"msg":"Admin: login efetuado"/.test(l))).toBe(true);
    // sem amostragem (1): tudo
    const todas: string[] = [];
    const m2 = await montar({ env: { LOG_FORMAT: 'json', LOG_AMOSTRA: '1' }, escreverLog: (l) => todas.push(l) });
    for (let i = 0; i < 5; i++) await m2.app.request('/api/status');
    expect(todas.filter((l) => l.includes('"rota":"/api/status"'))).toHaveLength(5);
  });

  it('logger: erro em JSON leva a mensagem e a pilha (só no log)', () => {
    const out: string[] = [];
    const log = createLogger({ formato: 'json', escrever: (l) => out.push(l), now: () => 0 });
    log.erro('Falhou', new Error('quebrou'), { id: 'x1' });
    const o = JSON.parse(out[0]) as Record<string, string>;
    expect(o).toMatchObject({ t: '1970-01-01T00:00:00.000Z', nivel: 'erro', msg: 'Falhou', erro: 'quebrou', id: 'x1' });
    expect(o.stack).toContain('Error: quebrou');
    expect(log.recentes(1)[0].msg).toBe('[erro] Falhou: quebrou');
  });

  it('admin: métricas do servidor no snapshot', async () => {
    const m = await montar();
    const cookie = await login(m);
    for (let i = 0; i < 3; i++) await m.app.request('/api/status');
    m.resumoMinuto();
    const s = await estado(m, cookie);
    const mt = s.servidor!.metricas;
    expect(mt.rssMb).toBeGreaterThan(0);
    expect(mt.heapMb).toBeGreaterThan(0);
    expect(mt.emAndamento).toBeGreaterThanOrEqual(1);
    expect(mt.og).toMatchObject({ emMemoria: expect.any(Number), naFila: 0 });
    expect(s.servidor!.build.commit).toBeTruthy();
  });
});

describe('SEO', () => {
  it('sitemap.xml com PUBLIC_URL: home, apuração, 27 UFs, cargos, assembleias por UF e institucionais', async () => {
    const m = await montar({ env: { PUBLIC_URL: 'https://sintonia.exemplo.br/qualquer' } });
    const r = await m.app.request('/sitemap.xml');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/xml');
    const x = await r.text();
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((a) => a[1]);
    expect(locs).toHaveLength(rotasSitemap().length);
    expect(locs.every((l) => l.startsWith('https://sintonia.exemplo.br/'))).toBe(true);
    for (const p of ['/', '/apuracao', '/governadores', '/senado', '/camara', '/assembleias', '/curiosidades', '/cenarios', '/teste', '/metodologia', '/sobre', '/privacidade'])
      expect(locs, p).toContain(`https://sintonia.exemplo.br${p}`);
    for (const uf of UFS) {
      expect(locs).toContain(`https://sintonia.exemplo.br/apuracao/${uf.toLowerCase()}`);
      expect(locs).toContain(`https://sintonia.exemplo.br/assembleias/${uf.toLowerCase()}`);
    }
    expect(locs.filter((l) => /\/apuracao\/[a-z]{2}$/.test(l))).toHaveLength(27);
    expect(locs.some((l) => /admin|duelo|embed|kit|cenarios\?/.test(l))).toBe(false);
    expect(UFS_GOV_2T.length).toBeGreaterThan(0);
  });

  it('robots.txt referencia o sitemap (absoluto) e mantém as regras', async () => {
    const m = await montar({ env: { PUBLIC_URL: 'https://sintonia.exemplo.br' } });
    const t = await (await m.app.request('/robots.txt')).text();
    expect(t).toContain('Sitemap: https://sintonia.exemplo.br/sitemap.xml');
    expect(t).toContain('Allow: /api/og/');
    expect(t).toContain('Disallow: /admin');
  });
});
