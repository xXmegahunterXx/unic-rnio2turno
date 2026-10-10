/**
 * Moldura padrão das imagens de compartilhamento: fundo da marca, logo Sintonia, título, URL do site, data/hora de
 * Brasília e — quando há número simulado — o selo "SIMULAÇÃO · dados fictícios" (no topo, numa faixa no rodapé e
 * como marca-d'água, para sobreviver a recortes). Os cartões específicos desenham só o miolo.
 *
 * Desenhada em px reais (1200×675, 1080×1350 ou 1080×1920). Nada de animação nem blur (o PNG é tirado do DOM e o
 * Safari desenha mal filtros dentro do SVG). Os miolos leem as medidas com `useCartao()`: `k` é o fator de escala em
 * relação ao 16:9 (texto de 40 px no 'x' → `40 * k` nos outros formatos).
 */
import { createContext, forwardRef, useContext, type ReactNode } from 'react';
import type { CorCandidato, Race } from '@/shared/types';
import { fmtDataHora } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';
import { LogoMark } from '@/app/components/layout/Logo';
import { DIMENSOES_CARTAO, type FormatoCartao } from './tipos';

export interface MedidasCartao {
  formato: FormatoCartao;
  w: number;
  h: number;
  /** Escala em relação ao formato 'x' (x = 1; feed ≈ 1,3; story ≈ 1,4). */
  k: number;
  /** Retrato (feed/story): os miolos empilham em vez de pôr lado a lado. */
  retrato: boolean;
}

const K: Record<FormatoCartao, number> = { x: 1, feed: 1.3, story: 1.42 };

export function medidasCartao(formato: FormatoCartao): MedidasCartao {
  const { w, h } = DIMENSOES_CARTAO[formato];
  return { formato, w, h, k: K[formato], retrato: formato !== 'x' };
}

const Ctx = createContext<MedidasCartao>(medidasCartao('x'));

/** Medidas do cartão em que o componente está (miolos). */
export const useCartao = () => useContext(Ctx);

/** Respiros da moldura por formato (story deixa as faixas do topo e da base livres para a interface dos apps). */
const PAD: Record<FormatoCartao, { x: number; top: number; bottom: number }> = {
  x: { x: 56, top: 40, bottom: 34 },
  feed: { x: 72, top: 64, bottom: 52 },
  story: { x: 80, top: 150, bottom: 150 },
};

export type BrilhoCartao = 'duelo' | 'marca' | 'neutro' | [CorCandidato, CorCandidato];

export interface CartaoBaseProps {
  formato: FormatoCartao;
  /** Números simulados: selo, faixa e marca-d'água "SIMULAÇÃO · dados fictícios". */
  simulado?: boolean;
  /** Título grande sob o cabeçalho (ex.: "Presidente · Brasil"). */
  titulo?: ReactNode;
  /** Substitui o lado esquerdo do rodapé (padrão: endereço da página). */
  rodape?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Linha sob a marca ("Apuração · 2º turno"). */
  sobrancelha?: ReactNode;
  /** Rota exibida no rodapé (ex.: '/apuracao/sp'), após o domínio. */
  caminho?: string;
  /** Instante dos dados (epoch ms). Padrão: agora. `null` esconde. */
  instante?: number | null;
  /** Rótulo antes da data ("Dados de", "Gerado em"…). */
  rotuloInstante?: string;
  /** Linha da fonte no rodapé (padrão: "Fonte: TSE" ou o aviso de simulação). */
  fonte?: ReactNode;
  /** Selo à direita do cabeçalho quando NÃO é simulação (ex.: "Resultado oficial"). */
  selo?: ReactNode;
  /**
   * Brilho do fundo: 'duelo' (padrão: os dois slots NEUTROS turquesa/âmbar), a marca, neutro ou um par de cores.
   * Com candidatos, passe `brilhoDe(race)` para usar as cores que vêm dos dados.
   */
  brilho?: BrilhoCartao;
}

const BRILHO_SLOT: Record<CorCandidato, { esq: string; dir: string }> = {
  a: {
    esq: 'bg-[radial-gradient(ellipse_70%_60%_at_0%_0%,rgb(var(--cand-a)/0.22),transparent_70%)]',
    dir: 'bg-[radial-gradient(ellipse_70%_60%_at_100%_0%,rgb(var(--cand-a)/0.22),transparent_70%)]',
  },
  b: {
    esq: 'bg-[radial-gradient(ellipse_70%_60%_at_0%_0%,rgb(var(--cand-b)/0.22),transparent_70%)]',
    dir: 'bg-[radial-gradient(ellipse_70%_60%_at_100%_0%,rgb(var(--cand-b)/0.22),transparent_70%)]',
  },
  vermelho: {
    esq: 'bg-[radial-gradient(ellipse_70%_60%_at_0%_0%,rgb(var(--cand-vermelho)/0.2),transparent_70%)]',
    dir: 'bg-[radial-gradient(ellipse_70%_60%_at_100%_0%,rgb(var(--cand-vermelho)/0.2),transparent_70%)]',
  },
  azul: {
    esq: 'bg-[radial-gradient(ellipse_70%_60%_at_0%_0%,rgb(var(--cand-azul)/0.2),transparent_70%)]',
    dir: 'bg-[radial-gradient(ellipse_70%_60%_at_100%_0%,rgb(var(--cand-azul)/0.2),transparent_70%)]',
  },
  outros: {
    esq: 'bg-[radial-gradient(ellipse_70%_60%_at_0%_0%,rgb(var(--cand-outros)/0.16),transparent_70%)]',
    dir: 'bg-[radial-gradient(ellipse_70%_60%_at_100%_0%,rgb(var(--cand-outros)/0.16),transparent_70%)]',
  },
};

/**
 * Brilho com as cores dos dois candidatos REAIS de uma corrida (as que vêm dos dados: vermelho/azul para Presidente
 * com nomes reais; turquesa/âmbar para governador e simulação com nomes ocultos). Prefira isto a 'duelo'.
 */
export function brilhoDe(race: Pick<Race, 'candidatos'> | undefined): BrilhoCartao {
  const reais = race?.candidatos.filter((c) => !c.agregado) ?? [];
  return reais.length >= 2 ? [reais[0].cor, reais[1].cor] : 'duelo';
}

function Fundo({ brilho, simulado }: { brilho: BrilhoCartao; simulado?: boolean }) {
  const par: [CorCandidato, CorCandidato] | null = brilho === 'duelo' ? ['a', 'b'] : Array.isArray(brilho) ? brilho : null;
  const { k, retrato } = useCartao();
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {par ? (
        <>
          <div className={cn('absolute inset-0', BRILHO_SLOT[par[0]].esq)} />
          <div className={cn('absolute inset-0', BRILHO_SLOT[par[1]].dir)} />
        </>
      ) : brilho === 'marca' ? (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_100%_0%,rgb(var(--brand)/0.24),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_0%_100%,rgb(var(--brand-2)/0.12),transparent_70%)]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgb(var(--fg)/0.06),transparent_70%)]" />
      )}
      <div className="absolute inset-0 bg-noise" data-sem-png />
      {simulado ? (
        // Marca-d'água: sobrevive a um recorte que tire o selo e a faixa.
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="select-none whitespace-nowrap font-display font-bold uppercase text-brand opacity-[0.07]"
            style={{ fontSize: (retrato ? 200 : 170) * k, letterSpacing: '0.04em', transform: `rotate(${retrato ? -24 : -12}deg)` }}
          >
            Simulação
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Selo "SIMULAÇÃO · dados fictícios" do cabeçalho. */
export function SeloSimulacao({ className }: { className?: string }) {
  const { k } = useCartao();
  return (
    <div
      className={cn('shrink-0 rounded-[0.4em] border-brand bg-brand/15 text-center', className)}
      style={{ borderWidth: Math.round(3 * k), padding: `${10 * k}px ${18 * k}px` }}
    >
      <div className="font-bold uppercase leading-none tracking-[0.16em] text-brand-fg" style={{ fontSize: 24 * k }}>
        Simulação
      </div>
      <div className="mt-[0.35em] font-semibold uppercase leading-none tracking-[0.18em] text-fg-muted" style={{ fontSize: 13 * k }}>
        dados fictícios
      </div>
    </div>
  );
}

/** Selo neutro (ex.: "Resultado oficial · TSE") para o cabeçalho. */
export function SeloOficial({ children }: { children: ReactNode }) {
  const { k } = useCartao();
  return (
    <div
      className="shrink-0 rounded-full border border-line/[2.5] bg-surface/70 font-semibold uppercase tracking-[0.14em] text-fg-muted"
      style={{ fontSize: 15 * k, padding: `${9 * k}px ${18 * k}px` }}
    >
      {children}
    </div>
  );
}

export const CartaoBase = forwardRef<HTMLDivElement, CartaoBaseProps>(function CartaoBase(
  {
    formato,
    simulado,
    titulo,
    rodape,
    children,
    className,
    sobrancelha,
    caminho,
    instante,
    rotuloInstante,
    fonte,
    selo,
    brilho = 'duelo',
  },
  ref,
) {
  const m = medidasCartao(formato);
  const { w, h, k } = m;
  const pad = PAD[formato];
  const faixa = simulado ? Math.round(34 * k) : 0;
  const site = siteExibicao();
  const quando = instante === null ? null : (instante ?? Date.now());
  return (
    <Ctx.Provider value={m}>
      <div
        ref={ref}
        data-cartao={formato}
        style={{ width: w, height: h, padding: `${pad.top}px ${pad.x}px ${pad.bottom + faixa}px` }}
        className={cn('relative isolate flex flex-col overflow-hidden bg-bg font-sans text-fg antialiased', className)}
      >
        <Fundo brilho={brilho} simulado={simulado} />

        <header className="relative flex items-center justify-between" style={{ gap: 24 * k }}>
          <div className="flex min-w-0 items-center" style={{ gap: 16 * k }}>
            <LogoMark size={Math.round(54 * k)} />
            <div className="min-w-0">
              <div className="font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: 32 * k }}>
                Sintonia
              </div>
              {sobrancelha ? (
                // leading folgado: com `truncate` (overflow oculto) e leading-none, acentos de caixa alta ("CENÁRIO") eram cortados.
                <div className="truncate font-semibold uppercase leading-[1.35] tracking-[0.16em] text-fg-muted" style={{ fontSize: 15 * k, marginTop: 5 * k }}>
                  {sobrancelha}
                </div>
              ) : null}
            </div>
          </div>
          {simulado ? <SeloSimulacao /> : selo ?? null}
        </header>

        {titulo ? (
          <div className="relative font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (m.retrato ? 52 : 40) * k, marginTop: (m.retrato ? 40 : 22) * k }}>
            {titulo}
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        <footer className="relative flex items-end justify-between border-t-2 border-line" style={{ gap: 24 * k, paddingTop: 16 * k }}>
          <div className="min-w-0 font-semibold leading-tight tracking-[-0.01em]" style={{ fontSize: 20 * k }}>
            {rodape ?? (
              <span className="block truncate">
                {site ? (
                  <>
                    {site}
                    <span className="text-fg-muted">{caminho ?? ''}</span>
                  </>
                ) : (
                  <>Apuração ao vivo</>
                )}
              </span>
            )}
          </div>
          <div className="shrink-0 text-right leading-tight text-fg-muted" style={{ fontSize: 15 * k }}>
            {quando !== null ? (
              <div className="num font-medium text-fg">
                {rotuloInstante ? `${rotuloInstante} ` : ''}
                {fmtDataHora(quando)} · Brasília
              </div>
            ) : null}
            <div style={{ marginTop: 4 * k }}>{fonte ?? (simulado ? 'Simulação · não são resultados reais' : 'Fonte: TSE')}</div>
          </div>
        </footer>

        {simulado ? (
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center overflow-hidden bg-brand font-bold uppercase text-brand-ink"
            style={{ height: faixa, fontSize: 14 * k, letterSpacing: '0.2em' }}
          >
            <span className="absolute inset-0 opacity-25 [background-image:repeating-linear-gradient(-45deg,rgb(var(--brand-ink)/0.35)_0_10px,transparent_10px_22px)]" />
            <span className="relative">Simulação · dados fictícios · não são resultados reais</span>
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
});
