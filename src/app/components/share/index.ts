/**
 * Kit de compartilhamento (Fase 3 · viral no X). Contrato em src/app/components/README.md ("Fase 3 · kit de
 * compartilhamento"). Importe sempre daqui: `import { BotaoCompartilhar, CartaoBase } from '@/app/components/share'`.
 */
export { DIMENSOES_CARTAO, FORMATOS_PADRAO, type ConteudoCompartilhavel, type FormatoCartao } from './tipos';
export { CartaoBase, SeloOficial, SeloSimulacao, medidasCartao, useCartao, type BrilhoCartao, type CartaoBaseProps, type MedidasCartao } from './CartaoBase';
export { PreviaCartao, type PreviaCartaoProps } from './PreviaCartao';
export { CompartilharSheet, LogoX, CLASSE_BOTAO_X, type CompartilharSheetProps } from './CompartilharSheet';
export { BotaoCompartilhar, type BotaoCompartilharProps } from './BotaoCompartilhar';
export { gerarPngCartao, cssFontesEmbutidas } from './png';
export {
  HASHTAGS,
  LIMITE_TEXTO,
  PREFIXO_SIMULACAO,
  comPrefixoSimulacao,
  finalizar,
  hashtags,
  limitarTexto,
  placarEmTexto,
  textoCandidato,
  textoComposicao,
  textoGovernadores,
  textoInstante,
  textoMomento,
  textoMunicipioT1,
  textoPlacar,
  textoSecao,
  textoSenadoUf,
} from './textos';
export { AvatarCartao, BarraDuelo, PctGigante, PilulaApurado, RotuloCartao } from './cartoes/partes';

// Cartões prontos (miolo sobre CartaoBase) e os botões que os abrem.
export { CartaoSecao, BotaoCompartilharSecao, type CartaoSecaoProps, type BotaoCompartilharSecaoProps } from './cartoes/Secao';
export { CartaoMunicipioT1, BotaoCompartilharMunicipioT1, type ResultadoLocalT1 } from './cartoes/MunicipioT1';
export { CartaoCandidato, BotaoCompartilharCandidato } from './cartoes/Candidato';
export { CartaoComposicao, CartaoSenadoUf, BotaoCompartilharComposicao, BotaoCompartilharSenadoUf, type BancadaCartao, type EleitoSenado } from './cartoes/Cargos';
export { CartaoGovernadores, BotaoCompartilharGovernadores, type DisputaGov } from './cartoes/Governadores';
export {
  CartaoMomento,
  BotaoMomento,
  BotaoInstante,
  EVENTOS_COMPARTILHAVEIS,
  eventoCompartilhavel,
  rotaMomento,
  type TipoMomento,
} from './cartoes/Momento';
