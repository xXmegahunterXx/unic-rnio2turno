/**
 * Cartão "momento da noite": um evento do feed (virada, liderança, resultado definido, marco de %) ou um instante
 * da linha do tempo ("Reveja a noite"), com o placar daquele instante e o horário de Brasília. O link leva ao
 * instante (`?t=`), onde quem abrir vê o placar e o mapa como estavam.
 *
 *  - `CartaoMomento`: só desenha (recebe o resumo pronto).
 *  - `BotaoMomento`: botão discreto para um evento do feed; o placar do instante é buscado só quando o sheet abre.
 *  - `BotaoInstante`: "Compartilhar este momento" da linha do tempo.
 */
import type { FeedEvent, Race, RaceId, Summary, TipoEvento, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { useNacional, useUf } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot, slotDe } from '@/app/lib/raceUi';
import { Icon, type IconName } from '@/app/ui/Icon';
import type { ButtonSize, ButtonVariant } from '@/app/ui/Button';
import { comInstante, formatarInstante } from '@/app/components/apuracao/LinhaDoTempo';
import { BotaoCompartilhar } from '../BotaoCompartilhar';
import { CartaoBase, useCartao } from '../CartaoBase';
import { hashtags, textoInstante, textoMomento } from '../textos';
import type { FormatoCartao } from '../tipos';
import { BarraDuelo, PctGigante, RotuloCartao } from './partes';

export type TipoMomento = TipoEvento | 'instante';

const ROTULO: Record<TipoMomento, string> = {
  inicio: 'Início da apuração',
  marco: 'Marco da apuração',
  lideranca: 'Liderança',
  virada: 'Virada',
  'uf-encerrada': 'Apuração encerrada',
  eleito: 'Resultado definido',
  aviso: 'Aviso',
  instante: 'Reveja a noite',
};

const ICONE: Record<TipoMomento, IconName> = {
  inicio: 'play',
  marco: 'bandeira',
  lideranca: 'seta-cima',
  virada: 'troca',
  'uf-encerrada': 'check-circulo',
  eleito: 'selo',
  aviso: 'alerta',
  instante: 'relogio',
};

/** Eventos que valem um botão de compartilhar no feed. */
export const EVENTOS_COMPARTILHAVEIS = new Set<TipoEvento>(['virada', 'eleito', 'marco', 'lideranca', 'uf-encerrada']);
export const eventoCompartilhavel = (e: Pick<FeedEvent, 'tipo'>, race?: Pick<Race, 'id'>, ev?: Pick<FeedEvent, 'race'>) =>
  EVENTOS_COMPARTILHAVEIS.has(e.tipo) && (!race || !ev || ev.race === race.id);

export interface CartaoMomentoProps {
  formato: FormatoCartao;
  race: Race;
  t: number;
  /** Manchete (título neutro do evento, ou "Revendo a apuração às 18h42"). */
  manchete: string;
  detalhe?: string;
  tipo: TipoMomento;
  /** Índice do candidato do evento (cor do selo). */
  candidato?: number;
  /** "Brasil", "São Paulo"… */
  local: string;
  /** Placar naquele instante (null/undefined = ainda carregando). */
  resumo?: Summary | null;
  simulado?: boolean;
  caminho: string;
}

function LinhaPlacar({ race, resumo, i }: { race: Race; resumo: Summary; i: number }) {
  const { k, retrato } = useCartao();
  const c = race.candidatos[i];
  return (
    <div className="flex items-end justify-between" style={{ gap: 20 * k }}>
      <div className="flex min-w-0 items-center" style={{ gap: 14 * k }}>
        <span className={cn('shrink-0 rounded-full', corSlot(c.cor).bg)} style={{ width: 18 * k, height: 18 * k }} />
        <div className="min-w-0">
          <div className="truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: (retrato ? 34 : 28) * k }}>
            {c.agregado ? 'Demais candidatos' : c.nomeUrna}
          </div>
          <div className="num text-fg-muted" style={{ fontSize: 16 * k }}>
            {fmtInt(resumo.votos[i] ?? 0)} votos
          </div>
        </div>
      </div>
      <PctGigante valor={pctValidos(resumo, i)} size={(retrato ? 92 : 64) * k} cor={c.agregado ? null : c.cor} />
    </div>
  );
}

export function CartaoMomento({ formato, race, t, manchete, detalhe, tipo, candidato, local, resumo, simulado, caminho }: CartaoMomentoProps) {
  return (
    <CartaoBase
      formato={formato}
      simulado={simulado}
      sobrancelha={`Apuração · ${race.turno}º turno`}
      caminho={caminho}
      instante={t}
      rotuloInstante="Momento de"
      brilho={candidato !== undefined ? [slotDe(race, candidato), slotDe(race, candidato)] : 'marca'}
    >
      <Miolo race={race} t={t} manchete={manchete} detalhe={detalhe} tipo={tipo} candidato={candidato} local={local} resumo={resumo} />
    </CartaoBase>
  );
}

function Miolo({ race, t, manchete, detalhe, tipo, candidato, local, resumo }: Omit<CartaoMomentoProps, 'formato' | 'simulado' | 'caminho'>) {
  const { k, retrato, formato } = useCartao();
  const cor = candidato !== undefined ? slotDe(race, candidato) : null;
  const tom = cor ? cn(corSlot(cor).bgSoft, corSlot(cor).text) : 'bg-brand/15 text-brand-fg';
  const tem = resumo && validos(resumo) > 0;
  const fin = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  const longa = manchete.length > 70;
  return (
    <div className={cn('flex flex-1 flex-col', retrato ? 'justify-center' : '')} style={{ gap: (retrato ? 44 : 18) * k, paddingTop: (retrato ? 0 : 22) * k, paddingBottom: (retrato ? 20 : 18) * k }}>
      <div className="flex items-center justify-between" style={{ gap: 18 * k }}>
        <div className={cn('inline-flex items-center rounded-full font-bold uppercase tracking-[0.1em]', tom)} style={{ gap: 10 * k, padding: `${9 * k}px ${18 * k}px`, fontSize: 16 * k }}>
          <Icon name={ICONE[tipo]} size={20 * k} strokeWidth={2.25} />
          {ROTULO[tipo]}
        </div>
        <div className="num font-display font-semibold leading-none tracking-[-0.03em] text-fg" style={{ fontSize: (retrato ? 64 : 46) * k }}>
          {fmtHora(t)}
        </div>
      </div>
      <div>
        <RotuloCartao>
          {race.cargo} · {local}
        </RotuloCartao>
        <p
          className="text-balance font-display font-semibold tracking-[-0.03em]"
          style={{ fontSize: (formato === 'story' ? 74 : formato === 'feed' ? 66 : longa ? 38 : 46) * k * (formato === 'x' ? 1 : 0.78), lineHeight: 1.06, marginTop: 12 * k }}
        >
          {manchete}
        </p>
        {detalhe ? (
          <p className="num text-fg-muted" style={{ fontSize: 19 * k, marginTop: 12 * k }}>
            {detalhe}
          </p>
        ) : null}
      </div>
      {tem ? (
        <div className={cn('rounded-[1.2em] border border-line/[2] bg-surface/70', formato === 'x' && 'mt-auto')} style={{ padding: `${(retrato ? 30 : 18) * k}px ${(retrato ? 32 : 24) * k}px` }}>
          <div className={cn(retrato ? 'space-y-[0.6em]' : 'grid grid-cols-2')} style={{ columnGap: 40 * k, fontSize: 30 * k }}>
            {(fin.length ? fin : race.candidatos.map((c, i) => ({ c, i }))).slice(0, 2).map(({ i }) => (
              <LinhaPlacar key={i} race={race} resumo={resumo!} i={i} />
            ))}
          </div>
          <div style={{ marginTop: (retrato ? 26 : 14) * k }}>
            <BarraDuelo race={race} votos={resumo!.votos} alto={(retrato ? 22 : 14) * k} rotulo={false} />
          </div>
          <div className="num text-center text-fg-muted" style={{ fontSize: 16 * k, marginTop: (retrato ? 18 : 10) * k }}>
            <span className="font-semibold text-fg">{fmtPct(pctTotalizadas(resumo!))}</span> das seções totalizadas naquele instante
          </div>
        </div>
      ) : resumo === undefined ? (
        <div className={cn('rounded-[1.2em] border border-dashed border-line/[2]', formato === 'x' && 'mt-auto')} style={{ height: (retrato ? 260 : 150) * k }} />
      ) : null}
    </div>
  );
}

// =============================================================================================
// Botões
// =============================================================================================

const qsRace = (id: RaceId) => (id && id !== 'pres' ? `?race=${id}` : '');
/** Rota da apuração para uma abrangência ('BR' ou UF), já com a corrida e o instante. */
export function rotaMomento(raceId: RaceId, abrangencia: 'BR' | UF, t: number): string {
  const base = abrangencia === 'BR' ? `/apuracao${qsRace(raceId)}` : `/apuracao/${abrangencia.toLowerCase()}${qsRace(raceId)}`;
  return comInstante(base, t);
}

const localDe = (abr: 'BR' | UF) => (abr === 'BR' ? 'Brasil' : abr === 'ZZ' ? 'Exterior' : UF_NOMES[abr]);

/** Cartão de um evento: busca o placar daquele instante (só existe com o sheet aberto). */
function CartaoEvento({ formato, e, race, simulado, caminho }: { formato: FormatoCartao; e: FeedEvent; race: Race; simulado?: boolean; caminho: string }) {
  const props = { formato, race, t: e.t, manchete: e.titulo, detalhe: e.detalhe, tipo: e.tipo, candidato: e.candidato, local: localDe(e.abrangencia), simulado, caminho };
  return e.abrangencia === 'BR' ? <ComResumoBr {...props} /> : <ComResumoUf {...props} uf={e.abrangencia} />;
}

function ComResumoBr(p: Omit<CartaoMomentoProps, 'resumo'>) {
  const q = useNacional(p.race.id, p.t);
  const r = q.data && q.data.race === p.race.id ? q.data.resumo : q.isError ? null : undefined;
  return <CartaoMomento {...p} resumo={r} />;
}

function ComResumoUf(p: Omit<CartaoMomentoProps, 'resumo'> & { uf: UF }) {
  const q = useUf(p.race.id, p.uf, p.t);
  const r = q.data && q.data.race === p.race.id && q.data.uf === p.uf ? q.data.resumo : q.isError ? null : undefined;
  return <CartaoMomento {...p} resumo={r} />;
}

export interface BotaoMomentoProps {
  evento: FeedEvent;
  /** Corrida do evento, para exibição (anônima quando preciso). Eventos de outra corrida não ganham botão. */
  race: Race;
  simulado?: boolean;
  className?: string;
  size?: ButtonSize;
}

/** Botão discreto (só ícone) para compartilhar um evento do feed. */
export function BotaoMomento({ evento, race: raceEv, simulado, className, size = 'sm' }: BotaoMomentoProps) {
  if (evento.race !== raceEv.id) return null;
  const caminho = rotaMomento(raceEv.id, evento.abrangencia, evento.t);
  return (
    <BotaoCompartilhar
      soIcone
      size={size}
      className={className}
      label={`Compartilhar este momento (${fmtHora(evento.t)})`}
      titulo="Compartilhar este momento"
      descricao={`${ROTULO[evento.tipo]} às ${fmtHora(evento.t)} · o link abre a apuração naquele instante.`}
      texto={textoMomento(evento, simulado)}
      caminho={caminho}
      hashtags={raceEv.cargo === 'Governador' ? hashtags('governador') : hashtags('apuracao')}
      nomeArquivo={`sintonia-momento-${formatarInstante(evento.t).replace(/\D/g, '')}`}
      simulado={simulado}
      cartao={(f) => <CartaoEvento formato={f} e={evento} race={raceEv} simulado={simulado} caminho={caminho.split('?')[0]} />}
    />
  );
}

export interface BotaoInstanteProps {
  race: Race;
  /** UF da página (ausente = Brasil). */
  uf?: UF;
  t: number;
  simulado?: boolean;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  soIcone?: boolean;
  className?: string;
}

/** "Compartilhar este momento" da linha do tempo: link com `?t=` e o placar daquele instante. */
export function BotaoInstante(p: BotaoInstanteProps) {
  return p.uf ? <BotaoInstanteUf {...p} uf={p.uf} /> : <BotaoInstanteBr {...p} />;
}

function BotaoInstanteBr(p: BotaoInstanteProps) {
  const q = useNacional(p.race.id, p.t);
  const r = q.data && q.data.race === p.race.id ? q.data.resumo : undefined;
  return <BotaoInstanteBase {...p} resumo={r} />;
}

function BotaoInstanteUf(p: BotaoInstanteProps & { uf: UF }) {
  const q = useUf(p.race.id, p.uf, p.t);
  const r = q.data && q.data.race === p.race.id && q.data.uf === p.uf ? q.data.resumo : undefined;
  return <BotaoInstanteBase {...p} resumo={r} />;
}

function BotaoInstanteBase({ race, uf, t, simulado, label = 'Compartilhar este momento', variant = 'secondary', size = 'sm', soIcone, className, resumo }: BotaoInstanteProps & { resumo?: Summary }) {
  const abr: 'BR' | UF = uf ?? 'BR';
  const local = localDe(abr);
  const caminho = rotaMomento(race.id, abr, t);
  const hora = formatarInstante(t);
  return (
    <BotaoCompartilhar
      soIcone={soIcone}
      label={label}
      variant={variant}
      size={size}
      className={className}
      titulo="Compartilhar este momento"
      descricao={`O link abre a apuração às ${fmtHora(t)}, como estava naquele instante.`}
      texto={resumo ? textoInstante(race, resumo, t, { simulado, local }) : textoInstante(race, { secoes: 0, secoesTotalizadas: 0, eleitorado: 0, eleitoradoTotalizado: 0, comparecimento: 0, abstencao: 0, votos: race.candidatos.map(() => 0), brancos: 0, nulos: 0 }, t, { simulado, local })}
      caminho={caminho}
      hashtags={race.cargo === 'Governador' ? hashtags('governador') : hashtags('apuracao')}
      nomeArquivo={`sintonia-reveja-${hora.replace(/\D/g, '')}`}
      simulado={simulado}
      carregando={!resumo}
      cartao={(f) => (
        <CartaoMomento
          formato={f}
          race={race}
          t={t}
          manchete={`Revendo a apuração às ${fmtHora(t)}`}
          tipo="instante"
          local={local}
          resumo={resumo}
          simulado={simulado}
          caminho={caminho.split('?')[0]}
        />
      )}
    />
  );
}
