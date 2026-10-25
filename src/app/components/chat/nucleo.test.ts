import { describe, expect, it } from 'vitest';
import type { MensagemChat } from '@/shared/chat';
import { INICIO_APURACAO } from '@/shared/constants';
import { FIM_VOTACAO } from '@/shared/diaVotacao';
import {
  ALCANCE_MAX_PX,
  ANTECIPA_MAX_PX,
  ANTECIPA_MIN_PX,
  CONTEUDO_LARGO,
  ESPERA_REABRIR_MS,
  GRACA_INTERACAO_MS,
  HISTERESE_POPUP,
  LARGURA_DOCA,
  LARGURA_MIN_DOCA,
  POPUP,
  RESPIRO_ANUNCIO,
  RESPIRO_POPUP,
  alcanceReabrir,
  alturaFolhaCelular,
  antecipar,
  cantoSempreOcupado,
  contagemAbertura,
  contarNovas,
  cruza,
  decidirOcupacao,
  estender,
  faseChat,
  geometriaDoca,
  geometriaPopup,
  gerarToken,
  inflar,
  larguraAba,
  larguraAbaNaMargem,
  margemConteudo,
  modoComputador,
  regiaoAnuncioSala,
  intervaloConsulta,
  juntarMensagens,
  lerPrefGuardada,
  ondeAbrir,
  paginaDaSala,
  popupAberto,
  prefEfetiva,
  proximaConsulta,
  regiaoPilula,
  reguaFixa,
  textoAbertura,
  textoPessoasSala,
} from './nucleo';
import { chatNaRota } from './rotas';

const msg = (id: string, em: number, texto = id): MensagemChat => ({ id, apelido: 'Ana', texto, em });
const vazio = { mensagens: [], removidas: [], limpaEm: 0 };

describe('juntarMensagens', () => {
  it('acrescenta por id, sem duplicar, em ordem de horário', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1), msg('b', 2)] });
    const b = juntarMensagens(a, { ...vazio, mensagens: [msg('b', 2), msg('c', 3)] });
    expect(b.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // mensagem que já saiu da janela do servidor continua no navegador
    const c = juntarMensagens(b, { ...vazio, mensagens: [msg('d', 4)] });
    expect(c.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('devolve o MESMO array quando nada muda (sem redesenho)', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1)] });
    expect(juntarMensagens(a, { ...vazio, mensagens: [msg('a', 1)] })).toBe(a);
  });
  it('tira removidas e as anteriores ao "limpar tudo"', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1), msg('b', 2), msg('c', 3)] });
    expect(juntarMensagens(a, { ...vazio, removidas: ['b'] }).map((m) => m.id)).toEqual(['a', 'c']);
    expect(juntarMensagens(a, { ...vazio, limpaEm: 2 }).map((m) => m.id)).toEqual(['c']);
    // removida que ainda vem na lista do servidor (cache da CDN) não volta
    expect(juntarMensagens([], { mensagens: [msg('x', 5)], removidas: ['x'], limpaEm: 0 })).toHaveLength(0);
  });
  it('resposta completa: o que a aba tinha dentro da janela recebida e não veio saiu (mesmo sem estar nas removidas)', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1), msg('b', 2), msg('c', 3), msg('d', 4)] });
    // servidor escondeu "c" e a lista de removidas já não a traz; "a" ficou fora da janela (antes da 1ª recebida)
    const b = juntarMensagens(a, { ...vazio, agora: 10, mensagens: [msg('b', 2), msg('d', 4), msg('e', 5)] });
    expect(b.map((m) => m.id)).toEqual(['a', 'b', 'd', 'e']);
    // a minha mensagem recém-publicada (depois do instante da resposta em cache) não some
    const c = juntarMensagens([...b, msg('minha', 12)], { ...vazio, agora: 10, mensagens: [msg('b', 2), msg('d', 4), msg('e', 5)] });
    expect(c.map((m) => m.id)).toContain('minha');
    // sala sem nenhuma visível: tudo o que a aba tinha até a resposta sai
    expect(juntarMensagens(b, { ...vazio, agora: 10, mensagens: [] }).map((m) => m.id)).toEqual([]);
  });
  it('aba parada por mais de 25 min recomeça só com o que veio', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('velha1', 1), msg('velha2', 2)] });
    const b = juntarMensagens(a, { ...vazio, agora: 5_000_000, mensagens: [msg('n1', 4_000_000), msg('n2', 4_000_001)] }, undefined, 31 * 60_000);
    expect(b.map((m) => m.id)).toEqual(['n1', 'n2']);
    // parada curta: as antigas (fora da janela) continuam
    const c = juntarMensagens(a, { ...vazio, agora: 5_000_000, mensagens: [msg('n1', 4_000_000)] }, undefined, 60_000);
    expect(c.map((m) => m.id)).toEqual(['velha1', 'velha2', 'n1']);
  });
  it('guarda no máximo `max`, descartando as mais antigas', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => msg(`m${i}`, i));
    expect(juntarMensagens([], { ...vazio, mensagens: muitas }, 4).map((m) => m.id)).toEqual(['m6', 'm7', 'm8', 'm9']);
  });
});

describe('contarNovas', () => {
  it('conta depois do visto, sem as próprias', () => {
    const l = [msg('a', 1), msg('b', 2), msg('c', 3), msg('d', 4)];
    expect(contarNovas(l, 2, new Set())).toBe(2);
    expect(contarNovas(l, 2, new Set(['d']))).toBe(1);
    expect(contarNovas(l, 9, new Set())).toBe(0);
  });
});

describe('ritmo de consulta', () => {
  it('rápido só com a sala na tela; minimizado só para o contador (12 s+); fechada raramente; recuo com falhas', () => {
    const aberta = { aberta: true, intervaloS: 2.5 };
    expect(intervaloConsulta(aberta, 'tela')).toBe(2500);
    expect(intervaloConsulta({ aberta: true, intervaloS: 6 }, 'tela')).toBe(6000);
    // minimizado: 12 s com o servidor folgado; 4× o intervalo adaptativo quando ele sobe (origem cheia)
    expect(intervaloConsulta(aberta, 'fundo')).toBe(12_000);
    expect(intervaloConsulta({ aberta: true, intervaloS: 6 }, 'fundo')).toBe(24_000);
    // fechada: 20 s com a contagem na tela, 90 s minimizada (o chat está em todas as páginas)
    expect(intervaloConsulta({ aberta: false, intervaloS: 2.5 }, 'tela')).toBe(20_000);
    expect(intervaloConsulta({ aberta: false, intervaloS: 2.5 }, 'fundo')).toBe(90_000);
    expect(intervaloConsulta(aberta, 'tela', 2)).toBe(10_000);
    expect(intervaloConsulta(aberta, 'tela', 20)).toBe(60_000);
    // o servidor nunca leva o navegador a consultar mais rápido que 2,5 s
    expect(intervaloConsulta({ aberta: true, intervaloS: 0.1 }, 'tela')).toBe(2500);
  });
  it('fechada antes do fim da votação (19h de 25/10): acorda na hora da abertura (com sorteio de até 15 s), nunca antes do normal', () => {
    const fechada = { aberta: false, intervaloS: 2.5 };
    // longe da abertura: o normal
    expect(proximaConsulta(fechada, 'fundo', 0, FIM_VOTACAO - 3_600_000, 0.5)).toBe(90_000);
    // 30 s antes: acorda 1 s depois da hora + sorteio
    expect(proximaConsulta(fechada, 'fundo', 0, FIM_VOTACAO - 30_000, 0)).toBe(31_000);
    expect(proximaConsulta(fechada, 'fundo', 0, FIM_VOTACAO - 30_000, 0.999)).toBe(31_000 + 14_985);
    expect(proximaConsulta(fechada, 'tela', 0, FIM_VOTACAO - 5_000, 1)).toBe(20_000);
    // aberta, depois da hora ou com falhas: o normal (o recuo não é furado)
    expect(proximaConsulta({ aberta: true, intervaloS: 2.5 }, 'fundo', 0, FIM_VOTACAO - 30_000, 0)).toBe(12_000);
    expect(proximaConsulta(fechada, 'fundo', 0, FIM_VOTACAO + 1, 0)).toBe(90_000);
    expect(proximaConsulta(fechada, 'fundo', 1, FIM_VOTACAO - 30_000, 0)).toBe(60_000);
    expect(proximaConsulta(null, 'fundo', 0, FIM_VOTACAO - 30_000, 0)).toBe(8000);
  });
});

describe('fase da sala e abertura', () => {
  it('demo, conectando, aberta, antes da hora e fechada depois dela', () => {
    expect(faseChat(null, true, 0)).toBe('demo');
    expect(faseChat(null, false, 0)).toBe('conectando');
    expect(faseChat({ aberta: true }, false, FIM_VOTACAO - 1)).toBe('aberta');
    expect(faseChat({ aberta: false }, false, FIM_VOTACAO - 1)).toBe('antes');
    expect(faseChat({ aberta: false }, false, FIM_VOTACAO)).toBe('fechada');
  });
  it('votação prorrogada: a sala abre às 19h (FIM_VOTACAO), não às 17h (início da leitura do TSE)', () => {
    expect(FIM_VOTACAO).toBe(Date.UTC(2026, 9, 25, 22, 0, 0));
    // entre 17h e 19h a sala segue "antes" (a pílula diz quando abre) e acorda na hora certa
    expect(faseChat({ aberta: false }, false, INICIO_APURACAO)).toBe('antes');
    expect(faseChat({ aberta: false }, false, INICIO_APURACAO + 3_600_000)).toBe('antes');
    expect(textoAbertura(INICIO_APURACAO + 1)).toBe('abre hoje, 19h');
    expect(proximaConsulta({ aberta: false, intervaloS: 2.5 }, 'fundo', 0, FIM_VOTACAO - 30_000, 0)).toBe(31_000);
    expect(proximaConsulta({ aberta: false, intervaloS: 2.5 }, 'fundo', 0, INICIO_APURACAO - 30_000, 0)).toBe(90_000);
  });
  it('texto curto da pílula pelo dia em Brasília', () => {
    // hoje (19/10, segunda) → domingo; 24/10 → amanhã; 25/10 de manhã → hoje; mais de 6 dias → data
    expect(textoAbertura(Date.UTC(2026, 9, 19, 15, 0))).toBe('abre domingo, 19h');
    expect(textoAbertura(Date.UTC(2026, 9, 25, 2, 59))).toBe('abre amanhã, 19h'); // 23h59 de 24/10 em Brasília
    expect(textoAbertura(Date.UTC(2026, 9, 25, 3, 0))).toBe('abre hoje, 19h');
    expect(textoAbertura(FIM_VOTACAO - 1)).toBe('abre hoje, 19h');
    expect(textoAbertura(Date.UTC(2026, 9, 18, 15, 0))).toBe('abre 25/10, 19h');
    expect(textoAbertura(FIM_VOTACAO)).toBeNull();
    // com outro horário explícito, a hora sai dele
    expect(textoAbertura(INICIO_APURACAO - 1, INICIO_APURACAO)).toBe('abre hoje, 17h');
  });
  it('contagem até a abertura', () => {
    expect(contagemAbertura(FIM_VOTACAO - (2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toMatchObject({ dias: 2, horas: 3, minutos: 4, segundos: 5 });
    expect(contagemAbertura(FIM_VOTACAO + 10)).toMatchObject({ dias: 0, horas: 0, minutos: 0, segundos: 0, ms: 0 });
  });
});

describe('popup do computador', () => {
  it('canto inferior direito, ~360×540, responsivo à altura; aumentar = mais largo e alto', () => {
    const g = geometriaPopup({ largura: 1280, altura: 900 }, 64);
    expect(g).toMatchObject({ largura: 360, altura: 540, right: 1260, bottom: 880, left: 900, top: 340 });
    // janela baixa (até 800 px): no máximo 420 de altura — não toma 3/4 da tela de um notebook
    expect(geometriaPopup({ largura: 1280, altura: 640 }, 64).altura).toBe(POPUP.alturaBaixa);
    expect(geometriaPopup({ largura: 1280, altura: 720 }, 64).altura).toBe(420);
    expect(geometriaPopup({ largura: 1280, altura: 500 }, 64).altura).toBe(500 - 64 - 16 - 20);
    // nunca abaixo do mínimo, mesmo em janela muito baixa (até onde cabe)
    expect(geometriaPopup({ largura: 1024, altura: 300 }, 64).altura).toBe(200);
    expect(geometriaPopup({ largura: 1366, altura: 768 }, 64).altura).toBe(420);
    expect(geometriaPopup({ largura: 1366, altura: 801 }, 64).altura).toBe(540);
    // "aumentar" ignora o teto da janela baixa (a pessoa pediu)
    expect(geometriaPopup({ largura: 1280, altura: 720 }, 64, true).altura).toBe(720 - 64 - 16 - 20);
    const grande = geometriaPopup({ largura: 1920, altura: 1080 }, 64, true);
    expect(grande).toMatchObject({ largura: POPUP.larguraGrande, altura: POPUP.alturaGrande, right: 1896, bottom: 1056 });
    expect(geometriaPopup({ largura: 1440, altura: 900 }, 64, true).altura).toBe(900 - 64 - 16 - 24);
    // pílula da doca minimizada (≥ 1760)
    expect(regiaoPilula({ largura: 1920, altura: 1080 })).toEqual({ left: 1596, top: 1012, right: 1896, bottom: 1056 });
  });
  it('aba recolhida: na margem direita que o conteúdo deixa livre, sem cobrir nada (1024–1759)', () => {
    // conteúdo largo: 32 px de respiro (lg:px-8) até 1440 px; depois, centralizado
    expect(margemConteudo(1024)).toBe(32);
    expect(margemConteudo(1366)).toBe(32);
    expect(margemConteudo(CONTEUDO_LARGO)).toBe(32);
    expect(margemConteudo(1536)).toBe(80);
    expect(margemConteudo(1600)).toBe(112);
    // notebooks comuns (1024–1440): 28 px, a 4 px do conteúdo; com ≥ 48 px de margem, 32 px
    for (const w of [1024, 1280, 1366, 1440, 1455]) expect(larguraAba(w)).toBe(28);
    for (const w of [1472, 1536, 1600, 1759]) expect(larguraAba(w)).toBe(32);
    // nunca passa da margem (sempre ≥ 4 px de folga) nem fica ilegível
    for (let w = 1024; w < LARGURA_MIN_DOCA; w++) {
      expect(larguraAba(w)).toBeLessThanOrEqual(margemConteudo(w) - 4);
      expect(larguraAba(w)).toBeGreaterThanOrEqual(28);
    }
    // numa margem menor (hipotética), encolhe só ali — sempre a 4 px do conteúdo — e nunca abaixo de 20 px
    expect(larguraAbaNaMargem(32)).toBe(28);
    expect(larguraAbaNaMargem(30)).toBe(26);
    expect(larguraAbaNaMargem(26)).toBe(22);
    expect(larguraAbaNaMargem(12)).toBe(20);
    expect(larguraAbaNaMargem(47)).toBe(28);
    expect(larguraAbaNaMargem(48)).toBe(32);
  });
  it('histerese: ocupa na hora, libera só com folga e depois da espera', () => {
    const d = (ocupada: boolean, perto: boolean, naFolga: boolean, primeira = false) => decidirOcupacao({ ocupada, perto, naFolga, primeira });
    // um bloco a menos do respiro: ocupa, esteja como estiver
    expect(d(false, true, true)).toBe('ocupa');
    expect(d(true, true, true)).toBe('ocupa');
    // livre e o bloco só na faixa da histerese: continua livre (o popup aberto não se recolhe à toa)
    expect(d(false, false, true)).toBe('livre');
    expect(d(false, false, false)).toBe('livre');
    // ocupada e o bloco ainda na faixa da histerese: continua ocupada (o popup não pisca na borda do bloco)
    expect(d(true, false, true)).toBe('ocupa');
    // ocupada e livre com folga: espera para liberar
    expect(d(true, false, false)).toBe('espera');
    // 1ª medição: vale só o respiro (o popup nasce aberto com a área livre), sem espera
    expect(d(true, false, true, true)).toBe('livre');
    expect(d(true, true, true, true)).toBe('ocupa');
    expect(HISTERESE_POPUP).toBeGreaterThanOrEqual(4);
    expect(HISTERESE_POPUP).toBeLessThanOrEqual(16);
    expect(ESPERA_REABRIR_MS).toBeGreaterThanOrEqual(300);
    expect(ESPERA_REABRIR_MS).toBeLessThanOrEqual(1000);
  });
  it('canto sempre ocupado só na ficha do candidato (a /anuncie é demonstração: o popup abre lá)', () => {
    for (const p of ['/candidato/280002551544', '/candidato/280002551544/', '/candidato']) expect(cantoSempreOcupado(p), p).toBe(true);
    for (const p of ['/', '/anuncie', '/apuracao', '/palpite', '/candidatos', '/sobre']) expect(cantoSempreOcupado(p), p).toBe(false);
  });
  it('respiro: a área vigiada cresce dos quatro lados (popup 16 px; anúncio 48 px)', () => {
    const r = { top: 100, left: 100, right: 200, bottom: 200 };
    expect(inflar(r, RESPIRO_POPUP)).toEqual({ top: 84, left: 84, right: 216, bottom: 216 });
    expect(RESPIRO_ANUNCIO).toBe(48);
    // um bloco a 10 px do popup: sem respiro não cruzaria; com respiro, recolhe
    const bloco = { top: 100, left: 210, right: 400, bottom: 200 };
    expect(cruza(bloco, r)).toBe(false);
    expect(cruza(bloco, inflar(r, RESPIRO_POPUP))).toBe(true);
    // a faixa do anúncio fica no topo da caixa (abaixo do cabeçalho da sala)
    expect(regiaoAnuncioSala({ top: 340, left: 900, right: 1260, bottom: 880 })).toEqual({ top: 396, bottom: 460, left: 900, right: 1260 });
  });
  it('doca só em janela larga (a página espremida não muda de cara)', () => {
    expect(LARGURA_MIN_DOCA - LARGURA_DOCA).toBeGreaterThanOrEqual(1360);
    expect(modoComputador(1920)).toBe('doca');
    expect(modoComputador(LARGURA_MIN_DOCA)).toBe('doca');
    expect(modoComputador(LARGURA_MIN_DOCA - 1)).toBe('popup');
    expect(modoComputador(1280)).toBe('popup');
    expect(geometriaDoca({ largura: 1920, altura: 1080 }, 64)).toEqual({ top: 64, bottom: 1080, right: 1920, left: 1920 - LARGURA_DOCA });
  });
  it('cruza só com área de verdade', () => {
    const r = { top: 100, left: 100, right: 200, bottom: 200 };
    expect(cruza({ top: 150, left: 150, right: 300, bottom: 300 }, r)).toBe(true);
    expect(cruza({ top: 200, left: 100, right: 200, bottom: 300 }, r)).toBe(false); // só encosta
    expect(cruza({ top: 0, left: 0, right: 0, bottom: 0 }, r)).toBe(false); // elemento escondido
  });
  it('preferência: padrão aberto com a sala aberta; lembrada; escolha com a sala fechada não vale quando ela abre', () => {
    expect(lerPrefGuardada('1')).toBe('aberto');
    expect(lerPrefGuardada('0')).toBe('minimizado');
    expect(lerPrefGuardada(null)).toBeNull();
    expect(lerPrefGuardada('x')).toBeNull();
    expect(prefEfetiva({ sessao: null, guardada: null, aberta: true })).toBe('aberto');
    expect(prefEfetiva({ sessao: null, guardada: 'minimizado', aberta: true })).toBe('minimizado');
    expect(prefEfetiva({ sessao: null, guardada: 'aberto', aberta: false })).toBe('minimizado');
    expect(prefEfetiva({ sessao: { pref: 'aberto', aberta: false }, guardada: null, aberta: false })).toBe('aberto');
    // abriu para ver a contagem e minimizou; às 19h a sala abre: vale o padrão (aberto)
    expect(prefEfetiva({ sessao: { pref: 'minimizado', aberta: false }, guardada: null, aberta: true })).toBe('aberto');
    expect(prefEfetiva({ sessao: { pref: 'minimizado', aberta: true }, guardada: 'aberto', aberta: true })).toBe('minimizado');
  });
  it('recolhe sozinho perto de candidato, salvo interação em curso ou recente', () => {
    const base = { pref: 'aberto' as const, ocupada: false, interagindo: false, msDesdeInteracao: Number.POSITIVE_INFINITY };
    expect(popupAberto(base)).toBe(true);
    expect(popupAberto({ ...base, pref: 'minimizado' })).toBe(false);
    // em cima de bloco com candidato, sem ninguém mexer: recolhe
    expect(popupAberto({ ...base, ocupada: true })).toBe(false);
    // mouse em cima: fica (a página mudou por baixo dele, não rolou)
    expect(popupAberto({ ...base, ocupada: true, interagindo: true })).toBe(true);
    // acabou de mexer (mouse saiu, tecla digitada): fica a folga (curta) e depois recolhe
    expect(popupAberto({ ...base, ocupada: true, msDesdeInteracao: GRACA_INTERACAO_MS - 1 })).toBe(true);
    expect(popupAberto({ ...base, ocupada: true, msDesdeInteracao: GRACA_INTERACAO_MS })).toBe(false);
    expect(GRACA_INTERACAO_MS).toBeLessThanOrEqual(3000);
  });
  it('a página rolou com a área ocupada: recolhe na hora, mesmo com o foco no campo ou o mouse em cima', () => {
    const base = { pref: 'aberto' as const, ocupada: true, interagindo: false, msDesdeInteracao: Number.POSITIVE_INFINITY };
    // digitou há 1 s, tirou o mouse e rolou a página com a roda: o bloco que entrou é visto — recolhe (o foco no campo
    // não conta como interação; o rascunho fica guardado)
    expect(popupAberto({ ...base, msDesdeInteracao: 1000 })).toBe(true);
    expect(popupAberto({ ...base, msDesdeInteracao: 1000, paginaRolou: true })).toBe(false);
    // a página andou depois da última mexida mesmo com o mouse parado em cima (teclado, rolagem programada): recolhe
    expect(popupAberto({ ...base, interagindo: true, paginaRolou: true })).toBe(false);
    // área livre: rolar não recolhe nada
    expect(popupAberto({ ...base, ocupada: false, paginaRolou: true })).toBe(true);
    // minimizado continua minimizado
    expect(popupAberto({ ...base, pref: 'minimizado', ocupada: false })).toBe(false);
  });
  it('rolando, a área vigiada cresce na direção de onde os blocos vêm', () => {
    const r = { top: 300, left: 900, right: 1300, bottom: 760 };
    expect(antecipar(r, 0)).toEqual(r);
    // para baixo: os blocos sobem pelo pé da tela — a área desce (4× o passo, entre o mínimo e o máximo)
    expect(antecipar(r, 10)).toEqual({ ...r, bottom: 760 + ANTECIPA_MIN_PX });
    expect(antecipar(r, 40)).toEqual({ ...r, bottom: 760 + 160 });
    expect(antecipar(r, 900)).toEqual({ ...r, bottom: 760 + ANTECIPA_MAX_PX });
    // para cima: os blocos descem pelo topo — a área sobe
    expect(antecipar(r, -30)).toEqual({ ...r, top: 300 - 120 });
    expect(antecipar(r, -5000)).toEqual({ ...r, top: 300 - ANTECIPA_MAX_PX });
    expect(antecipar(r, Number.NaN)).toEqual(r);
  });
  it('rolando, só reabre com o caminho à frente livre por ~0,7 s na velocidade atual (sem abre-e-fecha)', () => {
    expect(alcanceReabrir(0)).toBe(0);
    expect(alcanceReabrir(-1)).toBe(0);
    expect(alcanceReabrir(Number.NaN)).toBe(0);
    // lendo devagar (0,3 px/ms ≈ 300 px/s): ~210 px à frente; roda rápida (1,7 px/ms): ~1.190 px; acima disso, o teto
    expect(alcanceReabrir(0.3)).toBe(210);
    expect(alcanceReabrir(1.7)).toBe(1190);
    expect(alcanceReabrir(5)).toBe(ALCANCE_MAX_PX);
    const r = { top: 300, left: 900, right: 1300, bottom: 760 };
    expect(estender(r, 1, 500)).toEqual({ ...r, bottom: 1260 });
    expect(estender(r, -1, 500)).toEqual({ ...r, top: -200 });
    expect(estender(r, 0, 500)).toEqual(r);
    expect(estender(r, 1, 0)).toEqual(r);
  });
  it('barra de rolagem clássica: a área vigiada usa a largura útil (a régua do position: fixed)', () => {
    // Windows, 1366 px com barra de 15 px: clientWidth = 1351
    const tela = reguaFixa({ largura: 1366, altura: 768, util: 1351 });
    expect(tela).toEqual({ largura: 1351, altura: 768 });
    const g = geometriaPopup(tela, 64);
    // o popup real (right: 20 px da borda útil) termina em 1331 — a área vigiada também
    expect(g.right).toBe(1331);
    expect(inflar(g, RESPIRO_POPUP).right).toBe(1347);
    expect(regiaoPilula(reguaFixa({ largura: 1920, altura: 1080, util: 1903 })).right).toBe(1903 - 24);
    expect(geometriaDoca(reguaFixa({ largura: 1920, altura: 1080, util: 1903 }), 64)).toMatchObject({ right: 1903, left: 1903 - LARGURA_DOCA });
    // sem barra (ou sem medida), a largura da janela
    expect(reguaFixa({ largura: 1366, altura: 768, util: 1366 }).largura).toBe(1366);
    expect(reguaFixa({ largura: 1366, altura: 768 }).largura).toBe(1366);
    expect(reguaFixa({ largura: 1366, altura: 768, util: 0 }).largura).toBe(1366);
  });
  it('pedido para abrir com o canto em cima de candidato: folha central (nunca por cima de um lado só do placar)', () => {
    expect(ondeAbrir(false)).toBe('canto');
    expect(ondeAbrir(true)).toBe('central');
  });
});

describe('rotas com o chat flutuante', () => {
  it('todas as páginas do site menos /ao-vivo, o Teste Cego e o Duelo', () => {
    for (const p of ['/', '/apuracao', '/apuracao/sp', '/apuracao/sp/71072', '/governadores', '/palpite', '/candidato/123', '/privacidade', '/streamers', '/cenarios', '/anuncie'])
      expect(chatNaRota(p)).toBe(true);
    for (const p of ['/ao-vivo', '/ao-vivo/', '/teste', '/teste/resultado', '/duelo/abc']) expect(chatNaRota(p)).toBe(false);
    // só o começo do caminho decide
    expect(chatNaRota('/curiosidades/teste')).toBe(true);
  });
});

describe('utilidades', () => {
  it('token aleatório no formato aceito pelo servidor', () => {
    const t = gerarToken((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it('pessoas na sala', () => {
    expect(textoPessoasSala(null)).toBeNull();
    expect(textoPessoasSala(0)).toBeNull();
    expect(textoPessoasSala(1)).toBe('1 pessoa na sala');
    expect(textoPessoasSala(7)).toBe('7 na sala');
    expect(textoPessoasSala(840)).toBe('≈ 840 na sala');
    expect(textoPessoasSala(12_300)).toMatch(/^≈ 12,3\smil na sala$/);
  });
  it('rotas com a sala', () => {
    expect(paginaDaSala('/apuracao')).toBe('nacional');
    expect(paginaDaSala('/apuracao/')).toBe('nacional');
    expect(paginaDaSala('/apuracao/sp')).toBe('uf');
    expect(paginaDaSala('/apuracao/consulta')).toBeNull();
    expect(paginaDaSala('/apuracao/sp/71072')).toBeNull();
    expect(paginaDaSala('/')).toBeNull();
  });
});

describe('alturaFolhaCelular', () => {
  it('começa logo abaixo da linha dos % do placar (conferência: 360×740 e 375×667 com a lista sem mensagem inteira)', () => {
    expect(alturaFolhaCelular(740, 342)).toBe(398);
    expect(alturaFolhaCelular(667, 280)).toBe(387);
  });
  it('nunca passa de 58% da tela nem de 560 px', () => {
    expect(alturaFolhaCelular(844, 200)).toBe(490);
    expect(alturaFolhaCelular(1100, 100)).toBe(560);
  });
  it('nunca fica abaixo de 300 px (a lista some) e, sem placar na tela, usa a altura de sempre', () => {
    expect(alturaFolhaCelular(740, 600)).toBe(300);
    expect(alturaFolhaCelular(740, null)).toBe(429);
    expect(alturaFolhaCelular(500, 450)).toBe(290);
  });
});
