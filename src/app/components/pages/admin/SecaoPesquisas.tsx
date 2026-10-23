/**
 * Seção "Pesquisas" do painel (pensada para o celular): as pesquisas REGISTRADAS do 2º turno publicadas em /pesquisas
 * (src/server/pesquisas.ts). Lista (semente + painel), incluir, editar, remover e restaurar; o formulário exige todos os
 * campos da Res. TSE 23.600/2019 (a mesma validação do servidor, `validaPesquisa`), mostra a prévia do cartão da página
 * e da imagem de compartilhar e só salva com a conferência marcada. O servidor valida de novo (zod + contrato).
 *
 * Regra: só pesquisa registrada no TSE e cada número conferido na fonte (link https). Nunca inventar, estimar ou
 * completar um número.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CartaoPesquisa, useCandidatosPesquisa } from '@/app/components/pesquisas/pecas';
import { CartaoPesquisaCompartilhar } from '@/app/components/pesquisas/Compartilhar';
import { PreviaCartao } from '@/app/components/share/PreviaCartao';
import type { FormatoCartao } from '@/app/components/share/tipos';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Icon, Segmented, Select, toast } from '@/app/ui';
import { UF_NOMES } from '@/shared/constants';
import { fmtDataHora, fmtInt } from '@/shared/format';
import {
  CARGOS_PESQUISA,
  CHAVE_BRANCOS_NULOS,
  CHAVE_INDECISOS,
  COLETA_MIN,
  DIVULGACAO_MAX,
  MODOS_PESQUISA,
  ROTULO_MODO,
  fmtDataPesquisa,
  fmtPctPesquisa,
  numerosDaPesquisa,
  rotuloCargo,
  rotuloCargoCurto,
  ufDoCargo,
  validaPesquisa,
  type CampoPesquisa,
  type CargoPesquisa,
  type ComandoPesquisa,
  type Pesquisa,
  type PesquisaNoPainel,
  type PesquisasAdmin,
} from '@/shared/pesquisas';
import { useAdmin } from './dados';
import { CabecalhoSecao, Callout, Campo, AreaTexto, Painel } from './kit';
import { entradaDe, formDe, formVazio, type FormPesquisa } from './pesquisasAdmin';
import { urlPublica } from './rotulos';

const CHAVE = ['admin', 'pesquisas'] as const;

class ErroPainel extends Error {
  constructor(
    msg: string,
    readonly campo?: CampoPesquisa,
  ) {
    super(msg);
  }
}

async function pedir(corpo?: ComandoPesquisa): Promise<PesquisasAdmin> {
  const r = await fetch('/api/admin/pesquisas', {
    method: corpo ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: corpo ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as PesquisasAdmin & { erro?: string; campo?: CampoPesquisa };
  if (!r.ok) throw new ErroPainel(j.erro ?? `Erro ${r.status}`, j.campo);
  return j;
}

/** Lista do painel (no demo, nada: sem servidor). */
export function usePesquisasAdmin(intervalo = 60_000) {
  return useQuery({ queryKey: CHAVE, queryFn: () => pedir(), enabled: !__DEMO__, refetchInterval: intervalo, refetchIntervalInBackground: false, retry: 1 });
}

type Filtro = 'todas' | 'pres' | 'gov';

export function SecaoPesquisas() {
  if (__DEMO__) {
    return (
      <div>
        <Cabecalho />
        <Callout tom="neutro" titulo="Só no servidor">
          As pesquisas incluídas pelo painel ficam no servidor do Sintonia. Nesta prévia estática, /pesquisas mostra só o arquivo semente
          (public/data/pesquisas.json).
        </Callout>
      </div>
    );
  }
  return <SecaoServidor />;
}

function Cabecalho({ acoes }: { acoes?: React.ReactNode }) {
  return (
    <CabecalhoSecao
      titulo="Pesquisas"
      icone="check-circulo"
      descricao="Pesquisas eleitorais registradas no TSE para o 2º turno, publicadas em /pesquisas com todas as informações obrigatórias e o link da fonte."
      acoes={acoes}
    />
  );
}

function SecaoServidor() {
  const { confirmar } = useAdmin();
  const qc = useQueryClient();
  const q = usePesquisasAdmin(30_000);
  const [form, setForm] = useState<FormPesquisa | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const d = q.data;

  async function cmd(c: ComandoPesquisa, sucesso: string): Promise<boolean> {
    setOcupado(c.acao === 'salvar' ? 'salvar' : `${c.acao}:${c.id}`);
    try {
      qc.setQueryData(CHAVE, await pedir(c));
      void qc.invalidateQueries({ queryKey: ['pesquisas'] });
      toast(sucesso, { tone: 'ok' });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível aplicar.', { tone: 'alert' });
      if (e instanceof ErroPainel) throw e;
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function remover(i: PesquisaNoPainel) {
    const ok = await confirmar({
      titulo: 'Tirar esta pesquisa do site?',
      descricao:
        i.origem === 'semente' || i.sobrepoeSemente
          ? `${i.pesquisa.instituto} (${i.pesquisa.registro}) sai do site. Ela continua no arquivo semente: dá para restaurar depois.`
          : `${i.pesquisa.instituto} (${i.pesquisa.registro}) sai do site e do painel. Não dá para desfazer.`,
      confirmar: 'Tirar do site',
      perigo: true,
    });
    if (ok) await cmd({ acao: 'remover', id: i.pesquisa.id }, 'Pesquisa tirada do site').catch(() => undefined);
  }

  if (!d) {
    return (
      <div>
        <Cabecalho />
        {q.isError ? (
          <Callout tom="alerta" titulo="Não foi possível carregar as pesquisas">
            {q.error instanceof Error ? q.error.message : 'Tente de novo em instantes.'}
          </Callout>
        ) : (
          <p className="text-[14px] text-fg-muted">Carregando…</p>
        )}
      </div>
    );
  }

  if (form) {
    return (
      <div>
        <Cabecalho />
        <Formulario
          dados={d}
          inicial={form}
          salvando={ocupado === 'salvar'}
          onCancelar={() => setForm(null)}
          onSalvar={async (corpo, novo) => {
            const ok = await cmd(corpo, novo ? 'Pesquisa incluída e publicada' : 'Pesquisa atualizada');
            if (ok) setForm(null);
          }}
        />
      </div>
    );
  }

  const noSite = d.itens.filter((i) => !i.removida);
  const lista = d.itens.filter((i) => (filtro === 'todas' ? true : filtro === 'pres' ? i.pesquisa.cargo === 'pres' : i.pesquisa.cargo !== 'pres'));
  return (
    <div>
      <Cabecalho
        acoes={
          <Button size="sm" variant="primary" icon="mais" onClick={() => setForm(formVazio(filtro === 'gov' ? (CARGOS_PESQUISA[1] ?? 'pres') : 'pres'))}>
            Incluir pesquisa
          </Button>
        }
      />
      <Callout tom="info" titulo="Antes de incluir" className="mb-4">
        Só pesquisa REGISTRADA no TSE (número BR-NNNNN/2026 para Presidente; a sigla do estado para Governador). Copie cada número da fonte (página do
        instituto, de quem contratou ou reportagem que cite os dados) e cole o link. Nunca estime nem complete um número; enquete não entra.
      </Callout>
      {d.semente.invalidas.length ? (
        <Callout tom="alerta" titulo={`${d.semente.invalidas.length} pesquisa(s) do arquivo semente fora do site`} className="mb-4">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {d.semente.invalidas.map((x, i) => (
              <li key={i}>
                {x.id ? <span className="font-mono text-[12px]">{x.id}: </span> : null}
                {x.erro}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filtro>
          ariaLabel="Mostrar"
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'todas', label: <Contagem rotulo="Todas" n={d.itens.length} /> },
            { value: 'pres', label: <Contagem rotulo="Presidente" n={d.itens.filter((i) => i.pesquisa.cargo === 'pres').length} /> },
            { value: 'gov', label: <Contagem rotulo="Governador" n={d.itens.filter((i) => i.pesquisa.cargo !== 'pres').length} /> },
          ]}
        />
        <a href={urlPublica('/pesquisas')} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-fg hover:underline">
          Ver /pesquisas ({fmtInt(noSite.length)} no site) <Icon name="externo" size={13} />
        </a>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-brand-fg">
            <Icon name="check-circulo" size={26} />
          </span>
          <h2 className="mt-4 font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">Nenhuma pesquisa aqui</h2>
          <p className="mt-1.5 max-w-sm text-pretty text-[13.5px] leading-relaxed text-fg-muted">
            Use “Incluir pesquisa” quando um instituto divulgar uma pesquisa registrada. Ela aparece em /pesquisas em até um minuto.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
          {lista.map((i) => (
            <ItemPesquisa
              key={i.pesquisa.id}
              i={i}
              ocupado={ocupado}
              onEditar={() => setForm(formDe(i.pesquisa))}
              onRemover={() => void remover(i)}
              onRestaurar={() => void cmd({ acao: 'restaurar', id: i.pesquisa.id }, 'Voltou a versão do arquivo semente').catch(() => undefined)}
            />
          ))}
        </ul>
      )}
      <p className="mt-4 text-[12.5px] leading-snug text-fg-subtle">
        Arquivo semente: {d.semente.lida ? `${fmtInt(d.semente.total)} pesquisa(s) válidas` : 'ainda não existe no servidor'}. O que o painel inclui, edita ou
        remove fica no servidor (STATE_DIR/pesquisas.json) e vale na hora para todo o site.
      </p>
    </div>
  );
}

function Contagem({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {rotulo}
      <span className="num text-[11.5px] text-fg-subtle">{fmtInt(n)}</span>
    </span>
  );
}

function ItemPesquisa({
  i,
  ocupado,
  onEditar,
  onRemover,
  onRestaurar,
}: {
  i: PesquisaNoPainel;
  ocupado: string | null;
  onEditar: () => void;
  onRemover: () => void;
  onRestaurar: () => void;
}) {
  const p = i.pesquisa;
  const nums = numerosDaPesquisa(p);
  return (
    <li className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card', i.removida && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge size="xs" tone="neutral">
          {rotuloCargoCurto(p.cargo)}
        </Badge>
        {i.removida ? (
          <Badge size="xs" tone="alert" caps>
            fora do site
          </Badge>
        ) : (
          <Badge size="xs" tone="ok" caps>
            no site
          </Badge>
        )}
        <Badge size="xs" tone={i.origem === 'painel' ? 'brand' : 'neutral'}>
          {i.origem === 'painel' ? (i.sobrepoeSemente ? 'editada no painel' : 'incluída no painel') : 'arquivo semente'}
        </Badge>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-display text-[17px] font-semibold leading-snug text-fg">{p.instituto}</span>
        <span className="num shrink-0 text-[12.5px] text-fg-muted">divulgada {fmtDataPesquisa(p.divulgadaEm)}</span>
      </div>
      <p className="num mt-0.5 text-[12.5px] text-fg-muted">
        <span className="font-mono">{p.registro}</span> · {p.contratante}
      </p>
      <p className="num mt-1.5 text-[14px] text-fg">
        {nums.map((n) => `${n}: ${fmtPctPesquisa(p.totais[String(n)])}`).join(' · ')}
        {p.validos ? <span className="text-fg-muted"> · válidos {nums.map((n) => fmtPctPesquisa(p.validos![String(n)])).join(' × ')}</span> : null}
      </p>
      {i.atualizadaEm ? <p className="num mt-1 text-[11.5px] text-fg-subtle">Gravada no painel em {fmtDataHora(i.atualizadaEm)}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!i.removida ? (
          <Button size="sm" variant="secondary" icon="ajustes" onClick={onEditar}>
            Editar
          </Button>
        ) : null}
        {!i.removida ? (
          <Button size="sm" variant="ghost" icon="fechar" onClick={onRemover} loading={ocupado === `remover:${p.id}`}>
            Tirar do site
          </Button>
        ) : null}
        {i.removida || i.sobrepoeSemente ? (
          <Button size="sm" variant="outline" icon="reset" onClick={onRestaurar} loading={ocupado === `restaurar:${p.id}`}>
            {i.removida ? 'Restaurar' : 'Voltar à versão do arquivo'}
          </Button>
        ) : null}
        {!i.removida ? (
          <a
            href={urlPublica(`/pesquisas?p=${encodeURIComponent(p.id)}`)}
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center gap-1 px-1 text-[12.5px] font-medium text-brand-fg hover:underline"
          >
            Ver no site <Icon name="externo" size={13} />
          </a>
        ) : null}
      </div>
    </li>
  );
}

// ---- formulário ------------------------------------------------------------------------------------------------

function Formulario({
  dados,
  inicial,
  salvando,
  onCancelar,
  onSalvar,
}: {
  dados: PesquisasAdmin;
  inicial: FormPesquisa;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: (c: ComandoPesquisa, novo: boolean) => Promise<void>;
}) {
  const [f, setF] = useState<FormPesquisa>(inicial);
  const [conferi, setConferi] = useState(false);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [erroServidor, setErroServidor] = useState<{ erro: string; campo?: CampoPesquisa } | null>(null);
  const [formatoPrevia, setFormatoPrevia] = useState<FormatoCartao>('x');
  const cands = dados.candidatos[f.cargo] ?? [];
  const numeros = useMemo(() => cands.map((c) => c.numero).sort((a, b) => a - b), [cands]);
  const entrada = useMemo(() => entradaDe(f, numeros), [f, numeros]);
  const v = useMemo(() => validaPesquisa(entrada, { candidatos: (c) => dados.candidatos[c]?.map((x) => x.numero), hoje: dados.hoje }), [entrada, dados]);
  const valida = 'ok' in v ? v.ok : null;
  const erro = mostrarErros ? (erroServidor ?? ('erro' in v ? v : null)) : null;
  const erroDe = (c: CampoPesquisa) => (erro && erro.campo === c ? erro.erro : undefined);
  const novo = !inicial.id;
  const set = <K extends keyof FormPesquisa>(k: K, val: FormPesquisa[K]) => {
    setErroServidor(null);
    setF((x) => ({ ...x, [k]: val }));
  };
  const setTotal = (k: string, val: string) => set('totais', { ...f.totais, [k]: val });
  const setValido = (k: string, val: string) => set('validos', { ...f.validos, [k]: val });
  const uf = ufDoCargo(f.cargo);
  const prefixo = uf ?? 'BR';

  async function salvar() {
    setMostrarErros(true);
    if (!valida || !conferi) return;
    try {
      await onSalvar({ acao: 'salvar', pesquisa: entrada }, novo);
    } catch (e) {
      const ep = e as { message?: string; campo?: CampoPesquisa };
      setErroServidor({ erro: ep.message ?? 'Erro ao salvar.', campo: ep.campo });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-6">
      <Painel
        titulo={novo ? 'Incluir pesquisa' : 'Editar pesquisa'}
        subtitulo="Todos os campos são exigidos pela Res. TSE 23.600/2019, menos o modo de coleta e os votos válidos."
        acoes={
          <Button size="sm" variant="ghost" icon="fechar" onClick={onCancelar}>
            Cancelar
          </Button>
        }
      >
        <div className="space-y-4">
          <Select
            label="Disputa"
            value={f.cargo}
            onChange={(e) => set('cargo', e.target.value as CargoPesquisa)}
            options={CARGOS_PESQUISA.map((c) => ({ value: c, label: rotuloCargo(c) }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Instituto (quem realizou)" value={f.instituto} onChange={(e) => set('instituto', e.target.value)} erro={erroDe('instituto')} placeholder="Nome do instituto" />
            <Campo
              rotulo="Contratante"
              value={f.contratante}
              onChange={(e) => set('contratante', e.target.value)}
              erro={erroDe('contratante')}
              dica="Como no registro. Se o próprio instituto pagou: “Nome (recursos próprios)”."
            />
          </div>
          <Campo
            rotulo="Registro no TSE"
            mono
            value={f.registro}
            onChange={(e) => set('registro', e.target.value)}
            erro={erroDe('registro')}
            placeholder={`${prefixo}-01234/2026`}
            dica={`${uf ? `Governador ${UF_NOMES[uf]}` : 'Presidente'}: ${prefixo}-NNNNN/2026 (5 dígitos), como no PesqEle.`}
            autoCapitalize="characters"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Início da coleta" type="date" min={COLETA_MIN} max={DIVULGACAO_MAX} value={f.coletaInicio} onChange={(e) => set('coletaInicio', e.target.value)} erro={erroDe('coletaInicio')} />
            <Campo rotulo="Fim da coleta" type="date" min={COLETA_MIN} max={DIVULGACAO_MAX} value={f.coletaFim} onChange={(e) => set('coletaFim', e.target.value)} erro={erroDe('coletaFim')} />
            <Campo rotulo="Divulgada em" type="date" min={COLETA_MIN} max={dados.hoje} value={f.divulgadaEm} onChange={(e) => set('divulgadaEm', e.target.value)} erro={erroDe('divulgadaEm')} />
          </div>
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <Campo rotulo="Entrevistas" inputMode="numeric" value={f.entrevistas} onChange={(e) => set('entrevistas', e.target.value)} erro={erroDe('entrevistas')} placeholder="2004" />
            <Campo rotulo="Margem de erro" inputMode="decimal" sufixo="pts" value={f.margemPp} onChange={(e) => set('margemPp', e.target.value)} erro={erroDe('margemPp')} placeholder="2" />
            <Campo rotulo="Confiança" inputMode="decimal" sufixo="%" value={f.confiancaPct} onChange={(e) => set('confiancaPct', e.target.value)} erro={erroDe('confiancaPct')} />
            <Select
              label="Modo (opcional)"
              value={f.modo}
              onChange={(e) => set('modo', e.target.value as FormPesquisa['modo'])}
              options={[{ value: '', label: '—' }, ...MODOS_PESQUISA.map((m) => ({ value: m, label: ROTULO_MODO[m] }))]}
            />
          </div>

          <fieldset className="rounded-xl border border-line p-3">
            <legend className="px-1 text-[13px] font-semibold text-fg">Votos totais (estimulada, em %)</legend>
            <div className="grid grid-cols-2 items-end gap-3">
              {numeros.map((n) => {
                const c = cands.find((x) => x.numero === n)!;
                return (
                  <Campo key={n} rotulo={`${c.nome} (${c.partido} · ${n})`} inputMode="decimal" sufixo="%" value={f.totais[String(n)] ?? ''} onChange={(e) => setTotal(String(n), e.target.value)} />
                );
              })}
              <Campo rotulo="Branco, nulo ou nenhum" inputMode="decimal" sufixo="%" value={f.totais[CHAVE_BRANCOS_NULOS] ?? ''} onChange={(e) => setTotal(CHAVE_BRANCOS_NULOS, e.target.value)} />
              <Campo rotulo="Não sabem / não responderam" inputMode="decimal" sufixo="%" value={f.totais[CHAVE_INDECISOS] ?? ''} onChange={(e) => setTotal(CHAVE_INDECISOS, e.target.value)} />
            </div>
            {erroDe('totais') ? <p className="mt-2 text-[12.5px] text-alert-fg">{erroDe('totais')}</p> : null}
            <p className="mt-2 text-[12px] text-fg-subtle">Copie como o instituto divulgou, sem arredondar (até duas casas decimais, ex.: 46,74). Deixe vazio o que ele não divulgou.</p>
          </fieldset>

          <fieldset className="rounded-xl border border-line p-3">
            <legend className="px-1 text-[13px] font-semibold text-fg">Votos válidos (opcional)</legend>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[13.5px] text-fg">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={f.comValidos} onChange={(e) => set('comValidos', e.target.checked)} />
              O instituto divulgou os votos válidos
            </label>
            {f.comValidos ? (
              <div className="mt-2 grid grid-cols-2 items-end gap-3">
                {numeros.map((n) => {
                  const c = cands.find((x) => x.numero === n)!;
                  return <Campo key={n} rotulo={`${c.nome} · válidos`} inputMode="decimal" sufixo="%" value={f.validos[String(n)] ?? ''} onChange={(e) => setValido(String(n), e.target.value)} />;
                })}
              </div>
            ) : null}
            {erroDe('validos') ? <p className="mt-2 text-[12.5px] text-alert-fg">{erroDe('validos')}</p> : null}
            <p className="mt-2 text-[12px] text-fg-subtle">Só se o instituto divulgou. O Sintonia nunca calcula válidos a partir dos totais.</p>
          </fieldset>

          <AreaTexto
            rotulo="Fontes (um link https por linha)"
            value={f.fontes}
            onChange={(e) => set('fontes', e.target.value)}
            placeholder="https://…"
            dica="Página do instituto, de quem contratou ou reportagem que cite os números e o registro."
            className="font-mono text-[13px]"
          />
          {erroDe('fontes') ? <p className="-mt-2 text-[12.5px] text-alert-fg">{erroDe('fontes')}</p> : null}

          <Campo
            rotulo="Aviso exigido pela Justiça Eleitoral (opcional)"
            value={f.aviso}
            onChange={(e) => set('aviso', e.target.value)}
            erro={erroDe('aviso')}
            placeholder="Só se uma decisão mandou constar algo na divulgação"
          />

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3 text-[13.5px] leading-snug text-fg">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
            <span>Conferi cada número na fonte e o número de registro no TSE. Nada foi estimado ou completado.</span>
          </label>

          {erro && !erro.campo ? (
            <Callout tom="alerta" titulo="Não dá para salvar ainda">
              {erro.erro}
            </Callout>
          ) : mostrarErros && erro ? (
            <Callout tom="alerta" titulo="Confira o campo marcado">
              {erro.erro}
            </Callout>
          ) : null}
          {mostrarErros && !conferi ? <p className="text-[12.5px] text-alert-fg">Marque a conferência para salvar.</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon="check" onClick={() => void salvar()} loading={salvando} disabled={salvando}>
              {novo ? 'Incluir e publicar' : 'Salvar alterações'}
            </Button>
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
            {!mostrarErros && 'erro' in v ? <span className="text-[12.5px] text-fg-muted">Falta: {v.erro}</span> : null}
          </div>
        </div>
      </Painel>

      <div className="space-y-4">
        <Painel titulo="Prévia no site" subtitulo="Como o cartão aparece em /pesquisas.">
          {valida ? <CartaoPesquisa p={valida} /> : <PreviaPendente />}
        </Painel>
        <Painel
          titulo="Prévia da imagem de compartilhar"
          subtitulo="Sem anúncio; todas as informações obrigatórias no rodapé."
          acoes={
            <Segmented<FormatoCartao>
              ariaLabel="Formato da prévia"
              size="sm"
              value={formatoPrevia}
              onChange={setFormatoPrevia}
              options={[
                { value: 'x', label: '16:9' },
                { value: 'feed', label: '4:5' },
                { value: 'story', label: '9:16' },
              ]}
            />
          }
        >
          {valida ? (
            <div className={cn(formatoPrevia === 'story' ? 'mx-auto max-w-[260px]' : formatoPrevia === 'feed' ? 'mx-auto max-w-[360px]' : '')}>
              <PreviaCartao formato={formatoPrevia}>
                <PreviaCompartilhar p={valida} formato={formatoPrevia} />
              </PreviaCartao>
            </div>
          ) : (
            <PreviaPendente />
          )}
        </Painel>
      </div>
    </div>
  );
}

/** Imagem de compartilhar com os nomes e as cores que vêm dos dados (meta.json), como no site. */
function PreviaCompartilhar({ p, formato }: { p: Pesquisa; formato: FormatoCartao }) {
  const cands = useCandidatosPesquisa(p.cargo, numerosDaPesquisa(p));
  return <CartaoPesquisaCompartilhar formato={formato} p={p} cands={cands} />;
}

function PreviaPendente() {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-[13px] text-fg-muted">
      <Icon name="info" size={20} className="mb-2 text-fg-subtle" />
      A prévia aparece quando todos os campos obrigatórios estiverem corretos.
    </div>
  );
}
