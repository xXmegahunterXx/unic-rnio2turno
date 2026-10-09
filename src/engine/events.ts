/**
 * Textos dos eventos do feed (pt-BR, neutros e descritivos — ARCHITECTURE.md §1 e §5.2).
 * Sem adjetivos, sem torcida: só o que aconteceu e os números. Nomes de urna de `Race.candidatos`.
 */
import { fmtInt, fmtPct } from '../shared/format';
import type { Race, UF } from '../shared/types';

/** Preposição + artigo para "na Bahia", "no Acre", "em São Paulo". */
const PREP: Record<UF, 'em' | 'no' | 'na'> = {
  AC: 'no', AL: 'em', AM: 'no', AP: 'no', BA: 'na', CE: 'no', DF: 'no', ES: 'no', GO: 'em', MA: 'no',
  MG: 'em', MS: 'em', MT: 'em', PA: 'no', PB: 'na', PE: 'em', PI: 'no', PR: 'no', RJ: 'no', RN: 'no',
  RO: 'em', RR: 'em', RS: 'no', SC: 'em', SE: 'em', SP: 'em', TO: 'no', ZZ: 'no',
};

/** "na Bahia" · "no exterior" */
export function emUf(uf: UF, nome: string): string {
  if (uf === 'ZZ') return 'no exterior';
  return `${PREP[uf] ?? 'em'} ${nome}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "1 voto" · "2 votos" · "1.234 votos" */
const nVotos = (n: number) => `${fmtInt(n)} ${n === 1 ? 'voto' : 'votos'}`;

/** % de válidos do candidato 0 e 1 (2 casas) — somam 100,00. */
export function pctPar(v0: number, v1: number): [number, number] {
  const t = v0 + v1;
  if (t <= 0) return [0, 0];
  const a = Math.round((v0 / t) * 10000) / 100;
  return [a, Math.round((100 - a) * 100) / 100];
}

/**
 * % de seções totalizadas com 2 casas, TRUNCADO (como o TSE): nunca arredonda para cima, então 100 só aparece
 * com todas as seções totalizadas (com arredondamento comum, 499.223 de 499.248 seções já dariam "100,00%").
 */
export function pctSecoes(k: number, secoes: number): number {
  if (secoes <= 0) return 0;
  if (k >= secoes) return 100;
  return Math.floor((10000 * k) / secoes) / 100;
}

/** "Lula 50,82% · Flávio Bolsonaro 49,18%" (ordem do número na urna). */
export function placar(race: Race, v0: number, v1: number): string {
  const [a, b] = pctPar(v0, v1);
  return `${race.candidatos[0].nomeUrna} ${fmtPct(a)} · ${race.candidatos[1].nomeUrna} ${fmtPct(b)}`;
}

const pct1 = (x: number) => fmtPct(Math.floor(x * 10) / 10, 1); // nunca arredonda para cima (99,96 → 99,9)

export const textos = {
  inicio(race: Race) {
    return {
      titulo: 'Começa a divulgação dos resultados',
      detalhe:
        race.cargo === 'Presidente'
          ? 'Os boletins de urna passam a ser totalizados a partir das 17h (horário de Brasília).'
          : `${race.titulo}: os boletins de urna passam a ser totalizados a partir das 17h (horário de Brasília).`,
    };
  },
  marco(race: Race, marco: number, v0: number, v1: number) {
    return {
      titulo: marco >= 100 ? 'Apuração concluída: 100% das seções totalizadas' : `${marco}% das seções totalizadas`,
      detalhe: `${placar(race, v0, v1)} dos votos válidos`,
    };
  },
  saiNaFrente(race: Race, cand: number, pct: number, v0: number, v1: number) {
    return {
      titulo: `Com ${pct1(pct)} das seções totalizadas, ${race.candidatos[cand].nomeUrna} sai na frente`,
      detalhe: `${placar(race, v0, v1)} dos votos válidos`,
    };
  },
  passaAFrente(race: Race, cand: number, pct: number, v0: number, v1: number) {
    return {
      titulo: `Com ${pct1(pct)} das seções totalizadas, ${race.candidatos[cand].nomeUrna} passa à frente`,
      detalhe: `${placar(race, v0, v1)} dos votos válidos`,
    };
  },
  ufSaiNaFrente(race: Race, uf: UF, nome: string, cand: number, pct: number, v0: number, v1: number) {
    return {
      titulo: `${cap(emUf(uf, nome))}, ${race.candidatos[cand].nomeUrna} sai na frente`,
      detalhe: `Com ${pct1(pct)} das seções totalizadas ${emUf(uf, nome)}: ${placar(race, v0, v1)}`,
    };
  },
  ufPassaAFrente(race: Race, uf: UF, nome: string, cand: number, pct: number, v0: number, v1: number) {
    return {
      titulo: `${cap(emUf(uf, nome))}, ${race.candidatos[cand].nomeUrna} passa à frente`,
      detalhe: `Com ${pct1(pct)} das seções totalizadas ${emUf(uf, nome)}: ${placar(race, v0, v1)}`,
    };
  },
  ufMetade(race: Race, uf: UF, nome: string, v0: number, v1: number) {
    return {
      titulo: `Metade das seções totalizadas ${emUf(uf, nome)}`,
      detalhe: `${placar(race, v0, v1)} dos votos válidos`,
    };
  },
  ufEncerrada(race: Race, uf: UF, nome: string, v0: number, v1: number) {
    return {
      titulo: uf === 'ZZ' ? 'Votos do exterior: apuração concluída' : `${nome} conclui a apuração`,
      detalhe: `${placar(race, v0, v1)} dos votos válidos`,
    };
  },
  /** Vitória matematicamente definida antes de 100% (diferença > eleitorado não totalizado). */
  eleito(race: Race, cand: number, pct: number, diff: number, restante: number) {
    const nome = race.candidatos[cand].nomeUrna;
    return {
      // Presidente: os dois candidatos do 2º turno de 2026 são homens ("eleito"). Governador: redação sem
      // flexão de gênero (há candidatas).
      titulo:
        race.cargo === 'Presidente'
          ? `${nome} está matematicamente eleito`
          : `A vitória de ${nome} está matematicamente definida`,
      detalhe:
        `Com ${fmtPct(Math.floor(pct * 100) / 100)} das seções totalizadas, a diferença de ${nVotos(diff)} ` +
        `supera o eleitorado das seções ainda não totalizadas (${fmtInt(restante)}).`,
    };
  },
  /** Definição só com 100% (disputa muito apertada). */
  vence(race: Race, cand: number, v0: number, v1: number) {
    const [a, b] = pctPar(v0, v1);
    return {
      titulo: `Com 100% das seções totalizadas, ${race.candidatos[cand].nomeUrna} vence a eleição`,
      detalhe: `${race.candidatos[cand].nomeUrna} tem ${fmtPct(cand === 0 ? a : b)} dos votos válidos, diferença de ${nVotos(Math.abs(v0 - v1))}.`,
    };
  },
};
