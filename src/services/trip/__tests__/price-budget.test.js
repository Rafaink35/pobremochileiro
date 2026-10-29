import { describe, expect, it } from 'vitest';
import { PRICE_STATUS, createPrice, isStalePrice, unitLabel, unknownPrice } from '../price.js';
import { computeBudget, lineTotal, multiplierFor } from '../budget.js';
import { NOW, perPersonDay, perPersonLeg, perPersonNight, price } from './fixtures.js';

const P = (amount, unit, o) => createPrice(price(amount, unit, o));
const CTX = { currency: 'BRL', people: 2, rooms: 1, nights: 3, days: 4, legs: 2 };

describe('preço', () => {
  it('valor ausente ou vazio nunca vira zero', () => {
    for (const amount of [undefined, null, '']) {
      const p = createPrice({ ...price(0, perPersonDay), amount });
      expect(p.status).toBe(PRICE_STATUS.UNKNOWN);
      expect(p.amount).toBeNull();
    }
    expect(unknownPrice().amount).toBeNull();
  });
  it('zero informado pela fonte continua zero', () => {
    const p = P(0, perPersonNight);
    expect(p.status).toBe(PRICE_STATUS.PUBLISHED);
    expect(p.amount).toBe(0);
  });
  it('dado incompleto degrada para desconhecido e explica por quê', () => {
    expect(createPrice({ ...price(10, perPersonDay), unit: null })).toMatchObject({ status: 'unknown', amount: null });
    expect(createPrice({ ...price(10, perPersonDay), currency: '' }).issues.join()).toMatch(/moeda/);
    expect(createPrice({ ...price(10, perPersonDay), collectedAt: undefined }).issues.join()).toMatch(/data de coleta/);
    expect(createPrice({ ...price(10, perPersonDay), origin: null }).issues.join()).toMatch(/origem/);
    expect(createPrice({ ...price(-5, perPersonDay) }).status).toBe('unknown');
  });
  it('estimativa exige explicação e não precisa de fonte', () => {
    expect(createPrice({ status: 'estimate', amount: 30, currency: 'BRL', unit: perPersonDay }).status).toBe('unknown');
    expect(createPrice({ status: 'estimate', amount: 30, currency: 'BRL', unit: perPersonDay, note: 'informado pelo viajante' }).status).toBe('estimate');
  });
  it('preço antigo ou vencido deixa de valer como publicado', () => {
    expect(isStalePrice(P(10, perPersonDay), NOW)).toBe(false);
    expect(isStalePrice(P(10, perPersonDay, { collectedAt: '2026-01-01T00:00:00Z' }), NOW)).toBe(true);
    expect(isStalePrice(P(10, perPersonDay, { validUntil: '2026-10-01T00:00:00Z' }), NOW)).toBe(true);
    expect(isStalePrice(P(10, perPersonDay, { validUntil: '2027-01-01T00:00:00Z' }), NOW)).toBe(false);
  });
  it('rótulos de unidade', () => {
    expect(unitLabel(perPersonNight)).toBe('por pessoa por noite');
    expect(unitLabel({ basis: 'room', period: 'night' })).toBe('por quarto por noite');
    expect(unitLabel({ basis: 'group', period: 'round_trip' })).toBe('por grupo ida e volta');
  });
});

describe('multiplicadores e unidades', () => {
  it('por pessoa × noites, por quarto × noites, por grupo, por trecho', () => {
    expect(multiplierFor(perPersonNight, CTX).count).toBe(6);
    expect(multiplierFor({ basis: 'room', period: 'night' }, CTX).count).toBe(3);
    expect(multiplierFor({ basis: 'group', period: 'once' }, CTX).count).toBe(1);
    expect(multiplierFor(perPersonLeg, CTX).count).toBe(4);
    expect(multiplierFor({ basis: 'group', period: 'round_trip' }, CTX).count).toBe(1);
  });
  it('sem o número necessário a linha fica pendente em vez de assumir', () => {
    expect(multiplierFor({ basis: 'room', period: 'night' }, { ...CTX, rooms: undefined }).reason).toMatch(/quartos/);
    expect(multiplierFor(perPersonNight, { ...CTX, nights: 0 }).reason).toMatch(/noites/);
    expect(multiplierFor(perPersonDay, { ...CTX, people: undefined }).reason).toMatch(/pessoas/);
  });
  it('totais de linha respeitam a unidade', () => {
    expect(lineTotal(P(25, perPersonNight), CTX, NOW)).toMatchObject({ status: 'published', amount: 150 });
    expect(lineTotal(P(80, { basis: 'room', period: 'night' }), CTX, NOW).amount).toBe(240);
    expect(lineTotal(P(50, perPersonLeg), CTX, NOW).amount).toBe(200); // 2 pessoas × 2 trechos
    expect(lineTotal(P(200, { basis: 'group', period: 'round_trip' }), CTX, NOW).amount).toBe(200);
  });
  it('moeda diferente só entra com cotação e vira estimativa', () => {
    const usd = P(10, perPersonDay, { currency: 'USD' });
    expect(lineTotal(usd, CTX, NOW)).toMatchObject({ status: 'unknown', reason: expect.stringMatching(/USD/) });
    expect(lineTotal(usd, { ...CTX, fx: { USD: 5 } }, NOW)).toMatchObject({ status: 'estimate', amount: 400 });
  });
});

describe('orçamento', () => {
  const base = { budget: 1000, people: 2, rooms: 1, nights: 3, days: 4, legs: 2, contingencyPct: 10 };
  const lines = (over = {}) => [
    { key: 't', category: 'transport', label: 'Ônibus', price: P(50, perPersonLeg) },
    { key: 'l', category: 'lodging', label: 'Camping', price: P(25, perPersonNight) },
    { key: 'f', category: 'food', label: 'Comida', price: P(40, perPersonDay) },
    ...(over.extra ?? []),
  ];

  it('tudo conhecido: total, reserva e saldo exatos, e só então "confirmado"', () => {
    const b = computeBudget({ ...base, lines: lines() }, NOW);
    expect(b.knownTotal).toBe(200 + 150 + 320);
    expect(b.contingency.amount).toBe(67);
    expect(b.minimumTotal).toBe(737);
    expect(b.balance).toEqual({ amount: 263, kind: 'exact' });
    expect(b.fit).toBe('within');
    expect(b.finalCostClaim).toBe('confirmed');
    expect(b.pending).toEqual([]);
  });
  it('custo essencial desconhecido: total é piso, não custo final', () => {
    const l = lines();
    l[1].price = unknownPrice();
    const b = computeBudget({ ...base, lines: l }, NOW);
    expect(b.pending).toHaveLength(1);
    expect(b.essentialPending).toBe(1);
    expect(b.knownTotal).toBe(520); // hospedagem NÃO entra como zero
    expect(b.finalCostClaim).toBe('incomplete');
    expect(b.balance.kind).toBe('upper_bound');
    expect(b.fit).toBe('within_partial');
  });
  it('categoria essencial sem nenhuma linha também é pendente', () => {
    const b = computeBudget({ ...base, lines: lines().slice(0, 2) }, NOW);
    expect(b.pending.find((p) => p.category === 'food')).toMatchObject({ essential: true, reason: 'nenhum custo registrado' });
  });
  it('orçamento excedido mesmo só com o que se conhece', () => {
    const b = computeBudget({ ...base, budget: 500, lines: lines() }, NOW);
    expect(b.fit).toBe('over');
    expect(b.balance.amount).toBeLessThan(0);
  });
  it('preço desatualizado vira estimativa e impede "confirmado"', () => {
    const l = lines();
    l[0].price = P(50, perPersonLeg, { collectedAt: '2026-01-01T00:00:00Z' });
    const b = computeBudget({ ...base, lines: l }, NOW);
    expect(b.estimatedTotal).toBe(200);
    expect(b.knownTotal).toBe(470);
    expect(b.finalCostClaim).toBe('estimated');
    expect(b.lines[0].total.status).toBe('stale');
  });
  it('viagens de durações diferentes escalam noites e dias', () => {
    const short = computeBudget({ ...base, nights: 1, days: 2, lines: lines() }, NOW);
    const long = computeBudget({ ...base, nights: 6, days: 7, lines: lines() }, NOW);
    expect(short.knownTotal).toBe(200 + 50 + 160);
    expect(long.knownTotal).toBe(200 + 300 + 560);
  });
  it('bate-volta (0 noites) não cobra hospedagem quando ela não é exigida', () => {
    const b = computeBudget({ ...base, nights: 0, days: 1, requiredCategories: ['transport', 'food'], lines: lines().filter((l) => l.category !== 'lodging') }, NOW);
    expect(b.pending).toEqual([]);
    expect(b.knownTotal).toBe(200 + 80);
  });
  it('sem nenhum valor conhecido, não diz que cabe', () => {
    const b = computeBudget({ ...base, lines: lines().map((l) => ({ ...l, price: unknownPrice() })) }, NOW);
    expect(b.fit).toBe('unknown');
    expect(b.contingency.amount).toBeNull();
    expect(b.minimumTotal).toBe(0);
  });
  it('custo não essencial desconhecido deixa o total incompleto, mas não é essencial', () => {
    const b = computeBudget({ ...base, lines: lines({ extra: [{ key: 'a', category: 'activities', label: 'Trilha', price: unknownPrice() }] }) }, NOW);
    expect(b.essentialPending).toBe(0);
    expect(b.complete).toBe(false);
    expect(b.finalCostClaim).toBe('incomplete');
  });
});
