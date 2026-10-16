/**
 * Validação de entrada: parâmetros de rota e comandos do admin (zod). Erros viram 400 `{ erro }`.
 */
import { z } from 'zod';
import type { AdminCommand } from '../shared/api';
import { validaAjusteImagem, validaAnuncio, validaContatoAnuncie, validaLogoAnuncio } from '../shared/anuncios';
import { validaContatosPublicos } from '../shared/contatos';
import { UFS, type UF } from '../shared/types';
import { TROCA_AUTO_MAX, TROCA_AUTO_MIN } from '../engine/state';

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

/** Corrida: formato 'pres', 'gov-df', 'pres-t1', 'gov-df-t1' (a existência é conferida depois → 404). */
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
    intervaloPrioritarioSeg: finito.min(3).max(600),
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

/** Campos aceitos num anúncio (o resto é recusado, como nos demais comandos). v2: ajustes, versão escura, reserva e meta. */
const CAMPOS_ANUNCIO = new Set([
  'id', 'marca', 'titulo', 'texto', 'cta', 'url', 'logo', 'imagem', 'formatos', 'peso', 'cota', 'ativo', 'inicio', 'fim', 'naoPolitico',
  'logoAjuste', 'logoEscuro', 'logoEscuroAjuste', 'imagemAjuste', 'reserva', 'limiteImpressoes',
]);

/**
 * Anúncio: a MESMA validação do motor (`validaAnuncio`, src/shared/anuncios.ts), com a barreira de conteúdo
 * político-eleitoral (src/shared/anuncios-politica.ts). O motor confere também os nomes dos candidatos do dataset (e
 * recusa com uma mensagem igualmente limpa). A mensagem sai como está (já diz o campo).
 */
const anuncio = z.unknown().superRefine((v, ctx) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const extra = Object.keys(v).find((k) => !CAMPOS_ANUNCIO.has(k));
    if (extra) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Anúncio: campo desconhecido "${extra.slice(0, 24)}".`, params: { limpo: true } });
      return;
    }
  }
  const r = validaAnuncio(v);
  if ('erro' in r) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.erro, params: { limpo: true } });
});

const contatoAnuncie = z.unknown().superRefine((v, ctx) => {
  if (v === null) return;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const extra = Object.keys(v).find((k) => !['email', 'whatsapp', 'chamada'].includes(k));
    if (extra) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Contato: campo desconhecido "${extra.slice(0, 24)}".`, params: { limpo: true } });
      return;
    }
  }
  const r = validaContatoAnuncie(v);
  if ('erro' in r) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.erro, params: { limpo: true } });
});

/** Contatos públicos e responsável pelo site (src/shared/contatos.ts): só os campos conhecidos, e-mails reais. */
const contatosPublicos = z.unknown().superRefine((v, ctx) => {
  if (v === null) return;
  const r = validaContatosPublicos(v);
  if ('erro' in r) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.erro, params: { limpo: true } });
});

const idAnuncio = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'id de anúncio inválido');

/**
 * 'anuncio-logo' ("Ajustar agora" e o desfazer): cada imagem presente passa pela regra única da logo
 * (`validaLogoAnuncio`: data URI até 150 KB e parada, ou a URL do próprio servidor); null apaga; ausente mantém. O ajuste
 * precisa ser válido (`validaAjusteImagem`) ou null. O motor confere de novo depois de juntar com o anúncio gravado.
 */
const imagemLogo = (campo: 'logo' | 'logoEscuro') =>
  z
    .unknown()
    .superRefine((v, ctx) => {
      if (v === null || v === undefined) return;
      const r = typeof v === 'string' && v.trim() ? validaLogoAnuncio({ [campo]: v }) : { erro: `Anúncio: ${campo === 'logo' ? 'logo' : 'versão para fundo escuro'} inválida.` };
      if ('erro' in r) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.erro, params: { limpo: true } });
    })
    .transform((v) => (typeof v === 'string' ? v.trim() : (v as null | undefined)));
const ajusteLogo = z
  .unknown()
  .superRefine((v, ctx) => {
    if (v === null || v === undefined) return;
    if (!validaAjusteImagem(v)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Anúncio: ajuste da logo inválido (proporção de 0,2 a 12).', params: { limpo: true } });
  })
  .transform((v) => (v === null || v === undefined ? (v as null | undefined) : validaAjusteImagem(v)));

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
  z.object({ tipo: z.literal('anuncio-salvar'), anuncio }).strict(),
  z.object({ tipo: z.literal('anuncio-remover'), id: idAnuncio }).strict(),
  z.object({ tipo: z.literal('anuncio-ativo'), id: idAnuncio, ativo: z.boolean() }).strict(),
  z
    .object({
      tipo: z.literal('anuncio-logo'),
      id: idAnuncio,
      logo: imagemLogo('logo').optional(),
      logoAjuste: ajusteLogo.optional(),
      logoEscuro: imagemLogo('logoEscuro').optional(),
      logoEscuroAjuste: ajusteLogo.optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('anuncios-suspensao'),
      suspender: z.boolean(),
      motivo: z.string().trim().max(140, 'motivo: máximo de 140 caracteres').optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('anuncie-contato'), contato: contatoAnuncie }).strict(),
  z.object({ tipo: z.literal('contatos'), contatos: contatosPublicos }).strict(),
  // 'executar' e 'concluir' são internos do servidor (troca-auto.ts): nunca entram pela rota HTTP
  z
    .object({
      tipo: z.literal('troca-auto'),
      acao: z.enum(['ligar', 'desligar', 'agora', 'adiar']),
      para: z.number().int().min(TROCA_AUTO_MIN).max(TROCA_AUTO_MAX).nullable().optional(),
    })
    .strict(),
]);

/** Valida um comando do admin (lança ErroValidacao com a primeira mensagem legível). */
export function parseAdminCommand(body: unknown): AdminCommand {
  const r = adminCommandSchema.safeParse(body);
  if (!r.success) {
    const i = r.error.issues[0];
    // mensagens da validação compartilhada (anúncio/contato) já dizem o campo
    if (i.code === z.ZodIssueCode.custom && (i.params as { limpo?: boolean } | undefined)?.limpo) throw new ErroValidacao(i.message);
    const onde = i.path.length ? `${i.path.join('.')}: ` : '';
    throw new ErroValidacao(`Comando inválido — ${onde}${i.message}`);
  }
  // troca-auto: "para" (epoch ms ou null) só com "adiar", e obrigatório nela
  if (r.data.tipo === 'troca-auto' && (r.data.acao === 'adiar') !== (r.data.para !== undefined)) {
    throw new ErroValidacao('Comando inválido — para: informe "para" (epoch ms ou null) só com a ação "adiar".');
  }
  return r.data as AdminCommand;
}

export const loginSchema = z.object({ senha: z.string().min(1).max(1024) }).strict();
