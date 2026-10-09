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
 *  - Municípios: grafia oficial do IBGE (`nomeMunicipio`) sempre que ela for o MESMO nome do TSE a menos de acentos,
 *    caixa e separadores ("LUIS CORREIA" → "Luís Correia", "OLHOS D'ÁGUA" → "Olhos-d'Água", "PIO XII"); nomes
 *    realmente diferentes (ex.: TSE "BOA SAÚDE" × IBGE "Januário Cicco") ficam como no TSE, que é o nome do título
 *    de eleitor e o da apuração oficial.
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
  // Vice de Maria do Carmo (AM): nome de urna "CORONEL ANIBAL"; o TSE (notícia de 05/10/2026) e a imprensa grafam
  // "Coronel Aníbal" (nome civil Mário Aníbal Gomes da Costa Júnior; o feed traz "MARIO ANIBAL ..." sem acentos).
  ANIBAL: 'Aníbal',
  // Vice de Mailza Assis (AC): nome de urna "JESSICA SALES"; como deputada federal (Câmara, id 178839) o nome
  // parlamentar/eleitoral é "Jéssica Sales" (o nome civil "JESSICA ROJAS SALES" não tem acento — não exibimos).
  JESSICA: 'Jéssica',
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
  'DAR ES SALAAM': 'Dar es Salaam',
  // Nome real da cidade argentina (fronteira com Uruguaiana); o feed abrevia "PASO LOS LIBRES".
  'PASO LOS LIBRES': 'Paso de los Libres',
  // St. John's (Antígua e Barbuda); o feed perde o apóstrofo.
  'SAINT JOHNS': "Saint John's",
  // Saint-Georges-de-l'Oyapock (Guiana Francesa), grafia do vice-consulado brasileiro; o feed traz "ST GEORGES DE LOYAPOCK".
  'ST GEORGES DE LOYAPOCK': "Saint-Georges de l'Oyapock",
  // O feed desambigua com o país no nome; o país vai em `pais` (lib/exterior.ts).
  'KINGSTON-JAMAICA': 'Kingston',
};

/** Numerais romanos em nomes ("PIO XII", "PEDRO II", "PIO IX"): titleCasePt os deixaria "Xii", "Ii", "Ix". */
const ROMANO = /^(?=[ivx]{2,}$)x{0,3}(?:ix|iv|v?i{0,3})$/i;

/** Nome de município/cidade: "OLHO D'ÁGUA DO BORGES" → "Olho d'Água do Borges"; "SÃO JOÃO DEL REI" → "São João del Rei". */
export function nomeLugar(nm: string): string {
  const bruto = limpar(nm);
  if (CORRECOES_LUGAR[bruto]) return CORRECOES_LUGAR[bruto];
  return ajustarApostrofos(titleCasePt(bruto))
    .split(' ')
    .map((w, i) => {
      if (ROMANO.test(w)) return w.toUpperCase();
      return i > 0 && PARTICULAS_LUGAR.has(w.toLowerCase()) ? w.toLowerCase() : w;
    })
    .join(' ');
}

/** Chave de comparação de grafias: sem acentos, sem caixa e sem separadores (espaço, hífen, apóstrofo). */
export const chaveGrafia = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s\-'’`´]/g, '');

/**
 * A partícula "d'" fica sempre minúscula no meio do nome. O IBGE é inconsistente ("Santa Bárbara d'Oeste" ×
 * "Alta Floresta D'Oeste", "Pau D'Arco"); a forma minúscula é a ortográfica e a que já usamos nos demais.
 */
const dMinusculo = (s: string) => s.replace(/([\s-])D'(\p{L})/gu, (_, pre: string, c: string) => `${pre}d'${c.toUpperCase()}`);

export type OrigemNome = 'ibge' | 'tse' | 'tse-divergente';

/**
 * Nome de exibição de um município brasileiro.
 *  - Se o nome oficial do IBGE for o mesmo nome do TSE a menos de acentos, caixa e separadores, usa a grafia do IBGE
 *    (com "d'" minúsculo): corrige acentos que o TSE omite ou erra, hífens oficiais e numerais romanos.
 *  - Se forem nomes diferentes (ex.: "Boa Saúde" × "Januário Cicco", "Dona Eusébia" × "Dona Euzébia"), mantém o TSE
 *    e devolve origem 'tse-divergente' para o relatório do build.
 *  - Sem nome do IBGE: o do TSE.
 */
export function nomeMunicipio(nmTse: string, nomeIbge: string | undefined): { nome: string; origem: OrigemNome } {
  const tse = nomeLugar(nmTse);
  if (!nomeIbge) return { nome: tse, origem: 'tse' };
  if (chaveGrafia(nomeIbge) !== chaveGrafia(tse)) return { nome: tse, origem: 'tse-divergente' };
  return { nome: dMinusculo(limpar(nomeIbge)), origem: 'ibge' };
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
