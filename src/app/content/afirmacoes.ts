/**
 * Conteúdo editorial do Teste Cego (formato v2: AFIRMAÇÕES ÚNICAS com escala de concordância).
 * 2º turno da eleição presidencial de 25/10/2026 — nº 13 (Lula, PT) × nº 22 (Flávio Bolsonaro, PL).
 *
 * Como funciona: a pessoa vê UMA afirmação por vez e diz o quanto concorda (escala de 5 níveis, ou pula).
 * No fim, comparamos as respostas com a posição DOCUMENTADA de cada candidato no programa de governo
 * registrado no TSE. Cada posição traz página e trecho literal do documento (ver `./FONTES.md`).
 *
 * ATENÇÃO (editorial e jurídico):
 * - Tudo aqui tem `revisado: false`. NADA vai ao ar sem revisão humana editorial e jurídica.
 * - `posicoes`, `fonte` e `nota` revelam a autoria: a UI só mostra isso DEPOIS que a pessoa responder.
 *   Antes, exiba apenas `texto` (e, se quiser, `contexto` e o rótulo do tema).
 * - `sem-posicao` = o plano não trata do assunto. Não pontua para aquele candidato (não é inferido por
 *   ideologia, entrevista ou declaração de terceiros).
 * - LGPD: as respostas nunca saem do navegador (ARCHITECTURE.md §1.3). O código de URL vai depois do "#".
 * - Sem enquete: nunca agregue respostas de pessoas diferentes (Lei 9.504/97, art. 33, §5º).
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type Candidato = 13 | 22;
export const CANDIDATOS: readonly Candidato[] = [13, 22];

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
  /** Emoji neutro (nenhum associado a partido, bandeira ou campanha). */
  emoji: string;
}

export type ValorPosicao = 'concorda' | 'discorda' | 'neutro' | 'sem-posicao';

export interface FonteAfirmacao {
  /** Documento de origem. Revela a autoria: mostre só depois da resposta. */
  titulo: string;
  /** PDF consultado com âncora de página (`#page=N`, igual a `pagina`). */
  url: string;
  /** Página do PDF (coincide com a página impressa no rodapé dos dois documentos). */
  pagina: number;
  /** Capítulo/seção do documento onde está o trecho. */
  secao?: string;
  /** Citação LITERAL curta do documento. `[…]` indica corte. */
  trecho: string;
  /** Data de acesso (AAAA-MM-DD). */
  acessadoEm: string;
}

export interface Posicao {
  valor: ValorPosicao;
  /** Obrigatória para 'concorda' | 'discorda' | 'neutro'; ausente em 'sem-posicao'. */
  fonte?: FonteAfirmacao;
  /** `alta`: o trecho diz isso com todas as letras. `media`: exigiu leitura do contexto (ver `nota`). */
  confianca?: 'alta' | 'media';
  /** Explicação para a revisão (e para a página de resultado): por que este valor. */
  nota?: string;
}

export interface Afirmacao {
  /** Neutro de propósito (não indica autor nem direção); pode ir na URL. */
  id: string;
  tema: Tema;
  /** Frase afirmativa, curta (≤ 110 caracteres), sem marca, nome, sigla partidária ou jargão de campanha. */
  texto: string;
  /** Explicação neutra e factual de um termo (opcional; pode ser mostrada ANTES da resposta). */
  contexto?: string;
  posicoes: { 13: Posicao; 22: Posicao };
  /** Sempre `false` até a revisão humana editorial/jurídica. */
  revisado: false;
}

// ── Temas ─────────────────────────────────────────────────────────────────────

/** Mesmos ids e rótulos do formato anterior (`propostas.ts`). */
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

// ── Escala de resposta ────────────────────────────────────────────────────────

export type ValorLikert = -2 | -1 | 0 | 1 | 2;
export type Resposta = ValorLikert | 'pular';
/** Respostas por id de afirmação. Ausente = não respondida (conta como pulada no cálculo). */
export type Respostas = Readonly<Partial<Record<string, Resposta>>>;

export interface OpcaoEscala {
  valor: Resposta;
  rotulo: string;
}

/** As 5 opções da escala, na ordem de exibição, seguidas de "Pular". */
export const ESCALA: readonly OpcaoEscala[] = [
  { valor: 2, rotulo: 'Concordo totalmente' },
  { valor: 1, rotulo: 'Concordo' },
  { valor: 0, rotulo: 'Neutro' },
  { valor: -1, rotulo: 'Discordo' },
  { valor: -2, rotulo: 'Discordo totalmente' },
  { valor: 'pular', rotulo: 'Pular' },
];

export const ehResposta = (v: unknown): v is Resposta =>
  v === 'pular' || v === -2 || v === -1 || v === 0 || v === 1 || v === 2;

/** Posição do candidato na mesma escala: concorda = +2, neutro = 0, discorda = −2. */
export const PONTOS_POSICAO: Readonly<Record<Exclude<ValorPosicao, 'sem-posicao'>, ValorLikert>> = {
  concorda: 2,
  neutro: 0,
  discorda: -2,
};

/** Peso de uma afirmação marcada como "importante pra mim". */
export const PESO_IMPORTANTE = 2;

// ── Documentos primários ──────────────────────────────────────────────────────

/** Cópias integrais dos PDFs registrados no TSE (mesmos arquivos e SHA-256 de `propostas.ts`). */
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

/** Data em que os dois PDFs foram baixados, conferidos pelo SHA-256 e relidos para este conteúdo. */
export const ACESSO = '2026-10-10';

function fonte(c: Candidato, pagina: number, secao: string, trecho: string): FonteAfirmacao {
  const d = DOCUMENTOS[c];
  return {
    titulo: `${d.titulo} (cópia integral publicada pelo ${d.publicadoPor})`,
    url: `${d.pdf}#page=${pagina}`,
    pagina,
    secao,
    trecho,
    acessadoEm: ACESSO,
  };
}

type Extra = Pick<Posicao, 'confianca' | 'nota'>;
const concorda = (c: Candidato, p: number, s: string, t: string, x: Extra = {}): Posicao => ({
  valor: 'concorda',
  fonte: fonte(c, p, s, t),
  confianca: 'alta',
  ...x,
});
const discorda = (c: Candidato, p: number, s: string, t: string, x: Extra = {}): Posicao => ({
  valor: 'discorda',
  fonte: fonte(c, p, s, t),
  confianca: 'alta',
  ...x,
});
const neutro = (c: Candidato, p: number, s: string, t: string, x: Extra = {}): Posicao => ({
  valor: 'neutro',
  fonte: fonte(c, p, s, t),
  confianca: 'alta',
  ...x,
});
const semPosicao = (nota: string): Posicao => ({ valor: 'sem-posicao', nota });

// Seções dos documentos (aparecem só depois da resposta).
const S13 = {
  intro: 'Compromisso com o projeto de nação',
  d1: 'Diretriz 1 — Fortalecer a democracia, a participação social e modernizar o Estado',
  d2: 'Diretriz 2 — Combater as desigualdades',
  d3: 'Diretriz 3 — Proteger a vida com uma segurança pública mais eficiente e integrada',
  d4: 'Diretriz 4 — Garantir o direito à educação para transformar vidas e o país',
  d5: 'Diretriz 5 — Fortalecer a saúde com equidade, inovação e soberania',
  d8: 'Diretriz 8 — Promover uma economia mais sustentável, produtiva e digital',
  d9: 'Diretriz 9 — Segurança alimentar e produção agrícola',
  d11: 'Diretriz 11 — Promover a sustentabilidade ambiental e climática',
  d12: 'Diretriz 12 — Valorizar o trabalho em suas múltiplas formas',
  d13: 'Diretriz 13 — Defender a soberania nacional e o protagonismo internacional do Brasil',
} as const;

// ── As 24 afirmações ──────────────────────────────────────────────────────────
//
// 12 temas × 2. Direção alternada: em metade das afirmações, concordar aproxima do 13; na outra metade,
// do 22 (ver `ladoDoConcordo`). As duas de Saúde são "controle": os dois planos concordam.

export const AFIRMACOES: readonly Afirmacao[] = [
  // ── Economia ────────────────────────────────────────────────────────────────
  {
    id: 'eco-a',
    tema: 'economia',
    texto: 'As regras atuais que limitam o crescimento dos gastos do governo federal devem ser mantidas.',
    contexto: 'Uma lei de 2023 limita quanto as despesas do governo federal podem crescer a cada ano.',
    posicoes: {
      13: concorda(
        13,
        49,
        S13.d8,
        'manteremos o novo arcabouço fiscal, que controlou o crescimento das despesas sem prejudicar as políticas sociais',
      ),
      22: discorda(
        22,
        71,
        'Brasil que Não Volta Atrás — Contas em ordem para juros e inflação menores',
        'Apresentaremos uma reformulação nas atuais regras fiscais, com regras claras focadas na estabilização e na redução da dívida pública',
      ),
    },
    revisado: false,
  },
  {
    id: 'eco-b',
    tema: 'economia',
    texto: 'O crescimento da economia deve ser puxado principalmente pelo investimento privado, e não pelo público.',
    posicoes: {
      13: discorda(
        13,
        48,
        S13.d8,
        'principais frentes de expansão: os investimentos produtivos públicos e privados […] Ao investir em infraestrutura, indústria e crédito produtivo, o Estado induz o aumento da produtividade',
        {
          confianca: 'media',
          nota: 'O plano põe o investimento público ao lado do privado como motor do crescimento; rejeita, portanto, o "e não pelo público".',
        },
      ),
      22: concorda(
        22,
        49,
        'Brasil que Cresce (abertura do capítulo)',
        'alcançar um crescimento sustentado de 4% ao ano ao longo da próxima década, apoiado no investimento privado […] O papel do Estado aqui não é ser o empresário',
      ),
    },
    revisado: false,
  },

  // ── Impostos ────────────────────────────────────────────────────────────────
  {
    id: 'imp-a',
    tema: 'impostos',
    texto: 'A reforma dos impostos sobre o consumo, que está em fase de implantação, deve ser revista.',
    contexto: 'A reforma aprovada em 2023 unifica tributos sobre o consumo num modelo de IVA, com transição até 2033.',
    posicoes: {
      13: discorda(13, 48, S13.d8, 'Nosso desafio é […] consolidar os avanços promovidos pela reforma tributária', {
        confianca: 'media',
        nota: 'O plano defende "consolidar" a reforma (e a celebra na p. 11), não revê-la.',
      }),
      22: concorda(
        22,
        30,
        'Brasil Mais Barato — Menos imposto no que você consome (repetido nas p. 71-72)',
        'Vamos promover a revisão e o redimensionamento da reforma tributária em curso',
      ),
    },
    revisado: false,
  },
  {
    id: 'imp-b',
    tema: 'impostos',
    texto: 'O governo deve reduzir os impostos sobre combustíveis para baixar o preço na bomba.',
    posicoes: {
      13: discorda(
        13,
        8,
        S13.intro,
        'armou uma bomba fiscal para estados e municípios com a desoneração artificial de combustíveis',
        {
          confianca: 'media',
          nota: 'Crítica explícita a um corte de impostos sobre combustíveis feito no passado. Para os preços, o plano propõe outra via: política de preços da estatal e subvenções (p. 66).',
        },
      ),
      22: concorda(
        22,
        31,
        'Brasil Mais Barato — Conta de luz mais simples e mais barata',
        'Vamos reduzir impostos sobre energia elétrica e combustíveis',
      ),
    },
    revisado: false,
  },

  // ── Trabalho e renda ────────────────────────────────────────────────────────
  {
    id: 'trb-a',
    tema: 'trabalho',
    texto: 'A jornada máxima de trabalho deve ser reduzida por lei para 40 horas semanais, sem corte de salário.',
    contexto: 'Hoje a Constituição fixa a jornada máxima em 44 horas semanais.',
    posicoes: {
      13: concorda(
        13,
        75,
        S13.d12,
        'Manteremos nossa ação junto ao Senado Federal para assegurar o fim da escala 6x1 e a redução da jornada de trabalho para 40 horas, sem redução salarial',
      ),
      22: discorda(
        22,
        45,
        'Brasil que Prospera — O trabalhador em primeiro lugar, não o sindicato',
        'É mais do mesmo: insegurança jurídica e retrocesso. Situações que se repetem na discussão de jornada – onde o governo deseja ignorar a prevalência do negociado sobre o legislado',
        {
          confianca: 'media',
          nota: 'O plano chama de "retrocesso" a proposta de jornada do governo atual, por ignorar o acordo entre as partes; na p. 44 defende "jornada flexível" e o negociado sobre o legislado.',
        },
      ),
    },
    revisado: false,
  },
  {
    id: 'trb-b',
    tema: 'trabalho',
    texto: 'O salário mínimo deve subir só o necessário para repor a inflação, sem ganho acima dela.',
    posicoes: {
      13: discorda(
        13,
        74,
        S13.d12,
        'o novo mandato de Lula dará continuidade à política de valorização do salário mínimo',
        { nota: 'Na p. 73 o plano define a política: "asseguramos aumento real para o piso de remuneração todos os anos".' },
      ),
      22: semPosicao('O plano não trata do reajuste do salário mínimo.'),
    },
    revisado: false,
  },

  // ── Programas sociais e cuidado ─────────────────────────────────────────────
  {
    id: 'soc-a',
    tema: 'programas-sociais',
    texto: 'Onde faltar vaga em creche pública, o governo deve pagar a vaga em uma creche particular.',
    posicoes: {
      13: semPosicao(
        'O plano defende ampliar creches públicas (p. 31), mas não trata de pagar vagas na rede particular.',
      ),
      22: concorda(
        22,
        21,
        'Brasil por Elas — Creche garantida para toda criança',
        'Onde não houver vaga na rede pública, a família receberá um voucher-creche para acesso à rede privada credenciada até a vaga pública surgir',
      ),
    },
    revisado: false,
  },
  {
    id: 'soc-b',
    tema: 'programas-sociais',
    texto: 'O governo deve ampliar os programas de transferência de renda para atender mais famílias.',
    contexto: 'Transferência de renda: pagamentos mensais do governo a famílias de baixa renda.',
    posicoes: {
      13: concorda(
        13,
        18,
        S13.d2,
        'programas eficientes de transferência de renda. Por isso, devemos manter, aperfeiçoar e ampliar as políticas de proteção social para quem mais necessita',
        { confianca: 'media', nota: 'O plano fala em "ampliar as políticas de proteção social", entre elas a transferência de renda.' },
      ),
      22: discorda(
        22,
        43,
        'Brasil que Prospera — Da proteção à autonomia',
        'o objetivo de um bom governo não é ter mais gente na fila do auxílio. É ter cada vez mais brasileiros que conquistaram a própria autonomia e não precisam mais dele',
        {
          confianca: 'media',
          nota: 'O plano promete manter os programas existentes (p. 42), mas rejeita como objetivo ter mais beneficiários.',
        },
      ),
    },
    revisado: false,
  },

  // ── Saúde (as duas são "controle": os dois planos concordam) ────────────────
  {
    id: 'sau-a',
    tema: 'saude',
    texto: 'O SUS deve usar hospitais e clínicas particulares para fazer exames e cirurgias e reduzir as filas.',
    posicoes: {
      13: concorda(
        13,
        37,
        S13.d5,
        'Daremos continuidade à parceria com hospitais privados para assegurar, em troca de créditos financeiros ou de dívidas, a oferta de exames e cirurgias para o SUS',
        { nota: 'Muda o meio de pagamento (créditos ou abatimento de dívidas), não a ideia.' },
      ),
      22: concorda(
        22,
        37,
        'Brasil que Prepara — Saúde que cuida antes de a doença chegar',
        'vamos contratar serviços e exames na rede privada nos horários ociosos',
      ),
    },
    revisado: false,
  },
  {
    id: 'sau-b',
    tema: 'saude',
    texto: 'Cada paciente deve ter um prontuário eletrônico único, com todo o seu histórico, válido na rede pública.',
    contexto: 'O prontuário reúne consultas, exames, vacinas e receitas de cada paciente.',
    posicoes: {
      13: concorda(
        13,
        35,
        S13.d5,
        'Vamos acelerar os esforços na consolidação do prontuário único do cidadão',
      ),
      22: concorda(
        22,
        26,
        'Brasil sem Fila — Saúde digital e prontuário eletrônico único',
        'Vamos implantar o prontuário eletrônico único, vinculado ao CPF',
      ),
    },
    revisado: false,
  },

  // ── Educação ────────────────────────────────────────────────────────────────
  {
    id: 'edu-a',
    tema: 'educacao',
    texto: 'As escolas públicas devem ser dirigidas apenas por civis, sem militares na gestão.',
    posicoes: {
      13: semPosicao('O plano não menciona escolas com gestão compartilhada com militares.'),
      22: discorda(
        22,
        35,
        'Brasil que Prepara — Ensinar de verdade',
        'Vamos ampliar as Escolas Cívico-Militares, que uniram disciplina e bom desempenho onde foram implantadas',
      ),
    },
    revisado: false,
  },
  {
    id: 'edu-b',
    tema: 'educacao',
    texto: 'Estudantes de baixa renda do ensino médio devem receber ajuda em dinheiro para não abandonar a escola.',
    posicoes: {
      13: concorda(
        13,
        32,
        S13.d4,
        'Vamos dar continuidade e fortalecer o Pé-de-Meia. Nenhum jovem em situação de pobreza ou vulnerabilidade social no Brasil deve deixar a escola por falta de renda',
      ),
      22: semPosicao(
        'O plano não trata de auxílio em dinheiro a estudantes de baixa renda. (O programa de reforço da p. 35 paga alunos de bom desempenho para ensinar colegas; é outra medida.)',
      ),
    },
    revisado: false,
  },

  // ── Segurança pública ───────────────────────────────────────────────────────
  {
    id: 'seg-a',
    tema: 'seguranca',
    texto: 'A idade a partir da qual alguém responde por crimes como adulto deve continuar sendo 18 anos.',
    contexto: 'Hoje, menores de 18 anos não respondem criminalmente como adultos; seguem o Estatuto da Criança e do Adolescente.',
    posicoes: {
      13: semPosicao('O plano não trata da idade de responsabilidade penal.'),
      22: discorda(
        22,
        13,
        'Brasil sem Medo — O crime do menor não é menor',
        'O novo governo do Brasil vai apoiar e sancionar a redução da maioridade penal de 18 para 16 anos',
      ),
    },
    revisado: false,
  },
  {
    id: 'seg-b',
    tema: 'seguranca',
    texto: 'A compra de armas de fogo e munições pela população deve ficar mais fácil.',
    posicoes: {
      13: discorda(
        13,
        28,
        S13.d3,
        'A revogação dos decretos editados no governo anterior, que facilitavam o acesso a armas de fogo, foi uma medida acertada. Por isso, manteremos uma política de controle de armas e munições',
      ),
      22: semPosicao(
        'O plano não trata da compra de armas pela população; fala só em equipamento das forças de segurança (p. 13-14).',
      ),
    },
    revisado: false,
  },

  // ── Meio ambiente ───────────────────────────────────────────────────────────
  {
    id: 'amb-a',
    tema: 'meio-ambiente',
    texto: 'Se o órgão ambiental não decidir no prazo, a licença de quem cumpriu as exigências deve ser concedida.',
    contexto: 'Obras como estradas, usinas e minas precisam de licença ambiental antes de começar.',
    posicoes: {
      13: semPosicao('O plano não trata de prazos de licenciamento ambiental.'),
      22: concorda(
        22,
        50,
        'Brasil que Cresce — Segurança jurídica: a regra do início é a regra do fim',
        'Quando o empreendedor cumpre a lei e apresenta tudo o que a norma exige, o órgão responsável deve ter um prazo definido para concluir a análise. Se não decidir nem se manifestar dentro desse prazo, a licença deve ser concedida',
      ),
    },
    revisado: false,
  },
  {
    id: 'amb-b',
    tema: 'meio-ambiente',
    texto: 'Mais terras públicas devem ser destinadas a áreas de conservação e a territórios indígenas e quilombolas.',
    posicoes: {
      13: concorda(
        13,
        70,
        S13.d11,
        'Vamos avançar na destinação das terras públicas para unidades de conservação, territórios indígenas e quilombolas ou assentamentos',
      ),
      22: semPosicao(
        'O plano não trata da destinação de terras públicas a conservação ou a territórios tradicionais. (Propõe autonomia produtiva de indígenas e quilombolas em suas terras, p. 50.)',
      ),
    },
    revisado: false,
  },

  // ── Infraestrutura ──────────────────────────────────────────────────────────
  {
    id: 'inf-a',
    tema: 'infraestrutura',
    texto: 'Estradas, ferrovias e portos devem ser construídos e operados principalmente por empresas privadas.',
    posicoes: {
      13: neutro(
        13,
        53,
        S13.d8,
        'A nova edição do Novo PAC manterá a articulação dos investimentos públicos e privados em infraestrutura logística, dando sequência a obras públicas e concessões',
        {
          confianca: 'media',
          nota: 'O plano combina obras públicas e concessões privadas (e promete ampliar concessões de ferrovias), sem dizer que o setor privado deve ser o principal.',
        },
      ),
      22: concorda(
        22,
        50,
        'Brasil que Cresce — Logística e transporte',
        'Nossa estratégia de infraestrutura se apoia na iniciativa privada […] o investimento privado assume a construção e a operação',
      ),
    },
    revisado: false,
  },
  {
    id: 'inf-b',
    tema: 'infraestrutura',
    texto: 'Compras, obras e concessões do governo devem preferir produtos brasileiros, mesmo que custem um pouco mais.',
    posicoes: {
      13: concorda(
        13,
        51,
        S13.d8,
        'compras públicas, concessões, regulações e benefícios condicionados a conteúdo local, valor agregado nacional, margens de preferência com estímulos para empresas brasileiras',
        { nota: '"Margem de preferência" permite pagar mais caro pelo produto nacional. Na p. 67, reafirma regras de conteúdo local nos investimentos da estatal de petróleo.' },
      ),
      22: semPosicao(
        'O plano não trata de preferência a produtos nacionais nas compras públicas. (Defende, em geral, infraestrutura "sem intervenções que distorçam os incentivos de mercado", p. 50, e abertura comercial, p. 63.)',
      ),
    },
    revisado: false,
  },

  // ── Estado e instituições ───────────────────────────────────────────────────
  {
    id: 'est-a',
    tema: 'estado',
    texto: 'A lei deve obrigar as redes sociais a remover conteúdo considerado desinformação ou discurso de ódio.',
    posicoes: {
      13: concorda(
        13,
        16,
        S13.d1,
        'avançar ainda mais na regulação democrática das redes sociais e das plataformas digitais, de modo a impedir que elas difundam desinformação, acolham campanhas de ódio',
        {
          confianca: 'media',
          nota: 'O plano propõe regular as plataformas para "impedir que elas difundam desinformação", sem detalhar o mecanismo (remoção ou outro). Na mesma página defende "a garantia plena da liberdade de expressão".',
        },
      ),
      22: discorda(
        22,
        66,
        'Brasil que Cumpre a Constituição — Tesouraço na Censura',
        'estruturas criadas para tratar como desinformação aquilo que incomoda o poder, o que abre a porta para a censura de opositores, jornalistas e cidadãos comuns',
        {
          confianca: 'media',
          nota: 'O plano rejeita que o Estado classifique conteúdo como desinformação e promete extinguir essas estruturas. O trecho contém uma alegação contra o governo atual: mostrar como citação.',
        },
      ),
    },
    revisado: false,
  },
  {
    id: 'est-b',
    tema: 'estado',
    texto: 'Decisões tomadas por um único ministro do STF devem ser limitadas, dando prioridade às decisões coletivas.',
    contexto: 'Hoje um ministro do STF pode, sozinho, tomar decisões provisórias, como suspender uma lei.',
    posicoes: {
      13: semPosicao(
        'O plano não trata de decisões individuais no STF; fala em "diálogo permanente com os atores do judiciário, respeitada a autonomia dos Poderes" (p. 16).',
      ),
      22: concorda(
        22,
        65,
        'Brasil que Cumpre a Constituição — Reforma do Judiciário',
        'Limitação das decisões monocráticas do STF, privilegiando as decisões colegiadas',
      ),
    },
    revisado: false,
  },

  // ── Agricultura e campo ─────────────────────────────────────────────────────
  {
    id: 'agr-a',
    tema: 'agricultura',
    texto: 'O governo deve avançar na reforma agrária, assentando famílias que vivem em acampamentos à espera de terra.',
    contexto: 'Na reforma agrária, o governo destina terras a famílias de trabalhadores rurais para que produzam nelas.',
    posicoes: {
      13: concorda(
        13,
        60,
        S13.d9,
        'Continuaremos a avançar na política de reforma agrária, assentando as famílias acampadas',
      ),
      22: semPosicao(
        'O plano não trata de reforma agrária. (Defende a titulação de pequenos proprietários e a segurança do direito de propriedade, p. 54.)',
      ),
    },
    revisado: false,
  },
  {
    id: 'agr-b',
    tema: 'agricultura',
    texto: 'O direito de propriedade de terras no campo deve ser garantido sem margem para exceções.',
    posicoes: {
      13: semPosicao(
        'O plano não trata do tema nesses termos. (Defende reforma agrária, p. 60, e regularização fundiária para dar "segurança jurídica dos produtores rurais".)',
      ),
      22: concorda(
        22,
        54,
        'Brasil que Cresce — Agronegócio e campo',
        'E traremos segurança jurídica sólida, irreversível e sem margem para relativizações do direito de propriedade',
      ),
    },
    revisado: false,
  },

  // ── Relações exteriores ─────────────────────────────────────────────────────
  {
    id: 'ext-a',
    tema: 'relacoes-exteriores',
    texto: 'O Brasil deve tratar como prioridade a entrada na OCDE, organização internacional de cooperação econômica.',
    contexto: 'O processo de adesão do Brasil à OCDE foi aberto em 2022.',
    posicoes: {
      13: semPosicao('O plano não trata de adesão à OCDE (a sigla só aparece numa comparação de matriz elétrica, p. 64).'),
      22: concorda(
        22,
        63,
        'Brasil que Cresce — Brasil no mundo',
        'O passo mais urgente é retomar o cronograma interrompido de adesão à OCDE',
      ),
    },
    revisado: false,
  },
  {
    id: 'ext-b',
    tema: 'relacoes-exteriores',
    texto: 'O Brasil deve aprofundar a aproximação política com o BRICS e com outros países em desenvolvimento.',
    contexto: 'O BRICS é um bloco de países emergentes formado inicialmente por Brasil, Rússia, Índia, China e África do Sul.',
    posicoes: {
      13: concorda(
        13,
        81,
        S13.d13,
        'Aprofundaremos a aproximação geopolítica com o BRICS e com o Sul Global',
      ),
      22: semPosicao('O plano não menciona o BRICS; defende negociar "com todos os que interessam ao Brasil" (p. 62).'),
    },
    revisado: false,
  },
];

export const AFIRMACAO_POR_ID: Readonly<Record<string, Afirmacao>> = Object.fromEntries(
  AFIRMACOES.map((a) => [a.id, a]),
);

// ── Direção e equilíbrio ──────────────────────────────────────────────────────

/** Pontos do candidato na escala (+2/0/−2) ou `null` quando o plano não trata do assunto. */
export function pontosDoCandidato(p: Posicao): ValorLikert | null {
  return p.valor === 'sem-posicao' ? null : PONTOS_POSICAO[p.valor];
}

/**
 * A quem "Concordo totalmente" aproxima mais: 13, 22, 'ambos' (os dois concordam/discordam igual) ou
 * `null` (ninguém tem posição). Compara a afinidade de uma resposta +2 com cada candidato que tem posição;
 * quem não tem posição fica no meio da escala (0) só para esta classificação.
 */
export function ladoDoConcordo(a: Afirmacao): Candidato | 'ambos' | null {
  const p13 = pontosDoCandidato(a.posicoes[13]);
  const p22 = pontosDoCandidato(a.posicoes[22]);
  if (p13 === null && p22 === null) return null;
  const x13 = p13 ?? 0;
  const x22 = p22 ?? 0;
  if (x13 === x22) return 'ambos';
  return x13 > x22 ? 13 : 22;
}

/** Afirmações em que os dois têm posição oposta (um concorda, o outro discorda): devolve quem concorda. */
export function direcao(a: Afirmacao): Candidato | null {
  const v13 = a.posicoes[13].valor;
  const v22 = a.posicoes[22].valor;
  if (v13 === 'concorda' && v22 === 'discorda') return 13;
  if (v22 === 'concorda' && v13 === 'discorda') return 22;
  return null;
}

export interface ResumoEquilibrio {
  /** Dois com posição oposta, por quem concorda. */
  opostas: { 13: number; 22: number };
  /** Os dois com a mesma posição (controle). */
  controles: number;
  /** A quem o "concordo" aproxima, em todas as afirmações. */
  ladoDoConcordo: { 13: number; 22: number; ambos: number };
  /** Contagem de valores por candidato. */
  valores: Record<Candidato, Record<ValorPosicao, number>>;
}

export function resumoEquilibrio(lista: readonly Afirmacao[] = AFIRMACOES): ResumoEquilibrio {
  const vazio = (): Record<ValorPosicao, number> => ({ concorda: 0, discorda: 0, neutro: 0, 'sem-posicao': 0 });
  const r: ResumoEquilibrio = {
    opostas: { 13: 0, 22: 0 },
    controles: 0,
    ladoDoConcordo: { 13: 0, 22: 0, ambos: 0 },
    valores: { 13: vazio(), 22: vazio() },
  };
  for (const a of lista) {
    const d = direcao(a);
    if (d) r.opostas[d]++;
    const v13 = a.posicoes[13].valor;
    const v22 = a.posicoes[22].valor;
    if (v13 === v22 && v13 !== 'sem-posicao') r.controles++;
    const lado = ladoDoConcordo(a);
    if (lado !== null) r.ladoDoConcordo[lado]++;
    r.valores[13][v13]++;
    r.valores[22][v22]++;
  }
  return r;
}

// ── Cálculo da sintonia (puro) ────────────────────────────────────────────────
//
// Fórmula (documentada também em FONTES.md e para a página /metodologia):
//
//   Resposta da pessoa:  r ∈ {+2 concordo totalmente, +1 concordo, 0 neutro, −1 discordo, −2 discordo totalmente}
//   Posição do candidato: c = +2 (concorda), 0 (neutro), −2 (discorda)
//   Afinidade no item:   a = 1 − |r − c| / 4            (0 = oposto total, 1 = idêntico)
//   Peso do item:        w = 2 se a pessoa marcou "importante", senão 1
//   Sintonia (0–100):    S = 100 × Σ w·a / Σ w
//
//   Ficam FORA da conta de um candidato: itens pulados/não respondidos e itens em que o plano dele não trata do
//   assunto ('sem-posicao'). Por isso os dois percentuais podem usar conjuntos de itens diferentes (o resultado
//   informa quantos itens entraram para cada um em `consideradas`). Os dois números são independentes: não
//   somam 100%. Sem nenhum item válido, o resultado é `null` (a UI mostra "—").

export type PorCandidato<T> = { 13: T; 22: T };

/** Ids marcados como importantes (Set ou lista) ou pesos explícitos por id (padrão 1). */
export type Pesos = ReadonlySet<string> | readonly string[] | Readonly<Partial<Record<string, number>>>;

export interface ParcialSintonia {
  /** 0–100, ou null se nenhum item entrou na conta. */
  13: number | null;
  22: number | null;
  /** Quantos itens entraram na conta de cada candidato. */
  consideradas: PorCandidato<number>;
}

export interface ItemSintonia {
  resposta: Resposta | null;
  peso: number;
  /** Afinidade 0–100 com cada candidato (null se pulado ou sem posição). */
  pct: PorCandidato<number | null>;
}

export interface ResultadoSintonia extends ParcialSintonia {
  /** Itens com resposta na escala (exclui pulados e não respondidos). */
  respondidas: number;
  puladas: number;
  porTema: Record<Tema, ParcialSintonia>;
  porAfirmacao: Record<string, ItemSintonia>;
}

/** Afinidade (0–1) entre uma resposta e uma posição na escala. */
export function afinidadeItem(r: ValorLikert, c: ValorLikert): number {
  return 1 - Math.abs(r - c) / 4;
}

function pesoDe(pesos: Pesos | undefined, id: string): number {
  if (!pesos) return 1;
  if (pesos instanceof Set) return pesos.has(id) ? PESO_IMPORTANTE : 1;
  if (Array.isArray(pesos)) return pesos.includes(id) ? PESO_IMPORTANTE : 1;
  const w = (pesos as Readonly<Partial<Record<string, number>>>)[id];
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1;
}

interface Acumulador {
  soma: PorCandidato<number>;
  pesos: PorCandidato<number>;
  n: PorCandidato<number>;
}
const novoAcumulador = (): Acumulador => ({ soma: { 13: 0, 22: 0 }, pesos: { 13: 0, 22: 0 }, n: { 13: 0, 22: 0 } });
const fechar = (ac: Acumulador): ParcialSintonia => ({
  13: ac.pesos[13] > 0 ? (ac.soma[13] / ac.pesos[13]) * 100 : null,
  22: ac.pesos[22] > 0 ? (ac.soma[22] / ac.pesos[22]) * 100 : null,
  consideradas: { ...ac.n },
});

/**
 * Sintonia da pessoa com cada candidato (função pura; roda só no navegador).
 * `respostas`: por id; ausente ou 'pular' não conta. `pesos`: ids "importantes" (peso 2) ou pesos explícitos.
 */
export function calcularSintonia(
  respostas: Respostas,
  pesos?: Pesos,
  lista: readonly Afirmacao[] = AFIRMACOES,
): ResultadoSintonia {
  const total = novoAcumulador();
  const porTemaAc = new Map<Tema, Acumulador>(TEMAS.map((t) => [t.id, novoAcumulador()]));
  const porAfirmacao: Record<string, ItemSintonia> = {};
  let respondidas = 0;
  let puladas = 0;

  for (const a of lista) {
    const bruta = respostas[a.id];
    const resposta = ehResposta(bruta) ? bruta : null;
    const peso = pesoDe(pesos, a.id);
    const pct: PorCandidato<number | null> = { 13: null, 22: null };
    if (resposta === null || resposta === 'pular') {
      puladas++;
    } else {
      respondidas++;
      const ac = porTemaAc.get(a.tema) ?? novoAcumulador();
      for (const c of CANDIDATOS) {
        const pc = pontosDoCandidato(a.posicoes[c]);
        if (pc === null) continue;
        const af = afinidadeItem(resposta, pc);
        pct[c] = af * 100;
        for (const alvo of [total, ac]) {
          alvo.soma[c] += peso * af;
          alvo.pesos[c] += peso;
          alvo.n[c]++;
        }
      }
      porTemaAc.set(a.tema, ac);
    }
    porAfirmacao[a.id] = { resposta, peso, pct };
  }

  const porTema = Object.fromEntries(TEMAS.map((t) => [t.id, fechar(porTemaAc.get(t.id)!)])) as Record<
    Tema,
    ParcialSintonia
  >;
  return { ...fechar(total), respondidas, puladas, porTema, porAfirmacao };
}

/**
 * Concordância entre duas pessoas (Duelo), na mesma régua: média de 1 − |ra − rb| / 4 nos itens que as
 * duas responderam na escala. 0–100, ou null se não houver item em comum.
 */
export function calcularConcordancia(
  a: Respostas,
  b: Respostas,
  lista: readonly Afirmacao[] = AFIRMACOES,
): { pct: number | null; emComum: number } {
  let soma = 0;
  let n = 0;
  for (const x of lista) {
    const ra = a[x.id];
    const rb = b[x.id];
    if (!ehResposta(ra) || !ehResposta(rb) || ra === 'pular' || rb === 'pular') continue;
    soma += afinidadeItem(ra, rb);
    n++;
  }
  return { pct: n > 0 ? (soma / n) * 100 : null, emComum: n };
}

// ── Embaralhamento determinístico ─────────────────────────────────────────────

/** Texto ou número → semente de 32 bits (FNV-1a para texto). */
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

/** Fisher–Yates com mulberry32. Mesma `seed` ⇒ mesma ordem. Não altera a lista original. */
export function embaralhar<T = Afirmacao>(
  seed: number | string,
  lista: readonly T[] = AFIRMACOES as unknown as readonly T[],
): T[] {
  const rnd = mulberry32(sementeDe(seed));
  const out = lista.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Ordem de exibição do teste: embaralha pela `seed` e evita duas afirmações seguidas do mesmo tema (o par de
 * um tema lado a lado convida a comparar e "adivinhar"). Determinística.
 */
export function ordemDoTeste(seed: number | string, lista: readonly Afirmacao[] = AFIRMACOES): Afirmacao[] {
  const resto = embaralhar(seed, lista);
  const out: Afirmacao[] = [];
  while (resto.length > 0) {
    const ultimo = out[out.length - 1];
    const k = resto.findIndex((a) => a.tema !== ultimo?.tema);
    if (k !== -1) {
      out.push(resto.splice(k, 1)[0]);
      continue;
    }
    // Só sobrou item do mesmo tema do último: insere na primeira posição sem vizinho do mesmo tema.
    const a = resto.shift()!;
    let pos = out.length;
    for (let i = 0; i <= out.length; i++) {
      if ((i === 0 || out[i - 1].tema !== a.tema) && (i === out.length || out[i].tema !== a.tema)) {
        pos = i;
        break;
      }
    }
    out.splice(pos, 0, a);
  }
  return out;
}

// ── Código para a URL (formato v2) ────────────────────────────────────────────
//
// "2" + semente(5, base36) + respostas(24, base36) = 30 caracteres [0-9a-z], seguros em URL.
//  - A semente define só a ordem de exibição (`ordemDoTeste`); não é dado pessoal.
//  - As respostas vão na ORDEM CANÔNICA de `AFIRMACOES` (não na ordem embaralhada), 1 caractere por item:
//      0 = não respondida · 1 = pular · 2..6 = −2..+2 · somar 7 = marcada como importante (7..d).
//  - Não é criptografia: o código fica sempre DEPOIS do "#" (o navegador não envia essa parte a servidor algum).
//  - Mudou a lista de afirmações? Suba `VERSAO_CODIGO`: códigos antigos passam a ser recusados (null).
//  - O formato v1 ("1" + 10 caracteres) é do teste antigo de pares (`pages/teste/codigo.ts`).

export const VERSAO_CODIGO = '2';
const LARG_SEMENTE = 5;
const MAX_SEMENTE = 36 ** LARG_SEMENTE;
export const TAMANHO_RESPOSTAS = AFIRMACOES.length;
export const TAMANHO_CODIGO = 1 + LARG_SEMENTE + TAMANHO_RESPOSTAS;
const B36 = /^[0-9a-z]+$/;

export interface CodigoSintonia {
  seed: number;
  respostas: Partial<Record<string, Resposta>>;
  importantes: string[];
}

/** Semente aleatória (crypto quando disponível). Nunca deriva de nada pessoal. */
export function novaSemente(): number {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] % MAX_SEMENTE;
  } catch {
    return Math.floor(Math.random() * MAX_SEMENTE);
  }
}

export function sementeParaTexto(seed: number): string {
  return (Math.max(0, Math.floor(seed)) % MAX_SEMENTE).toString(36).padStart(LARG_SEMENTE, '0');
}

export function textoParaSemente(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t.length !== LARG_SEMENTE || !B36.test(t)) return null;
  const n = parseInt(t, 36);
  return Number.isFinite(n) && n >= 0 && n < MAX_SEMENTE ? n : null;
}

function estadoDe(r: Resposta | undefined): number {
  if (r === undefined) return 0;
  if (r === 'pular') return 1;
  return r + 4; // −2..+2 → 2..6
}

function respostaDe(estado: number): Resposta | undefined {
  if (estado === 0) return undefined;
  if (estado === 1) return 'pular';
  return (estado - 4) as ValorLikert;
}

/** 24 caracteres: as respostas na ordem canônica (ver cabeçalho). "Importante" só vale para respostas na escala. */
export function codificarRespostas(respostas: Respostas, importantes: Iterable<string> = []): string {
  const imp = new Set(importantes);
  return AFIRMACOES.map((a) => {
    const r = respostas[a.id];
    const e = estadoDe(ehResposta(r) ? r : undefined);
    const marcado = imp.has(a.id) && e >= 2;
    return (e + (marcado ? 7 : 0)).toString(36);
  }).join('');
}

export function decodificarRespostas(
  s: string | null | undefined,
): Pick<CodigoSintonia, 'respostas' | 'importantes'> | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t.length !== TAMANHO_RESPOSTAS || !B36.test(t)) return null;
  const respostas: Partial<Record<string, Resposta>> = {};
  const importantes: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const d = parseInt(t[i], 36);
    if (!(d >= 0 && d <= 13)) return null;
    const marcado = d >= 7;
    const r = respostaDe(marcado ? d - 7 : d);
    if (marcado && (r === undefined || r === 'pular')) return null; // combinação inválida
    const id = AFIRMACOES[i].id;
    if (r !== undefined) respostas[id] = r;
    if (marcado) importantes.push(id);
  }
  return { respostas, importantes };
}

/** Código completo (30 caracteres): versão + semente + respostas. */
export function codificar(seed: number, respostas: Respostas, importantes: Iterable<string> = []): string {
  return VERSAO_CODIGO + sementeParaTexto(seed) + codificarRespostas(respostas, importantes);
}

/** Decodifica o código completo (aceita "#" no início); null se inválido ou de outra versão. */
export function decodificar(codigo: string | null | undefined): CodigoSintonia | null {
  if (!codigo) return null;
  const t = codigo.trim().replace(/^#/, '').toLowerCase();
  if (t.length !== TAMANHO_CODIGO || t[0] !== VERSAO_CODIGO) return null;
  const seed = textoParaSemente(t.slice(1, 1 + LARG_SEMENTE));
  const resp = decodificarRespostas(t.slice(1 + LARG_SEMENTE));
  return seed === null || !resp ? null : { seed, ...resp };
}

// ── Autoverificação editorial (testes/QA; não roda em produção) ───────────────

/**
 * Termos que denunciam autoria ou enquadramento de campanha: nomes, partidos, marcas de programas, slogans e
 * jargões típicos de um dos lados. Valem para `texto` e `contexto` (o que aparece antes da resposta).
 */
export const TERMOS_PROIBIDOS: readonly RegExp[] = [
  // Pessoas e partidos
  /\bLula\b/i, /\bBolsonaro\b/i, /\bFl[aá]vio\b/i, /\bJair\b/i, /\bMichelle\b/i, /\bDilma\b/i, /\bTemer\b/i,
  /\bPT\b/, /\bPL\b/, /\bPSB\b/, /\bPCdoB\b/i, /\bPSOL\b/i, /\bPDT\b/, /\bPV\b/, /\bpetista/i, /\bbolsonarista/i,
  /\blulista/i, /\b(13|22)\b/,
  // Programas e marcas (dos dois planos)
  /Bolsa Fam[ií]lia/i, /Aux[ií]lio Brasil/i, /P[ée]-de-Meia/i, /Mais M[ée]dicos/i, /Minha Casa/i, /Casa Verde/i,
  /\bPAC\b/, /Farm[aá]cia Popular/i, /Cuidoteca/i, /Desenrola/i, /G[aá]s do Povo/i, /Luz do Povo/i,
  /Luz para Todos/i, /Celular Seguro/i, /Agora tem Especialistas/i, /Nova Ind[uú]stria/i, /Plano Safra/i,
  /Pronaf/i, /Brasil sem (Medo|Fila)/i, /Brasil por Elas/i, /Brasil Mais Barato/i,
  /Brasil que (Prepara|Prospera|Cresce|Cumpre|N[aã]o Volta)/i, /Tesoura[çc]o/i, /Ganha,?[ -]?Ganha/i, /ClarIA/,
  /\bTREVA\b/, /Muralha/i, /Minist[ée]rio da Verdade/i, /Escola sem Partido/i, /c[ií]vico-militar/i, /voucher/i,
  /\bPIX\b/i, /Gov\.br/i, /Petrobras/i, /\bCAIXA\b/,
  // Jargão e slogans de campanha
  /arcabou[çc]o/i, /teto de gastos/i, /\b6x1\b/i, /negociado sobre o legislado/i, /Sul Global/i,
  /narcoterror/i, /doutrina[çc][aã]o/i, /censura/i, /\bgolpe/i, /\bbandid/i, /privil[ée]gio/i,
  /heran[çc]a maldita/i, /justi[çc]a (tribut[aá]ria|social)/i, /garantir direitos/i, /cidad[aã]o de bem/i,
  /\besquerda\b/i, /\bdireita\b/i, /conservador/i, /progressista/i, /\bliberal\b/i, /soberan/i, /patriot/i,
  /ideolog/i, /democr[aá]tic/i, /armamento/i, /fake news/i,
];

/** Lista de problemas (vazia = ok). Usada pelo Vitest. */
export function validarAfirmacoes(lista: readonly Afirmacao[] = AFIRMACOES): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  const textos = new Set<string>();
  const valores: readonly ValorPosicao[] = ['concorda', 'discorda', 'neutro', 'sem-posicao'];

  if (lista.length !== 24) erros.push(`esperadas 24 afirmações, há ${lista.length}`);
  for (const a of lista) {
    if (ids.has(a.id)) erros.push(`id duplicado: ${a.id}`);
    ids.add(a.id);
    if (/13|22/.test(a.id)) erros.push(`${a.id}: id contém número de candidato`);
    if (!TEMA_POR_ID[a.tema]) erros.push(`${a.id}: tema desconhecido ${a.tema}`);
    if (textos.has(a.texto)) erros.push(`${a.id}: texto repetido`);
    textos.add(a.texto);
    if (a.texto.length > 110) erros.push(`${a.id}: texto com ${a.texto.length} caracteres (máx. 110)`);
    if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(a.texto) || !a.texto.endsWith('.')) erros.push(`${a.id}: texto deve ser uma frase completa`);
    if (a.contexto !== undefined && a.contexto.length > 140) erros.push(`${a.id}: contexto longo demais`);
    for (const campo of [a.texto, a.contexto ?? ''])
      for (const re of TERMOS_PROIBIDOS) if (re.test(campo)) erros.push(`${a.id}: termo proibido (${re})`);
    if (a.revisado !== false) erros.push(`${a.id}: revisado deve ser false até revisão humana`);

    for (const c of CANDIDATOS) {
      const p = a.posicoes[c];
      if (!p || !valores.includes(p.valor)) {
        erros.push(`${a.id}/${c}: posição inválida`);
        continue;
      }
      if (p.valor === 'sem-posicao') {
        if (p.fonte) erros.push(`${a.id}/${c}: sem-posicao não deve ter fonte`);
        if (!p.nota?.trim()) erros.push(`${a.id}/${c}: sem-posicao precisa de nota explicando a busca`);
        continue;
      }
      const f = p.fonte;
      if (!f) {
        erros.push(`${a.id}/${c}: ${p.valor} sem fonte`);
        continue;
      }
      const doc = DOCUMENTOS[c];
      if (!f.url.startsWith(`${doc.pdf}#page=`)) erros.push(`${a.id}/${c}: url não aponta para o plano do ${c}`);
      if (!f.url.endsWith(`#page=${f.pagina}`)) erros.push(`${a.id}/${c}: âncora #page diferente de pagina`);
      if (!Number.isInteger(f.pagina) || f.pagina < 1 || f.pagina > doc.paginas) erros.push(`${a.id}/${c}: página fora do documento`);
      if (f.trecho.trim().length < 20 || f.trecho.length > 400) erros.push(`${a.id}/${c}: trecho com tamanho estranho`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.acessadoEm)) erros.push(`${a.id}/${c}: acessadoEm inválido`);
      if (p.confianca === 'media' && !p.nota?.trim()) erros.push(`${a.id}/${c}: confiança média precisa de nota`);
    }
  }

  for (const t of TEMAS) {
    const n = lista.filter((a) => a.tema === t.id).length;
    if (n !== 2) erros.push(`tema ${t.id}: ${n} afirmações (esperado 2)`);
  }

  const eq = resumoEquilibrio(lista);
  if (Math.abs(eq.opostas[13] - eq.opostas[22]) > 1)
    erros.push(`desequilíbrio nas opostas: 13 concorda em ${eq.opostas[13]}, 22 em ${eq.opostas[22]}`);
  if (eq.controles > 2) erros.push(`${eq.controles} afirmações de controle (máx. 2)`);
  if (Math.abs(eq.ladoDoConcordo[13] - eq.ladoDoConcordo[22]) > 1)
    erros.push(`"concordo" aproxima do 13 em ${eq.ladoDoConcordo[13]} e do 22 em ${eq.ladoDoConcordo[22]}`);
  return erros;
}
