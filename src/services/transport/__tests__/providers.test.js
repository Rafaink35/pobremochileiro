import { describe, expect, it } from 'vitest';
import { createProviderRegistry } from '../providerRegistry.js';
import { createOtpProvider, parseCoordinates } from '../openTripPlannerProvider.js';
import { safeSearch, SEARCH_STATUS, searchResult } from '../transportProvider.js';
import { describeProviderState, priceLabel, VIEW_STATE } from '../viewState.js';

const fakeProvider = (id, impl, configured = true) => ({
  id,
  name: id,
  isConfigured: () => configured,
  getSource: () => null,
  search: impl,
});

describe('falhas de provedores', () => {
  it('erro de rede vira "unavailable", sem lançar', async () => {
    const r = await safeSearch(fakeProvider('a', async () => { throw new Error('sem rede'); }), {});
    expect(r.status).toBe(SEARCH_STATUS.UNAVAILABLE);
    expect(r.message).toMatch(/sem rede/);
  });
  it('timeout vira "unavailable"', async () => {
    const slow = fakeProvider('s', () => new Promise(() => {}));
    const r = await safeSearch(slow, {}, { timeoutMs: 20 });
    expect(r.status).toBe(SEARCH_STATUS.UNAVAILABLE);
  });
  it('provedor não configurado informa isso e não busca', async () => {
    let called = false;
    const r = await safeSearch(fakeProvider('n', async () => { called = true; }, false), {});
    expect(r.status).toBe(SEARCH_STATUS.NOT_CONFIGURED);
    expect(called).toBe(false);
  });
  it('um provedor que falha não afeta os outros', async () => {
    const reg = createProviderRegistry()
      .register(fakeProvider('bom', async () => searchResult(SEARCH_STATUS.OK, { options: [{ id: 1 }] })))
      .register(fakeProvider('ruim', async () => { throw new Error('x'); }));
    const out = await reg.searchAll({});
    expect(out.find((o) => o.providerId === 'bom').status).toBe(SEARCH_STATUS.OK);
    expect(out.find((o) => o.providerId === 'ruim').status).toBe(SEARCH_STATUS.UNAVAILABLE);
  });
  it('rejeita provedor inválido', () => {
    expect(() => createProviderRegistry().register({ id: 'x' })).toThrow(/inválido/);
  });
});

describe('OpenTripPlanner', () => {
  it('sem URL configurada, informa que o roteamento não está disponível', async () => {
    const p = createOtpProvider({ baseUrl: '' });
    expect(p.isConfigured()).toBe(false);
    const r = await safeSearch(p, { origin: '-22.9,-43.2', destination: '-23.5,-46.6' });
    expect(r.status).toBe(SEARCH_STATUS.NOT_CONFIGURED);
    expect(r.options).toEqual([]);
  });
  it('lê coordenadas e recusa nomes (sem geocodificação)', () => {
    expect(parseCoordinates('-22.9, -43.2')).toEqual({ lat: -22.9, lon: -43.2 });
    expect(parseCoordinates('Rio de Janeiro')).toBeNull();
    expect(parseCoordinates('99,0')).toBeNull();
  });
  it('normaliza uma resposta simulada sem inventar preço', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        data: { plan: { itineraries: [{ startTime: 1_800_000_000_000, endTime: 1_800_003_600_000, duration: 3600, legs: [
          { mode: 'WALK', from: { name: 'A' }, to: { name: 'B' }, route: null },
          { mode: 'BUS', from: { name: 'B' }, to: { name: 'C' }, route: { shortName: '100', agency: { name: 'Op', url: 'https://op.example' } } },
        ] }] } },
      }),
    });
    const p = createOtpProvider({ baseUrl: 'http://otp.local:8080/', fetchImpl });
    const r = await safeSearch(p, { origin: '-22.9,-43.2', destination: '-23.5,-46.6' });
    expect(r.status).toBe(SEARCH_STATUS.OK);
    expect(r.options[0].mode).toBe('multimodal');
    expect(r.options[0].price).toBeNull();
    expect(r.options[0].estimated).toBe(true);
    expect(r.options[0].durationSeconds).toBe(3600);
  });
  it('resposta HTTP de erro vira indisponível', async () => {
    const p = createOtpProvider({ baseUrl: 'http://otp.local', fetchImpl: async () => ({ ok: false, status: 503 }) });
    const r = await safeSearch(p, { origin: '-22.9,-43.2', destination: '-23.5,-46.6' });
    expect(r.status).toBe(SEARCH_STATUS.UNAVAILABLE);
  });
});

describe('estados da interface', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  it('mapeia cada situação para um estado visual', () => {
    expect(describeProviderState(null).state).toBe(VIEW_STATE.LOADING);
    expect(describeProviderState({ status: 'empty' }).state).toBe(VIEW_STATE.EMPTY);
    expect(describeProviderState({ status: 'unavailable' }).state).toBe(VIEW_STATE.UNAVAILABLE);
    expect(describeProviderState({ status: 'not_configured' }).state).toBe(VIEW_STATE.NOT_CONFIGURED);
    expect(describeProviderState({ status: 'ok', source: { obtainedAt: '2020-01-01' } }, now).state).toBe(VIEW_STATE.STALE);
    expect(describeProviderState({ status: 'ok', source: { obtainedAt: '2026-10-01' } }, now).state).toBe(VIEW_STATE.RESULTS);
  });
  it('preço ausente nunca vira R$ 0', () => {
    expect(priceLabel(null)).toBe('Preço não informado');
    expect(priceLabel({ amount: 0, currency: 'BRL' })).toMatch(/0,00/);
  });
});
