/**
 * Anúncios (anunciantes NÃO políticos — ARCHITECTURE §1.5): contrato compartilhado por motor, servidor, admin e app.
 *
 * Vários anunciantes ao mesmo tempo, cada um com os formatos em que aparece e um peso na rotação:
 *  - 'topo'             faixa logo abaixo do cabeçalho, em todas as páginas (a cota MASTER tem prioridade aqui);
 *  - 'rodape'           barra fixa no rodapé do celular (pode ser fechada pelo visitante; volta na próxima visita);
 *  - 'nativo'           cartão "Patrocinado" no meio do conteúdo (home, apuração, curiosidades, governadores…);
 *  - 'teste'            "Teste Cego oferecido por" na tela de resultado do Teste Cego, depois de revelar e longe do
 *                       cartão do resultado (a marca fica com o Teste Cego, nunca com o resultado);
 *  - 'tv'               logo grande no Modo TV (transmissões), fora do placar;
 *  - 'compartilhamento' "Oferecimento: <marca>" no rodapé das imagens de compartilhamento GENÉRICAS (Teste Cego,
 *                       calculadora, capa das curiosidades) — nunca nas de placar, candidato ou resultado;
 *  - 'chat'             "Sala oferecida por <marca>" no topo do chat ao vivo da apuração (fora das mensagens);
 *  - 'live'             "Oferecido por <marca>" nos layouts do modo streamer (/live, fonte de navegador do OBS) —
 *                       sem link (a live é vídeo), fora do placar; a cota MASTER tem prioridade.
 *
 * Regras que valem em todo lugar: sempre rotulado ("Publicidade"/"Patrocinado"/"Oferecido por"); link com
 * rel="sponsored noopener"; nunca colado a número, foto ou nome de candidato (separação visual clara); nada
 * político-eleitoral (declaração + `motivoPolitico`, src/shared/anuncios-politica.ts); sem pop-up,
 * sem som, sem animação piscante. Métricas só agregadas (impressões visíveis e cliques por anúncio/formato/hora),
 * sem cookie, sem IP e sem dado pessoal (LGPD).
 */

import { FORMATOS_MASTER_PRIORITARIO } from './anuncios-escolha';
import { categoriaDoAnuncio, mensagemCategoria, recusaAlcoolNaJanela } from './anuncios-categorias';
import { motivoPolitico } from './anuncios-politica';
import { emailProvisorio } from './contatos';

export const FORMATOS_ANUNCIO = ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento', 'chat', 'live'] as const;
export type FormatoAnuncio = (typeof FORMATOS_ANUNCIO)[number];

export const ROTULO_FORMATO: Record<FormatoAnuncio, string> = {
  topo: 'Faixa no topo (todas as páginas)',
  rodape: 'Barra fixa no rodapé do celular',
  nativo: 'Cartão patrocinado no conteúdo',
  teste: 'Tela de resultado do Teste Cego',
  tv: 'Modo TV',
  compartilhamento: 'Imagens de compartilhamento',
  chat: 'Chat ao vivo da apuração',
  live: 'Modo streamer (lives no OBS)',
};

/**
 * Formatos com impressão medida (o que aparece numa tela do site). 'compartilhamento' circula fora do site (a imagem
 * vai para o X/WhatsApp): não é medido — o painel diz "não medido".
 */
export const FORMATOS_COM_IMPRESSAO: readonly FormatoAnuncio[] = ['topo', 'rodape', 'nativo', 'teste', 'tv', 'chat', 'live'];
/** Formatos com clique medido (têm link no site). O Modo TV e o modo streamer são telas sem link; as imagens, idem. */
export const FORMATOS_COM_CLIQUE: readonly FormatoAnuncio[] = ['topo', 'rodape', 'nativo', 'teste', 'chat'];

/** Cota: 'master' (patrocinador principal: prioridade no topo, na TV e nas imagens) ou 'apoio'. */
export type CotaAnuncio = 'master' | 'apoio';

/** Fundo atrás de uma imagem do anunciante num tema. Tokens `bg-placa-clara` (255 255 255) e `bg-placa-escura`
 *  (17 17 26), IGUAIS nos dois temas. */
export type PlacaLogo = 'nenhuma' | 'clara' | 'escura';
export const PLACAS_LOGO: readonly PlacaLogo[] = ['nenhuma', 'clara', 'escura'];

/**
 * Como desenhar uma imagem do anunciante (logo ou peça). Medido no PAINEL ao enviar (admin/analiseLogo.ts) ou escolhido
 * pelo dono. Opcional: sem ele o site usa o desenho antigo. `proporcao` = largura ÷ altura da imagem GRAVADA (já sem
 * margens vazias).
 */
export interface AjusteImagem {
  /** 0,2–12 */
  proporcao: number;
  placaClaro: PlacaLogo;
  placaEscuro: PlacaLogo;
  origem: 'auto' | 'manual';
  /** imagem opaca com fundo próprio (JPEG com fundo branco, ícone de app): cantos arredondados, sem placa extra */
  comFundo?: true;
}

/** Interruptor do desenho novo: false = o site ignora os ajustes (logo na placa clara quadrada, como antes). */
export const LOGO_NATURAL: boolean = true;

/** Anúncio como o admin cadastra (fica no estado do servidor, `AdminState.anuncios`). */
export interface AnuncioConfig {
  /** identificador estável: a–z, 0–9 e hífen (2–40) */
  id: string;
  /** nome do anunciante (1–40) */
  marca: string;
  /** chamada curta (1–60), ex.: "Pix na hora, sem taxa" */
  titulo: string;
  /** texto de apoio (0–140) */
  texto: string;
  /** texto do botão (1–24), ex.: "Abrir conta" */
  cta: string;
  /** destino https (sem usuário/senha) */
  url: string;
  /** logo: data URI (png, jpeg, webp ou svg; até ~150 KB) — no /api/status vira URL do próprio servidor */
  logo?: string;
  /** peça/criativo opcional (data URI png/jpeg/webp até ~400 KB; proporção livre, exibido inteiro, sem corte) */
  imagem?: string;
  formatos: FormatoAnuncio[];
  /** peso na rotação (1–10) */
  peso: number;
  cota: CotaAnuncio;
  ativo: boolean;
  /** janela de exibição (epoch ms, opcional) */
  inicio?: number | null;
  fim?: number | null;
  /** declaração obrigatória do admin: anunciante e peça sem conteúdo político-eleitoral */
  naoPolitico: true;
  /** como desenhar a `logo` (proporção e placa por tema); sem ele, o desenho antigo */
  logoAjuste?: AjusteImagem;
  /** versão da logo para FUNDO ESCURO: tema escuro, Modo TV/live no escuro e imagens de compartilhamento. Mesma regra da `logo`. */
  logoEscuro?: string;
  logoEscuroAjuste?: AjusteImagem;
  /** como desenhar a peça (`imagem`) */
  imagemAjuste?: AjusteImagem;
  /** RESERVA (empresas do grupo do dono): só aparece onde nenhum anúncio pago está disponível. Sempre cota 'apoio'. */
  reserva?: true;
  /** meta de impressões visíveis contadas desde `inicio`; ao atingir, sai do ar sozinho. Exige `inicio`. Nunca vai ao site. */
  limiteImpressoes?: number | null;
}

/** O que o site recebe (em `LiveStatus.anuncios`): só anúncios ATIVOS e dentro da janela, sem métricas. */
export interface AnuncioPublico {
  id: string;
  marca: string;
  titulo: string;
  texto: string;
  cta: string;
  /** link de clique: no servidor, `/api/anuncio/ir/<id>` (conta o clique e redireciona com UTM); no demo, a URL com UTM */
  href: string;
  /** domínio de destino para exibir ("lynx.com.br") */
  destino: string;
  logo?: string;
  imagem?: string;
  formatos: FormatoAnuncio[];
  peso: number;
  cota: CotaAnuncio;
  /** campos v2 (opcionais; NUNCA `limiteImpressoes`) */
  logoAjuste?: AjusteImagem;
  logoEscuro?: string;
  logoEscuroAjuste?: AjusteImagem;
  imagemAjuste?: AjusteImagem;
  reserva?: true;
}

/** Contato da página /anuncie (configurado no admin). */
export interface ContatoAnuncie {
  email?: string;
  /** só dígitos com DDI, ex.: 5511999999999 */
  whatsapp?: string;
  /** frase opcional no topo da página /anuncie */
  chamada?: string;
}

/** Métricas agregadas de um anúncio num formato (admin). */
export interface MetricaAnuncio {
  id: string;
  formato: FormatoAnuncio;
  impressoes: number;
  cliques: number;
  /** últimas 48 h, por hora (epoch ms do início da hora → contagens) */
  porHora: { hora: number; impressoes: number; cliques: number }[];
}

/** Resposta de GET /api/admin/anuncios/metricas (campos novos opcionais). */
export interface MetricasAnunciosResposta {
  metricas: MetricaAnuncio[];
  desde: number;
  /** impressões visíveis desde o `inicio` de cada anúncio COM meta */
  entregue?: Record<string, number>;
  /** quando a meta foi atingida (epoch ms) */
  esgotadoEm?: Record<string, number>;
  /** pessoas alcançadas (estimativa) na campanha e na noite da eleição */
  alcance?: Record<string, { campanha: number | null; noite: number | null }>;
}

export const ANUNCIO_LIMITES = {
  id: 40,
  marca: 40,
  titulo: 60,
  texto: 140,
  cta: 24,
  url: 500,
  peso: { min: 1, max: 10 },
  /** base64 ≈ 4/3 do binário + cabeçalho */
  logoDataUri: Math.ceil((150 * 1024 * 4) / 3) + 64,
  imagemDataUri: Math.ceil((400 * 1024 * 4) / 3) + 64,
  /** anúncios cadastrados (ativos ou não) */
  maxAnuncios: 24,
  chamada: 160,
  email: 120,
  /** meta de impressões visíveis (E16) */
  limiteImpressoes: { min: 1_000, max: 50_000_000 },
} as const;

const RE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RE_LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const RE_IMAGEM = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** URL de imagem já servida pelo próprio servidor (estado restaurado/ida e volta do admin) */
const RE_IMG_SERVIDOR = /^(https?:\/\/[^\s/]+)?\/api\/anuncio\/img\?h=[a-f0-9]{8,64}$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** https válida, sem usuário/senha, com domínio. */
export function urlAnuncioValida(v: string): boolean {
  if (!v || v.length > ANUNCIO_LIMITES.url || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** "lynx.com.br" a partir da URL. */
export function dominioAnuncio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Gera um id a partir da marca ("Lynx Pay" → "lynx-pay"); o admin pode trocar. */
export function idDaMarca(marca: string): string {
  const base = marca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ANUNCIO_LIMITES.id)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : `anuncio-${base || 'novo'}`;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
}

function epochOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : NaN;
}

// ---- contrato v2: ajuste das imagens, animação, logo e master sobreposto ---------------------------------

/**
 * Ajuste de imagem vindo do painel (ou do estado salvo), normalizado. Nunca lança: ajuste inválido (não é objeto ou
 * `proporcao` fora de 0,2–12) → undefined, e o site usa o desenho antigo. Placa desconhecida vira 'nenhuma'; `origem`
 * diferente de 'manual' vira 'auto'; `comFundo` só quando for exatamente `true`.
 */
export function validaAjusteImagem(v: unknown): AjusteImagem | undefined {
  if (!isObj(v)) return undefined;
  const p = v.proporcao;
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0.2 || p > 12) return undefined;
  const placa = (x: unknown): PlacaLogo => ((PLACAS_LOGO as readonly unknown[]).includes(x) ? (x as PlacaLogo) : 'nenhuma');
  const out: AjusteImagem = {
    proporcao: Math.round(p * 1000) / 1000,
    placaClaro: placa(v.placaClaro),
    placaEscuro: placa(v.placaEscuro),
    origem: v.origem === 'manual' ? 'manual' : 'auto',
  };
  if (v.comFundo === true) out.comFundo = true;
  return out;
}

/** Começo de um base64 decodificado como "string binária" (1 caractere = 1 byte), até `maxChars` caracteres do base64
 *  (múltiplo de 4). Base64 malformado → null. */
function binarioBase64(b64: string, maxChars: number): string | null {
  const parte = b64.length > maxChars ? b64.slice(0, maxChars - (maxChars % 4)) : b64;
  try {
    return atob(parte);
  } catch {
    return null;
  }
}

/** SVG com animação (SMIL ou CSS). */
const RE_SVG_ANIMADO = /<animate|<animateTransform|<animateMotion|<set[\s>]|@keyframes|animation(-name)?\s*:/i;

/**
 * Imagem animada (data URI)? O Sintonia só exibe imagens paradas (sem pisca, sem animação). Lê no máximo os primeiros
 * 64 KB do base64 (o SVG, inteiro), com `atob` (Node ≥ 16 e navegador). O tipo vem dos BYTES (o navegador também
 * reconhece pelo conteúdo, não pelo rótulo do data URI):
 *  - PNG: percorre os chunks a partir do byte 8 — animado (APNG) se houver `acTL` antes de `IDAT`;
 *  - WebP: animado se o `VP8X` tiver o bit 0x02 no byte 20, ou se houver chunk `ANIM` ou `ANMF`;
 *  - GIF (formato não aceito; aqui só se vier com o rótulo de outro tipo): tratado como animado (lado seguro);
 *  - SVG (pelo rótulo `image/svg+xml`): `<animate…>`, `<set>`, `@keyframes` ou `animation:`;
 *  - outro (JPEG, URL do servidor…): false.
 */
export function imagemAnimada(dataUri: string): boolean {
  const m = /^data:([^;,]*)(;[^,]*)?,/.exec(dataUri);
  if (!m || !/;base64$/i.test(m[2] ?? '')) return false;
  const svg = /svg/i.test(m[1]);
  const b = binarioBase64(dataUri.slice(m[0].length), svg ? Number.MAX_SAFE_INTEGER : 64 * 1024);
  if (!b || b.length < 4) return false;
  const byte = (i: number) => b.charCodeAt(i);
  // PNG: assinatura 89 50 4E 47 0D 0A 1A 0A; cada chunk = tamanho (4, big-endian) + tipo (4) + dados + CRC (4)
  if (b.startsWith('\x89PNG\r\n\x1a\n')) {
    for (let i = 8; i + 8 <= b.length; ) {
      const tam = byte(i) * 0x1000000 + (byte(i + 1) << 16) + (byte(i + 2) << 8) + byte(i + 3);
      const tipo = b.slice(i + 4, i + 8);
      if (tipo === 'acTL') return true;
      if (tipo === 'IDAT' || tipo === 'IEND') return false;
      i += 12 + tam;
    }
    return false;
  }
  // WebP: "RIFF" <tamanho> "WEBP" e chunks a partir do byte 12 (tipo (4) + tamanho (4, little-endian) + dados, par)
  if (b.length >= 16 && b.startsWith('RIFF') && b.slice(8, 12) === 'WEBP') {
    if (b.slice(12, 16) === 'VP8X' && b.length > 20 && (byte(20) & 0x02) !== 0) return true;
    for (let i = 12; i + 8 <= b.length; ) {
      const tipo = b.slice(i, i + 4);
      if (tipo === 'ANIM' || tipo === 'ANMF') return true;
      const tam = byte(i + 4) + (byte(i + 5) << 8) + (byte(i + 6) << 16) + byte(i + 7) * 0x1000000;
      i += 8 + tam + (tam % 2);
    }
    return false;
  }
  if (b.startsWith('GIF8')) return true;
  if (svg) return RE_SVG_ANIMADO.test(b);
  return false;
}

/** Mensagem única para imagem animada (logo, versão escura ou peça). */
export const ERRO_IMAGEM_ANIMADA = 'Anúncio: use uma imagem parada (sem animação).';

/**
 * Regra ÚNICA da logo (e da versão para fundo escuro): usada por `validaAnuncio` e pelo comando 'anuncio-logo'.
 * `logo` e `logoEscuro`: data URI png/jpeg/webp/svg até 150 KB e parada, ou a URL que o próprio servidor serve. Cada
 * ajuste só fica se a imagem correspondente existir (e for válido — `validaAjusteImagem`).
 */
export function validaLogoAnuncio(v: unknown): { ok: Pick<AnuncioConfig, 'logo' | 'logoAjuste' | 'logoEscuro' | 'logoEscuroAjuste'> } | { erro: string } {
  const o = isObj(v) ? v : {};
  const out: Pick<AnuncioConfig, 'logo' | 'logoAjuste' | 'logoEscuro' | 'logoEscuroAjuste'> = {};
  const campos = [
    ['logo', 'logoAjuste', 'logo'],
    ['logoEscuro', 'logoEscuroAjuste', 'versão para fundo escuro'],
  ] as const;
  for (const [campo, campoAjuste, nome] of campos) {
    const img = typeof o[campo] === 'string' ? (o[campo] as string).trim() : '';
    if (!img) continue;
    if (!RE_IMG_SERVIDOR.test(img)) {
      if (img.length > ANUNCIO_LIMITES.logoDataUri || !RE_LOGO.test(img)) return { erro: `Anúncio: ${nome} em PNG, JPEG, WebP ou SVG de até 150 KB.` };
      if (imagemAnimada(img)) return { erro: ERRO_IMAGEM_ANIMADA };
    }
    out[campo] = img;
    const ajuste = validaAjusteImagem(o[campoAjuste]);
    if (ajuste) out[campoAjuste] = ajuste;
  }
  return { ok: out };
}

/** Janela [inicio, fim) de um anúncio; null/ausente/0 = aberta. Janelas encostadas (fim = início) não se cruzam. */
function janelasSeCruzam(a: { inicio?: number | null; fim?: number | null }, b: { inicio?: number | null; fim?: number | null }): boolean {
  const ini = (x: number | null | undefined) => (x ? x : -Infinity);
  const fim = (x: number | null | undefined) => (x ? x : Infinity);
  return ini(a.inicio) < fim(b.fim) && ini(b.inicio) < fim(a.fim);
}

type AnuncioParaConflito = Pick<AnuncioConfig, 'id' | 'marca' | 'formatos' | 'cota' | 'ativo' | 'inicio' | 'fim' | 'reserva'>;

/**
 * Master sobreposto (venda): o `candidato` e outro anúncio da `lista` são master, sem reserva e ativos, têm ids
 * diferentes, dividem um formato de `FORMATOS_MASTER_PRIORITARIO` e as janelas se cruzam. Devolve o 1º conflito (pela
 * ordem da lista; o formato pela ordem de `FORMATOS_MASTER_PRIORITARIO`) ou null.
 */
export function conflitoMaster(lista: readonly AnuncioParaConflito[], candidato: AnuncioParaConflito): { id: string; marca: string; formato: FormatoAnuncio } | null {
  const elegivel = (a: AnuncioParaConflito) => a.cota === 'master' && !a.reserva && a.ativo;
  if (!elegivel(candidato)) return null;
  for (const outro of lista) {
    if (outro.id === candidato.id || !elegivel(outro)) continue;
    const formato = FORMATOS_MASTER_PRIORITARIO.find((f) => candidato.formatos.includes(f) && outro.formatos.includes(f));
    if (formato && janelasSeCruzam(candidato, outro)) return { id: outro.id, marca: outro.marca, formato };
  }
  return null;
}

/** Opções de `validaAnuncio`. */
export interface OpcoesValidaAnuncio {
  /** nomes de candidatos (nome de urna e nome completo, do dataset): anúncio que os cite é recusado */
  nomesCandidatos?: readonly string[];
}

/**
 * Valida e normaliza um anúncio vindo do admin (ou do estado salvo). Devolve só os campos do contrato (o painel envia
 * `validacao.ok`: campo que não sai daqui some no salvar).
 * Imagens: data URI (limites acima) ou a URL que o próprio servidor serve (ida e volta pelo admin — o servidor
 * reconhece e mantém a imagem que já tem); imagem animada é recusada. Conteúdo político-eleitoral é recusado
 * (`motivoPolitico`), além da declaração obrigatória; logo depois, as categorias sensíveis (`anuncios-categorias.ts`:
 * apostas, cassino e mercados de previsão recusados; bebida alcoólica fora do ar em 25/10 até as 17h).
 * v2: ajustes das imagens, versão escura da logo, `reserva` (força a cota 'apoio') e meta de impressões (exige início).
 */
export function validaAnuncio(v: unknown, opcoes: OpcoesValidaAnuncio = {}): { ok: AnuncioConfig } | { erro: string } {
  if (!isObj(v)) return { erro: 'Anúncio inválido.' };
  const L = ANUNCIO_LIMITES;
  const id = texto(v.id).toLowerCase();
  if (!RE_ID.test(id) || id.length < 2) return { erro: 'Anúncio: "id" com 2 a 40 caracteres (letras minúsculas, números e hífen).' };
  const marca = texto(v.marca);
  if (!marca || marca.length > L.marca) return { erro: `Anúncio: "marca" é obrigatória (até ${L.marca} caracteres).` };
  const titulo = texto(v.titulo);
  if (!titulo || titulo.length > L.titulo) return { erro: `Anúncio: "título" é obrigatório (até ${L.titulo} caracteres).` };
  const t = texto(v.texto);
  if (t.length > L.texto) return { erro: `Anúncio: "texto" com até ${L.texto} caracteres.` };
  const cta = texto(v.cta);
  if (!cta || cta.length > L.cta) return { erro: `Anúncio: "botão" é obrigatório (até ${L.cta} caracteres).` };
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  if (!urlAnuncioValida(url)) return { erro: 'Anúncio: o link precisa ser um endereço https:// válido.' };
  if (v.naoPolitico !== true) return { erro: 'Anúncio: confirme que o anunciante e a peça não têm conteúdo político-eleitoral.' };
  const politico = motivoPolitico(
    [
      { campo: 'marca', valor: marca },
      { campo: 'título', valor: titulo },
      { campo: 'texto', valor: t },
      { campo: 'botão', valor: cta },
    ],
    url,
    opcoes.nomesCandidatos,
  );
  if (politico) return { erro: politico };
  const categoria = categoriaDoAnuncio(
    [
      { campo: 'marca', valor: marca },
      { campo: 'título', valor: titulo },
      { campo: 'texto', valor: t },
      { campo: 'botão', valor: cta },
    ],
    url,
  );
  if (categoria && categoria.categoria !== 'alcool') return { erro: mensagemCategoria(categoria) };

  const formatos = Array.isArray(v.formatos) ? [...new Set(v.formatos)].filter((f): f is FormatoAnuncio => (FORMATOS_ANUNCIO as readonly unknown[]).includes(f)) : [];
  if (formatos.length === 0) return { erro: 'Anúncio: escolha pelo menos um formato.' };
  const peso = typeof v.peso === 'number' && Number.isFinite(v.peso) ? Math.round(v.peso) : 5;
  if (peso < L.peso.min || peso > L.peso.max) return { erro: `Anúncio: peso de ${L.peso.min} a ${L.peso.max}.` };
  const reserva = v.reserva === true;
  // RESERVA (empresas do grupo do dono) é sempre cota 'apoio': nunca disputa a prioridade do master
  const cota: CotaAnuncio = !reserva && v.cota === 'master' ? 'master' : 'apoio';
  const inicio = epochOuNull(v.inicio);
  const fim = epochOuNull(v.fim);
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return { erro: 'Anúncio: datas de início/fim inválidas.' };
  if (inicio !== null && fim !== null && fim <= inicio) return { erro: 'Anúncio: o fim precisa ser depois do início.' };
  if (categoria?.categoria === 'alcool') {
    const alcool = recusaAlcoolNaJanela(categoria, { inicio, fim });
    if (alcool) return { erro: alcool };
  }
  let limiteImpressoes: number | null = null;
  if (v.limiteImpressoes !== null && v.limiteImpressoes !== undefined) {
    const n = v.limiteImpressoes;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < L.limiteImpressoes.min || n > L.limiteImpressoes.max)
      return { erro: 'Anúncio: meta de impressões de 1.000 a 50.000.000.' };
    if (inicio === null) return { erro: 'Anúncio: com meta de impressões, informe o início.' };
    limiteImpressoes = n;
  }

  const out: AnuncioConfig = {
    id,
    marca,
    titulo,
    texto: t,
    cta,
    url,
    formatos: FORMATOS_ANUNCIO.filter((f) => formatos.includes(f)),
    peso,
    cota,
    ativo: v.ativo !== false,
    inicio,
    fim,
    naoPolitico: true,
  };
  const logo = validaLogoAnuncio(v);
  if ('erro' in logo) return logo;
  Object.assign(out, logo.ok);
  const imagem = typeof v.imagem === 'string' ? v.imagem.trim() : '';
  if (imagem) {
    if (!RE_IMG_SERVIDOR.test(imagem)) {
      if (imagem.length > L.imagemDataUri || !RE_IMAGEM.test(imagem)) return { erro: 'Anúncio: peça em PNG, JPEG ou WebP de até 400 KB.' };
      if (imagemAnimada(imagem)) return { erro: ERRO_IMAGEM_ANIMADA };
    }
    out.imagem = imagem;
    const ajuste = validaAjusteImagem(v.imagemAjuste);
    if (ajuste) out.imagemAjuste = ajuste;
  }
  if (reserva) out.reserva = true;
  if (limiteImpressoes !== null) out.limiteImpressoes = limiteImpressoes;
  return { ok: out };
}

/** Valida o contato da página /anuncie. */
export function validaContatoAnuncie(v: unknown): { ok: ContatoAnuncie } | { erro: string } {
  if (v === null || v === undefined) return { ok: {} };
  if (!isObj(v)) return { erro: 'Contato inválido.' };
  const out: ContatoAnuncie = {};
  const email = texto(v.email);
  if (email) {
    if (email.length > ANUNCIO_LIMITES.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: 'Contato: e-mail inválido.' };
    // domínio reservado (`.example`, `example.com`…) não recebe e-mail: o site nunca publica endereço provisório
    if (emailProvisorio(email)) return { erro: `Contato: o e-mail usa um domínio reservado (${email.split('@')[1]}), que não recebe e-mail.` };
    out.email = email;
  }
  const whatsapp = texto(v.whatsapp).replace(/\D/g, '');
  if (whatsapp) {
    if (whatsapp.length < 10 || whatsapp.length > 15) return { erro: 'Contato: WhatsApp com DDI e DDD, só números (ex.: 5511999999999).' };
    out.whatsapp = whatsapp;
  }
  const chamada = texto(v.chamada);
  if (chamada) {
    if (chamada.length > ANUNCIO_LIMITES.chamada) return { erro: `Contato: chamada com até ${ANUNCIO_LIMITES.chamada} caracteres.` };
    out.chamada = chamada;
  }
  return { ok: out };
}

/** Ativo e dentro da janela no instante `agora` (relógio real, epoch ms). */
export function anuncioNoAr(a: Pick<AnuncioConfig, 'ativo' | 'inicio' | 'fim'>, agora: number): boolean {
  if (!a.ativo) return false;
  if (a.inicio && agora < a.inicio) return false;
  if (a.fim && agora >= a.fim) return false;
  return true;
}

/**
 * `utm_medium` de cada formato. O do Teste Cego sai neutro ('conteudo', como o cartão nativo seria lido): a UTM não
 * conta ao anunciante que aquela visita fez o Teste Cego (opinião política é dado sensível — LGPD).
 */
export function mediumUtm(formato: FormatoAnuncio | 'link'): string {
  return formato === 'teste' ? 'conteudo' : formato;
}

/** URL de destino com UTM (utm_source=sintonia, utm_medium=`mediumUtm(formato)`, utm_campaign=<id>), sem apagar parâmetros do anunciante. */
export function urlComUtm(url: string, id: string, formato: FormatoAnuncio | 'link'): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'sintonia');
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', mediumUtm(formato));
    if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', id);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Escolha do anúncio de cada posição: mora em `anuncios-escolha.ts` (módulo pequeno, sem a validação, que é tudo o que
 * o site precisa no JS inicial) e é reexportada aqui — o contrato continua o mesmo.
 */
export { escolherAnuncio, FORMATOS_MASTER_PRIORITARIO } from './anuncios-escolha';
