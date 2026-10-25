/**
 * /streamers — "Use o Sintonia na sua live": os layouts do modo streamer (/live) com prévia, opções (inclusive o
 * estado fixo, I25) e "Copiar URL", o passo a passo do OBS/Streamlabs (fonte de navegador), o `!apuracao` dos bots de
 * chat (I22: Nightbot, StreamElements, Fossabot — comando e timer prontos, com a prévia da resposta), o endereço do
 * Modo TV com estado fixo, as regras de uso e o contato de parceria (`status.anuncie`, o mesmo contato comercial do
 * painel). "O Sintonia está em N lives agora" (I23) só a partir de 5 lives, sem nunca dizer quais.
 *
 * Prévias: a própria /live num iframe (mesma origem, `?previa=1` → o anúncio aparece sem contar impressão), desenhada
 * em 1280×720 e reduzida para caber — é exatamente o que vai para a transmissão, com o tema e o fundo pedidos (o tema
 * do site não interfere). `loading="lazy"`: só carrega perto da tela.
 *
 * Nada de número de audiência aqui (nunca inventamos): só o que o produto entrega de fato — a contagem de lives é
 * medida (src/server/lives.ts) e só aparece a partir de `LIVES.pisoPublico`.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { UF, UFBr } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt } from '@/shared/format';
import { HORA_FIM_VOTACAO } from '@/shared/diaVotacao';
import { LIVES, type LivesPublico } from '@/shared/lives';
import { comandoBot, mensagemTimer, urlTextoPlacar, type BotChat } from '@/shared/texto-placar';
import { cn } from '@/app/lib/cn';
import { copiarTexto, urlAbsoluta } from '@/app/lib/share';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { useNaTela } from '@/app/lib/useNaTela';
import { useStatus } from '@/app/data/hooks';
import { useContatos } from '@/app/data/contatos';
import { emailProvisorio } from '@/shared/contatos';
import { Icon, type IconName } from '@/app/ui/Icon';
import { ButtonLink, buttonClasses } from '@/app/ui/Button';
import { Segmented } from '@/app/ui/Segmented';
import { Select } from '@/app/ui/Select';
import { toast } from '@/app/ui/Toast';
import { Container } from '@/app/components/layout/Container';
import { IconeQualquer } from '@/app/components/layout/IconesExtras';
import type { IconeExtra } from '@/app/components/layout/mais';
import { FundoHero } from '@/app/components/pages/home/FundoHero';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useRolarParaHash } from '@/app/components/pages/home/Institucional';
import { useElementSize } from '@/app/components/apuracao/MapHooks';
import { linkWhatsApp } from '@/app/components/anuncios/nucleo';
import { CenaLive } from '@/app/components/live/Cena';
import { siteDaLive } from '@/app/components/live/useQuadroLive';
import {
  ajustarOpcoes,
  caminhoLive,
  DESCRICAO_LAYOUT,
  LAYOUTS_LIVE,
  opcoesPadrao,
  POSICOES_BARRA,
  POSICOES_CANTO,
  RACES_LIVE,
  ROTULO_FUNDO,
  ROTULO_LAYOUT,
  ROTULO_POSICAO,
  rotuloRaceLive,
  UFS_LIVE,
  type FundoLive,
  type LayoutLive,
  type OpcoesLive,
  type PosicaoLive,
  type TemaLive,
} from '@/app/components/live/opcoes';

/** Tamanho em que a prévia é desenhada (e depois reduzida): a mesma proporção da fonte do OBS. */
const PREVIA_W = 1280;
const PREVIA_H = 720;

/** Mensagem pronta do contato de parceria. */
const TEXTO_PARCERIA = 'Olá! Faço lives e quero usar o Sintonia na transmissão da apuração do 2º turno. Meu canal: ';

/** URL que o streamer cola no OBS (com VITE_SITE_URL, o endereço público). */
export const urlDaLive = (o: OpcoesLive) => urlAbsoluta(caminhoLive(o));

/** Endereço da prévia (iframe na mesma origem: no demo, rota do HashRouter). */
function srcPrevia(o: OpcoesLive): string {
  const rota = `${caminhoLive(o)}&previa=1`;
  if (__DEMO__ && typeof window !== 'undefined') return `${window.location.href.split('#')[0]}#${rota}`;
  return rota;
}

export default function StreamersPage() {
  useTitulo('Para streamers · Use o Sintonia na sua live');
  useRolarParaHash();
  const contato = useStatus().data?.anuncie ?? null;
  // sem e-mail na /anuncie, o contato geral do site (painel → Comunicação → Contatos públicos)
  const geral = useContatos().geral;
  return (
    <>
      <Hero />
      <Container wide className="pb-6">
        <Layouts />
        <PassoAPasso />
        <BotsDeChat />
        <ModoTvRegional />
        <Regras />
        <Parceria whatsapp={contato?.whatsapp} email={(contato?.email && !emailProvisorio(contato.email) ? contato.email : null) ?? geral ?? undefined} />
      </Container>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Hero

function Hero() {
  const largo = useMediaQuery('(min-width: 1024px)');
  const { dominio } = siteDaLive();
  return (
    <section aria-labelledby="streamers-titulo" className="relative isolate overflow-hidden">
      <FundoHero />
      <Container wide className="relative pb-10 pt-7 sm:pb-14 sm:pt-14 lg:pb-16 lg:pt-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="min-w-0 animate-fade-up">
            <span className="inline-flex h-8 items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur">
              <Icon name="ao-vivo" size={15} className="text-brand-fg" />
              Para streamers
            </span>
            <h1
              id="streamers-titulo"
              className="mt-4 text-balance font-display text-[40px] font-semibold leading-[0.98] tracking-[-0.045em] text-fg min-[400px]:text-[46px] sm:mt-6 sm:text-[60px] lg:text-[64px]"
            >
              Use o Sintonia <span className="text-grad">na sua live.</span>
            </h1>
            <p className="mt-4 max-w-[36rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:mt-5 sm:text-[18px]">
              A apuração do 2º turno com os dados do TSE, pronta para o OBS e o Streamlabs: placar, barra, canto ou mapa, com fundo
              transparente. Os números atualizam sozinhos, a cada poucos segundos.{' '}
              <span className="text-fg">É grátis e não precisa de cadastro.</span>
            </p>
            <LivesAgora />
            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
              <ButtonLink to={{ hash: 'layouts' }} variant="primary" size="lg" icon="grade">
                Escolher o layout
              </ButtonLink>
              <ButtonLink to={{ hash: 'obs' }} variant="outline" size="lg" icon="configuracoes">
                Como configurar
              </ButtonLink>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-fg-muted sm:text-[13.5px]">
              <Selo icone="ao-vivo">Fonte de navegador</Selo>
              <Selo icone="olho-fechado">Fundo transparente</Selo>
              <Selo icone="expandir">1920 × 1080, 1280 × 720 e em pé 1080 × 1920</Selo>
              <Selo icone="pin">Brasil ou um estado</Selo>
              <Selo icone="lista">!apuracao no chat</Selo>
              <Selo icone="selo">Fonte: TSE</Selo>
            </ul>
          </div>
          {/* vitrine: a barra de verdade sobre uma cena de live (só no computador: no celular a galeria já mostra tudo) */}
          {largo ? (
            <div className="relative mx-auto w-full max-w-[720px] lg:mx-0 lg:justify-self-end">
              <div aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-[40px] bg-brand/10 blur-3xl" />
              <Previa opcoes={opcoesPadrao('barra')} titulo={`Exemplo: barra do Sintonia sobre uma live, com ${dominio}`} grande />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

function Selo({ icone, children }: { icone: IconName; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icone} size={15} className="text-brand-fg" />
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Prévia (a /live num iframe reduzido)

/**
 * A /live de verdade num iframe reduzido — mas sem pesar a página: o iframe só monta perto da tela (useNaTela), a
 * prévia busca os dados uma vez e não fica consultando (`previa=1`, hooks.ts) nem conta audiência, e trocar uma opção
 * navega DENTRO do iframe (history/hash) em vez de recarregar o app inteiro.
 */
function Previa({ opcoes, titulo, grande, vertical }: { opcoes: OpcoesLive; titulo: string; grande?: boolean; vertical?: boolean }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [refTela, naTela] = useNaTela<HTMLDivElement>('200px');
  // em pé (live vertical): a mesma URL numa janela 720×1280 — a /live vira o placar em pé sozinha
  const [largura, altura] = vertical ? [PREVIA_H, PREVIA_W] : [PREVIA_W, PREVIA_H];
  const escala = size.w > 0 ? size.w / largura : 0;
  // um elemento, dois observadores (tamanho e "perto da tela"): ref estável
  const refs = useCallback(
    (el: HTMLDivElement | null) => {
      ref(el);
      refTela.current = el;
    },
    [ref, refTela],
  );
  const src = srcPrevia(opcoes);
  // o atributo src fica o do 1º carregamento; as trocas seguintes navegam dentro do app do iframe
  const [srcInicial] = useState(src);
  const iframe = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = iframe.current;
    if (!el || src === srcInicial) return;
    try {
      const w = el.contentWindow;
      if (!w) throw new Error('sem janela');
      if (__DEMO__) w.location.hash = src.split('#')[1] ?? '';
      else {
        w.history.replaceState(null, '', src);
        w.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch {
      el.src = src;
    }
  }, [src, srcInicial]);
  return (
    // placar e fotos de candidato dentro: a barra fixa de anúncio do celular nunca fica encostada (faixaLivre.ts)
    <div
      ref={refs}
      data-sem-anuncio-fixo
      className={cn(
        'relative w-full overflow-hidden border border-line bg-bg shadow-card',
        vertical ? 'mx-auto aspect-[9/16] max-w-[260px]' : 'aspect-video',
        grande ? 'rounded-[22px]' : 'rounded-2xl',
      )}
    >
      {opcoes.fundo === 'transparente' ? <CenaLive selo /> : null}
      {escala > 0 && naTela ? (
        <iframe
          ref={iframe}
          src={srcInicial}
          title={titulo}
          loading="lazy"
          width={largura}
          height={altura}
          tabIndex={-1}
          // o iframe só fica transparente se o esquema de cores dele bater com o da página de dentro
          className={cn('pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-transparent', opcoes.tema === 'claro' ? '[color-scheme:light]' : '[color-scheme:dark]')}
          style={{ transform: `scale(${escala})` }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Galeria de layouts

function Bloco({ id, eyebrow, titulo, descricao, children, className }: { id: string; eyebrow: string; titulo: ReactNode; descricao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cn('scroll-mt-28 pt-14 sm:pt-20', className)}>
      <header className="max-w-[46rem]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">{eyebrow}</p>
        <h2 id={`${id}-titulo`} className="mt-2 text-balance font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[40px]">
          {titulo}
        </h2>
        {descricao ? <p className="mt-3 text-pretty text-[15.5px] leading-relaxed text-fg-muted sm:text-[17px]">{descricao}</p> : null}
      </header>
      <div className="mt-7 sm:mt-9">{children}</div>
    </section>
  );
}

function Layouts() {
  return (
    <Bloco
      id="layouts"
      eyebrow="Layouts"
      titulo="Quatro jeitos de pôr a apuração na tela"
      descricao="Escolha as opções e copie a URL. A prévia é a própria fonte da live, com os números de agora. Antes das 17h de 25/10, ela mostra o resultado oficial do 1º turno e a contagem regressiva."
    >
      <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        {LAYOUTS_LIVE.map((l, i) => (
          <CartaoLayout key={l} layout={l} n={i + 1} />
        ))}
      </ol>
    </Bloco>
  );
}

const OPCOES_FUNDO = (['transparente', 'escuro', 'claro'] as FundoLive[]).map((v) => ({ value: v, label: ROTULO_FUNDO[v] }));
const OPCOES_TEMA: { value: TemaLive; label: string }[] = [
  { value: 'escuro', label: 'Escuro' },
  { value: 'claro', label: 'Claro' },
];
const OPCOES_RACE = RACES_LIVE.map((r) => ({ value: r, label: rotuloRaceLive(r) }));
/** Estado fixo (I25): Brasil ou um dos 27 estados (Presidente). */
const OPCOES_UF = [{ value: '', label: 'Brasil (todos os estados)' }, ...UFS_LIVE.map((u) => ({ value: u, label: UF_NOMES[u] }))];

function CartaoLayout({ layout, n }: { layout: LayoutLive; n: number }) {
  const [o, setO] = useState<OpcoesLive>(() => opcoesPadrao(layout));
  // placar: prévia deitada (16:9) ou em pé (9:16, live vertical) — a URL é a mesma
  const [emPe, setEmPe] = useState(false);
  const mudar = useCallback((parcial: Partial<OpcoesLive>) => setO((x) => ajustarOpcoes({ ...x, ...parcial })), []);
  const url = urlDaLive(o);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    const ok = await copiarTexto(url);
    if (ok) {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2200);
      toast('URL copiada. Cole no campo URL da fonte de navegador.', { tone: 'ok', icon: 'check' });
    } else toast('Não deu para copiar: selecione a URL e copie à mão.', { tone: 'alert' });
  };
  const idUrl = `url-live-${layout}`;
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="flex items-start gap-3 p-5 pb-4 sm:p-6 sm:pb-5">
        <span className="num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[13px] font-bold text-brand-fg">{n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg">{ROTULO_LAYOUT[layout]}</h3>
          <p className="mt-1.5 text-pretty text-[14px] leading-snug text-fg-muted">{DESCRICAO_LAYOUT[layout]}</p>
        </div>
      </div>
      <div className="border-y border-line bg-bg/60 p-3 sm:p-4">
        {/* key: deitada e em pé são janelas de tamanhos diferentes (cada uma o seu iframe) */}
        <Previa key={emPe ? 'pe' : 'deitada'} opcoes={o} titulo={`Prévia do layout ${ROTULO_LAYOUT[layout]}${emPe ? ' em pé' : ''}`} vertical={emPe} />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Campo rotulo="Disputa">
            <Select size="sm" aria-label="Disputa" options={OPCOES_RACE} value={o.race} onChange={(e) => mudar({ race: e.target.value, uf: null })} />
          </Campo>
          {o.race === 'pres' ? (
            <Campo rotulo="Estado">
              <Select size="sm" aria-label="Estado" options={OPCOES_UF} value={o.uf ?? ''} onChange={(e) => mudar({ uf: (e.target.value || null) as UFBr | null })} />
            </Campo>
          ) : null}
          {layout === 'placar' ? (
            <Campo rotulo="Tela da live">
              <Segmented
                size="sm"
                block
                ariaLabel="Tela da live"
                options={[
                  { value: 'deitada', label: 'Deitada 16:9' },
                  { value: 'pe', label: 'Em pé 9:16' },
                ]}
                value={emPe ? 'pe' : 'deitada'}
                onChange={(v) => setEmPe(v === 'pe')}
              />
            </Campo>
          ) : null}
          <Campo rotulo="Fundo">
            <Segmented size="sm" block ariaLabel="Fundo" options={OPCOES_FUNDO} value={o.fundo} onChange={(v) => mudar({ fundo: v, tema: v === 'claro' ? 'claro' : 'escuro' })} />
          </Campo>
          {o.fundo === 'transparente' ? (
            <Campo rotulo="Painéis">
              <Segmented size="sm" block ariaLabel="Cor dos painéis" options={OPCOES_TEMA} value={o.tema} onChange={(v) => mudar({ tema: v })} />
            </Campo>
          ) : null}
          {layout === 'barra' ? (
            <Campo rotulo="Posição">
              <Segmented
                size="sm"
                block
                ariaLabel="Posição da barra"
                options={POSICOES_BARRA.map((p) => ({ value: p as PosicaoLive, label: ROTULO_POSICAO[p] }))}
                value={o.posicao}
                onChange={(v) => mudar({ posicao: v })}
              />
            </Campo>
          ) : null}
          {layout === 'canto' ? (
            <Campo rotulo="Canto">
              <Select
                size="sm"
                aria-label="Canto da tela"
                options={POSICOES_CANTO.map((p) => ({ value: p, label: ROTULO_POSICAO[p] }))}
                value={o.posicao}
                onChange={(e) => mudar({ posicao: e.target.value as PosicaoLive })}
              />
            </Campo>
          ) : null}
          {layout === 'mapa' && o.race === 'pres' && !o.uf ? (
            <Campo rotulo="Mapa">
              <Segmented
                size="sm"
                block
                ariaLabel="Detalhe do mapa"
                options={[
                  { value: 'estados', label: 'Estados' },
                  { value: 'municipios', label: 'Municípios' },
                ]}
                value={o.mapa}
                onChange={(v) => mudar({ mapa: v as OpcoesLive['mapa'] })}
              />
            </Campo>
          ) : null}
        </div>

        <div className="mt-auto">
          <label htmlFor={idUrl} className="mb-1.5 block text-[13px] font-medium text-fg-muted">
            URL da fonte de navegador
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={idUrl}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3 font-mono text-[13px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <button type="button" onClick={copiar} className={cn(buttonClasses({ variant: 'primary', size: 'md' }), 'h-11 shrink-0')}>
              <Icon name={copiado ? 'check' : 'copiar'} size={18} />
              {copiado ? 'Copiada' : 'Copiar URL'}
            </button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-muted">
            <span>
              {emPe ? (
                <>
                  Tamanho: <span className="num font-semibold text-fg">1080 × 1920</span> (live em pé; a mesma URL)
                </>
              ) : (
                <>
                  Tamanho: <span className="num font-semibold text-fg">1920 × 1080</span> (ou <span className="num">1280 × 720</span>)
                </>
              )}
            </span>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-fg underline decoration-line/[3] underline-offset-[3px] hover:decoration-brand-fg">
              Abrir em tela cheia
              <Icon name="externo" size={13} />
            </a>
          </p>
        </div>
      </div>
    </li>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-muted">{rotulo}</span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Passo a passo

const PASSOS_OBS: ReactNode[] = [
  <>Escolha o layout acima e toque em <strong className="font-semibold text-fg">Copiar URL</strong>.</>,
  <>
    No OBS Studio, em <strong className="font-semibold text-fg">Fontes</strong>, clique em <strong className="font-semibold text-fg">+</strong> e escolha{' '}
    <strong className="font-semibold text-fg">Navegador</strong> (Browser).
  </>,
  <>
    Cole a URL e defina <strong className="font-semibold text-fg">Largura <span className="num">1920</span></strong> e{' '}
    <strong className="font-semibold text-fg">Altura <span className="num">1080</span></strong> — ou{' '}
    <span className="num">1280 × 720</span>, se a sua cena for HD. Use a mesma resolução da cena (Configurações › Vídeo). Live em pé (TikTok,
    Shorts, Kick no celular)? Use <span className="num">1080 × 1920</span>: o placar fica em pé sozinho, com a mesma URL.
  </>,
  <>
    Marque <strong className="font-semibold text-fg">“Atualizar navegador quando a cena se tornar ativa”</strong> (Refresh browser when scene becomes
    active). O CSS personalizado pode ficar como está.
  </>,
  <>
    Estique a fonte até cobrir a tela inteira (botão direito › Transformar › Ajustar à tela). O layout já se posiciona sozinho: a barra no pé, o canto no
    topo direito — com o fundo transparente, o resto da cena aparece por trás.
  </>,
  <>Pronto. Os números atualizam sozinhos; não há botão nem nada para clicar durante a live.</>,
];

const DICAS: { icone: IconName; titulo: string; texto: ReactNode }[] = [
  {
    icone: 'ao-vivo',
    titulo: 'Streamlabs',
    texto: (
      <>
        Em Fontes, clique em <strong className="font-semibold text-fg">+</strong> › <strong className="font-semibold text-fg">Navegador</strong> (Browser Source),
        cole a URL, use <span className="num">1920 × 1080</span> e ligue “Atualizar ao ativar a cena”.
      </>
    ),
  },
  {
    icone: 'globo',
    titulo: 'Outros programas',
    texto: 'Qualquer programa que aceite fonte de navegador ou página da web funciona do mesmo jeito (vMix, XSplit). A fonte precisa de internet.',
  },
  {
    icone: 'reset',
    titulo: 'Travou ou ficou em branco?',
    texto: 'Clique com o botão direito na fonte › Propriedades › “Atualizar cache da página atual”. Se a internet cair, o último dado continua na tela até voltar.',
  },
  {
    icone: 'relogio',
    titulo: 'Ensaie antes',
    texto: 'Até as 17h de 25/10, a fonte mostra o 1º turno oficial e a contagem regressiva: dá para montar e testar a cena com antecedência.',
  },
];

function PassoAPasso() {
  return (
    <Bloco id="obs" eyebrow="Passo a passo" titulo="No OBS, em um minuto" descricao="O Sintonia entra como uma fonte de navegador, igual a um alerta de doação.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-5">
        <ol className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
          {PASSOS_OBS.map((p, i) => (
            <li key={i} className={cn('flex gap-3.5', i > 0 && 'mt-4 border-t border-line pt-4')}>
              <span className="num mt-px inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[13px] font-bold text-brand-fg">{i + 1}</span>
              <p className="min-w-0 text-pretty text-[15px] leading-relaxed text-fg-muted">{p}</p>
            </li>
          ))}
        </ol>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-3">
          {DICAS.map((d) => (
            <li key={d.titulo} className="flex gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-card">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
                <Icon name={d.icone} size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15.5px] font-semibold leading-snug text-fg">{d.titulo}</h3>
                <p className="mt-1 text-pretty text-[14px] leading-relaxed text-fg-muted">{d.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// "O Sintonia está em N lives agora" (I23): só a partir de LIVES.pisoPublico; nunca quais

function useLivesAgora(): number | null {
  const q = useQuery({
    queryKey: ['live-agora'],
    queryFn: async () => {
      const r = await fetch('/api/live/agora', { credentials: 'omit' });
      if (!r.ok) return null;
      const j = (await r.json()) as LivesPublico;
      return typeof j.agora === 'number' && j.agora >= LIVES.pisoPublico ? j.agora : null;
    },
    enabled: !__DEMO__,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return q.data ?? null;
}

function LivesAgora() {
  const n = useLivesAgora();
  if (n === null) return null;
  return (
    <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-[13.5px] font-medium text-fg-muted backdrop-blur">
      <span className="relative inline-flex h-2 w-2" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-2 opacity-60 motion-reduce:hidden" />
        <span className="relative h-2 w-2 rounded-full bg-brand-2" />
      </span>
      <span>
        O Sintonia está em <strong className="num font-semibold text-fg">{fmtInt(n)} lives</strong> agora
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Bots de chat (I22): !apuracao

const BOTS: { value: BotChat; label: string }[] = [
  { value: 'nightbot', label: 'Nightbot' },
  { value: 'streamelements', label: 'StreamElements' },
  { value: 'fossabot', label: 'Fossabot' },
];

/** Alvo do comando: Brasil (''), um estado ('PE') ou uma disputa de governador ('gov-df'). */
const OPCOES_ALVO = [
  { value: '', label: 'Brasil · Presidente' },
  ...UFS_LIVE.map((u) => ({ value: u, label: `${UF_NOMES[u]} · Presidente` })),
  ...RACES_LIVE.filter((r) => r !== 'pres').map((r) => ({ value: r, label: rotuloRaceLive(r) })),
];

const alvoDe = (v: string): { uf: UF | null; race: string | null } => (v.startsWith('gov-') ? { uf: null, race: v } : { uf: (v || null) as UF | null, race: null });

/** Texto que o bot vai responder agora (o próprio endereço do servidor; no demo não há servidor). */
function usePreviaTexto(alvo: string, ativo: boolean): string | null {
  const q = useQuery({
    queryKey: ['texto-placar', alvo],
    queryFn: async () => {
      const r = await fetch(urlTextoPlacar('', alvoDe(alvo)), { credentials: 'omit' });
      return r.ok ? await r.text() : null;
    },
    enabled: ativo && !__DEMO__,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return q.data ?? null;
}

function Copiavel({ rotulo, valor, dica, extra }: { rotulo: string; valor: string; dica?: ReactNode; extra?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    const ok = await copiarTexto(valor);
    if (ok) {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2200);
      toast('Copiado.', { tone: 'ok', icon: 'check' });
    } else toast('Não deu para copiar: selecione o texto e copie à mão.', { tone: 'alert' });
  };
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-muted">{rotulo}</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-fg">{valor}</code>
        <div className="flex shrink-0 items-start gap-2 sm:items-stretch">
          <button type="button" onClick={copiar} className={cn(buttonClasses({ variant: 'outline', size: 'md' }), 'h-11 shrink-0')}>
            <Icon name={copiado ? 'check' : 'copiar'} size={18} />
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          {extra}
        </div>
      </div>
      {dica ? <p className="mt-1.5 text-[12.5px] leading-snug text-fg-subtle">{dica}</p> : null}
    </div>
  );
}

function BotsDeChat() {
  const { site } = siteDaLive();
  const [bot, setBot] = useState<BotChat>('nightbot');
  const [alvo, setAlvo] = useState('');
  const [refTela, naTela] = useNaTela<HTMLDivElement>('300px');
  const a = alvoDe(alvo);
  const cmd = comandoBot(bot, site, a);
  const timer = mensagemTimer(bot, site, a);
  const previa = usePreviaTexto(alvo, naTela);
  const livre = !alvo && bot === 'nightbot';
  const passos: Record<BotChat, ReactNode[]> = {
    nightbot: [
      <>Com o Nightbot no seu canal, escreva no chat da live (como dono ou moderador) a linha de cima.</>,
      <>Pronto: quem digitar <strong className="font-semibold text-fg">!apuracao</strong> no chat recebe o placar e o endereço do site.</>,
      <>
        Para repetir sozinho: no painel do Nightbot, <strong className="font-semibold text-fg">Timers › Add</strong>, com a mensagem do timer e intervalo
        de <span className="num">5</span> minutos ou mais.
      </>,
    ],
    streamelements: [
      <>Com o StreamElements no seu canal, escreva no chat da live (como dono ou moderador) a linha de cima.</>,
      <>Pronto: quem digitar <strong className="font-semibold text-fg">!apuracao</strong> no chat recebe o placar e o endereço do site.</>,
      <>
        Para repetir sozinho: no painel do StreamElements, <strong className="font-semibold text-fg">Chatbot › Timers</strong>, com a mensagem do timer e
        intervalo de <span className="num">5</span> minutos ou mais.
      </>,
    ],
    fossabot: [
      <>
        No painel do Fossabot, <strong className="font-semibold text-fg">Commands › Add Command</strong>: nome{' '}
        <strong className="font-semibold text-fg">!apuracao</strong> e, na resposta, a linha de cima.
      </>,
      <>Pronto: quem digitar !apuracao no chat recebe o placar e o endereço do site.</>,
      <>
        Para repetir sozinho: <strong className="font-semibold text-fg">Timers › Add Timer</strong>, com a mensagem do timer e intervalo de{' '}
        <span className="num">5</span> minutos ou mais.
      </>,
    ],
  };
  return (
    <Bloco
      id="bots"
      eyebrow="Bot de chat"
      titulo="!apuracao no chat da sua live"
      descricao="Um comando para o Nightbot, o StreamElements ou o Fossabot responder com o placar e o endereço do site — no Twitch, no YouTube e no Kick. Escolha o bot e copie."
    >
      <div ref={refTela} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Campo rotulo="Bot">
              <Segmented size="sm" block ariaLabel="Bot de chat" options={BOTS} value={bot} onChange={setBot} />
            </Campo>
            <Campo rotulo="Placar">
              <Select size="sm" aria-label="Placar do comando" options={OPCOES_ALVO} value={alvo} onChange={(e) => setAlvo(e.target.value)} />
            </Campo>
          </div>
          {cmd.chat ? (
            <Copiavel
              rotulo="Cole no chat da live"
              valor={cmd.chat}
              dica={livre ? <>Do jeito que está, o público também escolhe o estado: <span className="font-mono">!apuracao pe</span>, <span className="font-mono">!apuracao são paulo</span> ou <span className="font-mono">!apuracao governador df</span>.</> : null}
            />
          ) : (
            <Copiavel rotulo="Resposta do comando !apuracao" valor={cmd.resposta} />
          )}
          <Copiavel rotulo="Mensagem do timer" valor={timer} dica="Com intervalo de 5 minutos ou mais, para não encher o chat." />
          <ol className="border-t border-line pt-4">
            {passos[bot].map((p, i) => (
              <li key={i} className={cn('flex gap-3.5', i > 0 && 'mt-3')}>
                <span className="num mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[12px] font-bold text-brand-fg">{i + 1}</span>
                <p className="min-w-0 text-pretty text-[14.5px] leading-relaxed text-fg-muted">{p}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {/* a prévia traz o placar do momento (na noite, nomes e %): bloco com candidato */}
          <div data-sem-anuncio-fixo className="rounded-3xl border border-line bg-surface p-5 shadow-card">
            <h3 className="flex items-center gap-2 text-[15.5px] font-semibold leading-snug text-fg">
              <Icon name="lista" size={17} className="text-fg-muted" />
              O que o bot responde agora
            </h3>
            {previa ? (
              <p className="mt-3 rounded-2xl rounded-tl-md border border-line bg-surface-2 px-3.5 py-3 text-[14px] leading-relaxed text-fg">{previa}</p>
            ) : (
              <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">A prévia da resposta aparece aqui, com os números do momento.</p>
            )}
          </div>
          <ul className="grid grid-cols-1 gap-3">
            {DICAS_BOT.map((d) => (
              <li key={d.titulo} className="flex gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-card">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
                  <Icon name={d.icone} size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15.5px] font-semibold leading-snug text-fg">{d.titulo}</h3>
                  <p className="mt-1 text-pretty text-[14px] leading-relaxed text-fg-muted">{d.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Bloco>
  );
}

const DICAS_BOT: { icone: IconName; titulo: string; texto: ReactNode }[] = [
  {
    icone: 'relogio',
    titulo: `Sem nomes antes das ${HORA_FIM_VOTACAO} de 25/10`,
    texto: `Até a apuração começar, a resposta traz só a contagem regressiva e o endereço. No dia 25, das 0h às ${HORA_FIM_VOTACAO} (fim da votação), só o horário em que a votação termina, sem nomes nem números.`,
  },
  {
    icone: 'selo',
    titulo: 'Texto neutro, ordem da urna',
    texto: 'Os dois finalistas pelo número na urna, com o mesmo formato, o total apurado e o horário do último dado. Cabe no chat do YouTube.',
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Modo TV com estado fixo (I25): rádios, TVs e telões regionais

function ModoTvRegional() {
  const [uf, setUf] = useState('');
  const url = urlAbsoluta(uf ? `/tv?uf=${uf.toLowerCase()}` : '/tv');
  return (
    <Bloco
      id="tv"
      eyebrow="Rádio, TV e telão"
      titulo="O Modo TV, do Brasil ou de um estado"
      descricao="Tela cheia com placar grande, mapa, letreiro dos acontecimentos e QR Code. Com um estado, o placar e o mapa ficam naquele estado a noite inteira."
    >
      <div className="grid grid-cols-1 gap-4 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-end lg:gap-6">
        <Campo rotulo="Estado">
          <Select size="sm" aria-label="Estado do Modo TV" options={OPCOES_UF} value={uf} onChange={(e) => setUf(e.target.value)} />
        </Campo>
        <Copiavel
          rotulo="Endereço do Modo TV"
          valor={url}
          extra={
            <a href={url} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses({ variant: 'ghost', size: 'md' }), 'h-11 shrink-0')}>
              Abrir
              <Icon name="externo" size={15} />
            </a>
          }
        />
      </div>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Regras

function Regras() {
  const { dominio } = siteDaLive();
  const regras: { icone: IconName | IconeExtra; titulo: string; texto: ReactNode }[] = [
    {
      icone: 'link',
      titulo: 'Dê os créditos',
      texto: (
        <>
          O endereço <strong className="font-semibold text-fg">{dominio}</strong> já vem no layout: deixe-o visível. Na descrição ou no título da live, cite
          “via {dominio}”.
        </>
      ),
    },
    {
      icone: 'grafico',
      titulo: 'Não edite os números',
      texto: 'Não recorte, não cubra e não altere percentuais, votos, o total apurado nem o horário do último dado. Eles vêm do TSE e mudam juntos.',
    },
    {
      icone: 'selo',
      titulo: 'Apartidário',
      texto: 'O layout é neutro: mesmas medidas e tratamento para os dois. Não o use em peça de campanha nem para pedir voto.',
    },
    {
      icone: 'info',
      titulo: 'Simulação não é resultado',
      texto: 'Se aparecer a faixa “Simulação · dados fictícios”, os números não são reais: não os apresente como apuração.',
    },
    {
      icone: 'megafone',
      titulo: '“Oferecido por”',
      texto: (
        <>
          Quando houver patrocinador do modo streamer, ele aparece identificado e separado do placar. Não cubra esse espaço. Marcas interessadas:{' '}
          <Link to="/anuncie" className="font-medium text-fg underline decoration-line/[3] underline-offset-[3px] hover:decoration-brand-fg">
            Anuncie no Sintonia
          </Link>
          .
        </>
      ),
    },
    {
      icone: 'urna',
      titulo: 'Fonte oficial',
      texto: 'Os dados são do TSE (resultados.tse.jus.br). O Sintonia não é um site oficial da Justiça Eleitoral.',
    },
  ];
  return (
    <Bloco id="regras" eyebrow="Regras de uso" titulo="Grátis, com crédito e sem mexer nos números">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {regras.map((r) => (
          <li key={r.titulo} className="flex gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-card">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
              <IconeQualquer name={r.icone} size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15.5px] font-semibold leading-snug text-fg">{r.titulo}</h3>
              <p className="mt-1 text-pretty text-[14px] leading-relaxed text-fg-muted">{r.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Parceria

/** mailto: com assunto e corpo prontos (null sem e-mail válido). */
export function linkEmailParceria(email: string | undefined): string | null {
  const e = (email ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return `mailto:${e}?subject=${encodeURIComponent('Sintonia na minha live')}&body=${encodeURIComponent(TEXTO_PARCERIA)}`;
}

function Parceria({ whatsapp, email }: { whatsapp?: string; email?: string }) {
  const zap = linkWhatsApp(whatsapp, TEXTO_PARCERIA);
  const mail = linkEmailParceria(email);
  const tem = !!(zap || mail);
  return (
    <Bloco id="parceria" eyebrow="Parceria" titulo="Vai transmitir a apuração?">
      <div className="relative isolate overflow-hidden rounded-[32px] border border-brand/35 bg-surface p-6 shadow-card sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -right-20 -z-10 h-72 w-72 rounded-full bg-brand-2/10 blur-3xl" />
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
          <p className="max-w-[44rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:text-[18px]">
            Conte para a gente o seu canal: avisamos sobre ajustes nos layouts antes do dia 25, ajudamos a configurar e conversamos sobre parcerias para a
            noite da eleição. {tem ? 'A mensagem já vai pronta.' : null}
          </p>
          {tem ? (
            <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              {zap ? (
                <a href={zap} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'primary', size: 'lg' })}>
                  <Icon name="whatsapp" size={20} />
                  Falar no WhatsApp
                </a>
              ) : null}
              {mail ? (
                <a href={mail} className={buttonClasses({ variant: zap ? 'outline' : 'primary', size: 'lg' })}>
                  <IconeQualquer name="carta" size={20} />
                  Enviar e-mail
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-[14.5px] font-medium text-fg-muted lg:max-w-[14rem] lg:text-right">O canal de parcerias chega em breve.</p>
          )}
        </div>
      </div>
    </Bloco>
  );
}
