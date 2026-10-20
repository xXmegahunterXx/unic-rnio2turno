/**
 * Pesquisas ao longo do tempo — UMA série por instituto, em painéis lado a lado (pequenos múltiplos), nunca somadas:
 * sem média, sem projeção, sem "agregador". Os painéis dividem a MESMA régua de datas e de percentuais (comparáveis à
 * vista). Em cada painel, uma linha por candidato na cor de identidade que vem dos dados (`corSlot`), pontos no último
 * dia de coleta, a margem de erro como um traço vertical sutil (±) e o último valor escrito ao lado. Cabeçalho do
 * instituto em tons neutros. Toque/foco num ponto mostra a pesquisa (datas, registro, valores); "Ver em tabela" dá a
 * mesma informação em texto.
 */
import { useId, useMemo, useState } from 'react';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Segmented } from '@/app/ui/Segmented';
import {
  fmtDataPesquisa,
  fmtMargem,
  fmtPctPesquisa,
  fmtPeriodoColeta,
  seriesPorInstituto,
  type BaseSerie,
  type Pesquisa,
  type PontoSerie,
  type SerieInstituto,
} from '@/shared/pesquisas';
import type { CandidatoPesquisa } from './pecas';

const W = 320;
const H = 168;
const M = { l: 30, r: 44, t: 14, b: 26 };
const DIA = 86_400_000;

const diaDe = (s: string) => Date.parse(`${s}T12:00:00Z`);

interface Escalas {
  x: (d: string) => number;
  y: (v: number) => number;
  ticksY: number[];
  dIni: string;
  dFim: string;
}

function escalas(series: SerieInstituto[]): Escalas | null {
  const pts = series.flatMap((s) => s.pontos);
  if (!pts.length) return null;
  const datas = pts.map((p) => diaDe(p.data));
  let x0 = Math.min(...datas);
  let x1 = Math.max(...datas);
  if (x1 - x0 < 4 * DIA) {
    const meio = (x0 + x1) / 2;
    x0 = meio - 2 * DIA;
    x1 = meio + 2 * DIA;
  }
  const vals = pts.flatMap((p) => Object.values(p.valores).flatMap((v) => [v - p.margemPp, v + p.margemPp]));
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 2) / 5) * 5);
  const hi = Math.min(100, Math.ceil((Math.max(...vals) + 2) / 5) * 5);
  const passo = hi - lo > 30 ? 10 : 5;
  const ticksY: number[] = [];
  for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) ticksY.push(v);
  return {
    x: (d) => M.l + ((diaDe(d) - x0) / (x1 - x0)) * (W - M.l - M.r),
    y: (v) => M.t + (1 - (v - lo) / (hi - lo || 1)) * (H - M.t - M.b),
    ticksY,
    dIni: new Date(x0).toISOString().slice(0, 10),
    dFim: new Date(x1).toISOString().slice(0, 10),
  };
}

function Painel({ serie, cands, esc }: { serie: SerieInstituto; cands: CandidatoPesquisa[]; esc: Escalas }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const tituloId = useId();
  const ultimo = serie.pontos[serie.pontos.length - 1];
  // rótulos do último valor sem colidir (afasta os dois quando ficam a menos de 12 px)
  const ys = cands.map((c) => esc.y(ultimo.valores[c.numero]));
  if (Math.abs(ys[0] - ys[1]) < 12) {
    const meio = (ys[0] + ys[1]) / 2;
    const cima = ys[0] <= ys[1] ? 0 : 1;
    ys[cima] = meio - 6;
    ys[1 - cima] = meio + 6;
  }
  const p = ativo !== null ? serie.pontos[ativo] : null;
  return (
    <figure className="relative rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4" aria-labelledby={tituloId}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span id={tituloId} className="truncate font-display text-[15px] font-semibold text-fg">
          {serie.instituto}
        </span>
        <span className="num shrink-0 text-[11.5px] text-fg-muted">
          {serie.pontos.length} {serie.pontos.length === 1 ? 'pesquisa' : 'pesquisas'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full overflow-visible" role="img" aria-label={`${serie.instituto}: ${serie.pontos.length} pesquisas`}>
        {/* grade recessiva */}
        {esc.ticksY.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={esc.y(v)} y2={esc.y(v)} className="stroke-line" strokeWidth={1} />
            <text x={M.l - 6} y={esc.y(v)} dy="0.32em" textAnchor="end" className="num fill-fg-subtle" fontSize={10}>
              {v}%
            </text>
          </g>
        ))}
        <text x={M.l} y={H - 6} className="num fill-fg-subtle" fontSize={10}>
          {fmtDataPesquisa(esc.dIni)}
        </text>
        <text x={W - M.r} y={H - 6} textAnchor="end" className="num fill-fg-subtle" fontSize={10}>
          {fmtDataPesquisa(esc.dFim)}
        </text>
        {cands.map((c, ci) => {
          const s = corSlot(c.cor);
          const d = serie.pontos.map((pt, i) => `${i ? 'L' : 'M'}${esc.x(pt.data).toFixed(1)} ${esc.y(pt.valores[c.numero]).toFixed(1)}`).join(' ');
          return (
            <g key={c.numero}>
              {/* margem de erro (±) de cada ponto */}
              {serie.pontos.map((pt) => (
                <line
                  key={pt.id}
                  x1={esc.x(pt.data) + (ci ? 2 : -2)}
                  x2={esc.x(pt.data) + (ci ? 2 : -2)}
                  y1={esc.y(pt.valores[c.numero] + pt.margemPp)}
                  y2={esc.y(pt.valores[c.numero] - pt.margemPp)}
                  className={s.stroke}
                  strokeOpacity={0.35}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              ))}
              {serie.pontos.length > 1 ? <path d={d} fill="none" className={s.stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
              {serie.pontos.map((pt) => (
                <circle key={pt.id} cx={esc.x(pt.data)} cy={esc.y(pt.valores[c.numero])} r={4} className={cn(s.fill, 'stroke-[rgb(var(--surface))]')} strokeWidth={2} />
              ))}
              <text x={W - M.r + 8} y={ys[ci]} dy="0.32em" className="num fill-fg font-semibold" fontSize={11.5}>
                {fmtPctPesquisa(ultimo.valores[c.numero])}
              </text>
            </g>
          );
        })}
        {/* alvos de toque/foco (maiores que os pontos) */}
        {serie.pontos.map((pt, i) => (
          <rect
            key={pt.id}
            x={esc.x(pt.data) - 14}
            y={M.t - 6}
            width={28}
            height={H - M.t - M.b + 12}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${serie.instituto}, coleta ${fmtPeriodoColeta(pt.coletaInicio, pt.data)}: ${cands.map((c) => `${c.nome} ${fmtPctPesquisa(pt.valores[c.numero])}`).join(', ')}`}
            className="cursor-pointer outline-none focus-visible:stroke-brand"
            strokeWidth={2}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo((a) => (a === i ? null : a))}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo((a) => (a === i ? null : a))}
            onClick={() => setAtivo((a) => (a === i ? null : i))}
          />
        ))}
        {p ? <line x1={esc.x(p.data)} x2={esc.x(p.data)} y1={M.t - 4} y2={H - M.b} className="stroke-fg-subtle" strokeDasharray="3 3" strokeWidth={1} /> : null}
      </svg>
      {p ? <Dica p={p} cands={cands} esquerda={esc.x(p.data) / W} /> : null}
    </figure>
  );
}

function Dica({ p, cands, esquerda }: { p: PontoSerie; cands: CandidatoPesquisa[]; esquerda: number }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-11 z-10 w-[190px] rounded-xl border border-line bg-surface-2 p-2.5 text-[12px] shadow-card"
      style={{ left: `clamp(8px, calc(${(esquerda * 100).toFixed(1)}% - 95px), calc(100% - 198px))` }}
    >
      <div className="num font-semibold text-fg">Coleta {fmtPeriodoColeta(p.coletaInicio, p.data)}</div>
      <div className="num text-fg-muted">{p.registro}</div>
      <ul className="mt-1.5 space-y-0.5">
        {cands.map((c) => (
          <li key={c.numero} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', corSlot(c.cor).bg)} />
              <span className="truncate text-fg-muted">{c.nome}</span>
            </span>
            <span className="num font-semibold text-fg">{fmtPctPesquisa(p.valores[c.numero])}</span>
          </li>
        ))}
      </ul>
      <div className="num mt-1 text-fg-subtle">Margem: {fmtMargem(p.margemPp)} pontos</div>
    </div>
  );
}

export function GraficoInstitutos({ pesquisas, cargo, cands }: { pesquisas: Pesquisa[]; cargo: string; cands: CandidatoPesquisa[] }) {
  const temValidos = useMemo(() => pesquisas.some((p) => p.cargo === cargo && p.validos), [pesquisas, cargo]);
  const [base, setBase] = useState<BaseSerie>('totais');
  const b: BaseSerie = base === 'validos' && temValidos ? 'validos' : 'totais';
  const series = useMemo(() => seriesPorInstituto(pesquisas, cargo, b), [pesquisas, cargo, b]);
  const esc = useMemo(() => escalas(series), [series]);
  if (!esc || cands.length !== 2) return null;
  return (
    <section aria-labelledby="pesq-tempo" data-sem-anuncio-fixo className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pesq-tempo" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
            Ao longo do tempo, por instituto
          </h2>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">
            Cada painel mostra só as pesquisas de um instituto, na data do fim da coleta. Os números não são somados nem combinados entre institutos. O traço
            vertical em volta de cada ponto é a margem de erro.
          </p>
        </div>
        {temValidos ? (
          <Segmented<BaseSerie>
            ariaLabel="Base dos percentuais"
            size="sm"
            value={b}
            onChange={setBase}
            options={[
              { value: 'totais', label: 'Votos totais' },
              { value: 'validos', label: 'Válidos' },
            ]}
          />
        ) : null}
      </div>
      {/* legenda (≥ 2 séries: sempre) */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]" aria-label="Legenda">
        {cands.map((c) => (
          <li key={c.numero} className="flex items-center gap-2 text-fg">
            <span aria-hidden className={cn('h-[3px] w-5 rounded-full', corSlot(c.cor).bg)} />
            {c.nome}
          </li>
        ))}
        <li className="flex items-center gap-2 text-fg-muted">
          <span aria-hidden className="h-3 w-[3px] rounded-full bg-fg-subtle/50" />
          margem de erro
        </li>
      </ul>
      <div className={cn('mt-4 grid grid-cols-1 gap-3 sm:gap-4', series.length === 1 ? 'max-w-xl' : series.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3')}>
        {series.map((s) => (
          <Painel key={s.chave} serie={s} cands={cands} esc={esc} />
        ))}
      </div>
      {b === 'validos' ? <p className="mt-2 text-[12.5px] text-fg-subtle">Só as pesquisas em que o instituto divulgou os votos válidos.</p> : null}
      <details className="mt-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-[13px]">
        <summary className="cursor-pointer font-semibold text-fg-muted">Ver em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left">
            <thead className="text-[11.5px] uppercase tracking-[0.08em] text-fg-subtle">
              <tr>
                <th className="py-1 pr-3 font-semibold">Instituto</th>
                <th className="py-1 pr-3 font-semibold">Coleta</th>
                {cands.map((c) => (
                  <th key={c.numero} className="py-1 pr-3 text-right font-semibold">
                    {c.nome}
                  </th>
                ))}
                <th className="py-1 text-right font-semibold">Margem</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap((s) =>
                s.pontos.map((pt) => (
                  <tr key={pt.id} className="border-t border-line">
                    <td className="py-1.5 pr-3 text-fg">{s.instituto}</td>
                    <td className="num py-1.5 pr-3 text-fg-muted">{fmtPeriodoColeta(pt.coletaInicio, pt.data, false)}</td>
                    {cands.map((c) => (
                      <td key={c.numero} className="num py-1.5 pr-3 text-right font-semibold text-fg">
                        {fmtPctPesquisa(pt.valores[c.numero])}
                      </td>
                    ))}
                    <td className="num py-1.5 text-right text-fg-muted">±{fmtMargem(pt.margemPp)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
