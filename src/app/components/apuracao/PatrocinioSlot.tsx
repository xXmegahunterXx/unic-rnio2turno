/**
 * Patrocínio "Oferecido por <marca>" (`LiveStatus.patrocinio`, configurado no admin — comando 'patrocinio').
 * Sempre discreto: nada de modal, pop-up ou animação chamativa; rotulado como publicidade; link em nova aba com
 * `rel="sponsored noopener"`. Só anunciante NÃO político (ARCHITECTURE §1.5) — a regra é aplicada no admin.
 *
 * Variantes:
 *  - 'linha'  → uma linha "Oferecido por [logo] Marca" (topo de página, Modo TV);
 *  - 'cartao' → marca + texto + link (fim da página).
 */
import type { Patrocinio } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

/** URL segura para o link (só http/https). */
export function urlPatrocinio(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, 'https://exemplo.invalid');
    return u.protocol === 'https:' || u.protocol === 'http:' ? (u.hostname === 'exemplo.invalid' ? null : u.toString()) : null;
  } catch {
    return null;
  }
}

/**
 * Imagem segura para `<img>`: data URI de imagem (png, jpeg, webp, svg), URL https, ou a logo servida pelo próprio
 * servidor (`/api/patrocinio/logo?h=…`, que o /api/status devolve como URL absoluta — http em desenvolvimento).
 */
export function imagemPatrocinio(src: string | undefined): string | null {
  if (!src) return null;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(src)) return src;
  if (/^https:\/\//i.test(src)) return src;
  try {
    const u = new URL(src, typeof window !== 'undefined' ? window.location.href : 'https://exemplo.invalid');
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.pathname.endsWith('/api/patrocinio/logo')) return u.toString();
  } catch {
    /* inválida */
  }
  return null;
}

/** "exemplo.com.br" para exibir. */
function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface PatrocinioSlotProps {
  patrocinio: Patrocinio | null | undefined;
  variant?: 'linha' | 'cartao';
  /** Modo TV: maior e sem link clicável (tela de transmissão). */
  tv?: boolean;
  className?: string;
}

export function PatrocinioSlot({ patrocinio, variant = 'linha', tv, className }: PatrocinioSlotProps) {
  if (!patrocinio || !patrocinio.marca?.trim()) return null;
  const url = urlPatrocinio(patrocinio.url);
  const img = imagemPatrocinio(patrocinio.imagem);
  const marca = patrocinio.marca.trim();

  const logo = img ? (
    <img
      src={img}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 object-contain', tv ? 'h-10 max-w-[160px]' : variant === 'cartao' ? 'h-10 max-w-[120px]' : 'h-5 max-w-[84px]')}
    />
  ) : null;

  if (variant === 'linha') {
    const conteudo = (
      <>
        <span className={cn('font-medium uppercase tracking-[0.12em] text-fg-subtle', tv ? 'text-[15px]' : 'text-[10.5px]')}>Oferecido por</span>
        {logo}
        <span className={cn('font-semibold text-fg', tv ? 'text-[20px]' : 'text-[13px]')}>{marca}</span>
      </>
    );
    const cls = cn(
      'inline-flex min-w-0 items-center gap-2 rounded-full',
      tv ? 'gap-3' : 'h-7 border border-line bg-surface-2/60 px-2.5',
      className,
    );
    if (url && !tv) {
      return (
        <a
          href={url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          aria-label={`Publicidade: oferecido por ${marca} (abre em nova aba)`}
          className={cn(cls, 'transition-colors hover:border-line/[2] hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand')}
        >
          {conteudo}
        </a>
      );
    }
    return (
      <span className={cls} aria-label={`Publicidade: oferecido por ${marca}`}>
        {conteudo}
      </span>
    );
  }

  return (
    <aside
      aria-label="Publicidade"
      className={cn('flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface/70 p-4 sm:p-5', className)}
    >
      <div className="flex min-w-0 max-w-full items-center gap-3">
        {logo ?? (
          <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 font-display text-[17px] font-semibold text-fg">
            {marca.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">Oferecido por · publicidade</p>
          <p className="truncate font-display text-[17px] font-semibold leading-tight text-fg">{marca}</p>
        </div>
      </div>
      {patrocinio.texto?.trim() ? (
        <p className="min-w-0 flex-1 basis-[16rem] text-pretty text-[13.5px] leading-snug text-fg-muted">{patrocinio.texto.trim()}</p>
      ) : (
        <span className="flex-1" />
      )}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-[13px] font-semibold text-fg transition-colors hover:border-line/[2] hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {dominio(url)}
          <Icon name="externo" size={14} className="text-fg-muted" />
        </a>
      ) : null}
    </aside>
  );
}
