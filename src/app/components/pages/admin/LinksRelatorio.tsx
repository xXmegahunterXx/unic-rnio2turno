/**
 * Relatório do anunciante por link privado (anunciantes v2, E17): a folha do cartão do anúncio com os links que abrem a
 * página `/relatorio` (números agregados de entrega daquela marca, ao vivo).
 *
 *  - lista: rótulo, criado em, acessos, último acesso (hora cheia) e [Revogar] (o link dá 404 na hora);
 *  - [Gerar link], com rótulo opcional e "Mostrar meta contratada"; o link aparece UMA vez (o servidor guarda só o hash
 *    do token), com [Copiar] e [Enviar no WhatsApp].
 * Rotas: GET/POST /api/admin/relatorios (src/server/relatorios.ts). No demo (sem servidor) o recurso fica escondido;
 * com `RELATORIOS=0` no servidor, a folha diz que está desligado.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnuncioConfig } from '@/shared/anuncios';
import { LINKS_POR_ANUNCIO, type LinkRelatorio } from '@/shared/relatorio';
import { fmtDataHora, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Icon, Sheet, Toggle, toast } from '@/app/ui';
import { Callout, Campo } from './kit';
import { mensagemErro } from './rotulos';

type ComandoRelatorio = { acao: 'criar'; id: string; rotulo?: string; mostrarMeta?: boolean } | { acao: 'revogar'; lid: string };
interface RespostaLinks {
  links: LinkRelatorio[];
  ligado: boolean;
}

const CHAVE = ['admin', 'relatorios'] as const;

async function pedir<T>(corpo?: ComandoRelatorio): Promise<T> {
  const r = await fetch('/api/admin/relatorios', {
    method: corpo ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: corpo ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw Object.assign(new Error(j.erro ?? `Erro ${r.status}`), { status: r.status });
  return j;
}

/** Links de relatório (todos os anúncios). Desligado no demo. */
export function useLinksRelatorio(ativo = true) {
  return useQuery({ queryKey: CHAVE, queryFn: () => pedir<RespostaLinks>(), enabled: ativo && !__DEMO__, staleTime: 15_000, retry: 1 });
}

/** Mensagem pronta para o anunciante. */
export const textoWhatsApp = (url: string) => `Olá! Acompanhe ao vivo a entrega da sua campanha no Sintonia: ${url}`;
export const linkWhatsAppRelatorio = (url: string) => `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(url))}`;

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function LinksRelatorio({ anuncio, open, onClose }: { anuncio: AnuncioConfig; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useLinksRelatorio(open);
  const [rotulo, setRotulo] = useState('');
  const [mostrarMeta, setMostrarMeta] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [revogando, setRevogando] = useState<string | null>(null);
  /** o link recém-gerado: aparece uma vez só (o servidor não guarda o token) */
  const [novo, setNovo] = useState<{ url: string; rotulo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const meus = (q.data?.links ?? []).filter((l) => l.id === anuncio.id).sort((a, b) => b.criadoEm - a.criadoEm);
  const ativos = meus.filter((l) => !l.revogadoEm);
  const lotado = ativos.length >= LINKS_POR_ANUNCIO;

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const r = await pedir<{ link: LinkRelatorio; url: string }>({
        acao: 'criar',
        id: anuncio.id,
        ...(rotulo.trim() ? { rotulo: rotulo.trim() } : {}),
        mostrarMeta,
      });
      setNovo({ url: r.url, rotulo: r.link.rotulo });
      setRotulo('');
      await qc.invalidateQueries({ queryKey: CHAVE });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function revogar(l: LinkRelatorio) {
    setRevogando(l.lid);
    try {
      await pedir({ acao: 'revogar', lid: l.lid });
      toast('Link revogado: ele deixa de abrir na hora.', { tone: 'ok' });
      await qc.invalidateQueries({ queryKey: CHAVE });
    } catch (e) {
      toast(mensagemErro(e), { tone: 'alert', duracao: 5000 });
    } finally {
      setRevogando(null);
    }
  }

  const fechar = () => {
    setNovo(null);
    setErro(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={fechar}
      title={`Relatório de ${anuncio.marca}`}
      description="Link privado com a entrega ao vivo desta marca: impressões visíveis, pessoas alcançadas (estimativa), cliques e a meta, se você escolher mostrar."
      width="md"
    >
      <div className="space-y-4" data-links-relatorio>
        {q.data && !q.data.ligado ? (
          <Callout tom="neutro" titulo="Relatórios desligados no servidor">
            O servidor está com <span className="font-mono">RELATORIOS=0</span>: a página /relatorio não abre e não é possível gerar links.
          </Callout>
        ) : (
          <>
            {novo ? (
              <div className="rounded-2xl border border-ok/40 bg-ok/[0.07] p-3.5" data-link-novo>
                <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
                  <Icon name="check-circulo" size={16} className="text-ok-fg" /> Link gerado{novo.rotulo ? ` (${novo.rotulo})` : ''}
                </p>
                <p className="mt-1 text-[12.5px] text-fg-muted">Ele aparece só agora: copie ou envie antes de fechar. Se perder, gere outro e revogue este.</p>
                <p className="mt-2.5 break-all rounded-xl border border-line bg-surface px-3 py-2 font-mono text-[12px] leading-relaxed text-fg">{novo.url}</p>
                <div className="mt-2.5 grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
                  <Button
                    variant="secondary"
                    icon="copiar"
                    onClick={async () => {
                      const ok = await copiar(novo.url);
                      toast(ok ? 'Link copiado' : 'Não foi possível copiar: selecione o link e copie.', { tone: ok ? 'ok' : 'alert' });
                    }}
                  >
                    Copiar
                  </Button>
                  <a
                    href={linkWhatsAppRelatorio(novo.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-surface-3 px-3 text-[14px] font-semibold text-fg transition-colors hover:bg-surface-2"
                  >
                    <Icon name="whatsapp" size={16} /> Enviar no WhatsApp
                  </a>
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-2xl border border-line bg-surface-2/50 p-3.5">
              <Campo rotulo="Rótulo (opcional)" value={rotulo} maxLength={60} placeholder="Ex.: Equipe de marketing" onChange={(e) => setRotulo(e.target.value)} dica="Só para você saber para quem enviou." />
              <Toggle checked={mostrarMeta} onChange={setMostrarMeta} label="Mostrar meta contratada" description={anuncio.limiteImpressoes ? 'A página mostra o contratado e o entregue.' : 'Este anúncio não tem meta de impressões.'} />
              {erro ? <p className="text-[12.5px] font-medium text-alert-fg">{erro}</p> : null}
              <Button variant="primary" icon="link" block loading={gerando} disabled={lotado || !q.data} onClick={() => void gerar()}>
                Gerar link
              </Button>
              {lotado ? (
                <p className="text-[12px] text-fg-muted">
                  Já há <span className="num">{fmtInt(LINKS_POR_ANUNCIO)}</span> links ativos: revogue um antes de gerar outro.
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Links deste anúncio</p>
              {q.error ? (
                <Callout tom="alerta">{mensagemErro(q.error)}</Callout>
              ) : !q.data ? (
                <p className="text-[13px] text-fg-muted">Carregando…</p>
              ) : meus.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-fg-subtle">Nenhum link gerado ainda.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {meus.map((l) => (
                    <li key={l.lid} className={cn('flex items-start gap-3 px-3 py-2.5', l.revogadoEm && 'opacity-60')}>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
                          <span className="truncate">{l.rotulo || 'Sem rótulo'}</span>
                          {l.revogadoEm ? (
                            <Badge tone="neutral" size="sm">
                              Revogado
                            </Badge>
                          ) : l.mostrarMeta ? (
                            <Badge tone="brand" size="sm">
                              com meta
                            </Badge>
                          ) : null}
                        </p>
                        <p className="num mt-0.5 text-[11.5px] leading-snug text-fg-subtle">
                          criado {fmtDataHora(l.criadoEm)} · {fmtInt(l.acessos)} {l.acessos === 1 ? 'acesso' : 'acessos'}
                          {l.ultimoAcessoHora ? ` · último ${fmtDataHora(l.ultimoAcessoHora)}` : ''}
                        </p>
                      </div>
                      {!l.revogadoEm ? (
                        <Button variant="ghost" size="sm" icon="fechar" className="shrink-0 text-alert-fg hover:text-alert-fg" loading={revogando === l.lid} onClick={() => void revogar(l)}>
                          Revogar
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[12px] leading-snug text-fg-subtle">
              A página não usa cookie nem mostra dado de visitante: só números agregados desta marca. Imagens de compartilhamento não são medidas.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
