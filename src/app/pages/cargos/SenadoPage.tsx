/**
 * /senado — Senado no 1º turno de 2026 (resultado oficial): 2 vagas por UF, 54 das 81 cadeiras.
 *
 *  - mapa (cartograma) com as 2 vagas de cada UF pintadas pela cor NEUTRA do partido do eleito;
 *  - composição das 54 vagas por partido (hemiciclo + bancadas, maior primeiro);
 *  - grade com os 2 eleitos de cada UF (foto oficial, nome → ficha, partido, votos e %);
 *  - toque numa UF → lista completa dos candidatos dela (painel; `?uf=` na URL para compartilhar).
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CargoUfResultado } from '@/shared/dataset';
import type { UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPct } from '@/shared/format';
import { pctBrancos, pctNulos } from '@/shared/calc';
import { useCargo } from '@/app/data/estatico';
import { cn } from '@/app/lib/cn';
import { SearchBox } from '@/app/ui/SearchBox';
import { Sheet } from '@/app/ui/Sheet';
import { Icon } from '@/app/ui/Icon';
import { casa } from '@/app/ui/textMatch';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { Hemiciclo, type Assento } from '@/app/components/pages/cargos/Hemiciclo';
import { BancadasGrade, type Bancada } from '@/app/components/pages/cargos/Bancadas';
import { MapaUfs, type CelulaUf } from '@/app/components/pages/cargos/MapaUfs';
import { corPartido, porTamanho } from '@/app/components/pages/cargos/partidos';
import { useFichasGrupo, ehEleito } from '@/app/components/pages/cargos/dados';
import { FotoOficial } from '@/app/components/pages/cargos/FotoOficial';
import { CandidatoLinha, FonteTse, NomeLink, PartidoChip } from '@/app/components/pages/cargos/ui';
import { NavCargos } from '@/app/components/pages/cargos/NavCargos';

const GRUPO = 'senado';

export default function SenadoPage() {
  useTitulo('Senado · 1º turno');
  const q = useCargo('senado');
  const fichas = useFichasGrupo(GRUPO);
  const [params, setParams] = useSearchParams();
  const ufParam = params.get('uf')?.toUpperCase() as UFBr | undefined;
  const ufSel = ufParam && (UFS as readonly string[]).includes(ufParam) ? ufParam : null;
  const [destaque, setDestaque] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const porUf = useMemo(() => {
    const m = new Map<UFBr, CargoUfResultado>();
    for (const u of q.data?.ufs ?? []) m.set(u.uf as UFBr, u);
    return m;
  }, [q.data]);

  const bancadas: Bancada[] = useMemo(
    () => porTamanho((q.data?.composicao ?? []).map((c) => ({ sigla: c.sigla, eleitos: c.eleitos })), (b) => b.eleitos),
    [q.data],
  );

  // Cadeiras do hemiciclo: os 54 eleitos, agrupados por partido (maior bancada primeiro), mais votado primeiro.
  const assentos: Assento[] = useMemo(() => {
    const ordem = new Map(bancadas.map((b, i) => [b.sigla, i]));
    const eleitos = [...porUf.values()].flatMap((u) =>
      u.candidatos.filter((c) => ehEleito(c.situacao)).map((c) => ({ ...c, uf: u.uf })),
    );
    eleitos.sort((a, b) => (ordem.get(a.partido) ?? 99) - (ordem.get(b.partido) ?? 99) || b.votos - a.votos);
    return eleitos.map((c) => ({
      id: c.sqcand,
      partido: c.partido,
      nome: c.nomeUrna,
      sub: `${c.uf} · ${fmtInt(c.votos)} votos (${fmtPct(c.pct, 1)})`,
      href: fichas.porSq.has(c.sqcand) || !fichas.isSuccess ? `/candidato/${c.sqcand}` : undefined,
    }));
  }, [porUf, bancadas, fichas.porSq, fichas.isSuccess]);

  const celulas = useMemo(() => {
    const out: Partial<Record<UFBr, CelulaUf>> = {};
    for (const [uf, u] of porUf) {
      const el = u.candidatos.filter((c) => ehEleito(c.situacao)).slice(0, 2);
      out[uf] = {
        faixas: el.map((c) => corPartido(c.partido)),
        rotulo: `${UF_NOMES[uf]}: ${el.map((c) => `${c.nomeUrna} (${c.partido})`).join(' e ')}`,
        dica: (
          <span className="block min-w-[150px]">
            <span className="block text-[12px] font-semibold text-fg">{UF_NOMES[uf]}</span>
            {el.map((c) => (
              <span key={c.sqcand} className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-muted">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: corPartido(c.partido) }} />
                <span className="font-medium text-fg">{c.nomeUrna}</span> {c.partido}
              </span>
            ))}
          </span>
        ),
      };
    }
    return out;
  }, [porUf]);

  const ufsFiltradas = useMemo(() => {
    const t = busca.trim();
    return UFS.filter((uf) => {
      const u = porUf.get(uf);
      if (!u) return false;
      if (!t) return true;
      const el = u.candidatos.filter((c) => ehEleito(c.situacao));
      return casa(`${uf} ${UF_NOMES[uf]} ${el.map((c) => `${c.nomeUrna} ${c.partido}`).join(' ')}`, t);
    });
  }, [porUf, busca]);

  function abrirUf(uf: UFBr | null) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (uf) p.set('uf', uf.toLowerCase());
        else p.delete('uf');
        return p;
      },
      { replace: !uf, preventScrollReset: true },
    );
  }

  if (q.isError) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }
  if (!q.data) {
    return (
      <Container wide>
        <LoadingState variant="pagina" />
      </Container>
    );
  }

  const totalVagas = q.data.ufs.reduce((a, u) => a + u.vagas, 0);
  const ufAberta = ufSel ? porUf.get(ufSel) : undefined;

  return (
    <Container wide>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Icon name="selo" size={14} /> 1º turno · resultado oficial
          </span>
        }
        title="Senado"
        subtitle={
          <>
            Em 2026 cada estado e o Distrito Federal elegeram <span className="num">2</span> senadores:{' '}
            <span className="num">{fmtInt(totalVagas)}</span> das <span className="num">81</span> cadeiras, para mandatos de 8 anos.
          </>
        }
      >
        <NavCargos atual="senado" />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:col-span-5" aria-labelledby="mapa-senado">
          <h2 id="mapa-senado" className="font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">
            Quem ganhou em cada estado
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-fg-muted">
            Cada bloco é uma UF; as duas faixas são as duas vagas, na cor do partido de cada eleito. Toque para ver todos os candidatos.
          </p>
          <MapaUfs
            celulas={celulas}
            selecionada={ufSel}
            onSelect={(uf) => abrirUf(uf)}
            ariaLabel="Senadores eleitos por estado"
            className="mt-5"
          />
          <LegendaPartidos bancadas={bancadas} className="mt-5 border-t border-line pt-4" />
        </section>

        <section
          className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:col-span-7"
          aria-labelledby="composicao-senado"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="composicao-senado" className="font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">
              As <span className="num">{fmtInt(totalVagas)}</span> vagas por partido
            </h2>
            <span className="text-[12.5px] text-fg-muted">Eleitos em 2026 · maior bancada primeiro</span>
          </div>
          <div className="mx-auto mt-4 max-w-[600px]">
            <Hemiciclo
              assentos={assentos}
              destaque={destaque}
              onDestaque={setDestaque}
              ariaLabel={`Hemiciclo com os ${totalVagas} senadores eleitos em 2026, por partido: ${bancadas.map((b) => `${b.sigla} ${b.eleitos}`).join(', ')}`}
              centro={
                <>
                  <span className="num font-display text-[34px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[40px]">
                    {fmtInt(totalVagas)}
                  </span>
                  <span className="mt-1 text-[12px] text-fg-muted">vagas em 2026</span>
                </>
              }
            />
          </div>
          <BancadasGrade bancadas={bancadas} total={totalVagas} destaque={destaque} onDestaque={setDestaque} className="mt-5 border-t border-line pt-4" />
          <p className="mt-4 text-[12.5px] leading-snug text-fg-muted">
            As outras <span className="num">27</span> cadeiras são dos senadores eleitos em 2022, com mandato até 2031.
          </p>
        </section>
      </div>

      <Section
        id="eleitos"
        title="Os eleitos de cada estado"
        description="Os dois mais votados de cada UF. Toque no nome para ver a ficha; no cartão, para ver todos os candidatos."
      >
        <SearchBox
          value={busca}
          onChange={setBusca}
          size="sm"
          placeholder="Filtrar por estado, nome ou partido"
          ariaLabel="Filtrar estados por nome, senador ou partido"
          className="mb-4 sm:max-w-[340px]"
        />
        {ufsFiltradas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-fg-muted">
            Nenhum estado ou senador com “{busca}”.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ufsFiltradas.map((uf) => (
              <li key={uf}>
                <CartaoUf u={porUf.get(uf)!} uf={uf} comFicha={(sq) => fichas.porSq.has(sq)} generoDe={(sq) => fichas.porSq.get(sq)?.genero} onAbrir={() => abrirUf(uf)} />
              </li>
            ))}
          </ul>
        )}
        <FonteTse className="mt-5" />
      </Section>

      <Sheet
        open={!!ufAberta}
        onClose={() => abrirUf(null)}
        title={ufSel ? `Senado · ${UF_NOMES[ufSel]}` : 'Senado'}
        description={ufAberta ? `${fmtInt(ufAberta.candidatos.length)} candidatos · 2 vagas · % dos votos válidos` : undefined}
        width="lg"
      >
        {ufAberta ? <DetalheUf u={ufAberta} comFicha={(sq) => fichas.porSq.has(sq)} generoDe={(sq) => fichas.porSq.get(sq)?.genero} /> : null}
      </Sheet>
    </Container>
  );
}

function LegendaPartidos({ bancadas, className }: { bancadas: Bancada[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1.5', className)} aria-label="Legenda: partidos e nº de eleitos">
      {bancadas.map((b) => (
        <li key={b.sigla} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: corPartido(b.sigla) }} />
          <span className="font-medium text-fg">{b.sigla}</span>
          <span className="num">{b.eleitos}</span>
        </li>
      ))}
    </ul>
  );
}

function CartaoUf({
  u,
  uf,
  comFicha,
  generoDe,
  onAbrir,
}: {
  u: CargoUfResultado;
  uf: UFBr;
  comFicha: (sq: string) => boolean;
  generoDe: (sq: string) => string | undefined;
  onAbrir: () => void;
}) {
  const eleitos = u.candidatos.filter((c) => ehEleito(c.situacao)).slice(0, 2);
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line/[2.5]">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-display text-[16px] font-semibold tracking-[-0.01em] text-fg">
          {UF_NOMES[uf]} <span className="font-mono text-[12px] font-semibold text-fg-subtle">{uf}</span>
        </h3>
        <button
          type="button"
          onClick={onAbrir}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-brand-fg transition-colors after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`Ver os ${u.candidatos.length} candidatos ao Senado em ${UF_NOMES[uf]}`}
        >
          <span className="num">{u.candidatos.length}</span> candidatos
          <Icon name="chevron-direita" size={14} />
        </button>
      </header>
      <ul className="grid grid-cols-2 gap-3">
        {eleitos.map((c) => (
          <li key={c.sqcand} className="relative z-[1] flex min-w-0 flex-col items-start gap-2 min-[1100px]:flex-row min-[1100px]:items-center">
            <FotoOficial sqcand={c.sqcand} fotoGrupo={GRUPO} nome={c.nomeUrna} tamanho="xl" />
            <div className="w-full min-w-0">
              <NomeLink
                sqcand={c.sqcand}
                nome={c.nomeUrna}
                comFicha={comFicha(c.sqcand)}
                quebra
                className="text-[14.5px] font-semibold leading-tight text-fg"
              />
              <PartidoChip sigla={c.partido} numero={c.numero} className="mt-1 max-w-full" />
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="num font-display text-[17px] font-semibold leading-none text-fg">{fmtPct(c.pct)}</span>
                <span className="num text-[11.5px] text-fg-muted">{fmtInt(c.votos)} votos</span>
              </div>
              <span className="sr-only">{generoDe(c.sqcand) === 'Feminino' ? 'Eleita' : 'Eleito'}</span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function DetalheUf({
  u,
  comFicha,
  generoDe,
}: {
  u: CargoUfResultado;
  comFicha: (sq: string) => boolean;
  generoDe: (sq: string) => string | undefined;
}) {
  const maior = Math.max(1, ...u.candidatos.map((c) => c.pct));
  // Cada eleitor tem 2 votos para o Senado: brancos e nulos em % do total de votos (válidos + brancos + nulos).
  const t = { brancos: u.brancos, nulos: u.nulos, comparecimento: u.validos + u.brancos + u.nulos };
  return (
    <div>
      <ol className="divide-y divide-line">
        {u.candidatos.map((c, i) => (
          <li key={c.sqcand} className="py-3 first:pt-0">
            <CandidatoLinha
              c={{ ...c, genero: generoDe(c.sqcand) }}
              fotoGrupo={GRUPO}
              comFicha={comFicha(c.sqcand)}
              posicao={i + 1}
              tamanhoFoto="md"
              barra={(c.pct / maior) * 100}
            />
          </li>
        ))}
      </ol>
      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 text-[13px] sm:grid-cols-4">
        <Dado rotulo="Votos válidos" valor={fmtInt(u.validos)} sub="2 votos por eleitor" />
        <Dado rotulo="Comparecimento" valor={fmtInt(u.comparecimento)} sub={`de ${fmtInt(u.eleitorado)}`} />
        <Dado rotulo="Brancos" valor={fmtPct(pctBrancos(t), 1)} sub={`${fmtInt(u.brancos)} votos`} />
        <Dado rotulo="Nulos" valor={fmtPct(pctNulos(t), 1)} sub={`${fmtInt(u.nulos)} votos`} />
      </dl>
      <FonteTse className="mt-4">
        Resultado oficial do 1º turno (4 de outubro de 2026). Cada eleitor votou em até 2 candidatos; % sobre os votos válidos. Fonte: TSE.
      </FonteTse>
    </div>
  );
}

function Dado({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{rotulo}</dt>
      <dd className="num mt-1 font-display text-[16px] font-semibold text-fg">{valor}</dd>
      {sub ? <dd className="num truncate text-[11.5px] text-fg-muted">{sub}</dd> : null}
    </div>
  );
}
