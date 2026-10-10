/**
 * Locais de votação de um município (eleitorado_local_votacao_2026, dados abertos do TSE): escola, endereço,
 * bairro, zona, nº de seções e de eleitores, com as seções do local pintadas como no mosaico (toque → boletim)
 * e busca por nome/bairro/endereço (sem acento/caixa).
 *
 *  - `variante="lista"`: diretório completo (endereço, links de mapa) — seção "Locais de votação";
 *  - `variante="mosaico"`: o mosaico de seções agrupado por local (só nome + quadradinhos), para a opção
 *    "Agrupar por: local" do mosaico.
 *
 * O arquivo de locais é por UF (até ~2,5 MB em SP): só é baixado quando o bloco chega perto da tela.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LocalVotacao } from '@/shared/dataset';
import type { Race, UF, ZonaMosaico } from '@/shared/types';
import { decodeFaixas } from '@/shared/calc';
import { fmtInt } from '@/shared/format';
import { useLocais } from '@/app/data/estatico';
import { cn } from '@/app/lib/cn';
import { useNaTela } from '@/app/lib/useNaTela';
import { fillMosaico, MARGEM_ROTULOS } from '@/app/lib/raceUi';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { SearchBox } from '@/app/ui/SearchBox';
import { Segmented } from '@/app/ui/Segmented';
import { Skeleton } from '@/app/ui/Skeleton';
import { casa } from '@/app/ui/textMatch';
import { linksMapa } from './LocalVotacao';
import { fmt4 } from './fmt';

type Ordem = 'zona' | 'secoes' | 'nome';

interface LocalLinha extends LocalVotacao {
  nums: number[];
  chave: string;
}

function descrever(ch: string | undefined, race: Pick<Race, 'candidatos'>): string {
  if (!ch || ch === '0') return 'aguardando totalização';
  const code = ch.charCodeAt(0);
  const c0 = race.candidatos[0]?.nomeUrna ?? 'Candidato 1';
  const c1 = race.candidatos[1]?.nomeUrna ?? 'Candidato 2';
  if (code >= 97 && code <= 100) return `${c0} à frente (${MARGEM_ROTULOS[code - 97]})`;
  if (code >= 101 && code <= 104) return `${c1} à frente (${MARGEM_ROTULOS[code - 101]})`;
  if (ch === 'x') return 'empate';
  if (ch === 'z') return 'sem votos válidos';
  return 'totalizada';
}

export interface LocaisVotacaoProps {
  uf: UF;
  cod: string;
  nomeMunicipio: string;
  mosaico: ZonaMosaico[];
  race: Pick<Race, 'candidatos'>;
  onSecao: (zona: number, secao: number) => void;
  variante?: 'lista' | 'mosaico';
  /** Zona em destaque (filtra a lista quando definida). */
  zona?: number | null;
  className?: string;
}

export function LocaisVotacao({ uf, cod, nomeMunicipio, mosaico, race, onSecao, variante = 'lista', zona, className }: LocaisVotacaoProps) {
  const [ref, visto] = useNaTela<HTMLDivElement>('500px');
  const q = useLocais(visto ? uf : null);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('zona');
  const passo = variante === 'lista' ? 12 : 30;
  const [limite, setLimite] = useState(passo);
  const cores = useMemo(() => race.candidatos.slice(0, 2).map((c) => c.cor), [race]);

  // estado de cada seção: zona → (seção → caractere do mosaico)
  const estados = useMemo(() => {
    const m = new Map<number, Map<number, string>>();
    for (const z of mosaico) {
      const nums = decodeFaixas(z.faixas);
      const mz = new Map<number, string>();
      nums.forEach((n, i) => mz.set(n, z.estado[i] ?? '0'));
      m.set(z.zona, mz);
    }
    return m;
  }, [mosaico]);

  const locais: LocalLinha[] = useMemo(
    () =>
      (q.data?.locais ?? [])
        .filter((l) => l.cod === cod)
        .map((l) => ({ ...l, nums: decodeFaixas(l.secoes), chave: `${l.zona}-${l.nr}` })),
    [q.data, cod],
  );

  const filtrados = useMemo(() => {
    const t = busca.trim();
    let lista = locais;
    if (zona !== null && zona !== undefined) lista = lista.filter((l) => l.zona === zona);
    if (t) lista = lista.filter((l) => casa(`${l.nome} ${l.bairro ?? ''} ${l.endereco} ${l.zona} ${l.nr}`, t));
    const ord = [...lista];
    if (ordem === 'secoes') ord.sort((a, b) => b.nums.length - a.nums.length || b.aptos - a.aptos);
    else if (ordem === 'nome') ord.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    else ord.sort((a, b) => a.zona - b.zona || (a.nums[0] ?? 0) - (b.nums[0] ?? 0));
    return ord;
  }, [locais, busca, ordem, zona]);

  useEffect(() => setLimite(passo), [busca, ordem, zona, passo]);

  const totais = useMemo(
    () => ({ secoes: locais.reduce((a, l) => a + l.nums.length, 0), aptos: locais.reduce((a, l) => a + l.aptos, 0) }),
    [locais],
  );

  return (
    <div ref={ref} className={className}>
      {!visto || q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl sm:w-[340px]" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.isError || locais.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-fg-muted">
          {q.isError ? 'Não foi possível carregar os locais de votação agora.' : `Os locais de votação ${nomeMunicipio ? `de ${nomeMunicipio}` : ''} não estão disponíveis.`}
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SearchBox
              value={busca}
              onChange={setBusca}
              size="sm"
              placeholder="Escola, bairro ou endereço"
              ariaLabel={`Buscar entre os locais de votação de ${nomeMunicipio}`}
              className="sm:max-w-[340px]"
            />
            {variante === 'lista' ? (
              <Segmented<Ordem>
                size="sm"
                ariaLabel="Ordenar locais"
                value={ordem}
                onChange={setOrdem}
                options={[
                  { value: 'zona', label: 'Zona' },
                  { value: 'secoes', label: 'Nº de seções' },
                  { value: 'nome', label: 'A–Z' },
                ]}
              />
            ) : null}
          </div>
          <p className="num mb-3 text-[12.5px] text-fg-muted">
            {busca || (zona !== null && zona !== undefined)
              ? `${fmtInt(filtrados.length)} de ${fmtInt(locais.length)} locais`
              : `${fmtInt(locais.length)} locais · ${fmtInt(totais.secoes)} seções · ${fmtInt(totais.aptos)} eleitores`}
            {zona !== null && zona !== undefined ? ` · zona ${fmt4(zona)}` : ''}
          </p>
          {filtrados.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-fg-muted">Nenhum local com “{busca}”.</p>
          ) : (
            <ul className={cn('grid grid-cols-1 gap-2', variante === 'lista' ? 'lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3')}>
              {filtrados.slice(0, limite).map((l) => (
                <li key={l.chave}>
                  {variante === 'lista' ? (
                    <CartaoLocal l={l} estados={estados} cores={cores} race={race} onSecao={onSecao} municipio={nomeMunicipio} uf={uf} />
                  ) : (
                    <BlocoLocal l={l} estados={estados} cores={cores} race={race} onSecao={onSecao} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {filtrados.length > limite ? (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" size="sm" iconRight="chevron" onClick={() => setLimite((n) => n + passo * 2)}>
                Ver mais locais ({fmtInt(filtrados.length - limite)})
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Quadradinhos({
  l,
  estados,
  cores,
  race,
  onSecao,
  tamanho = 12,
}: {
  l: LocalLinha;
  estados: Map<number, Map<number, string>>;
  cores: Race['candidatos'][number]['cor'][];
  race: Pick<Race, 'candidatos'>;
  onSecao: (zona: number, secao: number) => void;
  tamanho?: number;
}) {
  const ez = estados.get(l.zona);
  return (
    <div className="flex flex-wrap gap-[3px]" role="group" aria-label={`Seções do local ${l.nome}`}>
      {l.nums.map((n) => {
        const ch = ez?.get(n);
        const rotulo = `Seção ${n}, zona ${l.zona}: ${descrever(ch, race)}`;
        return (
          <button
            key={n}
            type="button"
            title={rotulo}
            aria-label={rotulo}
            onClick={() => onSecao(l.zona, n)}
            className="rounded-[3px] outline-none ring-offset-1 ring-offset-surface transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-brand"
            style={{ width: tamanho, height: tamanho, background: fillMosaico(ch ?? '0', cores) }}
          />
        );
      })}
    </div>
  );
}

function CartaoLocal({
  l,
  estados,
  cores,
  race,
  onSecao,
  municipio,
  uf,
}: {
  l: LocalLinha;
  estados: Map<number, Map<number, string>>;
  cores: Race['candidatos'][number]['cor'][];
  race: Pick<Race, 'candidatos'>;
  onSecao: (zona: number, secao: number) => void;
  municipio: string;
  uf: UF;
}) {
  const { google } = linksMapa({ nome: l.nome, endereco: l.endereco, bairro: l.bairro, lat: l.lat, lon: l.lon }, municipio, uf);
  const linha2 = [l.endereco, l.bairro].filter(Boolean).join(' · ');
  return (
    <article className="h-full rounded-2xl border border-line bg-surface p-3.5 shadow-card sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-pretty text-[14.5px] font-semibold leading-snug text-fg">{l.nome}</h3>
          {linha2 ? <p className="mt-0.5 truncate text-[12.5px] text-fg-muted" title={linha2}>{linha2}</p> : null}
        </div>
        <a
          href={google}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir ${l.nome} no mapa (nova aba)`}
          title="Abrir no mapa"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name="pin" size={15} />
        </a>
      </div>
      <p className="num mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
        <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg">Zona {fmt4(l.zona)}</span>
        <span>
          {fmtInt(l.nums.length)} {l.nums.length === 1 ? 'seção' : 'seções'}
        </span>
        <span aria-hidden>·</span>
        <span>{fmtInt(l.aptos)} eleitores</span>
      </p>
      <div className="mt-2.5">
        <Quadradinhos l={l} estados={estados} cores={cores} race={race} onSecao={onSecao} />
      </div>
    </article>
  );
}

function BlocoLocal({
  l,
  estados,
  cores,
  race,
  onSecao,
}: {
  l: LocalLinha;
  estados: Map<number, Map<number, string>>;
  cores: Race['candidatos'][number]['cor'][];
  race: Pick<Race, 'candidatos'>;
  onSecao: (zona: number, secao: number) => void;
}) {
  return (
    <div className="h-full rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-medium text-fg" title={l.nome}>
          {l.nome}
        </span>
        <span className="num shrink-0 font-mono text-[10.5px] text-fg-subtle">Z{l.zona}</span>
      </div>
      <Quadradinhos l={l} estados={estados} cores={cores} race={race} onSecao={onSecao} tamanho={11} />
    </div>
  );
}
