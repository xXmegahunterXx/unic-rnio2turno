import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '../shared/constants';
import { INICIO_DIA_VOTACAO } from '../shared/diaVotacao';
import type { Pesquisa, PesquisasAdmin, PesquisasPublicas } from '../shared/pesquisas';
import type { Race } from '../shared/types';
import { CABECALHO_BORDA } from './http-cache';
import { metaDaRota, OG_COM_CANDIDATO, type ContextoMeta } from './meta-tags';
import { Pesquisas, cabecalhosAteVirada } from './pesquisas';
import { createJsonStore } from './state-store';
import { login, montar, type Montado } from './test-helpers';
import { comandoPesquisaSchema } from './validation';

// Dados de TESTE (fictícios): nenhum número aqui é de pesquisa real.
const AGORA = Date.UTC(2026, 9, 20, 15, 0, 0); // 20/10/2026 12h de Brasília

const exemplo = (o: Partial<Pesquisa> = {}): Omit<Pesquisa, 'id'> & { id?: string } => ({
  cargo: 'pres',
  instituto: 'Instituto Fictício A',
  contratante: 'Veículo Fictício',
  registro: 'BR-09001/2026',
  coletaInicio: '2026-10-14',
  coletaFim: '2026-10-16',
  divulgadaEm: '2026-10-17',
  entrevistas: 2000,
  margemPp: 2,
  confiancaPct: 95,
  totais: { '13': 45, '22': 44, brancosNulos: 7, indecisos: 4 },
  validos: { '13': 51, '22': 49 },
  fontes: ['https://exemplo.com.br/pesquisa-ficticia'],
  ...o,
});

function racesFicticias(): Map<string, Race> {
  const r = (id: string, cands: [number, string, string][]): Race =>
    ({
      id,
      cargo: id === 'pres' ? 'Presidente' : 'Governador',
      turno: 2,
      abrangencia: 'BR',
      titulo: id,
      candidatos: cands.map(([numero, nomeUrna, partido], i) => ({ numero, nomeUrna, nome: nomeUrna, partido, cor: id === 'pres' ? (i ? 'azul' : 'vermelho') : i ? 'b' : 'a' })),
      ufs: [],
      tse: { ciclo: '', eleicao: '', cargo: '', pleito: '' },
    }) as Race;
  return new Map([
    ['pres', r('pres', [[13, 'Candidato Treze', 'P1'], [22, 'Candidato Vinte e Dois', 'P2']])],
    ['gov-df', r('gov-df', [[11, 'Candidata Onze', 'P3'], [13, 'Candidato Treze DF', 'P1']])],
  ]);
}

function criar(o: { semente?: unknown; stateDir?: string; agora?: { t: number } } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'sintonia-pesq-dados-'));
  if (o.semente !== undefined) writeFileSync(join(dataDir, 'pesquisas.json'), JSON.stringify(o.semente));
  const stateDir = o.stateDir ?? mkdtempSync(join(tmpdir(), 'sintonia-pesq-estado-'));
  const relogio = o.agora ?? { t: AGORA };
  const races = racesFicticias();
  const log = { info: () => undefined, aviso: () => undefined, erro: () => undefined };
  const novo = () =>
    new Pesquisas({ now: () => relogio.t, log, dataDir, store: createJsonStore(stateDir, 'pesquisas.json', { debounceMs: 0, lembrar: 8 }), races: () => races });
  return { p: novo(), novo, dataDir, stateDir, relogio };
}

describe('cache que nunca atravessa a 0h nem as 17h de 25/10', () => {
  it('longe das viradas: 30 s + stale', () => {
    const h = cabecalhosAteVirada(AGORA, 30, true);
    expect(h['cache-control']).toBe('public, max-age=30, s-maxage=30, stale-while-revalidate=30');
    expect(h[CABECALHO_BORDA]).toBe('max-age=30, stale-while-revalidate=30, stale-if-error=600');
    expect(cabecalhosAteVirada(AGORA, 30, false)[CABECALHO_BORDA]).toBeUndefined();
  });
  it('perto da 0h de 25/10: encurta e tira o stale', () => {
    const h = cabecalhosAteVirada(INICIO_DIA_VOTACAO - 20_000, 30, true);
    expect(h['cache-control']).toBe('public, max-age=19, s-maxage=19');
    expect(h[CABECALHO_BORDA]).toBe('max-age=19');
    expect(cabecalhosAteVirada(INICIO_DIA_VOTACAO - 500, 30, true)[CABECALHO_BORDA]).toBe('no-store');
    // stale-if-error só quando não alcança a virada
    expect(cabecalhosAteVirada(INICIO_DIA_VOTACAO - 120_000, 30, true)[CABECALHO_BORDA]).toBe('max-age=30, stale-while-revalidate=30');
  });
  it('no dia da votação: até as 17h; depois, normal', () => {
    expect(cabecalhosAteVirada(INICIO_APURACAO - 10_000, 30, true)['cache-control']).toBe('public, max-age=9, s-maxage=9');
    expect(cabecalhosAteVirada(INICIO_APURACAO + 1000, 30, true)['cache-control']).toBe('public, max-age=30, s-maxage=30, stale-while-revalidate=30');
  });
});

describe('Pesquisas: semente + painel', () => {
  const semente = {
    pesquisas: [
      exemplo({ registro: 'BR-09001/2026' }),
      exemplo({ instituto: 'Instituto Fictício B', registro: 'BR-09002/2026', divulgadaEm: '2026-10-19', coletaFim: '2026-10-18' }),
      exemplo({ instituto: 'Sem registro', registro: '' }),
      exemplo({ instituto: 'Do futuro', registro: 'BR-09003/2026', divulgadaEm: '2026-10-22', coletaFim: '2026-10-21' }),
    ],
  };

  it('lê a semente, valida cada pesquisa e mostra as recusadas no painel', () => {
    const { p } = criar({ semente });
    expect(p.lista().map((x) => x.registro)).toEqual(['BR-09002/2026', 'BR-09001/2026']);
    const a = p.paraAdmin();
    expect(a.semente).toMatchObject({ lida: true, total: 2 });
    expect(a.semente.invalidas).toHaveLength(2);
    expect(a.candidatos.pres.map((c) => c.numero)).toEqual([13, 22]);
    expect(a.hoje).toBe('2026-10-20');
  });

  it('aceita a semente como lista pura e sem arquivo (lista vazia)', () => {
    expect(criar({ semente: [exemplo()] }).p.lista()).toHaveLength(1);
    const vazio = criar();
    expect(vazio.p.lista()).toEqual([]);
    expect(vazio.p.paraAdmin().semente.lida).toBe(false);
  });

  it('inclui pelo painel (validado), grava de forma atômica e outra instância lê', async () => {
    const { p, novo, stateDir, relogio } = criar({ semente });
    const r = p.aplicar({ acao: 'salvar', pesquisa: exemplo({ cargo: 'gov-df', instituto: 'Instituto C', registro: 'DF-00077/2026', totais: { '11': 40, '13': 38 }, validos: undefined }) });
    expect(r.ok).toBe(true);
    expect(p.lista().map((x) => x.registro)).toContain('DF-00077/2026');
    await p.persistir();
    const arq = JSON.parse(readFileSync(join(stateDir, 'pesquisas.json'), 'utf8'));
    expect(arq.v).toBe(1);
    expect(arq.pesquisas[0].pesquisa.registro).toBe('DF-00077/2026');
    const outra = novo();
    expect(outra.lista().map((x) => x.registro)).toContain('DF-00077/2026');
    // a outra instância vê a remoção feita aqui depois de ≤ 5 s
    p.aplicar({ acao: 'remover', id: arq.pesquisas[0].pesquisa.id });
    await p.persistir();
    relogio.t += 6000;
    expect(outra.lista().map((x) => x.registro)).not.toContain('DF-00077/2026');
  });

  it('recusa conteúdo inválido com o campo e o mesmo registro em outra pesquisa', () => {
    const { p } = criar({ semente });
    const inval = p.aplicar({ acao: 'salvar', pesquisa: exemplo({ registro: 'DF-09009/2026' }) });
    expect(inval).toMatchObject({ ok: false, status: 400, campo: 'registro' });
    const dup = p.aplicar({ acao: 'salvar', pesquisa: exemplo({ instituto: 'Outro Instituto', registro: 'BR-09001/2026' }) });
    expect(dup).toMatchObject({ ok: false, status: 409, campo: 'registro' });
    const futuro = p.aplicar({ acao: 'salvar', pesquisa: exemplo({ registro: 'BR-09010/2026', coletaFim: '2026-10-20', divulgadaEm: '2026-10-21' }) });
    expect(futuro).toMatchObject({ ok: false, status: 400, campo: 'divulgadaEm' });
  });

  it('edita uma da semente (o painel vence), remove e restaura', () => {
    const { p } = criar({ semente });
    const alvo = p.lista().find((x) => x.registro === 'BR-09001/2026')!;
    expect(p.aplicar({ acao: 'salvar', pesquisa: { ...exemplo({ registro: 'BR-09001/2026', entrevistas: 3000 }), id: alvo.id } }).ok).toBe(true);
    expect(p.lista().find((x) => x.id === alvo.id)?.entrevistas).toBe(3000);
    expect(p.paraAdmin().itens.find((i) => i.pesquisa.id === alvo.id)).toMatchObject({ origem: 'painel', sobrepoeSemente: true });
    expect(p.aplicar({ acao: 'remover', id: alvo.id }).ok).toBe(true);
    expect(p.lista().some((x) => x.id === alvo.id)).toBe(false);
    expect(p.paraAdmin().itens.find((i) => i.pesquisa.id === alvo.id)).toMatchObject({ origem: 'semente', removida: true });
    expect(p.aplicar({ acao: 'restaurar', id: alvo.id }).ok).toBe(true);
    expect(p.lista().find((x) => x.id === alvo.id)?.entrevistas).toBe(2000);
    expect(p.aplicar({ acao: 'restaurar', id: alvo.id })).toMatchObject({ ok: false, status: 409 });
    expect(p.aplicar({ acao: 'remover', id: 'nao-existe' })).toMatchObject({ ok: false, status: 404 });
  });

  it('corrigir o registro (id muda): a antiga sai, sem duplicar', () => {
    const { p } = criar({ semente });
    const alvo = p.lista().find((x) => x.registro === 'BR-09002/2026')!;
    const r = p.aplicar({ acao: 'salvar', pesquisa: exemplo({ instituto: 'Instituto Fictício B', registro: 'BR-09012/2026', divulgadaEm: '2026-10-19', coletaFim: '2026-10-18' }), idAnterior: alvo.id });
    expect(r.ok).toBe(true);
    const regs = p.lista().map((x) => x.registro);
    expect(regs).toContain('BR-09012/2026');
    expect(regs).not.toContain('BR-09002/2026');
  });

  it('dia da votação (0h–17h de 25/10): lista pública vazia e suspensa; às 17h volta', () => {
    const { p } = criar({ semente });
    expect(p.publicas(AGORA).corpo.pesquisas).toHaveLength(2);
    expect(p.publicas(INICIO_DIA_VOTACAO + 1).corpo).toEqual({ pesquisas: [], versao: 'dia-da-votacao', suspensas: true });
    expect(p.publicas(INICIO_APURACAO).corpo.pesquisas).toHaveLength(2);
  });
});

describe('zod do comando do painel', () => {
  it('forma: ação conhecida, campos com tipo e tamanho, nada além', () => {
    expect(comandoPesquisaSchema.safeParse({ acao: 'salvar', pesquisa: exemplo() }).success).toBe(true);
    expect(comandoPesquisaSchema.safeParse({ acao: 'apagar-tudo' }).success).toBe(false);
    expect(comandoPesquisaSchema.safeParse({ acao: 'salvar', pesquisa: { ...exemplo(), extra: 1 } }).success).toBe(false);
    expect(comandoPesquisaSchema.safeParse({ acao: 'salvar', pesquisa: { ...exemplo(), entrevistas: '2000' } }).success).toBe(false);
    expect(comandoPesquisaSchema.safeParse({ acao: 'salvar', pesquisa: { ...exemplo(), fontes: [] } }).success).toBe(false);
    expect(comandoPesquisaSchema.safeParse({ acao: 'remover', id: '../../etc' }).success).toBe(false);
  });
});

describe('rotas (servidor de verdade)', () => {
  const pedir = (m: Montado, cookie: string, corpo: unknown, extra: Record<string, string> = {}) =>
    m.app.request('/api/admin/pesquisas', { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...extra }, body: JSON.stringify(corpo) });

  it('GET /api/pesquisas: cache curto público, borda e ETag (304)', async () => {
    const m = await montar({ agora: AGORA });
    const r = await m.app.request('/api/pesquisas');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30, stale-while-revalidate=30');
    expect(r.headers.get(CABECALHO_BORDA)).toMatch(/^max-age=30/);
    const etag = r.headers.get('etag')!;
    expect(etag).toMatch(/^W\//);
    const corpo = (await r.json()) as PesquisasPublicas;
    expect(Array.isArray(corpo.pesquisas)).toBe(true);
    const r304 = await m.app.request('/api/pesquisas', { headers: { 'if-none-match': etag } });
    expect(r304.status).toBe(304);
  });

  it('painel: sessão obrigatória, zod, validação do conteúdo, CSRF; a pesquisa aparece na rota pública', async () => {
    const m = await montar({ agora: AGORA });
    expect((await m.app.request('/api/admin/pesquisas')).status).toBe(401);
    const cookie = await login(m);
    expect((await pedir(m, cookie, { acao: 'salvar', pesquisa: { ...exemplo(), cargo: 'senado' } })).status).toBe(400);
    const semContratante = await pedir(m, cookie, { acao: 'salvar', pesquisa: { ...exemplo(), contratante: '' } });
    expect(semContratante.status).toBe(400);
    expect(((await semContratante.json()) as { campo?: string }).campo).toBe('contratante');
    // candidato que não é desta disputa (números do meta.json real)
    const errado = await pedir(m, cookie, { acao: 'salvar', pesquisa: exemplo({ totais: { '13': 45, '45': 44 }, validos: undefined }) });
    expect(errado.status).toBe(400);
    // outro site
    expect((await pedir(m, cookie, { acao: 'salvar', pesquisa: exemplo() }, { origin: 'https://golpe.example', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const ok = await pedir(m, cookie, { acao: 'salvar', pesquisa: exemplo() });
    expect(ok.status).toBe(200);
    const adm = (await ok.json()) as PesquisasAdmin;
    expect(adm.itens).toHaveLength(1);
    expect(adm.candidatos['gov-df']?.length).toBe(2);
    const pub = (await (await m.app.request('/api/pesquisas')).json()) as PesquisasPublicas;
    expect(pub.pesquisas.map((p) => p.registro)).toEqual(['BR-09001/2026']);
    await m.pesquisas.persistir();
    expect(JSON.parse(readFileSync(join(m.stateDir, 'pesquisas.json'), 'utf8')).pesquisas).toHaveLength(1);
  });

  it('cartão de compartilhar: og, x, feed e story nas medidas certas; id desconhecido = capa', async () => {
    const m = await montar({ agora: AGORA });
    const cookie = await login(m);
    const adm = (await (await pedir(m, cookie, { acao: 'salvar', pesquisa: exemplo() })).json()) as PesquisasAdmin;
    const id = adm.itens[0].pesquisa.id;
    const dims = { og: [1200, 630], x: [1200, 675], feed: [1080, 1350], story: [1080, 1920] } as const;
    for (const [f, [w, h]] of Object.entries(dims)) {
      const r = await m.app.request(`/api/og/pesquisa.png?id=${id}&formato=${f}`);
      expect(r.status, f).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/png');
      const b = Buffer.from(await r.arrayBuffer());
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], f).toEqual([w, h]);
    }
    expect((await m.app.request('/api/og/pesquisa.png?id=pq-0000000000000000')).status).toBe(200);
    expect((await m.app.request('/api/og/pesquisa.png?formato=gigante')).status).toBe(400);
    expect((await m.app.request('/api/og/pesquisa.png?id=..%2F..')).status).toBe(400);
  }, 60_000);

  it('dia da votação: lista suspensa e a imagem vira o convite genérico', async () => {
    const m = await montar({ agora: AGORA });
    const cookie = await login(m);
    const adm = (await (await pedir(m, cookie, { acao: 'salvar', pesquisa: exemplo() })).json()) as PesquisasAdmin;
    m.relogio.t = INICIO_DIA_VOTACAO + 3600_000;
    const pub = (await (await m.app.request('/api/pesquisas')).json()) as PesquisasPublicas;
    expect(pub).toMatchObject({ pesquisas: [], suspensas: true });
    const img = await m.app.request(`/api/og/pesquisa.png?id=${adm.itens[0].pesquisa.id}`);
    expect(img.headers.get('x-og-generica')).toBe('dia-da-votacao');
    m.relogio.t = INICIO_APURACAO + 1000;
    expect(((await (await m.app.request('/api/pesquisas')).json()) as PesquisasPublicas).pesquisas).toHaveLength(1);
  }, 30_000);
});

describe('meta tags de /pesquisas', () => {
  const p = { ...exemplo(), id: 'pq-abcdef0123456789' } as Pesquisa;
  const ctx = (agora: number, achar = true): ContextoMeta => ({
    races: racesFicticias(),
    nomeMunicipio: () => undefined,
    agora: () => agora,
    pesquisa: (id) => (achar && id === p.id ? p : null),
  });
  it('capa e pesquisa com as informações obrigatórias na descrição', () => {
    const capa = metaDaRota('/pesquisas', new URLSearchParams(), ctx(AGORA));
    expect(capa.titulo).toMatch(/^Pesquisas do 2º turno/);
    expect(capa.imagem).toBe('/api/og/pesquisa.png');
    const m = metaDaRota('/pesquisas', new URLSearchParams({ p: p.id }), ctx(AGORA));
    expect(m.titulo).toContain('Pesquisa Instituto Fictício A');
    for (const t of ['Candidato Treze 45%', 'Candidato Vinte e Dois 44%', 'BR-09001/2026', '2.000 entrevistas', 'Veículo Fictício', 'confiança de 95%', 'não é resultado']) {
      expect(m.descricao).toContain(t);
    }
    expect(m.imagem).toBe(`/api/og/pesquisa.png?id=${p.id}`);
    expect(m.canonico).toBe(`/pesquisas?p=${p.id}`);
    // desconhecida → capa
    expect(metaDaRota('/pesquisas', new URLSearchParams({ p: p.id }), ctx(AGORA, false)).imagem).toBe('/api/og/pesquisa.png');
  });
  it('dia da votação: sem nome nem número e a imagem genérica', () => {
    expect(OG_COM_CANDIDATO).toContain('/api/og/pesquisa.png');
    const m = metaDaRota('/pesquisas', new URLSearchParams({ p: p.id }), ctx(INICIO_DIA_VOTACAO + 60_000));
    expect(m.descricao).not.toMatch(/Candidato|45%/);
    expect(m.imagem).toBe('/api/og/audiencia.png?m=0');
  });
});
