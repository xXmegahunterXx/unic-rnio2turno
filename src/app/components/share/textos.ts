/**
 * Textos prontos para postar (X, WhatsApp, Web Share). Regras:
 *  - neutros e descritivos: só números e fatos, nada de "X vai ganhar", adjetivos ou torcida;
 *  - curtos: no máximo 240 caracteres (peso do X) ANTES do link — o link e as hashtags vão à parte;
 *  - "[SIMULAÇÃO]" na frente sempre que houver número simulado;
 *  - percentuais de src/shared/calc.ts e formatação de src/shared/format.ts.
 * Puro (sem React/DOM): testado em textos.test.ts.
 */
import type { FeedEvent, Race, Tally, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtHora, fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { emUf } from '@/engine/events';
import { pesoTextoX } from '@/app/lib/share';

/**
 * Limite do texto antes do link (peso do X). 220 ≤ 240 e deixa espaço para o link (23 + espaço) e até ~34 de
 * hashtags dentro dos 280 do X — o post sai da intenção sem precisar de corte.
 */
export const LIMITE_TEXTO = 220;
export const PREFIXO_SIMULACAO = '[SIMULAÇÃO] ';

/** Hashtags neutras (sem '#'), no máximo duas por post (≤ 34 de peso no X). */
export const HASHTAGS = {
  apuracao: ['Eleições2026', 'SegundoTurno'],
  governador: ['Eleições2026', 'Governador'],
  primeiroTurno: ['Eleições2026', 'PrimeiroTurno'],
  senado: ['Eleições2026', 'Senado'],
  camara: ['Eleições2026', 'CâmaraDosDeputados'],
  assembleia: ['Eleições2026', 'Assembleia'],
  candidato: ['Eleições2026'],
} as const satisfies Record<string, readonly string[]>;

export const hashtags = (k: keyof typeof HASHTAGS): string[] => [...HASHTAGS[k]];

/** Acrescenta "[SIMULAÇÃO] " quando simulado (sem duplicar). */
export function comPrefixoSimulacao(texto: string, simulado?: boolean): string {
  const t = texto.trim();
  if (!simulado || t.startsWith(PREFIXO_SIMULACAO.trim())) return t;
  return `${PREFIXO_SIMULACAO}${t}`;
}

/** Corta no limite (peso do X) na última palavra inteira, com "…". */
export function limitarTexto(texto: string, max = LIMITE_TEXTO): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (pesoTextoX(t) <= max) return t;
  const chars = Array.from(t);
  while (chars.length) {
    chars.pop();
    let base = chars.join('').trimEnd();
    const esp = base.lastIndexOf(' ');
    if (esp > base.length * 0.6) base = base.slice(0, esp);
    const c = `${base.replace(/[\s,;:·—–-]+$/, '')}…`;
    if (pesoTextoX(c) <= max) return c;
  }
  return '';
}

/** Monta o texto final: prefixo de simulação + limite. */
export function finalizar(texto: string, simulado?: boolean): string {
  return limitarTexto(comPrefixoSimulacao(texto, simulado));
}

const finalistas = (race: Pick<Race, 'candidatos'>) => race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);

/** "A 51,23% × B 48,77%" (2º turno) ou "A 47,03%, B 45,16% e demais 7,81%" (1º turno). */
export function placarEmTexto(race: Pick<Race, 'candidatos'>, t: Pick<Tally, 'votos'>, casas: 1 | 2 = 2): string {
  const fin = finalistas(race).map(({ c, i }) => `${c.nomeUrna} ${fmtPct(pctValidos(t, i), casas)}`);
  const outros = race.candidatos.findIndex((c) => c.agregado);
  if (outros >= 0) return `${fin.join(', ')} e demais candidatos ${fmtPct(pctValidos(t, outros), casas)}`;
  return fin.join(' × ');
}

/** "Brasil" para Presidente; o nome da UF para Governador. */
export function localDaRace(race: Pick<Race, 'abrangencia' | 'titulo'>): string {
  if (race.abrangencia === 'BR') return 'Brasil';
  return UF_NOMES[race.abrangencia as UF] ?? race.titulo.split('·').pop()?.trim() ?? '';
}

// =============================================================================================
// Apuração
// =============================================================================================

export interface TextoPlacarOpts {
  simulado?: boolean;
  /** Abrangência exibida (padrão: Brasil/UF da corrida). Ex.: "Campinas (SP)". */
  local?: string;
}

/** Placar (nacional, UF ou município). */
export function textoPlacar(
  race: Pick<Race, 'candidatos' | 'turno' | 'cargo' | 'abrangencia' | 'titulo'>,
  resumo: Tally & { eleito?: number | null; status?: string },
  opts: TextoPlacarOpts = {},
): string {
  const local = opts.local ?? localDaRace(race);
  const cab = `${race.cargo} · ${local}`;
  if (validos(resumo) === 0) {
    return finalizar(`Apuração do ${race.turno}º turno · ${cab}: acompanhe ao vivo, seção por seção.`, opts.simulado);
  }
  if (race.turno === 1) {
    return finalizar(`Resultado oficial do 1º turno · ${cab}: ${placarEmTexto(race, resumo)}.`, false);
  }
  const placar = placarEmTexto(race, resumo);
  const pst = pctTotalizadas(resumo);
  if (resumo.status === 'encerrada' || pst >= 100) {
    return finalizar(`${cab} · 2º turno, apuração encerrada: ${placar}.`, opts.simulado);
  }
  const eleito = resumo.eleito !== null && resumo.eleito !== undefined ? race.candidatos[resumo.eleito] : null;
  const fim = eleito ? ` Resultado matematicamente definido para ${eleito.nomeUrna}.` : '';
  return finalizar(`${cab} · 2º turno: ${placar}, com ${fmtPct(pst)} das seções totalizadas.${fim}`, opts.simulado);
}

/** Placar num instante passado ("Reveja a noite"). */
export function textoInstante(
  race: Pick<Race, 'candidatos' | 'turno' | 'cargo' | 'abrangencia' | 'titulo'>,
  resumo: Tally,
  t: number,
  opts: TextoPlacarOpts = {},
): string {
  const local = opts.local ?? localDaRace(race);
  const hora = fmtHora(t);
  if (validos(resumo) === 0) return finalizar(`Reveja a apuração · ${race.cargo} · ${local}, às ${hora}.`, opts.simulado);
  return finalizar(
    `Às ${hora}, com ${fmtPct(pctTotalizadas(resumo))} das seções: ${placarEmTexto(race, resumo)} · ${race.cargo} · ${local}. Reveja a apuração naquele instante.`,
    opts.simulado,
  );
}

/** Evento do feed ("momento" da noite). O título do evento já é neutro (e anonimizado quando preciso). */
export function textoMomento(evento: Pick<FeedEvent, 't' | 'titulo' | 'abrangencia'>, simulado?: boolean): string {
  const titulo = evento.titulo.replace(/[.\s]+$/, '');
  return finalizar(`${fmtHora(evento.t)} · ${titulo}. Reveja este momento da apuração.`, simulado);
}

export interface SecaoTextoDados {
  secao: number;
  zona: number;
  municipio: string;
  uf: UF;
  /** 1º turno (oficial) desta seção. */
  t1?: { race: Pick<Race, 'candidatos'>; t: Pick<Tally, 'votos'> } | null;
  /** 2º turno desta seção, se totalizada. */
  t2?: { race: Pick<Race, 'candidatos'>; t: Pick<Tally, 'votos'> } | null;
  /** Os números do 2º turno são simulados. */
  simulado?: boolean;
}

const f4 = (n: number) => String(n).padStart(4, '0');

/** "Como votou a minha seção" (boletim). */
export function textoSecao(d: SecaoTextoDados): string {
  const onde = `seção ${f4(d.secao)}, zona ${f4(d.zona)} · ${d.municipio}${d.uf === 'ZZ' ? '' : ` (${d.uf})`}`;
  const partes = [`Como votou a minha seção: ${onde}.`];
  const t2 = d.t2 && validos(d.t2.t) > 0 ? d.t2 : null;
  const t1 = d.t1 && validos(d.t1.t) > 0 ? d.t1 : null;
  if (t2) partes.push(`2º turno${d.simulado ? ' (simulação)' : ''}: ${placarEmTexto(d.t2!.race, t2.t, 1)}.`);
  if (t1) {
    const fin = finalistas(t1.race).map(({ c, i }) => `${c.nomeUrna} ${fmtPct(pctValidos(t1.t, i), 1)}`);
    partes.push(`1º turno (oficial): ${fin.join(', ')}.`);
  }
  if (!t1 && !t2) partes.push('Veja o boletim de urna.');
  return finalizar(partes.join(' '), !!t2 && d.simulado);
}

/** "Minha cidade no 1º turno" (resultado oficial). */
export function textoMunicipioT1(nome: string, uf: UF, race: Pick<Race, 'candidatos' | 'cargo'>, t: Pick<Tally, 'votos'>): string {
  const onde = uf === 'ZZ' ? nome : `${nome} (${uf})`;
  return finalizar(`Minha cidade no 1º turno: ${onde} · ${race.cargo} — ${placarEmTexto(race, t)}. Resultado oficial do TSE.`, false);
}

export interface GovTextoItem {
  uf: UF;
  /** Diferença entre os dois (p.p.), null sem votos. */
  dif: number | null;
  definida: boolean;
}

/** As 7 disputas de governador. */
export function textoGovernadores(itens: GovTextoItem[], opts: { simulado?: boolean; t1?: boolean; pst?: number }): string {
  const siglas = itens.map((i) => i.uf);
  const lista = siglas.length > 1 ? `${siglas.slice(0, -1).join(', ')} e ${siglas[siglas.length - 1]}` : siglas.join('');
  if (opts.t1) {
    return finalizar(`Governador no 2º turno em ${itens.length} estados (${lista}): veja como foi o 1º turno e acompanhe a apuração de 25/10.`, false);
  }
  const comVotos = itens.filter((i) => i.dif !== null);
  if (!comVotos.length) {
    return finalizar(`Apuração do 2º turno para governador em ${itens.length} estados (${lista}), ao vivo e seção por seção.`, opts.simulado);
  }
  const definidas = itens.filter((i) => i.definida).length;
  const apertada = comVotos.reduce((a, b) => (b.dif! < a.dif! ? b : a));
  const partes = [`Governador · 2º turno em ${itens.length} estados: ${definidas} de ${itens.length} com resultado definido`];
  if (opts.pst !== undefined) partes[0] += `, ${fmtPct(opts.pst)} das seções totalizadas`;
  partes[0] += '.';
  partes.push(`A disputa mais apertada é ${emUf(apertada.uf, UF_NOMES[apertada.uf])}: ${fmtPP(apertada.dif!).replace('+', '')} de diferença.`);
  return finalizar(partes.join(' '), opts.simulado);
}

// =============================================================================================
// Cargos do 1º turno (dados oficiais)
// =============================================================================================

export interface CandidatoTextoDados {
  nomeUrna: string;
  partido: string;
  numero: number;
  /** Cargo de exibição (com gênero): "Senadora", "Deputado Federal". */
  cargo: string;
  /** 'BR' ou a UF. */
  uf: 'BR' | UF;
  resultado?: { votos: number; pct: number } | null;
  /** Situação por extenso ("eleita", "2º turno"…), já com gênero. */
  situacao?: string;
}

/** Ficha do candidato. */
export function textoCandidato(d: CandidatoTextoDados): string {
  const onde = d.uf === 'BR' ? '' : ` · ${UF_NOMES[d.uf as UF] ?? d.uf}`;
  const cab = `${d.nomeUrna} (${d.partido} ${d.numero}) · ${d.cargo}${onde}`;
  if (!d.resultado) return finalizar(`${cab}: ficha com os dados públicos do TSE.`, false);
  const sitBruta = d.situacao && !/apura/i.test(d.situacao) ? d.situacao : '';
  const sit = !sitBruta ? '' : /2º turno/.test(sitBruta) ? ', disputa o 2º turno' : `, ${sitBruta.charAt(0).toLowerCase()}${sitBruta.slice(1)}`;
  return finalizar(
    `${cab} · 1º turno: ${fmtInt(d.resultado.votos)} votos (${fmtPct(d.resultado.pct)} dos válidos)${sit}. Ficha com os dados públicos do TSE.`,
    false,
  );
}

/** Composição de uma casa legislativa (maiores bancadas). */
export function textoComposicao(casa: string, total: number, bancadas: { sigla: string; eleitos: number }[], rotulo = 'cadeiras'): string {
  const top = bancadas.filter((b) => b.eleitos > 0).slice(0, 5);
  const resto = bancadas.filter((b) => b.eleitos > 0).length - top.length;
  const lista = top.map((b) => `${b.sigla} ${fmtInt(b.eleitos)}`).join(', ') + (resto > 0 ? ` e mais ${fmtInt(resto)} ${resto === 1 ? 'partido' : 'partidos'}` : '');
  return finalizar(`${casa} · eleição de 2026: as ${fmtInt(total)} ${rotulo} por partido — ${lista}. Resultado oficial do TSE.`, false);
}

/** Senadores eleitos numa UF. */
export function textoSenadoUf(uf: UF, eleitos: { nomeUrna: string; partido: string; pct: number }[]): string {
  const nomes = eleitos.map((e) => `${e.nomeUrna} (${e.partido}, ${fmtPct(e.pct, 1)})`);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes.join('');
  return finalizar(`Senado ${emUf(uf, UF_NOMES[uf])}: eleitos ${lista}. Resultado oficial do 1º turno de 2026 (TSE).`, false);
}
