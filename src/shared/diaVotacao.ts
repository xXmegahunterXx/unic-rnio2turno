/**
 * O "dia da votação antes das 17h" (0h–17h de 25/10, Brasília) — fonte única para o servidor (meta tags, rotas das
 * imagens de prévia, texto dos bots) e para o app (kit de compartilhar, título da ficha). Módulo à parte de constants.ts
 * para não entrar no JS inicial do app (só os chunks que o usam o carregam).
 */
import { INICIO_APURACAO } from './constants';

/** 0h de 25/10/2026 em Brasília: começo do dia da votação. */
export const INICIO_DIA_VOTACAO = Date.UTC(2026, 9, 25, 3, 0, 0); // 00:00 BRT

/**
 * Dia da votação antes da apuração (0h–17h de 25/10, Brasília), pelo relógio REAL passado (o do servidor; nunca o
 * simulado): nada que circula com o link — descrições e imagens de prévia, kit de compartilhar, texto dos bots das lives
 * — leva nome, foto, número ou percentual de candidato nesse intervalo.
 */
export const diaDeVotacaoAntesDas17 = (agora: number): boolean => agora >= INICIO_DIA_VOTACAO && agora < INICIO_APURACAO;
