import { describe, expect, it } from 'vitest';
import {
  createTravelOption,
  durationSeconds,
  formatDuration,
  formatServiceTime,
  gtfsRouteTypeToMode,
  isStale,
  MODES,
  normalizePrice,
  parseGtfsTime,
} from '../normalizers.js';

describe('preço', () => {
  it('distingue ausente de zero', () => {
    expect(normalizePrice(null, 'BRL')).toBeNull();
    expect(normalizePrice('', 'BRL')).toBeNull();
    expect(normalizePrice(undefined, 'BRL')).toBeNull();
    expect(normalizePrice(0, 'BRL')).toEqual({ amount: 0, currency: 'BRL' });
  });
  it('rejeita moeda inválida ou valor negativo', () => {
    expect(normalizePrice(10, '')).toBeNull();
    expect(normalizePrice(10, 'real')).toBeNull();
    expect(normalizePrice(-1, 'BRL')).toBeNull();
    expect(normalizePrice('abc', 'BRL')).toBeNull();
  });
  it('aceita vírgula decimal', () => {
    expect(normalizePrice('12,5', 'brl')).toEqual({ amount: 12.5, currency: 'BRL' });
  });
  it('opção sem preço é marcada como incompleta, nunca com preço 0', () => {
    const o = createTravelOption({ id: 'x', mode: MODES.BUS }, null);
    expect(o.price).toBeNull();
    expect(o.incomplete).toBe(true);
    expect(o.issues).toContain('Preço não informado');
  });
  it('opção com preço zero real mantém zero', () => {
    const o = createTravelOption({ mode: MODES.BUS, price: { amount: 0, currency: 'BRL' } }, null);
    expect(o.price).toEqual({ amount: 0, currency: 'BRL' });
  });
});

describe('horários GTFS', () => {
  it('trata horas acima de 24:00', () => {
    expect(parseGtfsTime('25:10:00')).toBe(25 * 3600 + 10 * 60);
    expect(formatServiceTime(parseGtfsTime('25:10:00'))).toBe('01:10 (+1 dia)');
    expect(formatServiceTime(parseGtfsTime('48:05:00'))).toBe('00:05 (+2 dias)');
  });
  it('duração atravessa a meia-noite', () => {
    const d = durationSeconds(parseGtfsTime('23:00:00'), parseGtfsTime('25:10:00'));
    expect(formatDuration(d)).toBe('2 h 10 min');
  });
  it('valores inválidos ou vazios viram null', () => {
    expect(parseGtfsTime('')).toBeNull();
    expect(parseGtfsTime('7:61:00')).toBeNull();
    expect(parseGtfsTime(undefined)).toBeNull();
    expect(durationSeconds(null, 100)).toBeNull();
    expect(durationSeconds(200, 100)).toBeNull();
  });
});

describe('modalidade e atualização', () => {
  it('mapeia route_type', () => {
    expect(gtfsRouteTypeToMode(3)).toBe(MODES.BUS);
    expect(gtfsRouteTypeToMode('2')).toBe(MODES.TRAIN);
    expect(gtfsRouteTypeToMode(1)).toBe(MODES.SUBWAY);
    expect(gtfsRouteTypeToMode(4)).toBe(MODES.FERRY);
    expect(gtfsRouteTypeToMode(99)).toBe(MODES.OTHER);
  });
  it('dados sem data são tratados como desatualizados', () => {
    const now = new Date('2026-10-28T00:00:00Z');
    expect(isStale(null, now)).toBe(true);
    expect(isStale('2026-10-01', now)).toBe(false);
    expect(isStale('2025-01-01', now)).toBe(true);
  });
});
