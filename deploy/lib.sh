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
# Código de saída de "ocupado: outra operação de deploy em andamento" (a atualização automática tenta de novo depois,
# sem marcar o commit como falho)
SAIDA_OCUPADO=75
travar() {
  local arq="${TMPDIR:-/tmp}/sintonia-deploy.lock"
  exec 9>"$arq"
  if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
    erro "Outra operação de deploy (update/restore) está em andamento. Espere terminar."
    exit "$SAIDA_OCUPADO"
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

# app_na_imagem_latest → 0 quando TODAS as instâncias do app rodam a imagem $IMAGEM:latest. Um "docker compose up" que
# falha (ex.: limite de CPU acima dos núcleos da VPS) cria o contêiner novo ANTES de tirar o velho: o velho segue de pé e
# saudável, e só esperar a saúde não percebe que a troca não aconteceu. As duas referências passam pelo mesmo
# "docker image inspect" (mesmo formato de ID em qualquer armazenamento de imagens).
app_na_imagem_latest() {
  local quer id img tem=''
  quer="$(docker image inspect -f '{{.Id}}' "$IMAGEM:latest" 2>/dev/null)" || return 1
  for id in $(ids_app); do
    tem=1
    img="$(docker inspect -f '{{.Image}}' "$id" 2>/dev/null)" || return 1
    [[ "$(docker image inspect -f '{{.Id}}' "$img" 2>/dev/null)" == "$quer" ]] || return 1
  done
  [[ -n $tem ]]
}

# MB livres no disco do Docker (onde ficam imagens, cache de build e volumes; numa VPS compartilhada, o mesmo disco
# do outro projeto). Volta 1 se não deu para medir. mb_em_gb 1500 → "1,5".
disco_livre_mb() {
  local dir v
  dir="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)"
  [[ -n $dir && -d $dir ]] || dir=/
  v="$(df -BM --output=avail "$dir" 2>/dev/null | tail -n 1 | tr -dc 0-9)"
  [[ -n $v ]] || return 1
  printf '%s' "$v"
}
mb_em_gb() { awk -v m="${1:-0}" 'BEGIN { s = sprintf("%.1f", m / 1024); sub(/\./, ",", s); print s }'; }

# /healthz de dentro do contêiner (não depende do Caddy nem do DNS); imprime o JSON. Entrada fechada (</dev/null):
# o "exec" nunca lê a entrada de quem chamou (ex.: um script vindo de "curl | bash")
healthz() {
  dc exec -T app node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>r.text()).then(t=>{console.log(t)},e=>{console.error(e.message);process.exit(1)})" </dev/null
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
  # --noproxy: a conferência é local (127.0.0.1), nunca por um proxy de saída configurado na máquina
  local limite=$((SECONDS + ${1:-60})) url host porta args=(-fsS -o /dev/null --max-time 8 --noproxy '*')
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
      ! { command -v docker >/dev/null 2>&1 && docker ps --format '{{.Ports}}' 2>/dev/null | grep -E "[:.]$p->" >/dev/null; }; then
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
#   PROXY_CADDYFILE  Caddyfile do Caddy do sistema (quando PROXY_TIPO=caddy)
detectar_proxy() {
  PROXY_TIPO=nenhum PROXY_DESC='' PROXY_CONTEINER='' PROXY_IMAGEM='' PROXY_REDES='' PROXY_REDE_HOST='' PROXY_DOCKER='' PROXY_CADDYFILE='' PROXY_CADDY_PID=''
  local id nome imagem projeto portas linha proc pid exe cid painel tem_docker=''
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && tem_docker=1

  # 1) contêiner publicando 80 ou 443 no host
  if [[ -n $tem_docker ]]; then
    # separador "|" (tab é "espaço" para o read: campos vazios — contêiner sem projeto — sumiriam)
    while IFS='|' read -r id nome imagem projeto portas; do
      [[ $projeto == sintonia ]] && continue
      if [[ $portas =~ (^|[ ,])([0-9.]+|\[::\]|::):(80|443)- ]]; then
        PROXY_TIPO=docker PROXY_CONTEINER=$nome PROXY_IMAGEM=$imagem
        break
      fi
    done < <(docker ps --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Label "com.docker.compose.project"}}|{{.Ports}}' 2>/dev/null)
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
          # Caddyfile em uso: o --config do processo (relativo à pasta dele); sem --config, o Caddy usa o Caddyfile da
          # pasta onde rodou; com --resume a configuração vem da API/autosave (aí não há arquivo para editar)
          local args cwd adaptador
          args="$(tr '\0' '\n' <"/proc/$pid/cmdline" 2>/dev/null || true)"
          cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
          PROXY_CADDY_PID=$pid
          PROXY_CADDYFILE="$(awk 'p { print; exit } $0 == "--config" { p = 1 } /^--config=/ { sub(/^--config=/, ""); print; exit }' <<<"$args")"
          if [[ -n $PROXY_CADDYFILE && $PROXY_CADDYFILE != /* ]]; then PROXY_CADDYFILE="$cwd/$PROXY_CADDYFILE"; fi
          if grep -qx -- '--resume' <<<"$args"; then
            PROXY_CADDYFILE=''
          elif [[ -z $PROXY_CADDYFILE && -f $cwd/Caddyfile ]]; then
            PROXY_CADDYFILE="$cwd/Caddyfile"
          fi
          adaptador="$(awk 'p { print; exit } $0 == "--adapter" { p = 1 } /^--adapter=/ { sub(/^--adapter=/, ""); print; exit }' <<<"$args")"
          if [[ -n $PROXY_CADDYFILE && -f $PROXY_CADDYFILE && $PROXY_CADDYFILE != *.json && (-z $adaptador || $adaptador == caddyfile) ]]; then
            PROXY_TIPO=caddy
          else
            PROXY_TIPO=outro
          fi
          if [[ -n $PROXY_CADDYFILE ]]; then PROXY_DESC="Caddy ($exe, $PROXY_CADDYFILE)"; else PROXY_DESC="Caddy ($exe, configurado pela API/--resume)"; fi
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

# IP desta máquina na ponte padrão do Docker (docker0, em geral 172.17.0.1). Um proxy em contêiner, em QUALQUER
# rede, chega ao app por ele (porta publicada só nesse IP interno: nada exposto na internet) — sem o app entrar na
# rede do outro projeto (lá o nome de serviço "app" do Sintonia colidiria com o dele e a rede interna ficaria à vista).
ip_ponte_docker() {
  local ip
  ip="$(docker network inspect bridge -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}$' | head -n 1 || true)"
  if [[ -z $ip && -n ${PROXY_REDES:-} ]]; then
    for r in $PROXY_REDES; do
      ip="$(docker network inspect "$r" -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}$' | head -n 1 || true)"
      [[ -n $ip ]] && break
    done
  fi
  printf '%s' "$ip"
}

# redes Docker (não padrão) do proxy em contêiner — só para o nginx-proxy, que exige o app numa rede comum
redes_do_proxy() {
  local r out=''
  for r in $PROXY_REDES; do
    [[ $r == bridge || $r == host || $r == none || $r == sintonia_default ]] && continue
    out+="$r "
  done
  printf '%s' "${out% }"
}

# ---- limites de recursos do app na VPS compartilhada (I19, leva 3) ------------------------------------------------
# O Sintonia nunca toma a máquina inteira do outro projeto (a Lynx):
#   cpus        núcleos − 1 (mínimo 1): sempre sobra 1 núcleo para o resto da máquina;
#   cpu_shares  512 (metade do peso padrão, 1024): com a CPU disputada, os outros contêineres têm prioridade;
#   pids_limit  512: um vazamento de processos/threads não derruba a máquina (o app usa ~15).
# No .env: LIMITE_RECURSOS=0 desliga; APP_CPUS, APP_CPU_SHARES e APP_PIDS trocam os valores. Vão para o
# docker-compose.vps.yml (regerado pelo install.sh, dominio.sh e update.sh); deploy/limites.sh aplica na hora, sem reiniciar.
limites_ligados() { [[ "$(cfg LIMITE_RECURSOS 1)" != 0 ]]; }
nucleos() { nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1; }
limite_cpus() {
  local n v
  n="$(nucleos)"
  v="$(cfg APP_CPUS)"
  if [[ $v =~ ^[0-9]+(\.[0-9]+)?$ ]] && awk -v v="$v" -v n="$n" 'BEGIN { exit !(v >= 0.5 && v <= n) }'; then
    printf '%s' "$v"
  else
    ((n > 1)) && n=$((n - 1))
    printf '%s' "$n"
  fi
}
limite_shares() {
  local v
  v="$(cfg APP_CPU_SHARES 512)"
  [[ $v =~ ^[0-9]+$ ]] && ((v >= 2 && v <= 262144)) || v=512
  printf '%s' "$v"
}
limite_pids() {
  local v
  v="$(cfg APP_PIDS 512)"
  [[ $v =~ ^[0-9]+$ ]] && ((v >= 128)) || v=512
  printf '%s' "$v"
}
# o Docker desta máquina aplica este limite? (kernel sem CFS quota ou sem o controlador de pids: com o limite no
# compose, o contêiner nem subiria). Sem acesso ao Docker, supõe que sim.
suporta_limite() { # cpu | peso | pids
  local campo
  case $1 in
    cpu) campo=CPUCfsQuota ;;
    peso) campo=CPUShares ;;
    *) campo=PidsLimit ;;
  esac
  local v
  v="$(docker info --format "{{.$campo}}" 2>/dev/null)" || return 0
  [[ $v != false ]]
}
# frase curta para os scripts ("CPU 3 de 4 núcleos · peso 512 · até 512 processos")
resumo_limites() {
  if limites_ligados; then
    printf 'CPU %s de %s núcleos · peso %s · até %s processos' "$(limite_cpus)" "$(nucleos)" "$(limite_shares)" "$(limite_pids)"
  else
    printf 'sem limites (LIMITE_RECURSOS=0)'
  fi
}

# Gera docker-compose.vps.yml (modo compartilhado; o .env aponta para ele em COMPOSE_FILE). Fonte: o .env
# (PORTA_LOCAL, PORT, IP_PONTE, CADDY_PROPRIO, REDES_PROXY, PROXY_DOCKER, HOSTS_PROXY, LIMITE_RECURSOS, APP_CPUS…).
gerar_compose_vps() {
  local arq="$RAIZ/docker-compose.vps.yml" tmp porta interna redes r i=0 tipo hosts ponte
  porta="$(cfg PORTA_LOCAL 8787)"
  interna="$(cfg PORT 8787)"
  redes="$(cfg REDES_PROXY)"
  tipo="$(cfg PROXY_DOCKER)"
  ponte="$(cfg IP_PONTE)"
  [[ $ponte =~ ^[0-9]+(\.[0-9]+){3}$ ]] || ponte=''
  # rede de outro projeto só para o nginx-proxy (que só enxerga contêineres numa rede comum)
  [[ $tipo == nginx-proxy ]] || redes=''

  hosts="$(cfg HOSTS_PROXY)"
  hosts="${hosts// /}"
  [[ $hosts =~ ^[a-z0-9.,-]+$ ]] || hosts=''
  tmp="$(mktemp "$arq.XXXXXX")"
  {
    echo "# GERADO por deploy/install.sh, dominio.sh, update.sh e limites.sh (VPS compartilhada). Não edite à mão:"
    echo "# mude o .env e rode sudo $RAIZ/deploy/limites.sh aplicar (ou o dominio.sh/install.sh) de novo."
    echo "services:"
    echo "  app:"
    if limites_ligados; then
      echo "    # limites (I19): nunca a máquina inteira do outro projeto — $(resumo_limites). LIMITE_RECURSOS=0 no .env desliga"
      if suporta_limite peso; then echo "    cpu_shares: $(limite_shares)"; fi
      if suporta_limite cpu || suporta_limite pids; then
        # em deploy.resources (o docker-compose.yml já põe a memória ali; "cpus:" solto no serviço conflitaria)
        echo "    deploy:"
        echo "      resources:"
        echo "        limits:"
        if suporta_limite cpu; then echo "          cpus: \"$(limite_cpus)\""; fi
        if suporta_limite pids; then echo "          pids: $(limite_pids)"; fi
      fi
    fi
    echo "    # só nesta máquina (127.0.0.1): o servidor web que já existe encaminha o domínio para cá"
    echo "    ports:"
    echo "      - \"127.0.0.1:$porta:$interna\""
    if [[ -n $ponte ]]; then
      echo "      # proxy em contêiner (de outro projeto) chega aqui pelo IP interno do Docker; não é exposto na internet"
      echo "      - \"$ponte:$porta:$interna\""
    fi
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
    elif [[ -n $hosts && -n $ponte && $tipo == caddy-docker-proxy ]]; then
      echo "    labels:"
      echo "      caddy: \"${hosts//,/, }\""
      echo "      caddy.reverse_proxy: \"$ponte:$porta\""
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

# regerar_compose_vps [cópia] — o gerar_compose_vps dos scripts que rodam SOZINHOS (update.sh, restore.sh, --rollback):
# regera do .env (o limite de CPU acompanha os núcleos de agora: a VPS pode ter sido aumentada ou reduzida) e confere
# o resultado. Mantém o arquivo anterior (e volta 1) quando o novo não passa no "docker compose config" ou PERDERIA o
# caminho do servidor web até o app: uma rede do proxy ("networks:") ou uma porta publicada que o anterior tinha (o
# proxy da máquina daria 502). O deploy/limites.sh aplicar regera sem essa trava (é pedido explícito de quem opera).
# Com [cópia], o arquivo anterior fica guardado ali (quem chama decide se volta a ele). Fora do modo compartilhado: nada.
regerar_compose_vps() {
  compartilhado || return 0
  local arq="$RAIZ/docker-compose.vps.yml" antes motivo='' linha
  antes="${1:-$(mktemp "${TMPDIR:-/tmp}/sintonia-vps-yml.XXXXXX")}"
  cp -p "$arq" "$antes" 2>/dev/null || : >"$antes"
  gerar_compose_vps
  if ! dc config -q >/dev/null 2>&1; then
    motivo='não passou na conferência do Docker Compose'
  elif [[ -s $antes ]]; then
    if grep -q '^    networks:' "$antes" && ! grep -q '^    networks:' "$arq"; then
      motivo='perderia a rede do proxy (networks:) que o anterior tinha'
    else
      while IFS= read -r linha; do
        if ! grep -qxF -- "$linha" "$arq"; then
          motivo="perderia a porta publicada ${linha#*- } que o anterior tinha"
          break
        fi
      done < <(grep -E '^      - "[0-9.]+:[0-9]+:[0-9]+"$' "$antes" || true)
    fi
  fi
  if [[ -n $motivo ]]; then
    [[ -s $antes ]] && cp -p "$antes" "$arq"
    aviso "O docker-compose.vps.yml regerado do .env $motivo: mantive o anterior. Confira o .env (PORTA_LOCAL, IP_PONTE, REDES_PROXY, PROXY_DOCKER); se a mudança for de propósito: sudo $DIR_DEPLOY/limites.sh aplicar (regera sem esta trava) e depois cd $RAIZ && docker compose up -d app"
  fi
  [[ -n ${1:-} ]] || rm -f "$antes"
  [[ -z $motivo ]]
}

# ---- borda (Cloudflare, I02) ------------------------------------------------------------------------------------
# borda_estado <domínio> → linhas "Borda: guardando (HIT…)" ou "Borda: NÃO guardando" e o estado do HTML na borda.
# Pede o /api/status 2× pelo endereço PÚBLICO (passa pela Cloudflare). Volta 1 quando a borda não guarda.
# SINTONIA_BORDA_TESTE=http://127.0.0.1:PORTA (só teste): conecta ali mandando o Host do domínio.
borda_estado() {
  local dom=$1 h hh cst csth base=https://$1 extra=()
  if [[ -n ${SINTONIA_BORDA_TESTE:-} ]]; then
    base=$SINTONIA_BORDA_TESTE
    extra=(-H "Host: $dom")
  fi
  _cab() { curl -sS -o /dev/null -D - --max-time 6 -H 'Accept-Encoding: gzip' ${extra[@]+"${extra[@]}"} "$@" 2>/dev/null | tr -d '\r' || true; }
  _cab "$base/api/status" >/dev/null
  sleep 0.4
  h="$(_cab "$base/api/status")"
  cst="$(sed -n 's/^cf-cache-status: *//Ip' <<<"$h" | head -n 1 | tr '[:lower:]' '[:upper:]')"
  if [[ -z $h ]]; then
    aviso "   Borda: SEM RESPOSTA de https://$dom/api/status (DNS ou rede desta máquina?)"
    return 1
  elif ! grep -qi '^cf-ray:' <<<"$h"; then
    echo "   Borda: sem Cloudflare (o domínio não passa pelo proxy: nuvem cinza, ou outro CDN)"
    return 1
  elif [[ $cst =~ ^(HIT|UPDATING|EXPIRED|REVALIDATED|STALE)$ ]]; then
    echo "   Borda: guardando ($cst; age $(sed -n 's/^age: *//Ip' <<<"$h" | head -n 1 | grep . || echo 0)) — o /api/status sai da cópia da Cloudflare"
  else
    aviso "   Borda: NÃO guardando (cf-cache-status ${cst:-ausente}) — todo pedido chega à VPS. Regras de cache desligadas? Confira: node deploy/cloudflare.mjs --conferir (DEPLOY §5)"
    return 1
  fi
  hh="$(_cab -H 'Accept: text/html' "$base/")"
  csth="$(sed -n 's/^cf-cache-status: *//Ip' <<<"$hh" | head -n 1 | tr '[:lower:]' '[:upper:]')"
  if [[ $csth =~ ^(HIT|MISS|UPDATING|EXPIRED|REVALIDATED|STALE)$ ]]; then
    echo "   páginas (HTML): guardadas na borda ($csth) — chave \"html-borda\" LIGADA (só do congelamento de 24/10 em diante)"
  elif [[ -n $csth ]]; then
    echo "   páginas (HTML): não guardadas ($csth) — chave \"html-borda\" desligada"
  fi
  return 0
}

# /healthz direto na porta local (modo compartilhado)
healthz_local() { curl -fsS --max-time 5 --noproxy '*' "http://127.0.0.1:$(cfg PORTA_LOCAL 8787)/healthz"; }
