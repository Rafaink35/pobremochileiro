// Cache com validade, espera entre requisições e repetição com recuo exponencial. Tudo com relógio e sleep
// injetáveis para testar sem esperar.
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCache({ ttlMs = 6 * 3600_000, now = () => Date.now(), max = 500 } = {}) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(key, { value, at: now() });
    },
    size: () => map.size,
  };
}

/** Garante um intervalo mínimo entre chamadas (servidores públicos como a Overpass pedem uso moderado). */
export function createRateLimiter({ minIntervalMs = 2000, now = () => Date.now(), sleep = defaultSleep } = {}) {
  let last = -Infinity;
  let chain = Promise.resolve();
  return {
    run(fn) {
      const task = chain.then(async () => {
        const wait = last + minIntervalMs - now();
        if (wait > 0) await sleep(wait);
        last = now();
        return fn();
      });
      chain = task.catch(() => {});
      return task;
    },
  };
}

export class HttpError extends Error {
  constructor(status, retryAfterMs = null) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** "Retry-After" em segundos ou data; devolve milissegundos ou null. */
export function parseRetryAfter(value, now = () => Date.now()) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : Math.max(0, t - now());
}

/** Repete em erro temporário (429, 5xx, rede) com recuo exponencial; erro definitivo (4xx) sobe na hora. */
export async function withBackoff(fn, { retries = 3, baseMs = 1000, maxMs = 60_000, sleep = defaultSleep, random = Math.random } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      const status = err?.status;
      const temporary = status === undefined || status === 429 || status >= 500;
      if (!temporary || attempt >= retries) throw err;
      const exp = Math.min(maxMs, baseMs * 2 ** attempt);
      const wait = err.retryAfterMs != null ? Math.min(maxMs, err.retryAfterMs) : exp / 2 + random() * (exp / 2);
      await sleep(wait);
      attempt += 1;
    }
  }
}
