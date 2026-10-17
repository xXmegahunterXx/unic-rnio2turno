/**
 * Texto e validação do "N pessoas agora" (`LiveStatus.pessoasAgora`), sem JSX: o cabeçalho (StatusPill, no JS inicial)
 * importa daqui, e a pílula `PessoasAgora` (só na página nacional) fica fora do pacote principal.
 */
import type { LiveStatus } from '@/shared/types';
import { fmtCompact, fmtInt } from '@/shared/format';

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
