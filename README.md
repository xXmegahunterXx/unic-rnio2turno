# Sintonia

Apuração ao vivo do 2º turno das eleições de 25/10/2026 (estado, município, zona e seção), **Teste Cego** de
propostas e um **simulador administrável** da noite da apuração. Apartidário por construção: cores neutras por
ordem do número na urna, textos descritivos, sem enquetes e sem dados pessoais do Teste Cego no servidor.

Arquitetura e regras: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · guia para agentes: [`CLAUDE.md`](./CLAUDE.md) ·
adaptador do TSE: [`src/tse/README.md`](./src/tse/README.md).

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

### Variáveis de ambiente do servidor

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | porta e interface HTTP |
| `NODE_ENV` | — | `production`: serve `dist/`, cookie `Secure`, HSTS, exige `ADMIN_PASSWORD` |
| `ADMIN_PASSWORD` | dev: `sintonia` | senha do painel. **Produção sem ela = admin desabilitado (503)** |
| `ADMIN_SECRET` | aleatório por processo | segredo HMAC-SHA256 do cookie de sessão (≥ 16 caracteres). Defina para as sessões sobreviverem a reinícios e valerem em todas as instâncias |
| `PUBLIC_URL` | Host da requisição | origem pública (`https://sintonia.app`) usada em `og:image`/`og:url` |
| `TRUST_PROXY` | desligado | `1` atrás de CDN/balanceador: IP do cliente por `CF-Connecting-IP`/`X-Forwarded-For` (limite de login e contagem de clientes) |
| `DATA_DIR` | `public/data` (dev) · `dist/data` (produção) | dataset (`meta.json`, `uf/*.json`) |
| `DIST_DIR` | `dist` | build do app servido em produção |
| `STATE_DIR` | `.server-state` | estado do admin (`admin.json`) e histórico do TSE (`tse-historico.json`) |
| `SIM_AUTOSTART` | — | `1`: sobe simulando a 20× (se não houver simulação/TSE em curso) · `force`: sempre |
| `SERVE_STATIC` | só em produção | `1`/`0` força servir (ou não) o `DIST_DIR` |
| `FONTS_DIR` | `dist-server/assets/fonts` | fontes TTF das imagens de compartilhamento |

---

## Deploy

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

- **Subida**: ~1 s (lê o dataset, constrói o modelo de 499.248 seções em ~0,7–1,3 s, restaura o estado salvo).
- **Saúde**: `GET /healthz` → `{ ok, fonte, fase, versao, uptimeSeg, memoriaMb, tse }` (`no-store`).
- **Encerramento gracioso**: `SIGTERM`/`SIGINT` param de aceitar conexões, param o polling do TSE e gravam o que
  estiver pendente (limite de 10 s). Keep-alive de 65 s (maior que o dos balanceadores comuns).
- **Memória**: ~180 MB parado, ~360 MB sob carga.
- **Log**: uma linha por evento no stdout (`2026-10-25T20:00:00.000Z info  …`) e, a cada minuto com tráfego, um
  resumo: requisições, latência de processamento (p50/p95/p99), acerto do cache, 304, 5xx e clientes estimados.
  Nunca registramos IP, cookie, senha nem o código de um Duelo.

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
| `GET /api/og/teste.png` | `public, max-age=86400, s-maxage=86400` | cartão do Teste Cego |
| `/assets/*` | `public, max-age=31536000, immutable` | nomes com hash do Vite |
| demais arquivos (`/geo`, `/data`, favicon) | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` | com ETag |
| páginas (SPA) | `no-cache` | `index.html` com meta tags OG/Twitter da rota |
| `/api/admin/*`, `/healthz` | `no-store` | nunca cachear |

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

### Capacidade medida (1 processo, 1 núcleo, contêiner de 4 vCPUs, sem CDN)

Simulação rodando a 20× com 50% das seções apuradas, 200 conexões keep-alive por 15 s, `Accept-Encoding: br`:

| Rota | req/s | p50 | p95 | p99 | resposta |
|---|---|---|---|---|---|
| `/api/apuracao/pres/br` | 13.402 | 13 ms | 29 ms | 43 ms | 4,8 KB (br) |
| `/api/apuracao/pres/uf/sp` | 13.126 | 13 ms | 29 ms | 43 ms | 36,5 KB (br) |
| `/api/status` (sem compressão) | 15.101 | 13 ms | 20 ms | 26 ms | 0,4 KB |

Com dois geradores de carga em paralelo o servidor satura em ~13 mil req/s (100% de 1 núcleo), sem erros.

Tamanhos (bruto → gzip → br): Brasil 21,0 → 5,0 → 4,5 KB · UF SP 210,7 → 37,1 → 35,6 KB · UF MG 274,6 → 47,5 → 45,3 KB ·
município SP 55,6 → 20,4 → 19,3 KB · zona 57,8 → 8,0 → 7,3 KB · seção 0,3 KB · meta 16,6 → 3,1 → 2,9 KB.

### Várias instâncias

O motor é determinístico: mesma configuração ⇒ mesmos números **e mesmos ETags** em qualquer instância (conferido
com duas instâncias lado a lado). Instâncias que compartilham o `STATE_DIR` (mesma máquina ou volume compartilhado:
PM2, `docker compose --scale`) convergem para o `admin.json` mais recente em ≤ ~1 s; com o mesmo `ADMIN_SECRET`, a
sessão do admin vale em todas. Em máquinas sem volume compartilhado, use uma única origem atrás da CDN (a CDN
absorve o tráfego; a origem aguenta ~13 mil req/s por núcleo).

Limitação conhecida: trocar o **cenário/preset** reconstrói o modelo na thread principal (~0,7–1,3 s); nesse
intervalo as requisições esperam (a CDN continua servindo o conteúdo anterior com `stale-while-revalidate`).

### Segurança

- Admin: senha comparada em tempo constante; cookie `sintonia_admin` assinado (HMAC-SHA256), `HttpOnly`,
  `SameSite=Strict`, `Path=/api/admin`, `Secure` em produção, validade de 12 h, revogado no logout; 10 tentativas de
  login por minuto por cliente (300/min no total) → 429 com `Retry-After`; `POST` só com `application/json` (sem
  CSRF por formulário); corpo ≤ 64 KB; comandos validados com zod (`src/server/validation.ts`).
- Cabeçalhos: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN` nas páginas,
  HSTS em produção, `X-Robots-Tag: noindex` em `/admin` e `/duelo/*`.
- Imagens OG: geradas uma por vez (no máximo 16 na fila; excesso → 503 com `Retry-After`), com a imagem anterior da
  mesma fonte servida enquanto a nova é gerada.

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

Comandos: `relogio` (iniciar · pausar · retomar · reiniciar), `velocidade`, `saltar-tempo`, `saltar-pct`,
`cenario` (parcial), `preset`, `fonte` (`pre` · `simulacao` · `tse`), `aviso` (faixa para todos os visitantes),
`congelar` (simula instabilidade: números param) e `tse` (códigos e intervalo do feed). Cada comando incrementa a
`versao`, que invalida o cache dos clientes e da CDN, e é gravado em `STATE_DIR/admin.json` (escrita atômica).

```bash
curl -c jar -H 'content-type: application/json' -d '{"senha":"sintonia"}' localhost:8787/api/admin/login
curl -b jar -H 'content-type: application/json' -d '{"tipo":"saltar-pct","pct":50}' localhost:8787/api/admin/command
curl -b jar localhost:8787/api/admin/tse/test
```

**Na noite da eleição** (25/10): antes das 17h deixe a fonte em `pre` (as páginas mostram o 1º turno real com a
contagem regressiva); rode `tse/test`; às 17h troque a fonte para `tse`. Se o TSE ficar instável, o adaptador
mantém o último dado bom; publique um `aviso` se precisar. **Ensaio**: com a fonte `tse` e os códigos do 1º turno
(`{"tipo":"tse","tse":{"eleicaoPres":"6257","eleicaoGov":"6259","pleito":"3220"}}`) o servidor serve o 1º turno
real pelo caminho ao vivo (Brasil, UF, município, zona e boletim de urna decodificado); volte depois para
`6258`/`6260`/`3221`.

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
npx tsx scripts/data/validate-secao.ts         # conferência independente em TS (+ 7 boletins de urna do feed; --sem-bu sem rede)
python3 -I scripts/data/py/locais_nomes.py     # autotestes da capitalização dos nomes/endereços
```

Fontes (`cdn.tse.jus.br/estatistica/sead/odsele/`, lidas em streaming de dentro do ZIP, latin-1/`;`):
`votacao_secao_2026_BR.zip` (Presidente) e `_{AC,AM,DF,ES,RJ,RN,TO}.zip` (Governador), `detalhe_votacao_secao_2026.zip`
(aptos, comparecimento, brancos, nulos) e `eleitorado_local_votacao_2026.zip` (seção → local, 1º turno; o 2º turno
entra no campo extra `segundoTurno`). Precisa de `public/data/uf/*.json` (ordem canônica e conferência) e, para validar
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
retotalizar — em 09/10/2026 os deputados do AM estavam em "Aguarde reprocessamento da eleição": votos completos, sem
eleitos; as listas do AM saem com `aviso` e `camara-am`/`assembleia-am` sem fichas até o TSE concluir). Fontes, com
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
- **Fichas** (`{ grupo, candidatos: CandidatoFicha[], aviso? }`): `segundo-turno` (Presidente e 7 Governadores, cada um
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
autodeclarações recentes: ~79% do eleitorado ainda aparece como "Não informado".

O perfil conta o eleitor no **domicílio eleitoral**; o eleitorado da fase 1 (aptos do 1º turno) conta onde ele
**vota**, com o voto em trânsito. Por isso os municípios diferem um pouco (capitais e cidades grandes recebem
eleitores em trânsito: São Paulo −9.717, Brasília −5.188), e o total nacional fecha em 158.745.463 × 158.745.502
(−39). Se `eleitorado_local_votacao_2026.zip` estiver no cache (`secao_download.py`), o script confere que perfil ==
Σ `QT_ELEITOR_SECAO` e fase 1 == Σ `QT_ELEITOR_ELEICAO_FEDERAL` em todos os 5.757 municípios (para com erro se não).
Também para com erro se surgir código/rótulo do TSE não previsto, mais de uma data de geração, ou se os municípios
não forem os de `public/data/uf/*.json`.

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
