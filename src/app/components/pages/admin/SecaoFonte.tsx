/**
 * Seção "Fonte de dados": Pré-eleição · Simulação · TSE ao vivo (comando `fonte`, sempre com confirmação),
 * configuração do feed oficial (comando `tse`) e teste de conexão (`admin.testarTse()`).
 */
import { useState, type ReactNode } from 'react';
import type { FonteDados, TseConfig } from '@/shared/types';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtDataHora } from '@/shared/format';
import { getClient } from '@/app/data/client';
import { anonimizarRace } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Countdown, Icon, Toggle } from '@/app/ui';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Campo, Painel, Rotulo } from './kit';
import { FONTE_ICONE, FONTE_ROTULO, fmtMs, mensagemErro } from './rotulos';

const FONTES: FonteDados[] = ['pre', 'simulacao', 'tse'];

const DESCRICAO: Record<FonteDados, string> = {
  pre: 'O site mostra o resultado real do 1º turno e a contagem regressiva para as 17h de 25/10.',
  simulacao: 'Números fictícios gerados pelo motor, com a faixa “SIMULAÇÃO” em todas as páginas. Controlados por este painel.',
  tse: 'Dados oficiais do feed do TSE (resultados.tse.jus.br), consultados no intervalo configurado.',
};

function impacto(f: FonteDados, intervalo: number): ReactNode {
  if (f === 'pre')
    return 'Os visitantes deixam de ver a apuração do 2º turno: as páginas voltam a mostrar o 1º turno real e a contagem regressiva. A simulação e o relógio deste painel deixam de aparecer no site.';
  if (f === 'simulacao')
    return 'Todos os visitantes passam a ver números SIMULADOS (com a faixa “SIMULAÇÃO · dados fictícios”), conforme o relógio e o cenário deste painel.';
  return (
    <>
      Todos os visitantes passam a ver os dados oficiais do TSE, consultados a cada {intervalo} s. Antes das 17h de 25/10 as disputas do 2º turno
      aparecem zeradas.
      {__DEMO__ ? ' Na demonstração não há servidor para consultar o TSE: as páginas mostram o 2º turno zerado.' : ''}
    </>
  );
}

type CampoTse = Exclude<keyof TseConfig, 'intervaloSeg'>;
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

  async function trocar(f: FonteDados) {
    if (f === atual) return;
    const ok = await confirmar({
      titulo: `Trocar a fonte para “${FONTE_ROTULO[f]}”?`,
      descricao: `Hoje: ${FONTE_ROTULO[atual]}. A mudança vale na hora para todos os visitantes.`,
      corpo: impacto(f, tse.intervaloSeg),
      confirmar: `Usar ${FONTE_ROTULO[f]}`,
      perigo: true,
    });
    if (!ok) return;
    await run({ tipo: 'fonte', fonte: f }, { chave: 'fonte', sucesso: `Fonte: ${FONTE_ROTULO[f]}` });
  }

  const valor = <K extends keyof TseConfig>(k: K): TseConfig[K] => (ed[k] ?? tse[k]) as TseConfig[K];
  const alterados = (Object.keys(ed) as (keyof TseConfig)[]).filter((k) => ed[k] !== undefined && ed[k] !== tse[k]);
  const intervaloInvalido = !(valor('intervaloSeg') >= 5 && valor('intervaloSeg') <= 600);
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
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => void trocar(f)}
              disabled={pendente('fonte')}
              className={cn(
                'group relative flex min-w-0 flex-col rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] sm:p-5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                ativo ? 'border-brand/50 bg-brand/[0.08] shadow-glow' : 'border-line bg-surface shadow-card hover:border-line/[2.5] hover:bg-surface-2/60',
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
                ) : f === 'simulacao' ? (
                  <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 text-[12.5px] text-fg-muted">
                    Relógio a <span className="num font-semibold text-fg">{snap.state.relogio.velocidade}×</span> · semente{' '}
                    <span className="num font-semibold text-fg">{snap.state.cenario.seed}</span>
                  </div>
                ) : (
                  <div className="truncate rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 font-mono text-[11.5px] text-fg-muted">
                    {tse.baseUrl.replace(/^https?:\/\//, '')} · {tse.intervaloSeg} s
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

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
            <Campo
              rotulo="Intervalo de consulta"
              inputMode="numeric"
              sufixo="s"
              value={String(valor('intervaloSeg'))}
              onChange={(e) => setEd((x) => ({ ...x, intervaloSeg: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 }))}
              erro={intervaloInvalido ? 'Entre 5 e 600 segundos.' : undefined}
              dica="Entre 5 e 600 s. O servidor guarda em cache e faz backoff se o TSE falhar."
              wrapperClassName="max-w-[220px]"
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
              <Button variant="primary" icon="check" onClick={salvar} disabled={!alterados.length || intervaloInvalido || vazio} loading={pendente('tse')}>
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
    </div>
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
              <li key={c.cor} className="flex items-center gap-3">
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
            A ordem e as cores seguem o número na urna: A (turquesa) é o menor número; B (âmbar), o maior.
          </p>
        </div>
      </div>
    </Painel>
  );
}
