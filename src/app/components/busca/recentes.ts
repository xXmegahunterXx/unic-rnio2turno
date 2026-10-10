/** Buscas recentes (só neste aparelho; localStorage com try/catch — modo privado/armazenamento bloqueado segue sem). */
import type { ItemBusca } from './indice';

const CHAVE = 'sintonia:busca:recentes';
const MAX = 6;

export type Recente = Pick<ItemBusca, 'id' | 'tipo' | 'rotulo' | 'sub' | 'to' | 'icone'>;

export function lerRecentes(): Recente[] {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Recente => !!x && typeof x === 'object' && typeof (x as Recente).to === 'string' && typeof (x as Recente).rotulo === 'string')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function gravarRecente(it: Recente): void {
  try {
    const lista = [{ id: it.id, tipo: it.tipo, rotulo: it.rotulo, sub: it.sub, to: it.to, icone: it.icone }, ...lerRecentes().filter((x) => x.id !== it.id)];
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAX)));
  } catch {
    /* sem armazenamento: segue sem recentes */
  }
}

export function limparRecentes(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}
