import { useCallback, useSyncExternalStore } from 'react';

export type Tema = 'dark' | 'light';
const CHAVE = 'sintonia:tema';

const listeners = new Set<() => void>();

function lerTema(): Tema {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Ajusta <meta name="theme-color"> para a cor de fundo do tema (lida do token --bg). */
function sincronizarMetaCor() {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', `rgb(${bg.split(/\s+/).join(', ')})`);
}

/** Aplica o tema no <html data-theme> e persiste (fora de React também). */
export function aplicarTema(tema: Tema, persistir = true) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Evita transições "piscando" durante a troca de tema.
  root.classList.add('[&_*]:!transition-none');
  root.setAttribute('data-theme', tema);
  if (persistir) {
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* modo privado: ignora */
    }
  }
  sincronizarMetaCor();
  window.requestAnimationFrame(() => root.classList.remove('[&_*]:!transition-none'));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CHAVE && (e.newValue === 'light' || e.newValue === 'dark')) aplicarTema(e.newValue, false);
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Tema atual (data-theme no <html>, persistido em localStorage 'sintonia:tema'). */
export function useTheme(): { tema: Tema; setTema: (t: Tema) => void; alternar: () => void } {
  const tema = useSyncExternalStore(subscribe, lerTema, () => 'dark' as Tema);
  const setTema = useCallback((t: Tema) => aplicarTema(t), []);
  const alternar = useCallback(() => aplicarTema(lerTema() === 'dark' ? 'light' : 'dark'), []);
  return { tema, setTema, alternar };
}
