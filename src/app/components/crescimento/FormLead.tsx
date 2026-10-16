/**
 * Formulário "Quero anunciar" (página /anuncie → `POST /api/anuncie/lead`; contrato em src/shared/leads.ts).
 *
 * Dados mínimos, com consentimento explícito ("uso só para responder ao seu contato"); o painel recebe em
 * "Interessados". Contra robôs: campo-isca escondido (`site`) e tempo de preenchimento (o envio espera, se preciso, até
 * o mínimo — uma pessoa rápida nunca perde o pedido). No build demo não há servidor: o formulário aparece, sem enviar.
 *
 * Em PRODUÇÃO, enquanto não houver e-mail de privacidade configurado no painel (Comunicação → Contatos públicos;
 * `LiveStatus.contatos.privacidade`), o formulário não abre: a pessoa precisa de um canal que funcione para corrigir/apagar
 * os dados e retirar o consentimento (LGPD, art. 8º, § 5º, e art. 18). O servidor aplica a mesma regra (503). Abre sozinho
 * quando o e-mail é salvo no painel — sem novo build.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FORMATOS_ANUNCIO, type FormatoAnuncio } from '@/shared/anuncios';
import { LIMITES_LEAD, TEXTO_CONSENTIMENTO, validaLead, type CampoLead, type RespostaLead } from '@/shared/leads';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { useContatos } from '@/app/data/contatos';

/** Rótulos curtos dos formatos (chips). */
const CURTO: Record<FormatoAnuncio, string> = {
  topo: 'Faixa no topo',
  rodape: 'Barra do celular',
  nativo: 'Cartão no conteúdo',
  teste: 'Teste Cego',
  tv: 'Modo TV',
  compartilhamento: 'Imagens compartilhadas',
  chat: 'Chat ao vivo',
  live: 'Lives (OBS)',
};

const CAMPO =
  'block h-12 w-full rounded-xl border bg-surface-2 px-3.5 text-[16px] text-fg placeholder:text-fg-subtle transition-colors focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30 sm:text-[15px]';

interface Valores {
  nome: string;
  empresa: string;
  email: string;
  whatsapp: string;
  mensagem: string;
  formatos: FormatoAnuncio[];
  consentimento: boolean;
  site: string;
}

const VAZIO: Valores = { nome: '', empresa: '', email: '', whatsapp: '', mensagem: '', formatos: [], consentimento: false, site: '' };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Produção sem e-mail de privacidade no painel: sem formulário (ver o cabeçalho). Em dev e no demo, aparece. */
const EXIGE_CANAL_PRIVACIDADE = import.meta.env.PROD && !__DEMO__;

export function FormLead({ className, temOutroCanal }: { className?: string; temOutroCanal?: boolean }) {
  const contatos = useContatos();
  // enquanto o status não chega, nada (evita piscar "abre em breve" para quem vai ver o formulário)
  if (EXIGE_CANAL_PRIVACIDADE && !contatos.carregado) return <div className={cn('min-h-[420px]', className)} aria-busy="true" />;
  if (EXIGE_CANAL_PRIVACIDADE && !contatos.privacidade) {
    return (
      <div role="note" className={cn('flex flex-col items-start gap-3 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8', className)}>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-3 text-fg-muted">
          <Icon name="relogio" size={22} />
        </span>
        <h3 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-fg">O formulário abre em breve</h3>
        <p className="max-w-[36rem] text-pretty text-[15px] leading-relaxed text-fg-muted">
          {temOutroCanal
            ? 'Ele abre assim que o canal de privacidade do Sintonia estiver no ar. Enquanto isso, fale com a gente pelos contatos ao lado.'
            : 'Ele abre assim que o canal de privacidade do Sintonia estiver no ar.'}
        </p>
      </div>
    );
  }
  return <FormLeadAberto className={className} />;
}

function FormLeadAberto({ className }: { className?: string }) {
  const id = useId();
  const [v, setV] = useState<Valores>(VAZIO);
  const [erro, setErro] = useState<{ texto: string; campo?: CampoLead } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ email: string } | null>(null);
  const montadoEm = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const sucesso = useRef<HTMLDivElement>(null);
  useEffect(() => {
    montadoEm.current = Date.now();
  }, []);
  useEffect(() => {
    if (enviado) sucesso.current?.focus();
  }, [enviado]);

  const muda = <K extends keyof Valores>(k: K, x: Valores[K]) => {
    setV((a) => ({ ...a, [k]: x }));
    if (erro?.campo === k) setErro(null);
  };

  const focar = (campo?: CampoLead) => {
    if (!campo) return;
    const el = form.current?.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
    el?.focus();
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const corpo = { ...v, whatsapp: v.whatsapp || undefined };
    const val = validaLead(corpo);
    if ('erro' in val) {
      setErro({ texto: val.erro, campo: val.campo });
      focar(val.campo);
      return;
    }
    if (__DEMO__) {
      setErro({ texto: 'Nesta prévia o formulário não envia: no site publicado, o pedido chega ao painel do Sintonia.' });
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      // tempo mínimo de preenchimento (o servidor descarta envios rápidos demais, típicos de robô): espera o que faltar
      const decorrido = Date.now() - montadoEm.current;
      if (decorrido < LIMITES_LEAD.tempoMinMs + 200) await espera(LIMITES_LEAD.tempoMinMs + 200 - decorrido);
      const r = await fetch('/api/anuncie/lead', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ...corpo, ms: Date.now() - montadoEm.current }),
      });
      const j = (await r.json().catch(() => null)) as RespostaLead | null;
      if (r.ok && j?.ok) {
        setEnviado({ email: val.ok.email });
        setV(VAZIO);
        return;
      }
      const msg = j && !j.ok ? j.erro : 'Não foi possível enviar agora. Tente de novo em instantes.';
      const campo = j && !j.ok ? j.campo : undefined;
      setErro({ texto: msg, campo });
      focar(campo);
    } catch {
      setErro({ texto: 'Sem conexão. Confira a internet e tente de novo.' });
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div
        ref={sucesso}
        tabIndex={-1}
        role="status"
        className={cn('flex flex-col items-start gap-3 rounded-3xl border border-ok/35 bg-ok/[0.08] p-6 outline-none sm:p-8', className)}
      >
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-ok/15 text-ok-fg">
          <Icon name="check-circulo" size={22} />
        </span>
        <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg">Recebemos o seu contato</h3>
        <p className="max-w-[36rem] text-pretty text-[15px] leading-relaxed text-fg-muted">
          Vamos responder pelo e-mail <strong className="break-all font-semibold text-fg">{enviado.email}</strong>. Os seus dados servem só para isso.
        </p>
        <Button variant="ghost" size="sm" icon="reset" onClick={() => setEnviado(null)}>
          Enviar outro pedido
        </Button>
      </div>
    );
  }

  const invalido = (c: CampoLead) => erro?.campo === c;
  const idErro = `${id}-erro`;
  const descr = (c: CampoLead) => (invalido(c) ? idErro : undefined);

  return (
    <form ref={form} noValidate onSubmit={enviar} className={cn('relative space-y-4', className)} aria-describedby={erro ? idErro : undefined}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Rotulo rotulo="Seu nome" htmlFor={`${id}-nome`} obrigatorio>
          <input
            id={`${id}-nome`}
            data-campo="nome"
            className={cn(CAMPO, invalido('nome') ? 'border-alert/60' : 'border-line')}
            value={v.nome}
            onChange={(e) => muda('nome', e.target.value)}
            autoComplete="name"
            maxLength={LIMITES_LEAD.nome + 20}
            aria-invalid={invalido('nome') || undefined}
            aria-describedby={descr('nome')}
            required
          />
        </Rotulo>
        <Rotulo rotulo="Empresa ou marca" htmlFor={`${id}-empresa`} obrigatorio>
          <input
            id={`${id}-empresa`}
            data-campo="empresa"
            className={cn(CAMPO, invalido('empresa') ? 'border-alert/60' : 'border-line')}
            value={v.empresa}
            onChange={(e) => muda('empresa', e.target.value)}
            autoComplete="organization"
            maxLength={LIMITES_LEAD.empresa + 20}
            aria-invalid={invalido('empresa') || undefined}
            aria-describedby={descr('empresa')}
            required
          />
        </Rotulo>
        <Rotulo rotulo="E-mail de trabalho" htmlFor={`${id}-email`} obrigatorio>
          <input
            id={`${id}-email`}
            data-campo="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className={cn(CAMPO, invalido('email') ? 'border-alert/60' : 'border-line')}
            value={v.email}
            onChange={(e) => muda('email', e.target.value)}
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            maxLength={LIMITES_LEAD.email + 20}
            aria-invalid={invalido('email') || undefined}
            aria-describedby={descr('email')}
            required
          />
        </Rotulo>
        <Rotulo rotulo="WhatsApp" htmlFor={`${id}-whatsapp`} dica="opcional">
          <input
            id={`${id}-whatsapp`}
            data-campo="whatsapp"
            type="tel"
            inputMode="tel"
            className={cn(CAMPO, 'num', invalido('whatsapp') ? 'border-alert/60' : 'border-line')}
            value={v.whatsapp}
            onChange={(e) => muda('whatsapp', e.target.value)}
            autoComplete="tel"
            placeholder="(11) 99999-0000"
            maxLength={24}
            aria-invalid={invalido('whatsapp') || undefined}
            aria-describedby={descr('whatsapp')}
          />
        </Rotulo>
      </div>

      <fieldset>
        <legend className="text-[14px] font-medium text-fg">
          Formatos de interesse <span className="font-normal text-fg-subtle">· opcional</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2" data-campo="formatos" tabIndex={-1}>
          {FORMATOS_ANUNCIO.map((f) => {
            const on = v.formatos.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => muda('formatos', on ? v.formatos.filter((x) => x !== f) : FORMATOS_ANUNCIO.filter((x) => x === f || v.formatos.includes(x)))}
                className={cn(
                  'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  on ? 'border-brand/50 bg-brand/15 text-fg' : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                {on ? <Icon name="check" size={15} className="text-brand-fg" /> : null}
                {CURTO[f]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Rotulo
        rotulo="Mensagem"
        htmlFor={`${id}-mensagem`}
        dica="opcional"
        contador={
          <span className={cn('num', v.mensagem.length > LIMITES_LEAD.mensagem && 'text-alert-fg')}>
            {fmtInt(v.mensagem.length)}/{fmtInt(LIMITES_LEAD.mensagem)}
          </span>
        }
      >
        <textarea
          id={`${id}-mensagem`}
          data-campo="mensagem"
          rows={4}
          className={cn(CAMPO, 'h-auto min-h-[112px] resize-y py-3 leading-relaxed', invalido('mensagem') ? 'border-alert/60' : 'border-line')}
          value={v.mensagem}
          onChange={(e) => muda('mensagem', e.target.value)}
          placeholder="O que você quer divulgar, período e orçamento aproximado."
          maxLength={LIMITES_LEAD.mensagem + 50}
          aria-invalid={invalido('mensagem') || undefined}
          aria-describedby={descr('mensagem')}
        />
      </Rotulo>

      {/* campo-isca: invisível para pessoas (e para leitores de tela); robôs costumam preencher */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-site`}>Site (deixe em branco)</label>
        <input id={`${id}-site`} name="site" tabIndex={-1} autoComplete="off" value={v.site} onChange={(e) => muda('site', e.target.value)} />
      </div>

      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-[14px] leading-snug text-fg-muted transition-colors',
          invalido('consentimento') ? 'border-alert/50 bg-alert/[0.06]' : 'border-line bg-surface-2/60',
        )}
      >
        <input
          type="checkbox"
          data-campo="consentimento"
          checked={v.consentimento}
          onChange={(e) => muda('consentimento', e.target.checked)}
          aria-invalid={invalido('consentimento') || undefined}
          aria-describedby={descr('consentimento')}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span>
          <span className="text-fg">{TEXTO_CONSENTIMENTO}</span>{' '}
          <Link to="/privacidade#anunciar" className="font-medium text-fg underline decoration-line underline-offset-[3px] hover:decoration-brand-fg">
            Privacidade
          </Link>
        </span>
      </label>

      {erro ? (
        <p id={idErro} role="alert" className="flex items-start gap-2 text-[14px] font-medium leading-snug text-alert-fg">
          <Icon name="alerta" size={17} className="mt-px shrink-0" />
          <span>{erro.texto}</span>
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-snug text-fg-subtle">Só anunciantes não políticos.</p>
        <Button type="submit" variant="primary" size="lg" iconRight="seta" loading={enviando} className="w-full sm:w-auto">
          Enviar pedido
        </Button>
      </div>
    </form>
  );
}

function Rotulo({
  rotulo,
  htmlFor,
  obrigatorio,
  dica,
  contador,
  children,
}: {
  rotulo: string;
  htmlFor: string;
  obrigatorio?: boolean;
  dica?: string;
  contador?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[14px] font-medium text-fg">
          {rotulo}
          {obrigatorio ? <span className="sr-only"> (obrigatório)</span> : null}
          {dica ? <span className="font-normal text-fg-subtle"> · {dica}</span> : null}
        </label>
        {contador ? <span className="text-[12px] text-fg-subtle">{contador}</span> : null}
      </div>
      {children}
    </div>
  );
}
