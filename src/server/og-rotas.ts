/**
 * Rotas das imagens de compartilhamento (OG, PNG 1200×630). Uma imagem específica por página:
 *
 *   /api/og/apuracao.png?race=&uf=          placar (Brasil ou UF) — og.ts
 *   /api/og/municipio.png?race=&uf=&cod=    placar do município (1º turno oficial quando a página mostra o 1º turno)
 *   /api/og/secao.png?race=&uf=&cod=&zona=&secao=   boletim de urna: 2º turno (se houver) + 1º turno oficial
 *   /api/og/candidato.png?sq=               ficha do candidato (foto oficial, dado real)
 *   /api/og/senado.png[?uf=]  /api/og/camara.png[?uf=]  /api/og/assembleia.png[?uf=]   hemiciclo/eleitos
 *   /api/og/governadores.png                as disputas de governador do 2º turno (UFS_GOV_2T)
 *   /api/og/curiosidade.png[?f=<id>]        fato do 1º turno (sem f: capa das curiosidades)
 *   /api/og/cenario.png[?c=<código>]        cenário hipotético (código inválido → cartão genérico da calculadora)
 *   /api/og/teste.png                       Teste Cego (genérico; o código de um Duelo NUNCA é lido — LGPD)
 *
 * Regras de cada imagem (ARCHITECTURE §1): número simulado → selo/faixa "SIMULAÇÃO · dados fictícios" e nunca foto
 * real; nomes ocultos na simulação (`status.anonimizado`) → as corridas da apuração (2º E 1º turno, como no app e no
 * /api/og/apuracao.png) saem como "Candidato A/B", sem foto. Ficha, cargos do 1º turno, curiosidades e cenários são
 * dado real (o cenário leva a marca d'água "CENÁRIO HIPOTÉTICO").
 *
 * Cache (ServicoOg): chave = rota normalizada; "versão|modo" = versão do admin + fonte/anonimização (ao vivo, 30 s
 * frescas — 120 s com o freio no modo leve — e até 90 s vencidas do mesmo modo) ou versão dos arquivos de dados
 * (estáticas: valem até o dado mudar). Na borda da Cloudflare: `Cloudflare-CDN-Cache-Control` (CC_OG_BORDA, I04).
 * Anúncio com o formato 'compartilhamento' no ar: faixa "Oferecimento: <marca>" no pé (og-oferecimento.ts) SÓ nos
 * cartões genéricos, sem candidato nem resultado (`CARTOES_COM_OFERECIMENTO`: Teste Cego, calculadora sem código e
 * capa das curiosidades); nesses, o conjunto de anunciantes entra no modo (`tagOferecimento`) e trocar o anunciante
 * espera a imagem nova. Placar, município, seção, ficha, eleitos, bancadas, governadores, fatos e cenários: nunca.
 * Parâmetros validados (zod); textos enormes nunca chegam ao decodificador.
 */
import type { Context, Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { z } from 'zod';
import type { LiveStatus, Race, SecaoResumo, UF } from '../shared/types';
import { UFS } from '../shared/types';
import { UF_NOMES, UFS_GOV_2T } from '../shared/constants';
import { anonimizarRace } from '../shared/anon';
import { MAX_CODIGO, calcularCenario, codificarCenario, decodificarCenario, premissasCenario } from '../shared/cenarios';
import { fmtInt } from '../shared/format';
import { pctValidos } from '../shared/calc';
import type { Controller } from '../engine/api';
import { NotFoundError } from '../engine/api';
import type { Dados } from './dados';
import { cargoExibicao, ehEleito, situacaoCurta, type DadosEstaticos } from './dados-estaticos';
import type { PacotesFotos } from './fotos';
import { cabecalhosCache, casaEtag, etagFraco, hashCurto } from './http-cache';
import type { Logger } from './log';
import { layoutTeste, renderPng, type No } from './og';
import { OFERECIMENTO_NO_PLACAR, comOferecimento, oferecimentoDe, tagOferecimento, type CartaoComOferecimento } from './og-oferecimento';
import { FORMATOS_OG, renderPlacarPng, type FormatoOg, type OgPlacarInput } from './og-placar';
import { registrarOgPalpite } from './og-palpite';
import { registrarOgDesafio } from './og-desafio';
import { registrarOgAnuncie } from './og-anuncie';
import {
  layoutCalculadora,
  layoutCandidato,
  layoutCenario,
  layoutComposicao,
  layoutCuriosidade,
  layoutCuriosidadesCapa,
  layoutEleitosUf,
  layoutGovernadores,
  layoutSecao,
  type DisputaGov,
  type OgEleitoInput,
} from './og-cartoes';
import type { Bancada } from './og-hemiciclo';
import { LimiteOgExcedido, type OgPronta, type OgServida, type PedidoOg, type ServicoOg } from './og-servico';
import { OG_COM_CANDIDATO, deUf, diaDeVotacao } from './meta-tags';
import { CC_OG_AUDIENCIA, CC_OG_AUDIENCIA_BORDA, pngConvite, type FormatoOgAudiencia } from './og-audiencia';
import { ErroValidacao, parseCodMunicipio, parseNumero, parseRace, parseUf } from './validation';

/** Cache-Control das imagens (o app reexporta em CC). */
export const CC_OG = {
  /** placar ao vivo */
  vivo: 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
  /** placar ao vivo com o freio no modo leve (I37): a imagem é refeita e buscada na origem 4× menos */
  vivoLeve: 'public, max-age=120, s-maxage=120, stale-while-revalidate=60',
  /** dado oficial/real: muda só com o dataset (a URL das meta tags leva a versão em `v`) */
  estatica: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  teste: 'public, max-age=86400, s-maxage=86400',
} as const;

/**
 * Cabeçalho da borda das imagens (I04, `Cloudflare-CDN-Cache-Control`; ver http-cache.ts › CABECALHO_BORDA): o mesmo
 * TTL da borda de `CC_OG`, mais `stale-if-error` (a imagem pronta continua saindo se a origem cair). `CDN_CC=0` tira.
 */
export const CC_OG_BORDA: Record<keyof typeof CC_OG, string> = {
  vivo: 'max-age=30, stale-while-revalidate=60, stale-if-error=600',
  vivoLeve: 'max-age=120, stale-while-revalidate=60, stale-if-error=600',
  estatica: 'max-age=86400, stale-while-revalidate=604800, stale-if-error=604800',
  teste: 'max-age=86400, stale-if-error=604800',
};

const OG_TTL_MS = 30_000;
/** Freio no modo leve (I37): a imagem ao vivo vale 120 s na memória (menos renderizações no pico). */
const OG_TTL_LEVE_MS = 120_000;
/**
 * Imagem vencida da mesma fonte ainda serve (enquanto a nova é gerada) por até 90 s. Na fonte TSE (e na simulação) a
 * versão do admin não muda com os números: quem pede uma imagem parada há mais tempo que isso espera a nova (~0,4 s).
 * Ensaio geral 12/10/2026: com 5 min, o robô do X (um pedido só por cartão) recebia o placar de "88% · AO VIVO"
 * minutos depois de a apuração ter terminado.
 */
const OG_STALE_MS = 90_000;
/** Grupo padrão do pacote de fotos oficiais (public/data/fotos/{grupo}.json) quando o candidato não diz. */
const GRUPO_FOTOS_PADRAO = 'segundo-turno';
/** Retratos de Presidente em resolução original do TSE (161×225, sem edição): os cartões do placar os mostram grandes. */
const GRUPO_FOTOS_HD = 'presidente-hd';

/** `?formato=` dos cartões do placar: og (1200×630, padrão), x (1200×675), feed (1080×1350), story (1080×1920). */
export function formatoOg(v: string | undefined): FormatoOg {
  if (v === undefined || v === '') return 'og';
  if ((FORMATOS_OG as readonly string[]).includes(v)) return v as FormatoOg;
  throw new ErroValidacao('Parâmetro formato: og, x, feed ou story.');
}
/** Sufixo da chave de cache por formato (o 1200×630 mantém a chave de sempre). */
const sufixoFormato = (f: FormatoOg) => (f === 'og' ? '' : `|${f}`);

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

export interface DepsOg {
  dados: Dados;
  controller: Controller;
  races: Map<string, Race>;
  fotos: PacotesFotos;
  estaticos: DadosEstaticos;
  nomeMunicipio: (uf: UF, cod: string) => string | undefined;
  log: Logger;
  now: () => number;
  /** Domínio público exibido no rodapé das imagens (ex.: "sintonia.app") ou null. */
  dominio: string | null;
  servico: ServicoOg;
  /** Versão do dataset carregado na subida (1º turno do motor). */
  versaoDataset: string;
  /**
   * Limite de renderizações por cliente (OG_LIMITE_MIN): chamado só quando a imagem PRECISA ser gerada para atender o
   * pedido; devolve 0 (pode) ou os segundos de espera (→ 429). Imagem já em memória nunca passa por aqui.
   */
  limitarRender?: (c: Ctx) => number;
  /** Cabeçalho da borda da Cloudflare (I04; `CDN_CC=0` → false). Ausente = ligado. */
  borda?: boolean;
  /** Freio no modo leve (I37, "Chaves da noite"): imagens ao vivo com TTL de 120 s. Ausente = nunca. */
  leve?: () => boolean;
}

/**
 * `race` com o `primeiroTurno` de cada finalista trocado pelo resultado LOCAL do 1º turno (`resumoT1`, na ordem de
 * `raceT1.candidatos`). Sem dado local, sem número (nunca o nacional num cartão de UF). Puro: testado em og-rotas.test.
 */
export function comPrimeiroTurnoLocal(race: Race, raceT1: Race | undefined, resumoT1: { votos: number[] } | null): Race {
  return {
    ...race,
    candidatos: race.candidatos.map((c) => {
      const i = raceT1 && resumoT1 ? raceT1.candidatos.findIndex((x) => !x.agregado && x.numero === c.numero) : -1;
      return { ...c, primeiroTurno: i >= 0 && resumoT1 ? { votos: resumoT1.votos[i] ?? 0, pct: pctValidos(resumoT1, i) } : undefined };
    }),
  };
}

/** "fonte[-anon]": troca de modo sempre espera a imagem nova. */
export const modoOg = (st: Pick<LiveStatus, 'fonte' | 'anonimizado'>) => `${st.fonte}${st.anonimizado ? '-anon' : ''}`;

const perf = () => performance.now();
const u8 = (b: Buffer) => new Uint8Array(b.buffer as ArrayBuffer, b.byteOffset, b.byteLength);

/** Resposta com corpo binário opcional (HEAD/304 → sem corpo). */
function responder(c: Ctx, body: Buffer | null, headers: Record<string, string>): Response {
  return body === null ? c.body(null, 200, headers) : c.body(u8(body), 200, headers);
}

// ---- validação dos parâmetros (zod) -------------------------------------------------------------
const reUf = /^[A-Za-z]{2}$/;
const qMunicipio = z.object({ race: z.string().max(24).optional(), uf: z.string().regex(reUf), cod: z.string().regex(/^\d{1,5}$/) });
const qSecao = qMunicipio.extend({ zona: z.string().regex(/^\d{1,4}$/), secao: z.string().regex(/^\d{1,4}$/) });
const qCandidato = z.object({ sq: z.string().regex(/^\d{6,15}$/) });
const qUfOpcional = z.object({ uf: z.string().regex(reUf).optional() });
const qCuriosidade = z.object({ f: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional() });

function validar<T>(schema: z.ZodType<T>, v: unknown, msg: string): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new ErroValidacao(msg);
  return r.data;
}

const ufBr = (u: string | undefined): UF | undefined => {
  if (!u) return undefined;
  const U = parseUf(u);
  if (U === 'ZZ' || !(UFS as readonly string[]).includes(U)) throw new ErroValidacao(`UF inválida para este cargo: "${u.slice(0, 4)}".`);
  return U;
};

export function registrarOg(app: App, d: DepsOg): void {
  const { dados, races, fotos, estaticos, log, servico } = d;
  // Palpite (/api/og/palpite.png): genérico, nunca lê palpite algum (o palpite vai depois do "#" do link)
  registrarOgPalpite(app, { status: () => dados.status(), log });
  registrarOgDesafio(app, { log }); // desafio do palpite: genérico, nunca lê apelido nem palpite (vão depois do "#")
  // /anuncie: prévia genérica, sem candidato nem anunciante (a página de vendas circula no WhatsApp)
  registrarOgAnuncie(app);
  const dominio = d.dominio ?? undefined;

  /** Conjunto de anunciantes das imagens ('' = nenhum; '|of…' entra no modo do cache). */
  const tagOf = (st: Pick<LiveStatus, 'anuncios'> = dados.status()) => {
    const t = tagOferecimento(st.anuncios);
    return t ? `|${t}` : '';
  };
  /** "versão|modo" das imagens ao vivo (placares: nunca levam anúncio, então o anunciante não entra no modo). */
  const subVivo = (st: LiveStatus) => `${st.versao}|${modoOg(st)}`;
  /**
   * Cartão GENÉRICO com a faixa "Oferecimento: <marca>" quando há anúncio de compartilhamento no ar. O tipo só aceita
   * as chaves de `CARTOES_COM_OFERECIMENTO`: um cartão com candidato ou resultado não tem como pedir a faixa.
   */
  const comOf = (no: No, chave: CartaoComOferecimento): No => {
    const of = oferecimentoDe(dados.status().anuncios, chave);
    return of ? comOferecimento(no, of.marca, of.logo) : no;
  };

  const borda = d.borda !== false;
  /** Cache-Control (+ cabeçalho da borda) de um tipo de imagem. */
  const cacheOg = (tipo: keyof typeof CC_OG) => cabecalhosCache(CC_OG[tipo], CC_OG_BORDA[tipo], borda);

  /** PNG com ETag (rota + versão|modo + instante da geração), 304 e CORS (robôs de outras origens). */
  const enviarPng = (c: Ctx, chave: string, s: OgServida, tipo: keyof typeof CC_OG) => {
    const etag = etagFraco('og', hashCurto(chave), hashCurto(s.sub), s.em.toString(36));
    const headers: Record<string, string> = {
      'content-type': 'image/png',
      ...cacheOg(tipo),
      etag,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      ...s.headers,
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return responder(c, c.req.method === 'HEAD' ? null : s.png, headers);
  };

  /**
   * Gera o PNG do cartão `chave` (rótulo do log: a chave, salvo quando ela traz dado do visitante). Sem anúncio, salvo
   * nos cartões genéricos que pedem (`oferecimento`).
   */
  const gerar = async (
    chave: string,
    no: () => Promise<No> | No,
    sub: string,
    headers?: Record<string, string>,
    rotulo = chave,
    oferecimento: CartaoComOferecimento | null = null,
  ): Promise<OgPronta> => {
    const t0 = perf();
    const base = await no();
    const png = await renderPng(oferecimento ? comOf(base, oferecimento) : base);
    log.info(`OG ${rotulo} gerada em ${Math.round(perf() - t0)} ms (${Math.round(png.length / 1024)} KB)`);
    return { png, sub, headers };
  };

  /** Pedido que vai gerar imagem nova para este cliente → conta no limite por cliente (429 se passou). */
  const obterLimitado = (c: Ctx, pd: PedidoOg) => {
    if (d.limitarRender && !servico.servivel(pd)) {
      const espera = d.limitarRender(c);
      if (espera > 0) throw new LimiteOgExcedido(espera);
    }
    return servico.obter(pd);
  };

  /**
   * "versão|modo" dos cartões do placar: com a faixa de oferecimento ligada (`OFERECIMENTO_NO_PLACAR`), o conjunto de
   * anunciantes entra no modo — trocar/tirar o anunciante espera a imagem nova.
   */
  const subPlacar = (st: LiveStatus) => `${subVivo(st)}${OFERECIMENTO_NO_PLACAR ? tagOf(st) : ''}`;

  /** Imagem ao vivo (depende do estado da apuração). `placar`: o modo leva o anunciante (ver `subPlacar`). */
  const vivo = async (c: Ctx, chave: string, montar: (st: LiveStatus) => Promise<OgPronta>, placar = false) => {
    const st = dados.status();
    const leve = d.leve?.() === true;
    const s = await obterLimitado(c, {
      chave,
      sub: placar ? subPlacar(st) : subVivo(st),
      ttlMs: leve ? OG_TTL_LEVE_MS : OG_TTL_MS,
      staleMs: OG_STALE_MS,
      montar: () => montar(dados.status()),
      modoAtual: () => {
        const agora = dados.status();
        return `${modoOg(agora)}${placar && OFERECIMENTO_NO_PLACAR ? tagOf(agora) : ''}`;
      },
    });
    return enviarPng(c, chave, s, leve ? 'vivoLeve' : 'vivo');
  };

  /**
   * Imagem estática (dado oficial): vale enquanto a versão dos dados (e o modo, se houver) não mudar. `comAnuncio`: o
   * cartão genérico pode levar a faixa de oferecimento, então o conjunto de anunciantes entra no modo.
   */
  const estatica = async (
    c: Ctx,
    chave: string,
    versao: string,
    modo: string,
    montar: (sub: string) => Promise<OgPronta>,
    modoAtual?: () => string,
    comAnuncio = false,
  ) => {
    const tag = () => (comAnuncio ? tagOf() : '');
    const sub = `${versao}|${modo}${tag()}`;
    const s = await obterLimitado(c, {
      chave,
      sub,
      ttlMs: Infinity,
      staleMs: Infinity,
      montar: () => montar(sub),
      modoAtual: () => `${modoAtual ? modoAtual() : modo}${tag()}`,
    });
    return enviarPng(c, chave, s, 'estatica');
  };

  /**
   * Fotos oficiais para o placar: nunca com nomes ocultos; só quando há foto de TODOS os finalistas (do MESMO pacote:
   * tratamento igual). Presidente: os originais do TSE (`presidente-hd`); sem eles, o pacote da corrida. Quem chama
   * também nunca pede foto para números simulados.
   */
  const fotosOg = (race: Race, anonimizado: boolean): string[] | undefined => {
    if (anonimizado) return undefined;
    const fin = race.candidatos.map((cd, i) => (cd.agregado ? -1 : i)).filter((i) => i >= 0);
    const doPacote = (grupo?: string) => {
      const lista = race.candidatos.map((cd) => (cd.agregado || !cd.sqcand ? null : fotos.fotoOg(grupo ?? (cd.fotoGrupo || GRUPO_FOTOS_PADRAO), cd.sqcand)));
      return fin.length >= 2 && fin.every((i) => lista[i]) ? lista.map((f) => f ?? '') : undefined;
    };
    return (race.cargo === 'Presidente' ? doPacote(GRUPO_FOTOS_HD) : undefined) ?? doPacote();
  };

  /** Anunciante da faixa "Oferecimento" do cartão do placar `base` (mesmo anunciante nos quatro formatos). */
  const oferecimentoPlacar = (st: Pick<LiveStatus, 'anuncios'>, base: string): string | null =>
    OFERECIMENTO_NO_PLACAR ? (oferecimentoDe(st.anuncios, base)?.marca ?? null) : null;

  /** PNG do placar no formato pedido, com o registro de tempo e tamanho. */
  const gerarPlacar = async (rotulo: string, inp: OgPlacarInput): Promise<Buffer> => {
    const t0 = perf();
    const png = await renderPlacarPng(inp);
    log.info(
      `OG ${rotulo}${inp.formato && inp.formato !== 'og' ? ` [${inp.formato}]` : ''} gerada em ${Math.round(perf() - t0)} ms ` +
        `(${Math.round(png.length / 1024)} KB${inp.fotos ? ', com fotos oficiais' : ''}${inp.oferecimento ? ', com oferecimento' : ''})`,
    );
    return png;
  };

  const exibir = (r: Race, anon: boolean) => (anon ? anonimizarRace(r) : r);
  const t1De = (r: Race): Race | undefined => (r.turno === 1 ? r : races.get(`${r.id}-t1`));
  const t2De = (r: Race): Race | undefined => (r.turno === 2 ? r : races.get(r.id.replace(/-t1$/, '')));
  const onde = (nome: string, uf: UF) => `${nome} (${uf === 'ZZ' ? 'Exterior' : uf})`;

  /** Corrida com `primeiroTurno` de cada finalista NA UF (corrida -t1 da mesma disputa). */
  const comPrimeiroTurnoDaUf = async (race: Race, uf: UF): Promise<Race> => {
    const r1 = races.get(`${race.id}-t1`);
    const s1 = r1 ? await dados.uf(r1.id, uf).catch(() => null) : null;
    return comPrimeiroTurnoLocal(race, r1, s1?.resumo ?? null);
  };

  // ---- dia da votação (0h–19h de 25/10, Brasília: até o fim da votação, FIM_VOTACAO) ---------------
  // As imagens que mostram candidato (OG_COM_CANDIDATO: placar, município, seção, governadores, ficha, curiosidades,
  // cenários) respondem o convite GENÉRICO (o de /api/og/audiencia.png?m=0: sem foto, nome, número nem percentual), com
  // cache curto (60 s): as meta tags já apontam para o convite, mas um cartão guardado antes pelo X ou pelo WhatsApp com a
  // URL antiga busca a imagem de novo — e não pode receber candidato. No fim da votação (19h; a votação foi prorrogada
  // até as 19h) volta sozinho (no máximo ~2 min de borda).
  const dominioConvite = d.dominio || 'sintonia2026.com.br';
  for (const rota of OG_COM_CANDIDATO) {
    app.use(rota, async (c, next) => {
      if (!diaDeVotacao(d.now())) return next();
      const f = c.req.query('formato');
      const formato: FormatoOgAudiencia = f === 'x' || f === 'story' ? f : 'og';
      const png = await pngConvite(formato, dominioConvite, log);
      return responder(c, c.req.method === 'HEAD' ? null : png, {
        'content-type': 'image/png',
        ...cabecalhosCache(CC_OG_AUDIENCIA, CC_OG_AUDIENCIA_BORDA, borda),
        'access-control-allow-origin': '*',
        'cross-origin-resource-policy': 'cross-origin',
        'x-og-generica': 'dia-da-votacao',
        'x-og-fotos': '0',
      });
    });
  }

  // ---- placar (Brasil/UF) -------------------------------------------------------------------------
  app.get('/api/og/apuracao.png', async (c) => {
    const race = parseRace(c.req.query('race') || 'pres');
    const r = dados.race(race);
    const ufQ = c.req.query('uf');
    const uf = ufQ ? parseUf(ufQ) : undefined;
    if (uf && !r.ufs.includes(uf)) throw new NotFoundError(`A UF ${uf} não participa da corrida ${r.id}.`);
    const formato = formatoOg(c.req.query('formato'));
    const base = `${r.id}|${uf ?? 'br'}`;
    const chave = `${base}${sufixoFormato(formato)}`;
    return vivo(
      c,
      chave,
      async (st) => {
      const snap = uf ? await dados.uf(r.id, uf) : await dados.nacional(r.id);
      const resumo = snap.resumo;
      const simulacao = st.simulacao && r.turno === 2;
      const anon = !!st.anonimizado;
      const fonteTse = dados.fonteDe(r.id) === 'tse';
      const pre = r.turno === 2 && resumo.secoesTotalizadas === 0;
      // Antes da apuração o cartão mostra "NO 1º TURNO" com `candidato.primeiroTurno`, que é o resultado NACIONAL:
      // no recorte de uma UF troca pelo 1º turno daquela UF (senão o cartão "Presidente · São Paulo" saía com 45,16%).
      const raceOg = pre && uf ? await comPrimeiroTurnoDaUf(races.get(snap.race) ?? r, uf) : (races.get(snap.race) ?? r);
      // foto oficial só com número real: nunca na simulação (nem com os nomes reais ligados no admin)
      const fotosPlacar = simulacao ? undefined : fotosOg(raceOg, anon);
      const png = await gerarPlacar(`${r.id}${uf ? `/${uf}` : ''}`, {
        // simulação anônima: nada de nome nem foto real em imagem com números fictícios
        race: exibir(raceOg, anon),
        uf,
        resumo,
        simulacao,
        horario: simulacao ? snap.simNow : fonteTse ? (resumo.ultimaAtualizacao ?? snap.geradoEm) : snap.geradoEm,
        pre,
        fotos: fotosPlacar,
        formato,
        dominio: d.dominio,
        // faixa própria no pé, abaixo da marca do Sintonia (og-oferecimento.ts › OFERECIMENTO_NO_PLACAR)
        oferecimento: oferecimentoPlacar(st, base),
      });
      return { png, sub: subPlacar(st), headers: { 'x-og-fotos': fotosPlacar ? '1' : '0' } };
      },
      true,
    );
  });

  // ---- município ------------------------------------------------------------------------------------
  app.get('/api/og/municipio.png', async (c) => {
    const q = validar(qMunicipio, c.req.query(), 'Parâmetros: ?race=&uf=&cod= (UF com 2 letras, código TSE com até 5 dígitos).');
    const r = dados.race(parseRace(q.race || 'pres'));
    const uf = parseUf(q.uf);
    const cod = parseCodMunicipio(q.cod);
    if (!r.ufs.includes(uf)) throw new NotFoundError(`A UF ${uf} não participa da corrida ${r.id}.`);
    const nome = d.nomeMunicipio(uf, cod);
    if (!nome) throw new NotFoundError(`Município ${cod} inexistente em ${uf}.`);
    const st = dados.status();
    // a mesma corrida que a página mostra: o 1º turno quando pedido (-t1) ou antes da apuração (fase 'pre')
    const exib = r.turno === 1 || st.fase !== 'pre' ? r : (t1De(r) ?? r);
    const formato = formatoOg(c.req.query('formato'));
    const base = `mun|${exib.id}|${uf}|${cod}`;
    const chave = `${base}${sufixoFormato(formato)}`;
    const titulo = onde(nome, uf);
    const cargo = exib.cargo === 'Presidente' ? 'PRESIDENTE' : 'GOVERNADOR';
    const montar = async (stM: LiveStatus, sub: string): Promise<OgPronta> => {
      const snap = await dados.municipio(exib.id, uf, cod);
      const anon = !!stM.anonimizado;
      const simulacao = stM.simulacao && exib.turno === 2;
      const raceOg = races.get(snap.race) ?? exib;
      const fotosPlacar = simulacao ? undefined : fotosOg(raceOg, anon);
      const png = await gerarPlacar(chave, {
        race: exibir(raceOg, anon),
        uf,
        resumo: snap.resumo,
        simulacao,
        horario: simulacao ? snap.simNow : (snap.resumo.ultimaAtualizacao ?? snap.geradoEm),
        pre: false,
        fotos: fotosPlacar,
        titulo,
        kicker: exib.turno === 1 ? `1º TURNO 2026 · ${cargo} · NO MUNICÍPIO` : `APURAÇÃO · 2º TURNO 2026 · ${cargo}`,
        local: true,
        formato,
        dominio: d.dominio,
        oferecimento: oferecimentoPlacar(stM, base),
      });
      return { png, sub, headers: { 'x-og-fotos': fotosPlacar ? '1' : '0' } };
    };
    if (exib.turno === 1) {
      const modo = `t1${st.anonimizado ? '-anon' : ''}`;
      return estatica(
        c,
        chave,
        d.versaoDataset,
        modo,
        (sub) => montar(dados.status(), sub),
        () => `t1${dados.status().anonimizado ? '-anon' : ''}`,
        OFERECIMENTO_NO_PLACAR,
      );
    }
    return vivo(c, chave, (stM) => montar(stM, subPlacar(stM)), true);
  });

  // ---- seção (boletim de urna) ----------------------------------------------------------------------
  app.get('/api/og/secao.png', async (c) => {
    const q = validar(qSecao, c.req.query(), 'Parâmetros: ?race=&uf=&cod=&zona=&secao=.');
    const r = dados.race(parseRace(q.race || 'pres'));
    const uf = parseUf(q.uf);
    const cod = parseCodMunicipio(q.cod);
    const zona = parseNumero(q.zona, 'zona');
    const secao = parseNumero(q.secao, 'secao');
    if (!r.ufs.includes(uf)) throw new NotFoundError(`A UF ${uf} não participa da corrida ${r.id}.`);
    const nome = d.nomeMunicipio(uf, cod);
    if (!nome) throw new NotFoundError(`Município ${cod} inexistente em ${uf}.`);
    const st = dados.status();
    const r1 = t1De(r);
    const r2 = t2De(r);
    // link explícito para o 1º turno → só o 1º turno; antes da apuração também (como a página)
    const com2 = r.turno === 2 && st.fase !== 'pre' && !!r2;
    const chave = `secao|${com2 ? 't2' : 't1'}|${r2?.id ?? r.id}|${uf}|${cod}|${zona}|${secao}`;
    const buscar = async (race: Race | undefined): Promise<SecaoResumo | null> => {
      if (!race) return null;
      try {
        return await dados.secao(race.id, uf, cod, zona, secao);
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    };
    const montar = async (stM: LiveStatus, sub: string): Promise<OgPronta> => {
      const anon = !!stM.anonimizado;
      const [d2, d1] = await Promise.all([com2 ? buscar(r2) : Promise.resolve(null), buscar(r1)]);
      if (!d1 && !d2) throw new NotFoundError(`Seção ${secao} (zona ${zona}) inexistente ou sem boletim.`);
      const local = (d1 as { local?: SecaoResumo['local'] } | null)?.local ?? d2?.local ?? null;
      return gerar(
        chave,
        () =>
          layoutSecao({
            uf,
            nomeMunicipio: nome,
            zona,
            secao,
            local,
            t2: com2 && r2 ? { race: exibir(r2, anon), detalhe: d2 } : null,
            t1: r1 ? { race: exibir(r1, anon), detalhe: d1 } : null,
            simulacao: com2 && stM.simulacao,
            dominio,
          }),
        sub,
      );
    };
    if (!com2) {
      const modo = `t1${st.anonimizado ? '-anon' : ''}`;
      return estatica(c, chave, d.versaoDataset, modo, (sub) => montar(dados.status(), sub), () => `t1${dados.status().anonimizado ? '-anon' : ''}`);
    }
    return vivo(c, chave, (stM) => montar(stM, subVivo(stM)));
  });

  // ---- ficha do candidato (dado real) ---------------------------------------------------------------
  app.get('/api/og/candidato.png', async (c) => {
    const { sq } = validar(qCandidato, c.req.query(), 'Parâmetro: ?sq=<sequencial do candidato no TSE> (6 a 15 dígitos).');
    const lida = estaticos.ficha(sq);
    if (!lida) throw new NotFoundError(`Candidato ${sq} não encontrado.`);
    const f = lida.valor;
    const chave = `cand|${sq}`;
    return estatica(c, chave, lida.versao, 'estatico', (sub) => {
      const foto = fotos.fotoOg(f.fotoGrupo || GRUPO_FOTOS_PADRAO, f.sqcand);
      return gerar(
        chave,
        () => layoutCandidato({ ficha: f, cargo: cargoExibicao(f.cargo, f.genero), situacao: situacaoCurta(f.resultado?.situacao, f.genero), foto, dominio }),
        sub,
        { 'x-og-fotos': foto ? '1' : '0' },
      );
    });
  });

  // ---- cargos do 1º turno -------------------------------------------------------------------------
  const bancadasUf = (partidos: { sigla: string; eleitos: number }[] | undefined): Bancada[] =>
    (partidos ?? []).map((p) => ({ sigla: p.sigla, eleitos: p.eleitos }));
  const somaEleitos = (b: Bancada[]) => b.reduce((s, x) => s + x.eleitos, 0);

  app.get('/api/og/senado.png', async (c) => {
    const uf = ufBr(validar(qUfOpcional, c.req.query(), 'Parâmetro: ?uf=<sigla>.').uf);
    const lido = estaticos.cargo('senado');
    if (!lido) throw new NotFoundError('Resultado do Senado indisponível.');
    const ds = lido.valor;
    const chave = `senado|${uf ?? 'br'}`;
    if (uf) {
      const u = ds.ufs.find((x) => x.uf === uf);
      if (!u) throw new NotFoundError(`Sem resultado do Senado em ${uf}.`);
      return estatica(c, chave, lido.versao, 'estatico', (sub) => {
        const eleitos = u.candidatos.filter((x) => ehEleito(x.situacao)).slice(0, Math.max(1, u.vagas));
        const lista: OgEleitoInput[] = eleitos.map((x, i) => ({ nomeUrna: x.nomeUrna, partido: x.partido, numero: x.numero, votos: x.votos, pct: x.pct, rotulo: `${i + 1}º MAIS VOTADO · ELEITO` }));
        const fs = eleitos.map((x) => fotos.fotoOg(estaticos.ficha(x.sqcand)?.valor.fotoGrupo || 'senado', x.sqcand));
        const todas = fs.length > 0 && fs.every(Boolean) ? (fs as string[]) : null; // tratamento igual: todos ou nenhum
        const titulo = eleitos.length ? `${UF_NOMES[uf]}: ${eleitos.length === 1 ? 'senador eleito' : 'os senadores eleitos'}` : `Senado · ${UF_NOMES[uf]}`;
        return gerar(chave, () => layoutEleitosUf({ uf, titulo, kicker: `SENADO · ${uf} · ELEITOS EM 2026`, eleitos: lista, fotos: todas, dominio }), sub, { 'x-og-fotos': todas ? '1' : '0' });
      });
    }
    return estatica(c, chave, lido.versao, 'estatico', (sub) => {
      const bancadas = (ds.composicao ?? []).map((b) => ({ sigla: b.sigla, eleitos: b.eleitos }));
      const vagas = ds.ufs.reduce((s, u) => s + (u.vagas || 0), 0);
      const pend = Math.max(0, vagas - somaEleitos(bancadas));
      return gerar(
        chave,
        () =>
          layoutComposicao({
            kicker: 'SENADO FEDERAL · ELEITOS EM 2026',
            titulo: `${fmtInt(vagas)} vagas em disputa: os eleitos por partido`,
            bancadas,
            pendentes: pend,
            rotuloTotal: 'vagas em 2026',
            nota: pend ? `${fmtInt(pend)} ${pend === 1 ? 'vaga aguarda' : 'vagas aguardam'} o TSE` : null,
            dominio,
          }),
        sub,
      );
    });
  });

  const composicaoProporcional = (arquivo: 'camara' | 'assembleia', c: Ctx, uf: UF | undefined) => {
    const lido = estaticos.cargo(arquivo);
    if (!lido) throw new NotFoundError('Resultado indisponível.');
    const ds = lido.valor;
    const chave = `${arquivo}|${uf ?? 'br'}`;
    let bancadas: Bancada[];
    let vagas: number;
    let kicker: string;
    let titulo: string;
    let ufsPendentes: string[] = [];
    if (uf) {
      const u = ds.ufs.find((x) => x.uf === uf);
      if (!u) throw new NotFoundError(`Sem resultado em ${uf}.`);
      bancadas = bancadasUf(u.partidos);
      vagas = u.vagas;
      if (arquivo === 'camara') {
        kicker = `CÂMARA DOS DEPUTADOS · ${uf} · ELEITOS EM 2026`;
        titulo = `A bancada ${deUf(uf)} na Câmara`;
      } else {
        kicker = `${uf === 'DF' ? 'CÂMARA LEGISLATIVA' : 'ASSEMBLEIA LEGISLATIVA'} · ${uf} · ELEITOS EM 2026`;
        titulo = uf === 'DF' ? 'Câmara Legislativa do Distrito Federal' : `Assembleia Legislativa · ${UF_NOMES[uf]}`;
      }
      if (somaEleitos(bancadas) < vagas) ufsPendentes = [uf];
    } else {
      bancadas = (ds.composicao ?? []).map((b) => ({ sigla: b.sigla, eleitos: b.eleitos }));
      vagas = ds.ufs.reduce((s, u) => s + (u.vagas || 0), 0);
      ufsPendentes = ds.ufs.filter((u) => (u.partidos ?? []).reduce((s, p) => s + p.eleitos, 0) < u.vagas).map((u) => u.uf);
      kicker = arquivo === 'camara' ? 'CÂMARA DOS DEPUTADOS · ELEITOS EM 2026' : 'ASSEMBLEIAS LEGISLATIVAS · ELEITOS EM 2026';
      titulo = arquivo === 'camara' ? 'A nova Câmara por partido' : `${fmtInt(vagas)} deputados estaduais por partido`;
    }
    const pend = Math.max(0, vagas - somaEleitos(bancadas));
    const nota = pend
      ? `${fmtInt(pend)} ${pend === 1 ? 'cadeira' : 'cadeiras'}${ufsPendentes.length && ufsPendentes.length <= 3 && !uf ? ` (${ufsPendentes.join(', ')})` : ''} ${pend === 1 ? 'aguarda' : 'aguardam'} o TSE`
      : null;
    return estatica(c, chave, lido.versao, 'estatico', (sub) =>
      gerar(chave, () => layoutComposicao({ kicker, titulo, bancadas, pendentes: pend, rotuloTotal: 'cadeiras', nota, dominio }), sub),
    );
  };

  app.get('/api/og/camara.png', (c) => composicaoProporcional('camara', c, ufBr(validar(qUfOpcional, c.req.query(), 'Parâmetro: ?uf=<sigla>.').uf)));
  app.get('/api/og/assembleia.png', (c) => composicaoProporcional('assembleia', c, ufBr(validar(qUfOpcional, c.req.query(), 'Parâmetro: ?uf=<sigla>.').uf)));

  // ---- governadores (as disputas do 2º turno, UFS_GOV_2T) --------------------------------------------
  app.get('/api/og/governadores.png', async (c) => {
    const st = dados.status();
    const pre = st.fase === 'pre';
    const ids = UFS_GOV_2T.map((uf) => [uf, races.get(`gov-${uf.toLowerCase()}${pre ? '-t1' : ''}`)] as const).filter(
      (x): x is readonly [UF, Race] => !!x[1],
    );
    if (!ids.length) throw new NotFoundError('Sem disputas de governador no 2º turno.');
    const chave = `gov|${pre ? 't1' : 't2'}`;
    const montar = async (stM: LiveStatus, sub: string): Promise<OgPronta> => {
      const anon = !!stM.anonimizado;
      const disputas: DisputaGov[] = await Promise.all(
        ids.map(async ([uf, r]) => {
          const snap = await dados.nacional(r.id);
          return { uf, race: exibir(races.get(snap.race) ?? r, anon), resumo: snap.resumo };
        }),
      );
      return gerar(
        chave,
        () => layoutGovernadores({ disputas, primeiroTurno: pre, simulacao: !pre && stM.simulacao, aoVivo: stM.fase !== 'encerrada', anonimizado: anon, dominio }),
        sub,
      );
    };
    if (pre) {
      const modo = `t1${st.anonimizado ? '-anon' : ''}`;
      return estatica(c, chave, d.versaoDataset, modo, (sub) => montar(dados.status(), sub), () => `t1${dados.status().anonimizado ? '-anon' : ''}`);
    }
    return vivo(c, chave, (stM) => montar(stM, subVivo(stM)));
  });

  // ---- curiosidades (dado real) ---------------------------------------------------------------------
  app.get('/api/og/curiosidade.png', async (c) => {
    const q = c.req.query();
    const { f } = validar(qCuriosidade, { f: q.f ?? q.fato }, 'Parâmetro: ?f=<id do fato>.');
    const lido = estaticos.curiosidades();
    if (!lido) throw new NotFoundError('Curiosidades indisponíveis.');
    const fato = f ? lido.valor.fatos.find((x) => x.id === f) : undefined;
    const chave = `cur|${fato?.id ?? 'capa'}`;
    if (fato) {
      // fato isolado: muitos citam candidato, partido ou percentual de candidato → nunca leva anúncio
      return estatica(c, chave, lido.versao, 'estatico', (sub) => gerar(chave, () => layoutCuriosidade({ fato, finalistas: lido.valor.finalistas, dominio }), sub));
    }
    // capa: os mesmos três destaques da home (DESTAQUES_PADRAO do app), completados com outros fatos com número
    const comNumero = lido.valor.fatos.filter((x) => x.destaque);
    const preferidos = ['finalistas-empate-municipio', 'finalistas-menor-diferenca', 'brasil-cidade-maior-que-estados'];
    const ordem = [...comNumero].sort((x, y) => {
      const px = preferidos.indexOf(x.id);
      const py = preferidos.indexOf(y.id);
      return (px < 0 ? 99 : px) - (py < 0 ? 99 : py);
    });
    const destaques = ordem.slice(0, 3);
    // a capa só leva a faixa quando nenhum destaque é de cargo (percentual de um candidato)
    const generica = destaques.every((x) => !x.id.startsWith('cargos-'));
    return estatica(
      c,
      chave,
      lido.versao,
      'estatico',
      (sub) =>
        gerar(chave, () => layoutCuriosidadesCapa({ fatos: destaques, total: lido.valor.fatos.length, dominio }), sub, undefined, chave, generica ? 'cur|capa' : null),
      undefined,
      generica,
    );
  });

  // ---- cenários (hipotético) ------------------------------------------------------------------------
  app.get('/api/og/cenario.png', async (c) => {
    const bruto = c.req.query('c') ?? '';
    const lido = estaticos.presidenteT1();
    // código validado ANTES de decodificar: tamanho e alfabeto (base64url); inválido → cartão genérico
    const ok = bruto.length > 0 && bruto.length <= MAX_CODIGO && /^[A-Za-z0-9_-]+={0,2}$/.test(bruto);
    const cenario = ok && lido ? decodificarCenario(bruto, lido.valor) : null;
    if (!cenario || !lido) {
      const chave = 'cen|generico';
      // calculadora sem código: cartão genérico, sem nome nem número de candidato → pode levar a faixa
      return estatica(c, chave, 'v1', 'estatico', (sub) => gerar(chave, () => layoutCalculadora({ dominio }), sub, undefined, chave, 'cen|generico'), undefined, true);
    }
    // forma canônica: códigos equivalentes compartilham a mesma imagem
    const chave = `cen|${codificarCenario(cenario)}`;
    return estatica(c, chave, lido.versao, 'estatico', (sub) =>
      gerar(
        chave,
        () => {
          const resultado = calcularCenario(lido.valor, cenario);
          const premissas = premissasCenario(lido.valor, cenario, resultado, { nomesCurtos: true });
          return layoutCenario({ ds: lido.valor, cenario, resultado, premissas, dominio });
        },
        sub,
        undefined,
        'cenário',
      ),
    );
  });

  // ---- Teste Cego (genérico) ------------------------------------------------------------------------
  /** Uma imagem por conjunto de anunciantes (sem nenhum: a de sempre). */
  let ogTeste: { tag: string; png: Promise<Buffer> } | null = null;
  app.get('/api/og/teste.png', async (c) => {
    const tag = tagOf();
    if (ogTeste?.tag !== tag) {
      const pr = renderPng(comOf(layoutTeste(), 'teste'));
      const atual = { tag, png: pr };
      ogTeste = atual;
      pr.catch(() => {
        if (ogTeste === atual) ogTeste = null;
      });
    }
    const png = await ogTeste.png;
    return responder(c, c.req.method === 'HEAD' ? null : png, {
      'content-type': 'image/png',
      ...cacheOg('teste'),
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    });
  });
}

