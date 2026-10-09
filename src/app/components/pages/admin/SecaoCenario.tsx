/**
 * Seção "Cenário": presets (simétricos) e editor avançado do ScenarioConfig. Aplicar reconstrói o modelo
 * (comando `cenario`/`preset`) — mostramos o carregamento e o tempo de construção.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { OrdemRegional, PresetInfo, Race, Ritmo, ScenarioConfig } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { Badge, Button, Icon, Segmented, Select, Skeleton, Slider } from '@/app/ui';
import { useAdmin, usePresets } from './dados';
import { CabecalhoSecao, Callout, Campo, Cronometro, DuelSlider, NotaNomesOcultos, Painel, Rotulo } from './kit';
import { fmtDec, fmtMs, ORDEM_ROTULO, RITMO_ROTULO } from './rotulos';

type Editavel = Pick<
  ScenarioConfig,
  | 'alvoPres'
  | 'alvoGov'
  | 'transferenciaOutros'
  | 'intensidadeRegional'
  | 'ruidoSecao'
  | 'comparecimentoDelta'
  | 'brancosFator'
  | 'nulosFator'
  | 'ritmo'
  | 'ordemRegional'
  | 'seed'
>;
type ChaveSimples = Exclude<keyof Editavel, 'alvoGov'>;
const CHAVES: ChaveSimples[] = [
  'alvoPres',
  'transferenciaOutros',
  'intensidadeRegional',
  'ruidoSecao',
  'comparecimentoDelta',
  'brancosFator',
  'nulosFator',
  'ritmo',
  'ordemRegional',
  'seed',
];

const igual = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;

const ORDEM_CURTA: Record<OrdemRegional, string> = {
  realista: 'Chegada realista',
  aleatoria: 'Ordem aleatória',
  'norte-primeiro': 'Norte/Nordeste primeiro',
  'sul-primeiro': 'Sul/Sudeste bem antes',
};

function chipsDoPreset(p: PresetInfo, base: PresetInfo | undefined): string[] {
  const c = p.cenario;
  const b = base?.cenario;
  if (!b) return [];
  const out: string[] = [];
  if (c.alvoGov && b.alvoGov && JSON.stringify(c.alvoGov) !== JSON.stringify(b.alvoGov)) {
    const vals = Object.values(c.alvoGov);
    out.push(vals.every((v) => v === vals[0]) ? `Governadores: A ${fmtPct(vals[0], 0)}` : 'Governadores ajustados');
  }
  if (c.ruidoSecao !== undefined && c.ruidoSecao !== b.ruidoSecao) out.push(c.ruidoSecao < (b.ruidoSecao ?? 0) ? 'Ruído baixo' : 'Ruído alto');
  if (c.ritmo && c.ritmo !== b.ritmo) out.push(`Ritmo ${RITMO_ROTULO[c.ritmo].toLowerCase()}`);
  if (c.ordemRegional && c.ordemRegional !== b.ordemRegional) out.push(ORDEM_CURTA[c.ordemRegional]);
  if (c.intensidadeRegional !== undefined && c.intensidadeRegional !== b.intensidadeRegional)
    out.push(c.intensidadeRegional === 0 ? 'Sem geografia' : `Geografia ×${fmtDec(c.intensidadeRegional)}`);
  const atrasos = Object.keys(c.ufAtraso ?? {});
  if (atrasos.length) out.push(`Atrasos: ${atrasos.join(', ')}`);
  return out;
}

export function SecaoCenario() {
  const { snap, pres, run, pendente, pendenteDesde, confirmar, races, anon, irPara } = useAdmin();
  const cen = snap.state.cenario;
  const presetsQ = usePresets(true, cen.seed);
  const presets = presetsQ.data;
  const padrao = presets?.find((p) => p.id === 'padrao');
  const nomes: [string, string] = [pres?.candidatos[0]?.nomeUrna ?? 'A', pres?.candidatos[1]?.nomeUrna ?? 'B'];
  const govRaces = useMemo(() => (races ?? []).filter((r) => r.cargo === 'Governador' && r.turno === 2), [races]);
  const ocupado = pendente('cenario');

  const presetAtual = presets?.find((p) => p.id === cen.preset);

  const [aplicando, setAplicando] = useState<string | null>(null);
  async function aplicarPreset(p: PresetInfo) {
    setAplicando(p.id);
    await run(
      { tipo: 'preset', preset: p.id },
      { chave: 'cenario', sucesso: (s) => `“${p.nome}” aplicado · modelo em ${fmtMs(s.metrics.modeloMs)}` },
    );
    setAplicando(null);
  }

  // ---- grupos: pares simétricos (…-a / …-b) e avulsos ----
  const { avulsos, pares } = useMemo(() => {
    const av: PresetInfo[] = [];
    const pr: [PresetInfo, PresetInfo][] = [];
    const lista = presets ?? [];
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      const n = lista[i + 1];
      if (p.id.endsWith('-a') && n && n.id === `${p.id.slice(0, -2)}-b`) {
        pr.push([p, n]);
        i++;
      } else av.push(p);
    }
    return { avulsos: av, pares: pr };
  }, [presets]);

  return (
    <div>
      <CabecalhoSecao
        titulo="Cenário"
        icone="ajustes"
        descricao="Escolha um preset ou ajuste o modelo. O motor é determinístico: mesmo cenário e mesma semente geram os mesmos números em qualquer máquina."
        acoes={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Badge tone="brand" size="md" icon="ajustes">
              {cen.preset === 'personalizado' ? 'Personalizado' : (presetAtual?.nome ?? cen.preset)}
            </Badge>
            {anon ? <NotaNomesOcultos onClick={() => irPara('fonte')} /> : null}
          </div>
        }
      />
      <Callout tom="alerta" titulo="Afeta todos os visitantes em tempo real" className="mb-5">
        Aplicar um preset ou cenário reconstrói o modelo e muda os números do site na hora, no mesmo instante do relógio.
      </Callout>

      <Painel
        titulo="Presets"
        icone="grade"
        subtitulo="Simétricos por regra: todo cenário que favorece um lado tem o espelho exato para o outro."
        acoes={
          ocupado ? (
            <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-brand-fg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
              Reconstruindo o modelo… <Cronometro desde={pendenteDesde('cenario')} />
            </span>
          ) : null
        }
      >
        {!presets ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44" rounded="lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {avulsos.map((p) => (
                <CartaoPreset key={p.id} p={p} base={padrao} ativo={cen.preset === p.id} nomes={nomes} ocupado={ocupado} carregando={aplicando === p.id} onAplicar={aplicarPreset} />
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Rotulo>Pares simétricos</Rotulo>
              <span className="h-px flex-1 bg-[rgb(var(--line)/var(--line-alpha))]" aria-hidden />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {pares.map(([a, b]) => (
                <div key={a.id} className="relative grid grid-cols-1 gap-2 rounded-[22px] border border-dashed border-line p-2 sm:grid-cols-2">
                  <CartaoPreset p={a} base={padrao} ativo={cen.preset === a.id} nomes={nomes} ocupado={ocupado} carregando={aplicando === a.id} onAplicar={aplicarPreset} compacto />
                  <CartaoPreset p={b} base={padrao} ativo={cen.preset === b.id} nomes={nomes} ocupado={ocupado} carregando={aplicando === b.id} onAplicar={aplicarPreset} compacto />
                  <span
                    aria-hidden
                    title="Espelho"
                    className="absolute left-1/2 top-1/2 z-10 hidden h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-card sm:inline-flex"
                  >
                    <Icon name="troca" size={14} />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Painel>

      <EditorAvancado
        key={JSON.stringify(cen)}
        cen={cen}
        nomes={nomes}
        govRaces={govRaces}
        ocupado={ocupado}
        desde={pendenteDesde('cenario')}
        onAplicar={async (parcial) =>
          (await run(
            { tipo: 'cenario', cenario: parcial },
            { chave: 'cenario', sucesso: (s) => `Cenário aplicado · modelo em ${fmtMs(s.metrics.modeloMs)}` },
          )) !== null
        }
        onPadrao={async () => {
          const ok = await confirmar({
            titulo: 'Restaurar o cenário padrão?',
            descricao: 'Volta ao preset “Padrão neutro”: 1º turno com transferência 50/50, sem viés nem atrasos por UF.',
            corpo: 'Os números do site mudam na hora para todos os visitantes. A semente atual é mantida.',
            confirmar: 'Restaurar padrão',
          });
          if (ok) await run({ tipo: 'preset', preset: 'padrao' }, { chave: 'cenario', sucesso: 'Cenário padrão restaurado' });
        }}
      />
    </div>
  );
}

function CartaoPreset({
  p,
  base,
  ativo,
  nomes,
  ocupado,
  carregando,
  compacto,
  onAplicar,
}: {
  p: PresetInfo;
  base: PresetInfo | undefined;
  ativo: boolean;
  nomes: [string, string];
  ocupado: boolean;
  carregando?: boolean;
  compacto?: boolean;
  onAplicar: (p: PresetInfo) => void;
}) {
  const alvo = p.cenario.alvoPres ?? 50;
  const chips = chipsDoPreset(p, base);
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col rounded-2xl border p-4 transition-colors',
        ativo ? 'border-brand/50 bg-brand/[0.07] shadow-glow' : 'border-line bg-surface-2/60 hover:border-line/[2]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[14.5px] font-semibold leading-snug text-fg">{p.nome}</h3>
        {ativo ? (
          <Badge tone="brand" size="xs" icon="check" caps>
            Em uso
          </Badge>
        ) : null}
      </div>
      <div className="mt-3" title={`${nomes[0]} ${fmtPct(alvo)} × ${nomes[1]} ${fmtPct(100 - alvo)} (Presidente, % dos válidos)`}>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <ChipSlot cor="a" />
            <span className="num font-semibold text-cand-a-fg">{fmtPct(alvo)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="num font-semibold text-cand-b-fg">{fmtPct(100 - alvo)}</span>
            <ChipSlot cor="b" />
          </span>
        </div>
        <VoteSplitBar votos={[alvo, 100 - alvo]} size="xs" nomes={nomes} />
      </div>
      <p className={cn('mt-3 text-pretty text-[12.5px] leading-relaxed text-fg-muted', compacto ? 'line-clamp-5' : 'line-clamp-6')}>{p.descricao}</p>
      {chips.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <Badge key={c} size="xs" tone="neutral">
              {c}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="mt-auto pt-3.5">
        <Button
          size="sm"
          variant={ativo ? 'ghost' : 'outline'}
          block
          disabled={ocupado && !carregando}
          loading={carregando}
          icon={ativo ? 'reset' : 'play'}
          onClick={() => onAplicar(p)}
          aria-label={`${ativo ? 'Reaplicar' : 'Aplicar'} preset ${p.nome}`}
        >
          {carregando ? 'Aplicando…' : ativo ? 'Reaplicar' : 'Aplicar'}
        </Button>
      </div>
    </article>
  );
}

/** Letra do slot (A = menor número na urna, turquesa; B = âmbar), como nos monogramas. */
function ChipSlot({ cor }: { cor: 'a' | 'b' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-[18px] w-[18px] items-center justify-center rounded-md text-[10.5px] font-bold',
        cor === 'a' ? 'bg-cand-a/15 text-cand-a-fg' : 'bg-cand-b/15 text-cand-b-fg',
      )}
    >
      {cor === 'a' ? 'A' : 'B'}
    </span>
  );
}

function Grupo({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold text-fg">{titulo}</h3>
        {descricao ? <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">{descricao}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Ajuste({ children, descricao, alterado }: { children: ReactNode; descricao?: string; alterado?: boolean }) {
  return (
    <div className={cn('relative min-w-0 rounded-xl px-0 py-0', alterado && 'before:absolute before:-left-3 before:bottom-1 before:top-1 before:w-[3px] before:rounded-full before:bg-brand')}>
      {children}
      {descricao ? <p className="mt-2 text-[12px] leading-snug text-fg-muted">{descricao}</p> : null}
    </div>
  );
}

function EditorAvancado({
  cen,
  nomes,
  govRaces,
  ocupado,
  desde,
  onAplicar,
  onPadrao,
}: {
  cen: ScenarioConfig;
  nomes: [string, string];
  govRaces: Race[];
  ocupado: boolean;
  desde: number | null;
  onAplicar: (parcial: Partial<ScenarioConfig>) => Promise<boolean>;
  onPadrao: () => void;
}) {
  const [ed, setEd] = useState<Partial<Editavel>>({});
  const v = <K extends ChaveSimples>(k: K): Editavel[K] => (ed[k] ?? cen[k]) as Editavel[K];
  const gov = (id: string) => ed.alvoGov?.[id] ?? cen.alvoGov[id] ?? 50;
  const set = <K extends ChaveSimples>(k: K, val: Editavel[K]) => setEd((e) => ({ ...e, [k]: val }));
  const setGov = (id: string, val: number) => setEd((e) => ({ ...e, alvoGov: { ...(e.alvoGov ?? {}), [id]: val } }));

  const alteradas = CHAVES.filter((k) => ed[k] !== undefined && !igual(ed[k], cen[k]));
  const govAlterados = Object.entries(ed.alvoGov ?? {}).filter(([id, val]) => !igual(val, cen.alvoGov[id]));
  const n = alteradas.length + govAlterados.length;
  const mudou = (k: ChaveSimples) => alteradas.includes(k);

  async function aplicar() {
    const parcial: Partial<ScenarioConfig> = {};
    for (const k of alteradas) (parcial as Record<string, unknown>)[k] = ed[k];
    if (govAlterados.length) parcial.alvoGov = Object.fromEntries(govAlterados);
    if (await onAplicar(parcial)) setEd({});
  }

  // valor do slider ao lado do rótulo: curto para não quebrar a linha no celular
  const curto0 = /^Candidato [AB]$/.test(nomes[0]) ? 'A' : nomes[0].split(' ')[0];
  const nomeGov = (r: Race): [string, string] => [r.candidatos[0]?.nomeUrna ?? 'A', r.candidatos[1]?.nomeUrna ?? 'B'];
  const fx = (x: number) => `×${fmtDec(x)}`;

  return (
    <Painel
      className="mt-5"
      titulo="Editor avançado"
      icone="configuracoes"
      subtitulo="Ajuste fino do modelo. Nada muda no site até você aplicar."
      acoes={
        n > 0 ? (
          <Badge tone="brand" size="sm" dot>
            {n} {n === 1 ? 'alteração' : 'alterações'} não aplicada{n === 1 ? '' : 's'}
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm" icon="check">
            Sincronizado
          </Badge>
        )
      }
      pt="pt-5"
    >
      <div className="space-y-6">
        <Grupo titulo="Presidente" descricao="Alvo nacional de votos válidos. A calibragem é aplicada antes do viés por UF.">
          <Ajuste alterado={mudou('alvoPres')}>
            <DuelSlider valor={v('alvoPres')} onChange={(x) => set('alvoPres', Math.round(x * 100) / 100)} nomes={nomes} rotulo="Alvo nacional para Presidente" alterado={mudou('alvoPres')} />
          </Ajuste>
        </Grupo>

        <Grupo titulo="Governadores" descricao="Alvo de votos válidos em cada uma das 7 disputas de 2º turno.">
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
            {govRaces.map((r) => {
              const id = r.id;
              const alt = govAlterados.some(([k]) => k === id);
              return (
                <Ajuste key={id} alterado={alt}>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    {UF_NOMES[r.abrangencia as keyof typeof UF_NOMES] ?? r.titulo}
                  </p>
                  <DuelSlider
                    compacto
                    min={30}
                    max={70}
                    passo={0.1}
                    valor={gov(id)}
                    onChange={(x) => setGov(id, Math.round(x * 100) / 100)}
                    nomes={nomeGov(r)}
                    rotulo={`Alvo para ${r.titulo}`}
                    alterado={alt}
                  />
                </Ajuste>
              );
            })}
          </div>
        </Grupo>

        <Grupo titulo="Eleitorado" descricao="Como os votos se distribuem pelo país e quanto as urnas variam entre si.">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            <Ajuste alterado={mudou('transferenciaOutros')} descricao={`Parte dos votos dos demais candidatos do 1º turno que migra para ${nomes[0]} antes da calibragem. Muda a geografia, não o total.`}>
              <Slider
                label="Transferência dos demais votos"
                value={v('transferenciaOutros') * 100}
                onChange={(x) => set('transferenciaOutros', Math.round(x) / 100)}
                min={0}
                max={100}
                step={1}
                format={(x) => `${fmtPct(x, 0)} → ${curto0}`}
                marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
              />
            </Ajuste>
            <Ajuste alterado={mudou('intensidadeRegional')} descricao="Quanto da geografia do 1º turno se mantém: 0 = país uniforme, 1 = igual ao 1º turno.">
              <Slider
                label="Intensidade regional"
                value={v('intensidadeRegional')}
                onChange={(x) => set('intensidadeRegional', Math.round(x * 100) / 100)}
                min={0}
                max={1.5}
                step={0.05}
                format={fx}
                marks={[{ value: 0, label: 'uniforme' }, { value: 1, label: '1º turno' }, { value: 1.5, label: '×1,5' }]}
              />
            </Ajuste>
            <Ajuste alterado={mudou('ruidoSecao')} descricao="Variação aleatória entre seções vizinhas (desvio em logit). Baixo = urnas parecidas.">
              <Slider
                label="Ruído por seção"
                value={v('ruidoSecao')}
                onChange={(x) => set('ruidoSecao', Math.round(x * 100) / 100)}
                min={0.05}
                max={0.6}
                step={0.01}
                format={(x) => fmtDec(x)}
                marks={[{ value: 0.05, label: 'baixo' }, { value: 0.25 }, { value: 0.6, label: 'alto' }]}
              />
            </Ajuste>
            <Ajuste alterado={mudou('comparecimentoDelta')} descricao="Variação do comparecimento em relação ao 1º turno, em todos os municípios.">
              <Slider
                label="Comparecimento"
                value={v('comparecimentoDelta')}
                onChange={(x) => set('comparecimentoDelta', Math.round(x * 10) / 10)}
                min={-10}
                max={10}
                step={0.5}
                origin={0}
                format={(x) => (x === 0 ? 'igual ao 1º turno' : fmtPP(x))}
                marks={[{ value: -10, label: '−10' }, { value: 0, label: '0' }, { value: 10, label: '+10' }]}
              />
            </Ajuste>
            <Ajuste alterado={mudou('brancosFator')} descricao="Multiplica a taxa de votos brancos do 1º turno.">
              <Slider label="Brancos" value={v('brancosFator')} onChange={(x) => set('brancosFator', Math.round(x * 100) / 100)} min={0} max={3} step={0.05} origin={1} format={fx} marks={[{ value: 0, label: '×0' }, { value: 1, label: '×1' }, { value: 3, label: '×3' }]} />
            </Ajuste>
            <Ajuste alterado={mudou('nulosFator')} descricao="Multiplica a taxa de votos nulos do 1º turno.">
              <Slider label="Nulos" value={v('nulosFator')} onChange={(x) => set('nulosFator', Math.round(x * 100) / 100)} min={0} max={3} step={0.05} origin={1} format={fx} marks={[{ value: 0, label: '×0' }, { value: 1, label: '×1' }, { value: 3, label: '×3' }]} />
            </Ajuste>
          </div>
        </Grupo>

        <Grupo titulo="Ritmo da totalização" descricao="Velocidade e ordem em que as seções chegam ao longo da noite.">
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
            <Ajuste alterado={mudou('ritmo')} descricao="Rápido = tudo 25% mais cedo; lento = 40% mais demorado.">
              <p className="mb-2 text-sm font-medium text-fg">Ritmo</p>
              <Segmented<Ritmo>
                ariaLabel="Ritmo da totalização"
                options={(['rapido', 'normal', 'lento'] as Ritmo[]).map((r) => ({ value: r, label: RITMO_ROTULO[r] }))}
                value={v('ritmo')}
                onChange={(r) => set('ritmo', r)}
                block
              />
            </Ajuste>
            <Ajuste alterado={mudou('ordemRegional')} descricao="Qual região chega primeiro. Ordens diferentes produzem viradas em momentos diferentes.">
              <Select
                label="Ordem regional"
                options={(Object.keys(ORDEM_ROTULO) as OrdemRegional[]).map((o) => ({ value: o, label: ORDEM_ROTULO[o] }))}
                value={v('ordemRegional')}
                onChange={(e) => set('ordemRegional', e.target.value as OrdemRegional)}
              />
            </Ajuste>
          </div>
        </Grupo>

        <Grupo titulo="Semente" descricao="Mesma semente + mesmo cenário = mesmos números. Troque para outra noite com o mesmo perfil.">
          <Ajuste alterado={mudou('seed')}>
            <div className="flex max-w-md items-end gap-2">
              <Campo
                rotulo="Semente aleatória"
                inputMode="numeric"
                mono
                value={String(v('seed'))}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 15);
                  set('seed', d ? Number(d) : 0);
                }}
                wrapperClassName="flex-1"
              />
              <Button variant="outline" icon="troca" onClick={() => set('seed', Math.floor(Math.random() * 99_999_999) + 1)}>
                Sortear
              </Button>
            </div>
          </Ajuste>
        </Grupo>
      </div>

      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 flex items-center justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:bottom-0 lg:rounded-b-2xl">
        <Button variant="ghost" icon="reset" onClick={onPadrao} disabled={ocupado} className="mr-auto shrink-0 px-3 sm:px-4" aria-label="Restaurar padrão">
          <span className="sm:hidden">Padrão</span>
          <span className="hidden sm:inline">Restaurar padrão</span>
        </Button>
        {n > 0 ? (
          <Button variant="outline" onClick={() => setEd({})} disabled={ocupado} className="shrink-0 px-3 sm:px-4">
            Descartar
          </Button>
        ) : null}
        <Button variant="primary" icon="check" onClick={aplicar} disabled={n === 0 || ocupado} loading={ocupado} className="shrink-0 px-3.5 sm:px-4">
          {ocupado ? (
            <>
              <span className="hidden sm:inline">Reconstruindo…</span> <Cronometro desde={desde} />
            </>
          ) : (
            <>
              Aplicar<span className="hidden sm:inline"> cenário</span>
            </>
          )}
        </Button>
      </div>
    </Painel>
  );
}
