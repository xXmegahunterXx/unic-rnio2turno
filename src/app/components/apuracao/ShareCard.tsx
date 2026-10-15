/**
 * ShareCard: cartão do placar (nacional, UF ou município) nos 3 formatos do kit de compartilhamento
 * (`@/app/components/share`): 'x' 1200×675 (16:9), 'feed' 1080×1350 e 'story' 1080×1920. Moldura = `CartaoBase`
 * (logo, URL, data/hora de Brasília e o selo SIMULAÇÃO quando simulado); aqui o miolo, no espírito do topo da Home
 * (`DueloPresidencia`): os dois retratos oficiais GRANDES lado a lado, do mesmo tamanho e tratamento (quadro 4:5, moldura
 * e brilho na cor de identidade que vem dos dados), o "×", os números gigantes, a barra com a marca dos 50%, o % apurado
 * e o selo de resultado definido. Faixa "Oferecimento: <marca>" no PÉ só com `OFERECIMENTO_COM_CANDIDATOS`
 * (src/shared/oferecimento.ts — hoje desligado; mesma regra das imagens do servidor, og-placar.ts).
 * ShareButton: mesma API de antes (usado em várias páginas), agora sobre o `BotaoCompartilhar` do kit.
 * Fotos oficiais no cartão só com dados reais (nunca na imagem de uma SIMULAÇÃO, nem anonimizada: uma imagem com rosto
 * real e números fictícios não pode circular); Presidente com os originais do TSE (`presidente-hd`, via `useFotosHero`).
 */
import { forwardRef, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Candidate, Race, Summary } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { escolherAnuncio } from '@/shared/anuncios-escolha';
import { OFERECIMENTO_COM_CANDIDATOS } from '@/shared/oferecimento';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { partidoENumero } from '@/shared/anon';
import { cn } from '@/app/lib/cn';
import { corSlot, rgbSlot } from '@/app/lib/raceUi';
import { useStatus } from '@/app/data/hooks';
import { type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { BotaoCompartilhar, CartaoBase, DIMENSOES_CARTAO, brilhoDe, PreviaCartao, SeloOficial, useCartao, type FormatoCartao } from '@/app/components/share';
import { BarraDuelo, PctGigante, PilulaApurado, RotuloCartao } from '@/app/components/share/cartoes/partes';
import { hashtags, textoPlacar } from '@/app/components/share/textos';
import { useFotosHero } from '@/app/components/pages/home/fotosHero';
import { iniciais } from './CandidateAvatar';

/** Formatos do cartão do placar (= `FormatoCartao` do kit; 'x' é o 16:9 do X/WhatsApp). */
export type ShareFormato = FormatoCartao;
export const SHARE_DIMENSOES = DIMENSOES_CARTAO;

export interface ShareCardProps {
  race: Race;
  resumo: Summary;
  formato?: ShareFormato;
  /** Marca "SIMULAÇÃO" (obrigatório quando LiveStatus.simulacao). */
  simulado?: boolean;
  /** Abrangência exibida (padrão: "Brasil" para Presidente, a UF para Governador). */
  local?: string;
  /** Caminho exibido no rodapé (padrão: /apuracao). */
  caminho?: string;
  className?: string;
}

/** Texto neutro para acompanhar o compartilhamento (≤ 220 caracteres, "[SIMULAÇÃO]" quando simulado). */
export function textoCompartilhamento(race: Race, resumo: Summary, simulado?: boolean, local?: string): string {
  return textoPlacar(race, resumo, { simulado, local });
}

function localPadrao(race: Race): string {
  return race.abrangencia === 'BR' ? 'Brasil' : (UF_NOMES[race.abrangencia] ?? race.titulo.split('·').pop()?.trim() ?? '');
}

/** Faixa do anúncio por formato: altura, o espaço livre abaixo dela (story: área da interface dos apps) e o respiro. */
const FAIXA: Record<FormatoCartao, { alt: number; abaixo: number; fonte: number; pb: number }> = {
  x: { alt: 38, abaixo: 0, fonte: 17, pb: 20 },
  feed: { alt: 52, abaixo: 0, fonte: 22, pb: 30 },
  story: { alt: 60, abaixo: 120, fonte: 24, pb: 30 },
};

/**
 * Anunciante do rodapé "Oferecimento" (formato 'compartilhamento'; o master vence, como nas imagens do servidor). Só com
 * `OFERECIMENTO_COM_CANDIDATOS` (hoje desligado: anúncio nunca colado a placar, foto ou número de candidato).
 */
function useOferecimento(semente: string): string | null {
  const { data: status } = useStatus();
  const anuncios = OFERECIMENTO_COM_CANDIDATOS ? status?.anuncios : undefined;
  return useMemo(() => escolherAnuncio(anuncios, 'compartilhamento', `og|${semente}`)?.marca.trim().slice(0, 40) || null, [anuncios, semente]);
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { race, resumo, formato = 'feed', simulado, local, caminho = '/apuracao', className },
  ref,
) {
  const onde = local ?? localPadrao(race);
  const t1 = race.turno === 1;
  const { fotos } = useFotosHero(race, { desligado: simulado });
  const marca = useOferecimento(`${race.id}|${onde}`);
  const base = (
    <CartaoBase
      ref={marca ? undefined : ref}
      formato={formato}
      simulado={simulado}
      className={cn(marca && '![height:var(--cartao-alt)] ![padding-bottom:var(--cartao-pb)]', !marca && className)}
      sobrancelha={t1 ? 'Resultado oficial · 1º turno' : `Apuração · ${race.turno}º turno`}
      caminho={caminho}
      instante={t1 ? null : (resumo.ultimaAtualizacao ?? undefined)}
      rotuloInstante={t1 ? undefined : 'Dados de'}
      fonte={t1 ? 'Fonte: TSE · votação de 4 de outubro' : undefined}
      selo={t1 ? <SeloOficial>Resultado oficial</SeloOficial> : undefined}
      brilho={brilhoDe(race)}
    >
      <MioloPlacar race={race} resumo={resumo} onde={onde} fotos={fotos} />
    </CartaoBase>
  );
  if (!marca) return base;
  const { w, h } = DIMENSOES_CARTAO[formato];
  const f = FAIXA[formato];
  // com simulação, a moldura reserva embaixo a faixa "SIMULAÇÃO · dados fictícios" (34 px × k)
  const faixaSim = simulado ? Math.round(34 * { x: 1, feed: 1.3, story: 1.42 }[formato]) : 0;
  const estilo = { width: w, height: h, '--cartao-alt': `${h - f.alt - f.abaixo}px`, '--cartao-pb': `${f.pb + faixaSim}px` } as CSSProperties;
  return (
    <div ref={ref} data-cartao={formato} style={estilo} className={cn('relative flex flex-col overflow-hidden bg-bg font-sans text-fg antialiased', className)}>
      {base}
      {/* faixa própria, só texto, DEPOIS do rodapé com o endereço do Sintonia: nunca encostada em foto, nome ou número */}
      <div className="flex shrink-0 items-center justify-center border-t border-line bg-surface px-16 text-fg-subtle" style={{ height: f.alt, fontSize: f.fonte, gap: f.fonte * 0.4 }}>
        <span className="tracking-[0.02em]">Oferecimento:</span>
        <span className="max-w-[60%] truncate font-semibold text-fg">{marca}</span>
      </div>
      {f.abaixo ? <div aria-hidden className="bg-bg" style={{ height: f.abaixo }} /> : null}
    </div>
  );
});

interface MioloProps {
  race: Race;
  resumo: Summary;
  onde: string;
  fotos: (string | undefined)[];
}

function Cabecalho({ race, resumo, onde }: Pick<MioloProps, 'race' | 'resumo' | 'onde'>) {
  const { k, retrato, formato } = useCartao();
  const t1 = race.turno === 1;
  return (
    <div className={cn('flex justify-between', formato === 'story' ? 'flex-col items-start' : 'items-end')} style={{ gap: 14 * k, marginTop: (retrato ? 30 : 18) * k }}>
      <div className="min-w-0">
        <RotuloCartao>{onde}</RotuloCartao>
        <div className="font-display font-semibold leading-none tracking-[-0.035em]" style={{ fontSize: (retrato ? 50 : 40) * k, marginTop: 10 * k }}>
          {race.cargo}
          <span className="text-fg-muted"> · {race.turno}º turno</span>
        </div>
      </div>
      {t1 ? null : <PilulaApurado pct={pctTotalizadas(resumo)} />}
    </div>
  );
}

/** Diferença entre os dois (neutra: sem dizer quem; a cor e os números já dizem). */
function diferenca(race: Race, resumo: Summary): { pp: number; votos: number } | null {
  if (race.turno !== 2 || validos(resumo) === 0) return null;
  const m = margem(resumo);
  return m.lider === null ? { pp: 0, votos: 0 } : { pp: m.pp, votos: m.votos };
}

function PilulaDiferenca({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const { k } = useCartao();
  const d = diferenca(race, resumo);
  if (!d) return null;
  return (
    <div className="inline-flex shrink-0 items-baseline rounded-full border border-line/[2] bg-surface/80" style={{ gap: 10 * k, padding: `${8 * k}px ${18 * k}px` }}>
      <span className="leading-none text-fg-muted" style={{ fontSize: 15 * k }}>
        diferença
      </span>
      <span className="num font-display font-semibold leading-none tracking-[-0.02em] text-fg" style={{ fontSize: 26 * k }}>
        {fmtPP(d.pp, 2).replace('+', '')}
      </span>
      <span className="num leading-none text-fg-muted" style={{ fontSize: 15 * k }}>
        {fmtInt(d.votos)} votos
      </span>
    </div>
  );
}

function SeloEleito({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const { k } = useCartao();
  const eleito = race.turno === 2 && resumo.eleito !== null ? race.candidatos[resumo.eleito] : null;
  if (!eleito) return null;
  const s = corSlot(eleito.cor);
  return (
    <div
      className={cn('inline-flex items-center self-center rounded-full font-bold uppercase tracking-[0.08em]', s.bgSoft, s.text)}
      style={{ gap: 12 * k, padding: `${10 * k}px ${22 * k}px`, fontSize: 19 * k }}
    >
      <Icon name="check-circulo" size={26 * k} strokeWidth={2.25} />
      {eleito.nomeUrna} · {resumo.status === 'encerrada' ? 'eleito' : 'matematicamente eleito'}
    </div>
  );
}

function Demais({ race, resumo, centro }: Pick<MioloProps, 'race' | 'resumo'> & { centro?: boolean }) {
  const { k } = useCartao();
  const i = race.candidatos.findIndex((c) => c.agregado);
  if (i < 0) return null;
  return (
    <div className={cn('num text-fg-muted', centro && 'text-center')} style={{ fontSize: 18 * k }}>
      Demais candidatos: <span className="font-semibold text-fg">{fmtPct(pctValidos(resumo, i))}</span> · <span>{fmtInt(resumo.votos[i] ?? 0)} votos</span>
    </div>
  );
}

/**
 * Retrato 4:5 do cartão (sem animação: o PNG sai do DOM): moldura em degradê e brilho atrás na cor do candidato, como o
 * `CandidateRetrato` do topo da Home. Sem foto: monograma no MESMO quadro.
 */
function RetratoCartao({ c, foto, w, eleito, brilhoX }: { c: Candidate; foto?: string; w: number; eleito?: boolean; brilhoX: number }) {
  const h = Math.round(w * 1.25);
  const s = corSlot(c.cor);
  const borda = Math.max(4, Math.round(w * 0.016));
  const raio = Math.round(w * 0.1);
  const selo = Math.round(w * 0.2);
  return (
    <div className="relative shrink-0" style={{ width: w, height: h }}>
      <div
        aria-hidden
        className="absolute"
        // o brilho não pode passar da área do miolo (overflow-hidden da moldura cortaria a borda em linha reta)
        style={{ left: -brilhoX, right: -brilhoX, top: -h * 0.18, bottom: -h * 0.18, background: `radial-gradient(closest-side, ${rgbSlot(c.cor, 0.42)}, ${rgbSlot(c.cor, 0.14)} 58%, ${rgbSlot(c.cor, 0)})` }}
      />
      <div
        className="relative h-full w-full"
        style={{ borderRadius: raio, padding: borda, backgroundImage: `linear-gradient(165deg, ${rgbSlot(c.cor)} 0%, ${rgbSlot(c.cor, 0.5)} 48%, ${rgbSlot(c.cor, 0.92)} 100%)` }}
      >
        <div className="h-full w-full overflow-hidden bg-surface-2" style={{ borderRadius: raio - borda }}>
          {foto ? (
            <img src={foto} alt="" className="h-full w-full object-cover object-[50%_18%]" />
          ) : (
            <div className={cn('flex h-full w-full items-center justify-center font-display font-semibold leading-none tracking-[-0.04em]', s.bgSoft, s.text)} style={{ fontSize: w * 0.34 }}>
              {iniciais(c.nomeUrna)}
            </div>
          )}
        </div>
      </div>
      {eleito ? (
        <span
          className={cn('absolute flex items-center justify-center rounded-full', s.bg, s.ink)}
          style={{ width: selo, height: selo, right: -selo * 0.22, bottom: -selo * 0.22, boxShadow: `0 0 0 ${Math.max(3, Math.round(w * 0.016))}px rgb(var(--bg))` }}
        >
          <Icon name="check" size={selo * 0.6} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

/** Nome e partido · número de um finalista. */
function Cabeca({ c, alinhar, nome }: { c: Candidate; alinhar: 'esq' | 'dir' | 'centro'; nome: number }) {
  const { k } = useCartao();
  return (
    <div className={cn('min-w-0', alinhar === 'dir' && 'text-right', alinhar === 'centro' && 'text-center')}>
      <div className="text-balance font-display font-semibold leading-[1.05] tracking-[-0.025em]" style={{ fontSize: nome * k }}>
        {c.nomeUrna}
      </div>
      <div className={cn('num truncate font-semibold', corSlot(c.cor).text)} style={{ fontSize: 19 * k, marginTop: 6 * k }}>
        {partidoENumero(c)}
      </div>
    </div>
  );
}

/** % gigante e votos de um finalista. */
function Numeros({ race, resumo, i, alinhar, pct }: { race: Race; resumo: Summary; i: number; alinhar: 'esq' | 'dir' | 'centro'; pct: number }) {
  const { k } = useCartao();
  const c = race.candidatos[i];
  const tem = validos(resumo) > 0;
  return (
    <div className={cn('flex min-w-0 flex-col', alinhar === 'dir' ? 'items-end' : alinhar === 'centro' ? 'items-center' : 'items-start')}>
      <PctGigante valor={pctValidos(resumo, i)} size={pct * k} cor={c.cor} apagado={!tem} />
      <div className="num text-fg-muted" style={{ fontSize: 20 * k, marginTop: 10 * k }}>
        <span className="font-semibold text-fg">{fmtInt(resumo.votos[i] ?? 0)}</span> votos
      </div>
    </div>
  );
}

/** Tamanho do nome por comprimento (nomes de urna longos quebram em duas linhas; nunca são cortados). */
const corpoNome = (nome: string, base: number) => (nome.length <= 12 ? base : nome.length <= 17 ? base * 0.9 : base * 0.78);

function MioloPlacar({ race, resumo, onde, fotos }: MioloProps) {
  const { k, formato, w } = useCartao();
  const fin = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  if (fin.length < 2) return null;
  const [ia, ib] = [fin[0].i, fin[1].i];
  const eleito = race.turno === 2 && resumo.eleito !== null ? resumo.eleito : null;
  if (formato === 'x') {
    // 16:9: retratos no centro, cada candidato no seu lado (nome em cima, número embaixo)
    const rw = 196;
    const lateral = Math.floor((w - 112 - (2 * rw + 22)) / 2) - 20;
    const coluna = (j: number, lado: 'esq' | 'dir') => (
      <div className={cn('flex flex-col justify-between', lado === 'dir' && 'items-end')} style={{ width: lateral, height: Math.round(rw * 1.25), paddingTop: 4 }}>
        <Cabeca c={race.candidatos[j]} alinhar={lado} nome={corpoNome(race.candidatos[j].nomeUrna, 32)} />
        <Numeros race={race} resumo={resumo} i={j} alinhar={lado} pct={88} />
      </div>
    );
    return (
      <>
        <Cabecalho race={race} resumo={resumo} onde={onde} />
        <div className="flex flex-1 items-center justify-between" style={{ marginTop: 10 }}>
          {coluna(ia, 'esq')}
          <DueloComEleito race={race} ia={ia} ib={ib} fotos={fotos} w={rw} vao={22} eleito={eleito} folga={lateral} />
          {coluna(ib, 'dir')}
        </div>
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <BarraDuelo race={race} votos={resumo.votos} alto={20} rotulo={false} />
          {eleito !== null ? (
            <div className="flex justify-center" style={{ marginTop: 12 }}>
              <SeloEleito race={race} resumo={resumo} />
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <Demais race={race} resumo={resumo} />
            </div>
          )}
        </div>
      </>
    );
  }
  // feed / story: como o topo da Home — retratos lado a lado e, embaixo de cada um, nome, partido e número
  const story = formato === 'story';
  const rw = story ? 380 : 318;
  const vao = Math.round(30 * k);
  // espaço livre de cada lado do par de retratos dentro do miolo (largura menos os respiros da moldura)
  const folga = (w - (story ? 160 : 144) - (2 * rw + vao)) / 2;
  return (
    <>
      <Cabecalho race={race} resumo={resumo} onde={onde} />
      <div className="flex flex-1 flex-col items-center justify-center" style={{ gap: (story ? 30 : 18) * k }}>
        <DueloComEleito race={race} ia={ia} ib={ib} fotos={fotos} w={rw} vao={vao} eleito={eleito} folga={folga} />
        <div className="grid w-full grid-cols-2" style={{ columnGap: 40 * k }}>
          <Cabeca c={race.candidatos[ia]} alinhar="centro" nome={corpoNome(race.candidatos[ia].nomeUrna, 40)} />
          <Cabeca c={race.candidatos[ib]} alinhar="centro" nome={corpoNome(race.candidatos[ib].nomeUrna, 40)} />
        </div>
        <div className="grid w-full grid-cols-2" style={{ columnGap: 40 * k }}>
          <Numeros race={race} resumo={resumo} i={ia} alinhar="centro" pct={story ? 100 : 86} />
          <Numeros race={race} resumo={resumo} i={ib} alinhar="centro" pct={story ? 100 : 86} />
        </div>
        <div className="w-full">
          <BarraDuelo race={race} votos={resumo.votos} alto={(story ? 26 : 22) * k} rotulo={story} />
        </div>
        {eleito !== null ? <SeloEleito race={race} resumo={resumo} /> : story ? <PilulaDiferenca race={race} resumo={resumo} /> : null}
        {race.candidatos.some((c) => c.agregado) ? <Demais race={race} resumo={resumo} centro /> : null}
      </div>
    </>
  );
}

/** Os dois retratos lado a lado com o "×" sobre o vão (como no topo da Home) e o selo no retrato de quem está eleito. */
function DueloComEleito({ race, ia, ib, fotos, w, vao, eleito, folga }: { race: Race; ia: number; ib: number; fotos: (string | undefined)[]; w: number; vao: number; eleito: number | null; folga: number }) {
  const { k } = useCartao();
  const x = Math.round(54 * k);
  const brilhoX = Math.max(0, Math.min(w * 0.32, folga - 2));
  return (
    <div className="relative flex shrink-0" style={{ gap: vao }}>
      <RetratoCartao c={race.candidatos[ia]} foto={fotos[ia]} w={w} eleito={eleito === ia} brilhoX={brilhoX} />
      <RetratoCartao c={race.candidatos[ib]} foto={fotos[ib]} w={w} eleito={eleito === ib} brilhoX={brilhoX} />
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line/[2] bg-surface font-display font-semibold leading-none text-fg shadow-card"
        style={{ width: x, height: x, fontSize: x * 0.48 }}
      >
        ×
      </span>
    </div>
  );
}

/** Prévia escalada (o nó exportado mantém o tamanho real). Mantido por compatibilidade: use `PreviaCartao` do kit. */
export function ShareCardPreview({ children, formato, className }: { children: ReactNode; formato: ShareFormato; className?: string }) {
  return (
    <PreviaCartao formato={formato} className={className}>
      {children}
    </PreviaCartao>
  );
}

export interface ShareButtonProps {
  race: Race;
  resumo: Summary;
  simulado?: boolean;
  local?: string;
  /** Caminho compartilhado (padrão: a página atual). */
  caminho?: string;
  /** Texto compartilhado (padrão: textoCompartilhamento). */
  texto?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Só o ícone (IconButton). */
  iconOnly?: boolean;
  className?: string;
}

/** Rota atual (para compartilhar "esta página"), no BrowserRouter e no HashRouter do demo. */
export function caminhoAtual(): string {
  if (typeof window === 'undefined') return '/';
  return __DEMO__ ? window.location.hash.replace(/^#/, '') || '/' : window.location.pathname + window.location.search;
}

export function ShareButton({
  race,
  resumo,
  simulado,
  local,
  caminho,
  texto,
  label = 'Compartilhar',
  variant = 'secondary',
  size = 'md',
  iconOnly,
  className,
}: ShareButtonProps) {
  const rota = caminho ?? caminhoAtual();
  const onde = local ?? localPadrao(race);
  return (
    <BotaoCompartilhar
      titulo={race.turno === 1 ? 'Compartilhar resultado' : 'Compartilhar placar'}
      texto={texto ?? textoCompartilhamento(race, resumo, simulado, local ? onde : undefined)}
      caminho={rota}
      hashtags={race.turno === 1 ? hashtags('primeiroTurno') : race.cargo === 'Governador' ? hashtags('governador') : hashtags('apuracao')}
      nomeArquivo={`sintonia-${race.id}${local ? `-${slug(onde)}` : ''}`}
      simulado={simulado && race.turno === 2}
      cartao={(f) => <ShareCard race={race} resumo={resumo} formato={f} simulado={simulado && race.turno === 2} local={onde} caminho={rota.split('?')[0]} />}
      label={label}
      variant={variant}
      size={size}
      soIcone={iconOnly}
      className={className}
    />
  );
}

/** "São José (SP)" → "sao-jose-sp" (nome de arquivo). */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
