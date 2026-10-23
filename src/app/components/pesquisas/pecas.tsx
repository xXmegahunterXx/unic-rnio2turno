/**
 * Peças da área de pesquisas (página /pesquisas, bloco da home/apuração, prévia do painel).
 *
 * Regras: candidatos na ordem da urna, cores que vêm dos dados (`corSlot(c.cor)`: Presidente vermelho/azul; governador
 * turquesa/âmbar), números como o instituto divulgou (`fmtPctPesquisa`, classe `.num`), SEMPRE a linha das informações
 * obrigatórias (Res. TSE 23.600/2019, art. 10) e o link da fonte. Todo bloco com candidato leva `data-sem-anuncio-fixo`
 * (a barra de anúncio do celular e o popup do chat se recolhem diante dele).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useRace } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import {
  CHAVE_BRANCOS_NULOS,
  CHAVE_INDECISOS,
  fmtConfianca,
  fmtDataPesquisa,
  fmtMargem,
  fmtPctPesquisa,
  fmtPeriodoColeta,
  numerosDaPesquisa,
  rotuloCargo,
  type Pesquisa,
} from '@/shared/pesquisas';
import { fmtInt } from '@/shared/format';
import type { CorCandidato } from '@/shared/types';

export interface CandidatoPesquisa {
  numero: number;
  nome: string;
  partido: string;
  cor: CorCandidato;
}

/** Os dois candidatos da disputa na ordem da urna (nomes e cores do meta.json). */
export function useCandidatosPesquisa(cargo: string, numeros: number[]): CandidatoPesquisa[] {
  const race = useRace(cargo);
  return numeros.map((n, i) => {
    const c = race?.candidatos.find((x) => !x.agregado && x.numero === n);
    return c ? { numero: n, nome: c.nomeUrna, partido: c.partido, cor: c.cor } : { numero: n, nome: `Candidato ${n}`, partido: '', cor: i === 0 ? 'a' : 'b' };
  });
}

/** "45%" grande, com o "%" menor; cor do candidato (texto grande: a cor pura do slot). */
export function PctPesquisa({ valor, cor, className, tamanho }: { valor: number | undefined; cor: CorCandidato; className?: string; tamanho: string }) {
  if (valor === undefined) return <span className={cn('num font-display font-semibold text-fg-subtle', tamanho, className)}>–</span>;
  const txt = fmtPctPesquisa(valor).replace('%', '');
  return (
    <span className={cn('num font-display font-semibold leading-none tracking-[-0.04em]', corSlot(cor).textDisplay, tamanho, className)}>
      {txt}
      <span className="ml-[0.04em] text-[0.5em] tracking-normal">%</span>
    </span>
  );
}

/** Filete + nome + partido · número (ordem da urna; o 2º alinhado à direita). */
export function NomeCandidato({ c, direita, compacto }: { c: CandidatoPesquisa; direita?: boolean; compacto?: boolean }) {
  const s = corSlot(c.cor);
  return (
    <div className={cn('min-w-0', direita && 'text-right')}>
      <span aria-hidden className={cn('mb-1.5 block h-1 w-8 rounded-full', s.bg, direita && 'ml-auto')} />
      <div className={cn('font-display font-semibold leading-tight tracking-[-0.01em] text-fg', compacto ? 'text-[14px]' : 'text-[15.5px] sm:text-[17px]')}>{c.nome}</div>
      {c.partido ? (
        <div className="num text-[12px] font-medium text-fg-muted">
          {c.partido} · {c.numero}
        </div>
      ) : null}
    </div>
  );
}

/** Linha das informações obrigatórias (instituto, contratante, registro, coleta, entrevistas, margem, confiança). */
export function LinhaObrigatoria({ p, className }: { p: Pesquisa; className?: string }) {
  const item = (rotulo: string, valor: ReactNode) => (
    <span className="whitespace-normal">
      <span className="text-fg-subtle">{rotulo}</span> <span className="text-fg">{valor}</span>
    </span>
  );
  const conf = fmtConfianca(p.confiancaPct);
  const partes: ReactNode[] = [
    item('Instituto', p.instituto),
    item('Contratante', p.contratante ?? 'não informado'),
    item('Registro no TSE', <span className="num whitespace-nowrap font-mono text-[0.95em]">{p.registro}</span>),
    item('Coleta', <span className="num whitespace-nowrap">{fmtPeriodoColeta(p.coletaInicio, p.coletaFim)}</span>),
    item('Entrevistas', <span className="num whitespace-nowrap">{fmtInt(p.entrevistas)}</span>),
    item(
      'Margem de erro',
      <>
        <span className="num">{fmtMargem(p.margemPp)}</span> {p.margemPp === 1 ? 'ponto' : 'pontos'} para mais ou para menos
      </>,
    ),
    item('Nível de confiança', <span className="num">{conf}%</span>),
  ];
  return (
    <p className={cn('text-[12.5px] leading-relaxed', className)}>
      {partes.map((x, i) => (
        <span key={i}>
          {i > 0 ? <span aria-hidden className="px-1.5 text-fg-subtle">·</span> : null}
          {x}
        </span>
      ))}
      {/* informação que a Justiça Eleitoral mandou constar em toda divulgação desta pesquisa */}
      {p.aviso ? <span className="mt-1 block font-medium text-fg">{p.aviso}</span> : null}
    </p>
  );
}

/** Domínio exibido de uma URL de fonte ("datafolha.folha.uol.com.br"). */
export function dominioFonte(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Link(s) da fonte, em nova aba. */
export function FontesPesquisa({ p, className }: { p: Pesquisa; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]', className)}>
      <span className="font-semibold text-fg-muted">{p.fontes.length > 1 ? 'Fontes' : 'Fonte'}</span>
      {p.fontes.map((f) => (
        <a
          key={f}
          href={f}
          target="_blank"
          rel="noopener noreferrer"
          className="toque relative inline-flex min-w-0 items-center gap-1 rounded font-medium text-brand-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="truncate">{dominioFonte(f)}</span>
          <Icon name="externo" size={13} />
        </a>
      ))}
    </div>
  );
}

/** "Branco, nulo ou nenhum 7% · Não sabem ou não responderam 4%" (só o que o instituto divulgou). */
export function OutrosTotais({ p, className }: { p: Pesquisa; className?: string }) {
  const bn = p.totais[CHAVE_BRANCOS_NULOS];
  const ind = p.totais[CHAVE_INDECISOS];
  if (bn === undefined && ind === undefined) return null;
  return (
    <p className={cn('text-[12.5px] text-fg-muted', className)}>
      {bn !== undefined ? (
        <>
          Branco, nulo ou nenhum <span className="num font-semibold text-fg">{fmtPctPesquisa(bn)}</span>
        </>
      ) : null}
      {bn !== undefined && ind !== undefined ? <span aria-hidden className="px-1.5 text-fg-subtle">·</span> : null}
      {ind !== undefined ? (
        <>
          Não sabem ou não responderam <span className="num font-semibold text-fg">{fmtPctPesquisa(ind)}</span>
        </>
      ) : null}
    </p>
  );
}

/** Votos válidos como o instituto divulgou (barra fina dividida, na ordem da urna). */
export function ValidosPesquisa({ p, cands, className }: { p: Pesquisa; cands: CandidatoPesquisa[]; className?: string }) {
  if (!p.validos) {
    return <p className={cn('text-[12.5px] text-fg-subtle', className)}>O instituto não divulgou votos válidos nesta pesquisa.</p>;
  }
  const v = cands.map((c) => p.validos![String(c.numero)] ?? 0);
  const soma = v[0] + v[1] || 1;
  return (
    <div className={className}>
      <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-fg-subtle">Votos válidos · divulgados pelo instituto</p>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 text-fg">
          {cands[0].nome} <span className="num font-semibold">{fmtPctPesquisa(v[0])}</span>
        </span>
        <span className="min-w-0 text-right text-fg">
          <span className="num font-semibold">{fmtPctPesquisa(v[1])}</span> {cands[1].nome}
        </span>
      </div>
      <div aria-hidden className="mt-1.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full">
        <span className={cn('h-full rounded-l-full', corSlot(cands[0].cor).bg)} style={{ width: `${(v[0] / soma) * 100}%` }} />
        <span className={cn('h-full rounded-r-full', corSlot(cands[1].cor).bg)} style={{ width: `${(v[1] / soma) * 100}%` }} />
      </div>
    </div>
  );
}

/** Cartão completo de uma pesquisa (página /pesquisas). `acoes`: botão de compartilhar, etc. */
export function CartaoPesquisa({ p, destaque, acoes, className }: { p: Pesquisa; destaque?: boolean; acoes?: ReactNode; className?: string }) {
  const nums = numerosDaPesquisa(p);
  const cands = useCandidatosPesquisa(p.cargo, nums);
  return (
    <article
      id={`pesquisa-${p.id}`}
      data-sem-anuncio-fixo
      aria-label={`Pesquisa ${p.instituto}, ${rotuloCargo(p.cargo)}, registro ${p.registro}`}
      className={cn(
        'relative scroll-mt-28 overflow-hidden rounded-2xl border bg-surface shadow-card',
        destaque ? 'border-brand/50 ring-2 ring-brand/40' : 'border-line',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            {rotuloCargo(p.cargo)} · divulgada em <span className="num">{fmtDataPesquisa(p.divulgadaEm)}</span>
          </p>
          <h3 className="mt-1 text-balance font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">{p.instituto}</h3>
        </div>
        {acoes ? <div className="-mr-1 -mt-0.5 flex shrink-0 items-center gap-1">{acoes}</div> : null}
      </header>

      <div className="mt-4 grid grid-cols-2 gap-x-4 px-4 sm:px-5">
        {cands.map((c, i) => (
          <div key={c.numero} className={cn('flex min-w-0 flex-col', i === 1 && 'items-end text-right')}>
            <NomeCandidato c={c} direita={i === 1} />
            <PctPesquisa valor={p.totais[String(c.numero)]} cor={c.cor} tamanho="text-[44px] sm:text-[52px]" className="mt-2" />
          </div>
        ))}
      </div>
      <p className="mt-2 px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-fg-subtle sm:px-5">Votos totais · estimulada</p>
      <OutrosTotais p={p} className="mt-1 px-4 sm:px-5" />
      <ValidosPesquisa p={p} cands={cands} className="mt-3 px-4 sm:px-5" />

      <div className="mt-4 border-t border-line bg-surface-2/40 px-4 py-3 sm:px-5">
        <LinhaObrigatoria p={p} />
        <FontesPesquisa p={p} className="mt-2" />
      </div>
    </article>
  );
}

/** Linha compacta (bloco da home/apuração): instituto, divulgação, os dois percentuais e as informações obrigatórias. */
export function LinhaPesquisa({ p, to }: { p: Pesquisa; to: string }) {
  const cands = useCandidatosPesquisa(p.cargo, numerosDaPesquisa(p));
  return (
    <li className="py-4 first:pt-0 last:pb-0 lg:py-0">
      <Link to={to} className="group -mx-2 block rounded-xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="min-w-0 font-display text-[15.5px] font-semibold leading-snug text-fg group-hover:underline">{p.instituto}</span>
          <span className="shrink-0 text-[12px] text-fg-muted">
            divulgada em <span className="num">{fmtDataPesquisa(p.divulgadaEm)}</span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {cands.map((c, i) => (
            <div key={c.numero} className={cn('flex min-w-0 flex-col', i === 1 && 'items-end text-right')}>
              <span className="flex items-center gap-1.5 text-[13px] leading-tight text-fg-muted">
                {i === 0 ? <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', corSlot(c.cor).bg)} /> : null}
                {c.nome}
                {i === 1 ? <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', corSlot(c.cor).bg)} /> : null}
              </span>
              <PctPesquisa valor={p.totais[String(c.numero)]} cor={c.cor} tamanho="text-[32px]" className="mt-1" />
            </div>
          ))}
        </div>
      </Link>
      <LinhaObrigatoria p={p} className="mt-2 text-[11.5px]" />
    </li>
  );
}
