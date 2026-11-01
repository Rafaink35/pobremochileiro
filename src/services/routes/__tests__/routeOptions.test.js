import { describe, expect, it } from 'vitest';
import { buildRouteOptions, OPTION_KIND } from '../routeOptions.js';
import { findCity, CITIES } from '../../../data/airports.js';

const A = findCity('São Paulo');
const B = findCity('lis');
const flight = (total, extra = {}) => ({ price: total, total, passengers: 1, airline: 'TP', transfers: 0, departureAt: '2026-12-01', link: `https://x/${total}`, ...extra });

describe('catálogo de cidades', () => {
  it('acha por nome, código ou rótulo, sem acento nem caixa', () => {
    expect(findCity('sao paulo').iata).toBe('GRU');
    expect(findCity('Lisboa (LIS)').city).toBe('Lisboa');
    expect(findCity('xyz')).toBeNull();
    expect(new Set(CITIES.map((c) => c.iata)).size).toBe(CITIES.length);
  });
});

describe('opções de rota', () => {
  it('ordena voos por preço confirmado e marca só o mais barato como melhor', () => {
    const o = buildRouteOptions({ origin: A, destination: B, flights: [flight(3000), flight(2000), flight(2500)] });
    expect(o.filter((x) => x.kind === OPTION_KIND.FLIGHT).map((x) => x.price)).toEqual([2000, 2500, 3000]);
    expect(o.filter((x) => x.best)).toHaveLength(1);
    expect(o[0].best).toBe(true);
  });
  it('descarta voo sem preço válido ou sem link e nunca inventa duração', () => {
    const o = buildRouteOptions({ origin: A, destination: B, flights: [flight(0), flight(null), { ...flight(900), link: '' }, flight(1500)] });
    const flights = o.filter((x) => x.kind === OPTION_KIND.FLIGHT);
    expect(flights).toHaveLength(1);
    expect(flights[0].durationText).toBeNull();
  });
  it('sem nenhum voo, sobra só o trecho terrestre, sem preço e sem "melhor"', () => {
    const o = buildRouteOptions({ origin: A, destination: B, flights: [] });
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ kind: OPTION_KIND.GROUND, price: null });
    expect(o.some((x) => x.best)).toBe(false);
  });
  it('terra: ônibus no mesmo país, trem e ônibus entre países', () => {
    expect(buildRouteOptions({ origin: A, destination: findCity('Rio de Janeiro'), flights: [] }).at(-1).sameCountry).toBe(true);
    expect(buildRouteOptions({ origin: A, destination: B, flights: [] }).at(-1).sameCountry).toBe(false);
  });
  it('respeita o limite de voos mostrados e soma passageiros no total já recebido', () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => flight(1000 + n, { passengers: 2, price: (1000 + n) / 2 }));
    const o = buildRouteOptions({ origin: A, destination: B, flights: many, maxFlights: 3 });
    expect(o.filter((x) => x.kind === OPTION_KIND.FLIGHT)).toHaveLength(3);
    expect(o[0].perPerson).toBe(500.5);
  });
});
