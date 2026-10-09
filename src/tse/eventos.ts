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
    this.ids = new Set([...this.eventos, ...[...this.eventosUf.values()].flat()].map((e) => e.id));
    return true;
  }
}

/** Reduz a série a ~`max` pontos mantendo o primeiro, o último e espaçamento uniforme. */
export function afinarSerie(s: SeriePoint[], max: number): SeriePoint[] {
  if (s.length <= max || max < 2) return s.slice();
  const out: SeriePoint[] = [];
  const passo = (s.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(s[Math.round(i * passo)]);
  return out;
}
