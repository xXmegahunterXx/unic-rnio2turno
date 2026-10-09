/**
 * Quiz do Teste Cego: uma rodada por tema, duas propostas SEM qualquer pista de autoria (só o texto e o
 * tema; rótulos neutros "Opção 1/2"; mesma tipografia, tamanho e cor para as duas). A cor de destaque da
 * escolha é a da marca — nunca a de um candidato, para não denunciar o autor.
 *
 * Interação: tocar/clicar no cartão, arrastá-lo para a direita (celular) ou teclado
 * (← / 1 = opção 1, → / 2 = opção 2, N = nenhuma, T = tanto faz, Backspace = voltar).
 * As respostas ficam só na memória da aba (o pai decide se grava em sessionStorage).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion';
import { rodadas, type Proposta } from '@/app/content/propostas';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { NENHUMA, N_RODADAS, TANTO_FAZ, type Escolha } from './codigo';
import { vazio, type Parcial } from './sessao';
import { TemaEmoji } from './TemaEmoji';

export interface QuizProps {
  seed: number;
  inicial?: Parcial;
  inicialIdx?: number;
  onProgresso?: (respostas: Parcial, idx: number) => void;
  onConcluir: (respostas: Escolha[]) => void;
  /** Chamado ao "voltar" na 1ª rodada. */
  onSair?: () => void;
  className?: string;
}

const ATRASO_ACENDE = 460;

export function Quiz({ seed, inicial, inicialIdx = 0, onProgresso, onConcluir, onSair, className }: QuizProps) {
  const rs = useMemo(() => rodadas(seed), [seed]);
  const [respostas, setRespostas] = useState<Parcial>(() => (inicial && inicial.length === N_RODADAS ? inicial.slice() : vazio()));
  const [idx, setIdx] = useState(() => Math.max(0, Math.min(N_RODADAS - 1, inicialIdx)));
  const [dir, setDir] = useState(1);
  const [acendendo, setAcendendo] = useState<Escolha | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const topo = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeiraPintura = useRef(true);
  const reduzir = useReducedMotion();

  const rodada = rs[idx];
  const atual = acendendo ?? respostas[idx];
  const feitas = respostas.filter((r) => r !== null).length;

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    onProgresso?.(respostas, idx);
  }, [respostas, idx, onProgresso]);

  // A cada tema novo: foco no título (leitores de tela) e, se o topo do quiz saiu da tela, volta para ele.
  useEffect(() => {
    if (primeiraPintura.current) {
      primeiraPintura.current = false;
      return;
    }
    titulo.current?.focus({ preventScroll: true });
    const el = topo.current;
    if (!el) return;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 64;
    const y = el.getBoundingClientRect().top;
    if (y < headerH || y > window.innerHeight * 0.4) {
      window.scrollTo({ top: window.scrollY + y - headerH - 12, behavior: reduzir ? 'auto' : 'smooth' });
    }
  }, [idx, reduzir]);

  const irPara = useCallback(
    (i: number) => {
      if (i === idx || i < 0 || i >= N_RODADAS) return;
      window.clearTimeout(timer.current);
      setAcendendo(null);
      setDir(i > idx ? 1 : -1);
      setIdx(i);
    },
    [idx],
  );

  const escolher = useCallback(
    (e: Escolha) => {
      if (acendendo !== null) return;
      const novas = respostas.slice();
      novas[idx] = e;
      setRespostas(novas);
      setAcendendo(e);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => {
          setAcendendo(null);
          const pendente = novas.findIndex((r) => r === null);
          if (idx < N_RODADAS - 1) {
            setDir(1);
            setIdx(idx + 1);
          } else if (pendente === -1) {
            onConcluir(novas as Escolha[]);
          } else {
            setDir(-1);
            setIdx(pendente);
          }
        },
        reduzir ? 140 : ATRASO_ACENDE,
      );
    },
    [acendendo, respostas, idx, onConcluir, reduzir],
  );

  const voltar = useCallback(() => {
    if (idx === 0) onSair?.();
    else irPara(idx - 1);
  }, [idx, irPara, onSair]);

  // Teclado
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = ev.key.toLowerCase();
      let acao: (() => void) | null = null;
      if (k === 'arrowleft' || k === '1') acao = () => escolher(0);
      else if (k === 'arrowright' || k === '2') acao = () => escolher(1);
      else if (k === 'n') acao = () => escolher(NENHUMA);
      else if (k === 't') acao = () => escolher(TANTO_FAZ);
      else if (k === 'backspace') acao = voltar;
      if (acao) {
        ev.preventDefault();
        acao();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escolher, voltar]);

  const deslocar = reduzir ? 0 : 44;

  return (
    <div ref={topo} className={cn('mx-auto w-full max-w-[1040px] scroll-mt-24', className)}>
      <Progresso idx={idx} respostas={respostas} feitas={feitas} onIr={irPara} onVoltar={voltar} primeira={idx === 0} />

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Tema {idx + 1} de {N_RODADAS}: {rodada.tema.rotulo}.
      </p>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={idx}
          custom={dir}
          initial={{ opacity: 0, x: dir * deslocar }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -dir * deslocar }}
          transition={{ duration: 0.26, ease: [0.22, 0.9, 0.24, 1] }}
          className="pt-4 sm:pt-9"
        >
          <header className="flex items-center gap-3 sm:gap-4">
            <TemaEmoji tema={rodada.tema} size="lg" className="max-sm:h-12 max-sm:w-12 max-sm:rounded-[14px] max-sm:text-[24px]" />
            <div className="min-w-0">
              <p className="num text-[11.5px] font-semibold uppercase tracking-[0.16em] text-fg-muted">
                Tema {idx + 1} de {N_RODADAS}
              </p>
              <h2
                ref={titulo}
                tabIndex={-1}
                className="mt-1 text-balance font-display text-[25px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg outline-none sm:text-[38px]"
              >
                {rodada.tema.rotulo}
              </h2>
            </div>
          </header>
          <p className="mt-2.5 text-[14.5px] text-fg-muted sm:mt-4 sm:text-[16px]">Qual destas propostas você prefere?</p>

          <div className="mt-3 grid grid-cols-1 items-stretch gap-1.5 sm:mt-6 sm:gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4">
            {rodada.opcoes.map((p, pos) => (
              <FragmentoOpcao key={p.id} pos={pos as 0 | 1}>
                <CartaoProposta
                  proposta={p}
                  pos={pos as 0 | 1}
                  estado={atual === null ? 'livre' : atual === pos ? 'escolhida' : 'apagada'}
                  acendendo={acendendo === pos}
                  bloqueado={acendendo !== null}
                  onEscolher={() => escolher(pos as Escolha)}
                />
              </FragmentoOpcao>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:justify-center sm:gap-3">
            <BotaoAlternativo ativo={atual === NENHUMA} acendendo={acendendo === NENHUMA} tecla="N" onClick={() => escolher(NENHUMA)} bloqueado={acendendo !== null}>
              Nenhuma das duas
            </BotaoAlternativo>
            <BotaoAlternativo ativo={atual === TANTO_FAZ} acendendo={acendendo === TANTO_FAZ} tecla="T" onClick={() => escolher(TANTO_FAZ)} bloqueado={acendendo !== null}>
              Tanto faz
            </BotaoAlternativo>
          </div>
        </motion.div>
      </AnimatePresence>

      <p className="mt-6 hidden items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-fg-subtle md:flex">
        <span>
          <Kbd>←</Kbd> <Kbd>→</Kbd> escolhem
        </span>
        <span>
          <Kbd>N</Kbd> nenhuma
        </span>
        <span>
          <Kbd>T</Kbd> tanto faz
        </span>
        <span>
          <Kbd>⌫</Kbd> volta
        </span>
      </p>
      <p className="mt-5 text-center text-[12.5px] text-fg-subtle md:hidden">Toque para escolher — ou arraste a proposta para a direita.</p>
    </div>
  );
}

/** Insere o separador "ou" entre as duas opções. */
function FragmentoOpcao({ pos, children }: { pos: 0 | 1; children: React.ReactNode }) {
  if (pos === 0) return <>{children}</>;
  return (
    <>
      <div aria-hidden className="flex items-center justify-center md:flex-col">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[rgb(var(--line)/calc(var(--line-alpha)*2))] md:h-auto md:w-px md:bg-gradient-to-b" />
        <span className="mx-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fg-muted md:mx-0 md:my-3 md:h-10 md:w-10 md:text-[12px]">
          ou
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[rgb(var(--line)/calc(var(--line-alpha)*2))] md:h-auto md:w-px md:bg-gradient-to-t" />
      </div>
      {children}
    </>
  );
}

type EstadoCartao = 'livre' | 'escolhida' | 'apagada';

function CartaoProposta({
  proposta,
  pos,
  estado,
  acendendo,
  bloqueado,
  onEscolher,
}: {
  proposta: Proposta;
  pos: 0 | 1;
  estado: EstadoCartao;
  acendendo: boolean;
  bloqueado: boolean;
  onEscolher: () => void;
}) {
  const reduzir = useReducedMotion();
  const x = useMotionValue(0);
  const girar = useTransform(x, [-200, 0, 220], [-2, 0, 4]);
  const selo = useTransform(x, [24, 120], [0, 1]);
  const arrastou = useRef(false);
  const escolhida = estado === 'escolhida';

  function fimArraste(_: unknown, info: PanInfo) {
    if (!bloqueado && (info.offset.x > 110 || (info.offset.x > 40 && info.velocity.x > 600))) onEscolher();
    window.setTimeout(() => (arrastou.current = false), 80);
  }

  return (
    <motion.button
      type="button"
      onClick={() => {
        if (arrastou.current || bloqueado) return;
        onEscolher();
      }}
      aria-pressed={escolhida}
      initial={reduzir ? false : { opacity: 0, y: 12 }}
      animate={{
        opacity: estado === 'apagada' ? 0.42 : 1,
        y: 0,
        scale: acendendo ? 1.015 : estado === 'apagada' ? 0.985 : 1,
      }}
      transition={{ duration: 0.3, delay: reduzir ? 0 : pos * 0.06, ease: [0.22, 0.9, 0.24, 1] }}
      style={{ x, rotate: girar, touchAction: 'pan-y' }}
      drag={bloqueado ? false : 'x'}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.06, right: 0.75 }}
      dragSnapToOrigin
      onDragStart={() => (arrastou.current = true)}
      onDragEnd={fimArraste}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[22px] border p-4 text-left shadow-card outline-none sm:min-h-[260px] sm:rounded-3xl sm:p-7',
        'cursor-pointer select-none transition-[border-color,background-color,box-shadow] duration-200',
        'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        escolhida
          ? 'border-brand/60 bg-surface shadow-glow'
          : 'border-line bg-surface hover:border-brand/35 hover:bg-[color:color-mix(in_srgb,rgb(var(--surface))_94%,rgb(var(--brand)))]',
      )}
    >
      {/* brilho da marca quando escolhida (nunca a cor de um candidato) */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/[0.16] via-brand/[0.05] to-transparent transition-opacity duration-300',
          escolhida ? 'opacity-100' : 'opacity-0',
        )}
      />
      {acendendo && !reduzir ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl bg-brand/25"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      ) : null}
      {/* selo do arraste */}
      <motion.span
        aria-hidden
        style={{ opacity: selo }}
        className="pointer-events-none absolute right-4 top-4 inline-flex -rotate-6 items-center gap-1.5 rounded-full border-2 border-brand bg-brand/15 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-fg"
      >
        <Icon name="check" size={14} strokeWidth={2.5} />
        Prefiro esta
      </motion.span>

      <span className="relative flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Opção {pos + 1}</span>
        <Kbd className="hidden md:inline-flex">{pos === 0 ? '←' : '→'}</Kbd>
      </span>

      <span aria-hidden className="relative mt-3 hidden h-8 font-display text-[56px] leading-none text-brand-fg/50 sm:block">
        “
      </span>
      <span className="relative mt-2 block text-pretty font-display text-[17.5px] font-medium leading-[1.33] tracking-[-0.01em] text-fg sm:mt-1 sm:text-[23px] sm:leading-[1.3]">
        {proposta.texto}
      </span>

      <span className="relative mt-auto flex pt-3.5 sm:pt-7">
        <span
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold transition-all duration-200 sm:h-11 sm:px-5 sm:text-[14px]',
            escolhida
              ? 'bg-brand-cta text-brand-ink shadow-[0_8px_24px_-10px_rgb(var(--brand)/0.8)]'
              : 'border border-line bg-surface-2 text-fg group-hover:border-brand/40 group-hover:text-fg',
          )}
        >
          {escolhida ? (
            <motion.span initial={reduzir ? false : { scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }} className="inline-flex">
              <Icon name="check" size={17} strokeWidth={2.5} />
            </motion.span>
          ) : (
            <Icon name="check" size={17} className="text-fg-subtle" />
          )}
          {escolhida ? 'Sua escolha' : 'Prefiro esta'}
        </span>
      </span>
    </motion.button>
  );
}

function BotaoAlternativo({
  ativo,
  acendendo,
  bloqueado,
  tecla,
  onClick,
  children,
}: {
  ativo: boolean;
  acendendo: boolean;
  bloqueado: boolean;
  tecla: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={ativo}
      onClick={() => !bloqueado && onClick()}
      animate={{ scale: acendendo ? 1.03 : 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-[14px] font-semibold transition-colors duration-150 sm:min-w-[200px] sm:px-4 sm:text-[14.5px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        ativo ? 'border-brand/60 bg-brand/15 text-fg' : 'border-line bg-surface text-fg-muted hover:border-line/[2.5] hover:bg-surface-2 hover:text-fg',
      )}
    >
      {ativo ? <Icon name="check" size={16} strokeWidth={2.5} className="text-brand-fg" /> : null}
      {children}
      <Kbd className="ml-1 hidden md:inline-flex">{tecla}</Kbd>
    </motion.button>
  );
}

function Progresso({
  idx,
  respostas,
  feitas,
  onIr,
  onVoltar,
  primeira,
}: {
  idx: number;
  respostas: Parcial;
  feitas: number;
  onIr: (i: number) => void;
  onVoltar: () => void;
  primeira: boolean;
}) {
  // Pode pular para qualquer tema já respondido ou para o primeiro ainda sem resposta.
  const fronteira = respostas.findIndex((r) => r === null);
  return (
    <div className="flex items-center gap-2.5 sm:gap-4">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Icon name="seta-esquerda" size={18} />
        <span>{primeira ? 'Sair' : 'Voltar'}</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
          <span className="num font-medium text-fg-muted">
            <span className="font-semibold text-fg">{feitas}</span> de {N_RODADAS} respondidas
          </span>
          <span className="inline-flex items-center gap-1.5 text-fg-subtle">
            <Icon name="olho-fechado" size={14} />
            <span className="hidden sm:inline">Respostas só no seu aparelho</span>
            <span className="sm:hidden">Só no seu aparelho</span>
          </span>
        </div>
        <ol className="flex gap-1" aria-label="Progresso do teste">
          {respostas.map((r, i) => {
            const pode = r !== null || i === fronteira || i === idx;
            const atual = i === idx;
            return (
              <li key={i} className="flex-1">
                <button
                  type="button"
                  disabled={!pode}
                  onClick={() => onIr(i)}
                  aria-current={atual ? 'step' : undefined}
                  aria-label={`Tema ${i + 1}${r !== null ? ' (respondido)' : ''}`}
                  className="group block w-full py-1.5 disabled:cursor-default"
                >
                  <span
                    className={cn(
                      'block h-1.5 w-full rounded-full transition-colors duration-300',
                      atual ? 'bg-fg' : r !== null ? 'bg-brand group-hover:bg-brand-2' : 'bg-surface-3',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-sans text-[11.5px] font-semibold text-fg-muted shadow-[inset_0_-1px_0_0_rgb(var(--line)/calc(var(--line-alpha)*2))]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
