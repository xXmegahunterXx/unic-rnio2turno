#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — instalação completa numa VPS Ubuntu 22.04 ou 24.04 (também Debian 12), como root.
#
# Faz: Docker oficial + firewall (SSH, 80, 443) + swap (se faltar) + código em /opt/sintonia + .env com
# senha e segredos fortes + build + sobe app e Caddy (HTTPS automático) + espera ficar saudável + backup
# automático de hora em hora. Pode rodar de novo quantas vezes quiser: o que já está feito é mantido
# (o .env existente nunca é sobrescrito).
#
# VPS COM OUTROS PROJETOS: detectado sozinho (outro servidor web nas portas 80/443, contêineres de outros
# projetos ou painel de hospedagem) → modo COMPARTILHADO: não mexe nas portas 80/443, no firewall nem no Docker
# que já existe; o app fica só em 127.0.0.1:<porta livre> e o domínio é ligado depois, sem pressa, com
#   sudo /opt/sintonia/deploy/dominio.sh seu-dominio.com.br
# (que configura o nginx/Caddy/Apache da máquina ou explica o que fazer no painel). Forçar: MODO=compartilhado
# ou MODO=exclusivo. Atalho para VPS com outros projetos:
#   curl -fsSL https://raw.githubusercontent.com/xXmegahunterXx/unic-rnio2turno/HEAD/deploy/install.sh | sudo bash
#
# Jeito 1 (repositório já clonado):
#   sudo git clone https://github.com/xXmegahunterXx/unic-rnio2turno.git /opt/sintonia
#   sudo /opt/sintonia/deploy/install.sh
#
# Jeito 2 (o script clona):
#   sudo REPO_URL=https://github.com/<dono>/<repo>.git BRANCH=main bash install.sh
#
# Repositório PRIVADO (escolha um):
#   sudo GIT_TOKEN=github_pat_xxx bash install.sh   token "fine-grained" só com Contents: Read-only
#   sudo DEPLOY_KEY=1 bash install.sh               gera uma chave SSH e mostra onde cadastrá-la no GitHub
#
# Variáveis opcionais (o que faltar é perguntado):
#   DOMINIO  ACME_EMAIL  ADMIN_PASSWORD  INCLUIR_WWW=s|n  TWITTER_SITE
#   INSTALL_DIR=/opt/sintonia  REPO_URL  BRANCH  SSH_PORT  SWAP_GB=2 (0 = não cria)  SEM_FIREWALL=1
#   SEM_CRON=1 (não agenda o backup de hora em hora)
#   NAO_INTERATIVO=1 (não pergunta nada: exige DOMINIO e ACME_EMAIL no modo exclusivo; gera a senha)
#   MODO=compartilhado|exclusivo (padrão: detecta)   PORTA_LOCAL=8787 (compartilhado: porta em 127.0.0.1)
#   PREVIA=1|0 (compartilhado sem domínio: publica já em https://sintonia.<ip>.sslip.io; sem a variável, pergunta)
#   SEM_PULL=1 (rodando de novo: não baixa o código novo)
#   ATUALIZAR_DOCKER=1 (compartilhado: permite atualizar um Docker antigo — reinicia os contêineres dos outros)
# =====================================================================================================
# Tudo entre { e } é lido pelo bash ANTES de executar: com "curl … | bash", nenhum comando do meio (docker compose
# exec, por exemplo) consegue "comer" o resto do script da entrada padrão.
{
set -Eeuo pipefail

REPO_PADRAO="https://github.com/xXmegahunterXx/unic-rnio2turno.git"
COMPOSE_MIN="2.24.0"
DOCKER_MIN="25.0.0"

if [[ -t 1 ]]; then
  C_OK=$'\e[32m' C_AV=$'\e[33m' C_ER=$'\e[31m' C_NEG=$'\e[1m' C_FIM=$'\e[0m'
else
  C_OK='' C_AV='' C_ER='' C_NEG='' C_FIM=''
fi
# (redefinidas depois de carregar deploy/lib.sh, que tem funções de mesmo nome)
saida_install() {
  info() { printf '\n%s\n' "${C_NEG}==> $*${C_FIM}"; }
  ok() { printf '%s\n' "${C_OK}✔${C_FIM} $*"; }
  aviso() { printf '%s\n' "${C_AV}! $*${C_FIM}" >&2; }
  morrer() {
    printf '%s\n' "${C_ER}✘ $*${C_FIM}" >&2
    exit 1
  }
}
saida_install
trap 'morrer "Falhou na linha $LINENO (comando: $BASH_COMMAND). Corrija e rode o install.sh de novo: o que já foi feito é mantido."' ERR

# ---- perguntas (funciona também com "curl … | sudo bash": lê do terminal) ----------------------------
TTY=''
if [[ -z ${NAO_INTERATIVO:-} ]] && { exec 3</dev/tty; } 2>/dev/null; then TTY=1; fi

perguntar() { # perguntar "texto" [padrão] → resposta em $RESP
  local texto=$1 padrao=${2:-}
  RESP=''
  [[ -n $TTY ]] || {
    RESP=$padrao
    return 0
  }
  if [[ -n $padrao ]]; then printf '%s [%s]: ' "$texto" "$padrao" >/dev/tty; else printf '%s: ' "$texto" >/dev/tty; fi
  IFS= read -r RESP <&3 || true
  RESP=${RESP:-$padrao}
}

perguntar_senha() { # → $RESP (vazio = gerar)
  local a b
  RESP=''
  [[ -n $TTY ]] || return 0
  while :; do
    printf '%s' 'Senha do painel /admin (Enter = gerar uma senha forte): ' >/dev/tty
    IFS= read -rs a <&3 || true
    printf '\n' >/dev/tty
    [[ -z $a ]] && return 0
    if ((${#a} < 12)); then
      aviso "Use pelo menos 12 caracteres (melhor 16+)."
      continue
    fi
    if [[ $a == *"'"* ]]; then
      aviso "Não use aspas simples (') na senha."
      continue
    fi
    printf '%s' 'Repita a senha: ' >/dev/tty
    IFS= read -rs b <&3 || true
    printf '\n' >/dev/tty
    if [[ $a != "$b" ]]; then
      aviso "As senhas não conferem."
      continue
    fi
    RESP=$a
    return 0
  done
}

sim() { [[ ${1,,} =~ ^(s|sim|y|yes|1)$ ]]; }

gerar_segredo() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | cut -c1-"${1:-40}"; }

versao_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# ---- 0. pré-requisitos ------------------------------------------------------------------------------
[[ $EUID -eq 0 ]] || morrer "Rode como root: sudo bash $0"
[[ -r /etc/os-release ]] || morrer "Sistema não reconhecido (sem /etc/os-release)."
# shellcheck disable=SC1091
. /etc/os-release
DISTRO=${ID:-}
CODINOME=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}
case "$DISTRO:${VERSION_ID:-}" in
  ubuntu:22.04 | ubuntu:24.04 | debian:12) ok "Sistema: ${PRETTY_NAME:-$DISTRO}" ;;
  ubuntu:* | debian:*)
    aviso "Testado em Ubuntu 22.04/24.04 e Debian 12; este é ${PRETTY_NAME:-$DISTRO}. Seguindo mesmo assim."
    ;;
  *) morrer "Este instalador é para Ubuntu/Debian (encontrado: ${PRETTY_NAME:-desconhecido}). Veja DEPLOY.md para instalar à mão." ;;
esac
export DEBIAN_FRONTEND=noninteractive
# VPS recém-criada costuma estar rodando atualizações automáticas: espera o apt liberar em vez de falhar
aptq() { apt-get -o DPkg::Lock::Timeout=600 "$@"; }

info "1/9 Pacotes básicos"
aptq update -qq
aptq install -y -qq ca-certificates curl git openssl cron util-linux iproute2 >/dev/null
ok "curl, git, openssl e cron instalados"

# ---- 2. código --------------------------------------------------------------------------------------
info "2/9 Código do Sintonia"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [[ -z ${INSTALL_DIR:-} && -n $AQUI && -f "$AQUI/../docker-compose.yml" && -d "$AQUI/../.git" ]]; then
  INSTALL_DIR="$(cd "$AQUI/.." && pwd)"
fi
INSTALL_DIR=${INSTALL_DIR:-/opt/sintonia}
REPO_URL=${REPO_URL:-$REPO_PADRAO}
GIT_ARGS=()

if [[ -n ${GIT_TOKEN:-} ]]; then
  # token guardado só para o root, usado apenas para github.com por este repositório
  install -d -m 700 /root/.config/sintonia
  printf 'https://x-access-token:%s@github.com\n' "$GIT_TOKEN" >/root/.config/sintonia/git-credentials
  chmod 600 /root/.config/sintonia/git-credentials
  GIT_ARGS=(-c "credential.helper=store --file=/root/.config/sintonia/git-credentials")
fi
if [[ -n ${DEPLOY_KEY:-} ]]; then
  CHAVE=/root/.ssh/sintonia_deploy_ed25519
  install -d -m 700 /root/.ssh
  [[ -f $CHAVE ]] || ssh-keygen -q -t ed25519 -N '' -C "sintonia-deploy@$(hostname)" -f "$CHAVE"
  if [[ $REPO_URL =~ ^https://github\.com/([^/]+)/([^/]+)$ ]]; then
    REPO_URL="git@github.com:${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}.git"
  fi
  export GIT_SSH_COMMAND="ssh -i $CHAVE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    printf '\n%s\n\n%s\n\n' "Cadastre esta chave no GitHub: repositório → Settings → Deploy keys → Add deploy key (deixe 'Allow write access' DESMARCADO):" "$(cat "$CHAVE.pub")"
    if [[ -n $TTY ]]; then
      perguntar "Depois de cadastrar, aperte Enter para continuar" "ok"
    else
      morrer "Cadastre a chave acima e rode o install.sh de novo."
    fi
  fi
fi

# pasta clonada por outro usuário (sem sudo): o git do root precisa confiar nela
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$INSTALL_DIR" || git config --global --add safe.directory "$INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  if [[ -n ${GIT_TOKEN:-} ]]; then git -C "$INSTALL_DIR" config credential.helper "store --file=/root/.config/sintonia/git-credentials"; fi
  if [[ -n ${DEPLOY_KEY:-} ]]; then git -C "$INSTALL_DIR" config core.sshCommand "$GIT_SSH_COMMAND"; fi
  # rodar de novo também traz o código novo (só "fast-forward"; arquivos mexidos à mão nesta máquina ficam)
  antes="$(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
  if [[ -n ${SEM_PULL:-} ]]; then
    ok "Repositório já em $INSTALL_DIR (commit $antes; SEM_PULL: código não atualizado)"
  elif [[ -n "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=no)" ]]; then
    aviso "Há arquivos do repositório alterados nesta máquina: mantive o código como está (commit $antes)."
  elif git -C "$INSTALL_DIR" pull --ff-only --quiet 2>/dev/null; then
    depois="$(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
    if [[ $antes == "$depois" ]]; then ok "Repositório já em $INSTALL_DIR, na versão mais recente ($depois)"; else ok "Código atualizado em $INSTALL_DIR: $antes → $depois"; fi
  else
    aviso "Não consegui baixar o código novo (sem internet ou histórico divergente): sigo com o commit $antes."
  fi
else
  [[ ! -e $INSTALL_DIR || -z "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]] || morrer "$INSTALL_DIR existe e não é um repositório git. Mova-o ou use INSTALL_DIR=outra/pasta."
  clone=(git "${GIT_ARGS[@]}" clone --quiet)
  [[ -n ${BRANCH:-} ]] && clone+=(--branch "$BRANCH")
  if ! "${clone[@]}" "$REPO_URL" "$INSTALL_DIR"; then
    morrer "Não consegui clonar $REPO_URL. Repositório privado? Rode de novo com GIT_TOKEN=<token> (Contents: Read-only) ou DEPLOY_KEY=1. Veja DEPLOY.md."
  fi
  if [[ -n ${GIT_TOKEN:-} ]]; then git -C "$INSTALL_DIR" config credential.helper "store --file=/root/.config/sintonia/git-credentials"; fi
  if [[ -n ${DEPLOY_KEY:-} ]]; then git -C "$INSTALL_DIR" config core.sshCommand "$GIT_SSH_COMMAND"; fi
  ok "Clonado em $INSTALL_DIR (branch $(git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD), commit $(git -C "$INSTALL_DIR" rev-parse --short HEAD))"
fi
[[ -f "$INSTALL_DIR/docker-compose.yml" && -f "$INSTALL_DIR/.env.example" && -f "$INSTALL_DIR/deploy/lib.sh" ]] ||
  morrer "$INSTALL_DIR não tem docker-compose.yml/.env.example/deploy/lib.sh: este branch ainda não tem os arquivos de deploy (use BRANCH=...)."
chmod +x "$INSTALL_DIR"/deploy/*.sh
chmod 750 "$INSTALL_DIR"

# daqui em diante, as funções comuns dos scripts (dc, esperar_saude, detectar_proxy…)
SINTONIA_DIR="$INSTALL_DIR"
# shellcheck source=deploy/lib.sh
source "$INSTALL_DIR/deploy/lib.sh"
saida_install

ENV="$INSTALL_DIR/.env"
ler_env() { # ler_env CHAVE → valor atual no .env (sem aspas)
  local v
  v="$(grep -E "^[[:space:]]*$1=" "$ENV" 2>/dev/null | tail -n 1 | cut -d= -f2-)" || true
  if [[ $v == \'*\' || $v == \"*\" ]]; then v="${v:1:${#v}-2}"; fi
  [[ $v =~ ^\<[^\>]*\>$ ]] && v='' # marcador do modelo (.env.example)
  printf '%s' "$v"
}
definir_env() { # definir_env CHAVE VALOR → grava CHAVE='VALOR' (substitui a linha, mesmo comentada)
  local tmp
  tmp="$(mktemp "$ENV.XXXXXX")"
  CHAVE="$1" VALOR="'$2'" awk '
    BEGIN { c = ENVIRON["CHAVE"]; v = ENVIRON["VALOR"]; feito = 0 }
    !feito && $0 ~ ("^#?[[:space:]]*" c "=") { print c "=" v; feito = 1; next }
    { print }
    END { if (!feito) print c "=" v }' "$ENV" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV"
}

# ---- 3. outros projetos nesta máquina? ----------------------------------------------------------------
info "3/9 Outros projetos nesta máquina"
detectar_proxy
VIZINHOS=''
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  VIZINHOS="$(docker ps --format '{{.Names}}{{"\t"}}{{.Label "com.docker.compose.project"}}' 2>/dev/null |
    awk -F'\t' '$2 != "sintonia" && $1 !~ /^sintonia-ensaio-/ {print $1}' | head -n 12 | tr '\n' ' ')"
fi
PAINEL="$(painel_hospedagem || true)"
MODO=${MODO:-$(ler_env MODO_VPS)}
if [[ -z $MODO ]]; then
  if [[ $PROXY_TIPO != nenhum || -n $VIZINHOS || -n $PAINEL ]]; then MODO=compartilhado; else MODO=exclusivo; fi
fi
[[ $MODO == compartilhado || $MODO == exclusivo ]] || morrer "MODO deve ser 'compartilhado' ou 'exclusivo' (veio: $MODO)."
echo "   portas 80/443:            $PROXY_DESC"
echo "   contêineres de outros:    ${VIZINHOS:-nenhum}"
[[ -z $PAINEL ]] || echo "   painel de hospedagem:     $PAINEL"
if [[ $MODO == compartilhado ]]; then
  ok "Modo VPS COMPARTILHADA: não mexo nas portas 80/443, no firewall nem no Docker que já existe."
  echo "   O Sintonia fica só nesta máquina (127.0.0.1) e o domínio é ligado depois com deploy/dominio.sh."
else
  [[ $PROXY_TIPO == nenhum ]] || morrer "As portas 80/443 já estão em uso ($PROXY_DESC): o modo exclusivo derrubaria esse site. Rode com MODO=compartilhado."
  ok "Modo exclusivo: a máquina é só do Sintonia (o Caddy dele atende 80/443 com HTTPS automático)."
fi

# ---- 4. Docker --------------------------------------------------------------------------------------
info "4/9 Docker"
docker_ok() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || return 1
  local vc vd
  vc="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
  vd="$(docker version -f '{{.Server.Version}}' 2>/dev/null || echo 0)"
  versao_ge "$vc" "$COMPOSE_MIN" && versao_ge "$vd" "$DOCKER_MIN"
}
motor_ok() { # o serviço Docker (não o plugin compose) é novo o bastante
  local vd
  vd="$(docker version -f '{{.Server.Version}}' 2>/dev/null || echo 0)"
  versao_ge "${vd:-0}" "$DOCKER_MIN"
}
# Só o plugin "docker compose" (não reinicia o serviço Docker nem os contêineres de ninguém)
instalar_plugin_compose() {
  local arq ver=v2.29.7 dir=/usr/local/lib/docker/cli-plugins url
  if apt-cache policy docker-compose-plugin 2>/dev/null | grep -q 'Candidate: [0-9]'; then
    aptq install -y -qq docker-compose-plugin >/dev/null && docker_ok && return 0
  fi
  case "$(uname -m)" in
    x86_64 | amd64) arq=x86_64 ;;
    aarch64 | arm64) arq=aarch64 ;;
    *) return 1 ;;
  esac
  url="https://github.com/docker/compose/releases/download/$ver/docker-compose-linux-$arq"
  install -d -m 755 "$dir"
  curl -fsSL "$url" -o "$dir/docker-compose.novo" || return 1
  if ! (cd "$dir" && curl -fsSL "$url.sha256" | sed 's/\*\?docker-compose-linux-.*/docker-compose.novo/' | sha256sum -c --quiet -); then
    rm -f "$dir/docker-compose.novo"
    return 1
  fi
  chmod 755 "$dir/docker-compose.novo"
  mv "$dir/docker-compose.novo" "$dir/docker-compose"
  docker_ok
}
instalar_docker_oficial() {
  local remover=(docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc)
  # numa VPS compartilhada o docker-compose antigo (v1) dos outros projetos fica: ele não conflita
  [[ $MODO == compartilhado ]] && remover=(docker.io docker-doc docker-compose-v2 podman-docker containerd runc)
  for p in "${remover[@]}"; do
    if dpkg -s "$p" >/dev/null 2>&1; then
      aviso "Removendo pacote antigo/conflitante: $p (contêineres e volumes em /var/lib/docker são mantidos)"
      aptq remove -y -qq "$p" >/dev/null
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$DISTRO/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$DISTRO $CODINOME stable" \
    >/etc/apt/sources.list.d/docker.list
  aptq update -qq
  aptq install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker_ok || morrer "O Docker foi instalado mas não respondeu (veja: systemctl status docker)."
}
if docker_ok; then
  ok "Docker $(docker version -f '{{.Server.Version}}') e Compose $(docker compose version --short) já instalados"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && motor_ok; then
  # serviço Docker bom, só o plugin compose ausente/antigo: atualiza só ele
  instalar_plugin_compose || morrer "Não consegui instalar o plugin 'docker compose' >= $COMPOSE_MIN. Instale-o (https://docs.docker.com/compose/install/linux/) e rode de novo."
  ok "Plugin Compose $(docker compose version --short) instalado (o serviço Docker $(docker version -f '{{.Server.Version}}') não foi tocado)"
elif command -v docker >/dev/null 2>&1 && [[ $MODO == compartilhado && -z ${ATUALIZAR_DOCKER:-} ]]; then
  morrer "O Docker desta máquina ($(docker version -f '{{.Server.Version}}' 2>/dev/null || echo 'sem resposta')) é anterior ao $DOCKER_MIN que o Sintonia usa. Atualizar REINICIA os contêineres dos outros projetos por alguns segundos (os com 'restart' voltam sozinhos). Se puder, rode de novo com ATUALIZAR_DOCKER=1."
else
  if command -v docker >/dev/null 2>&1; then
    aviso "Atualizando o Docker: os contêineres em execução reiniciam (os com política 'restart' voltam sozinhos)."
  elif [[ $MODO == compartilhado ]]; then
    aviso "Instalando o Docker: ele cria regras próprias de iptables (rede dos contêineres). Sites e serviços que já existem seguem como estão."
  fi
  instalar_docker_oficial
  ok "Docker $(docker version -f '{{.Server.Version}}') e Compose $(docker compose version --short) instalados (repositório oficial)"
fi

# ---- 5. firewall ----------------------------------------------------------------------------------
info "5/9 Firewall"
if [[ $MODO == compartilhado ]]; then
  ok "Não mexo no firewall de uma VPS com outros projetos (o Sintonia não abre porta nova: fica em 127.0.0.1)."
elif [[ -n ${SEM_FIREWALL:-} ]]; then
  aviso "SEM_FIREWALL definido: firewall não configurado."
else
  aptq install -y -qq ufw >/dev/null
  portas_ssh="${SSH_PORT:-}"
  if [[ -n ${SSH_CONNECTION:-} ]]; then portas_ssh+=" $(awk '{print $4}' <<<"$SSH_CONNECTION")"; fi
  # porta(s) do SSH: sshd ouvindo, configuração efetiva e ssh.socket (Ubuntu 24.04); 22 sempre entra
  portas_ssh+=" $(ss -Htlnp 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | tr '\n' ' ' || true)"
  portas_ssh+=" $(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | tr '\n' ' ' || true)"
  portas_ssh+=" $(systemctl show ssh.socket -p Listen --value 2>/dev/null | grep -oE ':[0-9]+ ' | tr -d ': ' | tr '\n' ' ' || true)"
  portas_ssh="$(tr ' ' '\n' <<<"$portas_ssh 22" | grep -E '^[0-9]+$' | sort -un | tr '\n' ' ')"
  for p in $portas_ssh; do ufw allow "$p/tcp" comment 'SSH' >/dev/null; done
  ufw allow 80/tcp comment 'HTTP (Caddy)' >/dev/null
  ufw allow 443/tcp comment 'HTTPS (Caddy)' >/dev/null
  ufw allow 443/udp comment 'HTTP/3 (Caddy)' >/dev/null
  ufw --force enable >/dev/null
  ok "ufw ativo: SSH (${portas_ssh% }), 80/tcp, 443/tcp e 443/udp liberados"
  aviso "Se o seu SSH usa outra porta, libere-a antes de sair: ufw allow <porta>/tcp"
fi

# ---- 6. swap, relógio e disco ---------------------------------------------------------------------------
info "6/9 Memória de troca (swap), relógio e disco"
SWAP_GB=${SWAP_GB:-2}
mem_livre_mb="$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo)"
if [[ -n "$(swapon --show --noheadings 2>/dev/null)" ]]; then
  ok "Swap já existe ($(swapon --show --noheadings --bytes | awk '{s+=$3} END {printf "%.1f GB", s/1073741824}'))"
elif [[ $SWAP_GB == 0 ]]; then
  aviso "SWAP_GB=0: sem swap (o build da imagem usa ~1 GB de RAM)."
elif [[ $MODO == compartilhado && ${mem_livre_mb:-0} -ge 2048 ]]; then
  ok "Sem swap, mas há $((mem_livre_mb / 1024)) GB de RAM livre: não crio swap numa VPS compartilhada"
elif [[ -e /swapfile ]] && ! grep -qE '^/swapfile\s' /etc/fstab && [[ $MODO == compartilhado ]]; then
  aviso "Já existe um /swapfile que não é usado; não mexo nele (o build usa ~1 GB de RAM; livre agora: ${mem_livre_mb:-?} MB)."
else
  if [[ ! -f /swapfile ]]; then
    fallocate -l "${SWAP_GB}G" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || aviso "Não consegui ativar o swap (alguns provedores não permitem). Seguindo."
  grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  if [[ $MODO != compartilhado ]]; then
    # máquina só do Sintonia: swap só para emergências (numa compartilhada, não mudo ajuste global do sistema)
    echo 'vm.swappiness=10' >/etc/sysctl.d/99-sintonia.conf
    sysctl -q -p /etc/sysctl.d/99-sintonia.conf >/dev/null 2>&1 || true
  fi
  ok "Swap de ${SWAP_GB} GB em /swapfile (só para picos e para o build)"
fi
if command -v timedatectl >/dev/null 2>&1; then
  timedatectl set-ntp true >/dev/null 2>&1 || true
  if [[ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" == yes ]]; then
    ok "Relógio sincronizado (NTP)"
  else
    aviso "Relógio ainda não sincronizado pelo NTP (a apuração depende da hora certa). Confira depois: timedatectl"
  fi
fi
dir_docker="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
[[ -d $dir_docker ]] || dir_docker=/
livre_gb="$(df -Pk "$dir_docker" | awk 'NR == 2 {print int($4 / 1048576)}')"
if ((livre_gb < 3)); then
  morrer "Só ${livre_gb} GB livres em $dir_docker: a imagem e o build precisam de ~3 GB. Libere espaço (ex.: docker system df) e rode de novo."
elif ((livre_gb < 6)); then
  aviso "Disco com ${livre_gb} GB livres em $dir_docker (o Sintonia usa ~2–3 GB). Funciona, mas fique de olho."
else
  ok "Disco: ${livre_gb} GB livres"
fi

# ---- 7. configuração (.env) -------------------------------------------------------------------------
info "7/9 Configuração (.env)"
NOVO=''
if [[ ! -f $ENV ]]; then
  (umask 077 && cp "$INSTALL_DIR/.env.example" "$ENV")
  NOVO=1
fi
chmod 600 "$ENV"

dominio="${DOMINIO:-$(ler_env DOMINIO)}"
email="${ACME_EMAIL:-$(ler_env ACME_EMAIL)}"
[[ $email == *@sintonia.invalid ]] && email=''
DOMINIO_DEPOIS=''
if [[ $MODO == compartilhado ]]; then
  # o domínio é opcional agora: quem liga o domínio ao proxy da máquina é o deploy/dominio.sh
  if [[ -z $dominio && -z ${DOMINIO:-} ]]; then
    perguntar "Domínio do site, se o DNS JÁ aponta para esta VPS (Enter = ligar depois com deploy/dominio.sh)" ""
    dominio="${RESP// /}"
  fi
  if [[ -n $dominio && ! ${dominio,,} =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]]; then
    aviso "Domínio inválido: '$dominio' — fica para depois (deploy/dominio.sh)."
    dominio=''
  fi
  dominio=${dominio,,}
  # já configurado (instalação de antes): o dominio.sh não precisa rodar de novo
  if [[ -n $dominio && $dominio != "$(ler_env DOMINIO)" ]]; then DOMINIO_DEPOIS=$dominio; fi
  if [[ -n $DOMINIO_DEPOIS && ! $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
    perguntar "E-mail para o certificado HTTPS (Let's Encrypt)" ""
    email="${RESP// /}"
  fi
else
  while [[ ! ${dominio,,} =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]]; do
    [[ -n $TTY ]] || morrer "Defina DOMINIO (ex.: DOMINIO=sintonia.app) para instalar sem perguntas."
    [[ -z $dominio ]] || aviso "Domínio inválido: '$dominio' (sem https://, sem barra; ex.: sintonia.app)"
    perguntar "Domínio do site (ex.: sintonia.app)"
    dominio="${RESP// /}"
  done
  dominio=${dominio,,}

  while [[ ! $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
    [[ -n $TTY ]] || morrer "Defina ACME_EMAIL (e-mail para o Let's Encrypt) para instalar sem perguntas."
    [[ -z $email ]] || aviso "E-mail inválido: '$email'"
    perguntar "E-mail para o certificado HTTPS (Let's Encrypt)"
    email="${RESP// /}"
  done
fi

senha="${ADMIN_PASSWORD:-$(ler_env ADMIN_PASSWORD)}"
SENHA_GERADA=''
if [[ -z $senha ]]; then
  perguntar_senha
  senha=$RESP
  if [[ -z $senha ]]; then
    senha="$(gerar_segredo 24)"
    SENHA_GERADA=1
  fi
fi
[[ $senha != *"'"* ]] || morrer "ADMIN_PASSWORD não pode conter aspas simples (')."
segredo="$(ler_env ADMIN_SECRET)"
((${#segredo} >= 32)) || segredo="$(gerar_segredo 48)"

twitter="${TWITTER_SITE:-$(ler_env TWITTER_SITE)}"
if [[ -n $NOVO && -z $twitter && -n $TTY ]]; then
  perguntar "Perfil do X para os cartões de link (ex.: @sintonia; Enter pula)" ""
  twitter="${RESP// /}"
fi

definir_env MODO_VPS "$MODO"
definir_env TWITTER_SITE "$twitter"
definir_env ADMIN_PASSWORD "$senha"
definir_env ADMIN_SECRET "$segredo"

if [[ $MODO == compartilhado ]]; then
  porta_local="${PORTA_LOCAL:-$(ler_env PORTA_LOCAL)}"
  if [[ -z $porta_local ]]; then porta_local="$(porta_livre 8787)" || morrer "Nenhuma porta livre entre 8787 e 8986."; fi
  [[ $porta_local =~ ^[0-9]+$ ]] || morrer "PORTA_LOCAL inválida: $porta_local"
  definir_env PORTA_LOCAL "$porta_local"
  definir_env COMPOSE_FILE "docker-compose.yml:docker-compose.vps.yml"
  if [[ -z $(ler_env DOMINIO) ]]; then
    # sem domínio ainda: o site usa o endereço de cada página (VITE_SITE_URL vazio) até o dominio.sh
    definir_env DOMINIO ""
    definir_env SITE_ADDRESS ":80"
    definir_env PUBLIC_URL ""
    definir_env VITE_SITE_URL ""
  fi
  # o docker-compose.yml exige ACME_EMAIL (é do Caddy próprio, desligado aqui): marcador até o dominio.sh
  if [[ $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then definir_env ACME_EMAIL "$email"; else definir_env ACME_EMAIL "pendente@sintonia.invalid"; fi
  # proxy em contêiner: o app entra na rede dele (com o apelido sintonia-app)
  if [[ $PROXY_TIPO == docker && -z $PROXY_REDE_HOST ]]; then
    definir_env REDES_PROXY "$(redes_do_proxy)"
    definir_env PROXY_DOCKER "$PROXY_DOCKER"
  elif [[ -z $(ler_env REDES_PROXY) ]]; then
    definir_env REDES_PROXY ""
    definir_env PROXY_DOCKER ""
  fi
  gerar_compose_vps
  ok ".env em $ENV (permissão 600): VPS compartilhada, app em 127.0.0.1:$porta_local${dominio:+, domínio $dominio}"
else
  site="$(ler_env SITE_ADDRESS)"
  if [[ -z $site || $site == :* || -n $NOVO || -n ${DOMINIO:-} ]]; then
    www=${INCLUIR_WWW:-}
    if [[ -z $www ]]; then
      perguntar "Atender também www.$dominio (precisa do registro DNS do www)? s/N" "n"
      www=$RESP
    fi
    if sim "$www"; then site="$dominio, www.$dominio"; else site="$dominio"; fi
  fi
  definir_env DOMINIO "$dominio"
  definir_env SITE_ADDRESS "$site"
  definir_env ACME_EMAIL "$email"
  definir_env PUBLIC_URL "https://$dominio"
  definir_env VITE_SITE_URL "https://$dominio"
  ok ".env em $ENV (permissão 600): domínio $dominio, Caddy atende '$site'"

  # DNS: avisa (não bloqueia) se o domínio ainda não aponta para esta máquina
  ip_publico="$(curl -fsS4 --max-time 6 https://api.ipify.org 2>/dev/null || curl -fsS4 --max-time 6 https://ifconfig.me 2>/dev/null || true)"
  ips_dns="$(getent ahostsv4 "$dominio" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  if [[ -z $ips_dns ]]; then
    aviso "O domínio $dominio ainda não resolve no DNS. Crie o registro A → ${ip_publico:-IP desta VPS}. O Caddy tenta o certificado sozinho até o DNS propagar."
  elif [[ -n $ip_publico && " $ips_dns " == *" $ip_publico "* ]]; then
    ok "DNS: $dominio → $ip_publico (esta VPS)"
  else
    aviso "DNS: $dominio → ${ips_dns% } (esta VPS: ${ip_publico:-?}). Se for a Cloudflare com a nuvem LARANJA, deixe em 'DNS only' (cinza) até o primeiro certificado sair (DEPLOY.md)."
  fi
fi

# ---- 8. build e subida ------------------------------------------------------------------------------
info "8/9 Build da imagem e subida (a primeira vez leva alguns minutos)"
GIT_COMMIT="$(commit_atual)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT BUILD_DATE
if app_rodando && [[ "$(revisao_rodando)" == "$GIT_COMMIT" ]] && esperar_saude 5; then
  ok "A imagem do commit $GIT_COMMIT já está no ar: sem rebuild (para forçar: deploy/update.sh --forcar)"
  dc up -d --no-build --remove-orphans # aplica mudanças do .env, se houver
else
  dc build app
  dc up -d --remove-orphans
fi
if ! esperar_saude 240; then
  dc logs --tail 40 app
  morrer "O app não ficou saudável em 4 min (logs acima)."
fi
ok "App saudável: $(healthz)"

if [[ $MODO == compartilhado ]]; then
  if healthz_local >/dev/null; then
    ok "Respondendo em http://127.0.0.1:$(ler_env PORTA_LOCAL) (só nesta máquina)"
  else
    aviso "O app está saudável, mas http://127.0.0.1:$(ler_env PORTA_LOCAL) não respondeu. Veja: $INSTALL_DIR/deploy/status.sh"
  fi
  if [[ -n $(ler_env DOMINIO) ]] && verificar_publico 30; then
    ok "HTTPS funcionando: https://$(ler_env DOMINIO)"
  fi
elif verificar_publico 120; then
  ok "HTTPS funcionando: https://$dominio (certificado válido)"
else
  aviso "O HTTPS ainda não respondeu com certificado válido. Normal se o DNS não propagou: o Caddy tenta de novo sozinho."
  aviso "Acompanhe com: cd $INSTALL_DIR && docker compose logs -f caddy   (procure 'certificate obtained')"
fi

# ---- 9. backup automático -------------------------------------------------------------------------
info "9/9 Backup automático"
if [[ -n ${SEM_CRON:-} ]]; then
  aviso "SEM_CRON definido: backup automático não agendado (rode deploy/backup.sh quando quiser)."
else
  cat >/etc/cron.d/sintonia <<CRON
# Sintonia: backup do estado do painel e do .env a cada hora (deploy/backup.sh; mantém os últimos 72)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 * * * * root $INSTALL_DIR/deploy/backup.sh --quieto >>/var/log/sintonia-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/sintonia
  ok "Backup de hora em hora agendado (/etc/cron.d/sintonia)"
fi
"$INSTALL_DIR/deploy/backup.sh" --quieto && ok "Primeiro backup feito em ${BACKUP_DIR:-/var/backups/sintonia}"

# ---- domínio já apontado, numa VPS compartilhada: liga agora ----------------------------------------
if [[ $MODO == compartilhado && -n $DOMINIO_DEPOIS ]]; then
  info "Domínio $DOMINIO_DEPOIS"
  args=("$DOMINIO_DEPOIS")
  [[ $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] && args+=(--email "$email")
  sim "${INCLUIR_WWW:-n}" && args+=(--www)
  "$INSTALL_DIR/deploy/dominio.sh" "${args[@]}" ||
    aviso "O domínio não foi ligado agora (mensagens acima). O site segue instalado; tente de novo com: sudo $INSTALL_DIR/deploy/dominio.sh ${args[*]}"
fi

# ---- sem domínio ainda, numa VPS compartilhada: endereço próprio provisório (opcional) ---------------
if [[ $MODO == compartilhado && -z $(ler_env DOMINIO) && -z $DOMINIO_DEPOIS ]]; then
  previa=${PREVIA:-}
  if [[ -z $previa ]]; then
    perguntar "Publicar já num endereço PRÓPRIO do Sintonia, provisório e com HTTPS (https://sintonia.<ip>.sslip.io)? S/n" "s"
    previa=$RESP
  fi
  if sim "$previa"; then
    info "Endereço provisório do Sintonia"
    "$INSTALL_DIR/deploy/dominio.sh" --previa ||
      aviso "O endereço provisório não ficou pronto (mensagens acima). O site segue instalado; tente de novo com: sudo $INSTALL_DIR/deploy/dominio.sh --previa"
  fi
fi

trap - ERR
dominio_final="$(ler_env DOMINIO)"
if [[ -n $dominio_final ]]; then
  cat <<FIM

${C_OK}${C_NEG}Sintonia instalado.${C_FIM}

  Site:   https://$dominio_final
  Painel: https://$dominio_final/admin
FIM
else
  ip_publico="$(curl -fsS4 --max-time 6 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
  cat <<FIM

${C_OK}${C_NEG}Sintonia instalado (VPS compartilhada, ainda sem domínio).${C_FIM}

  App:    http://127.0.0.1:$(ler_env PORTA_LOCAL)   (só dentro desta máquina)
  Portas 80/443: $PROXY_DESC
FIM
  if [[ -n $(ler_env ENDERECO_PREVIA) ]]; then
    printf '  %sSite (provisório, só do Sintonia): %s%s   (painel: %s/admin)\n' "$C_NEG" "$(ler_env ENDERECO_PREVIA)" "$C_FIM" "$(ler_env ENDERECO_PREVIA)"
  else
    printf '  Endereço próprio provisório com HTTPS (não aparece no Google):\n     sudo %s/deploy/dominio.sh --previa\n' "$INSTALL_DIR"
  fi
  cat <<FIM

  Quando o domínio apontar para esta VPS (registro A → ${ip_publico:-IP desta VPS}):
     sudo $INSTALL_DIR/deploy/dominio.sh seu-dominio.com.br
FIM
fi
if [[ -n $SENHA_GERADA ]]; then
  printf '  Senha do painel: %s\n          (gerada agora; guarde num gerenciador de senhas — também está em %s)\n' "$senha" "$ENV"
else
  printf '  Senha do painel: a que você definiu (está em %s)\n' "$ENV"
fi
cat <<FIM

  Situação:   sudo $INSTALL_DIR/deploy/status.sh
  Painel:     sudo $INSTALL_DIR/deploy/painel.sh estado     (fonte, troca para o TSE às 17h, avisos)
  Atualizar:  sudo $INSTALL_DIR/deploy/update.sh
  Backup:     sudo $INSTALL_DIR/deploy/backup.sh     (automático de hora em hora)
  Logs:       cd $INSTALL_DIR && sudo docker compose logs -f app

  Próximos passos (DEPLOY.md): o CHECKLIST-LANCAMENTO.md antes de divulgar e o RUNBOOK-ELEICAO.md para 24 a 26/10.
FIM

exit 0
}
