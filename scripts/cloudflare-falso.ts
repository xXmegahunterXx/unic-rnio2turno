/**
 * Cloudflare FALSA para testar o `deploy/cloudflare.mjs` sem tocar na conta de verdade: a API v4 (o pedaço que o
 * script usa, com as validações que a API real faz e mais algumas estritas de propósito) e uma "borda" que imita o
 * `cf-cache-status` conforme as regras gravadas. Usada por `scripts/cloudflare.test.ts`; também roda sozinha:
 *
 *   npx tsx scripts/cloudflare-falso.ts --porta=8902 [--dominio=sintonia2026.com.br] [--token=…]
 *   CF_API_BASE=http://127.0.0.1:8902/client/v4 CF_CONFERIR_ORIGEM=http://127.0.0.1:8902 \
 *   CF_API_TOKEN=… CF_ZONE_ID=… node deploy/cloudflare.mjs --aplicar
 *
 * A borda falsa é simples de propósito: guarda por 1 s o que a regra 1 deixa (a 3 tira a query da chave), nunca guarda
 * o que a 2 marca, guarda `/assets/*` sempre (como a Cloudflare faz com .js/.css) e responde o www com 301 só com a
 * regra de redirecionamento e o DNS do www com proxy.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

type Json = Record<string, unknown>;
export interface Regra extends Json {
  id: string;
  ref?: string;
  description?: string;
  expression: string;
  action: string;
  action_parameters?: Json;
  enabled?: boolean;
  version?: string;
  last_updated?: string;
}
interface RegistroDns extends Json {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl?: number;
  comment?: string;
}
export interface EstadoFalso {
  rulesets: Record<string, { id: string; phase: string; rules: Regra[]; version: number }>;
  dns: RegistroDns[];
  settings: Record<string, unknown>;
  tiered: string;
  managed: { managed_request_headers: { id: string; enabled: boolean }[]; managed_response_headers: { id: string; enabled: boolean }[] };
  purgas: string[];
  /** "MÉTODO /caminho" de cada pedido à API (sem a base) */
  chamadas: string[];
  /** corpos crus recebidos (para conferir que a chave nunca vai num corpo) */
  corpos: string[];
  /** "MÉTODO /prefixo" que respondem 403 (chave sem permissão) */
  negar: string[];
  /** a borda injeta o script do Web Analytics no HTML */
  insights: boolean;
  /** a borda NÃO passa pela Cloudflare (nuvem cinza): sem cf-ray */
  semProxy: boolean;
  /** HTML com o cabeçalho da borda (chave html-borda ligada) */
  htmlBorda: boolean;
  /** modo "mini-CDN" (opção `origem`): pedidos que a borda falsa levou à origem de verdade */
  origemPedidos: number;
}

export interface OpcoesFalso {
  token?: string;
  zonaId?: string;
  dominio?: string;
  /**
   * Origem de verdade (ex.: http://127.0.0.1:8901, o servidor de produção local): a borda falsa vira uma mini-CDN que
   * repassa os pedidos e guarda as respostas como a Cloudflare faria com as regras gravadas — TTL do
   * `Cloudflare-CDN-Cache-Control` (ou do `s-maxage`), `stale-while-revalidate` (UPDATING) e um pedido só à origem por
   * cópia vencida. Serve para ensaiar o scripts/ensaio-borda.ts sem a Cloudflare.
   */
  origem?: string;
}

/** TTL e janela de "servir velho enquanto renova" de uma resposta, pelo cabeçalho da borda (ou o Cache-Control). */
export function ttlDaBorda(cabecalhos: http.IncomingHttpHeaders): { ttl: number; swr: number } | null {
  const borda = cabecalhos['cloudflare-cdn-cache-control'];
  const cc = String(borda ?? cabecalhos['cache-control'] ?? '').toLowerCase();
  if (!cc || /no-store|no-cache|private/.test(cc)) return null;
  const n = (k: string) => {
    const m = new RegExp(`(?:^|[,\\s])${k}=(\\d+)`).exec(cc);
    return m ? Number(m[1]) : null;
  };
  const ttl = borda ? n('max-age') : (n('s-maxage') ?? n('max-age'));
  if (ttl === null || ttl <= 0) return null;
  return { ttl: ttl * 1000, swr: (n('stale-while-revalidate') ?? 0) * 1000 };
}

const hex = (n: number) => randomBytes(n).toString('hex');
const erro = (status: number, code: number, message: string) => ({ status, corpo: { success: false, errors: [{ code, message }], messages: [], result: null } });
const certo = (result: unknown) => ({ status: 200, corpo: { success: true, errors: [], messages: [], result } });

const TTL_NAVEGADOR = [0, 30, 60, 120, 300, 1200, 1800, 3600, 7200, 10800, 14400, 18000, 28800, 43200, 57600, 72000, 86400, 172800, 259200, 345600, 432000, 691200, 1382400, 2073600, 2678400, 5356800, 16070400, 31536000];
const CHAVES_CACHE = new Set(['cache', 'edge_ttl', 'browser_ttl', 'cache_key', 'serve_stale', 'respect_strong_etags', 'origin_error_page_passthru', 'origin_cache_control', 'read_timeout', 'cache_reserve', 'additional_cacheable_ports']);
const SO_LEITURA = ['version', 'last_updated', 'categories'];

/** Validação de uma regra recebida num PUT (o que a API real recusaria, e um pouco mais estrita). */
function validarRegra(fase: string, r: Json, existentes: Regra[]): string | null {
  if (typeof r.expression !== 'string' || !r.expression.trim()) return 'expression obrigatória';
  let prof = 0;
  for (const ch of r.expression) {
    if (ch === '(') prof++;
    if (ch === ')' && --prof < 0) return 'parênteses desbalanceados';
  }
  if (prof !== 0) return 'parênteses desbalanceados';
  if ((r.expression.match(/"/g) ?? []).length % 2) return 'aspas desbalanceadas';
  for (const k of SO_LEITURA) if (k in r) return `campo somente leitura: ${k}`;
  if (r.id !== undefined && !existentes.some((e) => e.id === r.id)) return `regra ${String(r.id)} não existe neste ruleset`;
  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') return 'enabled deve ser booleano';
  const ap = (r.action_parameters ?? {}) as Json;
  if (fase === 'http_request_cache_settings') {
    if (r.action !== 'set_cache_settings') return `ação inválida nesta fase: ${String(r.action)}`;
    for (const k of Object.keys(ap)) if (!CHAVES_CACHE.has(k)) return `parâmetro desconhecido: ${k}`;
    if (typeof ap.cache !== 'boolean') return 'cache deve ser booleano';
    if (ap.cache === false && Object.keys(ap).length > 1) return 'com cache=false não vão outros parâmetros';
    const edge = ap.edge_ttl as Json | undefined;
    if (edge) {
      if (!['respect_origin', 'bypass_by_default', 'override_origin'].includes(String(edge.mode))) return `edge_ttl.mode inválido: ${String(edge.mode)}`;
      if (edge.mode === 'override_origin' && typeof edge.default !== 'number') return 'override_origin exige default';
    }
    const nav = ap.browser_ttl as Json | undefined;
    if (nav && !['respect_origin', 'bypass_by_default', 'override_origin', 'bypass'].includes(String(nav.mode))) return `browser_ttl.mode inválido: ${String(nav.mode)}`;
    const qs = ((ap.cache_key as Json | undefined)?.custom_key as Json | undefined)?.query_string as Json | undefined;
    if (qs) {
      const lados = Object.keys(qs);
      if (lados.length !== 1 || !['include', 'exclude'].includes(lados[0])) return 'query_string: use include OU exclude';
      const v = qs[lados[0]] as Json;
      const okAll = v && v.all === true && Object.keys(v).length === 1;
      const okList = v && Array.isArray(v.list) && Object.keys(v).length === 1;
      if (!okAll && !okList) return 'query_string: {all: true} ou {list: [...]}';
    }
  } else if (fase === 'http_request_dynamic_redirect') {
    if (r.action !== 'redirect') return `ação inválida nesta fase: ${String(r.action)}`;
    const fv = ap.from_value as Json | undefined;
    if (!fv || ![301, 302, 303, 307, 308].includes(Number(fv.status_code))) return 'from_value.status_code inválido';
    const t = fv.target_url as Json | undefined;
    if (!t || (typeof t.value !== 'string' && typeof t.expression !== 'string')) return 'from_value.target_url inválido';
    if (fv.preserve_query_string !== undefined && typeof fv.preserve_query_string !== 'boolean') return 'preserve_query_string deve ser booleano';
  } else return `fase não suportada aqui: ${fase}`;
  return null;
}

/** Caminhos de cada regra do Sintonia, para a borda falsa (o teste não avalia a expressão: confia na ref). */
const REGRA1 = (p: string) =>
  p.startsWith('/api/apuracao/') ||
  ['/api/status', '/api/meta', '/api/chat', '/api/divulgacao', '/api/live/agora', '/api/anuncio/img'].includes(p) ||
  ['/api/og/', '/api/patrocinio/', '/api/texto/', '/data/', '/geo/'].some((x) => p.startsWith(x));
const REGRA2 = (p: string) =>
  p.startsWith('/api/admin') ||
  p.startsWith('/admin') ||
  ['/healthz', '/api/anuncio/evento', '/api/audiencia', '/api/saude-noite', '/api/live/batimento'].includes(p) ||
  ['/api/anuncio/ir/', '/api/chat/', '/api/anuncie/'].some((x) => p.startsWith(x));
const REGRA3 = (p: string) => ['/api/status', '/api/meta', '/api/chat', '/api/divulgacao'].includes(p);
const REGRA4 = (p: string) => !p.startsWith('/api/') && !p.startsWith('/admin') && !p.startsWith('/embed') && p !== '/healthz';

export function criarCloudflareFalso(op: OpcoesFalso = {}) {
  const token = op.token ?? 'chave-falsa-de-teste-0123456789';
  const zonaId = op.zonaId ?? '0123456789abcdef0123456789abcdef';
  const dominio = op.dominio ?? 'sintonia2026.com.br';
  const estado: EstadoFalso = {
    rulesets: {},
    dns: [{ id: hex(16), type: 'A', name: dominio, content: '203.0.113.10', proxied: true, ttl: 1 }],
    settings: { browser_cache_ttl: 14400, always_online: 'on', rocket_loader: 'on', ssl: 'strict', always_use_https: 'off' },
    tiered: 'off',
    managed: {
      managed_request_headers: [
        { id: 'add_visitor_location_headers', enabled: false },
        { id: 'remove_visitor_ip_headers', enabled: false },
      ],
      managed_response_headers: [{ id: 'add_security_headers', enabled: false }],
    },
    purgas: [],
    chamadas: [],
    corpos: [],
    negar: [],
    insights: false,
    semProxy: false,
    htmlBorda: false,
    origemPedidos: 0,
  };
  /** cópia guardada na borda falsa: chave → instante */
  const copias = new Map<string, number>();

  /** nomes das regras do Sintonia: as feitas pelo painel (§5.2 do DEPLOY) não têm a ref do script, só o nome */
  const NOMES: Record<string, string> = {
    sintonia_api: 'Sintonia: API pública e dados',
    sintonia_nunca: 'Sintonia: nunca guardar',
    sintonia_sem_query: 'Sintonia: sem query',
    sintonia_html: 'Sintonia: páginas (HTML, só com a chave html-borda)',
  };
  const regraLigada = (fase: string, ref: string) =>
    !!estado.rulesets[fase]?.rules.some(
      (r) =>
        r.enabled !== false &&
        (r.ref === ref || (NOMES[ref] && r.description === NOMES[ref]) || (ref === 'sintonia_www' && r.expression.includes(`"www.${dominio}"`))),
    );

  function api(metodo: string, caminho: string, corpo: Json | null, auth: string | undefined) {
    if (auth !== `Bearer ${token}`) return erro(401, 10000, 'Authentication error');
    const chamada = `${metodo} ${caminho.split('?')[0]}`;
    if (estado.negar.some((n) => chamada.startsWith(n))) return erro(403, 9109, 'Unauthorized to access requested resource');
    const url = new URL(caminho, 'http://x');
    const p = url.pathname;
    if (metodo === 'GET' && p === '/user/tokens/verify') return certo({ id: hex(16), status: 'active', expires_on: '2026-10-19T12:00:00Z' });
    if (metodo === 'GET' && p === '/zones') return certo(url.searchParams.get('name') === dominio ? [{ id: zonaId, name: dominio, status: 'active', plan: { name: 'Free Website' } }] : []);
    const m = /^\/zones\/([^/]+)(\/.*)?$/.exec(p);
    if (!m) return erro(404, 7003, 'Could not route to ' + p);
    if (m[1] !== zonaId) return erro(404, 1001, 'Invalid zone identifier');
    const resto = m[2] ?? '';
    if (metodo === 'GET' && resto === '') return certo({ id: zonaId, name: dominio, status: 'active', plan: { name: 'Free Website' } });

    const rs = /^\/rulesets\/phases\/([a-z_]+)\/entrypoint$/.exec(resto);
    if (rs) {
      const fase = rs[1];
      const atual = estado.rulesets[fase];
      if (metodo === 'GET') return atual ? certo(structuredClone(atual)) : erro(404, 10003, `could not find entrypoint ruleset in the ${fase} phase`);
      if (metodo === 'PUT') {
        const regras = corpo?.rules;
        if (!Array.isArray(regras)) return erro(400, 20021, 'rules: deve ser uma lista');
        const refs = new Set<string>();
        for (const r of regras as Json[]) {
          const motivo = validarRegra(fase, r, atual?.rules ?? []);
          if (motivo) return erro(400, 20021, motivo);
          if (typeof r.ref === 'string') {
            if (refs.has(r.ref)) return erro(400, 20021, `ref duplicada: ${r.ref}`);
            refs.add(r.ref);
          }
        }
        const versao = (atual?.version ?? 0) + 1;
        const novas: Regra[] = (regras as Json[]).map((r) => {
          const id = typeof r.id === 'string' ? r.id : (atual?.rules.find((e) => e.ref && e.ref === r.ref)?.id ?? hex(16));
          return { ...(r as Regra), id, ref: typeof r.ref === 'string' ? r.ref : id, enabled: r.enabled !== false, version: String(versao), last_updated: new Date().toISOString() };
        });
        estado.rulesets[fase] = { id: atual?.id ?? hex(16), phase: fase, rules: novas, version: versao };
        return certo(structuredClone(estado.rulesets[fase]));
      }
    }
    if (resto === '/dns_records') {
      if (metodo === 'GET') {
        const nome = url.searchParams.get('name');
        return certo(structuredClone(estado.dns.filter((r) => !nome || r.name === nome)));
      }
      if (metodo === 'POST') {
        const r = corpo ?? {};
        if (!['A', 'AAAA', 'CNAME'].includes(String(r.type))) return erro(400, 9000, 'tipo inválido');
        if (typeof r.name !== 'string' || !(r.name === dominio || r.name.endsWith(`.${dominio}`))) return erro(400, 9000, 'nome fora da zona');
        if (r.type === 'AAAA' && !/^[0-9a-f:]+$/i.test(String(r.content))) return erro(400, 9005, 'conteúdo AAAA inválido');
        if (typeof r.proxied !== 'boolean') return erro(400, 9000, 'proxied deve ser booleano');
        if (typeof r.comment === 'string' && r.comment.length > 100) return erro(400, 9000, 'comentário > 100 caracteres');
        if (estado.dns.some((x) => x.name === r.name && x.type === 'CNAME')) return erro(400, 81053, 'já existe CNAME com este nome');
        const novo = { ...(r as RegistroDns), id: hex(16) };
        estado.dns.push(novo);
        return certo(structuredClone(novo));
      }
    }
    const dnsUm = /^\/dns_records\/([a-f0-9]+)$/.exec(resto);
    if (dnsUm && metodo === 'PATCH') {
      const reg = estado.dns.find((r) => r.id === dnsUm[1]);
      if (!reg) return erro(404, 81044, 'registro não encontrado');
      Object.assign(reg, corpo);
      return certo(structuredClone(reg));
    }
    const conf = /^\/settings\/([a-z_]+)$/.exec(resto);
    if (conf) {
      const id = conf[1];
      if (!(id in estado.settings)) return erro(404, 1003, 'configuração desconhecida');
      if (metodo === 'GET') return certo({ id, value: estado.settings[id], editable: true });
      if (metodo === 'PATCH') {
        const v = corpo?.value;
        if (id === 'browser_cache_ttl' && !TTL_NAVEGADOR.includes(Number(v))) return erro(400, 1007, 'valor inválido');
        if (['always_online', 'rocket_loader', 'always_use_https'].includes(id) && !['on', 'off'].includes(String(v))) return erro(400, 1007, 'valor inválido');
        estado.settings[id] = v;
        return certo({ id, value: v, editable: true });
      }
    }
    if (resto === '/cache/tiered_cache_smart_topology_enable') {
      if (metodo === 'GET') return certo({ id: 'tiered_cache_smart_topology_enable', value: estado.tiered, editable: true });
      if (metodo === 'PATCH') {
        if (!['on', 'off'].includes(String(corpo?.value))) return erro(400, 1007, 'valor inválido');
        estado.tiered = String(corpo?.value);
        return certo({ id: 'tiered_cache_smart_topology_enable', value: estado.tiered });
      }
    }
    if (resto === '/managed_headers') {
      if (metodo === 'GET') return certo(structuredClone(estado.managed));
      if (metodo === 'PATCH') {
        for (const lado of ['managed_request_headers', 'managed_response_headers'] as const) {
          const lista = corpo?.[lado];
          if (!Array.isArray(lista)) return erro(400, 20021, `${lado}: lista obrigatória`);
          for (const h of lista as Json[]) {
            const alvo = estado.managed[lado].find((x) => x.id === h.id);
            if (!alvo || typeof h.enabled !== 'boolean') return erro(400, 20021, `transformação desconhecida: ${String(h.id)}`);
            alvo.enabled = h.enabled;
          }
        }
        return certo(structuredClone(estado.managed));
      }
    }
    if (resto === '/purge_cache' && metodo === 'POST') {
      const arqs = corpo?.files;
      if (!Array.isArray(arqs) || !arqs.length || arqs.length > 30) return erro(400, 1012, 'files: 1 a 30');
      for (const f of arqs) if (typeof f !== 'string' || new URL(f).hostname !== dominio) return erro(400, 1012, 'endereço fora da zona');
      estado.purgas.push(...(arqs as string[]));
      for (const f of arqs as string[]) copias.delete(new URL(f).pathname);
      return certo({ id: hex(16) });
    }
    return erro(404, 7003, `Could not route to ${metodo} ${p}`);
  }

  /** A borda falsa: cf-cache-status conforme as regras gravadas. */
  // ---- mini-CDN (opção `origem`) ----
  interface Copia {
    status: number;
    cabecalhos: http.OutgoingHttpHeaders;
    corpo: Buffer;
    em: number;
    ttl: number;
    swr: number;
    renovando?: boolean;
  }
  const guardadas = new Map<string, Copia>();
  const emVoo = new Map<string, Promise<Copia>>();
  const agenteOrigem = new http.Agent({ keepAlive: true, maxSockets: 256 });
  function buscarOrigem(req: http.IncomingMessage, caminho: string, corpo?: Buffer): Promise<Copia> {
    const alvo = new URL(op.origem!);
    estado.origemPedidos++;
    return new Promise((res) => {
      const cab: http.OutgoingHttpHeaders = { ...req.headers, host: dominio, 'accept-encoding': 'gzip', 'x-forwarded-proto': 'https', 'cf-connecting-ip': '198.51.100.7' };
      delete cab.connection;
      const r = http.request({ host: alvo.hostname, port: alvo.port, path: caminho, method: req.method, headers: cab, agent: agenteOrigem }, (o) => {
        const partes: Buffer[] = [];
        o.on('data', (b: Buffer) => partes.push(b));
        o.on('end', () => {
          const t = ttlDaBorda(o.headers);
          const cabecalhos: http.OutgoingHttpHeaders = { ...o.headers };
          delete cabecalhos['cloudflare-cdn-cache-control']; // a Cloudflare consome e não repassa
          delete cabecalhos.connection;
          delete cabecalhos['keep-alive'];
          delete cabecalhos['transfer-encoding'];
          res({ status: o.statusCode ?? 502, cabecalhos, corpo: Buffer.concat(partes), em: Date.now(), ttl: t?.ttl ?? 0, swr: t?.swr ?? 0 });
        });
      });
      r.on('error', () => res({ status: 502, cabecalhos: { 'content-type': 'text/plain' }, corpo: Buffer.from('error code: 502'), em: Date.now(), ttl: 0, swr: 0 }));
      r.end(corpo);
    });
  }
  function proxiar(req: http.IncomingMessage, res: http.ServerResponse, h: Record<string, string>, chave: string | null, p: string, busca: string) {
    const caminho = p + busca;
    const responder = (c: Copia, status: string) => {
      const extra: http.OutgoingHttpHeaders = { ...c.cabecalhos, ...h };
      if (status) extra['cf-cache-status'] = status;
      if (status === 'HIT' || status === 'UPDATING') extra.age = String(Math.floor((Date.now() - c.em) / 1000));
      res.writeHead(c.status, extra);
      res.end(c.corpo);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const partes: Buffer[] = [];
      req.on('data', (b: Buffer) => partes.push(b));
      req.on('end', () => void buscarOrigem(req, caminho, Buffer.concat(partes)).then((c) => responder(c, 'DYNAMIC')));
      return;
    }
    if (!chave) return void buscarOrigem(req, caminho).then((c) => responder(c, chave === null ? 'DYNAMIC' : 'BYPASS'));
    const c = guardadas.get(chave);
    const idade = c ? Date.now() - c.em : 0;
    if (c && idade < c.ttl) return responder(c, 'HIT');
    if (c && idade < c.ttl + c.swr) {
      if (!c.renovando) {
        c.renovando = true;
        void buscarOrigem(req, caminho).then((n) => (n.ttl > 0 && n.status < 400 ? guardadas.set(chave, n) : guardadas.delete(chave)));
      }
      return responder(c, 'UPDATING');
    }
    // vencida ou nunca vista: um pedido só à origem por chave (os outros esperam a mesma resposta)
    let voo = emVoo.get(chave);
    const status = c ? 'EXPIRED' : 'MISS';
    if (!voo) {
      voo = buscarOrigem(req, caminho).then((n) => {
        emVoo.delete(chave);
        if (n.ttl > 0 && n.status < 400) guardadas.set(chave, n);
        else guardadas.delete(chave);
        return n;
      });
      emVoo.set(chave, voo);
    }
    void voo.then((n) => responder(n, n.ttl > 0 ? status : 'BYPASS'));
  }

  function borda(req: http.IncomingMessage, res: http.ServerResponse) {
    const host = String(req.headers.host ?? '').split(':')[0];
    const u = new URL(req.url ?? '/', 'http://x');
    const p = u.pathname;
    const h: Record<string, string> = estado.semProxy ? { server: 'nginx' } : { server: 'cloudflare', 'cf-ray': `${hex(8)}-GRU` };
    const enviar = (status: number, extra: Record<string, string>, corpo = '') => {
      res.writeHead(status, { ...h, ...extra });
      res.end(corpo);
    };
    if (op.origem && host === dominio) {
      const fase = 'http_request_cache_settings';
      let chave: string | null = null; // null = não elegível (DYNAMIC)
      if (REGRA2(p) && regraLigada(fase, 'sintonia_nunca')) chave = '';
      else if (REGRA1(p) && regraLigada(fase, 'sintonia_api')) chave = REGRA3(p) && regraLigada(fase, 'sintonia_sem_query') ? p : p + u.search;
      else if (p.startsWith('/assets/')) chave = p;
      else if (REGRA4(p) && regraLigada(fase, 'sintonia_html')) chave = p + u.search;
      return proxiar(req, res, h, chave, p, u.search);
    }
    if (host === `www.${dominio}`) {
      const www = estado.dns.find((r) => r.name === host);
      if (!estado.semProxy && www?.proxied && regraLigada('http_request_dynamic_redirect', 'sintonia_www')) return enviar(301, { location: `https://${dominio}${p}${u.search}` });
      return enviar(530, { 'content-type': 'text/plain' }, 'error code: 1016');
    }
    if (host !== dominio) return enviar(403, { 'content-type': 'text/plain' }, 'error code: 1003');
    const fase = 'http_request_cache_settings';
    const cc = p === '/api/status' ? 'public, max-age=0, s-maxage=1' : p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : REGRA2(p) ? 'no-store' : 'no-cache';
    let status = 'DYNAMIC';
    const guardar = (chave: string, ttlMs: number) => {
      const t = copias.get(chave);
      const agora = Date.now();
      if (t === undefined) {
        copias.set(chave, agora);
        return 'MISS';
      }
      if (agora - t < ttlMs) return 'HIT';
      copias.set(chave, agora);
      return 'EXPIRED';
    };
    if (estado.semProxy) status = '';
    else if (REGRA2(p)) status = regraLigada(fase, 'sintonia_nunca') ? 'BYPASS' : 'DYNAMIC';
    else if (p.startsWith('/assets/')) status = guardar(p, 365 * 86400_000);
    else if (REGRA1(p) && regraLigada(fase, 'sintonia_api')) status = guardar(REGRA3(p) && regraLigada(fase, 'sintonia_sem_query') ? p : p + u.search, 1000);
    else if (p === '/' && estado.htmlBorda && REGRA4(p) && regraLigada(fase, 'sintonia_html')) status = guardar(p + u.search, 15_000);
    if (status) h['cf-cache-status'] = status;
    if (p === '/' || p === '/apuracao') {
      const insights = estado.insights ? '<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>' : '';
      return enviar(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }, `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-Ab12Cd.js"></script>${insights}</head><body>Sintonia</body></html>`);
    }
    if (p.startsWith('/assets/')) return enviar(200, { 'content-type': 'text/javascript', 'cache-control': cc }, 'export {}');
    if (p === '/api/anuncio/ir/x') return enviar(302, { location: '/', 'cache-control': 'no-store' });
    if (p === '/api/admin/state') return enviar(401, { 'content-type': 'application/json', 'cache-control': 'no-store' }, '{"erro":"não autorizado"}');
    if (p === '/api/status' || p === '/api/saude-noite' || p === '/healthz') return enviar(200, { 'content-type': 'application/json', 'cache-control': cc }, '{"ok":true}');
    return enviar(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }, 'não encontrado');
  }

  const servidor = http.createServer((req, res) => {
    const caminho = req.url ?? '/';
    if (!caminho.startsWith('/client/v4/')) return borda(req, res);
    const partes: Buffer[] = [];
    req.on('data', (b: Buffer) => partes.push(b));
    req.on('end', () => {
      const cru = Buffer.concat(partes).toString('utf8');
      const metodo = req.method ?? 'GET';
      const sub = caminho.slice('/client/v4'.length);
      estado.chamadas.push(`${metodo} ${sub.split('?')[0]}`);
      if (cru) estado.corpos.push(cru);
      let corpo: Json | null = null;
      if (cru) {
        try {
          corpo = JSON.parse(cru) as Json;
        } catch {
          const e = erro(400, 6007, 'Malformed JSON in request body');
          res.writeHead(e.status, { 'content-type': 'application/json' });
          return res.end(JSON.stringify(e.corpo));
        }
      }
      const r = api(metodo, sub, corpo, req.headers.authorization);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.corpo));
    });
  });

  return {
    servidor,
    estado,
    token,
    zonaId,
    dominio,
    /** Escuta (porta 0 = qualquer livre) e devolve a porta. */
    ouvir: (porta = 0) => new Promise<number>((res) => servidor.listen(porta, '127.0.0.1', () => res((servidor.address() as AddressInfo).port))),
    fechar: () => new Promise<void>((res) => servidor.close(() => res())),
    /** Escritas na API (PUT/PATCH/POST) desde o início ou desde `desde`. */
    escritas: (desde = 0) => estado.chamadas.slice(desde).filter((c) => !c.startsWith('GET ')),
  };
}

// sozinho: npx tsx scripts/cloudflare-falso.ts --porta=8902
if (process.argv[1] && /cloudflare-falso\.ts$/.test(process.argv[1])) {
  const arg = (n: string) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3);
  const f = criarCloudflareFalso({ dominio: arg('dominio'), token: arg('token'), origem: arg('origem') });
  void f.ouvir(Number(arg('porta') ?? 8902)).then((porta) => {
    console.log(`Cloudflare falsa em http://127.0.0.1:${porta} (API em /client/v4, borda pelo Host)`);
    console.log(`  CF_API_BASE=http://127.0.0.1:${porta}/client/v4 CF_CONFERIR_ORIGEM=http://127.0.0.1:${porta}`);
    console.log(`  CF_API_TOKEN=${f.token} CF_ZONE_ID=${f.zonaId} (domínio ${f.dominio})`);
    if (arg('origem')) {
      console.log(`  mini-CDN na frente de ${arg('origem')}: a cada 10 s, pedidos que chegaram à origem`);
      let antes = 0;
      setInterval(() => {
        const n = f.estado.origemPedidos;
        console.log(`  origem: ${((n - antes) / 10).toFixed(1)} req/s (${n} no total)`);
        antes = n;
      }, 10_000);
    }
  });
}
