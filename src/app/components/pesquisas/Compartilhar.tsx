/**
 * Cartão de compartilhar de uma pesquisa registrada (kit de compartilhar: x 1200×675, feed 1080×1350, story 1080×1920),
 * no mesmo desenho do cartão do servidor (src/server/og-pesquisa.ts): os dois candidatos na ordem da urna com os
 * percentuais grandes (o mesmo corpo para os dois), votos válidos e brancos/indecisos quando divulgados, e — NO RODAPÉ —
 * TODAS as informações obrigatórias (Res. TSE 23.600/2019, art. 10) e o aviso "Pesquisa não é resultado". Sem anúncio
 * (nenhuma faixa "Oferecimento"), sem foto. No dia da votação (0h–19h de 25/10) o sheet troca tudo pelo convite da
 * apuração (`trocaPeloConvite`: o conteúdo NÃO é marcado `generico`).
 */
import { BotaoCompartilhar } from '@/app/components/share/BotaoCompartilhar';
import { CartaoBase, SeloOficial, useCartao } from '@/app/components/share/CartaoBase';
import type { FormatoCartao } from '@/app/components/share/tipos';
import { siteExibicao } from '@/app/lib/share';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import type { ButtonSize } from '@/app/ui/Button';
import {
  AVISO_PESQUISAS,
  CHAVE_BRANCOS_NULOS,
  CHAVE_INDECISOS,
  fmtDataPesquisa,
  fmtMargem,
  fmtPctPesquisa,
  fmtPeriodoColeta,
  informacoesObrigatorias,
  numerosDaPesquisa,
  rotuloCargo,
  rotuloCargoCurto,
  type Pesquisa,
} from '@/shared/pesquisas';
import { fmtDecimal, fmtInt } from '@/shared/format';
import { useCandidatosPesquisa, type CandidatoPesquisa } from './pecas';
import { textoPesquisa } from './textos';

export { textoPesquisa };

/** Largura aproximada (em "em") de um percentual no display (mesma conta do cartão do servidor). */
const largEm = (t: string) => [...t].reduce((u, ch) => u + (ch === '%' ? 0.5 : ch === ',' ? 0.26 : 0.6), 0);

function Miolo({ p, cands }: { p: Pesquisa; cands: CandidatoPesquisa[] }) {
  const { k, w, retrato, formato } = useCartao();
  const vals = cands.map((c) => p.totais[String(c.numero)]);
  const textos = vals.map((v) => (v === undefined ? '–' : fmtPctPesquisa(v).replace('%', '')));
  // o MESMO corpo para os dois percentuais (simetria): o maior que cabe na coluna
  const coluna = (w - (retrato ? 160 : 112) * (formato === 'story' ? 1 : 1)) / 2 - 40 * k;
  const base = (retrato ? 176 : 150) * (formato === 'story' ? 1.12 : 1);
  const fs = Math.floor(Math.min(base, (coluna * 0.92) / Math.max(...textos.map((t) => largEm(`${t}%`)))));
  const bn = p.totais[CHAVE_BRANCOS_NULOS];
  const ind = p.totais[CHAVE_INDECISOS];
  return (
    <div className="flex h-full flex-col" style={{ paddingTop: (retrato ? 22 : 10) * k }}>
      <div className="font-semibold uppercase text-brand-fg" style={{ fontSize: 15 * k, letterSpacing: '0.14em' }}>
        {rotuloCargo(p.cargo)} · divulgada em <span className="num">{fmtDataPesquisa(p.divulgadaEm, true)}</span> · votos totais
      </div>
      {retrato ? <div className="flex-1" /> : null}
      <div className="grid grid-cols-2" style={{ gap: 32 * k, marginTop: (retrato ? 0 : 18) * k }}>
        {cands.map((c, i) => {
          const s = corSlot(c.cor);
          return (
            <div key={c.numero} className={cn('flex min-w-0 flex-col', i === 1 && 'items-end text-right')}>
              <span className={cn('block rounded-full', s.bg)} style={{ width: 56 * k, height: 7 * k }} />
              <div className="font-display font-semibold leading-[1.08] tracking-[-0.02em] text-fg" style={{ fontSize: (c.nome.length > 20 ? 34 : 40) * k, marginTop: 12 * k }}>
                {c.nome}
              </div>
              {c.partido ? (
                <div className="num font-semibold text-fg-muted" style={{ fontSize: 18 * k, marginTop: 4 * k }}>
                  {c.partido} · {c.numero}
                </div>
              ) : null}
              <div className={cn('num font-display font-semibold leading-[0.9] tracking-[-0.045em]', s.textDisplay)} style={{ fontSize: fs, marginTop: 10 * k }}>
                {textos[i]}
                <span className="tracking-normal" style={{ fontSize: fs * 0.5, marginLeft: fs * 0.03 }}>
                  %
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-fg-muted" style={{ fontSize: 19 * k, marginTop: 18 * k, lineHeight: 1.4 }}>
        {p.validos ? (
          <div>
            Votos válidos: {cands.map((c) => `${c.nome} ${fmtPctPesquisa(p.validos![String(c.numero)])}`).join(' · ')}
          </div>
        ) : null}
        {bn !== undefined || ind !== undefined ? (
          <div>
            {[bn !== undefined ? `Branco, nulo ou nenhum: ${fmtPctPesquisa(bn)}` : '', ind !== undefined ? `Não sabem ou não responderam: ${fmtPctPesquisa(ind)}` : ''].filter(Boolean).join(' · ')}
          </div>
        ) : null}
      </div>
      <div className="flex-1" />
    </div>
  );
}

/** Rodapé: TODAS as informações obrigatórias + o aviso. */
function Rodape({ p }: { p: Pesquisa }) {
  const { k, retrato } = useCartao();
  const itens = informacoesObrigatorias(p);
  return (
    <div className="font-normal tracking-normal" style={{ fontSize: (retrato ? 17 : 13.5) * k, lineHeight: 1.38 }}>
      {retrato ? (
        <div className="grid" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 18 * k, rowGap: 2 * k }}>
          {itens.map((it) => (
            <div key={it.rotulo} className="contents">
              <span className="text-fg-subtle">{it.rotulo}</span>
              <span className="text-fg">{it.valor}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-fg">{itens.map((it) => `${it.rotulo}: ${it.valor}`).join(' · ')}</div>
      )}
      {/* informação que a Justiça Eleitoral mandou constar em toda divulgação desta pesquisa */}
      {p.aviso ? (
        <div className="font-semibold text-fg" style={{ marginTop: 6 * k }}>
          {p.aviso}
        </div>
      ) : null}
      <div className="text-fg-muted" style={{ marginTop: 6 * k, fontSize: (retrato ? 15 : 12.5) * k }}>
        {AVISO_PESQUISAS}
      </div>
    </div>
  );
}

export function CartaoPesquisaCompartilhar({ formato, p, cands }: { formato: FormatoCartao; p: Pesquisa; cands: CandidatoPesquisa[] }) {
  const site = siteExibicao();
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Pesquisa registrada · 2º turno"
      titulo={`Pesquisa ${p.instituto}`}
      selo={<SeloOficial>Registrada no TSE</SeloOficial>}
      brilho={[cands[0].cor, cands[1].cor]}
      instante={null}
      rodape={<Rodape p={p} />}
      fonte={site ? `${site}/pesquisas` : 'Sintonia · pesquisas'}
    >
      <Miolo p={p} cands={cands} />
    </CartaoBase>
  );
}

/** Botão "Compartilhar" de uma pesquisa (cartão nos 3 formatos + texto completo + link para ela). */
export function BotaoCompartilharPesquisa({ p, soIcone, size = 'sm', className }: { p: Pesquisa; soIcone?: boolean; size?: ButtonSize; className?: string }) {
  const cands = useCandidatosPesquisa(p.cargo, numerosDaPesquisa(p));
  return (
    <BotaoCompartilhar
      label="Compartilhar pesquisa"
      soIcone={soIcone}
      size={size}
      className={className}
      titulo="Compartilhar pesquisa"
      descricao={`${p.instituto} · registro ${p.registro}`}
      texto={textoPesquisa(p, cands)}
      caminho={`/pesquisas?p=${encodeURIComponent(p.id)}`}
      hashtags={[]}
      nomeArquivo={`sintonia-pesquisa-${p.registro.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`}
      cartao={(f) => <CartaoPesquisaCompartilhar formato={f} p={p} cands={cands} />}
    />
  );
}
