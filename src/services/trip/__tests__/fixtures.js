// Dados APENAS de teste (nomes, valores e fontes fictícios). Nunca importar fora de testes.
import { loadKnowledgeBase } from '../knowledge.js';

export const NOW = new Date('2026-10-28T12:00:00Z');
const FRESH = '2026-10-20T10:00:00Z';
const OLD = '2026-01-10T10:00:00Z';

export const price = (amount, unit, o = {}) => ({
  status: 'published', amount, currency: 'BRL', unit, origin: { sourceId: 'src-test', name: 'Fonte de Teste' },
  referenceUrl: 'https://fonte.test/preco', collectedAt: FRESH, ...o,
});
export const perPersonLeg = { basis: 'person', period: 'leg' };
export const perPersonNight = { basis: 'person', period: 'night' };
export const perPersonDay = { basis: 'person', period: 'day' };

export const rawKb = () => ({
  sources: [{ id: 'src-test', name: 'Fonte de Teste', url: 'https://fonte.test', license: 'CC BY 4.0', attribution: 'Fonte de Teste', obtainedAt: FRESH, commercialUse: 'allowed' }],
  origins: [{ name: 'Rio de Janeiro', aliases: ['rio', 'rj'] }],
  destinations: [
    { id: 'serra', name: 'Serra Teste', tags: ['natureza', 'trilha'], dailyFood: price(40, perPersonDay), localTransportDaily: price(10, perPersonDay) },
    { id: 'praia', name: 'Praia Teste', tags: ['praia'], dailyFood: price(60, perPersonDay) },
    { id: 'caro', name: 'Destino Caro', tags: ['cidade'], dailyFood: price(120, perPersonDay) },
    { id: 'vazio', name: 'Sem Dados', tags: ['natureza'] },
  ],
  transportOptions: [
    { id: 't-serra-bus', destinationId: 'serra', origin: 'Rio de Janeiro', mode: 'bus', price: price(50, perPersonLeg), durationMinutes: 180 },
    { id: 't-serra-car', destinationId: 'serra', origin: 'Rio de Janeiro', mode: 'car', price: price(150, { basis: 'group', period: 'round_trip' }) },
    { id: 't-praia-bus', destinationId: 'praia', origin: 'Rio de Janeiro', mode: 'bus', price: price(70, perPersonLeg, { collectedAt: OLD }) }, // desatualizado
    { id: 't-caro-flight', destinationId: 'caro', origin: 'Rio de Janeiro', mode: 'flight', price: price(900, perPersonLeg) },
  ],
  lodgings: [
    { id: 'l-serra-camp', destinationId: 'serra', name: 'Camping Teste', kind: 'camping', price: price(25, perPersonNight) },
    { id: 'l-serra-hostel', destinationId: 'serra', name: 'Hostel Teste', kind: 'hostel', price: price(80, { basis: 'room', period: 'night' }) },
    { id: 'l-praia-pousada', destinationId: 'praia', name: 'Pousada Teste', kind: 'guesthouse', price: { status: 'unknown' } },
    { id: 'l-caro-hotel', destinationId: 'caro', name: 'Hotel Teste', kind: 'hotel', price: price(300, perPersonNight) },
  ],
  workExchanges: [
    { id: 'w-serra', destinationId: 'serra', hostName: 'Sítio Teste', hoursPerWeek: 20, status: 'approved', spots: 1, price: { status: 'unknown' } },
    { id: 'w-encerrado', destinationId: 'serra', hostName: 'Encerrado', status: 'closed', price: { status: 'unknown' } },
  ],
  activities: [
    { id: 'a-serra-trilha', destinationId: 'serra', name: 'Trilha guiada', tags: ['natureza'], price: price(30, { basis: 'person', period: 'once' }) },
    { id: 'a-serra-cachoeira', destinationId: 'serra', name: 'Cachoeira', tags: ['natureza'], price: { status: 'unknown' } },
  ],
});

export const buildKb = (mutate) => {
  const raw = rawKb();
  mutate?.(raw);
  return loadKnowledgeBase(raw);
};
