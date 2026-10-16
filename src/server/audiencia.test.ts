import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIENCIA } from '../shared/audiencia';
import {
  Audiencia,
  ConjuntoU32,
  MAX_PAISES_DIA,
  MINUTOS_CURVA,
  PESSOAS_REDE_BALDE,
  PESSOAS_REDE_DIA,
  Presenca,
  aparelhoDe,
  ehRoboAudiencia,
  localDoPedido,
  paisDoCabecalho,
  ufDoCabecalho,
  type CabecalhoDe,
} from './audiencia';
import { createJsonStore } from './state-store';

/** 25/10/2026 19:00 de Brasília. */
const NOITE = Date.UTC(2026, 9, 25, 22, 0, 0);
const UA = (i: number) => `Mozilla/5.0 (Linux; Android 14; Aparelho ${i}) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36`;

function montar(o: { agora?: number; servidor?: number; dir?: string; medirLocal?: boolean } = {}) {
  const relogio = { t: o.agora ?? NOITE, servidor: o.servidor ?? 0 };
  const store = o.dir ? createJsonStore(o.dir, 'audiencia.json', { debounceMs: 0 }) : null;
  const a = new Audiencia({ now: () => relogio.t, pessoasServidor: () => relogio.servidor, store, medirLocal: o.medirLocal });
  return { a, relogio, store };
}

/** Cabeçalhos de um pedido (como `c.req.header`, sem diferença de maiúsculas). */
const cab =
  (h: Record<string, string>): CabecalhoDe =>
  (n) =>
    Object.entries(h).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1];
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

describe('ConjuntoU32', () => {
  it('conta chaves distintas, cresce e não confunde 0', () => {
    const c = new ConjuntoU32();
    for (let i = 0; i < 200_000; i++) c.adicionar((i * 2654435761) >>> 0);
    for (let i = 0; i < 1000; i++) c.adicionar((i * 2654435761) >>> 0);
    expect(c.tamanho).toBe(200_000);
    expect(c.tem(0)).toBe(true); // i = 0 → chave 0 vira 1
    expect(c.tem(12345)).toBe(false);
  });
});

describe('Presenca', () => {
  it('estima abas distintas na janela e esquece as antigas', () => {
    const r = { t: NOITE };
    const p = new Presenca(() => r.t);
    for (let i = 0; i < 5000; i++) p.marcar((Math.imul(i + 1, 2654435761) >>> 0) || 1, i);
    const n = p.estimar(120_000);
    expect(Math.abs(n - 5000) / 5000).toBeLessThan(0.03);
    r.t += 10 * 60_000;
    expect(p.estimar(120_000)).toBe(0);
  });

  it('no máximo 10 pessoas novas por rede por balde (trocar o navegador não infla)', () => {
    const p = new Presenca(() => NOITE);
    for (let i = 0; i < 1000; i++) p.marcar((Math.imul(i + 1, 2654435761) >>> 0) || 1, 7);
    expect(PESSOAS_REDE_BALDE).toBe(10);
    expect(p.estimar(60_000)).toBeLessThanOrEqual(11);
  });

  it('concentração: quantas redes e quanto as maiores somam', () => {
    const p = new Presenca(() => NOITE);
    for (let i = 0; i < 10; i++) p.marcar(1000 + i, 1); // uma rede com 10
    for (let i = 0; i < 10; i++) p.marcar(5000 + i, 100 + i); // 10 redes com 1
    const c = p.concentracao(60_000);
    expect(c.redes).toBe(11);
    expect(c.top[0]).toBe(0.5);
    expect(c.top).toHaveLength(10);
  });
});

describe('Audiencia: páginas, grupos, origens e únicos', () => {
  it('conta páginas por grupo, entradas por origem e únicos por rede + navegador', () => {
    const { a } = montar();
    expect(a.sinal('rede-1', UA(1), { g: 'inicio', o: 't.co' })).toEqual({ s: 60 });
    a.sinal('rede-1', UA(1), { g: 'apuracao' });
    a.sinal('rede-1', UA(2), { g: 'apuracao', o: 'direto' }); // outra pessoa na mesma rede (outro aparelho)
    a.sinal('rede-2', UA(1), { g: 'teste', o: 'whatsapp' });
    a.sinal('rede-2', UA(1), { p: 1, g: 'teste' }); // presença não conta página
    const d = a.paraAdmin().dias.at(-1)!;
    expect(d.dia).toBe('2026-10-25');
    expect(d.paginas).toBe(4);
    expect(d.porGrupo).toEqual({ inicio: 1, apuracao: 2, teste: 1 });
    expect(d.entradas).toBe(3);
    expect(d.origens).toEqual({ x: 1, direto: 1, whatsapp: 1 });
    expect(d.unicos).toBe(3);
  });

  it('robô, corpo inválido e origem malformada não contam', () => {
    const { a } = montar();
    expect(a.sinal('r', 'curl/8.0', { g: 'inicio' })).toEqual({ s: 60 });
    expect(a.sinal('r', 'Mozilla/5.0 HeadlessChrome/130', { g: 'inicio' })).toEqual({ s: 60 });
    expect(a.sinal('r', undefined, { g: 'inicio' })).toEqual({ s: 60 });
    expect(a.sinal('r', UA(1), { g: 'nao-existe' })).toBeNull();
    expect(a.sinal('r', UA(1), null)).toBeNull();
    expect(a.sinal('r', UA(1), [])).toBeNull();
    a.sinal('r', UA(1), { g: 'inicio', o: 'https://exemplo.com/caminho?x=1' });
    const d = a.paraAdmin().dias.at(-1)!;
    expect(d.paginas).toBe(1);
    expect(d.entradas).toBe(0);
    expect(d.origens).toEqual({});
  });

  it('widgets e /live contam no grupo, mas não como pessoa nem página; a presença deles não entra em únicos nem no pico', () => {
    const { a } = montar();
    a.sinal('r', UA(1), { g: 'widgets' });
    a.sinal('r', UA(1), { g: 'live' });
    // presença vinda da /live (OBS) ou de um widget num portal: ignorada
    for (let i = 0; i < 50; i++) a.sinal(`portal-${i}`, UA(i), { p: 1, g: 'widgets' });
    for (let i = 0; i < 50; i++) a.sinal(`obs-${i}`, UA(i), { p: 1, g: 'live' });
    // presença sem o grupo (formato antigo): inválida
    expect(a.sinal('r', UA(1), { p: 1 })).toBeNull();
    a.amostrar();
    const adm = a.paraAdmin();
    const d = adm.dias.at(-1)!;
    expect(d.porGrupo).toEqual({ widgets: 1, live: 1 });
    expect(d.paginas).toBe(0);
    expect(d.unicos).toBe(0);
    expect(adm.pico).toBeNull();
    expect(adm.agora.sinal).toBe(0);
  });

  it('limites: 20 páginas por pessoa por minuto; trocar o User-Agent não multiplica um visitante além do teto da rede', () => {
    const { a, relogio } = montar();
    for (let i = 0; i < 50; i++) a.sinal('rede', UA(1), { g: 'apuracao' });
    expect(a.paraAdmin().dias.at(-1)!.paginas).toBe(20);
    relogio.t += 61_000;
    for (let i = 0; i < 400; i++) a.sinal('rede', UA(1000 + i), { p: 1, g: 'apuracao' });
    expect(a.paraAdmin().dias.at(-1)!.unicos).toBe(PESSOAS_REDE_DIA);
  });

  it('virada do dia (Brasília): conjunto novo, o dia anterior fica com a contagem', () => {
    const { a, relogio } = montar({ agora: Date.UTC(2026, 9, 26, 2, 50) }); // 25/10 23:50
    a.sinal('r1', UA(1), { g: 'inicio' });
    a.sinal('r2', UA(1), { g: 'inicio' });
    relogio.t = Date.UTC(2026, 9, 26, 3, 5); // 26/10 00:05
    a.sinal('r1', UA(1), { g: 'apuracao' });
    const dias = a.paraAdmin().dias;
    expect(dias.map((d) => [d.dia, d.unicos, d.paginas])).toEqual([
      ['2026-10-25', 2, 2],
      ['2026-10-26', 1, 1],
    ]);
  });

  it('origens distintas por dia têm teto (o resto vai para "outros")', () => {
    const { a } = montar();
    for (let i = 0; i < 320; i++) a.sinal(`r${i}`, UA(i), { g: 'inicio', o: `site${i}.com.br` });
    const d = a.paraAdmin().dias.at(-1)!;
    expect(Object.keys(d.origens).length).toBeLessThanOrEqual(301);
    expect(d.origens.outros).toBe(20);
    expect(d.entradas).toBe(320);
  });
});

describe('Audiencia: pico de pessoas ao mesmo tempo', () => {
  it('só o sinal das páginas, com data e hora; a estimativa do servidor fica de referência (achado da revisão)', () => {
    // um único host IPv6 com 20 mil endereços de uma /64, sem JS: o "pessoas agora" do servidor vai a 20 mil — o pico NÃO
    const { a, relogio } = montar({ servidor: 20_000 });
    a.amostrar();
    expect(a.paraAdmin().pico).toBeNull();
    expect(a.publico()).toBeNull();
    expect(a.paraAdmin().agora).toMatchObject({ pessoas: 0, sinal: 0, servidor: 20_000 });
    relogio.servidor = 40;
    for (let i = 0; i < 300; i++) a.sinal(`rede-${i}`, UA(i), { p: 1, g: 'apuracao' });
    relogio.t += 10_000;
    a.amostrar();
    const adm = a.paraAdmin();
    expect(adm.pico?.fonte).toBe('sinal');
    expect(adm.pico?.valor).toBe(300);
    expect(adm.pico?.em).toBe(NOITE + 10_000);
    expect(adm.pico?.concentracao?.redes).toBe(300);
    expect(adm.agora).toMatchObject({ pessoas: 300, sinal: 300, servidor: 40, intervaloS: 60 });
    // a presença expira: o pico continua guardado
    relogio.t += 30 * 60_000;
    relogio.servidor = 0;
    a.amostrar();
    expect(a.paraAdmin().pico?.valor).toBe(300);
    expect(a.paraAdmin().agora.pessoas).toBe(0);
    // por dia e por hora
    expect(a.paraAdmin().dias.at(-1)!.pico?.valor).toBe(300);
    expect(Math.max(...a.paraAdmin().horas.map((h) => h.pico))).toBe(300);
  });

  it('intervalo do sinal de presença sobe com a carga (servidor diz ao app)', () => {
    const { a, relogio } = montar({ servidor: 60_000 });
    a.amostrar();
    expect(a.sinal('r', UA(1), { p: 1, g: 'inicio' })).toEqual({ s: 180 });
    relogio.servidor = 200_000;
    a.amostrar();
    expect(a.intervaloS).toBe(240);
  });

  it('sem medição, nada público; depois, só números medidos', () => {
    const { a } = montar();
    expect(a.publico()).toBeNull();
    a.sinal('r', UA(1), { g: 'inicio' });
    a.amostrar();
    const p = a.publico()!;
    expect(p.desde).toBe(NOITE);
    expect(p.paginas).toBe(1);
    expect(p.maiorDia).toEqual({ dia: '2026-10-25', unicos: 1 });
    expect(p.pico?.valor).toBe(1);
  });

  it('336 horas (14 dias) no detalhe, da mais antiga para a mais recente', () => {
    const { a, relogio } = montar();
    a.sinal('r', UA(1), { g: 'inicio' });
    relogio.t += 3 * 3600_000;
    a.sinal('r', UA(1), { g: 'inicio' });
    const h = a.paraAdmin().horas;
    const n = AUDIENCIA.horas;
    expect(n).toBe(336);
    expect(h).toHaveLength(n);
    expect(h[n - 1].paginas).toBe(1);
    expect(h[n - 4].paginas).toBe(1);
    expect(h[0].hora).toBeLessThan(h[n - 1].hora);
    expect(h[n - 1].hora - h[0].hora).toBe((n - 1) * 3600_000);
  });
});

describe('Audiencia: persistência', () => {
  it('grava de forma atômica só contagens (nada de chave, sal, rede ou navegador) e restaura', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-aud-'));
    const m1 = montar({ dir, servidor: 3 });
    m1.a.sinal('rede-secreta-1', UA(1), { g: 'apuracao', o: 'twitch' });
    m1.a.sinal('rede-secreta-2', UA(2), { g: 'apuracao' });
    m1.a.amostrar();
    await m1.a.persistir();
    const texto = readFileSync(join(dir, 'audiencia.json'), 'utf8');
    expect(texto).not.toContain('rede-secreta');
    expect(texto).not.toContain('Android');
    const j = JSON.parse(texto);
    expect(Object.keys(j).sort()).toEqual(['curva', 'desde', 'dias', 'horas', 'local', 'pico', 'telaHoras', 'v']);
    expect(j.dias[0]).toMatchObject({ dia: '2026-10-25', unicos: 2, paginas: 2, origens: { twitch: 1 } });

    // reinício no mesmo dia: os únicos de antes ficam como piso (o conjunto se perdeu) e o reinício é anotado
    const m2 = montar({ dir });
    const d = m2.a.paraAdmin().dias.at(-1)!;
    expect(d.unicos).toBe(2);
    expect(d.reinicios).toBe(1);
    m2.a.sinal('rede-secreta-1', UA(1), { g: 'inicio' }); // mesma pessoa: o conjunto novo não sabe; conta pelo maior trecho
    expect(m2.a.paraAdmin().dias.at(-1)!.unicos).toBe(2);
    expect(m2.a.paraAdmin().dias.at(-1)!.paginas).toBe(3);
    expect(m2.a.paraAdmin().pico?.valor).toBe(2); // 2 abas pelo sinal (o "servidor: 3" não entra no pico)
  });

  it('arquivo corrompido ou de outra versão é ignorado', () => {
    const { a } = montar();
    expect(a.carregar({ v: 2 })).toBe(false);
    expect(a.carregar('lixo')).toBe(false);
    expect(a.carregar({ v: 1, dias: [{ dia: 'ontem', unicos: -1 }, { dia: '2026-10-20', unicos: 5, porGrupo: { inicio: 2, hack: 9 }, origens: { 'x': 1, '<b>': 3 } }], horas: [{ hora: 5 }], pico: { valor: 'x' } })).toBe(true);
    const adm = a.paraAdmin();
    expect(adm.dias[0]).toMatchObject({ dia: '2026-10-20', unicos: 5, porGrupo: { inicio: 2 }, origens: { x: 1 } });
    expect(adm.pico).toBeNull();
    // pico gravado pela versão anterior a partir do "pessoas agora" do servidor: descartado
    const b = montar().a;
    b.carregar({ v: 1, desde: NOITE, pico: { valor: 20_000, em: NOITE, fonte: 'servidor' }, dias: [{ dia: '2026-10-24', unicos: 3, pico: { valor: 20_000, em: NOITE, fonte: 'servidor' } }], horas: [] });
    expect(b.paraAdmin().pico).toBeNull();
    expect(b.paraAdmin().dias[0].pico).toBeNull();
  });

  it('zerar apaga tudo', () => {
    const { a } = montar({ servidor: 9 });
    a.sinal('r', UA(1), { g: 'inicio' });
    a.amostrar();
    a.zerar();
    expect(a.publico()).toBeNull();
    expect(a.paraAdmin().pico).toBeNull();
    expect(a.paraAdmin().dias).toEqual([]);
  });
});

describe('ehRoboAudiencia', () => {
  it('reconhece robôs e automação, mas não os navegadores embutidos dos apps', () => {
    expect(ehRoboAudiencia('Googlebot/2.1')).toBe(true);
    expect(ehRoboAudiencia('Mozilla/5.0 (X11) HeadlessChrome/130.0')).toBe(true);
    expect(ehRoboAudiencia('python-requests/2.31')).toBe(true);
    expect(ehRoboAudiencia('')).toBe(true);
    expect(ehRoboAudiencia('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Twitter for iPhone/10.60')).toBe(false);
    expect(ehRoboAudiencia('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36 Instagram 350.0')).toBe(false);
    expect(ehRoboAudiencia('Mozilla/5.0 (Linux; Android 14; wv) Chrome/130 Mobile Safari/537.36 Telegram-Android/11.2')).toBe(false);
  });
});

describe('I14: UF, país e aparelho pelos cabeçalhos', () => {
  it('país pelo cf-ipcountry; desconhecido, Tor ou lixo viram "ND"', () => {
    expect(paisDoCabecalho('BR')).toBe('BR');
    expect(paisDoCabecalho(' pt ')).toBe('PT');
    expect(paisDoCabecalho('XX')).toBe('ND');
    expect(paisDoCabecalho('T1')).toBe('ND');
    expect(paisDoCabecalho(undefined)).toBe('ND');
    expect(paisDoCabecalho('<script>')).toBe('ND');
    expect(paisDoCabecalho('BRA')).toBe('ND');
  });

  it('UF só no Brasil (com "BR-" ou minúsculas); fora do Brasil não entra na tabela por UF', () => {
    expect(ufDoCabecalho('SP', 'BR')).toBe('SP');
    expect(ufDoCabecalho('br-rj', 'BR')).toBe('RJ');
    expect(ufDoCabecalho('ZZ', 'BR')).toBe('ND');
    expect(ufDoCabecalho(undefined, 'BR')).toBe('ND');
    expect(ufDoCabecalho('SP', 'ND')).toBe('ND'); // país desconhecido: pode ser o Brasil, mas sem UF confiável
    expect(ufDoCabecalho('11', 'PT')).toBeNull();
  });

  it('aparelho: Sec-CH-UA-Mobile primeiro; senão o User-Agent; senão "nd"', () => {
    expect(aparelhoDe('?1', MAC)).toBe('celular');
    expect(aparelhoDe('?0', UA(1))).toBe('computador');
    expect(aparelhoDe(undefined, IPHONE)).toBe('celular');
    expect(aparelhoDe(undefined, UA(1))).toBe('celular'); // Android "Mobile"
    expect(aparelhoDe(undefined, MAC)).toBe('computador');
    expect(aparelhoDe(undefined, 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130 Safari/537.36')).toBe('computador'); // tablet
    expect(aparelhoDe(undefined, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('computador');
    expect(aparelhoDe(undefined, 'AlgumNavegadorEstranho/1.0')).toBe('nd');
    expect(localDoPedido(undefined, IPHONE)).toEqual({ pais: 'ND', uf: 'ND', aparelho: 'celular' });
  });

  it('conta páginas por UF, país e aparelho (com e sem os cabeçalhos); presença e widgets não entram', () => {
    const { a } = montar();
    a.sinal('r1', UA(1), { g: 'inicio' }, cab({ 'CF-IPCountry': 'BR', 'CF-Region-Code': 'SP', 'Sec-CH-UA-Mobile': '?1' }));
    a.sinal('r2', MAC, { g: 'apuracao' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'RJ', 'sec-ch-ua-mobile': '?0' }));
    a.sinal('r3', IPHONE, { g: 'apuracao' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'SP' }));
    a.sinal('r4', IPHONE, { g: 'apuracao' }, cab({ 'cf-ipcountry': 'PT', 'cf-region-code': '11' }));
    a.sinal('r5', IPHONE, { g: 'apuracao' }, cab({ 'cf-ipcountry': 'BR' })); // sem a transformação de localização
    a.sinal('r6', MAC, { g: 'apuracao' }); // sem Cloudflare
    a.sinal('r1', UA(1), { p: 1, g: 'inicio' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'SP' })); // presença
    a.sinal('r7', UA(7), { g: 'widgets' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'MG' })); // widget
    const adm = a.paraAdmin();
    expect(adm.dias.at(-1)!.paginas).toBe(6);
    expect(adm.porUf).toEqual([{ dia: '2026-10-25', n: { SP: 2, RJ: 1, ND: 2 } }]);
    expect(adm.porPais).toEqual([{ dia: '2026-10-25', n: { BR: 4, PT: 1, ND: 1 } }]);
    expect(adm.porAparelho).toEqual([{ dia: '2026-10-25', n: { celular: 4, computador: 2 } }]);
    // as somas batem com as páginas vistas
    const soma = (n: Record<string, number>) => Object.values(n).reduce((s, x) => s + x, 0);
    expect(soma(adm.porAparelho![0].n)).toBe(6);
    expect(soma(adm.porPais![0].n)).toBe(6);
    expect(soma(adm.porUf![0].n) + (adm.porPais![0].n.PT ?? 0)).toBe(6);
  });

  it('o limite de páginas por pessoa vale também aqui (20/min), e a chave desligada não conta nada', () => {
    const { a } = montar();
    for (let i = 0; i < 50; i++) a.sinal('rede', UA(1), { g: 'apuracao' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'SP' }));
    expect(a.paraAdmin().porUf![0].n).toEqual({ SP: 20 });
    const off = montar({ medirLocal: false }).a;
    off.sinal('r', UA(1), { g: 'inicio' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'SP' }));
    const adm = off.paraAdmin();
    expect(adm.dias.at(-1)!.paginas).toBe(1);
    expect(adm.porUf).toEqual([]);
    expect(adm.porPais).toEqual([]);
    expect(adm.porAparelho).toEqual([]);
  });

  it('países distintos por dia têm teto (cabeçalho forjado direto na origem não enche o arquivo)', () => {
    const { a } = montar();
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let i = 0;
    for (const x of letras) for (const y of letras) {
      if (i >= 400) break;
      a.sinal(`r${i}`, UA(i), { g: 'inicio' }, cab({ 'cf-ipcountry': x + y }));
      i++;
    }
    const n = a.paraAdmin().porPais![0].n;
    expect(Object.keys(n).length).toBeLessThanOrEqual(MAX_PAISES_DIA + 2);
    expect(n.ZZ).toBeGreaterThan(0);
    expect(Object.values(n).reduce((s, v) => s + v, 0)).toBe(400);
  });

  it('um leitor de cabeçalho que falha não derruba a contagem de páginas', () => {
    const { a } = montar();
    const quebrado: CabecalhoDe = () => {
      throw new Error('x');
    };
    expect(a.sinal('r', UA(1), { g: 'inicio' }, quebrado)).toEqual({ s: 60 });
    expect(a.paraAdmin().dias.at(-1)!.paginas).toBe(1);
  });
});

describe('I14: curva minuto a minuto e horas de tela', () => {
  /** n pessoas com presença agora (redes distintas). */
  const presentes = (a: Audiencia, n: number, base = 0) => {
    for (let i = 0; i < n; i++) a.sinal(`rede-${base + i}`, UA(base + i), { p: 1, g: 'apuracao' });
  };

  it('o maior número de pessoas em cada minuto, só depois que a medição começa (zero também é medida)', () => {
    const { a, relogio } = montar();
    a.amostrar(); // nada medido ainda: não abre a curva
    expect(a.paraAdmin().curvaMinuto).toEqual([]);
    presentes(a, 30);
    a.amostrar();
    relogio.t += 10_000;
    presentes(a, 20, 100);
    a.amostrar(); // 50 no mesmo minuto
    relogio.t += 10 * 60_000; // a presença expirou
    a.amostrar();
    const c = a.paraAdmin().curvaMinuto!;
    expect(c).toEqual([
      { minuto: NOITE, pessoas: 50 },
      { minuto: NOITE + 10 * 60_000 + 0, pessoas: 0 },
    ]);
  });

  it('guarda só as últimas 24 h (1.440 minutos)', () => {
    const { a, relogio } = montar();
    presentes(a, 5);
    for (let m = 0; m < MINUTOS_CURVA + 120; m++) {
      a.amostrar();
      relogio.t += 60_000;
    }
    const c = a.paraAdmin().curvaMinuto!;
    expect(c.length).toBeLessThanOrEqual(MINUTOS_CURVA);
    expect(c.at(-1)!.minuto - c[0].minuto).toBeLessThanOrEqual((MINUTOS_CURVA - 1) * 60_000);
    expect(c[0].minuto).toBeGreaterThan(NOITE);
  });

  it('horas de tela = pessoas × tempo de cada amostra (10 s), por hora e por dia; timer parado não infla', () => {
    const { a, relogio } = montar();
    presentes(a, 360);
    // 1 minuto de amostras com 360 pessoas: 6 × 360 × 10 s = 21.600 s = 6 h
    for (let i = 0; i < 6; i++) {
      a.amostrar();
      relogio.t += 10_000;
    }
    let adm = a.paraAdmin();
    expect(adm.horasTela!.porDia).toEqual([{ dia: '2026-10-25', horas: 6 }]);
    expect(adm.horasTela!.porHora).toHaveLength(AUDIENCIA.horas);
    expect(adm.horasTela!.porHora.at(-1)).toEqual({ hora: NOITE, horas: 6 });
    // a amostra seguinte soma mais 10 s × 360 = 1 h; outra no mesmo instante não soma nada
    a.amostrar();
    a.amostrar();
    expect(a.paraAdmin().horasTela!.porDia[0].horas).toBe(7);
    // timer parado 5 min: soma no máximo 20 s (360 × 20 s = 2 h), nunca os 5 min
    relogio.t += 5 * 60_000;
    presentes(a, 360, 1000);
    a.amostrar();
    adm = a.paraAdmin();
    expect(adm.horasTela!.porDia[0].horas).toBe(9);
  });
});

describe('I14: persistência e privacidade', () => {
  it('grava só siglas e números (nada de IP, rede, navegador ou cidade) e restaura depois de reiniciar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-aud14-'));
    const m1 = montar({ dir });
    const h = cab({
      'cf-ipcountry': 'BR',
      'cf-region-code': 'PE',
      'cf-ipcity': 'Recife',
      'cf-postal-code': '50000-000',
      'cf-iplatitude': '-8.05',
      'cf-connecting-ip': '203.0.113.77',
      'x-real-ip': '203.0.113.77',
      'sec-ch-ua-mobile': '?1',
    });
    m1.a.sinal('rede-203.0.113.77', UA(1), { g: 'apuracao', o: 'whatsapp' }, h);
    m1.a.sinal('rede-203.0.113.77', UA(1), { p: 1, g: 'apuracao' }, h);
    m1.a.amostrar();
    m1.relogio.t += 10_000;
    m1.a.amostrar();
    await m1.a.persistir();
    const texto = readFileSync(join(dir, 'audiencia.json'), 'utf8');
    for (const proibido of ['203.0.113', 'rede-', 'Recife', '50000', '-8.05', 'Android', 'Mozilla']) expect(texto).not.toContain(proibido);
    const j = JSON.parse(texto);
    expect(j.local).toEqual([{ dia: '2026-10-25', uf: { PE: 1 }, pais: { BR: 1 }, aparelho: { celular: 1 }, telaS: 20 }]);
    expect(j.curva).toEqual([[NOITE, 1]]);
    expect(j.telaHoras).toEqual([[NOITE, 20]]);

    const m2 = montar({ dir, agora: NOITE + 60_000 });
    const adm = m2.a.paraAdmin();
    expect(adm.porUf).toEqual([{ dia: '2026-10-25', n: { PE: 1 } }]);
    expect(adm.curvaMinuto).toEqual([{ minuto: NOITE, pessoas: 1 }]);
    expect(adm.horasTela!.porDia).toEqual([{ dia: '2026-10-25', horas: 0.01 }]);
  });

  it('arquivo da versão anterior (sem os campos novos) carrega; lixo nos campos novos é ignorado', () => {
    const { a } = montar();
    expect(a.carregar({ v: 1, desde: NOITE, pico: null, dias: [{ dia: '2026-10-24', unicos: 3, paginas: 9 }], horas: [] })).toBe(true);
    let adm = a.paraAdmin();
    expect(adm.dias[0]).toMatchObject({ dia: '2026-10-24', paginas: 9 });
    expect(adm.porUf).toEqual([]);
    expect(adm.curvaMinuto).toEqual([]);
    expect(
      a.carregar({
        v: 1,
        desde: NOITE,
        dias: [],
        horas: [],
        curva: [[NOITE, 10], [NOITE + 1, 5], ['x', 1], [NOITE + 60_000, -3], 'lixo'],
        telaHoras: [[NOITE, 3600], [NOITE + 5, 1]],
        local: [
          { dia: '2026-10-25', uf: { SP: 2, XX: 9, '<b>': 1 }, pais: { BR: 2, XX: 4, br: 1 }, aparelho: { celular: 2, relogio: 1 }, telaS: 'x' },
          { dia: 'ontem', uf: { SP: 1 } },
          null,
        ],
      }),
    ).toBe(true);
    adm = a.paraAdmin();
    expect(adm.curvaMinuto).toEqual([{ minuto: NOITE, pessoas: 10 }]);
    expect(adm.porUf).toEqual([{ dia: '2026-10-25', n: { SP: 2 } }]);
    expect(adm.porPais).toEqual([{ dia: '2026-10-25', n: { BR: 2 } }]);
    expect(adm.porAparelho).toEqual([{ dia: '2026-10-25', n: { celular: 2 } }]);
    expect(adm.horasTela!.porHora.at(-1)).toEqual({ hora: NOITE, horas: 1 });
    expect(adm.horasTela!.porDia).toEqual([]);
  });

  it('zerar apaga também a curva, as siglas e as horas de tela', () => {
    const { a } = montar();
    a.sinal('r', UA(1), { g: 'inicio' }, cab({ 'cf-ipcountry': 'BR', 'cf-region-code': 'SP' }));
    a.amostrar();
    a.zerar();
    const adm = a.paraAdmin();
    expect(adm.curvaMinuto).toEqual([]);
    expect(adm.porUf).toEqual([]);
    expect(adm.horasTela!.porDia).toEqual([]);
    expect(adm.horasTela!.porHora.every((h) => h.horas === 0)).toBe(true);
  });
});
