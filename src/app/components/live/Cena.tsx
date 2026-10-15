/**
 * Cena de transmissão desenhada só com tokens (decorativa): o "jogo/câmera" atrás das prévias do modo streamer — mostra
 * como um layout de fundo transparente fica por cima da live. Sem candidato, sem foto, sem cor de candidato e sem
 * número de audiência (nada inventado).
 *
 * `MolduraLiveVitrine`: o formato de anúncio 'live' na vitrine dos formatos (/anuncie e prévia do painel) — uma tela 16:9
 * que lembra uma live, com a barra do Sintonia em esboço neutro e a peça REAL "Oferecido por" (modo prévia: sem
 * contagem) presa à marca, como na /live.
 */
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { LogoMark } from '@/app/components/layout/Logo';
import { useElementSize } from '@/app/components/apuracao/MapHooks';
import { OferecimentoLivePeca } from '@/app/components/anuncios/OferecimentoLive';
import { DOMINIO_PADRAO } from './opcoes';

/** Fundo de "live" (céu, horizonte em grade e brilhos da marca). Ocupa o contêiner (absolute inset-0). */
export function CenaLive({ className, selo = false }: { className?: string; selo?: boolean }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden bg-surface-3', className)}>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(var(--surface-2))_0%,rgb(var(--surface-3))_55%,rgb(var(--bg))_100%)]" />
      <div className="absolute -left-[10%] top-[4%] h-[60%] w-[50%] rounded-full bg-brand/45 blur-[50px]" />
      <div className="absolute right-[2%] top-[14%] h-[46%] w-[40%] rounded-full bg-brand-2/35 blur-[60px]" />
      <div className="absolute left-[38%] top-[30%] h-[22%] w-[18%] rounded-full bg-ok/20 blur-[40px]" />
      {/* horizonte com grade em perspectiva */}
      <div className="absolute inset-x-0 bottom-0 h-[46%] origin-bottom [transform:perspective(320px)_rotateX(58deg)] [background-image:linear-gradient(rgb(var(--brand-2)/0.28)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--brand-2)/0.28)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute inset-x-0 top-[54%] h-px bg-brand-2/40" />
      {/* "câmera" de quem transmite */}
      <div className="absolute bottom-[26%] left-[4%] flex aspect-[4/3] w-[17%] items-end justify-center overflow-hidden rounded-[8%] border border-line bg-surface/70">
        <span className="mb-[-8%] h-[72%] w-[64%] rounded-t-full bg-fg/15" />
        <span className="absolute top-[18%] h-[30%] w-[30%] rounded-full bg-fg/15" />
      </div>
      {selo ? (
        <span className="absolute left-[2.5%] top-[4%] inline-flex items-center gap-1 rounded-md bg-fg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-bg sm:text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-bg" />
          Ao vivo
        </span>
      ) : null}
    </div>
  );
}

/**
 * Formato 'live' na vitrine: o canto inferior esquerdo de uma live 16:9, ampliado (a peça precisa ser legível na
 * vitrine), com a barra do Sintonia em esboço (blocos neutros no lugar do placar) e a peça real "Oferecido por" na aba
 * presa à marca, do lado oposto ao placar. A tela da live é desenhada inteira e recortada pela moldura.
 */
export function MolduraLiveVitrine({ anuncio }: { anuncio: AnuncioPublico }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  // unidade da live "desenhada": o dobro da moldura, e nunca menor que 6,5 px (a marca do anunciante fica legível no celular)
  const u = size.w > 0 ? Math.max((size.w * 0.5625 * 2) / 100, 6.5) : 0;
  const altura = u * 100;
  const largura = (altura * 16) / 9;
  return (
    <div ref={ref} className="relative aspect-video w-full overflow-hidden rounded-xl">
      {u > 0 ? (
        <div className="absolute bottom-0 left-0" style={{ width: largura, height: altura, '--u': `${u}px` } as React.CSSProperties}>
          <CenaLive />
          <div className="absolute inset-x-[calc(var(--u)*3)] bottom-[calc(var(--u)*3)] flex flex-col">
            <div className="mb-[calc(var(--u)*0.8)] flex">
              <div className="flex max-w-[calc(var(--u)*56)] items-center rounded-full border border-line bg-surface px-[calc(var(--u)*1.6)] py-[calc(var(--u)*0.7)] shadow-card">
                <OferecimentoLivePeca anuncio={anuncio} variante="aba" previa />
              </div>
            </div>
            <div aria-hidden className="flex h-[calc(var(--u)*12)] items-stretch overflow-hidden rounded-[calc(var(--u)*2.2)] border border-line bg-surface shadow-card">
              <div className="flex w-[calc(var(--u)*33)] shrink-0 items-center gap-[calc(var(--u)*1.2)] border-r border-line bg-surface-2 px-[calc(var(--u)*1.8)]">
                <LogoMark size={40} className="h-[calc(var(--u)*4.8)] w-[calc(var(--u)*4.8)]" />
                <div className="min-w-0">
                  <span className="block h-[calc(var(--u)*1.1)] w-[calc(var(--u)*14)] rounded-full bg-surface-3" />
                  <span className="mt-[calc(var(--u)*0.7)] block whitespace-nowrap font-display text-[length:calc(var(--u)*2.5)] font-semibold leading-none tracking-[-0.02em] text-fg">
                    {DOMINIO_PADRAO}
                  </span>
                </div>
              </div>
              {/* placar em esboço (a vitrine de anúncios não mostra candidato, foto nem cor de candidato) */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-[calc(var(--u)*1)] px-[calc(var(--u)*2)]">
                <div className="flex items-center justify-between gap-[calc(var(--u)*2)]">
                  {[0, 1].map((k) => (
                    <div key={k} className={cn('flex flex-1 items-center gap-[calc(var(--u)*1.2)]', k === 1 && 'flex-row-reverse')}>
                      <span className="h-[calc(var(--u)*6.8)] w-[calc(var(--u)*6.8)] shrink-0 rounded-full bg-surface-3" />
                      <span className="h-[calc(var(--u)*2)] w-[40%] rounded-full bg-surface-3" />
                      <span className="ml-auto h-[calc(var(--u)*4.2)] w-[calc(var(--u)*14)] rounded-[calc(var(--u)*0.8)] bg-surface-3" />
                    </div>
                  ))}
                </div>
                <span className="h-[calc(var(--u)*1.1)] w-full rounded-full bg-surface-3" />
              </div>
              <div className="flex w-[calc(var(--u)*25)] shrink-0 flex-col justify-center gap-[calc(var(--u)*0.8)] border-l border-line bg-surface-2 px-[calc(var(--u)*1.8)]">
                <span className="h-[calc(var(--u)*3)] w-[70%] rounded-[calc(var(--u)*0.6)] bg-surface-3" />
                <span className="h-[calc(var(--u)*1.3)] w-[90%] rounded-full bg-surface-3" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <span aria-hidden className="absolute left-[3%] top-[5%] inline-flex items-center gap-1 rounded-md bg-fg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
        <span className="h-1.5 w-1.5 rounded-full bg-bg" />
        Ao vivo
      </span>
      <span className="absolute right-[3%] top-[5%] inline-flex items-center gap-1 rounded-md bg-surface/85 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted">
        <Icon name="ao-vivo" size={11} />
        Live no OBS · detalhe
      </span>
    </div>
  );
}
