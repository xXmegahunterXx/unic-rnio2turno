#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — liga (ou troca) o domínio do site, inclusive numa VPS com outros projetos.
#
#   sudo /opt/sintonia/deploy/dominio.sh meudominio.com.br            o registro A do DNS já aponta para esta VPS
#   sudo /opt/sintonia/deploy/dominio.sh meudominio.com.br --www      também www.meudominio.com.br (crie o DNS do www)
#   sudo /opt/sintonia/deploy/dominio.sh --previa                     endereço PROVISÓRIO e só do Sintonia, com HTTPS,
#                                                                     sem domínio: https://sintonia.<ip-com-traços>.sslip.io
#                                                                     (fora do Google; o <ip>.sslip.io "puro" costuma ser
#                                                                     de outro projeto da máquina e nunca é tocado)
#   sudo /opt/sintonia/deploy/dominio.sh --remover <host>             tira o <host> do servidor web da máquina
#
# Opções: --email voce@exemplo.com (avisos do Let's Encrypt; opcional, pergunta se houver terminal)
#         --sem-dns (não confere o DNS: ex. Cloudflare com a nuvem laranja já ligada)   --sem-rebuild (não reconstrói a imagem)
#
# O que faz, conforme quem atende as portas 80/443 desta máquina (detectado sozinho):
#   - ninguém (ou a máquina é só do Sintonia): o Caddy do Sintonia atende o domínio com HTTPS automático;
#   - nginx / Apache instalados no sistema: cria UM arquivo de site só do Sintonia; Caddy (no sistema OU em
#     contêiner, com o Caddyfile montado do disco): acrescenta UM bloco marcado no Caddyfile. Sempre confere a
#     configuração inteira (nginx -t, caddy validate, apachectl configtest) ANTES de recarregar, pede o certificado
#     (certbot ou o próprio Caddy) e, se algo falhar, desfaz — os outros sites não são tocados e nada é reiniciado;
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
      [[ $# -ge 2 ]] || morrer "Faltou o e-mail depois de --email"
      EMAIL=$2
      shift
      ;;
    --email=*) EMAIL=${1#*=} ;;
    --previa) PREVIA=1 ;;
    --sem-dns) SEM_DNS=1 ;;
    --sem-rebuild) SEM_REBUILD=1 ;;
    --remover)
      [[ $# -ge 2 ]] || morrer "Faltou o endereço depois de --remover (ex.: --remover meudominio.com.br)"
      REMOVER=$2
      shift
      ;;
    -h | --help)
      sed -n '2,27p' "$0"
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
re_escapar() { printf '%s' "$1" | sed 's/[.[\*^$()+?{}|]/\\&/g'; } # texto literal dentro de um grep -E
tem_terminal() { [[ -z ${NAO_INTERATIVO:-} ]] && { : </dev/tty; } 2>/dev/null; }
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

# ---- Caddy (no sistema ou em contêiner) -------------------------------------------------------------------
# CF_HOST: o Caddyfile no disco desta máquina (é ele que editamos, sempre no lugar: um arquivo montado num
# contêiner continua o mesmo); CF_CT: o mesmo arquivo como o Caddy o vê; CADDY_CT: o contêiner (vazio = sistema).
# No sistema, o CLI usado é o binário do processo em execução, com o usuário e o ambiente dele ({$VAR} do Caddyfile).
CF_HOST='' CF_CT='' CADDY_CT='' CADDY_BIN=caddy CADDY_PID='' CADDY_UID='' CADDY_GID='' CADDY_ENV=()
caddy_x() {
  if [[ -n $CADDY_CT ]]; then
    docker exec "$CADDY_CT" caddy "$@"
  elif [[ -n $CADDY_PID ]]; then
    local como=()
    if [[ -n $CADDY_UID && $CADDY_UID != 0 ]] && command -v setpriv >/dev/null 2>&1; then
      como=(setpriv --reuid "$CADDY_UID" --regid "$CADDY_GID" --clear-groups)
    fi
    "${como[@]}" env -i "${CADDY_ENV[@]}" "$CADDY_BIN" "$@"
  else
    "$CADDY_BIN" "$@"
  fi
}
caddy_do_processo() { # binário, usuário e ambiente do Caddy do sistema em execução (pid $1)
  CADDY_PID=$1
  CADDY_BIN="$(readlink -f "/proc/$1/exe" 2>/dev/null || true)"
  [[ -x $CADDY_BIN ]] || CADDY_BIN="$(command -v caddy || echo caddy)"
  CADDY_UID="$(awk '/^Uid:/ {print $2}' "/proc/$1/status" 2>/dev/null)"
  CADDY_GID="$(awk '/^Gid:/ {print $2}' "/proc/$1/status" 2>/dev/null)"
  CADDY_ENV=()
  if [[ -r /proc/$1/environ ]]; then mapfile -d '' -t CADDY_ENV <"/proc/$1/environ"; fi
}
# A configuração NO AR é exatamente a do arquivo? Senão (mudanças pela API, --resume, arquivo editado e ainda não
# recarregado, outro arquivo) um reload trocaria a configuração viva do outro projeto: aí não mexemos.
caddy_arquivo_e_o_no_ar() {
  local adaptado admin vivo
  command -v python3 >/dev/null 2>&1 || return 1
  adaptado="$(caddy_x adapt --config "$CF_CT" --adapter caddyfile 2>/dev/null)" || return 1
  admin="$(python3 -c 'import json,sys; c=json.loads(sys.stdin.read()); a=c.get("admin") or {}; print("" if a.get("disabled") else (a.get("listen") or "localhost:2019"))' <<<"$adaptado" 2>/dev/null)" || return 1
  admin=${admin#tcp/}
  [[ -n $admin && $admin != unix/* ]] || return 1
  case $admin in :*) admin="127.0.0.1$admin" ;; 0.0.0.0:*) admin="127.0.0.1:${admin##*:}" ;; esac
  if [[ -n $CADDY_CT ]]; then
    vivo="$(docker exec "$CADDY_CT" wget -qO- -T 5 "http://$admin/config/" 2>/dev/null)" || return 1
  else
    vivo="$(curl -fsS --noproxy '*' --max-time 5 "http://$admin/config/" 2>/dev/null)" || return 1
  fi
  python3 -c '
import json, sys
a, v = (json.loads(x) for x in sys.argv[1:3])
sys.exit(0 if json.dumps(a, sort_keys=True) == json.dumps(v, sort_keys=True) else 1)' "$adaptado" "$vivo" 2>/dev/null
}
caddy_validar() { caddy_x validate --config "$CF_CT" --adapter caddyfile; }
caddy_recarregar() { # sem reiniciar nada: o Caddy troca a configuração no ar (se a nova falhar, segue a antiga)
  if [[ -z $CADDY_CT && -n $CADDY_PID ]] && servico_ativo caddy && [[ "$(systemctl show -p MainPID --value caddy 2>/dev/null)" == "$CADDY_PID" ]]; then
    systemctl reload caddy
  else
    caddy_x reload --config "$CF_CT" --adapter caddyfile
  fi
}
# o alvo gravado no .env por uma configuração anterior (para tirar/trocar o bloco depois)
caddy_alvo_salvo() {
  CF_HOST="$(cfg CADDY_ARQ)" CF_CT="$(cfg CADDY_CAMINHO)" CADDY_CT="$(cfg CADDY_CONTEINER)" CADDY_PID=''
  [[ -n $CF_HOST && -f $CF_HOST ]] || return 1
  CF_CT=${CF_CT:-$CF_HOST}
  if [[ -n $CADDY_CT ]]; then
    # contêiner sumiu/recriado com outro nome: sem ele não dá para validar nem recarregar
    docker inspect "$CADDY_CT" >/dev/null 2>&1 || return 1
  else
    detectar_proxy
    [[ $PROXY_TIPO == caddy && $PROXY_CADDYFILE == "$CF_HOST" && -n $PROXY_CADDY_PID ]] || return 1
    caddy_do_processo "$PROXY_CADDY_PID"
  fi
}
# acha o Caddyfile de um contêiner do Caddy: o --config do comando (sem ele, o Caddyfile da pasta de trabalho) e a
# montagem do disco que o contém → CF_HOST e CF_CT
caddyfile_do_conteiner() {
  local c=$1 cmd cfg='' wd tipo origem destino linhas=() l
  cmd="$(docker inspect -f '{{json .Config.Entrypoint}} {{json .Config.Cmd}} {{json .Args}}' "$c" 2>/dev/null)" || return 1
  # configuração pela API/autosave (--resume) ou JSON/outro adaptador: não editamos
  grep -qE '"--resume"' <<<"$cmd" && return 1
  grep -qE '"--adapter"[^"]*"(json|yaml|nginx)"' <<<"$cmd" && return 1
  cfg="$(grep -oE -- '"--config"[^"]*"[^"]+"|"--config=[^"]+"' <<<"$cmd" | head -n 1 | sed -E 's/^"--config"[^"]*"//; s/^"--config=//; s/"$//' || true)"
  wd="$(docker inspect -f '{{.Config.WorkingDir}}' "$c" 2>/dev/null)"
  [[ -n $cfg ]] || cfg=Caddyfile
  [[ $cfg == /* ]] || cfg="${wd:-/}/$cfg"
  cfg="${cfg//\/\//\/}"
  [[ $cfg != *.json ]] || return 1
  mapfile -t linhas < <(docker inspect -f '{{range .Mounts}}{{.Type}}|{{.Source}}|{{.Destination}}{{"\n"}}{{end}}' "$c" 2>/dev/null)
  for l in "${linhas[@]}"; do # 1º: o próprio arquivo montado
    IFS='|' read -r tipo origem destino <<<"$l"
    if [[ ($tipo == bind || $tipo == volume) && $destino == "$cfg" ]]; then
      CF_HOST=$origem CF_CT=$cfg
      [[ -f $CF_HOST ]] && return 0
    fi
  done
  for l in "${linhas[@]}"; do # 2º: a pasta que o contém
    IFS='|' read -r tipo origem destino <<<"$l"
    if [[ ($tipo == bind || $tipo == volume) && $cfg == "$destino"/* ]]; then
      CF_HOST="$origem${cfg#"$destino"}" CF_CT=$cfg
      [[ -f $CF_HOST ]] && return 0
    fi
  done
  return 1
}
caddy_backup() { # cópia íntegra do Caddyfile antes de mexer (fora da pasta do outro projeto) → $CF_BKP
  local d
  d="$(cfg BACKUP_DIR /var/backups/sintonia)/proxy"
  CF_BKP="$d/Caddyfile-$(date +%Y%m%d-%H%M%S)-$$"
  if ! { install -d -m 700 "$d" && cp -p -- "$CF_HOST" "$CF_BKP" && chmod 600 "$CF_BKP" && cmp -s -- "$CF_HOST" "$CF_BKP"; }; then
    rm -f "$CF_BKP"
    return 1
  fi
  # guarda as 30 mais recentes
  find "$d" -maxdepth 1 -name 'Caddyfile-*' -printf '%T@ %p\n' 2>/dev/null | sort -rn | tail -n +31 | cut -d' ' -f2- | xargs -r rm -f
}
caddy_restaurar() {
  if cat -- "$CF_BKP" >"$CF_HOST" && cmp -s -- "$CF_BKP" "$CF_HOST"; then return 0; fi
  erro "ATENÇÃO: não consegui devolver o Caddyfile. Restaure à mão: cat $CF_BKP > $CF_HOST"
  return 1
}
caddy_sem_bloco() { # imprime o Caddyfile sem o bloco do Sintonia para o host $1 (e sem a UMA linha em branco que o
  # bloco acrescentou antes dele). Marcador de fim faltando: imprime o arquivo intacto e devolve 1 (nunca corta até o fim)
  awk -v ini="# >>> Sintonia: $1" -v fim="# <<< Sintonia: $1" '
    { linha[NR] = $0 }
    END {
      a = 0; b = 0
      for (i = 1; i <= NR; i++) if (linha[i] == ini) { a = i; break }
      if (a) for (i = a + 1; i <= NR; i++) if (linha[i] == fim) { b = i; break }
      if (a && !b) { for (i = 1; i <= NR; i++) print linha[i]; exit 1 }
      for (i = 1; i <= NR; i++) {
        if (a && i >= a && i <= b) continue
        if (a && i == a - 1 && linha[i] == "") continue
        print linha[i]
      }
    }' "$CF_HOST"
}
caddy_aplicar() { # caddy_aplicar <arquivo novo> <descrição> → grava no lugar, valida, recarrega; desfaz se falhar
  local novo=$1 oque=$2 saida
  [[ -s $novo ]] || {
    erro "Configuração nova vazia (erro interno): nada foi alterado."
    return 1
  }
  if cmp -s -- "$novo" "$CF_HOST"; then return 0; fi # nada muda: nem grava nem recarrega
  if ! caddy_arquivo_e_o_no_ar; then
    erro "A configuração que o Caddy usa AGORA não é a do arquivo $CF_HOST (mudanças feitas pela API, arquivo editado e ainda não recarregado, ou outro arquivo). Recarregar trocaria a configuração do outro projeto: não mexo."
    return 3
  fi
  if [[ -n $CADDY_CT ]] && ! docker exec "$CADDY_CT" cat "$CF_CT" 2>/dev/null | cmp -s - "$CF_HOST"; then
    erro "O contêiner $CADDY_CT não enxerga $CF_HOST como está no disco (arquivo montado e depois substituído?): não mexo."
    return 3
  fi
  caddy_backup || {
    erro "Não consegui guardar uma cópia do Caddyfile antes de mexer (disco cheio?): nada foi alterado."
    return 1
  }
  if ! { cat -- "$novo" >"$CF_HOST" && cmp -s -- "$novo" "$CF_HOST"; }; then
    caddy_restaurar
    erro "Não consegui gravar o Caddyfile (disco cheio?). Desfeito."
    return 1
  fi
  if ! saida="$(caddy_validar 2>&1)"; then
    caddy_restaurar || return 1
    printf '%s\n' "$saida" | grep -vE '"level":"(info|debug)"' | tail -n 6 >&2 || true
    erro "O Caddy recusou $oque (acima). Desfeito: o Caddyfile voltou ao que era e nada mudou para os outros sites."
    return 1
  fi
  if ! saida="$(caddy_recarregar 2>&1)"; then
    caddy_restaurar || return 1
    printf '%s\n' "$saida" | tail -n 6 >&2 || true
    erro "O Caddy não recarregou (acima). Desfeito: o Caddyfile voltou ao que era e segue a configuração de antes."
    return 1
  fi
}
caddy_tirar_bloco() { # caddy_tirar_bloco <host>
  local tmp
  tmp="$(mktemp)"
  if ! caddy_sem_bloco "$1" >"$tmp"; then
    rm -f "$tmp"
    erro "O bloco do Sintonia para $1 está sem a linha de fim '# <<< Sintonia: $1': tire-o à mão do $CF_HOST."
    return 1
  fi
  caddy_aplicar "$tmp" "a remoção do bloco de $1" || {
    rm -f "$tmp"
    return 1
  }
  rm -f "$tmp"
}
caddy_aviso_git() { # o Caddyfile é versionado no git do outro projeto? (um deploy dele pode regravar o arquivo)
  if git -c safe.directory='*' -C "$(dirname "$CF_HOST")" ls-files --error-unmatch -- "$CF_HOST" >/dev/null 2>&1; then
    aviso "O $CF_HOST é versionado no git do outro projeto. Se um deploy dele regravar o arquivo, o bloco do Sintonia some: rode este comando de novo (ou acrescente o bloco também no repositório dele)."
  fi
}
configurar_caddy() { # configurar_caddy sistema|conteiner → 0 ok; 2 não dá para automatizar (instruções)
  local h tmp upstream rc ips
  if [[ $1 == conteiner ]]; then
    CADDY_CT=$PROXY_CONTEINER CADDY_PID=''
    if ! caddyfile_do_conteiner "$CADDY_CT"; then
      aviso "Não achei o Caddyfile do contêiner $CADDY_CT montado do disco desta máquina (Caddy configurado pela API/--resume ou por JSON?)."
      return 2
    fi
    if [[ -n $PROXY_REDE_HOST ]]; then
      upstream="127.0.0.1:$PORTA"
    else
      # pelo IP interno do Docker: o app não entra na rede do outro projeto
      garantir_ponte || return 2
      upstream="$(cfg IP_PONTE):$PORTA"
    fi
  else
    CADDY_CT='' CF_HOST=$PROXY_CADDYFILE CF_CT=$PROXY_CADDYFILE
    caddy_do_processo "$PROXY_CADDY_PID"
    upstream="127.0.0.1:$PORTA"
  fi
  caddy_validar >/dev/null 2>&1 || {
    aviso "O Caddyfile atual ($CF_HOST) não passa no caddy validate: não mexo nele assim."
    return 2
  }
  caddy_arquivo_e_o_no_ar || {
    aviso "A configuração que o Caddy usa agora não é a do arquivo $CF_HOST (API/--resume ou edição ainda não recarregada): não mexo nele."
    return 2
  }
  for h in "${HOSTS[@]}"; do
    if caddy_sem_bloco "$DOM" | grep -vE '^\s*#' | grep -E "(^|[[:space:],/])$(re_escapar "$h")([[:space:],:{]|$)" >/dev/null; then
      morrer "O Caddy já tem um site para $h (outro projeto). Escolha outro endereço ou tire esse site antes; não mexo nele."
    fi
  done
  tmp="$(mktemp)"
  caddy_sem_bloco "$DOM" >"$tmp" || {
    rm -f "$tmp"
    morrer "O bloco antigo do Sintonia no Caddyfile está sem a linha '# <<< Sintonia: $DOM' (editado à mão?). Arrume o arquivo; não mexo nele assim."
  }
  [[ -z "$(tail -c 1 "$tmp")" ]] || echo >>"$tmp" # termina com quebra de linha
  ips="${CF_IPS[*]}"
  {
    echo
    echo "# >>> Sintonia: $DOM"
    echo "$MARCA. Para remover: sudo $RAIZ/deploy/dominio.sh --remover $DOM"
    echo "$(hosts_virgula) {"
    if [[ -n $EMAIL ]]; then echo "	tls $EMAIL"; fi
    if [[ -n $WWW ]]; then
      echo "	@www host www.$DOM"
      echo "	redir @www https://$DOM{uri} 308"
    fi
    if [[ -n $PREVIA ]]; then echo '	header X-Robots-Tag "noindex, nofollow"'; fi
    echo "	# IP do visitante para o app: o CF-Connecting-IP só vale quando a conexão vem da Cloudflare"
    echo "	@sintonia_cf remote_ip $ips"
    echo "	@sintonia_direto not remote_ip $ips"
    echo "	vars @sintonia_cf sintonia_ip {http.request.header.CF-Connecting-IP}"
    echo "	vars @sintonia_direto sintonia_ip {remote_host}"
    echo "	reverse_proxy $upstream {"
    echo "		header_up X-Real-IP {http.vars.sintonia_ip}"
    echo "		header_up -CF-Connecting-IP"
    echo "		header_up -Fly-Client-IP"
    echo "		header_up -True-Client-IP"
    echo "		lb_try_duration 20s"
    echo "		lb_try_interval 250ms"
    echo "	}"
    echo "}"
    echo "# <<< Sintonia: $DOM"
  } >>"$tmp"
  rc=0
  caddy_aplicar "$tmp" "o bloco do Sintonia" || rc=$?
  rm -f "$tmp"
  ((rc == 0)) || exit 1
  definir_env CADDY_ARQ "$CF_HOST"
  definir_env CADDY_CAMINHO "$CF_CT"
  definir_env CADDY_CONTEINER "$CADDY_CT"
  ok "Bloco do Sintonia no Caddyfile $CF_HOST${CADDY_CT:+ (contêiner $CADDY_CT)}, entre '# >>> Sintonia' e '# <<< Sintonia'; recarregado sem reiniciar. O Caddy pede o certificado sozinho"
  caddy_aviso_git
}

# IP interno do Docker no .env (e a porta publicada nele), para um proxy em contêiner chegar ao app
garantir_ponte() {
  local ip
  ip="$(cfg IP_PONTE)"
  if [[ -z $ip ]]; then
    ip="$(ip_ponte_docker)"
    [[ -n $ip ]] || {
      aviso "Não achei o IP interno do Docker (rede bridge)."
      return 1
    }
    definir_env IP_PONTE "$ip"
  fi
  # instalação antiga: o app tinha entrado na rede do proxy; agora só o nginx-proxy precisa disso
  if [[ -n "$(cfg REDES_PROXY)" && "$(cfg PROXY_DOCKER)" != nginx-proxy ]]; then definir_env REDES_PROXY ""; fi
  gerar_compose_vps
  dc up -d --no-build --remove-orphans >/dev/null 2>&1 || true
}

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
  if caddy_alvo_salvo && [[ -f $CF_HOST ]] && grep -qxF "# >>> Sintonia: $h" "$CF_HOST"; then
    caddy_tirar_bloco "$h" && feito=0
  fi
  return $feito
}

if [[ -n $REMOVER ]]; then
  dominio_valido "$REMOVER" || morrer "Host inválido: $REMOVER"
  REMOVER=${REMOVER,,}
  if remover_host "$REMOVER"; then ok "$REMOVER tirado do servidor web da máquina"; else aviso "Nenhuma configuração do Sintonia para $REMOVER."; fi
  # o .env deixa de apontar para o endereço tirado (o app segue em 127.0.0.1)
  if [[ "$(cfg ENDERECO_PREVIA)" == "https://$REMOVER" ]]; then definir_env ENDERECO_PREVIA ""; fi
  if [[ "$(cfg DOMINIO)" == "$REMOVER" ]]; then
    definir_env DOMINIO ""
    definir_env PUBLIC_URL ""
    if compartilhado; then dc up -d --no-build --remove-orphans >/dev/null 2>&1 || true; fi
  fi
  exit 0
fi

# ---- qual endereço ------------------------------------------------------------------------------------
IP="$(ip_publico)"
if [[ -n $PREVIA ]]; then
  [[ -z "$(cfg DOMINIO)" ]] || morrer "Já existe um domínio configurado ($(cfg DOMINIO)): o endereço provisório é só para antes dele."
  [[ $IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || morrer "Não descobri o IP público desta VPS (precisa de internet para api.ipify.org)."
  # nome PRÓPRIO do Sintonia: o <ip>.sslip.io "puro" costuma já ser de outro projeto da máquina
  DOM="sintonia.${IP//./-}.sslip.io"
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
email_valido "$EMAIL" || EMAIL=''
# e-mail só é obrigatório para o Caddy do próprio Sintonia; certbot e Caddy da máquina funcionam sem
pedir_email() { # pedir_email obrigatorio|opcional
  if [[ -z $EMAIL ]] && tem_terminal; then
    printf '%s' "E-mail para avisos do certificado HTTPS (Let's Encrypt)$([[ $1 == opcional ]] && echo ' — Enter pula'): " >/dev/tty
    IFS= read -r EMAIL </dev/tty || true
    EMAIL="${EMAIL// /}"
    email_valido "$EMAIL" || EMAIL=''
  fi
  [[ $1 == opcional || -n $EMAIL ]] || morrer "Informe o e-mail do certificado: --email voce@exemplo.com"
}

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
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 install -y -qq certbot "python3-certbot-$1" >/dev/null
}
args_certbot() { # → certificado para todos os HOSTS, sem perguntas, com redirecionamento HTTP → HTTPS
  local h
  CERTBOT_ARGS=(--non-interactive --agree-tos --redirect --keep-until-expiring --cert-name "sintonia-$DOM")
  if [[ -n $EMAIL ]]; then CERTBOT_ARGS+=(-m "$EMAIL"); else CERTBOT_ARGS+=(--register-unsafely-without-email); fi
  for h in "${HOSTS[@]}"; do CERTBOT_ARGS+=(-d "$h"); done
}

# ---- nginx do sistema --------------------------------------------------------------------------------
configurar_nginx() {
  local dir link='' arq tmp ip6='' h cf=''
  nginx -t >/dev/null 2>&1 || morrer "A configuração atual do nginx já tem erro (nginx -t): corrija antes; não mexo em nada assim."
  [[ -n ${SEM_CERTIFICADO:-} ]] || { pedir_email opcional; certbot_pronto nginx; }
  for h in "${HOSTS[@]}"; do
    if nginx -T 2>/dev/null | grep -vE '^\s*#' | grep -E "server_name[^;]*[[:space:]]$(re_escapar "$h")[[:space:];]" >/dev/null &&
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

# ---- Apache do sistema --------------------------------------------------------------------------------
configurar_apache() {
  local arq="/etc/apache2/sites-available/sintonia-$DOM.conf" tmp aliases=''
  apachectl configtest >/dev/null 2>&1 || morrer "A configuração atual do Apache já tem erro (apachectl configtest): corrija antes."
  [[ -n ${SEM_CERTIFICADO:-} ]] || { pedir_email opcional; certbot_pronto apache; }
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
    # IP real atrás da Cloudflare (mod_remoteip: só vale quando a conexão vem da Cloudflare)
    RemoteIPHeader CF-Connecting-IP
$(for h in "${CF_IPS[@]}"; do echo "    RemoteIPTrustedProxy $h"; done)
    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
    RequestHeader unset CF-Connecting-IP
    RequestHeader unset Fly-Client-IP
    RequestHeader unset True-Client-IP
$([[ -n $PREVIA ]] && echo '    Header always set X-Robots-Tag "noindex, nofollow"')
$([[ -n $WWW ]] && printf '    <If "%%{HTTP_HOST} == '"'"'www.%s'"'"'">\n        Redirect 308 / https://%s/\n    </If>\n' "$DOM" "$DOM")
</VirtualHost>
APACHE
  a2enmod -q proxy proxy_http headers remoteip >/dev/null
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
      echo "     (Nginx Proxy Manager: Hosts → Proxy Hosts → Add Proxy Host; Scheme http, Forward Hostname '$(cfg IP_PONTE 172.17.0.1)',"
      echo "      Forward Port $PORTA, 'Block Common Exploits'; aba SSL: Request a new certificate + Force SSL + HTTP/2)"
      ;;
    traefik)
      echo "     (Traefik de painel — Coolify, Dokploy, EasyPanel —: cadastre o domínio por lá. Traefik avulso: no arquivo"
      echo "      dinâmico dele, um router Host(\`$DOM\`) com certResolver → serviço http://$(cfg IP_PONTE 172.17.0.1):$PORTA)"
      ;;
  esac
  echo "  Depois rode de novo este comando com --sem-rebuild para conferir."
}

# desliga endereços provisórios (*.sslip.io) do Sintonia, menos o $1 — só DEPOIS que o endereço novo está no ar
# (assim uma troca que falhe nunca deixa o site sem endereço nenhum)
desligar_previas() {
  local manter=${1:-} f h
  for f in /etc/nginx/sites-available/sintonia-*.sslip.io.conf /etc/nginx/conf.d/sintonia-*.sslip.io.conf /etc/apache2/sites-available/sintonia-*.sslip.io.conf; do
    [[ -e $f ]] || continue
    h="$(basename "$f" .conf)"
    h="${h#sintonia-}"
    [[ $h == *-le-ssl || $h == "$manter" ]] && continue
    if remover_host "$h"; then ok "Endereço provisório $h desligado"; fi
  done
  if caddy_alvo_salvo; then
    while read -r h; do
      [[ $h == "$manter" ]] && continue
      if remover_host "$h"; then ok "Endereço provisório $h desligado"; fi
    done < <(sed -n 's/^# >>> Sintonia: \(.*\.sslip\.io\)$/\1/p' "$CF_HOST")
  fi
}

# ---- 1. servidor web --------------------------------------------------------------------------------------
PRONTO_HTTPS=1
if caddy_proprio || [[ $PROXY_TIPO == nenhum ]]; then
  # o Caddy do Sintonia atende 80/443 (máquina só dele, ou ninguém mais usa essas portas)
  pedir_email obrigatorio
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
    caddy) configurar_caddy sistema ;;
    apache) configurar_apache ;;
    docker)
      rc_caddy=1
      if [[ $PROXY_DOCKER == caddy ]]; then
        configurar_caddy conteiner && rc_caddy=0 || rc_caddy=$?
      fi
      if ((rc_caddy == 0)); then
        :
      elif { [[ $PROXY_DOCKER == nginx-proxy ]] && [[ -n "$(cfg REDES_PROXY)" ]]; } || { [[ $PROXY_DOCKER == caddy-docker-proxy ]] && garantir_ponte; }; then
        definir_env HOSTS_PROXY "$(IFS=,; echo "${HOSTS[*]}")"
        ok "$PROXY_DESC: o app ganha os rótulos com o domínio; o proxy pega o certificado sozinho"
      elif [[ -n $PROXY_REDE_HOST ]]; then
        instrucoes "http://127.0.0.1:$PORTA"
        PRONTO_HTTPS=''
      elif garantir_ponte; then
        instrucoes "http://$(cfg IP_PONTE):$PORTA   (IP interno do Docker: o proxy em contêiner chega ao app por ele)"
        PRONTO_HTTPS=''
      else
        instrucoes "http://127.0.0.1:$PORTA"
        PRONTO_HTTPS=''
      fi
      ;;
    *)
      instrucoes "http://127.0.0.1:$PORTA"
      PRONTO_HTTPS=''
      ;;
  esac
  if [[ -n $EMAIL ]]; then definir_env ACME_EMAIL "$EMAIL"; fi
  MODO_PROXY=$PROXY_TIPO
fi

# ---- 2. .env e imagem -------------------------------------------------------------------------------------
if [[ -n $PREVIA ]]; then
  # o bloco/arquivo já está aplicado: o endereço vale mesmo que o certificado ainda esteja saindo
  definir_env ENDERECO_PREVIA "https://$DOM"
else
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
    # pelo 127.0.0.1 e, se o proxy só ouvir no IP público, por ele
    for destino in 127.0.0.1 ${IP:+"$IP"}; do
      if curl -fsS -o /dev/null --max-time 8 --noproxy '*' --resolve "$DOM:$porta_ver:$destino" "$esquema://$DOM/healthz" 2>/dev/null; then
        ok_https=1
        break 2
      fi
    done
    sleep 3
  done
  if [[ -n $ok_https ]]; then
    ok "No ar: $esquema://$DOM   (painel: $esquema://$DOM/admin)"
    if [[ -n $PREVIA ]]; then aviso "Endereço PROVISÓRIO (fora do Google). Quando o domínio apontar: sudo $DIR_DEPLOY/dominio.sh seu-dominio.com.br"; fi
  else
    aviso "$esquema://$DOM ainda não respondeu com certificado válido. O servidor web pede o certificado sozinho; em geral leva 1–2 min. Confira depois abrindo o endereço ou com: sudo $DIR_DEPLOY/status.sh"
  fi
fi

# ---- 4. endereços provisórios antigos ---------------------------------------------------------------------
if [[ -n $PREVIA ]]; then
  desligar_previas "$DOM" # um provisório de antes, com outro nome
elif [[ -n ${ok_https:-} ]]; then
  desligar_previas ""
  definir_env ENDERECO_PREVIA ""
elif [[ -n "$(cfg ENDERECO_PREVIA)" ]]; then
  aviso "O endereço provisório $(cfg ENDERECO_PREVIA) continua ligado até o domínio responder. Depois rode de novo: sudo $DIR_DEPLOY/dominio.sh $DOM --sem-rebuild"
fi
