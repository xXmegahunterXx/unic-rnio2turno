/**
 * Tema a tema: o que a pessoa escolheu e a revelação de cada par — de quem era cada proposta, o trecho
 * original entre aspas e o link para a página do documento. Os pares aparecem na ordem da urna
 * (menor número primeiro), com a mesma tipografia para os dois.
 */
import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Candidate } from '@/shared/types';
import type { Proposta, Rodada } from '@/app/content/propostas';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, toneFromCor } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { Ladrilho, rotuloOpcao } from './Fita';
import type { Autor, Opcao, TemaResultado } from './sintonia';
import { TemaEmoji } from './TemaEmoji';

export function TemaATema({
  temas,
  porNumero,
  abertosInicial = [],
  rotuloLinha,
  extraLinha,
  marcas,
}: {
  temas: TemaResultado[];
  porNumero: Record<Autor, Candidate>;
  abertosInicial?: number[];
  /** Texto da linha (padrão: "Você escolheu …"). */
  rotuloLinha?: (t: TemaResultado) => ReactNode;
  /** Conteúdo à direita da linha (padrão: ladrilho da escolha). */
  extraLinha?: (t: TemaResultado) => ReactNode;
  /** Selos extras por proposta revelada (ex.: no Duelo, a escolha de quem desafiou). */
  marcas?: (p: Proposta) => ReactNode;
}) {
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set(abertosInicial));
  const todos = abertos.size === temas.length;
  const alternar = (i: number) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setAbertos(todos ? new Set() : new Set(temas.map((_, i) => i)))}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name={todos ? 'recolher' : 'expandir'} size={15} />
          {todos ? 'Recolher todos' : 'Abrir todos'}
        </button>
      </div>
      <ul className="space-y-2.5">
        {temas.map((t, i) => (
          <LinhaTema
            key={t.rodada.tema.id}
            t={t}
            porNumero={porNumero}
            aberto={abertos.has(i)}
            onAlternar={() => alternar(i)}
            rotulo={rotuloLinha?.(t)}
            extra={extraLinha?.(t)}
            marcas={marcas}
          />
        ))}
      </ul>
    </div>
  );
}

function textoEscolha(o: Opcao, porNumero: Record<Autor, Candidate>) {
  if (o === 'nenhuma') return 'Você não escolheu nenhuma das duas';
  if (o === 'tanto-faz') return 'Para você, tanto faz';
  return (
    <>
      Você escolheu a proposta de <span className="font-semibold text-fg">{porNumero[o].nomeUrna}</span>
    </>
  );
}

function LinhaTema({
  t,
  porNumero,
  aberto,
  onAlternar,
  rotulo,
  extra,
  marcas,
}: {
  t: TemaResultado;
  porNumero: Record<Autor, Candidate>;
  aberto: boolean;
  onAlternar: () => void;
  rotulo?: ReactNode;
  extra?: ReactNode;
  marcas?: (p: Proposta) => ReactNode;
}) {
  const id = useId();
  return (
    <li className={cn('overflow-hidden rounded-2xl border bg-surface shadow-card transition-colors', aberto ? 'border-line/[2]' : 'border-line')}>
      <h3>
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={onAlternar}
          className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:gap-4 sm:p-4"
        >
          <TemaEmoji tema={t.rodada.tema} size="sm" className="sm:h-11 sm:w-11 sm:rounded-[14px] sm:text-[22px]" />
          <span className="min-w-0 flex-1">
            <span className="block text-balance font-display text-[16px] font-semibold leading-tight tracking-[-0.01em] text-fg sm:text-[17px]">{t.rodada.tema.rotulo}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-fg-muted">{rotulo ?? textoEscolha(t.opcao, porNumero)}</span>
          </span>
          {extra ?? <Ladrilho opcao={t.opcao} porNumero={porNumero} className="h-6 w-6 shrink-0 rounded-md sm:h-7 sm:w-7 sm:rounded-lg" />}
          <Icon name="chevron" size={18} className={cn('shrink-0 text-fg-subtle transition-transform duration-200', aberto && 'rotate-180')} />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {aberto ? (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 0.9, 0.24, 1] }}
          >
            <ParRevelado rodada={t.rodada} escolhida={t.escolhida} porNumero={porNumero} marcas={marcas} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

export function ParRevelado({
  rodada,
  escolhida,
  porNumero,
  marcas,
}: {
  rodada: Rodada;
  escolhida: Proposta | null;
  porNumero: Record<Autor, Candidate>;
  /** Selos extras por proposta (ex.: no Duelo, "Você" / "Quem te desafiou"). */
  marcas?: (p: Proposta) => ReactNode;
}) {
  const ordem = [...rodada.opcoes].sort((a, b) => a.autor - b.autor);
  return (
    <div className="grid grid-cols-1 gap-2.5 border-t border-line p-3 sm:p-4 md:grid-cols-2 md:gap-3">
      {ordem.map((p) => (
        <PropostaRevelada key={p.id} p={p} candidato={porNumero[p.autor]} escolhida={escolhida?.id === p.id} marcas={marcas?.(p)} />
      ))}
    </div>
  );
}

/** Borda translúcida na cor do slot (classes por extenso para o Tailwind gerar). */
const BORDA_ESCOLHIDA: Record<Candidate['cor'], string> = { a: 'border-cand-a/55', b: 'border-cand-b/55', outros: 'border-cand-outros/55' };

function PropostaRevelada({ p, candidato, escolhida, marcas }: { p: Proposta; candidato: Candidate; escolhida: boolean; marcas?: ReactNode }) {
  const s = corSlot(candidato.cor);
  return (
    <article className={cn('relative flex flex-col rounded-xl border p-4', escolhida ? cn(s.bgFaint, BORDA_ESCOLHIDA[candidato.cor]) : 'border-line bg-surface-2/50')}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <CandidateAvatar candidato={candidato} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold leading-tight text-fg">{candidato.nomeUrna}</div>
          {candidato.partido ? <div className="num text-[12px] text-fg-muted">{candidato.partido} · {candidato.numero}</div> : null}
        </div>
        {escolhida ? (
          <Badge tone={toneFromCor(candidato.cor)} size="xs" caps icon="check">
            Sua escolha
          </Badge>
        ) : null}
        {marcas}
      </div>
      <p className="mt-3 text-pretty text-[15px] font-medium leading-snug text-fg">{p.texto}</p>
      <blockquote className={cn('mt-3 border-l-2 pl-3 text-pretty text-[13.5px] italic leading-relaxed text-fg-muted', s.border)}>
        “{p.fonte.trecho}”
      </blockquote>
      <div className="mt-auto pt-3">
        <a
          href={p.fonte.url}
          target="_blank"
          rel="noopener noreferrer"
          title={p.fonte.titulo}
          className="group inline-flex max-w-full items-start gap-1.5 rounded-md text-[12.5px] leading-snug text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name="externo" size={14} className="mt-px shrink-0" />
          <span className="min-w-0">
            <span className="font-medium text-fg underline decoration-line underline-offset-2 group-hover:decoration-fg">Programa de governo (TSE)</span>
            {p.fonte.pagina ? <span className="num"> · {p.fonte.pagina}</span> : null}
          </span>
        </a>
      </div>
    </article>
  );
}

/** Rótulo curto da opção (para chips). */
export { rotuloOpcao };
