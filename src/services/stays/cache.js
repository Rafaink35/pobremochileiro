// Cache em memória com validade (24 h por padrão) e "sobra" para uso em caso de falha da fonte, e interruptor por fonte.
// Relógio injetável para testar sem esperar.
export function createStaleCache({ ttlMs = 24 * 3600_000, staleMs = 7 * 24 * 3600_000, max = 500, now = () => Date.now() } = {}) {
  const map = new Map();
  return {
    /** { value, at, fresh } enquanto estiver dentro de ttl + staleMs; depois some. */
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      const age = now() - hit.at;
      if (age > ttlMs + staleMs) {
        map.delete(key);
        return undefined;
      }
      return { value: hit.value, at: hit.at, fresh: age <= ttlMs };
    },
    set(key, value) {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(key, { value, at: now() });
    },
    size: () => map.size,
  };
}

/** Depois de `threshold` falhas seguidas a fonte fica em pausa por `cooldownMs`; um sucesso zera a contagem. */
export function createBreaker({ threshold = 3, cooldownMs = 10 * 60_000, now = () => Date.now() } = {}) {
  const state = new Map();
  return {
    isOpen(id) {
      const s = state.get(id);
      if (!s?.openUntil) return false;
      if (now() >= s.openUntil) {
        state.set(id, { failures: 0, openUntil: 0 });
        return false;
      }
      return true;
    },
    success(id) {
      state.set(id, { failures: 0, openUntil: 0 });
    },
    failure(id) {
      const s = state.get(id) ?? { failures: 0, openUntil: 0 };
      const failures = s.failures + 1;
      state.set(id, { failures, openUntil: failures >= threshold ? now() + cooldownMs : 0 });
    },
  };
}
