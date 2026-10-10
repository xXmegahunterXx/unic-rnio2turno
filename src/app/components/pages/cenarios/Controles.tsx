/**
 * Controles da calculadora: ponto de partida (presets neutros), "todos juntos", candidato a candidato (ordenados por
 * votos), quem votou branco/nulo no 1º turno e a variação do comparecimento. Todos acessíveis por teclado.
 */
import { useId, useState } from 'react';
import type { Cenario, CandidatoPresidenteT1, Divisao, PresidenteT1Dataset } from '@/shared/cenarios';
import {
  DELTA_COMPARECIMENTO_MAX,
  PASSO_DELTA,
  PRESETS,
  cenarioDoPreset,
  definirTodos,
  eliminadosDe,
  eliminadosUniformes,
  finalistasDe,
  mediaEliminados,
  normalizarDelta,
  partesDivisao,
  presetDoCenario,
  proporcaoFinalistasT1,
  type PresetId,
} from '@/shared/cenarios';
import { pctBrancos, pctComparecimento, pctValidos } from '@/shared/calc';
import { fmtCompact, fmtInt, fmtPP, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { Slider } from '@/app/ui/Slider';
import { BarraPartes, SliderDivisao } from './SliderDivisao';

export interface Nomes {
  a: string;
  b: string;
}

const cartao = 'rounded-2xl border border-line bg-surface shadow-card';

// =============================================================================================
// Ponto de partida
// =============================================================================================

export function descricaoPreset(id: PresetId, ds: PresidenteT1Dataset, nomes: Nomes): string {
  if (id === 'proporcional') {
    const p = Math.round(proporcaoFinalistasT1(ds));
    return `Os eleitores de cada candidato eliminado se dividem como os dos dois finalistas no 1º turno, no país: ${fmtPct(p, 0)} para ${nomes.a} e ${fmtPct(100 - p, 0)} para ${nomes.b}.`;
  }
  return PRESETS.find((p) => p.id === id)?.descricao ?? '';
}

export function Presets({ ds, cenario, nomes, onEscolher }: { ds: PresidenteT1Dataset; cenario: Cenario; nomes: Nomes; onEscolher: (c: Cenario) => void }) {
  const ativo = presetDoCenario(cenario, ds);
  const rotulo = useId();
  return (
    <section aria-labelledby={rotulo}>
      <h2 id={rotulo} className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">
        Comece por um ponto de partida
      </h2>
      <div role="group" aria-labelledby={rotulo} className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const sel = ativo === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={sel}
              onClick={() => onEscolher(cenarioDoPreset(p.id, ds))}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                sel ? 'border-brand bg-brand/15 text-fg' : 'border-line bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {sel ? <Icon name="check" size={16} className="text-brand-fg" /> : null}
              <span className="sm:hidden">{p.curto}</span>
              <span className="hidden sm:inline">{p.rotulo}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 min-h-[2.6em] text-[13.5px] leading-snug text-fg-muted" aria-live="polite">
        {ativo ? descricaoPreset(ativo, ds, nomes) : 'Cenário ajustado por você. Escolha um ponto de partida acima para recomeçar.'}
      </p>
    </section>
  );
}

// =============================================================================================
// Todos juntos
// =============================================================================================

export function ControleTodos({ ds, cenario, nomes, onChange }: { ds: PresidenteT1Dataset; cenario: Cenario; nomes: Nomes; onChange: (c: Cenario) => void }) {
  const elim = eliminadosDe(ds);
  const media = mediaEliminados(cenario, ds);
  const uniforme = eliminadosUniformes(cenario, ds);
  const total = elim.reduce((s, c) => s + c.votos, 0);
  const pctTotal = pctValidos({ votos: [total, ds.totais.validos - total] }, 0);
  const ninguem = media.escolhe === 0;
  return (
    <div className={cn(cartao, 'relative overflow-hidden p-4 sm:p-5')}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgb(var(--cand-a)/0.10),transparent_70%),radial-gradient(ellipse_60%_80%_at_100%_0%,rgb(var(--cand-b)/0.10),transparent_70%)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-fg">Todos de uma vez</h3>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              Os <span className="num">{elim.length}</span> candidatos eliminados juntos
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="num text-[15px] font-semibold text-fg">{fmtCompact(total)}</div>
            <div className="num text-[12px] text-fg-subtle">{fmtPct(pctTotal)} dos válidos</div>
          </div>
        </div>
        <SliderDivisao
          className="mt-3"
          valor={media.paraA}
          onChange={(v) => onChange(definirTodos(cenario, ds, { paraA: v }))}
          esquerda={{ rotulo: nomes.a, cor: 'a' }}
          direita={{ rotulo: nomes.b, cor: 'b' }}
          ariaLabel={`Todos os eleitores dos candidatos eliminados que escolhem um finalista: divisão entre ${nomes.a} e ${nomes.b}`}
          desabilitado={ninguem}
          avisoDesabilitado="Ninguém escolhe um finalista"
        />
        <Slider
          className="mt-3"
          label="Escolhem um dos finalistas"
          value={media.escolhe}
          onChange={(v) => onChange(definirTodos(cenario, ds, { escolhe: v }))}
          format={(v) => fmtPct(v, 0)}
          marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
        />
        {!uniforme ? (
          <p className="mt-3 flex gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-fg-muted">
            <Icon name="info" size={16} className="mt-px shrink-0 text-brand-fg" />
            Cada candidato está com uma divisão diferente (acima, a média ponderada pelos votos). Mexer aqui aplica o mesmo valor a todos.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// =============================================================================================
// Um grupo (candidato eliminado ou brancos/nulos do 1º turno)
// =============================================================================================

export interface ControleGrupoProps {
  titulo: string;
  subtitulo: string;
  votos: number;
  /** % de referência (dos válidos para candidatos; do comparecimento para brancos e nulos). */
  pct: number;
  rotuloPct: string;
  divisao: Divisao;
  onChange: (d: Divisao) => void;
  nomes: Nomes;
  /** 'brancos': o controle principal é "escolhem um finalista" (padrão 0%). */
  modo?: 'eliminado' | 'brancos';
}

export function ControleGrupo({ titulo, subtitulo, votos, pct, rotuloPct, divisao, onChange, nomes, modo = 'eliminado' }: ControleGrupoProps) {
  const [aberto, setAberto] = useState(modo === 'brancos' || divisao.escolhe < 100);
  const painel = useId();
  const ninguem = divisao.escolhe === 0;
  const set = (p: Partial<Divisao>) => onChange({ ...divisao, ...p });
  const sliderAB = (
    <SliderDivisao
      valor={divisao.paraA}
      onChange={(v) => set({ paraA: v })}
      esquerda={{ rotulo: nomes.a, cor: 'a' }}
      direita={{ rotulo: nomes.b, cor: 'b' }}
      ariaLabel={`${titulo}: entre quem escolhe um finalista, divisão entre ${nomes.a} e ${nomes.b}`}
      desabilitado={ninguem}
      avisoDesabilitado="Ninguém escolhe um finalista"
    />
  );
  const sliderEscolhe = (
    <Slider
      label="Escolhem um dos finalistas"
      value={divisao.escolhe}
      onChange={(v) => set({ escolhe: v })}
      format={(v) => fmtPct(v, 0)}
      marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
    />
  );
  const sliderBn =
    divisao.escolhe < 100 ? (
      <div>
        <p className="mb-0.5 text-[12.5px] font-medium text-fg">
          Quem não escolhe (<span className="num">{fmtPct(100 - divisao.escolhe, 0)}</span>)
        </p>
        <SliderDivisao
          tamanho="sm"
          valor={divisao.brancoNulo}
          onChange={(v) => set({ brancoNulo: v })}
          esquerda={{ rotulo: 'vota branco/nulo', cor: 'bn' }}
          direita={{ rotulo: 'não vai votar', cor: 'abs' }}
          ariaLabel={`${titulo}: quem não escolhe um finalista, divisão entre votar branco ou nulo e não comparecer`}
          marcaMeio={false}
        />
      </div>
    ) : null;

  return (
    <article className={cn(cartao, 'p-4 sm:p-5')}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15.5px] font-semibold leading-tight text-fg">{titulo}</h3>
          <p className="num mt-0.5 text-[12.5px] leading-snug text-fg-muted">{subtitulo}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[15px] font-semibold text-fg" title={`${fmtInt(votos)} votos`}>
            {fmtCompact(votos)}
          </div>
          <div className="num text-[12px] text-fg-subtle">
            {fmtPct(pct)} {rotuloPct}
          </div>
        </div>
      </header>

      <div className="mt-3 space-y-3">
        {modo === 'brancos' ? (
          <>
            {sliderEscolhe}
            {sliderAB}
          </>
        ) : (
          sliderAB
        )}
      </div>

      {modo === 'eliminado' ? (
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={painel}
          onClick={() => setAberto((x) => !x)}
          className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name={aberto ? 'chevron-cima' : 'chevron'} size={16} />
          {divisao.escolhe === 100 ? 'Abstenção e voto branco/nulo' : (
            <span>
              <span className="num">{fmtPct(100 - divisao.escolhe, 0)}</span> não escolhe finalista
            </span>
          )}
        </button>
      ) : null}

      <div id={painel} hidden={modo === 'eliminado' && !aberto} className="mt-2 space-y-3">
        {modo === 'eliminado' ? sliderEscolhe : null}
        {sliderBn}
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">No total, estes eleitores</p>
          <BarraPartes partes={partesDivisao(divisao)} nomes={nomes} />
        </div>
      </div>
    </article>
  );
}

/** Lista de candidatos eliminados (os 3 mais votados abertos; os demais sob "mostrar"). */
export function ListaEliminados({ ds, cenario, nomes, onChange }: { ds: PresidenteT1Dataset; cenario: Cenario; nomes: Nomes; onChange: (c: Cenario) => void }) {
  const elim = eliminadosDe(ds);
  const [todos, setTodos] = useState(false);
  const VISIVEIS = 3;
  const resto = elim.slice(VISIVEIS);
  const votosResto = resto.reduce((s, c) => s + c.votos, 0);
  const validosT1 = { votos: [votosResto, ds.totais.validos - votosResto] };
  const lista = todos ? elim : elim.slice(0, VISIVEIS);
  const idPainel = useId();
  const linha = (c: CandidatoPresidenteT1) => {
    const k = String(c.numero);
    const d = cenario.eliminados[k];
    if (!d) return null;
    return (
      <ControleGrupo
        key={k}
        titulo={c.nomeUrna}
        subtitulo={`${c.partido} · ${c.numero}`}
        votos={c.votos}
        pct={pctValidos({ votos: [c.votos, ds.totais.validos - c.votos] }, 0)}
        rotuloPct="dos válidos"
        divisao={d}
        onChange={(nd) => onChange({ ...cenario, eliminados: { ...cenario.eliminados, [k]: nd } })}
        nomes={nomes}
      />
    );
  };
  return (
    <div id={idPainel} className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {lista.map(linha)}
      {resto.length ? (
        <button
          type="button"
          aria-expanded={todos}
          aria-controls={idPainel}
          onClick={() => setTodos((x) => !x)}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-[14px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            todos && 'xl:col-span-2',
          )}
        >
          <Icon name={todos ? 'chevron-cima' : 'chevron'} size={18} />
          {todos ? (
            'Mostrar só os 3 mais votados'
          ) : (
            <span>
              Ajustar os outros <span className="num">{resto.length}</span> candidatos (<span className="num">{fmtPct(pctValidos(validosT1, 0))}</span> dos válidos)
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}

// =============================================================================================
// Brancos e nulos do 1º turno
// =============================================================================================

export function ControleBrancos({ ds, cenario, nomes, onChange }: { ds: PresidenteT1Dataset; cenario: Cenario; nomes: Nomes; onChange: (c: Cenario) => void }) {
  const t = ds.totais;
  const bn = t.brancos + t.nulos;
  return (
    <ControleGrupo
      modo="brancos"
      titulo="Quem votou branco ou nulo"
      subtitulo={`no 1º turno: ${fmtCompact(t.brancos)} brancos e ${fmtCompact(t.nulos)} nulos`}
      votos={bn}
      pct={pctBrancos({ brancos: bn, comparecimento: t.comparecimento })}
      rotuloPct="dos votos"
      divisao={cenario.brancosNulosT1}
      onChange={(d) => onChange({ ...cenario, brancosNulosT1: d })}
      nomes={nomes}
    />
  );
}

// =============================================================================================
// Comparecimento
// =============================================================================================

export function ControleComparecimento({ ds, cenario, nomes, onChange }: { ds: PresidenteT1Dataset; cenario: Cenario; nomes: Nomes; onChange: (c: Cenario) => void }) {
  const { delta, paraA } = cenario.comparecimento;
  const el = ds.totais.eleitorado;
  const pessoas = (Math.abs(delta) / 100) * el;
  const fmtDelta = (v: number) => (v === 0 ? 'igual' : fmtPP(v));
  return (
    <article className={cn(cartao, 'p-4 sm:p-5')}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-semibold leading-tight text-fg">Comparecimento</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            No 1º turno, <span className="num">{fmtPct(pctComparecimento({ comparecimento: ds.totais.comparecimento, eleitoradoTotalizado: el }), 1)}</span> do eleitorado votou
          </p>
        </div>
        {delta !== 0 ? (
          <div className="shrink-0 text-right">
            <div className="num text-[15px] font-semibold text-fg">{`${delta > 0 ? '+' : '−'}${fmtCompact(pessoas)}`}</div>
            <div className="text-[12px] text-fg-subtle">eleitores</div>
          </div>
        ) : null}
      </header>
      <Slider
        className="mt-3"
        label="Variação vs. 1º turno"
        value={delta}
        min={-DELTA_COMPARECIMENTO_MAX}
        max={DELTA_COMPARECIMENTO_MAX}
        step={PASSO_DELTA}
        origin={0}
        onChange={(v) => onChange({ ...cenario, comparecimento: { delta: normalizarDelta(v), paraA } })}
        format={fmtDelta}
        marks={[
          { value: -10, label: '−10' },
          { value: -5, label: '−5' },
          { value: 0, label: '0' },
          { value: 5, label: '+5' },
          { value: 10, label: '+10' },
        ]}
      />
      {delta !== 0 ? (
        <div className="mt-4">
          <p className="mb-0.5 text-[12.5px] font-medium text-fg">{delta > 0 ? 'Quem passa a votar escolhe' : 'Quem deixa de votar teria escolhido'}</p>
          <SliderDivisao
            tamanho="sm"
            valor={paraA}
            onChange={(v) => onChange({ ...cenario, comparecimento: { delta, paraA: v } })}
            esquerda={{ rotulo: nomes.a, cor: 'a' }}
            direita={{ rotulo: nomes.b, cor: 'b' }}
            ariaLabel={`Variação do comparecimento: divisão entre ${nomes.a} e ${nomes.b}`}
          />
          <p className="mt-1 text-[12px] text-fg-subtle">Com a mesma taxa de brancos e nulos do 1º turno em cada estado.</p>
        </div>
      ) : null}
    </article>
  );
}

/** Nomes dos finalistas para os controles. */
export const nomesDe = (ds: PresidenteT1Dataset): Nomes => {
  const { a, b } = finalistasDe(ds);
  return { a: a.nomeUrna, b: b.nomeUrna };
};
