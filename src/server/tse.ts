/**
 * Ciclo de vida da fonte 'tse' no servidor (adaptador em src/tse):
 *  - o TseSource é criado sob demanda (troca de fonte para 'tse' ou "testar conexão");
 *  - polling só enquanto a fonte for 'tse'; ao sair, para (caches e histórico ficam);
 *  - a TseConfig acompanha o AdminState (comando 'tse'), inclusive o intervalo do arquivo prioritário (resumo
 *    nacional de Presidente, `intervaloPrioritarioSeg`);
 *  - `marca`/`frescor` expõem a marca dos números de cada corrida (ETag e `/api/status`);
 *  - a série/eventos do feed são persistidos em STATE_DIR/tse-historico.json (sobrevivem a reinícios);
 *  - leva 3: o teto de pedidos por segundo ao TSE vem da TseConfig (`limitePorSeg`, I03); `retomar()` encerra a pausa
 *    por bloqueio do TSE (comando `tse-retomar`); o `frescor` só leva `nacionalParadoDesde` (I18) com a chave
 *    'aviso-nacional' em 'auto' (lida a cada chamada por `avisoNacional`, sem reiniciar nada).
 */
import type { FrescorCorrida, ModoAvisoNacional, Race, TseConfig, UF } from '../shared/types';
import { TseSource, type FetchLike, type TseHealth } from '../tse';
import type { HistoricoSerializado } from '../tse';
import type { JsonStore } from './state-store';

export interface TseManagerOptions {
  races: Race[];
  nomeMunicipio?: (uf: UF, cod: string) => string | undefined;
  log: (msg: string) => void;
  /** Persistência do histórico (série/eventos). */
  historico?: JsonStore;
  /** Injetável (testes). */
  fetch?: FetchLike;
  now?: () => number;
  /** Fábrica alternativa (testes). */
  criar?: (config: TseConfig, historico: HistoricoSerializado[] | undefined) => TseSource;
  /**
   * Chave 'aviso-nacional' do painel (I18), lida a cada `frescor()`: 'off' tira `nacionalParadoDesde` do status público
   * (o detector segue rodando para o painel e os alertas). Ausente = 'auto'.
   */
  avisoNacional?: () => ModoAvisoNacional;
}

/** Resultado do "Retomar agora" (comando `tse-retomar`). */
export interface RetomadaTse {
  /** havia uma pausa e ela foi encerrada */
  retomou: boolean;
  detalhe: string;
}

export class TseManager {
  private src: TseSource | null = null;
  private timerHist: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: TseManagerOptions) {}

  get fonte(): TseSource | null {
    return this.src;
  }

  get ativo(): boolean {
    return !!this.src?.ativo;
  }

  /** Garante a instância com a config atual (sem iniciar o polling). */
  garantir(config: TseConfig): TseSource {
    if (!this.src) {
      const salvo = this.opts.historico?.ler();
      const historico = Array.isArray(salvo) ? (salvo as HistoricoSerializado[]) : undefined;
      this.src = this.opts.criar
        ? this.opts.criar(config, historico)
        : new TseSource({
            config,
            races: this.opts.races,
            log: this.opts.log,
            nomeMunicipio: this.opts.nomeMunicipio,
            historico,
            fetch: this.opts.fetch,
            now: this.opts.now,
            concorrencia: 8,
            workersMunicipios: 5,
          });
    } else {
      const atual = this.src.getConfig();
      const mudou = (Object.keys(config) as (keyof TseConfig)[]).some((k) => config[k] !== atual[k]);
      if (mudou) this.src.setConfig(config);
    }
    return this.src;
  }

  /** Sincroniza com o AdminState: liga o polling na fonte 'tse', desliga nas outras. */
  sincronizar(fonte: string, config: TseConfig): void {
    if (fonte === 'tse') {
      const s = this.garantir(config);
      if (!s.ativo) {
        s.start();
        this.agendarHistorico();
      }
    } else if (this.src?.ativo) {
      this.src.stop();
      this.salvarHistorico();
      this.pararHistorico();
    } else if (this.src) {
      this.garantir(config);
    }
  }

  async testar(config: TseConfig): Promise<{ ok: boolean; detalhe: string; amostra?: unknown }> {
    return this.garantir(config).testar();
  }

  health(): TseHealth | null {
    return this.src ? this.src.health() : null;
  }

  /** Marca dos números da corrida (muda quando o TSE publica dado novo); '0' sem a fonte criada. */
  marca(race: string): string {
    return this.src ? this.src.marca(race) : '0';
  }

  /** Frescor das corridas do 2º turno (`LiveStatus.frescor`); null sem a fonte criada. */
  frescor(): Partial<Record<string, FrescorCorrida>> | null {
    if (!this.src) return null;
    const fr = this.src.frescor();
    if ((this.opts.avisoNacional?.() ?? 'auto') === 'off') {
      for (const f of Object.values(fr)) if (f) delete f.nacionalParadoDesde;
    }
    return fr;
  }

  /**
   * "Retomar agora" (comando `tse-retomar` do painel): encerra a pausa por bloqueio do TSE antes da hora — para um falso
   * positivo. Sem pausa em curso, não faz nada. Nunca lança.
   */
  retomar(): RetomadaTse {
    const b = this.src?.retomar() ?? null;
    if (!b) return { retomou: false, detalhe: 'As leituras do TSE não estavam pausadas.' };
    return { retomou: true, detalhe: 'Leituras do TSE retomadas. Se o TSE voltar a limitar, a pausa recomeça sozinha.' };
  }

  private agendarHistorico() {
    if (this.timerHist || !this.opts.historico) return;
    this.timerHist = setInterval(() => this.salvarHistorico(), 30_000);
    (this.timerHist as { unref?: () => void }).unref?.();
  }

  private pararHistorico() {
    if (this.timerHist) clearInterval(this.timerHist);
    this.timerHist = null;
  }

  salvarHistorico() {
    const src = this.src;
    if (!src || !this.opts.historico) return;
    this.opts.historico.salvar(() => src.exportarHistorico());
  }

  /** Encerramento: para o polling e grava o histórico. */
  async encerrar(): Promise<void> {
    this.pararHistorico();
    if (this.src) {
      if (this.src.ativo) this.src.stop();
      this.salvarHistorico();
    }
    await this.opts.historico?.flush();
  }
}
