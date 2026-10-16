/**
 * "Saúde da noite" (I16, frente A2): `GET /api/saude-noite` → `{ noite: 'ok' | 'atencao', motivo? }` para o monitor
 * externo (UptimeRobot, Better Stack…: palavra-chave `"noite":"ok"`). Sempre 200 e `no-store` (a Cloudflare não guarda:
 * regra 2, bypass) — um 503 aqui entraria na própria conta de 5xx e prenderia o estado em 'atencao' com pouco tráfego.
 *
 * O que vira 'atencao' (o primeiro motivo encontrado, nesta ordem; o resto vai junto, separado por " · "):
 *  1. servidor encerrando ou não pronto (`/readyz`);
 *  2. leitura do TSE limitada pelo próprio TSE (`frescor.tseBloqueadoAte`, frente B) — em qualquer fonte;
 *  3. só com a fonte 'tse' e a apuração em curso (fase pública 'apurando'):
 *     - leitura do TSE parada (fonte criada mas sem polling);
 *     - erros seguidos ao ler o arquivo de Presidente (≥ 3 no laço normal ou no prioritário);
 *     - nenhuma leitura boa do arquivo de Presidente há mais de 3 min;
 *     - placar nacional sem dado novo há mais de 3 min com seções já totalizadas e o TSE sem dar a disputa como
 *       concluída (a marca dos números não muda);
 *     - arquivo nacional parado com os estados andando (`frescor.nacionalParadoDesde`, I18, frente B);
 *  4. troca automática para o TSE esperando o feed há mais de 5 min depois do horário;
 *  5. 2 minutos seguidos com 5xx acima de 1% ou p99 acima de 1 s (com ao menos 60 requisições no minuto).
 *
 * Nada de dado de visitante: só contadores do próprio servidor e o estado do feed. Puro e testável (`avaliarSaude`);
 * `VigiaNoite` guarda o pouco de memória que a avaliação precisa (quando a marca mudou, minutos ruins seguidos).
 */
import { fmtHora } from '../shared/format';
import type { TrocaAutoInfo } from '../shared/api';
import type { Fase, FonteDados, FrescorCorrida } from '../shared/types';
import type { TseHealth } from '../tse';

export interface SaudeNoite {
  noite: 'ok' | 'atencao';
  /** Texto curto para o operador (sem dado de visitante). Ausente quando 'ok'. */
  motivo?: string;
}

/** Limites da avaliação (exportados para os testes e o RUNBOOK). */
export const SAUDE_NOITE = {
  /** placar nacional de Presidente sem dado novo por mais que isso, com a apuração em curso */
  paradoMs: 3 * 60_000,
  /** sem nenhuma leitura boa (200/304) do arquivo de Presidente por mais que isso */
  semLeituraMs: 3 * 60_000,
  /** falhas consecutivas ao ler o arquivo de Presidente */
  falhasSeguidas: 3,
  /** troca automática esperando o feed por mais que isso depois do horário */
  trocaAtrasadaMs: 5 * 60_000,
  /** minutos seguidos ruins (5xx > 1% ou p99 > 1 s) */
  minutosRuins: 2,
  /** um minuto só conta como ruim com pelo menos tantas requisições (evita alarme com tráfego quase nulo) */
  minimoRequisicoes: 60,
  taxa5xx: 0.01,
  p99Ms: 1000,
} as const;

export interface EntradaSaude {
  agora: number;
  encerrando: boolean;
  /** motivos do /readyz (vazio = pronto) */
  naoPronto: readonly string[];
  fonte: FonteDados;
  /** fase PÚBLICA (a do /api/status: na fonte TSE, 'encerrada' quando o TSE conclui as disputas) */
  fase: Fase;
  tse: Pick<TseHealth, 'rodando' | 'corridas' | 'prioritario'> | null;
  /** frescor de todas as disputas na fonte TSE (`LiveStatus.frescor`) */
  frescor: Partial<Record<string, FrescorCorrida>> | null | undefined;
  /** desde quando a marca do placar nacional de Presidente não muda (VigiaNoite); null = desconhecido */
  presParadoDesde: number | null;
  trocaAuto: Pick<TrocaAutoInfo, 'estado' | 'inicio'> | null;
  /** minutos seguidos com 5xx > 1% ou p99 > 1 s (VigiaNoite) */
  minutosRuins: number;
}

const min = (ms: number) => Math.max(1, Math.floor(ms / 60_000));

/** Avaliação pura (ver o cabeçalho do arquivo). */
export function avaliarSaude(e: EntradaSaude): SaudeNoite {
  const L = SAUDE_NOITE;
  const motivos: string[] = [];
  if (e.encerrando) motivos.push('servidor encerrando (reinício em andamento)');
  else if (e.naoPronto.length) motivos.push(`servidor não pronto: ${e.naoPronto.join(', ')}`);

  const fr = e.frescor ?? {};
  const bloqueado = Object.values(fr).reduce<number>((m, f) => Math.max(m, f?.tseBloqueadoAte ?? 0), 0);
  if (bloqueado > e.agora) motivos.push(`TSE limitando as leituras; nova tentativa às ${fmtHora(bloqueado)}`);

  if (e.fonte === 'tse' && e.fase === 'apurando') {
    const pres = e.tse?.corridas.find((c) => c.race === 'pres') ?? null;
    if (!e.tse || !e.tse.rodando) motivos.push('leitura do TSE parada');
    else {
      const falhas = Math.max(pres?.falhasConsecutivas ?? 0, e.tse.prioritario?.falhasConsecutivas ?? 0);
      if (falhas >= L.falhasSeguidas) motivos.push(`${falhas} erros seguidos ao ler o TSE`);
      const conferido = fr.pres?.conferidoEm ?? null;
      if (conferido !== null && e.agora - conferido > L.semLeituraMs) motivos.push(`nenhuma leitura boa do TSE há ${min(e.agora - conferido)} min`);
      const andando = !!pres && pres.secoesTotalizadas > 0 && pres.status !== 'encerrada';
      if (andando && e.presParadoDesde !== null && e.agora - e.presParadoDesde > L.paradoMs)
        motivos.push(`placar nacional sem dado novo há ${min(e.agora - e.presParadoDesde)} min`);
    }
    const parado = Object.values(fr).reduce<number>(
      (m, f) => (f?.nacionalParadoDesde ? (m ? Math.min(m, f.nacionalParadoDesde) : f.nacionalParadoDesde) : m),
      0,
    );
    if (parado) motivos.push(`arquivo nacional do TSE sem atualizar desde ${fmtHora(parado)} (estados andando)`);
  }

  if (e.trocaAuto?.estado === 'aguardando-tse' && e.agora - e.trocaAuto.inicio > L.trocaAtrasadaMs)
    motivos.push(`troca automática para o TSE aguardando o feed há ${min(e.agora - e.trocaAuto.inicio)} min`);

  if (e.minutosRuins >= L.minutosRuins) motivos.push(`${e.minutosRuins} min seguidos com erros 5xx acima de 1% ou p99 acima de 1 s`);

  return motivos.length ? { noite: 'atencao', motivo: motivos.join(' · ') } : { noite: 'ok' };
}

/** Une a avaliação do servidor HTTP com a de outro módulo (alertas, frente B): 'atencao' de qualquer um vence. */
export function unirSaude(a: SaudeNoite, b: SaudeNoite | null | undefined): SaudeNoite {
  if (!b || b.noite !== 'atencao') return a;
  if (a.noite !== 'atencao') return { noite: 'atencao', ...(b.motivo ? { motivo: b.motivo } : {}) };
  const m = [a.motivo, b.motivo].filter((x): x is string => !!x);
  // o mesmo motivo vindo dos dois lados aparece uma vez só
  return {
    noite: 'atencao',
    motivo: [...new Set(m.flatMap((x) => x.split(' · ')))].join(' · '),
  };
}

/** Memória mínima da avaliação: quando a marca do placar nacional mudou e quantos minutos ruins seguidos. */
export class VigiaNoite {
  private marca: string | null = null;
  private desde: number | null = null;
  private ruins = 0;

  /** Marca atual do placar nacional de Presidente (fonte TSE); null/undefined = sem fonte TSE (zera). */
  observarMarca(marca: string | null | undefined, agora: number): void {
    if (!marca) {
      this.marca = null;
      this.desde = null;
      return;
    }
    if (marca !== this.marca) {
      this.marca = marca;
      this.desde = agora;
    }
  }

  /** Desde quando a marca não muda (null = sem observação). */
  get paradoDesde(): number | null {
    return this.desde;
  }

  /** Fecha um minuto de métricas (Metricas.fecharMinuto). */
  minuto(r: { requisicoes: number; erros5xx: number; p99: number }): void {
    const L = SAUDE_NOITE;
    const ruim = r.requisicoes >= L.minimoRequisicoes && (r.erros5xx / r.requisicoes > L.taxa5xx || r.p99 > L.p99Ms);
    this.ruins = ruim ? this.ruins + 1 : 0;
  }

  get minutosRuins(): number {
    return this.ruins;
  }
}
