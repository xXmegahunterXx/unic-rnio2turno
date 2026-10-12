# Colocando o Sintonia no ar (VPS)

Guia para quem não é especialista em servidores. No fim você terá o site em `https://seu-dominio`, com
certificado HTTPS automático, atualização com um comando, backup de hora em hora e um painel de situação.

**Resumo em 5 passos**

1. Contrate uma VPS com **Ubuntu 24.04** (ou 22.04): 2 vCPU e 4 GB de RAM no mínimo; **4 vCPU e 8 GB** para a
   noite da eleição.
2. No DNS do seu domínio, crie um registro **A** apontando para o IP da VPS.
3. Entre na VPS (`ssh root@IP-DA-VPS`) e rode o instalador (seção 3).
4. Abra `https://seu-dominio` e o painel em `https://seu-dominio/admin`.
5. Recomendado para a noite: coloque a **Cloudflare** na frente (seção 5).

Arquivos envolvidos: `Dockerfile`, `docker-compose.yml`, `.env` (criado a partir de `.env.example`) e a pasta
`deploy/` (scripts e a configuração do Caddy). Detalhes técnicos do servidor (cache, rotas, segurança) estão no
[README](./README.md#deploy).

---

## 1. Do que você precisa

| Item | Detalhe |
|---|---|
| VPS | Ubuntu 24.04 LTS ou 22.04 LTS (Debian 12 também funciona), acesso root por SSH, IPv4 público. Região no Brasil (São Paulo) dá menos latência; com Cloudflare na frente isso pesa pouco |
| Tamanho | **Mínimo:** 2 vCPU, 4 GB RAM, 25 GB de disco. **Noite da eleição:** 4 vCPU, 8 GB RAM. Dá para aumentar a VPS na véspera e reduzir depois (a maioria dos provedores faz isso em minutos) |
| Domínio | Com acesso ao painel de DNS (no registrador ou na Cloudflare) |
| Portas | 22 (SSH), 80 e 443 liberadas também no firewall do **provedor**, se ele tiver um ("security group", "firewall de rede") |
| Repositório | O endereço do repositório no GitHub. Se for privado, um token de leitura ou uma "deploy key" (seção 3.2) |

Por que esses tamanhos (medidos): o app usa ~250 MB parado e ~350 MB com 100 conexões simultâneas; o Caddy,
~30 MB; montar a imagem (build) usa ~1 GB por alguns minutos. Um processo do app responde ~13 mil requisições
por segundo em 1 núcleo, e as imagens de compartilhamento (cartões do X) usam CPU. Com 4 vCPU/8 GB sobra folga
para picos, para um build no meio da noite e para o plano B de várias instâncias (seção 10).

## 2. DNS

No painel de DNS do domínio:

| Tipo | Nome | Valor | Observação |
|---|---|---|---|
| A | `@` (o domínio) | IP da VPS | obrigatório |
| A | `www` | IP da VPS | só se quiser `www.seu-dominio` (o instalador pergunta; o www redireciona para o domínio) |

- **Não crie registro AAAA (IPv6) para a VPS.** Atrás do Docker, visitantes por IPv6 chegariam ao app com o
  mesmo endereço, o que estraga a contagem de "pessoas agora" e o limite de tentativas de login. Com a Cloudflare
  na frente, quem usa IPv6 continua acessando normalmente (a Cloudflare atende IPv6 e fala com a VPS por IPv4).
- Se usar a Cloudflare: deixe o registro como **"Somente DNS" (nuvem cinza)** até o instalador terminar e o
  HTTPS funcionar; depois ligue o proxy (nuvem laranja) — seção 5.
- TTL baixo (5 min) ajuda se precisar trocar de VPS às pressas.
- Para conferir: `dig +short seu-dominio` (ou o site dnschecker.org) deve mostrar o IP da VPS.

## 3. Instalação

### 3.1 Repositório público

```bash
ssh root@IP-DA-VPS
apt-get update && apt-get install -y git
git clone https://github.com/xXmegahunterXx/unic-rnio2turno.git /opt/sintonia
/opt/sintonia/deploy/install.sh
```

Se o código de produção estiver num branch específico, clone com `--branch nome-do-branch`.

### 3.2 Repositório privado

**Opção A — token (mais simples).** No GitHub: *Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token*, escolha só este repositório e a permissão *Contents: Read-only*. Na VPS:

```bash
ssh root@IP-DA-VPS
TOKEN=github_pat_xxxxxxxx      # cole o token
curl -fsSL -H "Authorization: Bearer $TOKEN" \
  https://raw.githubusercontent.com/xXmegahunterXx/unic-rnio2turno/main/deploy/install.sh -o install.sh
GIT_TOKEN=$TOKEN BRANCH=main bash install.sh
```

(troque `main` pelo branch de produção). O token fica guardado só para o root em
`/root/.config/sintonia/git-credentials` e é usado nas atualizações.

**Opção B — deploy key (sem token).** Baixe o `install.sh` de outro jeito (copie e cole o conteúdo num arquivo,
ou `scp deploy/install.sh root@IP:` do seu computador) e rode:

```bash
DEPLOY_KEY=1 BRANCH=main bash install.sh
```

O script cria uma chave SSH, mostra a chave pública e espera você cadastrá-la no GitHub em *repositório →
Settings → Deploy keys → Add deploy key* (deixe **"Allow write access" desmarcado**). Depois é só apertar Enter.

### 3.3 O que o instalador pergunta e faz

Ele pergunta:

1. **Domínio** (ex.: `sintonia.app`) e se quer atender também o `www`;
2. **E-mail** para o Let's Encrypt (avisos sobre o certificado);
3. **Senha do painel** — aperte Enter para gerar uma senha forte (ela aparece no fim; guarde-a);
4. **Perfil do X** para os cartões de link (opcional).

E faz, nesta ordem (≈ 5–10 min na primeira vez):

1. instala o Docker pelo repositório oficial (se ainda não houver);
2. liga o firewall `ufw` liberando SSH, 80, 443 e 443/udp (HTTP/3);
3. cria 2 GB de swap se a máquina não tiver (o build usa memória);
4. clona o código em `/opt/sintonia`;
5. cria `/opt/sintonia/.env` (permissão 600) com domínio, senha e um segredo aleatório para as sessões;
6. monta a imagem, sobe o app e o Caddy, espera o `/healthz` responder e confere o HTTPS;
7. agenda o backup de hora em hora (`/etc/cron.d/sintonia`) e já faz o primeiro.

Pode rodar o instalador de novo quando quiser: o que já existe é mantido (o `.env` nunca é sobrescrito, a
senha não muda e, se a imagem já for a do código atual, nada é reconstruído).

Sem perguntas (automação): `DOMINIO=sintonia.app ACME_EMAIL=voce@exemplo.com NAO_INTERATIVO=1 bash install.sh`
(a senha é gerada e mostrada no fim). Outras opções no topo do `deploy/install.sh` (`INSTALL_DIR`, `SWAP_GB`,
`SEM_FIREWALL`, `SEM_CRON`, `SSH_PORT`…).

> **SSH em outra porta?** O instalador libera a porta 22 e a que ele detectar. Se você usa outra, rode
> `ufw allow SUA_PORTA/tcp` **antes** de fechar a sessão.

## 4. Conferindo

```bash
/opt/sintonia/deploy/status.sh
```

Mostra contêineres, saúde, **fonte de dados** (pré-apuração, simulação ou TSE), versão no ar, CPU/memória,
validade do certificado, último backup e os últimos logs. Depois:

- abra `https://seu-dominio` e `https://seu-dominio/admin` (entre com a senha);
- veja a imagem de compartilhamento: `https://seu-dominio/api/og/apuracao.png`;
- cole um link do site num rascunho de post no X para ver o cartão.

Se o HTTPS ainda não respondeu, é quase sempre DNS ainda propagando: o Caddy tenta de novo sozinho
(acompanhe com `cd /opt/sintonia && docker compose logs -f caddy`, procure *certificate obtained*).

## 5. Cloudflare na frente (recomendado para a noite)

A Cloudflare guarda cópias das respostas da API por 1–2 segundos e das imagens por mais tempo, e entrega
dos servidores dela no Brasil: a VPS passa a receber uma fração mínima do tráfego. O app já manda os
cabeçalhos de cache certos para isso (tabela no README, seção "CDN").

1. **Adicione o site** à Cloudflare (plano Free basta) e troque os nameservers no registrador, se ainda não fez.
2. **DNS:** registro A `@` → IP da VPS. Primeiro **Somente DNS (cinza)**; rode o instalador; quando
   `https://seu-dominio` abrir com cadeado, mude para **Com proxy (laranja)**. Idem para o `www`, se houver.
3. **SSL/TLS → Visão geral:** modo **Completo (estrito)** / *Full (strict)*. (Nunca "Flexível": daria laço de
   redirecionamento.)
4. **SSL/TLS → Certificados de borda:** deixe **"Sempre usar HTTPS" desligado** — o próprio servidor já
   redireciona HTTP → HTTPS, e assim a renovação automática do certificado (feita pela porta 80) nunca é
   bloqueada. HSTS: não precisa ligar na Cloudflare (o app já envia).
5. **Velocidade / Otimização:** **Rocket Loader desligado** (ele reescreve o JavaScript do site). Não use o modo
   "Estou sob ataque" a não ser em emergência: ele bloqueia as atualizações automáticas da apuração.
6. **Caching → Cache Rules** — crie duas regras, nesta ordem:

   **Regra 1 — "Sintonia: API pública e dados"**
   - Quando: *Expressão personalizada*
     ```
     (http.host eq "seu-dominio" and (starts_with(http.request.uri.path, "/api/apuracao/")
       or http.request.uri.path in {"/api/status" "/api/meta"}
       or starts_with(http.request.uri.path, "/api/og/")
       or starts_with(http.request.uri.path, "/api/patrocinio/")
       or starts_with(http.request.uri.path, "/data/")
       or starts_with(http.request.uri.path, "/geo/")))
     ```
   - Então: **Elegível para cache**; *TTL do cache de borda*: **"Usar o cabeçalho Cache-Control se presente,
     ignorar o cache se não"**; *TTL do navegador*: **"Respeitar os cabeçalhos existentes"**; *Chave de cache*:
     manter a **query string inteira** (padrão — a apuração usa `?race=`, `?t=` e `&v=`).

   **Regra 2 — "Sintonia: nunca guardar"**
   - Quando: `starts_with(http.request.uri.path, "/api/admin") or http.request.uri.path eq "/healthz" or starts_with(http.request.uri.path, "/admin")`
   - Então: **Ignorar cache** (*Bypass*).

   As páginas (HTML) não precisam de regra: o app manda `no-cache` e a Cloudflare não as guarda (cada link
   compartilhado precisa das meta tags da própria rota). Os arquivos `/assets/*` (JS/CSS com hash no nome) já são
   guardados por padrão, com o `immutable` do app.
7. **Conferindo o cache** (do seu computador, duas vezes seguidas):
   ```bash
   curl -sI https://seu-dominio/api/status | grep -iE 'cf-cache-status|^age|cache-control'
   ```
   Deve aparecer `cf-cache-status: HIT` (ou `EXPIRED`/`REVALIDATED`), `age` de 0 a 2 e
   `cache-control: public, max-age=0, s-maxage=1`. Em `/api/admin/state` deve aparecer `BYPASS` ou `DYNAMIC`.

Depois de uma atualização que mude **arquivos de dados** (`public/data`, `public/geo`), limpe o cache deles:
*Caching → Configuração → Limpar cache → Limpeza personalizada → prefixo* `seu-dominio/data/` (ou "Limpar tudo").
Eles ficam até 1 dia na Cloudflare. Código novo do site não precisa disso (os nomes têm hash e as páginas não
ficam em cache).

Com a Cloudflare, o IP real do visitante chega ao app pelo cabeçalho `CF-Connecting-IP`, que o Caddy só aceita
quando a conexão vem de um IP da própria Cloudflare (lista em `deploy/caddy/Caddyfile`). "Pessoas agora" conta
quem chega à VPS — com cache na borda, o número fica menor que a audiência real (ver README).

## 6. Atualizando

```bash
/opt/sintonia/deploy/update.sh
```

O que acontece:

1. baixa o código novo (`git pull`; se você editou arquivos do repositório na VPS, ele para e avisa);
2. monta a imagem nova **com o site no ar**;
3. **ensaio:** sobe a imagem nova ao lado da atual, sem visitantes, e exige que ela responda ao `/healthz` —
   uma versão quebrada **nunca** chega ao público;
4. faz backup do estado e guarda a imagem atual como ponto de retorno;
5. troca: o app reinicia em ~2–4 s e o Caddy **segura** as requisições nesse intervalo (medido: nenhum erro
   para quem está navegando);
6. confere a saúde; se o app novo não ficar saudável, **volta sozinho** para a versão anterior.

| Comando | Quando usar |
|---|---|
| `deploy/update.sh` | atualização normal (≈ 30 s a 3 min) |
| `deploy/update.sh --sem-pull` | mudou o `.env` (ex.: `VITE_SITE_URL`, domínio) e quer reconstruir sem baixar código |
| `deploy/update.sh --forcar` | reconstruir mesmo sem código novo |
| `deploy/update.sh --rollback` | voltar para a versão anterior (≈ 5 s) |

Mudou só a senha ou outra variável do servidor (não de build)? Basta
`cd /opt/sintonia && docker compose up -d` (recria o app em ~3 s).

## 7. Backup e restauração

- **Automático:** de hora em hora, em `/var/backups/sintonia/` (mantém os 72 últimos = 3 dias). Cada arquivo tem
  o estado do painel (fonte de dados, cenário, aviso, configuração do TSE, histórico do feed) e o `.env`.
- **Manual:** `/opt/sintonia/deploy/backup.sh`
- **Guarde uma cópia fora da VPS** (do seu computador):
  `scp root@IP-DA-VPS:/var/backups/sintonia/sintonia-*.tar.gz ./`
- **Restaurar:** `/opt/sintonia/deploy/restore.sh --listar` e depois
  `/opt/sintonia/deploy/restore.sh /var/backups/sintonia/sintonia-AAAAMMDD-HHMMSS.tar.gz`
  (faz um backup do estado atual antes; o app fica parado ~5 s). A versão do estado restaurado é ajustada para
  continuar crescendo, para nenhum cache antigo ser confundido com o estado restaurado.
- **VPS nova (desastre):** instale normalmente (seção 3) e rode
  `deploy/restore.sh <arquivo> --com-env` (restaura também o `.env`, com a mesma senha e segredo).

Os certificados ficam no volume `caddy_data`; não precisam de backup (o Caddy pede outros sozinho).

## 8. Logs e situação

| O quê | Comando (dentro de `/opt/sintonia`) |
|---|---|
| Resumo de tudo | `deploy/status.sh` (`LINHAS=100 deploy/status.sh` para mais log) |
| Log do app ao vivo | `docker compose logs -f app` |
| Log do Caddy (certificados, erros) | `docker compose logs -f caddy` |
| Uso de CPU/memória ao vivo | `docker stats` |
| Saúde do app | `docker compose ps` (coluna STATUS: `healthy`) |
| Reiniciar o app | `docker compose restart app` |

O app escreve uma linha por evento e, a cada minuto com tráfego, um resumo (requisições, latência, cache,
erros, clientes estimados). Nunca registra IP, senha, cookie nem código de Duelo; o Caddy não tem log de acesso
pelo mesmo motivo. Os logs do Docker giram sozinhos (5 arquivos de 20 MB por serviço).

**Vigia de travamento:** o Docker verifica o `/healthz` a cada 15 s. Se o app já esteve no ar e para de
responder por ~75 s seguidos, o próprio healthcheck reinicia o processo (testado: processo congelado →
reiniciado em ~2 min, sem intervenção). Desligue com `AUTORREINICIO=0` no `.env`.

Depois de um reinício da VPS tudo volta sozinho (Docker habilitado no boot + `restart: unless-stopped`).

## 9. Trocar a senha do painel

```bash
cd /opt/sintonia
nano .env                    # mude a linha ADMIN_PASSWORD='nova-senha-longa' (entre aspas simples)
docker compose up -d         # recria o app com a senha nova (~3 s)
```

Gerar uma senha forte: `openssl rand -base64 32 | tr -dc 'A-Za-z0-9'`. As sessões abertas continuam valendo
até expirarem (12 h); para derrubar todas na hora, troque também o `ADMIN_SECRET` (mesmo comando de geração).

Outras mudanças no `.env` seguem o mesmo caminho. Exceções: `VITE_SITE_URL` (vai para dentro do JavaScript) e
`DOMINIO`/`SITE_ADDRESS`/`PUBLIC_URL` (mude os quatro juntos ao trocar de domínio) pedem
`deploy/update.sh --sem-pull`.

## 10. Escalar

**Recomendado: 1 instância do app + Cloudflare.** Um processo responde ~13 mil req/s por núcleo (README,
"Capacidade medida"); com a Cloudflare, cada ponto de presença busca cada endereço da API no máximo 1 vez por
1–2 s, então a VPS recebe algumas centenas de requisições por segundo mesmo com milhões de visitantes. É o
arranjo mais simples, com números idênticos para todo mundo e "pessoas agora" consistente.

Se precisar de mais folga, **aumente a VPS** (mais vCPU ajuda o Caddy, a compressão e as imagens de
compartilhamento) antes de pensar em réplicas.

**Plano B — várias instâncias atrás do Caddy** (`docker-compose.replicas.yml`), só se não houver CDN e a CPU de
um processo saturar:

```bash
cd /opt/sintonia
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.replicas.yml' >> .env
echo 'APP_REPLICAS=3' >> .env        # até 1 por vCPU, deixando 1 livre
docker compose up -d
```

Testado com 3 réplicas: todas saudáveis em ~6 s (~150–250 MB cada em repouso), um comando do painel chega às outras
em ≤ 1,2 s (mesmo volume de estado), a sessão do admin vale em todas (mesmo `ADMIN_SECRET`), cada visitante cai
sempre na mesma réplica (sem cookie) e derrubar uma réplica no meio de requisições não gerou nenhum erro.
**Limitações:** "pessoas agora" passa a contar só os visitantes da réplica que respondeu (≈ 1/N do total); na
fonte TSE cada réplica consulta o TSE por conta própria e pode ficar alguns segundos à frente ou atrás das
outras — com CDN na frente, a cópia guardada pode alternar entre réplicas. Por isso: **com Cloudflare, use 1
réplica.** Para voltar a 1, apague as duas linhas do `.env` e rode `docker compose up -d`.

## 11. Noite da eleição — checklist

- **Na véspera:** `deploy/update.sh` (versão final), `deploy/status.sh` (tudo `healthy`, relógio certo, disco
  com folga), backup copiado para fora da VPS, cache da Cloudflare conferido (seção 5), ensaio do feed do TSE pelo
  painel (README, seção "Admin").
- **Antes das 17h:** fonte `pre` no painel; "testar conexão" do TSE.
- **17h:** troque a fonte para `tse` no painel.
- **Durante:** `deploy/status.sh` e `docker stats` de vez em quando. Evite atualizar o código durante a apuração
  (é seguro, mas não é hora de mudança); se precisar, o `update.sh` faz o ensaio e não derruba o site.
- **Se a VPS ficar lenta:** confira `docker stats`; com Cloudflare ligada isso é raro. Aumentar a VPS exige
  reiniciá-la (≈ 1–2 min fora do ar; com a Cloudflare, quem já carregou continua vendo o último dado guardado).

## 12. Solução de problemas

| Sintoma | Causa provável e o que fazer |
|---|---|
| Site não abre / "conexão recusada" | Portas 80/443 bloqueadas no firewall do **provedor**; `deploy/status.sh` mostra se os contêineres estão de pé |
| Certificado não sai (log do Caddy com *challenge failed*) | DNS ainda não aponta para a VPS (`dig +short seu-dominio`); Cloudflare com nuvem laranja antes do primeiro certificado (deixe cinza, espere sair, depois laranja); porta 80 fechada |
| Erro 526 na Cloudflare | Certificado da VPS inválido/ausente: ponha a nuvem em cinza, confira `docker compose logs caddy`, volte para laranja quando o HTTPS direto funcionar |
| Erro 52x/502/504 | App fora do ar: `deploy/status.sh` e `docker compose logs --tail 100 app`; `docker compose restart app` |
| Painel responde 503 | `ADMIN_PASSWORD` vazio no `.env` (em produção o painel fica desligado sem senha) |
| Painel responde 429 | Muitas tentativas de senha: espere 1 minuto |
| `update.sh` diz "arquivos alterados" | Alguém editou arquivos em `/opt/sintonia`: `git status`; guarde (`git stash`) ou desfaça (`git checkout -- arquivo`) |
| Build falha por memória | VPS com pouca RAM e sem swap: rode o `install.sh` de novo (ele cria o swap) ou aumente a VPS |
| Disco cheio | `docker system df`; `docker builder prune -af` libera o cache de build; backups antigos em `/var/backups/sintonia` |
| Horário errado na apuração | `timedatectl` deve mostrar *System clock synchronized: yes*; senão `timedatectl set-ntp true` |
| Trocar de domínio | Edite `DOMINIO`, `SITE_ADDRESS`, `PUBLIC_URL` e `VITE_SITE_URL` no `.env` e rode `deploy/update.sh --sem-pull` |

## 13. Instalação manual (sem o install.sh)

Em qualquer máquina com Docker ≥ 25 e Docker Compose ≥ 2.24:

```bash
git clone https://github.com/xXmegahunterXx/unic-rnio2turno.git /opt/sintonia && cd /opt/sintonia
cp .env.example .env && chmod 600 .env && nano .env     # preencha os campos <...>
docker compose up -d --build
docker compose ps                                        # app "healthy" em ~10 s
```

Teste local sem domínio: no `.env`, `SITE_ADDRESS=':80'`, `HTTP_PORT=8080`, `HTTPS_PORT=8443` e
`PUBLIC_URL=http://localhost:8080`; o site abre em `http://localhost:8080`. Imagem avulsa, sem compose:
`docker build -t sintonia-app . && docker run --init -p 8787:8787 -e ADMIN_PASSWORD=... -v sintonia-estado:/var/lib/sintonia sintonia-app`.

## 14. Segurança, em resumo

- Só o Caddy fica exposto (80/443). O app roda sem privilégios (usuário `node`), com sistema de arquivos somente
  leitura (grava só no volume do estado e em `/tmp`), sem capacidades extras do Linux e sem porta publicada.
- `.env` com permissão 600 e fora da imagem; backups com permissão 600.
- O Docker publica portas por fora do `ufw`: por isso só 80 e 443 são publicadas.
- O app envia HSTS com `includeSubDomains`: depois do primeiro acesso, os navegadores só aceitam HTTPS no domínio
  **e em todos os subdomínios** dele por 6 meses. Se algum subdomínio seu ainda for só HTTP, publique o site num
  domínio próprio ou num subdomínio dedicado (ex.: `apuracao.seudominio.com.br`).
- Recomendado na VPS: login SSH só por chave (`PasswordAuthentication no` em `/etc/ssh/sshd_config`) e as
  atualizações automáticas de segurança do Ubuntu (já vêm ligadas).

## 15. Referência dos arquivos

| Arquivo | Para quê |
|---|---|
| `Dockerfile` | imagem do app (Node 22 Debian slim, multi-stage, usuário sem privilégios, `HEALTHCHECK`) |
| `.dockerignore` | o que não entra no build (dados brutos, `node_modules`, `.env`, `.git`…) |
| `docker-compose.yml` | app + Caddy, volumes, limites de memória, logs com rotação, healthchecks |
| `docker-compose.replicas.yml` | plano B: N instâncias do app (seção 10) |
| `.env.example` | modelo comentado da configuração |
| `deploy/caddy/Caddyfile` | HTTPS automático, HTTP/3, compressão, IP real do visitante, espera durante reinícios |
| `deploy/healthcheck.mjs` | healthcheck do contêiner + vigia de travamento |
| `deploy/install.sh` | instalação completa numa VPS Ubuntu/Debian |
| `deploy/update.sh` | atualização com ensaio, troca sem erro e volta automática |
| `deploy/backup.sh` / `deploy/restore.sh` | backup e restauração do estado e do `.env` |
| `deploy/status.sh` | situação num relance |
| `deploy/lib.sh` | funções comuns dos scripts |
