# shellcheck shell=bash
# Funções comuns dos scripts de deploy do Sintonia (carregado com "source"; não execute direto).
#
# Variáveis que os scripts respeitam:
#   SINTONIA_DIR           pasta do projeto (padrão: a pasta acima de deploy/)
#   SINTONIA_ENV           arquivo de configuração (padrão: $SINTONIA_DIR/.env)
#   SINTONIA_COMPOSE_ARGS  argumentos extras do "docker compose" (testes: -p nome -f outro.yml …)

set -euo pipefail

DIR_DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="${SINTONIA_DIR:-$(cd "$DIR_DEPLOY/.." && pwd)}"
ARQ_ENV="${SINTONIA_ENV:-$RAIZ/.env}"
IMAGEM="sintonia-app"
read -r -a COMPOSE_EXTRA <<<"${SINTONIA_COMPOSE_ARGS:-}"

if [[ -t 1 && -z ${NO_COLOR:-} ]]; then
  C_OK=$'\e[32m' C_AV=$'\e[33m' C_ER=$'\e[31m' C_NEG=$'\e[1m' C_FRACO=$'\e[2m' C_FIM=$'\e[0m'
else
  C_OK='' C_AV='' C_ER='' C_NEG='' C_FRACO='' C_FIM=''
fi

info() { printf '%s\n' "${C_NEG}==>${C_FIM} ${C_NEG}$*${C_FIM}"; }
ok() { printf '%s\n' "${C_OK}✔${C_FIM} $*"; }
aviso() { printf '%s\n' "${C_AV}! $*${C_FIM}" >&2; }
erro() { printf '%s\n' "${C_ER}✘ $*${C_FIM}" >&2; }
morrer() {
  erro "$@"
  exit 1
}
fraco() { printf '%s\n' "${C_FRACO}$*${C_FIM}"; }

# docker compose sempre com a pasta do projeto e o .env certos, de qualquer diretório (o COMPOSE_FILE do .env,
# usado para as réplicas, é relativo à pasta atual: por isso o cd)
dc() {
  (cd "$RAIZ" && docker compose --project-directory "$RAIZ" --env-file "$ARQ_ENV" ${COMPOSE_EXTRA[@]+"${COMPOSE_EXTRA[@]}"} "$@")
}

# env_valor CHAVE [padrão] → valor no .env (sem aspas em volta); padrão se ausente ou vazio
env_valor() {
  local v=''
  if [[ -r $ARQ_ENV ]]; then
    v="$(grep -E "^[[:space:]]*$1=" "$ARQ_ENV" | tail -n 1 | cut -d= -f2-)" || true
  fi
  v="${v%$'\r'}"
  if [[ $v == \'*\' || $v == \"*\" ]]; then v="${v:1:${#v}-2}"; fi
  printf '%s' "${v:-${2:-}}"
}

# cfg CHAVE [padrão] → como o docker compose enxerga: variável do ambiente > .env > padrão
cfg() {
  local v="${!1:-}"
  if [[ -n $v ]]; then printf '%s' "$v"; else env_valor "$1" "${2:-}"; fi
}

exigir_docker() {
  command -v docker >/dev/null 2>&1 || morrer "Docker não encontrado. Rode antes: sudo $DIR_DEPLOY/install.sh"
  docker info >/dev/null 2>&1 || morrer "Sem acesso ao Docker (rode com sudo, ou o serviço docker está parado: sudo systemctl start docker)."
  docker compose version >/dev/null 2>&1 || morrer "Plugin 'docker compose' ausente. Rode: sudo $DIR_DEPLOY/install.sh"
}

exigir_env() {
  [[ -f $ARQ_ENV ]] || morrer "Configuração não encontrada: $ARQ_ENV (rode sudo $DIR_DEPLOY/install.sh ou copie .env.example para .env)."
}

# trava para dois scripts não mexerem nos contêineres ao mesmo tempo
travar() {
  local arq="${TMPDIR:-/tmp}/sintonia-deploy.lock"
  exec 9>"$arq"
  if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
    morrer "Outra operação de deploy (update/restore) está em andamento. Espere terminar."
  fi
}

# IDs dos contêineres do app (1 por instância)
ids_app() { dc ps -q app 2>/dev/null || true; }

app_rodando() { [[ -n "$(dc ps -q --status running app 2>/dev/null || true)" ]]; }

# esperar_saude [segundos] → 0 quando TODAS as instâncias do app estão "healthy"; 1 no fim do prazo ou logo
# que uma instância fica "unhealthy" ou entra em ciclo de reinícios (falha rápida)
esperar_saude() {
  local limite=$((SECONDS + ${1:-180})) id est rc todos ultimo='' ids
  while ((SECONDS < limite)); do
    ids="$(ids_app)"
    if [[ -n $ids ]]; then
      todos=1
      for id in $ids; do
        est="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo ausente)"
        rc="$(docker inspect -f '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)"
        if [[ $est == unhealthy ]] || [[ $est != healthy && $rc -ge 3 ]]; then
          erro "   app em falha (estado: $est; reinícios: $rc)"
          return 1
        fi
        [[ $est == healthy ]] || todos=0
      done
      if ((todos)); then return 0; fi
      if [[ $est != "$ultimo" ]]; then
        fraco "   app: $est…"
        ultimo=$est
      fi
    fi
    sleep 2
  done
  return 1
}

# /healthz de dentro do contêiner (não depende do Caddy nem do DNS); imprime o JSON
healthz() {
  dc exec -T app node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>r.text()).then(t=>{console.log(t)},e=>{console.error(e.message);process.exit(1)})"
}

# URL pública de verificação e argumentos do curl, conforme SITE_ADDRESS (domínio, :80 ou localhost)
url_publica() {
  local site host http_p https_p
  site="$(cfg SITE_ADDRESS "$(cfg DOMINIO)")"
  host="${site%%,*}"
  host="${host// /}"
  http_p="$(cfg HTTP_PORT 80)"
  https_p="$(cfg HTTPS_PORT 443)"
  if [[ $host == :* || $host == http://* ]]; then
    printf 'http://127.0.0.1:%s/healthz' "$http_p"
  else
    host="${host#https://}"
    printf 'https://%s:%s/healthz' "$host" "$https_p"
  fi
}

# verificar_publico [segundos] → 0 se o /healthz responde pelo Caddy (HTTPS de verdade, salvo localhost)
verificar_publico() {
  local limite=$((SECONDS + ${1:-60})) url host porta args=(-fsS -o /dev/null --max-time 8)
  url="$(url_publica)"
  if [[ $url == https://* ]]; then
    host="${url#https://}"
    host="${host%%/*}"
    porta="${host##*:}"
    host="${host%:*}"
    args+=(--resolve "$host:$porta:127.0.0.1")
    [[ $host == localhost || $host == *.localhost ]] && args+=(-k)
  fi
  while :; do
    if curl "${args[@]}" "$url" 2>/dev/null; then return 0; fi
    ((SECONDS < limite)) || break
    sleep 3
  done
  return 1
}

# git no repositório do deploy; safe.directory evita o erro "dubious ownership" quando a pasta foi clonada por
# outro usuário e o script roda com sudo
gitr() { git -C "$RAIZ" -c safe.directory="$RAIZ" "$@"; }

commit_atual() { gitr rev-parse --short HEAD 2>/dev/null || echo desconhecido; }

# revisão (commit) gravada na imagem
revisao_imagem() {
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${1:-$IMAGEM:latest}" 2>/dev/null || true
}

# revisão (commit) do contêiner do app que está rodando agora (vazio se parado)
revisao_rodando() {
  local id
  id="$(dc ps -q --status running app 2>/dev/null | head -n 1 || true)"
  [[ -n $id ]] || return 0
  docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$id" 2>/dev/null || true
}
