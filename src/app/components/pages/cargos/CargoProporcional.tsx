/**
 * Cargos proporcionais do 1º turno (Câmara dos Deputados e Assembleias/Câmara Legislativa): composição em
 * hemiciclo + ranking de bancadas (maior primeiro), eleitos com foto oficial e os mais votados.
 * Usado por /camara (Brasil ou `?uf=`) e por /assembleias/:uf.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { CargoDataset, CargoUfResultado } from '@/shared/dataset';
import type { UFBr } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { useNaTela } from '@/app/lib/useNaTela';
import { Icon } from '@/app/ui/Icon';
import { SearchBox } from '@/app/ui/SearchBox';
import { Segmented } from '@/app/ui/Segmented';
import { casa } from '@/app/ui/textMatch';
import { Hemiciclo, type Assento } from './Hemiciclo';
import { Bancadas, type Bancada } from './Bancadas';
import { porTamanho } from './partidos';
import { ehEleito, grupoDoCargo, rotuloSituacao, useFichasGrupo, useIndiceCandidatos } from './dados';
import { FotoOficial } from './FotoOficial';
import { AvisoTse, CandidatoLinha, NomeLink, PartidoChip, SituacaoSelo, textoReprocessamento } from './ui';

export type CargoProp = 'camara' | 'assembleia';
type CandUf = CargoUfResultado['candidatos'][number] & { uf: UFBr };

export interface Composicao {
  bancadas: Bancada[];
  assentos: Assento[];
  total: number;
  pendentes: number;
  eleitos: CandUf[];
  outros: CandUf[];
  validos: number;
  /** UFs com aviso do TSE (reprocessamento). */
  avisos: { uf: UFBr; aviso: string }[];
}

/** Composição de uma UF (ou do Brasil, `uf = null`). */
export function useComposicao(data: CargoDataset | undefined, uf: UFBr | null, comFicha: (sq: string) => boolean): Composicao | null {
  return useMemo(() => {
    if (!data) return null;
    const ufs = (uf ? data.ufs.filter((u) => u.uf === uf) : data.ufs) as CargoUfResultado[];
    if (!ufs.length) return null;
    const votos = new Map<string, { votos: number; eleitos: number; nome?: string; federacao?: string }>();
    let total = 0;
    let validos = 0;
    const eleitos: CandUf[] = [];
    const outros: CandUf[] = [];
    const avisos: { uf: UFBr; aviso: string }[] = [];
    for (const u of ufs) {
      total += u.vagas;
      validos += u.validos;
      const aviso = (u as CargoUfResultado & { aviso?: string }).aviso;
      if (aviso) avisos.push({ uf: u.uf as UFBr, aviso });
      for (const p of u.partidos ?? []) {
        const cur = votos.get(p.sigla) ?? { votos: 0, eleitos: 0, nome: p.nome, federacao: p.federacao };
        cur.votos += p.votos;
        cur.eleitos += p.eleitos;
        votos.set(p.sigla, cur);
      }
      for (const c of u.candidatos) (ehEleito(c.situacao) ? eleitos : outros).push({ ...c, uf: u.uf as UFBr });
    }
    const bancadas = porTamanho(
      [...votos.entries()].map(([sigla, v]) => ({ sigla, eleitos: v.eleitos, votos: v.votos, nome: v.nome, federacao: uf ? v.federacao : undefined })),
      (b) => b.eleitos * 1e9 + b.votos!,
    );
    const ordem = new Map(bancadas.map((b, i) => [b.sigla, i]));
    eleitos.sort((a, b) => (ordem.get(a.partido) ?? 999) - (ordem.get(b.partido) ?? 999) || b.votos - a.votos);
    outros.sort((a, b) => b.votos - a.votos);
    const assentos: Assento[] = eleitos.map((c) => ({
      id: c.sqcand,
      partido: c.partido,
      nome: c.nomeUrna,
      sub: `${uf ? '' : `${c.uf} · `}${fmtInt(c.votos)} votos`,
      href: comFicha(c.sqcand) ? `/candidato/${c.sqcand}` : undefined,
    }));
    const pendentes = Math.max(0, total - eleitos.length);
    for (let i = 0; i < pendentes; i++) assentos.push({ id: `pendente-${i}`, partido: '—', pendente: true });
    return { bancadas, assentos, total, pendentes, eleitos, outros, validos, avisos };
  }, [data, uf, comFicha]);
}

/** Hemiciclo + ranking de bancadas lado a lado (empilhados no celular). */
export function VisaoComposicao({
  comp,
  titulo,
  rotuloCentro,
  extraRanking,
}: {
  comp: Composicao;
  titulo: ReactNode;
  rotuloCentro: string;
  extraRanking?: ReactNode;
}) {
  const [destaque, setDestaque] = useState<string | null>(null);
  const lg = useMediaQuery('(min-width: 1024px)');
  const maioria = Math.floor(comp.total / 2) + 1;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <section className="min-w-0 self-start rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:sticky lg:top-[calc(var(--app-header-h,64px)+16px)] lg:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">{titulo}</h2>
          <span className="text-[12.5px] text-fg-muted">Uma bolinha por cadeira · maior bancada à esquerda</span>
        </div>
        <Hemiciclo
          className="mx-auto mt-4 max-w-[640px]"
          assentos={comp.assentos}
          destaque={destaque}
          onDestaque={setDestaque}
          ariaLabel={`Hemiciclo com ${comp.total} cadeiras: ${comp.bancadas
            .filter((b) => b.eleitos > 0)
            .map((b) => `${b.sigla} ${b.eleitos}`)
            .join(', ')}${comp.pendentes ? `; ${comp.pendentes} aguardando o TSE` : ''}`}
          centro={
            <>
              <span className="num font-display text-[26px] font-semibold leading-none tracking-[-0.03em] text-fg min-[480px]:text-[34px] sm:text-[44px]">
                {fmtInt(comp.total)}
              </span>
              <span className="mt-0.5 text-[11px] text-fg-muted sm:mt-1 sm:text-[12px]">{rotuloCentro}</span>
              {comp.total >= 9 ? (
                <span className="num mt-0.5 hidden text-[11px] text-fg-subtle min-[480px]:block">maioria: {fmtInt(maioria)}</span>
              ) : null}
            </>
          }
        />
        {comp.avisos.length ? (
          <AvisoTse className="mt-4">{textoReprocessamento(comp.avisos[0].uf, comp.avisos[0].aviso)}</AvisoTse>
        ) : null}
      </section>
      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:col-span-5">
        <h2 className="mb-3 font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">Bancadas</h2>
        <Bancadas
          bancadas={comp.bancadas}
          total={comp.total}
          pendentes={comp.pendentes}
          rotuloPendentes={comp.avisos.length ? `Aguardando o TSE (${comp.avisos.map((a) => a.uf).join(', ')})` : 'Aguardando'}
          destaque={destaque}
          onDestaque={setDestaque}
          votosValidos={comp.validos}
          max={lg ? undefined : 8}
        />
        {extraRanking}
      </section>
    </div>
  );
}

type OrdemEleitos = 'votos' | 'partido';

/** Grade dos eleitos de uma UF com foto oficial (ordenável por votos ou por partido; busca por nome). */
export function EleitosUf({
  cargo,
  uf,
  comp,
  rotuloCargo,
}: {
  cargo: CargoProp;
  uf: UFBr;
  comp: Composicao;
  /** "deputados federais" | "deputados estaduais" | "deputados distritais" */
  rotuloCargo: string;
}) {
  const grupo = grupoDoCargo(cargo, uf);
  const [ref, visto] = useNaTela<HTMLDivElement>();
  const fichas = useFichasGrupo(visto ? grupo : null);
  const [ordem, setOrdem] = useState<OrdemEleitos>('votos');
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const base = ordem === 'votos' ? [...comp.eleitos].sort((a, b) => b.votos - a.votos) : comp.eleitos;
    const t = busca.trim();
    return t ? base.filter((c) => casa(`${c.nomeUrna} ${c.partido} ${c.numero}`, t)) : base;
  }, [comp.eleitos, ordem, busca]);

  if (comp.eleitos.length === 0) {
    return (
      <div ref={ref}>
        <AvisoTse>
          {comp.avisos.length
            ? textoReprocessamento(uf, comp.avisos[0].aviso)
            : `Os ${rotuloCargo} eleitos ${UF_NOMES[uf] ? `em ${UF_NOMES[uf]}` : ''} ainda não foram divulgados.`}
        </AvisoTse>
      </div>
    );
  }
  return (
    <div ref={ref}>
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox
          value={busca}
          onChange={setBusca}
          size="sm"
          placeholder="Buscar pelo nome, partido ou número"
          ariaLabel={`Buscar entre os ${rotuloCargo} eleitos`}
          className="sm:max-w-[320px]"
        />
        <Segmented<OrdemEleitos>
          size="sm"
          ariaLabel="Ordenar eleitos"
          value={ordem}
          onChange={setOrdem}
          options={[
            { value: 'votos', label: 'Mais votados' },
            { value: 'partido', label: 'Por partido' },
          ]}
        />
      </div>
      {lista.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-fg-muted">Ninguém com “{busca}”.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((c) => {
            const f = fichas.porSq.get(c.sqcand);
            return (
              <li key={c.sqcand} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
                <FotoOficial sqcand={c.sqcand} fotoGrupo={visto ? grupo : undefined} nome={c.nomeUrna} tamanho="xl" />
                <div className="min-w-0 flex-1">
                  <NomeLink
                    sqcand={c.sqcand}
                    nome={c.nomeUrna}
                    comFicha={!!f}
                    className="block text-[14.5px] font-semibold leading-tight text-fg"
                  />
                  <PartidoChip sigla={c.partido} numero={c.numero} className="mt-1 max-w-full" />
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="num font-display text-[16px] font-semibold leading-none text-fg">{fmtInt(c.votos)}</span>
                    <span className="num text-[11.5px] text-fg-muted">votos · {fmtPct(c.pct)}</span>
                  </div>
                  <span className="mt-1 block truncate text-[11px] text-fg-subtle" title={rotuloSituacao(c.situacao, f?.genero)}>
                    {rotuloSituacao(c.situacao, f?.genero)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {comp.outros.length ? <MaisVotadosNaoEleitos lista={comp.outros} /> : null}
    </div>
  );
}

/** Suplentes/não eleitos mais votados (sem foto: a base só traz fotos dos eleitos). */
function MaisVotadosNaoEleitos({ lista }: { lista: CandUf[] }) {
  const [aberto, setAberto] = useState(false);
  const vis = aberto ? lista : lista.slice(0, 5);
  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="font-display text-[16px] font-semibold text-fg">Mais votados que não se elegeram</h3>
      <p className="mt-0.5 text-[12.5px] text-fg-muted">Suplentes e não eleitos, por votos. A vaga depende do quociente partidário, não só dos votos individuais.</p>
      <ol className="mt-3 divide-y divide-line">
        {vis.map((c, i) => (
          <li key={c.sqcand} className="flex items-center gap-3 py-2">
            <span className="num w-6 shrink-0 text-right text-[12px] text-fg-subtle">{i + 1}º</span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-fg">{c.nomeUrna}</span>
              <PartidoChip sigla={c.partido} numero={c.numero} />
            </div>
            <SituacaoSelo situacao={c.situacao} />
            <span className="num w-[92px] shrink-0 text-right text-[13px] text-fg">{fmtInt(c.votos)}</span>
          </li>
        ))}
      </ol>
      {lista.length > 5 ? (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-1 text-[13px] font-medium text-brand-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {aberto ? 'Mostrar menos' : `Ver os ${fmtInt(lista.length)}`}
          <Icon name={aberto ? 'chevron-cima' : 'chevron'} size={14} />
        </button>
      ) : null}
    </div>
  );
}

/** Mais votados do país (Câmara): top N entre todas as UFs, com fotos (montadas sob demanda). */
export function MaisVotadosPais({ comp, n = 12 }: { comp: Composicao; n?: number }) {
  const [ref, visto] = useNaTela<HTMLDivElement>();
  const indice = useIndiceCandidatos();
  const top = useMemo(() => [...comp.eleitos].sort((a, b) => b.votos - a.votos).slice(0, n), [comp.eleitos, n]);
  const maior = top[0]?.votos ?? 1;
  return (
    <div ref={ref}>
      <ol className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        {top.map((c, i) => (
          <li key={c.sqcand} className={cn('border-t border-line py-3', i < 2 && 'md:border-t-0 md:pt-0', i === 0 && 'border-t-0 pt-0')}>
            <CandidatoLinha
              c={c}
              fotoGrupo={visto ? grupoDoCargo('camara', c.uf) : undefined}
              comFicha={indice.porSq.has(c.sqcand)}
              posicao={i + 1}
              tamanhoFoto="md"
              barra={(c.votos / maior) * 100}
              selo={false}
              principal="votos"
              onde={c.uf}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
