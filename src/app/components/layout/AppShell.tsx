/**
 * Moldura pública do app: header de vidro fixo (logo, navegação, status ao vivo, tema), faixa de
 * SIMULAÇÃO, banner de aviso do admin, rodapé institucional e tab bar inferior no celular.
 * Funciona sem API: se useStatus() falhar ou estiver carregando, nada quebra (só some o que depende dele).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import { NAV, NAV_TAB } from './nav';
import { StatusPill } from './StatusPill';
import { BotaoBusca, BuscaRapida, abrirBusca, preCarregarBusca } from '../busca/BuscaRapida';

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
    <div className="relative flex min-h-dvh flex-col bg-bg">
      <FundoNoite />
      <Header />
      <main id="conteudo" className="relative flex-1">
        {children ?? <Outlet />}
      </main>
      <Footer />
      <TabBar />
      <BuscaRapida />
      <Toaster />
      <ScrollRestoration />
    </div>
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
  const { pathname } = useLocation();
  const simulacao = status.data?.simulacao === true;
  const [rolou, setRolou] = useState(false);

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
        className="sr-only z-[100] rounded-lg bg-fg px-3 py-2 text-sm font-medium text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <div ref={ref} className="sticky top-0 z-50">
        <header
          className={cn(
            'glass border-b transition-[border-color,box-shadow] duration-200',
            rolou ? 'border-line shadow-[0_10px_30px_-20px_rgb(0_0_0/0.6)]' : 'border-transparent',
          )}
        >
          <Container wide className="flex h-14 items-center gap-3 md:h-16">
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
                    aria-current={ativo ? 'page' : undefined}
                    className={cn(
                      'relative whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[14px] font-medium transition-colors lg:px-3',
                      ativo ? 'text-fg' : 'text-fg-muted hover:text-fg',
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
                    {/* Entre 768 e 1023 px, rótulos curtos (os mesmos da tab bar) para caber com a pílula de status. */}
                    <span className="lg:hidden">{n.short}</span>
                    <span className="hidden lg:inline">{n.label}</span>
                  </Link>
                );
              })}
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
        {simulacao && comNumeros(pathname) ? <SimulationRibbon /> : null}
      </div>
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
                className="-m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"
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
  const meio = Math.ceil(NAV_TAB.length / 2);
  const item = (n: (typeof NAV_TAB)[number]) => {
    const ativo = n.match(pathname);
    return (
      <li key={n.to} className="relative">
        <Link
          to={n.to}
          aria-current={ativo ? 'page' : undefined}
          className={cn(
            'flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-[0.01em] transition-colors',
            ativo ? 'text-fg' : 'text-fg-muted active:text-fg',
          )}
        >
          {ativo ? (
            <motion.span
              layoutId="tab-ativa"
              aria-hidden
              className="absolute top-0 h-[2.5px] w-8 rounded-b-full bg-brand-grad"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          ) : null}
          <Icon name={n.icon} size={22} className={cn(ativo && 'text-brand-fg')} />
          <span>{n.short}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/[0.97] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
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
      </ul>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="relative mt-12 border-t border-line bg-surface/40 pb-[calc(84px+env(safe-area-inset-bottom))] pt-10 md:mt-20 md:pb-12">
      <Container wide>
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Logo size={26} />
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">
              Apuração do 2º turno de 2026 estado por estado, cidade por cidade, seção por seção. E o Teste Cego de
              propostas.
            </p>
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-[12.5px] leading-snug text-fg-muted">
              <Icon name="info" size={16} className="mt-px shrink-0 text-brand-fg" />
              <span>
                Projeto independente e <strong className="font-semibold text-fg">apartidário</strong>: sem vínculo com
                candidatos, partidos ou campanhas. Não fazemos enquetes. Cores dos candidatos seguem a ordem do número na
                urna.
              </span>
            </p>
          </div>
          <FooterCol
            titulo="Navegar"
            links={[
              { to: '/apuracao', label: 'Apuração' },
              { to: '/governadores', label: 'Governadores' },
              { to: '/senado', label: 'Senado' },
              { to: '/camara', label: 'Câmara dos Deputados' },
              { to: '/assembleias', label: 'Assembleias' },
              { to: '/teste', label: 'Teste Cego' },
              { to: '/apuracao/consulta', label: 'Consulte sua seção' },
            ]}
          />
          <FooterCol
            titulo="Sobre"
            links={[
              { to: '/metodologia', label: 'Metodologia' },
              { to: '/privacidade', label: 'Privacidade' },
              { to: '/sobre', label: 'Sobre o Sintonia' },
            ]}
          />
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Fontes</h2>
            <ul className="mt-3 space-y-2.5 text-[14px]">
              <li>
                <a
                  href="https://resultados.tse.jus.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-fg transition-colors hover:text-brand-fg"
                >
                  TSE · Resultados
                  <Icon name="externo" size={14} className="text-fg-muted" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-fg transition-colors hover:text-brand-fg"
                >
                  IBGE · Malhas territoriais
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

function FooterCol({ titulo, links }: { titulo: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{titulo}</h2>
      <ul className="mt-3 space-y-2.5 text-[14px]">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-fg transition-colors hover:text-brand-fg">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
