import { describe, expect, it } from 'vitest';
import { LIMITES_LEAD, normalizarWhatsApp, validaLead } from './leads';

const BASE = { nome: 'Ana Souza', empresa: 'Padaria Boa', email: 'ana@padaria.com.br', consentimento: true };

describe('validaLead', () => {
  it('aceita o mínimo e normaliza (espaços, e-mail minúsculo, formatos na ordem do contrato)', () => {
    const r = validaLead({ ...BASE, nome: '  Ana   Souza ', email: 'Ana@Padaria.com.BR', formatos: ['chat', 'topo', 'topo'], mensagem: ' Olá!\r\n\r\n\r\nQuero o topo. ' });
    expect('ok' in r).toBe(true);
    if ('ok' in r) {
      expect(r.ok.nome).toBe('Ana Souza');
      expect(r.ok.email).toBe('ana@padaria.com.br');
      expect(r.ok.formatos).toEqual(['topo', 'chat']);
      expect(r.ok.mensagem).toBe('Olá!\n\nQuero o topo.');
      expect(r.ok.whatsapp).toBeUndefined();
    }
  });

  it('diz o campo com problema', () => {
    const campo = (v: unknown) => {
      const r = validaLead(v);
      return 'erro' in r ? r.campo : null;
    };
    expect(campo({ ...BASE, nome: 'A' })).toBe('nome');
    expect(campo({ ...BASE, nome: '1234' })).toBe('nome');
    expect(campo({ ...BASE, empresa: '' })).toBe('empresa');
    expect(campo({ ...BASE, email: 'ana@' })).toBe('email');
    expect(campo({ ...BASE, email: 'ana@padaria' })).toBe('email');
    expect(campo({ ...BASE, whatsapp: '123' })).toBe('whatsapp');
    expect(campo({ ...BASE, formatos: ['topo', 'popup'] })).toBe('formatos');
    expect(campo({ ...BASE, mensagem: 'x'.repeat(LIMITES_LEAD.mensagem + 1) })).toBe('mensagem');
    expect(campo({ ...BASE, mensagem: 'https://a.com https://b.com https://c.com https://d.com' })).toBe('mensagem');
    expect(campo({ ...BASE, consentimento: false })).toBe('consentimento');
    expect(campo({ ...BASE, consentimento: 'sim' })).toBe('consentimento');
    expect(campo(null)).toBe('nome');
  });

  it('tira caracteres de controle e de direção de texto', () => {
    const r = validaLead({ ...BASE, empresa: 'Loja\u0000‮ X​', mensagem: 'a\u0007b' });
    expect('ok' in r && r.ok.empresa).toBe('Loja X');
    expect('ok' in r && r.ok.mensagem).toBe('a b');
  });

  it('WhatsApp: só dígitos; DDD + número ganha o 55', () => {
    expect(normalizarWhatsApp('(11) 99999-0000')).toBe('5511999990000');
    expect(normalizarWhatsApp('+55 11 99999-0000')).toBe('5511999990000');
    expect(normalizarWhatsApp('+351 912 345 678')).toBe('351912345678');
    const r = validaLead({ ...BASE, whatsapp: '(11) 3333-4444' });
    expect('ok' in r && r.ok.whatsapp).toBe('551133334444');
  });
});
