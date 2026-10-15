#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — restaura um backup feito pelo deploy/backup.sh.
#
#   sudo /opt/sintonia/deploy/restore.sh /var/backups/sintonia/sintonia-20261025-170000.tar.gz
#   sudo /opt/sintonia/deploy/restore.sh <arquivo> --com-env   restaura também o .env (máquina nova)
#   sudo /opt/sintonia/deploy/restore.sh <arquivo> -y          sem perguntar
#   sudo /opt/sintonia/deploy/restore.sh --listar              mostra os backups disponíveis
#
# Antes de restaurar, faz um backup do estado atual (dá para desfazer). O app fica parado ~5 s.
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ARQ='' COM_ENV='' SIM='' LISTAR=''
for a in "$@"; do
  case $a in
    --com-env) COM_ENV=1 ;;
    -y | --sim) SIM=1 ;;
    --listar) LISTAR=1 ;;
    -h | --help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    -*) morrer "Opção desconhecida: $a (use --help)" ;;
    *) ARQ=$a ;;
  esac
done

DESTINO="$(cfg BACKUP_DIR /var/backups/sintonia)"
if [[ -n $LISTAR || -z $ARQ ]]; then
  info "Backups em $DESTINO (mais recentes primeiro)"
  find "$DESTINO" -maxdepth 1 -name 'sintonia-*.tar.gz' -printf '%T@\t%TY-%Tm-%Td %TH:%TM\t%8k KB\t%p\n' 2>/dev/null |
    sort -rn | head -n 30 | cut -f2- || true
  [[ -n $LISTAR ]] && exit 0
  morrer "Diga qual arquivo restaurar: $0 <arquivo.tar.gz>"
fi

exigir_docker
[[ -f $ARQ ]] || morrer "Arquivo não encontrado: $ARQ"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -C "$TMP" -xzf "$ARQ" || morrer "Não consegui abrir $ARQ (corrompido?)"
[[ -d $TMP/estado && -f $TMP/INFO.txt ]] || morrer "$ARQ não parece um backup do Sintonia (faltam estado/ e INFO.txt)."

info "Conteúdo do backup"
sed 's/^/   /' "$TMP/INFO.txt"
if [[ -z $COM_ENV && ! -f $ARQ_ENV && -f $TMP/env ]]; then
  aviso "Não há .env nesta máquina: o do backup será restaurado também."
  COM_ENV=1
fi
if [[ -z $SIM ]]; then
  [[ -t 0 ]] || morrer "Sem terminal para confirmar: use -y."
  printf 'Restaurar este estado%s? O app fica parado por alguns segundos. [s/N] ' "${COM_ENV:+ e o .env}"
  read -r r
  [[ ${r,,} =~ ^(s|sim|y|yes)$ ]] || morrer "Cancelado."
fi

travar
cd "$RAIZ"
if [[ -f $ARQ_ENV ]] && app_rodando; then
  info "Backup do estado atual (para poder desfazer)"
  "$DIR_DEPLOY/backup.sh"
fi

if [[ -n $COM_ENV ]]; then
  [[ -f $TMP/env ]] || morrer "O backup não tem .env."
  ANTIGO=''
  if [[ -f $ARQ_ENV ]]; then
    ANTIGO="$DESTINO/env-antes-restauracao-$(date +%Y%m%d-%H%M%S)"
    (umask 077 && mkdir -p "$DESTINO")
    install -m 600 "$ARQ_ENV" "$ANTIGO"
  fi
  install -m 600 "$TMP/env" "$ARQ_ENV"
  ok ".env restaurado${ANTIGO:+ (o anterior foi guardado em $ANTIGO)}"
fi
exigir_env

# versão do estado no ar: a restaurada passa a ser maior que ela (a versão entra nos ETags e no &v= das URLs;
# voltar para um número já usado poderia casar com respostas antigas guardadas na CDN/navegadores)
V_ATUAL=''
if app_rodando; then V_ATUAL="$(healthz 2>/dev/null | sed -n 's/.*"versao":\([0-9]*\).*/\1/p' || true)"; fi

info "Restaurando o estado"
dc stop app >/dev/null 2>&1 || true
# shellcheck disable=SC2016 # o $V_ATUAL é do contêiner
tar -C "$TMP/estado" -cf - . | dc run --rm --no-deps -T -e "V_ATUAL=${V_ATUAL:-0}" --entrypoint sh app -c '
  set -e
  # preserva o registro cifrado dos envios do chat (guarda de 6 meses, Marco Civil; por desenho fora do backup) e a
  # chave PÚBLICA do registro (*.pem: um backup de antes da chave não a tem, e o .env atual aponta para ela)
  find /var/lib/sintonia -mindepth 1 -maxdepth 1 ! -name chat-registro ! -name "*.pem" -exec rm -rf {} +
  tar -C /var/lib/sintonia -xf -
  node -e "
    const fs = require(\"node:fs\"), f = \"/var/lib/sintonia/admin.json\", min = Number(process.env.V_ATUAL) || 0;
    try {
      const s = JSON.parse(fs.readFileSync(f, \"utf8\"));
      if (typeof s.versao === \"number\" && s.versao <= min) {
        s.versao = min + 1;
        fs.writeFileSync(f, JSON.stringify(s));
        console.log(\"versão do estado ajustada para \" + s.versao + \" (sempre crescente)\");
      }
    } catch {}
  "
  ls -la /var/lib/sintonia' 2>&1 | grep -v -E '^ ?Container .*(Creating|Created)' | sed 's/^/   /'

info "Subindo o app"
dc up -d --no-build
if esperar_saude 180; then
  ok "Restaurado e saudável: $(healthz 2>/dev/null || echo '?')"
else
  dc logs --tail 40 app || true
  morrer "O app não ficou saudável depois da restauração (logs acima)."
fi
