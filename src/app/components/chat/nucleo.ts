/**
 * Chat ao vivo — regras puras do navegador (sem React, testáveis): juntar as consultas por id, contar as novas,
 * escolher o intervalo de consulta e o modo do painel no desktop. Contrato: src/shared/chat.ts.
 */
import type { ChatPublico, MensagemChat } from '@/shared/chat';
import { LIMITES_CHAT } from '@/shared/chat';
import { fmtCompact, fmtInt } from '@/shared/format';

/** Tempo sem consultar a partir do qual a aba recomeça a lista (o servidor lembra as removidas por 30 min). */
export const RECOMECAR_APOS_MS = 25 * 60_000;

/**
 * Junta a resposta do servidor ao que o navegador já tinha: tira as removidas e as anteriores ao "limpar tudo",
 * acrescenta as novas (por id), ordena por horário e guarda no máximo `max`. Devolve o MESMO array quando nada muda
 * (o React não redesenha à toa).
 *
 * Resposta completa (com `agora`): ela traz as últimas mensagens visíveis EM SEQUÊNCIA, então o que a aba tinha DENTRO
 * dessa janela (depois da 1ª recebida e até o instante da resposta) e não veio foi escondido ou apagado — sai mesmo que
 * o id já tenha saído da lista de removidas. `paradaMs`: tempo desde a última consulta; acima de `RECOMECAR_APOS_MS`
 * (aba escondida por muito tempo) a aba fica só com o que veio.
 */
export function juntarMensagens(
  atual: readonly MensagemChat[],
  r: Pick<ChatPublico, 'mensagens' | 'removidas' | 'limpaEm'> & { agora?: number },
  max: number = LIMITES_CHAT.local,
  paradaMs = 0,
): readonly MensagemChat[] {
  const fora = new Set(r.removidas);
  const recebidas = new Set(r.mensagens.map((m) => m.id));
  const completa = typeof r.agora === 'number';
  const inicio = r.mensagens.length ? r.mensagens[0].em : null;
  const recomecar = completa && paradaMs > RECOMECAR_APOS_MS;
  /** a aba tinha, a resposta deveria trazer e não trouxe */
  const sumiu = (m: MensagemChat) =>
    completa && !recebidas.has(m.id) && (recomecar || ((inicio === null || m.em > inicio) && m.em <= (r.agora as number)));
  const ids = new Set<string>();
  let mudou = false;
  const out: MensagemChat[] = [];
  for (const m of atual) {
    if (fora.has(m.id) || m.em <= r.limpaEm || sumiu(m)) {
      mudou = true;
      continue;
    }
    ids.add(m.id);
    out.push(m);
  }
  for (const m of r.mensagens) {
    if (ids.has(m.id) || fora.has(m.id) || m.em <= r.limpaEm) continue;
    ids.add(m.id);
    out.push(m);
    mudou = true;
  }
  if (!mudou) return atual;
  // estável: mesma hora → mantém a ordem de chegada (a do servidor)
  out.sort((a, b) => a.em - b.em);
  return out.length > max ? out.slice(out.length - max) : out;
}

/** Mensagens novas desde `vistoAte` (as próprias não contam). */
export function contarNovas(mensagens: readonly MensagemChat[], vistoAte: number, minhas: ReadonlySet<string>): number {
  let n = 0;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m.em <= vistoAte) break;
    if (!minhas.has(m.id)) n++;
  }
  return n;
}

/** Quem está interessado na sala agora: com a sala na tela, só o botão (contador) ou ninguém. */
export type Interesse = 'tela' | 'fundo';

/**
 * Intervalo até a próxima consulta (ms). Sala na tela e aberta: o que o servidor sugere (mín. 2,5 s). Só o botão:
 * bem mais devagar (o contador de novas não precisa de tempo real). Sala fechada: 15–30 s, para notar a abertura.
 * `falhas`: consultas seguidas com erro (recuo exponencial até 60 s).
 */
export function intervaloConsulta(pub: Pick<ChatPublico, 'aberta' | 'intervaloS'> | null, interesse: Interesse, falhas = 0): number {
  const sugerido = Math.max(2.5, pub?.intervaloS ?? 2.5) * 1000;
  let ms: number;
  if (!pub) ms = interesse === 'tela' ? 2500 : 8000;
  else if (!pub.aberta) ms = interesse === 'tela' ? 15_000 : 30_000;
  else ms = interesse === 'tela' ? sugerido : Math.max(10_000, sugerido * 3);
  if (falhas > 0) ms = Math.min(60_000, ms * 2 ** Math.min(falhas, 5));
  return ms;
}

/** Token aleatório do navegador (32 caracteres base64url, 192 bits). Não identifica a pessoa: só limita abusos. */
export function gerarToken(aleatorio: (n: number) => Uint8Array): string {
  const b = aleatorio(32);
  let s = '';
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (let i = 0; i < b.length; i++) s += alfabeto[b[i] & 63];
  return s;
}

/** "≈ 840 na sala", "≈ 12 mil na sala" (estimativa arredondada; null = sem medição → nada). */
export function textoPessoasSala(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return '1 pessoa na sala';
  return `${n < 10 ? '' : '≈ '}${n >= 10_000 ? fmtCompact(n) : fmtInt(n)} na sala`;
}

/** Contagem de reações por minuto, curta ("12", "1,2 mil"). */
export const fmtReacao = (n: number) => (n >= 10_000 ? fmtCompact(n) : fmtInt(n));

/** Página da apuração com a sala (para o painel): nacional ou de UF. */
export type PaginaSala = 'nacional' | 'uf';

/** Rotas com a sala da apuração: /apuracao e /apuracao/:uf (duas letras; "consulta" não conta). */
export function paginaDaSala(pathname: string): PaginaSala | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/apuracao') return 'nacional';
  if (/^\/apuracao\/[a-z]{2}$/i.test(p)) return 'uf';
  return null;
}

/** Largura do painel lateral no desktop (px). */
export const LARGURA_PAINEL = 360;

/**
 * No desktop (≥ 1024 px), o painel aberto EMPURRA a página ('doca') quando o layout dela continua o mesmo com a largura
 * que sobra. A página nacional troca para duas colunas (placar à esquerda, mapa à direita) a partir de 1360 px de
 * JANELA: empurrar entre 1360 e ~1760 espremeria o placar, então ali a sala abre como gaveta ('gaveta') por cima da
 * coluna do MAPA — NÃO modal (sem fundo escurecido, sem prender o foco: a página continua usável). Abaixo de 1200
 * (nacional) e de 1100 (UF) não dá para empurrar (os estilos de computador valem pela largura da JANELA, e o placar
 * encavala em ~700 px) nem pôr gaveta ao lado (cobriria só UM lado do placar — o percentual de um candidato e não o do
 * outro): ali a sala abre como FOLHA inferior centralizada ('folha'), como no celular, com o placar à vista acima.
 */
export function modoPainelDesktop(larguraJanela: number, pagina: PaginaSala): 'doca' | 'gaveta' | 'folha' {
  if (pagina === 'uf') return larguraJanela >= 1100 ? 'doca' : 'folha';
  if (larguraJanela < 1200) return 'folha';
  if (larguraJanela < 1360) return 'doca';
  if (larguraJanela >= 1360 + LARGURA_PAINEL + 40) return 'doca';
  return 'gaveta';
}

/**
 * Altura da folha no celular: do fim da linha dos % do placar até o pé da tela, entre um mínimo que ainda mostra
 * algumas mensagens e o máximo de sempre (58% da altura, até 560 px). Sem placar na tela: a altura de sempre.
 */
export function alturaFolhaCelular(janela: number, limitePct: number | null): number {
  const max = Math.min(Math.round(janela * 0.58), 560);
  // 360×740 e 375×667: ~300 px é o que cabe sem cortar os % (lista com 2+ mensagens); abaixo disso, a lista some
  const min = Math.min(max, 300);
  if (limitePct === null || !Number.isFinite(limitePct)) return max;
  return Math.round(Math.min(max, Math.max(min, janela - limitePct)));
}
