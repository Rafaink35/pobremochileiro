import { describe, expect, it } from 'vitest';
import { externalMapLinks, haversineMeters, parseLatLon, validateCoordinates } from '../geo.js';
import { createGtfsProvider, findStops, importGtfsZip } from '../transport/gtfsProvider.js';
import { createProviderRegistry } from '../transport/providerRegistry.js';
import { createOtpProvider } from '../transport/openTripPlannerProvider.js';
import { SEARCH_STATUS } from '../transport/transportProvider.js';
import { makeZip } from '../transport/__tests__/helpers.js';

describe('coordenadas e links externos', () => {
  it('rejeita coordenadas inválidas', () => {
    for (const [a, b] of [[91, 0], [0, 181], ['x', 1], ['', ''], [null, null], [NaN, 0]]) expect(validateCoordinates(a, b)).toBeNull();
    expect(validateCoordinates('-22.9', ' -43.2')).toEqual({ lat: -22.9, lon: -43.2 });
    expect(parseLatLon('-22.9,-43.2')).toEqual({ lat: -22.9, lon: -43.2 });
    expect(parseLatLon('99,0')).toBeNull();
  });
  it('gera links externos só com coordenadas válidas', () => {
    expect(externalMapLinks(999, 0)).toBeNull();
    const l = externalMapLinks(-22.9, -43.2);
    expect(l.openStreetMap).toBe('https://www.openstreetmap.org/?mlat=-22.9&mlon=-43.2#map=15/-22.9/-43.2');
    expect(l.googleMaps).toBe('https://www.google.com/maps/search/?api=1&query=-22.9%2C-43.2');
  });
  it('distância haversine é plausível', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeGreaterThan(111000);
  });
});

describe('transporte até um local (coordenadas reais)', () => {
  const META = { name: 'Teste', url: 'https://x', license: 'CC BY 4.0', attribution: 'Teste' };
  it('acha paradas num raio de 800 m do ponto', () => {
    const { dataset } = importGtfsZip(makeZip(), META);
    expect(findStops(dataset, '-22.9,-43.2').map((s) => s.stop_id)).toEqual(['S1']);
    expect(findStops(dataset, '10,10')).toEqual([]);
  });
  it('rota de provedor configurado vem com fonte, horário programado e sem preço inventado', async () => {
    const gtfs = createGtfsProvider();
    gtfs.importZip(makeZip(), META);
    const reg = createProviderRegistry().register(gtfs);
    const [r] = await reg.searchAll({ origin: 'Terminal Rio', destination: '-23.5,-46.6', date: '2026-11-03' });
    expect(r.status).toBe(SEARCH_STATUS.OK);
    expect(r.options[0].estimated).toBe(false);
    expect(r.options[0].price).toBeNull();
    expect(r.options[0].source.license).toBe('CC BY 4.0');
    expect(gtfs.describeCoverage().modes).toEqual(['bus']);
  });
  it('rota indisponível: sem provedor configurado nada é inventado', async () => {
    const reg = createProviderRegistry().register(createGtfsProvider()).register(createOtpProvider({ baseUrl: '' }));
    const out = await reg.searchAll({ origin: '-22.9,-43.2', destination: '-27.6,-48.5' });
    expect(out.every((r) => r.status === SEARCH_STATUS.NOT_CONFIGURED && r.options.length === 0)).toBe(true);
  });
  it('GTFS configurado mas sem viagem direta: estado vazio', async () => {
    const gtfs = createGtfsProvider();
    gtfs.importZip(makeZip(), META);
    const r = await gtfs.search({ origin: '-22.9,-43.2', destination: '10,10', date: '2026-11-03' });
    expect(r.status).toBe(SEARCH_STATUS.EMPTY);
  });
});
