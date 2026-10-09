/**
 * Códigos do Teste Cego — tudo acontece no navegador (LGPD, ARCHITECTURE §1.3).
 *
 * Formato v1 (11 caracteres base36, minúsculos): "1" + semente(5) + respostas(5)
 *  - semente: inteiro em [0, 36^5). Define a ordem dos temas e o lado de cada proposta (`rodadas(seed)`).
 *  - respostas: as 12 escolhas em base 4, NA ORDEM DAS RODADAS daquela semente:
 *      0 = proposta da 1ª posição · 1 = proposta da 2ª posição · 2 = nenhuma das duas · 3 = tanto faz.
 *    Como a posição é sorteada pela semente, o código não carrega "13"/"22" literalmente. Não é criptografia:
 *    quem tem o app consegue decodificar — por isso as respostas viajam sempre DEPOIS do "#" da URL, parte que
 *    o navegador nunca envia a servidor algum.
 *
 * Onde cada parte vive:
 *  - teste em andamento:  /teste?s=<semente>             (a semente não é dado pessoal)
 *  - resultado:           /teste/resultado#<código>
 *  - duelo:               /duelo/<desafio>#<respostas>   (desafio = "1" + semente; aceita também o código inteiro no caminho)
 */

/** Escolha numa rodada (ver cabeçalho). */
export type Escolha = 0 | 1 | 2 | 3;
export const NENHUMA: Escolha = 2;
export const TANTO_FAZ: Escolha = 3;
export const N_RODADAS = 12;

const VERSAO = '1';
const LARG_SEMENTE = 5;
const LARG_RESP = 5;
const MAX_SEMENTE = 36 ** LARG_SEMENTE; // 60.466.176
const MAX_RESP = 4 ** N_RODADAS; // 16.777.216 (< 36^5)
const B36 = /^[0-9a-z]+$/;

export interface CodigoTeste {
  seed: number;
  respostas: Escolha[];
}

export const ehEscolha = (v: unknown): v is Escolha => v === 0 || v === 1 || v === 2 || v === 3;

/** Semente aleatória (crypto quando disponível). Nunca deriva de nada pessoal. */
export function novaSemente(): number {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] % MAX_SEMENTE;
  } catch {
    return Math.floor(Math.random() * MAX_SEMENTE);
  }
}

export function sementeParaTexto(seed: number): string {
  return (Math.max(0, Math.floor(seed)) % MAX_SEMENTE).toString(36).padStart(LARG_SEMENTE, '0');
}

/** "k3f9a" → número; null se inválido. */
export function textoParaSemente(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t.length !== LARG_SEMENTE || !B36.test(t)) return null;
  const n = parseInt(t, 36);
  return Number.isFinite(n) && n >= 0 && n < MAX_SEMENTE ? n : null;
}

export function codificarRespostas(respostas: readonly Escolha[]): string {
  if (respostas.length !== N_RODADAS || !respostas.every(ehEscolha)) throw new Error('respostas incompletas');
  let n = 0;
  for (const r of respostas) n = n * 4 + r;
  return n.toString(36).padStart(LARG_RESP, '0');
}

export function decodificarRespostas(s: string | null | undefined): Escolha[] | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t.length !== LARG_RESP || !B36.test(t)) return null;
  let n = parseInt(t, 36);
  if (!Number.isFinite(n) || n < 0 || n >= MAX_RESP) return null;
  const out: Escolha[] = new Array(N_RODADAS);
  for (let i = N_RODADAS - 1; i >= 0; i--) {
    out[i] = (n % 4) as Escolha;
    n = Math.floor(n / 4);
  }
  return out;
}

/** Código do desafio (vai no caminho do Duelo): versão + semente. Não contém respostas. */
export function codigoDesafio(seed: number): string {
  return VERSAO + sementeParaTexto(seed);
}

/** Código completo (vai depois do "#"). */
export function codificar(seed: number, respostas: readonly Escolha[]): string {
  return codigoDesafio(seed) + codificarRespostas(respostas);
}

/** Decodifica o código completo de 11 caracteres; null se inválido. */
export function decodificar(codigo: string | null | undefined): CodigoTeste | null {
  if (!codigo) return null;
  const t = codigo.trim().replace(/^#/, '').toLowerCase();
  if (t.length !== 1 + LARG_SEMENTE + LARG_RESP || t[0] !== VERSAO) return null;
  const seed = textoParaSemente(t.slice(1, 1 + LARG_SEMENTE));
  const respostas = decodificarRespostas(t.slice(1 + LARG_SEMENTE));
  return seed === null || !respostas ? null : { seed, respostas };
}

/** Semente a partir do código do desafio ("1" + semente). */
export function decodificarDesafio(desafio: string | null | undefined): number | null {
  if (!desafio) return null;
  const t = desafio.trim().toLowerCase();
  if (t.length !== 1 + LARG_SEMENTE || t[0] !== VERSAO) return null;
  return textoParaSemente(t.slice(1));
}

/**
 * Lê o Duelo a partir do parâmetro de rota e do hash: `/duelo/<desafio>#<respostas>` (padrão) ou
 * `/duelo/<código completo>` (aceito por robustez).
 */
export function lerDuelo(param: string | undefined, hash: string | undefined): CodigoTeste | null {
  const h = (hash ?? '').replace(/^#/, '').trim();
  const completo = decodificar(param);
  if (completo) return completo;
  const seed = decodificarDesafio(param);
  if (seed === null) return decodificar(h); // hash com o código inteiro
  const respostas = decodificarRespostas(h) ?? decodificar(h)?.respostas ?? null;
  return respostas ? { seed, respostas } : null;
}

/** Caminho (rota do app) do resultado. */
export const caminhoResultado = (seed: number, respostas: readonly Escolha[]) => `/teste/resultado#${codificar(seed, respostas)}`;

/** Caminho (rota do app) do Duelo: as respostas vão depois do "#". */
export const caminhoDuelo = (seed: number, respostas: readonly Escolha[]) =>
  `/duelo/${codigoDesafio(seed)}#${codificarRespostas(respostas)}`;

/** Caminho do teste com a semente (reproduz a mesma ordem). */
export const caminhoTeste = (seed: number) => `/teste?s=${sementeParaTexto(seed)}`;
