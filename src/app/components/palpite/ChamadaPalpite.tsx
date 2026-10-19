/**
 * Chamada para o Palpite (/palpite): na home (seção própria, entre seções, fora do hero) e na apuração na fase 'pre'
 * (faixa entre a contagem regressiva e o 1º turno). Sem candidato: ilustração só com a cor da marca ("?% × ?%"),
 * nunca as cores dos candidatos — como a chamada da calculadora de cenários.
 *
 * À 0h de 25/10 (relógio do servidor) os palpites fecham; no dia da votação, até as 17h, a chamada some (art. 39, § 5º).
 * Depois das 17h a chamada só aparece para quem cravou um palpite
 * neste aparelho ("veja por quanto errou"); sem palpite, nada.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { propsPreCarregar } from '@/app/components/layout/prefetch';
import { useAgoraServidor, usePalpiteSalvo } from './estado';
import { fasePalpite } from './nucleo';

function Ilustracao({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('rounded-[22px] border border-line/[1.6] bg-surface-2/70 p-5 shadow-card', className)}>
      <div className="flex items-end justify-between">
        {['?', '?'].map((t, i) => (
          <div key={i} className={cn('flex flex-col', i ? 'items-end' : 'items-start')}>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 font-display text-[15px] font-semibold text-brand-fg ring-2 ring-inset ring-brand/60">
              {t}
            </span>
            <span className="num mt-2 font-display text-[40px] font-semibold leading-none tracking-[-0.04em] text-fg">
              ?<span className="text-[0.45em] tracking-normal">%</span>
            </span>
          </div>
        ))}
      </div>
      <div className="relative mt-5 h-8">
        <div className="absolute inset-x-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-1/2 bg-brand/25" />
          <div className="h-full w-1/2 bg-brand-2/20" />
        </div>
        {/* divisor no MEIO (50/50, como o controle começa): puxado para um lado, a ilustração sugeria um palpite */}
        <span aria-hidden className="absolute left-[calc(50%-34px)] top-1/2 -translate-y-1/2 text-[15px] leading-none text-fg-subtle">‹</span>
        <span aria-hidden className="absolute left-[calc(50%+26px)] top-1/2 -translate-y-1/2 text-[15px] leading-none text-fg-subtle">›</span>
        <span className="absolute left-1/2 top-1/2 h-8 w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-fg shadow-card" />
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] font-semibold text-brand-fg">
        <Icon name="check" size={15} />
        Cravar meu palpite
      </div>
    </div>
  );
}

export function ChamadaPalpite({ variante = 'secao', className }: { variante?: 'secao' | 'faixa'; className?: string }) {
  const agora = useAgoraServidor();
  const [salvo] = usePalpiteSalvo();
  const fase = fasePalpite(agora);
  const aberto = fase === 'aberto';
  // dia da votação (0h–17h): nenhuma chamada de palpite na home nem na apuração (art. 39, § 5º)
  if (fase === 'votacao' || (!aberto && !salvo)) return null;

  const titulo = aberto ? (salvo ? 'Seu palpite está cravado' : 'Qual é o seu palpite?') : 'Seu palpite × o resultado';
  const texto = aberto
    ? salvo
      ? 'Dá para mudar até as 23h59 de 24/10. Compartilhe e desafie os amigos a cravar o deles.'
      : 'Crave o percentual dos votos válidos de cada candidato a presidente até as 23h59 de 24/10. Depois do resultado, veja por quanto errou.'
    : 'Quando o TSE concluir a apuração, veja por quantos pontos o palpite que você cravou errou.';
  const cta = aberto ? (salvo ? 'Ver e compartilhar' : 'Fazer meu palpite') : 'Ver meu palpite';

  if (variante === 'faixa') {
    return (
      // data-chat-evita: a pílula/o popup do chat não tapam o botão da faixa (fica no canto direito, como eles)
      <section
        aria-labelledby="chamada-palpite-faixa"
        data-chat-evita
        className={cn('relative isolate overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex sm:items-center sm:gap-5 sm:p-5', className)}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-brand/[0.12] blur-3xl" />
        <span aria-hidden className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand-fg ring-1 ring-inset ring-brand/30 sm:inline-flex">
          <span className="font-display text-[17px] font-semibold">?%</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Palpite do 2º turno</p>
          <h2 id="chamada-palpite-faixa" className="mt-0.5 font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[21px]">
            {titulo}
          </h2>
          <p className="mt-1 text-pretty text-[13.5px] leading-snug text-fg-muted">{texto} Fica só no seu aparelho.</p>
        </div>
        <ButtonLink to="/palpite" {...propsPreCarregar('/palpite')} variant="primary" iconRight="seta" className="mt-3 w-full shrink-0 sm:mt-0 sm:w-auto">
          {cta}
        </ButtonLink>
      </section>
    );
  }

  return (
    <section aria-labelledby="home-palpite" className={cn('relative isolate overflow-hidden rounded-[28px] border border-line bg-surface shadow-card', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-brand/[0.14] blur-3xl" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="grid grid-cols-1 items-center gap-7 p-5 sm:p-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-10 lg:p-10">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Palpite do 2º turno</p>
          <h2 id="home-palpite" className="mt-1.5 text-balance font-display text-[28px] font-semibold leading-[1.04] tracking-[-0.03em] text-fg sm:text-[38px]">
            {titulo}
          </h2>
          <p className="mt-3 max-w-[34rem] text-pretty text-[15px] leading-relaxed text-fg-muted">{texto}</p>
          <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12.5px] leading-snug text-fg-muted">
            <Icon name="olho-fechado" size={15} className="mt-px shrink-0 text-brand-fg" />
            Individual: o palpite fica só no seu aparelho. Não é pesquisa e nada é somado.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <ButtonLink to="/palpite" {...propsPreCarregar('/palpite')} variant="primary" size="lg" iconRight="seta" className="w-full sm:w-auto">
              {cta}
            </ButtonLink>
          </div>
        </div>
        <Link to="/palpite" {...propsPreCarregar('/palpite')} tabIndex={-1} aria-hidden className="mx-auto block w-full max-w-[400px]">
          <Ilustracao />
        </Link>
      </div>
    </section>
  );
}
