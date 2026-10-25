import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from './constants';
import { FIM_VOTACAO, INICIO_DIA_VOTACAO } from './diaVotacao';
import {
  AVISO_DIA_VOTACAO,
  AVISO_PESQUISAS,
  CARGOS_PESQUISA,
  compararComResultado,
  fasePesquisas,
  fmtConfianca,
  fmtMargem,
  fmtPctPesquisa,
  fmtPeriodoColeta,
  hojeBrasilia,
  idPesquisa,
  informacoesObrigatorias,
  linhaObrigatoria,
  mesclarPesquisas,
  mostrarBlocoPesquisas,
  ordenarPesquisas,
  rotuloCargo,
  seriesPorInstituto,
  ultimaPorInstituto,
  validaPesquisa,
  type ContextoValidacao,
  type Pesquisa,
} from './pesquisas';

// Dados de TESTE (fictícios): nenhum número aqui é de pesquisa real.
const CANDIDATOS: Record<string, number[]> = { pres: [13, 22], 'gov-df': [11, 13], 'gov-to': [44, 45] };
const ctx: ContextoValidacao = { candidatos: (c) => CANDIDATOS[c], hoje: '2026-10-20' };

const base = (o: Partial<Pesquisa> = {}): Record<string, unknown> => ({
  cargo: 'pres',
  instituto: 'Instituto Fictício A',
  contratante: 'Veículo Fictício',
  registro: 'BR-01234/2026',
  coletaInicio: '2026-10-14',
  coletaFim: '2026-10-16',
  divulgadaEm: '2026-10-17',
  entrevistas: 2004,
  margemPp: 2,
  confiancaPct: 95,
  totais: { '13': 45, '22': 44, brancosNulos: 7, indecisos: 4 },
  validos: { '13': 51, '22': 49 },
  fontes: ['https://exemplo.com.br/pesquisa'],
  ...o,
});

const ok = (o: Partial<Pesquisa> = {}, c: ContextoValidacao = ctx) => {
  const r = validaPesquisa(base(o), c);
  if (!('ok' in r)) throw new Error(r.erro);
  return r.ok;
};
const falha = (o: Record<string, unknown>, c: ContextoValidacao = ctx) => {
  const r = validaPesquisa({ ...base(), ...o }, c);
  if ('ok' in r) throw new Error('deveria falhar');
  return r;
};

describe('validaPesquisa — campos obrigatórios da Res. TSE 23.600/2019', () => {
  it('aceita uma pesquisa completa e calcula o id estável', () => {
    const p = ok();
    expect(p.id).toBe(idPesquisa('Instituto Fictício A', 'BR-01234/2026'));
    expect(p.id).toMatch(/^pq-[0-9a-f]{16}$/);
    // mesma pesquisa com caixa/acentos/espaços diferentes no instituto → mesmo id
    expect(idPesquisa('  instituto  ficticio a ', 'br-01234/2026')).toBe(p.id);
    expect(idPesquisa('Instituto Fictício B', 'BR-01234/2026')).not.toBe(p.id);
  });

  it.each(['instituto', 'contratante', 'registro', 'coletaInicio', 'coletaFim', 'divulgadaEm', 'entrevistas', 'margemPp', 'confiancaPct', 'totais', 'fontes'])(
    'exige %s',
    (campo) => {
      const r = falha({ [campo]: undefined });
      expect(r.campo).toBe(campo);
      expect(r.erro.length).toBeGreaterThan(5);
    },
  );

  it('contratante vazio é recusado (o registro do TSE sempre traz quem contratou)', () => {
    expect(falha({ contratante: '   ' }).campo).toBe('contratante');
  });

  it('registro: formato BR-NNNNN/AAAA para Presidente e UF-NNNNN/AAAA para Governador', () => {
    expect(falha({ registro: 'BR-1234/2026' }).campo).toBe('registro');
    expect(falha({ registro: 'BR01234/2026' }).campo).toBe('registro');
    expect(falha({ registro: 'BR-01234/2022' }).campo).toBe('registro');
    expect(falha({ registro: 'DF-01234/2026' }).campo).toBe('registro'); // Presidente com registro estadual
    expect(ok({ registro: 'br-01234/2026' }).registro).toBe('BR-01234/2026');
    const gov = { cargo: 'gov-df', totais: { '11': 40, '13': 38 }, validos: undefined } as Partial<Pesquisa>;
    expect(ok({ ...gov, registro: 'DF-00042/2026' }).registro).toBe('DF-00042/2026');
    expect(falha({ ...gov, registro: 'BR-00042/2026' }).campo).toBe('registro');
    expect(falha({ ...gov, registro: 'GO-00042/2026' }).campo).toBe('registro');
  });

  it('disputa: só Presidente e os governadores do 2º turno', () => {
    expect(CARGOS_PESQUISA).toContain('pres');
    expect(falha({ cargo: 'gov-sp' }).campo).toBe('cargo');
    expect(falha({ cargo: 'pres-t1' }).campo).toBe('cargo');
    expect(rotuloCargo('gov-df')).toBe('Governador · Distrito Federal');
  });

  it('datas coerentes: depois do 1º turno, início ≤ fim ≤ divulgação, nada no futuro', () => {
    expect(falha({ coletaInicio: '2026-10-03' }).campo).toBe('coletaInicio');
    expect(falha({ coletaInicio: '2026-10-17', coletaFim: '2026-10-16' }).campo).toBe('coletaFim');
    expect(falha({ divulgadaEm: '2026-10-15' }).campo).toBe('divulgadaEm');
    expect(falha({ divulgadaEm: '2026-10-21' }).campo).toBe('divulgadaEm'); // hoje = 20/10
    expect(falha({ coletaFim: '2026-10-31', divulgadaEm: '2026-10-31' }, { candidatos: ctx.candidatos }).campo).toBe('divulgadaEm');
    expect(falha({ coletaInicio: '2026-02-30' }).campo).toBe('coletaInicio'); // data que não existe
    expect(falha({ coletaInicio: '14/10/2026' }).campo).toBe('coletaInicio');
    // mesmo dia de coleta e divulgação é aceito
    expect(ok({ coletaInicio: '2026-10-16', coletaFim: '2026-10-16', divulgadaEm: '2026-10-16' }).coletaFim).toBe('2026-10-16');
  });

  it('amostra, margem e confiança dentro do plausível', () => {
    expect(falha({ entrevistas: 12.5 }).campo).toBe('entrevistas');
    expect(falha({ entrevistas: 50 }).campo).toBe('entrevistas');
    expect(falha({ margemPp: 0 }).campo).toBe('margemPp');
    expect(falha({ margemPp: 2.255 }).campo).toBe('margemPp'); // 3 casas: digitação
    expect(falha({ confiancaPct: 50 }).campo).toBe('confiancaPct');
    expect(falha({ confiancaPct: 95.455 }).campo).toBe('confiancaPct');
    expect(ok({ margemPp: 2.2, confiancaPct: 95 }).margemPp).toBe(2.2);
    // como os institutos divulgam: margem de 2,19 pontos e confiança de 95,45%
    const p = ok({ margemPp: 2.19, confiancaPct: 95.45 });
    expect([p.margemPp, p.confiancaPct]).toEqual([2.19, 95.45]);
  });

  it('votos totais: os dois candidatos da disputa, até duas casas decimais, soma ≤ 101,5', () => {
    expect(falha({ totais: { '13': 45 } }).campo).toBe('totais');
    expect(falha({ totais: { '13': 45, '22': 44, '15': 3 } }).campo).toBe('totais');
    expect(falha({ totais: { '13': 45, '45': 44 } }).campo).toBe('totais'); // número que não é da disputa
    expect(falha({ totais: { '13': 45.555, '22': 44 } }).campo).toBe('totais');
    expect(falha({ totais: { '13': 55, '22': 44, brancosNulos: 3 } }).campo).toBe('totais'); // 102%
    expect(falha({ totais: { '13': 45, '22': 44, outros: 3 } }).campo).toBe('totais');
    expect(falha({ totais: { '13': 40, '22': 40, brancosNulos: 5, indecisos: 5 } }).campo).toBe('totais'); // 90% com tudo informado
    // arredondamento do instituto (100,5) passa
    expect(ok({ totais: { '13': 45.5, '22': 44, brancosNulos: 7, indecisos: 4 }, validos: undefined }).totais['13']).toBe(45.5);
    // quatro inteiros arredondados que somam 101 (o instituto avisa) passam; duas casas como divulgado também
    expect(ok({ totais: { '13': 46, '22': 48, brancosNulos: 5, indecisos: 2 }, validos: { '13': 49, '22': 51 } }).totais['22']).toBe(48);
    expect(ok({ totais: { '13': 39.65, '22': 40.95, brancosNulos: 10.56, indecisos: 8.84 }, validos: { '13': 49.19, '22': 50.81 } }).validos).toEqual({ '13': 49.19, '22': 50.81 });
    // sem brancos/indecisos informados: só os dois
    expect(ok({ totais: { '22': 44, '13': 45 }, validos: undefined }).totais).toEqual({ '13': 45, '22': 44 });
  });

  it('votos válidos: opcionais, somam ~100 e batem com os totais (pega candidatos trocados)', () => {
    expect(falha({ validos: { '13': 51, '22': 45 } }).campo).toBe('validos');
    expect(falha({ validos: { '13': 49, '22': 51 } }).campo).toBe('validos'); // trocados
    expect(falha({ validos: { '13': 51, '15': 49 } }).campo).toBe('validos');
    expect(ok({ validos: undefined }).validos).toBeUndefined();
    expect(ok().validos).toEqual({ '13': 51, '22': 49 });
  });

  it('fontes: links https completos, sem repetição', () => {
    expect(falha({ fontes: [] }).campo).toBe('fontes');
    expect(falha({ fontes: ['http://exemplo.com.br/x'] }).campo).toBe('fontes');
    expect(falha({ fontes: ['exemplo.com.br/x'] }).campo).toBe('fontes');
    expect(falha({ fontes: ['https://user:senha@exemplo.com.br/x'] }).campo).toBe('fontes');
    expect(falha({ fontes: ['https://localhost/x'] }).campo).toBe('fontes');
    expect(ok({ fontes: ['https://exemplo.com.br/a', 'https://exemplo.com.br/a'] }).fontes).toHaveLength(1);
  });

  it('textos limpos (sem quebras e espaços repetidos) e nada de marcação', () => {
    expect(ok({ instituto: '  Instituto   Fictício\nA ' }).instituto).toBe('Instituto Fictício A');
    expect(falha({ instituto: '<script>' }).campo).toBe('instituto');
  });

  it('aviso exigido pela Justiça Eleitoral: opcional, texto curto e limpo; entra na linha obrigatória', () => {
    expect(ok().aviso).toBeUndefined();
    expect(ok({ aviso: '   ' }).aviso).toBeUndefined();
    const p = ok({ aviso: '  Todas as perguntas   aplicadas foram estimuladas. ' });
    expect(p.aviso).toBe('Todas as perguntas aplicadas foram estimuladas.');
    expect(linhaObrigatoria(p).endsWith(' · Todas as perguntas aplicadas foram estimuladas')).toBe(true);
    expect(linhaObrigatoria(ok())).not.toContain('estimuladas');
    expect(falha({ aviso: 'x'.repeat(201) }).campo).toBe('aviso');
    expect(falha({ aviso: '<b>' }).campo).toBe('aviso');
    expect(falha({ aviso: 12 }).campo).toBe('aviso');
  });

  it('sem a lista de candidatos (arquivo conferido fora do servidor): aceita dois números quaisquer', () => {
    const r = validaPesquisa(base({ totais: { '13': 45, '22': 44 }, validos: undefined }));
    expect('ok' in r).toBe(true);
  });
});

describe('lista: mesclar, ordenar e séries por instituto', () => {
  const a1 = ok({ instituto: 'Instituto A', registro: 'BR-00001/2026', coletaInicio: '2026-10-08', coletaFim: '2026-10-10', divulgadaEm: '2026-10-11' });
  const a2 = ok({ instituto: 'Instituto A', registro: 'BR-00002/2026', coletaInicio: '2026-10-15', coletaFim: '2026-10-17', divulgadaEm: '2026-10-18' });
  const b1 = ok({ instituto: 'Instituto B', registro: 'BR-00003/2026', coletaInicio: '2026-10-13', coletaFim: '2026-10-14', divulgadaEm: '2026-10-18', validos: undefined });
  const g1 = ok({ cargo: 'gov-df', instituto: 'Instituto C', registro: 'DF-00004/2026', totais: { '11': 40, '13': 38 }, validos: undefined });

  it('mais recente primeiro (divulgação, depois fim da coleta)', () => {
    expect(ordenarPesquisas([a1, b1, a2]).map((p) => p.registro)).toEqual(['BR-00002/2026', 'BR-00003/2026', 'BR-00001/2026']);
  });

  it('semente + painel sem duplicar: o painel vence por id e por registro; removidas saem', () => {
    const editada = { ...a2, entrevistas: 3000 };
    const mesmoRegistro = { ...b1, id: 'outro-id' };
    const m = mesclarPesquisas([a1, a2, b1], [editada, mesmoRegistro], [a1.id]);
    expect(m.map((p) => p.registro)).toEqual(['BR-00002/2026', 'BR-00003/2026']);
    expect(m.find((p) => p.id === a2.id)?.entrevistas).toBe(3000);
    expect(m.find((p) => p.registro === 'BR-00003/2026')?.id).toBe('outro-id');
  });

  it('uma série por instituto, pontos do mais antigo ao mais novo, nunca somadas', () => {
    const s = seriesPorInstituto([a2, b1, a1, g1], 'pres');
    expect(s.map((x) => x.instituto)).toEqual(['Instituto A', 'Instituto B']);
    expect(s[0].pontos.map((p) => p.data)).toEqual(['2026-10-10', '2026-10-17']);
    expect(s[0].pontos[0].valores).toEqual({ 13: 45, 22: 44 });
    // válidos: só quem divulgou
    expect(seriesPorInstituto([a2, b1, a1], 'pres', 'validos').map((x) => x.instituto)).toEqual(['Instituto A']);
    expect(seriesPorInstituto([g1], 'gov-df')[0].pontos[0].valores).toEqual({ 11: 40, 13: 38 });
  });

  it('última de cada instituto (para "Pesquisas × resultado")', () => {
    expect(ultimaPorInstituto([a1, a2, b1, g1], 'pres').map((p) => p.registro)).toEqual(['BR-00002/2026', 'BR-00003/2026']);
  });

  it('comparação com o resultado só com os válidos divulgados (nunca calculados)', () => {
    expect(compararComResultado(b1, { 13: 50.4, 22: 49.6 })).toBeNull();
    expect(compararComResultado(a2, { 13: 50.43, 22: 49.57 })).toEqual([
      { numero: 13, pesquisa: 51, resultado: 50.43, diferencaPp: -0.6 },
      { numero: 22, pesquisa: 49, resultado: 49.57, diferencaPp: 0.6 },
    ]);
  });
});

describe('fases da área', () => {
  const antes = Date.UTC(2026, 9, 20, 15);
  it('lista antes do dia da votação; bloco só na fase pré', () => {
    expect(fasePesquisas({ agora: antes, fase: 'pre', fonte: 'pre' })).toBe('lista');
    expect(mostrarBlocoPesquisas({ agora: antes, fase: 'pre', fonte: 'pre' })).toBe(true);
    expect(mostrarBlocoPesquisas({ agora: antes, fase: 'apurando', fonte: 'simulacao', simulacao: true })).toBe(false);
  });
  it('dia da votação (0h–19h de 25/10, prorrogada): só o aviso; às 19h volta', () => {
    expect(fasePesquisas({ agora: INICIO_DIA_VOTACAO, fase: 'pre' })).toBe('votacao');
    expect(fasePesquisas({ agora: INICIO_APURACAO - 1, fase: 'pre' })).toBe('votacao');
    expect(mostrarBlocoPesquisas({ agora: INICIO_DIA_VOTACAO - 1, fase: 'pre' })).toBe(true);
    expect(mostrarBlocoPesquisas({ agora: INICIO_DIA_VOTACAO, fase: 'pre' })).toBe(false);
    // 17h e 18h: a votação continua (mesmo com a leitura do TSE já ligada)
    expect(fasePesquisas({ agora: INICIO_APURACAO, fase: 'apurando', fonte: 'tse' })).toBe('votacao');
    expect(fasePesquisas({ agora: Date.UTC(2026, 9, 25, 21, 0, 0), fase: 'apurando', fonte: 'tse' })).toBe('votacao');
    expect(fasePesquisas({ agora: FIM_VOTACAO - 1, fase: 'apurando', fonte: 'tse' })).toBe('votacao');
    expect(fasePesquisas({ agora: FIM_VOTACAO, fase: 'apurando', fonte: 'tse' })).toBe('lista');
    // depois do fim da votação o bloco não volta (a home mostra a apuração)
    expect(mostrarBlocoPesquisas({ agora: FIM_VOTACAO + 1, fase: 'pre' })).toBe(false);
    // o aviso cita o fim da votação, sem número nem nome
    expect(AVISO_DIA_VOTACAO).toMatch(/prorrogada até as 19h \(horário de Brasília\)/);
    expect(AVISO_DIA_VOTACAO).not.toMatch(/17h|\d+%/);
  });
  it('resultado oficial só com o TSE concluído, nunca na simulação', () => {
    const depois = INICIO_APURACAO + 4 * 3600_000;
    expect(fasePesquisas({ agora: depois, fase: 'encerrada', fonte: 'tse' })).toBe('resultado');
    expect(fasePesquisas({ agora: depois, fase: 'encerrada', fonte: 'simulacao', simulacao: true })).toBe('lista');
  });
  it('simulação com nomes ocultos: a área não aparece', () => {
    expect(fasePesquisas({ agora: antes, anonimizado: true })).toBe('oculta');
    expect(mostrarBlocoPesquisas({ agora: antes, fase: 'pre', anonimizado: true })).toBe(false);
  });
});

describe('textos', () => {
  const p = ok({ margemPp: 2.2 });
  it('informações obrigatórias, todas e na ordem', () => {
    expect(informacoesObrigatorias(p).map((i) => i.rotulo)).toEqual([
      'Instituto',
      'Contratante',
      'Registro no TSE',
      'Coleta',
      'Entrevistas',
      'Margem de erro',
      'Nível de confiança',
    ]);
    const l = linhaObrigatoria(p);
    for (const t of ['Instituto Fictício A', 'Veículo Fictício', 'BR-01234/2026', '14 a 16/10/2026', '2.004 entrevistas', '2,2 pontos', '95%']) expect(l).toContain(t);
  });
  it('datas e percentuais como o instituto divulgou', () => {
    expect(fmtPeriodoColeta('2026-10-14', '2026-10-16')).toBe('14 a 16/10/2026');
    expect(fmtPeriodoColeta('2026-10-16', '2026-10-16')).toBe('16/10/2026');
    expect(fmtPeriodoColeta('2026-09-30', '2026-10-02', false)).toBe('30/09 a 02/10');
    expect(fmtPctPesquisa(45)).toBe('45%');
    expect(fmtPctPesquisa(45.5)).toBe('45,5%');
    // nunca arredonda o que o instituto publicou
    expect(fmtPctPesquisa(39.65)).toBe('39,65%');
    expect(fmtPctPesquisa(50)).toBe('50%');
    expect(fmtMargem(2.19)).toBe('2,19');
    expect(fmtConfianca(95.45)).toBe('95,45');
    expect(linhaObrigatoria(ok({ margemPp: 2.19, confiancaPct: 95.45 }))).toContain('margem de erro de 2,19 pontos');
    expect(informacoesObrigatorias(ok({ confiancaPct: 95.45 })).at(-1)?.valor).toBe('95,45%');
    expect(hojeBrasilia(Date.UTC(2026, 9, 21, 2, 59))).toBe('2026-10-20'); // 23h59 de 20/10 em Brasília
  });
  it('aviso fixo', () => {
    expect(AVISO_PESQUISAS).toMatch(/registradas no TSE/);
    expect(AVISO_PESQUISAS).toMatch(/não é resultado/);
  });
});
