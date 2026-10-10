/**
 * /camara (?uf=) — Câmara dos Deputados no 1º turno de 2026 (resultado oficial).
 *
 *  Brasil: hemiciclo das 513 cadeiras por partido (cores neutras, maior bancada à esquerda) + ranking de bancadas,
 *          mais votados do país e a visão por estado (maior bancada + composição de cada UF).
 *  UF:     hemiciclo e bancadas da UF, eleitos com foto oficial (nome → ficha) e mais votados não eleitos.
 *  AM: o TSE está reprocessando a totalização — cadeiras "aguardando" e aviso discreto.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt } from '@/shared/format';
import { useCargo } from '@/app/data/estatico';
import { Icon } from '@/app/ui/Icon';
import { Select } from '@/app/ui/Select';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { deUf } from '@/app/components/pages/detalhe/fmt';
import { NavCargos } from '@/app/components/pages/cargos/NavCargos';
import { EleitosUf, MaisVotadosPais, VisaoComposicao, useComposicao } from '@/app/components/pages/cargos/CargoProporcional';
import { UfsComposicao } from '@/app/components/pages/cargos/UfsComposicao';
import { useIndiceCandidatos } from '@/app/components/pages/cargos/dados';
import { FonteTse } from '@/app/components/pages/cargos/ui';
import { BotaoCompartilharComposicao } from '@/app/components/share/cartoes/Cargos';
import { hashtags } from '@/app/components/share/textos';

export default function CamaraPage() {
  const q = useCargo('camara');
  const indice = useIndiceCandidatos();
  const [params, setParams] = useSearchParams();
  const ufRaw = params.get('uf')?.toUpperCase();
  const uf = ufRaw && (UFS as readonly string[]).includes(ufRaw) ? (ufRaw as UFBr) : null;
  useTitulo(uf ? `Câmara dos Deputados · ${UF_NOMES[uf]}` : 'Câmara dos Deputados · 1º turno');
  const comFicha = useCallback((sq: string) => indice.porSq.has(sq), [indice.porSq]);
  const comp = useComposicao(q.data, uf, comFicha);

  const escolherUf = (u: UFBr | null) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (u) p.set('uf', u.toLowerCase());
        else p.delete('uf');
        return p;
      },
      { preventScrollReset: false },
    );
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (q.isError) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }
  if (!q.data || !comp) {
    return (
      <Container wide>
        <LoadingState variant="pagina" />
      </Container>
    );
  }

  const seletor = (
    <Select
      aria-label="Ver a Câmara por estado"
      value={uf ?? ''}
      onChange={(e) => escolherUf((e.target.value || null) as UFBr | null)}
      options={[
        { value: '', label: 'Brasil · 513 cadeiras' },
        ...[...UFS]
          .sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'))
          .map((u) => ({ value: u, label: `${UF_NOMES[u]} · ${q.data!.ufs.find((x) => x.uf === u)?.vagas ?? ''} cadeiras` })),
      ]}
      wrapperClassName="w-full sm:w-[280px]"
    />
  );

  return (
    <Container wide>
      <PageHeader
        breadcrumbs={uf ? [{ label: 'Câmara dos Deputados', to: '/camara' }, { label: UF_NOMES[uf] }] : undefined}
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Icon name="selo" size={14} /> {uf ? 'Câmara dos Deputados · ' : ''}1º turno · resultado oficial
          </span>
        }
        title={uf ? UF_NOMES[uf] : 'Câmara dos Deputados'}
        subtitle={
          uf ? (
            comp.eleitos.length === 0 ? (
              // Totalização em reprocessamento no TSE (ex.: AM): ainda não há eleitos divulgados.
              <>
                {UF_NOMES[uf]} tem <span className="num">{fmtInt(comp.total)}</span> das <span className="num">513</span> cadeiras da Câmara,
                preenchidas pelo sistema proporcional. O TSE ainda não divulgou os eleitos de 4 de outubro.
              </>
            ) : (
              <>
                {UF_NOMES[uf]} elegeu <span className="num">{fmtInt(comp.total)}</span> dos <span className="num">513</span> deputados
                federais, pelo sistema proporcional (quociente eleitoral e partidário).
              </>
            )
          ) : (
            <>
              Os <span className="num">513</span> deputados federais eleitos em 4 de outubro. Cada estado tem de{' '}
              <span className="num">8</span> a <span className="num">70</span> cadeiras, conforme a população.
            </>
          )
        }
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="min-w-0 flex-1 sm:flex-none">{seletor}</div>
            <BotaoCompartilharComposicao
              casa={uf ? `Câmara dos Deputados · ${UF_NOMES[uf]}` : 'Câmara dos Deputados'}
              subtitulo={
                uf
                  ? `A bancada ${deUf(uf, UF_NOMES[uf])}: ${fmtInt(comp.total)} das 513 cadeiras`
                  : 'Os 513 deputados federais eleitos em 4 de outubro'
              }
              bancadas={comp.bancadas}
              total={comp.total}
              rotuloCentro={uf ? 'deputados federais' : 'deputados'}
              caminho={uf ? `/camara?uf=${uf.toLowerCase()}` : '/camara'}
              tags={hashtags('camara')}
              nomeArquivo={uf ? `sintonia-camara-${uf.toLowerCase()}` : 'sintonia-camara-2026'}
              soIcone
              size="md"
              className="shrink-0 border border-line"
            />
          </div>
        }
      >
        <NavCargos atual="camara" />
      </PageHeader>

      <VisaoComposicao
        comp={comp}
        titulo={
          <>
            <span className="num">{fmtInt(comp.total)}</span> cadeiras{uf ? ` ${deUf(uf, UF_NOMES[uf])}` : ''}
          </>
        }
        rotuloCentro={uf ? 'deputados federais' : 'deputados'}
      />

      {uf ? (
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
          <EleitosUf cargo="camara" uf={uf} comp={comp} rotuloCargo="deputados federais" />
        </Section>
      ) : (
        <>
          <Section id="mais-votados" title="Mais votados do país" description="Os deputados federais eleitos com mais votos em 2026." card>
            <MaisVotadosPais comp={comp} n={12} />
          </Section>
          <Section id="estados" title="Por estado" description="A composição da bancada de cada UF na Câmara.">
            <UfsComposicao data={q.data} onSelect={(u) => escolherUf(u)} />
          </Section>
        </>
      )}
      <FonteTse className="mt-2" />
    </Container>
  );
}
