/**
 * Rótulos, formatadores e utilidades do painel de simulação (admin). Puro: sem React.
 */
import type { AdminSnapshot } from '@/shared/api';
import type { ClockState, Fase, FonteDados, OrdemRegional, Ritmo } from '@/shared/types';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtInt } from '@/shared/format';
import type { IconName } from '@/app/ui';

/** 16:59:30 — instante em que "Iniciar"/"Reiniciar" põem o relógio (igual ao motor). */
export const INICIO_SIMULACAO = INICIO_APURACAO - 30_000;
/** A fase vira "encerrada" 5 min (simulados) depois de 100% (igual ao controller). */
export const ENCERRAMENTO_MS = 5 * 60_000;

export const VELOCIDADES = [1, 2, 5, 10, 20, 60, 120, 300] as const;

export const FONTE_ROTULO: Record<FonteDados, string> = {
  pre: 'Pré-eleição',
  simulacao: 'Simulação',
  tse: 'TSE ao vivo',
};

export const FONTE_ICONE: Record<FonteDados, IconName> = {
  pre: 'calendario',
  simulacao: 'play',
  tse: 'globo',
};

export const FASE_ROTULO: Record<Fase, string> = {
  pre: 'Antes das 17h',
  apurando: 'Apurando',
  encerrada: 'Encerrada',
};

export const RITMO_ROTULO: Record<Ritmo, string> = { rapido: 'Rápido', normal: 'Normal', lento: 'Lento' };

export const ORDEM_ROTULO: Record<OrdemRegional, string> = {
  realista: 'Realista (Sul e Sudeste primeiro)',
  aleatoria: 'Aleatória',
  'norte-primeiro': 'Norte e Nordeste primeiro',
  'sul-primeiro': 'Sul e Sudeste bem antes',
};

export type SecaoId = 'controle' | 'cenario' | 'estados' | 'comunicacao' | 'patrocinio' | 'fonte' | 'monitor';

export const SECOES: { id: SecaoId; rotulo: string; icone: IconName; descricao: string }[] = [
  { id: 'controle', rotulo: 'Controle', icone: 'ao-vivo', descricao: 'Relógio, linha do tempo e pré-visualização' },
  { id: 'cenario', rotulo: 'Cenário', icone: 'ajustes', descricao: 'Presets e parâmetros do modelo' },
  { id: 'estados', rotulo: 'Estados', icone: 'mapa', descricao: 'Viés e atraso por UF' },
  { id: 'comunicacao', rotulo: 'Comunicação', icone: 'alerta', descricao: 'Aviso global e congelamento' },
  { id: 'patrocinio', rotulo: 'Patrocínio', icone: 'selo', descricao: '“Oferecido por” (só anunciante não político)' },
  { id: 'fonte', rotulo: 'Fonte', icone: 'globo', descricao: 'Pré-eleição, simulação ou TSE' },
  { id: 'monitor', rotulo: 'Monitor', icone: 'grafico', descricao: 'Métricas e log operacional' },
];

export const ehSecao = (s: string | null): s is SecaoId => !!s && SECOES.some((x) => x.id === s);

/** simNow = ancoraSim + (rodando ? (wall − ancoraWall) × velocidade : 0) — mesma fórmula do motor. */
export const simNowDe = (c: ClockState, wall: number) => c.ancoraSim + (c.rodando ? (wall - c.ancoraWall) * c.velocidade : 0);

/**
 * Relógio da apuração AGORA, interpolado entre polls. `recebidoEm` = instante local em que o snapshot chegou;
 * a diferença para `status.wallNow` corrige o relógio do servidor (produção) — no demo é ~0.
 */
export function relogioAgora(snap: AdminSnapshot, recebidoEm: number, agora: number): number {
  const wallServidor = agora + (snap.status.wallNow - recebidoEm);
  if (snap.state.fonte !== 'simulacao') return wallServidor;
  return simNowDe(snap.state.relogio, wallServidor);
}

/** Instante dos DADOS (congelado → congeladoEm). */
export function instanteDados(snap: AdminSnapshot, simNow: number): number {
  return snap.state.congelado && snap.state.congeladoEm !== null ? snap.state.congeladoEm : simNow;
}

/** Início e fim da régua de tempo (16:59 → fim previsto + encerramento, arredondado a 15 min). */
export function dominioRegua(snap: AdminSnapshot): [number, number] {
  const ini = INICIO_APURACAO - 60_000;
  const fimBase = (snap.fimPrevisto ?? INICIO_APURACAO + 5 * 3600_000) + ENCERRAMENTO_MS;
  const q = 15 * 60_000;
  return [ini, Math.ceil(fimBase / q) * q];
}

/**
 * % de seções estimado num instante a partir dos marcos (interpolação linear entre eles).
 * Só para a prévia do cursor da linha do tempo; o número oficial vem do snapshot.
 */
export function pctNoInstante(snap: AdminSnapshot, t: number): number {
  const pts = [{ pct: 0, t: INICIO_APURACAO }, ...snap.marcos];
  if (t <= pts[0].t) return 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t <= b.t) return a.pct + ((t - a.t) / Math.max(1, b.t - a.t)) * (b.pct - a.pct);
  }
  return 100;
}

/** "2 h 14 min", "3 min 08 s", "12 s". */
export function fmtDuracao(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(r).padStart(2, '0')} s`;
  return `${r} s`;
}

/** Milissegundos com unidade: "842 ms", "1,24 s". */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${fmtInt(ms)} ms`;
  return `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
}

/** Número decimal pt-BR com casas fixas (para parâmetros do cenário). */
export function fmtDec(n: number, casas = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export const fmtVel = (v: number) => `${fmtInt(v)}×`;

/** Mensagem legível de um erro do cliente (HTTP ou local). */
export function mensagemErro(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Algo deu errado. Tente de novo.';
}

export const statusErro = (e: unknown): number | undefined =>
  e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : undefined;

export const naoAutorizado = (e: unknown) => statusErro(e) === 401;

/** URL de uma página pública: no demo (HashRouter) é o mesmo documento com hash; em produção, o caminho. */
export function urlPublica(caminho: string): string {
  if (__DEMO__ && typeof window !== 'undefined') return `${window.location.pathname}${window.location.search}#${caminho}`;
  return caminho;
}
