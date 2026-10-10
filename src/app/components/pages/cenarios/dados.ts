/**
 * Dados e estado da calculadora de cenários (/cenarios).
 *
 *  - `usePresidenteT1()`: public/data/presidente-t1.json (~7 KB, resultado OFICIAL do 1º turno por UF).
 *  - `useCenario(ds)`: o cenário montado pela pessoa. Fonte de verdade = estado local; a URL (?c=…) acompanha com
 *    `replace` (sem poluir o histórico) para o link ser compartilhável; o último cenário fica também no aparelho
 *    (localStorage, só conveniência — nunca sai do navegador). Um link de cenário inválido volta ao inicial com aviso.
 *
 * Nada é enviado a servidor algum: a calculadora não coleta nem agrega escolhas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CAMINHO_PRESIDENTE_T1,
  PRESET_INICIAL,
  cenarioInicial,
  codificarCenario,
  decodificarCenario,
  presetDoCenario,
  type Cenario,
  type PresidenteT1Dataset,
} from '@/shared/cenarios';
import { useDadoEstatico } from '@/app/data/estatico';
import { toast } from '@/app/ui/Toast';

export const usePresidenteT1 = () => useDadoEstatico<PresidenteT1Dataset>(CAMINHO_PRESIDENTE_T1);

const CHAVE_LOCAL = 'sintonia:cenario';

function lerLocal(ds: PresidenteT1Dataset): Cenario | null {
  try {
    const c = window.localStorage.getItem(CHAVE_LOCAL);
    return c ? decodificarCenario(c, ds) : null;
  } catch {
    return null;
  }
}

function gravarLocal(codigo: string | null) {
  try {
    if (codigo) window.localStorage.setItem(CHAVE_LOCAL, codigo);
    else window.localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    /* modo privado / armazenamento bloqueado: segue sem lembrar */
  }
}

/** Código do cenário para a URL (null = cenário inicial, URL limpa). */
export const codigoParaUrl = (c: Cenario, ds: PresidenteT1Dataset) => (presetDoCenario(c, ds) === PRESET_INICIAL ? null : codificarCenario(c));

export function useCenario(ds: PresidenteT1Dataset | undefined) {
  const [params, setParams] = useSearchParams();
  const codigoUrl = params.get('c');
  const [cenario, setCenario] = useState<Cenario | null>(null);
  /** Último código que NÓS escrevemos na URL (para distinguir de uma navegação externa). */
  const escrito = useRef<string | null | undefined>(undefined);

  // Inicialização e navegação externa (ex.: abrir outro link de cenário com a página aberta).
  useEffect(() => {
    if (!ds) return;
    if (escrito.current === undefined) {
      const daUrl = codigoUrl ? decodificarCenario(codigoUrl, ds) : null;
      if (codigoUrl && !daUrl) toast('Link de cenário inválido. Mostrando o ponto de partida.', { tone: 'alert', icon: 'alerta' });
      // Guarda o código como veio: se for inválido (ou não canônico), o efeito abaixo reescreve/limpa a URL.
      escrito.current = codigoUrl;
      setCenario(daUrl ?? (codigoUrl ? null : lerLocal(ds)) ?? cenarioInicial(ds));
      return;
    }
    if (codigoUrl === escrito.current) return;
    escrito.current = codigoUrl;
    const d = codigoUrl ? decodificarCenario(codigoUrl, ds) : null;
    setCenario(d ?? cenarioInicial(ds));
  }, [ds, codigoUrl]);

  // URL e aparelho acompanham o estado (com atraso curto: arrastar um slider não gera dezenas de navegações).
  useEffect(() => {
    if (!ds || !cenario) return;
    const t = window.setTimeout(() => {
      const cod = codigoParaUrl(cenario, ds);
      gravarLocal(cod);
      if (cod === escrito.current) return;
      escrito.current = cod;
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (cod) p.set('c', cod);
          else p.delete('c');
          return p;
        },
        { replace: true, preventScrollReset: true },
      );
    }, 280);
    return () => window.clearTimeout(t);
  }, [cenario, ds, setParams]);

  const atualizar = useCallback((f: (c: Cenario) => Cenario) => setCenario((c) => (c ? f(c) : c)), []);
  return { cenario, setCenario, atualizar };
}
