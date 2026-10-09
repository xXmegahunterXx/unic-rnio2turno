/**
 * Cliente local do build demo (site 100% estático): implementa `ApuracaoClient` com o motor de simulação
 * rodando num Web Worker (src/app/data/worker.ts), via RPC por postMessage. Protocolo em src/engine/host.ts.
 *
 *  - Dataset: o Worker baixa `data/meta.json` e `data/uf/*.json` relativos a `assetBase()` (funciona em
 *    qualquer subcaminho). Se o Worker não puder ser criado ou falhar antes de ficar pronto, o mesmo motor
 *    roda na thread principal (import dinâmico) — mesma interface.
 *  - Sincronização entre abas: o AdminState fica em localStorage ('sintonia:admin-state') e é propagado por
 *    BroadcastChannel('sintonia-admin') (com o evento `storage` como reserva). O relógio é ancorado no tempo
 *    de parede, então todas as abas mostram o mesmo instante. Sem laços: estados recebidos de outra aba vão
 *    para o motor com `setState` (que não reemite) e não são regravados nem retransmitidos; só o estado mais
 *    novo vence (versao, depois ancoraWall, depois desempate determinístico).
 *  - Um estado salvo "abandonado" (padrão nunca alterado há > 30 min, ou qualquer estado há > 12 h) é
 *    descartado: quem abre o demo depois vê a simulação desde o começo.
 *  - Admin: login local com a senha 'sintonia' (sessionStorage). Sem login, os métodos do admin lançam um
 *    erro com `status = 401`.
 *  - Falha ao carregar o dataset (ou o Worker cair): as chamadas pendentes são rejeitadas com mensagem clara
 *    e a próxima chamada (≥ 3 s depois — o React Query refaz sozinho) reinicia o motor.
 */
import type { AdminCommand, AdminSnapshot, ApuracaoClient, PublicMeta } from '@/shared/api';
import type {
  AdminState,
  LiveStatus,
  MunicipioSnapshot,
  NationalSnapshot,
  PresetInfo,
  RaceId,
  SecaoDetalhe,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from '@/shared/types';
import { CommandError, NotFoundError } from '@/engine/api';
import type { HostError, HostIn, HostMethod, HostOut } from '@/engine/host';
import { estadoMaisNovo } from '@/engine/sync';
import { assetBase } from '@/app/lib/assets';

export const STORAGE_KEY = 'sintonia:admin-state';
export const CHANNEL_NAME = 'sintonia-admin';
const AUTH_KEY = 'sintonia:admin-auth';
const SENHA_DEMO = 'sintonia';
const PRISTINO_MAX_MS = 30 * 60_000;
const ESTADO_MAX_MS = 12 * 3600_000;

/** Erro de autenticação do admin local (mesmo `status` que o servidor HTTP devolveria). */
export class NaoAutorizadoError extends Error {
  readonly status = 401;
  constructor(msg = 'Faça login para acessar o painel de simulação.') {
    super(msg);
    this.name = 'UnauthorizedError';
  }
}

function reconstroiErro(e: HostError): Error {
  if (e.name === 'NotFoundError') return new NotFoundError(e.message);
  if (e.name === 'CommandError') return new CommandError(e.message);
  const err = new Error(e.message) as Error & { status?: number };
  err.name = e.name;
  if (e.status !== undefined) err.status = e.status;
  return err;
}

// ---- armazenamento (tudo protegido: modo privado, cookies bloqueados etc.) --------------------------
function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, v);
  } catch {
    /* sem persistência: segue só em memória */
  }
}
function ssGet(key: string): string | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function ssSet(key: string, v: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (v === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, v);
  } catch {
    /* ignora */
  }
}

function pareceEstado(v: unknown): v is AdminState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<AdminState>;
  return (
    typeof s.versao === 'number' &&
    !!s.relogio &&
    typeof s.relogio === 'object' &&
    typeof s.relogio.ancoraWall === 'number' &&
    typeof s.fonte === 'string' &&
    !!s.cenario
  );
}

/** a é mais novo que b? (ordem total compartilhada com o motor: versao → ancoraWall → JSON) */
const maisNovo = estadoMaisNovo;

/**
 * Estado inicial a partir do localStorage. Retorna o estado salvo, um estado parcial (só `versao`, para
 * reiniciar a simulação com versão maior que a das abas antigas) ou null (padrão do demo).
 */
function estadoInicial(): AdminState | null {
  const raw = lsGet(STORAGE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as unknown;
    if (!pareceEstado(s)) return null;
    const idade = Date.now() - s.relogio.ancoraWall;
    if ((s.versao <= 1 && idade > PRISTINO_MAX_MS) || idade > ESTADO_MAX_MS) {
      // reinicia com o padrão do demo, mas com versão maior (as outras abas aceitam)
      return { versao: s.versao + 1 } as AdminState;
    }
    return s;
  } catch {
    return null;
  }
}

interface Pendente {
  msg: Extract<HostIn, { type: 'call' }>;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/** Ponte com o motor (Worker ou, em último caso, thread principal). */
class Ponte {
  private enviar: ((m: HostIn) => void) | null = null;
  private pendentes = new Map<number, Pendente>();
  private seq = 0;
  private pronto = false;
  private fatal: Error | null = null;
  private fatalEm = 0;
  private emFallback = false;
  private worker: Worker | null = null;
  /** geração do motor: respostas de um motor descartado são ignoradas */
  private geracao = 0;
  /** último estado conhecido (local ou remoto) — base da deduplicação */
  private ultimo: AdminState | null;
  /** estado a mandar no init (pode ser parcial: só versao) */
  private estadoInit: AdminState | null;
  private canal: BroadcastChannel | null = null;

  constructor() {
    const ini = estadoInicial();
    this.estadoInit = ini;
    this.ultimo = ini && pareceEstado(ini) ? ini : null;
    this.iniciaSync();
    this.iniciaWorker();
  }

  private msgInit(): HostIn {
    return { type: 'init', base: assetBase(), modo: 'demo', state: this.ultimo ?? this.estadoInit };
  }

  private iniciaWorker(): void {
    const ger = ++this.geracao;
    let w: Worker;
    try {
      w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'sintonia-motor' });
    } catch (e) {
      console.warn('[sintonia] Web Worker indisponível; o motor vai rodar na thread principal.', e);
      void this.fallback();
      return;
    }
    this.worker = w;
    const falhou = (motivo: string) => {
      if (ger !== this.geracao) return;
      if (this.pronto) {
        // o Worker caiu depois de pronto (ex.: falta de memória): falha as chamadas; a próxima reinicia
        this.falhaGeral(new Error(`o motor parou (${motivo})`));
        return;
      }
      if (this.emFallback) return;
      console.warn(`[sintonia] Falha no Web Worker (${motivo}); o motor vai rodar na thread principal.`);
      w.terminate();
      this.worker = null;
      void this.fallback();
    };
    w.onmessage = (e: MessageEvent<HostOut>) => {
      if (ger === this.geracao) this.recebe(e.data);
    };
    w.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      falhou(e.message || 'erro');
    };
    w.onmessageerror = () => falhou('mensagem inválida');
    this.enviar = (m) => w.postMessage(m);
    this.enviar(this.msgInit());
  }

  private async fallback(): Promise<void> {
    if (this.emFallback) return;
    this.emFallback = true;
    this.enviar = null;
    const ger = ++this.geracao;
    try {
      const { createEngineHost, fetchJsonLoader } = await import('@/engine/host');
      const handle = createEngineHost((m) => {
        if (ger === this.geracao) this.recebe(m);
      }, fetchJsonLoader);
      // assíncrono, como num Worker (não reentra no chamador)
      this.enviar = (m) => {
        setTimeout(() => void handle(m), 0);
      };
      this.enviar(this.msgInit());
      for (const p of this.pendentes.values()) this.enviar(p.msg);
    } catch (e) {
      this.falhaGeral(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** Falha o motor atual: rejeita as chamadas pendentes; a próxima chamada (após 3 s) tenta reiniciar. */
  private falhaGeral(err: Error): void {
    this.fatal = new Error(`Não foi possível carregar a simulação: ${err.message}`);
    this.fatalEm = Date.now();
    this.geracao++;
    this.worker?.terminate();
    this.worker = null;
    this.enviar = null;
    for (const p of this.pendentes.values()) p.reject(this.fatal);
    this.pendentes.clear();
  }

  private reinicia(): void {
    this.fatal = null;
    this.pronto = false;
    this.emFallback = false;
    this.iniciaWorker();
  }

  private recebe(m: HostOut): void {
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'ready':
        this.pronto = true;
        this.adotaLocal(m.state);
        break;
      case 'state':
        this.adotaLocal(m.state);
        break;
      case 'reply': {
        const p = this.pendentes.get(m.id);
        if (!p) return;
        this.pendentes.delete(m.id);
        if (m.ok) p.resolve(m.result);
        else p.reject(reconstroiErro(m.error));
        break;
      }
      case 'fatal':
        this.falhaGeral(reconstroiErro(m.error));
        break;
    }
  }

  /**
   * Estado produzido pelo motor DESTA aba (pronto ou comando). Se já conhecemos um estado mais novo (de outra
   * aba), o motor é que está atrasado: reenviamos o mais novo. Senão, persiste e propaga.
   */
  private adotaLocal(s: AdminState): void {
    if (this.ultimo && maisNovo(this.ultimo, s)) {
      this.enviar?.({ type: 'setState', state: this.ultimo });
      return;
    }
    this.ultimo = s;
    const json = JSON.stringify(s);
    const salvo = lsGet(STORAGE_KEY);
    if (salvo === json) return;
    let salvoMaisNovo = false;
    try {
      const o = salvo ? (JSON.parse(salvo) as unknown) : null;
      salvoMaisNovo = pareceEstado(o) && maisNovo(o, s);
    } catch {
      /* conteúdo inválido: sobrescreve */
    }
    if (!salvoMaisNovo) lsSet(STORAGE_KEY, json);
    try {
      this.canal?.postMessage({ type: 'state', state: s });
    } catch {
      /* ignora */
    }
  }

  /** Estado vindo de outra aba: aplica só se for mais novo. Não regrava nem retransmite. */
  private recebeRemoto(s: unknown): void {
    if (!pareceEstado(s)) return;
    if (this.ultimo) {
      if (!maisNovo(s, this.ultimo)) return;
    } else if (this.estadoInit && s.versao < this.estadoInit.versao) return; // reinício em curso
    this.ultimo = s;
    this.enviar?.({ type: 'setState', state: s });
    // garante que o localStorage guarde o mais novo (comandos simultâneos em duas abas); sem retransmitir
    try {
      const salvo = lsGet(STORAGE_KEY);
      const o = salvo ? (JSON.parse(salvo) as unknown) : null;
      if (!pareceEstado(o) || maisNovo(s, o)) lsSet(STORAGE_KEY, JSON.stringify(s));
    } catch {
      lsSet(STORAGE_KEY, JSON.stringify(s));
    }
  }

  private iniciaSync(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.canal = new BroadcastChannel(CHANNEL_NAME);
        this.canal.onmessage = (e: MessageEvent) => {
          const d = e.data as { type?: string; state?: unknown } | null;
          if (d && d.type === 'state') this.recebeRemoto(d.state);
        };
      } catch {
        this.canal = null;
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try {
          this.recebeRemoto(JSON.parse(e.newValue));
        } catch {
          /* ignora */
        }
      });
    }
  }

  call<T>(method: HostMethod, args: unknown[] = []): Promise<T> {
    if (this.fatal) {
      if (Date.now() - this.fatalEm < 3000) return Promise.reject(this.fatal);
      this.reinicia(); // falha transitória (rede, Worker caiu): tenta de novo
    }
    return new Promise<T>((resolve, reject) => {
      const id = ++this.seq;
      const msg: Extract<HostIn, { type: 'call' }> = { type: 'call', id, method, args };
      this.pendentes.set(id, { msg, resolve: resolve as (v: unknown) => void, reject });
      this.enviar?.(msg);
    });
  }
}

export function createLocalClient(): ApuracaoClient {
  const ponte = new Ponte();
  let autenticado = ssGet(AUTH_KEY) === '1';
  const exigeLogin = () => {
    if (!autenticado) throw new NaoAutorizadoError();
  };

  return {
    status: () => ponte.call<LiveStatus>('status'),
    meta: () => ponte.call<PublicMeta>('meta'),
    nacional: (race: RaceId) => ponte.call<NationalSnapshot>('nacional', [race]),
    uf: (race: RaceId, uf: UF) => ponte.call<UfSnapshot>('uf', [race, uf]),
    municipio: (race: RaceId, uf: UF, cod: string) => ponte.call<MunicipioSnapshot>('municipio', [race, uf, cod]),
    zona: (race: RaceId, uf: UF, cod: string, zona: number) => ponte.call<ZonaSnapshot>('zona', [race, uf, cod, zona]),
    async secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number): Promise<SecaoDetalhe | null> {
      try {
        return await ponte.call<SecaoDetalhe | null>('secao', [race, uf, cod, zona, secao]);
      } catch (e) {
        if (e instanceof NotFoundError) return null;
        throw e;
      }
    },
    admin: {
      async login(senha: string) {
        autenticado = senha === SENHA_DEMO;
        ssSet(AUTH_KEY, autenticado ? '1' : null);
        return autenticado;
      },
      async logout() {
        autenticado = false;
        ssSet(AUTH_KEY, null);
      },
      async state() {
        exigeLogin();
        return ponte.call<AdminSnapshot>('adminSnapshot');
      },
      async command(cmd: AdminCommand) {
        exigeLogin();
        return ponte.call<AdminSnapshot>('command', [cmd]);
      },
      async presets() {
        exigeLogin();
        return ponte.call<PresetInfo[]>('presets');
      },
      async testarTse() {
        return {
          ok: false,
          detalhe:
            'Indisponível na demonstração: o site estático não tem servidor para consultar o feed oficial do TSE.',
        };
      },
    },
  };
}
