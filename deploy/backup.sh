#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — backup do volume STATE_DIR (estado do painel, anúncios, contatos, chat, histórico do TSE, audiência
# agregada e os PEDIDOS DE ANUNCIANTES — dados pessoais: nome, e-mail, WhatsApp) e do .env (senha do painel).
# Fica fora: o registro cifrado do chat (chat-registro/, por desenho).
#
#   sudo /opt/sintonia/deploy/backup.sh            → /var/backups/sintonia/sintonia-AAAAMMDD-HHMMSS.tar.gz
#   sudo /opt/sintonia/deploy/backup.sh --quieto   só mostra erros (é o que o cron de hora em hora usa)
#
#   BACKUP_DIR (padrão /var/backups/sintonia) e BACKUP_MANTER (padrão 72 arquivos = 3 dias) vêm do ambiente ou do .env.
# Permissão 600. Cópia fora da VPS (recomendado): SÓ a mais recente, CIFRADA, e apague as antigas em até 30 dias (é o
# que a /privacidade promete; DEPLOY §7):
#   ssh root@IP-DA-VPS 'ls -1t /var/backups/sintonia/sintonia-*.tar.gz | head -1'
#   scp root@IP-DA-VPS:/var/backups/sintonia/sintonia-AAAAMMDD-HHMMSS.tar.gz . && gpg -c sintonia-AAAAMMDD-HHMMSS.tar.gz && rm sintonia-AAAAMMDD-HHMMSS.tar.gz
# Restaurar: deploy/restore.sh <arquivo>
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

QUIETO=''
for a in "$@"; do
  case $a in
    --quieto | -q) QUIETO=1 ;;
    -h | --help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *) morrer "Opção desconhecida: $a (use --help)" ;;
  esac
done
dizer() { [[ -n $QUIETO ]] || ok "$@"; }

exigir_docker
exigir_env
DESTINO="$(cfg BACKUP_DIR /var/backups/sintonia)"
MANTER="$(cfg BACKUP_MANTER 72)"
[[ $MANTER =~ ^[0-9]+$ && $MANTER -ge 1 ]] || MANTER=72

umask 077
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/estado"

# copia o volume pelo próprio contêiner do app (não precisa saber o nome do volume); app parado → contêiner avulso
# chat-registro (registro cifrado dos envios do chat, se ligado): fica FORA do backup comum — dado sob sigilo, guardado
# só no volume e apagado sozinho depois de 6 meses (src/server/chat-registro.ts)
copiar='tar -C /var/lib/sintonia --exclude=*.tmp --exclude=./chat-registro --warning=no-file-changed -cf - .'
if app_rodando; then
  dc exec -T app sh -c "$copiar" | tar -C "$TMP/estado" -xf -
else
  dc run --rm --no-deps -T --entrypoint sh app -c "$copiar" | tar -C "$TMP/estado" -xf -
fi
cp "$ARQ_ENV" "$TMP/env"
{
  echo "Backup do Sintonia"
  echo "data: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "maquina: $(hostname)"
  echo "commit do codigo: $(commit_atual)"
  echo "commit da imagem no ar: $(revisao_rodando)"
  echo "arquivos do estado: $(cd "$TMP/estado" && find . -type f | sed 's#^\./##' | tr '\n' ' ')"
  if app_rodando; then echo "healthz: $(healthz 2>/dev/null || echo '?')"; fi
} >"$TMP/INFO.txt"

ARQ="$DESTINO/sintonia-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -C "$TMP" -czf "$ARQ.parcial" estado env INFO.txt
mv "$ARQ.parcial" "$ARQ"
chmod 600 "$ARQ"

# rotação: mantém os MANTER mais recentes
mapfile -t antigos < <(find "$DESTINO" -maxdepth 1 -name 'sintonia-*.tar.gz' -printf '%T@ %p\n' | sort -rn | awk -v n="$MANTER" 'NR > n {sub(/^[^ ]+ /, ""); print}')
if ((${#antigos[@]})); then rm -f -- "${antigos[@]}"; fi

dizer "Backup: $ARQ ($(du -h "$ARQ" | cut -f1); estado: $(find "$TMP/estado" -type f | wc -l) arquivo(s); mantidos os últimos $MANTER)"
