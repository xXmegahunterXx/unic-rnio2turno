/**
 * Formulário de um anúncio (criar/editar/duplicar), pensado para o celular (390 px): uma coluna, campos grandes, barra
 * de salvar fixa no pé; no desktop, a prévia (tema claro e escuro) fica ao lado. Validação: a MESMA do motor/servidor
 * (`validaAnuncio`), mais o master sobreposto (`conflitoMaster`) antes de salvar e os avisos de venda
 * (`avisosDoAnuncio`, não bloqueiam).
 *
 * Imagens (anunciantes v2, CampoLogo.tsx): a logo é recortada, medida e gravada no aparelho (proporção natural e a
 * placa de cada tema, `AjusteImagem`), com a versão para fundo escuro opcional; a peça é sempre redesenhada (nunca JPEG
 * com transparência). Ao editar, as imagens chegam como URL do servidor e voltam assim (o servidor mantém).
 * Entrega: cota Master · Apoio · Reserva (empresas do grupo: só onde nenhum pago está no ar), peso, janela com atalhos
 * de data e a meta de impressões opcional (exige início).
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  ANUNCIO_LIMITES,
  FORMATOS_ANUNCIO,
  ROTULO_FORMATO,
  conflitoMaster,
  dominioAnuncio,
  idDaMarca,
  mensagemConflitoMaster,
  urlAnuncioValida,
  urlComUtm,
  validaAnuncio,
  type AjusteImagem,
  type AnuncioConfig,
  type AnuncioPublico,
  type FormatoAnuncio,
} from '@/shared/anuncios';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button, Icon, Segmented, Toggle, toast } from '@/app/ui';
import { useAdmin } from './dados';
import { AreaTexto, Callout, Campo, Painel, Passo, Rotulo } from './kit';
import {
  ATALHOS_META,
  ONDE_APARECE,
  atalhosData,
  avisosDoAnuncio,
  deCampoData,
  dicaAtalho,
  paraCampoData,
  type ForaDoAr,
} from './anunciosAdmin';
import { CampoLogo, CampoPeca } from './CampoLogo';
import { LogoAnuncio, PreviaAnuncio } from './PreviaAnuncio';

const L = ANUNCIO_LIMITES;

/** Cota no formulário: 'reserva' grava cota 'apoio' + `reserva: true`. */
type CotaForm = 'master' | 'apoio' | 'reserva';

interface Rascunho {
  id: string;
  marca: string;
  titulo: string;
  texto: string;
  cta: string;
  url: string;
  logo?: string;
  logoAjuste?: AjusteImagem;
  logoEscuro?: string;
  logoEscuroAjuste?: AjusteImagem;
  imagem?: string;
  imagemAjuste?: AjusteImagem;
  formatos: FormatoAnuncio[];
  peso: number;
  cota: CotaForm;
  ativo: boolean;
  inicio: string;
  fim: string;
  /** meta de impressões (só dígitos; vazio = sem meta) */
  meta: string;
  naoPolitico: boolean;
}

const vazio = (): Rascunho => ({
  id: '',
  marca: '',
  titulo: '',
  texto: '',
  cta: 'Saiba mais',
  url: 'https://',
  formatos: ['topo', 'nativo'],
  peso: 5,
  cota: 'apoio',
  ativo: true,
  inicio: '',
  fim: '',
  meta: '',
  naoPolitico: false,
});

/** Anúncio gravado (ou a cópia do Duplicar) → rascunho. `formatoExtra`: o "Preencher" do Espaços agora. */
const deConfig = (a: Omit<AnuncioConfig, 'naoPolitico'>, formatoExtra?: FormatoAnuncio): Rascunho => ({
  id: a.id,
  marca: a.marca,
  titulo: a.titulo,
  texto: a.texto,
  cta: a.cta,
  url: a.url,
  logo: a.logo,
  logoAjuste: a.logoAjuste,
  logoEscuro: a.logoEscuro,
  logoEscuroAjuste: a.logoEscuroAjuste,
  imagem: a.imagem,
  imagemAjuste: a.imagemAjuste,
  formatos: formatoExtra && !a.formatos.includes(formatoExtra) ? FORMATOS_ANUNCIO.filter((f) => f === formatoExtra || a.formatos.includes(f)) : [...a.formatos],
  peso: a.peso,
  cota: a.reserva ? 'reserva' : a.cota,
  ativo: a.ativo,
  inicio: paraCampoData(a.inicio),
  fim: paraCampoData(a.fim),
  meta: a.limiteImpressoes ? String(a.limiteImpressoes) : '',
  // anúncio já publicado passou pela declaração; ao editar, a pessoa confirma de novo
  naoPolitico: false,
});

/** Rascunho → o que vai para `validaAnuncio` (e ao servidor, pelo `validacao.ok`): os campos v2 vão junto. */
function paraConfig(r: Rascunho): unknown {
  const meta = r.meta.replace(/\D/g, '');
  return {
    id: r.id,
    marca: r.marca,
    titulo: r.titulo,
    texto: r.texto,
    cta: r.cta,
    url: r.url.trim(),
    ...(r.logo ? { logo: r.logo, ...(r.logoAjuste ? { logoAjuste: r.logoAjuste } : {}) } : {}),
    ...(r.logoEscuro ? { logoEscuro: r.logoEscuro, ...(r.logoEscuroAjuste ? { logoEscuroAjuste: r.logoEscuroAjuste } : {}) } : {}),
    ...(r.imagem ? { imagem: r.imagem, ...(r.imagemAjuste ? { imagemAjuste: r.imagemAjuste } : {}) } : {}),
    formatos: r.formatos,
    peso: r.peso,
    cota: r.cota === 'master' ? 'master' : 'apoio',
    ...(r.cota === 'reserva' ? { reserva: true } : {}),
    ativo: r.ativo,
    inicio: deCampoData(r.inicio),
    fim: deCampoData(r.fim),
    limiteImpressoes: meta ? Number(meta) : null,
    naoPolitico: r.naoPolitico,
  };
}

/** Contador "12/60" que avisa perto do limite. */
function Contador({ n, max }: { n: number; max: number }) {
  return <span className={cn('num shrink-0', n > max ? 'font-semibold text-alert-fg' : n > max - 10 ? 'text-fg' : 'text-fg-subtle')}>{`${n}/${max}`}</span>;
}

function Grupo({ titulo, descricao, children }: { titulo: string; descricao?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{titulo}</legend>
      <div aria-hidden>
        <Rotulo className="text-fg">{titulo}</Rotulo>
        {descricao ? <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">{descricao}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

/** Chips de atalho (datas e meta). */
function Chip({ children, onClick, disabled, title, ativo }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; ativo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ativo}
      className={cn(
        'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40',
        ativo ? 'border-brand/50 bg-brand/[0.1] text-brand-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line/[2.5] hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

export function FormAnuncio({
  inicial,
  modelo,
  formatoExtra,
  agora,
  fora,
  onFechar,
}: {
  /** anúncio a editar (null = novo) */
  inicial: AnuncioConfig | null;
  /** novo a partir de outro (Duplicar): o rascunho começa com ele, id novo, declaração desmarcada */
  modelo?: Omit<AnuncioConfig, 'naoPolitico'> | null;
  /** "Preencher" do Espaços agora: o formato já marcado */
  formatoExtra?: FormatoAnuncio;
  /** relógio do servidor (atalhos de data, meta e a fatia dos formatos) */
  agora: number;
  /** meta atingida / suspensão geral (fatia dos formatos nos avisos) */
  fora?: ForaDoAr;
  onFechar: () => void;
}) {
  const { snap, run, pendente } = useAdmin();
  const lista = snap.state.anuncios ?? [];
  const editando = !!inicial;
  const [r, setR] = useState<Rascunho>(() => (inicial ? deConfig(inicial, formatoExtra) : modelo ? deConfig(modelo, formatoExtra) : formatoExtra ? { ...vazio(), formatos: [formatoExtra] } : vazio()));
  const [idManual, setIdManual] = useState(editando || !!modelo);
  const [tentou, setTentou] = useState(false);
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));

  const setMarca = (marca: string) => setR((x) => ({ ...x, marca, id: idManual ? x.id : marca.trim() ? idDaMarca(marca) : '' }));
  const alternarFormato = (f: FormatoAnuncio) =>
    setR((x) => ({ ...x, formatos: x.formatos.includes(f) ? x.formatos.filter((y) => y !== f) : FORMATOS_ANUNCIO.filter((y) => y === f || x.formatos.includes(y)) }));
  /** meta: com meta e sem início, o início vira "agora" (a meta conta desde o início) */
  const setMeta = (v: string) =>
    setR((x) => {
      const meta = v.replace(/\D/g, '').slice(0, 8);
      return { ...x, meta, inicio: meta && !x.inicio.trim() ? paraCampoData(Math.floor(agora / 60_000) * 60_000) : x.inicio };
    });

  const validacao = useMemo(() => validaAnuncio(paraConfig(r)), [r]);
  const idRepetido = !editando && lista.some((a) => a.id === r.id.trim().toLowerCase());
  const urlOk = urlAnuncioValida(r.url.trim());
  const meta = r.meta ? Number(r.meta) : null;

  const erros = {
    marca: !r.marca.trim() ? 'Informe o nome do anunciante.' : r.marca.trim().length > L.marca ? `Até ${L.marca} caracteres.` : null,
    id: idRepetido ? 'Já existe um anúncio com este id.' : r.id && !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(r.id) ? 'Letras minúsculas, números e hífen (2 a 40).' : null,
    titulo: !r.titulo.trim() ? 'Escreva a chamada.' : r.titulo.trim().length > L.titulo ? `Até ${L.titulo} caracteres.` : null,
    cta: !r.cta.trim() ? 'Texto do botão.' : r.cta.trim().length > L.cta ? `Até ${L.cta} caracteres.` : null,
    url: !urlOk ? 'Use um endereço https:// completo (ex.: https://lynx.com.br).' : null,
    datas: (() => {
      const i = deCampoData(r.inicio);
      const f = deCampoData(r.fim);
      if (Number.isNaN(i) || Number.isNaN(f)) return 'Data inválida.';
      if (i !== null && f !== null && f <= i) return 'O fim precisa ser depois do início.';
      return null;
    })(),
    meta:
      meta !== null && (meta < L.limiteImpressoes.min || meta > L.limiteImpressoes.max)
        ? `De ${fmtInt(L.limiteImpressoes.min)} a ${fmtInt(L.limiteImpressoes.max)} impressões.`
        : meta !== null && !r.inicio.trim()
          ? 'Com meta, informe o início.'
          : null,
  };

  // avisos de venda (não bloqueiam): título cortado, apuração, logo sem ajuste, bebida, formato com 0% — lidos do
  // rascunho, antes de o formulário estar completo
  const data = (v: string) => {
    const ms = deCampoData(v);
    return ms === null || Number.isNaN(ms) ? null : ms;
  };
  const rascunhoCfg = {
    id: r.id.trim() || 'novo',
    marca: r.marca.trim() || 'anunciante',
    titulo: r.titulo,
    texto: r.texto,
    cta: r.cta,
    url: r.url.trim(),
    logo: r.logo,
    logoAjuste: r.logoAjuste,
    logoEscuro: r.logoEscuro,
    logoEscuroAjuste: r.logoEscuroAjuste,
    formatos: r.formatos,
    peso: r.peso,
    cota: r.cota === 'master' ? ('master' as const) : ('apoio' as const),
    ...(r.cota === 'reserva' ? { reserva: true as const } : {}),
    ativo: r.ativo,
    inicio: data(r.inicio),
    fim: data(r.fim),
  };
  const avisos = avisosDoAnuncio(rascunhoCfg, { anuncios: [...lista.filter((a) => a.id !== rascunhoCfg.id && a.id !== inicial?.id), rascunhoCfg], agora, fora });
  // venda: dois masters no mesmo formato prioritário e horário — mostrado já no rascunho (o servidor também recusa)
  const conflito = conflitoMaster(
    lista.filter((a) => a.id !== inicial?.id),
    rascunhoCfg,
  );

  const erroGeral = idRepetido
    ? 'Já existe um anúncio com este id: escolha outro.'
    : 'erro' in validacao
      ? validacao.erro
      : conflito
        ? mensagemConflitoMaster(conflito)
        : null;
  const previa: AnuncioPublico = {
    id: r.id || 'novo',
    marca: r.marca.trim() || 'Nome do anunciante',
    titulo: r.titulo.trim() || 'Chamada do anúncio',
    texto: r.texto.trim(),
    cta: r.cta.trim() || 'Saiba mais',
    href: urlOk ? urlComUtm(r.url.trim(), r.id || 'novo', 'link') : '#',
    destino: urlOk ? dominioAnuncio(r.url.trim()) : '',
    logo: r.logo,
    logoAjuste: r.logoAjuste,
    logoEscuro: r.logoEscuro,
    logoEscuroAjuste: r.logoEscuroAjuste,
    imagem: r.imagem,
    imagemAjuste: r.imagemAjuste,
    formatos: r.formatos,
    peso: r.peso,
    cota: r.cota === 'master' ? 'master' : 'apoio',
    ...(r.cota === 'reserva' ? { reserva: true as const } : {}),
  };
  const atalhos = atalhosData(agora);

  async function salvar() {
    setTentou(true);
    if (!('ok' in validacao) || idRepetido || conflito) {
      // mostra onde está o problema (no celular, o aviso fica longe do botão)
      toast(erroGeral ?? 'Confira os campos.', { tone: 'alert', duracao: 5000 });
      requestAnimationFrame(() =>
        document.querySelector('[aria-invalid="true"], [data-erro-form]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      );
      return;
    }
    const snapNovo = await run(
      { tipo: 'anuncio-salvar', anuncio: validacao.ok },
      { chave: 'anuncio-salvar', sucesso: editando ? `Anúncio de ${validacao.ok.marca} atualizado` : `Anúncio de ${validacao.ok.marca} criado` },
    );
    if (snapNovo) onFechar();
  }

  const mostrar = (e: string | null, preenchido: boolean) => (tentou || preenchido ? e : null);

  return (
    <div className="pb-4">
      <div className="mb-5 flex items-center gap-2">
        <Button variant="ghost" size="sm" icon="seta-esquerda" onClick={onFechar} className="-ml-2">
          Anunciantes
        </Button>
      </div>
      <header className="mb-5 flex items-center gap-3">
        <LogoAnuncio anuncio={{ logo: r.logo, logoAjuste: r.logoAjuste, logoEscuro: r.logoEscuro, logoEscuroAjuste: r.logoEscuroAjuste, marca: r.marca || '?' }} tamanho="xl" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[28px]">
            {editando ? `Editar ${inicial!.marca}` : modelo ? `Cópia de ${modelo.marca}` : 'Novo anúncio'}
          </h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">Só anunciantes e peças sem conteúdo político-eleitoral.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-6">
        <Painel>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
            noValidate
          >
            <Grupo titulo="Anunciante">
              <Campo
                rotulo="Marca"
                value={r.marca}
                maxLength={L.marca + 10}
                placeholder="Ex.: Lynx"
                autoComplete="off"
                onChange={(e) => setMarca(e.target.value)}
                erro={mostrar(erros.marca, !!r.marca)}
                dica={<span className="flex justify-between gap-3"><span>Como aparece no anúncio.</span><Contador n={r.marca.trim().length} max={L.marca} /></span>}
              />
              {editando ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <span className="block text-[12px] text-fg-muted">Identificador</span>
                    <span className="block truncate font-mono text-[13px] text-fg">{r.id}</span>
                  </div>
                  <Icon name="selo" size={16} className="text-fg-subtle" title="Fixo: identifica as métricas e o link" />
                </div>
              ) : (
                <Campo
                  rotulo="Identificador"
                  value={r.id}
                  mono
                  maxLength={L.id}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="lynx"
                  onChange={(e) => {
                    setIdManual(true);
                    set('id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  erro={mostrar(erros.id, !!r.id)}
                  dica="Gerado pela marca. Aparece no link (utm_campaign) e separa as métricas; não muda depois."
                />
              )}
            </Grupo>

            <Grupo titulo="Mensagem" descricao="Texto descritivo, sem menção a candidatos, partidos ou resultados.">
              <Campo
                rotulo="Chamada (título)"
                value={r.titulo}
                maxLength={L.titulo + 10}
                placeholder="Ex.: Pix na hora, sem taxa"
                onChange={(e) => set('titulo', e.target.value)}
                erro={mostrar(erros.titulo, !!r.titulo)}
                dica={<span className="flex justify-end"><Contador n={r.titulo.trim().length} max={L.titulo} /></span>}
              />
              <AreaTexto
                rotulo="Texto de apoio (opcional)"
                value={r.texto}
                maxLength={L.texto + 10}
                rows={3}
                className="min-h-[84px]"
                placeholder="Ex.: Abra sua conta em minutos, direto pelo celular."
                onChange={(e) => set('texto', e.target.value)}
                dica={<span className="flex justify-end"><Contador n={r.texto.trim().length} max={L.texto} /></span>}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <Campo
                  rotulo="Botão"
                  value={r.cta}
                  maxLength={L.cta + 6}
                  placeholder="Saiba mais"
                  onChange={(e) => set('cta', e.target.value)}
                  erro={mostrar(erros.cta, true)}
                />
                <Campo
                  rotulo="Link (https)"
                  value={r.url}
                  mono
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://lynx.com.br"
                  onChange={(e) => set('url', e.target.value.trim())}
                  erro={mostrar(erros.url, r.url !== 'https://' && !!r.url)}
                  dica={urlOk ? `Abre em nova aba, marcado como patrocinado (${dominioAnuncio(r.url.trim())}).` : undefined}
                />
              </div>
            </Grupo>

            <Grupo titulo="Imagens" descricao="Margens vazias cortadas e tamanho reduzido no seu aparelho; a imagem não é editada. Confira a prévia nos dois temas.">
              <CampoLogo
                rotulo="Logo"
                dataCampo="logo"
                marca={r.marca}
                valor={{ uri: r.logo, ajuste: r.logoAjuste }}
                onChange={(v) => setR((x) => ({ ...x, logo: v.uri, logoAjuste: v.ajuste }))}
              />
              <div className="border-t border-dashed border-line pt-4">
                <CampoLogo
                  rotulo="Versão para fundo escuro (opcional)"
                  dataCampo="logo-escuro"
                  escura
                  descricao="Se a sua marca tem versão branca ou clara, envie aqui: ela aparece no tema escuro, no Modo TV, nas lives e nas imagens de compartilhamento."
                  marca={r.marca}
                  valor={{ uri: r.logoEscuro, ajuste: r.logoEscuroAjuste }}
                  onChange={(v) => setR((x) => ({ ...x, logoEscuro: v.uri, logoEscuroAjuste: v.ajuste }))}
                />
              </div>
              <div className="border-t border-dashed border-line pt-4">
                <CampoPeca valor={{ uri: r.imagem, ajuste: r.imagemAjuste }} onChange={(v) => setR((x) => ({ ...x, imagem: v.uri, imagemAjuste: v.ajuste }))} />
              </div>
            </Grupo>

            <Grupo titulo="Onde aparece" descricao="Marque os formatos. Cada um rotulado como publicidade, sem pop-up e sem som.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FORMATOS_ANUNCIO.map((f) => {
                  const marcado = r.formatos.includes(f);
                  return (
                    <label
                      key={f}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors',
                        marcado ? 'border-brand/50 bg-brand/[0.07]' : 'border-line bg-surface-2/50 hover:border-line/[2.5]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternarFormato(f)}
                        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-line accent-[rgb(var(--brand))]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold leading-snug text-fg">{ROTULO_FORMATO[f]}</span>
                        <span className="mt-0.5 block text-pretty text-[12.5px] leading-snug text-fg-muted">{ONDE_APARECE[f]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {r.formatos.length === 0 && tentou ? <p className="text-[12.5px] font-medium text-alert-fg">Escolha pelo menos um formato.</p> : null}
            </Grupo>

            <Grupo titulo="Entrega" descricao="Master tem prioridade no topo, no Modo TV, nas lives e nas imagens. Entre os demais, o peso decide a frequência.">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-muted">Cota</span>
                  <Segmented
                    ariaLabel="Cota"
                    value={r.cota}
                    onChange={(v) => set('cota', v)}
                    options={[
                      { value: 'master', label: 'Master' },
                      { value: 'apoio', label: 'Apoio' },
                      { value: 'reserva', label: 'Reserva' },
                    ]}
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-muted">Peso na rotação</span>
                  <Passo rotulo="Peso" valor={r.peso} onChange={(v) => set('peso', v)} min={L.peso.min} max={L.peso.max} passo={1} />
                </div>
              </div>
              <p className="-mt-2 text-[12.5px] leading-snug text-fg-muted">
                {r.cota === 'master'
                  ? 'Master: prioridade no topo, no Modo TV, nas lives e nas imagens; também aparece nos cartões do conteúdo.'
                  : r.cota === 'reserva'
                    ? 'Empresas do grupo: aparece só onde nenhum anúncio pago está disponível.'
                    : 'Apoio: divide os espaços pelo peso; onde há master, ele tem prioridade.'}
              </p>
              <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <Toggle checked={r.ativo} onChange={(v) => set('ativo', v)} label="Ativo" description="Desligado, o anúncio fica guardado mas não aparece." />
              </div>
              <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
                <Campo rotulo={meta !== null ? 'Início' : 'Início (opcional)'} type="datetime-local" value={r.inicio} onChange={(e) => set('inicio', e.target.value)} className="num" erro={tentou || r.inicio ? (erros.meta === 'Com meta, informe o início.' ? erros.meta : null) : null} />
                <Campo rotulo="Fim (opcional)" type="datetime-local" value={r.fim} onChange={(e) => set('fim', e.target.value)} className="num" erro={erros.datas} />
              </div>
              <div className="-mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de data">
                {atalhos.map((t) => (
                  <Chip
                    key={t.id}
                    disabled={t.desabilitado}
                    title={dicaAtalho(t)}
                    onClick={() =>
                      setR((x) => ({
                        ...x,
                        inicio: t.inicio === undefined ? x.inicio : paraCampoData(t.inicio),
                        fim: t.fim === undefined ? x.fim : paraCampoData(t.fim),
                      }))
                    }
                  >
                    {t.id === 'ate-apuracao' ? 'Até a apuração (25/10 17h)' : t.id === 'noite' ? 'Noite (25/10 17h → 26/10 2h)' : t.id === 'depois' ? 'Depois (26/10 → 2/11)' : t.rotulo}
                  </Chip>
                ))}
              </div>
              <p className="-mt-2 text-[12px] text-fg-subtle">Horário de Brasília. Sem datas: no ar enquanto estiver ativo.</p>
              <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <Campo
                  rotulo="Impressões contratadas (opcional)"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Sem meta"
                  value={r.meta ? fmtInt(Number(r.meta)) : ''}
                  onChange={(e) => setMeta(e.target.value)}
                  className="num"
                  erro={tentou || r.meta ? erros.meta : null}
                  dica="Ao atingir, o anúncio sai do ar sozinho (conta as impressões visíveis desde o início). Aumentar ou tirar a meta o traz de volta."
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de meta">
                  {ATALHOS_META.map((n) => (
                    <Chip key={n} ativo={meta === n} onClick={() => setMeta(String(n))}>
                      <span className="num">{fmtInt(n / 1000)} mil</span>
                    </Chip>
                  ))}
                  <Chip ativo={meta === null} onClick={() => setMeta('')}>
                    Sem meta
                  </Chip>
                </div>
              </div>
            </Grupo>

            <Grupo titulo="Declaração">
              <label
                data-erro-form={tentou && !r.naoPolitico && !erros.marca && !erros.titulo && !erros.url && !erros.id ? '' : undefined}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors',
                  r.naoPolitico ? 'border-ok/45 bg-ok/[0.07]' : tentou ? 'border-alert/50 bg-alert/[0.06]' : 'border-line bg-surface-2/60',
                )}
              >
                <input
                  type="checkbox"
                  checked={r.naoPolitico}
                  onChange={(e) => set('naoPolitico', e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md accent-[rgb(var(--ok))]"
                />
                <span className="text-[14px] font-medium leading-snug text-fg">
                  Declaro que o anunciante e a peça não têm conteúdo político-eleitoral.
                  <span className="mt-1 block text-[12.5px] font-normal text-fg-muted">
                    Não é partido, federação, candidato, campanha, mandato nem órgão público, e a peça não fala de eleição (Lei 9.504/97).
                  </span>
                </span>
              </label>
            </Grupo>

            {conflito ? (
              <Callout tom="alerta" titulo="Master sobreposto" className="!mt-4">
                {mensagemConflitoMaster(conflito)}
              </Callout>
            ) : null}
            {avisos.length ? (
              <Callout tom="neutro" titulo="Avisos (não impedem publicar)">
                <ul className="num mt-1 list-disc space-y-1 pl-4">
                  {avisos.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </Callout>
            ) : null}
            {tentou && erroGeral && !conflito ? (
              <Callout tom="alerta" titulo="Falta ajustar">
                {erroGeral}
              </Callout>
            ) : null}

            {/* barra de ações: fixa no pé (acima da barra de controle do celular) */}
            <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 -mx-4 -mb-4 rounded-b-2xl border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 lg:bottom-0">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onFechar} className="shrink-0">
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" icon="check" block loading={pendente('anuncio-salvar')}>
                  {editando ? 'Salvar alterações' : r.ativo ? 'Publicar anúncio' : 'Guardar pausado'}
                </Button>
              </div>
            </div>
          </form>
        </Painel>

        <div className="lg:sticky lg:top-[96px] lg:max-h-[calc(100dvh-112px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:scrollbar-none">
          <Painel titulo="Prévia" icone="grade" subtitulo="Como fica em cada formato marcado.">
            <PreviaAnuncio anuncio={previa} />
          </Painel>
        </div>
      </div>
    </div>
  );
}
