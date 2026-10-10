/**
 * Cartão de compartilhamento de uma curiosidade (miolo sobre a moldura `CartaoBase` do kit de compartilhamento).
 * Desenhado em px reais nos 3 formatos (x 1200×675 · feed 1080×1350 · story 1080×1920); `k` escala as medidas.
 *
 * Neutralidade: fatos dos finalistas mostram os DOIS lados com o mesmo peso, na ordem da urna, cada um com a sua cor
 * de identificação (Lula vermelho, Flávio Bolsonaro azul — CORES_IDENTIDADE via `corFinalista`).
 * Números reais do 1º turno (nunca simulados) e sem fotos: só nome, número na urna e a cor do candidato.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Curiosidade, CuriosidadesDataset, FinalistaCuriosidade, LadoCuriosidade } from '@/shared/curiosidades';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { CartaoBase, SeloOficial, useCartao, type FormatoCartao } from '@/app/components/share';
import { ICONE_TEMA, corFinalista, fmtValor, nivelTamanho, rotuloTema } from './formato';

export interface CartaoCuriosidadeProps {
  fato: Curiosidade;
  finalistas: CuriosidadesDataset['finalistas'];
  formato: FormatoCartao;
}

export function CartaoCuriosidade({ fato, finalistas, formato }: CartaoCuriosidadeProps) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Curiosidades do 1º turno"
      selo={<SeloOficial>Dados oficiais · TSE</SeloOficial>}
      caminho="/curiosidades"
      instante={null}
      fonte="Fonte: TSE · 1º turno, 4 out. 2026"
      brilho={fato.par ? [corFinalista(finalistas.a), corFinalista(finalistas.b)] : 'marca'}
    >
      <Miolo fato={fato} finalistas={finalistas} />
    </CartaoBase>
  );
}

const TAM_NUMERO = [150, 128, 108, 92] as const;
const ALTURA_LINHA = 1.38;

/**
 * Ajuste ao espaço, sem cortar frase: o miolo tenta o contexto INTEIRO; se transbordar (título longo, nomes que
 * quebram, fontes carregando), reduz a escala até 80%; se ainda não couber, tira o contexto (nunca mostra frase pela
 * metade, que poderia distorcer o fato) e volta a reduzir só se preciso. Em layout effect (antes da pintura): a prévia e
 * o PNG já saem ajustados.
 */
function useAjuste(comContexto: boolean, chave: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontes, setFontes] = useState(0);
  const id = `${chave}:${comContexto}:${fontes}`;
  const [st, setSt] = useState({ contexto: comContexto, escala: 1, id });
  if (st.id !== id) setSt({ contexto: comContexto, escala: 1, id });
  useEffect(() => {
    let vivo = true;
    document.fonts?.ready.then(() => vivo && setFontes((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.scrollHeight <= el.clientHeight + 1) return;
    setSt((x) => {
      if (x.contexto && x.escala > 0.8) return { ...x, escala: Math.round((x.escala - 0.05) * 100) / 100 };
      if (x.contexto) return { ...x, contexto: false, escala: 1 };
      if (x.escala > 0.7) return { ...x, escala: Math.round((x.escala - 0.05) * 100) / 100 };
      return x;
    });
  });
  return { ref, contexto: st.contexto, escala: st.escala };
}

function Miolo({ fato, finalistas }: Omit<CartaoCuriosidadeProps, 'formato'>) {
  const { k: k0, retrato, formato } = useCartao();
  const soPar = !fato.destaque && !!fato.par;
  const comPar = !!fato.par;
  const destaqueEPar = !!fato.destaque && comPar;
  const valor = fato.destaque ? fmtValor(fato.destaque) : '';
  const tamNum = TAM_NUMERO[nivelTamanho(valor)] * (comPar ? 0.82 : 1);
  // Municípios citados, sem repetir (seções viram o município: "Montes Altos (MA) · zona 103…" → "Montes Altos (MA)").
  const lugares = [...new Set(fato.lugares.filter((l) => l.nome !== 'Brasil' && l.nome !== 'Exterior').map((l) => l.nome.split(' · ')[0]))].slice(0, 2).join(' · ');
  // 16:9 com número E par: não cabe contexto — o lugar vai junto do número.
  const { ref, contexto, escala } = useAjuste(retrato || !destaqueEPar, `${fato.id}:${formato}`);
  const k = k0 * escala;
  const fonteContexto = (retrato ? 32 : 23) * k;

  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden" style={{ gap: (retrato ? 34 : 18) * k, paddingTop: 16 * k, paddingBottom: 16 * k }}>
      <div className="flex shrink-0 items-center font-semibold uppercase text-brand-fg" style={{ gap: 10 * k, fontSize: 17 * k, letterSpacing: '0.16em' }}>
        <Icon name={ICONE_TEMA[fato.tema]} size={Math.round(22 * k)} />
        {rotuloTema(fato.tema)}
      </div>

      <div className="shrink-0 text-balance font-display font-semibold leading-[1.04] tracking-[-0.03em] text-fg" style={{ fontSize: (retrato ? 64 : soPar ? 50 : 44) * k }}>
        {fato.titulo}
      </div>

      {fato.destaque ? (
        <div className={cn('flex min-w-0 shrink-0', retrato ? 'flex-col' : 'flex-wrap items-baseline')} style={{ columnGap: 22 * k, rowGap: 6 * k }}>
          <span className="num whitespace-nowrap font-display font-semibold leading-[0.9] tracking-[-0.03em] text-brand-fg" style={{ fontSize: tamNum * k }}>
            {valor}
          </span>
          {fato.destaque.unidade ? (
            <span className="font-semibold leading-tight text-fg" style={{ fontSize: (retrato ? 38 : 30) * k, maxWidth: retrato ? undefined : 560 * k }}>
              {fato.destaque.unidade}
              {destaqueEPar && !retrato && lugares ? (
                <span className="block font-medium text-fg-muted" style={{ fontSize: 22 * k, marginTop: 4 * k }}>
                  {lugares}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {fato.par ? (
        <div className="grid shrink-0 grid-cols-2" style={{ columnGap: (retrato ? 28 : 22) * k }}>
          <Lado lado={fato.par.a} fin={finalistas.a} compacto={!soPar} k={k} />
          <Lado lado={fato.par.b} fin={finalistas.b} compacto={!soPar} k={k} />
        </div>
      ) : null}

      {contexto ? (
        <p className="shrink-0 text-pretty text-fg-muted" style={{ fontSize: fonteContexto, lineHeight: ALTURA_LINHA }}>
          {fato.contexto}
        </p>
      ) : null}

      {retrato && lugares ? (
        <div className="flex shrink-0 items-center font-semibold text-fg" style={{ gap: 12 * k, fontSize: 28 * k }}>
          <Icon name="pin" size={Math.round(30 * k)} className="shrink-0 text-brand-fg" />
          <span className="min-w-0 leading-tight">{lugares}</span>
        </div>
      ) : null}
    </div>
  );
}


/** Respiro lateral da moldura por formato (o mesmo do CartaoBase), para limitar o número à largura da coluna. */
const PAD_X = { x: 56, feed: 72, story: 80 } as const;

function Lado({ lado, fin, compacto, k }: { lado: LadoCuriosidade; fin: FinalistaCuriosidade; compacto: boolean; k: number }) {
  const { retrato, w, formato } = useCartao();
  const cor = corSlot(corFinalista(fin));
  const s = { barra: cor.bg, texto: cor.text, caixa: cn(cor.borderSoft, cor.bgFaint) };
  const v = fmtValor(lado.valor);
  const base = (compacto ? 66 : TAM_NUMERO[nivelTamanho(v)] * 0.78) * (retrato ? 1.1 : 1) * k;
  // Largura útil da coluna (metade do miolo, menos respiros) ÷ largura média de um algarismo (~0,6 em).
  const coluna = (w - 2 * PAD_X[formato]) / 2 - 60 * k;
  const tam = Math.min(base, coluna / (Math.max(1, v.length) * 0.6));
  return (
    // subgrid: nome, número e rótulo na mesma altura nos dois lados, mesmo se um nome quebrar
    <div
      className={cn('relative row-span-3 grid min-w-0 grid-rows-subgrid content-start overflow-hidden border', s.caixa)}
      style={{ borderRadius: 22 * k, borderWidth: Math.max(2, Math.round(2 * k)), padding: `${(compacto ? 16 : 22) * k}px ${22 * k}px` }}
    >
      <div className={cn('absolute inset-x-0 top-0', s.barra)} style={{ height: 7 * k }} />
      <div className="flex min-w-0 items-center font-semibold text-fg" style={{ gap: 10 * k, fontSize: (retrato ? 30 : 24) * k }}>
        <span className="min-w-0 break-words leading-tight">{fin.nomeUrna}</span>
        <span className="num shrink-0 rounded-full bg-surface-3 text-fg-muted" style={{ fontSize: (retrato ? 20 : 16) * k, padding: `${3 * k}px ${10 * k}px` }}>
          {fin.numero}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline" style={{ columnGap: 10 * k, marginTop: 6 * k }}>
        <span className={cn('num whitespace-nowrap font-display font-semibold leading-none tracking-[-0.03em]', s.texto)} style={{ fontSize: tam }}>
          {v}
        </span>
        {lado.valor.unidade && lado.valor.formato === 'int' ? (
          <span className="font-semibold text-fg-muted" style={{ fontSize: (retrato ? 28 : 22) * k }}>
            {lado.valor.unidade}
          </span>
        ) : null}
      </div>
      <div className="font-medium leading-snug text-fg-muted" style={{ fontSize: (retrato ? 26 : 20) * k, marginTop: 8 * k }}>
        {lado.valor.formato === 'pct' && lado.valor.unidade ? `${lado.valor.unidade} · ${lado.rotulo}` : lado.rotulo}
      </div>
    </div>
  );
}
