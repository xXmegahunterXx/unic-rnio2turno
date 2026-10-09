/**
 * Cartão de entrada do Teste Cego na Home: convite, ilustração "sem rosto" e o atalho para continuar um
 * teste em andamento nesta aba (sessionStorage; nada sai do navegador).
 */
import { useMemo } from 'react';
import { TEMAS } from '@/app/content/propostas';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';
import { CartasIlustracao } from '@/app/components/pages/teste/CartasIlustracao';
import { caminhoTeste } from '@/app/components/pages/teste/codigo';
import { lerProgresso, respondidas } from '@/app/components/pages/teste/sessao';

export function EntradaTeste({ className }: { className?: string }) {
  const salvo = useMemo(() => lerProgresso(), []);
  const feitas = salvo ? respondidas(salvo.respostas) : 0;
  const emAndamento = !!salvo && feitas > 0 && feitas < salvo.respostas.length;

  return (
    <article className={cn('relative isolate flex flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-card', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand/[0.16] blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-brand-2/[0.1] blur-3xl" />
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg sm:h-10 sm:w-10">
              <Icon name="olho-fechado" size={20} />
            </span>
            <span className="whitespace-nowrap font-display text-[17px] font-semibold tracking-[-0.02em] text-fg sm:text-[19px]">Teste Cego</span>
          </span>
          <span className="num inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-[12px] font-medium text-fg-muted">
            <Icon name="relogio" size={13} />≈ 2 min
          </span>
        </div>

        <h3 className="mt-5 text-balance font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[30px]">
          Escolha propostas sem saber de quem são
        </h3>
        <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-fg-muted">
          Em cada tema, duas propostas reais dos programas de governo, sem nome, partido ou número. No fim, você descobre com quem está mais em sintonia.
        </p>

        <CartasIlustracao compacta className="mx-auto mt-4 w-full max-w-[400px] sm:mt-2" />

        <ul className="mt-4 flex flex-wrap gap-2">
          <Fato icone="grade">
            <span className="num">{TEMAS.length}</span> temas
          </Fato>
          <Fato icone="selo">Fontes oficiais</Fato>
          <Fato icone="olho-fechado">Nada sai do seu aparelho</Fato>
        </ul>

        <div className="mt-auto flex flex-col gap-2 pt-6 sm:flex-row sm:items-center">
          {emAndamento ? (
            <>
              <ButtonLink to={caminhoTeste(salvo!.seed)} variant="primary" size="lg" iconRight="seta" className="w-full sm:w-auto">
                Continuar · <span className="num">{feitas}</span>/<span className="num">{salvo!.respostas.length}</span>
              </ButtonLink>
              <ButtonLink to="/teste" variant="ghost" size="lg" className="w-full sm:w-auto">
                Começar de novo
              </ButtonLink>
            </>
          ) : (
            <ButtonLink to="/teste" variant="primary" size="lg" iconRight="seta" className="w-full sm:w-auto">
              Fazer o Teste Cego
            </ButtonLink>
          )}
        </div>
      </div>
    </article>
  );
}

function Fato({ icone, children }: { icone: IconName; children: React.ReactNode }) {
  return (
    <li className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-3 text-[13px] font-medium text-fg">
      <Icon name={icone} size={15} className="text-brand-fg" />
      <span>{children}</span>
    </li>
  );
}
