/**
 * Meta tags por rota (Open Graph/Twitter), injetadas no index.html no lugar de `<!--app-meta-->`.
 *
 * Todo link do Sintonia postado no X/WhatsApp vira um cartão grande (`summary_large_image`, imagem 1200×630) com a
 * imagem ESPECÍFICA da página (ver og-rotas.ts): município, boletim da seção, ficha do candidato, Senado/Câmara/
 * Assembleias, governadores, curiosidades e cenários. Textos descritivos, neutros e simétricos (o menor número antes,
 * sempre pela ordem da urna); títulos "perenes" (o X guarda o cartão por dias), números na descrição.
 *
 * O código do Duelo (/duelo/:codigo) NUNCA é lido nem decodificado aqui: ele carrega respostas do Teste Cego (dado
 * sensível, LGPD). Cenários (/cenarios?c=) são hipóteses de quem compartilha: o texto diz "cenário hipotético · não é
 * pesquisa nem previsão" e a página não é indexada.
 */
import { pctTotalizadas, pctValidos } from '../shared/calc';
import { APP_NAME, UF_NOMES } from '../shared/constants';
import { fmtInt, fmtPct } from '../shared/format';
import type { CandidatoFicha, CargoDataset } from '../shared/dataset';
import type { Curiosidade } from '../shared/curiosidades';
import type { Fase, Race, Summary, UF } from '../shared/types';
import { UFS } from '../shared/types';
import { emUf } from '../engine/events';
import { cargoExibicao, ehEleito, situacaoTexto } from './dados-estaticos';

export { emUf };
/** "de São Paulo" · "do Amazonas" · "da Bahia" (mesma regra de artigo de `emUf`). */
export const deUf = (uf: UF) => emUf(uf, UF_NOMES[uf]).replace(/^em /, 'de ').replace(/^no /, 'do ').replace(/^na /, 'da ');

export interface MetaPagina {
  titulo: string;
  descricao: string;
  /** caminho (com query) da imagem, relativo à origem */
  imagem: string;
  imagemAlt: string;
  /** 200 para rotas conhecidas do app, 404 para o resto (a SPA mostra a página "não encontrada") */
  status: 200 | 404;
  noindex?: boolean;
  /**
   * Versão da imagem para o `&v=` (dado oficial: muda só quando o arquivo de dados muda). Ausente = imagem ao vivo
   * (versão do admin + minuto).
   */
  imagemVersao?: string;
  /** Caminho canônico (com a query que importa), relativo à origem. Ausente = caminho + `?race=` válido. */
  canonico?: string;
}

/** Lido de um arquivo de dados com a versão (ver DadosEstaticos). */
export interface ComVersao<T> {
  valor: T;
  versao: string;
}

export interface ResumoCenarioMeta {
  /** Forma canônica do código (?c=). */
  codigo: string;
  /** "Lula 49,07% × Flávio Bolsonaro 50,93%" */
  placar: string;
  versao: string;
}

export interface ContextoMeta {
  races: Map<string, Race>;
  nomeMunicipio(uf: UF, cod: string): string | undefined;
  /** Placar atual (opcional; só se já estiver em cache, sem custo de cálculo). */
  placar?(race: string, uf?: UF): { resumo: Summary; simulacao: boolean; race: Race } | null;
  /** Placar do município na corrida pedida (opcional). */
  placarMunicipio?(race: string, uf: UF, cod: string): { resumo: Summary; simulacao: boolean; race: Race } | null;
  /** Fase da apuração agora ('pre' → as páginas de apuração mostram o 1º turno). */
  fase?(): Fase;
  /** Ficha do candidato; `existe` diz se o índice conhece o sequencial ('sem-indice' = não dá para saber). */
  ficha?(sq: string): { lida: ComVersao<CandidatoFicha> | null; existe: 'existe' | 'nao-existe' | 'sem-indice' };
  cargo?(nome: 'senado' | 'camara' | 'assembleia'): ComVersao<CargoDataset> | null;
  curiosidades?(): ComVersao<{ fatos: Curiosidade[] }> | null;
  /** Cenário decodificado (null = código inválido). */
  cenario?(codigo: string): ResumoCenarioMeta | null;
}

const DESCRICAO_PADRAO =
  'Apuração do 2º turno de 2026 ao vivo, estado por estado, cidade por cidade, seção por seção. E o Teste Cego: concorde ou discorde de ideias sem saber de quem são.';
const UF_SET = new Set<string>([...UFS, 'ZZ']);

const ufDe = (s: string | null | undefined): UF | null => (s && UF_SET.has(s.toUpperCase()) ? (s.toUpperCase() as UF) : null);
const ufBrDe = (s: string | null | undefined): UF | null => {
  const u = ufDe(s);
  return u && u !== 'ZZ' ? u : null;
};

/** "Com 62,3% das seções totalizadas: A 51,2% · B 48,8% dos votos válidos." (+ marca de simulação) */
export function textoPlacar(p: { resumo: Summary; simulacao: boolean; race: Race }): string | null {
  const r = p.resumo;
  if (r.secoesTotalizadas <= 0) return null;
  const idx = p.race.candidatos.map((c, i) => (c.agregado ? -1 : i)).filter((i) => i >= 0);
  const partes = idx.map((i) => `${p.race.candidatos[i].nomeUrna} ${fmtPct(pctValidos(r, i))}`);
  const base =
    p.race.turno === 1
      ? `1º turno (resultado oficial): ${partes.join(' · ')} dos votos válidos.`
      : `Com ${fmtPct(pctTotalizadas(r))} das seções totalizadas: ${partes.join(' · ')} dos votos válidos.`;
  return p.simulacao ? `SIMULAÇÃO (dados fictícios). ${base}` : base;
}

/** Bancadas por tamanho: "PL 119, PT 70, UNIÃO 44" (as `n` maiores). */
function bancadasTexto(b: { sigla: string; eleitos: number }[], n: number): string {
  return [...b]
    .filter((x) => x.eleitos > 0)
    .sort((x, y) => y.eleitos - x.eleitos || x.sigla.localeCompare(y.sigla, 'pt-BR'))
    .slice(0, n)
    .map((x) => `${x.sigla} ${fmtInt(x.eleitos)}`)
    .join(', ');
}

const cortar = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Parâmetros de busca que mudam o conteúdo da página (entram na chave do cache do HTML). */
export const PARAMS_RELEVANTES = ['race', 'uf', 'fato', 'f', 'tema', 'c'] as const;

/** Query normalizada (só os parâmetros relevantes, em ordem fixa, valores limitados) — chave de cache do HTML. */
export function consultaNormalizada(q: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const k of PARAMS_RELEVANTES) {
    const v = q.get(k);
    if (v) p.set(k, v.slice(0, 640));
  }
  return p.toString();
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
  /** Corrida válida para a UF (governador só na própria UF; senão Presidente, como a página faz). */
  const raceNaUf = (uf: UF) => (race && race.ufs.includes(uf) ? raceId : 'pres');
  const ogApuracao = (uf?: UF) =>
    `/api/og/apuracao.png?race=${encodeURIComponent(uf ? raceNaUf(uf) : raceId)}${uf ? `&uf=${uf.toLowerCase()}` : ''}`;
  const ogTeste = '/api/og/teste.png';
  const tituloRace = race ? race.titulo : 'Presidente';
  const altPlacar = (onde: string) => `Placar da apuração · ${tituloRace}${onde ? ` · ${onde}` : ''}`;
  const tentar = <T>(f: () => T): T | null => {
    try {
      return f();
    } catch {
      return null;
    }
  };
  const comPlacar = (descr: string, uf?: UF) => {
    const p = tentar(() => ctx.placar?.(raceId, uf) ?? null);
    const t = p ? textoPlacar(p) : null;
    return t ? `${t} ${descr}` : descr;
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
          titulo: `Apuração em ${nomeUf} · ${ctx.races.get(raceNaUf(uf))?.titulo ?? tituloRace} · ${APP_NAME}`,
          descricao: comPlacar(`Resultado por município em ${nomeUf}, com mapa, gráfico da apuração e eventos da noite.`, uf),
          imagem: ogApuracao(uf),
          imagemAlt: altPlacar(nomeUf),
        });
      }
      const cod = /^\d{1,5}$/.test(s2) ? s2.padStart(5, '0') : null;
      const nomeMun = cod ? ctx.nomeMunicipio(uf, cod) : undefined;
      if (nomeMun && cod) {
        const onde = `${nomeMun} (${uf === 'ZZ' ? 'Exterior' : uf})`;
        const raceMun = raceNaUf(uf);
        const tituloMun = ctx.races.get(raceMun)?.titulo ?? tituloRace;
        const qsMun = `race=${encodeURIComponent(raceMun)}&uf=${uf.toLowerCase()}&cod=${cod}`;
        if (seg.length === 3) {
          // a página mostra o 1º turno quando pedido (-t1) ou antes da apuração; a imagem segue a mesma regra
          const p = tentar(() => {
            const r = ctx.races.get(raceMun);
            const alvo = r && r.turno === 2 && ctx.fase?.() === 'pre' ? `${raceMun}-t1` : raceMun;
            return ctx.placarMunicipio?.(ctx.races.has(alvo) ? alvo : raceMun, uf, cod) ?? null;
          });
          const t = p ? textoPlacar(p) : null;
          const resto = `Resultado em ${onde}: zonas eleitorais, mosaico de seções e comparação com o 1º turno.`;
          const cauda = p?.race.turno === 1 ? 'Zonas, mosaico de seções e, em 25/10, o 2º turno ao vivo.' : 'Zonas eleitorais e mosaico de seções, ao vivo.';
          return pagina({
            titulo: `Apuração em ${onde} · ${tituloMun} · ${APP_NAME}`,
            descricao: t ? `${onde} · ${t} ${cauda}` : resto,
            imagem: `/api/og/municipio.png?${qsMun}`,
            imagemAlt: `Placar em ${onde} · ${tituloMun}`,
          });
        }
        if (/^\d{1,4}$/.test(s3) && /^\d{1,4}$/.test(s4) && Number(s3) > 0 && Number(s4) > 0) {
          const zona = Number(s3);
          const secao = Number(s4);
          return pagina({
            titulo: `Boletim de urna · Zona ${zona}, Seção ${secao} · ${onde} · ${APP_NAME}`,
            descricao: `Como votou a seção ${secao} da zona ${zona} em ${onde}: o resultado oficial do 1º turno e, em 25/10, o boletim do 2º turno.`,
            imagem: `/api/og/secao.png?${qsMun}&zona=${zona}&secao=${secao}`,
            imagemAlt: `Boletim de urna da seção ${secao}, zona ${zona}, ${onde}`,
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
      imagem: '/api/og/governadores.png',
      imagemAlt: 'As 7 disputas de governador no 2º turno',
    });
  }
  if (s0 === 'teste' && (seg.length === 1 || (seg.length === 2 && s1 === 'resultado'))) {
    return pagina({
      titulo: `Teste Cego · concorde ou discorde sem saber de quem é cada ideia · ${APP_NAME}`,
      descricao: 'Afirmações dos programas do 2º turno, sem nomes nem partidos: concorde ou discorde e descubra no fim com qual programa tem mais sintonia. Suas respostas ficam só no seu aparelho.',
      imagem: ogTeste,
      imagemAlt: 'Teste Cego · Sintonia',
      canonico: path,
    });
  }
  if (s0 === 'duelo' && seg.length === 2) {
    // LGPD: o código (respostas do Teste Cego) não é lido; o canônico também não o repete
    return pagina({
      titulo: `Duelo no Teste Cego · ${APP_NAME}`,
      descricao: 'Alguém te desafiou no Teste Cego: faça o teste e compare as escolhas. As respostas viajam só no link.',
      imagem: ogTeste,
      imagemAlt: 'Teste Cego · Sintonia',
      noindex: true,
      // og:url/canônico sem o código (respostas do Teste Cego): o cartão é o do Teste Cego
      canonico: '/teste',
    });
  }
  // ---- fase 2: modo TV, 1º turno de todos os cargos e ficha do candidato -------------------------
  if (s0 === 'tv' && seg.length === 1) {
    return pagina({
      titulo: `Modo TV · Apuração ao vivo · ${APP_NAME}`,
      descricao: comPlacar('Tela cheia com mapa, placar e os eventos da apuração do 2º turno, feita para transmissão.'),
      imagem: ogApuracao(),
      imagemAlt: altPlacar('Brasil'),
    });
  }
  if (s0 === 'senado' && seg.length === 1) {
    const lido = tentar(() => ctx.cargo?.('senado') ?? null);
    const uf = ufBrDe(q.get('uf'));
    if (uf) {
      const u = lido?.valor.ufs.find((x) => x.uf === uf);
      const eleitos = u ? u.candidatos.filter((c) => ehEleito(c.situacao)) : [];
      const nomes = eleitos.map((c) => `${c.nomeUrna} (${c.partido}, ${fmtInt(c.votos)} votos)`);
      return pagina({
        titulo: `Senado · ${UF_NOMES[uf]} · Eleitos em 2026 · ${APP_NAME}`,
        descricao: nomes.length
          ? `Eleitos para o Senado ${emUf(uf, UF_NOMES[uf])} no 1º turno de 2026: ${nomes.join(' e ')}. Resultado oficial do TSE.`
          : `Senadores eleitos ${emUf(uf, UF_NOMES[uf])} em 2026, com votação e dados públicos do TSE.`,
        imagem: `/api/og/senado.png?uf=${uf.toLowerCase()}`,
        imagemAlt: `Senadores eleitos ${emUf(uf, UF_NOMES[uf])} em 2026`,
        imagemVersao: lido?.versao,
        canonico: `/senado?uf=${uf.toLowerCase()}`,
      });
    }
    const comp = lido?.valor.composicao;
    return pagina({
      titulo: `Senado · Resultado do 1º turno de 2026 · ${APP_NAME}`,
      descricao: comp?.length
        ? `As 54 vagas do Senado em 2026 por partido: ${bancadasTexto(comp, 5)}. Os eleitos em cada estado, com votação e dados públicos do TSE.`
        : 'Os senadores eleitos em 2026 em cada estado (duas vagas por UF), com votação e dados públicos do TSE.',
      imagem: '/api/og/senado.png',
      imagemAlt: 'Senadores eleitos em 2026 por partido',
      imagemVersao: lido?.versao,
      canonico: '/senado',
    });
  }
  if (s0 === 'camara' && seg.length === 1) {
    const lido = tentar(() => ctx.cargo?.('camara') ?? null);
    const uf = ufBrDe(q.get('uf'));
    if (uf) {
      const u = lido?.valor.ufs.find((x) => x.uf === uf);
      const b = (u?.partidos ?? []).map((p) => ({ sigla: p.sigla, eleitos: p.eleitos }));
      return pagina({
        titulo: `Câmara dos Deputados · Bancada ${deUf(uf)} · Eleitos em 2026 · ${APP_NAME}`,
        descricao: b.length && u
          ? `As ${fmtInt(u.vagas)} cadeiras ${deUf(uf)} na Câmara por partido: ${bancadasTexto(b, 5)}. Os eleitos, com votação (fonte: TSE).`
          : `Deputados federais eleitos ${emUf(uf, UF_NOMES[uf])} em 2026, por partido (fonte: TSE).`,
        imagem: `/api/og/camara.png?uf=${uf.toLowerCase()}`,
        imagemAlt: `Bancada ${deUf(uf)} na Câmara dos Deputados`,
        imagemVersao: lido?.versao,
        canonico: `/camara?uf=${uf.toLowerCase()}`,
      });
    }
    const comp = lido?.valor.composicao;
    return pagina({
      titulo: `Câmara dos Deputados · Eleitos em 2026 · ${APP_NAME}`,
      descricao: comp?.length
        ? `As 513 cadeiras da Câmara dos Deputados por partido: ${bancadasTexto(comp, 6)}. Os eleitos em 2026 em cada estado (fonte: TSE).`
        : 'As 513 cadeiras da Câmara dos Deputados por partido e por estado, com os eleitos em 2026 (fonte: TSE).',
      imagem: '/api/og/camara.png',
      imagemAlt: 'A nova Câmara dos Deputados por partido',
      imagemVersao: lido?.versao,
      canonico: '/camara',
    });
  }
  if (s0 === 'assembleias' && seg.length <= 2) {
    const lido = tentar(() => ctx.cargo?.('assembleia') ?? null);
    if (seg.length === 1) {
      return pagina({
        titulo: `Assembleias Legislativas · Eleitos em 2026 · ${APP_NAME}`,
        descricao: 'Deputados estaduais e distritais eleitos em 2026 nos 27 estados, por partido, com votação (fonte: TSE).',
        imagem: '/api/og/assembleia.png',
        imagemAlt: 'Deputados estaduais eleitos em 2026 por partido',
        imagemVersao: lido?.versao,
        canonico: '/assembleias',
      });
    }
    const uf = ufBrDe(s1);
    if (uf) {
      const nomeUf = UF_NOMES[uf];
      const casa = uf === 'DF' ? 'Câmara Legislativa' : 'Assembleia Legislativa';
      const u = lido?.valor.ufs.find((x) => x.uf === uf);
      const b = (u?.partidos ?? []).map((p) => ({ sigla: p.sigla, eleitos: p.eleitos }));
      return pagina({
        titulo: `${casa} · ${nomeUf} · Eleitos em 2026 · ${APP_NAME}`,
        descricao: b.length && u
          ? `As ${fmtInt(u.vagas)} cadeiras da ${casa} ${deUf(uf)} por partido: ${bancadasTexto(b, 5)}. Os eleitos, com votação (fonte: TSE).`
          : `Deputados ${uf === 'DF' ? 'distritais' : 'estaduais'} eleitos ${emUf(uf, nomeUf)} em 2026, por partido, com votação (fonte: TSE).`,
        imagem: `/api/og/assembleia.png?uf=${uf.toLowerCase()}`,
        imagemAlt: `${casa} ${deUf(uf)} por partido`,
        imagemVersao: lido?.versao,
        canonico: `/assembleias/${uf.toLowerCase()}`,
      });
    }
    return naoEncontrada(ogApuracao());
  }
  if (s0 === 'candidato' && seg.length === 2) {
    if (!/^\d{6,15}$/.test(s1)) return naoEncontrada(ogApuracao());
    const fx = tentar(() => ctx.ficha?.(s1) ?? null);
    if (fx?.existe === 'nao-existe') return naoEncontrada(ogApuracao());
    const f = fx?.lida?.valor;
    if (f) {
      const cargo = cargoExibicao(f.cargo, f.genero);
      const onde = f.uf === 'BR' ? 'Brasil' : (UF_NOMES as Record<string, string>)[f.uf] ?? f.uf;
      const r = f.resultado;
      const sit = situacaoTexto(r?.situacao, f.genero);
      const res = r ? ` No 1º turno de 2026: ${fmtInt(r.votos)} votos (${fmtPct(r.pct)} dos válidos)${sit ? `, ${sit}` : ''}.` : '';
      return pagina({
        titulo: `${f.nomeUrna} (${f.partido}) · ${cargo}${f.uf === 'BR' ? '' : ` · ${onde}`} · Ficha do candidato · ${APP_NAME}`,
        descricao: `${cargo} · ${onde} · ${f.partido} ${f.numero}.${res} Dados públicos do TSE: ocupação, escolaridade e patrimônio declarado.`,
        imagem: `/api/og/candidato.png?sq=${f.sqcand}`,
        imagemAlt: `Ficha de ${f.nomeUrna} (${f.partido}), ${cargo}`,
        imagemVersao: fx?.lida?.versao,
        canonico: `/candidato/${f.sqcand}`,
      });
    }
    // sem índice de candidatos no servidor: cartão genérico (a SPA resolve)
    let nome: string | null = null;
    for (const r of ctx.races.values()) {
      const c = r.candidatos.find((x) => !x.agregado && x.sqcand === s1);
      if (c) {
        nome = `${c.nomeUrna} (${c.partido})`;
        break;
      }
    }
    return pagina({
      titulo: `${nome ? `${nome} · ` : ''}Ficha do candidato · ${APP_NAME}`,
      descricao: 'Dados públicos do TSE: cargo, partido, ocupação, escolaridade, patrimônio declarado e resultado em 2026.',
      imagem: ogApuracao(),
      imagemAlt: altPlacar(''),
    });
  }
  // ---- fase 3: curiosidades, cenários e widgets ---------------------------------------------------
  if (s0 === 'curiosidades' && seg.length === 1) {
    const lido = tentar(() => ctx.curiosidades?.() ?? null);
    const id = q.get('fato') ?? q.get('f');
    const fato = id && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? lido?.valor.fatos.find((x) => x.id === id) : undefined;
    if (fato) {
      return pagina({
        titulo: `${fato.titulo} · Curiosidades do 1º turno · ${APP_NAME}`,
        descricao: cortar(`${fato.texto} Fonte: TSE.`, 280),
        imagem: `/api/og/curiosidade.png?f=${fato.id}`,
        imagemAlt: `${fato.titulo} · curiosidade do 1º turno de 2026`,
        imagemVersao: lido?.versao,
        canonico: `/curiosidades?fato=${fato.id}`,
      });
    }
    const n = lido?.valor.fatos.length;
    return pagina({
      titulo: `Curiosidades do 1º turno de 2026 · ${APP_NAME}`,
      descricao: `${n ? `${fmtInt(n)} fatos` : 'Fatos'} do 1º turno calculados com os dados oficiais do TSE: empates voto a voto, recordes de comparecimento, as maiores seções e o voto no exterior.`,
      imagem: '/api/og/curiosidade.png',
      imagemAlt: 'Curiosidades do 1º turno de 2026',
      imagemVersao: lido?.versao,
      canonico: '/curiosidades',
    });
  }
  if (s0 === 'cenarios' && seg.length === 1) {
    const codigo = q.get('c');
    const cen = codigo ? tentar(() => ctx.cenario?.(codigo) ?? null) : null;
    if (cen) {
      return pagina({
        titulo: `Cenário hipotético do 2º turno · E se…? · ${APP_NAME}`,
        descricao: `Cenário hipotético montado a partir do resultado oficial do 1º turno · não é pesquisa nem previsão. Neste cenário: ${cen.placar}. Monte o seu.`,
        imagem: `/api/og/cenario.png?c=${cen.codigo}`,
        imagemAlt: `Cenário hipotético do 2º turno: ${cen.placar}`,
        imagemVersao: cen.versao,
        canonico: `/cenarios?c=${cen.codigo}`,
        // variações infinitas (cada link é uma hipótese de quem compartilhou): fora dos buscadores
        noindex: true,
      });
    }
    return pagina({
      titulo: `E se…? Monte seu cenário do 2º turno · ${APP_NAME}`,
      descricao: 'Decida para onde vão os eleitores de cada candidato do 1º turno e veja o 2º turno resultante, estado por estado. Não é pesquisa nem previsão: nada é coletado.',
      imagem: '/api/og/cenario.png',
      imagemAlt: 'Calculadora de cenários do 2º turno',
      imagemVersao: 'v1',
      canonico: '/cenarios',
    });
  }
  if (s0 === 'embed' && seg.length === 2 && /^[a-z0-9-]{1,32}$/.test(s1)) {
    // widgets (placar ?race=, mapa, uf ?uf=sp): fora dos buscadores; a imagem segue a corrida/UF do widget
    const ufE = ufDe(q.get('uf')) ?? undefined;
    return pagina({
      titulo: `Widget da apuração · ${APP_NAME}`,
      descricao: comPlacar('Placar da apuração do 2º turno para incorporar em sites e blogs.', ufE),
      imagem: ogApuracao(ufE),
      imagemAlt: altPlacar(ufE ? UF_NOMES[ufE] : 'Brasil'),
      noindex: true,
    });
  }

  const estaticas: Record<string, [string, string]> = {
    metodologia: ['Metodologia', 'Como calculamos e exibimos a apuração: fontes (TSE e IBGE), regras de percentuais e simulação.'],
    privacidade: ['Privacidade', 'O que coletamos (quase nada) e por que suas respostas do Teste Cego nunca saem do seu aparelho.'],
    sobre: ['Sobre', 'O Sintonia é um projeto apartidário de visualização da apuração e de comparação de propostas.'],
  };
  if (seg.length === 1 && estaticas[s0]) {
    return pagina({ titulo: `${estaticas[s0][0]} · ${APP_NAME}`, descricao: estaticas[s0][1], imagem: ogApuracao(), imagemAlt: altPlacar(''), canonico: path });
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

/** `@perfil` do X a partir de TWITTER_SITE ("sintonia", "@sintonia" ou a URL do perfil); inválido → null. */
export function normalizarTwitterSite(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '').replace(/^@/, '').replace(/\/$/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? `@${s}` : null;
}

export interface OpcoesMeta {
  /** `@perfil` do X (twitter:site). */
  twitterSite?: string | null;
}

/** Injeta as meta tags no HTML (troca `<title>`, a description e o marcador `<!--app-meta-->`). */
export function injetarMeta(html: string, m: MetaPagina, origem: string, urlPagina: string, versaoImagem: string, opts: OpcoesMeta = {}): string {
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
    img.startsWith('https://') ? `<meta property="og:image:secure_url" content="${escapeHtml(img)}" />` : '',
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(m.imagemAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    opts.twitterSite ? `<meta name="twitter:site" content="${escapeHtml(opts.twitterSite)}" />` : '',
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${escapeHtml(img)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(m.imagemAlt)}" />`,
    `<link rel="canonical" href="${escapeHtml(urlPagina)}" />`,
    m.noindex ? `<meta name="robots" content="noindex, nofollow" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`);
  return out.includes('<!--app-meta-->') ? out.replace('<!--app-meta-->', tags) : out.replace('</head>', `    ${tags}\n  </head>`);
}
