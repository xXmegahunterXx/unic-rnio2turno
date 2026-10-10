"""Converte dist-demo/index.html na página do preview publicado (Artifact).

O Artifact envolve a página num esqueleto próprio (<!doctype>/<head>/<body>), então removemos essas tags e
mantemos título, links (CSS), scripts (módulos relativos) e o #root. Uso: python3 scripts/preview/artifact-page.py
"""
import re
import sys
from pathlib import Path

dist = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist-demo')
html = (dist / 'index.html').read_text(encoding='utf-8')

head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)

# metas de charset/viewport já vêm do esqueleto do Artifact
head = re.sub(r'<meta charset[^>]*>\s*', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
head = re.sub(r'<!--app-meta-->\s*', '', head)
head = re.sub(r'<title>.*?</title>', '<title>Sintonia</title>', head, flags=re.S)

page = head.strip() + '\n' + body.strip() + '\n'
out = dist / 'artifact.html'
out.write_text(page, encoding='utf-8')
print(out, len(page), 'bytes')
