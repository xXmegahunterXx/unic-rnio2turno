/**
 * "Quero anunciar" — formulário da página /anuncie (contrato isomórfico: app, servidor e painel). ARCHITECTURE §11.12.
 *
 * Dados mínimos de quem quer anunciar (nome, empresa, e-mail de trabalho, WhatsApp opcional, formatos e mensagem), com
 * consentimento explícito: usados SÓ para responder ao contato. O servidor guarda em STATE_DIR/leads.json (no máximo
 * 2.000, sem IP), o painel lista, marca como respondido, apaga e exporta CSV.
 */
import { FORMATOS_ANUNCIO, type FormatoAnuncio } from './anuncios';

export const LIMITES_LEAD = {
  nome: 80,
  empresa: 80,
  email: 120,
  whatsapp: { min: 10, max: 15 },
  mensagem: 1000,
  /** links aceitos na mensagem (mais que isso costuma ser spam) */
  linksMensagem: 3,
  /** pedidos guardados */
  max: 2000,
  /** um humano leva pelo menos isso para preencher (robôs mandam na hora) */
  tempoMinMs: 3000,
  /** pedidos aceitos por visitante (rede) por hora */
  porHora: 3,
  /** pedidos aceitos no total por hora (contra enxurrada) */
  globalPorHora: 120,
  /** respondidos há mais que isso saem sozinhos */
  guardaRespondidoDias: 180,
  /** não respondidos há mais que isso também saem (prazo de guarda; LGPD art. 15/16) */
  guardaNaoRespondidoDias: 365,
} as const;

export const TEXTO_CONSENTIMENTO = 'Concordo que o Sintonia use estes dados só para responder ao meu contato.';
/**
 * Versão do texto de consentimento (vai junto com cada pedido: o ônus da prova do consentimento é do controlador, LGPD
 * art. 8º, § 2º). Mudou o texto? Crie uma versão nova e guarde a antiga em `TEXTOS_CONSENTIMENTO`.
 */
export const VERSAO_CONSENTIMENTO = '2026-10-v1';
/** Todos os textos já usados, por versão (o painel mostra o texto exato que a pessoa marcou). */
export const TEXTOS_CONSENTIMENTO: Readonly<Record<string, string>> = { [VERSAO_CONSENTIMENTO]: TEXTO_CONSENTIMENTO };

export type CampoLead = 'nome' | 'empresa' | 'email' | 'whatsapp' | 'formatos' | 'mensagem' | 'consentimento';

/** O que o formulário manda. `site` é o campo-isca (escondido; pessoas deixam vazio) e `ms` o tempo de preenchimento. */
export interface LeadEntrada {
  nome: string;
  empresa: string;
  email: string;
  whatsapp?: string;
  formatos?: FormatoAnuncio[];
  mensagem?: string;
  consentimento: boolean;
  site?: string;
  ms?: number;
}

/** Pedido guardado (painel). Sem IP, sem identificador do navegador. */
export interface Lead {
  id: string;
  /** epoch ms */
  em: number;
  nome: string;
  empresa: string;
  email: string;
  /** só dígitos, com DDI */
  whatsapp?: string;
  formatos: FormatoAnuncio[];
  mensagem: string;
  respondido: boolean;
  respondidoEm?: number | null;
  /** prova do consentimento: versão do texto marcado e quando (pedidos antigos podem não ter) */
  consentimento?: { versao: string; em: number };
  /** chegou durante uma enxurrada (teto global da hora estourado): guardado à parte, conferir antes de responder */
  quarentena?: boolean;
}

export type DadosLead = Pick<Lead, 'nome' | 'empresa' | 'email' | 'whatsapp' | 'formatos' | 'mensagem'>;

/** Resposta do `POST /api/anuncie/lead`. */
export type RespostaLead = { ok: true } | { ok: false; erro: string; campo?: CampoLead };

/** `GET /api/admin/leads`. */
export interface LeadsAdmin {
  /** mais recente primeiro */
  leads: Lead[];
  /** ainda não respondidos */
  novos: number;
  max: number;
}

export type ComandoLead = { acao: 'respondido'; id: string; valor: boolean } | { acao: 'apagar'; id: string };

/** Texto de uma linha: sem caracteres de controle, espaços colapsados. */
function linha(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/** Texto livre: mantém quebras de linha (no máximo 2 seguidas), sem outros caracteres de controle. */
function bloco(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const RE_EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/i;

/** Só dígitos; 10–11 dígitos (DDD + número) ganham o 55 do Brasil. */
export function normalizarWhatsApp(v: unknown): string {
  const d = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/**
 * Valida o pedido (mesma regra no formulário e no servidor). Não confere o campo-isca nem o tempo: isso é do servidor,
 * que finge aceitar para não ensinar o robô.
 */
export function validaLead(v: unknown): { ok: DadosLead } | { erro: string; campo: CampoLead } {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const L = LIMITES_LEAD;
  const nome = linha(o.nome);
  if (nome.length < 2 || !/\p{L}/u.test(nome)) return { erro: 'Informe o seu nome.', campo: 'nome' };
  if (nome.length > L.nome) return { erro: `Nome com até ${L.nome} caracteres.`, campo: 'nome' };
  const empresa = linha(o.empresa);
  if (empresa.length < 2) return { erro: 'Informe a empresa ou marca.', campo: 'empresa' };
  if (empresa.length > L.empresa) return { erro: `Empresa com até ${L.empresa} caracteres.`, campo: 'empresa' };
  const email = linha(o.email).toLowerCase();
  if (!email) return { erro: 'Informe o e-mail de trabalho.', campo: 'email' };
  if (email.length > L.email || !RE_EMAIL.test(email)) return { erro: 'E-mail inválido.', campo: 'email' };
  const whatsapp = normalizarWhatsApp(o.whatsapp);
  if (whatsapp && (whatsapp.length < L.whatsapp.min || whatsapp.length > L.whatsapp.max))
    return { erro: 'WhatsApp com DDD (e DDI, se não for do Brasil), só números.', campo: 'whatsapp' };
  const formatos = Array.isArray(o.formatos)
    ? FORMATOS_ANUNCIO.filter((f) => (o.formatos as unknown[]).includes(f))
    : [];
  if (Array.isArray(o.formatos) && o.formatos.some((f) => typeof f !== 'string' || !(FORMATOS_ANUNCIO as readonly string[]).includes(f)))
    return { erro: 'Formato inválido.', campo: 'formatos' };
  const mensagem = bloco(o.mensagem);
  if (mensagem.length > L.mensagem) return { erro: `Mensagem com até ${L.mensagem} caracteres.`, campo: 'mensagem' };
  if ((mensagem.match(/https?:\/\/|www\./gi) ?? []).length > L.linksMensagem) return { erro: `No máximo ${L.linksMensagem} links na mensagem.`, campo: 'mensagem' };
  if (o.consentimento !== true) return { erro: 'Marque a autorização para podermos responder.', campo: 'consentimento' };
  const out: DadosLead = { nome, empresa, email, formatos, mensagem };
  if (whatsapp) out.whatsapp = whatsapp;
  return { ok: out };
}
