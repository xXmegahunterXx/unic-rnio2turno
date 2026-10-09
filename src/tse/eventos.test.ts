/** Série e eventos por diferença entre polls (textos neutros, marcos, viradas, limites). */
import { describe, expect, it } from 'vitest';
import type { Race, Summary } from '../shared/types';
import { HistoricoCorrida, afinarSerie, eventosEntre, estadoDe, placarTexto } from './eventos';
import { resumir, tallyVazio } from './map';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const PRES = races.find((r) => r.id === 'pres')!;
const GOV_RJ = races.find((r) => r.id === 'gov-rj')!;
const T0 = Date.UTC(2026, 9, 25, 20, 0, 0);

/** Summary sintético: `st` de 1000 seções, votos [a, b], eleitorado 100 por seção. */
function S(st: number, a: number, b: number, ts = 1000): Summary {
  const t = { ...tallyVazio(2), secoes: ts, secoesTotalizadas: st, eleitorado: ts * 100, eleitoradoTotalizado: st * 100 };
  return resumir({ ...t, votos: [a, b], comparecimento: a + b }, PRES.candidatos, {
    status: st === 0 ? 'aguardando' : st >= ts ? 'encerrada' : 'apurando',
    ultimaAtualizacao: null,
  });
}

describe('eventosEntre', () => {
  it('primeira observação não gera eventos', () => {
    expect(eventosEntre(null, estadoDe(S(500, 10, 5), T0), { race: PRES, abr: 'BR', principal: true })).toEqual([]);
  });

  it('início, marco e liderança na primeira divulgação', () => {
    const ev = eventosEntre(estadoDe(S(0, 0, 0), T0), estadoDe(S(12, 700, 500), T0 + 60_000), { race: PRES, abr: 'BR', principal: true });
    expect(ev.map((e) => e.tipo)).toEqual(['inicio', 'marco', 'lideranca']);
    expect(ev[0].titulo).toBe('Começa a divulgação dos resultados');
    expect(ev[1].titulo).toBe('1% das seções totalizadas'); // só o maior marco atravessado
    expect(ev[1].detalhe).toBe('Lula 58,33% · Flávio Bolsonaro 41,67%');
    expect(ev[2].titulo).toBe('Com 1,2% das seções totalizadas, Lula aparece à frente');
    expect(ev[2].candidato).toBe(0);
    expect(ev.every((e) => e.t === T0 + 60_000 && e.race === 'pres' && e.abrangencia === 'BR')).toBe(true);
  });

  it('troca de líder: "virada" só acima de 5%', () => {
    const cedo = eventosEntre(estadoDe(S(20, 60, 50), T0), estadoDe(S(40, 60, 70), T0), { race: PRES, abr: 'BR', principal: true });
    expect(cedo.find((e) => e.tipo === 'lideranca')?.titulo).toBe('Com 4,0% das seções totalizadas, Flávio Bolsonaro passa à frente');
    expect(cedo.some((e) => e.tipo === 'virada')).toBe(false);
    const tarde = eventosEntre(estadoDe(S(600, 500, 510), T0), estadoDe(S(632, 530, 520), T0), { race: PRES, abr: 'BR', principal: true });
    const v = tarde.find((e) => e.tipo === 'virada')!;
    expect(v.titulo).toBe('Com 63,2% das seções totalizadas, Lula passa à frente');
    expect(v.candidato).toBe(0);
  });

  it('eleição definida e UF encerrada', () => {
    // 990/1000 seções, diferença 2000 > 1000 eleitores restantes
    const ev = eventosEntre(estadoDe(S(980, 5000, 4000), T0), estadoDe(S(990, 6000, 4000), T0), { race: PRES, abr: 'BR', principal: true });
    const el = ev.find((e) => e.tipo === 'eleito')!;
    expect(el.titulo).toBe('Eleição matematicamente definida: Lula');
    expect(el.detalhe).toBe('Com 99,0% das seções totalizadas, a diferença supera o eleitorado ainda não totalizado');
    const uf = eventosEntre(estadoDe(S(999, 60, 40), T0), estadoDe(S(1000, 60, 40), T0), { race: PRES, abr: 'BA', principal: false });
    expect(uf.map((e) => [e.tipo, e.titulo])).toEqual([
      ['marco', 'Bahia: 100% das seções totalizadas'],
      ['uf-encerrada', 'Bahia: totalização concluída'],
    ]);
    expect(uf[1].detalhe).toBe('Lula 60,00% · Flávio Bolsonaro 40,00%');
  });

  it('UF na corrida nacional: só virada (sem "aparece à frente"), com prefixo da UF', () => {
    const ctx = { race: PRES, abr: 'PE' as const, principal: false };
    expect(eventosEntre(estadoDe(S(0, 0, 0), T0), estadoDe(S(30, 10, 5), T0), ctx).filter((e) => e.tipo === 'lideranca')).toEqual([]);
    const v = eventosEntre(estadoDe(S(100, 10, 15), T0), estadoDe(S(110, 20, 15), T0), ctx);
    expect(v.find((e) => e.tipo === 'virada')?.titulo).toBe('Pernambuco: Com 11,0% das seções totalizadas, Lula passa à frente');
  });

  it('placar ignora o agregado "Outros"', () => {
    const t1 = races.find((r) => r.id === 'pres-t1')!;
    expect(placarTexto(t1, [45, 47, 8])).toBe('Lula 45,00% · Flávio Bolsonaro 47,00%');
  });
});

describe('HistoricoCorrida', () => {
  it('série: um ponto por mudança de seções; feed nacional e por UF; limite de 10 min por UF', () => {
    const h = new HistoricoCorrida(PRES, 'k');
    const passos: [number, number, number][] = [
      [0, 0, 0],
      [10, 600, 400],
      [10, 600, 400], // sem mudança: nada
      [80, 4000, 4200],
      [500, 30000, 29000],
      [1000, 60000, 58000],
    ];
    passos.forEach(([st, a, b], i) => h.registrar('BR', S(st, a, b), T0 + i * 60_000, true));
    const serie = h.serie('BR');
    expect(serie.map((p) => p.pst)).toEqual([1, 8, 50, 100]);
    expect(serie[0].pv[0]).toBeCloseTo(60, 10);
    const tipos = h.eventosNacionais().map((e) => e.tipo);
    expect(tipos[tipos.length - 1]).toBe('inicio'); // mais recentes primeiro
    expect(tipos).toContain('virada');
    expect(tipos.filter((t) => t === 'marco')).toHaveLength(4); // 1, 5, 50, 100 (só o maior de cada salto)
    expect(tipos.filter((t) => t === 'eleito')).toHaveLength(1);

    // UF: duas viradas em menos de 10 min → só a primeira
    h.registrar('MG', S(100, 10, 20), T0, false);
    h.registrar('MG', S(110, 30, 20), T0 + 60_000, false);
    h.registrar('MG', S(120, 30, 40), T0 + 120_000, false);
    h.registrar('MG', S(130, 50, 40), T0 + 11 * 60_000, false);
    const mg = h.eventosDaUf('MG').filter((e) => e.tipo === 'virada');
    expect(mg).toHaveLength(2);
    expect(h.eventosNacionais().filter((e) => e.abrangencia === 'MG')).toHaveLength(2);

    // serialização
    const json = JSON.parse(JSON.stringify(h.exportar()));
    const h2 = new HistoricoCorrida(PRES, 'k');
    expect(h2.importar(json)).toBe(true);
    expect(h2.serie('BR')).toEqual(serie);
    expect(h2.eventosNacionais()).toEqual(h.eventosNacionais());
    // ids conhecidos não se repetem após restaurar; outra chave é recusada
    expect(h2.registrar('BR', S(1000, 60000, 58000), T0 + 99 * 60_000, true)).toEqual([]);
    expect(new HistoricoCorrida(PRES, 'outra').importar(json)).toBe(false);
  });

  it('Governador: a UF é a abrangência principal (feed nacional = feed da UF)', () => {
    const h = new HistoricoCorrida(GOV_RJ, 'k');
    h.registrar('RJ', S(0, 0, 0), T0, true);
    h.registrar('RJ', S(300, 30, 20), T0 + 1, true);
    expect(h.eventosNacionais().map((e) => e.tipo)).toEqual(['lideranca', 'marco', 'inicio']);
    expect(h.eventosDaUf('RJ')).toEqual(h.eventosNacionais());
    expect(h.eventosNacionais()[1].titulo).toBe('25% das seções totalizadas');
    expect(h.eventosNacionais()[0].titulo).toBe('Com 30,0% das seções totalizadas, Douglas Ruas aparece à frente');
  });

  it('afinarSerie mantém extremos', () => {
    const s = Array.from({ length: 1000 }, (_, i) => ({ t: i, pst: i / 10, pv: [50, 50] }));
    const a = afinarSerie(s, 100);
    expect(a).toHaveLength(100);
    expect(a[0]).toBe(s[0]);
    expect(a[99]).toBe(s[999]);
  });
});
