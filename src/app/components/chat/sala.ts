/**
 * Chat ao vivo — estado compartilhado do navegador (um só por aba): consulta `GET /api/chat` enquanto alguém tem
 * interesse (sala na tela = rápido; só a pílula minimizada com o contador = devagar; sala fechada = raramente, acordando
 * na hora da abertura; ninguém = parado; aba escondida = parado — `proximaConsulta` em nucleo.ts, vezes o freio da noite),
 * junta por id, conta as novas, envia mensagens, denúncias, reações (em lotes) e o sinal de presença (só com a sala na
 * tela e aberta E depois de a pessoa USAR o chat nesta visita — `marcarParticipacao`). No build demo (sem servidor)
 * nada é consultado: a sala aparece desligada.
 *
 * Privacidade: vai ao servidor só o texto que a pessoa publica, o apelido e um token aleatório do navegador (para os
 * limites; o servidor guarda só um hash dele em memória). Apelido e token ficam no localStorage deste navegador. O token
 * só nasce quando a pessoa usa o chat (abre pelo botão, mexe no popup, abre a folha ou a página /ao-vivo, envia, reage
 * ou denuncia): o popup que aparece aberto sozinho no computador apenas LÊ a sala (GET sem nada da pessoa). O rascunho
 * da mensagem fica só na memória da aba (sobrevive ao popup recolher; nunca é gravado).
 */
import { useEffect, useId, useSyncExternalStore } from 'react';
import type { ChatPublico, MensagemChat, ReacaoId, RespostaEnvio } from '@/shared/chat';
import { REACOES } from '@/shared/chat';
import { contarNovas, gerarToken, juntarMensagens, proximaConsulta, type Interesse } from './nucleo';
import { fatorChatVigente } from '@/app/data/carga';

export interface EstadoSala {
  /** última resposta do servidor (null antes da 1ª) */
  pub: ChatPublico | null;
  mensagens: readonly MensagemChat[];
  /** ids das mensagens publicadas por esta aba */
  minhas: ReadonlySet<string>;
  novas: number;
  /** a última consulta falhou (mostra aviso discreto; os dados anteriores continuam) */
  falhou: boolean;
  /** build demo: sem servidor, sala desligada */
  indisponivel: boolean;
  /** reações locais ainda não enviadas (somadas à contagem exibida) */
  pendentes: Record<ReacaoId, number>;
}

const ROTA = '/api/chat';
const CHAVE_TOKEN = 'sintonia:chat-token';
const CHAVE_APELIDO = 'sintonia:chat-apelido';

const zerar = (): Record<ReacaoId, number> => ({ fogo: 0, uau: 0, palmas: 0, olhos: 0 });

let estado: EstadoSala = {
  pub: null,
  mensagens: [],
  minhas: new Set(),
  novas: 0,
  falhou: false,
  indisponivel: __DEMO__,
  pendentes: zerar(),
};
const ouvintes = new Set<() => void>();
const interesses = new Map<string, Interesse>();
let vistoAte = -1;
let falhas = 0;
let timer = 0;
let emAndamento = false;
let ultimaPresenca = 0;
let timerReacao = 0;
/** reações que esta aba enviou desde a última leitura (descontadas da animação "a sala está reagindo") */
let enviadasDesde = 0;
/** hora da última consulta bem-sucedida (depois de muito tempo parada, a aba recomeça a lista do zero) */
let ultimaConsultaOk = 0;
/** relógio do servidor − relógio do aparelho (ms), da última resposta (`agora`): a contagem até as 17h e a fase da sala */
let deslocamento = 0;
/**
 * A pessoa usou o chat nesta visita (abriu pelo botão, mexeu no popup, abriu a folha ou a /ao-vivo)? Só então vai o sinal
 * de presença ("N na sala") e nasce o token do navegador. O popup que abre sozinho no computador não conta.
 */
let participando = false;
/** Rascunho da mensagem (só na memória da aba): o popup pode recolher e desmontar o campo no meio da digitação. */
let rascunho = '';

/** Agora pelo relógio do SERVIDOR (o do aparelho pode estar errado). */
export function agoraServidor(): number {
  return Date.now() + deslocamento;
}

function emitir(parcial: Partial<EstadoSala>) {
  estado = { ...estado, ...parcial };
  for (const f of ouvintes) f();
}

// ---- token e apelido (localStorage é só conveniência: sem ele, vale a memória da aba) ---------------------------

let tokenMemoria: string | null = null;
export function tokenDoNavegador(): string {
  if (tokenMemoria) return tokenMemoria;
  try {
    const t = localStorage.getItem(CHAVE_TOKEN);
    if (t && /^[A-Za-z0-9_-]{16,64}$/.test(t)) return (tokenMemoria = t);
  } catch {
    /* sem armazenamento */
  }
  const aleatorio = (n: number) => {
    const b = new Uint8Array(n);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  };
  tokenMemoria = gerarToken(aleatorio);
  try {
    localStorage.setItem(CHAVE_TOKEN, tokenMemoria);
  } catch {
    /* fica só na memória */
  }
  return tokenMemoria;
}

export function apelidoSalvo(): string {
  try {
    return localStorage.getItem(CHAVE_APELIDO) ?? '';
  } catch {
    return '';
  }
}

export function salvarApelido(a: string) {
  try {
    if (a) localStorage.setItem(CHAVE_APELIDO, a);
    else localStorage.removeItem(CHAVE_APELIDO);
  } catch {
    /* só nesta visita */
  }
}

// ---- consultas ---------------------------------------------------------------------------------------------------

function interesseAtual(): Interesse | null {
  let r: Interesse | null = null;
  for (const v of interesses.values()) {
    if (v === 'tela') return 'tela';
    r = 'fundo';
  }
  return r;
}

function agendar(imediato = false) {
  if (timer) window.clearTimeout(timer);
  timer = 0;
  if (estado.indisponivel) return;
  const i = interesseAtual();
  if (!i || document.visibilityState === 'hidden') return;
  // freio leve (I37): 2× mais espaçado
  const ms = imediato ? 0 : proximaConsulta(estado.pub, i, falhas, agoraServidor(), Math.random()) * fatorChatVigente();
  timer = window.setTimeout(() => void consultar(), ms);
}

async function consultar() {
  timer = 0;
  if (emAndamento) return;
  emAndamento = true;
  try {
    const r = await fetch(ROTA, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const pub = (await r.json()) as ChatPublico;
    falhas = 0;
    const agoraLocal = Date.now();
    if (typeof pub.agora === 'number' && Number.isFinite(pub.agora)) deslocamento = pub.agora - agoraLocal;
    const mensagens = juntarMensagens(estado.mensagens, pub, undefined, ultimaConsultaOk ? agoraLocal - ultimaConsultaOk : 0);
    ultimaConsultaOk = agoraLocal;
    const ultima = mensagens.length ? mensagens[mensagens.length - 1].em : 0;
    // 1ª resposta: o histórico não conta como "novas"; com a sala na tela, tudo está visto
    if (vistoAte < 0 || interesseAtual() === 'tela') vistoAte = Math.max(vistoAte, ultima);
    emitir({ pub, mensagens, novas: contarNovas(mensagens, vistoAte, estado.minhas), falhou: false });
    presencaSeDevida();
  } catch {
    falhas++;
    emitir({ falhou: true });
  } finally {
    emAndamento = false;
    agendar();
  }
}

/** Sinal de presença: só depois de a pessoa usar o chat, com a sala na tela e aberta, no intervalo que o servidor pede. */
function presencaSeDevida() {
  const pub = estado.pub;
  if (!participando || !pub?.aberta || interesseAtual() !== 'tela' || document.visibilityState === 'hidden') return;
  const agora = Date.now();
  if (agora - ultimaPresenca < Math.max(30, pub.presencaS) * 1000) return;
  ultimaPresenca = agora;
  // lê a resposta (204, vazia): sem isso o navegador registra a requisição como "abortada" ao descartar o corpo
  postar('/presenca', { token: tokenDoNavegador() })
    .then((r) => r.text())
    .catch(() => undefined);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') agendar(true);
    else if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  });
}

/**
 * A pessoa usou o chat (clicou, rolou, digitou, abriu a folha ou a /ao-vivo): a partir de agora vale o sinal de presença
 * (e o token do navegador nasce no primeiro sinal). Idempotente.
 */
export function marcarParticipacao() {
  if (participando) return;
  participando = true;
  presencaSeDevida();
}

/** Rascunho da mensagem desta aba (memória; nunca gravado). */
export const lerRascunho = () => rascunho;
export function guardarRascunho(t: string) {
  rascunho = t;
}

/** Marca tudo como visto (a sala está na tela). */
export function marcarVisto() {
  const ultima = estado.mensagens.length ? estado.mensagens[estado.mensagens.length - 1].em : 0;
  vistoAte = Math.max(vistoAte, ultima);
  if (estado.novas) emitir({ novas: 0 });
}

// ---- envios --------------------------------------------------------------------------------------------------------

async function postar(caminho: string, corpo: unknown): Promise<Response> {
  return fetch(`${ROTA}${caminho}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(corpo),
  });
}

/** Publica uma mensagem. A resposta traz o motivo da recusa (exibido como veio do servidor). */
export async function enviarMensagem(apelido: string, texto: string): Promise<RespostaEnvio> {
  if (estado.indisponivel) return { ok: false, motivo: 'fechada', erro: 'Chat desligado nesta prévia.' };
  marcarParticipacao();
  try {
    const r = await postar('', { apelido, texto, token: tokenDoNavegador() });
    const j = (await r.json()) as RespostaEnvio;
    if (j.ok) {
      const minhas = new Set(estado.minhas).add(j.mensagem.id);
      const mensagens = juntarMensagens(estado.mensagens, { mensagens: [j.mensagem], removidas: [], limpaEm: estado.pub?.limpaEm ?? 0 });
      vistoAte = Math.max(vistoAte, j.mensagem.em);
      emitir({ minhas, mensagens });
    }
    return j;
  } catch {
    return { ok: false, motivo: 'limite', erro: 'Sem conexão. Tente de novo em instantes.' };
  }
}

/** Denuncia uma mensagem (3 redes diferentes escondem até a moderação decidir). */
export async function denunciarMensagem(id: string): Promise<boolean> {
  if (estado.indisponivel) return false;
  marcarParticipacao();
  try {
    const r = await postar('/denuncia', { id, token: tokenDoNavegador() });
    return r.ok;
  } catch {
    return false;
  }
}

/** Reação local (a animação é do componente); vai ao servidor em lotes a cada ~4 s. */
export function reagir(r: ReacaoId) {
  if (estado.indisponivel || !estado.pub?.aberta) return;
  marcarParticipacao();
  const pendentes = { ...estado.pendentes, [r]: Math.min(20, estado.pendentes[r] + 1) };
  emitir({ pendentes });
  if (!timerReacao) timerReacao = window.setTimeout(enviarReacoes, 4000);
}

function enviarReacoes() {
  timerReacao = 0;
  const lote = estado.pendentes;
  if (!REACOES.some((r) => lote[r] > 0)) return;
  for (const r of REACOES) enviadasDesde += lote[r];
  emitir({ pendentes: zerar() });
  postar('/reacao', { token: tokenDoNavegador(), r: lote })
    .then((r) => r.text())
    .catch(() => undefined);
}

/**
 * Reações dos OUTROS desde a última leitura (para a animação de "a sala está reagindo"): a diferença do TOTAL geral
 * menos o que esta aba enviou. Chamar a cada resposta nova. (O servidor publica só o total, nunca por emoji.)
 */
export function deltaReacoes(antes: number | undefined, depois: number): number {
  const d = depois - (antes ?? depois) - enviadasDesde;
  enviadasDesde = 0;
  return Math.max(0, d);
}

// ---- React -----------------------------------------------------------------------------------------------------------

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/**
 * Estado da sala. `interesse`: 'tela' (sala visível: consulta rápida + presença), 'fundo' (só a pílula com o contador)
 * ou null (não consulta por causa deste componente).
 */
export function useSala(interesse: Interesse | null): EstadoSala {
  const id = useId();
  useEffect(() => {
    if (!interesse) return;
    const antes = interesseAtual();
    interesses.set(id, interesse);
    if (interesse === 'tela') marcarVisto();
    // chegou o 1º interessado, ou o painel abriu: consulta já — salvo se a última resposta tem menos de 2,5 s (o popup
    // recolhe e volta ao rolar a página: cada volta não vira uma consulta)
    if (!antes || (interesse === 'tela' && antes !== 'tela')) agendar(Date.now() - ultimaConsultaOk >= 2500);
    return () => {
      interesses.delete(id);
      if (!interesseAtual()) agendar();
    };
  }, [id, interesse]);
  return useSyncExternalStore(assinar, () => estado, () => estado);
}
