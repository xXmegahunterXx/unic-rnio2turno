/**
 * "Pesquisas × resultado" (depois do resultado OFICIAL do TSE: fonte 'tse', sem simulação, fase 'encerrada'): a última
 * pesquisa de cada instituto ao lado do resultado oficial da disputa, candidato a candidato, com a diferença em pontos
 * (resultado − pesquisa). Só com os votos VÁLIDOS que o instituto divulgou — o Sintonia não calcula válidos a partir dos
 * totais. Textos descritivos, sem adjetivo, sem ranking de institutos ("acertou", "errou" etc. não aparecem).
 */
import { useNacional, useRace } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtPP, fmtPct } from '@/shared/format';
import { compararComResultado, fmtPctPesquisa, fmtPeriodoColeta, ultimaPorInstituto, type Pesquisa } from '@/shared/pesquisas';
import { LinhaObrigatoria, type CandidatoPesquisa } from './pecas';

export function PesquisasResultado({ pesquisas, cargo, cands }: { pesquisas: Pesquisa[]; cargo: string; cands: CandidatoPesquisa[] }) {
  const q = useNacional(cargo);
  const race = useRace(cargo);
  const snap = q.data && q.data.race === cargo ? q.data : undefined;
  const r = snap?.resumo;
  const concluida = !!r && (r.status === 'encerrada' || pctTotalizadas(r) >= 100);
  const ultimas = ultimaPorInstituto(pesquisas, cargo);
  if (!snap || !r || !race) return <p className="mt-6 text-[14px] text-fg-muted">Carregando o resultado oficial…</p>;
  if (!concluida) {
    return <p className="mt-6 text-[14px] text-fg-muted">A comparação aparece quando o TSE concluir a apuração desta disputa.</p>;
  }
  // % dos válidos oficiais por número de urna (regra do TSE, calc.ts)
  const resultado: Record<number, number> = {};
  race.candidatos.forEach((c, i) => {
    if (!c.agregado) resultado[c.numero] = pctValidos(r, i);
  });
  return (
    <section aria-labelledby="pesq-resultado" className="mt-6" data-sem-anuncio-fixo>
      <h2 id="pesq-resultado" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
        Última pesquisa de cada instituto × resultado oficial
      </h2>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">
        Resultado oficial do TSE em votos válidos. De cada instituto, a pesquisa mais recente publicada aqui; a comparação usa os votos válidos que o próprio
        instituto divulgou. Diferença = resultado − pesquisa, em pontos percentuais.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        {cands.map((c, i) => (
          <div key={c.numero} className={cn('min-w-0', i === 1 && 'text-right')}>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Resultado oficial · TSE</div>
            <div className="mt-1 truncate font-display text-[16px] font-semibold text-fg">{c.nome}</div>
            <div className={cn('num font-display text-[36px] font-semibold leading-none tracking-[-0.04em] sm:text-[44px]', corSlot(c.cor).textDisplay)}>
              {resultado[c.numero] !== undefined ? fmtPct(resultado[c.numero]) : '–'}
            </div>
          </div>
        ))}
      </div>
      {ultimas.length === 0 ? (
        <p className="mt-4 text-[14px] text-fg-muted">Nenhuma pesquisa desta disputa foi publicada aqui.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {ultimas.map((p) => {
            const linhas = compararComResultado(p, resultado);
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-display text-[17px] font-semibold text-fg">{p.instituto}</span>
                  <span className="num text-[12.5px] text-fg-muted">coleta {fmtPeriodoColeta(p.coletaInicio, p.coletaFim)}</span>
                </div>
                {linhas ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[300px] text-[13.5px]">
                      <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                        <tr>
                          <th className="pb-1 pr-2 font-semibold">Candidato</th>
                          <th className="pb-1 pr-2 text-right font-semibold">Pesquisa (válidos)</th>
                          <th className="pb-1 pr-2 text-right font-semibold">Resultado</th>
                          <th className="pb-1 text-right font-semibold">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((l) => {
                          const c = cands.find((x) => x.numero === l.numero);
                          return (
                            <tr key={l.numero} className="border-t border-line">
                              <td className="py-1.5 pr-2">
                                <span className="flex items-center gap-2 text-fg">
                                  <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', c ? corSlot(c.cor).bg : 'bg-cand-outros')} />
                                  {c?.nome ?? l.numero}
                                </span>
                              </td>
                              <td className="num py-1.5 pr-2 text-right text-fg">{fmtPctPesquisa(l.pesquisa)}</td>
                              <td className="num py-1.5 pr-2 text-right text-fg">{fmtPct(l.resultado)}</td>
                              <td className="num py-1.5 text-right font-semibold text-fg">{l.diferencaPp === 0 ? '0,0 p.p.' : fmtPP(l.diferencaPp)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-fg-muted">
                    Votos totais: {cands.map((c) => `${c.nome} ${fmtPctPesquisa(p.totais[String(c.numero)])}`).join(' · ')}. O instituto não divulgou votos
                    válidos nesta pesquisa; a comparação com o resultado (em válidos) não é feita.
                  </p>
                )}
                <LinhaObrigatoria p={p} className="mt-3 text-[12px]" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
