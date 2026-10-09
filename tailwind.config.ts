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
        line: v('line'),
        brand: { DEFAULT: v('brand'), 2: v('brand-2'), ink: v('brand-ink') },
        cand: {
          a: v('cand-a'), 'a-soft': v('cand-a-soft'), 'a-ink': v('cand-a-ink'),
          b: v('cand-b'), 'b-soft': v('cand-b-soft'), 'b-ink': v('cand-b-ink'),
          outros: v('cand-outros'),
        },
        ok: v('ok'),
        alert: v('alert'),
        pending: v('pending'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        card: '0 1px 0 0 rgb(var(--line) / 0.06) inset, 0 20px 40px -24px rgb(0 0 0 / 0.55)',
        glow: '0 0 0 1px rgb(var(--brand) / 0.35), 0 10px 40px -10px rgb(var(--brand) / 0.55)',
      },
      backgroundImage: {
        'brand-grad': 'linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand-2)) 100%)',
        noise: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E\")",
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
