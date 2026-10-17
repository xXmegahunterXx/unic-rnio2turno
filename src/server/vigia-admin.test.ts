/**
 * Vigia do admin.json (vigia-admin.ts) — regressão da leva 3: chaves da noite trocadas em sequência rápida não podem
 * voltar sozinhas ao valor anterior (o vigia adotava a gravação atrasada da própria instância, de mesma versão).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createController } from '../engine/controller';
import type { AdminState } from '../shared/types';
import { createJsonStore } from './state-store';
import { datasetReal } from './test-helpers';
import { decidirAdocao, vigiarAdmin } from './vigia-admin';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logMudo = () => {
  const linhas: string[] = [];
  return { linhas, info: (m: string) => linhas.push(m), aviso: (m: string) => linhas.push(m), erro: (m: string) => linhas.push(m) };
};

describe('decidirAdocao (pura)', () => {
  const base = { versao: 7, fonte: 'pre', noite: { textoBots: true } } as unknown as AdminState;
  const nunca = { gravadoPorMim: () => false, permitirSimulacao: false };

  it('gravação da própria instância é ignorada mesmo com a mesma versão e conteúdo diferente', () => {
    const antigo = JSON.stringify({ ...base, noite: { textoBots: false } });
    const r = decidirAdocao(antigo, base, { gravadoPorMim: (t) => t === antigo, permitirSimulacao: false });
    expect(r).toEqual({ acao: 'ignorar', motivo: 'proprio' });
  });

  it('outra instância com a mesma versão e conteúdo diferente é adotada (chaves sem versão nova)', () => {
    const outro = { ...base, noite: { textoBots: false } };
    const r = decidirAdocao(JSON.stringify(outro), base, nunca);
    expect(r.acao).toBe('adotar');
  });

  it('versão menor, igual ao atual, vazio, inválido e simulação sem ALLOW_SIMULACAO', () => {
    expect(decidirAdocao(JSON.stringify({ ...base, versao: 6 }), base, nunca)).toEqual({ acao: 'ignorar', motivo: 'antigo' });
    expect(decidirAdocao(JSON.stringify(base), base, nunca)).toEqual({ acao: 'ignorar', motivo: 'igual' });
    expect(decidirAdocao(null, base, nunca)).toEqual({ acao: 'ignorar', motivo: 'vazio' });
    expect(decidirAdocao('{"versao":', base, nunca)).toEqual({ acao: 'ignorar', motivo: 'invalido' });
    expect(decidirAdocao(JSON.stringify({ ...base, versao: 9, fonte: 'simulacao' }), base, nunca)).toEqual({ acao: 'recusar-simulacao', versao: 9 });
  });
});

describe('state-store: lembrar as próprias gravações', () => {
  it('reconhece só as últimas N gravações deste processo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-vigia-'));
    const st = createJsonStore(dir, 'x.json', { debounceMs: 0, lembrar: 2 });
    for (const n of [1, 2, 3]) {
      st.salvar({ n });
      await st.flush();
    }
    expect(st.lerTexto()).toBe('{"n":3}');
    expect(st.gravadoPorMim('{"n":3}')).toBe(true);
    expect(st.gravadoPorMim('{"n":2}')).toBe(true);
    expect(st.gravadoPorMim('{"n":1}')).toBe(false); // saiu da memória (lembrar: 2)
    expect(createJsonStore(dir, 'x.json').gravadoPorMim('{"n":3}')).toBe(false); // sem `lembrar`: nunca
  });
});

describe('vigiarAdmin com o motor real e o arquivo em disco', () => {
  it('chaves em sequência rápida: o vigia vê a gravação anterior com o comando seguinte já aplicado — nada volta atrás', async () => {
    const ds = await datasetReal();
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-vigia-'));
    // debounce de 250 ms como no main.ts; vigia a cada 50 ms (no main.ts, 1 s: a janela é a mesma, só mais rara)
    const store = createJsonStore(dir, 'admin.json', { lembrar: 20 });
    const controller = createController(ds, { modo: 'servidor', onStateChange: (s) => store.salvar(s) });
    store.salvar(controller.state());
    await store.flush();
    const log = logMudo();
    const parar = vigiarAdmin({ store, controller, permitirSimulacao: false, log, intervaloMs: 50 });
    try {
      await espera(150);
      for (const ligar of [false, true, false]) {
        // A gravado; B aplicado e ainda no debounce; o vigia vê o arquivo A (mesma versão, conteúdo ≠ do estado B)
        controller.command({ tipo: 'texto-bots', ligado: ligar });
        await store.flush();
        controller.command({ tipo: 'contar-lives', ligado: ligar });
        await espera(150);
        // C chega depois: com o defeito, o vigia já tinha adotado A e C era aplicado sobre ele (B perdido de vez)
        controller.command({ tipo: 'freio', fator: ligar ? 1 : 3, leve: !ligar });
        await espera(700);
        const n = controller.state().noite!;
        expect(n.textoBots).toBe(ligar);
        expect(n.contarLives).toBe(ligar);
        expect(n.freio).toEqual({ fator: ligar ? 1 : 3, leve: !ligar });
        expect((JSON.parse(store.lerTexto()!) as AdminState).noite).toEqual(n);
      }
      expect(log.linhas.filter((l) => l.includes('sincronizado de outra instância'))).toEqual([]);
    } finally {
      parar();
    }
  }, 20_000);

  it('o arquivo escrito por OUTRA instância (mesma versão, chave diferente) continua sendo adotado', async () => {
    const ds = await datasetReal();
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-vigia-'));
    const store = createJsonStore(dir, 'admin.json', { debounceMs: 0, lembrar: 20 });
    const controller = createController(ds, { modo: 'servidor', onStateChange: (s) => store.salvar(s) });
    store.salvar(controller.state());
    await store.flush();
    const log = logMudo();
    const parar = vigiarAdmin({ store, controller, permitirSimulacao: false, log, intervaloMs: 50 });
    try {
      await espera(120);
      const outro = { ...controller.state(), noite: { ...controller.state().noite!, htmlBorda: true } };
      writeFileSync(store.caminho, JSON.stringify(outro));
      await espera(400);
      expect(controller.state().noite!.htmlBorda).toBe(true);
      expect(log.linhas.some((l) => l.includes('sincronizado de outra instância'))).toBe(true);
    } finally {
      parar();
    }
  }, 10_000);
});
