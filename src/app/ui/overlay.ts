/** Comportamentos compartilhados por Dialog e Sheet: trava de rolagem, Esc, foco preso e devolvido. */
import { useEffect, useRef, type RefObject } from 'react';

const FOCAVEIS =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let travas = 0;

/**
 * Pilha de modais abertos: só o do topo responde a Esc/Tab. Sem isso, um Dialog aberto por cima de um Sheet (ex.: o
 * "toque e segure para salvar" do compartilhar) fechava os dois no mesmo Esc, e o Tab podia cair no Sheet de baixo.
 */
const pilha: object[] = [];

export function useModal(aberto: boolean, painel: RefObject<HTMLElement | null>, onClose: () => void) {
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const eu = {};
    pilha.push(eu);
    const html = document.documentElement;
    const sbw = window.innerWidth - html.clientWidth;
    if (travas++ === 0) {
      html.style.overflow = 'hidden';
      if (sbw > 0) html.style.paddingRight = `${sbw}px`;
    }
    const foco = window.setTimeout(() => {
      const el = painel.current;
      if (!el) return;
      const alvo = el.querySelector<HTMLElement>('[data-autofocus]') ?? el;
      alvo.focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== eu) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar.current();
        return;
      }
      if (e.key !== 'Tab' || !painel.current) return;
      const itens = Array.from(painel.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((n) => n.offsetParent !== null);
      if (itens.length === 0) {
        e.preventDefault();
        return;
      }
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(foco);
      document.removeEventListener('keydown', onKey);
      const i = pilha.indexOf(eu);
      if (i >= 0) pilha.splice(i, 1);
      if (--travas === 0) {
        html.style.overflow = '';
        html.style.paddingRight = '';
      }
      anterior?.focus?.({ preventScroll: true });
    };
  }, [aberto, painel]);
}
