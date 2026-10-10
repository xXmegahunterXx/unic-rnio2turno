/**
 * Foto oficial do TSE (pacotes em public/data/fotos) com o MESMO tamanho, recorte e tratamento para todos —
 * sem filtro, sem edição (só redimensionar/recortar). Sem foto (ou na simulação anonimizada, quando não for
 * dado real): monograma neutro com as iniciais.
 *
 * Dados dos cargos do 1º turno e fichas são reais → `real` (padrão true aqui). Para candidatos da apuração
 * simulada passe `real={false}`: `useFotoCandidato` bloqueia a foto quando `status.anonimizado`.
 */
import { cn } from '@/app/lib/cn';
import { useFotoCandidato } from '@/app/data/estatico';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';

export type FotoTamanho = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'retrato';

const caixa: Record<FotoTamanho, string> = {
  xs: 'h-7 w-7 rounded-full text-[10.5px]',
  sm: 'h-9 w-9 rounded-full text-[12px]',
  md: 'h-12 w-12 rounded-full text-[15px]',
  lg: 'h-16 w-16 rounded-full text-[19px]',
  // retrato 3:4 (formato das fotos do TSE)
  xl: 'h-[88px] w-[66px] rounded-xl text-[22px]',
  retrato: 'h-[160px] w-[120px] rounded-2xl text-[34px]',
};

export interface FotoOficialProps {
  sqcand?: string;
  fotoGrupo?: string;
  nome: string;
  tamanho?: FotoTamanho;
  /** Dado real (cargos/fichas do 1º turno). Padrão: true. */
  real?: boolean;
  className?: string;
}

export function FotoOficial({ sqcand, fotoGrupo, nome, tamanho = 'md', real = true, className }: FotoOficialProps) {
  const foto = useFotoCandidato(sqcand ? { sqcand, fotoGrupo } : undefined, { real });
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-surface-3 ring-1 ring-inset ring-line',
        caixa[tamanho],
        className,
      )}
    >
      {foto ? (
        <img
          src={foto}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <span className="font-display font-semibold tracking-[-0.02em] text-fg-muted">{iniciais(nome)}</span>
      )}
    </span>
  );
}
