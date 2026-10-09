/**
 * Nomes de exibição a partir do feed do TSE (que publica tudo em CAIXA ALTA e, às vezes, sem acento).
 *
 * Regras:
 *  - Base: `titleCasePt` (src/shared/format.ts), o mesmo usado no app.
 *  - Ajustes de apóstrofo: "D'água" → "d'Água", "Sant'ana" → "Sant'Ana" (titleCasePt só trata a–z sem acento).
 *  - Pessoas: tabela EXPLÍCITA e pequena de correções de acento (`CORRECOES_PESSOA`), aplicada palavra a palavra.
 *    Só entram correções verificadas (a grafia com acento é a usada pelo próprio candidato e/ou pelo TSE em
 *    outro campo — ex.: o nome de urna "CELINA LEÃO" vs. o nome completo "CELINA LEAO ..."). Nunca "adivinhe":
 *    nomes civis podem legitimamente não ter acento.
 *  - Coligações: título com partículas em minúsculas ("Brasil Pronto pra Mais", "Mudar é Urgente"),
 *    siglas de UF preservadas ("DF do Povo") e apóstrofos soltos removidos (o feed traz "ESPERANÇA E TRABALHO'").
 *  - Composição: siglas como no feed, com a grafia oficial do PCdoB.
 */
import { titleCasePt } from '../../../src/shared/format';
import { UFS } from '../../../src/shared/types';

/**
 * Correções de acentuação em nomes de pessoas (chave = palavra em CAIXA ALTA como vem do feed).
 *  - FLAVIO → Flávio: Flávio Bolsonaro (nome de urna e nome civil vêm sem acento no feed).
 *  - JOSE → José: Omar Aziz (nome civil "OMAR JOSE ABDELAZIZ" no feed → "Omar José Abdelaziz").
 *  - LEAO → Leão: Celina Leão (o próprio feed traz "LEÃO" no nome de urna e "LEAO" no nome completo).
 */
export const CORRECOES_PESSOA: Readonly<Record<string, string>> = {
  FLAVIO: 'Flávio',
  JOSE: 'José',
  LEAO: 'Leão',
};

/** Ajustes pós-titleCasePt: titleCasePt só reconhece a–z sem acento depois do apóstrofo. */
function ajustarApostrofos(s: string): string {
  return (
    s
      // "Olho-D'água" → "Olho-d'Água" (partícula d' no meio do nome fica minúscula, a palavra seguinte maiúscula)
      .replace(/([\s-])D'(\p{L})/gu, (_, pre: string, c: string) => `${pre}d'${c.toUpperCase()}`)
      // "Sant'ana" → "Sant'Ana"
      .replace(/(\p{L})'(\p{Ll})/gu, (_, a: string, c: string) => `${a}'${c.toUpperCase()}`)
  );
}

const limpar = (s: string) => s.trim().replace(/\s+/g, ' ');

/**
 * Partículas que titleCasePt não baixa, mas que aparecem no meio de nomes de lugar
 * ("São João del Rei", "Morro Cabeça no Tempo", "Ciudad del Este", "Port of Spain").
 * 'la' fica de fora de propósito: "Senador La Rocque" (MA) é sobrenome.
 */
const PARTICULAS_LUGAR = new Set(['del', 'no', 'na', 'nos', 'nas', 'of']);

/**
 * Grafias explícitas (chave = nome exato do feed). Cidades do exterior que o feed publica sem acento em
 * português e o único caso de partícula espanhola que não dá para tratar por regra. O nome não é traduzido.
 */
export const CORRECOES_LUGAR: Readonly<Record<string, string>> = {
  MEXICO: 'México',
  PANAMA: 'Panamá',
  NICOSIA: 'Nicósia',
  'SANTA CRUZ DE LA SIERRA': 'Santa Cruz de la Sierra',
};

/** Nome de município/cidade: "OLHO D'ÁGUA DO BORGES" → "Olho d'Água do Borges"; "SÃO JOÃO DEL REI" → "São João del Rei". */
export function nomeLugar(nm: string): string {
  const bruto = limpar(nm);
  if (CORRECOES_LUGAR[bruto]) return CORRECOES_LUGAR[bruto];
  return ajustarApostrofos(titleCasePt(bruto))
    .split(' ')
    .map((w, i) => (i > 0 && PARTICULAS_LUGAR.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(' ');
}

/** Nome de pessoa (nome de urna ou completo), com a tabela de correções de acento. */
export function nomePessoa(nm: string): string {
  return ajustarApostrofos(titleCasePt(limpar(nm)))
    .split(' ')
    .map((w) => CORRECOES_PESSOA[w.toLocaleUpperCase('pt-BR')] ?? w)
    .join(' ');
}

const PARTICULAS = new Set([
  'a', 'à', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'é', 'em', 'na', 'nas', 'no',
  'nos', 'o', 'os', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'pra', 'pro', 'que', 'um', 'uma',
]);
const SIGLAS_UF = new Set<string>(UFS);

/** Nome de coligação/federação: "MUDAR É URGENTE" → "Mudar é Urgente"; "DF DO POVO" → "DF do Povo". */
export function nomeColigacao(nm: string): string {
  // Apóstrofos/aspas soltos nas pontas são anomalia do feed ("ESPERANÇA E TRABALHO'").
  const limpo = limpar(nm).replace(/^['"´`]+|['"´`]+$/g, '').trim();
  return limpo
    .split(' ')
    .map((w, i) => {
      if (SIGLAS_UF.has(w)) return w;
      const lower = w.toLocaleLowerCase('pt-BR');
      if (i > 0 && PARTICULAS.has(lower)) return lower;
      return ajustarApostrofos(titleCasePt(w));
    })
    .join(' ');
}

/** Grafia oficial de siglas que o feed publica em caixa alta. */
const SIGLAS: Readonly<Record<string, string>> = { PCDOB: 'PCdoB', 'PC DO B': 'PCdoB' };
export const sigla = (s: string) => SIGLAS[s.trim().toUpperCase()] ?? s.trim();

/** "PSB / PDT / PCDOB / PT" → "PSB / PDT / PCdoB / PT" */
export function composicao(com: string): string {
  return com
    .split('/')
    .map((p) => sigla(p))
    .filter(Boolean)
    .join(' / ');
}
