/**
 * Seção "Lives" do painel (I23, leva 3; pensada para o celular): quantas lives exibem o Sintonia agora (a /live aberta
 * como fonte de navegador do OBS), o pico, os minutos no ar por layout e por anúncio (o que vende o formato 'live':
 * "sua marca em N lives") e quantos canais usam o `!apuracao` dos bots de chat — SÓ contagens: nenhum canal, pessoa ou
 * endereço chega aqui (src/server/lives.ts). Fala com `/api/admin/lives`; no build demo não há servidor e a seção
 * explica. A chave 'contar-lives' fica no Controle (Chaves da noite).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnuncioConfig } from '@/shared/anuncios';
import { LIVES, LAYOUTS_CONTADOS, ROTULO_LAYOUT_CONTADO, type HoraLives, type LivesResumo } from '@/shared/lives';
import { csvCampo } from '@/shared/relatorio';
import { fmtDataHora, fmtHora, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button, toast } from '@/app/ui';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Painel, Rotulo } from './kit';
import { baixarArquivo } from './anunciosAdmin';

const CHAVE = ['admin', 'lives'] as const;

class ErroAdmin extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

async function pedir<T>(rota: string, corpo?: unknown): Promise<T> {
  const r = await fetch(rota, {
    method: corpo === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: corpo === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new ErroAdmin(r.status, j.erro ?? `Erro ${r.status}`);
  return j;
}

// ---- puros (testados em lives-admin.test.ts) ---------------------------------------------------------------

/** epoch ms → "2026-10-25 17:00" (Brasília, UTC−3 fixo). */
const horaBrasilia = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

const csv = (linhas: (string | number)[][]) => `﻿${linhas.map((l) => l.map(csvCampo).join(';')).join('\r\n')}\r\n`;

/** CSV por hora (separador ";", BOM UTF-8): início da hora em Brasília, maior número de lives ao mesmo tempo e minutos. */
export function csvLivesHoras(horas: readonly HoraLives[]): string {
  return csv([['hora_inicio_brasilia', 'lives_ao_mesmo_tempo_max', 'minutos_no_ar'], ...[...horas].sort((a, b) => a.h - b.h).map((h) => [horaBrasilia(h.h), h.max, h.minutos])]);
}

/** CSV resumo: totais, por layout e por anúncio (com a marca), para o relatório do formato 'live'. */
export function csvLivesResumo(r: LivesResumo, anuncios: readonly Pick<AnuncioConfig, 'id' | 'marca'>[]): string {
  const linhas: (string | number)[][] = [['tipo', 'chave', 'nome', 'minutos_no_ar', 'lives_agora']];
  linhas.push(['total', 'todas', 'Todas as lives', r.minutos.total, r.agora]);
  for (const l of LAYOUTS_CONTADOS) linhas.push(['layout', l, ROTULO_LAYOUT_CONTADO[l], r.minutos.porLayout[l] ?? 0, r.porLayout[l] ?? 0]);
  for (const [id, min] of porAnuncio(r, anuncios)) linhas.push(['anuncio', id, min.marca, min.minutos, min.agora]);
  if (r.pico) linhas.push(['pico', horaBrasilia(r.pico.em), 'Maior número de lives ao mesmo tempo', '', r.pico.n]);
  linhas.push(['canais_bot', 'todos', 'Canais distintos com o !apuracao', '', r.canaisBot]);
  return csv(linhas);
}

/** Anúncios com minutos ou na tela agora, do que tem mais minutos para o que tem menos; marca do cadastro (ou o id). */
export function porAnuncio(r: Pick<LivesResumo, 'minutos' | 'agoraPorAnuncio'>, anuncios: readonly Pick<AnuncioConfig, 'id' | 'marca'>[]) {
  const ids = new Set([...Object.keys(r.minutos.porAnuncio), ...Object.keys(r.agoraPorAnuncio ?? {})]);
  return [...ids]
    .map((id) => [id, { marca: anuncios.find((a) => a.id === id)?.marca ?? id, minutos: r.minutos.porAnuncio[id] ?? 0, agora: r.agoraPorAnuncio?.[id] ?? 0 }] as const)
    .sort((a, b) => b[1].minutos - a[1].minutos || b[1].agora - a[1].agora || a[0].localeCompare(b[0]));
}

/** "12 min", "3 h 05 min", "1.234 h". */
export function fmtMinutos(min: number): string {
  if (min < 60) return `${fmtInt(min)} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 100) return `${fmtInt(h)} h`;
  return m ? `${fmtInt(h)} h ${String(m).padStart(2, '0')} min` : `${fmtInt(h)} h`;
}

// ---- seção -------------------------------------------------------------------------------------------------

export function SecaoLives() {
  if (__DEMO__) {
    return (
      <div>
        <Cabecalho />
        <Callout tom="neutro" titulo="Só no servidor">
          A contagem de lives é feita pelo servidor do Sintonia (cada /live aberta no OBS avisa que está no ar, sem identificar canal nem pessoa). Nesta
          prévia estática não há servidor nem contagem.
        </Callout>
      </div>
    );
  }
  return <SecaoLivesServidor />;
}

function Cabecalho({ acoes }: { acoes?: React.ReactNode }) {
  return (
    <CabecalhoSecao
      titulo="Lives"
      icone="play"
      descricao="Quantas lives exibem o Sintonia agora (a /live como fonte de navegador do OBS), minutos no ar e bots de chat. Só contagens: nenhum canal ou pessoa é identificado."
      acoes={acoes}
    />
  );
}

function SecaoLivesServidor() {
  const { confirmar, snap, irPara } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: CHAVE, queryFn: () => pedir<LivesResumo>('/api/admin/lives'), refetchInterval: 15_000, refetchIntervalInBackground: false });
  const d = q.data;
  const anuncios = snap.state.anuncios ?? [];

  async function zerar() {
    const ok = await confirmar({
      titulo: 'Zerar a contagem de lives?',
      descricao: 'Apaga os minutos, o pico, as horas e os canais de bot. Use depois do ensaio, antes de vender. As lives no ar continuam contando dali em diante.',
      confirmar: 'Zerar',
      perigo: true,
    });
    if (!ok) return;
    try {
      qc.setQueryData(CHAVE, await pedir<LivesResumo>('/api/admin/lives', { acao: 'zerar' }));
      toast('Contagem de lives zerada', { tone: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível zerar.', { tone: 'alert' });
    }
  }

  if (!d) {
    return (
      <div>
        <Cabecalho />
        {q.isError ? (
          <Callout tom="alerta" titulo="Não foi possível carregar a contagem">
            {q.error instanceof Error ? q.error.message : 'Tente de novo em instantes.'}
          </Callout>
        ) : (
          <p className="text-[14px] text-fg-muted">Carregando…</p>
        )}
      </div>
    );
  }

  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const ads = porAnuncio(d, anuncios);
  const publico = d.agora >= LIVES.pisoPublico;

  return (
    <div>
      <Cabecalho
        acoes={
          <>
            <Button size="sm" variant="outline" icon="download" onClick={() => baixarArquivo(`sintonia-lives-resumo-${carimbo}.csv`, csvLivesResumo(d, anuncios))}>
              CSV resumo
            </Button>
            <Button size="sm" variant="ghost" icon="download" onClick={() => baixarArquivo(`sintonia-lives-horas-${carimbo}.csv`, csvLivesHoras(d.horas ?? []))} disabled={!d.horas?.length}>
              Por hora
            </Button>
          </>
        }
      />

      {d.ligado === false ? (
        <Callout tom="alerta" titulo="Contagem desligada" className="mb-4 lg:mb-5">
          <span className="block">A chave “Contagem de lives” está desligada em Controle → Chaves da noite: nada é contado e a página /streamers não mostra o número.</span>
          <Button size="sm" variant="outline" icon="configuracoes" className="mt-2" onClick={() => irPara('controle')}>
            Abrir as Chaves da noite
          </Button>
        </Callout>
      ) : null}

      <ul className="mb-4 grid grid-cols-2 gap-3 lg:mb-5 lg:grid-cols-4 lg:gap-4">
        <Cartao
          rotulo="Lives agora"
          valor={fmtInt(d.agora)}
          sub={publico ? `a /streamers mostra “em ${fmtInt(d.agora)} lives”` : `a /streamers mostra a partir de ${fmtInt(LIVES.pisoPublico)}`}
          vivo
        />
        <Cartao rotulo="Pico ao mesmo tempo" valor={d.pico ? fmtInt(d.pico.n) : '—'} sub={d.pico ? `em ${fmtDataHora(d.pico.em)}` : 'nenhuma live ainda'} destaque />
        <Cartao rotulo="Minutos no ar" valor={fmtMinutos(d.minutos.total)} sub={d.desde ? `desde ${fmtDataHora(d.desde)}` : undefined} />
        <Cartao rotulo="Canais com o !apuracao" valor={fmtInt(d.canaisBot)} sub="bots de chat (Nightbot e afins)" />
      </ul>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:mb-5 lg:gap-5 xl:grid-cols-2">
        <Painel titulo="Por layout" icone="grade" subtitulo="Lives agora e minutos no ar de cada layout da /live.">
          <Tabela
            linhas={LAYOUTS_CONTADOS.map((l) => ({ chave: l, nome: ROTULO_LAYOUT_CONTADO[l], agora: d.porLayout[l] ?? 0, minutos: d.minutos.porLayout[l] ?? 0 }))}
            vazio="Nenhuma live ainda."
          />
        </Painel>
        <Painel titulo="Por anúncio (formato live)" icone="selo" subtitulo="Minutos de live com a marca na tela — o número do relatório do patrocinador das lives.">
          {ads.length ? (
            <Tabela linhas={ads.map(([id, a]) => ({ chave: id, nome: a.marca, agora: a.agora, minutos: a.minutos }))} vazio="" />
          ) : (
            <p className="text-[13.5px] text-fg-muted">Nenhum anúncio do formato live apareceu numa live ainda.</p>
          )}
        </Painel>
      </div>

      <Painel titulo="Últimas 48 horas" icone="relogio" subtitulo="Maior número de lives ao mesmo tempo em cada hora (Brasília). O CSV “Por hora” leva 14 dias." className="mb-4 lg:mb-5">
        <BarrasHoras horas={d.horas ?? []} />
      </Painel>

      <Painel titulo="Como contamos" icone="info">
        <ul className="space-y-2 text-[13.5px] leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">Live</strong> = uma /live aberta e visível numa fonte de navegador (OBS, Streamlabs) que avisou nos últimos{' '}
            <span className="num">{fmtInt(LIVES.ativaS)}</span> s. O aviso sai a cada <span className="num">{fmtInt(LIVES.batimentoS)}</span> s com um código
            aleatório daquela abertura da página: nada identifica o canal nem quem transmite. As prévias da /streamers não contam.
          </li>
          <li>
            <strong className="text-fg">Minutos no ar</strong>: cada aviso depois do primeiro soma 1 minuto (no layout e no anúncio que estavam na tela).
            Recarregar a página não duplica. No máximo <span className="num">{fmtInt(LIVES.maxFontesPorRede)}</span> lives por rede, para ninguém inflar o
            número.
          </li>
          <li>
            <strong className="text-fg">Não é audiência da live</strong>: quantas pessoas assistem cada transmissão só a plataforma (Twitch, YouTube, Kick)
            sabe. Aqui é quantas transmissões exibem o Sintonia.
          </li>
          <li>
            <strong className="text-fg">Canais com o !apuracao</strong>: quantos canais diferentes pediram o texto do placar pelo bot de chat. O nome do
            canal nunca é guardado (só um código com sal que muda a cada reinício); depois de um reinício, vale o maior número já visto, sem somar.
          </li>
          <li>Público: a página /streamers mostra “o Sintonia está em N lives agora” só a partir de {fmtInt(LIVES.pisoPublico)} — nunca a lista de canais.</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-[12.5px] text-fg-subtle">
            Contando desde <span className="num">{d.desde ? fmtDataHora(d.desde) : '—'}</span>.
          </p>
          <Button size="sm" variant="ghost" icon="reset" onClick={() => void zerar()} className="text-alert-fg">
            Zerar contagem
          </Button>
        </div>
      </Painel>
    </div>
  );
}

// ---- peças -------------------------------------------------------------------------------------------------

function Cartao({ rotulo, valor, sub, destaque, vivo }: { rotulo: string; valor: string; sub?: string; destaque?: boolean; vivo?: boolean }) {
  return (
    <li className={cn('min-w-0 rounded-2xl border bg-surface p-3.5 shadow-card sm:p-4', destaque ? 'border-brand/40' : 'border-line')}>
      <Rotulo className="flex items-center gap-1.5">
        {vivo ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" aria-hidden /> : null}
        {rotulo}
      </Rotulo>
      <span className="num mt-1.5 block truncate font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[30px]">{valor}</span>
      {sub ? <span className="num mt-1.5 block text-[11.5px] leading-snug text-fg-subtle">{sub}</span> : null}
    </li>
  );
}

function Tabela({ linhas, vazio }: { linhas: { chave: string; nome: string; agora: number; minutos: number }[]; vazio: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.minutos));
  if (!linhas.length) return <p className="text-[13.5px] text-fg-muted">{vazio}</p>;
  return (
    <div>
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        <span>Nome</span>
        <span className="text-right">Agora</span>
        <span className="w-[5.5rem] text-right">No ar</span>
      </div>
      <ul className="space-y-2.5">
        {linhas.map((l) => (
          <li key={l.chave} className="min-w-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 text-[13.5px]">
              <span className="min-w-0 truncate text-fg">{l.nome}</span>
              <span className="num text-right text-fg-muted">{fmtInt(l.agora)}</span>
              <span className="num w-[5.5rem] text-right text-fg-muted">{fmtMinutos(l.minutos)}</span>
            </div>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className="block h-full rounded-full bg-brand-2/75" style={{ width: `${(100 * l.minutos) / max}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** As últimas `n` horas cheias até `agora` (as sem live entram zeradas). Puro (testado). */
export function janelaHoras(horas: readonly HoraLives[], agora: number, n = 48): HoraLives[] {
  const HORA = 3_600_000;
  const fim = Math.floor(agora / HORA) * HORA;
  const mapa = new Map(horas.map((h) => [h.h, h]));
  const out: HoraLives[] = [];
  for (let t = fim - (n - 1) * HORA; t <= fim; t += HORA) out.push(mapa.get(t) ?? { h: t, max: 0, minutos: 0 });
  return out;
}

/** Lives ao mesmo tempo por hora, nas últimas 48 horas (as horas sem live aparecem como trilho). Só tokens. */
function BarrasHoras({ horas }: { horas: HoraLives[] }) {
  const todas = janelaHoras(horas, Date.now());
  if (!todas.some((h) => h.max > 0)) return <p className="text-[13.5px] text-fg-muted">Nenhuma live nas últimas 48 horas.</p>;
  const max = Math.max(1, ...todas.map((h) => h.max));
  return (
    <div role="img" aria-label={`Últimas horas: até ${fmtInt(max)} lives ao mesmo tempo; ${fmtInt(todas.reduce((s, h) => s + h.minutos, 0))} minutos no ar`}>
      <div className="flex h-24 items-end gap-[2px]" aria-hidden>
        {todas.map((h) => (
          <span key={h.h} className="flex h-full min-w-0 flex-1 items-end" title={`${fmtDataHora(h.h)} · até ${fmtInt(h.max)} lives · ${fmtMinutos(h.minutos)}`}>
            <span className={cn('block w-full rounded-[2px]', h.max > 0 ? 'bg-brand-2/80' : 'bg-surface-3')} style={{ height: h.max > 0 ? `${Math.max(8, (100 * h.max) / max)}%` : '2px' }} />
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span className="num">{fmtDataHora(todas[0].h)}</span>
        <span className="num">até {fmtInt(max)} ao mesmo tempo</span>
        <span className="num">{fmtHora(todas[todas.length - 1].h)}</span>
      </div>
    </div>
  );
}
