/**
 * Meta tags por rota (unidade): imagem específica de cada página, títulos/descrições neutros, 404, noindex,
 * canônico, twitter:site e a regra LGPD do Duelo (o código nunca é lido).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Race } from '../shared/types';
import { UFS_GOV_2T } from '../shared/constants';
import { fmtLista } from '../shared/format';
import { DadosEstaticos } from './dados-estaticos';
import { OG_GENERICA_DIA_VOTACAO, consultaNormalizada, deUf, emUf, escapeHtml, injetarMeta, metaDaRota, normalizarTwitterSite, type ContextoMeta } from './meta-tags';
import { RAIZ, datasetReal } from './test-helpers';
import { join } from 'node:path';
import { MAX_CODIGO, calcularCenario, codificarCenario, cenarioDoPreset, decodificarCenario, placarCenarioTexto } from '../shared/cenarios';

let ctx: ContextoMeta;
let fase: 'pre' | 'apurando' | 'encerrada' = 'pre';
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
    expect(m.titulo).toBe('Eleição 2026 em São Paulo (SP): 1º turno e apuração do 2º turno · Sintonia');
    const s = metaDaRota('/apuracao/sp/71072/1/15', q('race=pres'), ctx);
    expect(s.imagem).toBe('/api/og/secao.png?race=pres&uf=sp&cod=71072&zona=1&secao=15');
    expect(s.titulo).toContain('Boletim de urna · Zona 1, Seção 15 · São Paulo (SP)');
    // governador de outra UF: a página cai em Presidente, a imagem e o título também
    const g = metaDaRota('/apuracao/sp/71072', q('race=gov-am'), ctx);
    expect(g.imagem).toContain('race=pres&');
    expect(g.titulo).toBe(m.titulo);
    expect(g.imagemAlt).toContain('· Presidente');
    expect(metaDaRota('/apuracao/sp/99999', q(), ctx).status).toBe(404);
    expect(metaDaRota('/apuracao/sp/71072/0/15', q(), ctx).status).toBe(404);
  });

  it('UF: título e alt com a corrida mostrada na UF, sem repetir o estado (ensaio geral 12/10/2026)', () => {
    const am = metaDaRota('/apuracao/am', q('race=gov-am'), ctx);
    expect(am.titulo).toBe('Eleição 2026 no Amazonas: 1º turno e apuração do 2º turno · Governador · Sintonia');
    expect(am.imagemAlt).toBe('Placar da apuração · Governador · Amazonas');
    // governador de outra UF: título, alt e imagem seguem Presidente, como a página
    const sp = metaDaRota('/apuracao/sp', q('race=gov-am'), ctx);
    expect(sp.titulo).toBe('Eleição 2026 em São Paulo: 1º turno e apuração do 2º turno · Sintonia');
    expect(sp.imagemAlt).toBe('Placar da apuração · Presidente · São Paulo');
    expect(sp.imagem).toContain('race=pres&');
  });

  it('/anuncie é página conhecida (200) com título e descrição próprios', () => {
    const m = metaDaRota('/anuncie', q(), ctx);
    expect(m.status).toBe(200);
    expect(m.titulo).toBe('Anuncie no Sintonia · Sintonia');
    expect(m.descricao).toContain('não políticas');
  });

  it('/kit só existe quando o build tem a vitrine (dev/demo); em produção é 404', () => {
    expect(metaDaRota('/kit', q(), ctx).status).toBe(404);
    expect(metaDaRota('/kit/viz', q(), ctx).status).toBe(404);
    const k = metaDaRota('/kit', q(), { ...ctx, kit: true });
    expect(k.status).toBe(200);
    expect(k.noindex).toBe(true);
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
    // quantidade e siglas derivadas de UFS_GOV_2T (o RJ saiu do 2º turno em 10/10/2026)
    const gov = metaDaRota('/governadores', q(), ctx);
    expect(gov.descricao).toContain(`As ${UFS_GOV_2T.length} disputas de governador no 2º turno (${fmtLista(UFS_GOV_2T)})`);
    expect(gov.descricao).not.toContain('RJ');
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
    expect(consultaNormalizada(q('utm_source=x&race=gov-am&fbclid=1'))).toBe('race=gov-am');
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

describe('título depois do fim da apuração', () => {
  it('/apuracao: "Apuração ao vivo" até o fim; com a fase pública encerrada, "Resultado do 2º turno"', () => {
    fase = 'apurando';
    expect(metaDaRota('/apuracao', q(), ctx)?.titulo).toMatch(/^Apuração ao vivo · Presidente/);
    fase = 'encerrada';
    expect(metaDaRota('/apuracao', q(), ctx)?.titulo).toMatch(/^Resultado do 2º turno 2026 · Presidente/);
    fase = 'pre';
  });
});

// ---- leva 3: títulos por fase, placar na descrição, dia da votação e parâmetros de origem (I07, I08) ----------------

/** Termos de torcida/projeção que nunca podem aparecer (união das listas PROIBIDAS dos textos do app). */
const PROIBIDAS = /vai ganhar|vitória|esmagador|derrota|virou o jogo|lavada|surra|favorito|torcida|imbat|vence|ganh|lidera|previs/i;
/** 20/10/2026 12h de Brasília (antes do dia da votação). */
const ANTES = Date.UTC(2026, 9, 20, 15, 0, 0);

/** Contexto com placar fixo em toda corrida (votos na ordem da urna; 1º turno com "Outros"). */
function comPlacarFixo(base: ContextoMeta, agora = ANTES): ContextoMeta & { pedidos: string[] } {
  const pedidos: string[] = [];
  const placar = (race: string) => {
    pedidos.push(race);
    const r = base.races.get(race)!;
    const votos = r.turno === 1 ? [430, 470, 100] : [480, 520];
    return {
      race: r,
      simulacao: false,
      resumo: { secoes: 10, secoesTotalizadas: r.turno === 1 ? 10 : 7, eleitorado: 1000, eleitoradoTotalizado: 900, comparecimento: 800, abstencao: 100, votos, brancos: 0, nulos: 0, status: 'apurando' as const, lider: 1, eleito: null, ultimaAtualizacao: null },
    };
  };
  return { ...base, agora: () => agora, placar: (race) => placar(race), placarMunicipio: (race) => placar(race), pedidos };
}

describe('I07: títulos e descrições por fase (Brasil, UF e município)', () => {
  it('município: os três títulos do plano, sem nome de candidato; cargo só fora de Presidente', () => {
    const c = comPlacarFixo(ctx);
    const titulo = (f: typeof fase, path = '/apuracao/sp/62910', qs = '') => {
      fase = f;
      return metaDaRota(path, q(qs), c).titulo;
    };
    expect(titulo('pre')).toBe('Eleição 2026 em Campinas (SP): 1º turno e apuração do 2º turno · Sintonia');
    expect(titulo('apurando')).toBe('Apuração ao vivo em Campinas (SP) · 2º turno 2026 · Sintonia');
    expect(titulo('encerrada')).toBe('Resultado do 2º turno 2026 em Campinas (SP) · Sintonia');
    // 1º turno pedido na URL: sempre o resultado oficial
    expect(titulo('apurando', '/apuracao/sp/62910', 'race=pres-t1')).toBe('1º turno 2026 em Campinas (SP): resultado oficial · Sintonia');
    // governador na própria UF: o cargo vai no fim
    expect(titulo('apurando', '/apuracao/am/02550', 'race=gov-am')).toBe('Apuração ao vivo em Manaus (AM) · 2º turno 2026 · Governador · Sintonia');
    // exterior
    expect(titulo('encerrada', '/apuracao/zz/29254')).toBe('Resultado do 2º turno 2026 em Abidjã (Exterior) · Sintonia');
    for (const f of ['pre', 'apurando', 'encerrada'] as const) {
      fase = f;
      const m = metaDaRota('/apuracao/sp/62910', q(), c);
      expect(m.titulo).not.toMatch(/Lula|Flávio/);
      expect(m.descricao).not.toMatch(PROIBIDAS);
    }
    fase = 'pre';
  });

  it('município: antes da apuração o placar é o do 1º turno; durante e depois, o do 2º turno, na ordem da urna', () => {
    const c = comPlacarFixo(ctx);
    fase = 'pre';
    const pre = metaDaRota('/apuracao/sp/62910', q(), c);
    expect(c.pedidos.at(-1)).toBe('pres-t1');
    expect(pre.descricao).toBe('Campinas (SP) · 1º turno (resultado oficial): Lula 43,00% · Flávio Bolsonaro 47,00% dos votos válidos. Zonas, mosaico de seções e, em 25/10, o 2º turno ao vivo.');
    fase = 'apurando';
    const ap = metaDaRota('/apuracao/sp/62910', q(), c);
    expect(c.pedidos.at(-1)).toBe('pres');
    expect(ap.descricao).toBe('Campinas (SP) · Com 70,00% das seções totalizadas: Lula 48,00% · Flávio Bolsonaro 52,00% dos votos válidos. Zonas eleitorais e mosaico de seções, ao vivo.');
    // ordem da urna (13 antes de 22), mesmo com o 22 à frente
    expect(ap.descricao.indexOf('Lula')).toBeLessThan(ap.descricao.indexOf('Flávio'));
    fase = 'encerrada';
    expect(metaDaRota('/apuracao/sp/62910', q(), c).descricao).toMatch(/comparação com o 1º turno\.$/);
    fase = 'pre';
  });

  it('sem placar (TSE sem o município em cache): descrição neutra por fase, sem número', () => {
    const semPlacar: ContextoMeta = { ...ctx, agora: () => ANTES, placarMunicipio: () => null, placar: () => null };
    fase = 'apurando';
    expect(metaDaRota('/apuracao/sp/62910', q(), semPlacar).descricao).toBe(
      'Apuração do 2º turno em Campinas (SP) ao vivo, com os dados do TSE: placar, zonas eleitorais e mosaico de seções.',
    );
    fase = 'encerrada';
    expect(metaDaRota('/apuracao/sp/62910', q(), semPlacar).descricao).toMatch(/^Resultado do 2º turno em Campinas \(SP\): votos por candidato/);
    fase = 'pre';
  });

  it('UF e Brasil: títulos por fase; antes da apuração, o 1º turno oficial na descrição', () => {
    const c = comPlacarFixo(ctx);
    fase = 'pre';
    const ba = metaDaRota('/apuracao/ba', q(), c);
    expect(ba.titulo).toBe('Eleição 2026 na Bahia: 1º turno e apuração do 2º turno · Sintonia');
    expect(c.pedidos.at(-1)).toBe('pres-t1');
    expect(ba.descricao).toMatch(/^1º turno \(resultado oficial\): Lula 43,00% · Flávio Bolsonaro 47,00% dos votos válidos\. Resultado do 1º turno na Bahia/);
    const br = metaDaRota('/apuracao', q(), c);
    expect(br.titulo).toBe('Eleição 2026 para Presidente: 1º turno e apuração do 2º turno · Sintonia');
    expect(br.descricao).toMatch(/^1º turno \(resultado oficial\): Lula/);
    fase = 'apurando';
    expect(metaDaRota('/apuracao/ba', q(), c).titulo).toBe('Apuração ao vivo na Bahia · 2º turno 2026 · Sintonia');
    expect(metaDaRota('/apuracao/zz', q(), c).titulo).toBe('Apuração ao vivo no exterior · 2º turno 2026 · Sintonia');
    expect(metaDaRota('/apuracao', q(), c).titulo).toBe('Apuração ao vivo · Presidente · 2º turno 2026 · Sintonia');
    expect(metaDaRota('/apuracao', q(), c).descricao).toMatch(/^Com 70,00% das seções totalizadas: Lula 48,00% · Flávio Bolsonaro 52,00%/);
    fase = 'encerrada';
    expect(metaDaRota('/apuracao/ba', q(), c).titulo).toBe('Resultado do 2º turno 2026 na Bahia · Sintonia');
    expect(metaDaRota('/apuracao/df', q('race=gov-df'), c).titulo).toBe('Resultado do 2º turno 2026 no Distrito Federal · Governador · Sintonia');
    // 1º turno pedido na URL (antes, saía "Apuração ao vivo · Presidente · 1º turno")
    expect(metaDaRota('/apuracao', q('race=pres-t1'), c).titulo).toBe('Resultado do 1º turno 2026 · Presidente · Sintonia');
    fase = 'pre';
  });

  it('dia da votação (0h–17h de 25/10): nenhuma descrição com nome ou número de candidato; às 17h volta', () => {
    const manha = comPlacarFixo(ctx, Date.UTC(2026, 9, 25, 13, 0, 0)); // 10h de Brasília
    fase = 'pre';
    for (const p of ['/apuracao', '/apuracao/sp', '/apuracao/sp/62910', '/tv', '/embed/placar']) {
      const m = metaDaRota(p, q(), manha);
      expect(m.descricao, p).not.toMatch(/Lula|Flávio|%/);
    }
    expect(manha.pedidos).toEqual([]);
    expect(metaDaRota('/apuracao/sp/62910', q(), manha).descricao).toMatch(/^Resultado do 1º turno em Campinas \(SP\) e, em 25\/10/);
    const vespera = comPlacarFixo(ctx, Date.UTC(2026, 9, 25, 2, 59, 0)); // 23h59 de 24/10
    expect(metaDaRota('/apuracao/sp/62910', q(), vespera).descricao).toMatch(/Lula 43,00%/);
    const apuracao = comPlacarFixo(ctx, Date.UTC(2026, 9, 25, 20, 0, 0)); // 17h
    fase = 'apurando';
    expect(metaDaRota('/apuracao/sp/62910', q(), apuracao).descricao).toMatch(/Lula 48,00%/);
    fase = 'pre';
  });

  it('dia da votação (0h–17h de 25/10): a IMAGEM de prévia também sai sem candidato; antes e às 17h volta', () => {
    const manha = comPlacarFixo(ctx, Date.UTC(2026, 9, 25, 19, 59, 0)); // 16h59 de Brasília
    fase = 'pre';
    for (const p of ['/', '/apuracao', '/apuracao/sp', '/apuracao/sp/62910', '/apuracao/sp/62910/1/1', '/governadores', '/live', '/tv', '/streamers', '/sobre', '/embed/placar']) {
      const m = metaDaRota(p, q(), manha);
      expect(m.imagem, p).toBe(OG_GENERICA_DIA_VOTACAO);
      expect(m.imagemVersao, p).toBeUndefined();
      expect(m.imagemAlt, p).not.toMatch(/Lula|Flávio|Placar/);
    }
    // imagens sem candidato não mudam (Teste Cego, Anuncie, Palpite)
    expect(metaDaRota('/teste', q(), manha).imagem).toBe('/api/og/teste.png');
    expect(metaDaRota('/anuncie', q(), manha).imagem).toBe('/api/og/anuncie.png');
    const vespera = comPlacarFixo(ctx, Date.UTC(2026, 9, 25, 2, 59, 0)); // 23h59 de 24/10
    expect(metaDaRota('/apuracao', q(), vespera).imagem).toBe('/api/og/apuracao.png?race=pres');
    const apuracao = comPlacarFixo(ctx, Date.UTC(2026, 9, 25, 20, 0, 0)); // 17h
    fase = 'apurando';
    expect(metaDaRota('/apuracao/sp', q(), apuracao).imagem).toBe('/api/og/apuracao.png?race=pres&uf=sp');
    expect(metaDaRota('/', q(), apuracao).imagem).toBe('/api/og/apuracao.png?race=pres');
    fase = 'pre';
  });

  it('simulação: o placar da descrição leva a marca SIMULAÇÃO', () => {
    const c = comPlacarFixo(ctx);
    const sim: ContextoMeta = { ...c, placar: (race) => ({ ...c.placar!(race)!, simulacao: true }) };
    fase = 'apurando';
    expect(metaDaRota('/apuracao', q(), sim).descricao).toMatch(/^SIMULAÇÃO \(dados fictícios\)\. Com 70,00%/);
    fase = 'pre';
  });
});

describe('I08: parâmetros de origem do link não mudam a página', () => {
  it('utm_*, h e via ficam fora da chave do cache do HTML e do canônico; o canônico do município é o caminho', () => {
    const base = consultaNormalizada(q('race=pres'));
    expect(consultaNormalizada(q('race=pres&utm_source=x&h=1845&via=embed&utm_medium=social'))).toBe(base);
    expect(consultaNormalizada(q('utm_source=whatsapp&h=2010'))).toBe('');
    for (const p of ['/apuracao', '/apuracao/sp', '/apuracao/sp/62910', '/palpite', '/teste']) {
      const a = metaDaRota(p, q(), ctx);
      const b = metaDaRota(p, q('utm_source=x&h=1845&via=embed'), ctx);
      expect(b, p).toEqual(a);
      expect(`${b.canonico ?? ''}${b.imagem}`).not.toMatch(/utm_|[?&]h=|via=/);
    }
  });
});
