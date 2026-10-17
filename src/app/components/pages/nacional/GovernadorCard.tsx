/**
 * Cartões das disputas em /governadores: mini mapa (UF por município, ou o Brasil por UF no cartão de
 * Presidente), os finalistas na ordem da urna, barra dividida, diferença, progresso e selo de resultado
 * definido. O cartão inteiro é um link para a página da disputa.
 *
 * Layout: no celular, cabeçalho → [mapa | candidatos] → barra e progresso; no desktop largo (xl), o mapa
 * ocupa a coluna esquerda inteira e o resto empilha à direita (cartão mais baixo, mapa maior).
 */
import { memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MunicipioResumo, Race, Summary, UF } from '@/shared/types';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, toneFromCor } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { ApuracaoProgress } from '@/app/components/apuracao/ApuracaoProgress';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { useFotosRace } from '@/app/components/apuracao/fotos';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { MiniBrMap, MiniUfMap } from './MiniUfMap';

/** Separador "·" antes de cada parte; no começo de linha cai na margem negativa e o `overflow-hidden` o esconde. */
const SEP_LINHA = "before:inline-block before:w-[1.1em] before:text-center before:content-['·']";

/** Diferença (p.p.) entre os dois finalistas; null sem votos. */
export function difFinalistas(resumo: Pick<Summary, 'votos'>): number | null {
  return validos(resumo) > 0 ? Math.abs(pctValidos(resumo, 0) - pctValidos(resumo, 1)) : null;
}

interface DisputaCardProps {
  /** Sigla curta no selo (UF ou "BR"). */
  sigla: string;
  nome: string;
  /** Linha sob o nome (região · eleitores). */
  sub: ReactNode;
  mapa: ReactNode;
  race: Race;
  resumo: Summary;
  to: string;
  /** Prefixo do rótulo acessível ("Governador · Acre"). */
  rotuloAcessivel: string;
  simulado?: boolean;
  className?: string;
}

const DisputaCard = memo(function DisputaCard({ sigla, nome, sub, mapa, race, resumo, to, rotuloAcessivel, simulado, className }: DisputaCardProps) {
  const tem = validos(resumo) > 0;
  const t1 = race.turno === 1;
  const eleito = !t1 && resumo.eleito !== null ? race.candidatos[resumo.eleito] : null;
  const dif = difFinalistas(resumo);
  const iOutros = race.candidatos.findIndex((c) => c.agregado);
  // Fotos oficiais quando a corrida não está anonimizada (o 1º turno é real: pode mostrar mesmo na simulação).
  const fotos = useFotosRace(race, { real: t1 });
  const resumoTexto = tem
    ? `${race.candidatos
        .filter((c) => !c.agregado)
        .map((c) => `${c.nomeUrna} ${fmtPct(pctValidos(resumo, race.candidatos.indexOf(c)), 1)}`)
        .join(', ')}, com ${fmtPct(pctTotalizadas(resumo))} das seções`
    : 'aguardando votos';

  return (
    <Link
      to={to}
      // placar da disputa: sem barra fixa de anúncio por cima (anuncios/faixaLivre.ts)
      data-sem-anuncio-fixo
      aria-label={`${rotuloAcessivel}: ${resumoTexto}.${eleito ? ` Resultado de ${eleito.nomeUrna} definido.` : ''} Ver detalhes.`}
      className={cn(
        'group relative block h-full overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5',
        'transition-[transform,border-color] duration-200 hover:-translate-y-px hover:border-line/[2]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      {eleito ? <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br', corSlot(eleito.cor).glow)} /> : null}

      {/* 768–1279 (2 cartões por linha, com foto): mapa a 24% para a sigla inteira (REPUBLICANOS) caber ao lado do % */}
      <div className="relative grid h-full grid-cols-[30%_minmax(0,1fr)] gap-x-4 gap-y-4 md:grid-cols-[24%_minmax(0,1fr)] xl:grid-cols-[minmax(0,38%)_minmax(0,1fr)] xl:grid-rows-[auto_1fr_auto] xl:gap-x-6 xl:gap-y-3">
        {/* cabeçalho */}
        <div className="col-span-2 flex items-start justify-between gap-3 xl:col-span-1 xl:col-start-2 xl:row-start-1">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-surface-3 px-1.5 font-mono text-[11.5px] font-semibold text-fg">{sigla}</span>
              <h3 className="line-clamp-2 break-words font-display text-[18px] font-semibold leading-tight tracking-[-0.015em] text-fg">{nome}</h3>
              {simulado ? <SimulationRibbon variant="badge" className="hidden shrink-0 sm:inline-flex" /> : null}
            </div>
            <p className="num mt-1 text-pretty text-[12.5px] leading-snug text-fg-muted">{sub}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {eleito ? (
              <Badge tone={toneFromCor(eleito.cor)} size="xs" caps icon="check">
                {resumo.status === 'encerrada' ? 'Final' : 'Definido'}
              </Badge>
            ) : dif !== null ? (
              <span
                className="num inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-fg"
                title="Diferença entre os dois finalistas, em pontos percentuais"
              >
                {fmtPP(dif).replace('+', '')}
              </span>
            ) : null}
            <Icon name="chevron-direita" size={18} className="text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
          </div>
        </div>

        {/* mapa */}
        <div className="col-start-1 row-start-2 flex items-center justify-center xl:row-span-3 xl:row-start-1">
          <div className="aspect-square w-full max-w-[260px]">{mapa}</div>
        </div>

        {/* candidatos */}
        <ul className="col-start-2 row-start-2 flex min-w-0 flex-col justify-center gap-3">
          {race.candidatos.map((c, i) => {
            if (c.agregado) return null;
            const s = corSlot(c.cor);
            const lider = tem && resumo.lider === i;
            return (
              <li key={c.numero} className="flex items-center gap-2.5">
                <CandidateAvatar
                  candidato={c}
                  foto={fotos[i]}
                  size={fotos[i] ? 'md' : 'sm'}
                  eleito={eleito === c}
                  className={cn('hidden min-[420px]:inline-flex', fotos[i] && '!h-10 !w-10')}
                />
                <div className="min-w-0 flex-1">
                  {/* até 3 linhas: em 768 px a coluna é estreita e "Professora Maria do Socorro…" pede 3 */}
                  <div className={cn('line-clamp-3 break-words text-[14.5px] leading-tight text-fg', lider ? 'font-semibold' : 'font-medium')}>{c.nomeUrna}</div>
                  {/* sigla nunca cortada (REPUBLICANOS × PP): sem espaço, os votos descem para a linha de baixo — e o "·"
                      do começo da linha some (cai na margem negativa, recortada), como no CarimboPrint: mesmo tratamento
                      para os dois finalistas, numa linha ou em duas */}
                  <div className="num mt-0.5 min-w-0 overflow-hidden text-[12px] text-fg-muted">
                    <div className="-ml-[1.1em] flex flex-wrap">
                      <span className={cn('shrink-0', SEP_LINHA)}>{c.partido}</span>
                      <span className={cn('shrink-0 whitespace-nowrap', SEP_LINHA)}>
                        {/* o "·" é desenho (CSS): o leitor de tela e o copiar ouvem uma pausa entre a sigla e os votos */}
                        <span className="sr-only">, </span>
                        {fmtInt(resumo.votos[i] ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
                <NumberRoll
                  value={pctValidos(resumo, i)}
                  format={(n) => fmtPct(n)}
                  smallChars="%"
                  className={cn(
                    'shrink-0 font-display text-[22px] font-semibold leading-none tracking-[-0.03em] xl:text-[26px]',
                    tem ? s.textDisplay : 'text-fg-subtle',
                  )}
                />
              </li>
            );
          })}
        </ul>

        {/* barra e progresso */}
        <div className="col-span-2 row-start-3 xl:col-span-1 xl:col-start-2 xl:self-end">
          <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} size="sm" nomes={race.candidatos.map((c) => c.nomeUrna)} />
          {iOutros >= 0 ? (
            <p className="mt-2 text-[12px] text-fg-muted">
              Demais candidatos: <span className="num font-medium text-fg">{fmtPct(pctValidos(resumo, iOutros))}</span>
            </p>
          ) : null}
          <ApuracaoProgress resumo={resumo} variant="compact" className="mt-3" />
        </div>
      </div>
    </Link>
  );
});

export interface GovernadorCardProps {
  uf: UF;
  race: Race;
  resumo: Summary;
  municipios?: MunicipioResumo[];
  to: string;
  className?: string;
}

export const GovernadorCard = memo(function GovernadorCard({ uf, race, resumo, municipios, to, className }: GovernadorCardProps) {
  const nome = UF_NOMES[uf];
  return (
    <DisputaCard
      sigla={uf}
      nome={nome}
      sub={`${REGIAO_NOMES[UF_REGIAO[uf]]} · ${fmtInt(resumo.eleitorado)} eleitores`}
      mapa={<MiniUfMap uf={uf} municipios={municipios} race={race} className="h-full w-full" />}
      race={race}
      resumo={resumo}
      to={to}
      rotuloAcessivel={`Governador · ${nome}`}
      className={className}
    />
  );
});

export interface PresidenteCardProps {
  race: Race;
  resumo: Summary;
  ufs?: Partial<Record<UF, Summary>>;
  to: string;
  sub: ReactNode;
  simulado?: boolean;
  className?: string;
}

/** Cartão de Presidente no mesmo formato (mini mapa do Brasil por UF). */
export const PresidenteCard = memo(function PresidenteCard({ race, resumo, ufs, to, sub, simulado, className }: PresidenteCardProps) {
  return (
    <DisputaCard
      sigla="BR"
      nome="Presidente"
      sub={sub}
      mapa={<MiniBrMap ufs={ufs} race={race} className="h-full w-full" />}
      race={race}
      resumo={resumo}
      to={to}
      rotuloAcessivel="Presidente"
      simulado={simulado}
      className={className}
    />
  );
});
