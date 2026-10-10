/**
 * Abertura do Teste Cego (e do Duelo): título, fatos rápidos, como funciona, privacidade e o aviso editorial.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AFIRMACOES } from '@/app/content/afirmacoes';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { IlustracaoAfirmacao } from './IlustracaoAfirmacao';

export interface IntroTesteProps {
  eyebrow: ReactNode;
  titulo: ReactNode;
  subtitulo: ReactNode;
  /** Botões principais. */
  acoes: ReactNode;
  /** Conteúdo extra abaixo dos botões (ex.: "continuar de onde parou"). */
  extra?: ReactNode;
  /** Esconde a seção "Como funciona". */
  semPassos?: boolean;
  passos?: { icone: IconName; titulo: string; texto: string }[];
}

export const N_AFIRMACOES = AFIRMACOES.length;
/** Tempo estimado (minutos). */
export const MINUTOS_TESTE = 3;

export const PASSOS_TESTE: NonNullable<IntroTesteProps['passos']> = [
  {
    icone: 'olho-fechado',
    titulo: 'Uma afirmação por vez',
    texto: 'Frases neutras sobre políticas públicas, escritas pela redação — sem nome, partido, número ou slogan.',
  },
  {
    icone: 'check-circulo',
    titulo: 'Diga o quanto concorda',
    texto: 'De “concordo totalmente” a “discordo totalmente”. Pule o que preferir e marque o que pesa mais para você.',
  },
  {
    icone: 'selo',
    titulo: 'Compare com os programas',
    texto: 'No fim, mostramos a posição documentada de cada candidato, com o trecho original e o link para a página do documento.',
  },
];

/** Há afirmações ainda sem a revisão humana editorial e jurídica? (ver content/FONTES.md) */
export const EM_REVISAO = AFIRMACOES.some((a) => !a.revisado);

export function IntroTeste({ eyebrow, titulo, subtitulo, acoes, extra, semPassos, passos = PASSOS_TESTE }: IntroTesteProps) {
  const reduzir = useReducedMotion();
  const entrar = (d: number) =>
    reduzir ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d, ease: [0.22, 0.9, 0.24, 1] as const } };
  return (
    <div>
      <section className="grid grid-cols-1 items-center gap-6 pt-6 sm:pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12 lg:pt-14">
        <div className="min-w-0">
          <motion.div {...entrar(0)}>{eyebrow}</motion.div>
          <motion.h1
            {...entrar(0.06)}
            className="mt-4 text-balance font-display text-[40px] font-semibold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[60px] lg:text-[64px] xl:text-[72px]"
          >
            {titulo}
          </motion.h1>
          <motion.p {...entrar(0.12)} className="mt-4 max-w-[36rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:mt-5 sm:text-[18px]">
            {subtitulo}
          </motion.p>
          <motion.ul {...entrar(0.18)} className="mt-5 flex flex-wrap gap-2 sm:mt-6">
            <Fato icone="lista">
              <span className="num">{N_AFIRMACOES}</span> afirmações
            </Fato>
            <Fato icone="relogio">
              ≈ <span className="num">{MINUTOS_TESTE}</span> minutos
            </Fato>
            <Fato icone="olho-fechado">Nada sai do seu aparelho</Fato>
          </motion.ul>
          <motion.div {...entrar(0.24)} className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center">
            {acoes}
          </motion.div>
          {extra ? <motion.div {...entrar(0.3)} className="mt-4">{extra}</motion.div> : null}
        </div>
        <motion.div {...entrar(0.16)} className="mx-auto w-full max-w-[460px] lg:max-w-none">
          <IlustracaoAfirmacao />
        </motion.div>
      </section>

      {!semPassos ? (
        <section aria-labelledby="como-funciona" className="mt-12 sm:mt-16">
          <h2 id="como-funciona" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
            Como funciona
          </h2>
          <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            {passos.map((p, i) => (
              <li key={p.titulo} className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="num inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-[13px] font-bold text-brand-fg">{i + 1}</span>
                  <Icon name={p.icone} size={20} className="text-fg-muted" />
                </div>
                <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.015em] text-fg">{p.titulo}</h3>
                <p className="mt-1.5 text-pretty text-[14px] leading-relaxed text-fg-muted">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
        <Aviso icone="olho-fechado" titulo="Suas respostas ficam com você">
          Não há cadastro, envio nem analytics das respostas. Durante o teste elas ficam só nesta aba; o resultado vive no próprio
          link, depois do “#”, parte que o navegador nunca envia a servidor.{' '}
          <Link to="/privacidade" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg">
            Privacidade
          </Link>
        </Aviso>
        <Aviso icone="info" titulo="Não é pesquisa nem recomendação de voto">
          O teste compara suas respostas com o que está escrito nos programas de governo registrados no TSE — não com pessoas,
          trajetórias ou partidos. Use o resultado como ponto de partida para ler os documentos completos.{' '}
          <Link to="/metodologia#teste-cego" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg">
            Metodologia
          </Link>
          {EM_REVISAO ? <span className="mt-2 block text-[12.5px] text-fg-subtle">Textos em revisão editorial final.</span> : null}
        </Aviso>
      </section>
    </div>
  );
}

function Fato({ icone, children }: { icone: IconName; children: ReactNode }) {
  return (
    <li className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 text-[13.5px] font-medium text-fg backdrop-blur">
      <Icon name={icone} size={16} className="text-brand-fg" />
      <span>{children}</span>
    </li>
  );
}

export function Aviso({ icone, titulo, children, className }: { icone: IconName; titulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3.5 rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5', className)}>
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
        <Icon name={icone} size={18} />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-fg">{titulo}</h3>
        <div className="mt-1 text-pretty text-[13.5px] leading-relaxed text-fg-muted">{children}</div>
      </div>
    </div>
  );
}
