/**
 * Áreas fixas da tela (a do popup do chat aberto, a da pílula minimizada) estão em cima de candidato? Os mesmos blocos
 * vigiados da barra de anúncio do celular (anuncios/faixaLivre.ts): os marcados com `data-sem-anuncio-fixo` (placar,
 * gráficos, mapas, tabelas, Destaques, retratos, cartões e linhas de candidato…) e, como rede de segurança, qualquer
 * elemento com cor de candidato fora deles e a LINHA (li/tr) de cada link para a ficha de um candidato.
 *
 * Diferente da barra (a faixa inteira do pé da tela), aqui cada área é um retângulo qualquer: um IntersectionObserver
 * comum (raiz = janela) mantém só os blocos que estão na tela — com `antecipar`, também os que estão até
 * `ALCANCE_MAX_PX` fora dela (`rootMargin`; dentro de iframe de outra origem ele é ignorado e vale só a tela) —, e a
 * geometria (`cruza`) decide se algum cruza cada área: no próprio evento de rolagem (1× por quadro, antes da pintura),
 * quando o observador avisa, quando a página ganha ou perde blocos (MutationObserver: no quadro seguinte, no máximo 10×
 * por segundo) e quando a página muda de tamanho sem mexer no DOM (ResizeObserver: imagem que carrega, fonte, dado que
 * chegou; conferido no próprio aviso, antes da pintura). Ocupa na hora; para liberar, a área precisa ficar
 * livre com `histerese` px a mais de folga durante `esperaMs` (`decidirOcupacao`, nucleo.ts) — e é conferida de novo no
 * fim da espera (sem pisca-pisca na borda de um bloco). Antes da 1ª medição, tudo "ocupado" (lado seguro) e `medido` =
 * false.
 *
 * Para o popup não aparecer nem um quadro por cima de candidato:
 *  - `antecipar`: rolando, a área cresce na direção de onde os blocos vêm (`antecipar`, nucleo.ts) e, para LIBERAR, o
 *    caminho à frente precisa estar livre por ~0,7 s na velocidade atual (`alcanceReabrir`: sem abrir e fechar em
 *    seguida no meio da rolagem);
 *  - `aoOcupar(i)`: chamado NA HORA em que a área i passa a ocupada, dentro do quadro (antes da pintura) — quem vigia
 *    esconde a peça direto no elemento, sem esperar o React redesenhar;
 *  - nó novo que pode ser candidato (página nova que chegou, lista que cresceu): varre na hora, na microtarefa do
 *    MutationObserver (`lerMudancas`); o resto do DOM (e o próprio chat, que não conta), no quadro seguinte;
 *  - `chave` (o caminho): trocou de página, mede de novo antes da 1ª pintura da página nova (depois do ScrollRestoration);
 *  - `conferirAgora()`: quem vigia confere na hora (o popup que acabou de montar, antes de ser pintado).
 *
 * Além deles, o popup também evita `[data-chat-evita]`: hoje, só os anúncios nativos REAIS em posição (um anunciante
 * não tapa o de outro, e a impressão visível contaria coberta). A vitrine e as prévias de anúncio (/anuncie, painel) e o
 * anúncio da casa não levam a marca: podem ficar sob o popup.
 *
 * Os elementos do próprio chat (`[data-chat-flutuante]`) nunca contam, nem os brilhos DECORATIVOS com cor de candidato
 * (`aria-hidden` + `pointer-events-none`: fundo do hero, manchas de luz) — não têm número, nome nem foto, e recolhiam o
 * popup à toa. Os blocos marcados contam sempre.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_CANDIDATOS, SELETOR_CANDIDATO, SELETOR_SEM_ANUNCIO_FIXO } from '@/app/components/anuncios/faixaLivre';
import {
  ALCANCE_MAX_PX,
  ANTECIPA_JANELA_MS,
  ANTECIPA_MAX_PX,
  alcanceReabrir,
  antecipar as anteciparArea,
  cruza,
  decidirOcupacao,
  estender,
  inflar,
  type Retangulo,
} from './nucleo';

/** Espera com a área livre antes de liberar (ms), quando quem vigia não diz outra. */
export const ESPERA_LIVRE_MS = 350;

/** Atributo da raiz das peças do chat flutuante (fora da vigilância). */
export const ATRIBUTO_CHAT = 'data-chat-flutuante';

/** O que o popup do chat também não cobre (não é candidato: a barra de anúncio do celular não precisa evitar): anúncio nativo real. */
export const SELETOR_CHAT_EVITA = '[data-chat-evita]';

/** Brilho decorativo (fundo, mancha de luz): escondido do leitor de tela e sem clique. */
const SELETOR_DECORATIVO = '[aria-hidden="true"].pointer-events-none';

/**
 * Rede de segurança para listas que esqueceram a marca: o link para a ficha de um candidato (`/candidato/…`, também no
 * HashRouter do build demo) e, quando ele está numa linha baixa (li, tr, linha de grade — até `ALTURA_MAX_LINHA`), a
 * linha inteira: nome, número, partido, % e votos ficam juntos.
 */
const SELETOR_LINK_CANDIDATO = '#conteudo a[href*="/candidato/"]';
const SELETOR_LINHA = 'li, tr, [role="row"]';
export const ALTURA_MAX_LINHA = 240;

/** Intervalo mínimo entre duas varreduras pedidas por mudança comum no DOM (ms). */
const INTERVALO_VARREDURA_MS = 100;

/**
 * Nó novo no DOM que pode ser candidato (bloco marcado, anúncio real, cor de candidato, link para a ficha): a varredura
 * é feita NA HORA (na microtarefa do MutationObserver, logo depois de o React pôr a página nova no DOM e antes do quadro
 * seguinte), sem esperar o intervalo.
 */
const SELETOR_URGENTE = `${SELETOR_SEM_ANUNCIO_FIXO}, ${SELETOR_CHAT_EVITA}, [class*="cand-"], [style*="--cand-"], [data-candidato], a[href*="/candidato/"]`;

/** Os registros do MutationObserver: algo mudou fora do chat? E chegou nó que pode ser candidato? */
export function lerMudancas(registros: readonly MutationRecord[]): { fora: boolean; urgente: boolean } {
  let fora = false;
  let urgente = false;
  for (const r of registros) {
    if (r.target instanceof Element && r.target.closest(`[${ATRIBUTO_CHAT}]`)) continue; // dentro do próprio chat
    for (const n of r.addedNodes) {
      if (!(n instanceof Element)) {
        fora = true;
        continue;
      }
      if (n.closest(`[${ATRIBUTO_CHAT}]`)) continue; // a peça do chat que entrou
      fora = true;
      if (!urgente && (n.matches(SELETOR_URGENTE) || n.querySelector(SELETOR_URGENTE))) urgente = true;
    }
    if (r.removedNodes.length) fora = true;
    if (urgente) break;
  }
  return { fora, urgente };
}

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
  document.querySelectorAll(SELETOR_LINK_CANDIDATO).forEach((a) => {
    if (a.closest(SELETOR_SEM_ANUNCIO_FIXO)) return; // o bloco marcado já é vigiado inteiro
    const linha = a.closest(SELETOR_LINHA);
    juntar(linha && linha.getBoundingClientRect().height <= ALTURA_MAX_LINHA ? linha : a);
  });
  return { els, excesso };
}

export interface OpcoesRegioes {
  /** px a mais de folga para liberar (ver `decidirOcupacao`) */
  histerese?: number;
  /** tempo livre antes de liberar (ms) */
  esperaMs?: number;
  /** rolando, a área cresce na direção de onde os blocos vêm (popup do computador) */
  antecipar?: boolean;
}

/**
 * Para cada área, true enquanto algum bloco com candidato a cruza. `ativo` = false: não vigia (devolve tudo false).
 * As áreas podem mudar a cada render (janela redimensionada, popup maior): a conferência usa sempre as atuais.
 * `opcoes` deve ser estável (constante fora do componente); `chave` e `aoOcupar` podem mudar à vontade.
 */
export function useRegioesOcupadas(
  regioes: readonly Retangulo[],
  ativo: boolean,
  opcoes: OpcoesRegioes = {},
  extra: { chave?: string; aoOcupar?: (i: number) => void } = {},
): { ocupadas: boolean[]; medido: boolean; conferirAgora: () => void } {
  const n = regioes.length;
  const histerese = Math.max(0, opcoes.histerese ?? 0);
  const esperaMs = Math.max(0, opcoes.esperaMs ?? ESPERA_LIVRE_MS);
  const antecipa = !!opcoes.antecipar;
  const [estado, setEstado] = useState<{ ocupadas: boolean[]; medido: boolean }>(() => ({ ocupadas: Array(n).fill(true), medido: false }));
  const atuais = useRef(regioes);
  atuais.current = regioes;
  const aoOcupar = useRef(extra.aoOcupar);
  aoOcupar.current = extra.aoOcupar;
  const conferirRef = useRef<() => void>(() => undefined);
  const varrerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!ativo || typeof window === 'undefined' || typeof document === 'undefined') return;
    const naTela = new Set<Element>();
    const observados = new Set<Element>();
    let excesso = false;
    let quadro = 0;
    let tVarrer = 0;
    let qVarrer = 0;
    let ultimaVarredura = 0;
    let tFimRolagem = 0;
    let ultimoY = window.scrollY;
    /** passo do último quadro de rolagem (px), quando foi e a velocidade (px/ms, média curta) */
    let dy = 0;
    let rolouEm = 0;
    let velocidade = 0;
    let ocupadas = atuais.current.map(() => true);
    let medido = false;
    const tLivre: number[] = [];
    /** quando cada área pode liberar (0 = sem espera em curso) */
    const prazo: number[] = [];
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entradas) => {
              for (const e of entradas) {
                if (e.isIntersecting) naTela.add(e.target);
                else naTela.delete(e.target);
              }
              conferir();
            },
            antecipa ? { rootMargin: `${Math.max(ANTECIPA_MAX_PX, ALCANCE_MAX_PX)}px 0px ${Math.max(ANTECIPA_MAX_PX, ALCANCE_MAX_PX)}px 0px` } : undefined,
          )
        : null;

    const publicar = () => setEstado({ ocupadas: ocupadas.slice(), medido });
    function conferir() {
      const rs = atuais.current;
      // sem IntersectionObserver (navegador muito antigo): confere todos
      const lista = io ? naTela : observados;
      const rects: DOMRect[] = [];
      if (!excesso) for (const el of lista) rects.push(el.getBoundingClientRect());
      const rolando = antecipa && performance.now() - rolouEm < ANTECIPA_JANELA_MS;
      const passo = rolando ? dy : 0;
      // para liberar rolando: o caminho à frente livre por ~0,7 s na velocidade atual
      const alcance = rolando ? alcanceReabrir(velocidade) : 0;
      let mudou = false;
      const ocupou: number[] = [];
      const parar = (i: number) => {
        if (tLivre[i]) window.clearTimeout(tLivre[i]);
        tLivre[i] = 0;
        prazo[i] = 0;
      };
      rs.forEach((r0, i) => {
        const r = passo ? anteciparArea(r0, passo) : r0;
        const perto = excesso || rects.some((b) => cruza(b, r));
        const folga = estender(histerese > 0 ? inflar(r, histerese) : r, passo, alcance);
        const naFolga = perto || ((histerese > 0 || alcance > 0) && rects.some((b) => cruza(b, folga)));
        const d = decidirOcupacao({ ocupada: ocupadas[i] ?? true, perto, naFolga, primeira: !medido });
        if (d === 'ocupa') {
          parar(i);
          if (!ocupadas[i]) {
            ocupadas[i] = true;
            mudou = true;
            ocupou.push(i);
          }
        } else if (d === 'livre') {
          parar(i);
          if (ocupadas[i]) {
            // 1ª medição: libera já (nada a evitar piscando ainda)
            ocupadas[i] = false;
            mudou = true;
          }
        } else if (prazo[i] && Date.now() >= prazo[i] - 16) {
          // a espera acabou e a área continua livre com folga (conferida agora, não só no início da espera)
          parar(i);
          ocupadas[i] = false;
          mudou = true;
        } else if (!prazo[i]) {
          prazo[i] = Date.now() + esperaMs;
          tLivre[i] = window.setTimeout(() => {
            tLivre[i] = 0;
            conferir();
          }, esperaMs);
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
      // na hora, dentro do quadro: quem vigia esconde a peça antes da pintura (o React redesenha depois)
      for (const i of ocupou) aoOcupar.current?.(i);
      if (mudou) publicar();
    }
    conferirRef.current = conferir;

    const varrer = () => {
      tVarrer = 0;
      ultimaVarredura = performance.now();
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
    varrerRef.current = varrer;
    // mudou o DOM (página nova que chegou, lista que cresceu): varre no quadro seguinte — antes de ele ser pintado —, no
    // máximo a cada INTERVALO_VARREDURA_MS
    const agendarVarredura = () => {
      if (tVarrer || qVarrer) return;
      const noQuadro = () => {
        tVarrer = 0;
        qVarrer = window.requestAnimationFrame(() => {
          qVarrer = 0;
          varrer();
        });
      };
      const falta = INTERVALO_VARREDURA_MS - (performance.now() - ultimaVarredura);
      if (falta <= 0) noQuadro();
      else tVarrer = window.setTimeout(noQuadro, falta);
    };
    /** já conferiu neste quadro (a rolagem dispara no máximo 1×/quadro; se vier mais, o resto vai para o rAF) */
    let conferiuNoQuadro = false;
    const aoRolar = () => {
      const y = window.scrollY;
      if (y !== ultimoY) {
        const agora = performance.now();
        dy = y - ultimoY;
        ultimoY = y;
        // velocidade: média curta (o passo de cada evento varia com o quadro); parada há mais de 200 ms, recomeça (o
        // 1º passo conta como um quadro)
        const dt = agora - rolouEm;
        const v = Math.abs(dy) / (dt > 200 ? 16 : Math.max(8, dt));
        velocidade = dt > 200 ? v : velocidade * 0.6 + v * 0.4;
        rolouEm = agora;
        // a rolagem parou: confere de novo sem a antecipação
        if (antecipa) {
          if (tFimRolagem) window.clearTimeout(tFimRolagem);
          tFimRolagem = window.setTimeout(() => {
            tFimRolagem = 0;
            conferir();
          }, ANTECIPA_JANELA_MS + 20);
        }
      }
      // confere NO evento de rolagem: ele vem antes dos callbacks de rAF e da pintura do quadro — a peça some antes de
      // qualquer coisa ser desenhada por cima do bloco que entrou
      if (!conferiuNoQuadro) {
        conferiuNoQuadro = true;
        conferir();
        if (!quadro)
          quadro = window.requestAnimationFrame(() => {
            quadro = 0;
            conferiuNoQuadro = false;
          });
      } else if (!quadro) {
        quadro = window.requestAnimationFrame(() => {
          quadro = 0;
          conferiuNoQuadro = false;
          conferir();
        });
      }
    };

    varrer();
    // o DOM mudou fora do chat: com candidato chegando, varre já (antes do quadro seguinte); senão, no próximo quadro
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((registros) => {
            const { fora, urgente } = lerMudancas(registros);
            if (!fora) return;
            if (!urgente) return agendarVarredura();
            if (tVarrer) window.clearTimeout(tVarrer);
            if (qVarrer) window.cancelAnimationFrame(qVarrer);
            qVarrer = 0;
            varrer();
          })
        : null;
    mo?.observe(document.body, { childList: true, subtree: true });
    // a página mudou de altura sem mexer no DOM (imagem que carregou, fonte, dado que chegou): os blocos andaram. O
    // aviso vem depois do layout e antes da pintura deste quadro: confere já (no próximo quadro seria tarde)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => conferir()) : null;
    ro?.observe(document.body);
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => {
      mo?.disconnect();
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener('scroll', aoRolar);
      if (quadro) window.cancelAnimationFrame(quadro);
      if (qVarrer) window.cancelAnimationFrame(qVarrer);
      if (tVarrer) window.clearTimeout(tVarrer);
      if (tFimRolagem) window.clearTimeout(tFimRolagem);
      for (const t of tLivre) if (t) window.clearTimeout(t);
      conferirRef.current = () => undefined;
      varrerRef.current = () => undefined;
    };
  }, [ativo, histerese, esperaMs, antecipa]);

  // as áreas mudaram (janela redimensionada, popup maior): confere de novo com os blocos que já estão na tela
  const chave = regioes.map((r) => `${r.top}|${r.left}|${r.right}|${r.bottom}`).join(';');
  useEffect(() => {
    conferirRef.current();
  }, [chave]);

  // trocou de página: varre de novo ANTES da 1ª pintura da página nova. Numa microtarefa: roda depois de todos os
  // efeitos de layout desta troca (o ScrollRestoration leva a página ao topo num deles), ainda antes de pintar
  const pagina = extra.chave;
  const primeiraPagina = useRef(true);
  useLayoutEffect(() => {
    if (primeiraPagina.current) {
      primeiraPagina.current = false;
      return;
    }
    queueMicrotask(() => varrerRef.current());
  }, [pagina]);

  const conferirAgora = useRef(() => conferirRef.current()).current;
  if (!ativo) return { ocupadas: regioes.map(() => false), medido: true, conferirAgora };
  return { ...estado, conferirAgora };
}
