/**
 * Abertura do Teste Cego (e do Duelo), pensada para quem chega pelo X no celular: o gancho em 3 segundos é o título
 * curto + a PRIMEIRA AFIRMAÇÃO já respondível (`vitrine`). No celular a ordem é título → afirmação → ações; no desktop,
 * texto e ações à esquerda e a afirmação à direita. Depois: como funciona, privacidade e o aviso editorial.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AFIRMACOES } from '@/app/content/afirmacoes';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { IlustracaoAfirmacao } from './IlustracaoAfirmacao';
import { minutosEstimados } from './sintonia';

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
  /** Bloco ao lado do texto (desktop) / logo abaixo do título (celular). Padrão: a ilustração. */
  vitrine?: ReactNode;
  /** Fatos rápidos (padrão: afirmações, tempo e privacidade). */
  fatos?: ReactNode;
  passos?: { icone: IconName; titulo: string; texto: string }[];
}

export const N_AFIRMACOES = AFIRMACOES.length;
/** Tempo estimado (minutos), honesto: 7,5 s por afirmação (ver `minutosEstimados`). */
export const MINUTOS_TESTE = minutosEstimados(N_AFIRMACOES);

export const PASSOS_TESTE: NonNullable<IntroTesteProps['passos']> = [
  {
    icone: 'olho-fechado',
    titulo: 'Uma afirmação por vez',
    texto: 'Frases neutras sobre políticas públicas, escritas pela redação — sem nome, partido, número ou slogan.',
  },
  {
    icone: 'check-circulo',
    titulo: 'Diga o quanto concorda',
    texto: 'Da esquerda para a direita: de “discordo totalmente” a “concordo totalmente”. “Neutro” conta como meio-termo; se não souber, pule. Marque o que pesa mais para você.',
  },
  {
    icone: 'selo',
    titulo: 'Compare com os programas',
    texto: 'No fim, mostramos a posição documentada de cada candidato, com o trecho original e o link para a página do documento.',
  },
];

/** Há afirmações ainda sem a revisão humana editorial e jurídica? (ver content/FONTES.md) */
export const EM_REVISAO = AFIRMACOES.some((a) => !a.revisado);

export function IntroTeste({ eyebrow, titulo, subtitulo, acoes, extra, semPassos, passos = PASSOS_TESTE, vitrine, fatos }: IntroTesteProps) {
  const reduzir = useReducedMotion();
  const entrar = (d: number) =>
    reduzir ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d, ease: [0.22, 0.9, 0.24, 1] as const } };
  return (
    <div>
      {/* Celular: título → vitrine → ações. Desktop (lg): texto + ações à esquerda, vitrine à direita.
          Celular de tela baixa (≤ 740 px úteis — o navegador embutido do app do X tira ~180 px da tela): tipografia e
          respiros menores, para a escala da 1ª afirmação (com os rótulos) caber acima da tab bar; em ≤ 640 px o subtítulo
          sai (os mesmos fatos vêm nas pílulas logo abaixo: nº de afirmações, tempo e privacidade). */}
      <section className="grid grid-cols-1 items-center gap-x-12 gap-y-5 pt-5 max-sm:[@media(max-height:740px)]:gap-y-3.5 max-sm:[@media(max-height:740px)]:pt-3 sm:gap-y-7 sm:pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-y-0 lg:pt-14">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
          <motion.div {...entrar(0)}>{eyebrow}</motion.div>
          <motion.h1
            {...entrar(0.06)}
            className="mt-3.5 text-balance font-display text-[40px] font-semibold leading-[0.98] tracking-[-0.04em] text-fg max-sm:[@media(max-height:740px)]:mt-2.5 max-sm:[@media(max-height:740px)]:text-[34px] sm:mt-4 sm:text-[60px] lg:text-[60px] xl:text-[66px]"
          >
            {titulo}
          </motion.h1>
          <motion.p {...entrar(0.12)} className="mt-3 max-w-[36rem] text-pretty text-[15.5px] leading-relaxed text-fg-muted max-sm:[@media(max-height:740px)]:mt-2 max-sm:[@media(max-height:740px)]:text-[14px] max-sm:[@media(max-height:740px)]:leading-snug max-sm:[@media(max-height:640px)]:hidden sm:mt-5 sm:text-[18px]">
            {subtitulo}
          </motion.p>
        </div>
        <motion.div {...entrar(0.16)} className="mx-auto w-full max-w-[520px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none">
          {vitrine ?? <IlustracaoAfirmacao />}
        </motion.div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start">
          <motion.div {...entrar(0.2)} className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:mt-8">
            {acoes}
          </motion.div>
          <motion.ul {...entrar(0.24)} className="mt-4 flex flex-wrap gap-2 sm:mt-6">
            {fatos ?? (
              <>
                <Fato icone="lista">
                  <span className="num">{N_AFIRMACOES}</span> afirmações
                </Fato>
                <Fato icone="relogio">
                  ≈ <span className="num">{MINUTOS_TESTE}</span> min
                </Fato>
                <Fato icone="olho-fechado">Nada sai do seu aparelho</Fato>
              </>
            )}
          </motion.ul>
          {extra ? <motion.div {...entrar(0.3)} className="mt-4">{extra}</motion.div> : null}
        </div>
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

export function Fato({ icone, children }: { icone: IconName; children: ReactNode }) {
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
