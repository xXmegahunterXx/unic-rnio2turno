/**
 * "Desde o 1º turno" (funções puras, sem React): quanto cada finalista variou em relação ao resultado OFICIAL do 1º turno
 * (corrida `-t1`), numa abrangência (Brasil ou UF), em pontos percentuais e em votos.
 *
 *  - Percentual: % dos votos válidos agora − % no 1º turno (no 1º turno o % é sobre TODOS os candidatos, regra do TSE;
 *    por isso os dois tendem a crescer). Vale com a apuração em andamento: é a mesma conta do placar.
 *  - Votos: só onde a comparação é justa — o mesmo eleitorado nos dois turnos. Com a abrangência inteira totalizada,
 *    a diferença é exata (votos agora − votos no 1º turno). Antes disso, soma só as SUBÁREAS (estados no Brasil,
 *    municípios na UF) com 100% das seções totalizadas, e diz quantas são e quanto do eleitorado cobrem. Nunca
 *    projeção nem estimativa: comparar o parcial do 2º turno com o total do 1º daria "perdas" que não existem.
 *  - "Onde cada um cresceu mais que o outro": as subáreas concluídas em que a variação de um finalista mais superou a do
 *    outro (a mesma conta da camada "Desde o 1º turno" do mapa; a variação sozinha só repetiria onde os demais
 *    candidatos eram fortes, porque ali os dois crescem). Simétrico: mesma quantidade e mesmo critério para os dois, com
 *    um piso de eleitorado para não destacar lugares minúsculos.
 *
 * Os candidatos dos dois turnos são casados pelo NÚMERO na urna (o "Outros" do 1º turno fica de fora).
 *
 * Isomórfico: a página da UF soma os municípios que já tem; para o Brasil, o servidor soma os 5.570 municípios
 * (`GET /api/apuracao/:race/br/desde-t1`, src/server/desde-t1.ts → `DesdeT1Agregado`) e o app só usa o resultado.
 */
import type { Race, RaceId, Tally } from './types';
import { pctValidos, validos } from './calc';

/** Contagem de uma área no 2º turno (Summary/MunicipioResumo servem). */
export type ContagemT2 = Pick<Tally, 'votos' | 'secoes' | 'secoesTotalizadas' | 'eleitorado'>;
/** Contagem de uma área no 1º turno (só os votos, na ordem de `raceT1.candidatos`). */
export type ContagemT1 = Pick<Tally, 'votos'>;

export interface DesdeT1Candidato {
  /** Índice em `race.candidatos` (2º turno). */
  indice: number;
  numero: number;
  /** % dos válidos no 1º turno (sobre todos os candidatos); null sem base. */
  pct1: number | null;
  /** % dos válidos agora; null sem votos válidos ainda. */
  pct2: number | null;
  /** pct2 − pct1, em p.p. */
  pp: number | null;
  /** Votos no 1º turno na abrangência inteira. */
  votos1: number;
  /** Votos no 2º turno até agora. */
  votos2: number;
  /** Diferença em votos onde a comparação é justa (ver `base`); null sem nenhuma área concluída. */
  diferenca: number | null;
}

export interface OndeCresceu {
  chave: string;
  /** Nome para exibir (quando quem agregou já sabe; senão o app resolve pela chave). */
  nome?: string;
  /** Variação do candidato ali, em p.p. dos válidos. */
  pp: number;
  /** Quanto a variação dele superou a do outro finalista ali (p.p.) — o critério da ordem. */
  vantagem: number;
  /** Diferença em votos ali (área concluída). */
  votos: number;
}

export interface DesdeT1 {
  candidatos: DesdeT1Candidato[];
  /** Algum voto válido no 2º turno. */
  temVotos: boolean;
  /** A abrangência inteira está com 100% das seções totalizadas. */
  concluida: boolean;
  /** 'tudo' = abrangência concluída (exato); 'parcial' = só as subáreas concluídas; 'nenhuma' = ainda nenhuma. */
  base: 'tudo' | 'parcial' | 'nenhuma';
  /** Subáreas com 100% das seções (e com resultado do 1º turno) e o total de subáreas com seções. */
  areasConcluidas: number;
  areasTotal: number;
  /** Eleitorado das subáreas concluídas e de todas (cobertura da comparação em votos). */
  eleitoradoConcluido: number;
  eleitoradoTotal: number;
  /** Por candidato (mesma ordem de `candidatos`): as subáreas concluídas em que ele mais cresceu (pp). */
  onde: OndeCresceu[][];
}

const concluida = (t: Pick<Tally, 'secoes' | 'secoesTotalizadas'>) => t.secoes > 0 && t.secoesTotalizadas >= t.secoes;

/**
 * A parte "por subárea" da comparação (o que o servidor calcula para o Brasil por município): quantas subáreas estão
 * concluídas, quanto do eleitorado cobrem, a soma das diferenças em votos de cada candidato (índice do 2º turno) nelas
 * e "onde cada um cresceu mais".
 */
export interface DesdeT1Agregado {
  race: RaceId;
  raceT1: RaceId;
  /** Relógio de quem calculou (epoch ms). */
  geradoEm: number;
  areasConcluidas: number;
  areasTotal: number;
  eleitoradoConcluido: number;
  eleitoradoTotal: number;
  /** Por candidato do 2º turno: soma das diferenças em votos nas subáreas concluídas (null: sem par no 1º turno). */
  somas: (number | null)[];
  onde: OndeCresceu[][];
}

export interface AgregarOpcoes {
  /** "Onde cada um cresceu mais": quantas por candidato (padrão 3) e piso de eleitorado (padrão 0). */
  ondeQuantos?: number;
  ondeEleitoradoMin?: number;
  /** Nome de exibição de uma subárea (vai em `onde[].nome`). */
  nome?: (chave: string) => string | undefined;
}

/** Índice no 1º turno de cada candidato do 2º turno (pelo número na urna; -1 sem par). */
const pares = (race: Pick<Race, 'candidatos'>, raceT1: Pick<Race, 'candidatos'>) =>
  race.candidatos.map((c) => raceT1.candidatos.findIndex((x) => !x.agregado && x.numero === c.numero));

/** Soma as subáreas concluídas (ver `DesdeT1Agregado`). Puro. */
export function agregarDesdeT1(
  race: Pick<Race, 'id' | 'candidatos'>,
  raceT1: Pick<Race, 'id' | 'candidatos'>,
  areas2: Readonly<Record<string, ContagemT2 | undefined>> | Iterable<readonly [string, ContagemT2 | undefined]>,
  areas1: Readonly<Record<string, ContagemT1 | undefined>> | ReadonlyMap<string, ContagemT1 | undefined>,
  o: AgregarOpcoes & { geradoEm?: number } = {},
): DesdeT1Agregado {
  const j1 = pares(race, raceT1);
  const somas = race.candidatos.map(() => 0);
  const lugares: OndeCresceu[][] = race.candidatos.map(() => []);
  const de1 = (k: string) => (areas1 instanceof Map ? areas1.get(k) : (areas1 as Record<string, ContagemT1 | undefined>)[k]);
  // objeto comum (chave → contagem) ou qualquer iterável de pares (Map, array)
  const lista: Iterable<readonly [string, ContagemT2 | undefined]> =
    Symbol.iterator in Object(areas2) ? (areas2 as Iterable<readonly [string, ContagemT2 | undefined]>) : Object.entries(areas2 as Record<string, ContagemT2 | undefined>);
  let areasConcluidas = 0;
  let areasTotal = 0;
  let eleitoradoConcluido = 0;
  let eleitoradoTotal = 0;
  for (const [chave, a2] of lista) {
    if (!a2 || a2.secoes <= 0) continue;
    areasTotal++;
    eleitoradoTotal += a2.eleitorado;
    const a1 = de1(chave);
    if (!a1 || !concluida(a2)) continue;
    areasConcluidas++;
    eleitoradoConcluido += a2.eleitorado;
    const comBase = validos(a1) > 0 && validos(a2) > 0;
    const pps = race.candidatos.map((_, i) => (j1[i] >= 0 && comBase ? pctValidos(a2, i) - pctValidos(a1, j1[i]) : null));
    race.candidatos.forEach((_, i) => {
      const j = j1[i];
      if (j < 0) return;
      const dv = (a2.votos[i] ?? 0) - (a1.votos[j] ?? 0);
      somas[i] += dv;
      const pp = pps[i];
      // o "outro" = o maior entre os demais finalistas (no 2º turno, há só um)
      const outros = pps.filter((x, k): x is number => k !== i && x !== null);
      if (pp !== null && outros.length && a2.eleitorado >= (o.ondeEleitoradoMin ?? 0)) {
        lugares[i].push({ chave, pp, vantagem: pp - Math.max(...outros), votos: dv });
      }
    });
  }
  const n = o.ondeQuantos ?? 3;
  return {
    race: race.id,
    raceT1: raceT1.id,
    geradoEm: o.geradoEm ?? 0,
    areasConcluidas,
    areasTotal,
    eleitoradoConcluido,
    eleitoradoTotal,
    somas: somas.map((v, i) => (j1[i] < 0 ? null : v)),
    // maior vantagem primeiro (só onde ele cresceu MAIS que o outro); empate pelos votos e, por fim, pela chave
    onde: lugares.map((l) =>
      l
        .filter((x) => x.vantagem > 0)
        .sort((a, b) => b.vantagem - a.vantagem || b.votos - a.votos || a.chave.localeCompare(b.chave))
        .slice(0, n)
        .map((x) => {
          const nome = o.nome?.(x.chave);
          return nome ? { ...x, nome } : x;
        }),
    ),
  };
}

export interface DesdeT1Entrada {
  race: Pick<Race, 'candidatos'>;
  raceT1: Pick<Race, 'candidatos'>;
  /** A abrangência no 2º turno e no 1º turno. */
  t2: ContagemT2;
  t1: ContagemT1;
  /** Subáreas (chave → contagem) nos dois turnos: estados (Brasil) ou municípios (UF). */
  areas2?: Readonly<Record<string, ContagemT2 | undefined>>;
  areas1?: Readonly<Record<string, ContagemT1 | undefined>>;
  /** Agregado pronto (o do servidor, por município, no Brasil): usado no lugar de `areas2`/`areas1`. */
  agregado?: Pick<DesdeT1Agregado, 'areasConcluidas' | 'areasTotal' | 'eleitoradoConcluido' | 'eleitoradoTotal' | 'somas' | 'onde'> | null;
  /** "Onde cada um cresceu mais": quantas por candidato (padrão 3) e piso de eleitorado (padrão 0). */
  ondeQuantos?: number;
  ondeEleitoradoMin?: number;
}

export function desdePrimeiroTurno(e: DesdeT1Entrada): DesdeT1 {
  const { race, raceT1, t2, t1 } = e;
  const j1 = pares(race, raceT1);
  const tem1 = validos(t1) > 0;
  const tem2 = validos(t2) > 0;
  const fim = concluida(t2);
  const ag =
    e.agregado ??
    agregarDesdeT1({ id: '', candidatos: race.candidatos }, { id: '', candidatos: raceT1.candidatos }, e.areas2 ?? {}, e.areas1 ?? {}, {
      ondeQuantos: e.ondeQuantos,
      ondeEleitoradoMin: e.ondeEleitoradoMin,
    });
  const base: DesdeT1['base'] = fim ? 'tudo' : ag.areasConcluidas > 0 ? 'parcial' : 'nenhuma';

  return {
    candidatos: race.candidatos.map((c, i) => {
      const j = j1[i];
      const pct1 = j >= 0 && tem1 ? pctValidos(t1, j) : null;
      const pct2 = tem2 ? pctValidos(t2, i) : null;
      const votos1 = j >= 0 ? (t1.votos[j] ?? 0) : 0;
      const votos2 = t2.votos[i] ?? 0;
      return {
        indice: i,
        numero: c.numero,
        pct1,
        pct2,
        pp: pct1 !== null && pct2 !== null ? pct2 - pct1 : null,
        votos1,
        votos2,
        diferenca: j < 0 ? null : base === 'tudo' ? votos2 - votos1 : base === 'parcial' ? (ag.somas[i] ?? null) : null,
      };
    }),
    temVotos: tem2,
    concluida: fim,
    base,
    areasConcluidas: ag.areasConcluidas,
    areasTotal: ag.areasTotal,
    eleitoradoConcluido: ag.eleitoradoConcluido,
    eleitoradoTotal: ag.eleitoradoTotal,
    onde: ag.onde,
  };
}
