/**
 * "Afirmação a afirmação": para cada afirmação, a resposta da pessoa e a posição DOCUMENTADA de cada candidato
 * na mesma régua (concordo totalmente ← → discordo totalmente). Aberta, mostra o trecho literal do plano entre
 * aspas e o link para a página do PDF. Candidatos na ordem da urna, mesma tipografia para os dois.
 * No Duelo, a régua ganha um segundo marcador (quem desafiou).
 */
import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TEMA_POR_ID, type Afirmacao, type PorCandidato, type Posicao, type Resposta } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { AvatarCandidato } from './AvatarCandidato';
import { fmtSintonia, notaPublica, ROTULO_POSICAO, rotuloResposta, type Autor } from './sintonia';
import { TemaEmoji } from './TemaEmoji';

export interface LinhaAfirmacao {
  afirmacao: Afirmacao;
  minha: Resposta | null;
  importante?: boolean;
  /** Afinidade 0–100 da resposta com cada candidato (null se pulada ou sem posição). */
  pct?: PorCandidato<number | null>;
  /** Duelo: resposta de quem desafiou. */
  outra?: Resposta | null;
  /** Duelo: as duas do mesmo lado da escala. */
  mesmoLado?: boolean;
  /** Duelo: as duas responderam na escala. */
  comparavel?: boolean;
}

interface Contexto {
  porNumero: Record<Autor, Candidate>;
  lista: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  duelo?: boolean;
}

/** Posição horizontal (%) de um valor −2…+2 na régua: +2 à esquerda (10%), −2 à direita (90%). */
const xDe = (v: number) => 10 + ((2 - v) / 4) * 80;
const pontos = (p: Posicao) => (p.valor === 'concorda' ? 2 : p.valor === 'discorda' ? -2 : p.valor === 'neutro' ? 0 : null);

export function LegendaRegua({ duelo, className }: { duelo?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-fg-muted', className)}>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="seta-esquerda" size={14} className="text-fg-subtle" />
        Concordo totalmente
        <span className="mx-1 inline-block h-px w-6 bg-line/[3]" aria-hidden />
        Discordo totalmente
        <Icon name="seta" size={14} className="text-fg-subtle" />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <MarcadorVoce /> Você
      </span>
      {duelo ? (
        <span className="inline-flex items-center gap-1.5">
          <MarcadorOutra /> Quem te desafiou
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex -space-x-1">
          <span className="h-3.5 w-3.5 rounded-full bg-cand-a ring-2 ring-surface" />
          <span className="h-3.5 w-3.5 rounded-full bg-cand-b ring-2 ring-surface" />
        </span>
        Posição documentada no plano
      </span>
    </div>
  );
}

function MarcadorVoce({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-3.5 w-3.5 rounded-full bg-brand-cta ring-2 ring-surface', className)} />;
}
function MarcadorOutra({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-3.5 w-3.5 rounded-full border-[2.5px] border-fg bg-surface', className)} />;
}

/** Régua com a resposta (e a de quem desafiou) e as posições dos candidatos. */
export function Regua({ linha, ctx }: { linha: LinhaAfirmacao; ctx: Contexto }) {
  const { afirmacao: a, minha, outra } = linha;
  const comPos = ctx.lista
    .map((c) => ({ c, v: pontos(a.posicoes[c.numero as Autor]) }))
    .filter((x): x is { c: Candidate; v: 0 | 2 | -2 } => x.v !== null);
  const mesmaPos = comPos.length === 2 && comPos[0].v === comPos[1].v;
  const mv = typeof minha === 'number' ? minha : null;
  const ov = ctx.duelo && typeof outra === 'number' ? outra : null;
  const juntos = mv !== null && ov !== null && mv === ov;
  return (
    <div aria-hidden className="relative h-[66px] w-full max-w-[680px]">
      {/* candidatos (faixa de cima) */}
      {comPos.map(({ c, v }, i) => (
        <span
          key={c.numero}
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `calc(${xDe(v)}% + ${mesmaPos ? (i === 0 ? -12 : 12) : 0}px)` }}
        >
          <AvatarCandidato candidato={c} foto={ctx.fotos[c.numero as Autor]} size="sm" />
        </span>
      ))}
      {/* trilho */}
      <span className="absolute left-[10%] right-[10%] top-[42px] h-[2px] -translate-y-1/2 rounded-full bg-line/[2.5]" />
      {[2, 1, 0, -1, -2].map((v) => (
        <span key={v} className="absolute top-[42px] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-subtle/50" style={{ left: `${xDe(v)}%` }} />
      ))}
      {/* respostas (no trilho) */}
      {mv !== null ? (
        <span className="absolute top-[42px] -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(${xDe(mv)}% + ${juntos ? -8 : 0}px)` }}>
          <MarcadorVoce className="h-4 w-4" />
        </span>
      ) : null}
      {ov !== null ? (
        <span className="absolute top-[42px] -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(${xDe(ov)}% + ${juntos ? 8 : 0}px)` }}>
          <MarcadorOutra className="h-4 w-4" />
        </span>
      ) : null}
      {/* rótulos (faixa de baixo) */}
      {mv !== null && !juntos ? (
        <span className="absolute top-[53px] -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold leading-none text-fg" style={{ left: `${xDe(mv)}%` }}>
          Você
        </span>
      ) : null}
      {ov !== null && !juntos ? (
        <span className="absolute top-[53px] -translate-x-1/2 whitespace-nowrap text-[11px] font-medium leading-none text-fg-muted" style={{ left: `${xDe(ov)}%` }}>
          Desafiante
        </span>
      ) : null}
      {juntos ? (
        <span className="absolute top-[53px] -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold leading-none text-fg" style={{ left: `${xDe(mv!)}%` }}>
          Vocês dois
        </span>
      ) : null}
      {mv === null ? (
        <span className="absolute left-0 top-[53px] text-[11px] font-medium leading-none text-fg-subtle">{minha === 'pular' ? 'Você pulou' : 'Sem resposta'}</span>
      ) : null}
      {ctx.duelo && ov === null ? (
        <span className="absolute right-0 top-[53px] text-[11px] font-medium leading-none text-fg-subtle">{outra === 'pular' ? 'Desafiante pulou' : 'Desafiante sem resposta'}</span>
      ) : null}
    </div>
  );
}

function textoAcessivel(linha: LinhaAfirmacao, ctx: Contexto): string {
  const partes = [`Você: ${rotuloResposta(linha.minha)}.`];
  if (ctx.duelo) partes.push(`Quem te desafiou: ${rotuloResposta(linha.outra)}.`);
  for (const c of ctx.lista) partes.push(`${c.nomeUrna}: ${ROTULO_POSICAO[linha.afirmacao.posicoes[c.numero as Autor].valor].toLowerCase()}.`);
  return partes.join(' ');
}

export function ListaAfirmacoes({
  linhas,
  porNumero,
  lista,
  fotos,
  duelo,
  abertosInicial = [],
}: {
  linhas: LinhaAfirmacao[];
  porNumero: Record<Autor, Candidate>;
  lista: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  duelo?: boolean;
  abertosInicial?: string[];
}) {
  const ctx: Contexto = { porNumero, lista, fotos, duelo };
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(abertosInicial));
  const todos = abertos.size === linhas.length;
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <LegendaRegua duelo={duelo} />
        <button
          type="button"
          onClick={() => setAbertos(todos ? new Set() : new Set(linhas.map((l) => l.afirmacao.id)))}
          className="-mr-2 ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name={todos ? 'recolher' : 'expandir'} size={15} />
          {todos ? 'Recolher todas' : 'Abrir todas'}
        </button>
      </div>
      <ul className="space-y-2.5">
        {linhas.map((l) => (
          <Linha key={l.afirmacao.id} linha={l} ctx={ctx} aberto={abertos.has(l.afirmacao.id)} onAlternar={() => alternar(l.afirmacao.id)} />
        ))}
      </ul>
    </div>
  );
}

function Linha({ linha, ctx, aberto, onAlternar }: { linha: LinhaAfirmacao; ctx: Contexto; aberto: boolean; onAlternar: () => void }) {
  const id = useId();
  const a = linha.afirmacao;
  const tema = TEMA_POR_ID[a.tema];
  const semPosicao = ctx.lista.filter((c) => a.posicoes[c.numero as Autor].valor === 'sem-posicao');
  return (
    <li className={cn('overflow-hidden rounded-2xl border bg-surface shadow-card transition-colors', aberto ? 'border-line/[2]' : 'border-line')}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={onAlternar}
        className="block w-full p-3.5 text-left transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:p-5"
      >
        <span className="flex items-center gap-2">
          <TemaEmoji tema={tema} size="sm" className="h-7 w-7 rounded-lg text-[14px]" />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{tema.rotulo}</span>
          {linha.importante ? (
            <Badge tone="brand" size="xs" icon="selo">
              Pesa mais
            </Badge>
          ) : null}
          {ctx.duelo && linha.comparavel ? (
            linha.mesmoLado ? (
              <Badge tone="brand" size="xs" icon="check">
                Mesmo lado
              </Badge>
            ) : (
              <Badge tone="neutral" size="xs" icon="troca">
                Lados diferentes
              </Badge>
            )
          ) : null}
          <Icon name="chevron" size={18} className={cn('shrink-0 text-fg-subtle transition-transform duration-200', aberto && 'rotate-180')} />
        </span>
        <span className="mt-2.5 block text-pretty font-display text-[16.5px] font-medium leading-snug tracking-[-0.01em] text-fg sm:text-[18px]">{a.texto}</span>
        <span className="mt-3 block sm:mt-4">
          <Regua linha={linha} ctx={ctx} />
        </span>
        <span className="sr-only">{textoAcessivel(linha, ctx)}</span>
        {semPosicao.length ? (
          <span className="mt-1 block text-[12px] leading-snug text-fg-subtle">
            Sem posição no plano: {semPosicao.map((c) => c.nomeUrna).join(' e ')}
          </span>
        ) : null}
      </button>
      <AnimatePresence initial={false}>
        {aberto ? (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 0.9, 0.24, 1] }}
            className="overflow-hidden"
          >
            <Detalhe linha={linha} ctx={ctx} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function Detalhe({ linha, ctx }: { linha: LinhaAfirmacao; ctx: Contexto }) {
  const a = linha.afirmacao;
  return (
    <div className="border-t border-line p-3.5 sm:p-5">
      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-[13px]">
        <div className="flex gap-1.5">
          <dt className="text-fg-subtle">Sua resposta:</dt>
          <dd className="font-semibold text-fg">{rotuloResposta(linha.minha)}</dd>
        </div>
        {ctx.duelo ? (
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Quem te desafiou:</dt>
            <dd className="font-semibold text-fg">{rotuloResposta(linha.outra)}</dd>
          </div>
        ) : null}
      </dl>
      {a.contexto ? <p className="mt-2 text-[13px] leading-snug text-fg-muted">{a.contexto}</p> : null}
      <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3">
        {ctx.lista.map((c) => (
          <PosicaoCandidato
            key={c.numero}
            candidato={c}
            foto={ctx.fotos[c.numero as Autor]}
            posicao={a.posicoes[c.numero as Autor]}
            afinidade={linha.pct?.[c.numero as Autor] ?? null}
            mostrarAfinidade={!ctx.duelo}
          />
        ))}
      </div>
    </div>
  );
}

/** Borda translúcida na cor do slot (classes por extenso para o Tailwind gerar). */
const BORDA_CITACAO: Record<Candidate['cor'], string> = { a: 'border-cand-a/70', b: 'border-cand-b/70', outros: 'border-cand-outros/70' };

function PosicaoCandidato({
  candidato,
  foto,
  posicao,
  afinidade,
  mostrarAfinidade,
}: {
  candidato: Candidate;
  foto?: string;
  posicao: Posicao;
  afinidade: number | null;
  mostrarAfinidade: boolean;
}) {
  const s = corSlot(candidato.cor);
  const f = posicao.fonte;
  const nota = notaPublica(posicao.nota);
  const sem = posicao.valor === 'sem-posicao';
  return (
    <article className={cn('flex flex-col rounded-xl border p-4', sem ? 'border-dashed border-line/[2] bg-transparent' : 'border-line bg-surface-2/50')}>
      <header className="flex items-center gap-2.5">
        <AvatarCandidato candidato={candidato} foto={foto} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold leading-tight text-fg">{candidato.nomeUrna}</div>
          {candidato.partido ? (
            <div className="num text-[12px] text-fg-muted">
              {candidato.partido} · {candidato.numero}
            </div>
          ) : null}
        </div>
        <Badge tone="neutral" size="xs" className="shrink-0">
          {sem ? 'Sem posição' : ROTULO_POSICAO[posicao.valor]}
        </Badge>
      </header>
      {sem ? (
        <p className="mt-3 text-pretty text-[13.5px] leading-relaxed text-fg-muted">{nota ?? 'O plano não trata do assunto.'} Não entra na conta.</p>
      ) : f ? (
        <>
          <blockquote className={cn('mt-3 border-l-2 pl-3 text-pretty text-[13.5px] italic leading-relaxed text-fg', BORDA_CITACAO[candidato.cor])}>
            “{f.trecho}”
          </blockquote>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              title={f.titulo}
              className="group inline-flex max-w-full items-start gap-1.5 rounded-md text-[12.5px] leading-snug text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon name="externo" size={14} className="mt-px shrink-0" />
              <span className="min-w-0">
                <span className="font-medium text-fg underline decoration-line underline-offset-2 group-hover:decoration-fg">Programa de governo</span>
                <span className="num"> · p. {fmtInt(f.pagina)}</span>
              </span>
            </a>
            {mostrarAfinidade && afinidade !== null ? (
              <span className="num text-[12.5px] text-fg-muted">
                Afinidade com sua resposta: <span className={cn('font-semibold', s.text)}>{fmtSintonia(afinidade)}</span>
              </span>
            ) : null}
          </div>
          {nota && posicao.confianca === 'media' ? (
            <p className="mt-2.5 text-pretty text-[12.5px] leading-snug text-fg-subtle">
              <span className="font-medium text-fg-muted">Leitura do contexto:</span> {nota}
            </p>
          ) : nota ? (
            <p className="mt-2.5 text-pretty text-[12.5px] leading-snug text-fg-subtle">{nota}</p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

/** Cabeçalho de seção padrão das páginas do teste. */
export function TituloSecao({ id, titulo, children }: { id: string; titulo: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <h2 id={id} className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
        {titulo}
      </h2>
      {children ? <p className="mt-1 max-w-[46rem] text-pretty text-[14px] leading-relaxed text-fg-muted">{children}</p> : null}
    </div>
  );
}
