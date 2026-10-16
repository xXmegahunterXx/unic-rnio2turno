/**
 * Interruptores dos anúncios que o SITE lê (contrato: src/shared/anuncios.ts, que os reexporta). Módulo folha, sem
 * importação nem efeito colateral: as peças do site (chunk `pecas`, carregado com a faixa do topo, na 1ª dobra) importam
 * daqui e não arrastam a validação, as categorias e as mensagens do painel para o JS do visitante.
 */

/** Interruptor do desenho novo das logos: false = o site ignora os ajustes (logo na placa clara quadrada, como antes). */
export const LOGO_NATURAL: boolean = true;
