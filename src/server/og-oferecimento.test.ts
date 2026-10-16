/**
 * "Oferecimento: <marca>" nas imagens de compartilhamento: escolha do anunciante (master vence), faixa própria no pé
 * (todas as molduras renderizam), chave de cache com o anunciante (trocar gera imagem nova) e o `&v=` das meta tags.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnuncioConfig, AnuncioPublico } from '../shared/anuncios';
import { OG_H, OG_W, layoutTeste, renderPng, type No } from './og';
import { layoutPlacar } from './og-placar';
import { layoutCalculadora } from './og-cartoes';
import {
  FAIXA_OFERECIMENTO,
  FAIXA_OFERECIMENTO_LOGO,
  OFERECIMENTO_NO_PLACAR,
  OG_LOGO_OFERECIMENTO,
  comOferecimento,
  logoOferecimento,
  oferecimentoDe,
  tagOferecimento,
} from './og-oferecimento';
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
  it('genéricos levam a faixa (placar só com OFERECIMENTO_NO_PLACAR; ficha, bancadas e governadores nunca); trocar/tirar o anunciante gera imagens novas; meta tags com o anunciante no &v=', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-of-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><!--app-meta--></head><body></body></html>');
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const cookie = await login(m);
    const bytes = async (u: string) => Buffer.from(await (await m.app.request(u)).arrayBuffer());
    const vDe = async (p: string) => /og:image" content="[^"]*[?&]v=([^"&]+)"/.exec(await (await m.app.request(p)).text())?.[1];

    /** placar: só com OFERECIMENTO_NO_PLACAR (hoje desligado — src/shared/oferecimento.ts; regra §1.5) */
    const placar = ['/api/og/apuracao.png?race=pres-t1', '/api/og/apuracao.png?race=pres-t1&formato=story'];
    /** cartões centrados numa pessoa, em bancadas ou nos governadores (e o placar, desligado): NUNCA levam a faixa */
    const comCandidato = ['/api/og/candidato.png?sq=280002542548', '/api/og/senado.png', '/api/og/camara.png', '/api/og/governadores.png', ...(OFERECIMENTO_NO_PLACAR ? [] : placar)];
    /** genéricos (+ placar, se ligado) */
    const genericos = ['/api/og/teste.png', '/api/og/cenario.png', ...(OFERECIMENTO_NO_PLACAR ? placar : [])];
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
    // a faixa do placar sai abaixo do rodapé do Sintonia (layout: último filho, depois do conteúdo)
    const race = m.ds.meta.races.find((r) => r.id === 'pres-t1')!;
    const no = layoutPlacar({ race, resumo: m.controller.nacional('pres-t1').resumo, simulacao: false, horario: 0, pre: false, oferecimento: 'Lynx' });
    const txt = textos(no);
    expect(txt).toContain('Oferecimento:');
    expect(txt.indexOf('Oferecimento:')).toBeGreaterThan(txt.indexOf('sintonia2026.com.br'));
    expect(textos(layoutPlacar({ race, resumo: m.controller.nacional('pres-t1').resumo, simulacao: false, horario: 0, pre: false }))).not.toContain('Oferecimento:');

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

// ---- anunciantes v2: logo na faixa (E7) ---------------------------------------------------------------------------

const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAAA==';
const SVG1 = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').toString('base64')}`;
const AJ = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' } as const;

/** Nós de uma árvore satori com o tipo dado. */
function nos(no: unknown, tipo: string): No[] {
  if (!no || typeof no !== 'object') return [];
  const n = no as No;
  const ch = n.props?.children;
  return [...(n.type === tipo ? [n] : []), ...(Array.isArray(ch) ? ch : [ch]).flatMap((f) => nos(f, tipo))];
}

describe('logo na faixa (E7)', () => {
  it('logo: versão escura com o ajuste dela; senão a logo; placa do tema ESCURO; só PNG/JPEG com ajuste (WebP, SVG e sem ajuste → texto)', () => {
    expect(OG_LOGO_OFERECIMENTO).toBe(true);
    expect(logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ }))).toEqual({ src: PNG1, proporcao: 3.216, placa: 'nenhuma', comFundo: false });
    expect(logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ, logoEscuro: PNG2, logoEscuroAjuste: { ...AJ, placaEscuro: 'clara' } }))).toEqual({
      src: PNG2,
      proporcao: 3.216,
      placa: 'clara',
      comFundo: false,
    });
    // versão escura em WebP (ou sem ajuste): cai na logo
    expect(logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ, logoEscuro: WEBP, logoEscuroAjuste: AJ }))?.src).toBe(PNG1);
    expect(logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ, logoEscuro: PNG2 }))?.src).toBe(PNG1);
    // logo antiga (WebP com alfa, como a da Lynx no ar), SVG ou sem ajuste: texto
    expect(logoOferecimento(pub('a', { logo: WEBP, logoAjuste: AJ }))).toBeNull();
    expect(logoOferecimento(pub('a', { logo: SVG1, logoAjuste: AJ }))).toBeNull();
    expect(logoOferecimento(pub('a', { logo: PNG1 }))).toBeNull();
    // fundo próprio: sem placa, cantos
    expect(logoOferecimento(pub('a', { logo: PNG1, logoAjuste: { ...AJ, placaEscuro: 'clara', comFundo: true } }))).toMatchObject({ placa: 'nenhuma', comFundo: true });
    // interruptor desligado: texto
    expect(logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ }), false)).toBeNull();
    expect(oferecimentoDe([pub('a', { logo: PNG1, logoAjuste: AJ })], 'teste', false)).toEqual({ id: 'a', marca: 'Marca a' });
    expect(oferecimentoDe([pub('a', { logo: PNG1, logoAjuste: AJ })], 'teste')?.logo?.src).toBe(PNG1);
  });

  it('faixa com logo tem 44 px ("Oferecimento" + logo de 26 px, até 300 px); logotipo sem o nome em texto; ícone com o nome', () => {
    const logo = logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ }))!;
    const no = comOferecimento(layoutTeste(), 'Lynx', logo);
    const [conteudo, faixa] = no.props.children as No[];
    expect(faixa.props.style).toMatchObject({ height: FAIXA_OFERECIMENTO_LOGO, width: OG_W, justifyContent: 'center' });
    expect(conteudo.props.style).toMatchObject({ height: OG_H - FAIXA_OFERECIMENTO_LOGO });
    expect(textos(no)).toContain('Oferecimento');
    expect(textos(no)).not.toContain('Lynx');
    const [img] = nos(no, 'img').filter((i) => i.props.src === PNG1);
    expect([img.props.width, img.props.height]).toEqual([Math.round(26 * 3.216), 26]);
    // muito larga: limitada a 300 px, altura proporcional
    const larga = nos(comOferecimento(layoutTeste(), 'X', { ...logo, proporcao: 12 }), 'img').find((i) => i.props.src === PNG1)!;
    expect([larga.props.width, larga.props.height]).toEqual([300, 25]);
    // com placa: 26 px de placa, imagem de 20 px dentro
    const comPlaca = comOferecimento(layoutTeste(), 'Nortefarma', { ...logo, placa: 'clara' });
    const im = nos(comPlaca, 'img').find((i) => i.props.src === PNG1)!;
    expect(im.props.height).toBe(20);
    const placa = nos(comPlaca, 'div').find((d) => d.props.style?.background === 'rgb(255,255,255)')!;
    expect(placa.props.style).toMatchObject({ height: 26, borderRadius: 8 });
    // ícone: o nome segue em texto
    expect(textos(comOferecimento(layoutTeste(), 'Kappa', { ...logo, proporcao: 1 }))).toContain('Kappa');
    // sem logo: a faixa de 32 px de sempre
    const [, faixaTexto] = comOferecimento(layoutTeste(), 'Lynx').props.children as No[];
    expect(faixaTexto.props.style!.height).toBe(FAIXA_OFERECIMENTO);
  });

  it('a chave muda quando a logo (ou o ajuste dela) muda; logo inutilizável não muda a chave', () => {
    const t = tagOferecimento([pub('a', { logo: PNG1, logoAjuste: AJ })]);
    expect(tagOferecimento([pub('a', { logo: PNG1, logoAjuste: AJ })])).toBe(t);
    expect(tagOferecimento([pub('a', { logo: PNG2, logoAjuste: AJ })])).not.toBe(t);
    expect(tagOferecimento([pub('a', { logo: PNG1, logoAjuste: { ...AJ, placaEscuro: 'clara' } })])).not.toBe(t);
    expect(tagOferecimento([pub('a', { logo: PNG1, logoAjuste: { ...AJ, proporcao: 3 } })])).not.toBe(t);
    expect(tagOferecimento([pub('a', { logo: PNG1, logoAjuste: AJ, logoEscuro: PNG2, logoEscuroAjuste: AJ })])).not.toBe(t);
    expect(tagOferecimento([pub('a', { logo: WEBP, logoAjuste: AJ })])).toBe(tagOferecimento([pub('a')]));
    expect(tagOferecimento([pub('a', { reserva: true })])).not.toBe(tagOferecimento([pub('a')]));
  });

  it('renderiza com a logo (PNG 1200×630), com e sem placa e com fundo próprio', async () => {
    const logo = logoOferecimento(pub('a', { logo: PNG1, logoAjuste: AJ }))!;
    for (const l of [logo, { ...logo, placa: 'clara' as const }, { ...logo, placa: 'escura' as const }, { ...logo, comFundo: true }]) {
      const png = await renderPng(comOferecimento(layoutTeste(), 'Lynx', l));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([OG_W, OG_H]);
    }
  }, 60_000);

  it('rota: trocar só a logo gera imagem nova (e o &v= das meta tags muda)', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-of-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><!--app-meta--></head><body></body></html>');
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const cookie = await login(m);
    const bytes = async (u: string) => Buffer.from(await (await m.app.request(u)).arrayBuffer());
    const vDe = async (p: string) => /og:image" content="[^"]*[?&]v=([^"&]+)"/.exec(await (await m.app.request(p)).text())?.[1];
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG1 }) });
    const semAjuste = await bytes('/api/og/teste.png');
    const v0 = await vDe('/curiosidades');
    await comando(m, cookie, { tipo: 'anuncio-logo', id: 'lynx', logoAjuste: AJ });
    const comLogo = await bytes('/api/og/teste.png');
    expect(comLogo.equals(semAjuste)).toBe(false);
    expect(await vDe('/curiosidades')).not.toBe(v0);
    // interruptor geral: as imagens voltam a não ter anúncio
    await comando(m, cookie, { tipo: 'anuncios-suspensao', suspender: true });
    expect(await vDe('/curiosidades')).not.toContain('-of');
  }, 120_000);
});
