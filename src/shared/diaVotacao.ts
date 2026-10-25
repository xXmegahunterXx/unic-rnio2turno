/**
 * O "dia da votação" até o fim da votação (0h–19h de 25/10, Brasília; eram 17h até a prorrogação) — fonte única para
 * o servidor (meta tags, rotas das imagens de prévia, texto dos bots) e para o app (kit de compartilhar, título da
 * ficha). Módulo à parte de constants.ts para não entrar no JS inicial do app (só os chunks que o usam o carregam).
 */
import { INICIO_APURACAO } from './constants';

/** 0h de 25/10/2026 em Brasília: começo do dia da votação. */
export const INICIO_DIA_VOTACAO = Date.UTC(2026, 9, 25, 3, 0, 0); // 00:00 BRT

/**
 * Fim da votação: 19h de 25/10/2026 (Brasília). O horário original era 17h (`INICIO_APURACAO`); no próprio dia 25 a
 * votação foi prorrogada até as 19h em todo o país por decisão judicial, e o TSE suspendeu a divulgação até lá.
 * Tudo o que vale "enquanto se vota" (pesquisas, kit de compartilhar, bots, chat, palpite) usa ESTE horário;
 * `INICIO_APURACAO` segue marcando só o começo da leitura do TSE.
 */
export const FIM_VOTACAO = Date.UTC(2026, 9, 25, 22, 0, 0); // 19:00 BRT
/** O fim da votação por extenso, para os textos ("até as 19h"). */
export const HORA_FIM_VOTACAO = '19h';
/** Verdadeiro se a votação foi prorrogada além do horário original (17h). */
export const VOTACAO_PRORROGADA = FIM_VOTACAO > INICIO_APURACAO;

/**
 * Dia da votação antes do fim da votação (0h–19h de 25/10, Brasília), pelo relógio REAL passado (o do servidor; nunca
 * o simulado): nada que circula com o link — descrições e imagens de prévia, kit de compartilhar, texto dos bots das
 * lives — leva nome, foto, número ou percentual de candidato nesse intervalo. (O nome ficou do horário original, 17h.)
 */
export const diaDeVotacaoAntesDas17 = (agora: number): boolean => agora >= INICIO_DIA_VOTACAO && agora < FIM_VOTACAO;
/** Mesmo que `diaDeVotacaoAntesDas17`, com o nome certo depois da prorrogação. */
export const votacaoEmCurso = diaDeVotacaoAntesDas17;
