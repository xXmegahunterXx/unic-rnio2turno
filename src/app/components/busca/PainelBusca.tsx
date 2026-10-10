/**
 * Painel da busca rápida (carregado sob demanda na 1ª abertura, fora do JS inicial). Ver BuscaRapida.tsx.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { UfDataset } from '@/shared/dataset';
import type { UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { useMeta } from '@/app/data/hooks';
import { useDadoEstatico, useMunicipiosBrOrdem } from '@/app/data/estatico';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { useModal } from '@/app/ui/overlay';
import { realcar } from '@/app/ui/textMatch';
import { useIndiceCandidatos } from '@/app/components/pages/cargos/dados';
import {
  PAGINAS,
  buscar,
  interpretarSecao,
  itensCandidatos,
  itensMunicipios,
  itensUfs,
  rotaSecao,
  type ConsultaSecao,
  type ItemBusca,
  type MunicipioBase,
} from './indice';
import { gravarRecente, lerRecentes, limparRecentes, type Recente } from './recentes';

const fmt4 = (n: number) => String(n).padStart(4, '0');

type Opcao = ItemBusca & { acao?: () => void; dica?: string };
interface Grupo {
  id: string;
  titulo: string;
  itens: Opcao[];
  extra?: ReactNode;
}

export default function PainelBusca({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const painel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idBase = useId();
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const [modoSecao, setModoSecao] = useState<ConsultaSecao | null>(null);
  const [recentes, setRecentes] = useState<Recente[]>(() => lerRecentes());
  useModal(true, painel, () => (modoSecao ? sairModo() : onClose()));

  // dados (baixados na 1ª abertura, ficam em cache)
  const munQ = useMunicipiosBrOrdem(true);
  const zzQ = useDadoEstatico<UfDataset>('data/uf/zz.json');
  const indice = useIndiceCandidatos(true);
  const { data: meta } = useMeta();

  const municipios: MunicipioBase[] = useMemo(() => {
    const out: MunicipioBase[] = [];
    const capitais = new Set((meta?.ufs ?? []).map((u) => u.capitalCod).filter(Boolean) as string[]);
    const m = munQ.data;
    if (m) for (let i = 0; i < m.cod.length; i++) out.push({ uf: m.uf[i] as UF, cod: m.cod[i], nome: m.nome[i], capital: capitais.has(m.cod[i]) });
    for (const z of zzQ.data?.municipios ?? []) out.push({ uf: 'ZZ', cod: z.cod, nome: z.nome, pais: z.pais });
    return out;
  }, [munQ.data, zzQ.data, meta]);
  const itensMun = useMemo(() => itensMunicipios(municipios), [municipios]);
  const itensUf = useMemo(() => itensUfs(), []);
  const itensCand = useMemo(
    () => itensCandidatos(indice.linhas.filter((l) => !/^Vice/.test(l.cargo))),
    [indice.linhas],
  );
  const carregando = munQ.isLoading || indice.isLoading;

  function sairModo() {
    setModoSecao(null);
    setQ('');
    setAtivo(0);
    input.current?.focus();
  }

  const ir = useCallback(
    (op: Opcao) => {
      if (op.acao) {
        op.acao();
        return;
      }
      gravarRecente(op);
      onClose();
      navigate(op.to);
    },
    [navigate, onClose],
  );

  const grupos: Grupo[] = useMemo(() => {
    const t = q.trim();
    // passo 2 do "zona/seção": escolher o município
    if (modoSecao) {
      const base = modoSecao.uf ? itensMun.filter((m) => m.id.startsWith(`m-${modoSecao.uf}-`)) : itensMun;
      const achados = t ? buscar(base, t, 12) : base.filter((m) => (m.peso ?? 0) > 0).slice(0, 12);
      return [
        {
          id: 'mun-secao',
          titulo: t ? 'Municípios' : modoSecao.uf ? `Capital de ${UF_NOMES[modoSecao.uf]}` : 'Capitais',
          itens: achados.map((m) => {
            const [, uf, cod] = m.id.split('-');
            return {
              ...m,
              id: `s-${m.id}-${modoSecao.zona}-${modoSecao.secao}`,
              tipo: 'secao' as const,
              rotulo: `${m.rotulo}`,
              sub: `${m.sub} · zona ${fmt4(modoSecao.zona)}, seção ${fmt4(modoSecao.secao)}`,
              to: rotaSecao(uf as UF, cod, modoSecao.zona, modoSecao.secao),
              icone: 'urna' as const,
            };
          }),
        },
      ];
    }
    if (!t) {
      const gs: Grupo[] = [];
      if (recentes.length)
        gs.push({
          id: 'recentes',
          titulo: 'Recentes',
          itens: recentes.map((r) => ({ ...r, chave: '' })),
          extra: (
            <button
              type="button"
              onClick={() => {
                limparRecentes();
                setRecentes([]);
                input.current?.focus();
              }}
              className="rounded-md px-1.5 text-[11.5px] font-medium text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Limpar
            </button>
          ),
        });
      gs.push({ id: 'atalhos', titulo: 'Atalhos', itens: PAGINAS });
      return gs;
    }
    const gs: Grupo[] = [];
    const cs = interpretarSecao(t);
    if (cs) {
      const base = cs.uf ? itensMun.filter((m) => m.id.startsWith(`m-${cs.uf}-`)) : itensMun;
      const achados = cs.resto ? buscar(base, cs.resto, 4) : [];
      const itens: Opcao[] = achados.map((m) => {
        const [, uf, cod] = m.id.split('-');
        return {
          ...m,
          id: `s-${m.id}-${cs.zona}-${cs.secao}`,
          tipo: 'secao' as const,
          rotulo: `Seção ${fmt4(cs.secao)} · Zona ${fmt4(cs.zona)}`,
          sub: `${m.rotulo} (${uf === 'ZZ' ? 'Exterior' : uf})`,
          to: rotaSecao(uf as UF, cod, cs.zona, cs.secao),
          icone: 'urna' as const,
        };
      });
      itens.push({
        id: `s-escolher-${cs.zona}-${cs.secao}`,
        tipo: 'secao',
        rotulo: `Seção ${fmt4(cs.secao)} · Zona ${fmt4(cs.zona)}`,
        sub: achados.length ? 'Outro município…' : cs.uf ? `Escolher o município em ${UF_NOMES[cs.uf]}…` : 'Escolher o município…',
        to: '',
        icone: 'urna',
        chave: '',
        dica: 'Escolher',
        acao: () => {
          setModoSecao(cs);
          setQ('');
          setAtivo(0);
          input.current?.focus();
        },
      });
      gs.push({ id: 'secao', titulo: 'Zona e seção', itens });
    }
    const ufs = buscar(itensUf, t, 3);
    const muns = buscar(itensMun, t, cs ? 3 : 7);
    const cands = buscar(itensCand, t, cs ? 3 : 6);
    const pags = buscar(PAGINAS, t, 3);
    if (ufs.length) gs.push({ id: 'ufs', titulo: 'Estados', itens: ufs });
    if (muns.length) gs.push({ id: 'muns', titulo: 'Municípios', itens: muns });
    if (cands.length) gs.push({ id: 'cands', titulo: 'Candidatos', itens: cands });
    if (pags.length) gs.push({ id: 'pags', titulo: 'Páginas', itens: pags });
    return gs;
  }, [q, modoSecao, itensMun, itensUf, itensCand, recentes]);

  const planas = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);
  useEffect(() => setAtivo(0), [q, modoSecao]);
  const idx = Math.min(ativo, Math.max(0, planas.length - 1));
  const idOpcao = (i: number) => `${idBase}-op-${i}`;

  // mantém a opção ativa visível
  useEffect(() => {
    const el = document.getElementById(idOpcao(idx));
    el?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((a) => (planas.length ? (Math.min(a, planas.length - 1) + 1) % planas.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => (planas.length ? (Math.min(a, planas.length - 1) - 1 + planas.length) % planas.length : 0));
    } else if (e.key === 'Home' && !q) {
      setAtivo(0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = planas[idx];
      if (op) ir(op);
    } else if (e.key === 'Backspace' && !q && modoSecao) {
      e.preventDefault();
      sairModo();
    }
  }

  const vazio = q.trim() !== '' && planas.length === 0;
  let contador = -1;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center sm:px-6 sm:pt-[10vh]">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-bg/75 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={onClose}
      />
      <motion.div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        tabIndex={-1}
        initial={{ opacity: 0, y: -10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-line bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] outline-none sm:h-auto sm:max-h-[min(640px,78vh)] sm:max-w-[640px] sm:rounded-3xl sm:border"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:pt-0">
          <Icon name="busca" size={20} className="shrink-0 text-fg-muted" />
          {modoSecao ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand/15 py-1 pl-2 pr-1 font-mono text-[12px] font-semibold text-brand-fg">
              Z {fmt4(modoSecao.zona)} · S {fmt4(modoSecao.secao)}
              <button
                type="button"
                onClick={sairModo}
                aria-label="Voltar à busca"
                className="inline-flex h-5 w-5 items-center justify-center rounded-md hover:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon name="fechar" size={12} />
              </button>
            </span>
          ) : null}
          <input
            ref={input}
            data-autofocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${idBase}-lista`}
            aria-autocomplete="list"
            aria-activedescendant={planas.length ? idOpcao(idx) : undefined}
            aria-label={modoSecao ? `Município da zona ${modoSecao.zona}, seção ${modoSecao.secao}` : 'Buscar município, estado, candidato ou seção'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={modoSecao ? 'Em qual município?' : 'Cidade, estado, candidato ou seção'}
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-fg placeholder:text-fg-subtle focus:outline-none sm:h-16 sm:text-[17px]"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                input.current?.focus();
              }}
              aria-label="Limpar"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"
            >
              <Icon name="fechar" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-medium text-brand-fg sm:hidden"
          >
            Cancelar
          </button>
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-fg-muted sm:inline-block">
            Esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-2.5">
          {vazio ? (
            <div className="px-4 py-10 text-center" role="status">
              <p className="text-[15px] font-medium text-fg">Nada encontrado para “{q.trim()}”</p>
              <p className="mt-1 text-[13px] text-fg-muted">
                {carregando ? 'Ainda carregando a lista de municípios e candidatos…' : 'Confira a grafia. Para uma seção, digite a UF, a zona e a seção: “SP 1 123”.'}
              </p>
            </div>
          ) : (
            <ul ref={lista} id={`${idBase}-lista`} role="listbox" aria-label="Resultados">
              {grupos.map((g) => (
                <li key={g.id} role="presentation" className="mb-1.5 last:mb-0">
                  <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                    <span id={`${idBase}-g-${g.id}`} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                      {g.titulo}
                    </span>
                    {g.extra}
                  </div>
                  <ul role="group" aria-labelledby={`${idBase}-g-${g.id}`}>
                    {g.itens.map((op) => {
                      contador++;
                      const i = contador;
                      const sel = i === idx;
                      return (
                        <li
                          key={op.id}
                          id={idOpcao(i)}
                          role="option"
                          aria-selected={sel}
                          onMouseMove={() => ativo !== i && setAtivo(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => ir(op)}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
                            sel ? 'bg-surface-3' : 'hover:bg-surface-2',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                              op.tipo === 'secao' ? 'bg-brand/15 text-brand-fg' : 'bg-surface-2 text-fg-muted',
                              sel && op.tipo !== 'secao' && 'bg-surface text-fg',
                            )}
                          >
                            <Icon name={op.icone} size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-medium text-fg">
                              <Realce texto={op.rotulo} q={op.tipo === 'secao' || g.id === 'recentes' ? '' : q} />
                            </span>
                            {op.sub ? <span className="block truncate text-[12.5px] text-fg-muted">{op.sub}</span> : null}
                          </span>
                          {sel ? (
                            <span aria-hidden className="hidden shrink-0 items-center gap-1 text-[11.5px] font-medium text-fg-muted sm:inline-flex">
                              {op.dica ?? 'Abrir'}
                              <span className="rounded border border-line bg-surface-2 px-1 font-sans text-[10.5px]">↵</span>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {!q.trim() && !modoSecao ? (
            <p className="mx-2.5 mb-2 mt-3 flex items-start gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-[12.5px] leading-snug text-fg-muted">
              <Icon name="urna" size={15} className="mt-px shrink-0" />
              <span>
                Sabe a zona e a seção do título? Digite a UF, a zona e a seção — por exemplo, <span className="font-mono text-fg">SP 1 123</span> ou{' '}
                <span className="font-mono text-fg">Recife 5 7</span> — e vá direto ao boletim.
              </span>
            </p>
          ) : null}
        </div>

        <div className="hidden items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2 text-[11.5px] text-fg-muted sm:flex">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Tecla>↑</Tecla>
              <Tecla>↓</Tecla> navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <Tecla>↵</Tecla> abrir
            </span>
            <span className="inline-flex items-center gap-1">
              <Tecla>Esc</Tecla> {modoSecao ? 'voltar' : 'fechar'}
            </span>
          </span>
          <span>{carregando ? 'Carregando…' : 'Busca sem acentos'}</span>
        </div>
      </motion.div>
    </div>
  );
}

function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface px-1 font-sans text-[10.5px] font-medium">{children}</kbd>;
}

function Realce({ texto, q }: { texto: string; q: string }) {
  const partes = realcar(texto, q.trim());
  return (
    <>
      {partes.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-brand/20 px-px text-fg">
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

