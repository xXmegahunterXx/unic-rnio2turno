/**
 * Contatos públicos do Sintonia e o responsável pelo site (controlador, LGPD art. 5º, VI), configurados no painel
 * (Comunicação → Contatos públicos; comando `contatos`) e publicados no `LiveStatus.contatos`. Todos OPCIONAIS.
 *
 * Regra do site: sem configuração, nenhuma linha de e-mail aparece (nunca um endereço provisório `.example`). Onde faz
 * sentido, o contato GERAL cai no e-mail do contato da /anuncie. O formulário "Quero anunciar" só abre (produção) com
 * um e-mail de PRIVACIDADE configurado: é por ele que quem enviou o pedido retira o consentimento (LGPD art. 18).
 */
import type { ContatoAnuncie } from './anuncios';

export interface ContatosPublicos {
  /** e-mail geral de contato */
  geral?: string;
  /** e-mail do encarregado / pedidos sobre dados pessoais (LGPD art. 41) */
  privacidade?: string;
  /** e-mail para a imprensa */
  imprensa?: string;
  /** e-mail para correções de dados, texto ou fonte */
  correcoes?: string;
  /** nome ou razão social do responsável pelo site (controlador dos dados) */
  responsavel?: string;
  /** CNPJ do responsável: só os 14 dígitos (exibido formatado) */
  cnpj?: string;
}

export const CONTATOS_LIMITES = { email: 120, responsavel: 120 } as const;

export type CampoEmail = 'geral' | 'privacidade' | 'imprensa' | 'correcoes';
export const CAMPOS_EMAIL: readonly CampoEmail[] = ['geral', 'privacidade', 'imprensa', 'correcoes'];
const CAMPOS: readonly (keyof ContatosPublicos)[] = [...CAMPOS_EMAIL, 'responsavel', 'cnpj'];

/** Domínios reservados que não recebem e-mail (RFC 2606/6761): nunca vão para o site. */
const RE_RESERVADO = /\.(example|invalid|test|localhost|local)$/i;
const RE_EMAIL = /^[^@\s<>"'()[\],;:\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/** Endereço reservado/provisório (`.example` etc.), que não recebe e-mail. */
export const emailProvisorio = (e: string) => RE_RESERVADO.test(e.trim());

/** CNPJ com dígitos verificadores corretos (14 dígitos, não todos iguais). */
export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const c of base) {
      soma += Number(c) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  const d2 = dv(d.slice(0, 12) + d1);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** 12345678000190 → 12.345.678/0001-90 */
export const formatarCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

const NOME_ROTULO: Record<CampoEmail, string> = { geral: 'geral', privacidade: 'de privacidade', imprensa: 'de imprensa', correcoes: 'de correções' };

/**
 * Valida (painel e servidor). Campos vazios saem; `null`/ausente = nenhum contato. E-mail com domínio reservado
 * (`.example`, `.invalid`, `.test`…) é recusado: o site nunca publica endereço que não recebe e-mail.
 */
export function validaContatosPublicos(v: unknown): { ok: ContatosPublicos } | { erro: string } {
  if (v === null || v === undefined) return { ok: {} };
  if (typeof v !== 'object' || Array.isArray(v)) return { erro: 'Contatos inválidos.' };
  const o = v as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !(CAMPOS as readonly string[]).includes(k));
  if (extra) return { erro: `Contatos: campo desconhecido "${extra.slice(0, 24)}".` };
  const txt = (x: unknown) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '');
  const out: ContatosPublicos = {};
  for (const k of CAMPOS_EMAIL) {
    if (o[k] !== undefined && o[k] !== null && typeof o[k] !== 'string') return { erro: `Contatos: e-mail ${NOME_ROTULO[k]} inválido.` };
    const e = txt(o[k]).toLowerCase();
    if (!e) continue;
    if (e.length > CONTATOS_LIMITES.email || !RE_EMAIL.test(e)) return { erro: `Contatos: e-mail ${NOME_ROTULO[k]} inválido.` };
    if (emailProvisorio(e)) return { erro: `Contatos: o e-mail ${NOME_ROTULO[k]} usa um domínio reservado (${e.split('@')[1]}), que não recebe e-mail.` };
    out[k] = e;
  }
  if (o.responsavel !== undefined && o.responsavel !== null && typeof o.responsavel !== 'string') return { erro: 'Contatos: responsável inválido.' };
  const resp = txt(o.responsavel);
  if (resp) {
    if (resp.length < 2 || resp.length > CONTATOS_LIMITES.responsavel || /[<>{}\u0000-\u001f]/.test(resp) || /https?:|www\./i.test(resp))
      return { erro: `Contatos: nome ou razão social do responsável com 2 a ${CONTATOS_LIMITES.responsavel} caracteres, sem links.` };
    out.responsavel = resp;
  }
  if (o.cnpj !== undefined && o.cnpj !== null && typeof o.cnpj !== 'string') return { erro: 'Contatos: CNPJ inválido.' };
  const cnpj = txt(o.cnpj).replace(/\D/g, '');
  if (cnpj) {
    if (!cnpjValido(cnpj)) return { erro: 'Contatos: CNPJ inválido (confira os 14 dígitos).' };
    if (!out.responsavel) return { erro: 'Contatos: informe o nome ou a razão social junto com o CNPJ.' };
    out.cnpj = cnpj;
  }
  return { ok: out };
}

/** Contatos efetivos do site: o geral cai no e-mail da /anuncie; correções e privacidade NÃO caem em outro (só exibição). */
export interface ContatosEfetivos {
  geral: string | null;
  privacidade: string | null;
  imprensa: string | null;
  correcoes: string | null;
  responsavel: string | null;
  cnpj: string | null;
  /** algum e-mail para mostrar */
  algum: boolean;
}

export function contatosEfetivos(c: ContatosPublicos | null | undefined, anuncie?: ContatoAnuncie | null): ContatosEfetivos {
  const ok = (e: string | undefined) => (e && !emailProvisorio(e) ? e : null);
  const geral = ok(c?.geral) ?? ok(anuncie?.email);
  const r: Omit<ContatosEfetivos, 'algum'> = {
    geral,
    privacidade: ok(c?.privacidade),
    imprensa: ok(c?.imprensa),
    correcoes: ok(c?.correcoes),
    responsavel: c?.responsavel?.trim() || null,
    cnpj: c?.cnpj && cnpjValido(c.cnpj) ? c.cnpj : null,
  };
  return { ...r, algum: !!(r.geral || r.privacidade || r.imprensa || r.correcoes) };
}
