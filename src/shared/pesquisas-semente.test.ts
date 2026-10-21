/**
 * Conferência do arquivo semente REAL (public/data/pesquisas.json) contra o contrato e os candidatos do meta.json:
 * toda pesquisa passa em `validaPesquisa` (com os números de urna da disputa), o id é o do contrato
 * (`idPesquisa(instituto, registro)`), um registro do TSE = uma pesquisa, e o arquivo já vem na ordem da página.
 * Se uma pesquisa nova não passar aqui, ela ficaria FORA do site (o servidor recusa e mostra no painel).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARGOS_PESQUISA, idPesquisa, informacoesObrigatorias, ordenarPesquisas, validaPesquisa, type Pesquisa } from './pesquisas';

const raiz = join(__dirname, '..', '..');
const semente = JSON.parse(readFileSync(join(raiz, 'public/data/pesquisas.json'), 'utf8')) as { sobre: string; pesquisas: Pesquisa[] };
const meta = JSON.parse(readFileSync(join(raiz, 'public/data/meta.json'), 'utf8')) as {
  races: { id: string; turno: number; candidatos: { numero: number; agregado?: boolean }[] }[];
};
const numeros = new Map(meta.races.filter((r) => r.turno === 2).map((r) => [r.id, r.candidatos.filter((c) => !c.agregado).map((c) => c.numero)]));

describe('public/data/pesquisas.json (semente real)', () => {
  it('toda pesquisa passa na validação, com os candidatos da disputa no meta.json', () => {
    for (const p of semente.pesquisas) {
      const r = validaPesquisa(p, { candidatos: (c) => numeros.get(c) });
      expect('ok' in r ? null : `${p.instituto} ${p.registro}: ${r.erro}`).toBeNull();
      // a validação não muda nada (o arquivo já está normalizado)
      if ('ok' in r) expect(r.ok).toEqual(p);
    }
  });

  it('id do contrato, um registro = uma pesquisa, disputas do 2º turno', () => {
    const regs = new Set<string>();
    for (const p of semente.pesquisas) {
      expect(p.id).toBe(idPesquisa(p.instituto, p.registro));
      expect(regs.has(p.registro)).toBe(false);
      regs.add(p.registro);
      expect(CARGOS_PESQUISA).toContain(p.cargo);
    }
  });

  it('informações obrigatórias preenchidas em todas (nada "não informado")', () => {
    for (const p of semente.pesquisas) {
      for (const it of informacoesObrigatorias(p)) expect(it.valor, `${p.registro} ${it.rotulo}`).not.toMatch(/não informado|^$/);
      expect(p.fontes.length).toBeGreaterThan(0);
    }
  });

  it('na ordem da página (mais recente primeiro)', () => {
    expect(semente.pesquisas.map((p) => p.id)).toEqual(ordenarPesquisas(semente.pesquisas).map((p) => p.id));
  });
});
