/**
 * Registro de ENVIOS do chat (Marco Civil da Internet, art. 15; Lei 9.504/97, art. 57-D) — DESLIGADO por padrão.
 *
 * Por desenho o Sintonia não guarda IP (ARCHITECTURE §1.3). Um site com anúncios que publica conteúdo de usuários pode,
 * porém, ser obrigado a identificar o autor de uma mensagem por ordem judicial. Se o dono, com o advogado, decidir que é
 * preciso, este registro guarda, de cada mensagem PUBLICADA no chat, o necessário para ligar um print a quem a enviou —
 * id da mensagem, data e hora UTC, IP e porta de origem, o apelido e o texto publicados — e nada mais (nem navegador,
 * nem token). Sem o apelido e o texto, um print (apelido, HH:MM e texto) não liga a nenhuma linha depois que a mensagem
 * sai da memória (12 h ou um reinício): no mesmo minuto há dezenas de envios.
 *
 *  - liga só com `CHAT_REGISTRO_CHAVE` = caminho de uma chave PÚBLICA RSA (PEM, ≥ 2048 bits). A chave PRIVADA fica FORA
 *    da VPS: o servidor consegue gravar, mas não consegue ler o que gravou (cifra híbrida: AES-256-GCM por linha, chave
 *    da linha cifrada com RSA-OAEP/SHA-256). Abrir: `npx tsx scripts/chat-registro-abrir.ts` com a chave privada.
 *  - um arquivo por dia em STATE_DIR/chat-registro/AAAA-MM-DD.reg (pasta 700, arquivos 600), fora do backup comum
 *    (deploy/backup.sh), apagado depois de `RETENCAO_DIAS` (6 meses, o prazo do art. 15);
 *  - a porta de origem só existe atrás de proxy se ele a repassar (`CHAT_REGISTRO_HEADER_PORTA`, ex.: um cabeçalho que a
 *    Cloudflare preenche com `cf.edge.client_port` numa Transform Rule); sem isso, fica vazia.
 *
 * Com o registro ligado, a /privacidade e as regras da sala precisam dizer isso (a sala já avisa sozinha: `registro`
 * no GET público). Falha ao gravar nunca derruba o chat: vai para o log (sem conteúdo).
 */
import { constants, createCipheriv, createDecipheriv, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, type KeyObject } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Guarda: 6 meses (Marco Civil, art. 15) + folga de 3 dias. */
export const RETENCAO_DIAS = 186;
const DIA_MS = 86_400_000;
const RE_ARQUIVO = /^(\d{4}-\d{2}-\d{2})\.reg$/;

export interface EnvioRegistrado {
  /** id da mensagem (o mesmo do painel e do GET público) */
  id: string;
  /** epoch ms (relógio do servidor) */
  em: number;
  ip: string;
  porta: number | null;
  /** apelido e texto PUBLICADOS (já normalizados pela sala) — opcionais: linhas antigas não têm */
  apelido?: string;
  texto?: string;
}

const b64 = (b: Buffer) => b.toString('base64');

/** Cifra uma linha com a chave pública (AES-256-GCM + RSA-OAEP/SHA-256). Formato: `v1.<chave>.<iv>.<tag>.<dados>`. */
export function cifrarLinha(chavePublica: KeyObject, texto: string): string {
  const k = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  const ek = publicEncrypt({ key: chavePublica, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, k);
  return ['v1', b64(ek), b64(iv), b64(c.getAuthTag()), b64(dados)].join('.');
}

/** Abre uma linha com a chave PRIVADA (fora da VPS). Linha inválida → null. */
export function decifrarLinha(chavePrivadaPem: string | Buffer, linha: string): EnvioRegistrado | null {
  const p = linha.trim().split('.');
  if (p.length !== 5 || p[0] !== 'v1') return null;
  try {
    const k = privateDecrypt({ key: chavePrivadaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(p[1], 'base64'));
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(p[2], 'base64'));
    d.setAuthTag(Buffer.from(p[3], 'base64'));
    const texto = Buffer.concat([d.update(Buffer.from(p[4], 'base64')), d.final()]).toString('utf8');
    const v = JSON.parse(texto) as EnvioRegistrado;
    return typeof v.id === 'string' && typeof v.em === 'number' && typeof v.ip === 'string' ? v : null;
  } catch {
    return null;
  }
}

export interface OpcoesRegistro {
  /** pasta (STATE_DIR/chat-registro) */
  dir: string;
  /** chave PÚBLICA RSA em PEM */
  chavePublicaPem: string;
  now?: () => number;
  retencaoDias?: number;
  /** falha ao gravar (log sem conteúdo) */
  aoFalhar?: (e: unknown) => void;
}

export class RegistroEnvios {
  private readonly chave: KeyObject;
  private readonly now: () => number;
  private readonly retencaoDias: number;
  private podadoEm = '';

  constructor(private readonly o: OpcoesRegistro) {
    const chave = createPublicKey(o.chavePublicaPem);
    if (chave.asymmetricKeyType !== 'rsa' || (chave.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error('CHAT_REGISTRO_CHAVE: use uma chave pública RSA de pelo menos 2048 bits (PEM).');
    }
    this.chave = chave;
    this.now = o.now ?? Date.now;
    this.retencaoDias = o.retencaoDias ?? RETENCAO_DIAS;
    mkdirSync(o.dir, { recursive: true, mode: 0o700 });
    chmodSync(o.dir, 0o700);
  }

  /** Grava um envio (uma linha cifrada no arquivo do dia, UTC). Nunca lança. */
  registrar(e: EnvioRegistrado): void {
    try {
      const dia = new Date(e.em).toISOString().slice(0, 10);
      const arq = join(this.o.dir, `${dia}.reg`);
      const novo = !existsSync(arq);
      appendFileSync(arq, `${cifrarLinha(this.chave, JSON.stringify({ id: e.id, em: e.em, utc: new Date(e.em).toISOString(), ip: e.ip, porta: e.porta, apelido: e.apelido ?? null, texto: e.texto ?? null }))}\n`, { mode: 0o600 });
      if (novo) chmodSync(arq, 0o600);
      if (this.podadoEm !== dia) {
        this.podadoEm = dia;
        this.podar();
      }
    } catch (err) {
      this.o.aoFalhar?.(err);
    }
  }

  /** Apaga os arquivos mais velhos que a retenção. */
  podar(): number {
    const lim = new Date(this.now() - this.retencaoDias * DIA_MS).toISOString().slice(0, 10);
    let n = 0;
    for (const f of readdirSync(this.o.dir)) {
      const m = RE_ARQUIVO.exec(f);
      if (m && m[1] < lim) {
        rmSync(join(this.o.dir, f), { force: true });
        n++;
      }
    }
    return n;
  }
}
