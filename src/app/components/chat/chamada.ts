/**
 * Ponte mínima entre o chat flutuante (ChatFlutuante, chunk próprio) e as chamadas "Chat ao vivo" das páginas da
 * apuração (1ª dobra): o chat avisa se a sala está disponível (aberta pela moderação); a chamada só aparece nessa hora e,
 * no clique, pede para o chat abrir (a folha no celular, o popup no computador). Sem dependências: não puxa o chat para o
 * JS inicial da página.
 */
import { useSyncExternalStore } from 'react';

const EVENTO_ABRIR = 'sintonia:abrir-chat';
let disponivel = false;
const ouvintes = new Set<() => void>();

/** Chamado pela sala: true quando a sala está aberta para mensagens (ou no build demo). */
export function avisarChatDisponivel(v: boolean): void {
  if (v === disponivel) return;
  disponivel = v;
  for (const f of ouvintes) f();
}

const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};

/** A sala está disponível agora? (false até a sala carregar e consultar o servidor) */
export function useChatDisponivel(): boolean {
  return useSyncExternalStore(
    assinar,
    () => disponivel,
    () => false,
  );
}

/** Pede para a sala abrir. */
export function pedirAbrirChat(): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}

/** A sala escuta os pedidos de abrir. */
export function aoPedirAbrirChat(f: () => void): () => void {
  window.addEventListener(EVENTO_ABRIR, f);
  return () => window.removeEventListener(EVENTO_ABRIR, f);
}
