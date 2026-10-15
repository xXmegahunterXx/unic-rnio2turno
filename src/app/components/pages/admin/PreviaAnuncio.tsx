/**
 * Prévia de um anúncio no painel, formato a formato (topo, rodapé, nativo, Teste Cego, Modo TV, imagens).
 *
 * Usa os componentes REAIS do site (src/app/components/anuncios, `VitrineFormato`) em modo prévia: sem link, sem
 * contagem de impressão — o que aparece aqui é exatamente o que vai ao ar. A assinatura (`anuncio` no formato
 * `AnuncioPublico`) é a mesma que o site usa.
 *
 * Regras visíveis também na prévia: sempre rotulado ("Publicidade", "Patrocinado", "Oferecido por"), sem animação,
 * separado de qualquer conteúdo eleitoral.
 */
import { useEffect, useState } from 'react';
import type { AnuncioPublico, FormatoAnuncio } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Segmented } from '@/app/ui';
import { LogoMarca, VitrineFormato, type TamanhoLogo } from '@/app/components/anuncios';
import { ROTULO_CURTO } from './anunciosAdmin';

/** Tamanhos do painel → tamanhos da logo do site (mesma placa clara e as mesmas iniciais sem logo). */
const TAMANHO: Record<'sm' | 'md' | 'lg' | 'xl', TamanhoLogo> = { sm: 'xs', md: 'sm', lg: 'md', xl: 'xl' };

export function LogoAnuncio({ anuncio, className, tamanho = 'md' }: { anuncio: Pick<AnuncioPublico, 'logo' | 'marca'>; className?: string; tamanho?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return <LogoMarca anuncio={anuncio} tamanho={TAMANHO[tamanho]} className={className} />;
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
      <VitrineFormato anuncio={anuncio} formato={ver} estreita />
    </div>
  );
}
