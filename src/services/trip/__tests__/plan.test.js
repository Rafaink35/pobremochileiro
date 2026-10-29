import { describe, expect, it } from 'vitest';
import { recommend } from '../recommender.js';
import { planFromResult } from '../plan.js';
import { planSummary } from '../../planner/stays.js';
import { NOW, buildKb } from './fixtures.js';

describe('envio ao planejador', () => {
  const { kb } = buildKb();
  const out = recommend({ budget: 1000, origin: 'Rio', days: 4, people: 2, preferences: ['natureza'], hasCar: false }, kb, NOW);
  const serra = out.results.find((r) => r.destination.id === 'serra');
  const plan = planFromResult(serra, out.request);

  it('leva destino, origem, dias e orçamento', () => {
    expect(plan).toMatchObject({ tripName: 'Serra Teste', origin: 'Rio', days: '4', budget: '1000' });
  });
  it('itens com valor conhecido levam fonte e link; pendentes vão sem valor', () => {
    const transport = plan.items.find((i) => i.category === 'Transporte' && i.label.includes('Ônibus'));
    expect(transport).toMatchObject({ amount: '200,00', source: 'Fonte de Teste', url: 'https://fonte.test/preco' });
    const pending = plan.items.find((i) => i.label === 'Cachoeira');
    expect(pending.amount).toBe('');
  });
  it('o planejador trata item sem valor como desconhecido, nunca como zero', () => {
    const s = planSummary({ items: plan.items, stays: [], budget: plan.budget });
    expect(s.complete).toBe(false);
    expect(s.unknown).toContain('Cachoeira');
  });
});
