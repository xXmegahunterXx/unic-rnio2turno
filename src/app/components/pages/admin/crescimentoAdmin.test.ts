import { describe, expect, it } from 'vitest';
import type { DiaAudiencia } from '@/shared/audiencia';
import type { Lead } from '@/shared/leads';
import {
  csvAudienciaDias,
  csvAudienciaHoras,
  csvLeads,
  csvOrigens,
  dataHoraBrasilia,
  fmtTelefone,
  linkEmailLead,
  linkWhatsLead,
  somaOrigens,
  somaPorGrupo,
} from './crescimentoAdmin';

const NOITE = Date.UTC(2026, 9, 25, 22, 42);
const dia = (d: string, extra: Partial<DiaAudiencia> = {}): DiaAudiencia => ({
  dia: d,
  unicos: 10,
  paginas: 20,
  entradas: 5,
  porGrupo: { apuracao: 15, teste: 5 },
  origens: { x: 3, direto: 2 },
  pico: { valor: 7, em: NOITE, fonte: 'sinal' },
  reinicios: 0,
  ...extra,
});

const LEAD: Lead = {
  id: 'abc123',
  em: NOITE,
  nome: '=HYPERLINK("http://golpe")',
  empresa: '+cmd|calc',
  email: '@soma@x.com',
  whatsapp: '5511999990000',
  formatos: ['topo', 'chat'],
  mensagem: 'Linha 1\nLinha 2; com "aspas"',
  respondido: true,
  respondidoEm: NOITE + 3600_000,
};

describe('somas dos últimos dias', () => {
  it('páginas por grupo e origens, do maior para o menor', () => {
    const dias = [dia('2026-10-24'), dia('2026-10-25', { porGrupo: { inicio: 40 }, origens: { twitch: 9, 'uol.com.br': 1 } })];
    expect(somaPorGrupo(dias)).toEqual([
      ['inicio', 40],
      ['apuracao', 15],
      ['teste', 5],
    ]);
    expect(somaPorGrupo(dias, 1)).toEqual([['inicio', 40]]);
    const o = somaOrigens(dias, 7, 2);
    expect(o[0]).toEqual({ origem: 'twitch', rotulo: 'Twitch', entradas: 9 });
    expect(o[1]).toEqual({ origem: 'x', rotulo: 'X (Twitter)', entradas: 3 });
    expect(o.at(-1)).toEqual({ origem: '…', rotulo: 'Outras origens', entradas: 3 });
  });
});

describe('CSV', () => {
  it('por dia, por hora e origens: ";" + BOM, horário de Brasília', () => {
    const c = csvAudienciaDias([dia('2026-10-25')]);
    expect(c.startsWith('﻿dia;visitantes_unicos_estimados;paginas_vistas;entradas;pico_simultaneo;pico_em;reinicios_do_servidor;grupo_inicio;')).toBe(true);
    expect(c).toContain('2026-10-25;10;20;5;7;2026-10-25 19:42;0;0;15;');
    expect(csvAudienciaHoras([{ hora: Date.UTC(2026, 9, 25, 22), paginas: 3, pico: 2 }])).toContain('2026-10-25 19:00;3;2');
    expect(csvOrigens([dia('2026-10-25')])).toContain('2026-10-25;x;X (Twitter);3');
  });

  it('pedidos: texto que vira fórmula ganha apóstrofo; quebras e ";" entre aspas; telefone como texto', () => {
    const c = csvLeads([LEAD]);
    expect(c).toContain(`'=HYPERLINK`);
    expect(c).toContain(`'+cmd|calc`);
    expect(c).toContain(`'@soma@x.com`);
    expect(c).toContain('"Linha 1\nLinha 2; com ""aspas"""');
    expect(c).toContain(';"55 (11) 99999-0000";');
    expect(c).toContain('Faixa no topo (todas as páginas), Chat ao vivo da apuração');
    expect(c).toContain(';sim;2026-10-25 20:42');
    // nenhuma célula começa com = + - @ sem o apóstrofo
    for (const cel of c.replace(/^﻿/, '').split(/;|\r\n/)) expect(/^[=+\-@]/.test(cel.replace(/^"/, ''))).toBe(false);
    // o texto livre vai sempre entre aspas
    expect(c).toContain(`;"'@soma@x.com";`);
  });

  it('pedidos: injeção por vírgula (planilha que separa por ",") não vira fórmula', () => {
    const c = csvLeads([{ ...LEAD, nome: 'Ana', empresa: "ACME,=cmd|' /C calc'!A0", mensagem: 'oi,\t@SUM(1)' }]);
    expect(c).toContain(`"ACME,'=cmd|' /C calc'!A0"`);
    expect(c).toContain(`"oi,\t'@SUM(1)"`);
    // lido como CSV separado por vírgula, nenhum trecho começa com fórmula
    for (const cel of c.replace(/^﻿/, '').split(/[;,\r\n\t]/)) expect(/^[=+\-@]/.test(cel.replace(/^[\s"]+/, ''))).toBe(false);
  });
});

describe('contato', () => {
  it('telefone, e-mail e WhatsApp com a mensagem pronta', () => {
    expect(fmtTelefone('5511999990000')).toBe('+55 (11) 99999-0000');
    expect(fmtTelefone('551133334444')).toBe('+55 (11) 3333-4444');
    expect(fmtTelefone('351912345678')).toBe('+351912345678');
    expect(linkEmailLead({ email: 'ana@padaria.com.br', nome: 'Ana Souza' })).toMatch(/^mailto:ana@padaria\.com\.br\?subject=An%C3%BAncio%20no%20Sintonia&body=Ol%C3%A1%2C%20Ana!/);
    expect(linkWhatsLead({ whatsapp: '5511999990000', nome: 'Ana Souza' })).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=Ol%C3%A1%2C%20Ana!/);
    expect(linkWhatsLead({ nome: 'Ana' })).toBeNull();
    expect(dataHoraBrasilia(NOITE)).toBe('2026-10-25 19:42');
  });
});
