/**
 * Monograma do candidato (nunca foto — ARCHITECTURE §1.1): iniciais com anel na cor do slot.
 * CandidateName: nome de urna + partido/número/vice.
 */
import type { Candidate, CorCandidato } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';

const TITULOS = new Set([
  'prof', 'prof.', 'profª', 'profa', 'profa.', 'professor', 'professora', 'dr', 'dr.', 'dra', 'dra.', 'doutor', 'doutora',
  'coronel', 'cel', 'cel.', 'capitão', 'capitao', 'cap', 'delegado', 'delegada', 'del', 'pastor', 'pastora', 'general',
  'sargento', 'tenente', 'major', 'irmão', 'irmã', 'padre', 'missionário', 'missionária', 'deputado', 'deputada',
  'senador', 'senadora', 'vereador', 'vereadora', 'juiz', 'juíza', 'comandante', 'cabo', 'soldado',
]);
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);

/** "Flávio Bolsonaro" → "FB"; "Lula" → "L"; "Professora Maria do Carmo" → "MC". */
export function iniciais(nome: string): string {
  const partes = nome
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let uteis = partes.filter((p) => !TITULOS.has(p.toLowerCase()) && !LIGACOES.has(p.toLowerCase()));
  if (uteis.length === 0) uteis = partes;
  if (uteis.length === 1) return uteis[0].charAt(0).toUpperCase();
  return (uteis[0].charAt(0) + uteis[uteis.length - 1].charAt(0)).toUpperCase();
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const tamanhos: Record<AvatarSize, { box: string; txt: string; ring: string; selo: number }> = {
  xs: { box: 'h-6 w-6', txt: 'text-[10px]', ring: 'ring-[1.5px]', selo: 10 },
  sm: { box: 'h-8 w-8', txt: 'text-[12px]', ring: 'ring-2', selo: 12 },
  md: { box: 'h-11 w-11', txt: 'text-[15px]', ring: 'ring-2', selo: 14 },
  lg: { box: 'h-14 w-14', txt: 'text-[19px]', ring: 'ring-[2.5px]', selo: 16 },
  xl: { box: 'h-20 w-20', txt: 'text-[26px]', ring: 'ring-[3px]', selo: 20 },
};

export interface CandidateAvatarProps {
  /** Candidato (usa nomeUrna e cor) — ou passe `nome` + `cor`. */
  candidato?: Pick<Candidate, 'nomeUrna' | 'cor'>;
  nome?: string;
  cor?: CorCandidato;
  size?: AvatarSize;
  /** Selo de check (eleito). */
  eleito?: boolean;
  /** Atenua (ex.: quem não lidera numa linha compacta). */
  dim?: boolean;
  className?: string;
}

export function CandidateAvatar({ candidato, nome, cor, size = 'md', eleito, dim, className }: CandidateAvatarProps) {
  const n = candidato?.nomeUrna ?? nome ?? '?';
  const c = candidato?.cor ?? cor ?? 'outros';
  const s = corSlot(c);
  const t = tamanhos[size];
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold tracking-[-0.02em]',
        'ring-inset',
        t.box,
        t.txt,
        t.ring,
        s.ring,
        s.bgSoft,
        s.text,
        dim && 'opacity-60 saturate-50',
        className,
      )}
    >
      {iniciais(n)}
      {eleito ? (
        <span className={cn('absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full ring-2 ring-surface', s.bg, s.ink)} style={{ width: t.selo + 4, height: t.selo + 4 }}>
          <Icon name="check" size={t.selo} strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}

export interface CandidateNameProps {
  candidato: Candidate;
  /** Mostra "PT · 13". Padrão true. */
  showPartido?: boolean;
  showNumero?: boolean;
  /** Mostra "Vice: …". */
  showVice?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  align?: 'left' | 'right';
  /** Pinta o nome na cor do slot. */
  colored?: boolean;
  className?: string;
}

const nomeTam = {
  sm: 'text-[14px] font-semibold',
  md: 'text-[16px] font-semibold',
  lg: 'text-[19px] sm:text-[22px] font-semibold tracking-[-0.015em]',
  xl: 'text-[22px] sm:text-[30px] font-semibold tracking-[-0.025em]',
};

export function CandidateName({
  candidato,
  showPartido = true,
  showNumero = true,
  showVice = false,
  size = 'md',
  align = 'left',
  colored,
  className,
}: CandidateNameProps) {
  const s = corSlot(candidato.cor);
  const meta = [showPartido ? candidato.partido : null, showNumero && !candidato.agregado ? String(candidato.numero) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <span className={cn('flex min-w-0 flex-col', align === 'right' && 'items-end text-right', className)}>
      <span className={cn('max-w-full text-balance font-display leading-[1.1] text-fg', nomeTam[size], colored && s.text)}>
        {candidato.nomeUrna}
      </span>
      {meta ? <span className="num mt-1 whitespace-nowrap text-[12.5px] leading-tight text-fg-muted">{meta}</span> : null}
      {showVice && candidato.vice ? (
        <span className="mt-0.5 max-w-full truncate text-[12.5px] leading-tight text-fg-muted">Vice: {candidato.vice}</span>
      ) : null}
    </span>
  );
}
