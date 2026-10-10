/**
 * Cartões dos cargos do 1º turno (dados oficiais do TSE):
 *  - `CartaoComposicao`: mini hemiciclo por partido (cores NEUTRAS da paleta de partidos, maior bancada à esquerda —
 *    ordem de tamanho, nunca de espectro) + as maiores bancadas, sempre com a sigla ao lado da cor;
 *  - `CartaoSenadoUf`: os 2 senadores eleitos numa UF, com a foto oficial.
 */
import type { UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { useFotoCandidato } from '@/app/data/estatico';
import type { ButtonSize, ButtonVariant } from '@/app/ui/Button';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { corPartido } from '@/app/components/pages/cargos/partidos';
import { posicionar } from '@/app/components/pages/cargos/Hemiciclo';
import { emUf } from '@/app/components/pages/detalhe/fmt';
import { BotaoCompartilhar } from '../BotaoCompartilhar';
import { CartaoBase, SeloOficial, useCartao } from '../CartaoBase';
import { hashtags, textoComposicao, textoSenadoUf } from '../textos';
import type { FormatoCartao } from '../tipos';
import { RotuloCartao } from './partes';

export interface BancadaCartao {
  sigla: string;
  eleitos: number;
}

export interface CartaoComposicaoProps {
  formato: FormatoCartao;
  /** "Senado", "Câmara dos Deputados", "Assembleia Legislativa de São Paulo"… */
  casa: string;
  /** Linha sob o título ("54 das 81 cadeiras, eleitas em 2026"). */
  subtitulo?: string;
  /** Bancadas já ordenadas (maior primeiro). */
  bancadas: BancadaCartao[];
  /** Total de cadeiras (inclui as que aguardam o TSE). */
  total: number;
  /** Rótulo do total no centro do hemiciclo ("vagas em 2026", "deputados"). */
  rotuloCentro: string;
  caminho: string;
}

const W = 1000;
const ESC = 470;
const TOPO = 10;

/** Hemiciclo estático (sem animação: o PNG é tirado do DOM). */
function MiniHemiciclo({ bancadas, total, largura }: { bancadas: BancadaCartao[]; total: number; largura: number }) {
  const assentos: { partido: string; pendente?: boolean }[] = [];
  for (const b of bancadas) for (let i = 0; i < b.eleitos; i++) assentos.push({ partido: b.sigla });
  const pend = Math.max(0, total - assentos.length);
  for (let i = 0; i < pend; i++) assentos.push({ partido: '', pendente: true });
  const { pos, r } = posicionar(assentos);
  const raio = Math.min(30, Math.max(2.5, r * ESC));
  const cy = ESC + TOPO;
  const H = cy + raio + 6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={largura} height={(largura * H) / W} aria-hidden className="block">
      <g transform={`translate(${W / 2} ${cy})`}>
        {pos.map((p, i) => (
          <circle
            key={i}
            cx={p.x * ESC}
            cy={p.y * ESC}
            r={raio}
            style={{ fill: assentos[i].pendente ? 'rgb(var(--fg) / 0.12)' : corPartido(assentos[i].partido) }}
          />
        ))}
      </g>
    </svg>
  );
}

export function CartaoComposicao({ formato, casa, subtitulo, bancadas, total, rotuloCentro, caminho }: CartaoComposicaoProps) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Eleições 2026 · resultado oficial"
      caminho={caminho}
      instante={null}
      fonte="Fonte: TSE · 1º turno, 4 de outubro"
      selo={<SeloOficial>Resultado oficial</SeloOficial>}
      brilho="marca"
    >
      <MioloComposicao casa={casa} subtitulo={subtitulo} bancadas={bancadas} total={total} rotuloCentro={rotuloCentro} />
    </CartaoBase>
  );
}

function MioloComposicao({ casa, subtitulo, bancadas, total, rotuloCentro }: Omit<CartaoComposicaoProps, 'formato' | 'caminho'>) {
  const { k, retrato, formato } = useCartao();
  const lista = bancadas.filter((b) => b.eleitos > 0);
  const n = formato === 'x' ? 8 : formato === 'feed' ? 10 : 12;
  const top = lista.slice(0, lista.length > n ? n - 1 : n);
  const resto = lista.slice(top.length);
  const restoCad = resto.reduce((s, b) => s + b.eleitos, 0);
  const maior = Math.max(1, ...lista.map((b) => b.eleitos));
  const larguraHemi = formato === 'x' ? 560 : formato === 'feed' ? 860 : 900;

  const titulo = (
    <div>
      <div className="font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (formato === 'story' ? 56 : retrato ? 54 : 38) * k }}>
        {casa}
      </div>
      {subtitulo ? (
        <div className="text-fg-muted" style={{ fontSize: 19 * k, marginTop: 8 * k }}>
          {subtitulo}
        </div>
      ) : null}
    </div>
  );

  const hemi = (
    <div className="relative mx-auto" style={{ width: larguraHemi }}>
      <MiniHemiciclo bancadas={lista} total={total} largura={larguraHemi} />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
        <span className="num font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: (retrato ? 74 : 54) * k }}>
          {fmtInt(total)}
        </span>
        <span className="text-fg-muted" style={{ fontSize: 16 * k, marginTop: 4 * k }}>
          {rotuloCentro}
        </span>
      </div>
    </div>
  );

  const tabela = (
    <div className={cn('grid', formato === 'x' ? 'grid-cols-1' : 'grid-cols-2')} style={{ columnGap: 36 * k, rowGap: (formato === 'x' ? 9 : 14) * k }}>
      {top.map((b) => (
        <div key={b.sigla} className="flex items-center" style={{ gap: 12 * k }}>
          <span className="shrink-0 rounded-[4px]" style={{ width: 18 * k, height: 18 * k, background: corPartido(b.sigla) }} />
          <span className="min-w-0 truncate font-semibold" style={{ fontSize: 19 * k, width: 150 * k }}>
            {b.sigla}
          </span>
          <span className="relative h-[0.5em] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3" style={{ fontSize: 19 * k }}>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(b.eleitos / maior) * 100}%`, background: corPartido(b.sigla) }} />
          </span>
          <span className="num shrink-0 text-right font-display font-semibold" style={{ fontSize: 22 * k, width: 48 * k }}>
            {fmtInt(b.eleitos)}
          </span>
        </div>
      ))}
      {resto.length ? (
        <div className="flex items-center text-fg-muted" style={{ gap: 12 * k, fontSize: 17 * k }}>
          <span className="shrink-0 rounded-[4px] bg-cand-outros/60" style={{ width: 18 * k, height: 18 * k }} />
          <span className="min-w-0 flex-1 truncate">
            Mais {fmtInt(resto.length)} {resto.length === 1 ? 'partido' : 'partidos'}
          </span>
          <span className="num shrink-0 text-right font-display font-semibold text-fg" style={{ fontSize: 22 * k, width: 48 * k }}>
            {fmtInt(restoCad)}
          </span>
        </div>
      ) : null}
      {total > lista.reduce((s, b) => s + b.eleitos, 0) ? (
        <div className="flex items-center text-fg-muted" style={{ gap: 12 * k, fontSize: 17 * k }}>
          <span className="shrink-0 rounded-[4px] bg-fg/[0.12]" style={{ width: 18 * k, height: 18 * k }} />
          <span className="min-w-0 flex-1 truncate">Aguardando o TSE</span>
          <span className="num shrink-0 text-right font-display font-semibold text-fg" style={{ fontSize: 22 * k, width: 48 * k }}>
            {fmtInt(total - lista.reduce((s, b) => s + b.eleitos, 0))}
          </span>
        </div>
      ) : null}
    </div>
  );

  if (formato === 'x') {
    return (
      <div className="flex flex-1 flex-col justify-center" style={{ gap: 16, paddingTop: 14, paddingBottom: 10 }}>
        {titulo}
        <div className="grid grid-cols-[560px_minmax(0,1fr)] items-center" style={{ gap: 40 }}>
          {hemi}
          <div>
            <RotuloCartao style={{ marginBottom: 12 }}>Cadeiras por partido</RotuloCartao>
            {tabela}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-center" style={{ gap: (formato === 'story' ? 56 : 34) * k }}>
      {titulo}
      {hemi}
      <div>
        <RotuloCartao style={{ marginBottom: 16 * k }}>Cadeiras por partido · maior bancada primeiro</RotuloCartao>
        {tabela}
      </div>
    </div>
  );
}

export interface BotaoCompartilharComposicaoProps extends Omit<CartaoComposicaoProps, 'formato'> {
  /** Hashtags (padrão: Eleições2026). */
  tags?: string[];
  /** Rótulo das cadeiras no texto ("vagas", "cadeiras"). */
  rotuloTexto?: string;
  nomeArquivo: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  soIcone?: boolean;
}

export function BotaoCompartilharComposicao({
  casa,
  subtitulo,
  bancadas,
  total,
  rotuloCentro,
  caminho,
  tags,
  rotuloTexto = 'cadeiras',
  nomeArquivo,
  label = 'Compartilhar',
  ...botao
}: BotaoCompartilharComposicaoProps) {
  return (
    <BotaoCompartilhar
      {...botao}
      label={label}
      titulo={`Compartilhar · ${casa}`}
      descricao="Composição por partido · resultado oficial do 1º turno."
      texto={textoComposicao(casa, total, bancadas, rotuloTexto)}
      caminho={caminho}
      hashtags={tags ?? hashtags('primeiroTurno')}
      nomeArquivo={nomeArquivo}
      cartao={(f) => <CartaoComposicao formato={f} casa={casa} subtitulo={subtitulo} bancadas={bancadas} total={total} rotuloCentro={rotuloCentro} caminho={caminho.split('?')[0]} />}
    />
  );
}

// =============================================================================================
// Senado por UF
// =============================================================================================

export interface EleitoSenado {
  sqcand: string;
  nomeUrna: string;
  partido: string;
  numero: number;
  votos: number;
  pct: number;
}

export interface CartaoSenadoUfProps {
  formato: FormatoCartao;
  uf: UF;
  eleitos: EleitoSenado[];
  /** Grupo do pacote de fotos (public/data/fotos/{grupo}.json). */
  fotoGrupo: string;
  caminho: string;
}

function RetratoSenador({ e, fotoGrupo, w }: { e: EleitoSenado; fotoGrupo: string; w: number }) {
  const foto = useFotoCandidato({ sqcand: e.sqcand, fotoGrupo }, { real: true });
  return (
    <div className="relative shrink-0 overflow-hidden bg-surface-3" style={{ width: w, height: Math.round((w * 4) / 3), borderRadius: w * 0.09, boxShadow: '0 0 0 1px rgb(var(--line) / 0.12)' }}>
      {foto ? (
        <img src={foto} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display font-semibold text-fg-muted" style={{ fontSize: w * 0.3 }}>
          {iniciais(e.nomeUrna)}
        </div>
      )}
    </div>
  );
}

export function CartaoSenadoUf({ formato, uf, eleitos, fotoGrupo, caminho }: CartaoSenadoUfProps) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Senado · resultado oficial"
      caminho={caminho}
      instante={null}
      fonte="Fonte: TSE · 1º turno, 4 de outubro"
      selo={<SeloOficial>Resultado oficial</SeloOficial>}
      brilho="marca"
    >
      <MioloSenado uf={uf} eleitos={eleitos} fotoGrupo={fotoGrupo} />
    </CartaoBase>
  );
}

function MioloSenado({ uf, eleitos, fotoGrupo }: Omit<CartaoSenadoUfProps, 'formato' | 'caminho'>) {
  const { k, retrato, formato } = useCartao();
  // As fotos oficiais têm 120×160: tamanhos contidos para não ampliar demais (mesmo tamanho para os dois).
  const w = formato === 'x' ? 150 : formato === 'feed' ? 240 : 250;
  // Mesmo corpo de letra para os dois nomes (tratamento igual), pelo nome mais longo.
  const fatorNome = Math.max(...eleitos.slice(0, 2).map((e) => e.nomeUrna.length)) > 16 ? 0.82 : 1;
  return (
    <div className="flex flex-1 flex-col justify-center" style={{ gap: (retrato ? 44 : 18) * k, paddingTop: 10 * k }}>
      <div>
        <RotuloCartao>Senadores eleitos em 2026</RotuloCartao>
        <div className="font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (retrato ? 58 : 40) * k, marginTop: 10 * k }}>
          Senado {emUf(uf, UF_NOMES[uf])}
        </div>
      </div>
      <div className={cn('grid', formato === 'story' ? 'grid-cols-1' : 'grid-cols-2')} style={{ gap: (formato === 'story' ? 40 : 32) * k }}>
        {eleitos.slice(0, 2).map((e) => (
          <div key={e.sqcand} className={cn('flex min-w-0', formato === 'feed' ? 'flex-col' : 'items-center')} style={{ gap: (formato === 'feed' ? 22 : 26) * k }}>
            <RetratoSenador e={e} fotoGrupo={fotoGrupo} w={w} />
            <div className="min-w-0">
              <div className="text-balance font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (formato === 'x' ? 34 : 44) * k * fatorNome }}>
                {e.nomeUrna}
              </div>
              <div className="inline-flex items-center rounded-full border border-line/[2.5] bg-surface/80 font-semibold" style={{ gap: 9 * k, fontSize: 18 * k, padding: `${4 * k}px ${14 * k}px`, marginTop: 12 * k }}>
                <span className="shrink-0 rounded-[3px]" style={{ width: 13 * k, height: 13 * k, background: corPartido(e.partido) }} />
                {e.partido} · <span className="num">{e.numero}</span>
              </div>
              <div className="num font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: (formato === 'x' ? 44 : 58) * k, marginTop: 16 * k }}>
                {fmtPct(e.pct)}
              </div>
              <div className="num text-fg-muted" style={{ fontSize: 17 * k, marginTop: 6 * k }}>
                {fmtInt(e.votos)} votos
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BotaoCompartilharSenadoUfProps extends Omit<CartaoSenadoUfProps, 'formato'> {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  soIcone?: boolean;
}

export function BotaoCompartilharSenadoUf({ uf, eleitos, fotoGrupo, caminho, label = 'Compartilhar', ...botao }: BotaoCompartilharSenadoUfProps) {
  return (
    <BotaoCompartilhar
      {...botao}
      label={label}
      titulo={`Senado · ${UF_NOMES[uf]}`}
      descricao="Os eleitos de 2026 com a foto oficial · resultado do 1º turno."
      texto={textoSenadoUf(uf, eleitos)}
      caminho={caminho}
      hashtags={hashtags('senado')}
      nomeArquivo={`sintonia-senado-${uf.toLowerCase()}`}
      cartao={(f) => <CartaoSenadoUf formato={f} uf={uf} eleitos={eleitos} fotoGrupo={fotoGrupo} caminho={caminho.split('?')[0]} />}
    />
  );
}
