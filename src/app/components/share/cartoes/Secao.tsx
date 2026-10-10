/**
 * Cartão "Como votou a minha seção": o boletim da seção em visual de recibo térmico (como o `BoletimUrna`), com o
 * 2º turno (simulação marcada, ou ao vivo) e o resultado OFICIAL do 1º turno da mesma seção lado a lado.
 * Antes do dia 25 (sem simulação), só o 1º turno — o gancho "como votou a minha seção".
 * Nunca há foto aqui; os nomes são os da página (anônimos na simulação com nomes ocultos).
 */
import type { CSSProperties } from 'react';
import type { Race, SecaoDetalhe, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { pctValidos, validos } from '@/shared/calc';
import { fmtHoraSeg, fmtInt, fmtPct } from '@/shared/format';
import { useSecao } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import type { ButtonSize, ButtonVariant } from '@/app/ui/Button';
import { BotaoCompartilhar } from '../BotaoCompartilhar';
import { CartaoBase, SeloOficial, useCartao } from '../CartaoBase';
import { BarraDuelo, PctGigante, RotuloCartao } from './partes';
import { hashtags, textoSecao } from '../textos';
import type { FormatoCartao } from '../tipos';

const f4 = (n: number) => String(n).padStart(4, '0');

/** Serrilha do papel (topo e base), como no BoletimUrna. */
const MASCARA =
  'radial-gradient(circle at 7px 0, transparent 5.5px, black 6px) top left / 14px 51% repeat-x, ' +
  'radial-gradient(circle at 7px 100%, transparent 5.5px, black 6px) bottom left / 14px 51% repeat-x';
const SERRILHA: CSSProperties = { WebkitMask: MASCARA, mask: MASCARA };
const muted = 'text-fg-muted dark:text-bg/60';
const regua = 'border-dashed border-fg/25 dark:border-bg/25';

interface ReciboProps {
  titulo: string;
  race: Race;
  /** Votos por candidato (null = seção ainda não totalizada). */
  votos: number[] | null;
  brancos: number;
  nulos: number;
  aptos: number;
  comparecimento: number;
  totalizadaEm?: number | null;
  /** Carimbo SIMULAÇÃO. */
  carimbo?: boolean;
  /** Selo de resultado oficial. */
  oficial?: boolean;
  /** Fator extra de tamanho (recibos lado a lado no feed). */
  escala?: number;
}

function Recibo({ titulo, race, votos, brancos, nulos, aptos, comparecimento, totalizadaEm, carimbo, oficial, escala = 1 }: ReciboProps) {
  const { k: kBase } = useCartao();
  const k = kBase * escala;
  const tot = votos !== null;
  const val = tot ? validos({ votos }) : 0;
  const fs = 15 * k;
  return (
    <div className="relative">
      <div
        className="relative flex flex-col overflow-hidden bg-surface font-mono text-fg dark:bg-fg dark:text-bg"
        style={{ ...SERRILHA, padding: `${30 * k}px ${26 * k}px ${28 * k}px`, fontSize: fs, lineHeight: 1.45 }}
      >
        <div className="pointer-events-none absolute inset-0 bg-noise opacity-60" data-sem-png />
        <div className="relative flex items-start justify-between" style={{ gap: 10 * k }}>
          <div className="min-w-0">
            <div className="inline-flex items-center uppercase tracking-[0.2em]" style={{ gap: 8 * k, fontSize: 12 * k }}>
              <Icon name="urna" size={16 * k} strokeWidth={2} />
              Boletim de urna
            </div>
            <div className="font-semibold uppercase leading-tight tracking-[0.04em]" style={{ fontSize: 19 * k, marginTop: 6 * k }}>
              {titulo}
            </div>
            <div className={cn('uppercase tracking-[0.08em]', muted)} style={{ fontSize: 12.5 * k }}>
              {race.cargo}
            </div>
          </div>
          {carimbo ? (
            <span
              className="inline-flex shrink-0 -rotate-[8deg] flex-col items-center rounded-md border-current text-brand-fg dark:text-[color:color-mix(in_srgb,rgb(var(--brand))_70%,rgb(var(--bg)))]"
              style={{ borderWidth: 2 * k, padding: `${6 * k}px ${10 * k}px`, marginTop: 6 * k }}
            >
              <span className="font-semibold uppercase leading-none tracking-[0.16em]" style={{ fontSize: 14 * k }}>
                Simulação
              </span>
              <span className="font-medium uppercase leading-none tracking-[0.12em]" style={{ fontSize: 9.5 * k, marginTop: 4 * k }}>
                dados fictícios
              </span>
            </span>
          ) : oficial ? (
            <span
              className="inline-flex shrink-0 items-center rounded-md border border-current font-semibold uppercase tracking-[0.12em]"
              style={{ gap: 6 * k, padding: `${4 * k}px ${8 * k}px`, fontSize: 11 * k, marginTop: 6 * k }}
            >
              <Icon name="selo" size={14 * k} strokeWidth={2} />
              Oficial
            </span>
          ) : null}
        </div>

        <div className={cn('relative border-t', regua)} style={{ margin: `${14 * k}px 0` }} />

        <div className="relative flex flex-col" style={{ gap: 6 * k }}>
          {race.candidatos.map((c, i) => (
            <div key={`${c.numero}-${i}`} className="flex items-baseline" style={{ gap: 9 * k }}>
              <span className={cn('shrink-0 self-center rounded-[3px]', corSlot(c.cor).bg)} style={{ width: 11 * k, height: 11 * k }} />
              <span className="num shrink-0 font-semibold" style={{ width: 28 * k }}>
                {c.agregado ? '··' : c.numero}
              </span>
              <span className="min-w-0 truncate uppercase">{c.agregado ? 'Demais' : c.nomeUrna}</span>
              <span className="min-w-[10px] flex-1 translate-y-[-3px] border-b border-dotted border-fg/25 dark:border-bg/30" />
              <span className="num shrink-0 font-semibold" style={{ fontSize: 17 * k }}>
                {tot ? fmtInt(votos![i] ?? 0) : '—'}
              </span>
              <span className={cn('num shrink-0 text-right', muted)} style={{ width: 62 * k, fontSize: 13 * k }}>
                {tot && val > 0 ? fmtPct(pctValidos({ votos: votos! }, i), 1) : ''}
              </span>
            </div>
          ))}
        </div>

        <div className={cn('relative border-t', regua)} style={{ margin: `${14 * k}px 0` }} />

        <div className="relative flex flex-col uppercase" style={{ gap: 2 * k, fontSize: 13.5 * k }}>
          {[
            ['Brancos', tot ? fmtInt(brancos) : '—'],
            ['Nulos', tot ? fmtInt(nulos) : '—'],
            ['Compareceram', tot ? `${fmtInt(comparecimento)} de ${fmtInt(aptos)}` : `— de ${fmtInt(aptos)}`],
          ].map(([r, v]) => (
            <div key={r} className="flex items-baseline" style={{ gap: 8 * k }}>
              <span className={muted}>{r}</span>
              <span className="min-w-[10px] flex-1 translate-y-[-3px] border-b border-dotted border-fg/25 dark:border-bg/30" />
              <span className="num">{v}</span>
            </div>
          ))}
        </div>

        <div className={cn('relative mt-auto border-t text-center font-semibold uppercase tracking-[0.08em]', regua)} style={{ paddingTop: 12 * k, marginTop: 14 * k, fontSize: 12.5 * k }}>
          {tot ? (
            <span className="inline-flex items-center" style={{ gap: 6 * k }}>
              <Icon name="check-circulo" size={15 * k} strokeWidth={2} />
              {totalizadaEm ? (
                <>
                  Totalizada às <span className="num">{fmtHoraSeg(totalizadaEm)}</span>
                </>
              ) : (
                'Resultado totalizado'
              )}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md border border-dashed border-current" style={{ gap: 6 * k, padding: `${3 * k}px ${10 * k}px` }}>
              <Icon name="relogio" size={15 * k} strokeWidth={2} />
              Aguardando totalização
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface CartaoSecaoProps {
  formato: FormatoCartao;
  /** Boletim do 2º turno, como a página exibe (com `simulado` e o código mascarado). */
  bu: SecaoDetalhe;
  /** Corrida do 2º turno (para exibição). */
  race: Race;
  /** 1º turno oficial desta seção (null = indisponível). */
  t1?: { race: Race; secao: SecaoDetalhe } | null;
  /** Mostra o recibo do 2º turno (simulação ou seção já totalizada). */
  mostrarT2: boolean;
  /** Números do 2º turno simulados. */
  simulado: boolean;
  caminho: string;
}

export function CartaoSecao({ formato, bu, race, t1, mostrarT2, simulado, caminho }: CartaoSecaoProps) {
  const exterior = bu.uf === 'ZZ';
  const temSim = mostrarT2 && simulado;
  return (
    <CartaoBase
      formato={formato}
      simulado={temSim}
      sobrancelha="Boletim da seção"
      caminho={caminho}
      instante={mostrarT2 ? (bu.totalizadaEm ?? undefined) : null}
      rotuloInstante={mostrarT2 ? 'Dados de' : undefined}
      fonte={temSim ? '1º turno: TSE (oficial) · 2º turno: simulação' : 'Fonte: TSE · boletins de urna'}
      selo={!temSim && t1 ? <SeloOficial>Resultado oficial</SeloOficial> : undefined}
      brilho="marca"
    >
      <Miolo bu={bu} race={race} t1={t1} mostrarT2={mostrarT2} simulado={simulado} exterior={exterior} />
    </CartaoBase>
  );
}

function ResumoSecao({ titulo, race, votos }: { titulo: string; race: Race; votos: number[] }) {
  const { k } = useCartao();
  const fin = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado).slice(0, 2);
  return (
    <div className="rounded-[1.1em] border border-line/[2] bg-surface/70" style={{ padding: `${22 * k}px ${26 * k}px`, fontSize: 16 * k }}>
      <RotuloCartao>{titulo}</RotuloCartao>
      <div className="grid grid-cols-2" style={{ columnGap: 30 * k, marginTop: 14 * k }}>
        {fin.map(({ c, i }, n) => (
          <div key={i} className={cn('min-w-0', n === 1 && 'text-right')}>
            <div className="truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: 26 * k }}>
              {c.nomeUrna}
            </div>
            <PctGigante valor={pctValidos({ votos }, i)} size={78 * k} cor={c.cor} casas={1} className={cn(n === 1 && 'text-right')} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 * k }}>
        <BarraDuelo race={race} votos={votos} alto={14 * k} rotulo={false} />
      </div>
    </div>
  );
}

function Miolo({ bu, race, t1, mostrarT2, simulado, exterior }: Omit<CartaoSecaoProps, 'formato' | 'caminho'> & { exterior: boolean }) {
  const { k, retrato, formato } = useCartao();
  const t2Votos = mostrarT2 && bu.totalizada && validos(bu) > 0 ? bu.votos : null;
  const dois = mostrarT2 && !!t1;
  // Feed com dois recibos lado a lado: letra um pouco menor para os nomes caberem.
  const escala = dois ? (formato === 'feed' ? 0.86 : formato === 'x' ? 0.84 : 0.9) : 1;
  const recibos = [
    mostrarT2 ? (
      <Recibo
        key="t2"
        titulo="2º turno · 25/10/2026"
        race={race}
        votos={bu.totalizada ? bu.votos : null}
        brancos={bu.brancos}
        nulos={bu.nulos}
        aptos={bu.aptos}
        comparecimento={bu.comparecimento}
        totalizadaEm={bu.totalizadaEm}
        carimbo={simulado}
        escala={escala}
      />
    ) : null,
    t1 ? (
      <Recibo
        key="t1"
        titulo="1º turno · 04/10/2026"
        race={t1.race}
        votos={t1.secao.votos}
        brancos={t1.secao.brancos}
        nulos={t1.secao.nulos}
        aptos={t1.secao.aptos}
        comparecimento={t1.secao.comparecimento}
        oficial
        escala={escala}
      />
    ) : null,
  ].filter(Boolean);
  const umSo = recibos.length < 2;
  // Resumo grande (feed e story): o 2º turno da seção ou, antes do dia 25, o 1º turno. No story com dois recibos não cabe.
  const resumo =
    retrato && !(formato === 'story' && dois)
      ? t2Votos
        ? { titulo: `Nesta seção · 2º turno${simulado ? ' · simulação' : ''}`, race, votos: t2Votos }
        : t1 && validos(t1.secao) > 0
          ? { titulo: 'Nesta seção · 1º turno · resultado oficial', race: t1.race, votos: t1.secao.votos }
          : null
      : null;
  return (
    <div className="flex flex-1 flex-col justify-center" style={{ paddingTop: (retrato ? 28 : 12) * k, paddingBottom: (retrato ? 28 : 12) * k, gap: (formato === 'story' ? 26 : retrato ? 30 : 12) * k }}>
      <div className={cn(retrato ? '' : 'flex items-end justify-between')} style={{ gap: 20 * k }}>
        <div className="text-balance font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (formato === 'story' ? 52 : retrato ? 58 : 34) * k }}>
          Como votou a minha seção
        </div>
        <div className="num font-mono font-semibold text-fg-muted" style={{ fontSize: (retrato ? 22 : 17) * k, marginTop: retrato ? 14 * k : 0 }}>
          Seção {f4(bu.secao)} · Zona {f4(bu.zona)}
          <span className="font-sans font-medium">
            {' '}
            · {bu.nomeMunicipio}
            {exterior ? '' : ` (${bu.uf})`}
          </span>
        </div>
      </div>
      {resumo ? <ResumoSecao {...resumo} /> : null}
      <div
        className={cn('grid items-start', umSo ? 'mx-auto w-full grid-cols-1' : formato === 'story' ? 'grid-cols-1' : 'grid-cols-2')}
        style={{ gap: (formato === 'story' ? 22 : 24) * k, maxWidth: umSo ? (retrato ? 720 : 600) : undefined }}
      >
        {recibos}
      </div>
      {!mostrarT2 ? (
        <div className="text-center text-fg-muted" style={{ fontSize: 17 * k }}>
          2º turno em 25/10: o boletim desta seção aparece aqui ao vivo.
        </div>
      ) : null}
    </div>
  );
}

// =============================================================================================
// Botão
// =============================================================================================

export interface BotaoCompartilharSecaoProps {
  uf: UF;
  cod: string;
  zona: number;
  secao: number;
  /** Boletim do 2º turno, como a página exibe. */
  bu: SecaoDetalhe;
  /** Corrida do 2º turno (exibição). */
  race: Race;
  /** Corridas do 1º turno da UF (exibição), a preferida primeiro. */
  racesT1: Race[];
  /** Números do 2º turno simulados (status.simulacao). */
  simulado: boolean;
  caminho: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  soIcone?: boolean;
  icone?: Parameters<typeof Icon>[0]['name'];
}

export function BotaoCompartilharSecao({ uf, cod, zona, secao, bu, race, racesT1, simulado, caminho, ...botao }: BotaoCompartilharSecaoProps) {
  const raceT1 = racesT1[0];
  const q = useSecao(raceT1?.id ?? 'pres-t1', raceT1 ? uf : undefined, cod, zona, secao);
  const s1 = q.data && raceT1 && q.data.race === raceT1.id && q.data.secao === secao && q.data.zona === zona ? q.data : null;
  const mostrarT2 = bu.totalizada || simulado;
  const t1 = s1 && raceT1 ? { race: raceT1, secao: s1 } : null;
  const texto = textoSecao({
    secao,
    zona,
    municipio: bu.nomeMunicipio,
    uf,
    t1: t1 ? { race: t1.race, t: t1.secao } : null,
    t2: mostrarT2 && bu.totalizada ? { race, t: bu } : null,
    simulado,
  });
  return (
    <BotaoCompartilhar
      {...botao}
      titulo="Como votou a minha seção"
      descricao={`Seção ${f4(secao)}, zona ${f4(zona)} · ${bu.nomeMunicipio}${uf === 'ZZ' ? '' : ` (${UF_NOMES[uf]})`}`}
      texto={texto}
      caminho={caminho}
      hashtags={t1 && !mostrarT2 ? hashtags('primeiroTurno') : hashtags('apuracao')}
      nomeArquivo={`sintonia-secao-${uf.toLowerCase()}-${cod}-${zona}-${secao}`}
      simulado={mostrarT2 && simulado && bu.totalizada}
      carregando={!!raceT1 && q.isLoading}
      formatos={['feed', 'x', 'story']}
      cartao={(f) => <CartaoSecao formato={f} bu={bu} race={race} t1={t1} mostrarT2={mostrarT2} simulado={simulado} caminho={caminho.split('?')[0]} />}
    />
  );
}
