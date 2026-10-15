/** Chave do visitante para limites e contagem: IPv4 inteiro, IPv6 pelo prefixo /64, nunca o IP em claro. */
import { describe, expect, it } from 'vitest';
import { chaveCliente, redeDoCliente } from './auth';

describe('redeDoCliente', () => {
  it('IPv4 inteiro (e IPv4 dentro de IPv6)', () => {
    expect(redeDoCliente('203.0.113.7')).toBe('203.0.113.7');
    expect(redeDoCliente('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(redeDoCliente('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
  });
  it('IPv6: só o /64, com qualquer escrita do mesmo endereço', () => {
    const r = '2001:db8:abcd:12::/64';
    expect(redeDoCliente('2001:db8:abcd:12::1')).toBe(r);
    expect(redeDoCliente('2001:0db8:abcd:0012:ffff:1:2:3')).toBe(r);
    expect(redeDoCliente('2001:DB8:ABCD:12:0:0:0:9')).toBe(r);
    expect(redeDoCliente('[2001:db8:abcd:12::9]')).toBe(r);
    expect(redeDoCliente('2001:db8:abcd:12::9%eth0')).toBe(r);
    expect(redeDoCliente('2001:db8:abcd:13::1')).not.toBe(r);
    expect(redeDoCliente('::1')).toBe('0:0:0:0::/64');
    expect(redeDoCliente('64:ff9b::192.0.2.33')).toBe('64:ff9b:0:0::/64');
  });
  it('o que não é IP segue como está', () => {
    expect(redeDoCliente('desconhecido')).toBe('desconhecido');
    expect(redeDoCliente('1:2:3')).toBe('1:2:3');
  });
  it('chave: mesma faixa /64 → mesma chave; nunca o IP em claro', () => {
    const sal = Buffer.from('sal');
    expect(chaveCliente('2001:db8:1:2::a', sal)).toBe(chaveCliente('2001:db8:1:2:ffff::b', sal));
    expect(chaveCliente('2001:db8:1:2::a', sal)).not.toBe(chaveCliente('2001:db8:1:3::a', sal));
    expect(chaveCliente('203.0.113.7', sal)).not.toContain('203');
  });
});
