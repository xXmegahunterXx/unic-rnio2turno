/**
 * /apuracao/consulta — "Consulte sua seção": UF → município → zona → seção → Boletim de Urna.
 *
 * Passo a passo com resumo dos passos concluídos (dá para voltar a qualquer um), busca de município
 * acento-insensível, zonas em grade e validação do nº da seção contra as seções reais da zona.
 * O progresso fica na URL (?uf=&mun=&zona=) — dá para compartilhar e o "voltar" funciona — e a última
 * consulta fica só neste aparelho (localStorage) para o atalho "Ver minha seção".
 * Com a seção encontrada: o LOCAL DE VOTAÇÃO (escola, endereço, links de mapa) e como a seção votou no 1º turno
 * (resultado oficial por seção, dados abertos do TSE) antes de abrir o boletim do 2º turno.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { UF } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { decodeFaixas, encodeFaixas } from '@/shared/calc';
import { fmtInt } from '@/shared/format';
import { useMunicipio, useRaces, useUf, useZona } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Button, ButtonLink, Combobox, Icon, SearchBox, Skeleton, type ComboOption } from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { ErrorState } from '@/app/components/apuracao/States';
import { parseUf, rotaSecao } from '@/app/components/pages/detalhe/useDetalhe';
import { useMinhaSecao } from '@/app/components/pages/detalhe/minhaSecao';
import { usePaisesExterior } from '@/app/components/pages/detalhe/ExteriorTabela';
import { fmt4 } from '@/app/components/pages/detalhe/fmt';
import { LocalVotacaoCartao } from '@/app/components/pages/detalhe/LocalVotacao';
import { PrimeiroTurnoSecao } from '@/app/components/pages/detalhe/PrimeiroTurnoSecao';

/** A partir de quantas zonas o passo 3 ganha o filtro por número. */
const ZONAS_COM_FILTRO = 12;
const E_TITULO = 'https://www.tse.jus.br/servicos-eleitorais/titulo-de-eleitor/e-titulo';
/** Estrutura (municípios, zonas, seções) é a mesma em qualquer corrida de 2º turno: usamos 'pres'. */
const RACE = 'pres';

export default function ConsultaPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const uf = parseUf(params.get('uf') ?? undefined);
  const munRaw = params.get('mun');
  const cod = munRaw && /^\d+$/.test(munRaw) ? munRaw.padStart(5, '0') : null;
  const zonaRaw = params.get('zona');
  const zona = zonaRaw && /^\d+$/.test(zonaRaw) ? Number(zonaRaw) : null;
  const [secaoTxt, setSecaoTxt] = useState('');
  const [minha, setMinha] = useMinhaSecao();

  const qUf = useUf(RACE, uf ?? undefined);
  const qMun = useMunicipio(RACE, uf ?? undefined, cod ?? undefined);
  const qZona = useZona(RACE, uf ?? undefined, cod ?? undefined, zona ?? undefined);
  const paisesQ = usePaisesExterior(uf === 'ZZ');
  const races = useRaces();
  const racesT1 = useMemo(
    () => (uf && races ? races.filter((r) => r.turno === 1 && (r.abrangencia === 'BR' || r.abrangencia === uf) && r.ufs.includes(uf)) : []),
    [races, uf],
  );

  const ufSnap = qUf.data && qUf.data.uf === uf ? qUf.data : undefined;
  const munSnap = qMun.data && qMun.data.uf === uf && qMun.data.cod === cod ? qMun.data : undefined;
  const zonaSnap = qZona.data && qZona.data.cod === cod && qZona.data.zona === zona ? qZona.data : undefined;

  function setParam(next: { uf?: string | null; mun?: string | null; zona?: number | null }) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v === null || v === undefined) p.delete(k);
          else p.set(k, String(v));
        }
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  const exterior = uf === 'ZZ';
  const munResumo = ufSnap?.municipios.find((m) => m.cod === cod);
  const nomeMun = munSnap?.nome ?? munResumo?.nome ?? '';

  const opcoes: ComboOption[] = useMemo(() => {
    const lista = [...(ufSnap?.municipios ?? [])].sort((a, b) => Number(b.capital) - Number(a.capital) || b.eleitorado - a.eleitorado);
    return lista.map((m) => {
      const pais = paisesQ.data?.[m.cod];
      return {
        value: m.cod,
        label: m.nome,
        hint: m.capital ? 'Capital' : (pais ?? `${fmtInt(m.secoes)} seções`),
        keywords: pais,
      };
    });
  }, [ufSnap, paisesQ.data]);

  // Zonas e faixas de seções (do mosaico).
  const zonas = useMemo(
    () =>
      (munSnap?.mosaico ?? [])
        .map((z) => ({ zona: z.zona, secoes: decodeFaixas(z.faixas), faixas: z.faixas }))
        .sort((a, b) => a.zona - b.zona),
    [munSnap],
  );
  const zonaInfo = zonas.find((z) => z.zona === zona);
  // Municípios grandes (SP tem 57 zonas): filtro pelo número antes da grade.
  const [zonaTxt, setZonaTxt] = useState('');
  const zonasFiltradas = useMemo(() => {
    const t = zonaTxt.replace(/^0+/, '');
    return t ? zonas.filter((z) => String(z.zona).startsWith(t)) : zonas;
  }, [zonas, zonaTxt]);
  const zonaExata = zonaTxt ? zonas.find((z) => z.zona === Number(zonaTxt)) : undefined;
  function escolherZona(z: number) {
    setSecaoTxt('');
    setZonaTxt('');
    setParam({ zona: z });
  }
  const zonaValida = !!zonaInfo;

  // Município com zona única: escolhe sozinho.
  useEffect(() => {
    if (munSnap && zonas.length === 1 && zona === null) setParam({ zona: zonas[0].zona });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [munSnap, zonas.length, zona]);

  // Zona da URL que não existe no município: descarta.
  useEffect(() => {
    if (munSnap && zona !== null && !zonaValida) setParam({ zona: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [munSnap, zona, zonaValida]);

  // ----------------------------------------------------------- validação da seção
  const nSecao = /^\d{1,4}$/.test(secaoTxt.trim()) ? Number(secaoTxt.trim()) : null;
  const secoesSet = useMemo(() => new Set(zonaInfo?.secoes ?? []), [zonaInfo]);
  const secaoOk = nSecao !== null && secoesSet.has(nSecao);
  const secaoResumo = secaoOk ? zonaSnap?.secoes.find((s) => s.secao === nSecao) : undefined;
  const mensagemSecao: { tom: 'ok' | 'erro' | 'dica'; texto: ReactNode } | null = !zonaInfo
    ? null
    : secaoTxt.trim() === ''
      ? {
          tom: 'dica',
          texto: (
            <>
              Seções desta zona: <span className="num">{resumoFaixas(zonaInfo.secoes)}</span>
            </>
          ),
        }
      : nSecao === null
        ? { tom: 'erro', texto: 'Digite só números (até 4 dígitos).' }
        : secaoOk
          ? {
              tom: 'ok',
              texto: (
                <>
                  Seção encontrada
                  {secaoResumo ? (
                    <>
                      {' '}
                      · <span className="num">{fmtInt(secaoResumo.aptos)}</span> eleitores aptos
                    </>
                  ) : null}
                  {secaoResumo ? (secaoResumo.totalizada ? ' · já totalizada' : ' · ainda não totalizada') : null}
                </>
              ),
            }
          : {
              tom: 'erro',
              texto: (
                <>
                  A zona {fmt4(zonaInfo.zona)} não tem a seção {fmt4(nSecao)}. Seções desta zona:{' '}
                  <span className="num">{resumoFaixas(zonaInfo.secoes)}</span>.
                </>
              ),
            };

  function abrir() {
    if (!uf || !cod || zona === null || !secaoOk || nSecao === null) return;
    setMinha({ uf, cod, nome: nomeMun, zona, secao: nSecao });
    navigate(rotaSecao(uf, cod, zona, nSecao, RACE));
  }

  const passo = !uf ? 1 : !cod ? 2 : zona === null ? 3 : 4;
  const secaoInput = useRef<HTMLInputElement>(null);
  // Ao avançar, o passo anterior recolhe e a página encolhe: sem isto o passo ativo pode ficar escondido
  // sob o header (celular). Só rola quando o topo do passo ativo está fora da vista.
  const passoAnterior = useRef(passo);
  useEffect(() => {
    if (passoAnterior.current === passo) return;
    passoAnterior.current = passo;
    const el = document.getElementById(`passo-${passo}`);
    if (!el) return;
    const topo = el.getBoundingClientRect().top;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 64;
    if (topo < header + 8 || topo > window.innerHeight * 0.6) {
      const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
    }
  }, [passo]);
  useEffect(() => {
    if (passo === 4 && zonas.length > 1) secaoInput.current?.focus({ preventScroll: true });
  }, [passo, zonas.length]);

  const munErro = (qMun.error ?? qMun.failureReason) && !munSnap;

  return (
    <Container wide>
      <PageHeader
        eyebrow="Boletim de urna · 2º turno"
        title="Consulte sua seção"
        subtitle="Veja o boletim da urna onde você vota assim que ela for totalizada. Escolha o estado, o município, a zona e a seção."
      />

      {minha ? (
        <MinhaSecaoCard
          rotulo={`Seção ${fmt4(minha.secao)} · Zona ${fmt4(minha.zona)}`}
          local={`${minha.nome} (${minha.uf === 'ZZ' ? 'Exterior' : minha.uf})`}
          to={rotaSecao(minha.uf, minha.cod, minha.zona, minha.secao, RACE)}
          onEsquecer={() => setMinha(null)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <ol className="min-w-0 space-y-3" aria-label="Passos da consulta">
          {/* -------------------------------------------------- 1. UF */}
          <Passo
            n={1}
            titulo="Estado"
            ativo={passo === 1}
            feito={!!uf}
            resumo={uf ? (exterior ? 'Exterior' : `${UF_NOMES[uf]} (${uf})`) : null}
            onAlterar={() => setParam({ uf: null, mun: null, zona: null })}
          >
            <p className="mb-3 text-[14px] text-fg-muted">
              Onde fica o seu domicílio eleitoral? Quem vota fora do país escolhe “Exterior”.
            </p>
            <GradeUf
              onEscolher={(u) => {
                setSecaoTxt('');
                setParam({ uf: u.toLowerCase(), mun: null, zona: null });
              }}
            />
          </Passo>

          {/* -------------------------------------------------- 2. município */}
          <Passo
            n={2}
            titulo={exterior ? 'Cidade' : 'Município'}
            ativo={passo === 2}
            feito={!!cod && !!nomeMun}
            bloqueado={!uf}
            resumo={cod ? nomeMun || '…' : null}
            onAlterar={() => setParam({ mun: null, zona: null })}
          >
            {qUf.isError && !ufSnap ? (
              <ErrorState compact onRetry={() => qUf.refetch()} />
            ) : !ufSnap ? (
              <Skeleton className="h-14 w-full rounded-2xl" />
            ) : (
              <>
                <Combobox
                  options={opcoes}
                  value={cod}
                  size="lg"
                  onSelect={(o) => {
                    setSecaoTxt('');
                    setParam({ mun: o.value, zona: null });
                  }}
                  placeholder={exterior ? 'Digite a cidade ou o país' : 'Digite o nome do município'}
                  ariaLabel={exterior ? 'Cidade no exterior' : `Município de ${uf ? UF_NOMES[uf] : ''}`}
                  maxResults={80}
                  emptyText={exterior ? 'Nenhuma cidade com esse nome' : 'Nenhum município com esse nome'}
                />
                <p className="mt-2 text-[12.5px] text-fg-muted">
                  <span className="num">{fmtInt(ufSnap.municipios.length)}</span> {exterior ? 'cidades' : 'municípios'} · a busca ignora
                  acentos.
                </p>
              </>
            )}
          </Passo>

          {/* -------------------------------------------------- 3. zona */}
          <Passo
            n={3}
            titulo="Zona eleitoral"
            ativo={passo === 3}
            feito={zona !== null && zonaValida}
            bloqueado={!cod}
            resumo={zona !== null ? `Zona ${fmt4(zona)}${zonas.length === 1 ? ' (única)' : ''}` : null}
            onAlterar={zonas.length > 1 ? () => setParam({ zona: null }) : undefined}
          >
            {munErro ? (
              <ErrorState
                compact
                title="Município não encontrado"
                message="Escolha o município de novo."
                onRetry={() => setParam({ mun: null })}
              />
            ) : !munSnap ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                <p className="mb-3 text-[14px] text-fg-muted">
                  {nomeMun} tem <span className="num">{fmtInt(zonas.length)}</span> zonas. O número está no seu título, ao lado de “Zona”.
                </p>
                {zonas.length > ZONAS_COM_FILTRO ? (
                  <form
                    className="mb-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const alvo = zonaExata ?? (zonasFiltradas.length === 1 ? zonasFiltradas[0] : undefined);
                      if (alvo) escolherZona(alvo.zona);
                    }}
                  >
                    <SearchBox
                      id="zona-numero"
                      ariaLabel="Filtrar pelo número da zona"
                      inputMode="numeric"
                      autoComplete="off"
                      value={zonaTxt}
                      onChange={(v) => setZonaTxt(v.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Digite o número da zona"
                      className="sm:max-w-[280px]"
                    />
                  </form>
                ) : null}
                {zonasFiltradas.length === 0 ? (
                  <p
                    className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13.5px] text-fg-muted"
                    aria-live="polite"
                  >
                    {nomeMun} não tem a zona <span className="num font-medium text-fg">{zonaTxt}</span>. Confira no seu título.
                  </p>
                ) : null}
                <ul className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-5">
                  {zonasFiltradas.map((z) => (
                    <li key={z.zona}>
                      <button
                        type="button"
                        onClick={() => escolherZona(z.zona)}
                        className="flex w-full flex-col items-center rounded-xl border border-line bg-surface-2 px-2 py-2.5 transition-colors hover:border-brand/50 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span className="font-mono text-[15px] font-semibold text-fg">{fmt4(z.zona)}</span>
                        <span className="num mt-0.5 text-[11px] text-fg-muted">{fmtInt(z.secoes.length)} seções</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Passo>

          {/* -------------------------------------------------- 4. seção */}
          <Passo n={4} titulo="Seção" ativo={passo === 4} feito={false} bloqueado={zona === null}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                abrir();
              }}
            >
              <label htmlFor="secao-numero" className="mb-2 block text-[14px] text-fg-muted">
                Número da seção (está no título, ao lado de “Seção”)
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative sm:w-56">
                  <input
                    ref={secaoInput}
                    id="secao-numero"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="0000"
                    value={secaoTxt}
                    onChange={(e) => setSecaoTxt(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    aria-invalid={mensagemSecao?.tom === 'erro'}
                    aria-describedby="secao-msg"
                    className={cn(
                      'h-14 w-full rounded-2xl border bg-surface-2 px-4 text-center font-mono text-[26px] font-semibold tracking-[0.25em] text-fg placeholder:text-fg-subtle/60',
                      'transition-[border-color,box-shadow] focus:outline-none focus:ring-4',
                      mensagemSecao?.tom === 'erro'
                        ? 'border-alert/60 focus:ring-alert/15'
                        : mensagemSecao?.tom === 'ok'
                          ? 'border-brand/60 focus:ring-brand/20'
                          : 'border-line focus:border-brand/60 focus:ring-brand/15',
                    )}
                  />
                  {secaoOk ? (
                    <Icon
                      name="check-circulo"
                      size={20}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-fg"
                    />
                  ) : null}
                </div>
                <Button type="submit" variant="primary" size="lg" iconRight="seta" disabled={!secaoOk} className="sm:flex-1">
                  Ver o boletim
                </Button>
              </div>
              <p
                id="secao-msg"
                aria-live="polite"
                className={cn(
                  'mt-2.5 min-h-[20px] text-pretty text-[13px] leading-snug',
                  mensagemSecao?.tom === 'erro' ? 'text-alert-fg' : mensagemSecao?.tom === 'ok' ? 'text-brand-fg' : 'text-fg-muted',
                )}
              >
                {mensagemSecao?.texto}
              </p>
            </form>
            {secaoOk && nSecao !== null && uf && cod && zona !== null ? (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4">
                {secaoResumo?.local ? (
                  <LocalVotacaoCartao local={secaoResumo.local} municipio={nomeMun} uf={exterior ? undefined : uf} compacto className="shadow-none" />
                ) : null}
                {racesT1.length ? (
                  <PrimeiroTurnoSecao
                    key={`${cod}-${zona}-${nSecao}`}
                    uf={uf}
                    cod={cod}
                    zona={zona}
                    secao={nSecao}
                    races={racesT1}
                    compacto
                    nomeMunicipio={nomeMun}
                    className="shadow-none"
                  />
                ) : null}
              </div>
            ) : null}
          </Passo>
        </ol>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--app-header-h,64px)+16px)] lg:self-start">
          <AjudaTitulo />
          <p className="flex items-start gap-2 rounded-2xl border border-line px-4 py-3 text-[12.5px] leading-relaxed text-fg-muted">
            <Icon name="olho-fechado" size={16} className="mt-0.5 shrink-0" />
            <span>
              Guardamos a sua última consulta só neste aparelho, para o atalho “Ver minha seção”. Nada é enviado: zona e seção não dizem
              nada sobre o seu voto.
            </span>
          </p>
        </aside>
      </div>
    </Container>
  );
}

/** "1–120, 135, 140–160" (encurta listas longas). */
function resumoFaixas(nums: number[]): string {
  const partes = encodeFaixas(nums)
    .split(',')
    .map((p) => p.replace('-', '–'));
  return partes.length > 6 ? `${partes.slice(0, 5).join(', ')} e mais ${partes.length - 5} faixas` : partes.join(', ');
}

function Passo({
  n,
  titulo,
  ativo,
  feito,
  bloqueado,
  resumo,
  onAlterar,
  children,
}: {
  n: number;
  titulo: string;
  ativo: boolean;
  feito: boolean;
  bloqueado?: boolean;
  resumo?: ReactNode;
  onAlterar?: () => void;
  children: ReactNode;
}) {
  const mostrarConteudo = ativo;
  return (
    <li
      id={`passo-${n}`}
      aria-current={ativo ? 'step' : undefined}
      className={cn(
        'scroll-mt-[calc(var(--app-header-h,64px)+12px)] rounded-2xl border bg-surface transition-[border-color,box-shadow]',
        ativo ? 'border-brand/40 p-4 shadow-glow sm:p-6' : 'border-line px-4 py-3 shadow-card sm:px-6',
        bloqueado && !ativo && 'opacity-55',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-semibold',
            feito && !ativo
              ? 'bg-brand text-brand-ink'
              : ativo
                ? 'bg-brand/15 text-brand-fg ring-2 ring-inset ring-brand/50'
                : 'bg-surface-3 text-fg-muted',
          )}
          aria-hidden
        >
          {feito && !ativo ? <Icon name="check" size={16} strokeWidth={2.5} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn('font-display font-semibold tracking-[-0.01em] text-fg', ativo ? 'text-[19px]' : 'text-[15px]')}>
            <span className="sr-only">Passo {n}: </span>
            {titulo}
          </h2>
          {!ativo && resumo ? <p className="truncate text-[14px] text-fg-muted">{resumo}</p> : null}
        </div>
        {!ativo && feito && onAlterar ? (
          <Button variant="ghost" size="sm" onClick={onAlterar}>
            Alterar
          </Button>
        ) : null}
      </div>
      {mostrarConteudo ? <div className="mt-4">{children}</div> : null}
    </li>
  );
}

function GradeUf({ onEscolher }: { onEscolher: (u: UF) => void }) {
  const lista: UF[] = [...UFS, 'ZZ'];
  return (
    <ul className="grid grid-cols-4 gap-1.5 min-[420px]:grid-cols-5 sm:grid-cols-7">
      {lista.map((u) => (
        <li key={u} className={cn(u === 'ZZ' && 'col-span-2 min-[420px]:col-span-2 sm:col-span-2')}>
          <button
            type="button"
            onClick={() => onEscolher(u)}
            title={UF_NOMES[u]}
            className="group flex h-full min-h-[3.75rem] w-full flex-col items-center justify-center rounded-xl border border-line bg-surface-2 px-1 py-2 transition-colors hover:border-brand/50 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="font-mono text-[15px] font-semibold leading-none text-fg">{u === 'ZZ' ? 'EX' : u}</span>
            <span className="mt-1 line-clamp-2 max-w-full text-balance px-0.5 text-center text-[10.5px] leading-[1.2] text-fg-muted">
              {UF_NOMES[u]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MinhaSecaoCard({ rotulo, local, to, onEsquecer }: { rotulo: string; local: string; to: string; onEsquecer: () => void }) {
  return (
    <section
      aria-label="Minha seção"
      className="relative mb-6 overflow-hidden rounded-2xl border border-brand/35 bg-surface p-4 shadow-glow sm:p-5"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
            <Icon name="urna" size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-fg">Minha seção</p>
            <p className="mt-0.5 truncate font-display text-[18px] font-semibold text-fg">
              <span className="font-mono">{rotulo}</span>
            </p>
            <p className="truncate text-[13.5px] text-fg-muted">{local}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ButtonLink to={to} variant="primary" iconRight="seta" className="flex-1 sm:flex-none">
            Ver minha seção
          </ButtonLink>
          <Button variant="ghost" onClick={onEsquecer}>
            Esquecer
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Ilustração do título de eleitor (sem imitar o documento): onde ficam zona e seção. */
function AjudaTitulo() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-fg">Onde encontro a zona e a seção?</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
        O número da zona e da seção está no seu título de eleitor ou no app e-Título.
      </p>
      <div aria-hidden className="relative mt-4 overflow-hidden rounded-xl border border-line bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="h-2 w-24 rounded-full bg-fg/15" />
          <span className="h-2 w-10 rounded-full bg-fg/10" />
        </div>
        <span className="block h-2 w-40 rounded-full bg-fg/10" />
        <span className="mt-2 block h-2 w-28 rounded-full bg-fg/10" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Campo rotulo="Zona" valor="0001" destaque />
          <Campo rotulo="Seção" valor="0123" destaque />
          <Campo rotulo="Município" valor="—" />
        </div>
      </div>
      <a
        href={E_TITULO}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg text-[14px] font-medium text-brand-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Saiba mais sobre o e-Título (TSE)
        <Icon name="externo" size={15} />
        <span className="sr-only">(abre em nova aba)</span>
      </a>
      <p className="mt-3 text-[12.5px] leading-relaxed text-fg-subtle">
        Não lembra?{' '}
        <Link to="/apuracao" className="underline underline-offset-2 hover:text-fg">
          Acompanhe o placar
        </Link>{' '}
        enquanto procura o título.
      </p>
    </section>
  );
}

function Campo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cn('rounded-lg px-2.5 py-2', destaque ? 'bg-brand/15 ring-2 ring-inset ring-brand/60' : 'bg-fg/[0.04]')}>
      <span className={cn('block text-[10px] font-semibold uppercase tracking-[0.12em]', destaque ? 'text-brand-fg' : 'text-fg-subtle')}>
        {rotulo}
      </span>
      <span className={cn('mt-0.5 block font-mono text-[15px] font-semibold', destaque ? 'text-fg' : 'text-fg-subtle')}>{valor}</span>
    </div>
  );
}
