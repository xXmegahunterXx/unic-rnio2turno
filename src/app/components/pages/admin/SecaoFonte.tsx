/**
 * Seção "Fonte de dados": Pré-eleição · Simulação · TSE ao vivo (comando `fonte`, sempre com confirmação),
 * configuração do feed oficial (comando `tse`) e teste de conexão (`admin.testarTse()`).
 *
 * Leva 3 (frente B):
 *  - teto de pedidos por segundo ao TSE (`tse.limitePorSeg`, I03; padrão 40, 5–90);
 *  - "Leituras do TSE agora" (GET /api/admin/tse/health a cada 5 s): pausa por bloqueio do TSE com "Retomar agora"
 *    (comando `tse-retomar`, para falso positivo), ritmo de pedidos e o arquivo nacional parado (I18);
 *  - "Alertas no celular" (I16): o que é vigiado e "Enviar alerta de teste" (comando `alerta-teste`). Desligados sem
 *    TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID no servidor — o teste responde dizendo isso.
 */
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FonteDados, TseConfig } from '@/shared/types';
import { INICIO_APURACAO, TSE_LIMITE_POR_SEG } from '@/shared/constants';
import { chavesNoite } from '@/shared/chaves-noite';
import { fmtDataHora, fmtHora, fmtHoraSeg, fmtInt } from '@/shared/format';
import { getClient } from '@/app/data/client';
import { anonimizarRace } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Countdown, Icon, Toggle, toast } from '@/app/ui';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Campo, Painel, Rotulo } from './kit';
import { FONTE_ICONE, FONTE_ROTULO, fmtMs, mensagemErro } from './rotulos';
import { TrocaAutomatica } from './TrocaAutomatica';

const FONTES: FonteDados[] = ['pre', 'simulacao', 'tse'];

const DESCRICAO: Record<FonteDados, string> = {
  pre: 'O site mostra o resultado real do 1º turno e a contagem regressiva para as 17h de 25/10.',
  simulacao: 'Números fictícios gerados pelo motor, com a faixa “SIMULAÇÃO” em todas as páginas. Controlados por este painel.',
  tse: 'Dados oficiais do feed do TSE (resultados.tse.jus.br), consultados no intervalo configurado.',
};

function impacto(f: FonteDados, intervalo: number, prioritario: number): ReactNode {
  if (f === 'pre')
    return 'Os visitantes deixam de ver a apuração do 2º turno: as páginas voltam a mostrar o 1º turno real e a contagem regressiva. A simulação e o relógio deste painel deixam de aparecer no site.';
  if (f === 'simulacao')
    return 'Todos os visitantes passam a ver números SIMULADOS (com a faixa “SIMULAÇÃO · dados fictícios”), conforme o relógio e o cenário deste painel.';
  return (
    <>
      Todos os visitantes passam a ver os dados oficiais do TSE: o resumo nacional de Presidente consultado a cada {prioritario} s e os demais
      arquivos a cada {intervalo} s. Antes das 17h de 25/10 as disputas do 2º turno aparecem zeradas.
      {__DEMO__ ? ' Na demonstração não há servidor para consultar o TSE: as páginas mostram o 2º turno zerado.' : ''}
    </>
  );
}

type CampoTse = Exclude<keyof TseConfig, 'intervaloSeg' | 'intervaloPrioritarioSeg' | 'limitePorSeg'>;
const CAMPOS: { k: CampoTse; rotulo: string; dica?: string }[] = [
  { k: 'ciclo', rotulo: 'Ciclo', dica: 'ele2026' },
  { k: 'pleito', rotulo: 'Pleito (2º turno)', dica: '3221' },
  { k: 'eleicaoPres', rotulo: 'Eleição · Presidente', dica: '6258' },
  { k: 'eleicaoGov', rotulo: 'Eleição · Governador', dica: '6260' },
];

export function SecaoFonte() {
  const { snap, run, pendente, confirmar } = useAdmin();
  const atual = snap.state.fonte;
  const tse = snap.state.tse;
  const [ed, setEd] = useState<Partial<TseConfig>>({});
  const [teste, setTeste] = useState<{ ok: boolean; detalhe: string; amostra?: unknown; ms: number; em: number } | null>(null);
  const [testando, setTestando] = useState(false);
  /** Produção sem ALLOW_SIMULACAO: o servidor recusa a simulação (o motivo vem do servidor). */
  const simBloqueada = snap.servidor?.simulacao.permitida === false ? snap.servidor.simulacao.motivo : null;

  async function trocar(f: FonteDados) {
    if (f === atual) return;
    if (f === 'simulacao' && simBloqueada) {
      toast(simBloqueada, { tone: 'alert', duracao: 6000 });
      return;
    }
    const ok = await confirmar({
      titulo: `Trocar a fonte para “${FONTE_ROTULO[f]}”?`,
      descricao: `Hoje: ${FONTE_ROTULO[atual]}. A mudança vale na hora para todos os visitantes.`,
      corpo: impacto(f, tse.intervaloSeg, tse.intervaloPrioritarioSeg ?? 5),
      confirmar: `Usar ${FONTE_ROTULO[f]}`,
      perigo: true,
    });
    if (!ok) return;
    await run({ tipo: 'fonte', fonte: f }, { chave: 'fonte', sucesso: `Fonte: ${FONTE_ROTULO[f]}` });
  }

  const valor = <K extends keyof TseConfig>(k: K): TseConfig[K] => (ed[k] ?? tse[k]) as TseConfig[K];
  const alterados = (Object.keys(ed) as (keyof TseConfig)[]).filter((k) => ed[k] !== undefined && ed[k] !== tse[k]);
  const intervaloInvalido = !(valor('intervaloSeg') >= 5 && valor('intervaloSeg') <= 600);
  // resumo nacional de Presidente (arquivo prioritário): padrão 5 s; ausente em estados antigos
  const prioritario = valor('intervaloPrioritarioSeg') ?? 5;
  const prioritarioInvalido = !(prioritario >= 3 && prioritario <= 600);
  // teto de pedidos por segundo ao TSE (I03): ausente em estados antigos = padrão
  const limite = valor('limitePorSeg') ?? TSE_LIMITE_POR_SEG.padrao;
  const limiteInvalido = !(Number.isInteger(limite) && limite >= TSE_LIMITE_POR_SEG.min && limite <= TSE_LIMITE_POR_SEG.max);
  const vazio = (['baseUrl', ...CAMPOS.map((c) => c.k)] as CampoTse[]).some((k) => !String(valor(k)).trim());

  async function salvar() {
    const parcial: Partial<TseConfig> = {};
    for (const k of alterados) (parcial as Record<string, unknown>)[k] = ed[k];
    const s = await run({ tipo: 'tse', tse: parcial }, { chave: 'tse', sucesso: 'Configuração do TSE salva' });
    if (s) setEd({});
  }

  async function testar() {
    setTestando(true);
    const t0 = performance.now();
    try {
      const c = await getClient();
      const r = await c.admin.testarTse();
      setTeste({ ...r, ms: performance.now() - t0, em: Date.now() });
    } catch (e) {
      setTeste({ ok: false, detalhe: mensagemErro(e), ms: performance.now() - t0, em: Date.now() });
    } finally {
      setTestando(false);
    }
  }

  return (
    <div>
      <CabecalhoSecao
        titulo="Fonte de dados"
        icone="globo"
        descricao="De onde vêm os números que todos os visitantes veem. Trocar a fonte sempre pede confirmação."
      />

      <div role="radiogroup" aria-label="Fonte de dados" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {FONTES.map((f) => {
          const ativo = f === atual;
          const bloqueada = f === 'simulacao' && !!simBloqueada && !ativo;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={ativo}
              aria-disabled={bloqueada || undefined}
              onClick={() => void trocar(f)}
              disabled={pendente('fonte')}
              title={bloqueada ? simBloqueada ?? undefined : undefined}
              className={cn(
                'group relative flex min-w-0 flex-col rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] sm:p-5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                ativo
                  ? 'border-brand/50 bg-brand/[0.08] shadow-glow'
                  : bloqueada
                    ? 'cursor-not-allowed border-dashed border-line bg-surface/60'
                    : 'border-line bg-surface shadow-card hover:border-line/[2.5] hover:bg-surface-2/60',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-xl border',
                    ativo ? 'border-brand/40 bg-brand/15 text-brand-fg' : 'border-line bg-surface-2 text-fg-muted group-hover:text-fg',
                  )}
                >
                  <Icon name={FONTE_ICONE[f]} size={20} />
                </span>
                {ativo ? (
                  <Badge tone="brand" size="sm" icon="check" caps>
                    Em uso
                  </Badge>
                ) : bloqueada ? (
                  <Badge tone="neutral" size="sm" icon="olho-fechado" caps>
                    Bloqueada
                  </Badge>
                ) : (
                  <span className="text-[12.5px] font-medium text-fg-subtle group-hover:text-fg-muted">Usar esta fonte</span>
                )}
              </div>
              <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.01em] text-fg">{FONTE_ROTULO[f]}</h3>
              <p className="mt-1 text-pretty text-[13px] leading-relaxed text-fg-muted">{DESCRICAO[f]}</p>
              <div className="mt-auto pt-4">
                {f === 'pre' ? (
                  <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2.5">
                    <Rotulo>Apuração começa em</Rotulo>
                    <Countdown target={INICIO_APURACAO} size="sm" className="mt-2" />
                  </div>
                ) : f === 'simulacao' && bloqueada ? (
                  <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 text-[12.5px] leading-snug text-fg-muted">
                    Servidor em produção: a simulação só vai ao ar com <span className="font-mono text-[11.5px] text-fg">ALLOW_SIMULACAO=1</span>.
                  </div>
                ) : f === 'simulacao' ? (
                  <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 text-[12.5px] text-fg-muted">
                    Relógio a <span className="num font-semibold text-fg">{snap.state.relogio.velocidade}×</span> · semente{' '}
                    <span className="num font-semibold text-fg">{snap.state.cenario.seed}</span>
                  </div>
                ) : (
                  <div className="truncate rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 font-mono text-[11.5px] text-fg-muted">
                    {tse.baseUrl.replace(/^https?:\/\//, '')} · {tse.intervaloPrioritarioSeg ?? 5} s / {tse.intervaloSeg} s
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <TrocaAutomatica className="mt-4 lg:mt-5" />

      <NomesNaSimulacao />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Painel titulo="Feed do TSE" icone="configuracoes" subtitulo="Códigos do 2º turno de 2026 no feed oficial (resultados.tse.jus.br/oficial).">
          <div className="space-y-4">
            <Campo
              rotulo="URL base"
              mono
              value={valor('baseUrl')}
              onChange={(e) => setEd((x) => ({ ...x, baseUrl: e.target.value }))}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS.map((c) => (
                <Campo
                  key={c.k}
                  rotulo={c.rotulo}
                  mono
                  value={valor(c.k)}
                  placeholder={c.dica}
                  onChange={(e) => setEd((x) => ({ ...x, [c.k]: e.target.value }))}
                  spellCheck={false}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                rotulo="Placar nacional (Presidente)"
                inputMode="numeric"
                sufixo="s"
                value={String(prioritario)}
                onChange={(e) => setEd((x) => ({ ...x, intervaloPrioritarioSeg: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 }))}
                erro={prioritarioInvalido ? 'Entre 3 e 600 segundos.' : undefined}
                dica="Só o resumo Brasil (arquivo pequeno, pedido condicional). Entre 3 e 600 s; padrão 5 s."
              />
              <Campo
                rotulo="Demais arquivos"
                inputMode="numeric"
                sufixo="s"
                value={String(valor('intervaloSeg'))}
                onChange={(e) => setEd((x) => ({ ...x, intervaloSeg: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 }))}
                erro={intervaloInvalido ? 'Entre 5 e 600 segundos.' : undefined}
                dica="Estados e governadores. Entre 5 e 600 s; com o TSE falhando, o servidor espera mais (backoff)."
              />
            </div>
            <Campo
              rotulo="Teto de pedidos ao TSE"
              inputMode="numeric"
              sufixo="por s"
              value={String(limite)}
              onChange={(e) => setEd((x) => ({ ...x, limitePorSeg: Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || 0 }))}
              erro={limiteInvalido ? `Entre ${TSE_LIMITE_POR_SEG.min} e ${TSE_LIMITE_POR_SEG.max} pedidos por segundo.` : undefined}
              dica={`Soma de tudo o que o servidor pede ao TSE, com uma fatia reservada para o placar nacional e os estados. Entre ${TSE_LIMITE_POR_SEG.min} e ${TSE_LIMITE_POR_SEG.max}; padrão ${TSE_LIMITE_POR_SEG.padrao}. Vale na hora.`}
            />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {alterados.length ? (
                <Button variant="ghost" onClick={() => setEd({})} className="mr-auto">
                  Descartar
                </Button>
              ) : null}
              <Button variant="outline" icon="ao-vivo" onClick={testar} loading={testando}>
                Testar conexão
              </Button>
              <Button
                variant="primary"
                icon="check"
                onClick={salvar}
                disabled={!alterados.length || intervaloInvalido || prioritarioInvalido || limiteInvalido || vazio}
                loading={pendente('tse')}
              >
                Salvar
              </Button>
            </div>
          </div>
        </Painel>

        <Painel titulo="Teste de conexão" icone="ao-vivo" subtitulo="Consulta o feed com a configuração salva e mostra uma amostra.">
          {testando ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-4 py-5 text-[13.5px] text-fg-muted">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand" />
              Consultando o TSE… pode levar alguns segundos.
            </div>
          ) : teste ? (
            <div className="space-y-3">
              <Callout tom={teste.ok ? 'ok' : 'alerta'} titulo={teste.ok ? 'Conexão funcionando' : 'Falha na conexão'}>
                {teste.detalhe}
              </Callout>
              <p className="num text-[12px] text-fg-muted">
                Resposta em {fmtMs(teste.ms)} · testado às {fmtDataHora(teste.em)}
              </p>
              {teste.amostra !== undefined ? (
                <details className="group rounded-xl border border-line bg-surface-2/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[13px] font-medium text-fg">
                    Amostra da resposta
                    <Icon name="chevron" size={16} className="text-fg-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <pre className="max-h-64 overflow-auto border-t border-line px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-fg-muted">
                    {JSON.stringify(teste.amostra, null, 2).slice(0, 4000)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-fg-muted">
              Nenhum teste ainda. Use “Testar conexão”.
            </div>
          )}
          {__DEMO__ ? (
            <p className="mt-3 text-[12.5px] leading-snug text-fg-subtle">
              Na demonstração (site estático) não há servidor para consultar o TSE; o teste informa isso.
            </p>
          ) : null}
        </Painel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <LeiturasTse />
        <AlertasCelular />
      </div>
    </div>
  );
}

/** O que o painel lê de GET /api/admin/tse/health (TseHealth do servidor; só os campos usados aqui). */
interface SaudeTsePainel {
  ok: boolean;
  rodando: boolean;
  bloqueio?: { desde: number; ate: number; motivoTexto: string; arquivo: string; porRetryAfter: boolean } | null;
  prioritario: { falhasConsecutivas: number; ultimaLeituraOk: number | null; erro: string | null } | null;
  corridas: { race: string; falhasConsecutivas: number; erro: string | null; nacionalParadoDesde?: number | null }[];
  http: { requisicoes: number; limitePorSeg?: number; ritmo?: { ultimos10s: number; picoSeg: number }; bloqueios?: number };
}

/** Saúde do adaptador do TSE (servidor). null = a fonte TSE ainda não foi criada neste processo. */
function useSaudeTse() {
  return useQuery<SaudeTsePainel | null>({
    queryKey: ['admin', 'tse-saude'],
    enabled: !__DEMO__,
    queryFn: async () => {
      const r = await fetch('/api/admin/tse/health', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      return (await r.json()) as SaudeTsePainel | null;
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
  });
}

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <span className="block text-[11.5px] font-medium leading-tight text-fg-muted">{rotulo}</span>
      <span className="num mt-1 block truncate font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] text-fg">{valor}</span>
      {sub ? <span className="mt-0.5 block text-[11.5px] leading-tight text-fg-subtle">{sub}</span> : null}
    </div>
  );
}

/**
 * "Leituras do TSE agora" (I03 e I18): pausa por bloqueio do TSE com "Retomar agora", ritmo dos pedidos contra o teto e
 * o arquivo nacional parado. Só no servidor (no demo não há TSE).
 */
function LeiturasTse() {
  const { snap, run, pendente, confirmar } = useAdmin();
  const qc = useQueryClient();
  const q = useSaudeTse();
  const h = q.data ?? null;
  const b = h?.bloqueio ?? null;
  const pres = h?.corridas.find((c) => c.race === 'pres') ?? null;
  const parado = pres?.nacionalParadoDesde ?? null;
  const avisoNacional = chavesNoite(snap.state).avisoNacional;
  const ritmo = h?.http.ritmo;
  const teto = h?.http.limitePorSeg ?? snap.state.tse.limitePorSeg ?? TSE_LIMITE_POR_SEG.padrao;

  async function retomar() {
    const ok = await confirmar({
      titulo: 'Retomar as leituras do TSE agora?',
      descricao: b ? `Pausa prevista até ${fmtHoraSeg(b.ate)} (${b.motivoTexto}).` : undefined,
      corpo: (
        <>
          Use só se tiver certeza de que foi engano (falso positivo). Se o TSE ainda estiver limitando, a pausa recomeça na
          primeira leitura — e insistir pode prolongar o bloqueio do lado deles.
        </>
      ),
      confirmar: 'Retomar agora',
      perigo: true,
    });
    if (!ok) return;
    const s = await run({ tipo: 'tse-retomar' }, { chave: 'tse-retomar', sucesso: 'Leituras do TSE retomadas' });
    if (s) void qc.invalidateQueries({ queryKey: ['admin', 'tse-saude'] });
  }

  return (
    <Painel
      titulo="Leituras do TSE agora"
      icone="ao-vivo"
      subtitulo="O servidor respeita o teto de pedidos e para tudo se o TSE limitar as leituras (429 ou bloqueio da borda deles)."
      acoes={
        __DEMO__ ? null : b ? (
          <Badge tone="alert" size="sm" dot caps>
            Pausadas
          </Badge>
        ) : h?.rodando ? (
          <Badge tone="ok" size="sm" dot caps>
            Lendo
          </Badge>
        ) : h ? (
          <Badge tone="neutral" size="sm" caps>
            Parado
          </Badge>
        ) : null
      }
    >
      {__DEMO__ ? (
        <p className="text-[13px] leading-snug text-fg-muted">Na demonstração (site estático) não há servidor lendo o TSE.</p>
      ) : q.isError ? (
        <Callout tom="neutro">Não consegui ler a situação do TSE agora ({mensagemErro(q.error)}). Tento de novo em 5 s.</Callout>
      ) : !h ? (
        <p className="text-[13px] leading-snug text-fg-muted">
          {q.isLoading
            ? 'Carregando…'
            : 'A fonte TSE ainda não foi usada desde que o servidor subiu. A situação aparece aqui quando ela estiver ligada (ou depois de “Testar conexão”).'}
        </p>
      ) : (
        <div className="space-y-3.5">
          {b ? (
            <Callout tom="alerta" titulo="O TSE está limitando as leituras">
              {b.motivoTexto} em <span className="break-all font-mono text-[11.5px] text-fg">{b.arquivo}</span>, às{' '}
              <span className="num">{fmtHoraSeg(b.desde)}</span>. Nenhum pedido sai até{' '}
              <span className="num font-semibold text-fg">{fmtHoraSeg(b.ate)}</span>
              {b.porRetryAfter ? ' (prazo dado pelo TSE)' : ' (pausa padrão de 11 min)'}; depois o servidor tenta de novo sozinho. O site
              mostra o último dado bom e avisa “O TSE está limitando leituras”.
              <div className="mt-3">
                <Button variant="outline" size="sm" icon="play" onClick={() => void retomar()} loading={pendente('tse-retomar')}>
                  Retomar agora
                </Button>
              </div>
            </Callout>
          ) : (
            <Callout tom={h.rodando ? 'ok' : 'neutro'} titulo={h.rodando ? 'Lendo normalmente' : 'Leitura parada'}>
              {h.rodando
                ? `Sem bloqueio do TSE.${h.prioritario?.ultimaLeituraOk ? ` Última leitura boa do placar nacional às ${fmtHoraSeg(h.prioritario.ultimaLeituraOk)}.` : ''}`
                : 'A fonte em uso não é o TSE: o servidor não está pedindo nada a ele.'}
            </Callout>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Numero rotulo="Pedidos em 10 s" valor={ritmo ? fmtInt(ritmo.ultimos10s) : '—'} sub={`teto ${fmtInt(teto * 10)}`} />
            <Numero rotulo="Maior por segundo" valor={ritmo ? fmtInt(ritmo.picoSeg) : '—'} sub="no último minuto" />
            <Numero rotulo="Bloqueios" valor={fmtInt(h.http.bloqueios ?? 0)} sub="desde a subida" />
          </div>

          <Callout tom={parado ? 'info' : 'neutro'} titulo="Arquivo nacional de Presidente">
            {parado ? (
              <>
                Não muda desde <span className="num font-semibold text-fg">{fmtHora(parado)}</span> enquanto os estados andam.
              </>
            ) : (
              'Em dia com os estados.'
            )}{' '}
            Aviso no site: <span className="font-medium text-fg">{avisoNacional === 'auto' ? 'automático' : 'desligado'}</span> (Controle →
            Chaves da noite).
          </Callout>
        </div>
      )}
    </Painel>
  );
}

/** "Alertas no celular" (I16): o que é vigiado e a mensagem de teste. */
function AlertasCelular() {
  const { run, pendente } = useAdmin();
  return (
    <Painel
      titulo="Alertas no celular"
      icone="alerta"
      subtitulo="Mensagem no Telegram em menos de 1 minuto quando algo sai do normal, e “resolvido” quando volta."
    >
      <ul className="space-y-1.5 text-[13px] leading-snug text-fg-muted">
        {[
          'placar nacional sem dado novo há 3 min (ou sem leitura boa do TSE)',
          'TSE limitando as leituras ou com erros seguidos',
          'erros 5xx acima de 1% ou lentidão (p99 acima de 1 s) por 2 min',
          'servidor reiniciado, arquivo nacional parado, troca automática atrasada e memória alta',
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <Icon name="check" size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] leading-snug text-fg-subtle">
        Cada tipo sai no máximo uma vez a cada 10 min. Ficam desligados até o servidor ter{' '}
        <span className="break-words font-mono text-[11.5px] text-fg-muted">TELEGRAM_BOT_TOKEN</span> e{' '}
        <span className="break-words font-mono text-[11.5px] text-fg-muted">TELEGRAM_CHAT_ID</span> no .env; o vigia externo usa{' '}
        <span className="break-words font-mono text-[11.5px] text-fg-muted">HC_PING_URL</span>.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <Button
          variant="outline"
          icon="ao-vivo"
          onClick={() => void run({ tipo: 'alerta-teste' }, { chave: 'alerta-teste', sucesso: 'Alerta de teste entregue ao Telegram' })}
          loading={pendente('alerta-teste')}
          disabled={__DEMO__}
        >
          Enviar alerta de teste
        </Button>
      </div>
    </Painel>
  );
}
/**
 * Interruptor "Mostrar nomes reais na simulação" (comando `nomes-reais`). Desligado por padrão: na fonte Simulação
 * os candidatos aparecem como "Candidato A/B" para que prints com números fictícios nunca circulem associados a
 * candidatos reais. Ligar pede confirmação.
 */
function NomesNaSimulacao() {
  const { snap, pres, run, pendente, confirmar } = useAdmin();
  const reais = !!snap.state.nomesReais;
  const sim = snap.state.fonte === 'simulacao';
  const ocupado = pendente('nomes-reais');

  async function alternar(ativo: boolean) {
    if (ativo) {
      const ok = await confirmar({
        titulo: 'Mostrar os nomes reais na simulação?',
        descricao: 'Uso interno: demonstrações para a equipe ou para parceiros, em ambiente controlado.',
        corpo: (
          <>
            Os números da simulação são <strong className="font-semibold text-fg">fictícios</strong>. Com os nomes reais, qualquer
            print ou imagem compartilhada pode circular como se fosse um resultado verdadeiro de candidatos reais. A faixa
            “SIMULAÇÃO” continua em todas as páginas, mas não impede recortes. Desligue assim que terminar.
          </>
        ),
        confirmar: 'Mostrar nomes reais',
        perigo: true,
      });
      if (!ok) return;
    }
    await run(
      { tipo: 'nomes-reais', ativo },
      { chave: 'nomes-reais', sucesso: ativo ? 'Nomes reais visíveis na simulação' : 'Nomes ocultos: o site volta a mostrar Candidato A e B' },
    );
  }

  // fora da simulação, `pres` vem com os nomes reais (dados verdadeiros): mostra como a simulação apareceria
  const exibida = pres && !sim && !reais ? anonimizarRace(pres) : pres;
  const candidatos = exibida?.candidatos.filter((c) => !c.agregado).slice(0, 2) ?? [];

  return (
    <Painel
      className="mt-4 lg:mt-5"
      titulo="Nomes na simulação"
      icone="olho-fechado"
      subtitulo="Por padrão, a simulação mostra “Candidato A” e “Candidato B” no lugar dos nomes reais."
      acoes={
        reais ? (
          <Badge tone="alert" size="sm" dot caps>
            Nomes reais
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm" icon="olho-fechado">
            Nomes ocultos
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className={cn('rounded-2xl border p-4', reais ? 'border-alert/40 bg-alert/[0.06]' : 'border-line bg-surface-2/60')}>
            <Toggle
              checked={reais}
              onChange={(v) => void alternar(v)}
              disabled={ocupado}
              label="Mostrar nomes reais na simulação (uso interno)"
              description={
                reais
                  ? 'Ligado: o site mostra os nomes reais junto dos números fictícios.'
                  : 'Desligado (recomendado): o site mostra Candidato A e Candidato B.'
              }
            />
          </div>
          <Callout tom={reais ? 'alerta' : 'neutro'} titulo="Por que ficam ocultos">
            Números fictícios ao lado de nomes reais viram desinformação num print. Com os nomes ocultos, as imagens de
            compartilhamento e as capturas de tela da simulação nunca associam um resultado inventado a um candidato real.
          </Callout>
          {!sim ? (
            <p className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-brand-fg" />
              Vale só na fonte Simulação. Pré-eleição e TSE ao vivo mostram dados verdadeiros, sempre com os nomes reais.
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-line bg-bg/60 p-4">
          <Rotulo>{sim ? 'No site agora' : 'Na simulação'}</Rotulo>
          <ul className="mt-3 space-y-3">
            {candidatos.map((c) => (
              <li key={c.numero} className="flex items-center gap-3">
                <CandidateAvatar candidato={c} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold text-fg">{c.nomeUrna}</p>
                  <p className="truncate text-[12px] text-fg-muted">
                    {c.partido} · <span className="num">{c.numero}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[12px] leading-snug text-fg-subtle">
            Com nomes ocultos, cores neutras pela ordem do número na urna: A (turquesa) é o menor número; B (âmbar), o maior.
            Com nomes reais, Presidente usa as cores de identificação: Lula em vermelho e Flávio Bolsonaro em azul.
          </p>
        </div>
      </div>
    </Painel>
  );
}
