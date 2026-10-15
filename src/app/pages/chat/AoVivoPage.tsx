/**
 * /ao-vivo — a Sala da apuração em tela cheia (chat ao vivo moderado). No celular a sala ocupa a tela entre o
 * cabeçalho e a tab bar; no desktop fica ao lado das regras e de como funciona a moderação. Sem placar aqui: a
 * página da apuração é o link do topo (e "Sala oferecida por" nunca fica colada a resultado).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AVISO_REGISTRO_CHAT, REGRAS_CHAT } from '@/shared/chat';
import { Container } from '@/app/components/layout/Container';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { Sala } from '@/app/components/chat/Sala';
import { useSala } from '@/app/components/chat/sala';

/** Tab bar do celular (60) + respiro (12): a sala termina acima dela. */
const RESERVA_PE_PX = 72;

/**
 * Celular: altura da sala = do topo dela (abaixo do cabeçalho, da faixa de anúncio do topo e do título — medidos, não
 * supostos) até a tab bar. No tablet/desktop vale o CSS.
 */
function useAlturaAteOPe(ref: React.RefObject<HTMLElement | null>): number | null {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const medir = () => {
      const el = ref.current;
      if (!el || window.innerWidth >= 768) return setH(null);
      const topo = el.getBoundingClientRect().top + window.scrollY;
      const tela = window.visualViewport?.height ?? window.innerHeight;
      setH(Math.max(380, Math.round(tela - topo - RESERVA_PE_PX)));
    };
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    // o que fica acima da sala (faixa do topo que chega depois, título) muda a posição dela
    if (ref.current?.parentElement?.parentElement) ro?.observe(ref.current.parentElement.parentElement);
    window.addEventListener('resize', medir);
    window.addEventListener('load', medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', medir);
      window.removeEventListener('load', medir);
    };
  }, [ref]);
  return h;
}

export default function AoVivoPage() {
  useTitulo('Chat ao vivo · Sala da apuração');
  const sala = useRef<HTMLDivElement>(null);
  const altura = useAlturaAteOPe(sala);
  // só lê o estado da sala (quem consulta é a própria <Sala>): com o registro de envios ligado, o texto muda
  const registro = !!useSala(null).pub?.registro;
  return (
    <Container className="pb-6 pt-3 sm:pb-12 sm:pt-8">
      {/* celular: cabeçalho de uma linha (a sala ocupa o resto da tela, até a tab bar) */}
      <div className="mb-3 flex items-end justify-between gap-3 sm:mb-6">
        <div className="min-w-0">
          <p className="hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted sm:block">Ao vivo · 25 de outubro</p>
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.025em] text-fg sm:mt-1.5 sm:text-[38px]">Chat ao vivo</h1>
          <p className="mt-1 hidden max-w-xl text-pretty text-[15px] leading-relaxed text-fg-muted sm:block">
            Comente a contagem dos votos com quem está acompanhando agora. Sala moderada, sem propaganda.
          </p>
        </div>
        <ButtonLink to="/apuracao" variant="outline" size="sm" iconRight="seta" className="shrink-0 sm:hidden">
          Apuração
        </ButtonLink>
        <ButtonLink to="/apuracao" variant="outline" size="md" iconRight="seta" className="hidden shrink-0 sm:inline-flex">
          Ver a apuração
        </ButtonLink>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div
          ref={sala}
          style={altura ? { height: `calc(${altura}px - env(safe-area-inset-bottom))` } : undefined}
          className="h-[calc(100dvh-var(--app-header-h,56px)-60px-env(safe-area-inset-bottom)-124px)] min-h-[380px] overflow-hidden rounded-3xl border border-line shadow-card md:h-[calc(100dvh-var(--app-header-h,64px)-200px)] md:min-h-[560px]"
        >
          <Sala variante="pagina" />
        </div>
        <aside className="space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-fg">
              <Icon name="info" size={17} className="text-brand-fg" />
              Regras da sala
            </h2>
            <ul className="mt-3 space-y-2.5 text-[13.5px] leading-snug text-fg-muted">
              {REGRAS_CHAT.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle" />
                  <span className="text-pretty">{r}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="font-display text-[16px] font-semibold text-fg">Como funciona</h2>
            <ul className="mt-3 space-y-2.5 text-[13.5px] leading-snug text-fg-muted">
              <li className="text-pretty">Modo lento: cada pessoa envia uma mensagem a cada alguns segundos, para todo mundo conseguir ler.</li>
              <li className="text-pretty">
                Viu algo errado? Toque em <span className="font-semibold text-fg">⋯</span> e denuncie. Com denúncias de pessoas diferentes, a mensagem sai até a
                moderação decidir.
              </li>
              <li className="text-pretty">As reações (🔥 😮 👏 👀) são só do momento: não têm relação com candidato e não são enquete.</li>
              <li className="text-pretty">
                Privacidade: o servidor guarda as últimas mensagens publicadas em memória, por até 12 horas.{' '}
                {registro ? AVISO_REGISTRO_CHAT : 'O seu IP não é guardado.'} Veja a{' '}
                <Link to="/privacidade" className="font-medium text-fg underline decoration-line underline-offset-2">
                  política de privacidade
                </Link>
                .
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </Container>
  );
}
