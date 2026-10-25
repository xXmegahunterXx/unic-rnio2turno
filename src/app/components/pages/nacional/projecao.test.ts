/**
 * Cartão "Projeção do Sintonia" (Projecao.tsx): leitura defensiva do payload (rota de outra versão, proxy, cache velho →
 * nada na tela), janela do eixo em torno de 50%, endereço das rotas e o cartão de espera antes do limiar (render no
 * servidor com o cache do React Query já preenchido: nenhuma rede).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Race } from '@/shared/types';
import type { Projecao } from '@/shared/projecao';
import { ProjecaoCartao, aguardandoDe, lerProjecao, meiaJanela, pctSecoesPlacar, urlProjecao, type ProjecaoCartaoProps } from './Projecao';

const ok = {
  projecao: {
    race: 'pres',
    abrangencia: 'BR',
    disponivel: true,
    fracaoApurada: 0.43,
    pctSecoes: 42.7,
    candidatos: [
      { indice: 0, numero: 13, pct: 49.1, min: 48.5, max: 49.7 },
      { indice: 1, numero: 22, pct: 50.9, min: 50.3, max: 51.5 },
    ],
    simNow: 1,
  },
};

describe('lerProjecao', () => {
  it('aceita o contrato', () => {
    const p = lerProjecao(ok);
    expect(p?.disponivel).toBe(true);
    expect(p?.candidatos).toHaveLength(2);
    expect(p?.candidatos[1]).toEqual({ indice: 1, numero: 22, pct: 50.9, min: 50.3, max: 51.5 });
  });

  it('indisponível com motivo e sem candidatos', () => {
    const p = lerProjecao({ projecao: { ...ok.projecao, disponivel: false, motivo: 'cedo', candidatos: [] } });
    expect(p).toMatchObject({ disponivel: false, motivo: 'cedo', candidatos: [] });
  });

  it('fora do contrato → null (nunca quebra a página)', () => {
    expect(lerProjecao(null)).toBeNull();
    expect(lerProjecao({ erro: 'Rota da API inexistente.' })).toBeNull();
    expect(lerProjecao({ projecao: { ...ok.projecao, candidatos: 'x' } })).toBeNull();
    expect(lerProjecao({ projecao: { ...ok.projecao, disponivel: 'sim' } })).toBeNull();
    expect(lerProjecao({ projecao: { ...ok.projecao, candidatos: [{ indice: 0, numero: 13, pct: Number.NaN, min: 1, max: 2 }] } })).toBeNull();
  });
});

describe('meiaJanela', () => {
  it('disputa apertada: 45–55%', () => {
    expect(meiaJanela(ok.projecao.candidatos)).toBe(5);
  });
  it('folgada: cabe a faixa inteira, de 5 em 5', () => {
    expect(meiaJanela([{ pct: 57.7, min: 57.1, max: 58.3 }, { pct: 42.3, min: 41.7, max: 42.9 }])).toBe(10);
    expect(meiaJanela([{ pct: 80, min: 78, max: 82 }, { pct: 20, min: 18, max: 22 }])).toBe(35);
  });
  it('nunca passa de 50', () => {
    expect(meiaJanela([{ pct: 100, min: 99, max: 100 }, { pct: 0, min: 0, max: 1 }])).toBe(50);
  });
});

describe('urlProjecao', () => {
  it('Brasil e UF (sigla minúscula, como as outras rotas)', () => {
    expect(urlProjecao('pres', 'BR')).toBe('/api/apuracao/pres/br/projecao');
    expect(urlProjecao('gov-es', 'ES')).toBe('/api/apuracao/gov-es/es/projecao');
  });
});

describe('pctSecoesPlacar', () => {
  it('o mesmo número do placar: truncado em 2 casas, como o TSE', () => {
    expect(pctSecoesPlacar(0.2454)).toBe(0.24);
    expect(pctSecoesPlacar(9.9999)).toBe(9.99);
    expect(pctSecoesPlacar(42.7)).toBe(42.7);
  });
  it('sem erro de ponto flutuante (0,29 × 100 = 28,999…)', () => {
    expect(pctSecoesPlacar(0.29)).toBe(0.29);
    expect(pctSecoesPlacar(0.57)).toBe(0.57);
  });
  it('limites', () => {
    expect(pctSecoesPlacar(0)).toBe(0);
    expect(pctSecoesPlacar(-1)).toBe(0);
    expect(pctSecoesPlacar(Number.NaN)).toBe(0);
    expect(pctSecoesPlacar(100)).toBe(100);
  });
});

describe('aguardandoDe (cartão antes do limiar)', () => {
  it("'cedo' com poucas seções: barra proporcional aos 10%", () => {
    expect(aguardandoDe({ disponivel: false, motivo: 'cedo', pctSecoes: 0.2454 })).toEqual({ pct: 0.24, barra: 0.024, noLimiar: false });
    expect(aguardandoDe({ disponivel: false, motivo: 'cedo', pctSecoes: 5 })).toEqual({ pct: 5, barra: 0.5, noLimiar: false });
  });
  it("'cedo' com 0% (totalização começando ou parada): o cartão já aparece, barra vazia", () => {
    expect(aguardandoDe({ disponivel: false, motivo: 'cedo', pctSecoes: 0 })).toEqual({ pct: 0, barra: 0, noLimiar: false });
  });
  it("'cedo' com as seções já nos 10% (falta base ao cálculo): barra cheia, nunca passa de 100%", () => {
    expect(aguardandoDe({ disponivel: false, motivo: 'cedo', pctSecoes: 10 })).toEqual({ pct: 10, barra: 1, noLimiar: true });
    expect(aguardandoDe({ disponivel: false, motivo: 'cedo', pctSecoes: 23.5 })).toEqual({ pct: 23.5, barra: 1, noLimiar: true });
  });
  it('outros motivos ou disponível → null', () => {
    for (const motivo of ['sem-base', 'definido', 'encerrada', 'desligada'] as const) {
      expect(aguardandoDe({ disponivel: false, motivo, pctSecoes: 3 })).toBeNull();
    }
    expect(aguardandoDe({ disponivel: false, pctSecoes: 3 })).toBeNull();
    expect(aguardandoDe({ disponivel: true, pctSecoes: 30 })).toBeNull();
  });
});

describe('ProjecaoCartao (render)', () => {
  const race = {
    id: 'pres',
    cargo: 'Presidente',
    turno: 2,
    abrangencia: 'BR',
    titulo: 'Presidente',
    candidatos: [
      { numero: 13, nomeUrna: 'Candidato 13', cor: 'cand-vermelho' },
      { numero: 22, nomeUrna: 'Candidato 22', cor: 'cand-azul' },
    ],
    ufs: [],
    tse: { ciclo: '', eleicao: '', cargo: '', pleito: '' },
  } as unknown as Race;
  const cedo: Projecao = { race: 'pres', abrangencia: 'BR', disponivel: false, motivo: 'cedo', fracaoApurada: 0.0003, pctSecoes: 0.2454, candidatos: [], simNow: 1 };

  function render(proj: Projecao | null, opts: { fase?: string; props?: Partial<ProjecaoCartaoProps>; erro?: boolean } = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['status'], { fase: opts.fase ?? 'apurando', versao: 1, simNow: 1 });
    if (opts.erro) {
      // falha depois de um sucesso: o React Query guarda o `data` anterior e marca o erro
      qc.getQueryCache().build(qc, { queryKey: ['projecao', 'pres', 'BR'] }).setState({ data: proj, status: 'error', error: new Error('x'), dataUpdatedAt: 1 });
    } else qc.setQueryData(['projecao', 'pres', 'BR'], proj);
    const props: ProjecaoCartaoProps = { race, abrangencia: 'BR', aoVivo: true, ...opts.props };
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, null, createElement(ProjecaoCartao, props))),
    );
  }

  it("'cedo' com 0,24%: cartão com título, selo, frase, barra (2,4%) e \"0,24% de 10%\", sem número de candidato", () => {
    const html = render(cedo);
    expect(html).toContain('data-projecao-estado="aguardando"');
    expect(html).toContain('Projeção do Sintonia');
    expect(html).toContain('Estimativa');
    expect(html).toContain('A estimativa do resultado final aparece com cerca de 10% das urnas apuradas.');
    expect(html).toContain('0,24%</span> de 10%');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuetext="0,24% de 10%"');
    expect(html).toContain('translateX(-97.6%)');
    expect(html).not.toContain('Candidato 13');
    expect(html).not.toContain('data-sem-anuncio-fixo');
  });

  it("'cedo' com 0% durante a apuração: o cartão já está lá (barra vazia)", () => {
    const html = render({ ...cedo, pctSecoes: 0, fracaoApurada: 0 });
    expect(html).toContain('0,00%</span> de 10%');
    expect(html).toContain('translateX(-100%)');
  });

  it("'cedo' com as seções já em 10%+: barra cheia e a outra frase", () => {
    const html = render({ ...cedo, pctSecoes: 12.3456, fracaoApurada: 0.09 });
    expect(html).toContain('aparece assim que houver mais urnas apuradas');
    expect(html).toContain('12,34%</span>');
    expect(html).not.toContain(' de 10%');
    expect(html).toContain('translateX(0%)');
  });

  it('simulação: selo no cartão de espera também', () => {
    expect(render(cedo, { props: { simulado: true } })).toMatch(/simula/i);
  });

  it('nada: fora da fase apurando, chave desligada, sem-base, definido, encerrada, erro, Reveja a noite', () => {
    expect(render(cedo, { fase: 'pre' })).toBe('');
    expect(render(cedo, { fase: 'encerrada' })).toBe('');
    expect(render({ ...cedo, motivo: 'desligada' })).toBe('');
    expect(render({ ...cedo, motivo: 'sem-base' })).toBe('');
    expect(render({ ...cedo, motivo: 'definido' })).toBe('');
    expect(render({ ...cedo, motivo: 'encerrada' })).toBe('');
    expect(render(cedo, { props: { definido: true } })).toBe('');
    expect(render(cedo, { props: { aoVivo: false } })).toBe('');
    expect(render(cedo, { erro: true })).toBe('');
    expect(render(null)).toBe('');
    // payload de outra disputa/abrangência (cache trocado): nada
    expect(render({ ...cedo, abrangencia: 'SP' })).toBe('');
  });

  it('disponível: o cartão real, com os dois finalistas', () => {
    const html = render({ ...cedo, disponivel: true, motivo: undefined, pctSecoes: 42.7, fracaoApurada: 0.43, candidatos: ok.projecao.candidatos });
    expect(html).not.toContain('data-projecao-estado');
    expect(html).toContain('data-sem-anuncio-fixo');
    expect(html).toContain('Candidato 13');
    expect(html).toContain('Candidato 22');
    expect(html).toContain('Com 42% das urnas apuradas');
  });
});
