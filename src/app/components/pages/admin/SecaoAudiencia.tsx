/**
 * Seção "Audiência" do painel (pensada para o celular): números REAIS medidos pelo próprio site (src/server/audiencia.ts)
 * — pessoas agora, pico com data e hora, visitantes únicos e páginas por dia, horas de tela, a curva minuto a minuto das
 * últimas 24 h, aparelho/UF/país (MedicaoNoite.tsx, I14), últimas 48 h em barras (o CSV "Por hora" leva 14 dias), seções
 * do site e origens das visitas — com CSV; o interruptor "Mostrar audiência na página /anuncie" (padrão desligado) e os
 * links de "Siga o Sintonia". Fala com `/api/admin/audiencia` e `/api/admin/divulgacao`; no build demo não há servidor e
 * a seção explica.
 *
 * Tudo agregado: nenhum dado pessoal chega aqui (nem IP, nem navegador, nem caminho completo).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AUDIENCIA,
  EXEMPLO_REDE,
  REDES,
  ROTULO_GRUPO,
  ROTULO_REDE,
  diaBrasilia,
  fmtDia,
  validaRedes,
  type AudienciaAdmin,
  type ConcentracaoAudiencia,
  type DivulgacaoConfig,
  type HoraAudiencia,
  type RedeSintonia,
} from '@/shared/audiencia';
import { fmtDataHora, fmtDecimal, fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button, Icon, Toggle, toast } from '@/app/ui';
import { IconeRede } from '@/app/components/crescimento/IconeRede';
import { NumerosAudiencia, temNumeros } from '@/app/components/crescimento/NumerosAudiencia';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Campo, Painel, Rotulo } from './kit';
import { urlPublica } from './rotulos';
import { baixarArquivo } from './anunciosAdmin';
import { csvAudienciaDias, csvOrigens, somaOrigens, somaPorGrupo } from './crescimentoAdmin';
import { csvHorasNoite, fracaoCelular, somaPeriodo, telaDoDia, telaUltimasHoras } from './audienciaNoite';
import { CurvaNoite, OndeEAparelho } from './MedicaoNoite';

const CHAVE_AUD = ['admin', 'audiencia'] as const;
const CHAVE_DIV = ['admin', 'divulgacao'] as const;

class ErroAdmin extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

async function pedir<T>(rota: string, corpo?: unknown): Promise<T> {
  const r = await fetch(rota, {
    method: corpo === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: corpo === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new ErroAdmin(r.status, j.erro ?? `Erro ${r.status}`);
  return j;
}

export function SecaoAudiencia() {
  if (__DEMO__) {
    return (
      <div>
        <Cabecalho />
        <Callout tom="neutro" titulo="Só no servidor">
          A audiência é medida pelo servidor do Sintonia (páginas vistas, visitantes únicos, pico de pessoas ao mesmo tempo e origens, tudo agregado).
          Nesta prévia estática não há servidor nem medição.
        </Callout>
      </div>
    );
  }
  return <SecaoAudienciaServidor />;
}

function Cabecalho({ acoes }: { acoes?: React.ReactNode }) {
  return (
    <CabecalhoSecao
      titulo="Audiência"
      icone="grade"
      descricao="Números reais medidos pelo próprio site: só agregados, sem cookie e sem guardar IP. É o que pode ir para a página Anuncie."
      acoes={acoes}
    />
  );
}

function SecaoAudienciaServidor() {
  const { confirmar } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: CHAVE_AUD, queryFn: () => pedir<AudienciaAdmin>('/api/admin/audiencia'), refetchInterval: 15_000, refetchIntervalInBackground: false });
  const d = q.data;

  async function zerar() {
    const ok = await confirmar({
      titulo: 'Zerar a medição?',
      descricao: 'Apaga o pico, os dias, as horas e as origens. Use só para limpar testes antes do lançamento. Não dá para desfazer.',
      confirmar: 'Zerar',
      perigo: true,
    });
    if (!ok) return;
    try {
      qc.setQueryData(CHAVE_AUD, await pedir<AudienciaAdmin>('/api/admin/audiencia', { acao: 'zerar' }));
      toast('Medição zerada', { tone: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível zerar.', { tone: 'alert' });
    }
  }

  if (!d) {
    return (
      <div>
        <Cabecalho />
        {q.isError ? (
          <Callout tom="alerta" titulo="Não foi possível carregar a audiência">
            {q.error instanceof Error ? q.error.message : 'Tente de novo em instantes.'}
          </Callout>
        ) : (
          <p className="text-[14px] text-fg-muted">Carregando…</p>
        )}
      </div>
    );
  }

  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const hoje = d.dias.at(-1);
  const diaHoje = diaBrasilia(Date.now());
  const ehHoje = hoje && hoje.dia === diaHoje;
  // I14 (opcionais: servidor anterior à leva 3 não manda)
  const telaHoje = d.horasTela ? telaDoDia(d.horasTela, diaHoje) : null;
  const celular = d.porAparelho ? fracaoCelular(somaPeriodo(d.porAparelho, diaHoje, 1)) : null;

  return (
    <div>
      <Cabecalho
        acoes={
          <>
            <Button size="sm" variant="outline" icon="download" onClick={() => baixarArquivo(`sintonia-audiencia-dias-${carimbo}.csv`, csvAudienciaDias(d.dias))} disabled={!d.dias.length}>
              CSV por dia
            </Button>
            <Button size="sm" variant="ghost" icon="download" onClick={() => baixarArquivo(`sintonia-audiencia-horas-${carimbo}.csv`, csvHorasNoite(d.horas, d.horasTela))}>
              Por hora
            </Button>
            <Button size="sm" variant="ghost" icon="download" onClick={() => baixarArquivo(`sintonia-audiencia-origens-${carimbo}.csv`, csvOrigens(d.dias))} disabled={!d.dias.length}>
              Origens
            </Button>
          </>
        }
      />

      <ul className="mb-4 grid grid-cols-2 gap-3 lg:mb-5 lg:grid-cols-3 lg:gap-4">
        <Cartao
          rotulo="Pessoas agora"
          valor={fmtInt(d.agora.pessoas)}
          sub={d.agora.em ? `sinal das páginas · servidor (só referência) ${fmtInt(d.agora.servidor)}` : 'aguardando a 1ª amostra'}
          vivo
        />
        <Cartao rotulo="Pico ao mesmo tempo" valor={d.pico ? fmtInt(d.pico.valor) : '—'} sub={d.pico ? `em ${fmtDataHora(d.pico.em)}` : 'sem medição ainda'} destaque />
        <Cartao rotulo="Únicos hoje" valor={ehHoje ? fmtInt(hoje.unicos) : '0'} sub={ehHoje && hoje.reinicios ? `pelo maior trecho (${fmtInt(hoje.reinicios)} reinício${hoje.reinicios > 1 ? 's' : ''})` : 'estimativa conservadora'} />
        <Cartao rotulo="Páginas hoje" valor={ehHoje ? fmtInt(hoje.paginas) : '0'} sub={ehHoje ? `${fmtInt(hoje.entradas)} entradas` : 'nenhuma ainda'} />
        <Cartao
          rotulo="Horas de tela hoje"
          valor={telaHoje === null ? '—' : fmtHoras(telaHoje)}
          sub={telaHoje === null ? 'servidor sem a medição da noite' : `últimas 24 h: ${fmtHoras(telaUltimasHoras(d.horasTela, 24))} h`}
        />
        <Cartao
          rotulo="No celular hoje"
          valor={celular === null ? '—' : fmtPct(celular * 100, 0)}
          sub={celular === null ? (d.porAparelho ? 'nenhuma página ainda' : 'servidor sem a medição da noite') : `das páginas · ${fmtPct((1 - celular) * 100, 0)} computador ou tablet`}
        />
      </ul>

      <Concentracao agora={d.agora.concentracao} pico={d.pico?.concentracao} />

      <CurvaNoite d={d} />

      <Painel titulo="Últimas 48 horas" icone="relogio" subtitulo="Páginas vistas por hora e o pico de pessoas ao mesmo tempo em cada hora (Brasília)." className="mb-4 lg:mb-5">
        {/* o servidor manda 14 dias (CSV "Por hora"); o gráfico continua nas últimas 48 h */}
        <Barras horas={d.horas.slice(-AUDIENCIA.horasGrafico)} />
      </Painel>

      <OndeEAparelho d={d} />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:mb-5 lg:gap-5 xl:grid-cols-2">
        <PorDia dias={d.dias} tela={d.horasTela} />
        <div className="grid grid-cols-1 gap-4 lg:gap-5">
          <Ranking
            titulo="Seções do site · 7 dias"
            icone="lista"
            vazio="Nenhuma página vista ainda."
            itens={somaPorGrupo(d.dias).map(([g, n]) => ({ chave: g, rotulo: ROTULO_GRUPO[g], valor: n, fora: g === 'widgets' || g === 'live' }))}
            nota="Widgets em outros sites e o modo streamer (OBS) aparecem aqui, mas não entram nas páginas vistas, nos únicos nem no pico."
          />
          <Ranking
            titulo="De onde vêm as visitas · 7 dias"
            icone="link"
            vazio="Nenhuma entrada ainda."
            itens={somaOrigens(d.dias).map((o) => ({ chave: o.origem, rotulo: o.rotulo, valor: o.entradas }))}
            nota="Entrada = 1ª página de cada aba. Só a família (rede social, buscador) ou o domínio de quem mandou o link; nunca o endereço completo. Apps como o WhatsApp não informam a origem: aparecem em “Direto”."
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:mb-5 lg:gap-5 xl:grid-cols-2">
        <PaginaAnuncie d={d} />
        <Redes />
      </div>

      <Painel titulo="Como medimos" icone="info">
        <ul className="space-y-2 text-[13.5px] leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">Pico de pessoas ao mesmo tempo:</strong> a cada 10 s, SÓ o sinal das páginas (abas visíveis do navegador
            que avisaram nos últimos {fmtInt(d.agora.intervaloS + 60)} s — passa pela Cloudflare). O “pessoas agora” do servidor (quem chegou à VPS em
            ~30 s) aparece só como referência: um único computador consegue inflá-lo, então ele nunca entra no pico nem na página Anuncie.
          </li>
          <li>
            <strong className="text-fg">Pessoa</strong> = rede + navegador, com hash e um sal que muda todo dia e nunca é gravado (rede = IPv4 inteiro ou
            o bloco /56 do IPv6, o de uma casa): na mesma rede e com o mesmo modelo de navegador, várias pessoas contam como uma. No máximo 50 pessoas
            novas por rede por dia e 10 a cada 30 s na presença. Os números ficam abaixo do real, nunca acima.
          </li>
          <li>
            <strong className="text-fg">Antes de vender:</strong> zere a medição depois do deploy (tira os testes), confira a concentração no pico e só
            então ligue os números na página Anuncie.
          </li>
          <li>
            <strong className="text-fg">Horas de tela:</strong> a cada amostra de 10 s, as pessoas com a página aberta e visível × 10 s, somadas por hora
            e por dia. É uma estimativa do tempo de atenção (aba escondida não conta).
          </li>
          <li>
            <strong className="text-fg">Aparelho, estado e país:</strong> cada página vista soma 1 no aparelho (o que o navegador informa:
            celular ou computador/tablet) e na UF e no país que a Cloudflare põe no pedido. Só a sigla vira número; cidade, CEP e coordenadas
            nunca são lidos. Detalhe por hora guardado por 14 dias; a curva minuto a minuto, por 24 h.
          </li>
          <li>Robôs, navegadores automatizados e quem liga “não rastrear” não contam. Nada de IP, cookie ou opinião é guardado.</li>
          <li>
            Se o servidor reinicia no meio do dia, os únicos do dia ficam pelo maior trecho. O sinal de presença fica mais espaçado com mais gente (agora:
            a cada <span className="num">{fmtInt(d.agora.intervaloS)}</span> s).
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-[12.5px] text-fg-subtle">
            Medindo desde <span className="num">{d.desde ? fmtDataHora(d.desde) : '—'}</span>.
          </p>
          <Button size="sm" variant="ghost" icon="reset" onClick={() => void zerar()} className="text-alert-fg">
            Zerar medição
          </Button>
        </div>
      </Painel>
    </div>
  );
}

// ---- peças -------------------------------------------------------------------------------------------------

/** Horas de tela: inteiro a partir de 10 h; abaixo, 1 casa ("0,4"). */
const fmtHoras = (h: number) => (h >= 10 ? fmtInt(h) : fmtDecimal(h, 1));

function Cartao({ rotulo, valor, sub, destaque, vivo }: { rotulo: string; valor: string; sub?: string; destaque?: boolean; vivo?: boolean }) {
  return (
    <li className={cn('min-w-0 rounded-2xl border bg-surface p-3.5 shadow-card sm:p-4', destaque ? 'border-brand/40' : 'border-line')}>
      <Rotulo className="flex items-center gap-1.5">
        {vivo ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" aria-hidden /> : null}
        {rotulo}
      </Rotulo>
      <span className="num mt-1.5 block truncate font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[30px]">{valor}</span>
      {sub ? <span className="num mt-1.5 block text-[11.5px] leading-snug text-fg-subtle">{sub}</span> : null}
    </li>
  );
}

/** Páginas por hora (em cima) e pico por hora (embaixo), escalas próprias. Só tokens. */
function Barras({ horas }: { horas: HoraAudiencia[] }) {
  const maxP = Math.max(1, ...horas.map((h) => h.paginas));
  const maxK = Math.max(1, ...horas.map((h) => h.pico));
  const totP = horas.reduce((s, h) => s + h.paginas, 0);
  const altura = (v: number, max: number) => (v > 0 ? `${Math.max(8, (100 * v) / max)}%` : '2px');
  return (
    <div role="img" aria-label={`Últimas 48 horas: ${fmtInt(totP)} páginas vistas; maior pico por hora ${fmtInt(Math.max(0, ...horas.map((h) => h.pico)))} pessoas`}>
      <div className="flex h-24 items-end gap-[2px]" aria-hidden>
        {horas.map((h) => (
          <span key={h.hora} className="flex h-full min-w-0 flex-1 items-end" title={`${fmtDataHora(h.hora)} · ${fmtInt(h.paginas)} páginas · pico ${fmtInt(h.pico)}`}>
            <span className={cn('block w-full rounded-[2px]', h.paginas > 0 ? 'bg-brand-2/80' : 'bg-surface-3')} style={{ height: altura(h.paginas, maxP) }} />
          </span>
        ))}
      </div>
      <div className="mt-[3px] flex h-8 items-start gap-[2px]" aria-hidden>
        {horas.map((h) => (
          <span key={h.hora} className="flex h-full min-w-0 flex-1 items-start">
            <span className={cn('block w-full rounded-[2px]', h.pico > 0 ? 'bg-ok/75' : 'bg-surface-3/70')} style={{ height: altura(h.pico, maxK) }} />
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span className="num">{horas.length ? fmtDataHora(horas[0].hora) : ''}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-brand-2/80" aria-hidden />
            páginas
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px] bg-ok/75" aria-hidden />
            pico
          </span>
        </span>
        <span className="num">{horas.length ? fmtHora(horas[horas.length - 1].hora) : ''}</span>
      </div>
    </div>
  );
}

function PorDia({ dias, tela }: { dias: AudienciaAdmin['dias']; tela?: AudienciaAdmin['horasTela'] }) {
  const ultimos = [...dias].reverse().slice(0, 14);
  const maxU = Math.max(1, ...ultimos.map((d) => d.unicos));
  const comTela = !!tela;
  return (
    <Painel titulo="Por dia" icone="calendario" subtitulo="Últimos 14 dias (Brasília). O CSV traz todos, com as seções do site." semPadding className="xl:self-start">
      {ultimos.length ? (
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <th scope="col" className="py-2 pl-4 pr-2 font-semibold sm:pl-5">
                Dia
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Únicos
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Páginas
              </th>
              <th scope="col" className={cn('py-2 pl-2 pr-4 text-right font-semibold sm:pr-5', comTela && 'sm:pr-2')}>
                Pico
              </th>
              {/* horas de tela: coluna própria a partir de 640 px; no celular, embaixo das páginas */}
              {comTela ? (
                <th scope="col" className="hidden py-2 pl-2 pr-4 text-right font-semibold sm:table-cell sm:pr-5" title="Horas de tela">
                  Tela (h)
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--line)/var(--line-alpha))]">
            {ultimos.map((d) => (
              <tr key={d.dia}>
                <td className="py-2.5 pl-4 pr-2 sm:pl-5">
                  <span className="num font-medium text-fg">{fmtDia(d.dia).slice(0, 5)}</span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className="block h-full rounded-full bg-brand-2/70" style={{ width: `${(100 * d.unicos) / maxU}%` }} />
                  </span>
                </td>
                <td className="num px-2 py-2.5 text-right text-fg">{fmtInt(d.unicos)}</td>
                <td className="num px-2 py-2.5 text-right text-fg-muted">
                  {fmtInt(d.paginas)}
                  {comTela ? <span className="block text-[11px] text-fg-subtle sm:hidden">{fmtHoras(telaDoDia(tela, d.dia))} h tela</span> : null}
                </td>
                <td className={cn('num py-2.5 pl-2 pr-4 text-right text-fg-muted sm:pr-5', comTela && 'sm:pr-2')} title={d.pico ? fmtDataHora(d.pico.em) : undefined}>
                  {d.pico ? fmtInt(d.pico.valor) : '—'}
                  {d.pico ? <span className="block text-[11px] text-fg-subtle">{fmtHora(d.pico.em)}</span> : null}
                </td>
                {comTela ? <td className="num hidden py-2.5 pl-2 pr-4 text-right text-fg-muted sm:table-cell sm:pr-5">{fmtHoras(telaDoDia(tela, d.dia))}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 pb-5 pt-4 text-[13.5px] text-fg-muted sm:px-5">Nenhuma visita medida ainda.</p>
      )}
    </Painel>
  );
}

function Ranking({
  titulo,
  icone,
  itens,
  vazio,
  nota,
}: {
  titulo: string;
  icone: 'lista' | 'link';
  itens: { chave: string; rotulo: string; valor: number; fora?: boolean }[];
  vazio: string;
  nota?: string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <Painel titulo={titulo} icone={icone}>
      {itens.length ? (
        <ul className="space-y-2.5">
          {itens.map((i) => (
            <li key={i.chave} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className={cn('min-w-0 truncate', i.fora ? 'text-fg-subtle' : 'text-fg')}>{i.rotulo}</span>
                <span className="num shrink-0 text-fg-muted">{fmtInt(i.valor)}</span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className={cn('block h-full rounded-full', i.fora ? 'bg-fg-subtle/50' : 'bg-brand-2/75')} style={{ width: `${(100 * i.valor) / max}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-fg-muted">{vazio}</p>
      )}
      {nota ? <p className="mt-3 text-[12px] leading-snug text-fg-subtle">{nota}</p> : null}
    </Painel>
  );
}

// ---- configuração ------------------------------------------------------------------------------------------

function useDivulgacaoAdmin() {
  return useQuery({ queryKey: CHAVE_DIV, queryFn: () => pedir<DivulgacaoConfig>('/api/admin/divulgacao'), staleTime: 30_000 });
}

function PaginaAnuncie({ d }: { d: AudienciaAdmin }) {
  const qc = useQueryClient();
  const q = useDivulgacaoAdmin();
  const [salvando, setSalvando] = useState(false);
  const ligado = q.data?.mostrarAudiencia === true;
  async function alternar(v: boolean) {
    setSalvando(true);
    try {
      qc.setQueryData(CHAVE_DIV, await pedir<DivulgacaoConfig>('/api/admin/divulgacao', { mostrarAudiencia: v }));
      toast(v ? 'A página Anuncie mostra a audiência medida' : 'Audiência fora da página Anuncie', { tone: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'alert' });
    } finally {
      setSalvando(false);
    }
  }
  const pub = d.publico;
  return (
    <Painel
      titulo="Página Anuncie"
      icone="bandeira"
      subtitulo="Os números medidos, exatamente como aparecem em /anuncie (visível em até ~3 min)."
      acoes={
        <a href={urlPublica('/anuncie#audiencia')} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-fg hover:underline">
          Ver página <Icon name="externo" size={13} />
        </a>
      }
    >
      <Toggle
        checked={ligado}
        onChange={(v) => void alternar(v)}
        disabled={!q.data || salvando}
        label="Mostrar audiência na página /anuncie"
        description="Desligado: a página não mostra número nenhum. Ligado: pico, maior dia e páginas vistas, com “desde <data>”."
      />
      <div className="mt-4 rounded-xl border border-dashed border-line bg-bg/50 p-3">
        <Rotulo className="mb-2">Prévia</Rotulo>
        {pub && temNumeros(pub) ? (
          <NumerosAudiencia audiencia={pub} compacto />
        ) : (
          <p className="text-[13px] text-fg-muted">Ainda não há medição: com o interruptor ligado, a seção simplesmente não aparece.</p>
        )}
      </div>
    </Painel>
  );
}

function Redes() {
  const qc = useQueryClient();
  const q = useDivulgacaoAdmin();
  const atual = q.data?.redes;
  const [rascunho, setRascunho] = useState<Record<RedeSintonia, string>>(() => vazio());
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (atual) setRascunho({ ...vazio(), ...atual });
  }, [atual]);
  const v = useMemo(() => validaRedes(rascunho), [rascunho]);
  const igual = REDES.every((r) => (atual?.[r] ?? '') === rascunho[r].trim());
  async function salvar() {
    if ('erro' in v) return;
    setSalvando(true);
    try {
      qc.setQueryData(CHAVE_DIV, await pedir<DivulgacaoConfig>('/api/admin/divulgacao', { redes: v.ok }));
      toast('Redes do Sintonia salvas', { tone: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'alert' });
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Painel titulo="Siga o Sintonia" icone="compartilhar" subtitulo="Redes do próprio Sintonia: aparecem no rodapé, no fim do resultado do Teste Cego e em /anuncie. Vazio = não aparece.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {REDES.map((r) => (
          <div key={r} className="flex items-end gap-2.5">
            <span className="mb-[9px] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted">
              <IconeRede rede={r} size={16} />
            </span>
            <Campo
              rotulo={ROTULO_REDE[r]}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={rascunho[r]}
              placeholder={EXEMPLO_REDE[r]}
              onChange={(e) => setRascunho((x) => ({ ...x, [r]: e.target.value }))}
              wrapperClassName="min-w-0 flex-1"
              aria-invalid={'erro' in v && v.rede === r ? true : undefined}
            />
          </div>
        ))}
        {'erro' in v ? <p className="text-[12.5px] font-medium text-alert-fg">{v.erro}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon="check" disabled={!q.data || 'erro' in v || igual} loading={salvando}>
            {igual ? 'Salvo' : 'Salvar redes'}
          </Button>
        </div>
      </form>
    </Painel>
  );
}

const vazio = (): Record<RedeSintonia, string> => Object.fromEntries(REDES.map((r) => [r, ''])) as Record<RedeSintonia, string>;

/**
 * Concentração da presença (agora e no pico): quantas redes mandaram sinal e quanto as 10 maiores somam. Uma rede só com
 * fatia grande = possível inflação (ou um CGNAT grande de operadora) — conferir antes de usar o número na venda.
 */
function Concentracao({ agora, pico }: { agora?: ConcentracaoAudiencia; pico?: ConcentracaoAudiencia }) {
  if (!agora?.redes && !pico?.redes) return null;
  const linha = (c: ConcentracaoAudiencia | undefined, rotulo: string) => {
    if (!c?.redes) return null;
    const soma = c.top.reduce((s, x) => s + x, 0);
    const alta = (c.top[0] ?? 0) > 0.2 || soma > 0.5;
    return (
      <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-fg">{rotulo}:</span>
        <span>
          <span className="num font-semibold text-fg">{fmtInt(c.redes)}</span> {c.redes === 1 ? 'rede' : 'redes'}; as {Math.min(10, c.top.length)} maiores somam{' '}
          <span className="num font-semibold text-fg">{fmtPct(soma * 100, 1)}</span>
          {c.top.length ? (
            <>
              {' '}
              (a maior, <span className="num">{fmtPct((c.top[0] ?? 0) * 100, 1)}</span>)
            </>
          ) : null}
        </span>
        {alta ? <span className="text-[12px] font-semibold text-alert-fg">concentração alta: confira antes de usar na venda</span> : null}
      </li>
    );
  };
  return (
    <Painel titulo="Concentração por rede" icone="grade" subtitulo="De quantas redes veio o sinal de presença (sem identificar nenhuma)." className="mb-4 lg:mb-5">
      <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-fg-muted">
        {linha(agora, 'Agora')}
        {linha(pico, 'No pico')}
      </ul>
    </Painel>
  );
}
