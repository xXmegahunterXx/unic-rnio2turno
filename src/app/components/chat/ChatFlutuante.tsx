/**
 * Chat ao vivo em TODAS as páginas do site, estilo popup de atendimento: montado pelo AppShell num chunk próprio,
 * carregado depois da 1ª pintura quando o navegador fica ocioso (nunca no JS inicial), fora de /ao-vivo e do Teste Cego
 * (chat/rotas.ts). Estado e consultas em sala.ts (um só por aba; minimizado consulta bem mais devagar, aba escondida não
 * consulta, sala fechada consulta raramente e acorda na hora da abertura).
 *
 *  - Computador largo (≥ 1760 px): DOCA — coluna à direita, abaixo do cabeçalho, que EMPURRA a página (`--sala-lateral`):
 *    sempre aberta com a sala aberta, sem cobrir nada (`modoComputador`).
 *  - Computador (1024–1759 px): popup no canto inferior direito (~360×540; até 420 de altura em janela de até 800 px;
 *    "Aumentar" = mais largo e com a altura toda abaixo do cabeçalho), ABERTO por padrão com a sala aberta; "Minimizar"
 *    vira a pílula "Chat ao vivo · N novas". A escolha fica lembrada neste navegador (só a feita com a sala aberta). Com
 *    a sala fechada antes das 17h de 25/10, nasce minimizado ("Chat ao vivo · abre domingo, 17h").
 *  - Celular e tablet (< 1024 px): escondido — alça estreita na borda (ou, sem barra de anúncio no rodapé e com a faixa
 *    de baixo livre, a pílula discreta acima da tab bar), com o contador de novas; o toque abre a folha inferior (nas
 *    páginas da apuração, com o placar à vista acima), que fecha pelo botão, arrastando para baixo ou com Esc. No tablet
 *    a folha vai de lado a lado do conteúdo.
 *
 * Regra de ouro (ARCHITECTURE §1.5): o popup e a pílula nunca ficam por cima de número, nome ou foto de candidato — nem
 * encostados (respiro de 16 px). O popup aberto se recolhe sozinho quando a área dele chega perto de um bloco com
 * candidato (regiao.ts) e volta quando ela fica livre — salvo enquanto a pessoa mexe nele (mouse em cima, digitando) e por
 * 3 s depois (`popupAberto`). A faixa "Sala oferecida por" some com um bloco com candidato a menos de 48 px (popup, doca
 * e folha central) e nunca aparece na ficha do candidato nem na /anuncie. A pílula, perto de um bloco, vira a alça NO
 * MESMO CANTO (a entrada não pula de lugar). Pedir o chat (pílula, alça, chamada da página) com o canto ocupado abre a
 * folha CENTRAL embaixo, de lado a lado do conteúdo — cobre os DOIS lados por igual, nunca um só — e, quando dá, rola
 * o bloco de cima (placar, retratos) para ficar inteiro à vista acima dela (`prepararFolhaCentral`).
 *
 * Privacidade: o popup que abre sozinho só LÊ a sala; o sinal de presença e o token nascem quando a pessoa usa o chat
 * (`marcarParticipacao`, sala.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { useFaixaLivre } from '@/app/components/anuncios/faixaLivre';
import { rodapePermitido } from '@/app/components/anuncios/nucleo';
import {
  ALTURA_FOLHA_ALTA,
  GRACA_INTERACAO_MS,
  LARGURA_DOCA,
  RESPIRO_ANUNCIO,
  RESPIRO_POPUP,
  alturaFolhaCelular,
  faseChat,
  geometriaDoca,
  geometriaPopup,
  inflar,
  lerPrefGuardada,
  modoComputador,
  ondeAbrir,
  paginaDaSala,
  popupAberto,
  prefEfetiva,
  regiaoAnuncioSala,
  regiaoPilula,
  textoAbertura,
  type FaseChat,
  type PrefPopup,
} from './nucleo';
import { IconeChat, Sala } from './Sala';
import { aoPedirAbrirChat, avisarChatDisponivel } from './chamada';
import { ATRIBUTO_CHAT, useRegioesOcupadas } from './regiao';
import { agoraServidor, marcarParticipacao, useSala, type EstadoSala } from './sala';

/** Mesma chave de antes ("se o chat ficou aberto ou minimizado no computador", citada na /privacidade): '1' aberto, '0' minimizado. */
const CHAVE_PREF = 'sintonia:chat-painel';

function lerPref(): PrefPopup | null {
  try {
    return lerPrefGuardada(localStorage.getItem(CHAVE_PREF));
  } catch {
    return null;
  }
}
function gravarPref(v: PrefPopup) {
  try {
    localStorage.setItem(CHAVE_PREF, v === 'aberto' ? '1' : '0');
  } catch {
    /* só nesta visita */
  }
}

const marca = { [ATRIBUTO_CHAT]: '' };

export default function ChatFlutuante() {
  const { pathname } = useLocation();
  const computador = useMediaQuery('(min-width: 1024px)', false);
  return computador ? <ChatComputador pathname={pathname} /> : <ChatCelular pathname={pathname} />;
}

/** Fase da sala + a chamada "Chat ao vivo" da 1ª dobra da apuração (chamada.ts: aparece com a sala aberta). */
function useFase(s: EstadoSala): FaseChat {
  const fase = faseChat(s.pub, s.indisponivel, agoraServidor());
  const disponivel = fase === 'aberta' || fase === 'demo';
  useEffect(() => {
    avisarChatDisponivel(disponivel);
    return () => avisarChatDisponivel(false);
  }, [disponivel]);
  return fase;
}

/** Texto curto da pílula depois de "Chat ao vivo · ". */
function detalhePilula(fase: FaseChat, novas: number): string | null {
  if (fase === 'demo') return 'prévia';
  if (fase === 'antes') return textoAbertura(agoraServidor());
  if (fase === 'aberta' && novas > 0) return `${novas > 99 ? '99+' : novas} ${novas === 1 ? 'nova' : 'novas'}`;
  return null;
}

function rotuloAbrir(fase: FaseChat, novas: number): string {
  const d = fase === 'aberta' ? (novas ? `${novas} mensagens novas` : null) : detalhePilula(fase, novas);
  return `Abrir o chat ao vivo${d ? ` (${d})` : ''}`;
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

/** Pílula "Chat ao vivo · …" (computador: canto inferior direito; celular: acima da tab bar). */
function Pilula({
  fase,
  novas,
  onAbrir,
  className,
  botaoRef,
  discreta = false,
}: {
  fase: FaseChat;
  novas: number;
  onAbrir: () => void;
  className?: string;
  botaoRef?: React.Ref<HTMLButtonElement>;
  /** celular: menor, sem a seta (o chat fica "escondido") */
  discreta?: boolean;
}) {
  const detalhe = detalhePilula(fase, novas);
  const reduzir = useReducedMotion();
  return (
    // posição (e o deslocamento da tab bar, `segue-tab`) no invólucro; a animação no botão (transform próprio)
    <div {...marca} className={cn('fixed z-40', className)}>
      <motion.button
        ref={botaoRef}
        type="button"
        onClick={onAbrir}
        initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        aria-label={rotuloAbrir(fase, novas)}
        className={cn(
          'inline-flex max-w-[calc(100vw-24px)] items-center rounded-full border border-line bg-surface font-semibold text-fg shadow-[0_12px_32px_-10px_rgb(0_0_0/0.55),0_2px_6px_-2px_rgb(0_0_0/0.2)] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97]',
          discreta ? 'h-10 gap-1.5 pl-2.5 pr-3 text-[13px]' : 'h-11 gap-2 pl-3 pr-3 text-[13.5px]',
        )}
      >
        <span className={cn('relative', fase === 'aberta' ? 'text-brand-fg' : 'text-fg-muted')}>
          <IconeChat size={19} />
        </span>
        <span className="whitespace-nowrap">Chat ao vivo</span>
        {detalhe ? (
          <span className={cn('min-w-0 truncate font-medium', fase === 'aberta' ? 'text-brand-fg' : 'text-fg-muted')}>
            <span aria-hidden className="mr-1.5 text-fg-subtle">
              ·
            </span>
            <span className="num">{detalhe}</span>
          </span>
        ) : null}
        {fase === 'aberta' && !novas ? <LiveDot size={7} /> : null}
        {discreta ? null : <Icon name="chevron-cima" size={15} className="shrink-0 text-fg-subtle" />}
      </motion.button>
    </div>
  );
}

/**
 * Alça estreita na borda direita (14 px no celular: cabe na margem de 16 px da página, fora dos números; 16 px no
 * computador: dentro da margem de 32 px do conteúdo, com 16 px de respiro até ele), com o rótulo vertical "Chat" e o ponto de novas. Celular: acima da
 * tab bar; computador: no canto de baixo, no MESMO lugar da pílula, quando ela ficaria perto de um bloco com candidato.
 */
function Alca({ fase, novas, onAbrir, className, botaoRef }: { fase: FaseChat; novas: number; onAbrir: () => void; className?: string; botaoRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <div {...marca} className={cn('fixed right-0 z-40', className)}>
      <motion.button
        ref={botaoRef}
        type="button"
        onClick={onAbrir}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        aria-label={rotuloAbrir(fase, novas)}
        title="Chat ao vivo"
        className="toque relative inline-flex h-[68px] w-3.5 flex-col items-center justify-center gap-1 rounded-l-lg border border-r-0 border-line bg-surface shadow-[0_8px_24px_-10px_rgb(0_0_0/0.5)] transition-[width,background-color] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:h-[96px] lg:w-4 lg:hover:w-6 lg:focus-visible:w-6"
      >
        <span aria-hidden className={cn('rotate-180 text-[10px] font-bold leading-none tracking-[0.04em] [writing-mode:vertical-rl]', fase === 'aberta' ? 'text-brand-fg' : 'text-fg-muted')}>
          Chat
        </span>
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', fase === 'aberta' ? 'bg-brand' : 'bg-fg-subtle')} />
        {novas > 0 ? <span aria-hidden className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" /> : null}
      </motion.button>
    </div>
  );
}

// ---- computador ---------------------------------------------------------------------------------------------------------

function useJanela(): { largura: number; altura: number; cabecalho: number } {
  const ler = () => ({
    largura: window.innerWidth,
    altura: window.innerHeight,
    cabecalho: alturaCabecalho(),
  });
  const [j, setJ] = useState(ler);
  useEffect(() => {
    let q = 0;
    const f = () => {
      if (!q)
        q = window.requestAnimationFrame(() => {
          q = 0;
          const n = ler();
          setJ((a) => (a.largura === n.largura && a.altura === n.altura && a.cabecalho === n.cabecalho ? a : n));
        });
    };
    window.addEventListener('resize', f);
    // o cabeçalho muda de altura (faixa de simulação, conexão instável): o AppShell atualiza --app-header-h
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(f) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      window.removeEventListener('resize', f);
      mo?.disconnect();
      window.cancelAnimationFrame(q);
    };
  }, []);
  return j;
}

function alturaCabecalho(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 64;
}

/** Handlers que marcam o USO do chat (clique, rolagem, teclado, foco num campo): só então vai o sinal de presença. */
const usoDoChat = {
  onPointerDown: () => marcarParticipacao(),
  onWheel: () => marcarParticipacao(),
  onKeyDownCapture: () => marcarParticipacao(),
};

function ChatComputador({ pathname }: { pathname: string }) {
  const s = useSala('fundo');
  const fase = useFase(s);
  const aberta = fase === 'aberta';
  const janela = useJanela();
  const modo = modoComputador(janela.largura);
  const emDoca = modo === 'doca';
  const [grande, setGrande] = useState(false);
  const [guardada, setGuardada] = useState(lerPref);
  const [sessao, setSessao] = useState<{ pref: PrefPopup; aberta: boolean } | null>(null);
  const pref = prefEfetiva({ sessao, guardada, aberta });
  /** folha central embaixo: pedido para abrir com o canto em cima de candidato (`ondeAbrir`), até minimizar */
  const [central, setCentral] = useState<{ altura: string } | null>(null);

  // interação com o popup do canto: mouse em cima / digitando no campo, e a última mexida
  const [dentro, setDentro] = useState(false);
  const [interacao, setInteracao] = useState(0);
  const [, redesenhar] = useState(0);
  const mexeu = useCallback(() => setInteracao(Date.now()), []);

  const g = geometriaPopup(janela, janela.cabecalho, grande);
  const gd = geometriaDoca(janela, janela.cabecalho);
  const pil = regiaoPilula(janela);
  // áreas vigiadas: [0] o popup (com respiro), [1] a pílula (com respiro), [2] a faixa do anúncio (respiro de 48 px: o
  // popup inteiro; na doca, a faixa do topo dela — a página fica ao lado, nunca embaixo)
  const regioes = useMemo(() => {
    const caixa = { top: g.top, left: g.left, right: g.right, bottom: g.bottom };
    const doca = { top: gd.top, left: gd.left, right: gd.right, bottom: gd.bottom };
    return [
      inflar(caixa, RESPIRO_POPUP),
      inflar(pil, RESPIRO_POPUP),
      inflar(emDoca ? regiaoAnuncioSala(doca) : caixa, RESPIRO_ANUNCIO),
    ];
  }, [g.top, g.left, g.right, g.bottom, gd.top, gd.left, gd.right, gd.bottom, pil.top, pil.left, pil.right, pil.bottom, emDoca]);
  const mostrarAlgo = fase !== 'conectando';
  const { ocupadas, medido } = useRegioesOcupadas(regioes, mostrarAlgo);
  // páginas sem a barra de anúncio do celular (`rodapePermitido`: ficha do candidato — a página inteira é foto, nome,
  // número e votos de um candidato — e a /anuncie): o canto conta sempre como ocupado (pílula vira alça; pedir o chat
  // abre a folha central) e a sala nunca leva anúncio
  const paginaToda = !rodapePermitido(pathname);
  const ocupada = ocupadas[0] || paginaToda;
  const pilulaOcupada = ocupadas[1] || paginaToda;
  const anuncioOcupado = ocupadas[2] || paginaToda;
  const msDesde = interacao ? Date.now() - interacao : Number.POSITIVE_INFINITY;
  // doca: não cobre nada (a página vai para o lado), fica como a pessoa escolheu
  const aberto =
    mostrarAlgo && medido && !central && (emDoca ? pref === 'aberto' : popupAberto({ pref, ocupada, interagindo: dentro, msDesdeInteracao: msDesde }));
  // fim da folga depois da interação: redesenha para reavaliar
  useEffect(() => {
    if (!ocupada || dentro || !interacao) return;
    const resta = GRACA_INTERACAO_MS - (Date.now() - interacao);
    if (resta <= 0) return;
    const t = window.setTimeout(() => redesenhar((n) => n + 1), resta + 30);
    return () => window.clearTimeout(t);
  }, [ocupada, dentro, interacao]);

  // doca aberta: a página ganha o espaço à direita (AppShell: conteúdo, rodapé e faixa do topo usam --sala-lateral)
  const docaAberta = emDoca && aberto;
  useEffect(() => {
    const html = document.documentElement;
    if (docaAberta) html.style.setProperty('--sala-lateral', `${LARGURA_DOCA}px`);
    else html.style.removeProperty('--sala-lateral');
    return () => {
      html.style.removeProperty('--sala-lateral');
    };
  }, [docaAberta]);
  // virou doca com a folha central aberta (janela alargada): a doca assume
  useEffect(() => {
    if (emDoca) setCentral(null);
  }, [emDoca]);

  // a moderação fechou a sala com o chat aberto: ele fica (só leitura) até a pessoa minimizar
  const faseAntes = useRef(fase);
  useEffect(() => {
    if (faseAntes.current === 'aberta' && fase === 'fechada' && (aberto || central)) setSessao({ pref: 'aberto', aberta: false });
    faseAntes.current = fase;
  }, [fase, aberto, central]);

  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLElement>(null);
  const ocupadaRef = useRef(ocupada);
  ocupadaRef.current = ocupada;
  const emDocaRef = useRef(emDoca);
  emDocaRef.current = emDoca;
  const escolher = useCallback(
    (p: PrefPopup) => {
      setSessao({ pref: p, aberta });
      if (aberta) {
        gravarPref(p);
        setGuardada(p);
      }
    },
    [aberta],
  );
  const abrir = useCallback(() => {
    escolher('aberto');
    // pediu o chat: conta como uso (sinal de presença)
    marcarParticipacao();
    if (!emDocaRef.current && ondeAbrir(ocupadaRef.current) === 'central') {
      // folha de lado a lado do conteúdo; quando dá, o bloco de cima (placar, retratos) rola para ficar inteiro acima dela
      setCentral({ altura: prepararFolhaCentral() });
      return;
    }
    mexeu();
    // quem abriu pelo teclado/clique continua no chat: o foco vai para o popup (não para o campo — o teclado não abre
    // sozinho e o foco no campo seguraria o popup aberto)
    window.setTimeout(() => caixa.current?.focus({ preventScroll: true }), 60);
  }, [escolher, mexeu]);
  const minimizar = useCallback(() => {
    escolher('minimizado');
    setCentral(null);
    setDentro(false);
    window.setTimeout(() => botao.current?.focus({ preventScroll: true }), 60);
  }, [escolher]);
  useEffect(() => aoPedirAbrirChat(abrir), [abrir]);

  if (!mostrarAlgo || !medido) return null;
  // fechada depois da hora marcada: só fica quem estava com o chat aberto
  if (fase === 'fechada' && !aberto && !central) return null;

  const canto = 'bottom-5 min-[1440px]:bottom-6';
  return (
    <>
      <AnimatePresence initial={false}>
        {aberto || central ? null : pilulaOcupada ? (
          // perto de um bloco com candidato: a alça estreita na borda, NO MESMO CANTO da pílula (a entrada não pula)
          <Alca key="alca" fase={fase} novas={s.novas} onAbrir={abrir} botaoRef={botao} className={canto} />
        ) : (
          <Pilula key="pilula" fase={fase} novas={s.novas} onAbrir={abrir} botaoRef={botao} className={cn(canto, 'right-5 min-[1440px]:right-6')} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {aberto ? (
          emDoca ? (
            <CaixaDoca key="doca" ref={caixa} top={gd.top} altura={gd.bottom - gd.top} semAnuncio={anuncioOcupado} onMinimizar={minimizar} />
          ) : (
            <CaixaPopup
              key="popup"
              ref={caixa}
              g={g}
              grande={grande}
              semAnuncio={anuncioOcupado}
              onGrande={() => {
                setGrande((v) => !v);
                mexeu();
              }}
              onMinimizar={minimizar}
              onDentro={setDentro}
              onMexer={mexeu}
            />
          )
        ) : null}
      </AnimatePresence>
      <AnimatePresence>{central ? <Folha key="central" modo="central" altura={central.altura} pathname={pathname} onFechar={minimizar} /> : null}</AnimatePresence>
    </>
  );
}

interface PropsCaixa {
  g: ReturnType<typeof geometriaPopup>;
  grande: boolean;
  semAnuncio: boolean;
  onGrande: () => void;
  onMinimizar: () => void;
  onDentro: (v: boolean) => void;
  onMexer: () => void;
}

/** O popup aberto (sem modal: a página continua usável; Esc minimiza). */
function CaixaPopup({ g, grande, semAnuncio, onGrande, onMinimizar, onDentro, onMexer, ref }: PropsCaixa & { ref?: React.Ref<HTMLElement> }) {
  const mouse = useRef(false);
  const foco = useRef(false);
  const avisar = () => onDentro(mouse.current || foco.current);
  return (
    <motion.aside
      ref={ref}
      {...marca}
      {...usoDoChat}
      aria-label="Chat ao vivo"
      tabIndex={-1}
      // entrada leve (só opacidade e um deslocamento curto): sem escala nem largura/altura animadas ao mesmo tempo
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ width: g.largura, height: g.altura, right: g.margem, bottom: g.margem }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_28px_70px_-24px_rgb(0_0_0/0.6),0_6px_18px_-8px_rgb(0_0_0/0.25)] outline-none"
      onPointerEnter={() => {
        mouse.current = true;
        avisar();
      }}
      onPointerLeave={() => {
        mouse.current = false;
        avisar();
        onMexer();
      }}
      // digitando: foco num campo de texto do popup (o foco no próprio popup, ao abrir, não segura nada)
      onFocus={(e) => {
        foco.current = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
        if (foco.current) marcarParticipacao();
        avisar();
      }}
      onBlur={(e) => {
        const prox = e.relatedTarget as Node | null;
        foco.current = !!prox && e.currentTarget.contains(prox) && (prox instanceof HTMLInputElement || prox instanceof HTMLTextAreaElement);
        avisar();
        onMexer();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onMinimizar();
      }}
    >
      <Sala
        variante="painel"
        compacta={g.altura < 470}
        semAnuncio={semAnuncio}
        acoes={
          <>
            <BotaoAcao icone={grande ? 'recolher' : 'expandir'} rotulo={grande ? 'Diminuir o chat' : 'Aumentar o chat'} onClick={onGrande} />
            <BotaoAcao icone="menos" rotulo="Minimizar o chat" onClick={onMinimizar} />
          </>
        }
      />
    </motion.aside>
  );
}

/** A doca (janela larga): coluna à direita, abaixo do cabeçalho, ao lado da página (que ganha o espaço). Esc minimiza. */
function CaixaDoca({ top, altura, semAnuncio, onMinimizar, ref }: { top: number; altura: number; semAnuncio: boolean; onMinimizar: () => void; ref?: React.Ref<HTMLElement> }) {
  return (
    <motion.aside
      ref={ref}
      {...marca}
      {...usoDoChat}
      aria-label="Chat ao vivo"
      tabIndex={-1}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ top, width: LARGURA_DOCA }}
      className="fixed bottom-0 right-0 z-30 flex flex-col overflow-hidden border-l border-line bg-surface outline-none"
      onFocus={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) marcarParticipacao();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onMinimizar();
      }}
    >
      <Sala variante="painel" compacta={altura < 470} semAnuncio={semAnuncio} acoes={<BotaoAcao icone="menos" rotulo="Minimizar o chat" onClick={onMinimizar} />} />
    </motion.aside>
  );
}

// ---- celular e tablet ----------------------------------------------------------------------------------------------------

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

/** Rola a página `delta` px (suave), dentro dos limites; ignora ajustes pequenos. Devolve o quanto rolou de fato. */
function rolarPor(delta: number): number {
  if (Math.abs(delta) < 24) return 0;
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const alvo = Math.min(max, Math.max(0, window.scrollY + delta));
  const real = alvo - window.scrollY;
  window.scrollTo({ top: alvo, behavior: 'smooth' });
  return real;
}

/**
 * Páginas da apuração: com o placar na tela, rola para ele ficar logo abaixo do cabeçalho (à vista acima da folha).
 * Devolve onde a linha dos percentuais do placar TERMINA depois da rolagem (px do topo da janela), para a folha começar
 * logo abaixo dela; null sem placar na tela. `ateBarra` (computador, folha central): até o fim da barra dos dois lados
 * e dos percentuais embaixo dela (no layout de duas colunas a folha central cruzaria o rótulo de um lado só).
 */
function mostrarPlacarAcima(ateBarra = false): number | null {
  const el =
    document.querySelector<HTMLElement>('#conteudo section[aria-label^="Placar"][data-sem-anuncio-fixo]') ??
    document.querySelector<HTMLElement>('#conteudo [data-sem-anuncio-fixo]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= window.innerHeight) return null; // fora da tela: não mexe na leitura
  const cab = alturaCabecalho();
  const votos = el.querySelector<HTMLElement>('[data-placar-votos]');
  let delta = r.top - cab - 8;
  // celular baixo (375×667): com o placar inteiro à vista, sobrariam ~320 px para a folha (1 mensagem). Aí o topo do
  // placar (título da disputa) passa por baixo do cabeçalho e ficam à vista as fotos, os nomes e os % — a folha ganha
  // ~60 px de lista
  const lados = el.querySelector<HTMLElement>('[data-placar-lados]');
  if (votos && lados && window.innerHeight - (votos.getBoundingClientRect().top - delta) < 360) {
    delta = lados.getBoundingClientRect().top - cab - 8;
  }
  delta = rolarPor(delta);
  const barra = ateBarra ? lados?.nextElementSibling : null;
  if (barra) return barra.getBoundingClientRect().bottom - delta + 10;
  // a linha "N votos" vem 8 px abaixo dos percentuais: a folha começa 2 px acima dela (os % ficam inteiros)
  if (!votos) return null;
  return votos.getBoundingClientRect().top - delta - 2;
}

/** O bloco marcado mais de cima que aparece entre `topo` e o pé da tela (onde a folha vai abrir), ou null. */
function blocoOndeAbre(topo: number): HTMLElement | null {
  const alto = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>('#conteudo [data-sem-anuncio-fixo]')) {
    if (el.closest(`[${ATRIBUTO_CHAT}]`)) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > topo && r.top < alto) return el;
  }
  return null;
}

/**
 * Prepara a folha central (computador com o canto ocupado; tablet) e devolve a altura dela:
 *  - apuração com o placar na tela: o placar rola para o topo e a folha começa no fim da barra dos dois lados;
 *  - outro bloco marcado onde a folha vai abrir (o topo da apuração antes das 17h, com os retratos; o placar da home):
 *    se ele cabe INTEIRO acima de uma folha de pelo menos 280 px, rola para ficar logo abaixo do cabeçalho e a folha
 *    começa depois dele;
 *  - senão, a folha (de lado a lado do conteúdo) cobre a parte de baixo dos DOIS lados por igual.
 * Altura: na apuração até 44% da tela (440 px); nas outras páginas, até 60% (600 px).
 */
function prepararFolhaCentral(): string {
  const alto = window.innerHeight;
  const apuracao = !!paginaDaSala(window.location.pathname);
  const max = apuracao ? Math.min(Math.round(alto * 0.44), 440) : Math.min(Math.round(alto * 0.6), 600);
  const min = Math.min(max, 280);
  const placar = document.querySelector<HTMLElement>('#conteudo section[aria-label^="Placar"][data-sem-anuncio-fixo]');
  if (apuracao && placar?.querySelector('[data-placar-lados]')) {
    const r = placar.getBoundingClientRect();
    if (r.bottom > 0 && r.top < alto) {
      const limite = mostrarPlacarAcima(true);
      if (limite !== null) return `${Math.max(min, Math.min(max, Math.round(alto - limite)))}px`;
    }
  }
  const bloco = blocoOndeAbre(alto - max);
  if (bloco) {
    const r = bloco.getBoundingClientRect();
    const cab = alturaCabecalho();
    const sobra = alto - (cab + 8 + r.height + 12);
    if (sobra >= min) {
      rolarPor(r.top - cab - 8);
      return `${Math.min(max, Math.round(sobra))}px`;
    }
  }
  return `${max}px`;
}

/** Há barra de anúncio no rodapé do celular (reservada: `--anuncio-rodape-h`, BarraRodape)? */
function useBarraAnuncio(): boolean {
  const ler = () => (parseFloat(document.documentElement.style.getPropertyValue('--anuncio-rodape-h')) || 0) > 0;
  const [tem, setTem] = useState(ler);
  useEffect(() => {
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => setTem(ler())) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    setTem(ler());
    return () => mo?.disconnect();
  }, []);
  return tem;
}

function ChatCelular({ pathname }: { pathname: string }) {
  const [aberto, setAberto] = useState(false);
  const [altura, setAltura] = useState<string | null>(null);
  const s = useSala(aberto ? null : 'fundo');
  const fase = useFase(s);
  const tablet = useMediaQuery('(min-width: 768px)', false);
  const barraAnuncio = useBarraAnuncio();
  // pílula só com a sala aberta, a faixa de baixo livre e SEM a barra de anúncio do rodapé (pílula + barra + tab bar
  // empilhadas tomavam ~1/4 da tela); antes da abertura, no demo, perto de placar/mapa e com a barra: a alça
  const livre = useFaixaLivre(fase === 'aberta' && !aberto && !barraAnuncio, pathname);
  // ficha do candidato e /anuncie (sem a barra de anúncio, `rodapePermitido`): só a alça
  const pilula = fase === 'aberta' && livre && !barraAnuncio && rodapePermitido(pathname);

  const abrir = useCallback(() => {
    // tablet: folha central, de lado a lado (uma folha presa à direita cobriria um lado só do placar)
    if (window.innerWidth >= 768) setAltura(prepararFolhaCentral());
    // celular, apuração: a folha começa logo abaixo dos % do placar (rolado para ficar à vista); nas outras páginas, alta
    else if (paginaDaSala(window.location.pathname)) setAltura(`${alturaFolhaCelular(window.innerHeight, mostrarPlacarAcima())}px`);
    else setAltura(null);
    setAberto(true);
  }, []);
  useEffect(() => aoPedirAbrirChat(abrir), [abrir]);
  // trocou de página com a folha aberta (link dentro dela, voltar): a folha continua; fora da apuração, alta
  useEffect(() => {
    if (!paginaDaSala(pathname) && window.innerWidth < 768) setAltura(null);
  }, [pathname]);

  const visivel = fase === 'aberta' || fase === 'antes' || fase === 'demo';
  if (!visivel && !aberto) return null;
  // acima da tab bar (60) e da barra de anúncio quando ela existe; tablet (sem tab bar): no canto
  const pe = 'bottom-[calc(72px+var(--anuncio-rodape-h,0px)+env(safe-area-inset-bottom))] md:bottom-5';
  return (
    <>
      <AnimatePresence initial={false}>
        {!aberto && visivel ? (
          pilula ? (
            <Pilula key="pilula" fase={fase} novas={s.novas} onAbrir={abrir} discreta={!tablet} className={cn('segue-tab right-3 md:right-5 [html[data-teclado]_&]:hidden', pe)} />
          ) : (
            <Alca key="alca" fase={fase} novas={s.novas} onAbrir={abrir} className={cn('segue-tab [html[data-teclado]_&]:hidden', pe)} />
          )
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {aberto ? <Folha key="folha" modo={tablet ? 'central' : 'celular'} altura={altura} pathname={pathname} onFechar={() => setAberto(false)} /> : null}
      </AnimatePresence>
    </>
  );
}

/**
 * Sem a faixa "Sala oferecida por" na folha? Na ficha do candidato e na /anuncie, nunca há anúncio. A folha CENTRAL
 * (computador e tablet) fica no meio da página: sem anúncio quando algum bloco com candidato está a menos de 48 px dela
 * (medida pela altura real da folha; antes de medir, sem anúncio). A folha do celular (largura toda, placar acima,
 * anúncio no pé) segue a regra de sempre.
 */
function useFolhaSemAnuncio(ref: React.RefObject<HTMLDivElement | null>, central: boolean, pathname: string): boolean {
  const [alto, setAlto] = useState(0);
  const [janela, setJanela] = useState(() => ({ largura: window.innerWidth, altura: window.innerHeight }));
  useEffect(() => {
    const el = ref.current;
    if (!central || !el) return;
    const medir = () => {
      setAlto(el.offsetHeight);
      setJanela((a) => (a.largura === window.innerWidth && a.altura === window.innerHeight ? a : { largura: window.innerWidth, altura: window.innerHeight }));
    };
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    window.addEventListener('resize', medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [central, ref]);
  const lado = Math.max(16, janela.largura / 2 - LARGURA_FOLHA_CENTRAL / 2);
  const topo = janela.altura - alto;
  const regioes = useMemo(
    () => [inflar({ top: topo, bottom: janela.altura, left: lado, right: janela.largura - lado }, RESPIRO_ANUNCIO)],
    [topo, lado, janela.altura, janela.largura],
  );
  const { ocupadas, medido } = useRegioesOcupadas(regioes, central && alto > 0);
  if (!rodapePermitido(pathname)) return true;
  if (!central) return false;
  return alto <= 0 || !medido || ocupadas[0];
}

/** Largura máxima da faixa da folha central (a mesma do conteúdo largo do site): cobre os dois lados por igual. */
const LARGURA_FOLHA_CENTRAL = 1440;

/**
 * Folha inferior NÃO modal. Celular: alta, ou, nas páginas da apuração, com a altura medida na abertura (do fim dos %
 * do placar ao pé da tela). Central (tablet; computador com o canto ocupado): DE LADO A LADO do conteúdo (até 1440 px,
 * centralizada como o site) — cobre a parte de baixo dos dois lados por igual —, com a conversa numa coluna de até
 * 880 px no meio. Fecha (minimiza) pelo botão, arrastando para baixo ou com Esc; arrastar para cima (ou o botão) aumenta.
 */
function Folha({ onFechar, altura: alturaMedida, modo, pathname }: { onFechar: () => void; altura: string | null; modo: 'celular' | 'central'; pathname: string }) {
  const [cheia, setCheia] = useState(false);
  const drag = useDragControls();
  const reduzir = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const teclado = useTeclado(true);
  const central = modo === 'central';
  const semAnuncio = useFolhaSemAnuncio(ref, central, pathname);

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

  const altura = cheia ? 'calc(100dvh - var(--app-header-h, 56px) - 8px)' : (alturaMedida ?? ALTURA_FOLHA_ALTA);
  // com o teclado aberto, a folha sobe e cabe na parte visível
  const estilo = teclado.inset
    ? { bottom: teclado.inset, height: Math.max(260, Math.min(teclado.altura - 8, cheia ? teclado.altura - 8 : teclado.altura * 0.9)) }
    : { bottom: 0, height: altura };
  // a folha alta do celular já ocupa quase a tela: sem o botão de aumentar
  const podeAumentar = cheia || modo !== 'celular' || alturaMedida !== null;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      ref={ref}
      {...marca}
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
        'fixed flex flex-col overflow-hidden border-line bg-surface shadow-[0_-24px_60px_-20px_rgb(0_0_0/0.65)] outline-none',
        central
          ? // de lado a lado do conteúdo (até 1440 px, centralizada como o site): cobre os DOIS lados por igual
            'inset-x-[max(16px,calc(50vw-720px))] z-40 rounded-t-3xl border-x border-t'
          : 'inset-x-0 z-[60] rounded-t-3xl border-t',
      )}
    >
      <div className={cn('flex min-h-0 flex-1 flex-col', central && 'mx-auto w-full max-w-[880px]')}>
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
          semAnuncio={semAnuncio}
          acoes={
            <>
              {podeAumentar ? (
                <BotaoAcao rotulo={cheia ? 'Diminuir o chat' : 'Aumentar o chat'} onClick={() => setCheia((c) => !c)}>
                  <Icon name="chevron-cima" size={17} className={cn('transition-transform duration-200', cheia && 'rotate-180')} />
                </BotaoAcao>
              ) : null}
              <BotaoAcao icone={central ? 'menos' : 'fechar'} rotulo={central ? 'Minimizar o chat' : 'Fechar o chat'} onClick={onFechar} />
            </>
          }
        />
      </div>
    </motion.div>,
    document.body,
  );
}
