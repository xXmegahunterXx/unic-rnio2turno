/**
 * Fotos oficiais do TSE para as imagens de compartilhamento (OG), a partir dos pacotes gerados pelo pipeline
 * de dados: `DATA_DIR/fotos/{grupo}.json` (`FotoPacote`: sqcand → data URI). Ver ARCHITECTURE §1.1 e §10.
 *
 *  - Leitura preguiçosa, com cache; o arquivo é reconferido (mtime) no máximo a cada 60 s, então um pacote
 *    publicado depois da subida passa a valer sem reiniciar.
 *  - Só JPEG e PNG: o satori (layout → SVG) e o resvg (SVG → PNG) não decodificam WebP/AVIF. Foto em outro
 *    formato conta como ausente (o OG mantém o monograma).
 *  - Quem decide SE mostra é o chamador (nunca na simulação anonimizada; só com foto dos dois finalistas).
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FotoPacote } from '../shared/dataset';

const RECHECAR_MS = 60_000;
/** Retrato ~120×160: bem abaixo disso. Acima, ignora (protege a renderização). */
const MAX_FOTO_CHARS = 400_000;
const RE_FOTO = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const RE_GRUPO = /^[a-z0-9][a-z0-9-]{0,47}$/;

interface Entrada {
  verificadoEm: number;
  mtimeMs: number;
  fotos: Record<string, string> | null;
}

export class PacotesFotos {
  private cache = new Map<string, Entrada>();

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

  private pacote(grupo: string): Record<string, string> | null {
    if (!RE_GRUPO.test(grupo)) return null;
    const agora = this.now();
    const e = this.cache.get(grupo);
    if (e && agora - e.verificadoEm < RECHECAR_MS) return e.fotos;
    const arq = join(this.dir, 'fotos', `${grupo}.json`);
    let mtimeMs = -1;
    try {
      mtimeMs = statSync(arq).mtimeMs;
    } catch {
      /* ausente */
    }
    if (e && e.mtimeMs === mtimeMs) {
      e.verificadoEm = agora;
      return e.fotos;
    }
    let fotos: Record<string, string> | null = null;
    if (mtimeMs >= 0) {
      try {
        const p = JSON.parse(readFileSync(arq, 'utf8')) as FotoPacote;
        if (p && typeof p === 'object' && p.fotos && typeof p.fotos === 'object') fotos = p.fotos;
      } catch {
        fotos = null; // corrompido ou sendo escrito: tenta de novo no próximo intervalo
      }
    }
    this.cache.set(grupo, { verificadoEm: agora, mtimeMs: fotos ? mtimeMs : -2, fotos });
    return fotos;
  }

  /** Data URI (JPEG/PNG) da foto oficial do candidato, ou null se não houver pacote/foto utilizável. */
  foto(grupo: string, sqcand: string): string | null {
    const f = this.pacote(grupo)?.[sqcand];
    return typeof f === 'string' && f.length <= MAX_FOTO_CHARS && RE_FOTO.test(f) ? f : null;
  }

  /** Foto para as imagens OG (JPEG/PNG), ou null. */
  fotoOg(grupo: string, sqcand: string): string | null {
    return this.foto(grupo, sqcand);
  }
}
