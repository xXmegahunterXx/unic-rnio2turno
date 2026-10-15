/**
 * Barreira contra anúncio político-eleitoral (ARCHITECTURE §1.5): além da declaração obrigatória do admin
 * (`naoPolitico`), o texto e o destino do anúncio passam por uma checagem objetiva. Usada por `validaAnuncio`
 * (src/shared/anuncios.ts), então vale no painel, no zod do servidor e no motor (que também passa os nomes dos
 * candidatos do dataset).
 *
 * Recusa:
 *  - nomes de candidatos (os do dataset + "Lula" e "Bolsonaro"), como frase inteira, sem diferenciar acento/caixa;
 *  - termos eleitorais ("vote", "eleja", "candidato", "partido", "coligação", "eleitoral", "petista"…) e número de urna
 *    pedido como voto ("vote 13", "digite 22", "22 confirma");
 *  - siglas de partido como palavra inteira e em maiúsculas ("PT", "PL", "PSOL"…: "pt-br" num link não conta);
 *  - destino em domínio de governo, Legislativo, Judiciário ou Ministério Público (*.gov.br, *.leg.br, *.jus.br,
 *    *.mp.br…: publicidade institucional é proibida nos 3 meses antes da eleição — Lei 9.504/97, art. 73, VI, b), site
 *    de partido (pt.org.br, pl22.org.br…) ou domínio com nome de candidato (lula.com.br, flaviobolsonaro.com.br…).
 *
 * Conservador de propósito: um falso positivo só pede outra redação ao admin; um falso negativo poria propaganda
 * política paga no ar. A declaração continua obrigatória (nenhuma lista é completa).
 */

/** Minúsculas, sem acento, só letras/números separados por um espaço. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Nomes sempre recusados (os candidatos do dataset entram pelo parâmetro `nomes`). */
const NOMES_FIXOS = ['Lula', 'Bolsonaro'];

/** Termos eleitorais (sobre o texto normalizado). O 2º item é o que a mensagem mostra. */
const TERMOS: readonly [RegExp, string][] = [
  [/\bvot(e|em|ar|ando|ou)\b/, 'vote'],
  [/\b(seu|teu|meu|nosso|o) voto\b|\bvoto (em|no|na|util|nulo|branco|consciente)\b/, 'voto'],
  [/\b(re)?elej(a|am|e|em)\b|\breeleg\w*|\breeleica?o\b|\breeleicoes\b/, 'eleja'],
  [/\beleitora(l|is)\b/, 'eleitoral'],
  [/\bcandidat(o|a|os|as|ura|uras)\b/, 'candidato'],
  [/\bpartidos?\b|\bpartidari(o|a|os|as)\b/, 'partido'],
  [/\bcoligac(ao|oes)\b|\bfederacao partidaria\b/, 'coligação'],
  [/\b(campanha|propaganda) politica\b/, 'propaganda política'],
  [/\b(lul|bolsonar|pet)ist(a|as)\b|\b(lul|bolsonar|pet)ismo\b|\bantipet\w*/, 'termo partidário'],
  // número de urna pedido como voto: "vote 13", "vote no 22", "digite 13", "número 22", "22 confirma"
  [/\b(vote|votem|votar|voto|digite|digitem|tecle|teclem|aperte|apertem|numero)( (no|na|o|a|em))? \d{2,5}\b|\b\d{2,5}( e)? confirm(a|e|ar|em)\b/, 'número de urna'],
];

/** Siglas de partido (maiúsculas, palavra inteira, no texto original). */
const RE_SIGLAS = /(?:^|[^A-Za-z0-9À-ÿ])(PT|PL|MDB|PSDB|PSD|PDT|PSB|PSOL|PCdoB|PCDOB|PV|PP|PRTB|PCO|PSTU|PCB|PRD|PMB)(?=$|[^A-Za-z0-9À-ÿ])/;

/** Domínios de partido: <sigla>[número].org.br */
const PARTIDOS_DOMINIO = new Set([
  'pt', 'pl', 'mdb', 'psdb', 'psd', 'pdt', 'psb', 'psol', 'pcdob', 'pv', 'pp', 'progressistas', 'novo', 'rede',
  'redesustentabilidade', 'uniao', 'uniaobrasil', 'podemos', 'republicanos', 'cidadania', 'avante', 'solidariedade',
  'agir', 'dc', 'democraciacrista', 'pmb', 'prtb', 'pco', 'pstu', 'up', 'pcb', 'prd', 'mobiliza', 'missao',
]);

/** Domínios públicos (publicidade institucional): *.gov.br, *.leg.br, *.jus.br, *.mp.br, *.mil.br, *.def.br, *.gov */
const RE_DOMINIO_PUBLICO = /(^|\.)(gov|leg|jus|mp|mil|def)\.br$|(^|\.)gov$/;

export interface CampoAnuncioPolitica {
  campo: string;
  valor: string;
}

/** Nomes (do dataset + fixos) prontos para busca: frase normalizada (≥ 4 letras) e forma compacta para domínios. */
function prepararNomes(nomes: readonly string[]): { frase: string; compacto: string }[] {
  const vistos = new Set<string>();
  const out: { frase: string; compacto: string }[] = [];
  for (const n of [...NOMES_FIXOS, ...nomes]) {
    const frase = normalizarTexto(n);
    if (frase.replace(/ /g, '').length < 4 || vistos.has(frase)) continue;
    vistos.add(frase);
    out.push({ frase, compacto: frase.replace(/ /g, '') });
  }
  return out;
}

/** Destino do anúncio: domínio público, de partido ou com nome de candidato → motivo; senão null. */
function destinoPolitico(url: string, nomes: { frase: string; compacto: string }[]): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  if (RE_DOMINIO_PUBLICO.test(host)) return 'site de governo, Legislativo, Judiciário ou Ministério Público';
  const rotulos = host.split('.');
  if (host.endsWith('.org.br') && rotulos.length >= 3) {
    const sigla = rotulos[rotulos.length - 3].replace(/\d+$/, '');
    if (PARTIDOS_DOMINIO.has(sigla)) return 'site de partido';
  }
  const partes = host.split(/[.-]/);
  const compacto = host.replace(/[.-]/g, '');
  for (const n of nomes) {
    if (partes.includes(n.compacto) || (n.compacto.length >= 8 && compacto.includes(n.compacto))) return 'site com nome de candidato';
  }
  return null;
}

/**
 * Conteúdo político-eleitoral no anúncio? Devolve a mensagem de recusa (com o termo e o campo) ou null.
 * `campos`: os textos exibidos (marca, título, texto, botão); `url`: o destino; `nomes`: nomes de candidatos do dataset.
 */
export function motivoPolitico(campos: readonly CampoAnuncioPolitica[], url: string, nomes: readonly string[] = []): string | null {
  const lista = prepararNomes(nomes);
  const recusa = (o: string, onde: string) =>
    `Anúncio recusado: o Sintonia não aceita conteúdo político-eleitoral (${o} ${onde}). Reescreva sem nomes, números, siglas ou termos de eleição.`;

  const destino = destinoPolitico(url, lista);
  if (destino) return recusa(`link para ${destino}`, 'no destino');

  // o caminho do link também conta ("…/vote-13", "linktr.ee/lula"); a sigla em maiúsculas, não ("/pt-br/")
  let caminho = '';
  try {
    const u = new URL(url);
    caminho = decodeURIComponent(`${u.pathname} ${u.search}`);
  } catch {
    /* url inválida já foi recusada antes */
  }
  const textos: CampoAnuncioPolitica[] = [...campos, { campo: 'link', valor: caminho }];
  for (const { campo, valor } of textos) {
    const t = ` ${normalizarTexto(valor)} `;
    if (t.trim() === '') continue;
    for (const n of lista) if (t.includes(` ${n.frase} `)) return recusa(`nome de candidato`, `em "${campo}"`);
    for (const [re, rotulo] of TERMOS) if (re.test(t)) return recusa(`termo "${rotulo}"`, `em "${campo}"`);
    if (campo !== 'link') {
      const m = RE_SIGLAS.exec(valor);
      if (m) return recusa(`sigla de partido "${m[1]}"`, `em "${campo}"`);
    }
  }
  return null;
}
