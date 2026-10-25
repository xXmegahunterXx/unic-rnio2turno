/**
 * Seção "Anunciantes" do painel (substitui a antiga "Patrocínio"): vários anunciantes ao mesmo tempo, cada um com os
 * formatos em que aparece, cota (master/apoio/reserva), peso na rotação e janela de exibição — contrato em
 * src/shared/anuncios.ts; comandos 'anuncio-salvar' | 'anuncio-remover' | 'anuncio-ativo' | 'anuncio-logo' |
 * 'anuncios-suspensao' | 'anuncie-contato'.
 *
 * Feita para o celular (o dono administra pelo telefone): lista em cartões com situação, formatos (com a fatia real de
 * cada um), avisos, meta e métricas (com as barrinhas das últimas 48 h), ações grandes; formulário em uma coluna
 * (FormAnuncio). Relatório de entrega com CSV e o contato da página /anuncie. Métricas só agregadas (impressões visíveis
 * e cliques; sem dado pessoal) — vêm de GET /api/admin/anuncios/metricas (só no servidor; no demo não há contagem).
 *
 * Anunciantes v2: "Espaços agora" (EspacosAgora), "Ajustar agora" para as logos gravadas antes do ajuste automático
 * (AjustarLogos), Duplicar, cota Reserva, interruptor geral "Tirar todos do ar" (nada é apagado; voltar devolve
 * exatamente o que estava), meta de impressões no cartão e o link privado do relatório do anunciante (LinksRelatorio).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANUNCIO_LIMITES,
  NOME_CURTO_FORMATO,
  validaContatoAnuncie,
  type AnuncioConfig,
  type FormatoAnuncio,
  type MetricaAnuncio,
  type MetricasAnunciosResposta,
} from '@/shared/anuncios';
import { fmtDataHora, fmtHora, fmtInt, fmtLista, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { Badge, Button, Dialog, Icon, Sheet, toast, type BadgeTone } from '@/app/ui';
import { useAdmin } from './dados';
import { AreaTexto, CabecalhoSecao, Callout, Campo, Painel, Rotulo } from './kit';
import { mensagemErro, urlPublica } from './rotulos';
import {
  ROTULO_CURTO,
  ROTULO_SITUACAO,
  aCreditar,
  avisosDoAnuncio,
  baixarArquivo,
  csvPorHora,
  csvRelatorio,
  ctr,
  duplicarAnuncio,
  fatiaDoAnuncio,
  fmtFatia,
  linhasRelatorio,
  previsaoEntrega,
  serieHoras,
  situacaoDe,
  textoPrevisao,
  totais48h,
  totaisDe,
  type ForaDoAr,
  type Situacao,
  type Totais,
} from './anunciosAdmin';
import { FormAnuncio } from './FormAnuncio';
import { LogoAnuncio } from './PreviaAnuncio';
import { AjustarLogos, logoPendente, type DesfazerLogos } from './AjustarLogos';
import { EspacosAgora } from './EspacosAgora';
import { LinksRelatorio, useLinksRelatorio } from './LinksRelatorio';

const TOM_SITUACAO: Record<Situacao, BadgeTone> = { 'no-ar': 'ok', agendado: 'brand', pausado: 'neutral', encerrado: 'pending', 'meta-atingida': 'ok' };

type RespostaMetricas = MetricasAnunciosResposta;

/** Relatório de entrega (servidor). No demo não existe: o motor local não conta impressões. */
function useMetricasAnuncios(ativo: boolean) {
  return useQuery<RespostaMetricas>({
    queryKey: ['admin', 'anuncios-metricas'],
    enabled: ativo && !__DEMO__,
    queryFn: async () => {
      const r = await fetch('/api/admin/anuncios/metricas', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!r.ok) {
        let msg = `Erro ${r.status}`;
        try {
          const b = (await r.json()) as { erro?: string };
          if (b?.erro) msg = b.erro;
        } catch {
          /* corpo não-JSON */
        }
        throw new Error(msg);
      }
      return (await r.json()) as RespostaMetricas;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

/** Relógio real do servidor agora (interpolado entre as consultas do painel). */
function useAgoraServidor(): number {
  const { dados } = useAdmin();
  const local = useNow(15_000);
  return local + (dados.snap.status.wallNow - dados.recebidoEm);
}

const fmtCtr = (t: Totais) => {
  const c = ctr(t);
  return c === null ? '—' : fmtPct(c, 2);
};

// ---- peças ---------------------------------------------------------------------------------------------

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-medium text-fg-muted">{rotulo}</span>
      <span className="num mt-0.5 block truncate font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] text-fg">{valor}</span>
      {sub ? <span className="num block truncate text-[11px] text-fg-subtle">{sub}</span> : null}
    </div>
  );
}

/** Barrinhas das últimas 48 h: impressões por hora em cima, cliques por hora embaixo (escalas próprias). Só tokens. */
function Barras48h({ serie, className }: { serie: { hora: number; impressoes: number; cliques: number }[]; className?: string }) {
  const maxI = Math.max(1, ...serie.map((p) => p.impressoes));
  const maxC = Math.max(1, ...serie.map((p) => p.cliques));
  const totI = serie.reduce((s, p) => s + p.impressoes, 0);
  const totC = serie.reduce((s, p) => s + p.cliques, 0);
  const altura = (v: number, max: number) => (v > 0 ? `${Math.max(10, (100 * v) / max)}%` : '2px');
  return (
    <div className={className} role="img" aria-label={`Últimas 48 horas: ${fmtInt(totI)} impressões e ${fmtInt(totC)} cliques`}>
      <div className="flex h-9 items-end gap-[2px]" aria-hidden>
        {serie.map((p) => (
          <span key={p.hora} className="flex h-full min-w-0 flex-1 items-end" title={`${fmtDataHora(p.hora)} · ${fmtInt(p.impressoes)} impressões · ${fmtInt(p.cliques)} cliques`}>
            <span className={cn('block w-full rounded-[2px]', p.impressoes > 0 ? 'bg-brand-2/80' : 'bg-surface-3')} style={{ height: altura(p.impressoes, maxI) }} />
          </span>
        ))}
      </div>
      <div className="mt-[3px] flex h-3.5 items-start gap-[2px]" aria-hidden>
        {serie.map((p) => (
          <span key={p.hora} className="flex h-full min-w-0 flex-1 items-start">
            <span className={cn('block w-full rounded-[2px]', p.cliques > 0 ? 'bg-ok/80' : 'bg-surface-3/70')} style={{ height: altura(p.cliques, maxC) }} />
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-fg-subtle">
        <span className="num">{serie.length ? fmtDataHora(serie[0].hora) : ''}</span>
        <span className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-brand-2/80" aria-hidden />
            impressões
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-ok/80" aria-hidden />
            cliques
          </span>
        </span>
        <span className="num">{serie.length ? fmtHora(serie[serie.length - 1].hora) : ''}</span>
      </div>
    </div>
  );
}

/** Barra da meta: "Entregue 41.200 de 100.000 (41%)", previsão e o "a creditar" depois do fim. */
function MetaDoAnuncio({
  a,
  agora,
  entregue,
  esgotadoEm,
  metricas,
  onAumentar,
}: {
  a: AnuncioConfig;
  agora: number;
  entregue: number | undefined;
  esgotadoEm: number | undefined;
  metricas: MetricaAnuncio[] | null;
  onAumentar: () => void;
}) {
  const limite = a.limiteImpressoes!;
  if (entregue === undefined)
    return (
      <p className="num text-[12px] text-fg-muted">
        Meta: {fmtInt(limite)} impressões {__DEMO__ ? '(contagem só no servidor)' : '· carregando…'}
      </p>
    );
  const pct = Math.min(100, (100 * entregue) / limite);
  const sit = situacaoDe(a, agora, esgotadoEm);
  const previsao = sit === 'no-ar' && metricas ? textoPrevisao(previsaoEntrega(serieHoras(metricas, agora, a.id, 3), entregue, limite, agora, a.fim)) : null;
  const credito = aCreditar(a, entregue, agora);
  return (
    <div data-meta>
      <p className="num text-[12px] text-fg">
        Entregue <span className="font-semibold">{fmtInt(entregue)}</span> de {fmtInt(limite)} ({fmtPct(pct, 0)})
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={limite} aria-valuenow={entregue} aria-label="Impressões entregues da meta">
        <div className={cn('h-full rounded-full', esgotadoEm ? 'bg-ok' : 'bg-brand-2')} style={{ width: `${pct}%` }} />
      </div>
      {previsao ? <p className="num mt-1.5 text-[11.5px] leading-snug text-fg-muted">{previsao}</p> : null}
      {esgotadoEm && sit === 'meta-atingida' ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="num text-[12px] font-semibold text-ok-fg">Meta atingida {fmtHora(esgotadoEm)}: fora do ar</span>
          <Button variant="secondary" size="sm" icon="mais" onClick={onAumentar} className="h-8 shrink-0">
            Aumentar meta
          </Button>
        </div>
      ) : esgotadoEm ? (
        <p className="num mt-1.5 text-[11.5px] font-semibold text-ok-fg">Meta atingida {fmtDataHora(esgotadoEm)}</p>
      ) : null}
      {credito > 0 ? (
        <p className="num mt-1.5 text-[11.5px] font-medium text-alert-fg">
          A creditar: {fmtInt(credito)} impressões (o anúncio terminou antes da meta).
        </p>
      ) : null}
    </div>
  );
}

function CartaoAnuncio({
  a,
  agora,
  metricas,
  resposta,
  anuncios,
  fora,
  relatorios,
  onEditar,
  onDuplicar,
  onRelatorio,
}: {
  a: AnuncioConfig;
  agora: number;
  metricas: MetricaAnuncio[] | null;
  resposta: RespostaMetricas | undefined;
  anuncios: AnuncioConfig[];
  fora: ForaDoAr;
  /** links de relatório ligados no servidor (sem eles, a ação some) */
  relatorios: boolean;
  onEditar: () => void;
  onDuplicar: () => void;
  onRelatorio: () => void;
}) {
  const { run, pendente, confirmar } = useAdmin();
  const esgotadoEm = resposta?.esgotadoEm?.[a.id];
  const sit = situacaoDe(a, agora, esgotadoEm);
  const tot = metricas ? totaisDe(metricas, a.id) : null;
  const t48 = metricas ? totais48h(metricas, agora, a.id) : null;
  const serie = metricas ? serieHoras(metricas, agora, a.id) : null;
  const chaveAtivo = `anuncio-ativo:${a.id}`;
  const chaveRemover = `anuncio-remover:${a.id}`;
  const noAr = sit === 'no-ar';
  // fatia real de cada formato marcado (só faz sentido no ar e sem a suspensão geral)
  const fatias = noAr && !fora.suspenso ? Object.fromEntries(a.formatos.map((f) => [f, fatiaDoAnuncio(a, f, anuncios, agora, fora)])) : null;
  const avisos = avisosDoAnuncio(a, { anuncios, agora, fora });

  async function remover() {
    const ok = await confirmar({
      titulo: `Remover o anúncio de ${a.marca}?`,
      descricao: 'Ele sai de todas as páginas na próxima atualização. As métricas já contadas continuam no relatório.',
      confirmar: 'Remover',
      perigo: true,
    });
    if (ok) await run({ tipo: 'anuncio-remover', id: a.id }, { chave: chaveRemover, sucesso: `Anúncio de ${a.marca} removido` });
  }

  const janela =
    a.inicio || a.fim
      ? `${a.inicio ? `de ${fmtDataHora(a.inicio)}` : 'já'}${a.fim ? ` até ${fmtDataHora(a.fim)}` : ' sem fim'}`
      : 'sem data marcada';

  return (
    <article data-anuncio={a.id} className={cn('flex min-w-0 flex-col rounded-2xl border bg-surface shadow-card', noAr && !fora.suspenso ? 'border-ok/30' : 'border-line')}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <LogoAnuncio anuncio={a} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-fg">{a.marca}</h3>
            <Badge tone={TOM_SITUACAO[sit]} size="sm" dot={noAr && !fora.suspenso} className="shrink-0">
              {ROTULO_SITUACAO[sit]}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-fg-muted">{a.titulo}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-subtle">
            <span className="font-mono">{a.id}</span>
            <span aria-hidden>·</span>
            {a.reserva ? (
              <Badge tone="neutral" size="xs" caps>
                Reserva
              </Badge>
            ) : (
              <span className={cn(a.cota === 'master' && 'font-semibold text-brand-fg')}>{a.cota === 'master' ? 'Master' : 'Apoio'}</span>
            )}
            <span aria-hidden>·</span>
            <span>
              peso <span className="num">{a.peso}</span>
            </span>
            {fora.suspenso ? (
              <Badge tone="alert" size="xs" caps>
                Suspenso (geral)
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4">
        {a.formatos.map((f) => {
          const x = fatias?.[f];
          const zero = x && x.fatia === 0;
          return (
            <span
              key={f}
              data-formato={f}
              data-fatia={x ? x.pct : undefined}
              title={zero ? (x.motivo ?? 'Não aparece neste formato agora.') : undefined}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium ring-1 ring-inset ring-line',
                zero ? 'bg-transparent text-fg-subtle line-through decoration-fg-subtle/60' : 'bg-surface-2 text-fg-muted',
              )}
            >
              {ROTULO_CURTO[f]}
              {x ? <span className={cn('num', zero ? 'text-fg-subtle' : 'text-fg')}>{fmtFatia(x.pct)}</span> : null}
            </span>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-4 text-[12px] text-fg-subtle">
        <Icon name="calendario" size={13} />
        <span className="num truncate">{janela}</span>
      </p>
      {avisos.length ? (
        <ul className="num mx-4 mt-2.5 space-y-1 rounded-xl border border-alert/25 bg-alert/[0.05] px-3 py-2 text-[12px] leading-snug text-fg-muted" data-avisos>
          {avisos.map((t) => (
            <li key={t} className="flex gap-1.5">
              <Icon name="alerta" size={13} className="mt-px shrink-0 text-alert-fg" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mx-4 mt-3 space-y-3 rounded-xl border border-line bg-surface-2/50 p-3">
        {a.limiteImpressoes ? <MetaDoAnuncio a={a} agora={agora} entregue={resposta?.entregue?.[a.id]} esgotadoEm={esgotadoEm} metricas={metricas} onAumentar={onEditar} /> : null}
        {tot && t48 && serie ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Numero rotulo="Impressões" valor={fmtInt(tot.impressoes)} sub={`48 h: ${fmtInt(t48.impressoes)}`} />
              <Numero rotulo="Cliques" valor={fmtInt(tot.cliques)} sub={`48 h: ${fmtInt(t48.cliques)}`} />
              <Numero rotulo="CTR" valor={fmtCtr(tot)} sub={`48 h: ${fmtCtr(t48)}`} />
            </div>
            <Barras48h serie={serie} />
          </>
        ) : (
          <p className="text-[12.5px] text-fg-muted">{__DEMO__ ? 'Métricas de entrega só no servidor (o demo não conta impressões).' : 'Carregando métricas…'}</p>
        )}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 p-4 pb-2 pt-3">
        <Button variant="secondary" size="md" icon="ajustes" onClick={onEditar} className="px-2">
          Editar
        </Button>
        <Button
          variant="outline"
          size="md"
          icon={a.ativo ? 'pause' : 'play'}
          className="px-2"
          loading={pendente(chaveAtivo)}
          onClick={() =>
            void run(
              { tipo: 'anuncio-ativo', id: a.id, ativo: !a.ativo },
              { chave: chaveAtivo, sucesso: a.ativo ? `${a.marca}: pausado` : `${a.marca}: ativado` },
            )
          }
        >
          {a.ativo ? 'Pausar' : 'Ativar'}
        </Button>
        <Button variant="outline" size="md" icon="copiar" onClick={onDuplicar} className="px-2">
          Duplicar
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        {relatorios ? (
          <Button variant="ghost" size="sm" icon="link" onClick={onRelatorio} className="-ml-2">
            Relatório do anunciante
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" icon="fechar" className="-mr-2 text-alert-fg hover:text-alert-fg" loading={pendente(chaveRemover)} onClick={() => void remover()}>
          Remover
        </Button>
      </div>
    </article>
  );
}

function Resumo({ anuncios, agora, metricas, fora }: { anuncios: AnuncioConfig[]; agora: number; metricas: MetricaAnuncio[] | null; fora: ForaDoAr }) {
  const esg = new Set(fora.esgotados ?? []);
  const noAr = fora.suspenso ? 0 : anuncios.filter((a) => situacaoDe(a, agora, esg.has(a.id) ? 1 : null) === 'no-ar').length;
  const t48 = metricas ? totais48h(metricas, agora) : null;
  const itens = [
    { rotulo: 'No ar agora', valor: `${fmtInt(noAr)} de ${fmtInt(anuncios.length)}`, sub: 'anúncios cadastrados', icone: 'ao-vivo' as const },
    { rotulo: 'Impressões', valor: t48 ? fmtInt(t48.impressoes) : '—', sub: 'últimas 48 h', icone: 'grafico' as const },
    { rotulo: 'Cliques', valor: t48 ? fmtInt(t48.cliques) : '—', sub: 'últimas 48 h', icone: 'externo' as const },
    { rotulo: 'CTR', valor: t48 ? fmtCtr(t48) : '—', sub: 'cliques ÷ impressões, 48 h', icone: 'rapido' as const },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:mb-5 lg:grid-cols-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 rounded-2xl border border-line bg-surface p-3.5 shadow-card sm:p-4">
          <div className="flex items-center gap-1.5 text-fg-muted">
            <Icon name={i.icone} size={14} />
            <Rotulo className="truncate">{i.rotulo}</Rotulo>
          </div>
          <div className="num mt-2 truncate font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[24px]">{i.valor}</div>
          <div className="mt-1 truncate text-[11.5px] text-fg-subtle">{i.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Relatorio({ anuncios, resposta, erro, agora }: { anuncios: AnuncioConfig[]; resposta: RespostaMetricas | undefined; erro: unknown; agora: number }) {
  const linhas = useMemo(() => (resposta ? linhasRelatorio(resposta.metricas, anuncios) : []), [resposta, anuncios]);
  const geral = resposta ? totaisDe(resposta.metricas) : null;
  const carimbo = new Date(agora - 3 * 3600_000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return (
    <Painel
      titulo="Relatório de entrega"
      icone="grafico"
      subtitulo={
        __DEMO__
          ? 'Disponível no servidor: o demo não conta impressões nem cliques.'
          : resposta
            ? `Impressões visíveis e cliques desde ${fmtDataHora(resposta.desde)} (agregados, sem cookie e sem guardar IP).`
            : 'Impressões visíveis e cliques, agregados por anúncio e formato.'
      }
      acoes={
        resposta ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() => baixarArquivo(`sintonia-anuncios-${carimbo}.csv`, csvRelatorio(resposta.metricas, anuncios, resposta.desde, agora))}
            >
              Exportar CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="relogio"
              onClick={() => baixarArquivo(`sintonia-anuncios-por-hora-${carimbo}.csv`, csvPorHora(resposta.metricas, anuncios))}
            >
              Por hora
            </Button>
          </>
        ) : null
      }
    >
      {erro ? (
        <Callout tom="alerta" titulo="Não foi possível carregar as métricas">
          {mensagemErro(erro)}
        </Callout>
      ) : !resposta ? (
        <p className="text-[13px] text-fg-muted">{__DEMO__ ? 'Publique no servidor para acompanhar a entrega.' : 'Carregando…'}</p>
      ) : linhas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-subtle">
          Ainda sem impressões contadas. Elas aparecem quando o anúncio é visto na tela de alguém.
        </p>
      ) : (
        <div className="space-y-3">
          {linhas
            .filter((l) => l.total.impressoes > 0 || l.total.cliques > 0)
            .map((l) => (
              <div key={l.id} className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center justify-between gap-3 bg-surface-2/70 px-3 py-2">
                  <span className="min-w-0 truncate text-[13.5px] font-semibold text-fg">
                    {l.marca}
                    {l.removido ? <span className="ml-1.5 text-[11.5px] font-normal text-fg-subtle">(removido)</span> : null}
                  </span>
                  <span className="num shrink-0 text-[12px] text-fg-muted">CTR {fmtCtr(l.total)}</span>
                </div>
                <table className="w-full table-fixed text-[12.5px]">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[24%]" />
                    <col className="w-[20%]" />
                    <col className="w-[22%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-[11px] text-fg-subtle">
                      <th className="px-3 py-1.5 font-medium">Formato</th>
                      <th className="px-2 py-1.5 text-right font-medium">Impressões</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cliques</th>
                      <th className="px-3 py-1.5 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {l.formatos.map((f) => (
                      <tr key={f.formato}>
                        <td className="truncate px-3 py-1.5 text-fg-muted">{ROTULO_CURTO[f.formato]}</td>
                        <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(f.impressoes)}</td>
                        <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(f.cliques)}</td>
                        <td className="num px-3 py-1.5 text-right text-fg-muted">{fmtCtr(f)}</td>
                      </tr>
                    ))}
                    {l.formatos.length > 1 ? (
                      <tr className="bg-surface-2/40 font-semibold">
                        <td className="px-3 py-1.5 text-fg">Total</td>
                        <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(l.total.impressoes)}</td>
                        <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(l.total.cliques)}</td>
                        <td className="num px-3 py-1.5 text-right text-fg">{fmtCtr(l.total)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ))}
          {linhas.some((l) => !l.total.impressoes && !l.total.cliques) ? (
            <p className="text-[12.5px] text-fg-subtle">
              Ainda sem entrega:{' '}
              {linhas
                .filter((l) => !l.total.impressoes && !l.total.cliques)
                .map((l) => l.marca)
                .join(', ')}
              .
            </p>
          ) : null}
          {geral ? (
            <p className="num text-right text-[12px] text-fg-muted">
              Todos: {fmtInt(geral.impressoes)} impressões · {fmtInt(geral.cliques)} cliques · CTR {fmtCtr(geral)}
            </p>
          ) : null}
        </div>
      )}
      {resposta ? (
        <p className="mt-3 text-[12px] leading-snug text-fg-subtle">
          Não medidos: imagens de compartilhamento (circulam fora do site) e cliques no Modo TV (a tela não tem link). Cliques contam só quando
          o visitante toca no anúncio dentro do site, uma vez a cada 30 min por conexão. Lives (modo streamer): cada impressão é uma fonte de
          navegador do OBS que exibiu a marca (uma por carregamento), não a audiência da transmissão — essa só a plataforma da live mede.
        </p>
      ) : null}
    </Painel>
  );
}

function PaginaAnuncie() {
  const { snap, run, pendente } = useAdmin();
  const atual = snap.state.anuncie ?? null;
  const [email, setEmail] = useState(atual?.email ?? '');
  const [whatsapp, setWhatsapp] = useState(atual?.whatsapp ?? '');
  const [chamada, setChamada] = useState(atual?.chamada ?? '');
  // mudou por fora (outro aparelho) e o rascunho está igual ao que havia: adota
  useEffect(() => {
    setEmail(atual?.email ?? '');
    setWhatsapp(atual?.whatsapp ?? '');
    setChamada(atual?.chamada ?? '');
  }, [atual?.email, atual?.whatsapp, atual?.chamada]);
  const v = validaContatoAnuncie({ email, whatsapp, chamada });
  const igual = (atual?.email ?? '') === email.trim() && (atual?.whatsapp ?? '') === whatsapp.replace(/\D/g, '') && (atual?.chamada ?? '') === chamada.trim();
  return (
    <Painel
      titulo="Página Anuncie"
      icone="bandeira"
      subtitulo="Contato que aparece em /anuncie para quem quer anunciar."
      acoes={
        <a href={urlPublica('/anuncie')} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-fg hover:underline">
          Ver página <Icon name="externo" size={13} />
        </a>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if ('ok' in v) void run({ tipo: 'anuncie-contato', contato: Object.keys(v.ok).length ? v.ok : null }, { chave: 'anuncie-contato', sucesso: 'Contato da página Anuncie salvo' });
        }}
      >
        <div className="grid grid-cols-1 gap-4">
          <Campo rotulo="E-mail comercial" type="email" inputMode="email" autoCapitalize="none" value={email} placeholder="comercial@exemplo.com.br" onChange={(e) => setEmail(e.target.value)} />
          <Campo
            rotulo="WhatsApp (com DDI e DDD)"
            inputMode="tel"
            value={whatsapp}
            placeholder="55 11 99999-0000"
            onChange={(e) => setWhatsapp(e.target.value)}
            dica="Só números; o link abre a conversa."
          />
        </div>
        <AreaTexto
          rotulo="Chamada (opcional)"
          rows={2}
          value={chamada}
          maxLength={ANUNCIO_LIMITES.chamada + 10}
          placeholder="Ex.: Sua marca na apuração mais vista do 2º turno."
          onChange={(e) => setChamada(e.target.value)}
          dica={<span className="num flex justify-end">{`${chamada.trim().length}/${ANUNCIO_LIMITES.chamada}`}</span>}
        />
        {'erro' in v ? <p className="text-[12.5px] font-medium text-alert-fg">{v.erro}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon="check" disabled={'erro' in v || igual} loading={pendente('anuncie-contato')}>
            {igual ? 'Salvo' : 'Salvar contato'}
          </Button>
        </div>
      </form>
    </Painel>
  );
}

// ---- interruptor geral, "Ajustar agora", Preencher ---------------------------------------------------------------

/** Faixa vermelha fixa no topo da seção enquanto a suspensão geral está ligada. */
function FaixaSuspensao({ desde, motivo }: { desde: number; motivo?: string }) {
  const { run, pendente } = useAdmin();
  return (
    <div
      role="status"
      data-faixa-suspensao
      className="sticky top-[101px] z-20 -mx-4 -mt-5 mb-4 border-b border-alert/40 bg-alert/[0.14] px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-[84px] lg:mx-0 lg:mt-0 lg:mb-5 lg:rounded-2xl lg:border"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="flex min-w-0 flex-1 items-start gap-2 text-[13.5px] leading-snug text-fg">
          <Icon name="pause" size={16} className="mt-px shrink-0 text-alert-fg" />
          <span className="min-w-0">
            <span className="font-semibold">
              Anúncios suspensos desde <span className="num">{fmtHora(desde)}</span>
            </span>
            {motivo ? <span className="text-fg-muted"> · {motivo}</span> : null}
            <span className="block text-[12px] text-fg-muted">Nada foi apagado: o site, as lives e as imagens estão sem anúncios.</span>
          </span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon="play"
          className="self-start sm:self-auto"
          loading={pendente('anuncios-suspensao')}
          onClick={() => void run({ tipo: 'anuncios-suspensao', suspender: false }, { chave: 'anuncios-suspensao', sucesso: 'Anúncios de volta ao ar' })}
        >
          Voltar com os anúncios
        </Button>
      </div>
    </div>
  );
}

/** Confirmação do "Tirar todos do ar", com o motivo opcional (fica no registro). */
function DialogoSuspender({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, pendente } = useAdmin();
  const [motivo, setMotivo] = useState('');
  useEffect(() => {
    if (open) setMotivo('');
  }, [open]);
  const longo = motivo.trim().length > 140;
  async function suspender() {
    const snap = await run(
      { tipo: 'anuncios-suspensao', suspender: true, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) },
      { chave: 'anuncios-suspensao', sucesso: 'Todos os anúncios fora do ar' },
    );
    if (snap) onClose();
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tirar todos os anúncios do ar?"
      description="Todos os anúncios saem do site, das lives e das imagens em até ~5 s. Nada é apagado: “Voltar com os anúncios” devolve exatamente o que estava no ar."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <button
            type="button"
            onClick={() => void suspender()}
            disabled={longo || pendente('anuncios-suspensao')}
            data-autofocus
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-alert/45 bg-alert/15 px-4 text-sm font-semibold text-alert-fg',
              'transition-colors hover:bg-alert/25 active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            )}
          >
            <Icon name="pause" size={16} />
            Tirar todos do ar
          </button>
        </>
      }
    >
      <AreaTexto
        rotulo="Motivo (fica no registro)"
        rows={2}
        value={motivo}
        maxLength={160}
        placeholder="Opcional"
        onChange={(e) => setMotivo(e.target.value)}
        dica={<span className={cn('num flex justify-end', longo && 'font-semibold text-alert-fg')}>{`${motivo.trim().length}/140`}</span>}
      />
    </Dialog>
  );
}

/** "Preencher" do Espaços agora: escolher o anúncio que passa a ter o formato (ou um novo). */
function FolhaPreencher({
  formato,
  anuncios,
  onClose,
  onEscolher,
}: {
  formato: FormatoAnuncio | null;
  anuncios: AnuncioConfig[];
  onClose: () => void;
  onEscolher: (id: string | 'novo', f: FormatoAnuncio) => void;
}) {
  const candidatos = formato ? anuncios.filter((a) => !a.formatos.includes(formato)) : [];
  return (
    <Sheet
      open={!!formato}
      onClose={onClose}
      title={formato ? `Preencher ${NOME_CURTO_FORMATO[formato]}` : ''}
      description="Escolha o anúncio que passa a aparecer neste formato. O formulário abre com ele marcado; confira e confirme a declaração."
      width="sm"
    >
      <div className="space-y-2">
        {candidatos.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => formato && onEscolher(a.id, formato)}
            className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/50 p-3 text-left transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <LogoAnuncio anuncio={a} tamanho="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-fg">{a.marca}</span>
              <span className="block truncate text-[12px] text-fg-muted">{a.formatos.map((f) => ROTULO_CURTO[f]).join(' · ')}</span>
            </span>
            <Icon name="chevron-direita" size={16} className="shrink-0 text-fg-subtle" />
          </button>
        ))}
        <Button variant="secondary" icon="mais" block onClick={() => formato && onEscolher('novo', formato)}>
          Novo anúncio
        </Button>
      </div>
    </Sheet>
  );
}

// ---- seção -----------------------------------------------------------------------------------------------

/** O que a seção mostra no lugar da lista: o formulário de um anúncio. */
type Edicao = { modo: 'novo' | 'editar' | 'duplicar'; id?: string; formato?: FormatoAnuncio; modelo?: Omit<AnuncioConfig, 'naoPolitico'> };

export function SecaoAnuncios() {
  const { snap, run } = useAdmin();
  const anuncios = snap.state.anuncios ?? [];
  const suspensao = snap.state.anunciosSuspensos ?? null;
  const agora = useAgoraServidor();
  const q = useMetricasAnuncios(true);
  const metricas = q.data?.metricas ?? null;
  const links = useLinksRelatorio(true);
  const relatoriosLigados = !__DEMO__ && links.data?.ligado !== false;
  const fora: ForaDoAr = useMemo(() => ({ esgotados: Object.keys(q.data?.esgotadoEm ?? {}), suspenso: !!suspensao }), [q.data?.esgotadoEm, suspensao]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [suspender, setSuspender] = useState(false);
  const [ajustar, setAjustar] = useState(false);
  const [preencher, setPreencher] = useState<FormatoAnuncio | null>(null);
  const [relatorioDe, setRelatorioDe] = useState<string | null>(null);
  const [desfazer, setDesfazer] = useState<DesfazerLogos | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  const lotado = anuncios.length >= ANUNCIO_LIMITES.maxAnuncios;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [edicao]);

  // [Desfazer] do "Ajustar agora" fica 10 s na tela
  useEffect(() => {
    if (!desfazer) return;
    const t = window.setTimeout(() => setDesfazer(null), 10_000);
    return () => window.clearTimeout(t);
  }, [desfazer]);

  if (edicao !== null) {
    const inicial = edicao.modo === 'editar' ? (anuncios.find((a) => a.id === edicao.id) ?? null) : null;
    return (
      <FormAnuncio
        key={`${edicao.modo}:${edicao.id ?? ''}:${edicao.formato ?? ''}`}
        inicial={inicial}
        modelo={edicao.modelo ?? null}
        formatoExtra={edicao.formato}
        agora={agora}
        fora={fora}
        onFechar={() => setEdicao(null)}
      />
    );
  }

  const ordem: Record<Situacao, number> = { 'no-ar': 0, 'meta-atingida': 1, agendado: 2, pausado: 3, encerrado: 4 };
  const esg = q.data?.esgotadoEm ?? {};
  const ordenados = [...anuncios].sort(
    (a, b) => ordem[situacaoDe(a, agora, esg[a.id])] - ordem[situacaoDe(b, agora, esg[b.id])] || (a.cota === b.cota ? 0 : a.cota === 'master' ? -1 : 1),
  );
  const noAr = suspensao ? 0 : anuncios.filter((a) => situacaoDe(a, agora, esg[a.id]) === 'no-ar').length;
  const pendentes = anuncios.filter(logoPendente);
  const nLogos = pendentes.reduce((n, a) => n + (a.logo && !a.logoAjuste ? 1 : 0) + (a.logoEscuro && !a.logoEscuroAjuste ? 1 : 0), 0);
  const relatorioAnuncio = relatorioDe ? (anuncios.find((a) => a.id === relatorioDe) ?? null) : null;

  async function desfazerAjuste() {
    if (!desfazer) return;
    setDesfazendo(true);
    let ok = 0;
    for (const it of desfazer.itens) {
      const snapNovo = await run(
        {
          tipo: 'anuncio-logo',
          id: it.id,
          ...(it.logo ? { logo: it.logo, logoAjuste: null } : {}),
          ...(it.logoEscuro ? { logoEscuro: it.logoEscuro, logoEscuroAjuste: null } : {}),
        },
        { chave: `anuncio-logo:${it.id}` },
      );
      if (snapNovo) ok++;
    }
    setDesfazendo(false);
    setDesfazer(null);
    if (ok) toast(ok > 1 ? 'Logos de volta como estavam' : 'Logo de volta como estava', { tone: 'ok' });
  }

  return (
    <div>
      {suspensao ? <FaixaSuspensao desde={suspensao.desde} motivo={suspensao.motivo} /> : null}
      <CabecalhoSecao
        titulo="Anunciantes"
        icone="selo"
        descricao={
          <>
            Vários anunciantes ao mesmo tempo, com rotação por peso. Sempre rotulado como publicidade, sem pop-up e sem som.
            <span className="num mt-1 block font-medium text-fg" data-no-ar>
              {suspensao ? 'No ar: nenhum anúncio (suspensão geral)' : `No ar: ${fmtInt(noAr)} ${noAr === 1 ? 'anúncio' : 'anúncios'}`}
            </span>
          </>
        }
        acoes={
          <>
            {!suspensao && anuncios.length ? (
              <button
                type="button"
                onClick={() => setSuspender(true)}
                className={cn(
                  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-alert/45 px-3.5 text-sm font-semibold text-alert-fg',
                  'transition-colors hover:bg-alert/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert',
                )}
              >
                <Icon name="pause" size={16} />
                Tirar todos do ar
              </button>
            ) : null}
            <Button variant="primary" icon="mais" onClick={() => setEdicao({ modo: 'novo' })} disabled={lotado} title={lotado ? `Limite de ${ANUNCIO_LIMITES.maxAnuncios} anúncios` : undefined}>
              Novo anúncio
            </Button>
          </>
        }
      />

      <Callout tom="alerta" titulo="Somente anunciantes não políticos" className="mb-4 lg:mb-5">
        Proibido: partido, federação, candidato, campanha, mandato, governo ou órgão público com mensagem institucional, e qualquer conteúdo
        político-eleitoral (Lei 9.504/97). Também não aceitamos apostas, cassino e mercados de previsão; bebida alcoólica fica fora do ar em 25/10
        até as 19h. Na dúvida, não publique.
      </Callout>

      {desfazer ? (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-ok/35 bg-ok/[0.08] px-3.5 py-2.5 lg:mb-5" data-desfazer>
          <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-fg">
            <Icon name="check-circulo" size={17} className="shrink-0 text-ok-fg" />
            Logos ajustadas
          </span>
          <Button variant="secondary" size="sm" icon="reset" loading={desfazendo} onClick={() => void desfazerAjuste()}>
            Desfazer
          </Button>
        </div>
      ) : null}

      {pendentes.length && !desfazer ? (
        <Callout tom="info" titulo="Logos para ajustar" className="mb-4 lg:mb-5">
          <span className="num" data-logos-pendentes={nLogos}>
            {nLogos === 1 ? '1 logo gravada' : `${fmtInt(nLogos)} logos gravadas`} antes do ajuste automático ({fmtLista([...new Set(pendentes.map((a) => a.marca))])}).{' '}
            {nLogos === 1 ? 'Ela aparece pequena' : 'Elas aparecem pequenas'}, numa placa branca quadrada.
          </span>
          <span className="mt-2.5 block">
            <Button variant="primary" size="sm" icon="ajustes" onClick={() => setAjustar(true)}>
              Ajustar agora
            </Button>
          </span>
        </Callout>
      ) : null}

      {anuncios.length > 0 ? <Resumo anuncios={anuncios} agora={agora} metricas={metricas} fora={fora} /> : null}
      {anuncios.length > 0 ? <EspacosAgora anuncios={anuncios} agora={agora} fora={fora} onPreencher={setPreencher} /> : null}

      {anuncios.length === 0 ? (
        <div className="mb-5 flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-brand-fg">
            <Icon name="selo" size={26} />
          </span>
          <h2 className="mt-4 font-display text-[20px] font-semibold tracking-[-0.01em] text-fg">Nenhum anunciante ainda</h2>
          <p className="mt-1.5 max-w-sm text-pretty text-[13.5px] leading-relaxed text-fg-muted">
            Cadastre a marca, a chamada, o link e onde aparece: faixa no topo, cartão no conteúdo, barra do celular, Teste Cego, Modo TV, chat, lives e as
            imagens compartilhadas.
          </p>
          <Button variant="primary" icon="mais" className="mt-5" onClick={() => setEdicao({ modo: 'novo' })}>
            Cadastrar o primeiro anúncio
          </Button>
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 2xl:grid-cols-3">
          {ordenados.map((a) => (
            <CartaoAnuncio
              key={a.id}
              a={a}
              agora={agora}
              metricas={metricas}
              resposta={q.data}
              anuncios={anuncios}
              fora={fora}
              relatorios={relatoriosLigados}
              onEditar={() => setEdicao({ modo: 'editar', id: a.id })}
              onDuplicar={() => {
                if (lotado) {
                  toast(`Limite de ${ANUNCIO_LIMITES.maxAnuncios} anúncios cadastrados: remova um para duplicar.`, { tone: 'alert' });
                  return;
                }
                setEdicao({ modo: 'duplicar', modelo: duplicarAnuncio(a, anuncios.map((x) => x.id)) });
              }}
              onRelatorio={() => setRelatorioDe(a.id)}
            />
          ))}
        </div>
      )}
      {lotado ? <p className="-mt-2 mb-5 text-[12.5px] text-fg-muted">Limite de {ANUNCIO_LIMITES.maxAnuncios} anúncios cadastrados: remova um para criar outro.</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Relatorio anuncios={anuncios} resposta={q.data} erro={q.error} agora={agora} />
        <PaginaAnuncie />
      </div>

      <DialogoSuspender open={suspender} onClose={() => setSuspender(false)} />
      <AjustarLogos open={ajustar} onClose={() => setAjustar(false)} pendentes={pendentes} onAplicado={setDesfazer} />
      <FolhaPreencher
        formato={preencher}
        anuncios={anuncios}
        onClose={() => setPreencher(null)}
        onEscolher={(id, f) => {
          setPreencher(null);
          setEdicao(id === 'novo' ? { modo: 'novo', formato: f } : { modo: 'editar', id, formato: f });
        }}
      />
      {relatorioAnuncio ? <LinksRelatorio anuncio={relatorioAnuncio} open={!!relatorioAnuncio} onClose={() => setRelatorioDe(null)} /> : null}
    </div>
  );
}
