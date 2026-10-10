import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESETS, calcularCenario, cenarioDoPreset, definirTodos, type PresidenteT1Dataset } from '@/shared/cenarios';
import { LIMITE_TEXTO } from '@/app/components/share/textos';
import { pesoTextoX } from '@/app/lib/share';
import { AVISO_TEXTO, textoCenario } from './textos';

const ds = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../public/data/presidente-t1.json'), 'utf8')) as PresidenteT1Dataset;

describe('textoCenario', () => {
  it('cabe no limite, tem o aviso e os dois finalistas na ordem da urna', () => {
    for (const p of PRESETS) {
      const t = textoCenario(ds, calcularCenario(ds, cenarioDoPreset(p.id, ds)));
      expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
      expect(t).toContain(AVISO_TEXTO);
      expect(t).toContain('hipotético');
      expect(t.indexOf('Lula')).toBeLessThan(t.indexOf('Flávio Bolsonaro'));
      expect(t).not.toMatch(/https?:|NaN|undefined|vai ganhar|vitória|vence a eleição/i);
    }
  });

  it('texto completo do cenário proporcional', () => {
    const t = textoCenario(ds, calcularCenario(ds, cenarioDoPreset('proporcional', ds)));
    expect(t).toBe(
      'Montei um cenário hipotético do 2º turno no Sintonia, a partir do resultado oficial do 1º turno: Lula 48,99% × Flávio Bolsonaro 51,01% dos votos válidos (11 × 16 estados). Não é pesquisa nem previsão. Monte o seu:',
    );
  });

  it('simétrico: o texto não muda de forma conforme quem fica à frente', () => {
    const ta = textoCenario(ds, calcularCenario(ds, definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 100 })));
    const tb = textoCenario(ds, calcularCenario(ds, definirTodos(cenarioDoPreset('metade', ds), ds, { paraA: 0 })));
    const forma = (t: string) => t.replace(/[\d.,]+/g, '#');
    expect(forma(ta)).toBe(forma(tb));
  });
});
