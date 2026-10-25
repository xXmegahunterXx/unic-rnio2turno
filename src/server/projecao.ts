/**
 * "Projeção do Sintonia" (src/shared/projecao.ts): `GET /api/apuracao/:race/br/projecao` (Presidente, Brasil) e
 * `GET /api/apuracao/:race/:uf/projecao` (Presidente na UF/exterior e Governador). Resposta `{ projecao: Projecao }`.
 *
 * Fontes: 1º turno = dataset (motor, corrida `-t1`); 2º turno = motor (simulação/pré) ou, na fonte TSE, SÓ o que já está
 * no cache dos municípios (`TseSource.resumosMunicipaisEmCache`) + o acompanhamento de cada UF já lido
 * (`TseSource.acompanhamentoMunicipalEmCache`: seções e eleitorado totalizados por município, sem votos) + o total
 * OFICIAL de cada UF (o placar nacional, que o servidor já lê): esta rota nunca baixa arquivo do TSE nem mexe na
 * prioridade da fila (o mesmo cuidado do "desde o 1º turno", src/server/desde-t1.ts). Município ainda não lido entra
 * como "desconhecido" e o oficial da UF ancora o já apurado; o acompanhamento diz quais desconhecidos começaram (e marca
 * o lido defasado). Assim a projeção não depende do cache dos municípios estar cheio (reinício, lote grande do TSE).
 *
 * Cache igual ao do desde-t1: recalcula só quando o status muda (versão, fonte, fase, marca da corrida, chave) ou a
 * cada 5 s, e `s-maxage=5` na CDN. NUNCA 500 por erro de cálculo: devolve `disponivel: false, motivo: 'sem-base'`.
 * Chave da noite 'projecao' desligada → `motivo: 'desligada'` (o app não mostra nada). O payload não leva nomes.
 */
import type { Context, Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { Race, UF } from '../shared/types';
import {
  calcularProjecao,
  montarProjecao,
  paresT1,
  projecaoIndisponivel,
  t1Projecao,
  type AcompanhamentoProjecao,
  type ContagemProjecao,
  type ContextoProjecao,
  type MunicipioProjecao,
  type Projecao,
  type T1Projecao,
} from '../shared/projecao';
import { NotFoundError } from '../engine/api';
import type { Dados } from './dados';
import { casaEtag, etagFraco, hashCurto } from './http-cache';
import type { TseManager } from './tse';
import { parseRace, parseUf } from './validation';

export const CC_PROJECAO = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10';
const TTL_MS = 5_000;

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

export interface DepsProjecao {
  dados: Dados;
  tse: Pick<TseManager, 'fonte'>;
  races: ReadonlyMap<string, Race>;
  now: () => number;
  /** Chave da noite 'projecao' (padrão ligada). */
  ligada: () => boolean;
  /** Erro de cálculo (vai ao log; a resposta segue 200 com 'sem-base'). */
  aoFalhar?: (msg: string, err: unknown) => void;
}

/** 1º turno por município (estático): `${raceT1}|${uf}` → cod → contagem da projeção. */
type MapaT1 = Map<string, T1Projecao | null>;

/**
 * Calcula a projeção de uma corrida numa abrangência ('BR' ou a UF), com as regras de exibição. Exportado para os
 * testes. Lança só por erro inesperado (a rota converte em 'sem-base').
 */
export async function calcularProjecaoServidor(
  d: Pick<DepsProjecao, 'dados' | 'tse'>,
  race: Race,
  raceT1: Race | undefined,
  abr: 'BR' | UF,
  t1Cache: Map<string, MapaT1> = new Map(),
): Promise<Projecao> {
  const st = d.dados.status();
  const vazio: ContextoProjecao = { race, abrangencia: abr, simNow: st.simNow, resumo: null };
  if (st.fonte === 'pre' || st.fase === 'pre') return projecaoIndisponivel(vazio, 'cedo');
  const n = await d.dados.nacional(race.id);
  const resumo = abr === 'BR' ? n.resumo : (n.ufs[abr] ?? (race.abrangencia === abr ? n.resumo : null));
  const ctx: ContextoProjecao = { ...vazio, resumo: resumo ?? null, encerrada: st.fase === 'encerrada' };
  // regras que dispensam a conta (encerrada, definido, sem urnas)
  const rapido = montarProjecao(ctx, null);
  if (rapido.motivo !== 'sem-base') return rapido;
  if (!raceT1) return rapido;

  const pares = paresT1(race, raceT1);
  const tse = d.dados.fonteDe(race.id) === 'tse';
  const ufs: UF[] = abr === 'BR' ? race.ufs : [abr];
  const municipios: MunicipioProjecao[] = [];
  const totaisUf: Record<string, ContagemProjecao | undefined> = {};
  // na fonte TSE: só o cache dos municípios e o acompanhamento das UFs (nunca baixa nada)
  const cacheTse = new Map<string, ContagemProjecao>();
  const abTse = new Map<string, AcompanhamentoProjecao>();
  if (tse) {
    const fonte = d.tse.fonte;
    for (const { uf, cod, resumo: r } of fonte?.resumosMunicipaisEmCache(race.id) ?? []) cacheTse.set(`${uf}|${cod}`, r);
    for (const { uf, cod, ...a } of fonte?.acompanhamentoMunicipalEmCache?.(race.id) ?? []) abTse.set(`${uf}|${cod}`, a);
    for (const uf of ufs) totaisUf[uf] = n.ufs[uf] ?? (race.abrangencia === uf ? n.resumo : undefined);
  }
  for (const uf of ufs) {
    const chaveT1 = `${raceT1.id}|${uf}`;
    let t1 = t1Cache.get(chaveT1);
    if (!t1) {
      t1 = new Map();
      for (const m of (await d.dados.uf(raceT1.id, uf)).municipios) t1.set(m.cod, t1Projecao(pares, m.votos));
      t1Cache.set(chaveT1, t1);
    }
    if (tse) {
      for (const [cod, t] of t1) municipios.push({ uf, t1: t, t2: cacheTse.get(`${uf}|${cod}`) ?? null, ab: abTse.get(`${uf}|${cod}`) ?? null });
    } else {
      for (const m of (await d.dados.uf(race.id, uf)).municipios) municipios.push({ uf, t1: t1.get(m.cod) ?? null, t2: m });
    }
  }
  const p = montarProjecao(ctx, calcularProjecao({ municipios, totaisUf: tse ? totaisUf : undefined }));
  // simulação com nomes ocultos: o número de urna verdadeiro não vai no payload (o app casa pelo índice)
  return st.anonimizado ? { ...p, candidatos: p.candidatos.map((c) => ({ ...c, numero: c.indice + 1 })) } : p;
}

export function registrarProjecao(app: App, d: DepsProjecao): void {
  const cache = new Map<string, { chave: string; em: number; corpo: Promise<{ json: string; etag: string }> }>();
  const t1Cache = new Map<string, MapaT1>();

  app.get('/api/apuracao/:race/:abr/projecao', async (c: Ctx) => {
    const race = d.dados.race(parseRace(c.req.param('race') ?? ''));
    if (race.turno !== 2) throw new NotFoundError('Projeção só para as disputas do 2º turno.');
    const pedido = String(c.req.param('abr') ?? '').toUpperCase();
    // 'br' numa disputa de governador = a UF dela (a abrangência da disputa)
    const abr: 'BR' | UF = pedido === 'BR' ? (race.abrangencia === 'BR' ? 'BR' : race.abrangencia) : parseUf(pedido);
    if (abr !== 'BR' && !race.ufs.includes(abr)) throw new NotFoundError(`A disputa ${race.id} não tem a UF ${abr}.`);
    const st = d.dados.status();
    const ligada = d.ligada();
    const agora = d.now();
    const chave = `${st.versao}|${st.fonte}|${st.fase}|${st.frescor?.[race.id]?.marca ?? ''}|${ligada ? 1 : 0}|${st.anonimizado ? 1 : 0}`;
    const k = `${race.id}|${abr}`;
    let e = cache.get(k);
    if (!e || e.chave !== chave || agora - e.em >= TTL_MS) {
      const ctx: ContextoProjecao = { race, abrangencia: abr, simNow: st.simNow, resumo: null };
      const calc: Promise<Projecao> = ligada
        ? calcularProjecaoServidor(d, race, d.races.get(`${race.id}-t1`), abr, t1Cache).catch((err: unknown) => {
            d.aoFalhar?.(`Projeção ${race.id}/${abr}: falha no cálculo`, err);
            return projecaoIndisponivel(ctx, 'sem-base');
          })
        : Promise.resolve(projecaoIndisponivel(ctx, 'desligada'));
      const corpo = calc.then((projecao) => {
        const json = JSON.stringify({ projecao });
        return { json, etag: etagFraco('proj', k, hashCurto(json)) };
      });
      e = { chave, em: agora, corpo };
      cache.set(k, e);
    }
    const { json, etag } = await e.corpo;
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': CC_PROJECAO, etag };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return c.body(json, 200, headers);
  });
}
