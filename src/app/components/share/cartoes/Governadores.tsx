/**
 * Cartão das 7 disputas de governador no 2º turno: o placar de cada uma (nomes na ordem da urna, % dos válidos na cor
 * do slot, barra com a marca dos 50%, % de seções totalizadas e o selo de resultado definido). Antes do dia 25, o
 * 1º turno oficial dessas UFs (com os demais candidatos). Sem fotos: é uma grade de números.
 */
import type { Race, Summary, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import type { ButtonSize, ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { BotaoCompartilhar } from '../BotaoCompartilhar';
import { CartaoBase, SeloOficial, useCartao } from '../CartaoBase';
import { hashtags, textoGovernadores } from '../textos';
import type { FormatoCartao } from '../tipos';
import { BarraDuelo, RotuloCartao } from './partes';

export interface DisputaGov {
  uf: UF;
  race: Race;
  resumo: Summary;
}

export interface CartaoGovernadoresProps {
  formato: FormatoCartao;
  itens: DisputaGov[];
  simulado?: boolean;
  /** 1º turno oficial (antes do dia 25). */
  t1?: boolean;
  caminho: string;
}

export function CartaoGovernadores({ formato, itens, simulado, t1, caminho }: CartaoGovernadoresProps) {
  const ult = Math.max(0, ...itens.map((i) => i.resumo.ultimaAtualizacao ?? 0));
  return (
    <CartaoBase
      formato={formato}
      simulado={simulado && !t1}
      sobrancelha={t1 ? 'Governadores · 1º turno' : 'Governadores · 2º turno'}
      caminho={caminho}
      instante={t1 ? null : ult || undefined}
      rotuloInstante={t1 ? undefined : 'Dados de'}
      fonte={t1 ? 'Fonte: TSE · votação de 4 de outubro' : undefined}
      selo={t1 ? <SeloOficial>Resultado oficial</SeloOficial> : undefined}
    >
      <Miolo itens={itens} t1={t1} />
    </CartaoBase>
  );
}

function Celula({ d, t1 }: { d: DisputaGov; t1?: boolean }) {
  const { k: kBase, formato } = useCartao();
  // Mesma grade de tamanhos nos 3 formatos (escala do cartão); o story ganha um pouco mais.
  const k = kBase * (formato === 'story' ? 1.18 : formato === 'feed' ? 0.94 : 1);
  const tem = validos(d.resumo) > 0;
  const fin = d.race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  const m = margem(d.resumo);
  const eleito = !t1 && d.resumo.eleito !== null ? d.race.candidatos[d.resumo.eleito] : null;
  return (
    <div className="flex min-w-0 flex-col rounded-[0.9em] border border-line/[2] bg-surface/75" style={{ padding: `${12 * k}px ${14 * k}px`, fontSize: 16 * k }}>
      <div className="flex items-baseline justify-between" style={{ gap: 8 * k }}>
        <div className="min-w-0 truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: 19 * k }}>
          {UF_NOMES[d.uf]}
        </div>
        <div className="shrink-0 font-mono font-semibold text-fg-subtle" style={{ fontSize: 13 * k }}>
          {d.uf}
        </div>
      </div>
      <div className="flex flex-col" style={{ gap: 3 * k, marginTop: 8 * k }}>
        {fin.map(({ c, i }) => (
          <div key={i} className="flex items-baseline justify-between" style={{ gap: 10 * k }}>
            <span className={cn('min-w-0 truncate', m.lider === i && tem ? 'font-semibold text-fg' : 'text-fg-muted')} style={{ fontSize: 14.5 * k }}>
              {c.nomeUrna}
              {eleito === c ? <Icon name="check-circulo" size={14 * k} strokeWidth={2.4} className={cn('ml-[0.3em] inline align-[-0.12em]', corSlot(c.cor).text)} /> : null}
            </span>
            <span className={cn('num shrink-0 font-display font-semibold leading-none', tem ? corSlot(c.cor).textDisplay : 'text-fg-subtle')} style={{ fontSize: 24 * k }}>
              {fmtPct(pctValidos(d.resumo, i), 1)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 9 * k }}>
        <BarraDuelo race={d.race} votos={d.resumo.votos} alto={8 * k} rotulo={false} />
      </div>
      <div className="num text-fg-muted" style={{ fontSize: 12.5 * k, marginTop: 8 * k }}>
        {t1 ? 'Resultado final' : eleito ? 'Resultado definido' : `${fmtPct(pctTotalizadas(d.resumo))} das seções`}
      </div>
    </div>
  );
}

function Miolo({ itens, t1 }: { itens: DisputaGov[]; t1?: boolean }) {
  const { k, formato } = useCartao();
  const x = formato === 'x';
  const definidas = itens.filter((i) => i.resumo.eleito !== null).length;
  const secoes = itens.reduce((s, i) => s + i.resumo.secoes, 0);
  const tot = itens.reduce((s, i) => s + i.resumo.secoesTotalizadas, 0);
  return (
    <div className="flex flex-1 flex-col justify-center" style={{ gap: (x ? 12 : 30) * k, paddingTop: (x ? 10 : 24) * k, paddingBottom: (x ? 10 : 20) * k }}>
      <div className={cn(x && 'flex items-end justify-between')} style={{ gap: 20 * k }}>
        <div className="font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (x ? 34 : formato === 'story' ? 52 : 50) * k }}>
          Governador em {itens.length} estados
        </div>
        <RotuloCartao style={{ marginTop: x ? 0 : 12 * k }}>{t1 ? 'Como foi o 1º turno' : '2º turno · 25 de outubro'}</RotuloCartao>
      </div>
      <div className={cn('grid', x ? 'grid-cols-4' : formato === 'feed' ? 'grid-cols-3' : 'grid-cols-2')} style={{ gap: (x ? 10 : 16) * k }}>
        {itens.map((d) => (
          <Celula key={d.uf} d={d} t1={t1} />
        ))}
        {!t1 ? (
          <div className="flex min-w-0 flex-col justify-center rounded-[0.9em] bg-brand/10" style={{ padding: `${(x ? 12 : 18) * k}px ${(x ? 14 : 20) * k}px` }}>
            <RotuloCartao>Nos 7 estados</RotuloCartao>
            <div className="num font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: (x ? 34 : 46) * k, marginTop: 10 * k }}>
              {fmtPct(pctTotalizadas({ secoes, secoesTotalizadas: tot }))}
            </div>
            <div className="text-fg-muted" style={{ fontSize: (x ? 13 : 16) * k, marginTop: 6 * k }}>
              das seções totalizadas
            </div>
            <div className="num font-semibold text-fg" style={{ fontSize: (x ? 15 : 19) * k, marginTop: 10 * k }}>
              {definidas} de {itens.length} definidas
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col justify-center rounded-[0.9em] bg-brand/10" style={{ padding: `${(x ? 12 : 18) * k}px ${(x ? 14 : 20) * k}px` }}>
            <RotuloCartao>2º turno</RotuloCartao>
            <div className="font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: (x ? 26 : 34) * k, marginTop: 10 * k }}>
              25 de outubro
            </div>
            <div className="text-fg-muted" style={{ fontSize: (x ? 13 : 16) * k, marginTop: 6 * k }}>
              Apuração ao vivo a partir das 17h (Brasília)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface BotaoCompartilharGovernadoresProps {
  itens: DisputaGov[];
  simulado?: boolean;
  t1?: boolean;
  caminho?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  soIcone?: boolean;
  carregando?: boolean;
}

export function BotaoCompartilharGovernadores({ itens, simulado, t1, caminho = '/governadores', label = 'Compartilhar', carregando, ...botao }: BotaoCompartilharGovernadoresProps) {
  const secoes = itens.reduce((s, i) => s + i.resumo.secoes, 0);
  const tot = itens.reduce((s, i) => s + i.resumo.secoesTotalizadas, 0);
  const texto = textoGovernadores(
    itens.map((i) => {
      const m = margem(i.resumo);
      return { uf: i.uf, dif: validos(i.resumo) > 0 ? (m.lider === null ? 0 : m.pp) : null, definida: i.resumo.eleito !== null };
    }),
    { simulado, t1, pst: secoes ? pctTotalizadas({ secoes, secoesTotalizadas: tot }) : undefined },
  );
  return (
    <BotaoCompartilhar
      {...botao}
      label={label}
      titulo="Compartilhar · Governadores"
      descricao={t1 ? 'As 7 disputas do 2º turno · resultado oficial do 1º turno.' : 'As 7 disputas de governador no 2º turno.'}
      texto={texto}
      caminho={caminho}
      hashtags={t1 ? hashtags('primeiroTurno') : hashtags('governador')}
      nomeArquivo={t1 ? 'sintonia-governadores-1turno' : 'sintonia-governadores'}
      simulado={simulado && !t1}
      carregando={carregando}
      cartao={(f) => <CartaoGovernadores formato={f} itens={itens} simulado={simulado} t1={t1} caminho={caminho} />}
    />
  );
}
