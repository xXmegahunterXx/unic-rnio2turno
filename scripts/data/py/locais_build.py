"""
Locais de votação do 1º turno de 2026 → public/data/locais/{uf}.json (LocaisUfDataset, src/shared/dataset.ts).

    python3 -I scripts/data/py/secao_download.py   # baixa/usa o cache de data-raw/tse-abertos/
    python3 -I scripts/data/py/locais_build.py     # rode ANTES de secao_build.py (que lê o índice do local daqui)

Fonte: eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip (dados abertos do TSE), um CSV por UF
(eleitorado_local_votacao_2026_{UF}.csv). Cada linha é uma seção num turno; usamos só NR_TURNO = 1 (04/10/2026).

Regras:
 - Seções "Principal" (CD_TIPO_SECAO_AGREGADA = 1) são exatamente as seções ativas da ordem canônica
   (public/data/uf/{uf}.json): o build PARA se alguma seção ativa não tiver linha principal ou vice-versa.
 - Local = (município, zona, NR_LOCAL_VOTACAO). Locais sem nenhuma seção ativa no 1º turno (todas agregadas a seções
   de outro local) ficam de fora e são contados no relatório.
 - `aptos` do local = Σ QT_ELEITOR_ELEICAO_FEDERAL das suas seções principais (inclui os eleitores das seções
   agregadas e é igual, seção a seção, ao QT_APTOS de Presidente do detalhe_votacao_secao — conferido no build da
   seção e no validate-secao.ts).
 - Campo extra (proposto para o contrato) `agregadas`: seções agregadas cujo eleitorado votou numa seção deste local,
   no formato "agregada>principal" separado por vírgulas ("45>12,46>12"). Serve para o "Consulte sua seção" achar
   quem digita o número de uma seção agregada (o eleitor vota na principal). Omitido quando vazio.
 - Nome, endereço e bairro: capitalização de exibição (locais_nomes.py, regras documentadas lá).
 - Bairro omitido quando vazio ou "-". CEP omitido (corte de tamanho: o endereço e as coordenadas bastam para o link
   de mapa; o CEP está no ZIP bruto se for preciso). Coordenadas com 5 casas; omitidas quando ausentes (vazio/-1/0),
   fora do Brasil (UFs brasileiras) ou a mais de LIMITE_KM do centro (mediana) dos locais do município — erro de
   cadastro (contados no relatório).
 - Ordem dos locais: municípios na ordem de UfDataset.municipios → zona → NR_LOCAL_VOTACAO.
 - Campo extra (proposto para o contrato) `segundoTurno`, só quando há mudança: o mesmo CSV traz o cadastro do 2º turno
   (NR_TURNO = 2, 25/10/2026) — mesmas seções e agregações, mas ~0,9% das seções votam em OUTRO local. Para o
   "Consulte sua seção" antes/durante o 2º turno:
       segundoTurno.mudancas: { "cod:zona:secao": índice }  → índice em [...locais, ...segundoTurno.locais]
       segundoTurno.locais:   LocalVotacao[] dos locais que só existem no 2º turno (secoes/aptos do 2º turno)
   Seção ausente de `mudancas` = mesmo local nos dois turnos.

Orçamento: o pedido era ≤ 14 MB somados (SP ≤ 3 MB). Com 94.299 locais, só os campos OBRIGATÓRIOS do contrato
(nr, cod, zona, nome, endereco, secoes, aptos) já passam de ~15 MB; o script avisa (não falha) e o relatório mostra o
total. Já cortamos o CEP, bairros redundantes, sufixos "- Zona Urbana", telefones, CEPs e "- Município/UF" do endereço.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

sys.dont_write_bytecode = True  # não deixa __pycache__ no repositório
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from secao_comum import (PUBLIC_DATA, RAW, ROOT, TODAS, encode_faixas, gravar_json, ler_csv, ler_uf_dataset, log,  # noqa: E402
                         ordem_canonica, to_int)
from locais_nomes import titulo  # noqa: E402

ZIP = os.path.join(RAW, 'eleitorado_locais_votacao', 'eleitorado_local_votacao_2026.zip')
OUT = os.path.join(PUBLIC_DATA, 'locais')
TOLERANCIA_KM = 2.0
IBGE_TOPO = os.path.join(ROOT, 'data-raw', 'ibge', 'mun')
# Caixa do Brasil (com folga) para as UFs brasileiras.
LAT_BR = (-34.0, 5.5)
LON_BR = (-74.5, -28.5)


def coord(s: str) -> float | None:
    if not s:
        return None
    try:
        v = float(s.replace(',', '.'))
    except ValueError:
        return None
    if v in (0.0, -1.0) or math.isnan(v):
        return None
    return v


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


# ------------------------------------------------------------------------------------------------ malha do IBGE

def poligonos_municipios(uf: str) -> dict[str, list[list[tuple[float, float]]]]:
    """Anéis (lon, lat) de cada município (chave = código IBGE) da malha bruta do IBGE (data-raw/ibge/mun/{uf}.topo.json,
    baixada por scripts/data/fetch-ibge.ts). Vazio se o arquivo não existir (a checagem de coordenadas é pulada)."""
    path = os.path.normpath(os.path.join(IBGE_TOPO, f'{uf.lower()}.topo.json'))
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding='utf-8') as f:
            topo = json.load(f)
        arcos = []
        tr = topo.get('transform')
        for arco in topo['arcs']:
            if tr:  # TopoJSON quantizado: deltas inteiros
                (sx, sy), (tx, ty) = tr['scale'], tr['translate']
                x = y = 0
                pts = []
                for dx, dy in arco:
                    x += dx
                    y += dy
                    pts.append((x * sx + tx, y * sy + ty))
            else:
                pts = [(float(p[0]), float(p[1])) for p in arco]
            arcos.append(pts)
    except (OSError, ValueError, KeyError, TypeError) as e:
        log(f'[{uf}] aviso: malha do IBGE ilegível ({e}) — coordenadas não conferidas por município')
        return {}

    def anel(idx: list[int]) -> list[tuple[float, float]]:
        out: list[tuple[float, float]] = []
        for i in idx:
            pts = arcos[i] if i >= 0 else arcos[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    res: dict[str, list[list[tuple[float, float]]]] = {}
    for g in next(iter(topo['objects'].values()))['geometries']:
        props = g.get('properties') or {}
        cod = str(props.get('codarea') or props.get('id') or g.get('id') or '')
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']] if g['type'] == 'Polygon' else []
        res[cod] = [anel(r) for poly in polys for r in poly]
    return res


def dentro(p: tuple[float, float], aneis: list[list[tuple[float, float]]]) -> bool:
    """Par-ímpar sobre todos os anéis (buracos inclusos). p = (lon, lat)."""
    x, y = p
    ins = False
    for a in aneis:
        n = len(a)
        j = n - 1
        for i in range(n):
            xi, yi = a[i]
            xj, yj = a[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                ins = not ins
            j = i
    return ins


def dist_borda_km(p: tuple[float, float], aneis: list[list[tuple[float, float]]]) -> float:
    """Distância aproximada (equirretangular) do ponto à borda mais próxima."""
    kx = 111.32 * math.cos(math.radians(p[1]))
    ky = 110.57
    px, py = p[0] * kx, p[1] * ky
    best = float('inf')
    for a in aneis:
        for i in range(1, len(a)):
            ax, ay = a[i - 1][0] * kx, a[i - 1][1] * ky
            bx, by = a[i][0] * kx, a[i][1] * ky
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d < best:
                best = d
    return best


# ------------------------------------------------------------------------------------------------ limpeza de texto

def chave(s: str) -> str:
    s = unicodedata.normalize('NFD', s.lower())
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


RE_ZONA_URBANA = re.compile(r'[\s,;\-–]*\(?\s*zona\s+urbana\s*\)?\s*\.?\s*$', re.I)
RE_TELEFONE = re.compile(r'[\s,;\-–(]*\b(?:tel|fone|telefone|fones|tels)\b\.?:?\s*[\d\s\-/().]{6,}\)?\s*$', re.I)
RE_CEP = re.compile(r'[\s,;\-–]*\bcep\b\.?:?\s*\d{2}\.?\d{3}-?\d{3}\b', re.I)


def limpar_endereco(end: str, municipio: str, uf: str) -> str:
    """Tira do fim do endereço o que é redundante ou ruído: "- ZONA URBANA", telefone, CEP e "- Município/UF"."""
    e = end.strip()
    for _ in range(3):
        antes = e
        e = RE_TELEFONE.sub('', e)
        e = RE_CEP.sub('', e)
        e = RE_ZONA_URBANA.sub('', e)
        m = re.search(r'[\s,;\-–/]+([^,;\-–/]+?)(?:\s*[\-/]\s*([A-Za-z]{2}))?\s*\.?\s*$', e)
        if m and chave(m.group(1)) == chave(municipio) and (m.group(2) is None or m.group(2).upper() == uf):
            e = e[:m.start()]
        e = e.strip(' ,;-–')
        if e == antes:
            break
    return e or end.strip()


def construir_uf(uf: str, rel: dict) -> tuple[int, int]:
    ufd = ler_uf_dataset(uf)
    ordem = ordem_canonica(ufd)
    ativas = set(ordem)
    ordem_mun = {m['cod']: i for i, m in enumerate(ufd['municipios'])}

    locais: dict[tuple[str, int, int], dict] = {}
    secao_local: dict[tuple[str, int, int], tuple[str, int, int]] = {}
    agregadas: list[tuple[str, int, int, int]] = []
    conflitos = 0
    # 2º turno (25/10): local de cada seção principal, para o campo extra `segundoTurno`
    t2_local: dict[tuple[str, int, int], tuple[str, int, int]] = {}
    t2_info: dict[tuple[str, int, int], tuple] = {}
    t2_aptos: Counter = Counter()
    for r in ler_csv(ZIP, f'eleitorado_local_votacao_2026_{uf}.csv'):
        if r['NR_TURNO'] == '2':
            if r['CD_TIPO_SECAO_AGREGADA'] == '1':
                k2 = (r['CD_MUNICIPIO'].zfill(5), int(r['NR_ZONA']), int(r['NR_SECAO']))
                lk2 = (k2[0], k2[1], int(r['NR_LOCAL_VOTACAO']))
                t2_local[k2] = lk2
                t2_info.setdefault(lk2, (r['NM_LOCAL_VOTACAO'], r['DS_ENDERECO'], r['NM_BAIRRO'], r['NR_LATITUDE'],
                                         r['NR_LONGITUDE']))
                t2_aptos[lk2] += to_int(r['QT_ELEITOR_ELEICAO_FEDERAL'])
            continue
        if r['NR_TURNO'] != '1':
            raise SystemExit(f'[{uf}] turno inesperado: {r["NR_TURNO"]}')
        if r['SG_UF'] != uf:
            raise SystemExit(f'[{uf}] linha de outra UF: {r["SG_UF"]}')
        cod = r['CD_MUNICIPIO'].zfill(5)
        z = int(r['NR_ZONA'])
        s = int(r['NR_SECAO'])
        tipo = r['CD_TIPO_SECAO_AGREGADA']
        if tipo == '2':
            agregadas.append((cod, z, s, int(r['NR_SECAO_PRINCIPAL'])))
            continue
        if tipo != '1':
            raise SystemExit(f'[{uf}] tipo de seção inesperado: {tipo}')
        k = (cod, z, s)
        if k in secao_local:
            raise SystemExit(f'[{uf}] seção principal repetida: {k}')
        lk = (cod, z, int(r['NR_LOCAL_VOTACAO']))
        secao_local[k] = lk
        info = (r['NM_LOCAL_VOTACAO'], r['DS_ENDERECO'], r['NM_BAIRRO'], r['NR_LATITUDE'], r['NR_LONGITUDE'])
        loc = locais.get(lk)
        if loc is None:
            loc = locais[lk] = {'info': info, 'secoes': [], 'aptos': 0, 'agregadas': []}
        elif loc['info'] != info:
            conflitos += 1
        loc['secoes'].append(s)
        loc['aptos'] += to_int(r['QT_ELEITOR_ELEICAO_FEDERAL'])

    faltam = ativas - set(secao_local)
    sobram = set(secao_local) - ativas
    if faltam or sobram:
        raise SystemExit(f'[{uf}] seções ativas sem linha principal: {sorted(faltam)[:5]} ({len(faltam)}); '
                         f'principais fora da ordem canônica: {sorted(sobram)[:5]} ({len(sobram)})')

    # agregadas → local da seção principal (onde o eleitor vota)
    agr_sem_principal = 0
    for cod, z, s, p in agregadas:
        lk = secao_local.get((cod, z, p))
        if lk is None:
            agr_sem_principal += 1
            continue
        locais[lk]['agregadas'].append((s, p))

    # coordenadas: só as que caem dentro do município (malha do IBGE, tolerância TOLERANCIA_KM)
    nomes_mun = {m['cod']: m['nome'] for m in ufd['municipios']}
    ibge_mun = {m['cod']: m['ibge'] for m in ufd['municipios']}
    malha = poligonos_municipios(uf) if uf != 'ZZ' else {}
    motivos: Counter = Counter()

    def coord_ok(lk: tuple[str, int, int], info: tuple) -> tuple[float, float] | None:
        la, lo = coord(info[3]), coord(info[4])
        if la is None or lo is None:
            motivos['sem'] += 1
            return None
        if uf != 'ZZ' and not (LAT_BR[0] <= la <= LAT_BR[1] and LON_BR[0] <= lo <= LON_BR[1]):
            motivos['foraBR'] += 1
            return None
        aneis = malha.get(ibge_mun.get(lk[0], ''))
        if aneis and not dentro((lo, la), aneis) and dist_borda_km((lo, la), aneis) > TOLERANCIA_KM:
            motivos['foraMun'] += 1
            return None
        return (la, lo)

    coords = {lk: coord_ok(lk, loc['info']) for lk, loc in locais.items()}
    sem_coord, fora_br, fora_mun = motivos['sem'], motivos['foraBR'], motivos['foraMun']
    if uf != 'ZZ' and not malha:
        log(f'[{uf}] aviso: sem malha do IBGE em data-raw/ibge/mun — coordenadas não conferidas por município')

    chaves = sorted(locais, key=lambda k: (ordem_mun[k[0]], k[1], k[2]))
    saida = []
    bairros_omitidos = [0]

    def montar(lk: tuple[str, int, int], info: tuple, c: tuple[float, float] | None) -> dict:
        nome, end, bairro, _, _ = info
        endereco = titulo(limpar_endereco(end, nomes_mun[lk[0]], uf))
        item: dict = {'nr': lk[2], 'cod': lk[0], 'zona': lk[1], 'nome': titulo(nome, nome_local=True),
                      'endereco': endereco}
        b = titulo(bairro.strip(' -.,')) if bairro.strip(' -.,') else ''
        kb = chave(b)
        # bairro redundante: já está no endereço, é o nome do município ou "Zona Urbana"
        if b and kb not in ('zona urbana', chave(nomes_mun[lk[0]])) and f' {kb} ' not in f' {chave(endereco)} ':
            item['bairro'] = b
        else:
            bairros_omitidos[0] += 1
        if c:
            item['lat'] = round(c[0], 5)
            item['lon'] = round(c[1], 5)
        return item

    for lk in chaves:
        loc = locais[lk]
        item = montar(lk, loc['info'], coords[lk])
        item['secoes'] = encode_faixas(loc['secoes'])
        item['aptos'] = loc['aptos']
        if loc['agregadas']:
            item['agregadas'] = ','.join(f'{s}>{p}' for s, p in sorted(loc['agregadas']))
        saida.append(item)

    # 2º turno: seções cujo local muda em 25/10 → índice em [...locais, ...segundoTurno.locais]
    if set(t2_local) != ativas:
        raise SystemExit(f'[{uf}] seções principais do 2º turno ≠ do 1º turno')
    pos = {lk: j for j, lk in enumerate(chaves)}
    novos: dict[tuple[str, int, int], list[int]] = {}
    mudancas: dict[str, int] = {}
    renomeados = 0
    for k in ordem:
        lk1, lk2 = secao_local[k], t2_local[k]
        if lk2 in locais and t2_info[lk2] != locais[lk2]['info'] and lk2 == lk1:
            renomeados += 1
        if lk2 == lk1:
            continue
        if lk2 not in pos:
            novos.setdefault(lk2, []).append(k[2])
        mudancas[f'{k[0]}:{k[1]}:{k[2]}'] = -1  # preenchido abaixo
    chaves_novas = sorted(novos, key=lambda k: (ordem_mun[k[0]], k[1], k[2]))
    for j, lk in enumerate(chaves_novas):
        pos[lk] = len(chaves) + j
    for k in ordem:
        ck = f'{k[0]}:{k[1]}:{k[2]}'
        if ck in mudancas:
            mudancas[ck] = pos[t2_local[k]]
    locais_t2 = []
    for lk in chaves_novas:
        item = montar(lk, t2_info[lk], coord_ok(lk, t2_info[lk]))
        item['secoes'] = encode_faixas(novos[lk])
        item['aptos'] = t2_aptos[lk]
        locais_t2.append(item)
    dataset: dict = {'uf': uf, 'locais': saida}
    if mudancas:
        dataset['segundoTurno'] = {'mudancas': mudancas, 'locais': locais_t2}

    tam = gravar_json(os.path.join(OUT, f'{uf.lower()}.json'), dataset)
    rel[uf] = {'locais': len(saida), 'secoes': len(secao_local), 'agregadas': len(agregadas),
               'agregadasSemPrincipal': agr_sem_principal, 'semCoord': sem_coord, 'foraBR': fora_br,
               'foraDoMunicipio': fora_mun, 'conflitosInfo': conflitos, 'bytes': tam,
               'bairrosOmitidos': bairros_omitidos[0], 't2Mudancas': len(mudancas), 't2LocaisNovos': len(locais_t2),
               't2MesmoLocalOutroNomeOuEndereco': renomeados,
               'aptos': sum(l['aptos'] for l in saida)}
    log(f'{uf}: {len(saida):6d} locais · {len(secao_local):6d} seções · {len(agregadas):5d} agregadas · '
        f'sem coord {sem_coord} · fora do BR {fora_br} · fora do município {fora_mun} · {tam / 1e6:.2f} MB')
    return len(saida), tam


def main() -> None:
    if not os.path.exists(ZIP):
        raise SystemExit(f'falta {ZIP}: rode antes scripts/data/py/secao_download.py')
    rel: dict = {}
    total = 0
    n = 0
    for uf in TODAS:
        k, t = construir_uf(uf, rel)
        n += k
        total += t
    soma = Counter()
    for v in rel.values():
        for c in ('semCoord', 'foraBR', 'foraDoMunicipio', 'bairrosOmitidos', 'agregadas', 'agregadasSemPrincipal',
                  'conflitosInfo', 't2Mudancas', 't2LocaisNovos', 't2MesmoLocalOutroNomeOuEndereco'):
            soma[c] += v[c]
    log(f'TOTAL: {n} locais · {total / 1e6:.2f} MB · {dict(soma)}')
    sp = rel['SP']['bytes']
    if sp > 3e6:
        raise SystemExit(f'orçamento estourado: SP {sp / 1e6:.2f} MB (≤ 3)')
    if total > 14e6:
        log(f'AVISO: total {total / 1e6:.2f} MB acima do orçamento de 14 MB (inviável no formato do contrato; ver docstring)')


if __name__ == '__main__':
    main()
