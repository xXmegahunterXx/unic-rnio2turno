/**
 * Healthcheck do contêiner do Sintonia (HEALTHCHECK do Dockerfile e do docker-compose.yml).
 *
 *   node /app/healthcheck.mjs   → GET http://127.0.0.1:$PORT/healthz; saída 0 = saudável, 1 = falhou
 *
 * Vigia de travamento: o Docker só MARCA um contêiner como "unhealthy", não o reinicia. Por isso, depois que o
 * servidor já respondeu bem ao menos uma vez, AUTORREINICIO_FALHAS falhas seguidas (padrão 5 ≈ 75 s com o
 * intervalo de 15 s) indicam processo travado: este script manda SIGTERM ao servidor (encerramento gracioso, que
 * grava o estado) e, se ele seguir sem responder na verificação seguinte, SIGKILL. O processo sai e a política
 * `restart: unless-stopped` sobe o contêiner de novo. Exige um PID 1 de verdade (`init: true` no compose ou
 * `docker run --init`). Desligue com AUTORREINICIO=0.
 *
 * Sem dependências: só node:fs e o fetch nativo do Node 22.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const PORTA = Number(process.env.PORT) || 8787;
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS) || 5000;
const LIMITE = Math.max(2, Number(process.env.AUTORREINICIO_FALHAS) || 5);
const AUTO = !/^(0|false|n|nao|não|no|off)$/i.test((process.env.AUTORREINICIO ?? '1').trim());
const ARQ = '/tmp/sintonia-healthcheck.json';

/** PID do servidor (node … dist-server/main.js) e o instante em que ele começou (para detectar reinícios). */
function servidor() {
  let dirs = [];
  try {
    dirs = readdirSync('/proc');
  } catch {
    return null;
  }
  for (const d of dirs) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    try {
      const args = readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0');
      if (!args.some((a) => a.endsWith('dist-server/main.js'))) continue;
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return { pid: Number(d), id: `${d}:${campos[19] ?? '?'}` }; // campo 22 do stat = starttime
    } catch {
      /* processo sumiu no meio da leitura */
    }
  }
  return null;
}

function lerEstado() {
  try {
    const v = JSON.parse(readFileSync(ARQ, 'utf8'));
    if (v && typeof v === 'object') return v;
  } catch {
    /* primeira execução ou /tmp limpo */
  }
  return {};
}

function gravarEstado(v) {
  try {
    writeFileSync(ARQ, JSON.stringify(v));
  } catch {
    /* /tmp somente leitura: o vigia fica desligado, o healthcheck continua valendo */
  }
}

const proc = servidor();
let estado = lerEstado();
if (estado.id !== (proc?.id ?? null)) estado = { id: proc?.id ?? null, ok: false, falhas: 0 };

try {
  const r = await fetch(`http://127.0.0.1:${PORTA}/healthz`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw new Error(`HTTP ${r.status}`);
  gravarEstado({ id: estado.id, ok: true, falhas: 0 });
  const tse = j.tse ? ` · tse ${j.tse.ok ? 'ok' : 'com falhas'}` : '';
  console.log(`ok · fonte ${j.fonte} · fase ${j.fase} · versão ${j.versao} · ${j.memoriaMb} MB · no ar há ${j.uptimeSeg} s${tse}`);
  process.exit(0);
} catch (e) {
  const motivo = e instanceof Error ? (e.name === 'TimeoutError' ? `sem resposta em ${TIMEOUT_MS} ms` : e.message) : String(e);
  estado.falhas = (Number(estado.falhas) || 0) + 1;
  let acao = '';
  if (AUTO && estado.ok && proc && estado.falhas >= LIMITE) {
    const sinal = estado.falhas > LIMITE ? 'SIGKILL' : 'SIGTERM';
    try {
      process.kill(proc.pid, sinal);
      acao = ` → ${sinal} no servidor (pid ${proc.pid}) para o Docker reiniciá-lo`;
    } catch (err) {
      acao = ` → não consegui sinalizar o servidor: ${err instanceof Error ? err.message : err}`;
    }
  }
  gravarEstado(estado);
  console.error(`/healthz falhou (${estado.falhas}× seguidas): ${motivo}${acao}`);
  process.exit(1);
}
