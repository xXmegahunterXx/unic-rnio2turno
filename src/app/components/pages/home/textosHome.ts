/**
 * Textos e contas da Home (puros, testados em textosHome.test.ts):
 *  - quanto falta para a apuração em dias de calendário de Brasília ("faltam 15 dias", "amanhã", "hoje");
 *  - o texto neutro do convite para compartilhar o site (sem número de apuração: nunca precisa do selo de simulação);
 *  - o tempo HONESTO do Teste Cego, sem importar o conteúdo do teste na 1ª dobra (o teste confere a constante).
 */
import { BRT_OFFSET_MS, INICIO_APURACAO } from '@/shared/constants';
import { fmtInt } from '@/shared/format';

const DIA = 86_400_000;

/** Índice do dia de calendário em Brasília (UTC−3 fixo: sem horário de verão desde 2019). */
export const diaBrasilia = (ms: number) => Math.floor((ms + BRT_OFFSET_MS) / DIA);

/** Dias de calendário (Brasília) de `agora` até `alvo`: 0 = hoje, 1 = amanhã; negativo = já passou. */
export const diasAte = (alvo: number, agora: number) => diaBrasilia(alvo) - diaBrasilia(agora);

export type MomentoApuracao = 'dias' | 'amanha' | 'hoje' | 'agora' | 'depois';

/** Em que momento estamos em relação ao início REAL da apuração (relógio de parede, nunca o simulado). */
export function momentoApuracao(agora: number, alvo: number = INICIO_APURACAO): MomentoApuracao {
  if (agora >= alvo) return diasAte(alvo, agora) === 0 ? 'agora' : 'depois';
  const d = diasAte(alvo, agora);
  return d <= 0 ? 'hoje' : d === 1 ? 'amanha' : 'dias';
}

/** "Faltam 15 dias" · "É amanhã" · "É hoje" · "É agora" · "" (depois do dia). */
export function rotuloFaltam(agora: number, alvo: number = INICIO_APURACAO): string {
  switch (momentoApuracao(agora, alvo)) {
    case 'dias':
      return `Faltam ${fmtInt(diasAte(alvo, agora))} dias`;
    case 'amanha':
      return 'É amanhã';
    case 'hoje':
      return 'É hoje';
    case 'agora':
      return 'É agora';
    default:
      return '';
  }
}

/**
 * Texto do convite para compartilhar o site (sem URL: o kit acrescenta). Só fatos do calendário e do produto —
 * nenhum número de apuração, nenhum candidato. ≤ 220 de peso do X.
 */
export function textoConviteSite(agora: number, alvo: number = INICIO_APURACAO): string {
  const teste = 'E o Teste Cego: concorde ou discorde sem saber de quem é cada ideia.';
  switch (momentoApuracao(agora, alvo)) {
    case 'dias':
      return `Faltam ${fmtInt(diasAte(alvo, agora))} dias para o 2º turno. Domingo, 25/10, às 17h (Brasília), a apuração ao vivo do Brasil inteiro até a sua seção. ${teste}`;
    case 'amanha':
      return `É amanhã: domingo, 25/10, às 17h (Brasília), começa a apuração do 2º turno, do Brasil inteiro até a sua seção. ${teste}`;
    case 'hoje':
      return `É hoje: às 17h (Brasília) começa a apuração do 2º turno. Acompanhe ao vivo, do Brasil inteiro até a sua seção. ${teste}`;
    case 'agora':
      return 'A apuração do 2º turno começou às 17h (Brasília). Acompanhe ao vivo, do Brasil inteiro até a sua seção, com os dados oficiais do TSE.';
    default:
      return 'A apuração do 2º turno de 2026, do Brasil inteiro até a sua seção, com os dados oficiais do TSE. E o Teste Cego: concorde ou discorde sem saber de quem é cada ideia.';
  }
}

export const HASHTAGS_HOME = ['Eleições2026', 'SegundoTurno'];

/**
 * Teste Cego: 24 afirmações, 7,5 s cada (leitura + decisão; ver `SEGUNDOS_POR_AFIRMACAO` no teste) ⇒ ≈ 3 min.
 * Constantes aqui para não carregar o conteúdo do teste na 1ª dobra; textosHome.test.ts confere com o teste.
 */
export const N_AFIRMACOES_TESTE = 24;
export const SEGUNDOS_POR_AFIRMACAO_TESTE = 7.5;
export const MINUTOS_TESTE_HOME = Math.max(1, Math.round((N_AFIRMACOES_TESTE * SEGUNDOS_POR_AFIRMACAO_TESTE) / 60));
