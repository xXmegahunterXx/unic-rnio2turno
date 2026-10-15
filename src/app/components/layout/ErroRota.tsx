/**
 * Tela de erro das rotas (errorElement do React Router): no lugar da tela crua "Unexpected Application Error!".
 *
 *  - Pedaço do app que não existe mais (aba aberta antes de um deploy): recarrega a página sozinho, uma vez
 *    (lib/recarga.ts), e mostra "Atualizando…" enquanto isso.
 *  - Qualquer outro erro: cartão com a cara do site, botão para recarregar e link para o início.
 *  - `/live` (fonte do OBS, fundo transparente): nada na tela — um cartão de erro iria para a transmissão do streamer.
 */
import { useEffect, useState } from 'react';
import { useRouteError } from 'react-router-dom';
import { ehErroDeVersao, recarregarUmaVez } from '@/app/lib/recarga';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';

export function ErroRota({ variante = 'pagina' }: { variante?: 'pagina' | 'tela' | 'transparente' }) {
  const erro = useRouteError();
  const versao = ehErroDeVersao(erro);
  const [recarregando, setRecarregando] = useState(false);
  useEffect(() => {
    if (versao && recarregarUmaVez()) setRecarregando(true);
  }, [versao]);

  if (variante === 'transparente') return null;
  return (
    <div className={variante === 'tela' ? 'flex min-h-[100dvh] items-center justify-center bg-bg px-4' : 'flex min-h-[60dvh] items-center justify-center px-4 py-16'}>
      <div role="alert" className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/12 text-brand-fg ring-1 ring-inset ring-brand/25">
          <Icon name={versao ? 'reset' : 'alerta'} size={22} />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-semibold tracking-[-0.02em] text-fg">
          {recarregando ? 'Atualizando o site…' : versao ? 'O site foi atualizado' : 'Algo deu errado nesta página'}
        </h1>
        <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-fg-muted">
          {recarregando
            ? 'Saiu uma versão nova do Sintonia. Em instantes a página volta.'
            : versao
              ? 'Saiu uma versão nova do Sintonia desde que você abriu esta aba. Recarregue para continuar.'
              : 'Tente recarregar. Se continuar, volte ao início e abra a página de novo.'}
        </p>
        {recarregando ? null : (
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button variant="primary" icon="reset" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
            <a
              href={__DEMO__ ? './#/' : '/'}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line px-5 text-[14.5px] font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              Ir para o início
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
