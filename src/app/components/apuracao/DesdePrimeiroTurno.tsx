/**
 * "Desde o 1º turno": para cada finalista, a variação em relação ao resultado OFICIAL de 4 de outubro — em pontos
 * percentuais dos válidos (vale durante toda a apuração) e em votos (só onde a comparação é justa: com a abrangência
 * inteira totalizada, ou nas subáreas — estados no Brasil, municípios na UF — com 100% das seções; ver desdeT1.ts).
 * Também "onde cada um cresceu mais que o outro": as subáreas concluídas em que a variação de um mais superou a do outro
 * (mesmo critério e mesma quantidade para os dois).
 *
 * Neutralidade: ordem da urna, textos simétricos e sem adjetivos, números em tinta neutra (a cor do candidato só no
 * avatar e na linha do partido); nada de verde/vermelho para "subiu/desceu". Simulação: selo "Simulação · dados
 * fictícios" no próprio bloco. Simulação com nomes ocultos: o bloco não aparece (os números oficiais do 1º turno
 * identificariam quem é o Candidato A e quem é o B ao lado de números fictícios — mesma regra da comparação antiga).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Race, Summary, Tally, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { partidoENumero } from '@/shared/anon';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { CandidateAvatar } from './CandidateAvatar';
import { SimulationRibbon } from './SimulationRibbon';
import { useFotosRace } from './fotos';
import { desdePrimeiroTurno, type ContagemT1, type ContagemT2, type DesdeT1Agregado, type DesdeT1Candidato } from '@/shared/desde-t1';
import { intervaloPesadoVigente } from '@/app/data/carga';

export interface DesdePrimeiroTurnoProps {
  race: Race;
  raceT1: Race;
  /** A abrangência no 2º turno (agora) e no 1º turno (oficial). */
  resumo: Summary;
  resumoT1: Pick<Tally, 'votos'>;
  /** Subáreas nos dois turnos (chave → contagem): UFs no Brasil, municípios (código TSE) na UF. */
  areas?: Readonly<Record<string, ContagemT2 | undefined>>;
  areasT1?: Readonly<Record<string, ContagemT1 | undefined>>;
  /** Agregado pronto (o do servidor, por município, no Brasil): usado no lugar de `areas`/`areasT1`. */
  agregado?: DesdeT1Agregado | null;
  /** Nome de cada subárea (para "onde cada um cresceu mais"). */
  nomeArea?: (chave: string) => string;
  /** "estado"/"estados", "município"/"municípios" ou "cidade"/"cidades" (`feminino`). */
  rotuloArea: { um: string; varios: string; feminino?: boolean };
  /** Texto do total de subáreas (padrão: o número delas), ex.: "27 estados e o exterior". */
  rotuloTotal?: string;
  /** Piso de eleitorado para "onde cada um cresceu mais" (padrão 0). */
  ondeEleitoradoMin?: number;
  /** Colunas dos dois finalistas (padrão: lado a lado a partir de 640 px). Numa coluna estreita, passe uma coluna só. */
  grade?: string;
  simulado?: boolean;
  className?: string;
}

/** Cobertura em % inteiro; abaixo de 1% (e acima de zero), "menos de 1%" — nunca um "0%" que não é zero. */
const pctInt = (n: number) => (n > 0 && n < 1 ? 'menos de 1%' : fmtPct(Math.floor(n), 0));

export function DesdePrimeiroTurno({
  race,
  raceT1,
  resumo,
  resumoT1,
  areas,
  areasT1,
  agregado,
  nomeArea,
  rotuloArea,
  rotuloTotal,
  ondeEleitoradoMin = 0,
  grade = 'sm:grid-cols-2',
  simulado,
  className,
}: DesdePrimeiroTurnoProps) {
  const d = useMemo(
    () => desdePrimeiroTurno({ race, raceT1, t2: resumo, t1: resumoT1, areas2: areas, areas1: areasT1, agregado, ondeQuantos: 3, ondeEleitoradoMin }),
    [race, raceT1, resumo, resumoT1, areas, areasT1, agregado, ondeEleitoradoMin],
  );
  const fotos = useFotosRace(race, { desligado: simulado });
  const fin = d.candidatos.filter((c) => !race.candidatos[c.indice]?.agregado);
  const outros = raceT1.candidatos.findIndex((c) => c.agregado);
  const totalT1 = resumoT1.votos.reduce((a, b) => a + b, 0);
  const pctOutros = outros >= 0 && totalT1 > 0 ? ((resumoT1.votos[outros] ?? 0) / totalT1) * 100 : null;
  const cobertura = d.eleitoradoTotal > 0 ? (d.eleitoradoConcluido / d.eleitoradoTotal) * 100 : 0;
  const temOnde = d.base !== 'nenhuma' && d.onde.some((l) => l.length > 0);

  return (
    <section
      aria-labelledby="desde-t1-titulo"
      // números e fotos de candidato: a barra fixa de anúncio do celular nunca fica por cima (anuncios/faixaLivre.ts)
      data-sem-anuncio-fixo
      className={cn('min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id="desde-t1-titulo" className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">
            Desde o 1º turno
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">Cada finalista agora, comparado ao resultado oficial de 4 de outubro</p>
        </div>
        {simulado ? <SimulationRibbon variant="badge" /> : null}
      </div>

      <ul className={cn('mt-4 grid gap-3', grade)}>
        {fin.map((c) => (
          <Linha key={c.numero} race={race} c={c} foto={fotos[c.indice]} base={d.base} concluida={d.concluida} />
        ))}
      </ul>

      {temOnde ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Onde cada um cresceu mais que o outro</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-fg-subtle">
            Entre os {rotuloArea.varios} já com 100% das seções
            {ondeEleitoradoMin > 0 || agregado ? ` e pelo menos ${fmtInt(agregado ? 10_000 : ondeEleitoradoMin)} eleitores` : ''}: a variação de um menos a do outro.
          </p>
          <div className={cn('mt-2.5 grid gap-3', grade)}>
            {fin.map((c, k) => (
              <div key={c.numero} className="min-w-0">
                <div className={cn('num truncate text-[12.5px] font-semibold', corSlot(race.candidatos[c.indice].cor).text)}>{race.candidatos[c.indice].nomeUrna}</div>
                <ol className="mt-1.5 space-y-1">
                  {d.onde[k].map((o, n) => (
                    <li key={o.chave} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate text-fg">
                        <span className="num mr-1.5 text-fg-subtle">{n + 1}.</span>
                        {o.nome ?? (nomeArea ? nomeArea(o.chave) : o.chave)}
                      </span>
                      <span className="num shrink-0 text-fg-muted" title={`Variação: ${fmtPP(o.pp, 2)} dos válidos`}>
                        <span className="font-semibold text-fg">{fmtPP(o.vantagem).replace(/^\+/, '')}</span> a mais
                      </span>
                    </li>
                  ))}
                  {d.onde[k].length === 0 ? <li className="text-[12.5px] text-fg-subtle">Nenhum até agora</li> : null}
                </ol>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[12px] leading-snug text-fg-muted">
        <Icon name="info" size={14} className="mt-px shrink-0 text-fg-subtle" />
        <span>
          {pctOutros !== null ? (
            <>
              No 1º turno, o % é sobre todos os candidatos (os demais somaram <span className="num font-medium text-fg">{fmtPct(pctOutros)}</span>
              ); no 2º, só sobre os dois.{' '}
            </>
          ) : null}
          {d.base === 'tudo' ? (
            <>Diferença em votos com 100% das seções totalizadas.</>
          ) : d.base === 'parcial' ? (
            <>
              *A diferença em votos compara o mesmo eleitorado: só{' '}
              {d.areasConcluidas === 1
                ? `${rotuloArea.feminino ? 'a' : 'o'} ${rotuloArea.um} já com 100% das seções`
                : `${rotuloArea.feminino ? 'as' : 'os'} ${fmtInt(d.areasConcluidas)} ${rotuloArea.varios} já com 100% das seções`}{' '}
              (de {rotuloTotal ?? fmtInt(d.areasTotal)}; <span className="num">{pctInt(cobertura)}</span> do eleitorado).
            </>
          ) : (
            <>
              A diferença em votos aparece quando {rotuloArea.feminino ? 'uma' : 'um'} {rotuloArea.um} chegar a 100% das seções: só assim o eleitorado
              comparado é o mesmo.
            </>
          )}
          {simulado ? ' 2º turno com números fictícios (simulação).' : ' Fonte: TSE.'}
        </span>
      </p>
    </section>
  );
}

function Linha({
  race,
  c,
  foto,
  base,
  concluida,
}: {
  race: Race;
  c: DesdeT1Candidato;
  foto: string | undefined;
  base: 'tudo' | 'parcial' | 'nenhuma';
  concluida: boolean;
}) {
  const cand = race.candidatos[c.indice];
  return (
    <li className="min-w-0 rounded-xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <CandidateAvatar candidato={cand} foto={foto} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight text-fg">{cand.nomeUrna}</div>
          <div className={cn('num truncate text-[12px] font-semibold', corSlot(cand.cor).text)}>{partidoENumero(cand)}</div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <div className="min-w-0">
          <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">% dos válidos</dt>
          <dd className="num mt-0.5 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg">{c.pp !== null ? fmtPP(c.pp, 2) : '—'}</dd>
          <dd className="num mt-1 text-[12px] text-fg-muted">
            {c.pct1 !== null ? fmtPct(c.pct1) : '—'} <span aria-hidden>→</span>
            <span className="sr-only"> para </span> <span className="font-medium text-fg">{c.pct2 !== null ? fmtPct(c.pct2) : '—'}</span>
          </dd>
        </div>
        <div className="min-w-0">
          {/* sem nenhuma área concluída, os votos de agora (fato), nunca uma "diferença" contra o total do 1º turno */}
          <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
            {base === 'nenhuma' ? 'Votos até agora' : base === 'parcial' ? 'Em votos*' : 'Em votos'}
          </dt>
          <dd className="num mt-0.5 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg">
            {base === 'nenhuma' || c.diferenca === null ? fmtInt(c.votos2) : `${c.diferenca > 0 ? '+' : c.diferenca < 0 ? '−' : ''}${fmtInt(Math.abs(c.diferenca))}`}
          </dd>
          <dd className="num mt-1 truncate text-[12px] text-fg-muted">
            {concluida ? (
              <>
                {fmtInt(c.votos1)} <span aria-hidden>→</span>
                <span className="sr-only"> para </span> <span className="font-medium text-fg">{fmtInt(c.votos2)}</span>
              </>
            ) : base === 'parcial' ? (
              <>onde já terminou</>
            ) : (
              <>1º turno: {fmtInt(c.votos1)}</>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * `GET /api/apuracao/:race/br/desde-t1` (src/server/desde-t1.ts): o agregado por município do Brasil, a cada 10 s
 * durante a apuração. No build demo não há servidor: o painel compara por estado.
 */
export function useDesdeT1Brasil(raceId: string, ativo: boolean) {
  return useQuery<DesdeT1Agregado>({
    queryKey: ['desde-t1', raceId],
    enabled: ativo && !__DEMO__,
    queryFn: async () => {
      const r = await fetch(`/api/apuracao/${encodeURIComponent(raceId)}/br/desde-t1`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!r.ok) throw Object.assign(new Error(`Erro ${r.status}`), { status: r.status });
      return (await r.json()) as DesdeT1Agregado;
    },
    staleTime: 5_000,
    refetchInterval: ativo ? () => intervaloPesadoVigente(10_000) : false, // freio (I37): × fator; para no modo leve
    retry: 1,
  });
}

export interface DesdePrimeiroTurnoBrasilProps {
  race: Race;
  raceT1: Race;
  resumo: Summary;
  resumoT1: Pick<Tally, 'votos'>;
  /** Estados nos dois turnos (o painel cai neles quando o agregado por município não vem: build demo, erro). */
  ufs: Readonly<Partial<Record<UF, ContagemT2>>>;
  ufsT1: Readonly<Partial<Record<UF, ContagemT1>>>;
  /** Ao vivo (sem `?t=` da "Reveja a noite"): só então pede o agregado por município, que é sempre o de agora. */
  aoVivo: boolean;
  simulado?: boolean;
  className?: string;
}

/** O painel da página nacional: por município (servidor) quando disponível; senão, por estado. */
export function DesdePrimeiroTurnoBrasil({ race, raceT1, resumo, resumoT1, ufs, ufsT1, aoVivo, simulado, className }: DesdePrimeiroTurnoBrasilProps) {
  const q = useDesdeT1Brasil(race.id, aoVivo);
  const ag = aoVivo && q.data && q.data.race === race.id ? q.data : null;
  return (
    <DesdePrimeiroTurno
      race={race}
      raceT1={raceT1}
      resumo={resumo}
      resumoT1={resumoT1}
      areas={ufs}
      areasT1={ufsT1}
      agregado={ag}
      nomeArea={(uf) => UF_NOMES[uf as UF] ?? uf}
      rotuloArea={ag ? { um: 'município', varios: 'municípios' } : { um: 'estado', varios: 'estados' }}
      rotuloTotal={ag ? undefined : '27 estados e o exterior'}
      // na grade larga (≥ 1360 px) o bloco fica na coluna estreita da direita: um finalista embaixo do outro
      grade="sm:grid-cols-2 min-[1360px]:grid-cols-1"
      simulado={simulado}
      className={className}
    />
  );
}
