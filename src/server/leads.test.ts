import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITES_LEAD, TEXTOS_CONSENTIMENTO, VERSAO_CONSENTIMENTO } from '../shared/leads';
import { Leads } from './leads';
import { createJsonStore } from './state-store';

const AGORA = Date.UTC(2026, 9, 15, 15, 0, 0);
const PEDIDO = (i = 1, extra: Record<string, unknown> = {}) => ({
  nome: `Pessoa ${i}`,
  empresa: `Empresa ${i}`,
  email: `contato${i}@empresa${i}.com.br`,
  whatsapp: '(11) 99999-0000',
  formatos: ['topo', 'chat'],
  mensagem: `Quero anunciar ${i}`,
  consentimento: true,
  site: '',
  ms: 12_000,
  ...extra,
});

function montar(o: { dir?: string; max?: number } = {}) {
  const relogio = { t: AGORA };
  const store = o.dir ? createJsonStore(o.dir, 'leads.json', { debounceMs: 0 }) : null;
  const l = new Leads({ now: () => relogio.t, store, max: o.max });
  return { l, relogio };
}

describe('Leads: receber', () => {
  it('guarda só o que a pessoa escreveu + data + a prova do consentimento (sem IP, sem chave do visitante)', () => {
    const { l } = montar();
    expect(l.receber(PEDIDO(), 'chave-da-rede')).toEqual({ ok: true, guardado: true });
    const adm = l.paraAdmin();
    expect(adm.novos).toBe(1);
    expect(adm.max).toBe(LIMITES_LEAD.max);
    const lead = adm.leads[0];
    expect(Object.keys(lead).sort()).toEqual(['consentimento', 'em', 'email', 'empresa', 'formatos', 'id', 'mensagem', 'nome', 'respondido', 'respondidoEm', 'whatsapp']);
    expect(lead).toMatchObject({ em: AGORA, whatsapp: '5511999990000', formatos: ['topo', 'chat'], respondido: false });
    // LGPD art. 8º, § 2º: versão do texto marcado e quando
    expect(lead.consentimento).toEqual({ versao: VERSAO_CONSENTIMENTO, em: AGORA });
    expect(TEXTOS_CONSENTIMENTO[VERSAO_CONSENTIMENTO]).toMatch(/só para responder/);
    expect(JSON.stringify(adm)).not.toContain('chave-da-rede');
  });

  it('campo-isca ou envio rápido demais: "ok" para o robô e nada guardado', () => {
    const { l } = montar();
    expect(l.receber(PEDIDO(1, { site: 'http://spam' }), 'c')).toMatchObject({ ok: true, guardado: false, motivo: 'isca' });
    expect(l.receber(PEDIDO(1, { ms: 400 }), 'c')).toMatchObject({ ok: true, guardado: false, motivo: 'rapido' });
    expect(l.receber(PEDIDO(1, { ms: undefined }), 'c')).toMatchObject({ ok: true, guardado: false });
    expect(l.paraAdmin().leads).toHaveLength(0);
    expect(l.descartados).toBe(3);
  });

  it('inválido → 422 com o campo; sem consentimento não guarda', () => {
    const { l } = montar();
    expect(l.receber(PEDIDO(1, { email: 'x' }), 'c')).toMatchObject({ ok: false, status: 422, campo: 'email' });
    expect(l.receber(PEDIDO(1, { consentimento: false }), 'c')).toMatchObject({ ok: false, status: 422, campo: 'consentimento' });
    expect(l.paraAdmin().leads).toHaveLength(0);
  });

  it('3 por visitante por hora (429 com espera); o mesmo pedido em 24 h não duplica', () => {
    const { l, relogio } = montar();
    expect(l.receber(PEDIDO(1), 'c')).toMatchObject({ ok: true, guardado: true });
    expect(l.receber(PEDIDO(1), 'c')).toMatchObject({ ok: true, guardado: false, motivo: 'repetido' });
    expect(l.receber(PEDIDO(2), 'c')).toMatchObject({ guardado: true });
    const r = l.receber(PEDIDO(3), 'c');
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(!r.ok && r.esperaS).toBeGreaterThan(0);
    expect(l.receber(PEDIDO(3), 'outra-rede')).toMatchObject({ guardado: true });
    relogio.t += 3600_000 + 1;
    expect(l.receber(PEDIDO(4), 'c')).toMatchObject({ guardado: true });
  });

  it('cheio: sai o respondido mais antigo; sem respondido, 503 (nunca apaga pedido sem resposta)', () => {
    const { l } = montar({ max: 3 });
    for (let i = 1; i <= 3; i++) expect(l.receber(PEDIDO(i), `c${i}`)).toMatchObject({ guardado: true });
    expect(l.receber(PEDIDO(4), 'c4')).toMatchObject({ ok: false, status: 503 });
    const maisAntigo = l.paraAdmin().leads.at(-1)!;
    expect(maisAntigo.nome).toBe('Pessoa 1');
    l.comando({ acao: 'respondido', id: l.paraAdmin().leads[1].id, valor: true }); // Pessoa 2
    expect(l.receber(PEDIDO(4), 'c4')).toMatchObject({ guardado: true });
    expect(l.paraAdmin().leads.map((x) => x.nome)).toEqual(['Pessoa 4', 'Pessoa 3', 'Pessoa 1']);
  });
});

describe('Leads: painel e persistência', () => {
  it('marcar como respondido, desmarcar, apagar; id desconhecido = erro', () => {
    const { l, relogio } = montar();
    l.receber(PEDIDO(1), 'a');
    l.receber(PEDIDO(2), 'b');
    const [b, a] = l.paraAdmin().leads;
    relogio.t += 60_000;
    expect(l.comando({ acao: 'respondido', id: a.id, valor: true })).toMatchObject({ ok: true });
    expect(l.paraAdmin().novos).toBe(1);
    expect(l.paraAdmin().leads[1]).toMatchObject({ respondido: true, respondidoEm: AGORA + 60_000 });
    l.comando({ acao: 'respondido', id: a.id, valor: false });
    expect(l.paraAdmin().leads[1]).toMatchObject({ respondido: false, respondidoEm: null });
    const r = l.comando({ acao: 'apagar', id: b.id });
    expect(r.ok && r.log).not.toContain('Pessoa');
    expect(l.paraAdmin().leads.map((x) => x.id)).toEqual([a.id]);
    expect(l.comando({ acao: 'apagar', id: 'ffffff' })).toMatchObject({ ok: false });
  });

  it('enxurrada (mais de 120 na hora, de redes diferentes): o pedido entra em quarentena em vez de ser recusado', () => {
    const { l } = montar();
    for (let i = 0; i < LIMITES_LEAD.globalPorHora; i++) expect(l.receber(PEDIDO(i), `rede-${i}`)).toMatchObject({ ok: true, guardado: true });
    expect(l.receber(PEDIDO(999), 'rede-nova')).toMatchObject({ ok: true, guardado: true });
    const ultimo = l.paraAdmin().leads[0];
    expect(ultimo.nome).toBe('Pessoa 999');
    expect(ultimo.quarentena).toBe(true);
    expect(l.paraAdmin().leads.filter((x) => x.quarentena)).toHaveLength(1);
  });

  it('não respondidos há mais de 12 meses saem (prazo de guarda)', () => {
    const { l, relogio } = montar();
    l.receber(PEDIDO(1), 'a');
    relogio.t += 300 * 86_400_000;
    l.receber(PEDIDO(2), 'b');
    relogio.t += 70 * 86_400_000;
    expect(l.paraAdmin().leads.map((x) => x.nome)).toEqual(['Pessoa 2']);
  });

  it('respondidos há mais de 180 dias saem sozinhos', () => {
    const { l, relogio } = montar();
    l.receber(PEDIDO(1), 'a');
    l.receber(PEDIDO(2), 'b');
    l.comando({ acao: 'respondido', id: l.paraAdmin().leads[1].id, valor: true });
    relogio.t += 181 * 86_400_000;
    expect(l.paraAdmin().leads.map((x) => x.nome)).toEqual(['Pessoa 2']);
  });

  it('grava em leads.json (permissão 600) e restaura; malformados são ignorados', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sintonia-leads-'));
    const m1 = montar({ dir });
    m1.l.receber(PEDIDO(1), 'a');
    await m1.l.persistir();
    const arq = join(dir, 'leads.json');
    expect(statSync(arq).mode & 0o777).toBe(0o600);
    const j = JSON.parse(readFileSync(arq, 'utf8'));
    expect(j.v).toBe(1);
    expect(j.leads).toHaveLength(1);
    const m2 = montar({ dir });
    expect(m2.l.paraAdmin().leads[0]).toMatchObject({ nome: 'Pessoa 1', email: 'contato1@empresa1.com.br' });
    expect(m2.l.carregar({ v: 1, leads: [{ id: 'zz', em: 1 }, { id: 'abcdef', em: 5, nome: 'X', empresa: 'Y', email: 'y' }] })).toBe(true);
    expect(m2.l.paraAdmin().leads).toHaveLength(0);
  });
});
