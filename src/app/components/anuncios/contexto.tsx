/**
 * Quem aparece em cada posição de anúncio da página atual. O provedor fica no AppShell (e no Modo TV, que tem
 * moldura própria) e recalcula a escolha a cada página (semente = visita + caminho; `escolhaDaPagina` em nucleo.ts).
 * Sem provedor (ex.: widgets incorporados, admin), nenhum bloco aparece.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { AnuncioPublico } from '@/shared/anuncios';
import { useStatus } from '@/app/data/hooks';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { escolhaDaPagina, rodapePermitido, type EscolhaPagina } from './nucleo';
import { idDaVisita, lembrarTopo } from './visita';

export interface AnunciosDaPagina {
  escolha: EscolhaPagina;
  /** página vista (muda a cada navegação; reinicia a contagem de impressões) */
  vista: string;
  /** o status já chegou (antes disso, não se sabe se há anúncio) */
  pronto: boolean;
  anuncios: readonly AnuncioPublico[];
}

const Ctx = createContext<AnunciosDaPagina | null>(null);

function useCalcular(): AnunciosDaPagina {
  const status = useStatus();
  const { pathname, key } = useLocation();
  const anuncios = status.data?.anuncios;
  const pronto = status.data !== undefined || status.isError;
  // a barra do rodapé só existe no celular (e fora das telas de pergunta): no desktop os cartões não a evitam
  const celular = !useMediaQuery('(min-width: 768px)', true);
  const rodapeNaTela = celular && rodapePermitido(pathname);
  const escolha = useMemo(
    () => escolhaDaPagina(anuncios, `${idDaVisita()}|${pathname}`, { rodapeNaTela }),
    [anuncios, pathname, rodapeNaTela],
  );
  useEffect(() => {
    if (status.data) lembrarTopo(!!escolha.topo);
  }, [status.data, escolha.topo]);
  return useMemo(() => ({ escolha, vista: `${pathname}#${key}`, pronto, anuncios: anuncios ?? [] }), [escolha, pathname, key, pronto, anuncios]);
}

export function ProvedorAnuncios({ children }: { children: ReactNode }) {
  const valor = useCalcular();
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

const VAZIO: AnunciosDaPagina = { escolha: escolhaDaPagina([], 'vazio'), vista: 'vazio', pronto: true, anuncios: [] };

/** Anúncios da página atual (sem provedor: nenhum). */
export function useAnunciosDaPagina(): AnunciosDaPagina & { semProvedor: boolean } {
  const ctx = useContext(Ctx);
  return ctx ? { ...ctx, semProvedor: false } : { ...VAZIO, semProvedor: true };
}
