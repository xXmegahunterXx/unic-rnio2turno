/**
 * Painel → Comunicação → "Contatos públicos": os e-mails do site (geral, privacidade, imprensa, correções) e o
 * responsável pelo site (nome ou razão social; CNPJ opcional). Comando `contatos` (src/shared/contatos.ts), validado no
 * painel e no servidor. Aparecem em /sobre, /privacidade, /metodologia e, sem contato próprio, em /anuncie e /streamers.
 * Sem e-mail de privacidade, o formulário "Quero anunciar" fica fechado em produção.
 */
import { useEffect, useState } from 'react';
import { CAMPOS_EMAIL, contatosEfetivos, formatarCnpj, validaContatosPublicos, type CampoEmail, type ContatosPublicos } from '@/shared/contatos';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Icon } from '@/app/ui';
import { useAdmin } from './dados';
import { Campo, Painel } from './kit';
import { urlPublica } from './rotulos';

const ROTULO: Record<CampoEmail, { rotulo: string; dica: string; placeholder: string }> = {
  geral: { rotulo: 'E-mail geral', dica: 'Em /sobre. Sem ele, o site usa o e-mail comercial da página Anuncie.', placeholder: 'contato@seudominio.com.br' },
  privacidade: {
    rotulo: 'E-mail de privacidade (encarregado de dados)',
    dica: 'Em /privacidade. Abre o formulário “Quero anunciar” (é o canal para retirar o consentimento).',
    placeholder: 'privacidade@seudominio.com.br',
  },
  imprensa: { rotulo: 'E-mail de imprensa', dica: 'Em /sobre.', placeholder: 'imprensa@seudominio.com.br' },
  correcoes: { rotulo: 'E-mail de correções', dica: 'Em /sobre e /metodologia. Sem ele, a metodologia usa o geral.', placeholder: 'correcoes@seudominio.com.br' },
};

type Rascunho = Record<CampoEmail | 'responsavel' | 'cnpj', string>;

const doEstado = (c: ContatosPublicos | null | undefined): Rascunho => ({
  geral: c?.geral ?? '',
  privacidade: c?.privacidade ?? '',
  imprensa: c?.imprensa ?? '',
  correcoes: c?.correcoes ?? '',
  responsavel: c?.responsavel ?? '',
  cnpj: c?.cnpj ? formatarCnpj(c.cnpj) : '',
});

export function ContatosPublicosPainel({ className }: { className?: string }) {
  const { snap, run, pendente } = useAdmin();
  const atual = snap.state.contatos ?? null;
  const [r, setR] = useState<Rascunho>(() => doEstado(atual));
  const chaveAtual = JSON.stringify(atual ?? {});
  // mudou por fora (outro aparelho): adota
  useEffect(() => {
    setR(doEstado(atual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAtual]);

  const v = validaContatosPublicos(r);
  const novo = 'ok' in v ? v.ok : null;
  const igual = !!novo && JSON.stringify(novo) === JSON.stringify(atual ?? {});
  const efetivos = contatosEfetivos(atual, snap.state.anuncie);
  const muda = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement>) => setR((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Painel
      className={className}
      titulo="Contatos públicos"
      icone="usuarios"
      subtitulo="E-mails e responsável que aparecem em Sobre, Privacidade e Metodologia. Campo vazio não aparece no site."
      acoes={
        efetivos.privacidade ? (
          <Badge tone="ok" size="sm" dot caps>
            Formulário aberto
          </Badge>
        ) : (
          <Badge tone="alert" size="sm" caps>
            Formulário fechado
          </Badge>
        )
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (novo) void run({ tipo: 'contatos', contatos: Object.keys(novo).length ? novo : null }, { chave: 'contatos', sucesso: 'Contatos públicos salvos' });
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CAMPOS_EMAIL.map((k) => (
            <Campo
              key={k}
              rotulo={ROTULO[k].rotulo}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              value={r[k]}
              placeholder={ROTULO[k].placeholder}
              onChange={muda(k)}
              dica={ROTULO[k].dica}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Campo
            rotulo="Responsável pelo site (nome ou razão social)"
            value={r.responsavel}
            maxLength={140}
            placeholder="Ex.: Fulana de Tal ou Empresa Exemplo Ltda."
            onChange={muda('responsavel')}
            dica="Opcional. Identifica o controlador dos dados em /privacidade e em /sobre."
          />
          <Campo rotulo="CNPJ (opcional)" inputMode="numeric" value={r.cnpj} placeholder="00.000.000/0000-00" onChange={muda('cnpj')} mono />
        </div>

        <ul className="grid grid-cols-1 gap-2 rounded-2xl border border-line bg-surface-2/60 p-4 text-[13px] leading-snug text-fg-muted sm:grid-cols-2">
          <Situacao ok={!!efetivos.privacidade} texto={efetivos.privacidade ? 'Canal de privacidade publicado' : 'Sem canal de privacidade: “Quero anunciar” fechado'} />
          <Situacao
            ok={!!efetivos.geral}
            texto={efetivos.geral ? (atual?.geral ? 'Contato geral publicado' : 'Contato geral: usando o e-mail da página Anuncie') : 'Sem contato geral'}
          />
          <Situacao ok={!!efetivos.responsavel} texto={efetivos.responsavel ? 'Responsável identificado' : 'Responsável não identificado'} />
          <li className="flex items-center gap-2">
            <Icon name="externo" size={14} className="shrink-0 text-fg-subtle" />
            <span>
              Ver:{' '}
              {(['/sobre#contato', '/privacidade#responsavel'] as const).map((u, i) => (
                <a key={u} href={urlPublica(u)} target="_blank" rel="noopener" className="font-medium text-brand-fg hover:underline">
                  {i ? ' · ' : ''}
                  {u.split('#')[0]}
                </a>
              ))}
            </span>
          </li>
        </ul>

        {'erro' in v ? <p className="text-[12.5px] font-medium text-alert-fg">{v.erro}</p> : null}
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          {atual ? (
            <Button
              variant="ghost"
              icon="fechar"
              onClick={() => void run({ tipo: 'contatos', contatos: null }, { chave: 'contatos', sucesso: 'Contatos públicos removidos' })}
              disabled={pendente('contatos')}
            >
              Tirar todos do site
            </Button>
          ) : null}
          <Button type="submit" variant="primary" icon="check" disabled={'erro' in v || igual} loading={pendente('contatos')} className="sm:min-w-[160px]">
            {igual ? 'Salvo' : 'Salvar contatos'}
          </Button>
        </div>
      </form>
    </Painel>
  );
}

function Situacao({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className="flex items-center gap-2">
      <Icon name={ok ? 'check-circulo' : 'alerta'} size={15} className={cn('shrink-0', ok ? 'text-ok-fg' : 'text-alert-fg')} />
      <span className={ok ? 'text-fg' : undefined}>{texto}</span>
    </li>
  );
}
