/**
 * Avatar do candidato no Teste Cego: foto oficial do TSE quando disponível (mesmo tamanho, recorte e tratamento
 * para os dois, sem edição) ou o monograma com a cor do slot. Quem decide se há foto é `useCandidatosTeste`
 * (pacote existe, foto dos dois, status não anonimizado).
 */
import type { Candidate } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { CandidateAvatar, type AvatarSize } from '@/app/components/apuracao/CandidateAvatar';

const caixa: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 p-[1.5px]',
  sm: 'h-8 w-8 p-[2px]',
  md: 'h-11 w-11 p-[2px]',
  lg: 'h-14 w-14 p-[2.5px]',
  xl: 'h-20 w-20 p-[3px]',
};

export function AvatarCandidato({
  candidato,
  foto,
  size = 'md',
  className,
}: {
  candidato: Candidate;
  foto?: string;
  size?: AvatarSize;
  /** Classes extras (inclusive de tamanho, que valem para foto e monograma). */
  className?: string;
}) {
  if (!foto) return <CandidateAvatar candidato={candidato} size={size} className={className} />;
  return (
    <span aria-hidden className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full', corSlot(candidato.cor).bg, caixa[size], className)}>
      <img src={foto} alt="" draggable={false} className="h-full w-full rounded-full bg-surface-2 object-cover object-top" />
    </span>
  );
}
