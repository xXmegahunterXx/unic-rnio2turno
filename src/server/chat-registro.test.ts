/**
 * Registro cifrado dos envios do chat (desligado por padrão): só id, hora, IP e porta; o servidor grava com a chave
 * PÚBLICA e não consegue ler; arquivos 600 numa pasta 700; apagado depois de 6 meses; sem a chave, nada é gravado.
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChatPublico } from '../shared/chat';
import { RETENCAO_DIAS, RegistroEnvios, cifrarLinha, decifrarLinha } from './chat-registro';
import { login, montar } from './test-helpers';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('registro de envios do chat (chat-registro.ts)', () => {
  it('cifra com a chave pública e só a privada abre; linha adulterada não abre', () => {
    const linha = cifrarLinha(publicKey, JSON.stringify({ id: 'ab1', em: 1, ip: '203.0.113.9', porta: 51000 }));
    expect(linha).not.toContain('203.0.113.9');
    expect(decifrarLinha(PRIV, linha)).toMatchObject({ id: 'ab1', ip: '203.0.113.9', porta: 51000 });
    const p = linha.split('.');
    p[4] = Buffer.from('outra coisa').toString('base64');
    expect(decifrarLinha(PRIV, p.join('.'))).toBeNull();
    expect(decifrarLinha(PRIV, 'lixo')).toBeNull();
  });

  it('arquivo por dia (600) numa pasta 700; apaga o que passou de 6 meses; recusa chave fraca', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sintonia-reg-')), 'chat-registro');
    const relogio = { t: Date.UTC(2026, 9, 25, 22, 0, 0) };
    const r = new RegistroEnvios({ dir, chavePublicaPem: PUB, now: () => relogio.t });
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    r.registrar({ id: 'm1', em: relogio.t, ip: '198.51.100.7', porta: null });
    const arq = join(dir, '2026-10-25.reg');
    expect(statSync(arq).mode & 0o777).toBe(0o600);
    const texto = readFileSync(arq, 'utf8');
    expect(texto).not.toContain('198.51.100.7');
    expect(decifrarLinha(PRIV, texto.trim())).toMatchObject({ id: 'm1', ip: '198.51.100.7', porta: null });
    // 6 meses depois, o arquivo antigo sai
    relogio.t += (RETENCAO_DIAS + 1) * 86_400_000;
    r.registrar({ id: 'm2', em: relogio.t, ip: '198.51.100.8', porta: 1 });
    expect(existsSync(arq)).toBe(false);
    expect(readdirSync(dir)).toHaveLength(1);
    const fraca = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(() => new RegistroEnvios({ dir, chavePublicaPem: fraca })).toThrow(/2048/);
  });

  it('desligado por padrão: nada é gravado e a sala não avisa', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    const cookie = await login(m);
    const h = { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' };
    await m.app.request('/api/admin/chat', { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ acao: 'abrir' }) });
    const r = await m.app.request('/api/chat', { method: 'POST', headers: { ...h, 'x-real-ip': '203.0.113.30' }, body: JSON.stringify({ apelido: 'Ana', texto: 'boa noite', token: 'token-de-teste-000001' }) });
    expect(r.status).toBe(200);
    expect(existsSync(join(m.stateDir, 'chat-registro'))).toBe(false);
    expect(((await (await m.app.request('/api/chat')).json()) as ChatPublico).registro).toBeUndefined();
  });

  it('ligado (CHAT_REGISTRO_CHAVE): cada mensagem PUBLICADA vira uma linha cifrada com id, hora, IP e porta; a sala avisa', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sintonia-chave-'));
    const arqChave = join(pasta, 'publica.pem');
    writeFileSync(arqChave, PUB);
    const m = await montar({ env: { TRUST_PROXY: '1', CHAT_REGISTRO_CHAVE: arqChave, CHAT_REGISTRO_HEADER_PORTA: 'x-porta-cliente' } });
    const cookie = await login(m);
    const h = { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' };
    await m.app.request('/api/admin/chat', { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ acao: 'abrir' }) });
    const ok = await m.app.request('/api/chat', {
      method: 'POST',
      headers: { ...h, 'x-real-ip': '203.0.113.31', 'x-porta-cliente': '50123' },
      body: JSON.stringify({ apelido: 'Ana', texto: 'boa noite', token: 'token-de-teste-000002' }),
    });
    const msg = ((await ok.json()) as { mensagem: { id: string } }).mensagem;
    // recusada (ofensa): não entra no registro
    await m.app.request('/api/chat', { method: 'POST', headers: { ...h, 'x-real-ip': '203.0.113.32' }, body: JSON.stringify({ apelido: 'Bia', texto: 'p0rr4', token: 'token-de-teste-000003' }) });
    const dir = join(m.stateDir, 'chat-registro');
    const linhas = readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n'));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).not.toContain('203.0.113.31');
    expect(decifrarLinha(PRIV, linhas[0])).toMatchObject({ id: msg.id, ip: '203.0.113.31', porta: 50123 });
    expect(((await (await m.app.request('/api/chat')).json()) as ChatPublico).registro).toBe(true);
  });
});
