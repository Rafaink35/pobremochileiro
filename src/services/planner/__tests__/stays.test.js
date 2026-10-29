import { describe, expect, it } from 'vitest';
import { addStay, buildStayEntry, COST_STATUS, planSummary, removeStay, TRANSPORT_STATUS, updateStay } from '../stays.js';
import { normalizeOsmElement } from '../../lodging/osmCamping.js';
import { normalizeOpportunity } from '../../workExchange/opportunity.js';

const camp = (tags) => normalizeOsmElement({ type: 'node', id: 1, lat: -27.6, lon: -48.5, tags: { tourism: 'camp_site', name: 'Camp', ...tags } }, { collectedAt: '2026-10-28T12:00:00.000Z' });
const NOW = new Date('2026-10-28T12:00:00Z');

describe('adicionar ao planejador', () => {
  it('guarda destino, custo, transporte não calculado, contato e fonte com data', () => {
    const e = buildStayEntry(camp({ fee: 'no', website: 'https://c.example' }), 'camping', NOW);
    expect(e).toMatchObject({ id: 'camping:osm:node/1', lat: -27.6, lon: -48.5 });
    expect(e.cost.status).toBe(COST_STATUS.FREE);
    expect(e.transport.status).toBe(TRANSPORT_STATUS.NOT_CALCULATED);
    expect(e.contact.website).toBe('https://c.example');
    expect(e.source).toMatchObject({ license: 'ODbL 1.0', verifiedAt: '2026-10-28T12:00:00.000Z' });
  });
  it('não duplica o mesmo local', () => {
    const e = buildStayEntry(camp({}), 'camping', NOW);
    const r1 = addStay({ stays: [] }, e);
    const r2 = addStay(r1.draft, e);
    expect(r1.added).toBe(true);
    expect(r2.added).toBe(false);
    expect(r2.draft.stays).toHaveLength(1);
  });
  it('custo: gratuito, pago com referência, pago sem valor, desconhecido', () => {
    expect(buildStayEntry(camp({ fee: 'yes', charge: '30 BRL' }), 'camping', NOW).cost.status).toBe(COST_STATUS.PAID_REFERENCE);
    expect(buildStayEntry(camp({ fee: 'yes' }), 'camping', NOW).cost.status).toBe(COST_STATUS.PAID_UNKNOWN);
    expect(buildStayEntry(camp({}), 'camping', NOW).cost.status).toBe(COST_STATUS.UNKNOWN);
  });
  it('work exchange entra como troca, com fonte e verificação', () => {
    const o = normalizeOpportunity({ id: 'w1', host_name: 'Hostel', lat: -22, lon: -43, status: 'approved', approved_at: '2026-10-01T00:00:00Z', start_date: '2026-11-01' });
    const e = buildStayEntry(o, 'work_exchange', NOW);
    expect(e.cost.status).toBe(COST_STATUS.EXCHANGE);
    expect(e.dates.from).toBe('2026-11-01');
    expect(e.source.verifiedAt).toBe('2026-10-01T00:00:00Z');
  });
  it('remove e atualiza', () => {
    const e = buildStayEntry(camp({}), 'camping', NOW);
    let d = addStay({}, e).draft;
    d = updateStay(d, e.id, { note: 'ok' });
    expect(d.stays[0].note).toBe('ok');
    expect(removeStay(d, e.id).stays).toEqual([]);
  });
});

describe('resumo: nunca trata total parcial como completo', () => {
  it('custo e transporte ausentes tornam o total parcial', () => {
    const e = buildStayEntry(camp({ fee: 'no' }), 'camping', NOW);
    const s = planSummary({ items: [{ category: 'Comida', label: 'Mercado', amount: '100' }], stays: [e], budget: '1000' });
    expect(s.knownTotal).toBe(100);
    expect(s.complete).toBe(false);
    expect(s.unknown.join(' ')).toMatch(/Transporte até Camp/);
  });
  it('item sem valor conta como desconhecido, não como zero', () => {
    const s = planSummary({ items: [{ category: 'Transporte', label: 'Ônibus', amount: '' }], stays: [] });
    expect(s.complete).toBe(false);
    expect(s.unknown).toContain('Ônibus');
  });
  it('só fica completo com tudo informado e transporte confirmado', () => {
    let e = buildStayEntry(camp({ fee: 'no' }), 'camping', NOW);
    e = { ...e, transport: { status: TRANSPORT_STATUS.CONFIRMED } };
    const s = planSummary({ items: [{ category: 'Comida', label: 'x', amount: '50,00' }], stays: [e], budget: '' });
    expect(s.complete).toBe(true);
    expect(s.knownTotal).toBe(50);
  });
  it('hospedagem paga com valor de referência fica fora do total e é marcada como pendente', () => {
    const e = buildStayEntry(camp({ fee: 'yes', charge: '30 BRL' }), 'camping', NOW);
    const s = planSummary({ items: [], stays: [e] });
    expect(s.knownTotal).toBe(0);
    expect(s.unknown.join(' ')).toMatch(/Hospedagem: Camp/);
  });
  it('plano vazio é identificado', () => {
    expect(planSummary({}).empty).toBe(true);
  });
});
