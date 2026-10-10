/**
 * Testes das peças puras da fase 2 (frente A): QR Code do Modo TV, `?t=` do "reveja a noite" e as cores do mapa
 * nacional por município (MunicipiosNacionalSnapshot).
 */
import { describe, expect, it } from 'vitest';
import type { MunicipiosNacionalSnapshot, Race } from '@/shared/types';
import { INICIO_APURACAO } from '@/shared/constants';
import { gerarQr, qrPath } from './qr';
import { comInstante, formatarInstante, lerInstante } from './LinhaDoTempo';
import { baseFinalistasMunBr, pctsMunBr, valorMunBr } from './mapModes';
import { FILL_EMPATE, FILL_PENDENTE, fillMargem } from '@/app/lib/raceUi';

// ---------------------------------------------------------------------------------------------
// QR Code
// ---------------------------------------------------------------------------------------------

/** Lê os 15 bits de formato da 1ª cópia (em volta do localizador de cima à esquerda). */
function formatoLido(m: boolean[][]): number {
  const bits: boolean[] = [];
  for (let i = 0; i <= 5; i++) bits.push(m[i][8]);
  bits.push(m[7][8], m[8][8], m[8][7]);
  for (let i = 9; i < 15; i++) bits.push(m[8][14 - i]);
  return bits.reduce((acc, b, i) => acc | ((b ? 1 : 0) << i), 0);
}

describe('gerarQr', () => {
  it('escolhe a menor versão que cabe (correção M)', () => {
    expect(gerarQr('HELLO').versao).toBe(1);
    expect(gerarQr('https://sintonia.app/apuracao').versao).toBe(3);
    expect(gerarQr('x'.repeat(300)).versao).toBe(13);
  });

  it('desenha os três localizadores e o módulo escuro fixo', () => {
    const q = gerarQr('https://sintonia.app/apuracao');
    const n = q.tamanho;
    expect(n).toBe(29);
    for (const [x0, y0] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      // borda 7×7 escura, anel claro, miolo 3×3 escuro
      for (let i = 0; i < 7; i++) {
        expect(q.modulos[y0][x0 + i]).toBe(true);
        expect(q.modulos[y0 + 6][x0 + i]).toBe(true);
      }
      expect(q.modulos[y0 + 1][x0 + 1]).toBe(false);
      expect(q.modulos[y0 + 3][x0 + 3]).toBe(true);
    }
    expect(q.modulos[n - 8][8]).toBe(true);
  });

  it('grava formato válido (nível M + máscara escolhida, BCH com XOR 0x5412)', () => {
    const q = gerarQr('Apuração do 2º turno — São Paulo');
    const lido = formatoLido(q.modulos) ^ 0x5412;
    const dados = lido >>> 10;
    expect(dados >>> 3).toBe(0); // M = 00
    expect(dados & 7).toBe(q.mascara);
    let rem = dados;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    expect(lido & 0x3ff).toBe(rem & 0x3ff);
  });

  it('qrPath cobre exatamente os módulos escuros', () => {
    const q = gerarQr('HELLO');
    const area = [...qrPath(q).matchAll(/h(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
    const escuros = q.modulos.flat().filter(Boolean).length;
    expect(area).toBe(escuros);
  });
});

// ---------------------------------------------------------------------------------------------
// "Reveja a noite"
// ---------------------------------------------------------------------------------------------

describe('?t= (instante)', () => {
  const t1842 = INICIO_APURACAO + (1 * 60 + 42) * 60_000; // 17:00 + 1h42
  it('formata no horário de Brasília do dia da apuração', () => {
    expect(formatarInstante(INICIO_APURACAO)).toBe('17h00');
    expect(formatarInstante(t1842)).toBe('18h42');
  });
  it('lê 18h42, 18:42, 1842 e epoch', () => {
    expect(lerInstante('18h42')).toBe(t1842);
    expect(lerInstante('18:42')).toBe(t1842);
    expect(lerInstante('1842')).toBe(t1842);
    expect(lerInstante(String(t1842 + 1234))).toBe(t1842 + 1234);
    expect(lerInstante('25h00')).toBeUndefined();
    expect(lerInstante('abc')).toBeUndefined();
  });
  it('madrugada (antes do meio-dia) é o dia seguinte', () => {
    const t = lerInstante('00h30')!;
    expect(t - INICIO_APURACAO).toBe((7 * 60 + 30) * 60_000);
    expect(formatarInstante(t)).toBe('00h30');
  });
  it('segundos quebrados viram epoch (exato)', () => {
    expect(formatarInstante(t1842 + 1500)).toBe(String(t1842 + 1500));
  });
  it('comInstante preserva a query', () => {
    expect(comInstante('/apuracao/sp?race=gov-sp', t1842)).toBe('/apuracao/sp?race=gov-sp&t=18h42');
    expect(comInstante('/apuracao', undefined)).toBe('/apuracao');
  });
});

// ---------------------------------------------------------------------------------------------
// Mapa nacional por município
// ---------------------------------------------------------------------------------------------

const race = {
  candidatos: [
    { numero: 10, nomeUrna: 'A', nome: 'A', partido: 'X', cor: 'a' },
    { numero: 20, nomeUrna: 'B', nome: 'B', partido: 'Y', cor: 'b' },
  ],
} as Pick<Race, 'candidatos'>;

const snap = (p: Partial<MunicipiosNacionalSnapshot>): MunicipiosNacionalSnapshot => ({
  race: 'pres',
  geradoEm: 0,
  simNow: 0,
  lider: [-1, 0, 1, 2],
  margem: [0, 32, 180, 0],
  apurado: [0, 500, 1000, 1000],
  comparecimento: [0, 780, 800, 760],
  pct0: [0, 5160, 4100, 5000],
  municipiosLiderados: [1, 1],
  ...p,
});

describe('valorMunBr', () => {
  it('sem seção apurada → hachura (pendente)', () => {
    expect(valorMunBr('vencedor', snap({}), 0, { race })).toEqual({ fill: FILL_PENDENTE, pendente: true });
  });
  it('vencedor: cor do líder pela margem em buckets; empate neutro', () => {
    expect(valorMunBr('vencedor', snap({}), 1, { race }).fill).toBe(fillMargem('a', 0)); // 3,2 p.p.
    expect(valorMunBr('vencedor', snap({}), 2, { race }).fill).toBe(fillMargem('b', 2)); // 18 p.p.
    expect(valorMunBr('vencedor', snap({}), 3, { race }).fill).toBe(FILL_EMPATE);
  });
  it('variação: compara com a base dos finalistas no 1º turno', () => {
    // 1º turno com "Outros": p0 = 40%, margem 10 p.p. com o candidato 1 à frente → p1 = 50% → base 44,4%
    const t1 = snap({ lider: [-1, 1, 1, 1], margem: [0, 100, 100, 100], pct0: [0, 4000, 4000, 4000] });
    expect(baseFinalistasMunBr(t1, 1)).toBeCloseTo(44.44, 1);
    const v = valorMunBr('variacao', snap({}), 1, { race, t1 });
    expect(v.pendente).toBe(false);
    expect(v.fill).toContain('--cand-a'); // 51,6% agora > 44,4% → candidato 0 ganhou
  });
});

describe('pctsMunBr', () => {
  it('2º turno: [p0, 100 − p0]', () => {
    expect(pctsMunBr(snap({}), 1, 2)).toEqual([51.6, 48.4]);
  });
  it('1º turno: p1 pela margem e "Outros" no resto', () => {
    const s = snap({ lider: [1], margem: [100], pct0: [4000], apurado: [1000] });
    const [a, b, o] = pctsMunBr(s, 0, 3)!;
    expect(a).toBe(40);
    expect(b).toBe(50);
    expect(o).toBeCloseTo(10, 6);
  });
  it('sem votos → null', () => {
    expect(pctsMunBr(snap({}), 0, 2)).toBeNull();
  });
});
