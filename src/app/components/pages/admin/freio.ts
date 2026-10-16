/**
 * Sinais de aperto do servidor (Monitor → "Freio de carga", I37): os mesmos limites dos alertas da noite (I16, frente
 * B) — processamento p99 acima de 1 s, 5xx acima de 1% e atraso do event loop acima de 300 ms — lidos das métricas do
 * último minuto fechado (`ServidorInfo.metricas`). Só orienta: o freio é sempre puxado à mão (sem modo automático
 * antes da noite). Puro, sem React.
 */
import type { MetricasServidor } from '@/shared/api';

export const LIMITE_P99_MS = 1000;
export const LIMITE_5XX = 0.01;
export const LIMITE_EVENT_LOOP_MS = 300;

export interface SinalAperto {
  id: 'p99' | '5xx' | 'eventLoop';
  rotulo: string;
  /** valor medido (ms ou fração 0–1) */
  valor: number;
  limite: number;
  unidade: 'ms' | 'fracao';
  apertado: boolean;
}

/** Fração de respostas 5xx no último minuto fechado (0 sem tráfego). */
export function fracao5xx(m: Pick<MetricasServidor, 'erros5xx' | 'reqPorSeg'>): number {
  const total = m.reqPorSeg * 60;
  if (!(total > 0) || !(m.erros5xx > 0)) return 0;
  return Math.min(1, m.erros5xx / total);
}

export function sinaisDeAperto(m: Pick<MetricasServidor, 'p99Ms' | 'erros5xx' | 'reqPorSeg' | 'eventLoopP99Ms'>): SinalAperto[] {
  const num = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const p99 = num(m.p99Ms);
  const f5xx = fracao5xx({ erros5xx: num(m.erros5xx), reqPorSeg: num(m.reqPorSeg) });
  const loop = num(m.eventLoopP99Ms);
  return [
    { id: 'p99', rotulo: 'Processamento (p99)', valor: p99, limite: LIMITE_P99_MS, unidade: 'ms', apertado: p99 > LIMITE_P99_MS },
    { id: '5xx', rotulo: 'Erros 5xx', valor: f5xx, limite: LIMITE_5XX, unidade: 'fracao', apertado: f5xx > LIMITE_5XX },
    { id: 'eventLoop', rotulo: 'Event loop (p99)', valor: loop, limite: LIMITE_EVENT_LOOP_MS, unidade: 'ms', apertado: loop > LIMITE_EVENT_LOOP_MS },
  ];
}
