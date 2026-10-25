/**
 * "2022 · 2º turno": contexto histórico discreto com o resultado OFICIAL do 2º turno de 2022 para Presidente
 * (Lula × Jair Bolsonaro, % dos votos válidos, fonte TSE) na UF, no exterior ou no Brasil.
 *
 * Regras:
 *  - neutro e simétrico: os dois lado a lado (o de menor número na urna à esquerda), sem adjetivos nem destaque
 *    para quem teve mais votos;
 *  - cores da paleta de PARTIDO (`corPartido`: PT, PL), nunca a cor de identidade de um candidato de 2026;
 *  - sem foto; na simulação com nomes ocultos (`status.anonimizado`) não aparece (os nomes de 2022 diriam quem é quem);
 *  - enquanto o arquivo carrega, se falhar ou se a abrangência não existir: não renderiza nada.
 */
import { useId } from 'react';
import type { UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPct } from '@/shared/format';
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corPartido } from '@/app/components/pages/cargos/partidos';
import { emUf } from './fmt';
import { historico2022De, useHistorico2022Arquivo, type LinhaHistorico } from './historico2022';

export interface Historico2022CartaoProps {
  /** UF (inclusive 'ZZ', exterior) ou 'BR' (Brasil, com o exterior). */
  abrangencia: UF | 'BR';
  /**
   * 'faixa': largura toda, título à esquerda a partir de md (página da UF). 'coluna': sempre empilhado.
   * 'nacional': faixa de md até 1359 px e empilhado na coluna estreita do desktop largo (grade da NacionalPage).
   */
  variante?: 'faixa' | 'coluna' | 'nacional';
  className?: string;
}

export function Historico2022Cartao({ abrangencia, variante = 'coluna', className }: Historico2022CartaoProps) {
  const { data: status } = useStatus();
  // só com o status em mãos: antes dele não se sabe se a simulação está com nomes ocultos
  const ativo = !!status && !status.anonimizado;
  const { data } = useHistorico2022Arquivo(ativo);
  const idTitulo = useId();
  const h = ativo ? historico2022De(data, abrangencia) : null;
  if (!h) return null;

  const [a, b] = h.linhas;
  const local = abrangencia === 'BR' ? 'no Brasil' : emUf(abrangencia, UF_NOMES[abrangencia]);

  return (
    <section
      data-sem-anuncio-fixo
      aria-labelledby={idTitulo}
      className={cn('min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}
    >
      <div
        className={cn(
          'grid grid-cols-1 gap-3.5',
          variante !== 'coluna' && 'md:grid-cols-[minmax(0,18.5rem)_minmax(0,1fr)] md:items-center md:gap-10',
          variante === 'nacional' && 'min-[1360px]:grid-cols-1 min-[1360px]:gap-3.5',
        )}
      >
        <div className="min-w-0">
          <p className="num text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">2022 · 2º turno</p>
          <h2 id={idTitulo} className="mt-1 text-balance font-display text-[17px] font-semibold leading-tight tracking-[-0.015em] text-fg">
            Presidente {local}
          </h2>
          <p className="num mt-0.5 text-pretty text-[12.5px] leading-snug text-fg-muted">% dos votos válidos em 30 de outubro de 2022</p>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-x-4">
            <Lado linha={a} />
            <Lado linha={b} direita />
          </div>
          {/* barra dividida estática (sem animação), nas cores dos partidos; os números acima são o conteúdo */}
          <div aria-hidden className="relative mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-3">
            <span className="h-full" style={{ width: `${a.pct}%`, backgroundColor: corPartido(a.partido) }} />
            <span className="h-full flex-1" style={{ backgroundColor: corPartido(b.partido) }} />
          </div>
          {/* numa linha só; abaixo de 380 px, "fonte: TSE" desce inteira para a linha de baixo */}
          <p className="num mt-2.5 text-[11.5px] leading-snug text-fg-subtle">
            {fmtInt(h.validos)} votos válidos · {abrangencia === 'BR' ? 'com o exterior' : 'resultado oficial'}
            <span className="max-[379px]:hidden"> · </span>
            <span className="whitespace-nowrap max-[379px]:block">fonte: TSE</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Lado({ linha, direita }: { linha: LinhaHistorico; direita?: boolean }) {
  return (
    <div className={cn('min-w-0', direita && 'text-right')}>
      <div className={cn('flex min-w-0 items-center gap-1.5', direita && 'flex-row-reverse')}>
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corPartido(linha.partido) }} />
        <span className="truncate text-[13.5px] font-medium text-fg">{linha.nome}</span>
      </div>
      <div className="num mt-1 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg">{fmtPct(linha.pct)}</div>
      <div className="num mt-1 truncate text-[11.5px] text-fg-muted">
        {linha.partido} · {linha.numero}
        <span className="max-[379px]:hidden"> · {fmtInt(linha.votos)} votos</span>
      </div>
    </div>
  );
}
