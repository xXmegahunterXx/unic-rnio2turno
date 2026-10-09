/**
 * Seção "Comunicação": aviso global (faixa no topo de todas as páginas públicas, comando `aviso`) com prévia
 * fiel ao AppShell, e "Congelar dados" (comando `congelar`), que simula instabilidade do TSE.
 */
import { useEffect, useState } from 'react';
import type { Aviso } from '@/shared/types';
import { fmtHoraSeg } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { LogoMark } from '@/app/components/layout/Logo';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { Badge, Button, Icon, Segmented, Toggle } from '@/app/ui';
import { useAdmin } from './dados';
import { AreaTexto, CabecalhoSecao, Callout, Painel, Rotulo } from './kit';
import { fmtDuracao, relogioAgora } from './rotulos';
import { useNow } from '@/app/lib/useNow';

const MAX = 280;

const MODELOS: { rotulo: string; aviso: Aviso }[] = [
  {
    rotulo: 'Instabilidade no TSE',
    aviso: { nivel: 'alerta', texto: 'O site do TSE está com instabilidade. Os números podem demorar a atualizar; voltam assim que a divulgação for retomada.' },
  },
  {
    rotulo: 'Totalização lenta',
    aviso: { nivel: 'info', texto: 'A totalização está mais lenta do que o normal nesta noite. Os números são atualizados assim que o TSE divulga.' },
  },
  {
    rotulo: 'Teste da simulação',
    aviso: { nivel: 'info', texto: 'Teste da noite da apuração: os números desta página são fictícios e servem só para demonstração.' },
  },
];

export function SecaoComunicacao() {
  const { snap, dados, run, pendente } = useAdmin();
  const noAr = snap.state.aviso;
  const [nivel, setNivel] = useState<Aviso['nivel']>(noAr?.nivel ?? 'info');
  const [texto, setTexto] = useState(noAr?.texto ?? '');
  // quando o aviso no ar muda por fora (outra aba/admin) e o rascunho está vazio, adota
  useEffect(() => {
    if (noAr && !texto) {
      setTexto(noAr.texto);
      setNivel(noAr.nivel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noAr?.texto, noAr?.nivel]);

  const limpo = texto.trim();
  const igualNoAr = !!noAr && noAr.texto === limpo && noAr.nivel === nivel;
  const congelado = snap.state.congelado;
  const agora = useNow(1000);
  const simNow = relogioAgora(snap, dados.recebidoEm, agora);

  const publicar = () =>
    run(
      { tipo: 'aviso', aviso: { nivel, texto: limpo.slice(0, MAX) } },
      { chave: 'aviso', sucesso: noAr ? 'Aviso atualizado no site' : 'Aviso publicado no site' },
    );
  const remover = () => run({ tipo: 'aviso', aviso: null }, { chave: 'aviso', sucesso: 'Aviso removido do site' });
  const congelar = (c: boolean) =>
    run(
      { tipo: 'congelar', congelado: c },
      { chave: 'congelar', sucesso: c ? 'Dados congelados para todos os visitantes' : 'Dados descongelados: os números voltam ao instante atual' },
    );

  return (
    <div>
      <CabecalhoSecao
        titulo="Comunicação"
        icone="alerta"
        descricao="Fale com todos os visitantes ao mesmo tempo e simule as situações difíceis da noite."
      />
      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Painel
          titulo="Aviso global"
          icone="info"
          subtitulo="Faixa no topo de todas as páginas públicas. O visitante pode dispensá-la; ela volta se o texto mudar."
          acoes={
            noAr ? (
              <Badge tone={noAr.nivel === 'alerta' ? 'alert' : 'brand'} size="sm" dot caps>
                No ar
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                Nenhum aviso
              </Badge>
            )
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented<Aviso['nivel']>
                ariaLabel="Nível do aviso"
                options={[
                  { value: 'info', label: 'Informação', icon: 'info' },
                  { value: 'alerta', label: 'Alerta', icon: 'alerta' },
                ]}
                value={nivel}
                onChange={setNivel}
              />
            </div>
            <AreaTexto
              rotulo="Texto"
              value={texto}
              maxLength={MAX}
              placeholder="Ex.: A totalização está mais lenta do que o normal nesta noite."
              onChange={(e) => setTexto(e.target.value)}
              dica={
                <div className="flex items-center justify-between gap-3">
                  <span>Seja descritivo e neutro. Sem adjetivos, sem torcida.</span>
                  <span className={cn('num shrink-0', texto.length > MAX - 20 && 'font-semibold text-alert-fg')}>
                    {texto.length}/{MAX}
                  </span>
                </div>
              }
            />
            <div>
              <Rotulo className="mb-2">Modelos</Rotulo>
              <div className="flex flex-wrap gap-1.5">
                {MODELOS.map((m) => (
                  <button
                    key={m.rotulo}
                    type="button"
                    onClick={() => {
                      setNivel(m.aviso.nivel);
                      setTexto(m.aviso.texto);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-line/[2] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Icon name={m.aviso.nivel === 'alerta' ? 'alerta' : 'info'} size={14} className={m.aviso.nivel === 'alerta' ? 'text-alert-fg' : 'text-brand-fg'} />
                    {m.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {noAr ? (
                <Button variant="ghost" icon="fechar" onClick={remover} disabled={pendente('aviso')} className="mr-auto">
                  Remover do site
                </Button>
              ) : null}
              <Button variant="primary" icon="check" onClick={publicar} disabled={!limpo || igualNoAr} loading={pendente('aviso')}>
                {noAr ? (igualNoAr ? 'Publicado' : 'Atualizar aviso') : 'Publicar aviso'}
              </Button>
            </div>
          </div>
        </Painel>

        <Painel titulo="Prévia no site" icone="usuarios" subtitulo="Como os visitantes veem o aviso, no topo de cada página.">
          <PreviaAviso aviso={limpo ? { nivel, texto: limpo } : null} simulacao={snap.status.simulacao} />
          {noAr && !igualNoAr ? (
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
              <Icon name="info" size={14} className="text-brand-fg" />
              Rascunho diferente do aviso no ar.
            </p>
          ) : null}
        </Painel>
      </div>

      <Painel
        className="mt-4 lg:mt-5"
        titulo="Congelar dados"
        icone="pause"
        subtitulo="Simula uma instabilidade do TSE: os números públicos param, o relógio continua."
        acoes={
          congelado ? (
            <Badge tone="alert" size="sm" dot caps>
              Congelado
            </Badge>
          ) : null
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3 text-[13.5px] leading-relaxed text-fg-muted">
            <p>
              Com os dados congelados, todas as páginas mostram os números do instante do congelamento, para todos os visitantes,
              e o placar deixa de “andar”. É o que acontece quando o feed oficial para de publicar.
            </p>
            <p>Ao descongelar, os números saltam para o instante atual do relógio, como quando o TSE volta a divulgar.</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <Toggle
              checked={congelado}
              onChange={(c) => void congelar(c)}
              disabled={pendente('congelar') || snap.state.fonte !== 'simulacao'}
              label={congelado ? 'Dados congelados' : 'Congelar agora'}
              description={
                snap.state.fonte !== 'simulacao'
                  ? 'Disponível só com a fonte Simulação.'
                  : congelado
                    ? 'Os visitantes veem os números parados.'
                    : 'Os números param no instante atual do relógio.'
              }
            />
            {congelado && snap.state.congeladoEm !== null ? (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <div>
                  <Rotulo>Dados em</Rotulo>
                  <p className="num mt-1.5 font-display text-[22px] font-semibold leading-none text-fg">{fmtHoraSeg(snap.state.congeladoEm)}</p>
                </div>
                <div>
                  <Rotulo>Atraso acumulado</Rotulo>
                  <p className="num mt-1.5 font-display text-[22px] font-semibold leading-none text-alert-fg">
                    {fmtDuracao((simNow - snap.state.congeladoEm) / 1000)}
                  </p>
                </div>
              </div>
            ) : null}
            {!noAr || noAr.nivel !== 'alerta' ? (
              <Button
                variant="outline"
                size="sm"
                icon="alerta"
                block
                className="mt-4"
                disabled={pendente('aviso')}
                onClick={() =>
                  void run(
                    { tipo: 'aviso', aviso: MODELOS[0].aviso },
                    { chave: 'aviso', sucesso: 'Aviso de instabilidade publicado' },
                  ).then((s) => {
                    if (s) {
                      setNivel(MODELOS[0].aviso.nivel);
                      setTexto(MODELOS[0].aviso.texto);
                    }
                  })
                }
              >
                Publicar aviso de instabilidade
              </Button>
            ) : null}
          </div>
        </div>
        {congelado ? (
          <Callout tom="alerta" className="mt-4">
            Lembre de descongelar: enquanto isso, nenhum visitante vê a apuração avançar.
          </Callout>
        ) : null}
      </Painel>
    </div>
  );
}

/** Réplica do topo do site (header + faixa de simulação + aviso), com as mesmas classes do AppShell. */
function PreviaAviso({ aviso, simulacao }: { aviso: Aviso | null; simulacao: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-bg" aria-label="Prévia do topo do site">
      <div className="flex h-11 items-center gap-2 border-b border-line bg-surface/70 px-3">
        <LogoMark size={22} />
        <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-fg">Sintonia</span>
        <span className="ml-auto inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-2" />
          {simulacao ? 'Simulação' : 'Ao vivo'}
        </span>
      </div>
      {simulacao ? <SimulationRibbon className="[&>span:last-child]:hidden" /> : null}
      <div className="px-3 pb-4 pt-3">
        {aviso ? (
          <div
            className={cn(
              'flex items-start gap-3 rounded-2xl border px-4 py-3 text-[14px] leading-snug',
              aviso.nivel === 'alerta' ? 'border-alert/35 bg-alert/10 text-fg' : 'border-brand/30 bg-brand/10 text-fg',
            )}
          >
            <Icon name={aviso.nivel === 'alerta' ? 'alerta' : 'info'} size={18} className={cn('mt-px shrink-0', aviso.nivel === 'alerta' ? 'text-alert-fg' : 'text-brand-fg')} />
            <p className="min-w-0 flex-1 text-pretty">{aviso.texto}</p>
            <Icon name="fechar" size={15} className="mt-0.5 shrink-0 text-fg-muted" />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-fg-subtle">Sem aviso: a faixa não aparece.</div>
        )}
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-3 w-24 rounded-full bg-surface-3" />
          <div className="h-6 w-3/4 rounded-lg bg-surface-3/80" />
          <div className="h-16 w-full rounded-xl bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
