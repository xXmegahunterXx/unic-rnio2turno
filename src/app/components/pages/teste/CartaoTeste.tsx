/**
 * Cartões de compartilhamento do Teste Cego, sobre a moldura do kit (`CartaoBase`), nos 3 formatos (16:9 do X,
 * 4:5 do feed e 9:16 do story). Gerados como PNG NO APARELHO (nenhuma resposta sai do navegador).
 *
 *  - `CartaoDesafio`      (padrão) convite sem resultado: "Ideias primeiro, candidatos depois." + a escala.
 *  - `CartaoMeuResultado` (opt-in explícito) a sintonia com cada candidato, na ordem da urna, mesmo tamanho e
 *                         tipografia para os dois, cores só pelo slot; foto oficial só quando o teste já mostra fotos
 *                         (pacote do TSE com os dois e status NÃO anonimizado). Não há número simulado aqui.
 *  - `CartaoDuelo`        "Concordamos em N de M": só o placar entre as duas pessoas (nada de candidato).
 *  - `CartaoConviteDuelo` "Quanto você concorda comigo?" — imagem do convite (o link leva as respostas).
 *
 * Regras do kit: nada de animação nem blur; px reais escalados por `k` (useCartao); números com `.num` e `format.ts`.
 * O cartão NUNCA diz em quem a pessoa vota: fala de sintonia com o que está escrito nos programas.
 */
import type { ReactNode } from 'react';
import type { ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';
import { corSlot, rgbSlot } from '@/app/lib/raceUi';
import { tokenCss } from '@/app/lib/tokens';
import { Icon } from '@/app/ui/Icon';
import { CartaoBase, SeloOficial, useCartao, type BrilhoCartao } from '@/app/components/share/CartaoBase';
import { AvatarCartao } from '@/app/components/share/cartoes/partes';
import type { FormatoCartao } from '@/app/components/share/tipos';
import type { Autor, ComparacaoDuelo } from './sintonia';

// ── Moldura comum ─────────────────────────────────────────────────────────────

function RodapeTeste({ chamada = 'Faça o seu' }: { chamada?: string }) {
  const site = siteExibicao();
  return (
    <span className="block truncate">
      <span className="text-fg-muted">{chamada}: </span>
      {site ? (
        <>
          {site}
          <span className="text-fg-muted">/teste</span>
        </>
      ) : (
        <>Teste Cego · Sintonia</>
      )}
    </span>
  );
}

/** Rodapé do convite para o Duelo: o link certo é o do post (leva as respostas de quem convida), não o /teste. */
function RodapeConvite() {
  const site = siteExibicao();
  return (
    <span className="block truncate">
      Aceite pelo link do post
      <span className="text-fg-muted">{site ? ` · ${site}` : ' · Sintonia'}</span>
    </span>
  );
}

function Moldura({
  formato,
  children,
  brilho = 'marca',
  sobrancelha = 'Teste Cego · 2º turno',
  fonte = 'Não é pesquisa nem recomendação de voto',
  chamada,
  selo,
  rodape,
}: {
  formato: FormatoCartao;
  children: ReactNode;
  brilho?: BrilhoCartao;
  sobrancelha?: string;
  fonte?: ReactNode;
  chamada?: string;
  selo?: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha={sobrancelha}
      instante={null}
      fonte={fonte}
      brilho={brilho}
      rodape={rodape ?? <RodapeTeste chamada={chamada} />}
      selo={selo === undefined ? <SeloOficial>Sem nomes · sem partidos</SeloOficial> : selo}
    >
      {children}
    </CartaoBase>
  );
}

/** Pílula de chamada (cor da marca). */
function Chamada({ children, className }: { children: ReactNode; className?: string }) {
  const { k } = useCartao();
  return (
    <div
      className={cn('inline-flex items-center self-start rounded-full bg-brand-cta font-semibold leading-none text-brand-ink', className)}
      style={{ gap: 12 * k, fontSize: 22 * k, padding: `${15 * k}px ${26 * k}px` }}
    >
      {children}
      <Icon name="seta" size={24 * k} strokeWidth={2.4} />
    </div>
  );
}

/** Afirmação abstrata (sem texto real) com a escala na ordem do teste: discordo à esquerda, concordo à direita. */
function AfirmacaoAbstrata({ largura }: { largura: number }) {
  const u = largura / 430; // tudo proporcional à largura
  const tam = [44, 36, 28, 36, 44].map((t) => t * u);
  return (
    <div className="relative shrink-0" style={{ width: largura }}>
      <div
        className="absolute rounded-[28px] border-2 border-line bg-surface-2/80"
        style={{ inset: 0, transform: `rotate(4deg) translate(${10 * u}px, ${-6 * u}px)`, borderRadius: 30 * u }}
      />
      <div className="relative border-2 border-line bg-surface shadow-card" style={{ borderRadius: 30 * u, padding: 30 * u, transform: 'rotate(-1.5deg)' }}>
        <div className="flex items-center" style={{ gap: 10 * u }}>
          <span className="rounded-full bg-surface-3" style={{ width: 14 * u, height: 14 * u }} />
          <span className="rounded-full bg-surface-3" style={{ width: 110 * u, height: 14 * u }} />
        </div>
        <div style={{ marginTop: 22 * u }}>
          {[100, 86, 54].map((p) => (
            <div key={p} className="rounded-full bg-fg/[0.14]" style={{ width: `${p}%`, height: 22 * u, marginTop: 12 * u }} />
          ))}
        </div>
        <div className="relative" style={{ marginTop: 34 * u }}>
          <div className="absolute rounded-full bg-line/[2]" style={{ left: '10%', right: '10%', top: 22 * u - 1.5, height: 3 }} />
          <div className="relative grid grid-cols-5">
            {tam.map((t, i) => (
              <div key={i} className="flex items-center justify-center" style={{ height: 44 * u }}>
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full border-2 bg-surface',
                    i === 2 ? 'border-fg-subtle/50' : i === 1 || i === 3 ? 'border-brand/45' : 'border-brand/70',
                  )}
                  style={{ width: t, height: t, borderWidth: Math.max(2, 3 * u) }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between font-medium text-fg-muted" style={{ fontSize: 15 * u, marginTop: 10 * u }}>
            <span>Discordo</span>
            <span>Concordo</span>
          </div>
        </div>
      </div>
      <div
        className="absolute flex items-center justify-center rounded-full border-dashed border-fg-subtle/60 bg-surface-2 font-display font-semibold text-fg-muted"
        style={{ width: 92 * u, height: 92 * u, right: 4 * u, top: -30 * u, borderWidth: Math.max(2, 3 * u), fontSize: 46 * u }}
      >
        ?
      </div>
    </div>
  );
}

// ── Desafio (padrão: sem resultado) ───────────────────────────────────────────

export function CartaoDesafio({ formato, n }: { formato: FormatoCartao; n: number }) {
  return (
    <Moldura formato={formato}>
      <MioloDesafio n={n} />
    </Moldura>
  );
}

function MioloDesafio({ n }: { n: number }) {
  const { k, retrato, formato, w } = useCartao();
  const titulo = (
    <div className="font-display font-semibold leading-[0.98] tracking-[-0.04em]" style={{ fontSize: (formato === 'story' ? 96 : retrato ? 84 : 66) * (retrato ? 1 : k) }}>
      Ideias primeiro, <span className="text-brand-fg">candidatos depois.</span>
    </div>
  );
  const sub = (
    <div className="text-pretty leading-[1.3] text-fg-muted" style={{ fontSize: (retrato ? 32 : 23) * (retrato ? 1 : k), marginTop: (retrato ? 26 : 18) * k }}>
      <span className="num">{fmtInt(n)}</span> afirmações sobre o país, <span className="text-fg">sem saber de quem são.</span> No fim, a sua sintonia com cada
      programa de governo.
    </div>
  );
  if (!retrato) {
    return (
      <div className="flex flex-1 items-center" style={{ gap: 52 }}>
        <div className="min-w-0 flex-1">
          {titulo}
          {sub}
          <Chamada className="mt-7">Eu já fiz. E você?</Chamada>
        </div>
        <AfirmacaoAbstrata largura={400} />
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-center">
      {titulo}
      {sub}
      <div className="flex justify-center" style={{ marginTop: (formato === 'story' ? 96 : 56) * k, marginBottom: (formato === 'story' ? 96 : 48) * k }}>
        <AfirmacaoAbstrata largura={Math.min(w - 220, formato === 'story' ? 700 : 600)} />
      </div>
      <Chamada>Eu já fiz. E você?</Chamada>
    </div>
  );
}

// ── Meu resultado (opt-in) ────────────────────────────────────────────────────

export interface CartaoMeuResultadoProps {
  formato: FormatoCartao;
  resultado: ResultadoSintonia;
  candidatos: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  /** Afirmações respondidas no teste (24 ou 12 no modo rápido). */
  n: number;
  rapido?: boolean;
}

export function CartaoMeuResultado({ formato, resultado, candidatos, fotos, n, rapido }: CartaoMeuResultadoProps) {
  return (
    <Moldura formato={formato} brilho="duelo" fonte="Fonte: programas registrados no TSE" selo={<SeloOficial>{rapido ? 'Modo rápido' : 'Meu resultado'}</SeloOficial>}>
      <MioloResultado resultado={resultado} candidatos={candidatos} fotos={fotos} n={n} />
    </Moldura>
  );
}

/** Anel de sintonia (gradiente cônico; sem SVG, que o html-to-image desenha mal) com o avatar no meio. */
function Anel({ c, foto, pct, size }: { c: Candidate; foto?: string; pct: number | null; size: number }) {
  const v = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const esp = Math.round(size * 0.075);
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${rgbSlot(c.cor)} 0 ${v}%, ${tokenCss('surface-3')} ${v}% 100%)` }}
    >
      <div className="absolute flex items-center justify-center rounded-full bg-bg" style={{ inset: esp }}>
        <AvatarCartao cor={c.cor} nome={c.nomeUrna} size={Math.round(size * 0.68)} foto={foto} />
      </div>
    </div>
  );
}

function MioloResultado({ resultado, candidatos, fotos, n }: Omit<CartaoMeuResultadoProps, 'formato' | 'rapido'>) {
  const { k, retrato, formato } = useCartao();
  const story = formato === 'story';
  const titulo = (
    <div className={cn('font-display font-semibold leading-[1.02] tracking-[-0.03em]', retrato && 'text-center')} style={{ fontSize: (story ? 64 : retrato ? 54 : 42) * (retrato ? 1 : k) }}>
      Minha sintonia com os programas de governo
    </div>
  );
  const nota = (
    <div className={cn('text-pretty leading-snug text-fg-muted', retrato && 'text-center')} style={{ fontSize: retrato ? 25 : 18 }}>
      Fiz o Teste Cego: <span className="num">{fmtInt(n)}</span> afirmações, sem saber de quem eram as ideias. Os dois números são independentes (não somam 100%).
    </div>
  );
  return (
    <div className="flex flex-1 flex-col justify-center" style={{ gap: (story ? 70 : retrato ? 44 : 26) * (retrato ? 1 : k) }}>
      {titulo}
      <div className="grid grid-cols-2" style={{ gap: retrato ? 28 : 24 }}>
        {candidatos.map((c) => (
          <Bloco key={c.numero} c={c} foto={fotos[c.numero as Autor]} pct={resultado[c.numero as Autor]} base={resultado.consideradas[c.numero as Autor]} />
        ))}
      </div>
      {nota}
    </div>
  );
}

function Bloco({ c, foto, pct, base }: { c: Candidate; foto?: string; pct: number | null; base: number }) {
  const { k, retrato, formato } = useCartao();
  const s = corSlot(c.cor);
  const story = formato === 'story';
  const numero = (
    <div className={cn('num font-display font-semibold leading-[0.85] tracking-[-0.05em]', pct === null ? 'text-fg-subtle' : s.textDisplay)} style={{ fontSize: story ? 150 : retrato ? 128 : 108 }}>
      {pct === null ? '—' : fmtPct(pct, 0).replace('%', '')}
      {pct !== null ? (
        <span className="tracking-normal" style={{ fontSize: (story ? 150 : retrato ? 128 : 108) * 0.42, marginLeft: 4 }}>
          %
        </span>
      ) : null}
    </div>
  );
  const textos = (
    <div className={cn('min-w-0', retrato && 'text-center')}>
      <div className="text-fg-muted" style={{ fontSize: retrato ? 24 : 18, marginTop: retrato ? 18 : 8 }}>
        de sintonia com
      </div>
      <div className="truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: story ? 46 : retrato ? 40 : 32, marginTop: 4 }}>
        {c.nomeUrna}
      </div>
      {c.partido ? (
        <div className="num text-fg-muted" style={{ fontSize: retrato ? 24 : 19, marginTop: 4 }}>
          {c.partido} · {c.numero}
        </div>
      ) : null}
      <div className="num text-fg-subtle" style={{ fontSize: retrato ? 20 : 15, marginTop: retrato ? 12 : 6 }}>
        com base em {fmtInt(base)} {base === 1 ? 'afirmação' : 'afirmações'}
      </div>
    </div>
  );
  if (retrato) {
    return (
      <div className="flex flex-col items-center rounded-[36px] border-2 border-line bg-surface/70" style={{ padding: story ? '48px 24px 44px' : '36px 20px 32px' }}>
        <Anel c={c} foto={foto} pct={pct} size={story ? 270 : 220} />
        <div style={{ marginTop: story ? 34 : 26 }}>{numero}</div>
        {textos}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center rounded-[28px] border-2 border-line bg-surface/70" style={{ gap: 24, padding: '26px 26px' }}>
      <Anel c={c} foto={foto} pct={pct} size={176} />
      <div className="min-w-0">
        {numero}
        {textos}
      </div>
    </div>
  );
}

// ── Duelo: placar entre as duas pessoas ───────────────────────────────────────

export function CartaoDuelo({ formato, comp }: { formato: FormatoCartao; comp: ComparacaoDuelo }) {
  return (
    <Moldura formato={formato} sobrancelha="Teste Cego · Duelo" selo={<SeloOficial>Só entre nós dois</SeloOficial>} chamada="Faça o seu e desafie alguém">
      <MioloDuelo comp={comp} />
    </Moldura>
  );
}

/** Bolinhas das afirmações (mesmo lado / lados diferentes / alguém pulou). */
function Bolinhas({ comp, colunas, tam }: { comp: ComparacaoDuelo; colunas: number; tam: number }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${colunas}, ${tam}px)`, gap: tam * 0.24 }}>
      {comp.itens.map((t) => (
        <span
          key={t.afirmacao.id}
          className={cn(
            'inline-flex items-center justify-center rounded-full border-2',
            !t.comparavel ? 'border-dashed border-fg-subtle/50 text-fg-subtle' : t.mesmoLado ? 'border-brand/70 bg-brand/25 text-brand-fg' : 'border-line bg-surface-2 text-fg-subtle',
          )}
          style={{ width: tam, height: tam }}
        >
          <Icon name={!t.comparavel ? 'menos' : t.mesmoLado ? 'check' : 'troca'} size={tam * 0.5} strokeWidth={2.6} />
        </span>
      ))}
    </div>
  );
}

function MioloDuelo({ comp }: { comp: ComparacaoDuelo }) {
  const { k, retrato, formato } = useCartao();
  const story = formato === 'story';
  const placar = (
    <div className={cn('font-display font-semibold', retrato && 'text-center')}>
      <div className="leading-tight tracking-[-0.025em]" style={{ fontSize: (story ? 56 : retrato ? 50 : 34) * (retrato ? 1 : k) }}>
        Concordamos em
      </div>
      <div className={cn('flex items-baseline tracking-[-0.05em]', retrato && 'justify-center')} style={{ gap: 14, marginTop: 6 }}>
        <span className="num leading-[0.86]" style={{ fontSize: story ? 260 : retrato ? 220 : 168 }}>
          {fmtInt(comp.iguais)}
        </span>
        <span className="num tracking-[-0.03em] text-fg-muted" style={{ fontSize: story ? 84 : retrato ? 72 : 56 }}>
          /{fmtInt(comp.emComum)}
        </span>
      </div>
      <div className="leading-tight tracking-[-0.025em]" style={{ fontSize: (story ? 56 : retrato ? 50 : 34) * (retrato ? 1 : k), marginTop: 6 }}>
        {comp.emComum === 1 ? 'afirmação' : 'afirmações'}
      </div>
    </div>
  );
  const afinidade = (
    <div style={{ width: retrato ? '100%' : 420 }}>
      <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
        <span className="font-semibold text-fg-muted" style={{ fontSize: retrato ? 26 : 18 }}>
          Afinidade entre nós
        </span>
        <span className="num font-display font-semibold tracking-[-0.03em]" style={{ fontSize: retrato ? 54 : 38 }}>
          {comp.afinidade === null ? '—' : fmtPct(comp.afinidade, 0)}
        </span>
      </div>
      <div className="overflow-hidden rounded-full bg-surface-3" style={{ height: retrato ? 16 : 12, marginTop: 10 }}>
        <div className="h-full rounded-full bg-brand-grad" style={{ width: `${comp.afinidade ?? 0}%` }} />
      </div>
    </div>
  );
  const legenda = (
    <div className={cn('flex flex-wrap text-fg-muted', retrato && 'justify-center')} style={{ gap: `${8 * k}px ${22 * k}px`, fontSize: (retrato ? 21 : 15) * (retrato ? 1 : k) }}>
      <span className="inline-flex items-center" style={{ gap: 8 }}>
        <Icon name="check" size={retrato ? 22 : 16} strokeWidth={2.6} className="text-brand-fg" /> mesmo lado
      </span>
      <span className="inline-flex items-center" style={{ gap: 8 }}>
        <Icon name="troca" size={retrato ? 22 : 16} strokeWidth={2.6} /> lados diferentes
      </span>
    </div>
  );
  const n = comp.itens.length;
  if (!retrato) {
    const col = n > 12 ? Math.ceil(n / 4) : Math.ceil(n / 2);
    return (
      <div className="flex flex-1 items-center justify-between" style={{ gap: 40 }}>
        {placar}
        <div className="flex flex-col items-start" style={{ gap: 22 }}>
          <Bolinhas comp={comp} colunas={col} tam={n > 12 ? 56 : 64} />
          {legenda}
          {afinidade}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center" style={{ gap: story ? 64 : 40 }}>
      {placar}
      <Bolinhas comp={comp} colunas={6} tam={story ? 112 : 96} />
      {legenda}
      {afinidade}
    </div>
  );
}

// ── Convite para o Duelo ──────────────────────────────────────────────────────

export function CartaoConviteDuelo({ formato, n }: { formato: FormatoCartao; n: number }) {
  return (
    <Moldura formato={formato} sobrancelha="Teste Cego · Duelo" rodape={<RodapeConvite />}>
      <MioloConvite n={n} />
    </Moldura>
  );
}

/** Dois círculos (eu × você) e a interseção desconhecida: nada das respostas aparece na imagem. */
function Venn({ largura }: { largura: number }) {
  const r = largura * 0.33;
  const rot = largura * 0.055;
  return (
    <div className="relative shrink-0" style={{ width: largura, height: r * 2 }}>
      <div className="absolute rounded-full border-brand/70 bg-brand/[0.12]" style={{ width: r * 2, height: r * 2, left: 0, top: 0, borderWidth: Math.max(3, largura * 0.008) }} />
      <div className="absolute rounded-full border-fg-muted/60 bg-fg/[0.05]" style={{ width: r * 2, height: r * 2, right: 0, top: 0, borderWidth: Math.max(3, largura * 0.008) }} />
      <div className="absolute font-display font-semibold text-fg" style={{ left: r * 0.42, top: r - rot * 0.6, fontSize: rot }}>
        eu
      </div>
      <div className="absolute font-display font-semibold text-fg" style={{ right: r * 0.36, top: r - rot * 0.6, fontSize: rot }}>
        você
      </div>
      <div
        className="absolute flex items-center justify-center rounded-full border-dashed border-fg-subtle/70 bg-surface font-display font-semibold text-fg-muted"
        style={{ width: r * 0.62, height: r * 0.62, left: largura / 2 - r * 0.31, top: r - r * 0.31, fontSize: r * 0.36, borderWidth: Math.max(2, largura * 0.006) }}
      >
        ?
      </div>
    </div>
  );
}

function MioloConvite({ n }: { n: number }) {
  const { k, retrato, formato, w } = useCartao();
  const story = formato === 'story';
  const titulo = (
    <div className="font-display font-semibold leading-[0.98] tracking-[-0.04em]" style={{ fontSize: (story ? 100 : retrato ? 86 : 64) * (retrato ? 1 : k) }}>
      Quanto você <span className="text-brand-fg">concorda comigo?</span>
    </div>
  );
  const sub = (
    <div className="text-pretty leading-[1.3] text-fg-muted" style={{ fontSize: (retrato ? 32 : 23) * (retrato ? 1 : k), marginTop: (retrato ? 26 : 18) * k }}>
      Responda às mesmas <span className="num">{fmtInt(n)}</span> afirmações, sem saber de quem são as ideias. No fim, a gente vê em quantas ficou do mesmo lado.
    </div>
  );
  if (!retrato) {
    return (
      <div className="flex flex-1 items-center" style={{ gap: 48 }}>
        <div className="min-w-0 flex-1">
          {titulo}
          {sub}
          <Chamada className="mt-7">Aceita o desafio?</Chamada>
        </div>
        <Venn largura={380} />
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-center">
      {titulo}
      {sub}
      <div className="flex justify-center" style={{ marginTop: (story ? 110 : 60) * k, marginBottom: (story ? 110 : 56) * k }}>
        <Venn largura={Math.min(w - 200, story ? 760 : 640)} />
      </div>
      <Chamada>Aceita o desafio?</Chamada>
    </div>
  );
}
