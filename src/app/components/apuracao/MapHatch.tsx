/**
 * Hachura sutil para território ainda sem seções apuradas ("pending").
 * - `<MapHatchPattern id>`: <pattern> SVG para usar como `fill: url(#id)` nos mapas.
 * - `hachuraStyle()`: o mesmo efeito em CSS (legendas, tile map).
 */
import type { CSSProperties } from 'react';

export function MapHatchPattern({ id, escala = 1 }: { id: string; /** unidades do viewBox por px */ escala?: number }) {
  const s = 6 * escala;
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={s} height={s} patternTransform="rotate(45)">
      <rect width={s} height={s} style={{ fill: 'rgb(var(--pending))' }} />
      <rect width={1.4 * escala} height={s} style={{ fill: 'rgb(var(--fg) / 0.09)' }} />
    </pattern>
  );
}

export function hachuraStyle(): CSSProperties {
  return {
    backgroundColor: 'rgb(var(--pending))',
    backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--fg) / 0.1) 0 1.5px, transparent 1.5px 6px)',
  };
}
