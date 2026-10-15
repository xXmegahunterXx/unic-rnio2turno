/**
 * Avatar do candidato: foto OFICIAL do TSE (quando passada em `foto`) ou o monograma (iniciais) — os dois com o
 * anel na cor do slot e exatamente o mesmo tamanho. A foto só é recortada em círculo (sem filtro nem edição).
 * Quem decide se há foto é quem chama, via `useFotosRace` (./fotos.ts): nunca na simulação anonimizada, e só
 * quando os dois finalistas têm foto (mesmo tratamento para todos — ARCHITECTURE §1.1).
 * CandidateName: nome de urna + partido/número/vice.
 * CandidateRetrato: retrato grande (hero), foto inteira em quadro 4:5 com anel e brilho na cor do slot.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Candidate, CorCandidato } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot, rgbSlot } from '@/app/lib/raceUi';
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
  /**
   * Nome com link para a ficha (/candidato/:sqcand) quando há `sqcand` — as corridas anonimizadas não têm, então
   * a simulação nunca linka. Não use dentro de outro link (cartão clicável).
   */
  linkFicha?: boolean;
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
  linkFicha,
  className,
}: CandidateNameProps) {
  const s = corSlot(candidato.cor);
  const meta = [showPartido ? candidato.partido : null, showNumero && !candidato.agregado ? String(candidato.numero) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <span className={cn('flex min-w-0 flex-col', align === 'right' && 'items-end text-right', className)}>
      <span className={cn('max-w-full text-balance font-display leading-[1.1] text-fg', nomeTam[size], colored && s.text)}>
        {linkFicha && candidato.sqcand && !candidato.agregado ? (
          <Link
            to={`/candidato/${candidato.sqcand}`}
            className="toque relative rounded-sm underline decoration-transparent decoration-1 underline-offset-[4px] transition-colors hover:decoration-line/[4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {candidato.nomeUrna}
          </Link>
        ) : (
          candidato.nomeUrna
        )}
      </span>
      {meta ? <span className="num mt-1 whitespace-nowrap text-[12.5px] leading-tight text-fg-muted">{meta}</span> : null}
      {showVice && candidato.vice ? (
        <span className="mt-0.5 max-w-full truncate text-[12.5px] leading-tight text-fg-muted">Vice: {candidato.vice}</span>
      ) : null}
    </span>
  );
}

// ── Retrato grande (hero) ─────────────────────────────────────────────────────────────────────────

export interface CandidateRetratoProps {
  /** Candidato (usa nomeUrna e cor) — ou passe `nome` + `cor`. */
  candidato?: Pick<Candidate, 'nomeUrna' | 'cor'>;
  nome?: string;
  cor?: CorCandidato;
  /**
   * Foto oficial (data URI). Ausente/nula → monograma no MESMO quadro. Quem chama aplica as regras (`useFotosRace` ou
   * `useFotosHero`): nunca na simulação anonimizada nem ao lado de número simulado, e tudo ou nada entre os finalistas.
   */
  foto?: string | null;
  /** As fotos ainda podem chegar: quadro neutro (sem o monograma "piscar" antes da foto). */
  carregando?: boolean;
  /** Selo de check (eleito). */
  eleito?: boolean;
  /** Atenua. */
  dim?: boolean;
  /** Brilho suave na cor do slot atrás do quadro. Padrão true. */
  brilho?: boolean;
  /** Tamanho do monograma (o quadro acompanha a largura do pai). */
  monogramaClassName?: string;
  className?: string;
}

/**
 * Retrato GRANDE do candidato (hero da Home, topo da apuração antes das 17h): a foto oficial num quadro 4:5 de cantos
 * arredondados — só recorte mínimo (object-cover) e redimensionamento, sem filtro nem sobreposição no rosto —, com
 * anel em degradê e brilho suave na cor do slot (tokens via `rgbSlot`, nunca hex). Sem foto, o monograma no mesmo
 * quadro. Mesmo tamanho e tratamento para todos; a largura vem do pai (o quadro mantém a proporção: sem layout shift).
 */
export function CandidateRetrato({
  candidato,
  nome,
  cor,
  foto,
  carregando,
  eleito,
  dim,
  brilho = true,
  monogramaClassName = 'text-[52px] sm:text-[68px]',
  className,
}: CandidateRetratoProps) {
  const n = candidato?.nomeUrna ?? nome ?? '?';
  const c = candidato?.cor ?? cor ?? 'outros';
  const s = corSlot(c);
  const [falhou, setFalhou] = useState<string | null>(null);
  const comFoto = !!foto && falhou !== foto;
  return (
    <span aria-hidden className={cn('relative isolate block aspect-[4/5] w-full select-none', dim && 'opacity-60', className)}>
      {brilho ? (
        <span
          className="pointer-events-none absolute -inset-x-[26%] -inset-y-[18%] -z-10 opacity-70 dark:opacity-100"
          style={{ background: `radial-gradient(closest-side, ${rgbSlot(c, 0.46)}, ${rgbSlot(c, 0.16)} 58%, ${rgbSlot(c, 0)})` }}
        />
      ) : null}
      <span
        className="block h-full w-full rounded-[24px] p-[3px] shadow-card"
        style={{ backgroundImage: `linear-gradient(165deg, ${rgbSlot(c)} 0%, ${rgbSlot(c, 0.45)} 48%, ${rgbSlot(c, 0.9)} 100%)` }}
      >
        <span className="relative block h-full w-full overflow-hidden rounded-[21px] bg-surface-2">
          {comFoto ? (
            <img
              src={foto!}
              alt=""
              draggable={false}
              decoding="async"
              onError={() => setFalhou(foto!)}
              className="h-full w-full object-cover object-[50%_16%]"
            />
          ) : carregando ? (
            <span className="absolute inset-0 animate-pulse bg-surface-3/70" />
          ) : (
            <span
              className={cn(
                'flex h-full w-full items-center justify-center font-display font-semibold leading-none tracking-[-0.04em]',
                s.bgSoft,
                s.text,
                monogramaClassName,
              )}
            >
              {iniciais(n)}
            </span>
          )}
        </span>
      </span>
      {eleito ? (
        <span className={cn('absolute -bottom-2 -right-2 inline-flex h-9 w-9 items-center justify-center rounded-full ring-[3px] ring-surface', s.bg, s.ink)}>
          <Icon name="check" size={20} strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}
