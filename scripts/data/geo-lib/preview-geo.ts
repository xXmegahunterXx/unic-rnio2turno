/**
 * QA visual e automático das geometrias de public/geo (Playwright + Chromium).
 *
 * Gera páginas HTML (Brasil inteiro, grade com as 27 UFs, e UFs ampliadas) e tira screenshots. No navegador
 * também confere, para cada feição:
 *  - cx/cy cai DENTRO do preenchimento (isPointInFill);
 *  - nenhum polígono "invertido" (caixa maior que o viewBox inteiro ou que o contorno da UF);
 *  - frestas: pinta o contorno de branco e os municípios de preto por cima, em 3×; pixel quase branco
 *    dentro do contorno = buraco entre vizinhos (o serrilhado das bordas compartilhadas fica cinza e não conta).
 *
 * Uso: tsx scripts/data/geo-lib/preview-geo.ts [pastaSaida] [--ufs=mg,pe]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import type { GeoBrasil, GeoUf } from '../../../src/shared/dataset';
import { UFS } from '../../../src/shared/types';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const DIR_GEO = join(RAIZ, 'public', 'geo');
const args = process.argv.slice(2);
const SAIDA = resolve(args.find((a) => !a.startsWith('--')) ?? join(RAIZ, 'preview-out', 'geo'));
const argUfs = args.find((a) => a.startsWith('--ufs='));
const DETALHE = argUfs ? argUfs.slice(6).toUpperCase().split(',') : ['MG', 'PE', 'ES', 'RJ', 'SP', 'PA', 'AM', 'DF', 'GO', 'RS'];

// Paleta de QA (não é UI do produto): tons distintos para enxergar cada feição.
const PALETA = ['#2c7a7b', '#b7791f', '#6b46c1', '#2b6cb0', '#c05621', '#2f855a', '#97266d', '#4a5568', '#0987a0', '#9c4221'];

const br = JSON.parse(readFileSync(join(DIR_GEO, 'br.json'), 'utf8')) as GeoBrasil;
const ufs = Object.fromEntries(UFS.map((uf) => [uf, JSON.parse(readFileSync(join(DIR_GEO, 'mun', `${uf.toLowerCase()}.json`), 'utf8')) as GeoUf]));

function svgBrasil(): string {
  const paths = Object.entries(br.ufs)
    .map(([uf, f], i) => `<path data-id="${uf}" d="${f.d}" fill="${PALETA[i % PALETA.length]}" stroke="#fff" stroke-width="0.8" stroke-linejoin="round"/>`)
    .join('');
  const rotulos = Object.entries(br.ufs)
    .map(([uf, f]) => `<circle cx="${f.cx}" cy="${f.cy}" r="2.5" fill="#fff"/><text x="${f.cx}" y="${f.cy - 6}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${uf}</text>`)
    .join('');
  return `<svg id="mapa" viewBox="${br.viewBox}" xmlns="http://www.w3.org/2000/svg">${paths}${rotulos}</svg>`;
}

function svgUf(geo: GeoUf, comRotulos: boolean): string {
  const paths = Object.entries(geo.municipios)
    .map(([cod, f], i) => `<path data-id="${cod}" d="${f.d}" fill="${PALETA[(i * 7) % PALETA.length]}"/>`)
    .join('');
  const pontos = comRotulos
    ? Object.values(geo.municipios)
        .map((f) => `<circle cx="${f.cx}" cy="${f.cy}" r="1.6" fill="#fff" stroke="#000" stroke-width="0.6"/>`)
        .join('')
    : '';
  const encartes = ((geo as GeoUf & { encartes?: { x: number; y: number; w: number; h: number; nome: string }[] }).encartes ?? [])
    .map((e) => `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="6" fill="none" stroke="#fff" stroke-dasharray="4 3" stroke-width="1"/><text x="${e.x + 6}" y="${e.y + e.h + 13}" font-size="11" fill="#fff">${e.nome}</text>`)
    .join('');
  return `<svg viewBox="${geo.viewBox}" xmlns="http://www.w3.org/2000/svg"><g stroke="#11111a" stroke-width="0.35" stroke-linejoin="round">${paths}</g><path d="${geo.contorno}" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>${pontos}${encartes}</svg>`;
}

const CSS = `body{margin:0;background:#09090f;color:#f4f4fa;font:13px/1.3 system-ui,sans-serif}
svg{display:block;width:100%;height:auto}
.grade{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:12px}
.cel{background:#11111a;border-radius:10px;padding:6px}
.cel b{display:block;margin:0 0 4px 2px}`;

function pagina(titulo: string, corpo: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title><style>${CSS}</style></head><body>${corpo}</body></html>`;
}

/** Roda no navegador: confere rótulos, polígonos invertidos e frestas. */
const VERIFICAR = `async (dados) => {
  const out = { foraDoFill: [], invertidos: [], frestas: {} };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  document.body.appendChild(svg);
  for (const conj of dados) {
    svg.setAttribute('viewBox', conj.viewBox);
    const [, , W, H] = conj.viewBox.split(' ').map(Number);
    const p = document.createElementNS(ns, 'path');
    svg.appendChild(p);
    for (const [id, f] of Object.entries(conj.feicoes)) {
      p.setAttribute('d', f.d);
      const pt = svg.createSVGPoint(); pt.x = f.cx; pt.y = f.cy;
      if (!p.isPointInFill(pt)) out.foraDoFill.push(conj.nome + ':' + id);
      const b = p.getBBox();
      if (b.width > W * 1.01 || b.height > H * 1.01 || b.x < -1 || b.y < -1 || b.x + b.width > W + 1 || b.y + b.height > H + 1) out.invertidos.push(conj.nome + ':' + id);
      // polígono "invertido" também apareceria como ponto fora do fill num canto vazio:
      const canto = svg.createSVGPoint(); canto.x = 0.5; canto.y = 0.5;
      if (p.isPointInFill(canto)) out.invertidos.push(conj.nome + ':' + id + '(canto)');
    }
    p.remove();
    // frestas
    const k = 3;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(W * k); cv.height = Math.ceil(H * k);
    const g = cv.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.fill(new Path2D(conj.contorno), 'nonzero');
    g.fillStyle = '#000';
    for (const f of Object.values(conj.feicoes)) g.fill(new Path2D(f.d), 'nonzero');
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    let brancos = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 200) brancos++;
    out.frestas[conj.nome] = brancos;
  }
  svg.remove();
  return out;
}`;

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  writeFileSync(join(SAIDA, 'br.html'), pagina('Brasil', `<div style="padding:16px;max-width:980px;margin:auto">${svgBrasil()}</div>`));
  const grade = UFS.map((uf) => `<div class="cel"><b>${uf} · ${Object.keys(ufs[uf].municipios).length}</b>${svgUf(ufs[uf], false)}</div>`).join('');
  writeFileSync(join(SAIDA, 'ufs.html'), pagina('UFs', `<div class="grade">${grade}</div>`));
  for (const uf of DETALHE) writeFileSync(join(SAIDA, `uf-${uf.toLowerCase()}.html`), pagina(uf, `<div style="padding:12px">${svgUf(ufs[uf], true)}</div>`));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1.5 });
  await page.goto(`file://${join(SAIDA, 'br.html')}`);
  await page.screenshot({ path: join(SAIDA, 'br.png'), fullPage: true });
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto(`file://${join(SAIDA, 'ufs.html')}`);
  await page.screenshot({ path: join(SAIDA, 'ufs.png'), fullPage: true });
  await page.setViewportSize({ width: 1400, height: 1000 });
  for (const uf of DETALHE) {
    await page.goto(`file://${join(SAIDA, `uf-${uf.toLowerCase()}.html`)}`);
    await page.screenshot({ path: join(SAIDA, `uf-${uf.toLowerCase()}.png`), fullPage: true });
  }

  // Verificações automáticas
  const dados = [
    {
      nome: 'BR',
      viewBox: br.viewBox,
      // contorno do Brasil = união das UFs (para frestas, basta pintar as UFs por cima do próprio conjunto)
      contorno: Object.values(br.ufs).map((f) => f.d).join(''),
      feicoes: br.ufs,
    },
    ...UFS.map((uf) => ({ nome: uf, viewBox: ufs[uf].viewBox, contorno: ufs[uf].contorno, feicoes: ufs[uf].municipios })),
  ];
  const res = (await page.evaluate(`(${VERIFICAR})(${JSON.stringify(dados)})`)) as {
    foraDoFill: string[];
    invertidos: string[];
    frestas: Record<string, number>;
  };
  await browser.close();
  console.log(`Screenshots em ${SAIDA}`);
  console.log(`Rótulos fora do polígono: ${res.foraDoFill.length ? res.foraDoFill.join(', ') : 'nenhum'}`);
  console.log(`Polígonos invertidos/estourados: ${res.invertidos.length ? res.invertidos.join(', ') : 'nenhum'}`);
  console.log(`Pixels de fresta (3×, >200 dentro do contorno): ${Object.entries(res.frestas).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
