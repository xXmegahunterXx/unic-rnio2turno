/**
 * O "momento da revelação" do resultado. Em três tempos:
 *  1. pronto      — os dois medidores ocultos ("?") e o botão "Revelar minha sintonia" (a pessoa decide a hora; quem
 *                   espia a tela por cima do ombro não vê nada antes do toque);
 *  2. analisando  — ~1,3 s: os anéis giram e as afirmações respondidas "acendem" uma a uma (é a comparação de verdade,
 *                   feita no aparelho; só dramatizada);
 *  3. revelado    — os DOIS medidores viram AO MESMO TEMPO (nada de um antes do outro), números rolam, anéis enchem e um
 *                   toque tátil sutil marca o momento.
 * Sempre na ordem da urna, mesma tipografia e o mesmo tamanho para os dois (neutralidade); cores só pelo slot.
 * Movimento reduzido: sem giro, sem rolagem; o toque revela na hora. Ao voltar ao mesmo resultado na mesma aba, já
 * abre revelado (guardamos só um resumo numérico do código em sessionStorage, nunca as respostas).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { AvatarCandidato } from './AvatarCandidato';
import { vibrar } from './haptica';

/** Atraso até a revelação automática (ms) — usado no Duelo. */
export const ATRASO_REVELAR = 650;
/** Duração da fase "analisando" (ms). */
export const DURACAO_ANALISE = 1300;

/** Revelação automática após um atraso (Duelo). */
export function useRevelado(atraso = ATRASO_REVELAR): boolean {
  const reduzir = useReducedMotion();
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRevelado(true), reduzir ? 0 : atraso);
    return () => window.clearTimeout(t);
  }, [atraso, reduzir]);
  return revelado;
}

export type FaseRevelacao = 'pronto' | 'analisando' | 'revelado';

/** Resumo numérico (FNV-1a) do código: marca "já revelado nesta aba" sem guardar as respostas. */
function marca(chave: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `sintonia:revelado:${(h >>> 0).toString(36)}`;
}
function jaRevelado(chave: string): boolean {
  try {
    return sessionStorage.getItem(marca(chave)) === '1';
  } catch {
    return false;
  }
}
function lembrarRevelado(chave: string) {
  try {
    sessionStorage.setItem(marca(chave), '1');
  } catch {
    /* sem armazenamento */
  }
}

/** Máquina de estados da revelação (por código de resultado). */
export function useRevelacao(chave: string) {
  const reduzir = useReducedMotion();
  const [fase, setFase] = useState<FaseRevelacao>(() => (jaRevelado(chave) ? 'revelado' : 'pronto'));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const revelar = useCallback(() => {
    if (fase !== 'pronto') return;
    lembrarRevelado(chave);
    if (reduzir) {
      setFase('revelado');
      return;
    }
    vibrar(8);
    setFase('analisando');
    timer.current = window.setTimeout(() => {
      setFase('revelado');
      vibrar([14, 70, 24]);
    }, DURACAO_ANALISE);
  }, [fase, chave, reduzir]);
  return { fase, revelar, revelado: fase === 'revelado', analisando: fase === 'analisando' };
}

/** As afirmações respondidas "acendendo" durante a análise (bolinhas neutras: nada das respostas aparece). */
export function TrilhaAnalise({ n, ativo, className }: { n: number; ativo: boolean; className?: string }) {
  const reduzir = useReducedMotion();
  const passo = DURACAO_ANALISE / 1000 / Math.max(1, n + 2);
  return (
    <ol aria-hidden className={cn('flex flex-wrap justify-center gap-1.5', className)}>
      {Array.from({ length: n }, (_, i) => (
        <motion.li
          key={i}
          className="h-2 w-2 rounded-full bg-surface-3 sm:h-2.5 sm:w-2.5"
          animate={ativo && !reduzir ? { backgroundColor: ['rgb(var(--surface-3))', 'rgb(var(--brand))'], scale: [1, 1.5, 1] } : undefined}
          transition={{ duration: 0.3, delay: i * passo, ease: 'easeOut' }}
          style={ativo ? undefined : { backgroundColor: 'rgb(var(--surface-3))' }}
        />
      ))}
    </ol>
  );
}

export function MedidorSintonia({
  candidato,
  foto,
  pct,
  consideradas,
  revelado,
  analisando,
  ordem = 0,
  tamanho = 'lg',
}: {
  candidato: Candidate;
  foto?: string;
  /** 0–100, ou null sem base de cálculo. */
  pct: number | null;
  /** Quantas afirmações entraram na conta deste candidato. */
  consideradas: number;
  revelado: boolean;
  /** Fase "analisando": anel girando. */
  analisando?: boolean;
  /** Atraso relativo (use 0 nos dois para revelar ao mesmo tempo). */
  ordem?: number;
  tamanho?: 'md' | 'lg';
}) {
  const s = corSlot(candidato.cor);
  const reduzir = useReducedMotion();
  const R = 52;
  const lg = tamanho === 'lg';
  const valor = pct ?? 0;
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className={cn('relative', lg ? 'h-[128px] w-[128px] sm:h-[176px] sm:w-[176px]' : 'h-[96px] w-[96px] sm:h-[112px] sm:w-[112px]')}>
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" className="stroke-surface-3" />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            // Antes da revelação o arco não existe: com pathLength 0 a ponta arredondada ainda desenhava um ponto na cor
            // do candidato (vermelho/azul diriam quem é quem). Cor e opacidade só depois do toque.
            className={revelado ? s.stroke : 'stroke-surface-3'}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: revelado && pct !== null ? Math.max(0.0001, valor / 100) : 0, opacity: revelado && pct !== null ? 1 : 0 }}
            transition={{ duration: reduzir ? 0 : 1.1, delay: reduzir ? 0 : 0.15 + ordem * 0.12, ease: [0.22, 0.9, 0.24, 1] }}
          />
        </svg>
        {analisando && !reduzir ? (
          <motion.svg
            viewBox="0 0 120 120"
            className="absolute inset-0 h-full w-full"
            aria-hidden
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: 1 }}
            transition={{ rotate: { duration: 0.9, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.2 } }}
          >
            {/* antes da revelação, nada na cor do candidato (vermelho/azul diriam quem é quem): anel na cor da marca */}
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray="70 400" className="stroke-brand" />
          </motion.svg>
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center [perspective:600px]">
          <AnimatePresence mode="wait" initial={false}>
            {revelado ? (
              <motion.span
                key="cand"
                initial={reduzir ? false : { rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.32, delay: ordem * 0.12, ease: 'easeOut' }}
              >
                <AvatarCandidato
                  candidato={candidato}
                  foto={foto}
                  size={lg ? 'xl' : 'lg'}
                  className={lg ? 'sm:h-[104px] sm:w-[104px] sm:text-[32px]' : ''}
                />
              </motion.span>
            ) : (
              <motion.span
                key="oculto"
                // Transições DENTRO de cada alvo: o elemento que sai guarda as props antigas (com o pulso infinito) e a
                // saída nunca terminaria — e o candidato nunca entraria (AnimatePresence mode="wait").
                exit={{ rotateY: 90, opacity: 0, scale: 1, transition: { duration: 0.22 } }}
                animate={analisando && !reduzir ? { scale: [1, 0.94, 1], transition: { duration: 0.6, repeat: Infinity } } : { scale: 1, transition: { duration: 0.2 } }}
                className={cn(
                  'inline-flex items-center justify-center rounded-full border border-dashed border-fg-subtle/60 bg-surface-2 font-display font-semibold text-fg-muted',
                  lg ? 'h-20 w-20 text-[30px] sm:h-[104px] sm:w-[104px] sm:text-[40px]' : 'h-14 w-14 text-[22px]',
                )}
              >
                ?
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      {pct === null && revelado ? (
        <span className={cn('mt-4 font-display font-semibold leading-none text-fg-subtle', lg ? 'text-[52px] sm:text-[76px]' : 'text-[38px] sm:text-[44px]')} aria-label={`Sem base de cálculo para ${candidato.nomeUrna}`}>
          —
        </span>
      ) : (
        <div className="relative mt-4">
          {/* Montado desde o início (valor 0, invisível) para os dígitos rolarem até o valor na revelação. */}
          <NumberRoll
            value={revelado ? valor : 0}
            format={(n) => fmtPct(n, 0)}
            smallChars="%"
            smallClassName="text-[0.45em] ml-[0.04em] font-semibold"
            ariaLabel={revelado ? `${fmtPct(valor, 0)} de sintonia com ${candidato.nomeUrna}` : 'Resultado oculto'}
            duration={1100}
            className={cn(
              'font-display font-semibold leading-none tracking-[-0.045em]',
              lg ? 'text-[52px] sm:text-[76px]' : 'text-[38px] sm:text-[44px]',
              revelado ? s.textDisplay : 'invisible',
            )}
          />
          {!revelado ? (
            <span
              aria-hidden
              className={cn(
                'absolute inset-0 flex items-center justify-center font-display font-semibold leading-none tracking-[-0.045em] text-fg-subtle/60',
                lg ? 'text-[52px] sm:text-[76px]' : 'text-[38px] sm:text-[44px]',
              )}
            >
              ?<span className="ml-[0.04em] text-[0.45em]">%</span>
            </span>
          ) : null}
        </div>
      )}
      <p className={cn('text-fg-muted', lg ? 'mt-1.5 text-[13px] sm:text-[14px]' : 'mt-1 text-[12.5px]')}>de sintonia com</p>
      <p className={cn('mt-1 max-w-full text-balance font-display font-semibold leading-tight tracking-[-0.02em] text-fg', lg ? 'text-[19px] sm:text-[26px]' : 'text-[16px] sm:text-[18px]')}>
        {revelado ? candidato.nomeUrna : 'Candidatura oculta'}
      </p>
      <p className={cn('num mt-0.5 text-fg-muted', lg ? 'text-[12.5px] sm:text-[13.5px]' : 'text-[12px]')}>
        {revelado && candidato.partido ? `${candidato.partido} · ${candidato.numero}` : '· · ·'}
      </p>
      <p className={cn('num mt-2 text-fg-subtle', lg ? 'text-[12px] sm:text-[12.5px]' : 'text-[11.5px]')}>
        {revelado ? `com base em ${fmtInt(consideradas)} ${consideradas === 1 ? 'afirmação' : 'afirmações'}` : ' '}
      </p>
    </div>
  );
}

/** Frase-resumo das respostas (sem nenhuma referência a candidato). */
export function resumoRespostas(o: { respondidas: number; puladas: number; importantes: number; total: number; rapido?: boolean }): string {
  const partes = [`Você respondeu ${fmtInt(o.respondidas)} de ${fmtInt(o.total)} afirmações${o.rapido ? ' do modo rápido' : ''}`];
  if (o.puladas) partes.push(`pulou ${fmtInt(o.puladas)}`);
  if (o.importantes) partes.push(`marcou ${fmtInt(o.importantes)} como ${o.importantes === 1 ? 'mais importante' : 'mais importantes'}`);
  if (partes.length === 1) return `${partes[0]}.`;
  const ultima = partes.pop();
  return `${partes.join(', ')} e ${ultima}.`;
}
