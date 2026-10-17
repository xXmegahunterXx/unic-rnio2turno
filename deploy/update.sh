#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — atualização com o site no ar.
#
#   sudo /opt/sintonia/deploy/update.sh              baixa o código novo (git pull), reconstrói e troca
#   sudo /opt/sintonia/deploy/update.sh --sem-pull   só reconstrói e troca (ex.: mudou o .env ou o VITE_SITE_URL)
#   sudo /opt/sintonia/deploy/update.sh --forcar     reconstrói mesmo sem código novo
#   sudo /opt/sintonia/deploy/update.sh --rollback   volta para a imagem anterior (a da última atualização); faz um
#                                                    backup do estado antes e TROCA as etiquetas: outro --rollback
#                                                    volta para a versão de onde se saiu
#   sudo /opt/sintonia/deploy/update.sh --qualquer-commit   publica a ponta do branch mesmo SEM "[deploy]" na mensagem
#
# Só publica sozinho um commit MARCADO: se a ponta do branch não tiver "[deploy]" na mensagem (ex.: "WIP … (não
# publicar)"), o script mostra o assunto e pergunta (no terminal) ou para (sem terminal). Para ir só até o último
# commit marcado, use: deploy/auto-update.sh rodar.
#
# Como funciona:
#   0. confere o disco (o do Docker; numa VPS compartilhada, dividido com o outro projeto): abaixo de DISCO_MIN_GB
#      (padrão 2) livres, limpa o cache de build sem uso há 3 dias e, se ainda faltar, para sem trocar nada;
#   1. a imagem nova é construída enquanto a atual continua servindo;
#   2. ENSAIO: um contêiner da imagem nova sobe ao lado do atual, sem receber visitantes, e precisa responder
#      ao /healthz — se não responder, nada é trocado (versão quebrada nunca chega ao público);
#   3. backup do estado (backup.sh) e a imagem atual vira "sintonia-app:anterior" (ponto de retorno);
#   4. troca: o contêiner do app é recriado (~2–4 s) e o Caddy segura as requisições nesse intervalo;
#   5. se mesmo assim o app novo não ficar saudável, se o contêiner no ar não for o da imagem nova (o "docker compose
#      up" falhou e o velho seguiu de pé) ou se o site respondia pelo servidor web antes da troca e parou de responder
#      depois, volta sozinho para a imagem anterior.
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PULL=1 FORCAR='' ROLLBACK='' QUALQUER=''
for a in "$@"; do
  case $a in
    --sem-pull) PULL='' ;;
    --forcar) FORCAR=1 ;;
    --rollback) ROLLBACK=1 ;;
    --qualquer-commit) QUALQUER=1 ;;
    -h | --help)
      sed -n '2,28p' "$0"
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
VPS_YML="$RAIZ/docker-compose.vps.yml"
VPS_YML_ANTES='' # cópia do docker-compose.vps.yml de antes desta atualização (VPS compartilhada)
trap 'docker rm -f "$CANARIO" >/dev/null 2>&1 || true; [[ -z $VPS_YML_ANTES ]] || rm -f "$VPS_YML_ANTES"' EXIT

# VPS compartilhada: o docker-compose.vps.yml volta ao de antes desta atualização (ela não chegou ao fim)
restaurar_vps_yml() {
  if [[ -n $VPS_YML_ANTES && -s $VPS_YML_ANTES ]] && ! cmp -s "$VPS_YML_ANTES" "$VPS_YML"; then
    cp -p "$VPS_YML_ANTES" "$VPS_YML"
    aviso "docker-compose.vps.yml voltou ao anterior (sem as mudanças desta atualização)."
  fi
}

# trocar [segundos]: sobe a imagem sintonia-app:latest e espera ficar saudável. Roda dentro de "if" (onde o set -e não
# vale): cada passo é conferido à mão. Volta 1 se o "docker compose up" falhou, se o app não ficou saudável ou se o
# contêiner no ar não é o da imagem latest (o compose cria o novo ANTES de tirar o velho: num "up" que falha — ex.:
# limite de CPU acima dos núcleos de uma VPS reduzida — o velho segue de pé e saudável).
trocar() {
  if ! dc up -d --no-build --remove-orphans; then
    erro "   o docker compose não recriou o app (mensagem acima)"
    return 1
  fi
  esperar_saude "${1:-180}" || return 1
  if ! app_na_imagem_latest; then
    erro "   o contêiner no ar não é o da imagem $IMAGEM:latest (commit $(revisao_imagem)); no ar: commit $(revisao_rodando)"
    return 1
  fi
}

# voltar_para_anterior [trocar]: sobe a imagem "anterior" como "latest".
#   - com "trocar" (o --rollback pedido à mão): as etiquetas TROCAM — a imagem de onde se voltou vira a "anterior". Um
#     novo --rollback volta para ela, e ela não fica sem etiqueta (no armazenamento do containerd, padrão do Docker 29,
#     imagem sem etiqueta some no próximo prune). Se a anterior não subir, "latest" volta para a imagem de antes;
#   - sem "trocar" (a atualização que falhou): a imagem nova, com defeito, perde a etiqueta e a "anterior" continua
#     sendo o ponto de retorno.
# As mensagens dizem o commit do contêiner que está NO AR (revisao_rodando), nunca o da etiqueta.
voltar_para_anterior() {
  local troca='' rev
  docker image inspect "$IMAGEM:anterior" >/dev/null 2>&1 || morrer "Não há imagem anterior ($IMAGEM:anterior) para voltar."
  restaurar_vps_yml
  if [[ ${1:-} == trocar ]] && docker image inspect "$IMAGEM:latest" >/dev/null 2>&1; then
    troca="$IMAGEM:volta-$$"
    docker tag "$IMAGEM:latest" "$troca"
  fi
  docker tag "$IMAGEM:anterior" "$IMAGEM:latest"
  if trocar 180; then
    if [[ -n $troca ]]; then
      docker tag "$troca" "$IMAGEM:anterior"
      docker image rm "$troca" >/dev/null 2>&1 || true # só tira a etiqueta
    fi
    ok "De volta à imagem anterior (commit $(revisao_rodando)). Site no ar."
    return 0
  fi
  dc logs --tail 40 app || true
  if [[ -n $troca ]]; then
    # "latest" volta para a imagem de antes do rollback: a próxima recriação do contêiner não troca de versão sozinha
    docker tag "$troca" "$IMAGEM:latest"
    docker image rm "$troca" >/dev/null 2>&1 || true
    if ! { app_na_imagem_latest && esperar_saude 10; }; then
      info "Subindo de novo a versão de antes do rollback"
      trocar 180 || true
    fi
    rev="$(revisao_rodando)"
    morrer "O rollback NÃO foi feito: a imagem anterior não subiu ou não ficou saudável (logs acima). No ar agora: commit ${rev:-nenhum (o app está parado)}. Veja: $DIR_DEPLOY/status.sh"
  fi
  rev="$(revisao_rodando)"
  morrer "Nem a imagem anterior ficou saudável. No ar agora: commit ${rev:-nenhum (o app está parado)}. Veja os logs acima e: $DIR_DEPLOY/status.sh"
}

# Disco: abaixo de DISCO_MIN_GB livres (padrão 2), limpa o cache de build sem uso há 3 dias (é só cache: contêineres,
# imagens e volumes, do Sintonia ou do outro projeto, não são tocados; no máximo um build dele fica mais lento) e, se
# ainda faltar, para antes do build — disco cheio derruba o banco do outro projeto e a gravação do estado do Sintonia.
DISCO_MIN="$(cfg DISCO_MIN_GB 2)"
[[ $DISCO_MIN =~ ^[0-9]+$ ]] || DISCO_MIN=2
DISCO_FOLGA="$(cfg DISCO_FOLGA_GB 4)"
[[ $DISCO_FOLGA =~ ^[0-9]+$ ]] || DISCO_FOLGA=4
garantir_disco() {
  local livre
  livre="$(disco_livre_mb)" || return 0 # sem como medir: segue
  ((livre >= DISCO_MIN * 1024)) && return 0
  aviso "Só $(mb_em_gb "$livre") GB livres no disco do Docker (mínimo para construir: $DISCO_MIN GB): limpando o cache de build sem uso há 3 dias (só cache; nenhum contêiner, imagem ou volume)"
  docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
  livre="$(disco_livre_mb)" || return 0
  ((livre >= DISCO_MIN * 1024)) && return 0
  morrer "Só $(mb_em_gb "$livre") GB livres no disco do Docker (mínimo: $DISCO_MIN GB): nada foi trocado, o site segue no ar. Veja o que ocupa: docker system df; df -h $(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /). Só o cache de build (sem afetar nada no ar): docker builder prune -f"
}

# ensaio [segundos]: contêiner avulso da imagem nova (mesma configuração e volume, sem portas e fora do DNS
# "app", logo sem visitantes) precisa ficar saudável. Ele nunca consulta o TSE nem faz a troca automática (o app no ar
# já consulta, do mesmo IP) e não grava audiência, métricas nem o histórico do TSE (SINTONIA_ENSAIO, main.ts).
ensaio() {
  local limite=$((SECONDS + ${1:-120})) est
  # SINTONIA_ENSAIO=1: o ensaio não grava audiência nem métricas no volume (não conta como "reinício" do dia)
  dc run -d --no-deps --name "$CANARIO" -e SINTONIA_ENSAIO=1 app >/dev/null
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
  docker image inspect "$IMAGEM:anterior" >/dev/null 2>&1 || morrer "Não há imagem anterior ($IMAGEM:anterior) para voltar."
  if app_rodando; then
    # a versão de destino pode regravar arquivos do estado sem o que ela não conhece (ex.: a v2 regrava o
    # audiencia.json sem a curva, os estados e as horas de tela da leva 3): o de agora fica guardado (RUNBOOK §3.5)
    "$DIR_DEPLOY/backup.sh" || aviso "O backup falhou; seguindo com o rollback (o volume do estado não é apagado)."
  fi
  # o limite de CPU acompanha os núcleos de AGORA (a VPS pode ter mudado de tamanho desde a última atualização: com o
  # limite antigo acima dos núcleos, o Docker recusa recriar o contêiner)
  regerar_compose_vps || true
  voltar_para_anterior trocar
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
  # Só commits MARCADOS vão ao ar sem perguntar: a ponta do branch pode ser trabalho em andamento ("não publicar")
  if [[ -z ${SINTONIA_ALVO:-} && -z $QUALQUER ]] && ! gitr merge-base --is-ancestor '@{u}' HEAD 2>/dev/null; then
    ASSUNTO="$(gitr log -1 --format=%s '@{u}' 2>/dev/null || true)"
    if [[ $ASSUNTO != *'[deploy]'* ]]; then
      aviso "O commit mais novo do GitHub NÃO está marcado para produção ([deploy]):"
      fraco "   $(gitr log -1 --format='%h %s' '@{u}' 2>/dev/null)"
      MARCADO="$(gitr log --format='%h %s' --grep='\[deploy\]' -n 1 'HEAD..@{u}' 2>/dev/null || true)"
      [[ -n $MARCADO ]] && fraco "   último marcado depois do que está aqui: $MARCADO (para ir só até ele: $DIR_DEPLOY/auto-update.sh rodar)"
      if [[ -t 0 ]]; then
        read -r -p "Publicar mesmo assim? [s/N] " RESP
        [[ $RESP =~ ^[sSyY]$ ]] || morrer "Nada foi trocado. Marque o commit com [deploy] ou use --qualquer-commit."
      else
        morrer "Nada foi trocado. Marque o commit com [deploy] ou rode com --qualquer-commit."
      fi
    fi
  fi
  # SINTONIA_ALVO: avança só até este commit (a atualização automática usa para publicar só versões marcadas)
  if ! gitr merge --ff-only --quiet "${SINTONIA_ALVO:-@{u\}}" 2>/dev/null; then
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
garantir_disco

# ---- 2. build (o site continua no ar) ---------------------------------------------------------------
info "Construindo a imagem nova (commit $COMMIT); o site continua no ar"
# A imagem no ar ganha a etiqueta "no-ar" antes do build: no armazenamento de imagens do containerd (padrão
# do Docker 29) imagem sem etiqueta some, e é com ela que se desfaz uma tentativa. Só vira "anterior" (ponto
# de retorno) depois que a nova passar no ensaio: uma tentativa que falha não apaga o ponto de retorno.
NO_AR="$IMAGEM:no-ar"
TEM_NO_AR=''
# o ponto de retorno de ANTES desta atualização: se ela falhar depois do ensaio (troca ou caminho público), o
# "anterior" volta a ele — senão anterior = latest e um --rollback não teria para onde ir
ANTERIOR_ANTES="$IMAGEM:anterior-antes"
TEM_ANTERIOR_ANTES=''
restaurar_anterior() {
  if [[ -n $TEM_ANTERIOR_ANTES ]]; then docker tag "$ANTERIOR_ANTES" "$IMAGEM:anterior"; fi
  docker image rm "$ANTERIOR_ANTES" >/dev/null 2>&1 || true # só tira a etiqueta
}
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

# ---- 2b. VPS compartilhada: docker-compose.vps.yml regerado do .env ----------------------------------------
# Traz o que mudou nos scripts (ex.: os limites de CPU e de processos da leva 3, I19). O ensaio já roda com ele; se a
# atualização não chegar ao fim, o arquivo volta ao de antes.
# Mantém o anterior se o novo não passar no "docker compose config" ou perder a rede/porta do proxy (regerar_compose_vps).
if compartilhado; then
  VPS_YML_ANTES="$(mktemp "${TMPDIR:-/tmp}/sintonia-vps-yml.XXXXXX")"
  if regerar_compose_vps "$VPS_YML_ANTES" && ! cmp -s "$VPS_YML_ANTES" "$VPS_YML"; then
    ok "docker-compose.vps.yml atualizado (limites: $(resumo_limites))"
  fi
fi

# ---- 3. ensaio --------------------------------------------------------------------------------------
info "Ensaio: subindo a imagem nova ao lado da atual, sem visitantes"
if ensaio 120; then
  ok "A imagem nova respondeu ao /healthz no ensaio"
  if [[ -n $TEM_NO_AR ]]; then
    if docker image inspect "$IMAGEM:anterior" >/dev/null 2>&1; then
      docker tag "$IMAGEM:anterior" "$ANTERIOR_ANTES"
      TEM_ANTERIOR_ANTES=1
    fi
    docker tag "$NO_AR" "$IMAGEM:anterior"
  fi
else
  desfazer_tag
  restaurar_vps_yml
  morrer "Nada foi trocado: o site segue no ar na versão anterior (commit ${REV_RODANDO:-?}). O código baixado (commit $COMMIT) tem um problema: quando houver correção no repositório, rode o update.sh de novo."
fi

# ---- 4. backup + troca ------------------------------------------------------------------------------
info "Backup do estado antes da troca"
if app_rodando; then
  "$DIR_DEPLOY/backup.sh" --quieto || aviso "O backup falhou; seguindo com a troca (o volume do estado não é apagado)."
fi

# o site responde pelo servidor web AGORA? (uma tentativa) — depois da troca, só é falha da versão nova se respondia antes
PUBLICO_ANTES=''
if verificar_publico 0; then PUBLICO_ANTES=1; fi

info "Trocando para a imagem nova"
if trocar 180; then
  ok "App novo saudável: $(healthz 2>/dev/null || echo '?')"
else
  erro "O app novo NÃO ficou saudável. Últimos logs:"
  dc logs --tail 60 app || true
  info "Voltando para a imagem anterior"
  voltar_para_anterior
  if [[ -n $TEM_NO_AR ]]; then docker image rm "$NO_AR" >/dev/null 2>&1 || true; fi # só tira a etiqueta
  restaurar_anterior
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
elif [[ -n $PUBLICO_ANTES ]]; then
  # respondia antes da troca e parou: a versão nova (ou o docker-compose.vps.yml regerado) cortou o caminho do proxy
  erro "$(url_publica) respondia pelo servidor web antes da troca e parou de responder com o app novo."
  info "Voltando para a imagem anterior"
  voltar_para_anterior
  if verificar_publico 30; then ok "Acesso público OK de novo ($(url_publica))"; else aviso "$(url_publica) segue sem responder pelo servidor web. Veja: $DIR_DEPLOY/status.sh"; fi
  if [[ -n $TEM_NO_AR ]]; then docker image rm "$NO_AR" >/dev/null 2>&1 || true; fi # só tira a etiqueta
  restaurar_anterior
  morrer "Atualização desfeita: o site segue na versão anterior. O código baixado (commit $COMMIT) cortou o acesso pelo servidor web: veja $DIR_DEPLOY/status.sh antes de tentar de novo."
else
  aviso "O app está saudável, mas $(url_publica) não respondeu pelo servidor web (já não respondia antes da troca). Veja: $DIR_DEPLOY/status.sh"
fi

# ---- 5. limpeza ---------------------------------------------------------------------------------------
if [[ -n $TEM_NO_AR ]]; then docker image rm "$NO_AR" >/dev/null 2>&1 || true; fi # só tira a etiqueta
docker image rm "$ANTERIOR_ANTES" >/dev/null 2>&1 || true                       # o ponto de retorno agora é a versão de antes
# só imagens do Sintonia (numa VPS com outros projetos, as imagens e o cache de build deles ficam como estão)
docker image prune -f --filter 'label=org.opencontainers.image.title=Sintonia' >/dev/null 2>&1 || true
if ! compartilhado; then
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
elif LIVRE="$(disco_livre_mb)" && ((LIVRE < DISCO_FOLGA * 1024)); then
  # VPS compartilhada: o cache de build é de todos os projetos — só com o disco apertado, e só o sem uso há 3 dias
  docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
  fraco "   disco com $(mb_em_gb "$LIVRE") GB livres: limpei o cache de build sem uso há 3 dias (agora: $(mb_em_gb "$(disco_livre_mb || echo 0)") GB livres)"
fi

ok "Atualizado: no ar o commit $(revisao_rodando) em $((SECONDS - T0)) s (anterior: ${REV_RODANDO:-?}; voltar: $0 --rollback)"
