/**
 * Contagem anônima de lives (I23, leva 3) — contrato isomórfico entre a /live (fonte do OBS), o servidor
 * (src/server/lives.ts) e o painel (SecaoLives). ARCHITECTURE §11.10.
 *
 * Só agregados, sem dado pessoal: a /live manda um batimento a cada `LIVES.batimentoS` com um id ALEATÓRIO por carga da
 * página (não identifica canal nem pessoa), o layout e os anúncios na tela. O servidor guarda em memória (gravação
 * atômica) só contagens: fontes ativas agora, minutos por layout e por anúncio, e QUANTOS canais de bot pediram o texto
 * do placar (nunca o nome: a lista de canais nunca sai do servidor — canais têm lado). Chave 'contar-lives' desligada =
 * o batimento responde 204 sem contar.
 */

export const LIVES = {
  /** intervalo do batimento da /live (s) */
  batimentoS: 60,
  /** uma fonte conta como ativa se mandou batimento nos últimos `ativaS` segundos */
  ativaS: 150,
  /** fontes distintas aceitas por rede (o resto é ignorado) */
  maxFontesPorRede: 30,
  /** corpo máximo do POST /api/live/batimento (bytes) */
  corpoMax: 200,
  /** GET /api/live/agora só mostra o número a partir de tantas lives (abaixo: null) */
  pisoPublico: 5,
} as const;

/** Corpo do `POST /api/live/batimento`. */
export interface BatimentoLive {
  /** aleatório por carga da página (ex.: 12 caracteres [a-z0-9]); não persiste no aparelho */
  id: string;
  /** layout da /live — um de LAYOUTS_LIVE (src/app/components/live/opcoes.ts); o servidor confere a lista fechada */
  layout: string;
  /** ids dos anúncios na tela neste minuto (opcional) */
  a?: string[];
}

/** `GET /api/live/agora` (para a /streamers): o número só aparece com `LIVES.pisoPublico` ou mais lives. */
export interface LivesPublico {
  agora: number | null;
}

/** Resumo do painel (SecaoLives): agora, minutos e canais de bot — só números. */
export interface LivesResumo {
  /** fontes /live ativas agora */
  agora: number;
  /** fontes ativas agora por layout */
  porLayout: Record<string, number>;
  /** minutos de /live no ar desde o início da contagem: total, por layout e por anúncio exibido (id do anúncio) */
  minutos: { total: number; porLayout: Record<string, number>; porAnuncio: Record<string, number> };
  /** canais distintos que pediram o texto do placar (Nightbot-Channel e afins) — só a contagem */
  canaisBot: number;
}
