/**
 * CTA "Consulte sua seção" da Home: convite para achar a própria urna, com os números reais da eleição
 * (seções, municípios e eleitorado do dataset) e um mosaico decorativo de "seções sendo totalizadas"
 * (só a cor da marca — nunca a de um candidato).
 */
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fmtInt } from '@/shared/format';

const nfMi = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 158.745.502 → "158,7" (o rótulo diz "milhões"). */
const fmtMilhoes = (n: number) => nfMi.format(Math.floor(n / 100_000) / 10);
import { useMeta } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';

export function ChamadaSecao({ className }: { className?: string }) {
  const { data: meta } = useMeta();
  const totais = useMemo(() => {
    if (!meta) return null;
    let secoes = 0;
    let eleitorado = 0;
    let municipios = 0;
    for (const u of meta.ufs) {
      secoes += u.secoes;
      eleitorado += u.eleitorado;
      if (u.uf !== 'ZZ') municipios += u.municipios;
    }
    return { secoes, eleitorado, municipios };
  }, [meta]);

  return (
    <section aria-labelledby="home-secao" className={cn('relative isolate overflow-hidden rounded-[28px] border border-line bg-surface shadow-card', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-brand/[0.14] blur-3xl" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="grid grid-cols-1 items-center gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:p-12">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Do Brasil até a sua urna</p>
          <h2 id="home-secao" className="mt-2 text-balance font-display text-[30px] font-semibold leading-[1.02] tracking-[-0.035em] text-fg sm:text-[44px]">
            Consulte sua seção
          </h2>
          <p className="mt-3 max-w-[34rem] text-pretty text-[15px] leading-relaxed text-fg-muted sm:text-[16.5px]">
            Escolha estado, cidade, zona e seção e veja o boletim da urna onde você vota assim que ela for totalizada, com o comparativo do 1º turno.
          </p>
          <dl className="mt-6 grid max-w-[34rem] grid-cols-3 gap-2 sm:gap-3">
            <Numero rotulo="seções" valor={totais ? fmtInt(totais.secoes) : '—'} />
            <Numero rotulo="municípios" valor={totais ? fmtInt(totais.municipios) : '—'} />
            <Numero rotulo="milhões de eleitores" valor={totais ? fmtMilhoes(totais.eleitorado) : '—'} />
          </dl>
          <ButtonLink to="/apuracao/consulta" variant="primary" size="lg" icon="busca" className="mt-7 w-full sm:w-auto">
            Consultar minha seção
          </ButtonLink>
        </div>
        <MosaicoDecorativo />
      </div>
    </section>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface-2/60 px-3 py-3 sm:px-4">
      <dd className="num truncate font-display text-[19px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[24px]">{valor}</dd>
      <dt className="mt-1.5 text-[11.5px] font-medium text-fg-muted sm:text-[12.5px]">{rotulo}</dt>
    </div>
  );
}

const COLS = 12;
const ROWS = 7;

/** Grade de "seções" acendendo em onda diagonal, com um cartão de boletim por cima. */
function MosaicoDecorativo() {
  const reduzir = useReducedMotion();
  const cells = useMemo(() => {
    const out: { k: number; d: number; forte: boolean }[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        // pseudo-aleatório estável
        const h = Math.sin((r + 1) * 12.9898 + (c + 1) * 78.233) * 43758.5453;
        const rnd = h - Math.floor(h);
        out.push({ k: r * COLS + c, d: (c + r) * 0.09 + rnd * 0.5, forte: rnd > 0.55 });
      }
    return out;
  }, []);
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[460px]">
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <span key={c.k} className="relative aspect-square overflow-hidden rounded-[5px] bg-surface-3 sm:rounded-md">
            <motion.span
              className={cn('absolute inset-0', c.forte ? 'bg-brand' : 'bg-brand-2/60')}
              initial={{ opacity: reduzir ? (c.forte ? 0.7 : 0.25) : 0 }}
              animate={reduzir ? undefined : { opacity: [0, c.forte ? 0.95 : 0.55, c.forte ? 0.95 : 0.55, 0] }}
              transition={{ duration: 4.2, times: [0, 0.18, 0.7, 1], delay: c.d, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
            />
          </span>
        ))}
      </div>
      {/* cartão "boletim" */}
      <div className="absolute bottom-[-6px] right-[-4px] w-[58%] max-w-[240px] rotate-[3deg] rounded-2xl border border-line/[1.6] bg-surface/90 p-3.5 shadow-card backdrop-blur-md sm:bottom-[-10px] sm:right-[-10px] sm:p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand-fg">
            <Icon name="urna" size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Boletim de urna</div>
            <div className="truncate font-mono text-[12px] text-fg">Zona · Seção</div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="h-2 w-full rounded-full bg-surface-3" />
          <div className="h-2 w-[78%] rounded-full bg-surface-3" />
          <div className="h-2 w-[56%] rounded-full bg-surface-3" />
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-fg">
          <Icon name="check-circulo" size={14} />
          Totalizada
        </div>
      </div>
    </div>
  );
}
