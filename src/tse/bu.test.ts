/** Decodificador BER do boletim de urna: robustez com entradas inválidas (os BUs reais estão em map.test.ts). */
import { describe, expect, it } from 'vitest';
import { BuFormatoError, berInt, berLer, lerBoletimUrna, votosDoCargo } from './bu';
import { lerFixture } from './__fixtures__/fake-fetch';

const BU_AC =
  'ele2026/arquivo-urna/3220/dados/ac/01066/0004/0077/4a6b704a7350756e6a5a496433337049453538516932486a676159553779785542752d6d765749354f41343d/o03220ac0106600040077-bu.dat';

describe('BER / boletim de urna', () => {
  it('inteiros em complemento de dois', () => {
    const buf = new Uint8Array([0x02, 0x02, 0x01, 0x2c, 0x02, 0x01, 0xff, 0x02, 0x00]);
    const a = berLer(buf, 0);
    expect(berInt(buf, a.no)).toBe(300);
    const b = berLer(buf, a.prox);
    expect(berInt(buf, b.no)).toBe(-1);
    expect(berInt(buf, berLer(buf, b.prox).no)).toBe(0);
  });

  it('BU real: soma por cargo fecha com o comparecimento', () => {
    const bu = lerBoletimUrna(lerFixture(BU_AC));
    for (const el of bu.eleicoes) {
      for (const cg of el.cargos) {
        if (cg.tipoCargo !== 1) continue; // majoritários
        const v = votosDoCargo(bu, el.idEleicao, cg.codigoCargo)!;
        const nominais = [...v.nominais.values()].reduce((a, b) => a + b, 0);
        // Senado em 2026 renova 2/3: 2 votos por eleitor
        const votosPorEleitor = cg.codigoCargo === 5 ? 2 : 1;
        expect(nominais + v.brancos + v.nulos + v.legenda).toBe(v.comparecimento * votosPorEleitor);
      }
    }
    expect(bu.eleicoes.flatMap((e) => e.cargos.map((c) => c.codigoCargo)).sort()).toEqual([1, 3, 5, 6, 7]);
  });

  it('arquivo truncado, vazio ou que não é BU → BuFormatoError', () => {
    const bytes = lerFixture(BU_AC);
    expect(() => lerBoletimUrna(bytes.slice(0, 200))).toThrow(BuFormatoError);
    expect(() => lerBoletimUrna(new Uint8Array())).toThrow(BuFormatoError);
    expect(() => lerBoletimUrna(new TextEncoder().encode('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>'))).toThrow(
      BuFormatoError,
    );
    expect(() => lerBoletimUrna(new Uint8Array([0x30, 0x80, 0x00, 0x00]))).toThrow(/indefinido/);
  });
});
