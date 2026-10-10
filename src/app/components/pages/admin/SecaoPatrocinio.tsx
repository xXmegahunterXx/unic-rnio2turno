/**
 * Seção "Patrocínio": espaço discreto "Oferecido por" nas páginas de apuração (Nacional, UF) e no Modo TV
 * (comando `patrocinio`, `LiveStatus.patrocinio`). Desligado por padrão.
 *
 * Regras (ARCHITECTURE §1.5): só anunciante NÃO político — nada de partido, candidato, campanha, mandato ou
 * órgão público com mensagem institucional em período eleitoral. A publicação exige a confirmação explícita.
 * Logo opcional por upload: vira data URI de até 60 KB (imagens maiores são só redimensionadas, sem edição).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Patrocinio } from '@/shared/types';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Icon, Toggle } from '@/app/ui';
import { PatrocinioSlot } from '@/app/components/apuracao/PatrocinioSlot';
import { LogoMark } from '@/app/components/layout/Logo';
import { useAdmin } from './dados';
import { AreaTexto, CabecalhoSecao, Callout, Campo, Painel, Rotulo } from './kit';

const MAX_MARCA = 60;
const MAX_TEXTO = 140;
/** Tamanho máximo da logo em data URI (caracteres ≈ bytes). */
export const MAX_LOGO = 60 * 1024;

const urlValida = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !!x.hostname && !x.username && !x.password;
  } catch {
    return false;
  }
};

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(r.error);
    r.readAsDataURL(f);
  });
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('imagem inválida'));
    img.src = src;
  });
}

/**
 * Logo → data URI ≤ 60 KB. SVG/PNG/JPEG/WebP pequenos passam como estão; rasters maiores são redimensionados
 * (até 480×160, mantendo a proporção) e recodificados (WebP, depois PNG), sem nenhum outro tratamento.
 */
export async function prepararLogo(f: File): Promise<{ uri: string; redimensionada: boolean }> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) throw new Error('Use PNG, JPEG, WebP ou SVG.');
  const uri = await lerArquivo(f);
  if (uri.length <= MAX_LOGO) return { uri, redimensionada: false };
  if (f.type === 'image/svg+xml') throw new Error(`O SVG tem ${fmtInt(uri.length / 1024)} KB; o limite é 60 KB.`);
  const img = await carregarImagem(uri);
  for (const [lw, lh] of [
    [480, 160],
    [360, 120],
    [240, 80],
  ] as const) {
    const k = Math.min(1, lw / img.naturalWidth, lh / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, w, h);
    for (const [tipo, q] of [
      ['image/webp', 0.9],
      ['image/webp', 0.75],
      ['image/png', undefined],
    ] as const) {
      const out = c.toDataURL(tipo, q);
      if (out.startsWith(`data:${tipo}`) && out.length <= MAX_LOGO) return { uri: out, redimensionada: true };
    }
  }
  throw new Error('Não foi possível deixar a logo com até 60 KB. Use uma imagem menor.');
}

export function SecaoPatrocinio() {
  const { snap, run, pendente, confirmar } = useAdmin();
  const noAr = snap.state.patrocinio ?? null;
  const [marca, setMarca] = useState(noAr?.marca ?? '');
  const [texto, setTexto] = useState(noAr?.texto ?? '');
  const [url, setUrl] = useState(noAr?.url ?? 'https://');
  const [imagem, setImagem] = useState<string | undefined>(noAr?.imagem);
  const [aviso, setAviso] = useState<string | null>(null);
  const [naoPolitico, setNaoPolitico] = useState(!!noAr);
  const arquivo = useRef<HTMLInputElement>(null);

  // Mudou por fora (outra aba/admin) e o rascunho está vazio: adota.
  useEffect(() => {
    if (noAr && !marca && !texto) {
      setMarca(noAr.marca);
      setTexto(noAr.texto);
      setUrl(noAr.url);
      setImagem(noAr.imagem);
      setNaoPolitico(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noAr?.marca, noAr?.texto, noAr?.url, noAr?.imagem]);

  const rascunho: Patrocinio | null = useMemo(() => {
    const m = marca.trim();
    if (!m) return null;
    return { marca: m, texto: texto.trim(), url: url.trim(), ...(imagem ? { imagem } : {}) };
  }, [marca, texto, url, imagem]);

  const erros = {
    marca: !marca.trim() ? 'Informe a marca.' : marca.trim().length > MAX_MARCA ? `Até ${MAX_MARCA} caracteres.` : null,
    texto: !texto.trim() ? 'Escreva uma frase curta.' : texto.trim().length > MAX_TEXTO ? `Até ${MAX_TEXTO} caracteres.` : null,
    url: !urlValida(url.trim()) ? 'Use um endereço https:// válido.' : null,
  };
  const valido = !erros.marca && !erros.texto && !erros.url;
  const igualNoAr =
    !!noAr && !!rascunho && noAr.marca === rascunho.marca && noAr.texto === rascunho.texto && noAr.url === rascunho.url && (noAr.imagem ?? '') === (rascunho.imagem ?? '');

  async function escolherArquivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { uri, redimensionada } = await prepararLogo(f);
      setImagem(uri);
      setAviso(redimensionada ? `Logo redimensionada para caber em 60 KB (${fmtInt(uri.length / 1024)} KB).` : null);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
    }
  }

  const publicar = () =>
    rascunho &&
    run({ tipo: 'patrocinio', patrocinio: rascunho }, { chave: 'patrocinio', sucesso: noAr ? 'Patrocínio atualizado no site' : 'Patrocínio publicado no site' });
  const remover = async () => {
    const ok = await confirmar({
      titulo: 'Remover o patrocínio?',
      descricao: 'O espaço “Oferecido por” some de todas as páginas e do Modo TV na próxima atualização.',
      confirmar: 'Remover',
      perigo: true,
    });
    if (ok) await run({ tipo: 'patrocinio', patrocinio: null }, { chave: 'patrocinio', sucesso: 'Patrocínio removido do site' });
  };

  return (
    <div>
      <CabecalhoSecao
        titulo="Patrocínio"
        icone="selo"
        descricao="Um espaço discreto “Oferecido por” nas páginas de apuração e no Modo TV. Sem pop-up, sem modal, sempre rotulado como publicidade."
        acoes={
          noAr ? (
            <Badge tone="brand" size="sm" dot caps>
              No ar
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">
              Desligado
            </Badge>
          )
        }
      />

      <Callout tom="alerta" titulo="Somente anunciantes não políticos" className="mb-4 lg:mb-5">
        Proibido: partido, federação, candidato, campanha, mandato, governo ou órgão público com mensagem institucional, e qualquer conteúdo
        político-eleitoral (Lei 9.504/97). Na dúvida, não publique.
      </Callout>

      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Painel titulo="Anunciante" icone="bandeira" subtitulo="Marca, uma frase curta e o link (abre em nova aba, marcado como patrocinado).">
          <div className="space-y-4">
            <Campo
              rotulo="Marca"
              value={marca}
              maxLength={MAX_MARCA}
              placeholder="Ex.: Café do Bairro"
              onChange={(e) => setMarca(e.target.value)}
              erro={marca ? erros.marca : null}
            />
            <AreaTexto
              rotulo="Texto"
              value={texto}
              maxLength={MAX_TEXTO}
              rows={2}
              className="min-h-[72px]"
              placeholder="Ex.: Oferece a apuração ao vivo, seção por seção."
              onChange={(e) => setTexto(e.target.value)}
              dica={
                <div className="flex items-center justify-between gap-3">
                  <span>Descritivo e neutro: sem menção a candidatos, partidos ou resultados.</span>
                  <span className={cn('num shrink-0', texto.length > MAX_TEXTO - 15 && 'font-semibold text-alert-fg')}>
                    {texto.length}/{MAX_TEXTO}
                  </span>
                </div>
              }
            />
            <Campo
              rotulo="Link"
              value={url}
              mono
              inputMode="url"
              placeholder="https://exemplo.com.br"
              onChange={(e) => setUrl(e.target.value)}
              erro={url && url !== 'https://' ? erros.url : null}
            />
            <div>
              <Rotulo className="mb-2">Logo (opcional)</Rotulo>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line/[2.5] bg-surface-2 px-2">
                  {imagem ? (
                    <img src={imagem} alt="Prévia da logo" className="max-h-10 max-w-full object-contain" />
                  ) : (
                    <span className="text-[12px] text-fg-subtle">sem logo</span>
                  )}
                </div>
                <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={escolherArquivo} />
                <Button variant="secondary" size="sm" icon="mais" onClick={() => arquivo.current?.click()}>
                  {imagem ? 'Trocar imagem' : 'Enviar imagem'}
                </Button>
                {imagem ? (
                  <Button variant="ghost" size="sm" icon="fechar" onClick={() => (setImagem(undefined), setAviso(null))}>
                    Tirar
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 text-[12.5px] text-fg-muted">
                PNG, JPEG, WebP ou SVG · até 60 KB (imagens maiores são só redimensionadas){imagem ? <> · atual: <span className="num">{fmtInt(imagem.length / 1024)} KB</span></> : null}
              </p>
              {aviso ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-fg">
                  <Icon name="info" size={14} className="text-brand-fg" />
                  {aviso}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
              <Toggle
                checked={naoPolitico}
                onChange={setNaoPolitico}
                label="Confirmo: anunciante não político"
                description="Não é partido, candidato, campanha nem órgão público, e o texto não tem conteúdo político-eleitoral."
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {noAr ? (
                <Button variant="ghost" icon="fechar" onClick={() => void remover()} disabled={pendente('patrocinio')} className="mr-auto">
                  Remover do site
                </Button>
              ) : null}
              <Button variant="primary" icon="check" onClick={() => void publicar()} disabled={!valido || !naoPolitico || igualNoAr} loading={pendente('patrocinio')}>
                {noAr ? (igualNoAr ? 'Publicado' : 'Atualizar patrocínio') : 'Publicar patrocínio'}
              </Button>
            </div>
          </div>
        </Painel>

        <Painel titulo="Prévia" icone="usuarios" subtitulo="Como aparece no topo e no fim das páginas de apuração, e no Modo TV.">
          {rascunho ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-line bg-bg">
                <div className="flex h-10 items-center gap-2 border-b border-line bg-surface/70 px-3">
                  <LogoMark size={20} />
                  <span className="font-display text-[14px] font-semibold tracking-[-0.02em] text-fg">Sintonia</span>
                </div>
                <div className="space-y-3 p-3">
                  <div className="space-y-1.5" aria-hidden>
                    <div className="h-2.5 w-24 rounded-full bg-surface-3" />
                    <div className="h-5 w-40 rounded-lg bg-surface-3/80" />
                  </div>
                  <PatrocinioSlot patrocinio={rascunho} />
                  <div className="h-14 rounded-xl bg-surface-2" aria-hidden />
                  <PatrocinioSlot patrocinio={rascunho} variant="cartao" />
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-bg p-3">
                <Rotulo className="mb-2">Modo TV</Rotulo>
                <div className="origin-left scale-[0.8]">
                  <PatrocinioSlot patrocinio={rascunho} tv />
                </div>
              </div>
              {noAr && !igualNoAr ? (
                <p className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
                  <Icon name="info" size={14} className="text-brand-fg" />
                  Rascunho diferente do patrocínio no ar.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-subtle">
              Preencha a marca para ver a prévia. Sem patrocínio, o espaço não aparece no site.
            </div>
          )}
        </Painel>
      </div>
    </div>
  );
}
