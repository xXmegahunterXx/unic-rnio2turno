/**
 * Rotas e códigos do Teste Cego (formato v2: afirmações únicas com escala de concordância).
 * Tudo acontece no navegador (LGPD, ARCHITECTURE §1.3). O formato do código é o de `content/afirmacoes.ts`:
 *
 *   "2" + semente(5) + respostas(24)  — 30 caracteres [0-9a-z]
 *
 * Onde cada parte vive:
 *  - teste em andamento:  /teste?s=<semente>[&r=1]            (a semente só define a ordem; r=1 = modo rápido)
 *  - resultado:           /teste/resultado#<código>
 *  - duelo:               /duelo/<"2" + semente>#<respostas>  (aceita também o código inteiro no caminho ou no hash)
 *
 * As respostas viajam SEMPRE depois do "#": o navegador nunca envia essa parte a servidor algum.
 *
 * Compatibilidade: o formato v1 (teste de pares, "1" + 10 caracteres) não é mais aceito. Links antigos são
 * reconhecidos por `ehCodigoV1`/`ehDueloV1` só para mostrar uma tela amigável ("refaça o teste").
 */
import {
  codificar,
  codificarRespostas,
  decodificar,
  decodificarRespostas,
  novaSemente,
  sementeParaTexto,
  textoParaSemente,
  VERSAO_CODIGO,
  type CodigoSintonia,
  type Respostas,
} from '@/app/content/afirmacoes';

export { codificar, decodificar, novaSemente, sementeParaTexto, textoParaSemente, type CodigoSintonia };

const LARG_SEMENTE = 5;
const B36 = /^[0-9a-z]+$/;

const limpar = (s: string | null | undefined) => (s ?? '').trim().replace(/^#/, '').toLowerCase();

/** Código do desafio (vai no caminho do Duelo): versão + semente. Não contém respostas. */
export const codigoDesafio = (seed: number) => VERSAO_CODIGO + sementeParaTexto(seed);

/** Semente a partir do código do desafio ("2" + semente); null se inválido ou de outra versão. */
export function decodificarDesafio(desafio: string | null | undefined): number | null {
  const t = limpar(desafio);
  if (t.length !== 1 + LARG_SEMENTE || t[0] !== VERSAO_CODIGO) return null;
  return textoParaSemente(t.slice(1));
}

/**
 * Lê o Duelo a partir do parâmetro de rota e do hash: `/duelo/<desafio>#<respostas>` (padrão),
 * `/duelo/<desafio>#<código inteiro>` ou `/duelo/<código inteiro>`.
 */
export function lerDuelo(param: string | undefined, hash: string | undefined): CodigoSintonia | null {
  const completo = decodificar(param);
  if (completo) return completo;
  const h = limpar(hash);
  const seed = decodificarDesafio(param);
  if (seed === null) return decodificar(h);
  const resp = decodificarRespostas(h) ?? decodificar(h);
  return resp ? { seed, respostas: resp.respostas, importantes: resp.importantes } : null;
}

/** Código do formato v1 (teste de pares): "1" + semente(5) + respostas(5). */
export function ehCodigoV1(s: string | null | undefined): boolean {
  const t = limpar(s);
  return t.length === 11 && t[0] === '1' && B36.test(t);
}

/** Link de Duelo do formato v1: `/duelo/1xxxxx#yyyyy` ou `/duelo/<código v1>`. */
export function ehDueloV1(param: string | undefined, hash: string | undefined): boolean {
  const p = limpar(param);
  if (ehCodigoV1(p)) return true;
  return p.length === 1 + LARG_SEMENTE && p[0] === '1' && B36.test(p) && (limpar(hash).length === 5 || ehCodigoV1(hash));
}

/** Caminho (rota do app) do resultado. */
export const caminhoResultado = (seed: number, respostas: Respostas, importantes: Iterable<string> = []) =>
  `/teste/resultado#${codificar(seed, respostas, importantes)}`;

/** Caminho (rota do app) do Duelo: as respostas vão depois do "#". */
export const caminhoDuelo = (seed: number, respostas: Respostas, importantes: Iterable<string> = []) =>
  `/duelo/${codigoDesafio(seed)}#${codificarRespostas(respostas, importantes)}`;

/** Caminho do teste com a semente (reproduz a mesma ordem). `rapido` = modo rápido (12 afirmações, `&r=1`). */
export const caminhoTeste = (seed: number, rapido = false) => `/teste?s=${sementeParaTexto(seed)}${rapido ? '&r=1' : ''}`;
