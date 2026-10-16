/**
 * A barra fixa do rodapé (celular) nunca fica por cima de um resultado nem encostada em foto, nome ou número de
 * candidato (ARCHITECTURE §1.5). Os blocos com resultado/candidato levam o atributo `data-sem-anuncio-fixo`
 * (cartão do confronto na Home, topo da /apuracao, placares, retratos e avatares com foto, barras de votos, boletim de
 * urna, grade de governadores…); enquanto algum deles estiver na faixa de baixo da tela — onde a barra fica, com
 * respiro —, a barra fica escondida (o espaço no fim da página continua reservado: nada pula).
 *
 * Medição com IntersectionObserver (a raiz é só a faixa de baixo: `rootMargin` com o topo negativo), refeita ao trocar
 * de página, ao mudar a altura da tela (janela ou `visualViewport`) e quando a página ganha ou perde blocos marcados
 * (MutationObserver, com atraso). Esconde na hora; para voltar espera um instante livre (sem pisca-pisca na borda).
 *
 * A altura da tela nunca passa da altura da TELA do aparelho (`alturaTela`): durante o carregamento, antes do CSS, o
 * celular pode reduzir o zoom para caber uma página larga e o `innerHeight` chega a ~3.400 px — um observador criado
 * nessa hora vigiaria a faixa errada para sempre. Rede de segurança: na rolagem (1× por quadro), se a altura mudou o
 * observador é refeito, e um bloco marcado na faixa (pela geometria) esconde a barra mesmo que o observador não tenha
 * avisado.
 *
 * Rede de segurança contra candidato (anunciantes v2): além dos blocos marcados, a barra some diante de QUALQUER
 * elemento com cor de candidato (`SELETOR_CANDIDATO`: classe `*cand-*`, estilo com `--cand-*` ou `data-candidato`) fora
 * de um bloco já marcado e fora de peças fixas — um bloco novo que esqueceu a marca continua protegido. Com mais de
 * `MAX_CANDIDATOS` desses elementos na página, a barra fica escondida nela (lado seguro, sem vigiar milhares).
 */
import { useEffect, useState } from 'react';

/** Atributo dos blocos que a barra fixa não pode cobrir (use `data-sem-anuncio-fixo` no elemento). */
export const SELETOR_SEM_ANUNCIO_FIXO = '[data-sem-anuncio-fixo]';

/**
 * Elementos com cor de candidato (fora dos blocos marcados, que já são vigiados inteiros, e fora das peças fixas — a
 * própria barra, a tab bar, a pílula do chat).
 */
export const SELETOR_CANDIDATO =
  '[class*="cand-"]:not([data-sem-anuncio-fixo] *):not(.fixed *), [style*="--cand-"]:not([data-sem-anuncio-fixo] *):not(.fixed *), [data-candidato]';

/** Acima disto, a página tem cor de candidato demais para vigiar: a barra fica escondida nela. */
export const MAX_CANDIDATOS = 2000;

/** Classe ou estilo com cor de candidato? (a mesma regra de `SELETOR_CANDIDATO`, para os testes e a reserva sem IO) */
export function temCorDeCandidato(classe: string | null | undefined, estilo: string | null | undefined): boolean {
  return (classe ?? '').includes('cand-') || (estilo ?? '').includes('--cand-');
}

/** Blocos vigiados agora: os marcados e os com cor de candidato (`excesso` = cor de candidato demais na página). */
function vigiados(): { els: Set<Element>; excesso: boolean } {
  const cand = document.querySelectorAll(SELETOR_CANDIDATO);
  const excesso = cand.length > MAX_CANDIDATOS;
  const els = new Set<Element>(document.querySelectorAll(SELETOR_SEM_ANUNCIO_FIXO));
  if (!excesso) cand.forEach((el) => els.add(el));
  return { els, excesso };
}

/**
 * Altura da faixa de baixo vigiada (px): tab bar (60) + barra (60 + 8) + área segura típica (34) + respiro (~40).
 * Quando a tab bar sai ao rolar, a barra desce 60 px: continua dentro da faixa.
 */
export const FAIXA_BARRA_PX = 200;

/** Espera com a faixa livre antes de mostrar a barra (ms). */
export const ESPERA_LIVRE_MS = 250;

/**
 * A faixa continua um pouco ABAIXO da tela (px): a barra sai antes de o bloco começar a aparecer no pé da tela (ao
 * rolar para baixo, a tab bar some e a barra encosta no pé).
 */
export const ANTECIPA_PX = 64;

/** `rootMargin` do observador: corta o topo da tela e deixa só a faixa de baixo (`alturaTela` em px) + a antecipação. */
export function margemDaFaixa(alturaTela: number, faixa = FAIXA_BARRA_PX): string {
  const corte = Math.max(0, Math.round(alturaTela - faixa));
  return `-${corte}px 0px ${ANTECIPA_PX}px 0px`;
}

/**
 * Altura útil da tela (px): o menor entre a janela, o `visualViewport` e a altura da tela do aparelho (o zoom reduzido
 * do carregamento infla os dois primeiros, nunca o último). `win` só para testes.
 */
export function alturaTela(
  win: Pick<Window, 'innerHeight'> & { visualViewport?: { height: number } | null; screen?: { height: number } } = window,
): number {
  const candidatas = [win.innerHeight, win.visualViewport?.height, win.screen?.height].filter((x): x is number => typeof x === 'number' && x > 0);
  return candidatas.length ? Math.min(...candidatas) : 0;
}

/** Retângulo (posição na tela) dentro da faixa de baixo (ou logo abaixo da tela)? Reserva sem IntersectionObserver e testes. */
export function naFaixa(r: { top: number; bottom: number }, alturaTela: number, faixa = FAIXA_BARRA_PX): boolean {
  const topoFaixa = Math.max(0, alturaTela - faixa);
  return r.bottom > topoFaixa && r.top < alturaTela + ANTECIPA_PX;
}

/**
 * true quando nenhum bloco marcado está na faixa de baixo da tela. `chave` (ex.: o caminho) refaz a medição do zero
 * ao trocar de página; enquanto mede, devolve false (a barra não aparece "por engano" sobre a página nova).
 */
export function useFaixaLivre(ativo: boolean, chave: string): boolean {
  const [livre, setLivre] = useState(false);
  useEffect(() => {
    setLivre(false);
    if (!ativo || typeof window === 'undefined') return;
    if (typeof IntersectionObserver === 'undefined') {
      // navegador muito antigo: confere na rolagem
      const conferir = () => {
        const { els, excesso } = vigiados();
        let ocupado = excesso;
        for (const el of els) {
          if (ocupado) break;
          if (naFaixa(el.getBoundingClientRect(), alturaTela())) ocupado = true;
        }
        setLivre(!ocupado);
      };
      conferir();
      window.addEventListener('scroll', conferir, { passive: true });
      window.addEventListener('resize', conferir);
      return () => {
        window.removeEventListener('scroll', conferir);
        window.removeEventListener('resize', conferir);
      };
    }

    const dentro = new Set<Element>();
    const observados = new Set<Element>();
    // cor de candidato demais na página (> MAX_CANDIDATOS): a barra fica escondida nela
    let excesso = false;
    let io: IntersectionObserver | null = null;
    let tMostrar = 0;
    let tVarrer = 0;
    let tAltura = 0;
    let quadro = 0;
    let altura = alturaTela();

    const aplicar = () => {
      if (dentro.size > 0 || excesso) {
        if (tMostrar) window.clearTimeout(tMostrar);
        tMostrar = 0;
        setLivre(false);
      } else if (!tMostrar) {
        tMostrar = window.setTimeout(() => {
          tMostrar = 0;
          setLivre(dentro.size === 0 && !excesso);
        }, ESPERA_LIVRE_MS);
      }
    };
    const varrer = () => {
      tVarrer = 0;
      if (!io) return;
      const { els: atuais, excesso: demais } = vigiados();
      excesso = demais;
      for (const el of observados) {
        if (!atuais.has(el)) {
          io.unobserve(el);
          observados.delete(el);
          dentro.delete(el);
        }
      }
      for (const el of atuais) {
        if (!observados.has(el)) {
          io.observe(el);
          observados.add(el);
          // até o observador responder (próximo quadro), confere na hora: nunca mostra sobre um bloco recém-chegado
          if (naFaixa(el.getBoundingClientRect(), altura)) dentro.add(el);
        }
      }
      aplicar();
    };
    const criar = () => {
      io?.disconnect();
      dentro.clear();
      observados.clear();
      altura = alturaTela();
      io = new IntersectionObserver(
        (entradas) => {
          for (const e of entradas) {
            if (e.isIntersecting) dentro.add(e.target);
            else dentro.delete(e.target);
          }
          aplicar();
        },
        { rootMargin: margemDaFaixa(altura), threshold: 0 },
      );
      varrer();
    };
    const agendarVarredura = () => {
      if (!tVarrer) tVarrer = window.setTimeout(varrer, 120);
    };
    const aoMudarAltura = () => {
      // a barra de endereço do celular muda a altura ao rolar: refaz só quando muda de verdade, com atraso
      if (Math.abs(alturaTela() - altura) < 24) return;
      if (tAltura) window.clearTimeout(tAltura);
      tAltura = window.setTimeout(() => {
        tAltura = 0;
        criar();
      }, 150);
    };
    /** Rede de segurança na rolagem (1× por quadro): altura nova → refaz; bloco na faixa pela geometria → esconde. */
    const aoRolar = () => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(() => {
        quadro = 0;
        if (Math.abs(alturaTela() - altura) >= 24) {
          criar();
          return;
        }
        let mudou = false;
        for (const el of observados) {
          if (!dentro.has(el) && naFaixa(el.getBoundingClientRect(), altura)) {
            dentro.add(el);
            mudou = true;
          }
        }
        if (mudou) aplicar();
      });
    };

    criar();
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(agendarVarredura) : null;
    mo?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', aoMudarAltura);
    window.visualViewport?.addEventListener('resize', aoMudarAltura);
    window.addEventListener('scroll', aoRolar, { passive: true });
    // depois do carregamento (CSS aplicado, zoom normal), confere a altura de novo
    if (document.readyState !== 'complete') window.addEventListener('load', aoMudarAltura, { once: true });
    return () => {
      mo?.disconnect();
      io?.disconnect();
      io = null;
      window.removeEventListener('resize', aoMudarAltura);
      window.visualViewport?.removeEventListener('resize', aoMudarAltura);
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('load', aoMudarAltura);
      if (quadro) window.cancelAnimationFrame(quadro);
      for (const t of [tMostrar, tVarrer, tAltura]) if (t) window.clearTimeout(t);
    };
  }, [ativo, chave]);
  return livre;
}
