/**
 * Seção "Estados": as 27 UFs + Exterior com % apurado, líder e margem agora (Presidente), e os ajustes por UF
 * do cenário: viés (ufVies, p.p.) e atraso na totalização (ufAtraso, min). Edição em rascunho, aplicada em lote.
 */
import { useMemo, useState } from 'react';
import type { CorCandidato, Regiao, Summary, UF } from '@/shared/types';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { UFS } from '@/shared/types';
import { margem, pctTotalizadas } from '@/shared/calc';
import { fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Button, Segmented } from '@/app/ui';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Cronometro, NotaNomesOcultos, Painel, Passo, textoVies, ViesSlider } from './kit';
import { fmtMs } from './rotulos';

const TODAS: UF[] = [...UFS, 'ZZ'];
const REGIOES: Regiao[] = ['N', 'NE', 'CO', 'SE', 'S', 'EX'];
type Filtro = 'todas' | 'ajustadas' | Regiao;

export function SecaoEstados() {
  const { snap, nacional, pres, run, pendente, pendenteDesde, confirmar, anon, irPara } = useAdmin();
  const cen = snap.state.cenario;
  const [vies, setVies] = useState<Partial<Record<UF, number>>>({});
  const [atraso, setAtraso] = useState<Partial<Record<UF, number>>>({});
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const nomes: [string, string] = [pres?.candidatos[0]?.nomeUrna ?? 'A', pres?.candidatos[1]?.nomeUrna ?? 'B'];
  const ocupado = pendente('estados');

  const viesDe = (uf: UF) => vies[uf] ?? cen.ufVies[uf] ?? 0;
  const atrasoDe = (uf: UF) => atraso[uf] ?? cen.ufAtraso[uf] ?? 0;
  const mudouVies = (uf: UF) => vies[uf] !== undefined && vies[uf] !== (cen.ufVies[uf] ?? 0);
  const mudouAtraso = (uf: UF) => atraso[uf] !== undefined && atraso[uf] !== (cen.ufAtraso[uf] ?? 0);
  const alteradas = TODAS.filter((uf) => mudouVies(uf) || mudouAtraso(uf));
  const ajustadas = TODAS.filter((uf) => (cen.ufVies[uf] ?? 0) !== 0 || (cen.ufAtraso[uf] ?? 0) !== 0);

  const lista = useMemo(() => {
    const base = [...TODAS].sort((a, b) =>
      a === 'ZZ' ? 1 : b === 'ZZ' ? -1 : UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'),
    );
    if (filtro === 'todas') return base;
    if (filtro === 'ajustadas') return base.filter((uf) => ajustadas.includes(uf) || alteradas.includes(uf));
    return base.filter((uf) => UF_REGIAO[uf] === filtro);
  }, [filtro, ajustadas, alteradas]);

  async function aplicar() {
    const ufVies: Partial<Record<UF, number>> = {};
    const ufAtraso: Partial<Record<UF, number>> = {};
    for (const uf of alteradas) {
      if (mudouVies(uf)) ufVies[uf] = vies[uf] ?? 0;
      if (mudouAtraso(uf)) ufAtraso[uf] = atraso[uf] ?? 0;
    }
    const parcial: { ufVies?: typeof ufVies; ufAtraso?: typeof ufAtraso } = {};
    if (Object.keys(ufVies).length) parcial.ufVies = ufVies;
    if (Object.keys(ufAtraso).length) parcial.ufAtraso = ufAtraso;
    const n = alteradas.length;
    const ok = await run(
      { tipo: 'cenario', cenario: parcial },
      { chave: 'estados', sucesso: (s) => `${n} ${n === 1 ? 'UF ajustada' : 'UFs ajustadas'} · modelo em ${fmtMs(s.metrics.modeloMs)}` },
    );
    if (ok) {
      setVies({});
      setAtraso({});
    }
  }

  async function zerar() {
    const sim = await confirmar({
      titulo: 'Zerar os ajustes de todas as UFs?',
      descricao: `Remove o viés e o atraso de ${ajustadas.length} ${ajustadas.length === 1 ? 'UF' : 'UFs'}.`,
      corpo: 'O modelo é reconstruído e os números do site mudam na hora para todos os visitantes.',
      confirmar: 'Zerar ajustes',
      perigo: true,
    });
    if (!sim) return;
    const ufVies = Object.fromEntries(Object.keys(cen.ufVies).map((k) => [k, 0])) as Partial<Record<UF, number>>;
    const ufAtraso = Object.fromEntries(Object.keys(cen.ufAtraso).map((k) => [k, 0])) as Partial<Record<UF, number>>;
    const ok = await run({ tipo: 'cenario', cenario: { ufVies, ufAtraso } }, { chave: 'estados', sucesso: 'Ajustes por UF zerados' });
    if (ok) {
      setVies({});
      setAtraso({});
    }
  }

  const opcoesFiltro = [
    { value: 'todas' as Filtro, label: 'Todas' },
    { value: 'ajustadas' as Filtro, label: `Ajustadas${ajustadas.length ? ` (${ajustadas.length})` : ''}` },
    ...REGIOES.map((r) => ({ value: r as Filtro, label: r === 'EX' ? 'Exterior' : r, ariaLabel: REGIAO_NOMES[r] })),
  ];

  return (
    <div>
      <CabecalhoSecao
        titulo="Estados"
        icone="mapa"
        descricao="Situação de cada UF agora (Presidente) e ajustes do cenário por UF. Edite à vontade: nada muda até aplicar."
        acoes={anon ? <NotaNomesOcultos onClick={() => irPara('fonte')} /> : undefined}
      />
      <Callout tom="info" className="mb-5">
        O <strong className="font-semibold text-fg">viés</strong> desloca a preferência só naquela UF (na corrida para Presidente) e,
        por isso, também move o resultado nacional. O <strong className="font-semibold text-fg">atraso</strong> soma minutos à chegada
        das seções da UF. Duplo clique no controle de viés volta ao neutro.
      </Callout>

      <Painel semPadding>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1 py-0.5 scrollbar-none">
            <Segmented<Filtro> ariaLabel="Filtrar UFs" size="sm" options={opcoesFiltro} value={filtro} onChange={setFiltro} />
          </div>
          <span className="text-[12.5px] text-fg-muted">
            <span className="num font-semibold text-fg">{lista.length}</span> {lista.length === 1 ? 'UF' : 'UFs'}
          </span>
        </div>

        {/* cabeçalho (desktop) */}
        <div
          className="hidden items-center gap-4 border-b border-line bg-surface-2/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted xl:grid xl:grid-cols-[minmax(150px,1.25fr)_96px_minmax(140px,1fr)_minmax(250px,1.6fr)_128px]"
          aria-hidden
        >
          <span>Estado</span>
          <span>Apurado</span>
          <span>Líder · margem</span>
          <span>Viés (Presidente)</span>
          <span className="text-right">Atraso</span>
        </div>

        <ul aria-label="Unidades da federação">
          {lista.map((uf) => (
            <LinhaUf
              key={uf}
              uf={uf}
              resumo={nacional?.ufs[uf]}
              nomes={nomes}
              cores={[pres?.candidatos[0]?.cor ?? 'a', pres?.candidatos[1]?.cor ?? 'b']}
              vies={viesDe(uf)}
              atraso={atrasoDe(uf)}
              alterada={mudouVies(uf) || mudouAtraso(uf)}
              onVies={(x) => setVies((v) => ({ ...v, [uf]: x }))}
              onAtraso={(x) => setAtraso((v) => ({ ...v, [uf]: x }))}
            />
          ))}
          {lista.length === 0 ? (
            <li className="px-5 py-10 text-center text-[14px] text-fg-muted">Nenhuma UF com ajustes. Use os controles em “Todas”.</li>
          ) : null}
        </ul>

        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-5 lg:bottom-0">
          <span className="mr-auto min-w-0 truncate text-[12.5px] text-fg-muted sm:text-[13px]" aria-live="polite">
            {alteradas.length ? (
              <>
                <span className="num font-semibold text-brand-fg">{alteradas.length}</span> {alteradas.length === 1 ? 'alterada' : 'alteradas'}
                <span className="hidden sm:inline"> · não aplicado</span>
              </>
            ) : ajustadas.length ? (
              <>
                <span className="num font-semibold text-fg">{ajustadas.length}</span> {ajustadas.length === 1 ? 'UF ajustada' : 'UFs ajustadas'}
                <span className="hidden sm:inline"> no ar</span>
              </>
            ) : (
              'Sem ajustes por UF'
            )}
          </span>
          {ajustadas.length && !alteradas.length ? (
            <Button variant="ghost" icon="reset" onClick={zerar} disabled={ocupado} className="shrink-0 px-3 sm:px-4">
              Zerar
            </Button>
          ) : null}
          {alteradas.length ? (
            <Button
              variant="outline"
              onClick={() => {
                setVies({});
                setAtraso({});
              }}
              disabled={ocupado}
              className="shrink-0 px-3 sm:px-4"
            >
              Descartar
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon="check"
            onClick={aplicar}
            disabled={!alteradas.length || ocupado}
            loading={ocupado}
            className="shrink-0 px-3.5 sm:px-4"
          >
            {ocupado ? (
              <>
                <span className="hidden sm:inline">Reconstruindo…</span> <Cronometro desde={pendenteDesde('estados')} />
              </>
            ) : (
              <>
                Aplicar<span className="hidden sm:inline"> em lote</span>
                {alteradas.length ? <span className="num"> ({alteradas.length})</span> : null}
              </>
            )}
          </Button>
        </div>
      </Painel>
    </div>
  );
}

function LinhaUf({
  uf,
  resumo,
  nomes,
  cores,
  vies,
  atraso,
  alterada,
  onVies,
  onAtraso,
}: {
  uf: UF;
  resumo: Summary | undefined;
  nomes: [string, string];
  cores: [CorCandidato, CorCandidato];
  vies: number;
  atraso: number;
  alterada: boolean;
  onVies: (v: number) => void;
  onAtraso: (v: number) => void;
}) {
  const pct = resumo ? pctTotalizadas(resumo) : 0;
  const m = resumo ? margem(resumo) : null;
  // "Candidato A/B" quando anonimizado; com nomes reais, só o primeiro nome (cabe ao lado do controle)
  const anonimos = nomes.every((n) => /^Candidato [AB]$/.test(n));
  const curtos = (anonimos ? ['A', 'B'] : nomes.map((n) => n.split(' ')[0])) as [string, string];
  const lider = m && m.lider !== null ? m.lider : null;
  const slot = lider !== null ? corSlot(cores[lider] ?? 'outros') : null;
  const sublinha = (
    <>
      <span className="num">{fmtPct(pct, 1)}</span> apurado
      {lider !== null && m ? (
        <>
          {' · '}
          <span className={cn('font-medium', slot?.text)}>{nomes[lider]}</span> <span className="num">{fmtPP(m.pp)}</span>
        </>
      ) : null}
    </>
  );
  return (
    <li
      className={cn(
        'relative grid grid-cols-1 gap-2.5 border-b border-line px-4 py-3.5 transition-colors sm:px-5',
        'md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] md:items-center md:gap-6',
        'xl:grid-cols-[minmax(150px,1.25fr)_96px_minmax(140px,1fr)_minmax(250px,1.6fr)_128px] xl:gap-4 xl:py-2.5',
        alterada && 'bg-brand/[0.06]',
      )}
    >
      {alterada ? <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-brand" /> : null}
      {/* estado + (abaixo de xl) apurado/líder; no celular, o atraso fica na mesma linha do nome */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:flex">
        <span className="row-span-2 inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 font-mono text-[12.5px] font-semibold text-fg">
          {uf}
        </span>
        <div className="min-w-0 md:flex-1">
          <p className="truncate text-[14px] font-medium leading-snug text-fg">{UF_NOMES[uf]}</p>
          <p className="hidden truncate text-[12px] leading-snug text-fg-muted md:block xl:hidden">{sublinha}</p>
        </div>
        <Passo
          valor={atraso}
          onChange={onAtraso}
          min={0}
          max={600}
          passo={5}
          sufixo="min"
          icone="relogio"
          rotulo={`Atraso em ${UF_NOMES[uf]} (minutos)`}
          className="md:hidden"
        />
        <p className="col-span-2 col-start-2 truncate text-[12px] leading-snug text-fg-muted md:hidden">{sublinha}</p>
      </div>
      {/* apurado */}
      <div className="hidden min-w-0 xl:block">
        <span className="num text-[13.5px] font-semibold text-fg">{fmtPct(pct, 1)}</span>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="block h-full rounded-full bg-brand-grad transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </span>
      </div>
      {/* líder */}
      <div className="hidden min-w-0 xl:block">
        {lider !== null && m ? (
          <p className="flex min-w-0 items-baseline gap-2 text-[13.5px]">
            <span className={cn('inline-flex min-w-0 items-center gap-1.5 font-medium', slot?.text)}>
              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', slot?.bg)} />
              <span className="truncate">{nomes[lider]}</span>
            </span>
            <span className="num shrink-0 text-fg-muted">{fmtPP(m.pp)}</span>
          </p>
        ) : (
          <span className="text-[13px] text-fg-subtle">{pct > 0 ? 'Empate' : 'Aguardando'}</span>
        )}
      </div>
      {/* viés */}
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className={cn('shrink-0 truncate text-right text-[11.5px] font-semibold', corSlot(cores[0]).text, anonimos ? 'w-7' : 'w-[4.75rem]')} aria-hidden>
            ← {curtos[0]}
          </span>
          <ViesSlider valor={vies} onChange={onVies} nomes={nomes} cores={cores} rotulo={`Viés em ${UF_NOMES[uf]}`} />
          <span className={cn('shrink-0 truncate text-[11.5px] font-semibold', corSlot(cores[1]).text, anonimos ? 'w-7' : 'w-[4.75rem]')} aria-hidden>
            {curtos[1]} →
          </span>
        </div>
        <p className={cn('num mt-0.5 text-center text-[11.5px]', vies ? 'font-semibold text-fg' : 'text-fg-subtle')}>{textoVies(vies, nomes)}</p>
      </div>
      {/* atraso */}
      <div className="hidden items-center justify-end md:flex">
        <Passo valor={atraso} onChange={onAtraso} min={0} max={600} passo={5} sufixo="min" rotulo={`Atraso em ${UF_NOMES[uf]} (minutos)`} />
      </div>
    </li>
  );
}
