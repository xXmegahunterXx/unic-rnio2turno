/**
 * Desafio do palpite entre amigos (sem dinheiro): link (ida e volta, link cortado, lixo), apelido (mesmos cuidados do
 * chat), armazenamento só no aparelho, inclusão (prazo, cheio, o próprio link), ranking com empates e — o principal —
 * NADA de número de palpite nem agregado antes do resultado oficial.
 */
import { describe, expect, it } from 'vitest';
import { pesoTextoX } from '@/app/lib/share';
import { LIMITE_TEXTO } from '@/app/components/share/textos';
import { FIM_PALPITES, type Armazenamento, type ResultadoOficial } from './nucleo';
import {
  CAMINHO_DESAFIO,
  CHAVE_DESAFIO,
  DESAFIO_VAZIO,
  EPOCA_DESAFIO,
  MAX_PARTICIPANTES,
  SEM_DINHEIRO,
  apagarDesafio,
  avisoInclusao,
  caminhoDesafio,
  codificarDesafio,
  decodificarDesafio,
  definirEu,
  desafioDoHash,
  euParticipante,
  gravarDesafio,
  hashDesafioInvalido,
  incluirParticipante,
  lerDesafio,
  novoIdDesafio,
  ordemAlfabetica,
  ranking,
  removerParticipante,
  textoConviteDesafio,
  textoRankingDesafio,
  validarApelidoDesafio,
  visaoDesafio,
  type EstadoDesafio,
  type ItemLista,
  type Participante,
} from './desafio';

const mem = (): Armazenamento & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

const T0 = Date.UTC(2026, 9, 20, 15, 7, 0); // 20/10, 12h07 de Brasília
const P = (apelido: string, a: number, em = T0, id = novoIdDesafio()): Participante => ({ id, apelido, a, em });
const final = (pct0: number, pctSecoes = 100): ResultadoOficial => ({ pct0, pctSecoes, final: true });

describe('link de desafio (depois do #)', () => {
  it('ida e volta: id, palpite, minuto e apelido (com acento e espaço)', () => {
    for (const apelido of ['Ana', 'João Pedro', 'Zé', 'Maria-Clara_2', 'Ângela Müller', 'Tia Lúcia da Silva']) {
      for (const a of [300, 437, 500, 504, 700]) {
        const p = P(apelido, a);
        const c = codificarDesafio(p)!;
        expect(c, apelido).toMatch(/^1[0-9a-z]{13}[A-Za-z0-9_-]+$/);
        expect(decodificarDesafio(c)).toEqual(p);
        expect(desafioDoHash(`#${c}`)).toEqual(p);
      }
    }
  });
  it('o minuto é arredondado para baixo; segundos não viajam', () => {
    const p = P('Ana', 512, T0 + 42_123);
    expect(decodificarDesafio(codificarDesafio(p))!.em).toBe(T0);
  });
  it('caminho: /palpite/desafio + o código só depois do "#"', () => {
    const p = P('Ana', 512);
    const c = caminhoDesafio(p)!;
    expect(c.split('#')[0]).toBe(CAMINHO_DESAFIO);
    expect(c.split('#')[1]).toBe(codificarDesafio(p));
    // nada do palpite nem do apelido antes do "#" (a parte que chega ao servidor)
    expect(c.split('#')[0]).not.toMatch(/Ana|512/);
  });
  it('link cortado, alterado ou de outra versão é recusado (conferência)', () => {
    const c = codificarDesafio(P('Bruno', 512))!;
    expect(decodificarDesafio(c.slice(0, -1))).toBeNull();
    expect(decodificarDesafio(c.slice(0, 12))).toBeNull();
    expect(decodificarDesafio(`2${c.slice(1)}`)).toBeNull();
    // palpite trocado à mão ("e0" → "e1"): a conferência não bate
    const trocado = c.slice(0, 6) + (c[6] === 'e' ? 'f' : 'e') + c.slice(7);
    expect(decodificarDesafio(trocado)).toBeNull();
    for (const x of ['', '#', 'abc', '1e0', null, undefined, '1'.repeat(200), '<script>', 'javascript:alert(1)']) {
      expect(decodificarDesafio(x as string)).toBeNull();
    }
    expect(hashDesafioInvalido('')).toBe(false);
    expect(hashDesafioInvalido(`#${c}`)).toBe(false);
    expect(hashDesafioInvalido(`#${c.slice(0, -2)}`)).toBe(true);
  });
  it('recusa palpite fora dos limites e horário fora do intervalo (antes da época ou depois do prazo)', () => {
    expect(codificarDesafio(P('Ana', 299))).toBeNull();
    expect(codificarDesafio(P('Ana', 701))).toBeNull();
    expect(codificarDesafio(P('Ana', 500, EPOCA_DESAFIO - 60_000))).toBeNull();
    expect(codificarDesafio(P('Ana', 500, FIM_PALPITES))).toBeNull();
    expect(codificarDesafio(P('Ana', 500, FIM_PALPITES - 60_000))).not.toBeNull();
    expect(codificarDesafio({ ...P('Ana', 500), id: 'ABCDE' })).toBeNull();
  });
  it('apelido inválido não vira link, nem forjado à mão', () => {
    expect(codificarDesafio(P('Lula da Silva', 500))).toBeNull();
    expect(codificarDesafio(P('www.site.com', 500))).toBeNull();
    // forjar: corpo válido com o apelido "Bolsonaro" em base64url e a conferência recalculada não passa no filtro
    const ok = codificarDesafio(P('Ana', 500))!;
    const nome = Buffer.from('Bolsonaro', 'utf8').toString('base64url');
    const corpo = ok.slice(1, 12);
    let h = 0x811c9dc5;
    for (const ch of `1${corpo}${nome}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193);
    }
    const soma = ((h >>> 0) % 1296).toString(36).padStart(2, '0');
    expect(decodificarDesafio(`1${corpo}${soma}${nome}`)).toBeNull();
    // o mesmo forjado com um apelido comum passa (prova de que a recusa acima é do filtro, não da conferência)
    const nome2 = Buffer.from('Carla', 'utf8').toString('base64url');
    let h2 = 0x811c9dc5;
    for (const ch of `1${corpo}${nome2}`) {
      h2 ^= ch.charCodeAt(0);
      h2 = Math.imul(h2, 0x01000193);
    }
    expect(decodificarDesafio(`1${corpo}${((h2 >>> 0) % 1296).toString(36).padStart(2, '0')}${nome2}`)?.apelido).toBe('Carla');
  });
  it('id: 5 caracteres base 36', () => {
    expect(novoIdDesafio(() => 0)).toBe('00000');
    expect(novoIdDesafio(() => 0.999999999)).toBe('zzzzz');
    for (let i = 0; i < 50; i++) expect(novoIdDesafio()).toMatch(/^[0-9a-z]{5}$/);
  });
});

describe('apelido (mesmos cuidados do chat)', () => {
  it('2 a 20 caracteres, letras do nosso alfabeto', () => {
    expect(validarApelidoDesafio('Ana')).toEqual({ ok: 'Ana' });
    expect(validarApelidoDesafio('  Ana   Paula ')).toEqual({ ok: 'Ana Paula' });
    expect(validarApelidoDesafio('A')).toHaveProperty('erro');
    expect(validarApelidoDesafio('A'.repeat(21))).toHaveProperty('erro');
    expect(validarApelidoDesafio('ТSЕ')).toHaveProperty('erro'); // letras cirílicas
    expect(validarApelidoDesafio(42)).toHaveProperty('erro');
  });
  it('sem fraude nas urnas nem nome de finalista disfarçado (o apelido vira o título "X te desafiou") — simétrico', () => {
    const nomes = ['Lula', 'Luiz Inácio Lula da Silva', 'Flávio Bolsonaro'];
    for (const ruim of ['Urna fraudada', 'Fraude', 'Eleição roubada', 'Iula', 'FIávio Bolsonaro', 'L u l a', 'B o l s o n a r o', '1ula', 'B0lsonar0', 'Lu la', 'Fla vio Bolso', 'Lulão', 'Bolso', 'Coxinha', 'Mortadela', 'Inelegível', 'Presidiário']) {
      expect(validarApelidoDesafio(ruim, nomes), ruim).toHaveProperty('erro');
    }
    // e o link forjado com um desses apelidos não abre
    expect(codificarDesafio(P('Urna fraudada', 500), nomes)).toBeNull();
    expect(codificarDesafio(P('Iula', 500), nomes)).toBeNull();
    for (const bom of ['Talula', 'Tia Lu', 'Ivo', 'Isa']) expect(validarApelidoDesafio(bom, nomes), bom).toEqual({ ok: bom });
  });
  it('sem link, telefone, candidato, partido, número de urna, nome reservado ou palavrão — simétrico', () => {
    for (const ruim of ['ana.com.br', 'meusite.net', 'ana@mail', '11987654321', 'Lula', 'Bolsonaro', 'Flavio Bolsonaro', 'Luiz Inacio', 'PT', 'PL', 'joao13', 'ana_22', 'Moderador', 'Sintonia', 'TSE oficial', 'porra']) {
      expect(validarApelidoDesafio(ruim), ruim).toHaveProperty('erro');
    }
    // nomes do dataset entram pelo parâmetro (ex.: o nome completo de urna)
    expect(validarApelidoDesafio('Fulano Candidato', ['Fulano Candidato'])).toHaveProperty('erro');
    expect(validarApelidoDesafio('Fulano Candidato')).toEqual({ ok: 'Fulano Candidato' });
    // primeiros nomes comuns continuam valendo para os dois lados
    expect(validarApelidoDesafio('Luiz')).toEqual({ ok: 'Luiz' });
    expect(validarApelidoDesafio('Flávio')).toEqual({ ok: 'Flávio' });
  });
});

describe('armazenamento (só no aparelho)', () => {
  it('grava e lê; ignora formato desconhecido, entradas inválidas e repetidas', () => {
    const arm = mem();
    expect(lerDesafio(arm)).toEqual(DESAFIO_VAZIO);
    const ana = { ...P('Ana', 512), recebidoEm: T0 + 1 };
    const e: EstadoDesafio = { eu: { id: 'aaaaa', apelido: 'Eu Mesmo' }, participantes: [ana] };
    expect(gravarDesafio(e, arm)).toBe(true);
    expect(lerDesafio(arm)).toEqual(e);
    const salvo = JSON.parse(arm.m.get(CHAVE_DESAFIO)!);
    // só apelido, id sorteado, palpite e horários (nada de IP, telefone, conta)
    expect(Object.keys(salvo).sort()).toEqual(['eu', 'p', 'v']);
    expect(Object.keys(salvo.p[0]).sort()).toEqual(['a', 'em', 'id', 'n', 'r']);
    salvo.p.push({ id: 'bbbbb', n: 'Lula', a: 500, em: T0, r: T0 }, { id: ana.id, n: 'Repetida', a: 500, em: T0, r: T0 }, { id: 'ccccc', n: 'Fora', a: 999, em: T0, r: T0 }, null);
    arm.setItem(CHAVE_DESAFIO, JSON.stringify(salvo));
    expect(lerDesafio(arm).participantes.map((p) => p.apelido)).toEqual(['Ana']);
    arm.setItem(CHAVE_DESAFIO, '{"v":2}');
    expect(lerDesafio(arm)).toEqual(DESAFIO_VAZIO);
    arm.setItem(CHAVE_DESAFIO, 'não é json');
    expect(lerDesafio(arm)).toEqual(DESAFIO_VAZIO);
    // vazio = nada guardado; "apagar" limpa
    gravarDesafio(e, arm);
    apagarDesafio(arm);
    expect(arm.m.has(CHAVE_DESAFIO)).toBe(false);
    gravarDesafio(e, arm);
    gravarDesafio(DESAFIO_VAZIO, arm);
    expect(arm.m.has(CHAVE_DESAFIO)).toBe(false);
  });
  it('a chave começa com "sintonia:" (entra no "Apagar meus dados")', () => {
    expect(CHAVE_DESAFIO.startsWith('sintonia:')).toBe(true);
    expect(CHAVE_DESAFIO.startsWith('sintonia:admin')).toBe(false);
  });
  it('armazenamento bloqueado não quebra', () => {
    const quebrado: Armazenamento = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cota');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(lerDesafio(quebrado)).toEqual(DESAFIO_VAZIO);
    expect(gravarDesafio({ eu: { id: 'aaaaa', apelido: 'Ana' }, participantes: [] }, quebrado)).toBe(false);
    expect(() => apagarDesafio(quebrado)).not.toThrow();
    expect(lerDesafio(null)).toEqual(DESAFIO_VAZIO);
  });
});

describe('abrir um link de desafio', () => {
  const antes = FIM_PALPITES - 3_600_000;
  const depois = FIM_PALPITES + 3_600_000;
  it('novo, igual, atualizado (palpite mais recente), antigo e o próprio link', () => {
    const eu = definirEu(DESAFIO_VAZIO, 'Eu', 'eeeee');
    const ana = P('Ana', 512, T0, 'aaaaa');
    let r = incluirParticipante(eu, ana, antes);
    expect(r.resultado).toBe('novo');
    expect(r.estado.participantes[0]).toMatchObject({ ...ana, recebidoEm: antes });
    expect(incluirParticipante(r.estado, ana, antes).resultado).toBe('igual');
    r = incluirParticipante(r.estado, { ...ana, a: 530, em: T0 + 600_000 }, antes + 1);
    expect(r.resultado).toBe('atualizado');
    expect(r.estado.participantes[0]).toMatchObject({ a: 530, recebidoEm: antes });
    expect(incluirParticipante(r.estado, ana, antes).resultado).toBe('antigo');
    expect(incluirParticipante(r.estado, P('Eu', 500, T0, 'eeeee'), antes).resultado).toBe('eu');
  });
  it('depois do prazo, quem já estava não muda; quem chega entra com a marca de atraso', () => {
    const ana = P('Ana', 512, T0, 'aaaaa');
    const { estado } = incluirParticipante(DESAFIO_VAZIO, ana, antes);
    const r = incluirParticipante(estado, { ...ana, a: 700, em: FIM_PALPITES - 60_000 }, depois);
    expect(r.resultado).toBe('prazo');
    expect(r.estado.participantes[0].a).toBe(512);
    const bia = incluirParticipante(estado, P('Bia', 480, T0, 'bbbbb'), depois);
    expect(bia.resultado).toBe('novo');
    const v = visaoDesafio(bia.estado, null, null);
    expect(v.itens.find((x) => x.apelido === 'Bia')!.tarde).toBe(true);
    expect(v.itens.find((x) => x.apelido === 'Ana')!.tarde).toBe(false);
  });
  it(`no máximo ${MAX_PARTICIPANTES} participantes; dá para remover alguém`, () => {
    let e: EstadoDesafio = DESAFIO_VAZIO;
    const nomes = 'Ana Bia Caio Davi Edu Fabi Gabi Hugo Iara Juca Kiko Lia Malu Nina Otto Paulo Quim Rafa Sami Teo Ugo Vivi Wil Xande Yara Zeca Alice Bruna Cadu Dani Elis'.split(' ');
    for (const [i, n] of nomes.entries()) e = incluirParticipante(e, P(n, 500, T0, `p${String(i).padStart(4, '0')}`), antes).estado;
    expect(e.participantes).toHaveLength(MAX_PARTICIPANTES);
    expect(incluirParticipante(e, P('Extra', 500), antes).resultado).toBe('cheio');
    e = removerParticipante(e, 'p0000');
    expect(e.participantes).toHaveLength(MAX_PARTICIPANTES - 1);
    expect(incluirParticipante(e, P('Extra', 500), antes).resultado).toBe('novo');
  });
  it('trocar de apelido mantém o id (quem tem o link é atualizado); o próprio id nunca fica na lista', () => {
    let e = definirEu(DESAFIO_VAZIO, 'Ana', 'aaaaa');
    e = definirEu(e, 'Ana Paula');
    expect(e.eu).toEqual({ id: 'aaaaa', apelido: 'Ana Paula' });
    expect(euParticipante(e, { a: 512, em: T0 + 59_000 })).toEqual({ id: 'aaaaa', apelido: 'Ana Paula', a: 512, em: T0 });
    expect(euParticipante(e, null)).toBeNull();
    expect(euParticipante(DESAFIO_VAZIO, { a: 512, em: T0 })).toBeNull();
  });
  it('quem só recebeu o link é convidado a cravar (não "entrou no seu desafio")', () => {
    expect(avisoInclusao('novo', 'Ana', false, false).texto).toBe('Ana está no seu desafio neste aparelho. Crave o seu palpite e mande o seu link de volta.');
    expect(avisoInclusao('novo', 'Ana', false, true).texto).toContain('Ana entrou no seu desafio');
  });
  it('avisos neutros (sem gênero, sem valor)', () => {
    for (const r of ['novo', 'atualizado', 'igual', 'antigo', 'eu', 'cheio', 'prazo'] as const) {
      const a = avisoInclusao(r, 'Ana', false);
      expect(a.texto.length).toBeGreaterThan(10);
      expect(a.texto).not.toMatch(/\bdel[ae]\b|\bel[ae]\b/);
    }
  });
});

describe('antes do resultado oficial: NADA de número de palpite nem agregado (Lei 9.504/97, art. 33, § 5º)', () => {
  const montar = () => {
    let e = definirEu(DESAFIO_VAZIO, 'Eu', 'eeeee');
    for (const [n, a, id] of [
      ['Carla', 520, 'ccccc'],
      ['ana', 480, 'aaaaa'],
      ['Bruno', 610, 'bbbbb'],
      ['Ângela', 350, 'ddddd'],
    ] as const)
      e = incluirParticipante(e, P(n, a, T0, id), T0).estado;
    return e;
  };
  it('lista em ordem alfabética, com quem cravou e quando — sem o palpite de ninguém', () => {
    const v = visaoDesafio(montar(), { a: 505, em: T0 }, null);
    expect(v.tipo).toBe('lista');
    expect(v.itens.map((x) => x.apelido)).toEqual(['ana', 'Ângela', 'Bruno', 'Carla', 'Eu']);
    for (const x of v.itens) {
      expect(Object.keys(x).sort()).toEqual(['apelido', 'cravouEm', 'eu', 'id', 'tarde']);
      expect(x).not.toHaveProperty('a');
      expect(x).not.toHaveProperty('erro');
    }
    // nenhum dos números (palpites e percentuais) aparece no que a lista expõe
    const json = JSON.stringify(v);
    for (const n of ['520', '480', '610', '350', '505', '52,0', '48,0', '61,0', '35,0']) expect(json).not.toContain(n);
    expect(json).not.toMatch(/total|soma|media|contagem|lado/i);
  });
  it('apuração parcial (mesmo oficial) ainda é lista; simulação e ausência de resultado também', () => {
    expect(visaoDesafio(montar(), { a: 505, em: T0 }, { pct0: 50.2, pctSecoes: 63, final: false }).tipo).toBe('lista');
    expect(visaoDesafio(montar(), null, null).tipo).toBe('lista');
  });
  it('a própria pessoa: sem apelido aparece como "" (a tela diz "Você"); sem palpite, cravouEm null', () => {
    const v1 = visaoDesafio(DESAFIO_VAZIO, { a: 500, em: T0 }, null);
    expect(v1.itens).toEqual([{ id: '', apelido: '', eu: true, cravouEm: T0, tarde: false }]);
    const v2 = visaoDesafio(definirEu(DESAFIO_VAZIO, 'Eu', 'eeeee'), null, null);
    expect(v2.itens[0]).toMatchObject({ eu: true, cravouEm: null });
    expect(visaoDesafio(DESAFIO_VAZIO, null, null).itens).toEqual([]);
  });
});

describe('ranking (só com a apuração oficial concluída)', () => {
  const item = (apelido: string, a: number, cravouEm = T0): ItemLista & { a: number; cravouEm: number } => ({ id: apelido.toLowerCase().padEnd(5, 'x').slice(0, 5), apelido, eu: false, cravouEm, tarde: false, a });
  it('quem chegou mais perto primeiro; "na mosca" abaixo de 0,5 p.p.', () => {
    const r = ranking([item('Carla', 470), item('Ana', 504), item('Bruno', 520)], 50.43);
    expect(r.map((x) => [x.apelido, x.posicao, x.erro, x.naMosca])).toEqual([
      ['Ana', 1, 0, true],
      ['Bruno', 2, 1.6, false],
      ['Carla', 3, 3.4, false],
    ]);
  });
  it('mesmo erro: quem cravou antes fica à frente; mesmo erro e mesmo minuto = empate (mesma posição)', () => {
    const r = ranking([item('Bia', 510, T0 + 120_000), item('Caio', 490, T0), item('Duda', 490, T0 + 30_000), item('Eva', 560)], 50);
    expect(r.map((x) => [x.apelido, x.posicao, x.empate])).toEqual([
      ['Caio', 1, true],
      ['Duda', 1, true],
      ['Bia', 3, false],
      ['Eva', 4, false],
    ]);
  });
  it('simétrico: espelhar todos os palpites e o resultado não muda a ordem', () => {
    const base = [item('Ana', 512), item('Bruno', 470, T0 + 60_000), item('Carla', 533)];
    const r1 = ranking(base, 49.6).map((x) => x.apelido);
    const r2 = ranking(base.map((x) => ({ ...x, a: 1000 - x.a })), 50.4).map((x) => x.apelido);
    expect(r2).toEqual(r1);
  });
  it('visão: a própria pessoa entra; sem palpite fica fora do ranking (listada à parte)', () => {
    let e = definirEu(DESAFIO_VAZIO, 'Eu', 'eeeee');
    e = incluirParticipante(e, P('Ana', 512, T0, 'aaaaa'), T0).estado;
    const v = visaoDesafio(e, { a: 499, em: T0 }, final(50));
    expect(v.tipo).toBe('ranking');
    if (v.tipo !== 'ranking') return;
    expect(v.itens.map((x) => [x.apelido, x.posicao, x.eu])).toEqual([
      ['Eu', 1, true],
      ['Ana', 2, false],
    ]);
    const sem = visaoDesafio(e, null, final(50));
    expect(sem.tipo === 'ranking' && sem.foraDoRanking.map((x) => x.apelido)).toEqual(['Eu']);
  });
});

describe('textos do desafio (neutros, sem candidato, sem valor)', () => {
  const PROIBIDAS = /apost|\bbets?\b|bol[ãa]o|pr[êe]mi|valendo|\bpix\b|R\$|reais|grana|ficha/i;
  it('convite: com o apelido, sem nome de candidato, cabe no X', () => {
    const t = textoConviteDesafio('Ana Paula');
    expect(t).toContain('Ana Paula te desafiou');
    expect(t).toContain(SEM_DINHEIRO);
    expect(t).not.toMatch(/Lula|Bolsonaro|Flávio|\b13\b|\b22\b|%/);
    expect(t).not.toMatch(PROIBIDAS);
    expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
    expect(pesoTextoX(textoConviteDesafio('A'.repeat(20)))).toBeLessThanOrEqual(LIMITE_TEXTO);
  });
  it('ranking: posições e diferenças, sem candidato; corta para caber', () => {
    const itens = ranking(
      'Ana Bruno Carla Davi Elisa Fabi Gui'.split(' ').map((n, i) => ({ id: `id00${i}`, apelido: `${n} Sobrenome Longo`.slice(0, 20), eu: false, cravouEm: T0, tarde: false, a: 480 + i * 7 })),
      50.2,
    );
    const t = textoRankingDesafio(itens);
    expect(t).toMatch(/^Ranking do desafio do palpite do 2º turno/);
    expect(t).toContain('1º ');
    expect(t).not.toMatch(/Lula|Bolsonaro|Flávio|%/);
    expect(t).not.toMatch(PROIBIDAS);
    expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
    expect(textoRankingDesafio([])).toContain(SEM_DINHEIRO);
  });
  it('avisos e a marca "sem dinheiro" também passam no filtro de palavras', () => {
    const todos = [SEM_DINHEIRO, ...(['novo', 'atualizado', 'igual', 'antigo', 'eu', 'cheio', 'prazo'] as const).map((r) => avisoInclusao(r, 'Ana', true).texto)].join(' ');
    expect(todos).not.toMatch(PROIBIDAS);
    expect(todos).not.toMatch(/vit[óo]ria|vence|ganh|derrot|favorito/i);
  });
});

describe('ordem alfabética', () => {
  it('pt-BR, sem diferença de caixa e acento', () => {
    expect(ordemAlfabetica([{ id: '1', apelido: 'Érica' }, { id: '2', apelido: 'eduardo' }, { id: '3', apelido: 'Ana' }, { id: '4', apelido: 'ângelo' }]).map((x) => x.apelido)).toEqual([
      'Ana',
      'ângelo',
      'eduardo',
      'Érica',
    ]);
  });
});
