/**
 * Esqueletos de carregamento com a forma real das páginas (evita "pulos" de layout).
 */
import { cn } from '@/app/lib/cn';
import { Skeleton } from '@/app/ui/Skeleton';
import { LoadingState } from '@/app/components/apuracao/States';

function TopoSk() {
  return (
    <div className="flex flex-col gap-4 pb-4 pt-5 sm:pb-6 sm:pt-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-9 w-72 max-w-full sm:h-11 sm:w-[26rem]" />
        <Skeleton className="h-6 w-56" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-56" rounded="lg" />
        <Skeleton className="h-10 w-10 lg:w-36" rounded="lg" />
      </div>
    </div>
  );
}

function CartaoSk({ className, altura = 'h-64' }: { className?: string; altura?: string }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-4 sm:p-5', className)}>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <Skeleton className={cn('mt-5 w-full', altura)} rounded="lg" />
    </div>
  );
}

export function NacionalEsqueleto() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando a apuração">
      <span className="sr-only">Carregando a apuração…</span>
      <TopoSk />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-4 lg:col-span-7 lg:space-y-6">
          <LoadingState variant="placar" label="Carregando o placar" />
          <CartaoSk altura="h-24" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-24 sm:w-40" rounded="lg" />
          </div>
          <Skeleton className="mt-3 h-8 w-full" rounded="lg" />
          <Skeleton className="mx-auto mt-5 aspect-[3/4] w-full max-w-[420px] md:aspect-square" rounded="lg" />
        </div>
        <CartaoSk className="lg:col-span-8" altura="h-56 sm:h-72" />
        <div className="hidden rounded-2xl border border-line bg-surface p-5 md:block lg:col-span-4">
          <LoadingState variant="lista" rows={5} />
        </div>
      </div>
    </div>
  );
}

export function GovernadoresEsqueleto() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando as disputas de governador">
      <span className="sr-only">Carregando…</span>
      <TopoSk />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <GovernadorCartaoSk key={i} />
        ))}
      </div>
    </div>
  );
}

export function GovernadorCartaoSk() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex gap-4">
        <Skeleton className="aspect-square w-[34%] max-w-[150px] shrink-0" rounded="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center gap-3">
              <Skeleton rounded="full" className="h-8 w-8" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
          <Skeleton className="h-2 w-full" rounded="full" />
        </div>
      </div>
    </div>
  );
}
