/**
 * Barras fixas do celular (tab bar e barra de anúncio do rodapé): quando sair da frente e quando voltar.
 *
 * - Rolando a página para BAIXO (lendo), a tab bar desce e some; a barra de anúncio desce junto e passa a ocupar o
 *   pé da tela. Qualquer rolagem para CIMA, o topo da página e o fim dela (rodapé) trazem a tab bar de volta. Ganha
 *   60 px de leitura numa tela de 740 px sem esconder a navegação de verdade (padrão do Safari e do app do X).
 * - Com o teclado aberto (foco num campo de texto, aparelho de toque), as duas barras saem: fixas no pé da tela,
 *   elas cobririam o campo ou subiriam junto com o teclado.
 *
 * O estado vai para atributos no <html> (`data-tab-oculta`, `data-teclado`), lidos pelo CSS das barras: nenhuma
 * renderização do React a cada rolagem, só uma troca de atributo quando o estado muda. No desktop (≥ 768 px) nada
 * disso tem efeito: as barras não existem lá.
 */

/** A partir de quantos px do topo a tab bar pode sumir (antes disso ela sempre aparece). */
export const TOPO_PX = 160;
/** Margem do fim da página em que a tab bar volta (o rodapé do site fica todo à vista). */
export const FIM_PX = 96;
/** Rolagens menores que isso são ignoradas (tremida do dedo, rubber band, barra do navegador mudando). */
export const LIMIAR_PX = 8;

export interface LeituraRolagem {
  /** posição atual (window.scrollY) */
  y: number;
  /** posição da última decisão */
  yAnterior: number;
  /** altura da janela (innerHeight) */
  janela: number;
  /** altura total da página (scrollHeight) */
  pagina: number;
  /** a tab bar está oculta agora? */
  oculta: boolean;
}

/**
 * Decide se a tab bar fica oculta. Puro (testado em barrasMoveis.test.ts). Devolve `null` quando não há o que mudar:
 * rolagem pequena demais (o chamador mantém a referência `yAnterior` e a soma continua) ou no mesmo sentido do estado.
 */
export function decidirTabOculta({ y, yAnterior, janela, pagina, oculta }: LeituraRolagem): boolean | null {
  if (y <= TOPO_PX) return false;
  if (y + janela >= pagina - FIM_PX) return false;
  const dy = y - yAnterior;
  if (Math.abs(dy) < LIMIAR_PX) return null;
  const desce = dy > 0;
  return desce === oculta ? null : desce;
}

/** Campo que abre o teclado virtual (texto, número, busca…; não conta botão, caixa de seleção, faixa ou select). */
export function abreTeclado(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false;
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

let instalado = false;

/**
 * Liga os ouvintes uma vez (AppShell). Devolve a função que desliga (para testes/HMR). Seguro sem `window`.
 */
export function instalarBarrasMoveis(): () => void {
  if (typeof window === 'undefined' || instalado) return () => {};
  instalado = true;
  const html = document.documentElement;
  const toque = window.matchMedia?.('(pointer: coarse)');
  let yAnterior = window.scrollY;
  let quadro = 0;
  // o estado mora no atributo (mostrarTabBar() pode limpá-lo de fora)
  const oculta = () => html.hasAttribute('data-tab-oculta');
  const aplicarTab = (v: boolean) => {
    if (v === oculta()) return;
    if (v) html.setAttribute('data-tab-oculta', '');
    else html.removeAttribute('data-tab-oculta');
  };

  const avaliar = () => {
    quadro = 0;
    // folha/diálogo aberto trava a rolagem do <html>: não mexe nas barras por baixo dele
    if (html.style.overflow === 'hidden') return;
    const y = window.scrollY;
    const d = decidirTabOculta({ y, yAnterior, janela: window.innerHeight, pagina: html.scrollHeight, oculta: oculta() });
    if (d === null) {
      // sem mudança de sentido: acompanha a posição (o próximo limiar conta a partir daqui)
      if (Math.abs(y - yAnterior) >= LIMIAR_PX) yAnterior = y;
      return;
    }
    yAnterior = y;
    aplicarTab(d);
  };
  const onScroll = () => {
    if (!quadro) quadro = window.requestAnimationFrame(avaliar);
  };

  // teclado: foco num campo de texto num aparelho de toque. O focusout espera um instante para o foco poder pular de
  // um campo a outro sem as barras piscarem.
  let saida = 0;
  const onFocusIn = (e: FocusEvent) => {
    if (!toque?.matches || !abreTeclado(e.target as Element)) return;
    window.clearTimeout(saida);
    html.setAttribute('data-teclado', '');
  };
  const onFocusOut = () => {
    window.clearTimeout(saida);
    saida = window.setTimeout(() => {
      if (!abreTeclado(document.activeElement)) html.removeAttribute('data-teclado');
    }, 120);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  return () => {
    instalado = false;
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    window.cancelAnimationFrame(quadro);
    window.clearTimeout(saida);
    html.removeAttribute('data-tab-oculta');
    html.removeAttribute('data-teclado');
  };
}

/** Traz a tab bar de volta (troca de página). */
export function mostrarTabBar(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute('data-tab-oculta');
}
