import { describe, expect, it } from 'vitest';
import { AFIRMACOES, calcularSintonia, ordemDoTeste, type Resposta } from '@/app/content/afirmacoes';
import {
  caminhoDuelo,
  caminhoResultado,
  caminhoTeste,
  codificar,
  codigoDesafio,
  decodificar,
  decodificarDesafio,
  ehCodigoV1,
  ehDueloV1,
  lerDuelo,
  sementeParaTexto,
} from './codigo';
import { compararDuelo, frasesConcordancia, ladoDe, notaPublica, rotuloResposta } from './sintonia';

const ESCALA: Resposta[] = [2, 1, 0, -1, -2, 'pular'];
/** Respostas determinísticas (todas as 24), variando pela posição. */
const respostas = (desloc = 0) => Object.fromEntries(AFIRMACOES.map((a, i) => [a.id, ESCALA[(i + desloc) % ESCALA.length]]));

describe('rotas do Teste Cego (v2)', () => {
  it('resultado: ida e volta pelo hash, com as marcadas como importantes', () => {
    const r = respostas();
    const imp = [AFIRMACOES[0].id, AFIRMACOES[3].id];
    const caminho = caminhoResultado(12345, r, imp);
    expect(caminho.startsWith('/teste/resultado#2')).toBe(true);
    const hash = caminho.slice(caminho.indexOf('#'));
    const d = decodificar(hash)!;
    expect(d.seed).toBe(12345);
    expect(d.respostas).toEqual(r);
    expect(d.importantes.sort()).toEqual([...imp].sort());
  });

  it('teste: a semente vai na query (só a ordem, nunca respostas)', () => {
    expect(caminhoTeste(12345)).toBe(`/teste?s=${sementeParaTexto(12345)}`);
    expect(caminhoTeste(12345, true)).toBe(`/teste?s=${sementeParaTexto(12345)}&r=1`);
  });

  it('duelo: desafio no caminho e respostas depois do "#"', () => {
    const r = respostas(2);
    const caminho = caminhoDuelo(777, r, [AFIRMACOES[5].id]);
    const [path, hash] = caminho.split('#');
    expect(path).toBe(`/duelo/${codigoDesafio(777)}`);
    expect(hash).toHaveLength(AFIRMACOES.length);
    const d = lerDuelo(path.split('/').pop(), `#${hash}`)!;
    expect(d.seed).toBe(777);
    expect(d.respostas).toEqual(r);
    expect(d.importantes).toEqual([AFIRMACOES[5].id]);
    expect(decodificarDesafio(codigoDesafio(777))).toBe(777);
  });

  it('duelo: aceita o código inteiro no caminho ou no hash', () => {
    const r = respostas(1);
    const codigo = codificar(42, r);
    expect(lerDuelo(codigo, '')?.respostas).toEqual(r);
    expect(lerDuelo(codigoDesafio(42), `#${codigo}`)?.respostas).toEqual(r);
    expect(lerDuelo('xyz', '#abc')).toBeNull();
    expect(lerDuelo(codigoDesafio(42), '')).toBeNull();
  });

  it('reconhece links do formato antigo (pares) para a tela "versão anterior"', () => {
    expect(ehCodigoV1('#1abcde00001')).toBe(true);
    expect(ehCodigoV1(codificar(1, respostas()))).toBe(false);
    expect(decodificar('#1abcde00001')).toBeNull();
    expect(ehDueloV1('1abcde', '#00a1b')).toBe(true);
    expect(ehDueloV1('1abcde00a1b', '')).toBe(true);
    expect(ehDueloV1(codigoDesafio(5), '#00a1b')).toBe(false);
    expect(lerDuelo('1abcde', '#00a1b')).toBeNull();
  });
});

describe('apoio de UI', () => {
  it('rótulos e lado das respostas', () => {
    expect(rotuloResposta(2)).toBe('Concordo totalmente');
    expect(rotuloResposta(-1)).toBe('Discordo');
    expect(rotuloResposta('pular')).toBe('Pulou');
    expect(rotuloResposta(null)).toBe('Sem resposta');
    expect([ladoDe(2), ladoDe(1), ladoDe(0), ladoDe(-1), ladoDe('pular')]).toEqual(['concorda', 'concorda', 'neutro', 'discorda', null]);
  });

  it('nota pública tira instruções internas de revisão', () => {
    expect(notaPublica('O plano rejeita X. O trecho contém uma alegação: mostrar como citação.')).toBe('O plano rejeita X.');
    expect(notaPublica('Explicação simples.')).toBe('Explicação simples.');
    expect(notaPublica(undefined)).toBeNull();
  });

  it('duelo: respostas iguais = mesmo lado em tudo e afinidade 100%', () => {
    const r = Object.fromEntries(AFIRMACOES.map((a, i) => [a.id, ([2, 1, -1, -2, 0] as const)[i % 5]]));
    const c = compararDuelo(r, r, ordemDoTeste(9));
    expect(c.emComum).toBe(24);
    expect(c.iguais).toBe(24);
    expect(c.afinidade).toBe(100);
    expect(c.itens.map((i) => i.afirmacao.id)).toEqual(ordemDoTeste(9).map((a) => a.id));
    expect(frasesConcordancia(c.iguais, c.emComum)).toMatch(/todas/);
  });

  it('duelo: extremos opostos = 0%, "concordo" × "concordo totalmente" = mesmo lado (75%)', () => {
    const a = Object.fromEntries(AFIRMACOES.map((x) => [x.id, 2 as const]));
    const b = Object.fromEntries(AFIRMACOES.map((x) => [x.id, -2 as const]));
    const c = Object.fromEntries(AFIRMACOES.map((x) => [x.id, 1 as const]));
    expect(compararDuelo(a, b).afinidade).toBe(0);
    expect(compararDuelo(a, b).iguais).toBe(0);
    expect(compararDuelo(a, c).iguais).toBe(24);
    expect(compararDuelo(a, c).afinidade).toBe(75);
  });

  it('duelo: pulada por qualquer um fica fora da comparação', () => {
    const a = { [AFIRMACOES[0].id]: 2, [AFIRMACOES[1].id]: 'pular', [AFIRMACOES[2].id]: -1 } as const;
    const b = { [AFIRMACOES[0].id]: 1, [AFIRMACOES[1].id]: 2 } as const;
    const c = compararDuelo(a, b);
    expect(c.emComum).toBe(1);
    expect(c.iguais).toBe(1);
    expect(c.itens.filter((i) => i.comparavel)).toHaveLength(1);
  });

  it('o resultado decodificado reproduz a mesma sintonia', () => {
    const r = respostas(3);
    const d = decodificar(codificar(5, r, [AFIRMACOES[1].id]))!;
    const s1 = calcularSintonia(r, [AFIRMACOES[1].id]);
    const s2 = calcularSintonia(d.respostas, d.importantes);
    expect(s2[13]).toBeCloseTo(s1[13]!, 10);
    expect(s2[22]).toBeCloseTo(s1[22]!, 10);
  });
});
