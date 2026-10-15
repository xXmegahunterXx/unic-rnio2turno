import { describe, expect, it } from 'vitest';
import { FIM_PX, LIMIAR_PX, TOPO_PX, decidirTabOculta } from './barrasMoveis';

const base = { janela: 740, pagina: 6000 };

describe('decidirTabOculta', () => {
  it('perto do topo a tab bar sempre aparece', () => {
    expect(decidirTabOculta({ ...base, y: TOPO_PX, yAnterior: 0, oculta: true })).toBe(false);
    expect(decidirTabOculta({ ...base, y: 40, yAnterior: 10, oculta: false })).toBe(false);
  });

  it('rolando para baixo depois do topo, some; para cima, volta', () => {
    expect(decidirTabOculta({ ...base, y: 900, yAnterior: 600, oculta: false })).toBe(true);
    expect(decidirTabOculta({ ...base, y: 880, yAnterior: 900, oculta: true })).toBe(false);
  });

  it('no fim da página (rodapé à vista) volta, mesmo rolando para baixo', () => {
    const y = base.pagina - base.janela - FIM_PX + 1;
    expect(decidirTabOculta({ ...base, y, yAnterior: y - 200, oculta: true })).toBe(false);
  });

  it('rolagem pequena não decide nada (tremida do dedo)', () => {
    expect(decidirTabOculta({ ...base, y: 900, yAnterior: 900 - (LIMIAR_PX - 1), oculta: false })).toBeNull();
    expect(decidirTabOculta({ ...base, y: 900, yAnterior: 900 + (LIMIAR_PX - 1), oculta: true })).toBeNull();
  });

  it('no mesmo sentido do estado atual, nada muda', () => {
    expect(decidirTabOculta({ ...base, y: 1500, yAnterior: 1000, oculta: true })).toBeNull();
    expect(decidirTabOculta({ ...base, y: 1000, yAnterior: 1500, oculta: false })).toBeNull();
  });

  it('página curta (cabe na tela) nunca esconde', () => {
    expect(decidirTabOculta({ y: 300, yAnterior: 100, janela: 740, pagina: 1100, oculta: false })).toBe(false);
  });
});
