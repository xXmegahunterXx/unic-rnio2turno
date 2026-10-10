/**
 * Hemiciclo e cores neutras de partido para as imagens de compartilhamento (OG) — espelho, no servidor, de
 * src/app/components/pages/cargos/Hemiciclo.tsx (layoutLinhas/posicionar) e partidos.ts (corPartido), que vivem no
 * app (React) e não entram no bundle do servidor. Se mudar lá, mude aqui.
 *
 * Regras (ARCHITECTURE §1.1 e §10.2.9): paleta categórica própria e estável, sem relação com as cores oficiais
 * dos partidos, sem turquesa/âmbar (slots A/B) nem o violeta da marca; os 10 maiores partidos pelo nº de eleitos
 * (critério de TAMANHO, nunca de espectro) têm cor própria e os demais ficam em dois cinzas; bancadas da
 * esquerda para a direita por tamanho. Identidade nunca só pela cor: a imagem sempre traz a sigla ao lado.
 *
 * O hemiciclo sai como SVG (data URI) e entra no layout do satori como <img>: centenas de cadeiras sem
 * centenas de nós de layout.
 */

/** Ordem por tamanho (nº de eleitos em 2026: Câmara + Assembleias + Senado) — igual a PARTIDOS_COM_COR do app. */
export const PARTIDOS_COM_COR = ['PL', 'PT', 'MDB', 'PSD', 'PP', 'REPUBLICANOS', 'UNIÃO', 'PODE', 'PSB', 'PSOL'] as const;

/** Tokens `--partido-1..10` do tema escuro (src/app/styles.css), "R G B". */
const PALETA_ESCURA = [
  [202, 109, 173],
  [99, 85, 162],
  [149, 61, 124],
  [160, 124, 219],
  [194, 115, 95],
  [152, 153, 18],
  [30, 119, 41],
  [192, 85, 114],
  [146, 98, 157],
  [87, 143, 49],
] as const;

/** Cinzas dos demais partidos: cand-outros (85%) e fg-subtle (50%) do tema escuro, já compostos sobre a superfície. */
const CINZAS = ['rgb(121,121,142)', 'rgb(74,74,90)'];
/** Cadeira sem resultado divulgado. */
export const COR_PENDENTE = 'rgb(58,58,80)';

const normSigla = (s: string) => s.trim().toUpperCase().replace('UNIAO', 'UNIÃO');

/** Cor neutra do partido (rgb()). */
export function corPartido(sigla: string): string {
  const k = normSigla(sigla);
  const i = (PARTIDOS_COM_COR as readonly string[]).indexOf(k);
  if (i >= 0) {
    const [r, g, b] = PALETA_ESCURA[i];
    return `rgb(${r},${g},${b})`;
  }
  // estável: hash simples da sigla (o mesmo do app)
  let h = 0;
  for (let j = 0; j < k.length; j++) h = (h * 31 + k.charCodeAt(j)) >>> 0;
  return CINZAS[h % 2];
}

interface Pos {
  x: number;
  y: number;
  a: number;
}

const R0 = 0.4; // raio interno (fração do externo)

/** Divide `total` proporcionalmente a `pesos` (maior resto), sem passar de `teto[i]` quando dado. */
function maiorResto(pesos: number[], total: number, teto?: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0 || total <= 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (p / soma) * total);
  const out = brutos.map((b, i) => Math.min(Math.floor(b), teto ? teto[i] : Infinity));
  let falta = total - out.reduce((a, b) => a + b, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let volta = 0; falta > 0 && volta < 4; volta++) {
    for (const [, i] of ordem) {
      if (falta <= 0) break;
      if (teto && out[i] >= teto[i]) continue;
      out[i]++;
      falta--;
    }
  }
  return out;
}

/** Posições das N cadeiras, por fileira (de dentro para fora), cada fileira da esquerda para a direita. */
export function layoutLinhas(n: number): { linhas: Pos[][]; r: number } {
  if (n <= 0) return { linhas: [], r: 0 };
  let linhas = 1;
  let d = 0;
  let caps: number[] = [];
  for (; linhas < 40; linhas++) {
    d = (1 - R0) / linhas;
    caps = Array.from({ length: linhas }, (_, i) => Math.max(1, Math.floor((Math.PI * (R0 + d * (i + 0.5))) / d)));
    if (caps.reduce((a, b) => a + b, 0) >= n) break;
  }
  const porLinha = maiorResto(caps, n);
  const out: Pos[][] = porLinha.map((m, i) => {
    const rho = R0 + d * (i + 0.5);
    return Array.from({ length: m }, (_, k) => {
      const a = m === 1 ? Math.PI / 2 : Math.PI - (k * Math.PI) / (m - 1);
      return { x: rho * Math.cos(a), y: -rho * Math.sin(a), a };
    });
  });
  return { linhas: out, r: d * 0.4 };
}

/** Posição de cada cadeira (na ordem de `assentos`), com cada partido na mesma "fatia" em todas as fileiras. */
export function posicionar(assentos: { partido: string; pendente?: boolean }[]): { pos: Pos[]; r: number } {
  const { linhas, r } = layoutLinhas(assentos.length);
  const grupos: { chave: string; idx: number[] }[] = [];
  assentos.forEach((a, i) => {
    const chave = a.pendente ? '__pendente' : a.partido;
    const g = grupos[grupos.length - 1];
    if (g && g.chave === chave) g.idx.push(i);
    else grupos.push({ chave, idx: [i] });
  });
  const resta = grupos.map((g) => g.idx.length);
  const usados = grupos.map(() => 0);
  const pos: Pos[] = new Array(assentos.length);
  for (let li = linhas.length - 1; li >= 0; li--) {
    const linha = linhas[li];
    const cotas = li === 0 ? [...resta] : maiorResto(resta, linha.length, resta);
    let k = 0;
    cotas.forEach((q, gi) => {
      for (let j = 0; j < q; j++) {
        const g = grupos[gi];
        pos[g.idx[usados[gi]++]] = linha[k++];
      }
      resta[gi] -= q;
    });
  }
  return { pos, r };
}

export interface Bancada {
  sigla: string;
  eleitos: number;
}

/** Bancadas por tamanho (desc), desempate alfabético — nunca por espectro. Sem cadeiras zeradas. */
export function porTamanho(bancadas: Bancada[]): Bancada[] {
  return bancadas.filter((b) => b.eleitos > 0).sort((a, b) => b.eleitos - a.eleitos || a.sigla.localeCompare(b.sigla, 'pt-BR'));
}

/**
 * SVG do hemiciclo (largura `w`): bancadas por tamanho da esquerda para a direita e `pendentes` cadeiras sem
 * resultado (cinza escuro com contorno) no fim. Devolve o data URI e a altura.
 */
export function svgHemiciclo(bancadas: Bancada[], pendentes: number, w: number): { uri: string; h: number; total: number } {
  const assentos: { partido: string; pendente?: boolean }[] = [];
  for (const b of porTamanho(bancadas)) for (let i = 0; i < b.eleitos; i++) assentos.push({ partido: b.sigla });
  for (let i = 0; i < Math.max(0, pendentes); i++) assentos.push({ partido: '', pendente: true });
  const total = assentos.length;
  const esc = w / 2 - 4;
  const { pos, r } = posicionar(assentos);
  const raio = Math.min(esc * 0.065, Math.max(1.6, r * esc));
  const h = Math.ceil(esc + raio + 6);
  const cy = esc + 2;
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  const circulos = pos
    .map((p, i) => {
      const a = assentos[i];
      const cor = a.pendente ? COR_PENDENTE : corPartido(a.partido);
      const borda = a.pendente ? ' stroke="rgba(244,244,250,0.28)" stroke-width="1"' : '';
      return `<circle cx="${f(w / 2 + p.x * esc)}" cy="${f(cy + p.y * esc)}" r="${f(raio)}" fill="${cor}"${borda}/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${circulos}</svg>`;
  return { uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, h, total };
}
