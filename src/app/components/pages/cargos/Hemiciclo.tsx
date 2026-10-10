/**
 * Hemiciclo (SVG): uma bolinha por cadeira, em fileiras concêntricas, com os partidos em "fatias" da esquerda
 * para a direita NA ORDEM RECEBIDA (o chamador ordena por tamanho de bancada — nunca por espectro).
 * Cores por partido (`corPartido`: PT e PL nas cores de Lula e Flávio, demais em tons próprios); cadeiras sem resultado (ex.: AM em reprocessamento) com hachura.
 *
 * Interação: passar o mouse/tocar numa cadeira mostra a dica (partido e, quando houver, o nome do eleito);
 * clique abre a ficha. `destaque` esmaece os demais partidos (ligado à lista de bancadas).
 * Acessibilidade: o SVG é uma imagem com resumo; a lista de bancadas ao lado é a alternativa em texto.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { MapHatchPattern } from '@/app/components/apuracao/MapHatch';
import { useClickOutside } from '@/app/components/apuracao/MapHooks';
import { corPartido } from './partidos';

export interface Assento {
  id: string;
  partido: string;
  /** Nome do eleito (quando a cadeira corresponde a uma pessoa). */
  nome?: string;
  /** Linha extra da dica (ex.: "SP · 3.038.438 votos"). */
  sub?: string;
  /** Link da ficha. */
  href?: string;
  /** Cadeira sem resultado divulgado. */
  pendente?: boolean;
}

interface Pos {
  x: number;
  y: number;
  a: number;
}

const R0 = 0.4; // raio interno (fração do externo)

/**
 * Posições das N cadeiras, por fileira (de dentro para fora), cada fileira da esquerda para a direita. Puro.
 */
export function layoutLinhas(n: number): { linhas: Pos[][]; r: number } {
  if (n <= 0) return { linhas: [], r: 0 };
  let linhas = 1;
  let d = 0;
  let caps: number[] = [];
  for (; linhas < 40; linhas++) {
    d = (1 - R0) / linhas;
    caps = Array.from({ length: linhas }, (_, i) => Math.max(1, Math.floor((Math.PI * (R0 + d * (i + 0.5))) / d)));
    if (caps.reduce((a, b) => a + b, 0) >= n) break;
  }
  const porLinha = maiorResto(caps, n);
  const out: Pos[][] = porLinha.map((m, i) => {
    const rho = R0 + d * (i + 0.5);
    return Array.from({ length: m }, (_, k) => {
      const a = m === 1 ? Math.PI / 2 : Math.PI - (k * Math.PI) / (m - 1);
      return { x: rho * Math.cos(a), y: -rho * Math.sin(a), a };
    });
  });
  return { linhas: out, r: d * 0.4 };
}

/** Divide `total` proporcionalmente a `pesos` (maior resto), sem passar de `teto[i]` quando dado. */
function maiorResto(pesos: number[], total: number, teto?: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0 || total <= 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (p / soma) * total);
  const out = brutos.map((b, i) => Math.min(Math.floor(b), teto ? teto[i] : Infinity));
  let falta = total - out.reduce((a, b) => a + b, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let volta = 0; falta > 0 && volta < 4; volta++) {
    for (const [, i] of ordem) {
      if (falta <= 0) break;
      if (teto && out[i] >= teto[i]) continue;
      out[i]++;
      falta--;
    }
  }
  return out;
}

/**
 * Posição de cada cadeira (na ordem de `assentos`): cada partido ocupa a mesma "fatia" em todas as fileiras
 * (repartição proporcional fileira a fileira), o que mantém as bancadas contíguas mesmo com poucas cadeiras.
 */
export function posicionar(assentos: { partido: string; pendente?: boolean }[]): { pos: Pos[]; r: number } {
  const { linhas, r } = layoutLinhas(assentos.length);
  // grupos consecutivos (partido ou pendentes), na ordem recebida
  const grupos: { chave: string; idx: number[] }[] = [];
  assentos.forEach((a, i) => {
    const chave = a.pendente ? '__pendente' : a.partido;
    const g = grupos[grupos.length - 1];
    if (g && g.chave === chave) g.idx.push(i);
    else grupos.push({ chave, idx: [i] });
  });
  const resta = grupos.map((g) => g.idx.length);
  const usados = grupos.map(() => 0);
  const pos: Pos[] = new Array(assentos.length);
  // de fora para dentro: as fileiras maiores definem a fatia, as menores recebem o resto exato
  for (let li = linhas.length - 1; li >= 0; li--) {
    const linha = linhas[li];
    const cotas = li === 0 ? [...resta] : maiorResto(resta, linha.length, resta);
    let k = 0;
    cotas.forEach((q, gi) => {
      for (let j = 0; j < q; j++) {
        const g = grupos[gi];
        pos[g.idx[usados[gi]++]] = linha[k++];
      }
      resta[gi] -= q;
    });
  }
  return { pos, r };
}

const W = 1000;
const ESC = 470; // raio externo em unidades do viewBox
const TOPO = 10; // respiro acima da fileira externa

export interface HemicicloProps {
  assentos: Assento[];
  destaque?: string | null;
  onDestaque?: (partido: string | null) => void;
  /** Conteúdo central (ex.: total de cadeiras). */
  centro?: ReactNode;
  ariaLabel: string;
  className?: string;
}

export function Hemiciclo({ assentos, destaque, onDestaque, centro, ariaLabel, className }: HemicicloProps) {
  const navigate = useNavigate();
  const estrutura = assentos.map((a) => (a.pendente ? '_' : a.partido)).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { pos, r } = useMemo(() => posicionar(assentos), [estrutura]);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const [dica, setDica] = useState<{ i: number; fixa: boolean } | null>(null);
  useClickOutside(boxEl, !!dica?.fixa, () => {
    setDica(null);
    onDestaque?.(null);
  });
  const toque = useRef(false);

  // poucas cadeiras (ex.: 8 do AM) não viram bolas gigantes
  const raio = Math.min(30, Math.max(2.5, r * ESC));
  const cy = ESC + TOPO;
  const H = cy + raio + 6;
  const ativo = dica ? assentos[dica.i] : null;
  const pAtivo = dica ? pos[dica.i] : null;

  function sobre(i: number) {
    if (toque.current) return;
    setDica({ i, fixa: false });
    onDestaque?.(assentos[i].partido);
  }
  function clique(i: number) {
    const a = assentos[i];
    if (toque.current && (!dica || dica.i !== i)) {
      setDica({ i, fixa: true });
      onDestaque?.(a.partido);
      return;
    }
    if (a.href) navigate(a.href);
  }

  return (
    <div ref={setBoxEl} className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="block h-auto w-full touch-manipulation select-none"
        onPointerDown={(e) => {
          toque.current = e.pointerType === 'touch';
        }}
        onMouseLeave={() => {
          if (dica?.fixa) return;
          setDica(null);
          onDestaque?.(null);
        }}
      >
        <defs>
          <MapHatchPattern id="hemiciclo-pendente" escala={0.9} />
        </defs>
        <g transform={`translate(${W / 2} ${cy})`}>
          {pos.map((p, i) => {
            const a = assentos[i];
            const apagado = !!destaque && a.partido !== destaque;
            return (
              <circle
                key={a.id}
                cx={p.x * ESC}
                cy={p.y * ESC}
                r={raio}
                onMouseEnter={() => sobre(i)}
                onClick={() => clique(i)}
                className={cn(
                  'transition-[fill-opacity,stroke-opacity] duration-200 motion-safe:animate-[hemiciclo-entra_.5s_cubic-bezier(.2,.8,.2,1)_both]',
                  a.href ? 'cursor-pointer' : 'cursor-default',
                )}
                style={{
                  fill: a.pendente ? 'url(#hemiciclo-pendente)' : corPartido(a.partido),
                  stroke: a.pendente ? 'rgb(var(--fg) / 0.18)' : undefined,
                  strokeWidth: a.pendente ? 1 : undefined,
                  fillOpacity: apagado ? 0.16 : 1,
                  strokeOpacity: apagado ? 0.16 : 1,
                  animationDelay: `${Math.round((1 - p.a / Math.PI) * 450)}ms`,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />
            );
          })}
          {pAtivo ? (
            <circle
              cx={pAtivo.x * ESC}
              cy={pAtivo.y * ESC}
              r={raio + 3}
              className="pointer-events-none"
              style={{ fill: 'none', stroke: 'rgb(var(--fg))', strokeWidth: 2 }}
            />
          ) : null}
        </g>
      </svg>
      {centro ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-[1%] text-center">{centro}</div>
      ) : null}
      {ativo && pAtivo ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-max max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-xl border border-line bg-surface/95 px-3 py-2 text-left shadow-card backdrop-blur"
          style={{
            left: `${((W / 2 + pAtivo.x * ESC) / W) * 100}%`,
            top: `${((cy + pAtivo.y * ESC) / H) * 100}%`,
          }}
        >
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={ativo.pendente ? undefined : { background: corPartido(ativo.partido) }}
            />
            {ativo.pendente ? 'Aguardando o TSE' : ativo.partido}
          </div>
          {ativo.nome ? <div className="mt-0.5 truncate text-[13.5px] font-semibold text-fg">{ativo.nome}</div> : null}
          {ativo.sub ? <div className="num mt-0.5 text-[11.5px] text-fg-muted">{ativo.sub}</div> : null}
          {ativo.href && dica?.fixa ? <div className="mt-1 text-[11px] font-medium text-brand-fg">Toque de novo para abrir a ficha</div> : null}
        </div>
      ) : null}
      <style>{`@keyframes hemiciclo-entra { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
