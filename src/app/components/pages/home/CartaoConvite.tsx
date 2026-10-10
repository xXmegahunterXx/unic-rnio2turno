/**
 * Cartão "Compartilhar o Sintonia" (convite): a data da apuração, quanto falta e o que dá para fazer no site.
 * Só calendário e produto — nenhum número de apuração e nenhum candidato —, então nunca precisa do selo de
 * simulação e é neutro por construção. Nos 3 formatos do kit (16:9, 4:5, 9:16), sobre o `CartaoBase`.
 */
import type { ReactNode } from 'react';
import { INICIO_APURACAO } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { CartaoBase, SeloOficial, useCartao, type FormatoCartao } from '@/app/components/share';
import { momentoApuracao, rotuloFaltam } from './textosHome';

export function CartaoConvite({ formato, agora }: { formato: FormatoCartao; agora: number }) {
  return (
    <CartaoBase
      formato={formato}
      brilho="marca"
      sobrancelha="Eleições 2026 · 2º turno"
      selo={<SeloOficial>Apartidário</SeloOficial>}
      caminho=""
      instante={null}
      fonte="Dados oficiais do TSE · sem enquetes"
    >
      <Miolo agora={agora} />
    </CartaoBase>
  );
}

function Miolo({ agora }: { agora: number }) {
  const { k, retrato, formato } = useCartao();
  const momento = momentoApuracao(agora, INICIO_APURACAO);
  const antes = momento === 'dias' || momento === 'amanha' || momento === 'hoje';
  const pilula = antes ? rotuloFaltam(agora) : momento === 'agora' ? 'Ao vivo agora' : 'Resultado e reprise da noite';
  const story = formato === 'story';

  const data = (
    <div className="min-w-0">
      <div className="font-semibold uppercase leading-none tracking-[0.16em] text-brand-fg" style={{ fontSize: 22 * k }}>
        Domingo
      </div>
      <div className="num font-display font-semibold leading-[0.86] tracking-[-0.055em] text-fg" style={{ fontSize: (retrato ? 220 : 168) * k, marginTop: 14 * k }}>
        25/10
      </div>
      <div className="font-display font-semibold leading-tight tracking-[-0.02em] text-fg" style={{ fontSize: (retrato ? 44 : 38) * k, marginTop: 14 * k }}>
        <span className="num">17h</span> <span className="text-fg-muted">· horário de Brasília</span>
      </div>
      <div
        className="inline-flex items-center rounded-full bg-brand-cta font-semibold text-brand-ink"
        style={{ fontSize: 26 * k, padding: `${10 * k}px ${24 * k}px`, marginTop: 24 * k, gap: 10 * k }}
      >
        <Icon name={antes ? 'relogio' : 'ao-vivo'} size={26 * k} />
        <span className="num">{pilula}</span>
      </div>
    </div>
  );

  const lista = (
    <ul className="flex min-w-0 flex-col" style={{ gap: (story ? 30 : retrato ? 22 : 18) * k }}>
      <Item icone="ao-vivo" titulo="Apuração ao vivo">
        do Brasil inteiro até a sua seção
      </Item>
      <Item icone="olho-fechado" titulo="Teste Cego">
        concorde ou discorde sem saber de quem é cada ideia
      </Item>
      <Item icone="urna" titulo="1º turno oficial">
        como votou sua cidade, zona e seção
      </Item>
    </ul>
  );

  if (!retrato) {
    return (
      <div className="grid flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center" style={{ gap: 48 * k, paddingTop: 18 * k, paddingBottom: 18 * k }}>
        {data}
        {lista}
      </div>
    );
  }
  return (
    <div className={cn('flex flex-1 flex-col', story ? 'justify-center' : 'justify-between')} style={{ gap: (story ? 90 : 40) * k, paddingTop: 36 * k, paddingBottom: 30 * k }}>
      {data}
      {lista}
    </div>
  );
}

function Item({ icone, titulo, children }: { icone: IconName; titulo: string; children: ReactNode }) {
  const { k } = useCartao();
  return (
    <li className="flex items-center" style={{ gap: 20 * k }}>
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[0.32em] border border-brand/30 bg-brand/15 text-brand-fg"
        style={{ width: 64 * k, height: 64 * k, fontSize: 64 * k }}
      >
        <Icon name={icone} size={32 * k} />
      </span>
      <span className="min-w-0">
        <span className="block font-display font-semibold leading-tight tracking-[-0.02em] text-fg" style={{ fontSize: 30 * k }}>
          {titulo}
        </span>
        <span className="block leading-snug text-fg-muted" style={{ fontSize: 21 * k, marginTop: 4 * k }}>
          {children}
        </span>
      </span>
    </li>
  );
}
