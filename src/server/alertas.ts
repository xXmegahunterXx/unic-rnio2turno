/**
 * Alertas da noite no celular do dono (I16, leva 3): Telegram + batimento externo ("homem-morto").
 *
 * DESLIGADOS POR PADRÃO: só enviam com `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no .env (o batimento, com `HC_PING_URL`).
 * `ALERTAS=0` desliga tudo sem apagar os códigos. O contêiner de ensaio do update.sh (`SINTONIA_ENSAIO=1`) nunca envia.
 * Nada disso muda o que o visitante vê.
 *
 * A cada 15 s o servidor confere (tudo do próprio servidor; nenhum dado de visitante):
 *  - essenciais:
 *    · `placar-parado`: com a fonte TSE e a apuração em curso, o placar nacional de Presidente sem dado novo há mais de
 *      3 min (seções já totalizadas e o TSE sem dar a disputa como concluída), ou nenhuma leitura boa (200/304) há 3 min;
 *    · `tse-bloqueio`: o TSE está limitando as leituras (I03) — tudo pausado até HH:MM;
 *    · `tse-erros`: 3 ou mais erros seguidos ao ler o arquivo de Presidente (laço prioritário ou normal);
 *    · `servidor-erros`: 2 minutos seguidos com 5xx acima de 1% ou p99 acima de 1 s (com ≥ 60 requisições no minuto);
 *    · reinício do processo (uma mensagem a cada subida, com a versão);
 *  - extras: `nacional-parado` (I18: arquivo nacional do TSE parado com os estados andando), `troca-atrasada` (troca
 *    automática para o TSE esperando o feed há mais de 5 min depois do horário), `loop-lento` (atraso do laço de eventos
 *    acima de 300 ms em 2 conferências seguidas) e `memoria` (acima de 80% do limite do contêiner).
 *
 * Mensagens: até 200 caracteres, texto simples; cada tipo no máximo 1 vez a cada 10 min, e "resolvido" quando volta (só se
 * o aviso tinha saído). Envio com tempo-limite de 3 s, sem esperar a resposta (a conferência nunca trava). No máximo 20
 * mensagens por 10 min no total (rede de segurança contra enxurrada). O token e o endereço do batimento nunca vão ao log.
 *
 * Batimento: a cada 60 s um GET em `HC_PING_URL` (healthchecks.io, grátis): se o processo morrer ou travar, o serviço
 * externo avisa o dono pelos canais dele.
 *
 * `/api/saude-noite` (frente A2, saude-noite.ts) faz a avaliação dele com as mesmas fontes; `saude()` daqui só acrescenta
 * o que ele não confere (laço de eventos lento e memória), para o motivo não sair repetido.
 */
import { readFileSync } from 'node:fs';
import type { TrocaAutoInfo } from '../shared/api';
import { fmtHora, fmtHoraSeg, fmtInt, fmtPct } from '../shared/format';
import type { FonteDados, Fase, FrescorCorrida } from '../shared/types';
import type { FetchLike, TseHealth } from '../tse';
import type { ResumoMinuto } from './metrics';

/** Limites (exportados para os testes e o RUNBOOK). */
export const ALERTAS = {
  intervaloMs: 15_000,
  batimentoMs: 60_000,
  /** o mesmo tipo de alerta no máximo 1 vez neste intervalo */
  repeticaoMs: 10 * 60_000,
  /** rede de segurança: no máximo tantas mensagens por janela */
  maxMensagens: 20,
  janelaMensagensMs: 10 * 60_000,
  timeoutMs: 3_000,
  maxCaracteres: 200,
  placarParadoMs: 3 * 60_000,
  semLeituraMs: 3 * 60_000,
  falhasSeguidas: 3,
  minutosRuins: 2,
  minimoRequisicoes: 60,
  taxa5xx: 0.01,
  p99Ms: 1000,
  trocaAtrasadaMs: 5 * 60_000,
  loopMs: 300,
  loopConferencias: 2,
  memoriaFracao: 0.8,
} as const;

export type TipoAlerta =
  | 'placar-parado'
  | 'tse-bloqueio'
  | 'tse-erros'
  | 'servidor-erros'
  | 'nacional-parado'
  | 'troca-atrasada'
  | 'loop-lento'
  | 'memoria';

export const TIPOS_ALERTA: readonly TipoAlerta[] = [
  'tse-bloqueio',
  'tse-erros',
  'placar-parado',
  'nacional-parado',
  'servidor-erros',
  'troca-atrasada',
  'loop-lento',
  'memoria',
];

/** Rótulo curto de cada alerta (painel, log e a mensagem de "resolvido"). */
export const ROTULO_ALERTA: Record<TipoAlerta, string> = {
  'placar-parado': 'placar nacional parado',
  'tse-bloqueio': 'TSE limitando as leituras',
  'tse-erros': 'erros seguidos ao ler o TSE',
  'servidor-erros': 'erros ou lentidão no servidor',
  'nacional-parado': 'arquivo nacional do TSE parado',
  'troca-atrasada': 'troca automática para o TSE atrasada',
  'loop-lento': 'servidor engasgado',
  memoria: 'memória alta',
};

// ---------------------------------------------------------------------------------------------------
// Configuração (ambiente)
// ---------------------------------------------------------------------------------------------------

export interface ConfigAlertas {
  /** Telegram ligado (token e chat válidos e ALERTAS diferente de 0) */
  telegram: { token: string; chatId: string } | null;
  /** batimento externo (healthchecks.io) */
  batimentoUrl: string | null;
  /** problemas de configuração para o log (sem segredos) */
  avisos: string[];
}

type Env = Record<string, string | undefined>;

/** Lê e confere as variáveis dos alertas. Nunca devolve o token em `avisos`. */
export function configAlertas(env: Env): ConfigAlertas {
  const avisos: string[] = [];
  const desligado = /^(0|false|nao|não|off)$/i.test(env.ALERTAS?.trim() ?? '');
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const chat = env.TELEGRAM_CHAT_ID?.trim() ?? '';
  const hc = env.HC_PING_URL?.trim() ?? '';
  let telegram: ConfigAlertas['telegram'] = null;
  if (token || chat) {
    if (!token) avisos.push('Alertas: TELEGRAM_CHAT_ID definido sem TELEGRAM_BOT_TOKEN — alertas do Telegram desligados.');
    else if (!chat) avisos.push('Alertas: TELEGRAM_BOT_TOKEN definido sem TELEGRAM_CHAT_ID — alertas do Telegram desligados.');
    else if (!/^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(token))
      avisos.push('Alertas: TELEGRAM_BOT_TOKEN em formato inesperado (esperado "123456789:AA…", do @BotFather) — alertas do Telegram desligados.');
    else if (!/^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,})$/.test(chat))
      avisos.push('Alertas: TELEGRAM_CHAT_ID em formato inesperado (número, como 123456789 ou -100…, ou @canal) — alertas do Telegram desligados.');
    else telegram = { token, chatId: chat };
  }
  let batimentoUrl: string | null = null;
  if (hc) {
    let ok = false;
    try {
      const u = new URL(hc);
      ok = u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
    } catch {
      ok = false;
    }
    if (ok) batimentoUrl = hc;
    else avisos.push('Alertas: HC_PING_URL não é um endereço https válido — batimento externo desligado.');
  }
  if (desligado) {
    if (telegram || batimentoUrl) avisos.push('Alertas: ALERTAS=0 — Telegram e batimento externo desligados (os códigos continuam no .env).');
    return { telegram: null, batimentoUrl: null, avisos };
  }
  return { telegram, batimentoUrl, avisos };
}

/** Limite de memória do contêiner (cgroup v2 ou v1), em MB; null se não houver limite legível. */
export function limiteMemoriaMb(ler: (p: string) => string = (p) => readFileSync(p, 'utf8')): number | null {
  for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const v = ler(p).trim();
      if (!/^\d+$/.test(v)) continue;
      const mb = Number(v) / 1048576;
      // "sem limite" no cgroup v1 aparece como um número enorme
      if (Number.isFinite(mb) && mb > 0 && mb < 1024 * 1024) return Math.round(mb);
    } catch {
      /* arquivo ausente (fora de contêiner) */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Fontes e avaliação
// ---------------------------------------------------------------------------------------------------

/** De onde vem o que é conferido (tudo do próprio servidor). */
export interface FontesAlertas {
  /** fonte e fase pública (controller.status()) */
  status: () => { fonte: FonteDados; fase: Fase };
  /** saúde do adaptador do TSE (null = fonte TSE nunca criada) */
  tse: () => TseHealth | null;
  /** frescor das disputas (marca e última leitura boa) */
  frescor: () => Partial<Record<string, FrescorCorrida>> | null;
  /** último minuto fechado das métricas (Metricas.ultimoResumo) */
  minuto?: () => ResumoMinuto | null;
  /** troca automática para o TSE */
  trocaAuto?: () => Pick<TrocaAutoInfo, 'estado' | 'inicio'> | null;
  /** atraso do laço de eventos (p99, ms) */
  loopMs?: () => number;
  /** memória em uso e limite do contêiner (MB) */
  memoria?: () => { usadaMb: number; limiteMb: number | null };
}

interface Condicao {
  ativo: boolean;
  /** mensagem do alerta (≤ 200 caracteres) */
  texto?: string;
}

interface EstadoAlerta {
  ativo: boolean;
  desde: number | null;
  /** a mensagem desta ocorrência já saiu */
  avisado: boolean;
  ultimoEnvio: number | null;
  texto: string | null;
}

export interface AlertaAtivo {
  tipo: TipoAlerta;
  rotulo: string;
  desde: number;
  texto: string;
  avisado: boolean;
}

/** Situação dos alertas (log e painel; sem segredos). */
export interface InfoAlertas {
  telegram: boolean;
  batimento: boolean;
  envio: boolean;
  ativos: AlertaAtivo[];
  ultimoEnvio: { em: number; ok: boolean; tipo: string } | null;
  ultimoBatimento: { em: number; ok: boolean } | null;
}

export interface AlertasOpcoes {
  config: ConfigAlertas;
  fontes?: Partial<FontesAlertas>;
  log: { info: (m: string) => void; aviso: (m: string) => void };
  fetch?: FetchLike;
  now?: () => number;
  /** false = só avalia (ensaio do update.sh, testes); nada sai do servidor. Padrão true. */
  envio?: boolean;
  /** versão do build (mensagem de reinício) */
  versao?: string;
}

const PREFIXO = 'Sintonia: ';

/** Corta a mensagem em 200 caracteres (com reticências). */
export function cortar(txt: string, max: number = ALERTAS.maxCaracteres): string {
  const t = txt.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export class AlertasNoite {
  private readonly cfg: ConfigAlertas;
  private fontes: Partial<FontesAlertas>;
  private readonly log: AlertasOpcoes['log'];
  private readonly fetchImpl: FetchLike | null;
  private readonly now: () => number;
  private readonly envio: boolean;
  private readonly versao: string;

  private estados = new Map<TipoAlerta, EstadoAlerta>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private timerBatimento: ReturnType<typeof setInterval> | null = null;
  /** memória da avaliação: marca do placar nacional e desde quando não muda */
  private marca: string | null = null;
  private marcaDesde: number | null = null;
  private ultimoMinuto: ResumoMinuto | null = null;
  private minutosRuins = 0;
  private loopAlto = 0;
  private enviados: number[] = [];
  private ultimoEnvio: InfoAlertas['ultimoEnvio'] = null;
  private ultimoBatimento: InfoAlertas['ultimoBatimento'] = null;
  private falhaEnvioLogadaEm = -Infinity;
  private falhaBatimentoLogadaEm = -Infinity;
  private descartadosLogadosEm = -Infinity;
  private ultimoTeste = -Infinity;

  constructor(o: AlertasOpcoes) {
    this.cfg = o.config;
    this.fontes = { ...(o.fontes ?? {}) };
    this.log = o.log;
    const f = o.fetch ?? (typeof fetch === 'function' ? (fetch.bind(globalThis) as FetchLike) : null);
    this.fetchImpl = f;
    this.now = o.now ?? Date.now;
    this.envio = o.envio ?? true;
    this.versao = o.versao ?? 'dev';
    for (const t of TIPOS_ALERTA) this.estados.set(t, { ativo: false, desde: null, avisado: false, ultimoEnvio: null, texto: null });
  }

  /** Liga as fontes que só existem depois de criar o app (métricas, troca automática). */
  conectar(f: Partial<FontesAlertas>): void {
    this.fontes = { ...this.fontes, ...f };
  }

  get telegramLigado(): boolean {
    return !!this.cfg.telegram && this.envio;
  }

  /** Começa: mensagem de reinício, conferência a cada 15 s e batimento a cada 60 s. */
  iniciar(): void {
    if (this.timer) return;
    const partes = [
      this.telegramLigado ? 'Telegram ligado' : 'Telegram desligado (sem TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)',
      this.cfg.batimentoUrl && this.envio ? 'batimento externo ligado' : 'batimento externo desligado (sem HC_PING_URL)',
    ];
    this.log.info(`Alertas da noite: ${this.envio ? partes.join('; ') : 'só conferência (ensaio: nada é enviado)'}.`);
    if (this.telegramLigado) this.enviar(`${PREFIXO}o servidor (re)iniciou às ${fmtHoraSeg(this.now())} (versão ${this.versao}).`, 'reinicio');
    const conferir = () => {
      try {
        this.avaliar();
      } catch (e) {
        this.log.aviso(`Alertas: falha na conferência (${e instanceof Error ? e.message : String(e)})`);
      }
    };
    conferir(); // já marca o ponto de partida (marca do placar, minuto das métricas)
    this.timer = setInterval(conferir, ALERTAS.intervaloMs);
    (this.timer as { unref?: () => void }).unref?.();
    if (this.cfg.batimentoUrl && this.envio) {
      void this.bater();
      this.timerBatimento = setInterval(() => void this.bater(), ALERTAS.batimentoMs);
      (this.timerBatimento as { unref?: () => void }).unref?.();
    }
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.timerBatimento) clearInterval(this.timerBatimento);
    this.timer = null;
    this.timerBatimento = null;
  }

  /** Uma conferência (o laço de 15 s chama; público para os testes). Devolve os alertas ativos. */
  avaliar(): AlertaAtivo[] {
    const agora = this.now();
    const cond = this.condicoes(agora);
    for (const tipo of TIPOS_ALERTA) this.aplicar(tipo, cond[tipo], agora);
    return this.ativos();
  }

  /** Alertas em curso. */
  ativos(): AlertaAtivo[] {
    const out: AlertaAtivo[] = [];
    for (const tipo of TIPOS_ALERTA) {
      const e = this.estados.get(tipo)!;
      if (e.ativo && e.desde !== null) out.push({ tipo, rotulo: ROTULO_ALERTA[tipo], desde: e.desde, texto: e.texto ?? '', avisado: e.avisado });
    }
    return out;
  }

  /**
   * Para o `/api/saude-noite` (somado à avaliação do servidor HTTP): só o que aquela avaliação não confere — laço de
   * eventos lento e memória alta. null = nada a acrescentar.
   */
  saude(): { noite: 'ok' | 'atencao'; motivo?: string } | null {
    const extras = this.ativos().filter((a) => a.tipo === 'loop-lento' || a.tipo === 'memoria');
    if (!extras.length) return null;
    return { noite: 'atencao', motivo: extras.map((a) => a.rotulo).join(' · ') };
  }

  info(): InfoAlertas {
    return {
      telegram: this.telegramLigado,
      batimento: !!this.cfg.batimentoUrl && this.envio,
      envio: this.envio,
      ativos: this.ativos(),
      ultimoEnvio: this.ultimoEnvio,
      ultimoBatimento: this.ultimoBatimento,
    };
  }

  /** Mensagem de teste (comando `alerta-teste` do painel e `deploy/painel.sh`). Espera a resposta do Telegram (até 3 s). */
  async teste(): Promise<{ ok: boolean; detalhe: string }> {
    if (!this.envio) return { ok: false, detalhe: 'este processo é um ensaio do update.sh e não envia alertas.' };
    if (!this.cfg.telegram) {
      return {
        ok: false,
        detalhe:
          'os alertas estão desligados. Ponha TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env da VPS e reinicie (deploy/update.sh).',
      };
    }
    const agora = this.now();
    if (agora - this.ultimoTeste < 10_000) return { ok: false, detalhe: 'espere 10 s entre dois testes.' };
    this.ultimoTeste = agora;
    const r = await this.enviar(`${PREFIXO}alerta de teste do painel às ${fmtHoraSeg(agora)}. Se chegou, os alertas da noite funcionam.`, 'teste');
    return r.ok ? { ok: true, detalhe: 'mensagem de teste entregue ao Telegram.' } : { ok: false, detalhe: `o Telegram não aceitou a mensagem (${r.motivo}).` };
  }

  // -------------------------------------------------------------------------------------------------

  private condicoes(agora: number): Record<TipoAlerta, Condicao> {
    const L = ALERTAS;
    const st = this.fontes.status?.() ?? null;
    const tse = this.fontes.tse?.() ?? null;
    const fr = this.fontes.frescor?.() ?? null;
    const pres = tse?.corridas.find((c) => c.race === 'pres') ?? null;
    const apurando = st?.fonte === 'tse' && st.fase === 'apurando';
    const out = {} as Record<TipoAlerta, Condicao>;
    for (const t of TIPOS_ALERTA) out[t] = { ativo: false };

    // marca do placar nacional: desde quando não muda
    const marca = st?.fonte === 'tse' ? (fr?.pres?.marca ?? null) : null;
    if (!marca) {
      this.marca = null;
      this.marcaDesde = null;
    } else if (marca !== this.marca) {
      this.marca = marca;
      this.marcaDesde = agora;
    }

    // TSE limitando (I03): em qualquer fonte (a pausa vale também para o "testar conexão" e a troca automática)
    const b = tse?.bloqueio ?? null;
    if (b && b.ate > agora) {
      out['tse-bloqueio'] = {
        ativo: true,
        texto: `${PREFIXO}o TSE está limitando as leituras (${b.motivoTexto}). Tudo pausado até ${fmtHora(b.ate)}; se for engano, painel → Fonte → Retomar agora.`,
      };
    }

    if (apurando && tse) {
      const falhas = Math.max(pres?.falhasConsecutivas ?? 0, tse.prioritario?.falhasConsecutivas ?? 0);
      if (!out['tse-bloqueio'].ativo && tse.rodando && falhas >= L.falhasSeguidas) {
        const erro = (tse.prioritario?.erro ?? pres?.erro ?? '').slice(0, 60);
        out['tse-erros'] = { ativo: true, texto: `${PREFIXO}${falhas} erros seguidos ao ler o TSE${erro ? ` (${erro})` : ''}. O site mantém o último dado bom.` };
      }
      const conferido = fr?.pres?.conferidoEm ?? null;
      const andando = !!pres && pres.secoesTotalizadas > 0 && pres.status !== 'encerrada';
      if (out['tse-bloqueio'].ativo) {
        // pausa por bloqueio: o placar para por isso mesmo — o alerta do bloqueio já diz
      } else if (conferido !== null && agora - conferido > L.semLeituraMs) {
        out['placar-parado'] = {
          ativo: true,
          texto: `${PREFIXO}nenhuma leitura boa do TSE há ${minutos(agora - conferido)} min (a última às ${fmtHoraSeg(conferido)}). O placar do site está parado.`,
        };
      } else if (andando && this.marcaDesde !== null && agora - this.marcaDesde > L.placarParadoMs) {
        out['placar-parado'] = {
          ativo: true,
          texto: `${PREFIXO}placar nacional sem dado novo há ${minutos(agora - this.marcaDesde)} min (${fmtPct((100 * pres!.secoesTotalizadas) / Math.max(1, pres!.secoes))} das seções).`,
        };
      }
      const parado = pres?.nacionalParadoDesde ?? null;
      if (parado !== null) {
        out['nacional-parado'] = {
          ativo: true,
          texto: `${PREFIXO}o arquivo nacional do TSE não muda desde ${fmtHora(parado)} enquanto os estados andam. O site avisa (chave "aviso nacional").`,
        };
      }
    }

    // minutos ruins: 5xx > 1% ou p99 > 1 s (só minutos com tráfego de verdade)
    const m = this.fontes.minuto?.() ?? null;
    if (m && m !== this.ultimoMinuto) {
      this.ultimoMinuto = m;
      const ruim = m.requisicoes >= L.minimoRequisicoes && (m.erros5xx / m.requisicoes > L.taxa5xx || m.p99 > L.p99Ms);
      this.minutosRuins = ruim ? this.minutosRuins + 1 : 0;
      if (this.minutosRuins >= L.minutosRuins) {
        out['servidor-erros'] = {
          ativo: true,
          texto: `${PREFIXO}${this.minutosRuins} min seguidos com problemas: 5xx em ${fmtPct((100 * m.erros5xx) / Math.max(1, m.requisicoes), 1)} das requisições, p99 de ${fmtInt(m.p99)} ms. Veja painel → Monitor.`,
        };
      }
    } else if (this.minutosRuins >= L.minutosRuins) {
      // nenhum minuto novo fechado: mantém o estado (o texto já enviado segue valendo)
      out['servidor-erros'] = { ativo: true, texto: this.estados.get('servidor-erros')!.texto ?? undefined };
    }

    const troca = this.fontes.trocaAuto?.() ?? null;
    if (troca?.estado === 'aguardando-tse' && agora - troca.inicio > L.trocaAtrasadaMs) {
      out['troca-atrasada'] = {
        ativo: true,
        texto: `${PREFIXO}a troca automática para o TSE ainda espera o feed (${minutos(agora - troca.inicio)} min depois das ${fmtHora(troca.inicio)}). O site segue em "aguardando".`,
      };
    }

    const loop = this.fontes.loopMs?.();
    if (typeof loop === 'number' && Number.isFinite(loop)) {
      this.loopAlto = loop > L.loopMs ? this.loopAlto + 1 : 0;
      if (this.loopAlto >= L.loopConferencias) {
        out['loop-lento'] = { ativo: true, texto: `${PREFIXO}servidor engasgado: o laço de eventos está atrasando ${fmtInt(loop)} ms. Veja painel → Monitor.` };
      }
    }

    const mem = this.fontes.memoria?.();
    if (mem && mem.limiteMb && mem.usadaMb / mem.limiteMb > L.memoriaFracao) {
      out.memoria = {
        ativo: true,
        texto: `${PREFIXO}memória em ${fmtPct((100 * mem.usadaMb) / mem.limiteMb, 0)} do limite (${fmtInt(mem.usadaMb)} de ${fmtInt(mem.limiteMb)} MB).`,
      };
    }
    return out;
  }

  private aplicar(tipo: TipoAlerta, c: Condicao, agora: number) {
    const e = this.estados.get(tipo)!;
    const podeEnviar = e.ultimoEnvio === null || agora - e.ultimoEnvio >= ALERTAS.repeticaoMs;
    if (c.ativo) {
      if (!e.ativo) {
        e.ativo = true;
        e.desde = agora;
        e.avisado = false;
        this.log.aviso(`Alerta: ${ROTULO_ALERTA[tipo]} — ${(c.texto ?? '').replace(PREFIXO, '')}`);
      }
      if (c.texto) e.texto = c.texto;
      if (!e.avisado && podeEnviar && e.texto) {
        e.avisado = true;
        e.ultimoEnvio = agora;
        if (this.telegramLigado) this.enviar(e.texto, tipo);
      }
      return;
    }
    if (!e.ativo) return;
    const durou = e.desde !== null ? agora - e.desde : 0;
    this.log.info(`Alerta resolvido: ${ROTULO_ALERTA[tipo]} (durou ${minutosOuSegundos(durou)})`);
    if (e.avisado && this.telegramLigado) {
      this.enviar(`${PREFIXO}resolvido — ${ROTULO_ALERTA[tipo]} (às ${fmtHoraSeg(agora)}, depois de ${minutosOuSegundos(durou)}).`, `${tipo}:resolvido`);
    }
    e.ativo = false;
    e.desde = null;
    e.avisado = false;
    e.texto = null;
  }

  /** Envia ao Telegram (sem esperar quem chamou; a promessa serve ao teste). Nunca lança. */
  private enviar(texto: string, tipo: string): Promise<{ ok: boolean; motivo: string }> {
    const tg = this.cfg.telegram;
    if (!tg || !this.envio || !this.fetchImpl) return Promise.resolve({ ok: false, motivo: 'desligado' });
    const agora = this.now();
    this.enviados = this.enviados.filter((t) => agora - t < ALERTAS.janelaMensagensMs);
    if (this.enviados.length >= ALERTAS.maxMensagens && tipo !== 'teste') {
      if (agora - this.descartadosLogadosEm > ALERTAS.janelaMensagensMs) {
        this.descartadosLogadosEm = agora;
        this.log.aviso(`Alertas: mais de ${ALERTAS.maxMensagens} mensagens em 10 min — as próximas ficam só no log até a janela passar.`);
      }
      return Promise.resolve({ ok: false, motivo: 'limite de mensagens' });
    }
    this.enviados.push(agora);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ALERTAS.timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    const corpo = JSON.stringify({ chat_id: tg.chatId, text: cortar(texto), disable_web_page_preview: true });
    return this.fetchImpl(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: corpo,
      signal: ctrl.signal,
    })
      .then(async (res) => {
        try {
          await res.arrayBuffer();
        } catch {
          /* corpo ilegível: só o status importa */
        }
        return res.ok ? { ok: true, motivo: 'ok' } : { ok: false, motivo: `HTTP ${res.status}` };
      })
      .catch((err: unknown) => ({ ok: false, motivo: ctrl.signal.aborted ? 'sem resposta em 3 s' : `falha de rede (${err instanceof Error ? err.name : 'erro'})` }))
      .then((r) => {
        clearTimeout(timer);
        this.ultimoEnvio = { em: this.now(), ok: r.ok, tipo };
        if (!r.ok && this.now() - this.falhaEnvioLogadaEm > ALERTAS.repeticaoMs) {
          this.falhaEnvioLogadaEm = this.now();
          this.log.aviso(`Alertas: o Telegram não aceitou a mensagem "${tipo}" (${r.motivo}). Confira TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.`);
        }
        return r;
      });
  }

  /** Batimento externo (homem-morto). Nunca lança; a URL não vai ao log. */
  private async bater(): Promise<void> {
    const url = this.cfg.batimentoUrl;
    if (!url || !this.envio || !this.fetchImpl) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ALERTAS.timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    let ok = false;
    let motivo = '';
    try {
      const res = await this.fetchImpl(url, { method: 'GET', signal: ctrl.signal });
      try {
        await res.arrayBuffer();
      } catch {
        /* ignora */
      }
      ok = res.ok;
      motivo = `HTTP ${res.status}`;
    } catch {
      motivo = ctrl.signal.aborted ? 'sem resposta em 3 s' : 'falha de rede';
    } finally {
      clearTimeout(timer);
    }
    this.ultimoBatimento = { em: this.now(), ok };
    if (!ok && this.now() - this.falhaBatimentoLogadaEm > ALERTAS.repeticaoMs) {
      this.falhaBatimentoLogadaEm = this.now();
      this.log.aviso(`Alertas: o batimento externo (HC_PING_URL) falhou (${motivo}).`);
    }
  }
}

const minutos = (ms: number) => Math.max(1, Math.floor(ms / 60_000));
const minutosOuSegundos = (ms: number) => (ms >= 60_000 ? `${minutos(ms)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);
