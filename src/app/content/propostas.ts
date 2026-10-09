/**
 * Conteúdo editorial do Teste Cego — 2º turno da eleição presidencial de 25/10/2026.
 *
 * Candidatos: nº 13 (Lula, PT) × nº 22 (Flávio Bolsonaro, PL). Cada item é uma proposta REAL extraída dos
 * programas de governo registrados no TSE, reescrita numa frase curta, concreta e sem pista de autoria.
 * Fontes, método e itens excluídos estão em `./FONTES.md`.
 *
 * ATENÇÃO (editorial e jurídico):
 * - Todos os itens estão com `revisado: false`. Nada aqui deve ir ao ar sem revisão humana editorial e
 *   jurídica (ver FONTES.md, seção "Antes de publicar").
 * - `autor`, `fonte.titulo` e `fonte.trecho` revelam a autoria: a UI só deve mostrá-los DEPOIS que a pessoa
 *   escolher. Antes disso, exiba apenas `texto` e o rótulo do tema.
 * - Os `id` são neutros de propósito (não indicam o autor) para poderem ir na URL do Duelo.
 * - LGPD: as escolhas da pessoa nunca saem do navegador (ARCHITECTURE.md §1.3).
 */

export type Tema =
  | 'economia'
  | 'impostos'
  | 'trabalho'
  | 'programas-sociais'
  | 'saude'
  | 'educacao'
  | 'seguranca'
  | 'meio-ambiente'
  | 'infraestrutura'
  | 'estado'
  | 'agricultura'
  | 'relacoes-exteriores';

export interface TemaInfo {
  id: Tema;
  rotulo: string;
  /** Emoji neutro, opcional (nenhum associado a partido, bandeira ou campanha). */
  emoji?: string;
}

export interface FonteProposta {
  /** Documento de origem. Revela a autoria: mostre só depois da escolha. */
  titulo: string;
  /** Link do PDF consultado, com âncora de página (`#page=N`). */
  url: string;
  /** Citação literal curta do documento. Use `[…]` para indicar corte. */
  trecho: string;
  /** Página impressa no documento (coincide com a página do PDF) e seção. */
  pagina?: string;
  /** Data de acesso (AAAA-MM-DD). */
  acessadoEm: string;
}

export interface Proposta {
  id: string;
  tema: Tema;
  /** Frase cega e neutra, ≤ 140 caracteres, começando por verbo no infinitivo. */
  texto: string;
  /** Número na urna. */
  autor: 13 | 22;
  fonte: FonteProposta;
  /** `alta`: texto espelha o trecho literal. `media`: exigiu interpretação ou tem sensibilidade editorial. */
  confianca: 'alta' | 'media';
  /** Sempre `false` até a revisão humana editorial/jurídica. */
  revisado: false;
}

/** Ordem de exibição sugerida dos temas. */
export const TEMAS: readonly TemaInfo[] = [
  { id: 'economia', rotulo: 'Economia', emoji: '📈' },
  { id: 'impostos', rotulo: 'Impostos', emoji: '🧾' },
  { id: 'trabalho', rotulo: 'Trabalho e renda', emoji: '💼' },
  { id: 'programas-sociais', rotulo: 'Programas sociais e cuidado', emoji: '🤝' },
  { id: 'saude', rotulo: 'Saúde', emoji: '🩺' },
  { id: 'educacao', rotulo: 'Educação', emoji: '📚' },
  { id: 'seguranca', rotulo: 'Segurança pública', emoji: '🛡️' },
  { id: 'meio-ambiente', rotulo: 'Meio ambiente', emoji: '🌳' },
  { id: 'infraestrutura', rotulo: 'Infraestrutura', emoji: '🛤️' },
  { id: 'estado', rotulo: 'Estado e instituições', emoji: '🏛️' },
  { id: 'agricultura', rotulo: 'Agricultura e campo', emoji: '🌾' },
  { id: 'relacoes-exteriores', rotulo: 'Relações exteriores', emoji: '🌐' },
];

export const TEMA_POR_ID: Readonly<Record<Tema, TemaInfo>> = Object.fromEntries(
  TEMAS.map((t) => [t.id, t]),
) as Record<Tema, TemaInfo>;

/** Documentos primários consultados (cópias integrais dos PDFs registrados no TSE). */
export const DOCUMENTOS = {
  13: {
    titulo: 'Programa de Governo 2026 — Lula (PT), registrado no TSE em 08/08/2026',
    pdf: 'https://static.congressoemfoco.com.br/2026/08/08/attachment/2026/08/08/32ce89_programa_governo_lula_2026.pdf',
    publicadoPor: 'Congresso em Foco',
    paginas: 84,
    sha256: '75e2dab7b9af27454a5c1a44c3bb0d7e0eaddbd1c355ccf1536f0d0be927e47b',
  },
  22: {
    titulo:
      'Para o Brasil vencer o atraso — Diretrizes do Plano de Governo 2027-2030, Flávio Bolsonaro (PL), registrado no TSE',
    pdf: 'https://static.poder360.com.br/uploads/2026/08/plano-flavio.pdf',
    publicadoPor: 'Poder360',
    paginas: 76,
    sha256: 'a65ece32fba45e2bd13ca4f799872a8e78a492e16b5375fcd0e3756f4b77e5a4',
  },
  /** Página oficial do TSE que reúne os planos (inacessível a partir do ambiente de pesquisa; ver FONTES.md). */
  paginaOficialTse:
    'https://www.tse.jus.br/eleicoes/eleicoes-2026-content/propostas-de-governo-dos-candidatos-ao-cargo-de-presidente-da-republica-eleicoes-2026',
} as const;

const ACESSO = '2026-10-09';

function fonte13(pagina: number, secao: string, trecho: string): FonteProposta {
  return {
    titulo: `${DOCUMENTOS[13].titulo} (cópia integral publicada pelo ${DOCUMENTOS[13].publicadoPor})`,
    url: `${DOCUMENTOS[13].pdf}#page=${pagina}`,
    trecho,
    pagina: `p. ${pagina} · ${secao}`,
    acessadoEm: ACESSO,
  };
}

function fonte22(pagina: number, secao: string, trecho: string): FonteProposta {
  return {
    titulo: `${DOCUMENTOS[22].titulo} (cópia integral publicada pelo ${DOCUMENTOS[22].publicadoPor})`,
    url: `${DOCUMENTOS[22].pdf}#page=${pagina}`,
    trecho,
    pagina: `p. ${pagina} · ${secao}`,
    acessadoEm: ACESSO,
  };
}

/**
 * 24 propostas: 12 temas × 1 proposta de cada candidato.
 * Os sufixos -1/-2 dos ids foram distribuídos de forma mista e não indicam o autor.
 */
export const PROPOSTAS: readonly Proposta[] = [
  // ── Economia ────────────────────────────────────────────────────────────────
  {
    id: 'eco-1',
    tema: 'economia',
    texto: 'Retomar o programa nacional de desestatização, avaliando caso a caso onde a presença do Estado deixou de fazer sentido.',
    autor: 22,
    fonte: fonte22(
      70,
      'Brasil que Não Volta Atrás — Enxugar a máquina e profissionalizar a gestão pública',
      'E vamos retomar o Programa Nacional de Desestatização com critério, avaliando caso a caso onde a presença do Estado deixou de fazer sentido.',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'eco-2',
    tema: 'economia',
    texto: 'Fazer a petroleira estatal voltar ao segmento de distribuição de combustíveis e expandir sua capacidade de refino.',
    autor: 13,
    fonte: fonte13(
      67,
      'Diretriz 10 — Ampliar a segurança energética e liderar a transição para uma economia de baixo carbono',
      'A Petrobras deverá retornar ao segmento de distribuição de combustíveis, expandindo sua capacidade de refino',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Impostos ────────────────────────────────────────────────────────────────
  {
    id: 'imp-1',
    tema: 'impostos',
    texto: 'Usar o imposto seletivo da reforma tributária para desestimular o consumo de produtos nocivos à saúde.',
    autor: 13,
    fonte: fonte13(
      59,
      'Diretriz 9 — Segurança alimentar e produção agrícola',
      'Ao regulamentar a reforma tributária, vamos, por meio do Imposto Seletivo, desestimular produtos nocivos à saúde.',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'imp-2',
    tema: 'impostos',
    texto: 'Rever a reforma tributária do consumo para reduzir a alíquota do novo IVA, projetada entre as mais altas do mundo.',
    autor: 22,
    fonte: fonte22(
      30,
      'Brasil Mais Barato — Menos imposto no que você consome (repetido na p. 71-72)',
      'Vamos promover a revisão e o redimensionamento da reforma tributária em curso […] Vamos corrigir suas distorções, reduzir o IVA, hoje projetado num dos patamares mais altos do mundo',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Trabalho e renda ────────────────────────────────────────────────────────
  {
    id: 'trb-1',
    tema: 'trabalho',
    texto: 'Permitir que trabalhador e empresa combinem diretamente as condições de trabalho, dentro da lei, em vez de uma regra única.',
    autor: 22,
    fonte: fonte22(
      44,
      'Brasil que Prospera — Trabalho que compensa',
      'Por isso defendemos o negociado sobre o legislado, ou seja, permitir que trabalhador e empresa combinem diretamente as condições de trabalho que funcionam para os dois, dentro da lei, em vez de seguir uma regra única imposta a todos.',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'trb-2',
    tema: 'trabalho',
    texto: 'Defender no Congresso o fim da escala 6x1 e a jornada de 40 horas semanais, sem redução de salário.',
    autor: 13,
    fonte: fonte13(
      75,
      'Diretriz 12 — Valorizar o trabalho em suas múltiplas formas',
      'Manteremos nossa ação junto ao Senado Federal para assegurar o fim da escala 6x1 e a redução da jornada de trabalho para 40 horas, sem redução salarial',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Programas sociais e cuidado ─────────────────────────────────────────────
  {
    id: 'soc-1',
    tema: 'programas-sociais',
    texto: 'Dar à família sem vaga em creche pública um voucher para a rede privada credenciada, até surgir a vaga pública.',
    autor: 22,
    fonte: fonte22(
      21,
      'Brasil por Elas — Creche garantida para toda criança',
      'Onde não houver vaga na rede pública, a família receberá um voucher-creche para acesso à rede privada credenciada até a vaga pública surgir',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'soc-2',
    tema: 'programas-sociais',
    texto: 'Apoiar espaços de acolhida para crianças de 3 a 12 anos que liberem o tempo das mulheres que cuidam delas.',
    autor: 13,
    fonte: fonte13(
      26,
      'Diretriz 2 — Combater as desigualdades (Política Nacional de Cuidados)',
      'Apoiaremos as Cuidotecas, espaços de acolhida de crianças de 3 a 12 anos, que liberam o tempo das mulheres responsáveis pelo cuidado das crianças.',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Saúde ───────────────────────────────────────────────────────────────────
  {
    id: 'sau-1',
    tema: 'saude',
    texto: 'Incluir exames de doenças crônicas, como hipertensão e diabetes, no programa de remédios gratuitos em farmácias.',
    autor: 13,
    fonte: fonte13(
      36,
      'Diretriz 5 — Fortalecer a saúde com equidade, inovação e soberania (Farmácia Popular)',
      'Uma inovação do programa será incluir exames laboratoriais, de diagnóstico e de monitoramento de condições crônicas de saúde, que afetam parcela significativa da população, tais como hipertensão arterial e diabetes.',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'sau-2',
    tema: 'saude',
    texto: 'Corrigir a tabela de pagamentos do SUS a hospitais e clínicas para cobrir o custo real do atendimento.',
    autor: 22,
    fonte: fonte22(
      37,
      'Brasil que Prepara — Saúde que cuida antes de a doença chegar',
      'Vamos garantir as condições para que seja possível a correção efetiva da tabela SUS. […] Vamos assegurar uma remuneração que cubra o custo real do atendimento',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Educação ────────────────────────────────────────────────────────────────
  {
    id: 'edu-1',
    tema: 'educacao',
    texto: 'Priorizar o método fônico na alfabetização, ensinando a criança a ligar cada som à sua letra.',
    autor: 22,
    fonte: fonte22(
      35,
      'Brasil que Prepara — Ensinar de verdade',
      'Vamos priorizar o método fônico, que é o de melhor resultado comprovado pela ciência, ensinando a criança a ligar cada som à sua letra',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'edu-2',
    tema: 'educacao',
    texto: 'Chegar a 80% das crianças alfabetizadas na idade certa, com ações pactuadas com estados e municípios.',
    autor: 13,
    fonte: fonte13(
      31,
      'Diretriz 4 — Garantir o direito à educação para transformar vidas e o país',
      'Seguiremos com as ações e políticas já pactuadas com os estados e municípios brasileiros para chegarmos à meta de 80% das nossas crianças alfabetizadas na idade certa.',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Segurança pública ───────────────────────────────────────────────────────
  {
    id: 'seg-1',
    tema: 'seguranca',
    texto: 'Criar um ministério da segurança pública, após mudança na Constituição, para coordenar ações com estados e municípios.',
    autor: 13,
    fonte: fonte13(
      30,
      'Diretriz 3 — Proteger a vida com uma segurança pública mais eficiente e integrada',
      'Uma vez aprovada a PEC da Segurança Pública proposta pelo Executivo, criaremos o Ministério da Segurança Pública para coordenar, em articulação com estados e municípios, a execução das políticas nacionais de segurança pública',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'seg-2',
    tema: 'seguranca',
    texto: 'Apoiar a redução da maioridade penal de 18 para 16 anos e punir também maiores de 14 anos por crimes graves.',
    autor: 22,
    fonte: fonte22(
      13,
      'Brasil sem Medo — O crime do menor não é menor',
      'O novo governo do Brasil vai apoiar e sancionar a redução da maioridade penal de 18 para 16 anos. Vamos punir também maiores de 14 anos que cometerem crimes graves, como estupro, tráfico, tortura e assassinato.',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Meio ambiente ───────────────────────────────────────────────────────────
  {
    id: 'amb-1',
    tema: 'meio-ambiente',
    texto: 'Conceder a licença ambiental se o órgão não decidir no prazo, quando o empreendedor tiver cumprido todas as exigências.',
    autor: 22,
    fonte: fonte22(
      50,
      'Brasil que Cresce — Segurança jurídica: a regra do início é a regra do fim',
      'Quando o empreendedor cumpre a lei e apresenta tudo o que a norma exige, o órgão responsável deve ter um prazo definido para concluir a análise. Se não decidir nem se manifestar dentro desse prazo, a licença deve ser concedida',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'amb-2',
    tema: 'meio-ambiente',
    texto: 'Destinar terras públicas a unidades de conservação, territórios indígenas e quilombolas ou assentamentos.',
    autor: 13,
    fonte: fonte13(
      70,
      'Diretriz 11 — Promover a sustentabilidade ambiental e climática',
      'Vamos avançar na destinação das terras públicas para unidades de conservação, territórios indígenas e quilombolas ou assentamentos, e reforçar a regularização fundiária.',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Infraestrutura ──────────────────────────────────────────────────────────
  {
    id: 'inf-1',
    tema: 'infraestrutura',
    texto: 'Investir em aeroportos regionais e criar incentivos para a abertura de novas rotas aéreas.',
    autor: 13,
    fonte: fonte13(
      53,
      'Diretriz 8 — Economia mais sustentável, produtiva e digital (Investimentos em logística)',
      'daremos continuidade ao fortalecimento dos investimentos em aeroportos regionais e medidas de incentivo a novas rotas aéreas.',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'inf-2',
    tema: 'infraestrutura',
    texto: 'Investir R$ 900 bilhões em quatro anos em rodovias, ferrovias, hidrovias, portos e aeroportos.',
    autor: 22,
    fonte: fonte22(
      51,
      'Brasil que Cresce — Logística e transporte',
      'Vamos investir R$ 900 bilhões em quatro anos em rodovias, hidrovias, portos, aeroportos e ferrovias.',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Estado e instituições ───────────────────────────────────────────────────
  {
    id: 'est-1',
    tema: 'estado',
    texto: 'Extinguir qualquer estrutura do Estado encarregada de vigiar, rotular ou punir o que as pessoas dizem.',
    autor: 22,
    fonte: fonte22(
      66,
      'Brasil que Cumpre a Constituição — Tesouraço na Censura',
      'acabar com qualquer estrutura estatal que funcione como um “Ministério da Verdade", encarregada de vigiar, rotular ou punir o que as pessoas dizem.',
    ),
    confianca: 'media',
    revisado: false,
  },
  {
    id: 'est-2',
    tema: 'estado',
    texto: 'Regular redes sociais e plataformas digitais para impedir a difusão de desinformação e de campanhas de ódio.',
    autor: 13,
    fonte: fonte13(
      16,
      'Diretriz 1 — Fortalecer a democracia, a participação social e modernizar o Estado',
      'avançar ainda mais na regulação democrática das redes sociais e das plataformas digitais, de modo a impedir que elas difundam desinformação, acolham campanhas de ódio',
    ),
    confianca: 'media',
    revisado: false,
  },

  // ── Agricultura e campo ─────────────────────────────────────────────────────
  {
    id: 'agr-1',
    tema: 'agricultura',
    texto: 'Avançar na reforma agrária, assentando famílias acampadas e ampliando o acesso ao crédito para compra de terra.',
    autor: 13,
    fonte: fonte13(
      60,
      'Diretriz 9 — Segurança alimentar e produção agrícola',
      'Continuaremos a avançar na política de reforma agrária, assentando as famílias acampadas, estruturando os assentamentos e ampliando o acesso ao crédito fundiário.',
    ),
    confianca: 'media',
    revisado: false,
  },
  {
    id: 'agr-2',
    tema: 'agricultura',
    texto: 'Dar segurança jurídica sólida e irreversível ao direito de propriedade no campo, sem margem para relativizações.',
    autor: 22,
    fonte: fonte22(
      54,
      'Brasil que Cresce — Agronegócio e campo',
      'E traremos segurança jurídica sólida, irreversível e sem margem para relativizações do direito de propriedade, porque ninguém planta e investe no que teme perder.',
    ),
    confianca: 'alta',
    revisado: false,
  },

  // ── Relações exteriores ─────────────────────────────────────────────────────
  {
    id: 'ext-1',
    tema: 'relacoes-exteriores',
    texto: 'Retomar a adesão à OCDE, acabar aos poucos com o IOF sobre o câmbio e preparar uma abertura comercial.',
    autor: 22,
    fonte: fonte22(
      63,
      'Brasil que Cresce — Brasil no mundo',
      'O passo mais urgente é retomar o cronograma interrompido de adesão à OCDE, incluindo o fim gradual do IOF sobre o câmbio […] E vamos nos preparar para uma abertura comercial',
    ),
    confianca: 'alta',
    revisado: false,
  },
  {
    id: 'ext-2',
    tema: 'relacoes-exteriores',
    texto: 'Aprofundar a aproximação com o BRICS e o Sul Global e defender a democratização do FMI e do Banco Mundial.',
    autor: 13,
    fonte: fonte13(
      81,
      'Diretriz 13 — Defender a soberania nacional e o protagonismo internacional do Brasil',
      'Defenderemos a reforma da arquitetura financeira internacional, com a democratização do FMI, do Banco Mundial e dos bancos multilaterais […] Aprofundaremos a aproximação geopolítica com o BRICS e com o Sul Global',
    ),
    confianca: 'alta',
    revisado: false,
  },
];

export const PROPOSTA_POR_ID: Readonly<Record<string, Proposta>> = Object.fromEntries(
  PROPOSTAS.map((p) => [p.id, p]),
);

// ── Embaralhamento determinístico ─────────────────────────────────────────────

/** Hash de string → semente de 32 bits (FNV-1a). */
function sementeDe(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32: mesma semente ⇒ mesma sequência em qualquer navegador. */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Embaralha as propostas de forma determinística (Fisher–Yates com mulberry32).
 * Mesma `seed` (número ou texto) ⇒ mesma ordem. Não altera a lista original.
 */
export function embaralhar<T = Proposta>(seed: number | string, lista: readonly T[] = PROPOSTAS as unknown as readonly T[]): T[] {
  const rnd = mulberry32(sementeDe(seed));
  const out = lista.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface Rodada {
  tema: TemaInfo;
  /** As duas propostas do tema (uma de cada candidato), em ordem sorteada. */
  opcoes: [Proposta, Proposta];
}

/**
 * Monta as 12 rodadas do teste no formato "duas propostas por tema": a ordem dos temas e o lado
 * (esquerda/direita) de cada proposta são sorteados de forma determinística pela `seed`.
 */
export function rodadas(seed: number | string): Rodada[] {
  const temas = embaralhar(seed, TEMAS);
  const rnd = mulberry32(sementeDe(`${String(seed)}:lados`));
  return temas.map((tema) => {
    const doTema = PROPOSTAS.filter((p) => p.tema === tema.id);
    const a = doTema.find((p) => p.autor === 13)!;
    const b = doTema.find((p) => p.autor === 22)!;
    return { tema, opcoes: rnd() < 0.5 ? [a, b] : [b, a] };
  });
}

// ── Autoverificação editorial (usada em testes/QA; não roda em produção) ─────

/** Palavras que denunciam autoria (nomes, partidos, marcas de programas e slogans). */
const PISTAS_PROIBIDAS = [
  /\bLula\b/i, /\bBolsonaro\b/i, /\bFl[aá]vio\b/i, /\bPT\b/, /\bPL\b/, /\bPSB\b/,
  /Bolsa Fam[ií]lia/i, /P[ée]-de-Meia/i, /Minha Casa/i, /Casa Verde/i, /\bPAC\b/, /Farm[aá]cia Popular/i,
  /Cuidoteca/i, /Brasil sem Medo/i, /Brasil por Elas/i, /Tesoura[çc]o/i, /Ganha,? ?Ganha/i, /Desenrola/i,
  /Mais M[ée]dicos/i, /Petrobras/i, /c[ií]vico-militar/i, /Gás do Povo/i, /Luz do Povo/i, /Celular Seguro/i,
  /Agora tem Especialistas/i, /Minist[ée]rio da Verdade/i, /negociado sobre o legislado/i,
  /\bsoberan/i, /\besquerda\b/i, /\bdireita\b/i, /\bconservador/i, /\bprogressista/i,
];

/** Retorna a lista de problemas encontrados (vazia = ok). */
export function validarPropostas(lista: readonly Proposta[] = PROPOSTAS): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  for (const p of lista) {
    if (ids.has(p.id)) erros.push(`id duplicado: ${p.id}`);
    ids.add(p.id);
    if (!TEMA_POR_ID[p.tema]) erros.push(`${p.id}: tema desconhecido ${p.tema}`);
    if (p.texto.length > 140) erros.push(`${p.id}: texto com ${p.texto.length} caracteres (máx. 140)`);
    if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+r\b/.test(p.texto)) erros.push(`${p.id}: texto não começa por verbo no infinitivo`);
    for (const re of PISTAS_PROIBIDAS) if (re.test(p.texto)) erros.push(`${p.id}: pista de autoria no texto (${re})`);
    if (!p.fonte.url.startsWith('https://')) erros.push(`${p.id}: url sem https`);
    if (!p.fonte.trecho.trim()) erros.push(`${p.id}: trecho vazio`);
    if (p.revisado !== false) erros.push(`${p.id}: revisado deve ser false até revisão humana`);
  }
  for (const autor of [13, 22] as const) {
    const n = lista.filter((p) => p.autor === autor).length;
    if (n !== 12) erros.push(`candidato ${autor}: ${n} propostas (esperado 12)`);
  }
  for (const t of TEMAS) {
    const n13 = lista.filter((p) => p.tema === t.id && p.autor === 13).length;
    const n22 = lista.filter((p) => p.tema === t.id && p.autor === 22).length;
    if (n13 !== n22) erros.push(`tema ${t.id}: desequilíbrio ${n13} × ${n22}`);
  }
  return erros;
}
