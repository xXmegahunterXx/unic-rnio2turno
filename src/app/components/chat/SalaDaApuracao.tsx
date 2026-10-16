/**
 * A sala do chat nas páginas da apuração (/apuracao e /apuracao/:uf), montada pelo AppShell (chunk próprio, só nessas
 * rotas). Aparece quando a moderação abre a sala (no build demo, sempre, com o aviso de desligada).
 *
 *  - Desktop (≥ 1024 px): aba vertical estreita na borda direita (fora do conteúdo) com o contador de novas; aberta,
 *    vira painel lateral que EMPURRA a página quando o layout dela continua o mesmo com a largura que sobra ('doca',
 *    `--sala-lateral` no <html>, usado pelo AppShell), gaveta NÃO modal por cima da coluna do mapa ('gaveta': sem fundo
 *    escurecido, a página continua usável) ou, nas janelas estreitas, a folha inferior centralizada ('folha') —
 *    `modoPainelDesktop`. Nunca cobre só um lado do placar.
 *  - Celular/tablet: botão flutuante "Chat ao vivo" (com contador) acima da tab bar e da barra de anúncio do rodapé.
 *    Nunca por cima de placar/resultado: com um bloco `data-sem-anuncio-fixo` na faixa de baixo da tela (faixaLivre),
 *    ele recolhe para uma alça estreita na borda (na margem, fora dos números). Abre uma folha inferior NÃO modal de
 *    altura medida: se o placar está na tela, a página rola para ele ficar logo abaixo do cabeçalho, à vista acima da
 *    folha. A folha leva `data-sem-anuncio-fixo` (a barra de anúncio do rodapé some enquanto ela está aberta).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { useFaixaLivre } from '@/app/components/anuncios/faixaLivre';
import { LARGURA_PAINEL, alturaFolhaCelular, modoPainelDesktop, paginaDaSala, type PaginaSala } from './nucleo';
import { IconeChat, Sala } from './Sala';
import { aoPedirAbrirChat, avisarChatDisponivel } from './chamada';
import { useSala } from './sala';

const CHAVE_PAINEL = 'sintonia:chat-painel';

function lerPainel(): boolean {
  try {
    return localStorage.getItem(CHAVE_PAINEL) === '1';
  } catch {
    return false;
  }
}
function gravarPainel(v: boolean) {
  try {
    if (v) localStorage.setItem(CHAVE_PAINEL, '1');
    else localStorage.removeItem(CHAVE_PAINEL);
  } catch {
    /* só nesta visita */
  }
}

function useLarguraJanela(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    let q = 0;
    const f = () => {
      if (!q) q = window.requestAnimationFrame(() => ((q = 0), setW(window.innerWidth)));
    };
    window.addEventListener('resize', f);
    return () => {
      window.removeEventListener('resize', f);
      window.cancelAnimationFrame(q);
    };
  }, []);
  return w;
}

export default function SalaDaApuracao() {
  const { pathname } = useLocation();
  const pagina = paginaDaSala(pathname);
  const desktop = useMediaQuery('(min-width: 1024px)', false);
  if (!pagina) return null;
  return desktop ? <SalaDesktop pagina={pagina} /> : <SalaCelular pathname={pathname} />;
}

/** Contador de novas (bolha). */
function Contador({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={cn('num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold leading-none text-brand-ink', className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function BotaoAcao({ icone, rotulo, onClick, children }: { icone?: Parameters<typeof Icon>[0]['name']; rotulo: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="toque relative inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {icone ? <Icon name={icone} size={17} /> : children}
    </button>
  );
}

// ---- desktop ------------------------------------------------------------------------------------------------------------

function SalaDesktop({ pagina }: { pagina: PaginaSala }) {
  const largura = useLarguraJanela();
  const modo = modoPainelDesktop(largura, pagina);
  const [aberto, setAberto] = useState(false);
  const s = useSala(aberto ? null : 'fundo');
  const disponivel = s.indisponivel || !!s.pub?.aberta;
  const mostrar = aberto || disponivel;
  // a doca lembra se ficou aberta (conveniência deste navegador) e reabre quando a sala estiver aberta; a gaveta (por
  // cima do mapa) sempre começa fechada
  const lembrada = useRef<boolean | null>(null);
  useEffect(() => {
    if (lembrada.current === null && s.pub) {
      lembrada.current = lerPainel();
      if (lembrada.current && s.pub.aberta && modo === 'doca') setAberto(true);
    }
  }, [s.pub, modo]);

  const abrir = useCallback(() => {
    if (modo === 'folha') mostrarPlacarAcima();
    setAberto(true);
    if (modo === 'doca') gravarPainel(true);
  }, [modo]);
  const fechar = useCallback(() => {
    setAberto(false);
    gravarPainel(false);
  }, []);
  // chamada "Chat ao vivo" da 1ª dobra (chamada.ts): aparece com a sala aberta e abre o painel
  useEffect(() => {
    avisarChatDisponivel(disponivel);
    return () => avisarChatDisponivel(false);
  }, [disponivel]);
  useEffect(() => aoPedirAbrirChat(abrir), [abrir]);

  // doca: a página ganha espaço à direita (AppShell: main e rodapé usam --sala-lateral)
  const doca = aberto && modo === 'doca';
  useEffect(() => {
    const html = document.documentElement;
    if (doca) html.style.setProperty('--sala-lateral', `${LARGURA_PAINEL}px`);
    else html.style.removeProperty('--sala-lateral');
    return () => {
      html.style.removeProperty('--sala-lateral');
    };
  }, [doca]);

  if (!mostrar) return null;
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        aria-label={`Abrir o chat ao vivo${s.novas ? ` (${s.novas} mensagens novas)` : ''}`}
        className="group fixed right-0 top-1/2 z-30 flex w-7 -translate-y-1/2 flex-col items-center gap-2 rounded-l-xl border border-r-0 border-line bg-surface py-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)] transition-[width,background-color] hover:w-9 hover:bg-surface-2 focus-visible:w-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="relative text-brand-fg">
          <IconeChat size={17} />
          {s.novas > 0 ? <Contador n={s.novas} className="absolute -right-3 -top-3 ring-2 ring-surface" /> : null}
        </span>
        <span className="text-[12px] font-semibold tracking-[0.01em] text-fg [writing-mode:vertical-rl] rotate-180">Chat ao vivo</span>
        {s.pub?.aberta ? <LiveDot size={7} /> : null}
      </button>
    );
  }
  if (doca) {
    return (
      <aside
        aria-label="Chat ao vivo"
        style={{ width: LARGURA_PAINEL }}
        className="fixed bottom-0 right-0 top-[var(--app-header-h,64px)] z-30 flex flex-col border-l border-line bg-surface shadow-[-20px_0_50px_-30px_rgb(0_0_0/0.5)]"
      >
        <Sala variante="painel" acoes={<BotaoAcao icone="fechar" rotulo="Recolher o chat" onClick={fechar} />} />
      </aside>
    );
  }
  if (modo === 'folha') return <Folha onFechar={fechar} centralizada />;
  return <Gaveta onFechar={fechar} />;
}

/**
 * Gaveta por cima da coluna do MAPA (nacional entre 1360 e 1759 px): NÃO modal — sem fundo escurecido, sem prender o
 * foco e sem fechar no clique fora; a página continua usável (mexer no mapa, rolar o placar) com o chat aberto. Esc fecha.
 */
function Gaveta({ onFechar }: { onFechar: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const reduzir = useReducedMotion();
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.contains(document.activeElement)) onFechar();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [onFechar]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.aside
      ref={ref}
      aria-label="Chat ao vivo"
      tabIndex={-1}
      initial={reduzir ? { opacity: 0 } : { x: '100%' }}
      animate={reduzir ? { opacity: 1 } : { x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 }}
      style={{ width: LARGURA_PAINEL }}
      className="fixed bottom-0 right-0 top-[var(--app-header-h,64px)] z-30 flex flex-col border-l border-line bg-surface shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.6)] outline-none"
    >
      <Sala variante="painel" acoes={<BotaoAcao icone="fechar" rotulo="Fechar o chat" onClick={onFechar} />} />
    </motion.aside>,
    document.body,
  );
}

// ---- celular -------------------------------------------------------------------------------------------------------------

/** Altura do teclado virtual (visualViewport), para a folha subir junto. */
function useTeclado(ativo: boolean): { inset: number; altura: number } {
  const [v, setV] = useState({ inset: 0, altura: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!ativo || !vv) return;
    const f = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setV({ inset: inset > 80 ? inset : 0, altura: Math.round(vv.height) });
    };
    f();
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    return () => {
      vv.removeEventListener('resize', f);
      vv.removeEventListener('scroll', f);
    };
  }, [ativo]);
  return v;
}

/**
 * Com o placar na tela, rola para ele ficar logo abaixo do cabeçalho (à vista acima da folha). Devolve onde a linha dos
 * percentuais do placar TERMINA depois da rolagem (px do topo da janela), para a folha começar logo abaixo dela; null
 * sem placar na tela.
 */
function mostrarPlacarAcima(): number | null {
  const el =
    document.querySelector<HTMLElement>('#conteudo section[aria-label^="Placar"][data-sem-anuncio-fixo]') ??
    document.querySelector<HTMLElement>('#conteudo [data-sem-anuncio-fixo]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= window.innerHeight) return null; // fora da tela: não mexe na leitura
  const cab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 56;
  const votos = el.querySelector<HTMLElement>('[data-placar-votos]');
  let delta = r.top - cab - 8;
  // celular baixo (375×667): com o placar inteiro à vista, sobrariam ~320 px para a folha (1 mensagem). Aí o topo do
  // placar (título da disputa) passa por baixo do cabeçalho e ficam à vista as fotos, os nomes e os % — a folha ganha
  // ~60 px de lista
  const lados = el.querySelector<HTMLElement>('[data-placar-lados]');
  if (votos && lados && window.innerHeight - (votos.getBoundingClientRect().top - delta) < 360) {
    delta = lados.getBoundingClientRect().top - cab - 8;
  }
  if (Math.abs(delta) < 24) delta = 0;
  else {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const alvo = Math.min(max, Math.max(0, window.scrollY + delta));
    delta = alvo - window.scrollY;
    window.scrollTo({ top: alvo, behavior: 'smooth' });
  }
  // a linha "N votos" vem 8 px abaixo dos percentuais: a folha começa 2 px acima dela (os % ficam inteiros)
  if (!votos) return null;
  return votos.getBoundingClientRect().top - delta - 2;
}

function SalaCelular({ pathname }: { pathname: string }) {
  const [aberto, setAberto] = useState(false);
  const [altura, setAltura] = useState<number | null>(null);
  const s = useSala(aberto ? null : 'fundo');
  const disponivel = s.indisponivel || !!s.pub?.aberta;
  const livre = useFaixaLivre(disponivel && !aberto, pathname);
  const reduzir = useReducedMotion();

  const abrir = useCallback(() => {
    const limite = mostrarPlacarAcima();
    setAltura(alturaFolhaCelular(window.innerHeight, limite));
    setAberto(true);
  }, []);
  // chamada "Chat ao vivo" da 1ª dobra (chamada.ts): a alça da borda é discreta; a chamada no topo da página é a porta
  // visível para a sala no celular
  useEffect(() => {
    avisarChatDisponivel(disponivel);
    return () => avisarChatDisponivel(false);
  }, [disponivel]);
  useEffect(() => aoPedirAbrirChat(abrir), [abrir]);

  if (!disponivel && !aberto) return null;
  return (
    <>
      <AnimatePresence initial={false}>
        {!aberto ? (
          livre ? (
            <motion.button
              key="pilula"
              type="button"
              onClick={abrir}
              initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduzir ? { opacity: 0 } : { opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              aria-label={`Abrir o chat ao vivo${s.novas ? ` (${s.novas} mensagens novas)` : ''}`}
              className="segue-tab fixed bottom-[calc(72px+var(--anuncio-rodape-h,0px)+env(safe-area-inset-bottom))] right-3 z-40 inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface pl-3 pr-3.5 text-[13.5px] font-semibold text-fg shadow-[0_12px_32px_-10px_rgb(0_0_0/0.55),0_2px_6px_-2px_rgb(0_0_0/0.2)] active:scale-[0.97] lg:hidden [html[data-teclado]_&]:hidden"
            >
              <span className="relative text-brand-fg">
                <IconeChat size={19} />
              </span>
              Chat ao vivo
              {s.novas > 0 ? <Contador n={s.novas} /> : s.pub?.aberta ? <LiveDot size={7} /> : null}
            </motion.button>
          ) : (
            <motion.button
              key="alca"
              type="button"
              onClick={abrir}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              aria-label={`Abrir o chat ao vivo${s.novas ? ` (${s.novas} mensagens novas)` : ''}`}
              // alça de 14 px: cabe na margem de 16 px da página, sem encostar no cartão do placar (a área de toque é maior);
              // com o rótulo vertical "Chat" para ser reconhecível
              className="segue-tab toque fixed bottom-[calc(72px+var(--anuncio-rodape-h,0px)+env(safe-area-inset-bottom))] right-0 z-40 inline-flex h-[68px] w-3.5 flex-col items-center justify-center gap-1 rounded-l-lg border border-r-0 border-line bg-surface text-brand-fg shadow-[0_8px_24px_-10px_rgb(0_0_0/0.5)] lg:hidden [html[data-teclado]_&]:hidden"
            >
              <span aria-hidden className="rotate-180 text-[10px] font-bold leading-none tracking-[0.04em] [writing-mode:vertical-rl]">
                Chat
              </span>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
              {s.novas > 0 ? <span aria-hidden className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" /> : null}
            </motion.button>
          )
        ) : null}
      </AnimatePresence>
      <AnimatePresence>{aberto ? <Folha key="folha" alturaCelular={altura} onFechar={() => setAberto(false)} /> : null}</AnimatePresence>
    </>
  );
}

/**
 * Folha inferior NÃO modal. `centralizada`: no computador estreito (1024–1199), com largura limitada e no centro.
 * `alturaCelular`: altura medida na abertura (do fim dos % do placar ao pé da tela — alturaFolhaCelular).
 */
function Folha({ onFechar, centralizada = false, alturaCelular = null }: { onFechar: () => void; centralizada?: boolean; alturaCelular?: number | null }) {
  const [cheia, setCheia] = useState(false);
  const drag = useDragControls();
  const reduzir = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const teclado = useTeclado(true);

  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [onFechar]);

  const aoSoltar = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onFechar();
    else if (info.offset.y < -60) setCheia(true);
  };

  // com o teclado aberto, a folha sobe e cabe na parte visível
  // computador estreito: mais baixa (o placar, mais alto que no celular, fica à vista acima com os dois percentuais)
  // celular: começa logo abaixo da linha dos % do placar (medida ao abrir), com a lista o mais alta possível — no celular
  // baixo (360×740, 375×667) a altura fixa de 44% deixava a lista sem nenhuma mensagem inteira (arrastar para cima amplia)
  const altura = cheia
    ? 'calc(100dvh - var(--app-header-h, 56px) - 8px)'
    : centralizada
      ? 'min(44dvh, 440px)'
      : alturaCelular
        ? `${alturaCelular}px`
        : 'min(58dvh, 560px)';
  const estilo = teclado.inset
    ? { bottom: teclado.inset, height: Math.max(260, Math.min(teclado.altura - 8, cheia ? teclado.altura - 8 : teclado.altura * 0.9)) }
    : { bottom: 0, height: altura };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label="Chat ao vivo"
      tabIndex={-1}
      data-sem-anuncio-fixo
      initial={reduzir ? { opacity: 0 } : { y: '100%' }}
      animate={reduzir ? { opacity: 1 } : { y: 0 }}
      exit={reduzir ? { opacity: 0 } : { y: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 40, mass: 0.9 }}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.06, bottom: 0.9 }}
      onDragEnd={aoSoltar}
      style={estilo}
      className={cn(
        'fixed z-[60] flex flex-col overflow-hidden rounded-t-3xl border-t border-line bg-surface shadow-[0_-24px_60px_-20px_rgb(0_0_0/0.65)] outline-none transition-[height] duration-200',
        // centro da tela, com as mesmas margens dos dois lados (cobre a parte de baixo dos DOIS lados do placar, nunca um só)
        centralizada ? 'inset-x-[max(24px,calc(50vw-380px))] border-x' : 'inset-x-0 lg:hidden',
      )}
    >
      <div
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        onPointerDown={(e) => drag.start(e)}
        onClick={() => setCheia((c) => !c)}
        aria-hidden
      >
        <span className="h-1.5 w-10 rounded-full bg-fg-subtle/50" />
      </div>
      <Sala
        variante="folha"
        className="-mt-1"
        acoes={
          <>
            <BotaoAcao rotulo={cheia ? 'Diminuir o chat' : 'Aumentar o chat'} onClick={() => setCheia((c) => !c)}>
              <Icon name="chevron-cima" size={17} className={cn('transition-transform duration-200', cheia && 'rotate-180')} />
            </BotaoAcao>
            <BotaoAcao icone="fechar" rotulo="Fechar o chat" onClick={onFechar} />
          </>
        }
      />
    </motion.div>,
    document.body,
  );
}
