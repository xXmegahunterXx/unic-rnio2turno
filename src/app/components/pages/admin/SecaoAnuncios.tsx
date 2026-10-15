/**
 * Seção "Anunciantes" do painel (substitui a antiga "Patrocínio"): vários anunciantes ao mesmo tempo, cada um com os
 * formatos em que aparece, cota (master/apoio), peso na rotação e janela de exibição — contrato em
 * src/shared/anuncios.ts; comandos 'anuncio-salvar' | 'anuncio-remover' | 'anuncio-ativo' | 'anuncie-contato'.
 *
 * Feita para o celular (o dono administra pelo telefone): lista em cartões com situação, formatos e métricas (com as
 * barrinhas das últimas 48 h), ações grandes; formulário em uma coluna (FormAnuncio). Relatório de entrega com CSV e o
 * contato da página /anuncie. Métricas só agregadas (impressões visíveis e cliques; sem dado pessoal) — vêm de
 * GET /api/admin/anuncios/metricas (só no servidor; no demo não há contagem).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ANUNCIO_LIMITES, validaContatoAnuncie, type AnuncioConfig, type MetricaAnuncio } from '@/shared/anuncios';
import { fmtDataHora, fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { Badge, Button, Icon, type BadgeTone } from '@/app/ui';
import { useAdmin } from './dados';
import { AreaTexto, CabecalhoSecao, Callout, Campo, Painel, Rotulo } from './kit';
import { mensagemErro, urlPublica } from './rotulos';
import {
  ROTULO_CURTO,
  ROTULO_SITUACAO,
  baixarArquivo,
  csvPorHora,
  csvRelatorio,
  ctr,
  linhasRelatorio,
  serieHoras,
  situacaoDe,
  totais48h,
  totaisDe,
  type Situacao,
  type Totais,
} from './anunciosAdmin';
import { FormAnuncio } from './FormAnuncio';
import { LogoAnuncio } from './PreviaAnuncio';

const TOM_SITUACAO: Record<Situacao, BadgeTone> = { 'no-ar': 'ok', agendado: 'brand', pausado: 'neutral', encerrado: 'pending' };

interface RespostaMetricas {
  metricas: MetricaAnuncio[];
  desde: number;
}

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

/** Barrinhas das últimas 48 h (impressões por hora; a hora com clique ganha um ponto). Só tokens. */
function Barras48h({ serie, className }: { serie: { hora: number; impressoes: number; cliques: number }[]; className?: string }) {
  const max = Math.max(1, ...serie.map((p) => p.impressoes));
  const algum = serie.some((p) => p.impressoes > 0 || p.cliques > 0);
  return (
    <div className={className}>
      <div className="flex h-10 items-end gap-[2px]" role="img" aria-label={`Impressões por hora nas últimas 48 horas: ${fmtInt(serie.reduce((s, p) => s + p.impressoes, 0))} no total`}>
        {serie.map((p) => (
          <span key={p.hora} className="relative flex h-full min-w-0 flex-1 items-end" title={`${fmtDataHora(p.hora)} · ${fmtInt(p.impressoes)} impressões · ${fmtInt(p.cliques)} cliques`}>
            <span
              className={cn('block w-full rounded-[2px]', p.impressoes > 0 ? 'bg-brand-2/80' : 'bg-surface-3')}
              style={{ height: p.impressoes > 0 ? `${Math.max(8, (100 * p.impressoes) / max)}%` : '3px' }}
            />
            {p.cliques > 0 ? <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ok" /> : null}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-fg-subtle">
        <span className="num">{serie.length ? fmtDataHora(serie[0].hora) : ''}</span>
        <span>{algum ? 'últimas 48 h' : 'sem impressões nas últimas 48 h'}</span>
        <span className="num">{serie.length ? fmtHora(serie[serie.length - 1].hora) : ''}</span>
      </div>
    </div>
  );
}

function CartaoAnuncio({
  a,
  agora,
  metricas,
  onEditar,
}: {
  a: AnuncioConfig;
  agora: number;
  metricas: MetricaAnuncio[] | null;
  onEditar: () => void;
}) {
  const { run, pendente, confirmar } = useAdmin();
  const sit = situacaoDe(a, agora);
  const tot = metricas ? totaisDe(metricas, a.id) : null;
  const t48 = metricas ? totais48h(metricas, agora, a.id) : null;
  const serie = metricas ? serieHoras(metricas, agora, a.id) : null;
  const chaveAtivo = `anuncio-ativo:${a.id}`;
  const chaveRemover = `anuncio-remover:${a.id}`;

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
    <article className={cn('flex min-w-0 flex-col rounded-2xl border bg-surface shadow-card', sit === 'no-ar' ? 'border-ok/30' : 'border-line')}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <LogoAnuncio anuncio={a} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-fg">{a.marca}</h3>
            <Badge tone={TOM_SITUACAO[sit]} size="sm" dot={sit === 'no-ar'} className="shrink-0">
              {ROTULO_SITUACAO[sit]}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-fg-muted">{a.titulo}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-fg-subtle">
            <span className="font-mono">{a.id}</span>
            <span aria-hidden>·</span>
            <span className={cn(a.cota === 'master' && 'font-semibold text-brand-fg')}>{a.cota === 'master' ? 'Master' : 'Apoio'}</span>
            <span aria-hidden>·</span>
            <span>
              peso <span className="num">{a.peso}</span>
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4">
        {a.formatos.map((f) => (
          <span key={f} className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[11.5px] font-medium text-fg-muted ring-1 ring-inset ring-line">
            {ROTULO_CURTO[f]}
          </span>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-4 text-[12px] text-fg-subtle">
        <Icon name="calendario" size={13} />
        <span className="num truncate">{janela}</span>
      </p>

      <div className="mx-4 mt-3 rounded-xl border border-line bg-surface-2/50 p-3">
        {tot && t48 && serie ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Numero rotulo="Impressões" valor={fmtInt(tot.impressoes)} sub={`48 h: ${fmtInt(t48.impressoes)}`} />
              <Numero rotulo="Cliques" valor={fmtInt(tot.cliques)} sub={`48 h: ${fmtInt(t48.cliques)}`} />
              <Numero rotulo="CTR" valor={fmtCtr(tot)} sub={`48 h: ${fmtCtr(t48)}`} />
            </div>
            <Barras48h serie={serie} className="mt-3" />
          </>
        ) : (
          <p className="text-[12.5px] text-fg-muted">{__DEMO__ ? 'Métricas de entrega só no servidor (o demo não conta impressões).' : 'Carregando métricas…'}</p>
        )}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 p-4 pt-3">
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
        <Button variant="ghost" size="md" icon="fechar" className="px-2 text-alert-fg hover:text-alert-fg" loading={pendente(chaveRemover)} onClick={() => void remover()}>
          Remover
        </Button>
      </div>
    </article>
  );
}

function Resumo({ anuncios, agora, metricas }: { anuncios: AnuncioConfig[]; agora: number; metricas: MetricaAnuncio[] | null }) {
  const noAr = anuncios.filter((a) => situacaoDe(a, agora) === 'no-ar').length;
  const t48 = metricas ? totais48h(metricas, agora) : null;
  const itens = [
    { rotulo: 'No ar agora', valor: `${fmtInt(noAr)} de ${fmtInt(anuncios.length)}`, icone: 'ao-vivo' as const },
    { rotulo: 'Impressões (48 h)', valor: t48 ? fmtInt(t48.impressoes) : '—', icone: 'grafico' as const },
    { rotulo: 'Cliques (48 h)', valor: t48 ? fmtInt(t48.cliques) : '—', icone: 'externo' as const },
    { rotulo: 'CTR (48 h)', valor: t48 ? fmtCtr(t48) : '—', icone: 'rapido' as const },
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
            ? `Impressões visíveis e cliques desde ${fmtDataHora(resposta.desde)} (agregados, sem dado pessoal).`
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
          {linhas.map((l) => (
            <div key={l.id} className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center justify-between gap-3 bg-surface-2/70 px-3 py-2">
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-fg">
                  {l.marca}
                  {l.removido ? <span className="ml-1.5 text-[11.5px] font-normal text-fg-subtle">(removido)</span> : null}
                </span>
                <span className="num shrink-0 text-[12px] text-fg-muted">CTR {fmtCtr(l.total)}</span>
              </div>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] text-fg-subtle">
                    <th className="px-3 py-1.5 font-medium">Formato</th>
                    <th className="px-2 py-1.5 text-right font-medium">Impr.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Cliques</th>
                    <th className="px-3 py-1.5 text-right font-medium">CTR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {l.formatos.map((f) => (
                    <tr key={f.formato}>
                      <td className="px-3 py-1.5 text-fg-muted">{ROTULO_CURTO[f.formato]}</td>
                      <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(f.impressoes)}</td>
                      <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(f.cliques)}</td>
                      <td className="num px-3 py-1.5 text-right text-fg-muted">{fmtCtr(f)}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-2/40 font-semibold">
                    <td className="px-3 py-1.5 text-fg">Total</td>
                    <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(l.total.impressoes)}</td>
                    <td className="num px-2 py-1.5 text-right text-fg">{fmtInt(l.total.cliques)}</td>
                    <td className="num px-3 py-1.5 text-right text-fg">{fmtCtr(l.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          {geral ? (
            <p className="num text-right text-[12px] text-fg-muted">
              Todos: {fmtInt(geral.impressoes)} impressões · {fmtInt(geral.cliques)} cliques · CTR {fmtCtr(geral)}
            </p>
          ) : null}
        </div>
      )}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

// ---- seção -----------------------------------------------------------------------------------------------

export function SecaoAnuncios() {
  const { snap } = useAdmin();
  const anuncios = snap.state.anuncios ?? [];
  const agora = useAgoraServidor();
  const q = useMetricasAnuncios(true);
  const metricas = q.data?.metricas ?? null;
  /** null = lista; 'novo' = criar; id = editar */
  const [editando, setEditando] = useState<string | null>(null);
  const lotado = anuncios.length >= ANUNCIO_LIMITES.maxAnuncios;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [editando]);

  if (editando !== null) {
    const inicial = editando === 'novo' ? null : (anuncios.find((a) => a.id === editando) ?? null);
    return <FormAnuncio key={editando} inicial={inicial} onFechar={() => setEditando(null)} />;
  }

  const ordem: Record<string, number> = { 'no-ar': 0, agendado: 1, pausado: 2, encerrado: 3 };
  const ordenados = [...anuncios].sort(
    (a, b) => ordem[situacaoDe(a, agora)] - ordem[situacaoDe(b, agora)] || (a.cota === b.cota ? 0 : a.cota === 'master' ? -1 : 1),
  );

  return (
    <div>
      <CabecalhoSecao
        titulo="Anunciantes"
        icone="selo"
        descricao="Vários anunciantes ao mesmo tempo, com rotação por peso. Sempre rotulado como publicidade, sem pop-up e sem som."
        acoes={
          <Button variant="primary" icon="mais" onClick={() => setEditando('novo')} disabled={lotado} title={lotado ? `Limite de ${ANUNCIO_LIMITES.maxAnuncios} anúncios` : undefined}>
            Novo anúncio
          </Button>
        }
      />

      <Callout tom="alerta" titulo="Somente anunciantes não políticos" className="mb-4 lg:mb-5">
        Proibido: partido, federação, candidato, campanha, mandato, governo ou órgão público com mensagem institucional, e qualquer conteúdo
        político-eleitoral (Lei 9.504/97). Na dúvida, não publique.
      </Callout>

      {anuncios.length > 0 ? <Resumo anuncios={anuncios} agora={agora} metricas={metricas} /> : null}

      {anuncios.length === 0 ? (
        <div className="mb-5 flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-brand-fg">
            <Icon name="selo" size={26} />
          </span>
          <h2 className="mt-4 font-display text-[20px] font-semibold tracking-[-0.01em] text-fg">Nenhum anunciante ainda</h2>
          <p className="mt-1.5 max-w-sm text-pretty text-[13.5px] leading-relaxed text-fg-muted">
            Cadastre a marca, a chamada, o link e onde aparece: faixa no topo, cartão no conteúdo, barra do celular, Teste Cego, Modo TV e as
            imagens compartilhadas.
          </p>
          <Button variant="primary" icon="mais" className="mt-5" onClick={() => setEditando('novo')}>
            Cadastrar o primeiro anúncio
          </Button>
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 2xl:grid-cols-3">
          {ordenados.map((a) => (
            <CartaoAnuncio key={a.id} a={a} agora={agora} metricas={metricas} onEditar={() => setEditando(a.id)} />
          ))}
        </div>
      )}
      {lotado ? <p className="-mt-2 mb-5 text-[12.5px] text-fg-muted">Limite de {ANUNCIO_LIMITES.maxAnuncios} anúncios cadastrados: remova um para criar outro.</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Relatorio anuncios={anuncios} resposta={q.data} erro={q.error} agora={agora} />
        <PaginaAnuncie />
      </div>
    </div>
  );
}
