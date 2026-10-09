/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Modos:
//  - padrão (dev/prod): SPA com BrowserRouter, dados via API HTTP do servidor Hono (src/server).
//  - "demo": build 100% estático (dist-demo/) com HashRouter, caminhos relativos e o motor de
//    simulação rodando no navegador (Web Worker). Usado para o preview publicado como Artifact.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: demo ? './' : '/',
    plugins: [react()],
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
