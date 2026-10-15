#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — atualização automática: a cada 5 min confere se há código novo no GitHub e, se houver, roda o
# deploy/update.sh (que constrói ao lado, ensaia, troca sem tirar o site do ar e volta sozinho se falhar).
#
#   sudo /opt/sintonia/deploy/auto-update.sh ligar       agenda (cron) — vale a partir de agora
#   sudo /opt/sintonia/deploy/auto-update.sh desligar    para de atualizar sozinho
#   sudo /opt/sintonia/deploy/auto-update.sh estado      ligado?, última conferência, último resultado
#   sudo /opt/sintonia/deploy/auto-update.sh rodar       uma conferência agora (é o que o cron chama)
#
# Segurança:
#   - CONGELAMENTO na noite da eleição: entre AUTO_CONGELAR_DE e AUTO_CONGELAR_ATE (padrão: 25/10/2026 12:00 até
#     26/10/2026 06:00, Brasília) nada é atualizado sozinho — só à mão com update.sh. Mude no .env se precisar.
#   - um commit que falhou no update não é tentado de novo a cada 5 min (só quando chegar outro commit);
#   - nunca roda dois ao mesmo tempo (trava do update.sh) e registra tudo em /var/log/sintonia-auto-update.log.
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CRON=/etc/cron.d/sintonia-auto-update
LOG=/var/log/sintonia-auto-update.log
DIR_ESTADO=/var/lib/sintonia-auto-update
acao=${1:-estado}

registrar() { printf '%s %s\n' "$(date '+%d/%m %H:%M:%S')" "$*" >>"$LOG"; }

case $acao in
  ligar)
    [[ $EUID -eq 0 ]] || morrer "Rode como root."
    cat >"$CRON" <<CRON
# Sintonia: atualização automática (deploy/auto-update.sh). Desligar: $DIR_DEPLOY/auto-update.sh desligar
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root $DIR_DEPLOY/auto-update.sh rodar >/dev/null 2>&1
CRON
    chmod 644 "$CRON"
    install -d -m 700 "$DIR_ESTADO"
    registrar "ligado"
    ok "Atualização automática LIGADA: a cada 5 min confere o GitHub e, se houver versão nova, atualiza sem tirar o site do ar."
    fraco "   Congelada de $(cfg AUTO_CONGELAR_DE '2026-10-25T12:00:00-03:00') até $(cfg AUTO_CONGELAR_ATE '2026-10-26T06:00:00-03:00'). Log: $LOG"
    ;;
  desligar)
    [[ $EUID -eq 0 ]] || morrer "Rode como root."
    rm -f "$CRON"
    registrar "desligado"
    ok "Atualização automática DESLIGADA (atualize à mão com $DIR_DEPLOY/update.sh)."
    ;;
  estado)
    if [[ -f $CRON ]]; then ok "Atualização automática: LIGADA (a cada 5 min)"; else aviso "Atualização automática: desligada"; fi
    echo "   código local: $(commit_atual) · imagem no ar: $(revisao_rodando || true)"
    [[ -f $DIR_ESTADO/falhou ]] && aviso "   commit que falhou (não será tentado de novo): $(cat "$DIR_ESTADO/falhou")"
    if [[ -f $LOG ]]; then
      echo "   últimos registros:"
      tail -n 8 "$LOG" | sed 's/^/     /'
    fi
    ;;
  rodar)
    [[ $EUID -eq 0 ]] || morrer "Rode como root."
    install -d -m 700 "$DIR_ESTADO"
    exec 8>"$DIR_ESTADO/trava"
    flock -n 8 || exit 0 # uma conferência ainda rodando
    agora=$(date +%s)
    de=$(date -d "$(cfg AUTO_CONGELAR_DE '2026-10-25T12:00:00-03:00')" +%s 2>/dev/null || echo 0)
    ate=$(date -d "$(cfg AUTO_CONGELAR_ATE '2026-10-26T06:00:00-03:00')" +%s 2>/dev/null || echo 0)
    if ((agora >= de && agora < ate)); then
      exit 0 # congelado: noite da eleição
    fi
    if ! gitr fetch --quiet --prune 2>>"$LOG"; then
      registrar "sem acesso ao GitHub agora; tento de novo depois"
      exit 0
    fi
    local_=$(gitr rev-parse HEAD)
    remoto=$(gitr rev-parse '@{u}' 2>/dev/null || true)
    [[ -n $remoto && $local_ != "$remoto" ]] || exit 0
    # só avança (fast-forward); histórico divergente fica para quem cuida à mão
    if ! gitr merge-base --is-ancestor "$local_" "$remoto"; then
      registrar "o código desta máquina divergiu do GitHub: atualize à mão (git status)"
      exit 0
    fi
    curto=$(gitr rev-parse --short "$remoto")
    if [[ -f $DIR_ESTADO/falhou && "$(cat "$DIR_ESTADO/falhou")" == "$curto" ]]; then
      exit 0
    fi
    registrar "versão nova $curto: atualizando"
    if "$DIR_DEPLOY/update.sh" >>"$LOG" 2>&1; then
      rm -f "$DIR_ESTADO/falhou"
      registrar "no ar: $(commit_atual)"
    else
      echo "$curto" >"$DIR_ESTADO/falhou"
      registrar "FALHOU ao atualizar para $curto (o site seguiu na versão anterior); não tento este commit de novo"
    fi
    # log enxuto
    if [[ -f $LOG ]] && (($(wc -l <"$LOG") > 4000)); then tail -n 2000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
    ;;
  -h | --help) sed -n '2,17p' "$0" ;;
  *) morrer "Use: $0 ligar | desligar | estado | rodar" ;;
esac
