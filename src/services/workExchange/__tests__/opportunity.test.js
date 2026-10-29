import { describe, expect, it } from 'vitest';
import { filterOpportunities, isAvailable, normalizeOpportunity } from '../opportunity.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const row = (o = {}) => ({
  id: 'w1', host_name: 'Hostel Sol', lat: -22.9, lon: -43.2, city: 'Rio de Janeiro', state: 'RJ', status: 'approved',
  approved_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-10T00:00:00Z', tasks: ['recepção'], spots: 2, end_date: '2026-12-31', ...o,
});

describe('work exchange', () => {
  it('aprovada, no prazo e com vaga está disponível', () => {
    expect(isAvailable(normalizeOpportunity(row()), NOW)).toBe(true);
  });
  it('encerrada, rejeitada, pendente, vencida ou sem vaga não aparece', () => {
    for (const o of [{ status: 'closed' }, { status: 'rejected' }, { status: 'pending' }, { end_date: '2026-10-01' }, { spots: 0 }]) {
      expect(isAvailable(normalizeOpportunity(row(o)), NOW)).toBe(false);
    }
  });
  it('vagas não informadas não bloqueiam, mas ficam como null', () => {
    const o = normalizeOpportunity(row({ spots: null }));
    expect(o.spots).toBeNull();
    expect(isAvailable(o, NOW)).toBe(true);
  });
  it('filtra por lugar e conta as indisponíveis ocultas', () => {
    const rows = [row(), row({ id: 'w2', status: 'closed' }), row({ id: 'w3', city: 'Salvador', state: 'BA' })];
    const r = filterOpportunities(rows, { place: 'rio', now: NOW });
    expect(r.opportunities.map((o) => o.id)).toEqual(['w1']);
    expect(r.hiddenUnavailable).toBe(1);
  });
  it('sem registros não inventa nada; campos ausentes ficam null; coordenadas inválidas viram null', () => {
    expect(filterOpportunities([], { now: NOW }).opportunities).toEqual([]);
    const o = normalizeOpportunity({ id: 'x', host_name: 'H', lat: 500, lon: 0, status: 'approved' });
    expect(o.lat).toBeNull();
    expect(o.hoursPerWeek).toBeNull();
    expect(o.externalUrl).toBeNull();
  });
  it('link externo só http(s)', () => {
    expect(normalizeOpportunity(row({ external_url: 'javascript:x' })).externalUrl).toBeNull();
    expect(normalizeOpportunity(row({ external_url: 'https://host.example' })).externalUrl).toBe('https://host.example');
  });
});
