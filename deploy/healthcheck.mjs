/**
 * Healthcheck do contêiner do Sintonia (HEALTHCHECK do Dockerfile e do docker-compose.yml).
 *
 *   node /app/healthcheck.mjs   → GET http://127.0.0.1:$PORT/healthz; saída 0 = saudável, 1 = falhou
 *
 * Vigia de travamento: o Docker só MARCA um contêiner como "unhealthy", não o reinicia. Por isso, depois que o
 * servidor já respondeu bem ao menos uma vez, AUTORREINICIO_FALHAS falhas seguidas (padrão 5, uma a cada 15 s) com o
 * batimento PARADO indicam processo travado: este script manda SIGKILL ao servidor (num laço de eventos travado o
 * SIGTERM nunca é atendido — o tratador dele é JavaScript). Sem batimento legível (versão antiga), vale a regra antiga:
 * SIGTERM (encerramento gracioso) e, na verificação seguinte, SIGKILL. O processo sai e a política
 * `restart: unless-stopped` sobe o contêiner de novo. Exige um PID 1 de verdade (`init: true` no compose ou
 * `docker run --init`). Desligue com AUTORREINICIO=0. Tempo total num travamento real: ~2–3 min (30 s até o batimento
 * contar como parado + 5 verificações + a subida do processo novo).
 *
 * LENTO não é TRAVADO: com a CPU saturada (pico da noite, ataque que fura a CDN), conexão NOVA pode esperar mais que o
 * limite de 5 s enquanto o processo segue atendendo o pool keep-alive do proxy. Reiniciar nessa hora esfria os caches e
 * não resolve a carga. Por isso o servidor grava um batimento a cada 1 s (BATIMENTO_ARQ, padrão /tmp/sintonia-batimento:
 * `{"pid":…,"t":…}`, main.ts) e uma falha do /healthz só conta para o autorreinício quando o batimento do MESMO
 * processo estiver parado há mais de BATIMENTO_MAX_SEG (padrão 30 s) — num travamento de verdade o laço de eventos para
 * e o batimento também. Sem batimento legível (versão antiga, /tmp somente leitura), vale a regra antiga (só o /healthz).
 *
 * VIVO MAS SEM ATENDER (o laço gira mas o servidor HTTP parou de aceitar conexões: EMFILE, socket fechado): o batimento
 * segue fresco e as falhas contam como "lentas". Depois de AUTORREINICIO_VIVO_FALHAS lentas SEGUIDAS (padrão 20 ≈ 5 min
 * sem nenhuma resposta do /healthz), também reinicia: SIGTERM (o laço gira, então grava o estado) e SIGKILL na seguinte.
 * Uma sobrecarga normal alterna respostas boas e lentas e zera a contagem. AUTORREINICIO_VIVO_FALHAS=0 desliga só isto.
 *
 * Sem dependências: só node:fs e o fetch nativo do Node 22.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const PORTA = Number(process.env.PORT) || 8787;
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS) || 5000;
const LIMITE = Math.max(2, Number(process.env.AUTORREINICIO_FALHAS) || 5);
const AUTO = !/^(0|false|n|nao|não|no|off)$/i.test((process.env.AUTORREINICIO ?? '1').trim());
const ARQ = '/tmp/sintonia-healthcheck.json';
const BATIMENTO = process.env.BATIMENTO_ARQ || '/tmp/sintonia-batimento';
const BATIMENTO_MAX_MS = Math.max(5, Number(process.env.BATIMENTO_MAX_SEG) || 30) * 1000;
const VIVO_ENV = (process.env.AUTORREINICIO_VIVO_FALHAS ?? '').trim();
const LIMITE_VIVO = VIVO_ENV === '' || !Number.isFinite(Number(VIVO_ENV)) ? 20 : Number(VIVO_ENV) <= 0 ? 0 : Math.max(LIMITE, Number(VIVO_ENV));

/** Idade (ms) do batimento do servidor `pid`, ou null se não houver batimento desse processo. */
function idadeBatimento(pid) {
  try {
    const b = JSON.parse(readFileSync(BATIMENTO, 'utf8'));
    if (!b || b.pid !== pid || typeof b.t !== 'number') return null;
    return Math.max(0, Date.now() - b.t);
  } catch {
    return null;
  }
}

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
      // o próprio node (não o init do contêiner, que também tem "dist-server/main.js" nos argumentos)
      if (!/(^|\/)node$/.test(args[0] ?? '') || !args.some((a) => a.endsWith('dist-server/main.js'))) continue;
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
  const idade = proc ? idadeBatimento(proc.pid) : null;
  if (idade !== null && idade <= BATIMENTO_MAX_MS) {
    // processo vivo (laço de eventos girando): sobrecarga, não travamento — só reinicia depois de LIMITE_VIVO seguidas
    const lentas = (Number(estado.lentas) || 0) + 1;
    let acao = ' — mas o processo está vivo (batimento há ' + Math.round(idade / 1000) + ' s): sobrecarga, SEM reinício';
    if (AUTO && LIMITE_VIVO > 0 && estado.ok && proc && lentas >= LIMITE_VIVO) {
      const sinal = lentas > LIMITE_VIVO ? 'SIGKILL' : 'SIGTERM';
      try {
        process.kill(proc.pid, sinal);
        acao = ` · ${lentas}× seguidas sem resposta com o processo vivo (servidor HTTP parado?) → ${sinal} no servidor (pid ${proc.pid}) para o Docker reiniciá-lo`;
      } catch (err) {
        acao = ` · ${lentas}× seguidas sem resposta → não consegui sinalizar o servidor: ${err instanceof Error ? err.message : err}`;
      }
    }
    gravarEstado({ id: estado.id, ok: estado.ok, falhas: 0, lentas });
    console.error(`/healthz falhou: ${motivo}${acao}`);
    process.exit(1);
  }
  estado.falhas = (Number(estado.falhas) || 0) + 1;
  estado.lentas = 0;
  let acao = '';
  if (AUTO && estado.ok && proc && estado.falhas >= LIMITE) {
    // batimento PARADO (laço travado): SIGKILL direto, o SIGTERM nunca seria atendido; sem batimento, SIGTERM antes
    const sinal = idade !== null || estado.falhas > LIMITE ? 'SIGKILL' : 'SIGTERM';
    try {
      process.kill(proc.pid, sinal);
      acao = ` → ${sinal} no servidor (pid ${proc.pid}) para o Docker reiniciá-lo`;
    } catch (err) {
      acao = ` → não consegui sinalizar o servidor: ${err instanceof Error ? err.message : err}`;
    }
  }
  gravarEstado(estado);
  const bat = idade === null ? 'sem batimento' : `batimento parado há ${Math.round(idade / 1000)} s`;
  console.error(`/healthz falhou (${estado.falhas}× seguidas): ${motivo} · ${bat}${acao}`);
  process.exit(1);
}
