/**
 * Seção "Desafio do palpite" da página /palpite (e de /palpite/desafio): SEM DINHEIRO, só pela graça.
 *
 *  - Até as 23h59 de 24/10, com o palpite cravado: a pessoa escolhe um apelido e manda o SEU link de desafio (WhatsApp
 *    primeiro no celular; copiar no computador; "Mais opções" abre o kit de compartilhar só com texto e link).
 *  - "Meu desafio" (este aparelho): ANTES do resultado, a lista em ordem alfabética com quem cravou e quando — nenhum
 *    número de palpite, nenhuma soma, média, contagem por lado ou "quem está à frente" (Lei 9.504/97, art. 33, § 5º).
 *  - Com a apuração oficial do TSE concluída: o ranking de quem chegou mais perto (diferença em p.p., desempate pelo
 *    horário do palpite), com o destaque "Na mosca" e o cartão do ranking para compartilhar (sem candidato).
 *
 * Nada vai ao servidor: o link leva apelido e palpite depois do "#", e o "Meu desafio" vive no localStorage.
 * Anúncio: nenhum dentro da seção (o "Palpite oferecido por" fica no fim da página).
 */
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { fmtDataHora, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { copiarTexto, prefereWhatsapp, urlAbsoluta, urlCompartilhada, whatsappUrl } from '@/app/lib/share';
import { Badge } from '@/app/ui/Badge';
import { Button, buttonClasses } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { toast } from '@/app/ui/Toast';
import { BotaoCompartilhar } from '@/app/components/share/BotaoCompartilhar';
import { CartaoDesafio } from './CartaoDesafio';
import {
  HASHTAGS_DESAFIO,
  MAX_PARTICIPANTES,
  NOME_ARQUIVO_RANKING,
  SEM_DINHEIRO,
  caminhoDesafio,
  euParticipante,
  fmtErro,
  textoConviteDesafio,
  textoRankingDesafio,
  validarApelidoDesafio,
  visaoDesafio,
  type ItemLista,
  type ItemRanking,
} from './desafio';
import type { DesafioApp } from './desafioEstado';
import type { Palpite, ResultadoOficial } from './nucleo';
import { pctsDoPalpite } from './nucleo';
import type { FinalistasPalpite } from './Pecas';
import { fmtPalpite } from './textos';

export interface SecaoDesafioProps {
  finalistas: FinalistasPalpite;
  desafio: DesafioApp;
  salvo: Palpite | null;
  /** palpites abertos (até as 23h59 de 24/10, relógio do servidor) */
  aberto: boolean;
  oficial: ResultadoOficial | null;
  /** marca do anunciante do cartão do ranking (a página já aplicou a regra; null = sem faixa) */
  oferecimento: string | null;
  className?: string;
}

/** Id do campo do apelido (o botão "Desafiar amigos" do divisor põe o foco nele). */
export const ID_CAMPO_APELIDO = 'desafio-apelido';
/** Id da seção (âncora do botão "Desafiar amigos"). */
export const ID_SECAO_DESAFIO = 'desafio';

/** Rola até a seção do desafio e põe o foco no apelido (ou no primeiro botão do link). */
export function irParaDesafio() {
  const s = document.getElementById(ID_SECAO_DESAFIO);
  if (!s) return;
  s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    const alvo = (document.getElementById(ID_CAMPO_APELIDO) as HTMLElement | null) ?? s.querySelector<HTMLElement>('[data-acao-desafio]');
    alvo?.focus({ preventScroll: true });
  }, 450);
}

const iniciais = (apelido: string) => {
  const p = apelido.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'EU';
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase();
};

/** Monograma do apelido nas cores da MARCA (nunca as de candidato). */
function AvatarApelido({ apelido, eu, className }: { apelido: string; eu?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-semibold',
        eu ? 'bg-brand text-brand-ink' : 'bg-brand/15 text-brand-fg ring-1 ring-inset ring-brand/30',
        className,
      )}
    >
      {iniciais(apelido)}
    </span>
  );
}

export function SecaoDesafio({ finalistas, desafio, salvo, aberto, oficial, oferecimento, className }: SecaoDesafioProps) {
  const visao = useMemo(() => visaoDesafio(desafio.estado, salvo, oficial), [desafio.estado, salvo, oficial]);
  const ranking = visao.tipo === 'ranking';
  const titulo = ranking ? 'Quem chegou mais perto' : aberto ? 'Desafie os amigos' : 'Meu desafio';
  return (
    <section
      id={ID_SECAO_DESAFIO}
      aria-labelledby="desafio-titulo"
      className={cn(
        'relative isolate scroll-mt-[calc(var(--app-header-h,56px)+16px)] overflow-hidden rounded-[28px] border border-line bg-surface p-4 shadow-card sm:p-7',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-brand/[0.12] blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">
            <Icon name="usuarios" size={15} />
            Desafio do palpite
          </p>
          <h2 id="desafio-titulo" className="mt-1 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]">
            {titulo}
          </h2>
        </div>
        <Badge tone="brand" size="sm" className="mt-0.5">
          {SEM_DINHEIRO}
        </Badge>
      </div>
      <p className="mt-2 max-w-[40rem] text-pretty text-[14.5px] leading-relaxed text-fg-muted">
        {ranking
          ? 'Com o resultado oficial do TSE, o palpite de cada um aparece ao lado da diferença para o número oficial.'
          : aberto
            ? 'Cada um crava o seu palpite e manda o próprio link para o grupo. Com o resultado oficial do TSE, aparece aqui quem chegou mais perto.'
            : 'Os palpites fecharam às 23h59 de 24/10. Quando o TSE concluir a apuração, aparece aqui quem chegou mais perto.'}
      </p>

      {aberto ? <SeuLink finalistas={finalistas} desafio={desafio} salvo={salvo} /> : null}

      {visao.tipo === 'lista' ? (
        <Lista itens={visao.itens} desafio={desafio} aberto={aberto} />
      ) : (
        <Ranking finalistas={finalistas} itens={visao.itens} foraDoRanking={visao.foraDoRanking} oficial={oficial!} oferecimento={oferecimento} />
      )}

      <Rodape desafio={desafio} />
    </section>
  );
}

// ---- seu link ------------------------------------------------------------------------------------------------------------

function SeuLink({ finalistas, desafio, salvo }: { finalistas: FinalistasPalpite; desafio: DesafioApp; salvo: Palpite | null }) {
  const { eu } = desafio.estado;
  const [editando, setEditando] = useState(false);
  const nomes = useMemo(() => finalistas.flatMap((c) => [c.nomeUrna, c.nome]), [finalistas]);
  const participante = euParticipante(desafio.estado, salvo);
  const caminho = participante ? caminhoDesafio(participante, nomes) : null;

  if (!salvo) {
    return (
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-surface-2/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2.5 text-[14px] leading-snug text-fg-muted">
          <Icon name="info" size={18} className="mt-px shrink-0 text-brand-fg" />
          Crave o seu palpite para criar o seu link de desafio.
        </p>
        <Button
          variant="outline"
          size="md"
          icon="seta-cima"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => document.getElementById('meu-palpite')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Ir para o divisor
        </Button>
      </div>
    );
  }

  if (!eu || editando || !caminho) {
    return (
      <FormApelido
        inicial={eu?.apelido ?? ''}
        nomes={nomes}
        trocando={!!eu}
        onCancelar={eu ? () => setEditando(false) : undefined}
        onSalvar={(apelido) => {
          desafio.definirApelido(apelido);
          setEditando(false);
          toast(eu ? 'Apelido trocado. Mande o link de novo para atualizar.' : 'Link de desafio pronto. Mande para o grupo.', { tone: 'ok', icon: 'check-circulo' });
        }}
      />
    );
  }

  return <AcoesLink apelido={eu.apelido} caminho={caminho} onTrocar={() => setEditando(true)} />;
}

function FormApelido({
  inicial,
  nomes,
  trocando,
  onSalvar,
  onCancelar,
}: {
  inicial: string;
  nomes: readonly string[];
  trocando: boolean;
  onSalvar: (apelido: string) => void;
  onCancelar?: () => void;
}) {
  const [valor, setValor] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const idAjuda = useId();
  const idErro = useId();
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = validarApelidoDesafio(valor, nomes);
    if ('erro' in r) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    onSalvar(r.ok);
  };
  return (
    <form onSubmit={enviar} noValidate className="mt-5 rounded-2xl border border-line bg-surface-2/50 p-4 sm:p-5">
      <label htmlFor={ID_CAMPO_APELIDO} className="block text-[14px] font-semibold text-fg">
        {trocando ? 'Novo apelido no desafio' : 'Seu apelido no desafio'}
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={ID_CAMPO_APELIDO}
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            if (erro) setErro(null);
          }}
          maxLength={40}
          autoComplete="nickname"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Ex.: Tia Lu"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${idErro} ${idAjuda}` : idAjuda}
          className={cn(
            'block h-12 w-full min-w-0 rounded-xl border bg-surface px-3.5 text-[16px] text-fg placeholder:text-fg-subtle transition-colors focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30 sm:flex-1 sm:text-[15px]',
            erro ? 'border-alert/60' : 'border-line',
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="lg" icon={trocando ? 'check' : 'link'} className="w-full sm:w-auto">
            {trocando ? 'Salvar' : 'Criar meu link'}
          </Button>
          {onCancelar ? (
            <Button variant="ghost" size="lg" onClick={onCancelar} className="shrink-0">
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>
      {erro ? (
        <p id={idErro} role="alert" className="mt-2 flex items-start gap-1.5 text-[13.5px] leading-snug text-alert-fg">
          <Icon name="alerta" size={16} className="mt-px shrink-0" />
          {erro}
        </p>
      ) : null}
      <p id={idAjuda} className="mt-2 text-[12.5px] leading-snug text-fg-muted">
        De 2 a 20 letras, sem nome de candidato, de partido ou número de urna. Aparece para quem abrir o seu link.
      </p>
    </form>
  );
}

function AcoesLink({ apelido, caminho, onTrocar }: { apelido: string; caminho: string; onTrocar: () => void }) {
  const celular = useMemo(() => prefereWhatsapp(), []);
  const texto = textoConviteDesafio(apelido);
  const zap = whatsappUrl(texto, urlCompartilhada(urlAbsoluta(caminho), 'whatsapp'));
  const copiar = async () => {
    const ok = await copiarTexto(urlCompartilhada(urlAbsoluta(caminho), 'copiar'));
    toast(ok ? 'Link de desafio copiado' : 'Não deu para copiar. Use "Mais opções".', { tone: ok ? 'ok' : 'alert', icon: ok ? 'check' : 'alerta' });
  };
  const botaoZap = (principal: boolean) => (
    <a
      href={zap}
      target="_blank"
      rel="noopener noreferrer"
      data-acao-desafio={principal ? 'whatsapp' : undefined}
      className={cn(buttonClasses({ variant: principal ? 'primary' : 'outline', size: 'lg' }), 'w-full sm:w-auto')}
    >
      <Icon name="whatsapp" size={19} />
      {principal ? 'Enviar no WhatsApp' : 'WhatsApp'}
    </a>
  );
  return (
    <div className="mt-5 rounded-2xl border border-brand/30 bg-brand/[0.06] p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <AvatarApelido apelido={apelido} eu />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Seu link de desafio</p>
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] text-fg">{apelido}</span>
            <button
              type="button"
              onClick={onTrocar}
              className="toque relative shrink-0 rounded-md text-[13px] font-medium text-fg-muted underline decoration-line underline-offset-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Trocar apelido
            </button>
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {celular ? botaoZap(true) : null}
        <Button
          variant={celular ? 'secondary' : 'primary'}
          size="lg"
          icon="link"
          onClick={copiar}
          data-acao-desafio={celular ? undefined : 'copiar'}
          className="w-full sm:w-auto"
        >
          Copiar link
        </Button>
        {celular ? null : botaoZap(false)}
        <BotaoCompartilhar
          label="Mais opções"
          variant="ghost"
          size="lg"
          icone="compartilhar"
          className="w-full sm:w-auto"
          titulo="Mandar meu link de desafio"
          descricao="Texto e link do seu desafio. O link leva o seu apelido e o seu palpite, que o Sintonia só mostra com o resultado oficial."
          texto={texto}
          caminho={caminho}
          hashtags={HASHTAGS_DESAFIO}
          nomeArquivo="sintonia-desafio-do-palpite"
          generico
        />
      </div>
      <p className="mt-3 text-pretty text-[12.5px] leading-snug text-fg-muted">
        O link leva o seu apelido e o seu palpite (depois do “#”, parte do endereço que não chega a servidor nenhum). Mudou o palpite até
        24/10? Mande o link de novo: quem abrir fica com o mais recente.
      </p>
    </div>
  );
}

// ---- lista (antes do resultado) ------------------------------------------------------------------------------------------

function Lista({ itens, desafio, aberto }: { itens: ItemLista[]; desafio: DesafioApp; aberto: boolean }) {
  const outros = itens.filter((x) => !x.eu).length;
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">No seu desafio</h3>
        {outros >= MAX_PARTICIPANTES - 5 ? (
          <span className="num text-[12px] text-fg-subtle">
            {outros} de {MAX_PARTICIPANTES}
          </span>
        ) : null}
      </div>
      {itens.length === 0 || (itens.length === 1 && itens[0].eu && outros === 0 && !aberto) ? null : (
        <ul className="divide-y divide-line">
          {itens.map((x) => (
            <LinhaLista key={x.eu ? 'eu' : x.id} item={x} onRemover={x.eu ? undefined : () => desafio.remover(x.id)} />
          ))}
        </ul>
      )}
      {outros === 0 ? (
        <p className="mt-3 text-pretty text-[13.5px] leading-snug text-fg-muted">
          {aberto
            ? 'Ninguém entrou ainda. Quem abrir o seu link e mandar o próprio de volta aparece aqui, neste aparelho.'
            : 'Nenhum link de desafio foi aberto neste aparelho.'}
        </p>
      ) : null}
      <p role="note" className="mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2/60 px-3.5 py-3 text-[13.5px] leading-snug text-fg-muted">
        <Icon name="olho-fechado" size={18} className="mt-px shrink-0 text-brand-fg" />
        <span>
          <strong className="font-semibold text-fg">Os números ficam guardados até o resultado.</strong> O palpite de cada um e o ranking de quem
          chegou mais perto aparecem aqui quando o TSE concluir a apuração.
        </span>
      </p>
    </div>
  );
}

function LinhaLista({ item, onRemover }: { item: ItemLista; onRemover?: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const nome = item.apelido || 'Você';
  return (
    <li className="flex min-h-[64px] items-center gap-3 py-2.5">
      <AvatarApelido apelido={item.apelido} eu={item.eu} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold leading-tight text-fg">
          <span className="truncate">{nome}</span>
          {item.eu && item.apelido ? <span className="shrink-0 text-[12px] font-medium text-fg-subtle">(você)</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-snug text-fg-muted">
          {item.cravouEm !== null ? (
            <span className="inline-flex items-center gap-1 text-ok-fg">
              <Icon name="check" size={14} />
              Cravou <span className="num text-fg-muted">· {fmtDataHora(item.cravouEm)}</span>
            </span>
          ) : (
            <span>Ainda não cravou</span>
          )}
          {item.tarde ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="relogio" size={13} />
              link aberto depois do prazo
            </span>
          ) : null}
        </p>
      </div>
      {onRemover ? (
        confirmando ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="secondary" size="sm" onClick={onRemover} aria-label={`Remover ${nome} do desafio`}>
              Remover
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
              Manter
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            aria-label={`Remover ${nome} do desafio`}
            title="Remover do desafio"
            className="toque relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="fechar" size={17} />
          </button>
        )
      ) : null}
    </li>
  );
}

// ---- ranking (com o resultado oficial) -----------------------------------------------------------------------------------

function Alvo({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Ranking({
  finalistas,
  itens,
  foraDoRanking,
  oficial,
  oferecimento,
}: {
  finalistas: FinalistasPalpite;
  itens: ItemRanking[];
  foraDoRanking: ItemLista[];
  oficial: ResultadoOficial;
  oferecimento: string | null;
}) {
  const [c0, c1] = finalistas;
  const lider = itens[0];
  const naMosca = itens.filter((x) => x.naMosca);
  let destaque: ReactNode = null;
  if (naMosca.length) {
    destaque = (
      <>
        Na mosca: <span className="text-fg">{naMosca.map((x) => x.apelido || 'você').join(', ')}</span>
      </>
    );
  } else if (lider) {
    destaque = (
      <>
        Mais perto: <span className="text-fg">{itens.filter((x) => x.posicao === 1).map((x) => x.apelido || 'você').join(', ')}</span>, a{' '}
        <span className="num text-fg">{fmtErro(lider.erro)}</span>
      </>
    );
  }
  return (
    // nomes e percentuais de candidato aqui: a barra de anúncio do celular se recolhe (§1.5)
    <div className="mt-6" data-sem-anuncio-fixo>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Ranking · resultado oficial do TSE</h3>
        <span className="num text-[12.5px] text-fg-muted">
          {c0.nomeUrna} <span className={cn('font-semibold', corSlot(c0.cor).text)}>{fmtPct(oficial.pct0)}</span> · {c1.nomeUrna}{' '}
          <span className={cn('font-semibold', corSlot(c1.cor).text)}>{fmtPct(100 - oficial.pct0)}</span>
        </span>
      </div>
      {destaque ? (
        <p className="mt-3 flex items-center gap-2 font-display text-[19px] font-semibold leading-snug tracking-[-0.02em] text-fg-muted sm:text-[21px]">
          <span className="text-brand-fg">
            <Alvo size={22} />
          </span>
          <span className="min-w-0">{destaque}</span>
        </p>
      ) : null}
      {itens.length ? (
        <ol className="mt-3 space-y-1.5">
          {itens.map((x) => {
            const [p0, p1] = pctsDoPalpite(x.a);
            const primeiro = x.posicao === 1;
            return (
              <li
                key={x.eu ? 'eu' : x.id}
                className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4', primeiro ? 'border-brand/40 bg-brand/[0.08]' : 'border-line bg-surface-2/40')}
              >
                <span
                  className={cn(
                    'num inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-semibold',
                    primeiro ? 'bg-brand text-brand-ink' : 'bg-surface-3 text-fg',
                  )}
                  aria-label={`${x.posicao}º lugar${x.empate ? ' (empate)' : ''}`}
                >
                  {x.posicao}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-semibold leading-tight text-fg">
                    <span className="truncate">{x.apelido || 'Você'}</span>
                    {x.eu && x.apelido ? <span className="text-[12px] font-medium text-fg-subtle">(você)</span> : null}
                    {x.naMosca ? (
                      <Badge tone="brand" size="sm">
                        Na mosca
                      </Badge>
                    ) : null}
                    {x.empate ? <span className="text-[12px] font-medium text-fg-subtle">empate</span> : null}
                  </p>
                  <p className="num mt-0.5 text-[12.5px] leading-snug text-fg-muted">
                    <span className={corSlot(c0.cor).text}>{fmtPalpite(p0)}</span> × <span className={corSlot(c1.cor).text}>{fmtPalpite(p1)}</span>
                    <span className="text-fg-subtle"> · cravou {fmtDataHora(x.cravouEm)}</span>
                    {x.tarde ? (
                      <span className="text-fg-subtle">
                        {' '}
                        · <Icon name="relogio" size={12} className="-mt-0.5 inline" /> link aberto depois do prazo
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="num shrink-0 text-right font-display text-[22px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[26px]">
                  {fmtErro(x.erro).replace(' p.p.', '')}
                  <span className="ml-0.5 text-[12px] font-medium tracking-normal text-fg-muted">p.p.</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-[13.5px] text-fg-muted">Ninguém cravou palpite neste desafio.</p>
      )}
      <p className="mt-3 text-pretty text-[12.5px] leading-snug text-fg-muted">
        Palpite: % dos votos válidos de {c0.nomeUrna} × {c1.nomeUrna}. Diferença em pontos percentuais para o resultado oficial; empate na
        diferença: fica à frente quem cravou primeiro. Menos de 0,5 p.p.: na mosca.
      </p>
      {foraDoRanking.length ? (
        <p className="mt-1.5 text-[12.5px] text-fg-subtle">Sem palpite cravado: {foraDoRanking.map((x) => x.apelido || 'você').join(', ')}.</p>
      ) : null}
      {itens.length ? (
        <div className="mt-4">
          <BotaoCompartilhar
            label="Compartilhar o ranking"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
            titulo="Compartilhar o ranking do desafio"
            descricao="Imagem com os apelidos e a diferença de cada um para o resultado oficial, sem nome de candidato. Mostre a quem participou."
            texto={textoRankingDesafio(itens)}
            caminho="/palpite"
            hashtags={HASHTAGS_DESAFIO}
            nomeArquivo={NOME_ARQUIVO_RANKING}
            cartao={(formato) => <CartaoDesafio formato={formato} itens={itens} oferecimento={oferecimento} />}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---- rodapé: como funciona e apagar ------------------------------------------------------------------------------------

function Rodape({ desafio }: { desafio: DesafioApp }) {
  const [confirmando, setConfirmando] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const tem = !!desafio.estado.eu || desafio.estado.participantes.length > 0;
  return (
    <div className="mt-6 border-t border-line pt-4">
      <details ref={ref} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-[14px] font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
          Como funciona o desafio
          <Icon name="chevron" size={17} className="text-fg-muted transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-fg-muted">
          {[
            'Crave o seu palpite, escolha um apelido e mande o seu link para o grupo. Quem abrir crava o próprio palpite e manda o link de volta.',
            'Cada link aberto entra no “Meu desafio” deste aparelho (até 30 pessoas). Dá para remover alguém quando quiser.',
            'Até o resultado, a lista mostra só quem cravou e quando. Com o resultado oficial do TSE, aparecem os palpites e o ranking: fica em primeiro quem errou por menos e, no empate, quem cravou antes.',
            'Não vale dinheiro nem prêmio: é só pela graça. O Sintonia não recebe os palpites nem os apelidos; tudo fica nos aparelhos e nos links.',
            'Quem já está no desafio não muda depois das 23h59 de 24/10. Link aberto depois do prazo entra com a marca do relógio.',
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Icon name="check" size={15} className="mt-1 shrink-0 text-brand-fg" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </details>
      {tem ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          {confirmando ? (
            <>
              <span className="text-fg-muted">Apagar o apelido e a lista deste aparelho?</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  desafio.apagar();
                  setConfirmando(false);
                  toast('Desafio apagado deste aparelho', { tone: 'ok', icon: 'check' });
                }}
              >
                Apagar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="toque relative rounded-lg px-1 py-0.5 font-medium text-fg-muted underline decoration-line underline-offset-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Apagar o desafio deste aparelho
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
