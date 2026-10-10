/**
 * A primeira afirmação do teste, já na abertura: quem chega pelo X vê uma pergunta de verdade e responde com um toque
 * (sem cadastro, sem tela intermediária). O toque grava a resposta SÓ na aba e abre o quiz na afirmação seguinte.
 * Mesma escala do quiz (discordo à esquerda, concordo à direita), mesma neutralidade: só o texto, o tema e o contexto
 * opcional — nunca autoria.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TEMA_POR_ID, type Afirmacao, type Resposta } from '@/app/content/afirmacoes';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { vibrar } from './haptica';
import { EscalaConcordancia } from './Quiz';

export interface AfirmacaoEntradaProps {
  afirmacao: Afirmacao;
  /** Posição desta afirmação (1 = a primeira). */
  numero: number;
  total: number;
  onResponder: (r: Resposta) => void;
  /** Linha acima do cartão. */
  chamada?: string;
  className?: string;
}

export function AfirmacaoEntrada({ afirmacao, numero, total, onResponder, chamada = 'Comece agora: responda a primeira', className }: AfirmacaoEntradaProps) {
  const reduzir = useReducedMotion();
  const [acendendo, setAcendendo] = useState<Resposta | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tema = TEMA_POR_ID[afirmacao.tema];

  function escolher(r: Resposta) {
    if (acendendo !== null) return;
    setAcendendo(r);
    vibrar(10);
    timer.current = window.setTimeout(() => onResponder(r), reduzir ? 80 : 360);
  }

  return (
    <div className={cn('relative', className)}>
      <p className="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-brand-fg">
        <span className="relative inline-flex h-2 w-2">
          {!reduzir ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" /> : null}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
        {chamada}
      </p>
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 12, rotate: -0.6 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 0.9, 0.24, 1] }}
        className="relative overflow-hidden rounded-[26px] border border-line bg-surface p-3.5 shadow-card min-[380px]:p-4 sm:p-6"
        data-afirmacao-entrada
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand/[0.12] blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.15em] text-fg-muted">
            <span aria-hidden className="text-[14px] leading-none">
              {tema.emoji}
            </span>
            <span className="truncate">{tema.rotulo}</span>
          </span>
          <span className="num shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-semibold text-fg-muted">
            {numero} de {total}
          </span>
        </div>
        <h2 className="relative mt-3 text-balance font-display text-[23px] font-semibold leading-[1.12] tracking-[-0.025em] text-fg sm:text-[28px]">
          {afirmacao.texto}
        </h2>
        {afirmacao.contexto ? (
          <p className="relative mt-2.5 flex items-start gap-1.5 text-pretty text-[13px] leading-snug text-fg-muted">
            <Icon name="info" size={14} className="mt-[2px] shrink-0 text-fg-subtle" />
            <span>{afirmacao.contexto}</span>
          </p>
        ) : null}
        <EscalaConcordancia compacta valor={acendendo} acendendo={acendendo} onEscolher={escolher} className="mt-5" />
        <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-fg-subtle">
            <Icon name="olho-fechado" size={14} className="shrink-0" />
            <span className="truncate">Sem nomes. Só no seu aparelho.</span>
          </span>
          <button
            type="button"
            onClick={() => escolher('pular')}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Pular
            <Icon name="chevron-direita" size={15} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
