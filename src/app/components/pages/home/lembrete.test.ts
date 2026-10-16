/**
 * I29 mínimo: o lembrete da apuração no Teste Cego e no Palpite. O evento abre só um CAMINHO do site (+ utm_source=agenda):
 * nunca o código do palpite (depois do "#") nem o resultado do Teste. I28: links do "Siga" com utm_source=sintonia.
 */
import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '@/shared/constants';
import { caminhoLembrete, lembreteDisponivel } from './BotaoLembrete';
import { eventoApuracao, gerarIcs, googleAgendaUrl, outlookAgendaUrl } from './agenda';
import { FRASE_SIGA_RESULTADO, linkRede } from '@/app/components/crescimento/SigaSintonia';

describe('lembrete (I29)', () => {
  it('o caminho do evento é só o caminho: sem query, sem "#" (código do palpite ou do Teste)', () => {
    expect(caminhoLembrete('/palpite')).toBe('/palpite');
    expect(caminhoLembrete('/palpite#1e0')).toBe('/palpite');
    expect(caminhoLembrete('/teste/resultado#AbC123')).toBe('/teste/resultado');
    expect(caminhoLembrete('/apuracao?race=pres&h=1845')).toBe('/apuracao');
    expect(caminhoLembrete('javascript:alert(1)')).toBe('/apuracao');
    expect(caminhoLembrete('https://outro.site/x')).toBe('/apuracao');
  });

  it('palpite: o evento (arquivo, Google e Outlook) leva /palpite?utm_source=agenda e nada do palpite', () => {
    const ev = eventoApuracao(`https://sintonia2026.com.br${caminhoLembrete('/palpite#1e0')}`);
    expect(ev.url).toBe('https://sintonia2026.com.br/palpite?utm_source=agenda');
    for (const s of [gerarIcs(ev, 0), decodeURIComponent(googleAgendaUrl(ev)), decodeURIComponent(outlookAgendaUrl(ev))]) {
      expect(s).not.toContain('#');
      expect(s).not.toContain('1e0');
      expect(s).toContain('utm_source=agenda');
    }
  });

  it('só antes das 17h de 25/10', () => {
    expect(lembreteDisponivel(INICIO_APURACAO - 1)).toBe(true);
    expect(lembreteDisponivel(INICIO_APURACAO)).toBe(false);
  });
});

describe('"Siga o Sintonia" no resultado (I28)', () => {
  it('links com utm_source=sintonia; frase fixa e neutra, sem candidato nem número', () => {
    expect(linkRede('https://x.com/sintonia2026', true)).toBe('https://x.com/sintonia2026?utm_source=sintonia');
    expect(linkRede('https://whatsapp.com/channel/0029Va', true)).toBe('https://whatsapp.com/channel/0029Va?utm_source=sintonia');
    expect(linkRede('https://x.com/sintonia2026', false)).toBe('https://x.com/sintonia2026');
    expect(FRASE_SIGA_RESULTADO).not.toMatch(/\d|Lula|Flávio|venc|ganh|vitória|derrot|eleit/i);
  });
});
