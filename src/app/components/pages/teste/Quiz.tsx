/**
 * Quiz do Teste Cego (formato v2): UMA afirmação por tela, em tipografia display, e a escala de concordância na ordem
 * de leitura — Discordo totalmente (esquerda) · Discordo · Neutro · Concordo · Concordo totalmente (direita) —, mais
 * "Pular" e o interruptor "Isso pesa mais para mim" (peso 2).
 *
 * Neutralidade: a escala usa só a cor da marca, com intensidade SIMÉTRICA em torno do "Neutro" (nada de
 * verde/vermelho, nada de cor de candidato). Antes da resposta aparecem só o texto, o tema e o contexto
 * opcional — nunca posição, fonte ou autoria.
 *
 * Interação: tocar/clicar (avanço automático suave, com um toque tátil sutil quando o aparelho permite e a pessoa
 * não pediu movimento reduzido); teclado 1–5 da esquerda para a direita (1 = discordo totalmente, 5 = concordo
 * totalmente), P pula, I alterna "pesa mais", ← volta, → avança (se já respondida). Não há gesto de arrastar: com
 * "concordo" à direita, arrastar para a direita para VOLTAR confundiria (o gesto lembra "curtir").
 *
 * A barra de progresso é "grudada" logo abaixo do cabeçalho do site (top = --app-header-h, medido pelo AppShell),
 * então nunca fica escondida sob ele quando a página rola — inclusive no iPhone e dentro de iframes.
 * As respostas ficam só na memória da aba (o pai decide se grava em sessionStorage).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { TEMA_POR_ID, type Resposta, type ValorLikert } from '@/app/content/afirmacoes';
import { cn } from '@/app/lib/cn';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { vibrar } from './haptica';
import type { MapaRespostas } from './sessao';
import { OPCOES_ESCALA, ordemQuiz, segundosRestantes, textoRestante } from './sintonia';

export interface EstadoQuiz {
  respostas: MapaRespostas;
  importantes: string[];
  idx: number;
}

export interface QuizProps {
  seed: number;
  /** Só estas afirmações (modo rápido / duelo de quem fez o modo rápido). Padrão: as 24. */
  ids?: readonly string[] | null;
  inicial?: EstadoQuiz | null;
  onProgresso?: (estado: EstadoQuiz) => void;
  onConcluir: (respostas: MapaRespostas, importantes: string[]) => void;
  /** Chamado ao "voltar" na 1ª afirmação. */
  onSair?: () => void;
  /** Selo pequeno na barra de progresso (ex.: "Modo rápido", "Duelo"). */
  selo?: ReactNode;
  className?: string;
}

const ATRASO_AVANCO = 420;

export function Quiz({ seed, ids, inicial, onProgresso, onConcluir, onSair, selo, className }: QuizProps) {
  const ordem = useMemo(() => ordemQuiz(seed, ids), [seed, ids]);
  const total = ordem.length;
  const [respostas, setRespostas] = useState<MapaRespostas>(() => ({ ...(inicial?.respostas ?? {}) }));
  const [importantes, setImportantes] = useState<string[]>(() => [...(inicial?.importantes ?? [])]);
  const [idx, setIdx] = useState(() => {
    const i = Math.max(0, Math.min(total - 1, inicial?.idx ?? 0));
    // Retomada: se a posição salva já tem resposta, vai para a primeira ainda sem resposta.
    if (inicial && inicial.respostas[ordem[i]?.id] !== undefined) {
      const livre = ordem.findIndex((a) => inicial.respostas[a.id] === undefined);
      if (livre !== -1) return livre;
    }
    return i;
  });
  const [dir, setDir] = useState(1);
  const [acendendo, setAcendendo] = useState<Resposta | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const titulo = useRef<HTMLHeadingElement>(null);
  const topo = useRef<HTMLDivElement>(null);
  const primeiraPintura = useRef(true);
  const ultimoToque = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const intervalos = useRef<number[]>([]);
  const reduzir = useReducedMotion();

  const atual = ordem[idx];
  const tema = TEMA_POR_ID[atual.tema];
  const resposta = acendendo ?? respostas[atual.id];
  const importante = importantes.includes(atual.id);
  const feitas = ordem.reduce((n, a) => n + (respostas[a.id] !== undefined ? 1 : 0), 0);
  const completo = feitas === total;
  const restante = textoRestante(segundosRestantes(total - feitas, intervalos.current), true);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    onProgresso?.({ respostas, importantes, idx });
  }, [respostas, importantes, idx, onProgresso]);

  // A cada afirmação nova: foco no texto (leitores de tela) e, se o topo do quiz saiu da tela, volta para ele.
  useEffect(() => {
    if (primeiraPintura.current) {
      primeiraPintura.current = false;
      return;
    }
    titulo.current?.focus({ preventScroll: true });
    const el = topo.current;
    if (!el) return;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 56;
    const y = el.getBoundingClientRect().top;
    if (y < headerH - 1 || y > window.innerHeight * 0.4) {
      window.scrollTo({ top: Math.max(0, window.scrollY + y - headerH - 4), behavior: reduzir ? 'auto' : 'smooth' });
    }
  }, [idx, reduzir]);

  const irPara = useCallback(
    (i: number) => {
      if (i === idx || i < 0 || i >= total) return;
      window.clearTimeout(timer.current);
      setAcendendo(null);
      setDir(i > idx ? 1 : -1);
      setIdx(i);
    },
    [idx, total],
  );

  const concluir = useCallback(() => onConcluir(respostas, importantes), [onConcluir, respostas, importantes]);

  const responder = useCallback(
    (r: Resposta) => {
      if (acendendo !== null) return;
      const id = atual.id;
      const agora = performance.now();
      if (respostas[id] === undefined) intervalos.current = [...intervalos.current.slice(-9), agora - ultimoToque.current];
      ultimoToque.current = agora;
      const novas = { ...respostas, [id]: r };
      const imps = r === 'pular' ? importantes.filter((x) => x !== id) : importantes;
      setRespostas(novas);
      setImportantes(imps);
      setAcendendo(r);
      vibrar(r === 'pular' ? 6 : 10);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => {
          setAcendendo(null);
          // Próxima sem resposta depois desta (ou a primeira sem resposta antes dela).
          const depois = ordem.findIndex((a, i) => i > idx && novas[a.id] === undefined);
          const qualquer = depois !== -1 ? depois : ordem.findIndex((a) => novas[a.id] === undefined);
          if (qualquer !== -1) {
            setDir(qualquer > idx ? 1 : -1);
            setIdx(qualquer);
          } else if (idx === total - 1) {
            onConcluir(novas, imps);
          } else {
            // Revisão (tudo respondido): segue em ordem; o botão "Ver resultado" fica à mão.
            setDir(1);
            setIdx(idx + 1);
          }
        },
        reduzir ? 140 : ATRASO_AVANCO,
      );
    },
    [acendendo, atual.id, respostas, importantes, ordem, idx, total, onConcluir, reduzir],
  );

  const alternarImportante = useCallback(() => {
    if (respostas[atual.id] === 'pular') return;
    vibrar(6);
    setImportantes((l) => (l.includes(atual.id) ? l.filter((x) => x !== atual.id) : [...l, atual.id]));
  }, [atual.id, respostas]);

  const voltar = useCallback(() => {
    if (idx === 0) onSair?.();
    else irPara(idx - 1);
  }, [idx, irPara, onSair]);

  const podeAvancar = respostas[atual.id] !== undefined && idx < total - 1;
  const avancar = useCallback(() => {
    if (podeAvancar) irPara(idx + 1);
  }, [podeAvancar, irPara, idx]);

  // Teclado
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = ev.key.toLowerCase();
      let acao: (() => void) | null = null;
      if (/^[1-5]$/.test(k)) acao = () => responder(OPCOES_ESCALA[Number(k) - 1].valor);
      else if (k === 'p') acao = () => responder('pular');
      else if (k === 'i') acao = alternarImportante;
      else if (k === 'arrowleft' || k === 'backspace') acao = voltar;
      else if (k === 'arrowright') acao = avancar;
      if (acao) {
        ev.preventDefault();
        acao();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [responder, alternarImportante, voltar, avancar]);

  const deslocar = reduzir ? 0 : 36;

  return (
    <div
      ref={topo}
      className={cn(
        'mx-auto flex w-full max-w-[1040px] flex-col',
        // Celular: ocupa a altura útil (entre o header e a tab bar), com a escala embaixo, perto do polegar.
        'min-h-[calc(100dvh-var(--app-header-h,56px)-64px-env(safe-area-inset-bottom)-16px)] md:min-h-[calc(100dvh-var(--app-header-h,64px)-48px)]',
        className,
      )}
    >
      <Progresso
        ordem={ordem.map((a) => a.id)}
        idx={idx}
        respostas={respostas}
        feitas={feitas}
        completo={completo}
        restante={restante}
        selo={selo}
        onIr={irPara}
        onVoltar={voltar}
        onConcluir={concluir}
      />

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Afirmação {idx + 1} de {total}. Tema: {tema.rotulo}.
      </p>

      {/* Afirmação */}
      <div className="relative flex flex-1 flex-col justify-center py-5 sm:py-10">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[60%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.07] blur-[70px]" />
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={atual.id}
            custom={dir}
            initial={{ opacity: 0, x: dir * deslocar }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -dir * deslocar }}
            transition={{ duration: 0.26, ease: [0.22, 0.9, 0.24, 1] }}
            className="mx-auto w-full max-w-[940px] md:text-center"
          >
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-fg-muted md:justify-center">
              <span aria-hidden className="text-[15px] leading-none">
                {tema.emoji}
              </span>
              {tema.rotulo}
            </p>
            <h2
              ref={titulo}
              tabIndex={-1}
              className="mt-3 text-balance font-display text-[clamp(26px,7.4vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-fg outline-none sm:mt-4 sm:text-[44px] sm:leading-[1.06] lg:text-[54px] lg:leading-[1.04]"
            >
              {atual.texto}
            </h2>
            {atual.contexto ? (
              <p className="mt-4 flex max-w-[44rem] items-start gap-2 text-pretty text-[14px] leading-snug text-fg-muted sm:mt-6 sm:text-[15.5px] md:mx-auto md:justify-center">
                <Icon name="info" size={16} className="mt-[2px] shrink-0 text-fg-subtle" />
                <span>{atual.contexto}</span>
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Resposta */}
      <div className="pb-1">
        <EscalaConcordancia key={atual.id} valor={resposta} acendendo={acendendo} onEscolher={responder} />

        <div className="mx-auto mt-5 flex w-full max-w-[760px] items-center justify-between gap-3 sm:mt-7">
          <InterruptorPeso ligado={importante} desabilitado={respostas[atual.id] === 'pular'} onAlternar={alternarImportante} />
          <button
            type="button"
            onClick={() => responder('pular')}
            aria-pressed={resposta === 'pular'}
            aria-keyshortcuts="P"
            title="Não sei ou prefiro não responder: fica fora da conta"
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[14px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              resposta === 'pular' ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {resposta === 'pular' ? <Icon name="check" size={16} strokeWidth={2.5} /> : null}
            Pular
            <span className="sr-only"> (não sei ou prefiro não responder; fica fora da conta)</span>
            <Kbd oculto className="hidden md:inline-flex">P</Kbd>
            {resposta !== 'pular' ? <Icon name="chevron-direita" size={16} className="-ml-0.5 md:hidden" /> : null}
          </button>
        </div>

        <p className="mt-5 hidden items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-fg-subtle md:flex">
          <span>
            <Kbd>1</Kbd>–<Kbd>5</Kbd> respondem, da esquerda para a direita
          </span>
          <span>
            <Kbd>P</Kbd> pula
          </span>
          <span>
            <Kbd>I</Kbd> pesa mais
          </span>
          <span>
            <Kbd>←</Kbd> <Kbd>→</Kbd> afirmação anterior / seguinte
          </span>
        </p>
        {idx === 0 && feitas === 0 ? (
          <p className="mt-3 text-center text-[12px] text-fg-subtle md:hidden">Toque numa opção: a próxima afirmação vem sozinha. Dá para voltar quando quiser.</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Escala ────────────────────────────────────────────────────────────────────

/** Intensidade simétrica: extremos mais fortes, "Neutro" sem cor. Classes por extenso (Tailwind). */
const ESTILO_NIVEL: Record<0 | 1 | 2, { tam: string; idle: string }> = {
  2: {
    tam: 'h-[56px] w-[56px] sm:h-[68px] sm:w-[68px]',
    idle: 'border-brand/70 bg-brand/[0.12] group-hover:bg-brand/25',
  },
  1: {
    tam: 'h-[46px] w-[46px] sm:h-[56px] sm:w-[56px]',
    idle: 'border-brand/45 bg-brand/[0.06] group-hover:bg-brand/20',
  },
  0: {
    tam: 'h-[38px] w-[38px] sm:h-[46px] sm:w-[46px]',
    idle: 'border-fg-subtle/50 bg-surface-2 group-hover:border-fg-subtle group-hover:bg-surface-3',
  },
};

const TAM_COMPACTO: Record<0 | 1 | 2, string> = { 2: 'h-[48px] w-[48px]', 1: 'h-[40px] w-[40px]', 0: 'h-[32px] w-[32px]' };

/**
 * A escala de 5 pontos (da esquerda para a direita: discordo totalmente → concordo totalmente). Cada coluna inteira é
 * o alvo de toque (≈ 72 × 90 px no celular). Usada no quiz e na afirmação de entrada da abertura.
 */
export function EscalaConcordancia({
  valor,
  acendendo,
  onEscolher,
  compacta,
  className,
}: {
  valor: Resposta | undefined | null;
  acendendo: Resposta | null;
  onEscolher: (r: ValorLikert) => void;
  /** Versão menor (cartão de entrada). */
  compacta?: boolean;
  className?: string;
}) {
  const reduzir = useReducedMotion();
  return (
    <div role="group" aria-label="Quanto você concorda com a afirmação?" className={cn('relative mx-auto w-full max-w-[760px]', className)}>
      {/* trilho que liga os cinco pontos (do centro do 1º ao centro do 5º) */}
      <div aria-hidden className={cn('absolute left-[10%] right-[10%] h-[2px] rounded-full bg-line/[2]', compacta ? 'top-[25px]' : 'top-[28px] sm:top-[34px]')} />
      <ul className="relative grid grid-cols-5">
        {OPCOES_ESCALA.map((o, i) => {
          const nivel = Math.abs(o.valor) as 0 | 1 | 2;
          const est = ESTILO_NIVEL[nivel];
          const marcado = valor === o.valor;
          const outro = valor !== undefined && valor !== null && !marcado;
          return (
            <li key={o.valor} className="flex justify-center">
              <button
                type="button"
                onClick={() => onEscolher(o.valor)}
                aria-pressed={marcado}
                aria-keyshortcuts={compacta ? undefined : String(i + 1)}
                className="group flex w-full touch-manipulation flex-col items-center rounded-2xl pb-1 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <span className={cn('flex items-center justify-center', compacta ? 'h-[50px]' : 'h-[56px] sm:h-[68px]')}>
                  <motion.span
                    animate={{ scale: acendendo === o.valor && !reduzir ? [1, 1.18, 1.06] : marcado ? 1.06 : 1 }}
                    whileTap={reduzir ? undefined : { scale: 0.92 }}
                    transition={acendendo === o.valor ? { duration: 0.34, times: [0, 0.5, 1] } : { type: 'spring', stiffness: 500, damping: 30 }}
                    className={cn('relative inline-flex items-center justify-center rounded-full bg-bg', compacta ? TAM_COMPACTO[nivel] : est.tam)}
                  >
                    {/* fundo opaco (bg-bg) por baixo da tinta translúcida: o trilho não aparece dentro do círculo */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-0 rounded-full border-2 transition-[background-color,border-color,opacity] duration-200',
                        marcado ? 'border-transparent bg-brand-cta shadow-glow' : est.idle,
                        outro && 'opacity-55',
                      )}
                    />
                    {marcado ? (
                      <motion.span
                        initial={reduzir ? false : { scale: 0.3, rotate: -25 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                        className="relative inline-flex text-brand-ink"
                      >
                        <Icon name="check" size={nivel === 0 ? 18 : 22} strokeWidth={2.75} />
                      </motion.span>
                    ) : null}
                    {acendendo === o.valor && !reduzir ? (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full border-2 border-brand"
                        initial={{ scale: 1, opacity: 0.8 }}
                        animate={{ scale: 1.75, opacity: 0 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    ) : null}
                  </motion.span>
                </span>
                <span
                  className={cn(
                    'mt-2 max-w-[9ch] text-balance text-center leading-[1.2] transition-colors sm:max-w-none',
                    compacta ? 'text-[11.5px]' : 'text-[12px] sm:mt-3 sm:text-[13.5px]',
                    marcado ? 'font-semibold text-fg' : 'font-medium text-fg-muted group-hover:text-fg',
                  )}
                >
                  {o.rotulo}
                </span>
                {!compacta ? <Kbd oculto className="mt-2 hidden md:inline-flex">{i + 1}</Kbd> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Isso pesa mais para mim": interruptor (role="switch") em forma de pílula. */
function InterruptorPeso({ ligado, desabilitado, onAlternar }: { ligado: boolean; desabilitado: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-keyshortcuts="I"
      disabled={desabilitado}
      onClick={onAlternar}
      title="Afirmações marcadas contam em dobro no cálculo"
      className={cn(
        'group inline-flex h-11 min-w-0 items-center gap-2.5 rounded-xl border px-3 text-left text-[13.5px] font-medium transition-colors sm:text-[14px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-45',
        ligado ? 'border-brand/50 bg-brand/[0.12] text-fg' : 'border-line bg-surface text-fg-muted hover:border-line/[2.5] hover:text-fg',
      )}
    >
      <span aria-hidden className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-[2px] transition-colors', ligado ? 'bg-brand' : 'bg-surface-3 ring-1 ring-inset ring-line/[1.5]')}>
        <motion.span
          className="block h-4 w-4 rounded-full bg-brand-ink shadow-[0_1px_3px_rgb(0_0_0/0.35)]"
          animate={{ x: ligado ? 16 : 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 36 }}
        />
      </span>
      <span className="truncate">Isso pesa mais para mim</span>
      <Kbd oculto className="hidden md:inline-flex">I</Kbd>
    </button>
  );
}

// ── Progresso ─────────────────────────────────────────────────────────────────

function Progresso({
  ordem,
  idx,
  respostas,
  feitas,
  completo,
  restante,
  selo,
  onIr,
  onVoltar,
  onConcluir,
}: {
  ordem: string[];
  idx: number;
  respostas: MapaRespostas;
  feitas: number;
  completo: boolean;
  restante: string;
  selo?: ReactNode;
  onIr: (i: number) => void;
  onVoltar: () => void;
  onConcluir: () => void;
}) {
  // Pode ir para qualquer afirmação já respondida ou para a primeira ainda sem resposta.
  const fronteira = ordem.findIndex((id) => respostas[id] === undefined);
  return (
    // Grudada logo abaixo do header do site: no celular ocupa a largura toda (vidro), no desktop vira uma pílula.
    <div className="sticky z-30 -mx-4 sm:-mx-6 md:mx-0" style={{ top: 'var(--app-header-h, 56px)' }} data-quiz-progresso>
      <div className="flex items-center gap-2 border-b border-line bg-bg/[0.96] px-4 py-2 backdrop-blur-xl backdrop-saturate-150 sm:gap-4 sm:px-6 md:mt-1 md:rounded-2xl md:border md:bg-surface/[0.94] md:px-4 md:shadow-card">
        <button
          type="button"
          onClick={onVoltar}
          className="-ml-2 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name="seta-esquerda" size={18} />
          <span>{idx === 0 ? 'Sair' : 'Voltar'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
            <span className="num min-w-0 truncate font-medium text-fg-muted">
              <span className="font-semibold text-fg">{idx + 1}</span> de {ordem.length}
              {restante && !completo ? <span className="text-fg-subtle"> · {restante}</span> : null}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-fg-subtle">
              {selo ? <span className="hidden min-[400px]:inline">{selo}</span> : null}
              <Icon name="olho-fechado" size={14} />
              <span className="hidden sm:inline">Respostas só no seu aparelho</span>
              <span className="max-[359px]:hidden sm:hidden">Só no seu aparelho</span>
            </span>
          </div>
          <ol className="flex gap-[3px]" aria-label={`Progresso: ${feitas} de ${ordem.length} respondidas`}>
            {ordem.map((id, i) => {
              const r = respostas[id];
              const pode = r !== undefined || i === fronteira || i === idx;
              const ehAtual = i === idx;
              return (
                <li key={id} className="flex-1">
                  <button
                    type="button"
                    disabled={!pode}
                    onClick={() => onIr(i)}
                    aria-current={ehAtual ? 'step' : undefined}
                    aria-label={`Afirmação ${i + 1}${r === 'pular' ? ' (pulada)' : r !== undefined ? ' (respondida)' : ''}`}
                    className="group block w-full py-1.5 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        'block h-1.5 w-full rounded-full transition-colors duration-300',
                        ehAtual ? 'bg-fg' : r === 'pular' ? 'bg-fg-subtle/45' : r !== undefined ? 'bg-brand group-hover:bg-brand-2' : 'bg-surface-3',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        {completo ? (
          <Button variant="primary" size="sm" iconRight="seta" onClick={onConcluir} className="shrink-0">
            <span className="hidden sm:inline">Ver resultado</span>
            <span className="sm:hidden">Resultado</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Tecla de atalho. Dentro de botão, passe `oculto`: o atalho já vai em `aria-keyshortcuts` e não entra no nome. */
export function Kbd({ children, className, oculto }: { children: ReactNode; className?: string; oculto?: boolean }) {
  return (
    <kbd
      aria-hidden={oculto || undefined}
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-sans text-[11.5px] font-semibold text-fg-muted shadow-[inset_0_-1px_0_0_rgb(var(--line)/calc(var(--line-alpha)*2))]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
