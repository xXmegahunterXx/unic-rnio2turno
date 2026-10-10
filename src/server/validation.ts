/**
 * Validação de entrada: parâmetros de rota e comandos do admin (zod). Erros viram 400 `{ erro }`.
 */
import { z } from 'zod';
import type { AdminCommand } from '../shared/api';
import { UFS, type UF } from '../shared/types';

export class ErroValidacao extends Error {
  readonly status = 400;
  constructor(msg: string) {
    super(msg);
    this.name = 'ErroValidacao';
  }
}

const UF_SET = new Set<string>([...UFS, 'ZZ']);

/** 'sp' | 'SP' → 'SP'. Lança 400 se não for uma das 27 UFs ou ZZ. */
export function parseUf(v: string): UF {
  const u = String(v ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(u) || !UF_SET.has(u)) throw new ErroValidacao(`UF inválida: "${String(v).slice(0, 8)}". Use a sigla (ex.: sp) ou zz (exterior).`);
  return u as UF;
}

/** Corrida: formato 'pres', 'gov-rj', 'pres-t1', 'gov-rj-t1' (a existência é conferida depois → 404). */
export function parseRace(v: string): string {
  const r = String(v ?? '').toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(r)) throw new ErroValidacao(`Corrida inválida: "${String(v).slice(0, 24)}".`);
  return r;
}

/** Código TSE do município: 1–5 dígitos → 5 dígitos com zeros à esquerda. */
export function parseCodMunicipio(v: string): string {
  const s = String(v ?? '');
  if (!/^\d{1,5}$/.test(s)) throw new ErroValidacao(`Código de município inválido: "${s.slice(0, 8)}" (até 5 dígitos, código TSE).`);
  return s.padStart(5, '0');
}

/**
 * `?t=<epoch ms>` ("reveja a noite", contrato `Instante`): inteiro positivo de até 15 dígitos.
 * Ausente/vazio → undefined (agora). Instantes futuros são aceitos aqui e limitados ao agora depois.
 */
export function parseInstante(v: string | undefined | null): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v);
  if (!/^\d{1,15}$/.test(s) || Number(s) <= 0) {
    throw new ErroValidacao(`Instante inválido: "${s.slice(0, 20)}". Use ?t=<epoch em milissegundos> (inteiro positivo).`);
  }
  return Number(s);
}

/** `?v=<versão do admin>` (chave de cache na URL dos instantes passados). Malformado → undefined (ignorado). */
export function parseVersaoUrl(v: string | undefined | null): number | undefined {
  return v && /^\d{1,12}$/.test(v) ? Number(v) : undefined;
}

/** Zona/seção: inteiro positivo de até 4 dígitos. */
export function parseNumero(v: string, campo: 'zona' | 'secao'): number {
  const s = String(v ?? '');
  if (!/^\d{1,4}$/.test(s) || Number(s) < 1) throw new ErroValidacao(`${campo === 'zona' ? 'Zona' : 'Seção'} inválida: "${s.slice(0, 8)}".`);
  return Number(s);
}

// ---------------------------------------------------------------------------------------------
// Comandos do admin
// ---------------------------------------------------------------------------------------------

const finito = z.number().finite();
const ufChave = z.string().regex(/^[A-Za-z]{2}$/).refine((k) => UF_SET.has(k.toUpperCase()), 'UF desconhecida');
const recordUf = (lo: number, hi: number) =>
  z.record(ufChave, finito.min(lo).max(hi).nullable()).refine((o) => Object.keys(o).length <= 28, 'UFs demais');

const aviso = z
  .object({
    nivel: z.enum(['info', 'alerta']),
    texto: z.string().trim().min(1, 'texto vazio').max(280, 'máximo de 280 caracteres'),
  })
  .strict();

const cenario = z
  .object({
    preset: z.string().max(60),
    seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    alvoPres: finito.min(1).max(99),
    alvoGov: z.record(z.string().regex(/^gov-[a-z]{2}$/), finito.min(1).max(99)).refine((o) => Object.keys(o).length <= 27),
    transferenciaOutros: finito.min(0).max(1),
    intensidadeRegional: finito.min(0).max(1.5),
    ruidoSecao: finito.min(0).max(1),
    comparecimentoDelta: finito.min(-30).max(30),
    brancosFator: finito.min(0).max(5),
    nulosFator: finito.min(0).max(5),
    ritmo: z.enum(['rapido', 'normal', 'lento']),
    ordemRegional: z.enum(['realista', 'aleatoria', 'norte-primeiro', 'sul-primeiro']),
    ufVies: recordUf(-40, 40).nullable(),
    ufAtraso: recordUf(0, 600).nullable(),
  })
  .partial()
  .strict();

const tse = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .url()
      .max(200)
      .refine((u) => /^https?:\/\//i.test(u), 'baseUrl precisa ser http(s)'),
    ciclo: z.string().trim().regex(/^[a-z0-9]{3,16}$/i, 'ciclo inválido (ex.: ele2026)'),
    eleicaoPres: z.string().trim().regex(/^\d{1,6}$/, 'código de eleição inválido'),
    eleicaoGov: z.string().trim().regex(/^\d{1,6}$/, 'código de eleição inválido'),
    pleito: z.string().trim().regex(/^\d{1,6}$/, 'código de pleito inválido'),
    intervaloSeg: finito.min(5).max(600),
  })
  .partial()
  .strict();

/** Logo do patrocínio: data URI de imagem estática (≤ 150 KB decodificados; GIF não — slot discreto, sem animação) ou URL https. */
const IMAGEM_MAX_BYTES = 150 * 1024;
const imagemPatrocinio = z
  .string()
  .trim()
  .max(Math.ceil((IMAGEM_MAX_BYTES * 4) / 3) + 64, 'imagem acima de 150 KB')
  .refine((v) => {
    const m = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
    if (m) return Math.floor((m[2].length * 3) / 4) - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0) <= IMAGEM_MAX_BYTES;
    return urlHttps(v, 500);
  }, 'imagem: use data:image/(png|jpeg|webp|svg+xml);base64 até 150 KB, ou uma URL https');

/**
 * URL https absoluta, sem credenciais, com domínio (tem ponto), até `max` caracteres — a mesma regra do motor
 * (validaPatrocinio em src/engine/state.ts), para o comando nunca passar aqui e ser recusado lá.
 */
function urlHttps(v: string, max: number): boolean {
  if (v.length > max || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Patrocínio (anunciante NÃO político — ARCHITECTURE §1.5): marca, texto curto, link https e logo opcional. */
const patrocinio = z
  .object({
    marca: z.string().trim().min(1, 'marca vazia').max(60, 'marca: máximo de 60 caracteres'),
    texto: z.string().trim().min(1, 'texto vazio').max(140, 'texto: máximo de 140 caracteres'),
    url: z
      .string()
      .trim()
      .refine((v) => urlHttps(v, 500), 'url: use um endereço https:// válido (até 500 caracteres)'),
    imagem: imagemPatrocinio.optional(),
  })
  .strict();

export const adminCommandSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('relogio'), acao: z.enum(['iniciar', 'pausar', 'retomar', 'reiniciar']) }).strict(),
  z.object({ tipo: z.literal('velocidade'), velocidade: finito.gt(0).max(10_000) }).strict(),
  z.object({ tipo: z.literal('saltar-tempo'), simNow: finito.int().min(0) }).strict(),
  z.object({ tipo: z.literal('saltar-pct'), pct: finito.min(0).max(100) }).strict(),
  z.object({ tipo: z.literal('cenario'), cenario }).strict(),
  z.object({ tipo: z.literal('preset'), preset: z.string().trim().min(1).max(60) }).strict(),
  z.object({ tipo: z.literal('fonte'), fonte: z.enum(['pre', 'simulacao', 'tse']) }).strict(),
  z.object({ tipo: z.literal('aviso'), aviso: aviso.nullable() }).strict(),
  z.object({ tipo: z.literal('congelar'), congelado: z.boolean() }).strict(),
  z.object({ tipo: z.literal('nomes-reais'), ativo: z.boolean() }).strict(),
  z.object({ tipo: z.literal('tse'), tse }).strict(),
  z.object({ tipo: z.literal('patrocinio'), patrocinio: patrocinio.nullable() }).strict(),
]);

/** Valida um comando do admin (lança ErroValidacao com a primeira mensagem legível). */
export function parseAdminCommand(body: unknown): AdminCommand {
  const r = adminCommandSchema.safeParse(body);
  if (!r.success) {
    const i = r.error.issues[0];
    const onde = i.path.length ? `${i.path.join('.')}: ` : '';
    throw new ErroValidacao(`Comando inválido — ${onde}${i.message}`);
  }
  return r.data as AdminCommand;
}

export const loginSchema = z.object({ senha: z.string().min(1).max(1024) }).strict();
