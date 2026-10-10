/**
 * Local de votação de uma seção (escola, endereço, bairro) com atalhos "Abrir no mapa" (OpenStreetMap e
 * Google Maps, em nova aba, pelas coordenadas do TSE — ou pelo endereço quando não há coordenadas).
 * Fonte: eleitorado_local_votacao_2026 (dados abertos do TSE).
 */
import type { LocalResumo } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

export function linksMapa(local: LocalResumo, municipio?: string, uf?: string): { osm: string; google: string } {
  if (typeof local.lat === 'number' && typeof local.lon === 'number') {
    const lat = local.lat.toFixed(6);
    const lon = local.lon.toFixed(6);
    return {
      osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
      google: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    };
  }
  const q = [local.nome, local.endereco, local.bairro, municipio, uf].filter(Boolean).join(', ');
  return {
    osm: `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`,
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
  };
}

export function LocalVotacaoCartao({
  local,
  municipio,
  uf,
  titulo = 'Local de votação',
  compacto,
  className,
}: {
  local: LocalResumo;
  municipio?: string;
  uf?: string;
  titulo?: string;
  compacto?: boolean;
  className?: string;
}) {
  const { osm, google } = linksMapa(local, municipio, uf);
  const linha2 = [local.endereco, local.bairro].filter(Boolean).join(' · ');
  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-card',
        compacto ? 'p-3.5' : 'p-4 sm:p-5',
        className,
      )}
      aria-label={titulo}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="pin" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{titulo}</p>
          <h3 className={cn('mt-0.5 text-balance font-display font-semibold leading-snug text-fg', compacto ? 'text-[15.5px]' : 'text-[17px]')}>
            {local.nome}
          </h3>
          {linha2 ? <p className="mt-0.5 text-pretty text-[13.5px] leading-snug text-fg-muted">{linha2}</p> : null}
          {municipio ? (
            <p className="text-[12.5px] text-fg-subtle">
              {municipio}
              {uf ? ` (${uf})` : ''}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-full text-[11.5px] font-medium text-fg-muted min-[420px]:w-auto">Abrir no mapa:</span>
            <a
              href={osm}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-line/[2.5] hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon name="mapa" size={14} />
              OpenStreetMap
              <Icon name="externo" size={12} className="text-fg-muted" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
            <a
              href={google}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-line/[2.5] hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon name="pin" size={14} />
              Google Maps
              <Icon name="externo" size={12} className="text-fg-muted" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
