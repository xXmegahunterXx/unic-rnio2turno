/**
 * Peças pequenas das páginas de cargos do 1º turno: chip de partido, selo de situação, nome com link para a
 * ficha, linha/cartão de candidato, aviso de reprocessamento do TSE e nota de fonte.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SituacaoCandidato } from '@/shared/dataset';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { corPartido } from './partidos';
import { ehEleito, rotuloSituacaoCurto } from './dados';
import { FotoOficial, type FotoTamanho } from './FotoOficial';

/** Quadradinho na cor neutra do partido. */
export function Amostra({ sigla, className }: { sigla: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]', className)} style={{ background: corPartido(sigla) }} />;
}

/** "■ PL" — identidade nunca só pela cor. */
export function PartidoChip({ sigla, numero, className }: { sigla: string; numero?: number; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] text-fg-muted', className)}>
      <Amostra sigla={sigla} />
      <span className="font-medium text-fg">{sigla}</span>
      {numero !== undefined ? <span className="num text-fg-muted">· {numero}</span> : null}
    </span>
  );
}

/** Selo da situação no 1º turno (neutro; eleito = marca, 2º turno = contorno). */
export function SituacaoSelo({ situacao, genero, className }: { situacao: SituacaoCandidato; genero?: string; className?: string }) {
  const eleito = ehEleito(situacao);
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[10.5px] font-semibold uppercase leading-none tracking-[0.06em]',
        eleito
          ? 'bg-brand/15 text-brand-fg'
          : situacao === 'segundo-turno'
            ? 'border border-brand/40 text-brand-fg'
            : 'bg-surface-3 text-fg-muted',
        className,
      )}
    >
      {eleito ? <Icon name="check" size={11} strokeWidth={3} /> : null}
      {rotuloSituacaoCurto(situacao, genero)}
    </span>
  );
}

/** Nome de urna com link para a ficha (só quando há ficha publicada). */
export function NomeLink({
  sqcand,
  nome,
  comFicha,
  className,
}: {
  sqcand?: string;
  nome: string;
  comFicha: boolean;
  className?: string;
}) {
  if (!sqcand || !comFicha) return <span className={cn('min-w-0 truncate', className)}>{nome}</span>;
  return (
    <Link
      to={`/candidato/${sqcand}`}
      className={cn(
        'min-w-0 truncate rounded-sm underline decoration-line/[3] decoration-1 underline-offset-[3px] transition-colors hover:text-brand-fg hover:decoration-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      {nome}
    </Link>
  );
}

export interface CandidatoLinhaDados {
  sqcand: string;
  numero: number;
  nomeUrna: string;
  partido: string;
  votos: number;
  pct: number;
  situacao: SituacaoCandidato;
  genero?: string;
}

/** Linha de candidato: foto, nome (→ ficha), partido · número, votos e %. */
export function CandidatoLinha({
  c,
  fotoGrupo,
  comFicha,
  posicao,
  tamanhoFoto = 'sm',
  barra,
  extra,
  selo = true,
  principal = 'pct',
  onde,
  className,
}: {
  c: CandidatoLinhaDados;
  /** Mostra o selo "Eleito"/"2º turno" ao lado do nome. */
  selo?: boolean;
  /** Número em destaque à direita: % (padrão) ou votos. */
  principal?: 'pct' | 'votos';
  /** Abrangência do % (ex.: "SP"), quando `principal = 'votos'`. */
  onde?: string;
  fotoGrupo?: string;
  comFicha: boolean;
  /** Posição (1º, 2º…) à esquerda. */
  posicao?: number;
  tamanhoFoto?: FotoTamanho;
  /** Barra de % (0–100) sob o nome, na cor neutra do partido. */
  barra?: number;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {posicao !== undefined ? (
        <span className="num w-6 shrink-0 text-right text-[12px] font-medium text-fg-subtle">{posicao}º</span>
      ) : null}
      <FotoOficial sqcand={c.sqcand} fotoGrupo={fotoGrupo} nome={c.nomeUrna} tamanho={tamanhoFoto} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <NomeLink sqcand={c.sqcand} nome={c.nomeUrna} comFicha={comFicha} className="text-[14.5px] font-semibold text-fg" />
          {selo && (ehEleito(c.situacao) || c.situacao === 'segundo-turno') ? <SituacaoSelo situacao={c.situacao} genero={c.genero} /> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <PartidoChip sigla={c.partido} numero={c.numero} />
          {extra}
        </div>
        {barra !== undefined ? (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full" style={{ width: `${Math.max(0.5, Math.min(100, barra))}%`, background: corPartido(c.partido) }} />
          </div>
        ) : null}
      </div>
      {principal === 'pct' ? (
        <div className="shrink-0 text-right">
          <div className="num font-display text-[15px] font-semibold leading-tight text-fg">{fmtPct(c.pct)}</div>
          <div className="num text-[11.5px] leading-tight text-fg-muted">{fmtInt(c.votos)} votos</div>
        </div>
      ) : (
        <div className="shrink-0 text-right">
          <div className="num font-display text-[15px] font-semibold leading-tight text-fg">{fmtInt(c.votos)}</div>
          <div className="num text-[11.5px] leading-tight text-fg-muted">
            {fmtPct(c.pct)}
            {onde ? ` em ${onde}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

/** Aviso discreto do TSE (ex.: deputados do AM em reprocessamento). */
export function AvisoTse({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-xl border border-dashed border-line/[2] bg-surface-2/60 px-3 py-2.5 text-[13px] leading-snug text-fg-muted',
        className,
      )}
    >
      <Icon name="relogio" size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Texto padrão do reprocessamento (AM). */
export function textoReprocessamento(uf: string, aviso?: string | null): string {
  const base = `O TSE está reprocessando a totalização ${uf === 'AM' ? 'do Amazonas' : `de ${uf}`}`;
  return `${base}${aviso ? ` (“${aviso}”)` : ''}: os eleitos ainda não foram divulgados. As cadeiras aparecem como “aguardando”.`;
}

/** Linha de fonte (dados oficiais do 1º turno). */
export function FonteTse({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-[12px] leading-snug text-fg-subtle', className)}>
      <Icon name="selo" size={14} className="mt-px shrink-0" />
      <span>
        {children ?? 'Resultado oficial do 1º turno (4 de outubro de 2026). Fonte: TSE — dados abertos e divulgação de resultados.'}
      </span>
    </p>
  );
}
