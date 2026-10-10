import { describe, expect, it } from 'vitest';
import {
  AFIRMACOES,
  AFIRMACAO_POR_ID,
  CANDIDATOS,
  DOCUMENTOS,
  ESCALA,
  PESO_IMPORTANTE,
  TAMANHO_CODIGO,
  TEMAS,
  TERMOS_PROIBIDOS,
  calcularConcordancia,
  calcularSintonia,
  codificar,
  codificarRespostas,
  decodificar,
  decodificarRespostas,
  direcao,
  embaralhar,
  ladoDoConcordo,
  ordemDoTeste,
  pontosDoCandidato,
  resumoEquilibrio,
  validarAfirmacoes,
  type Afirmacao,
  type Candidato,
  type Resposta,
  type Respostas,
} from './afirmacoes';

/** Responde exatamente o que o candidato defende (+2/0/−2) e pula onde ele não tem posição. */
function respostasIguaisA(c: Candidato): Respostas {
  const r: Record<string, Resposta> = {};
  for (const a of AFIRMACOES) {
    const p = pontosDoCandidato(a.posicoes[c]);
    r[a.id] = p === null ? 'pular' : p;
  }
  return r;
}

describe('estrutura do conteúdo', () => {
  it('passa na autoverificação editorial', () => {
    expect(validarAfirmacoes()).toEqual([]);
  });

  it('tem 24 afirmações, 2 por tema, ids únicos e neutros', () => {
    expect(AFIRMACOES).toHaveLength(24);
    expect(TEMAS).toHaveLength(12);
    for (const t of TEMAS) expect(AFIRMACOES.filter((a) => a.tema === t.id)).toHaveLength(2);
    expect(new Set(AFIRMACOES.map((a) => a.id)).size).toBe(24);
    for (const a of AFIRMACOES) {
      expect(a.id).not.toMatch(/13|22/);
      expect(AFIRMACAO_POR_ID[a.id]).toBe(a);
    }
  });

  it('textos curtos, afirmativos e ainda sem revisão humana', () => {
    for (const a of AFIRMACOES) {
      expect(a.texto.length).toBeLessThanOrEqual(110);
      expect(a.texto).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].*\.$/);
      expect(a.texto).not.toMatch(/\bnão deve\b/i); // sem negação dupla na escala
      expect(a.revisado).toBe(false);
    }
  });

  it('escala de 5 níveis (+2 a −2) mais "Pular"', () => {
    expect(ESCALA.map((o) => o.valor)).toEqual([2, 1, 0, -1, -2, 'pular']);
    expect(ESCALA.map((o) => o.rotulo)).toEqual([
      'Concordo totalmente',
      'Concordo',
      'Neutro',
      'Discordo',
      'Discordo totalmente',
      'Pular',
    ]);
  });
});

describe('neutralidade do texto', () => {
  const amostrasProibidas = [
    'Ampliar o Bolsa Família.',
    'Manter o Pé-de-Meia.',
    'Expandir o Mais Médicos.',
    'Retomar o Minha Casa Minha Vida.',
    'Taxar o PIX.',
    'Como defende Lula, o Brasil deve crescer.',
    'Flávio Bolsonaro quer menos impostos.',
    'O PT e o PL concordam.',
    'Facilitar o armamento da população.',
    'Acabar com a escala 6x1.',
    'Manter o arcabouço fiscal.',
    'Ampliar as escolas cívico-militares.',
    'Dar voucher-creche às famílias.',
    'Combater a censura.',
    'Defender a soberania nacional.',
    'O candidato 13 defende isto.',
  ];

  it('a lista de termos proibidos pega nomes, partidos, marcas e jargões', () => {
    for (const s of amostrasProibidas) expect(TERMOS_PROIBIDOS.some((re) => re.test(s)), s).toBe(true);
  });

  it('nenhum texto ou contexto exibido antes da resposta tem termo proibido', () => {
    for (const a of AFIRMACOES)
      for (const campo of [a.texto, a.contexto ?? ''])
        for (const re of TERMOS_PROIBIDOS) expect(re.test(campo), `${a.id}: ${re}`).toBe(false);
  });

  it('validarAfirmacoes detecta termo proibido injetado', () => {
    const ruim = AFIRMACOES.map((a, i) => (i === 0 ? { ...a, texto: 'O governo deve ampliar o Bolsa Família.' } : a));
    expect(validarAfirmacoes(ruim).some((e) => e.includes('termo proibido'))).toBe(true);
  });
});

describe('posições e fontes', () => {
  it('todo concorda/discorda/neutro tem fonte com página, âncora e trecho; sem-posicao tem nota e não tem fonte', () => {
    for (const a of AFIRMACOES)
      for (const c of CANDIDATOS) {
        const p = a.posicoes[c];
        if (p.valor === 'sem-posicao') {
          expect(p.fonte, `${a.id}/${c}`).toBeUndefined();
          expect(p.nota?.length, `${a.id}/${c}`).toBeGreaterThan(10);
          continue;
        }
        expect(p.fonte, `${a.id}/${c}`).toBeDefined();
        const f = p.fonte!;
        expect(f.url.startsWith(DOCUMENTOS[c].pdf)).toBe(true);
        expect(f.url.endsWith(`#page=${f.pagina}`)).toBe(true);
        expect(f.pagina).toBeGreaterThanOrEqual(1);
        expect(f.pagina).toBeLessThanOrEqual(DOCUMENTOS[c].paginas);
        expect(f.trecho.length).toBeGreaterThan(20);
        expect(f.acessadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
  });

  it('equilíbrio: opostas divididas ao meio, no máximo 2 controles, "concordo" alterna de lado', () => {
    const eq = resumoEquilibrio();
    expect(eq.opostas[13] + eq.opostas[22]).toBeGreaterThanOrEqual(6);
    expect(Math.abs(eq.opostas[13] - eq.opostas[22])).toBeLessThanOrEqual(1);
    expect(eq.controles).toBeLessThanOrEqual(2);
    expect(eq.ladoDoConcordo[13]).toBe(eq.ladoDoConcordo[22]);
    // Cada candidato tem posição no mesmo número de itens (± 1) e concorda no mesmo número.
    expect(Math.abs(eq.valores[13]['sem-posicao'] - eq.valores[22]['sem-posicao'])).toBeLessThanOrEqual(1);
    expect(eq.valores[13].concorda).toBe(eq.valores[22].concorda);
  });

  it('direcao e ladoDoConcordo são coerentes', () => {
    for (const a of AFIRMACOES) {
      const d = direcao(a);
      if (d !== null) expect(ladoDoConcordo(a)).toBe(d);
    }
    expect(ladoDoConcordo(AFIRMACAO_POR_ID['sau-a'])).toBe('ambos');
  });
});

describe('calcularSintonia', () => {
  it('quem responde igual ao 13 em tudo que ele defende tem 100% com o 13 (e o mesmo para o 22)', () => {
    const r13 = calcularSintonia(respostasIguaisA(13));
    expect(r13[13]).toBeCloseTo(100, 10);
    expect(r13[22]).not.toBeNull();
    expect(r13[22]!).toBeLessThan(100);
    const r22 = calcularSintonia(respostasIguaisA(22));
    expect(r22[22]).toBeCloseTo(100, 10);
    expect(r22[13]!).toBeLessThan(100);
  });

  it('concordar com tudo que o 13 concorda (e pular o resto) dá 100% para o 13', () => {
    const r: Record<string, Resposta> = {};
    for (const a of AFIRMACOES) r[a.id] = a.posicoes[13].valor === 'concorda' ? 2 : 'pular';
    const s = calcularSintonia(r);
    expect(s[13]).toBe(100);
    expect(s.consideradas[13]).toBe(resumoEquilibrio().valores[13].concorda);
  });

  it('caso à mão: um item em que 13 concorda e 22 discorda, resposta "Concordo" (+1)', () => {
    const s = calcularSintonia({ 'eco-a': 1 });
    // 13: 1 − |1 − 2|/4 = 0,75 · 22: 1 − |1 − (−2)|/4 = 0,25
    expect(s[13]).toBeCloseTo(75, 10);
    expect(s[22]).toBeCloseTo(25, 10);
    expect(s.respondidas).toBe(1);
    expect(s.puladas).toBe(23);
    expect(s.porAfirmacao['eco-a'].pct).toEqual({ 13: 75, 22: 25 });
    expect(s.porTema.economia[13]).toBeCloseTo(75, 10);
    expect(s.porTema.impostos[13]).toBeNull();
  });

  it('caso à mão: neutro contra neutro vale 100%; neutro contra concorda vale 50%', () => {
    // inf-a: 13 neutro, 22 concorda
    const s = calcularSintonia({ 'inf-a': 0 });
    expect(s[13]).toBe(100);
    expect(s[22]).toBe(50);
  });

  it('caso à mão com peso: item importante conta em dobro', () => {
    // eco-a (13 concorda) resposta +2 → 13: 1 · eco-b (13 discorda) resposta +2 → 13: 0
    const sem = calcularSintonia({ 'eco-a': 2, 'eco-b': 2 });
    expect(sem[13]).toBe(50);
    const com = calcularSintonia({ 'eco-a': 2, 'eco-b': 2 }, ['eco-a']);
    expect(com[13]).toBeCloseTo((PESO_IMPORTANTE * 1 + 1 * 0) / (PESO_IMPORTANTE + 1) * 100, 10);
    expect(calcularSintonia({ 'eco-a': 2, 'eco-b': 2 }, new Set(['eco-a']))[13]).toBeCloseTo(com[13]!, 10);
    expect(calcularSintonia({ 'eco-a': 2, 'eco-b': 2 }, { 'eco-a': 2 })[13]).toBeCloseTo(com[13]!, 10);
    expect(com.porAfirmacao['eco-a'].peso).toBe(PESO_IMPORTANTE);
  });

  it('ignora "pular", não respondidas e sem-posicao', () => {
    const vazio = calcularSintonia({});
    expect(vazio[13]).toBeNull();
    expect(vazio[22]).toBeNull();
    expect(calcularSintonia(Object.fromEntries(AFIRMACOES.map((a) => [a.id, 'pular' as const])))[13]).toBeNull();
    // trb-b: 22 sem posição → só o 13 entra na conta
    const s = calcularSintonia({ 'trb-b': -2 });
    expect(s[13]).toBe(100); // 13 discorda da afirmação; a pessoa discordou totalmente
    expect(s[22]).toBeNull();
    expect(s.consideradas).toEqual({ 13: 1, 22: 0 });
  });

  it('valores fora da escala são tratados como não respondidos', () => {
    const s = calcularSintonia({ 'eco-a': 3 as unknown as Resposta, 'eco-b': 'talvez' as unknown as Resposta });
    expect(s.respondidas).toBe(0);
  });

  it('percentuais sempre entre 0 e 100', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r: Record<string, Resposta> = {};
      const valores: Resposta[] = [2, 1, 0, -1, -2, 'pular'];
      embaralhar(seed, AFIRMACOES).forEach((a, i) => (r[a.id] = valores[(i * 7 + seed) % 6]));
      const s = calcularSintonia(r);
      for (const c of CANDIDATOS) {
        if (s[c] === null) continue;
        expect(s[c]!).toBeGreaterThanOrEqual(0);
        expect(s[c]!).toBeLessThanOrEqual(100);
      }
    }
  });

  it('concordância entre duas pessoas (Duelo)', () => {
    expect(calcularConcordancia({ 'eco-a': 2 }, { 'eco-a': 2 })).toEqual({ pct: 100, emComum: 1 });
    expect(calcularConcordancia({ 'eco-a': 2 }, { 'eco-a': -2 })).toEqual({ pct: 0, emComum: 1 });
    expect(calcularConcordancia({ 'eco-a': 2, 'eco-b': 'pular' }, { 'eco-a': 1, 'eco-b': 2 })).toEqual({ pct: 75, emComum: 1 });
    expect(calcularConcordancia({}, {}).pct).toBeNull();
  });
});

describe('ordem determinística', () => {
  it('embaralhar é determinístico pela semente e é uma permutação', () => {
    const ids = (l: readonly Afirmacao[]) => l.map((a) => a.id);
    expect(ids(embaralhar(42))).toEqual(ids(embaralhar(42)));
    expect(ids(embaralhar('abc'))).not.toEqual(ids(embaralhar('abd')));
    expect([...ids(embaralhar(7))].sort()).toEqual([...ids(AFIRMACOES)].sort());
  });

  it('ordemDoTeste nunca põe duas afirmações do mesmo tema seguidas', () => {
    for (let seed = 0; seed < 500; seed++) {
      const o = ordemDoTeste(seed);
      expect(o).toHaveLength(24);
      expect(new Set(o.map((a) => a.id)).size).toBe(24);
      for (let i = 1; i < o.length; i++) expect(o[i].tema, `seed ${seed}, posição ${i}`).not.toBe(o[i - 1].tema);
    }
    expect(ordemDoTeste(99).map((a) => a.id)).toEqual(ordemDoTeste(99).map((a) => a.id));
  });

  it('a primeira afirmação varia com a semente (sem padrão fixo)', () => {
    const primeiras = new Set(Array.from({ length: 200 }, (_, s) => ordemDoTeste(s)[0].id));
    expect(primeiras.size).toBeGreaterThan(15);
  });
});

describe('código da URL', () => {
  it('ida e volta com respostas, pulos, não respondidas e importantes', () => {
    const valores: (Resposta | undefined)[] = [2, 1, 0, -1, -2, 'pular', undefined];
    for (let seed = 0; seed < 300; seed += 7) {
      const respostas: Record<string, Resposta> = {};
      const importantes: string[] = [];
      AFIRMACOES.forEach((a, i) => {
        const v = valores[(i + seed) % valores.length];
        if (v !== undefined) respostas[a.id] = v;
        if (typeof v === 'number' && (i + seed) % 3 === 0) importantes.push(a.id);
      });
      const codigo = codificar(seed * 1013, respostas, importantes);
      expect(codigo).toHaveLength(TAMANHO_CODIGO);
      expect(codigo).toMatch(/^2[0-9a-z]+$/);
      const d = decodificar(`#${codigo}`);
      expect(d).not.toBeNull();
      expect(d!.seed).toBe(seed * 1013);
      expect(d!.respostas).toEqual(respostas);
      expect([...d!.importantes].sort()).toEqual([...importantes].sort());
      // O cálculo dá o mesmo resultado antes e depois da URL.
      expect(calcularSintonia(d!.respostas, d!.importantes)).toEqual(calcularSintonia(respostas, importantes));
    }
  });

  it('"importante" em item pulado é descartado na codificação', () => {
    const s = codificarRespostas({ 'eco-a': 'pular' }, ['eco-a']);
    expect(decodificarRespostas(s)!.importantes).toEqual([]);
  });

  it('recusa códigos inválidos ou de outra versão', () => {
    const bom = codificar(12345, { 'eco-a': 2 });
    expect(decodificar(bom)).not.toBeNull();
    expect(decodificar(null)).toBeNull();
    expect(decodificar('')).toBeNull();
    expect(decodificar(`1${bom.slice(1)}`)).toBeNull(); // versão antiga (teste de pares)
    expect(decodificar(bom.slice(0, -1))).toBeNull(); // curto
    expect(decodificar(`${bom}0`)).toBeNull(); // longo
    expect(decodificar(`${bom.slice(0, -1)}z`)).toBeNull(); // dígito fora do intervalo
    expect(decodificar(`${bom.slice(0, -1)}7`)).toBeNull(); // "importante" sem resposta
    expect(decodificar(`${bom.slice(0, 6)}${'-'.repeat(24)}`)).toBeNull();
  });
});
