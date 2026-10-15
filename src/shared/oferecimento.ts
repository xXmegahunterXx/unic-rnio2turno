/**
 * Até onde vai a faixa "Oferecimento: <marca>" do formato de anúncio 'compartilhamento' (src/shared/anuncios.ts).
 *
 * Sempre: nos cartões GENÉRICOS, sem candidato nem número (Teste Cego, calculadora sem código, capa das curiosidades e a
 * imagem-convite do Palpite "?% × ?%").
 *
 * `OFERECIMENTO_COM_CANDIDATOS` estende a faixa aos cartões que MOSTRAM candidatos com números: o placar (servidor
 * og-placar.ts e app ShareCard, com retratos, nomes, números de urna e percentuais) e os cartões do Palpite (nomes e
 * percentuais hipotéticos). A regra do projeto (ARCHITECTURE §1.5) é anúncio nunca colado a placar, foto, nome ou número
 * de candidato — por isso fica DESLIGADO. Ligar exige decisão escrita do dono, aditivo nos contratos dos anunciantes e
 * registro da exceção no CLAUDE.md; a /anuncie e a /sobre leem esta mesma constante e passam a dizer, sozinhas, que a
 * marca aparece nessas imagens (o servidor, o app e os textos nunca divergem).
 */
export const OFERECIMENTO_COM_CANDIDATOS = false as boolean;
