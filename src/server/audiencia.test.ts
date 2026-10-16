import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIENCIA } from '../shared/audiencia';
import { Audiencia, ConjuntoU32, PESSOAS_REDE_BALDE, PESSOAS_REDE_DIA, Presenca, ehRoboAudiencia } from './audiencia';
import { createJsonStore } from './state-store';

/** 25/10/2026 19:00 de Brasília. */
const NOITE = Date.UTC(2026, 9, 25, 22, 0, 0);
const UA = (i: number) => `Mozilla/5.0 (Linux; Android 14; Aparelho ${i}) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36`;

function montar(o: { agora?: number; servidor?: number; dir?: string } = {}) {
  const relogio = { t: o.agora ?? NOITE, servidor: o.servidor ?? 0 };
  const store = o.dir ? createJsonStore(o.dir, 'audiencia.json', { debounceMs: 0 }) : null;
  const a = new Audiencia({ now: () => relogio.t, pessoasServidor: () => relogio.servidor, store });
  return { a, relogio, store };
}

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
    expect(Object.keys(j).sort()).toEqual(['desde', 'dias', 'horas', 'pico', 'v']);
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
