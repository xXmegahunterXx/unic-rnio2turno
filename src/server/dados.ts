/**
 * Roteamento dos dados públicos por fonte:
 *  - 'pre' e 'simulacao' → controller do motor (src/engine);
 *  - 'tse' → adaptador do feed oficial (src/tse) para as corridas de 2º turno. As corridas de 1º turno
 *    (`-t1`) vêm sempre do dataset (resultado oficial final, sem depender da rede).
 *
 * Zona e seção trazem o local de votação (`local`) em todas as fontes: o controller carrega os locais da UF
 * antes de responder, e na fonte 'tse' (o feed oficial não traz o local) eles são acrescentados aqui.
 *
 * Também calcula o "balde" do instante dos dados, que entra no ETag: enquanto o balde não muda, os números
 * não mudam (pausado, congelado, antes das 17h, encerrada, 1º turno…), e o cliente/CDN recebe 304.
 *
 * "Reveja a noite" (`?t=`, contrato `Instante`): `instante()` normaliza o t pedido — undefined quando a
 * resposta é a mesma do agora (1º turno, fonte 'pre', t ≥ instante atual dos dados, ou município/zona/seção na
 * fonte 'tse', que não têm histórico); senão o t truncado ao segundo. Instante futuro nunca é atendido: vira
 * o agora (mesmo ETag e mesmo cache curto do agora — a CDN nunca guarda "futuro" por muito tempo).
 */
import type { PublicMeta } from '../shared/api';
import type { MunicipiosBr } from '../shared/dataset';
import type {
  LiveStatus,
  MunicipioSnapshot,
  MunicipiosNacionalSnapshot,
  NationalSnapshot,
  Race,
  RaceId,
  SecaoDetalhe,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from '../shared/types';
import { INICIO_APURACAO } from '../shared/constants';
import { NotFoundError, type Controller } from '../engine/api';
import type { TseManager } from './tse';

/** Começo da "noite" para o `?t=` (= INICIO_SIMULACAO do motor): 30 s antes da divulgação. */
const INICIO_NOITE = INICIO_APURACAO - 30_000;
/** Balde do TSE: o feed é lido a cada ≥ 5 s, os municípios chegam em segundo plano. */
const BALDE_TSE_MS = 5_000;
/**
 * Um instante passado é "consolidado" (não muda mais; pode ir para a CDN por 1 h) quando está ao menos
 * esta margem atrás do agora. Simulação: 60 s simulados. TSE: 3 min de parede (o arquivo do TSE chega com até
 * ~1 min de atraso pelo CDN dele, mais o intervalo de polling e a fila de municípios).
 */
export const MARGEM_CONSOLIDADO_SIM_MS = 60_000;
export const MARGEM_CONSOLIDADO_TSE_MS = 180_000;

export type NivelApuracao = 'br' | 'uf' | 'mun' | 'zona' | 'secao' | 'brmun';

export interface InstanteNormalizado {
  /** t efetivo (truncado ao segundo) ou undefined = agora */
  t: number | undefined;
  /** true quando t está consolidado (pode ter cache longo, com a versão na URL) */
  consolidado: boolean;
}

/** Erro com status HTTP (o onError do app responde `{ erro }`). */
class ErroDados extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export class Dados {
  private readonly races: Map<RaceId, Race>;

  constructor(
    readonly controller: Controller,
    private readonly tse: TseManager,
    private readonly now: () => number = Date.now,
    /** Ordem do mapa nacional por município (municipios-br.json) para a fonte 'tse'; null se ausente. */
    private readonly ordemBr: () => MunicipiosBr | null = () => null,
  ) {
    this.races = new Map(controller.meta().races.map((r) => [r.id.toLowerCase(), r]));
  }

  meta(): PublicMeta {
    return this.controller.meta();
  }

  status(): LiveStatus {
    return this.controller.status();
  }

  race(id: RaceId): Race {
    const r = this.races.get(String(id).toLowerCase());
    if (!r) throw new NotFoundError(`Corrida desconhecida: "${id}". Disponíveis: ${[...this.races.keys()].join(', ')}.`);
    return r;
  }

  /** Fonte efetiva da corrida agora. */
  fonteDe(race: RaceId): 'motor' | 'tse' {
    const r = this.race(race);
    return r.turno === 2 && this.controller.status().fonte === 'tse' ? 'tse' : 'motor';
  }

  private tseSrc() {
    // normalmente já está rodando (o servidor sincroniza a cada comando); garante após restauração
    this.tse.sincronizar('tse', this.controller.state().tse);
    return this.tse.fonte!;
  }

  /** Instante atual dos DADOS (simulação: congelado → congeladoEm; TSE/pre: relógio de parede). */
  private agoraDados(s: LiveStatus): number {
    if (s.fonte !== 'simulacao') return this.now();
    if (s.congelado) {
      const c = this.controller.state().congeladoEm;
      if (c !== null && c !== undefined) return Math.min(c, s.simNow);
    }
    return s.simNow;
  }

  /** Normaliza o `?t=` pedido (ver o cabeçalho do arquivo). */
  instante(race: RaceId, t: number | undefined, nivel: NivelApuracao): InstanteNormalizado {
    const agora: InstanteNormalizado = { t: undefined, consolidado: false };
    if (t === undefined) return agora;
    const r = this.race(race);
    if (r.turno === 1) return agora;
    const s = this.controller.status();
    if (s.fonte === 'pre') return agora;
    const tse = this.fonteDe(race) === 'tse';
    if (tse && (nivel === 'mun' || nivel === 'zona' || nivel === 'secao')) return agora;
    const ref = this.agoraDados(s);
    // antes do começo da noite (16:59:30) o estado é sempre o mesmo (nada totalizado): um único instante/ETag, em
    // vez de um por segundo pedido (o motor limitaria igual, mas cada t viraria uma entrada de cache diferente)
    const tq = Math.max(INICIO_NOITE, Math.floor(t / 1000) * 1000);
    if (tq >= Math.floor(ref / 1000) * 1000) return agora;
    return { t: tq, consolidado: tq <= ref - (tse ? MARGEM_CONSOLIDADO_TSE_MS : MARGEM_CONSOLIDADO_SIM_MS) };
  }

  /** Balde de um instante passado (ETag). TSE recente: acompanha também o balde do agora (chegam dados). */
  baldeHistorico(race: RaceId, inst: InstanteNormalizado): string {
    const base = `h${Math.floor(inst.t! / 1000).toString(36)}`;
    return this.fonteDe(race) === 'tse' && !inst.consolidado ? `${base}-${this.balde(race)}` : base;
  }

  /** Identifica o estado dos dados (sem a versão do admin) para o ETag. */
  balde(race: RaceId): string {
    const r = this.race(race);
    if (r.turno === 1) return 't1';
    const s = this.controller.status();
    if (s.fonte === 'pre') return 'pre';
    if (s.fonte === 'tse') return `tse${Math.floor(this.now() / BALDE_TSE_MS)}`;
    if (s.congelado) return `c${this.controller.state().congeladoEm ?? 0}`;
    if (s.fase === 'pre') return 'zero';
    if (s.fase === 'encerrada') return 'fim';
    // 1 balde por segundo de parede (a 20×, 20 s simulados): os clientes consultam a cada 1,5–8 s, e a origem
    // não precisa remontar/comprimir a mesma rota 20×/s
    return `s${Math.floor(s.simNow / (1000 * Math.max(1, s.velocidade)))}`;
  }

  // `t` = instante JÁ normalizado por `instante()` (undefined = agora). Na fonte 'tse', município, zona e
  // seção não têm histórico: respondem sempre o agora.

  async nacional(race: RaceId, t?: number): Promise<NationalSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().nacional(race, t) : this.controller.nacional(race, t);
  }

  async uf(race: RaceId, uf: UF, t?: number): Promise<UfSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().uf(race, uf, t) : this.controller.uf(race, uf, t);
  }

  async municipio(race: RaceId, uf: UF, cod: string, t?: number): Promise<MunicipioSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().municipio(race, uf, cod) : this.controller.municipio(race, uf, cod, t);
  }

  async zona(race: RaceId, uf: UF, cod: string, zona: number, t?: number): Promise<ZonaSnapshot> {
    if (this.fonteDe(race) === 'tse') {
      const [z] = await Promise.all([this.tseSrc().zona(race, uf, cod, zona), this.locais(uf)]);
      const locais = this.controller.locaisDaZona?.(uf, z.cod, z.zona);
      if (!locais?.size) return z;
      // cópia: o objeto do adaptador pode ser reaproveitado internamente
      return { ...z, secoes: z.secoes.map((s) => (s.local || !locais.has(s.secao) ? s : { ...s, local: locais.get(s.secao) })) };
    }
    await this.locais(uf);
    return this.controller.zona(race, uf, cod, zona, t);
  }

  async secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number, t?: number): Promise<SecaoDetalhe | null> {
    if (this.fonteDe(race) === 'tse') {
      const [d] = await Promise.all([this.tseSrc().secao(race, uf, cod, zona, secao), this.locais(uf)]);
      if (!d || d.local) return d;
      const local = this.controller.locaisDaZona?.(uf, d.cod, d.zona)?.get(d.secao);
      return local ? { ...d, local } : d; // cópia: o boletim fica no cache do adaptador
    }
    await this.locais(uf);
    return this.controller.secao(race, uf, cod, zona, secao, t);
  }

  /**
   * Locais de votação da UF carregados ANTES de montar zona/seção (uma vez por UF, com cache no controller).
   * Sem isso, a 1ª resposta sairia sem `local` (o controller só dispara a leitura em segundo plano) e com o MESMO
   * ETag das seguintes — navegador e CDN revalidariam com 304 e ficariam sem a escola até a versão mudar.
   */
  private locais(uf: UF): Promise<boolean> {
    return this.controller.carregaLocais ? this.controller.carregaLocais(uf) : Promise.resolve(false);
  }

  /**
   * Mapa nacional por município. Fonte 'tse': municípios já baixados (os demais com apurado 0), na ordem de
   * municipios-br.json; sem esse arquivo → 503.
   */
  async municipiosBr(race: RaceId, t?: number): Promise<MunicipiosNacionalSnapshot> {
    if (this.fonteDe(race) !== 'tse') return this.controller.municipiosBr(race, t);
    const ordem = this.ordemBr();
    if (!ordem) throw new ErroDados(503, 'Mapa nacional por município indisponível: municipios-br.json ausente no servidor.');
    return this.tseSrc().municipiosBr(race, ordem, t);
  }
}
