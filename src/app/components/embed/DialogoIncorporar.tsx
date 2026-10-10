/**
 * Diálogo "Incorporar no seu site": escolha o widget (placar, mapa, estado), a disputa/UF e o tema; veja a prévia
 * (o próprio widget, renderizado aqui mesmo — sem abrir um segundo app num iframe) e copie o código do iframe.
 * Carregado sob demanda (layout/acoesGlobais.tsx). Abra com `abrirIncorporar({ tipo, race, uf })`.
 */
import { useEffect, useMemo, useState } from 'react';
import { UFS, type UFBr } from '@/shared/types';
import { UF_NOMES, UFS_GOV_2T } from '@/shared/constants';
import { copiarTexto, urlAbsoluta } from '@/app/lib/share';
import { Button } from '@/app/ui/Button';
import { Dialog } from '@/app/ui/Dialog';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Select } from '@/app/ui/Select';
import { toast } from '@/app/ui/Toast';
import { caminhoEmbed, codigoIframe, ROTULO_TIPO, TIPOS_EMBED, type OpcoesEmbed, type TemaEmbed, type TipoEmbed } from './codigo';
import { WidgetEmbed } from './Widgets';

const PADRAO: OpcoesEmbed = { tipo: 'placar', race: 'pres', uf: 'SP', tema: 'auto' };

const OPCOES_RACE = [
  { value: 'pres', label: 'Presidente' },
  ...UFS_GOV_2T.map((u) => ({ value: `gov-${u.toLowerCase()}`, label: `Governador · ${UF_NOMES[u]}` })),
];
const OPCOES_UF = [...UFS].sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR')).map((u) => ({ value: u, label: UF_NOMES[u] }));

export default function DialogoIncorporar({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Partial<OpcoesEmbed> }) {
  const [o, setO] = useState<OpcoesEmbed>({ ...PADRAO, ...inicial });
  useEffect(() => {
    if (aberto) setO({ ...PADRAO, ...inicial });
  }, [aberto, inicial]);
  const url = useMemo(() => urlAbsoluta(caminhoEmbed(o)), [o]);
  const codigo = useMemo(() => codigoIframe(o, url), [o, url]);
  const mudar = (p: Partial<OpcoesEmbed>) => setO((x) => ({ ...x, ...p }));

  async function copiar(texto: string, ok: string) {
    const deu = await copiarTexto(texto);
    toast(deu ? ok : 'Não foi possível copiar', { tone: deu ? 'ok' : 'alert', icon: deu ? 'check' : 'alerta' });
  }

  return (
    <Dialog
      open={aberto}
      onClose={onFechar}
      title="Incorporar no seu site"
      description="Placar e mapa que se atualizam sozinhos, para blogs e portais. Grátis, sem cadastro e sem rastrear seus leitores."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="md" icon="link" onClick={() => copiar(url, 'Link do widget copiado')}>
            Copiar link
          </Button>
          <Button variant="primary" size="md" icon="copiar" onClick={() => copiar(codigo, 'Código copiado')}>
            Copiar código
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-4">
          <div>
            <Rotulo>Widget</Rotulo>
            <Segmented<TipoEmbed>
              ariaLabel="Tipo de widget"
              value={o.tipo}
              onChange={(tipo) => mudar({ tipo })}
              options={TIPOS_EMBED.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))}
              size="sm"
              block
            />
          </div>
          {o.tipo === 'placar' ? (
            <div>
              <Rotulo>Disputa</Rotulo>
              <Select aria-label="Disputa" value={o.race} onChange={(e) => mudar({ race: e.target.value })} options={OPCOES_RACE} />
            </div>
          ) : null}
          {o.tipo === 'uf' ? (
            <div>
              <Rotulo>Estado</Rotulo>
              <Select aria-label="Estado" value={o.uf} onChange={(e) => mudar({ uf: e.target.value as UFBr })} options={OPCOES_UF} />
            </div>
          ) : null}
          <div>
            <Rotulo>Tema</Rotulo>
            <Segmented<TemaEmbed>
              ariaLabel="Tema do widget"
              value={o.tema}
              onChange={(tema) => mudar({ tema })}
              options={[
                { value: 'auto', label: 'Automático' },
                { value: 'escuro', label: 'Escuro' },
                { value: 'claro', label: 'Claro' },
              ]}
              size="sm"
              block
            />
          </div>
          <div>
            <Rotulo>Código</Rotulo>
            <textarea
              readOnly
              value={codigo}
              aria-label="Código para colar no seu site"
              onFocus={(e) => e.currentTarget.select()}
              rows={6}
              className="w-full resize-none rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-fg-muted">
              <Icon name="info" size={14} className="mt-px shrink-0 text-brand-fg" />
              Cole no HTML do seu site. A altura se ajusta sozinha; o widget mostra o selo de simulação quando os números forem fictícios.
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <Rotulo>Prévia</Rotulo>
          <div className="overflow-hidden rounded-2xl border border-line">
            <WidgetEmbed opcoes={o} />
          </div>
          <p className="mt-1.5 text-[12px] text-fg-muted">A prévia segue o tema deste site; no seu site vale o tema escolhido.</p>
        </div>
      </div>
    </Dialog>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{children}</div>;
}
