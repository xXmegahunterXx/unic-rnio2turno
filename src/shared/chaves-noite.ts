/**
 * "Chaves da noite" (leva 3): padrões e leitura segura dos interruptores operacionais gravados em `AdminState.noite`
 * (tipos em ./types.ts). Isomórfico e sem efeito colateral: motor, servidor, painel e testes importam daqui.
 *
 * Padrões (o "padrão seguro" de cada chave):
 *  - freio: fator 1, sem leve (ritmo normal);
 *  - contadorPublico: ligado (o "N pessoas agora" já existia; a leva 3 só o esconde abaixo de PISO_PESSOAS_PUBLICO);
 *  - htmlBorda: DESLIGADO (liga só depois do ensaio, no congelamento de 24/10, 12h);
 *  - medirAnuncios: ligado (como hoje);
 *  - avisoNacional: 'auto' (aviso factual, só com os arquivos do próprio TSE; 'off' a um toque);
 *  - textoBots: ligado (rota nova /api/texto/placar; desligada responde só o endereço do site);
 *  - contarLives: ligado (contagem anônima; desligada responde 204 sem contar).
 */
import type { CargaStatus, ChavesNoite, FatorCarga, ModoAvisoNacional } from './types';

export const FATORES_CARGA: readonly FatorCarga[] = [1, 2, 3, 5];

export const ehFatorCarga = (v: unknown): v is FatorCarga => typeof v === 'number' && (FATORES_CARGA as readonly number[]).includes(v);

export const MODOS_AVISO_NACIONAL: readonly ModoAvisoNacional[] = ['auto', 'off'];

export const CHAVES_NOITE_PADRAO: Readonly<ChavesNoite> = Object.freeze({
  freio: Object.freeze({ fator: 1 as FatorCarga, leve: false }),
  contadorPublico: true,
  htmlBorda: false,
  medirAnuncios: true,
  avisoNacional: 'auto' as ModoAvisoNacional,
  textoBots: true,
  contarLives: true,
});

/** Chaves liga/desliga: nome do comando do painel → campo em `ChavesNoite`. */
export const COMANDO_CHAVE = {
  'contador-publico': 'contadorPublico',
  'html-borda': 'htmlBorda',
  'medir-anuncios': 'medirAnuncios',
  'texto-bots': 'textoBots',
  'contar-lives': 'contarLives',
} as const satisfies Record<string, keyof ChavesNoite>;
export type ComandoChave = keyof typeof COMANDO_CHAVE;

/** Rótulo de cada chave liga/desliga (log do monitor e painel). */
export const ROTULO_CHAVE: Record<ComandoChave, string> = {
  'contador-publico': '"Pessoas agora" no site',
  'html-borda': 'HTML guardado na borda',
  'medir-anuncios': 'Medição das impressões dos anúncios',
  'texto-bots': 'Texto do placar para bots de chat',
  'contar-lives': 'Contagem de lives',
};

const copia = (c: Readonly<ChavesNoite>): ChavesNoite => ({ ...c, freio: { ...c.freio } });

/**
 * Restaura as chaves de um estado salvo ou recebido (nunca lança): cada campo inválido volta ao do `fallback`;
 * ausente/inválido por inteiro → cópia do `fallback`.
 */
export function parseChavesNoite(v: unknown, fallback: Readonly<ChavesNoite> = CHAVES_NOITE_PADRAO): ChavesNoite {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return copia(fallback);
  const o = v as Record<string, unknown>;
  const bool = (x: unknown, fb: boolean) => (typeof x === 'boolean' ? x : fb);
  const f = o.freio && typeof o.freio === 'object' && !Array.isArray(o.freio) ? (o.freio as Record<string, unknown>) : {};
  return {
    freio: { fator: ehFatorCarga(f.fator) ? f.fator : fallback.freio.fator, leve: bool(f.leve, fallback.freio.leve) },
    contadorPublico: bool(o.contadorPublico, fallback.contadorPublico),
    htmlBorda: bool(o.htmlBorda, fallback.htmlBorda),
    medirAnuncios: bool(o.medirAnuncios, fallback.medirAnuncios),
    avisoNacional: (MODOS_AVISO_NACIONAL as readonly unknown[]).includes(o.avisoNacional) ? (o.avisoNacional as ModoAvisoNacional) : fallback.avisoNacional,
    textoBots: bool(o.textoBots, fallback.textoBots),
    contarLives: bool(o.contarLives, fallback.contarLives),
  };
}

/** Chaves de um AdminState (ou snapshot do painel), com os padrões quando o estado é anterior à leva 3. */
export function chavesNoite(s: { noite?: ChavesNoite | null } | null | undefined): ChavesNoite {
  return s?.noite ? parseChavesNoite(s.noite) : copia(CHAVES_NOITE_PADRAO);
}

/** O freio como vai ao site (`LiveStatus.carga`): `undefined` no ritmo normal (fator 1, sem leve). */
export function cargaDoFreio(f: ChavesNoite['freio'] | null | undefined): CargaStatus | undefined {
  if (!f || !ehFatorCarga(f.fator) || (f.fator === 1 && !f.leve)) return undefined;
  return f.leve ? { fator: f.fator, leve: true } : { fator: f.fator };
}
