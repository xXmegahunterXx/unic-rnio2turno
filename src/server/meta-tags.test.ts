/**
 * Meta tags por rota (unidade): imagem específica de cada página, títulos/descrições neutros, 404, noindex,
 * canônico, twitter:site e a regra LGPD do Duelo (o código nunca é lido).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Race } from '../shared/types';
import { DadosEstaticos } from './dados-estaticos';
import { consultaNormalizada, deUf, emUf, escapeHtml, injetarMeta, metaDaRota, normalizarTwitterSite, type ContextoMeta } from './meta-tags';
import { RAIZ, datasetReal } from './test-helpers';
import { join } from 'node:path';
import { MAX_CODIGO, calcularCenario, codificarCenario, cenarioDoPreset, decodificarCenario, placarCenarioTexto } from '../shared/cenarios';

let ctx: ContextoMeta;
let fase: 'pre' | 'apurando' = 'pre';
const q = (s = '') => new URLSearchParams(s);

beforeAll(async () => {
  const ds = await datasetReal();
  const est = new DadosEstaticos(join(RAIZ, 'public/data'));
  const races = new Map<string, Race>(ds.meta.races.map((r) => [r.id, r]));
  const nomes = new Map<string, string>();
  for (const [uf, d] of Object.entries(ds.ufs)) for (const m of d?.municipios ?? []) nomes.set(`${uf}|${m.cod}`, m.nome);
  ctx = {
    races,
    nomeMunicipio: (uf, cod) => nomes.get(`${uf}|${cod}`),
    fase: () => fase,
    ficha: (sq) => ({ lida: est.ficha(sq), existe: est.existeCandidato(sq) }),
    cargo: (n) => est.cargo(n),
    curiosidades: () => est.curiosidades(),
    cenario(codigo) {
      if (codigo.length > MAX_CODIGO) return null;
      const d = est.presidenteT1();
      const c = d ? decodificarCenario(codigo, d.valor) : null;
      return d && c ? { codigo: codificarCenario(c), placar: placarCenarioTexto(d.valor, calcularCenario(d.valor, c)), versao: d.versao } : null;
    },
  };
});

describe('imagem específica por página', () => {
  it('município e seção', () => {
    const m = metaDaRota('/apuracao/sp/71072', q(), ctx);
    expect(m.status).toBe(200);
    expect(m.imagem).toBe('/api/og/municipio.png?race=pres&uf=sp&cod=71072');
    expect(m.titulo).toBe('Apuração em São Paulo (SP) · Presidente · Sintonia');
    const s = metaDaRota('/apuracao/sp/71072/1/15', q('race=pres'), ctx);
    expect(s.imagem).toBe('/api/og/secao.png?race=pres&uf=sp&cod=71072&zona=1&secao=15');
    expect(s.titulo).toContain('Boletim de urna · Zona 1, Seção 15 · São Paulo (SP)');
    // governador de outra UF: a página cai em Presidente, a imagem e o título também
    const g = metaDaRota('/apuracao/sp/71072', q('race=gov-rj'), ctx);
    expect(g.imagem).toContain('race=pres&');
    expect(g.titulo).toContain('· Presidente ·');
    expect(metaDaRota('/apuracao/sp/99999', q(), ctx).status).toBe(404);
    expect(metaDaRota('/apuracao/sp/71072/0/15', q(), ctx).status).toBe(404);
  });

  it('candidato: ficha real (título, descrição com votos) e 404 fora do índice', () => {
    const m = metaDaRota('/candidato/280002542548', q(), ctx);
    expect(m.status).toBe(200);
    expect(m.imagem).toBe('/api/og/candidato.png?sq=280002542548');
    expect(m.titulo).toBe('Lula (PT) · Presidente · Ficha do candidato · Sintonia');
    expect(m.descricao).toMatch(/53\.879\.538 votos/);
    expect(m.imagemVersao).toBeTruthy();
    expect(m.canonico).toBe('/candidato/280002542548');
    expect(metaDaRota('/candidato/123456789', q(), ctx).status).toBe(404);
    expect(metaDaRota('/candidato/abc', q(), ctx).status).toBe(404);
  });

  it('Senado (Brasil e UF), Câmara, Assembleias', () => {
    const sen = metaDaRota('/senado', q(), ctx);
    expect(sen.imagem).toBe('/api/og/senado.png');
    expect(sen.descricao).toMatch(/PL 19/);
    const sp = metaDaRota('/senado', q('uf=sp'), ctx);
    expect(sp.imagem).toBe('/api/og/senado.png?uf=sp');
    expect(sp.descricao).toContain('em São Paulo');
    expect(sp.canonico).toBe('/senado?uf=sp');
    expect(metaDaRota('/senado', q('uf=ac'), ctx).descricao).toContain('no Acre');
    expect(metaDaRota('/camara', q(), ctx).imagem).toBe('/api/og/camara.png');
    expect(metaDaRota('/camara', q('uf=ba'), ctx).titulo).toContain('Bancada da Bahia');
    expect(metaDaRota('/assembleias', q(), ctx).imagem).toBe('/api/og/assembleia.png');
    const df = metaDaRota('/assembleias/df', q(), ctx);
    expect(df.imagem).toBe('/api/og/assembleia.png?uf=df');
    expect(df.descricao).toContain('Câmara Legislativa do Distrito Federal');
    expect(metaDaRota('/assembleias/zz', q(), ctx).status).toBe(404);
    expect(metaDaRota('/governadores', q(), ctx).imagem).toBe('/api/og/governadores.png');
  });

  it('curiosidades: fato (?fato= ou ?f=) e capa; id desconhecido → capa', () => {
    const f = metaDaRota('/curiosidades', q('fato=finalistas-menor-diferenca'), ctx);
    expect(f.titulo).toBe('Separados por 1 voto · Curiosidades do 1º turno · Sintonia');
    expect(f.imagem).toBe('/api/og/curiosidade.png?f=finalistas-menor-diferenca');
    expect(f.canonico).toBe('/curiosidades?fato=finalistas-menor-diferenca');
    expect(metaDaRota('/curiosidades', q('f=brasil-eleitorado'), ctx).imagem).toBe('/api/og/curiosidade.png?f=brasil-eleitorado');
    const capa = metaDaRota('/curiosidades', q('fato=nao-existe'), ctx);
    expect(capa.status).toBe(200);
    expect(capa.imagem).toBe('/api/og/curiosidade.png');
  });

  it('cenários: código válido → cartão do cenário (hipotético, noindex); inválido/gigante → genérico', async () => {
    const d = new DadosEstaticos(join(RAIZ, 'public/data')).presidenteT1()!.valor;
    const cod = codificarCenario(cenarioDoPreset('metade', d));
    const m = metaDaRota('/cenarios', q(`c=${cod}`), ctx);
    expect(m.imagem).toBe(`/api/og/cenario.png?c=${cod}`);
    expect(m.titulo).toContain('Cenário hipotético');
    expect(m.descricao).toContain('não é pesquisa nem previsão');
    expect(m.noindex).toBe(true);
    for (const ruim of ['%%%', 'AAAA', 'x'.repeat(5_000)]) {
      const g = metaDaRota('/cenarios', q(`c=${encodeURIComponent(ruim)}`), ctx);
      expect(g.status).toBe(200);
      expect(g.imagem).toBe('/api/og/cenario.png');
    }
  });

  it('embeds: noindex e placar; tipo inválido → 404', () => {
    const e = metaDaRota('/embed/placar', q(), ctx);
    expect(e.status).toBe(200);
    expect(e.noindex).toBe(true);
    expect(metaDaRota('/embed/<script>', q(), ctx).status).toBe(404);
  });

  it('LGPD: o código do Duelo nunca chega a nenhuma função do contexto', () => {
    const espioes = {
      ficha: vi.fn(ctx.ficha!),
      cargo: vi.fn(ctx.cargo!),
      curiosidades: vi.fn(ctx.curiosidades!),
      cenario: vi.fn(ctx.cenario!),
      nomeMunicipio: vi.fn(ctx.nomeMunicipio),
    };
    const m = metaDaRota('/duelo/RESPOSTAS-SECRETAS-123', q('c=RESPOSTAS'), { ...ctx, ...espioes });
    expect(m.imagem).toBe('/api/og/teste.png');
    expect(m.noindex).toBe(true);
    expect(JSON.stringify(m)).not.toContain('RESPOSTAS');
    for (const f of Object.values(espioes)) expect(f).not.toHaveBeenCalled();
  });
});

describe('injetarMeta e utilidades', () => {
  it('cartão grande com dimensões, locale, canônico, secure_url e twitter:site', () => {
    const m = metaDaRota('/curiosidades', q('fato=brasil-eleitorado'), ctx);
    const html = injetarMeta('<html><head><title>x</title><!--app-meta--></head></html>', m, 'https://sintonia.app', 'https://sintonia.app/curiosidades?fato=brasil-eleitorado', 'v1', { twitterSite: '@sintonia' });
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:site" content="@sintonia" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta property="og:locale" content="pt_BR" />');
    expect(html).toContain('og:image:secure_url');
    expect(html).toContain('<link rel="canonical" href="https://sintonia.app/curiosidades?fato=brasil-eleitorado" />');
    expect(html).toContain('curiosidade.png?f=brasil-eleitorado&amp;v=v1');
    const semSite = injetarMeta('<head><!--app-meta--></head>', m, 'http://x', 'http://x/', 'v');
    expect(semSite).not.toContain('twitter:site');
    expect(semSite).not.toContain('secure_url'); // só com https
  });

  it('TWITTER_SITE normalizado; inválido → null', () => {
    expect(normalizarTwitterSite('sintonia')).toBe('@sintonia');
    expect(normalizarTwitterSite('@Sintonia_BR')).toBe('@Sintonia_BR');
    expect(normalizarTwitterSite('https://x.com/sintonia')).toBe('@sintonia');
    expect(normalizarTwitterSite('https://twitter.com/sintonia/')).toBe('@sintonia');
    expect(normalizarTwitterSite('nome com espaço')).toBeNull();
    expect(normalizarTwitterSite('"><script>')).toBeNull();
    expect(normalizarTwitterSite(undefined)).toBeNull();
  });

  it('consulta normalizada: só os parâmetros que mudam a página, em ordem fixa e limitados', () => {
    expect(consultaNormalizada(q('utm_source=x&race=gov-rj&fbclid=1'))).toBe('race=gov-rj');
    expect(consultaNormalizada(q('fato=a&race=pres'))).toBe('race=pres&fato=a');
    expect(consultaNormalizada(q(`c=${'A'.repeat(5_000)}`)).length).toBeLessThan(700);
  });

  it('preposições das UFs e escape', () => {
    expect(emUf('BA', 'Bahia')).toBe('na Bahia');
    expect(deUf('RJ')).toBe('do Rio de Janeiro');
    expect(deUf('SP')).toBe('de São Paulo');
    expect(escapeHtml('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;');
  });

  it('município: descrição com o placar do 1º turno antes da apuração (contexto com placar)', () => {
    fase = 'pre';
    const chamadas: string[] = [];
    const m = metaDaRota('/apuracao/ac/1066', q(), {
      ...ctx,
      placarMunicipio: (race) => {
        chamadas.push(race);
        const r = ctx.races.get(race)!;
        return { race: r, simulacao: false, resumo: { secoes: 1, secoesTotalizadas: 1, eleitorado: 1, eleitoradoTotalizado: 1, comparecimento: 1, abstencao: 0, votos: [60, 30, 10], brancos: 0, nulos: 0, status: 'encerrada', lider: 0, eleito: null, ultimaAtualizacao: null } };
      },
    });
    expect(chamadas).toEqual(['pres-t1']);
    expect(m.descricao).toMatch(/^Porto Walter \(AC\) · 1º turno \(resultado oficial\): Lula 60,00% · Flávio Bolsonaro 30,00% dos votos válidos\./);
  });
});
