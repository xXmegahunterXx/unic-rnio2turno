/**
 * /pesquisas — "Pesquisas do 2º turno": as pesquisas eleitorais REGISTRADAS no TSE (Lei 9.504/97, art. 33; Res. TSE
 * 23.600/2019), mais recentes primeiro, por disputa (Presidente ou Governador de cada UF com 2º turno).
 *
 *  - Aviso fixo e curto (`AVISO_PESQUISAS`); cada cartão com os dois candidatos na ordem da urna, percentuais grandes,
 *    votos totais e (quando divulgados) válidos, SEMPRE a linha das informações obrigatórias e o link da fonte.
 *  - Gráfico por instituto (uma série por instituto; sem média, projeção ou "agregador").
 *  - Dia da votação (0h–17h de 25/10, relógio do servidor): só um aviso neutro.
 *  - Resultado oficial concluído (fonte TSE, fase 'encerrada'): "Pesquisas × resultado" no topo.
 *  - Simulação com nomes ocultos (`status.anonimizado`): a área não aparece.
 *  - `?cargo=pres|gov-xx` escolhe a disputa; `?p=<id>` (o link dos cartões compartilhados) abre a disputa da pesquisa,
 *    rola até ela e a realça.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useFasePesquisas, usePesquisas } from '@/app/components/pesquisas/dados';
import { CartaoPesquisa, useCandidatosPesquisa } from '@/app/components/pesquisas/pecas';
import { BotaoCompartilharPesquisa } from '@/app/components/pesquisas/Compartilhar';
import { GraficoInstitutos } from '@/app/components/pesquisas/GraficoInstitutos';
import { PesquisasResultado } from '@/app/components/pesquisas/PesquisasResultado';
import { cn } from '@/app/lib/cn';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Skeleton } from '@/app/ui/Skeleton';
import { UF_NOMES, UFS_GOV_2T } from '@/shared/constants';
import { AVISO_DIA_VOTACAO, AVISO_PESQUISAS, ehCargoPesquisa, pesquisasDoCargo, ufDoCargo, type CargoPesquisa, type Pesquisa } from '@/shared/pesquisas';

type Grupo = 'pres' | 'gov';
/** Cartões abertos de início (mais recentes); as mais antigas ficam a um toque ("Ver as N mais antigas"). */
const CARTOES_INICIAIS = 8;
const CARGOS_GOV = UFS_GOV_2T.map((uf) => `gov-${uf.toLowerCase()}` as CargoPesquisa);

export default function PesquisasPage() {
  const { fase, pronto } = useFasePesquisas();
  const ativa = fase === 'lista' || fase === 'resultado';
  const q = usePesquisas(pronto && ativa);
  const [params, setParams] = useSearchParams();
  const lista = useMemo(() => q.data?.pesquisas ?? [], [q.data]);
  const idPedido = params.get('p');
  const pedida = idPedido ? lista.find((p) => p.id === idPedido) : undefined;
  const cargoQ = params.get('cargo');
  const cargo: CargoPesquisa = pedida?.cargo ?? (ehCargoPesquisa(cargoQ) ? cargoQ : 'pres');
  const resultado = fase === 'resultado';
  useTitulo(resultado ? 'Pesquisas × resultado · 2º turno' : 'Pesquisas do 2º turno');

  // link de uma pesquisa (?p=): rola até ela quando a lista chega
  useEffect(() => {
    if (!pedida) return;
    const t = window.setTimeout(() => document.getElementById(`pesquisa-${pedida.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(t);
  }, [pedida]);

  const trocarCargo = (c: CargoPesquisa) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('p');
        if (c === 'pres') n.delete('cargo');
        else n.set('cargo', c);
        return n;
      },
      { replace: true },
    );

  const daDisputa = pesquisasDoCargo(lista, cargo);

  return (
    <Container className="pb-12">
      <PageHeader
        eyebrow="Eleições 2026 · 2º turno"
        title={resultado ? 'Pesquisas × resultado' : 'Pesquisas do 2º turno'}
        subtitle={
          resultado
            ? 'A última pesquisa registrada de cada instituto ao lado do resultado oficial do TSE, com a diferença em pontos.'
            : 'As pesquisas eleitorais registradas no TSE, da mais recente para a mais antiga, com todas as informações exigidas e o link da fonte.'
        }
      />

      <AvisoFixo />

      {!pronto ? (
        <Esqueleto />
      ) : fase === 'oculta' ? (
        <AvisoNeutro icone="info" titulo="Área indisponível nesta simulação">
          Com os nomes dos candidatos ocultos na simulação, a área de pesquisas não aparece.
        </AvisoNeutro>
      ) : fase === 'votacao' || q.data?.suspensas ? (
        <AvisoNeutro icone="urna" titulo="Dia de votação">
          {AVISO_DIA_VOTACAO}
        </AvisoNeutro>
      ) : (
        <>
          <FiltroDisputa cargo={cargo} lista={lista} onTrocar={trocarCargo} />
          {q.isLoading ? (
            <Esqueleto />
          ) : q.isError && !q.data ? (
            <AvisoNeutro icone="alerta" titulo="Não foi possível carregar as pesquisas agora">
              Confira a conexão e tente de novo.
              <Button size="sm" variant="secondary" icon="reset" className="mt-3" onClick={() => void q.refetch()} loading={q.isFetching}>
                Tentar de novo
              </Button>
            </AvisoNeutro>
          ) : (
            <Disputa key={cargo} cargo={cargo} pesquisas={daDisputa} todas={lista} destaque={pedida?.id} resultado={resultado} />
          )}
          <ComoEscolhemos />
        </>
      )}
    </Container>
  );
}

function AvisoFixo() {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-[13.5px] leading-snug text-fg sm:text-[14px]">
      <Icon name="info" size={18} className="mt-px shrink-0 text-brand-fg" />
      <span>{AVISO_PESQUISAS}</span>
    </p>
  );
}

function AvisoNeutro({ icone, titulo, children }: { icone: 'info' | 'urna' | 'alerta'; titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
          <Icon name={icone} size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold text-fg">{titulo}</h2>
          <div className="mt-1 text-[14px] leading-relaxed text-fg-muted">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-[300px] rounded-2xl" />
      ))}
    </div>
  );
}

/** Presidente | Governador (+ UF). Quantas pesquisas há em cada disputa. */
function FiltroDisputa({ cargo, lista, onTrocar }: { cargo: CargoPesquisa; lista: Pesquisa[]; onTrocar: (c: CargoPesquisa) => void }) {
  const grupo: Grupo = cargo === 'pres' ? 'pres' : 'gov';
  const n = (c: string) => lista.filter((p) => p.cargo === c).length;
  const nGov = CARGOS_GOV.reduce((t, c) => t + n(c), 0);
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Segmented<Grupo>
        ariaLabel="Disputa"
        value={grupo}
        onChange={(g) => onTrocar(g === 'pres' ? 'pres' : (CARGOS_GOV.find((c) => n(c) > 0) ?? CARGOS_GOV[0]))}
        options={[
          { value: 'pres', label: <Rotulo texto="Presidente" n={n('pres')} /> },
          { value: 'gov', label: <Rotulo texto="Governador" n={nGov} /> },
        ]}
      />
      {grupo === 'gov' ? (
        <div role="group" aria-label="Estado" className="-mx-1 flex flex-wrap gap-1.5">
          {CARGOS_GOV.map((c) => {
            const uf = ufDoCargo(c)!;
            const ativo = c === cargo;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={ativo}
                title={UF_NOMES[uf]}
                onClick={() => onTrocar(c)}
                className={cn(
                  'toque relative inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  ativo ? 'border-brand/50 bg-brand/15 text-fg' : 'border-line bg-surface text-fg-muted hover:text-fg',
                )}
              >
                {uf}
                <span className="num text-[12px] font-medium text-fg-subtle">{n(c)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Rotulo({ texto, n }: { texto: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {texto}
      <span className="num text-[12px] font-medium opacity-70">{n}</span>
    </span>
  );
}

function Disputa({ cargo, pesquisas, todas, destaque, resultado }: { cargo: CargoPesquisa; pesquisas: Pesquisa[]; todas: Pesquisa[]; destaque?: string; resultado: boolean }) {
  const nums = useMemo(() => {
    const p = pesquisas[0];
    return p ? Object.keys(p.totais).filter((k) => /^\d{2}$/.test(k)).map(Number).sort((a, b) => a - b) : [];
  }, [pesquisas]);
  const cands = useCandidatosPesquisa(cargo, nums);
  const [todasAbertas, setTodasAbertas] = useState(false);
  // o link de uma pesquisa (?p=) mais antiga abre a lista inteira
  const iDestaque = destaque ? pesquisas.findIndex((p) => p.id === destaque) : -1;
  const abertas = todasAbertas || iDestaque >= CARTOES_INICIAIS ? pesquisas : pesquisas.slice(0, CARTOES_INICIAIS);
  const ocultas = pesquisas.length - abertas.length;
  const uf = ufDoCargo(cargo);
  const titulo = uf ? `Governador · ${UF_NOMES[uf]}` : 'Presidente';
  if (!pesquisas.length) {
    return (
      <AvisoNeutro icone="info" titulo={`Nenhuma pesquisa publicada aqui · ${titulo}`}>
        Ainda não há pesquisa registrada no TSE publicada nesta página para esta disputa. Assim que um instituto divulgar uma, ela entra aqui com todas as
        informações exigidas e o link da fonte.
      </AvisoNeutro>
    );
  }
  return (
    <>
      {resultado ? <PesquisasResultado pesquisas={todas} cargo={cargo} cands={cands} /> : null}
      <section aria-labelledby="pesq-lista" className="mt-8">
        <h2 id="pesq-lista" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
          {resultado ? 'Todas as pesquisas publicadas aqui' : titulo}
          <span className="num ml-2 whitespace-nowrap align-middle text-[14px] font-medium text-fg-muted">
            {pesquisas.length} {pesquisas.length === 1 ? 'pesquisa' : 'pesquisas'}
          </span>
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">Da mais recente para a mais antiga (data de divulgação). Votos totais incluem brancos, nulos e indecisos.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {abertas.map((p) => (
            <CartaoPesquisa key={p.id} p={p} destaque={p.id === destaque} acoes={<BotaoCompartilharPesquisa p={p} soIcone />} />
          ))}
        </div>
        {ocultas > 0 ? (
          <Button variant="secondary" icon="chevron" className="mt-4 w-full" onClick={() => setTodasAbertas(true)}>
            Ver {ocultas === 1 ? 'a pesquisa mais antiga' : `as ${ocultas} pesquisas mais antigas`}
          </Button>
        ) : null}
      </section>
      <GraficoInstitutos pesquisas={pesquisas} cargo={cargo} cands={cands} />
      <p className="mt-3 text-[12.5px] text-fg-subtle">
        As informações de cada pesquisa (instituto, contratante, registro, coleta, entrevistas, margem de erro e nível de confiança) estão nos cartões acima.
      </p>
    </>
  );
}

function ComoEscolhemos() {
  const itens = [
    'Só pesquisas registradas no TSE, com o número de registro (BR-…/2026 para Presidente; a sigla do estado para Governador). Enquete não entra.',
    'Os números são os que o instituto ou quem contratou divulgou, com o link de onde cada um foi conferido (relatório do instituto, página de quem contratou ou reportagem que publica os dados). Nada é estimado, arredondado de novo ou completado.',
    'Quando o próprio instituto pagou a pesquisa, o contratante aparece como “recursos próprios”.',
    'Cada pesquisa aparece sozinha: o Sintonia não calcula média, projeção nem junta institutos.',
    'Votos válidos só aparecem quando o instituto divulgou.',
    'No dia da votação, das 0h às 17h (horário de Brasília), a área fica sem pesquisas.',
  ];
  return (
    <section aria-labelledby="pesq-criterio" className="mt-12 rounded-2xl border border-line bg-surface-2/40 p-5 sm:p-6">
      <h2 id="pesq-criterio" className="font-display text-[18px] font-semibold text-fg">
        O que entra nesta página
      </h2>
      <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-fg-muted">
        {itens.map((t) => (
          <li key={t} className="flex gap-2.5">
            <Icon name="check" size={16} className="mt-1 shrink-0 text-brand-fg" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-fg-subtle">
        O registro de cada pesquisa pode ser conferido no sistema PesqEle, na página do{' '}
        <a href="https://www.tse.jus.br" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-fg underline-offset-2 hover:underline">
          TSE
        </a>
        .
      </p>
    </section>
  );
}
