# Adaptador do feed oficial do TSE (fonte `tse`)

Converte o feed público de resultados do TSE (`https://resultados.tse.jus.br/oficial`) nos **mesmos
snapshots do motor** (`NationalSnapshot`, `UfSnapshot`, `MunicipioSnapshot`, `ZonaSnapshot`, `SecaoDetalhe`
em `src/shared/types.ts`) para a noite de 25/10/2026.

| Arquivo | Papel |
|---|---|
| `feed.ts` | Tipos brutos do feed + `tsePaths` (montagem das URLs) |
| `client.ts` | `TseClient`: `fetch` injetável, timeout, retry com backoff e jitter, `Retry-After`, ETag/If-Modified-Since (304), concorrência ≤ 8 com 3 prioridades, estatísticas |
| `map.ts` | Funções **puras** feed → contratos (Summary, MunicipioResumo, mosaico, SecaoDetalhe…) |
| `eventos.ts` | Série (1 ponto por mudança de seções) e eventos por diferença entre polls; serializável |
| `bu.ts` | Decodificador BER (ASN.1) do boletim de urna `bu.dat` |
| `source.ts` | `TseSource`: polling, caches, fila de municípios, snapshots, `health()`, `testar()` |
| `__fixtures__/` | Arquivos **reais** do 1º turno (reduzidos), `fake-fetch.ts` e `races.json` para os testes |

Tudo foi verificado com `curl` e com os testes contra o 1º turno de 2026 (pleito 3220, eleições
6257/6259), em 09/10/2026.

---

## 1. O que existe no feed (URLs de exemplo)

Base `https://resultados.tse.jus.br/oficial`. Códigos com zeros à esquerda: eleição 6, cargo 4, município 5,
zona 4, seção 4 dígitos. O próprio `comum/config/ele-c.json` lista os tipos de arquivo existentes
(`arq`: `ft` fotos, `cm`, `e`, `cs`, `ab`, `u`, `aux`); não há outros.

| Tipo | Padrão | Exemplo (1º turno) |
|---|---|---|
| Config geral | `comum/config/ele-c.json` | [ele-c.json](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json) |
| Municípios (`cm`) | `{ciclo}/{ele}/config/mun-e{ele}-cm.json` | `ele2026/6257/config/mun-e006257-cm.json` (534 KB) |
| Resultado Brasil | `{ciclo}/{ele}/dados/br/br-c{cargo}-e{ele}-u.json` | `ele2026/6257/dados/br/br-c0001-e006257-u.json` |
| Resultado UF | `…/dados/{uf}/{uf}-c{cargo}-e{ele}-u.json` | `ele2026/6257/dados/sp/sp-c0001-e006257-u.json` |
| Resultado município | `…/dados/{uf}/{uf}{mun}-c{cargo}-e{ele}-u.json` | `ele2026/6257/dados/sp/sp71072-c0001-e006257-u.json` |
| **Resultado zona** | `…/dados/{uf}/{uf}{mun}-z{zona}-c{cargo}-e{ele}-u.json` | `ele2026/6257/dados/sp/sp71072-z0001-c0001-e006257-u.json` |
| Acompanhamento (`ab`) | `…/dados/{br\|uf}/{br\|uf}-e{ele}-ab.json` | `ele2026/6257/dados/ac/ac-e006257-ab.json` |
| Seções (`cs`) | `{ciclo}/arquivo-urna/{pleito}/config/{uf}/{uf}-p{pleito}-cs.json` | `ele2026/arquivo-urna/3220/config/ac/ac-p003220-cs.json` |
| Arquivos da seção (`aux`) | `…/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/p{pleito}-{uf}-m{mun}-z{zona}-s{secao}-aux.json` | `…/3220/dados/ac/01066/0004/0077/p003220-ac-m01066-z0004-s0077-aux.json` |
| Boletim de urna | `…/{secao}/{hash}/{nome do aux}` | `…/0077/4a6b…3d/o03220ac0106600040077-bu.dat` |

Arquivos do resultado (`-u.json`): `carg[].agr[].par[].cand[]` com `n` (número), `nmu`, `vap` (votos),
`pvap` ("47,03"), `dvt` ("Válido" / "Anulado sub judice"), `e` + `st` (situação); `s` (seções: `ts`, `st`,
`si`, `sni`…), `e` (eleitorado: `te`, `est`, `c`, `a`…), `v` (votos: `tv`, `vvc`, `vv`, `vnom`, `vb`, `tvn`,
`van`, `vansj`…), `dg/hg` (geração), `dt/ht` (última totalização), `tf` ('s' = totalização finalizada),
`and` ('n' não iniciada · 'p' parcial · 'f' finalizada — enum do app oficial), `md` (matematicamente definida).

### 1.1 Há arquivo por UF com os votos de TODOS os municípios? **Não.**

Testados (todos 404, `NoSuchKey`): `sp-c0001-e006257-{v,r,m,f,t,mu,e,a,x,s,z,ab}.json`,
`sp-e006257-{r,v,u}.json`, `sp-mu-…`, `sp00000-…`, `sp-z0001-…`, `…-u.json.gz`, `…-mun.json`, `…-um.json`,
`…-uz.json` e os antigos `dados-simplificados/{br,sp}/…-r.json`. O app oficial também só monta
`{uf}{mun}[-z{zona}]-c…-u.json` (código conferido). O `-ab.json` da UF traz, por município, só seções e
eleitorado (sem votos). O `-e.json` (eleitos) que o app conhece dá 404 para Presidente e Governador 2026.

**Estratégia adotada:** o `-ab.json` da UF (1 arquivo, condicional) diz quantas seções cada município já
totalizou; baixamos o `-u.json` **só dos municípios cujo `st` mudou**, por uma fila com prioridade
(UF consultada nos últimos 3 min > UF em apuração > resto), no máximo 1 vez por município a cada 60 s
(`municipioTtlMs`), com até 3 downloads simultâneos (`workersMunicipios`) dentro do limite global de 6–8.
Enquanto o arquivo de um município não chega, o snapshot usa o `ab` (seções, eleitorado, comparecimento;
votos zerados ⇒ `lider: null`), nunca inventa votos. Município com `st = 0` não é baixado (o `ab` já é exato).

### 1.2 Há resultado por ZONA? **Sim** (por município + zona)

`{uf}{mun}-z{zona}-c{cargo}-e{ele}-u.json` (mesmo formato, `tpabr: "zona"`). `{uf}-z{zona}-…` não existe.
Conferido: soma dos 34 BUs de Porto Walter/AC zona 4 = arquivo da zona (todos os candidatos, brancos 49,
nulos 175, comparecimento 6.520, aptos 8.032); teste ao vivo: soma das 57 zonas de São Paulo = município.
Município com 1 zona: o arquivo da zona é idêntico ao do município (não baixamos de novo).
No 2º turno os arquivos de zona ainda não existem (404) — serão publicados na apuração.

### 1.3 Seções: `cs` e o significado de `da`/`ha`

O `cs` lista município → zona → seções (`ns`). `nsp` = seção agregada a outra (não conta; os votos estão
na principal, que traz `nsa`). `da`/`ha` = data/hora em que os **arquivos da urna foram publicados**:

- 2º turno hoje (SP, 85.101 seções): nenhuma seção tem `da` (antes da eleição);
- 1º turno final (AC): 2.270 de 2.270 seções ativas têm `da` (= `s.ts`); o aux.json de cada uma diz
  `"st": "Totalizada"`;
- `ha` é a hora da **publicação em lote** (AC zona 4: 21:08:17 para seções recebidas às 18:34), não a da
  totalização. Por isso `SecaoResumo.totalizadaEm` fica `null` na lista da zona.

Logo: `da` presente ⇒ seção totalizada e BU publicado. Durante a noite o `cs` pode atrasar em relação aos
totais (a confirmar ao vivo em 25/10 com `TSE_LIVE=1`).

### 1.4 Boletim de urna por seção

Não há BU em texto em 2026: `-imgbu.dat`/`-imgbu` dão 404. O `aux.json` lista `bu.dat` (ASN.1 BER),
`rdv.dat`, `log.jez` (7z) e `vota.vsc`. `bu.ts` decodifica o `bu.dat` (BER mínimo, sem dependências):
identificação, abertura/encerramento (hora local da urna), carga, aptos, comparecimento e votos por
eleição/cargo/candidato. Testado com 3 seções reais (AC 01066/4/77, SP 71072/1/1, Budapeste 29459/1/1695)
e com a soma de uma zona inteira. Particularidades:

- voto nominal num número que não é candidato da disputa (Budapeste: 1 voto no "28") = **nulo técnico**
  (o TSE soma em `tvn`); o mapeamento usa a lista de números do arquivo de resultado;
- Senado 2026 tem 2 votos por eleitor (irrelevante aqui, mas o BU traz);
- `codigoIdentificacao` = código da carga da urna (24 dígitos, ex.: `093853352215815221270154`);
- `totalizadaEm` = `dr/hr` do hash vigente no aux (recebimento; assumido horário de Brasília).

### 1.5 Mosaico na fonte TSE: status-only

Vencedor por seção exigiria 1 BU por seção (~500 mil downloads): inviável. O mosaico usa o código
**`'t'` = totalizada, vencedor não informado** (documentado em `ZonaMosaico`, `src/shared/types.ts`) e
`'0'` = não totalizada. Sem `cs` publicado para a UF (ex.: AC no 2º turno, hoje), o mosaico vem vazio.

---

## 2. Convenções numéricas (como mapeamos)

- Números chegam como string; `""` = 0. Percentuais com vírgula (só para conferência).
- **Ordem dos votos** = `Race.candidatos` (por número). Corridas `-t1`: 2 finalistas + "Outros" (`numero 0`).
- **"Outros" = soma do `vap` de todos os demais candidatos = `vvc − finalistas`**, inclusive "anulado sub
  judice". É a base do `pvap` oficial: RJ governador 1T → Douglas Ruas 4.271.199 / 8.669.038 = **49,27%**
  (pvap do TSE), e não 50,88% (que seria sobre `vv`). Com isso `calc.ts` reproduz os % do TSE.
- brancos = `v.vb`; nulos = `v.tvn` (nulos + nulos técnicos) + eventual sobra de `vvc` (só quando a corrida
  não tem "Outros"). Sempre Σvotos + brancos + nulos = `v.tv` = comparecimento.
- comparecimento `e.c`; eleitorado `e.te`; eleitorado das seções totalizadas `e.est`; abstenção = **`e.a`
  oficial** (sobre seções instaladas). Difere de `est − c` só pelo eleitorado de seções não instaladas
  (Brasil 1T: 423 eleitores em 41 seções).
- status: `encerrada` se `tf='s'`, `and='f'` ou `st ≥ ts`; `apurando` se `st > 0` ou `and='p'`; senão `aguardando`.
- `lider`: maior votação entre candidatos reais ("Outros" nunca lidera); empate ⇒ null.
- `eleito`: (a) candidato com `e='s'` e `st` "Eleito/Eleita…" — **só no arquivo da abrangência da disputa**
  (Brasil para Presidente, a UF para Governador; o `st` do candidato é global e diria "Eleito" até numa UF
  onde ele perdeu); (b) `md='s'` no 2º turno; (c) regra do contrato: diferença 1º−2º > `te − est`, ou
  apuração encerrada. No 1º turno a situação "2º turno" não é "eleito".
- Corrida de 2º turno apontada para códigos de 1º turno (ensaio: admin põe `eleicaoPres: 6257`,
  `pleito: 3220`): o arquivo tem `t: "1"` e é mapeado na corrida `-t1`; o snapshot sai com `race: 'pres-t1'`.

### 2.1 Fuso horário (provado com os dados)

`dt/ht` estão no **horário local da abrangência**. Prova: no `-ab.json` do AC o 1º município totalizou
"16:17:01" — antes das 17h de Brasília, impossível se fosse Brasília; MT/MS/RO começam ~16:3x (UTC-4) e SP
17:20 (UTC-3). `map.FUSO_UF`: AC −5; AM, MT, MS, RO, RR −4; demais −3. Brasil = Brasília. Simplificações:
oeste do AM (UTC-5) e Noronha (UTC-2) usam o fuso da UF; exterior usa Brasília. Como não dá para provar o
fuso dos arquivos de UF durante a noite, todo `ultimaAtualizacao` é limitado ao relógio (nunca no futuro).
Horas gravadas no BU (abertura/encerramento) são locais da urna.

---

## 3. HTTP (comportamento do CDN do TSE)

- `ETag` + `Last-Modified`; `If-None-Match` e `If-Modified-Since` respondem **304** (verificado).
- gzip: `br-c0001-…-u.json` 9,3 KB → 2,4 KB.
- `cache-control: max-age≈58` (Akamai): no ar, um arquivo pode chegar até ~1 min atrasado ao nosso servidor.
- `x-ratelimit-limit: 2000` por segundo. Mesmo assim limitamos a ≤ 8 conexões simultâneas.
- Arquivo ainda não publicado: **404 com XML `NoSuchKey`** (S3/Ceph) → tratado como "ausente", não erro.

## 4. Estado do 2º turno no feed (09/10/2026)

- `6258` (Presidente): `br-c0001-e006258-u.json` publicado, zerado (`and: "n"`, `tf: "n"`), com
  `s.ts = 48.964` e `e.te = 15.922.180` — a configuração ainda está sendo carregada (SP 33.403 seções). O
  total cresce até a eleição; o adaptador sempre usa o que o feed traz.
- `6260` (Governador): em `ele-c.json` e no `cm` só **DF e ES** até agora; `rj-c0003-e006260-u.json` dá 404
  (as outras 5 UFs aparecem como `ausentes` no health até serem publicadas).
- `arquivo-urna/3221`: `cs` de SP publicado (sem `da`); de AC, 404.

---

## 5. `TseSource` (uso no servidor)

```ts
import { TseSource } from '../tse';

const tse = new TseSource({
  config: state.tse,                 // TseConfig do AdminState (baseUrl, ciclo, eleicaoPres, eleicaoGov, pleito, intervaloSeg)
  races: meta.races,                 // DatasetMeta.races
  log: (m) => metrics.log(m),
  nomeMunicipio: (uf, cod) => nomeDoDataset(uf, cod), // opcional: mesmos nomes do resto do app
  historico: lerJson('.server-state/tse-historico.json'), // opcional
  concorrencia: 8, workersMunicipios: 5,                  // recomendado na noite
});
tse.start();                         // ao mudar a fonte para 'tse'; tse.stop() ao sair
// comando admin { tipo: 'tse' } → tse.setConfig(parcial)
// GET /api/admin/tse/test → tse.testar()
await tse.nacional('pres');          // NationalSnapshot (resumo, ufs, regioes, serie, eventos, restante)
await tse.uf('pres', 'SP');
await tse.municipio('pres', 'SP', '71072');
await tse.zona('pres', 'SP', '71072', 1);
await tse.secao('pres', 'SP', '71072', 1, 1);   // null ⇒ 404
tse.health();                         // ok, falhas, ausentes, fila, latência…
salvarJson('.server-state/tse-historico.json', tse.exportarHistorico()); // periodicamente
```

- Métodos são `async`, **nunca lançam por falha do TSE** (devolvem o último dado bom; sem dado algum,
  um resumo `aguardando`) e lançam `NotFoundError` (de `src/engine/api.ts`) só para corrida, UF,
  município, zona ou seção inexistentes. `secao()` devolve `null` para seção agregada ou BU indisponível
  quando nem o `cs` confirma a seção; seção existente sem BU ⇒ `totalizada: false`.
- Polling (padrão 15 s, mínimo 5 s): Brasil + 28 UFs de Presidente + 1 arquivo por Governador
  (36 requisições condicionais; 304 quando nada mudou). Corridas `-t1` são lidas sob demanda (TTL 10 min).
- `simNow` = `geradoEm` = relógio de parede (o "relógio oficial" é o real). Série/eventos usam
  `ultimaAtualizacao` do arquivo (Brasil: Brasília exato).
- Eventos (textos neutros): início; marcos 1/5/10/25/50/75/90/95/99/100% (só o maior de cada salto);
  "Com 1,2% das seções totalizadas, X aparece à frente"; "Com 63,2% das seções totalizadas, X passa à
  frente" (`virada` acima de 5%); por UF só viradas (≤ 1 a cada 10 min por UF) e "UF: totalização
  concluída"; "Eleição matematicamente definida: X". Feed da UF (`UfSnapshot.eventos`) tem também os
  marcos de 25/50/75/100% da UF. A primeira observação não gera eventos (não sabemos quando aconteceram);
  `exportarHistorico()`/`historico` preservam série e eventos entre reinícios.
- Caches: municípios/zonas 60 s, `cs` 120 s, `cm` 1 h, 1º turno local 6 h, BU 15 min (LRU 2.000).
- `MunicipioSnapshot.primeiroTurno`: arquivo do município no 1º turno (6257/6259), na ordem da corrida `-t1`.

### Medidas (feed real, 09/10/2026, deste contêiner)

| Operação | Tempo |
|---|---|
| Ciclo de polling 2T (31 arquivos) | 1,45 s; ciclo seguinte todo em 304: 0,45 s |
| `nacional('pres-t1')` (29 arquivos) | 0,5 s |
| `uf('pres-t1','SP')` 1ª chamada (cm + ab) | 0,3 s (645 municípios, votos chegando pela fila) |
| Fila dos 645 municípios de SP (3 workers) | 39,5 s (~16 arquivos/s); soma dos municípios = UF |
| `municipio('pres-t1','SP','71072')` (57 zonas + cs de 6,3 MB) | 1,5 s; heap 42 MB |
| `secao(...)` (aux + bu.dat) | 0,7 s |

Varredura completa do país (5.570 municípios) ≈ 6 min com 3 workers (estimativa: ≈ 3,5 min com 5). No ar, só os
municípios com seções novas são baixados.

---

## 6. Notas para a UI

- Mosaico: tratar `'t'` (totalizada, sem vencedor) com cor neutra de "totalizada" (não `pending`, não
  cor de candidato). Mosaico `[]` = indisponível.
- `ZonaSnapshot.secoes[]` na fonte TSE: `votos: []` (indisponível), `aptos: 0` (desconhecido),
  `totalizadaEm: null`. Seções já abertas no BU aparecem com os números reais.
- `SecaoDetalhe` com `totalizada: false` tem `aptos: 0` (desconhecido no feed).
- `MunicipioResumo` de município ainda não baixado: seções/eleitorado reais, votos zerados, `lider: null`.
- Snapshot pode vir com `race` diferente da pedida (`'pres-t1'` quando os códigos são do 1º turno): use
  `snapshot.race` para achar os candidatos.

## 7. Testes

```bash
npx vitest run src/tse                      # sem rede (fixtures reais reduzidas, ~400 KB)
TSE_LIVE=1 npx vitest run src/tse/live.test.ts   # contra o feed real (1º turno + disponibilidade do 2º)
```

Números conferidos à mão (1T): Brasil Flávio 56.104.503 (47,03%), Lula 53.879.538 (45,16%), Outros
9.316.747, brancos 2.300.798, nulos 3.674.249, comparecimento 125.275.835, 499.248 seções; RJ governador
49,27%/42,76%; Acrelândia/AC 1.508 × 5.940 + 343; BUs de 3 seções; soma de zonas e municípios (ao vivo).
