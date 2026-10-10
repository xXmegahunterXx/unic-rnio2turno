import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '@/shared/constants';
import { dataIcs, dobrarLinha, escaparIcs, eventoApuracao, FIM_EVENTO_APURACAO, gerarIcs, googleAgendaUrl, icsDataUrl, outlookAgendaUrl } from './agenda';

const URL_SITE = 'https://sintonia.app/apuracao';
const AGORA = Date.UTC(2026, 9, 10, 15, 4, 5);

describe('dataIcs', () => {
  it('25/10/2026 17h de Brasília = 20h UTC', () => {
    expect(dataIcs(INICIO_APURACAO)).toBe('20261025T200000Z');
    expect(dataIcs(FIM_EVENTO_APURACAO)).toBe('20261025T230000Z');
    expect(dataIcs(AGORA)).toBe('20261010T150405Z');
  });
});

describe('escaparIcs e dobrarLinha', () => {
  it('escapa barra, ponto e vírgula, vírgula e quebra de linha', () => {
    expect(escaparIcs('a\\b; c, d\ne')).toBe('a\\\\b\\; c\\, d\\ne');
  });
  it('dobra em ≤ 75 octetos sem partir caracteres acentuados', () => {
    const longa = `DESCRIPTION:${'apuração '.repeat(30)}`;
    const dobrada = dobrarLinha(longa);
    const partes = dobrada.split('\r\n');
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    for (const p of partes.slice(1)) expect(p.startsWith(' ')).toBe(true);
    // desdobrar devolve o texto original
    expect(partes.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(longa);
    expect(dobrarLinha('curta')).toBe('curta');
  });
});

describe('gerarIcs', () => {
  const ics = gerarIcs(eventoApuracao(URL_SITE), AGORA);
  it('é um VCALENDAR válido com CRLF e um VEVENT em UTC', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    expect(ics).toContain('DTSTART:20261025T200000Z');
    expect(ics).toContain('DTEND:20261025T230000Z');
    expect(ics).toContain('DTSTAMP:20261010T150405Z');
    expect(ics).toContain('UID:apuracao-2turno-2026@sintonia');
    expect(ics).toContain('SUMMARY:Apuração do 2º turno ao vivo');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain(`URL:${URL_SITE}`);
    // linhas ≤ 75 octetos
    for (const l of ics.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
  it('texto neutro: sem nomes de candidatos nem partidos', () => {
    expect(ics).not.toMatch(/Lula|Bolsonaro|Candidato [AB]/);
  });
  it('sem alarme quando alarmeMin = 0', () => {
    expect(gerarIcs({ ...eventoApuracao(), alarmeMin: 0 }, AGORA)).not.toContain('VALARM');
  });
  it('data URL decodifica para o mesmo conteúdo', () => {
    const u = icsDataUrl(eventoApuracao(URL_SITE), AGORA);
    expect(u.startsWith('data:text/calendar;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(u.split(',').slice(1).join(','))).toBe(ics);
  });
});

describe('links das agendas web', () => {
  it('Google Agenda com datas UTC, fuso de Brasília e o link', () => {
    const u = new URL(googleAgendaUrl(eventoApuracao(URL_SITE)));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('dates')).toBe('20261025T200000Z/20261025T230000Z');
    expect(u.searchParams.get('ctz')).toBe('America/Sao_Paulo');
    expect(u.searchParams.get('details')).toContain(URL_SITE);
    expect(u.searchParams.get('text')).toBe('Apuração do 2º turno ao vivo');
  });
  it('Outlook com início e fim ISO', () => {
    const u = new URL(outlookAgendaUrl(eventoApuracao(URL_SITE)));
    expect(u.searchParams.get('startdt')).toBe('2026-10-25T20:00:00.000Z');
    expect(u.searchParams.get('enddt')).toBe('2026-10-25T23:00:00.000Z');
  });
});
