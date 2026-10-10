/**
 * /candidato/:sqcand — ficha pública do candidato (dados abertos do TSE: consulta_cand, bem_candidato e resultado
 * do 1º turno). Textos neutros e factuais: só o que a Justiça Eleitoral publica, sem adjetivos.
 * Foto oficial (dado real: aparece mesmo com a simulação anonimizada, que só afeta números fictícios da apuração).
 */
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CandidatoFicha } from '@/shared/dataset';
import type { UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtCompact, fmtInt, fmtPct } from '@/shared/format';
import { compartilhar, urlAbsoluta } from '@/app/lib/share';
import { Button, ButtonLink } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';
import { toast } from '@/app/ui/Toast';
import { Container } from '@/app/components/layout/Container';
import { Breadcrumbs } from '@/app/components/layout/Breadcrumbs';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { NaoEncontrado } from '@/app/components/pages/detalhe/NaoEncontrado';
import { abrirBusca } from '@/app/components/busca/BuscaRapida';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { FotoOficial } from '@/app/components/pages/cargos/FotoOficial';
import { PartidoChip, SituacaoSelo, FonteTse } from '@/app/components/pages/cargos/ui';
import { cargoExibicao, ehEleito, fmtBens, fmtReais, rotuloSituacao, rotuloSituacaoCurto, useFicha, useFichasGrupo, useIndiceCandidatos } from '@/app/components/pages/cargos/dados';

/** Página do cargo (para a trilha e o "ver todos"). */
function rotaCargo(f: CandidatoFicha): { to: string; label: string } {
  const uf = f.uf === 'BR' ? null : (f.uf as UF);
  if (/^Senador/.test(f.cargo)) return { to: `/senado${uf ? `?uf=${uf.toLowerCase()}` : ''}`, label: 'Senado' };
  if (/^Deputado Federal/.test(f.cargo)) return { to: `/camara${uf ? `?uf=${uf.toLowerCase()}` : ''}`, label: 'Câmara dos Deputados' };
  if (/^Deputado (Estadual|Distrital)/.test(f.cargo)) return { to: `/assembleias${uf ? `/${uf.toLowerCase()}` : ''}`, label: uf === 'DF' ? 'Câmara Legislativa' : 'Assembleias' };
  if (/Governador/.test(f.cargo)) return { to: '/governadores', label: 'Governadores' };
  return { to: '/apuracao', label: 'Apuração' };
}

/** "1963-06-28" → "28/06/1963". */
function fmtData(iso?: string): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export default function CandidatoPage() {
  const { sqcand = '' } = useParams();
  const valido = /^\d{6,16}$/.test(sqcand);
  const { ficha: f, grupo, carregando, naoEncontrada, erro, refetch } = useFicha(valido ? sqcand : undefined);
  const grupoQ = useFichasGrupo(grupo);
  // vice: a ficha do titular da chapa (mesmo grupo, com `vice.sqcand` = este)
  const titular = f && /^Vice/.test(f.cargo) ? grupoQ.fichas.find((x) => x.vice?.sqcand === f.sqcand) : undefined;
  const indice = useIndiceCandidatos(!!f);
  useTitulo(f ? `${f.nomeUrna} · ${cargoExibicao(f.cargo, f.genero)}` : 'Ficha do candidato');

  if (!valido || naoEncontrada) {
    return (
      <Container wide className="py-8 sm:py-12">
        <NaoEncontrado
          icon="usuarios"
          titulo="Ficha não encontrada"
          descricao="Publicamos as fichas dos eleitos no 1º turno, dos candidatos ao 2º turno e de todos os candidatos ao Senado. Procure pelo nome na busca rápida."
          acoes={
            <>
              <Button variant="primary" icon="busca" onClick={abrirBusca}>
                Buscar pelo nome
              </Button>
              <ButtonLink to="/senado" variant="outline">
                Senado
              </ButtonLink>
              <ButtonLink to="/camara" variant="outline">
                Câmara
              </ButtonLink>
            </>
          }
        />
      </Container>
    );
  }
  if (erro && !f) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => refetch()} />
      </Container>
    );
  }
  if (carregando || !f) {
    return (
      <Container>
        <LoadingState variant="pagina" />
      </Container>
    );
  }

  const cargo = cargoExibicao(f.cargo, f.genero);
  const local = f.uf === 'BR' ? 'Brasil' : UF_NOMES[f.uf as UF];
  const rc = rotaCargo(f);
  const r = f.resultado;
  const nascimento = fmtData(f.nascimento);
  const viceTem = f.vice?.sqcand && indice.porSq.has(f.vice.sqcand);
  const ehVice = /^Vice/.test(f.cargo);

  async function compartilharFicha() {
    const res = await compartilhar({
      titulo: `${f!.nomeUrna} · ficha`,
      texto: `${f!.nomeUrna} (${f!.partido}) · ${cargo}${f!.uf !== 'BR' ? ` · ${f!.uf}` : ''}: ficha com os dados públicos do TSE.`,
      url: urlAbsoluta(`/candidato/${f!.sqcand}`),
    });
    if (res === 'copiado') toast('Link copiado', { tone: 'ok', icon: 'link' });
    else if (res === 'erro') toast('Não foi possível compartilhar', { tone: 'alert' });
  }

  return (
    <Container>
      <div className="pb-4 pt-5 sm:pb-5 sm:pt-8">
        <Breadcrumbs items={[{ label: rc.label, to: rc.to }, { label: f.nomeUrna }]} />
      </div>

      {/* ------------------------------------------------------------ cabeçalho da ficha */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
          <FotoOficial sqcand={f.sqcand} fotoGrupo={f.fotoGrupo} nome={f.nomeUrna} tamanho="retrato" className="shadow-card" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
              {cargo} · {local} · 2026
            </p>
            <h1 className="mt-1.5 text-balance font-display text-[32px] font-semibold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">
              {f.nomeUrna}
            </h1>
            <p className="mt-1.5 text-[15px] text-fg-muted">{f.nome}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-8 items-center rounded-lg border border-line bg-surface-2 px-2.5 font-mono text-[15px] font-semibold text-fg">
                <span className="sr-only">Número </span>
                {f.numero}
              </span>
              <PartidoChip sigla={f.partido} className="text-[14px]" />
              {r ? <SituacaoSelo situacao={r.situacao} genero={f.genero} className="h-6 text-[11px]" /> : null}
            </div>
            {r && !ehVice ? (
              <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-line pt-4">
                <div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Votos no 1º turno</p>
                  <p className="num mt-1 font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg">{fmtInt(r.votos)}</p>
                </div>
                <div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-fg-muted">% dos válidos</p>
                  <p className="num mt-1 font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg">{fmtPct(r.pct)}</p>
                </div>
                {rotuloSituacao(r.situacao, f.genero) !== rotuloSituacaoCurto(r.situacao, f.genero) ? (
                  <p className="pb-0.5 text-[13px] text-fg-muted">{rotuloSituacao(r.situacao, f.genero)}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <Button variant="secondary" size="sm" icon="compartilhar" onClick={compartilharFicha}>
              Compartilhar
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* -------------------------------------------------------- candidatura */}
        <Cartao titulo="Candidatura" icone="urna">
          <Lista>
            <Item rotulo="Cargo" valor={`${cargo} · ${local}`} />
            <Item rotulo="Partido" valor={f.partido} />
            {titular ? (
              <Item
                rotulo="Chapa de"
                valor={
                  <Link to={`/candidato/${titular.sqcand}`} className="underline decoration-line/[3] underline-offset-[3px] hover:text-brand-fg">
                    {titular.nomeUrna} <span className="text-fg-muted">({titular.partido})</span>
                  </Link>
                }
              />
            ) : null}
            {f.federacao ? <Item rotulo="Federação" valor={f.federacao} /> : null}
            {f.coligacao ? <Item rotulo="Coligação" valor={f.coligacao} /> : null}
            {f.composicao ? <Item rotulo="Composição" valor={f.composicao} /> : null}
            {f.vice ? (
              <Item
                rotulo={/Presidente/.test(f.cargo) ? 'Vice-presidente' : 'Vice'}
                valor={
                  <>
                    {viceTem ? (
                      <Link to={`/candidato/${f.vice.sqcand}`} className="underline decoration-line/[3] underline-offset-[3px] hover:text-brand-fg">
                        {f.vice.nome}
                      </Link>
                    ) : (
                      f.vice.nome
                    )}
                    {f.vice.partido ? <span className="text-fg-muted"> ({f.vice.partido})</span> : null}
                  </>
                }
              />
            ) : null}
            {f.suplentes?.length
              ? f.suplentes.map((s, i) => (
                  <Item
                    key={s.nome}
                    rotulo={`${i + 1}º suplente`}
                    valor={
                      <>
                        {s.nome}
                        {s.partido ? <span className="text-fg-muted"> ({s.partido})</span> : null}
                      </>
                    }
                  />
                ))
              : null}
          </Lista>
        </Cartao>

        {/* -------------------------------------------------------- perfil */}
        <Cartao titulo="Perfil" icone="usuarios">
          <Lista>
            {f.idade !== undefined ? (
              <Item
                rotulo="Idade"
                valor={
                  <>
                    <span className="num">{f.idade}</span> anos{nascimento ? <span className="num text-fg-muted"> · nascimento em {nascimento}</span> : null}
                  </>
                }
              />
            ) : null}
            {f.genero ? <Item rotulo="Gênero" valor={f.genero} /> : null}
            {f.corRaca ? <Item rotulo="Cor/raça (autodeclarada)" valor={f.corRaca} /> : null}
            {f.ocupacao ? <Item rotulo="Ocupação declarada" valor={f.ocupacao} /> : null}
            {f.escolaridade ? <Item rotulo="Grau de instrução" valor={f.escolaridade} /> : null}
            {f.estadoCivil ? <Item rotulo="Estado civil" valor={f.estadoCivil} /> : null}
            {f.naturalidade ? <Item rotulo="Naturalidade" valor={f.naturalidade} /> : null}
          </Lista>
        </Cartao>

        {/* -------------------------------------------------------- patrimônio */}
        <Cartao titulo="Patrimônio declarado" icone="selo">
          {f.patrimonio && f.patrimonio.itens > 0 ? (
            <>
              <p className="num font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[32px]">
                {fmtReais(f.patrimonio.total)}
              </p>
              <p className="num mt-2 text-[13.5px] text-fg-muted">
                {fmtBens(f.patrimonio.itens)}
                {f.patrimonio.total >= 10_000 ? <> · cerca de R$ {fmtCompact(f.patrimonio.total)}</> : null}
              </p>
            </>
          ) : (
            <p className="text-[14px] text-fg-muted">Nenhum bem declarado à Justiça Eleitoral.</p>
          )}
          <p className="mt-4 text-[12px] leading-snug text-fg-subtle">
            Soma dos valores informados pelo próprio candidato na declaração de bens entregue ao TSE no registro da candidatura
            (dados abertos “bem_candidato_2026”). Os valores não são atualizados nem conferidos pela Justiça Eleitoral.
          </p>
        </Cartao>

        {/* -------------------------------------------------------- resultado */}
        <Cartao titulo="Resultado no 1º turno" icone="grafico">
          {r && !ehVice ? (
            <>
              <Lista>
                <Item rotulo="Votos" valor={<span className="num">{fmtInt(r.votos)}</span>} />
                <Item rotulo="% dos votos válidos" valor={<span className="num">{fmtPct(r.pct)}</span>} />
                <Item rotulo="Situação" valor={rotuloSituacao(r.situacao, f.genero)} />
              </Lista>
              {r.situacao === 'segundo-turno' ? (
                <ButtonLink to={/Governador/.test(f.cargo) ? '/governadores' : '/apuracao'} variant="secondary" size="sm" icon="ao-vivo" className="mt-4">
                  Apuração do 2º turno
                </ButtonLink>
              ) : (
                <ButtonLink to={rc.to} variant="ghost" size="sm" iconRight="seta" className="mt-3 -ml-2">
                  {ehEleito(r.situacao) || r.situacao === 'nao-eleito' || r.situacao === 'suplente' ? `Todos os resultados · ${rc.label}` : rc.label}
                </ButtonLink>
              )}
            </>
          ) : ehVice ? (
            <p className="text-[14px] text-fg-muted">Compõe a chapa do titular; os votos são contados para a chapa.</p>
          ) : (
            <p className="text-[14px] text-fg-muted">Resultado não disponível.</p>
          )}
        </Cartao>
      </div>

      <FonteTse className="mt-5">
        Dados públicos do TSE: registro de candidatura (consulta_cand_2026), declaração de bens (bem_candidato_2026) e resultado oficial do 1º
        turno (4 de outubro de 2026). Foto oficial da Justiça Eleitoral, sem edição.
      </FonteTse>
    </Container>
  );
}

function Cartao({ titulo, icone, children }: { titulo: string; icone: IconName; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        <Icon name={icone} size={15} />
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Lista({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

function Item({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-[13px] text-fg-muted">{rotulo}</dt>
      <dd className="min-w-0 text-pretty text-[14px] font-medium text-fg">{valor}</dd>
    </div>
  );
}
