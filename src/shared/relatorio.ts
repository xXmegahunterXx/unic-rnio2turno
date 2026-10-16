/**
 * Relatório de entrega do anunciante (link privado `/relatorio#k=<token>`, E17): contrato da resposta de
 * `POST /api/anuncie/relatorio` e as contas da página (puras — a página não refaz conta). Métricas só agregadas
 * (impressões visíveis e cliques por formato e hora; alcance estimado), sem dado pessoal (LGPD).
 */
import { FORMATOS_ANUNCIO, FORMATOS_COM_IMPRESSAO, type AnuncioPublico, type FormatoAnuncio } from './anuncios';
import { fmtDecimal } from './format';

/** Noite da eleição: 25/10/2026, 17h → 26/10/2026, 2h (Brasília), [inicio, fim). */
export const NOITE_ELEICAO = { inicio: Date.parse('2026-10-25T17:00:00-03:00'), fim: Date.parse('2026-10-26T02:00:00-03:00') } as const;
/** Links ativos por anúncio. */
export const LINKS_POR_ANUNCIO = 5;

export type SituacaoRelatorio = 'no-ar' | 'agendado' | 'pausado' | 'encerrado' | 'suspenso' | 'meta-atingida';

export interface RelatorioAnunciante {
  geradoEm: number;
  /** início da contagem do servidor */
  desde: number;
  /** imagens por URL; href '' (a página não conta clique) */
  anuncio: AnuncioPublico;
  situacao: SituacaoRelatorio;
  inicio: number | null;
  fim: number | null;
  /** só com "mostrar meta" ligado no link */
  meta?: { limite: number; entregue: number };
  /** ≤ 14 dias, só horas com contagem (`hora` = epoch ms do início da hora) */
  horas: { hora: number; formato: FormatoAnuncio; impressoes: number; cliques: number }[];
  /** 'AAAA-MM-DD' (Brasília): os dias FORA das 14 d de detalhe por hora (sem a divisão por formato) */
  dias: { dia: string; impressoes: number; cliques: number }[];
  /**
   * estimativas (HLL). `segmentos` (opcional): quantos processos do servidor contaram no período — mais de 1 = houve
   * reinício no meio e a estimativa é conservadora (o maior entre eles).
   */
  alcance: { campanha: number | null; noite: number | null; segmentos?: { campanha: number; noite: number } };
}

export interface LinkRelatorio {
  lid: string;
  id: string;
  rotulo: string;
  criadoEm: number;
  revogadoEm?: number;
  mostrarMeta: boolean;
  acessos: number;
  /** hora cheia do último acesso (epoch ms) */
  ultimoAcessoHora?: number;
}

export type PeriodoRelatorio = 'campanha' | 'noite' | 'ultimas24h';

const HORA = 3_600_000;
const horaCheia = (t: number) => Math.floor(t / HORA) * HORA;
/** Detalhe por hora guardado pelo servidor: 14 dias. */
const HORAS_DETALHE = 14 * 24;

/** Horas (com formato) dentro do período. 'ultimas24h' = a hora atual e as 23 anteriores. */
function horasDoPeriodo(r: RelatorioAnunciante, p: PeriodoRelatorio, agora: number): RelatorioAnunciante['horas'] {
  if (p === 'campanha') return r.horas;
  if (p === 'noite') return r.horas.filter((h) => h.hora >= NOITE_ELEICAO.inicio && h.hora < NOITE_ELEICAO.fim);
  const fim = horaCheia(agora);
  const ini = fim - 23 * HORA;
  return r.horas.filter((h) => h.hora >= ini && h.hora <= fim);
}

/** Taxa de cliques (%) — null sem impressões. */
export function ctrPct(t: { impressoes: number; cliques: number }): number | null {
  return t.impressoes > 0 ? (100 * t.cliques) / t.impressoes : null;
}

/**
 * Totais do período:
 *  - 'campanha': todas as horas de detalhe + os dias anteriores a elas (`dias`); `alcance.campanha`;
 *  - 'noite': as horas dentro de `NOITE_ELEICAO`; `alcance.noite`;
 *  - 'ultimas24h': a hora atual e as 23 anteriores; sem alcance (null).
 * `alcance` é estimativa e nunca passa das impressões do período; `frequencia` = impressões ÷ alcance (null sem
 * alcance). `porFormato`: os formatos medidos do anúncio (mesmo com zero) e os que tiveram contagem, na ordem de
 * `FORMATOS_ANUNCIO` — só das horas de detalhe (os `dias` não têm a divisão por formato).
 */
export function totaisDoPeriodo(
  r: RelatorioAnunciante,
  p: PeriodoRelatorio,
  agora: number,
): { impressoes: number; cliques: number; alcance: number | null; frequencia: number | null; porFormato: { formato: FormatoAnuncio; impressoes: number; cliques: number }[] } {
  const hs = horasDoPeriodo(r, p, agora);
  const porF = new Map<FormatoAnuncio, { impressoes: number; cliques: number }>();
  let impressoes = 0;
  let cliques = 0;
  for (const h of hs) {
    impressoes += h.impressoes;
    cliques += h.cliques;
    const f = porF.get(h.formato) ?? { impressoes: 0, cliques: 0 };
    f.impressoes += h.impressoes;
    f.cliques += h.cliques;
    porF.set(h.formato, f);
  }
  if (p === 'campanha') {
    for (const d of r.dias) {
      impressoes += d.impressoes;
      cliques += d.cliques;
    }
  }
  const bruto = p === 'ultimas24h' ? null : p === 'noite' ? r.alcance.noite : r.alcance.campanha;
  const alcance = bruto === null || !Number.isFinite(bruto) ? null : Math.max(0, Math.min(Math.round(bruto), impressoes));
  const frequencia = alcance ? impressoes / alcance : null;
  const porFormato = FORMATOS_ANUNCIO.filter((f) => porF.has(f) || (r.anuncio.formatos.includes(f) && FORMATOS_COM_IMPRESSAO.includes(f))).map((formato) => ({
    formato,
    impressoes: porF.get(formato)?.impressoes ?? 0,
    cliques: porF.get(formato)?.cliques ?? 0,
  }));
  return { impressoes, cliques, alcance, frequencia, porFormato };
}

/**
 * Série por hora do período (a mais antiga primeiro), somando os formatos, com zeros onde não houve contagem:
 *  - 'noite': de 17h até 2h (ou até a hora atual, se a noite ainda não acabou; antes dela, vazia);
 *  - 'ultimas24h': as 24 horas até a atual;
 *  - 'campanha': da 1ª hora com contagem (ou do início do anúncio, se estiver dentro do detalhe) até a hora atual (ou
 *    a do fim do anúncio), no máximo 14 dias.
 */
export function serieDoPeriodo(r: RelatorioAnunciante, p: PeriodoRelatorio, agora: number): { hora: number; impressoes: number; cliques: number }[] {
  const atual = horaCheia(agora);
  let ini: number;
  let fim: number; // inclusive
  if (p === 'noite') {
    ini = NOITE_ELEICAO.inicio;
    fim = Math.min(NOITE_ELEICAO.fim - HORA, atual);
  } else if (p === 'ultimas24h') {
    fim = atual;
    ini = atual - 23 * HORA;
  } else {
    if (r.horas.length === 0) return [];
    const ultimaComDado = Math.max(...r.horas.map((h) => h.hora));
    fim = Math.max(ultimaComDado, r.fim && r.fim <= agora ? horaCheia(r.fim - 1) : atual);
    ini = Math.min(...r.horas.map((h) => h.hora));
    if (r.inicio && horaCheia(r.inicio) < ini) ini = horaCheia(r.inicio);
    ini = Math.max(ini, fim - (HORAS_DETALHE - 1) * HORA);
  }
  if (fim < ini) return [];
  const n = Math.round((fim - ini) / HORA) + 1;
  const out = Array.from({ length: n }, (_, i) => ({ hora: ini + i * HORA, impressoes: 0, cliques: 0 }));
  for (const h of r.horas) {
    const i = Math.round((h.hora - ini) / HORA);
    if (i < 0 || i >= n) continue;
    out[i].impressoes += h.impressoes;
    out[i].cliques += h.cliques;
  }
  return out;
}

// ---- CSV ------------------------------------------------------------------------------------------------------------

/**
 * Campo do CSV, com a MESMA proteção contra fórmula do `csvCampo` do painel (admin/anunciosAdmin.ts): texto que começa
 * com = + - @ TAB ou CR — ou um trecho que começa logo depois de "," ";" TAB ou quebra de linha — ganha um apóstrofo na
 * frente (a planilha trataria como fórmula, mesmo entre aspas); campo com " ; , TAB ou quebra de linha vai entre aspas.
 * Número com vírgula decimal gerado pelo código ("1,20") fica sem aspas. Números seguem como estão.
 */
export const csvCampo = (v: string | number): string => {
  const s0 = String(v);
  if (typeof v !== 'string') return s0;
  const s = (/^[=+\-@\t\r]/.test(s0) ? `'${s0}` : s0).replace(/([,;\t\r\n][ \t]*)([=+\-@])/g, "$1'$2");
  return /[";\n\r\t]/.test(s) || (s.includes(',') && !/^-?\d+(,\d+)?$/.test(s)) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** epoch ms → "2026-10-25 17:00" (Brasília, UTC−3 fixo desde 2019). */
const horaBrasilia = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 16).replace('T', ' ');

const ctrCsv = (t: { impressoes: number; cliques: number }) => {
  const c = ctrPct(t);
  return c === null ? '' : fmtDecimal(c, 2);
};

/**
 * CSV do relatório (separador ";", decimal com vírgula, BOM UTF-8 — abre direto no Excel/Planilhas em pt-BR): os dias
 * anteriores ao detalhe ('dia', formato 'todos'), cada hora × formato ('hora', início da hora em Brasília) e o total da
 * campanha ('total').
 */
export function csvRelatorioAnunciante(r: RelatorioAnunciante): string {
  const linhas: (string | number)[][] = [['marca', 'tipo', 'inicio_brasilia', 'formato', 'impressoes_visiveis', 'cliques', 'ctr_pct']];
  const marca = r.anuncio.marca;
  for (const d of [...r.dias].sort((a, b) => a.dia.localeCompare(b.dia))) linhas.push([marca, 'dia', d.dia, 'todos', d.impressoes, d.cliques, ctrCsv(d)]);
  const ordem = (f: FormatoAnuncio) => FORMATOS_ANUNCIO.indexOf(f);
  for (const h of [...r.horas].sort((a, b) => a.hora - b.hora || ordem(a.formato) - ordem(b.formato)))
    linhas.push([marca, 'hora', horaBrasilia(h.hora), h.formato, h.impressoes, h.cliques, ctrCsv(h)]);
  const total = totaisDoPeriodo(r, 'campanha', r.geradoEm);
  linhas.push([marca, 'total', '', 'todos', total.impressoes, total.cliques, ctrCsv(total)]);
  return `﻿${linhas.map((l) => l.map(csvCampo).join(';')).join('\r\n')}\r\n`;
}
