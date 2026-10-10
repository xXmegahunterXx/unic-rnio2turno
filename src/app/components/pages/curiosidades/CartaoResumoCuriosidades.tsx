/**
 * Cartão de compartilhamento da PÁGINA de curiosidades: título + três números em destaque, nos 3 formatos.
 * Números reais do 1º turno (fonte TSE), sem fotos.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Curiosidade } from '@/shared/curiosidades';
import { cn } from '@/app/lib/cn';
import { CartaoBase, SeloOficial, useCartao, type FormatoCartao } from '@/app/components/share';
import { fmtValor, nivelTamanho } from './formato';

export function CartaoResumoCuriosidades({ fatos, total, formato }: { fatos: Curiosidade[]; total: number; formato: FormatoCartao }) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Curiosidades do 1º turno"
      selo={<SeloOficial>Dados oficiais · TSE</SeloOficial>}
      caminho="/curiosidades"
      instante={null}
      fonte="Fonte: TSE · 1º turno, 4 out. 2026"
      brilho="marca"
      titulo={
        <>
          O 1º turno em <span className="num text-brand-fg">{total}</span> curiosidades
        </>
      }
    >
      <Miolo fatos={fatos} />
    </CartaoBase>
  );
}

const TAM = [96, 84, 70, 58] as const;

/** Reduz a escala do miolo até caber no espaço da moldura (re-mede quando as fontes terminam de carregar). */
function useCaber(chave: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontes, setFontes] = useState(0);
  const id = `${chave}:${fontes}`;
  const [st, setSt] = useState({ escala: 1, id });
  if (st.id !== id) setSt({ escala: 1, id });
  useEffect(() => {
    let vivo = true;
    document.fonts?.ready.then(() => vivo && setFontes((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight > el.clientHeight + 1 && st.escala > 0.6) setSt((x) => ({ ...x, escala: Math.round((x.escala - 0.05) * 100) / 100 }));
  });
  return { ref, escala: st.escala };
}

function Miolo({ fatos }: { fatos: Curiosidade[] }) {
  const { k: k0, retrato, formato } = useCartao();
  const { ref, escala } = useCaber(`${formato}:${fatos.map((f) => f.id).join(',')}`);
  const k = k0 * escala;
  return (
    <div
      ref={ref}
      className={cn('grid min-h-0 flex-1 content-center overflow-hidden', retrato ? 'grid-cols-1' : 'grid-cols-3')}
      style={{ gap: (retrato ? 26 : 20) * k, paddingTop: 22 * k, paddingBottom: 22 * k }}
    >
      {fatos.map((f) => {
        const v = f.destaque ? fmtValor(f.destaque) : '';
        return (
          // sem overflow-hidden: o item da grade não pode encolher abaixo do conteúdo (a medição detecta o excesso)
          <div key={f.id} className="relative min-w-0 border border-line bg-surface/80" style={{ borderRadius: 24 * k, padding: `${(retrato ? 26 : 22) * k}px ${(retrato ? 32 : 22) * k}px` }}>
            <div aria-hidden className="absolute bottom-0 left-0 top-0 bg-brand-grad" style={{ width: 7 * k, borderTopLeftRadius: 24 * k, borderBottomLeftRadius: 24 * k }} />
            <div className="font-semibold uppercase text-fg-muted" style={{ fontSize: (retrato ? 19 : 14) * k, letterSpacing: '0.14em' }}>
              {f.titulo}
            </div>
            <div className="num whitespace-nowrap font-display font-semibold leading-none tracking-[-0.03em] text-brand-fg" style={{ fontSize: TAM[nivelTamanho(v)] * (retrato ? 1.1 : 1) * k, marginTop: 10 * k }}>
              {v}
            </div>
            <div className="font-semibold leading-tight text-fg" style={{ fontSize: (retrato ? 28 : 20) * k, marginTop: 10 * k }}>
              {f.destaque?.unidade}
            </div>
            <div className="leading-snug text-fg-muted" style={{ fontSize: (retrato ? 23 : 16) * k, marginTop: 6 * k }}>
              {f.lugares.filter((l) => l.nome !== 'Brasil').map((l) => l.nome).slice(0, 2).join(' · ')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
