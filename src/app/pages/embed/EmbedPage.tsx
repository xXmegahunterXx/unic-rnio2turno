/**
 * /embed/:tipo — widgets para incorporar em sites e blogs (iframe), fora do AppShell: sem o cabeçalho do site.
 *  - tipos: 'placar' (?race=pres|gov-xx), 'mapa' (?race=pres), 'uf' (?uf=sp) — ver components/embed/codigo.ts;
 *  - tema: ?tema=auto|escuro|claro (o script do index.html já aplica antes da 1ª pintura; aqui seguimos o
 *    sistema no modo automático) — nunca grava a preferência do visitante;
 *  - atualiza sozinho (os hooks de dados fazem polling conforme a fase);
 *  - avisa a altura ao site que incorpora (`postMessage({ tipo: 'sintonia:altura', altura, widget })`).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { aplicarTema } from '@/app/lib/useTheme';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { lerOpcoesEmbed, MENSAGEM_ALTURA, tituloEmbed, type TemaEmbed } from '@/app/components/embed/codigo';
import { WidgetEmbed } from '@/app/components/embed/Widgets';

function useTemaEmbed(tema: TemaEmbed) {
  useLayoutEffect(() => {
    if (tema !== 'auto') {
      aplicarTema(tema === 'claro' ? 'light' : 'dark', false);
      return;
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const seguir = () => aplicarTema(mq?.matches ? 'light' : 'dark', false);
    seguir();
    mq?.addEventListener('change', seguir);
    return () => mq?.removeEventListener('change', seguir);
  }, [tema]);
}

/** Fundo transparente fora do cartão (o iframe herda o fundo do site nas bordas arredondadas). */
function useFundoTransparente() {
  useLayoutEffect(() => {
    const b = document.body;
    const h = document.documentElement;
    const antes = [b.style.background, h.style.background, b.style.minHeight];
    b.style.background = 'transparent';
    h.style.background = 'transparent';
    b.style.minHeight = '0';
    return () => {
      [b.style.background, h.style.background, b.style.minHeight] = antes;
    };
  }, []);
}

function useAvisarAltura(ref: React.RefObject<HTMLDivElement | null>, widget: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window) return;
    let ultima = 0;
    const avisar = () => {
      const altura = Math.ceil(el.getBoundingClientRect().height);
      if (altura === ultima || altura === 0) return;
      ultima = altura;
      try {
        window.parent.postMessage({ tipo: MENSAGEM_ALTURA, altura, widget }, '*');
      } catch {
        /* pai inacessível: ignora */
      }
    };
    avisar();
    const ro = new ResizeObserver(avisar);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, widget]);
}

export default function EmbedPage() {
  const { tipo } = useParams();
  const [params] = useSearchParams();
  const opcoes = lerOpcoesEmbed(tipo, params);
  const ref = useRef<HTMLDivElement>(null);
  useTitulo(tituloEmbed(opcoes));
  useTemaEmbed(opcoes.tema);
  useFundoTransparente();
  useAvisarAltura(ref, opcoes.tipo);
  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} className="w-full">
        <WidgetEmbed opcoes={opcoes} />
      </div>
    </MotionConfig>
  );
}
