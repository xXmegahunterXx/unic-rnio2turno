/**
 * Moldura pública do app: header de vidro fixo (logo, navegação + menu "Mais", status ao vivo, tema), faixa de
 * SIMULAÇÃO, faixa "Conexão instável" (I05, FaixaConexao), banner de aviso do admin, rodapé institucional e tab bar
 * inferior no celular (com a aba "Mais").
 * Funciona sem API: se useStatus() falhar ou estiver carregando, nada quebra (só some o que depende dele).
 * Os links pré-carregam a página ao apontar/tocar (prefetch.ts). "Compartilhar o Sintonia" e "Incorporar" ficam
 * montados aqui (acoesGlobais.tsx), carregados só na 1ª abertura.
 *
 * Anúncios (src/app/components/anuncios): o provedor escolhe quem aparece em cada posição da página; a faixa do topo
 * fica logo abaixo do cabeçalho (no desktop, dentro dele) e a barra do rodapé, no celular, acima da tab bar.
 */
import { REGRA_CORES_CURTA } from '@/shared/cores';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { ThemeToggle } from '@/app/ui/ThemeToggle';
import { Toaster } from '@/app/ui/Toast';
import type { Aviso } from '@/shared/types';
import { SimulationRibbon } from '../apuracao/SimulationRibbon';
import { Container } from './Container';
import { Logo } from './Logo';
import { NAV, NAV_TAB, ativoNoMais } from './nav';
import { StatusPill } from './StatusPill';
import { FaixaConexao } from './FaixaConexao';
import { BotaoBusca, BuscaRapida, abrirBusca, preCarregarBusca } from '../busca/BuscaRapida';
import { AcoesGlobais, abrirCompartilharSite, abrirIncorporar, preCarregarCompartilharSite, preCarregarIncorporar } from './acoesGlobais';
import { BotaoMaisDesktop, FolhaMaisPreguicosa, preCarregarMenuMais, usePreCarregarMenuMais } from './BotaoMais';
import { propsPreCarregar } from './prefetch';
// direto dos módulos (não do index de anúncios): o JS inicial leva só o provedor, a decisão da faixa e as regras puras
import { ProvedorAnuncios } from '../anuncios/contexto';
import { FaixaTopo } from '../anuncios/FaixaTopo';
import { rodapePermitido } from '../anuncios/nucleo';
import { useIsDesktop } from '@/app/lib/useMediaQuery';
import { instalarBarrasMoveis, mostrarTabBar } from '@/app/lib/barrasMoveis';

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
    <ProvedorAnuncios>
    <div className="relative flex min-h-dvh flex-col bg-bg">
      <FundoNoite />
      <Header />
      {/* --sala-lateral: largura do chat ao vivo quando ele está aberto ao lado da página (desktop; chat/SalaDaApuracao) */}
      <main id="conteudo" tabIndex={-1} className="relative flex-1 pr-[var(--sala-lateral,0px)] outline-none">
        {children ?? <Outlet />}
      </main>
      <Footer />
      <RodapeAnuncio />
      <SalaChatApuracao />
      <TabBar />
      <BarrasMoveis />
      <BuscaRapida />
      <AcoesGlobais />
      <Toaster />
      <ScrollRestoration />
    </div>
    </ProvedorAnuncios>
    </MotionConfig>
  );
}

/**
 * Só no build demo (preview estático): atalho para o painel de simulação, já que no preview não dá para digitar
 * /admin na barra de endereço. Fica no header (ícone no celular, rótulo curto no desktop) para nunca cobrir
 * conteúdo; some dentro da pré-visualização do próprio admin (iframe).
 */
function AtalhoPainelDemo() {
  // Esconde só dentro da "Visão do eleitor" do próprio admin (iframe de MESMA origem com o admin aberto).
  // O preview publicado também roda num iframe, mas de outra origem: lá o acesso ao pai lança e o atalho aparece.
  if (dentroDoPainel()) return null;
  return (
    <Link
      to="/admin"
      aria-label="Painel de simulação"
      title="Painel de simulação"
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 text-[13px] font-semibold text-fg transition-colors hover:bg-brand/20 max-[379px]:w-9 max-[379px]:px-0 max-[339px]:hidden sm:px-3.5 md:max-lg:w-9 md:max-lg:px-0"
    >
      <Icon name="ajustes" size={16} />
      {/* Entre 768 e 1023 px a navegação ocupa o header: só o ícone (o nome segue no aria-label). */}
      <span className="max-[379px]:hidden md:max-lg:hidden">Painel</span>
    </Link>
  );
}

function dentroDoPainel(): boolean {
  if (typeof window === 'undefined' || window.self === window.top) return false;
  try {
    return window.parent.location.hash.startsWith('#/admin') || window.parent.location.pathname.startsWith('/admin');
  } catch {
    return false;
  }
}

/**
 * Barra de anúncio do celular (fora do Teste Cego e do Duelo — `rodapePermitido`). Chunk próprio: ela só aparece depois
 * da 1ª rolagem e nunca sobre resultado/candidato (blocos com `data-sem-anuncio-fixo`; anuncios/faixaLivre.ts), então
 * não precisa pesar no JS inicial.
 */
const BarraRodape = lazy(() => import('../anuncios/BarraRodape').then((m) => ({ default: m.BarraRodape })));
function RodapeAnuncio() {
  const { pathname } = useLocation();
  const celular = !useIsDesktop();
  if (!celular || !rodapePermitido(pathname)) return null;
  return (
    <Suspense fallback={null}>
      <BarraRodape />
    </Suspense>
  );
}

/** Chat ao vivo moderado nas páginas da apuração (/apuracao e /apuracao/:uf): chunk próprio, carregado só nelas. */
const SalaDaApuracao = lazy(() => import('../chat/SalaDaApuracao'));
const SigaSintonia = lazy(() => import('../crescimento/SigaSintonia').then((m) => ({ default: m.SigaSintonia })));
function SalaChatApuracao() {
  const { pathname } = useLocation();
  if (!/^\/apuracao(\/[a-z]{2})?\/?$/i.test(pathname)) return null;
  return (
    <Suspense fallback={null}>
      <SalaDaApuracao />
    </Suspense>
  );
}

/**
 * Celular: a tab bar sai da frente ao rolar para baixo e volta ao rolar para cima; as barras do pé saem com o teclado
 * aberto (src/app/lib/barrasMoveis.ts). Toda troca de página traz a tab bar de volta.
 */
function BarrasMoveis() {
  const { pathname } = useLocation();
  useEffect(() => instalarBarrasMoveis(), []);
  useEffect(() => mostrarTabBar(), [pathname]);
  return null;
}

/** Rotas que exibem números da apuração (e, portanto, a faixa de SIMULAÇÃO quando for o caso). */
const comNumeros = (pathname: string) =>
  pathname === '/' || pathname.startsWith('/apuracao') || pathname.startsWith('/governadores');

/** Ruído sutil + brilho violeta no topo (só decoração). */
function FundoNoite() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[560px] overflow-hidden">
      <div className="absolute inset-0 bg-noise [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="absolute left-1/2 top-[-300px] h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-[90px] dark:bg-brand/[0.14]" />
    </div>
  );
}

function Header() {
  const ref = useRef<HTMLDivElement>(null);
  const status = useStatus();
  const { pathname, search } = useLocation();
  const simulacao = status.data?.simulacao === true;
  // Página do 1º turno (?race=…-t1) durante a simulação: os números da página são OFICIAIS (a simulação é do 2º turno)
  const paginaT1 = /[?&]race=[a-z-]*-t1(?:&|$)/.test(search);
  const [rolou, setRolou] = useState(false);
  // Faixa de anúncio do topo: logo abaixo do cabeçalho, FORA do bloco fixo, em todas as larguras — rola com a página.
  // Presa ao cabeçalho, ela passava colada aos percentuais e às fotos dos candidatos ao rolar (ARCHITECTURE §1.5).

  // Expõe a altura do header para elementos "sticky" (ex.: cabeçalho de DataTable).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setRolou(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <a
        href="#conteudo"
        // Foca o <main> direto: no build demo (HashRouter) o "#conteudo" viraria uma rota inexistente.
        onClick={(e) => {
          const alvo = document.getElementById('conteudo');
          if (!alvo) return;
          e.preventDefault();
          alvo.focus({ preventScroll: false });
          alvo.scrollIntoView({ block: 'start' });
        }}
        className="sr-only z-[100] rounded-lg bg-fg px-3 py-2 text-sm font-medium text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <div ref={ref} className="sticky top-0 z-50">
        <header
          className={cn(
            // pt: área segura do topo quando o site roda instalado na tela inicial (no navegador ela é 0)
            'glass border-b pt-[env(safe-area-inset-top)] transition-[border-color,box-shadow] duration-200',
            rolou ? 'border-line shadow-[0_10px_30px_-20px_rgb(0_0_0/0.6)]' : 'border-transparent',
          )}
        >
          <Container wide className="flex h-14 items-center gap-2 sm:gap-3 md:h-16">
            <Link to="/" aria-label="Sintonia — página inicial" className="-ml-1 rounded-xl px-1 py-1">
              <Logo size={28} />
            </Link>
            <nav aria-label="Principal" className="ml-1 hidden items-center gap-0.5 md:flex lg:ml-4">
              {NAV.map((n) => {
                const ativo = n.match(pathname);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    {...propsPreCarregar(n.to)}
                    aria-current={ativo ? 'page' : undefined}
                    className={cn(
                      'relative whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[14px] font-medium transition-colors lg:px-3',
                      ativo ? 'text-fg' : 'text-fg-muted hover:text-fg',
                      n.header === 'xxl' && 'hidden min-[1400px]:block',
                      n.header === 'xl' && 'hidden xl:block',
                      n.header === 'lg' && 'hidden lg:block',
                    )}
                  >
                    {ativo ? (
                      <motion.span
                        layoutId="nav-ativo"
                        className="absolute inset-0 -z-10 rounded-[10px] bg-surface-3/80"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    ) : null}
                    {/* Entre 768 e 1279 px, rótulos curtos (os mesmos da tab bar) para caber com a pílula de status e o "Mais". */}
                    <span className="xl:hidden">{n.short}</span>
                    <span className="hidden xl:inline">{n.label}</span>
                  </Link>
                );
              })}
              <BotaoMaisDesktop />
            </nav>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {/* Busca rápida (Ctrl/⌘ K): botão com o atalho a partir de 1360 px; só a lupa entre 768 e 1359 px.
                  No celular a busca fica na tab bar (o header não tem espaço). */}
              <BotaoBusca className="hidden min-[1360px]:inline-flex" />
              <BotaoBusca compacto className="hidden md:inline-flex min-[1360px]:hidden" />
              {/* Pílula completa só a partir de 1024 px: entre 768 e 1023 a navegação do header já ocupa a linha. */}
              <StatusPill className="hidden lg:inline-flex" />
              <StatusPill compact className="lg:hidden" />
              {__DEMO__ ? <AtalhoPainelDemo /> : null}
              <ThemeToggle size="sm" />
            </div>
          </Container>
        </header>
        {simulacao && comNumeros(pathname) ? (
          <SimulationRibbon
            titulo={paginaT1 ? '1º turno oficial · simulação só no 2º' : undefined}
            detalhe={
              paginaT1
                ? `os números desta página são o resultado oficial do TSE${status.data?.anonimizado ? ', com os nomes ocultos durante a simulação' : ''}.`
                : undefined
            }
          />
        ) : null}
        {/* I05: "Conexão instável" (status falhando ou relógio do servidor parado), presa sob o cabeçalho em toda página */}
        <FaixaConexao />
      </div>
      <FaixaTopo />
      <AvisoBanner aviso={status.data?.aviso ?? null} />
    </>
  );
}

/** Aviso do admin (ex.: "TSE com instabilidade"). Pode ser dispensado; volta se o texto mudar. */
function AvisoBanner({ aviso }: { aviso: Aviso | null }) {
  const [dispensado, setDispensado] = useState<string | null>(null);
  const visivel = aviso && aviso.texto && dispensado !== aviso.texto;
  return (
    <AnimatePresence initial={false}>
      {visivel ? (
        <motion.div
          key={aviso.texto}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="relative z-10 overflow-hidden"
        >
          <Container wide className="pt-3">
            <div
              role={aviso.nivel === 'alerta' ? 'alert' : 'status'}
              className={cn(
                'flex items-start gap-3 rounded-2xl border px-4 py-3 text-[14px] leading-snug',
                aviso.nivel === 'alerta'
                  ? 'border-alert/35 bg-alert/10 text-fg'
                  : 'border-brand/30 bg-brand/10 text-fg',
              )}
            >
              <Icon
                name={aviso.nivel === 'alerta' ? 'alerta' : 'info'}
                size={18}
                className={cn('mt-px', aviso.nivel === 'alerta' ? 'text-alert-fg' : 'text-brand-fg')}
              />
              <p className="min-w-0 flex-1 text-pretty">{aviso.texto}</p>
              <button
                type="button"
                onClick={() => setDispensado(aviso.texto)}
                aria-label="Dispensar aviso"
                className="toque relative -m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"
              >
                <Icon name="fechar" size={15} />
              </button>
            </div>
          </Container>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  const [mais, setMais] = useState(false);
  usePreCarregarMenuMais();
  const meio = Math.ceil(NAV_TAB.length / 2);
  const classeItem = (ativo: boolean) =>
    cn(
      'relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-[0.01em] transition-colors',
      ativo ? 'text-fg' : 'text-fg-muted active:text-fg',
    );
  const marca = (
    <motion.span
      layoutId="tab-ativa"
      aria-hidden
      className="absolute top-0 h-[2.5px] w-8 rounded-b-full bg-brand-grad"
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
    />
  );
  const item = (n: (typeof NAV_TAB)[number]) => {
    const ativo = n.match(pathname);
    return (
      <li key={n.to} className="relative">
        <Link to={n.to} {...propsPreCarregar(n.to)} aria-current={ativo ? 'page' : undefined} className={classeItem(ativo)}>
          {ativo ? marca : null}
          <Icon name={n.icon} size={22} className={cn(ativo && 'text-brand-fg')} />
          <span>{n.short}</span>
        </Link>
      </li>
    );
  };
  const maisAtivo = ativoNoMais(pathname);
  return (
    <>
      {/* Sem backdrop-blur: com o fundo 97% opaco ele não aparece, mas custava um recálculo a cada quadro de rolagem
          (pesado em Android de entrada e no navegador embutido do app do X). */}
      <nav
        aria-label="Principal"
        className="barra-tab fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/[0.97] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid h-[60px] max-w-md grid-cols-5">
          {NAV_TAB.slice(0, meio).map(item)}
          <li className="relative">
            <button
              type="button"
              onClick={abrirBusca}
              onPointerDown={preCarregarBusca}
              aria-label="Buscar município, estado, candidato ou seção"
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-[0.01em] text-fg-muted transition-colors active:text-fg"
            >
              <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand/15 text-brand-fg ring-1 ring-inset ring-brand/30">
                <Icon name="busca" size={18} />
              </span>
              <span className="-mt-0.5">Buscar</span>
            </button>
          </li>
          {NAV_TAB.slice(meio).map(item)}
          <li className="relative">
            <button
              type="button"
              onClick={() => setMais(true)}
              onPointerDown={preCarregarMenuMais}
              aria-haspopup="dialog"
              aria-expanded={mais}
              className={classeItem(maisAtivo || mais)}
            >
              {maisAtivo ? marca : null}
              <Icon name="menu" size={22} className={cn(maisAtivo && 'text-brand-fg')} />
              <span>Mais</span>
            </button>
          </li>
        </ul>
      </nav>
      <FolhaMaisPreguicosa aberto={mais} onFechar={() => setMais(false)} />
    </>
  );
}

function Footer() {
  return (
    // No celular: espaço da tab bar + o da barra de anúncio, quando ela existe (--anuncio-rodape-h, BarraRodape).
    <footer className="relative mt-12 border-t border-line bg-surface/40 pb-[calc(84px+var(--anuncio-rodape-h,0px)+env(safe-area-inset-bottom))] pr-[var(--sala-lateral,0px)] pt-10 md:mt-20 md:pb-12">
      <Container wide>
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] lg:gap-10">
          <div className="col-span-2 max-w-sm md:col-span-4 lg:col-span-1">
            <Logo size={26} />
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
              Apuração do 2º turno de 2026 estado por estado, cidade por cidade, seção por seção. E o Teste Cego: ideias
              antes de nomes.
            </p>
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-[12.5px] leading-snug text-fg-muted">
              <Icon name="info" size={16} className="mt-px shrink-0 text-brand-fg" />
              <span>
                Projeto independente e <strong className="font-semibold text-fg">apartidário</strong>: sem vínculo com
                candidatos, partidos ou campanhas. Não fazemos enquetes. {REGRA_CORES_CURTA}
              </span>
            </p>
            {/* "Siga o Sintonia" (redes do painel; sem nenhuma, nada aparece): chunk próprio, fora do JS inicial */}
            <Suspense fallback={null}>
              <SigaSintonia variante="rodape" className="mt-5" />
            </Suspense>
          </div>
          <FooterCol
            titulo="2º turno"
            links={[
              { to: '/apuracao', label: 'Apuração' },
              { to: '/governadores', label: 'Governadores' },
              { to: '/apuracao/consulta', label: 'Consulte sua seção' },
              { to: '/teste', label: 'Teste Cego' },
              { to: '/cenarios', label: 'E se…? Monte seu cenário' },
              { to: '/palpite', label: 'Palpite do 2º turno' },
            ]}
          />
          <FooterCol
            titulo="1º turno"
            links={[
              { to: '/curiosidades', label: 'Curiosidades' },
              { to: '/apuracao?race=pres-t1', label: 'Presidente' },
              { to: '/senado', label: 'Senado' },
              { to: '/camara', label: 'Câmara dos Deputados' },
              { to: '/assembleias', label: 'Assembleias' },
            ]}
          />
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Leve o Sintonia</h2>
            <ul className={LISTA_RODAPE}>
              <li>
                <button type="button" onClick={abrirCompartilharSite} onPointerEnter={preCarregarCompartilharSite} aria-haspopup="dialog" className={cn(LINK_RODAPE, 'text-left')}>
                  Compartilhar o site
                </button>
              </li>
              <li>
                <button type="button" onClick={() => abrirIncorporar()} onPointerEnter={preCarregarIncorporar} aria-haspopup="dialog" className={cn(LINK_RODAPE, 'text-left')}>
                  Incorporar no seu site
                </button>
              </li>
              <li>
                <Link to="/tv" className={LINK_RODAPE}>
                  Modo TV
                </Link>
              </li>
              <li>
                <Link to="/streamers" className={LINK_RODAPE}>
                  Para streamers
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Sobre</h2>
            <ul className={LISTA_RODAPE}>
              {[
                { to: '/metodologia', label: 'Metodologia' },
                { to: '/privacidade', label: 'Privacidade' },
                { to: '/sobre', label: 'Sobre o Sintonia' },
                { to: '/anuncie', label: 'Anuncie no Sintonia' },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={LINK_RODAPE}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="https://resultados.tse.jus.br" target="_blank" rel="noopener noreferrer" className={cn(LINK_RODAPE, 'gap-1.5')}>
                  Fonte: TSE
                  <Icon name="externo" size={14} className="text-fg-muted" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(LINK_RODAPE, 'gap-1.5')}
                >
                  Mapas: IBGE
                  <Icon name="externo" size={14} className="text-fg-muted" />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-[12.5px] text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Sintonia. Não é um site oficial da Justiça Eleitoral.</span>
          <span>Horários em Brasília (UTC−3).</span>
        </div>
      </Container>
    </footer>
  );
}

/**
 * Rodapé: no toque (celular e tablet) cada link tem 44 px de altura (a lista perde o espaçamento entre itens, então o
 * passo visual quase não muda); com mouse, a partir de 768 px, volta ao desenho compacto.
 */
const LISTA_RODAPE = 'mt-1 text-[14.5px] md:mt-3 md:text-[14px] md:[@media(pointer:fine)]:space-y-2.5';
const LINK_RODAPE = 'flex w-fit min-h-[44px] items-center text-fg transition-colors hover:text-brand-fg md:[@media(pointer:fine)]:min-h-0';

function FooterCol({ titulo, links }: { titulo: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{titulo}</h2>
      <ul className={LISTA_RODAPE}>
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} {...propsPreCarregar(l.to)} className={LINK_RODAPE}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
