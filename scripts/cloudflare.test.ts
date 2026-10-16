/**
 * deploy/cloudflare.mjs contra a Cloudflare FALSA (scripts/cloudflare-falso.ts): nunca chama a API de verdade.
 * Confere que --aplicar grava exatamente as regras do anexo (e é idempotente), --desligar desabilita sem apagar,
 * --conferir aprova/reprova pela borda, a chave nunca aparece na saída nem vai para disco, o congelamento da noite e
 * que o DEPLOY.md mostra as MESMAS expressões que o script grava (o passo a passo pelo celular depende disso).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarCloudflareFalso, type Regra } from './cloudflare-falso';

const RAIZ = resolve(__dirname, '..');
const SCRIPT = join(RAIZ, 'deploy/cloudflare.mjs');
const FASE = 'http_request_cache_settings';
const REFS = ['sintonia_api', 'sintonia_nunca', 'sintonia_sem_query', 'sintonia_html'];

let cf: ReturnType<typeof criarCloudflareFalso>;
let porta = 0;
let pasta = '';

/** Roda o script num processo à parte (assíncrono: o servidor falso está neste processo). */
function rodar(args: string[], env: Record<string, string | undefined> = {}, comChave = true) {
  return new Promise<{ codigo: number; saida: string }>((res) => {
    const filho = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: pasta,
      env: {
        PATH: process.env.PATH,
        NO_COLOR: '1',
        CF_API_BASE: `http://127.0.0.1:${porta}/client/v4`,
        CF_CONFERIR_ORIGEM: `http://127.0.0.1:${porta}`,
        CF_AGORA: '2026-10-18T10:00:00-03:00',
        ...(comChave ? { CF_API_TOKEN: cf.token, CF_ZONE_ID: cf.zonaId } : {}),
        ...env,
      },
    });
    let saida = '';
    filho.stdout.on('data', (b) => (saida += b));
    filho.stderr.on('data', (b) => (saida += b));
    filho.on('close', (codigo) => res({ codigo: codigo ?? -1, saida }));
  });
}

beforeEach(async () => {
  cf = criarCloudflareFalso();
  porta = await cf.ouvir(0);
  pasta = mkdtempSync(join(tmpdir(), 'cf-teste-'));
});
afterEach(async () => {
  await cf.fechar();
  // nada gravado em disco pelo script (a chave nunca vai para arquivo)
  expect(readdirSync(pasta)).toEqual([]);
  rmSync(pasta, { recursive: true, force: true });
});

const regrasCache = () => cf.estado.rulesets[FASE]?.rules ?? [];

describe('deploy/cloudflare.mjs', () => {
  it('sem chave: --aplicar/--desligar/--purgar recusam (código 2) e explicam; --mostrar e a ajuda funcionam', async () => {
    for (const acao of ['--aplicar', '--desligar', '--purgar']) {
      const r = await rodar([acao], {}, false);
      expect(r.codigo).toBe(2);
      expect(r.saida).toContain('CF_API_TOKEN');
    }
    const m = await rodar(['--mostrar', '--dominio=sintonia2026.com.br'], {}, false);
    expect(m.codigo).toBe(0);
    expect(m.saida).toContain('Sintonia: nunca guardar');
    expect(m.saida).toContain('(http.host eq "www.sintonia2026.com.br")');
    expect((await rodar(['--help'], {}, false)).codigo).toBe(0);
    expect(cf.estado.chamadas).toEqual([]);
  });

  it('recusa a chave na linha de comando (histórico)', async () => {
    const r = await rodar(['--aplicar', '--token=abc123'], {}, false);
    expect(r.codigo).toBe(2);
    expect(r.saida).toMatch(/Nunca passe a chave/);
  });

  it('--aplicar: substitui as regras "Sintonia" feitas à mão, mantém a de outro dono antes e grava zona e www', async () => {
    cf.estado.rulesets[FASE] = {
      id: 'r'.repeat(32),
      phase: FASE,
      version: 3,
      rules: [
        { id: 'a1', ref: 'a1', description: 'Outro: imagens', expression: '(http.request.uri.path eq "/x.png")', action: 'set_cache_settings', action_parameters: { cache: true }, enabled: true, version: '1', last_updated: 'x' },
        { id: 'a2', ref: 'a2', description: 'Sintonia: API pública e dados', expression: '(http.host eq "sintonia2026.com.br" and starts_with(http.request.uri.path, "/api/apuracao/"))', action: 'set_cache_settings', action_parameters: { cache: true }, enabled: true, version: '1', last_updated: 'x' },
        { id: 'a3', ref: 'a3', description: 'Sintonia: nunca guardar', expression: '(http.request.uri.path eq "/healthz")', action: 'set_cache_settings', action_parameters: { cache: false }, enabled: true, version: '1', last_updated: 'x' },
      ] as Regra[],
    };
    // simulação: só leituras
    const s = await rodar(['--aplicar', '--simular']);
    expect(s.codigo).toBe(0);
    expect(s.saida).toContain('mudaria');
    expect(cf.escritas()).toEqual([]);

    const r = await rodar(['--aplicar']);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).not.toContain(cf.token);
    const regras = regrasCache();
    expect(regras.map((x) => x.ref)).toEqual(['a1', ...REFS]);
    expect(regras[0].description).toBe('Outro: imagens');
    const [api, nunca, semQuery, html] = regras.slice(1);
    // nunca TTL fixo: a borda usa o cabeçalho da origem; sem ele, não guarda
    for (const x of [api, semQuery, html]) {
      expect(x.action_parameters).toMatchObject({ cache: true, edge_ttl: { mode: 'bypass_by_default' }, browser_ttl: { mode: 'respect_origin' } });
      expect(JSON.stringify(x.action_parameters)).not.toContain('override_origin');
    }
    expect(api.action_parameters).not.toHaveProperty('cache_key'); // query inteira na chave (padrão)
    expect(nunca.action_parameters).toEqual({ cache: false });
    expect(semQuery.action_parameters).toMatchObject({ cache_key: { custom_key: { query_string: { exclude: { all: true } } } } });
    expect(api.expression).not.toContain('http.host'); // sem o host: vale para o domínio que estiver na zona
    for (const p of ['/api/texto/', '/api/live/agora', '/api/apuracao/', '/api/og/', '/data/', '/geo/']) expect(api.expression).toContain(`"${p}"`);
    for (const p of ['/api/saude-noite', '/api/live/batimento', '/api/admin', '/api/anuncio/ir/', '/api/anuncio/evento', '/api/audiencia', '/api/anuncie/', '/api/chat/', '/healthz']) {
      expect(nunca.expression).toContain(`"${p}"`);
    }
    expect(html.expression).toContain('not starts_with(http.request.uri.path, "/api/")');
    expect(html.expression).toContain('not starts_with(http.request.uri.path, "/embed")');

    const redir = cf.estado.rulesets.http_request_dynamic_redirect.rules;
    expect(redir).toHaveLength(1);
    expect(redir[0]).toMatchObject({
      ref: 'sintonia_www',
      expression: '(http.host eq "www.sintonia2026.com.br")',
      action_parameters: { from_value: { status_code: 301, preserve_query_string: true, target_url: { expression: 'concat("https://sintonia2026.com.br", http.request.uri.path)' } } },
    });
    const www = cf.estado.dns.find((d) => d.name === 'www.sintonia2026.com.br');
    expect(www).toMatchObject({ type: 'AAAA', content: '100::', proxied: true });
    expect(cf.estado.settings).toMatchObject({ browser_cache_ttl: 0, always_online: 'off', rocket_loader: 'off' });
    expect(cf.estado.tiered).toBe('on');
    expect(cf.estado.managed.managed_request_headers.find((h) => h.id === 'add_visitor_location_headers')?.enabled).toBe(true);
    // a chave só no cabeçalho Authorization, nunca num corpo
    expect(cf.estado.corpos.join('\n')).not.toContain(cf.token);

    // idempotente: rodar de novo não escreve nada
    const antes = cf.estado.chamadas.length;
    const r2 = await rodar(['--aplicar']);
    expect(r2.codigo, r2.saida).toBe(0);
    expect(cf.escritas(antes)).toEqual([]);
    expect(r2.saida).toContain('já estavam certas');
  });

  it('--conferir: aprova depois do --aplicar (com e sem chave); --desligar desabilita sem apagar e o --conferir reprova', async () => {
    const ruim = await rodar(['--conferir'], { DOMINIO: 'sintonia2026.com.br' }, false);
    expect(ruim.codigo).toBe(1);
    expect(ruim.saida).toContain('/api/status NÃO está sendo guardado');
    expect(ruim.saida).toMatch(/www respondeu 530/);

    expect((await rodar(['--aplicar'])).codigo).toBe(0);
    const semChave = await rodar(['--conferir', '--dominio=sintonia2026.com.br'], {}, false);
    expect(semChave.codigo, semChave.saida).toBe(0);
    expect(semChave.saida).toMatch(/\/api\/status guardado na borda \(cf-cache-status (MISS|HIT|EXPIRED) → HIT/);
    expect(semChave.saida).toContain('/api/admin/state nunca guardado');
    expect(semChave.saida).toContain('www → 301 https://sintonia2026.com.br/apuracao?conferir=1');
    expect(semChave.saida).toContain('sem CF_API_TOKEN');
    const comChave = await rodar(['--conferir']);
    expect(comChave.codigo, comChave.saida).toBe(0);
    expect(comChave.saida).toContain('Smart Tiered Cache ligado');
    expect(comChave.saida).not.toContain(cf.token);

    const d = await rodar(['--desligar']);
    expect(d.codigo, d.saida).toBe(0);
    const regras = regrasCache();
    expect(regras.map((x) => x.ref)).toEqual(REFS); // nada apagado
    expect(regras.every((x) => x.enabled === false)).toBe(true);
    expect(cf.estado.rulesets.http_request_dynamic_redirect.rules[0].enabled).toBe(true); // o www continua
    const depois = await rodar(['--conferir']);
    expect(depois.codigo).toBe(1);
    expect(depois.saida).toContain('DESLIGADA');
    // --aplicar religa
    expect((await rodar(['--aplicar'])).codigo).toBe(0);
    expect(regrasCache().every((x) => x.enabled === true)).toBe(true);
  });

  it('--conferir reprova sem proxy (nuvem cinza) e com o Web Analytics injetado', async () => {
    expect((await rodar(['--aplicar'])).codigo).toBe(0);
    cf.estado.insights = true;
    const a = await rodar(['--conferir'], { DOMINIO: 'sintonia2026.com.br' }, false);
    expect(a.codigo).toBe(1);
    expect(a.saida).toContain('cloudflareinsights');
    cf.estado.semProxy = true;
    const b = await rodar(['--conferir', '--dominio=sintonia2026.com.br'], {}, false);
    expect(b.codigo).toBe(1);
    expect(b.saida).toContain('NÃO passa pela Cloudflare');
  });

  it('regras feitas pelo celular (sem a ref do script, mesmo nome e conteúdo) passam no --conferir; --aplicar as troca', async () => {
    expect((await rodar(['--aplicar'])).codigo).toBe(0);
    const tirarRef = (r: Regra) => {
      const { ref: _ref, ...resto } = r;
      return { ...resto, ref: r.id, id: r.id } as Regra; // a Cloudflare dá ref = id a quem não tem
    };
    cf.estado.rulesets[FASE].rules = regrasCache().map(tirarRef);
    const redir = cf.estado.rulesets.http_request_dynamic_redirect;
    redir.rules = redir.rules.map((r) => ({ ...tirarRef(r), description: 'www para o domínio' }));
    const c = await rodar(['--conferir']);
    expect(c.codigo, c.saida).toBe(0);
    expect(c.saida).toContain('(feita pelo painel, igual à do script)');
    expect(c.saida).toContain('Regra www → domínio (301) (feita pelo painel)');
    // fora de ordem: reprova
    const [r1, r2, r3, r4] = regrasCache();
    cf.estado.rulesets[FASE].rules = [r2, r1, r3, r4];
    const f = await rodar(['--conferir']);
    expect(f.codigo).toBe(1);
    expect(f.saida).toContain('fora de ordem');
    // --aplicar troca as do painel pelas do script, na ordem
    const a = await rodar(['--aplicar']);
    expect(a.codigo, a.saida).toBe(0);
    expect(a.saida).toContain('substituir a regra feita à mão');
    expect(regrasCache().map((x) => x.ref)).toEqual(REFS);
  });

  it('chave sem uma permissão: os outros passos seguem, a saída diz qual faltou e o código é 1', async () => {
    cf.estado.negar = ['PATCH /zones/0123456789abcdef0123456789abcdef/managed_headers'];
    const r = await rodar(['--aplicar']);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/Cabeçalhos de localização: a chave não tem permissão/);
    expect(r.saida).toContain('DEPLOY.md §5.2');
    expect(regrasCache().map((x) => x.ref)).toEqual(REFS);
    expect(cf.estado.tiered).toBe('on');
  });

  it('chave recusada (vencida): explica e não grava nada', async () => {
    const r = await rodar(['--aplicar'], { CF_API_TOKEN: 'outra-chave-qualquer-123' });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/chave foi recusada/);
    expect(r.saida).not.toContain('outra-chave-qualquer-123');
    expect(cf.escritas()).toEqual([]);
  });

  it('congelamento da noite: --aplicar recusa sem --forcar; --desligar e --conferir sempre podem', async () => {
    const noite = { CF_AGORA: '2026-10-25T18:00:00-03:00' };
    const r = await rodar(['--aplicar'], noite);
    expect(r.codigo).toBe(2);
    expect(r.saida).toContain('Congelamento');
    expect(cf.escritas()).toEqual([]);
    expect((await rodar(['--aplicar', '--forcar'], noite)).codigo).toBe(0);
    expect((await rodar(['--desligar'], noite)).codigo).toBe(0);
  });

  it('zona achada pelo domínio sem CF_ZONE_ID; --purgar manda as URLs completas', async () => {
    const r = await rodar(['--purgar', '/robots.txt', '/sitemap.xml', '--dominio=sintonia2026.com.br'], { CF_ZONE_ID: '' });
    expect(r.codigo, r.saida).toBe(0);
    expect(cf.estado.purgas).toEqual(['https://sintonia2026.com.br/robots.txt', 'https://sintonia2026.com.br/sitemap.xml']);
    const errado = await rodar(['--aplicar', '--dominio=outro.com.br']);
    expect(errado.codigo).toBe(2);
    expect(errado.saida).toContain('A zona da chave é sintonia2026.com.br');
  });
});

describe('DEPLOY.md e o script dizem a mesma coisa', () => {
  it('cada expressão gravada pelo --aplicar aparece, idêntica, no DEPLOY.md (o celular cola de lá)', async () => {
    const saida = (await rodar(['--mostrar', '--dominio=seu-dominio'], {}, false)).saida;
    const doc = readFileSync(join(RAIZ, 'DEPLOY.md'), 'utf8');
    const exprs = [...saida.matchAll(/expressão: (.+)/g)].map((m) => m[1].trim());
    expect(exprs).toHaveLength(5);
    for (const e of exprs) expect(doc, e).toContain(e);
    expect(doc).toContain('concat("https://seu-dominio", http.request.uri.path)');
  });
});
