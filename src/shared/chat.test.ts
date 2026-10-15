import { describe, expect, it } from 'vitest';
import {
  DIA_ELEICAO_17H,
  DIA_ELEICAO_INICIO,
  arredondarPessoasSala,
  avaliarApelido,
  avaliarTexto,
  bloqueioDiaEleicao,
  chaveDuplicada,
  limparTexto,
  prepararExcecoes,
  prepararNomesApelido,
  temOfensa,
  tokenValido,
} from './chat';

const motivo = (t: string, o?: Parameters<typeof avaliarTexto>[1]) => {
  const r = avaliarTexto(t, o);
  return 'ok' in r ? 'ok' : r.motivo;
};

describe('chat: texto comum passa', () => {
  it.each([
    'Lula passou na frente em SP',
    'Flávio Bolsonaro virou no Sul',
    'Tá bom. Com 60% já dá pra ver',
    'Flávio tem 56.104.503 votos no 1º turno',
    'Diferença de 2.048.464 votos',
    'São Paulo 55%',
    'bom dia, cadê o resultado do RN?',
    'picanha no churrasco enquanto apura',
    'acabei de chegar, enviado do celular',
    '🔥🔥🔥',
    'Piranhas (AL) já fechou',
  ])('%s', (t) => expect(motivo(t)).toBe('ok'));
});

describe('chat: limpeza', () => {
  it('encurta repetições e tira a CAIXA ALTA', () => {
    expect(limparTexto('kkkkkkkkkkkkk que noite')).toBe('kkkk que noite');
    expect(limparTexto('QUE NOITE INCRÍVEL GALERA')).toBe('Que noite incrível galera');
    expect(limparTexto('SP e RJ')).toBe('SP e RJ'); // sigla curta não é gritaria
    expect(limparTexto('a​b‮c  d')).toBe('abc d');
  });
  it('vazio, só espaço ou longo demais', () => {
    expect(motivo('   ')).toBe('vazia');
    expect(motivo('...')).toBe('vazia');
    expect(motivo('abcd'.repeat(35) + 'a')).toBe('longa');
    expect(motivo('abcd'.repeat(35))).toBe('ok');
    expect(motivo('a'.repeat(400))).toBe('ok'); // repetição encurtada antes de medir ("aaaa")
  });
  it('mesma palavra repetida (flood)', () => {
    expect(motivo('lula lula lula lula')).toBe('repeticao');
    expect(motivo('vai vai vai vai')).toBe('repeticao');
  });
});

describe('chat: links e dados pessoais', () => {
  it.each(['acesse meusite.com', 'meusite ponto com', 'www.x.com', 'veja em site [.] com', 'https://a.b', 'me segue @fulano', 'entra t.me/grupo', 'bit.ly/abc'])('link: %s', (t) =>
    expect(motivo(t)).toBe('link'),
  );
  it.each(['me chama 11 98765-4321', '11987654321', '(21) 99999-0000', 'cpf 123.456.789-09', 'fulano@gmail.com', 'fulano arroba gmail ponto com', '98765-4321'])(
    'dados: %s',
    (t) => expect(motivo(t)).toBe('dados'),
  );
});

describe('chat: ofensas (acentos, leetspeak, letras soltas)', () => {
  it.each(['porra!', 'p0rr4', 'p o r r a', 'P.O.R.R.A', 'pooorrraaa', 'vai tomar no cu', 'filhodaputa', 'que foda', 'seu idiota', 'arrombado', 'c4r4lh0'])('%s', (t) =>
    expect(motivo(t)).toBe('ofensa'),
  );
  it.each(['vou te matar', 'tem que morrer', 'morte ao fulano', 'intervenção militar já', 'vamos fuzilar esses'])('ameaça: %s', (t) =>
    expect(motivo(t)).toBe('ofensa'),
  );
  it('preconceito', () => {
    for (const t of ['seu macaco', 'viado', 'bicha']) expect(motivo(t)).toBe('ofensa');
  });
  it('não pega palavras inocentes que contêm um termo', () => {
    for (const t of ['enviado', 'picanha', 'computador', 'Santa Catarina', 'republicano', 'agora', 'cuidado', 'escuta']) expect(temOfensa(t)).toBe(false);
  });
});

describe('chat: neutralidade (os dois lados têm o mesmo tratamento)', () => {
  const pares: [string, string, string][] = [
    ['vote 13', 'vote 22', 'propaganda'],
    ['vote no Lula', 'vote no Flávio', 'propaganda'],
    ['Lula 13', 'Flávio 22', 'propaganda'],
    ['#Lula13', '#Bolsonaro22', 'propaganda'],
    ['fora Lula', 'fora Bolsonaro', 'propaganda'],
    ['fora PT', 'fora PL', 'propaganda'],
    ['é 13', 'é 22', 'propaganda'],
    ['Lula lá', 'Bolsonaro sim', 'propaganda'],
    ['sou petista', 'sou bolsonarista', 'propaganda'],
    ['seu gado', 'seu mortadela', 'ofensa'],
    ['petralha', 'bolsominion', 'ofensa'],
    ['luladrão', 'bozo', 'ofensa'],
    ['cachaceiro', 'miliciano', 'ofensa'],
    ['esquerdopata', 'bolsonazi', 'ofensa'],
    ['Lula ladrão', 'Flávio ladrão', 'ofensa'],
  ];
  it.each(pares)('%s × %s', (a, b, m) => {
    expect(motivo(a)).toBe(m);
    expect(motivo(b)).toBe(m);
  });
  it('reação usada como enquete é barrada (os dois lados)', () => {
    for (const t of ['manda 🔥 se é Lula', 'reage com palmas quem é Flávio', '13 = 👏', '22 → 🔥', '🔥 pra Lula', '👏 se for 22']) expect(motivo(t), t).toBe('propaganda');
    for (const t of ['que noite 🔥🔥', 'Lula subiu em SP 😮', '😮 Flávio virou no Sul', '👀 no Nordeste']) expect(motivo(t), t).toBe('ok');
  });
  it('fraude nas urnas (desinformação sobre o processo) é barrada para todos', () => {
    for (const t of ['urna fraudada!', 'teve fraude', 'roubaram a eleição', 'eleição roubada', 'urnas hackeadas']) expect(motivo(t)).toBe('fraude');
  });
});

describe('chat: nomes de município não são ofensa', () => {
  const exc = prepararExcecoes(['Gado Bravo', 'Ponta Porã', 'Anta Gorda', 'São Paulo', 'Cunha Porã']);
  it('prepara só os que precisam', () => {
    expect(exc).toEqual(expect.arrayContaining(['gado bravo', 'ponta pora', 'anta gorda', 'cunha pora']));
    expect(exc).not.toContain('sao paulo');
  });
  it('a frase do município passa; a palavra solta continua barrada', () => {
    expect(motivo('Gado Bravo já apurou tudo', { excecoes: exc })).toBe('ok');
    expect(motivo('Ponta Porã 100%', { excecoes: exc })).toBe('ok');
    expect(motivo('Ponta Porã é porra', { excecoes: exc })).toBe('ofensa');
    expect(motivo('seu gado', { excecoes: exc })).toBe('ofensa');
  });
});

describe('chat: apelido', () => {
  const ok = (a: string, nomes?: string[]) => 'ok' in avaliarApelido(a, nomes);
  it('aceita apelidos comuns', () => {
    for (const a of ['Ana', 'Tiago S.', 'Bia_SP', "D'Ávila", 'ana2013', 'João Pedro']) expect(ok(a)).toBe(true);
  });
  it('tamanho e caracteres', () => {
    for (const a of ['x', 'a'.repeat(21), '<b>oi</b>', '  ', '__']) expect(ok(a)).toBe(false);
  });
  it('sem candidato, partido, número de urna, moderação ou link', () => {
    for (const a of ['Lula fan', 'bolsonaro2026', 'PT de coração', 'pl', 'Petista raiz', 'joao22', 'Maria_13', 'Moderador', 'TSE oficial', 'site.com', 'Fulano Gado'])
      expect(ok(a), a).toBe(false);
  });
  it('nomes do dataset (passados pelo servidor)', () => {
    const nomes = prepararNomesApelido(['Omar Aziz', 'Celina Leão']);
    expect(ok('Celina Leão', nomes)).toBe(false);
    expect(ok('omaraziz', nomes)).toBe(false);
    expect(ok('Celina', nomes)).toBe(true); // nome próprio comum, sozinho, continua permitido
  });
});

describe('chat: letras de outros alfabetos, largura cheia e disfarces (achados da revisão)', () => {
  const ok = (a: string) => 'ok' in avaliarApelido(a);
  it('apelido não personifica TSE, moderação, o site ou candidato com letra parecida', () => {
    // E/а/Е/а cirílicos, fullwidth, leet, letras soltas e compacto
    for (const a of ['TSЕ', 'Moderаdor', 'Sintoniа', 'Аdmin', 'Lulа', 'ＴＳＥ', 'M0derador', 'Moder4dor', 'JusticaEleitoral', 'm o d e r a d o r', 'tseoficial', 'TSE_oficial', 'Juiz Eleitoral', 'Admın', 'Flаvio Bolsonaro', 'Treze', 'vintedois'])
      expect(ok(a), a).toBe(false);
  });
  it('apelido aceita só o nosso alfabeto (com acentos), sem misturar com outros', () => {
    for (const a of ['João', 'Ângela M.', 'Łukasz', 'Conceição', 'Zé_da_Silva']) expect(ok(a), a).toBe(true);
    for (const a of ['Иван', 'Ελένη', 'Anаlu' /* a cirílico no meio */, 'ana١٣']) expect(ok(a), a).toBe(false);
  });
  it('nomes dos finalistas tratados igual (pares)', () => {
    const pares: [string, string, boolean][] = [
      ['Lula', 'Flávio Bolsonaro', false],
      ['Lula da Silva', 'Bolsonaro', false],
      ['Luiz Inácio', 'Jair Bolsonaro', false],
      ['Janja', 'Michelle Bolsonaro', false],
      ['Geraldo Alckmin', 'Alfredo Gaspar', false],
      ['Luiz', 'Flávio', true],
      ['Inácio', 'Jair', true],
      ['Rosângela', 'Michelle', true],
    ];
    for (const [x, y, esperado] of pares) {
      expect(ok(x), x).toBe(esperado);
      expect(ok(y), y).toBe(esperado);
    }
  });
  it('ofensa com letra de outro alfabeto, largura cheia, versalete ou número partido', () => {
    for (const t of ['pоrra', 'ＰＯＲＲＡ', 'pᴏrra', 'p0 rra', 'po rr4']) expect(motivo(t), t).toBe('ofensa');
  });
  it('fraude com leet, letras repetidas, letras soltas e erro de grafia', () => {
    for (const t of ['fr4ude', 'fraaaude', 'f r a u d e', 'urna h4ckeada', 'eleicao robada', 'frаude', 'o TSE manipulou', 'urnas não são auditáveis'])
      expect(motivo(t), t).toBe('fraude');
    for (const t of ['as urnas são auditadas', 'o TSE divulgou o boletim', 'resultado saiu']) expect(motivo(t), t).toBe('ok');
  });
  it('link com espaço antes do ponto, ponto de outra largura, vírgula ou letras largas', () => {
    for (const t of ['acesse golpe . com', 'acesse golpe .com', 'acesse golpe．com', 'acesse golpe。com', 'acesse golpe,com', 'golpe,com,br', 'golpe,net', 'acesse ｇｏｌｐｅ.com'])
      expect(motivo(t), t).toBe('link');
    for (const t of ['Tá bom. Com 60% já dá pra ver', 'foi bom,com certeza', 'terminou. Com 99% das urnas']) expect(motivo(t), t).toBe('ok');
  });
  it('propaganda com leet e slogans dos dois lados (pares)', () => {
    const pares: [string, string][] = [
      ['v0te 13', 'v0te 22'],
      ['faz o L', 'faz arminha'],
      ['#elenao', '#elesim'],
      ['#foralula', '#foraflavio'],
      ['Lulа presidente', 'Flаvio presidente'],
      ['L13', 'B22'],
      ['13 13 13', '22, 22, 22'],
      ['vai 13!', 'vai 22!'],
    ];
    for (const [x, y] of pares) {
      expect(motivo(x), x).toBe('propaganda');
      expect(motivo(y), y).toBe('propaganda');
    }
    // horário e números soltos continuam passando
    for (const t of ['22:22 e nada do RN', '13% apurado', 'seção 22 da zona 13', 'às 22h sai mais']) expect(motivo(t), t).toBe('ok');
  });
});

describe('chat: utilidades', () => {
  it('token', () => {
    expect(tokenValido('abcdefghijklmnop')).toBe(true);
    expect(tokenValido('curto')).toBe(false);
    expect(tokenValido('com espaço aqui 123456')).toBe(false);
    expect(tokenValido(123)).toBe(false);
  });
  it('duplicada ignora caixa, acento e pontuação', () => {
    expect(chaveDuplicada('Que noite!!!')).toBe(chaveDuplicada('que noite'));
  });
  it('dia da eleição: sem mensagens de 0h às 17h de Brasília', () => {
    expect(bloqueioDiaEleicao(DIA_ELEICAO_INICIO - 1)).toBeNull();
    expect(bloqueioDiaEleicao(DIA_ELEICAO_INICIO)).toMatch(/17h/);
    expect(bloqueioDiaEleicao(DIA_ELEICAO_17H - 1)).toMatch(/17h/);
    expect(bloqueioDiaEleicao(DIA_ELEICAO_17H)).toBeNull();
  });
  it('pessoas arredondadas', () => {
    expect(arredondarPessoasSala(7)).toBe(7);
    expect(arredondarPessoasSala(843)).toBe(840);
    expect(arredondarPessoasSala(12_345)).toBe(12_300);
  });
});
