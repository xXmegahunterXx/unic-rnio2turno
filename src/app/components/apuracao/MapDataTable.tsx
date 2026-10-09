/**
 * Tabela equivalente aos mapas (acessibilidade): área, % apurado, % de cada candidato e vantagem.
 * Por padrão fica visível só para leitores de tela (`sr-only`); passe `visivel` para mostrar.
 */
import type { Race, Tally } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { rotuloApurado } from './mapModes';

export interface MapDataTableProps {
  caption: string;
  race: Pick<Race, 'candidatos'>;
  linhas: { id: string; nome: string; dados?: Tally | null }[];
  visivel?: boolean;
  className?: string;
}

export function MapDataTable({ caption, race, linhas, visivel, className }: MapDataTableProps) {
  // Tabela dentro de um div `sr-only`: <table> ignora width:1px e estouraria a largura da página.
  return (
    <div className={cn(visivel ? 'w-full overflow-x-auto' : 'sr-only', className)}>
      <table className={visivel ? 'w-full text-left text-[13px]' : undefined}>
        <caption className={visivel ? 'mb-2 text-left text-[12px] text-fg-subtle' : undefined}>{caption}</caption>
        <thead>
          <tr
            className={visivel ? 'border-b border-line text-[11px] uppercase tracking-wider text-fg-subtle' : undefined}
          >
            <th scope="col" className="py-1.5 pr-2 font-medium">
              Área
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right font-medium">
              Apurado
            </th>
            {race.candidatos.map((c) => (
              <th key={c.numero} scope="col" className="py-1.5 pr-2 text-right font-medium">
                {c.nomeUrna}
              </th>
            ))}
            <th scope="col" className="py-1.5 text-right font-medium">
              Vantagem
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const d = l.dados;
            const tem = !!d && d.secoesTotalizadas > 0;
            const m = tem ? margem(d!) : null;
            return (
              <tr key={l.id} className={visivel ? 'border-b border-line' : undefined}>
                <th scope="row" className="py-1.5 pr-2 font-normal text-fg">
                  {l.nome}
                </th>
                <td className="num py-1.5 pr-2 text-right text-fg-muted">
                  {d ? rotuloApurado(pctTotalizadas(d)) : '—'}
                </td>
                {race.candidatos.map((c, i) => (
                  <td key={c.numero} className="num py-1.5 pr-2 text-right">
                    {tem ? fmtPct(pctValidos(d!, i)) : '—'}
                  </td>
                ))}
                <td className="num py-1.5 text-right text-fg-muted">
                  {m && m.lider !== null
                    ? `${race.candidatos[m.lider]?.nomeUrna ?? ''} ${fmtPP(m.pp)}`
                    : tem
                      ? 'Empate'
                      : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
