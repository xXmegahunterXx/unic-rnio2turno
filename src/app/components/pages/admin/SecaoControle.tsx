/**
 * Seção "Controle": linha do tempo, placar nacional compacto, mini mapa, últimos eventos e a pré-visualização
 * da visão do eleitor (iframe). No celular, também o transporte completo (a barra inferior é compacta).
 */
import { useState } from 'react';
import type { UF } from '@/shared/types';
import { fmtHoraSeg } from '@/shared/format';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { EventFeed } from '@/app/components/apuracao/EventFeed';
import { Placar } from '@/app/components/apuracao/Placar';
import { Skeleton } from '@/app/ui';
import { useAdmin, useNacionalAdmin } from './dados';
import { CabecalhoSecao, Callout, Painel, Rotulo } from './kit';
import { LinhaDoTempo } from './LinhaDoTempo';
import { PreviaCelular, rotuloPagina } from './Previa';
import { EstadoAoVivo, RelogioApuracao, SeletorVelocidade, Transporte } from './relogio';
import { FONTE_ROTULO } from './rotulos';

export function SecaoControle() {
  const { snap, nacional, pres, meta } = useAdmin();
  const [pagina, setPagina] = useState('/apuracao');
  const preEleicao = snap.state.fonte === 'pre';
  const t1 = useNacionalAdmin('pres-t1', preEleicao, 60_000);
  const raceT1 = meta?.races.find((r) => r.id === 'pres-t1');
  const placarRace = preEleicao ? raceT1 : pres;
  const placarDados = preEleicao ? t1.data : nacional;
  const simulado = snap.status.simulacao;

  return (
    <div>
      <CabecalhoSecao
        titulo="Controle"
        icone="ao-vivo"
        descricao="O relógio da noite da apuração. Tudo o que você faz aqui chega em tempo real a todos os visitantes."
      />

      {/* Transporte completo no celular/tablet (a barra inferior fica compacta) */}
      <Painel className="mb-4 lg:hidden" pt="pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <EstadoAoVivo />
            <RelogioApuracao tamanho="xl" className="mt-2" />
            <p className="mt-1.5 text-[12.5px] text-fg-muted">Horário de Brasília · fonte: {FONTE_ROTULO[snap.state.fonte]}</p>
          </div>
        </div>
        <Transporte variante="painel" className="mt-4" />
        <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-5 sm:px-5">
          <SeletorVelocidade />
        </div>
      </Painel>

      {snap.state.congelado ? (
        <Callout tom="alerta" titulo="Dados congelados" className="mb-4">
          Os números públicos estão parados em <span className="num font-semibold text-fg">{fmtHoraSeg(snap.state.congeladoEm ?? 0)}</span>{' '}
          (simulação de instabilidade do TSE). O relógio continua. Descongele em Comunicação.
        </Callout>
      ) : null}

      <LinhaDoTempo />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4 lg:space-y-5">
          {placarRace && placarDados ? (
            <Placar
              race={placarRace}
              resumo={placarDados.resumo}
              variant="compact"
              titulo={preEleicao ? `${placarRace.titulo} · exibido no site` : `${placarRace.titulo} · agora no site`}
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
                  selecionada={pagina.startsWith('/apuracao/') ? (pagina.slice(10).toUpperCase() as UF) : null}
                  onSelect={(uf) => setPagina(`/apuracao/${uf.toLowerCase()}`)}
                  rotuloAcao={(uf) => `Pré-visualizar ${uf}`}
                  ariaLabel="Mapa do Brasil: líder por UF"
                />
              ) : (
                <Skeleton className="aspect-square w-full" rounded="lg" />
              )}
            </Painel>
            <Painel titulo="Últimos eventos" icone="lista" pt="pt-3">
              <EventFeed
                eventos={placarDados?.eventos ?? []}
                race={placarRace}
                max={6}
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
          <Rotulo className="mt-3 text-center normal-case tracking-normal">
            <span className="font-medium text-fg-subtle">Mesma origem, dados em tempo real</span>
          </Rotulo>
        </Painel>
      </div>
    </div>
  );
}
