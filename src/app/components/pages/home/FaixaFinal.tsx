/**
 * Faixa final da Home: "Domingo, 25 de outubro, 17h" com quanto falta (relógio de parede, dias de Brasília),
 * "Lembrar da apuração" e "Compartilhar o Sintonia". Depois do início real, só o convite para compartilhar.
 */
import { INICIO_APURACAO } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { BotaoCompartilharSite, BotaoLembrete, lembreteDisponivel } from './AcoesHome';
import { rotuloFaltam } from './textosHome';

export function FaixaFinal({ className }: { className?: string }) {
  const agora = useNow(60_000);
  const antes = lembreteDisponivel(agora);
  const faltam = rotuloFaltam(agora, INICIO_APURACAO);
  return (
    <section
      aria-labelledby="home-final"
      className={cn('relative isolate overflow-hidden rounded-[28px] border border-brand/25 bg-surface px-5 py-8 text-center shadow-card sm:px-10 sm:py-12', className)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-140px] h-[300px] w-[640px] -translate-x-1/2 rounded-full bg-brand/[0.2] blur-[80px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      {faltam ? (
        <p className="num inline-flex h-7 items-center rounded-full border border-brand/30 bg-brand/10 px-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">{faltam}</p>
      ) : null}
      <h2 id="home-final" className="mx-auto mt-3 max-w-[22ch] text-balance font-display text-[30px] font-semibold leading-[1.02] tracking-[-0.035em] text-fg sm:text-[46px]">
        {antes ? (
          <>
            Domingo, 25 de outubro, <span className="num">17h</span>
          </>
        ) : (
          'Leve a apuração para quem você conhece'
        )}
      </h2>
      <p className="mx-auto mt-3 max-w-[40rem] text-pretty text-[15px] leading-relaxed text-fg-muted sm:text-[16.5px]">
        {antes
          ? 'Os resultados começam a sair às 17h (horário de Brasília). Coloque na agenda e chame quem também vai acompanhar.'
          : 'Imagem, texto e link prontos para o X, o WhatsApp e os stories. Sem números e sem candidatos no convite.'}
      </p>
      <div className="mx-auto mt-6 flex max-w-md flex-col gap-2.5 sm:flex-row sm:justify-center">
        {antes ? <BotaoLembrete variant="primary" size="lg" className="w-full sm:w-auto" /> : null}
        <BotaoCompartilharSite variant={antes ? 'secondary' : 'primary'} size="lg" label="Compartilhar o Sintonia" className="w-full sm:w-auto" />
      </div>
    </section>
  );
}
