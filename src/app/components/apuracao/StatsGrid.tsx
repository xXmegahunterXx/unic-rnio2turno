/**
 * Indicadores de participação: eleitorado, comparecimento, abstenção, brancos e nulos (valores e %).
 * Percentuais seguem as regras do TSE (src/shared/calc.ts): comparecimento/abstenção sobre o eleitorado
 * das seções totalizadas; brancos/nulos sobre o comparecimento.
 */
import type { Tally } from '@/shared/types';
import { pctAbstencao, pctBrancos, pctComparecimento, pctNulos, validos } from '@/shared/calc';
import { fmtCompact, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';

export interface StatsGridProps {
  t: Tally;
  /** Inclui o card de votos válidos. Padrão false. */
  showValidos?: boolean;
  /** 'cards' (grade de cartões) ou 'list' (linhas, para colunas estreitas). */
  variant?: 'cards' | 'list';
  className?: string;
}

interface Item {
  key: string;
  label: string;
  icon: IconName;
  valor: number;
  pct: number | null;
  sub: string;
  barra: string;
}

export function StatsGrid({ t, showValidos, variant = 'cards', className }: StatsGridProps) {
  const temDados = t.eleitoradoTotalizado > 0;
  const itens: Item[] = [
    {
      key: 'eleitorado',
      label: 'Eleitorado',
      icon: 'usuarios',
      valor: t.eleitorado,
      pct: null,
      sub: temDados ? `${fmtCompact(t.eleitoradoTotalizado)} em seções totalizadas` : 'eleitores aptos',
      barra: 'bg-fg-muted',
    },
    {
      key: 'comparecimento',
      label: 'Comparecimento',
      icon: 'urna',
      valor: t.comparecimento,
      pct: temDados ? pctComparecimento(t) : null,
      sub: 'do eleitorado apurado',
      barra: 'bg-brand',
    },
    {
      key: 'abstencao',
      label: 'Abstenção',
      icon: 'relogio',
      valor: t.abstencao,
      pct: temDados ? pctAbstencao(t) : null,
      sub: 'do eleitorado apurado',
      barra: 'bg-fg-subtle',
    },
    {
      key: 'brancos',
      label: 'Brancos',
      icon: 'menos',
      valor: t.brancos,
      pct: t.comparecimento > 0 ? pctBrancos(t) : null,
      sub: 'do comparecimento',
      barra: 'bg-cand-outros',
    },
    {
      key: 'nulos',
      label: 'Nulos',
      icon: 'fechar',
      valor: t.nulos,
      pct: t.comparecimento > 0 ? pctNulos(t) : null,
      sub: 'do comparecimento',
      barra: 'bg-cand-outros',
    },
  ];
  if (showValidos) {
    const v = validos(t);
    itens.splice(3, 0, {
      key: 'validos',
      label: 'Válidos',
      icon: 'check',
      valor: v,
      pct: t.comparecimento > 0 ? (v / t.comparecimento) * 100 : null,
      sub: 'do comparecimento',
      barra: 'bg-ok',
    });
  }

  if (variant === 'list') {
    return (
      <dl className={cn(className)}>
        {itens.map((it) => (
          <div key={it.key} className="flex items-center gap-3 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
              <Icon name={it.icon} size={16} />
            </span>
            <dt className="min-w-0 flex-1 text-[14px] text-fg-muted">{it.label}</dt>
            <dd className="text-right">
              <div className="num text-[15px] font-semibold text-fg">{fmtInt(it.valor)}</div>
              {it.pct !== null ? <div className="num text-[12px] text-fg-muted">{fmtPct(it.pct)}</div> : null}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className={cn('grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5', showValidos && 'lg:grid-cols-6', className)}>
      {itens.map((it, i) => (
        <div
          key={it.key}
          className={cn(
            'min-w-0 rounded-2xl border border-line bg-surface p-3.5 sm:p-4',
            i === 0 && itens.length % 2 === 1 && 'col-span-2 lg:col-span-1',
          )}
        >
          <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
            <Icon name={it.icon} size={14} />
            {it.label}
          </dt>
          <dd className="mt-2">
            {it.pct !== null ? (
              <NumberRoll value={it.pct} format={(n) => fmtPct(n)} smallChars="%" className="font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[26px]" />
            ) : (
              <NumberRoll value={it.valor} format={fmtCompactSeguro} className="font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[26px]" />
            )}
            <div className="num mt-1.5 text-[13px] font-medium leading-tight text-fg">{fmtInt(it.valor)}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-fg-muted">{it.sub}</div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div
                className={cn('h-full rounded-full transition-[width] duration-700 ease-out', it.barra)}
                style={{ width: `${it.pct ?? (temDados && t.eleitorado > 0 ? (t.eleitoradoTotalizado / t.eleitorado) * 100 : 0)}%` }}
              />
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "158,7 mi" sem quebrar o NumberRoll (o formatador compacto usa espaço não separável). */
const fmtCompactSeguro = (n: number) => fmtCompact(n).replace(/ /g, ' ');
