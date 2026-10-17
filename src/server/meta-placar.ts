/**
 * Placar na descrição das páginas (meta tags, I07a) na fonte 'tse', durante a noite: lê SÓ o que o TseSource já tem em
 * cache — resumo Brasil e das UFs (o snapshot nacional, que só junta arquivos já lidos) e os municípios já baixados
 * (`resumosMunicipaisEmCache`). Nunca baixa arquivo do TSE, nunca muda a prioridade da fila de municípios, nunca espera o
 * feed: a meta tag é montada na hora com o que houver; sem número em cache, ou com qualquer erro, devolve `null` e a
 * descrição sai sem placar (como antes da leva 3).
 *
 *  - Brasil e UF: o snapshot nacional da corrida é pedido em SEGUNDO PLANO (no máximo a cada 10 s por corrida) e só
 *    quando a leitura não dispararia download — o TSE pausado por bloqueio (a fonte não pede nada), ou a corrida já com o
 *    arquivo principal em cache e lida há menos de 1,5 intervalo (o laço do servidor cuida das leituras). A meta tag usa
 *    a última cópia (até 15 min; mais velha = sem placar).
 *  - Município: mapa (uf|cod → resumo) remontado a partir do cache no máximo a cada 10 s por corrida.
 *  - Ordem dos candidatos: a do dataset (ordem da urna); números oficiais (`simulacao: false`). Nomes ocultos ligados no
 *    painel: "Candidato A/B" (`anonimizarRace`), como no resto do site.
 *
 * Ligado em app.ts por `ligarMetaNoite(ctxMeta, …)` (uma linha): corridas na fonte 'tse' passam por aqui; as do motor
 * (simulação, pré, 1º turno) continuam com o placar do motor. Também entrega o relógio às meta tags (`ctx.agora`), usado
 * para tirar os nomes das descrições no dia da votação, antes das 17h.
 */
import type { Race, Summary, UF } from '../shared/types';
import { anonimizarRace } from '../shared/anon';
import type { TseCorridaHealth, TseHealth } from '../tse';
import type { ContextoMeta, PlacarMeta } from './meta-tags';

/** O que este módulo usa do TseSource (nada que baixe arquivo além de `nacional`, chamado só com a guarda abaixo). */
export interface FonteTseMeta {
  health(): Pick<TseHealth, 'bloqueadoAte' | 'intervaloSeg' | 'esperaSeg'> & { corridas: Pick<TseCorridaHealth, 'race' | 'mapeadaComo' | 'ultimoPoll'>[] };
  nacional(raceId: string): Promise<{ race: string; resumo: Summary; ufs: Partial<Record<UF, Summary>> }>;
  resumosMunicipaisEmCache(raceId: string): { uf: UF; cod: string; resumo: Summary }[];
}

export interface DepsMetaPlacar {
  /** O TseManager (só a instância já criada: `fonte` null = sem placar). */
  tse: { readonly fonte: FonteTseMeta | null };
  /** Fonte efetiva da corrida agora (Dados.fonteDe). */
  fonteDe(race: string): 'motor' | 'tse';
  races: ReadonlyMap<string, Race>;
  now: () => number;
  /** Simulação com nomes ocultos ligada no painel. */
  anonimizado?: () => boolean | undefined;
  /**
   * Chave 'meta-placar' do painel (integração da leva 3), lida a cada página: false = nenhuma descrição leva placar
   * (nem da fonte TSE nem do motor). Ausente = ligada.
   */
  ligado?: () => boolean;
}

/** Intervalo mínimo entre leituras do cache da fonte, por corrida. */
export const RENOVAR_MS = 10_000;
/** Cópia mais velha que isto não vai para a descrição. */
export const VALIDADE_MS = 15 * 60_000;
/** Folga da guarda "não dispara download" (arredondamento do `esperaSeg` e o tempo entre a guarda e a leitura). */
const FOLGA_MS = 1_000;

interface CopiaNacional {
  em: number;
  race: string;
  resumo: Summary;
  ufs: Partial<Record<UF, Summary>>;
}

/**
 * A leitura do snapshot nacional NÃO dispara download? (espelha a guarda `garantir` do TseSource: pausa por bloqueio →
 * não pede nada; sem arquivo principal em cache → baixaria; lida há mais de 1,5 intervalo → pediria em segundo plano).
 * Pura (testada).
 */
export function leituraSemDownload(h: ReturnType<FonteTseMeta['health']>, race: string, agora: number): boolean {
  if (h.bloqueadoAte !== null && h.bloqueadoAte > agora) return true;
  const c = h.corridas.find((x) => x.race === race);
  if (!c || c.mapeadaComo === null || c.ultimoPoll === null) return false;
  const ttl = Math.max(h.intervaloSeg, h.esperaSeg) * 1000;
  return agora - c.ultimoPoll <= ttl * 1.5 - FOLGA_MS;
}

export class MetaPlacarTse {
  private readonly nacionais = new Map<string, CopiaNacional>();
  private readonly pedidos = new Map<string, number>();
  private readonly municipios = new Map<string, { em: number; mapa: Map<string, Summary> }>();

  constructor(private readonly d: DepsMetaPlacar) {}

  /** Placar do Brasil (`uf` ausente) ou da UF, da última cópia em cache. Nunca lança. */
  placar(race: string, uf?: UF): PlacarMeta | null {
    try {
      const id = race.toLowerCase();
      const src = this.d.tse.fonte;
      if (!src || this.d.races.get(id)?.turno !== 2) return null;
      this.renovar(src, id);
      const c = this.nacionais.get(id);
      if (!c || this.d.now() - c.em > VALIDADE_MS) return null;
      const resumo = uf ? c.ufs[uf] : c.resumo;
      return resumo ? this.montar(id, c.race, resumo) : null;
    } catch {
      return null;
    }
  }

  /** Placar do município, se o arquivo dele já estiver no cache da fonte. Nunca lança. */
  placarMunicipio(race: string, uf: UF, cod: string): PlacarMeta | null {
    try {
      const id = race.toLowerCase();
      const src = this.d.tse.fonte;
      if (!src || this.d.races.get(id)?.turno !== 2) return null;
      const agora = this.d.now();
      let m = this.municipios.get(id);
      if (!m || agora - m.em >= RENOVAR_MS) {
        const mapa = new Map<string, Summary>();
        for (const x of src.resumosMunicipaisEmCache(id)) mapa.set(`${x.uf}|${x.cod}`, x.resumo);
        m = { em: agora, mapa };
        this.municipios.set(id, m);
      }
      const resumo = m.mapa.get(`${uf}|${cod}`);
      return resumo ? this.montar(id, id, resumo) : null;
    } catch {
      return null;
    }
  }

  /** Pede (em segundo plano) uma cópia nova do snapshot nacional, se a anterior passou de 10 s e a leitura é segura. */
  private renovar(src: FonteTseMeta, id: string) {
    const agora = this.d.now();
    const c = this.nacionais.get(id);
    const pedido = this.pedidos.get(id);
    if (c && agora - c.em < RENOVAR_MS) return;
    if (pedido !== undefined && agora - pedido < RENOVAR_MS) return;
    if (!leituraSemDownload(src.health(), id, agora)) return;
    this.pedidos.set(id, agora);
    src
      .nacional(id)
      .then((s) => {
        if (s && s.resumo) this.nacionais.set(id, { em: this.d.now(), race: s.race, resumo: s.resumo, ufs: s.ufs ?? {} });
      })
      .catch(() => undefined)
      .finally(() => this.pedidos.delete(id));
  }

  private montar(id: string, mapeada: string, resumo: Summary): PlacarMeta | null {
    const base = this.d.races.get(mapeada.toLowerCase()) ?? this.d.races.get(id);
    if (!base || resumo.votos.length !== base.candidatos.length) return null;
    return { resumo, simulacao: false, race: this.d.anonimizado?.() ? anonimizarRace(base) : base };
  }
}

/**
 * Liga o placar da fonte TSE e o relógio nas meta tags (app.ts, uma linha): as corridas na fonte 'tse' passam a ter
 * placar na descrição (só do cache); as demais seguem com o placar do motor já configurado no contexto.
 */
export function ligarMetaNoite(ctx: ContextoMeta, d: DepsMetaPlacar): MetaPlacarTse {
  const tse = new MetaPlacarTse(d);
  const { placar, placarMunicipio } = ctx;
  const ligado = () => {
    try {
      return d.ligado?.() !== false;
    } catch {
      return true;
    }
  };
  ctx.placar = (race, uf) => (!ligado() ? null : d.fonteDe(race) === 'tse' ? tse.placar(race, uf) : (placar?.(race, uf) ?? null));
  ctx.placarMunicipio = (race, uf, cod) =>
    !ligado() ? null : d.fonteDe(race) === 'tse' ? tse.placarMunicipio(race, uf, cod) : (placarMunicipio?.(race, uf, cod) ?? null);
  ctx.agora ??= d.now;
  return tse;
}
