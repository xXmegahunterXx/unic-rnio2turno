/**
 * "Quem vota aqui": perfil do eleitorado (perfil_eleitorado_2026, dados abertos do TSE) de um município — ou da UF
 * inteira quando `cod` não é dado. Pirâmide etária (mulheres à esquerda, homens à direita, barras NEUTRAS),
 * escolaridade e totais. Só dado agregado e público: nada sobre voto.
 *
 * Uso: <PerfilEleitorado uf="SP" cod="71072" nome="São Paulo" />  ·  na UF: <PerfilEleitorado uf="SP" nome="São Paulo" />
 */
import { useMemo } from 'react';
import type { PerfilAgregado } from '@/shared/dataset';
import type { UF } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { usePerfil } from '@/app/data/estatico';
import { cn } from '@/app/lib/cn';
import { Skeleton } from '@/app/ui/Skeleton';

/** Agrupa as faixas do TSE em blocos legíveis: 16–17, 18–20, 21–24 … 80–84, 85–89, 90+. */
function agrupar(faixas: string[], [f, m]: [number[], number[]]): { rotulo: string; f: number; m: number }[] {
  const grupos: { rotulo: string; idx: number[] }[] = [];
  const idxDe = (pred: (s: string) => boolean) => faixas.map((s, i) => (pred(s) ? i : -1)).filter((i) => i >= 0);
  const idade = (s: string) => Number(s.match(/\d+/)?.[0] ?? NaN);
  const g1617 = idxDe((s) => idade(s) <= 17);
  const g1820 = idxDe((s) => idade(s) >= 18 && idade(s) <= 20);
  const g90 = idxDe((s) => idade(s) >= 90);
  if (g1617.length) grupos.push({ rotulo: '16–17', idx: g1617 });
  if (g1820.length) grupos.push({ rotulo: '18–20', idx: g1820 });
  faixas.forEach((s, i) => {
    const a = idade(s);
    if (a >= 21 && a < 90) grupos.push({ rotulo: s.replace(/\s*a\s*/, '–'), idx: [i] });
  });
  if (g90.length) grupos.push({ rotulo: '90+', idx: g90 });
  return grupos.map((g) => ({
    rotulo: g.rotulo,
    f: g.idx.reduce((a, i) => a + (f[i] ?? 0), 0),
    m: g.idx.reduce((a, i) => a + (m[i] ?? 0), 0),
  }));
}

export function PerfilEleitorado({ uf, cod, nome, className }: { uf: UF; cod?: string; nome: string; className?: string }) {
  const q = usePerfil(uf);
  const p: PerfilAgregado | undefined = q.data ? (cod ? q.data.municipios[cod] : q.data.total) : undefined;
  const faixas = q.data?.faixas ?? [];
  const esc = q.data?.escolaridade ?? [];

  const piramide = useMemo(() => (p ? agrupar(faixas, p.idade).reverse() : []), [p, faixas]);
  const somaF = p ? p.idade[0].reduce((a, b) => a + b, 0) : 0;
  const somaM = p ? p.idade[1].reduce((a, b) => a + b, 0) : 0;
  const maxLado = Math.max(1, ...piramide.flatMap((g) => [g.f, g.m]));
  const escTot = p ? p.escolaridade.reduce((a, b) => a + b, 0) : 0;
  const escLinhas = p
    ? esc
        .map((rotulo, i) => ({ rotulo, n: p.escolaridade[i] ?? 0 }))
        .filter((e) => !(e.rotulo === 'Não informado' && e.n / Math.max(1, escTot) < 0.005))
    : [];
  const escMax = Math.max(1, ...escLinhas.map((e) => e.n));
  const jovens = piramide.filter((g) => g.rotulo === '16–17' || g.rotulo === '18–20' || g.rotulo === '21–24').reduce((a, g) => a + g.f + g.m, 0);
  const idosos = piramide.filter((g) => /^([6-8][05]|90)/.test(g.rotulo)).reduce((a, g) => a + g.f + g.m, 0);
  const totIdade = somaF + somaM;

  if (q.isError) {
    return <p className={cn('rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-fg-muted', className)}>O perfil do eleitorado não está disponível agora.</p>;
  }
  if (!q.data) {
    return (
      <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', className)}>
        <Skeleton className="h-[420px] rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }
  if (!p) {
    return <p className={cn('rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-fg-muted', className)}>Sem perfil do eleitorado para {nome}.</p>;
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-12', className)}>
      {/* ------------------------------------------------ totais + pirâmide */}
      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 lg:col-span-7" aria-labelledby="perfil-idade">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Total rotulo="Eleitores" valor={fmtInt(p.eleitores)} />
          <Total rotulo="Mulheres" valor={fmtPct((somaF / Math.max(1, totIdade)) * 100, 1)} sub={fmtInt(somaF)} />
          <Total rotulo="Homens" valor={fmtPct((somaM / Math.max(1, totIdade)) * 100, 1)} sub={fmtInt(somaM)} />
          <Total rotulo="16 a 24 anos" valor={fmtPct((jovens / Math.max(1, totIdade)) * 100, 1)} sub={`60+: ${fmtPct((idosos / Math.max(1, totIdade)) * 100, 1)}`} />
        </dl>
        <h3 id="perfil-idade" className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
          Idade
        </h3>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] text-[11.5px] font-medium text-fg-muted">
          <span className="text-right">Mulheres</span>
          <span />
          <span>Homens</span>
        </div>
        <table className="mt-1 w-full border-separate border-spacing-y-[3px]">
          <caption className="sr-only">Eleitores por faixa etária e sexo {nome ? `em ${nome}` : ''}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Mulheres</th>
              <th scope="col">Faixa etária</th>
              <th scope="col">Homens</th>
            </tr>
          </thead>
          <tbody>
            {piramide.map((g) => (
              <tr key={g.rotulo} className="group">
                <td className="w-1/2 p-0">
                  <div className="flex justify-end">
                    <div
                      className="h-3.5 rounded-l-[4px] bg-fg/45 transition-colors group-hover:bg-fg/60"
                      style={{ width: `${(g.f / maxLado) * 100}%` }}
                      title={`Mulheres, ${g.rotulo}: ${fmtInt(g.f)}`}
                    />
                  </div>
                  <span className="sr-only">{fmtInt(g.f)}</span>
                </td>
                <th scope="row" className="num w-[3.25rem] whitespace-nowrap px-1 text-center text-[11px] font-medium text-fg-muted">
                  {g.rotulo}
                </th>
                <td className="w-1/2 p-0">
                  <div className="flex">
                    <div
                      className="h-3.5 rounded-r-[4px] bg-fg/25 transition-colors group-hover:bg-fg/40"
                      style={{ width: `${(g.m / maxLado) * 100}%` }}
                      title={`Homens, ${g.rotulo}: ${fmtInt(g.m)}`}
                    />
                  </div>
                  <span className="sr-only">{fmtInt(g.m)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.naoInformado > 0 ? (
          <p className="num mt-2 text-[11.5px] text-fg-subtle">Sexo não informado: {fmtInt(p.naoInformado)}.</p>
        ) : null}
      </section>

      {/* ------------------------------------------------ escolaridade */}
      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 lg:col-span-5" aria-labelledby="perfil-esc">
        <h3 id="perfil-esc" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
          Escolaridade declarada
        </h3>
        <ul className="mt-3 space-y-2.5">
          {escLinhas.map((e) => (
            <li key={e.rotulo}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate text-fg">{e.rotulo}</span>
                <span className="num shrink-0 text-fg-muted">
                  <span className="font-semibold text-fg">{fmtPct((e.n / Math.max(1, escTot)) * 100, 1)}</span> · {fmtInt(e.n)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-fg/40" style={{ width: `${(e.n / escMax) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {p.deficiencia || p.nomeSocial ? (
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
            {p.deficiencia ? <Total rotulo="Com deficiência" valor={fmtInt(p.deficiencia)} sub={fmtPct((p.deficiencia / Math.max(1, p.eleitores)) * 100, 1)} /> : null}
            {p.nomeSocial ? <Total rotulo="Com nome social" valor={fmtInt(p.nomeSocial)} /> : null}
          </dl>
        ) : null}
        <p className="mt-4 text-[11.5px] leading-snug text-fg-subtle">Cadastro eleitoral de 2026 (perfil do eleitorado, TSE). Dados agregados e públicos.</p>
      </section>
    </div>
  );
}

function Total({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{rotulo}</dt>
      <dd className="num mt-0.5 font-display text-[19px] font-semibold leading-tight text-fg">{valor}</dd>
      {sub ? <dd className="num truncate text-[11.5px] text-fg-muted">{sub}</dd> : null}
    </div>
  );
}
