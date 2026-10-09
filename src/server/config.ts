/**
 * Configuração do servidor a partir de variáveis de ambiente (ver README.md, seção "Deploy").
 *
 *   PORT              porta HTTP (padrão 8787)
 *   HOST              interface (padrão 0.0.0.0)
 *   NODE_ENV          'production' ativa: dist/, cookie Secure, HSTS e exigência de ADMIN_PASSWORD
 *   DATA_DIR          diretório com meta.json e uf/*.json (padrão public/data em dev, dist/data em produção)
 *   DIST_DIR          build do app servido em produção (padrão dist)
 *   STATE_DIR         onde o AdminState é persistido (padrão .server-state)
 *   ADMIN_PASSWORD    senha do painel (dev sem ela: 'sintonia' + aviso; produção sem ela: admin desabilitado)
 *   ADMIN_SECRET      segredo do cookie de sessão (HMAC-SHA256); ausente → aleatório por processo
 *   PUBLIC_URL        origem pública (https://sintonia.app) para og:image/og:url; ausente → Host da requisição
 *   TRUST_PROXY       '1' → IP do cliente pelo X-Forwarded-For/CF-Connecting-IP (atrás de CDN/proxy)
 *   SIM_AUTOSTART     '1' → sobe em fonte 'simulacao' a 20× (se não houver simulação/TSE já em curso);
 *                     'force' → sempre reinicia a simulação ao subir
 *   SERVE_STATIC      '1'/'0' força servir (ou não) o DIST_DIR (padrão: só em produção)
 */
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export interface ServerConfig {
  producao: boolean;
  port: number;
  host: string;
  dataDir: string;
  distDir: string;
  serveStatic: boolean;
  stateDir: string;
  /** null → admin desabilitado (produção sem ADMIN_PASSWORD) */
  adminPassword: string | null;
  /** true quando a senha é o padrão de desenvolvimento */
  adminPasswordPadrao: boolean;
  adminSecret: Buffer;
  /** true quando ADMIN_SECRET não foi definido (sessões caem a cada reinício) */
  adminSecretEfemero: boolean;
  publicUrl: string | null;
  trustProxy: boolean;
  simAutostart: 'nao' | 'auto' | 'force';
  /** Avisos de configuração (vão para o log na subida). */
  avisos: string[];
}

export const SENHA_DEV = 'sintonia';

type Env = Record<string, string | undefined>;

const sim = (v: string | undefined) => v !== undefined && /^(1|true|sim|yes|on)$/i.test(v.trim());

export function loadConfig(env: Env = process.env, cwd = process.cwd()): ServerConfig {
  const producao = env.NODE_ENV === 'production';
  const avisos: string[] = [];

  const portRaw = Number(env.PORT ?? 8787);
  const port = Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : 8787;
  if (env.PORT && port !== portRaw) avisos.push(`PORT inválida (${env.PORT}); usando 8787`);

  const distDir = resolve(cwd, env.DIST_DIR || 'dist');
  const dataDir = resolve(cwd, env.DATA_DIR || (producao ? `${env.DIST_DIR || 'dist'}/data` : 'public/data'));
  const stateDir = resolve(cwd, env.STATE_DIR || '.server-state');

  let adminPassword: string | null = env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length > 0 ? env.ADMIN_PASSWORD : null;
  let adminPasswordPadrao = false;
  if (!adminPassword) {
    if (producao) {
      avisos.push('ADMIN_PASSWORD ausente em produção: painel de administração DESABILITADO (rotas /api/admin → 503)');
    } else {
      adminPassword = SENHA_DEV;
      adminPasswordPadrao = true;
      avisos.push(`ADMIN_PASSWORD ausente: usando a senha de desenvolvimento '${SENHA_DEV}' (NÃO use em produção)`);
    }
  } else if (producao && adminPassword.length < 12) {
    avisos.push('ADMIN_PASSWORD tem menos de 12 caracteres: use uma senha longa e aleatória em produção');
  }

  let adminSecret: Buffer;
  let adminSecretEfemero = false;
  if (env.ADMIN_SECRET && env.ADMIN_SECRET.length >= 16) {
    adminSecret = Buffer.from(env.ADMIN_SECRET, 'utf8');
  } else {
    if (env.ADMIN_SECRET) avisos.push('ADMIN_SECRET curto demais (< 16 caracteres): ignorado');
    adminSecret = randomBytes(32);
    adminSecretEfemero = true;
    if (producao) avisos.push('ADMIN_SECRET ausente: segredo aleatório por processo (sessões do admin caem a cada reinício/instância)');
  }

  const auto = (env.SIM_AUTOSTART ?? '').trim().toLowerCase();
  const simAutostart: ServerConfig['simAutostart'] = auto === 'force' ? 'force' : sim(auto) ? 'auto' : 'nao';

  const serveStatic = env.SERVE_STATIC !== undefined ? sim(env.SERVE_STATIC) : producao;

  let publicUrl: string | null = null;
  if (env.PUBLIC_URL) {
    try {
      const u = new URL(env.PUBLIC_URL);
      publicUrl = `${u.protocol}//${u.host}`;
    } catch {
      avisos.push(`PUBLIC_URL inválida (${env.PUBLIC_URL}): ignorada`);
    }
  }

  return {
    producao,
    port,
    host: env.HOST || '0.0.0.0',
    dataDir,
    distDir,
    serveStatic,
    stateDir,
    adminPassword,
    adminPasswordPadrao,
    adminSecret,
    adminSecretEfemero,
    publicUrl,
    trustProxy: sim(env.TRUST_PROXY),
    simAutostart,
    avisos,
  };
}
