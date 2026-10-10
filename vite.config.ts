/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Pré-carregamento da página de entrada no index.html (só no build; os nomes dos arquivos têm hash): um script mínimo
 * que, conforme a rota aberta (/ ou /teste — as portas de entrada vindas do X), pede o chunk da página e as
 * dependências dele em paralelo com o JS principal (`modulepreload`), em vez de esperar o router descobrir o import
 * dinâmico. No build demo a rota vem do hash (#/teste).
 *
 * Medido (Playwright + CDP, 390×844, CPU 4×, 150 ms / 1,6 Mbps): conteúdo útil da Home 2,90 s → 2,43 s. Pré-carregar
 * as fontes (Inter + Bricolage) PIOROU para 2,77 s (disputam a banda com o JS, que é o caminho crítico de uma SPA);
 * por isso as fontes seguem com `font-display: swap`, descobertas pelo CSS.
 */
function preCarregamentoCritico(demo: boolean): Plugin {
  let base = '/';
  const ROTAS: Record<string, string> = { '/': 'src/app/pages/Home.tsx', '/teste': 'src/app/pages/teste/TestePage.tsx' };
  return {
    name: 'sintonia-precarregamento-critico',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const url = (f: string) => `${base}${f}`;
        const tags: { tag: string; children: string; injectTo: 'head' }[] = [];
        const entradas = new Set(Object.values(bundle).filter((c) => c.type === 'chunk' && c.isEntry).map((c) => c.fileName));
        const mapa: Record<string, string[]> = {};
        for (const [rota, modulo] of Object.entries(ROTAS)) {
          const chunk = Object.values(bundle).find(
            (c) => c.type === 'chunk' && c.isDynamicEntry && c.moduleIds.some((m) => m.replace(/\\/g, '/').endsWith(modulo)),
          );
          if (!chunk || chunk.type !== 'chunk') continue;
          const lista: string[] = [];
          const visitar = (nome: string) => {
            if (entradas.has(nome) || lista.includes(nome)) return;
            const c = bundle[nome];
            if (!c || c.type !== 'chunk') return;
            lista.push(nome);
            c.imports.forEach(visitar);
          };
          visitar(chunk.fileName);
          mapa[rota] = lista.map(url);
        }
        if (Object.keys(mapa).length) {
          const rotaAtual = demo
            ? "var h=location.hash;var p=(h.charAt(1)==='/'?h.slice(1):'/')"
            : 'var p=location.pathname';
          tags.push({
            tag: 'script',
            children:
              `(function(){var r=${JSON.stringify(mapa)};${rotaAtual};p=p.split(/[?#]/)[0].replace(/\\/+$/,'')||'/';` +
              `var l=r[p];if(!l)return;for(var i=0;i<l.length;i++){var e=document.createElement('link');` +
              `e.rel='modulepreload';e.crossOrigin='';e.href=l[i];document.head.appendChild(e);}})();`,
            injectTo: 'head',
          });
        }
        return tags;
      },
    },
  };
}

// Modos:
//  - padrão (dev/prod): SPA com BrowserRouter, dados via API HTTP do servidor Hono (src/server).
//  - "demo": build 100% estático (dist-demo/) com HashRouter, caminhos relativos e o motor de
//    simulação rodando no navegador (Web Worker). Usado para o preview publicado como Artifact.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: demo ? './' : '/',
    plugins: [react(), preCarregamentoCritico(demo)],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: { __DEMO__: JSON.stringify(demo) },
    worker: { format: 'es' },
    server: {
      port: 5173,
      host: true,
      proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
    },
    preview: { port: 4173, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } } },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      emptyOutDir: true,
      sourcemap: !demo,
      chunkSizeWarningLimit: 900,
    },
    test: {
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
    },
  };
});
