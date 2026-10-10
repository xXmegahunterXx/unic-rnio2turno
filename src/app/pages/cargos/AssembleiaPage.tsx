/**
 * /assembleias e /assembleias/:uf — Assembleias Legislativas e Câmara Legislativa do DF (1º turno, oficial).
 *
 *  /assembleias:      eleitos por partido nas 27 casas (barra + grade), maior bancada em cada UF e a composição
 *                     de cada casa (toque → detalhe).
 *  /assembleias/:uf:  hemiciclo da casa, bancadas, eleitos com foto oficial (nome → ficha) e mais votados não eleitos.
 *  AM: o TSE está reprocessando a totalização — cadeiras "aguardando" e aviso discreto.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt } from '@/shared/format';
import { useCargo } from '@/app/data/estatico';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Select } from '@/app/ui/Select';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { NaoEncontrado } from '@/app/components/pages/detalhe/NaoEncontrado';
import { deUf } from '@/app/components/pages/detalhe/fmt';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { NavCargos } from '@/app/components/pages/cargos/NavCargos';
import { EleitosUf, VisaoComposicao, useComposicao } from '@/app/components/pages/cargos/CargoProporcional';
import { UfsComposicao } from '@/app/components/pages/cargos/UfsComposicao';
import { BancadasGrade, BarraComposicao } from '@/app/components/pages/cargos/Bancadas';
import { useIndiceCandidatos } from '@/app/components/pages/cargos/dados';
import { AvisoTse, FonteTse, textoReprocessamento } from '@/app/components/pages/cargos/ui';
import { BotaoCompartilharComposicao } from '@/app/components/share/cartoes/Cargos';
import { hashtags } from '@/app/components/share/textos';

/** Nome da casa legislativa da UF. */
function nomeCasa(uf: UFBr): string {
  return uf === 'DF' ? 'Câmara Legislativa do Distrito Federal' : `Assembleia Legislativa ${deUf(uf, UF_NOMES[uf])}`;
}

export default function AssembleiaPage() {
  const { uf: ufRaw } = useParams();
  const navigate = useNavigate();
  const U = ufRaw?.toUpperCase();
  const uf = U && (UFS as readonly string[]).includes(U) ? (U as UFBr) : null;
  const invalida = !!ufRaw && !uf;
  useTitulo(uf ? nomeCasa(uf) : 'Assembleias Legislativas · 1º turno');
  const q = useCargo('assembleia');
  const indice = useIndiceCandidatos();
  const comFicha = useCallback((sq: string) => indice.porSq.has(sq), [indice.porSq]);
  const comp = useComposicao(q.data, uf, comFicha);

  const totalBr = useMemo(() => (q.data ? q.data.ufs.reduce((a, u) => a + u.vagas, 0) : 0), [q.data]);
  const compBr = useMemo(
    () => (q.data?.composicao ?? []).map((c) => ({ sigla: c.sigla, eleitos: c.eleitos })).sort((a, b) => b.eleitos - a.eleitos),
    [q.data],
  );
  const eleitosBr = compBr.reduce((a, b) => a + b.eleitos, 0);
  const avisosBr = useMemo(
    () => (q.data?.ufs ?? []).filter((u) => (u as { aviso?: string }).aviso).map((u) => ({ uf: u.uf as UFBr, aviso: (u as { aviso?: string }).aviso! })),
    [q.data],
  );

  if (invalida) {
    return (
      <Container wide className="py-8 sm:py-12">
        <NaoEncontrado
          icon="pin"
          titulo="Estado não encontrado"
          descricao={
            <>
              Não há UF com a sigla <span className="font-mono font-semibold text-fg">{ufRaw}</span>.
            </>
          }
          acoes={
            <ButtonLink to="/assembleias" variant="primary" icon="seta-esquerda">
              Todas as Assembleias
            </ButtonLink>
          }
        />
      </Container>
    );
  }
  if (q.isError) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }
  if (!q.data || (uf && !comp)) {
    return (
      <Container wide>
        <LoadingState variant="pagina" />
      </Container>
    );
  }

  const seletor = (
    <Select
      aria-label="Escolher a Assembleia de um estado"
      value={uf ?? ''}
      onChange={(e) => navigate(e.target.value ? `/assembleias/${e.target.value.toLowerCase()}` : '/assembleias')}
      options={[
        { value: '', label: `Todas as ${UFS.length} casas` },
        ...[...UFS]
          .sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'))
          .map((u) => ({ value: u, label: `${UF_NOMES[u]} · ${q.data!.ufs.find((x) => x.uf === u)?.vagas ?? ''} cadeiras` })),
      ]}
      wrapperClassName="w-full sm:w-[280px]"
    />
  );

  const eyebrow = (
    <span className="inline-flex items-center gap-1.5">
      <Icon name="selo" size={14} /> 1º turno · resultado oficial
    </span>
  );

  if (uf && comp) {
    const distrital = uf === 'DF';
    return (
      <Container wide>
        <PageHeader
          breadcrumbs={[{ label: 'Assembleias', to: '/assembleias' }, { label: UF_NOMES[uf] }]}
          eyebrow={eyebrow}
          title={nomeCasa(uf)}
          subtitle={
            comp.eleitos.length === 0 ? (
              // Totalização em reprocessamento no TSE (ex.: AM): ainda não há eleitos divulgados.
              <>
                <span className="num">{fmtInt(comp.total)}</span> {distrital ? 'deputados distritais' : 'deputados estaduais'}, eleitos pelo
                sistema proporcional para mandatos de 4 anos. O TSE ainda não divulgou os eleitos de 4 de outubro.
              </>
            ) : (
              <>
                <span className="num">{fmtInt(comp.total)}</span> {distrital ? 'deputados distritais' : 'deputados estaduais'} eleitos em 4 de
                outubro pelo sistema proporcional, para mandatos de 4 anos.
              </>
            )
          }
          actions={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="min-w-0 flex-1 sm:flex-none">{seletor}</div>
              <BotaoCompartilharComposicao
                casa={nomeCasa(uf)}
                subtitulo={`${fmtInt(comp.total)} ${distrital ? 'deputados distritais' : 'deputados estaduais'} eleitos em 4 de outubro`}
                bancadas={comp.bancadas}
                total={comp.total}
                rotuloCentro={distrital ? 'deputados distritais' : 'deputados estaduais'}
                caminho={`/assembleias/${uf.toLowerCase()}`}
                tags={hashtags('assembleia')}
                nomeArquivo={`sintonia-assembleia-${uf.toLowerCase()}`}
                soIcone
                size="md"
                className="shrink-0 border border-line"
              />
            </div>
          }
        >
          <NavCargos atual="assembleias" />
        </PageHeader>
        <VisaoComposicao
          comp={comp}
          titulo={
            <>
              <span className="num">{fmtInt(comp.total)}</span> cadeiras
            </>
          }
          rotuloCentro={distrital ? 'deputados distritais' : 'deputados estaduais'}
        />
        <Section
          id="eleitos"
          title={
            <>
              {comp.eleitos.length ? (
                <>
                  Os <span className="num">{fmtInt(comp.eleitos.length)}</span> eleitos
                </>
              ) : (
                'Eleitos'
              )}
            </>
          }
          description="Foto oficial, partido, votos e a forma de eleição. Toque no nome para ver a ficha."
        >
          <EleitosUf cargo="assembleia" uf={uf} comp={comp} rotuloCargo={distrital ? 'deputados distritais' : 'deputados estaduais'} />
        </Section>
        <FonteTse className="mt-2" />
      </Container>
    );
  }

  return (
    <Container wide>
      <PageHeader
        eyebrow={eyebrow}
        title="Assembleias Legislativas"
        subtitle={
          <>
            <span className="num">{fmtInt(totalBr)}</span> deputados estaduais e distritais eleitos em 4 de outubro nas{' '}
            <span className="num">26</span> Assembleias e na Câmara Legislativa do DF.
          </>
        }
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="min-w-0 flex-1 sm:flex-none">{seletor}</div>
            <BotaoCompartilharComposicao
              casa="Assembleias Legislativas"
              subtitulo="Deputados estaduais e distritais eleitos nas 27 casas"
              bancadas={compBr}
              total={totalBr}
              rotuloCentro="deputados"
              caminho="/assembleias"
              tags={hashtags('assembleia')}
              nomeArquivo="sintonia-assembleias-2026"
              soIcone
              size="md"
              className="shrink-0 border border-line"
            />
          </div>
        }
      >
        <NavCargos atual="assembleias" />
      </PageHeader>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6" aria-labelledby="partidos-assembleias">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="partidos-assembleias" className="font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">
            Eleitos por partido nas <span className="num">27</span> casas
          </h2>
          <span className="num text-[12.5px] text-fg-muted">
            {fmtInt(eleitosBr)} de {fmtInt(totalBr)} cadeiras · maior primeiro
          </span>
        </div>
        <BarraComposicao bancadas={compBr} pendentes={Math.max(0, totalBr - eleitosBr)} className="mt-4 h-4" />
        <BancadasGrade
          bancadas={compBr}
          total={totalBr}
          pendentes={Math.max(0, totalBr - eleitosBr)}
          rotuloPendentes={avisosBr.length ? `Aguardando (${avisosBr.map((a) => a.uf).join(', ')})` : 'Aguardando'}
          className="mt-4"
        />
        {avisosBr.length ? <AvisoTse className="mt-4">{textoReprocessamento(avisosBr[0].uf, avisosBr[0].aviso)}</AvisoTse> : null}
      </section>

      <Section id="casas" title="Cada casa" description="Maior bancada e composição de cada Assembleia. Toque para ver os eleitos.">
        <UfsComposicao data={q.data} onSelect={(u) => navigate(`/assembleias/${u.toLowerCase()}`)} rotuloCasa={(u) => (u === 'DF' ? 'Câmara Legislativa' : `Assembleia · ${u}`)} />
      </Section>
      <FonteTse className="mt-2" />
    </Container>
  );
}
