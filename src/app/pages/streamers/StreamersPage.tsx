/**
 * /streamers — "Use o Sintonia na sua live": os layouts do modo streamer (/live) com prévia, opções e "Copiar URL",
 * o passo a passo do OBS/Streamlabs (fonte de navegador), as regras de uso e o contato de parceria (`status.anuncie`,
 * o mesmo contato comercial do painel).
 *
 * Prévias: a própria /live num iframe (mesma origem, `?previa=1` → o anúncio aparece sem contar impressão), desenhada
 * em 1280×720 e reduzida para caber — é exatamente o que vai para a transmissão, com o tema e o fundo pedidos (o tema
 * do site não interfere). `loading="lazy"`: só carrega perto da tela.
 *
 * Nada de número de audiência aqui (nunca inventamos): só o que o produto entrega de fato.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { copiarTexto, urlAbsoluta } from '@/app/lib/share';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { useNaTela } from '@/app/lib/useNaTela';
import { useStatus } from '@/app/data/hooks';
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
  return (
    <>
      <Hero />
      <Container wide className="pb-6">
        <Layouts />
        <PassoAPasso />
        <Regras />
        <Parceria whatsapp={contato?.whatsapp} email={contato?.email} />
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
            <Select size="sm" aria-label="Disputa" options={OPCOES_RACE} value={o.race} onChange={(e) => mudar({ race: e.target.value })} />
          </Campo>
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
          {layout === 'mapa' && o.race === 'pres' ? (
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
            <ButtonLink to="/sobre#contato" variant="outline" size="lg" iconRight="seta" className="shrink-0">
              Ver contatos
            </ButtonLink>
          )}
        </div>
      </div>
    </Bloco>
  );
}
