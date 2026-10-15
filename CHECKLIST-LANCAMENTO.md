# Checklist de lançamento: Sintonia

O que precisa estar feito, conferido e **decidido** antes de divulgar o site. Tem duas partes: **A. técnica** (o
operador faz e confere com os comandos abaixo) e **B. humana** (decisões de jurídico, editorial e do dono, que
nenhum teste automático substitui).

- **Bloqueia?** = "sim" quando o site não deve ser divulgado sem o item.
- **Quem decide**: *Dono* (dono do produto), *Jurídico* (advogado com experiência em direito eleitoral e LGPD),
  *Editorial* (responsável pelos textos), *Técnico* (quem opera a VPS).
- Prazo sugerido: parte A até **D−7 (18/10)**; parte B antes da divulgação; tudo pronto até **23/10**, para a
  véspera seguir o [`RUNBOOK-ELEICAO.md`](./RUNBOOK-ELEICAO.md) sem pendências.

Instalação passo a passo: [`DEPLOY.md`](./DEPLOY.md). Comandos rodam na VPS em `/opt/sintonia`.

---

## A. Técnica

### A1. Código, VPS, domínio

| # | Item | Como conferir | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A1.1 | **Branch de produção.** O código final (incluindo `deploy/`, `Dockerfile`, `docker-compose.yml`) está no branch que a VPS clona (ex.: `main`). Hoje o trabalho está em `claude/vibrant-heisenberg-w4pv0d`: junte no `main` (ou instale com `BRANCH=` desse branch) | `deploy/status.sh` → "branch" e "código local" | Dono + Técnico | sim |
| A1.2 | **VPS**: Ubuntu 24.04/22.04, região Brasil, 2 vCPU/4 GB no dia a dia e **4 vCPU/8 GB** de 24 a 26/10 (já combinado como aumentar e quanto custa) | painel do provedor; `nproc` e `free -h` | Dono | sim |
| A1.3 | **Domínio e DNS**: registro **A** para o IP da VPS; `www` só se quiser; **sem AAAA (IPv6)**; TTL baixo (5 min) | `dig +short seu-dominio` = IP da VPS; `dig +short AAAA seu-dominio` vazio (ou só IPs da Cloudflare) | Técnico | sim |
| A1.4 | **Instalação** com `deploy/install.sh`; app e Caddy `healthy`; HTTPS válido | `deploy/status.sh` (certificado "Let's Encrypt", válido até…) | Técnico | sim |
| A1.5 | **Relógio** sincronizado (a troca das 17h depende dele) | `timedatectl` → *System clock synchronized: yes* | Técnico | sim |

### A2. Configuração (`/opt/sintonia/.env`)

Confira com `grep -E '^(DOMINIO|SITE_ADDRESS|PUBLIC_URL|VITE_SITE_URL|TWITTER_SITE|TSE_AUTO|TSE_INICIO|ALLOW_SIMULACAO|SIM_AUTOSTART)=' /opt/sintonia/.env`:

| # | Variável | Valor esperado | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A2.1 | `PUBLIC_URL` | `https://seu-dominio` (sem barra no fim): endereço dos cartões, do sitemap e da proteção do painel | Técnico | sim |
| A2.2 | `VITE_SITE_URL` | `https://seu-dominio`: vai dentro do JavaScript (links de "Postar no X", WhatsApp, código dos widgets). Mudou? `deploy/update.sh --sem-pull` | Técnico | sim |
| A2.3 | `TWITTER_SITE` | `@perfil` do Sintonia no X (vira `twitter:site` nos cartões). Vazio se ainda não houver perfil | Dono | não |
| A2.4 | `ALLOW_SIMULACAO`, `SIM_AUTOSTART`, `TSE_INICIO` | **ausentes** (ou comentados). `TSE_AUTO` ausente ou `1` | Técnico | sim |
| A2.5 | `ADMIN_PASSWORD` / `ADMIN_SECRET` | gerados pelo instalador (longos e aleatórios) | Técnico | sim |

Conferências no ar (do seu computador):

```bash
# cartões: og:url e og:image com o seu domínio; twitter:site com o perfil (se definido)
curl -s https://seu-dominio/ | grep -oE '<meta (property|name)="(og:url|og:image|twitter:site)" content="[^"]*"'
# VITE_SITE_URL dentro do JavaScript (na VPS): deve listar um arquivo share-*.js
cd /opt/sintonia && docker compose exec app sh -c 'grep -l "seu-dominio" /app/dist/assets/*.js'
# sitemap e robots com o domínio certo
curl -s https://seu-dominio/robots.txt; curl -s https://seu-dominio/sitemap.xml | head -5
# estado inicial do painel: "Pré-eleição", "agendada para 25/10 17:00:00", sem aviso, simulação bloqueada
deploy/painel.sh estado
```

### A3. Cloudflare (recomendado para a noite; DEPLOY §5)

| # | Item | Como conferir | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A3.1 | Domínio na Cloudflare (nameservers trocados no registrador). **Precisa ser feito com dias de antecedência**: a troca de nameservers pode levar horas | painel da Cloudflare: zona "Ativa" | Dono | sim (para a noite) |
| A3.2 | Registro A com **nuvem laranja** (depois do 1º certificado sair com a nuvem cinza) | `curl -sI https://seu-dominio \| grep -i '^server: cloudflare'` | Técnico | sim (para a noite) |
| A3.3 | SSL/TLS **Full (strict)**; **"Sempre usar HTTPS" desligado**; Rocket Loader desligado; "Estou sob ataque" desligado | painel da Cloudflare | Técnico | sim |
| A3.4 | **Regras de cache** 1 (API pública e dados) e 2 (nunca guardar `/api/admin`, `/admin`, `/healthz`) | `curl -sI https://seu-dominio/api/status \| grep -iE 'cf-cache-status\|cache-control'` duas vezes → `HIT`/`EXPIRED`/`REVALIDATED`; em `/api/admin/state` → `BYPASS`/`DYNAMIC` | Técnico | sim (para a noite) |
| A3.5 | Se ligar "Bot Fight Mode" ou regras de WAF: conferir que o monitor de uptime (A6) e os cartões do X (A7) continuam funcionando | A6 e A7 de novo | Técnico | não |
| A3.6 | Depois de toda atualização que mude `public/data` ou `public/geo`: **limpar o cache** do prefixo `/data/` (e `/geo/`) | DEPLOY §5, último parágrafo | Técnico | não |
| A3.7 | Regra 3 (chat sem query: `/api/chat` com a query ignorada na chave de cache) | `curl -s -o /dev/null -w '%{http_code}' 'https://seu-dominio/api/chat?x=1'` → 200 (vem da borda) | Técnico | não |
| A3.8 | **Antes de vender anúncio:** *Painel → Audiência → Zerar medição* depois do deploy final (tira os testes) e conferir a concentração por rede no pico | painel | Técnico + Dono | não |

### A4. Senhas e acessos

| # | Item | Quem decide | Bloqueia? |
|---|---|---|---|
| A4.1 | Senha do painel guardada num **gerenciador de senhas**, conhecida por **duas** pessoas (operador e dono) | Dono | sim |
| A4.2 | SSH só por chave (`PasswordAuthentication no`), chaves de quem opera cadastradas; senha de root do provedor guardada | Técnico | sim |
| A4.3 | **2FA** nas contas do provedor da VPS, do registrador do domínio, da Cloudflare, do GitHub e do X | Dono | sim |
| A4.4 | Token do GitHub (se repositório privado) só com *Contents: Read-only* e só para este repositório | Técnico | não |
| A4.5 | Nenhuma senha em chat, e-mail ou documento compartilhado. Se vazar: trocar (DEPLOY §9) | todos | — |

### A5. Backup

| # | Item | Como conferir | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A5.1 | Backup de hora em hora ativo | `cat /etc/cron.d/sintonia`; `ls -lt /var/backups/sintonia \| head -3` | Técnico | sim |
| A5.2 | Cópia **fora da VPS** (diária e na véspera) | `scp root@IP:/var/backups/sintonia/sintonia-*.tar.gz ./` | Técnico | sim |
| A5.3 | Restauração ensaiada uma vez (lista e um restore numa hora tranquila) | `deploy/restore.sh --listar` | Técnico | não |
| A5.4 | (Opcional) snapshot automático do provedor | painel do provedor | Dono | não |

### A6. Monitoramento externo de uptime

Um serviço de fora (UptimeRobot, Better Stack, Uptime Kuma noutra máquina…) que avise no **celular** de duas pessoas.

| # | Item | Como configurar | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A6.1 | Monitor do **app** | `https://seu-dominio/healthz` a cada 1 min, palavra-chave `"ok":true` (com a Cloudflare, a regra 2 garante que ele chega à VPS) | Técnico | sim |
| A6.2 | Monitor da **página** | `https://seu-dominio/` a cada 1–5 min, palavra-chave `Sintonia` | Técnico | não |
| A6.3 | Alerta de **certificado** perto de vencer (o Caddy renova sozinho; isto é só um alarme) | opção do serviço de monitor | Técnico | não |
| A6.4 | Teste do alerta: pare o app por 2 min numa hora tranquila (`docker compose stop app` → `docker compose start app`) e confirme que o aviso chegou | — | Técnico | não |

### A7. Cartões no X e no WhatsApp

O antigo *Card Validator* do X não mostra mais a prévia (só um log). O teste que vale é **colar o link num rascunho
de post** no X (sem publicar) e mandar o link para si mesmo no WhatsApp. O X guarda o cartão de cada endereço por
alguns dias: para testar de novo depois de uma mudança, acrescente `?v=2` ao link.

| # | Link para testar | O que deve aparecer | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A7.1 | `https://seu-dominio/` | cartão grande com imagem, título neutro, domínio certo | Técnico | sim |
| A7.2 | `/apuracao` e `/apuracao/sp` | placar do 1º turno oficial (antes de 25/10), "Fonte: TSE" | Técnico | sim |
| A7.3 | `/governadores` | as disputas de `UFS_GOV_2T` em turquesa/âmbar | Técnico | não |
| A7.4 | `/teste` | cartão genérico do Teste Cego (sem resposta de ninguém) | Técnico | sim |
| A7.5 | `/curiosidades` e um `?fato=` | fato com o par simétrico dos finalistas | Técnico | não |
| A7.6 | `/cenarios` | cartão com "Cenário hipotético · não é pesquisa nem previsão" | Técnico | não |
| A7.7 | uma ficha `/candidato/<sq>` | foto oficial do TSE | Técnico | não |
| A7.8 | Botão **"Postar no X"** e **WhatsApp** dentro do site | o link que sai aponta para `https://seu-dominio/…` (A2.2) | Técnico | sim |

### A8. TSE e quadro do 2º turno

| # | Item | Como conferir | Quem decide | Bloqueia? |
|---|---|---|---|---|
| A8.1 | Feed do TSE alcançável da VPS, códigos do 2º turno (pleito 3221, Presidente 6258, Governador 6260) | `deploy/painel.sh testar-tse` → "Feed ok: eleição 6258 (2º turno)…" | Técnico | sim |
| A8.2 | **Quadro de Governador** (`UFS_GOV_2T`: hoje AC, AM, DF, ES, RN e TO). O TSE tirou o RJ em 10/10; o TO ainda não tem arquivo do 2º turno. Acompanhar até 23/10 e decidir mudanças **antes da véspera** (procedimento no README, "Mudança no quadro do 2º turno") | `npx tsx scripts/data/fetch-tse.ts` (na máquina de desenvolvimento) e o "Atenção" do `testar-tse` | Dono | sim |
| A8.3 | Ensaio da troca (opcional) feito e **desfeito**: `painel.sh estado` volta a "agendada para 25/10 17:00:00" | `deploy/painel.sh estado` | Técnico | sim |

### A9. Pendências de conteúdo no código (executa o técnico, depois da decisão humana em B)

| # | Arquivo | O que trocar | Depende de |
|---|---|---|---|
| A9.1 | `src/app/components/pages/home/Institucional.tsx` (`CONTATO`) | os e-mails `@sintonia.example` pelos reais (enquanto o de privacidade for `.example`, o formulário "Quero anunciar" fica fechado em produção) | B4 |
| A9.2 | `src/app/pages/static/SobrePage.tsx` (`EQUIPE`) | "Nome a definir" pelos nomes (ou tirar a seção) | B4 |
| A9.3 | `src/app/pages/static/PrivacidadePage.tsx` | controlador, encarregado, operadores (provedor da VPS, Cloudflare), retenção de registros, data "atualizado em" | B3 e B1.7 |
| A9.4 | `src/app/content/afirmacoes.ts` (+ `afirmacoes.test.ts` e a validação no fim do arquivo) | depois da revisão: `revisado: true` em cada afirmação aprovada (o tipo hoje é o literal `false`, de propósito) e as correções de texto | B2.1 |
| A9.5 | depois de A9.1–A9.4 | `deploy/update.sh` na VPS e repetir A7 | — |

---

## B. Humana

### B1. Revisão jurídica

| # | Tema | Pergunta a responder | Quem decide | Bloqueia? |
|---|---|---|---|---|
| B1.1 | **Calculadora "E se…?"** (`/cenarios`) | Um cenário hipotético calculado sobre o 1º turno oficial, sem coleta de dados e com a marca "não é pesquisa nem previsão" em três camadas, pode ser confundido com pesquisa eleitoral não registrada ou prognóstico (Lei 9.504/97, art. 33; Res. TSE 23.600/2019)? Os avisos bastam? Fica no ar em 24 e 25/10? | Jurídico | sim |
| B1.2 | **Curiosidades com nomes reais** (29 fatos do 1º turno, em pares simétricos) | Há risco de serem lidas como propaganda? Ficam no ar na véspera e no dia da eleição? | Jurídico | sim |
| B1.3 | **Teste Cego e link de Duelo** | Opinião política é dado sensível (LGPD art. 5º, II). As respostas nunca saem do aparelho, mas o Duelo as leva **no link** que a própria pessoa compartilha, depois de um aviso explícito. O texto do aviso e o consentimento bastam? O Teste fica no ar no dia 25? | Jurídico | sim |
| B1.4 | **Sigilo das seções** | O site mostra o boletim de cada seção (o TSE publica os BUs) e o mosaico por seção. Seções com pouquíssimos eleitores (ex.: exterior) podem expor o voto de alguém? Aplicar algum mínimo? (As curiosidades já excluem seção unânime.) | Jurídico + Dono | sim |
| B1.5 | **Fotos e nomes** | Uso das fotos oficiais do TSE (mesmo tratamento para todos, sem edição) e dos nomes de urna | Jurídico | não |
| B1.6 | **Divulgação e impulsionamento** | Impulsionamento pago de conteúdo eleitoral é exclusivo de candidatos e partidos (Lei 9.504/97, art. 57-C): **não** pagar anúncio de post com nome ou número de candidato. Regras para posts do perfil do Sintonia no dia 25 | Jurídico + Dono | sim |
| B1.7 | **Registros de acesso (Marco Civil, art. 15)** | Por desenho, o app e o Caddy **não registram IP**; a Cloudflare registra do lado dela. A política de privacidade diz que os registros técnicos "são guardados pelo prazo exigido pelo Marco Civil". Se o responsável for pessoa jurídica com fins econômicos, a guarda de 6 meses é obrigação: ligar log de acesso com retenção segura, ou ajustar o texto | Jurídico + Dono | sim |
| B1.8 | **Patrocínio** | Só anunciante não político, com contrato que diga isso. Desligado por padrão | Jurídico + Dono | não |
| B1.9 | **Chat ao vivo** (`/apuracao`, `/ao-vivo`) | Conteúdo de terceiros num site com anúncio: filtros, moderação e denúncia bastam (Marco Civil art. 19; Lei 9.504/97 art. 57-D, anonimato)? Ligar o **registro cifrado dos envios** (`CHAT_REGISTRO_CHAVE`, DEPLOY §5.1, desligado), quem guarda a chave privada? A sala fica fechada de 0h às 17h de 25/10 (art. 39 §5º) | Jurídico + Dono | sim |
| B1.10 | **Anúncio em imagem com candidato** | Hoje DESLIGADO (`OFERECIMENTO_COM_CANDIDATOS = false`): placar e palpite com nomes saem sem "Oferecimento". Ligar só com parecer (a imagem circula sem o site em volta, com foto e número) | Jurídico + Dono | não |
| B1.11 | **Palpite do 2º turno** | Prazo até 23h59 de 24/10, palpite travado e sem compartilhar no dia da votação, sem número agregado. Basta para não ser lido como pesquisa/prognóstico? | Jurídico | sim |
| B1.12 | **Números de audiência na /anuncie** (interruptor desligado) | Só o pico do sinal das páginas, maior dia em únicos e páginas vistas, "desde <data>". A forma de medir (conservadora) está descrita; ligar depois de zerar a medição (A3.8) | Dono | não |

### B2. Revisão editorial

| # | Item | O que fazer | Quem decide | Bloqueia? |
|---|---|---|---|---|
| B2.1 | **As 24 afirmações do Teste Cego** (`src/app/content/afirmacoes.ts`, método em `src/app/content/FONTES.md`) | Hoje estão com `revisado: false`, e o site mostra "textos em revisão editorial final". Conferir cada afirmação e cada posição atribuída contra o programa de governo **oficial do TSE** (com página), a neutralidade da redação, o equilíbrio entre temas e os trechos citados; conferir o SHA-256 dos PDFs contra os do TSE (pendência registrada no FONTES.md). Idealmente duas pessoas de visões diferentes. Depois, A9.4 | Editorial (+ Jurídico) | sim |
| B2.2 | **Curiosidades** (29 fatos) | Números conferidos pelo pipeline; revisar redação, títulos e a simetria entre os finalistas | Editorial | não |
| B2.3 | **Textos de compartilhar e avisos prontos** | Ler os textos dos cartões (amostra de cada tela) e aprovar os 4 avisos do `RUNBOOK-ELEICAO.md` §5 | Editorial | sim |
| B2.4 | **Sobre e Metodologia** | Reler. Em 12/10 corrigimos a frase que dizia "não usamos fotos de candidatos" (o site usa as fotos oficiais do TSE; nunca com números simulados nem com nomes ocultos) | Editorial | não |

### B3. Política de privacidade (`/privacidade`)

| # | Item | Quem decide | Bloqueia? |
|---|---|---|---|
| B3.1 | Identificação do **controlador** (nome ou razão social, CNPJ/CPF) e do **encarregado** (LGPD art. 41) com contato | Dono + Jurídico | sim |
| B3.2 | Operadores citados: provedor da VPS e Cloudflare (que recebem IP e dados técnicos de cada acesso) | Jurídico | sim |
| B3.3 | Retenção de registros coerente com B1.7 | Jurídico | sim |
| B3.4 | O que fica no aparelho (tema, progresso do Teste, cenários), sem cookies de rastreamento: conferir que continua verdadeiro (nenhum analytics foi acrescentado) | Técnico + Jurídico | sim |

### B4. Contato e responsáveis

| # | Item | Quem decide | Bloqueia? |
|---|---|---|---|
| B4.1 | E-mails reais (geral, imprensa, correções, privacidade), **lidos de verdade** de 24 a 26/10 | Dono | sim |
| B4.2 | Política de correções: quem responde e em quanto tempo; como uma correção aparece no site | Dono + Editorial | não |
| B4.3 | Equipe na página Sobre (nomes ou retirar a seção) | Dono | não |
| B4.4 | Escala de plantão de 24 a 26/10 preenchida no `RUNBOOK-ELEICAO.md` §0 | Dono | sim |

### B5. Antes de divulgar

- [ ] Partes A e B sem nenhum "sim" pendente.
- [ ] Uma pessoa que não participou do projeto abriu o site no celular (pelo app do X), fez o Teste Cego, abriu a apuração e
      uma curiosidade, e não encontrou nada estranho.
- [ ] O dono leu o `RUNBOOK-ELEICAO.md` inteiro e sabe onde está cada comando.
