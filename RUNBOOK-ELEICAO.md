# Runbook da eleição: Sintonia, de 24 a 26/10/2026

Roteiro para quem vai operar o site na véspera, no domingo da eleição (25/10, 2º turno) e na segunda-feira.
Horários de **Brasília**. Pressupõe o site instalado pelo [`DEPLOY.md`](./DEPLOY.md) e o
[`CHECKLIST-LANCAMENTO.md`](./CHECKLIST-LANCAMENTO.md) cumprido.

> **Em uma frase:** às 17h00 de 25/10 o servidor confere o feed do TSE e troca a fonte de dados sozinho. O trabalho
> da noite é **conferir**, **não mexer** e saber o que fazer se algo sair do roteiro.

---

## 0. Antes de tudo

**Papéis** (preencha antes do dia 24; o ideal são duas pessoas acordadas das 16h às 23h):

| Papel | Quem | Telefone | O que decide |
|---|---|---|---|
| Operador técnico | | | roda os comandos, acompanha a VPS e a Cloudflare |
| Responsável editorial | | | publica e tira avisos no site (só os textos da seção 5) |
| Dono do produto | | | voltar para "Pré-eleição", ligar a Cloudflare às pressas, aumentar a VPS, qualquer coisa fora deste roteiro |

**Onde rodar os comandos:** na VPS, como root, dentro da pasta do projeto:

```bash
ssh root@IP-DA-VPS
cd /opt/sintonia
```

**Abas abertas no computador do operador:** o site (`https://seu-dominio`), o painel
(`https://seu-dominio/admin`, já logado), o site oficial do TSE ([resultados.tse.jus.br](https://resultados.tse.jus.br)),
o painel da Cloudflare (Analytics) e o monitor externo de uptime.

---

## 1. Cola de comandos

Todos dentro de `/opt/sintonia`. Os comandos `deploy/painel.sh` fazem pelo terminal o mesmo que o painel `/admin`:
usam a senha do `.env` por dentro do contêiner, sem passar pela internet.

| Para quê | Comando |
|---|---|
| Situação geral (contêineres, saúde, fonte, fase, memória, certificado, backup, logs) | `deploy/status.sh` |
| Estado do painel (fonte, fase no site, troca automática, aviso, simulação travada) | `deploy/painel.sh estado` |
| Feed do TSE por disputa (% de seções, horário do TSE, falhas) | `deploy/painel.sh tse` |
| Conferir o feed do TSE agora | `deploy/painel.sh testar-tse` |
| **Forçar a troca para o TSE** (confere o feed antes) | `deploy/painel.sh trocar-agora` |
| Adiar a troca automática | `deploy/painel.sh adiar 15` (minutos) · `deploy/painel.sh marcar 17:30` |
| Voltar ao horário padrão (17h00 de 25/10) | `deploy/painel.sh horario-padrao` |
| Desligar / religar a troca automática | `deploy/painel.sh desligar-troca` · `deploy/painel.sh ligar-troca` |
| **Voltar para "Pré-eleição"** (1º turno oficial) | `deploy/painel.sh fonte pre` |
| Pôr o TSE sem conferir o feed (último recurso) | `deploy/painel.sh fonte tse` |
| Publicar aviso no site | `deploy/painel.sh aviso "texto"` · com destaque: `deploy/painel.sh alerta "texto"` |
| Tirar o aviso | `deploy/painel.sh sem-aviso` |
| Log do app ao vivo (Ctrl+C sai) | `docker compose logs -f --since 5m app` |
| Só a troca automática no log | `docker compose logs --since 2h app \| grep 'Troca automática'` |
| Só erros | `docker compose logs --since 15m app \| grep '"nivel":"erro"'` |
| Resumo por minuto (req/s, latência, 5xx, 429) | `docker compose logs --since 5m app \| grep '"reqPorSeg"' \| tail -n 3` |
| Cartões barrados por limite (429 nas imagens) | `docker compose logs --since 15m app \| grep '"status":429' \| grep -c '/api/og/'` |
| CPU e memória ao vivo | `docker stats` (Ctrl+C sai) |
| Backup agora | `deploy/backup.sh` |
| Voltar para a versão anterior do código | `deploy/update.sh --rollback` (≈ 5 s) |
| Restaurar o estado do painel | `deploy/restore.sh --listar` e `deploy/restore.sh <arquivo>` |
| Reiniciar só o app (≈ 2–4 s; o Caddy segura as requisições) | `docker compose restart app` |

`deploy/painel.sh --help` lista tudo. A simulação **não** pode ser ligada por esse script, e em produção o servidor
também a recusa.

**Como ler o `painel.sh estado` num dia normal antes da eleição:**

```
Fonte de dados:   Pré-eleição (1º turno oficial + contagem regressiva)
Fase no site:     antes da apuração
Troca automática: agendada para 25/10 17:00:00
Aviso no site:    nenhum
Simulação:        bloqueada (correto no site público)
Códigos do TSE:   pleito 3221 · Presidente 6258 · Governador 6260 · a cada 15 s
```

Qualquer coisa diferente disso **antes das 17h de 25/10** é motivo para olhar com calma (seção 3).

---

## 2. Linha do tempo

### Sábado, 24/10 (véspera)

| Quando | O quê | Como conferir |
|---|---|---|
| **até 12h00** | **Última atualização de código.** Depois disso, código congelado até segunda | `deploy/update.sh`; no fim, `deploy/status.sh` mostra a imagem nova `healthy` |
| até 12h00 | Situação do TSE no Governador: o "Testar conexão" diz quais UFs ainda não têm arquivo do 2º turno (hoje, TO). Se o TSE tiver mudado o quadro (ex.: TO eleito no 1º turno), a decisão é do dono e o procedimento está no README, "Mudança no quadro do 2º turno"; **não** faça isso no domingo | `deploy/painel.sh testar-tse` |
| 14h00 | **Aumentar a VPS** para 4 vCPU / 8 GB, se ainda não estiver (o provedor reinicia a máquina: ≈ 1–2 min fora do ar; tudo volta sozinho) | depois: `deploy/status.sh` (tudo `healthy`) |
| 15h00 | (Opcional) **ensaio da troca**: `deploy/painel.sh marcar HH:MM` (daqui a 3 min). No horário, `deploy/painel.sh estado` deve mostrar "feita". As páginas continuam no 1º turno (a fase depende da data da eleição) | `deploy/painel.sh estado` |
| logo depois do ensaio | **Desfazer o ensaio** (obrigatório se ensaiou): `deploy/painel.sh fonte pre` e `deploy/painel.sh horario-padrao` | `painel.sh estado` = **"agendada para 25/10 17:00:00"** |
| 18h00 | Cloudflare conferida (cache `HIT` na API, nuvem laranja, "Sempre usar HTTPS" desligado); monitor de uptime verde; relógio sincronizado | DEPLOY §5 item 7; `timedatectl` → *synchronized: yes* |
| 20h00 | Backup **copiado para fora da VPS**; escala do domingo confirmada; textos de aviso (seção 5) aprovados pelo editorial | `scp root@IP:/var/backups/sintonia/sintonia-*.tar.gz ./` |

### Domingo, 25/10 (eleição)

**08h00 às 17h00 — votação.** O site está em "Pré-eleição": 1º turno oficial e contagem regressiva. Nada a fazer
além de uma olhada a cada poucas horas (`deploy/status.sh`).

**14h00 — congelamento total.** Daqui em diante: nenhum `update.sh`, nenhuma edição no `.env`, nenhuma mudança na
Cloudflare, nenhum reinício da VPS, salvo pelo plano de contingência (seção 3).

**16h00 — conferência T−60:**

1. `deploy/status.sh`: app e Caddy `healthy`; memória do app abaixo de 600 MB; disco com folga; certificado válido;
   último backup há menos de 1 h.
2. `deploy/painel.sh estado`: exatamente o bloco "dia normal" da seção 1 (fonte Pré-eleição, **agendada para 25/10
   17:00:00**, aviso nenhum, simulação bloqueada, códigos 3221/6258/6260).
3. `deploy/painel.sh testar-tse`: deve dizer "Feed ok: eleição 6258 (2º turno)…" com 0 seções totalizadas (o arquivo
   existe zerado desde antes da eleição). Um "Atenção" sobre UF sem arquivo (TO) é esperado.
4. `timedatectl`: *System clock synchronized: yes*.
5. Entre no painel `/admin` no navegador agora: a sessão vale 12 h (até ~4h da manhã).
6. Do seu computador, duas vezes: `curl -sI https://seu-dominio/api/status | grep -iE 'cf-cache-status|cache-control'`
   → `HIT`/`EXPIRED`/`REVALIDATED` e `s-maxage=1`.

**16h30 — conferência T−30:**

1. Abra o site no celular, dentro do app do X (cole o link num rascunho e toque): contagem regressiva,
   **nenhuma** faixa "SIMULAÇÃO", nenhum aviso.
2. Abra o log ao vivo numa janela: `docker compose logs -f --since 1m app | grep -E 'Troca|erro|aviso'`.
3. Deixe o painel aberto em *Fonte de dados → Troca automática para o TSE* (mostra a contagem e as tentativas).
4. Faça um backup manual: `deploy/backup.sh`.

**17h00 — troca automática.** Sem ninguém clicar, o servidor:

1. confere o feed do TSE (leva < 1 s quando o TSE responde);
2. se respondeu: troca a fonte para **TSE ao vivo** e começa a ler o feed a cada 15 s. No log:
   `Troca automática para o TSE: FEITA na tentativa 1 (…)`;
3. se **não** respondeu: mantém "Pré-eleição", publica sozinho o aviso discreto *"Aguardando os primeiros dados do
   TSE"* e tenta de novo em 15 s, 30 s, 60 s e depois a cada 2 min. Quando o TSE responder, troca e tira o aviso.

Confira às **17h01** com `deploy/painel.sh estado`:

| Você vê | Significa | O que fazer |
|---|---|---|
| `Fonte de dados: TSE ao vivo` · `Troca automática: feita em 25/10 17:00:0x` | deu certo | nada; siga para "primeiras seções" |
| `Troca automática: AGUARDANDO O TSE: N tentativa(s)…` | o feed do TSE ainda não responde | nada nos primeiros 15 min (é comum o TSE demorar alguns minutos); se passar das 17h15, seção 3.1 |
| `Troca automática: agendada para …` (outro horário) ou `desligada` | alguém mexeu na troca | `deploy/painel.sh trocar-agora` |
| `Troca automática: DESABILITADA no servidor` | `TSE_AUTO=0` no `.env` | `deploy/painel.sh fonte tse` (sem conferência) e, depois da noite, apague a linha |
| `Fase no site: antes da apuração` com a fonte TSE, **depois das 17h** | relógio da VPS errado | `timedatectl`; seção 3.4 |

**17h00–17h30 — primeiras seções.** O TSE costuma publicar os primeiros números poucos minutos depois das 17h.

- `deploy/painel.sh tse` a cada 5 min: o `%` de seções e o horário "TSE às" sobem; "falha(s) seguida(s)" fica vazio.
- **Compare com o TSE**: o percentual de seções e os votos de Presidente no Brasil devem ser os mesmos do
  [resultados.tse.jus.br](https://resultados.tse.jus.br) (com até ~15–30 s de diferença). Confira também um governador.
- Abra `https://seu-dominio/api/og/apuracao.png` e um cartão de compartilhar: "Fonte: TSE", nenhuma marca de simulação.
- Governador: as disputas de `UFS_GOV_2T` (hoje AC, AM, DF, ES, RN e TO). Se o TSE não tiver publicado o arquivo de uma UF,
  ela fica em "aguardando" — nunca com número inventado.

**17h30–21h00 — pico.** Na referência de 2022, metade das seções foi totalizada perto das 18h e o resultado de
Presidente ficou matematicamente definido por volta das 20h; é aí que o tráfego explode. A cada **15 min**:

| Conferir | Normal | Atenção se… |
|---|---|---|
| `deploy/status.sh` → memória do app | 250–600 MB | passar de 1 GB (limite 1,5 GB) |
| `docker stats` → CPU do app | variável | 100% (= 1 núcleo inteiro) por vários minutos seguidos |
| `docker stats` → memória do Caddy | 10–250 MB | passar de 400 MB (limite 512 MB) |
| painel → Monitor: p99 / atraso do event loop | < 0,3 s / < 0,1 s | p99 > 1 s por minutos seguidos |
| `deploy/painel.sh tse` | "feed: ok", horário do TSE avançando | "COM FALHAS" ou horário parado > 5 min com o TSE avançando |
| erros no log (comando da seção 1) | nenhum ou raros | vários por minuto |
| 429 nas imagens (comando da seção 1) | 0 a poucos | dezenas a cada 15 min: seção 3.3, "cartões sem imagem" |
| Cloudflare → Analytics → Cache | maioria servida pela Cloudflare | a maioria indo para a VPS: confira as regras de cache (DEPLOY §5) |

"Pessoas agora" conta só quem chega até a VPS; com a Cloudflare na frente, é bem menor que a audiência real. É
normal.

**Resultado matematicamente definido.** O site mostra sozinho o evento ("matematicamente definida", texto neutro). Não
publique aviso sobre isso e não poste projeções: o site só mostra o que o TSE divulga.

**Encerramento (geralmente entre 21h e a madrugada).** Quando o TSE conclui Presidente e nenhuma disputa de governador
segue apurando, o site passa sozinho para "Apuração encerrada" (o "ao vivo" some do cabeçalho, da home, dos widgets e
da TV). Seções retardatárias podem levar horas.

- **Deixe a fonte em "TSE ao vivo"** a noite toda e depois dela. Voltar para "Pré-eleição" faria o site mostrar o
  1º turno de novo.
- Tire qualquer aviso que ainda esteja no ar (`deploy/painel.sh sem-aviso`).
- Backup final e cópia para fora da VPS: o arquivo leva o histórico da noite (`tse-historico.json`), que alimenta o
  "Reveja a noite".

### Segunda, 26/10

| Quando | O quê |
|---|---|
| manhã | `deploy/painel.sh estado` (fonte TSE, fase "apuração encerrada") e `deploy/painel.sh tse` (100% ou perto disso); compare os totais finais com o TSE |
| manhã | backup copiado para fora da VPS |
| depois do almoço | reduzir a VPS de volta, se quiser (reinício de 1–2 min, num horário de pouco acesso); `deploy/status.sh` depois |
| semana seguinte | o site continua de pé como registro. Se o TSE retotalizar, o feed continua sendo lido; nada a fazer. Mudanças de código voltam a ser permitidas com `update.sh` |

---

## 3. Plano de contingência

Regra geral: **primeiro olhe** (`deploy/status.sh`, `deploy/painel.sh estado`, log), **depois aja**, e sempre um
passo de cada vez. Na dúvida entre mexer e não mexer, não mexa: o servidor foi feito para se recuperar sozinho de
quedas do TSE e de travamentos do processo.

### 3.1 TSE fora do ar ou lento

**Antes da primeira troca (17h, "AGUARDANDO O TSE"):** o próprio servidor tenta de novo e já mostra o aviso
"Aguardando os primeiros dados do TSE".

1. Confira o site do TSE no navegador. Se o TSE também não mostra nada, **espere**: a troca acontece sozinha quando o
   feed responder.
2. Se o site do TSE já mostra números há mais de 10 min e o nosso continua aguardando: `deploy/painel.sh testar-tse` e
   leia o motivo.
   - "404"/"não encontrado" na eleição 6258: o TSE pode ter publicado com outro código. Veja
     [`src/tse/README.md`](./src/tse/README.md) §4. A troca dos códigos é pelo painel (*Fonte de dados → Feed do
     TSE*) e é **decisão do dono**. Depois, `deploy/painel.sh trocar-agora`.
   - Erro de rede/tempo esgotado: teste da VPS `curl -sI https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`.
     Se a VPS não alcança o TSE mas o seu computador alcança, o problema é de rede do provedor: abra chamado.
3. Não use `fonte tse` para "forçar" sem conferência: sem feed, ela só troca o aviso por uma apuração vazia.

**No meio da noite (o feed parou):** o site continua mostrando o último dado bom, com o horário da última seção
totalizada, mas **não** avisa da queda sozinho.

- `deploy/painel.sh tse` mostra "falha(s) seguida(s)" e o horário parado.
- Se o horário estiver parado há **mais de 5 min** e o site do TSE estiver avançando, publique o aviso 2 da seção 5
  (`deploy/painel.sh alerta "…"`). Se o próprio TSE estiver parado, o aviso também ajuda o visitante.
- Quando o feed voltar (o servidor se recupera sozinho em segundos): `deploy/painel.sh sem-aviso`.

### 3.2 Números do site diferentes dos do TSE

Diferença de alguns segundos é normal (o feed é lido a cada 15 s e a CDN guarda 1–2 s). Diferença que **persiste**
por minutos, ou números claramente errados:

1. `deploy/painel.sh tse`: o horário "TSE às" é o mesmo do site do TSE?
2. Se o nosso dado estiver errado e não houver explicação em poucos minutos, a decisão do **dono** é a saída segura:
   `deploy/painel.sh fonte pre` (o site volta ao 1º turno oficial, sem número do 2º turno) e o aviso 3 da seção 5.
   Número errado no ar é pior que nenhum número.
3. Para voltar depois: `deploy/painel.sh trocar-agora` e `deploy/painel.sh sem-aviso`.

### 3.3 VPS sobrecarregada (site lento, 502/504, CPU em 100%)

1. **Sem Cloudflare na frente?** É a primeira coisa a fazer, e funciona em minutos **se o domínio já estiver na
   Cloudflare** com a nuvem cinza: no DNS, mude o registro A (e o `www`) para **nuvem laranja**. Confira que o modo
   SSL é *Full (strict)* e que as regras de cache existem (DEPLOY §5). Em ~5 min a VPS passa a receber uma fração do
   tráfego. (Se o domínio **não** estiver na Cloudflare, trocar os nameservers no domingo não dá tempo: vá para o
   passo 3.)
2. **Com Cloudflare, mas a VPS ainda sofre:** Analytics → Cache. Se a maior parte não vier do cache, as regras de
   cache não estão valendo (confira a expressão e o domínio na regra 1). Nunca ligue o modo "Estou sob ataque": ele
   bloqueia as atualizações automáticas da apuração.
3. **Aumentar a VPS** (decisão do dono): mais vCPU ajuda o Caddy, a compressão e as imagens. Reinicia a máquina:
   ≈ 1–2 min fora do ar (com a Cloudflare, quem já carregou continua vendo o último dado guardado).
4. **Último recurso, sem CDN:** réplicas (DEPLOY §10). Leia as limitações antes; com Cloudflare, use 1 réplica.

**Cartões sem imagem no X** (log com muitos 429 em `/api/og/`): o limite de imagens novas por visitante pode estar
barrando os robôs de prévia. Suba o limite no `.env` (`OG_LIMITE_MIN=120`; `0` = sem limite, a fila de geração ainda
protege a CPU) e rode `docker compose up -d` (recria o app em ~3 s).

**Caddy perto do limite de memória** (> 450 MB sem CDN): `CADDY_MEMORIA=1G` e `CADDY_GOMEMLIMIT=800MiB` no `.env` e
`docker compose up -d caddy` (o HTTPS fica ~2–5 s fora do ar). Melhor ainda: Cloudflare na frente.

### 3.4 App fora do ar, travado ou com relógio errado

- **Travado:** o vigia do healthcheck reinicia o processo sozinho depois de ~75 s sem resposta. Se passar de 3 min:
  `docker compose restart app`. O estado do painel (fonte, troca, aviso) e o histórico ficam no volume e voltam iguais.
- **Não sobe:** `docker compose logs --tail 100 app`. Se começou depois de uma atualização: `deploy/update.sh --rollback`.
- **Relógio errado** (fase não muda às 17h, horários estranhos): `timedatectl set-ntp true`, espere sincronizar e
  `docker compose restart app`.

### 3.5 Versão nova com defeito (rollback)

O `update.sh` já barra versão que não sobe e volta sozinho se a nova não ficar saudável. Se o defeito for na tela
(o app sobe, mas algo está errado para o visitante):

```bash
deploy/update.sh --rollback      # volta para a imagem anterior em ~5 s, sem derrubar o site
deploy/status.sh                 # confira "imagem no ar"
```

O rollback troca só o código. O estado do painel não muda. Se ele também precisar voltar (ex.: alguém mexeu no que
não devia), use `deploy/restore.sh --listar` e `deploy/restore.sh <arquivo>`. O app fica parado ~5 s; o restore faz um
backup do estado atual antes.

### 3.6 HTTPS / Cloudflare com erro

| Sintoma | O que fazer |
|---|---|
| Erro 526 (Cloudflare) | certificado da VPS com problema: nuvem **cinza**, `docker compose logs caddy`, volte para laranja quando o HTTPS direto funcionar |
| Erro 521/522 | Cloudflare não alcança a VPS: `deploy/status.sh`; firewall do provedor com 80/443 abertos? |
| Erro 502/504 | app reiniciando ou travado: seção 3.4 |

### 3.7 Painel não abre

- **429 no login:** muitas tentativas (talvez de terceiros). Espere 1 min. Por isso: entre no painel **antes** das 17h
  (a sessão vale 12 h). O `deploy/painel.sh` também faz login e está sujeito ao mesmo limite.
- **503:** `ADMIN_PASSWORD` vazio no `.env`.
- O site público continua funcionando sem o painel; a troca das 17h não depende de ninguém estar logado.

### 3.8 A VPS morreu

1. Crie outra VPS igual, rode o `install.sh` (DEPLOY §3) e depois
   `deploy/restore.sh <backup> --com-env` (mesma senha, mesmo estado, mesmo histórico).
2. Na Cloudflare, troque o IP do registro A para o da VPS nova (com a nuvem laranja vale na hora; sem a Cloudflare,
   depende do TTL do DNS).
3. Tempo total: ~20–30 min com o backup em mãos.

---

## 4. O que NUNCA fazer

- **Nunca ligar a simulação no site público.** Nada de `ALLOW_SIMULACAO=1` ou `SIM_AUTOSTART` no `.env` da produção,
  nem fonte "Simulação" no painel. São números fictícios; mesmo com a faixa "SIMULAÇÃO", um print circulando no dia da
  eleição é desinformação com a nossa marca. Ensaios só numa cópia separada do site.
- Nunca publicar aviso com nome de candidato, número parcial, projeção, "eleito" antes do TSE ou adjetivo. Só os
  textos da seção 5, ou outros aprovados pelo editorial.
- Nunca voltar a fonte para "Pré-eleição" depois do encerramento.
- Nunca usar "Congelar dados" (painel → Comunicação) na noite: é uma ferramenta de ensaio da simulação e não tem uso
  com o TSE ao vivo.
- Nunca rodar `docker compose down -v`, `docker volume rm` ou `docker system prune --volumes`: apagam o estado do painel,
  o histórico da noite e os certificados.
- Nunca editar arquivos do código dentro de `/opt/sintonia` na VPS (o `update.sh` para) nem atualizar o código depois
  das 14h do domingo, a não ser pelo rollback.
- Nunca mudar `TSE_INICIO` no `.env` no dia 25 (o padrão já é 17h00) nem os códigos do TSE sem um motivo
  confirmado (seção 3.1).
- Nunca ligar na Cloudflare: "Estou sob ataque", Rocket Loader, "Sempre usar HTTPS" ou cache das rotas `/api/admin`.
- Nunca "Limpar tudo" no cache da Cloudflare durante o pico (tudo cai de uma vez na VPS). Se precisar limpar, use o
  prefixo do que mudou.
- Nunca criar registro AAAA (IPv6) para a VPS.
- Nunca mandar a senha do painel por chat ou e-mail. Se vazar, troque (DEPLOY §9): derruba todas as sessões.
- Nunca pagar impulsionamento de post com nome ou número de candidato (só candidatos e partidos podem impulsionar
  conteúdo eleitoral; ver o checklist jurídico).

---

## 5. Avisos prontos (texto neutro, aprovados antes)

Máximo de 280 caracteres. Use `deploy/painel.sh aviso "…"` (discreto) ou `deploy/painel.sh alerta "…"` (destaque), ou
o painel (*Comunicação → Aviso global*). Tire com `deploy/painel.sh sem-aviso` assim que deixar de valer.

| # | Quando | Nível | Texto |
|---|---|---|---|
| 1 | atualização mais lenta que o normal | aviso | Os resultados aparecem aqui conforme o TSE divulga e podem levar alguns minutos a mais para atualizar. |
| 2 | feed do TSE parado no meio da noite | alerta | O TSE está demorando a publicar novos dados. Os números exibidos são os últimos divulgados e voltam a atualizar sozinhos. |
| 3 | voltamos para "Pré-eleição" (seção 3.2) | alerta | Os resultados do 2º turno estão temporariamente indisponíveis aqui. Acompanhe também em resultados.tse.jus.br. |
| 4 | site lento por excesso de acessos | aviso | Muitos acessos agora: as atualizações podem levar alguns segundos a mais. |

O aviso automático "Aguardando os primeiros dados do TSE" é do próprio servidor: aparece e some sozinho, e não aparece
se houver um aviso seu no ar.
