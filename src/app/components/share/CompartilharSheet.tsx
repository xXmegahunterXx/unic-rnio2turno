/**
 * Sheet de compartilhamento do kit: prévia do cartão escalada, seletor de formato e as ações
 *  - computador: "Postar no X" (intenção com texto + link + hashtags; link de verdade, funciona no app do X e em iframes),
 *    "Compartilhar…" (Web Share com o PNG quando o navegador aceita arquivo; senão texto + link), "WhatsApp",
 *    "Baixar imagem" (PNG), "Copiar link", "Copiar texto";
 *  - celular (I20, `prefereWhatsapp`): "Enviar no WhatsApp" é o principal — Web Share com o PNG e o texto quando o
 *    navegador aceita arquivo, senão o wa.me —, "Status / Stories" (troca para o 9:16 e, pronto, abre o Web Share com
 *    ele) e "Postar no X" como secundários; Telegram, Salvar, Copiar link e Copiar texto embaixo.
 *  - Links rastreáveis (I08, `urlCompartilhada`): cada canal leva o seu `utm_source` (whatsapp, x, telegram, copiar,
 *    story); X e Telegram, durante a apuração, também `h=HHMM` (relógio do servidor do status em cache, a cada 5 min),
 *    para o cartão de prévia não sair velho. Na apuração, WhatsApp/Telegram/Status terminam com "Acompanhe seção por
 *    seção:" antes do link (`sufixoDoCaminho`).
 *  - Depois de "Copiado", aparece o "Siga o Sintonia" (some sem redes configuradas; chunk próprio).
 *  - A caixa de texto mostra o que a ação principal envia: no celular, a mensagem do WhatsApp (sem hashtags; é também o
 *    que "Copiar texto" copia); no computador, o post do X com a contagem de caracteres.
 *
 * No navegador embutido (X, Instagram, Facebook, TikTok, LinkedIn, WebViews) e dentro de iframes, o download vira um
 * modal com a imagem para "tocar e segurar" (WebViews costumam bloquear downloads em silêncio).
 *
 * O PNG é gerado em segundo plano assim que o sheet abre (e refeito se o cartão mudar): na hora do toque o arquivo já
 * existe e o `navigator.share` sai dentro do gesto do usuário — o Safari recusa o compartilhamento se houver espera.
 * Os dados ficam "congelados" do momento em que o sheet abriu (texto e imagem sempre batem).
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LiveStatus } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import {
  NOME_APP_EMBUTIDO,
  baixarArquivo,
  blobParaDataUrl,
  compartilharArquivo,
  compartilharLink,
  copiarLink,
  copiarTexto,
  emIframe,
  navegadorEmbutido,
  normalizarHashtags,
  pesoPostX,
  podeCompartilharArquivo,
  podeCompartilharNativo,
  prefereWhatsapp,
  telaDeToque,
  telegramUrl,
  textoComLink,
  urlAbsoluta,
  urlCompartilhada,
  whatsappUrl,
  xIntentUrl,
  LIMITE_X,
} from '@/app/lib/share';
import { Button, buttonClasses } from '@/app/ui/Button';
import { Dialog } from '@/app/ui/Dialog';
import { Icon, type IconName } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Sheet } from '@/app/ui/Sheet';
import { Spinner } from '@/app/ui/Button';
import { toast } from '@/app/ui/Toast';
import { PreviaCartao } from './PreviaCartao';
import { gerarPngCartao } from './png';
import { comPrefixoSimulacao, comSufixoLink, sufixoDoCaminho } from './textos';
import { DIMENSOES_CARTAO, FORMATOS_PADRAO, type ConteudoCompartilhavel, type FormatoCartao } from './tipos';

/** "Siga o Sintonia" só depois de "Copiado": chunk próprio, fora do JS inicial das páginas com o kit (ARCHITECTURE §11.9). */
const SigaSintonia = lazy(() => import('@/app/components/crescimento/SigaSintonia'));

export interface CompartilharSheetProps extends ConteudoCompartilhavel {
  aberto: boolean;
  onFechar: () => void;
  /** Linha sob o título do sheet. */
  descricao?: ReactNode;
  /** Os dados do cartão ainda estão chegando (as ações de imagem esperam; o cartão é redesenhado quando chegam). */
  carregando?: boolean;
}

/** Logo do X (marca do serviço, para o botão de postar). */
export function LogoX({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0', className)} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface Imagem {
  blob: Blob;
  file: File;
  versao: number;
}

/** Logo do Telegram (avião de papel), para o atalho do celular. */
function LogoTelegram({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn('shrink-0', className)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round">
      <path d="M21 4.5 3.6 11.3c-.8.3-.8 1.4 0 1.7l4.2 1.5 1.6 5c.2.7 1.1.9 1.6.4l2.4-2.3 4.3 3.1c.6.4 1.4.1 1.6-.6L22 5.6c.2-.8-.5-1.4-1-1.1Z" />
      <path d="m7.8 14.5 9.7-6.6-6.9 7.5" />
    </svg>
  );
}

/**
 * Hora do servidor para o `h=` dos links (I08), lida do status JÁ em cache (sem consulta nova nem assinatura): só durante
 * a apuração; fora dela, undefined (o link sai sem hora).
 */
function agoraDaApuracao(status: LiveStatus | undefined, recebidoEm: number | undefined): number | undefined {
  if (!status || status.fase !== 'apurando' || !recebidoEm) return undefined;
  return status.wallNow + Math.max(0, Date.now() - recebidoEm);
}

/** Este navegador aceita compartilhar um PNG pelo Web Share (teste com um arquivo de 1 byte). */
function aceitaArquivoPng(): boolean {
  try {
    return podeCompartilharArquivo(new File([new Uint8Array([0])], 'sintonia.png', { type: 'image/png' }));
  } catch {
    return false;
  }
}

/** Classes do botão "Postar no X" (preto no claro, branco no escuro, como a marca). */
export const CLASSE_BOTAO_X = '!bg-fg !text-bg shadow-card hover:opacity-90';

const LARGURA_PREVIA: Record<FormatoCartao, string> = {
  x: 'max-w-[440px]',
  feed: 'max-w-[300px]',
  story: 'max-w-[228px]',
};

export function CompartilharSheet({
  aberto,
  onFechar,
  titulo,
  texto,
  caminho,
  hashtags,
  nomeArquivo,
  cartao,
  formatos = FORMATOS_PADRAO,
  simulado,
  descricao,
  carregando,
}: CompartilharSheetProps) {
  const [formatoEscolhido, setFormato] = useState<FormatoCartao>(formatos[0] ?? 'x');
  const formato = formatos.includes(formatoEscolhido) ? formatoEscolhido : (formatos[0] ?? 'x');
  const [ocupado, setOcupado] = useState<null | 'img' | 'png'>(null);
  const [estado, setEstado] = useState<'ocioso' | 'gerando' | 'pronta' | 'erro'>('ocioso');
  const [modal, setModal] = useState<{ src: string; imagem: Imagem } | null>(null);
  const [talvezNaoBaixou, setTalvezNaoBaixou] = useState(false);
  const no = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<FormatoCartao, Imagem>());
  const versao = useRef(0);
  const emCurso = useRef<{ formato: FormatoCartao; versao: number; p: Promise<Imagem> } | null>(null);

  const qc = useQueryClient();
  const [copiou, setCopiou] = useState(false);
  const ambiente = useMemo(
    () => ({
      embutido: navegadorEmbutido(),
      iframe: emIframe(),
      nativo: podeCompartilharNativo(),
      toque: telaDeToque(),
      celular: prefereWhatsapp(),
      arquivo: aceitaArquivoPng(),
    }),
    [],
  );

  // Instantâneo do conteúdo no momento em que o sheet abre (ou troca de formato / termina de carregar).
  const snap = useMemo(
    () => {
      if (!aberto) return null;
      const t = comPrefixoSimulacao(texto, simulado);
      const tags = normalizarHashtags(hashtags);
      const url = urlAbsoluta(caminho);
      const agora = agoraDaApuracao(qc.getQueryData<LiveStatus>(['status']), qc.getQueryState(['status'])?.dataUpdatedAt);
      // um link por canal (I08); o `url` puro é o do Web Share genérico e o que aparece na caixa do texto
      const links = {
        x: urlCompartilhada(url, 'x', agora),
        whatsapp: urlCompartilhada(url, 'whatsapp'),
        telegram: urlCompartilhada(url, 'telegram', agora),
        copiar: urlCompartilhada(url, 'copiar'),
        story: urlCompartilhada(url, 'story'),
      };
      // WhatsApp, Telegram e Status: texto + "Acompanhe seção por seção:" (só na apuração), sem hashtags
      const mensagem = comSufixoLink(t, sufixoDoCaminho(caminho));
      return { texto: t, tags, url, links, mensagem, el: cartao ? cartao(formato) : null };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aberto, formato, carregando],
  );

  // Fechou: descarta as imagens (os números podem ter mudado até a próxima vez).
  useEffect(() => {
    if (aberto) return;
    cache.current.clear();
    emCurso.current = null;
    setEstado('ocioso');
    setTalvezNaoBaixou(false);
    setCopiou(false);
  }, [aberto]);

  const valida = (): Imagem | null => {
    const c = cache.current.get(formato);
    return c && c.versao === versao.current ? c : null;
  };

  function obter(): Promise<Imagem> {
    const pronta = valida();
    if (pronta) return Promise.resolve(pronta);
    const v = versao.current;
    if (emCurso.current && emCurso.current.formato === formato && emCurso.current.versao === v) return emCurso.current.p;
    const node = no.current;
    if (!node) return Promise.reject(new Error('sem cartão'));
    const { w, h } = DIMENSOES_CARTAO[formato];
    const f = formato;
    setEstado('gerando');
    const p = gerarPngCartao(node, w, h).then((blob) => {
      const img: Imagem = { blob, file: new File([blob], `${nomeArquivo}-${f}.png`, { type: 'image/png' }), versao: v };
      cache.current.set(f, img);
      return img;
    });
    emCurso.current = { formato: f, versao: v, p };
    p.then(
      () => {
        if (emCurso.current?.p === p) {
          emCurso.current = null;
          setEstado(versao.current === v ? 'pronta' : 'gerando');
        }
      },
      () => {
        if (emCurso.current?.p === p) {
          emCurso.current = null;
          setEstado('erro');
        }
      },
    );
    return p;
  }

  // Gera em segundo plano; refaz quando o cartão muda (foto que chegou, dado que carregou).
  useEffect(() => {
    if (!aberto || !snap?.el || carregando) return;
    let timer = 0;
    const agendar = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        obter().catch(() => undefined);
      }, ms);
    };
    setEstado(valida() ? 'pronta' : 'gerando');
    agendar(400);
    const node = no.current;
    const mo = node
      ? new MutationObserver(() => {
          versao.current++;
          setEstado('gerando');
          agendar(650);
        })
      : null;
    if (node && mo) mo.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => {
      window.clearTimeout(timer);
      mo?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, snap, carregando]);

  async function abrirModal(imagem: Imagem) {
    try {
      setModal({ src: await blobParaDataUrl(imagem.blob), imagem });
    } catch {
      toast('Não foi possível mostrar a imagem', { tone: 'alert' });
    }
  }

  async function comImagem(tipo: 'img' | 'png', acao: (img: Imagem) => Promise<void> | void) {
    const pronta = valida();
    if (pronta) return acao(pronta);
    setOcupado(tipo);
    try {
      await acao(await obter());
    } catch {
      toast('Não foi possível gerar a imagem', { tone: 'alert' });
    } finally {
      setOcupado(null);
    }
  }

  async function compartilharImagem(imagem: Imagem | null) {
    if (!snap) return;
    const textoCompleto = textoComLink(snap.texto, snap.url, snap.tags);
    if (imagem && podeCompartilharArquivo(imagem.file)) {
      const r = await compartilharArquivo(imagem.file, { titulo: 'Sintonia', texto: textoCompleto });
      if (r === 'bloqueado' || r === 'indisponivel') await abrirModal(imagem);
      return;
    }
    const r = await compartilharLink({ titulo: 'Sintonia', texto: textoComLink(snap.texto, undefined, snap.tags), url: snap.url });
    if (r === 'bloqueado' || r === 'indisponivel') {
      if (imagem) await abrirModal(imagem);
      else copiar('tudo');
    }
  }

  function onCompartilhar() {
    if (!snap?.el) return void compartilharImagem(null);
    void comImagem('img', (img) => compartilharImagem(img));
  }

  /** Celular: "Enviar no WhatsApp" com o PNG e o texto (Web Share); recusado → a imagem para salvar (com o wa.me no rodapé). */
  function onWhatsappArquivo() {
    void comImagem('img', async (img) => {
      if (!snap) return;
      const r = await compartilharArquivo(img.file, { titulo: 'Sintonia', texto: `${snap.mensagem}\n${snap.links.whatsapp}` });
      if (r === 'bloqueado' || r === 'indisponivel') await abrirModal(img);
    });
  }

  /**
   * "Status / Stories": 1º toque troca para o 9:16 (a imagem é preparada em segundo plano); com ela pronta, abre o Web Share
   * com o PNG (o Safari só aceita dentro do toque). Sem Web Share de arquivo, a imagem para salvar e postar à mão.
   */
  function onStatus() {
    if (formato !== 'story') {
      setFormato('story');
      return;
    }
    void comImagem('img', async (img) => {
      if (!snap) return;
      if (!podeCompartilharArquivo(img.file)) return void abrirModal(img);
      const r = await compartilharArquivo(img.file, { titulo: 'Sintonia', texto: `${snap.mensagem}\n${snap.links.story}` });
      if (r === 'bloqueado' || r === 'indisponivel') await abrirModal(img);
    });
  }

  function onBaixar() {
    void comImagem('png', async (img) => {
      if (ambiente.embutido || ambiente.iframe) {
        await abrirModal(img);
        return;
      }
      baixarArquivo(img.blob, `${nomeArquivo}-${formato}`);
      toast('Imagem baixada', { tone: 'ok', icon: 'download' });
      setTalvezNaoBaixou(true);
    });
  }

  async function copiar(o: 'link' | 'texto' | 'tudo') {
    if (!snap) return;
    const link = snap.links.copiar;
    // no celular, o texto copiado é o mesmo da caixa: a mensagem do WhatsApp (sem hashtags), que é o destino mais comum
    const texto = ambiente.celular ? `${snap.mensagem}\n${link}` : textoComLink(snap.texto, link, snap.tags);
    const ok = o === 'link' ? await copiarLink(link) : await copiarTexto(texto);
    toast(ok ? (o === 'link' ? 'Link copiado' : 'Texto e link copiados') : 'Não foi possível copiar', {
      tone: ok ? 'ok' : 'alert',
      icon: ok ? (o === 'link' ? 'link' : 'copiar') : undefined,
    });
    if (ok) setCopiou(true);
  }

  const xUrl = snap ? xIntentUrl(snap.texto, snap.links.x, snap.tags) : '#';
  const zapUrl = snap ? whatsappUrl(snap.mensagem, snap.links.whatsapp) : '#';
  const tgUrl = snap ? telegramUrl(snap.mensagem, snap.links.telegram) : '#';
  const peso = snap ? pesoPostX(snap.texto, snap.tags, true) : 0;
  const temImagem = !!snap?.el;
  const celular = ambiente.celular;
  const temStory = temImagem && formatos.includes('story');
  const zapComArquivo = temImagem && ambiente.arquivo;
  const app = ambiente.embutido ? NOME_APP_EMBUTIDO[ambiente.embutido] : null;
  const salvarRotulo = ambiente.embutido || ambiente.iframe ? 'Salvar imagem' : 'Baixar imagem';

  return (
    <>
      <Sheet
        open={aberto}
        onClose={onFechar}
        title={titulo}
        description={
          descricao ??
          (temImagem
            ? celular
              ? 'Imagem, texto e link prontos para o WhatsApp, o Status e o X.'
              : 'Imagem, texto e link prontos para o X, o WhatsApp e o Instagram.'
            : 'Texto e link prontos para postar.')
        }
        width="md"
        footer={
          celular ? (
            // Celular (I20): WhatsApp primeiro; Status/Stories e X como secundários.
            <div className="space-y-2 pb-1">
              {zapComArquivo ? (
                <Button variant="primary" size="lg" block icon="whatsapp" loading={ocupado === 'img' && formato !== 'story'} onClick={onWhatsappArquivo} data-acao="whatsapp-principal">
                  Enviar no WhatsApp
                </Button>
              ) : (
                <a href={zapUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses({ variant: 'primary', size: 'lg', block: true }))} data-acao="whatsapp-principal">
                  <Icon name="whatsapp" size={19} />
                  Enviar no WhatsApp
                </a>
              )}
              <div className={cn('grid gap-2', temStory ? 'grid-cols-2' : 'grid-cols-1')}>
                {temStory ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    icon={formato === 'story' ? 'compartilhar' : 'grade'}
                    loading={formato === 'story' && (ocupado === 'img' || estado === 'gerando')}
                    onClick={onStatus}
                    className="px-3"
                    data-acao="status"
                  >
                    {formato === 'story' ? 'Enviar ao Status' : 'Status / Stories'}
                  </Button>
                ) : null}
                <a href={xUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses({ variant: 'secondary', size: 'lg' }), 'px-3')} data-acao="postar-x">
                  <LogoX size={16} />
                  Postar no X
                </a>
              </div>
              <div className={cn('grid gap-1.5', temImagem ? 'grid-cols-4' : 'grid-cols-3')}>
                <AcaoLink href={tgUrl} label="Telegram" acao="telegram" icone={<LogoTelegram size={18} />} />
                {temImagem ? (
                  <AcaoBotao icon="download" label={ambiente.embutido || ambiente.iframe ? 'Salvar' : 'Baixar'} onClick={onBaixar} carregando={ocupado === 'png'} acao="baixar" />
                ) : null}
                <AcaoBotao icon="link" label="Copiar link" onClick={() => copiar('link')} acao="copiar-link" />
                <AcaoBotao icon="copiar" label="Copiar texto" onClick={() => copiar('texto')} acao="copiar-texto" />
              </div>
            </div>
          ) : (
            <div className="space-y-2 pb-1">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={xUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonClasses({ size: 'lg' }), CLASSE_BOTAO_X, 'px-3')}
                  data-acao="postar-x"
                >
                  <LogoX size={17} />
                  Postar no X
                </a>
                {ambiente.nativo || !temImagem ? (
                  <Button variant="primary" size="lg" icon="compartilhar" loading={ocupado === 'img'} onClick={onCompartilhar} className="px-3" data-acao="compartilhar">
                    Compartilhar…
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" icon="download" loading={ocupado === 'png'} onClick={onBaixar} className="px-3" data-acao="baixar-principal">
                    {salvarRotulo}
                  </Button>
                )}
              </div>
              <div className={cn('grid gap-1.5', temImagem ? 'grid-cols-4' : 'grid-cols-3')}>
                <AcaoLink href={zapUrl} icon="whatsapp" label="WhatsApp" acao="whatsapp" />
                {temImagem ? (
                  <AcaoBotao icon="download" label={ambiente.embutido || ambiente.iframe ? 'Salvar' : 'Baixar'} onClick={onBaixar} carregando={ocupado === 'png'} acao="baixar" />
                ) : null}
                <AcaoBotao icon="link" label="Copiar link" onClick={() => copiar('link')} acao="copiar-link" />
                <AcaoBotao icon="copiar" label="Copiar texto" onClick={() => copiar('texto')} acao="copiar-texto" />
              </div>
            </div>
          )
        }
      >
        {app ? (
          <div role="note" className="mb-3 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/[0.08] px-3 py-2.5 text-[13px] leading-snug text-fg">
            <Icon name="info" size={17} className="mt-px shrink-0 text-brand-fg" />
            {/* curto: em telas baixas (navegador embutido) o aviso empurrava a prévia para fora da tela */}
            <p>
              No navegador do {app}, toque em <strong className="font-semibold">Salvar imagem</strong> e depois toque e segure nela para
              guardar.
            </p>
          </div>
        ) : null}

        {temImagem ? (
          <>
            {formatos.length > 1 ? (
              <Segmented<FormatoCartao>
                ariaLabel="Formato da imagem"
                value={formato}
                onChange={setFormato}
                block
                size="sm"
                // respiro: no topo da área rolável, a área de toque invisível (42 px) era cortada
                className="mt-1"
                options={formatos.map((f) => ({ value: f, label: DIMENSOES_CARTAO[f].rotulo }))}
              />
            ) : null}
            <div className={cn('mx-auto mt-4', LARGURA_PREVIA[formato])}>
              <PreviaCartao ref={no} formato={formato}>
                {snap?.el}
              </PreviaCartao>
            </div>
            <p className="mt-2 flex h-5 items-center justify-center gap-1.5 text-center text-[12px] text-fg-subtle" aria-live="polite">
              {carregando ? (
                <>
                  <Spinner size={12} /> Carregando os dados…
                </>
              ) : estado === 'gerando' ? (
                <>
                  <Spinner size={12} /> Preparando a imagem…
                </>
              ) : estado === 'pronta' ? (
                <>
                  <Icon name="check" size={13} className="text-brand-fg" />
                  <span className="num">
                    Imagem pronta · {DIMENSOES_CARTAO[formato].w}×{DIMENSOES_CARTAO[formato].h}
                  </span>
                </>
              ) : estado === 'erro' ? (
                <>Não foi possível gerar a imagem agora. Tente de novo.</>
              ) : null}
            </p>
            {talvezNaoBaixou ? (
              <p className="mt-1 text-center text-[12.5px] text-fg-muted">
                Não baixou?{' '}
                <button
                  type="button"
                  className="font-medium text-brand-fg underline underline-offset-2"
                  onClick={() => {
                    const img = valida();
                    if (img) void abrirModal(img);
                  }}
                >
                  Abrir a imagem para salvar
                </button>
              </p>
            ) : null}
          </>
        ) : null}

        {/* no celular a caixa mostra o que o botão principal envia (a mensagem do WhatsApp); no computador, o post do X */}
        <div className="mt-4 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            <span>{celular ? 'Mensagem' : 'Texto do post'}</span>
            {celular ? null : (
              <span className={cn('num normal-case tracking-normal', peso > LIMITE_X ? 'text-alert-fg' : '')} title="Caracteres no X (o link conta 23)">
                {peso}/{LIMITE_X}
              </span>
            )}
          </div>
          {celular ? (
            <p className="whitespace-pre-line text-pretty text-[13.5px] leading-snug text-fg">{snap?.mensagem}</p>
          ) : (
            <p className="text-pretty text-[13.5px] leading-snug text-fg">
              {snap?.texto}
              {snap?.tags.length ? <span className="text-brand-fg"> {snap.tags.map((t) => `#${t}`).join(' ')}</span> : null}
            </p>
          )}
          <p className="mt-1 truncate text-[12.5px] text-fg-muted">{snap?.url}</p>
        </div>
        {/* depois de "Copiado": quem copia o link é quem volta — "Siga o Sintonia" (some sem redes configuradas) */}
        {copiou ? (
          <Suspense fallback={null}>
            <SigaSintonia variante="linha" className="mt-4 rounded-xl border border-line px-3.5 py-3" />
          </Suspense>
        ) : null}
        {temImagem ? (
          <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-snug text-fg-subtle">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            Para postar com a imagem no X, salve-a e anexe ao post: o texto e o link já vão prontos.
          </p>
        ) : null}
      </Sheet>

      <Dialog
        open={!!modal}
        onClose={() => setModal(null)}
        title={ambiente.toque ? 'Toque e segure para salvar' : 'Salvar a imagem'}
        description={
          ambiente.toque
            ? 'Toque e segure a imagem e escolha “Salvar imagem” (ou “Adicionar às Fotos”). Depois é só anexar ao post.'
            : 'Clique com o botão direito na imagem e escolha “Salvar imagem como…”.'
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" icon="copiar" onClick={() => copiar('texto')}>
              Copiar texto
            </Button>
            {modal && podeCompartilharArquivo(modal.imagem.file) ? (
              <Button variant="secondary" size="sm" icon="compartilhar" onClick={() => modal && compartilharImagem(modal.imagem)}>
                Compartilhar
              </Button>
            ) : null}
            {celular ? (
              <a href={zapUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
                <Icon name="whatsapp" size={15} />
                WhatsApp
              </a>
            ) : (
              <a href={xUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses({ size: 'sm' }), CLASSE_BOTAO_X)}>
                <LogoX size={14} />
                Postar no X
              </a>
            )}
          </>
        }
      >
        {modal ? (
          <img
            src={modal.src}
            alt={`Imagem para compartilhar: ${titulo}`}
            className="mx-auto max-h-[58dvh] w-auto max-w-full rounded-xl border border-line object-contain shadow-card [-webkit-touch-callout:default]"
            data-imagem-salvar
          />
        ) : null}
        {modal && !ambiente.embutido ? (
          <div className="mt-3 text-center">
            <button
              type="button"
              className="text-[12.5px] font-medium text-brand-fg underline underline-offset-2"
              onClick={() => baixarArquivo(modal.imagem.blob, `${nomeArquivo}-${formato}`)}
            >
              Tentar baixar o arquivo PNG
            </button>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

const TILE =
  'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11.5px] font-medium leading-tight text-fg-muted transition-colors ' +
  'hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97] disabled:opacity-50';

function AcaoLink({ href, icon, icone, label, acao }: { href: string; icon?: IconName; icone?: ReactNode; label: string; acao?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={TILE} data-acao={acao}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-fg">
        {icone ?? (icon ? <Icon name={icon} size={18} /> : null)}
      </span>
      <span className="w-full truncate text-center">{label}</span>
    </a>
  );
}

function AcaoBotao({ icon, label, onClick, carregando, acao }: { icon: IconName; label: string; onClick: () => void; carregando?: boolean; acao?: string }) {
  return (
    <button type="button" onClick={onClick} className={TILE} disabled={carregando} aria-busy={carregando || undefined} data-acao={acao}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-fg">
        {carregando ? <Spinner size={16} /> : <Icon name={icon} size={18} />}
      </span>
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}
