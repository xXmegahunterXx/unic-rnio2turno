/**
 * QA visual e de desempenho de public/geo/br-mun.json (Playwright + Chromium).
 *
 * Gera, em preview-out/geo-br-mun/ (ou na pasta passada como argumento):
 *  - br-mun-svg.png      os 5.571 municípios em SVG (paleta de QA) com as divisas estaduais por cima;
 *  - br-mun-canvas.png   o mesmo desenhado em <canvas> com Path2D (o caminho do app);
 *  - alinhamento.png     contornos das UFs do br.json (magenta, largo) × do br-mun.json (ciano, fino);
 *  - zoom-*.png          recortes ampliados (alinhamento, divisas, menores municípios, encarte de Noronha).
 * E mede no navegador:
 *  - tempos de fetch+JSON.parse, criação dos Path2D e desenho (fill por município + divisas), em DPR 1 e 2,
 *    sem e com CPU 4× mais lenta (emulação de celular intermediário);
 *  - frestas: contorno das UFs em branco e municípios em preto por cima, em 3×: pixel quase branco dentro do
 *    contorno = buraco entre vizinhos (o serrilhado das bordas compartilhadas fica cinza e não conta);
 *  - sobra: municípios em branco e contornos das UFs em preto por cima: pixel branco = município fora da UF;
 *  - alinhamento em pixels (1×): br.json preenchido × br-mun.json preenchido, pixels com cobertura diferente.
 *
 * Uso: npx tsx scripts/data/geo-lib/preview-br-mun.ts [pastaSaida] [--geo=outro/br-mun.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GeoBrasil, GeoBrasilMunicipios } from '../../../src/shared/dataset';
import { lerPath } from './lerpath';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const ARGS = process.argv.slice(2);
const SAIDA = resolve(ARGS.find((a) => !a.startsWith('--')) ?? join(RAIZ, 'preview-out', 'geo-br-mun'));
const ARG_GEO = ARGS.find((a) => a.startsWith('--geo='));
const TXT_MUN = readFileSync(ARG_GEO ? resolve(ARG_GEO.slice(6)) : join(RAIZ, 'public', 'geo', 'br-mun.json'), 'utf8');
const TXT_BR = readFileSync(join(RAIZ, 'public', 'geo', 'br.json'), 'utf8');
const mun = JSON.parse(TXT_MUN) as GeoBrasilMunicipios & { encartes?: { cod: string; nome: string; x: number; y: number; w: number; h: number }[] };
const br = JSON.parse(TXT_BR) as GeoBrasil;
const [, , W, H] = mun.viewBox.split(' ').map(Number);
const ORIGEM = 'http://sintonia.test';

// Paleta de QA (não é UI do produto): tons distintos para enxergar cada município.
const PALETA = ['#2c7a7b', '#b7791f', '#6b46c1', '#2b6cb0', '#c05621', '#2f855a', '#97266d', '#4a5568', '#0987a0', '#9c4221', '#5a67d8', '#718096'];
const cor = (i: number) => PALETA[(i * 7) % PALETA.length];

function caixaDe(cod: string): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const anel of lerPath(mun.municipios[cod]))
    for (const [x, y] of anel) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

function svgMapa(vb: string, opts: { traco: number; divisa: number; br?: boolean; rotulos?: string[] }): string {
  const paths = Object.entries(mun.municipios)
    .map(([, d], i) => `<path d="${d}" fill="${cor(i)}"/>`)
    .join('');
  const divisas = Object.values(mun.ufs).map((d) => `<path d="${d}"/>`).join('');
  const brUfs = opts.br ? Object.values(br.ufs).map((u) => `<path d="${u.d}"/>`).join('') : '';
  const enc = (mun.encartes ?? [])
    .map((e) => `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="3" fill="none" stroke="#fff" stroke-dasharray="3 2" stroke-width="${opts.divisa * 0.8}"/>`)
    .join('');
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;background:#09090f">
  <g stroke="#09090f" stroke-width="${opts.traco}" stroke-linejoin="round">${paths}</g>
  ${opts.br ? `<g fill="none" stroke="#ff2bd6" stroke-width="${opts.divisa * 2.6}" stroke-linejoin="round" opacity="0.9">${brUfs}</g>` : ''}
  <g fill="none" stroke="${opts.br ? '#00f0ff' : '#ffffff'}" stroke-width="${opts.divisa}" stroke-linejoin="round">${divisas}</g>${enc}
  ${(opts.rotulos ?? []).join('')}</svg>`;
}

const CSS = `body{margin:0;background:#09090f;color:#f4f4fa;font:13px/1.3 system-ui,sans-serif}`;

async function foto(page: Page, html: string, arquivo: string, largura: number) {
  await page.setViewportSize({ width: largura, height: Math.round((largura * H) / W) });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.screenshot({ path: join(SAIDA, arquivo), fullPage: true });
}

function recorte(cx: number, cy: number, lado: number): string {
  return `${(cx - lado / 2).toFixed(1)} ${(cy - lado / 2).toFixed(1)} ${lado} ${lado}`;
}

/** Código que roda no navegador: desempenho do <canvas> + testes de pixel. */
const NO_NAVEGADOR = async (cfg: { origem: string; W: number; H: number; paleta: string[] }) => {
  const { origem, W, H, paleta } = cfg;
  const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const t0 = performance.now();
  const txt = await (await fetch(`${origem}/br-mun.json`)).text();
  const t1 = performance.now();
  const geo = JSON.parse(txt) as { municipios: Record<string, string>; ufs: Record<string, string> };
  const t2 = performance.now();
  const ids = Object.keys(geo.municipios);
  const paths = ids.map((id) => new Path2D(geo.municipios[id]));
  const ufs = Object.values(geo.ufs).map((d) => new Path2D(d));
  const t3 = performance.now();
  const br = (await (await fetch(`${origem}/br.json`)).json()) as { ufs: Record<string, { d: string }> };

  const tela = (escala: number) => {
    const c = document.createElement('canvas');
    c.width = Math.round(W * escala);
    c.height = Math.round(H * escala);
    const ctx = c.getContext('2d', { willReadFrequently: false })!;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    return { c, ctx };
  };
  const desenhar = (ctx: CanvasRenderingContext2D, escala: number, comTraco: boolean) => {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < paths.length; i++) {
      ctx.fillStyle = paleta[(i * 7) % paleta.length];
      ctx.fill(paths[i]);
    }
    if (comTraco) {
      ctx.strokeStyle = 'rgba(9,9,15,0.55)';
      ctx.lineWidth = 0.6 / escala;
      ctx.lineJoin = 'round';
      for (const p of paths) ctx.stroke(p);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2 / escala;
    for (const p of ufs) ctx.stroke(p);
    ctx.getImageData(0, 0, 1, 1); // força a rasterização dentro da medida
  };
  const tempos: Record<string, { primeiro: number; mediana: number }> = {};
  for (const escala of [1, 2]) {
    for (const comTraco of [false, true]) {
      const { ctx } = tela(escala);
      const v: number[] = [];
      for (let k = 0; k < 9; k++) {
        const a = performance.now();
        desenhar(ctx, escala, comTraco);
        v.push(performance.now() - a);
      }
      tempos[`dpr${escala}${comTraco ? '+traço' : ''}`] = { primeiro: v[0], mediana: mediana(v.slice(1)) };
    }
  }
  // Alternativa: municípios agrupados por cor (um Path2D por cor com addPath) → 1 fill por cor.
  {
    const a = performance.now();
    const grupos = paleta.map(() => new Path2D());
    paths.forEach((p, i) => grupos[(i * 7) % paleta.length].addPath(p));
    const montar = performance.now() - a;
    for (const escala of [1, 2]) {
      const { ctx } = tela(escala);
      const v: number[] = [];
      for (let k = 0; k < 9; k++) {
        const b = performance.now();
        ctx.clearRect(0, 0, W, H);
        grupos.forEach((g, i) => {
          ctx.fillStyle = paleta[i];
          ctx.fill(g);
        });
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 / escala;
        for (const p of ufs) ctx.stroke(p);
        ctx.getImageData(0, 0, 1, 1);
        v.push(performance.now() - b);
      }
      tempos[`dpr${escala}-agrupado(montagem ${montar.toFixed(0)} ms)`] = { primeiro: v[0], mediana: mediana(v.slice(1)) };
    }
  }
  // imagem final (DPR 2, com traço) para a captura
  const final = tela(2);
  desenhar(final.ctx, 2, true);
  final.c.id = 'canvas-final';
  final.c.style.width = '100%';
  document.body.appendChild(final.c);

  // Frestas (3×): contorno das UFs branco, municípios pretos por cima → branco remanescente = buraco.
  const E = 3;
  const f = tela(E);
  f.ctx.fillStyle = '#000';
  f.ctx.fillRect(0, 0, W, H);
  f.ctx.fillStyle = '#fff';
  for (const p of ufs) f.ctx.fill(p);
  f.ctx.fillStyle = '#000';
  for (const p of paths) f.ctx.fill(p);
  const df = f.ctx.getImageData(0, 0, f.c.width, f.c.height).data;
  let frestas = 0;
  let frestasCinza = 0;
  const locaisFresta: [number, number][] = [];
  for (let i = 0; i < df.length; i += 4) {
    if (df[i] > 200) {
      frestas++;
      if (locaisFresta.length < 10) locaisFresta.push([((i / 4) % f.c.width) / E, Math.floor(i / 4 / f.c.width) / E]);
    } else if (df[i] > 128) frestasCinza++;
  }
  // Sobra: municípios brancos, contornos pretos por cima → branco remanescente = município fora do contorno.
  f.ctx.fillStyle = '#000';
  f.ctx.fillRect(0, 0, W, H);
  f.ctx.fillStyle = '#fff';
  for (const p of paths) f.ctx.fill(p);
  f.ctx.fillStyle = '#000';
  for (const p of ufs) f.ctx.fill(p);
  const ds = f.ctx.getImageData(0, 0, f.c.width, f.c.height).data;
  let sobra = 0;
  for (let i = 0; i < ds.length; i += 4) if (ds[i] > 200) sobra++;

  // Alinhamento (1×): cobertura do br.json × do br-mun.json (canal vermelho = br.json, verde = br-mun).
  const g = tela(1);
  g.ctx.fillStyle = '#000';
  g.ctx.fillRect(0, 0, W, H);
  g.ctx.globalCompositeOperation = 'lighter';
  g.ctx.fillStyle = '#ff0000';
  for (const u of Object.values(br.ufs)) g.ctx.fill(new Path2D(u.d));
  const mascara = tela(1);
  mascara.ctx.fillStyle = '#000';
  mascara.ctx.fillRect(0, 0, W, H);
  mascara.ctx.fillStyle = '#00ff00';
  for (const p of paths) mascara.ctx.fill(p);
  g.ctx.drawImage(mascara.c, 0, 0, W, H);
  const da = g.ctx.getImageData(0, 0, g.c.width, g.c.height).data;
  let borda = 0;
  let dif50 = 0;
  let dif90 = 0;
  for (let i = 0; i < da.length; i += 4) {
    const r = da[i];
    const gr = da[i + 1];
    if ((r > 0 && r < 255) || (gr > 0 && gr < 255)) borda++;
    const d = Math.abs(r - gr);
    if (d > 128) dif50++;
    if (d > 230) dif90++;
  }
  return {
    bytes: txt.length,
    fetchMs: t1 - t0,
    parseMs: t2 - t1,
    path2dMs: t3 - t2,
    tempos,
    frestas,
    frestasCinza,
    locaisFresta,
    sobra,
    alinhamento: { pixelsDeBorda: borda, dif50, dif90 },
  };
};

async function medir(page: Page, lentidao: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: lentidao });
  await page.setViewportSize({ width: 1000, height: 1004 });
  await page.goto(`${ORIGEM}/qa.html`);
  const r = await page.evaluate(NO_NAVEGADOR, { origem: ORIGEM, W, H, paleta: PALETA });
  if (lentidao === 1) await page.locator('#canvas-final').screenshot({ path: join(SAIDA, 'br-mun-canvas.png') });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return r;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1004 }, deviceScaleFactor: 1 });
  // o tsx (esbuild keepNames) injeta __name(...) nas funções passadas ao page.evaluate
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.route(`${ORIGEM}/**`, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/br-mun.json') return route.fulfill({ body: TXT_MUN, contentType: 'application/json' });
    if (u.pathname === '/br.json') return route.fulfill({ body: TXT_BR, contentType: 'application/json' });
    return route.fulfill({ body: `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body></body></html>`, contentType: 'text/html' });
  });

  const normal = await medir(page, 1);
  const lento = await medir(page, 4);

  // Capturas SVG
  await foto(page, svgMapa(mun.viewBox, { traco: 0.15, divisa: 0.7 }), 'br-mun-svg.png', 1600);
  await foto(page, svgMapa(mun.viewBox, { traco: 0, divisa: 0.6, br: true }), 'alinhamento.png', 1600);
  const zooms: { nome: string; vb: string; br: boolean }[] = [];
  const centro = (cod: string): [number, number] => {
    const [x0, y0, x1, y1] = caixaDe(cod);
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };
  zooms.push({ nome: 'zoom-df-go-mg', vb: recorte(...centro('5300108'), 60), br: true });
  zooms.push({ nome: 'zoom-sp-rj-mg', vb: recorte(...centro('3304201'), 90), br: true }); // Resende-RJ (tríplice divisa)
  zooms.push({ nome: 'zoom-ma-litoral', vb: recorte(740, 180, 60), br: true }); // pior discordância (ilhas)
  zooms.push({ nome: 'zoom-rs-sul', vb: recorte(569, 911, 40), br: true });
  zooms.push({ nome: 'zoom-grande-sp', vb: recorte(...centro('3550308'), 40), br: false });
  zooms.push({ nome: 'zoom-menores-mg', vb: recorte(...centro('3157336'), 16), br: false }); // Santa Cruz de Minas
  zooms.push({ nome: 'zoom-menores-sp', vb: recorte(...centro('3500600'), 16), br: false }); // Águas de São Pedro
  for (const e of mun.encartes ?? []) zooms.push({ nome: 'zoom-encarte-noronha', vb: recorte(e.x + e.w / 2 - 40, e.y + e.h / 2 + 20, 140), br: true });
  for (const z of zooms) {
    const lado = Number(z.vb.split(' ')[2]);
    const k = lado / 1000; // espessuras proporcionais ao recorte
    await foto(page, svgMapa(z.vb, { traco: 0.6 * k, divisa: 2.2 * k, br: z.br }), `${z.nome}.png`, 900);
  }
  await browser.close();

  const relatorio = { normal, cpu4x: lento };
  writeFileSync(join(SAIDA, 'medidas.json'), JSON.stringify(relatorio, null, 2));
  const fmt = (r: typeof normal) =>
    `fetch ${r.fetchMs.toFixed(0)} ms · JSON.parse ${r.parseMs.toFixed(0)} ms · Path2D ${r.path2dMs.toFixed(0)} ms · desenho ` +
    Object.entries(r.tempos)
      .map(([k, v]) => `${k} ${v.primeiro.toFixed(0)}/${v.mediana.toFixed(0)} ms`)
      .join(' · ');
  console.log(`CPU normal: ${fmt(normal)}`);
  console.log(`CPU 4× mais lenta: ${fmt(lento)}`);
  console.log('(desenho: primeiro quadro / mediana dos 8 seguintes; inclui getImageData de 1 px para forçar a rasterização)');
  console.log(`Frestas (3×, pixels quase brancos dentro do contorno): ${normal.frestas} ${normal.locaisFresta.length ? JSON.stringify(normal.locaisFresta) : ''} · cinza claro: ${normal.frestasCinza}`);
  console.log(`Municípios fora do contorno das UFs (3×): ${normal.sobra} pixels`);
  const a = normal.alinhamento;
  console.log(`Alinhamento em pixels (1×) br.json × br-mun.json: ${a.pixelsDeBorda} pixels de borda · cobertura difere > 50%: ${a.dif50} · > 90%: ${a.dif90}`);
  console.log(`Imagens em ${SAIDA}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
