/**
 * Chat ao vivo em TODAS as páginas do site, estilo popup de atendimento: montado pelo AppShell num chunk próprio,
 * carregado depois da 1ª pintura quando o navegador fica ocioso (nunca no JS inicial), fora de /ao-vivo e do Teste Cego
 * (chat/rotas.ts). Estado e consultas em sala.ts (um só por aba; minimizado consulta bem mais devagar, aba escondida não
 * consulta, sala fechada consulta raramente e acorda na hora da abertura).
 *
 *  - Computador largo (≥ 1760 px): DOCA — coluna à direita, abaixo do cabeçalho, que EMPURRA a página (`--sala-lateral`):
 *    sempre aberta com a sala aberta, sem cobrir nada (`modoComputador`).
 *  - Computador (1024–1759 px): popup no canto inferior direito (~360×540; até 420 de altura em janela de até 800 px;
 *    "Aumentar" = mais largo e com a altura toda abaixo do cabeçalho), ABERTO por padrão com a sala aberta, em todas as
 *    páginas com chat. Recolhido — pela escolha "Minimizar" (lembrada neste navegador, só a feita com a sala aberta) ou
 *    sozinho perto de candidato — vira a ABA VERTICAL "Chat ao vivo" na margem direita (ponto ao vivo e contador de
 *    novas), dentro dos 32 px que o conteúdo deixa livres: não cobre nada. Com a sala fechada antes das 17h de 25/10,
 *    nasce minimizado (a aba diz "abre domingo, 17h").
 *  - Celular e tablet (< 1024 px): escondido — alça estreita na borda (ou, sem barra de anúncio no rodapé e com a faixa
 *    de baixo livre, a pílula discreta acima da tab bar), com o contador de novas; o toque abre a folha inferior (nas
 *    páginas da apuração, com o placar à vista acima), que fecha pelo botão, arrastando para baixo ou com Esc. No tablet
 *    a folha vai de lado a lado do conteúdo.
 *
 * Regra de ouro (ARCHITECTURE §1.5): o popup nunca fica por cima de número, nome ou foto de candidato — nem encostado
 * (respiro de 16 px). O popup aberto se recolhe sozinho para a aba quando a área dele chega perto de um bloco com
 * candidato ou de um anúncio nativo real (regiao.ts) e volta sozinho quando ela fica livre — com histerese de 8 px e
 * meio segundo de espera, sem pisca-pisca —, salvo com o mouse em cima e por 3 s depois da última mexida (mouse saiu,
 * tecla) — e só enquanto a página não rolar: rolou ou trocou de página com a área ocupada, recolhe na hora (o foco no
 * campo não segura nada; o rascunho fica guardado) (`popupAberto`). A roda do mouse sobre o popup não rola a página por
 * baixo. Recolher sozinho é instantâneo: a peça some direto no elemento no quadro em que a área fica ocupada, antes da
 * pintura (`aoOcupar`), e a área cresce na direção da rolagem (`antecipar`). A régua das peças fixas é a largura útil,
 * sem a barra de rolagem (`reguaFixa`). Vitrine e prévias de anúncio (/anuncie, painel) não recolhem o popup. A faixa "Sala oferecida
 * por" some com um bloco com candidato a menos de 48 px (popup, doca e folha central) e nunca aparece na ficha do
 * candidato nem na /anuncie. Pedir o chat (aba, chamada da página) com o canto ocupado abre a folha CENTRAL embaixo, de
 * lado a lado do conteúdo — cobre os DOIS lados por igual, nunca um só — e, quando dá, rola o bloco de cima (placar,
 * retratos) para ficar inteiro à vista acima dela (`prepararFolhaCentral`).
 *
 * Privacidade: o popup que abre sozinho só LÊ a sala; o sinal de presença e o token nascem quando a pessoa usa o chat
 * (`marcarParticipacao`, sala.ts).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo, type Variants } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { useFaixaLivre } from '@/app/components/anuncios/faixaLivre';
import { rodapePermitido } from '@/app/components/anuncios/nucleo';
import { fmtInt } from '@/shared/format';
import {
  ALTURA_FOLHA_ALTA,
  ESPERA_REABRIR_MS,
  GRACA_INTERACAO_MS,
  HISTERESE_POPUP,
  LARGURA_DOCA,
  RESPIRO_ANUNCIO,
  RESPIRO_POPUP,
  alturaFolhaCelular,
  cantoSempreOcupado,
  faseChat,
  geometriaDoca,
  geometriaPopup,
  inflar,
  larguraAba,
  lerPrefGuardada,
  modoComputador,
  ondeAbrir,
  paginaDaSala,
  popupAberto,
  prefEfetiva,
  regiaoAnuncioSala,
  regiaoPilula,
  reguaFixa,
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

/** Pílula "Chat ao vivo · …" (celular e tablet: acima da tab bar / no canto; doca minimizada: canto inferior direito). */
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
 * Alça estreita na borda direita (14 px no celular: cabe na margem de 16 px da página, fora dos números; 16 px na doca
 * minimizada, ≥ 1760 px), com o rótulo vertical "Chat" e o ponto de novas. Celular: acima da tab bar; doca minimizada:
 * no canto de baixo, no MESMO lugar da pílula, quando ela ficaria perto de um bloco com candidato. No popup do
 * computador (1024–1759 px), a forma recolhida é a `AbaChat`.
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

/**
 * Computador (1024–1759 px): a forma recolhida do popup — pela escolha "Minimizar" ou sozinho perto de candidato. ABA
 * VERTICAL presa à borda direita, no canto de baixo (onde o popup fica), DENTRO da margem que o conteúdo deixa livre
 * (`larguraAba`: 28 px numa margem de 32; 32 px a partir de 48), então não cobre nada e não precisa fugir de bloco
 * nenhum. "Chat ao vivo" em texto vertical (de baixo para cima, como as abas de canto), o ponto ao vivo e, com
 * mensagens novas, o contador; antes da abertura, "abre domingo, 17h". Sem a área de toque ampliada (`.toque`): ela
 * passaria da margem.
 */
function AbaChat({
  fase,
  novas,
  onAbrir,
  largura,
  baixo,
  botaoRef,
}: {
  fase: FaseChat;
  novas: number;
  onAbrir: () => void;
  largura: number;
  baixo: number;
  botaoRef?: React.Ref<HTMLButtonElement>;
}) {
  const aberta = fase === 'aberta';
  // sala aberta: as novas vão no contador (no topo da aba); fechada/demo: "abre domingo, 17h" / "prévia" no texto
  const detalhe = aberta ? null : detalhePilula(fase, novas);
  const reduzir = useReducedMotion();
  return (
    <div {...marca} data-chat-forma="aba" className="fixed right-0 z-40" style={{ bottom: baixo }}>
      <motion.button
        ref={botaoRef}
        type="button"
        onClick={onAbrir}
        initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduzir ? { opacity: 0 } : { opacity: 0, x: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        aria-label={rotuloAbrir(fase, novas)}
        title="Abrir o chat ao vivo"
        style={{ width: largura }}
        className="group relative flex flex-col items-center gap-2 rounded-l-xl border border-r-0 border-line bg-surface pb-2.5 pt-3 text-fg shadow-[-10px_10px_28px_-14px_rgb(0_0_0/0.55),0_2px_6px_-3px_rgb(0_0_0/0.2)] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        {/* filete da marca na beira de dentro: a aba se destaca do fundo nos dois temas sem cor de candidato */}
        <span aria-hidden className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', aberta ? 'bg-brand' : 'bg-fg-subtle/60')} />
        {aberta ? (
          novas > 0 ? (
            <span aria-hidden className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-bold leading-none text-brand-ink">
              {novas > 99 ? '99+' : fmtInt(novas)}
            </span>
          ) : (
            <LiveDot size={7} className="my-[5px]" />
          )
        ) : null}
        <span aria-hidden className="rotate-180 whitespace-nowrap text-[12.5px] font-semibold leading-none tracking-[0.01em] [writing-mode:vertical-rl]">
          Chat ao vivo
          {detalhe ? (
            <span className="font-medium text-fg-muted">
              <span className="me-1 ms-1 text-fg-subtle">·</span>
              <span className="num">{detalhe}</span>
            </span>
          ) : null}
        </span>
        <span className={cn('transition-transform duration-200 group-hover:-translate-x-px', aberta ? 'text-brand-fg' : 'text-fg-muted')}>
          <IconeChat size={17} />
        </span>
      </motion.button>
    </div>
  );
}

// ---- computador ---------------------------------------------------------------------------------------------------------

function useJanela(): { largura: number; altura: number; cabecalho: number; util: number } {
  const ler = () => ({
    largura: window.innerWidth,
    altura: window.innerHeight,
    cabecalho: alturaCabecalho(),
    // sem a barra de rolagem: a régua do `position: fixed` e da margem do conteúdo (largura da aba)
    util: document.documentElement.clientWidth || window.innerWidth,
  });
  const [j, setJ] = useState(ler);
  useEffect(() => {
    let q = 0;
    const f = () => {
      if (!q)
        q = window.requestAnimationFrame(() => {
          q = 0;
          const n = ler();
          setJ((a) => (a.largura === n.largura && a.altura === n.altura && a.cabecalho === n.cabecalho && a.util === n.util ? a : n));
        });
    };
    window.addEventListener('resize', f);
    // o cabeçalho muda de altura (faixa de simulação, conexão instável): o AppShell atualiza --app-header-h
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(f) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    // a barra de rolagem clássica aparece/some (página curta ↔ longa) sem `resize`: a largura útil muda
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(f) : null;
    ro?.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', f);
      mo?.disconnect();
      ro?.disconnect();
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

/**
 * Popup (1024–1759): histerese e espera para reabrir e a antecipação na rolagem (nucleo.ts, regiao.ts). Constante fora
 * do componente: a vigilância não reinicia.
 */
const OPCOES_POPUP = { histerese: HISTERESE_POPUP, esperaMs: ESPERA_REABRIR_MS, antecipar: true } as const;

/**
 * A roda do mouse sobre o popup rola a lista dele enquanto ela ainda puder rolar nessa direção — nunca a página por
 * baixo (o cabeçalho, o campo e o rodapé do popup não rolam nada; no fim da lista, para ali). Sem isso, a página andava
 * por baixo do popup com o mouse em cima dele e o popup ficava aberto sobre o placar.
 */
function rolaPorDentro(e: WheelEvent, raiz: HTMLElement): boolean {
  const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
  const d = vertical ? e.deltaY : e.deltaX;
  if (!d) return true;
  for (let el = e.target instanceof Element ? e.target : null; el && el !== raiz; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    const ov = vertical ? cs.overflowY : cs.overflowX;
    if (ov !== 'auto' && ov !== 'scroll') continue;
    const pos = vertical ? el.scrollTop : el.scrollLeft;
    const max = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    if (max > 1 && (d > 0 ? pos < max - 1 : pos > 0)) return true;
  }
  return false;
}

/**
 * Esconde a peça já, direto no elemento (antes da próxima pintura); o React desmonta em seguida. `display: none`: o
 * framer-motion reescreve opacidade e transform a cada quadro em que desenha o elemento, nunca o `display`.
 */
function esconderJa(el: HTMLElement | null | undefined) {
  if (el && el.style.display !== 'none') el.style.display = 'none';
}
/** Desfaz `esconderJa` (o React decidiu manter a peça na tela). */
function mostrarDeNovo(el: HTMLElement | null | undefined) {
  if (el && el.style.display === 'none') el.style.display = '';
}

/** A faixa "Sala oferecida por" dentro do popup (OferecimentoChat). */
const SELETOR_FAIXA_ANUNCIO = 'aside[aria-label="Publicidade"]';

function ChatComputador({ pathname }: { pathname: string }) {
  const s = useSala('fundo');
  const fase = useFase(s);
  const aberta = fase === 'aberta';
  const janela = useJanela();
  // estilos de computador valem pela largura da JANELA (com a barra de rolagem); as peças fixas, pela largura útil
  const modo = modoComputador(janela.largura);
  const emDoca = modo === 'doca';
  const tela = reguaFixa(janela);
  const [grande, setGrande] = useState(false);
  const [guardada, setGuardada] = useState(lerPref);
  const [sessao, setSessao] = useState<{ pref: PrefPopup; aberta: boolean } | null>(null);
  const pref = prefEfetiva({ sessao, guardada, aberta });
  /** folha central embaixo: pedido para abrir com o canto em cima de candidato (`ondeAbrir`), até minimizar */
  const [central, setCentral] = useState<{ altura: string } | null>(null);

  // interação com o popup do canto: o MOUSE em cima (`dentro`; o foco no campo não segura nada), a última mexida (mouse
  // saiu, tecla, clique: a folga de 3 s) e, nos refs, quando a pessoa mexeu e quando a página rolou por último
  const [dentro, setDentro] = useState(false);
  const [interacao, setInteracao] = useState(0);
  const [, redesenhar] = useState(0);
  const ultimaInteracao = useRef(0);
  const ultimaRolagem = useRef(0);
  const mexeu = useCallback(() => {
    const t = Date.now();
    ultimaInteracao.current = t;
    setInteracao(t);
  }, []);
  const mouseDentro = useCallback((v: boolean) => {
    ultimaInteracao.current = Date.now();
    setDentro(v);
  }, []);

  const g = geometriaPopup(tela, janela.cabecalho, grande);
  const gd = geometriaDoca(tela, janela.cabecalho);
  const pil = regiaoPilula(tela);
  // áreas vigiadas: [0] o popup (com respiro), [1] a pílula da doca minimizada (com respiro), [2] a faixa do anúncio
  // (respiro de 48 px: o popup inteiro; na doca, a faixa do topo dela — a página fica ao lado, nunca embaixo). A aba do
  // popup recolhido (1024–1759) fica na margem lateral (não cobre nada): não é vigiada.
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

  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLElement>(null);
  const emDocaRef = useRef(emDoca);
  emDocaRef.current = emDoca;
  const dentroRef = useRef(dentro);
  dentroRef.current = dentro;
  const interacaoRef = useRef(interacao);
  interacaoRef.current = interacao;
  /** o popup do canto continua aberto com a área ocupada (exceção de interação, `popupAberto`)? */
  const seguraAberto = useCallback(
    () =>
      popupAberto({
        pref: 'aberto',
        ocupada: true,
        interagindo: dentroRef.current,
        msDesdeInteracao: interacaoRef.current ? Date.now() - interacaoRef.current : Number.POSITIVE_INFINITY,
        paginaRolou: ultimaRolagem.current > ultimaInteracao.current,
      }),
    [],
  );
  // a área passou a ocupada (regiao.ts, dentro do quadro): esconde o popup — ou só a faixa do anúncio — direto no
  // elemento, antes da pintura; o React desmonta em seguida (sem a saída animada)
  const aoOcupar = useCallback(
    (i: number) => {
      if (emDocaRef.current) return;
      const el = caixa.current;
      if (!el) return;
      if (i === 0 && !seguraAberto()) esconderJa(el);
      if (i === 2) esconderJa(el.querySelector<HTMLElement>(SELETOR_FAIXA_ANUNCIO));
    },
    [seguraAberto],
  );
  // popup: ocupa na hora (e antes, rolando: a área cresce na direção da rolagem); libera com 8 px a mais de folga e
  // meio segundo depois (sem pisca-pisca na borda de um bloco). Troca de página: mede de novo antes de pintar. A doca
  // (≥ 1760) segue como antes
  const { ocupadas, medido, conferirAgora } = useRegioesOcupadas(regioes, mostrarAlgo, emDoca ? undefined : OPCOES_POPUP, { chave: pathname, aoOcupar });
  // páginas sem a barra de anúncio do celular (`rodapePermitido`: ficha do candidato e /anuncie): a sala nunca leva
  // anúncio. O canto do popup conta sempre como ocupado só na ficha do candidato (a página inteira é foto, nome, número e
  // votos de um candidato: pedir o chat abre a folha central); a /anuncie não — a vitrine é demonstração e pode ficar
  // sob o popup. Doca minimizada: a pílula vira a alça nas duas, como antes
  const semAnuncioNaPagina = !rodapePermitido(pathname);
  const ocupada = ocupadas[0] || cantoSempreOcupado(pathname);
  const pilulaOcupada = ocupadas[1] || semAnuncioNaPagina;
  const anuncioOcupado = ocupadas[2] || semAnuncioNaPagina;
  const msDesde = interacao ? Date.now() - interacao : Number.POSITIVE_INFINITY;
  // doca: não cobre nada (a página vai para o lado), fica como a pessoa escolheu
  const aberto =
    mostrarAlgo &&
    medido &&
    !central &&
    (emDoca
      ? pref === 'aberto'
      : popupAberto({ pref, ocupada, interagindo: dentro, msDesdeInteracao: msDesde, paginaRolou: ultimaRolagem.current > ultimaInteracao.current }));
  /** recolheu sozinho (candidato perto, página rolou ou trocou), não pela escolha da pessoa: some sem a saída animada */
  const saidaRapida = pref === 'aberto' && !central;
  const ocupadaRef = useRef(ocupada);
  ocupadaRef.current = ocupada;
  const popupVisivel = useRef(false);
  popupVisivel.current = aberto && !emDoca;
  // fim da folga depois da interação: redesenha para reavaliar
  useEffect(() => {
    if (!ocupada || dentro || !interacao) return;
    const resta = GRACA_INTERACAO_MS - (Date.now() - interacao);
    if (resta <= 0) return;
    const t = window.setTimeout(() => redesenhar((n) => n + 1), resta + 30);
    return () => window.clearTimeout(t);
  }, [ocupada, dentro, interacao]);
  // a página rolou: com a área ocupada, o popup aberto pela exceção de interação recolhe NA HORA (a pessoa voltou a ler
  // a página; o rascunho fica guardado — guardarRascunho, sala.ts). Na CAPTURA: roda antes da vigilância (regiao.ts),
  // que já encontra a rolagem registrada quando a área passa a ocupada neste mesmo evento
  useEffect(() => {
    if (emDoca) return;
    const f = (e: Event) => {
      // só a rolagem da PÁGINA (na captura chegam também as das listas — a do próprio chat, tabelas)
      if (e.target !== document && e.target !== document.documentElement) return;
      ultimaRolagem.current = Date.now();
      if (popupVisivel.current && ocupadaRef.current) {
        esconderJa(caixa.current);
        redesenhar((n) => n + 1);
      }
    };
    window.addEventListener('scroll', f, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', f, { capture: true });
  }, [emDoca]);
  // trocou de página: conta como a página ter andado (sem a exceção de interação sobre a página nova); a área é medida
  // de novo antes da 1ª pintura (regiao.ts, `chave`)
  const paginaAntes = useRef(pathname);
  useLayoutEffect(() => {
    if (paginaAntes.current === pathname) return;
    paginaAntes.current = pathname;
    ultimaRolagem.current = Date.now();
    if (popupVisivel.current && ocupadaRef.current) redesenhar((n) => n + 1);
  }, [pathname]);
  // o elemento do popup: visível quando aberto (pode ter sido escondido direto no elemento e o React decidiu mantê-lo);
  // escondido já ao recolher sozinho (a saída não fica nem um quadro sobre o bloco)
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el || emDoca) return;
    if (aberto) {
      mostrarDeNovo(el);
      if (!anuncioOcupado) mostrarDeNovo(el.querySelector<HTMLElement>(SELETOR_FAIXA_ANUNCIO));
    } else if (saidaRapida) esconderJa(el);
  });
  // o popup acabou de (re)abrir: confere a área de novo antes de ele ser pintado (a página pode ter andado desde a
  // decisão de liberar)
  const popupAntes = useRef(false);
  useLayoutEffect(() => {
    const agora = aberto && !emDoca;
    if (agora && !popupAntes.current) conferirAgora();
    popupAntes.current = agora;
  }, [aberto, emDoca, conferirAgora]);
  // roda do mouse sobre o popup: rola só a lista dele, nunca a página por baixo
  useEffect(() => {
    const el = caixa.current;
    if (!aberto || emDoca || !el) return;
    const f = (e: WheelEvent) => {
      if (!e.ctrlKey && !rolaPorDentro(e, el)) e.preventDefault();
    };
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, [aberto, emDoca]);

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
    // quem abriu pelo teclado/clique continua no chat: o foco vai para o popup (não para o campo — o teclado virtual
    // não abre sozinho)
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
        {aberto || central ? null : !emDoca ? (
          // popup minimizado pela pessoa ou recolhido perto de candidato: a MESMA aba, na margem direita, no canto do popup
          <AbaChat key="aba" fase={fase} novas={s.novas} onAbrir={abrir} botaoRef={botao} largura={larguraAba(janela.util)} baixo={g.margem} />
        ) : pilulaOcupada ? (
          // doca minimizada perto de um bloco com candidato: a alça estreita na borda, NO MESMO CANTO da pílula
          <Alca key="alca" fase={fase} novas={s.novas} onAbrir={abrir} botaoRef={botao} className={canto} />
        ) : (
          <Pilula key="pilula" fase={fase} novas={s.novas} onAbrir={abrir} botaoRef={botao} className={cn(canto, 'right-5 min-[1440px]:right-6')} />
        )}
      </AnimatePresence>
      <AnimatePresence custom={saidaRapida}>
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
              onDentro={mouseDentro}
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
  /** o mouse entrou (true) ou saiu (false) do popup */
  onDentro: (v: boolean) => void;
  /** a pessoa mexeu (mouse saiu, tecla, clique): renova a folga de 3 s */
  onMexer: () => void;
}

/**
 * Entrada leve (só opacidade e um deslocamento curto). Saída: "Minimizar" anima; recolher sozinho (`custom` = true,
 * vindo do AnimatePresence) some na hora — com a animação, o popup ficava ~180 ms por cima do bloco que chegava. Na
 * saída rápida o elemento já foi escondido direto no DOM (`esconderJa`) e o framer-motion não anima nada: só desmonta.
 */
const VARIANTES_POPUP: Variants = {
  fora: { opacity: 0, y: 12 },
  dentro: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  saida: (rapida: boolean) => (rapida ? { transition: { duration: 0 } } : { opacity: 0, y: 12, transition: { duration: 0.18, ease: 'easeOut' } }),
};

/** O popup aberto (sem modal: a página continua usável; Esc minimiza). */
function CaixaPopup({ g, grande, semAnuncio, onGrande, onMinimizar, onDentro, onMexer, ref }: PropsCaixa & { ref?: React.Ref<HTMLElement> }) {
  return (
    <motion.aside
      ref={ref}
      {...marca}
      {...usoDoChat}
      aria-label="Chat ao vivo"
      tabIndex={-1}
      variants={VARIANTES_POPUP}
      initial="fora"
      animate="dentro"
      exit="saida"
      style={{ width: g.largura, height: g.altura, right: g.margem, bottom: g.margem }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_28px_70px_-24px_rgb(0_0_0/0.6),0_6px_18px_-8px_rgb(0_0_0/0.25)] outline-none"
      onPointerEnter={() => onDentro(true)}
      onPointerLeave={() => {
        onDentro(false);
        onMexer();
      }}
      onPointerDown={() => {
        marcarParticipacao();
        onMexer();
      }}
      // foco num campo de texto: só marca o uso (presença). Não segura o popup aberto: digitar renova a folga de 3 s
      onFocus={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) marcarParticipacao();
      }}
      onKeyDown={(e) => {
        onMexer();
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
