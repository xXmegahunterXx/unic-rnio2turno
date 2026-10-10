/**
 * Avatar do candidato: foto OFICIAL do TSE (quando passada em `foto`) ou o monograma (iniciais) — os dois com o
 * anel na cor do slot e exatamente o mesmo tamanho. A foto só é recortada em círculo (sem filtro nem edição).
 * Quem decide se há foto é quem chama, via `useFotosRace` (./fotos.ts): nunca na simulação anonimizada, e só
 * quando os dois finalistas têm foto (mesmo tratamento para todos — ARCHITECTURE §1.1).
 * CandidateName: nome de urna + partido/número/vice.
 */
import { useState } from 'react';
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
const tamanhos: Record<AvatarSize, { box: string; txt: string; ring: string; selo: number; moldura: string; filete: string }> = {
  xs: { box: 'h-6 w-6', txt: 'text-[10px]', ring: 'ring-[1.5px]', selo: 10, moldura: 'p-[1.5px]', filete: 'border' },
  sm: { box: 'h-8 w-8', txt: 'text-[12px]', ring: 'ring-2', selo: 12, moldura: 'p-[2px]', filete: 'border' },
  md: { box: 'h-11 w-11', txt: 'text-[15px]', ring: 'ring-2', selo: 14, moldura: 'p-[2px]', filete: 'border-[1.5px]' },
  lg: { box: 'h-14 w-14', txt: 'text-[19px]', ring: 'ring-[2.5px]', selo: 16, moldura: 'p-[2.5px]', filete: 'border-2' },
  xl: { box: 'h-20 w-20', txt: 'text-[26px]', ring: 'ring-[3px]', selo: 20, moldura: 'p-[3px]', filete: 'border-2' },
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
  /**
   * Foto oficial (data URI do pacote do TSE). Ausente/nula → monograma. Obtenha com `useFotosRace(race)[i]`, que já
   * aplica as regras (anonimização, tudo ou nada). Se a imagem falhar ao carregar, cai no monograma.
   */
  foto?: string | null;
  className?: string;
}

export function CandidateAvatar({ candidato, nome, cor, size = 'md', eleito, dim, foto, className }: CandidateAvatarProps) {
  const n = candidato?.nomeUrna ?? nome ?? '?';
  const c = candidato?.cor ?? cor ?? 'outros';
  const s = corSlot(c);
  const t = tamanhos[size];
  const [falhou, setFalhou] = useState<string | null>(null);
  const comFoto = !!foto && falhou !== foto;
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold tracking-[-0.02em]',
        t.box,
        comFoto ? [t.moldura, s.bg] : ['ring-inset', t.txt, t.ring, s.ring, s.bgSoft, s.text],
        dim && (comFoto ? 'opacity-60' : 'opacity-60 saturate-50'),
        className,
      )}
    >
      {comFoto ? (
        // Moldura: anel na cor do slot + filete da superfície; a foto só é recortada (object-cover), sem filtro.
        <span className={cn('block h-full w-full overflow-hidden rounded-full border-surface bg-surface-2', t.filete)}>
          <img
            src={foto!}
            alt=""
            draggable={false}
            decoding="async"
            onError={() => setFalhou(foto!)}
            className="h-full w-full object-cover object-[50%_22%]"
          />
        </span>
      ) : (
        iniciais(n)
      )}
      {eleito ? (
        <span
          className={cn(
            'absolute inline-flex items-center justify-center rounded-full ring-2 ring-surface',
            // nos tamanhos pequenos o selo sai mais para fora para não cobrir as iniciais
            size === 'xs' || size === 'sm' ? '-bottom-1 -right-1.5' : '-bottom-0.5 -right-0.5',
            s.bg,
            s.ink,
          )}
          style={{ width: t.selo + 4, height: t.selo + 4 }}
        >
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
