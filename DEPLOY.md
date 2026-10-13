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
[README](./README.md#deploy). Antes de divulgar o site, passe pelo
[`CHECKLIST-LANCAMENTO.md`](./CHECKLIST-LANCAMENTO.md); para a semana da eleição (24 a 26/10), o roteiro com horários,
comandos e plano de contingência é o [`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md).

---

## 1. Do que você precisa

| Item | Detalhe |
|---|---|
| VPS | Ubuntu 24.04 LTS ou 22.04 LTS (Debian 12 também funciona), acesso root por SSH, IPv4 público. Região no Brasil (São Paulo) dá menos latência; com Cloudflare na frente isso pesa pouco |
| Tamanho | **Mínimo:** 2 vCPU, 4 GB RAM, 25 GB de disco. **Noite da eleição:** 4 vCPU, 8 GB RAM. Dá para aumentar a VPS na véspera e reduzir depois (a maioria dos provedores faz isso em minutos) |
| Domínio | Com acesso ao painel de DNS (no registrador ou na Cloudflare) |
| Portas | 22 (SSH), 80 e 443 liberadas também no firewall do **provedor**, se ele tiver um ("security group", "firewall de rede") |
| Repositório | O endereço do repositório no GitHub. Se for privado, um token de leitura ou uma "deploy key" (seção 3.2) |

Por que esses tamanhos (medidos): o app usa ~250 MB parado, ~350 MB com 100 conexões simultâneas e ~450–570 MB
sob carga (1.500–2.500 conexões; limite no compose: 1,5 GB); o Caddy, ~30 MB parado, mas ~220 MB com 1.500 e
~380 MB com 2.500 conexões HTTPS simultâneas sem CDN na frente (limite no compose: 512 MB); montar a imagem (build)
usa ~1 GB por alguns minutos. Um processo do app responde ~7–12 mil requisições por segundo em 1 núcleo, e as
imagens de compartilhamento (cartões do X) usam CPU. Com 4 vCPU/8 GB sobra folga
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

Se o código de produção estiver num branch específico, clone com `--branch nome-do-branch`. **O branch que a VPS
clona é o que ela vai atualizar** (`update.sh` faz `git pull` dele): junte o código final nele (ex.: `main`) antes de
instalar, e use o mesmo nome no `BRANCH=` dos exemplos abaixo.

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

### 3.4 VPS que já tem outros projetos (modo compartilhado)

O instalador percebe sozinho quando a máquina já tem outros sites ou sistemas (outro servidor web nas portas
80/443, contêineres de outros projetos ou um painel como cPanel, aaPanel, Coolify…) e entra no **modo
compartilhado**. Nele, o que já existe **não é tocado**:

| | Modo exclusivo (VPS só do Sintonia) | Modo compartilhado |
|---|---|---|
| Portas 80/443 | Caddy do Sintonia | continuam com o servidor web que já existe (nginx, Caddy, Apache, Nginx Proxy Manager…) |
| Firewall (ufw) | ligado com SSH/80/443 | não mexe |
| Docker | instala/atualiza | usa o que existe; se for antigo, para e explica (`ATUALIZAR_DOCKER=1` permite atualizar, o que reinicia os contêineres dos outros) |
| Swap | cria 2 GB se faltar | só se faltar e a RAM livre for < 2 GB; não muda ajustes globais |
| O app atende em | rede interna do Docker | `127.0.0.1:8787` (ou a próxima porta livre) — nada novo exposto na internet |
| Limpeza nas atualizações | imagens antigas e cache de build | só as imagens do Sintonia |

Instalação (uma linha, como root) — já publicando num endereço **próprio** do Sintonia, provisório e com HTTPS:

```bash
curl -fsSL https://raw.githubusercontent.com/xXmegahunterXx/unic-rnio2turno/HEAD/deploy/install.sh | PREVIA=1 bash
```

O fim da instalação mostra o que foi encontrado nas portas 80/443, o endereço do site, a porta local do app e a
senha do painel. Rodar o mesmo comando de novo atualiza o código e mantém a configuração. Sem `PREVIA=1` ele
pergunta; `PREVIA=0` não publica. Forçar um modo: `MODO=compartilhado` ou `MODO=exclusivo` antes do `bash`.

**Ligando o domínio depois** — crie o registro **A** do domínio para o IP da VPS, espere propagar e rode:

```bash
/opt/sintonia/deploy/dominio.sh seu-dominio.com.br            # --www para incluir o www (crie o DNS dele)
```

Conforme o que atende 80/443 na máquina:

- **nginx ou Apache instalados no sistema**: cria **um arquivo só do Sintonia**
  (`/etc/nginx/sites-available/sintonia-DOMINIO.conf` ou `/etc/apache2/sites-available/sintonia-DOMINIO.conf`);
- **Caddy, no sistema ou em contêiner Docker** (com o Caddyfile montado do disco, como no `docker-compose` comum):
  acrescenta **um bloco** marcado (`# >>> Sintonia: DOMINIO` … `# <<< Sintonia: DOMINIO`) no fim do Caddyfile em uso,
  editando o arquivo no lugar (um arquivo montado no contêiner continua valendo) e guardando uma cópia em
  `/var/backups/sintonia/proxy/`. Só mexe se a configuração que o Caddy está usando for exatamente a do arquivo
  (confere pela API dele); com o Caddy em contêiner, o bloco aponta para o IP interno do Docker (`172.17.0.1`), onde
  o app também atende — o app **não** entra na rede do outro projeto;
- em todos: confere a configuração inteira (`nginx -t`, `caddy validate`, `apachectl configtest`) **antes** de
  recarregar — se falhar, desfaz —, recarrega **sem reiniciar** (os outros sites não caem) e pede o certificado
  (certbot, instalado se faltar, com renovação automática; no Caddy, ele mesmo). Também recusa um endereço que
  outro site da máquina já usa — nunca mexe no site de outro projeto;
- **ninguém usa 80/443**: o Caddy do Sintonia passa a atendê-las, com HTTPS automático;
- **outros proxies em contêiner**: `nginx-proxy` e `caddy-docker-proxy` são configurados por rótulos; no **Nginx
  Proxy Manager**, Traefik ou num painel, o script mostra o que cadastrar (destino `http://172.17.0.1:8787`, o IP
  interno do Docker; ou `http://127.0.0.1:8787` para painéis no próprio sistema);
- no fim, reconstrói a imagem com o endereço novo (links de compartilhar) sem tirar o site do ar.

**Ver o site antes de ter domínio**: `/opt/sintonia/deploy/dominio.sh --previa` (ou `PREVIA=1` na instalação)
publica num endereço provisório **só do Sintonia**, com HTTPS: `https://sintonia.IP-COM-TRACOS.sslip.io`
(ex.: `https://sintonia.203-0-113-10.sslip.io`; o serviço gratuito sslip.io responde o IP que está no nome). O
`IP-COM-TRACOS.sslip.io` "puro" costuma já ser o endereço de outro projeto da máquina e nunca é usado. Fica marcado
para não aparecer nos buscadores e sai sozinho quando o domínio de verdade for ligado. O e-mail do certificado é
opcional aqui (só o Caddy do próprio Sintonia exige). Sem mexer em nada público: do seu computador,
`ssh -L 8787:127.0.0.1:8787 root@IP-DA-VPS` e abra `http://localhost:8787` (o painel `/admin` só entra por HTTPS).

Algo não saiu como esperado? `/opt/sintonia/deploy/diagnostico.sh` mostra, sem senhas nem segredos, quem atende
80/443, os contêineres, onde está o Caddyfile/nginx e os nomes de site de cada um — mande a saída para quem está
ajudando.

Desfazer: `/opt/sintonia/deploy/dominio.sh --remover seu-dominio.com.br` tira o site do Sintonia do servidor web
da máquina (o app segue em `127.0.0.1`). Remover tudo: `cd /opt/sintonia && docker compose down` (os volumes
`sintonia_*` guardam o estado; `docker compose down -v` apaga também), `rm /etc/cron.d/sintonia` e a pasta.

> **Cloudflare na frente (seção 5)** funciona igual: os arquivos gerados para nginx/Caddy/Apache já pegam o IP
> real do visitante só quando a conexão vem da Cloudflare. Para o primeiro certificado, deixe a nuvem **cinza**
> (DNS only) ou use `--sem-dns` com o SSL da Cloudflare em *Full (strict)*.

## 4. Conferindo

```bash
/opt/sintonia/deploy/status.sh
```

Mostra contêineres, saúde, **fonte de dados** (pré-apuração, simulação ou TSE), versão no ar, CPU/memória,
validade do certificado, último backup e os últimos logs. `deploy/painel.sh estado` mostra o painel pelo terminal: deve
dizer "Pré-eleição", **"agendada para 25/10 17:00:00"**, nenhum aviso e "simulação bloqueada". Depois:

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
| Painel pelo terminal (fonte, troca automática, aviso, TSE por disputa) | `deploy/painel.sh estado` (`deploy/painel.sh --help` lista os comandos) |

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

Gerar uma senha forte: `openssl rand -base64 32 | tr -dc 'A-Za-z0-9'`. Trocar a senha **derruba todas as sessões
abertas** do painel (quem estava logado entra de novo com a senha nova). Trocar o `ADMIN_SECRET` tem o mesmo efeito.

Outras mudanças no `.env` seguem o mesmo caminho. Exceções: `VITE_SITE_URL` (vai para dentro do JavaScript) e
`DOMINIO`/`SITE_ADDRESS`/`PUBLIC_URL` (mude os quatro juntos ao trocar de domínio) pedem
`deploy/update.sh --sem-pull`.

## 10. Escalar

**Recomendado: 1 instância do app + Cloudflare.** Um processo responde ~7–12 mil req/s num núcleo (README,
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

Roteiro completo, hora a hora, com os comandos e o plano de contingência: [`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md).
Resumo:

- **Na véspera:** `deploy/update.sh` (versão final), `deploy/status.sh` (tudo `healthy`, relógio certo, disco
  com folga), backup copiado para fora da VPS, cache da Cloudflare conferido (seção 5), ensaio do feed do TSE pelo
  painel (README, seção "Admin").
- **Antes das 17h:** fonte `pre` no painel; "testar conexão" do TSE; em *Fonte → Troca automática para o TSE* deve
  aparecer **"agendada para 17:00:00 de 25/10"**. Entre no painel antes das 17h: a sessão vale 12 h e, se alguém
  ficar errando a senha de muitos lugares ao mesmo tempo, o login pode ficar bloqueado por alguns minutos.
- **17h — sozinho:** o servidor confere o feed do TSE e troca a fonte para `tse` (não precisa fazer nada). Se o TSE
  ainda não responder, o site mostra o aviso "Aguardando os primeiros dados do TSE" e o servidor tenta de novo
  (15 s, 30 s, 60 s e depois a cada 2 min). No painel dá para **trocar agora**, **adiar** ou **desligar**; trocar a
  fonte à mão continua valendo.
- **Durante:** `deploy/status.sh` e `docker stats` de vez em quando. Se o TSE cair no meio da noite, o site continua
  mostrando o último dado bom (com o horário da última seção totalizada), mas **não** avisa sozinho: publique um
  aviso no painel se a queda demorar. Evite atualizar o código durante a apuração (é seguro, mas não é hora de
  mudança); se precisar, o `update.sh` faz o ensaio e não derruba o site.
- **Se a VPS ficar lenta:** confira `docker stats`; com Cloudflare ligada isso é raro. Aumentar a VPS exige
  reiniciá-la (≈ 1–2 min fora do ar; com a Cloudflare, quem já carregou continua vendo o último dado guardado).

**Ensaio da troca antes do dia 25** (opcional): ponha `TSE_INICIO=2026-10-20T15:00:00-03:00` (o horário do ensaio)
no `.env` e rode `docker compose up -d` — ou use "Marcar para" no painel. No horário, a fonte vira `tse` e a API
passa a servir o feed. **As páginas continuam mostrando o 1º turno e a contagem regressiva** até as 17h do dia 25 (a
fase "apurando" depende da data da eleição): o ensaio confere a troca, o feed e o painel, não as telas da apuração.
**Depois do ensaio:** apague a linha `TSE_INICIO` do `.env`, rode `docker compose up -d`, volte a fonte para
"Pré-eleição" no painel (se usou "Marcar para", clique em "horário padrão") e confira "agendada para 17:00:00 de
25/10". Uma troca feita no ensaio não impede a troca do dia 25. Pelo terminal: `deploy/painel.sh marcar 15:00`
(hoje, Brasília) para o ensaio e, depois, `deploy/painel.sh fonte pre` + `deploy/painel.sh horario-padrao` +
`deploy/painel.sh estado`.

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
  **e em todos os subdomínios** dele por 1 ano. Se algum subdomínio seu ainda for só HTTP, publique o site num
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
| `deploy/install.sh` | instalação completa numa VPS Ubuntu/Debian (detecta VPS com outros projetos → modo compartilhado, seção 3.4) |
| `deploy/dominio.sh` | liga ou troca o domínio; numa VPS compartilhada, configura o nginx/Caddy/Apache da máquina com conferência e desfazer (seção 3.4) |
| `deploy/diagnostico.sh` | diagnóstico só de leitura da máquina (portas 80/443, contêineres, Caddyfile/nginx e os sites que atendem, situação do Sintonia), sem senhas — para mandar a quem está ajudando |
| `docker-compose.vps.yml` | gerado no modo compartilhado (app em `127.0.0.1`, Caddy próprio desligado); não vai para o git |
| `deploy/update.sh` | atualização com ensaio, troca sem erro e volta automática |
| `deploy/backup.sh` / `deploy/restore.sh` | backup e restauração do estado e do `.env` |
| `deploy/status.sh` | situação num relance |
| `deploy/painel.sh` | comandos do painel pelo terminal (estado, troca para o TSE, avisos), sem abrir o navegador |
| `CHECKLIST-LANCAMENTO.md` | o que conferir e decidir antes de divulgar o site (técnico e humano) |
| `RUNBOOK-ELEICAO.md` | roteiro de 24 a 26/10: horários, comandos, contingência e o que nunca fazer |
| `deploy/lib.sh` | funções comuns dos scripts |
