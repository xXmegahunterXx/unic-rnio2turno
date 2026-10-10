/**
 * Botão "Incorporar" (ícone </>): abre o diálogo com o código do iframe. Sem `opcoes`, deduz a disputa do `?race=`
 * da página (2º turno; o 1º turno vira o placar do Presidente).
 */
import { useSearchParams } from 'react-router-dom';
import { UFS_GOV_2T } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { abrirIncorporar, preCarregarIncorporar } from '@/app/components/layout/acoesGlobais';
import { IconeQualquer } from '@/app/components/layout/IconesExtras';
import type { OpcoesEmbed } from './codigo';

const RACES = new Set(['pres', ...UFS_GOV_2T.map((u) => `gov-${u.toLowerCase()}`)]);

export function BotaoIncorporar({ opcoes, compacto, className }: { opcoes?: Partial<OpcoesEmbed>; compacto?: boolean; className?: string }) {
  const [params] = useSearchParams();
  const abrir = () => {
    const race = (params.get('race') ?? 'pres').toLowerCase();
    abrirIncorporar(opcoes ?? { tipo: 'placar', race: RACES.has(race) ? race : 'pres' });
  };
  return (
    <button
      type="button"
      onClick={abrir}
      onPointerEnter={preCarregarIncorporar}
      onFocus={preCarregarIncorporar}
      aria-haspopup="dialog"
      aria-label="Incorporar no seu site"
      title="Incorporar no seu site"
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl text-[14px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        compacto ? 'w-9' : 'px-3',
        className,
      )}
    >
      <IconeQualquer name="codigo" size={18} />
      {compacto ? null : <span>Incorporar</span>}
    </button>
  );
}
