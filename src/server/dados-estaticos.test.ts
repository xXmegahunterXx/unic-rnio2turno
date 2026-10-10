/**
 * Arquivos estáticos do dataset para OG/meta tags: caminhos seguros, cache com reconferência por mtime, arquivo
 * inválido/ausente → null, índice e fichas de candidatos e os textos da ficha.
 */
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ArquivosJson, DadosEstaticos, cargoExibicao, situacaoCurta, situacaoTexto } from './dados-estaticos';
import { RAIZ } from './test-helpers';

describe('ArquivosJson', () => {
  it('só caminhos simples dentro de DATA_DIR', () => {
    const a = new ArquivosJson(join(RAIZ, 'public/data'));
    for (const ruim of ['../package.json', '/etc/passwd', 'cargos/../../package.json', 'a\\b.json', 'meta.txt', 'CARGOS/senado.json']) {
      expect(a.ler(ruim)).toBeNull();
    }
    expect(a.ler('cargos/senado.json')).not.toBeNull();
  });

  it('cache com reconferência por mtime (no máximo a cada 60 s); inválido → null e relê depois', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-estaticos-'));
    const relogio = { t: 1_000_000 };
    const a = new ArquivosJson(dir, () => relogio.t);
    const arq = join(dir, 'x.json');
    writeFileSync(arq, JSON.stringify({ v: 1 }));
    const l1 = a.ler<{ v: number }>('x.json')!;
    expect(l1.valor.v).toBe(1);
    writeFileSync(arq, JSON.stringify({ v: 2, extra: true }));
    utimesSync(arq, new Date(), new Date(Date.now() + 5_000));
    expect(a.ler<{ v: number }>('x.json')!.valor.v).toBe(1); // dentro dos 60 s: cache
    relogio.t += 61_000;
    const l2 = a.ler<{ v: number }>('x.json')!;
    expect(l2.valor.v).toBe(2);
    expect(l2.versao).not.toBe(l1.versao);
    writeFileSync(arq, '{ quebrado');
    utimesSync(arq, new Date(), new Date(Date.now() + 10_000));
    relogio.t += 61_000;
    expect(a.ler('x.json')).toBeNull();
    expect(a.ler('nao-existe.json')).toBeNull();
    // validador recusa → null
    expect(a.ler('x.json', () => false)).toBeNull();
  });
});

describe('DadosEstaticos', () => {
  const d = new DadosEstaticos(join(RAIZ, 'public/data'));

  it('índice e ficha de candidatos', () => {
    expect(d.existeCandidato('280002542548')).toBe('existe');
    expect(d.existeCandidato('123456789')).toBe('nao-existe');
    expect(d.existeCandidato('abc')).toBe('nao-existe');
    const f = d.ficha('10002548050')!;
    expect(f.valor.nomeUrna).toBe('Marcio Bittar');
    expect(f.valor.fotoGrupo).toBe('senado');
    expect(d.ficha('123456789')).toBeNull();
  });

  it('sem índice no DATA_DIR → "sem-indice" (não dá para afirmar que não existe)', () => {
    const vazio = mkdtempSync(join(tmpdir(), 'sintonia-sem-indice-'));
    mkdirSync(join(vazio, 'candidatos'));
    expect(new DadosEstaticos(vazio).existeCandidato('280002542548')).toBe('sem-indice');
  });

  it('cargos, curiosidades e 1º turno para Presidente', () => {
    expect(d.cargo('camara')!.valor.ufs).toHaveLength(27);
    expect(d.curiosidades()!.valor.fatos.length).toBeGreaterThan(10);
    expect(d.presidenteT1()!.valor.finalistas).toEqual([13, 22]);
    expect(DadosEstaticos.versao(d.cargo('senado'), null)).toMatch(/^[a-z0-9]+$/);
  });

  it('textos da ficha concordam com o gênero', () => {
    expect(cargoExibicao('Senador', 'Feminino')).toBe('Senadora');
    expect(cargoExibicao('Deputado Federal', 'Feminino')).toBe('Deputada Federal');
    expect(cargoExibicao('Senador', 'Masculino')).toBe('Senador');
    expect(situacaoCurta('eleito-qp', 'Feminino')).toBe('ELEITA');
    expect(situacaoCurta('segundo-turno')).toBe('2º TURNO');
    expect(situacaoCurta('outro')).toBeNull();
    expect(situacaoTexto('nao-eleito', 'Masculino')).toBe('não eleito');
  });
});
