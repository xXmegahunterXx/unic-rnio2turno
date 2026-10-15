/**
 * Seção "Interessados" do painel (pensada para o celular): pedidos do formulário "Quero anunciar" da página /anuncie
 * (src/server/leads.ts) — lista com responder por e-mail/WhatsApp, marcar como respondido, apagar e CSV (com proteção
 * contra fórmula). O selo com o número de NOVOS (não respondidos) aparece no menu do painel (`useInteressadosNovos`).
 *
 * Os dados servem só para responder ao contato (consentimento do formulário): nada de lista de e-mail, nada de repasse.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULO_FORMATO } from '@/shared/anuncios';
import { TEXTOS_CONSENTIMENTO, type ComandoLead, type Lead, type LeadsAdmin } from '@/shared/leads';
import { fmtDataHora, fmtInt } from '@/shared/format';
import { copiarTexto } from '@/app/lib/share';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Icon, Segmented, buttonClasses, toast } from '@/app/ui';
import { IconeQualquer } from '@/app/components/layout/IconesExtras';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout } from './kit';
import { urlPublica } from './rotulos';
import { baixarArquivo } from './anunciosAdmin';
import { csvLeads, fmtTelefone, linkEmailLead, linkWhatsLead } from './crescimentoAdmin';

const CHAVE = ['admin', 'leads'] as const;

async function pedir(corpo?: ComandoLead): Promise<LeadsAdmin> {
  const r = await fetch('/api/admin/leads', {
    method: corpo ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: corpo ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as LeadsAdmin & { erro?: string };
  if (!r.ok) throw Object.assign(new Error(j.erro ?? `Erro ${r.status}`), { status: r.status });
  return j;
}

function useLeads(intervalo = 60_000) {
  return useQuery({ queryKey: CHAVE, queryFn: () => pedir(), enabled: !__DEMO__, refetchInterval: intervalo, refetchIntervalInBackground: false, retry: 1 });
}

/** Pedidos ainda não respondidos (selo do menu do painel). 0 no demo. */
export function useInteressadosNovos(): number {
  return useLeads().data?.novos ?? 0;
}

type Filtro = 'novos' | 'todos' | 'respondidos';

export function SecaoInteressados() {
  if (__DEMO__) {
    return (
      <div>
        <Cabecalho />
        <Callout tom="neutro" titulo="Só no servidor">
          Os pedidos do formulário “Quero anunciar” ficam no servidor do Sintonia. Nesta prévia estática não há servidor: o formulário aparece em /anuncie,
          mas não envia.
        </Callout>
      </div>
    );
  }
  return <SecaoInteressadosServidor />;
}

function Cabecalho({ acoes }: { acoes?: React.ReactNode }) {
  return (
    <CabecalhoSecao
      titulo="Interessados"
      icone="lista"
      descricao="Pedidos do formulário “Quero anunciar” da página /anuncie. Os dados servem só para responder ao contato."
      acoes={acoes}
    />
  );
}

function SecaoInteressadosServidor() {
  const { confirmar } = useAdmin();
  const qc = useQueryClient();
  const q = useLeads(20_000);
  const [filtro, setFiltro] = useState<Filtro>('novos');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const d = q.data;

  async function cmd(c: ComandoLead, sucesso: string) {
    setOcupado(`${c.acao}:${c.id}`);
    try {
      qc.setQueryData(CHAVE, await pedir(c));
      toast(sucesso, { tone: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível aplicar.', { tone: 'alert' });
    } finally {
      setOcupado(null);
    }
  }

  async function apagar(l: Lead) {
    const ok = await confirmar({
      titulo: 'Apagar este pedido?',
      descricao: `O pedido de ${l.nome} (${l.empresa}) sai do servidor. Não dá para desfazer.`,
      confirmar: 'Apagar',
      perigo: true,
    });
    if (ok) await cmd({ acao: 'apagar', id: l.id }, 'Pedido apagado');
  }

  if (!d) {
    return (
      <div>
        <Cabecalho />
        {q.isError ? (
          <Callout tom="alerta" titulo="Não foi possível carregar os pedidos">
            {q.error instanceof Error ? q.error.message : 'Tente de novo em instantes.'}
          </Callout>
        ) : (
          <p className="text-[14px] text-fg-muted">Carregando…</p>
        )}
      </div>
    );
  }

  const respondidos = d.leads.length - d.novos;
  const lista = d.leads.filter((l) => (filtro === 'todos' ? true : filtro === 'novos' ? !l.respondido : l.respondido));
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  return (
    <div>
      <Cabecalho
        acoes={
          <Button size="sm" variant="outline" icon="download" disabled={!d.leads.length} onClick={() => baixarArquivo(`sintonia-interessados-${carimbo}.csv`, csvLeads(d.leads))}>
            Exportar CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filtro>
          ariaLabel="Mostrar pedidos"
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'novos', label: <Contagem rotulo="Novos" n={d.novos} /> },
            { value: 'todos', label: <Contagem rotulo="Todos" n={d.leads.length} /> },
            { value: 'respondidos', label: <Contagem rotulo="Respondidos" n={respondidos} /> },
          ]}
        />
        <a href={urlPublica('/anuncie#contato')} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-fg hover:underline">
          Ver o formulário <Icon name="externo" size={13} />
        </a>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-brand-fg">
            <Icon name="lista" size={26} />
          </span>
          <h2 className="mt-4 font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">
            {d.leads.length === 0 ? 'Nenhum pedido ainda' : filtro === 'novos' ? 'Nenhum pedido sem resposta' : 'Nada por aqui'}
          </h2>
          <p className="mt-1.5 max-w-sm text-pretty text-[13.5px] leading-relaxed text-fg-muted">
            Quem preenche “Quero anunciar” na página /anuncie aparece aqui, com nome, empresa, e-mail e o que quer divulgar.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 lg:gap-4 xl:grid-cols-2">
          {lista.map((l) => (
            <CartaoLead
              key={l.id}
              l={l}
              ocupado={ocupado}
              onResponder={(v) => void cmd({ acao: 'respondido', id: l.id, valor: v }, v ? 'Marcado como respondido' : 'Voltou para os novos')}
              onApagar={() => void apagar(l)}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-[12.5px] leading-snug text-fg-subtle">
        Guardamos no máximo <span className="num">{fmtInt(d.max)}</span> pedidos, sem IP. Respondidos saem sozinhos depois de 180 dias e os sem
        resposta depois de 1 ano; apague antes quando não precisar mais.
      </p>
    </div>
  );
}

function Contagem({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {rotulo}
      <span className="num text-[11.5px] text-fg-subtle">{fmtInt(n)}</span>
    </span>
  );
}

function CartaoLead({ l, ocupado, onResponder, onApagar }: { l: Lead; ocupado: string | null; onResponder: (v: boolean) => void; onApagar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const zap = linkWhatsLead(l);
  const longa = l.mensagem.length > 220 || l.mensagem.split('\n').length > 4;
  async function copiar() {
    const ok = await copiarTexto(l.email);
    toast(ok ? 'E-mail copiado' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert' });
  }
  return (
    <li className={cn('min-w-0 rounded-2xl border bg-surface p-4 shadow-card sm:p-5', l.respondido ? 'border-line' : 'border-brand/35')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15.5px] font-semibold text-fg">{l.empresa}</p>
          <p className="truncate text-[13.5px] text-fg-muted">{l.nome}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {l.respondido ? (
            <Badge size="xs" tone="neutral">
              respondido
            </Badge>
          ) : (
            <Badge size="xs" tone="brand">
              novo
            </Badge>
          )}
          {l.quarentena ? (
            <Badge size="xs" tone="alert">
              quarentena
            </Badge>
          ) : null}
          <span className="num text-[11.5px] text-fg-subtle">{fmtDataHora(l.em)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-[13.5px]">
        <p className="flex min-w-0 items-center gap-2">
          <IconeQualquer name="carta" size={15} className="shrink-0 text-fg-subtle" />
          <span className="min-w-0 truncate text-fg">{l.email}</span>
          <button type="button" onClick={() => void copiar()} aria-label="Copiar e-mail" className="toque -my-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg">
            <Icon name="copiar" size={14} />
          </button>
        </p>
        {l.whatsapp ? (
          <p className="flex items-center gap-2">
            <Icon name="whatsapp" size={15} className="shrink-0 text-fg-subtle" />
            <span className="num text-fg">{fmtTelefone(l.whatsapp)}</span>
          </p>
        ) : null}
      </div>

      {l.formatos.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Formatos de interesse">
          {l.formatos.map((f) => (
            <li key={f}>
              <Badge size="xs" tone="neutral">
                {ROTULO_FORMATO[f]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {l.mensagem ? (
        <div className="mt-3 rounded-xl bg-surface-2/70 px-3 py-2.5">
          <p className={cn('whitespace-pre-line break-words text-[13.5px] leading-relaxed text-fg-muted', !aberto && longa && 'line-clamp-4')}>{l.mensagem}</p>
          {longa ? (
            <button type="button" onClick={() => setAberto((x) => !x)} className="mt-1 text-[12.5px] font-medium text-brand-fg hover:underline">
              {aberto ? 'Mostrar menos' : 'Ler tudo'}
            </button>
          ) : null}
        </div>
      ) : null}

      {l.quarentena ? (
        <p className="mt-3 text-[12.5px] leading-snug text-alert-fg">Chegou durante uma enxurrada de pedidos (mais de 120 na hora): confira antes de responder.</p>
      ) : null}
      <p className="mt-3 text-[11.5px] leading-snug text-fg-subtle">
        {l.consentimento ? (
          <>
            Consentimento marcado em <span className="num">{fmtDataHora(l.consentimento.em)}</span> (texto {l.consentimento.versao}: “{TEXTOS_CONSENTIMENTO[l.consentimento.versao] ?? '—'}”).
          </>
        ) : (
          'Consentimento marcado no formulário (pedido anterior ao registro da versão do texto).'
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={linkEmailLead(l)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          <Icon name="seta" size={15} />
          Responder por e-mail
        </a>
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
            <Icon name="whatsapp" size={15} />
            WhatsApp
          </a>
        ) : null}
        <Button size="sm" variant="ghost" icon={l.respondido ? 'reset' : 'check'} loading={ocupado === `respondido:${l.id}`} onClick={() => onResponder(!l.respondido)}>
          {l.respondido ? 'Desfazer' : 'Marcar respondido'}
        </Button>
        <Button size="sm" variant="ghost" icon="fechar" loading={ocupado === `apagar:${l.id}`} onClick={onApagar} className="ml-auto text-alert-fg">
          Apagar
        </Button>
      </div>
    </li>
  );
}
