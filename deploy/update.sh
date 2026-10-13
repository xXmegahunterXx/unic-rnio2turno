#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — atualização com o site no ar.
#
#   sudo /opt/sintonia/deploy/update.sh              baixa o código novo (git pull), reconstrói e troca
#   sudo /opt/sintonia/deploy/update.sh --sem-pull   só reconstrói e troca (ex.: mudou o .env ou o VITE_SITE_URL)
#   sudo /opt/sintonia/deploy/update.sh --forcar     reconstrói mesmo sem código novo
#   sudo /opt/sintonia/deploy/update.sh --rollback   volta para a imagem anterior (a da última atualização)
#
# Como funciona:
#   1. a imagem nova é construída enquanto a atual continua servindo;
#   2. ENSAIO: um contêiner da imagem nova sobe ao lado do atual, sem receber visitantes, e precisa responder
#      ao /healthz — se não responder, nada é trocado (versão quebrada nunca chega ao público);
#   3. backup do estado (backup.sh) e a imagem atual vira "sintonia-app:anterior" (ponto de retorno);
#   4. troca: o contêiner do app é recriado (~2–4 s) e o Caddy segura as requisições nesse intervalo;
#   5. se mesmo assim o app novo não ficar saudável, volta sozinho para a imagem anterior.
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PULL=1 FORCAR='' ROLLBACK=''
for a in "$@"; do
  case $a in
    --sem-pull) PULL='' ;;
    --forcar) FORCAR=1 ;;
    --rollback) ROLLBACK=1 ;;
    -h | --help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *) morrer "Opção desconhecida: $a (use --help)" ;;
  esac
done

exigir_docker
exigir_env
travar
cd "$RAIZ"
T0=$SECONDS
CANARIO="sintonia-ensaio-$$"
trap 'docker rm -f "$CANARIO" >/dev/null 2>&1 || true' EXIT

trocar() { # sobe a imagem sintonia-app:latest e espera ficar saudável
  dc up -d --no-build --remove-orphans
  esperar_saude "${1:-180}"
}

voltar_para_anterior() {
  docker image inspect "$IMAGEM:anterior" >/dev/null 2>&1 || morrer "Não há imagem anterior ($IMAGEM:anterior) para voltar."
  docker tag "$IMAGEM:anterior" "$IMAGEM:latest"
  if trocar 180; then
    ok "De volta à imagem anterior (commit $(revisao_imagem)). Site no ar."
  else
    dc logs --tail 40 app || true
    morrer "Nem a imagem anterior ficou saudável. Veja os logs acima e: $DIR_DEPLOY/status.sh"
  fi
}

# ensaio [segundos]: contêiner avulso da imagem nova (mesma configuração e volume, sem portas e fora do DNS
# "app", logo sem visitantes) precisa ficar saudável. Na fonte TSE ele também consulta o TSE por ~10 s.
ensaio() {
  local limite=$((SECONDS + ${1:-120})) est
  dc run -d --no-deps --name "$CANARIO" app >/dev/null
  while ((SECONDS < limite)); do
    est="$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CANARIO" 2>/dev/null || echo sumiu/)"
    case $est in
      */healthy)
        docker stop -t 15 "$CANARIO" >/dev/null 2>&1 || true
        return 0
        ;;
      exited/* | dead/* | sumiu/* | */unhealthy) break ;;
    esac
    sleep 2
  done
  erro "A imagem nova não passou no ensaio (estado: ${est:-?}). Últimos logs dela:"
  docker logs --tail 40 "$CANARIO" 2>&1 | sed 's/^/   /' || true
  return 1
}

if [[ -n $ROLLBACK ]]; then
  info "Voltando para a imagem anterior"
  voltar_para_anterior
  exit 0
fi

# ---- 1. código --------------------------------------------------------------------------------------
ANTES="${SINTONIA_ANTES:-$(commit_atual)}"
REV_RODANDO="$(revisao_rodando)"
if [[ -n $PULL ]]; then
  info "Baixando o código novo"
  if [[ -n "$(gitr status --porcelain --untracked-files=no)" ]]; then
    gitr status --short --untracked-files=no
    morrer "Há arquivos do repositório alterados nesta máquina (acima). Guarde-os (git stash) ou desfaça (git checkout -- <arquivo>) e rode de novo."
  fi
  gitr fetch --quiet --prune
  if ! gitr merge --ff-only --quiet '@{u}' 2>/dev/null; then
    morrer "Não deu para avançar o código só com 'fast-forward' (histórico divergente). Veja: cd $RAIZ && git status"
  fi
  DEPOIS="$(commit_atual)"
  if [[ $ANTES == "$DEPOIS" ]]; then ok "Código já estava na versão mais recente ($DEPOIS)"; else ok "Código: $ANTES → $DEPOIS"; fi
  # o próprio update.sh (ou a lib.sh) mudou: segue com a versão nova dele
  if [[ $ANTES != "$DEPOIS" ]] && ! gitr diff --quiet "$ANTES" "$DEPOIS" -- deploy/update.sh deploy/lib.sh; then
    info "Os scripts de deploy mudaram: continuando com a versão nova"
    SINTONIA_ANTES="$ANTES" exec "$DIR_DEPLOY/update.sh" --sem-pull ${FORCAR:+--forcar}
  fi
  if [[ $DEPOIS == "$REV_RODANDO" && -z $FORCAR ]] && app_rodando; then
    ok "A imagem no ar já é a do commit $DEPOIS. Nada a fazer (use --forcar para reconstruir mesmo assim)."
    exit 0
  fi
fi
COMMIT="$(commit_atual)"

# ---- 2. build (o site continua no ar) ---------------------------------------------------------------
info "Construindo a imagem nova (commit $COMMIT); o site continua no ar"
# A imagem no ar ganha a etiqueta "no-ar" antes do build: no armazenamento de imagens do containerd (padrão
# do Docker 29) imagem sem etiqueta some, e é com ela que se desfaz uma tentativa. Só vira "anterior" (ponto
# de retorno) depois que a nova passar no ensaio: uma tentativa que falha não apaga o ponto de retorno.
NO_AR="$IMAGEM:no-ar"
TEM_NO_AR=''
if docker image inspect "$IMAGEM:latest" >/dev/null 2>&1; then
  docker tag "$IMAGEM:latest" "$NO_AR"
  TEM_NO_AR=1
fi
desfazer_tag() {
  if [[ -n $TEM_NO_AR ]]; then
    docker tag "$NO_AR" "$IMAGEM:latest"
    docker image rm "$NO_AR" >/dev/null 2>&1 || true # só tira a etiqueta
  fi
}
GIT_COMMIT="$COMMIT"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT BUILD_DATE
if ! dc build app; then
  desfazer_tag
  morrer "O build falhou (mensagens acima). Nada foi trocado: o site segue no ar na versão anterior."
fi

# ---- 3. ensaio --------------------------------------------------------------------------------------
info "Ensaio: subindo a imagem nova ao lado da atual, sem visitantes"
if ensaio 120; then
  ok "A imagem nova respondeu ao /healthz no ensaio"
  if [[ -n $TEM_NO_AR ]]; then docker tag "$NO_AR" "$IMAGEM:anterior"; fi
else
  desfazer_tag
  morrer "Nada foi trocado: o site segue no ar na versão anterior (commit ${REV_RODANDO:-?}). O código baixado (commit $COMMIT) tem um problema: quando houver correção no repositório, rode o update.sh de novo."
fi

# ---- 4. backup + troca ------------------------------------------------------------------------------
info "Backup do estado antes da troca"
if app_rodando; then
  "$DIR_DEPLOY/backup.sh" --quieto || aviso "O backup falhou; seguindo com a troca (o volume do estado não é apagado)."
fi

info "Trocando para a imagem nova"
if trocar 180; then
  ok "App novo saudável: $(healthz 2>/dev/null || echo '?')"
else
  erro "O app novo NÃO ficou saudável. Últimos logs:"
  dc logs --tail 60 app || true
  info "Voltando para a imagem anterior"
  voltar_para_anterior
  morrer "Atualização desfeita: o site segue na versão anterior. O código baixado (commit $COMMIT) tem um problema: quando houver correção no repositório, rode o update.sh de novo."
fi

# Caddyfile pode ter mudado no git pull: recarrega sem derrubar conexões (se inválido, o Caddy mantém o anterior)
if [[ -n "$(dc ps -q --status running caddy 2>/dev/null || true)" ]]; then
  if dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    ok "Configuração do Caddy recarregada"
  else
    aviso "O Caddy recusou a configuração nova (deploy/caddy/Caddyfile) e segue com a anterior. Veja: docker compose logs caddy"
  fi
fi

if verificar_publico 30; then
  ok "Acesso público OK ($(url_publica))"
else
  aviso "O app está saudável, mas $(url_publica) não respondeu pelo servidor web. Veja: $DIR_DEPLOY/status.sh"
fi

# ---- 5. limpeza ---------------------------------------------------------------------------------------
if [[ -n $TEM_NO_AR ]]; then docker image rm "$NO_AR" >/dev/null 2>&1 || true; fi # só tira a etiqueta
# só imagens do Sintonia (numa VPS com outros projetos, as imagens e o cache de build deles ficam como estão)
docker image prune -f --filter 'label=org.opencontainers.image.title=Sintonia' >/dev/null 2>&1 || true
if ! compartilhado; then docker builder prune -f --filter until=168h >/dev/null 2>&1 || true; fi

ok "Atualizado para o commit $COMMIT em $((SECONDS - T0)) s (anterior: ${REV_RODANDO:-?}; voltar: $0 --rollback)"
