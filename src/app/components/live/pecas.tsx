/**
 * Peças comuns dos layouts do modo streamer (/live). Todas as medidas derivam de `--u` (≈ 1% da altura da tela da
 * live: 10,8 px em 1920×1080, 7,2 px em 1280×720) — o mesmo desenho nas duas resoluções. Cores só por tokens; a cor de
 * cada candidato vem dos dados (`corSlot(c.cor)`), nunca da posição.
 */
import { useMemo, type ReactNode } from 'react';
import type { Candidate, Race, Summary, UF } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtHoraSeg, fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { partesTempo } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { LogoMark } from '@/app/components/layout/Logo';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { segmentos } from '@/app/components/apuracao/VoteSplitBar';
import { gerarQr, qrPath } from '@/app/components/apuracao/qr';
import { textoPessoas } from '@/app/components/apuracao/PessoasAgora';

/** Tudo o que um layout precisa para desenhar (montado por `useQuadroLive`; nos testes, à mão). */
export interface QuadroLive {
  /** corrida exibida (já anônima quando `status.anonimizado`) */
  race: Race;
  resumo: Summary;
  /** resumo por UF (layout mapa) */
  ufs?: Partial<Record<UF, Summary>>;
  /** estado fixo (I25, Presidente numa UF): `resumo` é o da UF, sem "eleito" */
  uf?: UF | null;
  /** fase pública 'pre': mostra o 1º turno oficial e a contagem regressiva */
  pre: boolean;
  /** a corrida exibida é o 1º turno oficial */
  t1: boolean;
  /** números simulados (faixa "Simulação · dados fictícios"; nunca foto) */
  simulado: boolean;
  /** apurando agora, sem pausa nem congelamento */
  aoVivo: boolean;
  /** fotos oficiais alinhadas com `race.candidatos` (vazio = monograma; regras em useFotosRace) */
  fotos: readonly (string | undefined)[];
  /** ms até o início da apuração (fase pre) */
  faltaMs: number | null;
  /** instante do último dado (última seção totalizada nesta abrangência) */
  atualizadoEm: number | null;
  /** domínio exibido ("sintonia2026.com.br") */
  dominio: string;
  /** endereço do QR Code */
  urlQr: string;
  /** "N pessoas agora" do status (só vem do servidor, ≥ 500 e com a chave do painel ligada); null = não mostra */
  pessoasAgora?: number | null;
}

export const finalistas = (race: Race) => race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);

/**
 * Rótulo da disputa: "Presidente · 2º turno", "Governador · DF · 1º turno" (curto: "Gov. DF · 1º turno"); com estado
 * fixo, "Presidente · PE · 2º turno" (curto: "Pres. · PE · 2º turno", do tamanho do rótulo sem estado).
 */
export function rotuloDisputa(q: Pick<QuadroLive, 'race' | 't1' | 'uf'>, curto = false): string {
  const uf = q.race.abrangencia === 'BR' ? '' : q.race.abrangencia;
  const pres = q.uf ? `${curto ? 'Pres.' : 'Presidente'} · ${q.uf}` : 'Presidente';
  const cargo = q.race.cargo === 'Presidente' ? pres : curto ? `Gov. ${uf}` : `Governador · ${uf}`;
  return `${cargo.trim()} · ${q.t1 ? '1º turno' : '2º turno'}`;
}

/** Eleito (2º turno), quando definido. */
export function eleitoDe(q: Pick<QuadroLive, 'race' | 'resumo'>): Candidate | null {
  return q.race.turno === 2 && q.resumo.eleito !== null ? (q.race.candidatos[q.resumo.eleito] ?? null) : null;
}

/** Painel opaco (legível sobre qualquer cena do OBS). */
export const PAINEL = 'rounded-[calc(var(--u)*2)] border border-line bg-surface shadow-card';

// ---------------------------------------------------------------------------------------------
// Marca do Sintonia (o endereço é o que traz o público das lives: sempre visível)
// ---------------------------------------------------------------------------------------------

export function MarcaLive({
  dominio,
  subtitulo,
  tamanho = 'md',
  className,
}: {
  dominio: string;
  subtitulo?: ReactNode;
  tamanho?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const logo = { sm: 'h-[calc(var(--u)*3.4)] w-[calc(var(--u)*3.4)]', md: 'h-[calc(var(--u)*4.8)] w-[calc(var(--u)*4.8)]', lg: 'h-[calc(var(--u)*5.6)] w-[calc(var(--u)*5.6)]' }[tamanho];
  const dom = { sm: 'text-[length:calc(var(--u)*2)]', md: 'text-[length:calc(var(--u)*2.5)]', lg: 'text-[length:calc(var(--u)*3)]' }[tamanho];
  return (
    <div className={cn('flex min-w-0 items-center gap-[calc(var(--u)*1.2)]', className)}>
      <LogoMark size={48} className={logo} />
      <div className="min-w-0">
        {subtitulo ? (
          <div className="truncate pt-[0.15em] text-[length:calc(var(--u)*1.35)] font-semibold uppercase leading-[1.15] tracking-[0.14em] text-fg-muted">{subtitulo}</div>
        ) : null}
        <div className={cn('whitespace-nowrap font-display font-semibold leading-none tracking-[-0.02em] text-fg', dom, subtitulo && 'mt-[calc(var(--u)*0.35)]')}>{dominio}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Selo do estado da apuração
// ---------------------------------------------------------------------------------------------

export function SeloLive({ q, className }: { q: Pick<QuadroLive, 't1' | 'simulado' | 'aoVivo' | 'resumo' | 'pre'>; className?: string }) {
  const encerrada = !q.t1 && q.resumo.status === 'encerrada';
  const texto = q.t1 ? 'Oficial' : q.simulado ? 'Simulação' : encerrada ? 'Encerrada' : q.aoVivo ? 'Ao vivo' : 'Apuração';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-[calc(var(--u)*0.6)] whitespace-nowrap rounded-full border px-[calc(var(--u)*1.1)] py-[calc(var(--u)*0.45)] text-[length:calc(var(--u)*1.35)] font-bold uppercase leading-none tracking-[0.14em]',
        q.simulado ? 'border-brand/40 bg-brand/15 text-brand-fg' : 'border-line bg-surface-2 text-fg',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-[calc(var(--u)*0.8)] w-[calc(var(--u)*0.8)] rounded-full',
          q.simulado ? 'bg-brand-2' : q.aoVivo && !q.t1 ? 'bg-brand motion-safe:animate-pulse-dot' : 'bg-fg-subtle',
        )}
      />
      {texto}
    </span>
  );
}

/** "10d 02:13:45" / "02:13:45" */
export function textoContagem(ms: number): string {
  const p = partesTempo(Math.max(0, ms));
  const hms = `${String(p.horas).padStart(2, '0')}:${String(p.min).padStart(2, '0')}:${String(p.seg).padStart(2, '0')}`;
  return p.dias > 0 ? `${p.dias}d ${hms}` : hms;
}

/**
 * Bloco de tempo: na fase pre, a contagem regressiva para as 17h; depois, o horário do último dado (Brasília).
 * `alinhar` = lado do texto.
 */
export function TempoLive({
  q,
  tamanho = 'md',
  alinhar = 'right',
  className,
}: {
  q: Pick<QuadroLive, 'pre' | 'faltaMs' | 'atualizadoEm' | 't1'>;
  tamanho?: 'sm' | 'md';
  alinhar?: 'left' | 'right';
  className?: string;
}) {
  const rot = 'text-[length:calc(var(--u)*1.25)] font-semibold uppercase leading-none tracking-[0.14em] text-fg-muted';
  const val = cn('num whitespace-nowrap font-display font-semibold leading-none tracking-[-0.02em] text-fg', tamanho === 'sm' ? 'text-[length:calc(var(--u)*2.2)]' : 'text-[length:calc(var(--u)*3.4)]');
  let rotulo: string;
  let valor: string;
  const curto = tamanho === 'sm';
  if (q.pre) {
    if (q.faltaMs !== null && q.faltaMs > 0) {
      rotulo = curto ? 'Apuração em' : 'Apuração do 2º turno em';
      valor = textoContagem(q.faltaMs);
    } else {
      rotulo = curto ? '2º turno' : 'Apuração do 2º turno';
      valor = 'Aguardando o TSE';
    }
  } else if (q.atualizadoEm) {
    rotulo = curto ? 'Último dado' : 'Último dado · Brasília';
    valor = fmtHoraSeg(q.atualizadoEm);
  } else {
    rotulo = curto ? '2º turno' : 'Apuração do 2º turno';
    valor = 'Aguardando dados';
  }
  return (
    <div className={cn('min-w-0', alinhar === 'right' ? 'text-right' : 'text-left', className)}>
      <div className={rot}>{rotulo}</div>
      <div className={cn(val, 'mt-[calc(var(--u)*0.5)]')}>{valor}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------------------------

/** Percentual que rola quando muda (NumberRoll), na cor do candidato (vinda dos dados). */
export function PctLive({ resumo, i, cor, className }: { resumo: Summary; i: number; cor: Candidate['cor']; className?: string }) {
  const tem = validos(resumo) > 0;
  return (
    <NumberRoll
      value={pctValidos(resumo, i)}
      format={(n) => fmtPct(n)}
      smallChars="%"
      smallClassName="text-[0.45em] ml-[0.04em]"
      duration={900}
      className={cn('font-display font-semibold leading-none tracking-[-0.04em]', tem ? corSlot(cor).textDisplay : 'text-fg-subtle', className)}
    />
  );
}

/** % das seções totalizadas (rola quando muda). */
export function ApuradoLive({ resumo, className }: { resumo: Summary; className?: string }) {
  return <NumberRoll value={pctTotalizadas(resumo)} format={(n) => fmtPct(n)} smallChars="%" smallClassName="text-[0.55em] ml-[0.04em]" className={className} />;
}

/** Votos (rola quando muda). */
export function VotosLive({ resumo, i, className }: { resumo: Summary; i: number; className?: string }) {
  return (
    <span className={cn('num whitespace-nowrap text-fg-muted', className)}>
      <NumberRoll value={resumo.votos[i] ?? 0} className="font-semibold text-fg" /> votos
    </span>
  );
}

/** Diferença neutra entre os dois (sem dizer quem) — ou, no 1º turno, o total dos demais candidatos. */
export function DiferencaLive({ q, alinhar = 'right', className }: { q: Pick<QuadroLive, 'race' | 'resumo'>; alinhar?: 'left' | 'right'; className?: string }) {
  const iOutros = q.race.candidatos.findIndex((c) => c.agregado);
  const m = margem(q.resumo);
  const rot = 'text-[length:calc(var(--u)*1.25)] font-semibold uppercase leading-none tracking-[0.14em] text-fg-muted';
  const val = 'num whitespace-nowrap font-display text-[length:calc(var(--u)*2.8)] font-semibold leading-none tracking-[-0.02em] text-fg';
  if (iOutros >= 0) {
    return (
      <div className={cn(alinhar === 'right' ? 'text-right' : 'text-left', className)}>
        <div className={rot}>Demais candidatos</div>
        <div className={cn(val, 'mt-[calc(var(--u)*0.5)]')}>{fmtPct(pctValidos(q.resumo, iOutros))}</div>
      </div>
    );
  }
  if (m.lider === null) return null;
  return (
    <div className={cn(alinhar === 'right' ? 'text-right' : 'text-left', className)}>
      <div className={rot}>Diferença</div>
      <div className={cn(val, 'mt-[calc(var(--u)*0.5)]')}>
        {fmtInt(m.votos)} <span className="text-[0.6em] font-medium text-fg-muted">votos · {fmtPP(m.pp).replace('+', '')}</span>
      </div>
    </div>
  );
}

/**
 * Barra dividida (votos válidos) com o marcador de 50%. Só `transform` anima (GPU): a largura de cada lado acompanha
 * os números sem refazer o layout. Sem votos: trilho neutro (`pending`).
 */
export function BarraDividida({ race, resumo, className }: { race: Race; resumo: Summary; className?: string }) {
  const pcts = race.candidatos.map((_, i) => pctValidos(resumo, i));
  const tem = validos(resumo) > 0;
  // 1º turno: "Outros" no meio, para os finalistas tocarem as pontas
  const idx = race.candidatos.map((_, i) => i);
  const outros = idx.filter((i) => race.candidatos[i].agregado);
  const fin = idx.filter((i) => !race.candidatos[i].agregado);
  const ordem = fin.length >= 2 ? [fin[0], ...outros, ...fin.slice(1)] : idx;
  return (
    <div aria-hidden className={cn('relative', className)}>
      <div className="relative h-full w-full overflow-hidden rounded-full bg-surface-3">
        {tem ? (
          segmentos(ordem, pcts).map(({ i, transform, largura }) => (
            <div
              key={i}
              className={cn('absolute inset-y-0 left-0 origin-left transition-transform duration-700 ease-[cubic-bezier(.22,.9,.24,1)]', corSlot(race.candidatos[i].cor).bg)}
              style={{ width: largura, transform }}
            />
          ))
        ) : (
          <div className="h-full w-full bg-pending" />
        )}
      </div>
      <div className="pointer-events-none absolute inset-y-[-25%] left-1/2 w-[calc(var(--u)*0.3)] -translate-x-1/2 rounded-full bg-fg" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Candidato
// ---------------------------------------------------------------------------------------------

/** Avatar (foto oficial ou monograma) no tamanho em `--u`. */
export function AvatarLive({ c, foto, eleito, className }: { c: Candidate; foto?: string; eleito?: boolean; className?: string }) {
  return <CandidateAvatar candidato={c} foto={foto} size="xl" eleito={eleito} className={className} />;
}

/** Selo "Eleito" / "Matematicamente eleito" (texto neutro, cor do próprio candidato). */
export function SeloEleito({ c, encerrada, className }: { c: Candidate; encerrada: boolean; className?: string }) {
  const s = corSlot(c.cor);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[calc(var(--u)*0.5)] whitespace-nowrap rounded-full px-[calc(var(--u)*1.1)] py-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*1.35)] font-bold uppercase leading-none tracking-[0.1em]',
        s.bgSoft,
        s.text,
        className,
      )}
    >
      <Icon name="check-circulo" size={18} className="h-[1.2em] w-[1.2em]" />
      {encerrada ? 'Eleito' : 'Matematicamente eleito'}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Outros
// ---------------------------------------------------------------------------------------------

/** QR Code do site (sempre escuro sobre claro: as câmeras leem melhor), só tokens. */
export function QrLive({ url, className }: { url: string; className?: string }) {
  const qr = useMemo(() => {
    try {
      return gerarQr(url, 'M');
    } catch {
      return null;
    }
  }, [url]);
  if (!qr) return null;
  return (
    <svg viewBox={`0 0 ${qr.tamanho + 4} ${qr.tamanho + 4}`} className={cn('shrink-0 rounded-[calc(var(--u)*0.6)]', className)} role="img" aria-label={`QR Code para ${url}`} shapeRendering="crispEdges">
      <rect width={qr.tamanho + 4} height={qr.tamanho + 4} className="fill-surface dark:fill-fg" />
      <path d={qrPath(qr, 2)} className="fill-fg dark:fill-bg" />
    </svg>
  );
}

/**
 * "N pessoas no site agora · estimativa" (I09): discreto, só com o número que o servidor manda (≥ 500 e a chave
 * 'contador-publico' ligada; nunca no demo) e `?pessoas=1` (padrão). É a audiência do SITE, não da live.
 */
export function PessoasLive({ n, className }: { n: number | null | undefined; className?: string }) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return (
    <span
      className={cn('num inline-flex items-center gap-[calc(var(--u)*0.6)] whitespace-nowrap text-[length:calc(var(--u)*1.35)] font-semibold leading-none text-fg-muted', className)}
      title="Pessoas no Sintonia agora (estimativa)"
    >
      <span aria-hidden className="h-[calc(var(--u)*0.7)] w-[calc(var(--u)*0.7)] shrink-0 rounded-full bg-brand-2" />
      {textoPessoas(Math.round(n))} no site agora
      <span className="font-medium text-fg-subtle">· estimativa</span>
    </span>
  );
}

/** Faixa obrigatória quando os números são simulados (ARCHITECTURE §1.4). */
export function FaixaSimulacaoLive({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="Simulação: dados fictícios"
      className={cn(
        'relative isolate flex items-center justify-center gap-[calc(var(--u)*1)] overflow-hidden rounded-[calc(var(--u)*1)] border border-brand/40 bg-surface px-[calc(var(--u)*1.6)] py-[calc(var(--u)*0.6)] text-[length:calc(var(--u)*1.5)] font-bold uppercase leading-none tracking-[0.16em] text-brand-fg',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 -z-10 bg-brand/[0.14]" />
      <span aria-hidden className="absolute inset-0 -z-10 opacity-70 [background-image:repeating-linear-gradient(-45deg,rgb(var(--brand)/0.12)_0_10px,transparent_10px_20px)]" />
      <span aria-hidden className="h-[calc(var(--u)*0.8)] w-[calc(var(--u)*0.8)] shrink-0 rounded-full bg-current" />
      <span className="whitespace-nowrap">Simulação · dados fictícios</span>
    </div>
  );
}

/** Fundo sólido (escuro/claro): a cor do tema com o ruído e o brilho da marca, como no Modo TV. */
export function FundoSolidoLive() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-bg">
      <div className="absolute inset-0 bg-noise opacity-70" />
      <div className="absolute left-1/2 top-[-40%] h-[80%] w-[70%] -translate-x-1/2 rounded-full bg-brand/[0.08] blur-[120px]" />
    </div>
  );
}
