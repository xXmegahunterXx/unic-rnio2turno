"""
Baixa (com cache) os ZIPs de dados abertos do TSE usados pelo 1º turno por seção e pelos locais de votação.

    python3 -I scripts/data/py/secao_download.py

Destino: data-raw/tse-abertos/ (ignorado pelo git). Não rebaixa se o arquivo existe e o tamanho bate.
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

sys.dont_write_bytecode = True  # não deixa __pycache__ no repositório
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from secao_comum import UFS_GOV_2T, baixar  # noqa: E402

ARQUIVOS = [
    'votacao_secao/votacao_secao_2026_BR.zip',
    'detalhe_votacao_secao/detalhe_votacao_secao_2026.zip',
    'eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip',
] + [f'votacao_secao/votacao_secao_2026_{uf}.zip' for uf in UFS_GOV_2T]

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as ex:
        for p in ex.map(baixar, ARQUIVOS):
            print(p)
