/**
 * "Como esta seção votou no 1º turno": o boletim REAL da seção no 1º turno (dados abertos do TSE, votação por
 * seção) para Presidente e, nas UFs com 2º turno de governador, Governador. Sempre marcado como resultado
 * oficial — fica ao lado do boletim do 2º turno (simulado ou ao vivo).
 * Candidatos pelas corridas de `useRaces` (anônimas na simulação com nomes ocultos, como o resto da apuração).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Race, SecaoDetalhe, Tally, UF } from '@/shared/types';
import { pctBrancos, pctComparecimento, pctNulos, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct } from '@/shared/format';
import { useMunicipio, useSecao, useZona } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Skeleton } from '@/app/ui/Skeleton';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { ComparaAbrangencias, type Abrangencia } from './SecaoContexto';
import { ehNaoEncontrado } from './useDetalhe';
import { fmt4 } from './fmt';

function tallyDe(s: SecaoDetalhe): Tally {
  return {
    secoes: 1,
    secoesTotalizadas: 1,
    eleitorado: s.aptos,
    eleitoradoTotalizado: s.aptos,
    comparecimento: s.comparecimento,
    abstencao: s.abstencao,
    votos: s.votos,
    brancos: s.brancos,
    nulos: s.nulos,
  };
}

export interface PrimeiroTurnoSecaoProps {
  uf: UF;
  cod: string;
  zona: number;
  secao: number;
  /** Corridas de 1º turno disponíveis na UF (pres-t1 e, se houver, gov-xx-t1), já para exibição. */
  races: Race[];
  /** Corrida inicial (padrão: a primeira). */
  inicial?: string;
  /** Versão curta (Consulta): sem comparação com zona/município. */
  compacto?: boolean;
  nomeMunicipio?: string;
  className?: string;
}

export function PrimeiroTurnoSecao({ uf, cod, zona, secao, races, inicial, compacto, nomeMunicipio, className }: PrimeiroTurnoSecaoProps) {
  const [id, setId] = useState(() => (inicial && races.some((r) => r.id === inicial) ? inicial : races[0]?.id));
  const race = races.find((r) => r.id === id) ?? races[0];
  const q = useSecao(race?.id ?? 'pres-t1', uf, cod, zona, secao);
  const s = q.data && q.data.race === race?.id && q.data.secao === secao && q.data.zona === zona ? q.data : undefined;
  const erro = q.error ?? q.failureReason;

  if (!race) return null;
  return (
    <section className={cn('rounded-2xl border border-line bg-surface shadow-card', compacto ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className={cn('font-display font-semibold leading-tight tracking-[-0.01em] text-fg', compacto ? 'text-[16px]' : 'text-[18px]')}>
            Como esta seção votou no 1º turno
          </h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-fg">
            <Icon name="selo" size={14} />
            Resultado oficial · 4 de outubro
          </p>
        </div>
        {races.length > 1 ? (
          <Segmented
            size="sm"
            ariaLabel="Cargo no 1º turno"
            value={race.id}
            onChange={setId}
            options={races.map((r) => ({ value: r.id, label: r.cargo }))}
          />
        ) : null}
      </div>

      <div className="mt-4">
        {ehNaoEncontrado(erro) && !s ? (
          <p className="rounded-xl bg-surface-2 px-3 py-3 text-[13.5px] text-fg-muted">
            O resultado por seção do 1º turno não está disponível para esta seção.
          </p>
        ) : q.isError && !s ? (
          <p className="rounded-xl bg-surface-2 px-3 py-3 text-[13.5px] text-fg-muted">Não foi possível carregar o 1º turno agora.</p>
        ) : !s ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <Corpo race={race} s={s} compacto={compacto} uf={uf} cod={cod} zona={zona} nomeMunicipio={nomeMunicipio} />
        )}
      </div>
    </section>
  );
}

function Corpo({
  race,
  s,
  compacto,
  uf,
  cod,
  zona,
  nomeMunicipio,
}: {
  race: Race;
  s: SecaoDetalhe;
  compacto?: boolean;
  uf: UF;
  cod: string;
  zona: number;
  nomeMunicipio?: string;
}) {
  const t = tallyDe(s);
  const v = validos(t);
  return (
    <>
      <ul className="space-y-2.5" aria-label={`Votos na seção ${fmt4(s.secao)} no 1º turno, ${race.cargo}`}>
        {race.candidatos.map((c, i) => {
          const pct = v > 0 ? pctValidos(t, i) : 0;
          const slot = corSlot(c.cor);
          return (
            <li key={`${c.numero}-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
              <CandidateAvatar candidato={c} size="sm" />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  {c.sqcand && !c.agregado ? (
                    // nome real (fora da simulação anonimizada, que remove o sqcand) → ficha pública
                    <Link
                      to={`/candidato/${c.sqcand}`}
                      className="truncate text-[14px] font-medium text-fg underline decoration-line/[3] underline-offset-[3px] hover:text-brand-fg"
                    >
                      {c.nomeUrna}
                    </Link>
                  ) : (
                    <span className="truncate text-[14px] font-medium text-fg">{c.agregado ? 'Demais candidatos' : c.nomeUrna}</span>
                  )}
                  <span className={cn('num shrink-0 text-[13px] font-semibold', c.agregado ? 'text-fg-muted' : slot.text)}>{fmtPct(pct, 1)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn('h-full rounded-full', slot.bg)} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="num w-[58px] text-right text-[13px] text-fg">
                {fmtInt(s.votos[i] ?? 0)}
                <span className="block text-[10.5px] text-fg-muted">{(s.votos[i] ?? 0) === 1 ? 'voto' : 'votos'}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <dl className={cn('mt-4 grid gap-2 rounded-xl bg-surface-2 p-3 text-[12.5px]', compacto ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        {!compacto ? <Dado rotulo="Aptos" valor={fmtInt(s.aptos)} /> : null}
        <Dado rotulo={compacto ? 'Votaram' : 'Compareceram'} valor={fmtInt(s.comparecimento)} sub={fmtPct(pctComparecimento(t), 1)} />
        <Dado rotulo="Brancos" valor={fmtInt(s.brancos)} sub={fmtPct(pctBrancos(t), 1)} />
        <Dado rotulo="Nulos" valor={fmtInt(s.nulos)} sub={fmtPct(pctNulos(t), 1)} />
      </dl>
      {!compacto ? <Comparacao race={race} t={t} uf={uf} cod={cod} zona={zona} secao={s.secao} nomeMunicipio={nomeMunicipio ?? s.nomeMunicipio} /> : null}
      <p className="mt-3 text-[11.5px] leading-snug text-fg-subtle">
        Votação por seção dos dados abertos do TSE (boletins de urna do 1º turno). % sobre os votos válidos.
      </p>
    </>
  );
}

function Comparacao({ race, t, uf, cod, zona, secao, nomeMunicipio }: { race: Race; t: Tally; uf: UF; cod: string; zona: number; secao: number; nomeMunicipio: string }) {
  const qz = useZona(race.id, uf, cod, zona);
  const qm = useMunicipio(race.id, uf, cod);
  const z = qz.data && qz.data.race === race.id && qz.data.zona === zona && qz.data.cod === cod ? qz.data.resumo : null;
  const m = qm.data && qm.data.race === race.id && qm.data.cod === cod ? qm.data.resumo : null;
  const linhas: Abrangencia[] = [
    { rotulo: `Seção ${fmt4(secao)}`, sub: 'esta urna', t, destaque: true },
    { rotulo: `Zona ${fmt4(zona)}`, t: z },
    { rotulo: nomeMunicipio, t: m },
  ];
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] font-medium text-fg-muted">Comparada com a zona e o município (1º turno)</p>
      <ComparaAbrangencias race={race} linhas={linhas} />
    </div>
  );
}

function Dado({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{rotulo}</dt>
      <dd className="num mt-0.5 text-[14px] font-semibold text-fg">
        {valor}
        {sub ? <span className="ml-1 text-[11px] font-normal text-fg-muted">{sub}</span> : null}
      </dd>
    </div>
  );
}
