/**
 * O cenário estado a estado: painel do mapa (toque numa UF para ver os números) e a lista das 27 UFs + exterior
 * (alternativa acessível ao mapa), ordenável por disputa, nome ou eleitorado.
 */
import { useMemo, useState } from 'react';
import type { UF, UFBr } from '@/shared/types';
import type { GeoBrasil } from '@/shared/dataset';
import type { ResultadoCenario, ResultadoUfCenario } from '@/shared/cenarios';
import { margemArea, pctBrancosNulosArea, pctComparecimentoArea, pctFinalista, vencedorArea } from '@/shared/cenarios';
import { pctValidos } from '@/shared/calc';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { fmtCompact, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { LegendaMapaCenario, MapaCenario } from './MapaCenario';
import { fmtMargem } from './Placar';
import type { Nomes } from './Controles';

const cartao = 'rounded-2xl border border-line bg-surface shadow-card';

function MiniBarra({ u, className }: { u: ResultadoUfCenario; className?: string }) {
  const pa = pctFinalista(u, 0);
  return (
    <div className={cn('relative', className)} aria-hidden>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        <div className="h-full bg-cand-a transition-[width] duration-300" style={{ width: `${pa}%` }} />
        <div className="h-full flex-1 bg-cand-b" />
      </div>
      <span className="absolute -bottom-0.5 -top-0.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-fg/70" />
    </div>
  );
}

/** Números de uma UF no cenário (e a referência do 1º turno entre os dois finalistas). */
export function DetalheUf({ u, nomes, onFechar }: { u: ResultadoUfCenario; nomes: Nomes; onFechar?: () => void }) {
  const v = vencedorArea(u);
  const m = margemArea(u);
  const nome = UF_NOMES[u.uf];
  const t1 = { votos: u.votosT1 };
  const mudou = v !== null && u.liderT1 !== null && v !== u.liderT1 && u.uf !== 'ZZ';
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-semibold leading-tight text-fg">{nome}</p>
          <p className="text-[12px] text-fg-subtle">
            {u.uf === 'ZZ' ? 'Votos no exterior' : REGIAO_NOMES[UF_REGIAO[u.uf]]} · <span className="num">{fmtCompact(u.eleitorado)}</span> eleitores
          </p>
        </div>
        {onFechar ? (
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="fechar" size={16} />
          </button>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className={cn('num font-display text-[24px] font-semibold leading-none', corSlot('a').textDisplay)}>{fmtPct(pctFinalista(u, 0))}</span>
          <span className="ml-1.5 truncate text-[12.5px] text-fg-muted">{nomes.a}</span>
        </span>
        <span className="min-w-0 text-right">
          <span className="mr-1.5 truncate text-[12.5px] text-fg-muted">{nomes.b}</span>
          <span className={cn('num font-display text-[24px] font-semibold leading-none', corSlot('b').textDisplay)}>{fmtPct(pctFinalista(u, 1))}</span>
        </span>
      </div>
      <MiniBarra u={u} className="mt-2" />
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">{nomes.a}</dt>
          <dd className="num text-fg">{fmtInt(u.votos[0])}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">{nomes.b}</dt>
          <dd className="num text-fg">{fmtInt(u.votos[1])}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Diferença</dt>
          <dd className="num text-fg">{m.lider === null ? 'empate' : fmtMargem(m.pp)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Comparecimento</dt>
          <dd className="num text-fg">{fmtPct(pctComparecimentoArea(u), 1)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">Brancos e nulos</dt>
          <dd className="num text-fg">{fmtPct(pctBrancosNulosArea(u), 1)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">1º turno (entre os 2)</dt>
          <dd className="num text-fg">
            <span className={corSlot('a').text}>{fmtPct(pctValidos(t1, 0), 1)}</span> × <span className={corSlot('b').text}>{fmtPct(pctValidos(t1, 1), 1)}</span>
          </dd>
        </div>
      </dl>
      {mudou ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-fg">
          <Icon name="troca" size={15} className="mt-px shrink-0 text-brand-fg" />
          Muda de lado: no 1º turno, entre os dois, {u.liderT1 === 0 ? nomes.a : nomes.b} estava à frente aqui.
        </p>
      ) : null}
    </div>
  );
}

export function PainelMapa({
  geo,
  resultado: r,
  nomes,
  selecionada,
  onSelect,
}: {
  geo: GeoBrasil | undefined;
  resultado: ResultadoCenario;
  nomes: Nomes;
  selecionada: UF | null;
  onSelect: (uf: UF | null) => void;
}) {
  const [hover, setHover] = useState<UFBr | null>(null);
  const foco = selecionada ?? hover;
  const u = foco ? r.ufs.find((x) => x.uf === foco) : undefined;
  return (
    <section aria-labelledby="mapa-cenario" className={cn(cartao, 'overflow-hidden')}>
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 id="mapa-cenario" className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            Mapa do seu cenário
          </h2>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">Quem fica à frente em cada estado</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cand-a" />
            <span className="max-w-[9rem] truncate text-fg-muted">{nomes.a}</span>
            <span className="num font-semibold text-fg">{fmtInt(r.estados[0])}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cand-b" />
            <span className="max-w-[9rem] truncate text-fg-muted">{nomes.b}</span>
            <span className="num font-semibold text-fg">{fmtInt(r.estados[1])}</span>
          </span>
        </div>
      </header>
      <div className="px-2 pt-2 sm:px-4">
        {geo ? (
          <MapaCenario
            geo={geo}
            resultado={r}
            selecionada={selecionada && selecionada !== 'ZZ' ? (selecionada as UFBr) : null}
            destaque={hover}
            onSelect={(uf) => onSelect(selecionada === uf ? null : uf)}
            onHover={setHover}
            mudancas
            ariaLabel={`Mapa do cenário: ${nomes.a} à frente em ${r.estados[0]} estados e ${nomes.b} em ${r.estados[1]}. A lista de estados abaixo traz os números de cada um.`}
          />
        ) : (
          <div className="aspect-[1116/1000] w-full animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />
        )}
      </div>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {u ? (
          <DetalheUf u={u} nomes={nomes} onFechar={selecionada ? () => onSelect(null) : undefined} />
        ) : (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line px-3.5 py-3 text-[13px] text-fg-muted">
            <Icon name="pin" size={16} className="shrink-0 text-brand-fg" />
            Toque num estado para ver os números do cenário.
          </p>
        )}
        <LegendaMapaCenario nomes={nomes} mudancas className="mt-4" />
      </div>
    </section>
  );
}

type Ordem = 'disputa' | 'nome' | 'eleitorado';

export function ListaUfs({
  resultado: r,
  nomes,
  selecionada,
  onSelect,
}: {
  resultado: ResultadoCenario;
  nomes: Nomes;
  selecionada: UF | null;
  onSelect: (uf: UF | null) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>('disputa');
  const linhas = useMemo(() => {
    const br = r.ufs.filter((u) => u.uf !== 'ZZ');
    const zz = r.ufs.filter((u) => u.uf === 'ZZ');
    const ord = [...br].sort((x, y) => {
      if (ordem === 'nome') return UF_NOMES[x.uf].localeCompare(UF_NOMES[y.uf], 'pt-BR');
      if (ordem === 'eleitorado') return y.eleitorado - x.eleitorado;
      return margemArea(x).pp - margemArea(y).pp;
    });
    return [...ord, ...zz];
  }, [r, ordem]);
  return (
    <section aria-labelledby="lista-ufs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="lista-ufs" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
            Estado por estado
          </h2>
          <p className="mt-0.5 text-[13.5px] text-fg-muted">% dos votos válidos no seu cenário. Toque para ver os detalhes.</p>
        </div>
        <Segmented<Ordem>
          ariaLabel="Ordenar estados"
          size="sm"
          value={ordem}
          onChange={setOrdem}
          options={[
            { value: 'disputa', label: 'Mais disputados' },
            { value: 'nome', label: 'A–Z' },
            { value: 'eleitorado', label: 'Eleitorado' },
          ]}
        />
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {linhas.map((u) => {
          const aberto = selecionada === u.uf;
          const v = vencedorArea(u);
          const mudou = v !== null && u.liderT1 !== null && v !== u.liderT1 && u.uf !== 'ZZ';
          return (
            <li key={u.uf} className={cn(aberto && 'sm:col-span-2 xl:col-span-1')}>
              <button
                type="button"
                aria-expanded={aberto}
                onClick={() => onSelect(aberto ? null : u.uf)}
                className={cn(
                  'w-full rounded-xl border bg-surface px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  aberto ? 'border-fg/40' : 'border-line hover:bg-surface-2',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 shrink-0 font-mono text-[12px] font-semibold text-fg-subtle">{u.uf === 'ZZ' ? 'EX' : u.uf}</span>
                    <span className="truncate text-[14px] font-medium text-fg">{UF_NOMES[u.uf]}</span>
                    {mudou ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/15 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand-fg">
                        <Icon name="troca" size={11} />
                        virada
                      </span>
                    ) : null}
                  </span>
                  <span className="num shrink-0 text-[12px] text-fg-subtle">{margemArea(u).lider === null ? 'empate' : `dif. ${fmtMargem(margemArea(u).pp)}`}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className={cn('num w-[2.9rem] shrink-0 text-[12.5px] font-semibold', corSlot('a').text)}>{fmtPct(pctFinalista(u, 0), 1)}</span>
                  <MiniBarra u={u} className="min-w-0 flex-1" />
                  <span className={cn('num w-[2.9rem] shrink-0 text-right text-[12.5px] font-semibold', corSlot('b').text)}>{fmtPct(pctFinalista(u, 1), 1)}</span>
                </div>
              </button>
              {aberto ? (
                <div className="mt-2">
                  <DetalheUf u={u} nomes={nomes} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
