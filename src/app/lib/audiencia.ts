/**
 * Sinal de audiência do app (ARCHITECTURE §11.12; contrato em src/shared/audiencia.ts). Chunk próprio: main.tsx carrega
 * depois da 1ª pintura (fora do JS inicial).
 *
 * O que sai do navegador: `POST /api/audiencia` com { g: grupo da rota } a cada página vista (+ { o: origem } só na 1ª da
 * aba) e { p: 1, g } enquanto a aba está VISÍVEL, no intervalo que o servidor devolver (60–240 s, conforme a carga). Nada
 * mais: sem caminho, query string, referrer completo, cookie ou identificador. Aba escondida não manda nada; página
 * aberta em segundo plano só conta quando aparece.
 *
 * Widgets (`/embed/*`, dentro de outros sites) e a `/live` (fonte do OBS) mandam só a página vista, NUNCA presença: não são
 * uma pessoa no Sintonia e não podem entrar nos únicos nem no pico. As prévias da /streamers (`?previa=1`) não mandam nada.
 *
 * Não roda no build demo (sem servidor), em navegador automatizado (`navigator.webdriver`) nem com "não rastrear"
 * (Global Privacy Control ou Do Not Track ligados): a contagem fica menor, nunca maior.
 */
import { GRUPOS_FORA_DE_PESSOAS, grupoDaRota, origemDaEntrada, type GrupoRota, type RespostaSinal, type SinalAudiencia } from '@/shared/audiencia';

const ROTA = '/api/audiencia';
/** Marca (só na aba) de que a entrada já foi contada: recarregar a página não conta a origem de novo. */
const CHAVE_ENTRADA = 'sintonia:aud-entrada';

interface RouterLike {
  state: { location: { pathname: string } };
  subscribe(fn: (s: { location: { pathname: string } }) => void): () => void;
}

let instalado = false;
let intervaloS = 60;
let ultimoEnvio = 0;
let timer = 0;
let caminhoAtual: string | null = null;
/** grupo da página aberta (vai junto com a presença) */
let grupoAtual: GrupoRota | null = null;
/** página vista enquanto a aba estava escondida: sai quando aparecer */
let pendente: SinalAudiencia | null = null;
/** rota que não conta (painel): sem sinal de presença */
let pausado = false;

/** Pode medir? (sem servidor, automação, "não rastrear" ou prévia da /streamers → não) */
export function medicaoPermitida(): boolean {
  if (__DEMO__ || typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('previa') === '1') return false;
  } catch {
    /* sem URL: segue */
  }
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (n.webdriver) return false;
  if (n.globalPrivacyControl === true || n.doNotTrack === '1') return false;
  return typeof fetch === 'function';
}

const visivel = () => document.visibilityState === 'visible';

function enviar(corpo: SinalAudiencia) {
  ultimoEnvio = Date.now();
  agendar();
  try {
    fetch(ROTA, {
      method: 'POST',
      body: JSON.stringify(corpo),
      keepalive: true,
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    })
      .then((r) => (r.ok ? (r.json() as Promise<RespostaSinal>) : null))
      .then((j) => {
        if (!j || typeof j.s !== 'number' || j.s < 30 || j.s > 900 || j.s === intervaloS) return;
        intervaloS = j.s;
        agendar();
      })
      .catch(() => undefined);
  } catch {
    /* sem rede: a medição é só agregada; perder um sinal não quebra nada */
  }
}

/** Próximo sinal de presença (±10%, para os navegadores não baterem juntos). */
function agendar() {
  window.clearTimeout(timer);
  timer = 0;
  if (pausado || !visivel() || !grupoAtual) return;
  const falta = Math.max(1000, intervaloS * 1000 * (0.9 + Math.random() * 0.2) - (Date.now() - ultimoEnvio));
  timer = window.setTimeout(presenca, falta);
}

function presenca() {
  if (!pausado && grupoAtual) enviar({ p: 1, g: grupoAtual });
}

function aoMudarAba() {
  if (!visivel()) {
    window.clearTimeout(timer);
    timer = 0;
    return;
  }
  if (pendente) {
    const c = pendente;
    pendente = null;
    enviar(c);
  } else if (!pausado && Date.now() - ultimoEnvio >= intervaloS * 1000) presenca();
  else agendar();
}

function origemDestaAba(): string | null {
  try {
    if (sessionStorage.getItem(CHAVE_ENTRADA)) return null;
    sessionStorage.setItem(CHAVE_ENTRADA, '1');
  } catch {
    /* armazenamento bloqueado: conta a origem (no pior caso, de novo ao recarregar) */
  }
  let utm: string | null = null;
  try {
    utm = new URLSearchParams(window.location.search).get('utm_source');
  } catch {
    utm = null;
  }
  return origemDaEntrada(document.referrer, utm, window.location.host);
}

let primeira = true;

function paginaVista(pathname: string) {
  const g = grupoDaRota(pathname);
  if (!g) {
    // painel (/admin): não conta e não manda presença
    pausado = true;
    grupoAtual = null;
    caminhoAtual = pathname;
    window.clearTimeout(timer);
    return;
  }
  // widget em outro site ou fonte do OBS: só a página vista, nunca presença
  pausado = GRUPOS_FORA_DE_PESSOAS.includes(g);
  grupoAtual = g;
  if (pausado) {
    window.clearTimeout(timer);
    timer = 0;
  }
  // só a query mudou (ex.: ?race=): a mesma página
  if (pathname === caminhoAtual) return;
  caminhoAtual = pathname;
  const corpo: SinalAudiencia = { g };
  if (primeira) {
    primeira = false;
    const o = origemDestaAba();
    if (o) corpo.o = o;
  }
  if (visivel()) {
    pendente = null;
    enviar(corpo);
  } else pendente = corpo;
}

/** Liga a medição (uma vez por aba). */
export function instalarAudiencia(router: RouterLike): void {
  if (instalado || !medicaoPermitida()) return;
  instalado = true;
  const iniciar = () => {
    paginaVista(router.state.location.pathname);
    router.subscribe((s) => paginaVista(s.location.pathname));
    document.addEventListener('visibilitychange', aoMudarAba);
  };
  const doc = document as Document & { prerendering?: boolean };
  if (doc.prerendering) document.addEventListener('prerenderingchange', iniciar, { once: true });
  else iniciar();
}
