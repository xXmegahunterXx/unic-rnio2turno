import { describe, expect, it } from 'vitest';
import { DIA_ELEICAO_17H, DIA_ELEICAO_INICIO, LIMITES_CHAT, type ChatAdmin, type ChatPublico } from '../shared/chat';
import { BLOQUEIO_ANTES_DA_ELEICAO, CC_CHAT, MENSAGEM_MAX_MS, SalaChat, type ConfigSalaChat } from './chat';
import { AGORA_PADRAO, login, montar } from './test-helpers';

const TOKEN = (i: number) => `token-de-teste-${String(i).padStart(6, '0')}`;

function sala(o: { producao?: boolean; agora?: number; ensaio?: boolean } = {}) {
  const relogio = { t: o.agora ?? AGORA_PADRAO };
  const s = new SalaChat({ now: () => relogio.t, producao: o.producao, ensaio: o.ensaio, municipios: ['Gado Bravo'], nomesCandidatos: ['Omar Aziz'] });
  return { s, relogio };
}

const enviar = (s: SalaChat, i: number, texto: string, rede = 'rede-a', apelido = `Pessoa ${i}`) => s.enviar({ apelido, texto, token: TOKEN(i) }, rede);

describe('SalaChat: abrir, enviar e limites', () => {
  it('começa FECHADA e recusa mensagens', () => {
    const { s } = sala();
    expect(s.publico().aberta).toBe(false);
    const r = enviar(s, 1, 'oi');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('fechada');
  });

  it('publica com a sala aberta e devolve só os campos públicos', () => {
    const { s } = sala();
    s.comando({ acao: 'abrir' });
    const r = enviar(s, 1, 'QUE NOITE INCRÍVEL GALERA');
    expect(r.ok).toBe(true);
    const pub = s.publico();
    expect(pub.aberta).toBe(true);
    expect(pub.mensagens).toHaveLength(1);
    expect(Object.keys(pub.mensagens[0]).sort()).toEqual(['apelido', 'em', 'id', 'texto']);
    expect(pub.mensagens[0].texto).toBe('Que noite incrível galera');
  });

  it('modo lento por visitante (padrão 10 s), 30 por hora e sem duplicadas', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    expect(enviar(s, 1, 'primeira').ok).toBe(true);
    const lento = enviar(s, 1, 'segunda');
    expect(lento.ok).toBe(false);
    if (!lento.ok) {
      expect(lento.motivo).toBe('lento');
      expect(lento.esperaS).toBe(10);
    }
    // outra pessoa em OUTRA rede não espera
    expect(enviar(s, 2, 'outra pessoa', 'rede-b').ok).toBe(true);
    relogio.t += 10_000;
    const dup = enviar(s, 1, 'Primeira!!');
    expect(!dup.ok && dup.motivo).toBe('duplicada');
    // modo lento mudado pelo admin vale na hora
    s.comando({ acao: 'lento', segundos: 3 });
    relogio.t += 3_000;
    expect(enviar(s, 1, 'terceira').ok).toBe(true);
    // 30 por hora (a rede também tem limite por minuto: espalha no tempo)
    let ok = 2;
    for (let i = 0; i < 40; i++) {
      relogio.t += 61_000;
      if (enviar(s, 1, `mensagem número ${i} variada ${'x'.repeat(i % 5)}`).ok) ok++;
    }
    expect(ok).toBeLessThanOrEqual(LIMITES_CHAT.porHora + 1);
  });

  it('a mesma mensagem de várias pessoas (raid) para na 4ª em 2 min', () => {
    const { s } = sala();
    s.comando({ acao: 'abrir' });
    expect([1, 2, 3].map((i) => enviar(s, i, 'que noite', `rede-${i}`).ok)).toEqual([true, true, true]);
    const r = enviar(s, 4, 'Que noite!', 'rede-4');
    expect(!r.ok && r.motivo).toBe('duplicada');
  });

  it('filtros no servidor (ofensa, link, propaganda, apelido) e exceção de município', () => {
    const { s } = sala();
    s.comando({ acao: 'abrir' });
    const m = (i: number, t: string, ap?: string) => {
      const r = enviar(s, i, t, `rede-${i}`, ap);
      return r.ok ? 'ok' : r.motivo;
    };
    expect(m(1, 'p0rr4')).toBe('ofensa');
    expect(m(2, 'entra em meusite.com')).toBe('link');
    expect(m(3, 'vote 22')).toBe('propaganda');
    expect(m(4, 'oi', 'Lula Livre')).toBe('apelido');
    expect(m(5, 'oi', 'Omar Aziz')).toBe('apelido');
    expect(m(6, 'Gado Bravo já fechou')).toBe('ok');
    expect(s.paraAdmin().contadores.recusadas).toMatchObject({ ofensa: 1, link: 1, propaganda: 1, apelido: 2 });
  });

  it('token inválido e silenciado', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    const r = s.enviar({ apelido: 'Ana', texto: 'oi', token: 'x' }, 'rede');
    expect(!r.ok && r.motivo).toBe('token');
    expect(enviar(s, 1, 'antes', 'rede-1').ok).toBe(true);
    const autor = s.paraAdmin().mensagens[0].autor;
    expect(s.comando({ acao: 'silenciar', autor, minutos: 5 }).ok).toBe(true);
    // as mensagens do autor saem e voltam como "removidas" para quem já tinha
    expect(s.publico().mensagens).toHaveLength(0);
    expect(s.publico().removidas).toHaveLength(1);
    relogio.t += 20_000;
    const sil = enviar(s, 1, 'depois', 'rede-1');
    expect(!sil.ok && sil.motivo).toBe('silenciado');
    expect(s.comando({ acao: 'liberar', autor }).ok).toBe(true);
    expect(enviar(s, 1, 'liberado', 'rede-1').ok).toBe(true);
  });
});

describe('SalaChat: trocar o token não fura os limites (achado da revisão)', () => {
  it('autores novos da mesma rede dividem o modo lento: 60 tokens em 30 s publicam 3', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    let ok = 0;
    const motivos: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const r = enviar(s, 1000 + i, `mensagem número ${i} ${i.toString(36)} variada`, 'REDE-UNICA', `Spammer ${i}`);
      if (r.ok) ok++;
      else motivos[r.motivo] = (motivos[r.motivo] ?? 0) + 1;
      relogio.t += 500;
    }
    expect(ok).toBe(3);
    expect(motivos.lento).toBeGreaterThan(0);
    // outra rede não é afetada
    expect(enviar(s, 1, 'oi de outra rede', 'outra-rede').ok).toBe(true);
  });

  it('no máximo 8 autores novos por rede por hora; depois de 10 min o autor deixa de ser "novo"', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    s.comando({ acao: 'lento', segundos: 3 });
    let ok = 0;
    for (let i = 0; i < 12; i++) {
      relogio.t += 4_000;
      if (enviar(s, 2000 + i, `oi ${'abcdefghijklmnop'[i]} de novo`, 'rede-casa').ok) ok++;
    }
    expect(ok).toBe(8);
    const r = enviar(s, 2100, 'mais um', 'rede-casa');
    expect(!r.ok && r.motivo).toBe('limite');
    // os 8 já publicaram: passados 10 min, cada um tem só o seu modo lento (não dividem mais)
    relogio.t += 10 * 60_000;
    expect(enviar(s, 2000, 'voltei aqui', 'rede-casa').ok).toBe(true);
    expect(enviar(s, 2001, 'eu também', 'rede-casa').ok).toBe(true);
  });

  it('silenciar a REDE: token novo da mesma rede continua pausado; as mensagens da rede saem', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    expect(enviar(s, 1, 'spam um', 'rede-spam').ok).toBe(true);
    relogio.t += 11_000;
    expect(enviar(s, 2, 'spam dois', 'rede-spam').ok).toBe(true);
    expect(enviar(s, 3, 'normal', 'rede-boa').ok).toBe(true);
    const autor = s.paraAdmin().mensagens[0].autor;
    expect(s.comando({ acao: 'silenciar', autor, minutos: 30, rede: true }).ok).toBe(true);
    expect(s.publico().mensagens.map((m) => m.texto)).toEqual(['normal']);
    relogio.t += 11_000;
    const r = enviar(s, 99, 'voltei com outro token', 'rede-spam');
    expect(!r.ok && r.motivo).toBe('silenciado');
    expect(enviar(s, 4, 'outra rede segue', 'rede-boa2').ok).toBe(true);
    const sil = s.paraAdmin().silenciados.find((x) => x.rede);
    expect(sil?.autor).toMatch(/^r[a-z0-9]+$/);
    expect(s.comando({ acao: 'liberar', autor: sil!.autor }).ok).toBe(true);
    relogio.t += 11_000;
    expect(enviar(s, 100, 'liberado', 'rede-spam').ok).toBe(true);
  });
});

describe('SalaChat: denúncias e moderação', () => {
  /** Visitantes com a sala na tela há 2 min (só eles contam nas denúncias). */
  const naSala = (s: SalaChat, relogio: { t: number }, quem: [number, string][]) => {
    for (const [i, rede] of quem) s.sinalPresenca(TOKEN(i), rede);
    relogio.t += 2 * 60_000 + 1000;
  };

  it('3 denúncias de redes diferentes escondem até o admin decidir; mesma rede não soma; a própria não conta', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    naSala(s, relogio, [[2, 'rede-x'], [3, 'rede-x'], [4, 'rede-y'], [5, 'rede-z'], [6, 'rede-w']]);
    const r = enviar(s, 1, 'mensagem polêmica', 'rede-autor');
    if (!r.ok) throw new Error('não publicou');
    const id = r.mensagem.id;
    s.denunciar(id, TOKEN(1), 'rede-autor'); // a própria
    s.denunciar(id, TOKEN(2), 'rede-x');
    s.denunciar(id, TOKEN(3), 'rede-x'); // mesma rede
    s.denunciar(id, TOKEN(4), 'rede-y');
    expect(s.publico().mensagens).toHaveLength(1);
    s.denunciar(id, TOKEN(5), 'rede-z');
    const pub = s.publico();
    expect(pub.mensagens).toHaveLength(0);
    expect(pub.removidas).toContain(id);
    const adm = s.paraAdmin();
    expect(adm.denunciadas).toHaveLength(1);
    expect(adm.denunciadas[0]).toMatchObject({ id, denuncias: 3, oculta: true });
    // manter: volta e novas denúncias não escondem de novo
    expect(s.comando({ acao: 'manter', id }).ok).toBe(true);
    expect(s.publico().mensagens).toHaveLength(1);
    expect(s.publico().removidas).not.toContain(id);
    s.denunciar(id, TOKEN(6), 'rede-w');
    expect(s.publico().mensagens).toHaveLength(1);
  });

  it('denúncia de quem acabou de chegar não esconde; rede larga (IPv6 /48) conta uma vez', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    const r = enviar(s, 1, 'mensagem qualquer', 'rede-autor');
    if (!r.ok) throw new Error('não publicou');
    // sem 2 min na sala: não escondem (mas o painel vê)
    for (const [i, rede] of [[2, 'a'], [3, 'b'], [4, 'c']] as const) s.denunciar(r.mensagem.id, TOKEN(i), rede);
    expect(s.publico().mensagens).toHaveLength(1);
    expect(s.paraAdmin().denunciadas[0]?.denuncias).toBe(3);
    // três /64 da mesma /48: uma rede só
    naSala(s, relogio, [[12, 'a64-1'], [13, 'a64-2'], [14, 'a64-3']]);
    for (const [i, rede] of [[12, 'a64-1'], [13, 'a64-2'], [14, 'a64-3']] as const) s.denunciar(r.mensagem.id, TOKEN(i), rede, 'mesma-48');
    expect(s.publico().mensagens).toHaveLength(1);
  });

  it('uma rede esconde no máximo 5 mensagens por hora e o painel avisa', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    s.comando({ acao: 'lento', segundos: 3 });
    naSala(s, relogio, [[2, 'x'], [3, 'y'], [4, 'z']]);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      relogio.t += 4_000;
      const r = enviar(s, 300 + i, `mensagem de um lado ${'abcdefgh'[i]} aqui`, `autor-${i}`);
      if (r.ok) ids.push(r.mensagem.id);
    }
    expect(ids).toHaveLength(8);
    for (const id of ids) for (const [i, rede] of [[2, 'x'], [3, 'y'], [4, 'z']] as const) s.denunciar(id, TOKEN(i), rede);
    expect(s.publico().mensagens).toHaveLength(3);
    expect(s.paraAdmin().alertaDenuncias).toEqual({ redes: 3, ocultadasHora: 5 });
  });

  it('limiar de denúncias cresce com o público da sala', () => {
    const { s } = sala();
    s.comando({ acao: 'abrir' });
    expect(s.limiarDenuncias()).toBe(LIMITES_CHAT.denuncias);
    for (let i = 0; i < 6000; i++) s.sinalPresenca(TOKEN(10_000 + i), `rede-${i}`);
    expect(s.limiarDenuncias()).toBe(6);
  });

  it('apagar, fixar, limpar e o "limpaEm"', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    const a = enviar(s, 1, 'uma', 'r1');
    enviar(s, 2, 'duas', 'r2');
    if (!a.ok) throw new Error();
    expect(s.comando({ acao: 'apagar', id: a.mensagem.id }).ok).toBe(true);
    expect(s.publico().mensagens.map((m) => m.texto)).toEqual(['duas']);
    expect(s.publico().removidas).toEqual([a.mensagem.id]);
    expect(s.comando({ acao: 'apagar', id: 'nao-existe' }).ok).toBe(false);
    s.comando({ acao: 'fixar', texto: '  Boa noite!  Sala moderada. ' });
    expect(s.publico().fixada?.texto).toBe('Boa noite! Sala moderada.');
    expect(s.comando({ acao: 'fixar', texto: 'x'.repeat(201) }).ok).toBe(false);
    s.comando({ acao: 'fixar', texto: null });
    expect(s.publico().fixada).toBeNull();
    relogio.t += 1000;
    s.comando({ acao: 'limpar' });
    const pub = s.publico();
    expect(pub.mensagens).toHaveLength(0);
    expect(pub.limpaEm).toBe(relogio.t);
  });

  it('o buffer guarda no máximo 300 e o GET leva as 60 mais novas; mensagens com mais de 12 h saem', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    s.comando({ acao: 'lento', segundos: 3 });
    for (let i = 0; i < 320; i++) {
      relogio.t += 4_000;
      enviar(s, i, `mensagem ${i} ${i.toString(36)}`, `rede-${i % 50}`);
    }
    expect(s.paraAdmin().mensagens.length).toBeLessThanOrEqual(150);
    const pub = s.publico();
    expect(pub.mensagens).toHaveLength(LIMITES_CHAT.publicas);
    expect(pub.mensagens.at(-1)?.texto).toMatch(/^mensagem 319 /);
    relogio.t += MENSAGEM_MAX_MS + 10_000;
    expect(s.publico().mensagens).toHaveLength(0);
  });

  it('dia da eleição: em produção a sala aberta não recebe mensagens até 17h', () => {
    const { s, relogio } = sala({ producao: true, agora: DIA_ELEICAO_INICIO + 3600_000 });
    s.comando({ acao: 'abrir' });
    expect(s.publico().aberta).toBe(false);
    expect(s.publico().bloqueio).toMatch(/17h/);
    const r = enviar(s, 1, 'bom dia');
    expect(!r.ok && r.motivo).toBe('fechada');
    relogio.t = DIA_ELEICAO_17H;
    expect(s.publico().aberta).toBe(true);
    expect(enviar(s, 1, 'boa noite').ok).toBe(true);
    // fora de produção (dev/ensaio), sem bloqueio
    const dev = sala({ agora: DIA_ELEICAO_INICIO + 3600_000 });
    dev.s.comando({ acao: 'abrir' });
    expect(dev.s.publico().aberta).toBe(true);
  });
});

describe('SalaChat: antes da eleição e reinício', () => {
  it('produção antes de 25/10: o painel abre e a sala já recebe mensagens; na manhã de 25/10 vale o bloqueio legal', () => {
    const { s, relogio } = sala({ producao: true }); // 09/10
    const r = s.comando({ acao: 'abrir' });
    expect(r.ok && r.log).toBe('sala aberta');
    expect(s.publico().aberta).toBe(true);
    expect(s.publico().bloqueio).toBeNull();
    expect(s.publico().bloqueio).not.toBe(BLOQUEIO_ANTES_DA_ELEICAO);
    expect(enviar(s, 1, 'boa tarde, pessoal').ok).toBe(true);
    relogio.t = DIA_ELEICAO_INICIO + 3600_000; // manhã de 25/10: bloqueio legal
    expect(s.publico().aberta).toBe(false);
    expect(!enviar(s, 2, 'bom dia').ok).toBe(true);
    expect(s.publico().bloqueio).toMatch(/17h, quando terminar a votação/);
    relogio.t = DIA_ELEICAO_17H;
    expect(s.publico().aberta).toBe(true);
    expect(enviar(s, 1, 'boa noite').ok).toBe(true);
    // ensaio (cópia do site): antes de 25/10 vale; no dia, o bloqueio legal continua
    const ens = sala({ producao: true, ensaio: true });
    ens.s.comando({ acao: 'abrir' });
    expect(ens.s.publico().aberta).toBe(true);
    ens.relogio.t = DIA_ELEICAO_INICIO + 60_000;
    expect(ens.s.publico().aberta).toBe(false);
  });

  it('a configuração (aberta, modo lento, fixada) é avisada a cada mudança e restaurada; mensagens não', () => {
    const salvas: ConfigSalaChat[] = [];
    const relogio = { t: AGORA_PADRAO };
    const a = new SalaChat({ now: () => relogio.t, aoMudarConfig: (c) => salvas.push(c) });
    a.comando({ acao: 'abrir' });
    a.comando({ acao: 'lento', segundos: 20 });
    a.comando({ acao: 'fixar', texto: 'Bem-vindos' });
    a.enviar({ apelido: 'Ana', texto: 'oi', token: TOKEN(1) }, 'r');
    expect(salvas).toHaveLength(3);
    const ultima = salvas.at(-1)!;
    expect(ultima).toEqual({ aberta: true, lentoS: 20, fixada: { texto: 'Bem-vindos', em: AGORA_PADRAO } });
    // "reinício": nova sala com a configuração salva (JSON de ida e volta)
    const b = new SalaChat({ now: () => relogio.t, configInicial: JSON.parse(JSON.stringify(ultima)) });
    const pub = b.publico();
    expect(pub.aberta).toBe(true);
    expect(pub.lentoS).toBe(20);
    expect(pub.fixada?.texto).toBe('Bem-vindos');
    expect(pub.mensagens).toHaveLength(0);
    // arquivo inválido: ignorado, a sala nasce fechada
    for (const lixo of [{ aberta: 'sim' }, { aberta: true, lentoS: 1, fixada: null }, 'x', [], { aberta: true, lentoS: 10, fixada: { texto: '', em: 1 } }]) {
      const c = new SalaChat({ configInicial: lixo });
      expect(c.publico().aberta).toBe(false);
      expect(c.restaurarConfig(lixo)).toBe(false);
    }
  });
});

describe('SalaChat: presença, reações e intervalo', () => {
  it('presença: estimativa conservadora (até 10 por rede) e janela', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    for (let i = 0; i < 25; i++) s.sinalPresenca(TOKEN(i), 'mesma-rede');
    expect(s.pessoas()).toBe(10);
    for (let i = 0; i < 5; i++) s.sinalPresenca(TOKEN(100 + i), `rede-${i}`);
    expect(s.pessoas()).toBe(20); // 15, arredondado em dezenas
    expect(s.sinalPresenca('x', 'r')).toBe(false);
    relogio.t += 2.5 * 30_000 + 10_000;
    expect(s.pessoas()).toBeNull();
  });

  it('reações: contagem do último minuto, no máximo 20 por lote, nada fora da lista; o público vê só o TOTAL', () => {
    const { s, relogio } = sala();
    expect(s.reagir(TOKEN(1), { fogo: 3 }, 'r0')).toBe(false); // sala fechada
    s.comando({ acao: 'abrir' });
    s.reagir(TOKEN(1), { fogo: 3, palmas: 1, candidato: 99 }, 'r1');
    s.reagir(TOKEN(2), { fogo: 500 }, 'r2');
    expect(s.reacoes()).toEqual({ fogo: 23, uau: 0, palmas: 1, olhos: 0 });
    expect(s.publico().reacoes).toBe(24);
    relogio.t += 75_000;
    expect(s.reacoes()).toEqual({ fogo: 0, uau: 0, palmas: 0, olhos: 0 });
  });

  it('dia da eleição (0h–17h): reação e presença recusadas, mesmo com a sala aberta no painel', () => {
    const { s, relogio } = sala({ producao: true, agora: DIA_ELEICAO_INICIO + 60_000 });
    s.comando({ acao: 'abrir' });
    expect(s.reagir(TOKEN(1), { fogo: 3 }, 'r1')).toBe(false);
    expect(s.sinalPresenca(TOKEN(1), 'r1')).toBe(false);
    expect(s.publico().reacoes).toBe(0);
    expect(s.publico().pessoas).toBeNull();
    relogio.t = DIA_ELEICAO_17H;
    expect(s.reagir(TOKEN(1), { fogo: 3 }, 'r1')).toBe(true);
  });

  it('intervalo sugerido sobe quando a origem recebe muitas consultas (sem CDN)', () => {
    const { s, relogio } = sala();
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 20_000; i++) s.registrarConsulta(); // 2.000/s numa janela de 10 s
      relogio.t += 10_000;
    }
    s.registrarConsulta();
    expect(s.intervaloS()).toBeGreaterThan(2.5);
    // com CDN (poucas consultas na origem), volta ao mínimo
    for (let j = 0; j < 6; j++) {
      for (let i = 0; i < 20; i++) s.registrarConsulta();
      relogio.t += 10_000;
    }
    s.registrarConsulta();
    expect(s.intervaloS()).toBe(2.5);
  });
});

// ---- HTTP (app inteiro) ------------------------------------------------------------------------------------------

const ORIGEM = 'http://localhost';
const json = (corpo: unknown, extra: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGEM, 'sec-fetch-site': 'same-origin', ...extra },
  body: JSON.stringify(corpo),
});

describe('rotas do chat', () => {
  it('GET público: cache de 1 s na CDN, ETag e 304; nada de IP nem autor', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    const r = await m.app.request('/api/chat', { headers: { 'x-real-ip': '203.0.113.9' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC_CHAT);
    expect(r.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=1');
    const etag = r.headers.get('etag');
    expect(etag).toBeTruthy();
    const pub = (await r.json()) as ChatPublico;
    expect(pub.aberta).toBe(false);
    const r2 = await m.app.request('/api/chat', { headers: { 'if-none-match': etag! } });
    expect(r2.status).toBe(304);
  });

  it('POST: só JSON do próprio site; publica com a sala aberta pelo admin', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    const cookie = await login(m);
    const corpo = { apelido: 'Ana', texto: 'boa noite', token: TOKEN(1) };
    expect((await m.app.request('/api/chat', json(corpo))).status).toBe(403); // fechada
    const adm = await m.app.request('/api/admin/chat', { ...json({ acao: 'abrir' }), headers: { ...json({}).headers, cookie } });
    expect(adm.status).toBe(200);
    expect(((await adm.json()) as ChatAdmin).aberta).toBe(true);
    // outro site
    expect((await m.app.request('/api/chat', json(corpo, { origin: 'https://mal.example', 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    // sem JSON
    expect((await m.app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'text/plain', origin: ORIGEM }, body: JSON.stringify(corpo) })).status).toBe(415);
    const ok = await m.app.request('/api/chat', json(corpo, { 'x-real-ip': '203.0.113.20' }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const lento = await m.app.request('/api/chat', json({ ...corpo, texto: 'de novo' }, { 'x-real-ip': '203.0.113.20' }));
    expect(lento.status).toBe(429);
    expect(lento.headers.get('retry-after')).toBe('10');
    const ofensa = await m.app.request('/api/chat', json({ ...corpo, token: TOKEN(2), texto: 'p0rr4' }, { 'x-real-ip': '203.0.113.21' }));
    expect(ofensa.status).toBe(422);
    const pub = (await (await m.app.request('/api/chat')).json()) as ChatPublico;
    expect(pub.mensagens.map((x) => x.texto)).toEqual(['boa noite']);
    expect(JSON.stringify(pub)).not.toContain('203.0.113');
  });

  it('admin exige sessão; comando inválido = 400; o log não leva o texto das mensagens', async () => {
    const linhas: string[] = [];
    const m = await montar({ env: { TRUST_PROXY: '1' }, escreverLog: (l) => linhas.push(l) });
    expect((await m.app.request('/api/admin/chat')).status).toBe(401);
    const cookie = await login(m);
    const h = { ...json({}).headers, cookie };
    expect((await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'explodir' }) })).status).toBe(400);
    expect((await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'lento', segundos: 1 }) })).status).toBe(400);
    await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'abrir' }) });
    await m.app.request('/api/chat', json({ apelido: 'Ana', texto: 'segredo-unico-123', token: TOKEN(9) }, { 'x-real-ip': '198.51.100.7' }));
    const st = (await (await m.app.request('/api/admin/chat', { headers: { cookie } })).json()) as ChatAdmin;
    expect(st.mensagens).toHaveLength(1);
    expect(st.mensagens[0].autor).toMatch(/^[a-z0-9]{1,12}$/);
    await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'apagar', id: st.mensagens[0].id }) });
    const tudo = linhas.join('\n');
    expect(tudo).toContain('chat — sala aberta');
    expect(tudo).not.toContain('segredo-unico-123');
    expect(tudo).not.toContain('198.51.100.7');
  });

  it('GET com query string = 400 e não conta na carga; POST sem Origin nem Sec-Fetch-Site (curl) = 403', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    const r = await m.app.request('/api/chat?x=123');
    expect(r.status).toBe(400);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const cookie = await login(m);
    await m.app.request('/api/admin/chat', { ...json({ acao: 'abrir' }), headers: { ...json({}).headers, cookie } });
    const curl = await m.app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apelido: 'Ana', texto: 'oi', token: TOKEN(1) }) });
    expect(curl.status).toBe(403);
  });

  it('denúncia, presença e reação respondem rápido e sem cache', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' } });
    const cookie = await login(m);
    await m.app.request('/api/admin/chat', { ...json({ acao: 'abrir' }), headers: { ...json({}).headers, cookie } });
    const p = await m.app.request('/api/chat/presenca', json({ token: TOKEN(1) }));
    expect(p.status).toBe(204);
    expect(p.headers.get('cache-control')).toBe('no-store');
    expect((await m.app.request('/api/chat/reacao', json({ token: TOKEN(1), r: { fogo: 2 } }))).status).toBe(204);
    expect((await m.app.request('/api/chat/denuncia', json({ id: 'x', token: 'curto' }))).status).toBe(400);
    const pub = (await (await m.app.request('/api/chat')).json()) as ChatPublico;
    expect(pub.reacoes).toBe(2);
    expect(pub.pessoas).toBe(1);
  });
});

describe('rotas do chat: reinício', () => {
  it('STATE_DIR/chat.json: a sala aberta pelo painel continua aberta depois de reiniciar (mesmo STATE_DIR)', async () => {
    const m = await montar({ env: { TRUST_PROXY: '1' }, chatEmDisco: true });
    const cookie = await login(m);
    const h = { ...json({}).headers, cookie };
    await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'abrir' }) });
    await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'lento', segundos: 20 }) });
    await m.app.request('/api/admin/chat', { method: 'POST', headers: h, body: JSON.stringify({ acao: 'fixar', texto: 'Bem-vindos' }) });
    expect((await m.app.request('/api/chat', json({ apelido: 'Ana', texto: 'boa noite', token: TOKEN(1) }, { 'x-real-ip': '203.0.113.40' }))).status).toBe(200);
    await m.chatStore!.flush();
    const m2 = await montar({ env: { TRUST_PROXY: '1' }, chatEmDisco: true, stateDir: m.stateDir });
    const pub = (await (await m2.app.request('/api/chat')).json()) as ChatPublico;
    expect(pub).toMatchObject({ aberta: true, lentoS: 20, fixada: { texto: 'Bem-vindos' } });
    expect(pub.mensagens).toHaveLength(0);
  });
});

describe('SalaChat: duplicadas com números e emojis', () => {
  it('a mesma pessoa comenta dois percentuais diferentes; emoji e número de muitas pessoas não viram "raid"', () => {
    const { s, relogio } = sala();
    s.comando({ acao: 'abrir' });
    expect(enviar(s, 1, 'SP com 45% apurado').ok).toBe(true);
    relogio.t += 30_000;
    expect(enviar(s, 1, 'SP com 80% apurado').ok).toBe(true);
    relogio.t += 30_000;
    const dup = enviar(s, 1, 'sp com 80% APURADO!!');
    expect(!dup.ok && dup.motivo).toBe('duplicada');
    // 6 pessoas de redes diferentes: emojis e números passam (não há "raid" sem texto)
    const curtas = ['😮', '🔥', '👏', '👀', '50,1%', '17:42', '😮', '😮', '😮', '😮'];
    curtas.forEach((t, i) => expect(enviar(s, 100 + i, t, `rede-c${i}`).ok).toBe(true));
    // texto de verdade continua parando na 4ª
    expect([4, 5, 6].map((i) => enviar(s, 300 + i, 'que noite linda', `rede-q${i}`).ok)).toEqual([true, true, true]);
    const raid = enviar(s, 307, 'Que noite linda!', 'rede-q7');
    expect(!raid.ok && raid.motivo).toBe('duplicada');
  });
});
