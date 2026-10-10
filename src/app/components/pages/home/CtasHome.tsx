/**
 * As três entradas grandes do hero (celular primeiro, alvo de toque ≥ 56 px):
 *  1. "Faça o Teste Cego" — tempo honesto (24 afirmações · ≈ 3 min);
 *  2. "Como votou sua cidade ou seção" — busca direto na Home;
 *  3. "Apuração ao vivo" — antes do dia 25 leva ao 1º turno oficial; ao vivo, ao placar.
 * A ordem é fixa (não "pula" quando o status chega). Pré-carrega a página ao apontar/tocar.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Fase } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { propsPreCarregar } from '@/app/components/layout/prefetch';
import { BuscaInline } from './BuscaInline';
import { MINUTOS_TESTE_HOME, N_AFIRMACOES_TESTE } from './textosHome';

export function CtaTeste({ className }: { className?: string }) {
  return (
    <CtaLink
      to="/teste"
      destaque
      icone="olho-fechado"
      titulo="Faça o Teste Cego"
      className={className}
      sub={
        <>
          <span className="num">{N_AFIRMACOES_TESTE}</span> afirmações · ≈ <span className="num">{MINUTOS_TESTE_HOME}</span> min · sem saber de quem é cada ideia
        </>
      }
    />
  );
}

export function CtaApuracao({ fase, className }: { fase: Fase | undefined; className?: string }) {
  const sub =
    fase === 'apurando'
      ? 'Placar, mapa e seções, atualizando sozinho'
      : fase === 'encerrada'
        ? 'O resultado e a reprise da noite, minuto a minuto'
        : 'Domingo, às 17h · até lá, o 1º turno oficial';
  return <CtaLink to="/apuracao" icone="ao-vivo" titulo="Apuração ao vivo" sub={sub} className={className} />;
}

export function CtaBusca({ fase, className }: { fase: Fase | undefined; className?: string }) {
  const titulo = fase === 'apurando' ? 'Sua cidade e sua seção, ao vivo' : 'Como votou sua cidade ou seção';
  return (
    <div className={cn('rounded-[22px] border border-line bg-surface/85 p-3.5 shadow-card backdrop-blur-md sm:p-4', className)}>
      <div className="mb-2.5 flex items-center gap-3 px-0.5">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="urna" size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-balance font-display text-[17px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[18px]">{titulo}</h2>
          <p className="text-[12.5px] leading-snug text-fg-muted">{fase === 'apurando' ? 'Boletim de cada urna assim que for totalizada' : 'Resultado oficial do TSE, até o boletim da sua urna'}</p>
        </div>
      </div>
      <BuscaInline />
    </div>
  );
}

function CtaLink({ to, icone, titulo, sub, destaque, className }: { to: string; icone: IconName; titulo: ReactNode; sub: ReactNode; destaque?: boolean; className?: string }) {
  return (
    <Link
      to={to}
      {...propsPreCarregar(to)}
      className={cn(
        'group relative isolate flex min-h-[68px] items-center gap-3.5 overflow-hidden rounded-[22px] px-4 py-3.5 transition-[transform,box-shadow,border-color] duration-150 active:scale-[0.985] sm:px-5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        destaque
          ? 'bg-brand-cta text-brand-ink shadow-[0_14px_36px_-14px_rgb(var(--brand)/0.85),inset_0_1px_0_0_rgb(var(--brand-ink)/0.22)] hover:brightness-110'
          : 'border border-line bg-surface/85 text-fg shadow-card backdrop-blur-md hover:border-line/[2.5]',
        className,
      )}
    >
      {destaque ? (
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 -z-10 h-32 w-32 rounded-full bg-brand-ink/10 blur-2xl" />
      ) : null}
      <span
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
          destaque ? 'bg-brand-ink/15 text-brand-ink ring-1 ring-inset ring-brand-ink/25' : 'bg-brand/15 text-brand-fg',
        )}
      >
        <Icon name={icone} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] sm:text-[19px]">{titulo}</span>
        <span className={cn('mt-0.5 block text-pretty text-[13px] leading-snug', destaque ? 'text-brand-ink/85' : 'text-fg-muted')}>{sub}</span>
      </span>
      <Icon name="seta" size={20} className={cn('shrink-0 transition-transform group-hover:translate-x-0.5', destaque ? 'text-brand-ink' : 'text-fg-muted')} />
    </Link>
  );
}
