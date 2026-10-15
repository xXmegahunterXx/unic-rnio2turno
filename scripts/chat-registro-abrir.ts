/**
 * Abre o registro cifrado dos envios do chat (src/server/chat-registro.ts) — SÓ para cumprir ordem judicial, fora da
 * VPS, com a chave PRIVADA (que nunca vai para o servidor).
 *
 *   npx tsx scripts/chat-registro-abrir.ts --chave privada.pem --dir ./chat-registro [--id <id da mensagem>] [--dia AAAA-MM-DD]
 *                                          [--apelido <apelido>] [--texto <trecho do texto>]
 *
 * Saída: uma linha JSON por envio ({ id, utc, ip, porta, apelido, texto }). Sem filtro, todos os envios dos arquivos
 * escolhidos. Para casar um print (apelido, HH:MM e texto): --dia, --apelido e um trecho do texto (sem diferenciar
 * maiúsculas).
 *
 * Gerar o par de chaves (uma vez, num computador seguro; só a PÚBLICA vai para a VPS, em CHAT_REGISTRO_CHAVE):
 *   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out chat-registro-privada.pem
 *   openssl pkey -in chat-registro-privada.pem -pubout -out chat-registro-publica.pem
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decifrarLinha } from '../src/server/chat-registro';

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const chave = arg('chave');
const dir = arg('dir');
const id = arg('id');
const dia = arg('dia');
const apelido = arg('apelido')?.toLowerCase();
const trecho = arg('texto')?.toLowerCase();
if (!chave || !dir) {
  console.error('Uso: npx tsx scripts/chat-registro-abrir.ts --chave privada.pem --dir <pasta chat-registro> [--id <id>] [--dia AAAA-MM-DD]');
  process.exit(2);
}
const pem = readFileSync(chave);
const arquivos = readdirSync(dir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.reg$/.test(f) && (!dia || f.startsWith(dia)))
  .sort();
let n = 0;
let ruins = 0;
for (const f of arquivos) {
  for (const linha of readFileSync(join(dir, f), 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    const e = decifrarLinha(pem, linha);
    if (!e) {
      ruins++;
      continue;
    }
    if (id && e.id !== id) continue;
    if (apelido && (e.apelido ?? '').toLowerCase() !== apelido) continue;
    if (trecho && !(e.texto ?? '').toLowerCase().includes(trecho)) continue;
    console.log(JSON.stringify({ id: e.id, utc: new Date(e.em).toISOString(), ip: e.ip, porta: e.porta, apelido: e.apelido ?? null, texto: e.texto ?? null }));
    n++;
  }
}
console.error(`${n} envio(s) em ${arquivos.length} arquivo(s)${ruins ? `; ${ruins} linha(s) que esta chave não abre` : ''}.`);
