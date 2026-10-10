import { describe, expect, it } from 'vitest';
import { brilhoDuplo, corSlot, fillMargem, fillMosaico, fillTally, FILL_PENDENTE, rgbSlot, slotDe } from './raceUi';
import { toneFromCor } from '@/app/ui/Badge';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { casa, realcar } from '@/app/ui/textMatch';

describe('raceUi', () => {
  it('só referencia tokens (sem hex)', () => {
    for (const c of ['a', 'b', 'vermelho', 'azul', 'outros'] as const) {
      const s = corSlot(c);
      expect(JSON.stringify(s)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
    expect(fillMargem('a', 0)).toBe('rgb(var(--cand-a) / 0.32)');
    expect(fillMargem('b', 3)).toBe('rgb(var(--cand-b))');
  });
  it('cores de identificação (Presidente): classes estáticas e tokens próprios', () => {
    expect(corSlot('vermelho')).toMatchObject({ bg: 'bg-cand-vermelho', text: 'text-cand-vermelho-fg', textDisplay: 'text-cand-vermelho', token: 'cand-vermelho' });
    expect(corSlot('azul')).toMatchObject({ bg: 'bg-cand-azul', text: 'text-cand-azul-fg', textDisplay: 'text-cand-azul', token: 'cand-azul' });
    expect(fillMargem('vermelho', 0)).toBe('rgb(var(--cand-vermelho) / 0.32)');
    expect(rgbSlot('azul')).toBe('rgb(var(--cand-azul))');
    expect(toneFromCor('vermelho')).toBe('cand-vermelho');
    expect(toneFromCor('azul')).toBe('cand-azul');
    expect(toneFromCor('a')).toBe('cand-a');
    // a cor vem dos dados: o candidato 0 de uma corrida de Presidente é vermelho, o 1 é azul
    const pres = { candidatos: [{ cor: 'vermelho' }, { cor: 'azul' }] } as never;
    expect(slotDe(pres, 0)).toBe('vermelho');
    expect(fillTally(pres, { votos: [40, 60], secoes: 10, secoesTotalizadas: 5 })).toBe('rgb(var(--cand-azul) / 0.78)');
    expect(fillMosaico('d', ['vermelho', 'azul'])).toBe('rgb(var(--cand-vermelho))');
    expect(brilhoDuplo(['vermelho', 'azul'], 0.1)).toBe(
      'radial-gradient(ellipse 60% 80% at 0% 0%, rgb(var(--cand-vermelho) / 0.1), transparent 70%), radial-gradient(ellipse 60% 80% at 100% 0%, rgb(var(--cand-azul) / 0.1), transparent 70%)',
    );
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
