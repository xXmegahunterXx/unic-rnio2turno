import type { Config } from 'tailwindcss';

/** Cores vêm de CSS vars (src/app/styles.css) para suportar tema escuro (padrão) e claro. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/app/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        // Linhas: o alfa base vem do tema (--line-alpha); `/50` etc. multiplicam esse alfa.
        // Assim `border-line`, `bg-line`, `divide-line` e `ring-line` saem sempre sutis (nunca branco/preto chapado).
        line: 'rgb(var(--line) / calc(var(--line-alpha) * <alpha-value>))',
        brand: { DEFAULT: v('brand'), 2: v('brand-2'), deep: v('brand-deep'), ink: v('brand-ink'), fg: v('brand-fg') },
        cand: {
          a: v('cand-a'), 'a-soft': v('cand-a-soft'), 'a-ink': v('cand-a-ink'), 'a-fg': v('cand-a-fg'),
          b: v('cand-b'), 'b-soft': v('cand-b-soft'), 'b-ink': v('cand-b-ink'), 'b-fg': v('cand-b-fg'),
          // Presidente (cores de identificação, ver CORES_IDENTIDADE em src/shared/constants.ts)
          vermelho: v('cand-vermelho'), 'vermelho-soft': v('cand-vermelho-soft'), 'vermelho-ink': v('cand-vermelho-ink'), 'vermelho-fg': v('cand-vermelho-fg'),
          azul: v('cand-azul'), 'azul-soft': v('cand-azul-soft'), 'azul-ink': v('cand-azul-ink'), 'azul-fg': v('cand-azul-fg'),
          outros: v('cand-outros'),
        },
        ok: { DEFAULT: v('ok'), fg: v('ok-fg') },
        alert: { DEFAULT: v('alert'), fg: v('alert-fg') },
        pending: v('pending'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        // Sombra dos cartões: forte no escuro, suave no claro (--shadow-alpha por tema).
        card: '0 1px 0 0 rgb(var(--line) / 0.06) inset, 0 20px 40px -24px rgb(0 0 0 / var(--shadow-alpha, 0.55)), 0 1px 2px 0 rgb(0 0 0 / calc(var(--shadow-alpha, 0.55) * 0.25))',
        glow: '0 0 0 1px rgb(var(--brand) / 0.35), 0 10px 40px -10px rgb(var(--brand) / 0.55)',
      },
      backgroundImage: {
        // Decorativo (barras de progresso, realces): violeta → lilás. NÃO use sob texto.
        'brand-grad': 'linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand-2)) 100%)',
        // Botões/CTAs com texto branco: violeta → púrpura, contraste ≥ 4,5:1 em todo o gradiente.
        'brand-cta': 'linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand-deep)) 100%)',
        // parênteses do url(#n) interno codificados (%28/%29): o html-to-image (imagens de compartilhar) lia o url(%23n) de
        // dentro do data URI como recurso externo e pedia "/%23n" ao servidor (404 no console). O SVG decodificado é idêntico.
        noise: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url%28%23n%29' opacity='.035'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        'pulse-dot': { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '.45', transform: 'scale(.82)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        'fade-up': 'fade-up .5s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
