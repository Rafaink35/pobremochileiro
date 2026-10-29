import { describe, expect, it } from 'vitest';
import { createGtfsProvider, fareForRoute, importGtfsZip, parseCsv, serviceActive } from '../gtfsProvider.js';
import { SEARCH_STATUS } from '../transportProvider.js';
import { makeZip } from './helpers.js';

const META = { name: 'Teste', url: 'https://example.org/gtfs.zip', license: 'CC BY 4.0', attribution: 'Teste' };

describe('importação GTFS', () => {
  it('aceita um conjunto válido e conta registros', () => {
    const { dataset, errors } = importGtfsZip(makeZip(), META);
    expect(errors).toEqual([]);
    expect(dataset.counts).toMatchObject({ stops: 3, routes: 1, trips: 2 });
    expect(dataset.meta.obtainedAt).toBeTruthy();
    expect(dataset.meta.license).toBe('CC BY 4.0');
  });
  it('lida com aspas no CSV', () => {
    expect(parseCsv('a,b\n1,"x ""y"", z"\n')).toEqual([{ a: '1', b: 'x "y", z' }]);
  });
  it('rejeita arquivo que não é ZIP, sem lançar erro', () => {
    const r = importGtfsZip(new Uint8Array([1, 2, 3]), META);
    expect(r.dataset).toBeNull();
    expect(r.errors[0]).toMatch(/ZIP/);
  });
  it('lista arquivos obrigatórios ausentes', () => {
    const r = importGtfsZip(makeZip({ 'routes.txt': null, 'stops.txt': null }), META);
    expect(r.dataset).toBeNull();
    expect(r.errors[0]).toMatch(/routes\.txt/);
    expect(r.errors[0]).toMatch(/stops\.txt/);
  });
  it('exige calendar.txt ou calendar_dates.txt', () => {
    const r = importGtfsZip(makeZip({ 'calendar.txt': null }), META);
    expect(r.errors.join(' ')).toMatch(/calendar/);
  });
  it('registra referências inválidas como avisos e segue', () => {
    const r = importGtfsZip(
      makeZip({ 'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,SX,1\nT1,09:00:00,09:00:00,S3,2\n' }),
      META,
    );
    expect(r.dataset).not.toBeNull();
    expect(r.warnings.join(' ')).toMatch(/inexistente/);
  });
  it('não duplica o mesmo conjunto importado de novo', () => {
    const registry = new Map();
    const zip = makeZip();
    const a = importGtfsZip(zip, META, registry);
    const b = importGtfsZip(zip, META, registry);
    expect(b.duplicate).toBe(true);
    expect(b.dataset).toBe(a.dataset);
    expect(registry.size).toBe(1);
  });
});

describe('calendário e tarifas', () => {
  it('respeita dias da semana e exceções', () => {
    const zip = makeZip({
      'calendar_dates.txt': 'service_id,date,exception_type\nWK,20261104,2\nWK,20261107,1\n',
    });
    const { dataset } = importGtfsZip(zip, META);
    expect(serviceActive(dataset, 'WK', '2026-11-03')).toBe(true); // terça
    expect(serviceActive(dataset, 'WK', '2026-11-04')).toBe(false); // exceção: removido
    expect(serviceActive(dataset, 'WK', '2026-11-07')).toBe(true); // sábado adicionado
    expect(serviceActive(dataset, 'WK', '2026-11-08')).toBe(false); // domingo
  });
  it('sem fare_attributes o preço é null, não zero', () => {
    const { dataset } = importGtfsZip(makeZip(), META);
    expect(dataset.hasFares).toBe(false);
    expect(fareForRoute(dataset, 'R1')).toBeNull();
  });
  it('tarifa 0 declarada é preservada; ambiguidade vira null', () => {
    const zip = makeZip({
      'fare_attributes.txt': 'fare_id,price,currency_type,payment_method,transfers\nF0,0.00,BRL,0,0\n',
      'fare_rules.txt': 'fare_id,route_id\nF0,R1\n',
    });
    const { dataset } = importGtfsZip(zip, META);
    expect(fareForRoute(dataset, 'R1')).toEqual({ amount: 0, currency: 'BRL' });
    const zip2 = makeZip({
      'fare_attributes.txt': 'fare_id,price,currency_type,payment_method,transfers\nF1,10,BRL,0,0\nF2,20,BRL,0,0\n',
      'fare_rules.txt': 'fare_id,route_id\nF1,R1\nF2,R1\n',
    });
    expect(fareForRoute(importGtfsZip(zip2, META).dataset, 'R1')).toBeNull();
  });
});

describe('busca no provedor GTFS', () => {
  it('não está configurado sem conjuntos importados', () => {
    expect(createGtfsProvider().isConfigured()).toBe(false);
  });
  it('acha viagens diretas, com horário após meia-noite e dados incompletos', async () => {
    const p = createGtfsProvider();
    p.importZip(makeZip(), META);
    const r = await p.search({ origin: 'terminal rio', destination: 'rodoviaria sp', date: '2026-11-03' });
    expect(r.status).toBe(SEARCH_STATUS.OK);
    expect(r.options).toHaveLength(2);
    const night = r.options.find((o) => o.id.endsWith(':T1'));
    expect(night.durationSeconds).toBe(2 * 3600 + 10 * 60);
    expect(night.price).toBeNull();
    expect(night.incomplete).toBe(true);
    expect(night.source.license).toBe('CC BY 4.0');
    expect(night.estimated).toBe(false);
  });
  it('não devolve viagem fora do dia de serviço', async () => {
    const p = createGtfsProvider();
    p.importZip(makeZip(), META);
    const r = await p.search({ origin: 'Terminal Rio', destination: 'Rodoviária SP', date: '2026-11-08' }); // domingo
    expect(r.status).toBe(SEARCH_STATUS.EMPTY);
    expect(r.options).toEqual([]);
  });
});
