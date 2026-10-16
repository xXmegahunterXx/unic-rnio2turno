/**
 * Como desenhar a logo de um anunciante num tema (puro, testável). Contrato: `AjusteImagem` em src/shared/anuncios.ts.
 *
 *  - Com ajuste (medido no painel ao enviar, ou escolhido pelo dono): proporção NATURAL — logotipo comprido como
 *    logotipo, ícone como ícone — e placa (clara ou escura) só no tema em que o contraste pede. O site só obedece ao que
 *    foi gravado; nada é medido aqui.
 *  - Tema escuro: usa a versão para fundo escuro (`logoEscuro` + `logoEscuroAjuste`) quando existe.
 *  - Sem ajuste (logo gravada antes da v2) ou com o interruptor `LOGO_NATURAL` desligado: o desenho antigo, a placa
 *    quadrada (`placa: 'legado'`).
 */
import type { AjusteImagem, AnuncioPublico, PlacaLogo } from '@/shared/anuncios';
// o interruptor vem do módulo folha: importar o VALOR de '@/shared/anuncios' puxaria a validação inteira para o chunk das peças
import { LOGO_NATURAL } from '@/shared/anuncios-flags';
import { imagemDoAnuncio } from './nucleo';

export type TemaLogo = 'claro' | 'escuro';

export type LogoDoAnuncio = Pick<AnuncioPublico, 'logo' | 'logoAjuste' | 'logoEscuro' | 'logoEscuroAjuste'>;

export interface ApresentacaoLogo {
  src: string;
  /** null = desenho antigo (logo sem ajuste, ou `LOGO_NATURAL` desligado) */
  ajuste: AjusteImagem | null;
  /** placa neste tema; 'legado' = a placa quadrada antiga */
  placa: PlacaLogo | 'legado';
  /** largura ÷ altura da imagem (1 no legado) */
  proporcao: number;
  /** ≈ quadrada (proporção ≤ 1,35, ou legado): ocupa a altura toda do espaço */
  icone: boolean;
  /** logotipo (com ajuste e proporção ≥ 2): já traz o nome — o nome da marca em texto ao lado sairia repetido */
  logotipo: boolean;
  /** a imagem é a versão para fundo escuro (`logoEscuro`) */
  escura: boolean;
}

/** Proporção a partir da qual a logo é um logotipo (o nome em texto sai). */
export const PROPORCAO_LOGOTIPO = 2;
/** Proporção até a qual a logo é um ícone (ocupa a altura toda; placa com folga igual em volta). */
export const PROPORCAO_ICONE = 1.35;

/**
 * Logo, ajuste e placa num tema. `natural` = o interruptor `LOGO_NATURAL` (parâmetro só para os testes). Sem logo
 * nenhuma: null (quem desenha mostra o monograma).
 */
export function apresentacaoLogo(a: Partial<LogoDoAnuncio>, tema: TemaLogo, natural: boolean = LOGO_NATURAL): ApresentacaoLogo | null {
  const clara = imagemDoAnuncio(a.logo);
  const escura = imagemDoAnuncio(a.logoEscuro);
  const legado = (src: string, ehEscura: boolean): ApresentacaoLogo => ({ src, ajuste: null, placa: 'legado', proporcao: 1, icone: true, logotipo: false, escura: ehEscura });
  if (!natural) {
    // interruptor desligado: exatamente o desenho de antes (só a `logo`; a versão escura não existia)
    if (clara) return legado(clara, false);
    return escura ? legado(escura, true) : null;
  }
  const usaEscura = !!escura && (tema === 'escuro' || !clara);
  const src = usaEscura ? escura : clara;
  if (!src) return null;
  const ajuste = (usaEscura ? a.logoEscuroAjuste : a.logoAjuste) ?? null;
  if (!ajuste || !(ajuste.proporcao > 0)) return legado(src, usaEscura);
  const placa = tema === 'escuro' ? ajuste.placaEscuro : ajuste.placaClaro;
  return {
    src,
    ajuste,
    placa,
    proporcao: ajuste.proporcao,
    icone: ajuste.proporcao <= PROPORCAO_ICONE,
    logotipo: ajuste.proporcao >= PROPORCAO_LOGOTIPO,
    escura: usaEscura,
  };
}

/** Logotipo (com ajuste e proporção ≥ 2) neste tema: o nome da marca não se repete em texto (segue no `aria-label`). */
export function ehLogotipo(a: Partial<LogoDoAnuncio>, tema: TemaLogo): boolean {
  return apresentacaoLogo(a, tema)?.logotipo ?? false;
}

/**
 * Peça (`imagem`) neste tema: o fundo da área da peça. Só para peça TRANSPARENTE com ajuste (sem `comFundo`); peça opaca
 * ou sem ajuste: null (o desenho de antes). `LOGO_NATURAL` desligado também volta ao de antes.
 */
export function placaDaPeca(a: Pick<AnuncioPublico, 'imagemAjuste'>, tema: TemaLogo, natural: boolean = LOGO_NATURAL): PlacaLogo | null {
  const aj = a.imagemAjuste;
  if (!natural || !aj || aj.comFundo || !(aj.proporcao > 0)) return null;
  return tema === 'escuro' ? aj.placaEscuro : aj.placaClaro;
}
