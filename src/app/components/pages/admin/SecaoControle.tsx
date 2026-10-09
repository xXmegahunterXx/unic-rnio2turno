/**
 * Seção "Controle": linha do tempo, placar nacional compacto, mini mapa, últimos eventos e a pré-visualização
 * da visão do eleitor (iframe). No celular, também o transporte completo (a barra inferior é compacta).
 */
import { useState } from 'react';
import type { UF } from '@/shared/types';
import { fmtHoraSeg } from '@/shared/format';
import { useRace } from '@/app/data/hooks';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { EventFeed } from '@/app/components/apuracao/EventFeed';
import { MapLegend } from '@/app/components/apuracao/MapLegend';
import { Placar } from '@/app/components/apuracao/Placar';
import { Skeleton } from '@/app/ui';
import { useAdmin, useNacionalAdmin } from './dados';
import { CabecalhoSecao, Callout, NotaNomesOcultos, Painel, Rotulo } from './kit';
import { LinhaDoTempo } from './LinhaDoTempo';
import { PreviaCelular, rotuloPagina } from './Previa';
import { EstadoAoVivo, GradeVelocidade, ProgressoPres, RelogioApuracao, SeletorVelocidade, Transporte } from './relogio';
import { FONTE_ROTULO } from './rotulos';

export function SecaoControle() {
  const { snap, nacional, pres, anon, irPara } = useAdmin();
  const [pagina, setPagina] = useState('/apuracao');
  const preEleicao = snap.state.fonte === 'pre';
  const t1 = useNacionalAdmin('pres-t1', preEleicao, 60_000);
  const raceT1 = useRace('pres-t1');
  const placarRace = preEleicao ? raceT1 : pres;
  const placarDados = preEleicao ? t1.data : nacional;
  const simulado = snap.status.simulacao;
  const ufPrevia = pagina.startsWith('/apuracao/') ? (pagina.slice(10).toUpperCase() as UF) : null;

  return (
    <div>
      <CabecalhoSecao
        titulo="Controle"
        icone="ao-vivo"
        descricao="O relógio da noite da apuração. Tudo o que você faz aqui chega em tempo real a todos os visitantes."
      />

      {/* Transporte completo no celular/tablet (a barra inferior fica compacta) */}
      <Painel className="mb-4 lg:hidden" pt="pt-4">
        <EstadoAoVivo />
        <div className="mt-2 flex items-end justify-between gap-3">
          <RelogioApuracao tamanho="xl" />
        </div>
        <p className="mt-2 text-[12.5px] text-fg-muted">
          Horário de Brasília · fonte: <span className="font-medium text-fg">{FONTE_ROTULO[snap.state.fonte]}</span>
        </p>
        <ProgressoPres bloco className="mt-4 border-t border-line pt-4" />
        <Transporte variante="painel" className="mt-4" />
        <Rotulo className="mb-2 mt-5">Velocidade</Rotulo>
        <GradeVelocidade />
      </Painel>

      {snap.state.congelado ? (
        <Callout tom="alerta" titulo="Dados congelados" className="mb-4">
          Os números públicos estão parados em <span className="num font-semibold text-fg">{fmtHoraSeg(snap.state.congeladoEm ?? 0)}</span>{' '}
          (simulação de instabilidade do TSE). O relógio continua. Descongele em{' '}
          <button type="button" onClick={() => irPara('comunicacao')} className="font-semibold text-fg underline decoration-line underline-offset-2 hover:decoration-fg">
            Comunicação
          </button>
          .
        </Callout>
      ) : null}

      <LinhaDoTempo
        extra={
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-[12px] font-medium text-fg-muted">Velocidade</span>
            <SeletorVelocidade />
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4 lg:space-y-5">
          {placarRace && placarDados ? (
            <Placar
              race={placarRace}
              resumo={placarDados.resumo}
              variant="compact"
              subtitulo={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{preEleicao ? 'Resultado do 1º turno exibido no site' : 'Exibido agora no site'}</span>
                  {anon ? (
                    <>
                      <span aria-hidden className="hidden text-fg-subtle sm:inline">
                        ·
                      </span>
                      <NotaNomesOcultos onClick={() => irPara('fonte')} />
                    </>
                  ) : null}
                </span>
              }
              simulado={simulado}
              live={false}
            />
          ) : (
            <Skeleton className="h-[190px] w-full" rounded="lg" />
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
            <Painel titulo="Mapa" icone="mapa" subtitulo="Toque numa UF para pré-visualizá-la." pt="pt-2">
              {placarRace && placarDados ? (
                <BrazilMap
                  ufs={placarDados.ufs}
                  race={placarRace}
                  rotulos
                  valores={false}
                  selecionada={ufPrevia}
                  onSelect={(uf) => setPagina(`/apuracao/${uf.toLowerCase()}`)}
                  rotuloAcao={(uf) => `Pré-visualizar ${uf}`}
                  ariaLabel="Mapa do Brasil: líder por UF"
                />
              ) : (
                <Skeleton className="aspect-square w-full" rounded="lg" />
              )}
              {placarRace ? <MapLegend modo="vencedor" race={placarRace} compacta className="mt-3" /> : null}
            </Painel>
            <Painel titulo="Últimos eventos" icone="lista" subtitulo="O que o feed público está mostrando." pt="pt-3">
              <EventFeed
                eventos={placarDados?.eventos ?? []}
                race={placarRace}
                max={5}
                bleed={false}
                emptyText={preEleicao ? 'Sem eventos na pré-eleição.' : 'Os eventos aparecem quando a apuração começar.'}
              />
            </Painel>
          </div>
        </div>
        <Painel
          titulo="Visão do eleitor"
          icone="usuarios"
          subtitulo={rotuloPagina(pagina)}
          className="xl:sticky xl:top-[92px] xl:self-start"
          pt="pt-3"
        >
          <PreviaCelular caminho={pagina} onCaminho={setPagina} alturaMax={660} />
          <p className="mt-3 text-center text-[12px] text-fg-subtle">Mesma origem, dados em tempo real</p>
        </Painel>
      </div>
    </div>
  );
}
