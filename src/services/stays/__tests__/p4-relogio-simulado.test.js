// Demonstração do P4 com RELÓGIO SIMULADO (nenhuma espera real, nenhuma rede): prazo total, Retry-After, segunda tentativa,
// circuito e "nada é consultado depois que a operação termina".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOsmAdapter } from '../../datalayer/sources/osm.js';
import { createDefaultStayService, OVERPASS_POLICY } from '../index.js';
import { createBreaker, createStaleCache } from '../cache.js';
import { jsonResponse, NOW, overpassBody, place } from './fixtures/index.js';

const T0 = NOW.getTime();
const SCOPE = { kind: 'around', lat: 38.7, lon: -9.1, radiusM: 5000, tourism: ['hostel'] };
const instant = { run: (fn) => fn() };
const EL = [{ type: 'node', id: 1, lat: 38.7, lon: -9.1, timestamp: '2026-10-01T00:00:00Z', tags: { tourism: 'hostel', name: 'Hostel X' } }];
const MIN_WAIT = OVERPASS_POLICY.baseMs / 2; // espera mínima da política: 30 s
const MIN_ATTEMPT = OVERPASS_POLICY.minAttemptMs;

function simClock() {
  let t = T0;
  const waits = [];
  return { now: () => new Date(t), ms: () => t, elapsed: () => t - T0, advance: (ms) => { t += ms; }, waits, sleep: async (ms) => { waits.push(ms); t += ms; } };
}

// Captura o tempo pedido a cada requisição (AbortSignal.timeout) para simular o corte por tempo limite.
let requested;
beforeEach(() => {
  requested = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => { requested.push(ms); return new AbortController().signal; });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Overpass simulado: cada chamada "dura" `duration` (cortada no tempo limite pedido) e termina em 502, ou em erro de tempo. */
function overpass(c, { duration = 0, retryAfter = null, log = [] } = {}) {
  return async () => {
    const startedAt = c.elapsed();
    const limit = requested.at(-1);
    log.push({ startedAt, limit });
    if (duration > limit) { c.advance(limit); throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }
    c.advance(duration);
    return { ok: false, status: 502, headers: { get: (k) => (k.toLowerCase() === 'retry-after' && retryAfter !== null ? String(retryAfter) : null) }, json: async () => ({}) };
  };
}
const adapter = (c, fetchImpl, extra = {}) => createOsmAdapter({
  fetchImpl, limiter: instant, cache: { get: () => undefined, set: () => {} }, now: c.now, sleep: c.sleep, retries: OVERPASS_POLICY.retries, baseMs: OVERPASS_POLICY.baseMs,
  maxMs: OVERPASS_POLICY.baseMs, requestTimeoutMs: OVERPASS_POLICY.requestTimeoutMs, deadlineMs: OVERPASS_POLICY.deadlineMs, minAttemptMs: OVERPASS_POLICY.minAttemptMs, ...extra,
});

const DURATIONS = [0, 3_000, 20_000, 39_000, 40_000, 55_000, 64_000, 65_000, 90_000];
const RETRY_AFTERS = [null, 1, 10, 30, 45, 60, 65, 120];
const JITTERS = [0, 0.5, 1];

describe('P4 (1): o prazo total de 70 s nunca é ultrapassado', () => {
  it('em toda combinação de duração da 1ª chamada, Retry-After e jitter, o tempo simulado fica ≤ 70 s e as chamadas ≤ 2', async () => {
    let cases = 0;
    let maxElapsed = 0;
    for (const d of DURATIONS) for (const ra of RETRY_AFTERS) for (const j of JITTERS) {
      vi.spyOn(Math, 'random').mockReturnValue(j);
      requested = [];
      const c = simClock();
      const log = [];
      await adapter(c, overpass(c, { duration: d, retryAfter: ra, log })).fetch(SCOPE).catch(() => {});
      cases += 1;
      maxElapsed = Math.max(maxElapsed, c.elapsed());
      expect(c.elapsed(), `d=${d} ra=${ra} j=${j}`).toBeLessThanOrEqual(OVERPASS_POLICY.deadlineMs);
      expect(log.length).toBeLessThanOrEqual(2);
      for (const call of log) expect(call.startedAt + call.limit, `fim da chamada d=${d} ra=${ra} j=${j}`).toBeLessThanOrEqual(OVERPASS_POLICY.deadlineMs);
      expect(Math.max(...requested)).toBeLessThanOrEqual(OVERPASS_POLICY.requestTimeoutMs);
    }
    expect(cases).toBe(DURATIONS.length * RETRY_AFTERS.length * JITTERS.length);
    expect(maxElapsed).toBeLessThanOrEqual(70_000);
  });
});

describe('P4 (2): o Retry-After é respeitado', () => {
  it('quando cabe, espera exatamente o que o servidor pediu (nunca menos, sem teto de 60 s)', async () => {
    for (const ra of [1, 10, 30, 45, 60]) {
      const c = simClock();
      await adapter(c, overpass(c, { retryAfter: ra })).fetch(SCOPE).catch(() => {});
      expect(c.waits, `Retry-After ${ra}`).toEqual([ra * 1000]);
    }
  });
  it('quando não cabe no prazo restante, não espera e devolve o erro (nenhuma espera menor que a pedida)', async () => {
    for (const ra of [66, 120, 600]) {
      const c = simClock();
      const log = [];
      await expect(adapter(c, overpass(c, { retryAfter: ra, log })).fetch(SCOPE)).rejects.toMatchObject({ status: 502 });
      expect(c.waits).toEqual([]);
      expect(log).toHaveLength(1);
    }
  });
  it('sem Retry-After, a espera fica entre 30 e 60 s', async () => {
    for (const j of JITTERS) {
      vi.spyOn(Math, 'random').mockReturnValue(j);
      const c = simClock();
      await adapter(c, overpass(c)).fetch(SCOPE).catch(() => {});
      expect(c.waits[0]).toBeGreaterThanOrEqual(30_000);
      expect(c.waits[0]).toBeLessThanOrEqual(60_000);
    }
  });
});

describe('P4 (3): a segunda tentativa só ocorre quando cabe no prazo restante', () => {
  it('há 2ª chamada se, e somente se, (tempo gasto + espera + tempo mínimo útil) ≤ 70 s', async () => {
    let retried = 0;
    let notRetried = 0;
    for (const d of [0, 10_000, 30_000, 34_000, 35_000, 36_000, 50_000]) for (const ra of RETRY_AFTERS) for (const j of JITTERS) {
      vi.spyOn(Math, 'random').mockReturnValue(j);
      requested = [];
      const c = simClock();
      const log = [];
      await adapter(c, overpass(c, { duration: d, retryAfter: ra, log })).fetch(SCOPE).catch(() => {});
      const wait = ra !== null ? ra * 1000 : MIN_WAIT + (OVERPASS_POLICY.baseMs - MIN_WAIT) * j;
      const fits = d + wait + MIN_ATTEMPT <= OVERPASS_POLICY.deadlineMs;
      expect(log.length === 2, `d=${d} ra=${ra} j=${j}`).toBe(fits);
      if (fits) { retried += 1; expect(log[1].limit).toBeGreaterThanOrEqual(MIN_ATTEMPT); } else notRetried += 1;
    }
    expect(retried).toBeGreaterThan(0);
    expect(notRetried).toBeGreaterThan(0);
  });
});

describe('P4 (4): o circuito continua pausando após três falhas (relógio simulado)', () => {
  it('3 operações falham, a 4ª não consulta o Overpass; passados 10 min a fonte volta a ser tentada', async () => {
    const c = simClock();
    const external = { overpass: 0 };
    let overpassStatus = 502;
    const f = async (url) => {
      const u = String(url);
      if (u.includes('overpass')) { external.overpass += 1; return overpassStatus === 200 ? jsonResponse(overpassBody(EL)) : jsonResponse({}, { status: overpassStatus }); }
      return jsonResponse({ query: { pages: [{ title: 'x', missing: true }] } }); // Wikivoyage: sem página
    };
    const svc = createDefaultStayService({}, {
      fetchImpl: f, limiter: instant, sleep: c.sleep, now: c.now,
      searchOptions: { breaker: createBreaker({ threshold: 3, cooldownMs: 600_000, now: c.ms }), cache: createStaleCache({ now: c.ms }) },
    });
    const run = (lon) => svc.search({ lat: 38.7, lon, name: 'Lisboa', categories: 'hostel' });
    for (let i = 0; i < 3; i += 1) { const r = await run(-9.1 + i * 0.5); expect(r.sources.find((s) => s.id === 'osm').status).toBe('failed'); }
    const callsBeforePause = external.overpass;
    expect(callsBeforePause).toBe(6); // 3 operações × (1ª tentativa + 1 nova tentativa)
    const paused = await run(-7.5);
    expect(external.overpass).toBe(callsBeforePause); // pausa: nenhuma consulta nova
    expect(paused.sources.find((s) => s.id === 'osm').error).toMatch(/pausa/);
    c.advance(599_000);
    await run(-7.4);
    expect(external.overpass).toBe(callsBeforePause); // ainda dentro dos 10 min
    c.advance(2_000);
    overpassStatus = 200;
    const back = await run(-7.3);
    expect(external.overpass).toBe(callsBeforePause + 1); // depois de 10 min, volta a tentar
    expect(back.sources.find((s) => s.id === 'osm').status).toBe('ok');
  });
});

describe('P4 (5): nenhuma fonte externa é consultada depois do encerramento da operação', () => {
  const setup = (responses) => {
    const calls = [];
    const f = async (url) => {
      const u = String(url);
      const kind = u.includes('nominatim') ? 'nominatim' : u.includes('overpass') ? 'overpass' : 'wikivoyage';
      calls.push({ kind, at: Date.now() });
      return responses[kind]();
    };
    return { calls, f };
  };
  const throttled = (kind) => jsonResponse({}, { status: kind });
  const withHeaders = (status, retryAfter) => ({ ok: false, status, headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? String(retryAfter) : null) }, json: async () => ({}) });

  it('Overpass e Wikivoyage pedindo para esperar 60 s: depois que a pesquisa termina, nenhuma chamada nova acontece', async () => {
    vi.useFakeTimers({ now: T0 });
    const { calls, f } = setup({ overpass: () => withHeaders(429, 60), wikivoyage: () => withHeaders(429, 60), nominatim: () => jsonResponse([]) });
    const svc = createDefaultStayService({}, { fetchImpl: f });
    let endedAt = null;
    const op = svc.search({ lat: 38.7, lon: -9.1, name: 'Lisboa', categories: 'hostel' }).then((r) => { endedAt = Date.now(); return r; });
    await vi.advanceTimersByTimeAsync(80_000);
    const r = await op;
    expect(endedAt - T0).toBeLessThanOrEqual(OVERPASS_POLICY.sourceTimeoutMs); // a operação acaba dentro do maior limite (75 s)
    const callsAtEnd = calls.length;
    expect(callsAtEnd).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(30 * 60_000); // 30 minutos depois
    expect(calls.length).toBe(callsAtEnd);
    expect(calls.every((c) => c.at <= endedAt)).toBe(true);
    expect(['partial', 'unavailable']).toContain(r.status);
  });

  it('o geocodificador também fica dentro do prazo e não é consultado de novo depois do fim', async () => {
    vi.useFakeTimers({ now: T0 });
    const { calls, f } = setup({ overpass: () => throttled(502), wikivoyage: () => throttled(502), nominatim: () => withHeaders(429, 120) });
    const svc = createDefaultStayService({}, { fetchImpl: f });
    let endedAt = null;
    const op = svc.search({ query: 'Lisboa', categories: 'hostel' }).then((r) => { endedAt = Date.now(); return r; });
    await vi.advanceTimersByTimeAsync(40_000);
    const r = await op;
    expect(r.status).toBe('unavailable');
    expect(endedAt - T0).toBeLessThanOrEqual(25_000);
    const callsAtEnd = calls.filter((c) => c.kind === 'nominatim').length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls.filter((c) => c.kind === 'nominatim').length).toBe(callsAtEnd);
    expect(calls.every((c) => c.at <= endedAt)).toBe(true);
  });

  it('chamada que estava na fila do limitador de taxa quando a operação acabou não é enviada depois', async () => {
    vi.useFakeTimers({ now: T0 });
    const { calls, f } = setup({ overpass: () => jsonResponse(overpassBody(EL)), wikivoyage: () => jsonResponse({ query: { pages: [{ title: 'x', missing: true }] } }), nominatim: () => jsonResponse([]) });
    // limitador que só libera depois de 10 minutos (mais que qualquer prazo): a chamada fica "na fila" e a operação termina antes
    const slowLimiter = { run: (fn) => new Promise((resolve, reject) => setTimeout(() => Promise.resolve().then(fn).then(resolve, reject), 10 * 60_000)) };
    const svc = createDefaultStayService({}, { fetchImpl: f, limiter: slowLimiter });
    let endedAt = null;
    const op = svc.search({ lat: 38.7, lon: -9.1, name: 'Lisboa', categories: 'hostel' }).then((r) => { endedAt = Date.now(); return r; });
    await vi.advanceTimersByTimeAsync(80_000);
    await op;
    expect(calls).toEqual([]); // nada saiu antes do fim
    await vi.advanceTimersByTimeAsync(20 * 60_000); // o limitador libera a fila muito depois
    expect(calls).toEqual([]); // e nada sai depois do fim
    expect(endedAt).not.toBeNull();
  });
});
