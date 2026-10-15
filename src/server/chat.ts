/**
 * Chat ao vivo moderado ("Sala da apuração") — servidor. Contrato e filtros: src/shared/chat.ts.
 *
 * Escala com a Cloudflare na frente, sem WebSocket:
 *  - `GET /api/chat`: últimas mensagens + estado, a MESMA URL para todos, `Cache-Control: public, max-age=0, s-maxage=1`
 *    e ETag (a CDN busca no máximo 1×/s por ponto de presença). O corpo é montado no máximo 1×/s (ou quando algo muda)
 *    e comprimido uma vez. `intervaloS` sobe sozinho se a origem estiver recebendo muitas consultas (sem CDN).
 *  - `POST /api/chat` (publicar), `/api/chat/denuncia`, `/api/chat/presenca` e `/api/chat/reacao`: JSON do próprio
 *    site (Origin/Sec-Fetch-Site), corpo ≤ 4 KB.
 *  - Admin (`/api/admin/chat`, sessão + CSRF do painel): abrir/fechar, modo lento, fixar, apagar, manter (denunciada),
 *    silenciar/liberar autor, limpar tudo.
 *
 * Memória só (nada em disco, nada de IP): as últimas 300 mensagens, os limites por visitante e a presença. Visitante =
 * número de 53 bits do hash (rede do cliente com sal do processo + token aleatório do navegador); rede = só a rede.
 *
 * Trocar o token não zera os limites: autores NOVOS (1ª mensagem há menos de 10 min) da mesma rede dividem um modo lento
 * da rede e cada rede ganha no máximo 8 autores novos por hora; o painel pode silenciar a REDE inteira. Denúncia só conta
 * de quem está com a sala na tela há 2 min, por rede larga (IPv6 /48), com teto de mensagens escondidas por rede e
 * limiar que cresce com o público da sala.
 * Reiniciar o processo esvazia a sala e a deixa FECHADA (padrão seguro). Com réplicas, cada uma teria a sua sala:
 * o chat pressupõe 1 instância (a topologia recomendada, ARCHITECTURE §12.5).
 *
 * Dia da eleição: em produção, de 0h às 17h de 25/10 (Brasília) a sala não recebe mensagens (propaganda no dia da
 * eleição é crime — Lei 9.504/97, art. 39, § 5º), mesmo aberta no painel.
 */
import { randomBytes } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HttpBindings } from '@hono/node-server';
import { z } from 'zod';
import {
  LIMITES_CHAT,
  REACOES,
  arredondarPessoasSala,
  avaliarApelido,
  avaliarTexto,
  bloqueioDiaEleicao,
  chaveDuplicada,
  prepararExcecoes,
  prepararNomesApelido,
  tokenValido,
  type ChatAdmin,
  type ChatPublico,
  type ComandoChat,
  type FixadaChat,
  type MensagemAdmin,
  type MensagemChat,
  type MotivoRecusa,
  type ReacaoId,
  type RespostaEnvio,
} from '../shared/chat';
import type { LoadedDataset } from '../engine/api';
import { LimiteJanela, numeroDe } from './anuncios';
import { casaEtag, corpoCodificado, etagFraco, hashCurto, negociar, type CorpoPronto } from './http-cache';
import type { Logger } from './log';

/** Cache da CDN para o GET público (a mesma URL para todos). */
export const CC_CHAT = 'public, max-age=0, s-maxage=1';
const CC_PRIVADO = 'no-store';

/** Mensagens com mais de 12 h saem da memória (o servidor não guarda histórico). */
export const MENSAGEM_MAX_MS = 12 * 3600_000;
/**
 * Mensagens apagadas lembradas no GET (o navegador apaga do que já tinha). Além disso o navegador descarta o que tinha
 * dentro da janela das mensagens recebidas e não veio nela, e recomeça do zero depois de 25 min sem consultar.
 */
const MAX_REMOVIDAS = 500;
const REMOVIDA_MS = 30 * 60_000;
/** Limites anti-abuso além do modo lento e das 30/hora. */
const TENTATIVAS_MIN = 20; // envios (aceitos ou não) por visitante por minuto
const TENTATIVAS_REDE_MIN = 60; // envios por rede por minuto (trocar o token não multiplica)
const MENSAGENS_REDE_MIN = 12; // mensagens publicadas por rede por minuto (CGNAT: várias pessoas numa rede)
/** Autor "novo" (1ª mensagem há menos disso): os novos da mesma rede dividem um modo lento. */
const AUTOR_NOVO_MS = 10 * 60_000;
/** Autores novos (tokens que publicam pela 1ª vez) por rede por hora. */
const NOVOS_AUTORES_REDE_HORA = 8;
/** Denúncia só conta de quem está com a sala na tela há pelo menos isso (sinal de presença). */
const DENUNCIA_TELA_MS = 2 * 60_000;
/** Mensagens que uma mesma rede ajuda a esconder por hora (acima disso, as denúncias dela não escondem mais nada). */
const OCULTAR_REDE_HORA = 5;
/** Rede que ajudou a esconder tantas mensagens na última hora entra no aviso do painel. */
const ALERTA_REDE_OCULTAS = 3;
/** Limiar de denúncias cresce com o público: 1 rede a cada N pessoas na sala (mín. LIMITES_CHAT.denuncias, máx. 25). */
const PESSOAS_POR_DENUNCIA = 1000;
const LIMIAR_DENUNCIAS_MAX = 25;
/** Visitantes com a hora em que apareceram pela 1ª vez (para a regra das denúncias). */
const VISTOS_MAX = 500_000;
const VISTOS_REDE_10MIN = 120;
const DUPLICADA_AUTOR_MS = 10 * 60_000;
const DUPLICADA_GLOBAL_MS = 2 * 60_000;
const DUPLICADA_GLOBAL_MAX = 3;
const DENUNCIAS_MIN = 20;
/** Presença: no máximo N visitantes contados por rede (estimativa conservadora: atrás de CGNAT conta menos). */
const PRESENCA_POR_REDE = 10;
const PRESENCA_MIN = 6; // sinais por visitante por minuto
/** Visitantes na janela de presença guardados no máximo (≈ 40 MB no pior caso). */
const PRESENCA_MAX = 500_000;
/** Sinais de presença por segundo que a origem aceita receber (o intervalo sobe com a sala cheia). */
const PRESENCA_ALVO_RPS = 600;
/** Reações: lotes por visitante por minuto; no máximo 20 reações por lote; lotes por rede por minuto. */
const REACAO_LOTES_MIN = 12;
const REACAO_POR_LOTE = 20;
const REACAO_REDE_MIN = 600;
const BALDE_REACAO_MS = 10_000;
/** Consultas por segundo que a origem aceita no GET (sem CDN): acima disso o intervalo sugerido sobe. */
const GET_ALVO_RPS = 400;
const INTERVALO = { min: 2.5, max: 15 };

interface MsgInterna extends MensagemChat {
  autor: number;
  /** rede do autor (silenciar a rede tira as mensagens dela) */
  autorRede: number;
  /** redes (largas) cujas denúncias contam para esconder */
  denuncias: Set<number>;
  /** todas as redes que denunciaram (o painel mostra) */
  denunciasTodas: Set<number>;
  /** escondida por denúncias, esperando o admin */
  oculta: boolean;
  /** o admin decidiu manter: novas denúncias não escondem de novo */
  revisada: boolean;
}

interface Autor {
  /** 1ª mensagem publicada */
  desde: number;
  rede: number;
  ultimaEm: number;
  hora: number[];
  recentes: { chave: string; em: number }[];
  apelido: string;
}

/** Eventos por chave numa janela deslizante, com memória limitada (chaves sem evento recente saem primeiro). */
class ContaJanela {
  private m = new Map<number, number[]>();
  constructor(
    readonly janelaMs: number,
    private readonly now: () => number,
    readonly maxChaves = 200_000,
  ) {}

  quantos(k: number): number {
    const l = this.m.get(k);
    if (!l) return 0;
    const lim = this.now() - this.janelaMs;
    if (l[0] > lim) return l.length;
    const v = l.filter((t) => t > lim);
    if (v.length) this.m.set(k, v);
    else this.m.delete(k);
    return v.length;
  }

  marcar(k: number) {
    const l = this.m.get(k);
    if (l) l.push(this.now());
    else this.m.set(k, [this.now()]);
    if (this.m.size > this.maxChaves) this.podar();
  }

  /** Chaves com pelo menos `n` eventos na janela. */
  chavesCom(n: number): number {
    let c = 0;
    for (const k of [...this.m.keys()]) if (this.quantos(k) >= n) c++;
    return c;
  }

  private podar() {
    const lim = this.now() - this.janelaMs;
    for (const [k, l] of this.m) if (!l.some((t) => t > lim)) this.m.delete(k);
    let sobra = this.m.size - this.maxChaves;
    for (const k of this.m.keys()) {
      if (sobra-- <= 0) break;
      this.m.delete(k);
    }
  }
}

export const comandoChatSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('abrir') }),
  z.object({ acao: z.literal('fechar') }),
  z.object({ acao: z.literal('lento'), segundos: z.number().int().min(LIMITES_CHAT.lento.min).max(LIMITES_CHAT.lento.max) }),
  z.object({ acao: z.literal('fixar'), texto: z.string().max(LIMITES_CHAT.fixada * 2).nullable() }),
  z.object({ acao: z.literal('apagar'), id: z.string().min(1).max(40) }),
  z.object({ acao: z.literal('manter'), id: z.string().min(1).max(40) }),
  z.object({ acao: z.literal('silenciar'), autor: z.string().regex(/^[a-z0-9]{1,12}$/), minutos: z.number().int().min(1).max(7 * 24 * 60), rede: z.boolean().optional() }),
  z.object({ acao: z.literal('liberar'), autor: z.string().regex(/^[a-z0-9]{1,12}$/) }),
  z.object({ acao: z.literal('limpar') }),
]);

export interface OpcoesSalaChat {
  now?: () => number;
  /** produção: vale o bloqueio do dia da eleição (0h–17h de 25/10) */
  producao?: boolean;
  /** nomes de candidatos (dataset): recusados no apelido */
  nomesCandidatos?: readonly string[];
  /** nomes de município (dataset): "Gado Bravo", "Ponta Porã"… não contam como ofensa */
  municipios?: readonly string[];
  /** registro cifrado dos envios ligado (chat-registro.ts): a sala avisa nas regras */
  registro?: boolean;
}

const zerarReacoes = (): Record<ReacaoId, number> => ({ fogo: 0, uau: 0, palmas: 0, olhos: 0 });

/** Estado da sala e regras (sem HTTP: testável direto). */
export class SalaChat {
  private readonly now: () => number;
  private readonly producao: boolean;
  private readonly registro: boolean;
  private readonly nomes: string[];
  private readonly excecoes: string[];
  aberta = false;
  lentoS: number = LIMITES_CHAT.lento.padrao;
  fixada: FixadaChat | null = null;
  limpaEm = 0;
  /** muda a cada alteração visível ao público (chave do memo do GET) */
  versao = 0;
  private msgs: MsgInterna[] = [];
  private removidas: { id: string; em: number }[] = [];
  private seq = 0;
  private readonly prefixo = randomBytes(2).toString('hex');
  private autores = new Map<number, Autor>();
  private silenciados = new Map<number, { ate: number; apelido: string }>();
  /** redes silenciadas pelo painel (trocar o token não adianta) */
  private redesSilenciadas = new Map<number, { ate: number; apelido: string }>();
  private duplicadasGlobais = new Map<string, number[]>();
  private tentativas: LimiteJanela;
  private tentativasRede: LimiteJanela;
  private porRede: LimiteJanela;
  private denunciasLimite: LimiteJanela;
  private denunciasRede: LimiteJanela;
  /** autores novos por rede (última hora) */
  private novosPorRede: ContaJanela;
  /** última mensagem de um autor NOVO por rede (modo lento da rede para quem acabou de chegar) */
  private ultimaNovaRede = new Map<number, number>();
  /** quando cada visitante apareceu (sinal de presença ou 1ª ação) */
  private vistos = new Map<number, number>();
  private vistosRede: LimiteJanela;
  /** mensagens escondidas com a ajuda de cada rede (última hora) */
  private ajudouOcultar: ContaJanela;
  private ocultadasHora: ContaJanela;
  private presencaLimite: LimiteJanela;
  private reacaoLimite: LimiteJanela;
  private reacaoRede: LimiteJanela;
  private presenca = new Map<number, { em: number; rede: number }>();
  private presencaRede = new Map<number, number>();
  private varridaEm = 0;
  private presencaHist: { em: number; s: number }[] = [];
  private baldesReacao: { inicio: number; c: Record<ReacaoId, number> }[] = [];
  private gets = { inicio: 0, n: 0 };
  private intervalo: number = INTERVALO.min;
  readonly contadores: ChatAdmin['contadores'];
  private memo: { chave: string; corpo: ChatPublico; pronto: CorpoPronto; etag: string } | null = null;

  constructor(o: OpcoesSalaChat = {}) {
    this.now = o.now ?? Date.now;
    this.producao = !!o.producao;
    this.registro = !!o.registro;
    this.nomes = prepararNomesApelido(o.nomesCandidatos ?? []);
    this.excecoes = prepararExcecoes(o.municipios ?? []);
    this.tentativas = new LimiteJanela(TENTATIVAS_MIN, 60_000, this.now);
    this.tentativasRede = new LimiteJanela(TENTATIVAS_REDE_MIN, 60_000, this.now);
    this.porRede = new LimiteJanela(MENSAGENS_REDE_MIN, 60_000, this.now);
    this.denunciasLimite = new LimiteJanela(DENUNCIAS_MIN, 60_000, this.now);
    this.denunciasRede = new LimiteJanela(DENUNCIAS_MIN * 3, 60_000, this.now);
    this.novosPorRede = new ContaJanela(3600_000, this.now);
    this.vistosRede = new LimiteJanela(VISTOS_REDE_10MIN, 600_000, this.now);
    this.ajudouOcultar = new ContaJanela(3600_000, this.now);
    this.ocultadasHora = new ContaJanela(3600_000, this.now, 10);
    this.presencaLimite = new LimiteJanela(PRESENCA_MIN, 60_000, this.now);
    this.reacaoLimite = new LimiteJanela(REACAO_LOTES_MIN, 60_000, this.now);
    this.reacaoRede = new LimiteJanela(REACAO_REDE_MIN, 60_000, this.now);
    this.contadores = { publicadas: 0, recusadas: {}, denuncias: 0, ocultadas: 0, desde: this.now() };
  }

  /** Sala montada a partir do dataset (nomes de candidatos e de municípios). */
  static doDataset(ds: LoadedDataset, o: Omit<OpcoesSalaChat, 'nomesCandidatos' | 'municipios'> = {}): SalaChat {
    const nomes = [
      ...new Set(ds.meta.races.flatMap((r) => r.candidatos.filter((c) => !c.agregado).flatMap((c) => [c.nomeUrna, c.nome]))),
    ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
    const municipios = Object.values(ds.ufs).flatMap((u) => (u?.municipios ?? []).map((m) => m.nome));
    return new SalaChat({ ...o, nomesCandidatos: nomes, municipios });
  }

  // ---- identidade -------------------------------------------------------------------------------------------------

  /** Visitante (rede com sal + token) e rede, como números de 53 bits. `cliente` já é o hash da rede (clienteDe). */
  private quem(cliente: string, token: string) {
    return { visitante: numeroDe(`${cliente}|${token}`), rede: numeroDe(cliente) };
  }

  static idAutor(n: number): string {
    return n.toString(36).slice(-10);
  }

  private autorDoId(id: string): number | null {
    for (const m of this.msgs) if (SalaChat.idAutor(m.autor) === id) return m.autor;
    for (const [n] of this.silenciados) if (SalaChat.idAutor(n) === id) return n;
    for (const [n] of this.autores) if (SalaChat.idAutor(n) === id) return n;
    return null;
  }

  /** Código de uma rede silenciada no painel ("r" + código). */
  static idRede(n: number): string {
    return `r${SalaChat.idAutor(n)}`;
  }

  /** Marca quando o visitante apareceu pela 1ª vez (memória limitada; cada rede registra poucos por vez). */
  private registrarVisto(visitante: number, rede: number, agora: number) {
    if (this.vistos.has(visitante)) return;
    if (!this.vistosRede.tentar(String(rede))) return;
    this.vistos.set(visitante, agora);
    if (this.vistos.size > VISTOS_MAX) {
      let sobra = this.vistos.size - VISTOS_MAX;
      for (const k of this.vistos.keys()) {
        if (sobra-- <= 0) break;
        this.vistos.delete(k);
      }
    }
  }

  /** Denúncias de redes diferentes que escondem uma mensagem: cresce com o público da sala. */
  limiarDenuncias(): number {
    this.varrerPresenca(this.now());
    return Math.min(LIMIAR_DENUNCIAS_MAX, Math.max(LIMITES_CHAT.denuncias, Math.ceil(this.presenca.size / PESSOAS_POR_DENUNCIA)));
  }

  // ---- estado ------------------------------------------------------------------------------------------------------

  bloqueio(): string | null {
    return this.producao ? bloqueioDiaEleicao(this.now()) : null;
  }

  abertaAgora(): boolean {
    return this.aberta && !this.bloqueio();
  }

  private mudou() {
    this.versao++;
  }

  /** Tira da memória as mensagens com mais de 12 h. */
  private podar(agora: number) {
    const lim = agora - MENSAGEM_MAX_MS;
    if (this.msgs.length && this.msgs[0].em < lim) {
      this.msgs = this.msgs.filter((m) => m.em >= lim);
      this.mudou();
    }
  }

  private recusar(motivo: MotivoRecusa, erro: string, esperaS?: number): RespostaEnvio {
    this.contadores.recusadas[motivo] = (this.contadores.recusadas[motivo] ?? 0) + 1;
    return { ok: false, motivo, erro, ...(esperaS !== undefined ? { esperaS } : {}) };
  }

  /** Publica uma mensagem (ou diz por que não). `cliente`: chave anonimizada da rede (clienteDe). */
  enviar(corpo: { apelido?: unknown; texto?: unknown; token?: unknown }, cliente: string): RespostaEnvio {
    const agora = this.now();
    if (!this.abertaAgora()) return this.recusar('fechada', this.bloqueio() ?? 'A sala está fechada agora.');
    if (!tokenValido(corpo.token)) return this.recusar('token', 'Recarregue a página e tente de novo.');
    const { visitante, rede } = this.quem(cliente, corpo.token);
    if (!this.tentativas.tentar(String(visitante)) || !this.tentativasRede.tentar(String(rede))) return this.recusar('limite', 'Muitas tentativas. Espere um minuto.', 60);
    const silRede = this.redesSilenciadas.get(rede);
    if (silRede && silRede.ate > agora) return this.recusar('silenciado', 'A moderação pausou as mensagens desta rede por um tempo.', Math.ceil((silRede.ate - agora) / 1000));
    if (silRede) this.redesSilenciadas.delete(rede);
    const sil = this.silenciados.get(visitante);
    if (sil && sil.ate > agora) return this.recusar('silenciado', 'A moderação pausou as suas mensagens por um tempo.', Math.ceil((sil.ate - agora) / 1000));
    if (sil) this.silenciados.delete(visitante);
    this.registrarVisto(visitante, rede, agora);

    const ap = avaliarApelido(corpo.apelido, this.nomes);
    if (!('ok' in ap)) return this.recusar(ap.motivo, ap.erro);
    const tx = avaliarTexto(corpo.texto, { excecoes: this.excecoes });
    if (!('ok' in tx)) return this.recusar(tx.motivo, tx.erro);

    let autor = this.autores.get(visitante);
    // autor novo (ou que acabou de chegar): divide o modo lento com os outros novos da MESMA rede — trocar o token a cada
    // mensagem não fura o modo lento nem as 30/hora
    const novo = !autor || agora - autor.desde < AUTOR_NOVO_MS;
    if (novo) {
      const esperaRede = (this.ultimaNovaRede.get(rede) ?? -Infinity) + this.lentoS * 1000 - agora;
      if (esperaRede > 0) return this.recusar('lento', `Modo lento: espere ${Math.ceil(esperaRede / 1000)} s.`, Math.ceil(esperaRede / 1000));
    }
    if (!autor && this.novosPorRede.quantos(rede) >= NOVOS_AUTORES_REDE_HORA)
      return this.recusar('limite', 'Muitas pessoas novas comentando desta rede agora. Tente de novo em alguns minutos.', 300);
    if (autor) {
      const espera = autor.ultimaEm + this.lentoS * 1000 - agora;
      if (espera > 0) return this.recusar('lento', `Modo lento: espere ${Math.ceil(espera / 1000)} s.`, Math.ceil(espera / 1000));
      autor.hora = autor.hora.filter((t) => t > agora - 3600_000);
      if (autor.hora.length >= LIMITES_CHAT.porHora) {
        const s = Math.ceil((autor.hora[0] + 3600_000 - agora) / 1000);
        return this.recusar('limite', `Limite de ${LIMITES_CHAT.porHora} mensagens por hora. Volte em ${Math.ceil(s / 60)} min.`, s);
      }
    }
    const chave = chaveDuplicada(tx.ok);
    if (autor) {
      autor.recentes = autor.recentes.filter((r) => r.em > agora - DUPLICADA_AUTOR_MS);
      if (autor.recentes.some((r) => r.chave === chave)) return this.recusar('duplicada', 'Você já enviou essa mensagem agora há pouco.');
    }
    const globais = (this.duplicadasGlobais.get(chave) ?? []).filter((t) => t > agora - DUPLICADA_GLOBAL_MS);
    if (globais.length >= DUPLICADA_GLOBAL_MAX) return this.recusar('duplicada', 'Essa mesma mensagem já foi enviada várias vezes agora há pouco.');
    if (!this.porRede.tentar(String(rede))) return this.recusar('limite', 'Muitas mensagens saindo da sua rede agora. Tente em instantes.', 30);

    // publica
    const m: MsgInterna = {
      id: `${this.prefixo}${(++this.seq).toString(36)}`,
      apelido: ap.ok,
      texto: tx.ok,
      em: agora,
      autor: visitante,
      autorRede: rede,
      denuncias: new Set(),
      denunciasTodas: new Set(),
      oculta: false,
      revisada: false,
    };
    this.msgs.push(m);
    if (this.msgs.length > LIMITES_CHAT.buffer) this.msgs.splice(0, this.msgs.length - LIMITES_CHAT.buffer);
    if (!autor) {
      autor = { desde: agora, rede, ultimaEm: 0, hora: [], recentes: [], apelido: ap.ok };
      this.autores.set(visitante, autor);
      this.novosPorRede.marcar(rede);
    }
    if (novo) this.ultimaNovaRede.set(rede, agora);
    autor.ultimaEm = agora;
    autor.hora.push(agora);
    autor.recentes.push({ chave, em: agora });
    autor.apelido = ap.ok;
    globais.push(agora);
    this.duplicadasGlobais.set(chave, globais);
    this.contadores.publicadas++;
    this.limparMapas(agora);
    this.mudou();
    return { ok: true, mensagem: publica(m), proximaEmS: this.lentoS };
  }

  /** Esquece autores e duplicadas antigos (memória limitada). */
  private limparMapas(agora: number) {
    if (this.autores.size > 50_000) {
      for (const [k, a] of this.autores) if (a.ultimaEm < agora - 3600_000) this.autores.delete(k);
    }
    if (this.ultimaNovaRede.size > 50_000) {
      for (const [k, t] of this.ultimaNovaRede) if (t < agora - LIMITES_CHAT.lento.max * 1000) this.ultimaNovaRede.delete(k);
    }
    if (this.duplicadasGlobais.size > 5_000) {
      for (const [k, l] of this.duplicadasGlobais) if (!l.some((t) => t > agora - DUPLICADA_GLOBAL_MS)) this.duplicadasGlobais.delete(k);
    }
  }

  /**
   * Denúncia de um visitante. Com `limiarDenuncias()` redes LARGAS diferentes (IPv4 inteiro, IPv6 /48 — `redeLarga`),
   * a mensagem some até o admin decidir (a não ser que o admin já tenha decidido mantê-la). Só conta de quem está com a
   * sala na tela há 2 min (sinal de presença) e de rede que não ajudou a esconder muitas mensagens na última hora — uma
   * pessoa com 4G, Wi-Fi e outra faixa da mesma casa não consegue esconder em série as mensagens de um lado. A própria
   * mensagem não se denuncia. Todas as denúncias aparecem no painel.
   */
  denunciar(id: unknown, token: unknown, cliente: string, redeLarga: string = cliente): { ok: boolean; erro?: string } {
    if (typeof id !== 'string' || !tokenValido(token)) return { ok: false, erro: 'Denúncia inválida.' };
    const { visitante, rede } = this.quem(cliente, token);
    const rl = numeroDe(redeLarga);
    if (!this.denunciasLimite.tentar(String(visitante))) return { ok: false, erro: 'Muitas denúncias seguidas. Espere um minuto.' };
    if (!this.denunciasRede.tentar(String(rl))) return { ok: true };
    const agora = this.now();
    this.registrarVisto(visitante, rede, agora);
    const m = this.msgs.find((x) => x.id === id);
    if (!m || m.autor === visitante) return { ok: true };
    if (!m.denunciasTodas.has(rl)) {
      m.denunciasTodas.add(rl);
      this.contadores.denuncias++;
      this.mudou();
    }
    const desde = this.vistos.get(visitante);
    const naSala = desde !== undefined && agora - desde >= DENUNCIA_TELA_MS;
    if (!naSala || m.denuncias.has(rl) || this.ajudouOcultar.quantos(rl) >= OCULTAR_REDE_HORA) return { ok: true };
    m.denuncias.add(rl);
    if (!m.oculta && !m.revisada && m.denuncias.size >= this.limiarDenuncias()) {
      m.oculta = true;
      this.contadores.ocultadas++;
      for (const r of m.denuncias) this.ajudouOcultar.marcar(r);
      this.ocultadasHora.marcar(0);
      this.marcarRemovida(m.id);
      this.mudou();
    }
    return { ok: true };
  }

  private marcarRemovida(id: string) {
    const agora = this.now();
    this.removidas = this.removidas.filter((r) => r.id !== id && r.em > agora - REMOVIDA_MS);
    this.removidas.push({ id, em: agora });
    if (this.removidas.length > MAX_REMOVIDAS) this.removidas.splice(0, this.removidas.length - MAX_REMOVIDAS);
  }

  // ---- presença e reações -----------------------------------------------------------------------------------------

  /** Sinal de presença (sala aberta na tela). Conservador: até 10 visitantes por rede. Sala fechada/bloqueada: nada. */
  sinalPresenca(token: unknown, cliente: string): boolean {
    if (!tokenValido(token) || !this.abertaAgora()) return false;
    const { visitante, rede } = this.quem(cliente, token);
    if (!this.presencaLimite.tentar(String(visitante))) return false;
    const agora = this.now();
    this.registrarVisto(visitante, rede, agora);
    this.varrerPresenca(agora);
    const atual = this.presenca.get(visitante);
    if (!atual) {
      if (this.presenca.size >= PRESENCA_MAX) return false; // memória limitada (ataque com muitas redes)
      const n = this.presencaRede.get(rede) ?? 0;
      if (n >= PRESENCA_POR_REDE) return false;
      this.presencaRede.set(rede, n + 1);
    }
    this.presenca.set(visitante, { em: agora, rede });
    return true;
  }

  /** Intervalo entre sinais (s): 30 s; sobe com a sala cheia para a origem receber ~600 sinais/s no máximo. */
  presencaS(): number {
    return Math.min(180, Math.max(30, Math.round(this.presenca.size / PRESENCA_ALVO_RPS)));
  }

  /** Janela da presença: 2,5× o maior intervalo publicado nos últimos 10 min (quem seguiu o intervalo antigo conta). */
  private janelaPresenca(agora: number): number {
    const s = this.presencaS();
    this.presencaHist = this.presencaHist.filter((h) => h.em > agora - 600_000);
    if (!this.presencaHist.length || this.presencaHist[this.presencaHist.length - 1].s !== s) this.presencaHist.push({ em: agora, s });
    return 2.5 * 1000 * Math.max(...this.presencaHist.map((h) => h.s));
  }

  private varrerPresenca(agora: number) {
    if (agora - this.varridaEm < 5_000) return;
    this.varridaEm = agora;
    const lim = agora - this.janelaPresenca(agora);
    const porRede = new Map<number, number>();
    for (const [k, v] of this.presenca) {
      if (v.em < lim) this.presenca.delete(k);
      else porRede.set(v.rede, (porRede.get(v.rede) ?? 0) + 1);
    }
    this.presencaRede = porRede;
  }

  /** Pessoas com a sala na tela (estimativa arredondada) ou null sem ninguém. */
  pessoas(): number | null {
    this.varrerPresenca(this.now());
    const n = this.presenca.size;
    return n > 0 ? arredondarPessoasSala(n) : null;
  }

  /**
   * Lote de reações (contagem geral por minuto; nunca ligada a candidato nem a mensagem). Sala fechada ou no bloqueio do
   * dia da eleição: recusado.
   */
  reagir(token: unknown, contagem: unknown, cliente: string): boolean {
    if (!tokenValido(token) || !contagem || typeof contagem !== 'object' || !this.abertaAgora()) return false;
    const { visitante, rede } = this.quem(cliente, token);
    if (!this.reacaoLimite.tentar(String(visitante)) || !this.reacaoRede.tentar(String(rede))) return false;
    let total = 0;
    const lote = zerarReacoes();
    for (const r of REACOES) {
      const v = (contagem as Record<string, unknown>)[r];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        const n = Math.min(Math.floor(v), REACAO_POR_LOTE - total);
        lote[r] = n;
        total += n;
      }
    }
    if (total === 0) return false;
    const agora = this.now();
    const inicio = Math.floor(agora / BALDE_REACAO_MS) * BALDE_REACAO_MS;
    let b = this.baldesReacao[this.baldesReacao.length - 1];
    if (!b || b.inicio !== inicio) {
      b = { inicio, c: zerarReacoes() };
      this.baldesReacao.push(b);
      this.baldesReacao = this.baldesReacao.filter((x) => x.inicio > agora - 60_000 - BALDE_REACAO_MS);
    }
    for (const r of REACOES) b.c[r] += lote[r];
    return true;
  }

  /** Total de reações nos últimos 60 s (o público vê só o total: um número por emoji viraria enquete combinada fora). */
  reacoesTotal(): number {
    const r = this.reacoes();
    return REACOES.reduce((s, k) => s + r[k], 0);
  }

  /** Reações nos últimos 60 s, por tipo (só o painel). */
  reacoes(): Record<ReacaoId, number> {
    const agora = this.now();
    const out = zerarReacoes();
    for (const b of this.baldesReacao) if (b.inicio > agora - 60_000) for (const r of REACOES) out[r] += b.c[r];
    return out;
  }

  // ---- GET público ------------------------------------------------------------------------------------------------

  /** Conta uma consulta ao GET na origem e ajusta o intervalo sugerido (janelas de 10 s). */
  registrarConsulta() {
    const agora = this.now();
    if (agora - this.gets.inicio >= 10_000) {
      if (this.gets.inicio > 0) {
        const rps = this.gets.n / Math.max(1, (agora - this.gets.inicio) / 1000);
        // quem consulta ≈ consultas/s × intervalo atual; o intervalo novo leva a origem a ~GET_ALVO_RPS
        const consultores = rps * this.intervalo;
        const alvo = Math.min(INTERVALO.max, Math.max(INTERVALO.min, consultores / GET_ALVO_RPS));
        this.intervalo = Math.round(alvo * 2) / 2;
      }
      this.gets = { inicio: agora, n: 0 };
    }
    this.gets.n++;
  }

  intervaloS(): number {
    return this.intervalo;
  }

  publico(): ChatPublico {
    return this.publicoPronto().corpo;
  }

  /** Corpo do GET montado no máximo 1×/s (ou quando algo muda), com ETag do conteúdo (sem o relógio). */
  publicoPronto(): { corpo: ChatPublico; pronto: CorpoPronto; etag: string } {
    const agora = this.now();
    this.podar(agora);
    const chave = `${this.versao}|${Math.floor(agora / 1000)}|${this.abertaAgora()}`;
    if (this.memo?.chave === chave) return this.memo;
    const visiveis = this.msgs.filter((m) => !m.oculta && m.em > this.limpaEm);
    const corpo: ChatPublico = {
      aberta: this.abertaAgora(),
      bloqueio: this.aberta ? this.bloqueio() : null,
      lentoS: this.lentoS,
      fixada: this.fixada,
      pessoas: this.pessoas(),
      reacoes: this.abertaAgora() ? this.reacoesTotal() : 0,
      mensagens: visiveis.slice(-LIMITES_CHAT.publicas).map(publica),
      removidas: this.removidas.filter((r) => r.em > agora - REMOVIDA_MS).map((r) => r.id),
      limpaEm: this.limpaEm,
      intervaloS: this.intervalo,
      presencaS: this.presencaS(),
      ...(this.registro ? { registro: true } : {}),
      agora,
    };
    const { agora: _relogio, ...semRelogio } = corpo;
    const etag = etagFraco('chat', hashCurto(JSON.stringify(semRelogio)));
    this.memo = { chave, corpo, pronto: { bruto: Buffer.from(JSON.stringify(corpo)) }, etag };
    return this.memo;
  }

  // ---- admin -------------------------------------------------------------------------------------------------------

  comando(cmd: ComandoChat): { ok: true; log: string } | { ok: false; erro: string } {
    const agora = this.now();
    switch (cmd.acao) {
      case 'abrir':
        this.aberta = true;
        this.mudou();
        return { ok: true, log: 'sala aberta' };
      case 'fechar':
        this.aberta = false;
        this.mudou();
        return { ok: true, log: 'sala fechada' };
      case 'lento':
        this.lentoS = cmd.segundos;
        this.mudou();
        return { ok: true, log: `modo lento ${cmd.segundos} s` };
      case 'fixar': {
        const t = (cmd.texto ?? '').replace(/\s+/g, ' ').trim();
        if (t.length > LIMITES_CHAT.fixada) return { ok: false, erro: `A mensagem fixada pode ter até ${LIMITES_CHAT.fixada} caracteres.` };
        this.fixada = t ? { texto: t, em: agora } : null;
        this.mudou();
        return { ok: true, log: t ? 'mensagem fixada' : 'mensagem fixada removida' };
      }
      case 'apagar': {
        const i = this.msgs.findIndex((m) => m.id === cmd.id);
        if (i < 0) return { ok: false, erro: 'Mensagem não encontrada (talvez já tenha saído da sala).' };
        this.msgs.splice(i, 1);
        this.marcarRemovida(cmd.id);
        this.mudou();
        return { ok: true, log: 'mensagem apagada' };
      }
      case 'manter': {
        const m = this.msgs.find((x) => x.id === cmd.id);
        if (!m) return { ok: false, erro: 'Mensagem não encontrada (talvez já tenha saído da sala).' };
        m.oculta = false;
        m.revisada = true;
        this.removidas = this.removidas.filter((r) => r.id !== m.id);
        this.mudou();
        return { ok: true, log: 'mensagem denunciada mantida' };
      }
      case 'silenciar': {
        const n = this.autorDoId(cmd.autor);
        if (n === null) return { ok: false, erro: 'Autor não encontrado.' };
        const apelido = this.autores.get(n)?.apelido ?? this.msgs.find((m) => m.autor === n)?.apelido ?? '';
        const ate = agora + cmd.minutos * 60_000;
        this.silenciados.set(n, { ate, apelido });
        // rede inteira: quem troca o token a cada mensagem (as mensagens de todos os autores da rede saem)
        const rede = cmd.rede ? (this.autores.get(n)?.rede ?? this.msgs.find((m) => m.autor === n)?.autorRede ?? null) : null;
        if (cmd.rede && rede === null) return { ok: false, erro: 'Rede do autor não encontrada.' };
        if (rede !== null) this.redesSilenciadas.set(rede, { ate, apelido });
        let tirou = 0;
        this.msgs = this.msgs.filter((m) => {
          if (m.autor !== n && (rede === null || m.autorRede !== rede)) return true;
          this.marcarRemovida(m.id);
          tirou++;
          return false;
        });
        this.mudou();
        return { ok: true, log: `${rede !== null ? 'rede do autor' : 'autor'} silenciad${rede !== null ? 'a' : 'o'} por ${cmd.minutos} min (${tirou} mensagens retiradas)` };
      }
      case 'liberar': {
        if (cmd.autor.startsWith('r')) {
          for (const [k] of this.redesSilenciadas) if (SalaChat.idRede(k) === cmd.autor) this.redesSilenciadas.delete(k);
        }
        const n = this.autorDoId(cmd.autor);
        if (n !== null) this.silenciados.delete(n);
        return { ok: true, log: cmd.autor.startsWith('r') ? 'rede liberada' : 'autor liberado' };
      }
      case 'limpar':
        this.msgs = [];
        this.limpaEm = agora;
        this.removidas = [];
        this.mudou();
        return { ok: true, log: 'sala limpa' };
    }
  }

  paraAdmin(): ChatAdmin {
    const agora = this.now();
    const adm = (m: MsgInterna): MensagemAdmin => ({ ...publica(m), autor: SalaChat.idAutor(m.autor), denuncias: m.denunciasTodas.size, oculta: m.oculta, revisada: m.revisada });
    for (const [k, s] of this.silenciados) if (s.ate <= agora) this.silenciados.delete(k);
    for (const [k, s] of this.redesSilenciadas) if (s.ate <= agora) this.redesSilenciadas.delete(k);
    this.podar(agora);
    return {
      aberta: this.aberta,
      bloqueio: this.bloqueio(),
      lentoS: this.lentoS,
      fixada: this.fixada,
      pessoas: this.pessoas(),
      reacoes: this.reacoes(),
      mensagens: this.msgs.filter((m) => !m.oculta).slice(-150).map(adm),
      denunciadas: this.msgs.filter((m) => m.oculta || (m.denunciasTodas.size > 0 && !m.revisada)).map(adm),
      silenciados: [
        ...[...this.redesSilenciadas].map(([k, s]) => ({ autor: SalaChat.idRede(k), apelido: s.apelido, ate: s.ate, rede: true })),
        ...[...this.silenciados].map(([k, s]) => ({ autor: SalaChat.idAutor(k), apelido: s.apelido, ate: s.ate })),
      ],
      limiarDenuncias: this.limiarDenuncias(),
      alertaDenuncias: { redes: this.ajudouOcultar.chavesCom(ALERTA_REDE_OCULTAS), ocultadasHora: this.ocultadasHora.quantos(0) },
      contadores: this.contadores,
      intervaloS: this.intervalo,
      presencaS: this.presencaS(),
      agora,
    };
  }
}

const publica = (m: MensagemChat): MensagemChat => ({ id: m.id, apelido: m.apelido, texto: m.texto, em: m.em });

// ---- rotas ------------------------------------------------------------------------------------------------------------

type Ctx = Context<{ Bindings: HttpBindings }>;
type App = Hono<{ Bindings: HttpBindings }>;

export interface DepsRotasChat {
  sala: SalaChat;
  /** chave anonimizada da rede do cliente (hash com sal; nunca o IP) */
  clienteDe: (c: Ctx) => string;
  /** rede LARGA para contar denúncias (IPv6 /48; IPv4 inteiro); padrão = clienteDe */
  redeDenunciaDe?: (c: Ctx) => string;
  /** mensagem publicada (registro opcional de envios, desligado por padrão: chat-registro.ts) */
  aoPublicar?: (c: Ctx, id: string, em: number) => void;
  /** pedido do próprio site (Origin/Referer/Sec-Fetch-Site) */
  origemPermitida: (c: Ctx) => boolean;
  log: Logger;
}

const STATUS_RECUSA: Record<MotivoRecusa, number> = {
  fechada: 403,
  silenciado: 403,
  token: 400,
  apelido: 400,
  vazia: 400,
  longa: 400,
  link: 422,
  dados: 422,
  ofensa: 422,
  propaganda: 422,
  fraude: 422,
  repeticao: 422,
  duplicada: 422,
  lento: 429,
  limite: 429,
};

const erroJson = (c: Ctx, status: number, erro: string) => c.json({ ok: false, erro }, status as 400, { 'cache-control': CC_PRIVADO });

/** Corpo JSON pequeno de um POST do próprio site (ou a resposta de erro pronta). */
async function corpoDoSite(c: Ctx, deps: DepsRotasChat): Promise<Record<string, unknown> | Response> {
  // navegador manda Sec-Fetch-Site (ou ao menos Origin) em todo POST: sem eles não é a sala do site (curl, robô)
  const sfs = c.req.header('sec-fetch-site');
  if (!deps.origemPermitida(c) || (sfs ? sfs !== 'same-origin' : !c.req.header('origin'))) return erroJson(c, 403, 'Origem não permitida.');
  const ct = c.req.header('content-type') ?? '';
  if (!/^application\/json\b/i.test(ct)) return erroJson(c, 415, 'Envie o corpo como application/json.');
  try {
    const v: unknown = await c.req.json();
    if (!v || typeof v !== 'object' || Array.isArray(v)) return erroJson(c, 400, 'Corpo inválido.');
    return v as Record<string, unknown>;
  } catch {
    return erroJson(c, 400, 'JSON inválido no corpo da requisição.');
  }
}

const limiteCorpo = () => bodyLimit({ maxSize: 4096, onError: (c) => c.json({ ok: false, erro: 'Corpo grande demais.' }, 413, { 'cache-control': CC_PRIVADO }) });

/** Rotas públicas (registre ANTES do 404 genérico de /api/*). */
export function registrarChatPublico(app: App, deps: DepsRotasChat): void {
  const { sala } = deps;

  app.get('/api/chat', async (c) => {
    // a sala é UMA URL para todos (cache da CDN): query string só serve para furar o cache e inflar a contagem de
    // consultas (o intervalo sugerido sobe para todo mundo)
    if (new URL(c.req.url).search) return c.json({ ok: false, erro: 'Sem parâmetros.' }, 400, { 'cache-control': CC_PRIVADO });
    sala.registrarConsulta();
    const { pronto, etag } = sala.publicoPronto();
    const headers: Record<string, string> = { 'cache-control': CC_CHAT, etag, vary: 'Accept-Encoding', 'x-robots-tag': 'noindex' };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    const cod = negociar(c.req.header('accept-encoding'));
    const body = await corpoCodificado(pronto, cod);
    headers['content-type'] = 'application/json; charset=utf-8';
    if (body !== pronto.bruto && cod) headers['content-encoding'] = cod;
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength), 200, headers);
  });

  app.post('/api/chat', limiteCorpo(), async (c) => {
    const corpo = await corpoDoSite(c, deps);
    if (corpo instanceof Response) return corpo;
    const r = sala.enviar(corpo, deps.clienteDe(c));
    if (r.ok) {
      deps.aoPublicar?.(c, r.mensagem.id, r.mensagem.em);
      return c.json(r, 200, { 'cache-control': CC_PRIVADO });
    }
    const headers: Record<string, string> = { 'cache-control': CC_PRIVADO };
    if (r.esperaS) headers['retry-after'] = String(r.esperaS);
    return c.json(r, STATUS_RECUSA[r.motivo] as 400, headers);
  });

  app.post('/api/chat/denuncia', limiteCorpo(), async (c) => {
    const corpo = await corpoDoSite(c, deps);
    if (corpo instanceof Response) return corpo;
    const cliente = deps.clienteDe(c);
    const r = sala.denunciar(corpo.id, corpo.token, cliente, deps.redeDenunciaDe?.(c) ?? cliente);
    return c.json(r, r.ok ? 200 : 400, { 'cache-control': CC_PRIVADO });
  });

  app.post('/api/chat/presenca', limiteCorpo(), async (c) => {
    const corpo = await corpoDoSite(c, deps);
    if (corpo instanceof Response) return corpo;
    sala.sinalPresenca(corpo.token, deps.clienteDe(c));
    return c.body(null, 204, { 'cache-control': CC_PRIVADO });
  });

  app.post('/api/chat/reacao', limiteCorpo(), async (c) => {
    const corpo = await corpoDoSite(c, deps);
    if (corpo instanceof Response) return corpo;
    sala.reagir(corpo.token, corpo.r, deps.clienteDe(c));
    return c.body(null, 204, { 'cache-control': CC_PRIVADO });
  });
}

/** Rotas do painel (no roteador do admin, que já exige sessão e CSRF; registre ANTES de `app.route('/api/admin', …)`). */
export function registrarChatAdmin(admin: App, deps: Pick<DepsRotasChat, 'sala' | 'log'>): void {
  const { sala, log } = deps;
  admin.get('/chat', (c) => c.json(sala.paraAdmin()));
  admin.post('/chat', async (c) => {
    const ct = c.req.header('content-type') ?? '';
    if (!/^application\/json\b/i.test(ct)) return c.json({ erro: 'Envie o corpo como application/json.' }, 415);
    let bruto: unknown;
    try {
      bruto = await c.req.json();
    } catch {
      return c.json({ erro: 'JSON inválido no corpo da requisição.' }, 400);
    }
    const p = comandoChatSchema.safeParse(bruto);
    if (!p.success) return c.json({ erro: 'Comando do chat inválido.' }, 400);
    const r = sala.comando(p.data satisfies ComandoChat);
    if (!r.ok) return c.json({ erro: r.erro }, 400);
    // sem conteúdo de mensagem nem apelido no log (só a ação)
    log.info(`Admin: chat — ${r.log}`);
    return c.json(sala.paraAdmin());
  });
}
