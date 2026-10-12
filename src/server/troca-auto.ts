/**
 * Troca automática da fonte 'pre' → 'tse' no início da apuração (noite de 25/10/2026, 17h de Brasília).
 *
 * Quem decide o horário: TSE_INICIO (padrão INICIO_APURACAO) ou o admin (`AdminState.trocaAuto.adiadaPara`). Quem liga:
 * TSE_AUTO (padrão: só em produção) E o admin (`trocaAuto.ligada`, padrão true). A cada segundo:
 *
 *   1. desligada, já feita ou antes do horário → nada;
 *   2. no horário, fonte 'tse' (o admin trocou à mão) → marca como concluída; fonte 'simulacao' → não mexe
 *      ('nao-aplicavel', com aviso no log: o admin está ensaiando de propósito);
 *   3. fonte 'pre' → confere o feed (`TseManager.testar`: configuração geral + arquivo Brasil da eleição de Presidente
 *      do 2º turno, com tempo-limite). Respondeu → comando interno `troca-auto: executar` (fonte 'tse' + feita) e liga o
 *      polling. Não respondeu → continua 'pre', liga o aviso público discreto "aguardando os primeiros dados do TSE"
 *      (só enquanto o admin não tiver publicado um aviso próprio) e tenta de novo com espera crescente: 15 s, 30 s,
 *      60 s e depois a cada 120 s (com variação aleatória de até 20%, para várias instâncias não baterem juntas).
 *
 * Tudo vai para o log (horário chegou, cada tentativa, falha, sucesso). Várias instâncias com o mesmo STATE_DIR: cada
 * uma roda o seu agendador; a primeira que trocar grava o estado, e as outras o adotam (ou, se trocarem juntas, o
 * resultado é o mesmo). O estado do agendador (tentativas, aviso) é por processo e não é persistido.
 */
import type { TrocaAutoInfo } from '../shared/api';
import type { AdminState, TseConfig } from '../shared/types';
import type { Controller } from '../engine/api';
import { trocaAutoPadrao } from '../engine/state';
import { fmtDataHora, fmtHoraSeg } from '../shared/format';
import type { Logger } from './log';

export const AVISO_AGUARDANDO_TSE = 'Aguardando os primeiros dados do TSE. A apuração aparece aqui assim que o TSE publicar.';

/** Esperas entre tentativas (ms): 15 s, 30 s, 60 s e depois 120 s. */
export const ESPERAS_MS = [15_000, 30_000, 60_000, 120_000];
/** Tempo-limite da conferência do feed. */
export const VERIFICACAO_TIMEOUT_MS = 20_000;

export interface AgendadorOpcoes {
  controller: Controller;
  /** Liga o polling do TSE depois da troca. */
  sincronizar: (fonte: string, tse: TseConfig) => void;
  /** Confere o feed com a configuração do admin (nunca lança). */
  verificar: (tse: TseConfig) => Promise<{ ok: boolean; detalhe: string }>;
  habilitada: boolean;
  inicioPadrao: number;
  log: Logger;
  now?: () => number;
  /** Variação aleatória da espera (testes: () => 0). */
  aleatorio?: () => number;
  /** Intervalo do relógio do agendador (ms). Padrão 1 s. */
  tickMs?: number;
}

const quando = (ms: number) => `${fmtHoraSeg(ms)} de ${fmtDataHora(ms).slice(0, 5)} (Brasília)`;

export class AgendadorTse {
  private readonly now: () => number;
  private readonly aleatorio: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private verificando = false;
  private tentativas = 0;
  private ultimaTentativa: number | null = null;
  private proximaTentativa: number | null = null;
  private ultimoErro: string | null = null;
  private aguardando = false;
  /** Chave (horário|ligada|feita) da última vez que o horário chegou: zera as tentativas quando o admin muda algo. */
  private ciclo: string | null = null;
  private avisadoNaoAplicavel: string | null = null;
  private emCurso: Promise<void> | null = null;

  constructor(private readonly o: AgendadorOpcoes) {
    this.now = o.now ?? Date.now;
    this.aleatorio = o.aleatorio ?? Math.random;
  }

  iniciar(): void {
    if (this.timer) return;
    const s = this.estado();
    if (this.o.habilitada) {
      this.o.log.info(
        `Troca automática para o TSE: ${s.ligada ? `agendada para ${quando(this.inicio(s))}` : 'desligada no painel'}` +
          `${s.feitaEm !== null ? ` (já feita em ${quando(s.feitaEm)})` : ''}`,
      );
    } else this.o.log.info('Troca automática para o TSE: desabilitada (TSE_AUTO=0); a fonte só muda pelo painel');
    this.timer = setInterval(() => void this.tick(), this.o.tickMs ?? 1000);
    (this.timer as { unref?: () => void }).unref?.();
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private estado(st: AdminState = this.o.controller.state()) {
    return { ...trocaAutoPadrao(), ...st.trocaAuto };
  }

  private inicio(s = this.estado()): number {
    return s.adiadaPara ?? this.o.inicioPadrao;
  }

  /** Aviso público "aguardando os primeiros dados do TSE" no ar (o app mostra na faixa de aviso). */
  avisoPublico(): boolean {
    return this.aguardando;
  }

  private zerar() {
    this.tentativas = 0;
    this.ultimaTentativa = null;
    this.proximaTentativa = null;
    this.ultimoErro = null;
    this.aguardando = false;
  }

  /** Um passo do agendador (público para os testes). Resolve quando a eventual verificação termina. */
  tick(): Promise<void> {
    if (this.emCurso) return this.emCurso;
    const st = this.o.controller.state();
    const s = this.estado(st);
    const agora = this.now();
    const inicio = this.inicio(s);
    if (!this.o.habilitada || !s.ligada || s.feitaEm !== null || agora < inicio) {
      if (this.aguardando || this.tentativas) this.zerar();
      this.ciclo = null;
      return Promise.resolve();
    }
    const chave = `${inicio}|${s.ligada}`;
    if (this.ciclo !== chave) {
      this.ciclo = chave;
      this.zerar();
      this.o.log.info(`Troca automática para o TSE: horário chegou (${quando(inicio)}); fonte atual: ${st.fonte}`);
    }
    if (st.fonte === 'tse') {
      this.zerar();
      this.o.controller.command({ tipo: 'troca-auto', acao: 'concluir' });
      return Promise.resolve();
    }
    if (st.fonte !== 'pre') {
      if (this.avisadoNaoAplicavel !== chave) {
        this.avisadoNaoAplicavel = chave;
        this.o.log.aviso(
          `Troca automática para o TSE: no horário a fonte é "${st.fonte}", não "pre" — nada foi trocado. ` +
            'Troque a fonte no painel quando terminar (ou volte para "Pré-eleição" para a troca automática agir).',
        );
      }
      this.aguardando = false;
      return Promise.resolve();
    }
    if (this.proximaTentativa !== null && agora < this.proximaTentativa) return Promise.resolve();
    this.emCurso = this.tentar(st).finally(() => {
      this.emCurso = null;
    });
    return this.emCurso;
  }

  private async tentar(st: AdminState): Promise<void> {
    this.verificando = true;
    this.tentativas++;
    const n = this.tentativas;
    const t0 = this.now();
    this.ultimaTentativa = t0;
    let r: { ok: boolean; detalhe: string };
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      r = await Promise.race([
        this.o.verificar(st.tse),
        new Promise<{ ok: boolean; detalhe: string }>((res) => {
          timer = setTimeout(() => res({ ok: false, detalhe: `sem resposta do TSE em ${VERIFICACAO_TIMEOUT_MS / 1000} s` }), VERIFICACAO_TIMEOUT_MS);
          (timer as { unref?: () => void }).unref?.();
        }),
      ]).finally(() => clearTimeout(timer));
    } catch (e) {
      r = { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
    } finally {
      this.verificando = false;
    }
    // o estado pode ter mudado durante a verificação (admin desligou, trocou a fonte, outra instância já trocou)
    const atual = this.o.controller.state();
    const s = this.estado(atual);
    if (!this.o.habilitada || !s.ligada || s.feitaEm !== null || atual.fonte !== 'pre' || this.now() < this.inicio(s)) return;
    const ms = this.now() - t0;
    if (r.ok) {
      this.o.controller.command({ tipo: 'troca-auto', acao: 'executar' });
      const novo = this.o.controller.state();
      this.o.sincronizar(novo.fonte, novo.tse);
      this.o.log.info(`Troca automática para o TSE: FEITA na tentativa ${n} (feed respondeu em ${ms} ms: ${r.detalhe}). Fonte: tse (versão ${novo.versao})`);
      this.zerar();
      return;
    }
    const espera = Math.round(ESPERAS_MS[Math.min(n, ESPERAS_MS.length) - 1] * (1 + 0.2 * this.aleatorio()));
    this.proximaTentativa = this.now() + espera;
    this.ultimoErro = r.detalhe;
    if (!this.aguardando) this.o.log.aviso(`Troca automática para o TSE: aviso público "aguardando os primeiros dados do TSE" ligado`);
    this.aguardando = true;
    this.o.log.aviso(
      `Troca automática para o TSE: tentativa ${n} falhou (${r.detalhe}); a fonte continua "pre"; nova tentativa em ${Math.round(espera / 1000)} s`,
    );
  }

  info(): TrocaAutoInfo {
    const st = this.o.controller.state();
    const s = this.estado(st);
    const inicio = this.inicio(s);
    const agora = this.now();
    let estado: TrocaAutoInfo['estado'];
    if (!this.o.habilitada) estado = 'desabilitada';
    else if (s.feitaEm !== null) estado = 'feita';
    else if (!s.ligada) estado = 'desligada';
    else if (agora < inicio) estado = 'agendada';
    else if (st.fonte === 'simulacao') estado = 'nao-aplicavel';
    else if (this.verificando || this.tentativas === 0) estado = 'verificando';
    else estado = 'aguardando-tse';
    return {
      habilitada: this.o.habilitada,
      ligada: s.ligada,
      estado,
      inicio,
      inicioPadrao: this.o.inicioPadrao,
      adiada: s.adiadaPara !== null,
      feitaEm: s.feitaEm,
      tentativas: this.tentativas,
      ultimaTentativa: this.ultimaTentativa,
      proximaTentativa: this.proximaTentativa,
      ultimoErro: this.ultimoErro,
      avisoPublico: this.aguardando,
    };
  }
}
