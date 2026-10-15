/**
 * "Quero anunciar": pedidos de contato de anunciantes (contrato: src/shared/leads.ts; ARCHITECTURE §11.12).
 *
 * Guardados em STATE_DIR/leads.json (gravação atômica, permissão 600), no máximo 2.000, SEM IP e sem identificador do
 * navegador: só o que a pessoa escreveu + data + a prova do consentimento (versão do texto e hora). Respondidos há mais
 * de 180 dias e não respondidos há mais de 12 meses saem sozinhos; cheio, sai o respondido mais antigo, depois o mais
 * antigo em quarentena (sem espaço nenhum, o formulário pede o WhatsApp/e-mail).
 *
 * Contra robôs e abuso: campo-isca (`site`) e tempo mínimo de preenchimento (robô recebe "ok" e nada é guardado — o
 * tempo vem do navegador, então é só um filtro leve), 3 pedidos por rede (IPv6 /56, chave anonimizada) por hora e o
 * mesmo pedido repetido em 24 h não duplica. Acima de 120 no total por hora (enxurrada), o pedido entra em QUARENTENA
 * em vez de ser recusado: quem é de verdade não perde o contato, e o painel separa. Nada do conteúdo vai para o log.
 */
import { randomBytes } from 'node:crypto';
import { FORMATOS_ANUNCIO } from '../shared/anuncios';
import { LIMITES_LEAD, TEXTOS_CONSENTIMENTO, VERSAO_CONSENTIMENTO, validaLead, type CampoLead, type ComandoLead, type Lead, type LeadsAdmin } from '../shared/leads';
import { LimiteTaxa } from './auth';
import type { JsonStore } from './state-store';

const DIA_MS = 86_400_000;

export interface LeadsArquivo {
  v: 1;
  leads: Lead[];
}

export type ResultadoLead =
  | { ok: true; guardado: boolean; motivo?: 'isca' | 'rapido' | 'repetido' }
  | { ok: false; status: number; erro: string; campo?: CampoLead; esperaS?: number };

export interface OpcoesLeads {
  now?: () => number;
  store?: JsonStore | null;
  max?: number;
}

const ehTexto = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

export class Leads {
  private readonly now: () => number;
  private readonly store: JsonStore | null;
  readonly max: number;
  private lista: Lead[] = [];
  private readonly porCliente: LimiteTaxa;
  private readonly global: LimiteTaxa;
  /** robôs descartados (só contagem, para o painel) */
  descartados = 0;

  constructor(o: OpcoesLeads = {}) {
    this.now = o.now ?? Date.now;
    this.store = o.store ?? null;
    this.max = o.max ?? LIMITES_LEAD.max;
    this.porCliente = new LimiteTaxa(LIMITES_LEAD.porHora, 3600_000, this.now);
    this.global = new LimiteTaxa(LIMITES_LEAD.globalPorHora, 3600_000, this.now);
    const salvo = this.store?.ler();
    if (salvo) this.carregar(salvo);
  }

  /** Pedido do formulário. `cliente` = chave anonimizada da rede (só para o limite; não é guardada). */
  receber(entrada: unknown, cliente: string): ResultadoLead {
    const o = (entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {}) as Record<string, unknown>;
    // campo-isca preenchido ou rápido demais: robô. Responde como se tivesse dado certo (e não guarda nada).
    if (typeof o.site === 'string' && o.site.trim() !== '') {
      this.descartados++;
      return { ok: true, guardado: false, motivo: 'isca' };
    }
    if (typeof o.ms !== 'number' || !Number.isFinite(o.ms) || o.ms < LIMITES_LEAD.tempoMinMs) {
      this.descartados++;
      return { ok: true, guardado: false, motivo: 'rapido' };
    }
    const v = validaLead(o);
    if ('erro' in v) return { ok: false, status: 422, erro: v.erro, campo: v.campo };
    const espera = this.porCliente.tentar(cliente);
    if (espera > 0) {
      return { ok: false, status: 429, erro: 'Recebemos vários pedidos seguidos. Tente de novo mais tarde ou use o WhatsApp/e-mail abaixo.', esperaS: espera };
    }
    // enxurrada (muitas redes ao mesmo tempo): guarda em quarentena em vez de recusar todo mundo
    const quarentena = this.global.tentar('global') > 0;
    const agora = this.now();
    this.podar(agora);
    const repetido = this.lista.find(
      (l) => l.email === v.ok.email && l.empresa.toLowerCase() === v.ok.empresa.toLowerCase() && l.mensagem === v.ok.mensagem && agora - l.em < DIA_MS,
    );
    if (repetido) return { ok: true, guardado: false, motivo: 'repetido' };
    if (this.lista.length >= this.max) {
      let i = this.lista.findIndex((l) => l.respondido);
      if (i < 0) i = this.lista.findIndex((l) => l.quarentena);
      if (i < 0) return { ok: false, status: 503, erro: 'Não conseguimos registrar o pedido agora. Fale com a gente pelo WhatsApp ou e-mail abaixo.' };
      this.lista.splice(i, 1);
    }
    this.lista.push({
      id: randomBytes(6).toString('hex'),
      em: agora,
      ...v.ok,
      respondido: false,
      respondidoEm: null,
      consentimento: { versao: VERSAO_CONSENTIMENTO, em: agora },
      ...(quarentena ? { quarentena: true } : {}),
    });
    this.salvar();
    return { ok: true, guardado: true };
  }

  /** Pedidos ainda não respondidos. */
  novos(): number {
    return this.lista.reduce((n, l) => n + (l.respondido ? 0 : 1), 0);
  }

  paraAdmin(): LeadsAdmin {
    this.podar(this.now());
    return { leads: [...this.lista].reverse().map((l) => ({ ...l, formatos: [...l.formatos] })), novos: this.novos(), max: this.max };
  }

  /** Comando do painel. Devolve um texto para o log (sem conteúdo do pedido) ou o erro. */
  comando(c: ComandoLead): { ok: true; log: string } | { ok: false; erro: string } {
    const i = this.lista.findIndex((l) => l.id === c.id);
    if (i < 0) return { ok: false, erro: 'Pedido não encontrado (talvez já apagado).' };
    if (c.acao === 'apagar') {
      this.lista.splice(i, 1);
      this.salvar();
      return { ok: true, log: `pedido ${c.id} apagado` };
    }
    const l = this.lista[i];
    l.respondido = c.valor;
    l.respondidoEm = c.valor ? this.now() : null;
    this.salvar();
    return { ok: true, log: `pedido ${c.id} marcado como ${c.valor ? 'respondido' : 'não respondido'}` };
  }

  toJSON(): LeadsArquivo {
    return { v: 1, leads: this.lista };
  }

  /** Restaura (pedidos malformados são ignorados). */
  carregar(v: unknown): boolean {
    if (!v || typeof v !== 'object' || (v as LeadsArquivo).v !== 1 || !Array.isArray((v as LeadsArquivo).leads)) return false;
    const out: Lead[] = [];
    for (const x of (v as LeadsArquivo).leads) {
      if (!x || typeof x !== 'object') continue;
      const l = x as Lead;
      if (!ehTexto(l.id, 32) || !/^[a-f0-9]{6,32}$/.test(l.id) || typeof l.em !== 'number' || !Number.isFinite(l.em)) continue;
      const val = validaLead({ ...l, consentimento: true });
      if ('erro' in val) continue;
      out.push({
        id: l.id,
        em: l.em,
        ...val.ok,
        formatos: FORMATOS_ANUNCIO.filter((f) => val.ok.formatos.includes(f)),
        respondido: l.respondido === true,
        respondidoEm: typeof l.respondidoEm === 'number' ? l.respondidoEm : null,
        ...(l.consentimento && typeof l.consentimento.versao === 'string' && l.consentimento.versao in TEXTOS_CONSENTIMENTO && typeof l.consentimento.em === 'number'
          ? { consentimento: { versao: l.consentimento.versao, em: l.consentimento.em } }
          : {}),
        ...(l.quarentena === true ? { quarentena: true } : {}),
      });
    }
    out.sort((a, b) => a.em - b.em);
    this.lista = out.slice(-this.max);
    return true;
  }

  async persistir(): Promise<void> {
    await this.store?.flush();
  }

  private salvar() {
    this.store?.salvar(() => this.toJSON());
  }

  /** Respondidos há mais de 180 dias e não respondidos há mais de 12 meses saem (prazo de guarda). */
  private podar(agora: number) {
    const lim = agora - LIMITES_LEAD.guardaRespondidoDias * DIA_MS;
    const limNao = agora - LIMITES_LEAD.guardaNaoRespondidoDias * DIA_MS;
    const antes = this.lista.length;
    this.lista = this.lista.filter((l) => (l.respondido ? (l.respondidoEm ?? l.em) >= lim : l.em >= limNao));
    if (this.lista.length !== antes) this.salvar();
  }
}
