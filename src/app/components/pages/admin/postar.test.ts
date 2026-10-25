import { describe, expect, it } from 'vitest';
import type { FeedEvent } from '@/shared/types';
import { INICIO_APURACAO } from '@/shared/constants';
import { FIM_VOTACAO } from '@/shared/diaVotacao';
import { pesoTextoX } from '@/app/lib/share';
import { LIMITE_TEXTO, PREFIXO_SIMULACAO, SUFIXO_LINK, TEXTO_DIA_VOTACAO, textoPostarConvite } from '@/app/components/share/textos';
import { MAX_MOMENTOS, MARCOS_AUDIENCIA, cartoesPostar, linksPostar, marcosAtingidos, nomesLiberados, type EntradaPostar } from './postar';

const PROIBIDAS = /vai ganhar|vitória|esmagador|derrota|virou o jogo|lavada|surra|favorito|torcida|imbat/i;
/** 25/10/2026, hh:mm de Brasília (UTC−3). */
const brt = (h: number, m: number) => Date.UTC(2026, 9, 25, h + 3, m);

const ev = (id: string, t: number, tipo: FeedEvent['tipo'], titulo: string, abrangencia: FeedEvent['abrangencia'] = 'BR'): FeedEvent => ({
  id,
  t,
  tipo,
  abrangencia,
  race: 'pres',
  titulo,
});

const EVENTOS: FeedEvent[] = [
  ev('i', brt(17, 0), 'inicio', 'Começa a divulgação dos resultados'),
  ev('m10', brt(17, 40), 'marco', '10% das seções totalizadas'),
  ev('sp', brt(18, 2), 'virada', 'Em São Paulo, Fulano passa à frente', 'SP'),
  ev('v', brt(18, 47), 'virada', 'Com 63,2% das seções, Fulano passa à frente'),
  ev('enc', brt(19, 0), 'uf-encerrada', 'Apuração encerrada no Acre', 'AC'),
  ev('e', brt(20, 11), 'eleito', 'Eleição matematicamente definida: Fulano'),
];

const base = (o: Partial<EntradaPostar> = {}): EntradaPostar => ({
  wallNow: brt(20, 15),
  fase: 'apurando',
  simulado: false,
  anonimizado: false,
  eventos: EVENTOS,
  pessoas: null,
  ...o,
});

describe('trava do fim da votação, 19h de 25/10 (cartões com nome)', () => {
  it('pelo relógio do servidor: antes das 19h, nenhum momento; a partir das 19h, todos os nacionais', () => {
    expect(FIM_VOTACAO).toBe(brt(19, 0));
    const antes = cartoesPostar(base({ wallNow: FIM_VOTACAO - 1 }));
    expect(antes.nomesLiberados).toBe(false);
    expect(antes.momentos).toEqual([]);
    expect(antes.travados).toBe(4);
    // 17h (começo da leitura do TSE) já não libera: a votação foi prorrogada até as 19h
    expect(cartoesPostar(base({ wallNow: INICIO_APURACAO })).nomesLiberados).toBe(false);
    const depois = cartoesPostar(base({ wallNow: FIM_VOTACAO }));
    expect(depois.nomesLiberados).toBe(true);
    expect(depois.travados).toBe(0);
    expect(depois.momentos.map((c) => c.id)).toEqual(['momento-e', 'momento-v', 'momento-m10', 'momento-i']);
  });

  it('convite: até as 19h, o do dia da votação (mesmo apurando); depois, o da fase', () => {
    expect(cartoesPostar(base({ wallNow: brt(18, 30) })).convite.texto).toBe(TEXTO_DIA_VOTACAO);
    expect(cartoesPostar(base({ wallNow: brt(9, 0), fase: 'pre' })).convite.texto).toBe(TEXTO_DIA_VOTACAO);
    expect(cartoesPostar(base({ wallNow: FIM_VOTACAO })).convite.texto).toBe(textoPostarConvite('apurando'));
    expect(textoPostarConvite('pre')).toMatch(/até as 19h \(Brasília\)/);
    for (const fase of ['pre', 'apurando', 'encerrada'] as const) expect(textoPostarConvite(fase)).not.toMatch(/17h/);
  });

  it('antes das 19h, só a simulação com nomes ocultos libera (e marcada [SIMULAÇÃO])', () => {
    const cedo = Date.UTC(2026, 9, 21, 12);
    expect(nomesLiberados({ wallNow: cedo, simulado: true, anonimizado: true })).toBe(true);
    expect(nomesLiberados({ wallNow: cedo, simulado: true, anonimizado: false })).toBe(false);
    expect(nomesLiberados({ wallNow: cedo, simulado: false, anonimizado: true })).toBe(false);
    expect(nomesLiberados({ wallNow: Number.NaN, simulado: false, anonimizado: false })).toBe(false);
    const r = cartoesPostar(base({ wallNow: cedo, simulado: true, anonimizado: true }));
    expect(r.momentos.length).toBe(4);
    for (const c of r.momentos) expect(c.texto.startsWith(PREFIXO_SIMULACAO)).toBe(true);
  });

  it('só eventos nacionais de começo, marco, liderança, virada e resultado; no máximo MAX_MOMENTOS', () => {
    const r = cartoesPostar(base());
    expect(r.momentos.map((c) => c.rotulo)).toEqual(['Resultado', 'Virada', 'Marco', 'Começo']);
    const muitos = Array.from({ length: 30 }, (_, i) => ev(`m${i}`, brt(17, i), 'marco', `${i}% das seções totalizadas`));
    const m = cartoesPostar(base({ eventos: muitos })).momentos;
    expect(m.length).toBe(MAX_MOMENTOS);
    expect(m[0].id).toBe('momento-m29');
  });
});

describe('textos (≤ 220, neutros) e imagens', () => {
  it('todos os cartões cabem no limite e passam pela lista de palavras proibidas', () => {
    const longo = ev('x', brt(19, 3), 'virada', 'palavra '.repeat(80));
    for (const simulado of [false, true]) {
      const r = cartoesPostar(base({ simulado, anonimizado: simulado, eventos: [...EVENTOS, longo], pessoas: 143_000 }));
      for (const c of [r.convite, ...r.audiencia, ...r.momentos]) {
        expect(pesoTextoX(c.texto), c.id).toBeLessThanOrEqual(LIMITE_TEXTO);
        expect(c.texto, c.id).not.toMatch(PROIBIDAS);
        if (simulado) expect(c.texto.startsWith(PREFIXO_SIMULACAO) || c.tipo === 'audiencia', c.id).toBe(true);
      }
    }
    for (const fase of ['pre', 'apurando', 'encerrada'] as const) {
      const t = textoPostarConvite(fase);
      expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
      expect(t).not.toMatch(/Lula|Bolsonaro|Flávio|Candidato|%/);
    }
  });

  it('convite e audiência sem candidato; imagem de audiência pelo marco (o servidor confere o número)', () => {
    const r = cartoesPostar(base({ pessoas: 60_000 }));
    expect(r.convite.imagem.x).toBe('/api/og/audiencia.png?m=0&formato=x');
    expect(r.convite.imagem.story).toBe('/api/og/audiencia.png?m=0&formato=story');
    expect(r.audiencia.map((c) => c.marco)).toEqual([50_000, 10_000]);
    expect(r.audiencia[0].imagem.x).toBe('/api/og/audiencia.png?m=50000&formato=x');
    expect(r.audiencia[0].texto).toBe('Mais de 50 mil pessoas acompanham a apuração no Sintonia agora. Ao vivo, seção por seção.');
    expect(r.proximoMarco).toBe(100_000);
    for (const c of [r.convite, ...r.audiencia]) expect(c.texto).not.toMatch(/Fulano|Candidato|Lula|Bolsonaro/);
    expect(r.momentos[0].imagem.story).toBe('/api/og/apuracao.png?race=pres&formato=story');
  });

  it('marcos: abaixo de 10 mil (ou sem medida), nenhum', () => {
    expect(marcosAtingidos(null)).toEqual([]);
    expect(marcosAtingidos(9_999)).toEqual([]);
    expect(marcosAtingidos(100_000)).toEqual([...MARCOS_AUDIENCIA]);
    const r = cartoesPostar(base({ pessoas: 499 }));
    expect(r.audiencia).toEqual([]);
    expect(r.proximoMarco).toBe(10_000);
    expect(cartoesPostar(base({ pessoas: 250_000 })).proximoMarco).toBeNull();
  });
});

describe('links do cartão (I08)', () => {
  const URL_PAGINA = 'https://sintonia2026.com.br/apuracao';
  it('X com utm e hora durante a apuração; WhatsApp com o sufixo neutro; copiar sem hora', () => {
    const c = cartoesPostar(base()).momentos[0];
    const l = linksPostar(c, URL_PAGINA, brt(20, 17));
    expect(l.linkX).toBe(`${URL_PAGINA}?utm_source=x&h=2015`);
    const x = new URL(l.intencaoX);
    expect(x.origin + x.pathname).toBe('https://x.com/intent/post');
    expect(x.searchParams.get('url')).toBe(l.linkX);
    expect(x.searchParams.get('text')).toBe(c.texto);
    expect(x.searchParams.get('hashtags')).toBe('Eleições2026,SegundoTurno');
    // o momento já chama para "seção por seção": o sufixo não se repete
    const zap = decodeURIComponent(l.intencaoWhatsapp.replace('https://wa.me/?text=', ''));
    expect(zap).toBe(`${c.texto}\n${URL_PAGINA}?utm_source=whatsapp`);
    const convite = cartoesPostar(base()).convite;
    const zapConvite = decodeURIComponent(linksPostar(convite, URL_PAGINA).intencaoWhatsapp.replace('https://wa.me/?text=', ''));
    expect(zapConvite).toBe(`${convite.texto}\n${SUFIXO_LINK}\n${URL_PAGINA}?utm_source=whatsapp`);
    expect(l.textoCopiar).toContain(`${URL_PAGINA}?utm_source=copiar`);
    expect(l.textoCopiar).not.toContain('h=');
    // fora da apuração: sem hora
    expect(linksPostar(c, URL_PAGINA).linkX).toBe(`${URL_PAGINA}?utm_source=x`);
  });
});
