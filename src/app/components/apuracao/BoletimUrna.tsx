/**
 * Boletim de Urna — cartão estilo recibo de papel térmico (fonte mono), com cabeçalho
 * UF/município/zona/seção, aptos/comparecimento/abstenção, votos por candidato, brancos, nulos,
 * total, código de identificação e horário da totalização (ou "aguardando totalização").
 * É uma visualização do Sintonia — não imita documento oficial — e leva o carimbo SIMULAÇÃO
 * quando `secao.simulado`.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Race, SecaoDetalhe } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { validos } from '@/shared/calc';
import { fmtHoraSeg, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { SimulationRibbon } from './SimulationRibbon';

export interface BoletimUrnaProps {
  secao: SecaoDetalhe;
  race: Race;
  className?: string;
}

/** Recorte serrilhado (papel destacado) no topo e na base. */
const MASCARA =
  'radial-gradient(circle at 7px 0, transparent 5.5px, black 6px) top left / 14px 51% repeat-x, ' +
  'radial-gradient(circle at 7px 100%, transparent 5.5px, black 6px) bottom left / 14px 51% repeat-x';
const SERRILHA: CSSProperties = { WebkitMask: MASCARA, mask: MASCARA };

const muted = 'text-fg-muted dark:text-bg/60';
const rule = 'border-dashed border-fg/25 dark:border-bg/25';

function Linha({ rotulo, valor, forte, className }: { rotulo: ReactNode; valor: ReactNode; forte?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('shrink-0', forte ? 'font-semibold' : '')}>{rotulo}</span>
      <span aria-hidden className="min-w-[12px] flex-1 translate-y-[-3px] border-b border-dotted border-fg/25 dark:border-bg/30" />
      <span className={cn('num shrink-0 text-right', forte && 'font-semibold')}>{valor}</span>
    </div>
  );
}

export function BoletimUrna({ secao, race, className }: BoletimUrnaProps) {
  const tot = secao.totalizada;
  const val = validos(secao);
  const total = val + secao.brancos + secao.nulos;
  const v = (n: number) => (tot ? fmtInt(n) : '—');
  const titulo = `Boletim de Urna da seção ${secao.secao}, zona ${secao.zona}, ${secao.nomeMunicipio} (${secao.uf})`;
  return (
    <figure aria-label={titulo} className={cn('relative mx-auto w-full max-w-[400px]', className)}>
      {/* sombra do papel */}
      <div aria-hidden className="absolute inset-x-3 bottom-[-10px] top-3 rounded-[28px] bg-[rgb(0_0_0/0.35)] blur-2xl dark:bg-[rgb(0_0_0/0.6)]" />
      <div
        className={cn(
          'relative overflow-hidden bg-surface px-5 pb-8 pt-8 font-mono text-[12.5px] leading-[1.55] text-fg sm:px-7',
          'border-x border-line dark:border-transparent dark:bg-fg dark:text-bg',
        )}
        style={SERRILHA}
      >
        {/* textura de papel térmico */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-60" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-fg/[0.03] to-transparent dark:from-bg/[0.05]" />

        <header className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.22em]">
              <Icon name="urna" size={14} strokeWidth={2} />
              Boletim de Urna
            </div>
            <div className="text-[16px] font-semibold uppercase leading-tight tracking-[0.06em]">Eleições 2026</div>
            <div className={cn('whitespace-nowrap text-[11px] uppercase tracking-[0.06em]', muted)}>
              {race.turno}º turno · {race.turno === 2 ? '25/10/2026' : '04/10/2026'}
            </div>
            <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.1em]">{race.cargo}</div>
          </div>
          {secao.simulado ? <SimulationRibbon variant="stamp" className="mr-0.5 mt-3 shrink-0" /> : null}
        </header>

        <div className={cn('relative my-4 border-t', rule)} />

        <dl className="relative grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 uppercase">
          <dt className={muted}>UF</dt>
          <dd className="truncate text-right">
            {secao.uf} · {UF_NOMES[secao.uf]}
          </dd>
          <dt className={muted}>Município</dt>
          <dd className="truncate text-right">{secao.nomeMunicipio}</dd>
          <dt className={muted}>Zona</dt>
          <dd className="num text-right">{String(secao.zona).padStart(4, '0')}</dd>
          <dt className={muted}>Seção</dt>
          <dd className="num text-right text-[15px] font-semibold">{String(secao.secao).padStart(4, '0')}</dd>
        </dl>

        <div className={cn('relative my-4 border-t', rule)} />

        <div className="relative space-y-0.5 uppercase">
          <Linha rotulo="Eleitores aptos" valor={fmtInt(secao.aptos)} />
          <Linha rotulo="Comparecimento" valor={v(secao.comparecimento)} />
          <Linha rotulo="Abstenção" valor={v(secao.abstencao)} />
        </div>

        <div className={cn('relative my-4 border-t', rule)} />

        <div className="relative">
          <div className={cn('mb-1.5 flex justify-between text-[10.5px] uppercase tracking-[0.16em]', muted)}>
            <span>Candidato</span>
            <span>Votos</span>
          </div>
          <div className="space-y-1.5">
            {race.candidatos.map((c, i) => (
              <div key={c.numero} className="flex items-baseline gap-2">
                <span aria-hidden className={cn('mb-[1px] h-2.5 w-2.5 shrink-0 self-center rounded-[3px]', corSlot(c.cor).bg)} />
                <span className="num w-6 shrink-0 font-semibold">{c.agregado ? '··' : c.numero}</span>
                <span className="min-w-0 truncate uppercase">{c.nomeUrna}</span>
                <span aria-hidden className="min-w-[12px] flex-1 translate-y-[-3px] border-b border-dotted border-fg/25 dark:border-bg/30" />
                <span className="num shrink-0 text-[14px] font-semibold">{v(secao.votos[i] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cn('relative my-4 border-t', rule)} />

        <div className="relative space-y-0.5 uppercase">
          <Linha rotulo="Votos nominais" valor={v(val)} />
          <Linha rotulo="Brancos" valor={v(secao.brancos)} />
          <Linha rotulo="Nulos" valor={v(secao.nulos)} />
          <Linha rotulo="Total apurado" valor={v(total)} forte className="pt-1 text-[13.5px]" />
        </div>

        <div className={cn('relative my-4 border-t', rule)} />

        <div className="relative text-center">
          <div className={cn('text-[10.5px] uppercase tracking-[0.16em]', muted)}>Código de identificação</div>
          <div className="num mt-0.5 text-[13px] font-semibold tracking-[0.08em]">{secao.codigoIdentificacao}</div>
          <CodigoBarras codigo={secao.codigoIdentificacao} />
        </div>

        <div className={cn('relative mt-4 border-t pt-4 text-center', rule)}>
          {tot ? (
            <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]">
              <Icon name="check-circulo" size={15} strokeWidth={2} />
              <span>
                Totalizada às <span className="num">{secao.totalizadaEm ? fmtHoraSeg(secao.totalizadaEm) : '—'}</span>
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-current px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.08em]">
              <Icon name="relogio" size={15} strokeWidth={2} />
              Aguardando totalização
            </div>
          )}
          <div className={cn('mt-2 text-[10px] uppercase leading-snug tracking-[0.1em]', muted)}>
            Horário de Brasília · visualização Sintonia
            <br />
            {secao.simulado ? 'Dados fictícios de simulação' : 'Fonte: TSE · não é documento oficial'}
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Código de barras decorativo derivado do código de identificação (determinístico). */
function CodigoBarras({ codigo }: { codigo: string }) {
  const barras: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < codigo.length * 3 && x < 236; i++) {
    const c = codigo.charCodeAt(i % codigo.length) + i * 7;
    const w = 1 + (c % 3);
    const gap = 1 + ((c >> 2) % 3);
    barras.push({ x, w });
    x += w + gap;
  }
  return (
    <svg viewBox={`0 0 ${Math.max(x, 1)} 34`} preserveAspectRatio="none" className="mx-auto mt-2 h-9 w-[210px]" aria-hidden>
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="34" className="fill-fg dark:fill-bg" />
      ))}
    </svg>
  );
}
