import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CuriosidadesDataset } from '@/shared/curiosidades';
import { TEMAS_CURIOSIDADES } from '@/shared/curiosidades';
import { LIMITE_TEXTO } from '@/app/components/share/textos';
import { pesoPostX, LIMITE_X } from '@/app/lib/share';
import {
  DESTAQUES_PADRAO,
  HASHTAGS_CURIOSIDADES,
  caminhoFato,
  escolherDestaques,
  fatosDoTema,
  fmtValor,
  nivelTamanho,
  nomeArquivoFato,
  temaDoParam,
  temasComContagem,
  textoPagina,
  textoParaCompartilhar,
  trechosComNumeros,
} from './formato';

const ds = JSON.parse(
  readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../public/data/curiosidades.json'), 'utf8'),
) as CuriosidadesDataset;

describe('fmtValor', () => {
  it('formata inteiros, percentuais e pontos percentuais em pt-BR', () => {
    expect(fmtValor({ valor: 158745502, formato: 'int' })).toBe('158.745.502');
    expect(fmtValor({ valor: 52.84, formato: 'pct' })).toBe('52,84%');
    expect(fmtValor({ valor: 7.5, formato: 'pct', casas: 1 })).toBe('7,5%');
    expect(fmtValor({ valor: 0.78, formato: 'pp' })).toBe('0,78 p.p.');
    expect(fmtValor({ valor: -0.78, formato: 'pp' })).toBe('0,78 p.p.');
  });

  it('nunca produz NaN/undefined para os fatos do arquivo', () => {
    for (const f of ds.fatos) {
      for (const v of [f.destaque, f.par?.a.valor, f.par?.b.valor]) {
        if (!v) continue;
        const s = fmtValor(v);
        expect(s, f.id).not.toMatch(/NaN|undefined|Infinity/);
        expect(s.length, f.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('nivelTamanho', () => {
  it('diminui o número conforme o comprimento', () => {
    expect(nivelTamanho('1')).toBe(0);
    expect(nivelTamanho('88,33%')).toBe(1);
    expect(nivelTamanho('916.534')).toBe(1);
    expect(nivelTamanho('9.145.124')).toBe(2);
    expect(nivelTamanho('158.745.502')).toBe(3);
  });
});

describe('trechosComNumeros', () => {
  it('separa números (com milhar, decimais, % e p.p.) e mantém o texto intacto', () => {
    const t = 'São 21,08% do eleitorado. Compareceram 125.275.835 pessoas; diferença de 0,78 p.p. no 1º turno.';
    const p = trechosComNumeros(t);
    expect(p.map((x) => x.t).join('')).toBe(t);
    expect(p.filter((x) => x.num).map((x) => x.t)).toEqual(['21,08%', '125.275.835', '0,78 p.p.']);
  });

  it('não trata ordinais nem a pontuação final como número', () => {
    const p = trechosComNumeros('No 1º turno, foram 2.148.');
    expect(p.filter((x) => x.num).map((x) => x.t)).toEqual(['2.148']);
  });
});

describe('textos de compartilhamento', () => {
  it('cabem no limite do kit e no post do X com link e hashtags', () => {
    for (const f of ds.fatos) {
      const t = textoParaCompartilhar(f);
      expect(t.length, f.id).toBeLessThanOrEqual(LIMITE_TEXTO);
      expect(t, f.id).toMatch(/Fonte: TSE\.$/);
      expect(t, f.id).not.toMatch(/https?:\/\//);
      expect(pesoPostX(t, HASHTAGS_CURIOSIDADES), f.id).toBeLessThanOrEqual(LIMITE_X);
    }
    const tp = textoPagina(ds);
    expect(tp.length).toBeLessThanOrEqual(LIMITE_TEXTO);
    expect(pesoPostX(tp, HASHTAGS_CURIOSIDADES)).toBeLessThanOrEqual(LIMITE_X);
  });

  it('gera caminho e nome de arquivo estáveis por fato', () => {
    expect(caminhoFato('finalistas-menor-diferenca')).toBe('/curiosidades?fato=finalistas-menor-diferenca');
    expect(nomeArquivoFato('brasil-eleitorado')).toBe('sintonia-curiosidade-brasil-eleitorado');
  });
});

describe('organização por tema', () => {
  it('lê ?tema= com segurança', () => {
    expect(temaDoParam(null)).toBe('todos');
    expect(temaDoParam('xyz')).toBe('todos');
    expect(temaDoParam('exterior')).toBe('exterior');
  });

  it('ordena todos os fatos pela ordem dos temas e conta por tema', () => {
    const todos = fatosDoTema(ds.fatos, 'todos');
    expect(todos.length).toBe(ds.fatos.length);
    const ordem = TEMAS_CURIOSIDADES.map((t) => t.id);
    const idx = todos.map((f) => ordem.indexOf(f.tema));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    const cont = temasComContagem(ds.fatos);
    expect(cont.reduce((s, t) => s + t.n, 0)).toBe(ds.fatos.length);
    expect(fatosDoTema(ds.fatos, 'exterior').every((f) => f.tema === 'exterior')).toBe(true);
  });

  it('os destaques padrão existem e têm número em destaque', () => {
    const d = escolherDestaques(ds.fatos, DESTAQUES_PADRAO);
    expect(d.map((f) => f.id)).toEqual(DESTAQUES_PADRAO);
    expect(d.every((f) => !!f.destaque)).toBe(true);
    // ids inexistentes caem para outros fatos com destaque
    expect(escolherDestaques(ds.fatos, ['nao-existe']).length).toBe(3);
  });
});
