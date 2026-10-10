/**
 * Teste Cego: antes da revelação nada pode indicar quem é quem — com Lula em vermelho e Flávio Bolsonaro em azul,
 * qualquer traço na cor de candidato (até o "ponto" da ponta arredondada de um arco de comprimento zero) entrega a
 * autoria. Renderização estática (SSR) do medidor nos dois estados.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Candidate } from '@/shared/types';
import { MedidorSintonia } from './Revelacao';

const lula: Candidate = { numero: 13, nomeUrna: 'Lula', nome: 'Lula', partido: 'PT', cor: 'vermelho' };
const flavio: Candidate = { numero: 22, nomeUrna: 'Flávio Bolsonaro', nome: 'Flávio Bolsonaro', partido: 'PL', cor: 'azul' };
const COR_CANDIDATO = /cand-(vermelho|azul|a|b)\b/;

const html = (candidato: Candidate, revelado: boolean, analisando = false) =>
  renderToStaticMarkup(createElement(MedidorSintonia, { candidato, pct: 62, consideradas: 20, revelado, analisando }));

describe('MedidorSintonia', () => {
  it('antes da revelação (parado e "comparando"): nenhuma classe de cor de candidato nem nome', () => {
    for (const c of [lula, flavio]) {
      for (const analisando of [false, true]) {
        const h = html(c, false, analisando);
        expect(h).not.toMatch(COR_CANDIDATO);
        expect(h).not.toContain(c.nomeUrna);
      }
    }
  });

  it('depois da revelação: arco na cor de identificação de cada um', () => {
    expect(html(lula, true)).toContain('stroke-cand-vermelho');
    expect(html(flavio, true)).toContain('stroke-cand-azul');
  });
});
