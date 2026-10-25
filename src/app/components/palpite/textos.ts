/**
 * Textos do Palpite (postar no X/WhatsApp, cartões). Regras de sempre (share/textos.ts): neutros e simétricos, os dois
 * finalistas SEMPRE na ordem da urna (menor número primeiro), sem adjetivos nem torcida, ≤ 220 de peso no X antes do
 * link. O texto descreve só o palpite de quem compartilha — nunca um número agregado de palpites (seria enquete).
 * Puro: testado em textos.test.ts.
 */
import type { Candidate } from '@/shared/types';
import { fmtDecimal, fmtPct } from '@/shared/format';
import { HORA_FIM_VOTACAO } from '@/shared/diaVotacao';
import { LIMITE_TEXTO, limitarTexto } from '@/app/components/share/textos';
import { pesoTextoX } from '@/app/lib/share';
import { pctsDoPalpite, type Avaliacao } from './nucleo';

export const HASHTAGS_PALPITE = ['Eleições2026', 'SegundoTurno'];
export const NOME_ARQUIVO_PALPITE = 'sintonia-meu-palpite-2-turno';
export const NOME_ARQUIVO_RESULTADO_PALPITE = 'sintonia-meu-palpite-resultado';

/** Os dois finalistas na ordem da urna (menor número primeiro). */
export type Finalistas = readonly [Pick<Candidate, 'numero' | 'nomeUrna'>, Pick<Candidate, 'numero' | 'nomeUrna'>];

/** "50,4%" (uma casa: o palpite é cravado em décimos). */
export const fmtPalpite = (pct: number) => fmtPct(pct, 1);
/** "1,6 p.p." (sem sinal: é uma distância). */
export const fmtDiferenca = (pp: number) => `${fmtDecimal(pp, 1)} p.p.`;

/**
 * "Lula 50,4% × Flávio Bolsonaro 49,6%" — só o nome, SEM o número de urna (o texto circula em redes: número de urna com
 * nome é a cara de um santinho); `curto`: só os percentuais, na ordem da urna, quando faltar espaço.
 */
export function placarDoPalpite(f: Finalistas, a: number, curto = false): string {
  const [p0, p1] = pctsDoPalpite(a);
  const lado = (c: Finalistas[number], p: number) => (curto ? fmtPalpite(p) : `${c.nomeUrna} ${fmtPalpite(p)}`);
  return `${lado(f[0], p0)} × ${lado(f[1], p1)}`;
}

function primeiroQueCabe(tentativas: string[]): string {
  for (const t of tentativas) if (pesoTextoX(t) <= LIMITE_TEXTO) return t;
  return limitarTexto(tentativas[tentativas.length - 1]);
}

/** Texto do cartão "Meu palpite". `aberto` = ainda dá para fazer palpite (até as 23h59 de 24/10). */
export function textoMeuPalpite(f: Finalistas, a: number, aberto: boolean): string {
  const convite = aberto ? 'Faça o seu até 24/10:' : 'Acompanhe a apuração:';
  return primeiroQueCabe([
    `Meu palpite para o 2º turno no Sintonia: ${placarDoPalpite(f, a)} dos votos válidos. ${convite}`,
    `Meu palpite para o 2º turno: ${placarDoPalpite(f, a)} dos votos válidos. ${convite}`,
    `Meu palpite para o 2º turno: ${placarDoPalpite(f, a, true)} dos votos válidos. ${convite}`,
  ]);
}

/** Texto do cartão do resultado ("Errei por Z p.p." / "Na mosca"). */
export function textoResultadoPalpite(f: Finalistas, a: number, av: Avaliacao): string {
  const dif = fmtDiferenca(av.erro);
  const cabeca = av.naMosca
    ? `Na mosca: meu palpite para o 2º turno ficou a ${dif} do resultado oficial do TSE`
    : `Errei o palpite do 2º turno por ${dif}, comparado com o resultado oficial do TSE`;
  return primeiroQueCabe([
    `${cabeca}. Meu palpite: ${placarDoPalpite(f, a)}. Compare o seu no Sintonia:`,
    `${cabeca}. Palpite: ${placarDoPalpite(f, a, true)}. Compare o seu:`,
    `${av.naMosca ? 'Na mosca' : `Errei por ${dif}`} no palpite do 2º turno: ${placarDoPalpite(f, a, true)}.`,
  ]);
}

/** Manchete do resultado (página e cartão). */
export const mancheteResultado = (av: Avaliacao, pessoa: 'eu' | 'voce' | 'recebido'): string => {
  if (av.naMosca) return 'Na mosca';
  if (pessoa === 'eu') return `Errei por ${fmtDiferenca(av.erro)}`;
  if (pessoa === 'voce') return `Você errou por ${fmtDiferenca(av.erro)}`;
  return `Errou por ${fmtDiferenca(av.erro)}`;
};

/**
 * Cartão de quem chega ao /palpite depois do prazo sem palpite salvo: o texto segue a fase REAL do processo (nunca
 * "a apuração começou" durante a votação, nem "começou" depois do fim).
 */
export function textoSemPalpite(votacao: boolean, fase: 'pre' | 'apurando' | 'encerrada' | undefined): { titulo: string; texto: string; botao: string } {
  // durante a votação (até as 19h, prorrogada; eram 17h): o horário do fim da votação; o botão só promete a contagem
  // regressiva quando a página da apuração ainda a mostra (fase 'pre')
  if (votacao || fase === 'pre')
    return {
      titulo: `A votação vai até as ${HORA_FIM_VOTACAO}`,
      texto: `Às ${HORA_FIM_VOTACAO} (horário de Brasília), quando termina a votação, começa a divulgação dos resultados: os números do TSE aparecem na apuração, estado por estado, cidade por cidade, seção por seção.`,
      botao: fase === 'pre' ? 'Ver a contagem regressiva' : 'Ir para a apuração',
    };
  if (fase === 'encerrada')
    return {
      titulo: 'A apuração do 2º turno terminou',
      texto: 'Veja o resultado oficial do TSE, estado por estado, cidade por cidade, seção por seção.',
      botao: 'Ver o resultado',
    };
  return {
    titulo: 'A apuração do 2º turno está em andamento',
    texto: 'Acompanhe os números do TSE estado por estado, cidade por cidade, seção por seção.',
    botao: 'Acompanhar a apuração',
  };
}
