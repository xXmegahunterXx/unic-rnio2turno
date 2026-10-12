#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — atualização com o site no ar.
#
#   sudo /opt/sintonia/deploy/update.sh              baixa o código novo (git pull), reconstrói e troca
#   sudo /opt/sintonia/deploy/update.sh --sem-pull   só reconstrói e troca (ex.: mudou o .env ou o VITE_SITE_URL)
#   sudo /opt/sintonia/deploy/update.sh --forcar     reconstrói mesmo sem código novo
#   sudo /opt/sintonia/deploy/update.sh --rollback   volta para a imagem anterior (a da última atualização)
#
# Como funciona: a imagem nova é construída enquanto a atual continua servindo; antes da troca o estado é
# copiado (backup.sh) e a imagem atual vira "sintonia-app:anterior". Na troca o contêiner do app é recriado
# (~2–4 s) e o Caddy segura as requisições nesse intervalo (nenhum erro para o visitante). Se o app novo não
# ficar saudável em 3 min, volta sozinho para a imagem anterior.
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
      sed -n '2,14p' "$0"
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

if [[ -n $ROLLBACK ]]; then
  info "Voltando para a imagem anterior"
  voltar_para_anterior
  exit 0
fi

# ---- 1. código --------------------------------------------------------------------------------------
ANTES="$(commit_atual)"
REV_RODANDO="$(revisao_imagem)"
if [[ -n $PULL ]]; then
  info "Baixando o código novo"
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    git status --short --untracked-files=no
    morrer "Há arquivos do repositório alterados nesta máquina (acima). Guarde-os (git stash) ou desfaça (git checkout -- <arquivo>) e rode de novo."
  fi
  git fetch --quiet --prune
  if ! git merge --ff-only --quiet '@{u}' 2>/dev/null; then
    morrer "Não deu para avançar o código só com 'fast-forward' (histórico divergente). Veja: cd $RAIZ && git status"
  fi
  DEPOIS="$(commit_atual)"
  if [[ $ANTES == "$DEPOIS" ]]; then ok "Código já estava na versão mais recente ($DEPOIS)"; else ok "Código: $ANTES → $DEPOIS"; fi
  if [[ $DEPOIS == "$REV_RODANDO" && -z $FORCAR ]] && app_rodando; then
    ok "A imagem no ar já é a do commit $DEPOIS. Nada a fazer (use --forcar para reconstruir mesmo assim)."
    exit 0
  fi
fi
COMMIT="$(commit_atual)"

# ---- 2. build (o site continua no ar) ---------------------------------------------------------------
info "Construindo a imagem nova (commit $COMMIT); o site continua no ar"
if docker image inspect "$IMAGEM:latest" >/dev/null 2>&1; then
  docker tag "$IMAGEM:latest" "$IMAGEM:anterior"
fi
GIT_COMMIT="$COMMIT"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT BUILD_DATE
if ! dc build app; then
  if docker image inspect "$IMAGEM:anterior" >/dev/null 2>&1; then docker tag "$IMAGEM:anterior" "$IMAGEM:latest"; fi
  morrer "O build falhou (mensagens acima). Nada foi trocado: o site segue no ar na versão anterior."
fi

# ---- 3. backup + troca ------------------------------------------------------------------------------
info "Backup do estado antes da troca"
if app_rodando; then
  "$DIR_DEPLOY/backup.sh" --quieto || aviso "O backup falhou; seguindo com a troca (o volume do estado não é apagado)."
fi

info "Trocando para a imagem nova"
if trocar 180; then
  ok "App novo saudável: $(healthz 2>/dev/null || echo '?')"
else
  erro "O app novo NÃO ficou saudável em 3 min. Últimos logs:"
  dc logs --tail 60 app || true
  info "Voltando para a imagem anterior"
  voltar_para_anterior
  morrer "Atualização desfeita: o site segue na versão anterior. O código em $RAIZ está no commit $COMMIT; corrija e rode de novo (ou volte o código: git -C $RAIZ checkout $ANTES)."
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
  aviso "O app está saudável, mas $(url_publica) não respondeu pelo Caddy. Veja: $DIR_DEPLOY/status.sh"
fi

# ---- 4. limpeza ---------------------------------------------------------------------------------------
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true

ok "Atualizado para o commit $COMMIT em $((SECONDS - T0)) s (anterior: ${REV_RODANDO:-?}; voltar: $0 --rollback)"
