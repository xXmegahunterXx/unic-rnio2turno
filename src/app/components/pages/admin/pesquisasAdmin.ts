/**
 * Formulário da seção "Pesquisas" do painel (puro, sem React): texto dos campos ↔ `PesquisaEntrada` do contrato
 * (src/shared/pesquisas.ts). Números aceitam vírgula ("45,5"); campo vazio fica vazio (a validação diz o que falta —
 * nada é completado). As fontes vêm uma por linha.
 */
import {
  CHAVE_BRANCOS_NULOS,
  CHAVE_INDECISOS,
  numerosDaPesquisa,
  type CargoPesquisa,
  type ModoPesquisa,
  type Pesquisa,
  type PesquisaEntrada,
} from '@/shared/pesquisas';

export interface FormPesquisa {
  /** id da pesquisa em edição (vazio = nova). */
  id: string;
  cargo: CargoPesquisa;
  instituto: string;
  contratante: string;
  registro: string;
  coletaInicio: string;
  coletaFim: string;
  divulgadaEm: string;
  entrevistas: string;
  margemPp: string;
  confiancaPct: string;
  modo: '' | ModoPesquisa;
  /** por número de urna + 'brancosNulos' + 'indecisos' */
  totais: Record<string, string>;
  comValidos: boolean;
  validos: Record<string, string>;
  /** uma URL por linha */
  fontes: string;
  /** informação que a Justiça Eleitoral mandou constar na divulgação (vazio = nenhuma) */
  aviso: string;
}

export const formVazio = (cargo: CargoPesquisa = 'pres'): FormPesquisa => ({
  id: '',
  cargo,
  instituto: '',
  contratante: '',
  registro: '',
  coletaInicio: '',
  coletaFim: '',
  divulgadaEm: '',
  entrevistas: '',
  margemPp: '',
  confiancaPct: '95',
  modo: '',
  totais: {},
  comValidos: false,
  validos: {},
  fontes: '',
  aviso: '',
});

/** "45,5" → 45.5 · "2.004" (milhar) → 2004 · "" → undefined · lixo → NaN (a validação recusa). */
export function numeroBr(s: string, inteiro = false): number | undefined {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return undefined;
  // inteiro com separador de milhar ("2.004" ou "2,004" não é decimal de entrevistas)
  const normal = inteiro ? t.replace(/[.,](?=\d{3}(\D|$))/g, '') : t.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}

const txtNum = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

/** Pesquisa existente → campos do formulário (edição). */
export function formDe(p: Pesquisa): FormPesquisa {
  const totais: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.totais)) totais[k] = txtNum(v);
  const validos: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.validos ?? {})) validos[k] = txtNum(v);
  return {
    id: p.id,
    cargo: p.cargo,
    instituto: p.instituto,
    contratante: p.contratante ?? '',
    registro: p.registro,
    coletaInicio: p.coletaInicio,
    coletaFim: p.coletaFim,
    divulgadaEm: p.divulgadaEm,
    entrevistas: String(p.entrevistas),
    margemPp: txtNum(p.margemPp),
    confiancaPct: txtNum(p.confiancaPct),
    modo: p.modo ?? '',
    totais,
    comValidos: !!p.validos,
    validos,
    fontes: p.fontes.join('\n'),
    aviso: p.aviso ?? '',
  };
}

/**
 * Campos → o que vai ao servidor (e à validação local). `numeros` = os dois números de urna da disputa (do meta.json);
 * só esses entram em `totais`/`validos` (trocar a disputa no formulário não arrasta números da anterior).
 */
export function entradaDe(f: FormPesquisa, numeros: readonly number[]): PesquisaEntrada & Record<string, unknown> {
  const totais: Record<string, number> = {};
  for (const n of numeros) {
    const v = numeroBr(f.totais[String(n)] ?? '');
    if (v !== undefined) totais[String(n)] = v;
  }
  for (const k of [CHAVE_BRANCOS_NULOS, CHAVE_INDECISOS]) {
    const v = numeroBr(f.totais[k] ?? '');
    if (v !== undefined) totais[k] = v;
  }
  let validos: Record<string, number> | undefined;
  if (f.comValidos) {
    validos = {};
    for (const n of numeros) {
      const v = numeroBr(f.validos[String(n)] ?? '');
      if (v !== undefined) validos[String(n)] = v;
    }
  }
  const e: Record<string, unknown> = {
    cargo: f.cargo,
    instituto: f.instituto,
    contratante: f.contratante,
    registro: f.registro.trim().toUpperCase(),
    coletaInicio: f.coletaInicio,
    coletaFim: f.coletaFim,
    divulgadaEm: f.divulgadaEm,
    entrevistas: numeroBr(f.entrevistas, true),
    margemPp: numeroBr(f.margemPp),
    confiancaPct: numeroBr(f.confiancaPct),
    totais,
    fontes: f.fontes
      .split(/\s*\n\s*/)
      .map((x) => x.trim())
      .filter(Boolean),
  };
  if (f.id) e.id = f.id;
  if (f.modo) e.modo = f.modo;
  if (validos) e.validos = validos;
  if (f.aviso.trim()) e.aviso = f.aviso.trim();
  return e as PesquisaEntrada & Record<string, unknown>;
}

/** Números de urna de uma pesquisa (para a lista do painel). */
export const numerosDe = (p: Pesquisa) => numerosDaPesquisa(p);
