/**
 * Utilidades da seção "Anunciantes" do painel (puras, sem React): situação de cada anúncio, horário de Brasília nos
 * campos de data, agregação das métricas (totais, últimas 48 h, CTR), CSV do relatório de entrega e o preparo das
 * imagens no navegador (logo ≤ 512 px / 150 KB; peça ≤ 1600 px / 400 KB — só redimensionar e recodificar, nunca editar).
 */
import {
  ANUNCIO_LIMITES,
  FORMATOS_ANUNCIO,
  ROTULO_FORMATO,
  anuncioNoAr,
  type AnuncioConfig,
  type FormatoAnuncio,
  type MetricaAnuncio,
} from '@/shared/anuncios';
import { fmtDecimal, fmtInt } from '@/shared/format';

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

export type Situacao = 'no-ar' | 'agendado' | 'pausado' | 'encerrado';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  'no-ar': 'No ar',
  agendado: 'Agendado',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
};

/** Situação no instante `agora` (relógio real do servidor). */
export function situacaoDe(a: Pick<AnuncioConfig, 'ativo' | 'inicio' | 'fim'>, agora: number): Situacao {
  if (!a.ativo) return 'pausado';
  if (a.fim && agora >= a.fim) return 'encerrado';
  if (a.inicio && agora < a.inicio) return 'agendado';
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
export const kbDe = (uri: string) => Math.max(1, Math.round((uri.length - uri.indexOf(',') - 1) * 0.75 / 1024));

function lerArquivo(f: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(r.error ?? new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('Imagem inválida ou corrompida.'));
    img.src = src;
  });
}

/** Desenha a imagem inteira (sem corte) com o maior lado ≤ `max` px. */
function redimensionar(img: HTMLImageElement, max: number): HTMLCanvasElement | null {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** Codifica no 1º formato que o navegador suporta e que cabe no limite (data URI). */
function codificar(c: HTMLCanvasElement, tentativas: readonly (readonly [string, number | undefined])[], limite: number): string | null {
  for (const [tipo, q] of tentativas) {
    const out = c.toDataURL(tipo, q);
    if (out.startsWith(`data:${tipo};base64,`) && out.length <= limite) return out;
  }
  return null;
}

export interface ImagemPreparada {
  uri: string;
  /** "512 × 180 px · 38 KB (redimensionada)" */
  info: string;
}

/**
 * Logo: PNG, JPEG, WebP ou SVG. SVG entra como está (≤ 150 KB). Raster dentro de 512 px e 150 KB entra como está;
 * maior é redimensionado (maior lado ≤ 512 px) e recodificado em WebP (transparência mantida; PNG se o navegador não
 * gerar WebP). Nenhum outro tratamento.
 */
export async function prepararLogo(f: File): Promise<ImagemPreparada> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) throw new Error('Use PNG, JPEG, WebP ou SVG.');
  const limite = ANUNCIO_LIMITES.logoDataUri;
  const uri = await lerArquivo(f);
  if (f.type === 'image/svg+xml') {
    if (uri.length > limite) throw new Error(`O SVG tem ${fmtInt(kbDe(uri))} KB; o limite é 150 KB.`);
    if (!/^data:image\/svg\+xml;base64,/.test(uri)) throw new Error('Não foi possível ler o SVG.');
    return { uri, info: `SVG · ${fmtInt(kbDe(uri))} KB` };
  }
  const img = await carregarImagem(uri);
  const lado = Math.max(img.naturalWidth, img.naturalHeight);
  if (lado <= 512 && uri.length <= limite) return { uri, info: `${img.naturalWidth} × ${img.naturalHeight} px · ${fmtInt(kbDe(uri))} KB` };
  for (const max of [512, 384, 256]) {
    const c = redimensionar(img, max);
    if (!c) break;
    const out = codificar(
      c,
      [
        ['image/webp', 0.9],
        ['image/webp', 0.8],
        ['image/png', undefined],
        ['image/webp', 0.65],
      ],
      limite,
    );
    if (out) return { uri: out, info: `${c.width} × ${c.height} px · ${fmtInt(kbDe(out))} KB (redimensionada)` };
  }
  throw new Error('Não foi possível deixar a logo com até 150 KB. Use uma imagem mais simples.');
}

/**
 * Peça (opcional): PNG, JPEG ou WebP, exibida inteira (proporção livre). Dentro de 1600 px e 400 KB entra como está;
 * maior é redimensionada (≤ 1600 px) e recodificada em WebP ~0,85 (JPEG se o navegador não gerar WebP).
 */
export async function prepararPeca(f: File): Promise<ImagemPreparada> {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error('Use PNG, JPEG ou WebP (a peça não aceita SVG).');
  const limite = ANUNCIO_LIMITES.imagemDataUri;
  const uri = await lerArquivo(f);
  const img = await carregarImagem(uri);
  const lado = Math.max(img.naturalWidth, img.naturalHeight);
  if (lado <= 1600 && uri.length <= limite) return { uri, info: `${img.naturalWidth} × ${img.naturalHeight} px · ${fmtInt(kbDe(uri))} KB` };
  for (const max of [1600, 1280, 1024, 800]) {
    const c = redimensionar(img, max);
    if (!c) break;
    const out = codificar(
      c,
      [
        ['image/webp', 0.85],
        ['image/webp', 0.75],
        ['image/jpeg', 0.85],
        ['image/webp', 0.65],
        ['image/jpeg', 0.72],
      ],
      limite,
    );
    if (out) return { uri: out, info: `${c.width} × ${c.height} px · ${fmtInt(kbDe(out))} KB (redimensionada)` };
  }
  throw new Error('Não foi possível deixar a peça com até 400 KB. Use uma imagem menor.');
}
