/**
 * "Siga o Sintonia": links das redes do próprio Sintonia (configuradas no painel → Audiência). Sem rede configurada (ou
 * no build demo), não desenha nada. Aparece no rodapé, no fim do resultado do Teste Cego e na página /anuncie.
 *
 * Leva 3 (I28, reter o pico): duas variantes para o momento do resultado —
 *  - `faixa`: faixa larga com frase fixa e neutra, mostrada em /apuracao e /apuracao/:uf SÓ com a apuração encerrada,
 *    longe do placar e do banner do eleito (quem decide onde e quando é a página);
 *  - `linha`: uma linha compacta (rótulo + ícones), para o fim da reprise da "Reveja a noite" e depois do "Copiado" no
 *    compartilhar.
 * Nessas duas, os links levam `utm_source=sintonia` (a rede mostra de onde veio o seguidor; nada sai daqui).
 *
 * Os links são do Sintonia (não são publicidade): nova aba, `noopener noreferrer`.
 */
import { redesAtivas, ROTULO_REDE, type RedeSintonia } from '@/shared/audiencia';
import { cn } from '@/app/lib/cn';
import { urlCompartilhada } from '@/app/lib/share';
import { IconeRede } from './IconeRede';
import { useDivulgacao } from './useDivulgacao';

export type VarianteSiga = 'rodape' | 'cartao' | 'faixa' | 'linha';

/** Frase fixa da faixa do resultado (I28): neutra, sem candidato, sem número. */
export const FRASE_SIGA_RESULTADO = 'A apuração terminou. Siga o Sintonia nas redes para receber as próximas novidades do site.';

/** Link da rede com a origem `utm_source=sintonia` (só nas variantes do momento do resultado). */
export const linkRede = (url: string, comOrigem: boolean) => (comOrigem ? urlCompartilhada(url, 'sintonia') : url);

const ROTULO_ARIA = (r: RedeSintonia) => `Sintonia: ${ROTULO_REDE[r]} (abre em nova aba)`;

export function SigaSintonia({ variante, className }: { variante: VarianteSiga; className?: string }) {
  const q = useDivulgacao();
  const redes = redesAtivas(q.data?.redes);
  if (!redes.length) return null;

  if (variante === 'rodape') {
    return (
      <div className={className}>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Siga o Sintonia</h2>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {redes.map(([r, url]) => (
            <li key={r}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ROTULO_ARIA(r)}
                title={ROTULO_REDE[r]}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-fg-muted lg:[@media(pointer:fine)]:h-10 lg:[@media(pointer:fine)]:w-10 transition-colors hover:border-brand/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <IconeRede rede={r} size={19} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (variante === 'linha') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
        <p className="text-[12.5px] font-semibold text-fg-muted">Siga o Sintonia</p>
        <ul className="flex flex-wrap gap-1.5">
          {redes.map(([r, url]) => (
            <li key={r}>
              <a
                href={linkRede(url, true)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ROTULO_ARIA(r)}
                title={ROTULO_REDE[r]}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-muted transition-colors hover:border-brand/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <IconeRede rede={r} size={17} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (variante === 'faixa') {
    return (
      <section aria-labelledby="siga-sintonia-faixa" className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <h2 id="siga-sintonia-faixa" className="font-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-fg sm:text-[20px]">
              Siga o Sintonia
            </h2>
            <p className="mt-1 max-w-xl text-pretty text-[14px] leading-relaxed text-fg-muted">{FRASE_SIGA_RESULTADO}</p>
          </div>
          <ul className="flex shrink-0 flex-wrap gap-2">
            {redes.map(([r, url]) => (
              <li key={r}>
                <a
                  href={linkRede(url, true)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={ROTULO_ARIA(r)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface-2 pl-3.5 pr-4 text-[14px] font-medium text-fg transition-colors hover:border-brand/40 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:[@media(pointer:fine)]:h-10"
                >
                  <IconeRede rede={r} size={18} className="text-fg-muted" />
                  {ROTULO_REDE[r]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="siga-sintonia" className={cn('rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7', className)}>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 id="siga-sintonia" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[24px]">
            Siga o Sintonia
          </h2>
          <p className="mt-1 max-w-xl text-pretty text-[14.5px] leading-relaxed text-fg-muted">
            Avisos da apuração de 25 de outubro e as próximas novidades do site.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {redes.map(([r, url]) => (
            <li key={r}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ROTULO_ARIA(r)}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface-2 pl-3.5 pr-4 text-[14px] font-medium text-fg transition-colors hover:border-brand/40 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <IconeRede rede={r} size={18} className="text-fg-muted" />
                {ROTULO_REDE[r]}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default SigaSintonia;
