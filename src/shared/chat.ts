/**
 * Chat ao vivo moderado ("Sala da apuração"): contrato compartilhado por servidor (src/server/chat.ts), app
 * (src/app/components/chat) e painel (seção "Chat ao vivo"). Isomórfico e puro.
 *
 * Escala sem WebSocket: `GET /api/chat` devolve as últimas mensagens + o estado da sala com cache público de 1 s na CDN
 * (a MESMA URL para todos); o navegador junta por id e consulta a cada poucos segundos só com a sala aberta na tela.
 * `POST /api/chat` publica (validação aqui e no servidor; o servidor é a palavra final).
 *
 * Regras de conteúdo (todas simétricas entre os finalistas — nenhuma lista favorece um lado):
 *  - sem links, domínios, e-mails, telefones, CPF ou números longos (dados pessoais);
 *  - sem palavrões, ofensas, xingamentos partidários e ameaças (normalização de acentos e leetspeak, letras
 *    repetidas e letras soltas "p o r r a");
 *  - sem pedido de voto / propaganda eleitoral (número de urna com nome, "vote em", hashtags de campanha, "fora X");
 *  - sem "fraude nas urnas" e afins (desinformação sobre o processo eleitoral: a fonte é o TSE);
 *  - CAIXA ALTA vira minúsculas e letras repetidas são encurtadas ("kkkkkkkk" → "kkkk").
 *  - apelido de 2 a 20 caracteres, sem nome de candidato, partido, número de urna ou "moderador/TSE/Sintonia".
 * Nenhuma lista é completa: denúncias (3+ de redes diferentes escondem a mensagem) e a moderação do painel completam.
 * Letras de outros alfabetos parecidas com as nossas ("TSЕ" com E cirílico), largura cheia e letras "estilizadas" são
 * trocadas pelas latinas antes de todos os filtros (`paraLatim`); o apelido aceita só o nosso alfabeto.
 *
 * LGPD: o servidor guarda só o texto público das últimas mensagens, em memória (nada em disco, nada de IP); o
 * visitante é uma chave anonimizada (rede com sal + token aleatório do navegador) usada para os limites.
 */

// ---- contrato da API --------------------------------------------------------------------------------------------

export const REACOES = ['fogo', 'uau', 'palmas', 'olhos'] as const;
export type ReacaoId = (typeof REACOES)[number];
/** Emoji de cada reação (neutras: nunca ligadas a candidato). */
export const EMOJI_REACAO: Record<ReacaoId, string> = { fogo: '🔥', uau: '😮', palmas: '👏', olhos: '👀' };
export const ROTULO_REACAO: Record<ReacaoId, string> = { fogo: 'Fogo', uau: 'Uau', palmas: 'Palmas', olhos: 'De olho' };

/** Mensagem pública (o que todo mundo vê). */
export interface MensagemChat {
  id: string;
  apelido: string;
  texto: string;
  /** epoch ms (relógio do servidor) */
  em: number;
}

/** Mensagem fixada pela moderação. */
export interface FixadaChat {
  texto: string;
  em: number;
}

/** `GET /api/chat` (cache público de 1 s). */
export interface ChatPublico {
  /** sala aberta para mensagens (fechada = só leitura; FECHADA por padrão) */
  aberta: boolean;
  /** motivo de a sala estar fechada mesmo com o admin tendo aberto (ex.: dia da eleição antes das 17h) */
  bloqueio: string | null;
  /** modo lento: segundos entre mensagens do mesmo visitante */
  lentoS: number;
  fixada: FixadaChat | null;
  /** pessoas com a sala aberta na tela (estimativa conservadora, arredondada); null = sem medição */
  pessoas: number | null;
  /**
   * TOTAL de reações no último minuto (nunca por emoji: um número por emoji poderia virar enquete combinada fora do site,
   * "🔥 = candidato X" — Lei 9.504/97, art. 33, § 5º). 0 com a sala fechada ou no bloqueio do dia da eleição.
   */
  reacoes: number;
  /** até `MAX_PUBLICAS` mensagens, da mais antiga para a mais nova */
  mensagens: MensagemChat[];
  /** ids retirados recentemente (moderação ou denúncias): o navegador apaga do que já tinha */
  removidas: string[];
  /** "limpar tudo": o navegador descarta as mensagens com `em` ≤ este instante */
  limpaEm: number;
  /** intervalo sugerido entre consultas com a sala na tela (s): o servidor aumenta se a origem estiver cheia */
  intervaloS: number;
  /** intervalo entre sinais de presença (s) */
  presencaS: number;
  /**
   * O servidor guarda, cifrados, o IP, a porta e a hora de cada mensagem publicada (registro de envios, Marco Civil,
   * art. 15 — só quando o dono liga): a sala avisa nas regras.
   */
  registro?: boolean;
  /** relógio do servidor (epoch ms) */
  agora: number;
}

/** Aviso das regras quando o registro de envios está ligado. */
export const AVISO_REGISTRO_CHAT =
  'Para cumprir a lei, o Sintonia guarda por 6 meses, cifrados, o IP e a hora de cada mensagem publicada; só são abertos por ordem judicial.';

/** `POST /api/chat` */
export interface EnvioChat {
  apelido: string;
  texto: string;
  token: string;
}

/** Resposta do `POST /api/chat`. */
export type RespostaEnvio = { ok: true; mensagem: MensagemChat; proximaEmS: number } | { ok: false; erro: string; motivo: MotivoRecusa; esperaS?: number };

export type MotivoRecusa =
  | 'fechada'
  | 'apelido'
  | 'vazia'
  | 'longa'
  | 'link'
  | 'dados'
  | 'ofensa'
  | 'propaganda'
  | 'fraude'
  | 'repeticao'
  | 'duplicada'
  | 'lento'
  | 'limite'
  | 'silenciado'
  | 'token';

/** Mensagem como o painel vê (com o autor anonimizado e as denúncias). */
export interface MensagemAdmin extends MensagemChat {
  /** código curto do autor (hash da rede com sal + token do navegador; nunca o IP) */
  autor: string;
  denuncias: number;
  oculta: boolean;
  revisada: boolean;
}

/** `GET /api/admin/chat` */
export interface ChatAdmin {
  aberta: boolean;
  bloqueio: string | null;
  lentoS: number;
  fixada: FixadaChat | null;
  pessoas: number | null;
  reacoes: Record<ReacaoId, number>;
  mensagens: MensagemAdmin[];
  denunciadas: MensagemAdmin[];
  /** autores silenciados; `rede: true` = a rede inteira do autor (código começa com "r") */
  silenciados: { autor: string; apelido: string; ate: number; rede?: boolean }[];
  contadores: { publicadas: number; recusadas: Partial<Record<MotivoRecusa, number>>; denuncias: number; ocultadas: number; desde: number };
  /** redes diferentes (com a sala na tela há 2 min) que escondem uma mensagem agora (cresce com o público) */
  limiarDenuncias?: number;
  /** redes que ajudaram a esconder 3+ mensagens na última hora e mensagens escondidas por denúncia na última hora */
  alertaDenuncias?: { redes: number; ocultadasHora: number };
  intervaloS: number;
  presencaS: number;
  agora: number;
}

/** `POST /api/admin/chat` */
export type ComandoChat =
  | { acao: 'abrir' }
  | { acao: 'fechar' }
  | { acao: 'lento'; segundos: number }
  | { acao: 'fixar'; texto: string | null }
  | { acao: 'apagar'; id: string }
  | { acao: 'manter'; id: string }
  | { acao: 'silenciar'; autor: string; minutos: number; rede?: boolean }
  | { acao: 'liberar'; autor: string }
  | { acao: 'limpar' };

export const LIMITES_CHAT = {
  apelido: { min: 2, max: 20 },
  texto: { min: 1, max: 140 },
  /** mensagens guardadas no servidor (memória) */
  buffer: 300,
  /** mensagens no GET público */
  publicas: 60,
  /** mensagens guardadas no navegador */
  local: 200,
  lento: { padrao: 10, min: 3, max: 300 },
  porHora: 30,
  fixada: 200,
  /** denúncias de redes diferentes que escondem a mensagem até o admin decidir (mínimo; cresce com a sala cheia) */
  denuncias: 3,
  token: { min: 16, max: 64 },
} as const;

/** Regras exibidas na sala (sempre visíveis). */
export const REGRAS_CHAT_CURTA =
  'Proibido: propaganda eleitoral ou pedido de voto, ofensas, notícias falsas, dados pessoais e links. As mensagens são de responsabilidade de quem escreve e podem ser removidas.';

export const REGRAS_CHAT: readonly string[] = [
  'Nada de propaganda eleitoral nem pedido de voto.',
  'Nada de ofensas, xingamentos, ameaças ou preconceito.',
  'Nada de notícias falsas. Resultado oficial é o do TSE.',
  'Nada de dados pessoais (telefone, e-mail, CPF, endereço) nem links.',
  'As mensagens são de responsabilidade de quem escreve e podem ser removidas pela moderação.',
];

// ---- normalização -----------------------------------------------------------------------------------------------

/** Invisíveis e controles de direção (usados para burlar filtros ou embaralhar o texto na tela). */
const RE_INVISIVEIS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯ㅤ︀-︎﻿ﾠ]/g;

/**
 * Letras de outros alfabetos e estilos que se parecem com letras latinas (cirílico "а", grego "ο", versalete "ᴏ",
 * "ı" sem ponto…) → a letra latina. Junto com a NFKC (que já resolve largura cheia "ＰＯＲＲＡ", letras matemáticas
 * "𝐩𝐨𝐫𝐫𝐚", círculos, sobrescritos), impede que "TSЕ" (E cirílico) ou "pоrra" (o cirílico) passem pelos filtros.
 * Só para os filtros (e para comparar apelidos), nunca para reescrever o que a pessoa escreveu.
 */
const SEMELHANTES: Record<string, string> = {
  // cirílico
  а: 'a', в: 'b', е: 'e', ё: 'e', ѐ: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ї: 'i', ј: 'j',
  ѕ: 's', ԁ: 'd', ӏ: 'l', ԛ: 'q', ԝ: 'w', ү: 'y', һ: 'h', ɡ: 'g', ь: 'b', п: 'n', г: 'r', д: 'd', и: 'u', л: 'n', з: '3',
  // grego
  α: 'a', β: 'b', γ: 'y', δ: 'd', ε: 'e', ζ: 'z', η: 'n', θ: 'o', ι: 'i', κ: 'k', λ: 'l', μ: 'u', ν: 'v', ο: 'o', π: 'n', ρ: 'p',
  σ: 'o', ς: 's', τ: 't', υ: 'u', φ: 'o', χ: 'x', ω: 'w', ϲ: 'c', ϳ: 'j',
  // versalete e IPA
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p',
  ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z', ɑ: 'a', ɒ: 'a', ɐ: 'a', ɛ: 'e', ǝ: 'e', ɘ: 'e', ɩ: 'i', ɨ: 'i',
  ɵ: 'o', ʋ: 'u', ʉ: 'u', ɯ: 'm', ɹ: 'r', ʂ: 's', ƶ: 'z',
  // latinas com traço (a NFD não separa) e formas antigas
  ı: 'i', ȷ: 'j', ſ: 's', ł: 'l', đ: 'd', ð: 'd', ø: 'o', ħ: 'h', ŧ: 't', ƀ: 'b', ƚ: 'l', ꞁ: 'l', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'p',
};
const RE_SEMELHANTES = new RegExp(`[${Object.keys(SEMELHANTES).join('')}]`, 'gu');

/**
 * Base dos filtros: NFKC, minúsculas e letras parecidas de outros alfabetos trocadas pela latina. Os acentos ficam
 * (quem precisa tira com NFD).
 */
export function paraLatim(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(RE_SEMELHANTES, (c) => SEMELHANTES[c] ?? c);
}

/**
 * Limpa o texto para exibição: NFKC (largura cheia, letras matemáticas e afins viram as comuns), tira invisíveis,
 * junta espaços, corta repetições longas e trata CAIXA ALTA.
 */
export function limparTexto(bruto: string): string {
  let t = bruto.normalize('NFKC').replace(RE_INVISIVEIS, '').replace(/\s+/g, ' ').trim();
  // repetições longas do mesmo caractere (inclusive emoji): no máximo 4 ("kkkkkkkk" → "kkkk", "!!!!!!" → "!!!!")
  t = Array.from(t)
    .reduce<{ out: string[]; ult: string; n: number }>(
      (acc, ch) => {
        if (ch === acc.ult) acc.n++;
        else {
          acc.ult = ch;
          acc.n = 1;
        }
        if (acc.n <= 4) acc.out.push(ch);
        return acc;
      },
      { out: [], ult: '', n: 0 },
    )
    .out.join('');
  // CAIXA ALTA (gritaria): minúsculas, com a 1ª letra maiúscula
  const letras = t.match(/\p{L}/gu) ?? [];
  const maiusculas = letras.filter((l) => l !== l.toLowerCase() && l === l.toUpperCase()).length;
  if (letras.length >= 6 && maiusculas / letras.length > 0.7) {
    const min = t.toLocaleLowerCase('pt-BR');
    t = min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1);
  }
  return t;
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e', '¢': 'c', '£': 'l' };

/** Latim sem acento e em minúsculas (base de todas as leituras dos filtros). */
const semAcento = (s: string) => paraLatim(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Minúsculas, sem acento, letras de outros alfabetos trocadas pelas latinas; com `leet`, os símbolos e números usados no
 * lugar de letras viram letras ("p0rr4" → "porra"); o resto vira espaço. Para os filtros, nunca para exibir.
 */
export function normalizarFiltro(s: string, leet = true): string {
  let t = semAcento(s);
  if (leet) t = t.replace(/[0134578@$!|€¢£]/g, (c) => LEET[c] ?? c);
  return t.replace(/[^a-z]+/g, ' ').trim();
}

/** Letras repetidas viram uma ("poorrraaa" → "pora"). As listas passam pela mesma função. */
export const colapsar = (s: string) => s.replace(/([a-z])\1+/g, '$1');

/**
 * As duas leituras do texto para os filtros: com leetspeak ("p0rr4") e sem ("porra!", em que o "!" é pontuação).
 */
const leituras = (texto: string): [string, string] => [normalizarFiltro(texto, true), normalizarFiltro(texto, false)];

// ---- listas -----------------------------------------------------------------------------------------------------

/**
 * Palavrões, ofensas e preconceito: palavra exata (depois de normalizar e colapsar). Simétrico: os apelidos
 * pejorativos dos dois campos estão aqui, lado a lado.
 */
const OFENSAS_EXATAS = [
  // palavrões
  'porra', 'poha', 'caralho', 'caraio', 'cacete', 'buceta', 'boceta', 'xoxota', 'xereca', 'pica', 'piroca', 'pau no cu',
  'cu', 'cuzao', 'cuzinho', 'fdp', 'pqp', 'vsf', 'vtnc', 'tnc', 'tmnc', 'krl', 'crl', 'prr', 'foda', 'fodase', 'foder', 'fodido',
  'fodida', 'fudido', 'fudida', 'fuder', 'merda', 'merdas', 'bosta', 'bostas', 'puta', 'putas', 'putaria', 'putinha', 'puto',
  'putos', 'arrombado', 'arrombada', 'arrombados', 'punheta', 'punheteiro', 'siririca', 'boquete', 'chupa', 'mamada',
  'rapariga', 'quenga', 'vagabundo', 'vagabunda', 'vagabundos', 'vadia', 'vadias', 'piranha', 'safado', 'safada', 'canalha',
  'escroto', 'escrota', 'corno', 'corna', 'cornos', 'otario', 'otaria', 'otarios', 'babaca', 'babacas', 'idiota', 'idiotas',
  'imbecil', 'imbecis', 'estupido', 'estupida', 'burro', 'burra', 'burros', 'jumento', 'anta', 'retardado', 'retardada',
  'retardados', 'mongoloide', 'debil mental', 'lixo humano', 'verme', 'vermes',
  // preconceito (raça, orientação, gênero, origem, deficiência)
  'viado', 'viados', 'veado', 'veados', 'bicha', 'bichas', 'boiola', 'baitola', 'sapatao', 'traveco', 'macaco', 'macacos',
  'macaca', 'crioulo', 'crioula', 'tiziu', 'baianada', 'nordestinada', 'aleijado', 'judeuzinho',
  // xingamentos partidários (os dois campos)
  'gado', 'mortadela', 'mortadelas', 'petralha', 'petralhas', 'bolsominion', 'bolsominions', 'minion', 'minions',
  'esquerdopata', 'esquerdopatas', 'direitopata', 'bolsonazi', 'bolsonazis', 'bozo', 'bozonaro', 'luladrao', 'lularapio',
  'molusco', 'cachaceiro', 'presidiario', 'descondenado', 'bolsonero', 'familicia', 'rachadinha', 'mamata', 'isentao',
  'comunopata', 'fascistoide', 'nove dedos', 'apedeuta',
  // acusações de crime (calúnia) e rótulos de ódio
  'ladrao', 'ladroes', 'ladra', 'bandido', 'bandidos', 'bandida', 'criminoso', 'criminosa', 'corrupto', 'corrupta', 'corruptos',
  'genocida', 'genocidas', 'assassino', 'assassina', 'assassinos', 'miliciano', 'milicianos', 'nazista', 'nazistas', 'nazi',
  'terrorista', 'terroristas', 'traidor', 'traidora', 'estuprador', 'pedofilo', 'pedofila',
] as const;

/** Raízes longas e inconfundíveis, procuradas no texto inteiro sem espaços ("vaitomarnocu" não, "filhodaputa" sim). */
const OFENSAS_RAIZ = [
  'caralho', 'buceta', 'boceta', 'arrombad', 'filhodaput', 'fiadaput', 'fodase', 'punhet', 'petralh', 'bolsominion',
  'esquerdopat', 'bolsonazi', 'luladrao', 'bozonaro', 'xoxota', 'tomarnocu', 'paunocu',
];

/** Ameaças e violência (no texto normalizado, com espaços). */
const AMEACAS: readonly RegExp[] = [
  /\b(vou|vamos|vai|tem que|tinha que|deviam|devia|merece|quero) (te |o |a |os |as |lhe )?(matar|mata|morrer|morre|fuzilar|enforcar|metralhar|esfaquear|espancar|linchar|executar|eliminar|explodir|queimar)\b/,
  /\b(te|vos) (mato|matar|pego|pegamos|acho|encontro)\b/,
  /\b(morte|morra|morram|morre|bala|tiro|forca|paredao|cadeira eletrica) (a |ao |aos |as |no |na |nos |nas |pro |pra |pros |pras |em |nele|nela|neles|nelas)/,
  /\b(matar|fuzilar|enforcar|metralhar|executar|eliminar|esfaquear) (o |a |os |as |esse |essa |esses |essas |todo |toda |todos |todas |um |uma |geral)/,
  /\b(intervencao militar|ai cinco|ai i|golpe militar|fechar o stf|fechar o congresso|quebrar tudo|invadir o|invadam|tocar fogo|bomba no|bomba na)\b/,
  /\b(sei onde (voce|vc|tu) mora|vou atras de (voce|vc|ti))\b/,
];

/** Pedido de voto / propaganda (texto normalizado SEM leet: números de urna contam). */
const PROPAGANDA: readonly RegExp[] = [
  /\bvot(e|em|a|ar|ando|emos)\s+(em|no|na|nos|nas|nele|nela|com|pelo|pela|de)\b/,
  /\b(vote|votem|votar|digite|digitem|aperte|apertem|tecle|teclem|confirma|confirme|confirmem)\s+((no|na|o|a|em)\s+)?\d{1,5}\b/,
  /\b\d{2,5}\s+(e\s+)?confirm(a|e|ar|em|ado)\b/,
  /\b(e|eh|so da|so pode ser|fecha com|fechado com|vamos de|vamo de|bora de|vai de)\s+(13|22|treze|vinte e dois|lula|flavio|bolsonaro|pt|pl)\b/,
  /\b(lula|flavio|bolsonaro|pt|pl)\s*(13|22)\b|\b(13|22)\s*(lula|flavio|bolsonaro|pt|pl)\b/,
  /\bfora\s+(lula|flavio|bolsonaro|pt|pl|petistas?|bolsonaristas?|lulistas?)\b/,
  /\b(lula|flavio|bolsonaro)\s+(la|sim|presidente|neles|eleito ja|ja ganhou)\b/,
  /\b(eu )?(sou|somos) (lula|flavio|bolsonaro|petista|bolsonarista|lulista)\b/,
  /\b(lula|flavio|bolsonaro|pt|pl) nunca mais\b|\bnunca mais (lula|flavio|bolsonaro|pt|pl)\b/,
  /\b(petista|bolsonarista|lulista|flavista)s? (de verdade|raiz|unidos)\b/,
  // gestos de campanha, em par: "faz o L" × "faz arminha" (e "faz o 13" × "faz o 22")
  /\bfa(z|ca|cam|zem|zendo|ce)\s+(o\s+|um\s+)?(l|13|22)\b/,
  /\bfa(z|ca|cam|zem|zendo|ce)\s+(a\s+|uma\s+)?arminha\b/,
  // número de urna com a inicial ("L13", "B22", "F 22") ou repetido como coro ("13 13 13", 3 vezes ou mais: "22:22" é
  // horário), e "vai 13!" × "vai 22!"
  /\b[lbf]\s?-?\s?(13|22)\b/,
  /\b(13|22)\b(\W{1,3}\1\b){2,}/,
  /\bvai\s+(13|22)\s*[!.]*$/,
];

/** Hashtags e "chamadas" de campanha (texto original). */
const RE_HASHTAG_CAMPANHA =
  /#\s*(lula|flavio|fl[áa]vio|bolsonaro|pt|pl|13|22|elenao|ele\s*n[ãa]o|elesim|ele\s*sim|fora\s*(pt|pl|lula|flavio|fl[áa]vio|bolsonaro|petistas?|bolsonaristas?)|lulala|fazol|faz\s*o\s*l\b|arminha|vote|voto)\w*/iu;

/** Desinformação sobre o processo eleitoral (a fonte oficial é o TSE). */
const FRAUDE: readonly RegExp[] = [
  /\bfraud\w*/,
  /\burnas? (fraudad\w*|hackead\w*|hakead\w*|adulterad\w*|manipulad\w*|violad\w*|programad\w*|viciad\w*|roubad\w*|robad\w*)\b/,
  /\b(eleicao|eleicoes|apuracao|resultado|votacao|votos) (roubad\w*|robad\w*|fraudad\w*|manipulad\w*|comprad\w*)\b/,
  /\br(o|ou)b(aram|ou|ando|am) (a |as |o |os )?(eleicao|eleicoes|urnas?|apuracao|votacao|votos)\b/,
  /\b(tse|justica eleitoral|urnas?) (manipul\w*|fraud\w*|roub\w*|rob(ou|aram)|hackea\w*)\b/,
  /\burnas? (eletronicas? )?(nao sao|nao e|nunca foram) (auditave\w*|confiave\w*|segura\w*)\b/,
];

/**
 * "Fraude nas urnas" em qualquer leitura: sem leet (números importam), com leet ("fr4ude"), com letras repetidas
 * colapsadas ("fraaaude") e com letras soltas juntas ("f r a u d e").
 */
function temFraude(texto: string): boolean {
  const base = [normalizarSemLeet(texto), ` ${normalizarFiltro(texto, true)} `, ` ${normalizarFiltro(texto, false)} `];
  const todas = new Set<string>();
  for (const b of base) {
    todas.add(b);
    todas.add(colapsar(b));
    const j = juntarLetrasSoltas(b);
    todas.add(j);
    todas.add(colapsar(j));
  }
  for (const v of todas) if (FRAUDE.some((re) => re.test(v))) return true;
  return false;
}

/** Domínios de topo procurados ("site.com", "x.com.br"). Curtos e comuns em português ficam de fora ("ok.co"…). */
const TLDS = 'com|net|org|br|io|gg|tv|ly|link|xyz|info|site|online|app|dev|us|uk|top|live|club|shop|store|bet|vip|pro|biz|ru|cn|blog|news|social|wiki|page|ws|cc|fm';
/** Domínios de topo que NÃO são palavras do português (a vírgula no lugar do ponto só conta com estes). */
const TLDS_NAO_PALAVRA = 'net|org|br|io|gg|ly|xyz|info|online|app|dev|us|uk|bet|vip|biz|ru|cn|ws|cc|fm|link|shop|store|club';
/** Pontos de outros alfabetos e larguras (a NFKC resolve a maioria; estes ficam por garantia). */
const PONTO = '[.．。｡]';
/**
 * Links e domínios: "https://", "www.", "site.com" (ponto colado), "site . com" / "site .com" (espaço ANTES do ponto —
 * "terminou. Com 60%" continua normal), "site,net", "site,com" no fim da mensagem ou com ",br"/"/", e os disfarces
 * "site [.] com", "site ponto com".
 */
const RE_LINK = new RegExp(
  [
    String.raw`https?:\/\/`,
    String.raw`\bwww\s*${PONTO}`,
    String.raw`\b[a-z0-9-]{2,}(${PONTO}|\s+${PONTO}\s*)(${TLDS})\b`,
    String.raw`\b[a-z0-9-]{2,},(${TLDS_NAO_PALAVRA})\b`,
    String.raw`\b[a-z0-9-]{2,},com([.,]br\b|\s*\/|\s*$)`,
    String.raw`\b[a-z0-9-]{2,}\s*(\[\s*${PONTO}\s*\]|\(\s*${PONTO}\s*\)|\[\s*ponto\s*\]|\(\s*ponto\s*\)|\s+ponto\s+|\s+dot\s+)\s*(${TLDS})\b`,
    String.raw`\b(t\.me|wa\.me|bit\.ly|discord\.gg)\b`,
    String.raw`\bponto com\b`,
  ].join('|'),
  'iu',
);
/** Perfil de rede social (@fulano): divulgação de perfil conta como link. */
const RE_PERFIL = /(^|[\s(])@[A-Za-z0-9_.]{3,}/;
const RE_EMAIL = /[^\s@]+\s*(@|\(at\)|\[at\]|\barroba\b)\s*[^\s@]+\s*(\.|\bponto\b)\s*[a-z]{2,}/i;
const RE_CPF = /\b\d{3}\s*[.\s]\s*\d{3}\s*[.\s]\s*\d{3}\s*[-–\s]\s*\d{2}\b/;
const RE_TELEFONE = /(\+?\s*55\s*)?(\(?\s*\d{2}\s*\)?\s*)?9?\s*\d{4}\s*[-–.]\s*\d{4}\b/;

/** Dígitos em sequência (ignorando espaços, pontos, hífens e parênteses entre eles): ≥ 10 = telefone/CPF/documento. */
function temNumeroLongo(texto: string): boolean {
  const corridas = texto.replace(/(\d)[\s().\-–]+(?=\d)/g, '$1').match(/\d+/g) ?? [];
  return corridas.some((d) => d.length >= 10);
}

/** Termos proibidos em apelido (personificação da moderação, do site, do TSE e da Justiça Eleitoral). */
const APELIDO_RESERVADO =
  /\b(admin|administrador|administradora|adm|moderador|moderadora|moderadores|moderacao|mod|mods|sintonia|tse|tre|stf|oficial|suporte|staff|equipe|sistema|justica eleitoral|eleitoral|tribunal|juiz|juiza|ministro|ministra|bot)\b/;
/**
 * Os mesmos termos procurados no apelido COMPACTO (sem espaços nem pontuação: "m o d e r a d o r", "TSE_oficial",
 * "JusticaEleitoral"). Só os longos e inconfundíveis — "mod", "adm" e "bot" aparecem dentro de nomes comuns.
 */
const APELIDO_RESERVADO_COMPACTO = /(admin|moderador|moderacao|sintonia|tseoficial|oficialtse|justicaeleitoral|tribunaleleitoral|juizeleitoral|suporte|sistema)/;
/** Só letras latinas (com acentos), números 0–9, espaço e . _ ' ’ - (sem misturar alfabetos: "TSЕ" com E cirílico). */
const RE_APELIDO = /^[A-Za-z0-9À-ÖØ-öø-ÿĀ-ſḀ-ỿ][A-Za-z0-9À-ÖØ-öø-ÿĀ-ſḀ-ỿ ._'’-]*$/u;

/** Partidos (qualquer caixa) e termos partidários em apelido. */
const APELIDO_PARTIDARIO = /\b(pt|pl|psol|mdb|psdb|psd|pdt|psb|pcdob|pv|pp|novo|rede|uniao|uniao brasil|podemos|republicanos|cidadania|avante|solidariedade|agir|dc|pmb|prtb|pco|pstu|up|pcb|prd|mobiliza|missao|petista|petistas|bolsonarista|bolsonaristas|lulista|lulistas|flavista|esquerda|direita|lulinha|bolsonarinho)\b/;

/**
 * Nomes sempre recusados no apelido (os candidatos do dataset entram pelo parâmetro). SIMÉTRICO: o nome de urna e o
 * sobrenome/apelido que identificam cada finalista e seu entorno ("lula" × "bolsonaro", "luiz inacio" × "flavio
 * bolsonaro"/"jair bolsonaro", "janja" × "michelle bolsonaro"); o primeiro nome comum sozinho ("Luiz", "Flávio",
 * "Jair", "Michelle") é de muita gente e continua permitido para os dois lados.
 */
// em pares: os vices entram pelo nome completo dos dois (só "Alckmin" sozinho, que é inconfundível; "Gaspar" é município)
const NOMES_FIXOS = [
  'lula', 'bolsonaro', 'luiz inacio', 'lula da silva', 'flavio bolsonaro', 'jair bolsonaro', 'jair messias',
  'alckmin', 'geraldo alckmin', 'alfredo gaspar', 'janja', 'michelle bolsonaro',
];

// ---- avaliação --------------------------------------------------------------------------------------------------

export interface Recusa {
  motivo: MotivoRecusa;
  erro: string;
}

const RECUSA: Record<Exclude<MotivoRecusa, 'fechada' | 'lento' | 'limite' | 'silenciado' | 'duplicada' | 'token' | 'apelido'>, string> = {
  vazia: 'Escreva uma mensagem.',
  longa: `A mensagem pode ter até ${LIMITES_CHAT.texto.max} caracteres.`,
  link: 'Links e endereços de sites não são publicados aqui.',
  dados: 'Para a sua segurança, telefones, e-mails, CPF e outros números pessoais não são publicados.',
  ofensa: 'Mensagem não publicada: palavrões, ofensas, xingamentos e ameaças não são permitidos.',
  propaganda: 'Mensagem não publicada: propaganda eleitoral e pedido de voto não são permitidos.',
  fraude: 'Mensagens sobre fraude nas urnas não são publicadas aqui. Resultado e dúvidas: Justiça Eleitoral (TSE).',
  repeticao: 'Evite repetir a mesma palavra várias vezes.',
};

/** Palavras normalizadas e colapsadas de uma leitura, como frase com espaços nas pontas (" ponta pora "). */
const fraseColapsada = (leitura: string) => ` ${leitura.split(' ').filter(Boolean).map(colapsar).join(' ')} `;

/**
 * Prepara exceções (nomes de município que contêm uma palavra da lista: "Gado Bravo", "Ponta Porã", "Anta Gorda"):
 * no texto, essas frases são ignoradas pelo filtro de ofensas.
 */
export function prepararExcecoes(frases: readonly string[]): string[] {
  const out = new Set<string>();
  for (const f of frases) {
    const n = fraseColapsada(normalizarFiltro(f, false)).trim();
    if (n && temOfensa(f)) out.add(n);
  }
  return [...out].sort((x, y) => y.length - x.length);
}

/**
 * Texto com palavrão, ofensa, xingamento ou ameaça? Vale para apelido e mensagem. `excecoes`: frases já preparadas
 * por `prepararExcecoes` (nomes de município), ignoradas na busca por palavras.
 */
export function temOfensa(texto: string, excecoes: readonly string[] = []): boolean {
  for (const leitura of leituras(texto)) {
    // ameaças: no texto sem colapsar ("morrer", "metralhar")
    if (AMEACAS.some((re) => re.test(` ${leitura} `))) return true;
    let frase = fraseColapsada(leitura);
    for (const e of excecoes) if (frase.includes(` ${e} `)) frase = frase.split(` ${e} `).join(' ');
    const base = frase.trim().split(' ').filter(Boolean);
    for (const p of base) if (OFENSAS_COMPILADAS.exatas.has(p)) return true;
    // letras soltas em sequência (≥ 3): "p o r r a", "p.o.r.r.a"
    let run = '';
    for (const p of [...base, '']) {
      if (p.length === 1) run += p;
      else {
        if (run.length >= 3 && OFENSAS_COMPILADAS.exatas.has(colapsar(run))) return true;
        run = '';
      }
    }
    for (const o of OFENSAS_COMPILADAS.frases) if (frase.includes(` ${o} `)) return true;
    const comp = colapsar(base.join(''));
    for (const r of OFENSAS_COMPILADAS.raizes) if (comp.includes(r)) return true;
  }
  // pedaço com número/símbolo no lugar de letra separado do vizinho por espaço ("p0 rra", "po rr4"): junta os dois
  const pedacos = semAcento(texto).split(/[^a-z0-9@$!|€¢£]+/).filter(Boolean);
  for (let i = 0; i + 1 < pedacos.length; i++) {
    const [x, y] = [pedacos[i], pedacos[i + 1]];
    if (!/[0134578@$!|€¢£]/.test(x + y) || !/[a-z]/.test(x) || !/[a-z]/.test(y)) continue;
    const junto = colapsar(normalizarFiltro(x + y, true).replace(/ /g, ''));
    if (junto.length >= 4 && OFENSAS_COMPILADAS.exatas.has(junto)) return true;
  }
  return false;
}

const OFENSAS_COMPILADAS = (() => {
  const exatas = new Set<string>();
  const frases: string[] = [];
  for (const o of OFENSAS_EXATAS) {
    const n = fraseColapsada(normalizarFiltro(o, false)).trim();
    if (n.includes(' ')) frases.push(n);
    else exatas.add(n);
  }
  const raizes = [...new Set(OFENSAS_RAIZ.map((r) => colapsar(normalizarFiltro(r, false).replace(/ /g, ''))))];
  return { exatas, frases, raizes };
})();

/** Normalização sem leet (números de urna e de telefone importam), com espaços. */
const normalizarSemLeet = (s: string) => ` ${semAcento(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * Leet só DENTRO de palavras ("v0te 13" → "vote 13", "fl4vio 22" → "flavio 22"): números sozinhos continuam números
 * (o número de urna importa). Com espaços nas pontas.
 */
const normalizarLeetMisto = (s: string) =>
  ` ${semAcento(s)
    .split(/[^a-z0-9@$!|€¢£]+/)
    .filter(Boolean)
    .map((p) => (/[a-z]/.test(p) ? p.replace(/[0134578@$!|€¢£]/g, (c) => LEET[c] ?? c) : p))
    .join(' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim()} `;

/** Letras soltas em sequência viram uma palavra ("f r a u d e" → "fraude"), numa leitura com espaços. */
const juntarLetrasSoltas = (leitura: string) => ` ${leitura.trim().replace(/\b([a-z0-9]) (?=[a-z0-9]\b)/g, '$1')} `;

/**
 * Reação usada como enquete ("manda 🔥 se é Lula", "👏 = 22"): as reações são neutras e nunca ligadas a candidato
 * (Lei 9.504/97, art. 33, § 5º — nada de enquete com o público).
 */
const CAND_ENQUETE = String.raw`(lula|fl[aá]vio|bolsonaro|pt|pl|13|22|petistas?|bolsonaristas?|lulistas?)`;
const EMOJI_ENQUETE = String.raw`(🔥|😮|👏|👀|fogo|palmas|emoji|rea[cç][aã]o|rea[cç][oõ]es)`;
const RE_REACAO_ENQUETE = new RegExp(
  [
    // "manda 🔥 se é Lula", "reage com palmas quem é 22"
    String.raw`\b(manda|mande|mandem|reaj\w*|reage|reagem|clica|clique|cliquem|aperta|aperte|apertem|deixa|deixe|deixem|solta|solte|soltem|joga|joguem)\b[^\n]{0,25}${EMOJI_ENQUETE}[^\n]{0,40}\b${CAND_ENQUETE}\b`,
    // "13 = 👏", "Lula: 🔥"
    String.raw`\b${CAND_ENQUETE}\b\s*(=|:|→|->)\s*${EMOJI_ENQUETE}`,
    // "🔥 = Lula", "👏 pra 22", "🔥 se for Flávio"
    String.raw`${EMOJI_ENQUETE}\s*(=|:|→|->|pr[ao]|para|se (é|e|eh|for)|quem (é|e|vota))\s*\b${CAND_ENQUETE}\b`,
  ].join('|'),
  'iu',
);

/** Pedido de voto / propaganda eleitoral (inclui reação usada como enquete)? */
export function temPropaganda(texto: string): boolean {
  const latim = paraLatim(texto);
  if (RE_HASHTAG_CAMPANHA.test(texto) || RE_HASHTAG_CAMPANHA.test(latim) || RE_REACAO_ENQUETE.test(texto) || RE_REACAO_ENQUETE.test(latim)) return true;
  const leituras = [normalizarSemLeet(texto), normalizarLeetMisto(texto)];
  return leituras.some((n) => PROPAGANDA.some((re) => re.test(n) || re.test(juntarLetrasSoltas(n))));
}

/** Link, domínio ou dado pessoal? */
export function motivoDados(texto: string): 'link' | 'dados' | null {
  const latim = paraLatim(texto);
  if (RE_EMAIL.test(texto) || RE_EMAIL.test(latim)) return 'dados';
  if (RE_LINK.test(texto) || RE_LINK.test(latim) || RE_PERFIL.test(texto)) return 'link';
  if (RE_CPF.test(texto) || RE_TELEFONE.test(texto) || temNumeroLongo(texto)) return 'dados';
  return null;
}

/** Mesma palavra repetida muitas vezes (flood). */
function temRepeticao(texto: string): boolean {
  const ps = normalizarFiltro(texto).split(' ').filter((p) => p.length > 0);
  if (ps.length < 4) return false;
  let seguidas = 1;
  for (let i = 1; i < ps.length; i++) {
    seguidas = ps[i] === ps[i - 1] ? seguidas + 1 : 1;
    if (seguidas >= 4) return true;
  }
  const conta = new Map<string, number>();
  for (const p of ps) conta.set(p, (conta.get(p) ?? 0) + 1);
  return ps.length >= 6 && Math.max(...conta.values()) / ps.length > 0.5;
}

/**
 * Valida e limpa o TEXTO de uma mensagem. Devolve o texto pronto para exibir ou a recusa (sem repetir o termo).
 * Ordem: tamanho → links/dados → fraude → propaganda → ofensa → repetição.
 */
export function avaliarTexto(bruto: unknown, { excecoes = [] }: { excecoes?: readonly string[] } = {}): { ok: string } | Recusa {
  if (typeof bruto !== 'string') return { motivo: 'vazia', erro: RECUSA.vazia };
  if (bruto.length > LIMITES_CHAT.texto.max * 4) return { motivo: 'longa', erro: RECUSA.longa };
  const t = limparTexto(bruto);
  if (Array.from(t).length < LIMITES_CHAT.texto.min || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(t)) return { motivo: 'vazia', erro: RECUSA.vazia };
  if (Array.from(t).length > LIMITES_CHAT.texto.max) return { motivo: 'longa', erro: RECUSA.longa };
  const d = motivoDados(t);
  if (d) return { motivo: d, erro: RECUSA[d] };
  if (temFraude(t)) return { motivo: 'fraude', erro: RECUSA.fraude };
  if (temPropaganda(t)) return { motivo: 'propaganda', erro: RECUSA.propaganda };
  if (temOfensa(t, excecoes)) return { motivo: 'ofensa', erro: RECUSA.ofensa };
  if (temRepeticao(t)) return { motivo: 'repeticao', erro: RECUSA.repeticao };
  return { ok: t };
}

/** Nomes prontos para o filtro de apelido (frases normalizadas). */
export function prepararNomesApelido(nomes: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const n of [...NOMES_FIXOS, ...nomes]) {
    const f = normalizarFiltro(n);
    if (f.replace(/ /g, '').length >= 4) out.add(f);
  }
  return [...out];
}

const NOMES_PADRAO = prepararNomesApelido();

/**
 * Valida e limpa o APELIDO: 2–20 caracteres (letras, números, espaço, ponto, hífen, sublinhado, apóstrofo), sem
 * link/dado pessoal, ofensa, nome de candidato (`nomes`: do dataset, já preparados por `prepararNomesApelido`),
 * partido, número de urna (13/22 colados) nem nome da moderação/do site.
 */
export function avaliarApelido(bruto: unknown, nomes: readonly string[] = NOMES_PADRAO): { ok: string } | Recusa {
  const erro = (e: string): Recusa => ({ motivo: 'apelido', erro: e });
  if (typeof bruto !== 'string') return erro('Escolha um apelido.');
  // NFKC: largura cheia e letras "estilizadas" viram as comuns (o que se vê é o que se compara)
  const a = bruto.normalize('NFKC').replace(RE_INVISIVEIS, '').replace(/\s+/g, ' ').trim();
  const n = Array.from(a).length;
  if (n < LIMITES_CHAT.apelido.min || n > LIMITES_CHAT.apelido.max) return erro(`O apelido precisa ter de ${LIMITES_CHAT.apelido.min} a ${LIMITES_CHAT.apelido.max} caracteres.`);
  if (!RE_APELIDO.test(a) || !/\p{L}/u.test(a)) return erro('Use só letras (do nosso alfabeto), números, espaço, ponto, hífen ou sublinhado, começando por letra ou número.');
  if (motivoDados(a) || /\.(com|br|net|org|io|gg|tv|me)\b/i.test(a)) return erro('O apelido não pode ter link, e-mail ou telefone.');
  // leituras: sem leet, com leet ("M0derador", "Moder4dor") e compactas ("m o d e r a d o r", "JusticaEleitoral")
  const f = ` ${normalizarFiltro(a, false)} `;
  const fl = ` ${normalizarFiltro(a, true)} `;
  const semLeet = normalizarSemLeet(a);
  const compactos = [f, fl].map((x) => x.replace(/ /g, ''));
  if ([semLeet, f, fl, juntarLetrasSoltas(f), juntarLetrasSoltas(fl)].some((x) => APELIDO_RESERVADO.test(x)) || compactos.some((x) => APELIDO_RESERVADO_COMPACTO.test(x)))
    return erro('Esse apelido é reservado. Escolha outro.');
  for (const nome of nomes) {
    const nomeC = nome.replace(/ /g, '');
    if ([f, fl].some((x) => x.includes(` ${nome} `)) || (nomeC.length >= 5 && compactos.some((x) => x.includes(nomeC)))) return erro('O apelido não pode ter nome de candidato.');
  }
  if (APELIDO_PARTIDARIO.test(semLeet)) return erro('O apelido não pode ter nome ou sigla de partido nem termo partidário.');
  // número de urna colado ao apelido ("joao22", "ana_13"), não parte de um número maior ("ana2013")
  if (/(^|[^0-9])(13|22)([^0-9]|$)/.test(a) || / (treze|vinte e dois|vintedois) /.test(f)) return erro('O apelido não pode ter número de candidato.');
  if (temOfensa(a) || temPropaganda(a)) return erro('Escolha um apelido sem ofensa nem propaganda.');
  return { ok: a };
}

/** Token aleatório do navegador (base64url). */
export function tokenValido(t: unknown): t is string {
  return typeof t === 'string' && t.length >= LIMITES_CHAT.token.min && t.length <= LIMITES_CHAT.token.max && /^[A-Za-z0-9_-]+$/.test(t);
}

/** Texto normalizado para detectar duplicadas (mesmo conteúdo com outra caixa/pontuação). */
export const chaveDuplicada = (texto: string) => colapsar(normalizarFiltro(texto, false));

// ---- dia da eleição ------------------------------------------------------------------------------------------------

/** 25/10/2026 00:00 e 17:00 em Brasília (UTC−3). */
export const DIA_ELEICAO_INICIO = Date.UTC(2026, 9, 25, 3, 0, 0);
export const DIA_ELEICAO_17H = Date.UTC(2026, 9, 25, 20, 0, 0);

/**
 * No dia da eleição, até as 17h (horário de Brasília), a sala não recebe mensagens: propaganda no dia da eleição é
 * crime (Lei 9.504/97, art. 39, § 5º) e a votação ainda está aberta. Devolve o motivo exibido ou null.
 */
export function bloqueioDiaEleicao(agora: number): string | null {
  if (agora >= DIA_ELEICAO_INICIO && agora < DIA_ELEICAO_17H) return 'A sala abre às 17h, quando terminar a votação.';
  return null;
}

/** Arredonda a estimativa de pessoas na sala (< 10 exato; < 1.000 em dezenas; depois em centenas). */
export function arredondarPessoasSala(n: number): number {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  if (v < 10) return v;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 100) * 100;
}
