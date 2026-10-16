/**
 * Seção "Postar" do painel (I26 mínimo): texto, link e imagem prontos para cada momento da noite — convite, marcos de
 * audiência (10, 50 e 100 mil pessoas agora) e os momentos do feed nacional de Presidente (começo, marcos de % apurado,
 * liderança, virada e resultado). O dono toca em "Abrir no X", "WhatsApp", "Copiar" ou baixa a imagem do servidor
 * (16:9 para o X, 9:16 para Status e Stories). Nada é publicado sozinho e nada sai do painel além do que o dono abre.
 *
 * Regras (núcleo puro em postar.ts, testado): textos de share/textos.ts (≤ 220, neutros, "[SIMULAÇÃO]" quando simulado);
 * cartões com nome de candidato só a partir das 17h de 25/10 pelo relógio do servidor (antes, só na simulação com os
 * nomes ocultos); a imagem de audiência lê o número do servidor (a URL só pode baixar o marco) e sai sem número com a
 * chave "Pessoas agora no site" desligada. Sem anúncio em nenhum cartão. Carregada sob demanda pela SalaDeControle.
 */
import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AudienciaAdmin } from '@/shared/audiencia';
import { chavesNoite } from '@/shared/chaves-noite';
import { fmtDataHora, fmtHora, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { LIMITE_X, copiarTexto, pesoPostX, urlAbsoluta } from '@/app/lib/share';
import { Badge, Button, Icon, buttonClasses, toast } from '@/app/ui';
import { CLASSE_BOTAO_X, LogoX } from '@/app/components/share/CompartilharSheet';
import { HASHTAGS } from '@/app/components/share/textos';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Painel } from './kit';
import { cartoesPostar, linksPostar, type CartaoPostar, type FormatoImagemPostar } from './postar';

/** Audiência agora (sinal das páginas): o mesmo endpoint da seção Audiência, consultado com folga (só o `agora` importa). */
function useAudienciaAgora(ativo: boolean) {
  return useQuery<AudienciaAdmin>({
    queryKey: ['admin', 'audiencia', 'postar'],
    enabled: ativo,
    queryFn: async () => {
      const r = await fetch('/api/admin/audiencia', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      return (await r.json()) as AudienciaAdmin;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 15_000,
  });
}

/** O maior número medido (origem ou sinal das páginas), como o "pessoas agora" público; null sem medida. */
function maiorMedida(...v: (number | undefined)[]): number | null {
  const ok = v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return ok.length ? Math.max(...ok) : null;
}

export function SecaoPostar() {
  const { snap, nacional } = useAdmin();
  const st = snap.status;
  const noServidor = !__DEMO__;
  const aud = useAudienciaAgora(noServidor);
  const pessoas = maiorMedida(st.pessoasAgora, aud.data?.agora.pessoas);
  const contadorPublico = chavesNoite(snap.state).contadorPublico;
  const simulado = !!st.simulacao;
  const anonimizado = !!st.anonimizado;
  const eventos = nacional?.eventos;

  const r = useMemo(
    () => cartoesPostar({ wallNow: st.wallNow, fase: st.fase, simulado, anonimizado, eventos: eventos ?? [], pessoas }),
    [st.wallNow, st.fase, simulado, anonimizado, eventos, pessoas],
  );
  // durante a apuração o link do X leva a hora do SERVIDOR (h=HHMM), para a prévia não sair velha
  const agora = st.fase === 'apurando' ? st.wallNow : undefined;
  const urlPagina = urlAbsoluta('/apuracao');

  return (
    <div className="space-y-5 sm:space-y-6">
      <CabecalhoSecao
        titulo="Postar"
        icone="compartilhar"
        descricao="Texto, link e imagem prontos para cada momento da noite. Toque para abrir no X ou no WhatsApp, copiar ou baixar a imagem. Nada é publicado sozinho."
      />

      {simulado ? (
        <Callout tom="alerta" titulo="Simulação">
          Os textos levam “[SIMULAÇÃO]” e as imagens, a marca de simulação. Use só para treinar: não poste como resultado.
        </Callout>
      ) : null}
      {!noServidor ? (
        <Callout tom="neutro" titulo="Imagens só no servidor">
          As imagens são geradas pelo servidor do Sintonia. Nesta prévia estática aparecem só os textos e os links.
        </Callout>
      ) : null}

      <Painel titulo="Agora" icone="usuarios" subtitulo="Sem nome e sem placar: valem a qualquer hora.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Cartao c={r.convite} urlPagina={urlPagina} agora={agora} imagens={noServidor} miniatura={noServidor} />
          {r.audiencia.map((c) => (
            <Cartao
              key={c.id}
              c={c}
              urlPagina={urlPagina}
              agora={agora}
              imagens={noServidor}
              miniatura={noServidor}
              nota={contadorPublico ? undefined : 'A chave “Pessoas agora no site” está desligada: a imagem sai sem número.'}
            />
          ))}
          {r.proximoMarco !== null ? <ProximoMarco marco={r.proximoMarco} pessoas={pessoas} /> : null}
        </div>
      </Painel>

      <Painel
        titulo="Momentos da noite"
        icone="ao-vivo"
        subtitulo="Começo, marcos de % apurado, liderança, virada e resultado de Presidente, do mais recente para o mais antigo."
        acoes={
          r.momentos.length ? (
            <Badge tone="neutral" size="sm">
              <span className="num">{fmtInt(r.momentos.length)}</span> {r.momentos.length === 1 ? 'momento' : 'momentos'}
            </Badge>
          ) : null
        }
      >
        {!r.nomesLiberados ? (
          <Callout tom="neutro" icone="relogio" titulo="Liberados às 17h de 25/10 (Brasília)">
            Os cartões com nome de candidato só aparecem a partir das 17h do dia da eleição, pelo relógio do servidor (agora{' '}
            <span className="num">{fmtDataHora(st.wallNow)}</span>).
            {r.travados ? (
              <>
                {' '}
                <span className="num">{fmtInt(r.travados)}</span> {r.travados === 1 ? 'momento aguardando' : 'momentos aguardando'}.
              </>
            ) : null}
          </Callout>
        ) : r.momentos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13.5px] leading-snug text-fg-muted">
            Os momentos aparecem aqui conforme a apuração avança: começo, marcos de % apurado, virada e resultado.
          </p>
        ) : (
          <>
            {noServidor ? <ImagemPlacarAgora src={r.momentos[0].imagem.x} /> : null}
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {r.momentos.map((c) => (
                <li key={c.id} className="min-w-0">
                  <Cartao c={c} urlPagina={urlPagina} agora={agora} imagens={noServidor} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Painel>
    </div>
  );
}

/** Prévia única da imagem dos momentos (o placar nacional de agora, gerado pelo servidor). */
function ImagemPlacarAgora({ src }: { src: string }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-surface-2/60 p-3 sm:flex-row sm:items-center">
      <img src={src} alt="Prévia: placar nacional de agora" loading="lazy" className="aspect-[16/9] w-full rounded-lg border border-line bg-surface-3 object-cover sm:w-56" />
      <p className="text-[13px] leading-snug text-fg-muted">
        A imagem dos momentos é o <strong className="font-semibold text-fg">placar de agora</strong>, gerada pelo servidor na hora do
        download (com selo e sem foto na simulação).
      </p>
    </div>
  );
}

function ProximoMarco({ marco, pessoas }: { marco: number; pessoas: number | null }) {
  return (
    <div className="flex min-h-[132px] flex-col justify-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Próximo marco</span>
      <span className="num font-display text-[22px] font-semibold leading-tight text-fg">{fmtInt(marco)} pessoas</span>
      <span className="text-[13px] leading-snug text-fg-muted">
        {pessoas === null ? (
          'Sem medida de audiência agora.'
        ) : (
          <>
            Agora: <span className="num">{fmtInt(pessoas)}</span> ao mesmo tempo. O cartão aparece quando passar do marco.
          </>
        )}
      </span>
    </div>
  );
}

function Cartao({
  c,
  urlPagina,
  agora,
  imagens,
  miniatura,
  nota,
}: {
  c: CartaoPostar;
  urlPagina: string;
  agora?: number;
  /** Botões de download da imagem (só no servidor). */
  imagens: boolean;
  /** Prévia da imagem 16:9 no cartão. */
  miniatura?: boolean;
  nota?: ReactNode;
}) {
  const l = linksPostar(c, urlPagina, agora);
  const peso = pesoPostX(c.texto, HASHTAGS.apuracao, true);

  async function copiar() {
    const ok = await copiarTexto(l.textoCopiar);
    toast(ok ? 'Texto e link copiados' : 'Não foi possível copiar', { tone: ok ? 'ok' : 'alert', icon: ok ? 'copiar' : undefined });
  }

  return (
    <article data-cartao-postar={c.tipo} className="flex h-full min-w-0 flex-col rounded-xl border border-line bg-surface-2/50 p-3 sm:p-3.5">
      <header className="mb-2 flex items-center justify-between gap-2">
        <Badge tone={c.tipo === 'momento' ? 'brand' : 'neutral'} size="sm">
          {c.rotulo}
        </Badge>
        {c.t !== undefined ? <span className="num text-[12.5px] text-fg-muted">{fmtHora(c.t)}</span> : null}
      </header>

      {miniatura ? (
        <img src={c.imagem.x} alt={`Prévia da imagem: ${c.rotulo}`} loading="lazy" className="mb-2.5 aspect-[16/9] w-full rounded-lg border border-line bg-surface-3 object-cover" />
      ) : null}

      <p className="flex-1 text-pretty text-[13.5px] leading-snug text-fg">{c.texto}</p>
      <p className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-fg-subtle">
        <span className="min-w-0 truncate">{l.linkX.replace(/^https?:\/\//, '')}</span>
        <span className={cn('num shrink-0', peso > LIMITE_X && 'text-alert-fg')} title="Caracteres no X (o link conta 23)">
          {peso}/{LIMITE_X}
        </span>
      </p>
      {nota ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-alert-fg">
          <Icon name="alerta" size={13} className="mt-px shrink-0" />
          {nota}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={l.intencaoX} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses({ size: 'sm' }), CLASSE_BOTAO_X, 'px-2')} data-acao="postar-x">
          <LogoX size={14} />
          Abrir no X
        </a>
        <a href={l.intencaoWhatsapp} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses({ variant: 'secondary', size: 'sm' }), 'px-2')} data-acao="whatsapp">
          <Icon name="whatsapp" size={15} />
          WhatsApp
        </a>
      </div>
      <div className={cn('mt-2 grid gap-2', imagens ? 'grid-cols-3' : 'grid-cols-1')}>
        <Button variant="outline" size="sm" icon="copiar" onClick={copiar} className="px-2" data-acao="copiar">
          Copiar
        </Button>
        {imagens ? (
          <>
            <BaixarImagem c={c} formato="x" />
            <BaixarImagem c={c} formato="story" />
          </>
        ) : null}
      </div>
    </article>
  );
}

function BaixarImagem({ c, formato }: { c: CartaoPostar; formato: FormatoImagemPostar }) {
  return (
    <a
      href={c.imagem[formato]}
      download={`sintonia-${c.id}-${formato === 'x' ? '16x9' : '9x16'}.png`}
      className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'px-2')}
      title={formato === 'x' ? 'Baixar a imagem para o X (16:9)' : 'Baixar a imagem para Status e Stories (9:16)'}
      data-acao={`imagem-${formato}`}
    >
      <Icon name="download" size={15} />
      <span className="num">{formato === 'x' ? '16:9' : '9:16'}</span>
    </a>
  );
}
