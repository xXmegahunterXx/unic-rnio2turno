/**
 * Aba aberta antes de um deploy: os pedaços (chunks) antigos da página somem do servidor e a navegação para uma rota
 * ainda não carregada falha ("Failed to fetch dynamically imported module"). Recarregar a página traz a versão nova.
 *
 * Trava contra laço: recarrega no máximo 1 vez a cada 60 s por aba (horário guardado na sessionStorage — não uma flag
 * permanente, que bloquearia a recarga num 2º deploy com a mesma aba aberta). Sem sessionStorage, não recarrega sozinho
 * (a tela de erro oferece o botão).
 */
const CHAVE = 'sintonia:recarga-versao';
const JANELA_MS = 60_000;

/** O erro é de um pedaço do app que não existe mais (deploy novo)? Chrome/Edge, Firefox e Safari. */
export function ehErroDeVersao(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String((e as { message?: unknown } | null)?.message ?? e ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|MIME type of "text\/html"/i.test(
    msg,
  );
}

/** Recarrega a página uma vez (true = vai recarregar). */
export function recarregarUmaVez(agora = Date.now()): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) || 0);
    if (Number.isFinite(ultima) && agora - ultima < JANELA_MS) return false;
    sessionStorage.setItem(CHAVE, String(agora));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
