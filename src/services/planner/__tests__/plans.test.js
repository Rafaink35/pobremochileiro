import { describe, expect, it } from 'vitest';
import { activePlanId, addPlanItems, comparePlans, createPlan, deletePlan, listPlans, renamePlan, switchPlan } from '../plans.js';

const base = () => ({ tripName: 'Lisboa', days: '10', budget: '5000', items: [{ id: 'a', category: 'Transporte', label: 'Voo', amount: '3.000,00' }], stays: [] });

describe('vários planos', () => {
  it('começa com um plano e o ativo continua em items/stays', () => {
    const d = base();
    expect(listPlans(d)).toHaveLength(1);
    expect(listPlans(d)[0]).toMatchObject({ name: 'Plano A', active: true });
    expect(activePlanId(d)).toBe('p1');
  });
  it('criar plano novo guarda o anterior e começa vazio; duplicar copia os itens', () => {
    const { draft: d2, created } = createPlan(base(), { id: 'p2' });
    expect(created).toBe(true);
    expect(d2.items).toEqual([]);
    expect(listPlans(d2).map((p) => p.name)).toEqual(['Plano A', 'Plano B']);
    expect(d2.plans.p1.items).toHaveLength(1);
    const { draft: d3 } = createPlan(base(), { id: 'px', copy: true, name: 'Com hostel' });
    expect(d3.items).toHaveLength(1);
    expect(d3.activePlanName).toBe('Com hostel');
  });
  it('trocar de plano não perde nada e é reversível', () => {
    let d = createPlan(base(), { id: 'p2' }).draft;
    d = addPlanItems(d, [{ label: 'Bus', amount: '100,00' }]);
    const back = switchPlan(d, 'p1');
    expect(back.items).toHaveLength(1);
    expect(back.items[0].label).toBe('Voo');
    const again = switchPlan(back, 'p2');
    expect(again.items.map((i) => i.label)).toEqual(['Bus']);
    expect(switchPlan(again, 'nao-existe')).toBe(again);
  });
  it('renomear, limite de 6 planos e nunca apagar o último', () => {
    let d = renamePlan(base(), '  Mais barato  ');
    expect(d.activePlanName).toBe('Mais barato');
    expect(renamePlan(d, '   ').activePlanName).toBe('Mais barato');
    expect(deletePlan(d)).toBe(d);
    for (let i = 0; i < 5; i += 1) d = createPlan(d, { id: `n${i}` }).draft;
    expect(listPlans(d)).toHaveLength(6);
    expect(createPlan(d).created).toBe(false);
    const del = deletePlan(d);
    expect(listPlans(del)).toHaveLength(5);
    expect(listPlans(del).some((p) => p.active)).toBe(true);
  });
});

describe('adicionar itens', () => {
  it('aceita um item solto ou uma lista (a tela Transporte manda um item)', () => {
    expect(addPlanItems(base(), { label: 'X', amount: '1,00' }).items).toHaveLength(2);
    expect(addPlanItems(base(), [{ label: 'X' }, { label: 'Y' }]).items).toHaveLength(3);
  });
});

describe('comparação de planos', () => {
  const two = () => {
    let d = base();
    d = createPlan(d, { id: 'p2', name: 'Com ônibus' }).draft;
    d = addPlanItems(d, [{ label: 'Voo outro', amount: '2.000,00' }, { label: 'Ônibus', amount: '200,00' }]);
    return d;
  };
  it('mais barato só entre planos completos', () => {
    const c = comparePlans(two());
    expect(c.comparable).toBe(true);
    expect(c.cheapestId).toBe('p2');
    expect(c.rows.find((r) => r.id === 'p2')).toMatchObject({ total: 2200, complete: true, perDay: 220, leftover: 2800 });
    expect(c.rows.find((r) => r.id === 'p2').byCategory.Transporte).toBe(2200);
  });
  it('plano com item sem valor NÃO é declarado mais barato', () => {
    let d = two();
    d = addPlanItems(d, [{ label: 'Hostel', category: 'Hospedagem', amount: '' }]);
    const c = comparePlans(d);
    expect(c.rows.find((r) => r.id === 'p2').complete).toBe(false);
    expect(c.cheapestId).toBeNull(); // o Plano A (3.000) está completo, mas o B pode custar menos que isso
    expect(c.lowestPartialId).toBe('p2');
    expect(c.comparable).toBe(false);
  });
  it('limite: passa do orçamento e quanto sobra', () => {
    const d = { ...two(), budget: '2.000,00' };
    const rows = comparePlans(d).rows;
    expect(rows.find((r) => r.id === 'p1').overLimit).toBe(true);
    expect(rows.find((r) => r.id === 'p2')).toMatchObject({ overLimit: true, leftover: -200 });
  });
  it('completo vence um incompleto só se o incompleto já custa mais', () => {
    let d = two();
    d = addPlanItems(d, [{ label: 'Hostel', category: 'Hospedagem', amount: '' }, { label: 'Extra', amount: '1.500,00' }]); // B parcial = 3.700
    const c = comparePlans(d);
    expect(c.cheapestId).toBe('p1'); // A completo 3.000; B já passa disso mesmo sem o hostel
  });
  it('plano vazio não entra no "mais barato"', () => {
    const d = createPlan(base(), { id: 'p2' }).draft;
    expect(comparePlans(d).cheapestId).toBeNull();
    expect(comparePlans(d).rows.find((r) => r.id === 'p2').empty).toBe(true);
  });
});

describe('companhia e parceiro nos itens', () => {
  it('guarda companhia e parceiro; parceiro cai para a fonte quando não vem', () => {
    const d = addPlanItems(base(), [{ label: 'Voo', amount: '1,00', source: 'Aviasales', carrier: 'TAP Air Portugal (TP)' }, { label: 'Ônibus', amount: '2,00', source: 'Buser', partner: 'Buser', carrier: 'Cometa' }]);
    expect(d.items.at(-2)).toMatchObject({ partner: 'Aviasales', carrier: 'TAP Air Portugal (TP)' });
    expect(d.items.at(-1)).toMatchObject({ partner: 'Buser', carrier: 'Cometa' });
    expect(addPlanItems(base(), [{ label: 'X' }]).items.at(-1)).toMatchObject({ partner: '', carrier: '' });
  });
});
