// Armazenamento da camada nacional. `createMemoryStore` serve a testes e a execuções "dry-run"; `createSupabaseStore`
// grava no Supabase pela API REST. Só o JOB de sincronização (fora do app) usa a chave de escrita: ela vem de variável
// de ambiente/segredo do GitHub, nunca do código, nunca do navegador, e nunca é registrada em log.

export const sanitizeError = (err) =>
  String(err?.message ?? err ?? 'erro')
    .replace(/eyJ[\w.-]{10,}/g, '[chave]')
    .replace(/sb_(?:secret|publishable)_[\w-]+/g, '[chave]')
    .replace(/AIza[\w-]+/g, '[chave]')
    .slice(0, 240);

export function createMemoryStore() {
  const rows = new Map();
  const history = [];
  const runs = [];
  const state = new Map();
  return {
    rows, history, runs, state,
    async getExisting(source, ids) {
      return new Map(ids.filter((id) => rows.has(`${source}:${id}`)).map((id) => [id, rows.get(`${source}:${id}`)]));
    },
    async upsertEstablishments(list) {
      for (const r of list) rows.set(r.id, { ...r, created_at: rows.get(r.id)?.created_at ?? r.last_synced_at, updated_at: r.last_synced_at });
    },
    async addHistory(list) { history.push(...list); },
    async touch(source, ids, at) {
      for (const id of ids) {
        const k = `${source}:${id}`;
        if (rows.has(k)) rows.set(k, { ...rows.get(k), last_synced_at: at });
      }
    },
    async recordRun(run) { runs.push(run); },
    async getState(source) { return state.get(source) ?? null; },
    async setState(source, s) { state.set(source, { ...(state.get(source) ?? {}), ...s, source }); },
  };
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const inList = (ids) => `in.(${ids.map((i) => `"${String(i).replaceAll('"', '')}"`).join(',')})`;

export function createSupabaseStore({ url, key, fetchImpl = (...a) => fetch(...a) }) {
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para gravar');
  // Chave nova (sb_secret_...) não é JWT e vai só em `apikey`; a antiga (service_role, JWT) também em Authorization.
  const headers = { apikey: key, ...(key.startsWith('eyJ') && { authorization: `Bearer ${key}` }), 'content-type': 'application/json' };
  const rest = async (path, { method = 'GET', body, prefer } = {}) => {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
      method, headers: { ...headers, ...(prefer && { prefer }) }, ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} respondeu ${res.status}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  };
  return {
    async getExisting(source, ids) {
      const out = new Map();
      for (const part of chunk(ids, 100)) {
        const rowsPart = await rest(`establishments?source=eq.${encodeURIComponent(source)}&source_id=${encodeURIComponent(inList(part))}&select=*`);
        for (const r of rowsPart ?? []) out.set(r.source_id, r);
      }
      return out;
    },
    async upsertEstablishments(list) {
      for (const part of chunk(list, 500)) {
        await rest('establishments?on_conflict=source,source_id', { method: 'POST', body: part, prefer: 'resolution=merge-duplicates,return=minimal' });
      }
    },
    async addHistory(list) {
      for (const part of chunk(list, 500)) await rest('establishment_history', { method: 'POST', body: part, prefer: 'return=minimal' });
    },
    async touch(source, ids, at) {
      for (const part of chunk(ids, 100)) {
        await rest(`establishments?source=eq.${encodeURIComponent(source)}&source_id=${encodeURIComponent(inList(part))}`, { method: 'PATCH', body: { last_synced_at: at }, prefer: 'return=minimal' });
      }
    },
    async recordRun(run) { await rest('source_sync_runs', { method: 'POST', body: run, prefer: 'return=minimal' }); },
    async getState(source) {
      const r = await rest(`source_state?source=eq.${encodeURIComponent(source)}&select=*`);
      return r?.[0] ?? null;
    },
    async setState(source, s) {
      await rest('source_state?on_conflict=source', { method: 'POST', body: { ...s, source }, prefer: 'resolution=merge-duplicates,return=minimal' });
    },
  };
}
