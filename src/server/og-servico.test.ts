/**
 * ServicoOg: cache LRU (entradas e bytes), frescor por "versão|modo", vencida do mesmo modo servida na hora,
 * troca de modo sempre esperando a imagem nova, e fila limitada.
 */
import { describe, expect, it } from 'vitest';
import { FilaOgCheia, ServicoOg, modoDoSub, type OgPronta } from './og-servico';

const png = (n: number, marca = 0) => Buffer.alloc(n, marca);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ServicoOg', () => {
  it('modoDoSub', () => {
    expect(modoDoSub('12|simulacao-anon')).toBe('simulacao-anon');
    expect(modoDoSub('abc|estatico')).toBe('estatico');
  });

  it('fresca dentro do TTL; vencida do mesmo modo servida na hora e renovada em segundo plano', async () => {
    const relogio = { t: 1_000 };
    const s = new ServicoOg({ now: () => relogio.t });
    let geracoes = 0;
    const montar = async (): Promise<OgPronta> => ({ png: png(10, ++geracoes), sub: '1|pre' });
    const a = await s.obter({ chave: 'k', sub: '1|pre', ttlMs: 30_000, staleMs: 300_000, montar });
    expect(a.hit).toBe(false);
    const b = await s.obter({ chave: 'k', sub: '1|pre', ttlMs: 30_000, staleMs: 300_000, montar });
    expect(b.hit).toBe(true);
    expect(geracoes).toBe(1);
    relogio.t += 31_000;
    const c = await s.obter({ chave: 'k', sub: '1|pre', ttlMs: 30_000, staleMs: 300_000, montar });
    expect(c.hit).toBe(true); // a antiga, sem esperar
    expect(c.png[0]).toBe(1);
    await esperar(5);
    expect(geracoes).toBe(2); // renovada em segundo plano
    const d = await s.obter({ chave: 'k', sub: '1|pre', ttlMs: 30_000, staleMs: 300_000, montar });
    expect(d.png[0]).toBe(2);
  });

  it('troca de modo espera a imagem nova (nunca serve a do outro modo)', async () => {
    const s = new ServicoOg();
    await s.obter({ chave: 'k', sub: '1|pre', ttlMs: 30_000, staleMs: 300_000, montar: async () => ({ png: png(5, 1), sub: '1|pre' }) });
    const r = await s.obter({
      chave: 'k',
      sub: '2|simulacao-anon',
      ttlMs: 30_000,
      staleMs: 300_000,
      montar: async () => ({ png: png(5, 9), sub: '2|simulacao-anon' }),
    });
    expect(r.hit).toBe(false);
    expect(r.png[0]).toBe(9);
  });

  it('estática (TTL infinito) vale até a versão dos dados mudar', async () => {
    const s = new ServicoOg();
    let n = 0;
    const pedir = (v: string) =>
      s.obter({ chave: 'cand|1', sub: `${v}|estatico`, ttlMs: Infinity, staleMs: Infinity, montar: async () => ({ png: png(4, ++n), sub: `${v}|estatico` }) });
    await pedir('a');
    expect((await pedir('a')).hit).toBe(true);
    expect(n).toBe(1);
    const nova = await pedir('b'); // dado novo: serve a antiga na hora e gera a nova
    expect(nova.png[0]).toBe(1);
    await esperar(5);
    expect((await pedir('b')).png[0]).toBe(2);
  });

  it('LRU por número de entradas e por bytes', async () => {
    const s = new ServicoOg({ maxEntradas: 3, maxBytes: 1_000 });
    for (const k of ['a', 'b', 'c']) await s.obter({ chave: k, sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: async () => ({ png: png(100), sub: '1|x' }) });
    // toca 'a' (vira a mais recente) e insere 'd' → sai 'b'
    await s.obter({ chave: 'a', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: async () => ({ png: png(100), sub: '1|x' }) });
    await s.obter({ chave: 'd', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: async () => ({ png: png(100), sub: '1|x' }) });
    expect(s.espiar('b')).toBeNull();
    expect(s.espiar('a')).not.toBeNull();
    expect(s.tamanho).toBe(3);
    // uma imagem grande estoura o orçamento de bytes → as mais antigas saem
    await s.obter({ chave: 'e', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: async () => ({ png: png(900), sub: '1|x' }) });
    expect(s.emMemoria).toBeLessThanOrEqual(1_000);
    expect(s.espiar('e')).not.toBeNull();
  });

  it('fila limitada: além do máximo → FilaOgCheia (503 com Retry-After); pedidos iguais compartilham a geração', async () => {
    const s = new ServicoOg({ filaMax: 2 });
    let liberar: () => void = () => {};
    const trava = new Promise<void>((r) => (liberar = r));
    const lenta = async (): Promise<OgPronta> => {
      await trava;
      return { png: png(3), sub: '1|x' };
    };
    const p1 = s.obter({ chave: 'a', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: lenta });
    const p1b = s.obter({ chave: 'a', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: lenta }); // mesma chave: junta-se
    const p2 = s.obter({ chave: 'b', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: lenta });
    await expect(s.obter({ chave: 'c', sub: '1|x', ttlMs: 1e9, staleMs: 1e9, montar: lenta })).rejects.toBeInstanceOf(FilaOgCheia);
    const erro = new FilaOgCheia();
    expect(erro.status).toBe(503);
    expect(erro.headers['retry-after']).toBe('10');
    liberar();
    await Promise.all([p1, p1b, p2]);
    expect(s.pendentes).toBe(0);
  });

  it('falha na geração não fica no cache e não trava a fila', async () => {
    const erros: string[] = [];
    const s = new ServicoOg({ aoFalhar: (k) => erros.push(k) });
    await expect(s.obter({ chave: 'x', sub: '1|y', ttlMs: 1, staleMs: 1, montar: async () => Promise.reject(new Error('boom')) })).rejects.toThrow('boom');
    expect(erros).toEqual(['x']);
    expect(s.espiar('x')).toBeNull();
    const ok = await s.obter({ chave: 'x', sub: '1|y', ttlMs: 1e9, staleMs: 1e9, montar: async () => ({ png: png(2), sub: '1|y' }) });
    expect(ok.png.length).toBe(2);
  });
});
