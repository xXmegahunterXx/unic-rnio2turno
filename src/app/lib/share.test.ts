import { describe, expect, it } from 'vitest';
import {
  LIMITE_X,
  detectarNavegadorEmbutido,
  hostBonito,
  normalizarHashtags,
  pesoPostX,
  pesoTextoX,
  textoComLink,
  textoParaX,
  whatsappUrl,
  xIntentUrl,
} from './share';

const URL_DEMO = 'https://sintonia.app/apuracao/sp/71072?race=pres&t=18h42';

describe('xIntentUrl', () => {
  it('monta a intenção do X com texto, url e hashtags codificados', () => {
    const u = new URL(xIntentUrl('Placar às 18h42: A 51,2% × B 48,8%', URL_DEMO, ['Eleições2026', '#SegundoTurno']));
    expect(u.origin + u.pathname).toBe('https://x.com/intent/post');
    expect(u.searchParams.get('text')).toBe('Placar às 18h42: A 51,2% × B 48,8%');
    expect(u.searchParams.get('url')).toBe(URL_DEMO);
    expect(u.searchParams.get('hashtags')).toBe('Eleições2026,SegundoTurno');
  });

  it('nunca duplica o link: tira a URL do texto quando ela vem junto', () => {
    const u = new URL(xIntentUrl(`Veja o boletim ${URL_DEMO}`, URL_DEMO));
    expect(u.searchParams.get('text')).toBe('Veja o boletim');
    expect(xIntentUrl(`Veja ${URL_DEMO}`, URL_DEMO).split(encodeURIComponent(URL_DEMO)).length - 1).toBe(1);
  });

  it('codifica &, #, ? e quebras de linha (sem quebrar os parâmetros)', () => {
    const texto = 'A & B #1? 50% — "aspas"\nlinha 2';
    const u = new URL(xIntentUrl(texto, URL_DEMO));
    expect(u.searchParams.get('text')).toBe('A & B #1? 50% — "aspas" linha 2');
    expect(u.searchParams.get('url')).toBe(URL_DEMO);
    expect(xIntentUrl(texto, URL_DEMO)).not.toMatch(/[\s"]/);
  });

  it('sem url nem hashtags só leva o texto', () => {
    expect(xIntentUrl('oi')).toBe('https://x.com/intent/post?text=oi');
  });
});

describe('peso do X', () => {
  it('conta links como 23 e caracteres fora das faixas latinas como 2', () => {
    expect(pesoTextoX('abc')).toBe(3);
    expect(pesoTextoX(URL_DEMO)).toBe(23);
    expect(pesoTextoX('ação × º · –')).toBe(12);
    expect(pesoTextoX('…')).toBe(2);
    expect(pesoTextoX('−')).toBe(2);
  });

  it('textoParaX corta com reticências para caber com hashtags e link', () => {
    const longo = 'Com 63,2% das seções totalizadas, o placar mostra uma diferença pequena entre os dois candidatos. '.repeat(5);
    const tags = ['Eleições2026', 'SegundoTurno', 'Apuração'];
    const t = textoParaX(longo, URL_DEMO, tags);
    expect(t.endsWith('…')).toBe(true);
    expect(pesoPostX(t, tags, true)).toBeLessThanOrEqual(LIMITE_X);
    expect(t.length).toBeGreaterThan(150);
  });

  it('texto curto passa intacto', () => {
    expect(textoParaX('  Placar   ao vivo ', URL_DEMO, ['A'])).toBe('Placar ao vivo');
  });
});

describe('outros utilitários', () => {
  it('normaliza hashtags', () => {
    expect(normalizarHashtags(['#Eleições2026', 'eleições2026', ' Segundo Turno ', ''])).toEqual(['Eleições2026', 'SegundoTurno']);
  });

  it('texto com link para colar', () => {
    expect(textoComLink('Placar', 'https://x.y/a', ['A', 'B'])).toBe('Placar #A #B\nhttps://x.y/a');
    expect(textoComLink('Placar')).toBe('Placar');
  });

  it('WhatsApp leva texto e link numa mensagem só', () => {
    expect(new URL(whatsappUrl('Oi & tchau', 'https://x.y/?a=1&b=2')).searchParams.get('text')).toBe('Oi & tchau\nhttps://x.y/?a=1&b=2');
  });

  it('host apresentável nas imagens', () => {
    expect(hostBonito('sintonia.app')).toBe(true);
    expect(hostBonito('www.sintonia.com.br')).toBe(true);
    expect(hostBonito('localhost:5173')).toBe(false);
    expect(hostBonito('127.0.0.1')).toBe(false);
    expect(hostBonito('abc123.claudeusercontent.com')).toBe(false);
    expect(hostBonito('')).toBe(false);
  });
});

describe('detectarNavegadorEmbutido', () => {
  const casos: [string, ReturnType<typeof detectarNavegadorEmbutido>][] = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.48', 'x'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 TwitterAndroid', 'x'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0', 'instagram'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]', 'facebook'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 musical_ly_2023', 'tiktok'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp', 'linkedin'],
    ['Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36', 'outro'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36', 'outro'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'outro'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', null],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', null],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', null],
    ['', null],
  ];
  it.each(casos)('%s → %s', (ua, esperado) => {
    expect(detectarNavegadorEmbutido(ua)).toBe(esperado);
  });
});
