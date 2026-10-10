"""
Utilitários comuns do ETL do 1º turno por seção e dos locais de votação (dados abertos do TSE).

Usado por secao_build.py e locais_build.py (rode-os com `python3 -I`, ver README.md › Dados).

- Download com cache em data-raw/tse-abertos/<subpasta>/<arquivo>.zip: não baixa de novo se o arquivo existe e o
  tamanho bate com o Content-Length do servidor (HEAD). Grava em .part e renomeia (download atômico).
- Leitura dos CSVs do TSE em STREAMING, direto de dentro do ZIP (nunca extrai nem carrega o arquivo inteiro):
  latin-1 (ISO-8859-1), separador ';', aspas duplas; "#NULO#", "#NE#" e "#NULO" viram ''.
- Ordem canônica das seções (contrato SecaoUfDataset em src/shared/dataset.ts): municípios na ordem de
  public/data/uf/{uf}.json → zonas na ordem → seções na ordem de decodeFaixas(zona.s).
- encode_u16: igual a encodeU16 de src/shared/u16.ts (Uint16 little-endian em base64).
"""
from __future__ import annotations

import base64
import csv
import io
import json
import os
import shutil
import struct
import sys
import time
import urllib.request
import zipfile
from typing import Iterator

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
RAW = os.path.join(ROOT, 'data-raw', 'tse-abertos')
PUBLIC_DATA = os.path.join(ROOT, 'public', 'data')
BASE_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/'

# 27 UFs na ordem de src/shared/types.ts + exterior.
UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
       'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']
TODAS = UFS + ['ZZ']
UFS_GOV_2T = ['AC', 'AM', 'DF', 'ES', 'RJ', 'RN', 'TO']

NULOS_TSE = {'#NULO#', '#NE#', '#NULO', '#NE'}


def log(*a: object) -> None:
    print(*a, file=sys.stderr, flush=True)


# ------------------------------------------------------------------------------------------------ download (cache)

def _head_size(url: str) -> int | None:
    req = urllib.request.Request(url, method='HEAD')
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                n = r.headers.get('Content-Length')
                return int(n) if n else None
        except Exception as e:  # noqa: BLE001
            log(f'  HEAD falhou ({e}); tentativa {tentativa + 1}')
            time.sleep(2 * (tentativa + 1))
    return None


def baixar(rel: str) -> str:
    """Baixa BASE_URL+rel para RAW/rel (com cache por tamanho). Devolve o caminho local."""
    url = BASE_URL + rel
    dest = os.path.join(RAW, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    esperado = _head_size(url)
    if os.path.exists(dest) and (esperado is None or os.path.getsize(dest) == esperado):
        log(f'cache ok  {rel} ({os.path.getsize(dest) / 1e6:.1f} MB)')
        return dest
    for tentativa in range(5):
        part = dest + '.part'
        try:
            log(f'baixando {rel} ({(esperado or 0) / 1e6:.1f} MB)…')
            t0 = time.time()
            with urllib.request.urlopen(url, timeout=120) as r, open(part, 'wb') as f:
                shutil.copyfileobj(r, f, length=1 << 20)
            n = os.path.getsize(part)
            if esperado is not None and n != esperado:
                raise IOError(f'tamanho {n} ≠ {esperado}')
            os.replace(part, dest)
            log(f'ok        {rel} ({n / 1e6:.1f} MB em {time.time() - t0:.0f} s)')
            return dest
        except Exception as e:  # noqa: BLE001
            log(f'  falhou ({e}); tentativa {tentativa + 1}/5')
            time.sleep(5 * (tentativa + 1))
    raise SystemExit(f'não consegui baixar {url}')


# ------------------------------------------------------------------------------------------------ CSV em streaming

def membros_csv(zip_path: str) -> list[str]:
    with zipfile.ZipFile(zip_path) as z:
        return [n for n in z.namelist() if n.lower().endswith('.csv')]


def ler_csv(zip_path: str, membro: str) -> Iterator[dict[str, str]]:
    """Itera as linhas de um CSV do TSE dentro do ZIP, como dict (valores nulos do TSE → '')."""
    with zipfile.ZipFile(zip_path) as z, z.open(membro) as raw:
        txt = io.TextIOWrapper(raw, encoding='latin-1', newline='')
        rd = csv.reader(txt, delimiter=';', quotechar='"')
        cab = next(rd)
        cab[0] = cab[0].lstrip('﻿')
        n = len(cab)
        for row in rd:
            if len(row) != n:
                if not row:
                    continue
                raise ValueError(f'{membro}: linha com {len(row)} colunas (esperado {n}): {row[:6]}')
            yield {cab[i]: ('' if row[i] in NULOS_TSE else row[i]) for i in range(n)}


def cabecalho(zip_path: str, membro: str) -> list[str]:
    with zipfile.ZipFile(zip_path) as z, z.open(membro) as raw:
        linha = io.TextIOWrapper(raw, encoding='latin-1', newline='').readline()
    return next(csv.reader([linha], delimiter=';', quotechar='"'))


# ------------------------------------------------------------------------------------------------ dataset fase 1

def decode_faixas(s: str) -> list[int]:
    out: list[int] = []
    if not s:
        return out
    for part in s.split(','):
        if '-' in part:
            a, b = part.split('-')
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def encode_faixas(nums: list[int]) -> str:
    s = sorted(nums)
    parts: list[str] = []
    i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and s[j + 1] == s[j] + 1:
            j += 1
        parts.append(f'{s[i]}-{s[j]}' if j > i else f'{s[i]}')
        i = j + 1
    return ','.join(parts)


def ler_uf_dataset(uf: str) -> dict:
    with open(os.path.join(PUBLIC_DATA, 'uf', f'{uf.lower()}.json'), encoding='utf-8') as f:
        return json.load(f)


def ler_meta() -> dict:
    with open(os.path.join(PUBLIC_DATA, 'meta.json'), encoding='utf-8') as f:
        return json.load(f)


def ordem_canonica(ufd: dict) -> list[tuple[str, int, int]]:
    """[(cod_mun 5 dígitos, zona, seção)] na ordem do contrato SecaoUfDataset."""
    out: list[tuple[str, int, int]] = []
    for m in ufd['municipios']:
        for z in m['zonas']:
            for s in decode_faixas(z['s']):
                out.append((m['cod'], z['z'], s))
    return out


# ------------------------------------------------------------------------------------------------ Uint16 base64

def encode_u16(valores: list[int]) -> str:
    """Igual a encodeU16 (src/shared/u16.ts). Recusa valores fora de 0..65535 (o TS satura; aqui é erro)."""
    for v in valores:
        if v < 0 or v > 0xFFFF:
            raise ValueError(f'valor fora de Uint16: {v}')
    return base64.b64encode(struct.pack(f'<{len(valores)}H', *valores)).decode('ascii')


def decode_u16(b64: str) -> list[int]:
    raw = base64.b64decode(b64)
    return list(struct.unpack(f'<{len(raw) // 2}H', raw))


def gravar_json(path: str, obj: object) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)
    return len(data)


def to_int(s: str) -> int:
    return int(s) if s != '' else 0
