/**
 * Formato 'chat': "Sala oferecida por <marca>" no TOPO da sala do chat ao vivo (src/app/components/chat), numa faixa
 * própria com borda, separada das mensagens pela mensagem fixada/regras — nunca dentro da lista nem ao lado de
 * placar, foto ou número de candidato. O bloco inteiro é o link patrocinado (rel="sponsored", nova aba); impressão
 * visível e clique contados como nos outros formatos (`useImpressaoVisivel`, `/api/anuncio/ir/<id>?f=chat`).
 *
 * Escolha: rotação ponderada pelo peso, fixa durante a visita (a sala não troca de anunciante ao trocar de página),
 * evitando o anunciante da faixa do topo e do rodapé quando há outro.
 */
import { useMemo, useRef } from 'react';
import { escolherAnuncio } from '@/shared/anuncios-escolha';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { useAnunciosDaPagina } from './contexto';
import { useImpressaoVisivel } from './impressao';
import { LinkAnuncio, LogoMarca } from './pecas';
import { idDaVisita } from './visita';

/**
 * Slot da sala (sem provedor, sem status ou sem anúncio 'chat' no ar: nada). `noPe`: no PÉ da sala, logo acima do
 * campo de mensagem (folha do celular: longe do placar que fica à vista acima da folha).
 */
export function OferecimentoChat({ className, compacta, noPe }: { className?: string; compacta?: boolean; noPe?: boolean }) {
  const { anuncios, escolha, vista, semProvedor, pronto } = useAnunciosDaPagina();
  const topo = escolha.topo?.id;
  const rodape = escolha.rodape?.id;
  const a = useMemo(
    () => escolherAnuncio(anuncios, 'chat', `${idDaVisita()}|chat`, [topo, rodape].filter((x): x is string => !!x)),
    [anuncios, topo, rodape],
  );
  if (semProvedor || !pronto || !a) return null;
  return <OferecimentoChatPeca anuncio={a} vista={vista} className={className} compacta={compacta} noPe={noPe} />;
}

export function OferecimentoChatPeca({
  anuncio: a,
  vista = 'previa',
  previa,
  compacta,
  noPe,
  className,
}: {
  anuncio: AnuncioPublico;
  vista?: string;
  previa?: boolean;
  /** sem o botão (colunas estreitas) */
  compacta?: boolean;
  /** no pé da sala (borda em cima, mais baixa) */
  noPe?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'chat', bloco: 'chat', vista, ativo: !previa });
  return (
    <aside aria-label="Publicidade" className={cn(noPe ? 'border-t border-line bg-surface-2/60' : 'border-b border-line bg-surface-2/60', className)}>
      <LinkAnuncio
        ref={ref}
        anuncio={a}
        formato="chat"
        previa={previa}
        anelDentro
        className={cn('flex items-center gap-2.5 px-4 transition-colors hover:bg-surface-2', noPe ? 'min-h-[40px] py-1.5' : 'min-h-[48px] py-2')}
      >
        <LogoMarca anuncio={a} tamanho="xs" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-subtle">Sala oferecida por</span>
          <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-fg">
            {a.marca}
            {a.titulo ? <span className="font-normal text-fg-muted"> · {a.titulo}</span> : null}
          </span>
        </span>
        {compacta ? (
          <Icon name="externo" size={15} className="text-fg-subtle" />
        ) : (
          <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-fg transition-colors group-hover:bg-surface-3">
            <span className="max-w-[9rem] truncate">{a.cta}</span>
            <Icon name="externo" size={13} className="text-fg-subtle" />
          </span>
        )}
      </LinkAnuncio>
    </aside>
  );
}

/**
 * Vitrine do formato (página /anuncie e prévia do painel): a peça REAL em modo prévia dentro de uma moldura que lembra
 * a Sala da apuração — cabeçalho da sala, a faixa "Sala oferecida por", mensagens (linhas cinzas, sem texto nem número
 * inventado), reações e o campo de envio.
 */
export function MolduraChatVitrine({ anuncio, estreita }: { anuncio: AnuncioPublico; estreita?: boolean }) {
  const linhas: [string, string, string?][] = [
    ['w-14', 'w-11/12', 'w-1/2'],
    ['w-20', 'w-3/4'],
    ['w-12', 'w-10/12', 'w-2/3'],
    ['w-16', 'w-1/2'],
  ];
  return (
    <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[22px] border border-line bg-surface shadow-card">
      <div aria-hidden className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand-fg ring-1 ring-inset ring-brand/30">
          <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12.2c0 3.9-3.6 7-8 7-1.1 0-2.2-.2-3.1-.6L4.5 20l1.2-3.4C4.6 15.4 4 13.9 4 12.2c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold text-fg">
            Sala da apuração <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          <span className="mt-1.5 block h-2 w-24 rounded-full bg-surface-3" />
        </span>
      </div>
      <OferecimentoChatPeca anuncio={anuncio} previa compacta={estreita} />
      <div aria-hidden className="space-y-3 px-4 py-4">
        {linhas.map(([ap, l1, l2], i) => (
          <div key={i} className="space-y-1.5">
            <div className={cn('h-2 rounded-full bg-fg-subtle/35', ap)} />
            <div className={cn('h-2.5 rounded-full bg-surface-3', l1)} />
            {l2 ? <div className={cn('h-2.5 rounded-full bg-surface-3', l2)} /> : null}
          </div>
        ))}
      </div>
      <div aria-hidden className="border-t border-line px-3 pb-3 pt-2.5">
        <div className="mb-2 flex gap-1">
          {['🔥', '😮', '👏', '👀'].map((e) => (
            <span key={e} className="inline-flex h-7 items-center rounded-full border border-line px-2 text-[13px]">
              {e}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="h-10 flex-1 rounded-xl border border-line bg-surface-2" />
          <span className="h-10 w-10 rounded-xl bg-brand-cta opacity-60" />
        </div>
      </div>
    </div>
  );
}
