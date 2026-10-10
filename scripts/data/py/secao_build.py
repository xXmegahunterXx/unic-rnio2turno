"""
1º turno REAL por seção (Presidente e Governador) → public/data/secao/{uf}.json (SecaoUfDataset, src/shared/dataset.ts).

    python3 -I scripts/data/py/secao_download.py   # baixa/usa o cache de data-raw/tse-abertos/
    python3 -I scripts/data/py/locais_build.py     # gera public/data/locais/ (o índice do local de cada seção sai dali)
    python3 -I scripts/data/py/secao_build.py
    npx tsx scripts/data/validate-secao.ts          # conferência independente (TS, decodeU16 + decodeFaixas)

Fontes (dados abertos do TSE, https://cdn.tse.jus.br/estatistica/sead/odsele/), lidas em streaming de dentro do ZIP:
 - detalhe_votacao_secao/detalhe_votacao_secao_2026.zip
     · detalhe_votacao_secao_2026_BR.csv   → Presidente (cargo 1), todas as UFs + ZZ, 1 linha por seção ativa
     · detalhe_votacao_secao_2026_{UF}.csv → cargos estaduais; usamos Governador (cargo 3) nas 7 UFs com 2º turno
   Colunas usadas: QT_APTOS, QT_COMPARECIMENTO, QT_VOTOS_BRANCOS, QT_VOTOS_NULOS, QT_VOTOS_NOMINAIS, NR_LOCAL_VOTACAO.
 - votacao_secao/votacao_secao_2026_BR.zip   → votos por seção e votável, Presidente (todas as UFs + ZZ)
 - votacao_secao/votacao_secao_2026_{UF}.zip → idem por UF; usamos só Governador (cargo 3)

Convenções (iguais às do dataset da fase 1, public/data/uf/*.json — ver scripts/data/lib/resultado.ts):
 - a / b = finalistas do 2º turno em ordem do número (Presidente 13 e 22; Governador: corrida gov-xx de meta.json).
 - outros = Σ votos dos demais candidatos COMPUTADOS no resultado oficial (os números que aparecem em
   UfDataset.municipios[].t1.votos / t1gov.votos — inclui "Anulado sub judice", ex.: Garotinho (10) no RJ).
 - brancos = NR_VOTAVEL 95.
 - nulos = NR_VOTAVEL 96 + votos de candidatos NÃO computados (nulo técnico; em 2026: Presidente nº 28, cujos votos o
   TSE soma em "nulos" = tvn). Assim, por seção: comp = a + b + outros + brancos + nulos.
 - aptos = QT_APTOS de Presidente. `gov.aptos` (campo extra, proposto para o contrato) = QT_APTOS de Governador, que
   difere do de Presidente nas seções com eleitores em trânsito de outra UF (votam só para Presidente).
 - Seções agregadas (nsp): o TSE já publica 1 linha por seção ATIVA (a principal soma as agregadas) — conferido: as
   chaves do detalhe são exatamente as seções da ordem canônica, sem sobra nem falta.
 - Seções não instaladas (41, exterior) ficam com zeros (o eleitorado delas está em aptos, como no feed).
 - local = índice em public/data/locais/{uf}.json (0xFFFF se desconhecido), conferido contra NR_LOCAL_VOTACAO do
   detalhe.
 - Nada é ajustado para fechar: qualquer divergência por seção ou por município é listada e o script sai com erro.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

sys.dont_write_bytecode = True  # não deixa __pycache__ no repositório
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from secao_comum import (PUBLIC_DATA, RAW, TODAS, UFS_GOV_2T, decode_faixas, encode_u16, gravar_json,  # noqa: E402
                         ler_csv, ler_meta, ler_uf_dataset, log, ordem_canonica, to_int)

DET_ZIP = os.path.join(RAW, 'detalhe_votacao_secao', 'detalhe_votacao_secao_2026.zip')
VOT_BR_ZIP = os.path.join(RAW, 'votacao_secao', 'votacao_secao_2026_BR.zip')
OUT = os.path.join(PUBLIC_DATA, 'secao')
BRANCO, NULO = '95', '96'
CAMPOS = ('aptos', 'comp', 'a', 'b', 'outros', 'brancos', 'nulos')


class Corrida:
    """Colunas de uma corrida (Presidente ou Governador) para uma UF, na ordem canônica."""

    def __init__(self, n: int, finalistas: tuple[str, str], computados: set[str]):
        self.n = n
        self.fa, self.fb = finalistas
        self.computados = computados
        self.col = {c: [0] * n for c in CAMPOS}
        self.det = [False] * n  # seção vista no detalhe
        self.vot = [False] * n  # seção vista na votação
        self.det_brancos = [0] * n
        self.det_nulos = [0] * n
        self.det_nominais = [0] * n
        self.instalada = [True] * n
        self.local_nr = [-1] * n
        self.nao_computados: Counter[str] = Counter()  # votos em candidatos não computados (→ nulos)
        self.votaveis: Counter[str] = Counter()

    def add_detalhe(self, i: int, r: dict) -> None:
        if self.det[i]:
            raise SystemExit(f'seção repetida no detalhe: {r["SG_UF"]} {r["CD_MUNICIPIO"]} {r["NR_ZONA"]}/{r["NR_SECAO"]}')
        self.det[i] = True
        self.col['aptos'][i] = to_int(r['QT_APTOS'])
        self.col['comp'][i] = to_int(r['QT_COMPARECIMENTO'])
        self.det_brancos[i] = to_int(r['QT_VOTOS_BRANCOS'])
        self.det_nulos[i] = to_int(r['QT_VOTOS_NULOS'])
        self.det_nominais[i] = to_int(r['QT_VOTOS_NOMINAIS'])
        self.instalada[i] = r['ST_SECAO_INSTALADA'] == 'Sim'
        self.local_nr[i] = to_int(r['NR_LOCAL_VOTACAO'])
        if to_int(r['QT_VOTOS_LEGENDA']) or to_int(r['QT_VOTOS_ANULADOS_APU_SEP']):
            raise SystemExit(f'votos de legenda/anulados em apuração separada não tratados: {r}')
        if r['ST_SECAO_ANULADA'] != 'Não':
            raise SystemExit(f'seção anulada não tratada: {r}')

    def add_voto(self, i: int, nr: str, q: int) -> None:
        self.vot[i] = True
        self.votaveis[nr] += q
        c = self.col
        if nr == self.fa:
            c['a'][i] += q
        elif nr == self.fb:
            c['b'][i] += q
        elif nr == BRANCO:
            c['brancos'][i] += q
        elif nr == NULO:
            c['nulos'][i] += q
        elif nr in self.computados:
            c['outros'][i] += q
        else:
            c['nulos'][i] += q
            self.nao_computados[nr] += q


def indice_canonico(ufd: dict) -> tuple[list[tuple[str, int, int]], dict[tuple[str, int, int], int]]:
    ordem = ordem_canonica(ufd)
    return ordem, {k: i for i, k in enumerate(ordem)}


def chave(r: dict) -> tuple[str, int, int]:
    return (r['CD_MUNICIPIO'].zfill(5), int(r['NR_ZONA']), int(r['NR_SECAO']))


def finalistas(meta: dict, race_id: str) -> tuple[str, str]:
    race = next(r for r in meta['races'] if r['id'] == race_id)
    nums = sorted(int(c['numero']) for c in race['candidatos'])
    if len(nums) != 2:
        raise SystemExit(f'{race_id}: esperado 2 finalistas, há {nums}')
    return str(nums[0]), str(nums[1])


def ler_locais(uf: str) -> tuple[list[dict], dict[tuple[str, int, int], int]] | None:
    path = os.path.join(PUBLIC_DATA, 'locais', f'{uf.lower()}.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        locais = json.load(f)['locais']
    idx: dict[tuple[str, int, int], int] = {}
    for j, l in enumerate(locais):
        for s in decode_faixas(l['secoes']):
            k = (l['cod'], l['zona'], s)
            if k in idx:
                raise SystemExit(f'[{uf}] seção {k} em dois locais')
            idx[k] = j
    return locais, idx


def conferir_secoes(uf: str, nome: str, c: Corrida, ordem: list, erros: list[str], obs: Counter) -> None:
    col = c.col
    for i in range(c.n):
        k = ordem[i]
        if not c.det[i]:
            erros.append(f'[{uf} {nome}] seção {k} ausente do detalhe')
            continue
        soma = col['a'][i] + col['b'][i] + col['outros'][i] + col['brancos'][i] + col['nulos'][i]
        if not c.vot[i]:
            if col['comp'][i] != 0:
                erros.append(f'[{uf} {nome}] seção {k} com comparecimento {col["comp"][i]} e sem votos na votacao_secao')
            obs['semVotos'] += 1
            if not c.instalada[i]:
                obs['naoInstaladas'] += 1
            continue
        if soma != col['comp'][i]:
            erros.append(f'[{uf} {nome}] seção {k}: a+b+outros+brancos+nulos = {soma} ≠ comparecimento {col["comp"][i]}')
        if col['brancos'][i] != c.det_brancos[i]:
            erros.append(f'[{uf} {nome}] seção {k}: brancos {col["brancos"][i]} ≠ detalhe {c.det_brancos[i]}')
        if col['nulos'][i] != c.det_nulos[i]:
            obs['nulosDifDetalhe'] += 1
        if col['a'][i] + col['b'][i] + col['outros'][i] != c.det_nominais[i]:
            obs['nominaisDifDetalhe'] += 1
        for campo in CAMPOS:
            if col[campo][i] > 0xFFFF:
                erros.append(f'[{uf} {nome}] seção {k}: {campo} = {col[campo][i]} não cabe em Uint16')


def conferir_municipios(uf: str, nome: str, c: Corrida, ufd: dict, ordem: list, campo_t1: str, erros: list[str]) -> None:
    soma: dict[str, Counter] = defaultdict(Counter)
    for i, (cod, _, _) in enumerate(ordem):
        for campo in CAMPOS:
            soma[cod][campo] += c.col[campo][i]
    for m in ufd['municipios']:
        t = m.get(campo_t1)
        if t is None:
            erros.append(f'[{uf} {nome}] município {m["cod"]} sem {campo_t1}')
            continue
        validos = sum(t['votos'].values())
        a, b = t['votos'].get(c.fa, 0), t['votos'].get(c.fb, 0)
        esperado = {'aptos': t['eleitorado'], 'comp': t['comparecimento'], 'a': a, 'b': b, 'outros': validos - a - b,
                    'brancos': t['brancos'], 'nulos': t['nulos']}
        s = soma[m['cod']]
        dif = [f'{k}: seções {s[k]} ≠ município {v}' for k, v in esperado.items() if s[k] != v]
        if dif:
            erros.append(f'[{uf} {nome}] {m["cod"]} {m["nome"]}: ' + '; '.join(dif))


def main() -> None:
    for z in (DET_ZIP, VOT_BR_ZIP):
        if not os.path.exists(z):
            raise SystemExit(f'falta {z}: rode antes scripts/data/py/secao_download.py')
    meta = ler_meta()
    fin_pres = finalistas(meta, 'pres')
    uf_meta = {u['uf']: u for u in meta['ufs']}

    ufds: dict[str, dict] = {}
    ordens: dict[str, list] = {}
    idxs: dict[str, dict] = {}
    comp_pres: set[str] = set()
    pres: dict[str, Corrida] = {}
    gov: dict[str, Corrida] = {}
    for uf in TODAS:
        ufd = ler_uf_dataset(uf)
        ufds[uf] = ufd
        ordens[uf], idxs[uf] = indice_canonico(ufd)
        if len(ordens[uf]) != uf_meta[uf]['secoes']:
            raise SystemExit(f'[{uf}] ordem canônica com {len(ordens[uf])} seções ≠ meta {uf_meta[uf]["secoes"]}')
        for m in ufd['municipios']:
            comp_pres.update(m['t1']['votos'].keys())
    for uf in TODAS:
        pres[uf] = Corrida(len(ordens[uf]), fin_pres, comp_pres)
    for uf in UFS_GOV_2T:
        comp_gov: set[str] = set()
        for m in ufds[uf]['municipios']:
            comp_gov.update(m['t1gov']['votos'].keys())
        gov[uf] = Corrida(len(ordens[uf]), finalistas(meta, f'gov-{uf.lower()}'), comp_gov)

    fora: Counter = Counter()
    obs_local_original: set[tuple[str, int]] = set()

    # --- Presidente: detalhe
    log('lendo detalhe_votacao_secao_2026_BR.csv (Presidente)…')
    for r in ler_csv(DET_ZIP, 'detalhe_votacao_secao_2026_BR.csv'):
        if r['CD_CARGO'] != '1' or r['NR_TURNO'] != '1':
            fora[f'detalhe BR cargo {r["CD_CARGO"]} turno {r["NR_TURNO"]}'] += 1
            continue
        uf = r['SG_UF']
        i = idxs[uf].get(chave(r))
        if i is None:
            fora[f'detalhe pres fora da ordem canônica {uf}'] += 1
            continue
        pres[uf].add_detalhe(i, r)

    # --- Presidente: votos por votável
    log('lendo votacao_secao_2026_BR.csv (Presidente, ~1 GB em streaming)…')
    for r in ler_csv(VOT_BR_ZIP, 'votacao_secao_2026_BR.csv'):
        if r['CD_CARGO'] != '1' or r['NR_TURNO'] != '1':
            fora[f'votacao BR cargo {r["CD_CARGO"]}'] += 1
            continue
        uf = r['SG_UF']
        i = idxs[uf].get(chave(r))
        if i is None:
            fora[f'votacao pres fora da ordem canônica {uf}'] += 1
            continue
        pres[uf].add_voto(i, r['NR_VOTAVEL'], to_int(r['QT_VOTOS']))
        if to_int(r['NR_LOCAL_VOTACAO']) != pres[uf].local_nr[i]:
            # a votacao_secao traz o local ORIGINAL da seção (NR_LOCAL_VOTACAO_ORIGINAL do eleitorado_local) quando ela
            # foi transferida; o detalhe e o eleitorado_local trazem o local onde a urna de fato funcionou (o que usamos)
            obs_local_original.add((uf, i))

    # --- Governador (7 UFs)
    for uf in UFS_GOV_2T:
        log(f'lendo Governador {uf}…')
        for r in ler_csv(DET_ZIP, f'detalhe_votacao_secao_2026_{uf}.csv'):
            if r['CD_CARGO'] != '3':
                continue
            if r['SG_UF'] != uf or r['NR_TURNO'] != '1':
                raise SystemExit(f'[{uf}] linha inesperada no detalhe: {r["SG_UF"]} turno {r["NR_TURNO"]}')
            i = idxs[uf].get(chave(r))
            if i is None:
                fora[f'detalhe gov fora da ordem canônica {uf}'] += 1
                continue
            gov[uf].add_detalhe(i, r)
        z = os.path.join(RAW, 'votacao_secao', f'votacao_secao_2026_{uf}.zip')
        for r in ler_csv(z, f'votacao_secao_2026_{uf}.csv'):
            if r['CD_CARGO'] != '3':
                continue
            i = idxs[uf].get(chave(r))
            if i is None:
                fora[f'votacao gov fora da ordem canônica {uf}'] += 1
                continue
            gov[uf].add_voto(i, r['NR_VOTAVEL'], to_int(r['QT_VOTOS']))

    # --- conferências
    erros: list[str] = []
    obs: Counter = Counter()
    for k, v in fora.items():
        if 'fora da ordem' in k:
            erros.append(f'{k}: {v} linhas')
    for uf in TODAS:
        conferir_secoes(uf, 'Presidente', pres[uf], ordens[uf], erros, obs)
        conferir_municipios(uf, 'Presidente', pres[uf], ufds[uf], ordens[uf], 't1', erros)
    for uf in UFS_GOV_2T:
        o2: Counter = Counter()
        conferir_secoes(uf, 'Governador', gov[uf], ordens[uf], erros, o2)
        conferir_municipios(uf, 'Governador', gov[uf], ufds[uf], ordens[uf], 't1gov', erros)
        for k, v in o2.items():
            obs[f'gov {k}'] += v
        obs['gov aptos ≠ pres'] += sum(1 for i in range(gov[uf].n) if gov[uf].col['aptos'][i] != pres[uf].col['aptos'][i])
    nao_comp = Counter()
    for c in list(pres.values()):
        nao_comp.update({f'pres {k}': v for k, v in c.nao_computados.items()})
    for uf, c in gov.items():
        nao_comp.update({f'gov-{uf.lower()} {k}': v for k, v in c.nao_computados.items()})

    # --- local de votação
    sem_local = 0
    local_dif = 0
    saidas = {}
    for uf in TODAS:
        c = pres[uf]
        n = c.n
        lc = ler_locais(uf)
        local = [0xFFFF] * n
        if lc is None:
            log(f'[{uf}] aviso: sem public/data/locais/{uf.lower()}.json — rode locais_build.py antes')
        else:
            locais, lidx = lc
            if len(locais) >= 0xFFFF:
                raise SystemExit(f'[{uf}] {len(locais)} locais não cabem em Uint16')
            for i, k in enumerate(ordens[uf]):
                j = lidx.get(k)
                if j is None:
                    continue
                local[i] = j
                if locais[j]['nr'] != c.local_nr[i]:
                    local_dif += 1
        sem_local += sum(1 for v in local if v == 0xFFFF)
        cols = c.col
        out = {
            'uf': uf,
            'n': n,
            'aptos': encode_u16(cols['aptos']),
            'pres': {k: encode_u16(cols[k]) for k in ('comp', 'a', 'b', 'outros', 'brancos', 'nulos')},
        }
        if uf in gov:
            g = gov[uf].col
            out['gov'] = {'aptos': encode_u16(g['aptos']),
                          **{k: encode_u16(g[k]) for k in ('comp', 'a', 'b', 'outros', 'brancos', 'nulos')}}
        out['local'] = encode_u16(local)
        saidas[uf] = out
    if local_dif:
        erros.append(f'{local_dif} seções com NR_LOCAL_VOTACAO do detalhe ≠ local do eleitorado_local')

    total = 0
    tamanhos = {}
    for uf, out in saidas.items():
        tamanhos[uf] = gravar_json(os.path.join(OUT, f'{uf.lower()}.json'), out)
        total += tamanhos[uf]

    # --- relatório
    nac = Counter()
    for c in pres.values():
        for campo in CAMPOS:
            nac[campo] += sum(c.col[campo])
    tp = meta['totaisPrimeiroTurno']
    log('')
    log(f'Presidente (Brasil + ZZ, soma das seções): {dict(nac)}')
    log(f'  oficial (meta.totaisPrimeiroTurno): eleitorado {tp["eleitorado"]} comparecimento {tp["comparecimento"]} '
        f'brancos {tp["brancos"]} nulos {tp["nulos"]} válidos {tp["validos"]}')
    log(f'Votos em candidatos não computados (somados em nulos): {dict(nao_comp)}')
    obs['votacao com local original (seções transferidas)'] = len(obs_local_original)
    log(f'Observações: {dict(obs)}')
    log(f'Linhas fora do escopo/ignoradas: {dict(fora)}')
    log(f'Seções sem local conhecido: {sem_local}')
    log(f'Tamanho: {total / 1e6:.2f} MB (SP {tamanhos["SP"] / 1e6:.2f} MB)')
    for uf in TODAS:
        log(f'  {uf}: {tamanhos[uf] / 1e3:.0f} KB')
    if total > 14e6 or tamanhos['SP'] > 4e6:
        erros.append(f'orçamento estourado: {total / 1e6:.2f} MB (≤ 14), SP {tamanhos["SP"] / 1e6:.2f} MB (≤ 4)')
    if erros:
        log(f'\n{len(erros)} ERRO(S):')
        for e in erros[:200]:
            log('  ' + e)
        raise SystemExit(1)
    log('OK: todas as seções fecham com o comparecimento e todos os municípios batem com public/data/uf (t1/t1gov).')


if __name__ == '__main__':
    main()
