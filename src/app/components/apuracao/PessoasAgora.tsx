/**
 * "N pessoas agora · estimativa": pílula discreta com o número estimado de visitantes ativos (`LiveStatus.pessoasAgora`).
 * Só existe no servidor; no demo o campo não vem e a pílula NÃO aparece — nunca inventamos número. Desde a leva 3 (I09)
 * o servidor só manda o número a partir de PISO_PESSOAS_PUBLICO (500) e com a chave 'contador-publico' ligada no painel;
 * o rótulo "estimativa" fica sempre junto (é contagem de sinais, arredondada — não é medição exata).
 * Não é enquete nem preferência: é só audiência do site (ARCHITECTURE §1.2).
 */
import type { LiveStatus } from '@/shared/types';
import { fmtCompact, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

/** "1 pessoa", "842 pessoas", "12,3 mil pessoas", "1,2 mi pessoas". */
export function textoPessoas(n: number): string {
  const v = n >= 10_000 ? fmtCompact(n) : fmtInt(n);
  return `${v} ${n === 1 ? 'pessoa' : 'pessoas'}`;
}

/** Número válido de pessoas agora (ou null para não mostrar). */
export function pessoasAgora(status: Pick<LiveStatus, 'pessoasAgora'> | undefined | null): number | null {
  const n = status?.pessoasAgora;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function PessoasAgora({
  status,
  variant = 'pill',
  className,
}: {
  status: Pick<LiveStatus, 'pessoasAgora'> | undefined | null;
  /** 'pill' (pílula com borda) ou 'inline' (texto, para dentro de outra pílula). */
  variant?: 'pill' | 'inline';
  className?: string;
}) {
  const n = pessoasAgora(status);
  if (n === null) return null;
  const texto = `${textoPessoas(n)} agora`;
  const rotulo = <span className="font-medium text-fg-subtle">· estimativa</span>;
  if (variant === 'inline') {
    return (
      <span className={cn('num inline-flex items-center gap-1.5 text-fg-muted', className)} title="Pessoas acompanhando o Sintonia agora (estimativa)">
        <Icon name="usuarios" size={14} />
        {texto}
        {rotulo}
      </span>
    );
  }
  return (
    <span
      className={cn('num inline-flex h-6 items-center gap-1.5 rounded-lg bg-surface-3 px-2 text-xs font-semibold text-fg-muted', className)}
      title="Pessoas acompanhando o Sintonia agora (estimativa de visitantes ativos)"
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-2 opacity-60 motion-reduce:hidden" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-brand-2" />
      </span>
      {texto}
      {rotulo}
    </span>
  );
}
