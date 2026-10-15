/**
 * Formato 'topo': faixa logo abaixo do cabeçalho em todas as páginas do AppShell ("Oferecido por" + logo + marca +
 * título + botão). A cota MASTER tem prioridade (escolherAnuncio).
 *
 *  - Desktop (≥ 768 px): dentro do cabeçalho fixo — fica sempre à vista e entra na altura `--app-header-h` (os
 *    elementos "sticky" das páginas descontam a faixa sozinhos).
 *  - Celular: logo abaixo do cabeçalho, rola junto com a página (a barra fixa do celular é o formato 'rodape';
 *    duas peças fixas tomariam a tela). Versão compacta: logo, "Publicidade · marca" e o título INTEIRO em até duas
 *    linhas (o anunciante escreve até 60 caracteres); abaixo de 400 px o botão vira só a seta (o texto do botão segue
 *    no rótulo do link), para sobrar espaço para o título.
 *  - Altura reservada antes de o status chegar (sem pulo de layout); sem anúncio no topo, a faixa não aparece.
 */
import { lazy, Suspense } from 'react';
import { cn } from '@/app/lib/cn';
import { useAnunciosDaPagina } from './contexto';
import { topoEsperado } from './visita';

/** Altura da faixa: 52 px (no celular cabem "Publicidade · marca" + o título em duas linhas). */
export const ALTURA_TOPO = 'h-[52px]';

/** Fundo da faixa (a peça usa o mesmo; o lugar reservado também). */
export const FUNDO_TOPO = 'relative overflow-hidden border-b border-line bg-surface-2';

/**
 * A peça desenhada fica num chunk à parte (com as peças comuns): o JS inicial do site leva só esta decisão. O download
 * começa já na carga do app quando a última visita tinha anúncio no topo (ou ainda não se sabe), em paralelo com o
 * status; enquanto isso, o lugar reservado tem a mesma altura (nada pula).
 */
const carregarPeca = () => import('./FaixaTopoPeca');
const FaixaTopoPecaPreguicosa = lazy(() => carregarPeca().then((m) => ({ default: m.FaixaTopoPeca })));
if (typeof window !== 'undefined' && topoEsperado() !== false) void carregarPeca().catch(() => undefined);

function Reservado({ className }: { className?: string }) {
  return <div aria-hidden className={cn(FUNDO_TOPO, ALTURA_TOPO, className)} />;
}

/** Faixa do topo (slot do AppShell). */
export function FaixaTopo({ className }: { className?: string }) {
  const { escolha, pronto, vista, semProvedor } = useAnunciosDaPagina();
  if (semProvedor) return null;
  const a = escolha.topo;
  if (!a) {
    // antes do status: reserva a altura se a última consulta tinha anúncio (ou se ainda não se sabe)
    if (!pronto && topoEsperado() !== false) return <Reservado className={className} />;
    return null;
  }
  return (
    <Suspense fallback={<Reservado className={className} />}>
      <FaixaTopoPecaPreguicosa anuncio={a} vista={vista} className={className} />
    </Suspense>
  );
}
