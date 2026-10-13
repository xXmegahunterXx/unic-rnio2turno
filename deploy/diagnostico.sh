#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — diagnóstico SÓ DE LEITURA da máquina, para mandar a quem está ajudando: o que atende as portas
# 80/443, que contêineres existem, onde está o Caddyfile/nginx, os endereços que cada um atende e a situação do
# Sintonia. Não mostra senhas, segredos nem o conteúdo das configurações (só os nomes dos sites).
#
#   sudo /opt/sintonia/deploy/diagnostico.sh
#   curl -fsSL https://raw.githubusercontent.com/xXmegahunterXx/unic-rnio2turno/HEAD/deploy/diagnostico.sh | sudo bash
# =====================================================================================================
{
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
LIB=''
for c in "$AQUI/lib.sh" /opt/sintonia/deploy/lib.sh; do
  if [[ -f $c ]]; then
    LIB=$c
    break
  fi
done
if [[ -n $LIB ]]; then
  # shellcheck source=deploy/lib.sh
  source "$LIB"
  set +e
fi
titulo() { printf '\n== %s\n' "$*"; }
linha() { printf '   %s\n' "$*"; }

# endereços (nomes de site) de um Caddyfile, sem o resto do conteúdo
sites_caddyfile() {
  awk '
    /^[[:space:]]*#/ { next }
    /^[^[:space:]({@][^#]*\{[[:space:]]*$/ { sub(/[[:space:]]*\{[[:space:]]*$/, ""); print "   site: " $0 }
  ' "$1" 2>/dev/null | head -n 30
}

titulo "Máquina"
. /etc/os-release 2>/dev/null
linha "sistema: ${PRETTY_NAME:-?} · kernel $(uname -r) · $(nproc) vCPU"
linha "memória: $(free -h 2>/dev/null | awk '/^Mem:/ {print $3 " usados de " $2 " (livre p/ uso: " $7 ")"}') · swap: $(free -h 2>/dev/null | awk '/^Swap:/ {print $2}')"
linha "disco /: $(df -h / | awk 'NR == 2 {print $4 " livres de " $2}')"
linha "IP público: $(curl -fsS4 --max-time 6 https://api.ipify.org 2>/dev/null || echo '?')"
linha "relógio: $(date '+%d/%m/%Y %H:%M:%S %Z') · NTP sincronizado: $(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo '?')"

titulo "Portas 80/443 (quem ouve)"
ss -Htlnp '( sport = :80 or sport = :443 )' 2>/dev/null | awk '{print "   " $4 "  " $6}' | sed 's/,fd=[0-9]*//g' | sort -u | head -n 10
ss -Hulnp '( sport = :443 )' 2>/dev/null | awk '{print "   " $4 " (udp)  " $6}' | sed 's/,fd=[0-9]*//g' | sort -u | head -n 4

titulo "Docker"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  linha "Docker $(docker version -f '{{.Server.Version}}' 2>/dev/null) · Compose $(docker compose version --short 2>/dev/null || echo 'ausente')"
  docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Label "com.docker.compose.project"}}|{{.Ports}}' 2>/dev/null |
    awk -F'|' '{printf "   %-28s %-34s %-22s projeto=%-14s %s\n", $1, $2, substr($3, 1, 22), ($4 == "" ? "-" : $4), $5}' | head -n 40
  linha "redes: $(docker network ls --format '{{.Name}}' 2>/dev/null | tr '\n' ' ')"
else
  linha "Docker não instalado ou sem resposta"
fi

if [[ -n $LIB ]]; then
  titulo "Servidor web detectado (como o dominio.sh vê)"
  detectar_proxy
  linha "tipo: $PROXY_TIPO${PROXY_DOCKER:+ ($PROXY_DOCKER)} · $PROXY_DESC"
  [[ -z $PROXY_CONTEINER ]] || linha "contêiner: $PROXY_CONTEINER · imagem $PROXY_IMAGEM · redes: ${PROXY_REDES:-?}${PROXY_REDE_HOST:+ · network_mode host}"
  if painel="$(painel_hospedagem)"; then linha "painel de hospedagem: $painel"; fi
fi

titulo "Caddy"
achou=''
if [[ -n ${PROXY_CADDYFILE:-} && -f ${PROXY_CADDYFILE:-} ]]; then
  linha "Caddy do sistema: $PROXY_CADDYFILE"
  sites_caddyfile "$PROXY_CADDYFILE"
  achou=1
elif [[ -f /etc/caddy/Caddyfile ]]; then
  linha "/etc/caddy/Caddyfile"
  sites_caddyfile /etc/caddy/Caddyfile
  achou=1
fi
if command -v docker >/dev/null 2>&1; then
  while read -r c; do
    [[ -n $c ]] || continue
    linha "contêiner $c — comando: $(docker inspect -f '{{json .Config.Cmd}}' "$c" 2>/dev/null | cut -c1-120)"
    docker inspect -f '{{range .Mounts}}{{.Type}}|{{.Source}}|{{.Destination}}{{"\n"}}{{end}}' "$c" 2>/dev/null |
      while IFS='|' read -r tipo origem destino; do
        [[ -n $tipo ]] || continue
        linha "   montagem $tipo: $origem → $destino"
        if [[ $destino == */Caddyfile && -f $origem ]]; then sites_caddyfile "$origem"; fi
        if [[ -f $origem/Caddyfile && $destino == /etc/caddy ]]; then sites_caddyfile "$origem/Caddyfile"; fi
      done
    achou=1
  done < <(docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | awk 'tolower($2) ~ /caddy/ {print $1}')
fi
[[ -n $achou ]] || linha "nenhum"

if command -v nginx >/dev/null 2>&1; then
  titulo "nginx"
  if nginx -t >/dev/null 2>&1; then linha "configuração: ok"; else linha "configuração: COM ERRO (nginx -t)"; fi
  nginx -T 2>/dev/null | grep -E '^\s*server_name\s' | sed 's/^\s*/   /' | sort -u | head -n 30
fi
if command -v apachectl >/dev/null 2>&1; then
  titulo "Apache"
  apachectl -S 2>/dev/null | grep -E 'namevhost|alias' | sed 's/^\s*/   /' | head -n 30
fi
if command -v ufw >/dev/null 2>&1; then
  titulo "Firewall (ufw)"
  ufw status 2>/dev/null | head -n 15 | sed 's/^/   /'
fi

titulo "Sintonia"
DIRS=/opt/sintonia
[[ -n $LIB ]] && DIRS=$RAIZ
if [[ -f $DIRS/.env ]]; then
  for k in MODO_VPS PORTA_LOCAL DOMINIO ENDERECO_PREVIA CADDY_PROPRIO CADDY_ARQ CADDY_CONTEINER REDES_PROXY PROXY_DOCKER COMPOSE_FILE; do
    v="$(grep -E "^$k=" "$DIRS/.env" | tail -n 1 | cut -d= -f2-)"
    linha "$k=${v:-(vazio)}"
  done
  linha "commit: $(git -C "$DIRS" -c safe.directory="$DIRS" log -1 --format='%h %cd' --date=format:'%d/%m %H:%M' 2>/dev/null || echo '?')"
  if [[ -n $LIB ]]; then
    linha "app em 127.0.0.1:$(cfg PORTA_LOCAL 8787): $(healthz_local 2>/dev/null | cut -c1-120 || echo 'SEM RESPOSTA')"
    dc ps --format '   {{.Name}}  {{.Status}}  {{.Ports}}' 2>/dev/null
    titulo "Últimos logs do app"
    dc logs --no-log-prefix --tail 15 app 2>&1 | cut -c1-200 | sed 's/^/   /'
  fi
else
  linha "não instalado em $DIRS"
fi
printf '\n(fim do diagnóstico — nenhuma senha ou segredo foi mostrado)\n'
exit 0
}
