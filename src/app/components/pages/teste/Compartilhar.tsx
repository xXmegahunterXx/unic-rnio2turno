/**
 * Ações de compartilhamento do Teste Cego. Tudo acontece no navegador (LGPD):
 *  - Cartão Stories: PNG gerado localmente; o texto NUNCA diz em quem a pessoa vota ("Fiz o Teste Cego…")
 *    e o link é o convite para /teste — nunca o resultado da pessoa.
 *  - Desafio (Duelo): link /duelo/<desafio>#<respostas>. As escolhas vão depois do "#", que o navegador não
 *    envia a servidor; quem abrir o link verá as escolhas na comparação — a pessoa é avisada antes.
 */
import { useRef, useState } from 'react';
import type { Candidate } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { abrirWhatsapp, compartilhar, compartilharNodeComoImagem, copiarTexto, downloadNodeAsPng, urlAbsoluta } from '@/app/lib/share';
import { Button, type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Sheet } from '@/app/ui/Sheet';
import { toast } from '@/app/ui/Toast';
import { Toggle } from '@/app/ui/Toggle';
import { ShareCardPreview } from '@/app/components/apuracao/ShareCard';
import { caminhoDuelo, type Escolha } from './codigo';
import { CARTAO_H, CARTAO_W, CartaoTeste } from './CartaoTeste';
import type { Autor, Sintonia } from './sintonia';

export const TEXTO_CONVITE =
  'Fiz o Teste Cego do Sintonia: escolhi entre propostas reais dos candidatos à Presidência sem saber de quem eram. Faça o seu:';
export const TEXTO_DESAFIO =
  'Te desafio no Teste Cego do Sintonia: 12 escolhas entre propostas reais, sem saber de quem são. No fim, a gente vê em quantos temas concorda.';

interface BotaoProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  label?: string;
}

export function CompartilharCartao({
  sintonia,
  candidatos,
  porNumero,
  variant = 'primary',
  size = 'lg',
  className,
  label = 'Compartilhar cartão',
}: BotaoProps & { sintonia: Sintonia; candidatos: Candidate[]; porNumero: Record<Autor, Candidate> }) {
  const [aberto, setAberto] = useState(false);
  const [comResultado, setComResultado] = useState(true);
  const [ocupado, setOcupado] = useState<null | 'img' | 'png'>(null);
  const card = useRef<HTMLDivElement>(null);
  const url = urlAbsoluta('/teste');
  const nome = 'sintonia-teste-cego';
  const opts = { width: CARTAO_W, height: CARTAO_H };

  async function compartilharImagem() {
    if (!card.current) return;
    setOcupado('img');
    try {
      const r = await compartilharNodeComoImagem(card.current, nome, { titulo: 'Sintonia · Teste Cego', texto: TEXTO_CONVITE, url }, opts);
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
      await downloadNodeAsPng(card.current, nome, opts);
      toast('Imagem baixada', { tone: 'ok' });
    } catch {
      toast('Não foi possível gerar a imagem', { tone: 'alert' });
    } finally {
      setOcupado(null);
    }
  }
  async function copiar() {
    const ok = await copiarTexto(`${TEXTO_CONVITE} ${url}`);
    toast(ok ? 'Texto e link copiados' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'copiar' : undefined });
  }

  return (
    <>
      <Button variant={variant} size={size} icon="compartilhar" onClick={() => setAberto(true)} className={className}>
        {label}
      </Button>
      <Sheet
        open={aberto}
        onClose={() => setAberto(false)}
        title="Compartilhar cartão"
        description="Imagem no formato Stories, gerada aqui no seu aparelho."
        width="md"
        footer={
          <div className="grid grid-cols-2 gap-2 pb-1">
            <Button variant="primary" icon="compartilhar" loading={ocupado === 'img'} onClick={compartilharImagem} className="col-span-2">
              Compartilhar imagem
            </Button>
            <Button variant="secondary" icon="download" loading={ocupado === 'png'} onClick={baixar}>
              Baixar PNG
            </Button>
            <Button variant="secondary" icon="whatsapp" onClick={() => abrirWhatsapp(TEXTO_CONVITE, url)}>
              WhatsApp
            </Button>
            <Button variant="ghost" icon="copiar" onClick={copiar} className="col-span-2">
              Copiar texto e link
            </Button>
          </div>
        }
      >
        <Toggle
          checked={comResultado}
          onChange={setComResultado}
          label="Mostrar meu resultado na imagem"
          description="Desligado, o cartão vira só um convite para o teste."
        />
        <div className="mx-auto mt-4 max-w-[230px]">
          <ShareCardPreview formato="story">
            <CartaoTeste ref={card} sintonia={sintonia} candidatos={candidatos} porNumero={porNumero} comResultado={comResultado} />
          </ShareCardPreview>
        </div>
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-fg-muted">
          {TEXTO_CONVITE} <span className="text-fg">{url}</span>
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-fg-subtle">
          <Icon name="olho-fechado" size={14} className="mt-px shrink-0" />
          O texto e o link não revelam suas escolhas. A imagem só mostra o resultado se você quiser.
        </p>
      </Sheet>
    </>
  );
}

export function DesafiarAmigo({
  seed,
  respostas,
  variant = 'secondary',
  size = 'lg',
  className,
  label = 'Desafiar um amigo',
}: BotaoProps & { seed: number; respostas: Escolha[] }) {
  const [aberto, setAberto] = useState(false);
  const url = urlAbsoluta(caminhoDuelo(seed, respostas));

  async function enviar() {
    const r = await compartilhar({ titulo: 'Sintonia · Teste Cego', texto: TEXTO_DESAFIO, url });
    if (r === 'erro') toast('Não foi possível compartilhar', { tone: 'alert' });
  }
  async function copiar() {
    const ok = await copiarTexto(url);
    toast(ok ? 'Link do desafio copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'link' : undefined });
  }

  return (
    <>
      <Button variant={variant} size={size} icon="usuarios" onClick={() => setAberto(true)} className={className}>
        {label}
      </Button>
      <Sheet
        open={aberto}
        onClose={() => setAberto(false)}
        title="Desafiar um amigo"
        description="Quem abrir o link responde às mesmas 12 escolhas, na mesma ordem."
        width="sm"
        footer={
          <div className="grid grid-cols-1 gap-2 pb-1">
            <Button variant="primary" icon="compartilhar" onClick={enviar}>
              Enviar desafio
            </Button>
            <Button variant="secondary" icon="copiar" onClick={copiar}>
              Copiar link
            </Button>
          </div>
        }
      >
        <ol className="space-y-3">
          {[
            ['1', 'Seu amigo faz o teste sem ver as suas respostas.'],
            ['2', 'No fim, vocês veem em quantos temas concordaram e a sintonia de cada um, lado a lado.'],
          ].map(([n, t]) => (
            <li key={n} className="flex gap-3 text-[14px] leading-snug text-fg">
              <span className="num inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[12px] font-bold text-brand-fg">{n}</span>
              {t}
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Link do desafio</div>
          <div className={cn('mt-1 break-all font-mono text-[12.5px] leading-snug text-fg')}>{url}</div>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-snug text-fg-muted">
          <Icon name="olho-fechado" size={16} className="mt-px shrink-0 text-brand-fg" />
          <span>
            Suas escolhas viajam <strong className="font-semibold text-fg">só dentro do link</strong>, depois do “#” — essa parte não é
            enviada a nenhum servidor. Mas quem abrir o link verá suas escolhas na comparação: envie só para quem você quiser.
          </span>
        </p>
      </Sheet>
    </>
  );
}
