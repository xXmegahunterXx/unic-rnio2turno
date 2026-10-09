/**
 * Mapeamento PURO do feed oficial do TSE → contratos do Sintonia (src/shared/types.ts).
 *
 * Nada aqui faz rede nem guarda estado: entra JSON bruto (src/tse/feed.ts) + a corrida (`Race`), sai
 * `Summary`, `MunicipioResumo`, `ZonaMosaico`, `SecaoDetalhe`… Tudo testado com arquivos reais do 1º turno
 * de 2026 (src/tse/__fixtures__).
 *
 * Convenções do feed tratadas aqui:
 *  - números chegam como string ("56104503"); vazio ("") = 0;
 *  - percentuais com vírgula ("47,03") — usados só para conferência: os % exibidos derivam de calc.ts;
 *  - datas "dd/mm/aaaa" + "hh:mm:ss" no horário LOCAL da abrangência: Brasil em Brasília; municípios no fuso
 *    da UF (provado no 1T: o 1º município do AC totalizou às "16:17:01", antes das 17h de Brasília, ou seja,
 *    hora do Acre). Ver `FUSO_UF` e `dataHoraLocal`;
 *  - `vvc` (válidos computados) = soma de `vap` de TODOS os candidatos, inclusive "anulado sub judice"; é a
 *    base do `pvap` oficial. Por isso "Outros" (corridas de 1º turno) soma todos os demais `vap`, e o % de
 *    calc.ts bate com o `pvap` do TSE (ex.: RJ governador 1T: Douglas Ruas 49,27%).
 */
import type {
  ApuracaoStatus,
  Candidate,
  MunicipioResumo,
  PrimeiroTurnoLocal,
  Race,
  Regiao,
  Restante,
  SecaoDetalhe,
  SecaoResumo,
  SeriePoint,
  Summary,
  Tally,
  UF,
  ZonaMosaico,
} from '../shared/types';
import { UFS } from '../shared/types';
import { BRT_OFFSET_MS, UF_REGIAO } from '../shared/constants';
import { encodeFaixas, pctTotalizadas, pctValidos } from '../shared/calc';
import { titleCasePt } from '../shared/format';
import type {
  TseAcompanhamentoItem,
  TseAuxArquivo,
  TseCand,
  TseMunicipiosArquivo,
  TseResultadoArquivo,
  TseSecoesArquivo,
} from './feed';
import { type BoletimUrna, votosDoCargo } from './bu';

// ---------------------------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------------------------

/** "56104503" → 56104503; "" / ausente / lixo → 0. */
export function int(s: string | number | undefined | null): number {
  if (typeof s === 'number') return Number.isFinite(s) ? Math.trunc(s) : 0;
  if (!s) return 0;
  const t = s.trim();
  if (/^-?\d+$/.test(t)) return Number(t);
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** "47,03" → 47.03 (percentual do feed; só para conferência). */
export function pctFeed(s: string | undefined | null): number {
  if (!s) return 0;
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** "05/10/2026" + "12:51:05" (Brasília) → epoch ms. null se vazio/ inválido. */
export function dataHoraBrt(d: string | undefined | null, h: string | undefined | null): number | null {
  if (!d) return null;
  const md = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim());
  if (!md) return null;
  const mh = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec((h ?? '').trim());
  const [hh, mi, ss] = mh ? [Number(mh[1]), Number(mh[2]), Number(mh[3] ?? 0)] : [0, 0, 0];
  return Date.UTC(Number(md[3]), Number(md[2]) - 1, Number(md[1]), hh, mi, ss) - BRT_OFFSET_MS;
}

/**
 * Deslocamento (horas) do horário local de cada UF em relação a UTC. Brasil sem horário de verão desde 2019.
 * Simplificações conhecidas: o oeste do AM (13 municípios, UTC-5) e Fernando de Noronha (UTC-2) usam o fuso
 * da UF; o exterior (ZZ) usa Brasília.
 */
export const FUSO_UF: Partial<Record<UF, number>> = { AC: -5, AM: -4, MT: -4, MS: -4, RO: -4, RR: -4 };

/** Como `dataHoraBrt`, mas no horário local da UF (`'BR'` ou ausente = Brasília). */
export function dataHoraLocal(d: string | undefined | null, h: string | undefined | null, uf?: UF | 'BR' | null): number | null {
  const t = dataHoraBrt(d, h);
  if (t === null || !uf || uf === 'BR') return t;
  const fuso = FUSO_UF[uf] ?? -3;
  return t - (fuso + 3) * 3_600_000;
}

/** "20261004T154409" (horário local da urna, como gravado no BU) → "04/10/2026 15:44:09". */
export function dataHoraUrna(s: string | null): string | null {
  const m = s ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : null;
}

const UF_SET = new Set<string>([...UFS, 'ZZ']);
/** 'sp' | 'SP' → 'SP'; null se não for UF válida (inclui 'ZZ'). */
export function ufDe(s: string): UF | null {
  const u = s.trim().toUpperCase();
  return UF_SET.has(u) ? (u as UF) : null;
}

// ---------------------------------------------------------------------------------------------
// Nomes de lugar (mesmas regras de scripts/data/lib/nomes.ts, versão isomórfica e enxuta)
// ---------------------------------------------------------------------------------------------

const CORRECOES_LUGAR: Readonly<Record<string, string>> = {
  MEXICO: 'México',
  PANAMA: 'Panamá',
  NICOSIA: 'Nicósia',
  'SANTA CRUZ DE LA SIERRA': 'Santa Cruz de la Sierra',
};
const PARTICULAS_LUGAR = new Set(['del', 'no', 'na', 'nos', 'nas', 'of']);

/** "OLHO D'ÁGUA DO BORGES" → "Olho d'Água do Borges"; "SÃO JOÃO DEL REI" → "São João del Rei". */
export function nomeLugar(nm: string): string {
  const bruto = nm.trim().replace(/\s+/g, ' ');
  if (CORRECOES_LUGAR[bruto]) return CORRECOES_LUGAR[bruto];
  return titleCasePt(bruto)
    .replace(/([\s-])D'(\p{L})/gu, (_, pre: string, c: string) => `${pre}d'${c.toUpperCase()}`)
    .replace(/(\p{L})'(\p{Ll})/gu, (_, a: string, c: string) => `${a}'${c.toUpperCase()}`)
    .split(' ')
    .map((w, i) => (i > 0 && PARTICULAS_LUGAR.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(' ');
}

// ---------------------------------------------------------------------------------------------
// Corrida ↔ arquivo
// ---------------------------------------------------------------------------------------------

/** Candidatos do cargo no arquivo (achata agremiação → partido → candidato). */
export function candidatosDoArquivo(arq: Pick<TseResultadoArquivo, 'carg'>, cargo?: string | number): TseCand[] {
  const cargos = arq.carg ?? [];
  const cg = (cargo !== undefined ? cargos.find((c) => int(c.cd) === int(cargo)) : undefined) ?? cargos[0];
  if (!cg) return [];
  const out: TseCand[] = [];
  for (const a of cg.agr ?? []) for (const p of a.par ?? []) for (const c of p.cand ?? []) out.push(c);
  return out;
}

/** Turno do arquivo ('1' | '2' → 1 | 2). */
export const turnoDoArquivo = (arq: Pick<TseResultadoArquivo, 't'>): 1 | 2 => (arq.t === '2' ? 2 : 1);

/**
 * Corrida usada para mapear um arquivo: se uma corrida de 2º turno for apontada para dados de 1º turno
 * (ensaio/demonstração com os códigos 6257/6259), usa a corrida '-t1' correspondente (2 finalistas +
 * "Outros"). Em qualquer outro caso, a própria corrida.
 */
export function corridaParaArquivo(race: Race, races: readonly Race[], arq: Pick<TseResultadoArquivo, 't'>): Race {
  if (race.turno === 2 && turnoDoArquivo(arq) === 1) return races.find((r) => r.id === `${race.id}-t1`) ?? race;
  return race;
}

/** Índice do pseudo-candidato agregado ("Outros"), ou -1. */
export const indiceOutros = (race: Pick<Race, 'candidatos'>) => race.candidatos.findIndex((c) => c.agregado);

/**
 * Distribui votos por número na ordem de `race.candidatos`.
 *  - candidatos da corrida: votos do número;
 *  - "Outros" (se houver): soma dos demais números aceitos (`aceito(n)`; padrão: todos);
 *  - números não aceitos (ex.: voto nominal num número que não é candidato da disputa — nulo técnico)
 *    vão para `excedente`, que o chamador soma aos nulos.
 */
export function distribuirVotos(
  race: Pick<Race, 'candidatos'>,
  porNumero: Iterable<[number, number]>,
  aceito: (numero: number) => boolean = () => true,
): { votos: number[]; excedente: number } {
  const idx = new Map<number, number>();
  race.candidatos.forEach((c, i) => {
    if (!c.agregado) idx.set(c.numero, i);
  });
  const iOutros = indiceOutros(race);
  const votos = race.candidatos.map(() => 0);
  let excedente = 0;
  for (const [n, q] of porNumero) {
    const i = idx.get(n);
    if (i !== undefined) votos[i] += q;
    else if (iOutros >= 0 && aceito(n)) votos[iOutros] += q;
    else excedente += q;
  }
  return { votos, excedente };
}

// ---------------------------------------------------------------------------------------------
// Tally / Summary
// ---------------------------------------------------------------------------------------------

export const tallyVazio = (n: number): Tally => ({
  secoes: 0,
  secoesTotalizadas: 0,
  eleitorado: 0,
  eleitoradoTotalizado: 0,
  comparecimento: 0,
  abstencao: 0,
  votos: Array.from({ length: n }, () => 0),
  brancos: 0,
  nulos: 0,
});

/**
 * Contagem de um arquivo de resultado (`-u.json`) na ordem de `race.candidatos`.
 *  - votos: `vap` por número; "Outros" = soma dos demais candidatos (= `vvc` − finalistas);
 *  - brancos: `v.vb`; nulos: `v.tvn` (nulos + nulos técnicos) + válidos computados que não couberam nos
 *    candidatos da corrida (só acontece se a corrida não tiver "Outros" e o arquivo tiver mais candidatos);
 *  - comparecimento `e.c`, eleitorado `e.te`, eleitorado das seções totalizadas `e.est`;
 *  - abstenção: o número OFICIAL `e.a` (sobre as seções instaladas). Difere de `est − c` apenas pelo
 *    eleitorado de seções não instaladas (1T Brasil: 423 eleitores em 41 seções).
 * Garante Σvotos + brancos + nulos = `v.tv` (= comparecimento).
 */
export function tallyDoResultado(arq: TseResultadoArquivo, race: Race): Tally {
  const cands = candidatosDoArquivo(arq, race.tse.cargo);
  const { votos } = distribuirVotos(
    race,
    cands.map((c) => [int(c.n), int(c.vap)] as [number, number]),
  );
  const somaVotos = votos.reduce((a, b) => a + b, 0);
  const vvc = arq.v?.vvc !== undefined && arq.v.vvc !== '' ? int(arq.v.vvc) : somaVotos;
  return {
    secoes: int(arq.s?.ts),
    secoesTotalizadas: int(arq.s?.st),
    eleitorado: int(arq.e?.te),
    eleitoradoTotalizado: int(arq.e?.est),
    comparecimento: int(arq.e?.c),
    abstencao: int(arq.e?.a),
    votos,
    brancos: int(arq.v?.vb),
    nulos: int(arq.v?.tvn) + Math.max(0, vvc - somaVotos),
  };
}

/** Status da apuração pelos campos do TSE (`tf`, `and`, `s.st`/`s.ts`). */
export function statusDoFeed(x: { tf?: string; and?: string; s?: { ts?: string; st?: string } }): ApuracaoStatus {
  const ts = int(x.s?.ts);
  const st = int(x.s?.st);
  if (x.tf === 's' || x.tf === 'S' || x.and === 'f' || x.and === 'F' || (ts > 0 && st >= ts)) return 'encerrada';
  if (st > 0 || x.and === 'p' || x.and === 'P') return 'apurando';
  return 'aguardando';
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Situação "Eleito"/"Eleita"/"Eleito por QP"… (mesma regra do app oficial; "2º turno" e "Não eleito" ficam de fora). */
export const situacaoEleito = (st: string | undefined) => !!st && /^eleit[oa](\s|$)/.test(semAcento(st));

/**
 * Índice (em `race.candidatos`) do candidato que o TSE declara eleito no arquivo, ou null.
 * Só vale no 2º turno e na abrangência da própria disputa (o `st` do candidato é o mesmo em todos os
 * arquivos; numa UF ele diria "Eleito" mesmo onde o candidato perdeu).
 */
export function eleitoDoTse(arq: TseResultadoArquivo, race: Race): number | null {
  if (turnoDoArquivo(arq) !== 2) return null;
  for (const c of candidatosDoArquivo(arq, race.tse.cargo)) {
    if ((c.e === 's' || c.e === 'S') && situacaoEleito(c.st)) {
      const i = race.candidatos.findIndex((rc) => !rc.agregado && rc.numero === int(c.n));
      if (i >= 0) return i;
    }
  }
  return null;
}

/** Líder entre os candidatos reais (o agregado "Outros" nunca lidera). null sem votos ou empate exato. */
export function liderDe(votos: number[], candidatos: Pick<Candidate, 'agregado'>[]): number | null {
  let best = -1;
  let bestV = 0;
  let second = 0;
  votos.forEach((v, i) => {
    if (candidatos[i]?.agregado) return;
    if (v > bestV) {
      second = bestV;
      bestV = v;
      best = i;
    } else if (v > second) second = v;
  });
  if (best < 0 || bestV === 0 || bestV === second) return null;
  return best;
}

/** Diferença em votos entre o 1º e o 2º (candidatos reais). */
function diferencaLider(votos: number[], candidatos: Pick<Candidate, 'agregado'>[]): number {
  const reais = votos.filter((_, i) => !candidatos[i]?.agregado).sort((a, b) => b - a);
  return (reais[0] ?? 0) - (reais[1] ?? 0);
}

export interface ResumirOpcoes {
  status: ApuracaoStatus;
  ultimaAtualizacao: number | null;
  /** Eleito declarado pelo TSE (só na abrangência da disputa). */
  eleitoTse?: number | null;
  /** O TSE marcou `md` = 's' (matematicamente definida) na abrangência da disputa. */
  definidaTse?: boolean;
}

/**
 * Summary a partir de uma contagem. `eleito`: o TSE declarou; ou diferença entre 1º e 2º > eleitorado
 * ainda não totalizado; ou apuração encerrada (regra do contrato, igual à do motor).
 */
export function resumir(t: Tally, candidatos: Pick<Candidate, 'agregado'>[], o: ResumirOpcoes): Summary {
  const lider = liderDe(t.votos, candidatos);
  let eleito: number | null = null;
  if (o.eleitoTse !== undefined && o.eleitoTse !== null) eleito = o.eleitoTse;
  else if (lider !== null) {
    const naoTotalizado = Math.max(0, t.eleitorado - t.eleitoradoTotalizado);
    const definida =
      o.status === 'encerrada' || o.definidaTse === true || (t.secoesTotalizadas > 0 && diferencaLider(t.votos, candidatos) > naoTotalizado);
    if (definida) eleito = lider;
  }
  return { ...t, status: o.status, lider, eleito, ultimaAtualizacao: o.ultimaAtualizacao };
}

export interface ResumoArquivo {
  resumo: Summary;
  /** Corrida efetivamente usada (pode ser a '-t1' — ver `corridaParaArquivo`). */
  race: Race;
  turno: 1 | 2;
  /** Números de candidatos presentes no arquivo (para classificar votos nominais de BU). */
  numeros: number[];
  /** Data/hora de geração do arquivo (dg/hg). */
  geradoEm: number | null;
}

/**
 * Arquivo de resultado → Summary.
 * @param principal true quando a abrangência do arquivo é a da disputa (Brasil para Presidente; a UF para
 *        Governador): só então o "Eleito" e o `md` do TSE são considerados.
 */
export function resumoDoResultado(
  arq: TseResultadoArquivo,
  race: Race,
  races: readonly Race[],
  principal: boolean,
  /** UF do arquivo (fuso de dt/ht); 'BR' ou ausente = Brasília */
  uf?: UF | 'BR',
): ResumoArquivo {
  const r = corridaParaArquivo(race, races, arq);
  const tally = tallyDoResultado(arq, r);
  const status = statusDoFeed(arq);
  const fuso = arq.tpabr === 'br' ? 'BR' : (uf ?? ufDe(arq.cdabr) ?? 'BR');
  const resumo = resumir(tally, r.candidatos, {
    status,
    ultimaAtualizacao: dataHoraLocal(arq.dt, arq.ht, fuso),
    eleitoTse: principal ? eleitoDoTse(arq, r) : null,
    definidaTse: principal && turnoDoArquivo(arq) === 2 && (arq.md === 's' || arq.md === 'S'),
  });
  return {
    resumo,
    race: r,
    turno: turnoDoArquivo(arq),
    numeros: candidatosDoArquivo(arq, r.tse.cargo).map((c) => int(c.n)),
    geradoEm: dataHoraBrt(arq.dg, arq.hg),
  };
}

/**
 * Summary de um item do acompanhamento (`-ab.json`): seções e eleitorado sem votos por candidato
 * (o `ab` não traz votos). Usado como reserva enquanto o arquivo do município não foi baixado.
 */
export function resumoDoAcompanhamento(item: TseAcompanhamentoItem, candidatos: Pick<Candidate, 'agregado'>[], uf?: UF): Summary {
  const t: Tally = {
    secoes: int(item.s?.ts),
    secoesTotalizadas: int(item.s?.st),
    eleitorado: int(item.e?.te),
    eleitoradoTotalizado: int(item.e?.est),
    comparecimento: int(item.e?.c),
    abstencao: int(item.e?.a),
    votos: candidatos.map(() => 0),
    brancos: 0,
    nulos: 0,
  };
  return { ...t, status: statusDoFeed(item), lider: null, eleito: null, ultimaAtualizacao: dataHoraLocal(item.dt, item.ht, uf ?? ufDe(item.cdabr)) };
}

/** Summary vazio ("aguardando") — arquivo ainda não publicado. */
export const resumoVazio = (n: number): Summary => ({
  ...tallyVazio(n),
  status: 'aguardando',
  lider: null,
  eleito: null,
  ultimaAtualizacao: null,
});

/** Soma contagens (regiões, conferências). Status: aguardando (nada), encerrada (tudo), apurando. */
export function somarResumos(lista: Summary[], candidatos: Pick<Candidate, 'agregado'>[]): Summary {
  const t = tallyVazio(candidatos.length);
  let ultima: number | null = null;
  let todasEncerradas = lista.length > 0;
  for (const s of lista) {
    t.secoes += s.secoes;
    t.secoesTotalizadas += s.secoesTotalizadas;
    t.eleitorado += s.eleitorado;
    t.eleitoradoTotalizado += s.eleitoradoTotalizado;
    t.comparecimento += s.comparecimento;
    t.abstencao += s.abstencao;
    t.brancos += s.brancos;
    t.nulos += s.nulos;
    s.votos.forEach((v, i) => {
      if (i < t.votos.length) t.votos[i] += v;
    });
    if (s.ultimaAtualizacao !== null && (ultima === null || s.ultimaAtualizacao > ultima)) ultima = s.ultimaAtualizacao;
    if (s.status !== 'encerrada') todasEncerradas = false;
  }
  const status: ApuracaoStatus = todasEncerradas ? 'encerrada' : t.secoesTotalizadas > 0 ? 'apurando' : 'aguardando';
  return resumir(t, candidatos, { status, ultimaAtualizacao: ultima });
}

/** Regiões a partir dos Summaries por UF. */
export function regioesDe(ufs: Partial<Record<UF, Summary>>, candidatos: Pick<Candidate, 'agregado'>[]): Partial<Record<Regiao, Summary>> {
  const grupos = new Map<Regiao, Summary[]>();
  for (const [uf, s] of Object.entries(ufs) as [UF, Summary][]) {
    const r = UF_REGIAO[uf];
    if (!r || !s) continue;
    const g = grupos.get(r) ?? [];
    g.push(s);
    grupos.set(r, g);
  }
  const out: Partial<Record<Regiao, Summary>> = {};
  for (const [r, g] of grupos) out[r] = somarResumos(g, candidatos);
  return out;
}

/**
 * O que falta apurar (neutro, só matemática), mesma definição do motor:
 *  eleitorado não totalizado; válidos estimados = esse eleitorado × (válidos ÷ eleitorado totalizado);
 *  necessário para virar = (déficit ÷ válidos estimados + 1) ÷ 2 × 100, limitado a 0–100;
 *  null sem votos, sem estimativa ou com eleição já definida.
 */
export function restanteDe(s: Summary, candidatos: Pick<Candidate, 'agregado'>[]): Restante {
  const eleitorado = Math.max(0, s.eleitorado - s.eleitoradoTotalizado);
  const validosObs = s.votos.reduce((a, b) => a + b, 0);
  const taxa = s.eleitoradoTotalizado > 0 ? validosObs / s.eleitoradoTotalizado : 0;
  const validosEstimados = Math.round(eleitorado * taxa);
  let necessarioParaVirar: number | null = null;
  const reais = s.votos.filter((_, i) => !candidatos[i]?.agregado).sort((a, b) => b - a);
  if (s.eleito === null && validosEstimados > 0 && (reais[0] ?? 0) > 0) {
    const deficit = (reais[0] ?? 0) - (reais[1] ?? 0);
    necessarioParaVirar = Math.min(100, Math.max(0, ((deficit / validosEstimados + 1) / 2) * 100));
  }
  return { eleitorado, validosEstimados, necessarioParaVirar };
}

/** Ponto da série (% de seções e % de válidos por candidato). */
export const pontoSerie = (t: number, s: Summary): SeriePoint => ({
  t,
  pst: pctTotalizadas(s),
  pv: s.votos.map((_, i) => pctValidos(s, i)),
});

// ---------------------------------------------------------------------------------------------
// Municípios (config "cm") e acompanhamento ("ab")
// ---------------------------------------------------------------------------------------------

export interface MunicipioInfo {
  uf: UF;
  cod: string; // TSE, 5 dígitos
  ibge: string; // 7 dígitos ('' no exterior)
  nome: string; // exibição
  capital: boolean;
  zonas: number[];
}

/** mun-e{ele}-cm.json → municípios por UF (nomes de exibição; `nome` sobrescrevível). */
export function municipiosDoCm(
  cm: TseMunicipiosArquivo,
  nome?: (uf: UF, cod: string) => string | undefined,
): Map<UF, MunicipioInfo[]> {
  const out = new Map<UF, MunicipioInfo[]>();
  for (const a of cm.abr ?? []) {
    const uf = ufDe(a.cd);
    if (!uf) continue;
    const lista = (a.mu ?? []).map((m) => ({
      uf,
      cod: m.cd.padStart(5, '0'),
      ibge: m.cdi ?? '',
      nome: nome?.(uf, m.cd.padStart(5, '0')) ?? nomeLugar(m.nm),
      capital: m.c === 's' || m.c === 'S',
      zonas: (m.z ?? []).map((z) => int(z)).filter((z) => z > 0).sort((x, y) => x - y),
    }));
    out.set(uf, lista);
  }
  return out;
}

export const municipioResumo = (s: Summary, m: Pick<MunicipioInfo, 'cod' | 'ibge' | 'nome' | 'capital'>): MunicipioResumo => ({
  ...s,
  cod: m.cod,
  ibge: m.ibge,
  nome: m.nome,
  capital: m.capital,
});

/** Itens de município de um `-ab.json` de UF, por código TSE. */
export function acompanhamentoPorMunicipio(abr: TseAcompanhamentoItem[]): Map<string, TseAcompanhamentoItem> {
  const out = new Map<string, TseAcompanhamentoItem>();
  for (const it of abr) if (it.tpabr === 'mun' || it.tpabr === 'mu') out.set(it.cdabr.padStart(5, '0'), it);
  return out;
}

/**
 * Versão de um item do acompanhamento = seções totalizadas. (dt/ht NÃO servem para comparar com o arquivo do
 * município: no `ab` é a hora da última seção do município; no `-u.json` final é o carimbo geral da eleição.)
 */
export const versaoAcompanhamento = (it: Pick<TseAcompanhamentoItem, 's'>) => int(it.s?.st);

/** Resultado de 1º turno de um município na ordem da corrida '-t1' (comparação no MunicipioSnapshot). */
export function primeiroTurnoDoResultado(arq: TseResultadoArquivo, raceT1: Race): PrimeiroTurnoLocal {
  const t = tallyDoResultado(arq, raceT1);
  return { votos: t.votos, brancos: t.brancos, nulos: t.nulos, comparecimento: t.comparecimento, eleitorado: t.eleitorado };
}

// ---------------------------------------------------------------------------------------------
// Seções ("cs") e mosaico
// ---------------------------------------------------------------------------------------------

export interface SecaoCfg {
  ns: number;
  /** epoch ms de `da`/`ha` (arquivos da urna publicados ⇒ seção totalizada); null se ainda não. */
  publicadaEm: number | null;
}

export interface ZonaCfg {
  zona: number;
  /** seções ativas (não agregadas), em ordem crescente */
  secoes: SecaoCfg[];
  /** seção agregada → seção principal (que recebe os votos dela) */
  agregadas: Map<number, number>;
}

/** Seções de uma UF, compactadas: município → zona → seções. */
export interface SecoesUf {
  geradoEm: number | null;
  municipios: Map<string, Map<number, ZonaCfg>>;
}

/** {uf}-p{pleito}-cs.json → estrutura compacta. Seções com `nsp` (agregadas) saem da lista ativa. */
export function secoesDoCs(cs: TseSecoesArquivo): SecoesUf {
  const municipios = new Map<string, Map<number, ZonaCfg>>();
  for (const a of cs.abr ?? []) {
    for (const m of a.mu ?? []) {
      const zonas = new Map<number, ZonaCfg>();
      for (const z of m.zon ?? []) {
        const zona = int(z.cd);
        const secoes: SecaoCfg[] = [];
        const agregadas = new Map<number, number>();
        for (const s of z.sec ?? []) {
          const ns = int(s.ns);
          if (s.nsp) agregadas.set(ns, int(s.nsp));
          else secoes.push({ ns, publicadaEm: s.da ? dataHoraBrt(s.da, s.ha) ?? 0 : null });
        }
        secoes.sort((x, y) => x.ns - y.ns);
        zonas.set(zona, { zona, secoes, agregadas });
      }
      municipios.set(m.cd.padStart(5, '0'), zonas);
    }
  }
  return { geradoEm: dataHoraBrt(cs.dg, cs.hg), municipios };
}

/**
 * Mosaico status-only da fonte TSE: o vencedor por seção exigiria baixar um BU por seção, inviável em massa.
 * Código 't' = totalizada, vencedor não informado; '0' = não totalizada (ver ZonaMosaico em shared/types.ts).
 */
export function mosaicoStatus(z: Pick<ZonaCfg, 'zona' | 'secoes'>): ZonaMosaico {
  const secs = [...z.secoes].sort((a, b) => a.ns - b.ns);
  return {
    zona: z.zona,
    faixas: encodeFaixas(secs.map((s) => s.ns)),
    estado: secs.map((s) => (s.publicadaEm !== null ? 't' : '0')).join(''),
  };
}

/**
 * Seção sem votos conhecidos (lista da zona na fonte TSE): `votos: []` = indisponível, `aptos` 0 = desconhecido.
 * `totalizadaEm` fica null: `da`/`ha` do cs é a hora de PUBLICAÇÃO dos arquivos da urna (em lote; no 1T do AC,
 * 21:08 para seções recebidas às 18:34), não a da totalização.
 */
export const secaoStatusOnly = (s: SecaoCfg): SecaoResumo => ({
  secao: s.ns,
  totalizada: s.publicadaEm !== null,
  totalizadaEm: null,
  aptos: 0,
  comparecimento: 0,
  votos: [],
  brancos: 0,
  nulos: 0,
});

// ---------------------------------------------------------------------------------------------
// Boletim de urna → SecaoDetalhe
// ---------------------------------------------------------------------------------------------

/** Hash "vigente" do aux.json: o totalizado mais recente (ou o último listado). */
export function hashVigente(aux: TseAuxArquivo): TseAuxArquivo['hashes'][number] | null {
  const hs = aux.hashes ?? [];
  const tot = hs.filter((h) => /^totaliz/i.test(h.st ?? ''));
  const lista = tot.length ? tot : hs.filter((h) => !/exclu/i.test(h.st ?? ''));
  if (!lista.length) return null;
  return lista.reduce((a, b) => ((dataHoraBrt(b.dr, b.hr) ?? 0) >= (dataHoraBrt(a.dr, a.hr) ?? 0) ? b : a));
}

/** Nome do arquivo do BU dentro de um hash (`bu`, ou `busa` em urna de contingência / sistema de apuração). */
export function arquivoBu(h: NonNullable<ReturnType<typeof hashVigente>>): string | null {
  return h.arq.find((a) => a.tp === 'bu')?.nm ?? h.arq.find((a) => a.tp === 'busa')?.nm ?? null;
}

export interface SecaoContexto {
  race: Race;
  uf: UF;
  cod: string;
  nomeMunicipio: string;
  zona: number;
  secao: number;
  /** código da eleição e do cargo procurados no BU (ex.: 6258 / 1) */
  eleicao: number;
  cargo: number;
  totalizadaEm: number | null;
  /** números válidos na disputa (do arquivo de resultado); nominais fora dele viram nulos (técnicos) */
  numerosValidos?: ReadonlySet<number>;
}

/** BU decodificado → SecaoDetalhe (null se o BU não tiver a eleição/cargo pedidos). */
export function secaoDoBu(bu: BoletimUrna, ctx: SecaoContexto): SecaoDetalhe | null {
  const v = votosDoCargo(bu, ctx.eleicao, ctx.cargo);
  if (!v) return null;
  const aceitos = ctx.numerosValidos;
  const { votos, excedente } = distribuirVotos(ctx.race, v.nominais, (n) => !aceitos || aceitos.has(n));
  return {
    race: ctx.race.id,
    uf: ctx.uf,
    cod: ctx.cod,
    nomeMunicipio: ctx.nomeMunicipio,
    zona: ctx.zona,
    secao: ctx.secao,
    totalizada: true,
    totalizadaEm: ctx.totalizadaEm,
    aptos: v.aptos,
    comparecimento: v.comparecimento,
    abstencao: Math.max(0, v.aptos - v.comparecimento),
    votos,
    brancos: v.brancos,
    nulos: v.nulos + excedente + v.legenda,
    codigoIdentificacao: bu.codigoCarga ?? (bu.numeroInternoUrna !== null ? String(bu.numeroInternoUrna) : ''),
    simulado: false,
  };
}

/** Seção ainda não totalizada (ou sem BU publicado): só identificação. */
export const secaoPendente = (ctx: Omit<SecaoContexto, 'eleicao' | 'cargo' | 'numerosValidos'>): SecaoDetalhe => ({
  race: ctx.race.id,
  uf: ctx.uf,
  cod: ctx.cod,
  nomeMunicipio: ctx.nomeMunicipio,
  zona: ctx.zona,
  secao: ctx.secao,
  totalizada: false,
  totalizadaEm: null,
  aptos: 0,
  comparecimento: 0,
  abstencao: 0,
  votos: ctx.race.candidatos.map(() => 0),
  brancos: 0,
  nulos: 0,
  codigoIdentificacao: '',
  simulado: false,
});
