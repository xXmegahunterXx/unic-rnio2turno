/**
 * "Projeção do Sintonia" (funções puras, sem React nem Node): com parte das urnas apuradas, estima o resultado FINAL de
 * cada finalista (% dos votos válidos) com uma faixa (mín–máx). Estimativa estatística, NÃO é o resultado oficial.
 *
 * Método, município a município (o mesmo espírito do "desde o 1º turno", ./desde-t1.ts; os candidatos dos dois turnos
 * são casados pelo NÚMERO na urna):
 *  1. Volume esperado de votos válidos de cada município:
 *     - com seções totalizadas: válidos apurados × (eleitorado / eleitorado totalizado) (ou × seções / totalizadas);
 *     - sem nenhuma: válidos do 1º turno × a razão observada (válidos do 2º turno / válidos do 1º turno) nos municípios
 *       já 100% totalizados da mesma UF (sem nenhum na UF: os do Brasil; sem nenhum concluído: os já começados).
 *  2. A parte ainda não apurada de um município começado segue a proporção já apurada nele.
 *  3. Município sem nenhuma urna: a proporção do 1º turno entre os dois finalistas (só os votos deles) + o "swing"
 *     médio (ponderado pelos válidos apurados) observado nos municípios já com urnas da MESMA UF (sem nenhum na UF: o
 *     do Brasil), limitada a [0, 100].
 *  4. Fonte TSE: o servidor só tem os municípios já lidos (cache); os demais entram como "desconhecidos" e o total
 *     OFICIAL da UF ancora o já apurado (o que falta dos desconhecidos segue o passo 3, em bloco). Com o acompanhamento
 *     da UF (`-ab.json`: seções/eleitorado totalizados por município, sem votos), o swing da parte apurada dos
 *     desconhecidos é medido contra o 1º turno só dessa parte e o que falta pesa cada município pelo que falta nele; o
 *     lido defasado (menos seções do que o acompanhamento) vira desconhecido, e o que falta dele segue o já lido. Assim
 *     a conta não depende do cache estar cheio (reinício do servidor, lote grande do TSE de uma vez).
 *  5. Soma tudo → % final projetado. A faixa (meia-largura) vem de um desvio estimado — a incerteza do que falta, que
 *     depende da fração já apurada dos válidos esperados e da dispersão do swing observado — × um fator, calibrado
 *     em noites simuladas do nosso motor (src/engine/projecao-calibracao.test.ts) para conter o resultado final em
 *     ≥ 95% dos casos, com piso de PISO_FAIXA_PP.
 *
 * Disponível só com LIMIAR_FRACAO (10%) dos válidos esperados apurados E urnas em pelo menos MIN_UFS_COM_URNAS (5) UFs
 * (Brasil) / LIMIAR_MUNICIPIOS (10%) dos municípios (UF). Some quando o resumo já tem eleito ('definido') e quando a
 * apuração termina ('encerrada'). Isomórfico: o servidor calcula (src/server/projecao.ts) e o app só exibe.
 */
import type { Race, Summary, Tally } from './types';

// ---- contrato (fixo; servidor e app seguem exatamente) -----------------------------------------------------------

export interface ProjecaoCandidato {
  /** Índice em `race.candidatos` (ordem da urna). */
  indice: number;
  numero: number;
  /** % projetado dos votos válidos (0–100). */
  pct: number;
  /** Faixa: mínimo e máximo projetados (0–100). */
  min: number;
  max: number;
}

export type MotivoSemProjecao = 'cedo' | 'sem-base' | 'definido' | 'encerrada' | 'desligada';

export interface Projecao {
  race: string;
  /** 'BR' ou a UF. */
  abrangencia: string;
  disponivel: boolean;
  motivo?: MotivoSemProjecao;
  /** 0–1: fração já apurada dos votos válidos esperados. */
  fracaoApurada: number;
  /** 0–100: % das seções totalizadas (eco do resumo da abrangência). */
  pctSecoes: number;
  /** Ordem da urna (a de `race.candidatos`); vazio quando indisponível. */
  candidatos: ProjecaoCandidato[];
  simNow: number;
}

/** Resposta de GET /api/apuracao/:race/br/projecao e /api/apuracao/:race/:uf/projecao. */
export interface RespostaProjecao {
  projecao: Projecao;
}

// ---- limiares e textos ------------------------------------------------------------------------------------------

/** Fração mínima dos válidos esperados já apurada para mostrar a projeção. */
export const LIMIAR_FRACAO = 0.1;
/** Brasil: UFs com pelo menos uma urna apurada. */
export const MIN_UFS_COM_URNAS = 5;
/** UF: fração mínima dos municípios com urnas apuradas. */
export const LIMIAR_MUNICIPIOS = 0.1;
/** Piso da meia-largura da faixa, em p.p. */
export const PISO_FAIXA_PP = 0.3;
/**
 * Fonte TSE: piso maior da meia-largura (p.p.). O cache dos municípios fica alguns minutos atrás do total oficial e
 * parte do volume pode ser contada duas vezes; com 90%+ apurado o piso de 0,3 ficava estreito demais.
 */
export const PISO_FAIXA_TSE_PP = 0.5;
/**
 * Fonte TSE: cobertura mínima (seções totalizadas em municípios conhecidos — lidos ou no acompanhamento da UF — ÷ seções
 * totalizadas oficiais) para mostrar a projeção de uma UF ou de governador. Sem o acompanhamento, abaixo disso quase
 * tudo passaria pelo bloco de desconhecidos e a faixa não cobre os 95% (estresse da revisão: 80–93% sem a trava,
 * 99–100% com ela). Com o acompanhamento em dia a cobertura é ~1 e a conta fica boa mesmo com o cache vazio (98,6–100%
 * nas simulações); a trava passa a pegar só o acompanhamento atrasado em relação ao total oficial. O Brasil não usa.
 */
export const LIMIAR_COBERTURA_CACHE = 0.9;

/**
 * Parâmetros da faixa (e do encolhimento do que falta nos municípios começados), calibrados em noites simuladas do
 * nosso motor — ver src/engine/projecao-calibracao.test.ts (imprime a tabela de erro e cobertura). Variâncias em
 * fração². Nas simulações a cobertura fica em ~99–100% (o motor é mais regular que a vida real): os termos
 * sistemáticos (`sist`, `sistIniciado`) foram deixados de propósito acima do mínimo que a simulação pede.
 */
export interface ParamsProjecao {
  /** Multiplicador do desvio estimado → meia-largura. */
  fator: number;
  /** Piso da meia-largura (p.p.). */
  piso: number;
  /** Heterogeneidade DENTRO de um município (seções/zonas que ainda faltam × as já apuradas). */
  varIntra: number;
  /** Quanto cada seção já apurada reduz essa incerteza: var = varIntra / (1 + alfa × seções apuradas). */
  alfa: number;
  /** Piso da variância do swing de um município sem urnas. */
  varMinMun: number;
  /** Erro sistemático (fração) do swing médio aplicado aos municípios sem urnas (correlacionado entre UFs). */
  sist: number;
  /** Idem quando a UF não tem município com urnas e usa o swing do Brasil. */
  sistEmprestado: number;
  /** Erro sistemático (fração) do que falta nos municípios começados (correlacionado). */
  sistIniciado: number;
  /**
   * Encolhimento (em seções) do % do que falta num município começado em direção ao do 1º turno + swing da UF:
   * p = (apuradas × p_apurado + k × p_prior) / (apuradas + k). 0 = segue só a proporção já apurada.
   */
  encolhimento: number;
}

export const PARAMS_PROJECAO: Readonly<ParamsProjecao> = Object.freeze({
  fator: 2,
  piso: PISO_FAIXA_PP,
  varIntra: 0.06 * 0.06,
  alfa: 0.1,
  varMinMun: 0.02 * 0.02,
  sist: 0.01,
  sistEmprestado: 0.02,
  sistIniciado: 0.005,
  encolhimento: 0,
});

export const TEXTOS_PROJECAO = {
  titulo: 'Projeção do Sintonia',
  subtitulo:
    'Estimativa estatística do resultado final com base nas urnas já apuradas e no 1º turno. Não é o resultado oficial — o resultado é o do TSE.',
  /** Linha por candidato: "NN,N% (entre NN,N% e NN,N%)" — use `linhaProjecao` com os formatadores de format.ts. */
  linha: (pct: string, min: string, max: string) => `${pct} (entre ${min} e ${max})`,
  /** Rodapé: "Com NN% das urnas apuradas · como calculamos". */
  rodape: (pctUrnas: string) => `Com ${pctUrnas} das urnas apuradas`,
  comoCalculamos: 'como calculamos',
  /** Cartão antes do limiar (motivo 'cedo', durante a apuração): frase, rótulo e valor da barra até os ~10%. */
  aguardando: (limiar: string) => `A estimativa do resultado final aparece com cerca de ${limiar} das urnas apuradas.`,
  /** Idem com as seções já no limiar, mas o cálculo ainda sem base (fração dos válidos ou urnas pouco espalhadas). */
  aguardandoBase: 'A estimativa do resultado final aparece assim que houver mais urnas apuradas.',
  aguardandoRotulo: 'Urnas apuradas',
  aguardandoValor: (pct: string, limiar: string) => `${pct} de ${limiar}`,
  motivos: {
    cedo: 'A projeção aparece quando houver urnas apuradas suficientes.',
    'sem-base': 'Projeção indisponível no momento.',
    definido: 'Resultado já definido matematicamente.',
    encerrada: 'Apuração encerrada.',
    desligada: '',
  } satisfies Record<MotivoSemProjecao, string>,
} as const;

// ---- entrada do cálculo -----------------------------------------------------------------------------------------

/** Contagem do 2º turno numa área (MunicipioResumo/Summary servem). */
export type ContagemProjecao = Pick<Tally, 'votos' | 'secoes' | 'secoesTotalizadas' | 'eleitorado' | 'eleitoradoTotalizado'>;

/** 1º turno de um município: votos dos dois finalistas na ordem de `race.candidatos` e o total de válidos. */
export interface T1Projecao {
  finalistas: number[];
  validos: number;
}

/**
 * Fonte TSE: acompanhamento do município (o `-ab.json` da UF, um arquivo só e sempre em dia): seções e eleitorado já
 * totalizados, SEM votos.
 */
export type AcompanhamentoProjecao = Pick<Tally, 'secoes' | 'secoesTotalizadas' | 'eleitorado' | 'eleitoradoTotalizado'>;

export interface MunicipioProjecao {
  uf: string;
  /** 2º turno; null = desconhecido (fonte TSE: município ainda não lido). */
  t2: ContagemProjecao | null;
  /** 1º turno; null = sem resultado do 1º turno. */
  t1: T1Projecao | null;
  /**
   * Fonte TSE (opcional): acompanhamento. Diz QUAIS desconhecidos já começaram e quanto (o swing da parte apurada deles
   * é medido contra o 1º turno só dessa parte, e o que falta segue cada município) e marca como defasado o município lido
   * com menos seções do que o acompanhamento mostra (ele passa a desconhecido: o total oficial da UF cobre os votos).
   */
  ab?: AcompanhamentoProjecao | null;
}

export interface EntradaProjecao {
  municipios: Iterable<MunicipioProjecao>;
  /**
   * Totais OFICIAIS por UF (fonte TSE). Com eles, o já apurado da UF é o oficial e a parte apurada dos municípios
   * desconhecidos é a diferença (total − municípios lidos).
   */
  totaisUf?: Readonly<Record<string, ContagemProjecao | undefined>>;
}

export interface CalculoProjecao {
  /** % projetado de cada candidato (ordem da urna; soma 100). */
  pct: number[];
  /** Desvio estimado do % projetado, em p.p. */
  dp: number;
  /** Meia-largura da faixa, em p.p. (max(PISO, FATOR × dp)). */
  meia: number;
  fracaoApurada: number;
  validosEsperados: number;
  validosApurados: number;
  municipios: number;
  municipiosComUrnas: number;
  ufs: number;
  ufsComUrnas: number;
  /**
   * Fonte TSE (com `totaisUf`): seções totalizadas em municípios conhecidos (lidos no cache ou, com o acompanhamento,
   * as que ele mostra) ÷ seções totalizadas oficiais das UFs da abrangência (0–1). Ausente fora da fonte TSE.
   */
  coberturaCache?: number;
}

/** Índice no 1º turno de cada candidato do 2º turno (pelo número na urna; -1 sem par). */
export const paresT1 = (race: Pick<Race, 'candidatos'>, raceT1: Pick<Race, 'candidatos'>): number[] =>
  race.candidatos.map((c) => raceT1.candidatos.findIndex((x) => !x.agregado && x.numero === c.numero));

/** 1º turno de um município no formato da projeção (votos na ordem de `raceT1.candidatos`). null sem par/base. */
export function t1Projecao(pares: readonly number[], votosT1: readonly number[] | null | undefined): T1Projecao | null {
  if (!votosT1 || pares.some((j) => j < 0)) return null;
  let validos = 0;
  for (const v of votosT1) validos += v > 0 ? v : 0;
  if (!(validos > 0)) return null;
  return { finalistas: pares.map((j) => Math.max(0, votosT1[j] ?? 0)), validos };
}

const soma = (v: readonly number[]) => {
  let s = 0;
  for (const x of v) s += x;
  return s;
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

interface Swing {
  /** média ponderada (fração) */
  media: number;
  /** variância ponderada entre municípios */
  var: number;
  /** nº efetivo de municípios (pesos) */
  nEf: number;
  ok: boolean;
}

class AcSwing {
  sw = 0;
  sw2 = 0;
  swd = 0;
  swd2 = 0;
  add(d: number, w: number) {
    this.sw += w;
    this.sw2 += w * w;
    this.swd += w * d;
    this.swd2 += w * d * d;
  }
  get(): Swing {
    if (!(this.sw > 0)) return { media: 0, var: 0, nEf: 0, ok: false };
    const media = this.swd / this.sw;
    return { media, var: Math.max(0, this.swd2 / this.sw - media * media), nEf: (this.sw * this.sw) / this.sw2, ok: true };
  }
}

interface MunInterno {
  uf: string;
  t2: ContagemProjecao | null;
  v2: number;
  /** começado: seções totalizadas e votos válidos */
  comecado: boolean;
  completo: boolean;
  q1: number | null;
  /** votos dos dois finalistas no 1º turno */
  f1: number;
  w1: number;
  /** acompanhamento (fonte TSE), quando houver */
  ab: AcompanhamentoProjecao | null;
  /** desconhecido com acompanhamento: fração já totalizada dele (eleitorado; 0 sem acompanhamento) */
  fAb: number;
  /** lido defasado (virou desconhecido): a proporção já apurada nele, que o que falta dele segue, e as seções lidas */
  pDefasado: number | null;
  sDefasado: number;
}

/** Fração já totalizada de um município pelo acompanhamento (eleitorado; sem ele, seções). */
const fracaoAb = (a: AcompanhamentoProjecao): number =>
  a.eleitorado > 0 ? clamp01(a.eleitoradoTotalizado / a.eleitorado) : a.secoes > 0 ? clamp01(a.secoesTotalizadas / a.secoes) : 0;

/**
 * Calcula a projeção (2 finalistas). null sem base nenhuma (sem válidos esperados, ou corrida sem exatamente 2
 * candidatos). Nunca lança com entrada coerente.
 */
export function calcularProjecao(e: EntradaProjecao, prm: Readonly<ParamsProjecao> = PARAMS_PROJECAO): CalculoProjecao | null {
  const muns: MunInterno[] = [];
  const nCand = 2;
  const entrada = Array.from(e.municipios);
  // fonte TSE: a UF está "em dia" quando as seções totalizadas em municípios conhecidos (lidos no cache ou no
  // acompanhamento) cobrem LIMIAR_COBERTURA_CACHE do total oficial dela. Fora de dia (cache e acompanhamento atrasados,
  // ex.: logo depois de um lote grande do TSE, antes do aquecimento relê-los) não há como saber quais lidos estão
  // defasados — a parte nova deles seria contada duas vezes (no bloco dos desconhecidos, pelo total oficial, e no que
  // falta deles) — nem de que municípios vem o já apurado: a UF inteira vira bloco de desconhecidos (o total oficial
  // ancora e o que falta segue o já apurado nela), o jeito mais robusto.
  const foraDeDia = new Set<string>();
  if (e.totaisUf) {
    const conhecidas = new Map<string, number>();
    for (const m of entrada) {
      if (!e.totaisUf[m.uf]) continue;
      conhecidas.set(m.uf, (conhecidas.get(m.uf) ?? 0) + Math.max(0, m.t2?.secoesTotalizadas ?? 0, m.ab?.secoesTotalizadas ?? 0));
    }
    for (const [uf, n] of conhecidas) if (n < LIMIAR_COBERTURA_CACHE * (e.totaisUf[uf]?.secoesTotalizadas ?? 0)) foraDeDia.add(uf);
  }
  for (const m of entrada) {
    if (m.t2 && m.t2.votos.length !== nCand) return null;
    // fonte TSE: só com o total oficial da UF (que cobre os votos dele) o acompanhamento vale
    const ab = e.totaisUf?.[m.uf] && m.ab ? m.ab : null;
    const fora = foraDeDia.has(m.uf);
    // lido com menos seções do que o acompanhamento mostra = defasado: vira desconhecido (senão a parte nova dele seria
    // contada duas vezes); o que falta dele segue o já lido (encolhido para o 1º turno + swing com poucas seções lidas)
    const defasado = !!m.t2 && !!ab && ab.secoesTotalizadas > m.t2.secoesTotalizadas;
    const t2 = fora || defasado ? null : m.t2;
    const vLido = defasado && !fora ? soma(m.t2!.votos) : 0;
    const v2 = t2 ? soma(t2.votos) : 0;
    const comecado = !!t2 && t2.secoesTotalizadas > 0 && v2 > 0;
    const t1 = m.t1 && m.t1.validos > 0 && m.t1.finalistas.length === nCand ? m.t1 : null;
    const f1 = t1 ? t1.finalistas[0] + t1.finalistas[1] : 0;
    muns.push({
      uf: m.uf,
      t2,
      v2,
      comecado,
      completo: comecado && t2!.secoes > 0 && t2!.secoesTotalizadas >= t2!.secoes,
      q1: t1 && f1 > 0 ? t1.finalistas[0] / f1 : null,
      f1,
      w1: t1 ? t1.validos : 0,
      ab,
      fAb: !t2 && ab && !fora ? fracaoAb(ab) : 0,
      pDefasado: vLido > 0 ? m.t2!.votos[0] / vLido : null,
      sDefasado: vLido > 0 ? m.t2!.secoesTotalizadas : 0,
    });
  }
  if (!muns.length) return null;

  // volume esperado de um município começado
  const esperadoObs = (m: MunInterno): number => {
    const t = m.t2!;
    if (m.completo) return m.v2;
    if (t.eleitoradoTotalizado > 0 && t.eleitorado > 0) return m.v2 * Math.max(1, t.eleitorado / t.eleitoradoTotalizado);
    return t.secoes > 0 ? m.v2 * Math.max(1, t.secoes / t.secoesTotalizadas) : m.v2;
  };

  // razões (válidos 2º / válidos 1º) e swing, por UF e no Brasil
  const razaoUf = new Map<string, [number, number]>();
  const razaoUfComeco = new Map<string, [number, number]>();
  let razaoBr: [number, number] = [0, 0];
  let razaoBrComeco: [number, number] = [0, 0];
  const swUf = new Map<string, AcSwing>();
  const swBr = new AcSwing();
  const ufs = new Set<string>();
  const ufsComUrnas = new Set<string>();
  let municipiosComUrnas = 0;
  const addR = (mp: Map<string, [number, number]>, uf: string, a: number, b: number) => {
    const r = mp.get(uf) ?? [0, 0];
    r[0] += a;
    r[1] += b;
    mp.set(uf, r);
  };
  for (const m of muns) {
    ufs.add(m.uf);
    if ((m.t2 && m.t2.secoesTotalizadas > 0) || (!m.t2 && m.ab && m.ab.secoesTotalizadas > 0)) {
      municipiosComUrnas++;
      ufsComUrnas.add(m.uf);
    }
    if (!m.comecado || m.w1 <= 0) continue;
    if (m.completo) {
      addR(razaoUf, m.uf, m.v2, m.w1);
      razaoBr = [razaoBr[0] + m.v2, razaoBr[1] + m.w1];
    }
    const ve = esperadoObs(m);
    addR(razaoUfComeco, m.uf, ve, m.w1);
    razaoBrComeco = [razaoBrComeco[0] + ve, razaoBrComeco[1] + m.w1];
    if (m.q1 !== null) {
      const d = m.t2!.votos[0] / m.v2 - m.q1;
      let a = swUf.get(m.uf);
      if (!a) swUf.set(m.uf, (a = new AcSwing()));
      a.add(d, m.v2);
      swBr.add(d, m.v2);
    }
  }
  // fonte TSE: a parte apurada dos desconhecidos (total oficial da UF − lidos) também mostra o swing — comparado ao
  // 1º turno da parte deles que já foi apurada, pelo acompanhamento (cada um pesa os válidos do 1º turno × a fração já
  // totalizada); sem acompanhamento, ao 1º turno do bloco de desconhecidos inteiro (não se sabe quais começaram)
  if (e.totaisUf) {
    const blocos = new Map<string, { lidos: number[]; f0: number; f1: number; a0: number; a1: number }>();
    for (const m of muns) {
      if (!e.totaisUf[m.uf]) continue;
      let b = blocos.get(m.uf);
      if (!b) blocos.set(m.uf, (b = { lidos: [0, 0], f0: 0, f1: 0, a0: 0, a1: 0 }));
      if (m.t2) {
        b.lidos[0] += m.t2.votos[0];
        b.lidos[1] += m.t2.votos[1];
      } else if (m.q1 !== null && m.w1 > 0) {
        // ponderado pelos válidos do 1º turno, como o prior e o volume do bloco (descPrior0/descEsperado)
        b.f0 += m.q1 * m.w1;
        b.f1 += m.w1;
        b.a0 += m.q1 * m.w1 * m.fAb;
        b.a1 += m.w1 * m.fAb;
      }
    }
    for (const [uf, b] of blocos) {
      const tot = e.totaisUf[uf]!;
      if (tot.votos.length !== nCand || !(b.f1 > 0)) continue;
      const a0 = Math.max(0, tot.votos[0] - b.lidos[0]);
      const a1 = Math.max(0, tot.votos[1] - b.lidos[1]);
      if (!(a0 + a1 > 0)) continue;
      const d = a0 / (a0 + a1) - (b.a1 > 0 ? b.a0 / b.a1 : b.f0 / b.f1);
      let a = swUf.get(uf);
      if (!a) swUf.set(uf, (a = new AcSwing()));
      a.add(d, a0 + a1);
      swBr.add(d, a0 + a1);
    }
  }
  // UFs com total oficial também contam como "com urnas"
  for (const [uf, t] of Object.entries(e.totaisUf ?? {})) if (t && t.secoesTotalizadas > 0 && ufs.has(uf)) ufsComUrnas.add(uf);
  const div = (r: [number, number] | undefined) => (r && r[1] > 0 && r[0] > 0 ? r[0] / r[1] : null);
  const razaoDe = (uf: string) => div(razaoUf.get(uf)) ?? div(razaoBr) ?? div(razaoUfComeco.get(uf)) ?? div(razaoBrComeco) ?? 1;
  const swingBr = swBr.get();
  const swingDe = (uf: string): Swing & { emprestado: boolean } => {
    const s = swUf.get(uf)?.get();
    if (s?.ok) return { ...s, emprestado: false };
    return { ...swingBr, emprestado: true };
  };

  // projeção, por UF (para a âncora oficial e a incerteza do swing médio da UF)
  const porUf = new Map<string, MunInterno[]>();
  for (const m of muns) {
    let l = porUf.get(m.uf);
    if (!l) porUf.set(m.uf, (l = []));
    l.push(m);
  }
  const final = [0, 0];
  let esperadoTotal = 0;
  let apuradoTotal = 0;
  // variância (em fração de votos², antes de dividir pelo total²)
  let varIndep = 0;
  let varAmostra = 0;
  let sistTotal = 0;
  for (const [uf, lista] of porUf) {
    const r = razaoDe(uf);
    const sw = swingDe(uf);
    // incerteza do swing médio aplicado ao que falta: amostral (independente entre UFs) + sistemática (correlacionada)
    const sist = sw.emprestado ? prm.sistEmprestado : prm.sist;
    const varMedia = sw.nEf > 0 ? sw.var / sw.nEf : 0.05 * 0.05;
    const qPrior = (m: MunInterno) => clamp01((m.q1 ?? 0.5) + (sw.ok ? sw.media : 0));
    let restoSemUrnas = 0;
    const tot = e.totaisUf?.[uf];
    // desconhecidos (fonte TSE)
    let descEsperado = 0;
    let descPrior0 = 0;
    // o que falta de cada desconhecido: volume × (1 − fração já totalizada pelo acompanhamento; 0 sem ele)
    let descRestoW = 0;
    let descRestoQ = 0;
    let descRestoW2 = 0;
    const lidos = [0, 0];
    let lidosElei = 0;
    let lidosEleiTot = 0;
    let lidosSecTot = 0;
    let temDesconhecido = false;
    for (const m of lista) {
      if (m.t2) {
        lidos[0] += m.t2.votos[0];
        lidos[1] += m.t2.votos[1];
        lidosElei += m.t2.eleitorado;
        lidosEleiTot += m.t2.eleitoradoTotalizado;
        lidosSecTot += m.t2.secoesTotalizadas;
      }
      if (m.comecado) {
        const ve = esperadoObs(m);
        const resto = ve - m.v2;
        // o que falta segue o já apurado (encolhido para o 1º turno + swing com poucas seções, se `encolhimento` > 0)
        const stt = m.t2!.secoesTotalizadas;
        const pObs = m.t2!.votos[0] / m.v2;
        const pRest = prm.encolhimento > 0 && m.q1 !== null ? (stt * pObs + prm.encolhimento * qPrior(m)) / (stt + prm.encolhimento) : pObs;
        final[0] += m.t2!.votos[0] + resto * pRest;
        final[1] += m.t2!.votos[1] + resto * (1 - pRest);
        esperadoTotal += ve;
        apuradoTotal += m.v2;
        // incerteza do que falta: heterogeneidade interna, menor com mais seções apuradas; + parte sistemática
        if (resto > 0) {
          varIndep += (resto * resto * prm.varIntra) / (1 + prm.alfa * stt);
          sistTotal += resto * prm.sistIniciado;
        }
        continue;
      }
      if (m.w1 <= 0) continue; // sem 1º turno e sem urnas: não há como estimar (raro)
      const ve = m.w1 * r;
      const q = qPrior(m);
      if (!m.t2 && tot) {
        temDesconhecido = true;
        descEsperado += ve;
        descPrior0 += ve * q;
        const w = ve * (1 - m.fAb);
        descRestoW += w;
        // defasado: o já lido e o 1º turno + swing, pesados pela precisão de cada um (poucas seções lidas → perto do prior)
        let qr = q;
        if (m.pDefasado !== null) {
          const pObs = 1 / (prm.varIntra / (1 + prm.alfa * m.sDefasado));
          const pPri = 1 / (sw.var + prm.varMinMun);
          qr = (pObs * m.pDefasado + pPri * q) / (pObs + pPri);
        }
        descRestoQ += w * qr;
        descRestoW2 += w * w;
        continue;
      }
      final[0] += ve * q;
      final[1] += ve * (1 - q);
      esperadoTotal += ve;
      restoSemUrnas += ve;
      varIndep += ve * ve * (sw.var + prm.varMinMun);
    }
    if (tot && tot.votos.length === nCand) {
      // âncora oficial: a parte apurada dos desconhecidos é o total oficial − os lidos
      const ap = [Math.max(0, tot.votos[0] - lidos[0]), Math.max(0, tot.votos[1] - lidos[1])];
      const apS = ap[0] + ap[1];
      if (apS > 0 || temDesconhecido) {
        // volume: com parte apurada, o comparecimento observado nos desconhecidos (eleitorado oficial da UF − lidos);
        // sem, o do 1º turno × razão
        const eleiDesc = tot.eleitorado - lidosElei;
        const eleiTotDesc = tot.eleitoradoTotalizado - lidosEleiTot;
        const espObs = apS > 0 && eleiTotDesc > 0 && eleiDesc >= eleiTotDesc ? (apS * eleiDesc) / eleiTotDesc : 0;
        const esp = Math.max(espObs > 0 ? espObs : descEsperado, apS);
        const resto = esp - apS;
        // o que falta segue o 1º turno + swing de cada desconhecido, pesado pelo que falta nele (sem acompanhamento,
        // pelo volume inteiro); tudo já totalizado pelo acompanhamento: o do bloco inteiro
        const q = descRestoW > 0 ? descRestoQ / descRestoW : descEsperado > 0 ? descPrior0 / descEsperado : 0.5;
        final[0] += ap[0] + resto * q;
        final[1] += ap[1] + resto * (1 - q);
        esperadoTotal += esp;
        apuradoTotal += apS;
        restoSemUrnas += resto;
        // o que falta dos desconhecidos, espalhado pelos municípios deles (proporcional ao que falta em cada um)
        // (+ a heterogeneidade interna dos já começados entre eles, como num município começado)
        const fr = descRestoW > 0 ? resto / descRestoW : 1;
        const secDesc = Math.max(0, tot.secoesTotalizadas - lidosSecTot);
        varIndep += (descRestoW2 > 0 ? fr * fr * descRestoW2 : resto * resto) * (sw.var + prm.varMinMun) + (resto * resto * prm.varIntra) / (1 + prm.alfa * secDesc);
        if (apS > 0) sistTotal += resto * prm.sistIniciado;
      }
    }
    if (restoSemUrnas > 0) {
      varAmostra += restoSemUrnas * restoSemUrnas * varMedia;
      sistTotal += restoSemUrnas * sist;
    }
  }
  const total = final[0] + final[1];
  if (!(total > 0) || !(esperadoTotal > 0)) return null;
  const pct0 = (100 * final[0]) / total;
  const dp = (100 * Math.sqrt(varIndep + varAmostra + sistTotal * sistTotal)) / total;
  const meia = Math.max(prm.piso, e.totaisUf ? PISO_FAIXA_TSE_PP : 0, prm.fator * dp);
  // fonte TSE: quanto do já apurado oficialmente está em municípios conhecidos (lidos no cache ou no acompanhamento)
  let coberturaCache: number | undefined;
  if (e.totaisUf) {
    let lidas = 0;
    let oficiais = 0;
    for (const m of muns) if (e.totaisUf[m.uf]) lidas += Math.max(0, m.t2?.secoesTotalizadas ?? 0, m.ab?.secoesTotalizadas ?? 0);
    for (const uf of ufs) oficiais += Math.max(0, e.totaisUf[uf]?.secoesTotalizadas ?? 0);
    coberturaCache = oficiais > 0 ? Math.min(1, lidas / oficiais) : 0;
  }
  return {
    pct: [pct0, 100 - pct0],
    dp,
    meia,
    fracaoApurada: Math.min(1, apuradoTotal / esperadoTotal),
    validosEsperados: esperadoTotal,
    validosApurados: apuradoTotal,
    municipios: muns.length,
    municipiosComUrnas,
    ufs: ufs.size,
    ufsComUrnas: ufsComUrnas.size,
    ...(coberturaCache !== undefined ? { coberturaCache } : {}),
  };
}

// ---- da conta à resposta pública ----------------------------------------------------------------------------------

export interface ContextoProjecao {
  race: Pick<Race, 'id' | 'candidatos'>;
  /** 'BR' ou a UF. */
  abrangencia: string;
  simNow: number;
  /** Resumo da abrangência (placar): eco de % das seções, eleito e status. null = sem dados. */
  resumo: Pick<Summary, 'secoes' | 'secoesTotalizadas' | 'eleito'> | null;
  /** A apuração terminou (fase 'encerrada' ou 100% das seções). */
  encerrada?: boolean;
}

const pctSecoesDe = (r: ContextoProjecao['resumo']) => (r && r.secoes > 0 ? Math.min(100, (100 * r.secoesTotalizadas) / r.secoes) : 0);
const arred = (x: number, casas = 4) => {
  const k = 10 ** casas;
  return Math.round(x * k) / k;
};

/** Projeção indisponível (com o motivo). */
export function projecaoIndisponivel(ctx: ContextoProjecao, motivo: MotivoSemProjecao, fracaoApurada = 0): Projecao {
  return {
    race: ctx.race.id,
    abrangencia: ctx.abrangencia,
    disponivel: false,
    motivo,
    fracaoApurada: arred(Math.max(0, Math.min(1, fracaoApurada || 0))),
    pctSecoes: arred(pctSecoesDe(ctx.resumo)),
    candidatos: [],
    simNow: ctx.simNow,
  };
}

/** A abrangência já passou dos limiares (fração apurada e urnas espalhadas)? (Sem a trava do cache TSE.) */
export function projecaoLiberada(abrangencia: string, c: CalculoProjecao): boolean {
  if (!(c.fracaoApurada >= LIMIAR_FRACAO)) return false;
  if (abrangencia === 'BR') return c.ufsComUrnas >= Math.min(MIN_UFS_COM_URNAS, c.ufs);
  return c.municipios > 0 && c.municipiosComUrnas / c.municipios >= LIMIAR_MUNICIPIOS;
}

/** Fonte TSE, UF ou governador: o cache dos municípios cobre pouco do já apurado oficialmente (trava de cobertura)? */
export function coberturaCacheBaixa(abrangencia: string, c: CalculoProjecao): boolean {
  return abrangencia !== 'BR' && c.coberturaCache !== undefined && !(c.coberturaCache >= LIMIAR_COBERTURA_CACHE);
}

/**
 * Monta a resposta pública a partir do cálculo, aplicando as regras de exibição (na ordem): apuração encerrada →
 * 'encerrada'; resultado definido (eleito) → 'definido'; sem resumo/seções → 'cedo'; sem cálculo → 'sem-base';
 * abaixo dos limiares → 'cedo'; fonte TSE com o cache dos municípios cobrindo pouco (UF/governador) → 'sem-base'.
 */
export function montarProjecao(ctx: ContextoProjecao, c: CalculoProjecao | null): Projecao {
  const r = ctx.resumo;
  const fim = ctx.encerrada || (!!r && r.secoes > 0 && r.secoesTotalizadas >= r.secoes);
  if (fim) return projecaoIndisponivel(ctx, 'encerrada', c?.fracaoApurada ?? 1);
  if (r && r.eleito !== null && r.eleito !== undefined) return projecaoIndisponivel(ctx, 'definido', c?.fracaoApurada);
  if (!r || r.secoesTotalizadas <= 0) return projecaoIndisponivel(ctx, 'cedo');
  if (!c || ctx.race.candidatos.length !== 2) return projecaoIndisponivel(ctx, 'sem-base');
  if (!projecaoLiberada(ctx.abrangencia, c)) return projecaoIndisponivel(ctx, 'cedo', c.fracaoApurada);
  // 'sem-base' (não 'cedo'): o que falta não é fração apurada, e o app não mostra a dica dos 10%
  if (coberturaCacheBaixa(ctx.abrangencia, c)) return projecaoIndisponivel(ctx, 'sem-base', c.fracaoApurada);
  return {
    race: ctx.race.id,
    abrangencia: ctx.abrangencia,
    disponivel: true,
    fracaoApurada: arred(c.fracaoApurada),
    pctSecoes: arred(pctSecoesDe(r)),
    candidatos: ctx.race.candidatos.map((cand, i) => {
      const pct = c.pct[i];
      return { indice: i, numero: cand.numero, pct: arred(pct), min: arred(Math.max(0, pct - c.meia)), max: arred(Math.min(100, pct + c.meia)) };
    }),
    simNow: ctx.simNow,
  };
}
