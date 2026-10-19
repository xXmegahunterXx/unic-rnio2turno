/**
 * Desafio do palpite entre amigos — SEM DINHEIRO (sem valor, sem prêmio, sem Pix, sem fichas): regras puras, sem React
 * nem DOM, testadas em desafio.test.ts.
 *
 * Como funciona: a pessoa crava o palpite (o divisor de sempre), escolhe um APELIDO e manda o seu LINK DE DESAFIO ao grupo.
 * Quem abre o link vê "Fulano te desafiou", crava o próprio palpite e manda o SEU link de volta. Cada link aberto entra no
 * "Meu desafio" DESTE aparelho (localStorage, até MAX_PARTICIPANTES). Com o resultado OFICIAL do TSE (apuração concluída),
 * a lista vira o ranking de quem chegou mais perto.
 *
 * Regras (ARCHITECTURE §1):
 *  - LGPD: nada vai ao servidor. O link leva o apelido e o palpite DEPOIS do "#" (o navegador não envia essa parte a
 *    servidor algum); o "Meu desafio" fica só neste aparelho; "Apagar meus dados" (/privacidade) limpa tudo.
 *  - Lei 9.504/97, art. 33, § 5º: ANTES do resultado oficial, a lista NÃO mostra número de palpite de ninguém, nem soma,
 *    média, contagem por lado, distribuição ou "quem está à frente" — só quem cravou e quando (`ItemLista` nem tem o
 *    campo do palpite). Os números de cada um só aparecem no ranking, com a apuração concluída.
 *  - Sem nome de candidato nos textos do desafio (convite e ranking): servem também à simulação com nomes ocultos.
 *
 * O link NÃO é assinado: sem servidor, qualquer chave ficaria no próprio app. A soma de conferência (2 caracteres) só
 * detecta link cortado ao copiar. Contra o "palpite depois do resultado", vale o que o aparelho viu: link de quem já está
 * no desafio não muda nada depois do prazo, e quem entra depois do prazo ganha a marca "link aberto depois do prazo".
 *
 * Formato do código (depois de `/palpite/desafio#`):
 *   "1" (versão) · id (5, base 36, sorteado no aparelho de quem criou) · palpite (2, base 36, décimos como no /palpite)
 *   · minuto em que cravou (4, base 36, desde EPOCA_DESAFIO) · conferência (2, base 36) · apelido (UTF-8 em base64url)
 */
import { avaliarApelido, avaliarTexto, prepararNomesApelido } from '@/shared/chat';
import { fmtDecimal } from '@/shared/format';
import { LIMITE_TEXTO, limitarTexto } from '@/app/components/share/textos';
import { pesoTextoX } from '@/app/lib/share';
import { FIM_PALPITES, avaliarPalpite, palpiteValido, type Armazenamento, type Palpite, type ResultadoOficial } from './nucleo';

/** Versão do código do link de desafio. */
export const VERSAO_DESAFIO = '1';
/** Participantes guardados neste aparelho (sem contar a própria pessoa). */
export const MAX_PARTICIPANTES = 30;
/** Rota da página do desafio (a mesma página do /palpite, com a chamada do desafio). */
export const CAMINHO_DESAFIO = '/palpite/desafio';
/** Chave do armazenamento local (o prefixo "sintonia:" entra no "Apagar meus dados" da /privacidade). */
export const CHAVE_DESAFIO = 'sintonia:desafio';
/** Origem da contagem de minutos do link: 1/9/2026, 0h de Brasília (UTC−3). */
export const EPOCA_DESAFIO = Date.UTC(2026, 8, 1, 3, 0, 0);

const MINUTO = 60_000;
const RE_ID = /^[0-9a-z]{5}$/;
/** apelido de 2 a 20 caracteres: até 80 bytes em UTF-8 → até 107 caracteres em base64url */
const RE_CODIGO = /^1([0-9a-z]{5})([0-9a-z]{2})([0-9a-z]{4})([0-9a-z]{2})([A-Za-z0-9_-]{2,108})$/;

/** Quem está no desafio (o que viaja no link). */
export interface Participante {
  /** 5 caracteres base 36, sorteados uma vez no aparelho de quem criou o link */
  id: string;
  apelido: string;
  /** décimos de p.p. do candidato de menor número (como no /palpite) */
  a: number;
  /** quando o palpite foi cravado (epoch ms, arredondado ao minuto) */
  em: number;
}

/** Participante guardado neste aparelho. */
export interface ParticipanteSalvo extends Participante {
  /** quando ESTE aparelho abriu o link pela primeira vez (relógio do servidor) */
  recebidoEm: number;
}

/** A própria pessoa no desafio (apelido e o id que vai no link dela). */
export interface EuDesafio {
  id: string;
  apelido: string;
}

export interface EstadoDesafio {
  eu: EuDesafio | null;
  participantes: ParticipanteSalvo[];
}

export const DESAFIO_VAZIO: EstadoDesafio = Object.freeze({ eu: null, participantes: [] }) as EstadoDesafio;

// ---- apelido ------------------------------------------------------------------------------------------------------------

/**
 * Valida o apelido com os MESMOS cuidados do chat (src/shared/chat.ts): 2–20 caracteres do nosso alfabeto, sem link,
 * e-mail ou telefone, sem nome de candidato (os fixos do chat + `nomes` do dataset, também com letras parecidas — "Iula" —
 * ou soltas — "L u l a"), partido ou termo partidário, 13/22, nome reservado, palavrão, propaganda ou fraude nas urnas.
 * Aqui não há moderação (o apelido vira o título "Fulano te desafiou" e o texto do convite): além do filtro de apelido,
 * o texto também precisa passar pelo filtro das MENSAGENS do chat (`avaliarTexto`), a barreira mais larga que existe.
 */
export function validarApelidoDesafio(bruto: unknown, nomes: readonly string[] = []): { ok: string } | { erro: string } {
  const r = avaliarApelido(bruto, nomes.length ? prepararNomesApelido(nomes) : undefined);
  if (!('ok' in r)) return { erro: r.erro };
  if (!('ok' in avaliarTexto(r.ok))) return { erro: 'Escolha outro apelido: sem ofensa, propaganda ou acusação de fraude.' };
  return { ok: r.ok };
}

/** Apelido já limpo e aceito (o que se lê de um link ou do armazenamento precisa voltar idêntico). */
const apelidoAceito = (s: unknown, nomes: readonly string[] = []): s is string => {
  if (typeof s !== 'string') return false;
  const r = validarApelidoDesafio(s, nomes);
  return 'ok' in r && r.ok === s;
};

// ---- código do link -----------------------------------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function paraBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const resto = bytes.length - i;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (resto > 1) s += B64[(n >> 6) & 63];
    if (resto > 2) s += B64[n & 63];
  }
  return s;
}

function deBase64Url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  const bytes = new Uint8Array(out);
  // forma canônica (sem bits sobrando): um conteúdo = um código só
  return paraBase64Url(bytes) === s ? bytes : null;
}

/** Soma de conferência (FNV-1a 32 bits → 2 caracteres base 36). Só detecta link cortado; não é assinatura. */
function conferencia(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1296).toString(36).padStart(2, '0');
}

/** Minuto (epoch ms arredondado para baixo) aceito no link: depois da época e antes do fim dos palpites. */
const minutoValido = (em: number) => Number.isFinite(em) && em >= EPOCA_DESAFIO && em < FIM_PALPITES;

/** Código do link (null se algum campo for inválido — o app nunca gera um link que não abra). */
export function codificarDesafio(p: Participante, nomes: readonly string[] = []): string | null {
  if (!RE_ID.test(p.id) || !palpiteValido(p.a) || !minutoValido(p.em) || !apelidoAceito(p.apelido, nomes)) return null;
  const min = Math.floor((p.em - EPOCA_DESAFIO) / MINUTO);
  const corpo = `${p.id}${p.a.toString(36).padStart(2, '0')}${min.toString(36).padStart(4, '0')}`;
  const nome = paraBase64Url(new TextEncoder().encode(p.apelido));
  return `${VERSAO_DESAFIO}${corpo}${conferencia(VERSAO_DESAFIO + corpo + nome)}${nome}`;
}

/** Participante a partir do código (null: formato, conferência, palpite, horário ou apelido inválidos). */
export function decodificarDesafio(codigo: string | null | undefined, nomes: readonly string[] = []): Participante | null {
  const t = (codigo ?? '').trim();
  const m = RE_CODIGO.exec(t);
  if (!m) return null;
  const [, id, a36, t36, soma, nome64] = m;
  if (conferencia(VERSAO_DESAFIO + id + a36 + t36 + nome64) !== soma) return null;
  const a = parseInt(a36, 36);
  const em = EPOCA_DESAFIO + parseInt(t36, 36) * MINUTO;
  if (!palpiteValido(a) || !minutoValido(em)) return null;
  const bytes = deBase64Url(nome64);
  if (!bytes) return null;
  let apelido: string;
  try {
    apelido = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (!apelidoAceito(apelido, nomes)) return null;
  return { id, apelido, a, em };
}

/** Participante no hash da rota ("#1abcde…"); null sem hash ou inválido. */
export const desafioDoHash = (hash: string | null | undefined, nomes: readonly string[] = []): Participante | null =>
  decodificarDesafio((hash ?? '').replace(/^#/, ''), nomes);

/** true quando o hash traz ALGO que não é um desafio válido (link cortado → aviso). */
export const hashDesafioInvalido = (hash: string | null | undefined, nomes: readonly string[] = []): boolean => {
  const t = (hash ?? '').replace(/^#/, '').trim();
  return t.length > 0 && decodificarDesafio(t, nomes) === null;
};

/** Rota do link de desafio de um participante (o código só depois do "#"); null se não der para codificar. */
export function caminhoDesafio(p: Participante, nomes: readonly string[] = []): string | null {
  const c = codificarDesafio(p, nomes);
  return c ? `${CAMINHO_DESAFIO}#${c}` : null;
}

/** Id novo (5 caracteres base 36). `aleatorio` (0 ≤ x < 1) só nos testes. */
export function novoIdDesafio(aleatorio?: () => number): string {
  let n: number;
  if (aleatorio) n = Math.floor(aleatorio() * 36 ** 5);
  else {
    try {
      n = crypto.getRandomValues(new Uint32Array(1))[0] % 36 ** 5;
    } catch {
      n = Math.floor(Math.random() * 36 ** 5);
    }
  }
  return Math.min(36 ** 5 - 1, Math.max(0, n)).toString(36).padStart(5, '0');
}

// ---- armazenamento (só no aparelho) -----------------------------------------------------------------------------------

function armazenamentoPadrao(): Armazenamento | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

const participanteValido = (x: unknown): x is ParticipanteSalvo => {
  const p = x as Partial<ParticipanteSalvo> | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    RE_ID.test(p.id) &&
    palpiteValido(p.a) &&
    typeof p.em === 'number' &&
    minutoValido(p.em) &&
    typeof p.recebidoEm === 'number' &&
    Number.isFinite(p.recebidoEm) &&
    p.recebidoEm > 0 &&
    apelidoAceito(p.apelido)
  );
};

/** O desafio deste aparelho (vazio: nada guardado, formato desconhecido ou armazenamento bloqueado). */
export function lerDesafio(arm: Armazenamento | null = armazenamentoPadrao()): EstadoDesafio {
  try {
    const bruto = arm?.getItem(CHAVE_DESAFIO);
    if (!bruto) return DESAFIO_VAZIO;
    const o = JSON.parse(bruto) as { v?: unknown; eu?: { id?: unknown; n?: unknown } | null; p?: unknown };
    if (o?.v !== 1) return DESAFIO_VAZIO;
    const eu = o.eu && typeof o.eu.id === 'string' && RE_ID.test(o.eu.id) && apelidoAceito(o.eu.n) ? { id: o.eu.id, apelido: o.eu.n } : null;
    const vistos = new Set<string>(eu ? [eu.id] : []);
    const participantes: ParticipanteSalvo[] = [];
    for (const x of Array.isArray(o.p) ? o.p : []) {
      const r = x as { id?: unknown; n?: unknown; a?: unknown; em?: unknown; r?: unknown } | null;
      const p = { id: r?.id, apelido: r?.n, a: r?.a, em: r?.em, recebidoEm: r?.r };
      if (!participanteValido(p) || vistos.has(p.id)) continue;
      vistos.add(p.id);
      participantes.push(p);
      if (participantes.length >= MAX_PARTICIPANTES) break;
    }
    return { eu, participantes };
  } catch {
    return DESAFIO_VAZIO;
  }
}

/** Guarda o desafio; false se o armazenamento recusar (modo privado, cota) — a página segue, sem lembrar. */
export function gravarDesafio(e: EstadoDesafio, arm: Armazenamento | null = armazenamentoPadrao()): boolean {
  if (!arm) return false;
  try {
    if (!e.eu && e.participantes.length === 0) {
      arm.removeItem(CHAVE_DESAFIO);
      return true;
    }
    arm.setItem(
      CHAVE_DESAFIO,
      JSON.stringify({
        v: 1,
        eu: e.eu ? { id: e.eu.id, n: e.eu.apelido } : null,
        p: e.participantes.slice(0, MAX_PARTICIPANTES).map((p) => ({ id: p.id, n: p.apelido, a: p.a, em: p.em, r: Math.round(p.recebidoEm) })),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function apagarDesafio(arm: Armazenamento | null = armazenamentoPadrao()): void {
  try {
    arm?.removeItem(CHAVE_DESAFIO);
  } catch {
    /* nada a fazer */
  }
}

// ---- operações ------------------------------------------------------------------------------------------------------------

/**
 * O que aconteceu ao abrir um link de desafio:
 *  'novo' (entrou), 'atualizado' (mesma pessoa, palpite mais recente ou outro apelido), 'igual' (nada mudou),
 *  'antigo' (link com um palpite mais velho que o guardado: ignorado), 'eu' (o próprio link), 'cheio' (já há
 *  MAX_PARTICIPANTES), 'prazo' (quem já estava no desafio não muda depois das 23h59 de 24/10).
 */
export type ResultadoInclusao = 'novo' | 'atualizado' | 'igual' | 'antigo' | 'eu' | 'cheio' | 'prazo';

export function incluirParticipante(e: EstadoDesafio, p: Participante, agora: number): { estado: EstadoDesafio; resultado: ResultadoInclusao } {
  if (e.eu && p.id === e.eu.id) return { estado: e, resultado: 'eu' };
  const i = e.participantes.findIndex((x) => x.id === p.id);
  if (i >= 0) {
    const x = e.participantes[i];
    if (x.a === p.a && x.em === p.em && x.apelido === p.apelido) return { estado: e, resultado: 'igual' };
    if (agora >= FIM_PALPITES) return { estado: e, resultado: 'prazo' };
    if (p.em < x.em) return { estado: e, resultado: 'antigo' };
    const participantes = e.participantes.slice();
    participantes[i] = { ...p, recebidoEm: x.recebidoEm };
    return { estado: { ...e, participantes }, resultado: 'atualizado' };
  }
  if (e.participantes.length >= MAX_PARTICIPANTES) return { estado: e, resultado: 'cheio' };
  return { estado: { ...e, participantes: [...e.participantes, { ...p, recebidoEm: agora }] }, resultado: 'novo' };
}

export const removerParticipante = (e: EstadoDesafio, id: string): EstadoDesafio => ({ ...e, participantes: e.participantes.filter((p) => p.id !== id) });

/** Define (ou troca) o apelido da própria pessoa; o id se mantém (quem já tem o link dela é atualizado pelo novo). */
export function definirEu(e: EstadoDesafio, apelido: string, id: string = e.eu?.id ?? novoIdDesafio()): EstadoDesafio {
  return { eu: { id, apelido }, participantes: e.participantes.filter((p) => p.id !== id) };
}

/** Participante "eu" para o link: o apelido e o palpite cravado neste aparelho (null se faltar algum). */
export function euParticipante(e: EstadoDesafio, meu: Palpite | null): Participante | null {
  if (!e.eu || !meu || !palpiteValido(meu.a)) return null;
  const em = Math.floor(meu.em / MINUTO) * MINUTO;
  if (!minutoValido(em)) return null;
  return { id: e.eu.id, apelido: e.eu.apelido, a: meu.a, em };
}

// ---- o que a tela mostra -----------------------------------------------------------------------------------------------

/** Linha da lista ANTES do resultado: quem cravou e quando — NENHUM número de palpite (Lei 9.504/97, art. 33, § 5º). */
export interface ItemLista {
  id: string;
  /** '' = a própria pessoa ainda sem apelido (a tela diz "Você") */
  apelido: string;
  eu: boolean;
  /** quando cravou (null = ainda não cravou: só a própria pessoa) */
  cravouEm: number | null;
  /** link aberto neste aparelho depois do prazo (23h59 de 24/10) */
  tarde: boolean;
}

/** Linha do ranking (só com a apuração oficial concluída). */
export interface ItemRanking extends ItemLista {
  cravouEm: number;
  a: number;
  /** diferença em p.p. para o resultado oficial, 1 casa (o número exibido) */
  erro: number;
  naMosca: boolean;
  /** 1 = mais perto; empate na diferença E no minuto do palpite = mesma posição */
  posicao: number;
  empate: boolean;
}

export type VisaoDesafio = { tipo: 'lista'; itens: ItemLista[] } | { tipo: 'ranking'; itens: ItemRanking[]; foraDoRanking: ItemLista[]; pctSecoes: number };

const comparaApelido = (x: string, y: string) => x.localeCompare(y, 'pt-BR', { sensitivity: 'base' }) || x.localeCompare(y, 'pt-BR');

/** Ordem alfabética (pt-BR, sem diferença de caixa e acento; desempate estável pelo id). */
export function ordemAlfabetica<T extends { apelido: string; id: string }>(itens: readonly T[]): T[] {
  return itens.slice().sort((x, y) => comparaApelido(x.apelido, y.apelido) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/**
 * Ranking pelo erro (1 casa, o número que a tela mostra), desempate pelo minuto em que cada um cravou (quem cravou
 * antes fica à frente); mesmo erro e mesmo minuto = mesma posição. Ordem estável pelo apelido.
 */
export function ranking<T extends ItemLista & { a: number; cravouEm: number }>(itens: readonly T[], pct0: number): (T & ItemRanking)[] {
  const av = itens.map((x) => ({ ...x, ...avaliarPalpite(x.a, pct0), minuto: Math.floor(x.cravouEm / MINUTO) }));
  av.sort((x, y) => x.erro - y.erro || x.minuto - y.minuto || comparaApelido(x.apelido, y.apelido) || (x.id < y.id ? -1 : 1));
  const out: (T & ItemRanking)[] = [];
  av.forEach((x, i) => {
    const ant = av[i - 1];
    const prox = av[i + 1];
    const igual = (o: typeof x | undefined) => !!o && o.erro === x.erro && o.minuto === x.minuto;
    const posicao = igual(ant) ? out[i - 1].posicao : i + 1;
    const { minuto: _m, ...resto } = x;
    out.push({ ...(resto as unknown as T), erro: x.erro, naMosca: x.naMosca, posicao, empate: igual(ant) || igual(prox) });
  });
  return out;
}

/**
 * O que a seção do desafio mostra: 'lista' (antes do resultado: alfabética, sem número de ninguém) ou 'ranking' (com a
 * apuração oficial do TSE concluída: `oficial.final`). A própria pessoa entra quando tem apelido ou palpite.
 */
export function visaoDesafio(e: EstadoDesafio, meu: Palpite | null, oficial: ResultadoOficial | null): VisaoDesafio {
  const tarde = (r: number) => r >= FIM_PALPITES;
  const eu = e.eu || meu ? { id: e.eu?.id ?? '', apelido: e.eu?.apelido ?? '', eu: true, cravouEm: meu ? meu.em || FIM_PALPITES - 1 : null, tarde: false, a: meu?.a ?? null } : null;
  const outros = e.participantes.map((p) => ({ id: p.id, apelido: p.apelido, eu: false, cravouEm: p.em, tarde: tarde(p.recebidoEm), a: p.a as number | null }));
  const todos = eu ? [eu, ...outros] : outros;
  if (!oficial?.final) {
    // a lista NÃO leva o palpite: só quem cravou e quando
    return { tipo: 'lista', itens: ordemAlfabetica(todos.map(({ id, apelido, eu: ehEu, cravouEm, tarde: t }) => ({ id, apelido, eu: ehEu, cravouEm, tarde: t }))) };
  }
  const comPalpite = todos.filter((x): x is typeof x & { a: number; cravouEm: number } => x.a !== null && x.cravouEm !== null);
  const sem = todos.filter((x) => x.a === null || x.cravouEm === null).map(({ id, apelido, eu: ehEu, cravouEm, tarde: t }) => ({ id, apelido, eu: ehEu, cravouEm, tarde: t }));
  return { tipo: 'ranking', itens: ranking(comPalpite, oficial.pct0), foraDoRanking: sem, pctSecoes: oficial.pctSecoes };
}

// ---- textos (neutros, sem nome de candidato, sem valor nem prêmio) ----------------------------------------------------------

export const HASHTAGS_DESAFIO = ['Eleições2026', 'SegundoTurno'];
export const NOME_ARQUIVO_RANKING = 'sintonia-desafio-do-palpite-ranking';
/** Marca do desafio em toda a interface. */
export const SEM_DINHEIRO = 'Sem dinheiro, só pela graça';

function primeiroQueCabe(tentativas: string[]): string {
  for (const t of tentativas) if (pesoTextoX(t) <= LIMITE_TEXTO) return t;
  return limitarTexto(tentativas[tentativas.length - 1]);
}

/** Mensagem que acompanha o link de desafio (WhatsApp primeiro). Sem nome de candidato nem o palpite. */
export function textoConviteDesafio(apelido: string): string {
  return primeiroQueCabe([
    `${apelido} te desafiou no palpite do 2º turno do Sintonia: crave o seu até as 23h59 de 24/10 e mande o seu link de volta. Com o resultado oficial do TSE, sai quem chegou mais perto. ${SEM_DINHEIRO}.`,
    `${apelido} te desafiou no palpite do 2º turno: crave o seu até 24/10 e mande o seu link de volta. O ranking sai com o resultado oficial do TSE. ${SEM_DINHEIRO}.`,
  ]);
}

/** "0,4 p.p." */
export const fmtErro = (pp: number) => `${fmtDecimal(pp, 1)} p.p.`;

/** Texto do cartão do ranking: as primeiras posições que couberem, sem nome de candidato. */
export function textoRankingDesafio(itens: readonly Pick<ItemRanking, 'apelido' | 'eu' | 'posicao' | 'erro' | 'naMosca'>[]): string {
  const nome = (x: (typeof itens)[number]) => x.apelido || 'Eu';
  const linha = (x: (typeof itens)[number]) => `${x.posicao}º ${nome(x)} (${x.naMosca ? `na mosca, ${fmtErro(x.erro)}` : fmtErro(x.erro)})`;
  const cabeca = 'Ranking do desafio do palpite do 2º turno, comparado com o resultado oficial do TSE:';
  const tentativas: string[] = [];
  for (let n = Math.min(itens.length, 5); n >= 1; n--) {
    const lista = itens.slice(0, n).map(linha).join(', ');
    const mais = itens.length > n ? ` e mais ${itens.length - n}` : '';
    tentativas.push(`${cabeca} ${lista}${mais}. ${SEM_DINHEIRO}.`, `${cabeca} ${lista}${mais}.`);
  }
  if (!tentativas.length) tentativas.push(`Desafio do palpite do 2º turno no Sintonia. ${SEM_DINHEIRO}.`);
  return primeiroQueCabe(tentativas);
}

/**
 * Aviso depois de abrir um link de desafio (o apelido é o de quem mandou). `jaTinha`: a pessoa já tinha o próprio desafio
 * neste aparelho (apelido escolhido) — quem só recebeu o link não "tem um desafio" ainda: o aviso a convida a cravar.
 */
export function avisoInclusao(r: ResultadoInclusao, apelido: string, tarde: boolean, jaTinha = true): { texto: string; tom: 'ok' | 'info' | 'alerta' } {
  switch (r) {
    case 'novo':
      if (tarde)
        return { texto: `${apelido} está no seu desafio neste aparelho. O link foi aberto depois do prazo (23h59 de 24/10): o ranking mostra essa marca.`, tom: 'info' };
      return jaTinha
        ? { texto: `${apelido} entrou no seu desafio neste aparelho. Os palpites aparecem com o resultado oficial do TSE.`, tom: 'ok' }
        : { texto: `${apelido} está no seu desafio neste aparelho. Crave o seu palpite e mande o seu link de volta.`, tom: 'ok' };
    case 'atualizado':
      return { texto: `O palpite de ${apelido} foi atualizado neste aparelho.`, tom: 'ok' };
    case 'igual':
    case 'antigo':
      return { texto: `${apelido} já está no seu desafio.`, tom: 'info' };
    case 'eu':
      return { texto: 'Este é o seu próprio link de desafio. Mande para os amigos: quem abrir entra no desafio.', tom: 'info' };
    case 'cheio':
      return { texto: `Seu desafio já tem ${MAX_PARTICIPANTES} participantes neste aparelho. Remova alguém para incluir ${apelido}.`, tom: 'alerta' };
    case 'prazo':
      return { texto: `Este link chegou depois do prazo (23h59 de 24/10): vale o palpite de ${apelido} que já estava neste aparelho.`, tom: 'alerta' };
  }
}
