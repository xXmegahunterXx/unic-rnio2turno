/**
 * Alertas da noite (I16): configuração pelo ambiente (desligados sem as variáveis), as 4 condições essenciais e as
 * extras, 1 mensagem por tipo a cada 10 min com "resolvido" na volta, mensagens curtas e sem segredo no log, batimento
 * externo, teste do painel e o ensaio do update.sh que nunca envia. Relógio e fetch falsos (sem rede).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TseHealth } from '../tse';
import type { FrescorCorrida } from '../shared/types';
import type { ResumoMinuto } from './metrics';
import { ALERTAS, AlertasNoite, configAlertas, cortar, limiteMemoriaMb, type ConfigAlertas, type FontesAlertas } from './alertas';

const T0 = Date.UTC(2026, 9, 25, 22, 0, 0); // 19:00 de Brasília
const TOKEN = '123456789:AAEexemploDeTokenDoBotFather_0123456789';
const CFG: ConfigAlertas = { telegram: { token: TOKEN, chatId: '987654321' }, batimentoUrl: 'https://hc-ping.com/uuid-exemplo', avisos: [] };

function fetchFalso(status = 200) {
  const chamadas: { url: string; corpo: { chat_id?: string; text?: string } | null }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response('{"ok":true}', { status });
  });
  return { f, chamadas, textos: () => chamadas.filter((c) => c.url.includes('api.telegram.org')).map((c) => c.corpo!.text!) };
}

/** Saúde do TSE mínima para os testes. */
function saudeTse(p: { st?: number; falhas?: number; prioFalhas?: number; bloqueio?: TseHealth['bloqueio']; status?: 'apurando' | 'encerrada'; parado?: number | null } = {}): TseHealth {
  return {
    ok: true,
    bloqueio: p.bloqueio ?? null,
    bloqueadoAte: p.bloqueio?.ate ?? null,
    rodando: true,
    intervaloSeg: 15,
    esperaSeg: 15,
    prioritario: { falhasConsecutivas: p.prioFalhas ?? 0, erro: p.prioFalhas ? 'HTTP 503' : null } as TseHealth['prioritario'],
    config: {} as TseHealth['config'],
    ultimoCiclo: null,
    corridas: [
      {
        race: 'pres',
        mapeadaComo: 'pres',
        eleicao: '6258',
        status: p.status ?? 'apurando',
        secoes: 1000,
        secoesTotalizadas: p.st ?? 500,
        ultimaAtualizacao: null,
        ultimoPoll: null,
        ultimoPollOk: null,
        ultimoPollMs: null,
        falhasConsecutivas: p.falhas ?? 0,
        erro: null,
        ausentes: [],
        conferidoEm: null,
        nacionalParadoDesde: p.parado ?? null,
      },
    ],
    municipios: { emCache: 0, fila: 0, baixando: 0 },
    secoes: { emCache: 0 },
    http: {} as TseHealth['http'],
  };
}

function montar(o: { cfg?: ConfigAlertas; envio?: boolean; status?: number } = {}) {
  const ff = fetchFalso(o.status);
  const estado = {
    fonte: 'tse' as const,
    fase: 'apurando' as const,
    tse: saudeTse(),
    frescor: { pres: { marca: 'm1', conferidoEm: T0 } } as Partial<Record<string, FrescorCorrida>>,
    minuto: null as ResumoMinuto | null,
    loop: 5,
    mem: { usadaMb: 400, limiteMb: 1536 as number | null },
    troca: null as { estado: 'aguardando-tse' | 'feita'; inicio: number } | null,
  };
  const fontes: FontesAlertas = {
    status: () => ({ fonte: estado.fonte, fase: estado.fase }),
    tse: () => estado.tse,
    frescor: () => estado.frescor,
    minuto: () => estado.minuto,
    loopMs: () => estado.loop,
    memoria: () => estado.mem,
    trocaAuto: () => estado.troca,
  };
  const logs: string[] = [];
  const a = new AlertasNoite({
    config: o.cfg ?? CFG,
    fontes,
    fetch: ff.f,
    envio: o.envio,
    versao: 'abc1234',
    log: { info: (m) => logs.push(m), aviso: (m) => logs.push(m) },
  });
  return { a, estado, ff, logs };
}

const minuto = (requisicoes: number, erros5xx: number, p99: number): ResumoMinuto => ({
  requisicoes,
  p50: 1,
  p95: 2,
  p99,
  max: p99,
  erros5xx,
  cacheHit: 0.9,
  respostas304: 0,
  respostas429: 0,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: T0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('configuração pelo ambiente', () => {
  it('desligados sem as variáveis; ligados com token + chat válidos; ALERTAS=0 desliga tudo', () => {
    expect(configAlertas({})).toEqual({ telegram: null, batimentoUrl: null, avisos: [] });
    const c = configAlertas({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '-1001234567890', HC_PING_URL: 'https://hc-ping.com/abc' });
    expect(c.telegram).toEqual({ token: TOKEN, chatId: '-1001234567890' });
    expect(c.batimentoUrl).toBe('https://hc-ping.com/abc');
    expect(configAlertas({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '@canal_sintonia' }).telegram?.chatId).toBe('@canal_sintonia');
    const off = configAlertas({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '1', HC_PING_URL: 'https://hc-ping.com/abc', ALERTAS: '0' });
    expect(off.telegram).toBeNull();
    expect(off.batimentoUrl).toBeNull();
  });

  it('variável faltando ou malformada: desligado com aviso — e o token nunca aparece no aviso', () => {
    const so = configAlertas({ TELEGRAM_BOT_TOKEN: TOKEN });
    expect(so.telegram).toBeNull();
    expect(so.avisos.join(' ')).toMatch(/sem TELEGRAM_CHAT_ID/);
    const mal = configAlertas({ TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_CHAT_ID: '1' });
    expect(mal.telegram).toBeNull();
    const chatMal = configAlertas({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: 'meu chat' });
    expect(chatMal.telegram).toBeNull();
    expect(chatMal.avisos.join(' ')).not.toContain(TOKEN);
    expect(configAlertas({ HC_PING_URL: 'http://hc-ping.com/x' }).batimentoUrl).toBeNull();
    expect(configAlertas({ HC_PING_URL: 'lixo' }).avisos).toHaveLength(1);
  });

  it('limite de memória do contêiner (cgroup v2/v1); sem limite = null', () => {
    expect(limiteMemoriaMb(() => '1610612736\n')).toBe(1536);
    expect(limiteMemoriaMb(() => 'max')).toBeNull();
    expect(limiteMemoriaMb(() => '9223372036854771712')).toBeNull();
    expect(
      limiteMemoriaMb(() => {
        throw new Error('ENOENT');
      }),
    ).toBeNull();
  });
});

describe('condições e mensagens', () => {
  it('reinício: uma mensagem na subida, com a versão; batimento externo a cada 60 s', async () => {
    const { a, ff } = montar();
    a.iniciar();
    await vi.advanceTimersByTimeAsync(10);
    expect(ff.textos()).toEqual(['Sintonia: o servidor (re)iniciou às 19:00:00 (versão abc1234).']);
    const hc = () => ff.chamadas.filter((c) => c.url === CFG.batimentoUrl).length;
    expect(hc()).toBe(1);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(hc()).toBe(4);
    a.parar();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(hc()).toBe(4);
  });

  it('placar nacional parado há mais de 3 min: 1 alerta, nada repetido, "resolvido" quando volta', async () => {
    const { a, estado, ff, logs } = montar();
    a.iniciar();
    await vi.advanceTimersByTimeAsync(10);
    const base = ff.textos().length;
    // a leitura do TSE segue boa (conferidoEm anda), mas a marca dos números não muda
    const it = setInterval(() => {
      estado.frescor = { pres: { marca: 'm1', conferidoEm: Date.now() } };
    }, 5_000);
    await vi.advanceTimersByTimeAsync(170_000);
    expect(ff.textos().length).toBe(base);
    await vi.advanceTimersByTimeAsync(30_000);
    const novos = ff.textos().slice(base);
    expect(novos).toHaveLength(1);
    expect(novos[0]).toMatch(/^Sintonia: placar nacional sem dado novo há 3 min \(50,00% das seções\)\.$/);
    expect(a.ativos().map((x) => x.tipo)).toEqual(['placar-parado']);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(ff.textos().slice(base)).toHaveLength(1); // ativo, mas sem repetir
    estado.frescor = { pres: { marca: 'm2', conferidoEm: Date.now() } };
    clearInterval(it);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ff.textos().slice(base)[1]).toMatch(/^Sintonia: resolvido — placar nacional parado \(às 19:0\d:\d\d, depois de \d+ min\)\.$/);
    expect(a.ativos()).toEqual([]);
    expect(logs.some((l) => l.startsWith('Alerta: placar nacional parado'))).toBe(true);
    a.parar();
  });

  it('o mesmo tipo no máximo 1 vez a cada 10 min (vai e volta rápido: o 2º aviso espera)', () => {
    const { a, estado, ff } = montar();
    const bloqueio = (ate: number) => ({ desde: Date.now(), ate, motivo: 'http-429' as const, httpStatus: 429, arquivo: 'br.json', porRetryAfter: false, motivoTexto: 'HTTP 429 (pedidos demais)' });
    estado.tse = saudeTse({ bloqueio: bloqueio(T0 + 11 * 60_000) });
    a.avaliar();
    expect(ff.textos()).toHaveLength(1);
    expect(ff.textos()[0]).toBe('Sintonia: o TSE está limitando as leituras (HTTP 429 (pedidos demais)). Tudo pausado até 19:11; se for engano, painel → Fonte → Retomar agora.');
    estado.tse = saudeTse();
    vi.advanceTimersByTime(60_000);
    a.avaliar();
    expect(ff.textos()[1]).toMatch(/resolvido — TSE limitando as leituras/);
    estado.tse = saudeTse({ bloqueio: bloqueio(Date.now() + 60_000) });
    vi.advanceTimersByTime(60_000);
    a.avaliar();
    expect(ff.textos()).toHaveLength(2); // dentro dos 10 min do último aviso desse tipo
    vi.advanceTimersByTime(9 * 60_000);
    estado.tse = saudeTse({ bloqueio: bloqueio(Date.now() + 60_000) });
    a.avaliar();
    expect(ff.textos()).toHaveLength(3); // ainda ativo e a janela passou: avisa
  });

  it('TSE com erros seguidos e arquivo nacional parado (I18) só com a fonte TSE e a apuração em curso', () => {
    const { a, estado, ff } = montar();
    estado.tse = saudeTse({ prioFalhas: 4, parado: Date.UTC(2026, 9, 25, 22, 14, 0) });
    estado.fase = 'pre' as 'apurando';
    a.avaliar();
    expect(ff.textos()).toEqual([]);
    estado.fase = 'apurando';
    a.avaliar();
    expect(ff.textos()).toEqual([
      'Sintonia: 4 erros seguidos ao ler o TSE (HTTP 503). O site mantém o último dado bom.',
      'Sintonia: o arquivo nacional do TSE não muda desde 19:14 enquanto os estados andam. O site avisa (chave "aviso nacional").',
    ]);
  });

  it('servidor: 2 minutos seguidos com 5xx acima de 1% (ou p99 acima de 1 s); minuto com pouco tráfego não conta', () => {
    const { a, estado, ff } = montar();
    estado.minuto = minuto(30, 10, 2000); // pouco tráfego
    a.avaliar();
    estado.minuto = minuto(1000, 20, 200);
    a.avaliar();
    expect(ff.textos()).toEqual([]);
    a.avaliar(); // mesmo minuto: não conta de novo
    expect(ff.textos()).toEqual([]);
    estado.minuto = minuto(1000, 1, 1500);
    a.avaliar();
    expect(ff.textos()).toEqual(['Sintonia: 2 min seguidos com problemas: 5xx em 0,1% das requisições, p99 de 1.500 ms. Veja painel → Monitor.']);
    a.avaliar(); // segue ativo enquanto nenhum minuto novo fecha
    expect(a.ativos().map((x) => x.tipo)).toEqual(['servidor-erros']);
    estado.minuto = minuto(1000, 0, 100);
    vi.advanceTimersByTime(60_000);
    a.avaliar();
    expect(a.ativos()).toEqual([]);
    expect(ff.textos()[1]).toMatch(/resolvido — erros ou lentidão no servidor/);
  });

  it('extras: troca automática atrasada, laço de eventos lento (2 conferências) e memória alta; saude() só com os extras', () => {
    const { a, estado, ff } = montar();
    estado.troca = { estado: 'aguardando-tse', inicio: T0 - 6 * 60_000 };
    estado.loop = 450;
    estado.mem = { usadaMb: 1300, limiteMb: 1536 };
    a.avaliar();
    expect(a.ativos().map((x) => x.tipo)).toEqual(['troca-atrasada', 'memoria']);
    expect(a.saude()).toEqual({ noite: 'atencao', motivo: 'memória alta' });
    a.avaliar();
    expect(a.ativos().map((x) => x.tipo)).toEqual(['troca-atrasada', 'loop-lento', 'memoria']);
    expect(a.saude()).toEqual({ noite: 'atencao', motivo: 'servidor engasgado · memória alta' });
    expect(ff.textos()).toContain('Sintonia: memória em 85% do limite (1.300 de 1.536 MB).');
    expect(ff.textos().every((t) => t.length <= ALERTAS.maxCaracteres)).toBe(true);
    estado.mem = { usadaMb: 1300, limiteMb: null }; // fora de contêiner: sem limite, sem alerta
    estado.loop = 5;
    a.avaliar();
    expect(a.saude()).toBeNull();
  });

  it('sem Telegram (padrão): confere e registra no log, mas não envia nada', async () => {
    const { a, estado, ff, logs } = montar({ cfg: { telegram: null, batimentoUrl: null, avisos: [] } });
    a.iniciar();
    estado.mem = { usadaMb: 1500, limiteMb: 1536 };
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ff.f).not.toHaveBeenCalled();
    expect(a.ativos()).toHaveLength(1);
    expect(logs[0]).toMatch(/Telegram desligado/);
    expect(await a.teste()).toMatchObject({ ok: false, detalhe: expect.stringMatching(/TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID/) });
    a.parar();
  });

  it('ensaio do update.sh (envio: false): nada sai, nem reinício nem batimento', async () => {
    const { a, ff } = montar({ envio: false });
    a.iniciar();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ff.f).not.toHaveBeenCalled();
    expect((await a.teste()).ok).toBe(false);
    a.parar();
  });
});

describe('envio', () => {
  it('teste do painel: espera o Telegram; o token vai só na URL da API (nunca no log); 10 s entre testes', async () => {
    const { a, ff, logs } = montar();
    const r = await a.teste();
    expect(r).toEqual({ ok: true, detalhe: 'mensagem de teste entregue ao Telegram.' });
    expect(ff.chamadas[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(ff.chamadas[0].corpo).toMatchObject({ chat_id: '987654321', text: 'Sintonia: alerta de teste do painel às 19:00:00. Se chegou, os alertas da noite funcionam.' });
    expect((await a.teste()).detalhe).toMatch(/espere 10 s/);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });

  it('Telegram recusando (401): o teste diz o porquê e o log avisa uma vez, sem o token', async () => {
    const { a, logs } = montar({ status: 401 });
    expect(await a.teste()).toEqual({ ok: false, detalhe: 'o Telegram não aceitou a mensagem (HTTP 401).' });
    expect(logs.filter((l) => l.includes('não aceitou'))).toHaveLength(1);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });

  it('Telegram sem resposta: desiste em 3 s (a conferência não trava)', async () => {
    const lento = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))),
    );
    const a = new AlertasNoite({ config: CFG, fetch: lento, log: { info: () => undefined, aviso: () => undefined } });
    const p = a.teste();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(await p).toEqual({ ok: false, detalhe: 'o Telegram não aceitou a mensagem (sem resposta em 3 s).' });
  });

  it('enxurrada: no máximo 20 mensagens por 10 min', () => {
    const { a, estado, ff } = montar();
    // 8 tipos indo e voltando não passam do teto (o teto por tipo já segura; aqui a rede de segurança geral)
    for (let i = 0; i < 40; i++) {
      estado.mem = { usadaMb: i % 2 ? 100 : 1500, limiteMb: 1536 };
      vi.advanceTimersByTime(ALERTAS.repeticaoMs / 40);
      a.avaliar();
    }
    expect(ff.textos().length).toBeLessThanOrEqual(ALERTAS.maxMensagens);
  });

  it('mensagens cortadas em 200 caracteres', () => {
    expect(cortar('a'.repeat(300))).toHaveLength(200);
    expect(cortar('a'.repeat(300)).endsWith('…')).toBe(true);
    expect(cortar('  curta \n demais ')).toBe('curta demais');
  });
});
