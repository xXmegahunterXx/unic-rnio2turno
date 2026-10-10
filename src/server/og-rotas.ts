/**
 * Rotas das imagens de compartilhamento (OG, PNG 1200×630). Uma imagem específica por página:
 *
 *   /api/og/apuracao.png?race=&uf=          placar (Brasil ou UF) — og.ts
 *   /api/og/municipio.png?race=&uf=&cod=    placar do município (1º turno oficial quando a página mostra o 1º turno)
 *   /api/og/secao.png?race=&uf=&cod=&zona=&secao=   boletim de urna: 2º turno (se houver) + 1º turno oficial
 *   /api/og/candidato.png?sq=               ficha do candidato (foto oficial, dado real)
 *   /api/og/senado.png[?uf=]  /api/og/camara.png[?uf=]  /api/og/assembleia.png[?uf=]   hemiciclo/eleitos
 *   /api/og/governadores.png                as 7 disputas de governador
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
 * frescas e até 5 min vencidas do mesmo modo) ou versão dos arquivos de dados (estáticas: valem até o dado mudar).
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
import type { Controller } from '../engine/api';
import { NotFoundError } from '../engine/api';
import type { Dados } from './dados';
import { cargoExibicao, ehEleito, situacaoCurta, type DadosEstaticos } from './dados-estaticos';
import type { PacotesFotos } from './fotos';
import { casaEtag, etagFraco, hashCurto } from './http-cache';
import type { Logger } from './log';
import { layoutPlacar, layoutTeste, renderPng, type No } from './og';
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
import type { OgPronta, OgServida, ServicoOg } from './og-servico';
import { deUf } from './meta-tags';
import { ErroValidacao, parseCodMunicipio, parseNumero, parseRace, parseUf } from './validation';

/** Cache-Control das imagens (o app reexporta em CC). */
export const CC_OG = {
  /** placar ao vivo */
  vivo: 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
  /** dado oficial/real: muda só com o dataset (a URL das meta tags leva a versão em `v`) */
  estatica: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  teste: 'public, max-age=86400, s-maxage=86400',
} as const;

const OG_TTL_MS = 30_000;
/** Imagem vencida da mesma fonte ainda serve (enquanto a nova é gerada) por até 5 min. */
const OG_STALE_MS = 5 * 60_000;
/** Grupo padrão do pacote de fotos oficiais (public/data/fotos/{grupo}.json) quando o candidato não diz. */
const GRUPO_FOTOS_PADRAO = 'segundo-turno';

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
  const dominio = d.dominio ?? undefined;

  /** PNG com ETag (rota + versão|modo + instante da geração), 304 e CORS (robôs de outras origens). */
  const enviarPng = (c: Ctx, chave: string, s: OgServida, cc: string) => {
    const etag = etagFraco('og', hashCurto(chave), hashCurto(s.sub), s.em.toString(36));
    const headers: Record<string, string> = {
      'content-type': 'image/png',
      'cache-control': cc,
      etag,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      ...s.headers,
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return responder(c, c.req.method === 'HEAD' ? null : s.png, headers);
  };

  const gerar = async (rotulo: string, no: () => Promise<No> | No, sub: string, headers?: Record<string, string>): Promise<OgPronta> => {
    const t0 = perf();
    const png = await renderPng(await no());
    log.info(`OG ${rotulo} gerada em ${Math.round(perf() - t0)} ms (${Math.round(png.length / 1024)} KB)`);
    return { png, sub, headers };
  };

  /** Imagem ao vivo (depende do estado da apuração). */
  const vivo = async (c: Ctx, chave: string, montar: (st: LiveStatus) => Promise<OgPronta>) => {
    const st = dados.status();
    const s = await servico.obter({
      chave,
      sub: `${st.versao}|${modoOg(st)}`,
      ttlMs: OG_TTL_MS,
      staleMs: OG_STALE_MS,
      montar: () => montar(dados.status()),
      modoAtual: () => modoOg(dados.status()),
    });
    return enviarPng(c, chave, s, CC_OG.vivo);
  };

  /** Imagem estática (dado oficial): vale enquanto a versão dos dados (e o modo, se houver) não mudar. */
  const estatica = async (c: Ctx, chave: string, versao: string, modo: string, montar: (sub: string) => Promise<OgPronta>, modoAtual?: () => string) => {
    const sub = `${versao}|${modo}`;
    const s = await servico.obter({ chave, sub, ttlMs: Infinity, staleMs: Infinity, montar: () => montar(sub), modoAtual });
    return enviarPng(c, chave, s, CC_OG.estatica);
  };

  /**
   * Fotos oficiais para o placar: nunca com nomes ocultos; só quando há foto de TODOS os finalistas. Quem chama
   * também nunca pede foto para números simulados.
   */
  const fotosOg = (race: Race, anonimizado: boolean): string[] | undefined => {
    if (anonimizado) return undefined;
    const lista = race.candidatos.map((cd) => (cd.agregado || !cd.sqcand ? null : fotos.fotoOg(cd.fotoGrupo || GRUPO_FOTOS_PADRAO, cd.sqcand)));
    const fin = race.candidatos.map((cd, i) => (cd.agregado ? -1 : i)).filter((i) => i >= 0);
    return fin.length >= 2 && fin.every((i) => lista[i]) ? lista.map((f) => f ?? '') : undefined;
  };

  const exibir = (r: Race, anon: boolean) => (anon ? anonimizarRace(r) : r);
  const t1De = (r: Race): Race | undefined => (r.turno === 1 ? r : races.get(`${r.id}-t1`));
  const t2De = (r: Race): Race | undefined => (r.turno === 2 ? r : races.get(r.id.replace(/-t1$/, '')));
  const onde = (nome: string, uf: UF) => `${nome} (${uf === 'ZZ' ? 'Exterior' : uf})`;

  // ---- placar (Brasil/UF) -------------------------------------------------------------------------
  app.get('/api/og/apuracao.png', async (c) => {
    const race = parseRace(c.req.query('race') || 'pres');
    const r = dados.race(race);
    const ufQ = c.req.query('uf');
    const uf = ufQ ? parseUf(ufQ) : undefined;
    if (uf && !r.ufs.includes(uf)) throw new NotFoundError(`A UF ${uf} não participa da corrida ${r.id}.`);
    const chave = `${r.id}|${uf ?? 'br'}`;
    return vivo(c, chave, async (st) => {
      const t0 = perf();
      const snap = uf ? await dados.uf(r.id, uf) : await dados.nacional(r.id);
      const resumo = snap.resumo;
      const simulacao = st.simulacao && r.turno === 2;
      const anon = !!st.anonimizado;
      const fonteTse = dados.fonteDe(r.id) === 'tse';
      const raceOg = races.get(snap.race) ?? r;
      // foto oficial só com número real: nunca na simulação (nem com os nomes reais ligados no admin)
      const fotosPlacar = simulacao ? undefined : fotosOg(raceOg, anon);
      const png = await renderPng(
        layoutPlacar({
          // simulação anônima: nada de nome nem foto real em imagem com números fictícios
          race: exibir(raceOg, anon),
          uf,
          resumo,
          simulacao,
          horario: simulacao ? snap.simNow : fonteTse ? (resumo.ultimaAtualizacao ?? snap.geradoEm) : snap.geradoEm,
          pre: r.turno === 2 && resumo.secoesTotalizadas === 0,
          fotos: fotosPlacar,
        }),
      );
      log.info(
        `OG ${r.id}${uf ? `/${uf}` : ''} gerada em ${Math.round(perf() - t0)} ms (${Math.round(png.length / 1024)} KB` +
          `${fotosPlacar ? ', com fotos oficiais' : ''})`,
      );
      return { png, sub: `${st.versao}|${modoOg(st)}`, headers: { 'x-og-fotos': fotosPlacar ? '1' : '0' } };
    });
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
    const chave = `mun|${exib.id}|${uf}|${cod}`;
    const titulo = onde(nome, uf);
    const cargo = exib.cargo === 'Presidente' ? 'PRESIDENTE' : 'GOVERNADOR';
    const montar = async (stM: LiveStatus, sub: string): Promise<OgPronta> => {
      const snap = await dados.municipio(exib.id, uf, cod);
      const anon = !!stM.anonimizado;
      const simulacao = stM.simulacao && exib.turno === 2;
      const raceOg = races.get(snap.race) ?? exib;
      const fotosPlacar = simulacao ? undefined : fotosOg(raceOg, anon);
      return gerar(
        chave,
        () =>
          layoutPlacar({
            race: exibir(raceOg, anon),
            uf,
            resumo: snap.resumo,
            simulacao,
            horario: simulacao ? snap.simNow : (snap.resumo.ultimaAtualizacao ?? snap.geradoEm),
            pre: false,
            fotos: fotosPlacar,
            titulo,
            kicker: exib.turno === 1 ? `1º TURNO 2026 · ${cargo} · RESULTADO NO MUNICÍPIO` : `APURAÇÃO · 2º TURNO 2026 · ${cargo}`,
            local: true,
          }),
        sub,
        { 'x-og-fotos': fotosPlacar ? '1' : '0' },
      );
    };
    if (exib.turno === 1) {
      const modo = `t1${st.anonimizado ? '-anon' : ''}`;
      return estatica(c, chave, d.versaoDataset, modo, (sub) => montar(dados.status(), sub), () => `t1${dados.status().anonimizado ? '-anon' : ''}`);
    }
    return vivo(c, chave, (stM) => montar(stM, `${stM.versao}|${modoOg(stM)}`));
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
    return vivo(c, chave, (stM) => montar(stM, `${stM.versao}|${modoOg(stM)}`));
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

  // ---- governadores (as 7 disputas) ------------------------------------------------------------------
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
    return vivo(c, chave, (stM) => montar(stM, `${stM.versao}|${modoOg(stM)}`));
  });

  // ---- curiosidades (dado real) ---------------------------------------------------------------------
  app.get('/api/og/curiosidade.png', async (c) => {
    const q = c.req.query();
    const { f } = validar(qCuriosidade, { f: q.f ?? q.fato }, 'Parâmetro: ?f=<id do fato>.');
    const lido = estaticos.curiosidades();
    if (!lido) throw new NotFoundError('Curiosidades indisponíveis.');
    const fato = f ? lido.valor.fatos.find((x) => x.id === f) : undefined;
    const chave = `cur|${fato?.id ?? 'capa'}`;
    return estatica(c, chave, lido.versao, 'estatico', (sub) =>
      gerar(
        chave,
        () => {
          if (fato) return layoutCuriosidade({ fato, finalistas: lido.valor.finalistas, dominio });
          // os mesmos três destaques da home (DESTAQUES_PADRAO do app), completados com outros fatos com número
          const comNumero = lido.valor.fatos.filter((x) => x.destaque);
          const preferidos = ['finalistas-empate-municipio', 'finalistas-menor-diferenca', 'brasil-cidade-maior-que-estados'];
          const ordem = [...comNumero].sort((x, y) => {
            const px = preferidos.indexOf(x.id);
            const py = preferidos.indexOf(y.id);
            return (px < 0 ? 99 : px) - (py < 0 ? 99 : py);
          });
          return layoutCuriosidadesCapa({ fatos: ordem.slice(0, 3), total: lido.valor.fatos.length, dominio });
        },
        sub,
      ),
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
      return estatica(c, chave, 'v1', 'estatico', (sub) => gerar(chave, () => layoutCalculadora({ dominio }), sub));
    }
    // forma canônica: códigos equivalentes compartilham a mesma imagem
    const chave = `cen|${codificarCenario(cenario)}`;
    return estatica(c, chave, lido.versao, 'estatico', (sub) =>
      gerar(
        'cenário',
        () => {
          const resultado = calcularCenario(lido.valor, cenario);
          const premissas = premissasCenario(lido.valor, cenario, resultado, { nomesCurtos: true });
          return layoutCenario({ ds: lido.valor, cenario, resultado, premissas, dominio });
        },
        sub,
      ),
    );
  });

  // ---- Teste Cego (genérico) ------------------------------------------------------------------------
  let ogTeste: Promise<Buffer> | null = null;
  app.get('/api/og/teste.png', async (c) => {
    ogTeste ??= renderPng(layoutTeste());
    ogTeste.catch(() => (ogTeste = null));
    const png = await ogTeste;
    return responder(c, c.req.method === 'HEAD' ? null : png, {
      'content-type': 'image/png',
      'cache-control': CC_OG.teste,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    });
  });
}

