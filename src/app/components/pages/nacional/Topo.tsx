/**
 * Topo compacto das páginas Nacional e Governadores: sobrancelha, título com contexto, selo de estado
 * da apuração e, à direita (abaixo no celular), seletor de disputa + compartilhar.
 * Mais baixo que o PageHeader padrão para que placar e mapa fiquem acima da dobra no desktop.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LiveStatus, Summary } from '@/shared/types';
import { fmtHora } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { NomesOcultos } from '@/app/components/apuracao/NomesOcultos';
import { Badge } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { buttonClasses } from '@/app/ui/Button';

export interface TopoProps {
  eyebrow: ReactNode;
  titulo: ReactNode;
  /** Complemento do título, em tom secundário (ex.: "2º turno"). */
  contexto?: ReactNode;
  /** Linha de selos sob o título (estado da apuração, fonte). */
  selos?: ReactNode;
  /** Seletor de disputa. */
  seletor?: ReactNode;
  /** Ações (compartilhar). */
  acoes?: ReactNode;
  className?: string;
}

export function Topo({ eyebrow, titulo, contexto, selos, seletor, acoes, className }: TopoProps) {
  return (
    <header className={cn('pb-4 pt-5 sm:pb-6 sm:pt-7', className)}>
      <div className="flex items-start justify-between gap-4 lg:items-end lg:gap-8">
        <div className="min-w-0">
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            {/* celular: o contexto ("2º turno") sobe para a sobrancelha e o título fica numa linha só */}
            {contexto ? <span className="sm:hidden">{contexto} · </span> : null}
            {eyebrow}
          </div>
          <h1 className="text-balance font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[42px]">
            {titulo}
            {contexto ? <span className="hidden text-fg-muted sm:inline"> · {contexto}</span> : null}
          </h1>
        </div>
        {seletor || acoes ? (
          <div className="flex shrink-0 items-center gap-2.5">
            {seletor ? <div className="hidden lg:block">{seletor}</div> : null}
            {acoes}
          </div>
        ) : null}
      </div>
      {seletor || selos ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2.5 lg:mt-3">
          {seletor ? <div className="min-w-0 lg:hidden">{seletor}</div> : null}
          {selos}
        </div>
      ) : null}
    </header>
  );
}

/** Selo com o estado da apuração (complementa a pílula do cabeçalho do app, sem repetir o relógio). */
export function SeloFase({
  status,
  resumo,
  t1,
  revendo,
}: {
  status: LiveStatus | undefined;
  resumo?: Pick<Summary, 'status' | 'ultimaAtualizacao'>;
  t1?: boolean;
  /** "Reveja a noite": instante exibido (os números não atualizam sozinhos). */
  revendo?: number;
}) {
  if (revendo !== undefined && !t1) {
    return (
      <Badge tone="brand" size="sm" icon="relogio">
        Revendo a apuração às <span className="num">{fmtHora(revendo)}</span>
      </Badge>
    );
  }
  if (t1) {
    return (
      <>
        <Badge tone="neutral" size="sm" icon="check-circulo">
          Resultado oficial · TSE
        </Badge>
        <span className="text-[12.5px] text-fg-muted">Votação de 4 de outubro, 100% das seções</span>
      </>
    );
  }
  if (!status) return null;
  if (status.fase === 'encerrada' || resumo?.status === 'encerrada') {
    return (
      <Badge tone="ok" size="sm" icon="check-circulo">
        Apuração encerrada
        {resumo?.ultimaAtualizacao ? <span className="num font-medium opacity-80"> · {fmtHora(resumo.ultimaAtualizacao)}</span> : null}
      </Badge>
    );
  }
  if (status.congelado) {
    return (
      <Badge tone="alert" size="sm" icon="alerta">
        Sem novas atualizações desde <span className="num">{fmtHora(status.simNow)}</span>
      </Badge>
    );
  }
  if (status.pausado) {
    return (
      <Badge tone="pending" size="sm" icon="pause">
        {status.simulacao ? 'Simulação pausada' : 'Atualizações pausadas'}
      </Badge>
    );
  }
  if (status.fase === 'apurando') {
    return (
      <span className="inline-flex h-6 items-center gap-2 rounded-lg bg-surface-3 px-2 text-xs font-semibold text-fg-muted">
        <LiveDot tone={status.simulacao ? 'brand' : 'live'} size={7} />
        Atualiza sozinho a cada poucos segundos
      </span>
    );
  }
  return (
    <Badge tone="neutral" size="sm" icon="relogio">
      Divulgação a partir das 17h (Brasília)
    </Badge>
  );
}

/** Aviso discreto de anonimização (componente do kit; mantido o nome local por compatibilidade). */
export function SeloAnonimo({ className }: { className?: string }) {
  return <NomesOcultos className={className} />;
}

/** Rótulo pequeno de seção usado dentro de cartões. */
export function Rotulo({ icon, children, className }: { icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted', className)}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </div>
  );
}

/** Ícone de TV (traço, `currentColor`) — o kit de ícones não tem um. */
export function IconeTv({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="2.75" y="4.75" width="18.5" height="12.5" rx="2.25" />
      <path d="M8 20.25h8M12 17.25v3" />
    </svg>
  );
}

/** Link para o Modo TV (/tv), no topo da página nacional. `compacto` = só o ícone (celular). */
export function LinkModoTv({ compacto, raceQs = '', className }: { compacto?: boolean; raceQs?: string; className?: string }) {
  if (compacto) {
    return (
      <Link
        to={`/tv${raceQs}`}
        aria-label="Modo TV (tela cheia para transmissão)"
        title="Modo TV"
        className={cn(
          'hidden h-9 w-9 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:inline-flex',
          className,
        )}
      >
        <IconeTv />
      </Link>
    );
  }
  return (
    <Link to={`/tv${raceQs}`} title="Tela cheia para transmissão, telões e bares" className={cn(buttonClasses({ variant: 'ghost', size: 'md' }), 'gap-2', className)}>
      <IconeTv />
      Modo TV
    </Link>
  );
}
