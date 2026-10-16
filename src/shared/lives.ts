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
  /** fontes ativas no total (memória limitada mesmo sob ataque; acima, as novas são ignoradas) */
  maxFontes: 20_000,
  /** corpo máximo do POST /api/live/batimento (bytes) */
  corpoMax: 200,
  /** GET /api/live/agora só mostra o número a partir de tantas lives (abaixo: null) */
  pisoPublico: 5,
  /** um batimento soma 1 minuto se vier pelo menos tantos segundos depois do último que somou (recarga não duplica) */
  minutoMinS: 45,
  /** anúncios aceitos por batimento */
  maxAnuncios: 4,
  /** batimentos aceitos por rede por minuto (acima: 204 sem contar) */
  maxBatimentosRedeMin: 120,
  /** horas guardadas no detalhe por hora (CSV do painel): 14 dias, como a audiência */
  horas: 336,
  /** o `GET /api/live/agora` fica tantos segundos na borda */
  agoraBordaS: 30,
} as const;

/**
 * Layouts contados (lista fechada; o servidor ignora o resto). Os quatro da /live (`LAYOUTS_LIVE` em
 * src/app/components/live/opcoes.ts — o teste confere que são os mesmos) + 'vertical' (placar em pé: TikTok, Shorts).
 */
export const LAYOUTS_CONTADOS = ['placar', 'barra', 'canto', 'mapa', 'vertical'] as const;
export type LayoutContado = (typeof LAYOUTS_CONTADOS)[number];

/** Rótulo de cada layout no painel. */
export const ROTULO_LAYOUT_CONTADO: Record<LayoutContado, string> = {
  placar: 'Placar grande',
  barra: 'Barra',
  canto: 'Canto',
  mapa: 'Mapa',
  vertical: 'Em pé (9:16)',
};

/** Id aleatório da carga da página (12 caracteres [a-z0-9]): não identifica canal nem pessoa e não fica no aparelho. */
export const ID_FONTE_LIVE = /^[a-z0-9]{8,24}$/;

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
  /** (opcional, leva 3) maior número de lives ao mesmo tempo, com o instante (epoch ms) */
  pico?: { n: number; em: number } | null;
  /** (opcional) início da contagem (epoch ms): subida sem arquivo ou "Zerar contagem" do painel */
  desde?: number;
  /** (opcional) lives agora exibindo cada anúncio (id do anúncio) */
  agoraPorAnuncio?: Record<string, number>;
  /** (opcional) detalhe por hora (CSV): início da hora (epoch ms), maior número de lives ao mesmo tempo e minutos */
  horas?: HoraLives[];
  /** (opcional) a chave 'contar-lives' do painel está ligada */
  ligado?: boolean;
}

/** Uma hora do detalhe (CSV do painel). */
export interface HoraLives {
  /** início da hora (epoch ms, hora cheia UTC — Brasília não tem horário de verão) */
  h: number;
  /** maior número de lives ao mesmo tempo nesta hora */
  max: number;
  /** minutos de /live no ar nesta hora */
  minutos: number;
}

/** Comando do painel (`POST /api/admin/lives`). */
export type ComandoLives = { acao: 'zerar' };
