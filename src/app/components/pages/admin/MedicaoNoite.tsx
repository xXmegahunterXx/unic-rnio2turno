/**
 * Medição da noite (I14) na seção Audiência do painel, pensada para o celular: curva minuto a minuto das últimas 24 h
 * (com cruz de leitura ao tocar/passar o mouse) e páginas vistas por aparelho, UF e país, com período e CSV.
 * Dados de `/api/admin/audiencia` (campos opcionais: um servidor anterior à leva 3 não manda, e a seção explica).
 *
 * Só totais e siglas: nada de pessoa chega aqui. Cores só por tokens (marca para a série; nada de cor de candidato).
 */
import { useMemo, useState, type PointerEvent } from 'react';
import { INICIO_APURACAO } from '@/shared/constants';
import type { AudienciaAdmin, Aparelho } from '@/shared/audiencia';
import { fmtDataHora, fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button, Segmented } from '@/app/ui';
import { baixarArquivo } from './anunciosAdmin';
import {
  MINUTO_MS,
  MINUTOS_CURVA,
  PERIODOS_NOITE,
  csvCurva,
  csvLocalDias,
  csvPaises,
  fatiasAparelho,
  hojeBrasilia,
  marcasHoras,
  rankingPais,
  rankingUf,
  resumoCurva,
  serieCurva,
  somaPeriodo,
  tetoEixo,
  type LinhaNoite,
  type PeriodoNoite,
} from './audienciaNoite';
import { Callout, Painel, Rotulo } from './kit';

const carimbo = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

// ---- curva minuto a minuto ------------------------------------------------------------------------------------------

export function CurvaNoite({ d }: { d: AudienciaAdmin }) {
  const curva = d.curvaMinuto;
  // o "agora" do gráfico é o da última amostra do servidor (relógio do painel pode estar adiantado/atrasado)
  const agora = d.agora.em || Date.now();
  const resumo = useMemo(() => resumoCurva(curva), [curva]);
  return (
    <Painel
      titulo="Curva minuto a minuto"
      icone="grafico"
      subtitulo="O maior número de pessoas ao mesmo tempo em cada minuto das últimas 24 h (Brasília). Trecho vazio = minuto sem amostra."
      className="mb-4 lg:mb-5"
      acoes={
        <Button size="sm" variant="ghost" icon="download" disabled={!curva?.length} onClick={() => baixarArquivo(`sintonia-audiencia-curva-${carimbo()}.csv`, csvCurva(curva))}>
          CSV
        </Button>
      }
    >
      {!curva ? (
        <Callout tom="neutro" titulo="Servidor sem a medição da noite">
          Este servidor ainda não manda a curva (chega com a leva 3).
        </Callout>
      ) : (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-x-8">
            <Destaque rotulo="Máximo" valor={resumo.max ? fmtInt(resumo.max.pessoas) : '—'} sub={resumo.max ? `às ${fmtHora(resumo.max.minuto)}` : 'sem gente ainda'} marca />
            <Destaque rotulo="Último minuto" valor={resumo.ultimo ? fmtInt(resumo.ultimo.pessoas) : '—'} sub={resumo.ultimo ? fmtHora(resumo.ultimo.minuto) : '—'} />
            <Destaque rotulo="Minutos medidos" valor={fmtInt(resumo.medidos)} sub={`de ${fmtInt(MINUTOS_CURVA)}`} />
          </dl>
          {resumo.medidos ? (
            <Grafico curva={curva} agora={agora} />
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-muted">
              A curva começa com a primeira visita medida (uma amostra a cada 10 s).
            </p>
          )}
          <p className="mt-3 text-[12px] leading-snug text-fg-subtle">
            Guarda só as últimas 24 h. Para levar a noite da apuração para a venda, baixe o CSV até as 17h de 26/10.
          </p>
        </>
      )}
    </Painel>
  );
}

function Destaque({ rotulo, valor, sub, marca }: { rotulo: string; valor: string; sub: string; marca?: boolean }) {
  return (
    <div className="min-w-0">
      <dt>
        <Rotulo className="flex items-center gap-1.5">
          {marca ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden /> : null}
          {rotulo}
        </Rotulo>
      </dt>
      <dd className="mt-1">
        <span className="num block truncate font-display text-[20px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[22px]">{valor}</span>
        <span className="num mt-1 block truncate text-[11.5px] text-fg-subtle">{sub}</span>
      </dd>
    </div>
  );
}

/** Ponto x (0–1439) e y (0–100) de cada minuto; trechos contínuos viram caminhos separados (sem amostra = buraco). */
function caminhos(valores: (number | null)[], teto: number): { linha: string; area: string } {
  let linha = '';
  let area = '';
  const y = (v: number) => (100 - (100 * v) / teto).toFixed(2);
  let i = 0;
  while (i < valores.length) {
    if (valores[i] === null) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < valores.length && valores[j + 1] !== null) j++;
    // minuto isolado: meia unidade para cada lado, para aparecer
    const x0 = j === i ? Math.max(0, i - 0.5) : i;
    const x1 = j === i ? Math.min(valores.length - 1, i + 0.5) : j;
    let seg = `M${x0},${y(valores[i]!)}`;
    if (j === i) seg += `L${x1},${y(valores[i]!)}`;
    for (let k = i + 1; k <= j; k++) seg += `L${k},${y(valores[k]!)}`;
    linha += seg;
    area += `${seg}L${x1},100L${x0},100Z`;
    i = j + 1;
  }
  return { linha, area };
}

function rotuloMarca(t: number): string {
  const h = (new Date(t).getUTCHours() + 21) % 24;
  if (h === 0) {
    const d = new Date(t - 3 * 3_600_000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return `${String(h).padStart(2, '0')}h`;
}

function Grafico({ curva, agora }: { curva: NonNullable<AudienciaAdmin['curvaMinuto']>; agora: number }) {
  const { inicio, valores } = useMemo(() => serieCurva(curva, agora), [curva, agora]);
  const max = useMemo(() => valores.reduce<number>((m, v) => (v !== null && v > m ? v : m), 0), [valores]);
  const teto = tetoEixo(max);
  const { linha, area } = useMemo(() => caminhos(valores, teto), [valores, teto]);
  const iMax = max > 0 ? valores.indexOf(max) : -1;
  const ultimo = MINUTOS_CURVA - 1;
  const pct = (i: number) => `${(100 * i) / ultimo}%`;
  const marcas = marcasHoras(inicio, 6);
  const iApuracao = Math.round((INICIO_APURACAO - inicio) / MINUTO_MS);
  const mostraApuracao = iApuracao > 30 && iApuracao < ultimo;
  const [cruz, setCruz] = useState<number | null>(null);

  function ler(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * ultimo);
    setCruz(Math.min(ultimo, Math.max(0, i)));
  }

  const vCruz = cruz === null ? null : valores[cruz];
  const tCruz = cruz === null ? 0 : inicio + cruz * MINUTO_MS;

  return (
    <figure className="m-0">
      {/* leitura do minuto tocado (linha própria: nunca cobre o gráfico nem os números de cima) */}
      <p className="mb-2.5 flex h-5 items-center gap-1.5 text-[12.5px]" role="status">
        {cruz === null ? (
          <span className="text-fg-subtle">Toque ou passe o mouse no gráfico para ler cada minuto.</span>
        ) : (
          <>
            <span className="num text-fg-muted">{fmtDataHora(tCruz)}</span>
            <span className="text-fg-subtle">·</span>
            {vCruz === null ? <span className="text-fg-subtle">sem amostra</span> : <span className="num font-semibold text-fg">{fmtInt(vCruz)} pessoas</span>}
          </>
        )}
      </p>
      <div className="flex items-start gap-2">
        {/* eixo y: só o teto, a metade e o zero (recessivos), na altura do gráfico */}
        <div className="num relative h-40 w-9 shrink-0 text-right text-[10.5px] leading-none text-fg-subtle sm:h-48" aria-hidden>
          <span className="absolute right-0 top-0 -translate-y-1/2">{fmtEixo(teto)}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{fmtEixo(teto / 2)}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-40 touch-pan-y select-none sm:h-48"
            role="img"
            aria-label={`Curva das últimas 24 horas: máximo de ${fmtInt(max)} pessoas ao mesmo tempo${iMax >= 0 ? ` às ${fmtHora(inicio + iMax * MINUTO_MS)}` : ''}.`}
            onPointerMove={ler}
            onPointerDown={ler}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setCruz(null);
            }}
          >
            {/* grade recessiva */}
            <span className="absolute inset-x-0 top-0 border-t border-line" aria-hidden />
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" aria-hidden />
            <span className="absolute inset-x-0 bottom-0 border-t border-line" aria-hidden />
            {mostraApuracao ? (
              <span className="absolute inset-y-0 border-l border-dashed border-fg-subtle/60" style={{ left: pct(iApuracao) }} aria-hidden>
                {/* rótulo do lado que tem espaço (no fim do gráfico, à esquerda da linha) */}
                <span
                  className={cn(
                    'absolute bottom-1 whitespace-nowrap rounded bg-surface/85 px-1 text-[10.5px] leading-tight text-fg-subtle',
                    iApuracao > ultimo * 0.6 ? 'right-1' : 'left-1',
                  )}
                >
                  17h · apuração
                </span>
              </span>
            ) : null}
            <svg viewBox={`0 0 ${ultimo} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              <path d={area} className="fill-brand/15" />
              <path d={linha} fill="none" className="stroke-brand-2" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            {iMax >= 0 ? (
              <span
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
                style={{ left: pct(iMax), top: `${100 - (100 * max) / teto}%` }}
                aria-hidden
              />
            ) : null}
            {cruz !== null ? (
              <>
                <span className="pointer-events-none absolute inset-y-0 w-px bg-fg-muted/60" style={{ left: pct(cruz) }} aria-hidden />
                {vCruz !== null ? (
                  <span
                    className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-surface"
                    style={{ left: pct(cruz), top: `${100 - (100 * vCruz) / teto}%` }}
                    aria-hidden
                  />
                ) : null}
              </>
            ) : null}
          </div>
          {/* eixo x: horas cheias de Brasília, de 6 em 6 (00h vira a data) */}
          <div className="num relative mt-1.5 h-4 text-[10.5px] text-fg-subtle" aria-hidden>
            {marcas.map((t) => {
              const i = Math.round((t - inicio) / MINUTO_MS);
              const borda = i < ultimo * 0.04 ? 'translate-x-0' : i > ultimo * 0.96 ? '-translate-x-full' : '-translate-x-1/2';
              return (
                <span key={t} className={cn('absolute top-0 whitespace-nowrap', borda)} style={{ left: pct(i) }}>
                  {rotuloMarca(t)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">O CSV traz todos os minutos medidos.</figcaption>
    </figure>
  );
}

/** "20 mil", "2,5 mil", "250" — só para o eixo. */
function fmtEixo(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? fmtInt(k) : k.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return Number.isInteger(n) ? fmtInt(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

// ---- aparelho, UF e país ------------------------------------------------------------------------------------------------

/** Cor por aparelho (fixa: segue o aparelho, nunca a posição). */
const COR_APARELHO: Record<Aparelho, string> = {
  celular: 'bg-brand',
  computador: 'bg-brand-2',
  nd: 'bg-fg-subtle/40',
};

export function OndeEAparelho({ d }: { d: AudienciaAdmin }) {
  const [periodo, setPeriodo] = useState<PeriodoNoite>('hoje');
  const dias = PERIODOS_NOITE.find((p) => p.id === periodo)!.dias;
  const hoje = hojeBrasilia(d.agora.em || Date.now());
  const somas = useMemo(
    () => ({
      uf: somaPeriodo(d.porUf, hoje, dias),
      pais: somaPeriodo(d.porPais, hoje, dias),
      aparelho: somaPeriodo(d.porAparelho, hoje, dias),
    }),
    [d.porUf, d.porPais, d.porAparelho, hoje, dias],
  );
  const semCampos = !d.porUf && !d.porPais && !d.porAparelho;
  const uf = rankingUf(somas.uf);
  const pais = rankingPais(somas.pais);
  const fatias = fatiasAparelho(somas.aparelho);
  const totalAparelho = fatias.reduce((s, f) => s + f.valor, 0);
  // UF toda "não informada" com páginas do Brasil: a transformação de localização da Cloudflare está desligada
  const semUf = uf.total > 0 && uf.itens.length === 0;

  return (
    <Painel
      titulo="Aparelho, estado e país"
      icone="globo"
      subtitulo="Páginas vistas por pessoas (sem widgets e /live). UF e país vêm da Cloudflare; o servidor só soma a sigla."
      className="mb-4 lg:mb-5"
      acoes={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon="download"
            disabled={semCampos}
            onClick={() => baixarArquivo(`sintonia-audiencia-estados-aparelhos-${carimbo()}.csv`, csvLocalDias(d))}
          >
            Estados
          </Button>
          <Button size="sm" variant="ghost" icon="download" disabled={!d.porPais?.length} onClick={() => baixarArquivo(`sintonia-audiencia-paises-${carimbo()}.csv`, csvPaises(d.porPais))}>
            Países
          </Button>
        </>
      }
    >
      {semCampos ? (
        <Callout tom="neutro" titulo="Servidor sem a medição da noite">
          Este servidor ainda não separa as páginas por aparelho, estado e país (chega com a leva 3).
        </Callout>
      ) : (
        <>
          <Segmented
            ariaLabel="Período"
            size="sm"
            value={periodo}
            onChange={setPeriodo}
            options={PERIODOS_NOITE.map((p) => ({ value: p.id, label: p.rotulo }))}
            className="mb-4"
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
            <section className="min-w-0">
              <h3 className="mb-2.5 text-[13px] font-semibold text-fg">Aparelho</h3>
              {totalAparelho ? (
                <>
                  <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={fatias.map((f) => `${f.rotulo}: ${fmtPct(f.fracao * 100, 1)}`).join('; ')}>
                    {fatias.map((f) => (
                      <span key={f.aparelho} className={cn('h-full min-w-[3px]', COR_APARELHO[f.aparelho])} style={{ flexGrow: f.valor, flexBasis: 0 }} title={`${f.rotulo}: ${fmtInt(f.valor)}`} />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5 text-[13.5px]">
                    {fatias.map((f) => (
                      <li key={f.aparelho} className="flex items-baseline gap-2">
                        <span className={cn('h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-[3px]', COR_APARELHO[f.aparelho])} aria-hidden />
                        <span className={cn('min-w-0 flex-1 truncate', f.aparelho === 'nd' ? 'text-fg-subtle' : 'text-fg')}>{f.rotulo}</span>
                        <span className="num shrink-0 font-semibold text-fg">{fmtPct(f.fracao * 100, 1)}</span>
                        <span className="num w-16 shrink-0 text-right text-[12px] text-fg-subtle">{fmtInt(f.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Vazio />
              )}
            </section>
            <section className="min-w-0 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="mb-2.5 text-[13px] font-semibold text-fg">Estados (Brasil)</h3>
              {uf.total ? <ListaNoite itens={uf.itens} resto={uf.resto} mostrar={8} /> : <Vazio />}
              {semUf ? (
                <p className="mt-2 text-[12px] leading-snug text-alert-fg">
                  Nenhuma UF informada: confira se a transformação “Add visitor location headers” da Cloudflare está ligada (deploy/cloudflare.mjs --conferir).
                </p>
              ) : null}
            </section>
            <section className="min-w-0 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="mb-2.5 text-[13px] font-semibold text-fg">Países</h3>
              {pais.total ? <ListaNoite itens={pais.itens} resto={pais.resto} mostrar={6} /> : <Vazio />}
            </section>
          </div>
          <p className="mt-4 text-[12px] leading-snug text-fg-subtle">
            Percentuais sobre as páginas do período. “Não informado” = sem o cabeçalho da Cloudflare (acesso direto, país desconhecido ou transformação de
            localização desligada). Tablets contam como computador, como o próprio navegador informa.
          </p>
        </>
      )}
    </Painel>
  );
}

function Vazio() {
  return <p className="text-[13px] text-fg-muted">Nenhuma página no período.</p>;
}

function ListaNoite({ itens, resto, mostrar }: { itens: LinhaNoite[]; resto: LinhaNoite[]; mostrar: number }) {
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? itens : itens.slice(0, mostrar);
  const max = Math.max(1e-9, ...itens.map((i) => i.fracao), ...resto.map((i) => i.fracao));
  return (
    <>
      <ul className="space-y-2">
        {visiveis.map((i) => (
          <Linha key={i.chave} i={i} max={max} />
        ))}
        {resto.map((i) => (
          <Linha key={i.chave} i={i} max={max} apagada />
        ))}
      </ul>
      {itens.length > mostrar ? (
        <button type="button" className="mt-2.5 text-[12.5px] font-medium text-brand-fg hover:underline" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
          {todos ? 'Mostrar menos' : `Mostrar todos (${fmtInt(itens.length)})`}
        </button>
      ) : null}
    </>
  );
}

function Linha({ i, max, apagada }: { i: LinhaNoite; max: number; apagada?: boolean }) {
  return (
    <li className="min-w-0">
      <div className="flex items-baseline gap-2 text-[13.5px]">
        <span className={cn('min-w-0 flex-1 truncate', apagada ? 'text-fg-subtle' : 'text-fg')}>{i.rotulo}</span>
        <span className={cn('num shrink-0', apagada ? 'text-fg-subtle' : 'font-semibold text-fg')}>{fmtPct(i.fracao * 100, 1)}</span>
        <span className="num w-16 shrink-0 text-right text-[12px] text-fg-subtle">{fmtInt(i.valor)}</span>
      </div>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className={cn('block h-full rounded-full', apagada ? 'bg-fg-subtle/40' : 'bg-brand-2/75')} style={{ width: `${(100 * i.fracao) / max}%` }} />
      </span>
    </li>
  );
}
