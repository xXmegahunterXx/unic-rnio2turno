/**
 * Cartão "Stories" (1080 × 1920) do Teste Cego, exportado como PNG no próprio navegador (html-to-image).
 * Marca "Sintonia · Teste Cego". Por escolha da pessoa, pode ou não mostrar o resultado.
 * O cartão NUNCA diz em quem a pessoa vai votar: fala de sintonia com as posições escritas nos programas,
 * com o aviso "não é pesquisa nem recomendação de voto". Candidatos na ordem da urna, mesmo tamanho e tipografia.
 */
import { forwardRef } from 'react';
import { AFIRMACOES, type ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { hostExibicao } from '@/app/lib/share';
import { useTheme } from '@/app/lib/useTheme';
import { corSlot } from '@/app/lib/raceUi';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { Icon } from '@/app/ui/Icon';
import type { Autor } from './sintonia';

export const CARTAO_W = 1080;
export const CARTAO_H = 1920;

export interface CartaoTesteProps {
  resultado: ResultadoSintonia;
  candidatos: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  /** Mostra os percentuais. */
  comResultado: boolean;
}

export const CartaoTeste = forwardRef<HTMLDivElement, CartaoTesteProps>(function CartaoTeste({ resultado, candidatos, fotos, comResultado }, ref) {
  const host = hostExibicao() || 'sintonia';
  const total = AFIRMACOES.length;
  return (
    <div ref={ref} style={{ width: CARTAO_W, height: CARTAO_H }} className="relative flex flex-col overflow-hidden bg-bg px-[88px] pb-[104px] pt-[112px] font-sans text-fg">
      {/* fundo: brilho da marca + ruído (as cores dos candidatos só aparecem nos dados) */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute -left-[260px] -top-[260px] h-[900px] w-[900px] rounded-full bg-brand/25 blur-[140px]" />
        <div className="absolute -bottom-[300px] -right-[260px] h-[820px] w-[820px] rounded-full bg-brand-2/15 blur-[140px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>

      <div className="relative flex items-center gap-6">
        <MarcaExport size={84} />
        <div>
          <div className="font-display text-[50px] font-semibold leading-none tracking-[-0.03em]">Sintonia</div>
          <div className="mt-2.5 text-[26px] font-semibold uppercase tracking-[0.18em] text-brand-fg">Teste Cego</div>
        </div>
      </div>

      <div className="relative mt-[88px]">
        <div className="font-display text-[108px] font-semibold leading-[0.95] tracking-[-0.045em]">Fiz o Teste Cego do 2º turno.</div>
        <div className="mt-8 max-w-[880px] text-[40px] leading-[1.3] text-fg-muted">
          Respondi <span className="num">{fmtInt(total)}</span> afirmações sobre temas do país{' '}
          <span className="text-fg">sem saber o que cada candidato defende.</span>
        </div>
      </div>

      {comResultado ? (
        <div className="relative mt-[56px] flex flex-1 flex-col justify-center">
          <div className="text-[26px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Minha sintonia com os programas</div>
          <div className="mt-10 grid grid-cols-2 gap-[48px]">
            {candidatos.map((c) => (
              <BlocoCandidato
                key={c.numero}
                c={c}
                foto={fotos[c.numero as Autor]}
                pct={resultado[c.numero as Autor]}
                n={resultado.consideradas[c.numero as Autor]}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="relative mt-[80px] flex flex-1 flex-col justify-center">
          <AfirmacaoGrande />
          <div className="mt-16 font-display text-[64px] font-semibold leading-[1.05] tracking-[-0.035em]">
            Ideias primeiro, <span className="text-brand-fg">candidatos depois.</span>
          </div>
        </div>
      )}

      <div className="relative mt-[56px] flex items-end justify-between gap-8 border-t-2 border-line pt-9">
        <div className="max-w-[580px] text-[24px] leading-snug text-fg-muted">
          Não é pesquisa nem recomendação de voto. Posições documentadas nos programas registrados no TSE.
        </div>
        <div className="text-right">
          <div className="text-[24px] text-fg-muted">Faça o seu</div>
          <div className="mt-1 text-[34px] font-semibold tracking-[-0.01em]">{host}/teste</div>
        </div>
      </div>
    </div>
  );
});

function BlocoCandidato({ c, foto, pct, n }: { c: Candidate; foto?: string; pct: number | null; n: number }) {
  const s = corSlot(c.cor);
  const R = 100;
  const C = 2 * Math.PI * R;
  const v = pct ?? 0;
  return (
    <div className="flex flex-col items-center rounded-[40px] border-2 border-line bg-surface/70 px-8 pb-12 pt-12 text-center">
      <div className="relative h-[240px] w-[240px]">
        {/* Estilos INLINE de propósito: o html-to-image não copia as classes dos filhos de <svg>. */}
        <svg viewBox="0 0 240 240" width={240} height={240} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx="120" cy="120" r={R} fill="none" strokeWidth="16" style={{ stroke: 'rgb(var(--surface-3))' }} />
          {pct !== null ? (
            <circle
              cx="120"
              cy="120"
              r={R}
              fill="none"
              strokeWidth="16"
              strokeLinecap="round"
              style={{ stroke: s.css }}
              strokeDasharray={`${(C * Math.max(0, Math.min(100, v))) / 100} ${C}`}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {foto ? (
            <span className={cn('inline-flex h-[156px] w-[156px] overflow-hidden rounded-full p-[6px]', s.bg)}>
              <img src={foto} alt="" className="h-full w-full rounded-full object-cover object-top" />
            </span>
          ) : (
            <div className={cn('flex h-[150px] w-[150px] items-center justify-center rounded-full font-display text-[56px] font-semibold ring-[6px] ring-inset', s.bgSoft, s.ring, s.text)}>
              {iniciais(c.nomeUrna)}
            </div>
          )}
        </div>
      </div>
      <div className={cn('num mt-10 font-display text-[150px] font-semibold leading-[0.85] tracking-[-0.05em]', pct === null ? 'text-fg-subtle' : s.textDisplay)}>
        {pct === null ? '—' : fmtPct(v, 0).replace('%', '')}
        {pct !== null ? <span className="ml-1 text-[64px] tracking-normal">%</span> : null}
      </div>
      <div className="mt-5 text-[28px] text-fg-muted">de sintonia com</div>
      <div className="mt-2 font-display text-[46px] font-semibold leading-[1.05] tracking-[-0.025em]">{c.nomeUrna}</div>
      {c.partido ? (
        <div className="num mt-2 text-[26px] text-fg-muted">
          {c.partido} · {c.numero}
        </div>
      ) : null}
      <div className="num mt-4 text-[22px] text-fg-subtle">
        com base em {fmtInt(n)} {n === 1 ? 'afirmação' : 'afirmações'}
      </div>
    </div>
  );
}

/** Ilustração grande (convite): uma afirmação abstrata e a escala, sem texto real. */
function AfirmacaoGrande() {
  const tam = ['h-[92px] w-[92px]', 'h-[76px] w-[76px]', 'h-[62px] w-[62px]', 'h-[76px] w-[76px]', 'h-[92px] w-[92px]'];
  const est = ['border-brand/70 bg-brand/[0.12]', '', 'border-fg-subtle/50 bg-surface-2', 'border-brand/45 bg-brand/[0.06]', 'border-brand/70 bg-brand/[0.12]'];
  const rot = ['Concordo totalmente', 'Concordo', 'Neutro', 'Discordo', 'Discordo totalmente'];
  return (
    <div className="relative">
      <div className="absolute inset-x-[40px] -top-[28px] h-full rotate-[3deg] rounded-[44px] border-2 border-line bg-surface-2/70" />
      <div className="relative -rotate-[1.5deg] rounded-[44px] border-2 border-line bg-surface p-14">
        <div className="flex items-center gap-4">
          <span className="h-6 w-6 rounded-full bg-surface-3" />
          <span className="h-6 w-48 rounded-full bg-surface-3" />
        </div>
        <div className="mt-10 space-y-6">
          <div className="h-11 w-full rounded-full bg-fg/[0.14]" />
          <div className="h-11 w-[86%] rounded-full bg-fg/[0.14]" />
          <div className="h-11 w-[52%] rounded-full bg-fg/[0.14]" />
        </div>
        <div className="relative mt-16">
          <div className="absolute left-[10%] right-[10%] top-[46px] h-[4px] rounded-full bg-line/[2]" />
          <div className="relative grid grid-cols-5">
            {tam.map((t, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="flex h-[92px] items-center">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center rounded-full border-[4px]',
                      t,
                      i === 1 ? 'border-transparent bg-brand-cta text-brand-ink shadow-glow' : est[i],
                    )}
                  >
                    {i === 1 ? <Icon name="check" size={40} strokeWidth={3} /> : null}
                  </span>
                </div>
                <div className={cn('mt-4 max-w-[150px] text-center text-[22px] leading-tight', i === 1 ? 'font-semibold text-fg' : 'text-fg-muted')}>{rot[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -right-[10px] -top-[64px] flex h-[150px] w-[150px] items-center justify-center rounded-full border-[3px] border-dashed border-fg-subtle/60 bg-surface-2 font-display text-[76px] font-semibold text-fg-muted">
        ?
      </div>
    </div>
  );
}

/**
 * Símbolo do Sintonia para a imagem exportada. Igual ao LogoMark do kit, mas com cores em estilo INLINE:
 * o html-to-image não aplica classes a filhos de <svg> (o LogoMark sai sem o fundo e sem o ponto no PNG).
 */
function MarcaExport({ size }: { size: number }) {
  const { tema } = useTheme();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="marca-export-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--brand))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--brand-2))' }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" style={{ fill: tema === 'light' ? 'rgb(var(--fg))' : 'rgb(var(--surface-3))' }} />
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" strokeWidth="1.5" style={{ stroke: tema === 'light' ? 'transparent' : 'rgb(var(--line) / calc(var(--line-alpha) * 1.5))' }} />
      <path d="M14 38c6-14 12-14 18 0s12 14 18 0" fill="none" stroke="url(#marca-export-g)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="22" r="4" style={{ fill: 'rgb(var(--brand-ink))' }} />
    </svg>
  );
}
