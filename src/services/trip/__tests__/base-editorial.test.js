import { describe, expect, it } from 'vitest';
import raw from '../../../data/knowledge/base.json';
import { loadKnowledgeBase } from '../knowledge.js';
import { recommend, RECOMMEND_STATUS } from '../recommender.js';

const { kb, errors, warnings } = loadKnowledgeBase(raw);
const NOW = new Date('2026-11-10T12:00:00Z');
const base = { days: 5, people: 1, budget: 20000 };

describe('base editorial inicial', () => {
  it('carrega sem erros nem avisos', () => {
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('só tem estimativas rotuladas: nenhum preço aparece como confirmado ou publicado', () => {
    const prices = [
      ...kb.destinations.flatMap((d) => [d.dailyFood, d.localTransportDaily]),
      ...kb.transportOptions.map((t) => t.price),
      ...kb.lodgings.map((l) => l.price),
    ];
    expect(prices.length).toBeGreaterThan(20);
    for (const p of prices) {
      expect(p.status).toBe('estimate');
      expect(p.note).toMatch(/Estimativa editorial/);
      expect(p.origin.sourceId).toBe('pm-editorial');
    }
  });

  it('cada destino tem país, moeda local e fuso', () => {
    for (const d of kb.destinations) {
      expect(d.country).toBeTruthy();
      expect(d.localCurrency).toMatch(/^[A-Z]{3}$/);
      expect(d.timezone).toMatch(/\//);
    }
  });

  it.each([
    ['Rio de Janeiro', 'Paraty'],
    ['Rio de Janeiro', 'São Paulo'],
    ['Rio de Janeiro', 'Buenos Aires'],
    ['São Paulo', 'Santiago'],
    ['São Paulo', 'Lisboa'],
  ])('cenário %s → %s aparece, com custo estimado e nunca como total confirmado', (origin, destName) => {
    const r = recommend({ ...base, origin }, kb, NOW);
    expect(r.status).toBe(RECOMMEND_STATUS.OK);
    const res = r.results.find((x) => x.destination.name === destName);
    expect(res).toBeTruthy();
    expect(res.budget.estimatedTotal).toBeGreaterThan(0);
    expect(res.budget.finalCostClaim).not.toBe('confirmed');
  });

  it('não sugere o próprio ponto de partida', () => {
    const r = recommend({ ...base, origin: 'São Paulo' }, kb, NOW);
    expect(r.results.map((x) => x.destination.name)).not.toContain('São Paulo');
  });

  it('com orçamento baixo, voos internacionais ficam fora', () => {
    const r = recommend({ ...base, origin: 'Rio de Janeiro', budget: 1500 }, kb, NOW);
    const names = (r.results ?? []).map((x) => x.destination.name);
    expect(names).toContain('Paraty');
    expect(names).not.toContain('Lisboa');
    expect(r.hidden.over).toBeGreaterThan(0);
  });
});
