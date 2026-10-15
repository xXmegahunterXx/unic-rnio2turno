/**
 * "Siga o Sintonia": links das redes do próprio Sintonia (configuradas no painel → Audiência). Sem rede configurada (ou
 * no build demo), não desenha nada. Aparece no rodapé, no fim do resultado do Teste Cego e na página /anuncie.
 *
 * Os links são do Sintonia (não são publicidade): nova aba, `noopener noreferrer`.
 */
import { redesAtivas, ROTULO_REDE } from '@/shared/audiencia';
import { cn } from '@/app/lib/cn';
import { IconeRede } from './IconeRede';
import { useDivulgacao } from './useDivulgacao';

export function SigaSintonia({ variante, className }: { variante: 'rodape' | 'cartao'; className?: string }) {
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
                aria-label={`Sintonia: ${ROTULO_REDE[r]} (abre em nova aba)`}
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
                aria-label={`Sintonia: ${ROTULO_REDE[r]} (abre em nova aba)`}
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
