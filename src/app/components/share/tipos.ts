/**
 * Contrato do kit de compartilhamento (Fase 3). As outras frentes importam de `@/app/components/share`.
 */
import type { ReactNode } from 'react';

/**
 * Formatos das imagens:
 *  - 'x'     1200×675 (16:9) — X/Twitter, WhatsApp, LinkedIn (aparece inteira na linha do tempo);
 *  - 'feed'  1080×1350 (4:5) — Instagram/feed;
 *  - 'story' 1080×1920 (9:16) — Stories/Status/Reels.
 */
export type FormatoCartao = 'x' | 'feed' | 'story';

export const DIMENSOES_CARTAO: Record<FormatoCartao, { w: number; h: number; rotulo: string }> = {
  x: { w: 1200, h: 675, rotulo: 'X · 16:9' },
  feed: { w: 1080, h: 1350, rotulo: 'Feed · 4:5' },
  story: { w: 1080, h: 1920, rotulo: 'Story · 9:16' },
};

export const FORMATOS_PADRAO: FormatoCartao[] = ['x', 'feed', 'story'];

export interface ConteudoCompartilhavel {
  /** Título do sheet ("Compartilhar placar"). */
  titulo: string;
  /** Texto neutro pronto, SEM url (≤ 240 caracteres; com "[SIMULAÇÃO]" quando simulado — veja `textos.ts`). */
  texto: string;
  /** Rota do app, ex. '/apuracao/sp/62910' (vira URL absoluta; funciona no HashRouter do demo). */
  caminho: string;
  /** Hashtags neutras, sem '#'. */
  hashtags?: string[];
  /** Nome do arquivo PNG, sem extensão. */
  nomeArquivo: string;
  /** Desenha o cartão em px reais (w×h de DIMENSOES_CARTAO). Sem ele, o sheet só compartilha texto e link. */
  cartao?: (formato: FormatoCartao) => ReactNode;
  /** Formatos oferecidos (padrão ['x','feed','story']). O primeiro é o inicial. */
  formatos?: FormatoCartao[];
  /** Números simulados: o texto ganha o prefixo "[SIMULAÇÃO]" (se ainda não tiver). */
  simulado?: boolean;
}
