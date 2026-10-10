/**
 * Ações globais abertas de qualquer lugar (menu "Mais", rodapé, Home, página nacional) e montadas UMA vez no AppShell:
 *  - "Compartilhar o Sintonia" (convite com imagem, texto e link) → `abrirCompartilharSite()`;
 *  - "Incorporar no seu site" (código do iframe + prévia) → `abrirIncorporar(opcoes?)`.
 * Os painéis são carregados sob demanda na 1ª abertura (fora do JS inicial).
 */
import { lazy, Suspense, useSyncExternalStore } from 'react';
import type { OpcoesEmbed } from '@/app/components/embed/codigo';

type Acao = { tipo: 'compartilhar' } | { tipo: 'incorporar'; opcoes?: Partial<OpcoesEmbed> } | null;

let atual: Acao = null;
/** Painéis já abertos alguma vez: continuam montados (fechados) para a animação de saída funcionar. */
const montados = { compartilhar: false, incorporar: false };
const ouvintes = new Set<() => void>();
function definir(a: Acao) {
  atual = a;
  if (a) montados[a.tipo] = true;
  ouvintes.forEach((f) => f());
}

export const abrirCompartilharSite = () => definir({ tipo: 'compartilhar' });
export const abrirIncorporar = (opcoes?: Partial<OpcoesEmbed>) => definir({ tipo: 'incorporar', opcoes });
export const fecharAcaoGlobal = () => definir(null);

/** Pré-carrega o painel (ex.: ao apontar para o botão). */
export const preCarregarCompartilharSite = () => void import('@/app/components/pages/home/CompartilharSite');
export const preCarregarIncorporar = () => void import('@/app/components/embed/DialogoIncorporar');

function useAcao(): Acao {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => atual,
    () => null,
  );
}

const CompartilharSite = lazy(() => import('@/app/components/pages/home/CompartilharSite'));
const DialogoIncorporar = lazy(() => import('@/app/components/embed/DialogoIncorporar'));

/** Montado uma vez no AppShell. */
export function AcoesGlobais() {
  const a = useAcao();
  if (!montados.compartilhar && !montados.incorporar) return null;
  return (
    <Suspense fallback={null}>
      {montados.compartilhar ? <CompartilharSite aberto={a?.tipo === 'compartilhar'} onFechar={fecharAcaoGlobal} /> : null}
      {montados.incorporar ? (
        <DialogoIncorporar aberto={a?.tipo === 'incorporar'} onFechar={fecharAcaoGlobal} inicial={a?.tipo === 'incorporar' ? a.opcoes : undefined} />
      ) : null}
    </Suspense>
  );
}
