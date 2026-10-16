# Colocando o Sintonia no ar (VPS)

Guia para quem não é especialista em servidores. No fim você terá o site em `https://seu-dominio`, com
certificado HTTPS automático, atualização com um comando, backup de hora em hora e um painel de situação.

**Resumo em 5 passos**

1. Contrate uma VPS com **Ubuntu 24.04** (ou 22.04): 2 vCPU e 4 GB de RAM no mínimo; **4 vCPU e 8 GB** para a
   noite da eleição.
2. No DNS do seu domínio, crie um registro **A** apontando para o IP da VPS.
3. Entre na VPS (`ssh root@IP-DA-VPS`) e rode o instalador (seção 3).
4. Abra `https://seu-dominio` e o painel em `https://seu-dominio/admin`.
5. Para a noite (obrigatório): a **Cloudflare** na frente, com as regras de cache do Sintonia (seção 5: por uma chave
   temporária, com `deploy/cloudflare.mjs`, ou pelo celular).

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
| A | `www` | IP da VPS | só se quiser `www.seu-dominio` **sem** Cloudflare (o instalador pergunta; o www redireciona para o domínio). **Com a Cloudflare, o www é outro** (AAAA `100::` com proxy e um 301 na própria borda, seção 5): não aponte o www para a VPS |

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
| Limites do app (leva 3) | nenhum (a máquina é dele) | CPU = núcleos − 1 (mínimo 1), peso 512 (na disputa, o outro projeto tem prioridade) e até 512 processos — `deploy/limites.sh` |

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

**Limites de CPU e de processos (VPS compartilhada).** Para o Sintonia nunca levar o outro projeto junto num pico, o
app roda com CPU = núcleos − 1 (mínimo 1), peso 512 (metade do padrão: com a CPU disputada, os contêineres do outro
projeto têm prioridade) e até 512 processos (o app usa ~15). Os valores vão no `docker-compose.vps.yml` (gerado pelo
`install.sh`/`dominio.sh` e regerado em toda atualização) e só valem se o Docker da máquina os suporta (ele confere).
`deploy/limites.sh` mostra o configurado e o que está em vigor; **aumentou ou diminuiu a VPS?** `deploy/limites.sh
aplicar` (vale na hora, sem reiniciar o app). Desligar: `deploy/limites.sh desligar` (grava `LIMITE_RECURSOS=0` no
`.env`; `ligar` volta). Ajustes no `.env`: `APP_CPUS` (ex.: `2.5`), `APP_CPU_SHARES`, `APP_PIDS`. O Caddy e a rede do
outro projeto não são tocados.

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

Mostra contêineres, saúde, **fonte de dados** (pré-apuração, simulação ou TSE), versão no ar, a **borda** ("Borda:
guardando (HIT…)" ou "NÃO guardando", e se o HTML está sendo guardado), CPU/memória e os limites do app (VPS
compartilhada), validade do certificado, último backup e os últimos logs. `deploy/painel.sh estado` mostra o painel pelo terminal: deve
dizer "Pré-eleição", **"agendada para 25/10 17:00:00"**, nenhum aviso e "simulação bloqueada". Depois:

- abra `https://seu-dominio` e `https://seu-dominio/admin` (entre com a senha);
- veja a imagem de compartilhamento: `https://seu-dominio/api/og/apuracao.png`;
- cole um link do site num rascunho de post no X para ver o cartão.

Se o HTTPS ainda não respondeu, é quase sempre DNS ainda propagando: o Caddy tenta de novo sozinho
(acompanhe com `cd /opt/sintonia && docker compose logs -f caddy`, procure *certificate obtained*).

## 5. Cloudflare na frente (obrigatório para a noite)

Sem a Cloudflare guardando cópias, a VPS sozinha aguenta cerca de 3 a 4 mil pessoas ao mesmo tempo; o pico de
referência foi de 143 mil. Com ela, cada ponto da Cloudflare busca cada endereço da API no máximo uma vez por segundo
(o placar) a dez segundos (o detalhe do município), e a VPS recebe algumas dezenas a centenas de pedidos por segundo,
qualquer que seja o público. Se o app cair por alguns minutos, a Cloudflare continua entregando o último placar
(`stale-if-error`) e o app mostra a faixa "Conexão instável".

**Quem decide o tempo é o app, nunca a Cloudflare.** Cada resposta leva dois cabeçalhos: `Cache-Control` (o que o
navegador faz) e `Cloudflare-CDN-Cache-Control` (só a borda lê; tabela no README, seção "CDN"). As regras abaixo só dizem
*o que pode* ser guardado; nenhuma tem TTL fixo. `CDN_CC=0` no `.env` tira o cabeçalho da borda e volta ao formato antigo
(exige reinício, ~10 s).

O que fica configurado (as duas formas abaixo chegam ao mesmo resultado):

| Onde (painel da Cloudflare) | O quê |
|---|---|
| Caching → Cache Rules | as 4 regras do Sintonia (§5.3), nesta ordem |
| Rules → Redirect Rules | `www.seu-dominio` → `https://seu-dominio`, 301, com caminho e query |
| DNS → Records | `www` como AAAA `100::` **com proxy** (laranja): o endereço "de descarte" que a Cloudflare recomenda para nomes que só redirecionam; nada chega à VPS |
| Caching → Tiered Cache | Smart Tiered Cache **ligado** (os pontos da Cloudflare pedem a um ponto central, não à VPS) |
| Caching → Configuration | Browser Cache TTL = **Respect Existing Headers**; Always Online **desligado** |
| Speed → Optimization | Rocket Loader **desligado** |
| Rules → Settings (ou Transform Rules) → Managed Transforms | **Add visitor location headers** ligado: UF e país de cada visita chegam ao app, que só soma (painel → Audiência); nada da pessoa é guardado |

Pré-requisitos (uma vez, já feitos em produção): o site na Cloudflare (plano Free basta) com os nameservers trocados no
registrador; registro **A** `@` → IP da VPS, primeiro **Somente DNS (cinza)** até o HTTPS da VPS funcionar e depois
**Com proxy (laranja)**; **SSL/TLS → Visão geral: Completo (estrito)** / *Full (strict)* (nunca "Flexível": dá laço de
redirecionamento); **"Sempre usar HTTPS" desligado** (o servidor já redireciona, e a renovação do certificado pela porta
80 nunca é bloqueada); HSTS não precisa (o app envia). **Não** use o modo "Estou sob ataque" a não ser em emergência
(bloqueia as atualizações automáticas da apuração). **Web Analytics / Real User Measurements desligado** (Analytics e
logs → Web Analytics → o site → desativar a configuração automática): a Cloudflare injeta
`static.cloudflareinsights.com/beacon.min.js` em toda página, a política de segurança do site o bloqueia e a /privacidade
promete o site sem analytics. Confira: `curl -s -H 'Accept: text/html' https://seu-dominio/sobre | grep -c cloudflareinsights`
tem de dar `0` (o `--conferir` abaixo também confere).

### 5.1 Pela chave temporária (recomendado: 10 minutos do dono)

O script `deploy/cloudflare.mjs` aplica tudo pela API da Cloudflare e confere. **A chave nunca vai para a VPS** nem para
arquivo nenhum: é usada só no ambiente de quem aplica, lida da variável de ambiente, e revogada logo depois.

1. **Criar a chave (pelo celular serve)**: dash.cloudflare.com → ícone de pessoa (canto superior direito) → *My Profile* →
   *API Tokens* → *Create Token* → *Create Custom Token* → *Get started*.
   - *Token name*: `Sintonia leva 3 (temporária)`.
   - *Permissions*, todas do tipo **Zone**: `Zone` → *Read*; `Zone Settings` → *Edit*; `DNS` → *Edit*;
     `Cache Rules` → *Edit*; `Single Redirect` (em algumas contas aparece como `Dynamic URL Redirects`) → *Edit*;
     `Transform Rules` → *Edit*; `Cache Purge` → *Purge* (para limpar o `/robots.txt` depois do deploy). Se algum nome
     não existir na sua tela, deixe de fora: o script diz o passo que não conseguiu, e só ele é feito pelo celular (§5.2).
   - *Zone Resources*: *Include* → *Specific zone* → `seu-dominio`.
   - *TTL*: começo hoje, **fim daqui a 2 dias**.
   - *Continue to summary* → *Create Token* → copie a chave (ela aparece uma vez só) e passe para quem vai aplicar pelo
     canal combinado.
2. **Aplicar** (no ambiente de quem aplica, com Node 22; nunca na VPS):
   ```bash
   read -rs CF_API_TOKEN && export CF_API_TOKEN      # cole a chave + Enter (não aparece na tela nem no histórico)
   node deploy/cloudflare.mjs --aplicar --simular --dominio=seu-dominio   # só lê e mostra o que mudaria
   node deploy/cloudflare.mjs --aplicar --dominio=seu-dominio
   node deploy/cloudflare.mjs --conferir --dominio=seu-dominio            # ~30 s depois; com a chave, confere a zona também
   unset CF_API_TOKEN
   ```
   `CF_ZONE_ID` é opcional (sem ele a zona é achada pelo domínio). O `--aplicar` é idempotente (rodar de novo não muda o
   que já está certo), substitui as regras "Sintonia…" criadas à mão pelo DEPLOY antigo, deixa intactas as regras de
   outro dono (antes das nossas) e recusa rodar no congelamento (24/10 12h a 26/10 6h) sem `--forcar`. Saída 0 = tudo
   certo; 1 = algum passo falhou (a linha diz qual e por quê).
3. **Revogar a chave**: *My Profile* → *API Tokens* → a chave → *Delete*. (Ela vence sozinha em 2 dias, mas não espere.)

Outros comandos: `--desligar` (§5.5), `--purgar /robots.txt /sitemap.xml` (limpa estes endereços da borda; precisa da
chave), `--mostrar` (imprime as regras para conferir ou colar). `--conferir` **sem chave** confere só pela borda, de
qualquer computador: é o que se usa depois do passo a passo pelo celular.

### 5.2 Pelo celular, sem chave (cerca de 40 minutos)

No navegador do celular, em dash.cloudflare.com (dica: no Chrome, *⋮ → Site para computador* deixa as telas mais
largas; a lupa/busca do painel acha cada tela pelo nome). Entre no site `seu-dominio` e siga na ordem. Copie as
expressões **exatamente** como estão no §5.3 (toque longo no bloco → copiar): uma letra a mais e a regra deixa de valer.

1. **DNS → Records → Add record**: *Type* `AAAA`, *Name* `www`, *IPv6 address* `100::`, *Proxy status* **Proxied**
   (laranja), *TTL* Auto → *Save*. (Se já existir um `www`, só ligue o proxy nele.)
2. **Caching → Configuration**: *Browser Cache TTL* → **Respect Existing Headers**; *Always Online* → **desligado**.
3. **Caching → Tiered Cache**: *Smart Tiered Caching Topology* → **ligado** (*Enable*).
4. **Speed → Optimization → Content Optimization**: *Rocket Loader* → **desligado**.
5. **Rules → Settings** (em contas antigas: *Rules → Transform Rules → Managed Transforms*): **Add visitor location
   headers** → ligado.
6. **Caching → Cache Rules → Create rule**, quatro vezes, **nesta ordem** (cada nova vai para o fim da lista; no fim, a
   ordem tem de ser 1, 2, 3, 4 — arraste se precisar). Em todas: *If incoming requests match…* → **Custom filter
   expression** → *Edit expression* → cole a expressão do §5.3. Depois:
   - **Regra 1** "Sintonia: API pública e dados": *Cache eligibility* **Eligible for cache**; *Edge TTL* **Use
     cache-control header if present, bypass cache if not**; *Browser TTL* **Respect origin TTL**; *Cache key* como vier
     (query string inteira). *Deploy*.
   - **Regra 2** "Sintonia: nunca guardar": *Cache eligibility* **Bypass cache**. *Deploy*.
   - **Regra 3** "Sintonia: sem query": como a Regra 1 e, em *Cache key* → *Query string*, **Ignore query string**
     (ignorar tudo). *Deploy*.
   - **Regra 4** "Sintonia: páginas (HTML, só com a chave html-borda)": igual à Regra 1. *Deploy*.
   Se já houver regras "Sintonia…" feitas antes (do DEPLOY antigo), **apague-as** antes: duas regras com o mesmo papel
   se atrapalham.
7. **Rules → Redirect Rules → Create rule** (*Single Redirects*), nome "Sintonia: www para o domínio (301)":
   *Custom filter expression* → `(http.host eq "www.seu-dominio")`; *Then* → *URL redirect* → *Type* **Dynamic** →
   *Expression* `concat("https://seu-dominio", http.request.uri.path)`; *Status code* **301**; **Preserve query
   string** marcado. *Deploy*.
8. Avise quem confere: `node deploy/cloudflare.mjs --conferir --dominio=seu-dominio` (sem chave, de qualquer lugar)
   aponta o que faltou; na VPS, `deploy/status.sh` mostra a linha **"Borda: guardando"**.

### 5.3 As regras, uma a uma (referência)

Exatamente o que o `--aplicar` grava (o teste `scripts/cloudflare.test.ts` confere que este texto e o script não se
afastam). Sem `http.host`: valem para o domínio que estiver na zona.

**Regra 1 — "Sintonia: API pública e dados"** (elegível; borda conforme o cabeçalho da origem; query inteira na chave)
```
(starts_with(http.request.uri.path, "/api/apuracao/") or http.request.uri.path in {"/api/status" "/api/meta" "/api/chat" "/api/divulgacao" "/api/live/agora" "/api/anuncio/img"} or starts_with(http.request.uri.path, "/api/og/") or starts_with(http.request.uri.path, "/api/patrocinio/") or starts_with(http.request.uri.path, "/api/texto/") or starts_with(http.request.uri.path, "/data/") or starts_with(http.request.uri.path, "/geo/"))
```
A query string inteira entra na chave: a apuração usa `?race=`, `?t=`, `&v=` e `?d=` (a marca dos números na noite:
cada dado novo do TSE vira um endereço novo, sem cópia velha na borda). `/api/texto/` (o `!apuracao` dos bots de chat) e
`/api/live/agora` (o "em N lives") entram aqui também.

**Regra 2 — "Sintonia: nunca guardar"** (*Bypass cache*)
```
(starts_with(http.request.uri.path, "/api/admin") or starts_with(http.request.uri.path, "/admin") or http.request.uri.path in {"/healthz" "/api/anuncio/evento" "/api/audiencia" "/api/saude-noite" "/api/live/batimento"} or starts_with(http.request.uri.path, "/api/anuncio/ir/") or starts_with(http.request.uri.path, "/api/chat/") or starts_with(http.request.uri.path, "/api/anuncie/"))
```
Painel, saúde (`/healthz` e `/api/saude-noite`, que os monitores leem), cliques (`/api/anuncio/ir/…`) e impressões
(`/api/anuncio/evento`) dos anúncios, envios do chat (`/api/chat/…`), sinal de audiência, batimento das lives e o
formulário "Quero anunciar" precisam chegar SEMPRE à VPS: sem isso, o relatório dos anunciantes e a medição ficam errados.

**Regra 3 — "Sintonia: sem query"** (como a 1, com a query string fora da chave)
```
(http.request.uri.path in {"/api/status" "/api/meta" "/api/chat" "/api/divulgacao"})
```
O app nunca usa query nessas rotas: com a Regra 1 sozinha, um `?x=<aleatório>` em `/api/status` (a URL mais pedida)
viraria um endereço novo a cada pedido e chegaria à VPS.

**Regra 4 — "Sintonia: páginas (HTML, só com a chave html-borda)"** (como a 1)
```
(not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/admin") and not starts_with(http.request.uri.path, "/embed") and http.request.uri.path ne "/healthz")
```
Deixa as páginas *elegíveis*, mas a borda só as guarda quando o app manda `Cloudflare-CDN-Cache-Control` no HTML — o
que só acontece com a chave **"HTML na borda"** ligada no painel (`deploy/painel.sh html-borda ligar`; padrão
desligada). Plano: ligar **só no congelamento (24/10, 12h)** e só se passar no ensaio; com ela, a borda guarda cada
página por 15 s e a serve por até 1 dia se a VPS cair. Nunca em `/admin`, `/embed`, `/duelo`, `/relatorio`, 404 ou erro
(o app não manda o cabeçalho). **Antes de publicar uma versão nova com ela ligada: desligue e espere 30 s** (o HTML
guardado aponta para arquivos `/assets` da versão antiga). Os arquivos `/assets/*` (nomes com hash) já são guardados
pela Cloudflare por padrão, com o `immutable` do app.

**Redirecionamento — "Sintonia: www para o domínio (301)"** (*Rules → Redirect Rules*, primeira da lista)
```
(http.host eq "www.seu-dominio")
```
destino dinâmico `concat("https://seu-dominio", http.request.uri.path)`, código 301, *preserve query string* ligado.

**Chat ao vivo** (`/api/chat`): o `GET` está nas Regras 1 e 3 de propósito — é a MESMA URL para todo mundo, guardada 1 s
na borda (sem a regra, cada pessoa com a sala aberta consultaria a VPS a cada 2,5 s). Os envios, denúncias, reações e o
sinal de presença (`POST /api/chat` e `/api/chat/…`) nunca são guardados (a Cloudflare não guarda POST; a Regra 2 deixa
explícito). O chat fica na memória do processo: use **1 instância**. O app responde 400 a `GET /api/chat` com query
string. Opcional: em *Security → WAF → Rate limiting rules*, uma regra de limite por IP para o HTML e os `POST` (ex.: 300
pedidos/10 s por IP) segura rajadas que a borda não guarda.

### 5.4 Conferindo

```bash
node deploy/cloudflare.mjs --conferir --dominio=seu-dominio     # de qualquer computador, sem chave
/opt/sintonia/deploy/status.sh                                  # na VPS: linha "Borda: guardando (HIT…)"
```

O `--conferir` pede pela borda e reprova (saída 1) se: o domínio não passar pela Cloudflare (nuvem cinza); o
`/api/status` pedido duas vezes não vier da cópia (`HIT`, `UPDATING`, `EXPIRED` ou `REVALIDATED`); um `?x=` novo no
status virar outra cópia (Regra 3); `/api/admin/state`, `/api/anuncio/ir/x`, `/api/saude-noite` ou `/healthz` passarem
pela cópia (têm de dar `BYPASS` ou `DYNAMIC`); um `/assets/*.js` não ficar `HIT`; a página trouxer o script do Web
Analytics; ou o `www` não responder 301 para o domínio com o mesmo caminho e query. Também diz se o HTML está sendo
guardado (chave "HTML na borda"). Com `CF_API_TOKEN`, confere ainda cada regra, o DNS, o Tiered Cache, as configurações e
os cabeçalhos de localização na zona. À mão, do seu computador:

```bash
curl -sI https://seu-dominio/api/status | grep -iE 'cf-cache-status|^age|cache-control'     # 2× seguidas: HIT, age 0–2
curl -sI https://seu-dominio/api/anuncio/ir/x | grep -iE '^HTTP|cf-cache-status'            # BYPASS ou DYNAMIC
curl -sI 'https://www.seu-dominio/apuracao?x=1' | grep -iE '^HTTP|^location'                # 301 → https://seu-dominio/apuracao?x=1
```

O `cache-control` que o navegador vê no status continua `public, max-age=0, s-maxage=1`; o `Cloudflare-CDN-Cache-Control`
é consumido pela borda e não aparece do lado de fora.

### 5.5 Emergência, limpeza e ensaio

- **Desligar a borda de uma vez** (ex.: suspeita de cópia errada sendo servida): `node deploy/cloudflare.mjs --desligar`
  (precisa da chave) ou, pelo celular, *Caching → Cache Rules* → desligar a chave de cada regra "Sintonia…". As regras
  ficam lá, só desabilitadas; em segundos tudo passa a ir à VPS (atenção à carga: puxe o freio do painel junto,
  `deploy/painel.sh freio 3`). Religar: `--aplicar`, ou ligar as chaves de novo. O www e o resto da zona não mudam.
- **Só o HTML**: `deploy/painel.sh html-borda desligar` (em até 15 s a borda revalida e para de guardar as páginas).
- **Depois de uma atualização que mude `public/data` ou `public/geo`**: limpe o cache deles (*Caching → Configuration →
  Purge Cache → Custom Purge*, prefixo `seu-dominio/data/` e `seu-dominio/geo/`, ou "Purge Everything"). Eles ficam até 1
  dia na Cloudflare. Código novo do site não precisa (os nomes têm hash e as páginas não ficam guardadas sem a chave).
- **Depois do deploy da leva 3**: limpe o `/robots.txt` (a borda guarda o antigo por até 1 dia):
  `node deploy/cloudflare.mjs --purgar /robots.txt` ou *Custom Purge → URL* `https://seu-dominio/robots.txt`.
- **Ensaio de carga pela borda** (21–22/10, nunca em 24 nem em 25/10): `npx tsx scripts/ensaio-borda.ts
  --base=https://seu-dominio --usuarios=100 --duracao=300` (depois 1000 e, se passar, 3000). Visitantes virtuais que
  pedem como o app (status a cada 2 s, placar na troca de marca, UF e mapa a cada 4 s, município, presença e HTML) e um
  relatório com req/s por `cf-cache-status`, p50/p95/p99, 5xx e req/s na origem (exato com `SINTONIA_ADMIN_SENHA` no
  ambiente; senão estimado). Aprova com origem < 300 req/s, ≥ 95% HIT/UPDATING na API, p95 < 300 ms e zero 5xx.
  **Depois: Painel → Audiência → Zerar medição** (o ensaio conta como audiência; ou rode com `--sem-presenca`). Para
  treinar sem a Cloudflare, `npx tsx scripts/cloudflare-falso.ts --porta=8902 --origem=http://127.0.0.1:8787` imita a
  borda na frente de um servidor local (`--base=http://seu-dominio:8902 --conectar=127.0.0.1`).

Com a Cloudflare, o IP real do visitante chega ao app pelo cabeçalho `CF-Connecting-IP`, que o Caddy só aceita quando a
conexão vem de um IP da própria Cloudflare (lista em `deploy/caddy/Caddyfile`; na VPS compartilhada, o arquivo que o
`dominio.sh` gera faz o mesmo). "Pessoas agora" (público) é o maior entre quem chega à VPS e a presença pelo sinal das
páginas, que atravessa a borda; o site só mostra o número a partir de 500 pessoas e com a chave "contador público"
ligada (o painel vê sempre). **Depois do deploy final, antes de vender anúncio:** *Painel → Audiência → Zerar medição*.

### 5.6 Registro dos envios do chat (opcional, desligado)

Só ligue se o dono, com o advogado, decidir guardar os dados de conexão de quem escreve no chat (Marco Civil,
art. 15). O servidor grava, para cada mensagem publicada, id, hora, IP e porta, apelido e texto, **cifrados** com uma
chave pública; a chave privada fica **fora da VPS** (só com ela dá para ler). Os arquivos ficam 6 meses no volume e não
entram no backup comum (o `restore.sh` preserva a pasta). Com o registro ligado, a sala e a página de privacidade
avisam sozinhas. Chave errada (caminho com erro, PEM inválido) **não derruba o site**: o registro fica desligado, a
sala fica travada fechada e o log diz o motivo (`deploy/painel.sh chat-estado` também).

```bash
# no SEU computador (não na VPS): par de chaves; guarde privada.pem em lugar seguro (cofre, pendrive)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out privada.pem
openssl pkey -in privada.pem -pubout -out publica.pem
# leve só a PÚBLICA para dentro do volume do app (na VPS, em /opt/sintonia)
docker compose exec -T app sh -c 'cat > /var/lib/sintonia/registro-publica.pem' < publica.pem
echo "CHAT_REGISTRO_CHAVE=/var/lib/sintonia/registro-publica.pem" >> .env
# opcional, com Cloudflare: uma Transform Rule que mande a porta do visitante (cf.edge.client_port) num cabeçalho,
# por exemplo x-porta-cliente, e:  echo "CHAT_REGISTRO_HEADER_PORTA=x-porta-cliente" >> .env
deploy/update.sh --sem-pull     # ensaia com o .env novo antes de trocar (não use docker compose up -d aqui)
```

Para atender uma ordem judicial: copie a pasta `/var/lib/sintonia/chat-registro` (ou só o arquivo do dia,
`AAAA-MM-DD.reg`, em UTC) para o computador que tem a chave privada e rode, na pasta do projeto,
`npx tsx scripts/chat-registro-abrir.ts --chave privada.pem --dir ./chat-registro --dia AAAA-MM-DD --id <id da mensagem>`
(o painel mostra o id de cada mensagem). Com um print (apelido, hora e texto) e sem o id: `--dia AAAA-MM-DD --apelido
<apelido> --texto "<trecho>"`. Numa VPS nova (desastre), copie a pasta `chat-registro/` à parte, cifrada como está —
nunca junto com o backup comum.

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

Na VPS compartilhada, o `docker-compose.vps.yml` é regerado do `.env` antes do ensaio (traz o que mudou nos scripts —
na leva 3, os limites de CPU e de processos, seção 3.4); se a atualização não chegar ao fim, ele volta ao de antes.

| Comando | Quando usar |
|---|---|
| `deploy/update.sh` | atualização normal (≈ 30 s a 3 min) |
| `deploy/update.sh --sem-pull` | mudou o `.env` (ex.: `VITE_SITE_URL`, domínio) e quer reconstruir sem baixar código |
| `deploy/update.sh --forcar` | reconstruir mesmo sem código novo |
| `deploy/update.sh --rollback` | voltar para a versão anterior (≈ 5 s) |
| `deploy/update.sh --qualquer-commit` | publicar a ponta do branch mesmo sem `[deploy]` na mensagem |

**Primeira atualização desta leva (saindo da 58efd31, de antes dos anúncios):** logo depois dela, e antes da próxima,
`docker tag sintonia-app:anterior sintonia-app:pre-anuncios` e `deploy/update.sh --forcar` (ou a próxima atualização
normal). Assim o `--rollback` rápido cai numa versão que entende os anúncios, e a antiga fica guardada à parte — voltar
para ela apaga os anúncios e os contatos do painel na primeira gravação (RUNBOOK §3.5, que também mostra como voltar de
propósito e como restaurar só o painel com `deploy/restore.sh <arquivo> --so-admin`).

**Só commits marcados vão ao ar sem perguntar:** se o commit mais novo do GitHub não tiver `[deploy]` na mensagem (ex.:
"WIP … (não publicar)"), o `update.sh` mostra o assunto e pergunta (ou para, sem terminal). Para ir só até o último
commit marcado: `deploy/auto-update.sh rodar`.

Mudou só a senha ou outra variável do servidor (não de build)? Use `deploy/update.sh --sem-pull`: ele **ensaia** com o
`.env` novo e só troca se o app subir (uma variável errada, como um caminho de chave com erro de digitação, não derruba
o site). Numa emergência, `cd /opt/sintonia && docker compose up -d app` recria o app em ~3 s, sem ensaio.

**Abas abertas durante uma atualização:** quem estava com o site aberto e navega para uma página ainda não carregada
recebe a versão nova com uma recarga automática (uma vez); nada quebra na tela. A configuração do chat (aberta, modo
lento, fixada) volta igual depois da troca; as mensagens e os silenciamentos, não (ficam só na memória).

### 6.1 Atualização automática (sem precisar entrar na VPS)

```bash
/opt/sintonia/deploy/auto-update.sh ligar      # desligar: … desligar · ver: … estado
```

A cada 5 minutos a VPS confere o GitHub e, se houver versão nova **marcada para produção** (commit com `[deploy]` na
mensagem — os commits intermediários, de trabalho em andamento, nunca vão ao ar sozinhos), roda o `update.sh` acima
até ela (com ensaio e volta automática). Para atualizar à mão até a última versão marcada:
`/opt/sintonia/deploy/auto-update.sh rodar` (o `update.sh` sozinho vai até a ponta do branch e pergunta antes de publicar
um commit sem `[deploy]`). Um commit que falhou não é tentado de novo até chegar outro (se o update só não rodou porque
outra operação estava em andamento, tenta de novo na próxima conferência). **Congelada da véspera à manhã seguinte**:
de 24/10 12:00 a 26/10 06:00 (Brasília) nada atualiza sozinho — o mesmo congelamento de código do RUNBOOK; mude com
`AUTO_CONGELAR_DE` / `AUTO_CONGELAR_ATE` (ISO 8601) no `.env`. `auto-update.sh estado` mostra o intervalo. Registro em
`/var/log/sintonia-auto-update.log`.

**Pelo celular:** um app de SSH (Termius, para Android e iPhone; ou JuiceSSH no Android) com host `IP-DA-VPS`,
usuário `root` e a senha; depois cole o comando.

## 7. Backup e restauração

- **Automático:** de hora em hora, em `/var/backups/sintonia/` (mantém os 72 últimos = 3 dias). Cada arquivo tem
  o estado do painel (fonte de dados, cenário, aviso, configuração do TSE, anúncios, contatos públicos, histórico do
  feed, configuração do chat), a audiência agregada, os **pedidos de anunciantes (dados pessoais: nome, e-mail,
  WhatsApp)** e o `.env` (com a senha do painel). Não tem o registro cifrado do chat (`chat-registro/`, por desenho).
- **Manual:** `/opt/sintonia/deploy/backup.sh`
- **Guarde uma cópia fora da VPS** (do seu computador) — só a mais recente, **cifrada**, e apague as cópias antigas
  em até 30 dias (a /privacidade promete isso):
  ```bash
  ssh root@IP-DA-VPS 'ls -1t /var/backups/sintonia/sintonia-*.tar.gz | head -1'   # nome do mais recente
  scp root@IP-DA-VPS:/var/backups/sintonia/sintonia-AAAAMMDD-HHMMSS.tar.gz ./
  gpg -c sintonia-AAAAMMDD-HHMMSS.tar.gz && rm sintonia-AAAAMMDD-HHMMSS.tar.gz     # fica só o .gpg (senha forte)
  ```
- **Restaurar:** `/opt/sintonia/deploy/restore.sh --listar` e depois
  `/opt/sintonia/deploy/restore.sh /var/backups/sintonia/sintonia-AAAAMMDD-HHMMSS.tar.gz` (com `--so-admin`, só o
  `admin.json` — painel, anúncios e contatos —, sem tocar na audiência, nos pedidos nem no chat)
  (faz um backup do estado atual antes; o app fica parado ~5 s). A versão do estado restaurado é ajustada para
  continuar crescendo, para nenhum cache antigo ser confundido com o estado restaurado. O restore **preserva** o
  registro cifrado do chat (`chat-registro/`, guarda de 6 meses) e a chave pública do registro (`*.pem`).
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
| Chaves da noite (freio, HTML na borda, contador, medição, bots, lives, aviso nacional) | `deploy/painel.sh chaves` (seção 16) |
| A borda está guardando? | linha "Borda" do `deploy/status.sh`; de fora: `node deploy/cloudflare.mjs --conferir --dominio=seu-dominio` (seção 5.4) |
| Limites de CPU/processos do app (VPS compartilhada) | `deploy/limites.sh` (`aplicar` depois de mudar o tamanho da VPS) |

O app escreve uma linha por evento e, a cada minuto com tráfego, um resumo (requisições, latência, cache,
erros, clientes estimados). Nunca registra IP, senha, cookie nem código de Duelo; o Caddy não tem log de acesso
pelo mesmo motivo. Os logs do Docker giram sozinhos (5 arquivos de 20 MB por serviço).

**Vigia de travamento:** o Docker verifica o `/healthz` a cada 15 s. Se o app já esteve no ar e para de
responder **com o batimento do processo parado** (o app grava um batimento por segundo em `/tmp/sintonia-batimento`;
num travamento de verdade o laço de eventos para), o próprio healthcheck mata o processo (SIGKILL: um laço travado não
atende SIGTERM) e o Docker sobe outro — **~2–3 min** do travamento até o site voltar (30 s até o batimento contar como
parado + 5 verificações + a subida). **Lentidão não reinicia:** com a CPU saturada (pico, rajada que fura a CDN), o
`/healthz` numa conexão nova pode passar de 5 s enquanto o processo segue atendendo — o log mostra "processo vivo …
SEM reinício" e o contêiner fica `unhealthy` até a carga baixar. Só se o processo vivo passar **~5 min sem responder a
nenhuma verificação** (servidor HTTP parado, ex.: "too many open files") ele é reiniciado com SIGTERM
(`AUTORREINICIO_VIVO_FALHAS=20`; `0` desliga só isso). Desligue o vigia inteiro com `AUTORREINICIO=0` no `.env`.

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
compartilhamento) antes de pensar em réplicas. Na VPS compartilhada, depois de aumentar: `deploy/limites.sh aplicar`
(o limite de CPU do app acompanha os núcleos; sem isso ele fica no tamanho antigo até a próxima atualização).

**Plano B — várias instâncias atrás do Caddy** (`docker-compose.replicas.yml`), só se não houver CDN e a CPU de
um processo saturar. **Não funciona na VPS compartilhada** (o app é publicado numa porta fixa em `127.0.0.1` e a
2ª réplica não sobe: "port is already allocated") e **não deve ser usado com o chat, os pedidos de anunciantes e a
audiência**: cada réplica teria a sua sala (apagar uma mensagem numa deixa visível nas outras) e as réplicas
sobrescreveriam o `leads.json`, o `audiencia.json` e o `chat.json` umas das outras:

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

- **Na véspera:** `deploy/update.sh` (versão final, até 24/10 12h), `deploy/status.sh` (tudo `healthy`, relógio
  certo, disco com folga, "Borda: guardando"), backup copiado para fora da VPS, borda conferida
  (`node deploy/cloudflare.mjs --conferir`, seção 5.4), ensaio do feed do TSE pelo painel (README, seção "Admin"),
  alertas testados (`deploy/painel.sh alerta-teste`, seção 16). **24/10, 12h (congelamento):** se o ensaio aprovou,
  `deploy/painel.sh html-borda ligar` (as páginas passam a ficar 15 s na borda e até 1 dia se a VPS cair).
- **Antes das 17h:** fonte `pre` no painel; "testar conexão" do TSE; em *Fonte → Troca automática para o TSE* deve
  aparecer **"agendada para 17:00:00 de 25/10"**. Entre no painel antes das 17h: a sessão vale 12 h e, se alguém
  ficar errando a senha de muitos lugares ao mesmo tempo, o login pode ficar bloqueado por alguns minutos.
- **17h — sozinho:** o servidor confere o feed do TSE e troca a fonte para `tse` (não precisa fazer nada). Se o TSE
  ainda não responder, o site mostra o aviso "Aguardando os primeiros dados do TSE" e o servidor tenta de novo
  (15 s, 30 s, 60 s e depois a cada 2 min). No painel dá para **trocar agora**, **adiar** ou **desligar**; trocar a
  fonte à mão continua valendo.
- **Durante:** `deploy/status.sh` e `docker stats` de vez em quando; os alertas chegam no Telegram (seção 16). Se o
  TSE cair ou travar, o site continua mostrando o último dado bom com o horário; o selo avisa sozinho quando o TSE
  limita as leituras ("nova tentativa às HH:MM") e quando o arquivo nacional para enquanto os estados andam (chave
  "aviso nacional"); para o resto, publique um aviso no painel se a queda demorar. Muita carga: **freio** no painel
  (`deploy/painel.sh freio 2`, 3 ou 5; `freio 1` solta), que espaça as consultas de todo mundo em segundos, sem
  publicar nada. Evite atualizar o código durante a apuração; se precisar mesmo, **desligue antes o HTML na borda e
  espere 30 s** (`deploy/painel.sh html-borda desligar`), e o `update.sh` faz o ensaio e não derruba o site.
- **Se a VPS ficar lenta:** confira `docker stats` e a linha "Borda" do `status.sh` (a borda parou de guardar?
  `node deploy/cloudflare.mjs --conferir`); puxe o freio. Aumentar a VPS exige reiniciá-la (≈ 1–2 min fora do ar; com
  a Cloudflare, quem já carregou continua vendo o último dado guardado); depois, `deploy/limites.sh aplicar`.

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
| `status.sh`: "Borda: NÃO guardando" | Regras de cache ausentes ou desligadas (alguém usou `--desligar`?): `node deploy/cloudflare.mjs --conferir` diz qual; `--aplicar` (com a chave) ou o §5.2 pelo celular. Enquanto isso, freio no painel |
| `status.sh`: "Borda: sem Cloudflare" | Registro DNS com a nuvem cinza (ou o domínio fora da Cloudflare): ligue o proxy (laranja) em DNS → Records |
| `www.seu-dominio` dá erro 1016/530 | Falta o registro `www` (AAAA `100::` com proxy) ou a regra de redirecionamento: §5.2 passos 1 e 7 |
| `status.sh`/`limites.sh`: limite de CPU diferente do configurado | A VPS mudou de tamanho ou o `.env` foi editado: `deploy/limites.sh aplicar` |

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
| `deploy/auto-update.sh` | atualização automática a cada 5 min (ligar/desligar/estado), congelada na noite da eleição (seção 6.1) |
| `deploy/dominio.sh` | liga ou troca o domínio; numa VPS compartilhada, configura o nginx/Caddy/Apache da máquina com conferência e desfazer (seção 3.4) |
| `deploy/diagnostico.sh` | diagnóstico só de leitura da máquina (portas 80/443, contêineres, Caddyfile/nginx e os sites que atendem, situação do Sintonia), sem senhas — para mandar a quem está ajudando |
| `docker-compose.vps.yml` | gerado no modo compartilhado (app em `127.0.0.1`, Caddy próprio desligado, limites de CPU e de processos); regerado pelo `update.sh` e pelo `limites.sh`; não vai para o git |
| `deploy/update.sh` | atualização com ensaio, troca sem erro e volta automática |
| `deploy/backup.sh` / `deploy/restore.sh` | backup e restauração do estado e do `.env` |
| `deploy/status.sh` | situação num relance |
| `deploy/painel.sh` | comandos do painel pelo terminal (estado, troca para o TSE, avisos, chaves da noite), sem abrir o navegador |
| `deploy/cloudflare.mjs` | regras de cache, zona e www da Cloudflare pela API (`--aplicar`, `--conferir`, `--desligar`, `--purgar`); a chave só pelo ambiente, nunca na VPS (seção 5) |
| `deploy/limites.sh` | limites de CPU e de processos do app na VPS compartilhada: ver, aplicar na hora, desligar (seção 3.4) |
| `scripts/ensaio-borda.ts` | ensaio de carga pela Cloudflare com visitantes que pedem como o app, e a aprovação do plano (seção 5.5) |
| `scripts/cloudflare-falso.ts` | Cloudflare de mentira (API e borda) para testar o `cloudflare.mjs` e ensaiar sem a conta (seção 5.5) |
| `CHECKLIST-LANCAMENTO.md` | o que conferir e decidir antes de divulgar o site (técnico e humano) |
| `RUNBOOK-ELEICAO.md` | roteiro de 24 a 26/10: horários, comandos, contingência e o que nunca fazer |
| `deploy/lib.sh` | funções comuns dos scripts |

## 16. A noite: alertas no celular, chaves e freio (leva 3)

### 16.1 Alertas no Telegram e vigia externo (desligados até você configurar)

O servidor confere a cada 15 s e manda uma mensagem curta (sem dado de visitante) quando: o placar nacional fica parado
mais de 3 min com a apuração em curso; o TSE limita as leituras (pausa até HH:MM) ou dá 3 erros seguidos; o site passa 2
min com erros (5xx acima de 1%) ou lento (p99 acima de 1 s); o app reinicia; e, como extras, o arquivo nacional do TSE
para com os estados andando, a troca automática das 17h atrasa, o servidor fica lento ou a memória passa de 80%. Cada
tipo no máximo 1 vez a cada 10 min, com "resolvido" quando volta. O contêiner de ensaio do `update.sh` nunca manda.

1. **Bot do Telegram (5 min, pelo celular):** no Telegram, fale com o **@BotFather** → `/newbot` → um nome e um usuário
   terminado em `bot` → ele responde o **token** (`123456789:AA…`). Mande qualquer mensagem para o seu bot novo (sem isso
   ele não pode escrever para você). Para descobrir o seu número (**chat id**): fale com o **@userinfobot** (ele
   responde "Id: 123456789"); para um grupo, ponha o bot no grupo e use o id do grupo (começa com `-100`).
2. **Vigia externo (homem-morto), grátis:** crie uma conta em healthchecks.io → *Add Check* → período 1 minuto, folga 2
   minutos → copie o *ping URL* (`https://hc-ping.com/…`) e, em *Integrations*, ligue o aviso para o seu e-mail ou
   Telegram. Se o processo morrer ou travar, o serviço avisa sozinho.
3. **No `.env` da VPS** (`nano /opt/sintonia/.env`), acrescente:
   ```
   TELEGRAM_BOT_TOKEN='123456789:AA…'
   TELEGRAM_CHAT_ID='123456789'
   HC_PING_URL='https://hc-ping.com/…'
   ```
   e aplique com `deploy/update.sh --sem-pull` (ensaia com o `.env` novo antes de trocar). Teste:
   `deploy/painel.sh alerta-teste` (a mensagem chega em segundos). `ALERTAS=0` no `.env` desliga tudo sem apagar os
   códigos. Os códigos nunca aparecem no log.
4. **Monitor de uptime da noite** (o do CHECKLIST A6, ou o próprio healthchecks.io com um *HTTP check*):
   `https://seu-dominio/api/saude-noite`, a cada 1 min, palavra-chave `"noite":"ok"` (a regra 2 da borda garante que a
   resposta vem da VPS, nunca de uma cópia).

### 16.2 Chaves da noite (painel → Controle, ou `deploy/painel.sh`)

Valem na hora para todos, sem publicar nada e sem invalidar o cache dos visitantes. `deploy/painel.sh chaves` mostra
todas e o que está fora do padrão.

| Chave | Padrão | Para quê | Terminal |
|---|---|---|---|
| Freio de carga | solto (1) | o site consulta 2, 3 ou 5× mais espaçado; "leve" também para o mapa por município e o "desde o 1º turno" e deixa o chat 2× mais lento | `painel.sh freio 2` · `freio 3 leve` · `freio 1` solta |
| HTML na borda | **desligada** | a Cloudflare guarda as páginas 15 s e as serve até 1 dia se a VPS cair. Ligar só no congelamento (24/10, 12h) e se o ensaio passou; antes de publicar versão nova, desligar e esperar 30 s | `painel.sh html-borda ligar\|desligar` |
| Contador público | ligada | "N pessoas agora" no site, só a partir de 500 pessoas (o painel vê sempre) | `painel.sh contador-publico ligar\|desligar` |
| Medir anúncios | ligada | contar as impressões; desligada, a rota responde sem contar (o relatório fica sem esse período) | `painel.sh medir-anuncios ligar\|desligar` |
| Aviso nacional | automático | "o arquivo nacional do TSE não atualiza desde HH:MM · veja os estados" quando o Brasil para e os estados andam | `painel.sh aviso-nacional auto\|off` |
| Texto para bots | ligada | o `!apuracao` dos bots de chat das lives; desligada, responde só o endereço do site | `painel.sh texto-bots ligar\|desligar` |
| Contar lives | ligada | contagem anônima de lives com a /live aberta | `painel.sh contar-lives ligar\|desligar` |

Também: `deploy/painel.sh tse-retomar` (retoma na hora as leituras do TSE pausadas por um bloqueio que foi falso
positivo; o mesmo que "Retomar agora" no painel → Fonte) e o teto de pedidos ao TSE por segundo (painel → Fonte,
padrão 40, de 5 a 90). Emergência na borda: seção 5.5.

