import { describe, expect, it } from 'vitest';
import { corSlot, fillMargem, fillMosaico, fillTally, FILL_PENDENTE, slotDe } from './raceUi';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { casa, realcar } from '@/app/ui/textMatch';

describe('raceUi', () => {
  it('só referencia tokens (sem hex)', () => {
    for (const c of ['a', 'b', 'outros'] as const) {
      const s = corSlot(c);
      expect(JSON.stringify(s)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
    expect(fillMargem('a', 0)).toBe('rgb(var(--cand-a) / 0.32)');
    expect(fillMargem('b', 3)).toBe('rgb(var(--cand-b))');
  });
  it('mosaico e tally', () => {
    expect(fillMosaico('0')).toBe(FILL_PENDENTE);
    expect(fillMosaico('d')).toBe('rgb(var(--cand-a))');
    expect(fillMosaico('e')).toBe('rgb(var(--cand-b) / 0.32)');
    const race = { candidatos: [{ cor: 'a' }, { cor: 'b' }] } as never;
    expect(fillTally(race, { votos: [0, 0], secoes: 10, secoesTotalizadas: 0 })).toBe(FILL_PENDENTE);
    expect(fillTally(race, { votos: [60, 40], secoes: 10, secoesTotalizadas: 5 })).toBe('rgb(var(--cand-a) / 0.78)');
    expect(slotDe(race, 1)).toBe('b');
    expect(slotDe(race, null)).toBe('outros');
  });
});

describe('texto', () => {
  it('iniciais ignoram títulos e ligações', () => {
    expect(iniciais('Lula')).toBe('L');
    expect(iniciais('Flávio Bolsonaro')).toBe('FB');
    expect(iniciais('Professora Maria do Carmo')).toBe('MC');
    expect(iniciais('Cadu de Lula')).toBe('CL');
  });
  it('busca sem acento e realce', () => {
    expect(casa('São Gonçalo', 'sao goncalo')).toBe(true);
    expect(casa('Niterói', 'xyz')).toBe(false);
    expect(realcar('São Paulo', 'sao')).toEqual([
      { t: 'São', hit: true },
      { t: ' Paulo', hit: false },
    ]);
  });
});
