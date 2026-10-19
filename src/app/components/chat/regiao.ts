/**
 * Áreas fixas da tela (a do popup do chat aberto, a da pílula minimizada) estão em cima de candidato? Os mesmos blocos
 * vigiados da barra de anúncio do celular (anuncios/faixaLivre.ts): os marcados com `data-sem-anuncio-fixo` (placar,
 * gráficos, mapas, tabelas, Destaques, retratos…) e, como rede de segurança, qualquer elemento com cor de candidato
 * fora deles.
 *
 * Diferente da barra (a faixa inteira do pé da tela), aqui cada área é um retângulo qualquer: um IntersectionObserver
 * comum (raiz = janela, sem `rootMargin`, que é ignorado dentro de iframe de outra origem) mantém só os blocos que estão
 * na tela, e a geometria (`cruza`) decide se algum cruza cada área — na rolagem (1× por quadro), quando o observador
 * avisa e quando a página ganha ou perde blocos (MutationObserver, com atraso curto: troca de página incluída). Ocupa na
 * hora; para liberar espera um instante livre (sem pisca-pisca na borda de um bloco). Antes da 1ª medição, tudo
 * "ocupado" (lado seguro) e `medido` = false.
 *
 * Além deles, o popup também evita `[data-chat-evita]`: o que não é candidato mas não pode ficar escondido por ele (os
 * avisos legais do /palpite, os anúncios nativos — um anunciante não tapa o de outro, e a impressão contaria coberta).
 *
 * Os elementos do próprio chat (`[data-chat-flutuante]`) nunca contam, nem os brilhos DECORATIVOS com cor de candidato
 * (`aria-hidden` + `pointer-events-none`: fundo do hero, manchas de luz) — não têm número, nome nem foto, e recolhiam o
 * popup à toa. Os blocos marcados contam sempre.
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_CANDIDATOS, SELETOR_CANDIDATO, SELETOR_SEM_ANUNCIO_FIXO } from '@/app/components/anuncios/faixaLivre';
import { cruza, type Retangulo } from './nucleo';

/** Espera com a área livre antes de liberar (ms). */
export const ESPERA_LIVRE_MS = 350;

/** Atributo da raiz das peças do chat flutuante (fora da vigilância). */
export const ATRIBUTO_CHAT = 'data-chat-flutuante';

/** O que o popup do chat também não cobre (não é candidato: a barra de anúncio do celular não precisa evitar). */
export const SELETOR_CHAT_EVITA = '[data-chat-evita]';

/** Brilho decorativo (fundo, mancha de luz): escondido do leitor de tela e sem clique. */
const SELETOR_DECORATIVO = '[aria-hidden="true"].pointer-events-none';

function vigiados(): { els: Set<Element>; excesso: boolean } {
  const cand = document.querySelectorAll(SELETOR_CANDIDATO);
  const excesso = cand.length > MAX_CANDIDATOS;
  const els = new Set<Element>();
  const juntar = (el: Element) => {
    if (!el.closest(`[${ATRIBUTO_CHAT}]`)) els.add(el);
  };
  document.querySelectorAll(SELETOR_SEM_ANUNCIO_FIXO).forEach(juntar);
  document.querySelectorAll(SELETOR_CHAT_EVITA).forEach(juntar);
  if (!excesso)
    cand.forEach((el) => {
      if (!el.closest(SELETOR_DECORATIVO)) juntar(el);
    });
  return { els, excesso };
}

/**
 * Para cada área, true enquanto algum bloco com candidato a cruza. `ativo` = false: não vigia (devolve tudo false).
 * As áreas podem mudar a cada render (janela redimensionada, popup maior): a conferência usa sempre as atuais.
 */
export function useRegioesOcupadas(regioes: readonly Retangulo[], ativo: boolean): { ocupadas: boolean[]; medido: boolean } {
  const n = regioes.length;
  const [estado, setEstado] = useState<{ ocupadas: boolean[]; medido: boolean }>(() => ({ ocupadas: Array(n).fill(true), medido: false }));
  const atuais = useRef(regioes);
  atuais.current = regioes;
  const conferirRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!ativo || typeof window === 'undefined' || typeof document === 'undefined') return;
    const naTela = new Set<Element>();
    const observados = new Set<Element>();
    let excesso = false;
    let quadro = 0;
    let tVarrer = 0;
    let ocupadas = atuais.current.map(() => true);
    let medido = false;
    const tLivre: number[] = [];
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entradas) => {
            for (const e of entradas) {
              if (e.isIntersecting) naTela.add(e.target);
              else naTela.delete(e.target);
            }
            conferir();
          })
        : null;

    const publicar = () => setEstado({ ocupadas: ocupadas.slice(), medido });
    function conferir() {
      const rs = atuais.current;
      // sem IntersectionObserver (navegador muito antigo): confere todos
      const lista = io ? naTela : observados;
      const rects: DOMRect[] = [];
      if (!excesso) for (const el of lista) rects.push(el.getBoundingClientRect());
      let mudou = false;
      rs.forEach((r, i) => {
        const oc = excesso || rects.some((b) => cruza(b, r));
        if (oc) {
          if (tLivre[i]) window.clearTimeout(tLivre[i]);
          tLivre[i] = 0;
          if (!ocupadas[i]) {
            ocupadas[i] = true;
            mudou = true;
          }
        } else if (ocupadas[i] && !tLivre[i]) {
          // 1ª medição: libera já (nada a evitar piscando ainda)
          if (!medido) {
            ocupadas[i] = false;
            mudou = true;
          } else {
            tLivre[i] = window.setTimeout(() => {
              tLivre[i] = 0;
              ocupadas[i] = false;
              publicar();
            }, ESPERA_LIVRE_MS);
          }
        }
      });
      if (ocupadas.length !== rs.length) {
        ocupadas = rs.map((_, i) => ocupadas[i] ?? true);
        mudou = true;
      }
      if (!medido) {
        medido = true;
        mudou = true;
      }
      if (mudou) publicar();
    }
    conferirRef.current = conferir;

    const varrer = () => {
      tVarrer = 0;
      const { els, excesso: demais } = vigiados();
      excesso = demais;
      for (const el of observados) {
        if (!els.has(el)) {
          io?.unobserve(el);
          observados.delete(el);
          naTela.delete(el);
        }
      }
      for (const el of els) {
        if (observados.has(el)) continue;
        observados.add(el);
        io?.observe(el);
        // até o observador responder (próximo quadro), conta como na tela: nunca abre sobre um bloco recém-chegado
        naTela.add(el);
      }
      conferir();
    };
    const agendarVarredura = () => {
      if (!tVarrer) tVarrer = window.setTimeout(varrer, 100);
    };
    const aoRolar = () => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(() => {
        quadro = 0;
        conferir();
      });
    };

    varrer();
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(agendarVarredura) : null;
    mo?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => {
      mo?.disconnect();
      io?.disconnect();
      window.removeEventListener('scroll', aoRolar);
      if (quadro) window.cancelAnimationFrame(quadro);
      if (tVarrer) window.clearTimeout(tVarrer);
      for (const t of tLivre) if (t) window.clearTimeout(t);
      conferirRef.current = () => undefined;
    };
  }, [ativo]);

  // as áreas mudaram (janela redimensionada, popup maior): confere de novo com os blocos que já estão na tela
  const chave = regioes.map((r) => `${r.top}|${r.left}|${r.right}|${r.bottom}`).join(';');
  useEffect(() => {
    conferirRef.current();
  }, [chave]);

  if (!ativo) return { ocupadas: regioes.map(() => false), medido: true };
  return estado;
}
