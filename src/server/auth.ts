/**
 * Autenticação do admin:
 *  - senha comparada em tempo constante (SHA-256 dos dois lados + timingSafeEqual);
 *  - sessão em cookie assinado: `v1.<expira>.<nonce>.<HMAC-SHA256>` (sem estado no servidor, exceto a lista de
 *    sessões encerradas por logout até expirarem);
 *  - limite de tentativas de login por cliente (janela deslizante) e global.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_SESSAO = 'sintonia_admin';
export const SESSAO_MS = 12 * 3600_000;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Compara a senha informada com a configurada sem vazar tempo (nem o tamanho). */
export function senhaConfere(informada: unknown, configurada: string): boolean {
  if (typeof informada !== 'string' || informada.length === 0 || informada.length > 1024) return false;
  return timingSafeEqual(sha256(informada), sha256(configurada));
}

const b64url = (b: Buffer) => b.toString('base64url');

export class Sessoes {
  /** nonce → expiração (sessões encerradas por logout) */
  private revogadas = new Map<string, number>();

  constructor(
    private readonly segredo: Buffer,
    private readonly now: () => number = Date.now,
    readonly duracaoMs = SESSAO_MS,
  ) {}

  private assinar(corpo: string): string {
    return b64url(createHmac('sha256', this.segredo).update(corpo).digest());
  }

  criar(): { token: string; expira: number } {
    const expira = this.now() + this.duracaoMs;
    const corpo = `v1.${expira}.${b64url(randomBytes(16))}`;
    return { token: `${corpo}.${this.assinar(corpo)}`, expira };
  }

  /** Token válido (assinatura, formato, validade e não revogado)? */
  validar(token: string | undefined | null): boolean {
    if (!token || token.length > 256) return false;
    const partes = token.split('.');
    if (partes.length !== 4 || partes[0] !== 'v1') return false;
    const [v, exp, nonce, assinatura] = partes;
    const esperada = Buffer.from(this.assinar(`${v}.${exp}.${nonce}`));
    const recebida = Buffer.from(assinatura);
    if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return false;
    const expira = Number(exp);
    if (!Number.isFinite(expira) || expira <= this.now()) return false;
    if (expira > this.now() + this.duracaoMs + 60_000) return false;
    return !this.revogadas.has(nonce);
  }

  /** Logout: o token deixa de valer mesmo antes de expirar. */
  revogar(token: string | undefined | null): void {
    if (!token || !this.validar(token)) return;
    const [, exp, nonce] = token.split('.');
    this.revogadas.set(nonce, Number(exp));
    const agora = this.now();
    for (const [n, e] of this.revogadas) if (e <= agora) this.revogadas.delete(n);
  }
}

/** Limite de eventos por chave numa janela deslizante (ex.: 10 logins/min por cliente). */
export class LimiteTaxa {
  private eventos = new Map<string, number[]>();

  constructor(
    readonly max: number,
    readonly janelaMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra uma tentativa. Retorna 0 se permitida, ou os segundos até liberar. */
  tentar(chave: string): number {
    const agora = this.now();
    const lim = agora - this.janelaMs;
    const lista = (this.eventos.get(chave) ?? []).filter((t) => t > lim);
    if (lista.length >= this.max) {
      this.eventos.set(chave, lista);
      return Math.max(1, Math.ceil((lista[0] + this.janelaMs - agora) / 1000));
    }
    lista.push(agora);
    this.eventos.set(chave, lista);
    if (this.eventos.size > 10_000) this.limpar();
    return 0;
  }

  /** Libera a chave (login bem-sucedido). */
  zerar(chave: string): void {
    this.eventos.delete(chave);
  }

  private limpar() {
    const lim = this.now() - this.janelaMs;
    for (const [k, l] of this.eventos) if (!l.some((t) => t > lim)) this.eventos.delete(k);
  }
}

/** Prefixos IPv6 usados para agrupar: /64 (limites comuns), /56 (audiência vendável), /48 (denúncias do chat). */
export type PrefixoV6 = 64 | 56 | 48;

/**
 * Rede do cliente para limites e contagem: IPv4 inteiro; IPv6 só o prefixo (padrão /64: uma casa ou um servidor recebe
 * uma faixa /64 inteira — trocar o endereço dentro dela não pode zerar os limites; /56 e /48 agrupam mais, para números
 * que não podem ser inflados por quem tem muitas /64, como a audiência que vai para material de venda e as denúncias).
 * IPv4 dentro de IPv6 (::ffff:1.2.3.4) vira o IPv4. Endereço que não parece IP segue como está.
 */
export function redeDoCliente(ip: string, prefixo: PrefixoV6 = 64): string {
  let x = ip.trim().toLowerCase();
  const zona = x.indexOf('%');
  if (zona >= 0) x = x.slice(0, zona);
  if (x.startsWith('[') && x.endsWith(']')) x = x.slice(1, -1);
  if (!x.includes(':')) return x;
  const v4 = /^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(x) ?? /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(x);
  if (v4) return v4[1];
  // expande "::" e um IPv4 no fim (…:1.2.3.4 = dois grupos)
  let s = x;
  const m4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m4) {
    const [a, b, c, d] = m4.slice(1).map(Number);
    s = `${s.slice(0, m4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [esq, dir] = s.split('::');
  const ge = esq ? esq.split(':') : [];
  const gd = dir !== undefined ? (dir ? dir.split(':') : []) : [];
  const meio = dir !== undefined ? Array(Math.max(0, 8 - ge.length - gd.length)).fill('0') : [];
  const grupos = [...ge, ...meio, ...gd];
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return x;
  const n = grupos.slice(0, 4).map((g) => parseInt(g, 16));
  if (prefixo === 56) n[3] &= 0xff00;
  if (prefixo === 48) n.length = 3;
  return `${n.map((g) => g.toString(16)).join(':')}::/${prefixo}`;
}

/**
 * Identificador do cliente para limites/contagem: hash curto da rede (IPv4 inteiro, IPv6 /64 — ou o prefixo pedido),
 * nunca o IP em claro.
 */
export function chaveCliente(ip: string, sal: Buffer, prefixo: PrefixoV6 = 64): string {
  return createHash('sha256').update(sal).update(redeDoCliente(ip, prefixo)).digest('base64url').slice(0, 16);
}
