import { describe, expect, it } from 'vitest';
import {
  buildOverpassQuery,
  escapeOverpass,
  fetchOsmCampings,
  normalizeOsmElement,
  parseCharge,
  parseOverpassResponse,
} from '../osmCamping.js';
import { dedupeLodgings, filterLodgings } from '../lodgingModel.js';
import { SEARCH_STATUS } from '../../transport/transportProvider.js';

const NOW = '2026-10-28T12:00:00.000Z';
const node = (id, tags, extra = {}) => ({ type: 'node', id, lat: -27.6, lon: -48.5, tags, timestamp: '2026-09-01T10:00:00Z', ...extra });

describe('normalização OSM', () => {
  it('camping sem preço e sem contato: campos ficam desconhecidos, não inventados', () => {
    const r = normalizeOsmElement(node(1, { tourism: 'camp_site', name: 'Camping A' }), { collectedAt: NOW });
    expect(r.price).toBeNull();
    expect(r.fee).toBe('unknown');
    expect(r.website).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.email).toBeNull();
    expect(r.tents).toBeNull();
    expect(r.amenities.shower).toBeNull();
    expect(r.openStatus).toBe('unknown');
  });
  it('preserva fonte, licença, atribuição, id original e datas', () => {
    const r = normalizeOsmElement(node(7, { tourism: 'camp_site', name: 'B' }), { collectedAt: NOW });
    expect(r.id).toBe('osm:node/7');
    expect(r.source).toMatchObject({
      provider: 'osm',
      license: 'ODbL 1.0',
      attribution: '© OpenStreetMap contributors',
      originalId: 'node/7',
      sourceUrl: 'https://www.openstreetmap.org/node/7',
      collectedAt: NOW,
      lastEditedAt: '2026-09-01T10:00:00Z',
    });
  });
  it('separa camp_site de caravan_site e lê comodidades com sim/não/desconhecido', () => {
    const c = normalizeOsmElement(node(2, { tourism: 'caravan_site', name: 'C', toilets: 'yes', shower: 'no', power_supply: 'yes', tents: 'no', fee: 'yes', charge: '30 BRL' }), { collectedAt: NOW });
    expect(c.kind).toBe('caravan_site');
    expect(c.amenities).toMatchObject({ toilets: true, shower: false, power: true, kitchen: null });
    expect(c.tents).toBe(false);
    expect(c.price).toEqual({ amount: 30, currency: 'BRL' });
  });
  it('preço só com moeda explícita; fee=no é gratuito, fee ausente é desconhecido', () => {
    expect(parseCharge('R$ 25,50')).toEqual({ amount: 25.5, currency: 'BRL' });
    expect(parseCharge('20')).toBeNull();
    expect(parseCharge('$ 20')).toBeNull();
    expect(parseCharge('varia')).toBeNull();
    expect(normalizeOsmElement(node(3, { tourism: 'camp_site', fee: 'no' }), { collectedAt: NOW }).fee).toBe('free');
  });
  it('coordenadas inválidas ou ausentes descartam o registro', () => {
    expect(normalizeOsmElement(node(4, { tourism: 'camp_site' }, { lat: 120 }), { collectedAt: NOW })).toBeNull();
    expect(normalizeOsmElement({ type: 'way', id: 5, tags: { tourism: 'camp_site' } }, { collectedAt: NOW })).toBeNull();
  });
  it('way usa o centro; site que não é URL http(s) é ignorado', () => {
    const r = normalizeOsmElement({ type: 'way', id: 6, center: { lat: -23, lon: -46 }, tags: { tourism: 'camp_site', website: 'javascript:alert(1)' } }, { collectedAt: NOW });
    expect(r.lat).toBe(-23);
    expect(r.website).toBeNull();
  });
  it('escapa texto da consulta Overpass', () => {
    expect(escapeOverpass('A"B.*')).toBe('A\\"B\\.\\*');
    const q = buildOverpassQuery('Florianópolis');
    expect(q).toContain('tourism"="camp_site"');
    expect(q).toContain('tourism"="caravan_site"');
  });
});

describe('busca no Overpass', () => {
  const ok = (json) => async () => ({ ok: true, json: async () => json });
  it('retorna registros e a data de coleta', async () => {
    const r = await fetchOsmCampings('Florianópolis', {
      fetchImpl: ok({ elements: [node(1, { tourism: 'camp_site', name: 'A' })], osm3s: { timestamp_osm_base: '2026-10-28T11:00:00Z' } }),
      now: () => new Date(NOW),
    });
    expect(r.status).toBe(SEARCH_STATUS.OK);
    expect(r.records[0].source.collectedAt).toBe(NOW);
    expect(r.dataTimestamp).toBe('2026-10-28T11:00:00Z');
  });
  it('estado vazio e consulta inválida', async () => {
    expect((await fetchOsmCampings('Lugar', { fetchImpl: ok({ elements: [] }) })).status).toBe(SEARCH_STATUS.EMPTY);
    expect((await fetchOsmCampings('', { fetchImpl: ok({ elements: [] }) })).status).toBe(SEARCH_STATUS.EMPTY);
  });
  it('erro de rede, HTTP e resposta inesperada viram "unavailable"', async () => {
    const boom = async () => { throw new Error('sem rede'); };
    expect((await fetchOsmCampings('Lugar', { fetchImpl: boom })).status).toBe(SEARCH_STATUS.UNAVAILABLE);
    expect((await fetchOsmCampings('Lugar', { fetchImpl: async () => ({ ok: false, status: 429 }) })).message).toMatch(/429/);
    expect((await fetchOsmCampings('Lugar', { fetchImpl: ok({ foo: 1 }) })).status).toBe(SEARCH_STATUS.UNAVAILABLE);
    expect(() => parseOverpassResponse({ elements: [], remark: 'timeout' }, { collectedAt: NOW })).toThrow();
  });
});

describe('duplicatas e filtros', () => {
  const rec = (id, tags, extra) => normalizeOsmElement(node(id, { tourism: 'camp_site', ...tags }, extra), { collectedAt: NOW });
  const otherSource = (r) => ({ ...r, id: 'outra:9', source: { ...r.source, provider: 'outra', originalId: '9' }, sources: [{ ...r.source, provider: 'outra', originalId: '9' }] });

  it('mescla duplicata de fontes diferentes (mesmo nome, perto) preservando as duas fontes', () => {
    const a = rec(1, { name: 'Camping do Sol', toilets: 'yes' });
    const b = { ...otherSource(rec(2, { name: 'CAMPING DO SOL', website: 'https://sol.example' })), lat: -27.6003 };
    const out = dedupeLodgings([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.map((s) => s.provider)).toEqual(['osm', 'outra']);
    expect(out[0].website).toBe('https://sol.example');
    expect(out[0].amenities.toilets).toBe(true);
  });
  it('não mescla nomes diferentes, distância grande ou tipos diferentes', () => {
    const a = rec(1, { name: 'Camping do Sol' });
    expect(dedupeLodgings([a, otherSource(rec(2, { name: 'Camping da Lua' }))])).toHaveLength(2);
    expect(dedupeLodgings([a, { ...otherSource(rec(3, { name: 'Camping do Sol' })), lat: -27.7 }])).toHaveLength(2);
    const caravan = normalizeOsmElement(node(4, { tourism: 'caravan_site', name: 'Camping do Sol' }), { collectedAt: NOW });
    expect(dedupeLodgings([a, otherSource(caravan)])).toHaveLength(2);
  });
  it('sem nome nunca é mesclado por nome; mesma origem repetida é unificada', () => {
    expect(dedupeLodgings([rec(1, {}), otherSource(rec(2, {}))])).toHaveLength(2);
    expect(dedupeLodgings([rec(1, { name: 'X' }), rec(1, { name: 'X' })])).toHaveLength(1);
  });
  it('marca conflito em vez de escolher em silêncio', () => {
    const a = rec(1, { name: 'Z', shower: 'yes' });
    const b = otherSource(rec(2, { name: 'Z', shower: 'no' }));
    expect(dedupeLodgings([a, b])[0].conflicts).toContain('amenities.shower');
  });
  it('filtros: informação desconhecida não satisfaz filtro positivo e é contada', () => {
    const list = [rec(1, { name: 'A', shower: 'yes', 'addr:state': 'SC' }), rec(2, { name: 'B' }), rec(3, { name: 'C', shower: 'no' })];
    const f = filterLodgings(list, { amenities: { shower: true } });
    expect(f.records.map((r) => r.name)).toEqual(['A']);
    expect(f.hiddenUnknown).toBe(1);
    expect(filterLodgings(list, { state: 'sc' }).records).toHaveLength(1);
  });
  it('preço máximo: grátis entra, sem preço fica oculto e contado', () => {
    const list = [rec(1, { name: 'G', fee: 'no' }), rec(2, { name: 'P', fee: 'yes', charge: '40 BRL' }), rec(3, { name: 'U' })];
    const f = filterLodgings(list, { maxPrice: '50' });
    expect(f.records.map((r) => r.name).sort()).toEqual(['G', 'P']);
    expect(f.hiddenUnknown).toBe(1);
    expect(filterLodgings(list, { maxPrice: '10' }).records.map((r) => r.name)).toEqual(['G']);
  });
});
