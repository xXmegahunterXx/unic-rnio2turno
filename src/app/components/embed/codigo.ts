/**
 * Widgets para incorporar (/embed/:tipo): opções, URL e o código do iframe pronto para copiar.
 * Puro (testado em codigo.test.ts).
 *
 *  - placar  ?race=pres | gov-xx   (Presidente ou Governador nas 7 UFs com 2º turno)
 *  - mapa    ?race=pres            (quem está à frente em cada estado)
 *  - uf      ?uf=sp                (o estado: Presidente, Governador quando houver e as maiores cidades)
 *  - tema    ?tema=auto | escuro | claro   (aceita também dark/light)
 *
 * O widget avisa a altura ao site que o incorpora com `postMessage({ tipo: 'sintonia:altura', altura, widget })`;
 * o código gerado traz um script de 1 linha que ajusta a altura do iframe (só para mensagens da origem do widget).
 */
import { UFS, type UF, type UFBr } from '@/shared/types';
import { UF_NOMES, UFS_GOV_2T } from '@/shared/constants';

export type TipoEmbed = 'placar' | 'mapa' | 'uf';
export type TemaEmbed = 'auto' | 'escuro' | 'claro';

export interface OpcoesEmbed {
  tipo: TipoEmbed;
  /** Corrida do placar/mapa: 'pres' ou 'gov-xx'. */
  race: string;
  /** UF do widget 'uf' (minúsculas no link). */
  uf: UFBr;
  tema: TemaEmbed;
}

export const TIPOS_EMBED: TipoEmbed[] = ['placar', 'mapa', 'uf'];
export const MENSAGEM_ALTURA = 'sintonia:altura';

export const ROTULO_TIPO: Record<TipoEmbed, string> = {
  placar: 'Placar',
  mapa: 'Mapa do Brasil',
  uf: 'Estado',
};

/** Altura inicial do iframe (o script ajusta depois). */
export const ALTURA_PADRAO: Record<TipoEmbed, number> = { placar: 300, mapa: 600, uf: 520 };

const RACES_PLACAR = ['pres', ...UFS_GOV_2T.map((u) => `gov-${u.toLowerCase()}`)];

export function ehTipoEmbed(t: string | undefined | null): t is TipoEmbed {
  return !!t && (TIPOS_EMBED as string[]).includes(t);
}

export function normalizarTema(t: string | null | undefined): TemaEmbed {
  const v = (t ?? '').toLowerCase();
  if (v === 'claro' || v === 'light') return 'claro';
  if (v === 'escuro' || v === 'dark') return 'escuro';
  return 'auto';
}

/** Lê e valida as opções da URL do widget (valores desconhecidos caem no padrão). */
export function lerOpcoesEmbed(tipo: string | undefined, params: URLSearchParams): OpcoesEmbed {
  const t: TipoEmbed = ehTipoEmbed(tipo) ? tipo : 'placar';
  const raceQ = (params.get('race') ?? '').toLowerCase();
  const race = t === 'placar' && RACES_PLACAR.includes(raceQ) ? raceQ : 'pres';
  const ufQ = (params.get('uf') ?? '').toUpperCase();
  const uf = ((UFS as readonly string[]).includes(ufQ) ? ufQ : 'SP') as UFBr;
  return { tipo: t, race, uf, tema: normalizarTema(params.get('tema')) };
}

/** Rota do widget no app (sem origem): '/embed/placar?race=pres&tema=claro'. Omite o que é padrão. */
export function caminhoEmbed(o: OpcoesEmbed): string {
  const p = new URLSearchParams();
  if (o.tipo === 'placar' && o.race !== 'pres') p.set('race', o.race);
  if (o.tipo === 'uf') p.set('uf', o.uf.toLowerCase());
  if (o.tema !== 'auto') p.set('tema', o.tema);
  const qs = p.toString();
  return `/embed/${o.tipo}${qs ? `?${qs}` : ''}`;
}

/** Rota da página completa correspondente (para o link "via Sintonia"). */
export function caminhoPaginaCompleta(o: Pick<OpcoesEmbed, 'tipo' | 'race' | 'uf'>): string {
  if (o.tipo === 'uf') return `/apuracao/${o.uf.toLowerCase()}`;
  if (o.race.startsWith('gov-')) return `/apuracao/${o.race.slice(4)}?race=${o.race}`;
  return '/apuracao';
}

/** Título acessível do iframe. */
export function tituloEmbed(o: Pick<OpcoesEmbed, 'tipo' | 'race' | 'uf'>): string {
  if (o.tipo === 'mapa') return 'Mapa da apuração do 2º turno · Sintonia';
  if (o.tipo === 'uf') return `Apuração em ${UF_NOMES[o.uf]} · Sintonia`;
  if (o.race.startsWith('gov-')) return `Governador · ${UF_NOMES[o.race.slice(4).toUpperCase() as UF] ?? ''} · Sintonia`;
  return 'Placar do 2º turno para Presidente · Sintonia';
}

/** Escapa um valor para atributo HTML entre aspas duplas. */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Código para colar no site: iframe responsivo (100% da largura, até `larguraMax`) + script que ajusta a altura.
 * O script só aceita mensagens vindas da origem do widget e é idempotente (vários widgets na mesma página).
 */
export function codigoIframe(o: OpcoesEmbed, url: string, larguraMax = o.tipo === 'placar' ? 640 : 720): string {
  let origem = '';
  try {
    origem = new URL(url).origin;
  } catch {
    origem = '';
  }
  const estilo = `border:1px solid rgba(128,128,128,.28);border-radius:16px;width:100%;max-width:${larguraMax}px;display:block;margin:0 auto;overflow:hidden`;
  const iframe = `<iframe src="${attr(url)}" title="${attr(tituloEmbed(o))}" width="100%" height="${ALTURA_PADRAO[o.tipo]}" style="${estilo}" loading="lazy" data-sintonia></iframe>`;
  const script =
    `<script>(function(){if(window.__sintoniaAltura)return;window.__sintoniaAltura=1;` +
    `window.addEventListener("message",function(e){var d=e.data;` +
    `if(!d||d.tipo!=="${MENSAGEM_ALTURA}"${origem && origem !== 'null' ? `||e.origin!=="${origem}"` : ''})return;` +
    `var f=document.querySelectorAll("iframe[data-sintonia]");` +
    `for(var i=0;i<f.length;i++){if(f[i].contentWindow===e.source){f[i].style.height=Math.ceil(d.altura)+"px";}}});})();</script>`;
  return `${iframe}\n${script}`;
}
