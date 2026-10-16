/**
 * Entrada do servidor Sintonia (Hono + @hono/node-server).
 *
 *   dev:      tsx watch src/server/main.ts            (npm run dev:server; SIM_AUTOSTART=1)
 *   produção: node dist-server/main.js                 (npm run build && npm start; ou a imagem Docker)
 *
 * Sobe em ~1 s: lê o dataset do disco, constrói o motor (modelo de ~499 mil seções), restaura o AdminState
 * salvo em STATE_DIR, aplica as travas de produção (simulação só com ALLOW_SIMULACAO), liga o agendador da troca
 * automática para o TSE (TSE_AUTO) e começa a servir. Variáveis de ambiente: ver src/server/config.ts e README.md.
 *
 * Encerramento (SIGTERM/SIGINT): /readyz passa a 503 e as respostas saem com `Connection: close` (por até 2 s ainda
 * aceitando pedidos: os clientes keep-alive fecham depois da resposta, sem reset); depois o servidor para de aceitar
 * conexões, espera as requisições em andamento (até ENCERRAMENTO_SEG, padrão 8 s, no total), fecha as que sobrarem,
 * para o polling do TSE e grava o estado pendente (e as métricas dos anúncios). Sai com código 0 (ou 1 se passar de
 * ENCERRAMENTO_SEG + 5 s).
 *
 * Leva 3: alertas da noite (alertas.ts; Telegram com TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, batimento externo com
 * HC_PING_URL, `ALERTAS=0` desliga; desligados sem as variáveis e sempre no ensaio do update.sh) e a chave 'aviso-nacional'
 * do painel lida pelo TseManager a cada status.
 */
import { unwatchFile, watchFile, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAdaptorServer } from '@hono/node-server';
import type { AdminState, Patrocinio, UF } from '../shared/types';
import { chavesNoite } from '../shared/chaves-noite';
import { createController, loadDataset } from '../engine/controller';
import { anuncioDoPatrocinio } from '../engine/state';
import type { JsonLoader } from '../engine/api';
import { createApp } from './app';
import { loadConfig } from './config';
import { createLogger, msgErro } from './log';
import { createJsonStore } from './state-store';
import { TseManager } from './tse';
import { AlertasNoite, configAlertas, limiteMemoriaMb } from './alertas';

async function main() {
  const t0 = performance.now();
  const config = loadConfig();
  const log = createLogger({ formato: config.logFormato });
  for (const a of config.avisos) log.aviso(a);
  log.info(`Sintonia ${config.build.versao} (build ${config.build.commit}${config.build.data ? ` de ${config.build.data}` : ''}, Node ${config.build.node})`);

  // ---- dataset + motor ---------------------------------------------------------------------------
  // loadDataset pede 'data/meta.json', 'data/uf/sp.json' → resolvidos dentro de DATA_DIR
  const loader: JsonLoader = async (p) => JSON.parse(await readFile(join(config.dataDir, p.replace(/^data\//, '')), 'utf8'));
  const ds = await loadDataset(loader);
  log.info(`Dataset: ${ds.meta.races.length} corridas, ${ds.meta.ufs.length} UFs (${config.dataDir})`);

  const store = createJsonStore(config.stateDir, 'admin.json', { onErro: (e) => log.erro('Falha ao salvar o estado do admin', e) });
  const salvo = store.ler();
  const controller = createController(ds, {
    modo: 'servidor',
    initialState: salvo && typeof salvo === 'object' ? (salvo as AdminState) : undefined,
    onStateChange: (s) => store.salvar(s),
    log: (m) => log.info(`motor: ${m}`),
  });
  if (salvo) log.info(`Estado do admin restaurado de ${store.caminho} (versão ${controller.state().versao}, fonte ${controller.state().fonte})`);
  // LEGADO: o patrocínio antigo vira o anúncio 'patrocinio' na 1ª subida (state.ts). Perdas dessa migração vão para o log
  // (o dono revisa o anúncio no painel): título cortado, logo por URL descartada ou patrocínio recusado pelas regras novas.
  const patAntigo = salvo && typeof salvo === 'object' ? ((salvo as { patrocinio?: unknown }).patrocinio as Patrocinio | null | undefined) : null;
  if (patAntigo && typeof patAntigo === 'object' && typeof patAntigo.marca === 'string' && typeof patAntigo.texto === 'string') {
    const migrado = controller.state().anuncios?.find((a) => a.id === 'patrocinio');
    if (!migrado) {
      const r = anuncioDoPatrocinio(patAntigo);
      log.aviso(`Patrocínio antigo NÃO virou anúncio${'erro' in r ? `: ${r.erro}` : ' (lista de anúncios cheia)'} — recadastre-o no painel (Anúncios)`);
    } else {
      const perdas: string[] = [];
      if (patAntigo.texto.trim().length > migrado.titulo.length) perdas.push(`título cortado em ${migrado.titulo.length} caracteres`);
      if (patAntigo.imagem && !migrado.logo) perdas.push('logo por endereço externo descartada (envie o arquivo da logo)');
      if (perdas.length) log.aviso(`Patrocínio antigo virou o anúncio 'patrocinio' com ajustes: ${perdas.join('; ')} — revise no painel (Anúncios)`);
    }
  }
  // admin.json sem a lista de anúncios = gravado por uma versão anterior a out/2026 (ex.: depois de um rollback para ela,
  // qualquer gravação lá tira 'anuncios' e 'anuncie' do arquivo). Na 1ª atualização para esta versão é o esperado (o
  // patrocínio antigo vira anúncio); depois disso, significa anúncios perdidos.
  if (salvo && typeof salvo === 'object' && !('anuncios' in salvo)) {
    log.aviso(
      `${store.caminho} sem a lista de anúncios (formato anterior a out/2026). Se esta versão já tinha anúncios ou o contato da ` +
        '/anuncie cadastrados, uma versão antiga regravou o arquivo (rollback): refaça-os no painel ou restaure só o admin.json do ' +
        'último backup feito nesta versão (RUNBOOK §3.5).',
    );
  }

  // SIM_AUTOSTART: simulação a 20× (dev / demonstrações; em produção só com ALLOW_SIMULACAO — config.ts zera).
  // 'auto' respeita uma simulação ou TSE em curso.
  if (config.simAutostart !== 'nao') {
    const st = controller.status();
    if (config.simAutostart === 'force' || st.fonte === 'pre' || (st.fonte === 'simulacao' && st.fase === 'encerrada')) {
      if (st.fonte !== 'simulacao') controller.command({ tipo: 'fonte', fonte: 'simulacao' });
      controller.command({ tipo: 'velocidade', velocidade: 20 });
      controller.command({ tipo: 'relogio', acao: 'iniciar' });
      log.info('SIM_AUTOSTART: simulação iniciada às 16:59:30 a 20×');
    } else {
      log.info(`SIM_AUTOSTART: mantido o estado salvo (fonte ${st.fonte}, fase ${st.fase})`);
    }
  }

  // ---- fonte TSE -----------------------------------------------------------------------------------
  const nomes = new Map<string, string>();
  for (const [uf, d] of Object.entries(ds.ufs)) for (const m of d?.municipios ?? []) nomes.set(`${uf}|${m.cod}`, m.nome);
  const tse = new TseManager({
    races: ds.meta.races,
    nomeMunicipio: (uf: UF, cod: string) => nomes.get(`${uf}|${cod}`),
    log: (m) => log.info(m),
    historico: createJsonStore(config.stateDir, 'tse-historico.json', { debounceMs: 1000, onErro: (e) => log.erro('Falha ao salvar o histórico do TSE', e) }),
    // I18: 'off' no painel ("Chaves da noite") tira o aviso do arquivo nacional parado do status público, na hora
    avisoNacional: () => chavesNoite(controller.state()).avisoNacional,
  });

  // ensaio do update.sh (contêiner ao lado do que está no ar, mesmo volume): não grava audiência nem métricas — o app no
  // ar é quem conta (senão cada update somaria um "reinício" e poderia regravar contagens velhas) — e não manda alertas
  const ensaio = /^(1|true|sim)$/i.test(process.env.SINTONIA_ENSAIO?.trim() ?? '');

  // ---- alertas da noite (I16) ------------------------------------------------------------------------
  const cfgAlertas = configAlertas(process.env);
  for (const a of cfgAlertas.avisos) log.aviso(a);
  const limiteMem = limiteMemoriaMb();
  const alertas = new AlertasNoite({
    config: cfgAlertas,
    log,
    envio: !ensaio,
    versao: config.build.commit,
    fontes: {
      status: () => controller.status(),
      tse: () => tse.health(),
      frescor: () => tse.frescor(),
      memoria: () => ({ usadaMb: process.memoryUsage().rss / 1048576, limiteMb: limiteMem }),
    },
  });

  // ---- HTTP ----------------------------------------------------------------------------------------
  // createApp aplica as travas (estado salvo em simulação sem ALLOW_SIMULACAO → 'pre') antes de ligar o TSE
  // métricas agregadas dos anúncios: lidas na subida, gravadas (atômico) a cada 60 s e no encerramento
  const metricasAnunciosStore = createJsonStore(config.stateDir, 'anuncios-metricas.json', {
    debounceMs: 0,
    onErro: (e) => log.erro('Falha ao salvar as métricas dos anúncios', e),
  });
  // audiência agregada (a cada 60 s e no encerramento), pedidos de anunciantes e redes do Sintonia (a cada mudança)
  const storeCrescimento = (arquivo: string, debounceMs: number, oque: string) =>
    createJsonStore(config.stateDir, arquivo, { debounceMs, onErro: (e) => log.erro(`Falha ao salvar ${oque}`, e) });
  const crescimentoStores = {
    audiencia: storeCrescimento('audiencia.json', 0, 'a audiência'),
    leads: storeCrescimento('leads.json', 250, 'os pedidos de anunciantes'),
    divulgacao: storeCrescimento('divulgacao.json', 0, 'as redes do Sintonia'),
  };
  // configuração da sala do chat (aberta, modo lento, fixada): sobrevive a update/restart/vigia do healthcheck
  const chatStore = createJsonStore(config.stateDir, 'chat.json', { debounceMs: 0, onErro: (e) => log.erro('Falha ao salvar a configuração do chat', e) });
  const sintonia = createApp({
    config,
    dataset: ds,
    controller,
    tse,
    log,
    metricasAnunciosStore,
    crescimentoStores,
    chatStore,
    // /api/saude-noite soma o que só os alertas conferem; 'alerta-teste' do painel manda a mensagem de teste
    alertas: { saude: () => alertas.saude(), teste: () => alertas.teste() },
  });
  alertas.conectar({
    minuto: () => sintonia.metricas.ultimoResumo,
    trocaAuto: () => sintonia.agendador.info(),
    loopMs: () => sintonia.metricas.eventLoopP99Ms(),
  });
  sintonia.crescimento.iniciar();
  const s0 = controller.state();
  tse.sincronizar(s0.fonte, s0.tse);
  sintonia.agendador.iniciar();
  alertas.iniciar();

  // Várias instâncias com o mesmo STATE_DIR (volume compartilhado, PM2/cluster) convergem para o admin.json
  // mais recente: quem não escreveu adota o estado (setState não regrava → sem laço). Atraso ≤ ~1 s.
  watchFile(store.caminho, { interval: 1000, persistent: false }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs || cur.mtimeMs === 0) return;
    const v = store.ler() as AdminState | null;
    if (!v || typeof v !== 'object' || typeof v.versao !== 'number') return;
    const atual = controller.state();
    if (v.versao < atual.versao || JSON.stringify(v) === JSON.stringify(atual)) return;
    if (!config.permitirSimulacao && v.fonte === 'simulacao') {
      log.aviso(`Estado de outra instância IGNORADO: fonte "simulacao" sem ALLOW_SIMULACAO=1 (versão ${v.versao})`);
      return;
    }
    try {
      controller.setState(v);
      const s = controller.state();
      tse.sincronizar(s.fonte, s.tse);
      log.info(`Estado do admin sincronizado de outra instância (versão ${s.versao}, fonte ${s.fonte})`);
    } catch (e) {
      log.erro('Falha ao adotar o estado de outra instância', e);
    }
  });

  const server = createAdaptorServer({ fetch: sintonia.app.fetch, hostname: config.host });
  // fila de conexões maior que o padrão do Node (511): rajadas de conexões novas (CDN/proxy reabrindo o pool, visitantes
  // chegando juntos) não perdem SYN — perder um custa 1–3 s de retransmissão ao cliente. O kernel limita a somaxconn.
  server.listen({ port: config.port, host: config.host, backlog: 4096 }, () => {
    const info = server.address() as { port: number } | null;
    log.info(
      `Sintonia no ar em http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${info?.port ?? config.port} ` +
        `(${config.producao ? 'produção' : 'desenvolvimento'}, fonte ${controller.status().fonte}, ` +
        `${config.serveStatic ? `servindo ${config.distDir}` : 'só API'}, simulação ${config.permitirSimulacao ? 'permitida' : 'bloqueada'}; ` +
        `subida em ${Math.round(performance.now() - t0)} ms)`,
    );
  });
  // pré-comprime data/ e geo/ (JSONs grandes) em segundo plano, um arquivo por vez
  if (sintonia.estaticos) {
    const est = sintonia.estaticos;
    setTimeout(() => void est.aquecer(['data', 'geo'], (m) => log.info(m)), 2_000).unref();
  }
  server.on('error', (e: NodeJS.ErrnoException) => {
    log.erro(e.code === 'EADDRINUSE' ? `Porta ${config.port} já está em uso (defina PORT)` : 'Falha no servidor HTTP', e);
    process.exit(1);
  });
  type ServidorNode = {
    keepAliveTimeout: number;
    headersTimeout: number;
    requestTimeout: number;
    closeIdleConnections?: () => void;
    closeAllConnections?: () => void;
  };
  const srv = server as unknown as ServidorNode;
  // keep-alive maior que o do balanceador (evita 502 por conexão reaproveitada fechando)
  srv.keepAliveTimeout = 65_000;
  srv.headersTimeout = 66_000;
  // requisição inteira (cabeçalhos + corpo) em até 30 s: conexões lentas de propósito não prendem o processo
  srv.requestTimeout = 30_000;

  // Batimento para o vigia do healthcheck (deploy/healthcheck.mjs): prova que o laço de eventos gira. Com a CPU saturada,
  // o /healthz numa conexão nova pode passar de 5 s; o vigia só reinicia se o batimento também parar (travamento real).
  // Só em produção (ou com BATIMENTO_ARQ): no contêiner, /tmp é um tmpfs só deste app.
  const arqBatimento = process.env.BATIMENTO_ARQ || (config.producao ? '/tmp/sintonia-batimento' : '');
  if (arqBatimento) {
    let falhouBatimento = false;
    const bater = () => {
      try {
        writeFileSync(arqBatimento, JSON.stringify({ pid: process.pid, t: Date.now() }));
      } catch (e) {
        if (!falhouBatimento) log.aviso(`Batimento do vigia desligado: não consegui gravar ${arqBatimento} (${msgErro(e)})`);
        falhouBatimento = true;
      }
    };
    bater();
    setInterval(bater, 1000).unref();
  }

  if (ensaio) log.info('SINTONIA_ENSAIO: contêiner de ensaio — audiência e métricas dos anúncios não são gravadas');
  const resumo = setInterval(() => {
    const r = sintonia.resumoMinuto();
    if (r) log.info(r.msg, r.campos);
    if (ensaio) return;
    void sintonia.persistirMetricasAnuncios();
    void sintonia.crescimento.persistir();
  }, 60_000);
  resumo.unref();

  // ---- encerramento gracioso ------------------------------------------------------------------------
  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    const ini = Date.now();
    log.info(
      `${sinal}: encerrando — /readyz em 503 e respostas com Connection: close; depois para de aceitar conexões e espera as ` +
        `requisições em andamento (${sintonia.metricas.emAndamento} agora; até ${config.encerramentoMs / 1000} s no total)`,
    );
    const forcar = setTimeout(() => {
      log.aviso(`Encerramento passou de ${config.encerramentoMs / 1000 + 5} s: saindo à força`);
      process.exit(1);
    }, config.encerramentoMs + 5_000);
    forcar.unref();
    sintonia.encerrar();
    alertas.parar();
    clearInterval(resumo);
    unwatchFile(store.caminho);
    // 1ª fase (até 2 s): continua atendendo, mas cada resposta sai com `Connection: close` — os clientes keep-alive
    // fecham a conexão depois da resposta em vez de levar um reset no meio de um pedido novo; o /readyz já diz 503
    const fase1 = Math.min(2_000, config.encerramentoMs / 2);
    await new Promise((r) => setTimeout(r, fase1).unref?.());
    try {
      await new Promise<void>((res) => {
        const prazo = setTimeout(() => {
          log.aviso(`Drenagem: ${sintonia.metricas.emAndamento} requisição(ões) ainda em andamento depois de ${config.encerramentoMs / 1000} s; fechando`);
          srv.closeAllConnections?.();
          res();
        }, config.encerramentoMs - fase1);
        prazo.unref();
        server.close(() => {
          clearTimeout(prazo);
          res();
        });
        srv.closeIdleConnections?.();
      });
    } catch (e) {
      log.erro('Erro ao fechar o servidor HTTP', e);
    }
    try {
      await tse.encerrar();
      // só grava o que estiver pendente: o estado já é salvo a cada comando, e regravar aqui poderia
      // sobrescrever um estado mais novo escrito por outra instância no mesmo STATE_DIR
      await store.flush();
      await chatStore.flush();
      sintonia.crescimento.parar();
      if (!ensaio) {
        await sintonia.persistirMetricasAnuncios();
        await sintonia.crescimento.persistir();
      }
    } catch (e) {
      log.erro('Erro ao gravar o estado no encerramento', e);
    }
    log.info(`Encerrado em ${Date.now() - ini} ms.`);
    process.exit(0);
  };
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('unhandledRejection', (e) => log.erro('Promessa rejeitada sem tratamento', e));
}

main().catch((e) => {
  process.stderr.write(`Falha ao iniciar o servidor: ${msgErro(e)}\n${e instanceof Error ? e.stack : ''}\n`);
  process.exit(1);
});
