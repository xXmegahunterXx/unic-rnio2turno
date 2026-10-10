/**
 * Dados das curiosidades (estáticos: public/data/curiosidades.json, ~40 KB), com o cache do React Query.
 * São números REAIS do 1º turno — não passam pela anonimização da simulação.
 */
import type { CuriosidadesDataset } from '@/shared/curiosidades';
import { useDadoEstatico } from '@/app/data/estatico';
import { CAMINHO_DADOS } from './formato';

export const useCuriosidades = () => useDadoEstatico<CuriosidadesDataset>(CAMINHO_DADOS);
