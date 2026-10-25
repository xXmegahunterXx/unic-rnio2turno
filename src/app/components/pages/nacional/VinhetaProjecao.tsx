/**
 * Vinheta da projeção em tela cheia: abertura musical + letreiro "PROJEÇÃO" atravessando a tela e, em seguida, os
 * números da Projeção do Sintonia em destaque (fecha sozinha, com um toque ou Esc). No resultado definido pelo TSE, o
 * letreiro é "RESULTADO". Quando aparece: `vinheta.ts` (puro, testado). Só Presidente, Brasil, ao vivo.
 *
 * Música sintetizada aqui (Web Audio, sem arquivo de áudio) e só com o som ligado pela pessoa: os navegadores só tocam
 * depois de um toque — o botão "Som" cria o áudio no próprio toque; com a preferência salva, o primeiro toque na página
 * reativa. A pessoa pode desligar as vinhetas (fica salvo neste aparelho). Movimento reduzido: sem letreiro, só números.
 * Textos neutros e simétricos; fotos oficiais só onde `useFotosRace` permite (nunca na simulação com nomes ocultos).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Race, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { partidoENumero } from '@/shared/anon';
import { TEXTOS_PROJECAO } from '@/shared/projecao';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { useFotosRace } from '@/app/components/apuracao/fotos';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { tituloResultadoDefinido } from '@/app/components/share/textos';
import { useProjecao } from './Projecao';
import {
  DURACAO_LETREIRO_MS,
  DURACAO_VINHETA_MS,
  INTERVALO_VINHETA_MS,
  lerMemoriaVinheta,
  proximaVinheta,
  type MemoriaVinheta,
  type ProjecaoVinheta,
  type Vinheta,
} from './vinheta';

const CHAVE_LIGADAS = 'sintonia:vinhetas';
const CHAVE_SOM = 'sintonia:vinheta-som';
const CHAVE_MEMORIA = 'sintonia:vinheta:pres';
const CHAVE_ULTIMA = 'sintonia:vinheta:pres:em';

const lerLocal = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravarLocal = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
};
const lerSessao = (k: string): string | null => {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravarSessao = (k: string, v: string) => {
  try {
    window.sessionStorage.setItem(k, v);
  } catch {
    /* idem */
  }
};

type Ctor = typeof AudioContext;
const audioCtor = (): Ctor | null =>
  typeof window === 'undefined' ? null : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null);

/** Abertura: batidas graves + arpejo subindo + acorde final (resultado: mais longa e cheia). */
function tocarAbertura(ctx: AudioContext, resultado: boolean) {
  const t0 = ctx.currentTime + 0.03;
  const mestre = ctx.createGain();
  mestre.gain.value = 0.28;
  mestre.connect(ctx.destination);
  const bumbo = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.22);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(mestre);
    o.start(t);
    o.stop(t + 0.32);
  };
  const nota = (f: number, t: number, dur: number, vol: number, tipo: OscillatorType) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 2600;
    o.type = tipo;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filtro);
    filtro.connect(g);
    g.connect(mestre);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const batidas = resultado ? [0, 0.32, 0.64, 0.96, 1.28] : [0, 0.36, 0.72];
  batidas.forEach((b) => bumbo(t0 + b));
  const arpejo = resultado ? [392, 523.25, 659.25, 783.99, 1046.5] : [392, 523.25, 659.25, 783.99];
  arpejo.forEach((f, i) => nota(f, t0 + 0.08 + i * 0.16, 0.5, 0.35, 'triangle'));
  const fim = t0 + 0.08 + arpejo.length * 0.16;
  const acorde = resultado ? [261.63, 329.63, 392, 523.25, 659.25, 783.99] : [261.63, 329.63, 392, 523.25];
  acorde.forEach((f) => nota(f, fim, resultado ? 2.4 : 1.5, 0.22, 'sawtooth'));
}

const reduzMovimento = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Exibicao {
  /** identifica cada exibição (uma nova reinicia a vinheta) */
  id: number;
  vinheta: Vinheta;
  projecao: ProjecaoVinheta | null;
  pctSecoes: number;
  eleito: number | null;
  pctEleito: number;
}

export interface VinhetaProjecaoProps {
  race: Race;
  resumo: Summary;
  aoVivo: boolean;
  simulado: boolean;
  className?: string;
}

export function VinhetaProjecao({ race, resumo, aoVivo, simulado, className }: VinhetaProjecaoProps) {
  const ativo = aoVivo && race.turno === 2 && race.candidatos.length === 2;
  const q = useProjecao(race.id, 'BR', ativo);
  const fotos = useFotosRace(race);
  const [ligadas, setLigadas] = useState(() => lerLocal(CHAVE_LIGADAS) !== '0');
  const [som, setSom] = useState(() => lerLocal(CHAVE_SOM) === '1');
  const [exibicao, setExibicao] = useState<Exibicao | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const memRef = useRef<MemoriaVinheta>(lerMemoriaVinheta(lerSessao(CHAVE_MEMORIA)));
  // hora da última vinheta, guardada na sessão: recarregar a página não fura o intervalo mínimo
  const ultimaEmRef = useRef(Number(lerSessao(CHAVE_ULTIMA)) || 0);
  const pendenteRef = useRef<Omit<Exibicao, 'id'> | null>(null);
  const timerRef = useRef<number | null>(null);
  const somRef = useRef(som);
  somRef.current = som;

  const proj = ativo && q.data && !q.isError && q.data.race === race.id && q.data.abrangencia === 'BR' && q.data.disponivel ? q.data : null;
  const projecao: ProjecaoVinheta | null = (() => {
    const a = proj?.candidatos.find((c) => c.indice === 0);
    const b = proj?.candidatos.find((c) => c.indice === 1);
    return a && b ? { pct: [a.pct, b.pct], min: [a.min, b.min], max: [a.max, b.max] } : null;
  })();
  const eleito = race.turno === 2 && resumo.eleito !== null && race.candidatos[resumo.eleito] ? resumo.eleito : null;
  const pctSecoes = pctTotalizadas(resumo);

  const garantirAudio = useCallback(() => {
    const C = audioCtor();
    if (!C) return null;
    if (!ctxRef.current) {
      try {
        ctxRef.current = new C();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume().catch(() => undefined);
    return ctxRef.current;
  }, []);

  // com a preferência de som salva, o primeiro toque na página libera o áudio (regra dos navegadores)
  useEffect(() => {
    if (!som || !ativo) return;
    const liberar = () => garantirAudio();
    window.addEventListener('pointerdown', liberar, { once: true });
    return () => window.removeEventListener('pointerdown', liberar);
  }, [som, ativo, garantirAudio]);

  const idRef = useRef(0);
  const fecharTela = useCallback(() => setExibicao(null), []);
  const mostrar = useCallback(
    (e: Omit<Exibicao, 'id'>) => {
      ultimaEmRef.current = Date.now();
      gravarSessao(CHAVE_ULTIMA, String(ultimaEmRef.current));
      setExibicao({ ...e, id: ++idRef.current });
      const ctx = somRef.current ? ctxRef.current : null;
      if (ctx && ctx.state === 'running') {
        try {
          tocarAbertura(ctx, e.vinheta.tipo === 'definido');
        } catch {
          /* sem som: a vinheta segue */
        }
      }
    },
    [],
  );

  const agendar = useCallback(
    (e: Omit<Exibicao, 'id'>) => {
      const falta = ultimaEmRef.current + INTERVALO_VINHETA_MS - Date.now();
      if (e.vinheta.tipo === 'definido' || falta <= 0) {
        pendenteRef.current = null;
        mostrar(e);
        return;
      }
      pendenteRef.current = e; // a mais nova espera a vez
      if (timerRef.current === null)
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          const p = pendenteRef.current;
          pendenteRef.current = null;
          if (p) mostrar(p);
        }, falta);
    },
    [mostrar],
  );

  const chave = JSON.stringify([projecao?.pct ?? null, eleito]);
  useEffect(() => {
    if (!ativo) return;
    const r = proximaVinheta(memRef.current, { projecao, eleito });
    memRef.current = r.memoria;
    gravarSessao(CHAVE_MEMORIA, JSON.stringify(r.memoria));
    if (r.vinheta && ligadas)
      agendar({ vinheta: r.vinheta, projecao, pctSecoes, eleito, pctEleito: eleito !== null ? pctValidos(resumo, eleito) : 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume projeção e eleito
  }, [ativo, chave, ligadas, agendar]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      void ctxRef.current?.close().catch(() => undefined);
    },
    [],
  );

  if (!ativo || (!projecao && eleito === null)) return null;

  const alternarSom = () => {
    const novo = !som;
    setSom(novo);
    gravarLocal(CHAVE_SOM, novo ? '1' : '0');
    if (novo) {
      const ctx = garantirAudio();
      if (ctx) {
        try {
          tocarAbertura(ctx, false); // amostra no próprio toque (e libera o áudio)
        } catch {
          /* idem */
        }
      }
    }
  };
  const alternarLigadas = () => {
    const novo = !ligadas;
    setLigadas(novo);
    gravarLocal(CHAVE_LIGADAS, novo ? '1' : '0');
    if (!novo) {
      pendenteRef.current = null;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const verAgora = () => {
    if (som) garantirAudio();
    mostrar({
      vinheta: { tipo: eleito !== null ? 'definido' : 'projecao-nova', anterior: null },
      projecao,
      pctSecoes,
      eleito,
      pctEleito: eleito !== null ? pctValidos(resumo, eleito) : 0,
    });
  };

  const botao = 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  return (
    <>
      <div className={cn('flex min-w-0 flex-wrap items-center gap-2 px-1', className)}>
        <span className="mr-1 text-[12.5px] font-medium text-fg-muted">Vinheta da projeção</span>
        <button type="button" onClick={verAgora} className={cn(botao, 'border-line bg-surface-2 text-fg hover:bg-surface-3')}>
          <Icon name="play" size={14} />
          Ver agora
        </button>
        <button
          type="button"
          onClick={alternarSom}
          aria-pressed={som}
          className={cn(botao, som ? 'border-brand/40 bg-brand/15 text-fg' : 'border-line bg-surface-2 text-fg hover:bg-surface-3')}
        >
          <Icon name={som ? 'som' : 'sem-som'} size={15} className={cn(som && 'text-brand-fg')} />
          {som ? 'Som ligado' : 'Som desligado'}
        </button>
        <button
          type="button"
          onClick={alternarLigadas}
          aria-pressed={ligadas}
          className={cn(botao, 'border-line bg-transparent text-fg-muted hover:text-fg')}
        >
          {ligadas ? 'Desativar vinhetas' : 'Ativar vinhetas'}
        </button>
      </div>
      {exibicao ? <Tela key={exibicao.id} race={race} fotos={fotos} e={exibicao} simulado={simulado} fechar={fecharTela} /> : null}
    </>
  );
}

function Tela({ race, fotos, e, simulado, fechar }: { race: Race; fotos: (string | undefined)[]; e: Exibicao; simulado: boolean; fechar: () => void }) {
  const resultado = e.vinheta.tipo === 'definido';
  const [fase, setFase] = useState<'letreiro' | 'numeros'>(() => (reduzMovimento() ? 'numeros' : 'letreiro'));
  const fecharRef = useRef<HTMLButtonElement>(null);
  // a página re-renderiza a cada atualização do placar: o relógio da vinheta começa UMA vez, ao abrir
  const fecharAtual = useRef(fechar);
  fecharAtual.current = fechar;

  useEffect(() => {
    const t1 = window.setTimeout(() => setFase('numeros'), DURACAO_LETREIRO_MS);
    const t2 = window.setTimeout(() => fecharAtual.current(), DURACAO_VINHETA_MS + (resultado ? 4000 : 0));
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') fecharAtual.current();
    };
    window.addEventListener('keydown', tecla);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('keydown', tecla);
    };
  }, [resultado]);

  useEffect(() => {
    if (fase === 'numeros') fecharRef.current?.focus({ preventScroll: true });
  }, [fase]);

  const palavra = resultado ? 'RESULTADO' : 'PROJEÇÃO';
  const urnas = `${fmtPct(e.pctSecoes, e.pctSecoes < 10 ? 1 : 0)} das urnas apuradas`;
  const p1 = (v: number) => fmtPct(v, 1);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={resultado ? 'Resultado definido' : TEXTOS_PROJECAO.titulo}
      onClick={fechar}
      data-sem-anuncio-fixo
      className="fixed inset-0 z-[300] flex cursor-pointer items-center justify-center overflow-hidden bg-bg/95 backdrop-blur-md"
    >
      {fase === 'letreiro' ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-3">
          <div className="h-3 origin-left animate-faixa bg-brand sm:h-4" />
          <div className="animate-letreiro whitespace-nowrap font-display text-[clamp(64px,22vw,260px)] font-black uppercase leading-none tracking-[-0.04em] text-fg">
            {palavra} <span className="text-brand-fg">·</span> {palavra}
          </div>
          <div className="h-3 origin-right animate-faixa bg-brand sm:h-4 [animation-delay:120ms]" />
        </div>
      ) : (
        <div className="w-full max-w-[880px] animate-fade-up px-4 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-display text-[clamp(28px,6vw,52px)] font-black uppercase leading-none tracking-[-0.03em] text-fg">{palavra}</span>
            {resultado ? null : (
              <span className="inline-flex h-6 items-center rounded-md border border-line bg-surface-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                Estimativa
              </span>
            )}
            {simulado ? <SimulationRibbon variant="badge" className="h-6 px-2 text-[10px]" /> : null}
          </div>
          <p className="num mt-2 text-[14px] text-fg-muted sm:text-[16px]">
            {resultado ? `Segundo o TSE, com ${urnas}` : `${TEXTOS_PROJECAO.titulo}, com ${urnas}`}
          </p>

          {resultado && e.eleito !== null ? (
            <div className="mt-6 flex items-center gap-4 sm:gap-6">
              <CandidateAvatar candidato={race.candidatos[e.eleito]} foto={fotos[e.eleito]} size="xl" eleito />
              <div className="min-w-0">
                <div className="text-pretty font-display text-[clamp(26px,5.5vw,48px)] font-semibold leading-tight tracking-[-0.02em] text-fg">
                  {tituloResultadoDefinido(race, race.candidatos[e.eleito].nomeUrna, false)}
                </div>
                <div className={cn('num mt-2 font-display text-[clamp(30px,7vw,64px)] font-semibold leading-none', corSlot(race.candidatos[e.eleito].cor).textDisplay)}>
                  {fmtPct(e.pctEleito, 2)}
                  <span className="ml-2 align-middle text-[14px] font-medium text-fg-muted sm:text-[16px]">dos votos válidos</span>
                </div>
              </div>
            </div>
          ) : e.projecao ? (
            <>
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5">
                {[0, 1].map((i) => {
                  const c = race.candidatos[i];
                  const s = corSlot(c.cor);
                  return (
                    <li key={i} className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-3 sm:p-5', i === 1 && 'items-end text-right')}>
                      <CandidateAvatar candidato={c} foto={fotos[i]} size="xl" />
                      <div className="mt-3 break-words text-[15px] font-semibold leading-tight text-fg sm:text-[19px]">{c.nomeUrna}</div>
                      <div className={cn('num mt-0.5 text-[12px] font-semibold sm:text-[13px]', s.text)}>{partidoENumero(c)}</div>
                      <div className={cn('num mt-3 font-display text-[clamp(40px,11vw,96px)] font-semibold leading-none tracking-[-0.04em]', s.textDisplay)}>
                        {p1(e.projecao!.pct[i])}
                      </div>
                      <div className="num mt-2 text-[12px] text-fg-muted sm:text-[14px]">
                        entre <span className="font-medium text-fg">{p1(e.projecao!.min[i])}</span> e <span className="font-medium text-fg">{p1(e.projecao!.max[i])}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {e.vinheta.anterior ? (
                <p className="num mt-3 text-[12.5px] text-fg-muted sm:text-[14px]">
                  Na projeção anterior: {race.candidatos[0].nomeUrna} {p1(e.vinheta.anterior[0])} · {race.candidatos[1].nomeUrna} {p1(e.vinheta.anterior[1])}
                </p>
              ) : null}
              <p className="mt-4 max-w-[72ch] text-pretty text-[12.5px] leading-snug text-fg-muted sm:text-[14px]">{TEXTOS_PROJECAO.subtitulo}</p>
            </>
          ) : null}

          <div className="mt-6 flex justify-center">
            <button
              ref={fecharRef}
              type="button"
              onClick={fechar}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-line bg-surface-2 px-4 text-[13px] font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon name="fechar" size={15} />
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
