"""
Fotos oficiais dos candidatos (TSE) em pacotes por grupo — FotoPacote em src/shared/dataset.ts.

    python3 -I scripts/data/py/fotos_build.py              # baixa o que falta (cache) e gera os pacotes
    python3 -I scripts/data/py/fotos_build.py --offline    # só o cache

Rode DEPOIS de scripts/data/py/candidatos_build.ts: os grupos e os candidatos vêm de public/data/candidatos/*.json
(os mesmos grupos das fichas; cada ficha tem `fotoGrupo`).

Fonte (feed oficial de resultados, mesmo endereço que o site do TSE usa):
    https://resultados.tse.jus.br/oficial/ele2026/{eleição}/fotos/{uf|br}/{sqcand}.jpeg
    Presidente/vice: eleição 6258 (2º turno), com 6257 como alternativa; demais cargos: 6259, com 6260 como alternativa.
Cache: data-raw/fotos/{uf|br}/{sqcand}.jpeg (ignorado pelo git; só baixa o que falta). Concorrência 8, com retry.

Tratamento — IGUAL para todos e sem nenhuma edição além de redimensionar/recortar:
    - retrato 120×160 (3:4): redimensiona mantendo a proporção até cobrir 120×160 e recorta o mínimo no centro
      (os originais têm 161×225 ou 111×155, proporção ~0,716: saem ~4 px de cima e de baixo); filtro Lanczos;
    - sem nitidez, cor, brilho, fundo ou qualquer outro ajuste; metadados descartados;
    - WebP qualidade 70 (data:image/webp;base64,…). Exceção: o grupo 'segundo-turno' sai em JPEG qualidade 85,
      porque o servidor usa essas fotos nas imagens de compartilhamento (satori/resvg só decodificam JPEG/PNG —
      ver src/server/fotos.ts).
Saída: public/data/fotos/{grupo}.json = {"grupo": "...", "fotos": {sqcand: data URI}} (JSON minificado).
Orçamento total: ≤ 10 MB (o script para se passar).
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
DIR_CAND = os.path.join(ROOT, 'public', 'data', 'candidatos')
DIR_OUT = os.path.join(ROOT, 'public', 'data', 'fotos')
CACHE = os.path.join(ROOT, 'data-raw', 'fotos')
BASE = 'https://resultados.tse.jus.br/oficial/ele2026'

LARGURA, ALTURA = 120, 160
QUALIDADE_WEBP = 70
QUALIDADE_JPEG = 85
GRUPOS_JPEG = {'segundo-turno'}
CONCORRENCIA = 8
ORCAMENTO = 10 * 1024 * 1024
OFFLINE = '--offline' in sys.argv


def log(*a: object) -> None:
    print(*a, file=sys.stderr, flush=True)


def urls(sq: str, uf: str) -> list[str]:
    if uf == 'BR':
        return [f'{BASE}/6258/fotos/br/{sq}.jpeg', f'{BASE}/6257/fotos/br/{sq}.jpeg']
    u = uf.lower()
    return [f'{BASE}/6259/fotos/{u}/{sq}.jpeg', f'{BASE}/6260/fotos/{u}/{sq}.jpeg']


def jpeg_valido(dados: bytes) -> bool:
    if len(dados) < 200 or dados[:3] != b'\xff\xd8\xff':
        return False
    try:
        with Image.open(io.BytesIO(dados)) as im:
            im.verify()
        return True
    except Exception:  # noqa: BLE001
        return False


def baixar(sq: str, uf: str) -> tuple[str, str | None, str]:
    """Garante a foto no cache. Devolve (sqcand, caminho ou None, origem: 'cache'|'baixada'|'404'|'erro: …')."""
    destino = os.path.join(CACHE, 'br' if uf == 'BR' else uf.lower(), f'{sq}.jpeg')
    if os.path.exists(destino):
        with open(destino, 'rb') as f:
            if jpeg_valido(f.read()):
                return sq, destino, 'cache'
    if OFFLINE:
        return sq, None, 'erro: ausente do cache (--offline)'
    ultimo = ''
    for url in urls(sq, uf):
        for tentativa in range(5):
            try:
                req = urllib.request.Request(url, headers={'user-agent': 'sintonia-data-pipeline/1.0'})
                with urllib.request.urlopen(req, timeout=30) as r:
                    dados = r.read()
                if not jpeg_valido(dados):
                    raise IOError('resposta não é JPEG válido')
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                tmp = f'{destino}.{os.getpid()}.part'
                with open(tmp, 'wb') as f:
                    f.write(dados)
                os.replace(tmp, destino)
                return sq, destino, 'baixada'
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    ultimo = '404'
                    break  # tenta a próxima eleição
                ultimo = f'erro: HTTP {e.code}'
            except Exception as e:  # noqa: BLE001
                ultimo = f'erro: {e}'
            time.sleep(min(20, 0.6 * 2 ** tentativa))
    return sq, None, ultimo or '404'


def processar(caminho: str, formato: str) -> str:
    """Retrato 120×160: cobre e recorta no centro (ImageOps.fit), Lanczos, sem outros ajustes."""
    with Image.open(caminho) as im:
        im = im.convert('RGB')
        im = ImageOps.fit(im, (LARGURA, ALTURA), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        buf = io.BytesIO()
        if formato == 'jpeg':
            im.save(buf, 'JPEG', quality=QUALIDADE_JPEG, optimize=True, progressive=False)
            mime = 'image/jpeg'
        else:
            im.save(buf, 'WEBP', quality=QUALIDADE_WEBP, method=6)
            mime = 'image/webp'
    return f'data:{mime};base64,{base64.b64encode(buf.getvalue()).decode("ascii")}'


def main() -> None:
    t0 = time.time()
    if not os.path.isdir(DIR_CAND):
        raise SystemExit('public/data/candidatos/ não existe: rode antes npx tsx scripts/data/py/candidatos_build.ts')
    grupos: list[tuple[str, list[dict]]] = []
    for nome in sorted(os.listdir(DIR_CAND)):
        if not nome.endswith('.json') or nome == 'index.json':
            continue
        with open(os.path.join(DIR_CAND, nome), encoding='utf-8') as f:
            d = json.load(f)
        if d.get('grupo') != nome[:-5]:
            raise SystemExit(f'{nome}: grupo {d.get("grupo")!r} não confere com o nome do arquivo')
        for c in d['candidatos']:
            if c.get('fotoGrupo') != d['grupo']:
                raise SystemExit(f'{nome}: {c["sqcand"]} com fotoGrupo {c.get("fotoGrupo")!r}')
        grupos.append((d['grupo'], d['candidatos']))
    # Ordem estável: segundo-turno, governadores, senado, câmaras, assembleias.
    prioridade = {'segundo-turno': 0, 'governadores': 1, 'senado': 2}
    grupos.sort(key=lambda g: (prioridade.get(g[0], 3 if g[0].startswith('camara') else 4), g[0]))

    pedidos = {(c['sqcand'], c['uf']) for _, cs in grupos for c in cs}
    log(f'{len(pedidos)} fotos em {len(grupos)} grupos; cache em {os.path.relpath(CACHE, ROOT)}')
    resultado: dict[str, tuple[str | None, str]] = {}
    contagem: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=CONCORRENCIA) as ex:
        for i, (sq, caminho, origem) in enumerate(ex.map(lambda p: baixar(*p), sorted(pedidos)), 1):
            resultado[sq] = (caminho, origem)
            chave = origem if not origem.startswith('erro') else 'erro'
            contagem[chave] = contagem.get(chave, 0) + 1
            if i % 250 == 0:
                log(f'  … {i}/{len(pedidos)}')
    log('download: ' + ', '.join(f'{k} {v}' for k, v in sorted(contagem.items())))

    os.makedirs(DIR_OUT, exist_ok=True)
    esperados = {f'{g}.json' for g, _ in grupos}
    for nome in os.listdir(DIR_OUT):
        if nome.endswith('.json') and nome not in esperados:
            os.remove(os.path.join(DIR_OUT, nome))

    total = 0
    faltando: list[str] = []
    linhas: list[str] = []
    for grupo, cands in grupos:
        formato = 'jpeg' if grupo in GRUPOS_JPEG else 'webp'
        fotos: dict[str, str] = {}
        for c in cands:
            caminho, origem = resultado[c['sqcand']]
            if caminho is None:
                faltando.append(f'{grupo}: {c["sqcand"]} {c["nomeUrna"]} ({c["cargo"]}, {c["uf"]}) — {origem}')
                continue
            fotos[c['sqcand']] = processar(caminho, formato)
        txt = json.dumps({'grupo': grupo, 'fotos': fotos}, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(DIR_OUT, f'{grupo}.json'), 'w', encoding='utf-8') as f:
            f.write(txt)
        n = len(txt.encode('utf-8'))
        total += n
        media = (n / len(fotos) / 1024) if fotos else 0
        linhas.append(f'{grupo:<16} {len(fotos):>4}/{len(cands):<4} {n / 1024:>7.0f} KB  ({formato}, ~{media:.1f} KB/foto)')

    print('\nGrupo            fotos       tamanho')
    print('\n'.join(linhas))
    print(f'\nTotal: {total / 1024 / 1024:.2f} MB em {len(grupos)} pacotes ({time.time() - t0:.1f} s)')
    if faltando:
        print(f'Fotos faltantes ({len(faltando)}):')
        for x in faltando:
            print(f'  {x}')
    else:
        print('Fotos faltantes: nenhuma')
    if total > ORCAMENTO:
        raise SystemExit(f'pacotes de fotos somam {total / 1024 / 1024:.2f} MB > orçamento de 10 MB')


if __name__ == '__main__':
    main()
