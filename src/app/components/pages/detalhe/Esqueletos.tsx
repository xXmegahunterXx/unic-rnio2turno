/**
 * Esqueletos com a forma real das páginas de detalhe (evitam "pulos" de layout ao carregar).
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
      <Skeleton className="mt-2 h-9 w-56 rounded-xl" />
    </div>
  );
}

function Mapa() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap gap-3">
        <Skeleton className="h-11 w-full rounded-xl sm:w-72" />
        <Skeleton className="h-9 w-72 max-w-full rounded-xl" />
      </div>
      <Skeleton className="aspect-[4/3] w-full rounded-xl lg:aspect-[16/10]" />
      <div className="mt-4 flex gap-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export function EsqueletoUf() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando o estado">
      <Cabecalho trilha={2} />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="space-y-3 sm:space-y-4 lg:col-span-8">
          <LoadingState variant="placar" />
          <LoadingState variant="stats" />
        </div>
        <div className="space-y-3 sm:space-y-4 lg:col-span-4">
          <LoadingState variant="placar-compacto" />
          <LoadingState variant="placar-compacto" />
        </div>
      </div>
      <div className="mt-8">
        <Skeleton className="mb-4 h-6 w-56" />
        <Mapa />
      </div>
      <div className="mt-8">
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
        <div className="space-y-3 sm:space-y-4 lg:col-span-8">
          <LoadingState variant="placar" />
          <LoadingState variant="stats" />
        </div>
        <div className="lg:col-span-4">
          <LoadingState variant="placar-compacto" />
        </div>
      </div>
      <div className="mt-8">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10px,1fr))] gap-[3px]">
            {Array.from({ length: 240 }, (_, i) => (
              <Skeleton key={i} rounded="sm" className={cn('aspect-square', i % 41 === 0 && 'col-span-2')} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8">
        <LoadingState variant="tabela" rows={6} />
      </div>
    </div>
  );
}

export function EsqueletoSecao() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando o boletim">
      <Cabecalho trilha={5} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <LoadingState variant="boletim" />
        <div className="space-y-4">
          <LoadingState variant="placar-compacto" />
          <LoadingState variant="lista" rows={4} />
        </div>
      </div>
    </div>
  );
}
