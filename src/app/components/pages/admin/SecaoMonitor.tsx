/**
 * Seção "Monitor": métricas operacionais (AdminSnapshot.metrics) em cartões, mini-séries coletadas no navegador,
 * "Freio de carga" (sinais de aperto do último minuto e atalho para puxar/soltar o freio, I37), log operacional rolável
 * e o estado bruto (JSON) para conferência.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { MetricasServidor, ServidorInfo } from '@/shared/api';
import { chavesNoite } from '@/shared/chaves-noite';
import { fmtDataHora, fmtDecimal, fmtHora, fmtHoraSeg, fmtInt, fmtPct, normalize } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { copiarTexto } from '@/app/lib/share';
import { Badge, Button, Icon, SearchBox, toast, type IconName } from '@/app/ui';
import { amostrasMonitor, useAdmin } from './dados';
import { CabecalhoSecao, MiniSerie, Painel, Rotulo } from './kit';
import { sinaisDeAperto } from './freio';
import { fmtDuracao, fmtMs, FONTE_ROTULO } from './rotulos';

function Metrica({
  rotulo,
  valor,
  sub,
  icone,
  serie,
  tom,
}: {
  rotulo: string;
  valor: ReactNode;
  sub?: ReactNode;
  icone: IconName;
  serie?: number[];
  tom?: 'brand' | 'ok' | 'muted';
}) {
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-2 text-fg-muted">
        <Icon name={icone} size={15} className="shrink-0" />
        <Rotulo className="min-w-0 text-balance">{rotulo}</Rotulo>
      </div>
      <div className="num mt-3 truncate font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[26px]">{valor}</div>
      {sub ? <div className="num mt-1.5 text-pretty text-[12px] leading-snug text-fg-muted">{sub}</div> : null}
      {serie ? <MiniSerie valores={serie} tom={tom} className="-mx-1 mt-3" /> : <div className="mt-auto" />}
    </div>
  );
}

export function SecaoMonitor() {
  const { snap, dados } = useAdmin();
  const m = snap.metrics;
  const amostras = amostrasMonitor();
  const [busca, setBusca] = useState('');
  const log = useMemo(() => {
    const q = normalize(busca);
    const l = [...m.log].reverse();
    return q ? l.filter((x) => normalize(x.msg).includes(q)) : l;
  }, [m.log, busca]);

  const series = {
    lat: amostras.map((a) => a.latenciaMs),
    req: amostras.map((a) => a.req),
    calc: amostras.map((a) => a.calcMs),
  };

  async function copiar(texto: string, oque: string) {
    const ok = await copiarTexto(texto);
    toast(ok ? `${oque} copiado` : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert' });
  }

  return (
    <div>
      <CabecalhoSecao
        titulo="Monitor"
        icone="grafico"
        descricao={__DEMO__ ? 'Saúde do motor de simulação. Na demonstração, o motor roda no seu navegador (Web Worker).' : 'Saúde do servidor e do motor de simulação, atualizada a cada segundo.'}
        acoes={
          <>
            <Badge tone="neutral" size="md" icon="globo">
              {FONTE_ROTULO[snap.state.fonte]}
            </Badge>
            <Badge tone="brand" size="md">
              <span className="num">Estado v{snap.state.versao}</span>
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Metrica rotulo="No ar há" icone="relogio" valor={fmtDuracao(m.uptimeSeg)} sub={__DEMO__ ? 'desde que esta aba abriu' : 'tempo de atividade'} />
        <Metrica rotulo="Requisições/min" icone="grafico" valor={fmtInt(m.requisicoesUltimoMinuto)} sub="último minuto" serie={series.req} />
        <Metrica
          rotulo="Clientes ativos"
          icone="usuarios"
          valor={m.clientesAtivosEstimados ? fmtInt(m.clientesAtivosEstimados) : '—'}
          sub={m.clientesAtivosEstimados ? 'estimativa' : __DEMO__ ? 'só no servidor' : 'sem estimativa'}
        />
        <Metrica rotulo="Latência do painel" icone="ao-vivo" valor={fmtMs(dados.latenciaMs)} sub="ida e volta do estado" serie={series.lat} tom="ok" />
        <Metrica rotulo="Último cálculo" icone="rapido" valor={fmtMs(m.ultimoCalculoMs)} sub="agregação de um snapshot" serie={series.calc} tom="muted" />
        <Metrica
          rotulo="Construção do modelo"
          icone="configuracoes"
          valor={fmtMs(m.modeloMs)}
          sub={m.modeloConstruidoEm ? `às ${fmtHoraSeg(m.modeloConstruidoEm)}` : 'ainda não construído'}
        />
        <Metrica rotulo="Seções modeladas" icone="urna" valor={fmtInt(m.secoesModeladas)} sub="estrutura real do 1º turno" />
        <Metrica
          rotulo="Memória"
          icone="grade"
          valor={m.memoriaMb ? `${fmtInt(m.memoriaMb)} MB` : '—'}
          sub={m.memoriaMb ? (__DEMO__ ? 'heap do navegador' : 'RSS do processo') : 'indisponível aqui'}
        />
      </div>

      {snap.servidor ? <PainelServidor s={snap.servidor} /> : null}
      {snap.servidor ? <PainelFreio m={snap.servidor.metricas} /> : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Painel
          titulo="Log operacional"
          icone="lista"
          subtitulo={`${m.log.length} entradas mais recentes, da mais nova para a mais antiga.`}
          acoes={
            <Button size="sm" variant="ghost" icon="copiar" onClick={() => void copiar(m.log.map((l) => `${new Date(l.t).toISOString()} ${l.msg}`).join('\n'), 'Log')}>
              Copiar
            </Button>
          }
          pt="pt-3"
        >
          <SearchBox value={busca} onChange={setBusca} size="sm" placeholder="Filtrar o log" aria-label="Filtrar o log" />
          <ol className="mt-3 max-h-[460px] overflow-y-auto rounded-xl border border-line bg-surface-2/40" aria-live="off">
            {log.map((l, i) => (
              <li key={`${l.t}-${i}`} className={cn('flex items-start gap-3 border-b border-line px-3 py-2 last:border-b-0', i === 0 && !busca && 'bg-brand/[0.05]')}>
                <time className="num shrink-0 pt-px font-mono text-[11.5px] text-fg-subtle" dateTime={new Date(l.t).toISOString()} title={new Date(l.t).toISOString()}>
                  {fmtHoraSeg(l.t)}
                </time>
                <span className="min-w-0 break-words text-[13px] leading-snug text-fg">{l.msg}</span>
              </li>
            ))}
            {log.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-fg-muted">Nada encontrado.</li> : null}
          </ol>
        </Painel>

        <Painel
          titulo="Estado bruto"
          icone="configuracoes"
          subtitulo="AdminState como o motor guarda (para conferência e suporte)."
          acoes={
            <Button size="sm" variant="ghost" icon="copiar" onClick={() => void copiar(JSON.stringify(snap.state, null, 2), 'Estado')}>
              Copiar
            </Button>
          }
          pt="pt-3"
        >
          <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <div>
              <dt className="text-fg-muted">Versão</dt>
              <dd className="num mt-0.5 font-semibold text-fg">v{snap.state.versao}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Relógio</dt>
              <dd className="num mt-0.5 font-semibold text-fg">
                {snap.state.relogio.rodando ? 'rodando' : 'parado'} · {snap.state.relogio.velocidade}×
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Âncora (simulado)</dt>
              <dd className="num mt-0.5 font-semibold text-fg">{fmtHoraSeg(snap.state.relogio.ancoraSim)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Fim previsto</dt>
              <dd className="num mt-0.5 font-semibold text-fg">{snap.fimPrevisto ? fmtHora(snap.fimPrevisto) : '—'}</dd>
            </div>
          </dl>
          <pre className="max-h-[340px] overflow-auto rounded-xl border border-line bg-surface-2/40 p-3 font-mono text-[11.5px] leading-relaxed text-fg-muted">
            {JSON.stringify(snap.state, null, 2)}
          </pre>
        </Painel>
      </div>
    </div>
  );
}

/** Milissegundos com 1 casa abaixo de 10 ms (0,4 ms em vez de "0 ms"). */
const msCurto = (v: number) => (v < 10 ? `${fmtDecimal(v, 1)} ms` : fmtMs(v));

/** Processo do servidor: build, ambiente e as métricas do último minuto fechado (AdminSnapshot.servidor). */
function PainelServidor({ s }: { s: ServidorInfo }) {
  const m = s.metricas;
  const itens: [string, ReactNode, ReactNode?][] = [
    ['Requisições/s', fmtDecimal(m.reqPorSeg, 1), 'média do último minuto'],
    ['Processamento', `${msCurto(m.p50Ms)} · ${msCurto(m.p99Ms)}`, 'p50 · p99 do minuto'],
    ['Erros 5xx · 429', `${fmtInt(m.erros5xx)} · ${fmtInt(m.respostas429)}`, 'minuto fechado'],
    ['Cache de respostas', m.cacheHit ? fmtPct(m.cacheHit * 100, 0) : '—', `${fmtInt(m.respostasEmCache)} ${m.respostasEmCache === 1 ? 'rota montada' : 'rotas montadas'} agora`],
    ['Em andamento', fmtInt(m.emAndamento), 'requisições abertas agora'],
    ['Event loop', msCurto(m.eventLoopP99Ms), 'atraso p99 (~10 s)'],
    ['Memória', `${fmtInt(m.rssMb)} MB`, `heap ${fmtInt(m.heapMb)} MB`],
    ['Imagens de prévia', `${fmtInt(m.og.emMemoria)} em memória`, `${fmtDecimal(m.og.mb, 1)} MB · ${fmtInt(m.og.naFila)} na fila`],
  ];
  return (
    <Painel
      className="mt-4 lg:mt-5"
      titulo="Servidor"
      icone="configuracoes"
      subtitulo={
        <>
          Build <span className="num font-mono text-[12px] text-fg">{s.build.commit}</span>
          {s.build.data ? <> de {fmtDataHora(Date.parse(s.build.data))}</> : null} · versão {s.build.versao} · Node {s.build.node}
        </>
      }
      acoes={
        <>
          <Badge tone={s.producao ? 'brand' : 'neutral'} size="sm" caps>
            {s.producao ? 'Produção' : 'Desenvolvimento'}
          </Badge>
          <Badge tone={s.simulacao.permitida ? 'alert' : 'ok'} size="sm" icon={s.simulacao.permitida ? 'play' : 'olho-fechado'}>
            {s.simulacao.permitida ? 'Simulação permitida' : 'Simulação bloqueada'}
          </Badge>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {itens.map(([rot, val, sub]) => (
          <div key={rot} className="min-w-0">
            <dt>
              <Rotulo>{rot}</Rotulo>
            </dt>
            <dd className="num mt-1.5 truncate font-display text-[19px] font-semibold leading-none tracking-[-0.01em] text-fg">{val}</dd>
            {sub ? <dd className="num mt-1 truncate text-[12px] text-fg-muted">{sub}</dd> : null}
          </div>
        ))}
      </dl>
    </Painel>
  );
}

/**
 * Freio de carga visto do Monitor (I37): os sinais de aperto do último minuto fechado, com os mesmos limites dos
 * alertas, e um atalho para puxar 2× ou soltar. O controle completo (3×, 5×, modo leve) fica em Controle → Chaves da noite.
 */
function PainelFreio({ m }: { m: MetricasServidor }) {
  const { snap, run, pendente, irPara } = useAdmin();
  const freio = chavesNoite(snap.state).freio;
  const puxado = freio.fator > 1 || freio.leve;
  const sinais = sinaisDeAperto(m);
  const aperto = sinais.filter((x) => x.apertado);
  const fmtValor = (v: number, u: 'ms' | 'fracao') => (u === 'ms' ? msCurto(v) : fmtPct(v * 100, v > 0 && v < 0.1 ? 1 : 0));
  const textoFreio = puxado ? (freio.fator > 1 ? `Puxado em ${freio.fator}×${freio.leve ? ', modo leve' : ''}` : 'Modo leve') : 'Solto (ritmo normal)';
  return (
    <Painel
      className="mt-4 lg:mt-5"
      titulo="Freio de carga"
      icone="relogio"
      subtitulo="Sinais do último minuto fechado, com os limites dos alertas. O freio é sempre puxado à mão."
      acoes={
        <Badge tone={puxado ? 'alert' : 'ok'} size="sm" data-freio-monitor={puxado ? freio.fator : undefined}>
          <span className="num">{textoFreio}</span>
        </Badge>
      }
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 min-[420px]:grid-cols-3">
        {sinais.map((x) => (
          <div key={x.id} className="min-w-0">
            <dt>
              <Rotulo>{x.rotulo}</Rotulo>
            </dt>
            <dd className={cn('num mt-1.5 truncate font-display text-[19px] font-semibold leading-none tracking-[-0.01em]', x.apertado ? 'text-alert-fg' : 'text-fg')}>
              {fmtValor(x.valor, x.unidade)}
            </dd>
            <dd className="num mt-1 truncate text-[12px] text-fg-muted">limite {fmtValor(x.limite, x.unidade)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="min-w-0 flex-[1_1_16rem] text-pretty text-[13px] leading-snug text-fg-muted">
          {aperto.length ? (
            <>
              <span className="font-semibold text-alert-fg">Sinal de aperto</span> ({aperto.map((x) => x.rotulo.toLowerCase()).join(', ')}).{' '}
              {puxado ? 'Com o freio puxado, confira em 1–2 min se os números caíram.' : 'O freio 2× corta pela metade as consultas de todos os visitantes.'}
            </>
          ) : puxado ? (
            'Sem sinal de aperto. Solte o freio quando o tráfego normalizar.'
          ) : (
            'Sem sinal de aperto.'
          )}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => irPara('controle')}>
            Chaves da noite
          </Button>
          {puxado ? (
            <Button
              size="sm"
              variant="outline"
              loading={pendente('noite-freio')}
              onClick={() => void run({ tipo: 'freio', fator: 1, leve: false }, { chave: 'noite-freio', sucesso: 'Freio solto: ritmo normal' })}
            >
              Soltar o freio
            </Button>
          ) : (
            <Button
              size="sm"
              variant={aperto.length ? 'primary' : 'outline'}
              loading={pendente('noite-freio')}
              onClick={() => void run({ tipo: 'freio', fator: 2, leve: false }, { chave: 'noite-freio', sucesso: 'Freio 2×' })}
            >
              Puxar 2×
            </Button>
          )}
        </div>
      </div>
    </Painel>
  );
}
