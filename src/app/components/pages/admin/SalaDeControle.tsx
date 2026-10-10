/**
 * Layout da sala de controle (fora do AppShell público):
 *  - desktop (≥ lg): sidebar fixa (marca, seções, utilidades) + barra superior fixa com relógio, fase, fonte,
 *    % de seções, transporte e velocidade;
 *  - celular/tablet: cabeçalho compacto + abas roláveis e a barra de controle compacta fixa embaixo.
 * Atalhos: espaço (pausar/retomar), ←/→ (±1 min; Shift = 10 min), 1–6 (seções), ? (ajuda).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { LogoMark } from '@/app/components/layout/Logo';
import { Badge, buttonClasses, Dialog, Icon, IconButton, LiveDot, ThemeToggle, Toaster } from '@/app/ui';
import { useAdmin } from './dados';
import { Fundo } from './Login';
import { DialogoConfirmacao, Kbd, SepV } from './kit';
import { EstadoAoVivo, ProgressoPres, RelogioApuracao, SeletorVelocidade, Transporte, useAcoesRelogio } from './relogio';
import { FONTE_ICONE, FONTE_ROTULO, SECOES, urlPublica, type SecaoId } from './rotulos';
import { SecaoCenario } from './SecaoCenario';
import { SecaoComunicacao } from './SecaoComunicacao';
import { SecaoControle } from './SecaoControle';
import { SecaoEstados } from './SecaoEstados';
import { SecaoFonte } from './SecaoFonte';
import { SecaoMonitor } from './SecaoMonitor';
import { SecaoPatrocinio } from './SecaoPatrocinio';

export function SalaDeControle({ offline }: { offline: boolean }) {
  const { secao } = useAdmin();
  useAtalhos();
  const mainRef = useRef<HTMLElement>(null);
  // volta ao topo ao trocar de seção
  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [secao]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh bg-bg">
        <Fundo />
        <Sidebar />
        <div className="relative lg:pl-[72px] xl:pl-[248px]">
          <BarraSuperior />
          <CabecalhoMovel />
          {offline ? <FaixaOffline /> : null}
          <main
            ref={mainRef}
            id="conteudo"
            className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-14 lg:pt-8"
          >
            <ConteudoSecao secao={secao} />
          </main>
        </div>
        <BarraInferior />
        <Toaster />
      </div>
    </MotionConfig>
  );
}

function ConteudoSecao({ secao }: { secao: SecaoId }) {
  switch (secao) {
    case 'cenario':
      return <SecaoCenario />;
    case 'estados':
      return <SecaoEstados />;
    case 'comunicacao':
      return <SecaoComunicacao />;
    case 'patrocinio':
      return <SecaoPatrocinio />;
    case 'fonte':
      return <SecaoFonte />;
    case 'monitor':
      return <SecaoMonitor />;
    default:
      return <SecaoControle />;
  }
}

// ---- marca ---------------------------------------------------------------------------------------------

function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <LogoMark size={compacta ? 28 : 32} />
      <span className="min-w-0 leading-none">
        <span className="block font-display text-[16px] font-semibold tracking-[-0.02em] text-fg">Sintonia</span>
        <span className="mt-1 block truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Sala de controle</span>
      </span>
    </span>
  );
}

// ---- navegação -----------------------------------------------------------------------------------------

const FONTE_CURTA = { pre: 'Pré', simulacao: 'Simulação', tse: 'TSE' } as const;

function useDicas(): Record<SecaoId, ReactNode> {
  const { snap } = useAdmin();
  const st = snap.state;
  const ajustes = new Set([...Object.keys(st.cenario.ufVies), ...Object.keys(st.cenario.ufAtraso)]).size;
  return {
    controle:
      st.fonte === 'simulacao' ? (
        <LiveDot tone={st.congelado ? 'live' : st.relogio.rodando ? 'brand' : 'muted'} pulse={st.relogio.rodando && !st.congelado} size={7} />
      ) : null,
    cenario: st.cenario.preset === 'padrao' ? null : <span className="h-1.5 w-1.5 rounded-full bg-brand-2" aria-label="cenário alterado" />,
    estados: ajustes ? (
      <Badge size="xs" tone="brand">
        <span className="num">{ajustes}</span>
      </Badge>
    ) : null,
    comunicacao:
      st.aviso || st.congelado ? (
        <Badge size="xs" tone={st.congelado || st.aviso?.nivel === 'alerta' ? 'alert' : 'brand'} caps>
          {st.congelado ? 'gelo' : 'no ar'}
        </Badge>
      ) : null,
    patrocinio: st.patrocinio ? (
      <Badge size="xs" tone="brand" caps>
        no ar
      </Badge>
    ) : null,
    fonte:
      st.fonte === 'simulacao' && st.nomesReais ? (
        <Badge size="xs" tone="alert" caps>
          nomes
        </Badge>
      ) : (
        <span className="text-[11.5px] text-fg-subtle">{FONTE_CURTA[st.fonte]}</span>
      ),
    monitor: <span className="num text-[11px] text-fg-subtle">v{st.versao}</span>,
  };
}

/** Ponto de atenção da seção no trilho de ícones (sidebar recolhida, 1024–1279 px). */
function useAtencao(): Record<SecaoId, 'brand' | 'alert' | null> {
  const { snap } = useAdmin();
  const st = snap.state;
  const ajustes = Object.keys(st.cenario.ufVies).length + Object.keys(st.cenario.ufAtraso).length;
  return {
    controle: st.congelado ? 'alert' : null,
    cenario: st.cenario.preset === 'padrao' ? null : 'brand',
    estados: ajustes ? 'brand' : null,
    comunicacao: st.congelado || st.aviso?.nivel === 'alerta' ? 'alert' : st.aviso ? 'brand' : null,
    patrocinio: st.patrocinio ? 'brand' : null,
    fonte: st.fonte === 'simulacao' && st.nomesReais ? 'alert' : null,
    monitor: null,
  };
}

/**
 * Navegação lateral. ≥ 1280 px: completa (marca, rótulos, dicas). 1024–1279 px: trilho de ícones (72 px), para a
 * barra superior caber inteira. Abaixo de 1024 px some (abas no topo + barra inferior).
 */
function Sidebar() {
  const { secao, irPara, sair, abrirAtalhos } = useAdmin();
  const dicas = useDicas();
  const atencao = useAtencao();
  const util =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-line bg-surface/70 backdrop-blur-xl lg:flex xl:w-[248px]">
      <div className="flex h-[72px] shrink-0 items-center justify-center border-b border-line xl:justify-start xl:px-5">
        <span className="xl:hidden" title="Sintonia · Sala de controle">
          <LogoMark size={32} />
        </span>
        <span className="hidden xl:inline-flex">
          <Marca />
        </span>
      </div>
      <nav aria-label="Seções do painel" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1 xl:space-y-0.5">
          {SECOES.map((s, i) => {
            const ativo = s.id === secao;
            const at = atencao[s.id];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => irPara(s.id)}
                  aria-current={ativo ? 'page' : undefined}
                  aria-label={s.rotulo}
                  title={`${s.rotulo}: ${s.descricao} (atalho: ${i + 1})`}
                  className={cn(
                    'group relative flex h-11 w-full items-center justify-center gap-3 rounded-xl text-left text-[14px] font-medium transition-colors xl:justify-start xl:px-3',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    ativo ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {ativo ? <span aria-hidden className="absolute -left-3 top-2.5 h-6 w-[3px] rounded-r-full bg-brand-grad" /> : null}
                  <Icon name={s.icone} size={18} className={cn('shrink-0', ativo ? 'text-brand-fg' : 'text-fg-subtle group-hover:text-fg-muted')} />
                  <span className="hidden min-w-0 flex-1 truncate xl:block">{s.rotulo}</span>
                  <span className="hidden shrink-0 items-center xl:flex">{dicas[s.id]}</span>
                  {at ? (
                    <span
                      aria-hidden
                      className={cn('absolute right-2.5 top-2.5 h-2 w-2 rounded-full ring-2 ring-surface xl:hidden', at === 'alert' ? 'bg-alert' : 'bg-brand-2')}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-line p-3 xl:items-stretch xl:gap-3 xl:p-4">
        <a
          href={urlPublica('/')}
          target="_blank"
          rel="noopener"
          aria-label="Ver site (nova aba)"
          title="Ver site (nova aba)"
          className={cn(buttonClasses({ variant: 'outline', size: 'md' }), 'w-10 px-0 xl:w-full xl:px-4')}
        >
          <Icon name="externo" size={17} />
          <span className="hidden xl:inline">Ver site</span>
        </a>
        <div className="flex flex-col items-center gap-1 xl:flex-row">
          <ThemeToggle size="sm" />
          <button type="button" onClick={abrirAtalhos} className={cn(util, 'w-9 xl:w-auto xl:px-2')} aria-label="Atalhos de teclado" title="Atalhos de teclado (?)">
            <Kbd className="h-5 min-w-5 px-1 text-[10.5px]">?</Kbd>
            <span className="hidden xl:inline">Atalhos</span>
          </button>
          <button type="button" onClick={sair} className={cn(util, 'w-9 xl:ml-auto xl:w-auto xl:px-2.5')} aria-label="Sair" title="Sair">
            <span className="hidden xl:inline">Sair</span>
            <Icon name="seta" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ---- barra superior (desktop) --------------------------------------------------------------------------

function BarraSuperior() {
  const { snap, irPara, anon } = useAdmin();
  const fonte = snap.state.fonte;
  return (
    <header className="glass sticky top-0 z-30 hidden h-[72px] border-b border-line lg:block">
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-4 px-8 xl:gap-5">
        <div className="flex min-w-[164px] flex-col items-start">
          <EstadoAoVivo />
          <RelogioApuracao tamanho="lg" className="mt-1.5" />
        </div>
        <SepV />
        <button
          type="button"
          onClick={() => irPara('fonte')}
          className="-mx-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title="Fonte de dados"
        >
          <span className="block text-[11px] font-semibold uppercase leading-none tracking-[0.1em] text-fg-muted">Fonte</span>
          <span className={cn('mt-2 flex items-center gap-1.5 text-[14px] font-semibold leading-none', fonte === 'simulacao' ? 'text-brand-fg' : 'text-fg')}>
            <Icon name={FONTE_ICONE[fonte]} size={15} />
            {FONTE_ROTULO[fonte]}
            {fonte === 'simulacao' ? (
              anon ? (
                <Icon name="olho-fechado" size={14} className="ml-0.5 text-fg-subtle" title="Nomes ocultos na simulação (Candidato A/B)" />
              ) : (
                <Badge tone="alert" size="xs" caps className="ml-1">
                  Nomes reais
                </Badge>
              )
            ) : null}
          </span>
        </button>
        <SepV />
        <ProgressoPres />
        <div className="ml-auto flex items-center gap-3">
          <Transporte />
          <SeletorVelocidade variante="select" />
        </div>
      </div>
    </header>
  );
}

// ---- cabeçalho + abas (celular/tablet) -------------------------------------------------------------------

function CabecalhoMovel() {
  const { secao, irPara, sair, abrirAtalhos, snap } = useAdmin();
  const listaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [secao]);
  return (
    <div className="glass sticky top-0 z-30 border-b border-line lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <Marca compacta />
        <Badge tone={snap.state.fonte === 'simulacao' ? 'brand' : 'neutral'} size="xs" className="ml-1 hidden min-[400px]:inline-flex">
          {FONTE_ROTULO[snap.state.fonte]}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <a
            href={urlPublica('/')}
            target="_blank"
            rel="noopener"
            aria-label="Ver site (nova aba)"
            title="Ver site"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <Icon name="externo" size={17} />
          </a>
          <ThemeToggle size="sm" />
          <IconButton icon="info" label="Atalhos de teclado" size="sm" onClick={abrirAtalhos} className="hidden md:inline-flex" />
          <button type="button" onClick={sair} className="inline-flex h-8 items-center rounded-[10px] px-2.5 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
            Sair
          </button>
        </div>
      </div>
      <div
        ref={listaRef}
        role="tablist"
        aria-label="Seções do painel"
        className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none sm:px-5 [mask-image:linear-gradient(90deg,transparent,black_12px,black_calc(100%-20px),transparent)]"
      >
        {SECOES.map((s) => {
          const ativo = s.id === secao;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              aria-controls="conteudo"
              onClick={() => irPara(s.id)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                ativo ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon name={s.icone} size={15} />
              {s.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- barra inferior (celular/tablet) ---------------------------------------------------------------------

function BarraInferior() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/[0.94] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="mx-auto flex h-[72px] max-w-3xl items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <EstadoAoVivo compacto />
          <div className="mt-1 flex min-w-0 items-baseline gap-2">
            <RelogioApuracao tamanho="md" />
            <ProgressoPres compacto className="min-w-0 truncate" />
          </div>
        </div>
        <SeletorVelocidade variante="select" />
        <Transporte variante="mini" />
      </div>
    </div>
  );
}

// ---- faixa offline -----------------------------------------------------------------------------------------

function FaixaOffline() {
  return (
    <div role="alert" className="sticky top-[101px] z-20 border-b border-alert/30 bg-alert/10 px-4 py-2.5 text-[13px] text-fg backdrop-blur lg:top-[72px]">
      <div className="mx-auto flex max-w-[1280px] items-center gap-2.5 sm:px-2 lg:px-4">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-alert" />
        <span className="font-semibold">Sem conexão com o servidor.</span>
        <span className="truncate text-fg-muted">Mostrando o último estado conhecido; tentando de novo a cada segundo.</span>
      </div>
    </div>
  );
}

// ---- atalhos -----------------------------------------------------------------------------------------------

function alvoInterativo(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return !!t.closest('input, textarea, select, [role="slider"], [role="radiogroup"], [role="tablist"], [role="switch"], summary');
}

function useAtalhos() {
  const { irPara, abrirAtalhos } = useAdmin();
  const a = useAcoesRelogio();
  const ref = useRef(a);
  ref.current = a;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const interativo = alvoInterativo(e.target);
      if (e.key === '?' && !interativo) {
        e.preventDefault();
        abrirAtalhos();
        return;
      }
      if (interativo) return;
      if (e.key === ' ' || e.code === 'Space') {
        // espaço num botão focado é "clicar": deixa o navegador agir
        if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
        e.preventDefault();
        if (ref.current.sim) void ref.current.alternar();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (!ref.current.sim) return;
        e.preventDefault();
        const ms = (e.shiftKey ? 10 : 1) * 60_000 * (e.key === 'ArrowRight' ? 1 : -1);
        void ref.current.avancar(ms);
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= SECOES.length) {
        irPara(SECOES[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [irPara, abrirAtalhos]);
}

export function DialogoAtalhos({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const linhas: { teclas: ReactNode; acao: string }[] = [
    { teclas: <Kbd>Espaço</Kbd>, acao: 'Pausar ou retomar o relógio' },
    {
      teclas: (
        <>
          <Kbd>→</Kbd>
          <Kbd>←</Kbd>
        </>
      ),
      acao: 'Avançar ou voltar 1 minuto simulado',
    },
    {
      teclas: (
        <>
          <Kbd>Shift</Kbd>
          <span className="text-fg-subtle">+</span>
          <Kbd>→</Kbd>
        </>
      ),
      acao: 'Avançar ou voltar 10 minutos',
    },
    {
      teclas: (
        <>
          <Kbd>1</Kbd>
          <span className="text-fg-subtle">…</span>
          <Kbd>7</Kbd>
        </>
      ),
      acao: 'Ir para a seção (Controle … Monitor)',
    },
    { teclas: <Kbd>?</Kbd>, acao: 'Mostrar esta ajuda' },
    { teclas: <Kbd>Esc</Kbd>, acao: 'Fechar diálogos' },
  ];
  return (
    <Dialog open={aberto} onClose={onFechar} title="Atalhos de teclado" description="Funcionam fora de campos de texto." size="sm">
      <ul className="divide-y divide-[rgb(var(--line)/var(--line-alpha))]">
        {linhas.map((l) => (
          <li key={l.acao} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-[13.5px] text-fg-muted">{l.acao}</span>
            <span className="flex shrink-0 items-center gap-1">{l.teclas}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] leading-snug text-fg-subtle">Na linha do tempo focada, as setas movem o cursor; Home e End vão ao início e ao fim.</p>
    </Dialog>
  );
}

/** Estado do diálogo de confirmação, exposto como uma Promise<boolean>. */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<{ o: import('./dados').ConfirmOpts; resolve: (ok: boolean) => void } | null>(null);
  const confirmar = useCallback(
    (o: import('./dados').ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setPedido({ o, resolve });
      }),
    [],
  );
  const responder = useCallback(
    (ok: boolean) => {
      pedido?.resolve(ok);
      setPedido(null);
    },
    [pedido],
  );
  const ultimo = useRef(pedido?.o);
  if (pedido) ultimo.current = pedido.o;
  const elemento = useMemo(
    () => (
      <DialogoConfirmacao
        aberto={!!pedido}
        titulo={ultimo.current?.titulo ?? ''}
        descricao={ultimo.current?.descricao}
        corpo={ultimo.current?.corpo}
        confirmar={ultimo.current?.confirmar}
        perigo={ultimo.current?.perigo}
        onResposta={responder}
      />
    ),
    [pedido, responder],
  );
  return { confirmar, elemento };
}
