/**
 * Série e eventos da apuração na fonte TSE, montados por DIFERENÇA entre polls sucessivos.
 *
 * O motor de simulação pré-calcula série e eventos; aqui eles nascem ao vivo: a cada poll, o estado de cada
 * abrangência (Brasil e UFs) é comparado com o anterior. Regras (mesmas do motor, ARCHITECTURE §5.2):
 *  - um ponto de série por mudança de `secoesTotalizadas`;
 *  - início (0 → >0 seções), marcos de 1/5/10/25/50/75/90/95/99/100%;
 *  - liderança e virada (virada = troca de líder com > 5% apurado), nacional e por UF (UF: só viradas,
 *    no máximo 1 a cada 10 min por UF);
 *  - UF encerrada; eleição matematicamente definida.
 * Textos neutros em pt-BR. Tudo serializável (`exportar`/`importar`) para sobreviver a reinícios.
 *
 * "Reveja a noite" (`?t=`): além da série e dos eventos, guarda o Summary COMPLETO de cada abrangência
 * (Brasil e UFs) a cada mudança e, por município, a cada download que mudou os números — compactados em
 * arrays de inteiros (`ResumoCompacto`). `resumoEm(abr, t)` / `municipioEm(uf, cod, t)` devolvem o estado
 * mais recente com instante ≤ t (instante oficial da última totalização do arquivo, ou o relógio do poll).
 */
import type { FeedEvent, Race, RaceId, SeriePoint, Summary, TipoEvento, UF } from '../shared/types';
import { UF_NOMES } from '../shared/constants';
import { pctTotalizadas, pctValidos } from '../shared/calc';
import { fmtPct } from '../shared/format';
import { pontoSerie } from './map';

export const MARCOS = [1, 5, 10, 25, 50, 75, 90, 95, 99, 100] as const;
/** Marcos publicados também no feed de cada UF (na corrida de Presidente). */
export const MARCOS_UF = [25, 50, 75, 100] as const;
/** Troca de líder acima deste % de seções é "virada". */
export const PCT_VIRADA = 5;
/** Intervalo mínimo entre eventos de liderança da mesma UF (corrida nacional). */
export const INTERVALO_LIDER_UF_MS = 10 * 60_000;
const MAX_EVENTOS = 300;
export const MAX_EVENTOS_SNAPSHOT = 60;
const MAX_PONTOS = 2_000;
/** Estados guardados por abrangência (Brasil/UF): ~1 por poll com mudança (15 s) → folga para a noite toda. */
const MAX_RESUMOS = 3_000;
/** Estados guardados por município (downloads que mudaram os números; ≥ 60 s entre downloads). */
const MAX_RESUMOS_MUN = 240;

/** 'BR' ou a UF. */
export type Abr = 'BR' | UF;

/** Estado mínimo de uma abrangência num instante. */
export interface EstadoAbr {
  t: number;
  st: number;
  ts: number;
  pst: number;
  votos: number[];
  lider: number | null;
  eleito: number | null;
  status: Summary['status'];
}

export const estadoDe = (s: Summary, t: number): EstadoAbr => ({
  t,
  st: s.secoesTotalizadas,
  ts: s.secoes,
  pst: pctTotalizadas(s),
  votos: [...s.votos],
  lider: s.lider,
  eleito: s.eleito,
  status: s.status,
});

// ---------------------------------------------------------------------------------------------
// Summary compacto (histórico "reveja a noite")
// ---------------------------------------------------------------------------------------------

/**
 * Summary + instante em inteiros: [t, secoes, secoesTotalizadas, eleitorado, eleitoradoTotalizado,
 * comparecimento, abstencao, brancos, nulos, status (0 aguardando · 1 apurando · 2 encerrada),
 * lider, eleito, ultimaAtualizacao (−1 = null), ...votos]. ~5× menor que o objeto em JSON.
 */
export type ResumoCompacto = number[];

const STATUS: Summary['status'][] = ['aguardando', 'apurando', 'encerrada'];
const CAMPOS_FIXOS = 13;

export function compactarResumo(s: Summary, t: number): ResumoCompacto {
  const nul = (v: number | null) => (v === null ? -1 : v);
  return [
    t,
    s.secoes,
    s.secoesTotalizadas,
    s.eleitorado,
    s.eleitoradoTotalizado,
    s.comparecimento,
    s.abstencao,
    s.brancos,
    s.nulos,
    Math.max(0, STATUS.indexOf(s.status)),
    nul(s.lider),
    nul(s.eleito),
    nul(s.ultimaAtualizacao),
    ...s.votos,
  ];
}

export function expandirResumo(a: ResumoCompacto): Summary {
  const nul = (v: number) => (v < 0 ? null : v);
  return {
    secoes: a[1],
    secoesTotalizadas: a[2],
    eleitorado: a[3],
    eleitoradoTotalizado: a[4],
    comparecimento: a[5],
    abstencao: a[6],
    brancos: a[7],
    nulos: a[8],
    status: STATUS[a[9]] ?? 'aguardando',
    lider: nul(a[10]),
    eleito: nul(a[11]),
    ultimaAtualizacao: nul(a[12]),
    votos: a.slice(CAMPOS_FIXOS),
  };
}

/** Índice do último item com instante (`[0]`) ≤ t, ou −1. Lista ordenada por instante. */
function ultimoAte(lista: ResumoCompacto[], t: number): number {
  let lo = 0;
  let hi = lista.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (lista[m][0] <= t) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r;
}

/** Acrescenta mantendo a ordem por instante (mesmo instante ou anterior ⇒ substitui o último). */
function acrescentar(lista: ResumoCompacto[], item: ResumoCompacto, max: number): ResumoCompacto[] {
  const ult = lista[lista.length - 1];
  if (ult && item[0] <= ult[0]) {
    item[0] = ult[0];
    lista[lista.length - 1] = item;
  } else lista.push(item);
  return lista.length > max ? afinar(lista, Math.floor(max / 2)) : lista;
}

/**
 * Instante do estado no histórico: o da última totalização; estado ainda zerado sem data no arquivo vale
 * "desde sempre" (0) — senão o relógio do 1º poll (pode ser posterior à 1ª totalização oficial, pelo atraso
 * do CDN do TSE) esconderia o começo da noite.
 */
const instanteResumo = (s: Summary, t: number) => (s.secoesTotalizadas === 0 && s.ultimaAtualizacao === null ? 0 : t);

const mesmosNumeros = (a: ResumoCompacto | undefined, b: ResumoCompacto) => !!a && a.length === b.length && a.every((v, i) => i === 0 || v === b[i]);

const nomeAbr = (abr: Abr) => (abr === 'BR' ? 'Brasil' : UF_NOMES[abr]);
const pctSecoes = (pst: number) => fmtPct(Math.floor(pst * 10) / 10, 1);

/** "Lula 50,12% · Flávio Bolsonaro 49,88%" (só candidatos reais; % de válidos de calc.ts). */
export function placarTexto(race: Pick<Race, 'candidatos'>, votos: number[]): string {
  return race.candidatos
    .map((c, i) => (c.agregado ? null : `${c.nomeUrna} ${fmtPct(pctValidos({ votos }, i))}`))
    .filter(Boolean)
    .join(' · ');
}

export interface ContextoAbr {
  race: Race;
  abr: Abr;
  /** true na abrangência da disputa (Brasil para Presidente; a UF para Governador). */
  principal: boolean;
}

export interface EventoGerado extends FeedEvent {
  /** true quando entra também no feed nacional da corrida (além do feed da UF). */
  nacional: boolean;
}

/**
 * Eventos entre dois estados da mesma abrangência. Puro (o limite de frequência por UF é aplicado por
 * `HistoricoCorrida`). `prev` null = primeira observação: não gera nada (não sabemos quando aconteceu).
 */
export function eventosEntre(prev: EstadoAbr | null, curr: EstadoAbr, ctx: ContextoAbr): EventoGerado[] {
  if (!prev) return [];
  const { race, abr, principal } = ctx;
  const out: EventoGerado[] = [];
  const pref = principal ? '' : `${nomeAbr(abr)}: `;
  const nome = (i: number) => race.candidatos[i]?.nomeUrna ?? `Candidato ${i + 1}`;
  const ev = (tipo: TipoEvento, chave: string, titulo: string, nacional: boolean, extra: Partial<FeedEvent> = {}): EventoGerado => ({
    id: `${race.id}:${abr}:${tipo}:${chave}`,
    t: curr.t,
    tipo,
    abrangencia: abr,
    race: race.id,
    titulo,
    nacional,
    ...extra,
  });

  // início
  if (principal && prev.st === 0 && curr.st > 0) {
    out.push(ev('inicio', '0', 'Começa a divulgação dos resultados', true, { detalhe: 'Primeiras seções totalizadas pelo TSE' }));
  }

  // marcos: só o mais alto atravessado neste poll
  const marcos: readonly number[] = principal ? MARCOS : race.abrangencia === 'BR' ? MARCOS_UF : [];
  const cruzado = [...marcos].reverse().find((m) => prev.pst < m && curr.pst >= m);
  if (cruzado !== undefined && curr.st > 0) {
    out.push(
      ev('marco', String(cruzado), `${pref}${cruzado}% das seções totalizadas`, principal, {
        detalhe: placarTexto(race, curr.votos),
      }),
    );
  }

  // liderança / virada
  if (curr.lider !== null && curr.lider !== prev.lider) {
    const virada = prev.lider !== null && curr.pst > PCT_VIRADA;
    const tipo: TipoEvento = virada ? 'virada' : 'lideranca';
    const verbo = prev.lider === null ? 'aparece à frente' : 'passa à frente';
    const titulo = `${pref}Com ${pctSecoes(curr.pst)} das seções totalizadas, ${nome(curr.lider)} ${verbo}`;
    if (principal) out.push(ev(tipo, `${curr.lider}@${curr.st}`, titulo, true, { candidato: curr.lider, detalhe: placarTexto(race, curr.votos) }));
    else if (virada) out.push(ev('virada', `${curr.lider}@${curr.st}`, titulo, true, { candidato: curr.lider, detalhe: placarTexto(race, curr.votos) }));
  }

  // eleição definida
  if (principal && curr.eleito !== null && prev.eleito === null) {
    const encerrada = curr.status === 'encerrada';
    out.push(
      ev('eleito', String(curr.eleito), `Eleição matematicamente definida: ${nome(curr.eleito)}`, true, {
        candidato: curr.eleito,
        detalhe: encerrada
          ? `Totalização concluída. ${placarTexto(race, curr.votos)}`
          : `Com ${pctSecoes(curr.pst)} das seções totalizadas, a diferença supera o eleitorado ainda não totalizado`,
      }),
    );
  }

  // UF encerrada (no feed nacional de Presidente; para Governador a UF é a própria disputa)
  if (abr !== 'BR' && prev.status !== 'encerrada' && curr.status === 'encerrada') {
    out.push(
      ev('uf-encerrada', abr, `${nomeAbr(abr)}: totalização concluída`, true, {
        detalhe: placarTexto(race, curr.votos),
        ...(curr.lider !== null ? { candidato: curr.lider } : {}),
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Histórico de uma corrida
// ---------------------------------------------------------------------------------------------

export interface HistoricoSerializado {
  v: 1;
  race: RaceId;
  /** chave usada para invalidar quando os códigos de eleição mudam */
  chave: string;
  estados: Partial<Record<Abr, EstadoAbr>>;
  series: Partial<Record<Abr, SeriePoint[]>>;
  eventos: FeedEvent[];
  eventosUf: Partial<Record<Abr, FeedEvent[]>>;
  ultimoLiderUf: Partial<Record<Abr, number>>;
  /** Summary compacto a cada mudança, por abrangência ("reveja a noite"). Opcional (históricos antigos). */
  resumos?: Partial<Record<Abr, ResumoCompacto[]>>;
  /** Summary compacto por município, chave `UF|cod` (ex.: "SP|71072"). Opcional. */
  municipios?: Record<string, ResumoCompacto[]>;
}

export class HistoricoCorrida {
  readonly race: Race;
  readonly chave: string;
  private estados = new Map<Abr, EstadoAbr>();
  private series = new Map<Abr, SeriePoint[]>();
  /** feed nacional da corrida (mais recentes primeiro) */
  private eventos: FeedEvent[] = [];
  /** feed por UF (mais recentes primeiro) */
  private eventosUf = new Map<Abr, FeedEvent[]>();
  private ultimoLiderUf = new Map<Abr, number>();
  private ids = new Set<string>();
  private resumos = new Map<Abr, ResumoCompacto[]>();
  private municipios = new Map<string, ResumoCompacto[]>();

  constructor(race: Race, chave: string) {
    this.race = race;
    this.chave = chave;
  }

  /**
   * Registra o estado de uma abrangência. Devolve os eventos novos.
   * @param t instante oficial (data/hora da última totalização do arquivo; ou relógio, se ausente)
   */
  registrar(abr: Abr, resumo: Summary, t: number, principal: boolean): FeedEvent[] {
    const curr = estadoDe(resumo, t);
    const prev = this.estados.get(abr) ?? null;
    this.estados.set(abr, curr);
    this.resumos.set(abr, acrescentar(this.resumos.get(abr) ?? [], compactarResumo(resumo, instanteResumo(resumo, t)), MAX_RESUMOS));

    // série: um ponto por mudança de seções totalizadas
    if (curr.st > 0 && (!prev || prev.st !== curr.st || !this.series.get(abr)?.length)) {
      const s = this.series.get(abr) ?? [];
      const p = pontoSerie(t, resumo);
      if (s.length && s[s.length - 1].t >= p.t) p.t = s[s.length - 1].t + 1; // monotônica
      s.push(p);
      if (s.length > MAX_PONTOS) this.series.set(abr, afinarSerie(s, MAX_PONTOS / 2));
      else this.series.set(abr, s);
    }

    const novos: FeedEvent[] = [];
    for (const e of eventosEntre(prev, curr, { race: this.race, abr, principal })) {
      if (this.ids.has(e.id)) continue;
      if (!principal && (e.tipo === 'virada' || e.tipo === 'lideranca')) {
        const ult = this.ultimoLiderUf.get(abr);
        if (ult !== undefined && e.t - ult < INTERVALO_LIDER_UF_MS) continue;
        this.ultimoLiderUf.set(abr, e.t);
      }
      const { nacional, ...evento } = e;
      this.ids.add(evento.id);
      if (abr !== 'BR') this.empilhar(this.eventosUf, abr, evento);
      if (nacional) this.eventos.unshift(evento);
      novos.push(evento);
    }
    if (this.eventos.length > MAX_EVENTOS) this.eventos.length = MAX_EVENTOS;
    return novos;
  }

  private empilhar(m: Map<Abr, FeedEvent[]>, abr: Abr, e: FeedEvent) {
    const l = m.get(abr) ?? [];
    l.unshift(e);
    if (l.length > MAX_EVENTOS) l.length = MAX_EVENTOS;
    m.set(abr, l);
  }

  estado(abr: Abr): EstadoAbr | null {
    return this.estados.get(abr) ?? null;
  }

  /** Summary da abrangência no instante t (o mais recente registrado com instante ≤ t), ou null. */
  resumoEm(abr: Abr, t: number): Summary | null {
    const l = this.resumos.get(abr);
    const i = l ? ultimoAte(l, t) : -1;
    return i >= 0 ? expandirResumo(l![i]) : null;
  }

  /** Registra o estado de um município (download do arquivo do município). Ignora repetições. */
  registrarMunicipio(uf: UF, cod: string, resumo: Summary, t: number): void {
    const k = `${uf}|${cod}`;
    const l = this.municipios.get(k) ?? [];
    const item = compactarResumo(resumo, instanteResumo(resumo, t));
    if (mesmosNumeros(l[l.length - 1], item)) return;
    this.municipios.set(k, acrescentar(l, item, MAX_RESUMOS_MUN));
  }

  /** Summary do município no instante t, ou null (nada registrado até t). */
  municipioEm(uf: UF, cod: string, t: number): Summary | null {
    const l = this.municipios.get(`${uf}|${cod}`);
    const i = l ? ultimoAte(l, t) : -1;
    return i >= 0 ? expandirResumo(l![i]) : null;
  }

  /** Série da abrangência até o instante t (inclusive), afinada para no máximo `max` pontos. */
  serieAte(abr: Abr, t: number, max = 480): SeriePoint[] {
    const s = (this.series.get(abr) ?? []).filter((p) => p.t <= t);
    return s.length > max ? afinarSerie(s, max) : s;
  }

  /** Feed nacional até o instante t (mais recentes primeiro). */
  eventosNacionaisAte(t: number, max = MAX_EVENTOS_SNAPSHOT): FeedEvent[] {
    return this.eventos.filter((e) => e.t <= t).slice(0, max);
  }

  /** Feed da UF até o instante t (mais recentes primeiro). */
  eventosDaUfAte(uf: UF, t: number, max = MAX_EVENTOS_SNAPSHOT): FeedEvent[] {
    return (this.eventosUf.get(uf) ?? []).filter((e) => e.t <= t).slice(0, max);
  }

  /** Série da abrangência (afinada para no máximo `max` pontos). */
  serie(abr: Abr, max = 480): SeriePoint[] {
    const s = this.series.get(abr) ?? [];
    return s.length > max ? afinarSerie(s, max) : s.slice();
  }

  /** Feed nacional da corrida (mais recentes primeiro). */
  eventosNacionais(max = MAX_EVENTOS_SNAPSHOT): FeedEvent[] {
    return this.eventos.slice(0, max);
  }

  /** Feed de uma UF: os eventos dela (para Governador, a própria disputa). */
  eventosDaUf(uf: UF, max = MAX_EVENTOS_SNAPSHOT): FeedEvent[] {
    return (this.eventosUf.get(uf) ?? []).slice(0, max);
  }

  exportar(): HistoricoSerializado {
    const obj = <T>(m: Map<Abr, T>) => Object.fromEntries(m) as Partial<Record<Abr, T>>;
    return {
      v: 1,
      race: this.race.id,
      chave: this.chave,
      estados: obj(this.estados),
      series: obj(this.series),
      eventos: this.eventos.slice(),
      eventosUf: obj(this.eventosUf),
      ultimoLiderUf: obj(this.ultimoLiderUf),
      resumos: obj(this.resumos),
      municipios: Object.fromEntries(this.municipios),
    };
  }

  /** Restaura (ignora se for de outra corrida/códigos). */
  importar(h: HistoricoSerializado): boolean {
    if (!h || h.v !== 1 || h.race !== this.race.id || h.chave !== this.chave) return false;
    const mapa = <T>(o: Partial<Record<Abr, T>> | undefined) => new Map(Object.entries(o ?? {}) as [Abr, T][]);
    this.estados = mapa(h.estados);
    this.series = mapa(h.series);
    this.eventos = (h.eventos ?? []).slice(0, MAX_EVENTOS);
    this.eventosUf = mapa(h.eventosUf);
    this.ultimoLiderUf = mapa(h.ultimoLiderUf);
    const valido = (l: unknown): l is ResumoCompacto[] =>
      Array.isArray(l) && l.every((x) => Array.isArray(x) && x.length >= CAMPOS_FIXOS && x.every((v) => typeof v === 'number'));
    this.resumos = new Map([...mapa(h.resumos)].filter(([, l]) => valido(l)));
    this.municipios = new Map(Object.entries(h.municipios ?? {}).filter(([, l]) => valido(l)));
    this.ids = new Set([...this.eventos, ...[...this.eventosUf.values()].flat()].map((e) => e.id));
    return true;
  }
}

/** Reduz a série a ~`max` pontos mantendo o primeiro, o último e espaçamento uniforme. */
export function afinarSerie(s: SeriePoint[], max: number): SeriePoint[] {
  return afinar(s, max);
}

function afinar<T>(s: T[], max: number): T[] {
  if (s.length <= max || max < 2) return s.slice();
  const out: T[] = [];
  const passo = (s.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(s[Math.round(i * passo)]);
  return out;
}
