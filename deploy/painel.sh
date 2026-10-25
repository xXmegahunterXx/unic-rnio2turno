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
#   sudo /opt/sintonia/deploy/painel.sh anuncios-estado   anúncios no ar, cadastrados (situação de cada um) e a suspensão
#   sudo /opt/sintonia/deploy/painel.sh anuncios-suspender "motivo"   TIRA TODOS os anúncios do ar em ~5 s (site, lives e
#                                                         imagens), sem apagar nada; o motivo (opcional, ≤ 140) vai ao registro
#   sudo /opt/sintonia/deploy/painel.sh anuncios-voltar   devolve exatamente o que estava no ar
#
#   CHAVES DA NOITE (as mesmas do painel → Controle; valem na hora para todos, sem publicar nada):
#   sudo /opt/sintonia/deploy/painel.sh chaves            mostra todas as chaves e o que está fora do padrão
#   sudo /opt/sintonia/deploy/painel.sh freio 2           FREIO DE CARGA: o site consulta 2× mais espaçado (2, 3 ou 5)
#   sudo /opt/sintonia/deploy/painel.sh freio 3 leve      idem 3×, e "leve": para o mapa por município e o "desde o 1º turno"
#                                                         e deixa o chat 2× mais lento
#   sudo /opt/sintonia/deploy/painel.sh freio 1           SOLTA o freio (ritmo normal)
#   sudo /opt/sintonia/deploy/painel.sh contador-publico ligar|desligar   "N pessoas agora" no site (só a partir de 500)
#   sudo /opt/sintonia/deploy/painel.sh html-borda ligar|desligar   HTML guardado na Cloudflare: só depois do ensaio
#                                                         (24/10, 12h); antes de publicar versão nova, desligar e esperar 30 s
#   sudo /opt/sintonia/deploy/painel.sh medir-anuncios ligar|desligar     contar as impressões dos anúncios
#   sudo /opt/sintonia/deploy/painel.sh texto-bots ligar|desligar   !apuracao dos bots de chat (desligado: só o endereço)
#   sudo /opt/sintonia/deploy/painel.sh contar-lives ligar|desligar contagem anônima de lives
#   sudo /opt/sintonia/deploy/painel.sh aviso-nacional auto|off     aviso "o arquivo nacional do TSE não atualiza desde…"
#   PEÇAS NOVAS DA NOITE (todas ligadas por padrão; desligar volta ao site de antes delas):
#   sudo /opt/sintonia/deploy/painel.sh faixa-conexao ligar|desligar faixa "Conexão instável" no site (o recuo continua)
#   sudo /opt/sintonia/deploy/painel.sh carimbo-print ligar|desligar carimbo "domínio · % apurado · hora" nos mapas e no placar
#   sudo /opt/sintonia/deploy/painel.sh meta-placar ligar|desligar   placar na descrição dos links (WhatsApp, X)
#   sudo /opt/sintonia/deploy/painel.sh medir-local ligar|desligar   audiência por estado, país e aparelho
#   sudo /opt/sintonia/deploy/painel.sh projecao ligar|desligar      "Projeção do Sintonia" (estimativa do resultado final)
#                                                         atalhos: painel.sh projecao-on  ·  painel.sh projecao-off
#   sudo /opt/sintonia/deploy/painel.sh pausa-tse auto|restrita|off  pausa quando o TSE bloqueia: auto (padrão); restrita =
#                                                         só 429 ou borda do TSE; off = nunca pausa (risco maior de bloqueio)
#   sudo /opt/sintonia/deploy/painel.sh tse-retomar       retoma JÁ as leituras do TSE pausadas por bloqueio (falso positivo)
#   sudo /opt/sintonia/deploy/painel.sh alerta-teste      manda uma mensagem de teste ao Telegram dos alertas
#
# A SIMULAÇÃO nunca é ligada por aqui (no site público ela não pode ir ao ar). Roteiro da noite: RUNBOOK-ELEICAO.md.
# Usa o mesmo login do painel: sujeito ao mesmo limite de tentativas (HTTP 429 → espere 1 min).
# =====================================================================================================
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# atalhos da projeção: projecao-on / projecao-off = projecao ligar / projecao desligar
case ${1:-} in
  projecao-on) set -- projecao ligar ;;
  projecao-off) set -- projecao desligar ;;
esac

case ${1:-} in
  '' | -h | --help | ajuda)
    sed -n '2,/^# =====/p' "$0"
    exit 0
    ;;
  estado | tse | testar-tse | trocar-agora | horario-padrao | desligar-troca | ligar-troca | sem-aviso) ;;
  chat-estado | chat-abrir | chat-fechar | chat-limpar | chat-sem-fixada) ;;
  anuncios-estado | anuncios-voltar) ;;
  anuncios-suspender) ;; # o motivo é opcional (≤ 140 caracteres; o servidor confere)
  chaves | tse-retomar | alerta-teste) ;;
  freio)
    [[ ${2:-} =~ ^[1235]$ ]] || morrer "Use: painel.sh freio 2   (1 = solta; 2, 3 ou 5; acrescente \"leve\" para o modo leve: painel.sh freio 3 leve)"
    [[ -z ${3:-} || ${3:-} == leve ]] || morrer "Use: painel.sh freio $2 leve   (ou sem o \"leve\")"
    ;;
  contador-publico | html-borda | medir-anuncios | texto-bots | contar-lives | faixa-conexao | carimbo-print | meta-placar | medir-local | projecao)
    [[ ${2:-} =~ ^(ligar|desligar)$ ]] || morrer "Use: painel.sh $1 ligar   ou   painel.sh $1 desligar"
    ;;
  pausa-tse)
    [[ ${2:-} =~ ^(auto|restrita|off)$ ]] || morrer "Use: painel.sh pausa-tse auto   (ou restrita, ou off)"
    ;;
  aviso-nacional)
    [[ ${2:-} =~ ^(auto|off)$ ]] || morrer "Use: painel.sh aviso-nacional auto   ou   painel.sh aviso-nacional off"
    ;;
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
const [cmd, arg, arg2] = process.argv.slice(1);
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
  const linhas = [];
  // I03: pausa por bloqueio do TSE (429, 403 da borda dele) e o teto de pedidos por segundo
  const ate = h.bloqueadoAte ?? h.bloqueio?.ate;
  if (h.bloqueio || ate) {
    linhas.push(`   TSE LIMITANDO AS LEITURAS${h.bloqueio?.motivoTexto ? ` (${h.bloqueio.motivoTexto})` : ''}: pausa até ${hora(ate)}` +
      ' · falso positivo? painel.sh tse-retomar');
  }
  if (h.http && typeof h.http.limitePorSeg === 'number') {
    linhas.push(`   pedidos ao TSE: teto ${h.http.limitePorSeg}/s` +
      (h.http.ritmo ? ` · últimos 10 s: ${h.http.ritmo.ultimos10s} · pico ${h.http.ritmo.picoSeg}/s` : '') +
      (h.http.bloqueios ? ` · ${h.http.bloqueios} bloqueio(s) desde o início` : ''));
  }
  linhas.push(`   feed: ${h.ok ? 'ok' : 'COM FALHAS'} · ${h.rodando ? 'consultando' : 'parado'} a cada ${h.intervaloSeg} s` +
    (h.ultimoCiclo ? ` · último ciclo ${hora(h.ultimoCiclo.inicio)} (${h.ultimoCiclo.ms} ms, ${h.ultimoCiclo.erros} erro(s))` : '') +
    (h.esperaSeg && h.esperaSeg > h.intervaloSeg ? ` · ESPAÇADO para ${h.esperaSeg} s (TSE falhando)` : ''));
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

// ---- chaves da noite (leva 3; padrões = CHAVES_NOITE_PADRAO em src/shared/chaves-noite.ts) ----------------------
const PADRAO_NOITE = {
  freio: { fator: 1, leve: false }, contadorPublico: true, htmlBorda: false, medirAnuncios: true, avisoNacional: 'auto', textoBots: true, contarLives: true,
  faixaConexao: true, carimboPrint: true, metaPlacar: true, medirLocal: true, pausaTse: 'auto', projecao: true,
};
/** comando → [campo em AdminState.noite, rótulo] */
const CHAVES = {
  'contador-publico': ['contadorPublico', '"Pessoas agora" no site'],
  'html-borda': ['htmlBorda', 'HTML guardado na borda'],
  'medir-anuncios': ['medirAnuncios', 'Medição das impressões dos anúncios'],
  'texto-bots': ['textoBots', 'Texto do placar para bots de chat'],
  'contar-lives': ['contarLives', 'Contagem de lives'],
  'faixa-conexao': ['faixaConexao', 'Faixa "Conexão instável" no site'],
  'carimbo-print': ['carimboPrint', 'Carimbo nos mapas e no placar'],
  'meta-placar': ['metaPlacar', 'Placar na prévia dos links'],
  'medir-local': ['medirLocal', 'Medição por estado, país e aparelho'],
  projecao: ['projecao', 'Projeção do Sintonia'],
};
const PAUSA_TSE = {
  auto: 'automática (429, borda do TSE ou 403 num arquivo já lido)',
  restrita: 'SÓ COM SINAL CLARO (429 ou borda do TSE)',
  off: 'DESLIGADA (nunca pausa: risco maior de bloqueio)',
};
const EXPLICA = {
  contadorPublico: (v) => (v ? 'o site mostra "N pessoas agora" a partir de 500 pessoas' : 'o site não mostra (o painel vê)'),
  htmlBorda: (v) => (v ? 'a Cloudflare guarda as páginas por 15 s · antes de publicar versão nova: painel.sh html-borda desligar e esperar 30 s' : 'as páginas não ficam guardadas na Cloudflare'),
  medirAnuncios: (v) => (v ? 'impressões contadas' : 'impressões NÃO contadas (o relatório dos anunciantes fica sem esse período)'),
  textoBots: (v) => (v ? '!apuracao responde o placar' : '!apuracao responde só o endereço do site'),
  contarLives: (v) => (v ? 'lives contadas (anônimo)' : 'lives não contadas'),
  faixaConexao: (v) => (v ? 'o site avisa quando o servidor não responde' : 'sem a faixa (o site só espera)'),
  carimboPrint: (v) => (v ? 'mapas e placar com o carimbo' : 'sem carimbo'),
  metaPlacar: (v) => (v ? 'descrições dos links com o placar' : 'descrições sem números'),
  medirLocal: (v) => (v ? 'páginas contadas por estado, país e aparelho' : 'essa parte da audiência parada'),
  projecao: (v) => (v ? 'o site mostra a estimativa do resultado final (some quando o resultado é definido)' : 'o site não mostra a projeção'),
};

function chavesDe(s) {
  const n = s?.state?.noite ?? {};
  return { ...PADRAO_NOITE, ...n, freio: { ...PADRAO_NOITE.freio, ...(n.freio ?? {}) } };
}

function linhaFreio(f) {
  if (f.fator === 1 && !f.leve) return 'solto (ritmo normal)';
  return 'PUXADO: ' + (f.fator > 1 ? `o site consulta ${f.fator}× mais espaçado` : 'ritmo normal') +
    (f.leve ? ' + modo leve (mapa por município e "desde o 1º turno" parados, chat 2× mais lento)' : '') + ' · soltar: painel.sh freio 1';
}

function linhasChaves(s) {
  const c = chavesDe(s);
  const fora = (v, p) => (v !== p ? '   ← fora do padrão' : '');
  const col = (t) => (t + ':').padEnd(38);
  const out = [`${col('Freio de carga')}${linhaFreio(c.freio)}${c.freio.fator === 1 && !c.freio.leve ? '' : '   ← fora do padrão'}`];
  for (const [comandoChave, [campo, rotulo]] of Object.entries(CHAVES)) {
    out.push(`${col(rotulo)}${c[campo] ? 'ligado' : 'DESLIGADO'} — ${EXPLICA[campo](c[campo])}${fora(c[campo], PADRAO_NOITE[campo])}` +
      `   [painel.sh ${comandoChave} ${c[campo] ? 'desligar' : 'ligar'}]`);
  }
  out.push(`${col('Aviso do arquivo nacional parado')}${c.avisoNacional === 'auto' ? 'automático' : 'DESLIGADO (nunca avisa)'}${fora(c.avisoNacional, PADRAO_NOITE.avisoNacional)}` +
    `   [painel.sh aviso-nacional ${c.avisoNacional === 'auto' ? 'off' : 'auto'}]`);
  out.push(`${col('Pausa quando o TSE bloqueia')}${PAUSA_TSE[c.pausaTse] ?? c.pausaTse}${fora(c.pausaTse, PADRAO_NOITE.pausaTse)}` +
    `   [painel.sh pausa-tse auto|restrita|off]`);
  return out;
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
  console.log(`Códigos do TSE:   pleito ${t.pleito} · Presidente ${t.eleicaoPres} · Governador ${t.eleicaoGov} · a cada ${t.intervaloSeg} s` +
    (typeof t.limitePorSeg === 'number' ? ` · teto ${t.limitePorSeg} pedidos/s` : ''));
  console.log(`Versão:           estado ${s.state.versao} · build ${sv.build?.commit ?? '?'}` + (typeof st.pessoasAgora === 'number' ? ` · pessoas agora ~${st.pessoasAgora} (estimativa: origem ou sinal das páginas, o maior)` : ''));
  const { j: c } = await req('/api/admin/chat');
  console.log('Chat ao vivo:     ' + linhaChat(c));
  console.log('Anúncios:         ' + linhaAnuncios(s));
  const nt = chavesDe(s);
  const fora = ['contadorPublico', 'htmlBorda', 'medirAnuncios', 'textoBots', 'contarLives', 'avisoNacional', 'faixaConexao', 'carimboPrint', 'metaPlacar', 'medirLocal', 'pausaTse', 'projecao']
    .filter((k) => nt[k] !== PADRAO_NOITE[k]).length;
  console.log('Freio de carga:   ' + linhaFreio(nt.freio));
  console.log('Chaves da noite:  ' + (fora ? `${fora} fora do padrão (veja: painel.sh chaves)` : 'todas no padrão (painel.sh chaves)'));
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

/** Anúncios no site (o mesmo do /api/status) e o interruptor geral. */
function linhaAnuncios(s) {
  const sus = s.state.anunciosSuspensos;
  if (sus) return `SUSPENSOS — todos fora do ar desde ${hora(sus.desde)}` + (sus.motivo ? ` (motivo: ${sus.motivo})` : '') + ' · para voltar: painel.sh anuncios-voltar';
  const noAr = s.status.anuncios ?? [];
  return `${noAr.length} no ar` + (noAr.length ? `: ${noAr.map((a) => a.marca).join(', ')}` : '');
}

async function anunciosEstado() {
  const { j: s } = await req('/api/admin/state');
  console.log('Anúncios: ' + linhaAnuncios(s));
  const noAr = new Set((s.status.anuncios ?? []).map((a) => a.id));
  const agora = Date.now();
  for (const a of s.state.anuncios ?? []) {
    const sit = noAr.has(a.id)
      ? 'NO AR'
      : !a.ativo
        ? 'pausado'
        : a.fim && agora >= a.fim
          ? `encerrado (${hora(a.fim)})`
          : a.inicio && agora < a.inicio
            ? `agendado (${hora(a.inicio)})`
            : s.state.anunciosSuspensos
              ? 'suspenso (geral)'
              : 'fora do site (meta de impressões atingida)';
    console.log(`   ${a.id.padEnd(22)} ${a.marca.slice(0, 24).padEnd(24)} ${a.reserva ? 'reserva' : a.cota.padEnd(7)} · ${sit} · ${a.formatos.join(', ')}`);
  }
  if (!(s.state.anuncios ?? []).length) console.log('   (nenhum anúncio cadastrado)');
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
      case 'anuncios-estado': await anunciosEstado(); break;
      case 'anuncios-suspender': {
        const r = await comando({ tipo: 'anuncios-suspensao', suspender: true, ...(arg ? { motivo: arg } : {}) });
        ok('Anúncios: ' + linhaAnuncios(r) + '. Nada foi apagado; o site atualiza em até ~5 s.');
        break;
      }
      case 'anuncios-voltar': {
        const r = await comando({ tipo: 'anuncios-suspensao', suspender: false });
        ok('Anúncios de volta: ' + linhaAnuncios(r));
        break;
      }
      case 'chaves': {
        const { j: s } = await req('/api/admin/state');
        for (const l of linhasChaves(s)) console.log(l);
        break;
      }
      case 'freio': {
        const r = await comando({ tipo: 'freio', fator: Number(arg), leve: arg2 === 'leve' });
        ok('Freio de carga: ' + linhaFreio(chavesDe(r).freio) + '. Os visitantes seguem em segundos (na próxima consulta do status).');
        break;
      }
      case 'contador-publico':
      case 'html-borda':
      case 'medir-anuncios':
      case 'texto-bots':
      case 'contar-lives':
      case 'faixa-conexao':
      case 'carimbo-print':
      case 'meta-placar':
      case 'medir-local':
      case 'projecao': {
        const [campo, rotulo] = CHAVES[cmd];
        const r = await comando({ tipo: cmd, ligado: arg === 'ligar' });
        const v = chavesDe(r)[campo];
        ok(`${rotulo}: ${v ? 'ligado' : 'desligado'} — ${EXPLICA[campo](v)}`);
        break;
      }
      case 'aviso-nacional': {
        const r = await comando({ tipo: 'aviso-nacional', modo: arg });
        ok('Aviso do arquivo nacional parado: ' + (chavesDe(r).avisoNacional === 'auto' ? 'automático' : 'desligado (nunca avisa)'));
        break;
      }
      case 'pausa-tse': {
        const r = await comando({ tipo: 'pausa-tse', modo: arg });
        ok('Pausa quando o TSE bloqueia: ' + (PAUSA_TSE[chavesDe(r).pausaTse] ?? chavesDe(r).pausaTse) + (arg === 'auto' ? '' : ' · uma pausa em curso terminou agora'));
        break;
      }
      case 'tse-retomar': {
        await comando({ tipo: 'tse-retomar' });
        ok('Leituras do TSE retomadas agora (se o TSE bloquear de novo, a pausa volta sozinha).');
        const { j: h } = await req('/api/admin/tse/health');
        for (const l of resumoTse(h)) console.log(l);
        break;
      }
      case 'alerta-teste': {
        await comando({ tipo: 'alerta-teste' });
        ok('Alerta de teste entregue ao Telegram.');
        break;
      }
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
