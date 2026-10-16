/**
 * "Ajustar agora" (anunciantes v2, E4): corrige as logos gravadas antes do ajuste automático (sem `logoAjuste`, ou a
 * versão escura sem `logoEscuroAjuste`) com um toque, sem reenviar.
 *
 * Para cada anúncio pendente, a logo gravada é baixada (a URL `/api/anuncio/img?h=` é da mesma origem), convertida em
 * data URI e passa pela MESMA preparação do envio (`prepararLogoV2`: recorte das margens vazias, medida do contraste nos
 * dois temas, PNG). O diálogo mostra antes × depois nos dois temas; [Aplicar] envia o comando 'anuncio-logo' (só a logo
 * muda; sem declaração nova — mesma marca, mesmo conteúdo). O desfazer reenvia o data URI ORIGINAL sem ajuste (nunca a
 * URL antiga: o hash antigo sai da tabela de imagens do servidor), e a logo volta com o mesmo hash de antes.
 */
import { useEffect, useState } from 'react';
import type { AjusteImagem, AnuncioConfig } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Button, Dialog, Icon } from '@/app/ui';
import { LogoMarca } from '@/app/components/anuncios';
import { useAdmin } from './dados';
import { Callout } from './kit';
import { linhaDimensoes, prepararLogoV2, type LogoPreparada } from './analiseLogo';
import { PreviaTemas, fonteDaUrl } from './CampoLogo';

/** Logo (ou versão escura) gravada sem ajuste. */
export const logoPendente = (a: Pick<AnuncioConfig, 'logo' | 'logoAjuste' | 'logoEscuro' | 'logoEscuroAjuste'>) =>
  (!!a.logo && !a.logoAjuste) || (!!a.logoEscuro && !a.logoEscuroAjuste);

/** O que o desfazer reenvia: o data URI original de cada logo ajustada. */
export interface DesfazerLogos {
  itens: { id: string; marca: string; logo?: string; logoEscuro?: string }[];
}

type Campo = 'logo' | 'logoEscuro';

interface Item {
  a: AnuncioConfig;
  /** por campo pendente: o original (data URI) e o resultado, ou o erro */
  campos: Partial<Record<Campo, { original: string; prep: LogoPreparada } | { erro: true }>>;
  marcado: boolean;
}

const NOME: Record<Campo, string> = { logo: 'Logo', logoEscuro: 'Versão para fundo escuro' };

async function preparar(a: AnuncioConfig): Promise<Item> {
  const campos: Item['campos'] = {};
  for (const campo of ['logo', 'logoEscuro'] as const) {
    const uri = a[campo];
    const ajuste = campo === 'logo' ? a.logoAjuste : a.logoEscuroAjuste;
    if (!uri || ajuste) continue;
    try {
      const f = await fonteDaUrl(uri);
      campos[campo] = { original: f.uri, prep: await prepararLogoV2(f) };
    } catch {
      campos[campo] = { erro: true };
    }
  }
  const ok = Object.values(campos).some((c) => c && !('erro' in c));
  return { a, campos, marcado: ok };
}

/** Antes × depois de uma logo, nos dois temas. */
function AntesDepois({ marca, antes, depois, ajuste, campo }: { marca: string; antes: string; depois: string; ajuste: AjusteImagem; campo: Campo }) {
  const anuncioDe = (uri: string, aj?: AjusteImagem) => (campo === 'logo' ? { marca, logo: uri, logoAjuste: aj } : { marca, logoEscuro: uri, logoEscuroAjuste: aj });
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Antes</span>
      <PreviaTemas className="rounded-xl">{() => <LogoMarca anuncio={anuncioDe(antes)} className="[--logo-h:40px] [--logo-max:132px]" />}</PreviaTemas>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Depois</span>
      <PreviaTemas className="rounded-xl">{() => <LogoMarca anuncio={anuncioDe(depois, ajuste)} className="[--logo-h:40px] [--logo-max:132px]" />}</PreviaTemas>
    </div>
  );
}

const ROTULO_PLACA = { nenhuma: 'sem placa', clara: 'placa clara', escura: 'placa escura' } as const;

export function AjustarLogos({
  open,
  onClose,
  pendentes,
  onAplicado,
}: {
  open: boolean;
  onClose: () => void;
  pendentes: AnuncioConfig[];
  onAplicado: (d: DesfazerLogos) => void;
}) {
  const { run } = useAdmin();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [falhas, setFalhas] = useState<string[]>([]);

  // prepara ao abrir (no aparelho, uma logo por vez)
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setItens(null);
    setFalhas([]);
    void (async () => {
      const out: Item[] = [];
      for (const a of pendentes) out.push(await preparar(a));
      if (vivo) setItens(out);
    })();
    return () => {
      vivo = false;
    };
    // a lista de pendentes é a do momento em que o diálogo abriu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const marcados = (itens ?? []).filter((i) => i.marcado);

  async function aplicar() {
    if (!itens) return;
    setAplicando(true);
    const feitos: DesfazerLogos['itens'] = [];
    const erros: string[] = [];
    for (const it of marcados) {
      const cmd: { tipo: 'anuncio-logo'; id: string; logo?: string; logoAjuste?: AjusteImagem; logoEscuro?: string; logoEscuroAjuste?: AjusteImagem } = { tipo: 'anuncio-logo', id: it.a.id };
      const desfazer: DesfazerLogos['itens'][number] = { id: it.a.id, marca: it.a.marca };
      for (const campo of ['logo', 'logoEscuro'] as const) {
        const c = it.campos[campo];
        if (!c || 'erro' in c) continue;
        if (campo === 'logo') {
          cmd.logo = c.prep.uri;
          cmd.logoAjuste = c.prep.ajuste;
        } else {
          cmd.logoEscuro = c.prep.uri;
          cmd.logoEscuroAjuste = c.prep.ajuste;
        }
        desfazer[campo] = c.original;
      }
      if (!cmd.logo && !cmd.logoEscuro) continue;
      const snap = await run(cmd, { chave: `anuncio-logo:${it.a.id}` });
      if (snap) feitos.push(desfazer);
      else erros.push(it.a.marca);
    }
    setAplicando(false);
    if (feitos.length) onAplicado({ itens: feitos });
    if (erros.length) setFalhas(erros);
    else onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={() => (aplicando ? undefined : onClose())}
      title="Ajustar as logos gravadas"
      description="Margens vazias cortadas e a placa de cada tema medida no seu aparelho, como num envio novo. A imagem não é editada."
      size="lg"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={aplicando}>
            Cancelar
          </Button>
          <Button variant="primary" icon="check" loading={aplicando} disabled={!itens || marcados.length === 0} onClick={() => void aplicar()}>
            {marcados.length > 1 ? (
              // um único filho de texto: o Button põe `gap` entre os filhos e "(", o número e ")" sairiam separados
              <span>
                Aplicar (<span className="num">{marcados.length}</span>)
              </span>
            ) : (
              'Aplicar'
            )}
          </Button>
        </div>
      }
    >
      {!itens ? (
        <p className="flex items-center gap-2 py-6 text-[13.5px] text-fg-muted" role="status">
          <Icon name="relogio" size={16} /> Preparando {pendentes.length > 1 ? <span className="num">{pendentes.length} logos</span> : 'a logo'}…
        </p>
      ) : (
        <ul className="space-y-3" data-ajustar-logos>
          {itens.map((it) => (
            <li key={it.a.id} className={cn('rounded-2xl border p-3', it.marcado ? 'border-brand/40 bg-brand/[0.04]' : 'border-line bg-surface-2/40')}>
              <label className="mb-2.5 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={it.marcado}
                  disabled={!Object.values(it.campos).some((c) => c && !('erro' in c))}
                  onChange={(e) => setItens((xs) => xs!.map((x) => (x.a.id === it.a.id ? { ...x, marcado: e.target.checked } : x)))}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded-md accent-[rgb(var(--brand))]"
                />
                <span className="min-w-0 truncate text-[14px] font-semibold text-fg">{it.a.marca}</span>
                <span className="font-mono text-[11.5px] text-fg-subtle">{it.a.id}</span>
              </label>
              <div className="space-y-3">
                {(['logo', 'logoEscuro'] as const).map((campo) => {
                  const c = it.campos[campo];
                  if (!c) return null;
                  if ('erro' in c)
                    return (
                      <p key={campo} className="text-[12.5px] font-medium text-alert-fg">
                        Não foi possível ajustar a logo de {it.a.marca}: envie de novo em Editar.
                      </p>
                    );
                  return (
                    <div key={campo} className="space-y-1.5">
                      {it.campos.logo && it.campos.logoEscuro ? <p className="text-[12px] font-semibold text-fg-muted">{NOME[campo]}</p> : null}
                      <AntesDepois marca={it.a.marca} antes={it.a[campo]!} depois={c.prep.uri} ajuste={c.prep.ajuste} campo={campo} />
                      <p className="num text-[12px] text-fg">{linhaDimensoes(c.prep)}</p>
                      <p className="text-[12px] text-fg-muted">
                        Tema claro: {ROTULO_PLACA[c.prep.ajuste.placaClaro]} · Tema escuro: {ROTULO_PLACA[c.prep.ajuste.placaEscuro]}
                        {c.prep.ajuste.comFundo ? ' · imagem com fundo próprio' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {falhas.length ? (
        <Callout tom="alerta" className="mt-3">
          Não foi possível salvar: {falhas.join(', ')}. Tente de novo.
        </Callout>
      ) : null}
    </Dialog>
  );
}
