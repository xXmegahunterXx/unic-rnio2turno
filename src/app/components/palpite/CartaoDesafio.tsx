/**
 * Cartão do RANKING do Desafio do palpite (kit `@/app/components/share`, formatos x/feed/story sobre `CartaoBase`):
 * "Quem chegou mais perto" — posição, apelido e a diferença (p.p.) de cada um para o resultado oficial do TSE, com o
 * destaque "Na mosca". Só existe com a apuração oficial concluída (a página não oferece antes).
 *
 * Gerado no NAVEGADOR: os apelidos e os palpites nunca vão ao servidor (nem na URL de uma imagem). SEM nome, cor, foto,
 * número ou percentual de candidato — só apelidos e distâncias, nas cores da marca. A faixa "Oferecimento: <marca>" tem
 * interruptor próprio, DESLIGADO (`OFERECIMENTO_RANKING_DESAFIO`, src/shared/oferecimento.ts: "desafio + ranking +
 * oferecido por" lembraria bolão patrocinado). Se um dia o cartão passar a mostrar os palpites com os nomes,
 * `RANKING_TEM_CANDIDATO` vira true e o anúncio também passa a exigir OFERECIMENTO_COM_CANDIDATOS.
 */
import type { ReactNode } from 'react';
import { fmtDecimal } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';
import { Icon } from '@/app/ui/Icon';
import { CartaoBase, useCartao, type FormatoCartao } from '@/app/components/share';
import { CLASSE_CARTAO_COM_FAIXA, ComOferecimento } from './CartaoPalpite';
import { SEM_DINHEIRO, type ItemRanking } from './desafio';

/** O cartão mostra candidato (nome, cor ou percentual)? Hoje não: só apelidos e diferenças. */
export const RANKING_TEM_CANDIDATO = false;

export interface CartaoDesafioProps {
  formato: FormatoCartao;
  itens: readonly Pick<ItemRanking, 'id' | 'apelido' | 'eu' | 'posicao' | 'erro' | 'naMosca' | 'tarde'>[];
  /** marca do anunciante da faixa "Oferecimento" (null = sem faixa); a página já aplicou a regra */
  oferecimento?: string | null;
}

/** Linhas que cabem em cada formato (o resto vira "e mais N"). */
export const LINHAS_CARTAO: Record<FormatoCartao, number> = { x: 5, feed: 8, story: 10 };
/**
 * Altura de cada linha (px reais): divide o espaço da lista (medido com a faixa do anúncio, o caso mais apertado) entre
 * as linhas mostradas, até um teto — com poucos participantes as linhas crescem e o cartão não fica vazio.
 */
const LISTA: Record<FormatoCartao, { espaco: number; teto: number; vao: number }> = {
  x: { espaco: 330, teto: 62, vao: 4 },
  feed: { espaco: 760, teto: 104, vao: 10 },
  story: { espaco: 980, teto: 124, vao: 11 },
};
export function alturaLinha(formato: FormatoCartao, linhas: number): number {
  const { espaco, teto, vao } = LISTA[formato];
  const n = Math.max(1, linhas);
  return Math.round(Math.min(teto, (espaco - vao * (n - 1)) / n));
}

export function CartaoDesafio({ formato, itens, oferecimento }: CartaoDesafioProps) {
  const marca = oferecimento?.trim().slice(0, 40) || null;
  return (
    <ComOferecimento formato={formato} marca={marca}>
      <CartaoBase
        formato={formato}
        sobrancelha="Desafio do palpite · 2º turno 2026"
        caminho="/palpite/desafio"
        instante={null}
        fonte={`Resultado oficial: TSE · ${SEM_DINHEIRO.toLowerCase()}`}
        selo={<SeloDesafio />}
        titulo={formato === 'x' ? undefined : 'Quem chegou mais perto'}
        brilho="marca"
        rodape={siteExibicao() ? undefined : 'Desafio do palpite no Sintonia'}
        className={marca ? CLASSE_CARTAO_COM_FAIXA : undefined}
      >
        <Miolo formato={formato} itens={itens} />
      </CartaoBase>
    </ComOferecimento>
  );
}

function SeloDesafio() {
  const { k } = useCartao();
  return (
    <div className="shrink-0 rounded-[0.4em] border-brand bg-brand/15 text-center" style={{ borderWidth: Math.round(3 * k), padding: `${10 * k}px ${18 * k}px` }}>
      <div className="font-bold uppercase leading-none tracking-[0.16em] text-brand-fg" style={{ fontSize: 22 * k }}>
        Desafio
      </div>
      <div className="mt-[0.35em] font-semibold uppercase leading-none tracking-[0.18em] text-fg-muted" style={{ fontSize: 13 * k }}>
        entre amigos
      </div>
    </div>
  );
}

/** Alvo (inline; herda a cor do texto). */
function Alvo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Linha({ item, alto, primeiro }: { item: CartaoDesafioProps['itens'][number]; alto: number; primeiro: boolean }) {
  const { k } = useCartao();
  const fonte = alto * 0.42;
  return (
    <div
      className={cn('flex items-center rounded-[0.6em] border', primeiro ? 'border-brand/50 bg-brand/[0.13]' : 'border-transparent')}
      style={{ height: alto, gap: 18 * k, padding: `0 ${18 * k}px`, fontSize: fonte }}
    >
      <span
        className={cn('num flex shrink-0 items-center justify-center rounded-full font-display font-semibold', primeiro ? 'bg-brand text-brand-ink' : 'bg-surface-3 text-fg')}
        style={{ width: alto * 0.66, height: alto * 0.66, fontSize: fonte * 0.9 }}
      >
        {item.posicao}
      </span>
      <span className="flex min-w-0 flex-1 items-center" style={{ gap: fonte * 0.35 }}>
        <span className="truncate font-display font-semibold tracking-[-0.02em] text-fg">{item.apelido || 'Eu'}</span>
        {item.tarde ? <Icon name="relogio" size={Math.round(fonte * 0.75)} className="shrink-0 text-fg-subtle" /> : null}
      </span>
      {item.naMosca ? (
        <span className="inline-flex shrink-0 items-center rounded-full bg-brand/20 font-semibold text-brand-fg" style={{ gap: 6 * k, padding: `${4 * k}px ${12 * k}px`, fontSize: fonte * 0.62 }}>
          <Alvo size={Math.round(fonte * 0.7)} />
          Na mosca
        </span>
      ) : null}
      <span className="num shrink-0 text-right font-display font-semibold tracking-[-0.03em] text-fg" style={{ minWidth: fonte * 3.6 }}>
        {fmtDecimal(item.erro, 1)}
        <span className="text-fg-muted" style={{ fontSize: fonte * 0.6, marginLeft: fonte * 0.18 }}>
          p.p.
        </span>
      </span>
    </div>
  );
}

function Nota({ children }: { children: ReactNode }) {
  const { k, retrato } = useCartao();
  return (
    <div className="leading-snug text-fg-muted" style={{ fontSize: (retrato ? 20 : 16) * k }}>
      {children}
    </div>
  );
}

function Miolo({ formato, itens }: { formato: FormatoCartao; itens: CartaoDesafioProps['itens'] }) {
  const { k, retrato } = useCartao();
  const max = LINHAS_CARTAO[formato];
  const mostra = itens.slice(0, max);
  const resto = itens.length - mostra.length;
  const alto = alturaLinha(formato, mostra.length + (resto > 0 ? 1 : 0));
  const algumTarde = mostra.some((x) => x.tarde);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ paddingTop: (retrato ? 22 : 12) * k, paddingBottom: (retrato ? 22 : 12) * k }}>
      {formato === 'x' ? (
        <div className="font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: 32 * k, marginBottom: 12 * k }}>
          Quem chegou mais perto
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col" style={{ gap: LISTA[formato].vao }}>
        {mostra.map((x) => (
          <Linha key={x.id || 'eu'} item={x} alto={alto} primeiro={x.posicao === 1} />
        ))}
        {resto > 0 ? (
          <div className="font-semibold text-fg-muted" style={{ fontSize: alto * 0.32, paddingLeft: 18 * k, marginTop: 4 * k }}>
            e mais {resto} no desafio
          </div>
        ) : null}
      </div>
      <Nota>
        Diferença entre o palpite de cada um e o resultado oficial do TSE, em pontos percentuais dos votos válidos. Empate: fica à frente quem
        cravou primeiro.{algumTarde ? ' Relógio: link aberto depois do prazo.' : ''}
      </Nota>
    </div>
  );
}
