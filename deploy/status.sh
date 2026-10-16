#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — situação do servidor num relance: contêineres, saúde, fonte de dados, versão, CPU/memória,
# certificado, último backup e últimos logs.
#
#   sudo /opt/sintonia/deploy/status.sh            (LINHAS=50 para ver mais log)
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[[ ${1:-} == -h || ${1:-} == --help ]] && {
  sed -n '2,7p' "$0"
  exit 0
}

exigir_docker
exigir_env
cd "$RAIZ"
LINHAS=${LINHAS:-20}

if compartilhado; then
  detectar_proxy
  info "VPS compartilhada"
  echo "   app nesta máquina: http://127.0.0.1:$(cfg PORTA_LOCAL 8787) $(healthz_local >/dev/null 2>&1 && echo '(respondendo)' || echo '(SEM RESPOSTA)')"
  echo "   portas 80/443:     $PROXY_DESC"
  echo "   domínio:           $(cfg DOMINIO '(ainda nenhum — sudo '"$DIR_DEPLOY"'/dominio.sh seu-dominio.com.br)')"
  [[ -z "$(cfg ENDERECO_PREVIA)" ]] || echo "   provisório:        $(cfg ENDERECO_PREVIA)"
  arq="$(cfg CADDY_ARQ)"
  if [[ -n $arq ]]; then
    for h in $(cfg DOMINIO) $(cfg ENDERECO_PREVIA | sed 's|^https://||'); do
      if grep -qxF "# >>> Sintonia: $h" "$arq" 2>/dev/null; then
        echo "   Caddy da máquina:  bloco de $h presente em $arq"
      else
        aviso "   O bloco de $h SUMIU de $arq (o outro projeto regravou o arquivo?). Rode de novo: sudo $DIR_DEPLOY/dominio.sh $([[ $h == *.sslip.io ]] && echo --previa || echo "$h --sem-rebuild")"
      fi
    done
  fi
fi

info "Contêineres"
dc ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' || true

info "App"
if app_rodando; then
  # /healthz + /api/status lidos de dentro do contêiner e resumidos em português
  dc exec -T app node -e '
    const base = "http://127.0.0.1:" + (process.env.PORT || 8787);
    const pega = (p) => fetch(base + p, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    const FONTES = { pre: "pré-apuração (1º turno oficial + contagem regressiva)", simulacao: "SIMULAÇÃO (dados fictícios, sempre marcada)", tse: "TSE ao vivo" };
    Promise.all([pega("/healthz"), pega("/api/status").catch(() => null)]).then(([h, s]) => {
      const min = Math.floor(h.uptimeSeg / 60);
      console.log("   saúde:          " + (h.ok ? "ok" : "PROBLEMA"));
      // fase pública (a do /api/status: vira "encerrada" quando o TSE conclui); o /healthz traz a do motor
      const FASES = { pre: "antes da apuração", apurando: "apurando", encerrada: "encerrada" };
      const fase = (s && s.fase) || h.fase;
      console.log("   fonte de dados: " + (FONTES[h.fonte] || h.fonte) + " · fase no site: " + (FASES[fase] || fase));
      console.log("   versão admin:   " + h.versao + "  (sobe a cada comando do painel)");
      console.log("   no ar há:       " + (min >= 60 ? Math.floor(min / 60) + " h " + (min % 60) + " min" : min + " min"));
      console.log("   memória (RSS):  " + h.memoriaMb + " MB");
      if (h.tse) console.log("   feed do TSE:    " + (h.tse.ok ? "ok" : "COM FALHAS") + (h.tse.rodando ? " · consultando" : " · parado"));
      if (s && s.aviso && s.aviso.texto) console.log("   aviso no site:  " + s.aviso.texto);
      if (s && typeof s.pessoasAgora === "number") console.log("   pessoas agora:  ~" + s.pessoasAgora + " (estimativa: origem ou sinal das páginas, o maior)");
    }).catch((e) => { console.log("   /healthz não respondeu: " + e.message); process.exit(1); });
  ' || erro "O app não respondeu ao /healthz."
  est="$(docker inspect -f '{{.State.Health.Status}}' "$(ids_app | head -n 1)" 2>/dev/null || echo '?')"
  echo "   healthcheck:    $est"
  fraco "   troca automática, aviso e TSE por disputa: $DIR_DEPLOY/painel.sh estado"
else
  erro "O app NÃO está rodando. Suba com: cd $RAIZ && docker compose up -d   (e veja os logs abaixo)"
fi

info "Versão"
rev="$(revisao_rodando)"
id_app="$(ids_app | head -n 1 || true)"
criada="$([[ -n $id_app ]] && docker inspect -f '{{index .Config.Labels "org.opencontainers.image.created"}}' "$id_app" 2>/dev/null || true)"
echo "   imagem no ar:   commit ${rev:-?}${criada:+ (build $criada)}"
echo "   código local:   $(gitr log -1 --format='%h · %cd · %s' --date=format:'%d/%m %H:%M' 2>/dev/null || echo '?')"
echo "   branch:         $(gitr rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [[ -n $rev && $rev != "$(commit_atual)" ]]; then
  aviso "   O código local ($(commit_atual)) é diferente da imagem no ar ($rev): rode deploy/update.sh --sem-pull"
fi
if docker image inspect "$IMAGEM:anterior" >/dev/null 2>&1; then
  echo "   para voltar:    deploy/update.sh --rollback  (imagem anterior: commit $(revisao_imagem "$IMAGEM:anterior"))"
fi

info "Recursos"
mapfile -t cts < <(dc ps -q 2>/dev/null || true)
if ((${#cts[@]})); then
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}' "${cts[@]}" || true
fi
echo "   máquina: $(nproc) vCPU · carga $(cut -d' ' -f1-3 /proc/loadavg) · memória $(free -h | awk '/^Mem:/ {print $3 " usados de " $2}') · disco $(df -h "$RAIZ" | awk 'NR == 2 {print $4 " livres (" $5 " usado)"}')"

site="$(cfg SITE_ADDRESS "$(cfg DOMINIO)")"
host="${site%%,*}"
host="${host// /}"
if compartilhado && [[ -z "$(cfg DOMINIO)" ]]; then host=''; fi
if [[ -n $host && $host != :* && $host != localhost && $host != *.localhost && $host != http://* ]] && command -v openssl >/dev/null 2>&1; then
  info "Certificado HTTPS"
  porta="$(cfg HTTPS_PORT 443)"
  cert="$(echo | timeout 8 openssl s_client -connect "127.0.0.1:$porta" -servername "$host" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null || true)"
  if [[ -n $cert ]]; then
    echo "   $host · emissor: $(sed -n 's/^issuer=.*O *= *\([^,]*\).*/\1/p' <<<"$cert") · válido até $(sed -n 's/^notAfter=//p' <<<"$cert") ($(caddy_proprio && echo 'o Caddy renova sozinho' || echo 'renovação pelo servidor web da máquina'))"
  else
    aviso "   Não consegui ler o certificado de $host (ainda sendo emitido? $(caddy_proprio && echo 'veja os logs do caddy' || echo 'veja o servidor web da máquina'))."
  fi
fi

info "Último backup"
dir_bkp="$(cfg BACKUP_DIR /var/backups/sintonia)"
ultimo="$(find "$dir_bkp" -maxdepth 1 -name 'sintonia-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2- || true)"
if [[ -n $ultimo ]]; then
  echo "   $ultimo ($(date -r "$ultimo" '+%d/%m %H:%M'))"
else
  aviso "   Nenhum backup em $dir_bkp. Rode: $DIR_DEPLOY/backup.sh"
fi

info "Últimos logs do app"
dc logs --no-log-prefix --tail "$LINHAS" app 2>&1 | sed 's/^/   /' || true
caddy_proprio || exit 0
info "Avisos e erros recentes do Caddy"
dc logs --no-log-prefix --tail 300 caddy 2>&1 | grep -E '"level":"(warn|error)"' |
  grep -v -e 'requires TLS' -e 'listening only on the HTTP port' | tail -n 5 | cut -c1-240 | sed 's/^/   /' || echo "   (nenhum)"
