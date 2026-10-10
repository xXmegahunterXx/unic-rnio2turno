"""
Perfil do eleitorado ("quem vota aqui") — public/data/perfil/{uf}.json (PerfilUfDataset, src/shared/dataset.ts).

    python3 -I scripts/data/py/perfil_build.py            # baixa (com cache) + gera os 28 arquivos (~1 min)
    python3 -I scripts/data/py/perfil_build.py --so=AC,ZZ # só algumas UFs (teste)

Fonte: cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2026.zip (~408 MB; um CSV por UF
+ ZZ + BRASIL, latin-1/';'), lido em STREAMING de dentro do ZIP (nunca extrai). Cache em data-raw/tse-abertos/
(ver secao_comum.baixar). Há um único recorte no arquivo (DT_GERACAO 14/07/2026, cadastro fechado para 2026); o
script para com erro se aparecer mais de uma data de geração.

Regras de agregação (por MUNICÍPIO, código TSE, e total da UF; as zonas são somadas):
- `faixas`: 22 faixas etárias na ordem natural do TSE ("16 anos" … "95 a 99", "100+"). A faixa "Inválida" do TSE
  (data de nascimento inconsistente, poucas dezenas no país) vai para `naoInformado`.
- `idade`: [feminino[], masculino[]]; gênero fora de FEMININO/MASCULINO também vai para `naoInformado`.
  Invariante: soma(idade[0]) + soma(idade[1]) + naoInformado == eleitores.
- `escolaridade`: ordem natural (Analfabeto → Superior completo); "Não informado" entra como último rótulo só se
  existir no arquivo. Invariante: soma(escolaridade) == eleitores.
- `deficiencia` = QT_ELEITORES_DEFICIENCIA; `nomeSocial` = QT_ELEITORES_NOME_SOCIAL (soma).

Campos EXTRAS (opcionais, além do contrato; não quebram PerfilUfDataset — ver relatório/README):
- topo: `dataReferencia` (ISO da DT_GERACAO), `estadosCivis`, `racasCores`, `identidadesGenero` (rótulos);
- por agregado: `estadoCivil[]`, `racaCor[]` e `identidadeGenero[]` (com "Não informado" no fim; somam
  `eleitores`), `biometria` (QT_ELEITORES_BIOMETRIA), `quilombola` e `interpreteLibras` (quem declarou SIM).
  Raça/cor, identidade de gênero, quilombola e intérprete de Libras são autodeclarações recentes: a maior parte do
  eleitorado ainda aparece como "Não informado" — a UI deve mostrar essa parcela.

Validação (para com erro se falhar): conjunto de municípios == public/data/uf/{uf}.json; invariantes acima; total
da UF == soma dos municípios. As diferenças de eleitorado contra a fase 1 (aptos do 1º turno, feed oficial) são
relatadas por UF e município: o perfil é o cadastro de 14/07/2026, os aptos da urna saem depois (ver relatório).
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import time
import zipfile
from concurrent.futures import ProcessPoolExecutor

sys.dont_write_bytecode = True  # não deixa __pycache__ no repositório
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from secao_comum import PUBLIC_DATA, RAW, TODAS, baixar, ler_uf_dataset, log  # noqa: E402

ZIP_REL = 'perfil_eleitorado/perfil_eleitorado_2026.zip'
# Conferência cruzada (opcional, só se já estiver no cache — baixado por secao_download.py): cadastro por seção.
ZIP_LOCAIS = os.path.join(RAW, 'eleitorado_locais_votacao', 'eleitorado_local_votacao_2026.zip')
SAIDA = os.path.join(PUBLIC_DATA, 'perfil')
ELEITORADO_NACIONAL_T1 = 158_745_502  # aptos oficiais do 1º turno (ARCHITECTURE.md §4.1)

# ------------------------------------------------------------------------------------------------ dimensões
# Faixas etárias: CD_FAIXA_ETARIA do TSE → índice; rótulos curtos pt-BR na ordem natural.
FAIXAS_CD = ['1600', '1700', '1800', '1900', '2000', '2124', '2529', '3034', '3539', '4044', '4549', '5054',
             '5559', '6064', '6569', '7074', '7579', '8084', '8589', '9094', '9599', '9999']
FAIXAS_ROT = ['16 anos', '17 anos', '18 anos', '19 anos', '20 anos', '21 a 24', '25 a 29', '30 a 34', '35 a 39',
              '40 a 44', '45 a 49', '50 a 54', '55 a 59', '60 a 64', '65 a 69', '70 a 74', '75 a 79', '80 a 84',
              '85 a 89', '90 a 94', '95 a 99', '100+']
FAIXA_IX = {c: i for i, c in enumerate(FAIXAS_CD)}

GENERO_IX = {'4': 0, '2': 1}  # 4 FEMININO → 0, 2 MASCULINO → 1 (ordem do contrato: [feminino[], masculino[]])

# Escolaridade: CD_GRAU_ESCOLARIDADE 1..8 (ordem natural). Qualquer outro código (0/-1 "NÃO INFORMADO") → índice 8.
ESCOL_CD = ['1', '2', '3', '4', '5', '6', '7', '8']
ESCOL_ROT = ['Analfabeto', 'Lê e escreve', 'Fundamental incompleto', 'Fundamental completo', 'Médio incompleto',
             'Médio completo', 'Superior incompleto', 'Superior completo']
ESCOL_IX = {c: i for i, c in enumerate(ESCOL_CD)}

# Estado civil: 1 Solteiro, 3 Casado, 5 Viúvo, 7 Separado judicialmente, 9 Divorciado (+ Não informado no fim).
CIVIL_CD = ['1', '3', '9', '7', '5']
CIVIL_ROT = ['Solteiro', 'Casado', 'Divorciado', 'Separado judicialmente', 'Viúvo', 'Não informado']
CIVIL_IX = {c: i for i, c in enumerate(CIVIL_CD)}

# Raça/cor (autodeclaração; IBGE): 1 Branca, 2 Preta, 3 Parda, 4 Indígena, 5 Amarela (+ Não informado).
RACA_CD = ['1', '2', '3', '4', '5']
RACA_ROT = ['Branca', 'Preta', 'Parda', 'Indígena', 'Amarela', 'Não informado']
RACA_IX = {c: i for i, c in enumerate(RACA_CD)}

# Identidade de gênero (autodeclaração): 1 Cisgênero, 2 Transgênero, 3 Prefere não informar (+ Não informado).
IDGEN_CD = ['1', '2', '3']
IDGEN_ROT = ['Cisgênero', 'Transgênero', 'Prefere não informar', 'Não informado']
IDGEN_IX = {c: i for i, c in enumerate(IDGEN_CD)}

# Rótulos do TSE esperados para cada código (DS_*): o script para se aparecer um par código/rótulo fora daqui —
# assim um código novo ou remapeado no arquivo nunca cai silenciosamente na categoria errada.
NAO_INF = 'NÃO INFORMADO'
DS_ESPERADO: dict[str, dict[str, str]] = {
    'FAIXA': {**{c: (f'{c[:2]} anos' if c[2:] == '00' else f'{c[:2]} a {c[2:]} anos') for c in FAIXAS_CD[:-1]},
              '9999': '100 anos ou mais', '-3': 'Inválida'},
    'GENERO': {'2': 'MASCULINO', '4': 'FEMININO', '0': NAO_INF, '-1': NAO_INF},
    'ESCOL': {'1': 'ANALFABETO', '2': 'LÊ E ESCREVE', '3': 'ENSINO FUNDAMENTAL INCOMPLETO',
              '4': 'ENSINO FUNDAMENTAL COMPLETO', '5': 'ENSINO MÉDIO INCOMPLETO', '6': 'ENSINO MÉDIO COMPLETO',
              '7': 'SUPERIOR INCOMPLETO', '8': 'SUPERIOR COMPLETO', '0': NAO_INF, '-1': NAO_INF},
    'CIVIL': {'1': 'SOLTEIRO', '3': 'CASADO', '5': 'VIÚVO', '7': 'SEPARADO JUDICIALMENTE', '9': 'DIVORCIADO',
              '0': NAO_INF, '-1': NAO_INF},
    'RACA': {'1': 'Branca', '2': 'Preta', '3': 'Parda', '4': 'Indígena', '5': 'Amarela', '-1': NAO_INF, '0': NAO_INF},
    'IDGEN': {'1': 'Cisgênero', '2': 'Transgênero', '3': 'Prefere não informar', '-1': NAO_INF, '0': NAO_INF},
    'QUILOMBOLA': {'1': 'SIM', '2': 'NÃO', '-1': NAO_INF, '0': NAO_INF},
    'LIBRAS': {'1': 'SIM', '2': 'NÃO', '-1': NAO_INF, '0': NAO_INF},
}

NF = len(FAIXAS_CD)
# Layout do vetor acumulador por município (ints): offsets
O_ELEIT = 0
O_FEM = 1
O_MAS = O_FEM + NF
O_NI = O_MAS + NF
O_ESC = O_NI + 1                 # 9 posições (8 + não informado)
O_CIV = O_ESC + 9                # 6
O_RACA = O_CIV + 6               # 6
O_IDG = O_RACA + 6               # 4
O_DEF = O_IDG + 4
O_NS = O_DEF + 1
O_BIO = O_NS + 1
O_QUI = O_BIO + 1
O_LIB = O_QUI + 1
TAM = O_LIB + 1


def agregar_uf(args: tuple[str, str]) -> dict:
    """Lê o CSV da UF em streaming e devolve {cod_mun: vetor}, nomes, datas de geração e contagens de controle."""
    zip_path, uf = args
    membro = f'perfil_eleitorado_2026_{uf}.csv'
    t0 = time.time()
    acc: dict[str, list[int]] = {}
    nomes: dict[str, str] = {}
    datas: dict[str, int] = {}
    pares: set[tuple[str, str, str]] = set()  # (dimensão, código, rótulo) vistos
    linhas = 0
    with zipfile.ZipFile(zip_path) as z, z.open(membro) as raw:
        rd = csv.reader(io.TextIOWrapper(raw, encoding='latin-1', newline=''), delimiter=';', quotechar='"')
        cab = next(rd)
        cab[0] = cab[0].lstrip('﻿')
        ix = {c: i for i, c in enumerate(cab)}
        i_dt, i_aa, i_uf = ix['DT_GERACAO'], ix['AA_ELEICAO'], ix['SG_UF']
        i_mun, i_nm = ix['CD_MUNICIPIO'], ix['NM_MUNICIPIO']
        i_gen, i_civ, i_fx = ix['CD_GENERO'], ix['CD_ESTADO_CIVIL'], ix['CD_FAIXA_ETARIA']
        dims = [(d, ix['CD_' + c], ix['DS_' + c]) for d, c in (
            ('FAIXA', 'FAIXA_ETARIA'), ('GENERO', 'GENERO'), ('ESCOL', 'GRAU_ESCOLARIDADE'), ('CIVIL', 'ESTADO_CIVIL'),
            ('RACA', 'RACA_COR'), ('IDGEN', 'IDENTIDADE_GENERO'), ('QUILOMBOLA', 'QUILOMBOLA'),
            ('LIBRAS', 'INTERPRETE_LIBRAS'))]
        i_esc, i_raca, i_idg = ix['CD_GRAU_ESCOLARIDADE'], ix['CD_RACA_COR'], ix['CD_IDENTIDADE_GENERO']
        i_qui, i_lib = ix['CD_QUILOMBOLA'], ix['CD_INTERPRETE_LIBRAS']
        i_q, i_bio = ix['QT_ELEITORES'], ix['QT_ELEITORES_BIOMETRIA']
        i_def, i_ns = ix['QT_ELEITORES_DEFICIENCIA'], ix['QT_ELEITORES_NOME_SOCIAL']
        ncol = len(cab)
        for r in rd:
            if len(r) != ncol:
                if not r:
                    continue
                raise ValueError(f'{membro}: linha com {len(r)} colunas (esperado {ncol}): {r[:8]}')
            linhas += 1
            if r[i_uf] != uf or r[i_aa] != '2026':
                raise ValueError(f'{membro}: linha fora do recorte (UF {r[i_uf]}, ano {r[i_aa]})')
            q = int(r[i_q])
            dt = r[i_dt]
            datas[dt] = datas.get(dt, 0) + q
            mun = r[i_mun].zfill(5)
            v = acc.get(mun)
            if v is None:
                v = acc[mun] = [0] * TAM
                nomes[mun] = r[i_nm]
            v[O_ELEIT] += q
            g = GENERO_IX.get(r[i_gen])
            f = FAIXA_IX.get(r[i_fx])
            if g is None or f is None:
                v[O_NI] += q
            else:
                v[(O_FEM if g == 0 else O_MAS) + f] += q
            v[O_ESC + ESCOL_IX.get(r[i_esc], 8)] += q
            v[O_CIV + CIVIL_IX.get(r[i_civ], 5)] += q
            v[O_RACA + RACA_IX.get(r[i_raca], 5)] += q
            v[O_IDG + IDGEN_IX.get(r[i_idg], 3)] += q
            v[O_DEF] += int(r[i_def])
            v[O_NS] += int(r[i_ns])
            v[O_BIO] += int(r[i_bio])
            if r[i_qui] == '1':
                v[O_QUI] += q
            if r[i_lib] == '1':
                v[O_LIB] += q
            for d, ic, ids in dims:
                pares.add((d, r[ic], r[ids]))
    log(f'  {uf}: {linhas:,} linhas, {len(acc)} municípios em {time.time() - t0:.1f} s')
    return {'uf': uf, 'acc': acc, 'nomes': nomes, 'datas': datas, 'pares': pares, 'linhas': linhas}


def cadastro_locais_uf(args: tuple[str, str]) -> tuple[str, dict[str, list[int]]]:
    """Do eleitorado_local_votacao (1º turno): por município, [Σ QT_ELEITOR_SECAO, Σ QT_ELEITOR_ELEICAO_FEDERAL].

    QT_ELEITOR_SECAO = eleitores do cadastro na seção (domicílio eleitoral); QT_ELEITOR_ELEICAO_FEDERAL = aptos para
    Presidente na seção, já com o voto em trânsito (é o eleitorado da fase 1 / feed oficial).
    """
    zip_path, uf = args
    out: dict[str, list[int]] = {}
    with zipfile.ZipFile(zip_path) as z, z.open(f'eleitorado_local_votacao_2026_{uf}.csv') as raw:
        rd = csv.reader(io.TextIOWrapper(raw, encoding='latin-1', newline=''), delimiter=';', quotechar='"')
        cab = next(rd)
        cab[0] = cab[0].lstrip('\ufeff')
        ix = {c: i for i, c in enumerate(cab)}
        i_t, i_m, i_c, i_f = ix['NR_TURNO'], ix['CD_MUNICIPIO'], ix['QT_ELEITOR_SECAO'], ix['QT_ELEITOR_ELEICAO_FEDERAL']
        for r in rd:
            if not r or r[i_t] != '1':
                continue
            v = out.setdefault(r[i_m].zfill(5), [0, 0])
            v[0] += int(r[i_c])
            v[1] += int(r[i_f])
    return uf, out


def para_agregado(v: list[int], com_escol_ni: bool) -> dict:
    out = {
        'eleitores': v[O_ELEIT],
        'idade': [v[O_FEM:O_FEM + NF], v[O_MAS:O_MAS + NF]],
        'naoInformado': v[O_NI],
        'escolaridade': v[O_ESC:O_ESC + (9 if com_escol_ni else 8)],
        'deficiencia': v[O_DEF],
        'nomeSocial': v[O_NS],
        # extras (fora do contrato, opcionais)
        'estadoCivil': v[O_CIV:O_CIV + 6],
        'racaCor': v[O_RACA:O_RACA + 6],
        'identidadeGenero': v[O_IDG:O_IDG + 4],
        'biometria': v[O_BIO],
        'quilombola': v[O_QUI],
        'interpreteLibras': v[O_LIB],
    }
    return out


def conferir_agregado(nome: str, a: dict) -> None:
    e = a['eleitores']
    soma_idade = sum(a['idade'][0]) + sum(a['idade'][1]) + a['naoInformado']
    erros = []
    if soma_idade != e:
        erros.append(f'idade+naoInformado {soma_idade} ≠ {e}')
    if sum(a['escolaridade']) != e:
        erros.append(f'escolaridade {sum(a["escolaridade"])} ≠ {e}')
    for k in ('estadoCivil', 'racaCor', 'identidadeGenero'):
        if sum(a[k]) != e:
            erros.append(f'{k} {sum(a[k])} ≠ {e}')
    for k in ('deficiencia', 'nomeSocial', 'biometria', 'quilombola', 'interpreteLibras'):
        if not 0 <= a[k] <= e:
            erros.append(f'{k} {a[k]} fora de [0, {e}]')
    if erros:
        raise SystemExit(f'{nome}: ' + '; '.join(erros))


def iso_data(dt: str) -> str:
    d, m, y = dt.split('/')
    return f'{y}-{m}-{d}'


def main() -> None:
    so = None
    for a in sys.argv[1:]:
        if a.startswith('--so='):
            so = [x.strip().upper() for x in a[5:].split(',') if x.strip()]
    ufs = so or TODAS
    zip_path = baixar(ZIP_REL)
    with zipfile.ZipFile(zip_path) as z:
        membros = set(z.namelist())
    faltando = [u for u in ufs if f'perfil_eleitorado_2026_{u}.csv' not in membros]
    if faltando:
        raise SystemExit(f'CSV ausente no ZIP para: {faltando}')

    t0 = time.time()
    log(f'agregando {len(ufs)} UFs…')
    # SP, MG, BA, RS, PR, RJ primeiro (maiores) para equilibrar os processos
    tamanhos = {}
    with zipfile.ZipFile(zip_path) as z:
        for u in ufs:
            tamanhos[u] = z.getinfo(f'perfil_eleitorado_2026_{u}.csv').file_size
    ordem = sorted(ufs, key=lambda u: -tamanhos[u])
    usar_locais = os.path.exists(ZIP_LOCAIS) and '--sem-locais' not in sys.argv
    with ProcessPoolExecutor(max_workers=min(6, os.cpu_count() or 2)) as ex:
        fut_locais = ex.map(cadastro_locais_uf, [(ZIP_LOCAIS, u) for u in ordem]) if usar_locais else None
        resultados = {r['uf']: r for r in ex.map(agregar_uf, [(zip_path, u) for u in ordem])}
        locais = dict(fut_locais) if fut_locais is not None else {}
    if not usar_locais:
        log('  (sem conferência cruzada com eleitorado_local_votacao: ZIP fora do cache ou --sem-locais)')

    # Escolaridade "não informado" existe em algum lugar? (rótulo extra só se existir; mesmo vetor para todas as UFs)
    com_escol_ni = any(v[O_ESC + 8] for r in resultados.values() for v in r['acc'].values())
    escol_rot = ESCOL_ROT + (['Não informado'] if com_escol_ni else [])

    datas_todas: dict[str, int] = {}
    for r in resultados.values():
        for d, q in r['datas'].items():
            datas_todas[d] = datas_todas.get(d, 0) + q
        fora = sorted(p for p in r['pares'] if DS_ESPERADO[p[0]].get(p[1]) != p[2])
        if fora:
            raise SystemExit(f'{r["uf"]}: códigos/rótulos do TSE não previstos (dimensão, código, rótulo): {fora}')
    if len(datas_todas) != 1:
        raise SystemExit(f'mais de um recorte (DT_GERACAO) no arquivo: {datas_todas} — escolha o mais próximo de out/2026')
    data_ref = iso_data(next(iter(datas_todas)))

    os.makedirs(SAIDA, exist_ok=True)
    tot_perfil = tot_fase1 = 0
    bytes_total = 0
    relatorio = []
    conf_locais = {'mun': 0, 'fed_ok': 0, 'cad': 0, 'fed': 0}
    for uf in TODAS:
        if uf not in resultados:
            continue
        r = resultados[uf]
        fase1 = ler_uf_dataset(uf)
        cods_fase1 = [m['cod'] for m in fase1['municipios']]
        elei_fase1 = {m['cod']: m['eleitorado'] for m in fase1['municipios']}
        nome_fase1 = {m['cod']: m['nome'] for m in fase1['municipios']}
        so_perfil = sorted(set(r['acc']) - set(cods_fase1))
        so_fase1 = sorted(set(cods_fase1) - set(r['acc']))
        if so_perfil or so_fase1:
            raise SystemExit(f'{uf}: municípios divergentes — só no perfil {[(c, r["nomes"][c]) for c in so_perfil]}, '
                             f'só na fase 1 {[(c, nome_fase1[c]) for c in so_fase1]}')
        tot = [0] * TAM
        municipios = {}
        difs = []
        if usar_locais:
            loc = locais[uf]
            if set(loc) != set(cods_fase1):
                raise SystemExit(f'{uf}: municípios do eleitorado_local_votacao ≠ fase 1')
            cad_dif = [(c, r['acc'][c][O_ELEIT], loc[c][0]) for c in cods_fase1 if r['acc'][c][O_ELEIT] != loc[c][0]]
            fed_dif = [(c, elei_fase1[c], loc[c][1]) for c in cods_fase1 if elei_fase1[c] != loc[c][1]]
            if cad_dif:
                raise SystemExit(f'{uf}: perfil ≠ Σ QT_ELEITOR_SECAO em {len(cad_dif)} municípios: {cad_dif[:5]}')
            if fed_dif:
                log(f'  aviso {uf}: fase 1 ≠ Σ QT_ELEITOR_ELEICAO_FEDERAL em {len(fed_dif)} municípios: {fed_dif[:5]}')
            conf_locais['mun'] += len(cods_fase1)
            conf_locais['fed_ok'] += len(cods_fase1) - len(fed_dif)
            conf_locais['cad'] += sum(v[0] for v in loc.values())
            conf_locais['fed'] += sum(v[1] for v in loc.values())
        for cod in cods_fase1:  # ordem canônica da fase 1
            v = r['acc'][cod]
            for i in range(TAM):
                tot[i] += v[i]
            ag = para_agregado(v, com_escol_ni)
            conferir_agregado(f'{uf}/{cod}', ag)
            municipios[cod] = ag
            d = v[O_ELEIT] - elei_fase1[cod]
            if d:
                difs.append((d, cod))
        total = para_agregado(tot, com_escol_ni)
        conferir_agregado(f'{uf}/total', total)
        if total['eleitores'] != sum(m['eleitores'] for m in municipios.values()):
            raise SystemExit(f'{uf}: total ≠ soma dos municípios')
        doc = {
            'uf': uf,
            'faixas': FAIXAS_ROT,
            'escolaridade': escol_rot,
            'total': total,
            'municipios': municipios,
            # extras
            'dataReferencia': data_ref,
            'estadosCivis': CIVIL_ROT,
            'racasCores': RACA_ROT,
            'identidadesGenero': IDGEN_ROT,
        }
        dest = os.path.join(SAIDA, f'{uf.lower()}.json')
        with open(dest, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
        tam = os.path.getsize(dest)
        bytes_total += tam
        e1 = sum(elei_fase1.values())
        tot_perfil += total['eleitores']
        tot_fase1 += e1
        difs.sort()
        relatorio.append((uf, total['eleitores'], e1, len(difs), len(cods_fase1), difs[:2], difs[-2:], tam,
                          {c: nome_fase1[c] for _, c in difs[:2] + difs[-2:]}))

    log('')
    log(f'{"UF":<3} {"perfil":>12} {"fase 1":>12} {"dif":>8} {"mun≠":>9}  {"KB":>6}  maiores diferenças (perfil − fase 1)')
    for uf, ep, e1, nd, nm, menores, maiores, tam, nomes in relatorio:
        ext = ', '.join(f'{nomes[c]} {d:+,}' for d, c in (menores + [x for x in maiores if x not in menores]))
        log(f'{uf:<3} {ep:>12,} {e1:>12,} {ep - e1:>+8,} {nd:>4}/{nm:<4}  {tam / 1024:>6.0f}  {ext}')
    log(f'TOT {tot_perfil:>12,} {tot_fase1:>12,} {tot_perfil - tot_fase1:>+8,}            {bytes_total / 1024:>6.0f}')
    if so is None:
        log(f'eleitorado oficial do 1º turno: {ELEITORADO_NACIONAL_T1:,} · perfil (cadastro {data_ref}): {tot_perfil:,} '
            f'({tot_perfil - ELEITORADO_NACIONAL_T1:+,}; {(tot_perfil - ELEITORADO_NACIONAL_T1) / ELEITORADO_NACIONAL_T1 * 100:+.5f}%)')
    if usar_locais:
        log(f'conferência com eleitorado_local_votacao (1º turno): perfil == Σ QT_ELEITOR_SECAO (cadastro) em '
            f'{conf_locais["mun"]}/{conf_locais["mun"]} municípios; fase 1 == Σ QT_ELEITOR_ELEICAO_FEDERAL (aptos com '
            f'voto em trânsito) em {conf_locais["fed_ok"]}/{conf_locais["mun"]}; Σ cadastro {conf_locais["cad"]:,} · '
            f'Σ aptos federais {conf_locais["fed"]:,}')
        log('→ a diferença perfil − fase 1 por município é o voto em trânsito (o perfil conta o eleitor no domicílio; '
            'os aptos do 1º turno, onde ele vota).')
    log(f'saída: {SAIDA} — {len(relatorio)} arquivos, {bytes_total / 1e6:.2f} MB, em {time.time() - t0:.0f} s')
    if so is None and bytes_total > 6e6:
        raise SystemExit('orçamento de 6 MB estourado')


if __name__ == '__main__':
    main()
