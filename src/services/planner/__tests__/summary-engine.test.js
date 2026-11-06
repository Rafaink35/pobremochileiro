import { describe, expect, it } from 'vitest';
import { planSummary } from '../stays.js';
import { computeBudget } from '../../trip/budget.js';
import { createPrice } from '../../trip/price.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const item = (category, amount, extra = {}) => ({ category, label: category, amount, ...extra });

describe('planSummary usa o motor de orçamento', () => {
  it('separa informado por você de estimado e calcula reserva e mínimo', () => {
    const s = planSummary({ days: '1', items: [item('Comida', '100'), item('Transporte', '200,00', { status: 'estimate' })], budget: '1000' }, NOW);
    expect(s.confirmedTotal).toBe(100);
    expect(s.estimatedTotal).toBe(200);
    expect(s.knownTotal).toBe(300);
    expect(s.contingency.amount).toBe(30);
    expect(s.minimumTotal).toBe(330);
    expect(s.finalCostClaim).toBe('estimated');
    expect(s.fit).toBe('within');
    expect(s.essentialMissing).toEqual([]);
  });

  it('não afirma que cabe quando falta custo essencial: resultado parcial', () => {
    const s = planSummary({ days: '4', items: [item('Comida', '100')], budget: '5000' }, NOW);
    expect(s.essentialMissing).toEqual(['Transporte', 'Hospedagem']);
    expect(s.fit).toBe('within_partial');
    expect(s.finalCostClaim).toBe('incomplete');
  });

  it('desatualizado conta como estimativa e item sem valor vira pendente (nunca zero)', () => {
    const s = planSummary({ items: [item('Transporte', '50', { status: 'stale' }), item('Hospedagem', '')], budget: '' }, NOW);
    expect(s.estimatedTotal).toBe(50);
    expect(s.complete).toBe(false);
    expect(s.unknown).toEqual(['Hospedagem']);
    expect(s.finalCostClaim).toBe('incomplete');
    expect(s.fit).toBe('no_budget');
  });

  it('passa do limite pelo custo mínimo (com reserva), mesmo com itens faltando', () => {
    const s = planSummary({ items: [item('Comida', '950'), item('Extras', '')], budget: '1000' }, NOW);
    expect(s.minimumTotal).toBeCloseTo(1045);
    expect(s.fit).toBe('over');
  });

  it('o resumo bate com o computeBudget aplicado diretamente às mesmas linhas', () => {
    const items = [item('Comida', '120'), item('Passeios', '80', { status: 'estimate' })];
    const s = planSummary({ items, budget: '2000' }, NOW);
    const direct = computeBudget({
      budget: 2000, currency: 'BRL', people: 1, rooms: 1, nights: 1, days: 1, legs: 1, requiredCategories: [],
      lines: [
        { key: 'a', category: 'food', label: 'Comida', essential: false, price: createPrice({ status: 'confirmed', amount: 120, currency: 'BRL', unit: { basis: 'group', period: 'once' }, collectedAt: NOW.toISOString(), origin: { sourceId: 'x', name: 'x' } }) },
        { key: 'b', category: 'activities', label: 'Passeios', essential: false, price: createPrice({ status: 'estimate', amount: 80, currency: 'BRL', unit: { basis: 'group', period: 'once' }, note: 'x' }) },
      ],
    }, NOW);
    expect(s.minimumTotal).toBe(direct.minimumTotal);
    expect(s.confirmedTotal).toBe(direct.knownTotal);
    expect(s.estimatedTotal).toBe(direct.estimatedTotal);
  });
});
