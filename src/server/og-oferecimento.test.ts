/**
 * "Oferecimento: <marca>" nas imagens de compartilhamento: escolha do anunciante (master vence), faixa própria no pé
 * (todas as molduras renderizam), chave de cache com o anunciante (trocar gera imagem nova) e o `&v=` das meta tags.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnuncioConfig, AnuncioPublico } from '../shared/anuncios';
import { OG_H, OG_W, layoutPlacar, layoutTeste, renderPng, type No } from './og';
import { layoutCalculadora } from './og-cartoes';
import { FAIXA_OFERECIMENTO, comOferecimento, oferecimentoDe, tagOferecimento } from './og-oferecimento';
import { comando, login, montar } from './test-helpers';

const SAIDA = process.env.OG_PREVIA_DIR;

const pub = (id: string, extra: Partial<AnuncioPublico> = {}): AnuncioPublico => ({
  id,
  marca: `Marca ${id}`,
  titulo: 't',
  texto: '',
  cta: 'c',
  href: '#',
  destino: 'x.com',
  formatos: ['compartilhamento'],
  peso: 5,
  cota: 'apoio',
  ...extra,
});

function anuncio(id: string, extra: Partial<AnuncioConfig> = {}): AnuncioConfig {
  return {
    id,
    marca: `Marca ${id}`,
    titulo: 'Pix na hora, sem taxa',
    texto: '',
    cta: 'Abrir conta',
    url: `https://${id}.com.br`,
    formatos: ['compartilhamento'],
    peso: 5,
    cota: 'apoio',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
    ...extra,
  };
}

/** Todos os textos de uma árvore satori. */
function textos(no: unknown): string[] {
  if (typeof no === 'string') return [no];
  if (!no || typeof no !== 'object') return [];
  const ch = (no as No).props?.children;
  return (Array.isArray(ch) ? ch : [ch]).flatMap(textos);
}

describe('escolha e chave', () => {
  it('sem anúncio de compartilhamento: nada; master vence; rotação fixa por cartão', () => {
    expect(oferecimentoDe([], 'x')).toBeNull();
    expect(oferecimentoDe([pub('a', { formatos: ['topo'] })], 'x')).toBeNull();
    expect(tagOferecimento([pub('a', { formatos: ['topo'] })])).toBe('');
    const lista = [pub('a'), pub('b'), pub('m', { cota: 'master' })];
    for (const k of ['pres|br', 'mun|pres|SP|71072', 'teste']) expect(oferecimentoDe(lista, k)?.id).toBe('m');
    const semMaster = [pub('a'), pub('b', { peso: 10 })];
    const escolhas = new Set(Array.from({ length: 60 }, (_, i) => oferecimentoDe(semMaster, `cartao-${i}`)?.id));
    expect(escolhas).toEqual(new Set(['a', 'b']));
    expect(oferecimentoDe(semMaster, 'pres|br')).toEqual(oferecimentoDe(semMaster, 'pres|br'));
  });

  it('a chave muda quando o conjunto, a marca, a cota ou o peso mudam', () => {
    const t = tagOferecimento([pub('a')]);
    expect(t).toMatch(/^of[a-z0-9]+$/);
    expect(tagOferecimento([pub('a')])).toBe(t);
    expect(tagOferecimento([pub('a', { marca: 'Outra' })])).not.toBe(t);
    expect(tagOferecimento([pub('a', { cota: 'master' })])).not.toBe(t);
    expect(tagOferecimento([pub('a', { peso: 6 })])).not.toBe(t);
    expect(tagOferecimento([pub('a'), pub('b')])).not.toBe(t);
  });
});

describe('faixa no pé', () => {
  /** Placar real do 1º turno (dataset de public/data), para as imagens de prévia. */
  async function placar(): Promise<No> {
    const m = await montar();
    const snap = m.controller.nacional('pres-t1');
    const race = m.ds.meta.races.find((r) => r.id === 'pres-t1')!;
    return layoutPlacar({ race, resumo: snap.resumo, simulacao: false, horario: snap.geradoEm, pre: false });
  }

  it('rotulada, separada do conteúdo (faixa própria) e as molduras encolhem só a altura', async () => {
    const no = comOferecimento(await placar(), 'Lynx');
    expect(textos(no)).toContain('Oferecimento:');
    expect(textos(no)).toContain('Lynx');
    const [conteudo, faixa] = no.props.children as No[];
    expect(conteudo.props.style).toMatchObject({ height: OG_H - FAIXA_OFERECIMENTO, overflow: 'hidden' });
    // centralizada: nunca embaixo de um dos lados do cartão
    expect(faixa.props.style).toMatchObject({ height: FAIXA_OFERECIMENTO, width: OG_W, justifyContent: 'center' });
    expect(String(faixa.props.style!.borderTop)).toContain('solid');
    // a marca nunca passa de 40 caracteres
    expect(textos(comOferecimento(layoutTeste(), 'M'.repeat(80)))).toContain('M'.repeat(40));
  });

  // a função de moldura em si (as rotas só a aplicam aos cartões genéricos — ver 'rotas')
  it('renderiza (PNG 1200×630) em layouts de altura cheia, no Teste Cego e numa moldura de cartão', async () => {
    const casos: [string, No][] = [
      ['placar', await placar()],
      ['teste', layoutTeste()],
      ['calculadora', layoutCalculadora({ dominio: 'sintonia2026.com.br' })],
    ];
    if (SAIDA) mkdirSync(SAIDA, { recursive: true });
    for (const [nome, no] of casos) {
      const png = await renderPng(comOferecimento(no, 'Lynx'));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([OG_W, OG_H]);
      if (SAIDA) writeFileSync(join(SAIDA, `og-${nome}-oferecimento.png`), png);
    }
  }, 60_000);
});

describe('rotas', () => {
  it('só os cartões genéricos levam a faixa; trocar/tirar o anunciante gera imagens novas; meta tags com o anunciante no &v=', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-of-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><!--app-meta--></head><body></body></html>');
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const cookie = await login(m);
    const bytes = async (u: string) => Buffer.from(await (await m.app.request(u)).arrayBuffer());
    const vDe = async (p: string) => /og:image" content="[^"]*[?&]v=([^"&]+)"/.exec(await (await m.app.request(p)).text())?.[1];

    /** cartões com candidato, foto, número ou resultado: NUNCA levam a faixa */
    const comCandidato = [
      '/api/og/candidato.png?sq=280002542548',
      '/api/og/apuracao.png',
      '/api/og/senado.png',
      '/api/og/camara.png',
      '/api/og/governadores.png',
    ];
    const genericos = ['/api/og/teste.png', '/api/og/cenario.png'];
    const sem = new Map<string, Buffer>();
    for (const u of [...comCandidato, ...genericos]) sem.set(u, await bytes(u));
    const vSem = await vDe('/curiosidades');
    const vCandSem = await vDe('/candidato/280002542548');
    expect(vSem).toBeTruthy();

    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const com = new Map<string, Buffer>();
    for (const u of genericos) {
      com.set(u, await bytes(u));
      expect(com.get(u)!.equals(sem.get(u)!), u).toBe(false);
    }
    for (const u of comCandidato) expect((await bytes(u)).equals(sem.get(u)!), u).toBe(true);
    const vCom = await vDe('/curiosidades');
    expect(vCom).not.toBe(vSem);
    expect(vCom).toContain('-of');
    // página com a ficha do candidato: a imagem não tem anúncio, então a URL não muda com o anunciante
    expect(await vDe('/candidato/280002542548')).toBe(vCandSem);

    // outro anunciante (marca): imagem nova de novo nos genéricos; os com candidato seguem iguais
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { marca: 'Lynx Pay', cota: 'master' }) });
    for (const u of genericos) expect((await bytes(u)).equals(com.get(u)!), u).toBe(false);
    for (const u of comCandidato) expect((await bytes(u)).equals(sem.get(u)!), u).toBe(true);

    // anúncio sem o formato 'compartilhamento' não aparece nas imagens
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { formatos: ['topo'] }) });
    for (const u of genericos) expect((await bytes(u)).equals(sem.get(u)!), u).toBe(true);
    expect(await vDe('/curiosidades')).not.toContain('-of');
  }, 180_000);
});
