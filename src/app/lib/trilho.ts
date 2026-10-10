/**
 * Valor de um controle deslizante a partir do ponto tocado na trilha (usado no toque, onde o <input range> nativo do
 * iOS/WebKit só responde a quem arrasta o próprio polegar). Limita a [min, max] e arredonda para o passo.
 */
export function valorNoTrilho(x: number, esquerda: number, largura: number, min = 0, max = 100, passo = 1): number {
  if (!(largura > 0) || !Number.isFinite(x)) return min;
  const f = Math.min(1, Math.max(0, (x - esquerda) / largura));
  const p = passo > 0 ? passo : 1;
  const passos = Math.round((f * (max - min)) / p);
  return Math.min(max, Math.max(min, min + passos * p));
}
