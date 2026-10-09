/**
 * Roteamento dos dados públicos por fonte:
 *  - 'pre' e 'simulacao' → controller do motor (src/engine);
 *  - 'tse' → adaptador do feed oficial (src/tse) para as corridas de 2º turno. As corridas de 1º turno
 *    (`-t1`) vêm sempre do dataset (resultado oficial final, sem depender da rede).
 *
 * Também calcula o "balde" do instante dos dados, que entra no ETag: enquanto o balde não muda, os números
 * não mudam (pausado, congelado, antes das 17h, encerrada, 1º turno…), e o cliente/CDN recebe 304.
 */
import type { PublicMeta } from '../shared/api';
import type {
  LiveStatus,
  MunicipioSnapshot,
  NationalSnapshot,
  Race,
  RaceId,
  SecaoDetalhe,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from '../shared/types';
import { NotFoundError, type Controller } from '../engine/api';
import type { TseManager } from './tse';

/** Balde do TSE: o feed é lido a cada ≥ 5 s, os municípios chegam em segundo plano. */
const BALDE_TSE_MS = 5_000;

export class Dados {
  private readonly races: Map<RaceId, Race>;

  constructor(
    readonly controller: Controller,
    private readonly tse: TseManager,
    private readonly now: () => number = Date.now,
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

  async nacional(race: RaceId): Promise<NationalSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().nacional(race) : this.controller.nacional(race);
  }

  async uf(race: RaceId, uf: UF): Promise<UfSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().uf(race, uf) : this.controller.uf(race, uf);
  }

  async municipio(race: RaceId, uf: UF, cod: string): Promise<MunicipioSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().municipio(race, uf, cod) : this.controller.municipio(race, uf, cod);
  }

  async zona(race: RaceId, uf: UF, cod: string, zona: number): Promise<ZonaSnapshot> {
    return this.fonteDe(race) === 'tse' ? this.tseSrc().zona(race, uf, cod, zona) : this.controller.zona(race, uf, cod, zona);
  }

  async secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number): Promise<SecaoDetalhe | null> {
    return this.fonteDe(race) === 'tse'
      ? this.tseSrc().secao(race, uf, cod, zona, secao)
      : this.controller.secao(race, uf, cod, zona, secao);
  }
}
