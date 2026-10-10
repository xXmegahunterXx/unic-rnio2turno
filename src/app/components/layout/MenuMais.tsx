/**
 * Menu "Mais" (chunk próprio, carregado no 1º toque ou quando o navegador fica ocioso): o que não cabe na navegação
 * principal (Curiosidades, "E se…?", governadores, cargos do 1º turno, Modo TV, compartilhar, incorporar e as
 * páginas institucionais), sem poluir o header nem a tab bar.
 *  - Celular: folha inferior (Sheet do kit: arrastar para fechar, foco preso, Esc) → `FolhaMais`.
 *  - Desktop: painel sob o header → `PainelMais` (o botão e o fechar-ao-clicar-fora ficam em BotaoMais.tsx).
 */
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Sheet } from '@/app/ui/Sheet';
import { ThemeToggle } from '@/app/ui/ThemeToggle';
import { abrirCompartilharSite, abrirIncorporar, preCarregarCompartilharSite, preCarregarIncorporar } from './acoesGlobais';
import { IconeQualquer } from './IconesExtras';
import { MAIS, type ItemMais } from './mais';
import { propsPreCarregar } from './prefetch';

function ItemMenu({ item, pathname, onEscolher, compacto }: { item: ItemMais; pathname: string; onEscolher: () => void; compacto?: boolean }) {
  const ativo = !!item.match?.(pathname);
  const classe = cn(
    'group flex w-full min-w-0 items-center gap-3 rounded-2xl px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    compacto ? 'min-h-[44px] py-1.5' : 'min-h-[56px] py-2',
    ativo ? 'bg-surface-3/80' : 'hover:bg-surface-2 active:bg-surface-2',
  );
  const miolo = (
    <>
      <span className={cn('inline-flex shrink-0 items-center justify-center rounded-xl', compacto ? 'h-8 w-8' : 'h-10 w-10', ativo ? 'bg-brand/20 text-brand-fg' : 'bg-surface-3 text-fg-muted group-hover:text-fg')}>
        <IconeQualquer name={item.icon} size={compacto ? 17 : 19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold leading-tight text-fg">{item.label}</span>
        {item.desc && !compacto ? <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-fg-muted">{item.desc}</span> : null}
      </span>
    </>
  );
  if (item.acao) {
    const abrir = item.acao === 'incorporar' ? () => abrirIncorporar() : abrirCompartilharSite;
    const pre = item.acao === 'incorporar' ? preCarregarIncorporar : preCarregarCompartilharSite;
    return (
      <button
        type="button"
        className={classe}
        onPointerEnter={pre}
        onFocus={pre}
        onClick={() => {
          onEscolher();
          abrir();
        }}
        aria-haspopup="dialog"
      >
        {miolo}
      </button>
    );
  }
  return (
    <Link to={item.to!} {...propsPreCarregar(item.to!)} aria-current={ativo ? 'page' : undefined} className={classe} onClick={onEscolher}>
      {miolo}
    </Link>
  );
}

function ConteudoMais({ pathname, onEscolher, desktop }: { pathname: string; onEscolher: () => void; desktop?: boolean }) {
  return (
    <div className={cn('grid gap-x-4 gap-y-4', desktop ? 'grid-cols-2' : 'grid-cols-1')}>
      {MAIS.map((g) => (
        <section key={g.titulo} aria-label={g.titulo} className="min-w-0">
          <h3 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{g.titulo}</h3>
          <ul className={cn('grid gap-0.5', !desktop && g.titulo === 'Sobre' && 'grid-cols-1')}>
            {g.itens.map((it) => (
              <li key={it.label}>
                <ItemMenu item={it} pathname={pathname} onEscolher={onEscolher} compacto={g.titulo === 'Sobre'} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Folha inferior do celular (aberta pela aba "Mais"). */
export function FolhaMais({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { pathname } = useLocation();
  return (
    <Sheet open={aberto} onClose={onFechar} title="Mais do Sintonia" width="sm">
      <ConteudoMais pathname={pathname} onEscolher={onFechar} />
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line px-2.5 pt-4 text-[13.5px] text-fg-muted">
        <span>Tema da tela</span>
        <ThemeToggle size="sm" />
      </div>
    </Sheet>
  );
}

/** Painel do desktop (o botão, a abertura e o fechar-ao-clicar-fora ficam em BotaoMais.tsx). */
export function PainelMais({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { pathname } = useLocation();
  return (
    // Centralizado sob o header (o botão muda de posição conforme a largura; o painel nunca sai da tela).
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--app-header-h,64px)+8px)] z-[60] flex justify-center px-4">
      <motion.div
        id={id}
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className="pointer-events-auto max-h-[calc(100dvh-var(--app-header-h,64px)-24px)] w-full max-w-[660px] origin-top overflow-y-auto rounded-3xl border border-line bg-surface p-3 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]"
      >
        <ConteudoMais pathname={pathname} onEscolher={onFechar} desktop />
      </motion.div>
    </div>
  );
}
