/**
 * Esqueletos com a forma real das páginas de detalhe (evitam "pulos" de layout ao carregar).
 * Seguem a mesma ordem das páginas: no desktop, placar + painel lateral, participação e mapa/mosaico; no
 * celular, o mapa (UF) ou o mosaico (município) logo depois do placar.
 */
import { cn } from '@/app/lib/cn';
import { Skeleton } from '@/app/ui/Skeleton';
import { LoadingState } from '@/app/components/apuracao/States';

function Cabecalho({ trilha = 2 }: { trilha?: number }) {
  return (
    <div className="space-y-3 pb-5 pt-5 sm:pb-8 sm:pt-8">
      <div className="flex gap-2">
        {Array.from({ length: trilha }, (_, i) => (
          <Skeleton key={i} className="h-3.5 w-16" />
        ))}
      </div>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-9 w-64 max-w-full sm:h-11 sm:w-96" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="mt-2 h-8 w-40 rounded-xl" />
    </div>
  );
}

/** Cartão lateral do placar ("o que falta" / 1º × 2º turno): só no desktop. */
function Lateral() {
  return (
    <div className="hidden h-full rounded-2xl border border-line bg-surface p-5 lg:block">
      <Skeleton className="h-3 w-36" />
      <Skeleton className="mt-5 h-9 w-48" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-6 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-6 h-2 w-full" rounded="full" />
      <Skeleton className="mt-6 h-3 w-40" />
    </div>
  );
}

function Mapa() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-line bg-surface p-3 sm:p-5">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center md:gap-6">
          <Skeleton className="h-11 w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2.5 w-full" rounded="full" />
          </div>
        </div>
        <Skeleton className="aspect-[4/3] w-full rounded-xl" />
        <div className="mt-4 flex gap-4 border-t border-line pt-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="hidden space-y-3 lg:block">
        <Skeleton className="h-3 w-20" />
        <LoadingState variant="placar-compacto" />
        <LoadingState variant="placar-compacto" />
      </div>
    </div>
  );
}

function Mosaico({ celulas = 240 }: { celulas?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-5">
      <Skeleton className="mb-4 h-3.5 w-56" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10px,1fr))] gap-[3px]">
        {Array.from({ length: celulas }, (_, i) => (
          <Skeleton key={i} rounded="sm" className={cn('aspect-square', i % 41 === 0 && 'col-span-2')} />
        ))}
      </div>
    </div>
  );
}

function Titulo({ w = 'w-56' }: { w?: string }) {
  return (
    <div className="mb-4 space-y-2">
      <Skeleton className={cn('h-6', w)} />
      <Skeleton className="h-3.5 w-72 max-w-full" />
    </div>
  );
}

export function EsqueletoUf() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando o estado">
      <Cabecalho trilha={2} />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LoadingState variant="placar" />
        </div>
        <div className="hidden lg:col-span-4 lg:block">
          <Lateral />
        </div>
      </div>
      <div className="mt-4 hidden lg:block">
        <LoadingState variant="stats" />
      </div>
      <div className="mt-8">
        <Titulo />
        <Mapa />
      </div>
      <div className="mt-8">
        <Titulo w="w-40" />
        <LoadingState variant="tabela" rows={6} />
      </div>
    </div>
  );
}

export function EsqueletoMunicipio() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando o município">
      <Cabecalho trilha={3} />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LoadingState variant="placar" />
        </div>
        <div className="hidden lg:col-span-4 lg:block">
          <Lateral />
        </div>
      </div>
      <div className="mt-4 hidden lg:block">
        <LoadingState variant="stats" />
      </div>
      <div className="mt-8">
        <Titulo w="w-48" />
        <Mosaico />
      </div>
      <div className="mt-8">
        <Titulo w="w-44" />
        <LoadingState variant="tabela" rows={6} />
      </div>
    </div>
  );
}

export function EsqueletoSecao() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando o boletim">
      <Cabecalho trilha={5} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10">
        <LoadingState variant="boletim" />
        <div className="space-y-4">
          <Skeleton className="h-[72px] w-full rounded-2xl" />
          <LoadingState variant="placar-compacto" />
          <LoadingState variant="lista" rows={4} />
        </div>
      </div>
    </div>
  );
}
