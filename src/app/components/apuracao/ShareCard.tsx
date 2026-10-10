/**
 * ShareCard: cartão do placar (nacional, UF ou município) nos 3 formatos do kit de compartilhamento
 * (`@/app/components/share`): 'x' 1200×675 (16:9), 'feed' 1080×1350 e 'story' 1080×1920. Moldura = `CartaoBase`
 * (logo, URL, data/hora de Brasília e o selo SIMULAÇÃO quando simulado); aqui só o miolo: local, % apurado, números
 * gigantes, barra com a marca dos 50% e o selo de resultado definido.
 * ShareButton: mesma API de antes (usado em várias páginas), agora sobre o `BotaoCompartilhar` do kit.
 * Fotos oficiais no cartão só com dados reais (nunca na imagem de uma SIMULAÇÃO, nem anonimizada: uma imagem
 * com rosto real e números fictícios não pode circular).
 */
import { forwardRef, type ReactNode } from 'react';
import type { Race, Summary } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { BotaoCompartilhar, CartaoBase, DIMENSOES_CARTAO, brilhoDe, PreviaCartao, SeloOficial, useCartao, type FormatoCartao } from '@/app/components/share';
import { AvatarCartao, BarraDuelo, PctGigante, PilulaApurado, RotuloCartao } from '@/app/components/share/cartoes/partes';
import { hashtags, textoPlacar } from '@/app/components/share/textos';
import { useFotosRace } from './fotos';

/** Formatos do cartão do placar (= `FormatoCartao` do kit; 'x' é o 16:9 do X/WhatsApp). */
export type ShareFormato = FormatoCartao;
export const SHARE_DIMENSOES = DIMENSOES_CARTAO;

export interface ShareCardProps {
  race: Race;
  resumo: Summary;
  formato?: ShareFormato;
  /** Marca "SIMULAÇÃO" (obrigatório quando LiveStatus.simulacao). */
  simulado?: boolean;
  /** Abrangência exibida (padrão: "Brasil" para Presidente, a UF para Governador). */
  local?: string;
  /** Caminho exibido no rodapé (padrão: /apuracao). */
  caminho?: string;
  className?: string;
}

/** Texto neutro para acompanhar o compartilhamento (≤ 220 caracteres, "[SIMULAÇÃO]" quando simulado). */
export function textoCompartilhamento(race: Race, resumo: Summary, simulado?: boolean, local?: string): string {
  return textoPlacar(race, resumo, { simulado, local });
}

function localPadrao(race: Race): string {
  return race.abrangencia === 'BR' ? 'Brasil' : (UF_NOMES[race.abrangencia] ?? race.titulo.split('·').pop()?.trim() ?? '');
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { race, resumo, formato = 'feed', simulado, local, caminho = '/apuracao', className },
  ref,
) {
  const onde = local ?? localPadrao(race);
  const t1 = race.turno === 1;
  const fotos = useFotosRace(race, { desligado: simulado });
  return (
    <CartaoBase
      ref={ref}
      formato={formato}
      simulado={simulado}
      className={className}
      sobrancelha={t1 ? 'Resultado oficial · 1º turno' : `Apuração · ${race.turno}º turno`}
      caminho={caminho}
      instante={t1 ? null : (resumo.ultimaAtualizacao ?? undefined)}
      rotuloInstante={t1 ? undefined : 'Dados de'}
      fonte={t1 ? 'Fonte: TSE · votação de 4 de outubro' : undefined}
      selo={t1 ? <SeloOficial>Resultado oficial</SeloOficial> : undefined}
      brilho={brilhoDe(race)}
    >
      <MioloPlacar race={race} resumo={resumo} onde={onde} fotos={fotos} />
    </CartaoBase>
  );
});

interface MioloProps {
  race: Race;
  resumo: Summary;
  onde: string;
  fotos: (string | undefined)[];
}

function Cabecalho({ race, resumo, onde }: Pick<MioloProps, 'race' | 'resumo' | 'onde'>) {
  const { k, retrato } = useCartao();
  const t1 = race.turno === 1;
  return (
    <div className={cn('flex justify-between', retrato ? 'flex-col items-start' : 'items-end')} style={{ gap: 14 * k, marginTop: (retrato ? 44 : 22) * k }}>
      <div className="min-w-0">
        <RotuloCartao>{onde}</RotuloCartao>
        <div className="font-display font-semibold leading-none tracking-[-0.035em]" style={{ fontSize: (retrato ? 66 : 46) * k, marginTop: 10 * k }}>
          {race.cargo}
          <span className="text-fg-muted"> · {race.turno}º turno</span>
        </div>
      </div>
      {t1 ? null : (
        <div className="flex flex-wrap items-center" style={{ gap: 12 * k }}>
          <PilulaApurado pct={pctTotalizadas(resumo)} />
          {retrato ? <PilulaDiferenca race={race} resumo={resumo} /> : null}
        </div>
      )}
    </div>
  );
}

/** Diferença entre os dois (neutra: sem dizer quem; a cor e os números já dizem). */
function diferenca(race: Race, resumo: Summary): { pp: number; votos: number } | null {
  if (race.turno !== 2 || validos(resumo) === 0) return null;
  const m = margem(resumo);
  return m.lider === null ? { pp: 0, votos: 0 } : { pp: m.pp, votos: m.votos };
}

function PilulaDiferenca({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const { k } = useCartao();
  const d = diferenca(race, resumo);
  if (!d) return null;
  return (
    <div className="inline-flex shrink-0 items-baseline rounded-full border border-line/[2] bg-surface/80" style={{ gap: 10 * k, padding: `${8 * k}px ${18 * k}px` }}>
      <span className="leading-none text-fg-muted" style={{ fontSize: 15 * k }}>
        diferença
      </span>
      <span className="num font-display font-semibold leading-none tracking-[-0.02em] text-fg" style={{ fontSize: 26 * k }}>
        {fmtPP(d.pp, 2).replace('+', '')}
      </span>
      <span className="num leading-none text-fg-muted" style={{ fontSize: 15 * k }}>
        {fmtInt(d.votos)} votos
      </span>
    </div>
  );
}

/** Bloco central do 16:9: a diferença entre os dois. */
function CentroDiferenca({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const d = diferenca(race, resumo);
  if (!d) return <div />;
  return (
    <div className="flex flex-col items-center justify-center self-center text-center" style={{ paddingTop: 70 }}>
      <RotuloCartao>Diferença</RotuloCartao>
      <div className="num font-display font-semibold leading-none tracking-[-0.03em] text-fg" style={{ fontSize: 40, marginTop: 10 }}>
        {fmtPP(d.pp, 2).replace('+', '').replace(' p.p.', '')}
        <span className="text-fg-muted" style={{ fontSize: 20 }}>
          {' '}
          p.p.
        </span>
      </div>
      <div className="num text-fg-muted" style={{ fontSize: 16, marginTop: 8 }}>
        {fmtInt(d.votos)} votos
      </div>
    </div>
  );
}

function SeloEleito({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const { k } = useCartao();
  const eleito = race.turno === 2 && resumo.eleito !== null ? race.candidatos[resumo.eleito] : null;
  if (!eleito) return null;
  const s = corSlot(eleito.cor);
  return (
    <div
      className={cn('inline-flex items-center self-start rounded-full font-bold uppercase tracking-[0.08em]', s.bgSoft, s.text)}
      style={{ gap: 12 * k, padding: `${10 * k}px ${22 * k}px`, fontSize: 19 * k }}
    >
      <Icon name="check-circulo" size={26 * k} strokeWidth={2.25} />
      {eleito.nomeUrna} · {resumo.status === 'encerrada' ? 'eleito' : 'matematicamente eleito'}
    </div>
  );
}

function Demais({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const { k } = useCartao();
  const i = race.candidatos.findIndex((c) => c.agregado);
  if (i < 0) return null;
  return (
    <div className="num text-fg-muted" style={{ fontSize: 18 * k }}>
      Demais candidatos: <span className="font-semibold text-fg">{fmtPct(pctValidos(resumo, i))}</span> · <span>{fmtInt(resumo.votos[i] ?? 0)} votos</span>
    </div>
  );
}

/** Coluna de um candidato (16:9 e feed). */
function Coluna({ race, resumo, i, foto, direita }: { race: Race; resumo: Summary; i: number; foto?: string; direita?: boolean }) {
  const { k, formato } = useCartao();
  const c = race.candidatos[i];
  const tem = validos(resumo) > 0;
  const eleito = race.turno === 2 && resumo.eleito === i;
  const x = formato === 'x';
  const nome = (
    <div className={cn('min-w-0', direita && 'text-right')}>
      <div className="truncate font-display font-semibold leading-[1.05] tracking-[-0.025em]" style={{ fontSize: (x ? 32 : 40) * k }}>
        {c.nomeUrna}
      </div>
      <div className="num truncate text-fg-muted" style={{ fontSize: (x ? 17 : 19) * k, marginTop: 4 * k }}>
        {c.partido} · {c.numero}
      </div>
    </div>
  );
  return (
    <div className={cn('flex min-w-0 flex-col', direita && 'items-end text-right')}>
      {x ? (
        <div className={cn('flex max-w-full items-center', direita && 'flex-row-reverse')} style={{ gap: 18 * k }}>
          <AvatarCartao cor={c.cor} nome={c.nomeUrna} size={74} foto={foto} eleito={eleito} />
          {nome}
        </div>
      ) : (
        <>
          <AvatarCartao cor={c.cor} nome={c.nomeUrna} size={Math.round(96 * k)} foto={foto} eleito={eleito} />
          <div className="max-w-full" style={{ marginTop: 22 * k }}>
            {nome}
          </div>
        </>
      )}
      <div style={{ marginTop: (x ? 18 : 26) * k }}>
        <PctGigante valor={pctValidos(resumo, i)} size={(x ? 116 : 108) * k} cor={c.cor} apagado={!tem} />
      </div>
      <div className="num text-fg-muted" style={{ fontSize: (x ? 19 : 21) * k, marginTop: 10 * k }}>
        <span className="font-semibold text-fg">{fmtInt(resumo.votos[i] ?? 0)}</span> votos
      </div>
    </div>
  );
}

/** Linha de um candidato (story). */
function LinhaStory({ race, resumo, i, foto }: { race: Race; resumo: Summary; i: number; foto?: string }) {
  const { k } = useCartao();
  const c = race.candidatos[i];
  const tem = validos(resumo) > 0;
  return (
    <div>
      <div className="flex items-center" style={{ gap: 26 * k }}>
        <AvatarCartao cor={c.cor} nome={c.nomeUrna} size={Math.round(84 * k)} foto={foto} eleito={race.turno === 2 && resumo.eleito === i} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-semibold leading-[1.05] tracking-[-0.025em]" style={{ fontSize: 40 * k }}>
            {c.nomeUrna}
          </div>
          <div className="num text-fg-muted" style={{ fontSize: 20 * k, marginTop: 4 * k }}>
            {c.partido} · {c.numero}
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between" style={{ marginTop: 18 * k, gap: 20 * k }}>
        <PctGigante valor={pctValidos(resumo, i)} size={140 * k} cor={c.cor} apagado={!tem} />
        <div className="num text-right text-fg-muted" style={{ fontSize: 21 * k, paddingBottom: 10 * k }}>
          <span className="block font-semibold text-fg">{fmtInt(resumo.votos[i] ?? 0)}</span>
          votos
        </div>
      </div>
    </div>
  );
}

function MioloPlacar({ race, resumo, onde, fotos }: MioloProps) {
  const { k, formato } = useCartao();
  const fin = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  if (formato === 'story') {
    return (
      <>
        <Cabecalho race={race} resumo={resumo} onde={onde} />
        <div className="flex flex-1 flex-col justify-center" style={{ gap: 56 * k }}>
          {fin.map(({ i }) => (
            <LinhaStory key={i} race={race} resumo={resumo} i={i} foto={fotos[i]} />
          ))}
          <BarraDuelo race={race} votos={resumo.votos} alto={36 * k} />
          <Demais race={race} resumo={resumo} />
        </div>
        <Rodapezinho race={race} resumo={resumo} />
      </>
    );
  }
  return (
    <>
      <Cabecalho race={race} resumo={resumo} onde={onde} />
      {formato === 'x' && fin.length === 2 && race.turno === 2 ? (
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center" style={{ columnGap: 28, marginTop: 14 }}>
          <Coluna race={race} resumo={resumo} i={fin[0].i} foto={fotos[fin[0].i]} />
          <CentroDiferenca race={race} resumo={resumo} />
          <Coluna race={race} resumo={resumo} i={fin[1].i} foto={fotos[fin[1].i]} direita />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 content-center" style={{ columnGap: 48 * k, marginTop: (formato === 'x' ? 14 : 30) * k }}>
          {fin.slice(0, 2).map(({ i }, n) => (
            <Coluna key={i} race={race} resumo={resumo} i={i} foto={fotos[i]} direita={n === 1} />
          ))}
        </div>
      )}
      <div style={{ marginTop: (formato === 'x' ? 8 : 26) * k, marginBottom: (formato === 'x' ? 14 : 28) * k }}>
        <BarraDuelo race={race} votos={resumo.votos} alto={(formato === 'x' ? 22 : 28) * k} rotulo={formato !== 'x'} />
        <div style={{ marginTop: 12 * k }}>
          <Demais race={race} resumo={resumo} />
        </div>
      </div>
      <Rodapezinho race={race} resumo={resumo} />
    </>
  );
}

function Rodapezinho({ race, resumo }: Pick<MioloProps, 'race' | 'resumo'>) {
  const { k } = useCartao();
  const eleito = race.turno === 2 && resumo.eleito !== null;
  if (!eleito) return null;
  return (
    <div className="flex" style={{ marginBottom: 20 * k }}>
      <SeloEleito race={race} resumo={resumo} />
    </div>
  );
}

/** Prévia escalada (o nó exportado mantém o tamanho real). Mantido por compatibilidade: use `PreviaCartao` do kit. */
export function ShareCardPreview({ children, formato, className }: { children: ReactNode; formato: ShareFormato; className?: string }) {
  return (
    <PreviaCartao formato={formato} className={className}>
      {children}
    </PreviaCartao>
  );
}

export interface ShareButtonProps {
  race: Race;
  resumo: Summary;
  simulado?: boolean;
  local?: string;
  /** Caminho compartilhado (padrão: a página atual). */
  caminho?: string;
  /** Texto compartilhado (padrão: textoCompartilhamento). */
  texto?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Só o ícone (IconButton). */
  iconOnly?: boolean;
  className?: string;
}

/** Rota atual (para compartilhar "esta página"), no BrowserRouter e no HashRouter do demo. */
export function caminhoAtual(): string {
  if (typeof window === 'undefined') return '/';
  return __DEMO__ ? window.location.hash.replace(/^#/, '') || '/' : window.location.pathname + window.location.search;
}

export function ShareButton({
  race,
  resumo,
  simulado,
  local,
  caminho,
  texto,
  label = 'Compartilhar',
  variant = 'secondary',
  size = 'md',
  iconOnly,
  className,
}: ShareButtonProps) {
  const rota = caminho ?? caminhoAtual();
  const onde = local ?? localPadrao(race);
  return (
    <BotaoCompartilhar
      titulo={race.turno === 1 ? 'Compartilhar resultado' : 'Compartilhar placar'}
      texto={texto ?? textoCompartilhamento(race, resumo, simulado, local ? onde : undefined)}
      caminho={rota}
      hashtags={race.turno === 1 ? hashtags('primeiroTurno') : race.cargo === 'Governador' ? hashtags('governador') : hashtags('apuracao')}
      nomeArquivo={`sintonia-${race.id}${local ? `-${slug(onde)}` : ''}`}
      simulado={simulado && race.turno === 2}
      cartao={(f) => <ShareCard race={race} resumo={resumo} formato={f} simulado={simulado && race.turno === 2} local={onde} caminho={rota.split('?')[0]} />}
      label={label}
      variant={variant}
      size={size}
      soIcone={iconOnly}
      className={className}
    />
  );
}

/** "São José (SP)" → "sao-jose-sp" (nome de arquivo). */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
