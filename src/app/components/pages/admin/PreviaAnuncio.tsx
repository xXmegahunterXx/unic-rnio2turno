/**
 * Prévia de um anúncio no painel, formato a formato (topo, rodapé, nativo, Teste Cego, Modo TV, imagens).
 *
 * PONTO DE TROCA: esta é uma prévia SIMPLES, desenhada aqui no admin. Quando os componentes reais do site existirem
 * (src/app/components/anuncios/*), troque o corpo de `PreviaFormato` por eles — a assinatura (`anuncio` no formato
 * `AnuncioPublico` + `formato`) é a mesma que o site usa, então basta renderizar o componente do formato escolhido.
 *
 * Regras visíveis também na prévia: sempre rotulado ("Publicidade", "Patrocinado", "Oferecido por"), sem animação,
 * separado de qualquer conteúdo eleitoral.
 */
import { useEffect, useState } from 'react';
import type { AnuncioPublico, FormatoAnuncio } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Icon, Segmented } from '@/app/ui';
import { LogoMark } from '@/app/components/layout/Logo';
import { ROTULO_CURTO } from './anunciosAdmin';

/** Iniciais da marca (sem logo). */
const iniciais = (marca: string) =>
  marca
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function LogoAnuncio({ anuncio, className, tamanho = 'md' }: { anuncio: Pick<AnuncioPublico, 'logo' | 'marca'>; className?: string; tamanho?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const caixa = { sm: 'h-6 w-6 rounded-md text-[10px]', md: 'h-9 w-9 rounded-lg text-[12px]', lg: 'h-12 w-12 rounded-xl text-[15px]', xl: 'h-16 w-16 rounded-2xl text-[20px]' }[tamanho];
  if (anuncio.logo)
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden bg-brand-ink p-1 ring-1 ring-inset ring-line', caixa, className)}>
        <img src={anuncio.logo} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center bg-surface-3 font-display font-semibold text-fg-muted ring-1 ring-inset ring-line', caixa, className)}>
      {iniciais(anuncio.marca)}
    </span>
  );
}

function Rotulo({ children, className }: { children: string; className?: string }) {
  return <span className={cn('text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle', className)}>{children}</span>;
}

function Cta({ texto, className }: { texto: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-[10px] bg-fg px-3 text-[12.5px] font-semibold text-bg', className)}>
      {texto || 'Botão'}
      <Icon name="externo" size={13} />
    </span>
  );
}

/** Esqueleto de conteúdo (página do site) em volta da peça. */
function Conteudo({ linhas = 2 }: { linhas?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className={cn('h-2.5 rounded-full bg-surface-3', i % 2 ? 'w-2/3' : 'w-5/6')} />
      ))}
    </div>
  );
}

function PreviaFormato({ anuncio: a, formato }: { anuncio: AnuncioPublico; formato: FormatoAnuncio }) {
  switch (formato) {
    case 'topo':
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <div className="flex h-10 items-center gap-2 border-b border-line bg-surface/70 px-3">
            <LogoMark size={20} />
            <span className="font-display text-[14px] font-semibold tracking-[-0.02em] text-fg">Sintonia</span>
          </div>
          <div className="flex items-center gap-2.5 border-b border-line bg-surface-2 px-3 py-2">
            <Rotulo className="hidden min-[360px]:inline">Publicidade</Rotulo>
            <LogoAnuncio anuncio={a} tamanho="sm" />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              <span className="font-semibold text-fg">{a.marca}</span>
              <span className="text-fg-muted"> · {a.titulo}</span>
            </span>
            <Cta texto={a.cta} className="h-7 px-2.5 text-[12px]" />
          </div>
          <div className="space-y-3 p-3">
            <Conteudo />
            <div className="h-16 rounded-xl bg-surface-2" aria-hidden />
          </div>
        </div>
      );
    case 'rodape':
      return (
        <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border border-line bg-bg">
          <div className="space-y-3 p-4 pb-6">
            <Conteudo linhas={3} />
            <div className="h-24 rounded-xl bg-surface-2" aria-hidden />
            <Conteudo />
          </div>
          <div className="border-t border-line bg-surface px-3 py-2.5">
            <div className="flex items-center gap-2">
              <LogoAnuncio anuncio={a} tamanho="sm" />
              <div className="min-w-0 flex-1 leading-tight">
                <Rotulo>Publicidade</Rotulo>
                <p className="truncate text-[12.5px] font-semibold text-fg">{a.titulo}</p>
              </div>
              <Cta texto={a.cta} className="h-7 px-2.5 text-[11.5px]" />
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle" aria-hidden>
                <Icon name="fechar" size={14} />
              </span>
            </div>
          </div>
        </div>
      );
    case 'nativo':
      return (
        <div className="rounded-2xl border border-line bg-bg p-3">
          <Conteudo />
          <article className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <Rotulo>Patrocinado</Rotulo>
              <span className="truncate text-[11.5px] text-fg-subtle">{a.destino || 'site do anunciante'}</span>
            </div>
            {a.imagem ? (
              <div className="mx-4 mt-3 flex max-h-56 items-center justify-center overflow-hidden rounded-xl bg-surface-2">
                <img src={a.imagem} alt="" className="max-h-56 w-auto max-w-full object-contain" />
              </div>
            ) : null}
            <div className="flex items-start gap-3 px-4 pb-4 pt-3">
              <LogoAnuncio anuncio={a} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-fg-muted">{a.marca}</p>
                <p className="mt-0.5 text-balance font-display text-[17px] font-semibold leading-snug tracking-[-0.01em] text-fg">{a.titulo}</p>
                {a.texto ? <p className="mt-1 text-pretty text-[13px] leading-snug text-fg-muted">{a.texto}</p> : null}
                <Cta texto={a.cta} className="mt-3" />
              </div>
            </div>
          </article>
        </div>
      );
    case 'teste':
      return (
        <div className="rounded-2xl border border-line bg-bg p-4">
          <div className="rounded-xl bg-surface-2 p-4 text-center" aria-hidden>
            <Rotulo>Seu resultado</Rotulo>
            <div className="mx-auto mt-2 h-4 w-40 rounded-full bg-surface-3" />
            <div className="mx-auto mt-2 h-2.5 w-28 rounded-full bg-surface-3" />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 border-t border-line pt-3">
            <Rotulo>Resultado oferecido por</Rotulo>
            <LogoAnuncio anuncio={a} tamanho="sm" />
            <span className="text-[13px] font-semibold text-fg">{a.marca}</span>
          </div>
        </div>
      );
    case 'tv':
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <div className="aspect-video p-4">
            <div className="flex h-full flex-col">
              <div className="flex-1 rounded-xl bg-surface-2" aria-hidden />
              <div className="mt-3 flex items-center justify-end gap-3">
                <Rotulo className="text-[11px]">Oferecido por</Rotulo>
                <LogoAnuncio anuncio={a} tamanho="lg" />
                <span className="font-display text-[18px] font-semibold text-fg">{a.marca}</span>
              </div>
            </div>
          </div>
        </div>
      );
    case 'compartilhamento':
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <div className="relative aspect-[1200/630] w-full">
            <div className="absolute inset-0 flex flex-col p-4" aria-hidden>
              <div className="flex items-center gap-2">
                <LogoMark size={18} />
                <span className="font-display text-[12px] font-semibold text-fg">Sintonia</span>
              </div>
              <div className="mt-3 h-3 w-24 rounded-full bg-surface-3" />
              <div className="mt-2 flex flex-1 items-end gap-2 pb-2">
                <div className="h-2/3 flex-1 rounded-lg bg-surface-2" />
                <div className="h-2/3 flex-1 rounded-lg bg-surface-2" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-[5.1%] min-h-[14px] items-center justify-end gap-1 border-t border-line bg-surface px-[5%] text-[9px] sm:text-[10px]">
              <span className="text-fg-subtle">Oferecimento:</span>
              <span className="font-semibold text-fg">{a.marca}</span>
            </div>
          </div>
        </div>
      );
  }
}

export function PreviaAnuncio({ anuncio, className }: { anuncio: AnuncioPublico; className?: string }) {
  const formatos = anuncio.formatos;
  const [ver, setVer] = useState<FormatoAnuncio | null>(formatos[0] ?? null);
  useEffect(() => {
    if (!ver || !formatos.includes(ver)) setVer(formatos[0] ?? null);
  }, [formatos, ver]);
  if (!ver)
    return (
      <div className={cn('rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-fg-subtle', className)}>
        Escolha pelo menos um formato para ver a prévia.
      </div>
    );
  return (
    <div className={className}>
      {formatos.length > 1 ? (
        <div className="-mx-1 mb-3 overflow-x-auto px-1 pb-1 scrollbar-none">
          <Segmented
            ariaLabel="Formato da prévia"
            size="sm"
            value={ver}
            onChange={(v) => setVer(v)}
            options={formatos.map((f) => ({ value: f, label: ROTULO_CURTO[f] }))}
          />
        </div>
      ) : null}
      <PreviaFormato anuncio={anuncio} formato={ver} />
    </div>
  );
}
