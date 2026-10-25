/**
 * Dia da votação até o fim dela (0h–19h de 25/10, Brasília — `FIM_VOTACAO`; eram 17h até a prorrogação), pelo relógio
 * do SERVIDOR (o do status que o AppShell já consulta; sem status, o do aparelho), revisto a cada 30 s: a virada das 19h
 * chega em até 30 s, sem timer preso ao horário antigo. Para telas que oferecem compartilhar fora do sheet do kit
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
