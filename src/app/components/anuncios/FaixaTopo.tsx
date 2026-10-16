/**
 * Formato 'topo': faixa logo abaixo do cabeçalho em todas as páginas do AppShell ("Oferecido por" + logo + marca +
 * título + botão). A cota MASTER tem prioridade (escolherAnuncio).
 *
 *  - Em todas as larguras: logo abaixo do cabeçalho, ROLA junto com a página (não fica presa ao cabeçalho fixo). Fixa,
 *    a faixa passava colada aos percentuais, nomes e fotos de candidato ao rolar (ARCHITECTURE §1.5: anúncio nunca
 *    colado a foto, nome ou número de candidato). A impressão conta na carga, com a faixa no topo.
 *  - No celular, a barra fixa é o formato 'rodape' (que se recolhe diante de placar e resultado).
 *  - Faixa "premium" (anunciantes v2): 60 px abaixo de 1024 px e 64 px a partir dele, com o LOGOTIPO grande no lugar do
 *    nome em texto (o nome segue no rótulo do link). Abaixo de 1024 px: logo, filete, "Publicidade" e o título INTEIRO em
 *    até duas linhas (o anunciante escreve até 60 caracteres), e a seta (o texto do botão segue no rótulo do link). A
 *    partir de 1024 px: "Publicidade", filete, logo, o título inteiro numa linha, o destino (xl) e o botão. Com ícone
 *    ou logo antiga, o nome da marca continua em texto ("Publicidade · marca").
 *  - Altura reservada antes de o status chegar (sem pulo de layout); sem anúncio no topo, a faixa não aparece.
 */
import { lazy, Suspense } from 'react';
import { cn } from '@/app/lib/cn';
import { useAnunciosDaPagina } from './contexto';
import { topoEsperado } from './visita';

/** Altura da faixa: 60 px abaixo de 1024 px (logo de 34 px + "Publicidade" + o título em duas linhas) e 64 px a partir dele. */
export const ALTURA_TOPO = 'h-[60px] lg:h-16';
/** Altura da versão compacta (vitrine e prévia em coluna estreita): a do celular. */
export const ALTURA_TOPO_COMPACTA = 'h-[60px]';

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
