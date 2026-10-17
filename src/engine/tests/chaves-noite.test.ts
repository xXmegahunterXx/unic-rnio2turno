/**
 * Leva 3 no motor: "Chaves da noite" (gravadas em state.noite sem incrementar a versão), freio no status
 * (`carga`), `tse.limitePorSeg`, ações só do servidor recusadas sem mudar nada, e a leitura de estado ANTIGO (admin.json
 * gravado antes da leva 3, sem `noite` nem `tse.limitePorSeg`) e de outra instância durante a atualização.
 */
import { describe, expect, it, vi } from 'vitest';
import { CHAVES_NOITE_PADRAO } from '../../shared/chaves-noite';
import type { AdminCommand } from '../../shared/api';
import type { AdminState } from '../../shared/types';
import { CommandError, type LoadedDataset } from '../api';
import { createController } from '../controller';
import { estadoMaisNovo } from '../sync';
import { cenarioPadrao } from '../scenario';
import { estadoPadrao, parseAdminState } from '../state';
import { buildStructure } from '../structure';
import { dataset, relogio } from './helpers';

const ds: LoadedDataset = await dataset();
const st = buildStructure(ds);

/** admin.json como a leva 2 / anunciantes v2 gravavam: sem `noite` e sem `tse.limitePorSeg`. */
function estadoAntigo(): Record<string, unknown> {
  const s = JSON.parse(JSON.stringify(estadoPadrao('servidor', Date.UTC(2026, 9, 16, 15, 0), cenarioPadrao(st), st))) as Record<string, unknown>;
  delete s.noite;
  delete (s.tse as Record<string, unknown>).limitePorSeg;
  s.versao = 42;
  s.aviso = { nivel: 'info', texto: 'Aviso salvo antes' };
  return s;
}

const novo = (initialState?: unknown) => {
  const r = relogio(Date.UTC(2026, 9, 25, 21, 0));
  const onStateChange = vi.fn();
  const c = createController(ds, { modo: 'servidor', now: r.now, onStateChange, initialState: initialState as AdminState | undefined });
  return { c, r, onStateChange };
};

describe('estado salvo antes da leva 3', () => {
  it('sem `noite` nem `tse.limitePorSeg` → padrões; o resto do estado intacto; status sem `carga`', () => {
    const antigo = estadoAntigo();
    for (const ini of [antigo, JSON.stringify(antigo)]) {
      const { c } = novo(ini);
      const s = c.state();
      expect(s.versao).toBe(42);
      expect(s.aviso).toEqual({ nivel: 'info', texto: 'Aviso salvo antes' });
      expect(s.noite).toEqual(CHAVES_NOITE_PADRAO);
      expect(s.tse.limitePorSeg).toBe(40);
      expect(s.tse.intervaloSeg).toBe(15);
      expect('carga' in c.status()).toBe(false);
    }
  });

  it('chaves ruins ou limite fora da faixa → campo a campo para o padrão/limite (nunca lança)', () => {
    const fb = estadoPadrao('servidor', 0, cenarioPadrao(st), st);
    const p = parseAdminState({ ...estadoAntigo(), noite: { freio: { fator: 9 }, htmlBorda: 'sim', textoBots: false }, tse: { limitePorSeg: 500 } }, fb, st);
    expect(p.noite).toEqual({ ...CHAVES_NOITE_PADRAO, freio: { fator: 1, leve: false }, textoBots: false });
    expect(p.tse.limitePorSeg).toBe(90);
    expect(parseAdminState({ tse: { limitePorSeg: 1 } }, fb, st).tse.limitePorSeg).toBe(5);
    expect(parseAdminState({ tse: { limitePorSeg: 'x' } }, fb, st).tse.limitePorSeg).toBe(40);
  });

  it('estado novo → JSON → estado: as chaves e o limite sobrevivem (ida e volta)', () => {
    const { c } = novo();
    c.command({ tipo: 'freio', fator: 3, leve: true });
    c.command({ tipo: 'html-borda', ligado: true });
    c.command({ tipo: 'tse', tse: { limitePorSeg: 25 } });
    const b = novo(JSON.parse(c.toJSON())).c;
    expect(b.state().noite).toEqual(c.state().noite);
    expect(b.state().tse.limitePorSeg).toBe(25);
    expect(b.status().carga).toEqual({ fator: 3, leve: true });
  });

  it('outra instância ainda na versão anterior (estado sem `noite`): mantém as chaves atuais', () => {
    const { c } = novo();
    c.command({ tipo: 'freio', fator: 2 });
    c.setState({ ...estadoAntigo(), versao: c.state().versao + 1 } as unknown as AdminState);
    expect(c.state().noite?.freio).toEqual({ fator: 2, leve: false });
  });
});

describe('chaves da noite', () => {
  it('freio: grava, vai ao status como `carga` só quando puxado, e NÃO incrementa a versão', () => {
    const { c, onStateChange } = novo();
    const v0 = c.state().versao;
    expect(c.status().carga).toBeUndefined();
    c.command({ tipo: 'freio', fator: 2 });
    expect(c.status().carga).toEqual({ fator: 2 });
    expect(c.state().noite?.freio).toEqual({ fator: 2, leve: false });
    c.command({ tipo: 'freio', fator: 5, leve: true });
    expect(c.status().carga).toEqual({ fator: 5, leve: true });
    c.command({ tipo: 'freio', fator: 1 });
    expect('carga' in c.status()).toBe(false);
    expect(c.state().versao).toBe(v0);
    expect(c.status().versao).toBe(v0);
    expect(onStateChange).toHaveBeenCalledTimes(3); // gravado (e sincronizado entre instâncias) a cada mudança
    expect(c.metrics().log.at(-1)?.msg).toMatch(/Freio solto/);
  });

  it('liga/desliga e aviso nacional: gravam o campo certo, sem tocar nos outros nem na versão', () => {
    const { c } = novo();
    const v0 = c.state().versao;
    const cmds: [AdminCommand, Partial<typeof CHAVES_NOITE_PADRAO>][] = [
      [{ tipo: 'contador-publico', ligado: false }, { contadorPublico: false }],
      [{ tipo: 'html-borda', ligado: true }, { htmlBorda: true }],
      [{ tipo: 'medir-anuncios', ligado: false }, { medirAnuncios: false }],
      [{ tipo: 'texto-bots', ligado: false }, { textoBots: false }],
      [{ tipo: 'contar-lives', ligado: false }, { contarLives: false }],
      [{ tipo: 'aviso-nacional', modo: 'off' }, { avisoNacional: 'off' }],
      // integração da leva 3: peças novas da noite
      [{ tipo: 'faixa-conexao', ligado: false }, { faixaConexao: false }],
      [{ tipo: 'carimbo-print', ligado: false }, { carimboPrint: false }],
      [{ tipo: 'meta-placar', ligado: false }, { metaPlacar: false }],
      [{ tipo: 'medir-local', ligado: false }, { medirLocal: false }],
      [{ tipo: 'pausa-tse', modo: 'restrita' }, { pausaTse: 'restrita' }],
      [{ tipo: 'pausa-tse', modo: 'off' }, { pausaTse: 'off' }],
    ];
    let esperado = { ...CHAVES_NOITE_PADRAO, freio: { ...CHAVES_NOITE_PADRAO.freio } };
    for (const [cmd, campo] of cmds) {
      c.command(cmd);
      esperado = { ...esperado, ...campo };
      expect(c.state().noite).toEqual(esperado);
    }
    expect(c.state().versao).toBe(v0);
    c.command({ tipo: 'aviso-nacional', modo: 'auto' });
    expect(c.state().noite?.avisoNacional).toBe('auto');
    // faixa e carimbo desligados vão ao site (status); ligados, o campo some
    expect(c.status()).toMatchObject({ semFaixaConexao: true, semCarimbo: true });
    c.command({ tipo: 'faixa-conexao', ligado: true });
    c.command({ tipo: 'carimbo-print', ligado: true });
    expect('semFaixaConexao' in c.status() || 'semCarimbo' in c.status()).toBe(false);
  });

  it('valores inválidos → CommandError, nada muda', () => {
    const { c, onStateChange } = novo();
    const antes = c.toJSON();
    expect(() => c.command({ tipo: 'freio', fator: 4 } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'freio', fator: 2, leve: 'sim' } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'html-borda', ligado: 1 } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'aviso-nacional', modo: 'sempre' } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'pausa-tse', modo: 'nunca' } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'faixa-conexao', ligado: 'nao' } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'tse', tse: { limitePorSeg: 4 } })).toThrow(/5 e 90/);
    expect(() => c.command({ tipo: 'tse', tse: { limitePorSeg: 40.5 } })).toThrow(CommandError);
    expect(c.toJSON()).toBe(antes);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('tse.limitePorSeg: grava e incrementa a versão como os outros campos do TSE', () => {
    const { c } = novo();
    const v0 = c.state().versao;
    c.command({ tipo: 'tse', tse: { limitePorSeg: 60 } });
    expect(c.state().tse.limitePorSeg).toBe(60);
    expect(c.state().tse.intervaloSeg).toBe(15);
    expect(c.state().versao).toBe(v0 + 1);
  });

  it('ações do servidor (tse-retomar, alerta-teste, precos-anuncie): recusadas aqui sem mudar nada', () => {
    const { c, onStateChange } = novo();
    const antes = c.toJSON();
    for (const cmd of [{ tipo: 'tse-retomar' }, { tipo: 'alerta-teste' }, { tipo: 'precos-anuncie', itens: [] }] as AdminCommand[]) {
      expect(() => c.command(cmd)).toThrow(/indisponível nesta versão/);
    }
    expect(c.toJSON()).toBe(antes);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('demo: as chaves também funcionam, e a versão sobe (as abas se sincronizam pela versão)', () => {
    const r = relogio(Date.UTC(2026, 9, 9, 15, 0));
    const c = createController(ds, { modo: 'demo', now: r.now });
    expect(c.state().noite).toEqual(CHAVES_NOITE_PADRAO);
    const v0 = c.state().versao;
    c.command({ tipo: 'freio', fator: 3 });
    expect(c.status().carga).toEqual({ fator: 3 });
    c.command({ tipo: 'html-borda', ligado: true });
    const antes = c.state();
    c.command({ tipo: 'html-borda', ligado: false }); // "false" < "true" no JSON: sem versão nova, a aba voltaria atrás
    expect(c.state().versao).toBe(v0 + 3);
    expect(estadoMaisNovo(c.state(), antes)).toBe(true);
  });
});
