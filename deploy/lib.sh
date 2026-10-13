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
  # VPS compartilhada ainda sem domínio: o app direto na porta local (as portas 80/443 são de outro servidor)
  if compartilhado && [[ -z "$(cfg DOMINIO)" ]]; then
    printf 'http://127.0.0.1:%s/healthz' "$(cfg PORTA_LOCAL 8787)"
    return 0
  fi
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

# ---- VPS compartilhada (outros projetos na mesma máquina) -----------------------------------------------
# MODO_VPS no .env: 'exclusivo' (padrão: o Caddy do Sintonia atende 80/443) ou 'compartilhado' (a máquina já tem
# outros sites: o app fica só em 127.0.0.1:PORTA_LOCAL, o Caddy do Sintonia fica desligado e o servidor web que
# já existe encaminha o domínio — deploy/dominio.sh configura). CADDY_PROPRIO=1 liga o Caddy do Sintonia mesmo no
# modo compartilhado (quando ninguém usa 80/443).
modo_vps() { cfg MODO_VPS exclusivo; }
compartilhado() { [[ "$(modo_vps)" == compartilhado ]]; }
caddy_proprio() { ! compartilhado || [[ "$(cfg CADDY_PROPRIO 0)" == 1 ]]; }

# porta TCP livre a partir de $1 (nem processo ouvindo nem contêiner publicando)
porta_livre() {
  local p=${1:-8787} fim=$((${1:-8787} + 200))
  while ((p < fim)); do
    if [[ -z "$(ss -Htln "sport = :$p" 2>/dev/null)" ]] &&
      ! { command -v docker >/dev/null 2>&1 && docker ps --format '{{.Ports}}' 2>/dev/null | grep -qE "[:.]$p->"; }; then
      printf '%s' "$p"
      return 0
    fi
    p=$((p + 1))
  done
  return 1
}

# painel de hospedagem instalado (cPanel, Plesk, aaPanel…): o servidor web é dele, não mexemos à mão
painel_hospedagem() {
  local d
  for d in /usr/local/cpanel:cPanel /usr/local/psa:Plesk /www/server/panel:aaPanel /usr/local/CyberCP:CyberPanel \
    /usr/local/hestia:HestiaCP /usr/local/vesta:VestaCP /data/coolify:Coolify /etc/dokploy:Dokploy \
    /etc/easypanel:EasyPanel /captain:CapRover /opt/cloudpanel:CloudPanel /usr/local/ispconfig:ISPConfig; do
    if [[ -e ${d%%:*} ]]; then
      printf '%s' "${d#*:}"
      return 0
    fi
  done
  return 1
}

# Quem atende as portas 80/443 desta máquina (fora o Caddy do próprio Sintonia). Define:
#   PROXY_TIPO       nenhum | nginx | caddy | apache | docker | painel | outro
#   PROXY_DESC       descrição para mostrar
#   PROXY_CONTEINER, PROXY_IMAGEM, PROXY_REDES (redes Docker do proxy), PROXY_REDE_HOST=1 (contêiner em network_mode host)
#   PROXY_DOCKER     nginx-proxy | caddy-docker-proxy | npm | traefik | caddy | nginx | outro  (quando PROXY_TIPO=docker)
detectar_proxy() {
  PROXY_TIPO=nenhum PROXY_DESC='' PROXY_CONTEINER='' PROXY_IMAGEM='' PROXY_REDES='' PROXY_REDE_HOST='' PROXY_DOCKER=''
  local id nome imagem projeto portas linha proc pid exe cid painel tem_docker=''
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && tem_docker=1

  # 1) contêiner publicando 80 ou 443 no host
  if [[ -n $tem_docker ]]; then
    while IFS=$'\t' read -r id nome imagem projeto portas; do
      [[ $projeto == sintonia ]] && continue
      if [[ $portas =~ (^|[ ,])([0-9.]+|\[::\]|::):(80|443)- ]]; then
        PROXY_TIPO=docker PROXY_CONTEINER=$nome PROXY_IMAGEM=$imagem
        break
      fi
    done < <(docker ps --format '{{.ID}}{{"\t"}}{{.Names}}{{"\t"}}{{.Image}}{{"\t"}}{{.Label "com.docker.compose.project"}}{{"\t"}}{{.Ports}}' 2>/dev/null)
  fi

  # 2) processo do host ouvindo 80/443 (ou contêiner em network_mode host)
  if [[ $PROXY_TIPO == nenhum ]]; then
    while read -r linha; do
      [[ $linha =~ users:\(\(\"([^\"]+)\",pid=([0-9]+) ]] || continue
      proc=${BASH_REMATCH[1]} pid=${BASH_REMATCH[2]}
      [[ $proc == docker-proxy ]] && continue # porta publicada por contêiner (já visto acima, ou o nosso Caddy)
      if [[ -n $tem_docker ]] && cid="$(grep -oE '[0-9a-f]{64}' "/proc/$pid/cgroup" 2>/dev/null | head -n 1)" && [[ -n $cid ]] &&
        nome="$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null)"; then
        [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$cid" 2>/dev/null)" == sintonia ]] && continue
        PROXY_TIPO=docker PROXY_CONTEINER=${nome#/} PROXY_IMAGEM="$(docker inspect -f '{{.Config.Image}}' "$cid")" PROXY_REDE_HOST=1
        break
      fi
      exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
      case $proc in
        nginx | openresty)
          if [[ $exe == /usr/sbin/nginx && -f /etc/nginx/nginx.conf ]]; then PROXY_TIPO=nginx; else PROXY_TIPO=painel; fi
          PROXY_DESC="nginx ($exe)"
          ;;
        caddy)
          if [[ -f /etc/caddy/Caddyfile ]]; then PROXY_TIPO=caddy; else PROXY_TIPO=outro; fi
          PROXY_DESC="Caddy ($exe)"
          ;;
        apache2 | httpd)
          if [[ $exe == /usr/sbin/apache2 && -d /etc/apache2/sites-available ]]; then PROXY_TIPO=apache; else PROXY_TIPO=painel; fi
          PROXY_DESC="Apache ($exe)"
          ;;
        *)
          PROXY_TIPO=outro
          PROXY_DESC="$proc ($exe)"
          ;;
      esac
      break
    done < <(ss -Htlnp '( sport = :80 or sport = :443 )' 2>/dev/null)
  fi

  if [[ $PROXY_TIPO == docker ]]; then
    PROXY_REDES="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$PROXY_CONTEINER" 2>/dev/null || true)"
    [[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$PROXY_CONTEINER" 2>/dev/null)" == host ]] && PROXY_REDE_HOST=1
    case ${PROXY_IMAGEM,,} in
      *nginx-proxy-manager*) PROXY_DOCKER=npm PROXY_DESC="Nginx Proxy Manager (contêiner $PROXY_CONTEINER)" ;;
      *nginx-proxy* | *jwilder/nginx*) PROXY_DOCKER=nginx-proxy PROXY_DESC="nginx-proxy (contêiner $PROXY_CONTEINER)" ;;
      *caddy-docker-proxy*) PROXY_DOCKER=caddy-docker-proxy PROXY_DESC="caddy-docker-proxy (contêiner $PROXY_CONTEINER)" ;;
      *traefik*) PROXY_DOCKER=traefik PROXY_DESC="Traefik (contêiner $PROXY_CONTEINER)" ;;
      *caddy*) PROXY_DOCKER=caddy PROXY_DESC="Caddy em contêiner ($PROXY_CONTEINER)" ;;
      *nginx* | *openresty*) PROXY_DOCKER=nginx PROXY_DESC="nginx em contêiner ($PROXY_CONTEINER)" ;;
      *) PROXY_DOCKER=outro PROXY_DESC="contêiner $PROXY_CONTEINER ($PROXY_IMAGEM)" ;;
    esac
  fi
  if painel="$(painel_hospedagem)" && [[ $PROXY_TIPO != nenhum ]]; then
    PROXY_DESC="${PROXY_DESC:-servidor web} — gerenciado pelo $painel"
    # o painel reescreve a configuração do servidor web: o domínio se cadastra por ele
    PROXY_TIPO=painel
  fi
  [[ -n $PROXY_DESC ]] || PROXY_DESC="ninguém usa as portas 80/443"
}

# redes Docker (não padrão) do proxy em contêiner, onde o app entra com o apelido "sintonia-app"
redes_do_proxy() {
  local r out=''
  for r in $PROXY_REDES; do
    [[ $r == bridge || $r == host || $r == none || $r == sintonia_default ]] && continue
    out+="$r "
  done
  printf '%s' "${out% }"
}

# Gera docker-compose.vps.yml (modo compartilhado; o .env aponta para ele em COMPOSE_FILE). Fonte: o .env
# (PORTA_LOCAL, PORT, CADDY_PROPRIO, REDES_PROXY, PROXY_DOCKER, HOSTS_PROXY).
gerar_compose_vps() {
  local arq="$RAIZ/docker-compose.vps.yml" tmp porta interna redes r i=0 tipo hosts
  porta="$(cfg PORTA_LOCAL 8787)"
  interna="$(cfg PORT 8787)"
  redes="$(cfg REDES_PROXY)"
  tipo="$(cfg PROXY_DOCKER)"
  hosts="$(cfg HOSTS_PROXY)"
  hosts="${hosts// /}"
  [[ $hosts =~ ^[a-z0-9.,-]+$ ]] || hosts=''
  tmp="$(mktemp "$arq.XXXXXX")"
  {
    echo "# GERADO por deploy/install.sh e deploy/dominio.sh (VPS compartilhada). Não edite à mão: mude o .env e"
    echo "# rode sudo $RAIZ/deploy/dominio.sh (ou o install.sh) de novo."
    echo "services:"
    echo "  app:"
    echo "    # só nesta máquina (127.0.0.1): o servidor web que já existe encaminha o domínio para cá"
    echo "    ports:"
    echo "      - \"127.0.0.1:$porta:$interna\""
    if [[ -n $redes ]]; then
      echo "    # rede(s) do proxy em contêiner: lá o app atende como http://sintonia-app:$interna"
      echo "    networks:"
      echo "      default: {}"
      for r in $redes; do
        i=$((i + 1))
        echo "      rede_proxy_$i:"
        echo "        aliases: [sintonia-app]"
      done
    fi
    if [[ -n $hosts && $tipo == nginx-proxy ]]; then
      echo "    environment:"
      echo "      VIRTUAL_HOST: \"$hosts\""
      echo "      VIRTUAL_PORT: \"$interna\""
      echo "      LETSENCRYPT_HOST: \"$hosts\""
    elif [[ -n $hosts && $tipo == caddy-docker-proxy ]]; then
      echo "    labels:"
      echo "      caddy: \"${hosts//,/, }\""
      echo "      caddy.reverse_proxy: \"{{upstreams $interna}}\""
      echo "      caddy.reverse_proxy.header_up: \"X-Real-IP {remote_host}\""
    fi
    if ! caddy_proprio; then
      echo "  caddy:"
      echo "    # desligado: outro servidor web já atende 80/443 nesta máquina"
      echo "    profiles: [caddy-proprio]"
    fi
    if [[ -n $redes ]]; then
      echo "networks:"
      i=0
      for r in $redes; do
        i=$((i + 1))
        echo "  rede_proxy_$i:"
        echo "    external: true"
        echo "    name: $r"
      done
    fi
  } >"$tmp"
  chmod 644 "$tmp"
  mv "$tmp" "$arq"
}

# /healthz direto na porta local (modo compartilhado)
healthz_local() { curl -fsS --max-time 5 "http://127.0.0.1:$(cfg PORTA_LOCAL 8787)/healthz"; }
