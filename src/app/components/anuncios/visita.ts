/**
 * Memória da visita (sessionStorage — some ao fechar a aba; nada sai do aparelho):
 *  - `visita`: id aleatório que serve de semente da rotação dos anúncios (a mesma posição não troca a cada página
 *    renderizada, mas muda na próxima visita). Não identifica ninguém e nunca é enviado.
 *  - `rodape-fechado`: a barra do rodapé foi fechada nesta visita.
 *  - `topo`: havia anúncio no topo na última consulta (reserva a altura da faixa antes de o status chegar).
 * Tudo em try/catch: navegação privada, armazenamento bloqueado ou iframe sem acesso → valores só em memória.
 */
const PREFIXO = 'sintonia:anuncios:';
const memoria = new Map<string, string>();

function ler(chave: string): string | null {
  try {
    const v = window.sessionStorage.getItem(PREFIXO + chave);
    if (v !== null) return v;
  } catch {
    /* bloqueado */
  }
  return memoria.get(chave) ?? null;
}

function gravar(chave: string, valor: string): void {
  memoria.set(chave, valor);
  try {
    window.sessionStorage.setItem(PREFIXO + chave, valor);
  } catch {
    /* bloqueado: fica só em memória */
  }
}

/** Id aleatório da visita (semente da rotação). */
export function idDaVisita(): string {
  if (typeof window === 'undefined') return 'ssr';
  let v = ler('visita');
  if (!v || !/^[a-z0-9]{6,32}$/.test(v)) {
    let aleatorio = '';
    try {
      const b = new Uint32Array(2);
      crypto.getRandomValues(b);
      aleatorio = Array.from(b, (n) => n.toString(36)).join('');
    } catch {
      aleatorio = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    }
    v = aleatorio.replace(/[^a-z0-9]/g, '').slice(0, 24).padEnd(6, '0');
    gravar('visita', v);
  }
  return v;
}

export const rodapeFechado = (): boolean => typeof window !== 'undefined' && ler('rodape-fechado') === '1';
export const fecharRodape = (): void => gravar('rodape-fechado', '1');

/** Última informação sobre a faixa do topo: true (havia), false (não havia) ou null (nunca soube). */
export function topoEsperado(): boolean | null {
  if (typeof window === 'undefined') return null;
  const v = ler('topo');
  return v === '1' ? true : v === '0' ? false : null;
}
export const lembrarTopo = (tem: boolean): void => gravar('topo', tem ? '1' : '0');
