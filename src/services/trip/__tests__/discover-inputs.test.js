import { describe, expect, it } from 'vitest';
import { normalizeRequest, recommend, RECOMMEND_STATUS } from '../recommender.js';
import { buildKb, NOW } from './fixtures.js';

const { kb } = buildKb();
const req = { budget: 1000, origin: 'Rio de Janeiro', days: 3, people: 2 };

describe('novas entradas do Descubra', () => {
  it('orçamento por pessoa é multiplicado pelas pessoas e a premissa fica explícita', () => {
    const { request } = normalizeRequest({ ...req, budget: 500, budgetScope: 'person' }, NOW);
    expect(request.budget).toBe(1000);
    expect(request.budgetInput).toBe(500);
    const r = recommend({ ...req, budget: 500, budgetScope: 'person' }, kb, NOW);
    expect(r.assumptions[0]).toMatch(/por pessoa/);
  });

  it('orçamento total continua sendo o total do grupo', () => {
    expect(normalizeRequest(req, NOW).request.budget).toBe(1000);
  });

  it('data de saída: aceita futura, recusa passada e inválida', () => {
    expect(normalizeRequest({ ...req, startDate: '2026-12-01' }, NOW).issues).toEqual([]);
    expect(normalizeRequest({ ...req, startDate: '2026-10-01' }, NOW).issues).toContain('A data de saída já passou.');
    expect(normalizeRequest({ ...req, startDate: '32/13/2026' }, NOW).issues).toContain('Data de saída inválida.');
    expect(recommend({ ...req, startDate: '2026-10-01' }, kb, NOW).status).toBe(RECOMMEND_STATUS.INVALID_REQUEST);
  });

  it('preferência de transporte limita os modos considerados', () => {
    const r = recommend({ ...req, budget: 20000, modes: ['flight'] }, kb, NOW);
    const caro = r.results.find((x) => x.destination.id === 'caro');
    expect(caro.transportChoice.mode).toBe('flight');
    const serra = r.results.find((x) => x.destination.id === 'serra');
    expect(serra?.transportChoice ?? null).toBeNull();
  });

  it('tipo de hospedagem pedido é usado quando existe; senão avisa e usa a mais barata', () => {
    const hostel = recommend({ ...req, lodgingKinds: ['hostel'] }, kb, NOW).results.find((x) => x.destination.id === 'serra');
    expect(hostel.lodgingChoice.kind).toBe('hostel');
    const hotel = recommend({ ...req, lodgingKinds: ['hotel'], budget: 9000 }, kb, NOW).results.find((x) => x.destination.id === 'serra');
    expect(hotel.lodgingChoice.kind).not.toBe('hotel');
    expect(hotel.notes.join(' ')).toMatch(/Nenhuma hospedagem do tipo pedido/);
  });
});
