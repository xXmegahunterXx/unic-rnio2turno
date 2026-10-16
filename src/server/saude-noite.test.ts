/**
 * Saúde da noite (I16, servidor HTTP): avaliação pura (`avaliarSaude`, `VigiaNoite`, `unirSaude`), a rota
 * GET /api/saude-noite (sempre 200, no-store, sem log por pedido) e os comandos do painel que o servidor executa
 * ('tse-retomar' e 'alerta-teste', ligados às peças da frente B quando existem).
 */
import { describe, expect, it, vi } from 'vitest';
import type { TseHealth } from '../tse';
import type { LiveStatus } from '../shared/types';
import { INICIO_APURACAO } from '../shared/constants';
import { SAUDE_NOITE, VigiaNoite, avaliarSaude, unirSaude, type EntradaSaude } from './saude-noite';
import { comando, login, montar } from './test-helpers';

const T = INICIO_APURACAO + 60 * 60_000; // 18h de 25/10 (Brasília)

type Corrida = TseHealth['corridas'][number];
// (cast: a frente B acrescenta campos à saúde do TSE; aqui só importam os que a avaliação lê)
const corrida = (o: Partial<Corrida> = {}): Corrida =>
  ({
    race: 'pres',
    mapeadaComo: null,
    eleicao: '545',
    status: 'apurando',
    secoes: 1000,
    secoesTotalizadas: 400,
    ultimaAtualizacao: T - 10_000,
    ultimoPoll: T - 2_000,
    ultimoPollOk: T - 2_000,
    ultimoPollMs: 80,
    falhasConsecutivas: 0,
    erro: null,
    ausentes: [],
    ...o,
  }) as Corrida;

const base = (o: Partial<EntradaSaude> = {}): EntradaSaude => ({
  agora: T,
  encerrando: false,
  naoPronto: [],
  fonte: 'tse',
  fase: 'apurando',
  tse: { rodando: true, corridas: [corrida()], prioritario: null },
  frescor: { pres: { marca: 'm1', conferidoEm: T - 3_000 } },
  presParadoDesde: T - 20_000,
  trocaAuto: { estado: 'feita', inicio: INICIO_APURACAO },
  minutosRuins: 0,
  ...o,
});

describe('avaliarSaude (pura)', () => {
  it('noite normal → ok, sem motivo', () => {
    expect(avaliarSaude(base())).toEqual({ noite: 'ok' });
    // antes das 17h (fonte pre): nada do TSE é cobrado
    expect(
      avaliarSaude(
        base({
          fonte: 'pre',
          fase: 'pre',
          tse: null,
          frescor: null,
          presParadoDesde: null,
          trocaAuto: { estado: 'agendada', inicio: INICIO_APURACAO },
        }),
      ),
    ).toEqual({ noite: 'ok' });
  });

  it('cada sinal vira "atencao" com um motivo legível', () => {
    const casos: [Partial<EntradaSaude>, RegExp][] = [
      [{ encerrando: true }, /encerrando/],
      [{ naoPronto: ['modelo não construído'] }, /não pronto: modelo não construído/],
      [{ tse: { rodando: false, corridas: [corrida()], prioritario: null } }, /leitura do TSE parada/],
      [{ tse: null }, /leitura do TSE parada/],
      [
        {
          tse: {
            rodando: true,
            corridas: [corrida({ falhasConsecutivas: 4 })],
            prioritario: null,
          },
        },
        /4 erros seguidos/,
      ],
      [{ frescor: { pres: { marca: 'm1', conferidoEm: T - 4 * 60_000 } } }, /nenhuma leitura boa do TSE há 4 min/],
      [{ presParadoDesde: T - SAUDE_NOITE.paradoMs - 60_000 }, /placar nacional sem dado novo há 4 min/],
      [
        {
          frescor: {
            pres: {
              marca: 'm1',
              conferidoEm: T,
              tseBloqueadoAte: T + 11 * 60_000,
            },
          },
        },
        /TSE limitando as leituras; nova tentativa às 18:11/,
      ],
      [
        {
          frescor: {
            pres: {
              marca: 'm1',
              conferidoEm: T,
              nacionalParadoDesde: T - 5 * 60_000,
            },
          },
        },
        /arquivo nacional do TSE sem atualizar desde 17:55/,
      ],
      [
        {
          fonte: 'pre',
          trocaAuto: { estado: 'aguardando-tse', inicio: T - 6 * 60_000 },
        },
        /troca automática para o TSE aguardando o feed há 6 min/,
      ],
      [{ minutosRuins: 2 }, /2 min seguidos com erros 5xx/],
    ];
    for (const [o, re] of casos) {
      const r = avaliarSaude(base(o));
      expect(r.noite, re.source).toBe('atencao');
      expect(r.motivo, re.source).toMatch(re);
    }
  });

  it('não acusa placar parado quando a disputa não começou, terminou ou a fase pública já é encerrada', () => {
    const parado = { presParadoDesde: T - 10 * 60_000 };
    expect(
      avaliarSaude(
        base({
          ...parado,
          tse: {
            rodando: true,
            corridas: [corrida({ secoesTotalizadas: 0 })],
            prioritario: null,
          },
        }),
      ).noite,
    ).toBe('ok');
    expect(
      avaliarSaude(
        base({
          ...parado,
          tse: {
            rodando: true,
            corridas: [corrida({ status: 'encerrada' })],
            prioritario: null,
          },
        }),
      ).noite,
    ).toBe('ok');
    expect(avaliarSaude(base({ ...parado, fase: 'encerrada' })).noite).toBe('ok');
    // bloqueio já vencido não conta
    expect(
      avaliarSaude(
        base({
          frescor: {
            pres: { marca: 'm1', conferidoEm: T, tseBloqueadoAte: T - 1 },
          },
        }),
      ).noite,
    ).toBe('ok');
  });

  it('vários motivos juntos, separados por " · "', () => {
    const r = avaliarSaude(base({ encerrando: true, minutosRuins: 3 }));
    expect(r.motivo).toBe('servidor encerrando (reinício em andamento) · 3 min seguidos com erros 5xx acima de 1% ou p99 acima de 1 s');
  });
});

describe('VigiaNoite e unirSaude', () => {
  it('marca: "parado desde" só muda quando a marca muda; sem fonte TSE, zera', () => {
    const v = new VigiaNoite();
    expect(v.paradoDesde).toBeNull();
    v.observarMarca('a', 1000);
    v.observarMarca('a', 5000);
    expect(v.paradoDesde).toBe(1000);
    v.observarMarca('b', 9000);
    expect(v.paradoDesde).toBe(9000);
    v.observarMarca(undefined, 10_000);
    expect(v.paradoDesde).toBeNull();
  });

  it('minutos ruins: 5xx > 1% ou p99 > 1 s, com tráfego mínimo; um minuto bom zera', () => {
    const v = new VigiaNoite();
    v.minuto({ requisicoes: 1000, erros5xx: 20, p99: 50 });
    v.minuto({ requisicoes: 1000, erros5xx: 0, p99: 1500 });
    expect(v.minutosRuins).toBe(2);
    v.minuto({ requisicoes: 10, erros5xx: 10, p99: 5000 }); // pouco tráfego: não conta como ruim
    expect(v.minutosRuins).toBe(0);
    v.minuto({ requisicoes: 1000, erros5xx: 10, p99: 999 }); // exatamente 1%: ok
    expect(v.minutosRuins).toBe(0);
  });

  it('unirSaude: atenção de qualquer lado vence; motivos repetidos aparecem uma vez', () => {
    expect(unirSaude({ noite: 'ok' }, null)).toEqual({ noite: 'ok' });
    expect(unirSaude({ noite: 'ok' }, { noite: 'ok' })).toEqual({
      noite: 'ok',
    });
    expect(unirSaude({ noite: 'ok' }, { noite: 'atencao', motivo: 'x' })).toEqual({ noite: 'atencao', motivo: 'x' });
    expect(unirSaude({ noite: 'atencao', motivo: 'a · b' }, { noite: 'atencao', motivo: 'b · c' })).toEqual({ noite: 'atencao', motivo: 'a · b · c' });
  });
});

describe('GET /api/saude-noite', () => {
  it('ok antes da noite; no-store, sempre 200, fora da indexação e sem linha de log por pedido', async () => {
    const linhas: string[] = [];
    const m = await montar({ escreverLog: (l) => linhas.push(l) });
    const r = await m.app.request('/api/saude-noite');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('cloudflare-cdn-cache-control')).toBeNull();
    expect(await r.json()).toEqual({ noite: 'ok' });
    expect(linhas.some((l) => l.includes('/api/saude-noite'))).toBe(false);
  });

  it('noite na fonte TSE: placar parado → atencao (registrada no log uma vez), e volta a ok quando a marca anda', async () => {
    const m = await montar({ agora: T });
    const orig = m.dados.status.bind(m.dados);
    m.dados.status = (): LiveStatus => ({
      ...orig(),
      fonte: 'tse',
      fase: 'apurando',
    });
    let marca = 'm1';
    m.dados.frescor = () => ({ pres: { marca, conferidoEm: m.relogio.t } });
    m.tse.health = () =>
      ({
        rodando: true,
        corridas: [corrida()],
        prioritario: null,
      }) as unknown as TseHealth;
    const saude = async () =>
      (await (await m.app.request('/api/saude-noite')).json()) as {
        noite: string;
        motivo?: string;
      };
    expect(await saude()).toEqual({ noite: 'ok' });
    m.relogio.t += 4 * 60_000;
    const r = await saude();
    expect(r.noite).toBe('atencao');
    expect(r.motivo).toMatch(/placar nacional sem dado novo há 4 min/);
    await saude();
    expect(m.log.recentes(50).filter((l) => /Saúde da noite: ATENÇÃO/.test(l.msg))).toHaveLength(1);
    marca = 'm2';
    expect(await saude()).toEqual({ noite: 'ok' });
    expect(m.log.recentes(50).some((l) => /Saúde da noite: ok de novo/.test(l.msg))).toBe(true);
  });

  it('alertas da frente B (ligarAlertas): a avaliação deles soma; erro na avaliação deles não derruba a rota', async () => {
    const m = await montar();
    m.ligarAlertas({
      saude: () => ({ noite: 'atencao', motivo: 'Telegram sem resposta' }),
    });
    expect(await (await m.app.request('/api/saude-noite')).json()).toEqual({
      noite: 'atencao',
      motivo: 'Telegram sem resposta',
    });
    m.ligarAlertas({
      saude: () => {
        throw new Error('quebrou');
      },
    });
    const r = await m.app.request('/api/saude-noite');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ noite: 'ok' });
  });
});

describe('comandos que o servidor executa (leva 3)', () => {
  it('alerta-teste: sem alertas → 400 "indisponível"; com alertas → envia; falha de envio → 400 com o detalhe', async () => {
    const m = await montar();
    const cookie = await login(m);
    const r0 = await comando(m, cookie, { tipo: 'alerta-teste' });
    expect(r0.status).toBe(400);
    expect(((await r0.json()) as { erro: string }).erro).toMatch(/indisponível nesta versão/);
    const teste = vi.fn(async () => ({
      ok: true,
      detalhe: 'mensagem enviada ao Telegram',
    }));
    m.ligarAlertas({ teste });
    const v0 = m.controller.state().versao;
    expect((await comando(m, cookie, { tipo: 'alerta-teste' })).status).toBe(200);
    expect(teste).toHaveBeenCalledTimes(1);
    expect(m.controller.state().versao).toBe(v0);
    expect(m.log.recentes(20).some((l) => /alerta de teste enviado — mensagem enviada ao Telegram/.test(l.msg))).toBe(true);
    m.ligarAlertas({
      teste: () => ({ ok: false, detalhe: 'TELEGRAM_BOT_TOKEN ausente' }),
    });
    const r2 = await comando(m, cookie, { tipo: 'alerta-teste' });
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { erro: string }).erro).toBe('Alerta de teste não enviado: TELEGRAM_BOT_TOKEN ausente');
  });

  it('tse-retomar: chama TseManager.retomar() quando existe (frente B); sem ele, 400 "indisponível"', async () => {
    const m = await montar();
    const cookie = await login(m);
    const tse = m.tse as unknown as { retomar?: () => void };
    const original = tse.retomar;
    try {
      tse.retomar = undefined;
      const r0 = await comando(m, cookie, { tipo: 'tse-retomar' });
      expect(r0.status).toBe(400);
      expect(((await r0.json()) as { erro: string }).erro).toMatch(/indisponível nesta versão/);
      const retomar = vi.fn();
      tse.retomar = retomar;
      expect((await comando(m, cookie, { tipo: 'tse-retomar' })).status).toBe(200);
      expect(retomar).toHaveBeenCalledTimes(1);
    } finally {
      tse.retomar = original;
    }
  });

  it('aviso-nacional ressincroniza a fonte TSE (a frente B lê o modo)', async () => {
    const m = await montar();
    const cookie = await login(m);
    const sinc = vi.spyOn(m.tse, 'sincronizar');
    expect((await comando(m, cookie, { tipo: 'aviso-nacional', modo: 'off' })).status).toBe(200);
    expect(sinc).toHaveBeenCalledTimes(1);
    expect(m.noite().avisoNacional).toBe('off');
  });
});
