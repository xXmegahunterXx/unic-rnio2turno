/**
 * Relógio da apuração e controles de transporte (Iniciar · Pausar/Retomar · Reiniciar · velocidade),
 * usados na barra superior (desktop), na barra inferior (celular) e pelos atalhos de teclado.
 */
import { memo, useCallback, useMemo } from 'react';
import { fmtHoraSeg, fmtPct } from '@/shared/format';
import { pctTotalizadas } from '@/shared/calc';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, Button, Icon, IconButton, LiveDot, Segmented, Select } from '@/app/ui';
import { useAdmin } from './dados';
import { FASE_ROTULO, fmtVel, INICIO_SIMULACAO, relogioAgora, VELOCIDADES } from './rotulos';

/** Ações do relógio, com confirmação para as destrutivas. */
export function useAcoesRelogio() {
  const { snap, dados, run, confirmar } = useAdmin();
  const st = snap.state;
  const sim = st.fonte === 'simulacao';
  const rodando = sim && st.relogio.rodando;
  const zerado = sim && !st.relogio.rodando && st.relogio.ancoraSim <= INICIO_SIMULACAO;

  const iniciar = useCallback(async () => {
    if (!sim || !zerado) {
      const ok = await confirmar({
        titulo: sim ? 'Recomeçar a noite?' : 'Iniciar a simulação?',
        descricao: sim
          ? `O relógio volta para 16:59:30 e começa a rodar a ${fmtVel(st.relogio.velocidade)}.`
          : `A fonte passa para Simulação e o relógio começa em 16:59:30, a ${fmtVel(st.relogio.velocidade)}.`,
        corpo: sim
          ? 'Todos os visitantes veem a apuração recomeçar do zero. O cenário é mantido.'
          : 'Todos os visitantes passam a ver números simulados, com a faixa “SIMULAÇÃO · dados fictícios”.',
        confirmar: sim ? 'Recomeçar' : 'Iniciar simulação',
        perigo: true,
      });
      if (!ok) return;
    }
    await run({ tipo: 'relogio', acao: 'iniciar' }, { chave: 'relogio', sucesso: 'Simulação iniciada às 16:59:30' });
  }, [sim, zerado, confirmar, run, st.relogio.velocidade]);

  const alternar = useCallback(async () => {
    if (!sim) return;
    if (rodando) await run({ tipo: 'relogio', acao: 'pausar' }, { chave: 'relogio', sucesso: 'Relógio pausado' });
    else await run({ tipo: 'relogio', acao: 'retomar' }, { chave: 'relogio', sucesso: 'Relógio retomado' });
  }, [sim, rodando, run]);

  const reiniciar = useCallback(async () => {
    const ok = await confirmar({
      titulo: 'Reiniciar a simulação?',
      descricao: 'O relógio volta para 16:59:30 e fica pausado.',
      corpo: 'Todos os visitantes veem a apuração voltar ao início (0% das seções). O cenário, o aviso e a fonte são mantidos.',
      confirmar: 'Reiniciar',
      perigo: true,
    });
    if (!ok) return;
    await run({ tipo: 'relogio', acao: 'reiniciar' }, { chave: 'relogio', sucesso: 'Relógio reiniciado em 16:59:30' });
  }, [confirmar, run]);

  const velocidade = useCallback(
    (v: number) => run({ tipo: 'velocidade', velocidade: v }, { chave: 'velocidade', sucesso: `Velocidade ${fmtVel(v)}` }),
    [run],
  );

  /** Salta `ms` de tempo simulado a partir de agora. */
  const avancar = useCallback(
    (ms: number) => {
      const agora = relogioAgora(snap, dados.recebidoEm, Date.now());
      const alvo = Math.round((agora + ms) / 1000) * 1000;
      return run({ tipo: 'saltar-tempo', simNow: alvo }, { chave: 'saltar', sucesso: `Relógio em ${fmtHoraSeg(alvo)}` });
    },
    [snap, dados.recebidoEm, run],
  );

  return { sim, rodando, zerado, iniciar, alternar, reiniciar, velocidade, avancar };
}

/** Relógio da apuração interpolado (horário de Brasília), com os segundos rolando. */
export const RelogioApuracao = memo(function RelogioApuracao({ tamanho = 'lg', className }: { tamanho?: 'md' | 'lg' | 'xl'; className?: string }) {
  const { snap, dados } = useAdmin();
  const rapido = snap.state.fonte === 'simulacao' && snap.state.relogio.rodando && snap.state.relogio.velocidade >= 5;
  const agora = useNow(rapido ? 100 : 250);
  const t = relogioAgora(snap, dados.recebidoEm, agora);
  const txt = fmtHoraSeg(t);
  const hm = txt.slice(0, 5);
  const s = txt.slice(5);
  return (
    <span
      role="timer"
      aria-label={`Relógio da apuração: ${txt}, horário de Brasília`}
      className={cn(
        'num inline-flex items-baseline font-display font-semibold leading-none tracking-[-0.03em] text-fg',
        tamanho === 'xl' && 'text-[44px]',
        tamanho === 'lg' && 'text-[34px]',
        tamanho === 'md' && 'text-[24px]',
        className,
      )}
    >
      <span>{hm}</span>
      <span className="text-fg-muted">{s}</span>
    </span>
  );
});

/** Pílula "no ar": estado do relógio e da fase. */
export function EstadoAoVivo({ compacto, className }: { compacto?: boolean; className?: string }) {
  const { snap } = useAdmin();
  const st = snap.state;
  const fase = snap.status.fase;
  const sim = st.fonte === 'simulacao';
  let tom: 'brand' | 'ok' | 'muted' | 'live' | 'pending' = 'brand';
  let texto: string = FASE_ROTULO[fase];
  let pulsa = true;
  if (st.congelado) {
    tom = 'live';
    texto = 'Congelado';
    pulsa = false;
  } else if (sim && !st.relogio.rodando) {
    tom = 'muted';
    texto = 'Pausado';
    pulsa = false;
  } else if (fase === 'encerrada') {
    tom = 'ok';
    pulsa = false;
  } else if (fase === 'pre') {
    tom = 'pending';
    texto = st.fonte === 'pre' ? 'Pré-eleição' : 'Antes das 17h';
    pulsa = sim;
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em]', className)}>
      <LiveDot tone={tom} pulse={pulsa} size={7} />
      <span className={cn(st.congelado ? 'text-alert-fg' : tom === 'ok' ? 'text-ok-fg' : tom === 'brand' ? 'text-brand-fg' : 'text-fg-muted')}>
        {texto}
      </span>
      {!compacto && sim && st.relogio.rodando && !st.congelado ? (
        <span className="num font-semibold tracking-[0.04em] text-fg-muted">· {fmtVel(st.relogio.velocidade)}</span>
      ) : null}
    </span>
  );
}

/** % de seções da corrida 'pres' + selo de eleito. */
export function ProgressoPres({ compacto, className }: { compacto?: boolean; className?: string }) {
  const { nacional, pres, snap } = useAdmin();
  const r = nacional?.resumo;
  const pct = r ? pctTotalizadas(r) : 0;
  const eleito = r && r.eleito !== null && pres ? pres.candidatos[r.eleito] : null;
  const preEleicao = snap.state.fonte === 'pre';
  if (compacto) {
    return (
      <span className={cn('num text-[12px] font-medium text-fg-muted', className)}>
        {preEleicao ? '1º turno no site' : `${fmtPct(pct, pct > 0 && pct < 100 ? 2 : 0)} das seções`}
      </span>
    );
  }
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Seções · Presidente</span>
        {eleito ? (
          <Badge size="xs" tone={eleito.cor === 'a' ? 'cand-a' : 'cand-b'} icon="selo" caps>
            {eleito.nomeUrna} eleito
          </Badge>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="num w-[68px] font-display text-[20px] font-semibold leading-none tracking-[-0.02em] text-fg">
          {preEleicao ? '—' : fmtPct(pct)}
        </span>
        <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-surface-3 xl:w-36" aria-hidden>
          <span
            className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out', eleito ? corSlot(eleito.cor).bg : 'bg-brand-grad')}
            style={{ width: `${preEleicao ? 0 : pct}%` }}
          />
        </span>
      </div>
    </div>
  );
}

/** Botões de transporte. `variante="barra"`: ícones compactos + botão principal. */
export function Transporte({ variante = 'barra', className }: { variante?: 'barra' | 'painel' | 'mini'; className?: string }) {
  const { pendente } = useAdmin();
  const a = useAcoesRelogio();
  const ocupado = pendente('relogio');
  const principal = a.sim ? (a.rodando ? 'Pausar' : 'Retomar') : 'Iniciar';
  const onPrincipal = a.sim ? a.alternar : a.iniciar;
  if (variante === 'mini') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <IconButton icon="reset" label="Reiniciar (volta a 16:59:30, pausado)" size="md" onClick={a.reiniciar} disabled={ocupado} />
        <button
          type="button"
          onClick={onPrincipal}
          disabled={ocupado}
          aria-label={a.sim ? (a.rodando ? 'Pausar relógio' : 'Retomar relógio') : 'Iniciar simulação'}
          className={cn(
            'inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-cta text-brand-ink shadow-[0_8px_24px_-10px_rgb(var(--brand)/0.8)]',
            'transition-transform active:scale-95 disabled:opacity-60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
        >
          <Icon name={a.rodando ? 'pause' : 'play'} size={22} />
        </button>
      </div>
    );
  }
  if (variante === 'painel') {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <Button variant="outline" icon="play" onClick={a.iniciar} disabled={ocupado}>
          Iniciar
        </Button>
        <Button variant="primary" icon={a.rodando ? 'pause' : 'play'} onClick={onPrincipal} loading={ocupado}>
          {principal}
        </Button>
        <Button variant="ghost" icon="reset" onClick={a.reiniciar} disabled={ocupado}>
          Reiniciar
        </Button>
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Button variant="ghost" onClick={a.iniciar} disabled={ocupado} title="Começa a noite do zero: 16:59:30, rodando">
        Iniciar
      </Button>
      <Button
        variant="primary"
        icon={a.sim && a.rodando ? 'pause' : 'play'}
        onClick={onPrincipal}
        loading={ocupado}
        className="w-[118px]"
        title={a.sim ? 'Espaço' : 'Inicia a simulação'}
      >
        {principal}
      </Button>
      <IconButton icon="reset" label="Reiniciar (volta a 16:59:30, pausado)" variant="ghost" size="md" onClick={a.reiniciar} disabled={ocupado} />
    </div>
  );
}

/** Seletor de velocidade: segmentado (desktop largo) ou select nativo (compacto). */
export function SeletorVelocidade({ variante = 'segmentado', className }: { variante?: 'segmentado' | 'select'; className?: string }) {
  const { snap, pendente } = useAdmin();
  const a = useAcoesRelogio();
  const atual = snap.state.relogio.velocidade;
  const valor = String(atual);
  const opcoes = useMemo(() => {
    const base = VELOCIDADES.map((v) => ({ value: String(v), label: fmtVel(v), ariaLabel: `${v} vezes` }));
    return (VELOCIDADES as readonly number[]).includes(atual) ? base : [...base, { value: valor, label: fmtVel(atual), ariaLabel: `${atual} vezes` }];
  }, [atual, valor]);
  const desab = snap.state.fonte !== 'simulacao' || pendente('velocidade');
  if (variante === 'select') {
    return (
      <Select
        aria-label="Velocidade da simulação"
        size="sm"
        options={opcoes}
        value={valor}
        disabled={desab}
        onChange={(e) => void a.velocidade(Number(e.target.value))}
        className="num w-[84px]"
        wrapperClassName={className}
      />
    );
  }
  return (
    <Segmented
      ariaLabel="Velocidade da simulação"
      size="sm"
      options={opcoes.map((o) => ({ ...o, disabled: snap.state.fonte !== 'simulacao' }))}
      value={valor}
      onChange={(v) => void a.velocidade(Number(v))}
      className={cn('num', className)}
    />
  );
}
