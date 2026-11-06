import { describe, expect, it } from 'vitest';
import { createOsmAdapter } from '../../datalayer/sources/osm.js';
import { withBackoff } from '../../datalayer/cache.js';
import { HttpError } from '../../datalayer/cache.js';
import { createDefaultStayService, OVERPASS_POLICY } from '../index.js';
import { createStaySearch } from '../search.js';
import { createBreaker, createStaleCache } from '../cache.js';
import { jsonResponse, NOW, overpassBody, place } from './fixtures/index.js';

const SCOPE = { kind: 'around', lat: 38.7, lon: -9.1, radiusM: 5000, tourism: ['hostel'] };
const el = [{ type: 'node', id: 1, lat: 38.7, lon: -9.1, timestamp: '2026-10-01T00:00:00Z', tags: { tourism: 'hostel', name: 'Hostel X' } }];
const res = (status, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => overpassBody(el) });
const instant = { run: (fn) => fn() };

// Relógio simulado: o `sleep` avança o tempo, como numa espera real.
function clock(start = NOW.getTime()) {
  let t = start; const waits = [];
  return { now: () => new Date(t), sleep: async (ms) => { waits.push(ms); t += ms; }, waits, advance: (ms) => { t += ms; } };
}
const adapter = (fetchImpl, c, extra = {}) => createOsmAdapter({
  fetchImpl, limiter: instant, cache: { get: () => undefined, set: () => {} }, now: c.now, sleep: c.sleep,
  retries: OVERPASS_POLICY.retries, baseMs: OVERPASS_POLICY.baseMs, maxMs: OVERPASS_POLICY.baseMs, requestTimeoutMs: OVERPASS_POLICY.requestTimeoutMs, deadlineMs: OVERPASS_POLICY.deadlineMs, ...extra,
});

describe('política do Overpass (P4)', () => {
  it('constantes aprovadas: 1 nova tentativa, requisição de 65 s, prazo total de 70 s, fonte com 75 s', () => {
    expect(OVERPASS_POLICY).toEqual({ retries: 1, baseMs: 60_000, requestTimeoutMs: 65_000, deadlineMs: 70_000, sourceTimeoutMs: 75_000 });
  });

  it('502 e depois sucesso: no máximo 2 chamadas, com espera mínima de 30 s', async () => {
    const c = clock();
    let n = 0;
    const out = await adapter(async () => { n += 1; return n === 1 ? res(502) : res(200); }, c).fetch(SCOPE);
    expect(n).toBe(2);
    expect(out.elements).toHaveLength(1);
    expect(c.waits).toHaveLength(1);
    expect(c.waits[0]).toBeGreaterThanOrEqual(30_000);
    expect(c.waits[0]).toBeLessThanOrEqual(60_000);
  });

  it('502 duas vezes: falha com o status original, sem terceira chamada', async () => {
    const c = clock();
    let n = 0;
    await expect(adapter(async () => { n += 1; return res(502); }, c).fetch(SCOPE)).rejects.toMatchObject({ status: 502 });
    expect(n).toBe(2);
  });

  it('503 e 504 seguem a mesma regra; erro definitivo (400) não é repetido', async () => {
    for (const status of [503, 504]) {
      let n = 0;
      await expect(adapter(async () => { n += 1; return res(status); }, clock()).fetch(SCOPE)).rejects.toMatchObject({ status });
      expect(n).toBe(2);
    }
    let n = 0;
    await expect(adapter(async () => { n += 1; return res(400); }, clock()).fetch(SCOPE)).rejects.toMatchObject({ status: 400 });
    expect(n).toBe(1);
  });

  it('Retry-After é respeitado (não se espera menos) e não é limitado a 60 s se couber no prazo', async () => {
    const c = clock();
    let n = 0;
    await adapter(async () => { n += 1; return n === 1 ? res(429, { 'retry-after': '45' }) : res(200); }, c).fetch(SCOPE);
    expect(c.waits).toEqual([45_000]);
  });

  it('Retry-After que não cabe no prazo total: não espera e devolve o erro na hora', async () => {
    const c = clock();
    let n = 0;
    await expect(adapter(async () => { n += 1; return res(503, { 'retry-after': '120' }); }, c).fetch(SCOPE)).rejects.toMatchObject({ status: 503 });
    expect(n).toBe(1);
    expect(c.waits).toEqual([]);
  });

  it('prazo total: se a espera não cabe nos 70 s, não repete', async () => {
    const c = clock();
    let n = 0;
    // a 1ª chamada "demora" 50 s; a espera mínima de 30 s estouraria o prazo de 70 s
    await expect(adapter(async () => { n += 1; c.advance(50_000); return res(502); }, c).fetch(SCOPE)).rejects.toMatchObject({ status: 502 });
    expect(n).toBe(1);
  });

  it('cada requisição leva limite de tempo (sinal de cancelamento) e respeita o prazo restante', async () => {
    const c = clock();
    const signals = [];
    await adapter(async (_url, init) => { signals.push(init.signal); return res(200); }, c).fetch(SCOPE);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    // uma requisição que ignora o servidor e fica pendurada é cortada pelo limite
    const hung = adapter((_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))), c, { requestTimeoutMs: 1000, retries: 0, limiter: instant });
    await expect(hung.fetch(SCOPE)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('nenhuma consulta de status e nenhuma alternância entre espelhos: só o endpoint configurado, e só 1 URL', async () => {
    const c = clock();
    const urls = [];
    await expect(adapter(async (url) => { urls.push(String(url)); return res(502); }, c, { endpoint: 'https://overpass.exemplo/api/interpreter' }).fetch(SCOPE)).rejects.toBeTruthy();
    expect(urls).toEqual(['https://overpass.exemplo/api/interpreter', 'https://overpass.exemplo/api/interpreter']);
    expect(urls.some((u) => /status|kumi|private\.coffee|maps\.mail/i.test(u))).toBe(false);
  });

  it('o serviço padrão usa um único endpoint (OVERPASS_URL) e não conhece lista de espelhos', async () => {
    const seen = [];
    const f = async (url) => { seen.push(String(url)); if (String(url).includes('nominatim')) return jsonResponse([place(1, 'Lisboa', 38.7, -9.1, { country: 'Portugal', countryCode: 'PT' })]); return jsonResponse({}, { status: 502 }); };
    const svc = createDefaultStayService({ OVERPASS_URL: 'https://overpass.exemplo/api/interpreter' }, { fetchImpl: f, limiter: instant, sleep: async () => {}, now: () => NOW, searchOptions: { breaker: createBreaker({ now: () => NOW.getTime() }), cache: createStaleCache({ now: () => NOW.getTime() }) } });
    const r = await svc.search({ query: 'Lisboa', categories: 'hostel' });
    const overpass = seen.filter((u) => u.includes('overpass'));
    expect(new Set(overpass).size).toBe(1);
    expect(overpass.length).toBeLessThanOrEqual(2);
    expect(r.sources.find((s) => s.id === 'osm')).toMatchObject({ status: 'failed' });
  });

  it('a mensagem mostra o status: "ocupado ou indisponível (HTTP 502)"', async () => {
    const svc = createDefaultStayService({}, {
      fetchImpl: async (url) => (String(url).includes('nominatim') ? jsonResponse([place(1, 'Lisboa', 38.7, -9.1, { country: 'Portugal', countryCode: 'PT' })]) : jsonResponse({}, { status: 502 })),
      limiter: instant, sleep: async () => {}, now: () => NOW, searchOptions: { breaker: createBreaker({ now: () => NOW.getTime() }), cache: createStaleCache({ now: () => NOW.getTime() }) },
    });
    const r = await svc.search({ query: 'Lisboa', categories: 'hostel' });
    expect(r.sources.find((s) => s.id === 'osm').error).toBe('OpenStreetMap (Overpass) ocupado ou indisponível (HTTP 502)');
    expect(r.status).toBe('unavailable'); // nenhuma fonte com dados: indisponível, sem resultado inventado
  });
});

describe('tempo limite por fonte e total da operação', () => {
  const hung = (id) => ({ id, describe: () => ({ id, name: id, license: 'x', attribution: 'x' }), supports: () => ({ ok: true }), search: () => new Promise(() => {}) });

  it('cada fonte usa o seu limite (osm maior que o padrão) e a pesquisa termina dentro do maior limite', async () => {
    const svc = createStaySearch({ resolver: null, sources: [hung('osm'), hung('wikivoyage')], timeoutMs: 20, sourceTimeoutMs: { osm: 60 }, now: () => NOW });
    const t0 = Date.now();
    const r = await svc.search({ lat: 1, lon: 1, name: 'X', categories: 'hostel' });
    const ms = Date.now() - t0;
    expect(r.sources.map((s) => [s.id, s.status, s.error])).toEqual([['osm', 'failed', 'tempo esgotado'], ['wikivoyage', 'failed', 'tempo esgotado']]);
    expect(ms).toBeGreaterThanOrEqual(55);
    expect(ms).toBeLessThan(250);
  });

  it('o limite padrão das demais fontes continua em 25 s e o do Overpass em 75 s (configuração do serviço)', () => {
    expect(OVERPASS_POLICY.sourceTimeoutMs).toBe(75_000);
    expect(OVERPASS_POLICY.deadlineMs).toBeLessThan(OVERPASS_POLICY.sourceTimeoutMs);
  });

  it('circuito: depois de 3 falhas seguidas a fonte entra em pausa e não é chamada de novo', async () => {
    let calls = 0;
    const flaky = { id: 'osm', describe: () => ({ id: 'osm', name: 'OpenStreetMap (Overpass)', license: 'x', attribution: 'x' }), supports: () => ({ ok: true }), search: async () => { calls += 1; throw new HttpError(502); } };
    const t = NOW.getTime();
    const svc = createStaySearch({ resolver: null, sources: [flaky], now: () => NOW, breaker: createBreaker({ threshold: 3, cooldownMs: 600_000, now: () => t }), cache: createStaleCache({ now: () => t }) });
    for (let i = 0; i < 3; i += 1) await svc.search({ lat: 38 + i, lon: -9, name: 'X', categories: 'hostel' });
    expect(calls).toBe(3);
    const r = await svc.search({ lat: 50, lon: -9, name: 'X', categories: 'hostel' });
    expect(calls).toBe(3); // pausa: nenhuma chamada nova
    expect(r.sources[0].error).toMatch(/pausa/);
  });

  it('withBackoff genérico: prazo total e Retry-After, sem mudar o comportamento padrão', async () => {
    const waits = [];
    const sleep = async (ms) => waits.push(ms);
    let n = 0;
    await withBackoff(async () => { n += 1; if (n < 2) throw new HttpError(429, 90_000); return 1; }, { sleep }); // sem prazo: espera o que o servidor pediu (sem teto de 60 s)
    expect(waits).toEqual([90_000]);
    n = 0; waits.length = 0;
    await expect(withBackoff(async () => { n += 1; throw new HttpError(503, 90_000); }, { sleep, now: () => 0, deadlineAt: 10_000 })).rejects.toMatchObject({ status: 503 });
    expect(n).toBe(1);
    expect(waits).toEqual([]);
  });
});
