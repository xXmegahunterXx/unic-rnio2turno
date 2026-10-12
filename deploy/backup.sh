#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — backup do estado do painel (volume STATE_DIR: admin.json, tse-historico.json) e do .env.
#
#   sudo /opt/sintonia/deploy/backup.sh            → /var/backups/sintonia/sintonia-AAAAMMDD-HHMMSS.tar.gz
#   sudo /opt/sintonia/deploy/backup.sh --quieto   só mostra erros (é o que o cron de hora em hora usa)
#
#   BACKUP_DIR (padrão /var/backups/sintonia) e BACKUP_MANTER (padrão 72 arquivos) vêm do ambiente ou do .env.
# O arquivo tem a senha do painel (.env): fica com permissão 600. Para guardar fora da VPS (recomendado):
#   scp root@IP-DA-VPS:/var/backups/sintonia/sintonia-*.tar.gz .
# Restaurar: deploy/restore.sh <arquivo>
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

QUIETO=''
for a in "$@"; do
  case $a in
    --quieto | -q) QUIETO=1 ;;
    -h | --help)
      sed -n '2,13p' "$0"
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
copiar='tar -C /var/lib/sintonia --exclude=*.tmp --warning=no-file-changed -cf - .'
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
  echo "commit da imagem: $(revisao_imagem)"
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
