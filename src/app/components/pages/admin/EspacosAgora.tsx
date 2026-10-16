/**
 * "Espaços agora" (anunciantes v2, E13): no topo de Anunciantes, uma linha por formato com quem aparece nele agora e a
 * fatia estimada pela rotação (`participacao`, a mesma regra de `escolherAnuncio`: master com prioridade no topo, na TV,
 * nas lives e nas imagens; a reserva só onde não há pago; o resto pelo peso). Formato vazio fica em destaque, com
 * [Preencher] (abre o formulário de um anúncio com o formato já marcado). Aviso global quando chat ou lives estão sem
 * anúncio na noite da eleição.
 */
import { FORMATOS_ANUNCIO, NOME_CURTO_FORMATO, type AnuncioConfig, type FormatoAnuncio } from '@/shared/anuncios';
import { NOITE_ELEICAO } from '@/shared/relatorio';
import { fmtInt, fmtLista } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button, Icon } from '@/app/ui';
import { Callout, Painel } from './kit';
import { fmtFatia, participacao, type ForaDoAr, type Fatia } from './anunciosAdmin';
import { LogoAnuncio } from './PreviaAnuncio';

/** Logos mostrados por formato (os demais viram "+N"). */
const MAX_LOGOS = 6;

/** "8% cada" (fatias iguais) ou "de 5% a 20%". */
function faixaDe(fatias: readonly Fatia[]): string {
  const min = Math.min(...fatias.map((f) => f.fatia));
  const max = Math.max(...fatias.map((f) => f.fatia));
  // fatias iguais: "8% cada" (o arredondamento por maior resto daria 9% em algumas e 8% em outras)
  return max - min < 1e-9 ? `${fmtInt(Math.round(min * 100))}% cada` : `de ${fmtFatia(Math.min(...fatias.map((f) => f.pct)))} a ${fmtFatia(Math.max(...fatias.map((f) => f.pct)))}`;
}

/** Rótulo da cota de uma fatia. */
const cotaDe = (f: Fatia) => (f.reserva ? 'reserva' : f.cota === 'master' ? 'master' : 'apoio');

/** Formatos sem nenhum anúncio na noite da eleição (25/10, 17h): pela janela e pela meta de cada um, agora. */
export function vaziosNaNoite(anuncios: readonly AnuncioConfig[], fora: ForaDoAr = {}): FormatoAnuncio[] {
  const instante = NOITE_ELEICAO.inicio + 60_000;
  return FORMATOS_ANUNCIO.filter((f) => participacao(anuncios, f, instante, { esgotados: fora.esgotados }).length === 0);
}

export function EspacosAgora({
  anuncios,
  agora,
  fora,
  onPreencher,
}: {
  anuncios: readonly AnuncioConfig[];
  agora: number;
  fora: ForaDoAr;
  onPreencher: (f: FormatoAnuncio) => void;
}) {
  const porMarca = new Map(anuncios.map((a) => [a.id, a]));
  const noite = agora < NOITE_ELEICAO.fim ? vaziosNaNoite(anuncios, fora).filter((f) => f === 'chat' || f === 'live') : [];
  return (
    <Painel
      titulo="Espaços agora"
      icone="grade"
      subtitulo="Quem aparece em cada formato neste momento: estimativa pela rotação."
      className="mb-4 lg:mb-5"
      pt="pt-3"
    >
      {noite.length ? (
        <Callout tom="alerta" className="num mb-3">
          {fmtLista(noite.map((f) => NOME_CURTO_FORMATO[f]))} sem nenhum anúncio na noite (25/10, 17h). Marque {noite.length > 1 ? 'esses formatos' : 'esse formato'} em
          pelo menos um anúncio.
        </Callout>
      ) : null}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" data-espacos>
        {FORMATOS_ANUNCIO.map((f) => {
          const fatias = participacao(anuncios, f, agora, fora);
          const vazio = fatias.length === 0;
          const resumo = fatias.map((x) => `${x.marca} ${fmtFatia(x.pct)} (${cotaDe(x)})`).join(', ');
          return (
            <li
              key={f}
              data-formato={f}
              data-vazio={vazio || undefined}
              aria-label={`${NOME_CURTO_FORMATO[f]}: ${fora.suspenso ? 'suspenso' : vazio ? 'vazio' : resumo}`}
              className={cn('flex min-h-[52px] items-center gap-3 px-3 py-2', vazio && !fora.suspenso && 'bg-alert/[0.06]')}
            >
              <span className="w-[74px] shrink-0 text-[12.5px] font-semibold text-fg sm:w-[92px] sm:text-[13px]">{NOME_CURTO_FORMATO[f]}</span>
              {fora.suspenso ? (
                <span className="text-[12.5px] text-fg-subtle">suspenso (geral)</span>
              ) : vazio ? (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-alert-fg">
                    <Icon name="alerta" size={14} />
                    vazio
                  </span>
                  <Button variant="outline" size="sm" icon="mais" onClick={() => onPreencher(f)} className="h-8 px-2.5">
                    Preencher
                  </Button>
                </span>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-1">
                    {fatias.slice(0, MAX_LOGOS).map((x) => {
                      const a = porMarca.get(x.id);
                      return a ? <LogoAnuncio key={x.id} anuncio={a} tamanho="sm" /> : null;
                    })}
                    {fatias.length > MAX_LOGOS ? (
                      <span className="num inline-flex h-6 items-center rounded-full bg-surface-3 px-2 text-[11px] font-semibold text-fg-muted">+{fatias.length - MAX_LOGOS}</span>
                    ) : null}
                  </span>
                  <span className="min-w-0 text-[12.5px] leading-snug text-fg">
                    {fatias.length <= 3 ? (
                      fatias.map((x, k) => (
                        <span key={x.id}>
                          {k ? <span className="text-fg-subtle"> · </span> : null}
                          <span className="font-medium">{x.marca}</span> <span className="num font-semibold">{fmtFatia(x.pct)}</span>
                          <span className="text-fg-subtle"> ({cotaDe(x)})</span>
                        </span>
                      ))
                    ) : (
                      <span>
                        <span className="num font-medium">{fmtInt(fatias.length)}</span> em rotação ·{' '}
                        <span className="num font-semibold">{faixaDe(fatias)}</span>
                        <span className="text-fg-subtle"> ({fmtLista([...new Set(fatias.map(cotaDe))])})</span>
                      </span>
                    )}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Painel>
  );
}
