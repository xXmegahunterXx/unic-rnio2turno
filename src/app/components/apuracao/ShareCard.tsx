/**
 * ShareCard: cartão do placar em tamanho de rede social (1080×1350 "feed" ou 1080×1920 "story"),
 * exportado como PNG com html-to-image. Leva a marca SIMULAÇÃO quando simulado e a URL do site.
 * ShareButton: botão que abre um Sheet com a prévia, escolha de formato e as ações
 * (compartilhar imagem, baixar PNG, WhatsApp, copiar link).
 */
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Race, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtDataHora, fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import {
  compartilharNodeComoImagem,
  copiarLink,
  downloadNodeAsPng,
  hostExibicao,
  abrirWhatsapp,
  urlAbsoluta,
} from '@/app/lib/share';
import { Button, type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Sheet } from '@/app/ui/Sheet';
import { toast } from '@/app/ui/Toast';
import { LogoMark } from '../layout/Logo';
import { iniciais } from './CandidateAvatar';

export type ShareFormato = 'feed' | 'story';
export const SHARE_DIMENSOES: Record<ShareFormato, { w: number; h: number; rotulo: string }> = {
  feed: { w: 1080, h: 1350, rotulo: 'Feed · 4:5' },
  story: { w: 1080, h: 1920, rotulo: 'Stories · 9:16' },
};

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

/** Texto neutro para acompanhar o compartilhamento. */
export function textoCompartilhamento(race: Race, resumo: Summary, simulado?: boolean): string {
  const pref = simulado ? '[SIMULAÇÃO] ' : '';
  if (validos(resumo) === 0) return `${pref}Apuração do ${race.turno}º turno · ${race.titulo}: acompanhe ao vivo, seção por seção.`;
  const cands = race.candidatos
    .filter((c) => !c.agregado)
    .map((c) => `${c.nomeUrna} ${fmtPct(pctValidos(resumo, race.candidatos.indexOf(c)))}`)
    .join(' × ');
  return `${pref}${race.titulo} (${race.turno}º turno): ${cands}, com ${fmtPct(pctTotalizadas(resumo), 1)} das seções totalizadas.`;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { race, resumo, formato = 'feed', simulado, local, caminho = '/apuracao', className },
  ref,
) {
  const { w, h } = SHARE_DIMENSOES[formato];
  const story = formato === 'story';
  const finalistas = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  const tem = validos(resumo) > 0;
  const pst = pctTotalizadas(resumo);
  const eleito = race.turno === 2 && resumo.eleito !== null ? race.candidatos[resumo.eleito] : null;
  const onde = local ?? (race.abrangencia === 'BR' ? 'Brasil' : race.titulo.split('·').pop()?.trim());
  const host = hostExibicao() || 'sintonia';

  return (
    <div
      ref={ref}
      style={{ width: w, height: h }}
      className={cn('relative flex flex-col overflow-hidden bg-bg font-sans text-fg', story ? 'px-[84px] pb-[110px] pt-[120px]' : 'px-[84px] py-[80px]', className)}
    >
      {/* fundo: brilhos dos dois slots + ruído */}
      <div aria-hidden className="absolute inset-0">
        <div className={cn('absolute -left-[240px] -top-[200px] h-[760px] w-[760px] rounded-full blur-[120px]', corSlot(finalistas[0]?.c.cor ?? 'a').bgSoft)} />
        <div className={cn('absolute -right-[240px] -top-[160px] h-[760px] w-[760px] rounded-full blur-[120px]', corSlot(finalistas[1]?.c.cor ?? 'b').bgSoft)} />
        <div className="absolute inset-0 bg-noise" />
      </div>

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-5">
          <LogoMark size={76} />
          <div>
            <div className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em]">Sintonia</div>
            <div className="mt-2 text-[24px] font-medium uppercase tracking-[0.16em] text-fg-muted">Apuração · {race.turno}º turno</div>
          </div>
        </div>
        {simulado ? (
          <div className="rounded-2xl border-[3px] border-brand bg-brand/10 px-6 py-3 text-center">
            <div className="text-[30px] font-bold uppercase leading-none tracking-[0.16em] text-[color:color-mix(in_srgb,rgb(var(--brand))_80%,rgb(var(--fg)))] dark:text-brand-2">Simulação</div>
            <div className="mt-1.5 text-[17px] font-semibold uppercase tracking-[0.18em] text-fg-muted">dados fictícios</div>
          </div>
        ) : null}
      </div>

      <div className={cn('relative', story ? 'mt-[110px]' : 'mt-[70px]')}>
        <div className="text-[30px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{onde}</div>
        <div className="mt-2 font-display text-[78px] font-semibold leading-[1] tracking-[-0.035em]">{race.cargo}</div>
      </div>

      {story ? (
        <div className="relative flex flex-1 flex-col justify-center gap-[72px]">
          {finalistas.map(({ i }) => (
            <LinhaStory key={i} race={race} resumo={resumo} i={i} />
          ))}
          <BarraGrande race={race} resumo={resumo} alto={48} />
        </div>
      ) : (
        <div className="relative mt-[64px] grid grid-cols-2 gap-[56px]">
          {finalistas.map(({ c, i }, k) => {
            const s = corSlot(c.cor);
            return (
              <div key={i} className={cn('flex flex-col', k === 1 && 'items-end text-right')}>
                <Mono cor={c.cor} nome={c.nomeUrna} size={120} eleito={eleito === c} />
                <div className="mt-7 font-display text-[50px] font-semibold leading-[1.05] tracking-[-0.025em]">{c.nomeUrna}</div>
                <div className="num mt-2 text-[26px] text-fg-muted">
                  {c.partido} · {c.numero}
                </div>
                <div className={cn('num mt-8 font-display text-[150px] font-semibold leading-[0.9] tracking-[-0.05em]', tem ? s.text : 'text-fg-subtle')}>
                  {fmtPct(pctValidos(resumo, i)).replace('%', '')}
                  <span className="ml-1 text-[64px] tracking-normal">%</span>
                </div>
                <div className="num mt-4 text-[28px] text-fg-muted">
                  <span className="font-semibold text-fg">{fmtInt(resumo.votos[i] ?? 0)}</span> votos
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!story ? (
        <div className="relative mt-[64px]">
          <BarraGrande race={race} resumo={resumo} />
        </div>
      ) : null}

      <div className={cn('relative', story ? 'mt-[40px]' : 'mt-auto')}>
        {eleito ? (
          <div className={cn('mb-10 inline-flex items-center gap-4 rounded-full px-8 py-4 text-[30px] font-bold uppercase tracking-[0.1em]', corSlot(eleito.cor).bgSoft, corSlot(eleito.cor).text)}>
            <Icon name="check-circulo" size={40} strokeWidth={2.25} />
            {eleito.nomeUrna} {resumo.status === 'encerrada' ? 'eleito' : 'matematicamente eleito'}
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-8 border-t-2 border-line pt-8">
          <div>
            <div className="num font-display text-[56px] font-semibold leading-none tracking-[-0.03em]">{fmtPct(pst)}</div>
            <div className="mt-2 text-[24px] text-fg-muted">
              das seções totalizadas{resumo.ultimaAtualizacao ? ` · ${fmtHora(resumo.ultimaAtualizacao)} (Brasília)` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[30px] font-semibold tracking-[-0.01em]">
              {host}
              {caminho}
            </div>
            <div className="mt-2 text-[22px] text-fg-muted">{simulado ? 'Simulação · não são resultados reais' : 'Fonte: TSE'}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

function Mono({ cor, nome, size, eleito }: { cor: Race['candidatos'][number]['cor']; nome: string; size: number; eleito?: boolean }) {
  const s = corSlot(cor);
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center rounded-full font-display font-semibold ring-[5px] ring-inset', s.bgSoft, s.ring, s.text)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {iniciais(nome)}
      {eleito ? (
        <span className={cn('absolute -bottom-1 -right-1 flex items-center justify-center rounded-full ring-[6px] ring-bg', s.bg, s.ink)} style={{ width: size * 0.36, height: size * 0.36 }}>
          <Icon name="check" size={size * 0.24} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

function LinhaStory({ race, resumo, i }: { race: Race; resumo: Summary; i: number }) {
  const c = race.candidatos[i];
  const s = corSlot(c.cor);
  const tem = validos(resumo) > 0;
  const eleito = race.turno === 2 && resumo.eleito === i;
  return (
    <div>
      <div className="flex items-center gap-7">
        <Mono cor={c.cor} nome={c.nomeUrna} size={120} eleito={eleito} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[56px] font-semibold leading-[1.05] tracking-[-0.025em]">{c.nomeUrna}</div>
          <div className="num mt-2 text-[28px] text-fg-muted">
            {c.partido} · {c.numero}
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between gap-6">
        <div className={cn('num font-display text-[190px] font-semibold leading-[0.85] tracking-[-0.055em]', tem ? s.text : 'text-fg-subtle')}>
          {fmtPct(pctValidos(resumo, i)).replace('%', '')}
          <span className="ml-1 text-[80px] tracking-normal">%</span>
        </div>
        <div className="num pb-3 text-right text-[30px] text-fg-muted">
          <span className="block font-semibold text-fg">{fmtInt(resumo.votos[i] ?? 0)}</span>
          votos
        </div>
      </div>
    </div>
  );
}

function BarraGrande({ race, resumo, alto = 40 }: { race: Race; resumo: Summary; alto?: number }) {
  const total = validos(resumo);
  return (
    <div>
      <div className="relative">
        <div className="flex w-full gap-[5px] overflow-hidden rounded-[14px]" style={{ height: alto }}>
          {total > 0 ? (
            race.candidatos.map((c, i) => (
              <div key={i} className={cn('h-full', corSlot(c.cor).bg)} style={{ flexGrow: Math.max(0.0001, pctValidos(resumo, i)), flexBasis: 0 }} />
            ))
          ) : (
            <div className="h-full w-full bg-pending" />
          )}
        </div>
        <div className="absolute inset-y-[-12px] left-1/2 w-[5px] -translate-x-1/2 rounded-full bg-fg" />
      </div>
      <div className="mt-5 text-center text-[22px] font-medium text-fg-muted">50% dos votos válidos</div>
    </div>
  );
}

/** Prévia escalada (o nó exportado mantém o tamanho real). */
export function ShareCardPreview({ children, formato, className }: { children: ReactNode; formato: ShareFormato; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [esc, setEsc] = useState(0.3);
  const { w, h } = SHARE_DIMENSOES[formato];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setEsc(el.clientWidth / w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className={cn('relative w-full overflow-hidden rounded-2xl border border-line shadow-card', className)} style={{ aspectRatio: `${w} / ${h}` }}>
      <div style={{ width: w, height: h, transform: `scale(${esc})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
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
  const [aberto, setAberto] = useState(false);
  const [formato, setFormato] = useState<ShareFormato>('feed');
  const [ocupado, setOcupado] = useState<null | 'img' | 'png'>(null);
  const card = useRef<HTMLDivElement>(null);
  const caminhoAtual = caminho ?? (typeof window !== 'undefined' ? (__DEMO__ ? window.location.hash.replace(/^#/, '') || '/' : window.location.pathname + window.location.search) : '/');
  const url = urlAbsoluta(caminhoAtual);
  const msg = texto ?? textoCompartilhamento(race, resumo, simulado);
  const nome = `sintonia-${race.id}-${formato}`;

  async function compartilharImagem() {
    if (!card.current) return;
    setOcupado('img');
    try {
      const r = await compartilharNodeComoImagem(card.current, nome, { titulo: 'Sintonia · Apuração', texto: msg, url });
      if (r === 'baixado') toast('Imagem baixada', { tone: 'ok' });
    } catch {
      toast('Não foi possível gerar a imagem', { tone: 'alert' });
    } finally {
      setOcupado(null);
    }
  }
  async function baixar() {
    if (!card.current) return;
    setOcupado('png');
    try {
      await downloadNodeAsPng(card.current, nome);
      toast('Imagem baixada', { tone: 'ok' });
    } catch {
      toast('Não foi possível gerar a imagem', { tone: 'alert' });
    } finally {
      setOcupado(null);
    }
  }
  async function copiar() {
    const ok = await copiarLink(url);
    toast(ok ? 'Link copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'link' : undefined });
  }

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label={label}
          title={label}
          className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', className)}
        >
          <Icon name="compartilhar" size={18} />
        </button>
      ) : (
        <Button variant={variant} size={size} icon="compartilhar" onClick={() => setAberto(true)} className={className}>
          {label}
        </Button>
      )}
      <Sheet
        open={aberto}
        onClose={() => setAberto(false)}
        title="Compartilhar placar"
        description="Imagem pronta para WhatsApp, Instagram e X."
        width="md"
        footer={
          <div className="grid grid-cols-2 gap-2 pb-1">
            <Button variant="primary" icon="compartilhar" loading={ocupado === 'img'} onClick={compartilharImagem} className="col-span-2">
              Compartilhar imagem
            </Button>
            <Button variant="secondary" icon="download" loading={ocupado === 'png'} onClick={baixar}>
              Baixar PNG
            </Button>
            <Button variant="secondary" icon="whatsapp" onClick={() => abrirWhatsapp(msg, url)}>
              WhatsApp
            </Button>
            <Button variant="ghost" icon="link" onClick={copiar} className="col-span-2">
              Copiar link
            </Button>
          </div>
        }
      >
        <Segmented<ShareFormato>
          ariaLabel="Formato da imagem"
          value={formato}
          onChange={setFormato}
          block
          options={[
            { value: 'feed', label: SHARE_DIMENSOES.feed.rotulo },
            { value: 'story', label: SHARE_DIMENSOES.story.rotulo },
          ]}
        />
        <div className={cn('mx-auto mt-4', formato === 'story' ? 'max-w-[240px]' : 'max-w-[340px]')}>
          <ShareCardPreview formato={formato}>
            <ShareCard ref={card} race={race} resumo={resumo} formato={formato} simulado={simulado} local={local} caminho={caminho ?? '/apuracao'} />
          </ShareCardPreview>
        </div>
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-fg-muted">{msg}</p>
        {resumo.ultimaAtualizacao ? (
          <p className="num mt-2 text-[12px] text-fg-subtle">Dados de {fmtDataHora(resumo.ultimaAtualizacao)} (Brasília).</p>
        ) : null}
      </Sheet>
    </>
  );
}
