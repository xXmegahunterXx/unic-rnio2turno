/**
 * 404 — "Sem sintonia por aqui": um dial fora de sintonia (onda que se perde em ruído) e atalhos úteis.
 */
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { ButtonLink } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';

const ATALHOS: { to: string; icone: IconName; titulo: string; texto: string }[] = [
  { to: '/apuracao', icone: 'ao-vivo', titulo: 'Apuração ao vivo', texto: 'Presidente, estado por estado' },
  { to: '/teste', icone: 'olho-fechado', titulo: 'Teste Cego', texto: 'Propostas sem nome nem partido' },
  { to: '/apuracao/consulta', icone: 'busca', titulo: 'Consulte sua seção', texto: 'O boletim da sua urna' },
  { to: '/governadores', icone: 'grade', titulo: 'Governadores', texto: 'As 7 disputas do 2º turno' },
];

const L = 100; // comprimento de onda da parte "sintonizada"

/** Parte limpa: senoide de x = −L até 340 (desliza uma volta inteira, sem emenda). */
function caminhoLimpo(): string {
  let d = '';
  for (let x = -L; x <= 340; x += 4) d += `${x === -L ? 'M' : 'L'}${x} ${(60 + Math.sin((2 * Math.PI * x) / L) * 20).toFixed(1)}`;
  return d;
}

/** Parte fora de sintonia: ruído que cresce para a direita. */
function caminhoRuido(): string {
  let d = '';
  for (let x = 300; x <= 600; x += 3) {
    const t = (x - 300) / 300;
    const h = Math.sin(x * 12.9898) * 43758.5453;
    const r = (h - Math.floor(h)) * 2 - 1;
    const y = 60 + (Math.sin((2 * Math.PI * x) / L) * 20 * (1 - t) + r * 34 * t);
    d += `${x === 300 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
  }
  return d;
}

export default function NotFoundPage() {
  useTitulo('Página não encontrada');
  const { pathname } = useLocation();
  const reduzir = useReducedMotion();
  const limpo = useMemo(caminhoLimpo, []);
  const ruido = useMemo(caminhoRuido, []);

  return (
    <Container className="relative py-10 sm:py-16 lg:py-24">
      <div className="mx-auto flex max-w-[44rem] flex-col items-center text-center">
        <div aria-hidden className="relative w-full max-w-[520px]">
          <div className="absolute left-1/2 top-1/2 h-40 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-3xl" />
          <p className="relative font-display text-[112px] font-semibold leading-none tracking-[-0.06em] text-grad sm:text-[168px]">404</p>
          <svg viewBox="0 0 600 120" className="relative -mt-4 h-[72px] w-full sm:-mt-6 sm:h-[96px]" preserveAspectRatio="none">
            <defs>
              <linearGradient id="nf-onda" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0">
                <stop offset="0" style={{ stopColor: 'rgb(var(--brand-2))' }} />
                <stop offset="0.55" style={{ stopColor: 'rgb(var(--brand))' }} />
                <stop offset="1" style={{ stopColor: 'rgb(var(--fg-subtle))', stopOpacity: 0.4 }} />
              </linearGradient>
            </defs>
            <defs>
              <clipPath id="nf-esq">
                <rect x="0" y="0" width="320" height="120" />
              </clipPath>
            </defs>
            <g clipPath="url(#nf-esq)">
              <motion.path
                d={limpo}
                fill="none"
                stroke="url(#nf-onda)"
                strokeWidth={2.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                animate={reduzir ? undefined : { x: [0, L] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
              />
            </g>
            <motion.path
              d={ruido}
              fill="none"
              stroke="url(#nf-onda)"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              animate={reduzir ? undefined : { scaleY: [1, 0.55, 1.15, 0.75, 1], opacity: [0.9, 0.6, 1, 0.7, 0.9] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            />
          </svg>
        </div>

        <h1 className="mt-6 text-balance font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[44px]">
          Sem sintonia por aqui
        </h1>
        <p className="mt-3 max-w-[32rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:text-[17px]">
          O endereço que você abriu não existe ou mudou de lugar. Que tal um destes caminhos?
        </p>
        {pathname && pathname !== '/' ? (
          <p className="mt-3 max-w-full truncate rounded-lg border border-line bg-surface-2/70 px-2.5 py-1 font-mono text-[12.5px] text-fg-muted">{pathname}</p>
        ) : null}

        <ul className="mt-8 grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-2 sm:gap-3">
          {ATALHOS.map((a) => (
            <li key={a.to}>
              <Link
                to={a.to}
                className="group flex h-full items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card transition-[transform,border-color] duration-200 hover:-translate-y-px hover:border-brand/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
                  <Icon name={a.icone} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-fg">{a.titulo}</span>
                  <span className="block truncate text-[13px] text-fg-muted">{a.texto}</span>
                </span>
                <Icon name="chevron-direita" size={18} className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row">
          <ButtonLink to="/" variant="primary" size="lg" icon="casa">
            Voltar ao início
          </ButtonLink>
          <ButtonLink to="/metodologia" variant="ghost" size="lg">
            Metodologia
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
