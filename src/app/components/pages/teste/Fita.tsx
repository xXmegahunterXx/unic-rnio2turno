/**
 * Fita das 12 escolhas (na ordem em que a pessoa respondeu): um ladrilho por tema, na cor do slot do
 * autor da proposta escolhida; "tanto faz" = meio a meio; "nenhuma" = contorno tracejado.
 * Identidade nunca só pela cor: rótulo acessível em cada ladrilho e legenda com nomes.
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { Candidate } from '@/shared/types';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import type { Autor, Opcao, Sintonia } from './sintonia';

export function rotuloOpcao(o: Opcao, porNumero: Record<Autor, Candidate>): string {
  if (o === 'nenhuma') return 'Nenhuma das duas';
  if (o === 'tanto-faz') return 'Tanto faz';
  return `Proposta de ${porNumero[o].nomeUrna}`;
}

export function Ladrilho({
  opcao,
  porNumero,
  className,
}: {
  opcao: Opcao;
  porNumero: Record<Autor, Candidate>;
  className?: string;
}) {
  if (opcao === 'nenhuma') return <span className={cn('block border-2 border-dashed border-fg-subtle/50', className)} />;
  if (opcao === 'tanto-faz') {
    const [a, b] = ([13, 22] as const).map((n) => corSlot(porNumero[n].cor).bg);
    return (
      <span className={cn('relative block overflow-hidden', className)}>
        <span className={cn('absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]', a)} />
        <span className={cn('absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]', b)} />
      </span>
    );
  }
  return <span className={cn('block', corSlot(porNumero[opcao].cor).bg, className)} />;
}

export function Fita({
  sintonia,
  porNumero,
  revelado = true,
  className,
  altura = 'h-9 sm:h-11',
}: {
  sintonia: Sintonia;
  porNumero: Record<Autor, Candidate>;
  revelado?: boolean;
  className?: string;
  altura?: string;
}) {
  const reduzir = useReducedMotion();
  return (
    <ol className={cn('grid grid-cols-12 gap-1 sm:gap-1.5', className)} aria-label="Sua escolha em cada tema">
      {sintonia.temas.map((t, i) => (
        <li key={t.rodada.tema.id} className={cn('relative rounded-md bg-surface-3 sm:rounded-lg', altura)} title={`${t.rodada.tema.rotulo}: ${rotuloOpcao(t.opcao, porNumero)}`}>
          <span className="sr-only">
            {t.rodada.tema.rotulo}: {rotuloOpcao(t.opcao, porNumero)}
          </span>
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-[inherit]"
            initial={reduzir ? false : { opacity: 0, scale: 0.6 }}
            animate={revelado ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.35, delay: reduzir ? 0 : 0.5 + i * 0.05, ease: [0.22, 0.9, 0.24, 1] }}
          >
            <Ladrilho opcao={t.opcao} porNumero={porNumero} className="h-full w-full rounded-[inherit]" />
          </motion.span>
        </li>
      ))}
    </ol>
  );
}

export function LegendaFita({ sintonia, candidatos, porNumero, className }: { sintonia: Sintonia; candidatos: Candidate[]; porNumero: Record<Autor, Candidate>; className?: string }) {
  const itens: { o: Opcao; rotulo: string; n: number }[] = [
    ...candidatos.map((c) => ({ o: c.numero as Autor, rotulo: c.nomeUrna, n: sintonia.escolhas[c.numero as Autor] ?? 0 })),
    { o: 'tanto-faz' as const, rotulo: 'Tanto faz', n: sintonia.tantoFaz },
    { o: 'nenhuma' as const, rotulo: 'Nenhuma', n: sintonia.nenhuma },
  ];
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-fg-muted', className)}>
      {itens.map((it) => (
        <li key={String(it.o)} className="inline-flex items-center gap-1.5">
          <Ladrilho opcao={it.o} porNumero={porNumero} className="h-3 w-3 rounded-[4px]" />
          <span className="text-fg">{it.rotulo}</span>
          <span className="num">{fmtInt(it.n)}</span>
        </li>
      ))}
    </ul>
  );
}
