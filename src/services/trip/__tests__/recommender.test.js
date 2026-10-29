import { describe, expect, it } from 'vitest';
import { RECOMMEND_STATUS, recommend } from '../recommender.js';
import { emptyKnowledgeBase, loadKnowledgeBase, sourceOf } from '../knowledge.js';
import { lodgingFromCamping, workExchangeFromOpportunity } from '../adapters.js';
import { normalizeOsmElement } from '../../lodging/osmCamping.js';
import { NOW, buildKb, price, perPersonDay } from './fixtures.js';

const REQ = { budget: 1000, origin: 'Rio', days: 4, people: 2, preferences: ['natureza'], hasCar: false };
const { kb } = buildKb();

describe('base de conhecimento', () => {
  it('carrega entidades válidas e preserva fonte e licença do preço', () => {
    expect(kb.destinations).toHaveLength(4);
    const t = kb.transportOptions.find((x) => x.id === 't-serra-bus');
    expect(t.price).toMatchObject({ status: 'published', amount: 50, currency: 'BRL', referenceUrl: 'https://fonte.test/preco', collectedAt: '2026-10-20T10:00:00Z' });
    expect(sourceOf(kb, t.price)).toMatchObject({ license: 'CC BY 4.0', attribution: 'Fonte de Teste' });
  });
  it('preço que cita fonte não cadastrada vira desconhecido, com aviso', () => {
    const r = buildKb((raw) => { raw.destinations[0].dailyFood = price(40, perPersonDay, { origin: { sourceId: 'inexistente', name: 'X' } }); });
    expect(r.kb.destinations[0].dailyFood.status).toBe('unknown');
    expect(r.warnings.join()).toMatch(/não cadastrada/);
  });
  it('descarta registros inválidos com o motivo, sem lançar', () => {
    const r = buildKb((raw) => {
      raw.transportOptions.push({ id: 'x', destinationId: 'nao-existe', origin: 'Rio', mode: 'bus' }, { id: 'y', destinationId: 'serra', origin: 'Rio', mode: 'teletransporte' });
      raw.destinations.push({ id: 'serra', name: 'Duplicado' });
    });
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.kb.transportOptions.find((t) => t.id === 'x')).toBeUndefined();
    expect(loadKnowledgeBase(null).kb.destinations).toEqual([]);
  });
  it('adaptadores: camping gratuito do OSM é preço publicado 0; preço com unidade desconhecida fica desconhecido', () => {
    const el = (tags) => normalizeOsmElement({ type: 'node', id: 1, lat: -22.9, lon: -43.2, tags: { tourism: 'camp_site', name: 'C', ...tags } }, { collectedAt: '2026-10-20T10:00:00.000Z' });
    const free = lodgingFromCamping(el({ fee: 'no' }), 'serra');
    expect(free.price).toMatchObject({ status: 'published', amount: 0, origin: { sourceId: 'osm' } });
    const paid = lodgingFromCamping(el({ fee: 'yes', charge: '30 BRL' }), 'serra');
    expect(paid.price).toMatchObject({ status: 'unknown', amount: null });
    expect(paid.price.note).toMatch(/unidade não informada/);
    expect(lodgingFromCamping(el({}), 'serra').price.amount).toBeNull();
  });
  it('adaptador de work exchange nunca inventa despesa', () => {
    const w = workExchangeFromOpportunity({ id: 'a', hostName: 'H', status: 'approved', expenses: null }, 'serra');
    expect(w.price).toMatchObject({ status: 'unknown', amount: null });
  });
});

describe('recomendador', () => {
  it('ordena respeitando o orçamento e explica com motivos verificáveis', () => {
    const r = recommend(REQ, kb, NOW);
    expect(r.status).toBe(RECOMMEND_STATUS.OK);
    const serra = r.results[0];
    expect(serra.destination.id).toBe('serra');
    // ônibus 2 pessoas × 2 trechos × 50 = 200; camping 25 × 2 × 3 noites = 150; comida 40 × 2 × 4 = 320
    expect(serra.budget.lines.find((l) => l.category === 'transport').total.amount).toBe(200);
    expect(serra.budget.lines.find((l) => l.category === 'lodging').total.amount).toBe(150);
    expect(serra.budget.lines.find((l) => l.category === 'food').total.amount).toBe(320);
    expect(serra.matchedPreferences).toContain('natureza');
    const cost = serra.reasons.find((x) => x.code === 'cost_transport');
    expect(cost.evidence[0]).toMatchObject({ sourceName: 'Fonte de Teste', license: 'CC BY 4.0', url: 'https://fonte.test/preco', collectedAt: '2026-10-20T10:00:00Z' });
    expect(serra.reasons.some((x) => x.code === 'pending')).toBe(true); // atividade sem preço
  });
  it('sem carro nunca sugere carro, mesmo sendo uma opção mais barata', () => {
    const r = recommend(REQ, kb, NOW);
    expect(r.results[0].transportChoice.mode).toBe('bus');
    const withCar = recommend({ ...REQ, hasCar: true }, kb, NOW);
    expect(withCar.results[0].transportChoice.mode).toBe('car'); // carro: R$ 150 por grupo, ida e volta, mais barato que o ônibus (R$ 200)
  });
  it('orçamento excedido: destino caro é ocultado e contado; includeOver mostra por último', () => {
    const r = recommend(REQ, kb, NOW);
    expect(r.results.map((x) => x.destination.id)).not.toContain('caro');
    expect(r.hidden.over).toBeGreaterThanOrEqual(1);
    const all = recommend({ ...REQ, includeOver: true }, kb, NOW);
    expect(all.results.at(-1).destination.id).toBe('caro');
    expect(all.results.at(-1).budget.fit).toBe('over');
  });
  it('preço desatualizado é marcado e rebaixa a qualidade', () => {
    const r = recommend({ ...REQ, preferences: ['praia'] }, kb, NOW);
    const praia = r.results.find((x) => x.destination.id === 'praia');
    expect(praia.budget.lines.find((l) => l.category === 'transport').total.status).toBe('stale');
    expect(praia.reasons.some((x) => x.code === 'stale_price')).toBe(true);
    expect(praia.budget.finalCostClaim).toBe('incomplete'); // hospedagem sem preço
  });
  it('destino sem dados vem depois dos que têm dados, com custos pendentes', () => {
    const r = recommend({ ...REQ, budget: 5000 }, kb, NOW);
    const ids = r.results.map((x) => x.destination.id);
    expect(ids.indexOf('serra')).toBeLessThan(ids.indexOf('vazio'));
    const vazio = r.results.find((x) => x.destination.id === 'vazio');
    expect(vazio.budget.essentialPending).toBe(3);
    expect(vazio.availability).toEqual({ transport: false, lodging: false });
    expect(vazio.budget.fit).toBe('unknown');
  });
  it('preferência por camping escolhe camping; work exchange encerrado nunca aparece', () => {
    const r = recommend({ ...REQ, preferences: ['camping'] }, kb, NOW);
    expect(r.results[0].lodgingChoice.id).toBe('l-serra-camp');
    const w = recommend({ ...REQ, preferences: ['work exchange'] }, kb, NOW).results.find((x) => x.destination.id === 'serra');
    expect(w.lodgingChoice.id).toBe('w-serra');
    expect(w.budget.pending.some((p) => p.category === 'lodging')).toBe(true); // despesas desconhecidas
  });
  it('origem desconhecida', () => {
    const r = recommend({ ...REQ, origin: 'Cidade Inventada' }, kb, NOW);
    expect(r.status).toBe(RECOMMEND_STATUS.UNKNOWN_ORIGIN);
    expect(r.knownOrigins).toContain('Rio de Janeiro');
    expect(r.results).toEqual([]);
  });
  it('destino desconhecido', () => {
    expect(recommend({ ...REQ, destinationId: 'nada' }, kb, NOW).status).toBe(RECOMMEND_STATUS.UNKNOWN_DESTINATION);
  });
  it('base vazia: dados insuficientes, nenhum resultado', () => {
    const r = recommend(REQ, emptyKnowledgeBase(), NOW);
    expect(r.status).toBe(RECOMMEND_STATUS.INSUFFICIENT_DATA);
    expect(r.results).toEqual([]);
  });
  it('pedido inválido e nada dentro do orçamento', () => {
    expect(recommend({ ...REQ, budget: 0 }, kb, NOW).status).toBe(RECOMMEND_STATUS.INVALID_REQUEST);
    expect(recommend({ ...REQ, days: 0 }, kb, NOW).status).toBe(RECOMMEND_STATUS.INVALID_REQUEST);
    expect(recommend({ ...REQ, origin: ' ' }, kb, NOW).status).toBe(RECOMMEND_STATUS.INVALID_REQUEST);
    // Destino sem dados nunca "cabe": aparece como "unknown", não como opção dentro do orçamento.
    const tiny = recommend({ ...REQ, budget: 100 }, kb, NOW);
    expect(tiny.results.every((x) => x.budget.fit === 'unknown')).toBe(true);
    expect(tiny.hidden.over).toBeGreaterThanOrEqual(3);
    const { kb: noEmpty } = buildKb((raw) => { raw.destinations = raw.destinations.filter((d) => d.id !== 'vazio'); });
    expect(recommend({ ...REQ, budget: 100 }, noEmpty, NOW).status).toBe(RECOMMEND_STATUS.NONE_WITHIN_BUDGET);
  });
  it('durações diferentes mudam o custo de forma proporcional; bate-volta não exige hospedagem', () => {
    const cost = (days) => recommend({ ...REQ, days, budget: 5000, preferences: [] }, kb, NOW).results.find((x) => x.destination.id === 'serra').budget;
    expect(cost(2).knownTotal).toBe(200 + 50 + 160 + 40);
    expect(cost(7).knownTotal).toBe(200 + 6 * 50 + 560 + 140);
    const dayTrip = cost(1);
    expect(dayTrip.lines.some((l) => l.category === 'lodging')).toBe(false);
    expect(dayTrip.pending.some((p) => p.category === 'lodging')).toBe(false);
  });
  it('é determinístico: a mesma entrada dá a mesma ordem', () => {
    const a = recommend({ ...REQ, budget: 5000 }, kb, NOW).results.map((x) => x.destination.id);
    const b = recommend({ ...REQ, budget: 5000 }, kb, NOW).results.map((x) => x.destination.id);
    expect(a).toEqual(b);
  });
});
