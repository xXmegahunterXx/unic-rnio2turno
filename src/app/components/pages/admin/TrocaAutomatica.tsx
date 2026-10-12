/**
 * Painel "Troca automática para o TSE" (só no servidor: `AdminSnapshot.servidor.trocaAuto`). No horário (17h de
 * 25/10, ou TSE_INICIO/o horário escolhido aqui) o servidor confere o feed do TSE e troca a fonte de Pré-eleição para
 * TSE ao vivo; sem resposta, mantém a Pré-eleição com o aviso "aguardando os primeiros dados do TSE" e tenta de novo.
 * Aqui: ver o estado, ligar/desligar, adiar (ou marcar outro horário) e "tentar agora" (comando `troca-auto`).
 */
import { useState } from 'react';
import type { TrocaAutoInfo } from '@/shared/api';
import { fmtDataHora, fmtHoraSeg } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { Badge, Button, Countdown, Icon, Toggle, type BadgeTone, type IconName } from '@/app/ui';
import { useAdmin } from './dados';
import { Callout, Campo, Painel, Rotulo } from './kit';

const ESTADO: Record<TrocaAutoInfo['estado'], { rotulo: string; tom: BadgeTone; icone: IconName }> = {
  desabilitada: { rotulo: 'Desabilitada no servidor', tom: 'neutral', icone: 'info' },
  desligada: { rotulo: 'Desligada', tom: 'neutral', icone: 'pause' },
  agendada: { rotulo: 'Agendada', tom: 'brand', icone: 'relogio' },
  verificando: { rotulo: 'Conferindo o feed', tom: 'brand', icone: 'ao-vivo' },
  'aguardando-tse': { rotulo: 'Aguardando o TSE', tom: 'alert', icone: 'alerta' },
  feita: { rotulo: 'Feita', tom: 'ok', icone: 'check' },
  'nao-aplicavel': { rotulo: 'Não aplicada', tom: 'alert', icone: 'alerta' },
};

/** "18:42:07 de 25/10" (Brasília). */
const quando = (ms: number) => `${fmtHoraSeg(ms)} de ${fmtDataHora(ms).slice(0, 5)}`;

/** "2026-10-25T17:00" (campo datetime-local) ↔ epoch ms, SEMPRE no horário de Brasília (UTC−3, sem horário de verão). */
const BRT_MS = 3 * 3600_000;
export function paraCampoBrasilia(ms: number): string {
  return new Date(ms - BRT_MS).toISOString().slice(0, 16);
}
export function deCampoBrasilia(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + BRT_MS;
  return Number.isFinite(t) ? t : null;
}

export function TrocaAutomatica({ className }: { className?: string }) {
  const { snap, run, pendente, confirmar } = useAdmin();
  const agora = useNow(1000);
  const info = snap.servidor?.trocaAuto;
  const [campo, setCampo] = useState<string | null>(null);
  if (!info) return null;
  const e = ESTADO[info.estado];
  const ocupado = pendente('troca-auto');
  const fonte = snap.state.fonte;

  async function adiar(para: number | null, msg: string) {
    await run({ tipo: 'troca-auto', acao: 'adiar', para }, { chave: 'troca-auto', sucesso: msg });
  }

  async function agoraMesmo() {
    const ok = await confirmar({
      titulo: 'Trocar para o TSE agora?',
      descricao: 'O servidor confere o feed do TSE e, se ele responder, troca a fonte para TSE ao vivo na hora.',
      corpo:
        fonte === 'pre'
          ? 'Todos os visitantes passam a ver os dados oficiais do TSE. Antes das 17h de 25/10 as disputas do 2º turno aparecem zeradas.'
          : `A fonte atual é “${fonte === 'tse' ? 'TSE ao vivo' : 'Simulação'}”: a troca automática só age a partir da Pré-eleição.`,
      confirmar: 'Trocar agora',
      perigo: true,
    });
    if (!ok) return;
    await run({ tipo: 'troca-auto', acao: 'agora' }, { chave: 'troca-auto', sucesso: 'Conferindo o feed do TSE…' });
  }

  async function ligar(v: boolean) {
    if (!v) {
      const ok = await confirmar({
        titulo: 'Desligar a troca automática?',
        descricao: 'No horário, a fonte NÃO muda sozinha: será preciso trocar para “TSE ao vivo” à mão nesta seção.',
        confirmar: 'Desligar',
        perigo: true,
      });
      if (!ok) return;
    }
    await run({ tipo: 'troca-auto', acao: v ? 'ligar' : 'desligar' }, { chave: 'troca-auto', sucesso: v ? 'Troca automática ligada' : 'Troca automática desligada' });
  }

  const valorCampo = campo ?? paraCampoBrasilia(info.inicio);
  const novo = deCampoBrasilia(valorCampo);
  const campoMudou = campo !== null && novo !== null && novo !== info.inicio;

  return (
    <Painel
      className={className}
      titulo="Troca automática para o TSE"
      icone="relogio"
      subtitulo="No horário, o servidor confere se o feed do TSE responde e troca a fonte de Pré-eleição para TSE ao vivo, sem ninguém precisar clicar."
      acoes={
        <Badge tone={e.tom} size="sm" icon={e.icone} caps>
          {e.rotulo}
        </Badge>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className={cn('rounded-2xl border p-4', info.estado === 'aguardando-tse' ? 'border-alert/40 bg-alert/[0.06]' : 'border-line bg-surface-2/60')}>
            <Rotulo>{info.estado === 'feita' ? 'Troca feita às' : 'Horário da troca'}</Rotulo>
            <p className="num mt-1.5 font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-fg">
              {quando(info.estado === 'feita' && info.feitaEm !== null ? info.feitaEm : info.inicio)}
            </p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              {info.adiada ? (
                <>
                  Horário escolhido no painel · padrão do servidor: <span className="num">{quando(info.inicioPadrao)}</span>
                </>
              ) : (
                'Horário padrão do servidor (horário de Brasília)'
              )}
            </p>
            {info.estado === 'agendada' && info.inicio > agora ? (
              <div className="mt-3">
                <Rotulo>Faltam</Rotulo>
                <Countdown target={info.inicio} now={agora} size="sm" className="mt-2" />
              </div>
            ) : null}
          </div>

          {info.estado === 'aguardando-tse' ? (
            <Callout tom="alerta" titulo={`O feed do TSE não respondeu (${info.tentativas} ${info.tentativas === 1 ? 'tentativa' : 'tentativas'})`}>
              {info.ultimoErro ? <span className="block break-words font-mono text-[12px]">{info.ultimoErro}</span> : null}
              A fonte continua em Pré-eleição e o site mostra o aviso “Aguardando os primeiros dados do TSE”.
              {info.proximaTentativa ? (
                <>
                  {' '}
                  Nova tentativa às <span className="num font-semibold text-fg">{fmtHoraSeg(info.proximaTentativa)}</span>.
                </>
              ) : null}
            </Callout>
          ) : info.estado === 'nao-aplicavel' ? (
            <Callout tom="alerta" titulo="A fonte não é Pré-eleição">
              No horário a fonte estava em Simulação, e a troca automática não mexe nela. Troque a fonte à mão quando terminar o ensaio.
            </Callout>
          ) : info.estado === 'feita' ? (
            <Callout tom="ok" titulo="Troca concluída">
              Para valer de novo (por exemplo, depois de um ensaio), ligue outra vez ou marque um novo horário.
            </Callout>
          ) : info.estado === 'desabilitada' ? (
            <Callout tom="neutro" titulo="Desabilitada neste servidor">
              A troca automática só age com TSE_AUTO ligado (padrão em produção). Aqui ela apenas mostra o horário; as escolhas feitas
              neste painel ficam guardadas.
            </Callout>
          ) : null}

          <div className="rounded-2xl border border-line p-4">
            <Toggle
              checked={info.ligada}
              onChange={(v) => void ligar(v)}
              disabled={ocupado}
              label="Trocar sozinho no horário"
              description={info.ligada ? 'Ligado: no horário, a fonte passa para TSE ao vivo.' : 'Desligado: a fonte só muda à mão.'}
            />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <Rotulo>Adiar</Rotulo>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                [5, '+5 min'],
                [15, '+15 min'],
                [60, '+1 h'],
              ].map(([min, rot]) => (
                <Button
                  key={rot}
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => void adiar(Math.max(info.inicio, agora) + Number(min) * 60_000, `Troca marcada para ${fmtHoraSeg(Math.max(info.inicio, agora) + Number(min) * 60_000)}`)}
                >
                  <span className="num">{rot}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Campo
              rotulo="Marcar para (Brasília)"
              type="datetime-local"
              value={valorCampo}
              onChange={(ev) => setCampo(ev.target.value)}
              wrapperClassName="min-w-[200px] flex-1"
              className="num"
            />
            <Button
              variant="outline"
              icon="check"
              disabled={ocupado || !campoMudou}
              onClick={() => {
                if (novo === null) return;
                setCampo(null);
                void adiar(novo, `Troca marcada para ${quando(novo)}`);
              }}
            >
              Marcar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {info.adiada ? (
              <Button variant="ghost" icon="reset" disabled={ocupado} onClick={() => void adiar(null, 'Horário padrão do servidor')}>
                Horário padrão
              </Button>
            ) : null}
            <Button variant="primary" icon="ao-vivo" className="ml-auto" loading={ocupado} onClick={() => void agoraMesmo()}>
              Trocar agora
            </Button>
          </div>
          <p className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
            <Icon name="info" size={14} className="mt-0.5 shrink-0 text-brand-fg" />
            Antes de trocar, o servidor consulta o feed com a configuração abaixo. Sem resposta, tenta de novo em 15 s, 30 s, 60 s e
            depois a cada 2 min. Tudo fica no log do Monitor.
          </p>
        </div>
      </div>
    </Painel>
  );
}
