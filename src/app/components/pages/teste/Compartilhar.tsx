/**
 * Compartilhar do Teste Cego (o motor viral do site), sem ferir a LGPD nem a neutralidade. Tudo acontece no aparelho:
 * a imagem é gerada no navegador (kit `@/app/components/share`) e nenhuma resposta vai a servidor.
 *
 *  - `PainelCompartilhar` — "Compartilhe no X": a pessoa ESCOLHE a versão.
 *      · "Desafio" (padrão): não diz o resultado; convida a fazer o teste. Link: /teste.
 *      · "Meu resultado" (opt-in explícito, com aviso): a sintonia com cada candidato. Link: /teste (nunca o resultado).
 *  - `PainelDuelo` — "Desafie alguém": o link leva as respostas de quem convida DEPOIS DO "#" (o navegador não envia essa
 *    parte a servidor algum), e quem abrir o link verá essas respostas na comparação. Por isso as ações só liberam
 *    depois de a pessoa marcar que entendeu — e o aviso é mais forte para o X, onde o link fica público.
 *  - `PainelResultadoDuelo` — "Concordamos em N de M": só o placar entre as duas pessoas. Link: /teste.
 *
 * "Postar no X" é um link de verdade para a intenção do X (funciona no navegador do app do X e em iframes);
 * "Imagem e mais" abre o sheet do kit (PNG nos 3 formatos, Web Share com arquivo, WhatsApp, salvar no navegador embutido).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AFIRMACOES, type ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { compartilharLink, copiarTexto, textoComLink, urlAbsoluta, whatsappUrl, xIntentUrl } from '@/app/lib/share';
import { buttonClasses } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { toast } from '@/app/ui/Toast';
import { BotaoCompartilhar, CLASSE_BOTAO_X, LogoX, PreviaCartao, type FormatoCartao } from '@/app/components/share';
import { CartaoConviteDuelo, CartaoDesafio, CartaoDuelo, CartaoMeuResultado } from './CartaoTeste';
import { caminhoDuelo } from './codigo';
import type { MapaRespostas } from './sessao';
import type { Autor, ComparacaoDuelo } from './sintonia';
import { HASHTAGS_TESTE, textoConviteDuelo, textoDesafio, textoDuelo, textoMeuResultado } from './textosTeste';

const N = AFIRMACOES.length;

// ── Peças ─────────────────────────────────────────────────────────────────────

function Painel({ icone, titulo, descricao, children, className, id }: { icone: IconName; titulo: ReactNode; descricao?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name={icone} size={20} />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[21px]">
            {titulo}
          </h2>
          {descricao ? <p className="mt-1 text-pretty text-[13.5px] leading-snug text-fg-muted">{descricao}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Prévia do cartão 16:9 (o mesmo que vira PNG no sheet). */
function Previa({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <figure className="relative">
      <PreviaCartao formato="x" className="pointer-events-none select-none">
        {children}
      </PreviaCartao>
      <figcaption className="sr-only">{rotulo}</figcaption>
    </figure>
  );
}

/** Caixa com o texto do post (como vai aparecer). */
function TextoPost({ texto, url }: { texto: string; url: string }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      <p className="text-pretty text-[13.5px] leading-snug text-fg">
        {texto} <span className="text-brand-fg">{HASHTAGS_TESTE.map((t) => `#${t}`).join(' ')}</span>
      </p>
      <p className="mt-1 truncate text-[12px] text-fg-subtle">{url}</p>
    </div>
  );
}

/** "Postar no X" (link real da intenção do X). */
function LinkX({ href, desabilitado, className, children = 'Postar no X' }: { href: string; desabilitado?: boolean; className?: string; children?: ReactNode }) {
  return (
    <a
      href={desabilitado ? undefined : href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={desabilitado || undefined}
      onClick={desabilitado ? (e) => e.preventDefault() : undefined}
      className={cn(buttonClasses({ size: 'lg' }), CLASSE_BOTAO_X, 'px-3', desabilitado && 'pointer-events-none opacity-45', className)}
      data-acao="postar-x"
    >
      <LogoX size={17} />
      {children}
    </a>
  );
}

// ── Compartilhe no X (desafio × meu resultado) ────────────────────────────────

export type ModoCompartilhar = 'desafio' | 'resultado';

export interface PainelCompartilharProps {
  resultado: ResultadoSintonia;
  candidatos: Candidate[];
  fotos: Partial<Record<Autor, string>>;
  /** Afirmações que a pessoa recebeu (24, ou 12 no modo rápido). */
  n: number;
  rapido?: boolean;
  /** Nomes/fotos dos candidatos ainda chegando (a imagem "Meu resultado" espera). */
  carregando?: boolean;
  className?: string;
}

export function PainelCompartilhar({ resultado, candidatos, fotos, n, rapido, carregando, className }: PainelCompartilharProps) {
  const [modo, setModo] = useState<ModoCompartilhar>('desafio');
  const idT = useId();
  const caminho = '/teste';
  const url = urlAbsoluta(caminho);
  const texto = modo === 'desafio' ? textoDesafio(N) : textoMeuResultado(candidatos, resultado, rapido);
  const cartao = useMemo(
    () =>
      modo === 'desafio'
        ? (f: FormatoCartao) => <CartaoDesafio formato={f} n={N} />
        : (f: FormatoCartao) => <CartaoMeuResultado formato={f} resultado={resultado} candidatos={candidatos} fotos={fotos} n={n} rapido={rapido} />,
    [modo, resultado, candidatos, fotos, n, rapido],
  );

  return (
    <Painel
      id={idT}
      icone="compartilhar"
      titulo="Compartilhe no X"
      descricao="A imagem é gerada aqui no seu aparelho. Você escolhe se ela mostra o seu resultado."
      className={className}
    >
      <Segmented<ModoCompartilhar>
        ariaLabel="Versão da imagem"
        value={modo}
        onChange={setModo}
        block
        size="sm"
        options={[
          { value: 'desafio', label: 'Desafio', icon: 'olho-fechado' },
          { value: 'resultado', label: 'Meu resultado', icon: 'selo' },
        ]}
      />
      <AnimatePresence initial={false} mode="wait">
        <motion.p
          key={modo}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.16 }}
          className={cn(
            'mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug',
            modo === 'desafio' ? 'bg-surface-2 text-fg-muted' : 'border border-brand/30 bg-brand/[0.08] text-fg',
          )}
        >
          <Icon name={modo === 'desafio' ? 'olho-fechado' : 'info'} size={15} className="mt-px shrink-0 text-brand-fg" />
          {modo === 'desafio' ? (
            <span>Não mostra nada do seu resultado: convida a pessoa a fazer o teste e descobrir o dela.</span>
          ) : (
            <span>
              <strong className="font-semibold">Mostra a sua sintonia com cada candidato.</strong> Opinião política é dado sensível: compartilhe só se
              quiser. O link leva ao teste, nunca às suas respostas.
            </span>
          )}
        </motion.p>
      </AnimatePresence>

      <div className="mt-3">
        <Previa rotulo={modo === 'desafio' ? 'Prévia do convite' : 'Prévia da imagem com o seu resultado'}>{cartao('x')}</Previa>
      </div>
      <TextoPost texto={texto} url={url} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <LinkX href={xIntentUrl(texto, url, HASHTAGS_TESTE)} />
        <BotaoCompartilhar
          key={modo}
          titulo={modo === 'desafio' ? 'Compartilhar desafio' : 'Compartilhar meu resultado'}
          descricao={modo === 'desafio' ? 'Convite sem o seu resultado. Imagem gerada no seu aparelho.' : 'Com a sua sintonia com cada candidato. Imagem gerada no seu aparelho.'}
          texto={texto}
          caminho={caminho}
          hashtags={HASHTAGS_TESTE}
          nomeArquivo={modo === 'desafio' ? 'sintonia-teste-cego' : 'sintonia-teste-cego-resultado'}
          cartao={cartao}
          carregando={modo === 'resultado' && carregando}
          label="Imagem e mais"
          icone="download"
          variant="primary"
          size="lg"
          className="px-3"
        />
      </div>
    </Painel>
  );
}

// ── Desafie alguém (Duelo) ────────────────────────────────────────────────────

export interface PainelDueloProps {
  seed: number;
  respostas: MapaRespostas;
  importantes: string[];
  /** Afirmações do duelo (as que a pessoa respondeu: 24, ou 12 no modo rápido). */
  n: number;
  titulo?: ReactNode;
  className?: string;
}

export function PainelDuelo({ seed, respostas, importantes, n, titulo = 'Duelo: quanto vocês concordam?', className }: PainelDueloProps) {
  const [ciente, setCiente] = useState(false);
  const idT = useId();
  const idCiente = useId();
  const caminho = caminhoDuelo(seed, respostas, importantes);
  const url = urlAbsoluta(caminho);
  const texto = textoConviteDuelo(n);

  async function compartilhar() {
    const r = await compartilharLink({ titulo: 'Sintonia · Duelo', texto: textoComLink(texto, undefined, HASHTAGS_TESTE), url });
    if (r === 'bloqueado' || r === 'indisponivel') await copiar();
  }
  async function copiar() {
    const ok = await copiarTexto(url);
    toast(ok ? 'Link do desafio copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'link' : undefined });
  }

  return (
    <Painel
      id={idT}
      icone="usuarios"
      titulo={titulo}
      descricao={`Quem abrir o link responde às mesmas ${n} afirmações, sem ver as suas respostas. No fim, vocês veem em quantas ficaram do mesmo lado.`}
      className={className}
    >
      <Previa rotulo="Prévia do convite para o duelo">
        <CartaoConviteDuelo formato="x" n={n} />
      </Previa>

      <div className="mt-3 rounded-xl border border-line bg-surface-2/70 p-3.5">
        <p className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
          <Icon name="olho-fechado" size={16} className="mt-px shrink-0 text-brand-fg" />
          <span>
            Suas respostas viajam <strong className="font-semibold text-fg">dentro do próprio link</strong>, depois do “#” — o Sintonia nunca as
            recebe. Mas <strong className="font-semibold text-fg">quem abrir o link verá suas respostas</strong> e a sua sintonia com os
            candidatos na comparação. Postado no X, o link fica público: qualquer pessoa que tocar nele verá.
          </span>
        </p>
        <label htmlFor={idCiente} className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-[13.5px] font-medium text-fg">
          <input
            id={idCiente}
            type="checkbox"
            checked={ciente}
            onChange={(e) => setCiente(e.target.checked)}
            className="h-5 w-5 shrink-0 cursor-pointer rounded accent-brand"
            data-acao="ciente-duelo"
          />
          Entendi: quem abrir o link verá minhas respostas
        </label>
      </div>

      <div className={cn('mt-4 grid grid-cols-2 gap-2 transition-opacity', !ciente && 'opacity-90')}>
        <LinkX href={xIntentUrl(texto, url, HASHTAGS_TESTE)} desabilitado={!ciente}>
          Desafiar no X
        </LinkX>
        <a
          href={ciente ? whatsappUrl(texto, url) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!ciente || undefined}
          onClick={!ciente ? (e) => e.preventDefault() : undefined}
          className={cn(buttonClasses({ variant: 'secondary', size: 'lg' }), 'px-3', !ciente && 'pointer-events-none opacity-45')}
          data-acao="whatsapp-duelo"
        >
          <Icon name="whatsapp" size={19} />
          WhatsApp
        </a>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <AcaoMini icone="compartilhar" rotulo="Enviar…" onClick={compartilhar} desabilitado={!ciente} />
        <AcaoMini icone="link" rotulo="Copiar link" onClick={copiar} desabilitado={!ciente} />
        {ciente ? (
          <BotaoCompartilhar
            titulo="Imagem do desafio"
            descricao="A imagem não mostra suas respostas; o link, sim (depois do “#”)."
            texto={texto}
            caminho={caminho}
            hashtags={HASHTAGS_TESTE}
            nomeArquivo="sintonia-duelo-convite"
            cartao={(f) => <CartaoConviteDuelo formato={f} n={n} />}
            label="Imagem"
            icone="download"
            variant="ghost"
            size="md"
            className="!h-auto !min-h-[64px] !flex-col !gap-1 !rounded-xl !px-1 !py-2 !text-[11.5px] !leading-tight"
          />
        ) : (
          <AcaoMini icone="download" rotulo="Imagem" onClick={() => undefined} desabilitado />
        )}
      </div>
      {!ciente ? <p className="mt-2 text-center text-[12px] text-fg-subtle">Marque que entendeu para liberar o envio.</p> : null}
    </Painel>
  );
}

function AcaoMini({ icone, rotulo, onClick, desabilitado }: { icone: IconName; rotulo: string; onClick: () => void; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11.5px] font-medium leading-tight text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
    >
      <Icon name={icone} size={18} />
      <span className="w-full truncate text-center">{rotulo}</span>
    </button>
  );
}

// ── Resultado do Duelo ────────────────────────────────────────────────────────

export function PainelResultadoDuelo({ comp, className }: { comp: ComparacaoDuelo; className?: string }) {
  const idT = useId();
  const caminho = '/teste';
  const url = urlAbsoluta(caminho);
  const texto = textoDuelo(comp.iguais, comp.emComum, comp.afinidade);
  return (
    <Painel
      id={idT}
      icone="compartilhar"
      titulo="Poste o placar do duelo"
      descricao="Só o placar entre vocês dois — nada sobre candidatos nem as respostas de ninguém. O link leva ao teste."
      className={className}
    >
      <Previa rotulo="Prévia do placar do duelo">
        <CartaoDuelo formato="x" comp={comp} />
      </Previa>
      <TextoPost texto={texto} url={url} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <LinkX href={xIntentUrl(texto, url, HASHTAGS_TESTE)} />
        <BotaoCompartilhar
          titulo="Compartilhar o placar do duelo"
          descricao="Só o placar entre vocês dois. Imagem gerada no seu aparelho."
          texto={texto}
          caminho={caminho}
          hashtags={HASHTAGS_TESTE}
          nomeArquivo="sintonia-duelo"
          cartao={(f) => <CartaoDuelo formato={f} comp={comp} />}
          label="Imagem e mais"
          icone="download"
          variant="primary"
          size="lg"
          className="px-3"
        />
      </div>
    </Painel>
  );
}
