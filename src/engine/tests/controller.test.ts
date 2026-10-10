/**
 * Controller: estado padrão por modo, fontes, relógio, comandos do admin, congelamento, fases,
 * serialização, métricas e o hospedeiro RPC usado pelo Worker do demo.
 */
import { describe, expect, it, vi } from 'vitest';
import { INICIO_APURACAO } from '../../shared/constants';
import type { AdminState } from '../../shared/types';
import { CommandError, type LoadedDataset } from '../api';
import { createController, ENCERRAMENTO_MS } from '../controller';
import { createEngineHost, type HostOut } from '../host';
import { fsJsonLoader } from '../node';
import { buildStructure } from '../structure';
import { estadoPadrao, parseAdminState } from '../state';
import { cenarioPadrao } from '../scenario';
import { dataset, PUBLIC_DIR, relogio } from './helpers';

const INI = INICIO_APURACAO;
const ds: LoadedDataset = await dataset();
const st = buildStructure(ds);

describe('estado padrão', () => {
  it('servidor: fonte "pre", relógio real; 2º turno fica em 0% mesmo depois das 17h', () => {
    const r = relogio(Date.UTC(2026, 9, 9, 15, 0));
    const c = createController(ds, { modo: 'servidor', now: r.now });
    const s = c.status();
    expect(s.fonte).toBe('pre');
    expect(s.fase).toBe('pre');
    expect(s.simNow).toBe(r.now());
    expect(s.simulacao).toBe(false);
    expect(s.versao).toBe(1);
    expect(s.races).toContain('pres-t1');
    expect(c.nacional('pres-t1').resumo.status).toBe('encerrada');
    r.set(INI + 2 * 3600_000); // 25/10 19h com a fonte ainda em "pre"
    const n = c.nacional('pres');
    expect(n.resumo.secoesTotalizadas).toBe(0);
    expect(n.resumo.status).toBe('aguardando');
    expect(n.eventos).toEqual([]);
    expect(n.serie).toEqual([]);
    expect(n.simNow).toBe(INI + 2 * 3600_000);
    expect(c.status().fase).toBe('pre');
  });

  it('demo: simulação a 20× a partir de 16:59:30', () => {
    const w0 = Date.UTC(2026, 9, 9, 15, 0);
    const r = relogio(w0);
    const c = createController(ds, { modo: 'demo', now: r.now });
    let s = c.status();
    expect(s.fonte).toBe('simulacao');
    expect(s.simulacao).toBe(true);
    expect(s.velocidade).toBe(20);
    expect(s.pausado).toBe(false);
    expect(s.simNow).toBe(INI - 30_000);
    expect(s.fase).toBe('pre');
    r.add(1500); // 1,5 s × 20 = 30 s
    expect(c.status().simNow).toBe(INI);
    r.add(3 * 60_000); // +60 min simulados
    s = c.status();
    expect(s.fase).toBe('apurando');
    const n = c.nacional('pres');
    const pct = (100 * n.resumo.secoesTotalizadas) / n.resumo.secoes;
    expect(pct).toBeGreaterThan(45);
    expect(pct).toBeLessThan(65);
  });
});

describe('comandos', () => {
  const novo = (modo: 'servidor' | 'demo' = 'servidor') => {
    const r = relogio(Date.UTC(2026, 9, 25, 12, 0));
    const onStateChange = vi.fn();
    const c = createController(ds, { modo, now: r.now, onStateChange });
    return { c, r, onStateChange };
  };

  it('relógio: iniciar (sai de "pre"), pausar, retomar, reiniciar, velocidade', () => {
    const { c, r, onStateChange } = novo();
    c.command({ tipo: 'relogio', acao: 'iniciar' });
    let s = c.status();
    expect(s.fonte).toBe('simulacao');
    expect(s.simNow).toBe(INI - 30_000);
    expect(s.pausado).toBe(false);
    expect(s.versao).toBe(2);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    r.add(10_000);
    expect(c.status().simNow).toBe(INI - 20_000); // velocidade 1
    c.command({ tipo: 'velocidade', velocidade: 60 });
    r.add(1000);
    expect(c.status().simNow).toBe(INI + 40_000);
    c.command({ tipo: 'relogio', acao: 'pausar' });
    r.add(60_000);
    expect(c.status().simNow).toBe(INI + 40_000);
    expect(c.status().pausado).toBe(true);
    c.command({ tipo: 'relogio', acao: 'retomar' });
    r.add(1000);
    expect(c.status().simNow).toBe(INI + 100_000);
    c.command({ tipo: 'relogio', acao: 'reiniciar' });
    s = c.status();
    expect(s.simNow).toBe(INI - 30_000);
    expect(s.pausado).toBe(true);
    expect(s.velocidade).toBe(60);
    expect(s.versao).toBe(6); // 1 + 5 comandos
    expect(onStateChange).toHaveBeenCalledTimes(5);
    expect(onStateChange.mock.calls.at(-1)![0].versao).toBe(6);
  });

  it('saltar-pct usa a curva pré-calculada; saltar-tempo; marcos e fim previsto', () => {
    const { c } = novo('demo');
    c.command({ tipo: 'relogio', acao: 'pausar' });
    for (const pct of [1, 12.5, 50, 99, 100]) {
      c.command({ tipo: 'saltar-pct', pct });
      const n = c.nacional('pres').resumo;
      expect((100 * n.secoesTotalizadas) / n.secoes).toBeGreaterThanOrEqual(pct);
      c.command({ tipo: 'saltar-tempo', simNow: c.simNow() - 1000 });
      const a = c.nacional('pres').resumo;
      expect((100 * a.secoesTotalizadas) / a.secoes).toBeLessThan(pct + 0.5);
    }
    const marcos = c.marcos();
    expect(marcos.map((m) => m.pct)).toEqual([1, 10, 25, 50, 75, 90, 99, 100]);
    for (let i = 1; i < marcos.length; i++) expect(marcos[i].t).toBeGreaterThan(marcos[i - 1].t);
    expect(c.fimPrevisto()).toBe(marcos.at(-1)!.t);
    const snap = c.adminSnapshot();
    expect(snap.marcos).toEqual(marcos);
    expect(snap.fimPrevisto).toBe(marcos.at(-1)!.t);
    expect(() => c.command({ tipo: 'saltar-pct', pct: 101 })).toThrow(CommandError);
  });

  it('fase: pre → apurando → encerrada (100% + 5 min)', () => {
    const { c } = novo('demo');
    c.command({ tipo: 'relogio', acao: 'pausar' });
    expect(c.status().fase).toBe('pre');
    c.command({ tipo: 'saltar-pct', pct: 100 });
    expect(c.status().fase).toBe('apurando');
    c.command({ tipo: 'saltar-tempo', simNow: c.fimPrevisto()! + ENCERRAMENTO_MS });
    expect(c.status().fase).toBe('encerrada');
  });

  it('cenário: reconstrói o modelo, mantém simNow, incrementa versão, valida', () => {
    const { c } = novo('demo');
    c.command({ tipo: 'relogio', acao: 'pausar' });
    c.command({ tipo: 'saltar-pct', pct: 100 });
    const t = c.simNow();
    const antes = c.metrics().modeloConstruidoEm;
    c.command({ tipo: 'cenario', cenario: { alvoPres: 52.5, ufVies: { SP: 2 } } });
    expect(c.simNow()).toBe(t);
    const st1 = c.state();
    expect(st1.cenario.preset).toBe('personalizado');
    expect(st1.cenario.alvoPres).toBe(52.5);
    expect(st1.cenario.ufVies).toEqual({ SP: 2 });
    expect(c.metrics().modeloMs).toBeGreaterThan(0);
    expect(c.metrics().modeloConstruidoEm).toBeGreaterThanOrEqual(antes!);
    // mescla: alvoGov chave a chave; ufVies 0 remove; null limpa
    c.command({ tipo: 'cenario', cenario: { alvoGov: { 'gov-rj': 47 }, ufVies: { SP: 0, BA: -3 } } });
    expect(c.state().cenario.alvoGov['gov-rj']).toBe(47);
    expect(c.state().cenario.alvoGov['gov-df']).toBe(57.73);
    expect(c.state().cenario.ufVies).toEqual({ BA: -3 });
    c.command({ tipo: 'cenario', cenario: { ufVies: null as never } });
    expect(c.state().cenario.ufVies).toEqual({});
    const r = c.nacional('gov-rj').resumo;
    expect(Math.abs((100 * r.votos[0]) / (r.votos[0] + r.votos[1]) - 47)).toBeLessThan(0.05);
    expect(() => c.command({ tipo: 'cenario', cenario: { ritmo: 'turbo' as never } })).toThrow(CommandError);
    expect(() => c.command({ tipo: 'cenario', cenario: { alvoPres: 'abc' as never } })).toThrow(/alvoPres/);
    expect(() => c.command({ tipo: 'cenario', cenario: { ufVies: { XX: 3 } as never } })).toThrow(/UF desconhecida/);
    expect(() => c.command({ tipo: 'cenario', cenario: { alvoGov: { 'gov-sp': 50 } } })).toThrow(/governador/);
  });

  it('preset: aplica sobre o padrão neutro e mantém a semente; desconhecido → erro', () => {
    const { c } = novo('demo');
    c.command({ tipo: 'cenario', cenario: { seed: 77, alvoPres: 60 } });
    c.command({ tipo: 'preset', preset: 'folgada-b' });
    const cen = c.state().cenario;
    expect(cen.preset).toBe('folgada-b');
    expect(cen.seed).toBe(77);
    expect(cen.alvoPres).toBe(46);
    expect(Object.values(cen.alvoGov).every((v) => v === 46)).toBe(true);
    expect(() => c.command({ tipo: 'preset', preset: 'nao-existe' })).toThrow(CommandError);
    const presets = c.presets();
    expect(presets.length).toBe(11);
    expect(presets.map((p) => p.id)).toContain('equilibrio-b');
    // simetria: cada preset com lado tem o espelho
    const alvo = (id: string) => presets.find((p) => p.id === id)!.cenario.alvoPres!;
    expect(alvo('equilibrio-a') + alvo('equilibrio-b')).toBeCloseTo(100, 9);
    expect(alvo('folgada-a') + alvo('folgada-b')).toBeCloseTo(100, 9);
    expect(alvo('empate-a') + alvo('empate-b')).toBeCloseTo(100, 9);
    expect(alvo('virada-a') + alvo('virada-b')).toBeCloseTo(100, 9);
  });

  it('fonte, aviso, tse e comandos inválidos', () => {
    const { c } = novo();
    c.command({ tipo: 'fonte', fonte: 'tse' });
    expect(c.status().fonte).toBe('tse');
    expect(c.status().simulacao).toBe(false);
    expect(c.nacional('pres').resumo.secoesTotalizadas).toBe(0); // o servidor intercepta; aqui nunca simula
    expect(() => c.command({ tipo: 'fonte', fonte: 'x' as never })).toThrow(CommandError);
    c.command({ tipo: 'aviso', aviso: { nivel: 'alerta', texto: '  Instabilidade no TSE  ' } });
    expect(c.status().aviso).toEqual({ nivel: 'alerta', texto: 'Instabilidade no TSE' });
    c.command({ tipo: 'aviso', aviso: null });
    expect(c.status().aviso).toBeNull();
    expect(() => c.command({ tipo: 'aviso', aviso: { nivel: 'info', texto: '   ' } })).toThrow(CommandError);
    c.command({ tipo: 'tse', tse: { intervaloSeg: 30 } });
    expect(c.state().tse.intervaloSeg).toBe(30);
    expect(c.state().tse.eleicaoPres).toBe('6258');
    expect(c.state().tse.eleicaoGov).toBe('6260');
    expect(c.state().tse.pleito).toBe('3221');
    expect(() => c.command({ tipo: 'tse', tse: { intervaloSeg: 1 } })).toThrow(CommandError);
    expect(() => c.command({ tipo: 'nada' } as never)).toThrow(CommandError);
    expect(() => c.command({ tipo: 'velocidade', velocidade: -2 })).toThrow(CommandError);
    expect(() => c.command({ tipo: 'relogio', acao: 'voar' } as never)).toThrow(CommandError);
  });

  it('congelar: números param em congeladoEm enquanto o relógio anda; descongelar retoma', () => {
    const { c, r } = novo('demo');
    r.add(3 * 60_000); // simNow ≈ 17:59:30
    const a = c.nacional('pres');
    c.command({ tipo: 'congelar', congelado: true });
    expect(c.state().congeladoEm).toBe(c.simNow());
    r.add(60_000); // +20 min simulados
    const b = c.nacional('pres');
    expect(b.resumo).toEqual(a.resumo);
    expect(c.status().congelado).toBe(true);
    expect(c.status().simNow).toBeGreaterThan(b.simNow);
    c.command({ tipo: 'congelar', congelado: false });
    expect(c.state().congeladoEm).toBeNull();
    expect(c.nacional('pres').resumo.secoesTotalizadas).toBeGreaterThan(a.resumo.secoesTotalizadas);
  });
});

describe('serialização e sincronização', () => {
  it('toJSON → parseAdminState → initialState reproduz o mesmo estado e os mesmos números', () => {
    const r = relogio(Date.UTC(2026, 9, 25, 12, 0));
    const a = createController(ds, { modo: 'demo', now: r.now });
    a.command({ tipo: 'preset', preset: 'empate-a' });
    a.command({ tipo: 'velocidade', velocidade: 7 });
    a.command({ tipo: 'aviso', aviso: { nivel: 'info', texto: 'Teste' } });
    r.add(10 * 60_000);
    const json = a.toJSON();
    const fb = estadoPadrao('servidor', 0, cenarioPadrao(st), st);
    const parsed = parseAdminState(json, fb, st);
    expect(parsed).toEqual(JSON.parse(json));
    const b = createController(ds, { modo: 'servidor', now: r.now, initialState: parsed });
    expect(b.status()).toEqual(a.status());
    expect({ ...b.nacional('pres'), geradoEm: 0 }).toEqual({ ...a.nacional('pres'), geradoEm: 0 });
  });

  it('parseAdminState completa campos ausentes/ruins com o fallback', () => {
    const fb = estadoPadrao('demo', 123, cenarioPadrao(st), st);
    expect(parseAdminState('{lixo', fb, st)).toBe(fb);
    const p = parseAdminState({ versao: 9, fonte: 'xyz', relogio: { velocidade: 'rápido' } }, fb, st);
    expect(p.versao).toBe(9);
    expect(p.fonte).toBe(fb.fonte);
    expect(p.relogio).toEqual(fb.relogio);
    expect(p.cenario).toEqual(fb.cenario);
    const q = parseAdminState({ cenario: { alvoPres: 'x' } }, fb, st);
    expect(q.cenario).toEqual(fb.cenario);
  });

  it('setState aplica o estado (reconstrói se o cenário mudou) e NÃO chama onStateChange', () => {
    const r = relogio(Date.UTC(2026, 9, 25, 12, 0));
    const onStateChange = vi.fn();
    const a = createController(ds, { modo: 'demo', now: r.now });
    const b = createController(ds, { modo: 'demo', now: r.now, onStateChange });
    a.command({ tipo: 'cenario', cenario: { alvoPres: 55 } });
    a.command({ tipo: 'saltar-pct', pct: 100 });
    b.setState(a.state());
    expect(onStateChange).not.toHaveBeenCalled();
    expect(b.state()).toEqual(a.state());
    expect(b.nacional('pres').resumo).toEqual(a.nacional('pres').resumo);
  });

  it('métricas', () => {
    const r = relogio(Date.UTC(2026, 9, 25, 12, 0));
    const c = createController(ds, { modo: 'demo', now: r.now });
    for (let i = 0; i < 5; i++) c.nacional('pres');
    c.uf('pres', 'SP');
    r.add(2000);
    const m = c.metrics({ clientesAtivosEstimados: 42 });
    expect(m.requisicoesUltimoMinuto).toBe(6);
    expect(m.clientesAtivosEstimados).toBe(42);
    expect(m.secoesModeladas).toBe(499_248);
    expect(m.modeloMs).toBeGreaterThan(0);
    expect(m.uptimeSeg).toBe(2);
    expect(m.log.some((l) => l.msg.startsWith('Modelo construído'))).toBe(true);
    r.add(61_000);
    expect(c.metrics().requisicoesUltimoMinuto).toBe(0);
  });
});

describe('hospedeiro RPC (Worker do demo)', () => {
  it('init → ready; chamadas; erros serializados; comando emite "state"; setState não', async () => {
    const out: HostOut[] = [];
    const handle = createEngineHost((m) => out.push(m), () => fsJsonLoader(PUBLIC_DIR));
    // chamada antes do init falha com mensagem clara
    await handle({ type: 'call', id: 1, method: 'status', args: [] });
    expect(out.pop()).toMatchObject({ type: 'reply', id: 1, ok: false });
    const p = handle({ type: 'init', base: 'ignorado', modo: 'demo', state: null });
    const call = handle({ type: 'call', id: 2, method: 'nacional', args: ['pres'] }); // antes de pronto: espera
    await p;
    await call;
    const ready = out.find((m) => m.type === 'ready') as Extract<HostOut, { type: 'ready' }>;
    expect(ready.state.fonte).toBe('simulacao');
    const r2 = out.find((m) => m.type === 'reply' && m.id === 2) as Extract<HostOut, { type: 'reply'; ok: true }>;
    expect(r2.ok).toBe(true);
    expect((r2.result as { race: string }).race).toBe('pres');
    await handle({ type: 'call', id: 3, method: 'zona', args: ['pres-t1', 'SP', '71072', 9999] });
    const r3 = out.at(-1) as Extract<HostOut, { type: 'reply'; ok: false }>;
    expect(r3.ok).toBe(false);
    expect(r3.error.name).toBe('NotFoundError');
    expect(r3.error.status).toBe(404);
    await handle({ type: 'call', id: 4, method: 'command', args: [{ tipo: 'velocidade', velocidade: 5 }] });
    const st1 = out.find((m) => m.type === 'state') as Extract<HostOut, { type: 'state' }>;
    expect(st1.state.relogio.velocidade).toBe(5);
    const n = out.length;
    const outro: AdminState = { ...st1.state, versao: st1.state.versao + 1, aviso: { nivel: 'info', texto: 'de outra aba' } };
    await handle({ type: 'setState', state: outro });
    expect(out.length).toBe(n);
    await handle({ type: 'call', id: 5, method: 'status', args: [] });
    const r5 = out.at(-1) as Extract<HostOut, { type: 'reply'; ok: true }>;
    expect((r5.result as { aviso: unknown; versao: number }).aviso).toEqual({ nivel: 'info', texto: 'de outra aba' });
    await handle({ type: 'call', id: 6, method: 'command', args: [{ tipo: 'fonte', fonte: 'nada' }] });
    expect((out.at(-1) as Extract<HostOut, { type: 'reply'; ok: false }>).error.name).toBe('CommandError');
  });

  it('falha de carga vira "fatal"', async () => {
    const out: HostOut[] = [];
    const handle = createEngineHost((m) => out.push(m), () => fsJsonLoader('/caminho/inexistente'));
    await handle({ type: 'init', base: 'x' });
    await new Promise((r) => setTimeout(r, 50));
    expect(out.some((m) => m.type === 'fatal')).toBe(true);
    await handle({ type: 'call', id: 1, method: 'status', args: [] });
    expect(out.at(-1)).toMatchObject({ type: 'reply', id: 1, ok: false });
  });
});

