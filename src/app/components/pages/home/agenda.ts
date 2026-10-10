/**
 * "Lembrar da apuração": evento de agenda gerado NO APARELHO (nada vai para servidor).
 *  - `gerarIcs(...)`: arquivo iCalendar (RFC 5545) com horários em UTC (sem ambiguidade de fuso), texto escapado,
 *    linhas dobradas em 75 octetos (sem partir caractere UTF-8) e um alarme 15 min antes;
 *  - `googleAgendaUrl(...)` / `outlookAgendaUrl(...)`: links "adicionar evento" das agendas web;
 *  - `icsDataUrl(...)`: `data:text/calendar` — no iPhone abre direto o "Adicionar à agenda"; no Android baixa o arquivo.
 * Puro (testado em agenda.test.ts).
 */
import { INICIO_APURACAO } from '@/shared/constants';

export interface EventoAgenda {
  /** Identificador estável (o mesmo evento não duplica ao importar de novo). */
  uid: string;
  titulo: string;
  descricao: string;
  /** Epoch ms. */
  inicio: number;
  fim: number;
  /** Link do site (vai no corpo, em URL e em LOCATION). */
  url?: string;
  /** Minutos de antecedência do alarme (padrão 15; 0 = sem alarme). */
  alarmeMin?: number;
}

/** Duração do evento "apuração": 17h às 20h de Brasília (a maior parte das seções chega nesse intervalo). */
export const FIM_EVENTO_APURACAO = INICIO_APURACAO + 3 * 60 * 60 * 1000;

/** O evento padrão do Sintonia: domingo, 25/10/2026, 17h (Brasília). */
export function eventoApuracao(url?: string): EventoAgenda {
  return {
    uid: 'apuracao-2turno-2026@sintonia',
    titulo: 'Apuração do 2º turno ao vivo',
    descricao:
      'A divulgação dos resultados do 2º turno começa às 17h (horário de Brasília). Acompanhe a apuração ao vivo, do Brasil inteiro até a sua seção, no Sintonia.',
    inicio: INICIO_APURACAO,
    fim: FIM_EVENTO_APURACAO,
    url,
    alarmeMin: 15,
  };
}

const dois = (n: number) => String(n).padStart(2, '0');

/** 2026-10-25T20:00:00Z → "20261025T200000Z" (formato UTC do iCalendar e do Google Agenda). */
export function dataIcs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${dois(d.getUTCMonth() + 1)}${dois(d.getUTCDate())}T${dois(d.getUTCHours())}${dois(d.getUTCMinutes())}${dois(d.getUTCSeconds())}Z`;
}

/** Escapa texto do iCalendar: \ ; , e quebras de linha. */
export function escaparIcs(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const octetos = (s: string) => new TextEncoder().encode(s).length;

/** Dobra uma linha em pedaços de até 75 octetos (continuação começa com espaço), sem partir caracteres. */
export function dobrarLinha(linha: string): string {
  if (octetos(linha) <= 75) return linha;
  const partes: string[] = [];
  let atual = '';
  let limite = 75;
  for (const ch of linha) {
    if (octetos(atual + ch) > limite) {
      partes.push(atual);
      atual = ch;
      limite = 74; // a continuação ganha 1 octeto de espaço no início
    } else atual += ch;
  }
  if (atual) partes.push(atual);
  return partes.join('\r\n ');
}

/** Conteúdo do arquivo .ics (CRLF, como manda a RFC 5545). `agora` = DTSTAMP. */
export function gerarIcs(ev: EventoAgenda, agora: number = Date.now()): string {
  const descricao = ev.url ? `${ev.descricao}\n${ev.url}` : ev.descricao;
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sintonia//Apuracao 2026//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${dataIcs(agora)}`,
    `DTSTART:${dataIcs(ev.inicio)}`,
    `DTEND:${dataIcs(ev.fim)}`,
    `SUMMARY:${escaparIcs(ev.titulo)}`,
    `DESCRIPTION:${escaparIcs(descricao)}`,
    ...(ev.url ? [`URL:${ev.url}`, `LOCATION:${escaparIcs(ev.url)}`] : []),
    'TRANSP:TRANSPARENT',
    ...((ev.alarmeMin ?? 15) > 0
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escaparIcs(`${ev.titulo}: começa em ${ev.alarmeMin ?? 15} minutos`)}`, `TRIGGER:-PT${ev.alarmeMin ?? 15}M`, 'END:VALARM']
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n';
}

/** `data:` URL do .ics (UTF-8, percent-encoded). */
export function icsDataUrl(ev: EventoAgenda, agora?: number): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(gerarIcs(ev, agora))}`;
}

/** Link "criar evento" do Google Agenda. */
export function googleAgendaUrl(ev: EventoAgenda): string {
  const detalhes = ev.url ? `${ev.descricao}\n\n${ev.url}` : ev.descricao;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.titulo,
    dates: `${dataIcs(ev.inicio)}/${dataIcs(ev.fim)}`,
    details: detalhes,
    ctz: 'America/Sao_Paulo',
  });
  if (ev.url) p.set('location', ev.url);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Link "novo evento" do Outlook na web (contas pessoais). */
export function outlookAgendaUrl(ev: EventoAgenda): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.titulo,
    startdt: new Date(ev.inicio).toISOString(),
    enddt: new Date(ev.fim).toISOString(),
    body: ev.url ? `${ev.descricao}\n\n${ev.url}` : ev.descricao,
  });
  if (ev.url) p.set('location', ev.url);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}
