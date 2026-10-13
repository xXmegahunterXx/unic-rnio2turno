# Sintonia

Apuração ao vivo do 2º turno das eleições de 25/10/2026 (estado, município, zona e seção), **Teste Cego** (concordar ou
discordar de afirmações dos planos de governo sem saber de quem são), **Curiosidades** do 1º turno, a calculadora
**"E se…? Monte seu cenário"**, widgets para incorporar e um **simulador administrável** da noite da apuração. Tudo gera
imagem + texto + link para postar no X. Apartidário por construção: textos descritivos e simétricos, sem enquetes e sem
dados pessoais do Teste Cego no servidor. Cores: Presidente com cores de identificação (Lula vermelho, Flávio Bolsonaro
azul, decisão do dono); governadores e simulação com nomes ocultos em cores neutras pela ordem da urna.

Arquitetura e regras: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · guia para agentes: [`CLAUDE.md`](./CLAUDE.md) ·
adaptador do TSE: [`src/tse/README.md`](./src/tse/README.md). Produção: [`DEPLOY.md`](./DEPLOY.md) (VPS) ·
[`CHECKLIST-LANCAMENTO.md`](./CHECKLIST-LANCAMENTO.md) (antes de divulgar) ·
[`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md) (roteiro de 24 a 26/10).

---

## Rodando

Requisitos: Node ≥ 20 (testado no 22).

```bash
npm install
npm run dev          # Vite (http://localhost:5173) + API (http://localhost:8787), proxy /api no Vite
```

No `npm run dev` a API sobe com `SIM_AUTOSTART=1`: fonte **simulação** a **20×** a partir de 16:59:30 de 25/10
(a apuração simulada inteira leva ~15 min). Se já houver uma simulação em curso salva em `.server-state/`, ela é
mantida; `SIM_AUTOSTART=force` reinicia sempre. O painel fica em `/admin` (senha de desenvolvimento: `sintonia`).

| Comando | O que faz |
|---|---|
| `npm run dev` | app + API com recarga automática |
| `npm run dev:server` | só a API (`tsx watch src/server/main.ts`) |
| `npm test` | Vitest (`npx vitest run src/server` para só o servidor) |
| `npm run typecheck` | `tsc --noEmit` do projeto inteiro |
| `npm run build` | `dist/` (SPA, Vite) + `dist-server/` (servidor, esbuild) |
| `npm start` | produção: um processo serve SPA + API na porta `PORT` |
| `npm run build:demo` | site 100% estático (`dist-demo/`) com o motor no navegador |
| `npm run data:curiosidades` | regenera `public/data/curiosidades.json` (ver "Curiosidades e calculadora de cenários") |
| `npm run data:presidente-t1` | regenera `public/data/presidente-t1.json` (base da calculadora `/cenarios`) |

### Variáveis do build (app)

| Variável | Padrão | Uso |
|---|---|---|
| `VITE_SITE_URL` | — (usa o endereço da página) | URL pública do site (`https://sintonia.app`). Links compartilhados ("Postar no X", WhatsApp, copiar link, Web Share), o código de incorporação dos widgets e o domínio no rodapé das imagens passam a apontar para ela. **Defina no build demo** (`VITE_SITE_URL=https://sintonia.app npm run build:demo`): publicado como Artifact, o demo roda num iframe de outra origem cujo endereço não abre fora do claude.ai. Termine com `#` se o site público usar HashRouter (`https://exemplo.org/sintonia/#` → `…/sintonia/#/teste`). Só `http(s)`; valor inválido é ignorado |

### Variáveis de ambiente do servidor

Referência completa (com exemplos) no topo de [`src/server/config.ts`](./src/server/config.ts). Valores inválidos são
ignorados com aviso no log da subida.

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | porta e interface HTTP |
| `NODE_ENV` | — | `production`: serve `dist/`, cookie `Secure`, HSTS, CSP, logs em JSON, troca automática para o TSE, trava da simulação e exige `ADMIN_PASSWORD` |
| `ADMIN_PASSWORD` | dev: `sintonia` | senha do painel. **Produção sem ela = admin desabilitado (503)**. Trocar a senha derruba as sessões abertas |
| `ADMIN_SECRET` | aleatório por processo | segredo HMAC-SHA256 do cookie de sessão (≥ 16 caracteres). Defina para as sessões sobreviverem a reinícios e valerem em todas as instâncias |
| `ADMIN_SESSAO_HORAS` | `12` | validade da sessão do painel (1–72 h) |
| `PUBLIC_URL` | Host da requisição | origem pública (`https://sintonia.app`): `og:image`/`og:url`, `sitemap.xml`, `robots.txt` e a conferência de origem (CSRF) do painel. **Defina em produção** |
| `TRUST_PROXY` | desligado | `1` atrás de proxy/CDN: IP do cliente por `CF-Connecting-IP` → `Fly-Client-IP` → `X-Real-IP` (o Caddy do deploy manda este) → o **último** endereço do `X-Forwarded-For`; também aceita `X-Forwarded-Proto/Host` e um `X-Request-Id` bem formado |
| `TSE_AUTO` | produção: `1` · dev: `0` | troca automática `pre` → `tse` no início da apuração, conferindo o feed antes (ver "Noite da eleição") |
| `TSE_INICIO` | `2026-10-25T17:00:00-03:00` | horário da troca automática (ISO 8601). Mude para um ensaio; o painel também muda sem reiniciar |
| `ALLOW_SIMULACAO` | dev: sempre · produção: desligado | `1` permite pôr a fonte `simulacao` no ar em produção. Sem ela: comando de simulação → 403 com o motivo, `SIM_AUTOSTART` ignorado e estado salvo em simulação volta para `pre` |
| `SIM_AUTOSTART` | — | `1`: sobe simulando a 20× (se não houver simulação/TSE em curso) · `force`: sempre. Em produção só com `ALLOW_SIMULACAO=1` |
| `DATA_DIR` | `public/data` (dev) · `dist/data` (produção) | dataset (`meta.json`, `uf/*.json`) |
| `DIST_DIR` | `dist` | build do app servido em produção |
| `STATE_DIR` | `.server-state` | estado do admin (`admin.json`) e histórico do TSE (`tse-historico.json`) |
| `SERVE_STATIC` | só em produção | `1`/`0` força servir (ou não) o `DIST_DIR` |
| `FONTS_DIR` | `dist-server/assets/fonts` | fontes TTF das imagens de compartilhamento |
| `TWITTER_SITE` | — | perfil do X para a meta `twitter:site` dos cartões de link (`@sintonia` ou `https://x.com/sintonia`); inválido = ignorado com aviso no log |
| `OG_LIMITE_MIN` | `30` | imagens de compartilhamento **novas** (renderizações) por cliente por minuto (`0` = sem limite; excesso → 429). Imagem já pronta nunca conta: uma CDN pedindo de novo não é barrada |
| `ENCERRAMENTO_SEG` | `8` | `SIGTERM`: segundos para terminar as requisições em andamento antes de fechar (1–60) |
| `LOG_FORMAT` | produção: `json` · dev: `texto` | formato do log (JSON = um objeto por linha) |
| `LOG_AMOSTRA` | `0.01` | fração das requisições "quentes" registradas (`/api/status`, apuração, estáticos). 5xx, 429, lentas (≥ 1 s) e o painel: sempre |
| `LOG_AMOSTRA_PAGINAS` | `0.1` | fração das páginas (HTML) e imagens OG registradas |
| `SINTONIA_COMMIT` / `SINTONIA_BUILD_DATE` | `.git` local ou `dev` | versão do build mostrada em `x-sintonia-versao`, `/api/versao`, `/healthz` e no painel (a imagem Docker grava o commit a partir do build-arg `GIT_COMMIT`; `GIT_COMMIT`/`BUILD_DATE` também valem) |

---

## Deploy

**Produção numa VPS: siga o [`DEPLOY.md`](./DEPLOY.md).** Docker + Caddy (HTTPS automático com Let's Encrypt,
HTTP/3) com poucos comandos: `deploy/install.sh` (Ubuntu 22.04/24.04: Docker, firewall, `.env` com senha e segredos — numa VPS que já tem outros
projetos, entra sozinho no modo compartilhado e o domínio é ligado depois com `deploy/dominio.sh`;
build, subida e backup de hora em hora), `deploy/update.sh` (atualiza com o site no ar: ensaio da imagem nova,
troca sem erro para o visitante e volta automática se falhar), `deploy/backup.sh`/`restore.sh`,
`deploy/status.sh` e `deploy/painel.sh` (comandos do painel pelo terminal: estado, troca para o TSE, avisos), além
da configuração da Cloudflare. Antes de divulgar o site: [`CHECKLIST-LANCAMENTO.md`](./CHECKLIST-LANCAMENTO.md); na
semana da eleição: [`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md). Imagem: `Dockerfile` (Node 22 Debian slim, usuário sem
privilégios, `HEALTHCHECK` em `/healthz`); configuração: `.env.example`. As seções abaixo são a referência técnica
(execução sem Docker, cache para CDN, capacidade, várias instâncias).

### Build e execução

```bash
npm ci
npm run build                      # dist/ + dist-server/main.js (+ dist-server/assets/fonts)
NODE_ENV=production \
ADMIN_PASSWORD='uma-senha-longa-e-aleatoria' \
ADMIN_SECRET='outro-segredo-longo-e-aleatorio' \
PUBLIC_URL='https://sintonia.app' TRUST_PROXY=1 \
STATE_DIR=/var/lib/sintonia \
npm start
```

Leve para a máquina: `dist/`, `dist-server/`, `package.json`, `package-lock.json` e `node_modules` de produção
(`npm ci --omit=dev`). Dependências de execução: `hono`, `@hono/node-server`, `zod`, `satori` e `@resvg/resvg-js`
(binário nativo: o `npm ci` instala o da plataforma — Linux x64/arm64 glibc ou musl, macOS, Windows — então rode o `npm ci` na imagem de destino). Monte `STATE_DIR` num volume persistente.

- **Subida**: ~1 s (lê o dataset, constrói o modelo de 499.248 seções em ~0,7–1,3 s, restaura o estado salvo, aplica
  as travas de produção e agenda a troca automática para o TSE).
- **Saúde**: `GET /healthz` (vivo: o processo responde; rápido, sem tocar em dados) → `{ ok, fonte, fase, versao,
  uptimeSeg, memoriaMb, tse, build, encerrando }`; `GET /readyz` (pronto para tráfego: dataset carregado, modelo
  construído, build do app presente e não está encerrando) → 200 `{ ok: true, motivos: [] }` ou **503** com os
  motivos. Ambos `no-store`.
- **Versão**: toda resposta leva `x-sintonia-versao: <commit>`; `GET /api/versao` → `{ commit, data, versao, node,
  iniciadoEm }`. Toda resposta leva também `x-request-id` (o do proxy, se bem formado e `TRUST_PROXY=1`; senão gerado),
  que aparece nas linhas de log da requisição.
- **Encerramento gracioso**: no `SIGTERM`/`SIGINT` o `/readyz` passa a 503, o servidor para de aceitar conexões, as
  respostas em andamento terminam com `Connection: close` (até `ENCERRAMENTO_SEG`, padrão 8 s; as que sobrarem são
  fechadas), o polling do TSE para e o estado pendente é gravado. Keep-alive de 65 s (maior que o dos balanceadores
  comuns), fila de conexões de 4.096 (rajadas de conexões novas não perdem SYN) e requisição inteira em até 30 s.
- **Memória**: ~250 MB parado, ~450–570 MB sob carga (cache das imagens OG, respostas comprimidas e estáticos).
- **Log** (stdout): em produção, **JSON** — um objeto por linha (`{"t":"…","nivel":"info","msg":"…"}`), com as
  requisições como `{"msg":"req","id","metodo","rota","status","ms","amostra"}` (rota sem query; `amostra` = fração
  registrada, para estimar o total). Rotas quentes por amostragem (`LOG_AMOSTRA`, 1%), páginas e imagens a 10%, e
  sempre: erros 5xx (com a pilha só no log, nunca para o cliente), 429, respostas ≥ 1 s e o painel. A cada minuto com
  tráfego, um resumo com campos (`requisicoes`, `reqPorSeg`, `p50Ms`/`p95Ms`/`p99Ms`, `cacheHit`, `respostas304`,
  `respostas429`, `erros5xx`, `clientes`, `memoriaMb`). Nunca registramos IP, cookie, senha, query string nem o código
  de um Duelo. Filtrar: `docker compose logs app | grep '"nivel":"erro"'` ou `… | jq 'select(.status >= 500)'`.

### CDN (recomendado na noite da eleição)

O servidor já responde pensando em CDN; basta respeitar `Cache-Control`, `ETag` e `Vary: Accept-Encoding` e incluir
a **query string** na chave de cache (`?race=`, `?t=`, `&v=`).

| Rota | Cache-Control | Observações |
|---|---|---|
| `GET /api/status` | `public, max-age=0, s-maxage=1` | estado leve (fonte, fase, relógio, aviso, versão, `pessoasAgora` arredondado, patrocínio) |
| `GET /api/meta` | `public, max-age=60, s-maxage=300` | ETag pela versão do dataset |
| `GET /api/apuracao/:race/…` (2º turno) | `public, max-age=0, s-maxage=2, stale-while-revalidate=10` | ETag fraco `W/"v{versão}-{balde}-{rota}"` → 304 |
| `GET /api/apuracao/:race-t1/…` (1º turno) | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` | resultado final (ignora `?t=`) |
| `GET /api/apuracao/:race/…?t=<passado>&v=<versão>` | `public, max-age=600, s-maxage=3600, stale-while-revalidate=600` | "reveja a noite": instante ≥ 60 s (simulação) ou 3 min (TSE) no passado, com a versão atual do admin na URL; ETag `W/"v{versão}-h{t}-{rota}"` |
| idem sem `&v=` (ou versão antiga) | `public, max-age=0, s-maxage=30, stale-while-revalidate=60` | passado recente ou `t` futuro = cache do agora (futuro nunca é atendido: vira o agora) |
| `GET /api/apuracao/:race/br/municipios` | como as demais de apuração | mapa nacional por município (`MunicipiosNacionalSnapshot`, ordem de `municipios-br.json`) |
| `GET /api/patrocinio/logo?h=<hash>` | `public, max-age=86400, s-maxage=86400, immutable` | logo do patrocínio enviada em data URI (o `/api/status` leva só esta URL) |
| 404 de `/api/apuracao/…` | `public, max-age=30, s-maxage=60` | evita martelar a origem com URLs inexistentes |
| `GET /api/og/apuracao.png` | `public, max-age=30, s-maxage=30, stale-while-revalidate=60` | PNG 1200×630 |
| `GET /api/og/{municipio,secao,governadores}.png` | ao vivo: como `apuracao.png`; 1º turno oficial (antes da apuração): `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | município, boletim de urna e as disputas de governador do 2º turno (`UFS_GOV_2T`) |
| `GET /api/og/{candidato,senado,camara,assembleia,curiosidade,cenario}.png` | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | dado oficial (ou cenário recalculado do `?c=`); o `&v=` das meta tags é a versão do dataset |
| `GET /api/og/teste.png` | `public, max-age=86400, s-maxage=86400` | cartão do Teste Cego (o código de um Duelo nunca é lido) |
| `/assets/*` | `public, max-age=31536000, immutable` | nomes com hash do Vite |
| demais arquivos (`/geo`, `/data`, favicon) | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` | com ETag |
| páginas (SPA) | `no-cache` | `index.html` com meta tags OG/Twitter da rota (`summary_large_image`, imagem da própria página) |
| `/embed/placar`, `/embed/mapa`, `/embed/uf` | `no-cache` | widgets: `frame-ancestors *` (podem ser incorporados em qualquer site), `noindex` |
| `/sitemap.xml`, `/robots.txt` | `public, max-age=3600, s-maxage=86400` | gerados pelo servidor com `PUBLIC_URL` |
| `/api/admin/*`, `/healthz`, `/readyz`, `/api/versao` | `no-store` | nunca cachear |
| erros 4xx/5xx e 429 (fora da apuração) | `no-store` | a CDN não guarda erro nem limite |

O "balde" do ETag só muda quando os números podem mudar: fixo com a fonte `pre`, no 1º turno, com o relógio
pausado ou os dados congelados, antes das 17h e depois do encerramento; por segundo simulado com a simulação
rodando; a cada 5 s na fonte `tse`. Respostas comprimem com **brotli** ou **gzip** conforme `Accept-Encoding`, e a
origem monta cada rota no máximo 1×/s (requisições simultâneas compartilham o mesmo cálculo).

**Reveja a noite (`?t=<epoch ms>`)**: todas as rotas de apuração aceitam um instante PASSADO (inteiro positivo;
malformado → 400; futuro → o agora). Na simulação, qualquer nível (Brasil, UF, município, zona, seção, mapa por
município). Na fonte `tse`, só Brasil, UF e o mapa por município têm histórico (estados gravados a cada mudança em
`STATE_DIR/tse-historico.json`); **município, zona e seção com `?t=` respondem o agora**. Detalhes em
[`src/tse/README.md`](./src/tse/README.md) §5.1.

**Pessoas agora** (`LiveStatus.pessoasAgora`): clientes distintos estimados nos últimos ~30 s (mapa de bits com
hash salgado, sem guardar IP), recalculado a cada 5 s e arredondado (< 10 exato; < 1.000 em dezenas; depois
centenas). Atrás de CDN, conta só quem chega à origem (o `status` tem `s-maxage=1`).

**Estáticos de dados** (`/data/**`, `/geo/**`, inclusive `secao/`, `locais/`, `perfil/`, `fotos/`, `cargos/`,
`candidatos/`, `municipios-br.json`, `br-mun.json`): brotli (q10) e gzip (9) calculados uma vez por arquivo e
guardados em memória (arquivos ≤ 32 MB, orçamento de 384 MB); na subida, `data/` e `geo/` são pré-comprimidos em
segundo plano, um arquivo por vez (ex.: `locais/sp.json` 2,4 MB → 0,5 MB em br).

### Capacidade medida (1 processo Node = 1 núcleo, sem CDN)

Medido em 12/10/2026 com `scripts/carga.ts` (Node puro, sem dependências; 3 processos geradores na mesma máquina de
4 vCPUs, conexões keep-alive abrindo ao longo de 2 s de aquecimento, 8 s medidos por rodada, `Accept-Encoding: br,
gzip`) contra o **build de produção** (`NODE_ENV=production`, `dist/` + `dist-server/main.js`). O servidor fica em 100%
de um núcleo em todas as rodadas — os números são o teto de **um** processo. Máquina compartilhada: ±15% entre rodadas.
**Zero erros** em todas as rodadas abaixo (nenhum 5xx, nenhum tempo-limite).

**Hoje (fonte `pre`, 1º turno + contagem regressiva):** req/s · p50 · p99 (ms)

| Rota | 200 conexões | 500 conexões | 1.000 conexões | resposta (br) |
|---|---|---|---|---|
| `/` (página) | 8.784 · 20 · 56 | 7.220 · 44 · 129 | 7.804 · 44 · 5.288 | 1,7 KB |
| `/api/status` | 9.420 · 18 · 74 | 10.556 · 40 · 108 | 10.455 · 42 · 164 | 0,4 KB |
| `/api/apuracao/pres/br` | 12.127 · 14 · 47 | 11.486 · 34 · 77 | 11.905 · 31 · 75 | 0,7 KB |
| `/api/apuracao/pres/uf/sp` | 8.062 · 25 · 50 | 10.384 · 38 · 94 | 11.012 · 39 · 139 | 14 KB |
| `/api/og/apuracao.png` | 7.133 · 26 · 67 | 8.396 · 40 · 101 | 8.254 · 39 · 5.302 | 117 KB |
| `/teste` (página) | 8.526 · 21 · 54 | 9.298 · 37 · 89 | 9.081 · 44 · 1.561 | 1,7 KB |

**Noite da eleição** (simulação a 20× com 50% das seções apuradas — o caminho mais pesado: os números mudam a cada
segundo, então cada rota é remontada, serializada e comprimida 1×/s; a fonte `tse` muda a cada 5 s):

| Rota | 200 conexões | 500 conexões | 1.000 conexões | resposta (br) |
|---|---|---|---|---|
| `/` (página) | 7.586 · 25 · 68 | 8.118 · 52 · 154 | 8.690 · 40 · 3.541 | 1,7 KB |
| `/api/status` | 13.628 · 13 · 34 | 9.405 · 35 · 103 | 11.176 · 35 · 98 | 0,4 KB |
| `/api/apuracao/pres/br` | 8.870 · 20 · 58 | 10.043 · 37 · 91 | 10.116 · 37 · 209 | 5,6 KB |
| `/api/apuracao/pres/uf/sp` | 7.816 · 23 · 64 | 8.004 · 46 · 139 | 10.681 · 44 · 130 | 37 KB |
| `/api/og/apuracao.png` | 6.363 · 28 · 81 | 6.360 · 41 · 104 | 6.207 · 42 · 8.705 | 98 KB |
| `/teste` (página) | 8.276 · 22 · 44 | 8.518 · 39 · 97 | 8.400 · 49 · 3.428 | 1,7 KB |
| **mistura realista**¹ | 8.429 · 20 · 68 | 6.954 · 41 · 222 | 7.026 · 51 · 7.122 | 9,7 KB |

¹ `--misto`: status 40%, Brasil 25%, SP 12%, `/` 8%, `/apuracao` 5%, `/teste` 5%, imagem 3%, mapa por município 2%.

- **Capacidade de um processo: ~7–12 mil req/s** conforme a rota, com p99 < 0,25 s até 500 conexões simultâneas. Com
  um visitante consultando o status a cada ~5 s e o placar a cada ~2,5–8 s, isso é da ordem de **20–30 mil pessoas
  ao mesmo tempo na origem, sem CDN**. Memória: 250 MB parado, 420–460 MB no pico (limite do contêiner: 1,5 GB).
- **Saturado** (1.000 conexões sempre ocupadas, CPU em 100%), o p99 de algumas rotas sobe para segundos: as conexões
  NOVAS esperam para ser aceitas (um servidor `http` mínimo do Node, "hello world", mostra o mesmo ~6 s neste ambiente).
  É o sinal de que a origem chegou ao teto: a partir daí, **CDN** (a origem só vê `s-maxage` de 1–2 s por URL; ver
  "CDN" acima) ou réplicas (`docker-compose.replicas.yml`).
- Ajustes desta rodada: páginas (HTML) sem consulta ao disco por requisição (cache de 1 s do `index.html` e de 2 s
  para caminhos inexistentes das rotas da SPA: `/teste` 5,3 mil → 8,5 mil req/s a 200 conexões) e fila de conexões de
  4.096 (o padrão do Node é 511). As demais rotas já tinham cache por segundo, ETag/304 e compressão memoizada.

Rodar de novo (depois de `npm run build`):

```bash
NODE_ENV=production PORT=8787 ADMIN_PASSWORD=x node dist-server/main.js &
npx tsx scripts/carga.ts --base=http://127.0.0.1:8787 --pid=$! --conexoes=200,500,1000 --duracao=8
npx tsx scripts/carga.ts --base=http://127.0.0.1:8787 --misto --conexoes=500        # mistura realista
# noite da eleição simulada: ALLOW_SIMULACAO=1 SIM_AUTOSTART=force no servidor e, no painel, "saltar para 50%"
```

### Várias instâncias

O motor é determinístico: mesma configuração ⇒ mesmos números **e mesmos ETags** em qualquer instância (conferido
com duas instâncias lado a lado). Instâncias que compartilham o `STATE_DIR` (mesma máquina ou volume compartilhado:
PM2, `docker compose --scale`) convergem para o `admin.json` mais recente em ≤ ~1 s; com o mesmo `ADMIN_SECRET`, a
sessão do admin vale em todas. Em máquinas sem volume compartilhado, use uma única origem atrás da CDN (a CDN
absorve o tráfego; a origem aguenta ~7–12 mil req/s num núcleo). Com Docker: `docker-compose.replicas.yml` (N réplicas
atrás do Caddy, distribuídas por visitante; testado com 3 — limitações e recomendação em `DEPLOY.md`, seção 10).

Limitação conhecida: trocar o **cenário/preset** reconstrói o modelo na thread principal (~0,7–1,3 s); nesse
intervalo as requisições esperam (a CDN continua servindo o conteúdo anterior com `stale-while-revalidate`).

### Segurança

- Admin: senha comparada em tempo constante; cookie `sintonia_admin` assinado (HMAC-SHA256 com chave derivada de
  `ADMIN_SECRET` **e da senha** — trocar a senha derruba as sessões), `HttpOnly`, `SameSite=Strict`, `Path=/api/admin`,
  `Secure` em produção, validade de 12 h (`ADMIN_SESSAO_HORAS`), revogado no logout; 10 tentativas de login por minuto
  por cliente (IP real com `TRUST_PROXY`, pelo último salto — forjar o começo do `X-Forwarded-For` não escapa) e 300/min
  no total → 429 com `Retry-After`; **CSRF**: `POST` só com `application/json`, e pedido de navegador vindo de outro site
  é recusado (403) pelo `Sec-Fetch-Site` e pelo `Origin`/`Referer`, que precisam ser o próprio site (`PUBLIC_URL` ou o
  Host; clientes fora do navegador, como `curl`, não mandam esses cabeçalhos e passam); corpo ≤ 64 KB (256 KB no
  `/command`, por causa da logo do patrocínio); comandos validados com zod (`src/server/validation.ts`).
- Simulação em produção só com `ALLOW_SIMULACAO=1` (senão: 403 com o motivo, que o painel também mostra).
- Limites: URL ≤ 8 KB (414), corpo declarado ≤ 512 KB em qualquer rota (413); parâmetros validados por rota (UF,
  código, zona, seção, `?t=`, código de cenário ≤ 600 caracteres).
- Cabeçalhos: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS de 1 ano em
  produção; nas páginas, **Content-Security-Policy** (scripts só do próprio site + os 2 scripts inline do `index.html`
  autorizados pelo hash SHA-256, calculado do build na subida; estilos inline; imagens do site, `data:`/`blob:` e
  `https:`; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `frame-ancestors 'self'` +
  `X-Frame-Options: SAMEORIGIN` (exceto `/embed/*`, com `frame-ancestors *`), `Permissions-Policy` (sem câmera,
  microfone, localização, pagamentos, USB, tópicos) e `Cross-Origin-Opener-Policy: same-origin-allow-popups`;
  `X-Robots-Tag: noindex` em `/admin`, `/duelo/*`, `/embed/*` e `/cenarios?c=`.
- Estáticos: só arquivos dentro de `DIST_DIR` (sem `..`, `\`, byte nulo) e nunca arquivos ocultos (`.env`, `.git`…,
  exceto `/.well-known/`). Meta tags: textos escapados e inseridos sem interpretar `$&`/`` $` ``/`$'`; sem `PUBLIC_URL`,
  o Host é validado e entra na chave do cache do HTML (um Host forjado não contamina a página dos outros).
- Erros: o cliente recebe só `{ erro }` (5xx = mensagem genérica); a pilha vai só para o log.
- Imagens OG: geradas uma por vez (no máximo 16 na fila; excesso → 503 com `Retry-After`), com a imagem anterior da
  mesma fonte servida enquanto a nova é gerada; no máximo `OG_LIMITE_MIN` (30) imagens **novas** por cliente por
  minuto (429) — imagem pronta nunca conta, então uma CDN pedindo de novo não é barrada.
- SEO: `GET /sitemap.xml` (início, apuração, as 27 UFs, governadores, Senado, Câmara, assembleias e `/assembleias/:uf`,
  curiosidades, cenários, Teste Cego, metodologia, sobre, privacidade, com `PUBLIC_URL`) e `GET /robots.txt` (libera
  `/api/og/` — o robô do X respeita o robots.txt também para a imagem do cartão —, fecha a API e o painel, e aponta o
  sitemap). Ambos gerados pelo servidor (valem mesmo se o build trouxer os seus).

---

## Admin

Painel em `/admin` (fora do layout público). Rotas (todas JSON, `no-store`):

| Rota | Uso |
|---|---|
| `POST /api/admin/login` `{ "senha": "…" }` | `{ ok: true }` + cookie de sessão; 401 senha errada; 429 excesso de tentativas; 503 admin desabilitado |
| `POST /api/admin/logout` | encerra a sessão |
| `GET /api/admin/state` | `AdminSnapshot`: estado, `LiveStatus`, métricas (requisições/min, clientes ativos estimados em 30 s, tempo de cálculo, memória, log), marcos e fim previsto |
| `POST /api/admin/command` | aplica um `AdminCommand` (ver `src/shared/api.ts`) e devolve o `AdminSnapshot` |
| `GET /api/admin/presets` | cenários prontos (simétricos para A e B) |
| `GET /api/admin/tse/test` | testa o feed do TSE com a configuração atual: `{ ok, detalhe, amostra }` |
| `GET /api/admin/tse/health` | saúde do polling do TSE (arquivos, falhas, fila de municípios, HTTP) ou `null` |

O `AdminSnapshot` do servidor traz também `servidor`: build, produção ou não, se a simulação pode ir ao ar (e o
motivo), o estado da troca automática para o TSE e métricas do processo (req/s, p50/p99, 5xx/429, cache, requisições
em andamento, atraso do event loop, memória, imagens OG). O painel mostra tudo em Fonte e Monitor.

Comandos: `relogio` (iniciar · pausar · retomar · reiniciar), `velocidade`, `saltar-tempo`, `saltar-pct`,
`cenario` (parcial), `preset`, `fonte` (`pre` · `simulacao` · `tse`), `aviso` (faixa para todos os visitantes),
`congelar` (simula instabilidade: números param), `tse` (códigos e intervalo do feed), `nomes-reais`, `patrocinio` e
`troca-auto` (`ligar` · `desligar` · `agora` · `adiar` com `para` = epoch ms ou `null` para o horário padrão). Cada
comando incrementa a `versao`, que invalida o cache dos clientes e da CDN, e é gravado em `STATE_DIR/admin.json`
(escrita atômica).

Na VPS, os mesmos comandos sem navegador: `deploy/painel.sh` (estado, `trocar-agora`, `adiar`, `marcar`, `fonte pre`,
`aviso`/`alerta`/`sem-aviso`, `tse`, `testar-tse`; recusa a simulação). Com `curl`, em desenvolvimento:

```bash
curl -c jar -H 'content-type: application/json' -d '{"senha":"sintonia"}' localhost:8787/api/admin/login
curl -b jar -H 'content-type: application/json' -d '{"tipo":"saltar-pct","pct":50}' localhost:8787/api/admin/command
curl -b jar localhost:8787/api/admin/tse/test
```

### Noite da eleição (25/10)

Roteiro operacional completo (horários, comandos, contingência): [`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md). Resumo
do comportamento do servidor:

1. **Antes das 17h**: deixe a fonte em `pre` (padrão; as páginas mostram o 1º turno real com a contagem regressiva).
   No painel → Fonte, use "Testar conexão": além de ler o feed, ele confere os códigos do 2º turno contra o
   `ele-c.json` do TSE e avisa se algo não bater (ver [`src/tse/README.md`](./src/tse/README.md) §4).
2. **Às 17h, sozinho** (`TSE_AUTO`, ligado em produção): o servidor confere se o feed do TSE responde e troca a fonte
   para `tse`. Se o TSE não responder, a fonte continua `pre`, o site mostra o aviso discreto "Aguardando os primeiros
   dados do TSE" (só se não houver um aviso seu publicado) e o servidor tenta de novo em 15 s, 30 s, 60 s e depois a
   cada 2 min — tudo no log e no painel (Fonte → "Troca automática para o TSE": estado, tentativas, último erro e a
   próxima tentativa). No painel dá para **desligar**, **adiar** (+5 min, +15 min, +1 h ou um horário de Brasília) e
   **trocar agora**. Trocar a fonte à mão continua valendo a qualquer momento; depois de feita (automática ou à mão,
   após o horário) a troca não se repete — "ligar" de novo rearma.
3. **Durante a apuração**: se o TSE ficar instável, o adaptador mantém o último dado bom (as páginas mostram o horário
   da última seção totalizada, mas não avisam da queda sozinhas); publique um `aviso` se precisar. A simulação não pode
   ir ao ar por engano em produção (`ALLOW_SIMULACAO`). As imagens de compartilhamento ao vivo se renovam a cada 30 s
   (uma imagem parada há mais de 90 s espera a nova, em vez de sair vencida para o robô do X).
4. **Fim**: quando o TSE conclui Presidente e nenhuma disputa de governador segue apurando, o `/api/status` público
   passa à fase `encerrada` (cabeçalho, home, widgets e TV deixam de dizer "ao vivo"; `tseTudoEncerrado` em
   `src/server/app.ts`). O `/healthz` e o painel continuam mostrando a fase do motor (`apurando`).

**Ensaio**: `TSE_INICIO=2026-10-20T15:00:00-03:00` (ou "Marcar para" no painel) faz a troca acontecer nesse horário.
A troca, o feed, a API e o painel funcionam como na noite, mas as **páginas** continuam na fase `pre` (1º turno e
contagem regressiva) até `INICIO_APURACAO` (17h de 25/10): a fase de `fonte: 'tse'` depende da data da eleição, não do
`TSE_INICIO` (ensaio geral de 12/10/2026). Para ver as telas da noite num ensaio é preciso adiantar o relógio do
processo (o ensaio geral usou um `--import` que desloca o `Date` do Node e do navegador). Depois do ensaio: apague o
`TSE_INICIO`, volte a fonte para `pre` e confira "agendada para 17:00:00 de 25/10" — uma troca registrada **antes** do
horário em vigor não conta, então não é preciso "rearmar" (antes desta correção, o `feitaEm` do ensaio impedia a
troca do dia 25). Com os códigos do 1º turno (`{"tipo":"tse","tse":{"eleicaoPres":"6257","eleicaoGov":"6259","pleito":"3220"}}`) o
servidor serve o 1º turno real pelo caminho ao vivo (Brasil, UF, município, zona e boletim de urna decodificado);
volte depois para `6258`/`6260`/`3221` e para o horário padrão.

---

## Dados

Pipeline em `scripts/data`: brutos em `data-raw/` (ignorado pelo git, com cache), saída commitada em `public/data` e
`public/geo`.

### Mapa nacional por município e ordem canônica dos municípios

```bash
npx tsx scripts/data/fetch-ibge.ts              # cache das malhas IBGE v4 em data-raw/ibge (~16 MB; não rebaixa)
npx tsx scripts/data/build-geo-br-mun.ts        # → public/geo/br-mun.json + public/data/municipios-br.json (~15 s)
npx tsx scripts/data/geo-lib/preview-br-mun.ts  # QA: screenshots, frestas, alinhamento e tempo do <canvas> (preview-out/)
```

Precisa antes de `public/geo/br.json` (mesma projeção e enquadramento, conferidos pelo script) e de
`public/data/uf/*.json` (ordem dos municípios). O script une as 27 malhas por UF numa topologia única (divisas sem
frestas), simplifica até caber em ~1,85 MB (`--orcamento=MB` muda o alvo; `--limiar=px²` fixa o limiar) e para com
erro se faltar município, se a ordem divergir do cadastro do TSE ou se o viewBox não for o do `br.json`.

### 1º turno real por seção e locais de votação

```bash
python3 -I scripts/data/py/secao_download.py   # ZIPs de dados abertos do TSE → data-raw/tse-abertos/ (~950 MB; cache por tamanho)
python3 -I scripts/data/py/locais_build.py     # → public/data/locais/{uf}.json (~40 s)
python3 -I scripts/data/py/secao_build.py      # → public/data/secao/{uf}.json (~2,5 min; lê o índice do local de locais/)
npx tsx scripts/data/validate-secao.ts         # conferência independente em TS (+ boletins de urna de 6 seções do feed; --sem-bu sem rede)
python3 -I scripts/data/py/locais_nomes.py     # autotestes da capitalização dos nomes/endereços
```

Fontes (`cdn.tse.jus.br/estatistica/sead/odsele/`, lidas em streaming de dentro do ZIP, latin-1/`;`):
`votacao_secao_2026_BR.zip` (Presidente) e `_{UF}.zip` das UFs de `UFS_GOV_2T` (Governador; hoje AC, AM, DF, ES, RN e TO), `detalhe_votacao_secao_2026.zip`
(aptos, comparecimento, brancos, nulos) e `eleitorado_local_votacao_2026.zip` (seção → local, 1º turno; o 2º turno
entra no campo extra `segundoTurno`: seções que mudam de local em 25/10 e também as de locais que mantêm o número mas
mudam de nome/endereço no cadastro do 2º turno — o TSE reaproveita o `NR_LOCAL_VOTACAO`, às vezes para outro prédio).
Precisa de `public/data/uf/*.json` (ordem canônica e conferência) e, para validar
as coordenadas dos locais por município, de `data-raw/ibge/mun/{uf}.topo.json` (`fetch-ibge.ts`). As regras
(finalistas a/b, "outros", nulos técnicos, `gov.aptos`, agregadas, capitalização) estão no topo de cada script. Os
scripts param com erro se qualquer seção ou município não fechar com o dataset da fase 1.

### Candidatos, fotos oficiais e 1º turno de todos os cargos

```bash
npx tsx scripts/data/py/cargos_build.ts        # feed → public/data/cargos/{governador-t1,senado,camara,assembleia}.json (~1 s)
npx tsx scripts/data/py/candidatos_build.ts    # feed + consulta_cand + bem_candidato → public/data/candidatos/*.json (~5 s)
python3 -I scripts/data/py/fotos_build.py      # fotos do TSE → public/data/fotos/{grupo}.json (~2 min na 1ª vez; depois cache)
npx tsx scripts/data/build-data.ts && npx tsx scripts/data/validate.ts   # meta.json com sqcand/fotoGrupo dos finalistas
```

Todos aceitam `--offline` (só cache); `cargos_build.ts --refresh` rebaixa os arquivos do feed (use quando o TSE
retotalizar). Se uma UF voltar a "Aguarde reprocessamento da eleição" (votos completos, sem eleitos — o AM ficou
assim de 09/10 até 10/10/2026 10:14), a lista sai com `aviso` e `camara-{uf}`/`assembleia-{uf}` sem fichas até o TSE
concluir; votos anulados em definitivo depois da eleição (`van`, ex.: AM, Dep. Estadual) ficam nos válidos
computados, como no `vvc` do TSE. Nomes de exibição: `nomeSimples` em `candidatos_comum.ts` (siglas "ACM Neto", "da
CUT", romanos "Silva II", parênteses, apóstrofos; casos em `scripts/data/nomes.test.ts`). Fontes, com
cache: feed `ele2026/6259/dados/{uf}/{uf}-c000{3,5,6,7|8}-e006259-u.json` (Governador, Senador, Dep. Federal,
Dep. Estadual; 8 = Distrital, só no DF) e `ele2026/6257`/`6258` (Presidente) em `data-raw/tse/` (~6 MB);
`consulta_cand_2026.zip` e `bem_candidato_2026.zip` em `data-raw/tse-abertos/` (~7 MB); fotos
`ele2026/{6258|6259}/fotos/{br|uf}/{sqcand}.jpeg` em `data-raw/fotos/` (~15 MB, concorrência 8).

- **Cargos** (`CargoDataset`): Senado e Governador com todos os candidatos; Câmara e Assembleias com eleitos + 20 mais
  votados não eleitos por UF, partidos (votos válidos nominais + legenda, eleitos, federação) e `composicao` nacional.
  `validos` = válidos computados do TSE (com os anulados sub judice) e `pct` = `pvap` publicado (conferido; voto > 0
  que arredondaria a 0,00% aparece como 0,01%, igual ao TSE). No Senado (2 vagas) cada eleitor vota 2 vezes:
  validos + brancos + nulos = 2 × comparecimento. Os cargos estaduais têm ~182 mil eleitores a menos que Presidente
  (eleitores em trânsito de outras UFs só votam para Presidente); seções e eleitorado conferem com a fase 1.
- **Fichas** (`{ grupo, candidatos: CandidatoFicha[], aviso? }`): `segundo-turno` (Presidente e os Governadores de `UFS_GOV_2T`, cada um
  seguido do vice), `governadores` (eleitos no 1º turno), `senado` (todos), `camara-{uf}` e `assembleia-{uf}` (eleitos).
  `index.json` = `{ colunas, linhas }` com sqcand, nome de urna, número, partido, cargo, UF e grupo (busca e rota
  `/candidato/:sqcand`). Nome = `nm` do feed (já traz o nome social); CPF, título e e-mail nunca entram. O arquivo de
  2026 só traz a UF de nascimento (`naturalidade` = nome da UF). Patrimônio = soma exata (centavos) dos bens
  declarados, conferida contra os arquivos por UF.
- **Fotos** (`FotoPacote`): os mesmos grupos; retrato 120×160 (cobre e recorta o mínimo no centro, Lanczos), sem
  nenhum outro ajuste; WebP q70 (~2,4 KB/foto), exceto `segundo-turno` em JPEG q85, que o servidor usa nas imagens de
  compartilhamento (satori/resvg não leem WebP). Orçamento: ≤ 10 MB no total (hoje ~4,4 MB).

### Perfil do eleitorado ("quem vota aqui")

```bash
python3 -I scripts/data/py/perfil_build.py      # baixa perfil_eleitorado_2026.zip (408 MB, cache) → public/data/perfil/{uf}.json (~20 s)
npx tsx scripts/data/py/perfil_validate.ts      # conferência independente em TS (contrato, somas, fase 1)
```

Fonte: `perfil_eleitorado/perfil_eleitorado_2026.zip` (um CSV por UF + ZZ, lido em streaming; recorte único, cadastro
de 14/07/2026). Saída `PerfilUfDataset` (28 arquivos, ~2,7 MB), por município (código TSE) e total da UF: 22 faixas
etárias × gênero (`idade = [fem[], masc[]]`; gênero não informado e idade "Inválida" em `naoInformado`), escolaridade
(Analfabeto → Superior completo + "Não informado"), deficiência e nome social. Extras opcionais além do contrato:
`dataReferencia`, `estadoCivil`, `racaCor`, `identidadeGenero` (rótulos no topo; somam `eleitores`), `biometria`,
`quilombola` e `interpreteLibras` (quem declarou SIM). Raça/cor, identidade de gênero, quilombola e Libras são
autodeclarações recentes: ~79% do eleitorado ainda aparece como "Não informado". Totais EXATOS (extras): `genero` =
[feminino, masculino, não informado] com todas as idades (rótulos em `generos`); `idadeSemGenero` (por faixa, gênero
não informado) e `idadeInvalida` só quando não são zero — total da faixa i = `idade[0][i] + idade[1][i] +
idadeSemGenero[i]`, e `naoInformado` = Σ `idadeSemGenero` + `idadeInvalida` (no país: 23.336 sem gênero, 1.212 com
idade inválida).

O perfil conta o eleitor no **domicílio eleitoral**; o eleitorado da fase 1 (aptos do 1º turno) conta onde ele
**vota**, com o voto em trânsito. Por isso os municípios diferem um pouco (capitais e cidades grandes recebem
eleitores em trânsito: São Paulo −9.717, Brasília −5.188), e o total nacional fecha em 158.745.463 × 158.745.502
(−39). Se `eleitorado_local_votacao_2026.zip` estiver no cache (`secao_download.py`), o script confere que perfil ==
Σ `QT_ELEITOR_SECAO` e fase 1 == Σ `QT_ELEITOR_ELEICAO_FEDERAL` em todos os 5.757 municípios (para com erro se não).
Também para com erro se surgir código/rótulo do TSE não previsto, mais de uma data de geração, ou se os municípios
não forem os de `public/data/uf/*.json`.

### Curiosidades e calculadora de cenários (fase 3)

```bash
npm run data:presidente-t1     # = npx tsx scripts/data/presidente-t1.ts → public/data/presidente-t1.json (~1 s)
npm run data:curiosidades      # = npx tsx scripts/data/curiosidades.ts  → public/data/curiosidades.json (~2 s)
npx tsx scripts/data/curiosidades.ts --stdout    # só confere e imprime (não grava); idem presidente-t1.ts --stdout
npx vitest run scripts/data/curiosidades.test.ts src/shared/cenarios.test.ts   # recálculo independente e regras
```

- **`presidente-t1.json`** (`PresidenteT1Dataset`, `src/shared/cenarios.ts`): os 12 candidatos a Presidente no 1º turno,
  votos por UF + exterior. Soma os municípios de `public/data/uf/*.json` e tira número, nome de urna e partido do arquivo
  nacional do feed (`data-raw/tse/ele2026/6257/dados/br/br-c0001-e006257-u.json`; baixa só esse arquivo se faltar).
  Aborta se qualquer UF não bater com o arquivo da UF no TSE, se a soma não bater com o Brasil e com `meta.json`, ou se
  os finalistas/"Outros" não baterem com a race `pres-t1`.
- **`curiosidades.json`** (`CuriosidadesDataset`, `src/shared/curiosidades.ts`): os fatos do 1º turno. Lê **só** o
  dataset compilado (`public/data/**`: `uf/`, `secao/`, `locais/`, `perfil/`, `cargos/`, `candidatos/`, `meta.json`) —
  rode depois de qualquer pipeline acima que mude esses arquivos (mulheres e 70+ usam os totais exatos do perfil:
  `genero`, `idadeSemGenero`). Aborta se os totais não baterem com
  `meta.totaisPrimeiroTurno`, se faltar número num fato, se título > 48 ou texto > 200 caracteres, ou se aparecer NaN.
  Regras editoriais (pares simétricos, pisos, nenhuma seção unânime) no topo do script e em `ARCHITECTURE.md` §11.3.
- Os dois arquivos são estáticos e vão para `dist/data` e `dist-demo/data` no build; o servidor lê o mesmo
  `curiosidades.json` para as meta tags e a imagem de `/curiosidades?fato=`.

### Mudança no quadro do 2º turno (Governador)

A lista de UFs com 2º turno de Governador tem **uma fonte só**: `UFS_GOV_2T` em `src/shared/constants.ts` (o
`secao_comum.py` lê a mesma linha). O pipeline de dados, o motor, o servidor, as imagens OG e **todos** os textos do app
(página `/governadores`, faixas da home e da apuração, menu "Mais", busca, 404, metodologia, admin, cartões de
compartilhar, meta tags) derivam dela — `src/shared/gov2t.ts` monta "6 disputas", "AC, AM, DF, ES, RN e TO" etc.;
nenhum texto traz o número fixo. Se uma retotalização do TSE mudar o quadro, `cargos_build.ts` para com a explicação
(UF, candidato eleito e horário do feed).

**Situação (aplicada em 12/10/2026): o RJ saiu do 2º turno.** Fonte: TSE, arquivo
`ele2026/6259/dados/rj/rj-c0003-e006259-u.json` gerado em **10/10/2026 15:09:50** (totalização 15:07:39). Na
retotalização os 274.411 votos do candidato 10 (antes "anulados sub judice") viraram nulos técnicos: **Douglas Ruas
(PL, 22) "Eleito" no 1º turno com 50,88%** dos válidos; Eduardo Paes (PSD, 55) "Não eleito", 44,16%. Confirmam:
`comum/config/ele-c.json` (pleito 3221 lista a eleição 6260 só para AC, AM, DF, ES e RN), o 6260 do RJ (404) e o
`consulta_cand_2026.zip` de 11/10/2026 19:31:40 (Douglas Ruas "ELEITO", nenhuma linha de 2º turno no RJ). Efeito:
`meta.json` com 14 corridas (sem `gov-rj`/`gov-rj-t1`: como nas outras UFs que elegeram no 1º turno, o resultado do RJ
fica em `cargos/governador-t1.json`); 21 governadores eleitos no 1º turno (Douglas Ruas com a foto oficial no grupo
`governadores`); `candidatos/segundo-turno` com 28 fichas (sem os dois finalistas do RJ e os vices); `uf/rj.json` e
`secao/rj.json` sem governador; curiosidades "20 → 21 governadores eleitos". Links antigos (`?race=gov-rj` na
apuração, na TV e nos widgets) caem em Presidente; um estado salvo do admin com alvo para `gov-rj` perde só essa chave.

**Tocantins (conferido de novo em 12/10/2026, ~14h30):** o arquivo do 1º turno (`to-c0003-e006259-u.json`, gerado em
04/10/2026 21:18:59) ainda marca Professora Dorinha (UNIÃO, 44) e Vicentinho Júnior (PSDB, 45) como "2º turno",
embora o 6260 de TO dê 404 e TO não esteja na lista da eleição 6260. **TO continua no quadro** (é o resultado oficial
publicado); o "Testar conexão" do admin avisa que TO ainda não tem arquivo, e a corrida fica em "aguardando" (nunca
número inventado) até o TSE publicar. Acompanhe com `npx tsx scripts/data/fetch-tse.ts` (diz quantos arquivos 6260
faltam) e com o arquivo do 1º turno de TO.

**Procedimento: tirar ou pôr uma UF** (ex.: o TO, se o TSE publicar "Eleito" no 1º turno):

```bash
# 0) confira no TSE: situação ("st") dos candidatos no 1º turno e a lista da eleição 6260 no ele-c.json
curl -s https://resultados.tse.jus.br/oficial/ele2026/6259/dados/to/to-c0003-e006259-u.json | grep -o '"st":"[^"]*"' | sort | uniq -c
# 1) edite SÓ a linha UFS_GOV_2T em src/shared/constants.ts (uma linha, ordem alfabética; o Python lê essa linha)
# 2) dados (cada passo confere e para com erro se algo não fechar)
npx tsx scripts/data/fetch-tse.ts && npx tsx scripts/data/py/cargos_build.ts --refresh   # feed novo; 2º turno = UFS_GOV_2T
npx tsx scripts/data/build-data.ts && npx tsx scripts/data/validate.ts                    # meta.json e uf/
python3 -I scripts/data/py/secao_build.py && npx tsx scripts/data/validate-secao.ts      # secao/ (governador só nas UFs do quadro)
npx tsx scripts/data/py/candidatos_build.ts && python3 -I scripts/data/py/fotos_build.py # fichas e fotos oficiais
npm run data:curiosidades                                                                  # "N governadores eleitos"
# 3) conferência completa
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.server.json --noEmit && npx vitest run
```

Os testes derivam o quadro de `UFS_GOV_2T` e usam AM, DF, AC e ES (com o 6260 já publicado) nos casos pontuais, então
tirar o TO não exige mexer em teste. Ao **pôr** uma UF nova, acrescente o alvo neutro dela em `NEUTROS`
(`src/engine/tests/engine.test.ts`, o teste mostra o valor) e, se quiser vê-la na vitrine `/kit`, os finalistas em
`GOV` (`src/app/fixtures/core.ts`). Depois do deploy, limpe o cache da CDN de `/data/*` (ver `DEPLOY.md`): o
`meta.json` novo muda a versão do dataset e as imagens OG mudam de endereço sozinhas.

## Fontes de dados

- **TSE** — [resultados.tse.jus.br](https://resultados.tse.jus.br/oficial): estrutura real de municípios, zonas e
  seções e resultado oficial do 1º turno (04/10/2026), compilados em `public/data` por `npm run data:fetch` +
  `npm run data:build`; no 2º turno, o feed ao vivo (fonte `tse`, `src/tse`). Detalhes dos arquivos, fusos e
  estratégia de polling em `src/tse/README.md`.
- **IBGE** — [malhas territoriais](https://servicodados.ibge.gov.br/api/docs/malhas) (UFs e municípios), projetadas e
  simplificadas em `public/geo`.
- **Simulação** — motor determinístico em `src/engine` sobre a estrutura real do país; sempre sinalizada com a faixa
  "SIMULAÇÃO · dados fictícios" no app e nas imagens de compartilhamento.
- **Fontes tipográficas** — Inter e Bricolage Grotesque (Google Fonts, SIL Open Font License 1.1; textos das
  licenças em `src/server/assets/fonts/OFL-*.txt`), usadas nas imagens de compartilhamento; JetBrains Mono (OFL) via
  `@fontsource`.
