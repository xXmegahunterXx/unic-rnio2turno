/**
 * Seção "Monitor": métricas operacionais (AdminSnapshot.metrics) em cartões, mini-séries coletadas no navegador,
 * log operacional rolável e o estado bruto (JSON) para conferência.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { fmtHora, fmtHoraSeg, fmtInt, normalize } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { copiarTexto } from '@/app/lib/share';
import { Badge, Button, Icon, SearchBox, toast, type IconName } from '@/app/ui';
import { amostrasMonitor, useAdmin } from './dados';
import { CabecalhoSecao, MiniSerie, Painel, Rotulo } from './kit';
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
      <div className="flex items-center gap-2 text-fg-muted">
        <Icon name={icone} size={15} />
        <Rotulo className="truncate">{rotulo}</Rotulo>
      </div>
      <div className="num mt-3 truncate font-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[26px]">{valor}</div>
      {sub ? <div className="num mt-1.5 truncate text-[12px] text-fg-muted">{sub}</div> : null}
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
