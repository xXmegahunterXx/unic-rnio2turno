/**
 * Comparação do Duelo: "Vocês concordaram em N de 12 temas", tema a tema, e a sintonia de cada pessoa
 * lado a lado. Só duas pessoas — nunca agregados (ARCHITECTURE §1.2). Tudo calculado no navegador.
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { Ladrilho, rotuloOpcao } from './Fita';
import type { Autor, Comparacao, Opcao, Sintonia } from './sintonia';
import { TemaATema } from './TemaATema';

export function frasesConcordancia(iguais: number, total: number): string {
  if (iguais === total) return 'Vocês escolheram igual em todos os temas.';
  if (iguais === 0) return 'Vocês escolheram diferente em todos os temas — assunto não falta para uma boa conversa.';
  if (iguais / total >= 0.75) return 'Muita coisa em comum entre as escolhas de vocês.';
  if (iguais / total >= 0.4) return 'Vocês concordam em parte — e discordam em temas que valem uma conversa.';
  return 'Vocês pensam diferente na maioria dos temas — assunto não falta para uma boa conversa.';
}

export function PlacarConcordancia({ comp, revelado }: { comp: Comparacao; revelado: boolean }) {
  const reduzir = useReducedMotion();
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-baseline gap-2 font-display font-semibold tracking-[-0.045em] text-fg">
        <NumberRoll value={revelado ? comp.iguais : 0} className="text-[76px] leading-none sm:text-[112px]" duration={900} ariaLabel={`${comp.iguais} de ${comp.total}`} />
        <span className="num text-[28px] text-fg-muted sm:text-[40px]">/ {fmtInt(comp.total)}</span>
      </div>
      <p className="mt-2 text-[15px] font-medium text-fg sm:text-[17px]">temas em que vocês escolheram igual</p>
      <ol className="mt-5 flex flex-wrap justify-center gap-1.5" aria-hidden>
        {comp.temas.map((t, i) => (
          <motion.li
            key={t.tema.id}
            initial={reduzir ? false : { scale: 0.4, opacity: 0 }}
            animate={revelado ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
            transition={{ delay: reduzir ? 0 : 0.3 + i * 0.05, type: 'spring', stiffness: 420, damping: 24 }}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full border sm:h-8 sm:w-8',
              t.igual ? 'border-brand/60 bg-brand/20 text-brand-fg' : 'border-line bg-surface-2 text-fg-subtle',
            )}
          >
            <Icon name={t.igual ? 'check' : 'menos'} size={14} strokeWidth={2.5} />
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** Sintonia de uma pessoa em barras (ordem da urna, mesma escala para os dois candidatos). */
export function SintoniaEmBarras({
  titulo,
  sintonia,
  candidatos,
  revelado,
  destaque,
}: {
  titulo: string;
  sintonia: Sintonia;
  candidatos: Candidate[];
  revelado: boolean;
  destaque?: boolean;
}) {
  const reduzir = useReducedMotion();
  return (
    <div className={cn('rounded-2xl border p-4 sm:p-5', destaque ? 'border-brand/40 bg-brand/[0.06]' : 'border-line bg-surface-2/50')}>
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full', destaque ? 'bg-brand/20 text-brand-fg' : 'bg-surface-3 text-fg-muted')}>
          <Icon name={destaque ? 'pin' : 'usuarios'} size={15} />
        </span>
        <h3 className="text-[15px] font-semibold text-fg">{titulo}</h3>
      </div>
      <ul className="mt-4 space-y-3.5">
        {candidatos.map((c, i) => {
          const s = corSlot(c.cor);
          const pct = sintonia.pct[c.numero as Autor] ?? 0;
          return (
            <li key={c.numero}>
              <div className="flex items-center gap-2.5">
                <CandidateAvatar candidato={c} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{c.nomeUrna}</span>
                <span className={cn('num font-display text-[20px] font-semibold leading-none tracking-[-0.02em]', s.textDisplay)}>{fmtPct(pct, 0)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  className={cn('h-full rounded-full', s.bg)}
                  initial={{ width: 0 }}
                  animate={{ width: revelado ? `${pct}%` : 0 }}
                  transition={{ duration: reduzir ? 0 : 0.9, delay: reduzir ? 0 : 0.2 + i * 0.1, ease: [0.22, 0.9, 0.24, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chip({ quem, opcao, porNumero }: { quem: string; opcao: Opcao; porNumero: Record<Autor, Candidate> }) {
  const nome = opcao === 'nenhuma' ? 'Nenhuma' : opcao === 'tanto-faz' ? 'Tanto faz' : porNumero[opcao].nomeUrna;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Ladrilho opcao={opcao} porNumero={porNumero} className="h-3 w-3 shrink-0 rounded-[4px]" />
      <span className="shrink-0 text-fg-subtle">{quem}:</span>
      <span className="truncate font-medium text-fg">{nome}</span>
    </span>
  );
}

export function DueloTemaATema({
  minha,
  outra,
  comp,
  porNumero,
}: {
  minha: Sintonia;
  outra: Sintonia;
  comp: Comparacao;
  porNumero: Record<Autor, Candidate>;
}) {
  const igualPorTema = new Map(comp.temas.map((t) => [t.tema.id, t]));
  const escolhaDaOutra = new Map(outra.temas.map((t) => [t.rodada.tema.id, t.escolhida?.id ?? null]));
  return (
    <TemaATema
      temas={minha.temas}
      porNumero={porNumero}
      rotuloLinha={(t) => {
        const c = igualPorTema.get(t.rodada.tema.id);
        return (
          <span className="mt-1 flex flex-col gap-0.5 text-[12.5px] sm:flex-row sm:flex-wrap sm:gap-x-4">
            <Chip quem="Você" opcao={t.opcao} porNumero={porNumero} />
            {c ? <Chip quem="Quem te desafiou" opcao={c.outra} porNumero={porNumero} /> : null}
          </span>
        );
      }}
      extraLinha={(t) => {
        const c = igualPorTema.get(t.rodada.tema.id);
        return c?.igual ? (
          <Badge tone="brand" size="xs" icon="check" className="shrink-0">
            Igual
          </Badge>
        ) : (
          <Badge tone="neutral" size="xs" className="shrink-0">
            Diferente
          </Badge>
        );
      }}
      marcas={(p) =>
        escolhaDaOutra.get(p.tema) === p.id ? (
          <Badge tone="neutral" size="xs" caps icon="usuarios">
            Quem te desafiou
          </Badge>
        ) : null
      }
    />
  );
}

export { rotuloOpcao };
