/**
 * Leva 3 no servidor: validação (zod) dos comandos novos do painel e o caminho HTTP mínimo — as "Chaves da noite"
 * gravam em state.noite sem mudar a versão, o freio sai no /api/status como `carga`, e as ações sem peça ligada
 * (alerta-teste sem alertas, precos-anuncie) respondem 400 "indisponível nesta versão" sem mudar nada.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import { CHAVES_NOITE_PADRAO } from '../shared/chaves-noite';
import type { LiveStatus } from '../shared/types';
import { comando, login, montar, type Montado } from './test-helpers';
import { parseAdminCommand } from './validation';

const aceita = (v: unknown) => expect(() => parseAdminCommand(v), JSON.stringify(v)).not.toThrow();
const recusa = (v: unknown, msg?: RegExp) => expect(() => parseAdminCommand(v), JSON.stringify(v)).toThrow(msg ?? /./);

describe('validação dos comandos da leva 3', () => {
  it('freio: fator 1, 2, 3 ou 5; leve opcional; nada além disso', () => {
    for (const fator of [1, 2, 3, 5]) aceita({ tipo: 'freio', fator });
    aceita({ tipo: 'freio', fator: 2, leve: true });
    aceita({ tipo: 'freio', fator: 1, leve: false });
    for (const fator of [0, 4, 6, 2.5, '2', null]) recusa({ tipo: 'freio', fator }, /fator/);
    recusa({ tipo: 'freio' });
    recusa({ tipo: 'freio', fator: 2, leve: 'sim' });
    recusa({ tipo: 'freio', fator: 2, extra: 1 });
  });

  it('chaves liga/desliga: só `ligado` booleano', () => {
    for (const tipo of ['contador-publico', 'html-borda', 'medir-anuncios', 'texto-bots', 'contar-lives']) {
      aceita({ tipo, ligado: true });
      aceita({ tipo, ligado: false });
      recusa({ tipo });
      recusa({ tipo, ligado: 'true' });
      recusa({ tipo, ligado: 1 });
      recusa({ tipo, ligado: true, extra: 1 });
    }
  });

  it('aviso-nacional: "auto" ou "off"', () => {
    aceita({ tipo: 'aviso-nacional', modo: 'auto' });
    aceita({ tipo: 'aviso-nacional', modo: 'off' });
    recusa({ tipo: 'aviso-nacional', modo: 'on' }, /auto|off/);
    recusa({ tipo: 'aviso-nacional' });
  });

  it('tse-retomar e alerta-teste: sem campos', () => {
    aceita({ tipo: 'tse-retomar' });
    aceita({ tipo: 'alerta-teste' });
    recusa({ tipo: 'tse-retomar', agora: true });
    recusa({ tipo: 'alerta-teste', texto: 'oi' });
  });

  it('precos-anuncie: até 6 pacotes, centavos inteiros, textos com limite; [] limpa', () => {
    aceita({ tipo: 'precos-anuncie', itens: [] });
    aceita({ tipo: 'precos-anuncie', itens: [{ nome: 'Apoio na noite', aPartirDeCentavos: 75_000, detalhe: '25 mil impressões' }, { nome: 'Chat', aPartirDeCentavos: 100_000 }] });
    const item = { nome: 'X', aPartirDeCentavos: 30_000 };
    recusa({ tipo: 'precos-anuncie', itens: Array(7).fill(item) }, /6/);
    recusa({ tipo: 'precos-anuncie', itens: [{ ...item, aPartirDeCentavos: 300.5 }] });
    recusa({ tipo: 'precos-anuncie', itens: [{ ...item, aPartirDeCentavos: 0 }] });
    recusa({ tipo: 'precos-anuncie', itens: [{ ...item, nome: '   ' }] });
    recusa({ tipo: 'precos-anuncie', itens: [{ ...item, nome: 'n'.repeat(61) }] });
    recusa({ tipo: 'precos-anuncie', itens: [{ ...item, detalhe: 'd'.repeat(141) }] });
    recusa({ tipo: 'precos-anuncie', itens: [{ ...item, url: 'https://x.com' }] });
    recusa({ tipo: 'precos-anuncie' });
  });

  it('tse.limitePorSeg: inteiro de 5 a 90', () => {
    aceita({ tipo: 'tse', tse: { limitePorSeg: 40 } });
    aceita({ tipo: 'tse', tse: { limitePorSeg: 5 } });
    aceita({ tipo: 'tse', tse: { limitePorSeg: 90 } });
    recusa({ tipo: 'tse', tse: { limitePorSeg: 4 } });
    recusa({ tipo: 'tse', tse: { limitePorSeg: 91 } });
    recusa({ tipo: 'tse', tse: { limitePorSeg: 40.5 } });
  });

  it('comandos antigos continuam iguais', () => {
    aceita({ tipo: 'tse', tse: { intervaloSeg: 15, intervaloPrioritarioSeg: 5 } });
    aceita({ tipo: 'anuncios-suspensao', suspender: true });
    recusa({ tipo: 'nada' });
  });
});

describe('POST /api/admin/command (leva 3)', () => {
  let m: Montado;
  let cookie: string;
  beforeAll(async () => {
    m = await montar();
    cookie = await login(m);
  });
  const status = async () => (await (await m.app.request('/api/status')).json()) as LiveStatus;

  it('estado novo já sai com as chaves padrão e o limite do TSE', async () => {
    const r = await m.app.request('/api/admin/state', { headers: { cookie } });
    const snap = (await r.json()) as AdminSnapshot;
    expect(snap.state.noite).toEqual(CHAVES_NOITE_PADRAO);
    expect(snap.state.tse.limitePorSeg).toBe(40);
    expect('carga' in snap.status).toBe(false);
  });

  it('freio: 200, gravado, no /api/status como `carga` (até 1 s depois) e sem mudar a versão', async () => {
    const v0 = m.controller.state().versao;
    const r = await comando(m, cookie, { tipo: 'freio', fator: 3, leve: true });
    expect(r.status).toBe(200);
    const snap = (await r.json()) as AdminSnapshot;
    expect(snap.state.noite?.freio).toEqual({ fator: 3, leve: true });
    expect(snap.state.versao).toBe(v0);
    m.relogio.t += 1000; // o /api/status é montado no máximo 1×/s
    expect((await status()).carga).toEqual({ fator: 3, leve: true });
    expect((await comando(m, cookie, { tipo: 'freio', fator: 1 })).status).toBe(200);
    m.relogio.t += 1000;
    expect('carga' in (await status())).toBe(false);
    expect(m.controller.state().versao).toBe(v0);
  });

  it('chave liga/desliga: 200 e gravada; valor inválido: 400', async () => {
    const r = await comando(m, cookie, { tipo: 'html-borda', ligado: true });
    expect(r.status).toBe(200);
    expect(((await r.json()) as AdminSnapshot).state.noite?.htmlBorda).toBe(true);
    expect((await comando(m, cookie, { tipo: 'html-borda', ligado: 'sim' })).status).toBe(400);
    expect((await comando(m, cookie, { tipo: 'html-borda', ligado: false })).status).toBe(200);
  });

  it('ações sem peça ligada: 400 "indisponível nesta versão", nada muda; tse-retomar (frente B) não mexe no estado', async () => {
    const antes = m.controller.toJSON();
    // sem alertas (test-helpers não os liga) e sem dono para os preços (I13 ficou para depois de 26/10)
    for (const cmd of [{ tipo: 'alerta-teste' }, { tipo: 'precos-anuncie', itens: [] }]) {
      const r = await comando(m, cookie, cmd);
      expect(r.status).toBe(400);
      expect(((await r.json()) as { erro: string }).erro).toMatch(/indisponível nesta versão/);
    }
    // leva 3: o servidor executa 'tse-retomar' no TseManager (sem pausa em curso, não faz nada) — saude-noite.test.ts
    expect((await comando(m, cookie, { tipo: 'tse-retomar' })).status).toBe(200);
    expect(m.controller.toJSON()).toBe(antes);
  });
});
