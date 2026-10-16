#!/usr/bin/env bash
# =====================================================================================================
# Sintonia — comandos do painel (/admin) pelo terminal da VPS: para a noite da eleição, ou quando o painel
# não abre no navegador. Fala com o app por DENTRO do contêiner, com a senha do .env (nada passa pela internet
# nem pela Cloudflare; a senha nunca aparece na tela). Cada chamada entra e sai do painel (login + logout).
#
#   sudo /opt/sintonia/deploy/painel.sh estado            fonte, fase no site, troca automática, aviso, TSE, versão
#   sudo /opt/sintonia/deploy/painel.sh tse               saúde do feed do TSE por disputa (seções, última leitura, erros)
#   sudo /opt/sintonia/deploy/painel.sh testar-tse        confere o feed do TSE agora (= "Testar conexão" do painel)
#
#   sudo /opt/sintonia/deploy/painel.sh trocar-agora      confere o feed e, se ele responder, troca a fonte para o TSE
#   sudo /opt/sintonia/deploy/painel.sh adiar 15          adia a troca automática em 15 min (a partir do horário marcado
#                                                         ou de agora, o que for mais tarde)
#   sudo /opt/sintonia/deploy/painel.sh marcar 17:30      marca a troca para 17:30 de hoje (Brasília); aceita também
#                                                         data e hora: 2026-10-25T17:30
#   sudo /opt/sintonia/deploy/painel.sh horario-padrao    volta ao horário padrão (17:00 de 25/10, ou o TSE_INICIO)
#   sudo /opt/sintonia/deploy/painel.sh desligar-troca    a fonte só muda à mão     ·   ligar-troca   rearma a troca
#
#   sudo /opt/sintonia/deploy/painel.sh fonte pre         volta para "Pré-eleição" (1º turno oficial + contagem)
#   sudo /opt/sintonia/deploy/painel.sh fonte tse         põe o TSE ao vivo SEM conferir o feed (prefira trocar-agora)
#
#   sudo /opt/sintonia/deploy/painel.sh aviso "texto"     publica um aviso discreto para todos os visitantes (≤ 280)
#   sudo /opt/sintonia/deploy/painel.sh alerta "texto"    idem, com destaque (use para instabilidade do TSE)
#   sudo /opt/sintonia/deploy/painel.sh sem-aviso         tira o aviso do site
#
#   sudo /opt/sintonia/deploy/painel.sh chat-estado       sala do chat: aberta/fechada, modo lento, fixada, pessoas, denúncias
#   sudo /opt/sintonia/deploy/painel.sh chat-abrir        abre a sala (em produção só recebe mensagens a partir das 17h de 25/10)
#   sudo /opt/sintonia/deploy/painel.sh chat-fechar       fecha a sala (emergência: enxurrada de desinformação, ataque)
#   sudo /opt/sintonia/deploy/painel.sh chat-limpar       apaga TODAS as mensagens da sala (as abas abertas também limpam)
#   sudo /opt/sintonia/deploy/painel.sh chat-lento 20     modo lento: segundos entre mensagens da mesma pessoa (3–300)
#   sudo /opt/sintonia/deploy/painel.sh chat-fixar "texto"  fixa uma mensagem no topo da sala · chat-sem-fixada tira
#
# A SIMULAÇÃO nunca é ligada por aqui (no site público ela não pode ir ao ar). Roteiro da noite: RUNBOOK-ELEICAO.md.
# Usa o mesmo login do painel: sujeito ao mesmo limite de tentativas (HTTP 429 → espere 1 min).
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

case ${1:-} in
  '' | -h | --help | ajuda)
    sed -n '2,35p' "$0"
    exit 0
    ;;
  estado | tse | testar-tse | trocar-agora | horario-padrao | desligar-troca | ligar-troca | sem-aviso) ;;
  chat-estado | chat-abrir | chat-fechar | chat-limpar | chat-sem-fixada) ;;
  chat-lento)
    [[ ${2:-} =~ ^[0-9]{1,3}$ && $2 -ge 3 && $2 -le 300 ]] || morrer "Use: painel.sh chat-lento <segundos>   (3 a 300; ex.: painel.sh chat-lento 20)"
    ;;
  chat-fixar)
    [[ -n ${2:-} ]] || morrer "Use: painel.sh chat-fixar \"texto\"   (para tirar: painel.sh chat-sem-fixada)"
    ;;
  adiar)
    [[ ${2:-} =~ ^[0-9]{1,4}$ && $2 -ge 1 ]] || morrer "Use: painel.sh adiar <minutos>   (ex.: painel.sh adiar 15)"
    ;;
  marcar)
    [[ -n ${2:-} ]] || morrer "Use: painel.sh marcar HH:MM   (horário de Brasília, hoje)   ou   painel.sh marcar 2026-10-25T17:30"
    ;;
  fonte)
    case ${2:-} in
      pre | tse) ;;
      simulacao | simulação | sim)
        morrer "A simulação NUNCA vai ao ar no site público (números fictícios). Ensaios: numa cópia do site, nunca aqui."
        ;;
      *) morrer "Use: painel.sh fonte pre   ou   painel.sh fonte tse" ;;
    esac
    ;;
  aviso | alerta)
    [[ -n ${2:-} ]] || morrer "Use: painel.sh $1 \"texto do aviso\"   (até 280 caracteres; para tirar: painel.sh sem-aviso)"
    ;;
  *) morrer "Comando desconhecido: $1 (use: painel.sh --help)" ;;
esac

exigir_docker
exigir_env
app_rodando || morrer "O app não está rodando. Veja: $DIR_DEPLOY/status.sh"

# O script abaixo roda no Node do contêiner do app (fetch para 127.0.0.1, senha lida do ambiente do contêiner).
read -r -d '' JS <<'NODE' || true
const [cmd, arg] = process.argv.slice(1);
const base = 'http://127.0.0.1:' + (process.env.PORT || 8787);
const TZ = 'America/Sao_Paulo';
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hora = (ms) => (ms == null ? '—' : fmt.format(ms).replace(',', ''));
const ok = (m) => console.log('✔ ' + m);
const falha = (m) => { console.error('✘ ' + m); process.exitCode = 1; };
let cookie = '';

async function req(caminho, corpo, timeout = 30000) {
  const r = await fetch(base + caminho, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeout),
  });
  let j = null;
  try { j = await r.json(); } catch { /* sem corpo JSON */ }
  return { status: r.status, ok: r.ok, j, r };
}

async function entrar() {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) throw new Error('ADMIN_PASSWORD está vazio no .env: em produção o painel fica desligado (503).');
  const { ok: certo, status, j, r } = await req('/api/admin/login', { senha });
  if (!certo) throw new Error(`login recusado (HTTP ${status}): ${j?.erro ?? ''}`);
  cookie = (r.headers.getSetCookie?.() ?? []).map((s) => s.split(';')[0]).join('; ');
}

async function comando(c) {
  const { ok: certo, status, j } = await req('/api/admin/command', c);
  if (!certo) throw new Error(`o servidor recusou o comando (HTTP ${status}): ${j?.erro ?? ''}`);
  return j;
}

const FONTES = { pre: 'Pré-eleição (1º turno oficial + contagem regressiva)', simulacao: 'SIMULAÇÃO (números fictícios)', tse: 'TSE ao vivo' };
const FASES = { pre: 'antes da apuração', apurando: 'apurando (ao vivo)', encerrada: 'apuração encerrada' };

function linhaTroca(t) {
  if (!t) return '(indisponível)';
  switch (t.estado) {
    case 'desabilitada': return 'DESABILITADA no servidor (TSE_AUTO=0 no .env): a fonte só muda à mão';
    case 'desligada': return 'desligada no painel: a fonte só muda à mão (religar: painel.sh ligar-troca)';
    case 'agendada': return `agendada para ${hora(t.inicio)}${t.adiada ? ` (mudada no painel; padrão ${hora(t.inicioPadrao)})` : ''}`;
    case 'verificando': return 'conferindo o feed do TSE agora…';
    case 'aguardando-tse':
      return `AGUARDANDO O TSE: ${t.tentativas} tentativa(s), a última às ${hora(t.ultimaTentativa)}; próxima às ${hora(t.proximaTentativa)}` +
        (t.ultimoErro ? `\n                    último erro: ${t.ultimoErro}` : '') +
        (t.avisoPublico ? '\n                    no site: "Aguardando os primeiros dados do TSE"' : '');
    case 'feita': return `feita em ${hora(t.feitaEm)}`;
    case 'nao-aplicavel': return 'não aplicada: no horário a fonte não era Pré-eleição';
    default: return t.estado;
  }
}

function resumoTse(h) {
  if (!h) return ['   (o feed do TSE só é lido com a fonte "TSE ao vivo")'];
  const linhas = [`   feed: ${h.ok ? 'ok' : 'COM FALHAS'} · ${h.rodando ? 'consultando' : 'parado'} a cada ${h.intervaloSeg} s` +
    (h.ultimoCiclo ? ` · último ciclo ${hora(h.ultimoCiclo.inicio)} (${h.ultimoCiclo.ms} ms, ${h.ultimoCiclo.erros} erro(s))` : '') +
    (h.esperaSeg && h.esperaSeg > h.intervaloSeg ? ` · ESPAÇADO para ${h.esperaSeg} s (TSE falhando)` : '')];
  const p = h.prioritario;
  if (p) {
    linhas.push(`   placar nacional (Presidente): ${p.ativo ? `a cada ${p.intervaloSeg} s` : 'no ciclo normal'} · lido às ${hora(p.ultimaLeituraOk)}` +
      (p.falhasConsecutivas ? ` · ${p.falhasConsecutivas} falha(s) seguida(s), próxima em ${p.esperaSeg} s` : '') +
      (p.atrasoMs && p.atrasoMs.mediana != null ? ` · atraso TSE→servidor ~${(p.atrasoMs.mediana / 1000).toFixed(1).replace('.', ',')} s` : ''));
  }
  for (const c of h.corridas ?? []) {
    const pct = c.secoes ? ((100 * c.secoesTotalizadas) / c.secoes).toFixed(2).replace('.', ',') + '%' : '—';
    let l = `   ${c.race.padEnd(7)} ${pct.padStart(8)} das seções · TSE às ${hora(c.ultimaAtualizacao)} · lido às ${hora(c.ultimoPollOk)}`;
    if (c.falhasConsecutivas) l += ` · ${c.falhasConsecutivas} falha(s) seguida(s)`;
    if (c.erro) l += ` · erro: ${String(c.erro).slice(0, 120)}`;
    if (c.ausentes?.length) l += ` · ainda sem arquivo no TSE: ${c.ausentes.join(', ')}`;
    linhas.push(l);
  }
  return linhas;
}

async function estado() {
  const { j: s } = await req('/api/admin/state');
  const st = s.status, sv = s.servidor ?? {};
  console.log('Fonte de dados:   ' + (FONTES[s.state.fonte] ?? s.state.fonte));
  console.log('Fase no site:     ' + (FASES[st.fase] ?? st.fase) + (st.simulacao ? '  ← SIMULAÇÃO NO AR' : ''));
  console.log('Troca automática: ' + linhaTroca(sv.trocaAuto));
  console.log('Aviso no site:    ' + (st.aviso ? `"${st.aviso.texto}" (${st.aviso.nivel})` : 'nenhum'));
  console.log('Simulação:        ' + (sv.simulacao?.permitida ? 'PERMITIDA (ALLOW_SIMULACAO=1) — tire essa linha do .env no site público' : 'bloqueada (correto no site público)'));
  const t = s.state.tse;
  console.log(`Códigos do TSE:   pleito ${t.pleito} · Presidente ${t.eleicaoPres} · Governador ${t.eleicaoGov} · a cada ${t.intervaloSeg} s`);
  console.log(`Versão:           estado ${s.state.versao} · build ${sv.build?.commit ?? '?'}` + (typeof st.pessoasAgora === 'number' ? ` · pessoas agora ~${st.pessoasAgora} (estimativa: origem ou sinal das páginas, o maior)` : ''));
  const { j: c } = await req('/api/admin/chat');
  console.log('Chat ao vivo:     ' + linhaChat(c));
  if (s.state.fonte === 'tse') {
    const { j: h } = await req('/api/admin/tse/health');
    console.log('TSE:');
    for (const l of resumoTse(h)) console.log(l);
  }
}

function linhaChat(c) {
  if (!c) return '(indisponível)';
  // travada pelo servidor (ex.: registro de envios configurado mas inválido): abrir é recusado até corrigir
  const sala = c.travada
    ? `TRAVADA fechada pelo servidor: ${c.travada}`
    : c.aberta
      ? c.bloqueio
        ? `ABERTA no painel, mas ainda sem receber mensagens: ${c.bloqueio}`
        : 'ABERTA (recebendo mensagens)'
      : 'fechada';
  return `${sala} · modo lento ${c.lentoS} s` + (c.fixada ? ` · fixada: "${c.fixada.texto}"` : ' · sem mensagem fixada') +
    (typeof c.pessoas === 'number' ? ` · ~${c.pessoas} pessoa(s) na sala` : '');
}

async function chat(corpo) {
  const { ok: certo, status, j } = corpo === undefined ? await req('/api/admin/chat') : await req('/api/admin/chat', corpo);
  if (!certo) throw new Error(`o servidor recusou o comando do chat (HTTP ${status}): ${j?.erro ?? ''}`);
  return j;
}

async function esperarTroca(limiteMs) {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const { j: s } = await req('/api/admin/state');
    const t = s.servidor?.trocaAuto;
    if (s.state.fonte === 'tse') return ok(`Fonte trocada para o TSE ao vivo (${linhaTroca(t)}).`);
    if (t?.estado === 'aguardando-tse' || Date.now() > fim) return falha('O feed do TSE não respondeu; a fonte continua Pré-eleição. ' + linhaTroca(t));
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function horarioDe(txt) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(txt);
  let iso = txt;
  if (m) {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
    iso = `${hoje}T${m[1].padStart(2, '0')}:${m[2]}:00-03:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(txt)) {
    iso = txt + (txt.length === 16 ? ':00' : '') + '-03:00';
  }
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`horário inválido: ${txt} (use HH:MM ou 2026-10-25T17:30, horário de Brasília)`);
  if (t <= Date.now()) throw new Error(`${hora(t)} já passou (para trocar já: painel.sh trocar-agora)`);
  return t;
}

(async () => {
  await entrar();
  try {
    switch (cmd) {
      case 'estado': await estado(); break;
      case 'tse': {
        const { j: h } = await req('/api/admin/tse/health');
        for (const l of resumoTse(h)) console.log(l);
        break;
      }
      case 'testar-tse': {
        const { j: r } = await req('/api/admin/tse/test', undefined, 40000);
        (r?.ok ? ok : falha)('Teste do feed do TSE: ' + (r?.detalhe ?? 'sem resposta'));
        break;
      }
      case 'trocar-agora': {
        const { j: s } = await req('/api/admin/state');
        if (s.state.fonte === 'tse') { ok('A fonte já é TSE ao vivo.'); break; }
        if (s.servidor?.trocaAuto?.estado === 'desabilitada') {
          falha('Troca automática desabilitada no servidor (TSE_AUTO=0). Use: painel.sh fonte tse');
          break;
        }
        // "agora" = religa, marca o horário para já e o servidor confere o feed antes de trocar (como o botão do painel)
        await comando({ tipo: 'troca-auto', acao: 'agora' });
        console.log('Conferindo o feed do TSE (até ~25 s)…');
        await esperarTroca(30000);
        break;
      }
      case 'adiar': {
        const { j: s } = await req('/api/admin/state');
        const t = s.servidor?.trocaAuto;
        const para = Math.max(t?.inicio ?? 0, Date.now()) + Number(arg) * 60000;
        const r = await comando({ tipo: 'troca-auto', acao: 'adiar', para });
        ok('Troca automática: ' + linhaTroca(r.servidor?.trocaAuto));
        break;
      }
      case 'marcar': {
        const r = await comando({ tipo: 'troca-auto', acao: 'adiar', para: horarioDe(arg) });
        ok('Troca automática: ' + linhaTroca(r.servidor?.trocaAuto));
        break;
      }
      case 'horario-padrao': {
        const r = await comando({ tipo: 'troca-auto', acao: 'adiar', para: null });
        ok('Troca automática: ' + linhaTroca(r.servidor?.trocaAuto));
        break;
      }
      case 'desligar-troca': {
        const r = await comando({ tipo: 'troca-auto', acao: 'desligar' });
        ok('Troca automática: ' + linhaTroca(r.servidor?.trocaAuto));
        break;
      }
      case 'ligar-troca': {
        const r = await comando({ tipo: 'troca-auto', acao: 'ligar' });
        ok('Troca automática: ' + linhaTroca(r.servidor?.trocaAuto));
        break;
      }
      case 'fonte': {
        const r = await comando({ tipo: 'fonte', fonte: arg });
        ok(`Fonte: ${FONTES[r.state.fonte]} · fase no site: ${FASES[r.status.fase] ?? r.status.fase} · troca automática: ${linhaTroca(r.servidor?.trocaAuto)}`);
        break;
      }
      case 'aviso':
      case 'alerta': {
        const r = await comando({ tipo: 'aviso', aviso: { nivel: cmd === 'alerta' ? 'alerta' : 'info', texto: arg } });
        ok(`Aviso no ar (${r.status.aviso?.nivel}): "${r.status.aviso?.texto}"`);
        break;
      }
      case 'chat-estado': {
        const c = await chat();
        console.log('Sala:        ' + linhaChat(c));
        console.log(`Mensagens:   ${c.mensagens?.length ?? 0} na sala · ${c.denunciadas?.length ?? 0} denunciada(s) para revisar · ${c.silenciados?.length ?? 0} silenciado(s)`);
        const rec = Object.entries(c.contadores?.recusadas ?? {}).map(([k, v]) => `${k} ${v}`).join(', ');
        console.log(`Desde ${hora(c.contadores?.desde)}: ${c.contadores?.publicadas ?? 0} publicada(s)` + (rec ? ` · recusadas: ${rec}` : ''));
        console.log('Moderar (apagar, silenciar, denúncias): painel /admin → Chat ao vivo.');
        break;
      }
      case 'chat-abrir': ok('Chat: ' + linhaChat(await chat({ acao: 'abrir' }))); break;
      case 'chat-fechar': ok('Chat: ' + linhaChat(await chat({ acao: 'fechar' }))); break;
      case 'chat-limpar': ok('Chat: todas as mensagens apagadas. ' + linhaChat(await chat({ acao: 'limpar' }))); break;
      case 'chat-lento': ok('Chat: ' + linhaChat(await chat({ acao: 'lento', segundos: Number(arg) }))); break;
      case 'chat-fixar': ok('Chat: ' + linhaChat(await chat({ acao: 'fixar', texto: arg }))); break;
      case 'chat-sem-fixada': ok('Chat: ' + linhaChat(await chat({ acao: 'fixar', texto: null }))); break;
      case 'sem-aviso': {
        const r = await comando({ tipo: 'aviso', aviso: null });
        ok('Aviso retirado.' + (r.status.aviso ? ` (continua o aviso automático: "${r.status.aviso.texto}")` : ''));
        break;
      }
    }
  } finally {
    await req('/api/admin/logout', {}).catch(() => {});
  }
})().catch((e) => falha(e.message));
NODE

dc exec -T app node -e "$JS" -- "$@"
