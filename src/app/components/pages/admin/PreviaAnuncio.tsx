/**
 * Prévia de um anúncio no painel, formato a formato (topo, rodapé, nativo, Teste Cego, Modo TV, imagens, chat, lives),
 * no tema claro e no escuro.
 *
 * Usa os componentes REAIS do site (src/app/components/anuncios, `VitrineFormato`) em modo prévia: sem link, sem
 * contagem de impressão — o que aparece aqui é exatamente o que vai ao ar. Cada versão fica numa moldura com
 * `data-tema-local` (os tokens de cor do trecho) e `TemaLocal` (a logo e a placa do tema). Padrão: "Lado a lado" — as
 * duas versões em colunas quando a prévia tem largura para isso (≥ 1024 px de tela e ≥ 600 px de coluna: abaixo disso a
 * faixa do topo sairia cortada) e, sem largura, claro e escuro empilhados.
 *
 * Regras visíveis também na prévia: sempre rotulado ("Publicidade", "Patrocinado", "Oferecido por"), sem animação,
 * separado de qualquer conteúdo eleitoral.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { AnuncioPublico, FormatoAnuncio } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Segmented } from '@/app/ui';
import { LogoMarca, TemaLocal, VitrineFormato, type LogoDoAnuncio, type TemaLogo } from '@/app/components/anuncios';
import { ROTULO_CURTO } from './anunciosAdmin';

/**
 * Tamanhos do painel → espaço da logo (`--logo-h` / `--logo-max`, o mesmo `LogoMarca` do site, com o ajuste):
 * lista 48 / 160 (112 abaixo de 640 px: um logotipo largo não espreme o nome no cartão); cabeçalho do formulário 56 / 200.
 */
const TAMANHO = {
  sm: '[--logo-h:24px] [--logo-max:84px]',
  md: '[--logo-h:40px] [--logo-max:132px]',
  lg: '[--logo-h:48px] [--logo-max:112px] sm:[--logo-max:160px]',
  xl: '[--logo-h:56px] [--logo-max:200px]',
} as const;

export function LogoAnuncio({
  anuncio,
  className,
  tamanho = 'md',
}: {
  anuncio: Partial<LogoDoAnuncio> & Pick<AnuncioPublico, 'marca'>;
  className?: string;
  tamanho?: keyof typeof TAMANHO;
}) {
  return <LogoMarca anuncio={anuncio} tamanho={tamanho === 'sm' ? 'xs' : tamanho === 'xl' ? 'lg' : 'md'} className={cn(TAMANHO[tamanho], className)} />;
}

type ModoTema = 'claro' | 'escuro' | 'ambos';

/** Uma versão da prévia num tema fixo. */
function Moldura({ tema, children }: { tema: TemaLogo; children: ReactNode }) {
  return (
    <TemaLocal.Provider value={tema}>
      <div data-tema-local={tema} className="min-w-0 rounded-[20px] border border-line bg-bg p-2.5 text-fg sm:p-3">
        <span className="mb-2 block px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{tema === 'claro' ? 'Tema claro' : 'Tema escuro'}</span>
        {children}
      </div>
    </TemaLocal.Provider>
  );
}

/** Largura mínima da coluna da prévia para as duas versões lado a lado (cada uma com ~290 px: a faixa do topo cabe). */
const LARGURA_LADO_A_LADO = 600;

/** Largura de um elemento (ResizeObserver). */
function useLargura<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function PreviaAnuncio({ anuncio, className }: { anuncio: AnuncioPublico; className?: string }) {
  const formatos = anuncio.formatos;
  const [ver, setVer] = useState<FormatoAnuncio | null>(formatos[0] ?? null);
  const [modo, setModo] = useState<ModoTema>('ambos');
  const [ref, largura] = useLargura<HTMLDivElement>();
  const colunas = modo === 'ambos' && largura >= LARGURA_LADO_A_LADO && typeof window !== 'undefined' && window.innerWidth >= 1024;
  useEffect(() => {
    if (!ver || !formatos.includes(ver)) setVer(formatos[0] ?? null);
  }, [formatos, ver]);
  if (!ver)
    return (
      <div ref={ref} className={cn('rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-fg-subtle', className)}>
        Escolha pelo menos um formato para ver a prévia.
      </div>
    );
  const temas: TemaLogo[] = modo === 'ambos' ? ['claro', 'escuro'] : [modo];
  return (
    <div ref={ref} className={className}>
      <div className="mb-3 flex flex-col gap-2">
        {formatos.length > 1 ? (
          <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
            <Segmented ariaLabel="Formato da prévia" size="sm" value={ver} onChange={(v) => setVer(v)} options={formatos.map((f) => ({ value: f, label: ROTULO_CURTO[f] }))} />
          </div>
        ) : null}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
          <Segmented
            ariaLabel="Tema da prévia"
            size="sm"
            value={modo}
            onChange={setModo}
            options={[
              { value: 'claro', label: 'Claro' },
              { value: 'escuro', label: 'Escuro' },
              { value: 'ambos', label: 'Lado a lado' },
            ]}
          />
        </div>
      </div>
      <div className={cn('grid gap-3', colunas ? 'grid-cols-2' : 'grid-cols-1')} data-previa-colunas={colunas ? 2 : 1}>
        {temas.map((t) => (
          <Moldura key={t} tema={t}>
            <VitrineFormato anuncio={anuncio} formato={ver} estreita />
          </Moldura>
        ))}
      </div>
    </div>
  );
}
