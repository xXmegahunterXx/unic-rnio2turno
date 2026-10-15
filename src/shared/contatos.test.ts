import { describe, expect, it } from 'vitest';
import { cnpjValido, contatosEfetivos, emailProvisorio, formatarCnpj, validaContatosPublicos } from './contatos';

describe('contatos públicos (painel → Comunicação)', () => {
  it('valida e-mails, recusa domínio reservado e campos desconhecidos; vazio sai', () => {
    expect(validaContatosPublicos(null)).toEqual({ ok: {} });
    expect(validaContatosPublicos({ geral: ' Contato@Sintonia2026.com.br ', imprensa: '' })).toEqual({ ok: { geral: 'contato@sintonia2026.com.br' } });
    expect(validaContatosPublicos({ privacidade: 'privacidade@sintonia.example' })).toMatchObject({ erro: expect.stringMatching(/reservado/) });
    expect(validaContatosPublicos({ correcoes: 'a@b.test' })).toMatchObject({ erro: expect.stringMatching(/reservado/) });
    expect(validaContatosPublicos({ geral: 'sem-arroba' })).toMatchObject({ erro: expect.stringMatching(/geral inválido/) });
    expect(validaContatosPublicos({ geral: 'a@b.com', site: 'x' })).toMatchObject({ erro: expect.stringMatching(/desconhecido/) });
    expect(validaContatosPublicos({ geral: 42 })).toMatchObject({ erro: expect.any(String) });
    expect(validaContatosPublicos([])).toMatchObject({ erro: expect.any(String) });
  });

  it('responsável e CNPJ: CNPJ com dígitos verificadores, só junto com o nome; sem links no nome', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(validaContatosPublicos({ responsavel: 'Sintonia Mídia Ltda.', cnpj: '11.222.333/0001-81' })).toEqual({
      ok: { responsavel: 'Sintonia Mídia Ltda.', cnpj: '11222333000181' },
    });
    expect(validaContatosPublicos({ cnpj: '11222333000181' })).toMatchObject({ erro: expect.stringMatching(/razão social/) });
    expect(validaContatosPublicos({ responsavel: 'X', cnpj: '' })).toMatchObject({ erro: expect.any(String) });
    expect(validaContatosPublicos({ responsavel: 'Veja https://golpe.com' })).toMatchObject({ erro: expect.stringMatching(/sem links/) });
    expect(validaContatosPublicos({ responsavel: 'Fulano', cnpj: '123' })).toMatchObject({ erro: expect.stringMatching(/CNPJ/) });
  });

  it('efetivos: o geral cai no e-mail da /anuncie; privacidade e correções não caem em outro; nunca .example', () => {
    expect(emailProvisorio('contato@sintonia.example')).toBe(true);
    const nada = contatosEfetivos(null, null);
    expect(nada).toMatchObject({ geral: null, privacidade: null, algum: false });
    const soAnuncie = contatosEfetivos(null, { email: 'comercial@empresa.com.br' });
    expect(soAnuncie).toMatchObject({ geral: 'comercial@empresa.com.br', privacidade: null, correcoes: null, algum: true });
    expect(contatosEfetivos(null, { email: 'x@sintonia.example' }).geral).toBeNull();
    const tudo = contatosEfetivos({ geral: 'a@b.com', privacidade: 'p@b.com', responsavel: 'Fulano', cnpj: '11222333000181' }, { email: 'c@d.com' });
    expect(tudo).toMatchObject({ geral: 'a@b.com', privacidade: 'p@b.com', responsavel: 'Fulano', cnpj: '11222333000181' });
  });
});
