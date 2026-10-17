/**
 * Texto do placar para os bots de chat das lives (I22, leva 3): o `!apuracao` do Nightbot, do StreamElements e do
 * Fossabot pede `GET /api/texto/placar?race=pres&uf=sp` e escreve a resposta no chat. Puro e isomórfico: o servidor
 * (src/server/texto-placar.ts) monta a entrada; a página /streamers usa as mesmas constantes; testado em
 * texto-placar.test.ts.
 *
 * Regras (ARCHITECTURE §1 e §11.10):
 *  - texto puro, curto (alvo ≤ 200 caracteres — o limite do chat do YouTube; nunca mais de 380), sempre com o endereço;
 *  - candidatos na ORDEM DA URNA (menor número primeiro), mesmo formato para os dois, sem "lidera", sem adjetivo;
 *  - nenhum nome antes das 17h de 25/10: na fase 'pre' só a contagem regressiva e, no dia da votação (0h–17h de
 *    Brasília, pelo relógio REAL), só "a apuração começa às 17h" (Lei 9.504/97, art. 39, § 5º);
 *  - simulação: "[SIMULAÇÃO]" na frente e SEMPRE "Candidato A/B", sem partido (mesmo com os nomes reais no painel);
 *  - Presidente numa UF: nunca "eleito" (o resultado de um estado não elege ninguém);
 *  - chave 'texto-bots' desligada no painel: só o endereço do site.
 */
import type { LiveStatus, Race, Summary, UF } from './types';
import { UFS } from './types';
import { INICIO_APURACAO, UF_NOMES, UFS_GOV_2T } from './constants';
import { diaDeVotacaoAntesDas17 } from './diaVotacao';
import { pctTotalizadas, pctValidos, validos } from './calc';
import { fmtHora, fmtInt, fmtPct, normalize } from './format';
import { anonimizarRace } from './anon';

export const TEXTO_PLACAR = {
  /** rota pública (a Regra 1 da Cloudflare guarda `/api/texto/`) */
  rota: '/api/texto/placar',
  /** nunca passa disto (o Nightbot corta em 400 no Twitch) */
  max: 380,
  /** alvo: cabe no chat do YouTube (200) — as versões mais curtas entram antes de passar daqui */
  alvo: 200,
  /** a borda guarda a resposta por tantos segundos (o navegador, nada) */
  bordaS: 5,
  /** pedidos por canal de bot (Nightbot-Channel e afins) por minuto na origem; acima, só o endereço */
  porCanalMin: 20,
  /**
   * MONTAGENS novas do texto por minuto na origem, somando todas (o texto já montado nos últimos 2 s sai sem contar;
   * nunca por IP: os bots dividem poucos endereços); acima, quem pede um texto que precisaria ser montado recebe só o endereço
   */
  globalMin: 6000,
} as const;

/** Endereço exibido quando o servidor não tem PUBLIC_URL. */
export const DOMINIO_TEXTO_PADRAO = 'sintonia2026.com.br';

/** 0h de 25/10/2026 em Brasília e o "dia da votação antes das 17h" (relógio REAL): fonte única em diaVotacao.ts. */
export { INICIO_DIA_VOTACAO, diaDeVotacaoAntesDas17 } from './diaVotacao';

export const PREFIXO_SIMULACAO_TEXTO = '[SIMULAÇÃO] ';

// =============================================================================================
// Consulta (`race` e `uf` da URL; `uf` é o que o público digita depois do comando)
// =============================================================================================

export type RaceTexto = 'pres' | `gov-${Lowercase<UF>}`;

export interface ConsultaTexto {
  race: RaceTexto;
  /** Presidente numa UF (null = Brasil). Nas disputas de governador é sempre null (a disputa já é da UF). */
  uf: UF | null;
}

const norm = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Nomes normalizados → UF, do mais longo para o mais curto ("mato grosso do sul" antes de "mato grosso"). */
const NOMES_UF: [string, UF][] = ([...UFS, 'ZZ'] as UF[])
  .map((u) => [norm(UF_NOMES[u]), u] as [string, UF])
  .concat([
    ['brasilia', 'DF'],
    ['fora do brasil', 'ZZ'],
  ])
  .sort((a, b) => b[0].length - a[0].length);

const SIGLAS = new Set<string>([...UFS.map((u) => u.toLowerCase()), 'zz']);
const PALAVRAS_GOV = /\b(gov|governador|governadora|governo)\b/;
const PALAVRAS_BRASIL = /^(br|brasil|brazil|nacional|presidente|pres|todos?)$/;

/**
 * UF citada num texto livre ("pe", "PE", "Pernambuco", "sao-paulo", "em São Paulo", "rio grande do sul"); null = nenhuma.
 * Nome por extenso tem prioridade sobre sigla solta. Puro (testado).
 */
export function ufDoTexto(bruto: string | null | undefined): UF | null {
  const t = norm(String(bruto ?? '').slice(0, 80));
  if (!t || PALAVRAS_BRASIL.test(t)) return null;
  const comEspaco = ` ${t} `;
  for (const [nome, uf] of NOMES_UF) if (comEspaco.includes(` ${nome} `)) return uf;
  for (const tok of t.split(' ')) if (tok.length === 2 && SIGLAS.has(tok)) return tok.toUpperCase() as UF;
  return null;
}

/**
 * Lê `race` e `uf` da URL. `race` aceita 'pres' e as disputas de governador do 2º turno (`UFS_GOV_2T`); qualquer outra
 * coisa vira Presidente. `uf` aceita sigla ou nome (com ou sem acento); com "gov"/"governador" e uma UF que tem 2º turno
 * de governador, vira aquela disputa; inválido = Brasil. Puro (testado).
 */
export function lerConsultaTexto(race: string | null | undefined, uf: string | null | undefined): ConsultaTexto {
  const r = String(race ?? '').trim().toLowerCase();
  const gov = /^gov-([a-z]{2})$/.exec(r);
  if (gov && UFS_GOV_2T.includes(gov[1].toUpperCase() as UF)) return { race: r as RaceTexto, uf: null };
  const u = ufDoTexto(uf);
  if (u && u !== 'ZZ' && PALAVRAS_GOV.test(norm(String(uf ?? ''))) && UFS_GOV_2T.includes(u)) {
    return { race: `gov-${u.toLowerCase()}` as RaceTexto, uf: null };
  }
  return { race: 'pres', uf: u };
}

// =============================================================================================
// Texto
// =============================================================================================

export interface EntradaTextoPlacar {
  /** relógio REAL do servidor (epoch ms): decide o dia da votação */
  agora: number;
  /** chave 'texto-bots' do painel */
  ligado: boolean;
  /** "sintonia2026.com.br" */
  dominio: string;
  /** status do motor (null = indisponível) */
  status: Pick<LiveStatus, 'fase' | 'simulacao' | 'anonimizado' | 'simNow' | 'inicioApuracao'> | null;
  /** a disputa do 2º turno com os nomes REAIS (a anonimização é aplicada aqui) */
  race: Pick<Race, 'cargo' | 'turno' | 'abrangencia' | 'titulo' | 'candidatos'> | null;
  /** Presidente numa UF (null = Brasil) */
  uf: UF | null;
  /** resumo da abrangência pedida (null = sem dados agora) */
  resumo: Pick<Summary, 'votos' | 'secoes' | 'secoesTotalizadas' | 'status' | 'eleito' | 'ultimaAtualizacao'> | null;
}

/** "8 dias e 3 h", "1 dia", "3 h 12 min", "12 min", "menos de 1 min". Puro. */
export function tempoQueFalta(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${fmtInt(d)} ${d === 1 ? 'dia' : 'dias'}${h > 0 ? ` e ${fmtInt(h)} h` : ''}`;
  if (h > 0) return `${fmtInt(h)} h${m > 0 ? ` ${fmtInt(m)} min` : ''}`;
  if (m > 0) return `${fmtInt(m)} min`;
  return 'menos de 1 min';
}

/** Cabeçalho da disputa: "Presidente · 2º turno", "Presidente · Pernambuco · 2º turno", "Governador · Acre · 2º turno". */
export function cabecalhoTexto(race: EntradaTextoPlacar['race'], uf: UF | null): string {
  if (race && race.cargo === 'Governador') {
    const u = race.abrangencia === 'BR' ? null : race.abrangencia;
    return `Governador · ${u ? UF_NOMES[u] : race.titulo.replace(/^Governador · /, '')} · 2º turno`;
  }
  return uf ? `Presidente · ${UF_NOMES[uf]} · 2º turno` : 'Presidente · 2º turno';
}

/** Escolhe a 1ª versão que cabe no alvo (≤ 200); senão a 1ª que cabe no máximo; senão corta. */
function caber(versoes: string[]): string {
  const limpas = versoes.map((v) => v.replace(/\s+/g, ' ').trim());
  const alvo = limpas.find((v) => v.length <= TEXTO_PLACAR.alvo);
  if (alvo) return alvo;
  const max = limpas.find((v) => v.length <= TEXTO_PLACAR.max);
  if (max) return max;
  const menor = limpas.reduce((a, b) => (b.length < a.length ? b : a));
  return `${menor.slice(0, TEXTO_PLACAR.max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Resposta do `GET /api/texto/placar`. Puro (testado: tamanho, ordem da urna, sem nome antes das 17h). */
export function textoPlacarBot(e: EntradaTextoPlacar): string {
  const dom = e.dominio || DOMINIO_TEXTO_PADRAO;
  if (!e.ligado) return dom;
  const fim = `Acompanhe seção por seção: ${dom}`;
  const fimCurto = dom;

  // dia da votação, antes das 17h: nada de nome nem número de candidato, nem na simulação
  if (diaDeVotacaoAntesDas17(e.agora)) {
    return caber([`A apuração do 2º turno começa hoje, às 17h (horário de Brasília). ${fim}`, `A apuração começa às 17h (Brasília) · ${fimCurto}`]);
  }

  const sim = !!e.status?.simulacao;
  const pre = (txt: string) => (sim ? `${PREFIXO_SIMULACAO_TEXTO}${txt}` : txt);
  const cab = cabecalhoTexto(e.race, e.uf);

  // antes da apuração: só a contagem regressiva (sem nomes)
  if (!e.status || e.status.fase === 'pre') {
    const falta = e.status ? e.status.inicioApuracao - e.status.simNow : INICIO_APURACAO - e.agora;
    const quando = 'começa em 25/10, às 17h (horário de Brasília)';
    const faltam = falta > 0 ? ` Faltam ${tempoQueFalta(falta)}.` : '';
    return caber([
      pre(`${cab}: a apuração ${quando}.${faltam} ${fim}`),
      pre(`${cab}: a apuração ${quando}.${faltam} ${fimCurto}`),
      pre(`Apuração do 2º turno: 25/10, às 17h (Brasília).${faltam} ${fimCurto}`),
    ]);
  }

  if (!e.race || !e.resumo) return caber([pre(`${cab}: apuração em andamento. ${fim}`), pre(`${cab} · ${fimCurto}`)]);
  if (validos(e.resumo) === 0) {
    return caber([pre(`${cab}: aguardando as primeiras seções totalizadas. ${fim}`), pre(`${cab}: aguardando os primeiros dados · ${fimCurto}`)]);
  }

  // simulação SEMPRE com os nomes ocultos no texto dos bots, mesmo que o painel mostre os nomes reais: um "[SIMULAÇÃO]
  // Lula x%…" colado num chat circula sem o prefixo (print fora de contexto) — o plano descartou o ensaio fictício na /live
  const anon = !!e.status.anonimizado || sim;
  const race = anon ? anonimizarRace(e.race as Race) : e.race;
  // ordem da urna: menor número primeiro (com os nomes ocultos, A antes de B — a mesma ordem)
  const fin = race.candidatos
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.agregado)
    .sort((a, b) => (anon ? a.i - b.i : a.c.numero - b.c.numero));
  const placar = (partido: boolean) =>
    fin.map(({ c, i }) => `${c.nomeUrna}${partido && !anon && c.partido ? ` (${c.partido})` : ''} ${fmtPct(pctValidos(e.resumo!, i))}`).join(' × ');

  const encerrada = e.resumo.status === 'encerrada';
  const pst = pctTotalizadas(e.resumo);
  // "eleito" só na abrangência da própria disputa (Presidente numa UF nunca)
  const daDisputa = e.uf === null || race.cargo === 'Governador';
  const eleito = daDisputa && e.resumo.eleito !== null && e.resumo.eleito !== undefined ? race.candidatos[e.resumo.eleito] : undefined;
  const definido = eleito
    ? race.cargo === 'Presidente'
      ? `${eleito.nomeUrna} ${encerrada ? 'é eleito' : 'está matematicamente eleito'} presidente.`
      : `Resultado ${encerrada ? 'definido' : 'matematicamente definido'} para ${eleito.nomeUrna}.`
    : '';
  const hora = !encerrada && e.resumo.ultimaAtualizacao ? `Dado das ${fmtHora(e.resumo.ultimaAtualizacao)} (Brasília).` : '';

  const corpo = (partido: boolean) =>
    encerrada ? `${cab}, apuração encerrada: ${placar(partido)} dos votos válidos.` : `${cab}: ${placar(partido)} dos votos válidos, com ${fmtPct(pst)} das seções totalizadas.`;
  const corpoCurto = encerrada ? `${cab}, encerrada: ${placar(false)}.` : `${cab}: ${placar(false)} · ${fmtPct(pst)} das seções.`;

  // da mais completa para a mais curta: sai primeiro o horário e a chamada, depois os partidos, depois o resto
  return caber([
    pre(`${corpo(true)} ${definido} ${hora} ${fim}`),
    pre(`${corpo(true)} ${definido} ${fimCurto}`),
    pre(`${corpo(false)} ${definido} ${hora} ${fim}`),
    pre(`${corpo(false)} ${definido} ${fimCurto}`),
    pre(`${corpoCurto} ${definido} ${fimCurto}`),
    pre(`${corpoCurto} ${fimCurto}`),
  ]);
}

// =============================================================================================
// Comandos prontos para a página /streamers
// =============================================================================================

export type BotChat = 'nightbot' | 'streamelements' | 'fossabot';

/** Opções do comando: estado fixo (Presidente) ou disputa de governador; null/ausente = Brasil. */
export interface AlvoTexto {
  uf?: UF | null;
  race?: string | null;
}

/** Endereço do texto para um estado fixo, uma disputa de governador ou o Brasil. Puro. */
export function urlTextoPlacar(site: string, alvo: AlvoTexto = {}): string {
  const base = `${site.replace(/\/+$/, '')}${TEXTO_PLACAR.rota}`;
  const q = lerConsultaTexto(alvo.race ?? null, alvo.uf ?? null);
  if (q.race !== 'pres') return `${base}?race=${q.race}`;
  return q.uf ? `${base}?uf=${q.uf.toLowerCase()}` : base;
}

export interface ComandoBot {
  /** o que colar no chat do próprio canal (como dono ou moderador) para criar o comando; ausente = só pelo painel do bot */
  chat?: string;
  /** a resposta do comando (para criar pelo painel do bot) */
  resposta: string;
}

/**
 * Como criar o `!apuracao` em cada bot. Com alvo fixo (estado ou governador), sempre aquele; sem alvo (Brasil), no
 * Nightbot o público ainda pode digitar o estado depois do comando (`!apuracao pe`, `!apuracao são paulo`,
 * `!apuracao governador df`), pelo `$(querystring)`. Puro (testado).
 */
export function comandoBot(bot: BotChat, site: string, alvo: AlvoTexto = {}, comando = '!apuracao'): ComandoBot {
  const fixa = urlTextoPlacar(site, alvo);
  const livre = !fixa.includes('?');
  switch (bot) {
    case 'nightbot': {
      const resposta = `$(urlfetch ${livre ? `${fixa}?uf=$(querystring)` : fixa})`;
      return { chat: `!addcom ${comando} ${resposta}`, resposta };
    }
    case 'streamelements': {
      const resposta = `\${customapi.${fixa}}`;
      return { chat: `!command add ${comando} ${resposta}`, resposta };
    }
    case 'fossabot':
      return { resposta: `$(customapi ${fixa})` };
  }
}

/** Mensagem do timer (a cada 5 min ou mais), para colar no painel do bot: sempre o alvo fixo (ou o Brasil). Puro. */
export function mensagemTimer(bot: BotChat, site: string, alvo: AlvoTexto = {}): string {
  const url = urlTextoPlacar(site, alvo);
  if (bot === 'nightbot') return `$(urlfetch ${url})`;
  if (bot === 'streamelements') return `\${customapi.${url}}`;
  return `$(customapi ${url})`;
}
