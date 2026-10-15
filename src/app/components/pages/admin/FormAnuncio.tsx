/**
 * Formulário de um anúncio (criar/editar), pensado para o celular (390 px): uma coluna, campos grandes, barra de
 * salvar fixa no pé; no desktop, a prévia fica ao lado. Validação: a MESMA do motor/servidor (`validaAnuncio`).
 *
 * Imagens: upload redimensionado no navegador (anunciosAdmin.ts) — logo ≤ 512 px / 150 KB (SVG como está), peça
 * opcional ≤ 1600 px / 400 KB. Ao editar, as imagens chegam como URL do servidor e voltam assim (o servidor mantém).
 */
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ANUNCIO_LIMITES,
  FORMATOS_ANUNCIO,
  ROTULO_FORMATO,
  dominioAnuncio,
  idDaMarca,
  urlAnuncioValida,
  urlComUtm,
  validaAnuncio,
  type AnuncioConfig,
  type AnuncioPublico,
  type CotaAnuncio,
  type FormatoAnuncio,
} from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Button, Icon, Segmented, Toggle } from '@/app/ui';
import { useAdmin } from './dados';
import { AreaTexto, Callout, Campo, Painel, Passo, Rotulo } from './kit';
import { ONDE_APARECE, deCampoData, kbDe, paraCampoData, prepararLogo, prepararPeca } from './anunciosAdmin';
import { LogoAnuncio, PreviaAnuncio } from './PreviaAnuncio';

const L = ANUNCIO_LIMITES;

interface Rascunho {
  id: string;
  marca: string;
  titulo: string;
  texto: string;
  cta: string;
  url: string;
  logo?: string;
  imagem?: string;
  formatos: FormatoAnuncio[];
  peso: number;
  cota: CotaAnuncio;
  ativo: boolean;
  inicio: string;
  fim: string;
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
  naoPolitico: false,
});

const deConfig = (a: AnuncioConfig): Rascunho => ({
  id: a.id,
  marca: a.marca,
  titulo: a.titulo,
  texto: a.texto,
  cta: a.cta,
  url: a.url,
  logo: a.logo,
  imagem: a.imagem,
  formatos: [...a.formatos],
  peso: a.peso,
  cota: a.cota,
  ativo: a.ativo,
  inicio: paraCampoData(a.inicio),
  fim: paraCampoData(a.fim),
  // anúncio já publicado passou pela declaração; ao editar, a pessoa confirma de novo
  naoPolitico: false,
});

function paraConfig(r: Rascunho): unknown {
  return {
    id: r.id,
    marca: r.marca,
    titulo: r.titulo,
    texto: r.texto,
    cta: r.cta,
    url: r.url.trim(),
    ...(r.logo ? { logo: r.logo } : {}),
    ...(r.imagem ? { imagem: r.imagem } : {}),
    formatos: r.formatos,
    peso: r.peso,
    cota: r.cota,
    ativo: r.ativo,
    inicio: deCampoData(r.inicio),
    fim: deCampoData(r.fim),
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

/** Caixa de upload com miniatura, trocar e tirar. */
function CampoImagem({
  rotulo,
  dica,
  valor,
  aceita,
  preparar,
  onChange,
  logo,
}: {
  rotulo: string;
  dica: string;
  valor?: string;
  aceita: string;
  preparar: (f: File) => Promise<{ uri: string; info: string }>;
  onChange: (uri: string | undefined) => void;
  logo?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [lendo, setLendo] = useState(false);
  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setLendo(true);
    try {
      const r = await preparar(f);
      onChange(r.uri);
      setAviso({ texto: r.info, erro: false });
    } catch (err) {
      setAviso({ texto: err instanceof Error ? err.message : 'Não foi possível ler a imagem.', erro: true });
    } finally {
      setLendo(false);
    }
  }
  return (
    <div>
      <Rotulo className="mb-2">{rotulo}</Rotulo>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line/[2.5] bg-surface-2 transition-colors hover:border-brand/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            logo ? 'h-20 w-20' : 'h-20 w-32',
          )}
          aria-label={valor ? `Trocar ${rotulo.toLowerCase()}` : `Enviar ${rotulo.toLowerCase()}`}
        >
          {valor ? (
            <img src={valor} alt="" className={cn('max-h-full max-w-full object-contain', logo && 'bg-brand-ink p-1.5')} />
          ) : (
            <Icon name="mais" size={22} className="text-fg-subtle" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={valor ? 'troca' : 'mais'} loading={lendo} onClick={() => ref.current?.click()}>
              {valor ? 'Trocar' : 'Enviar imagem'}
            </Button>
            {valor ? (
              <Button variant="ghost" size="sm" icon="fechar" onClick={() => (onChange(undefined), setAviso(null))}>
                Tirar
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-fg-muted">
            {aviso ? <span className={cn(aviso.erro ? 'font-medium text-alert-fg' : 'num text-fg')}>{aviso.texto}</span> : dica}
            {!aviso && valor?.startsWith('data:') ? <span className="num"> · {kbDe(valor)} KB</span> : null}
          </p>
        </div>
      </div>
      <input ref={ref} type="file" accept={aceita} className="sr-only" tabIndex={-1} onChange={escolher} />
    </div>
  );
}

export function FormAnuncio({ inicial, onFechar }: { inicial: AnuncioConfig | null; onFechar: () => void }) {
  const { snap, run, pendente } = useAdmin();
  const lista = snap.state.anuncios ?? [];
  const editando = !!inicial;
  const [r, setR] = useState<Rascunho>(() => (inicial ? deConfig(inicial) : vazio()));
  const [idManual, setIdManual] = useState(editando);
  const [tentou, setTentou] = useState(false);
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));

  const setMarca = (marca: string) => setR((x) => ({ ...x, marca, id: idManual ? x.id : marca.trim() ? idDaMarca(marca) : '' }));
  const alternarFormato = (f: FormatoAnuncio) =>
    setR((x) => ({ ...x, formatos: x.formatos.includes(f) ? x.formatos.filter((y) => y !== f) : FORMATOS_ANUNCIO.filter((y) => y === f || x.formatos.includes(y)) }));

  const validacao = useMemo(() => validaAnuncio(paraConfig(r)), [r]);
  const idRepetido = !editando && lista.some((a) => a.id === r.id.trim().toLowerCase());
  const erroGeral = idRepetido ? 'Já existe um anúncio com este id: escolha outro.' : 'erro' in validacao ? validacao.erro : null;
  const urlOk = urlAnuncioValida(r.url.trim());

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
  };

  const previa: AnuncioPublico = {
    id: r.id || 'novo',
    marca: r.marca.trim() || 'Nome do anunciante',
    titulo: r.titulo.trim() || 'Chamada do anúncio',
    texto: r.texto.trim(),
    cta: r.cta.trim() || 'Saiba mais',
    href: urlOk ? urlComUtm(r.url.trim(), r.id || 'novo', 'link') : '#',
    destino: urlOk ? dominioAnuncio(r.url.trim()) : '',
    logo: r.logo,
    imagem: r.imagem,
    formatos: r.formatos,
    peso: r.peso,
    cota: r.cota,
  };

  async function salvar() {
    setTentou(true);
    if (!('ok' in validacao) || idRepetido) return;
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
        <LogoAnuncio anuncio={{ logo: r.logo, marca: r.marca || '?' }} tamanho="lg" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[28px]">
            {editando ? `Editar ${inicial!.marca}` : 'Novo anúncio'}
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

            <Grupo titulo="Imagens" descricao="Só redimensionadas no seu aparelho, sem nenhuma edição.">
              <CampoImagem
                rotulo="Logo"
                logo
                valor={r.logo}
                aceita="image/png,image/jpeg,image/webp,image/svg+xml"
                preparar={prepararLogo}
                onChange={(v) => set('logo', v)}
                dica="PNG, JPEG, WebP ou SVG. Reduzida para até 512 px e 150 KB."
              />
              <CampoImagem
                rotulo="Peça (opcional)"
                valor={r.imagem}
                aceita="image/png,image/jpeg,image/webp"
                preparar={prepararPeca}
                onChange={(v) => set('imagem', v)}
                dica="Banner do cartão patrocinado, exibido inteiro. Até 1600 px e 400 KB."
              />
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

            <Grupo titulo="Entrega" descricao="Master tem prioridade no topo, no Modo TV e nas imagens. Entre os demais, o peso decide a frequência.">
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
                    ]}
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-fg-muted">Peso na rotação</span>
                  <Passo rotulo="Peso" valor={r.peso} onChange={(v) => set('peso', v)} min={L.peso.min} max={L.peso.max} passo={1} />
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <Toggle checked={r.ativo} onChange={(v) => set('ativo', v)} label="Ativo" description="Desligado, o anúncio fica guardado mas não aparece." />
              </div>
              <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
                <Campo rotulo="Início (opcional)" type="datetime-local" value={r.inicio} onChange={(e) => set('inicio', e.target.value)} className="num" />
                <Campo rotulo="Fim (opcional)" type="datetime-local" value={r.fim} onChange={(e) => set('fim', e.target.value)} className="num" erro={erros.datas} />
              </div>
              <p className="-mt-2 text-[12px] text-fg-subtle">Horário de Brasília. Sem datas: no ar enquanto estiver ativo.</p>
            </Grupo>

            <Grupo titulo="Declaração">
              <label
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

            {tentou && erroGeral ? (
              <Callout tom="alerta" titulo="Falta ajustar">
                {erroGeral}
              </Callout>
            ) : null}

            {/* barra de ações: fixa no pé (acima da barra de controle do celular) */}
            <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:bottom-0">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onFechar} className="shrink-0">
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" icon="check" block loading={pendente('anuncio-salvar')} disabled={tentou && !!erroGeral}>
                  {editando ? 'Salvar alterações' : 'Publicar anúncio'}
                </Button>
              </div>
            </div>
          </form>
        </Painel>

        <div className="lg:sticky lg:top-[96px] lg:self-start">
          <Painel titulo="Prévia" icone="grade" subtitulo="Como fica em cada formato marcado.">
            <PreviaAnuncio anuncio={previa} />
          </Painel>
        </div>
      </div>
    </div>
  );
}
