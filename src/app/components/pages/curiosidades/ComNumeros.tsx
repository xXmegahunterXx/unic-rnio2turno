/** Texto corrido com os números em `.num` (algarismos tabulares), como manda o design system. */
import { Fragment } from 'react';
import { trechosComNumeros } from './formato';

export function ComNumeros({ texto }: { texto: string }) {
  return (
    <>
      {trechosComNumeros(texto).map((p, i) =>
        p.num ? (
          <span key={i} className="num whitespace-nowrap">
            {p.t}
          </span>
        ) : (
          <Fragment key={i}>{p.t}</Fragment>
        ),
      )}
    </>
  );
}
