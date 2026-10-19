/**
 * Cartões do Palpite para compartilhar (kit `@/app/components/share`, formatos x/feed/story):
 *  - 'palpite':   "Meu palpite para o 2º turno" — os dois finalistas na ordem da urna, o % de cada um (uma casa) e a
 *                 barra do duelo com a marca dos 50%;
 *  - 'resultado': "Errei por Z p.p." / "Na mosca" — a diferença entre o palpite e o resultado oficial do TSE, com o
 *                 palpite embaixo. O cartão NÃO traz o placar oficial (é o cartão do palpite, não do resultado).
 *
 * Gerados no NAVEGADOR (o palpite nunca vai ao servidor — LGPD). Sem fotos (números hipotéticos, como a calculadora de
 * cenários): monograma na cor que vem dos dados (`corSlot(c.cor)`), igual para os dois.
 *
 * Anúncio: só com `OFERECIMENTO_COM_CANDIDATOS` (src/shared/oferecimento.ts — hoje DESLIGADO: o cartão tem nomes e
 * percentuais de candidatos, e anúncio nunca fica colado a nome ou número de candidato). Ligado, a página passa a marca:
 * faixa própria "Oferecimento: <marca>" no PÉ, só texto, separada por linha e DEPOIS do rodapé do cartão (domínio e
 * data). No story, a faixa fica acima da margem de baixo (área livre da interface dos apps).
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Candidate } from '@/shared/types';
import { fmtDecimal, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';
import { AvatarCartao, BarraDuelo, CartaoBase, PctGigante, useCartao, type FormatoCartao } from '@/app/components/share';
import { DIMENSOES_CARTAO } from '@/app/components/share/tipos';
import { pctsDoPalpite, type Avaliacao } from './nucleo';
import { fmtDiferenca, mancheteResultado } from './textos';

export type FinalistasCartao = readonly [Candidate, Candidate];

export interface CartaoPalpiteProps {
  formato: FormatoCartao;
  modo: 'palpite' | 'resultado';
  /** os dois finalistas na ordem da urna (menor número primeiro), com as cores dos dados */
  finalistas: FinalistasCartao;
  /** décimos do candidato de menor número */
  a: number;
  /** quando o palpite foi cravado (epoch ms) */
  cravadoEm?: number | null;
  /** palpites ainda abertos (até as 23h59 de 24/10) */
  aberto: boolean;
  /** modo 'resultado' */
  avaliacao?: Avaliacao;
  /** % de seções do resultado comparado (modo 'resultado') */
  pctSecoes?: number;
  /** marca do anunciante da faixa "Oferecimento" (null = sem faixa) */
  oferecimento?: string | null;
}

/** Faixa do anúncio por formato: altura e o espaço livre abaixo dela (story: área da interface dos apps). */
const FAIXA: Record<FormatoCartao, { alt: number; abaixo: number; fonte: number; pb: number }> = {
  x: { alt: 40, abaixo: 0, fonte: 17, pb: 22 },
  feed: { alt: 54, abaixo: 0, fonte: 22, pb: 34 },
  story: { alt: 60, abaixo: 124, fonte: 24, pb: 30 },
};

export function CartaoPalpite(props: CartaoPalpiteProps) {
  const { formato, modo, finalistas, cravadoEm, oferecimento } = props;
  const marca = oferecimento?.trim().slice(0, 40) || null;
  const base = (
    <CartaoBase
      formato={formato}
      sobrancelha="Palpite · 2º turno 2026"
      caminho="/palpite"
      instante={cravadoEm ?? null}
      rotuloInstante="Cravado em"
      fonte="Palpite individual · não é pesquisa"
      selo={<SeloPalpite />}
      titulo={formato === 'x' ? undefined : modo === 'resultado' ? 'Como foi o meu palpite' : 'Meu palpite para o 2º turno'}
      brilho={[finalistas[0].cor, finalistas[1].cor]}
      rodape={siteExibicao() ? undefined : 'Faça o seu palpite no Sintonia'}
      className={marca ? CLASSE_CARTAO_COM_FAIXA : undefined}
    >
      {modo === 'resultado' ? <MioloResultado {...props} /> : <MioloPalpite {...props} />}
    </CartaoBase>
  );
  return (
    <ComOferecimento formato={formato} marca={marca}>
      {base}
    </ComOferecimento>
  );
}

/** Classe do `CartaoBase` quando há a faixa do anúncio: o cartão encolhe pela altura da faixa (e do espaço abaixo). */
export const CLASSE_CARTAO_COM_FAIXA = '![height:var(--cartao-alt)] ![padding-bottom:var(--cartao-pb)]';

/**
 * Faixa "Oferecimento: <marca>" no PÉ do cartão (separada por linha, depois do rodapé com domínio e data); sem `marca`,
 * o cartão sai como está. Quem usa decide se o cartão pode ter anúncio (regra em src/shared/oferecimento.ts) e passa
 * `CLASSE_CARTAO_COM_FAIXA` ao `CartaoBase`. Usada também pelo cartão do ranking do Desafio (sem candidato).
 */
export function ComOferecimento({ formato, marca, children }: { formato: FormatoCartao; marca: string | null; children: ReactNode }) {
  if (!marca) return <>{children}</>;
  const { w, h } = DIMENSOES_CARTAO[formato];
  const f = FAIXA[formato];
  const estilo = { width: w, height: h, '--cartao-alt': `${h - f.alt - f.abaixo}px`, '--cartao-pb': `${f.pb}px` } as CSSProperties;
  return (
    <div style={estilo} className="relative flex flex-col overflow-hidden bg-bg font-sans text-fg antialiased">
      {children}
      <FaixaOferecimento marca={marca} altura={f.alt} fonte={f.fonte} />
      {f.abaixo ? <div aria-hidden className="bg-bg" style={{ height: f.abaixo }} /> : null}
    </div>
  );
}

/** "Oferecimento: <marca>" — faixa própria, centralizada, só texto (mesmo padrão das imagens OG genéricas). */
function FaixaOferecimento({ marca, altura, fonte }: { marca: string; altura: number; fonte: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center border-t border-line bg-surface px-16 text-fg-subtle"
      style={{ height: altura, fontSize: fonte, gap: fonte * 0.4 }}
    >
      <span className="tracking-[0.02em]">Oferecimento:</span>
      <span className="max-w-[60%] truncate font-semibold text-fg">{marca}</span>
    </div>
  );
}

/** Selo do cabeçalho: mesmo peso visual do selo de simulação, com outro texto. */
function SeloPalpite() {
  const { k } = useCartao();
  return (
    <div className="shrink-0 rounded-[0.4em] border-brand bg-brand/15 text-center" style={{ borderWidth: Math.round(3 * k), padding: `${10 * k}px ${18 * k}px` }}>
      <div className="font-bold uppercase leading-none tracking-[0.16em] text-brand-fg" style={{ fontSize: 22 * k }}>
        Palpite
      </div>
      <div className="mt-[0.35em] font-semibold uppercase leading-none tracking-[0.18em] text-fg-muted" style={{ fontSize: 13 * k }}>
        individual
      </div>
    </div>
  );
}

function Cabeca({ c, alinhar, avatar, nome }: { c: Candidate; alinhar: 'esq' | 'dir'; avatar: number; nome: number }) {
  const { k } = useCartao();
  return (
    <div className={cn('flex min-w-0 max-w-full items-center', alinhar === 'dir' && 'flex-row-reverse text-right')} style={{ gap: 14 * k }}>
      <AvatarCartao cor={c.cor} nome={c.nomeUrna} size={Math.round(avatar * k)} />
      <div className="min-w-0">
        <div className="truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: nome * k }}>
          {c.nomeUrna}
        </div>
        {/* só o partido: o número de urna não vai na imagem (circula em redes; nome + número = santinho) */}
        <div className="truncate text-fg-muted" style={{ fontSize: nome * 0.58 * k, marginTop: 2 * k }}>
          {c.partido}
        </div>
      </div>
    </div>
  );
}

/** Um finalista: cabeça (monograma, nome, partido) e o % gigante. */
function Lado({ c, pct, alinhar, tamPct, avatar = 52, nome = 26 }: { c: Candidate; pct: number; alinhar: 'esq' | 'dir'; tamPct: number; avatar?: number; nome?: number }) {
  const { k } = useCartao();
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', alinhar === 'dir' ? 'items-end' : 'items-start')}>
      <Cabeca c={c} alinhar={alinhar} avatar={avatar} nome={nome} />
      <div style={{ marginTop: 10 * k }}>
        <PctGigante valor={pct} size={tamPct} cor={c.cor} casas={1} />
      </div>
    </div>
  );
}

/** Lado a lado (16:9 e o palpite dentro do cartão do resultado). */
function DueloLado({ finalistas, a, tamPct, alto, avatar, nome }: { finalistas: FinalistasCartao; a: number; tamPct: number; alto: number; avatar?: number; nome?: number }) {
  const { k } = useCartao();
  const [p0, p1] = pctsDoPalpite(a);
  return (
    <div>
      <div className="flex items-end justify-between" style={{ gap: 24 * k }}>
        <Lado c={finalistas[0]} pct={p0} alinhar="esq" tamPct={tamPct} avatar={avatar} nome={nome} />
        <Lado c={finalistas[1]} pct={p1} alinhar="dir" tamPct={tamPct} avatar={avatar} nome={nome} />
      </div>
      <div style={{ marginTop: 18 * k }}>
        <BarraDuelo race={{ candidatos: [...finalistas] }} votos={[a, 1000 - a]} alto={alto} rotulo={false} />
      </div>
    </div>
  );
}

/**
 * Retrato (feed/story): um finalista em cima (alinhado à esquerda), a barra no meio e o outro embaixo (à direita) — a
 * mesma ordem da barra (menor número à esquerda) e números bem maiores do que caberiam lado a lado.
 */
function DueloEmPe({ finalistas, a, tamPct, alto }: { finalistas: FinalistasCartao; a: number; tamPct: number; alto: number }) {
  const { k } = useCartao();
  const [p0, p1] = pctsDoPalpite(a);
  return (
    <div className="flex flex-col">
      <Lado c={finalistas[0]} pct={p0} alinhar="esq" tamPct={tamPct} avatar={64} nome={32} />
      <div style={{ margin: `${26 * k}px 0` }}>
        <BarraDuelo race={{ candidatos: [...finalistas] }} votos={[a, 1000 - a]} alto={alto} rotulo={false} />
      </div>
      <Lado c={finalistas[1]} pct={p1} alinhar="dir" tamPct={tamPct} avatar={64} nome={32} />
    </div>
  );
}

function Nota({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { k } = useCartao();
  return (
    <div className="leading-snug text-fg-muted" style={{ fontSize: 17 * k, ...style }}>
      {children}
    </div>
  );
}

/** Convite no pé do miolo: prazo (aberto) ou "encerrados". */
function Convite({ aberto }: { aberto: boolean }) {
  const { k, retrato } = useCartao();
  return (
    <div
      className="flex items-center justify-between rounded-[0.7em] border border-brand/40 bg-brand/10"
      style={{ gap: 16 * k, padding: `${(retrato ? 16 : 11) * k}px ${(retrato ? 22 : 18) * k}px`, fontSize: (retrato ? 21 : 18) * k }}
    >
      <span className="text-fg-muted">% dos votos válidos</span>
      <span className="font-semibold text-fg">{aberto ? 'E o seu? Palpites até 24/10' : 'Palpites encerrados em 24/10'}</span>
    </div>
  );
}

function MioloPalpite({ formato, finalistas, a, aberto }: CartaoPalpiteProps) {
  const { k } = useCartao();
  if (formato === 'x') {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col" style={{ paddingTop: 16 * k, paddingBottom: 18 * k }}>
        <div className="font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: 34 * k }}>
          Meu palpite para o 2º turno
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <DueloLado finalistas={finalistas} a={a} tamPct={128} alto={20} />
        </div>
        <Convite aberto={aberto} />
      </div>
    );
  }
  const feed = formato === 'feed';
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ paddingTop: (feed ? 20 : 30) * k, paddingBottom: (feed ? 22 : 34) * k }}>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <DueloEmPe finalistas={finalistas} a={a} tamPct={(feed ? 150 : 178) * k} alto={Math.round((feed ? 20 : 24) * k)} />
      </div>
      <Convite aberto={aberto} />
    </div>
  );
}

/** Alvo (inline; herda a cor do texto). */
function Alvo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MioloResultado({ formato, finalistas, a, avaliacao, pctSecoes }: CartaoPalpiteProps) {
  const { k, retrato } = useCartao();
  const av = avaliacao ?? { erro: 0, naMosca: true };
  const secoes = pctSecoes !== undefined && pctSecoes < 100 ? `, com ${fmtPct(pctSecoes)} das seções` : ' (100% das seções)';
  const x = formato === 'x';
  // "Errei por" pequeno em cima, a diferença gigante embaixo; "Na mosca" gigante com o alvo
  const tamValor = (x ? 112 : formato === 'feed' ? 150 : 170) * k;
  const manchete = av.naMosca ? (
    <div className="flex items-center text-brand-fg" style={{ gap: 22 * k }}>
      <Alvo size={Math.round(tamValor * 0.62)} />
      <div className="whitespace-nowrap font-display font-semibold leading-[0.9] tracking-[-0.045em] text-fg" style={{ fontSize: tamValor * 0.68 }}>
        Na mosca
      </div>
    </div>
  ) : (
    <div>
      <div className="font-display font-semibold leading-none tracking-[-0.03em] text-fg-muted" style={{ fontSize: tamValor * 0.36 }}>
        Errei por
      </div>
      <div className="num font-display font-semibold leading-[0.9] tracking-[-0.045em] text-brand-fg" style={{ fontSize: tamValor, marginTop: 8 * k }}>
        {fmtDecimal(av.erro, 1)}
        <span className="tracking-normal text-fg" style={{ fontSize: tamValor * 0.4, marginLeft: tamValor * 0.06 }}>
          p.p.
        </span>
      </div>
    </div>
  );
  const nota = (
    <Nota style={{ marginTop: (x ? 10 : 18) * k, fontSize: (x ? 18 : 22) * k }}>
      {av.naMosca ? (
        <>
          Diferença de <span className="num font-semibold text-fg">{fmtDiferenca(av.erro)}</span> entre o meu palpite e o resultado oficial do TSE{secoes}.
        </>
      ) : (
        <>Diferença entre o meu palpite e o resultado oficial do TSE{secoes}, em pontos percentuais dos votos válidos.</>
      )}
    </Nota>
  );
  const palpite = (
    <div className="border-t-2 border-line" style={{ paddingTop: (x ? 14 : 26) * k }}>
      <div className="font-semibold uppercase leading-none tracking-[0.14em] text-fg-muted" style={{ fontSize: (x ? 14 : 16) * k, marginBottom: (x ? 8 : 14) * k }}>
        Meu palpite
      </div>
      <DueloLado finalistas={finalistas} a={a} tamPct={(x ? 52 : 76) * k} alto={Math.round((x ? 12 : 16) * k)} avatar={x ? 40 : 48} nome={x ? 21 : 24} />
    </div>
  );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ paddingTop: (retrato ? 10 : 14) * k, paddingBottom: (x ? 14 : 26) * k }}>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        {manchete}
        {nota}
      </div>
      {palpite}
    </div>
  );
}
