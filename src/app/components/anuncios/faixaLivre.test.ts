/**
 * Rede de segurança da barra fixa do rodapé (E11): além dos blocos marcados com `data-sem-anuncio-fixo`, qualquer
 * elemento com cor de candidato na faixa de baixo da tela esconde a barra.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANTECIPA_PX, FAIXA_BARRA_PX, MAX_CANDIDATOS, SELETOR_CANDIDATO, naFaixa, temCorDeCandidato } from './faixaLivre';

describe('temCorDeCandidato', () => {
  it('classe ou estilo com cor de candidato', () => {
    expect(temCorDeCandidato('text-cand-a-fg', '')).toBe(true);
    expect(temCorDeCandidato('h-2 rounded-full bg-cand-vermelho/80', null)).toBe(true);
    expect(temCorDeCandidato('bg-surface', '')).toBe(false);
    expect(temCorDeCandidato('', '--cand-vermelho')).toBe(true);
    expect(temCorDeCandidato('', 'fill: rgb(var(--cand-azul))')).toBe(true);
    expect(temCorDeCandidato('candidato-ficha', 'color: red')).toBe(false);
    expect(temCorDeCandidato(undefined, undefined)).toBe(false);
  });

  it('o seletor cobre as três formas, fora dos blocos marcados e das peças fixas', () => {
    expect(SELETOR_CANDIDATO).toContain('[class*="cand-"]');
    expect(SELETOR_CANDIDATO).toContain('[style*="--cand-"]');
    expect(SELETOR_CANDIDATO).toContain('[data-candidato]');
    expect(SELETOR_CANDIDATO.match(/:not\(\[data-sem-anuncio-fixo\] \*\):not\(\.fixed \*\)/g)).toHaveLength(2);
    expect(MAX_CANDIDATOS).toBe(2000);
  });
});

describe('naFaixa (retângulos na tela de 390×844)', () => {
  const H = 844;
  it('na faixa de baixo (ou logo abaixo dela) → ocupado; acima ou longe abaixo → livre', () => {
    expect(naFaixa({ top: 700, bottom: 720 }, H)).toBe(true); // barra de votos no pé da tela
    expect(naFaixa({ top: H - FAIXA_BARRA_PX + 1, bottom: H - FAIXA_BARRA_PX + 20 }, H)).toBe(true);
    expect(naFaixa({ top: 100, bottom: H - FAIXA_BARRA_PX }, H)).toBe(false); // termina exatamente onde a faixa começa
    expect(naFaixa({ top: H + ANTECIPA_PX - 1, bottom: H + 200 }, H)).toBe(true); // vai entrar no pé da tela
    expect(naFaixa({ top: H + ANTECIPA_PX, bottom: H + 200 }, H)).toBe(false);
    expect(naFaixa({ top: 0, bottom: 0 }, H)).toBe(false); // escondido (display: none)
  });
});

describe('marcação que faltava (E11)', () => {
  it('tabela de dados marcada por padrão; cartões de curiosidade e o divisor dos cenários com finalistas marcados', () => {
    const tabela = readFileSync('src/app/ui/DataTable.tsx', 'utf8');
    expect(tabela).toMatch(/semAnuncioFixo\s*=\s*true/);
    for (const a of ['src/app/components/pages/curiosidades/CartaoFato.tsx', 'src/app/components/pages/curiosidades/CartaoCuriosidade.tsx', 'src/app/pages/cenarios/CenariosPage.tsx'])
      expect(readFileSync(a, 'utf8'), a).toContain('data-sem-anuncio-fixo');
  });
});
