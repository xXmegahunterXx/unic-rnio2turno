/**
 * Candidatos da corrida 'pres' (2º turno) para revelar as posições no Teste Cego.
 * Vêm do useMeta() — nunca digitados à mão — e são os REAIS mesmo na simulação: o teste usa propostas reais
 * e não mostra número de apuração algum (ver comentário em data/hooks.ts). Ordem SEMPRE a da urna.
 *
 * Fotos oficiais do TSE (pacote public/data/fotos/segundo-turno.json, chave = Candidate.sqcand) só quando:
 *  - o pacote existe e traz foto de TODOS os finalistas (mesmo tratamento para os dois);
 *  - o status NÃO está anonimizado (simulação com nomes ocultos nunca mostra rosto real).
 * Sem foto: monograma com a cor do slot (CandidateAvatar).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAnonimizado, useMeta } from '@/app/data/hooks';
import { assetUrl } from '@/app/lib/assets';
import type { FotoPacote } from '@/shared/dataset';
import type { Candidate } from '@/shared/types';
import { AUTORES, type Autor } from './sintonia';

export interface CandidatosTeste {
  /** Na ordem da urna. */
  lista: Candidate[];
  porNumero: Record<Autor, Candidate>;
  /** Foto oficial por número (data URI) — só quando há para os dois e não está anonimizado. */
  fotos: Partial<Record<Autor, string>>;
  carregando: boolean;
}

const GRUPO_PADRAO = 'segundo-turno';
const DATA_URI_IMAGEM = /^data:image\/(webp|jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/;

/** Enquanto o meta não chega (ou se falhar): rótulos neutros só com o número, cores pela ordem da urna. */
function provisorio(numero: Autor): Candidate {
  return { numero, nomeUrna: `Nº ${numero}`, nome: `Candidatura nº ${numero}`, partido: '', cor: numero === 13 ? 'a' : 'b' };
}

/** Pacote de fotos de um grupo (arquivo estático; GET sem nenhum dado do teste). null se não existir. */
function usePacoteFotos(grupo: string | null) {
  return useQuery({
    queryKey: ['fotos', grupo],
    enabled: !!grupo,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<Record<string, string> | null> => {
      try {
        const r = await fetch(assetUrl(`data/fotos/${grupo}.json`), { credentials: 'omit' });
        // Em dev o Vite devolve o index.html (200) para arquivo inexistente: confere o tipo.
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
        const j = (await r.json()) as Partial<FotoPacote>;
        return j && typeof j.fotos === 'object' && j.fotos ? (j.fotos as Record<string, string>) : null;
      } catch {
        return null;
      }
    },
  });
}

export function useCandidatosTeste(): CandidatosTeste {
  const { data, isLoading } = useMeta();
  const anonimizado = useAnonimizado();
  const race = data?.races.find((r) => r.id === 'pres');
  const reais = AUTORES.map((n) => race?.candidatos.find((c) => c.numero === n));
  const grupo = !anonimizado && reais.every((c) => c?.sqcand) ? reais[0]?.fotoGrupo || GRUPO_PADRAO : null;
  const { data: pacote } = usePacoteFotos(grupo);

  return useMemo(() => {
    const porNumero = {} as Record<Autor, Candidate>;
    for (const n of AUTORES) porNumero[n] = race?.candidatos.find((c) => c.numero === n) ?? provisorio(n);
    const lista = [...AUTORES].sort((a, b) => a - b).map((n) => porNumero[n]);
    const fotos: Partial<Record<Autor, string>> = {};
    if (grupo && pacote) {
      const achadas = AUTORES.map((n) => {
        const f = porNumero[n].sqcand ? pacote[porNumero[n].sqcand!] : undefined;
        return typeof f === 'string' && DATA_URI_IMAGEM.test(f) ? f : null;
      });
      // tratamento igual: ou os dois com foto, ou nenhum
      if (achadas.every(Boolean)) AUTORES.forEach((n, i) => (fotos[n] = achadas[i]!));
    }
    return { lista, porNumero, fotos, carregando: isLoading && !race };
  }, [race, isLoading, grupo, pacote]);
}
