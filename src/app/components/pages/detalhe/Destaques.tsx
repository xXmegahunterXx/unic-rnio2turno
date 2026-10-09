/**
 * Destaques da UF (ou do exterior), todos neutros e simétricos:
 *  - Maiores colégios eleitorais (5 maiores eleitorados, placar compacto);
 *  - Maiores vantagens de cada candidato (top 3 por margem em p.p., uma coluna por candidato);
 *  - Disputas mais apertadas (menor margem entre os municípios com eleitorado relevante);
 *  - Ainda apurando (menor % de seções totalizadas) — só enquanto a apuração corre.
 */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MunicipioResumo, Race } from '@/shared/types';
import { margem, pctComparecimento, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtCompact, fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge } from '@/app/ui/Badge';
import { Icon, type IconName } from '@/app/ui/Icon';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { rotuloApurado } from '@/app/components/apuracao/mapModes';
import { MiniPlacar } from './MiniPlacar';

export interface DestaquesProps {
  race: Race;
  municipios: MunicipioResumo[];
  /** Link de um município. */
  para: (m: MunicipioResumo) => string;
  /** Apuração em andamento (mostra "Ainda apurando"). */
  apurando: boolean;
  /** 'municípios' | 'cidades' (exterior). */
  unidade?: 'municípios' | 'cidades';
  /** Rótulo extra do município (ex.: país no exterior). */
  rotulo?: (m: MunicipioResumo) => string | undefined;
  className?: string;
}

/** Votos válidos apurados mínimos para entrar em "Maiores vantagens". */
const MIN_VALIDOS_VANTAGEM = 150;

export function Destaques({ race, municipios, para, apurando, unidade = 'municípios', rotulo, className }: DestaquesProps) {
  const d = useMemo(() => {
    const comVotos = municipios.filter((m) => m.secoesTotalizadas > 0 && m.votos.some((v) => v > 0));
    const colegios = [...municipios].sort((a, b) => b.eleitorado - a.eleitorado).slice(0, 5);
    // Vantagens: só com amostra mínima de votos válidos apurados (uma seção de 30 eleitores no exterior
    // daria "+100 p.p." sem significado); se sobrarem poucos, usa todos.
    let baseVant = comVotos.filter((m) => validos(m) >= MIN_VALIDOS_VANTAGEM);
    if (baseVant.length < 6) baseVant = comVotos;
    const vantagens = [0, 1].map((i) =>
      baseVant
        .map((m) => ({ m, mg: margem(m) }))
        .filter((x) => x.mg.lider === i)
        .sort((a, b) => b.mg.pp - a.mg.pp || b.m.eleitorado - a.m.eleitorado)
        .slice(0, 3),
    );
    // Apertadas: entre os municípios com eleitorado relevante (≥ 10 mil, ou todos se sobrarem poucos).
    let base = comVotos.filter((m) => m.eleitorado >= 10_000);
    if (base.length < 8) base = comVotos;
    const apertadas = base
      .map((m) => ({ m, mg: margem(m) }))
      .filter((x) => x.mg.lider !== null || x.m.votos.some((v) => v > 0))
      .sort((a, b) => a.mg.pp - b.mg.pp || b.m.eleitorado - a.m.eleitorado)
      .slice(0, 5);
    const pendentes = municipios
      .filter((m) => m.secoesTotalizadas < m.secoes)
      .sort((a, b) => pctTotalizadas(a) - pctTotalizadas(b) || b.eleitorado - a.eleitorado);
    return { colegios, vantagens, apertadas, pendentes, semVotos: comVotos.length === 0 };
  }, [municipios]);

  const mostrarPendentes = apurando && d.pendentes.length > 0;
  const singular = unidade === 'cidades' ? 'cidade' : 'município';

  const colegios = (
    <Cartao icon="usuarios" titulo="Maiores colégios eleitorais" subtitulo={`Os 5 ${unidade} com mais eleitores`}>
      <ol>
        {d.colegios.map((m, k) => (
          <li key={m.cod} className="border-b border-line last:border-0">
            <MiniPlacar
              race={race}
              t={m}
              rank={k + 1}
              to={para(m)}
              nome={m.nome}
              badge={
                m.capital ? (
                  <Badge tone="brand" size="xs">
                    Capital
                  </Badge>
                ) : rotulo?.(m) ? (
                  <span className="truncate text-[12px] text-fg-muted">{rotulo(m)}</span>
                ) : null
              }
              extra={`${fmtCompact(m.eleitorado)} eleit.`}
            />
          </li>
        ))}
      </ol>
    </Cartao>
  );

  // Antes da primeira seção totalizada: só o que já se sabe (os maiores colégios) e uma explicação, em vez de
  // quatro cartões vazios.
  if (d.semVotos) {
    return (
      <div className={cn('grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:items-start', className)}>
        {colegios}
        <Cartao
          icon="relogio"
          titulo="Assim que as seções forem totalizadas"
          subtitulo="Os destaques se atualizam sozinhos durante a apuração"
        >
          <ul className="mt-3 space-y-3">
            {[
              { icon: 'seta-cima' as const, t: 'Maiores vantagens', d: `Onde cada candidato abre mais diferença.` },
              { icon: 'troca' as const, t: 'Disputas mais apertadas', d: `Os ${unidade} com a menor diferença entre os dois.` },
              { icon: 'relogio' as const, t: 'Ainda apurando', d: `Os ${unidade} com menos seções totalizadas.` },
            ].map((x) => (
              <li key={x.t} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <Icon name={x.icon} size={16} className="mt-0.5 shrink-0 text-fg-muted" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-fg">{x.t}</span>
                  <span className="block text-[12.5px] leading-snug text-fg-muted">{x.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    );
  }

  return (
    // Duas pilhas independentes (em vez de uma grade 2×2): os cartões têm alturas diferentes e assim não
    // sobram vãos. No celular a ordem de leitura é a mesma (colégios, vantagens, apertadas, apurando).
    <div className={cn('grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:items-start', className)}>
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
        {colegios}

        <Cartao icon="seta-cima" titulo="Maiores vantagens" subtitulo={`Onde cada candidato abre mais diferença (em p.p. dos válidos)`}>
          {/* Duas colunas só quando o próprio cartão tem largura (container query), não pela janela. */}
          <div className="[container-type:inline-size]">
            <div className="grid grid-cols-1 gap-4 [@container(min-width:460px)]:grid-cols-2 [@container(min-width:460px)]:gap-3">
              {[0, 1].map((i) => {
                const c = race.candidatos[i];
                const s = corSlot(c.cor);
                const lista = d.vantagens[i];
                return (
                  <div key={c.numero} className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 border-b border-line pb-2">
                      <CandidateAvatar candidato={c} size="xs" />
                      <span className="truncate text-[13px] font-semibold text-fg">{c.nomeUrna}</span>
                    </div>
                    {lista.length === 0 ? (
                      <p className="py-3 text-[13px] text-fg-muted">Ainda sem {unidade} à frente.</p>
                    ) : (
                      <ol>
                        {lista.map(({ m, mg }) => (
                          <li key={m.cod}>
                            <Link
                              to={para(m)}
                              className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium text-fg">{m.nome}</span>
                                <span className="num block text-[11.5px] text-fg-muted">
                                  {fmtPct(pctValidos(m, i), 1)} · {fmtCompact(m.eleitorado)} eleit.
                                </span>
                              </span>
                              <span className={cn('num shrink-0 text-[13px] font-semibold', s.text)}>{fmtPP(mg.pp)}</span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Cartao>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
        <Cartao icon="troca" titulo="Disputas mais apertadas" subtitulo={`Menor diferença entre os dois, em ${unidade} com mais eleitores`}>
          {d.apertadas.length === 0 ? (
            <Vazio>Aparecem quando houver votos apurados.</Vazio>
          ) : (
            <ol>
              {d.apertadas.map(({ m, mg }) => {
                const lider = mg.lider !== null ? race.candidatos[mg.lider] : null;
                return (
                  <li key={m.cod} className="border-b border-line last:border-0">
                    <Link
                      to={para(m)}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-fg">{m.nome}</span>
                        <span className="num block text-[11.5px] text-fg-muted">
                          {fmtCompact(m.eleitorado)} eleitores ·{' '}
                          {m.secoesTotalizadas >= m.secoes ? 'totalizado' : `${rotuloApurado(pctTotalizadas(m))} apurado`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {lider ? <CandidateAvatar candidato={lider} size="xs" /> : null}
                        <span className="num text-[13px] font-semibold text-fg">
                          {mg.lider === null ? 'Empate' : fmtPP(mg.pp, mg.pp < 1 ? 2 : 1).replace('+', '')}
                        </span>
                        {lider ? <span className="sr-only">a favor de {lider.nomeUrna}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Cartao>

        {mostrarPendentes ? (
          <Cartao
            icon="relogio"
            titulo="Ainda apurando"
            subtitulo={`${fmtInt(d.pendentes.length)} ${d.pendentes.length === 1 ? singular : unidade} com seções a totalizar`}
          >
            <ol>
              {d.pendentes.slice(0, 5).map((m) => {
                const p = pctTotalizadas(m);
                return (
                  <li key={m.cod} className="border-b border-line last:border-0">
                    <Link
                      to={para(m)}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-fg">{m.nome}</span>
                        <span className="num block text-[11.5px] text-fg-muted">
                          {fmtInt(m.secoes - m.secoesTotalizadas)} de {fmtInt(m.secoes)} {m.secoes === 1 ? 'seção' : 'seções'} a totalizar
                        </span>
                      </span>
                      <span className="flex w-24 shrink-0 flex-col items-end gap-1">
                        <span className="num text-[13px] font-semibold text-fg">{m.secoesTotalizadas === 0 ? '0%' : rotuloApurado(p)}</span>
                        <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Cartao>
        ) : (
          <Cartao icon="grafico" titulo="Maiores comparecimentos" subtitulo={`Entre os ${unidade} com mais eleitores`}>
            <Comparecimentos municipios={municipios} para={para} />
          </Cartao>
        )}
      </div>
    </div>
  );
}

function Comparecimentos({ municipios, para }: { municipios: MunicipioResumo[]; para: (m: MunicipioResumo) => string }) {
  const lista = useMemo(() => {
    let base = municipios.filter((m) => m.eleitoradoTotalizado > 0 && m.eleitorado >= 10_000);
    if (base.length < 8) base = municipios.filter((m) => m.eleitoradoTotalizado > 0);
    return base
      .map((m) => ({ m, p: pctComparecimento(m) }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 5);
  }, [municipios]);
  if (lista.length === 0) return <Vazio>Aparecem quando houver seções totalizadas.</Vazio>;
  return (
    <ol>
      {lista.map(({ m, p }) => (
        <li key={m.cod} className="border-b border-line last:border-0">
          <Link
            to={para(m)}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-fg">{m.nome}</span>
              <span className="num block text-[11.5px] text-fg-muted">
                {fmtInt(m.comparecimento)} de {fmtInt(m.eleitoradoTotalizado)} eleitores
              </span>
            </span>
            <span className="flex w-24 shrink-0 flex-col items-end gap-1">
              <span className="num text-[13px] font-semibold text-fg">{fmtPct(p, 1)}</span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${p}%` }} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Cartao({ icon, titulo, subtitulo, children }: { icon: IconName; titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <header className="mb-2 flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-fg">{titulo}</h3>
          {subtitulo ? <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">{subtitulo}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13.5px] text-fg-muted">{children}</p>;
}
