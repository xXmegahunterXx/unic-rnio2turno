/**
 * Cartão de entrada do Teste Cego na Home: convite, ilustração "sem rosto" (afirmação + escala de concordância)
 * e o atalho para continuar um teste em andamento nesta aba (sessionStorage; nada sai do navegador).
 */
import { useMemo } from 'react';
import { AFIRMACOES } from '@/app/content/afirmacoes';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';
import { IlustracaoAfirmacao } from '@/app/components/pages/teste/IlustracaoAfirmacao';
import { caminhoTeste } from '@/app/components/pages/teste/codigo';
import { concluidas, lerProgresso, TOTAL } from '@/app/components/pages/teste/sessao';
import { selecaoRapida } from '@/app/components/pages/teste/sintonia';

export function EntradaTeste({ className }: { className?: string }) {
  const salvo = useMemo(() => lerProgresso(), []);
  // Modo rápido salvo: conta só as 12 afirmações dele (antes mostrava "x/24").
  const idsRapido = useMemo(() => (salvo?.rapido ? selecaoRapida(salvo.seed) : undefined), [salvo]);
  const total = idsRapido ? idsRapido.length : TOTAL;
  const feitas = salvo ? concluidas(salvo.respostas, idsRapido) : 0;
  const emAndamento = !!salvo && feitas > 0 && feitas < total;

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
            <Icon name="relogio" size={13} />≈ 3 min
          </span>
        </div>

        <h3 className="mt-5 text-balance font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[30px]">
          Concorde ou discorde, sem saber de quem é cada ideia
        </h3>
        <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-fg-muted">
          {AFIRMACOES.length} afirmações neutras sobre temas do país, uma por vez. No fim, comparamos suas respostas com o que os dois candidatos
          defendem nos programas de governo.
        </p>

        <IlustracaoAfirmacao compacta className="mx-auto mt-4 w-full max-w-[400px] sm:mt-3" />

        <ul className="mt-4 flex flex-wrap gap-2">
          <Fato icone="lista">
            <span className="num">{AFIRMACOES.length}</span> afirmações
          </Fato>
          <Fato icone="selo">Fontes oficiais</Fato>
          <Fato icone="olho-fechado">Nada sai do seu aparelho</Fato>
        </ul>

        <div className="mt-auto flex flex-col gap-2 pt-6 sm:flex-row sm:items-center">
          {emAndamento ? (
            <>
              <ButtonLink to={caminhoTeste(salvo!.seed)} variant="primary" size="lg" iconRight="seta" className="w-full sm:w-auto">
                Continuar · <span className="num">{feitas}</span>/<span className="num">{total}</span>
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
