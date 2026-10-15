/**
 * "Desde o 1º turno" no Brasil, por MUNICÍPIO: `GET /api/apuracao/:race/br/desde-t1` (só Presidente no 2º turno).
 *
 * A diferença em votos de cada finalista em relação ao 1º turno só é justa onde o eleitorado comparado é o mesmo: nos
 * municípios com 100% das seções totalizadas. O app da UF já tem os municípios da UF e soma sozinho
 * (src/shared/desde-t1.ts); para o Brasil inteiro (5.570 municípios + exterior), soma aqui e entrega o agregado
 * (`DesdeT1Agregado`: quantos municípios concluídos, quanto do eleitorado cobrem, a soma por candidato e "onde cada um
 * cresceu mais", com piso de 10 mil eleitores).
 *
 * Fontes: 1º turno = dataset (motor); 2º turno = motor (simulação/pré) ou, na fonte TSE, SÓ o que já está no cache dos
 * municípios (`TseSource.resumosMunicipaisEmCache`): esta rota nunca baixa arquivo do TSE nem mexe na prioridade da
 * fila. Calculado no máximo a cada 5 s (memória) e com `s-maxage=5` na CDN. Simulação com nomes ocultos: 404 (a
 * comparação com os números oficiais do 1º turno identificaria quem é o Candidato A e quem é o B).
 */
import type { Context, Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { Race, UF } from '../shared/types';
import { agregarDesdeT1, type ContagemT1, type ContagemT2, type DesdeT1Agregado } from '../shared/desde-t1';
import { NotFoundError } from '../engine/api';
import type { Dados } from './dados';
import { casaEtag, etagFraco, hashCurto } from './http-cache';
import type { TseManager } from './tse';
import { parseRace } from './validation';

export const CC_DESDE_T1 = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10';
const TTL_MS = 5_000;
/** Piso de eleitorado para "onde cada um cresceu mais" no Brasil (lugares minúsculos variam muito e não dizem nada). */
export const ELEITORADO_MIN_BR = 10_000;

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

export interface DepsDesdeT1 {
  dados: Dados;
  tse: Pick<TseManager, 'fonte'>;
  races: ReadonlyMap<string, Race>;
  now: () => number;
}

/** Calcula o agregado (sem cache). Exportado para os testes. */
export async function calcularDesdeT1(d: DepsDesdeT1, race: Race, raceT1: Race): Promise<DesdeT1Agregado> {
  const tse = d.dados.fonteDe(race.id) === 'tse';
  const areas1 = new Map<string, ContagemT1>();
  const areas2 = new Map<string, ContagemT2>();
  const nomes = new Map<string, string>();
  for (const uf of race.ufs) {
    // 1º turno: dataset (o motor; nunca o feed)
    const s1 = await d.dados.uf(raceT1.id, uf);
    for (const m of s1.municipios) {
      const k = `${uf}|${m.cod}`;
      areas1.set(k, m);
      nomes.set(k, `${m.nome} (${uf === 'ZZ' ? 'Exterior' : uf})`);
      // na fonte TSE, município ainda não lido entra como "não concluído" (conta no total e na cobertura)
      if (tse) areas2.set(k, { votos: race.candidatos.map(() => 0), secoes: m.secoes, secoesTotalizadas: 0, eleitorado: m.eleitorado });
    }
    if (!tse) for (const m of (await d.dados.uf(race.id, uf)).municipios) areas2.set(`${uf}|${m.cod}`, m);
  }
  if (tse) for (const { uf, cod, resumo } of d.tse.fonte?.resumosMunicipaisEmCache(race.id) ?? []) areas2.set(`${uf as UF}|${cod}`, resumo);
  return agregarDesdeT1(race, raceT1, areas2, areas1, { ondeQuantos: 3, ondeEleitoradoMin: ELEITORADO_MIN_BR, nome: (k) => nomes.get(k), geradoEm: d.now() });
}

export function registrarDesdeT1(app: App, d: DepsDesdeT1): void {
  const cache = new Map<string, { chave: string; em: number; corpo: Promise<{ json: string; etag: string }> }>();

  app.get('/api/apuracao/:race/br/desde-t1', async (c: Ctx) => {
    const race = d.dados.race(parseRace(c.req.param('race') ?? ''));
    const raceT1 = d.races.get(`${race.id}-t1`);
    if (race.turno !== 2 || race.abrangencia !== 'BR' || !raceT1) throw new NotFoundError('Comparação por município só para Presidente no 2º turno.');
    const st = d.dados.status();
    if (st.anonimizado) throw new NotFoundError('Comparação oculta na simulação com nomes ocultos.');
    const agora = d.now();
    const chave = `${st.versao}|${st.fonte}|${st.frescor?.[race.id]?.marca ?? ''}`;
    let e = cache.get(race.id);
    if (!e || e.chave !== chave || agora - e.em >= TTL_MS) {
      const corpo = calcularDesdeT1(d, race, raceT1).then((ag) => {
        const json = JSON.stringify(ag);
        return { json, etag: etagFraco('dt1', race.id, hashCurto(json)) };
      });
      e = { chave, em: agora, corpo };
      cache.set(race.id, e);
      corpo.catch(() => {
        if (cache.get(race.id) === e) cache.delete(race.id);
      });
    }
    const { json, etag } = await e.corpo;
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': CC_DESDE_T1, etag };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return c.body(json, 200, headers);
  });
}
