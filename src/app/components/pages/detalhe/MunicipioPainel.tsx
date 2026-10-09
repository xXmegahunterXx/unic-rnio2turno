/**
 * Município selecionado no mapa da UF: placar compacto, 1º × 2º turno, % apurado e o botão para abrir
 * a página do município. Usado no painel lateral (desktop) e dentro do Sheet (celular).
 */
import type { MunicipioResumo, Race } from '@/shared/types';
import { fmtCompact, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Placar } from '@/app/components/apuracao/Placar';
import { ComparaTurnos } from './ComparaTurnos';

export interface MunicipioPainelProps {
  race: Race;
  /** Corrida do 1º turno correspondente (para a comparação). */
  raceT1?: Race;
  municipio: MunicipioResumo;
  /** O mesmo município no 1º turno (UfSnapshot da corrida -t1). */
  municipioT1?: MunicipioResumo;
  /** Link da página do município. */
  to: string;
  simulado?: boolean;
  /** 'cidade' no exterior. */
  unidade?: string;
  /** Sem o botão (o Sheet põe o botão no rodapé). */
  semBotao?: boolean;
  /** Título do placar (padrão: nome do município; no Sheet o nome já está no título). */
  tituloPlacar?: string;
  className?: string;
}

export function MunicipioPainel({ race, raceT1, municipio: m, municipioT1, to, simulado, unidade = 'município', semBotao, tituloPlacar, className }: MunicipioPainelProps) {
  const sub = (
    <span className="num">
      {m.capital ? 'Capital · ' : ''}
      {fmtCompact(m.eleitorado)} eleitores · {fmtInt(m.secoes)} seções
    </span>
  );
  return (
    <div className={cn('space-y-3', className)}>
      <Placar race={race} resumo={m} variant="compact" titulo={tituloPlacar ?? m.nome} subtitulo={tituloPlacar ? undefined : sub} simulado={simulado} />
      {race.turno === 2 && raceT1 && municipioT1 ? (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <h3 className="mb-3.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">1º turno × 2º turno</h3>
          <ComparaTurnos race={race} raceT1={raceT1} t2={m} t1={municipioT1} compacto />
        </section>
      ) : null}
      {!semBotao ? (
        <ButtonLink to={to} variant="primary" block iconRight="seta">
          Abrir {unidade}
        </ButtonLink>
      ) : null}
    </div>
  );
}
