import { describe, expect, it } from 'vitest';
import {
  LIMITE_X,
  detectarNavegadorEmbutido,
  ehCelular,
  telegramUrl,
  CANAIS_COMPARTILHAMENTO,
  horaCompartilhada,
  hostBonito,
  normalizarHashtags,
  normalizarSitePublico,
  pesoPostX,
  pesoTextoX,
  textoComLink,
  textoParaX,
  urlCompartilhada,
  urlNoSite,
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

describe('site público (VITE_SITE_URL)', () => {
  it('normaliza: só http(s), sem barra final; mantém o "#" de um site com HashRouter', () => {
    expect(normalizarSitePublico('https://sintonia.app/')).toBe('https://sintonia.app');
    expect(normalizarSitePublico('  https://sintonia.app  ')).toBe('https://sintonia.app');
    expect(normalizarSitePublico('https://exemplo.org/sintonia/#')).toBe('https://exemplo.org/sintonia/#');
    expect(normalizarSitePublico('http://localhost:8787')).toBe('http://localhost:8787');
    for (const ruim of [undefined, null, '', 'sintonia.app', 'javascript:alert(1)', 'ftp://x.org', 'https://', 42]) {
      expect(normalizarSitePublico(ruim)).toBe('');
    }
  });

  it('monta a URL da rota no site público (caminho ou hash)', () => {
    expect(urlNoSite('https://sintonia.app', '/cenarios?c=AQ')).toBe('https://sintonia.app/cenarios?c=AQ');
    expect(urlNoSite('https://sintonia.app', 'teste')).toBe('https://sintonia.app/teste');
    expect(urlNoSite('https://sintonia.app', '/')).toBe('https://sintonia.app/');
    expect(urlNoSite('https://exemplo.org/sintonia/#', '/apuracao/sp?race=pres')).toBe('https://exemplo.org/sintonia/#/apuracao/sp?race=pres');
  });
});

describe('urlCompartilhada (I08: origem e hora nos links)', () => {
  /** 25/10/2026, hh:mm:ss de Brasília (UTC−3). */
  const brt = (h: number, m: number, s = 0) => Date.UTC(2026, 9, 25, h + 3, m, s);
  const BASE = 'https://sintonia2026.com.br/apuracao/sp?race=pres';

  it('acrescenta utm_source com o canal e mantém os parâmetros da página', () => {
    const u = new URL(urlCompartilhada(BASE, 'whatsapp'));
    expect(u.searchParams.get('utm_source')).toBe('whatsapp');
    expect(u.searchParams.get('race')).toBe('pres');
    expect(u.pathname).toBe('/apuracao/sp');
    expect(u.searchParams.has('h')).toBe(false);
  });

  it('X e Telegram levam h=HHMM de Brasília arredondado para baixo a 5 min', () => {
    expect(new URL(urlCompartilhada(BASE, 'x', brt(18, 47, 12))).searchParams.get('h')).toBe('1845');
    expect(new URL(urlCompartilhada(BASE, 'telegram', brt(18, 45, 0))).searchParams.get('h')).toBe('1845');
    expect(new URL(urlCompartilhada(BASE, 'x', brt(18, 44, 59))).searchParams.get('h')).toBe('1840');
    expect(new URL(urlCompartilhada(BASE, 'x', brt(17, 0, 0))).searchParams.get('h')).toBe('1700');
    // meia-noite de Brasília (03:00 UTC)
    expect(new URL(urlCompartilhada(BASE, 'x', Date.UTC(2026, 9, 26, 3, 2))).searchParams.get('h')).toBe('0000');
  });

  it('sem `agora` (fora da apuração), copiar link e os demais canais: nunca h — e um h velho da página sai', () => {
    expect(new URL(urlCompartilhada(BASE, 'x')).searchParams.has('h')).toBe(false);
    const velho = `${BASE}&h=1830&utm_source=whatsapp`;
    for (const canal of ['copiar', 'whatsapp', 'story', 'agenda', 'embed', 'tv', 'live', 'sintonia'] as const) {
      const u = new URL(urlCompartilhada(velho, canal, brt(19, 2)));
      expect(u.searchParams.has('h'), canal).toBe(false);
      expect(u.searchParams.getAll('utm_source'), canal).toEqual([canal]);
    }
  });

  it('`agora` inválido não gera hora', () => {
    for (const ruim of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      expect(new URL(urlCompartilhada(BASE, 'x', ruim)).searchParams.has('h')).toBe(false);
    }
  });

  it('parâmetros antes do #: o código do Duelo/palpite e a rota do HashRouter ficam intactos', () => {
    expect(urlCompartilhada('https://sintonia2026.com.br/duelo/#AbC-123', 'whatsapp')).toBe(
      'https://sintonia2026.com.br/duelo/?utm_source=whatsapp#AbC-123',
    );
    expect(urlCompartilhada('https://exemplo.org/sintonia/#/apuracao?race=pres', 'x', brt(20, 11))).toBe(
      'https://exemplo.org/sintonia/?utm_source=x&h=2010#/apuracao?race=pres',
    );
  });

  it('rota relativa continua relativa; texto que não é link volta igual', () => {
    expect(urlCompartilhada('/palpite', 'agenda')).toBe('/palpite?utm_source=agenda');
    expect(urlCompartilhada('/apuracao?race=pres#mapa', 'embed')).toBe('/apuracao?race=pres&utm_source=embed#mapa');
    expect(urlCompartilhada('sintonia2026.com.br', 'x')).toBe('sintonia2026.com.br');
    expect(urlCompartilhada('javascript:alert(1)', 'x')).toBe('javascript:alert(1)');
  });

  it('todos os canais são curtos e válidos para a classificação de origem (a-z)', () => {
    for (const c of CANAIS_COMPARTILHAMENTO) expect(c).toMatch(/^[a-z]{1,30}$/);
    expect(horaCompartilhada(brt(9, 9))).toBe('0905');
  });
});

describe('ehCelular (I20: WhatsApp primeiro no celular)', () => {
  // UAs do QA-prod 5: navegadores do Instagram e do WhatsApp, Safari no iOS, Chrome no Android — e o computador.
  const UA_INSTAGRAM =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone15,3; iOS 17_5; pt_BR; pt; scale=3.00; 1290x2796; 615478391)';
  const UA_WHATSAPP_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 WhatsApp/2.24.13.78';
  const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
  const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

  it('celular pelos UAs móveis', () => {
    for (const ua of [UA_INSTAGRAM, UA_WHATSAPP_ANDROID, UA_SAFARI_IOS, UA_CHROME_ANDROID]) expect(ehCelular(ua), ua).toBe(true);
  });
  it('computador continua com o X primeiro; tela de toque (iPad em modo computador) conta como celular', () => {
    expect(ehCelular(UA_DESKTOP)).toBe(false);
    expect(ehCelular(UA_MAC)).toBe(false);
    expect(ehCelular(UA_MAC, true)).toBe(true);
    expect(ehCelular('')).toBe(false);
  });
});

describe('telegramUrl', () => {
  it('t.me/share/url com url e texto codificados', () => {
    const u = new URL(telegramUrl('Placar · 63,21%', 'https://sintonia2026.com.br/apuracao?utm_source=telegram'));
    expect(u.origin + u.pathname).toBe('https://t.me/share/url');
    expect(u.searchParams.get('url')).toBe('https://sintonia2026.com.br/apuracao?utm_source=telegram');
    expect(u.searchParams.get('text')).toBe('Placar · 63,21%');
  });
});
