// Base de conhecimento de viagens: validação e carga. Nada é inventado: registro inválido é descartado com o motivo,
// preço incompleto vira "unknown" e cada preço aponta para uma fonte cadastrada (com licença).
import { createPrice, unknownPrice } from './price.js';
import { createSourceMetadata } from '../transport/sourceMetadata.js';

export const normKey = (s) =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const TRANSPORT_MODES = ['bus', 'flight', 'train', 'ferry', 'car'];
export const LODGING_KINDS = ['camping', 'caravan_site', 'hostel', 'hotel', 'guesthouse', 'other'];

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const tags = (v) => [...new Set((Array.isArray(v) ? v : []).map(normKey).filter(Boolean))];

export const emptyKnowledgeBase = () => ({
  version: 1,
  sources: [],
  origins: [],
  destinations: [],
  transportOptions: [],
  lodgings: [],
  workExchanges: [],
  activities: [],
});

/** Valida e carrega um objeto de base. Retorna { kb, errors, warnings }; nunca lança. */
export function loadKnowledgeBase(raw) {
  const kb = emptyKnowledgeBase();
  const errors = [];
  const warnings = [];
  const data = raw && typeof raw === 'object' ? raw : {};
  const list = (k) => (Array.isArray(data[k]) ? data[k] : []);

  const seen = new Map();
  const unique = (kind, id) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  };

  for (const s of list('sources')) {
    const meta = createSourceMetadata(s);
    if (!meta.id || !meta.name || !meta.url) errors.push(`fonte ${meta.id ?? '(sem id)'}: id, nome e URL são obrigatórios`);
    else if (!unique('source', meta.id)) errors.push(`fonte ${meta.id}: id duplicado`);
    else {
      kb.sources.push(meta);
      if (meta.issues.length) warnings.push(`fonte ${meta.id}: ${meta.issues.join(' ')}`);
    }
  }
  const sourceIds = new Set(kb.sources.map((s) => s.id));

  // Preço lido de JSON: a fonte citada precisa estar cadastrada, senão o preço vira desconhecido.
  const price = (where, raw) => {
    if (!raw) return unknownPrice();
    const p = createPrice(raw);
    if (p.origin?.sourceId && !sourceIds.has(p.origin.sourceId)) {
      warnings.push(`${where}: fonte "${p.origin.sourceId}" não cadastrada; preço tratado como desconhecido`);
      return unknownPrice(p.note);
    }
    if (p.issues.length) warnings.push(`${where}: ${p.issues.join(', ')}; preço tratado como desconhecido`);
    return p;
  };

  for (const o of list('origins')) {
    const name = text(o.name);
    if (!name) errors.push('origem sem nome');
    else kb.origins.push({ key: normKey(name), name, aliases: tags(o.aliases) });
  }

  for (const d of list('destinations')) {
    const id = text(d.id);
    const name = text(d.name);
    if (!id || !name) errors.push(`destino ${id ?? '(sem id)'}: id e nome são obrigatórios`);
    else if (!unique('destination', id)) errors.push(`destino ${id}: id duplicado`);
    else {
      kb.destinations.push({
        id, name, region: text(d.region), state: text(d.state), description: text(d.description), tags: tags(d.tags),
        lat: Number.isFinite(d.lat) ? d.lat : null, lon: Number.isFinite(d.lon) ? d.lon : null,
        dailyFood: price(`destino ${id} (alimentação)`, d.dailyFood),
        localTransportDaily: price(`destino ${id} (deslocamento local)`, d.localTransportDaily),
      });
    }
  }
  const destIds = new Set(kb.destinations.map((d) => d.id));
  const needDest = (kind, id, destinationId) => {
    if (!destIds.has(destinationId)) {
      errors.push(`${kind} ${id ?? '(sem id)'}: destino "${destinationId}" desconhecido`);
      return false;
    }
    return true;
  };

  for (const t of list('transportOptions')) {
    const id = text(t.id);
    if (!id || !TRANSPORT_MODES.includes(t.mode) || !text(t.origin)) errors.push(`transporte ${id ?? '(sem id)'}: id, origem e modo (${TRANSPORT_MODES.join('/')}) são obrigatórios`);
    else if (!unique('transport', id)) errors.push(`transporte ${id}: id duplicado`);
    else if (needDest('transporte', id, t.destinationId)) {
      kb.transportOptions.push({
        id, destinationId: t.destinationId, origin: text(t.origin), originKey: normKey(t.origin), mode: t.mode,
        operator: text(t.operator), durationMinutes: Number.isFinite(t.durationMinutes) && t.durationMinutes > 0 ? t.durationMinutes : null,
        price: price(`transporte ${id}`, t.price), notes: text(t.notes),
      });
    }
  }

  for (const l of list('lodgings')) {
    const id = text(l.id);
    if (!id || !text(l.name) || !LODGING_KINDS.includes(l.kind)) errors.push(`hospedagem ${id ?? '(sem id)'}: id, nome e tipo (${LODGING_KINDS.join('/')}) são obrigatórios`);
    else if (!unique('lodging', id)) errors.push(`hospedagem ${id}: id duplicado`);
    else if (needDest('hospedagem', id, l.destinationId)) {
      kb.lodgings.push({
        id, destinationId: l.destinationId, name: text(l.name), kind: l.kind, tags: tags(l.tags),
        lat: Number.isFinite(l.lat) ? l.lat : null, lon: Number.isFinite(l.lon) ? l.lon : null,
        acceptsTents: typeof l.acceptsTents === 'boolean' ? l.acceptsTents : null, // null = desconhecido
        website: text(l.website), price: price(`hospedagem ${id}`, l.price), openStatus: 'unknown',
      });
    }
  }

  for (const w of list('workExchanges')) {
    const id = text(w.id);
    if (!id || !text(w.hostName)) errors.push(`work exchange ${id ?? '(sem id)'}: id e anfitrião são obrigatórios`);
    else if (!unique('work', id)) errors.push(`work exchange ${id}: id duplicado`);
    else if (needDest('work exchange', id, w.destinationId)) {
      kb.workExchanges.push({
        id, destinationId: w.destinationId, hostName: text(w.hostName), hostType: text(w.hostType),
        hoursPerWeek: Number.isFinite(w.hoursPerWeek) ? w.hoursPerWeek : null,
        accommodation: text(w.accommodation), meals: text(w.meals), expenses: text(w.expenses),
        status: ['approved', 'closed', 'pending', 'rejected'].includes(w.status) ? w.status : 'pending',
        endDate: text(w.endDate), spots: Number.isFinite(w.spots) ? w.spots : null, updatedAt: text(w.updatedAt),
        price: price(`work exchange ${id}`, w.price), externalUrl: text(w.externalUrl),
      });
    }
  }

  for (const a of list('activities')) {
    const id = text(a.id);
    if (!id || !text(a.name)) errors.push(`atividade ${id ?? '(sem id)'}: id e nome são obrigatórios`);
    else if (!unique('activity', id)) errors.push(`atividade ${id}: id duplicado`);
    else if (needDest('atividade', id, a.destinationId)) {
      kb.activities.push({
        id, destinationId: a.destinationId, name: text(a.name), tags: tags(a.tags),
        durationHours: Number.isFinite(a.durationHours) ? a.durationHours : null, price: price(`atividade ${id}`, a.price),
      });
    }
  }

  return { kb, errors, warnings };
}

export const isEmptyKnowledgeBase = (kb) => kb.destinations.length === 0;

/** Fonte (com licença) citada por um preço, ou null. */
export function sourceOf(kb, price) {
  return kb.sources.find((s) => s.id === price?.origin?.sourceId) ?? null;
}

/** Origens conhecidas (para validar o que o viajante digitou). Une cadastro explícito e origens dos transportes. */
export function knownOrigins(kb) {
  const map = new Map();
  for (const o of kb.origins) map.set(o.key, { key: o.key, name: o.name, aliases: new Set([o.key, ...o.aliases]) });
  for (const t of kb.transportOptions) {
    if (!map.has(t.originKey)) map.set(t.originKey, { key: t.originKey, name: t.origin, aliases: new Set([t.originKey]) });
  }
  return [...map.values()];
}

export function resolveOrigin(kb, input) {
  const q = normKey(input);
  if (!q) return null;
  return knownOrigins(kb).find((o) => o.aliases.has(q)) ?? null;
}
