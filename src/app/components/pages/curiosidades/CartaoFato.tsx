/**
 * Cartão de uma curiosidade na página: tema, título, número em destaque (ou o par dos finalistas, lado a lado e com o
 * mesmo peso), contexto, lugares com link para o mapa e o botão de compartilhar (kit: imagem + texto + link).
 */
import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import type { Curiosidade, CuriosidadesDataset, FinalistaCuriosidade, LadoCuriosidade } from '@/shared/curiosidades';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { BotaoCompartilhar, type FormatoCartao } from '@/app/components/share';
import { CartaoCuriosidade } from './CartaoCuriosidade';
import { ComNumeros } from './ComNumeros';
import { HASHTAGS_CURIOSIDADES, ICONE_TEMA, caminhoFato, fmtValor, nivelTamanho, nomeArquivoFato, rotuloTema, textoParaCompartilhar } from './formato';

export interface CartaoFatoProps {
  fato: Curiosidade;
  finalistas: CuriosidadesDataset['finalistas'];
  /** Realce (deep link ?fato=). */
  emFoco?: boolean;
  /** Variante maior (hero). */
  grande?: boolean;
  className?: string;
}

const TAM_DESTAQUE = ['text-[56px] sm:text-[64px]', 'text-[50px] sm:text-[58px]', 'text-[44px] sm:text-[52px]', 'text-[38px] sm:text-[46px]'] as const;
const TAM_DESTAQUE_GRANDE = ['text-[72px] sm:text-[96px]', 'text-[64px] sm:text-[84px]', 'text-[52px] sm:text-[72px]', 'text-[42px] sm:text-[60px]'] as const;

export const CartaoFato = forwardRef<HTMLElement, CartaoFatoProps>(function CartaoFato({ fato, finalistas, emFoco, grande, className }, ref) {
  const valor = fato.destaque ? fmtValor(fato.destaque) : '';
  const tam = (grande ? TAM_DESTAQUE_GRANDE : TAM_DESTAQUE)[nivelTamanho(valor)];
  // Lugares citados (links para o mapa). Nos pares em que cada lado já leva ao seu lugar, a linha seria repetida.
  const citados = fato.par?.a.lugar && fato.par?.b.lugar ? [] : fato.lugares.filter((l) => l.rota && l.nome !== 'Brasil' && l.nome !== 'Exterior');
  // Um único lugar que é o próprio destino de "Ver no mapa" já está no contexto: não repete.
  const lugares = citados.length === 1 && citados[0].rota === fato.rota ? [] : citados;
  const compartilhar = {
    titulo: 'Compartilhar curiosidade',
    descricao: fato.titulo,
    texto: textoParaCompartilhar(fato),
    caminho: caminhoFato(fato.id),
    hashtags: HASHTAGS_CURIOSIDADES,
    nomeArquivo: nomeArquivoFato(fato.id),
    cartao: (formato: FormatoCartao) => <CartaoCuriosidade fato={fato} finalistas={finalistas} formato={formato} />,
  };
  return (
    <article
      ref={ref}
      id={`fato-${fato.id}`}
      aria-labelledby={`fato-${fato.id}-titulo`}
      className={cn(
        'group relative flex min-w-0 scroll-mt-[calc(var(--app-header-h,56px)+72px)] flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-[border-color,box-shadow] duration-300',
        emFoco ? 'border-brand/60 shadow-glow' : 'border-line',
        grande ? 'p-5 sm:p-7' : 'p-4 sm:p-5',
        className,
      )}
    >
      {fato.par ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex h-1">
          <span className="flex-1 bg-cand-a" />
          <span className="flex-1 bg-cand-b" />
        </div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-grad opacity-70" />
      )}

      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
        <Icon name={ICONE_TEMA[fato.tema]} size={14} className="shrink-0 text-brand-fg" />
        <span className="truncate">{rotuloTema(fato.tema)}</span>
      </div>

      <h3
        id={`fato-${fato.id}-titulo`}
        className={cn('mt-2 text-balance font-display font-semibold leading-[1.12] tracking-[-0.02em] text-fg', grande ? 'text-[22px] sm:text-[28px]' : 'text-[18px] sm:text-[19px]')}
      >
        {fato.titulo}
      </h3>

      {fato.destaque ? (
        <div className={cn(grande ? 'mt-4' : 'mt-3')}>
          <div className={cn('num whitespace-nowrap font-display font-semibold leading-[0.95] tracking-[-0.03em] text-brand-fg', tam)}>{valor}</div>
          {fato.destaque.unidade ? <div className={cn('mt-1.5 font-medium text-fg', grande ? 'text-[16px] sm:text-[18px]' : 'text-[14.5px]')}>{fato.destaque.unidade}</div> : null}
        </div>
      ) : null}

      {fato.par ? (
        // subgrid: nome, número e rótulo alinhados entre os dois lados mesmo quando um nome quebra em 2 linhas
        <div className={cn('grid grid-cols-2 gap-x-2.5', fato.destaque ? 'mt-3.5' : grande ? 'mt-4' : 'mt-3')}>
          <LadoFinalista lado={fato.par.a} fin={finalistas.a} compacto={!!fato.destaque} grande={grande} />
          <LadoFinalista lado={fato.par.b} fin={finalistas.b} compacto={!!fato.destaque} grande={grande} />
        </div>
      ) : null}

      <p className={cn('mt-3 text-pretty leading-relaxed text-fg-muted', grande ? 'text-[15px] sm:text-[16.5px]' : 'text-[14px] sm:text-[14.5px]')}>
        <ComNumeros texto={fato.contexto} />
      </p>

      {lugares.length ? (
        <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px]">
          {lugares.slice(0, 3).map((l) => (
            <li key={l.rota} className="min-w-0 max-w-full">
              <Link
                to={l.rota!}
                className="inline-flex max-w-full items-center gap-1 text-fg underline decoration-line underline-offset-4 hover:decoration-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon name="pin" size={14} className="shrink-0 text-brand-fg" />
                <span className="truncate">{l.nome}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group/det mt-3 text-[12.5px] text-fg-subtle">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
          <Icon name="info" size={13} />
          Fonte e critério
          <Icon name="chevron" size={13} className="transition-transform group-open/det:rotate-180" />
        </summary>
        <p className="mt-1.5 leading-snug">
          <ComNumeros texto={`${fato.fonte}.${fato.criterio ? ` ${fato.criterio}` : ''}`} />
        </p>
      </details>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Link
          to={fato.rota}
          className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-3 text-[13.5px] font-medium text-fg transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:flex-none sm:justify-start"
        >
          <Icon name={fato.rotuloRota.startsWith('Ver a ficha') ? 'usuarios' : 'mapa'} size={16} className="shrink-0 text-brand-fg" />
          <span className="truncate">{fato.rotuloRota}</span>
        </Link>
        <BotaoCompartilhar {...compartilhar} label="Compartilhar" variant="outline" size="md" className="shrink-0 sm:ml-auto" />
      </div>
    </article>
  );
});

const SLOT = {
  a: { caixa: 'border-cand-a/35 bg-cand-a/[0.07]', ponto: 'bg-cand-a', texto: 'text-cand-a-fg' },
  b: { caixa: 'border-cand-b/35 bg-cand-b/[0.07]', ponto: 'bg-cand-b', texto: 'text-cand-b-fg' },
} as const;

function LadoFinalista({ lado, fin, compacto, grande }: { lado: LadoCuriosidade; fin: FinalistaCuriosidade; compacto: boolean; grande?: boolean }) {
  const s = SLOT[fin.slot];
  const v = fmtValor(lado.valor);
  const n = nivelTamanho(v);
  const tam = compacto
    ? 'text-[24px] sm:text-[26px]'
    : grande
      ? ['text-[40px] sm:text-[52px]', 'text-[34px] sm:text-[46px]', 'text-[30px] sm:text-[40px]', 'text-[26px] sm:text-[34px]'][n]
      : ['text-[34px] sm:text-[38px]', 'text-[30px] sm:text-[34px]', 'text-[26px] sm:text-[30px]', 'text-[22px] sm:text-[26px]'][n];
  const conteudo = (
    <>
      <div className="flex min-w-0 items-start gap-1.5 text-[12.5px] font-semibold leading-tight text-fg">
        <span aria-hidden className={cn('mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full', s.ponto)} />
        <span className="min-w-0 break-words">
          {fin.nomeUrna} <span className="num font-medium text-fg-subtle">{fin.numero}</span>
        </span>
      </div>
      <div className={cn('num mt-1.5 whitespace-nowrap font-display font-semibold leading-none tracking-[-0.03em]', s.texto, tam)}>{v}</div>
      <div className="mt-1 text-[12px] leading-snug text-fg-muted">
        {lado.valor.unidade ? <span>{lado.valor.unidade}</span> : null}
        {lado.rotulo ? (
          <span className="block text-fg">
            <ComNumeros texto={lado.rotulo} />
          </span>
        ) : null}
      </div>
    </>
  );
  const cls = cn('row-span-3 grid min-w-0 grid-rows-subgrid content-start rounded-xl border p-2.5 sm:p-3', s.caixa);
  return lado.lugar?.rota ? (
    <Link
      to={lado.lugar.rota}
      className={cn(cls, 'transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand')}
      aria-label={`${fin.nomeUrna}: ${v}${lado.valor.unidade ? ` ${lado.valor.unidade}` : ''}, ${lado.rotulo}. Ver no mapa`}
    >
      {conteudo}
    </Link>
  ) : (
    <div className={cls}>{conteudo}</div>
  );
}
