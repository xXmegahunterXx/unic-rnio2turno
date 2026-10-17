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
 * Onde (sem empurrar nem encolher o mapa):
 *  - `onde="placar"`: linha no pé do placar (à esquerda no celular, à direita de 640 px para cima);
 *  - `onde="mapa"`, mapas do Brasil (`CLASSE_CANTO_CARIMBO`): no celular, legenda logo abaixo do desenho, dentro do quadro
 *    (no canto cobriria território — RS/SC no mapa por município); de 640 px para cima, pílula translúcida no canto
 *    inferior esquerdo (sudoeste vazio, como a atribuição de um mapa);
 *  - `onde="mapa"`, mapa de uma UF (`CLASSE_PE_CARIMBO`): sempre abaixo do desenho (cada estado tem um formato; não há
 *    canto vazio garantido);
 *  - `forma="pilha"` (cartograma): uma parte por linha, para caber na área sem blocos da grade.
 * As partes quebram linha sem deixar "·" sobrando no fim ou no começo (o separador do começo de linha fica escondido).
 *
 * Chave 'carimbo-print' no painel (Chaves da noite): desligada, o status traz `semCarimbo` e nenhum carimbo aparece.
 */
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import { useSemCarimbo } from '@/app/data/hooks';
import type { Tally } from '@/shared/types';
import { pctTotalizadas } from '@/shared/calc';
import { fmtHoraSeg, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { siteExibicao } from '@/app/lib/share';

/**
 * Posição do carimbo nos mapas do Brasil, de 640 px para cima: no canto inferior esquerdo do quadro (que precisa de
 * `relative`), longe dos botões de zoom. Abaixo de 640 px some — o mapa usa `CLASSE_PE_CARIMBO_CELULAR`, logo abaixo do
 * desenho. Nunca captura toque nem clique.
 */
export const CLASSE_CANTO_CARIMBO = 'pointer-events-none absolute bottom-2 left-2 z-[5] hidden max-w-[calc(100%-3.5rem)] sm:block';

/** Mapas do Brasil no celular (abaixo de 640 px): o carimbo em fluxo, logo abaixo do desenho, dentro do quadro. */
export const CLASSE_PE_CARIMBO_CELULAR = 'pointer-events-none relative mt-2 sm:hidden';

/** Mapa de uma UF: sempre abaixo do desenho, à esquerda (a coluna dos botões de zoom fica livre). */
export const CLASSE_PE_CARIMBO = 'pointer-events-none relative z-[5] mt-2 max-w-[calc(100%-3.5rem)]';

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
  /** 'linha' (padrão): partes em sequência, quebrando linha quando falta espaço; 'pilha': uma parte por linha. */
  forma?: 'linha' | 'pilha';
  className?: string;
}

export function CarimboPrint(props: CarimboPrintProps) {
  const desligado = useSemCarimbo();
  const comRota = useInRouterContext();
  if (desligado) return null;
  // Fora de um Router (testes, widgets isolados) não há `?t=`: só o `instante` explícito vale.
  return comRota ? <CarimboComRota {...props} /> : <CarimboCorpo {...props} reveja={props.instante !== undefined} />;
}

function CarimboComRota(props: CarimboPrintProps) {
  const [params] = useSearchParams();
  return <CarimboCorpo {...props} reveja={props.instante !== undefined || ehInstanteReveja(params.get('t'))} />;
}

/** Itens exibidos, na ordem (o selo da simulação em duas partes, para quebrar bem em telas estreitas). Puro. */
export function itensCarimbo(p: PartesCarimbo): { texto: string; tipo: 'selo' | 'marca' | 'info' }[] {
  return [
    ...(p.selo ? p.selo.split(' · ').map((texto) => ({ texto, tipo: 'selo' as const })) : []),
    { texto: p.marca, tipo: 'marca' as const },
    ...(p.rotulo ? [{ texto: p.rotulo, tipo: 'info' as const }] : []),
    { texto: p.apurado, tipo: 'info' as const },
    ...(p.hora ? [{ texto: p.hora, tipo: 'info' as const }] : []),
  ];
}

/** Separador "·" antes de cada parte; no começo de linha ele cai na margem negativa e o `overflow-hidden` o esconde. */
const SEP = "before:inline-block before:w-[1.1em] before:text-center before:opacity-70 before:content-['·']";

function CarimboCorpo({ resumo, simulado, turno, onde = 'placar', forma = 'linha', className, reveja }: CarimboPrintProps & { reveja: boolean }) {
  if (!resumo) return null;
  const d: DadosCarimbo = { host: siteExibicao(), resumo, simulado: !!simulado && turno !== 1, reveja: reveja && turno !== 1, turno1: turno === 1 };
  const itens = itensCarimbo(partesCarimbo(d));
  const mapa = onde === 'mapa';
  const pilha = forma === 'pilha';
  return (
    <p
      data-carimbo-print
      title={textoCarimbo(d)}
      className={cn(
        'num text-[10.5px] leading-[1.4] text-fg-subtle',
        mapa
          ? // no mapa: pílula translúcida quando fica SOBRE o desenho (de 640 px para cima, ou na pilha do cartograma)
            cn('w-fit max-w-full', pilha ? 'rounded-md bg-surface/80 px-1.5 py-1 shadow-sm' : 'sm:rounded-md sm:bg-surface/80 sm:px-1.5 sm:py-1 sm:shadow-sm')
          : 'w-full',
        className,
      )}
    >
      {/* o recorte fica no conteúdo (não no padding da pílula): o "·" do começo de cada linha some */}
      <span className="block overflow-hidden">
        <span className={cn('flex', pilha ? 'flex-col' : '-ml-[1.1em] flex-wrap', !mapa && 'sm:ml-0 sm:justify-end')}>
          {itens.map((it, i) => (
            <span
              key={i}
              className={cn(
                'whitespace-nowrap',
                !pilha && SEP,
                !mapa && 'sm:first:before:hidden',
                it.tipo === 'selo' && 'font-semibold uppercase tracking-[0.06em] text-brand-fg',
                it.tipo === 'marca' && 'font-semibold text-fg-muted',
              )}
            >
              {it.texto}
            </span>
          ))}
        </span>
      </span>
    </p>
  );
}
