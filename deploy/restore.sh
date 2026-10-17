#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — restaura um backup feito pelo deploy/backup.sh.
#
#   sudo /opt/sintonia/deploy/restore.sh /var/backups/sintonia/sintonia-20261025-170000.tar.gz
#   sudo /opt/sintonia/deploy/restore.sh <arquivo> --com-env   restaura também o .env (máquina nova)
#   sudo /opt/sintonia/deploy/restore.sh <arquivo> --so-admin  restaura SÓ o admin.json (painel: anúncios, contatos,
#                                                               fonte, aviso, troca); audiência, pedidos e chat ficam
#   sudo /opt/sintonia/deploy/restore.sh <arquivo> --so-audiencia   restaura SÓ o audiencia.json (medição: curva, estados,
#                                                               horas de tela; ex.: depois de um rollback para a v2)
#   sudo /opt/sintonia/deploy/restore.sh <arquivo> -y          sem perguntar
#   sudo /opt/sintonia/deploy/restore.sh --listar              mostra os backups disponíveis
#
# Antes de restaurar, faz um backup do estado atual (dá para desfazer). O app fica parado ~5 s; se algo falhar no meio,
# o app é religado (nunca termina com o site fora do ar) e o estado do volume só é trocado depois que o backup inteiro
# foi extraído.
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ARQ='' COM_ENV='' SIM='' LISTAR='' SO_ITEM=''
for a in "$@"; do
  case $a in
    --com-env) COM_ENV=1 ;;
    --so-admin) SO_ITEM=admin.json ;;
    --so-audiencia) SO_ITEM=audiencia.json ;;
    -y | --sim) SIM=1 ;;
    --listar) LISTAR=1 ;;
    -h | --help)
      sed -n '2,17p' "$0"
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
if [[ -n $SO_ITEM ]]; then
  [[ -z $COM_ENV ]] || morrer "--so-admin/--so-audiencia não combinam com --com-env."
  [[ -f $TMP/estado/$SO_ITEM ]] || morrer "$ARQ não tem $SO_ITEM."
fi

info "Conteúdo do backup"
sed 's/^/   /' "$TMP/INFO.txt"
if [[ -z $COM_ENV && -z $SO_ITEM && ! -f $ARQ_ENV && -f $TMP/env ]]; then
  aviso "Não há .env nesta máquina: o do backup será restaurado também."
  COM_ENV=1
fi
if [[ -z $SIM ]]; then
  [[ -t 0 ]] || morrer "Sem terminal para confirmar: use -y."
  if [[ -n $SO_ITEM ]]; then
    printf 'Restaurar SÓ o %s deste backup (o resto do estado fica como está)? O app fica parado por alguns segundos. [s/N] ' "$SO_ITEM"
  else
    printf 'Restaurar este estado%s? O app fica parado por alguns segundos. [s/N] ' "${COM_ENV:+ e o .env}"
  fi
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

# VPS compartilhada: o limite de CPU acompanha os núcleos de AGORA (a VPS pode ter sido reduzida desde a última
# atualização; com o limite antigo acima dos núcleos, o Docker recusa criar o contêiner e o app ficaria parado)
regerar_compose_vps || true
# o contêiner avulso da restauração tem a mesma configuração do app: se o Docker não o cria, para AQUI, com o app no ar
if ! dc run --rm --no-deps -T --entrypoint true app >/dev/null 2>&1; then
  dc run --rm --no-deps -T --entrypoint true app 2>&1 | tail -n 3 | sed 's/^/   /' || true
  morrer "O Docker não conseguiu criar um contêiner do app (mensagem acima): nada foi restaurado e o app segue no ar. Se a VPS mudou de tamanho: sudo $DIR_DEPLOY/limites.sh aplicar"
fi

info "Restaurando ${SO_ITEM:+só o $SO_ITEM de }o estado"
# daqui em diante, qualquer falha religa o app ao sair (nunca termina com o site fora do ar)
PARADO=1
religar() {
  [[ -n ${PARADO:-} ]] || return 0
  if ! app_rodando; then
    erro "A restauração não chegou ao fim: religando o app com o estado que está no volume (o de antes ficou no backup mostrado acima; para voltar a ele: $0 <esse arquivo>)."
    dc up -d --no-build >/dev/null 2>&1 || erro "Não consegui religar o app: cd $RAIZ && docker compose up -d (e $DIR_DEPLOY/status.sh)"
  fi
}
trap 'rm -rf "$TMP"; religar' EXIT
dc stop app >/dev/null 2>&1 || true
# --so-admin/--so-audiencia: só esse arquivo vai para o volume (o resto — audiência, pedidos, chat, histórico — fica)
ITENS=.
[[ -z $SO_ITEM ]] || ITENS="./$SO_ITEM"
# O backup é extraído primeiro numa pasta à parte, no próprio volume; só depois de extraído inteiro o estado atual é
# trocado (uma extração que falha no meio não deixa o volume pela metade).
# shellcheck disable=SC2016 # o $V_ATUAL e o $SO_ITEM são do contêiner
tar -C "$TMP/estado" -cf - "$ITENS" | dc run --rm --no-deps -T -e "V_ATUAL=${V_ATUAL:-0}" -e "SO_ITEM=${SO_ITEM:-}" --entrypoint sh app -c '
  set -e
  N=/var/lib/sintonia/.restauracao
  rm -rf "$N"
  mkdir -p "$N"
  tar -C "$N" -xf -
  # preserva o registro cifrado dos envios do chat (guarda de 6 meses, Marco Civil; por desenho fora do backup) e a
  # chave PÚBLICA do registro (*.pem: um backup de antes da chave não a tem, e o .env atual aponta para ela)
  if [ -z "$SO_ITEM" ]; then find /var/lib/sintonia -mindepth 1 -maxdepth 1 ! -name chat-registro ! -name "*.pem" ! -name .restauracao -exec rm -rf {} +; fi
  cp -a "$N/." /var/lib/sintonia/
  rm -rf "$N"
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
PARADO=''
if esperar_saude 180; then
  ok "Restaurado e saudável: $(healthz 2>/dev/null || echo '?')"
else
  dc logs --tail 40 app || true
  morrer "O app não ficou saudável depois da restauração (logs acima)."
fi
