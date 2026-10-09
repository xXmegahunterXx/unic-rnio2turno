/**
 * Meta tags por rota (Open Graph/Twitter), injetadas no index.html no lugar de `<!--app-meta-->`.
 * Textos descritivos e neutros. O código do Duelo (/duelo/:codigo) NUNCA é lido nem decodificado aqui:
 * ele carrega respostas do Teste Cego (dado sensível, LGPD).
 */
import { pctTotalizadas, pctValidos } from '../shared/calc';
import { APP_NAME, UF_NOMES } from '../shared/constants';
import { fmtPct } from '../shared/format';
import type { Race, Summary, UF } from '../shared/types';
import { UFS } from '../shared/types';

export interface MetaPagina {
  titulo: string;
  descricao: string;
  /** caminho (com query) da imagem, relativo à origem */
  imagem: string;
  imagemAlt: string;
  /** 200 para rotas conhecidas do app, 404 para o resto (a SPA mostra a página "não encontrada") */
  status: 200 | 404;
  noindex?: boolean;
}

export interface ContextoMeta {
  races: Map<string, Race>;
  nomeMunicipio(uf: UF, cod: string): string | undefined;
  /** Placar atual (opcional; só se já estiver em cache, sem custo de cálculo). */
  placar?(race: string, uf?: UF): { resumo: Summary; simulacao: boolean; race: Race } | null;
}

const DESCRICAO_PADRAO =
  'Apuração do 2º turno de 2026 ao vivo, estado por estado, cidade por cidade, seção por seção. E o Teste Cego: escolha propostas sem saber de quem são.';
const UF_SET = new Set<string>([...UFS, 'ZZ']);

const ufDe = (s: string): UF | null => (UF_SET.has(s.toUpperCase()) ? (s.toUpperCase() as UF) : null);

function textoPlacar(p: { resumo: Summary; simulacao: boolean; race: Race }): string | null {
  const r = p.resumo;
  if (r.secoesTotalizadas <= 0) return null;
  const idx = p.race.candidatos.map((c, i) => (c.agregado ? -1 : i)).filter((i) => i >= 0);
  const partes = idx.map((i) => `${p.race.candidatos[i].nomeUrna} ${fmtPct(pctValidos(r, i))}`);
  const base = `Com ${fmtPct(pctTotalizadas(r))} das seções totalizadas: ${partes.join(' · ')} dos votos válidos.`;
  return p.simulacao ? `SIMULAÇÃO (dados fictícios). ${base}` : base;
}

/** Meta da rota `path` (sem query) com os parâmetros de busca `q`. */
export function metaDaRota(path: string, q: URLSearchParams, ctx: ContextoMeta): MetaPagina {
  const seg = path.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const raceQ = (q.get('race') ?? '').toLowerCase();
  const raceId = ctx.races.has(raceQ) ? raceQ : 'pres';
  const race = ctx.races.get(raceId);
  const ogApuracao = (uf?: UF) =>
    `/api/og/apuracao.png?race=${encodeURIComponent(raceId)}${uf ? `&uf=${uf.toLowerCase()}` : ''}`;
  const ogTeste = '/api/og/teste.png';
  const tituloRace = race ? race.titulo : 'Presidente';
  const altPlacar = (onde: string) => `Placar da apuração · ${tituloRace}${onde ? ` · ${onde}` : ''}`;
  const comPlacar = (descr: string, uf?: UF) => {
    try {
      const p = ctx.placar?.(raceId, uf);
      const t = p ? textoPlacar(p) : null;
      return t ? `${t} ${descr}` : descr;
    } catch {
      return descr;
    }
  };

  const pagina = (m: Omit<MetaPagina, 'status'> & { status?: 200 | 404 }): MetaPagina => ({ status: 200, ...m });

  if (seg.length === 0) {
    return pagina({
      titulo: `${APP_NAME} · Apuração ao vivo e Teste Cego do 2º turno`,
      descricao: DESCRICAO_PADRAO,
      imagem: ogApuracao(),
      imagemAlt: altPlacar(''),
    });
  }

  const [s0, s1, s2, s3, s4] = seg;
  if (s0 === 'apuracao') {
    if (seg.length === 1) {
      return pagina({
        titulo: `Apuração ao vivo · ${tituloRace} · ${APP_NAME}`,
        descricao: comPlacar('Resultados do 2º turno seção por seção, com mapa por estado, gráfico da apuração e o que falta apurar.'),
        imagem: ogApuracao(),
        imagemAlt: altPlacar('Brasil'),
      });
    }
    if (seg.length === 2 && s1 === 'consulta') {
      return pagina({
        titulo: `Consulte sua seção · ${APP_NAME}`,
        descricao: 'Encontre sua seção eleitoral (estado, município, zona e seção) e veja o boletim de urna.',
        imagem: ogApuracao(),
        imagemAlt: altPlacar(''),
      });
    }
    const uf = ufDe(s1);
    if (uf && seg.length <= 5 && seg.length !== 4) {
      const nomeUf = UF_NOMES[uf];
      if (seg.length === 2) {
        return pagina({
          titulo: `Apuração em ${nomeUf} · ${tituloRace} · ${APP_NAME}`,
          descricao: comPlacar(`Resultado por município em ${nomeUf}, com mapa, gráfico da apuração e eventos da noite.`, uf),
          imagem: ogApuracao(uf),
          imagemAlt: altPlacar(nomeUf),
        });
      }
      const cod = /^\d{1,5}$/.test(s2) ? s2.padStart(5, '0') : null;
      const nomeMun = cod ? ctx.nomeMunicipio(uf, cod) : undefined;
      if (nomeMun) {
        const onde = `${nomeMun} (${uf === 'ZZ' ? 'Exterior' : uf})`;
        if (seg.length === 3) {
          return pagina({
            titulo: `Apuração em ${onde} · ${tituloRace} · ${APP_NAME}`,
            descricao: `Resultado em ${onde}: zonas eleitorais, mosaico de seções e comparação com o 1º turno.`,
            imagem: ogApuracao(uf),
            imagemAlt: altPlacar(nomeUf),
          });
        }
        if (/^\d{1,4}$/.test(s3) && /^\d{1,4}$/.test(s4)) {
          return pagina({
            titulo: `Boletim de urna · Zona ${Number(s3)}, Seção ${Number(s4)} · ${onde} · ${APP_NAME}`,
            descricao: `Boletim de urna da seção ${Number(s4)} da zona ${Number(s3)} em ${onde}.`,
            imagem: ogApuracao(uf),
            imagemAlt: altPlacar(nomeUf),
          });
        }
      }
    }
    return naoEncontrada(ogApuracao());
  }
  if (s0 === 'governadores' && seg.length === 1) {
    return pagina({
      titulo: `Governadores · 2º turno nos estados · ${APP_NAME}`,
      descricao: 'As 7 disputas de governador no 2º turno (AC, AM, DF, ES, RJ, RN e TO), lado a lado, ao vivo.',
      imagem: '/api/og/apuracao.png?race=gov-rj',
      imagemAlt: 'Placar da apuração · Governador',
    });
  }
  if (s0 === 'teste' && (seg.length === 1 || (seg.length === 2 && s1 === 'resultado'))) {
    return pagina({
      titulo: `Teste Cego · escolha propostas sem saber de quem são · ${APP_NAME}`,
      descricao: 'Compare propostas dos candidatos do 2º turno sem saber de quem são. Suas respostas ficam só no seu aparelho.',
      imagem: ogTeste,
      imagemAlt: 'Teste Cego · Sintonia',
    });
  }
  if (s0 === 'duelo' && seg.length === 2) {
    return pagina({
      titulo: `Duelo no Teste Cego · ${APP_NAME}`,
      descricao: 'Alguém te desafiou no Teste Cego: faça o teste e compare as escolhas. As respostas viajam só no link.',
      imagem: ogTeste,
      imagemAlt: 'Teste Cego · Sintonia',
      noindex: true,
    });
  }
  const estaticas: Record<string, [string, string]> = {
    metodologia: ['Metodologia', 'Como calculamos e exibimos a apuração: fontes (TSE e IBGE), regras de percentuais e simulação.'],
    privacidade: ['Privacidade', 'O que coletamos (quase nada) e por que suas respostas do Teste Cego nunca saem do seu aparelho.'],
    sobre: ['Sobre', 'O Sintonia é um projeto apartidário de visualização da apuração e de comparação de propostas.'],
  };
  if (seg.length === 1 && estaticas[s0]) {
    return pagina({ titulo: `${estaticas[s0][0]} · ${APP_NAME}`, descricao: estaticas[s0][1], imagem: ogApuracao(), imagemAlt: altPlacar('') });
  }
  if (s0 === 'admin' && seg.length === 1) {
    return pagina({ titulo: `Admin · ${APP_NAME}`, descricao: 'Painel de simulação.', imagem: ogApuracao(), imagemAlt: altPlacar(''), noindex: true });
  }
  if (s0 === 'kit' && (seg.length === 1 || (seg.length === 2 && s1 === 'viz'))) {
    return pagina({ titulo: `Kit visual · ${APP_NAME}`, descricao: 'Vitrine do design system.', imagem: ogApuracao(), imagemAlt: altPlacar(''), noindex: true });
  }
  return naoEncontrada(ogApuracao());
}

function naoEncontrada(imagem: string): MetaPagina {
  return {
    titulo: `Página não encontrada · ${APP_NAME}`,
    descricao: DESCRICAO_PADRAO,
    imagem,
    imagemAlt: 'Sintonia',
    status: 404,
    noindex: true,
  };
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Injeta as meta tags no HTML (troca `<title>`, a description e o marcador `<!--app-meta-->`). */
export function injetarMeta(html: string, m: MetaPagina, origem: string, urlPagina: string, versaoImagem: string): string {
  const img = `${origem}${m.imagem}${m.imagem.includes('?') ? '&' : '?'}v=${encodeURIComponent(versaoImagem)}`;
  const t = escapeHtml(m.titulo);
  const d = escapeHtml(m.descricao);
  const tags = [
    `<meta property="og:site_name" content="${APP_NAME}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${escapeHtml(urlPagina)}" />`,
    `<meta property="og:image" content="${escapeHtml(img)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(m.imagemAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${escapeHtml(img)}" />`,
    `<link rel="canonical" href="${escapeHtml(urlPagina)}" />`,
    m.noindex ? `<meta name="robots" content="noindex, nofollow" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`);
  return out.includes('<!--app-meta-->') ? out.replace('<!--app-meta-->', tags) : out.replace('</head>', `    ${tags}\n  </head>`);
}
