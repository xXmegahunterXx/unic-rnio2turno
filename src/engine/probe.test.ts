/**
 * Sondagem adversarial do motor: percorre a noite inteira (16:59 → 23:00, passos de 1 min simulado) com o
 * preset padrão e confere, em TODOS os níveis, a cada passo:
 *  - invariantes de contagem (votos+brancos+nulos = comparecimento, comparecimento+abstenção = eleitorado
 *    totalizado, status coerente) e somas (seções → zona → município → UF → região/Brasil);
 *  - monotonicidade (seções, eleitorado totalizado, comparecimento, votos, brancos e nulos nunca diminuem;
 *    seção totalizada nunca "destotaliza" nem muda de números);
 *  - regra de "eleito" (exata, nos dois sentidos), que nunca some depois de aparecer e sempre aponta o
 *    vencedor final (prova empírica de que não aparece cedo demais);
 *  - série (t e pst não decrescentes, pst = 100 só com 100%, termina em 100) e feed (só cresce; evento
 *    "eleito" ⇔ Summary.eleito).
 * Os erros são acumulados (sem `expect` no laço quente) e comparados com [] ao fim de cada bloco.
 */
import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '../shared/constants';
import type {
  FeedEvent,
  NationalSnapshot,
  Regiao,
  SeriePoint,
  Summary,
  UF,
  ZonaMosaico,
} from '../shared/types';
import { UF_REGIAO } from '../shared/constants';
import { createController } from './controller';
import { estadoMosaico } from './snapshots';
import { triple32 } from './rng';
import { dataset, relogio } from './tests/helpers';

const INI = INICIO_APURACAO;
const ds = await dataset();
const GOVS = ['gov-ac', 'gov-am', 'gov-df', 'gov-es', 'gov-rj', 'gov-rn', 'gov-to'];
const UFS_MUN: UF[] = ['AC', 'RJ', 'ZZ']; // todos os municípios (snapshot de município + zonas)
const SP_CAPITAL = '71072';

type Errs = string[];
const MAX_ERRS = 200;
const err = (e: Errs, msg: string) => {
  if (e.length < MAX_ERRS) e.push(msg);
};

/** Invariantes de uma contagem de 2º turno (2 candidatos) + regra exata de líder/eleito. */
function checaSummary(s: Summary, ctx: string, e: Errs): void {
  const [a, b] = s.votos;
  if (s.votos.length !== 2) err(e, `${ctx}: ${s.votos.length} candidatos`);
  for (const [k, v] of Object.entries({
    a,
    b,
    brancos: s.brancos,
    nulos: s.nulos,
    comparecimento: s.comparecimento,
    abstencao: s.abstencao,
    secoesTotalizadas: s.secoesTotalizadas,
    eleitoradoTotalizado: s.eleitoradoTotalizado,
  }))
    if (!Number.isInteger(v) || v < 0) err(e, `${ctx}: ${k} = ${v}`);
  if (a + b + s.brancos + s.nulos !== s.comparecimento) err(e, `${ctx}: votos+brancos+nulos ≠ comparecimento`);
  if (s.comparecimento + s.abstencao !== s.eleitoradoTotalizado) err(e, `${ctx}: comp+abst ≠ eleitoradoTotalizado`);
  if (s.secoesTotalizadas > s.secoes) err(e, `${ctx}: secoesTotalizadas > secoes`);
  if (s.eleitoradoTotalizado > s.eleitorado) err(e, `${ctx}: eleitoradoTotalizado > eleitorado`);
  const status = s.secoesTotalizadas === 0 ? 'aguardando' : s.secoesTotalizadas === s.secoes ? 'encerrada' : 'apurando';
  if (s.status !== status) err(e, `${ctx}: status ${s.status} ≠ ${status}`);
  if (s.secoesTotalizadas === s.secoes && s.eleitoradoTotalizado !== s.eleitorado)
    err(e, `${ctx}: 100% das seções mas eleitoradoTotalizado ${s.eleitoradoTotalizado} ≠ ${s.eleitorado}`);
  if ((s.secoesTotalizadas === 0) !== (s.ultimaAtualizacao === null)) err(e, `${ctx}: ultimaAtualizacao incoerente`);
  const lider = a > b ? 0 : b > a ? 1 : null;
  if (s.lider !== lider) err(e, `${ctx}: lider ${s.lider} ≠ ${lider}`);
  // Regra (ARCHITECTURE §5.2): diferença > eleitorado não totalizado, ou apuração encerrada.
  const restante = s.eleitorado - s.eleitoradoTotalizado;
  const eleito = lider !== null && (Math.abs(a - b) > restante || s.status === 'encerrada') ? lider : null;
  if (s.eleito !== eleito) err(e, `${ctx}: eleito ${s.eleito} ≠ regra ${eleito} (dif ${Math.abs(a - b)}, restante ${restante})`);
}

const CAMPOS = ['secoes', 'secoesTotalizadas', 'eleitorado', 'eleitoradoTotalizado', 'comparecimento', 'abstencao', 'brancos', 'nulos'] as const;

/** Soma das partes = total, campo a campo (+ votos e última atualização = máximo). */
function checaSoma(partes: Summary[], total: Summary, ctx: string, e: Errs): void {
  for (const c of CAMPOS) {
    let s = 0;
    for (const p of partes) s += p[c];
    if (s !== total[c]) err(e, `${ctx}: soma de ${c} ${s} ≠ ${total[c]}`);
  }
  for (let i = 0; i < total.votos.length; i++) {
    let s = 0;
    for (const p of partes) s += p.votos[i];
    if (s !== total.votos[i]) err(e, `${ctx}: soma de votos[${i}] ${s} ≠ ${total.votos[i]}`);
  }
  let ult: number | null = null;
  for (const p of partes) if (p.ultimaAtualizacao !== null && (ult === null || p.ultimaAtualizacao > ult)) ult = p.ultimaAtualizacao;
  if (ult !== total.ultimaAtualizacao) err(e, `${ctx}: ultimaAtualizacao ${ult} ≠ ${total.ultimaAtualizacao}`);
}

function igualSummary(a: Summary, b: Summary, ctx: string, e: Errs): void {
  for (const c of [...CAMPOS, 'status', 'lider', 'eleito', 'ultimaAtualizacao'] as const)
    if (a[c] !== b[c]) err(e, `${ctx}: ${c} ${String(a[c])} ≠ ${String(b[c])}`);
  if (a.votos.join() !== b.votos.join()) err(e, `${ctx}: votos ${a.votos} ≠ ${b.votos}`);
}

/** Estado acumulado entre passos: monotonicidade e "eleito nunca some". */
class Historico {
  private prev = new Map<string, number[]>();
  private eleito = new Map<string, number>();
  /** primeiro instante em que cada escopo teve eleito (para conferir contra o vencedor final) */
  readonly primeiroEleito = new Map<string, { cand: number; t: number }>();
  readonly ultimo = new Map<string, Summary>();

  passa(s: Summary, key: string, t: number, e: Errs): void {
    const cur = [s.secoesTotalizadas, s.eleitoradoTotalizado, s.comparecimento, s.votos[0], s.votos[1], s.brancos, s.nulos];
    const p = this.prev.get(key);
    if (p) for (let i = 0; i < cur.length; i++) if (cur[i] < p[i]) err(e, `${key}: campo ${i} diminuiu (${p[i]} → ${cur[i]})`);
    this.prev.set(key, cur);
    const el = this.eleito.get(key);
    if (el !== undefined && s.eleito !== el) err(e, `${key}: eleito sumiu/mudou (${el} → ${s.eleito})`);
    if (s.eleito !== null && el === undefined) {
      this.eleito.set(key, s.eleito);
      this.primeiroEleito.set(key, { cand: s.eleito, t });
    }
    this.ultimo.set(key, s);
  }
}

function checaSerie(serie: SeriePoint[], resumo: Summary, ctx: string, e: Errs, anterior?: SeriePoint[]): void {
  for (let i = 0; i < serie.length; i++) {
    const p = serie[i];
    if (i > 0 && (p.t < serie[i - 1].t || p.pst < serie[i - 1].pst)) err(e, `${ctx}: série não monotônica em ${i}`);
    if (!(p.pst >= 0 && p.pst <= 100)) err(e, `${ctx}: pst fora de [0, 100]: ${p.pst}`);
    if (Math.round((p.pv[0] + p.pv[1]) * 100) !== 10000) err(e, `${ctx}: pv não soma 100 (${p.pv})`);
  }
  if (resumo.secoesTotalizadas === 0) {
    if (serie.length) err(e, `${ctx}: série com pontos antes da 1ª seção`);
    return;
  }
  const last = serie[serie.length - 1];
  if (!last) return err(e, `${ctx}: série vazia com seções totalizadas`);
  const real = (100 * resumo.secoesTotalizadas) / resumo.secoes;
  if (last.pst > real + 1e-9 || real - last.pst >= 0.01 + 1e-9) err(e, `${ctx}: último pst ${last.pst} ≠ ${real}`);
  if (last.t !== resumo.ultimaAtualizacao) err(e, `${ctx}: último t ≠ ultimaAtualizacao`);
  const completo = resumo.secoesTotalizadas === resumo.secoes;
  for (const p of serie) if (p.pst === 100 && !completo) err(e, `${ctx}: pst = 100 com ${real.toFixed(5)}% das seções`);
  if (completo && last.pst !== 100) err(e, `${ctx}: completo mas a série termina em ${last.pst}`);
  // os pontos "históricos" (todos menos o último, que pode ser o ponto ao vivo) persistem no passo seguinte
  if (anterior && anterior.length > 1) {
    const n = anterior.length - 1;
    for (let i = 0; i < n; i++) {
      const a = anterior[i];
      const b = serie[i];
      if (!b || a.t !== b.t || a.pst !== b.pst || a.pv[0] !== b.pv[0]) {
        err(e, `${ctx}: ponto histórico ${i} mudou`);
        break;
      }
    }
  }
}

function checaEventos(evs: FeedEvent[], tq: number, resumo: Summary, ctx: string, e: Errs, anterior?: FeedEvent[]): void {
  if (evs.length > 60) err(e, `${ctx}: ${evs.length} eventos (> 60)`);
  for (let i = 0; i < evs.length; i++) {
    if (evs[i].t > tq) err(e, `${ctx}: evento do futuro ${evs[i].id}`);
    if (i > 0 && evs[i].t > evs[i - 1].t) err(e, `${ctx}: feed fora de ordem em ${i}`);
  }
  if (new Set(evs.map((x) => x.id)).size !== evs.length) err(e, `${ctx}: ids repetidos`);
  if (anterior) {
    const ids = new Set(evs.map((x) => x.id));
    const lim = evs.length >= 60 ? 0 : anterior.length; // com 60 o mais antigo pode sair
    for (let i = 0; i < Math.min(lim, anterior.length); i++)
      if (!ids.has(anterior[i].id)) err(e, `${ctx}: evento ${anterior[i].id} sumiu`);
  }
  const ev = evs.find((x) => x.tipo === 'eleito');
  if (ev && resumo.eleito === null) err(e, `${ctx}: evento "eleito" sem Summary.eleito`);
  if (!ev && resumo.eleito !== null && evs.length < 60) err(e, `${ctx}: Summary.eleito sem evento "eleito"`);
  if (ev && ev.candidato !== resumo.eleito) err(e, `${ctx}: evento eleito ${ev.candidato} ≠ ${resumo.eleito}`);
}

describe('sondagem: noite inteira, 1 min simulado por passo, preset padrão', () => {
  it('invariantes, monotonicidade, "eleito", série e feed em todos os níveis', { timeout: 600_000 }, () => {
    const r = relogio(Date.UTC(2026, 9, 25, 12, 0));
    const c = createController(ds, { modo: 'demo', now: r.now });
    c.command({ tipo: 'relogio', acao: 'pausar' });
    expect(c.state().cenario.preset).toBe('padrao');
    const fim = c.fimPrevisto()!;
    expect(fim).toBeLessThanOrEqual(INI + 5 * 3600_000); // 100% até 22:00

    const e: Errs = [];
    const h = new Historico();
    const regDe = (uf: UF) => UF_REGIAO[uf];

    // 50 seções "aleatórias" (determinísticas) espalhadas pelo país
    const todas: [UF, string, number, number][] = [];
    for (const u of ds.meta.ufs)
      for (const m of ds.ufs[u.uf]!.municipios)
        for (const z of m.zonas) {
          const nums = z.s.split(',')[0].split('-').map(Number);
          todas.push([u.uf, m.cod, z.z, nums[0]]);
        }
    const amostra = Array.from({ length: 50 }, (_, i) => todas[triple32(i + 977) % todas.length]);
    const secPrev = new Map<string, string>();

    let antNac: NationalSnapshot | null = null;
    const antSerie = new Map<string, SeriePoint[]>();
    const antEv = new Map<string, FeedEvent[]>();
    let passos = 0;
    let completoEm: number | null = null;

    for (let T = INI - 60_000; T <= INI + 6 * 3600_000; T += 60_000) {
      passos++;
      c.command({ tipo: 'saltar-tempo', simNow: T });
      const st = c.status();
      if (st.simNow !== T) err(e, `${T}: status.simNow ${st.simNow}`);
      const fase = T < INI ? 'pre' : T >= fim + 5 * 60_000 ? 'encerrada' : 'apurando';
      if (st.fase !== fase) err(e, `${T}: fase ${st.fase} ≠ ${fase}`);

      // ---- Brasil, regiões, UFs, municípios (Presidente) ----
      const nac = c.nacional('pres');
      if (nac.simNow !== T) err(e, `${T}: nacional.simNow ${nac.simNow}`);
      checaSummary(nac.resumo, `BR@${T}`, e);
      h.passa(nac.resumo, 'BR', T, e);
      const ufsRes = Object.entries(nac.ufs) as [UF, Summary][];
      if (ufsRes.length !== 28) err(e, `${T}: ${ufsRes.length} UFs`);
      checaSoma(ufsRes.map(([, s]) => s), nac.resumo, `UFs→BR@${T}`, e);
      const regs = Object.entries(nac.regioes) as [Regiao, Summary][];
      if (regs.length !== 6) err(e, `${T}: ${regs.length} regiões`);
      checaSoma(regs.map(([, s]) => s), nac.resumo, `regiões→BR@${T}`, e);
      for (const [rg, s] of regs) {
        checaSummary(s, `${rg}@${T}`, e);
        h.passa(s, `reg:${rg}`, T, e);
        checaSoma(ufsRes.filter(([uf]) => regDe(uf) === rg).map(([, x]) => x), s, `UFs→${rg}@${T}`, e);
      }
      checaSerie(nac.serie, nac.resumo, `serie BR@${T}`, e, antSerie.get('BR'));
      antSerie.set('BR', nac.serie);
      checaEventos(nac.eventos, T, nac.resumo, `feed BR@${T}`, e, antEv.get('BR'));
      antEv.set('BR', nac.eventos);
      if (antNac && nac.eventos.length < antNac.eventos.length) err(e, `${T}: feed nacional encolheu`);
      if (T < INI && (nac.eventos.length || nac.resumo.secoesTotalizadas)) err(e, `${T}: dados antes das 17h`);
      if (T >= INI && !nac.eventos.some((x) => x.tipo === 'inicio')) err(e, `${T}: sem evento de início`);
      antNac = nac;

      for (const [uf, s] of ufsRes) {
        checaSummary(s, `${uf}@${T}`, e);
        h.passa(s, `uf:${uf}`, T, e);
        const us = c.uf('pres', uf);
        igualSummary(us.resumo, s, `uf(${uf}).resumo@${T}`, e);
        checaSoma(us.municipios, us.resumo, `mun→${uf}@${T}`, e);
        for (const m of us.municipios) {
          checaSummary(m, `${uf}/${m.cod}@${T}`, e);
          h.passa(m, `mun:${uf}/${m.cod}`, T, e);
        }
        checaSerie(us.serie, us.resumo, `serie ${uf}@${T}`, e, antSerie.get(uf));
        antSerie.set(uf, us.serie);
        if (us.eventos.length > 60) err(e, `${uf}@${T}: ${us.eventos.length} eventos`);
        for (const ev of us.eventos) if (ev.t > T) err(e, `${uf}@${T}: evento do futuro`);

        if (UFS_MUN.includes(uf)) {
          for (const mr of us.municipios) {
            const ms = c.municipio('pres', uf, mr.cod);
            igualSummary(ms.resumo, mr, `municipio(${uf}/${mr.cod})@${T}`, e);
            checaSoma(ms.zonas, ms.resumo, `zonas→${uf}/${mr.cod}@${T}`, e);
            checaMosaico(ms.mosaico, ms.zonas, `${uf}/${mr.cod}@${T}`, e);
            for (const z of ms.zonas) {
              checaSummary(z, `${uf}/${mr.cod}/z${z.zona}@${T}`, e);
              h.passa(z, `zona:${uf}/${mr.cod}/${z.zona}`, T, e);
            }
          }
        }
      }

      // ---- zonas de São Paulo (capital): seções → zona; mosaico seção a seção ----
      const msp = c.municipio('pres', 'SP', SP_CAPITAL);
      checaSoma(msp.zonas, msp.resumo, `zonas→SP capital@${T}`, e);
      for (let zi = 0; zi < msp.zonas.length; zi++) {
        const zr = msp.zonas[zi];
        const zs = c.zona('pres', 'SP', SP_CAPITAL, zr.zona);
        igualSummary(zs.resumo, zr, `zona(${zr.zona}).resumo@${T}`, e);
        checaSummary(zs.resumo, `SP/${SP_CAPITAL}/z${zr.zona}@${T}`, e);
        h.passa(zs.resumo, `zona:SP/${SP_CAPITAL}/${zr.zona}`, T, e);
        const partes: Summary[] = zs.secoes.map((s) => ({
          secoes: 1,
          secoesTotalizadas: s.totalizada ? 1 : 0,
          eleitorado: s.aptos,
          eleitoradoTotalizado: s.totalizada ? s.aptos : 0,
          comparecimento: s.comparecimento,
          abstencao: s.totalizada ? s.aptos - s.comparecimento : 0,
          votos: s.votos,
          brancos: s.brancos,
          nulos: s.nulos,
          status: 'apurando',
          lider: null,
          eleito: null,
          ultimaAtualizacao: s.totalizadaEm,
        }));
        checaSoma(partes, zs.resumo, `seções→z${zr.zona}@${T}`, e);
        const mos = msp.mosaico[zi];
        let est = '';
        for (const s of zs.secoes) {
          if (s.totalizada !== (s.totalizadaEm !== null && s.totalizadaEm <= T)) err(e, `seção ${zr.zona}/${s.secao}@${T}: totalizada incoerente`);
          if (s.comparecimento > s.aptos) err(e, `seção ${zr.zona}/${s.secao}: comparecimento > aptos`);
          est += s.totalizada ? String.fromCharCode(estadoMosaico(s.votos[0], s.votos[1])) : '0';
        }
        if (mos.zona !== zr.zona || mos.estado !== est) err(e, `mosaico z${zr.zona}@${T} ≠ seções`);
      }

      // ---- 50 seções ----
      for (const [uf, cod, z, n] of amostra) {
        const d = c.secao('pres', uf, cod, z, n);
        const key = `${uf}/${cod}/${z}/${n}`;
        if (!d) {
          err(e, `seção ${key}: null`);
          continue;
        }
        if (d.votos[0] + d.votos[1] + d.brancos + d.nulos !== d.comparecimento) err(e, `seção ${key}: soma`);
        if (d.totalizada !== (d.totalizadaEm !== null && d.totalizadaEm <= T)) err(e, `seção ${key}@${T}: totalizada incoerente`);
        if (!d.totalizada && (d.comparecimento || d.abstencao || d.votos[0] || d.votos[1])) err(e, `seção ${key}: números antes de totalizar`);
        if (d.totalizada && d.abstencao !== d.aptos - d.comparecimento) err(e, `seção ${key}: abstenção`);
        const sig = JSON.stringify([d.totalizada, d.totalizadaEm, d.aptos, d.comparecimento, d.votos, d.brancos, d.nulos, d.codigoIdentificacao]);
        const p = secPrev.get(key);
        if (p && JSON.parse(p)[0] && p !== sig) err(e, `seção ${key}@${T}: mudou depois de totalizada`);
        secPrev.set(key, sig);
      }

      // ---- governadores ----
      for (const g of GOVS) {
        const uf = g.slice(4).toUpperCase() as UF;
        const gn = c.nacional(g);
        checaSummary(gn.resumo, `${g}@${T}`, e);
        h.passa(gn.resumo, g, T, e);
        const pu = nac.ufs[uf]!;
        if (
          gn.resumo.comparecimento !== pu.comparecimento ||
          gn.resumo.eleitoradoTotalizado !== pu.eleitoradoTotalizado ||
          gn.resumo.secoesTotalizadas !== pu.secoesTotalizadas
        )
          err(e, `${g}@${T}: comparecimento/seções ≠ Presidente na UF`);
        checaSerie(gn.serie, gn.resumo, `serie ${g}@${T}`, e, antSerie.get(g));
        antSerie.set(g, gn.serie);
        checaEventos(gn.eventos, T, gn.resumo, `feed ${g}@${T}`, e, antEv.get(g));
        antEv.set(g, gn.eventos);
        const gu = c.uf(g, uf);
        igualSummary(gu.resumo, gn.resumo, `uf(${g})@${T}`, e);
        checaSoma(gu.municipios, gu.resumo, `${g} mun→UF@${T}`, e);
        for (const m of gu.municipios) {
          checaSummary(m, `${g}/${m.cod}@${T}`, e);
          h.passa(m, `${g}/mun:${m.cod}`, T, e);
        }
      }
      if (completoEm === null && nac.resumo.status === 'encerrada') completoEm = T;
      if (e.length >= MAX_ERRS) break;
    }

    expect(e).toEqual([]);
    expect(passos).toBe(362);
    expect(completoEm).not.toBeNull();

    // ---- fim da noite: tudo totalizado; "eleito" sempre apontou o vencedor final ----
    const fimErrs: Errs = [];
    for (const [key, s] of h.ultimo) {
      if (s.status !== 'encerrada') fimErrs.push(`${key}: não encerrou`);
      const pe = h.primeiroEleito.get(key);
      if (s.lider !== null && !pe) fimErrs.push(`${key}: sem eleito ao fim`);
      if (pe && pe.cand !== s.lider) fimErrs.push(`${key}: eleito em ${pe.t} foi ${pe.cand}, vencedor final ${s.lider}`);
    }
    expect(fimErrs).toEqual([]);
    const serieBr = c.nacional('pres').serie;
    expect(serieBr.at(-1)!.pst).toBe(100);
    console.info(
      `[sondagem] ${passos} passos · ${h.ultimo.size} escopos · eleito BR em ` +
        `${new Date(h.primeiroEleito.get('BR')!.t - 3 * 3600_000).toISOString().slice(11, 19)} (BRT) · 100% às ` +
        `${new Date(completoEm! - 3 * 3600_000).toISOString().slice(11, 16)}`,
    );
  });
});

function checaMosaico(mos: ZonaMosaico[], zonas: Summary[] & { zona: number }[], ctx: string, e: Errs): void {
  if (mos.length !== zonas.length) err(e, `${ctx}: mosaico com ${mos.length} zonas, resumo com ${zonas.length}`);
  for (let i = 0; i < mos.length; i++) {
    const m = mos[i];
    const z = zonas[i];
    if (m.zona !== z.zona) err(e, `${ctx}: mosaico zona ${m.zona} ≠ ${z.zona}`);
    if (m.estado.length !== z.secoes) err(e, `${ctx}/z${z.zona}: mosaico com ${m.estado.length} seções ≠ ${z.secoes}`);
    let tot = 0;
    for (let j = 0; j < m.estado.length; j++) {
      const ch = m.estado.charCodeAt(j);
      if (ch !== 48) tot++;
      if (!((ch >= 97 && ch <= 104) || ch === 48 || ch === 120 || ch === 122)) err(e, `${ctx}: caractere inválido`);
    }
    if (tot !== z.secoesTotalizadas) err(e, `${ctx}/z${z.zona}: mosaico ${tot} totalizadas ≠ ${z.secoesTotalizadas}`);
  }
}
