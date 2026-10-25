/**
 * Chat ao vivo — regras puras do navegador (sem React, testáveis): juntar as consultas por id, contar as novas,
 * escolher o intervalo de consulta (e acordar na hora da abertura), a fase da sala, a posição do popup no computador,
 * quando ele se recolhe sozinho diante de candidato e a preferência lembrada. Contrato: src/shared/chat.ts.
 */
import type { ChatPublico, MensagemChat } from '@/shared/chat';
import { LIMITES_CHAT } from '@/shared/chat';
import { FIM_VOTACAO } from '@/shared/diaVotacao';
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

/** Quem está interessado na sala agora: com a sala na tela, só o botão/pílula (contador) ou ninguém. */
export type Interesse = 'tela' | 'fundo';

/**
 * Intervalo até a próxima consulta (ms). Sala na tela e aberta: o que o servidor sugere (mín. 2,5 s). Só a pílula
 * minimizada (o chat agora fica em todas as páginas): bem mais devagar, só para o contador de novas (mín. 12 s, 4× o
 * sugerido). Sala fechada: raramente — 20 s com a sala na tela (a contagem e as regras), 90 s minimizada (quem está em
 * qualquer página do site só precisa notar a abertura; a hora marcada acorda antes: `proximaConsulta`).
 * `falhas`: consultas seguidas com erro (recuo exponencial até 60 s).
 */
export function intervaloConsulta(pub: Pick<ChatPublico, 'aberta' | 'intervaloS'> | null, interesse: Interesse, falhas = 0): number {
  const sugerido = Math.max(2.5, pub?.intervaloS ?? 2.5) * 1000;
  let ms: number;
  if (!pub) ms = interesse === 'tela' ? 2500 : 8000;
  else if (!pub.aberta) ms = interesse === 'tela' ? 20_000 : 90_000;
  else ms = interesse === 'tela' ? sugerido : Math.max(12_000, sugerido * 4);
  if (falhas > 0) ms = Math.min(60_000, ms * 2 ** Math.min(falhas, 5));
  return ms;
}

/**
 * Até a próxima consulta (ms), acordando na hora da abertura: com a sala fechada antes do fim da votação (19h de 25/10,
 * `FIM_VOTACAO`; eram 17h até a prorrogação), pelo relógio do SERVIDOR, a consulta seguinte nunca passa da abertura
 * + 1 s + um sorteio de até 15 s (`sorteio` em [0, 1): as abas abertas no site inteiro não chegam todas no mesmo segundo).
 */
export function proximaConsulta(
  pub: Pick<ChatPublico, 'aberta' | 'intervaloS'> | null,
  interesse: Interesse,
  falhas: number,
  agoraServidor: number,
  sorteio: number,
): number {
  const ms = intervaloConsulta(pub, interesse, falhas);
  if (!pub || pub.aberta || falhas > 0 || agoraServidor >= FIM_VOTACAO) return ms;
  return Math.min(ms, FIM_VOTACAO - agoraServidor + 1000 + Math.round(Math.min(1, Math.max(0, sorteio)) * 15_000));
}

/**
 * Fase da sala para o widget: 'demo' (build estático, sala desligada), 'conectando' (antes da 1ª resposta), 'aberta'
 * (recebendo mensagens), 'antes' (fechada antes do fim da votação, 19h de 25/10: a pílula diz quando abre) e 'fechada' (fechada depois
 * da hora marcada: a moderação fechou ou a noite acabou — a pílula some).
 */
export type FaseChat = 'demo' | 'conectando' | 'aberta' | 'antes' | 'fechada';

export function faseChat(pub: Pick<ChatPublico, 'aberta'> | null, indisponivel: boolean, agoraServidor: number): FaseChat {
  if (indisponivel) return 'demo';
  if (!pub) return 'conectando';
  if (pub.aberta) return 'aberta';
  return agoraServidor < FIM_VOTACAO ? 'antes' : 'fechada';
}

const DIA_MS = 86_400_000;
/** Dia do calendário em Brasília (UTC−3, sem horário de verão). */
const diaBrasilia = (t: number) => Math.floor((t - 3 * 3_600_000) / DIA_MS);
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Quando a sala abre (o fim da votação, `FIM_VOTACAO`), curto, para a pílula: "abre hoje, 19h", "abre amanhã, 19h",
 * "abre domingo, 19h" (até 6 dias antes) ou "abre 25/10, 19h". Depois da hora: null.
 */
export function textoAbertura(agora: number, inicio = FIM_VOTACAO): string | null {
  if (!Number.isFinite(agora) || agora >= inicio) return null;
  const dias = diaBrasilia(inicio) - diaBrasilia(agora);
  const d = new Date(inicio - 3 * 3_600_000);
  const hora = `${d.getUTCHours()}h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, '0') : ''}`;
  const quando =
    dias <= 0
      ? 'hoje'
      : dias === 1
        ? 'amanhã'
        : dias <= 6
          ? DIAS_SEMANA[d.getUTCDay()]
          : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `abre ${quando}, ${hora}`;
}

/** Contagem até a abertura (dias, horas, minutos, segundos; tudo 0 depois da hora). */
export function contagemAbertura(agora: number, inicio = FIM_VOTACAO): { dias: number; horas: number; minutos: number; segundos: number; ms: number } {
  const ms = Math.max(0, inicio - (Number.isFinite(agora) ? agora : inicio));
  const s = Math.floor(ms / 1000);
  return { dias: Math.floor(s / 86_400), horas: Math.floor((s % 86_400) / 3600), minutos: Math.floor((s % 3600) / 60), segundos: s % 60, ms };
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

/** Página da apuração (nacional ou de UF): no celular, a folha abre com o placar à vista acima dela. */
export type PaginaSala = 'nacional' | 'uf';

/** Páginas da apuração com placar no topo: /apuracao e /apuracao/:uf (duas letras; "consulta" não conta). */
export function paginaDaSala(pathname: string): PaginaSala | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/apuracao') return 'nacional';
  if (/^\/apuracao\/[a-z]{2}$/i.test(p)) return 'uf';
  return null;
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

/**
 * Folha do celular fora das páginas da apuração (sem placar para deixar à vista): alta, quase a tela inteira abaixo do
 * cabeçalho (CSS: vale a menor das duas).
 */
export const ALTURA_FOLHA_ALTA = 'min(88dvh, calc(100dvh - var(--app-header-h, 56px) - 8px))';

// ---- popup do computador ------------------------------------------------------------------------------------------

/** Retângulo na tela (px, coordenadas da janela, como `getBoundingClientRect`). */
export interface Retangulo {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** O retângulo aumentado `px` de cada lado (respiro da área vigiada). */
export function inflar(r: Retangulo, px: number): Retangulo {
  return { top: r.top - px, left: r.left - px, right: r.right + px, bottom: r.bottom + px };
}

/**
 * Respiros das áreas vigiadas (px de cada lado): o popup aberto recolhe com um bloco com candidato a menos de
 * `RESPIRO_POPUP` (nunca encostado nele); a faixa "Sala oferecida por" some com um bloco a menos de `RESPIRO_ANUNCIO`
 * (o mesmo respiro da barra de anúncio do celular — ARCHITECTURE §1.5: anúncio nunca colado a resultado).
 */
export const RESPIRO_POPUP = 16;
export const RESPIRO_ANUNCIO = 48;

/**
 * Sem pisca-pisca na borda de um bloco (rolagem lenta, bloco que cresce um pouco): a área OCUPA na hora em que cruza um
 * bloco com o respiro de sempre, mas só LIBERA quando fica livre com `HISTERESE_POPUP` px a mais de folga e assim
 * continua por `ESPERA_REABRIR_MS` (o popup reabre sozinho um instante depois de o bloco sair de baixo, não no meio da
 * rolagem).
 */
export const HISTERESE_POPUP = 8;
export const ESPERA_REABRIR_MS = 500;

/**
 * Próximo passo de uma área vigiada: 'ocupa' (fica ou passa a ocupada, na hora), 'espera' (estava ocupada e agora está
 * livre com folga: libera depois da espera) ou 'livre' (continua livre). `perto` = um bloco cruza a área com o respiro;
 * `naFolga` = cruza a área com o respiro + a histerese. Na 1ª medição vale só o respiro (sem histerese: o popup nasce
 * aberto se a área dele está livre) e não há espera.
 */
export function decidirOcupacao(e: { ocupada: boolean; perto: boolean; naFolga: boolean; primeira?: boolean }): 'ocupa' | 'espera' | 'livre' {
  if (e.perto) return 'ocupa';
  if (e.primeira) return 'livre';
  if (!e.ocupada) return 'livre';
  return e.naFolga ? 'ocupa' : 'espera';
}

/**
 * Rolagem em curso: os blocos chegam ao popup pelo lado de onde a página vem (rolando para baixo, sobem pelo pé da tela;
 * para cima, descem pelo topo). A detecção vem depois do quadro (o navegador rola a página antes de o script saber), então
 * a área vigiada do popup CRESCE nessa direção — 4× o passo do último quadro, entre `ANTECIPA_MIN_PX` e
 * `ANTECIPA_MAX_PX` — enquanto houver rolagem há menos de `ANTECIPA_JANELA_MS`: o popup recolhe antes de o bloco chegar.
 * `dy` = quanto a página rolou no último quadro (px; > 0 para baixo; 0 = parada).
 */
export const ANTECIPA_MIN_PX = 96;
export const ANTECIPA_MAX_PX = 240;
export const ANTECIPA_JANELA_MS = 220;
export function antecipar(r: Retangulo, dy: number): Retangulo {
  if (!dy || !Number.isFinite(dy)) return r;
  return estender(r, dy, Math.min(ANTECIPA_MAX_PX, Math.max(ANTECIPA_MIN_PX, Math.abs(dy) * 4)));
}

/**
 * Sem pisca-pisca na rolagem: com a página rolando, o popup recolhido só REABRE se o caminho à frente estiver livre por
 * `PERMANENCIA_MIN_MS` na velocidade atual — a folga da histerese cresce, na direção da rolagem, `velocidade ×
 * PERMANENCIA_MIN_MS` (até `ALCANCE_MAX_PX`). Rolando rápido por uma página cheia de blocos, ele espera a rolagem
 * acalmar; rolando devagar (lendo), reabre nos trechos livres. `vPxMs` = velocidade da rolagem (px/ms).
 */
export const PERMANENCIA_MIN_MS = 700;
export const ALCANCE_MAX_PX = 1200;
export function alcanceReabrir(vPxMs: number): number {
  if (!Number.isFinite(vPxMs) || vPxMs <= 0) return 0;
  return Math.round(Math.min(ALCANCE_MAX_PX, vPxMs * PERMANENCIA_MIN_MS));
}

/** O retângulo estendido `px` na direção da rolagem (`dy` > 0: para baixo; < 0: para cima). */
export function estender(r: Retangulo, dy: number, px: number): Retangulo {
  if (!dy || !(px > 0)) return r;
  return dy > 0 ? { ...r, bottom: r.bottom + px } : { ...r, top: r.top - px };
}

/** Os dois retângulos se cruzam (área > 0)? */
export function cruza(a: Retangulo, b: Retangulo): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top && a.right > a.left && a.bottom > a.top;
}

/** Medidas do popup do computador (px). */
export const POPUP = {
  largura: 360,
  larguraGrande: 420,
  altura: 540,
  alturaGrande: 920,
  /** nunca mais baixo que isto (cabeçalho, uma ou duas mensagens e o campo) */
  alturaMin: 300,
  /** janela baixa (notebook 1280×720, 1366×768): no máximo esta altura — o popup não toma 3/4 da tela */
  alturaBaixa: 420,
  /** até esta altura de janela, vale `alturaBaixa` */
  janelaBaixa: 800,
  /** distância das bordas da janela (24 a partir de 1440 px) */
  margem: 20,
  /** respiro entre o cabeçalho do site e o topo do popup */
  folgaTopo: 16,
  /** pílula da doca minimizada (≥ 1760 px): área vigiada no canto (cabe "Chat ao vivo · abre domingo, 19h") */
  pilulaLargura: 300,
  pilulaAltura: 44,
} as const;

/**
 * Onde o popup fica (canto inferior direito, ~360×540, responsivo à altura da janela; até 420 de altura em janela de até
 * 800 px): `grande` = mais largo e com a altura toda abaixo do cabeçalho. Devolve o retângulo na tela (a área vigiada,
 * antes do respiro) e o tamanho.
 */
export function geometriaPopup(janela: { largura: number; altura: number }, cabecalho: number, grande = false): Retangulo & { largura: number; altura: number; margem: number } {
  const margem = janela.largura >= 1440 ? 24 : POPUP.margem;
  const largura = Math.min(grande ? POPUP.larguraGrande : POPUP.largura, Math.max(280, janela.largura - 2 * margem));
  const livre = janela.altura - Math.max(0, cabecalho) - POPUP.folgaTopo - margem;
  const teto = grande ? POPUP.alturaGrande : janela.altura <= POPUP.janelaBaixa ? POPUP.alturaBaixa : POPUP.altura;
  const altura = Math.round(Math.max(Math.min(POPUP.alturaMin, livre), Math.min(teto, livre)));
  const right = janela.largura - margem;
  const bottom = janela.altura - margem;
  return { largura, altura, margem, right, bottom, left: right - largura, top: bottom - altura };
}

/**
 * Régua das peças `position: fixed` (popup, pílula, doca): a largura da janela SEM a barra de rolagem
 * (`documentElement.clientWidth`, `util`). Com a barra clássica (Windows, 15–17 px), `innerWidth` poria a área vigiada
 * à direita do popup real e o respiro esquerdo cairia para ~1 px. Sem medida útil, a largura da janela.
 */
export function reguaFixa(j: { largura: number; altura: number; util?: number }): { largura: number; altura: number } {
  const u = typeof j.util === 'number' && j.util > 0 ? Math.min(j.util, j.largura) : j.largura;
  return { largura: u, altura: j.altura };
}

/** Área da pílula da doca minimizada (canto inferior direito; ≥ 1760 px). */
export function regiaoPilula(janela: { largura: number; altura: number }): Retangulo {
  const margem = janela.largura >= 1440 ? 24 : POPUP.margem;
  const right = janela.largura - margem;
  const bottom = janela.altura - margem;
  return { right, bottom, left: right - POPUP.pilulaLargura, top: bottom - POPUP.pilulaAltura };
}

/**
 * Margem lateral que o conteúdo deixa livre no computador (`Container` largo: `lg:px-8` = 32 px, até 1440 px de
 * conteúdo; depois disso, centralizado). `larguraUtil` = largura da janela sem a barra de rolagem
 * (`documentElement.clientWidth`), a mesma régua do `position: fixed`.
 */
export const CONTEUDO_LARGO = 1440;
export const RESPIRO_LATERAL_CONTEUDO = 32;
export function margemConteudo(larguraUtil: number): number {
  return RESPIRO_LATERAL_CONTEUDO + Math.max(0, (larguraUtil - CONTEUDO_LARGO) / 2);
}

/**
 * Largura da ABA recolhida (computador 1024–1759): a aba vertical "Chat ao vivo" fica NA MARGEM DIREITA, sem cobrir
 * conteúdo nenhum — 32 px quando a margem tem 48 px ou mais; senão até 28 px, sempre a ≥ 4 px do conteúdo (numa margem
 * menor, encolhe só ali; nunca abaixo de 20 px).
 */
export function larguraAbaNaMargem(margem: number): number {
  if (margem >= 48) return 32;
  return Math.max(20, Math.min(28, Math.floor(margem - 4)));
}
export const larguraAba = (larguraUtil: number): number => larguraAbaNaMargem(margemConteudo(larguraUtil));

/**
 * Páginas em que o canto do popup conta SEMPRE como ocupado (pedir o chat abre a folha central): a ficha do candidato —
 * a página inteira é foto, nome, número e votos de um candidato. A /anuncie NÃO entra (a vitrine e as prévias de
 * anúncio são demonstração: podem ficar sob o popup); lá só a faixa "Sala oferecida por" nunca aparece
 * (`rodapePermitido`, anuncios/nucleo.ts).
 */
export const cantoSempreOcupado = (pathname: string): boolean => /^\/candidato(\/|$)/.test(pathname);

/**
 * Doca: em janela larga, o chat aberto vira uma COLUNA à direita que EMPURRA a página (`--sala-lateral` no padding do
 * conteúdo, do rodapé e da faixa do topo) — "sempre aberto" sem cobrir nada. Só a partir de `LARGURA_MIN_DOCA`: os
 * estilos de computador valem pela largura da JANELA, e abaixo disso a página espremida mudaria de cara (a apuração
 * nacional passa a duas colunas em 1360 px de janela: 1760 − 380 = 1380 ainda cabe). Abaixo, o popup do canto.
 */
export const LARGURA_DOCA = 380;
export const LARGURA_MIN_DOCA = 1760;

export type ModoComputador = 'doca' | 'popup';
export const modoComputador = (largura: number): ModoComputador => (largura >= LARGURA_MIN_DOCA ? 'doca' : 'popup');

/** Área da doca na tela (abaixo do cabeçalho, até o pé). */
export function geometriaDoca(janela: { largura: number; altura: number }, cabecalho: number): Retangulo {
  return { top: Math.max(0, cabecalho), bottom: janela.altura, right: janela.largura, left: janela.largura - LARGURA_DOCA };
}

/**
 * Onde fica a faixa "Sala oferecida por" (o anúncio da sala), para vigiar o respiro: no topo do popup e da doca, logo
 * abaixo do cabeçalho da sala (~64 px) e com ~48 px de altura.
 */
export function regiaoAnuncioSala(caixa: Retangulo): Retangulo {
  return { top: caixa.top + 56, bottom: caixa.top + 120, left: caixa.left, right: caixa.right };
}

/** Escolha da pessoa no computador: aberto ou minimizado. */
export type PrefPopup = 'aberto' | 'minimizado';

/** Valor guardado no navegador ('1' aberto, '0' minimizado; o resto = sem escolha). */
export function lerPrefGuardada(v: string | null | undefined): PrefPopup | null {
  return v === '1' ? 'aberto' : v === '0' ? 'minimizado' : null;
}

/**
 * Aberto ou minimizado agora. Com a sala aberta: a escolha desta visita, senão a guardada, senão ABERTO (padrão do
 * computador). Com a sala fechada (antes do fim da votação, 25/10 19h, demo, fechada pela moderação): minimizado, salvo escolha desta
 * visita feita com a sala fechada — uma escolha feita com a sala fechada (abrir para ver a contagem e minimizar) não
 * vale quando ela abre, e vice-versa.
 */
export function prefEfetiva(e: { sessao: { pref: PrefPopup; aberta: boolean } | null; guardada: PrefPopup | null; aberta: boolean }): PrefPopup {
  if (e.sessao && e.sessao.aberta === e.aberta) return e.sessao.pref;
  return e.aberta ? (e.guardada ?? 'aberto') : 'minimizado';
}

/** Depois de a pessoa mexer no popup (mouse saiu, última tecla), por quanto tempo ele ainda não se recolhe. */
export const GRACA_INTERACAO_MS = 3000;

/**
 * O popup do canto aparece aberto? Regra de ouro: ele nunca fica por cima de bloco com candidato (`ocupada`: a área dele
 * cruza um bloco `data-sem-anuncio-fixo` ou com cor de candidato, ou um anúncio real em posição) — recolhe sozinho para
 * a aba da margem direita e volta quando a área fica livre (com histerese: `decidirOcupacao`).
 *
 * Exceção, só para a página que muda POR BAIXO dele (bloco que cresce, dado novo): o mouse está em cima
 * (`interagindo` — só o ponteiro; o foco no campo não segura nada) ou a pessoa mexeu nele há menos de
 * `GRACA_INTERACAO_MS` (mouse saiu, tecla digitada): ele não some debaixo da mão dela. Se a PÁGINA ROLOU depois da
 * última mexida (`paginaRolou`: a pessoa voltou a ler a página), não há exceção — recolhe na hora (o rascunho fica
 * guardado). Sem interação nenhuma (`msDesdeInteracao` = Infinity), recolhe.
 */
export function popupAberto(e: { pref: PrefPopup; ocupada: boolean; interagindo: boolean; msDesdeInteracao: number; paginaRolou?: boolean }): boolean {
  if (e.pref !== 'aberto') return false;
  if (!e.ocupada) return true;
  if (e.paginaRolou) return false;
  if (e.interagindo) return true;
  return Number.isFinite(e.msDesdeInteracao) && e.msDesdeInteracao < GRACA_INTERACAO_MS;
}

/**
 * A pessoa pediu o chat (aba da margem, chamada "Chat ao vivo" da página): onde ele abre no computador. Com o canto livre,
 * o popup do canto; com o canto em cima de um bloco com candidato, a folha CENTRAL embaixo (mesmas margens dos dois
 * lados: cobre a parte de baixo dos DOIS lados do placar, nunca um lado só — e nas páginas da apuração o placar rola para
 * ficar à vista acima dela), até a pessoa minimizar.
 */
export function ondeAbrir(cantoOcupado: boolean): 'canto' | 'central' {
  return cantoOcupado ? 'central' : 'canto';
}
