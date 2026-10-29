// Deduplicação conservadora e filtros dos registros de camping.
import { haversineMeters } from '../geo.js';

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const DUPLICATE_DISTANCE_M = 150;

function mergeInto(primary, other) {
  const merged = { ...primary, sources: [...primary.sources] };
  const conflicts = new Set(primary.conflicts ?? []);
  for (const s of other.sources) {
    if (!merged.sources.some((x) => x.provider === s.provider && x.originalId === s.originalId)) merged.sources.push(s);
  }
  // Só preenche o que estava desconhecido; valores diferentes ficam marcados como conflito.
  for (const key of ['state', 'city', 'website', 'phone', 'email', 'openingHours', 'price', 'chargeText', 'tents', 'caravans']) {
    if (merged[key] === null || merged[key] === undefined) merged[key] = other[key] ?? null;
    else if (other[key] != null && JSON.stringify(other[key]) !== JSON.stringify(merged[key])) conflicts.add(key);
  }
  if (merged.fee === 'unknown') merged.fee = other.fee;
  else if (other.fee !== 'unknown' && other.fee !== merged.fee) conflicts.add('fee');
  merged.amenities = { ...merged.amenities };
  for (const [k, v] of Object.entries(other.amenities)) {
    if (merged.amenities[k] === null) merged.amenities[k] = v;
    else if (v !== null && v !== merged.amenities[k]) conflicts.add(`amenities.${k}`);
  }
  merged.conflicts = [...conflicts];
  return merged;
}

/**
 * Une registros apenas quando: mesmo tipo, nome idêntico (normalizado, não vazio) e até 150 m de distância,
 * ou quando repetem a mesma origem (provedor + id). Nada mais é mesclado.
 */
export function dedupeLodgings(records) {
  const out = [];
  for (const r of records) {
    const dupIndex = out.findIndex((o) => {
      if (o.sources.some((s) => r.sources.some((t) => t.provider === s.provider && t.originalId === s.originalId))) return true;
      if (o.kind !== r.kind || !o.name || !r.name) return false;
      return norm(o.name) === norm(r.name) && haversineMeters(o, r) <= DUPLICATE_DISTANCE_M;
    });
    if (dupIndex >= 0) out[dupIndex] = mergeInto(out[dupIndex], r);
    else out.push(r);
  }
  return out;
}

/**
 * Filtros. Informação desconhecida nunca satisfaz um filtro positivo:
 * quem não tem a tag fica de fora e é contado em `hiddenUnknown`.
 */
export function filterLodgings(records, f = {}) {
  let hiddenUnknown = 0;
  const kept = records.filter((r) => {
    if (f.kind && f.kind !== 'all' && r.kind !== f.kind) return false;
    for (const [field, wanted] of [['state', f.state], ['city', f.city]]) {
      if (!wanted?.trim()) continue;
      if (r[field] === null) {
        hiddenUnknown += 1;
        return false;
      }
      if (norm(r[field]) !== norm(wanted)) return false;
    }
    for (const [key, wanted] of Object.entries(f.amenities ?? {})) {
      if (!wanted) continue;
      if (r.amenities[key] !== true) {
        if (r.amenities[key] === null) hiddenUnknown += 1;
        return false;
      }
    }
    if (f.tents && r.tents !== true) {
      if (r.tents === null) hiddenUnknown += 1;
      return false;
    }
    if (f.maxPrice !== undefined && f.maxPrice !== null && f.maxPrice !== '') {
      if (r.fee === 'free') return true;
      if (!r.price || r.price.currency !== 'BRL') {
        hiddenUnknown += 1;
        return false;
      }
      if (r.price.amount > Number(f.maxPrice)) return false;
    }
    if (f.hasWebsite && !r.website) return false;
    return true;
  });
  return { records: kept, hiddenUnknown };
}
