/**
 * Carimbo do print (I10): linha discreta DENTRO do mapa e no pé do placar —
 * "sintonia2026.com.br · 63,21% apurado · 18:47:12 (Brasília)". Todo print vira divulgação, e o print fica preso ao
 * instante: o % apurado e a hora vêm do MESMO resumo que a tela mostra (`resumo.ultimaAtualizacao`, a hora do dado
 * oficial/simulado), nunca do relógio do aparelho — quem recorta o mapa leva junto de quando ele é.
 *
 * Variantes (texto em `partesCarimbo`, puro e testado):
 *  - ao vivo: domínio · X% apurado · HH:MM:SS (Brasília);
 *  - "Reveja a noite" (`?t=` na URL, ou `instante`): domínio · Reveja a noite · X% apurado · HH:MM:SS (Brasília);
 *  - simulação: "SIMULAÇÃO · dados fictícios" · domínio · X% apurado (SEM hora: hora fictícia num print é munição);
 *  - 1º turno oficial: domínio · 1º turno · resultado oficial (TSE) (o dado é de 04/10; uma hora sem data confundiria).
 * Nunca leva anúncio, nome, foto nem cor de candidato. Só texto em `text-fg-subtle`, números com `.num`.
 *
 * Onde: `onde="mapa"` = pílula translúcida (como a atribuição de um mapa), empilhada em 2 linhas no celular para cobrir o
 * mínimo do mapa; o mapa a recebe pela prop `carimbo` e a põe no canto inferior esquerdo do quadro
 * (`CLASSE_CANTO_CARIMBO`; o cartograma, numa área sem blocos). `onde="placar"` = linha no pé do placar, à direita.
 */
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import type { Tally } from '@/shared/types';
import { pctTotalizadas } from '@/shared/calc';
import { fmtHoraSeg, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';

/** Posição do carimbo dentro do quadro de um mapa (o quadro precisa de `relative`): canto inferior esquerdo, sem capturar
 * toque nem clique (o mapa continua respondendo por baixo), abaixo de tooltips e botões, sem chegar aos botões de zoom. */
export const CLASSE_CANTO_CARIMBO = 'pointer-events-none absolute bottom-2 left-2 z-[5] max-w-[calc(100%-3.5rem)]';

/** O mínimo do resumo exibido de que o carimbo precisa (Summary, MunicipioResumo…). */
export type ResumoCarimbo = Pick<Tally, 'secoes' | 'secoesTotalizadas'> & { ultimaAtualizacao: number | null };

export interface DadosCarimbo {
  /** Domínio para exibir ("sintonia2026.com.br"); vazio = marca "Sintonia". */
  host: string;
  resumo: ResumoCarimbo;
  simulado?: boolean;
  /** "Reveja a noite": o placar mostrado é de um instante passado. */
  reveja?: boolean;
  /** Corrida do 1º turno (resultado oficial). */
  turno1?: boolean;
}

export interface PartesCarimbo {
  /** Selo antes do domínio (só na simulação). */
  selo: string | null;
  marca: string;
  /** Rótulo depois da marca ("Reveja a noite", "1º turno"). */
  rotulo: string | null;
  /** "63,21% apurado" (ou "resultado oficial (TSE)" no 1º turno). */
  apurado: string;
  /** "18:47:12 (Brasília)"; null sem seção totalizada, no 1º turno e na simulação. */
  hora: string | null;
}

/** Partes do carimbo (puro, testado). */
export function partesCarimbo(d: DadosCarimbo): PartesCarimbo {
  const marca = d.host.trim() || 'Sintonia';
  if (d.turno1) return { selo: null, marca, rotulo: '1º turno', apurado: 'resultado oficial (TSE)', hora: null };
  const apurado = `${fmtPct(pctTotalizadas(d.resumo))} apurado`;
  const t = d.resumo.ultimaAtualizacao;
  const hora = !d.simulado && d.resumo.secoesTotalizadas > 0 && typeof t === 'number' && Number.isFinite(t) ? `${fmtHoraSeg(t)} (Brasília)` : null;
  return {
    selo: d.simulado ? 'SIMULAÇÃO · dados fictícios' : null,
    marca,
    rotulo: d.reveja ? 'Reveja a noite' : null,
    apurado,
    hora,
  };
}

/** Texto corrido (dica ao passar o mouse, testes): partes separadas por " · ". */
export function textoCarimbo(d: DadosCarimbo): string {
  const p = partesCarimbo(d);
  return [p.selo, p.marca, p.rotulo, p.apurado, p.hora].filter(Boolean).join(' · ');
}

/** `?t=` de "Reveja a noite" (mesmos formatos de `lerInstante` em LinhaDoTempo: "18h42", "18:42", "1842" ou epoch ms). */
export function ehInstanteReveja(v: string | null | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase();
  if (/^\d{10,}$/.test(s)) return true;
  const m = /^(\d{1,2})(?:h|:)?(\d{2})$/.exec(s);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

export interface CarimboPrintProps {
  /** Resumo do MESMO snapshot exibido (placar ou mapa). Ausente = não mostra nada. */
  resumo: ResumoCarimbo | null | undefined;
  /** Números simulados (`status.simulacao` no 2º turno). */
  simulado?: boolean;
  /** Turno da corrida exibida (1 = resultado oficial do 1º turno). */
  turno?: 1 | 2;
  /** "Reveja a noite": instante exibido. Sem ele, o carimbo olha o `?t=` da URL. */
  instante?: number;
  onde?: 'mapa' | 'placar';
  className?: string;
}

export function CarimboPrint(props: CarimboPrintProps) {
  // Fora de um Router (testes, widgets isolados) não há `?t=`: só o `instante` explícito vale.
  return useInRouterContext() ? <CarimboComRota {...props} /> : <CarimboCorpo {...props} reveja={props.instante !== undefined} />;
}

function CarimboComRota(props: CarimboPrintProps) {
  const [params] = useSearchParams();
  return <CarimboCorpo {...props} reveja={props.instante !== undefined || ehInstanteReveja(params.get('t'))} />;
}

function CarimboCorpo({ resumo, simulado, turno, onde = 'placar', className, reveja }: CarimboPrintProps & { reveja: boolean }) {
  if (!resumo) return null;
  const d: DadosCarimbo = { host: siteExibicao(), resumo, simulado: !!simulado && turno !== 1, reveja: reveja && turno !== 1, turno1: turno === 1 };
  const p = partesCarimbo(d);
  const mapa = onde === 'mapa';
  const sep = (cls?: string) => (
    <span aria-hidden className={cn('px-1 opacity-70', cls)}>
      ·
    </span>
  );
  // Duas partes: [selo ·] marca [· rótulo]  |  % apurado [· hora]. No celular, uma embaixo da outra (o mapa fica
  // coberto o mínimo possível e nada é cortado); de 640 px para cima, numa linha só.
  return (
    <p
      data-carimbo-print
      title={textoCarimbo(d)}
      className={cn(
        'num flex flex-col text-[10.5px] leading-[1.35] text-fg-subtle sm:flex-row sm:flex-wrap sm:items-center',
        mapa
          ? // como a atribuição de um mapa (o mapa põe no canto com `CLASSE_CANTO_CARIMBO` ou numa posição própria)
            'w-fit items-start rounded-md bg-surface/80 px-1.5 py-1 shadow-sm'
          : 'items-end text-right sm:justify-end',
        className,
      )}
    >
      <span className="flex flex-wrap items-center whitespace-nowrap">
        {p.selo ? (
          <>
            <span className="font-semibold uppercase tracking-[0.06em] text-brand-fg">{p.selo}</span>
            {sep()}
          </>
        ) : null}
        <span className="font-semibold text-fg-muted">{p.marca}</span>
        {p.rotulo ? (
          <>
            {sep()}
            {p.rotulo}
          </>
        ) : null}
      </span>
      {sep('max-sm:hidden')}
      <span className="whitespace-nowrap">
        {p.apurado}
        {p.hora ? (
          <>
            {sep()}
            {p.hora}
          </>
        ) : null}
      </span>
    </p>
  );
}
