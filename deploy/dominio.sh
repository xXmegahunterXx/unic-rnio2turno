#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — liga (ou troca) o domínio do site, inclusive numa VPS com outros projetos.
#
#   sudo /opt/sintonia/deploy/dominio.sh meudominio.com.br            o registro A do DNS já aponta para esta VPS
#   sudo /opt/sintonia/deploy/dominio.sh meudominio.com.br --www      também www.meudominio.com.br (crie o DNS do www)
#   sudo /opt/sintonia/deploy/dominio.sh --previa                     endereço PROVISÓRIO com HTTPS, sem domínio:
#                                                                     https://<ip-desta-vps>.sslip.io (fora do Google)
#   sudo /opt/sintonia/deploy/dominio.sh --remover <host>             tira o <host> do servidor web da máquina
#
# Opções: --email voce@exemplo.com (Let's Encrypt; pergunta se faltar)   --sem-dns (não confere o DNS: ex. Cloudflare
#         com a nuvem laranja já ligada)   --sem-rebuild (não reconstrói a imagem)
#
# O que faz, conforme quem atende as portas 80/443 desta máquina (detectado sozinho):
#   - ninguém (ou a máquina é só do Sintonia): o Caddy do Sintonia atende o domínio com HTTPS automático;
#   - nginx / Caddy / Apache instalados no sistema: cria UM arquivo de site só do Sintonia, confere a configuração
#     (nginx -t, caddy validate, apachectl configtest) ANTES de recarregar, pede o certificado (certbot ou o próprio
#     Caddy) e, se algo falhar, desfaz — os outros sites não são tocados;
#   - proxy em contêiner (nginx-proxy, caddy-docker-proxy): rótulos/variáveis no contêiner do app;
#     (Nginx Proxy Manager, Traefik, painéis): mostra exatamente o que cadastrar.
# No fim, reconstrói a imagem com o endereço novo (links de compartilhar) sem tirar o site do ar (update.sh).
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DOM='' WWW='' EMAIL='' PREVIA='' SEM_DNS='' SEM_REBUILD='' REMOVER=''
while (($#)); do
  case $1 in
    --www) WWW=1 ;;
    --email)
      EMAIL=${2:-}
      shift
      ;;
    --email=*) EMAIL=${1#*=} ;;
    --previa) PREVIA=1 ;;
    --sem-dns) SEM_DNS=1 ;;
    --sem-rebuild) SEM_REBUILD=1 ;;
    --remover)
      REMOVER=${2:-}
      shift
      ;;
    -h | --help)
      sed -n '2,24p' "$0"
      exit 0
      ;;
    -*) morrer "Opção desconhecida: $1 (use --help)" ;;
    *) DOM=$1 ;;
  esac
  shift
done

[[ $EUID -eq 0 ]] || morrer "Rode como root: sudo $0 $*"
exigir_docker
exigir_env
cd "$RAIZ"

# grava CHAVE='VALOR' no .env (substitui a linha, mesmo comentada; mantém a permissão 600)
definir_env() {
  local tmp
  tmp="$(mktemp "$ARQ_ENV.XXXXXX")"
  CHAVE="$1" VALOR="'$2'" awk '
    BEGIN { c = ENVIRON["CHAVE"]; v = ENVIRON["VALOR"]; feito = 0 }
    !feito && $0 ~ ("^#?[[:space:]]*" c "=") { print c "=" v; feito = 1; next }
    { print }
    END { if (!feito) print c "=" v }' "$ARQ_ENV" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ARQ_ENV"
}
dominio_valido() { [[ ${1,,} =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]]; }
email_valido() { [[ $1 =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ && $1 != *@sintonia.invalid ]]; }
ip_publico() { curl -fsS4 --max-time 6 https://api.ipify.org 2>/dev/null || curl -fsS4 --max-time 6 https://ifconfig.me 2>/dev/null || true; }
servico_ativo() { command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$1" 2>/dev/null; }
recarregar() { # recarregar nginx|caddy|apache2 — sem derrubar conexões
  case $1 in
    nginx) if servico_ativo nginx; then systemctl reload nginx; else nginx -s reload; fi ;;
    caddy) if servico_ativo caddy; then systemctl reload caddy; else caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; fi ;;
    apache2) if servico_ativo apache2; then systemctl reload apache2; else apachectl -k graceful; fi ;;
  esac
}
PORTA="$(cfg PORTA_LOCAL 8787)"
MARCA="# Sintonia — gerado por $RAIZ/deploy/dominio.sh"

# ---- remover um host do servidor web da máquina -----------------------------------------------------
remover_host() { # remover_host <host> → 0 se removeu algo
  local h=$1 feito=1 f
  for f in "/etc/nginx/sites-enabled/sintonia-$h.conf" "/etc/nginx/sites-available/sintonia-$h.conf" "/etc/nginx/conf.d/sintonia-$h.conf"; do
    if [[ -e $f || -L $f ]] && { [[ -L $f ]] || grep -qF "$MARCA" "$f" 2>/dev/null; }; then
      rm -f "$f"
      feito=0
    fi
  done
  if ((feito == 0)) && nginx -t >/dev/null 2>&1; then recarregar nginx; fi
  if [[ -f /etc/apache2/sites-available/sintonia-$h.conf ]]; then
    a2dissite -q "sintonia-$h" >/dev/null 2>&1 || true
    a2dissite -q "sintonia-$h-le-ssl" >/dev/null 2>&1 || true
    rm -f "/etc/apache2/sites-available/sintonia-$h.conf" "/etc/apache2/sites-available/sintonia-$h-le-ssl.conf"
    apachectl configtest >/dev/null 2>&1 && recarregar apache2
    feito=0
  fi
  if [[ -f /etc/caddy/Caddyfile ]] && grep -qF "# >>> Sintonia: $h" /etc/caddy/Caddyfile; then
    cp -p /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.antes-sintonia"
    sed -i "/^# >>> Sintonia: ${h//./\\.}\$/,/^# <<< Sintonia: ${h//./\\.}\$/d" /etc/caddy/Caddyfile
    if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
      recarregar caddy
    else
      cp -p /etc/caddy/Caddyfile.antes-sintonia /etc/caddy/Caddyfile
    fi
    feito=0
  fi
  return $feito
}

if [[ -n $REMOVER ]]; then
  dominio_valido "$REMOVER" || morrer "Host inválido: $REMOVER"
  if remover_host "${REMOVER,,}"; then ok "$REMOVER tirado do servidor web da máquina"; else aviso "Nenhuma configuração do Sintonia para $REMOVER."; fi
  exit 0
fi

# ---- qual endereço ------------------------------------------------------------------------------------
IP="$(ip_publico)"
if [[ -n $PREVIA ]]; then
  [[ -z "$(cfg DOMINIO)" ]] || morrer "Já existe um domínio configurado ($(cfg DOMINIO)): o endereço provisório é só para antes dele."
  [[ $IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || morrer "Não descobri o IP público desta VPS (precisa de internet para api.ipify.org)."
  DOM="${IP//./-}.sslip.io"
  WWW=''
  SEM_DNS=1 # o sslip.io sempre responde com o IP que está no nome
fi
[[ -n $DOM ]] || morrer "Diga o domínio: sudo $0 meudominio.com.br   (ou --previa para um endereço provisório)"
DOM=${DOM,,}
DOM=${DOM#https://}
DOM=${DOM#http://}
DOM=${DOM%%/*}
dominio_valido "$DOM" || morrer "Domínio inválido: '$DOM' (sem https://, sem barra; ex.: meudominio.com.br)"
HOSTS=("$DOM")
[[ -n $WWW ]] && HOSTS+=("www.$DOM")
hosts_virgula() { # "a.com, www.a.com"
  local IFS=,
  local l="${HOSTS[*]}"
  printf '%s' "${l//,/, }"
}

EMAIL=${EMAIL:-$(cfg ACME_EMAIL)}
if ! email_valido "$EMAIL"; then
  if [[ -t 0 ]]; then
    read -r -p "E-mail para o certificado HTTPS (Let's Encrypt avisa nele se algo der errado): " EMAIL
  fi
  email_valido "$EMAIL" || morrer "Informe o e-mail do certificado: --email voce@exemplo.com"
fi

# ---- DNS ---------------------------------------------------------------------------------------------
if [[ -z $SEM_DNS ]]; then
  for h in "${HOSTS[@]}"; do
    ips="$(getent ahostsv4 "$h" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
    if [[ -z $ips ]]; then
      morrer "$h ainda não resolve no DNS. Crie o registro A → ${IP:-IP desta VPS}, espere propagar (minutos) e rode de novo."
    elif [[ -n $IP && " $ips " != *" $IP "* ]]; then
      morrer "$h aponta para ${ips% }, não para esta VPS (${IP:-?}). Se for a Cloudflare com a nuvem LARANJA, deixe 'DNS only' (cinza) até o certificado sair — ou rode com --sem-dns."
    fi
  done
  ok "DNS: ${HOSTS[*]} → ${IP:-esta VPS}"
fi

detectar_proxy
info "Portas 80/443 desta máquina: $PROXY_DESC"

# cabeçalhos para o app (o mesmo que o Caddy do Sintonia faz): IP real só pelo X-Real-IP calculado aqui;
# cabeçalhos de IP vindos de fora são descartados. Atrás da Cloudflare, o IP real vem do CF-Connecting-IP —
# aceito só quando a conexão vem de um IP da própria Cloudflare (lista oficial, conferida em 12/10/2026).
CF_IPS=(173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20
  188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
  2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32)

certbot_pronto() { # certbot com o plugin do servidor ($1: nginx | apache)
  if command -v certbot >/dev/null 2>&1 && certbot plugins 2>/dev/null | grep -q "^\* $1\$"; then return 0; fi
  info "Instalando o certbot (Let's Encrypt) com o plugin $1"
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq certbot "python3-certbot-$1" >/dev/null
}
args_certbot() { # → certificado para todos os HOSTS, sem perguntas, com redirecionamento HTTP → HTTPS
  local h
  CERTBOT_ARGS=(--non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring --cert-name "sintonia-$DOM")
  for h in "${HOSTS[@]}"; do CERTBOT_ARGS+=(-d "$h"); done
}

# ---- nginx do sistema --------------------------------------------------------------------------------
configurar_nginx() {
  local dir link='' arq tmp ip6='' h cf=''
  nginx -t >/dev/null 2>&1 || morrer "A configuração atual do nginx já tem erro (nginx -t): corrija antes; não mexo em nada assim."
  [[ -n ${SEM_CERTIFICADO:-} ]] || certbot_pronto nginx
  for h in "${HOSTS[@]}"; do
    if nginx -T 2>/dev/null | grep -vE '^\s*#' | grep -qE "server_name[^;]*[[:space:]]${h}[[:space:];]" &&
      ! grep -qsF "$MARCA" "/etc/nginx/sites-available/sintonia-$DOM.conf" "/etc/nginx/conf.d/sintonia-$DOM.conf"; then
      morrer "O nginx já tem um site para $h (outro projeto). Escolha outro domínio ou tire esse site antes."
    fi
  done
  if [[ -d /etc/nginx/sites-enabled ]] && grep -qsE '^\s*include\s+/etc/nginx/sites-enabled/' /etc/nginx/nginx.conf; then
    dir=/etc/nginx/sites-available
    link="/etc/nginx/sites-enabled/sintonia-$DOM.conf"
  elif grep -qsE '^\s*include\s+/etc/nginx/conf\.d/\*\.conf' /etc/nginx/nginx.conf; then
    dir=/etc/nginx/conf.d
  else
    morrer "Não achei onde o nginx carrega os sites (sites-enabled ou conf.d). Configure à mão: proxy de $DOM para http://127.0.0.1:$PORTA (DEPLOY.md)."
  fi
  arq="$dir/sintonia-$DOM.conf"
  ss -Htln 'sport = :80' 2>/dev/null | grep -qF '[::]' && ip6=1
  for h in "${CF_IPS[@]}"; do cf+="    set_real_ip_from $h;"$'\n'; done
  # arquivo já existente (certificado de antes): só confere; o certbot mantém o bloco 443 que ele criou
  if [[ -f $arq ]] && grep -qF "$MARCA" "$arq" && grep -qF "127.0.0.1:$PORTA" "$arq" && grep -qE "server_name ${HOSTS[*]};" "$arq"; then
    ok "Site do Sintonia no nginx já existe ($arq)"
  else
    tmp="$(mktemp)"
    cat >"$tmp" <<NGINX
$MARCA em $(date '+%d/%m/%Y %H:%M').
# Para remover: sudo $RAIZ/deploy/dominio.sh --remover $DOM
upstream sintonia_${DOM//[^a-z0-9]/_} {
    server 127.0.0.1:$PORTA;
    keepalive 32;
}

server {
    listen 80;
$([[ -n $ip6 ]] && echo "    listen [::]:80;")
    server_name ${HOSTS[*]};
$([[ -n $WWW ]] && printf '\n    # www → domínio principal (mesmo caminho)\n    if ($host = www.%s) {\n        return 308 $scheme://%s$request_uri;\n    }\n' "$DOM" "$DOM")

    # IP real atrás da Cloudflare (só vale quando a conexão vem da Cloudflare)
$cf    real_ip_header CF-Connecting-IP;
$([[ -n $PREVIA ]] && printf '\n    # endereço provisório: fora dos buscadores\n    add_header X-Robots-Tag "noindex, nofollow" always;\n')

    client_max_body_size 1m;

    location / {
        proxy_pass http://sintonia_${DOM//[^a-z0-9]/_};
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header CF-Connecting-IP "";
        proxy_set_header Fly-Client-IP "";
        proxy_set_header True-Client-IP "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
}
NGINX
    install -m 644 "$tmp" "$arq"
    rm -f "$tmp"
    [[ -n $link ]] && ln -sfn "$arq" "$link"
    if ! nginx -t >/dev/null 2>&1; then
      nginx -t 2>&1 | tail -n 5 >&2 || true
      rm -f "$arq" ${link:+"$link"}
      morrer "O nginx recusou a configuração do Sintonia (acima). Desfeito: nada mudou para os outros sites."
    fi
    recarregar nginx
    ok "Site do Sintonia no nginx: $arq (os outros sites não foram tocados)"
  fi
  if [[ -n ${SEM_CERTIFICADO:-} ]]; then
    aviso "SEM_CERTIFICADO: só HTTP (o HTTPS fica com quem está na frente, ex.: Cloudflare)."
    return 0
  fi
  args_certbot
  if ! certbot --nginx "${CERTBOT_ARGS[@]}"; then
    remover_host "$DOM" >/dev/null 2>&1 || true
    morrer "O certificado não saiu (mensagens acima). Desfeito: nada mudou para os outros sites. Confira o DNS e se a porta 80 está liberada no firewall do provedor, e rode de novo."
  fi
  nginx -t >/dev/null 2>&1 && recarregar nginx
  ok "Certificado HTTPS emitido (renovação automática pelo certbot)"
}

# ---- Caddy do sistema ---------------------------------------------------------------------------------
configurar_caddy_host() {
  local cf='' h tmp bloco
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || morrer "O Caddyfile atual já tem erro (caddy validate): corrija antes; não mexo em nada assim."
  for h in "${HOSTS[@]}"; do
    if grep -vE '^\s*#' /etc/caddy/Caddyfile | grep -qE "(^|[ ,/])$h([ ,:{]|$)" && ! grep -qF "# >>> Sintonia: $DOM" /etc/caddy/Caddyfile; then
      morrer "O Caddy já tem um site para $h (outro projeto). Escolha outro domínio ou tire esse site antes."
    fi
  done
  remover_host "$DOM" >/dev/null 2>&1 || true
  bloco="$(
    echo "# >>> Sintonia: $DOM"
    echo "$MARCA. Para remover: sudo $RAIZ/deploy/dominio.sh --remover $DOM"
    echo "$(hosts_virgula) {"
    if [[ -n $WWW ]]; then
      echo "	@www host www.$DOM"
      echo "	redir @www https://$DOM{uri} 308"
    fi
    [[ -n $PREVIA ]] && echo '	header X-Robots-Tag "noindex, nofollow"'
    echo "	reverse_proxy 127.0.0.1:$PORTA {"
    echo "		header_up X-Real-IP {remote_host}"
    echo "		header_up -CF-Connecting-IP"
    echo "		header_up -Fly-Client-IP"
    echo "		header_up -True-Client-IP"
    echo "		lb_try_duration 20s"
    echo "		lb_try_interval 250ms"
    echo "	}"
    echo "}"
    echo "# <<< Sintonia: $DOM"
  )"
  cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-sintonia
  printf '\n%s\n' "$bloco" >>/etc/caddy/Caddyfile
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -n 5 >&2 || true
    cp -p /etc/caddy/Caddyfile.antes-sintonia /etc/caddy/Caddyfile
    morrer "O Caddy recusou o bloco do Sintonia (acima). Desfeito: nada mudou para os outros sites."
  fi
  recarregar caddy
  ok "Bloco do Sintonia no /etc/caddy/Caddyfile (entre '# >>> Sintonia' e '# <<< Sintonia'); o Caddy pede o certificado sozinho"
}

# ---- Apache do sistema --------------------------------------------------------------------------------
configurar_apache() {
  local arq="/etc/apache2/sites-available/sintonia-$DOM.conf" tmp aliases=''
  apachectl configtest >/dev/null 2>&1 || morrer "A configuração atual do Apache já tem erro (apachectl configtest): corrija antes."
  [[ -n ${SEM_CERTIFICADO:-} ]] || certbot_pronto apache
  [[ -n $WWW ]] && aliases="    ServerAlias www.$DOM"
  tmp="$(mktemp)"
  cat >"$tmp" <<APACHE
$MARCA em $(date '+%d/%m/%Y %H:%M').
# Para remover: sudo $RAIZ/deploy/dominio.sh --remover $DOM
<VirtualHost *:80>
    ServerName $DOM
$aliases
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:$PORTA/ connectiontimeout=5 timeout=30
    ProxyPassReverse / http://127.0.0.1:$PORTA/
    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
    RequestHeader unset CF-Connecting-IP
    RequestHeader unset Fly-Client-IP
    RequestHeader unset True-Client-IP
$([[ -n $PREVIA ]] && echo '    Header always set X-Robots-Tag "noindex, nofollow"')
$([[ -n $WWW ]] && printf '    <If "%%{HTTP_HOST} == '"'"'www.%s'"'"'">\n        Redirect 308 / https://%s/\n    </If>\n' "$DOM" "$DOM")
</VirtualHost>
APACHE
  a2enmod -q proxy proxy_http headers >/dev/null
  install -m 644 "$tmp" "$arq"
  rm -f "$tmp"
  a2ensite -q "sintonia-$DOM" >/dev/null
  if ! apachectl configtest >/dev/null 2>&1; then
    apachectl configtest 2>&1 | tail -n 5 >&2 || true
    a2dissite -q "sintonia-$DOM" >/dev/null 2>&1 || true
    rm -f "$arq"
    morrer "O Apache recusou a configuração do Sintonia (acima). Desfeito."
  fi
  recarregar apache2
  ok "Site do Sintonia no Apache: $arq"
  if [[ -n ${SEM_CERTIFICADO:-} ]]; then
    aviso "SEM_CERTIFICADO: só HTTP (o HTTPS fica com quem está na frente, ex.: Cloudflare)."
    return 0
  fi
  args_certbot
  if ! certbot --apache "${CERTBOT_ARGS[@]}"; then
    remover_host "$DOM" >/dev/null 2>&1 || true
    morrer "O certificado não saiu (mensagens acima). Desfeito: nada mudou para os outros sites. Confira o DNS e se a porta 80 está liberada no firewall do provedor, e rode de novo."
  fi
  ok "Certificado HTTPS emitido (renovação automática pelo certbot)"
}

# ---- instruções (painel, Nginx Proxy Manager, Traefik…) --------------------------------------------------
instrucoes() {
  local destino=$1
  cat <<TXT

  ${C_NEG}Falta um passo seu${C_FIM} — no $PROXY_DESC, cadastre um "proxy reverso":
     domínio(s):  ${HOSTS[*]}
     destino:     $destino
     HTTPS:       Let's Encrypt, forçar HTTPS
     cabeçalho:   X-Real-IP = IP do visitante (a maioria dos proxies já manda)
TXT
  case ${PROXY_DOCKER:-} in
    npm)
      echo "     (Nginx Proxy Manager: Hosts → Proxy Hosts → Add Proxy Host; Scheme http, Forward Hostname 'sintonia-app',"
      echo "      Forward Port $(cfg PORT 8787), 'Block Common Exploits'; aba SSL: Request a new certificate + Force SSL + HTTP/2)"
      ;;
    traefik)
      echo "     (Traefik: o app já está na rede do Traefik como 'sintonia-app'. Traefik de painel — Coolify, Dokploy,"
      echo "      EasyPanel —: cadastre o domínio por lá. Traefik avulso: no arquivo dinâmico dele, um router"
      echo "      Host(\`$DOM\`) com certResolver → serviço http://sintonia-app:$(cfg PORT 8787))"
      ;;
  esac
  echo "  Depois rode de novo este comando com --sem-rebuild para conferir."
}

# endereço provisório antigo sai quando chega o domínio de verdade (evita o mesmo site em dois endereços)
if [[ -z $PREVIA ]]; then
  for f in /etc/nginx/sites-available/sintonia-*.sslip.io.conf /etc/nginx/conf.d/sintonia-*.sslip.io.conf /etc/apache2/sites-available/sintonia-*.sslip.io.conf; do
    [[ -e $f ]] || continue
    h="$(basename "$f" .conf)"
    h="${h#sintonia-}"
    [[ $h == *-le-ssl ]] && continue
    if remover_host "$h"; then ok "Endereço provisório $h desligado"; fi
  done
  if [[ -f /etc/caddy/Caddyfile ]]; then
    while read -r h; do if remover_host "$h"; then ok "Endereço provisório $h desligado"; fi; done < <(sed -n 's/^# >>> Sintonia: \(.*\.sslip\.io\)$/\1/p' /etc/caddy/Caddyfile)
  fi
fi

# ---- 1. servidor web --------------------------------------------------------------------------------------
PRONTO_HTTPS=1
if caddy_proprio || [[ $PROXY_TIPO == nenhum ]]; then
  # o Caddy do Sintonia atende 80/443 (máquina só dele, ou ninguém mais usa essas portas)
  if compartilhado && [[ "$(cfg CADDY_PROPRIO 0)" != 1 ]]; then
    definir_env CADDY_PROPRIO 1
    aviso "Ninguém usa as portas 80/443 nesta máquina: o Caddy do Sintonia passa a atendê-las (HTTPS automático)."
  fi
  site="$(hosts_virgula)"
  definir_env SITE_ADDRESS "$site"
  definir_env ACME_EMAIL "$EMAIL"
  MODO_PROXY=caddy-proprio
else
  case $PROXY_TIPO in
    nginx) configurar_nginx ;;
    caddy) configurar_caddy_host ;;
    apache) configurar_apache ;;
    docker)
      if [[ $PROXY_DOCKER == nginx-proxy || $PROXY_DOCKER == caddy-docker-proxy ]] && [[ -n "$(cfg REDES_PROXY)" ]]; then
        definir_env HOSTS_PROXY "$(IFS=,; echo "${HOSTS[*]}")"
        ok "$PROXY_DESC: o app ganha os rótulos com o domínio; o proxy pega o certificado sozinho"
      elif [[ -n $PROXY_REDE_HOST ]]; then
        instrucoes "http://127.0.0.1:$PORTA"
        PRONTO_HTTPS=''
      else
        [[ -n "$(cfg REDES_PROXY)" ]] || definir_env REDES_PROXY "$(redes_do_proxy)"
        instrucoes "http://sintonia-app:$(cfg PORT 8787)   (o app entra na rede do proxy com esse nome)"
        PRONTO_HTTPS=''
      fi
      ;;
    *)
      instrucoes "http://127.0.0.1:$PORTA"
      PRONTO_HTTPS=''
      ;;
  esac
  definir_env ACME_EMAIL "$EMAIL"
  MODO_PROXY=$PROXY_TIPO
fi

# ---- 2. .env e imagem -------------------------------------------------------------------------------------
if [[ -z $PREVIA ]]; then
  definir_env DOMINIO "$DOM"
  definir_env PUBLIC_URL "https://$DOM"
  definir_env VITE_SITE_URL "https://$DOM"
  [[ $MODO_PROXY == caddy-proprio ]] || definir_env SITE_ADDRESS "$(hosts_virgula)"
fi
# (provisório: sem PUBLIC_URL nem VITE_SITE_URL — o site usa o endereço de cada página; nada muda no build)
if compartilhado; then gerar_compose_vps; fi

if [[ -n $PREVIA ]]; then
  # só recria os contêineres que mudaram (~3 s)
  dc up -d --no-build --remove-orphans
  esperar_saude 120 || morrer "O app não ficou saudável depois da mudança. Veja: $DIR_DEPLOY/status.sh"
elif [[ -n $SEM_REBUILD ]]; then
  dc up -d --no-build --remove-orphans
  esperar_saude 120 || morrer "O app não ficou saudável depois da mudança. Veja: $DIR_DEPLOY/status.sh"
else
  info "Reconstruindo a imagem com o endereço https://$DOM (o site continua no ar)"
  "$DIR_DEPLOY/update.sh" --sem-pull --forcar
fi

# ---- 3. conferência ---------------------------------------------------------------------------------------
if [[ -n $PRONTO_HTTPS ]]; then
  esquema=https porta_ver=443
  if [[ -n ${SEM_CERTIFICADO:-} ]]; then esquema=http porta_ver=80; fi
  info "Conferindo $esquema://$DOM"
  ok_https=''
  for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null --max-time 8 --resolve "$DOM:$porta_ver:127.0.0.1" "$esquema://$DOM/healthz" 2>/dev/null; then
      ok_https=1
      break
    fi
    sleep 3
  done
  if [[ -n $ok_https ]]; then
    ok "No ar: $esquema://$DOM   (painel: $esquema://$DOM/admin)"
    if [[ -n $PREVIA ]]; then aviso "Endereço PROVISÓRIO (fora do Google). Quando o domínio apontar: sudo $DIR_DEPLOY/dominio.sh seu-dominio.com.br"; fi
  else
    aviso "$esquema://$DOM ainda não respondeu (com certificado válido). Se o certificado é recente, espere 1–2 min e confira: sudo $DIR_DEPLOY/status.sh"
  fi
fi
