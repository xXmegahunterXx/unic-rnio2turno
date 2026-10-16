#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — limites de CPU e de processos do app numa VPS compartilhada com outro projeto (I19, leva 3).
#
#   sudo /opt/sintonia/deploy/limites.sh            mostra os limites (configurados e em vigor)
#   sudo /opt/sintonia/deploy/limites.sh aplicar    regrava o docker-compose.vps.yml e aplica NA HORA, sem reiniciar
#                                                   o app (use depois de aumentar/diminuir a VPS: o limite acompanha
#                                                   o número de núcleos)
#   sudo /opt/sintonia/deploy/limites.sh desligar   tira os limites (grava LIMITE_RECURSOS=0 no .env), na hora
#   sudo /opt/sintonia/deploy/limites.sh ligar      volta aos limites, na hora
#
# Padrão: CPU = núcleos − 1 (mínimo 1), peso 512 (com a CPU disputada, o outro projeto tem prioridade) e até 512
# processos. Ajuste no .env: APP_CPUS (ex.: 2.5), APP_CPU_SHARES, APP_PIDS. Só na VPS compartilhada.
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CMD=${1:-estado}
case $CMD in
  -h | --help)
    sed -n '2,14p' "$0"
    exit 0
    ;;
  estado | aplicar | desligar | ligar) ;;
  *) morrer "Comando desconhecido: $CMD (use --help)" ;;
esac

exigir_docker
exigir_env
cd "$RAIZ"
VPS_YML="$RAIZ/docker-compose.vps.yml"

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

# "CPU 3 · peso 512 · processos 512" do contêiner, como o Docker está aplicando agora
em_vigor() {
  local n s p
  read -r n s p <<<"$(docker inspect -f '{{.HostConfig.NanoCpus}} {{.HostConfig.CpuShares}} {{if .HostConfig.PidsLimit}}{{.HostConfig.PidsLimit}}{{else}}0{{end}}' "$1" 2>/dev/null || echo '0 0 0')"
  if [[ $n =~ ^[0-9]+$ && $n -gt 0 ]]; then n="$(awk -v n="$n" 'BEGIN { printf "%g", n / 1e9 }')"; else n='sem limite'; fi
  [[ $s =~ ^[0-9]+$ && $s -gt 0 ]] || s='1024 (padrão)'
  [[ $p =~ ^[0-9]+$ && $p -gt 0 ]] || p='sem limite'
  printf 'CPU %s · peso %s · processos %s' "$n" "$s" "$p"
}

# o que deveria estar em vigor (sem limites: CPU em todos os núcleos ou sem limite, as duas valem)
confere() {
  if limites_ligados; then
    [[ $1 == "CPU $(awk -v n="$(limite_cpus)" 'BEGIN { printf "%g", n }') · peso $(limite_shares) · processos $(limite_pids)" ]]
  else
    [[ $1 == "CPU $(nucleos) · peso 1024 (padrão) · processos sem limite" || $1 == "CPU sem limite · peso 1024 (padrão) · processos sem limite" ]]
  fi
}

mostrar() {
  local id nome atual difere=''
  info "Limites do app"
  if ! compartilhado; then
    echo "   VPS só do Sintonia (modo exclusivo): sem limites, o app pode usar a máquina toda."
    return 0
  fi
  echo "   configurado: $(resumo_limites) (máquina com $(nucleos) núcleos)"
  for id in $(ids_app); do
    nome="$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | tr -d /)"
    atual="$(em_vigor "$id")"
    echo "   em vigor:    $atual ($nome)"
    confere "$atual" || difere=1
  done
  [[ -n "$(ids_app)" ]] || aviso "   O app não está rodando."
  if [[ -n $difere ]]; then
    aviso "   O que está em vigor difere do configurado (a VPS mudou de tamanho? o .env foi editado?). Aplique: sudo $0 aplicar"
    return 1
  fi
  return 0
}

aplicar() {
  compartilhado || morrer "Os limites só valem na VPS compartilhada (MODO_VPS=compartilhado no .env); nesta máquina o Sintonia está sozinho."
  travar
  local antes id args falhou=''
  antes="$(mktemp)"
  cp -p "$VPS_YML" "$antes" 2>/dev/null || : >"$antes"
  gerar_compose_vps
  if ! dc config -q >/dev/null 2>&1; then
    [[ -s $antes ]] && cp -p "$antes" "$VPS_YML"
    rm -f "$antes"
    morrer "O docker-compose.vps.yml novo não passou na conferência do Docker Compose (mantive o anterior). Veja: docker compose config"
  fi
  rm -f "$antes"
  if limites_ligados; then
    args=(--cpu-shares "$(limite_shares)")
    suporta_limite cpu && args+=(--cpus "$(limite_cpus)")
    suporta_limite pids && args+=(--pids-limit "$(limite_pids)")
  else
    # o Docker não volta a "sem limite" de CPU sem recriar o contêiner: todos os núcleos é o mesmo efeito
    args=(--cpu-shares 1024 --cpus "$(nucleos)")
    suporta_limite pids && args+=(--pids-limit -1)
  fi
  for id in $(ids_app); do
    if ! docker update "${args[@]}" "$id" >/dev/null; then
      falhou=1
      aviso "O Docker recusou mudar os limites de $(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | tr -d /) na hora; valem na próxima recriação (update.sh, ou: cd $RAIZ && docker compose up -d app)."
    fi
  done
  [[ -n $falhou ]] || ok "Aplicado na hora, sem reiniciar: $(resumo_limites)"
  fraco "   o docker-compose.vps.yml já tem os mesmos valores: valem também quando o contêiner for recriado"
}

case $CMD in
  estado) mostrar ;;
  aplicar)
    aplicar
    mostrar
    ;;
  desligar)
    compartilhado || morrer "Nesta VPS (modo exclusivo) não há limites a desligar."
    definir_env LIMITE_RECURSOS 0
    aplicar
    mostrar
    ;;
  ligar)
    compartilhado || morrer "Os limites só valem na VPS compartilhada (MODO_VPS=compartilhado no .env)."
    definir_env LIMITE_RECURSOS 1
    aplicar
    mostrar
    ;;
esac
