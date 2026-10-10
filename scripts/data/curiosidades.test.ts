/**
 * Conferência de public/data/curiosidades.json: recalcula fatos de forma INDEPENDENTE do script
 * (scripts/data/curiosidades.ts), lendo direto public/data/** com aritmética própria (Buffer em vez de decodeU16,
 * contas à mão em vez de src/shared/calc.ts), e verifica as regras editoriais (simetria, textos, rotas).
 *
 *   npx vitest run scripts/data/curiosidades.test.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CuriosidadesDataset, Curiosidade } from '../../src/shared/curiosidades';
import { TEMAS_CURIOSIDADES } from '../../src/shared/curiosidades';

const DATA = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'public', 'data');
const ler = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(DATA, rel), 'utf8')) as T;

const ds = ler<CuriosidadesDataset>('curiosidades.json');
const fato = (id: string): Curiosidade => {
  const f = ds.fatos.find((x) => x.id === id);
  if (!f) throw new Error(`fato ${id} ausente`);
  return f;
};

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const TODAS = [...UFS, 'ZZ'];

interface MunBruto {
  cod: string;
  nome: string;
  eleitorado: number;
  zonas: { z: number; s: string }[];
  t1: { eleitorado: number; comparecimento: number; brancos: number; nulos: number; votos: Record<string, number> };
}
const ufs = new Map<string, MunBruto[]>(TODAS.map((uf) => [uf, ler<{ municipios: MunBruto[] }>(`uf/${uf.toLowerCase()}.json`).municipios]));
const na = String(ds.finalistas.a.numero);
const nb = String(ds.finalistas.b.numero);

/** Base64 → Uint16 little-endian, sem passar por src/shared/u16.ts. */
function col(b64: string): Uint16Array {
  const buf = Buffer.from(b64, 'base64');
  const out = new Uint16Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readUInt16LE(i * 2);
  return out;
}
/** "1-3,7" → [1,2,3,7], sem passar por src/shared/calc.ts. */
function faixas(s: string): number[] {
  const out: number[] = [];
  for (const p of s.split(',').filter(Boolean)) {
    const [x, y] = p.split('-').map(Number);
    for (let n = x; n <= (y ?? x); n++) out.push(n);
  }
  return out;
}
const pct2 = (parte: number, todo: number) => Math.round((parte / todo) * 10000) / 100;

describe('curiosidades.json · estrutura e regras editoriais', () => {
  it('tem entre 18 e 30 fatos, ids únicos e temas válidos', () => {
    expect(ds.fatos.length).toBeGreaterThanOrEqual(18);
    expect(ds.fatos.length).toBeLessThanOrEqual(30);
    expect(new Set(ds.fatos.map((f) => f.id)).size).toBe(ds.fatos.length);
    const temas = new Set(TEMAS_CURIOSIDADES.map((t) => t.id));
    for (const f of ds.fatos) expect(temas.has(f.tema), f.id).toBe(true);
    for (const t of TEMAS_CURIOSIDADES) expect(ds.fatos.some((f) => f.tema === t.id), t.id).toBe(true);
  });

  it('cada fato tem número (destaque ou par), textos curtos, fonte e rota interna', () => {
    for (const f of ds.fatos) {
      expect(!!f.destaque || !!f.par, f.id).toBe(true);
      expect(f.titulo.length, f.id).toBeLessThanOrEqual(48);
      expect(f.texto.length, f.id).toBeLessThanOrEqual(200);
      expect(f.contexto.length, f.id).toBeGreaterThan(20);
      expect(f.fonte, f.id).toMatch(/TSE/);
      expect(f.rota, f.id).toMatch(/^\//);
      for (const l of f.lugares) if (l.rota) expect(l.rota, f.id).toMatch(/^\//);
      expect(JSON.stringify(f), f.id).not.toMatch(/NaN|undefined|Infinity/);
      for (const v of [f.destaque, f.par?.a.valor, f.par?.b.valor]) if (v) expect(Number.isFinite(v.valor), f.id).toBe(true);
    }
  });

  it('é simétrico: quem cita um finalista cita o outro, e todo par tem os dois lados', () => {
    const { a, b } = ds.finalistas;
    expect(a.numero).toBeLessThan(b.numero);
    // nomes de outros candidatos que contêm o nome de um finalista (ex.: "Cadu de Lula") não contam como citação
    const outros = new Set<string>();
    for (const cargo of ['governador-t1', 'senado', 'camara'])
      for (const u of ler<{ ufs: { candidatos: { nomeUrna: string }[] }[] }>(`cargos/${cargo}.json`).ufs)
        for (const c of u.candidatos)
          if (c.nomeUrna !== a.nomeUrna && c.nomeUrna !== b.nomeUrna && (c.nomeUrna.includes(a.nomeUrna) || c.nomeUrna.includes(b.nomeUrna))) outros.add(c.nomeUrna);
    const limpar = (s: string) => [...outros].reduce((acc, n) => acc.split(n).join('·'), s);
    for (const f of ds.fatos) {
      for (const campo of ['texto', 'contexto'] as const) {
        const temA = limpar(f[campo]).includes(a.nomeUrna);
        const temB = limpar(f[campo]).includes(b.nomeUrna);
        expect(temA, `${f.id}.${campo}`).toBe(temB);
      }
      if (f.par) {
        expect(f.par.a.valor.formato, f.id).toBe(f.par.b.valor.formato);
        expect(f.par.a.rotulo.length && f.par.b.rotulo.length, f.id).toBeTruthy();
      }
    }
  });

  it('não usa linguagem opinativa ou de torcida', () => {
    const proibidas = /\b(reduto|fraude|esmagador|esmagadora|vitória|derrota|massacre|lavada|vai ganhar|favorito|histórico|incrível|absurdo)\b/i;
    for (const f of ds.fatos) expect(`${f.titulo} ${f.contexto} ${f.texto}`, f.id).not.toMatch(proibidas);
  });
});

describe('curiosidades.json · recálculo independente', () => {
  it('Brasil em números: eleitorado, seções, municípios e cidades no exterior', () => {
    const f = fato('brasil-eleitorado');
    let eleitorado = 0;
    let municipios = 0;
    let secoes = 0;
    for (const uf of TODAS) {
      for (const m of ufs.get(uf)!) {
        eleitorado += m.eleitorado;
        if (uf !== 'ZZ') municipios++;
      }
      secoes += ler<{ n: number }>(`secao/${uf.toLowerCase()}.json`).n;
    }
    expect(f.destaque?.valor).toBe(eleitorado);
    expect(f.dados.secoes).toBe(secoes);
    expect(f.dados.municipios).toBe(municipios);
    expect(f.dados.cidadesExterior).toBe(ufs.get('ZZ')!.length);
    // e confere com os totais oficiais do meta.json
    const meta = ler<{ totaisPrimeiroTurno: { eleitorado: number; secoes: number } }>('meta.json');
    expect(eleitorado).toBe(meta.totaisPrimeiroTurno.eleitorado);
    expect(secoes).toBe(meta.totaisPrimeiroTurno.secoes);
  });

  it('empate exato entre os finalistas por município (Brasil)', () => {
    const f = fato('finalistas-empate-municipio');
    const empates: string[] = [];
    for (const uf of UFS)
      for (const m of ufs.get(uf)!) {
        const a = m.t1.votos[na] ?? 0;
        const b = m.t1.votos[nb] ?? 0;
        if (a === b && a > 0) empates.push(`${uf}:${m.cod}:${m.nome}:${a}`);
      }
    expect(f.destaque?.valor).toBe(empates.length);
    expect([...(f.dados.municipios as string[])].sort()).toEqual(empates.sort());
  });

  it('menor diferença entre os finalistas (municípios acima do piso)', () => {
    const f = fato('finalistas-menor-diferenca');
    const piso = ds.pisos.eleitoradoMunicipio;
    let melhor: { uf: string; m: MunBruto; d: number; dv: number } | null = null;
    for (const uf of UFS)
      for (const m of ufs.get(uf)!) {
        if (m.eleitorado < piso) continue;
        const a = m.t1.votos[na] ?? 0;
        const b = m.t1.votos[nb] ?? 0;
        if (a === b) continue;
        const v = Object.values(m.t1.votos).reduce((x, y) => x + y, 0);
        const d = Math.abs(a - b) / v;
        if (!melhor || d < melhor.d) melhor = { uf, m, d, dv: Math.abs(a - b) };
      }
    expect(melhor).not.toBeNull();
    expect(f.dados.cod).toBe(melhor!.m.cod);
    expect(f.destaque?.valor).toBe(melhor!.dv);
    expect(f.par?.a.valor.valor).toBe(melhor!.m.t1.votos[na]);
    expect(f.par?.b.valor.valor).toBe(melhor!.m.t1.votos[nb]);
  });

  it('seções com empate exato e o maior empate (colunas por seção decodificadas à mão)', () => {
    const f = fato('finalistas-empate-secoes');
    let n = 0;
    let maior = { votos: -1, comp: -1, uf: '', cod: '', zona: 0, secao: 0 };
    for (const uf of TODAS) {
      const sd = ler<{ n: number; pres: { comp: string; a: string; b: string } }>(`secao/${uf.toLowerCase()}.json`);
      const a = col(sd.pres.a);
      const b = col(sd.pres.b);
      const comp = col(sd.pres.comp);
      const ordem: { cod: string; zona: number; secao: number }[] = [];
      for (const m of ufs.get(uf)!) for (const z of m.zonas) for (const s of faixas(z.s)) ordem.push({ cod: m.cod, zona: z.z, secao: s });
      expect(ordem.length).toBe(sd.n);
      for (let i = 0; i < sd.n; i++) {
        if (a[i] !== b[i] || a[i] === 0) continue;
        n++;
        if (a[i] > maior.votos || (a[i] === maior.votos && comp[i] > maior.comp)) maior = { votos: a[i], comp: comp[i], uf, ...ordem[i] };
      }
    }
    expect(f.destaque?.valor).toBe(n);
    expect(f.dados).toMatchObject({ uf: maior.uf, cod: maior.cod, zona: maior.zona, secao: maior.secao, votosCada: maior.votos });
  });

  it('maior e menor comparecimento (municípios acima do piso)', () => {
    const piso = ds.pisos.eleitoradoMunicipio;
    const lista = UFS.flatMap((uf) => ufs.get(uf)!.filter((m) => m.eleitorado >= piso).map((m) => ({ uf, m, p: m.t1.comparecimento / m.t1.eleitorado })));
    lista.sort((x, y) => y.p - x.p);
    const max = lista[0];
    const min = lista[lista.length - 1];
    expect(fato('comparecimento-maior').dados.cod).toBe(`${max.uf}:${max.m.cod}`);
    expect(fato('comparecimento-maior').destaque?.valor).toBe(pct2(max.m.t1.comparecimento, max.m.t1.eleitorado));
    expect(fato('comparecimento-menor').dados.cod).toBe(`${min.uf}:${min.m.cod}`);
    expect(fato('comparecimento-menor').destaque?.valor).toBe(pct2(min.m.t1.comparecimento, min.m.t1.eleitorado));
  });

  it('estado de maior votação proporcional de cada finalista (par simétrico)', () => {
    const f = fato('finalistas-maior-uf');
    const porUf = UFS.map((uf) => {
      let a = 0;
      let b = 0;
      let v = 0;
      for (const m of ufs.get(uf)!) {
        a += m.t1.votos[na] ?? 0;
        b += m.t1.votos[nb] ?? 0;
        v += Object.values(m.t1.votos).reduce((x, y) => x + y, 0);
      }
      return { uf, pa: a / v, pb: b / v };
    });
    const ua = [...porUf].sort((x, y) => y.pa - x.pa)[0];
    const ub = [...porUf].sort((x, y) => y.pb - x.pb)[0];
    expect(f.dados.ufA).toBe(ua.uf);
    expect(f.dados.ufB).toBe(ub.uf);
    expect(f.par?.a.valor.valor).toBe(Math.round(ua.pa * 10000) / 100);
    expect(f.par?.b.valor.valor).toBe(Math.round(ub.pb * 10000) / 100);
  });

  it('mulheres eleitas na Câmara (fichas oficiais dos eleitos)', () => {
    const f = fato('cargos-mulheres-eleitas');
    let eleitos = 0;
    let mulheres = 0;
    for (const uf of UFS) {
      const arq = ler<{ candidatos: { genero?: string; resultado?: { situacao: string } }[] }>(`candidatos/camara-${uf.toLowerCase()}.json`);
      for (const c of arq.candidatos)
        if (c.resultado?.situacao.startsWith('eleito')) {
          eleitos++;
          if (c.genero === 'Feminino') mulheres++;
        }
    }
    expect(f.destaque?.valor).toBe(mulheres);
    expect(f.dados.deputadosEleitos).toBe(eleitos);
  });
});
