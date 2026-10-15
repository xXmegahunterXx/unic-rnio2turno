/**
 * Formato 'nativo': cartão "Patrocinado" no meio do conteúdo, sempre ENTRE seções (nunca dentro de placar,
 * resultado ou ao lado de foto/nome/número de candidato) e com respiro dos dois lados.
 *
 *  - `faixa`: horizontal — logo grande, marca, título, texto, domínio e botão (sem peça);
 *  - `cartao`: com a peça do anunciante inteira (object-contain, sem corte) sobre um fundo feito da própria peça.
 *  - `auto` (padrão): `cartao` quando há peça, senão `faixa`.
 *
 * Posição sem anunciante disponível: anúncio da casa "Anuncie no Sintonia" (→ /anuncie), no máximo 1 por página
 * (nucleo.ts). O bloco inteiro é o link; impressão visível contada uma vez (impressao.ts).
 */
import { lazy, Suspense } from 'react';
import { useAnunciosDaPagina } from './contexto';
import { CASA } from './nucleo';
import type { VarianteNativo } from './AnuncioNativoPeca';

export type { VarianteNativo } from './AnuncioNativoPeca';

/**
 * As peças (cartão do anunciante e anúncio da casa) ficam num chunk à parte: os blocos nativos ficam entre seções,
 * abaixo da 1ª dobra, e o JS inicial das páginas leva só esta decisão. Sem lugar reservado: o bloco já só aparecia
 * quando o status chega (e fica fora da tela).
 */
const carregar = () => import('./AnuncioNativoPeca');
const PecaPreguicosa = lazy(() => carregar().then((m) => ({ default: m.AnuncioNativoPeca })));
const CasaPreguicosa = lazy(() => carregar().then((m) => ({ default: m.AnuncioDaCasa })));

export interface AnuncioNativoProps {
  /** posição do bloco na página (1, 2, 3…): define quem aparece e evita repetir anunciante */
  posicao: number;
  variante?: VarianteNativo;
  /** sem anúncio da casa nesta posição (ex.: espaço apertado) */
  semCasa?: boolean;
  className?: string;
}

/** Slot nativo: escolhe o anúncio da posição (ou o da casa) e desenha. Sem nada para mostrar, não ocupa espaço. */
export function AnuncioNativo({ posicao, variante = 'auto', semCasa, className }: AnuncioNativoProps) {
  const { escolha, vista, semProvedor, pronto } = useAnunciosDaPagina();
  if (semProvedor || !pronto) return null;
  const a = escolha.nativo(posicao);
  if (!a) return null;
  if (a === CASA)
    return semCasa ? null : (
      <Suspense fallback={null}>
        <CasaPreguicosa className={className} />
      </Suspense>
    );
  return (
    <Suspense fallback={null}>
      <PecaPreguicosa anuncio={a} variante={variante} bloco={`nativo-${posicao}`} vista={vista} className={className} />
    </Suspense>
  );
}
