"""
Capitalização de exibição dos nomes, endereços e bairros dos locais de votação (o TSE publica em CAIXA ALTA).

Base: a mesma regra de `titleCasePt` (src/shared/format.ts) — tudo em minúsculas, inicial maiúscula em cada palavra,
partículas "de, da, do, das, dos, e, d'" em minúsculas fora da 1ª posição — com estas regras adicionais, nesta ordem
de prioridade (palavra = trecho entre espaços, hífens, barras, parênteses, vírgulas e pontos):

 1. Rodovias e siglas de UF com número ficam em maiúsculas: "BR-101", "RJ 160", "MT-010", "SP 55".
 2. Siglas com pontos ficam em maiúsculas: "E.E.", "E.M.E.F.", "U.E.B.", "N.S.".
 3. Abreviações conhecidas ficam só com a inicial maiúscula, mesmo sem vogal: "Dr.", "Profª", "Av.", "Qd", "Lt",
    "Jd.", "Tv.", "Cel.", "Pça." (lista ABREVIATURAS).
 4. Siglas conhecidas ficam em maiúsculas (lista SIGLAS: "EMEF", "EMEI", "EE", "CEU", "CIEP", "CMEI", "APAE",
    "SESI", "SENAI", "UBS", "CRAS", "ETEC", "IFRN"…), inclusive com ponto final ("EMEF." → "EMEF.").
    Padrões: IF + UF ("IFAM", "IFRN"), UF/UE/UNI + letras de universidade ("UFMG", "UFCG", "UERJ", "UESPI").
 5. Numerais romanos ficam em maiúsculas: "II", "XXIII", "XV de Novembro".
 6. Palavras sem nenhuma vogal (a, e, i, o, u, y, com ou sem acento) com 2+ letras são siglas: "PSF", "CTG", "BNH",
    "JK", "QN", "SP", "RJ".
 7. "EM" e "E" como 1ª palavra do nome são siglas ("EM Prof. João…" = Escola Municipal); no meio, preposição.
 8. Sigla de UF depois de "/" ou "-" no fim ("Segredo/RS", "Caiçara-PB") fica em maiúsculas.
 9. Partículas em minúsculas fora da 1ª posição: de, da, do, das, dos, e, d', em, na, no, nas, nos, com, para, ao,
    aos, à, às, pela, pelo, sob — exceto "E" logo depois de Quadra/Lote/Rua/Bloco… (é a letra da quadra/rua).
    Letras soltas ("Rua A", "Qd B") ficam maiúsculas.
10. Apóstrofo: "D'ÁGUA" → "d'Água", "SANT'ANA" → "Sant'Ana".

Limpeza (só no nome do local): a etiqueta de classificação do TSE no fim do nome (" - UE-MUN", " - UE-EST",
" - LC-PTC", " - LC-MUN", "UE-FED"…) é removida — é a rede/tipo do local, não faz parte do nome. Espaços repetidos são
colapsados, espaço antes de vírgula é removido e "S/ N", "S/N." e "SN" (endereço) viram "S/N".

Rode este arquivo para os autotestes: python3 -I scripts/data/py/locais_nomes.py
"""
from __future__ import annotations

import re

VOGAIS = set('aeiouyáéíóúâêôãõàüï')

PARTICULAS = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'com', 'para', 'ao', 'aos', 'à',
              'às', 'pela', 'pelo', 'sob'}
# Depois destas palavras, "E" é a letra (Quadra E, Lote E, Rua E), não a conjunção.
ANTES_DE_LETRA = {'qd', 'quadra', 'lt', 'lote', 'bl', 'bloco', 'rua', 'r', 'casa', 'setor', 'st', 'conj', 'cj',
                  'conjunto', 'etapa', 'fase', 'area', 'área', 'gleba', 'modulo', 'módulo', 'ap', 'apto', 'sala', 'ala',
                  'pavilhão', 'pavilhao', 'anexo', 'predio', 'prédio', 'av', 'avenida', 'travessa', 'tv', 'trav', 'q',
                  'l', 'loja', 'galpão', 'bloco', 'torre', 'ramal', 'linha', 'vila', 'núcleo', 'nucleo', 'trecho'}

ABREVIATURAS = {
    'dr', 'dra', 'drª', 'sr', 'sra', 'srª', 'srta', 'qd', 'qda', 'lt', 'lts', 'jd', 'tv', 'trav', 'cj', 'conj', 'pç',
    'pça', 'pca', 'pc', 'st', 'sta', 'sto', 'nr', 'nº', 'px', 'prx', 'prox', 'próx', 'vl', 'av', 'rod', 'estr', 'km',
    'cel', 'gal', 'gen', 'ten', 'cap', 'mal', 'sgt', 'sgto', 'prof', 'profa', 'profª', 'profº', 'pe', 'mons', 'des',
    'dep', 'ver', 'pref', 'gov', 'pres', 'sen', 'eng', 'esc', 'est', 'mun', 'munic', 'fund', 'ens', 'educ', 'com',
    'pov', 'dist', 'distr', 'lot', 'loc', 'hab', 'res', 'resid', 'assent', 'ass', 'faz', 'sit', 'nsa', 'pq', 'bl',
    'apto', 'cx', 'lj', 'sl', 'ext', 'jr', 'fac', 'inst', 'col', 'unid', 'ed', 'assoc', 'tel', 'esq', 'cond', 'gr',
    'frei', 'ir', 'irm', 'min', 'maj', 'brig', 'alm', 'cmte', 'cte', 'jorn', 'pastor', 'pr', 'mª', 'ma',
}

SIGLAS = {
    # escolas e redes de ensino
    'emef', 'emei', 'emeif', 'emeief', 'emefei', 'emefi', 'emefm', 'emeb', 'emebi', 'empg', 'emti', 'emefti', 'emeit',
    'ee', 'eee', 'eef', 'eefm', 'eefi', 'eei', 'eeif', 'eeief', 'eeef', 'eeefm', 'eeem', 'eem', 'eeb', 'eebti', 'eemti',
    'eeep', 'eepg', 'eepsg', 'epsg', 'epg', 'ete', 'etec', 'fatec', 'eti', 'cei', 'ceim', 'cemei', 'cemeb', 'cemef',
    'cmei', 'cmeb', 'cmef', 'ciep', 'cieja', 'ceja', 'ceeja', 'ceep', 'cepi', 'ceti', 'cetep', 'cesec', 'cem', 'cef',
    'ced', 'ceu', 'cefet', 'caic', 'ciac', 'ueb', 'ue', 'uei', 'ume', 'umef', 'nei', 'ecit', 'ebm', 'eeb', 'emeie',
    'eeiefm', 'eemf', 'eme', 'emf', 'emie', 'emeie', 'emeif', 'eeie', 'eepsg', 'cmeif', 'ceef', 'ceee', 'cieb', 'eja',
    'cecr', 'ece', 'eef', 'emefm', 'emeif', 'cepa', 'cmet', 'cemep', 'cenecista', 'cnec', 'ifet', 'ifce', 'puc', 'usp',
    'unesp', 'unicamp', 'unip', 'senai', 'senac', 'sesi', 'sesc', 'sest', 'senat', 'sebrae', 'iee', 'ieep',
    # saúde, assistência, órgãos e entidades
    'ubs', 'usf', 'psf', 'upa', 'caps', 'cras', 'creas', 'apae', 'aabb', 'acm', 'inss', 'saae', 'ceasa', 'cic', 'csu',
    'lbv', 'oab', 'crea', 'emater', 'embrapa', 'detran', 'der', 'dnit', 'ibge', 'sus', 'ctg', 'cdhu', 'cohab', 'bnh',
    'cecap', 'urbis', 'inocoop', 'ipase', 'iapi', 'abc', 'sesc', 'ufrj', 'uff', 'ufba', 'ufpe', 'ufpr', 'ufsc', 'ufrgs',
    'cmei', 'ymca', 'acia', 'cdl', 'ctn', 'ctgs', 'apm', 'gem', 'cer', 'ceac', 'ceat',
}

UFS = {'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ',
       'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'}

ROMANO = re.compile(r'^(?=[ivx]{2,}$)x{0,3}(?:ix|iv|v?i{0,3})$', re.I)
RODOVIA = re.compile(r'^(BR|AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO|ICR|SPA|'
                     r'RSC|ERS|AMG|LMG|CMG|PRC|BRS|VCL|GO)$', re.I)
SIGLA_PONTOS = re.compile(r'^(?:[A-Za-zÀ-ÿ]\.){2,}[A-Za-zÀ-ÿ]?$')
SIGLA_PADRAO = re.compile(r'^(IF[A-Z]{2,3}|UF[A-Z]{1,4}|UE[A-Z]{2,4}|UNI[A-Z]{1,2}|E{1,3}M?[IEFMBT]{1,5})$')
# palavras que casariam com o padrão de sigla de escola mas são palavras/nomes
NAO_SIGLA = {'emi', 'eme', 'ete', 'efe', 'emme', 'emma', 'unir', 'unia', 'unio', 'ufa'}
ETIQUETA_TSE = re.compile(r'[\s\-–]*\b(?:UE|LC|UN)\s*-\s*(?:MUN|EST|PTC|FED|PUB|PRIV)\s*$', re.I)

# token = palavra (letras, números, º ª, apóstrofo interno) ou separador
_L = '0-9A-Za-zÀ-ÖØ-öø-ÿºª'
TOKEN = re.compile(rf"[{_L}]+(?:['’][{_L}]+)*|[^{_L}]+?(?=[{_L}]|$)")


def _sem_vogal(w: str) -> bool:
    letras = [c for c in w.lower() if c.isalpha()]
    return len(letras) >= 2 and not any(c in VOGAIS for c in letras)


def _cap(w: str) -> str:
    w = w.lower()
    # apóstrofo: d'água → d'Água (no início da palavra), sant'ana → Sant'Ana
    m = re.match(r"^(d)['’](\w)(.*)$", w)
    if m:
        return f"D'{m.group(2).upper()}{m.group(3)}"
    w = w[:1].upper() + w[1:]
    return re.sub(r"(\w)['’](\w)", lambda x: f"{x.group(1)}'{x.group(2).upper()}", w)


def titulo(s: str, nome_local: bool = False) -> str:
    """Capitalização de exibição (ver regras no topo do arquivo)."""
    s = re.sub(r'\s+', ' ', s.replace(' ', ' ')).strip()
    if nome_local:
        s = ETIQUETA_TSE.sub('', s).strip(' -–')
    s = re.sub(r"\b([Dd])['’]\s+(?=\w)", r"\1'", s)  # "D' ÁGUA" → "D'ÁGUA"
    s = re.sub(r'\s+,', ',', s)
    s = re.sub(r',(?=[^\s\d])', ', ', s)
    toks = TOKEN.findall(s)
    palavras = [i for i, t in enumerate(toks) if t[0].isalnum() or t[0] in 'ºª']
    out = list(toks)
    # letras soltas seguidas de ponto, em sequência de 2+ ("E.E.", "E. M. E. F.")
    def letra_ponto(k: int) -> bool:
        i = palavras[k]
        return len(toks[i]) == 1 and toks[i].isalpha() and i + 1 < len(toks) and toks[i + 1].strip().startswith('.')
    sigla_pontos: set[int] = set()
    for k in range(len(palavras)):
        if letra_ponto(k) and ((k + 1 < len(palavras) and letra_ponto(k + 1)) or (k > 0 and letra_ponto(k - 1))):
            sigla_pontos.add(palavras[k])
    for pos, i in enumerate(palavras):
        t = toks[i]
        low = t.lower()
        prox = toks[i + 1] if i + 1 < len(toks) else ''
        ant = toks[i - 1] if i > 0 else ''
        prox_palavra = toks[palavras[pos + 1]] if pos + 1 < len(palavras) else ''
        ant_palavra = toks[palavras[pos - 1]].lower() if pos > 0 else ''
        com_ponto = prox.startswith('.')
        # 1. rodovia: sigla seguida de número (BR-101, RJ 160)
        if RODOVIA.match(t) and re.match(r'^[\s\-]*$', prox or 'x') and prox_palavra[:1].isdigit():
            out[i] = t.upper()
            continue
        # 2. sigla com pontos: E.E. / E.M.E.F. / "E. E." (2+ letras soltas seguidas de ponto)
        if i in sigla_pontos:
            out[i] = t.upper()
            continue
        # 3. abreviações (com ou sem ponto)
        if low in ABREVIATURAS and (com_ponto or low not in SIGLAS):
            if low in ('nsa',):
                out[i] = 'Nsa'
            else:
                out[i] = _cap(t)
            continue
        # 4. siglas conhecidas
        if low in SIGLAS or (SIGLA_PADRAO.match(t.upper()) and low not in NAO_SIGLA and not t.islower()):
            out[i] = t.upper()
            continue
        # 5. romanos
        if ROMANO.match(t):
            out[i] = t.upper()
            continue
        # 6. sem vogal
        if _sem_vogal(t) and not any(ch.isdigit() for ch in t):
            out[i] = t.upper()
            continue
        # 7. EM / E no início = sigla
        if pos == 0 and low in ('em', 'e') and nome_local:
            out[i] = t.upper()
            continue
        # 8. UF no fim depois de / ou -
        if t.upper() in UFS and ant.strip() in ('/', '-') and pos == len(palavras) - 1:
            out[i] = t.upper()
            continue
        # números e ordinais: maiúsculas (10A, 1º)
        if any(ch.isdigit() for ch in t):
            out[i] = t.upper()
            continue
        # 9. partículas
        if pos > 0 and low in PARTICULAS:
            seguido_de_palavra = bool(prox_palavra) and re.match(r'^\s+$', prox or '')
            if low == 'e' and (ant_palavra in ANTES_DE_LETRA or not seguido_de_palavra):
                out[i] = 'E'
            else:
                out[i] = low
            continue
        if pos > 0 and re.match(r"^d['’]", low) and len(low) > 2:
            out[i] = "d'" + low[2:3].upper() + low[3:]
            continue
        out[i] = _cap(t)
    r = ''.join(out)
    # "S/ N", "S/N." "SN" isolado (endereço) → "S/N"
    r = re.sub(r'\bS\s*/\s*N\b\.?', 'S/N', r, flags=re.I)
    r = re.sub(r'(?<=[\s,])SN(?=$|[\s,])', 'S/N', r)
    return r.strip()


def titulo_endereco(s: str) -> str:
    return titulo(s)


if __name__ == '__main__':
    casos = [
        ('EMEF SÃO FRANCISCO DE ASSIS', True, 'EMEF São Francisco de Assis'),
        ('EE PROFESSORA MARIA LOURDES MORAES COSTELA', True, 'EE Professora Maria Lourdes Moraes Costela'),
        ('E.E. PROF. JOÃO DA SILVA', True, 'E.E. Prof. João da Silva'),
        ('E.M.E.F. BENJAMIN CONSTANT', True, 'E.M.E.F. Benjamin Constant'),
        ('CMEI ELIZABETH EMERICH CAMPOS (CRECHE DO CANAÃ) - UE-MUN', True, 'CMEI Elizabeth Emerich Campos (Creche do Canaã)'),
        ('COLÉGIO SANTO ANTÔNIO - CENTRO CATEQUÉTICO - LC-PTC', True, 'Colégio Santo Antônio - Centro Catequético'),
        ('EM. PROF. JOÃO ARNALDO ANDREU AVELHANEDA', True, 'EM. Prof. João Arnaldo Andreu Avelhaneda'),
        ('CEU JAMBEIRO', True, 'CEU Jambeiro'),
        ('ESCOLA ESTADUAL PAPA JOÃO XXIII', True, 'Escola Estadual Papa João XXIII'),
        ('PSF ABEL DE REZENDE LARA', True, 'PSF Abel de Rezende Lara'),
        ('IFRN - INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA', True, 'IFRN - Instituto Federal de Educação, Ciência e Tecnologia'),
        ('EMEI. DONA HELENA', True, 'EMEI. Dona Helena'),
        ('RODOVIA MACAPA JARI BR 156 KM 132, S/N', False, 'Rodovia Macapa Jari BR 156 Km 132, S/N'),
        ('RUA L - CONJ. JD. BRASIL II', False, 'Rua L - Conj. Jd. Brasil II'),
        ('CONJUNTO SANTA MARIA, S/N - RUA D QD 8', False, 'Conjunto Santa Maria, S/N - Rua D Qd 8'),
        ('R. CEL. EDGARD, S/ N', False, 'R. Cel. Edgard, S/N'),
        ('AV. SEVERINO CABRAL SN', False, 'Av. Severino Cabral S/N'),
        ('RUA XV DE NOVEMBRO, 7152', False, 'Rua XV de Novembro, 7152'),
        ("OLHO D'ÁGUA DO BORGES", False, "Olho d'Água do Borges"),
        ('LAJEADO SAPOPEMA - SEGREDO/RS', False, 'Lajeado Sapopema - Segredo/RS'),
        ('RUA DA AREIA, 31, CENTRO, CAIÇARA-PB', False, 'Rua da Areia, 31, Centro, Caiçara-PB'),
        ('QUADRA E LOTE 5', False, 'Quadra E Lote 5'),
        ('ESTRADA RJ 160 KM 8', False, 'Estrada RJ 160 Km 8'),
        ('RODOVIA MT-010', False, 'Rodovia MT-010'),
        ('ZONA RURAL', False, 'Zona Rural'),
        ('CTG OS MARAGATOS', True, 'CTG Os Maragatos'),
        ('ESCOLA DE ENSINO INFANTIL E FUNDAMENTAL', True, 'Escola de Ensino Infantil e Fundamental'),
        ("COLÉGIO ESTADUAL PROFESSOR CARLOS SANT'ANNA", True, "Colégio Estadual Professor Carlos Sant'Anna"),
        ('UFCG - CAMPUS POMBAL', True, 'UFCG - Campus Pombal'),
        ('ESCOLA TÉCNICA ESTADUAL DRª RUTH CARDOSO- ETEC', True, 'Escola Técnica Estadual Drª Ruth Cardoso- ETEC'),
        ('E. E. EURICO GASPAR DUTRA', True, 'E. E. Eurico Gaspar Dutra'),
        ('TV. PEDRO GOMES, S/N', False, 'Tv. Pedro Gomes, S/N'),
        ('EMIEF. PROF. EMÍLIO SIMONETTI', True, 'EMIEF. Prof. Emílio Simonetti'),
        ('EEMTI IZAIAS GONÇALVES', True, 'EEMTI Izaias Gonçalves'),
        ('ESCOLA DE 1 E 2 GRAUS MIGUEL', True, 'Escola de 1 e 2 Graus Miguel'),
        ('RUA E, 123', False, 'Rua E, 123'),
        ('QD E LT 5', False, 'Qd E Lt 5'),
        ('ESCOLA MUNICIPAL ETELVINA', True, 'Escola Municipal Etelvina'),
        ('EMEFEI. JOÃO ETCHEBEHERE', True, 'EMEFEI. João Etchebehere'),
        ("SÍTIO OLHO D' ÁGUA", False, "Sítio Olho d'Água"),
        ("'ESCOLA DESATIVADA'", True, "'Escola Desativada'"),
        ("RUA 'A', 12", False, "Rua 'A', 12"),
    ]
    falhas = 0
    for entrada, local, esperado in casos:
        obtido = titulo(entrada, local)
        if obtido != esperado:
            falhas += 1
            print(f'FALHA  {entrada!r}\n  obtido   {obtido!r}\n  esperado {esperado!r}')
    print(f'{len(casos) - falhas}/{len(casos)} ok')
    raise SystemExit(1 if falhas else 0)
