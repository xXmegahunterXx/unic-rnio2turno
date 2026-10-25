/**
 * Calibração da "Projeção do Sintonia" (src/shared/projecao.ts) em noites SIMULADAS do nosso motor.
 *
 * Para cada cenário (presets, ordens regionais 'realista' | 'aleatoria' | 'norte-primeiro' | 'sul-primeiro', várias
 * sementes), nas frações 10, 20, 30, 50, 70 e 90% das seções de cada abrangência, monta a mesma entrada que o servidor
 * monta (municípios do 2º turno no instante + 1º turno do dataset), projeta e compara com o resultado FINAL da própria
 * simulação: Presidente no Brasil, Presidente em cada UF (e exterior) e os governadores do 2º turno.
 *
 * Falha se a cobertura da faixa (resultado final dentro de [mín, máx]) cair abaixo de 95% em qualquer abrangência, ou se
 * o erro médio em 30% passar de 1,5 p.p. A tabela (erro médio/máximo, cobertura e meia-largura média) vai ao console.
 */
import { describe, expect, it } from 'vitest';
import { avalia, CENARIOS, FRACOES, pontosDoCenario, type Caso, type Tipo } from './tests/projecao-harness';

const fmt = (x: number, c = 2) => x.toFixed(c).padStart(6);

function tabela(casos: Caso[], titulo: string, falhas: string[]): string {
  const linhas: string[] = [`${titulo} (${casos.length} casos)`, 'abrangência  fração    n  erro médio  erro máx  cobertura  meia média   z95'];
  for (const tipo of ['pres-BR', 'pres-UF', 'gov'] as Tipo[]) {
    const doTipo = casos.filter((x) => x.tipo === tipo);
    for (const alvo of [...FRACOES, -1]) {
      const cs = alvo < 0 ? doTipo : doTipo.filter((x) => x.alvo === alvo);
      if (!cs.length) continue;
      const abs = cs.map((x) => Math.abs(x.err));
      const media = abs.reduce((a, b) => a + b, 0) / cs.length;
      const max = Math.max(...abs);
      const cob = cs.filter((x) => Math.abs(x.err) <= x.meia).length / cs.length;
      const meia = cs.reduce((a, x) => a + x.meia, 0) / cs.length;
      const zs = cs.map((x) => Math.abs(x.err) / Math.max(1e-9, x.dp)).sort((a, b) => a - b);
      const z95 = zs[Math.min(zs.length - 1, Math.floor(0.95 * zs.length))];
      linhas.push(
        `${tipo.padEnd(11)} ${alvo < 0 ? 'todas' : `${Math.round(alvo * 100)}%`.padStart(5)} ${String(cs.length).padStart(4)}  ${fmt(media)}     ${fmt(max)}   ${fmt(100 * cob, 1)}%    ${fmt(meia)}   ${fmt(z95)}`,
      );
      if (alvo < 0 && cob < 0.95) falhas.push(`${titulo} · ${tipo}: cobertura ${(100 * cob).toFixed(1)}% < 95%`);
      if (alvo === 0.3 && media > 1.5) falhas.push(`${titulo} · ${tipo}: erro médio em 30% = ${media.toFixed(2)} p.p. > 1,5`);
    }
  }
  const piores = [...casos].sort((a, b) => Math.abs(b.err) / b.meia - Math.abs(a.err) / a.meia).slice(0, 5);
  linhas.push('piores (|erro|/meia):', ...piores.map((x) => `  ${x.tipo} ${x.nome} ${x.cen} ${Math.round(x.alvo * 100)}% f=${x.f.toFixed(3)} erro ${x.err.toFixed(2)} meia ${x.meia.toFixed(2)}`));
  return linhas.join('\n');
}

describe('calibração da projeção em noites simuladas', () => {
  it('cobertura ≥ 95% e erro médio em 30% ≤ 1,5 p.p. (Presidente BR, Presidente por UF e governadores; motor e fonte TSE)', { timeout: 120_000 }, () => {
    const pontos = CENARIOS.flatMap((c) => pontosDoCenario(c));
    const falhas: string[] = [];
    const motor = pontos.map((p) => avalia(p)).filter((x): x is Caso => x !== null);
    // fonte TSE: municípios sem seções fora do cache e parte dos começados também (o total oficial da UF ancora). Com a
    // trava de cobertura (LIMIAR_COBERTURA_CACHE), UF/governador só entram com o cache cobrindo ≥ 90% do apurado; com o
    // cache ralo (15%, início da noite ou depois de uma pausa do TSE) só o Brasil aparece.
    const tse = pontos.map((p) => avalia(p, undefined, 0.95)).filter((x): x is Caso => x !== null);
    const tse80 = pontos.map((p) => avalia(p, undefined, 0.8)).filter((x): x is Caso => x !== null);
    const tse15 = pontos.map((p) => avalia(p, undefined, 0.15)).filter((x): x is Caso => x !== null);
    console.log(
      `\nProjeção — calibração (${CENARIOS.length} cenários)\n${tabela(motor, 'motor (todos os municípios)', falhas)}\n\n${tabela(tse, 'fonte TSE (95% dos começados em cache)', falhas)}\n\n${tabela(tse80, 'fonte TSE (80% dos começados em cache)', falhas)}\n\n${tabela(tse15, 'fonte TSE (15% dos começados em cache)', falhas)}`,
    );
    expect(motor.length).toBeGreaterThan(CENARIOS.length * 150);
    expect(tse.length).toBeGreaterThan(CENARIOS.length * 100);
    // cache ralo: a trava esconde quase toda UF e governador (só passa a UF cujos municípios lidos cobrem ≥ 90% do apurado,
    // como o DF, com 1 município); o Brasil continua
    expect(tse15.filter((x) => x.tipo !== 'pres-BR').length).toBeLessThan(tse80.filter((x) => x.tipo !== 'pres-BR').length);
    expect(tse15.some((x) => x.tipo === 'pres-BR')).toBe(true);
    expect(falhas).toEqual([]);
  });
});

/**
 * Medição da fonte TSE em cenários do dia (não roda por padrão: `PROJECAO_MEDIR=1 npx vitest run
 * src/engine/projecao-calibracao`). Cache dos municípios 100% / 30% / 0%, cache defasado (3% das seções atrás), lote
 * grande de uma vez (o cache parou em 0,2% e o oficial saltou), exterior primeiro; sem e com o acompanhamento da UF
 * (`-ab.json`). Para cada abrangência e fração: erro absoluto (todas as contas, exibidas ou não), cobertura da faixa e
 * quanto fica exibido (limiares + trava de cobertura do cache).
 */
describe.skipIf(!process.env.PROJECAO_MEDIR)('medição da fonte TSE (cenários do dia)', () => {
  it('imprime a tabela', { timeout: 600_000 }, async () => {
    const { avaliaBruto } = await import('./tests/projecao-harness');
    const FR = [0.1, 0.15, 0.2, 0.3, 0.5] as const;
    const cens = CENARIOS;
    const normal = cens.flatMap((c) => pontosDoCenario(c, { fracoes: FR, antes: (k, n) => k - 0.03 * n }));
    const salto = cens.flatMap((c) => pontosDoCenario(c, { fracoes: FR, antes: (_k, n) => 0.002 * n }));
    const exterior = cens.flatMap((c) => pontosDoCenario(c, { fracoes: FR, ordem: 'exterior-primeiro' })).filter((p) => p.tipo === 'pres-BR');
    type Modo = { nome: string; pts: typeof normal; tse?: Parameters<typeof avaliaBruto>[2] };
    const modos: Modo[] = [];
    for (const ab of [false, true]) {
      const s = ab ? ' + ab' : '';
      modos.push(
        { nome: `cache 100%${s}`, pts: normal, tse: { cache: 1, ab } },
        { nome: `cache 30%${s}`, pts: normal, tse: { cache: 0.3, ab } },
        { nome: `cache 0%${s}`, pts: normal, tse: { cache: 0, ab } },
        { nome: `cache 100% defasado 3%${s}`, pts: normal, tse: { cache: 1, defasado: true, ab } },
        { nome: `lote grande (cache parou em 0,2%)${s}`, pts: salto, tse: { cache: 1, defasado: true, ab } },
        { nome: `exterior primeiro, cache 0%${s}`, pts: exterior, tse: { cache: 0, ab } },
      );
    }
    const linhas: string[] = ['modo | abrangência | fração | n | exibida | erro médio | erro p95 | erro máx | cobertura (todas) | cobertura (exibidas) | meia média'];
    for (const md of modos) {
      const rs = md.pts.map((p) => avaliaBruto(p, undefined, md.tse));
      for (const tipo of ['pres-BR', 'pres-UF', 'gov'] as Tipo[]) {
        for (const alvo of FR) {
          const sel = rs.filter((r, i) => r.caso && md.pts[i].tipo === tipo && md.pts[i].alvo === alvo);
          if (!sel.length) continue;
          const abs = sel.map((r) => Math.abs(r.caso!.err)).sort((a, b) => a - b);
          const exib = sel.filter((r) => r.liberada && !r.travaCache);
          const cob = (xs: typeof sel) => (xs.length ? `${((100 * xs.filter((r) => Math.abs(r.caso!.err) <= r.caso!.meia).length) / xs.length).toFixed(1)}%` : '—');
          linhas.push(
            [
              md.nome,
              tipo,
              `${Math.round(alvo * 100)}%`,
              sel.length,
              `${((100 * exib.length) / sel.length).toFixed(0)}%`,
              (abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2),
              abs[Math.min(abs.length - 1, Math.floor(0.95 * abs.length))].toFixed(2),
              abs[abs.length - 1].toFixed(2),
              cob(sel),
              cob(exib),
              (sel.reduce((a, r) => a + r.caso!.meia, 0) / sel.length).toFixed(2),
            ].join(' | '),
          );
        }
      }
    }
    console.log(`\n${linhas.join('\n')}`);
  });
});
