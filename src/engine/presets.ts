/**
 * Presets do admin (ARCHITECTURE.md §5.3). Neutralidade: todo preset que favorece um lado tem o espelho.
 * "A" = candidato de menor número (índice 0 em Race.candidatos); "B" = o outro. (A cor não indica a posição: Presidente
 * usa vermelho/azul de identificação; ver CORES_IDENTIDADE.)
 *
 * Um preset é aplicado SOBRE o cenário padrão neutro (não sobre o cenário atual) para ser reprodutível;
 * só a semente atual é mantida. Para ajustes finos, use o comando `cenario` depois.
 *
 * Escopo: os presets de margem "Folgada" valem para todas as corridas (Presidente e Governadores); os demais
 * mexem só em Presidente e mantêm os governadores no alvo neutro derivado do 1º turno.
 */
import { fmtPct } from '../shared/format';
import type { PresetInfo, RaceId, ScenarioConfig } from '../shared/types';
import { CommandError } from './api';
import { alvosNeutros, cenarioPadrao, normalizaCenario, PRESET_PADRAO } from './scenario';
import type { Structure } from './structure';

interface PresetDef {
  id: string;
  nome: string;
  descricao: (ctx: { neutroPres: number }) => string;
  cenario: (ctx: { neutroPres: number; gov: Record<RaceId, number> }) => Partial<ScenarioConfig>;
}

const todosGov = (gov: Record<RaceId, number>, v: number) =>
  Object.fromEntries(Object.keys(gov).map((k) => [k, v])) as Record<RaceId, number>;

const pct = (x: number) => fmtPct(x);

const DEFS: PresetDef[] = [
  {
    id: PRESET_PADRAO,
    nome: 'Padrão neutro (1º turno + transferência 50/50)',
    descricao: ({ neutroPres }) =>
      `Resultado derivado do 1º turno: cada finalista herda metade dos votos dos demais candidatos. ` +
      `Presidente: A com ${pct(neutroPres)} dos válidos; governadores pela mesma regra. Geografia, ` +
      `comparecimento e brancos/nulos do 1º turno, chegada realista.`,
    cenario: () => ({}),
  },
  {
    id: 'equilibrio-a',
    nome: 'Equilíbrio realista',
    descricao: () =>
      'Presidente: A com 50,40% dos válidos. Geografia do 1º turno e chegada realista (Sul e Sudeste primeiro, ' +
      'Nordeste e Norte depois).',
    cenario: () => ({ alvoPres: 50.4 }),
  },
  {
    id: 'equilibrio-b',
    nome: 'Equilíbrio realista (espelhado)',
    descricao: () => 'Espelho do anterior: Presidente com B a 50,40% dos válidos (A com 49,60%).',
    cenario: () => ({ alvoPres: 49.6 }),
  },
  {
    id: 'folgada-a',
    nome: 'Folgada para A',
    descricao: () => 'A com 54% dos válidos em todas as corridas (Presidente e governadores).',
    cenario: ({ gov }) => ({ alvoPres: 54, alvoGov: todosGov(gov, 54) }),
  },
  {
    id: 'folgada-b',
    nome: 'Folgada para B',
    descricao: () => 'B com 54% dos válidos em todas as corridas (A com 46%).',
    cenario: ({ gov }) => ({ alvoPres: 46, alvoGov: todosGov(gov, 46) }),
  },
  {
    id: 'empate-a',
    nome: 'Empate técnico',
    descricao: () =>
      'Presidente: A com 50,05% dos válidos e ruído por seção baixo — a definição só vem no fim da noite.',
    cenario: () => ({ alvoPres: 50.05, ruidoSecao: 0.03 }),
  },
  {
    id: 'empate-b',
    nome: 'Empate técnico (espelhado)',
    descricao: () => 'Espelho do anterior: B com 50,05% dos válidos (A com 49,95%), ruído baixo.',
    cenario: () => ({ alvoPres: 49.95, ruidoSecao: 0.03 }),
  },
  {
    id: 'virada-a',
    nome: 'Virada tardia (A vence)',
    descricao: () =>
      'Presidente: A com 50,40%. Ordem de chegada com Sul e Sudeste bem antes de Norte e Nordeste: ' +
      'B lidera boa parte da noite e A passa à frente tarde.',
    cenario: () => ({ alvoPres: 50.4, ordemRegional: 'sul-primeiro' }),
  },
  {
    id: 'virada-b',
    nome: 'Virada tardia (B vence)',
    descricao: () =>
      'Espelho do anterior: B com 50,40%. Ordem "norte primeiro" (a inversa): A lidera boa parte da noite ' +
      'e B passa à frente tarde.',
    cenario: () => ({ alvoPres: 49.6, ordemRegional: 'norte-primeiro' }),
  },
  {
    id: 'noite-lenta',
    nome: 'Noite lenta (instabilidade)',
    descricao: () =>
      'Ritmo lento (tudo 40% mais demorado) e atrasos extras: SP e BA +20 min, PA e AM +30 min (UFs ' +
      'escolhidas para não favorecer nenhum lado). Alvos neutros.',
    cenario: () => ({ ritmo: 'lento', ufAtraso: { SP: 20, BA: 20, PA: 30, AM: 30 } }),
  },
  {
    id: 'uniforme',
    nome: 'Uniforme (sem geografia)',
    descricao: ({ neutroPres }) =>
      `Intensidade regional zero: todas as seções com a mesma preferência média (A com ${pct(neutroPres)}), ` +
      'só o ruído por seção varia. Útil para testar a interface sem viradas regionais.',
    cenario: () => ({ intensidadeRegional: 0 }),
  },
];

export function presetList(st: Structure, seed?: number): PresetInfo[] {
  const n = alvosNeutros(st);
  const base = cenarioPadrao(st, seed);
  return DEFS.map((d) => ({
    id: d.id,
    nome: d.nome,
    descricao: d.descricao({ neutroPres: n.pres }),
    cenario: { ...base, ...d.cenario({ neutroPres: n.pres, gov: n.gov }), preset: d.id },
  }));
}

/** Cenário completo de um preset, mantendo a semente informada. */
export function cenarioDoPreset(st: Structure, id: string, seed: number): ScenarioConfig {
  const def = DEFS.find((d) => d.id === id);
  if (!def) throw new CommandError(`Preset desconhecido: "${id}". Disponíveis: ${DEFS.map((d) => d.id).join(', ')}.`);
  const n = alvosNeutros(st);
  const base = cenarioPadrao(st, seed);
  const over = def.cenario({ neutroPres: n.pres, gov: n.gov });
  return normalizaCenario({ ...base, ...over, alvoGov: { ...base.alvoGov, ...(over.alvoGov ?? {}) }, preset: id }, st);
}

export const PRESET_IDS = DEFS.map((d) => d.id);
