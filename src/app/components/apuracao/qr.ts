/**
 * Gerador de QR Code (ISO/IEC 18004) mínimo e sem dependências — modo byte (UTF-8), correção L ou M,
 * versões 1–40, escolha automática da máscara pela penalidade padrão. Baseado no algoritmo de referência
 * de Project Nayuki (MIT). Usado no Modo TV para o link do site.
 *
 * `gerarQr(texto)` → { tamanho, modulos } (modulos[y][x] = true para módulo escuro, sem a zona de silêncio).
 */

export type NivelQr = 'L' | 'M';

export interface QrMatriz {
  tamanho: number;
  versao: number;
  mascara: number;
  modulos: boolean[][];
}

const ECC_POR_BLOCO: Record<NivelQr, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};
const BLOCOS: Record<NivelQr, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};
const BITS_FORMATO: Record<NivelQr, number> = { L: 1, M: 0 };

function modulosBrutos(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

const codewordsDados = (ver: number, n: NivelQr) => Math.floor(modulosBrutos(ver) / 8) - ECC_POR_BLOCO[n][ver] * BLOCOS[n][ver];

function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisorRs(grau: number): number[] {
  const r = new Array<number>(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}

function restoRs(dados: number[], divisor: number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of dados) {
    const fator = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => (r[i] ^= multiplicar(c, fator)));
  }
  return r;
}

function posicoesAlinhamento(ver: number, tamanho: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const passo = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const r = [6];
  for (let pos = tamanho - 7; r.length < n; pos -= passo) r.splice(1, 0, pos);
  return r;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

export function gerarQr(texto: string, nivel: NivelQr = 'M'): QrMatriz {
  const bytes = Array.from(new TextEncoder().encode(texto));
  // versão mínima
  let ver = 1;
  for (; ver <= 40; ver++) {
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= codewordsDados(ver, nivel) * 8) break;
  }
  if (ver > 40) throw new Error('Texto longo demais para um QR Code');
  const ccBits = ver <= 9 ? 8 : 16;
  const capacidade = codewordsDados(ver, nivel) * 8;

  // fluxo de bits
  const bits: number[] = [];
  const empurra = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  empurra(0b0100, 4);
  empurra(bytes.length, ccBits);
  for (const b of bytes) empurra(b, 8);
  empurra(0, Math.min(4, capacidade - bits.length));
  empurra(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacidade; pad ^= 0xec ^ 0x11) empurra(pad, 8);
  const dados: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dados.push(b);
  }

  // correção de erros e intercalação
  const nBlocos = BLOCOS[nivel][ver];
  const eccLen = ECC_POR_BLOCO[nivel][ver];
  const brutos = Math.floor(modulosBrutos(ver) / 8);
  const nCurtos = nBlocos - (brutos % nBlocos);
  const curto = Math.floor(brutos / nBlocos);
  const div = divisorRs(eccLen);
  const blocos: number[][] = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const dat = dados.slice(k, k + curto - eccLen + (i < nCurtos ? 0 : 1));
    k += dat.length;
    const ecc = restoRs(dat, div);
    if (i < nCurtos) dat.push(0);
    blocos.push(dat.concat(ecc));
  }
  const final: number[] = [];
  for (let i = 0; i < blocos[0].length; i++)
    blocos.forEach((b, j) => {
      if (i !== curto - eccLen || j >= nCurtos) final.push(b[i]);
    });

  // matriz
  const tamanho = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: tamanho }, () => new Array<boolean>(tamanho).fill(false));
  const funcao: boolean[][] = Array.from({ length: tamanho }, () => new Array<boolean>(tamanho).fill(false));
  const fixa = (x: number, y: number, escuro: boolean) => {
    m[y][x] = escuro;
    funcao[y][x] = true;
  };
  for (let i = 0; i < tamanho; i++) {
    fixa(6, i, i % 2 === 0);
    fixa(i, 6, i % 2 === 0);
  }
  const localizador = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < tamanho && yy >= 0 && yy < tamanho) fixa(xx, yy, d !== 2 && d !== 4);
      }
  };
  localizador(3, 3);
  localizador(tamanho - 4, 3);
  localizador(3, tamanho - 4);
  const al = posicoesAlinhamento(ver, tamanho);
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fixa(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const formato = (mascara: number) => {
    const d = (BITS_FORMATO[nivel] << 3) | mascara;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) fixa(8, i, bit(b, i));
    fixa(8, 7, bit(b, 6));
    fixa(8, 8, bit(b, 7));
    fixa(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) fixa(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) fixa(tamanho - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) fixa(8, tamanho - 15 + i, bit(b, i));
    fixa(8, tamanho - 8, true);
  };
  formato(0); // reserva
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const v = bit(b, i);
      const a = tamanho - 11 + (i % 3);
      const c = Math.floor(i / 3);
      fixa(a, c, v);
      fixa(c, a, v);
    }
  }
  // dados em zigue-zague
  let k = 0;
  for (let dir = tamanho - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let v = 0; v < tamanho; v++)
      for (let j = 0; j < 2; j++) {
        const x = dir - j;
        const sobe = ((dir + 1) & 2) === 0;
        const y = sobe ? tamanho - 1 - v : v;
        if (!funcao[y][x] && k < final.length * 8) {
          m[y][x] = bit(final[k >>> 3], 7 - (k & 7));
          k++;
        }
      }
  }

  const aplicar = (mask: number) => {
    for (let y = 0; y < tamanho; y++)
      for (let x = 0; x < tamanho; x++) {
        let inv: boolean;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!funcao[y][x] && inv) m[y][x] = !m[y][x];
      }
  };

  const penalidade = () => {
    let r = 0;
    const addHist = (len: number, h: number[]) => {
      if (h[0] === 0) len += tamanho;
      h.pop();
      h.unshift(len);
    };
    const conta = (h: number[]) => {
      const n = h[1];
      const nucleo = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (nucleo && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (nucleo && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    const termina = (cor: boolean, len: number, h: number[]) => {
      if (cor) {
        addHist(len, h);
        len = 0;
      }
      len += tamanho;
      addHist(len, h);
      return conta(h);
    };
    for (let eixo = 0; eixo < 2; eixo++)
      for (let a = 0; a < tamanho; a++) {
        let cor = false;
        let run = 0;
        const h = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < tamanho; b++) {
          const v = eixo === 0 ? m[a][b] : m[b][a];
          if (v === cor) {
            run++;
            if (run === 5) r += 3;
            else if (run > 5) r++;
          } else {
            addHist(run, h);
            if (!cor) r += conta(h) * 40;
            cor = v;
            run = 1;
          }
        }
        r += termina(cor, run, h) * 40;
      }
    for (let y = 0; y < tamanho - 1; y++)
      for (let x = 0; x < tamanho - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r += 3;
      }
    let escuros = 0;
    for (const linha of m) for (const v of linha) if (v) escuros++;
    const total = tamanho * tamanho;
    r += (Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1) * 10;
    return r;
  };

  let melhor = 0;
  let menor = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    aplicar(mask);
    formato(mask);
    const p = penalidade();
    if (p < menor) {
      menor = p;
      melhor = mask;
    }
    aplicar(mask); // desfaz (XOR)
  }
  aplicar(melhor);
  formato(melhor);
  return { tamanho, versao: ver, mascara: melhor, modulos: m };
}

/** Caminho SVG (um retângulo por sequência horizontal de módulos escuros), em unidades de módulo. */
export function qrPath(q: QrMatriz, margem = 0): string {
  let d = '';
  for (let y = 0; y < q.tamanho; y++) {
    let x = 0;
    while (x < q.tamanho) {
      if (!q.modulos[y][x]) {
        x++;
        continue;
      }
      let x2 = x;
      while (x2 < q.tamanho && q.modulos[y][x2]) x2++;
      d += `M${x + margem} ${y + margem}h${x2 - x}v1h${x - x2}z`;
      x = x2;
    }
  }
  return d;
}
