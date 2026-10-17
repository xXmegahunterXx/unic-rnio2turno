import { describe, expect, it } from 'vitest';
import type { Candidate, Race, Summary } from './types';
import { INICIO_APURACAO } from './constants';
import {
  DOMINIO_TEXTO_PADRAO,
  INICIO_DIA_VOTACAO,
  TEXTO_PLACAR,
  cabecalhoTexto,
  comandoBot,
  diaDeVotacaoAntesDas17,
  lerConsultaTexto,
  mensagemTimer,
  tempoQueFalta,
  textoPlacarBot,
  ufDoTexto,
  urlTextoPlacar,
  type EntradaTextoPlacar,
} from './texto-placar';

const cand = (numero: number, nomeUrna: string, partido: string, cor: Candidate['cor']): Candidate => ({ numero, nomeUrna, nome: nomeUrna, partido, cor });
const PRES: Race = {
  id: 'pres',
  cargo: 'Presidente',
  turno: 2,
  abrangencia: 'BR',
  titulo: 'Presidente',
  candidatos: [cand(13, 'Lula', 'PT', 'vermelho'), cand(22, 'Flávio Bolsonaro', 'PL', 'azul')],
  ufs: [],
  tse: { ciclo: '', eleicao: '', cargo: '', pleito: '' },
};
const GOV_TO: Race = {
  ...PRES,
  id: 'gov-to',
  cargo: 'Governador',
  abrangencia: 'TO',
  titulo: 'Governador · Tocantins',
  candidatos: [cand(44, 'Profª Dorinha', 'UNIÃO', 'a'), cand(45, 'Vicentinho Júnior', 'PSDB', 'b')],
};
/** Ordem da urna invertida no array (para provar que o texto ordena pelo número). */
const PRES_INVERTIDA: Race = { ...PRES, candidatos: [PRES.candidatos[1], PRES.candidatos[0]] };

const resumo = (p: Partial<Summary> = {}): Summary => ({
  secoes: 1000,
  secoesTotalizadas: 632,
  eleitorado: 0,
  eleitoradoTotalizado: 0,
  comparecimento: 0,
  abstencao: 0,
  votos: [5012, 4988],
  brancos: 0,
  nulos: 0,
  status: 'apurando',
  lider: 0,
  eleito: null,
  ultimaAtualizacao: Date.UTC(2026, 9, 25, 21, 47, 12),
  ...p,
});

const NOITE = Date.UTC(2026, 9, 25, 21, 50); // 18:50 de Brasília
const ANTES = Date.UTC(2026, 9, 17, 15, 0); // 17/10, 12h de Brasília

const status = (p: Partial<NonNullable<EntradaTextoPlacar['status']>> = {}): NonNullable<EntradaTextoPlacar['status']> => ({
  fase: 'apurando',
  simulacao: false,
  anonimizado: false,
  simNow: NOITE,
  inicioApuracao: INICIO_APURACAO,
  ...p,
});

const entrada = (p: Partial<EntradaTextoPlacar> = {}): EntradaTextoPlacar => ({
  agora: NOITE,
  ligado: true,
  dominio: 'sintonia2026.com.br',
  status: status(),
  race: PRES,
  uf: null,
  resumo: resumo(),
  ...p,
});

/** Termos de torcida/projeção que nunca podem aparecer (a mesma união usada nas descrições do servidor). */
const PROIBIDAS = /vai ganhar|vitória|esmagador|derrota|virou o jogo|lavada|surra|favorito|torcida|imbat|vence|ganh|lidera|previs/i;
const NOMES = /Lula|Flávio|Bolsonaro|Dorinha|Vicentinho|Candidato [AB]|PT\b|PL\b/;

function conferir(t: string) {
  expect(t.length).toBeLessThanOrEqual(TEXTO_PLACAR.max);
  expect(t).not.toMatch(PROIBIDAS);
  expect(t).not.toMatch(/undefined|NaN|null|\$\{|\n/);
  expect(t).toContain('sintonia2026.com.br');
}

describe('consulta (?race= e ?uf=)', () => {
  it('UF por sigla ou nome, com ou sem acento; inválido = Brasil', () => {
    expect(ufDoTexto('pe')).toBe('PE');
    expect(ufDoTexto('PE')).toBe('PE');
    expect(ufDoTexto('Pernambuco')).toBe('PE');
    expect(ufDoTexto('sao paulo')).toBe('SP');
    expect(ufDoTexto('São Paulo')).toBe('SP');
    expect(ufDoTexto('sao-paulo')).toBe('SP');
    expect(ufDoTexto('em São Paulo')).toBe('SP');
    expect(ufDoTexto('rio grande do sul')).toBe('RS');
    expect(ufDoTexto('Mato Grosso do Sul')).toBe('MS');
    expect(ufDoTexto('mato grosso')).toBe('MT');
    expect(ufDoTexto('Brasília')).toBe('DF');
    expect(ufDoTexto('exterior')).toBe('ZZ');
    for (const x of ['', 'brasil', 'BR', 'xx', 'lol123', 'qualquer coisa', null, undefined, 'a'.repeat(500)]) expect(ufDoTexto(x), String(x)).toBeNull();
  });

  it('race: Presidente por padrão; governador só nas UFs do 2º turno', () => {
    expect(lerConsultaTexto(null, null)).toEqual({ race: 'pres', uf: null });
    expect(lerConsultaTexto('pres', 'sp')).toEqual({ race: 'pres', uf: 'SP' });
    expect(lerConsultaTexto('PRES', 'xx')).toEqual({ race: 'pres', uf: null });
    expect(lerConsultaTexto('gov-df', 'sp')).toEqual({ race: 'gov-df', uf: null });
    expect(lerConsultaTexto('gov-sp', 'sp')).toEqual({ race: 'pres', uf: 'SP' });
    expect(lerConsultaTexto('gov-rj', null)).toEqual({ race: 'pres', uf: null });
    // o público digitou "governador df" depois do comando
    expect(lerConsultaTexto('pres', 'governador df')).toEqual({ race: 'gov-df', uf: null });
    expect(lerConsultaTexto(null, 'gov Tocantins')).toEqual({ race: 'gov-to', uf: null });
    // sem 2º turno de governador na UF: Presidente naquela UF
    expect(lerConsultaTexto(null, 'governador sp')).toEqual({ race: 'pres', uf: 'SP' });
  });
});

describe('fases e horários', () => {
  it('chave desligada: só o endereço', () => {
    expect(textoPlacarBot(entrada({ ligado: false }))).toBe('sintonia2026.com.br');
    expect(textoPlacarBot(entrada({ ligado: false, dominio: '' }))).toBe(DOMINIO_TEXTO_PADRAO);
  });

  it('dia da votação, de 0h às 17h (relógio real): nenhum nome nem número, nem na simulação', () => {
    expect(diaDeVotacaoAntesDas17(INICIO_DIA_VOTACAO - 1)).toBe(false);
    expect(diaDeVotacaoAntesDas17(INICIO_DIA_VOTACAO)).toBe(true);
    expect(diaDeVotacaoAntesDas17(INICIO_APURACAO - 1)).toBe(true);
    expect(diaDeVotacaoAntesDas17(INICIO_APURACAO)).toBe(false);
    for (const agora of [INICIO_DIA_VOTACAO, INICIO_DIA_VOTACAO + 9 * 3_600_000, INICIO_APURACAO - 1000]) {
      for (const st of [status(), status({ simulacao: true }), status({ simulacao: true, anonimizado: true }), status({ fase: 'pre' })]) {
        const t = textoPlacarBot(entrada({ agora, status: st }));
        conferir(t);
        expect(t).not.toMatch(NOMES);
        expect(t).not.toMatch(/%/);
        expect(t).toMatch(/começa hoje, às 17h/);
      }
    }
  });

  it('antes da apuração: contagem regressiva, sem nomes', () => {
    const t = textoPlacarBot(entrada({ agora: ANTES, status: status({ fase: 'pre', simNow: ANTES }) }));
    conferir(t);
    expect(t).not.toMatch(NOMES);
    expect(t).toBe('Presidente · 2º turno: a apuração começa em 25/10, às 17h (horário de Brasília). Faltam 8 dias e 5 h. Acompanhe seção por seção: sintonia2026.com.br');
    // sem status (servidor subindo): o relógio real
    expect(textoPlacarBot(entrada({ agora: ANTES, status: null }))).toContain('Faltam 8 dias e 5 h.');
    // UF e governador no cabeçalho, ainda sem nomes
    const pe = textoPlacarBot(entrada({ agora: ANTES, uf: 'PE', status: status({ fase: 'pre', simNow: ANTES }) }));
    expect(pe).toMatch(/^Presidente · Pernambuco · 2º turno: /);
    const to = textoPlacarBot(entrada({ agora: ANTES, race: GOV_TO, status: status({ fase: 'pre', simNow: ANTES }) }));
    expect(to).toMatch(/^Governador · Tocantins · 2º turno: /);
    expect(to).not.toMatch(NOMES);
  });

  it('tempo que falta', () => {
    expect(tempoQueFalta(8 * 86_400_000 + 5 * 3_600_000 + 59_000)).toBe('8 dias e 5 h');
    expect(tempoQueFalta(86_400_000)).toBe('1 dia');
    expect(tempoQueFalta(3 * 3_600_000 + 12 * 60_000)).toBe('3 h 12 min');
    expect(tempoQueFalta(12 * 60_000 + 5000)).toBe('12 min');
    expect(tempoQueFalta(30_000)).toBe('menos de 1 min');
    expect(tempoQueFalta(-5)).toBe('menos de 1 min');
  });
});

describe('placar', () => {
  it('ordem da urna, mesmo formato para os dois, sem "lidera"; cabe no chat do YouTube', () => {
    const t = textoPlacarBot(entrada());
    conferir(t);
    expect(t.length).toBeLessThanOrEqual(TEXTO_PLACAR.alvo);
    expect(t).toBe(
      'Presidente · 2º turno: Lula (PT) 50,12% × Flávio Bolsonaro (PL) 49,88% dos votos válidos, com 63,20% das seções totalizadas. Dado das 18:47 (Brasília). Acompanhe seção por seção: sintonia2026.com.br',
    );
    // o array em outra ordem não muda o texto (a ordem é a do número na urna)
    expect(textoPlacarBot(entrada({ race: PRES_INVERTIDA, resumo: resumo({ votos: [4988, 5012] }) }))).toBe(t);
    // com o outro à frente, o formato é o mesmo (só os números trocam)
    const t2 = textoPlacarBot(entrada({ resumo: resumo({ votos: [4988, 5012], lider: 1 }) }));
    expect(t2.indexOf('Lula')).toBeLessThan(t2.indexOf('Flávio'));
    expect(t2.replace(/\d+,\d+%/g, 'X')).toBe(t.replace(/\d+,\d+%/g, 'X'));
  });

  it('Presidente numa UF: nunca "eleito"', () => {
    const t = textoPlacarBot(entrada({ uf: 'PE', resumo: resumo({ eleito: 0, status: 'encerrada', secoesTotalizadas: 1000 }) }));
    conferir(t);
    expect(t).toMatch(/^Presidente · Pernambuco · 2º turno, apuração encerrada: Lula \(PT\) 50,12% × Flávio Bolsonaro \(PL\) 49,88%/);
    expect(t).not.toMatch(/eleito/);
  });

  it('resultado definido: texto neutro (Presidente "eleito"; governador sem flexão de gênero)', () => {
    const mat = textoPlacarBot(entrada({ resumo: resumo({ eleito: 1, votos: [40, 60] }) }));
    conferir(mat);
    expect(mat).toContain('Flávio Bolsonaro está matematicamente eleito presidente.');
    const fim = textoPlacarBot(entrada({ resumo: resumo({ eleito: 0, status: 'encerrada', secoesTotalizadas: 1000 }) }));
    conferir(fim);
    expect(fim).toContain('apuração encerrada');
    expect(fim).toContain('Lula é eleito presidente.');
    expect(fim).not.toMatch(/Dado das/);
    const gov = textoPlacarBot(entrada({ race: GOV_TO, resumo: resumo({ eleito: 0 }) }));
    conferir(gov);
    expect(gov).toMatch(/^Governador · Tocantins · 2º turno: Profª Dorinha( \(UNIÃO\))? 50,12% × Vicentinho Júnior( \(PSDB\))? 49,88%/);
    expect(gov.length).toBeLessThanOrEqual(TEXTO_PLACAR.alvo);
    expect(gov).toContain('Resultado matematicamente definido para Profª Dorinha.');
    expect(gov).not.toMatch(/eleit/);
  });

  it('sem votos ou sem dados: nenhum nome', () => {
    for (const e of [entrada({ resumo: resumo({ votos: [0, 0], secoesTotalizadas: 0 }) }), entrada({ resumo: null }), entrada({ race: null })]) {
      const t = textoPlacarBot(e);
      conferir(t);
      expect(t).not.toMatch(NOMES);
    }
  });

  it('simulação: "[SIMULAÇÃO]" na frente e SEMPRE Candidato A/B sem partido (mesmo com os nomes reais no painel)', () => {
    const s = textoPlacarBot(entrada({ status: status({ simulacao: true }) }));
    conferir(s);
    expect(s).toMatch(/^\[SIMULAÇÃO\] Presidente · 2º turno: Candidato A \d/);
    expect(s).not.toMatch(/Lula|Flávio|Bolsonaro|\(PT\)|\(PL\)/);
    const a = textoPlacarBot(entrada({ status: status({ simulacao: true, anonimizado: true }), resumo: resumo({ eleito: 0 }) }));
    conferir(a);
    expect(a).toMatch(/^\[SIMULAÇÃO\] Presidente · 2º turno: Candidato A 50,12% × Candidato B 49,88%/);
    expect(a).not.toMatch(/Lula|Flávio|Bolsonaro|PT|PL|Simulação\)/);
    // pre simulado: o prefixo também
    expect(textoPlacarBot(entrada({ agora: ANTES, status: status({ simulacao: true, fase: 'pre', simNow: ANTES }) }))).toMatch(/^\[SIMULAÇÃO\] /);
  });

  it('tamanho travado em todas as fases, com nomes longos e domínio longo', () => {
    const longo: Race = { ...GOV_TO, candidatos: [cand(10, 'Nome de Urna Bem Comprido da Silva Souza', 'REPUBLICANOS', 'a'), cand(15, 'Outro Nome de Urna Muito Comprido Junior', 'SOLIDARIEDADE', 'b')] };
    const doms = ['sintonia2026.com.br', 'um-endereco-bem-longo-para-testar.exemplo.com.br'];
    for (const dominio of doms) {
      for (const race of [PRES, GOV_TO, longo]) {
        for (const r of [resumo(), resumo({ eleito: 0 }), resumo({ eleito: 1, status: 'encerrada', secoesTotalizadas: 1000 }), resumo({ votos: [0, 0] }), null]) {
          for (const st of [status(), status({ simulacao: true }), status({ simulacao: true, anonimizado: true }), status({ fase: 'pre', simNow: ANTES }), null]) {
            for (const agora of [ANTES, NOITE, INICIO_DIA_VOTACAO + 1]) {
              const t = textoPlacarBot({ agora, ligado: true, dominio, status: st, race, uf: null, resumo: r });
              expect(t.length, t).toBeLessThanOrEqual(TEXTO_PLACAR.max);
              expect(t).not.toMatch(PROIBIDAS);
              expect(t).toContain(dominio);
            }
          }
        }
      }
    }
  });

  it('cabeçalho', () => {
    expect(cabecalhoTexto(PRES, null)).toBe('Presidente · 2º turno');
    expect(cabecalhoTexto(PRES, 'ZZ')).toBe('Presidente · Exterior · 2º turno');
    expect(cabecalhoTexto(GOV_TO, 'SP')).toBe('Governador · Tocantins · 2º turno');
    expect(cabecalhoTexto(null, null)).toBe('Presidente · 2º turno');
  });
});

describe('comandos prontos (/streamers)', () => {
  const site = 'https://sintonia2026.com.br/';
  it('Nightbot: o público escolhe o estado; estado fixo quando pedido', () => {
    expect(comandoBot('nightbot', site)).toEqual({
      chat: '!addcom !apuracao $(urlfetch https://sintonia2026.com.br/api/texto/placar?uf=$(querystring))',
      resposta: '$(urlfetch https://sintonia2026.com.br/api/texto/placar?uf=$(querystring))',
    });
    expect(comandoBot('nightbot', site, { uf: 'PE' }).chat).toBe('!addcom !apuracao $(urlfetch https://sintonia2026.com.br/api/texto/placar?uf=pe)');
    expect(comandoBot('nightbot', site, { race: 'gov-df' }).chat).toBe('!addcom !apuracao $(urlfetch https://sintonia2026.com.br/api/texto/placar?race=gov-df)');
  });
  it('StreamElements e Fossabot', () => {
    expect(comandoBot('streamelements', site)).toEqual({
      chat: '!command add !apuracao ${customapi.https://sintonia2026.com.br/api/texto/placar}',
      resposta: '${customapi.https://sintonia2026.com.br/api/texto/placar}',
    });
    expect(comandoBot('fossabot', site, { uf: 'SP' })).toEqual({ resposta: '$(customapi https://sintonia2026.com.br/api/texto/placar?uf=sp)' });
  });
  it('timers e endereços', () => {
    expect(mensagemTimer('nightbot', site)).toBe('$(urlfetch https://sintonia2026.com.br/api/texto/placar)');
    expect(mensagemTimer('streamelements', site, { uf: 'DF' })).toBe('${customapi.https://sintonia2026.com.br/api/texto/placar?uf=df}');
    expect(mensagemTimer('fossabot', site, { race: 'gov-am' })).toBe('$(customapi https://sintonia2026.com.br/api/texto/placar?race=gov-am)');
    expect(urlTextoPlacar('https://x.org', { uf: 'ZZ' })).toBe('https://x.org/api/texto/placar?uf=zz');
    // governador sem 2º turno e UF com governador: o endereço sai como o servidor vai ler
    expect(urlTextoPlacar('https://x.org', { race: 'gov-sp' })).toBe('https://x.org/api/texto/placar');
    expect(urlTextoPlacar('https://x.org', { race: 'gov-df', uf: 'SP' })).toBe('https://x.org/api/texto/placar?race=gov-df');
  });
});
