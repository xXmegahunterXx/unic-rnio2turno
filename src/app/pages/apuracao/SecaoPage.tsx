/**
 * /apuracao/:uf/:cod/:zona/:secao?race= — Boletim de Urna de uma seção.
 *
 * O BU em destaque (recibo), navegação para a seção anterior/próxima da mesma zona, compartilhar,
 * "guardar como minha seção" e o contexto (como votaram a zona e o município, participação, a posição
 * da seção no mosaico da zona). Seção ainda não totalizada: dizemos só isso (sem estimar horário).
 * Seção/zona inexistente: 404 amigável com link para a Consulta. O BU em destaque é o do 2º turno; ao lado,
 * o LOCAL DE VOTAÇÃO (com links de mapa) e o boletim REAL da seção no 1º turno (resultado oficial).
 */
import { useMemo, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SecaoDetalhe, Tally } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { validos } from '@/shared/calc';
import { fmtHoraSeg, fmtInt } from '@/shared/format';
import { useMunicipio, useSecao, useZona } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { compartilhar, copiarLink, urlAbsoluta } from '@/app/lib/share';
import { Button, ButtonLink, Icon, toast } from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { BoletimUrna } from '@/app/components/apuracao/BoletimUrna';
import { SecaoMosaic } from '@/app/components/apuracao/SecaoMosaic';
import { ErrorState } from '@/app/components/apuracao/States';
import {
  ehNaoEncontrado,
  ehT1,
  parseUf,
  rotaBrasil,
  rotaMun,
  rotaSecao,
  rotaUf,
  useDetalheRace,
} from '@/app/components/pages/detalhe/useDetalhe';
import { PreApuracaoAviso } from '@/app/components/pages/detalhe/FaseAviso';
import { NaoEncontrado } from '@/app/components/pages/detalhe/NaoEncontrado';
import { EsqueletoSecao } from '@/app/components/pages/detalhe/Esqueletos';
import {
  ComparaAbrangencias,
  ParticipacaoComparada,
  fraseDiferenca,
  type Abrangencia,
} from '@/app/components/pages/detalhe/SecaoContexto';
import { mesmaSecao, useMinhaSecao } from '@/app/components/pages/detalhe/minhaSecao';
import { emMun, emUf, fmt4 } from '@/app/components/pages/detalhe/fmt';
import { NomesOcultos } from '@/app/components/pages/detalhe/NomesOcultos';
import { LocalVotacaoCartao } from '@/app/components/pages/detalhe/LocalVotacao';
import { PrimeiroTurnoSecao } from '@/app/components/pages/detalhe/PrimeiroTurnoSecao';

/** SecaoDetalhe → Tally (para os cálculos de calc.ts). */
function tallySecao(s: SecaoDetalhe): Tally {
  const tot = s.totalizada;
  return {
    secoes: 1,
    secoesTotalizadas: tot ? 1 : 0,
    eleitorado: s.aptos,
    eleitoradoTotalizado: tot ? s.aptos : 0,
    comparecimento: tot ? s.comparecimento : 0,
    abstencao: tot ? s.abstencao : 0,
    votos: tot ? s.votos : s.votos.map(() => 0),
    brancos: tot ? s.brancos : 0,
    nulos: tot ? s.nulos : 0,
  };
}

export default function SecaoPage() {
  const { uf: ufRaw, cod: codRaw = '', zona: zonaRaw = '', secao: secaoRaw = '' } = useParams();
  const uf = parseUf(ufRaw);
  const cod = /^\d+$/.test(codRaw) ? codRaw.padStart(5, '0') : codRaw;
  const zona = /^\d+$/.test(zonaRaw) ? Number(zonaRaw) : undefined;
  const secao = /^\d+$/.test(secaoRaw) ? Number(secaoRaw) : undefined;
  const ctx = useDetalheRace(uf);
  const navigate = useNavigate();
  // Boletim só existe no 2º turno: um link com "-t1" mostra o BU do 2º turno da mesma disputa.
  const raceId = ctx.idT2;
  const pediuT1 = ehT1(ctx.pedida);

  const qSec = useSecao(raceId, uf ?? undefined, cod || undefined, zona, secao);
  const qZona = useZona(raceId, uf ?? undefined, cod || undefined, zona);
  const qMun = useMunicipio(raceId, uf ?? undefined, cod || undefined);
  const [minha, setMinha] = useMinhaSecao();

  const sec =
    qSec.data && qSec.data.uf === uf && qSec.data.cod === cod && qSec.data.zona === zona && qSec.data.secao === secao
      ? qSec.data
      : undefined;
  const zSnap = qZona.data && qZona.data.cod === cod && qZona.data.zona === zona && qZona.data.race === raceId ? qZona.data : undefined;
  const mSnap = qMun.data && qMun.data.cod === cod && qMun.data.uf === uf && qMun.data.race === raceId ? qMun.data : undefined;
  const race = ctx.raceT2;

  const vizinhas = useMemo(() => {
    if (!zSnap || secao === undefined) return { ant: null as number | null, prox: null as number | null, pos: -1, total: 0 };
    const nums = zSnap.secoes.map((s) => s.secao).sort((a, b) => a - b);
    const i = nums.indexOf(secao);
    return { ant: i > 0 ? nums[i - 1] : null, prox: i >= 0 && i < nums.length - 1 ? nums[i + 1] : null, pos: i, total: nums.length };
  }, [zSnap, secao]);

  const mosaicoZona = useMemo(() => (mSnap ? mSnap.mosaico.filter((z) => z.zona === zona) : []), [mSnap, zona]);
  // Corridas de 1º turno desta UF (Presidente e, se houver, Governador), a da página primeiro.
  const racesT1 = useMemo(() => {
    if (!uf || !ctx.races) return [];
    const lista = ctx.races.filter((r) => r.turno === 1 && (r.abrangencia === 'BR' || r.abrangencia === uf) && r.ufs.includes(uf));
    return lista.sort((a, b) => Number(b.id === ctx.idT1) - Number(a.id === ctx.idT1));
  }, [ctx.races, ctx.idT1, uf]);

  const nomeUf = uf ? UF_NOMES[uf] : '';
  const erroSec = qSec.error ?? qSec.failureReason;
  const erroMun = qMun.error ?? qMun.failureReason;
  const naoExiste =
    !uf ||
    zona === undefined ||
    secao === undefined ||
    (ehNaoEncontrado(erroSec) && !sec) ||
    (qSec.isSuccess && qSec.data === null) ||
    (ehNaoEncontrado(erroMun) && !mSnap);

  // Seção inexistente, mas o município ainda carregando: espera para dizer o nível certo (município/zona/seção).
  const aguardandoMun = !!uf && zona !== undefined && secao !== undefined && !mSnap && !erroMun && !qMun.isError;

  // ---------------------------------------------------------------- 404
  if (naoExiste && !aguardandoMun) {
    const munExiste = !!mSnap;
    const consulta = `/apuracao/consulta${uf ? `?uf=${uf.toLowerCase()}${munExiste ? `&mun=${cod}` : ''}${munExiste && zona !== undefined && mSnap?.zonas.some((z) => z.zona === zona) ? `&zona=${zona}` : ''}` : ''}`;
    const zonaExiste = !!mSnap && zona !== undefined && mSnap.zonas.some((z) => z.zona === zona);
    return (
      <Container wide className="py-8 sm:py-12">
        <NaoEncontrado
          icon="urna"
          titulo={!munExiste ? 'Município não encontrado' : !zonaExiste ? 'Zona não encontrada' : 'Seção não encontrada'}
          descricao={
            !uf ? (
              'Este endereço não corresponde a nenhum estado.'
            ) : !munExiste ? (
              <>
                Não há município com o código <span className="font-mono font-semibold text-fg">{codRaw}</span> {emUf(uf, nomeUf)}.
              </>
            ) : !zonaExiste ? (
              <>
                {mSnap!.nome} ({uf}) não tem a zona <span className="font-mono font-semibold text-fg">{zonaRaw}</span>. Confira o número no
                seu título de eleitor ou no app e-Título.
              </>
            ) : (
              <>
                A zona {fmt4(zona!)} de {mSnap!.nome} ({uf}) não tem a seção{' '}
                <span className="font-mono font-semibold text-fg">{secaoRaw}</span>. Confira o número no seu título de eleitor ou no app
                e-Título — seções agregadas a outras não têm boletim próprio.
              </>
            )
          }
          acoes={
            <>
              <ButtonLink to={consulta} variant="primary" icon="busca">
                Consultar minha seção
              </ButtonLink>
              {uf && munExiste ? (
                <ButtonLink to={rotaMun(uf, cod, ctx.pedida, zonaExiste ? zona : null)} variant="outline">
                  Seções de {mSnap!.nome}
                </ButtonLink>
              ) : (
                <ButtonLink to={uf ? rotaUf(uf, ctx.pedida) : '/apuracao'} variant="outline">
                  {uf ? `Municípios de ${nomeUf}` : 'Placar do Brasil'}
                </ButtonLink>
              )}
            </>
          }
        />
      </Container>
    );
  }

  if (qSec.isError && !sec && !ehNaoEncontrado(erroSec)) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => qSec.refetch()} />
      </Container>
    );
  }
  if (!sec || !race) {
    return (
      <Container wide>
        <EsqueletoSecao />
      </Container>
    );
  }

  // ---------------------------------------------------------------- dados prontos
  const nomeMun = sec.nomeMunicipio;
  const exterior = uf === 'ZZ';
  const tSec = tallySecao(sec);
  const salva = mesmaSecao(minha, { uf: uf!, cod, zona: zona!, secao: secao! });
  const pre = ctx.fase === 'pre';
  const linkRace = pediuT1 ? raceId : ctx.pedida;
  // O carimbo "SIMULAÇÃO" acompanha a faixa global (status.simulacao): na fase 'pre' de produção o BU vazio não é
  // simulação. Fora da simulação, um BU ainda não totalizado não tem código de identificação: mascaramos o código
  // determinístico do motor para não exibir um número que pareça oficial.
  const simulacao = ctx.status ? ctx.status.simulacao : sec.simulado;
  const buExibido: SecaoDetalhe = {
    ...sec,
    simulado: simulacao,
    codigoIdentificacao: !simulacao && !sec.totalizada ? '•••• •••• •••• ••••' : sec.codigoIdentificacao,
  };
  const caminho = rotaSecao(uf!, cod, zona!, secao!, linkRace);

  async function compartilharSecao() {
    const texto = `${sec!.simulado ? '[SIMULAÇÃO] ' : ''}Veja o boletim da minha seção: seção ${fmt4(secao!)}, zona ${fmt4(zona!)} · ${nomeMun} (${uf}).`;
    const r = await compartilhar({ titulo: 'Sintonia · Boletim de urna', texto, url: urlAbsoluta(caminho) });
    if (r === 'erro') toast('Não foi possível compartilhar', { tone: 'alert' });
  }
  async function copiar() {
    const ok = await copiarLink(urlAbsoluta(caminho));
    toast(ok ? 'Link copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'link' : undefined });
  }
  function alternarMinha() {
    if (salva) {
      setMinha(null);
      toast('Seção removida dos atalhos');
    } else {
      setMinha({ uf: uf!, cod, nome: nomeMun, zona: zona!, secao: secao! });
      toast('Guardada neste aparelho como “minha seção”', { tone: 'ok', icon: 'check' });
    }
  }

  const linhas: Abrangencia[] = [
    ...(sec.totalizada ? [{ rotulo: `Seção ${fmt4(secao!)}`, sub: 'esta urna', t: tSec, destaque: true }] : []),
    {
      rotulo: `Zona ${fmt4(zona!)}`,
      sub: zSnap ? `${fmtInt(zSnap.resumo.secoesTotalizadas)} de ${fmtInt(zSnap.resumo.secoes)} seções` : undefined,
      t: zSnap?.resumo ?? null,
    },
    {
      rotulo: nomeMun,
      sub: mSnap ? `${fmtInt(mSnap.resumo.secoesTotalizadas)} de ${fmtInt(mSnap.resumo.secoes)} seções` : undefined,
      t: mSnap?.resumo ?? null,
    },
  ];
  const frase =
    mSnap && sec.totalizada ? fraseDiferenca(race, tSec, mSnap.resumo, exterior ? 'conjunto da cidade' : 'conjunto do município') : null;

  return (
    <Container wide>
      <PageHeader
        breadcrumbs={[
          { label: 'Brasil', to: rotaBrasil(ctx.pedida) },
          { label: exterior ? 'Exterior' : uf!, to: rotaUf(uf!, ctx.pedida) },
          { label: nomeMun, to: rotaMun(uf!, cod, ctx.pedida) },
          { label: `Zona ${fmt4(zona!)}`, to: rotaMun(uf!, cod, ctx.pedida, zona) },
          { label: `Seção ${fmt4(secao!)}` },
        ]}
        eyebrow={`Boletim de urna · ${race.cargo} · 2º turno`}
        title={
          <>
            Seção <span className="font-mono tracking-[-0.02em]">{fmt4(secao!)}</span>
          </>
        }
        subtitle={
          <>
            Zona <span className="num">{fmt4(zona!)}</span> · {nomeMun} ({exterior ? 'Exterior' : uf}) ·{' '}
            <span className="num">{fmtInt(sec.aptos)}</span> eleitores aptos
          </>
        }
        actions={
          <>
            {ctx.anonimizado ? <NomesOcultos /> : null}
            <Button variant="secondary" size="sm" icon="compartilhar" onClick={compartilharSecao}>
              Compartilhar
            </Button>
            <Button variant="ghost" size="sm" icon="link" onClick={copiar} aria-label="Copiar link" title="Copiar link">
              {/* No celular só o ícone (o compartilhamento principal fica sob o boletim). */}
              <span className="hidden sm:inline">Copiar link</span>
            </Button>
          </>
        }
      />

      {pre && ctx.status ? (
        <PreApuracaoAviso inicio={ctx.status.inicioApuracao} agora={ctx.simNow} local={emMun(nomeMun)} className="mb-6" />
      ) : pediuT1 ? (
        <div role="note" className="mb-6 flex items-start gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-fg">
          <Icon name="info" size={18} className="mt-px shrink-0 text-fg-muted" />
          <span>Este é o boletim da seção no 2º turno. O resultado oficial desta seção no 1º turno está ao lado.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10">
        {/* ------------------------------------------------ BU + navegação */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-[calc(var(--app-header-h,64px)+20px)]">
            <div className="relative px-1 pb-4 pt-1">
              <div aria-hidden className="pointer-events-none absolute inset-x-6 top-10 h-64 rounded-full bg-brand/10 blur-3xl" />
              <BoletimUrna secao={buExibido} race={race} className="relative" />
            </div>
            <nav aria-label="Outras seções da zona" className="mx-auto mt-5 grid max-w-[400px] grid-cols-2 gap-2">
              <ButtonLink
                to={vizinhas.ant !== null ? rotaSecao(uf!, cod, zona!, vizinhas.ant, linkRace) : '#'}
                variant="outline"
                icon="chevron-esquerda"
                aria-disabled={vizinhas.ant === null}
                tabIndex={vizinhas.ant === null ? -1 : undefined}
                className={cn('justify-start', vizinhas.ant === null && 'pointer-events-none opacity-40')}
                replace
              >
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[11px] font-normal text-fg-muted">Anterior</span>
                  <span className="num font-mono text-[13px]">{vizinhas.ant !== null ? fmt4(vizinhas.ant) : '—'}</span>
                </span>
              </ButtonLink>
              <ButtonLink
                to={vizinhas.prox !== null ? rotaSecao(uf!, cod, zona!, vizinhas.prox, linkRace) : '#'}
                variant="outline"
                iconRight="chevron-direita"
                aria-disabled={vizinhas.prox === null}
                tabIndex={vizinhas.prox === null ? -1 : undefined}
                className={cn('justify-end', vizinhas.prox === null && 'pointer-events-none opacity-40')}
                replace
              >
                <span className="flex flex-col items-end leading-tight">
                  <span className="text-[11px] font-normal text-fg-muted">Próxima</span>
                  <span className="num font-mono text-[13px]">{vizinhas.prox !== null ? fmt4(vizinhas.prox) : '—'}</span>
                </span>
              </ButtonLink>
            </nav>
            {vizinhas.pos >= 0 ? (
              <p className="num mt-2 text-center text-[12px] text-fg-muted">
                Seção {fmtInt(vizinhas.pos + 1)} de {fmtInt(vizinhas.total)} na zona {fmt4(zona!)}
              </p>
            ) : null}
            <div className="mx-auto mt-4 flex max-w-[400px] flex-col gap-2">
              <Button variant="primary" icon="whatsapp" onClick={compartilharSecao} block>
                Veja o boletim da minha seção
              </Button>
              <Button variant={salva ? 'secondary' : 'ghost'} icon={salva ? 'check-circulo' : 'pin'} onClick={alternarMinha} block>
                {salva ? 'Guardada como minha seção' : 'Esta é a minha seção'}
              </Button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ contexto */}
        <div className="min-w-0 space-y-4">
          <StatusSecao sec={sec} pre={pre} />

          {sec.local ? <LocalVotacaoCartao local={sec.local} municipio={nomeMun} uf={exterior ? undefined : uf!} /> : null}

          {!pre && (sec.totalizada || (zSnap && validos(zSnap.resumo) > 0) || (mSnap && validos(mSnap.resumo) > 0)) ? (
            <Cartao
              titulo={`Como esta seção votou no 2º turno${ctx.status?.simulacao ? ' (simulação)' : ''}`}
              subtitulo={
                sec.totalizada
                  ? 'Em % dos votos válidos, comparada com a zona e o município.'
                  : 'A seção ainda não foi totalizada; veja como estão a zona e o município.'
              }
            >
              <ComparaAbrangencias race={race} linhas={linhas} />
              {frase ? <p className="mt-4 text-pretty text-[14px] leading-relaxed text-fg">{frase}</p> : null}
            </Cartao>
          ) : null}

          {racesT1.length ? (
            <PrimeiroTurnoSecao uf={uf!} cod={cod} zona={zona!} secao={secao!} races={racesT1} nomeMunicipio={nomeMun} />
          ) : null}

          {sec.totalizada || (mSnap && mSnap.resumo.comparecimento > 0) ? (
            <Cartao titulo="Participação" subtitulo={`Nesta seção, comparada com ${nomeMun}.`}>
              <ParticipacaoComparada secao={sec.totalizada ? tSec : null} base={mSnap?.resumo ?? null} rotuloBase={nomeMun} />
            </Cartao>
          ) : null}

          {mosaicoZona.length > 0 ? (
            <Cartao
              titulo={`As seções da zona ${fmt4(zona!)}`}
              subtitulo="A seção em destaque é esta. Toque em outra para abrir o boletim dela."
            >
              <SecaoMosaic
                mosaico={mosaicoZona}
                race={race}
                selecionada={{ zona: zona!, secao: secao! }}
                onSelect={(z, s) => navigate(rotaSecao(uf!, cod, z, s, linkRace))}
                alturaAlvo={240}
                resumo={false}
              />
            </Cartao>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ButtonLink to={rotaMun(uf!, cod, ctx.pedida, zona)} variant="secondary" icon="grade" block>
              Todas as seções de {nomeMun}
            </ButtonLink>
            <ButtonLink to={`/apuracao/consulta?uf=${uf!.toLowerCase()}&mun=${cod}`} variant="outline" icon="busca" block>
              Consultar outra seção
            </ButtonLink>
          </div>
        </div>
      </div>
    </Container>
  );
}

function StatusSecao({ sec, pre }: { sec: SecaoDetalhe; pre: boolean }) {
  if (sec.totalizada) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="check-circulo" size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-fg">
            Totalizada
            {sec.totalizadaEm ? (
              <>
                {' '}
                às <span className="num">{fmtHoraSeg(sec.totalizadaEm)}</span>
              </>
            ) : null}
          </p>
          <p className="text-[13px] text-fg-muted">
            <span className="num">{fmtInt(sec.comparecimento)}</span> de <span className="num">{fmtInt(sec.aptos)}</span> eleitores votaram
            nesta urna.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-4">
      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
        <Icon name="relogio" size={20} />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-fg">Ainda não totalizada</p>
        <p className="text-[13px] text-fg-muted">
          {pre
            ? 'A totalização começa depois das 17h de 25 de outubro. O boletim aparece aqui assim que esta seção for totalizada.'
            : 'O boletim aparece aqui assim que esta seção for totalizada. A página se atualiza sozinha.'}
        </p>
      </div>
    </div>
  );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 className="font-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-fg">{titulo}</h2>
      {subtitulo ? <p className="mt-1 text-[13px] leading-snug text-fg-muted">{subtitulo}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
