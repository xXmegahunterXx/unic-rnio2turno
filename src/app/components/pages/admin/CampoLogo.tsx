/**
 * Campos de imagem do formulário de anúncio (anunciantes v2, E3 e E5): a logo (usada duas vezes — "Logo" e "Versão
 * para fundo escuro") e a peça.
 *
 * Ao escolher o arquivo, a imagem é recortada (margens vazias fora), medida (contraste da silhueta nos dois temas) e
 * gravada — tudo no aparelho, em analiseLogo.ts. O data URI ORIGINAL fica em memória: "Cortar margens vazias" desliga e
 * religa sem ler o arquivo de novo (e volta exatamente ao recorte anterior). A prévia mostra a imagem no tema claro e no
 * escuro lado a lado, com o `LogoMarca` real do site (TemaLocal + data-tema-local). As linhas "Tema claro/escuro" leem o
 * AJUSTE ATUAL (o que vai ao ar), não a análise.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { AjusteImagem, PlacaLogo } from '@/shared/anuncios';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Button, Icon, Segmented, Toggle } from '@/app/ui';
import { LogoMarca, TemaLocal, placaDaPeca, type TemaLogo } from '@/app/components/anuncios';
import { Callout, Rotulo } from './kit';
import {
  AVISO_SEM_MEDIDA,
  ErroImagem,
  comFundoEscolhido,
  kbDeUri,
  lerFonte,
  linhaDimensoes,
  prepararLogoV2,
  prepararPecaV2,
  type AnalisePixels,
  type FonteImagem,
  type FundoEscolhido,
  type ImagemPreparadaV2,
  type LogoPreparada,
} from './analiseLogo';

/** Imagem do anúncio e o ajuste dela (logo, versão escura ou peça). */
export interface ValorImagem {
  uri?: string;
  ajuste?: AjusteImagem;
}

const TEMAS: readonly TemaLogo[] = ['claro', 'escuro'];
const NOME_TEMA: Record<TemaLogo, string> = { claro: 'Tema claro', escuro: 'Tema escuro' };
const ROTULO_PLACA: Record<PlacaLogo, string> = { nenhuma: 'sem placa', clara: 'placa clara', escura: 'placa escura' };

/** Lê uma imagem já gravada (URL do servidor, mesma origem, ou data URI) para medir ou reprocessar no aparelho. */
export async function fonteDaUrl(uri: string): Promise<FonteImagem> {
  const r = await fetch(uri, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`Erro ${r.status}`);
  return lerFonte(await r.blob());
}

/**
 * Por que o tema tem (ou não) placa, em poucas palavras — lido do AJUSTE ATUAL. Com a análise à mão (envio desta
 * sessão), diz se a logo inteira sumiria ou só partes dela.
 */
export function motivoPlaca(ajuste: AjusteImagem, tema: TemaLogo, analise: AnalisePixels | null, nome: 'logo' | 'peça' = 'logo'): string {
  if (ajuste.origem === 'manual') return 'escolhido por você';
  if (ajuste.comFundo) return 'a imagem já traz o próprio fundo';
  const placa = tema === 'claro' ? ajuste.placaClaro : ajuste.placaEscuro;
  if (placa === 'nenhuma') return 'bom contraste';
  const some = analise ? (tema === 'claro' ? analise.someNoClaro : analise.someNoEscuro) : null;
  // a placa "do outro tema" (clara no claro, escura no escuro): some nos dois, ficou a que esconde menos
  if ((tema === 'claro' && placa === 'clara') || (tema === 'escuro' && placa === 'escura')) return 'partes claras e escuras sumiriam: a placa que esconde menos';
  if (some !== null && some >= 0.5) return tema === 'claro' ? `a ${nome} é clara e sumiria no fundo claro` : `a ${nome} é escura e sumiria no fundo escuro`;
  return tema === 'claro' ? 'partes claras sumiriam no fundo claro' : 'partes escuras sumiriam no fundo escuro';
}

/** Duas metades lado a lado, uma por tema (TemaLocal + data-tema-local): o mesmo desenho do site em cada uma. */
export function PreviaTemas({ children, className }: { children: (tema: TemaLogo) => ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 overflow-hidden rounded-2xl border border-line', className)}>
      {TEMAS.map((t) => (
        <TemaLocal.Provider key={t} value={t}>
          <div data-tema-local={t} className="flex min-w-0 flex-col items-center justify-center gap-3 bg-surface px-2.5 pb-3 pt-4">
            {children(t)}
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{NOME_TEMA[t]}</span>
          </div>
        </TemaLocal.Provider>
      ))}
    </div>
  );
}

/** Linhas "Tema claro: placa escura (motivo)". */
function LinhasTema({ ajuste, analise, nome = 'logo' }: { ajuste: AjusteImagem; analise: AnalisePixels | null; nome?: 'logo' | 'peça' }) {
  return (
    <>
      {TEMAS.map((t) => {
        const placa = t === 'claro' ? ajuste.placaClaro : ajuste.placaEscuro;
        return (
          <p key={t} data-linha-tema={t} data-placa={placa}>
            <span className="font-semibold text-fg">{NOME_TEMA[t]}:</span> {ROTULO_PLACA[placa]} ({motivoPlaca(ajuste, t, analise, nome)})
          </p>
        );
      })}
    </>
  );
}

/** Botão grande de envio (campo vazio). */
function Soltar({ rotulo, onClick, lendo }: { rotulo: string; onClick: () => void; lendo: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={lendo}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border border-dashed border-line/[2.5] bg-surface-2/60 px-4 py-4 text-left transition-colors hover:border-brand/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
      )}
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
        <Icon name={lendo ? 'relogio' : 'mais'} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-fg">{lendo ? 'Preparando a imagem…' : rotulo}</span>
        <span className="mt-0.5 block text-[12px] text-fg-muted">PNG, JPEG, WebP ou SVG</span>
      </span>
    </button>
  );
}

const OPCOES_FUNDO: { value: FundoEscolhido; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'nenhuma', label: 'Sem placa' },
  { value: 'clara', label: 'Clara' },
  { value: 'escura', label: 'Escura' },
];

/**
 * Campo de logo inteligente (E3). `escura`: é a "Versão para fundo escuro" (sem o aviso de mandar versão escura).
 * `onChange` recebe a imagem e o ajuste juntos (`{}` = sem imagem).
 */
export function CampoLogo({
  rotulo,
  descricao,
  valor,
  marca,
  onChange,
  escura = false,
  dataCampo,
}: {
  rotulo: string;
  descricao?: ReactNode;
  valor: ValorImagem;
  marca: string;
  onChange: (v: ValorImagem) => void;
  escura?: boolean;
  /** atributo `data-campo-logo` (testes do navegador) */
  dataCampo?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<FonteImagem | null>(null);
  /** processamentos já feitos com o original desta sessão (com e sem recorte): desligar e religar volta ao MESMO arquivo */
  const cache = useRef(new Map<string, LogoPreparada>());
  const [prep, setPrep] = useState<LogoPreparada | null>(null);
  const [recortar, setRecortar] = useState(true);
  const fundo: FundoEscolhido = valor.ajuste?.origem === 'manual' ? valor.ajuste.placaEscuro : 'auto';
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  /** placas automáticas (a medida) da imagem atual, para "Automático" depois de uma escolha manual */
  const [auto, setAuto] = useState<Pick<AjusteImagem, 'placaClaro' | 'placaEscuro'> | null>(valor.ajuste?.origem === 'auto' ? valor.ajuste : null);

  // imagem trocada por fora (Duplicar, desfazer): esquece o original desta sessão
  useEffect(() => {
    if (prep && prep.uri !== valor.uri) {
      setPrep(null);
      setOriginal(null);
      cache.current.clear();
    }
    if (!valor.uri) setAuto(null);
  }, [valor.uri, prep]);

  async function processar(f: FonteImagem, opc: { recortar: boolean; fundo: FundoEscolhido }) {
    setLendo(true);
    try {
      const chave = String(opc.recortar);
      let p = cache.current.get(chave);
      if (!p) {
        p = await prepararLogoV2(f, { recortar: opc.recortar, fundo: 'auto' });
        cache.current.set(chave, p);
      }
      const ajuste = comFundoEscolhido(p.ajuste, p.ajuste, opc.fundo);
      setPrep(p);
      setAuto({ placaClaro: p.ajuste.placaClaro, placaEscuro: p.ajuste.placaEscuro });
      onChange({ uri: p.uri, ajuste });
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroImagem ? e.message : 'Não foi possível ler a imagem.');
    } finally {
      setLendo(false);
    }
  }

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arq.type)) {
      setErro('Use PNG, JPEG, WebP ou SVG.');
      return;
    }
    try {
      const f = await lerFonte(arq);
      cache.current.clear();
      setOriginal(f);
      setRecortar(true);
      // arquivo NOVO: fundo automático (a escolha manual era para a imagem anterior; mantida, podia esconder a nova —
      // logo escura na placa escura). O "Cortar margens" segue preservando a escolha manual da mesma imagem.
      await processar(f, { recortar: true, fundo: 'auto' });
    } catch {
      setErro('Não foi possível ler o arquivo.');
    }
  }

  /** Logo já gravada: mede de novo no aparelho (sem mudar o arquivo) para saber a placa automática. */
  async function escolherFundo(v: FundoEscolhido) {
    if (!valor.uri || !valor.ajuste) return;
    let a = auto;
    if (v === 'auto' && !a) {
      setLendo(true);
      try {
        const p = await prepararLogoV2(await fonteDaUrl(valor.uri), { recortar: false });
        a = { placaClaro: p.ajuste.placaClaro, placaEscuro: p.ajuste.placaEscuro };
        setAuto(a);
      } catch {
        setErro('Não foi possível medir a logo gravada: envie de novo para o ajuste automático.');
        return;
      } finally {
        setLendo(false);
      }
    }
    onChange({ uri: valor.uri, ajuste: comFundoEscolhido(valor.ajuste, a ?? valor.ajuste, v) });
  }

  /** Logo gravada antes do ajuste automático: processa a partir da URL (como o "Ajustar agora"). */
  async function ajustarGravada() {
    if (!valor.uri) return;
    try {
      setLendo(true);
      const f = await fonteDaUrl(valor.uri);
      cache.current.clear();
      setOriginal(f);
      setRecortar(true);
      await processar(f, { recortar: true, fundo: 'auto' });
    } catch {
      setErro('Não foi possível ajustar esta logo: envie de novo.');
    } finally {
      setLendo(false);
    }
  }

  const tirar = () => {
    onChange({});
    setPrep(null);
    setOriginal(null);
    setAuto(null);
    cache.current.clear();
    setErro(null);
  };

  const anuncio = { logo: valor.uri, logoAjuste: valor.ajuste, marca: marca || '?' };
  const meu = prep && prep.uri === valor.uri ? prep : null;
  const analise = meu?.analise ?? null;
  const ajuste = valor.ajuste;
  const avisos = meu?.avisos ?? [];
  const alturaGravada = meu ? meu.altura : null;

  return (
    <div
      className="space-y-3"
      data-campo-logo={dataCampo}
      data-proporcao={valor.ajuste?.proporcao}
      data-placa-claro={valor.ajuste?.placaClaro}
      data-placa-escuro={valor.ajuste?.placaEscuro}
      data-com-fundo={valor.ajuste ? String(!!valor.ajuste.comFundo) : undefined}
      data-tipo-gravado={valor.uri?.startsWith('data:') ? valor.uri.slice(5, valor.uri.indexOf(';')) : undefined}
    >
      <div>
        <Rotulo className="text-fg">{rotulo}</Rotulo>
        {descricao ? <p className="mt-1 text-pretty text-[12.5px] leading-snug text-fg-muted">{descricao}</p> : null}
      </div>
      {valor.uri ? (
        <>
          <PreviaTemas>
            {() => (
              <>
                <LogoMarca anuncio={anuncio} tamanho="lg" className="[--logo-h:48px] [--logo-max:150px]" />
                <LogoMarca anuncio={anuncio} tamanho="xs" className="[--logo-h:34px] [--logo-max:104px]" />
              </>
            )}
          </PreviaTemas>
          <div className="space-y-1 text-[12.5px] leading-snug text-fg-muted">
            {meu ? (
              <p className="num text-fg" data-dimensoes>
                {linhaDimensoes(meu)}
              </p>
            ) : valor.uri.startsWith('data:') ? (
              <p className="num text-fg">{fmtInt(kbDeUri(valor.uri))} KB</p>
            ) : null}
            {ajuste ? <LinhasTema ajuste={ajuste} analise={analise} /> : null}
          </div>
          {!ajuste ? (
            <Callout tom="alerta" titulo="Logo gravada antes do ajuste automático">
              Ela aparece pequena, numa placa branca quadrada.
              <span className="mt-2 block">
                <Button variant="secondary" size="sm" icon="ajustes" loading={lendo} onClick={() => void ajustarGravada()}>
                  Ajustar esta logo
                </Button>
              </span>
            </Callout>
          ) : null}
        </>
      ) : (
        <Soltar rotulo={escura ? 'Enviar a versão para fundo escuro' : 'Enviar logo'} onClick={() => ref.current?.click()} lendo={lendo} />
      )}

      {avisos.map((t) => (
        <Callout key={t} tom={t === AVISO_SEM_MEDIDA ? 'alerta' : 'neutro'}>
          {t}
        </Callout>
      ))}
      {ajuste && !escura && ajuste.origem === 'auto' && ajuste.placaClaro === 'escura' ? (
        <Callout tom="info" titulo="Placa escura no tema claro">
          No tema claro esta logo aparece numa placa escura (partes claras sumiriam). Se a marca tiver versão para fundo claro, envie-a em “Logo” e use
          esta em “Versão para fundo escuro”.
        </Callout>
      ) : null}
      {ajuste?.comFundo && analise?.fundoClaro ? (
        <Callout tom="alerta" titulo="Fundo branco detectado">
          No tema escuro a logo aparece como um cartão branco. Prefira PNG com fundo transparente.
        </Callout>
      ) : null}
      {alturaGravada !== null && alturaGravada < 60 ? (
        <Callout tom="alerta" titulo="Logo pequena">
          <span className="num">{fmtInt(alturaGravada)}</span> px de altura: envie uma imagem maior para ficar nítida na TV.
        </Callout>
      ) : null}
      {erro ? (
        <p role="alert" className="text-[12.5px] font-medium text-alert-fg">
          {erro}
        </p>
      ) : null}

      {valor.uri ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon="troca" loading={lendo} onClick={() => ref.current?.click()}>
            Trocar
          </Button>
          <Button variant="ghost" size="sm" icon="fechar" onClick={tirar}>
            Tirar
          </Button>
        </div>
      ) : null}

      {original && prep ? (
        <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
          <Toggle
            checked={recortar}
            disabled={lendo}
            onChange={(v) => {
              setRecortar(v);
              void processar(original, { recortar: v, fundo });
            }}
            label="Cortar margens vazias"
            description="A logo aparece maior, no formato dela. Desligue para usar a imagem como foi enviada."
          />
        </div>
      ) : null}
      {ajuste ? (
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-fg-muted">Fundo da logo</span>
          <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
            <Segmented ariaLabel={`Fundo da logo (${rotulo})`} size="sm" value={fundo} onChange={(v) => void escolherFundo(v)} options={OPCOES_FUNDO} />
          </div>
          <p className="mt-1 text-[12px] text-fg-subtle">A escolha manual vale nos dois temas. “Automático” volta à medida.</p>
        </div>
      ) : null}
      {!escura ? <p className="text-[12px] leading-snug text-fg-muted">PNG com fundo transparente fica melhor, de preferência a versão horizontal da marca.</p> : null}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" tabIndex={-1} onChange={escolher} />
    </div>
  );
}

/** A peça como o cartão do site a desenha num tema: na placa pedida pelo contraste (transparente) ou como está. */
function PecaNoTema({ uri, ajuste, tema }: { uri: string; ajuste?: AjusteImagem; tema: TemaLogo }) {
  const placa = placaDaPeca({ imagemAjuste: ajuste }, tema);
  return (
    <div
      data-peca-placa={placa ?? 'legado'}
      className={cn(
        'flex h-[120px] w-full items-center justify-center overflow-hidden rounded-xl',
        placa === 'clara' ? 'bg-placa-clara' : placa === 'escura' ? 'bg-placa-escura' : 'bg-surface-2',
        placa && 'p-3',
      )}
    >
      <img
        src={uri}
        alt=""
        decoding="async"
        style={ajuste ? { aspectRatio: String(ajuste.proporcao) } : undefined}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

/** Campo da peça (E5): sempre redesenhada no aparelho; com transparência nunca vira JPEG; prévia claro | escuro. */
export function CampoPeca({ valor, onChange }: { valor: ValorImagem; onChange: (v: ValorImagem) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [prep, setPrep] = useState<ImagemPreparadaV2 | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    setLendo(true);
    try {
      const p = await prepararPecaV2(arq);
      setPrep(p);
      onChange({ uri: p.uri, ajuste: p.ajuste ?? undefined });
      setErro(null);
    } catch (err) {
      setErro(err instanceof ErroImagem ? err.message : 'Não foi possível ler a imagem.');
    } finally {
      setLendo(false);
    }
  }

  const meu = prep && prep.uri === valor.uri ? prep : null;
  return (
    <div
      className="space-y-3"
      data-campo-peca
      data-proporcao={valor.ajuste?.proporcao}
      data-placa-claro={valor.ajuste?.placaClaro}
      data-placa-escuro={valor.ajuste?.placaEscuro}
      data-com-fundo={valor.ajuste ? String(!!valor.ajuste.comFundo) : undefined}
      data-tipo-gravado={valor.uri?.startsWith('data:') ? valor.uri.slice(5, valor.uri.indexOf(';')) : undefined}
    >
      <div>
        <Rotulo className="text-fg">Peça (opcional)</Rotulo>
        <p className="mt-1 text-pretty text-[12.5px] leading-snug text-fg-muted">Banner do cartão patrocinado, exibido inteiro, sem corte. Até 1600 px e 400 KB. Sem animação.</p>
      </div>
      {valor.uri ? (
        <>
          <PreviaTemas>{(t) => <PecaNoTema uri={valor.uri!} ajuste={valor.ajuste} tema={t} />}</PreviaTemas>
          <div className="space-y-1 text-[12.5px] leading-snug text-fg-muted">
            {meu ? (
              <p className="num text-fg" data-dimensoes>
                {linhaDimensoes(meu)}
                {` · ${meu.uri.slice(5, meu.uri.indexOf(';')).replace('image/', '').toUpperCase()}`}
              </p>
            ) : valor.uri.startsWith('data:') ? (
              <p className="num text-fg">{fmtInt(kbDeUri(valor.uri))} KB</p>
            ) : null}
            {valor.ajuste && !valor.ajuste.comFundo ? <LinhasTema ajuste={valor.ajuste} analise={meu?.analise ?? null} nome="peça" /> : null}
            {valor.ajuste?.comFundo ? <p>Imagem com fundo próprio: aparece como está nos dois temas.</p> : null}
          </div>
          {meu?.avisos.map((t) => (
            <Callout key={t} tom={t === AVISO_SEM_MEDIDA ? 'alerta' : 'neutro'}>
              {t}
            </Callout>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon="troca" loading={lendo} onClick={() => ref.current?.click()}>
              Trocar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="fechar"
              onClick={() => {
                onChange({});
                setPrep(null);
                setErro(null);
              }}
            >
              Tirar
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={lendo}
          className={cn(
            'flex w-full items-center gap-3 rounded-2xl border border-dashed border-line/[2.5] bg-surface-2/60 px-4 py-4 text-left transition-colors hover:border-brand/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
          )}
        >
          <span className="inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
            <Icon name={lendo ? 'relogio' : 'mais'} size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-fg">{lendo ? 'Preparando a peça…' : 'Enviar peça'}</span>
            <span className="mt-0.5 block text-[12px] text-fg-muted">PNG, JPEG ou WebP</span>
          </span>
        </button>
      )}
      {erro ? (
        <p role="alert" className="text-[12.5px] font-medium text-alert-fg">
          {erro}
        </p>
      ) : null}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={escolher} />
    </div>
  );
}
