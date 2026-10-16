/**
 * Selo de atualização da apuração ao vivo ("mais rápido que a TV"):
 *
 *   ● 63,21% apurado    Atualizado às 19:42:05 · dado do TSE das 19:41:50
 *
 * - % apurado em destaque (seções totalizadas, `pctTotalizadas`);
 * - "Atualizado às": na fonte 'tse', a última leitura bem-sucedida do arquivo da disputa no TSE feita pelo servidor
 *   (`status.frescor[race].conferidoEm`) — se o TSE parar de responder, a hora para (sem alarme: fato); fora dela
 *   (simulação), o instante dos números exibidos;
 * - "dado do TSE das": a hora da última totalização no arquivo oficial (`resumo.ultimaAtualizacao`, Brasília). Nunca
 *   aparece na simulação (números fictícios não citam o TSE);
 * - "novo": etiqueta discreta por ~4 s quando chegam números novos (sem piscar; parada com movimento reduzido).
 * - Leva 3, só na fonte 'tse' (fatos, sem alarme, texto simétrico e sem adjetivo):
 *   · I03 — o servidor pausou as leituras porque o TSE está limitando (`frescor[race].tseBloqueadoAte`): "O TSE está
 *     limitando leituras; nova tentativa às HH:MM";
 *   · I18 — o arquivo nacional do TSE parou enquanto os estados andam (`frescor[race].nacionalParadoDesde`, chave
 *     'aviso-nacional' do painel): "O arquivo nacional do TSE não atualiza desde HH:MM · veja os estados", com o atalho
 *     para a tabela de estados da página (`#estados-titulo`). Nunca somamos os estados no lugar do número oficial.
 * Sem `aria-live` próprio: o placar já anuncia as mudanças (espaçadas) para leitores de tela.
 */
import { useEffect, useRef, useState } from 'react';
import type { LiveStatus, RaceId, Summary } from '@/shared/types';
import { pctTotalizadas } from '@/shared/calc';
import { fmtHora, fmtHoraSeg, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';

export type ResumoSelo = Pick<Summary, 'secoes' | 'secoesTotalizadas' | 'ultimaAtualizacao' | 'votos'>;

export interface PartesSelo {
  pct: number;
  /** epoch ms de "Atualizado às" (null = não exibir) */
  atualizadoEm: number | null;
  /** epoch ms de "dado do TSE das" (null = não exibir) */
  dadoTseEm: number | null;
  /** fonte oficial: o texto pode citar o TSE */
  tse: boolean;
  /** I03: o TSE está limitando as leituras; nova tentativa neste instante (null = normal) */
  bloqueadoAte: number | null;
  /** I18: o arquivo nacional do TSE não muda desde este instante, com os estados andando (null = normal) */
  nacionalParadoDesde: number | null;
}

/** Partes do selo (puro, testável). `instante` = instante dos números exibidos (simulação). */
export function partesSelo(status: Pick<LiveStatus, 'fonte' | 'simulacao' | 'frescor'>, race: RaceId, resumo: ResumoSelo, instante?: number): PartesSelo {
  const tse = status.fonte === 'tse' && !status.simulacao;
  const pct = pctTotalizadas(resumo);
  if (tse) {
    const f = status.frescor?.[race];
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    return {
      pct,
      atualizadoEm: f?.conferidoEm ?? null,
      dadoTseEm: resumo.ultimaAtualizacao ?? null,
      tse,
      bloqueadoAte: num(f?.tseBloqueadoAte),
      nacionalParadoDesde: num(f?.nacionalParadoDesde),
    };
  }
  return {
    pct,
    atualizadoEm: typeof instante === 'number' && Number.isFinite(instante) ? instante : null,
    dadoTseEm: null,
    tse,
    bloqueadoAte: null,
    nacionalParadoDesde: null,
  };
}

/**
 * Rola até a tabela "Todos os estados" da página, descontando o cabeçalho fixo. Blocos acima dela podem mudar de altura
 * durante a rolagem (carregamento sob demanda): confere a posição depois e corrige (até 3 vezes).
 */
function irParaEstados() {
  const alvo = document.getElementById('estados-titulo');
  if (!alvo) return;
  const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const destino = () => {
    const cab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 64;
    return Math.max(0, alvo.getBoundingClientRect().top + window.scrollY - cab - 16);
  };
  window.scrollTo({ top: destino(), behavior: reduzir ? 'auto' : 'smooth' });
  // quem rolar por conta própria nesse meio-tempo manda: nada de puxar a tela de volta
  let mexeu = false;
  const parar = () => {
    mexeu = true;
  };
  for (const ev of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(ev, parar, { once: true, passive: true });
  let n = 0;
  const conferir = () => {
    if (mexeu || !alvo.isConnected || ++n > 3) {
      for (const ev of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(ev, parar);
      return;
    }
    const d = destino();
    if (Math.abs(d - window.scrollY) > 8) window.scrollTo({ top: d, behavior: 'auto' });
    window.setTimeout(conferir, 450);
  };
  window.setTimeout(conferir, reduzir ? 50 : 700);
}

/** Chave dos números (muda quando chega dado novo). */
const chaveNumeros = (r: ResumoSelo) => `${r.secoesTotalizadas}|${r.ultimaAtualizacao ?? ''}|${r.votos.join(',')}`;

/** true por `ms` depois que os números mudam (nunca na 1ª exibição). */
function useNovoDado(chave: string, ms = 4000): boolean {
  const anterior = useRef<string | null>(null);
  const [novo, setNovo] = useState(false);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = chave;
    if (antes === null || antes === chave) return;
    setNovo(true);
    const t = setTimeout(() => setNovo(false), ms);
    return () => clearTimeout(t);
  }, [chave, ms]);
  return novo;
}

export function SeloAtualizacao({
  status,
  race,
  resumo,
  instante,
  className,
}: {
  status: Pick<LiveStatus, 'fonte' | 'simulacao' | 'frescor'>;
  race: RaceId;
  resumo: ResumoSelo;
  /** instante dos números exibidos (snapshot `simNow`): "Atualizado às" fora da fonte 'tse' */
  instante?: number;
  className?: string;
}) {
  const p = partesSelo(status, race, resumo, instante);
  const novo = useNovoDado(chaveNumeros(resumo));

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:gap-x-3', className)}>
      <span
        className={cn(
          'relative inline-flex h-7 shrink-0 items-center gap-2 rounded-lg bg-surface-3 pl-2.5 pr-3 ring-1 transition-[box-shadow,background-color] duration-700 motion-reduce:transition-none',
          novo ? 'bg-brand/15 ring-brand/45' : 'ring-transparent',
        )}
      >
        <LiveDot tone={status.simulacao ? 'brand' : 'live'} size={7} />
        <span className="num text-[14px] font-semibold leading-none tracking-[-0.01em] text-fg">{fmtPct(p.pct)}</span>
        <span className="text-[12px] font-medium leading-none text-fg-muted">apurado</span>
        {/* "novo": etiqueta presa ao canto do selo (não empurra o texto ao lado) */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -right-2 -top-2 rounded-md bg-brand px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.08em] text-brand-ink shadow-card',
            'transition-[opacity,transform] duration-300 motion-reduce:transition-none',
            novo ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
          )}
        >
          novo
        </span>
      </span>
      {p.atualizadoEm !== null || p.tse ? (
        // celular: as duas horas uma sobre a outra, ao lado do selo (cabe em 360 px); a partir de sm, numa linha
        <span className="flex min-w-0 flex-col text-[12px] leading-[1.3] text-fg-muted sm:flex-row sm:flex-wrap sm:text-[12.5px] sm:leading-snug">
          {p.atualizadoEm !== null ? (
            <span className="whitespace-nowrap">
              Atualizado às <span className="num font-medium text-fg">{fmtHoraSeg(p.atualizadoEm)}</span>
            </span>
          ) : null}
          {p.tse ? (
            <span className="whitespace-nowrap">
              {p.atualizadoEm !== null ? <span className="hidden sm:inline">&nbsp;·&nbsp;</span> : null}
              {p.dadoTseEm !== null ? (
                <>
                  <span className="sm:hidden">Dado</span>
                  <span className="hidden sm:inline">dado</span> do TSE das <span className="num font-medium text-fg">{fmtHoraSeg(p.dadoTseEm)}</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">Aguardando</span>
                  <span className="hidden sm:inline">aguardando</span> o 1º dado do TSE
                </>
              )}
            </span>
          ) : null}
        </span>
      ) : null}
      {p.bloqueadoAte !== null || p.nacionalParadoDesde !== null ? (
        // fatos sobre o feed oficial (sem alarme): linha própria, abaixo do selo
        <div className="flex basis-full flex-col gap-1">
          {p.bloqueadoAte !== null ? (
            <p className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-fg-muted sm:text-[12.5px]">
              <Icon name="relogio" size={14} className="mt-px shrink-0 text-fg-subtle" />
              <span>
                O TSE está limitando leituras; nova tentativa às <span className="num font-medium text-fg">{fmtHora(p.bloqueadoAte)}</span>
              </span>
            </p>
          ) : null}
          {p.nacionalParadoDesde !== null ? (
            <p className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-fg-muted sm:text-[12.5px]">
              <Icon name="info" size={14} className="mt-px shrink-0 text-fg-subtle" />
              <span>
                O arquivo nacional do TSE não atualiza desde <span className="num font-medium text-fg">{fmtHora(p.nacionalParadoDesde)}</span>
                {' · '}
                <button
                  type="button"
                  onClick={irParaEstados}
                  className="rounded font-medium text-brand-fg underline decoration-brand/40 underline-offset-2 hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  veja os estados
                </button>
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
