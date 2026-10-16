/**
 * Chamada "Chat ao vivo" na 1ª dobra das páginas da apuração (ao lado de "N pessoas agora"). Só aparece com a sala
 * aberta pela moderação (chamada.ts) e abre a sala da própria página (folha no celular, painel no computador). No
 * celular, a pílula flutuante recolhe numa alça diante de placares e mapas: esta chamada é a porta visível.
 */
import { cn } from '@/app/lib/cn';
import { pedirAbrirChat, useChatDisponivel } from './chamada';

export function ChamadaChat({ className }: { className?: string }) {
  const disponivel = useChatDisponivel();
  if (!disponivel) return null;
  return (
    <button
      type="button"
      onClick={pedirAbrirChat}
      className={cn(
        'toque relative inline-flex h-6 items-center gap-1.5 rounded-lg bg-brand/10 px-2 text-xs font-semibold text-brand-fg ring-1 ring-inset ring-brand/25 transition-colors hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M20 12.2c0 3.9-3.6 7-8 7-1.1 0-2.2-.2-3.1-.6L4.5 20l1.2-3.4C4.6 15.4 4 13.9 4 12.2c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
      </svg>
      Chat ao vivo
    </button>
  );
}
