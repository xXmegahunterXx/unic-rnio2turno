/**
 * Cartão para compartilhar o cenário (kit `@/app/components/share`, formatos x/feed/story).
 *
 * Marca d'água forte "CENÁRIO HIPOTÉTICO · não é pesquisa nem previsão" em três camadas (selo no topo, faixa sólida
 * sob os números e texto diagonal atrás de tudo, para sobreviver a recortes). As premissas principais vão impressas.
 * Sem fotos (os números são hipotéticos): monograma na cor de identificação de cada finalista (./cores.ts), igual para os dois.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Candidate, CorCandidato } from '@/shared/types';
import type { GeoBrasil } from '@/shared/dataset';
import type { Cenario, Premissa, PresidenteT1Dataset, ResultadoCenario } from '@/shared/cenarios';
import { MARCA_CENARIO, finalistasDe, margemArea, pctFinalista, premissasCenario } from '@/shared/cenarios';
import { fmtCompact, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';
import { corSlot } from '@/app/lib/raceUi';
import { CartaoBase, useCartao, type FormatoCartao } from '@/app/components/share';
import { AvatarCartao, BarraDuelo, RotuloCartao } from '@/app/components/share';
import { MapaCenario } from './MapaCenario';
import { coresCenario, type CoresCenario } from './cores';

export interface CartaoCenarioProps {
  formato: FormatoCartao;
  ds: PresidenteT1Dataset;
  cenario: Cenario;
  resultado: ResultadoCenario;
  geo?: GeoBrasil;
  caminho: string;
}

export function CartaoCenario({ formato, ds, cenario, resultado, geo, caminho }: CartaoCenarioProps) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="E se…? · calculadora do 2º turno"
      caminho={caminho.split('?')[0]}
      rotuloInstante="Montado em"
      fonte="Base: resultado oficial do 1º turno (TSE)"
      selo={<SeloHipotetico />}
      titulo={formato === 'x' ? undefined : 'Meu cenário para o 2º turno'}
      brilho={[...coresCenario(ds)]}
      // sem domínio apresentável (prévia, localhost) o rodapé padrão diria "Apuração ao vivo", que não é o caso aqui
      rodape={siteExibicao() ? undefined : 'Monte o seu cenário no Sintonia'}
    >
      <Miolo ds={ds} cenario={cenario} resultado={resultado} geo={geo} />
    </CartaoBase>
  );
}

/** Selo do cabeçalho: mesmo peso visual do selo de simulação, com outro texto. */
function SeloHipotetico() {
  const { k } = useCartao();
  return (
    <div className="shrink-0 rounded-[0.4em] border-brand bg-brand/15 text-center" style={{ borderWidth: Math.round(3 * k), padding: `${10 * k}px ${18 * k}px` }}>
      <div className="font-bold uppercase leading-none tracking-[0.16em] text-brand-fg" style={{ fontSize: 22 * k }}>
        Cenário
      </div>
      <div className="mt-[0.35em] font-semibold uppercase leading-none tracking-[0.18em] text-fg-muted" style={{ fontSize: 13 * k }}>
        hipotético
      </div>
    </div>
  );
}

/** Faixa sólida "CENÁRIO HIPOTÉTICO · NÃO É PESQUISA NEM PREVISÃO". */
function Faixa() {
  const { k } = useCartao();
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[0.6em] bg-brand font-bold uppercase text-brand-ink"
      style={{ height: 40 * k, fontSize: 15 * k, letterSpacing: '0.16em', marginTop: 14 * k }}
    >
      <span className="absolute inset-0 opacity-25 [background-image:repeating-linear-gradient(-45deg,rgb(var(--brand-ink)/0.35)_0_10px,transparent_10px_22px)]" />
      <span className="relative">{MARCA_CENARIO}</span>
    </div>
  );
}

function MarcaDagua() {
  const { k, retrato } = useCartao();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <span
        className="select-none whitespace-nowrap text-center font-display font-bold uppercase leading-[0.95] text-brand opacity-[0.075]"
        style={{ fontSize: (retrato ? 128 : 104) * k, letterSpacing: '0.03em', transform: `rotate(${retrato ? -24 : -11}deg)` }}
      >
        Cenário
        <br />
        hipotético
      </span>
    </div>
  );
}

const comoCandidato = (c: { numero: number; nomeUrna: string; nome: string; partido: string }, cor: CorCandidato): Candidate => ({
  numero: c.numero,
  nomeUrna: c.nomeUrna,
  nome: c.nome,
  partido: c.partido,
  cor,
});

function Lado({ cor, nome, partido, numero, pct, votos, alinhar }: { cor: CorCandidato; nome: string; partido: string; numero: number; pct: number; votos: number; alinhar: 'esq' | 'dir' }) {
  const { k, formato } = useCartao();
  const s = corSlot(cor);
  const kk = k;
  // story: os dois números lado a lado precisam caber em 920 px
  const tamPct = (formato === 'x' ? 82 : formato === 'feed' ? 104 : 92) * kk;
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', alinhar === 'dir' ? 'items-end text-right' : 'items-start')}>
      <div className={cn('flex min-w-0 max-w-full items-center', alinhar === 'dir' && 'flex-row-reverse')} style={{ gap: 12 * kk }}>
        <AvatarCartao cor={cor} nome={nome} size={Math.round(52 * kk)} />
        <div className="min-w-0">
          <div className="truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: 26 * kk }}>
            {nome}
          </div>
          <div className="num truncate text-fg-muted" style={{ fontSize: 15 * kk, marginTop: 2 * kk }}>
            {partido} · {numero}
          </div>
        </div>
      </div>
      <div className={cn('num font-display font-semibold leading-[0.9] tracking-[-0.045em]', s.textDisplay)} style={{ fontSize: tamPct, marginTop: 12 * kk }}>
        {fmtPct(pct).replace('%', '')}
        <span className="tracking-normal" style={{ fontSize: tamPct * 0.42, marginLeft: tamPct * 0.03 }}>
          %
        </span>
      </div>
      <div className="num text-fg-muted" style={{ fontSize: 15 * kk, marginTop: 6 * kk }}>
        {fmtInt(votos)} votos
      </div>
    </div>
  );
}

/** Quais premissas cabem em cada formato (as mais informativas primeiro). */
function premissasDoCartao(ps: Premissa[], max: number): Premissa[] {
  const peso = (p: Premissa) => {
    if (p.id === 'eliminados') return 0;
    if (p.id.startsWith('cand-')) return 1;
    if (p.id === 'comparecimento' && !p.texto.startsWith('Igual')) return 2;
    if (p.id === 'brancos' && !p.texto.startsWith('Continuam')) return 3;
    if (p.id === 'estados') return 4;
    if (p.id === 'finalistas') return 5;
    return 6;
  };
  return [...ps].sort((x, y) => peso(x) - peso(y)).slice(0, max).sort((x, y) => ps.indexOf(x) - ps.indexOf(y));
}

/**
 * Quantas premissas cabem sem cortar: começa com todas as escolhidas para o formato e tira a menos informativa até o
 * contêiner (`ref`, com overflow oculto) parar de transbordar. Só se nem uma couber inteira ela vai em linha única com
 * reticências. Em layout effect (antes da pintura): a prévia e o PNG já saem ajustados; refaz quando as fontes chegam
 * (a largura do texto muda) ou quando o cenário muda (`chave`).
 */
function usePremissasQueCabem(max: number, chave: string): { ref: RefObject<HTMLDivElement | null>; n: number; linhaUnica: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [fontes, setFontes] = useState(0);
  const id = `${chave}:${max}:${fontes}`;
  const [st, setSt] = useState({ n: max, linhaUnica: false, id });
  if (st.id !== id) setSt({ n: max, linhaUnica: false, id });
  useEffect(() => {
    let vivo = true;
    document.fonts?.ready.then(() => vivo && setFontes((x) => x + 1));
    return () => {
      vivo = false;
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.scrollHeight <= el.clientHeight + 1) return;
    setSt((x) => (x.n > 1 ? { ...x, n: x.n - 1 } : x.linhaUnica ? x : { ...x, linhaUnica: true }));
  });
  return { ref, n: Math.min(st.n, max), linhaUnica: st.linhaUnica };
}

function ListaPremissas({ itens, linhaUnica }: { itens: Premissa[]; linhaUnica?: boolean }) {
  const { k, formato } = useCartao();
  const fs = (formato === 'x' ? 14 : 15.5) * k;
  return (
    <div className="min-w-0">
      <RotuloCartao style={{ fontSize: (formato === 'x' ? 13 : 14) * k }}>Premissas de quem montou</RotuloCartao>
      <ul className="flex flex-col" style={{ gap: (formato === 'x' ? 3 : 6) * k, marginTop: (formato === 'x' ? 7 : 9) * k }}>
        {itens.map((p) => (
          <li key={p.id} className={cn('leading-snug', linhaUnica && 'truncate')} style={{ fontSize: fs }}>
            <span className="font-semibold text-fg">{p.rotulo}:</span> <span className="text-fg-muted">{p.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinhaEstados({ r, cores }: { r: ResultadoCenario; cores: CoresCenario }) {
  const { k, formato } = useCartao();
  const m = margemArea(r.brasil);
  const fs = (formato === 'x' ? 16 : 17) * k;
  const item = (rotulo: ReactNode, valor: ReactNode) => (
    <div className="min-w-0">
      <div className="truncate uppercase tracking-[0.12em] text-fg-subtle" style={{ fontSize: 12 * k }}>
        {rotulo}
      </div>
      <div className="num truncate font-semibold text-fg" style={{ fontSize: fs, marginTop: 3 * k }}>
        {valor}
      </div>
    </div>
  );
  return (
    <div className="flex items-start justify-between" style={{ gap: 18 * k, marginTop: 14 * k }}>
      {item(
        'Estados à frente',
        <>
          <span className={corSlot(cores[0]).text}>{fmtInt(r.estados[0])}</span>
          <span className="text-fg-subtle"> × </span>
          <span className={corSlot(cores[1]).text}>{fmtInt(r.estados[1])}</span>
          {r.empates ? <span className="text-fg-muted"> · {fmtInt(r.empates)} empate</span> : null}
        </>,
      )}
      {item('Diferença', m.lider === null ? 'Empate' : `${fmtCompact(m.votos)} de votos`)}
      {item('Mudam de lado', r.mudaram.length ? r.mudaram.slice(0, 6).join(', ') + (r.mudaram.length > 6 ? '…' : '') : 'nenhum estado')}
    </div>
  );
}

function Miolo({ ds, cenario, resultado: r, geo }: { ds: PresidenteT1Dataset; cenario: Cenario; resultado: ResultadoCenario; geo?: GeoBrasil }) {
  const { k, formato } = useCartao();
  const { a, b } = finalistasDe(ds);
  const cores = coresCenario(ds);
  const race = { candidatos: [comoCandidato(a, cores[0]), comoCandidato(b, cores[1])] };
  const ps = premissasCenario(ds, cenario, r, { detalheCandidatos: 2, nomesCurtos: true });
  // 16:9: até 2 premissas; feed e story: até 4 — sempre inteiras (o ajuste tira as menos informativas se faltar espaço).
  const maxPremissas = formato === 'x' ? 2 : 4;
  const ajuste = usePremissasQueCabem(maxPremissas, `${formato}:${ps.map((p) => p.texto).join('|')}`);
  const premissas = <ListaPremissas itens={premissasDoCartao(ps, ajuste.n)} linhaUnica={ajuste.linhaUnica} />;
  const nomes = (
    <div className="flex items-start justify-between" style={{ gap: 24 * k }}>
      <Lado cor={cores[0]} nome={a.nomeUrna} partido={a.partido} numero={a.numero} pct={pctFinalista(r.brasil, 0)} votos={r.brasil.votos[0]} alinhar="esq" />
      <Lado cor={cores[1]} nome={b.nomeUrna} partido={b.partido} numero={b.numero} pct={pctFinalista(r.brasil, 1)} votos={r.brasil.votos[1]} alinhar="dir" />
    </div>
  );
  const barra = (
    <div style={{ marginTop: 16 * k }}>
      <BarraDuelo race={race} votos={r.brasil.votos} alto={Math.round((formato === 'x' ? 18 : 22) * k)} rotulo={false} />
    </div>
  );
  const mapa = (largura: number) =>
    geo ? (
      <MapaCenario geo={geo} resultado={r} cores={cores} largura={largura} estatico rotulos fontePx={formato === 'story' ? 15 : formato === 'feed' ? 13 : 10.5} ariaLabel="Mapa do cenário por estado" />
    ) : null;

  if (formato === 'x') {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col" style={{ paddingTop: 18 * k }}>
        <MarcaDagua />
        <div className="relative flex min-h-0 flex-1" style={{ gap: 32 * k }}>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: 30 * k }}>
              Meu cenário para o 2º turno
            </div>
            <div style={{ marginTop: 18 * k }}>{nomes}</div>
            {barra}
            <LinhaEstados r={r} cores={cores} />
            <div ref={ajuste.ref} className="min-h-0 flex-1 overflow-hidden" style={{ marginTop: 14 * k }}>
              {premissas}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center" style={{ width: 380 }}>
            {mapa(380)}
          </div>
        </div>
        <Faixa />
      </div>
    );
  }

  const feed = formato === 'feed';
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ paddingTop: (feed ? 24 : 4) * k }}>
      <MarcaDagua />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {nomes}
        {barra}
        <LinhaEstados r={r} cores={cores} />
        {feed ? (
          <div className="flex min-h-0 flex-1 items-center" style={{ gap: 28 * k, marginTop: 18 * k }}>
            <div className="shrink-0">{mapa(500)}</div>
            {/* coluna com altura fixa (a da linha) e overflow oculto: o ajuste mede se as premissas transbordam */}
            <div ref={ajuste.ref} className="flex min-w-0 flex-1 flex-col justify-center self-stretch overflow-hidden">
              {premissas}
            </div>
          </div>
        ) : (
          <>
            {/* o mapa encolhe com min-h-0; se as premissas o espremerem abaixo da altura dele, o ajuste tira premissas */}
            <div ref={ajuste.ref} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden" style={{ marginTop: 14 * k }}>
              {mapa(560)}
            </div>
            <div className="shrink-0" style={{ marginTop: 14 * k }}>
              {premissas}
            </div>
          </>
        )}
      </div>
      <Faixa />
    </div>
  );
}
