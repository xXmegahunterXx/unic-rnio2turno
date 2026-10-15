import { describe, expect, it } from 'vitest';
import {
  GRUPOS_FORA_DE_PESSOAS,
  diaBrasilia,
  dominioRegistravel,
  grupoDaRota,
  intervaloPresenca,
  normalizarOrigem,
  origemDaEntrada,
  origemDoHost,
  origemDoUtm,
  redesAtivas,
  rotuloOrigem,
  urlRedeValida,
  validaRedes,
} from './audiencia';

describe('grupoDaRota', () => {
  it('agrupa os caminhos do app (nunca devolve o caminho em si)', () => {
    expect(grupoDaRota('/')).toBe('inicio');
    expect(grupoDaRota('/apuracao')).toBe('apuracao');
    expect(grupoDaRota('/apuracao/sp/71072')).toBe('apuracao');
    expect(grupoDaRota('/apuracao/consulta')).toBe('consulta');
    expect(grupoDaRota('/teste/resultado')).toBe('teste');
    expect(grupoDaRota('/duelo/AbCdEf123')).toBe('duelo');
    expect(grupoDaRota('/candidato/123')).toBe('cargos');
    expect(grupoDaRota('/assembleias/sp')).toBe('cargos');
    expect(grupoDaRota('/embed/placar')).toBe('widgets');
    expect(grupoDaRota('/live')).toBe('live');
    expect(grupoDaRota('/sobre/')).toBe('institucional');
    expect(grupoDaRota('/qualquer-coisa')).toBe('outras');
  });

  it('ignora query string e hash; painel e /kit não contam', () => {
    expect(grupoDaRota('/teste?s=abc&r=1')).toBe('teste');
    expect(grupoDaRota('/duelo/x#respostas')).toBe('duelo');
    expect(grupoDaRota('/admin')).toBeNull();
    expect(grupoDaRota('/admin/qualquer')).toBeNull();
    expect(grupoDaRota('/kit/viz')).toBeNull();
  });

  it('widgets e /live ficam fora das pessoas', () => {
    expect(GRUPOS_FORA_DE_PESSOAS).toEqual(['widgets', 'live']);
  });
});

describe('origens', () => {
  it('famílias conhecidas pelo domínio', () => {
    expect(origemDoHost('t.co')).toBe('x');
    expect(origemDoHost('mobile.twitter.com')).toBe('x');
    expect(origemDoHost('www.twitch.tv')).toBe('twitch');
    expect(origemDoHost('m.youtube.com')).toBe('youtube');
    expect(origemDoHost('www.google.com.br')).toBe('google');
    expect(origemDoHost('l.instagram.com')).toBe('instagram');
    expect(origemDoHost('lm.facebook.com')).toBe('facebook');
    expect(origemDoHost('kick.com')).toBe('kick');
    expect(origemDoHost('duckduckgo.com')).toBe('outras-buscas');
  });

  it('outros sites viram o domínio registrável (sem subdomínio, sem caminho)', () => {
    expect(dominioRegistravel('noticias.exemplo.com.br')).toBe('exemplo.com.br');
    expect(dominioRegistravel('joao.blogspot.com')).toBe('blogspot.com');
    expect(dominioRegistravel('192.168.0.1')).toBeNull();
    expect(dominioRegistravel('localhost')).toBeNull();
    expect(origemDoHost('ge.globo.com')).toBe('globo.com');
    expect(origemDoHost('intranet')).toBe('outros');
  });

  it('entrada: utm_source tem prioridade; sem referrer = direto; o próprio site = null', () => {
    expect(origemDaEntrada('https://t.co/abc', null, 'sintonia2026.com.br')).toBe('x');
    expect(origemDaEntrada('', null, 'sintonia2026.com.br')).toBe('direto');
    expect(origemDaEntrada(null, 'whatsapp', 'sintonia2026.com.br')).toBe('whatsapp');
    expect(origemDaEntrada('https://www.google.com/', 'Newsletter_Out', 'sintonia2026.com.br')).toBe('utm:newsletter_out');
    expect(origemDaEntrada('https://www.sintonia2026.com.br/apuracao', null, 'sintonia2026.com.br')).toBeNull();
    expect(origemDaEntrada('android-app://com.google.android.googlequicksearchbox/', null, 'x.org')).toBe('google');
    expect(origemDaEntrada('android-app://com.twitter.android', null, 'x.org')).toBe('x');
    expect(origemDaEntrada('https://www.uol.com.br/noticias/a-materia?id=9', null, 'x.org')).toBe('uol.com.br');
    // o caminho e a query nunca aparecem
    expect(origemDaEntrada('https://exemplo.com.br/perfil/joao?email=a@b.c', null, 'x.org')).toBe('exemplo.com.br');
  });

  it('utm_source estranho é recusado ou limpo', () => {
    expect(origemDoUtm('  ')).toBeNull();
    expect(origemDoUtm('<script>')).toBeNull();
    expect(origemDoUtm('a'.repeat(31))).toBeNull();
    expect(origemDoUtm('IG')).toBe('instagram');
  });

  it('servidor revalida o que o app mandou', () => {
    expect(normalizarOrigem('x')).toBe('x');
    expect(normalizarOrigem('t.co')).toBe('x');
    expect(normalizarOrigem('sub.exemplo.com.br')).toBe('exemplo.com.br');
    expect(normalizarOrigem('utm:campanha-1')).toBe('utm:campanha-1');
    expect(normalizarOrigem('utm:<b>')).toBeNull();
    expect(normalizarOrigem('https://exemplo.com/caminho')).toBeNull();
    expect(normalizarOrigem(42)).toBeNull();
    expect(normalizarOrigem('x'.repeat(65))).toBeNull();
    expect(rotuloOrigem('utm:live')).toBe('Campanha “live”');
    expect(rotuloOrigem('twitch')).toBe('Twitch');
  });
});

describe('presença e dia', () => {
  it('intervalo sobe com a carga', () => {
    expect(intervaloPresenca(0)).toBe(60);
    expect(intervaloPresenca(20_000)).toBe(120);
    expect(intervaloPresenca(80_000)).toBe(180);
    expect(intervaloPresenca(143_000)).toBe(240);
  });

  it('dia de Brasília vira à meia-noite de Brasília (03:00 UTC)', () => {
    expect(diaBrasilia(Date.UTC(2026, 9, 26, 2, 59))).toBe('2026-10-25');
    expect(diaBrasilia(Date.UTC(2026, 9, 26, 3, 0))).toBe('2026-10-26');
  });
});

describe('redes do Sintonia', () => {
  it('só https no domínio da própria rede, com perfil', () => {
    expect(urlRedeValida('x', 'https://x.com/sintonia')).toBe(true);
    expect(urlRedeValida('x', 'https://twitter.com/sintonia')).toBe(true);
    expect(urlRedeValida('x', 'http://x.com/sintonia')).toBe(false);
    expect(urlRedeValida('x', 'https://x.com/')).toBe(false);
    expect(urlRedeValida('x', 'https://x.com.golpe.io/sintonia')).toBe(false);
    expect(urlRedeValida('instagram', 'https://user:senha@instagram.com/sintonia')).toBe(false);
    expect(urlRedeValida('whatsapp', 'https://whatsapp.com/channel/0029VaAbC')).toBe(true);
    expect(urlRedeValida('telegram', 'https://t.me/sintonia')).toBe(true);
    expect(urlRedeValida('youtube', 'https://www.youtube.com/@sintonia')).toBe(true);
    expect(urlRedeValida('tiktok', 'https://www.tiktok.com/@sintonia')).toBe(true);
    expect(urlRedeValida('tiktok', 'javascript:alert(1)')).toBe(false);
  });

  it('todas opcionais; vazio some; erro diz qual rede', () => {
    expect(validaRedes(null)).toEqual({ ok: {} });
    expect(validaRedes({ x: '', instagram: '  ', youtube: null })).toEqual({ ok: {} });
    expect(validaRedes({ x: ' https://x.com/sintonia ' })).toEqual({ ok: { x: 'https://x.com/sintonia' } });
    const r = validaRedes({ telegram: 'https://evil.com/t' });
    expect('erro' in r && r.rede).toBe('telegram');
    expect(redesAtivas({ youtube: 'https://youtube.com/@s', x: 'https://x.com/s' }).map(([k]) => k)).toEqual(['x', 'youtube']);
    expect(redesAtivas(null)).toEqual([]);
  });
});
