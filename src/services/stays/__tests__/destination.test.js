import { describe, expect, it } from 'vitest';
import { createDestinationResolver, isAmbiguous, RESOLVE_STATUS, toCandidate, validateQuery } from '../destination.js';
import { CITIES, fakeFetch, jsonResponse, place, NOW } from './fixtures/index.js';
import { REAL } from './fixtures/real-nominatim-snapshots.js';

const instant = { run: (fn) => fn() };
const resolver = (fetchImpl, o = {}) => createDestinationResolver({ fetchImpl, limiter: instant, sleep: async () => {}, now: () => NOW, contact: 'teste@example.test', ...o });

describe('resolvedor global de destinos', () => {
  it.each([['lisboa', 'PT'], ['buenosAires', 'AR'], ['paraty', 'BR']])('resolve %s sem ambiguidade', async (key, cc) => {
    const r = await resolver(fakeFetch()).resolve(CITIES[key].query);
    expect(r.status).toBe(RESOLVE_STATUS.OK);
    expect(r.destination.countryCode).toBe(cc);
    expect(r.destination.radiusM).toBeGreaterThanOrEqual(2000);
    expect(r.destination.radiusM).toBeLessThanOrEqual(25000);
  });
  it('guarda o nome em inglês (usado nas fontes) e o código de região', async () => {
    const r = await resolver(fakeFetch()).resolve('Paraty');
    expect(r.destination.nameEn).toBe('Paraty');
    expect(r.destination.regionCode).toBe('BR-RJ');
    expect((await resolver(fakeFetch()).resolve('Lisboa')).destination.nameEn).toBe('Lisbon');
  });
  it('destino ambíguo (Santiago do Chile × Santiago da Costa Rica) devolve candidatos, sem escolher', async () => {
    const r = await resolver(fakeFetch()).resolve('Santiago');
    expect(r.status).toBe(RESOLVE_STATUS.AMBIGUOUS);
    expect(r.candidates.map((c) => c.countryCode)).toEqual(['CL', 'CR']);
    expect(r.destination).toBeUndefined();
  });
  it('mesmo nome no mesmo país e perto não é ambíguo; importância muito diferente também não', () => {
    const a = toCandidate(place(1, 'X', 10, 10, { country: 'A', countryCode: 'AA', importance: 0.8 }));
    const near = toCandidate(place(2, 'X2', 10.05, 10.05, { country: 'A', countryCode: 'AA', importance: 0.8 }));
    const weak = toCandidate(place(3, 'X3', 12, 12, { country: 'A', countryCode: 'AA', importance: 0.1 }));
    expect(isAmbiguous([a, near])).toBe(false);
    expect(isAmbiguous([a, weak])).toBe(false);
  });
  it('Tóquio em japonês: usa a cidade em vez da província gigante e o nome em inglês vem junto', async () => {
    const r = await resolver(fakeFetch()).resolve('東京');
    expect(r.status).toBe(RESOLVE_STATUS.OK);
    expect(r.destination.name).toBe('東京');
    expect(r.destination.nameEn).toBe('Tokyo');
    expect(r.destination.countryCode).toBe('JP');
  });
  it('país ou estado inteiro é "área ampla"; coordenadas informadas passam direto', async () => {
    const country = { query: 'Portugal', nominatim: [place(5, 'Portugal', 39.5, -8, { country: 'Portugal', countryCode: 'PT', kind: 'country', bbox: ['32', '42', '-31', '-6'] })], elements: [] };
    const r = await resolver(fakeFetch({ cities: { country } })).resolve('Portugal');
    expect(r.status).toBe(RESOLVE_STATUS.TOO_BROAD);
    const c = await resolver(fakeFetch()).resolve('38.7167, -9.1333');
    expect(c.status).toBe(RESOLVE_STATUS.OK);
    expect(c.destination.lat).toBeCloseTo(38.7167);
  });
  it('não encontrado, entrada inválida e serviço indisponível têm estados próprios', async () => {
    expect((await resolver(fakeFetch()).resolve('Lugar que não existe')).status).toBe(RESOLVE_STATUS.NOT_FOUND);
    for (const bad of ['', 'a', 'x'.repeat(81), 'a<script>', null]) expect((await resolver(fakeFetch()).resolve(bad)).status).toBe(RESOLVE_STATUS.INVALID);
    const down = async () => jsonResponse({}, { status: 503 });
    const r = await resolver(down).resolve('Lisboa');
    expect(r.status).toBe(RESOLVE_STATUS.UNAVAILABLE);
    expect(r.message).toMatch(/503/);
  });
  it('cache de 24 h: a segunda consulta do mesmo texto não vai ao serviço', async () => {
    const f = fakeFetch();
    const rs = resolver(f);
    await rs.resolve('Lisboa');
    const again = await rs.resolve('  lisboa ');
    expect(f.calls.nominatim).toBe(1);
    expect(again.fromCache).toBe(true);
  });
  it('envia User-Agent identificado e nunca coloca chaves na URL', async () => {
    let seen;
    await resolver(async (url, init) => { seen = { url: String(url), init }; return jsonResponse([]); }).resolve('Lisboa');
    expect(seen.init.headers['user-agent']).toMatch(/PobreMochileiro.*teste@example\.test/);
    expect(seen.url).not.toMatch(/key|token|secret/i);
  });
  it('validateQuery aceita qualquer alfabeto', () => {
    for (const q of ['東京', 'Αθήνα', 'القاهرة', 'São Paulo', 'Москва']) expect(validateQuery(q)).toBe(q);
  });
});

describe('casos reais do Nominatim (snapshots de 06/11/2026)', () => {
  const real = (q) => resolver(async () => jsonResponse(REAL[q])).resolve(q);
  it('Lisboa: cidade, sem confundir com o distrito de mesmo nome', async () => {
    const r = await real('Lisboa');
    expect(r.status).toBe(RESOLVE_STATUS.OK);
    expect(r.destination.id).toBe('relation/5400890');
  });
  it('Buenos Aires: cidade; a província e o condado da Costa Rica não tornam ambíguo', async () => {
    const r = await real('Buenos Aires');
    expect(r.status).toBe(RESOLVE_STATUS.OK);
    expect(r.destination.countryCode).toBe('AR');
  });
  it('Paraty: o município do Rio, não o achado só por nome alternativo (Araquari)', async () => {
    const r = await real('Paraty');
    expect(r.status).toBe(RESOLVE_STATUS.OK);
    expect(r.destination.id).toBe('relation/1277591');
  });
  it('Santiago: empate real entre Chile e Costa Rica pede escolha; Santiago de Cuba etc. ficam de fora', async () => {
    const r = await real('Santiago');
    expect(r.status).toBe(RESOLVE_STATUS.AMBIGUOUS);
    expect(r.candidates.map((c) => c.countryCode).sort()).toEqual(['BR', 'CL', 'CR']);
  });
  it('Tóquio é uma província: oferece pesquisa a 15 km do ponto de referência, sem fingir cobrir a área toda', async () => {
    const r = await real('Tóquio');
    expect(r.status).toBe(RESOLVE_STATUS.BROAD);
    expect(r.candidates[0]).toMatchObject({ radiusM: 15000, referencePoint: true });
    expect(r.message).toMatch(/não cobre a área inteira/);
  });
  it('Paris: a França é muito mais importante que o Texas, sem ambiguidade; país inteiro continua recusado', async () => {
    expect((await real('Paris')).destination.countryCode).toBe('FR');
    const country = { ...REAL.Tóquio[0], addresstype: 'country', display_name: 'Japão', name: 'Japão' };
    expect((await resolver(async () => jsonResponse([country])).resolve('Japão')).status).toBe(RESOLVE_STATUS.TOO_BROAD);
  });
});
