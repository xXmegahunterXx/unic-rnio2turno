/**
 * "Sala da apuração": o chat ao vivo moderado (mensagens, fixada, reações, envio e regras sempre à vista). Usada no
 * painel lateral do desktop, na folha inferior do celular e na página /ao-vivo — a moldura (posição, altura, fechar)
 * é de quem usa; aqui fica o conteúdo, ocupando a altura toda que receber.
 *
 * Regras de neutralidade: nada aqui usa cor de candidato (apelidos em tons neutros); reações são neutras e nunca
 * ligadas a candidato; a única publicidade é "Sala oferecida por" (OferecimentoChat), numa faixa própria: no topo da sala
 * (painel e página) ou, na folha do celular, no PÉ, logo acima do campo — longe do placar que fica à vista acima da folha.
 *
 * Folha do celular (meta: ≥ 6 mensagens à vista em 390×844): subtítulo curto, campo "Comentar…" sempre à mostra (o
 * apelido é pedido só no 1º envio), reações e "Regras da sala" numa linha só, ajuda do apelido só com erro.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AVISO_REGISTRO_CHAT, EMOJI_REACAO, LIMITES_CHAT, REACOES, REGRAS_CHAT, REGRAS_CHAT_CURTA, ROTULO_REACAO, avaliarApelido, type MensagemChat, type ReacaoId } from '@/shared/chat';
import { fmtHora } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { Spinner } from '@/app/ui/Button';
import { OferecimentoChat } from '@/app/components/anuncios/OferecimentoChat';
import { fmtReacao, textoPessoasSala } from './nucleo';
import { apelidoSalvo, deltaReacoes, denunciarMensagem, enviarMensagem, marcarVisto, reagir, salvarApelido, useSala, type EstadoSala } from './sala';

export type VarianteSala = 'painel' | 'folha' | 'pagina';

/** Balão de conversa (o conjunto de ícones do app não tem um). */
export function IconeChat({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      <path d="M20 12.2c0 3.9-3.6 7-8 7-1.1 0-2.2-.2-3.1-.6L4.5 20l1.2-3.4C4.6 15.4 4 13.9 4 12.2c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
      <path d="M8.6 12.3h.01M12 12.3h.01M15.4 12.3h.01" strokeWidth={2.4} />
    </svg>
  );
}

function IconeAlfinete({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7" />
    </svg>
  );
}

export function Sala({
  variante,
  acoes,
  className,
}: {
  variante: VarianteSala;
  /** botões do canto do cabeçalho (expandir, fechar…) */
  acoes?: ReactNode;
  className?: string;
}) {
  const s = useSala('tela');
  const pagina = variante === 'pagina';
  const folha = variante === 'folha';
  return (
    <section aria-label="Sala da apuração: chat ao vivo" className={cn('relative flex h-full min-h-0 flex-col bg-surface', className)}>
      <Cabecalho s={s} variante={variante} acoes={acoes} />
      {s.indisponivel ? (
        <Desligada pagina={pagina} />
      ) : (
        <>
          {s.pub?.aberta && !folha ? <OferecimentoChat compacta={variante !== 'pagina'} /> : null}
          {s.pub?.fixada ? <Fixada texto={s.pub.fixada.texto} variante={variante} /> : null}
          <Lista s={s} pagina={pagina} />
          {s.pub?.aberta && folha ? <OferecimentoChat compacta noPe /> : null}
          <Rodape s={s} variante={variante} />
        </>
      )}
    </section>
  );
}

function Cabecalho({ s, variante, acoes }: { s: EstadoSala; variante: VarianteSala; acoes?: ReactNode }) {
  const pessoas = s.pub?.aberta ? textoPessoasSala(s.pub.pessoas) : null;
  const aberta = !!s.pub?.aberta;
  const folha = variante === 'folha';
  const sub = s.indisponivel ? 'Chat ao vivo' : !s.pub ? 'Conectando…' : aberta ? (
    folha ? (
      // celular: só o número (a linha é curta; "moderada" está nas regras)
      pessoas ? <span className="num">{pessoas}</span> : 'ao vivo'
    ) : (
      <>
        {pessoas ? <span className="num">{pessoas}</span> : 'Chat ao vivo'}
        <span className="text-fg-subtle"> · moderada</span>
      </>
    )
  ) : (
    'Fechada no momento'
  );
  return (
    <header className={cn('flex shrink-0 items-center border-b border-line', variante === 'pagina' ? 'gap-3 px-5 py-3.5' : folha ? 'gap-2.5 px-4 pb-2 pt-1' : 'gap-3 px-4 py-3')}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center ring-1 ring-inset',
          folha ? 'h-8 w-8 rounded-[10px]' : 'h-9 w-9 rounded-xl',
          aberta ? 'bg-brand/15 text-brand-fg ring-brand/30' : 'bg-surface-2 text-fg-muted ring-line',
        )}
      >
        <IconeChat size={folha ? 17 : 19} />
      </span>
      {folha ? (
        // celular: uma linha só (a altura vai para as mensagens)
        <div className="flex min-w-0 flex-1 items-baseline gap-2 leading-tight">
          <h2 className="flex shrink-0 items-center gap-1.5 font-display text-[15.5px] font-semibold tracking-[-0.01em] text-fg">
            Sala da apuração
            {aberta ? <LiveDot size={6} className="self-center" /> : null}
          </h2>
          <p className="min-w-0 truncate text-[12px] text-fg-muted">{sub}</p>
        </div>
      ) : (
        <div className="min-w-0 flex-1 leading-tight">
          <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.01em] text-fg">
            Sala da apuração
            {aberta ? <LiveDot size={7} /> : null}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-fg-muted">{sub}</p>
        </div>
      )}
      {acoes ? <div className="-mr-1.5 flex shrink-0 items-center gap-0.5">{acoes}</div> : null}
    </header>
  );
}

/** Mensagem fixada pela moderação (na folha do celular, recolhida em 1 linha; toque abre). */
function Fixada({ texto, variante }: { texto: string; variante: VarianteSala }) {
  const [aberta, setAberta] = useState(false);
  const folha = variante === 'folha';
  const conteudo = (
    <>
      <IconeAlfinete className="mt-0.5 text-brand-fg" />
      <p className={cn('min-w-0 flex-1 text-pretty text-left', folha && !aberta && 'line-clamp-1')}>
        <span className="mr-1 font-semibold text-brand-fg">Moderação:</span>
        {texto}
      </p>
    </>
  );
  const classe = cn('flex w-full shrink-0 gap-2 border-b border-line bg-brand/[0.07] text-[13px] leading-snug text-fg', variante === 'pagina' ? 'px-5 py-2.5' : folha ? 'px-4 py-2' : 'px-4 py-2.5');
  if (!folha) return <div className={classe}>{conteudo}</div>;
  return (
    <button type="button" onClick={() => setAberta((a) => !a)} aria-expanded={aberta} className={classe}>
      {conteudo}
    </button>
  );
}

function Desligada({ pagina }: { pagina: boolean }) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center text-center', pagina ? 'px-8 py-14' : 'px-6 py-10')}>
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted ring-1 ring-inset ring-line">
        <IconeChat size={26} />
      </span>
      <p className="mt-4 font-display text-[17px] font-semibold text-fg">Chat desligado nesta prévia</p>
      <p className="mt-1.5 max-w-xs text-pretty text-[13.5px] leading-relaxed text-fg-muted">
        A Sala da apuração funciona só no site no ar, com o servidor do Sintonia e moderação, na noite de 25 de outubro.
      </p>
    </div>
  );
}

// ---- mensagens -------------------------------------------------------------------------------------------------------

function Lista({ s, pagina }: { s: EstadoSala; pagina: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const total = s.mensagens.length;
  const ultimaId = total ? s.mensagens[total - 1].id : '';
  const anterior = useRef({ ultimaId: '', total: 0 });

  const irAoFim = useCallback((suave = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
    noFim.current = true;
    setNovasAbaixo(0);
    marcarVisto();
  }, []);

  // chegou mensagem: no fim → acompanha; lendo mais acima → só avisa ("N novas")
  useLayoutEffect(() => {
    const a = anterior.current;
    anterior.current = { ultimaId, total };
    if (!ultimaId || ultimaId === a.ultimaId) return;
    const minha = s.minhas.has(ultimaId);
    if (noFim.current || minha || !a.ultimaId) irAoFim(false);
    else {
      const idx = s.mensagens.findIndex((m) => m.id === a.ultimaId);
      setNovasAbaixo((n) => n + (idx >= 0 ? total - 1 - idx : 1));
    }
  }, [ultimaId, total, s.mensagens, s.minhas, irAoFim]);

  const aoRolar = () => {
    const el = ref.current;
    if (!el) return;
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (noFim.current && novasAbaixo) {
      setNovasAbaixo(0);
      marcarVisto();
    }
  };

  const fechada = s.pub !== null && !s.pub.aberta;
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={aoRolar}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Mensagens da sala"
        tabIndex={0}
        className={cn('h-full overflow-y-auto overscroll-contain focus-visible:outline-none', pagina ? 'px-3 py-3' : 'px-2 py-2')}
      >
        {!s.pub && !s.falhou ? (
          <div className="flex h-full items-center justify-center py-10 text-fg-muted">
            <Spinner size={20} />
          </div>
        ) : total === 0 ? (
          <Vazia fechada={fechada} bloqueio={s.pub?.bloqueio ?? null} falhou={s.falhou && !s.pub} />
        ) : (
          <ul className="flex flex-col">
            {s.mensagens.map((m) => (
              <Mensagem key={m.id} m={m} minha={s.minhas.has(m.id)} aberta={!fechada} />
            ))}
          </ul>
        )}
      </div>
      <Flutuantes s={s} />
      <AnimatePresence>
        {novasAbaixo > 0 ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
            onClick={() => irAoFim(true)}
            className="absolute bottom-3 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[12.5px] font-semibold text-bg shadow-card"
          >
            <span className="num">{novasAbaixo}</span> {novasAbaixo === 1 ? 'nova' : 'novas'}
            <Icon name="seta-baixo" size={14} />
          </motion.button>
        ) : null}
      </AnimatePresence>
      {fechada && total > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-semibold text-fg-muted shadow-card">Sala fechada · só leitura</span>
        </div>
      ) : null}
    </div>
  );
}

function Vazia({ fechada, bloqueio, falhou }: { fechada: boolean; bloqueio: string | null; falhou: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted ring-1 ring-inset ring-line">
        <IconeChat size={23} />
      </span>
      {falhou ? (
        <>
          <p className="mt-3.5 font-semibold text-fg">Não foi possível carregar a sala</p>
          <p className="mt-1 max-w-[17rem] text-pretty text-[13px] leading-relaxed text-fg-muted">Tentando de novo sozinho em instantes.</p>
        </>
      ) : fechada ? (
        <>
          <p className="mt-3.5 font-semibold text-fg">A sala está fechada</p>
          <p className="mt-1 max-w-[17rem] text-pretty text-[13px] leading-relaxed text-fg-muted">
            {bloqueio ?? 'Ela abre na noite da apuração, 25 de outubro, a partir das 17h (horário de Brasília).'}
          </p>
        </>
      ) : (
        <>
          <p className="mt-3.5 font-semibold text-fg">Comece a conversa</p>
          <p className="mt-1 max-w-[17rem] text-pretty text-[13px] leading-relaxed text-fg-muted">
            Comente a apuração com quem está acompanhando agora. Sala moderada.
          </p>
        </>
      )}
    </div>
  );
}

function Mensagem({ m, minha, aberta }: { m: MensagemChat; minha: boolean; aberta: boolean }) {
  const [menu, setMenu] = useState<'fechado' | 'confirmar' | 'enviado' | 'erro'>('fechado');
  return (
    <li className={cn('group relative rounded-xl px-2.5 py-1.5 transition-colors', minha ? 'bg-surface-2/70' : 'hover:bg-surface-2/50')}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words text-[14px] leading-snug text-fg [overflow-wrap:anywhere]">
          <span className="mr-1.5 inline-flex items-baseline gap-1.5 align-baseline">
            <span className={cn('font-semibold', minha ? 'text-brand-fg' : 'text-fg-muted')}>{m.apelido}</span>
            <span className="num text-[11px] text-fg-subtle">{fmtHora(m.em)}</span>
          </span>
          {m.texto}
        </p>
        {!minha && aberta ? (
          <button
            type="button"
            onClick={() => setMenu((x) => (x === 'fechado' ? 'confirmar' : 'fechado'))}
            aria-label={`Denunciar a mensagem de ${m.apelido}`}
            aria-expanded={menu === 'confirmar'}
            title="Denunciar"
            className={cn(
              'toque relative -mr-1 mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-opacity hover:bg-surface-3 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              menu === 'fechado' ? 'opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-60' : 'opacity-100',
            )}
          >
            <Icon name="pontos" size={15} />
          </button>
        ) : null}
      </div>
      {menu === 'confirmar' ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-[12.5px]">
          <span className="text-fg-muted">Denunciar à moderação?</span>
          <span className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={async () => setMenu((await denunciarMensagem(m.id)) ? 'enviado' : 'erro')}
              className="toque relative inline-flex h-7 items-center rounded-md bg-alert/15 px-2.5 font-semibold text-alert-fg hover:bg-alert/25"
            >
              Denunciar
            </button>
            <button type="button" onClick={() => setMenu('fechado')} className="toque relative inline-flex h-7 items-center rounded-md px-2.5 font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
              Cancelar
            </button>
          </span>
        </div>
      ) : menu === 'enviado' || menu === 'erro' ? (
        <p role="status" className="mt-1 text-[12px] text-fg-muted">
          {menu === 'enviado' ? 'Denúncia enviada. Obrigado por ajudar a moderar.' : 'Não foi possível enviar a denúncia agora.'}
        </p>
      ) : null}
    </li>
  );
}

// ---- reações ----------------------------------------------------------------------------------------------------------

interface Particula {
  id: number;
  r: ReacaoId;
  x: number;
}

let seqParticula = 0;
/** Ouvintes das reações locais (o botão dispara; a lista desenha as partículas). */
const aoReagir = new Set<(r: ReacaoId) => void>();

/** Emojis subindo (só animação local; com movimento reduzido, nada). */
function Flutuantes({ s }: { s: EstadoSala }) {
  const reduzir = useReducedMotion();
  const [ps, setPs] = useState<Particula[]>([]);
  const lancar = useCallback(
    (r: ReacaoId, n = 1) => {
      if (reduzir) return;
      const novas = Array.from({ length: n }, () => ({ id: ++seqParticula, r, x: 8 + Math.random() * 64 }));
      setPs((l) => [...l.slice(-24), ...novas]);
    },
    [reduzir],
  );
  useEffect(() => {
    const f = (r: ReacaoId) => lancar(r);
    aoReagir.add(f);
    return () => {
      aoReagir.delete(f);
    };
  }, [lancar]);
  // a sala reagindo: parte da diferença do TOTAL geral entre consultas, em emojis sorteados (o servidor não diz qual
  // emoji foi usado — um número por emoji viraria enquete combinada fora do site)
  const antes = useRef<number | undefined>(undefined);
  const reacoes = s.pub?.reacoes;
  useEffect(() => {
    if (typeof reacoes !== 'number') return;
    const d = deltaReacoes(antes.current, reacoes);
    antes.current = reacoes;
    const n = Math.min(4, Math.ceil(d / 4));
    for (let i = 0; i < n; i++) lancar(REACOES[Math.floor(Math.random() * REACOES.length)]);
  }, [reacoes, lancar]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-2 w-24 overflow-hidden">
      <AnimatePresence>
        {ps.map((p) => (
          <motion.span
            key={p.id}
            initial={{ y: 20, opacity: 0, scale: 0.6 }}
            animate={{ y: -170, opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1, 0.9] }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
            onAnimationComplete={() => setPs((l) => l.filter((x) => x.id !== p.id))}
            className="absolute bottom-0 text-[22px] leading-none"
            style={{ left: p.x }}
          >
            {EMOJI_REACAO[p.r]}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Botões de reação e o TOTAL de reações do último minuto (um número só: por emoji viraria enquete combinada fora do
 * site). `compacta`: só os botões (o total vai no título).
 */
function Reacoes({ s, compacta = false }: { s: EstadoSala; compacta?: boolean }) {
  const pub = s.pub;
  if (!pub?.aberta) return null;
  const total = (typeof pub.reacoes === 'number' ? pub.reacoes : 0) + REACOES.reduce((n, r) => n + s.pendentes[r], 0);
  return (
    <div className="flex shrink-0 items-center gap-1" title={total ? `${fmtReacao(total)} reações no último minuto` : undefined}>
      {REACOES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => {
            reagir(r);
            for (const f of aoReagir) f(r);
          }}
          aria-label={`Reagir: ${ROTULO_REACAO[r]}`}
          title={ROTULO_REACAO[r]}
          className={cn(
            'toque relative inline-flex items-center justify-center rounded-full border border-line bg-surface leading-none transition-[transform,background-color] hover:bg-surface-2 active:scale-90',
            compacta ? 'h-8 w-8 text-[15px]' : 'h-8 w-9 text-[15px]',
          )}
        >
          {EMOJI_REACAO[r]}
        </button>
      ))}
      {!compacta && total > 0 ? (
        <span className="ml-1 text-[11px] leading-tight text-fg-subtle">
          <span className="num font-semibold text-fg-muted">{fmtReacao(total)}</span> por minuto
        </span>
      ) : null}
    </div>
  );
}

// ---- envio --------------------------------------------------------------------------------------------------------------

function useContagem(): [number, (s: number) => void] {
  const [ate, setAte] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (ate <= Date.now()) return;
    const t = window.setInterval(() => setAgora(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [ate]);
  const resta = Math.max(0, Math.ceil((ate - agora) / 1000));
  return [resta, (s: number) => {
    setAte(Date.now() + s * 1000);
    setAgora(Date.now());
  }];
}

function Rodape({ s, variante }: { s: EstadoSala; variante: VarianteSala }) {
  const pagina = variante === 'pagina';
  const aberta = !!s.pub?.aberta;
  if (variante === 'folha') return <RodapeFolha s={s} aberta={aberta} />;
  return (
    <div className={cn('shrink-0 border-t border-line bg-surface', pagina ? 'px-5 pb-4 pt-3' : 'px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2')}>
      {aberta ? <Compositor s={s} lentoS={s.pub?.lentoS ?? LIMITES_CHAT.lento.padrao} /> : null}
      <p className={cn('text-pretty text-[11px] leading-snug text-fg-subtle', aberta ? 'mt-1.5' : '')}>
        {REGRAS_CHAT_CURTA}
        {s.pub?.registro ? ` ${AVISO_REGISTRO_CHAT}` : null}
        {variante !== 'pagina' ? (
          <>
            {' '}
            <Link to="/ao-vivo" className="font-medium text-fg-muted underline decoration-line underline-offset-2 hover:text-fg">
              Abrir em tela cheia
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Pé da folha do celular: campo de mensagem e, numa linha só, reações + "Regras da sala" + tela cheia. */
function RodapeFolha({ s, aberta }: { s: EstadoSala; aberta: boolean }) {
  const [trocar, setTrocar] = useState(0);
  return (
    <div className="relative shrink-0 border-t border-line bg-surface px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      {aberta ? <Compositor s={s} lentoS={s.pub?.lentoS ?? LIMITES_CHAT.lento.padrao} compacto trocarApelido={trocar} /> : null}
      <div className={cn('flex items-center gap-2', aberta ? 'mt-1.5' : '')}>
        {aberta ? <Reacoes s={s} compacta /> : null}
        <RegrasCompactas registro={!!s.pub?.registro} onTrocarApelido={aberta ? () => setTrocar((n) => n + 1) : undefined} />
      </div>
    </div>
  );
}

/** "Regras da sala" numa linha (folha do celular): toque abre a lista inteira (e "Trocar apelido"); e a tela cheia. */
function RegrasCompactas({ onTrocarApelido, registro }: { onTrocarApelido?: () => void; registro?: boolean }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  return (
    <div className="ml-auto flex min-w-0 shrink items-center gap-3 text-[12px]">
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        aria-controls={id}
        className="toque relative font-medium text-fg-muted underline decoration-line underline-offset-2 hover:text-fg"
      >
        Regras da sala
      </button>
      <Link to="/ao-vivo" className="toque relative shrink-0 font-medium text-fg-muted underline decoration-line underline-offset-2 hover:text-fg">
        Tela cheia
      </Link>
      {aberta ? (
        <div id={id} role="note" className="absolute inset-x-3 bottom-[calc(100%+6px)] z-10 rounded-2xl border border-line bg-surface p-3.5 text-[12.5px] leading-snug text-fg-muted shadow-card">
          <ul className="list-disc space-y-1 pl-4">
            {REGRAS_CHAT.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {registro ? <li>{AVISO_REGISTRO_CHAT}</li> : null}
          </ul>
          <div className="mt-2.5 flex items-center gap-4">
            {onTrocarApelido && apelidoSalvo() ? (
              <button
                type="button"
                onClick={() => {
                  setAberta(false);
                  onTrocarApelido();
                }}
                className="text-[12px] font-semibold text-fg hover:underline"
              >
                Trocar apelido
              </button>
            ) : null}
            <button type="button" onClick={() => setAberta(false)} className="text-[12px] font-semibold text-fg-muted hover:underline">
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Compositor({ s, lentoS, compacto = false, trocarApelido = 0 }: { s: EstadoSala; lentoS: number; compacto?: boolean; trocarApelido?: number }) {
  const [apelido, setApelido] = useState(apelidoSalvo);
  // folha do celular: o campo de mensagem aparece sempre; o apelido é pedido só quando a pessoa for enviar
  const [editandoApelido, setEditandoApelido] = useState(() => !compacto && !apelidoSalvo());
  /** folha: mensagem esperando o apelido (sai assim que ele for confirmado) */
  const pendente = useRef<string | null>(null);
  // folha: "Trocar apelido" (no menu das regras) abre a edição
  useEffect(() => {
    if (!trocarApelido) return;
    setRascunhoApelido(apelidoSalvo());
    setEditandoApelido(true);
  }, [trocarApelido]);
  const [rascunhoApelido, setRascunhoApelido] = useState(apelido);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resta, esperar] = useContagem();
  const campo = useRef<HTMLInputElement>(null);

  const confirmarApelido = (e: FormEvent) => {
    e.preventDefault();
    const r = avaliarApelido(rascunhoApelido);
    if (!('ok' in r)) {
      setAviso(r.erro);
      return;
    }
    setApelido(r.ok);
    salvarApelido(r.ok);
    setEditandoApelido(false);
    setAviso(null);
    const t = pendente.current;
    pendente.current = null;
    if (t) void publicar(t, r.ok);
    else window.setTimeout(() => campo.current?.focus(), 30);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando || resta > 0) return;
    if (!apelido) {
      // 1º envio sem apelido (folha): pede o apelido e envia em seguida
      pendente.current = t;
      setRascunhoApelido('');
      setEditandoApelido(true);
      setAviso(null);
      return;
    }
    await publicar(t, apelido);
  };

  const publicar = async (t: string, comoApelido: string) => {
    setEnviando(true);
    const r = await enviarMensagem(comoApelido, t);
    setEnviando(false);
    if (r.ok) {
      setTexto('');
      setAviso(null);
      esperar(r.proximaEmS);
    } else {
      setAviso(r.erro);
      if (r.esperaS) esperar(r.esperaS);
      if (r.motivo === 'apelido') {
        setRascunhoApelido(apelido);
        setEditandoApelido(true);
      }
    }
  };

  const restantes = LIMITES_CHAT.texto.max - Array.from(texto).length;
  const idAviso = useId();

  if (editandoApelido) {
    return (
      <form onSubmit={confirmarApelido} className={compacto ? 'space-y-1.5' : 'space-y-2'}>
        {compacto ? null : <Reacoes s={s} />}
        <label className="block text-[12.5px] font-semibold text-fg" htmlFor="chat-apelido">
          {pendente.current ? 'Antes de enviar: como quer aparecer na sala?' : 'Como quer aparecer na sala?'}
        </label>
        <div className="flex gap-2">
          <input
            id="chat-apelido"
            value={rascunhoApelido}
            onChange={(e) => setRascunhoApelido(e.target.value)}
            maxLength={LIMITES_CHAT.apelido.max}
            autoComplete="nickname"
            enterKeyHint="go"
            placeholder="Seu apelido"
            aria-describedby={aviso ? idAviso : undefined}
            autoFocus={compacto}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30 md:text-[14px]"
          />
          <button type="submit" className="inline-flex h-10 shrink-0 items-center rounded-xl bg-fg px-4 text-[13.5px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40" disabled={!rascunhoApelido.trim()}>
            {pendente.current ? 'Enviar' : 'Entrar'}
          </button>
        </div>
        {/* folha: a ajuda só aparece com erro (a altura vai para as mensagens) */}
        {!compacto || aviso ? (
          <p id={idAviso} role="status" className={cn('text-[12px] leading-snug', aviso ? 'text-alert-fg' : 'text-fg-subtle')}>
            {aviso ?? 'De 2 a 20 caracteres. Sem nome de candidato, partido ou número de urna.'}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form onSubmit={enviar}>
      <div className={cn('mb-2 flex items-center justify-between gap-2', compacto && 'hidden')}>
        <Reacoes s={s} />
        <button
          type="button"
          onClick={() => {
            setRascunhoApelido(apelido);
            setEditandoApelido(true);
            setAviso(null);
          }}
          className="toque relative shrink-0 text-[12px] font-medium text-fg-muted underline decoration-line underline-offset-2 hover:text-fg"
        >
          Trocar apelido
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            ref={campo}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (aviso && !resta) setAviso(null);
            }}
            maxLength={LIMITES_CHAT.texto.max}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={apelido ? `Comentar como ${apelido}` : 'Comentar…'}
            aria-label={apelido ? `Mensagem (como ${apelido})` : 'Mensagem'}
            aria-describedby={idAviso}
            className="h-11 w-full rounded-xl border border-line bg-surface-2 pl-3 pr-12 text-[16px] text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30 md:text-[14px]"
          />
          {restantes <= 30 ? (
            <span className={cn('num pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px]', restantes <= 10 ? 'text-alert-fg' : 'text-fg-subtle')}>{restantes}</span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!texto.trim() || enviando || resta > 0}
          aria-label={resta > 0 ? `Aguarde ${resta} segundos` : 'Enviar mensagem'}
          className="relative inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-brand-cta px-3 text-brand-ink transition-[opacity,transform] active:scale-95 disabled:opacity-45"
        >
          {enviando ? <Spinner size={18} /> : resta > 0 ? <span className="num text-[13px] font-semibold">{resta} s</span> : <Icon name="seta" size={19} />}
        </button>
      </div>
      <p id={idAviso} role="status" aria-live="polite" className={cn('text-[12px] leading-snug empty:hidden', aviso ? 'mt-1.5 text-alert-fg' : 'mt-1 text-fg-subtle')}>
        {aviso ?? (resta > 0 ? `Modo lento: uma mensagem a cada ${lentoS} s.` : '')}
      </p>
    </form>
  );
}
