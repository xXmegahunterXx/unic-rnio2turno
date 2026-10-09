/**
 * UF com um único município (o Distrito Federal = Brasília): um mapa de municípios, destaques e tabela
 * não dizem nada. No lugar, mostramos direto TODAS as seções (mosaico) e o atalho para zonas e seções.
 */
import type { MunicipioSnapshot, Race, UF } from '@/shared/types';
import { fmtInt } from '@/shared/format';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Skeleton } from '@/app/ui/Skeleton';
import { SecaoMosaic } from '@/app/components/apuracao/SecaoMosaic';
import { comArtigo } from './fmt';

export interface MunicipioUnicoProps {
  race: Race;
  uf: UF;
  nomeUf: string;
  /** Nome do município (vem do UfSnapshot; o MunicipioSnapshot pode ainda estar carregando). */
  nome: string;
  snap: MunicipioSnapshot | undefined;
  /** Página do município. */
  to: string;
  onSecao: (zona: number, secao: number) => void;
  className?: string;
}

export function MunicipioUnico({ race, uf, nomeUf, nome, snap, to, onSecao, className }: MunicipioUnicoProps) {
  const t1 = race.turno === 1;
  return (
    <section aria-labelledby="mun-unico-titulo" className={className}>
      <div className="mb-3.5 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2
            id="mun-unico-titulo"
            className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]"
          >
            Todas as seções de {nome}
          </h2>
          <p className="mt-1 max-w-2xl text-pretty text-[13.5px] leading-snug text-fg-muted sm:text-sm">
            {comArtigo(uf, nomeUf)} tem um só município, {nome}; por isso não há mapa de municípios.{' '}
            {snap ? (
              <>
                São <span className="num">{fmtInt(snap.mosaico.length)}</span> zonas eleitorais e{' '}
                <span className="num">{fmtInt(snap.resumo.secoes)}</span> seções
                {t1 ? ', pintadas pelo resultado do 1º turno.' : '. Toque numa seção para ver o boletim de urna.'}
              </>
            ) : null}
          </p>
        </div>
        <ButtonLink to={to} variant="secondary" iconRight="seta" className="shrink-0 self-start sm:self-auto">
          Zonas e seções
        </ButtonLink>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-5">
        {snap ? (
          snap.mosaico.length > 0 ? (
            <SecaoMosaic mosaico={snap.mosaico} race={race} onSelect={onSecao} />
          ) : (
            <p className="flex items-center justify-center gap-2 py-10 text-center text-[14px] text-fg-muted">
              <Icon name="info" size={16} />O mosaico de seções não está disponível para esta fonte de dados.
            </p>
          )
        ) : (
          <div aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(10px,1fr))] gap-[3px]">
            {Array.from({ length: 320 }, (_, i) => (
              <Skeleton key={i} rounded="sm" className="aspect-square" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
