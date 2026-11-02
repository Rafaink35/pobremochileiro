// Executa a sincronização de UMA fonte: buscar → normalizar → validar → gravar (upsert com histórico) → registrar a
// execução e a saúde. Falha de um escopo não derruba os outros. Nada é excluído: o que sumiu da fonte permanece.
import { sanitizeError } from './store.js';
const scopeLabel = (s) => (s.kind === 'uf' ? `uf:${s.uf}` : s.kind === 'municipio' ? `municipio:${s.uf}:${s.name}` : s.kind === 'bbox' ? `bbox:${s.bbox.join(',')}` : s.kind ?? 'arquivo');

const DIFF_KEYS = ['name', 'type', 'description', 'latitude', 'longitude', 'address', 'city', 'state', 'phone', 'website', 'facilities', 'status', 'extra'];

export function diffRecords(oldRow, newRow) {
  const changes = {};
  for (const k of DIFF_KEYS) {
    if (JSON.stringify(oldRow[k] ?? null) !== JSON.stringify(newRow[k] ?? null)) changes[k] = [oldRow[k] ?? null, newRow[k] ?? null];
  }
  return changes;
}

/** Grava registros já validados. Devolve contagens; só escreve o que mudou e guarda o histórico da mudança. */
export async function upsertRecords(store, records) {
  const byId = new Map(records.map((r) => [r.id, r])); // mesmo id repetido no lote: vale o último
  const list = [...byId.values()];
  if (!list.length) return { inserted: 0, updated: 0, unchanged: 0 };
  const source = list[0].source;
  const existing = await store.getExisting(source, list.map((r) => r.source_id));
  const write = [];
  const history = [];
  const unchanged = [];
  let inserted = 0;
  let updated = 0;
  for (const r of list) {
    const ex = existing.get(r.source_id);
    if (!ex) {
      write.push(r);
      inserted += 1;
    } else if (ex.content_hash !== r.content_hash) {
      write.push(r);
      history.push({ establishment_id: r.id, changed_at: r.last_synced_at, changes: diffRecords(ex, r), content_hash: r.content_hash });
      updated += 1;
    } else unchanged.push(r.source_id);
  }
  await store.upsertEstablishments(write);
  await store.addHistory(history);
  await store.touch(source, unchanged, list[0].last_synced_at);
  return { inserted, updated, unchanged: unchanged.length };
}

/** Saúde da fonte a partir do estado guardado. */
export function computeHealth(state, { now = () => new Date(), frequencyHours = 24 * 7 } = {}) {
  if (!state?.last_run_at) return 'never_run';
  const ageH = (now().getTime() - new Date(state.last_success_at ?? 0).getTime()) / 3_600_000;
  if (!state.last_success_at) return 'failing';
  if (state.last_run_ok === false) return ageH > frequencyHours * 2 ? 'failing' : 'degraded';
  return ageH > frequencyHours * 1.5 ? 'degraded' : 'healthy';
}

export async function runSync({ adapter, scopes, store, now = () => new Date(), frequencyHours = 24 * 7, log = () => {} }) {
  const startedAt = now().toISOString();
  const run = { source: adapter.id, started_at: startedAt, finished_at: null, ok: true, fetched: 0, imported: 0, updated: 0, unchanged: 0, rejected: 0, errors: [], scopes: [] };
  for (const scope of scopes.flatMap((s) => adapter.expandScope(s))) {
    const label = scopeLabel(scope);
    try {
      const { elements, fromCache } = await adapter.fetch(scope);
      const { records, rejected } = adapter.normalize(elements, scope, now().toISOString());
      const counts = await upsertRecords(store, records);
      const fetchedCount = Array.isArray(elements) ? elements.length : records.length;
      run.fetched += fetchedCount;
      run.rejected += rejected.length;
      run.imported += counts.inserted;
      run.updated += counts.updated;
      run.unchanged += counts.unchanged;
      run.scopes.push({ scope: label, ok: true, fetched: fetchedCount, rejected: rejected.length, from_cache: fromCache, ...counts });
      log(`${adapter.id} ${label}: ${fetchedCount} lidos, ${counts.inserted} novos, ${counts.updated} atualizados, ${rejected.length} rejeitados`);
    } catch (err) {
      run.ok = false;
      run.errors.push({ scope: label, message: sanitizeError(err) });
      run.scopes.push({ scope: label, ok: false });
      log(`${adapter.id} ${label}: falhou (${sanitizeError(err)})`);
    }
  }
  run.finished_at = now().toISOString();
  await store.recordRun(run);
  const prev = await store.getState(adapter.id);
  const state = {
    last_run_at: run.finished_at,
    last_run_ok: run.ok,
    last_success_at: run.ok ? run.finished_at : prev?.last_success_at ?? null,
    last_error: run.errors[0]?.message ?? null,
    frequency_hours: frequencyHours,
  };
  state.health = computeHealth(state, { now, frequencyHours });
  await store.setState(adapter.id, state);
  return { run, state };
}
