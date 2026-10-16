#!/usr/bin/env node
/**
 * Sintonia — a Cloudflare da noite (I02, leva 3), pela API v4. Node 22, sem dependências.
 *
 *   node deploy/cloudflare.mjs --aplicar [--simular]  regras de cache 1–4, zona e www → 301 (precisa da chave)
 *   node deploy/cloudflare.mjs --conferir [--dominio=sintonia2026.com.br]
 *                                                      pela borda, SEM chave: /api/status guardado, admin/cliques/saúde
 *                                                      nunca, /assets guardado, www 301; com a chave, também a zona
 *   node deploy/cloudflare.mjs --desligar              desabilita as regras de cache do Sintonia SEM apagar (--aplicar
 *                                                      religa); a zona e o www ficam como estão
 *   node deploy/cloudflare.mjs --purgar /robots.txt [/sitemap.xml …]   tira estes endereços da borda (precisa da chave)
 *   node deploy/cloudflare.mjs --mostrar               imprime as regras (para conferir ou colar no painel pelo celular)
 *
 * A CHAVE (token da API) vem SÓ do ambiente e nunca é gravada nem impressa:
 *   read -rs CF_API_TOKEN && export CF_API_TOKEN       (cole a chave; não aparece na tela nem no histórico)
 *   export CF_ZONE_ID=…                                (opcional: sem ele, a zona é achada pelo --dominio)
 * Use uma chave TEMPORÁRIA, só desta zona, e revogue-a logo depois (DEPLOY.md §5.1). Nunca deixe a chave na VPS.
 *
 * O que --aplicar faz (idempotente: rodar de novo não muda nada que já esteja certo):
 *   - fase http_request_cache_settings: as 4 regras do Sintonia (ref sintonia_*) no FIM da lista, nesta ordem.
 *     Regras do Sintonia criadas à mão (descrição "Sintonia…", ex.: as do DEPLOY §5 antigo) são substituídas; regras
 *     de outros donos ficam como estão, antes das nossas. Nenhuma tem TTL fixo: a borda usa o cabeçalho da origem
 *     (`Cloudflare-CDN-Cache-Control`/`Cache-Control`, I04) e não guarda o que vier sem cabeçalho.
 *       1 "Sintonia: API pública e dados"  elegível; query inteira na chave
 *       2 "Sintonia: nunca guardar"        bypass (painel, saúde, cliques e impressões, POSTs do chat, audiência…)
 *       3 "Sintonia: sem query"            status, meta, chat e divulgação com a query fora da chave
 *       4 "Sintonia: páginas (HTML)"       elegível; só guarda quando a origem manda `Cloudflare-CDN-Cache-Control`,
 *                                          isto é, com a chave "html-borda" ligada no painel (padrão desligada)
 *   - zona: Smart Tiered Cache ligado; cache do navegador = "respeitar os cabeçalhos"; Always Online e Rocket Loader
 *     desligados; transformação gerenciada "Add visitor location headers" ligada (UF e país agregados da medição, I14);
 *   - www: registro DNS `www` com proxy (AAAA 100::, o endereço "descarte" que a Cloudflare recomenda para nomes que só
 *     redirecionam; nunca chega à VPS) e regra de redirecionamento 301 para o domínio, mantendo caminho e query.
 *
 * Saída: 0 tudo certo · 1 alguma conferência/passo falhou · 2 uso errado. Variáveis só para teste (API falsa):
 * CF_API_BASE (padrão https://api.cloudflare.com/client/v4), CF_CONFERIR_ORIGEM (http://host:porta: as conferências
 * pela borda conectam ali, mandando o Host do domínio) e CF_AGORA (ISO 8601, relógio do congelamento).
 */
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

// ---- as regras (fonte única: o DEPLOY.md §5 mostra exatamente estas expressões; teste em scripts/cloudflare.test.ts) --

const P = 'http.request.uri.path';
/** Borda respeita a origem; sem cabeçalho de cache, não guarda ("usar Cache-Control se presente, ignorar se não"). */
const RESPEITAR = { edge_ttl: { mode: 'bypass_by_default' }, browser_ttl: { mode: 'respect_origin' } };

export const REGRAS_CACHE = Object.freeze([
  {
    ref: 'sintonia_api',
    description: 'Sintonia: API pública e dados',
    expression:
      `(starts_with(${P}, "/api/apuracao/") or ${P} in {"/api/status" "/api/meta" "/api/chat" "/api/divulgacao" "/api/live/agora" "/api/anuncio/img"}` +
      ` or starts_with(${P}, "/api/og/") or starts_with(${P}, "/api/patrocinio/") or starts_with(${P}, "/api/texto/")` +
      ` or starts_with(${P}, "/data/") or starts_with(${P}, "/geo/"))`,
    action: 'set_cache_settings',
    action_parameters: { cache: true, ...RESPEITAR },
    enabled: true,
  },
  {
    ref: 'sintonia_nunca',
    description: 'Sintonia: nunca guardar',
    expression:
      `(starts_with(${P}, "/api/admin") or starts_with(${P}, "/admin")` +
      ` or ${P} in {"/healthz" "/api/anuncio/evento" "/api/audiencia" "/api/saude-noite" "/api/live/batimento"}` +
      ` or starts_with(${P}, "/api/anuncio/ir/") or starts_with(${P}, "/api/chat/") or starts_with(${P}, "/api/anuncie/"))`,
    action: 'set_cache_settings',
    action_parameters: { cache: false },
    enabled: true,
  },
  {
    ref: 'sintonia_sem_query',
    description: 'Sintonia: sem query',
    expression: `(${P} in {"/api/status" "/api/meta" "/api/chat" "/api/divulgacao"})`,
    action: 'set_cache_settings',
    action_parameters: { cache: true, ...RESPEITAR, cache_key: { custom_key: { query_string: { exclude: { all: true } } } } },
    enabled: true,
  },
  {
    ref: 'sintonia_html',
    description: 'Sintonia: páginas (HTML, só com a chave html-borda)',
    expression: `(not starts_with(${P}, "/api/") and not starts_with(${P}, "/admin") and not starts_with(${P}, "/embed") and ${P} ne "/healthz")`,
    action: 'set_cache_settings',
    action_parameters: { cache: true, ...RESPEITAR },
    enabled: true,
  },
]);

/** Regra de redirecionamento www → domínio (fase http_request_dynamic_redirect). */
export function regraWww(dominio) {
  return {
    ref: 'sintonia_www',
    description: 'Sintonia: www para o domínio (301)',
    expression: `(http.host eq "www.${dominio}")`,
    action: 'redirect',
    action_parameters: {
      from_value: { status_code: 301, target_url: { expression: `concat("https://${dominio}", ${P})` }, preserve_query_string: true },
    },
    enabled: true,
  };
}

/** Configurações da zona: [id da configuração, valor desejado, rótulo]. */
export const CONFIG_ZONA = Object.freeze([
  ['browser_cache_ttl', 0, 'Cache do navegador = respeitar os cabeçalhos'],
  ['always_online', 'off', 'Always Online desligado'],
  ['rocket_loader', 'off', 'Rocket Loader desligado'],
]);
const CABECALHO_LOCAL = 'add_visitor_location_headers';
const WWW_DESCARTE = '100::';
const FASE_CACHE = 'http_request_cache_settings';
const FASE_REDIR = 'http_request_dynamic_redirect';
/** Congelamento da noite (o mesmo do auto-update.sh / RUNBOOK): --aplicar recusa sem --forcar. */
const CONGELA_DE = Date.parse('2026-10-24T12:00:00-03:00');
const CONGELA_ATE = Date.parse('2026-10-26T06:00:00-03:00');

/** Status do `cf-cache-status` que provam que a borda guarda (o 2º pedido veio da cópia ou a renovou). */
export const GUARDANDO = new Set(['HIT', 'UPDATING', 'EXPIRED', 'REVALIDATED', 'STALE']);
export const NUNCA = new Set(['BYPASS', 'DYNAMIC']);

// ---- saída ---------------------------------------------------------------------------------------------------------

const COR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (n, s) => (COR ? `\x1b[${n}m${s}\x1b[0m` : s);
let FALHAS = 0;
const info = (s) => console.log(c(1, `==> ${s}`));
const ok = (s) => console.log(`${c(32, '✔')} ${s}`);
const aviso = (s) => console.log(`${c(33, '!')} ${s}`);
const falha = (s) => {
  FALHAS++;
  console.log(`${c(31, '✘')} ${s}`);
};
const fraco = (s) => console.log(c(2, `   ${s}`));

// ---- argumentos ------------------------------------------------------------------------------------------------------

function lerArgs(argv) {
  const a = { acao: null, simular: false, forcar: false, dominio: null, caminhos: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const [nome, valor] = x.includes('=') ? [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] : [x, null];
    if (/^--(api-)?token$|^--chave$/i.test(nome)) {
      throw new ErroUso('Nunca passe a chave na linha de comando (fica no histórico e na lista de processos). Use: read -rs CF_API_TOKEN && export CF_API_TOKEN');
    }
    if (['--aplicar', '--conferir', '--desligar', '--purgar', '--mostrar'].includes(nome)) {
      if (a.acao) throw new ErroUso(`Uma ação por vez (${a.acao} e ${nome}).`);
      a.acao = nome.slice(2);
    } else if (nome === '--simular') a.simular = true;
    else if (nome === '--forcar') a.forcar = true;
    else if (nome === '--dominio') a.dominio = valor ?? argv[++i] ?? null;
    else if (nome === '-h' || nome === '--help' || nome === '--ajuda') a.acao = 'ajuda';
    else if (!x.startsWith('-')) a.caminhos.push(x);
    else throw new ErroUso(`Opção desconhecida: ${x}`);
  }
  return a;
}

class ErroUso extends Error {}

/** Domínio: --dominio, DOMINIO do ambiente ou do .env do projeto (na VPS). */
function dominioPadrao() {
  if (process.env.DOMINIO) return process.env.DOMINIO;
  try {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
    const m = /^\s*DOMINIO=['"]?([^'"\s]+)['"]?\s*$/m.exec(readFileSync(join(raiz, '.env'), 'utf8'));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const dominioValido = (d) => typeof d === 'string' && /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);

// ---- API da Cloudflare ------------------------------------------------------------------------------------------------

const API = (process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');
const TOKEN = (process.env.CF_API_TOKEN || '').trim();
/** Nenhuma mensagem sai com a chave dentro (nem por acidente num erro). */
const semChave = (s) => (TOKEN && TOKEN.length >= 8 ? String(s).split(TOKEN).join('***') : String(s));

class ErroCf extends Error {
  constructor(status, erros, caminho) {
    const det = (erros || []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ');
    super(semChave(`HTTP ${status}${det ? ` — ${det}` : ''}`));
    this.status = status;
    this.codigos = (erros || []).map((e) => e.code);
    this.caminho = caminho;
  }
}

async function cf(metodo, caminho, corpo) {
  let r;
  try {
    r = await fetch(API + caminho, {
      method: metodo,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'user-agent': 'sintonia-cloudflare/1' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new Error(semChave(`sem resposta da API (${e.cause?.code ?? e.message})`));
  }
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* corpo não-JSON */
  }
  if (!r.ok || !j || j.success === false) throw new ErroCf(r.status, j?.errors, caminho);
  return j.result;
}

/** Explica um erro da API em português (permissão da chave, chave vencida…). */
function explicar(e, passo) {
  if (e instanceof ErroCf) {
    if (e.status === 401) return `${passo}: a chave foi recusada (vencida, revogada ou colada errado) — ${e.message}`;
    if (e.status === 403) return `${passo}: a chave não tem permissão para isto (DEPLOY.md §5.1 lista as permissões) — ${e.message}`;
    return `${passo}: a Cloudflare recusou — ${e.message}`;
  }
  return `${passo}: ${semChave(e.message)}`;
}

async function entrypoint(zona, fase) {
  try {
    return await cf('GET', `/zones/${zona}/rulesets/phases/${fase}/entrypoint`);
  } catch (e) {
    if (e instanceof ErroCf && e.status === 404) return { rules: [] };
    throw e;
  }
}

// ---- comparação de regras ----------------------------------------------------------------------------------------------

const normExpr = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** `a` contém `b` (cada chave de b existe em a com o mesmo valor, recursivo). */
export function contem(a, b) {
  if (b === null || typeof b !== 'object') return a === b;
  if (a === null || typeof a !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(b)) return a.length === b.length && b.every((x, i) => contem(a[i], x));
  return Object.keys(b).every((k) => contem(a[k], b[k]));
}
export const regraIgual = (atual, desejada) =>
  !!atual &&
  atual.action === desejada.action &&
  normExpr(atual.expression) === normExpr(desejada.expression) &&
  (atual.enabled ?? true) === desejada.enabled &&
  (atual.description ?? '') === desejada.description &&
  contem(atual.action_parameters ?? {}, desejada.action_parameters);
const REORDENAR = 'reordenar as regras do Sintonia';
const ehNossa = (r) => typeof r.ref === 'string' && r.ref.startsWith('sintonia_');
/** Regra do Sintonia criada à mão pelo DEPLOY §5 antigo ("Sintonia: …"), sem a nossa ref. */
const ehAntigaManual = (r) => !ehNossa(r) && /^\s*sintonia\b/i.test(r.description ?? '');
/** Só os campos que se mandam de volta numa regra existente (sem versão, data…). */
function regraParaEnvio(r) {
  const o = {};
  for (const k of ['id', 'ref', 'description', 'expression', 'action', 'action_parameters', 'enabled', 'logging']) if (r[k] !== undefined) o[k] = r[k];
  return o;
}

/**
 * Lista nova de regras de uma fase: as de outros donos como estão + as nossas (no fim, ou no começo com `primeiro`).
 * Devolve também o que muda, para mostrar antes (--simular) e depois.
 */
export function planejarRegras(atuais, desejadas, { primeiro = false } = {}) {
  const outras = atuais.filter((r) => !ehNossa(r) && !ehAntigaManual(r)).map(regraParaEnvio);
  const antigas = atuais.filter(ehAntigaManual);
  const nossasAtuais = atuais.filter(ehNossa);
  const mudancas = [];
  for (const d of desejadas) {
    const a = nossasAtuais.find((r) => r.ref === d.ref);
    if (!a) mudancas.push(`criar "${d.description}"`);
    else if (!regraIgual(a, d)) mudancas.push(`atualizar "${d.description}"`);
  }
  for (const r of antigas) mudancas.push(`substituir a regra feita à mão "${r.description}"`);
  for (const r of nossasAtuais) if (!desejadas.some((d) => d.ref === r.ref)) mudancas.push(`remover a regra antiga "${r.description ?? r.ref}"`);
  const nossas = desejadas.map((d) => {
    const a = nossasAtuais.find((r) => r.ref === d.ref);
    return a?.id ? { id: a.id, ...d } : { ...d };
  });
  const regras = primeiro ? [...nossas, ...outras] : [...outras, ...nossas];
  // a posição importa (numa fase de cache, a regra de baixo vale por cima da de cima): mesma lista, outra ordem?
  const ident = (r) => r.ref ?? r.id ?? r.description;
  if (!mudancas.length && atuais.map(ident).join('|') !== regras.map(ident).join('|')) mudancas.push(REORDENAR);
  return { regras, mudancas, outras: outras.length, antigas: antigas.length };
}

// ---- --aplicar / --desligar / --conferir (zona) ------------------------------------------------------------------------

async function acharZona(dominio) {
  let id = (process.env.CF_ZONE_ID || '').trim();
  if (!id) {
    if (!dominioValido(dominio)) throw new ErroUso('Sem CF_ZONE_ID: informe --dominio=seu-dominio (a zona é achada pelo nome).');
    const lista = await cf('GET', `/zones?name=${encodeURIComponent(dominio)}`);
    if (!Array.isArray(lista) || !lista.length) throw new Error(`a chave não enxerga a zona ${dominio}`);
    id = lista[0].id;
  }
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new ErroUso('CF_ZONE_ID inválido (são 32 caracteres hexadecimais; painel da Cloudflare → o site → Visão geral → "ID da zona").');
  const z = await cf('GET', `/zones/${encodeURIComponent(id)}`);
  return { id: z.id ?? id, nome: z.name, status: z.status, plano: z.plan?.name };
}

async function validadeChave() {
  try {
    const t = await cf('GET', '/user/tokens/verify');
    if (t?.expires_on) fraco(`chave válida até ${t.expires_on} (revogue logo depois de usar: DEPLOY.md §5.1)`);
    else aviso('A chave não tem data de validade: depois de usar, revogue-a (Perfil → Tokens da API → Revogar).');
  } catch {
    /* chave de conta (não de usuário) não responde a este endereço: segue; a zona dirá se vale */
  }
}

/** Um passo do --aplicar: lê, compara, (escreve). Erros de um passo não impedem os outros. */
async function passo(nome, fn) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ErroUso) throw e;
    falha(explicar(e, nome));
  }
}

async function aplicar(zona, dominio, simular) {
  const verbo = simular ? 'mudaria' : 'feito';
  const escrever = !simular;

  await passo('Regras de cache', async () => {
    const ep = await entrypoint(zona.id, FASE_CACHE);
    const plano = planejarRegras(ep.rules ?? [], REGRAS_CACHE);
    if (!plano.mudancas.length) return ok(`Regras de cache: as 4 do Sintonia já estavam certas${plano.outras ? ` (e ${plano.outras} de outro dono, intocadas)` : ''}`);
    if (escrever) await cf('PUT', `/zones/${zona.id}/rulesets/phases/${FASE_CACHE}/entrypoint`, { rules: plano.regras });
    ok(`Regras de cache (${verbo}): ${plano.mudancas.join('; ')}${plano.outras ? ` · ${plano.outras} regra(s) de outro dono mantida(s) antes das nossas` : ''}`);
  });

  await passo('Redirecionamento do www', async () => {
    const ep = await entrypoint(zona.id, FASE_REDIR);
    const plano = planejarRegras(ep.rules ?? [], [regraWww(dominio)], { primeiro: true });
    if (!plano.mudancas.length) return ok(`www → ${dominio} (301): já estava certo`);
    if (escrever) await cf('PUT', `/zones/${zona.id}/rulesets/phases/${FASE_REDIR}/entrypoint`, { rules: plano.regras });
    ok(`www → ${dominio} (301, ${verbo}): ${plano.mudancas.join('; ')}`);
  });

  await passo('DNS do www', async () => {
    const regs = (await cf('GET', `/zones/${zona.id}/dns_records?name=${encodeURIComponent(`www.${dominio}`)}`)) ?? [];
    const reg = regs.find((r) => ['A', 'AAAA', 'CNAME'].includes(r.type));
    if (!reg) {
      if (escrever)
        await cf('POST', `/zones/${zona.id}/dns_records`, {
          type: 'AAAA',
          name: `www.${dominio}`,
          content: WWW_DESCARTE,
          proxied: true,
          ttl: 1,
          comment: 'Sintonia: só para o 301 do www (a borda responde)',
        });
      return ok(`DNS: www criado com proxy (AAAA ${WWW_DESCARTE}, ${verbo})`);
    }
    if (reg.proxied) return ok(`DNS: www já existia com proxy (${reg.type} ${reg.content})`);
    if (escrever) await cf('PATCH', `/zones/${zona.id}/dns_records/${reg.id}`, { proxied: true });
    ok(`DNS: proxy ligado no www existente (${reg.type} ${reg.content}, ${verbo})`);
  });

  for (const [id, valor, rotulo] of CONFIG_ZONA) {
    await passo(rotulo, async () => {
      const atual = await cf('GET', `/zones/${zona.id}/settings/${id}`);
      if (atual?.value === valor) return ok(`${rotulo}: já estava`);
      if (escrever) await cf('PATCH', `/zones/${zona.id}/settings/${id}`, { value: valor });
      ok(`${rotulo} (${verbo}; antes: ${JSON.stringify(atual?.value)})`);
    });
  }

  await passo('Smart Tiered Cache', async () => {
    const atual = await cf('GET', `/zones/${zona.id}/cache/tiered_cache_smart_topology_enable`);
    if (atual?.value === 'on') return ok('Smart Tiered Cache: já estava ligado');
    if (escrever) await cf('PATCH', `/zones/${zona.id}/cache/tiered_cache_smart_topology_enable`, { value: 'on' });
    ok(`Smart Tiered Cache ligado (${verbo})`);
  });

  await passo('Cabeçalhos de localização', async () => {
    const atual = await cf('GET', `/zones/${zona.id}/managed_headers`);
    const h = (atual?.managed_request_headers ?? []).find((x) => x.id === CABECALHO_LOCAL);
    if (h?.enabled) return ok('Transformação "Add visitor location headers": já estava ligada');
    if (escrever)
      await cf('PATCH', `/zones/${zona.id}/managed_headers`, {
        managed_request_headers: [{ id: CABECALHO_LOCAL, enabled: true }],
        managed_response_headers: [],
      });
    ok(`Transformação "Add visitor location headers" ligada (${verbo}; o app só soma UF e país, sem guardar nada da pessoa)`);
  });
}

async function desligar(zona) {
  await passo('Desligar as regras de cache', async () => {
    const ep = await entrypoint(zona.id, FASE_CACHE);
    const regras = ep.rules ?? [];
    const nossas = regras.filter(ehNossa);
    if (!nossas.length) return aviso('Nenhuma regra de cache do Sintonia na zona (nada a desligar).');
    const ligadas = nossas.filter((r) => r.enabled !== false);
    if (!ligadas.length) return ok('As regras de cache do Sintonia já estavam desligadas.');
    const novas = regras.map((r) => (ehNossa(r) ? { ...regraParaEnvio(r), enabled: false } : regraParaEnvio(r)));
    await cf('PUT', `/zones/${zona.id}/rulesets/phases/${FASE_CACHE}/entrypoint`, { rules: novas });
    ok(`Desligadas (não apagadas): ${ligadas.map((r) => `"${r.description ?? r.ref}"`).join(', ')}`);
    fraco('a borda volta ao padrão em segundos: a API deixa de ser guardada (tudo chega à VPS). Religar: --aplicar');
    fraco('o www (301), o Tiered Cache e as demais configurações da zona ficaram como estavam');
  });
}

async function conferirZona(zona, dominio) {
  const mesmoNome = (r, d) => (r.description ?? '').trim().toLowerCase() === d.description.toLowerCase();
  await passo('Regras de cache', async () => {
    const regras = (await entrypoint(zona.id, FASE_CACHE)).rules ?? [];
    const posicoes = [];
    let manuais = 0;
    for (const d of REGRAS_CACHE) {
      // a do script (ref sintonia_*) ou, feita pelo celular (§5.2), a de mesmo nome
      let a = regras.find((r) => r.ref === d.ref);
      if (!a && (a = regras.find((r) => !ehNossa(r) && mesmoNome(r, d)))) manuais++;
      if (a) posicoes.push(regras.indexOf(a));
      if (!a) falha(`Regra "${d.description}": AUSENTE (rode --aplicar, ou DEPLOY §5.2 passo 6)`);
      else if (a.enabled === false) falha(`Regra "${d.description}": DESLIGADA (--aplicar religa)`);
      else if (!regraIgual(a, d)) falha(`Regra "${d.description}": diferente da esperada (rode --aplicar; expressões no DEPLOY §5.3)`);
      else ok(`Regra "${d.description}"${ehNossa(a) ? '' : ' (feita pelo painel, igual à do script)'}`);
    }
    if (posicoes.some((p, i) => i > 0 && p < posicoes[i - 1])) falha('Regras de cache do Sintonia fora de ordem (têm de ser 1, 2, 3, 4; --aplicar arruma)');
    const sobra = regras.filter((r) => ehAntigaManual(r) && !REGRAS_CACHE.some((d) => mesmoNome(r, d))).length;
    if (sobra) falha(`${sobra} regra(s) "Sintonia…" antigas, feitas à mão, ainda na zona (duplicam as nossas; --aplicar substitui)`);
    if (manuais) fraco(`${manuais} regra(s) feitas pelo painel; um --aplicar as troca pelas do script (iguais), sem mudar nada na borda`);
    const outras = regras.filter((r) => !ehNossa(r) && !ehAntigaManual(r)).length;
    if (outras) aviso(`${outras} regra(s) de cache de outro dono na zona (confira se não guardam o que a regra 2 proíbe)`);
  });
  await passo('Redirecionamento do www', async () => {
    const w = regraWww(dominio);
    const lista = (await entrypoint(zona.id, FASE_REDIR)).rules ?? [];
    const a = lista.find((r) => r.ref === w.ref) ?? lista.find((r) => regraIgual({ ...r, description: w.description }, w));
    if (a && regraIgual({ ...a, description: w.description }, w)) ok(`Regra www → domínio (301)${a.ref === w.ref ? '' : ' (feita pelo painel)'}`);
    else falha(`Regra www → domínio (301): ${a ? (a.enabled === false ? 'desligada' : 'diferente') : 'ausente'}`);
  });
  await passo('DNS', async () => {
    const www = ((await cf('GET', `/zones/${zona.id}/dns_records?name=${encodeURIComponent(`www.${dominio}`)}`)) ?? []).find((r) => ['A', 'AAAA', 'CNAME'].includes(r.type));
    if (www?.proxied) ok(`DNS www com proxy (${www.type} ${www.content})`);
    else falha(`DNS www: ${www ? 'sem proxy (nuvem cinza)' : 'ausente'}`);
    const raiz = ((await cf('GET', `/zones/${zona.id}/dns_records?name=${encodeURIComponent(dominio)}`)) ?? []).filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type));
    if (!raiz.length) falha(`DNS ${dominio}: nenhum registro A/AAAA/CNAME`);
    else if (raiz.every((r) => r.proxied)) ok(`DNS ${dominio} com proxy (nuvem laranja)`);
    else falha(`DNS ${dominio}: registro SEM proxy (nuvem cinza) — nada passa pela borda`);
  });
  for (const [id, valor, rotulo] of CONFIG_ZONA) {
    await passo(rotulo, async () => {
      const a = await cf('GET', `/zones/${zona.id}/settings/${id}`);
      if (a?.value === valor) ok(rotulo);
      else falha(`${rotulo}: está ${JSON.stringify(a?.value)}`);
    });
  }
  await passo('Smart Tiered Cache', async () => {
    const a = await cf('GET', `/zones/${zona.id}/cache/tiered_cache_smart_topology_enable`);
    if (a?.value === 'on') ok('Smart Tiered Cache ligado');
    else falha(`Smart Tiered Cache: ${a?.value ?? '?'}`);
  });
  await passo('Cabeçalhos de localização', async () => {
    const a = await cf('GET', `/zones/${zona.id}/managed_headers`);
    if ((a?.managed_request_headers ?? []).some((x) => x.id === CABECALHO_LOCAL && x.enabled)) ok('"Add visitor location headers" ligada');
    else falha('"Add visitor location headers" desligada (a medição por UF/país fica "não informado")');
  });
  // só informativo (não muda nada): o DEPLOY §5 recomenda Full (strict) e "Sempre usar HTTPS" desligado
  await passo('SSL', async () => {
    const ssl = await cf('GET', `/zones/${zona.id}/settings/ssl`);
    if (ssl?.value === 'strict') ok('SSL/TLS: Completo (estrito)');
    else aviso(`SSL/TLS está "${ssl?.value}" (recomendado: Completo (estrito); nunca Flexível)`);
  });
}

// ---- --conferir pela borda (sem chave) -------------------------------------------------------------------------------

const ORIGEM_TESTE = process.env.CF_CONFERIR_ORIGEM ? new URL(process.env.CF_CONFERIR_ORIGEM) : null;
const UA = 'Mozilla/5.0 (compatible; sintonia-conferir/1; +deploy/cloudflare.mjs)';

/** GET pela borda (ou pela origem de teste, mandando o Host do domínio). Nunca segue redirecionamento. */
export function pedir(url, { corpo = false, aceitar = '*/*' } = {}) {
  const u = new URL(url);
  const alvo = ORIGEM_TESTE ?? u;
  const mod = alvo.protocol === 'https:' ? https : http;
  return new Promise((res, rej) => {
    const req = mod.request(
      {
        host: alvo.hostname,
        port: alvo.port || (alvo.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        servername: u.hostname,
        headers: { host: u.host, 'user-agent': UA, accept: aceitar, 'accept-encoding': 'gzip, br' },
        timeout: 15_000,
      },
      (r) => {
        const partes = [];
        let n = 0;
        r.on('data', (b) => {
          if (corpo && n < 4_000_000) partes.push(b);
          n += b.length;
        });
        r.on('end', () => {
          let texto = '';
          if (corpo) {
            let buf = Buffer.concat(partes);
            try {
              const enc = String(r.headers['content-encoding'] ?? '');
              if (enc === 'gzip') buf = gunzipSync(buf);
              else if (enc === 'br') buf = brotliDecompressSync(buf);
            } catch {
              /* corpo truncado: segue com o que veio */
            }
            texto = buf.toString('utf8');
          }
          res({ status: r.statusCode ?? 0, h: r.headers, texto });
        });
        r.on('error', rej);
      },
    );
    req.on('timeout', () => req.destroy(new Error('tempo esgotado (15 s)')));
    req.on('error', (e) => rej(new Error(e.code ? `${e.code}` : e.message)));
    req.end();
  });
}

const st = (r) => String(r.h['cf-cache-status'] ?? '(sem cf-cache-status)').toUpperCase();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pede até `tentativas` vezes (depois do 1º) até o cf-cache-status cair em `aceitos`. Devolve a sequência. */
async function repetirAte(url, aceitos, tentativas = 3, opcoes = {}) {
  const seq = [];
  let ultimo = null;
  for (let i = 0; i <= tentativas; i++) {
    ultimo = await pedir(url, opcoes);
    seq.push(st(ultimo));
    if (i > 0 && aceitos.has(st(ultimo))) return { ok: true, seq, r: ultimo };
    await esperar(i === 0 ? 300 : 700);
  }
  return { ok: false, seq, r: ultimo };
}

async function conferirBorda(dominio) {
  const base = `https://${dominio}`;
  info(`Pela borda: ${base}${ORIGEM_TESTE ? ` (teste: conectando em ${ORIGEM_TESTE.host})` : ''}`);
  // 0. passa pela Cloudflare?
  let r0;
  try {
    r0 = await pedir(`${base}/api/status`);
  } catch (e) {
    return falha(`${base}/api/status não respondeu (${e.message})`);
  }
  if (!r0.h['cf-ray'] && !/cloudflare/i.test(String(r0.h.server ?? ''))) {
    return falha(`${dominio} NÃO passa pela Cloudflare (sem cf-ray): o registro DNS está com a nuvem cinza? Nada abaixo vale sem o proxy.`);
  }
  if (r0.status === 403 && r0.h['cf-mitigated']) return falha('A Cloudflare desafiou este pedido (Bot Fight Mode / "Estou sob ataque"?): desligue para a API do Sintonia.');

  // 1. /api/status guardado (regra 1 + cabeçalho da origem)
  const s = await repetirAte(`${base}/api/status`, GUARDANDO);
  const det = `cf-cache-status ${s.seq.join(' → ')} · age ${s.r.h.age ?? '—'} · cache-control "${s.r.h['cache-control'] ?? ''}"`;
  if (s.ok) ok(`/api/status guardado na borda (${det})`);
  else falha(`/api/status NÃO está sendo guardado (${det}) — regra 1 ausente ou desligada?`);

  // 2. regra 3: query fora da chave — um ?x= NOVO tem de cair na cópia do /api/status (sem a regra, seria MISS)
  const qs = [];
  let qOk = false;
  for (let i = 0; i < 2 && !qOk; i++) {
    await pedir(`${base}/api/status`);
    const r = await pedir(`${base}/api/status?conferir=${Date.now().toString(36)}${i}`);
    qs.push(st(r));
    qOk = GUARDANDO.has(st(r));
  }
  if (qOk) ok(`/api/status?x=… usa a mesma cópia (regra 3; ${qs.join(', ')})`);
  else falha(`/api/status?x=… virou outra cópia (${qs.join(', ')}) — regra 3 ausente ou desligada?`);

  // 3. nunca guardados (regra 2)
  for (const p of ['/api/admin/state', '/api/anuncio/ir/x', '/api/saude-noite', '/healthz']) {
    const seq = [];
    let bom = true;
    for (let i = 0; i < 2; i++) {
      const r = await pedir(base + p);
      seq.push(`${r.status} ${st(r)}`);
      if (!NUNCA.has(st(r))) bom = false;
    }
    if (bom) ok(`${p} nunca guardado (${seq.join(' → ')})`);
    else falha(`${p} passou pela cópia da borda (${seq.join(' → ')}) — tem de ser BYPASS ou DYNAMIC (regra 2)`);
  }

  // 4. HTML: arquivos /assets e o script de medição da Cloudflare
  let html;
  try {
    html = await pedir(`${base}/`, { corpo: true, aceitar: 'text/html' });
  } catch (e) {
    falha(`/ não respondeu (${e.message})`);
  }
  if (html) {
    const sHtml = st(html);
    if (GUARDANDO.has(sHtml) || sHtml === 'MISS') fraco(`HTML (/): ${sHtml} — a chave "html-borda" está LIGADA (normal só de 24/10 12h em diante)`);
    else fraco(`HTML (/): ${sHtml} — a borda não guarda as páginas (chave "html-borda" desligada: normal até 24/10)`);
    if (/cloudflareinsights/i.test(html.texto)) falha('A Cloudflare injeta o Web Analytics (cloudflareinsights) nas páginas: desligue (DEPLOY §5, CHECKLIST A3.9)');
    else ok('Sem script de medição da Cloudflare nas páginas');
    const asset = /["'](\/assets\/[^"'?#]+\.(?:js|css))["']/.exec(html.texto)?.[1];
    if (!asset) falha('Não achei nenhum /assets/*.js no HTML da página inicial');
    else {
      const a = await repetirAte(base + asset, new Set(['HIT']));
      if (a.ok) ok(`${asset} guardado (${a.seq.join(' → ')})`);
      else falha(`${asset} não ficou HIT (${a.seq.join(' → ')})`);
    }
  }

  // 5. www → 301 para o domínio, mantendo caminho e query
  try {
    const w = await pedir(`https://www.${dominio}/apuracao?conferir=1`);
    const esperado = `${base}/apuracao?conferir=1`;
    if (w.status === 301 && w.h.location === esperado) ok(`www → 301 ${esperado}`);
    else falha(`www respondeu ${w.status}${w.h.location ? ` → ${w.h.location}` : ''} (esperado 301 → ${esperado})`);
  } catch (e) {
    falha(`www.${dominio} não respondeu (${e.message}) — o DNS do www existe com proxy?`);
  }
}

// ---- --purgar ----------------------------------------------------------------------------------------------------------

async function purgar(zona, dominio, caminhos) {
  if (!caminhos.length) throw new ErroUso('Diga o que tirar da borda, ex.: --purgar /robots.txt /sitemap.xml');
  const urls = caminhos.map((p) => {
    if (/^https?:\/\//.test(p)) return p;
    if (!p.startsWith('/')) throw new ErroUso(`Caminho inválido: ${p} (comece com /)`);
    return `https://${dominio}${p}`;
  });
  if (urls.length > 30) throw new ErroUso('No máximo 30 endereços por vez.');
  await passo('Limpar da borda', async () => {
    await cf('POST', `/zones/${zona.id}/purge_cache`, { files: urls });
    ok(`Limpos da borda: ${urls.join(' ')}`);
  });
}

// ---- principal -----------------------------------------------------------------------------------------------------------

function ajuda() {
  const texto = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const bloco = texto.slice(texto.indexOf('/**') + 3, texto.indexOf('*/'));
  console.log(bloco.split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
}

function mostrar(dominio) {
  console.log('Regras de cache (Caching → Cache Rules), nesta ordem:\n');
  REGRAS_CACHE.forEach((r, i) => {
    console.log(`${i + 1}. ${r.description}\n   expressão: ${r.expression}\n   configuração: ${JSON.stringify(r.action_parameters)}\n`);
  });
  const w = regraWww(dominio || 'seu-dominio');
  console.log(`Redirecionamento (Rules → Redirect Rules):\n   ${w.description}\n   expressão: ${w.expression}\n   destino: ${JSON.stringify(w.action_parameters.from_value)}`);
}

export async function principal(argv) {
  FALHAS = 0;
  let a;
  try {
    a = lerArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (!a.acao || a.acao === 'ajuda') {
    ajuda();
    return a.acao ? 0 : 2;
  }
  let dominio = (a.dominio ?? dominioPadrao() ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null;
  if (a.acao === 'mostrar') {
    mostrar(dominio);
    return 0;
  }
  const precisaChave = a.acao !== 'conferir';
  if (precisaChave && !TOKEN) {
    console.error(`--${a.acao} precisa da chave da API no ambiente: read -rs CF_API_TOKEN && export CF_API_TOKEN (DEPLOY.md §5.1). Sem chave: --conferir, ou o passo a passo pelo celular (DEPLOY.md §5.2).`);
    return 2;
  }
  try {
    if (a.acao === 'aplicar' && !a.simular && !a.forcar) {
      const agora = process.env.CF_AGORA ? Date.parse(process.env.CF_AGORA) : Date.now();
      if (agora >= CONGELA_DE && agora < CONGELA_ATE) {
        console.error('Congelamento da noite (24/10 12h → 26/10 6h): nada de mudar a borda agora. Emergência: --desligar (sempre liberado). Se tiver certeza: --aplicar --forcar.');
        return 2;
      }
    }
    let zona = null;
    if (TOKEN) {
      info('Zona');
      zona = await acharZona(dominio);
      if (!dominio) dominio = zona.nome;
      if (dominio !== zona.nome) throw new ErroUso(`A zona da chave é ${zona.nome}, não ${dominio}.`);
      ok(`${zona.nome} (plano ${zona.plano ?? '?'}, ${zona.status === 'active' ? 'ativa' : `status "${zona.status}"`})`);
      if (zona.status && zona.status !== 'active') aviso('A zona ainda não está ativa (nameservers trocados no registrador?): a borda não atende antes disso.');
      await validadeChave();
    }
    if (!dominioValido(dominio)) throw new ErroUso('Informe o domínio: --dominio=seu-dominio.com.br');

    if (a.acao === 'aplicar') {
      info(a.simular ? 'Simulação (nada é gravado)' : 'Aplicando');
      await aplicar(zona, dominio, a.simular);
      if (!a.simular && !FALHAS) fraco(`confira daqui a ~30 s: node deploy/cloudflare.mjs --conferir --dominio=${dominio}`);
    } else if (a.acao === 'desligar') {
      info('Desligando as regras de cache do Sintonia');
      await desligar(zona);
    } else if (a.acao === 'purgar') {
      info('Limpando endereços da borda');
      await purgar(zona, dominio, a.caminhos);
    } else if (a.acao === 'conferir') {
      await conferirBorda(dominio);
      if (zona) {
        info('Configuração da zona (com a chave)');
        await conferirZona(zona, dominio);
      } else fraco('sem CF_API_TOKEN: conferi só pela borda (a configuração da zona não foi lida)');
    }
  } catch (e) {
    if (e instanceof ErroUso) {
      console.error(e.message);
      return 2;
    }
    falha(explicar(e, 'Cloudflare'));
  }
  if (FALHAS) {
    console.log(c(31, `\n${FALHAS} problema(s). ${a.acao === 'aplicar' ? 'O que falhou pode ser feito pelo celular: DEPLOY.md §5.2.' : ''}`.trimEnd()));
    return 1;
  }
  console.log(c(32, a.simular ? '\nSimulação terminada: nada foi gravado (sem --simular, o --aplicar faz o que está acima).' : '\nTudo certo.'));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // saída cortada (ex.: "| head"): sai quieto em vez de despejar um erro de EPIPE
  process.stdout.on('error', (e) => (e.code === 'EPIPE' ? process.exit(FALHAS ? 1 : 0) : undefined));
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (e) => {
      console.error(semChave(e?.stack ?? e));
      process.exit(1);
    },
  );
}
