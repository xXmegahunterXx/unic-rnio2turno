/**
 * Estado do Desafio do palpite no app (hook): o "Meu desafio" deste aparelho, sincronizado entre abas pelo evento
 * 'storage'. Nada aqui envia dado algum — tudo fica no localStorage (com try/catch em desafio.ts) e no link que a pessoa
 * decidir mandar.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CHAVE_DESAFIO,
  DESAFIO_VAZIO,
  apagarDesafio,
  definirEu,
  gravarDesafio,
  incluirParticipante,
  lerDesafio,
  removerParticipante,
  type EstadoDesafio,
  type Participante,
  type ResultadoInclusao,
} from './desafio';

export interface DesafioApp {
  estado: EstadoDesafio;
  /** abre um link de desafio (grava e devolve o que aconteceu) */
  incluir: (p: Participante, agora: number) => ResultadoInclusao;
  remover: (id: string) => void;
  /** define ou troca o apelido da própria pessoa (o id se mantém) */
  definirApelido: (apelido: string) => void;
  /** apaga o desafio deste aparelho (apelido e participantes) */
  apagar: () => void;
}

export function useDesafio(): DesafioApp {
  const [estado, setEstado] = useState<EstadoDesafio>(() => lerDesafio());
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === null || e.key === CHAVE_DESAFIO) setEstado(lerDesafio());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);
  // armazenamento bloqueado (modo privado): o desafio vale nesta aba, mas não é lembrado
  const aplicar = useCallback((novo: EstadoDesafio) => {
    gravarDesafio(novo);
    setEstado(novo);
  }, []);
  const incluir = useCallback(
    (p: Participante, agora: number) => {
      // lê do armazenamento na hora (outra aba pode ter mudado) e grava só se mudou
      const atual = lerDesafio();
      const base = atual.eu || atual.participantes.length ? atual : estado;
      const r = incluirParticipante(base, p, agora);
      if (r.estado !== base) aplicar(r.estado);
      return r.resultado;
    },
    [aplicar, estado],
  );
  const remover = useCallback((id: string) => aplicar(removerParticipante(estado, id)), [aplicar, estado]);
  const definirApelido = useCallback((apelido: string) => aplicar(definirEu(estado, apelido)), [aplicar, estado]);
  const apagar = useCallback(() => {
    apagarDesafio();
    setEstado(DESAFIO_VAZIO);
  }, []);
  return { estado, incluir, remover, definirApelido, apagar };
}
