/**
 * Utilidades puras das seções "Audiência" e "Interessados" do painel: somas dos últimos dias, CSVs (com proteção contra
 * fórmula — `csvCampo`) e os links de resposta a um pedido. Sem React.
 */
import { ROTULO_FORMATO, type FormatoAnuncio } from '@/shared/anuncios';
import { GRUPOS_ROTA, ROTULO_GRUPO, rotuloOrigem, type DiaAudiencia, type GrupoRota, type HoraAudiencia } from '@/shared/audiencia';
import type { Lead } from '@/shared/leads';
import { csvCampo, csvTexto } from './anunciosAdmin';

/** CSV (";", BOM UTF-8, CRLF — abre direto no Excel/Planilhas em pt-BR). */
export function csvDe(linhas: (string | number)[][]): string {
  return `﻿${linhas.map((l) => l.map(csvCampo).join(';')).join('\r\n')}\r\n`;
}

/** "2026-10-25 19:42" (Brasília) — ordena bem e a planilha entende. */
export function dataHoraBrasilia(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** Últimos `n` dias (os mais recentes). */
const ultimos = (dias: readonly DiaAudiencia[], n: number) => dias.slice(-n);

/** Páginas por grupo nos últimos `n` dias, do maior para o menor (só grupos com visita). */
export function somaPorGrupo(dias: readonly DiaAudiencia[], n = 7): [GrupoRota, number][] {
  const s = new Map<GrupoRota, number>();
  for (const d of ultimos(dias, n)) for (const g of GRUPOS_ROTA) if (d.porGrupo[g]) s.set(g, (s.get(g) ?? 0) + (d.porGrupo[g] ?? 0));
  return [...s].sort((a, b) => b[1] - a[1]);
}

/** Entradas por origem nos últimos `n` dias: as `top` maiores + "Outras" com o resto. */
export function somaOrigens(dias: readonly DiaAudiencia[], n = 7, top = 10): { origem: string; rotulo: string; entradas: number }[] {
  const s = new Map<string, number>();
  for (const d of ultimos(dias, n)) for (const [o, x] of Object.entries(d.origens)) s.set(o, (s.get(o) ?? 0) + x);
  const ord = [...s].sort((a, b) => b[1] - a[1]);
  const out = ord.slice(0, top).map(([origem, entradas]) => ({ origem, rotulo: rotuloOrigem(origem), entradas }));
  const resto = ord.slice(top).reduce((t, [, x]) => t + x, 0);
  if (resto > 0) out.push({ origem: '…', rotulo: 'Outras origens', entradas: resto });
  return out;
}

/** CSV por dia: únicos, páginas, entradas, pico e as páginas de cada grupo. */
export function csvAudienciaDias(dias: readonly DiaAudiencia[]): string {
  const linhas: (string | number)[][] = [
    ['dia', 'visitantes_unicos_estimados', 'paginas_vistas', 'entradas', 'pico_simultaneo', 'pico_em', 'reinicios_do_servidor', ...GRUPOS_ROTA.map((g) => `grupo_${g}`)],
  ];
  for (const d of dias) {
    linhas.push([
      d.dia,
      d.unicos,
      d.paginas,
      d.entradas,
      d.pico?.valor ?? 0,
      d.pico ? dataHoraBrasilia(d.pico.em) : '',
      d.reinicios,
      ...GRUPOS_ROTA.map((g) => d.porGrupo[g] ?? 0),
    ]);
  }
  return csvDe(linhas);
}

/** CSV das últimas 48 h. */
export function csvAudienciaHoras(horas: readonly HoraAudiencia[]): string {
  return csvDe([['hora_inicio_brasilia', 'paginas_vistas', 'pico_simultaneo'], ...horas.map((h) => [dataHoraBrasilia(h.hora), h.paginas, h.pico])]);
}

/** CSV das origens: uma linha por dia × origem. */
export function csvOrigens(dias: readonly DiaAudiencia[]): string {
  const linhas: (string | number)[][] = [['dia', 'origem', 'descricao', 'entradas']];
  for (const d of dias) for (const [o, x] of Object.entries(d.origens).sort((a, b) => b[1] - a[1])) linhas.push([d.dia, o, rotuloOrigem(o), x]);
  return csvDe(linhas);
}

/** "+55 (11) 99999-0000" (Brasil) ou "+351 912345678". */
export function fmtTelefone(d: string): string {
  if (/^55\d{10,11}$/.test(d)) {
    const ddd = d.slice(2, 4);
    const n = d.slice(4);
    return `+55 (${ddd}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
  }
  return `+${d}`;
}

/**
 * Pedidos de anunciantes (mais recentes primeiro, como no painel). O texto livre (escrito por qualquer visitante) vai
 * SEMPRE entre aspas e sem fórmula em lugar nenhum (`csvTexto`): abre certo em planilha que separa por ";" ou por ",".
 */
export function csvLeads(leads: readonly Lead[]): string {
  const cab = ['recebido_em_brasilia', 'nome', 'empresa', 'email', 'whatsapp', 'formatos', 'mensagem', 'respondido', 'respondido_em_brasilia', 'consentimento', 'quarentena'];
  const linhas = [cab.map(csvCampo).join(';')];
  for (const l of leads) {
    linhas.push(
      [
        csvCampo(dataHoraBrasilia(l.em)),
        csvTexto(l.nome),
        csvTexto(l.empresa),
        csvTexto(l.email),
        // sem o "+" na frente (a planilha leria como número/fórmula); com espaço, fica texto
        csvTexto(l.whatsapp ? fmtTelefone(l.whatsapp).replace(/^\+/, '') : ''),
        csvTexto(l.formatos.map((f) => ROTULO_FORMATO[f as FormatoAnuncio] ?? f).join(', ')),
        csvTexto(l.mensagem),
        csvCampo(l.respondido ? 'sim' : 'não'),
        csvCampo(l.respondido && l.respondidoEm ? dataHoraBrasilia(l.respondidoEm) : ''),
        csvCampo(l.consentimento ? `${l.consentimento.versao} ${dataHoraBrasilia(l.consentimento.em)}` : ''),
        csvCampo(l.quarentena ? 'sim' : 'não'),
      ].join(';'),
    );
  }
  return `\ufeff${linhas.join('\r\n')}\r\n`;
}

const primeiroNome = (nome: string) => nome.split(' ')[0] ?? nome;

/** mailto: com assunto e saudação. */
export function linkEmailLead(l: Pick<Lead, 'email' | 'nome'>): string {
  const assunto = 'Anúncio no Sintonia';
  const corpo = `Olá, ${primeiroNome(l.nome)}! Obrigado pelo contato pela página Anuncie do Sintonia.\n\n`;
  return `mailto:${encodeURIComponent(l.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/** wa.me com a saudação pronta (só com WhatsApp informado). */
export function linkWhatsLead(l: Pick<Lead, 'whatsapp' | 'nome'>): string | null {
  if (!l.whatsapp || !/^\d{10,15}$/.test(l.whatsapp)) return null;
  const texto = `Olá, ${primeiroNome(l.nome)}! Aqui é do Sintonia, sobre o seu contato para anunciar.`;
  return `https://wa.me/${l.whatsapp}?text=${encodeURIComponent(texto)}`;
}

export { ROTULO_GRUPO };
