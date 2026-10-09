/**
 * Pré-visualização ao vivo da visão do eleitor: IFRAME da mesma origem numa moldura de celular (390×844),
 * escalada para caber na coluna. As mudanças do painel chegam ao iframe como a qualquer visitante
 * (servidor em produção; BroadcastChannel entre abas no demo).
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UF_NOMES } from '@/shared/constants';
import { UFS, type UF } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { Icon, IconButton, Select } from '@/app/ui';
import { urlPublica } from './rotulos';

const LARG = 390;
const ALT = 844;
const MOLDURA = 9;

export const PAGINAS_PREVIA: { value: string; label: string }[] = [
  { value: '/apuracao', label: 'Apuração · Brasil' },
  { value: '/governadores', label: 'Governadores' },
  { value: '/', label: 'Página inicial' },
  ...[...UFS]
    .sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'))
    .map((uf) => ({ value: `/apuracao/${uf.toLowerCase()}`, label: `Estado · ${UF_NOMES[uf as UF]}` })),
];

export function rotuloPagina(caminho: string): string {
  return PAGINAS_PREVIA.find((p) => p.value === caminho)?.label ?? caminho;
}

export function PreviaCelular({
  caminho,
  onCaminho,
  alturaMax = 720,
  className,
}: {
  caminho: string;
  onCaminho: (c: string) => void;
  /** Altura máxima da moldura (px). */
  alturaMax?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [chave, setChave] = useState(0);
  const [carregando, setCarregando] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(el.getBoundingClientRect().width);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const escala = useMemo(() => {
    if (!w) return 0.6;
    const porLargura = (w - 2 * MOLDURA) / LARG;
    const porAltura = (alturaMax - 2 * MOLDURA) / ALT;
    return Math.max(0.3, Math.min(1, porLargura, porAltura));
  }, [w, alturaMax]);
  const src = urlPublica(caminho);
  const largTela = Math.round(LARG * escala);
  const altTela = Math.round(ALT * escala);

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-center gap-1.5">
        <Select
          aria-label="Página da pré-visualização"
          size="sm"
          options={PAGINAS_PREVIA}
          value={caminho}
          onChange={(e) => {
            setCarregando(true);
            onCaminho(e.target.value);
          }}
          wrapperClassName="min-w-0 flex-1"
        />
        <IconButton
          icon="reset"
          label="Recarregar pré-visualização"
          size="sm"
          variant="outline"
          onClick={() => {
            setCarregando(true);
            setChave((k) => k + 1);
          }}
        />
        <a
          href={src}
          target="_blank"
          rel="noopener"
          aria-label="Abrir em nova aba"
          title="Abrir em nova aba"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-line text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name="externo" size={16} />
        </a>
      </div>
      <div ref={ref} className="flex justify-center">
        <div
          className="relative rounded-[42px] bg-surface-3 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.65),inset_0_0_0_1px_rgb(var(--line)/0.16)]"
          style={{ padding: MOLDURA, width: largTela + 2 * MOLDURA }}
        >
          <span aria-hidden className="absolute left-1/2 top-[3px] h-[3px] w-12 -translate-x-1/2 rounded-full bg-[rgb(var(--fg)/0.18)]" />
          <div className="relative overflow-hidden rounded-[33px] bg-bg" style={{ width: largTela, height: altTela }}>
            <iframe
              key={`${caminho}#${chave}`}
              title={`Pré-visualização: ${rotuloPagina(caminho)}`}
              src={src}
              loading="lazy"
              onLoad={() => setCarregando(false)}
              className="absolute left-0 top-0 origin-top-left border-0 bg-bg"
              style={{ width: LARG, height: ALT, transform: `scale(${escala})` }}
            />
            {carregando ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-[2px]">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-fg-muted">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                  Carregando a visão do eleitor…
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
