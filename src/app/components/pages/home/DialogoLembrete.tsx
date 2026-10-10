/**
 * "Lembrar da apuração": diálogo com o evento de agenda gerado NO APARELHO (nada sai daqui).
 *  - Apple/iPhone, Outlook e outros: arquivo .ics (link `data:` com `download`, um <a> de verdade — funciona melhor
 *    que download por script em WebViews e no iframe do preview);
 *  - Google Agenda e Outlook.com: links "criar evento" em nova aba;
 *  - Copiar lembrete (texto + link), útil no navegador embutido do X/Instagram, que às vezes não abre o arquivo.
 * Carregado sob demanda na 1ª abertura.
 */
import { useMemo, type ReactNode } from 'react';
import { INICIO_APURACAO } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { copiarTexto, navegadorEmbutido, NOME_APP_EMBUTIDO, urlAbsoluta } from '@/app/lib/share';
import { Dialog } from '@/app/ui/Dialog';
import { Icon, type IconName } from '@/app/ui/Icon';
import { toast } from '@/app/ui/Toast';
import { eventoApuracao, googleAgendaUrl, icsDataUrl, outlookAgendaUrl } from './agenda';
import { rotuloFaltam } from './textosHome';

export default function DialogoLembrete({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const url = useMemo(() => urlAbsoluta('/apuracao'), []);
  const ev = useMemo(() => eventoApuracao(url), [url]);
  const ics = useMemo(() => (aberto ? icsDataUrl(ev) : '#'), [aberto, ev]);
  const embutido = useMemo(() => navegadorEmbutido(), []);
  const faltam = rotuloFaltam(Date.now(), INICIO_APURACAO);

  async function copiar() {
    const ok = await copiarTexto(`Apuração do 2º turno: domingo, 25/10, às 17h (Brasília).\n${url}`);
    toast(ok ? 'Lembrete copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'check' : 'alerta' });
  }

  return (
    <Dialog
      open={aberto}
      onClose={onFechar}
      title="Lembrar da apuração"
      description="Adicione à sua agenda. O evento é criado aqui no seu aparelho."
      size="sm"
    >
      <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2/60 p-3.5">
        <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-cta text-brand-ink">
          <span className="text-[10px] font-bold uppercase leading-none tracking-[0.14em]">Out</span>
          <span className="num mt-0.5 font-display text-[24px] font-semibold leading-none">25</span>
        </span>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-fg">Domingo, às 17h</div>
          <div className="mt-0.5 text-[13px] text-fg-muted">
            Horário de Brasília{faltam ? <span className="num"> · {faltam.toLowerCase()}</span> : null}
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        <li>
          <Opcao href={ics} download="apuracao-2-turno-25-outubro.ics" icone="calendario" titulo="Apple, iPhone e outros" sub="Arquivo de agenda (.ics), com aviso 15 min antes" />
        </li>
        <li>
          <Opcao href={googleAgendaUrl(ev)} externo icone="calendario" titulo="Google Agenda" sub="Abre o Google Agenda em nova aba" />
        </li>
        <li>
          <Opcao href={outlookAgendaUrl(ev)} externo icone="calendario" titulo="Outlook.com" sub="Abre o Outlook na web em nova aba" />
        </li>
      </ul>

      {embutido ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-[12.5px] leading-snug text-fg-muted">
          <Icon name="info" size={15} className="mt-px shrink-0 text-brand-fg" />
          <span>
            No navegador do {NOME_APP_EMBUTIDO[embutido]}, o arquivo da agenda pode não abrir. Use o Google Agenda, copie o lembrete ou abra o
            Sintonia no navegador do celular (menu <span aria-hidden>⋯</span> → Abrir no navegador).
          </span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={copiar}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg text-[13.5px] font-semibold text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Icon name="copiar" size={16} />
        Copiar lembrete com o link
      </button>
    </Dialog>
  );
}

function Opcao({ href, download, externo, icone, titulo, sub }: { href: string; download?: string; externo?: boolean; icone: IconName; titulo: ReactNode; sub: ReactNode }) {
  return (
    <a
      href={href}
      download={download}
      target={externo ? '_blank' : undefined}
      rel={externo ? 'noopener noreferrer' : undefined}
      className={cn(
        'group flex min-h-[56px] items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 transition-colors',
        'hover:border-brand/40 hover:bg-brand/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      )}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
        <Icon name={icone} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-tight text-fg">{titulo}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">{sub}</span>
      </span>
      <Icon name={externo ? 'externo' : 'download'} size={16} className="shrink-0 text-fg-subtle transition-colors group-hover:text-fg-muted" />
    </a>
  );
}
