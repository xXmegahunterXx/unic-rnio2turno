/**
 * Cartão "Stories" (1080 × 1920) do Teste Cego, exportado como PNG no próprio navegador (html-to-image).
 * Marca "Sintonia · Teste Cego". Por escolha da pessoa, pode ou não mostrar o resultado.
 * O cartão NUNCA diz em quem a pessoa vai votar: fala de sintonia com propostas, com o aviso
 * "não é pesquisa nem intenção de voto". Candidatos na ordem da urna, mesmo tamanho e tipografia.
 */
import { forwardRef } from 'react';
import type { Candidate } from '@/shared/types';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { hostExibicao } from '@/app/lib/share';
import { corSlot } from '@/app/lib/raceUi';
import { LogoMark } from '@/app/components/layout/Logo';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { Icon } from '@/app/ui/Icon';
import { Ladrilho } from './Fita';
import type { Autor, Sintonia } from './sintonia';

export const CARTAO_W = 1080;
export const CARTAO_H = 1920;

export interface CartaoTesteProps {
  sintonia: Sintonia;
  candidatos: Candidate[];
  porNumero: Record<Autor, Candidate>;
  /** Mostra os percentuais e a fita de escolhas. */
  comResultado: boolean;
}

export const CartaoTeste = forwardRef<HTMLDivElement, CartaoTesteProps>(function CartaoTeste({ sintonia, candidatos, porNumero, comResultado }, ref) {
  const host = hostExibicao() || 'sintonia';
  return (
    <div ref={ref} style={{ width: CARTAO_W, height: CARTAO_H }} className="relative flex flex-col overflow-hidden bg-bg px-[88px] pb-[104px] pt-[112px] font-sans text-fg">
      {/* fundo: brilho da marca + ruído (as cores dos candidatos só aparecem nos dados) */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute -left-[260px] -top-[260px] h-[900px] w-[900px] rounded-full bg-brand/25 blur-[140px]" />
        <div className="absolute -bottom-[300px] -right-[260px] h-[820px] w-[820px] rounded-full bg-brand-2/15 blur-[140px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>

      <div className="relative flex items-center gap-6">
        <LogoMark size={84} />
        <div>
          <div className="font-display text-[50px] font-semibold leading-none tracking-[-0.03em]">Sintonia</div>
          <div className="mt-2.5 text-[26px] font-semibold uppercase tracking-[0.18em] text-brand-fg">Teste Cego</div>
        </div>
      </div>

      <div className="relative mt-[96px]">
        <div className="font-display text-[112px] font-semibold leading-[0.95] tracking-[-0.045em]">Fiz o Teste Cego.</div>
        <div className="mt-8 max-w-[860px] text-[40px] leading-[1.3] text-fg-muted">
          Escolhi entre propostas reais dos dois candidatos à Presidência <span className="text-fg">sem saber de quem eram.</span>
        </div>
      </div>

      {comResultado ? (
        <div className="relative mt-[88px] flex flex-1 flex-col">
          <div className="text-[26px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Minha sintonia com as propostas</div>
          <div className="mt-10 grid grid-cols-2 gap-[48px]">
            {candidatos.map((c) => (
              <BlocoCandidato key={c.numero} c={c} pct={sintonia.pct[c.numero as Autor] ?? 0} />
            ))}
          </div>
          <div className="mt-auto">
            <div className="mb-5 flex items-baseline justify-between text-[24px] text-fg-muted">
              <span>Minhas 12 escolhas</span>
              <span className="flex items-center gap-6">
                {candidatos.map((c) => (
                  <span key={c.numero} className="inline-flex items-center gap-2.5">
                    <Ladrilho opcao={c.numero as Autor} porNumero={porNumero} className="h-6 w-6 rounded-md" />
                    {c.nomeUrna}
                  </span>
                ))}
              </span>
            </div>
            <div className="grid grid-cols-12 gap-3">
              {sintonia.temas.map((t) => (
                <Ladrilho key={t.rodada.tema.id} opcao={t.opcao} porNumero={porNumero} className="h-[92px] rounded-[18px]" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mt-[88px] flex flex-1 flex-col justify-center">
          <CartasGrandes />
          <div className="mt-16 font-display text-[64px] font-semibold leading-[1.05] tracking-[-0.035em]">
            Escolha propostas, <span className="text-brand-fg">não candidatos.</span>
          </div>
        </div>
      )}

      <div className="relative mt-[64px] flex items-end justify-between gap-8 border-t-2 border-line pt-9">
        <div className="max-w-[560px] text-[24px] leading-snug text-fg-muted">
          Não é pesquisa nem intenção de voto. 12 temas · propostas dos programas registrados no TSE.
        </div>
        <div className="text-right">
          <div className="text-[24px] text-fg-muted">Faça o seu</div>
          <div className="mt-1 text-[34px] font-semibold tracking-[-0.01em]">
            {host}/teste
          </div>
        </div>
      </div>
    </div>
  );
});

function BlocoCandidato({ c, pct }: { c: Candidate; pct: number }) {
  const s = corSlot(c.cor);
  const R = 100;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center rounded-[40px] border-2 border-line bg-surface/70 px-8 pb-12 pt-12 text-center">
      <div className="relative h-[240px] w-[240px]">
        <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="120" cy="120" r={R} fill="none" strokeWidth="16" className="stroke-surface-3" />
          <circle cx="120" cy="120" r={R} fill="none" strokeWidth="16" strokeLinecap="round" className={s.stroke} strokeDasharray={`${(C * Math.max(0, Math.min(100, pct))) / 100} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn('flex h-[150px] w-[150px] items-center justify-center rounded-full font-display text-[56px] font-semibold ring-[6px] ring-inset', s.bgSoft, s.ring, s.text)}>
            {iniciais(c.nomeUrna)}
          </div>
        </div>
      </div>
      <div className={cn('num mt-10 font-display text-[150px] font-semibold leading-[0.85] tracking-[-0.05em]', s.textDisplay)}>
        {fmtPct(pct, 0).replace('%', '')}
        <span className="ml-1 text-[64px] tracking-normal">%</span>
      </div>
      <div className="mt-5 text-[28px] text-fg-muted">em sintonia com</div>
      <div className="mt-2 font-display text-[46px] font-semibold leading-[1.05] tracking-[-0.025em]">{c.nomeUrna}</div>
      {c.partido ? (
        <div className="num mt-2 text-[26px] text-fg-muted">
          {c.partido} · {c.numero}
        </div>
      ) : null}
    </div>
  );
}

function CartasGrandes() {
  return (
    <div className="relative h-[560px]">
      <div className="absolute left-0 top-0 w-[680px] -rotate-[6deg] rounded-[44px] border-2 border-line bg-surface p-12">
        <div className="text-[24px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Opção 1</div>
        <div className="mt-8 space-y-5">
          <div className="h-7 w-full rounded-full bg-surface-3" />
          <div className="h-7 w-[90%] rounded-full bg-surface-3" />
          <div className="h-7 w-[60%] rounded-full bg-surface-3" />
        </div>
      </div>
      <div className="absolute bottom-0 right-0 w-[680px] rotate-[5deg] overflow-hidden rounded-[44px] border-2 border-brand/60 bg-surface p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/20 to-transparent" />
        <div className="relative text-[24px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Opção 2</div>
        <div className="relative mt-8 space-y-5">
          <div className="h-7 w-full rounded-full bg-surface-3" />
          <div className="h-7 w-[84%] rounded-full bg-surface-3" />
          <div className="h-7 w-[70%] rounded-full bg-surface-3" />
        </div>
        <div className="relative mt-10 inline-flex h-16 items-center gap-3 rounded-full bg-brand-cta px-8 text-[28px] font-semibold text-brand-ink">
          <Icon name="check" size={30} strokeWidth={2.5} />
          Prefiro esta
        </div>
      </div>
      <div className="absolute right-[90px] top-[-10px] flex h-[150px] w-[150px] items-center justify-center rounded-full border-[3px] border-dashed border-fg-subtle/60 bg-surface-2 font-display text-[76px] font-semibold text-fg-muted">
        ?
      </div>
    </div>
  );
}
