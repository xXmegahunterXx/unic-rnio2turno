/**
 * Baixa as malhas territoriais do IBGE (API de malhas v4, TopoJSON) para data-raw/ibge/ (cache bruto,
 * ignorado pelo git). Depois rode `tsx scripts/data/build-geo.ts`.
 *
 * Por que v4 e não v3: a v3 serve a malha de 2022 (5.570 municípios) e não tem Boa Esperança do Norte (MT,
 * 5101837), instalado depois e presente no cadastro do TSE de 2026. A v4 serve a malha vigente (5.571).
 *
 *   paises/BR?intrarregiao=UF            → data-raw/ibge/br-uf.topo.json     (27 UFs, mapa nacional)
 *   estados/{UF}?intrarregiao=municipio  → data-raw/ibge/mun/{uf}.topo.json  (municípios por UF)
 *   TSE mun-e006257-cm.json              → data-raw/ibge/tse-mun-e006257-cm.json (conferência de cobertura)
 *
 * Uso: tsx scripts/data/fetch-ibge.ts [--force]
 */
import { join } from 'node:path';
import { UFS } from '../../src/shared/types';
import { comLimite, fetchCached, validarJson } from './geo-lib/http';

const RAIZ = join(import.meta.dirname, '..', '..');
export const DIR_IBGE = join(RAIZ, 'data-raw', 'ibge');

const API = 'https://servicodados.ibge.gov.br/api/v4/malhas';
const TOPO = 'formato=application/json'; // TopoJSON (arcos compartilhados: fronteiras sem frestas)
export const QUALIDADE = 'maxima'; // a simplificação é nossa (build-geo), então partimos do mais detalhado

export const URL_TSE_MUN = 'https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json';

export const fontes = {
  brUf: { url: `${API}/paises/BR?intrarregiao=UF&${TOPO}&qualidade=${QUALIDADE}`, dest: join(DIR_IBGE, 'br-uf.topo.json') },
  mun: (uf: string) => ({
    url: `${API}/estados/${uf.toUpperCase()}?intrarregiao=municipio&${TOPO}&qualidade=${QUALIDADE}`,
    dest: join(DIR_IBGE, 'mun', `${uf.toLowerCase()}.topo.json`),
  }),
  tseMun: { url: URL_TSE_MUN, dest: join(DIR_IBGE, 'tse-mun-e006257-cm.json') },
};

function validarTopologia(texto: string) {
  const t = JSON.parse(texto);
  if (t?.type !== 'Topology' || !t.objects || !Array.isArray(t.arcs)) throw new Error('resposta não é TopoJSON');
}

async function main() {
  const force = process.argv.includes('--force');
  const t0 = Date.now();
  console.log(`IBGE malhas v4 (${QUALIDADE}) → ${DIR_IBGE}${force ? ' [--force]' : ''}`);

  const tarefas: (() => Promise<void>)[] = [
    async () => {
      await fetchCached(fontes.brUf.url, fontes.brUf.dest, { force, validar: validarTopologia });
      console.log('  ✓ Brasil por UF');
    },
    async () => {
      await fetchCached(fontes.tseMun.url, fontes.tseMun.dest, { force, validar: validarJson });
      console.log('  ✓ municípios do TSE (cobertura)');
    },
    ...UFS.map((uf) => async () => {
      const f = fontes.mun(uf);
      const txt = await fetchCached(f.url, f.dest, { force, validar: validarTopologia });
      console.log(`  ✓ ${uf} municípios (${(txt.length / 1024).toFixed(0)} KB)`);
    }),
  ];
  await comLimite(6, tarefas);
  console.log(`Pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
