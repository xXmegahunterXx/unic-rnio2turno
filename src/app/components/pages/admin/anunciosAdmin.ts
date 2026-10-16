/**
 * Utilidades da seção "Anunciantes" do painel (puras, sem React): situação de cada anúncio, horário de Brasília nos
 * campos de data, agregação das métricas (totais, últimas 48 h, CTR), CSV do relatório de entrega e o preparo das
 * imagens no navegador (analiseLogo.ts: logo recortada e medida, PNG até 150 KB; peça até 1600 px / 400 KB — só
 * recortar margens vazias, redimensionar e recodificar, nunca editar).
 *
 * Anunciantes v2 (vendas): `participacao` (fatia real de cada anúncio por formato, "Espaços agora"), `avisosDoAnuncio`,
 * `duplicarAnuncio`, `atalhosData` e a meta de impressões (`previsaoEntrega`, `aCreditar`).
 */
import {
  FORMATOS_ANUNCIO,
  FORMATOS_MASTER_PRIORITARIO,
  NOME_CURTO_FORMATO,
  ROTULO_FORMATO,
  anuncioNoAr,
  type AnuncioConfig,
  type CotaAnuncio,
  type FormatoAnuncio,
  type MetricaAnuncio,
} from '@/shared/anuncios';
import { avisoCategoria } from '@/shared/anuncios-categorias';
import { NOITE_ELEICAO } from '@/shared/relatorio';
import { fmtCompact, fmtDataHora, fmtDecimal, fmtHora, fmtInt } from '@/shared/format';
import { ErroImagem, kbDeUri, linhaDimensoes, prepararLogoV2, prepararPecaV2, type ImagemPreparadaV2, type LogoPreparada } from './analiseLogo';

/** Onde cada formato aparece (uma frase, para o formulário). */
export const ONDE_APARECE: Record<FormatoAnuncio, string> = {
  topo: 'Faixa logo abaixo do cabeçalho, em todas as páginas. A cota master tem prioridade.',
  rodape: 'Barra fixa no pé da tela do celular; o visitante pode fechar (volta na próxima visita).',
  nativo: 'Cartão “Patrocinado” no meio do conteúdo: home, apuração, curiosidades, governadores.',
  teste: '“Teste Cego oferecido por” na tela de resultado do Teste Cego, depois de revelar e longe do cartão do resultado.',
  tv: 'Logo grande no Modo TV (telões e transmissões ao vivo).',
  compartilhamento: '“Oferecimento: marca” no rodapé das imagens genéricas (Teste Cego, calculadora, curiosidades) que vão para o X e o WhatsApp; nunca nas de placar ou candidato. Não medido.',
  chat: '“Sala oferecida por marca” no topo do chat ao vivo da apuração, fora das mensagens.',
  live: '“Oferecido por marca” nos layouts do modo streamer (/live), usados por quem transmite a apuração no OBS. Sem link (é vídeo); a cota master tem prioridade.',
};

export const ROTULO_CURTO: Record<FormatoAnuncio, string> = {
  topo: 'Topo',
  rodape: 'Rodapé',
  nativo: 'Nativo',
  teste: 'Teste Cego',
  tv: 'Modo TV',
  compartilhamento: 'Imagens',
  chat: 'Chat',
  live: 'Lives',
};

export { ROTULO_FORMATO, FORMATOS_ANUNCIO };

// ---- situação ---------------------------------------------------------------------------------------

export type Situacao = 'no-ar' | 'agendado' | 'pausado' | 'encerrado' | 'meta-atingida';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  'no-ar': 'No ar',
  agendado: 'Agendado',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
  'meta-atingida': 'Meta atingida',
};

/**
 * Situação no instante `agora` (relógio real do servidor). `esgotadoEm`: quando a meta de impressões foi atingida
 * (`MetricasAnunciosResposta.esgotadoEm`) — o anúncio saiu do site sozinho até a meta aumentar ou sair.
 */
export function situacaoDe(a: Pick<AnuncioConfig, 'ativo' | 'inicio' | 'fim'>, agora: number, esgotadoEm?: number | null): Situacao {
  if (!a.ativo) return 'pausado';
  if (a.fim && agora >= a.fim) return 'encerrado';
  if (a.inicio && agora < a.inicio) return 'agendado';
  if (esgotadoEm) return 'meta-atingida';
  return anuncioNoAr(a, agora) ? 'no-ar' : 'pausado';
}

// ---- horário de Brasília nos campos datetime-local ---------------------------------------------------

/** Brasília sem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRT_MS = 3 * 3600_000;

/** epoch ms → "2026-10-25T17:00" (horário de Brasília), para `<input type="datetime-local">`. */
export function paraCampoData(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '';
  return new Date(ms - OFFSET_BRT_MS).toISOString().slice(0, 16);
}

/** "2026-10-25T17:00" (Brasília) → epoch ms; vazio → null; inválido → NaN. */
export function deCampoData(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return Number.NaN;
  const ms = Date.parse(`${s.length === 16 ? `${s}:00` : s}-03:00`);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

// ---- métricas -------------------------------------------------------------------------------------------

export interface Totais {
  impressoes: number;
  cliques: number;
}

/** Taxa de cliques (%) — null sem impressões. */
export const ctr = (t: Totais): number | null => (t.impressoes > 0 ? (100 * t.cliques) / t.impressoes : null);

/** Totais de um anúncio (todos os formatos) ou de todos (`id` ausente). */
export function totaisDe(metricas: readonly MetricaAnuncio[], id?: string): Totais {
  let impressoes = 0;
  let cliques = 0;
  for (const m of metricas) {
    if (id !== undefined && m.id !== id) continue;
    impressoes += m.impressoes;
    cliques += m.cliques;
  }
  return { impressoes, cliques };
}

export const HORA_MS = 3_600_000;

/**
 * Últimas `horas` horas (a mais antiga primeiro), somando os formatos de um anúncio (ou de todos): uma posição por
 * hora, zeros onde não houve contagem.
 */
export function serieHoras(metricas: readonly MetricaAnuncio[], agora: number, id?: string, horas = 48): { hora: number; impressoes: number; cliques: number }[] {
  const fim = Math.floor(agora / HORA_MS) * HORA_MS;
  const ini = fim - (horas - 1) * HORA_MS;
  const out = Array.from({ length: horas }, (_, i) => ({ hora: ini + i * HORA_MS, impressoes: 0, cliques: 0 }));
  for (const m of metricas) {
    if (id !== undefined && m.id !== id) continue;
    for (const p of m.porHora) {
      const i = Math.round((p.hora - ini) / HORA_MS);
      if (i < 0 || i >= horas) continue;
      out[i].impressoes += p.impressoes;
      out[i].cliques += p.cliques;
    }
  }
  return out;
}

/** Soma das últimas 48 h. */
export function totais48h(metricas: readonly MetricaAnuncio[], agora: number, id?: string): Totais {
  return serieHoras(metricas, agora, id).reduce((s, p) => ({ impressoes: s.impressoes + p.impressoes, cliques: s.cliques + p.cliques }), { impressoes: 0, cliques: 0 });
}

/** Linhas do relatório de entrega: por anúncio e formato (inclui ids que já não existem, marcados "removido"). */
export function linhasRelatorio(
  metricas: readonly MetricaAnuncio[],
  anuncios: readonly Pick<AnuncioConfig, 'id' | 'marca'>[],
): { id: string; marca: string; removido: boolean; formatos: (Totais & { formato: FormatoAnuncio })[]; total: Totais }[] {
  const ids = [...new Set([...anuncios.map((a) => a.id), ...metricas.map((m) => m.id)])];
  return ids
    .map((id) => {
      const a = anuncios.find((x) => x.id === id);
      const formatos = FORMATOS_ANUNCIO.map((formato) => {
        const m = metricas.find((x) => x.id === id && x.formato === formato);
        return { formato, impressoes: m?.impressoes ?? 0, cliques: m?.cliques ?? 0 };
      }).filter((f) => f.impressoes > 0 || f.cliques > 0);
      return { id, marca: a?.marca ?? id, removido: !a, formatos, total: totaisDe(metricas, id) };
    })
    .filter((l) => !l.removido || l.total.impressoes > 0 || l.total.cliques > 0);
}

// ---- CSV ------------------------------------------------------------------------------------------------

/**
 * Campo do CSV. Texto que começa com = + - @ TAB ou CR (a marca é texto livre do anunciante) ganha um apóstrofo na
 * frente: o Excel/Planilhas trataria como fórmula mesmo entre aspas (=HYPERLINK(…) vira link clicável). O mesmo vale
 * para um trecho que começa logo depois de "," ";" TAB ou quebra de linha (uma planilha que separe por VÍRGULA — Excel
 * em inglês, importação automática — leria "ACME,=cmd|…" como duas células). Campo com " ; , TAB ou quebra de linha
 * vai entre aspas. Números vêm do código e seguem como estão.
 */
export const csvCampo = (v: string | number) => {
  const s0 = String(v);
  if (typeof v !== 'string') return s0;
  const s = (/^[=+\-@\t\r]/.test(s0) ? `'${s0}` : s0).replace(/([,;\t\r\n][ \t]*)([=+\-@])/g, "$1'$2");
  // número com vírgula decimal ("1,20", gerado pelo código) fica sem aspas: a planilha em pt-BR lê como número
  return /[";\n\r\t]/.test(s) || (s.includes(',') && !/^-?\d+(,\d+)?$/.test(s)) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Campo de TEXTO LIVRE (escrito por visitante): sempre entre aspas, além das proteções de `csvCampo`. */
export const csvTexto = (v: string) => {
  const c = csvCampo(v);
  return c.startsWith('"') ? c : `"${c.replace(/"/g, '""')}"`;
};

/** CSV (separador ";", decimal com vírgula — abre direto no Excel/Planilhas em pt-BR) com BOM UTF-8. */
function csv(linhas: (string | number)[][]): string {
  return `﻿${linhas.map((l) => l.map(csvCampo).join(';')).join('\r\n')}\r\n`;
}

const ctrCsv = (t: Totais) => {
  const c = ctr(t);
  return c === null ? '' : fmtDecimal(c, 2);
};

/** Relatório de entrega: uma linha por anúncio × formato (e o total do anúncio). */
export function csvRelatorio(
  metricas: readonly MetricaAnuncio[],
  anuncios: readonly Pick<AnuncioConfig, 'id' | 'marca'>[],
  desde: number,
  agora: number,
): string {
  const linhas: (string | number)[][] = [['anuncio', 'marca', 'formato', 'impressoes_visiveis', 'cliques', 'ctr_pct', 'desde', 'gerado_em']];
  const iso = (ms: number) => new Date(ms).toISOString();
  for (const l of linhasRelatorio(metricas, anuncios)) {
    for (const f of l.formatos) linhas.push([l.id, l.marca, f.formato, f.impressoes, f.cliques, ctrCsv(f), iso(desde), iso(agora)]);
    linhas.push([l.id, l.marca, 'total', l.total.impressoes, l.total.cliques, ctrCsv(l.total), iso(desde), iso(agora)]);
  }
  return csv(linhas);
}

/** Detalhe por hora (últimas 48 h): anúncio × formato × hora. */
export function csvPorHora(metricas: readonly MetricaAnuncio[], anuncios: readonly Pick<AnuncioConfig, 'id' | 'marca'>[]): string {
  const linhas: (string | number)[][] = [['anuncio', 'marca', 'formato', 'hora_inicio', 'impressoes_visiveis', 'cliques']];
  for (const m of metricas) {
    const marca = anuncios.find((a) => a.id === m.id)?.marca ?? m.id;
    for (const p of m.porHora) linhas.push([m.id, marca, m.formato, new Date(p.hora).toISOString(), p.impressoes, p.cliques]);
  }
  return csv(linhas);
}

/** Baixa um texto como arquivo (no navegador). */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

// ---- imagens (navegador) -------------------------------------------------------------------------------

/** Tamanho aproximado do arquivo de um data URI (KB). */
export const kbDe = kbDeUri;

export interface ImagemPreparada {
  uri: string;
  /** "512 × 512 px → 431 × 134 px (margens vazias cortadas) · 29 KB" */
  info: string;
}

/**
 * Logo: delega para `prepararLogoV2` (analiseLogo.ts) — recorta as margens vazias, mede o contraste nos dois temas e
 * grava PNG (até 150 KB; opaca e pesada pode ir em JPEG). Devolve também o ajuste e a análise.
 */
export async function prepararLogo(f: File): Promise<ImagemPreparada & LogoPreparada> {
  try {
    const p = await prepararLogoV2(f);
    return { ...p, info: linhaDimensoes(p) };
  } catch (e) {
    throw e instanceof ErroImagem ? e : new Error('Não foi possível ler a imagem.');
  }
}

/** Peça: delega para `prepararPecaV2` (sempre redesenhada; com transparência nunca vira JPEG). */
export async function prepararPeca(f: File): Promise<ImagemPreparada & ImagemPreparadaV2> {
  try {
    const p = await prepararPecaV2(f);
    return { ...p, info: linhaDimensoes(p) };
  } catch (e) {
    throw e instanceof ErroImagem ? e : new Error('Não foi possível ler a imagem.');
  }
}

// ---- vendas: fatia real por formato ("Espaços agora") ------------------------------------------------------

/** Anúncio na conta da participação. */
type ParaFatia = Pick<AnuncioConfig, 'id' | 'marca' | 'formatos' | 'peso' | 'cota' | 'ativo' | 'inicio' | 'fim' | 'reserva'>;

export interface Fatia {
  id: string;
  marca: string;
  cota: CotaAnuncio;
  reserva: boolean;
  /** 0–1 */
  fatia: number;
  /** a fatia em % inteiro, arredondada pelo maior resto (as do formato somam 100) */
  pct: number;
}

/** Percentuais inteiros que somam 100 (maior resto), na ordem das fatias. */
export function pctInteiros(fatias: readonly number[]): number[] {
  const brutos = fatias.map((f) => f * 100);
  const base = brutos.map(Math.floor);
  let falta = Math.round(brutos.reduce((s, v) => s + v, 0)) - base.reduce((s, v) => s + v, 0);
  const ordem = brutos.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of ordem) {
    if (falta <= 0) break;
    base[i]++;
    falta--;
  }
  return base;
}

export interface ForaDoAr {
  /** ids com a meta de impressões atingida (saíram do site sozinhos) */
  esgotados?: Iterable<string>;
  /** interruptor geral ligado: nada no ar */
  suspenso?: boolean;
}

/**
 * Participação estimada de cada anúncio num formato agora, pela regra da rotação (`escolherAnuncio`): só os anúncios
 * no ar e com o formato (sem os de meta atingida); nos formatos de `FORMATOS_MASTER_PRIORITARIO`, havendo master (sem
 * reserva), só os masters; havendo pago, a reserva fica de fora; fatia = peso ÷ soma dos pesos. Maior fatia primeiro;
 * [] = formato vazio.
 */
export function participacao(anuncios: readonly ParaFatia[], formato: FormatoAnuncio, agora: number, fora: ForaDoAr = {}): Fatia[] {
  if (fora.suspenso) return [];
  const esgotados = new Set(fora.esgotados ?? []);
  let pool = anuncios.filter((a) => a.formatos.includes(formato) && anuncioNoAr(a, agora) && !esgotados.has(a.id));
  if (FORMATOS_MASTER_PRIORITARIO.includes(formato)) {
    const master = pool.filter((a) => a.cota === 'master' && !a.reserva);
    if (master.length) pool = master;
  }
  const pagos = pool.filter((a) => !a.reserva);
  if (pagos.length) pool = pagos;
  const total = pool.reduce((s, a) => s + Math.max(1, a.peso), 0);
  const lista = pool
    .map((a) => ({ id: a.id, marca: a.marca, cota: a.cota, reserva: !!a.reserva, fatia: Math.max(1, a.peso) / total, pct: 0 }))
    .sort((x, y) => y.fatia - x.fatia || x.marca.localeCompare(y.marca, 'pt-BR'));
  const pcts = pctInteiros(lista.map((x) => x.fatia));
  return lista.map((x, i) => ({ ...x, pct: pcts[i] }));
}

/** Fatia de um anúncio num formato (0 se não entra) e, sendo 0, o motivo em uma frase. */
export function fatiaDoAnuncio(
  a: ParaFatia,
  formato: FormatoAnuncio,
  anuncios: readonly ParaFatia[],
  agora: number,
  fora: ForaDoAr = {},
): { fatia: number; pct: number; motivo: string | null } {
  const lista = participacao(anuncios, formato, agora, fora);
  const minha = lista.find((f) => f.id === a.id);
  if (minha) return { fatia: minha.fatia, pct: minha.pct, motivo: null };
  const master = lista.find((f) => f.cota === 'master' && !f.reserva);
  if (master && FORMATOS_MASTER_PRIORITARIO.includes(formato)) return { fatia: 0, pct: 0, motivo: `O master ${master.marca} tem prioridade neste formato.` };
  if (a.reserva && lista.length) return { fatia: 0, pct: 0, motivo: 'Reserva: entra só onde nenhum anúncio pago está no ar.' };
  return { fatia: 0, pct: 0, motivo: null };
}

/** Percentual em texto: "100%", "33%", "0%" (use o `pct` da fatia, que já soma 100 no formato). */
export const fmtFatia = (pct: number) => `${fmtInt(pct)}%`;

// ---- vendas: avisos do anúncio --------------------------------------------------------------------------------

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const AVISO_APURACAO = 'Evite ligar a marca à apuração ou ao resultado: a marca oferece o espaço, não o resultado.';

/**
 * Avisos de um anúncio (não bloqueiam o salvar): título cortado ("…"), título repetido no começo do texto, termo ligado
 * à apuração ou ao resultado, logo sem ajuste, bebida alcoólica (`avisoCategoria`) e, com `contexto`, formato marcado
 * em que ele não aparece agora (fatia de 0%).
 */
export function avisosDoAnuncio(
  a: Pick<AnuncioConfig, 'marca' | 'titulo' | 'texto' | 'cta' | 'url' | 'logo' | 'logoAjuste' | 'logoEscuro' | 'logoEscuroAjuste'> & Partial<ParaFatia>,
  contexto?: { anuncios: readonly ParaFatia[]; agora: number; fora?: ForaDoAr },
): string[] {
  const out: string[] = [];
  const titulo = a.titulo.trim();
  const texto = a.texto.trim();
  if (/(…|\.\.\.)$/.test(titulo)) out.push('O título termina em reticências: escreva a frase inteira (o site mostra o título completo).');
  const norm = (t: string) => semAcento(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const tituloNorm = norm(titulo.replace(/(…|\.\.\.)$/, ''));
  if (tituloNorm && texto && norm(texto).startsWith(tituloNorm)) out.push('O texto de apoio começa repetindo o título: use-o para complementar.');
  if (/\b(apura|elei|resultado|urna)/.test(semAcento(`${titulo} ${texto}`))) out.push(AVISO_APURACAO);
  if ((a.logo && !a.logoAjuste) || (a.logoEscuro && !a.logoEscuroAjuste)) out.push('Logo gravada antes do ajuste automático: aparece pequena, numa placa branca quadrada. Use “Ajustar agora” ou envie de novo.');
  const bebida = avisoCategoria({ marca: a.marca, titulo, texto, cta: a.cta, url: a.url });
  if (bebida) out.push(bebida);
  const esgotado = !!a.id && new Set(contexto?.fora?.esgotados ?? []).has(a.id);
  if (contexto && a.id && a.formatos && !esgotado && !contexto.fora?.suspenso && anuncioNoAr({ ativo: a.ativo ?? true, inicio: a.inicio, fim: a.fim }, contexto.agora)) {
    const proprio = a as ParaFatia;
    const lista = contexto.anuncios.some((x) => x.id === proprio.id) ? contexto.anuncios : [...contexto.anuncios, proprio];
    const zerados = proprio.formatos.filter((f) => fatiaDoAnuncio(proprio, f, lista, contexto.agora, contexto.fora).fatia === 0);
    const total = proprio.formatos.length;
    const nomes = zerados.map((f) => NOME_CURTO_FORMATO[f]).join(', ');
    if (zerados.length === total) out.push(`Não aparece agora em ${total > 1 ? 'nenhum dos formatos marcados' : nomes}: outro anúncio tem prioridade.`);
    else if (zerados.length) out.push(`Aparece em ${fmtInt(total - zerados.length)} dos ${fmtInt(total)} formatos marcados: fora de ${nomes} agora.`);
  }
  return out;
}

// ---- vendas: duplicar --------------------------------------------------------------------------------------------

/**
 * Cópia de um anúncio para começar outro: id `<id>-2` (ou -3, -4… o primeiro livre, até 40 caracteres), pausado, sem
 * datas, sem meta e com a declaração desmarcada (a pessoa confirma de novo). As imagens seguem como URL do servidor: o
 * servidor as resolve enquanto o original existir.
 */
export function duplicarAnuncio(a: AnuncioConfig, ids: Iterable<string>): Omit<AnuncioConfig, 'naoPolitico' | 'limiteImpressoes'> & { naoPolitico: false } {
  const usados = new Set(ids);
  const base = a.id;
  let id = '';
  for (let n = 2; n < 1000; n++) {
    const sufixo = `-${n}`;
    const tentativa = `${base.slice(0, 40 - sufixo.length).replace(/-+$/, '')}${sufixo}`;
    if (!usados.has(tentativa)) {
      id = tentativa;
      break;
    }
  }
  const copia: AnuncioConfig = { ...a, formatos: [...a.formatos] };
  delete copia.limiteImpressoes;
  return { ...copia, id, ativo: false, inicio: null, fim: null, naoPolitico: false };
}

// ---- vendas: atalhos de data -------------------------------------------------------------------------------------

/** 25/10, 17h (Brasília): fim da votação e começo da apuração. */
export const FIM_VOTACAO = NOITE_ELEICAO.inicio;
/** 2/11, 23h59 (Brasília): fim do atalho "Depois". */
export const FIM_DEPOIS = Date.parse('2026-11-02T23:59:00-03:00');

export interface AtalhoData {
  id: 'agora' | 'ate-apuracao' | 'noite' | 'depois' | 'limpar';
  rotulo: string;
  /** undefined = não mexe no campo; null = limpa */
  inicio?: number | null;
  fim?: number | null;
  /** o atalho já não faz sentido (a janela dele passou) */
  desabilitado: boolean;
}

/**
 * Atalhos ao lado de Início e Fim (horário de Brasília): "Agora"; "Até a apuração" (agora → 25/10, 17h); "Noite"
 * (25/10, 17h → 26/10, 2h); "Depois" (26/10, 2h → 2/11, 23h59); "Limpar". `agora` é arredondado para o minuto (o campo
 * não tem segundos).
 */
export function atalhosData(agora: number): AtalhoData[] {
  const min = Math.floor(agora / 60_000) * 60_000;
  return [
    { id: 'agora', rotulo: 'Agora', inicio: min, desabilitado: false },
    { id: 'ate-apuracao', rotulo: 'Até a apuração', inicio: min, fim: FIM_VOTACAO, desabilitado: min >= FIM_VOTACAO },
    { id: 'noite', rotulo: 'Noite', inicio: NOITE_ELEICAO.inicio, fim: NOITE_ELEICAO.fim, desabilitado: min >= NOITE_ELEICAO.fim },
    { id: 'depois', rotulo: 'Depois', inicio: NOITE_ELEICAO.fim, fim: FIM_DEPOIS, desabilitado: min >= FIM_DEPOIS },
    { id: 'limpar', rotulo: 'Limpar', inicio: null, fim: null, desabilitado: false },
  ];
}

/** Dica de cada atalho (title/aria): as datas em Brasília. */
export function dicaAtalho(t: AtalhoData): string {
  if (t.id === 'limpar') return 'Sem datas: no ar enquanto estiver ativo';
  if (t.id === 'agora') return 'Início agora';
  return `${t.inicio ? fmtDataHora(t.inicio) : ''} → ${t.fim ? fmtDataHora(t.fim) : ''}`;
}

// ---- meta de impressões (E16) ------------------------------------------------------------------------------------

export type PrevisaoEntrega =
  | { tipo: 'atingida' }
  | { tipo: 'sem-ritmo' }
  /** no ritmo atual, a meta chega em `quando` (antes do fim, ou sem fim) */
  | { tipo: 'meta'; ritmo: number; quando: number }
  /** no ritmo atual, até o `fim` entrega `pct` (0–1) da meta; faltam `faltam` */
  | { tipo: 'parcial'; ritmo: number; pct: number; faltam: number; fim: number };

/**
 * Previsão de entrega da meta (pura): ritmo = impressões das 2 horas cheias anteriores mais a hora corrente (a fração
 * já passada) ÷ o tempo dessa janela. `serie`: impressões por hora (todos os formatos), como `serieHoras`.
 */
export function previsaoEntrega(
  serie: readonly { hora: number; impressoes: number }[],
  entregue: number,
  limite: number,
  agora: number,
  fim: number | null | undefined,
): PrevisaoEntrega {
  if (entregue >= limite) return { tipo: 'atingida' };
  const h0 = Math.floor(agora / HORA_MS) * HORA_MS;
  const fracao = Math.max(1 / 60, (agora - h0) / HORA_MS);
  let soma = 0;
  for (const p of serie) if (p.hora >= h0 - 2 * HORA_MS && p.hora <= h0) soma += p.impressoes;
  const ritmo = soma / (2 + fracao);
  if (!(ritmo > 0)) return { tipo: 'sem-ritmo' };
  const quando = agora + ((limite - entregue) / ritmo) * HORA_MS;
  if (fim && quando > fim) {
    const ate = entregue + (ritmo * Math.max(0, fim - agora)) / HORA_MS;
    return { tipo: 'parcial', ritmo, pct: Math.min(1, ate / limite), faltam: Math.max(0, Math.round(limite - ate)), fim };
  }
  return { tipo: 'meta', ritmo, quando };
}

/** Ritmo por hora: "8,3 mil" a partir de mil; abaixo, inteiro ("177"). */
const fmtRitmo = (r: number) => (r >= 1000 ? fmtCompact(r) : fmtInt(r));

/** Frase da previsão para o cartão. */
export function textoPrevisao(p: PrevisaoEntrega): string {
  switch (p.tipo) {
    case 'atingida':
      return 'Meta atingida.';
    case 'sem-ritmo':
      return 'Sem impressões nas últimas horas: sem previsão de quando atinge a meta.';
    case 'meta':
      return `No ritmo atual (${fmtRitmo(p.ritmo)}/h) atinge a meta por volta de ${fmtHora(p.quando)}.`;
    case 'parcial':
      return `No ritmo atual entrega ~${fmtInt(Math.round(p.pct * 100))}% até o fim (${fmtDataHora(p.fim)}): faltam ${fmtCompact(p.faltam)}.`;
  }
}

/** Impressões a creditar: depois do fim, o que faltou para a meta (0 se atingiu ou ainda está no ar). */
export function aCreditar(a: Pick<AnuncioConfig, 'fim' | 'limiteImpressoes'>, entregue: number | undefined, agora: number): number {
  if (!a.limiteImpressoes || !a.fim || agora < a.fim || entregue === undefined) return 0;
  return Math.max(0, a.limiteImpressoes - entregue);
}

/** Atalhos da meta (impressões contratadas). */
export const ATALHOS_META = [25_000, 50_000, 100_000] as const;
