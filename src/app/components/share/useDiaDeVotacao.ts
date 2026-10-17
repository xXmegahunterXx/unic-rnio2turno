/**
 * Dia da votação antes das 17h (0h–17h de 25/10, Brasília), pelo relógio do SERVIDOR (o do status que o AppShell já
 * consulta; sem status, o do aparelho), revisto a cada 30 s. Para telas que oferecem compartilhar fora do sheet do kit
 * (o sheet decide sozinho, com `trocaPeloConvite`): nesse intervalo, nada com candidato sai da página.
 */
import { useStatus } from '@/app/data/hooks';
import { useNow } from '@/app/lib/useNow';
import { diaDeVotacaoAntesDas17 } from '@/shared/diaVotacao';

export function useDiaDeVotacao(): boolean {
  const q = useStatus();
  const local = useNow(30_000);
  const st = q.data;
  const agora = st && q.dataUpdatedAt && Number.isFinite(st.wallNow) ? local + (st.wallNow - q.dataUpdatedAt) : local;
  return diaDeVotacaoAntesDas17(agora);
}
