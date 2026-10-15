/**
 * Configuração do servidor a partir de variáveis de ambiente (README.md, "Variáveis de ambiente do servidor").
 *
 * Essenciais em produção (VPS):
 *   NODE_ENV          'production' ativa: serve dist/, cookie Secure, HSTS, CSP com upgrade-insecure-requests, logs em
 *                     JSON, troca automática para o TSE, trava da simulação e exige ADMIN_PASSWORD
 *   ADMIN_PASSWORD    senha do painel (dev sem ela: 'sintonia' + aviso; produção sem ela: admin desabilitado → 503).
 *                     Trocar a senha derruba as sessões abertas (a assinatura do cookie depende dela)
 *   ADMIN_SECRET      segredo do cookie de sessão (HMAC-SHA256, ≥ 16 caracteres); ausente → aleatório por processo
 *   PUBLIC_URL        origem pública (https://sintonia.app): og:image/og:url, sitemap.xml, robots.txt e a conferência de
 *                     origem (CSRF) do admin; ausente → Host da requisição (com aviso em produção)
 *   TRUST_PROXY       '1' atrás de proxy/CDN: IP do cliente por CF-Connecting-IP → Fly-Client-IP → X-Real-IP → o ÚLTIMO
 *                     endereço do X-Forwarded-For (o que o proxy viu; os anteriores podem vir forjados pelo cliente);
 *                     também aceita X-Forwarded-Proto/Host e um X-Request-Id bem formado
 *
 * Noite da eleição:
 *   TSE_AUTO          troca automática 'pre' → 'tse' no início da apuração (padrão: ligada em produção, desligada em dev).
 *                     Antes de trocar confere o feed do TSE; sem resposta, mantém 'pre' com o aviso público "aguardando os
 *                     primeiros dados do TSE" e tenta de novo (15 s, 30 s, 60 s, 120 s…). O admin vê, adia, antecipa
 *                     ou desliga (comando 'troca-auto')
 *   TSE_INICIO        horário da troca automática (ISO 8601, ex.: 2026-10-25T17:00:00-03:00 — o padrão). Use outro
 *                     horário para um ensaio; o admin pode mudar sem reiniciar
 *   ALLOW_SIMULACAO   '1' permite a fonte 'simulacao' em produção (demonstrações). Sem ela, em produção: comando
 *                     'fonte: simulacao' e "Iniciar" (a partir de 'pre') → 403, SIM_AUTOSTART ignorado e um estado
 *                     salvo em simulação volta para 'pre' na subida. Em dev a simulação é sempre permitida
 *   SIM_AUTOSTART     '1' → sobe em fonte 'simulacao' a 20× (se não houver simulação/TSE já em curso);
 *                     'force' → sempre reinicia a simulação ao subir. Em produção só com ALLOW_SIMULACAO=1
 *
 * Processo e arquivos:
 *   PORT / HOST       porta (8787) e interface (0.0.0.0)
 *   DATA_DIR          dataset (meta.json, uf/*.json); padrão public/data em dev, dist/data em produção
 *   DIST_DIR          build do app servido em produção (padrão dist)
 *   STATE_DIR         estado persistido (admin.json, tse-historico.json); padrão .server-state
 *   SERVE_STATIC      '1'/'0' força servir (ou não) o DIST_DIR (padrão: só em produção)
 *   FONTS_DIR         fontes TTF das imagens de compartilhamento (padrão dist-server/assets/fonts; ver og.ts)
 *   TWITTER_SITE      perfil do X (@sintonia) para a meta twitter:site dos cartões (opcional)
 *   ENCERRAMENTO_SEG  SIGTERM: segundos para drenar as conexões em andamento antes de fechar (padrão 8; 1–60)
 *   ADMIN_SESSAO_HORAS validade da sessão do admin (padrão 12; 1–72)
 *   OG_LIMITE_MIN     imagens de compartilhamento NOVAS (renderizações) por cliente por minuto (padrão 30; 0 = sem
 *                     limite). Imagem já em memória nunca conta — uma CDN pedindo a mesma imagem não é barrada
 *   CHAT_REGISTRO_CHAVE caminho de uma chave PÚBLICA RSA (PEM): liga o registro cifrado dos envios do chat (id, hora,
 *                     IP e porta; Marco Civil, art. 15) em STATE_DIR/chat-registro — DESLIGADO por padrão; só com
 *                     decisão do dono e do advogado (chat-registro.ts). A chave privada fica fora da VPS
 *   CHAT_REGISTRO_HEADER_PORTA cabeçalho com a porta de origem do visitante, quando o proxy a repassa (opcional)
 *
 * Log:
 *   LOG_FORMAT        'json' (padrão em produção: 1 objeto por linha) ou 'texto' (padrão em dev)
 *   LOG_AMOSTRA       fração das requisições "quentes" registradas (status, apuração, estáticos; padrão 0.01).
 *                     Erros 5xx, 429, respostas lentas (≥ 1 s) e o admin são SEMPRE registrados
 *   LOG_AMOSTRA_PAGINAS fração das páginas (HTML) registradas (padrão 0.1); as demais rotas (OG, meta…): todas
 *
 * Versão do build (cabeçalho x-sintonia-versao, /api/versao e /healthz):
 *   SINTONIA_COMMIT   commit do build (a imagem Docker grava a partir do build-arg GIT_COMMIT); GIT_COMMIT também vale
 *   SINTONIA_BUILD_DATE data do build (ISO; BUILD_DATE também vale)
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BuildInfo } from '../shared/api';
import { INICIO_APURACAO } from '../shared/constants';
import { normalizarTwitterSite } from './meta-tags';

export interface ServerConfig {
  producao: boolean;
  port: number;
  host: string;
  dataDir: string;
  distDir: string;
  serveStatic: boolean;
  stateDir: string;
  /** chave pública do registro de envios do chat (caminho; null = desligado — o padrão) */
  chatRegistroChave: string | null;
  /** cabeçalho com a porta de origem (atrás de proxy) */
  chatRegistroHeaderPorta: string | null;
  /** null → admin desabilitado (produção sem ADMIN_PASSWORD) */
  adminPassword: string | null;
  /** true quando a senha é o padrão de desenvolvimento */
  adminPasswordPadrao: boolean;
  adminSecret: Buffer;
  /** true quando ADMIN_SECRET não foi definido (sessões caem a cada reinício) */
  adminSecretEfemero: boolean;
  /** Validade da sessão do admin (ms). */
  sessaoMs: number;
  publicUrl: string | null;
  trustProxy: boolean;
  /** `@perfil` do X para twitter:site (TWITTER_SITE) ou null. */
  twitterSite: string | null;
  simAutostart: 'nao' | 'auto' | 'force';
  /** A fonte 'simulacao' pode ir ao ar (dev: sempre; produção: só com ALLOW_SIMULACAO=1). */
  permitirSimulacao: boolean;
  /** Troca automática 'pre' → 'tse' (TSE_AUTO). */
  tseAuto: boolean;
  /** Horário padrão da troca automática (TSE_INICIO; padrão 17h de 25/10/2026). */
  tseInicio: number;
  logFormato: 'json' | 'texto';
  /** Fração das requisições quentes registradas no log (0–1). */
  logAmostra: number;
  /** Fração das páginas HTML registradas no log (0–1). */
  logAmostraPaginas: number;
  /** Renderizações de imagem OG por cliente por minuto (0 = sem limite). */
  ogLimiteMin: number;
  /** Tempo máximo de drenagem no SIGTERM (ms). */
  encerramentoMs: number;
  build: BuildInfo;
  /** Avisos de configuração (vão para o log na subida). */
  avisos: string[];
}

export const SENHA_DEV = 'sintonia';

type Env = Record<string, string | undefined>;

const sim = (v: string | undefined) => v !== undefined && /^(1|true|sim|yes|on)$/i.test(v.trim());
const nao = (v: string | undefined) => v !== undefined && /^(0|false|nao|não|no|off)$/i.test(v.trim());

/** Número dentro de [min, max]; ausente → padrão; inválido → padrão + aviso. */
function numero(env: Env, nome: string, padrao: number, min: number, max: number, avisos: string[]): number {
  const raw = env[nome];
  if (raw === undefined || raw.trim() === '') return padrao;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    avisos.push(`${nome} inválido (${raw.slice(0, 20)}): use um número entre ${min} e ${max}; usando ${padrao}`);
    return padrao;
  }
  return n;
}

/** Versão do build: env (imagem Docker) → .git do diretório (dev) → 'dev'. */
export function lerBuild(env: Env, cwd: string): BuildInfo {
  let commit = (env.SINTONIA_COMMIT || env.GIT_COMMIT || env.SOURCE_COMMIT || '').trim();
  if (!commit) {
    try {
      const head = readFileSync(join(cwd, '.git', 'HEAD'), 'utf8').trim();
      const ref = /^ref: (.+)$/.exec(head)?.[1];
      commit = ref ? readFileSync(join(cwd, '.git', ref), 'utf8').trim() : head;
    } catch {
      commit = '';
    }
  }
  commit = /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 12).toLowerCase() : commit.replace(/[^\w.-]/g, '').slice(0, 40) || 'dev';
  let versao = '0.0.0';
  try {
    versao = String((JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { version?: string }).version ?? versao);
  } catch {
    /* sem package.json */
  }
  const dataRaw = (env.SINTONIA_BUILD_DATE || env.BUILD_DATE || '').trim();
  const data = dataRaw && Number.isFinite(Date.parse(dataRaw)) ? new Date(Date.parse(dataRaw)).toISOString() : null;
  return { commit, data, versao: versao.replace(/[^\w.+-]/g, '').slice(0, 32), node: process.versions.node };
}

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

  const permitirSimulacao = !producao || sim(env.ALLOW_SIMULACAO);

  const auto = (env.SIM_AUTOSTART ?? '').trim().toLowerCase();
  let simAutostart: ServerConfig['simAutostart'] = auto === 'force' ? 'force' : sim(auto) ? 'auto' : 'nao';
  if (simAutostart !== 'nao' && !permitirSimulacao) {
    avisos.push('SIM_AUTOSTART ignorado: em produção a simulação só vai ao ar com ALLOW_SIMULACAO=1');
    simAutostart = 'nao';
  }
  if (producao && permitirSimulacao) {
    avisos.push('ALLOW_SIMULACAO=1 em produção: o painel pode pôr números SIMULADOS no ar (sempre com a faixa "SIMULAÇÃO")');
  }

  const serveStatic = env.SERVE_STATIC !== undefined ? sim(env.SERVE_STATIC) : producao;

  let publicUrl: string | null = null;
  if (env.PUBLIC_URL) {
    try {
      const u = new URL(env.PUBLIC_URL);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo');
      publicUrl = `${u.protocol}//${u.host}`;
    } catch {
      avisos.push(`PUBLIC_URL inválida (${env.PUBLIC_URL.slice(0, 80)}): ignorada`);
    }
  }
  if (producao && !publicUrl) {
    avisos.push('PUBLIC_URL ausente em produção: og:url, sitemap e robots usam o Host de cada requisição (defina a URL pública)');
  }

  const twitterSite = normalizarTwitterSite(env.TWITTER_SITE);
  if (env.TWITTER_SITE && !twitterSite) avisos.push(`TWITTER_SITE inválido (${env.TWITTER_SITE.slice(0, 40)}): use o @perfil do X`);

  // ---- troca automática para o TSE ----
  const tseAuto = env.TSE_AUTO !== undefined && env.TSE_AUTO.trim() !== '' ? sim(env.TSE_AUTO) && !nao(env.TSE_AUTO) : producao;
  if (env.TSE_AUTO && !sim(env.TSE_AUTO) && !nao(env.TSE_AUTO)) avisos.push(`TSE_AUTO inválido (${env.TSE_AUTO.slice(0, 20)}): use 1 ou 0; desligado`);
  let tseInicio = INICIO_APURACAO;
  if (env.TSE_INICIO && env.TSE_INICIO.trim()) {
    const t = Date.parse(env.TSE_INICIO.trim());
    if (Number.isFinite(t) && t > Date.UTC(2020, 0, 1) && t < Date.UTC(2040, 0, 1)) tseInicio = t;
    else avisos.push(`TSE_INICIO inválido (${env.TSE_INICIO.slice(0, 40)}): use ISO 8601, ex. 2026-10-25T17:00:00-03:00; usando o padrão`);
  }

  // ---- log ----
  const fmt = (env.LOG_FORMAT ?? '').trim().toLowerCase();
  const logFormato: ServerConfig['logFormato'] = fmt === 'json' ? 'json' : fmt === 'texto' || fmt === 'text' ? 'texto' : producao ? 'json' : 'texto';
  if (fmt && fmt !== 'json' && fmt !== 'texto' && fmt !== 'text') avisos.push(`LOG_FORMAT inválido (${fmt.slice(0, 20)}): use json ou texto`);
  const logAmostra = numero(env, 'LOG_AMOSTRA', 0.01, 0, 1, avisos);
  const logAmostraPaginas = numero(env, 'LOG_AMOSTRA_PAGINAS', 0.1, 0, 1, avisos);

  const sessaoMs = numero(env, 'ADMIN_SESSAO_HORAS', 12, 1, 72, avisos) * 3600_000;
  const ogLimiteMin = Math.floor(numero(env, 'OG_LIMITE_MIN', 30, 0, 100_000, avisos));
  const encerramentoMs = numero(env, 'ENCERRAMENTO_SEG', 8, 1, 60, avisos) * 1000;

  return {
    producao,
    port,
    host: env.HOST || '0.0.0.0',
    dataDir,
    distDir,
    serveStatic,
    stateDir,
    chatRegistroChave: env.CHAT_REGISTRO_CHAVE?.trim() ? resolve(cwd, env.CHAT_REGISTRO_CHAVE.trim()) : null,
    chatRegistroHeaderPorta: /^[a-z0-9-]{1,64}$/i.test(env.CHAT_REGISTRO_HEADER_PORTA?.trim() ?? '') ? env.CHAT_REGISTRO_HEADER_PORTA!.trim().toLowerCase() : null,
    adminPassword,
    adminPasswordPadrao,
    adminSecret,
    adminSecretEfemero,
    sessaoMs,
    publicUrl,
    trustProxy: sim(env.TRUST_PROXY),
    twitterSite,
    simAutostart,
    permitirSimulacao,
    tseAuto,
    tseInicio,
    logFormato,
    logAmostra,
    logAmostraPaginas,
    ogLimiteMin,
    encerramentoMs,
    build: lerBuild(env, cwd),
    avisos,
  };
}

/** Motivo do bloqueio da simulação (null = permitida). */
export function motivoSemSimulacao(config: Pick<ServerConfig, 'permitirSimulacao'>): string | null {
  return config.permitirSimulacao
    ? null
    : 'Servidor em produção: a simulação só pode ir ao ar com ALLOW_SIMULACAO=1 nas variáveis do servidor (o público veria números fictícios).';
}
