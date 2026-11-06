// Modelo unificado da camada nacional de dados. Regras: valor desconhecido é null (nunca inventado), toda linha
// carrega fonte, id na fonte, licença e datas; dados abertos e comerciais são identificados à parte (origin_kind).
import { validateCoordinates } from '../geo.js';

export const ESTABLISHMENT_TYPES = Object.freeze(['hostel', 'hotel', 'pousada', 'guest_house', 'camping', 'caravan_site', 'ecovillage', 'collaborative']);
export const ORIGIN_KIND = Object.freeze({ OPEN: 'open', COMMERCIAL: 'commercial' });
export const ESTABLISHMENT_STATUS = Object.freeze({ UNVERIFIED: 'unverified', ACTIVE: 'active', CLOSED: 'closed' });

const text = (v, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const iso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const url = (v) => {
  const t = text(v, 500);
  return t && /^https?:\/\/[^\s]+$/i.test(t) ? t : null;
};
const UF = /^[A-Z]{2}$/;

/** Hash estável do conteúdo que importa (para saber se um registro mudou). Não inclui datas de sincronização. */
export function contentHash(e) {
  const keys = ['name', 'type', 'description', 'latitude', 'longitude', 'address', 'city', 'state', 'region', 'country', 'phone', 'website', 'facilities', 'status', 'extra'];
  const stable = JSON.stringify(keys.map((k) => e[k] ?? null), (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
  let h = 5381;
  for (let i = 0; i < stable.length; i += 1) h = ((h << 5) + h + stable.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}${stable.length.toString(16)}`;
}

/**
 * Cria um Establishment. Nunca lança: devolve { value, problems }. `value` é null quando o registro é inválido
 * (tipo desconhecido, sem nome, coordenada fora do intervalo, sem fonte/licença...). Ausência de dado ≠ inexistência.
 */
export function createEstablishment(input = {}, { now = () => new Date() } = {}) {
  const problems = [];
  const source = text(input.source, 40);
  const sourceId = text(String(input.source_id ?? ''), 120);
  if (!source) problems.push('fonte ausente');
  if (!sourceId) problems.push('id na fonte ausente');
  const name = text(input.name, 200);
  if (!name) problems.push('nome ausente');
  const type = ESTABLISHMENT_TYPES.includes(input.type) ? input.type : null;
  if (!type) problems.push('tipo desconhecido');
  const has = (v) => v !== null && v !== undefined && v !== '';
  const hasCoords = has(input.latitude) && has(input.longitude);
  let lat = null;
  let lon = null;
  if (has(input.latitude) !== has(input.longitude)) problems.push('coordenadas incompletas');
  if (hasCoords) {
    const c = validateCoordinates(input.latitude, input.longitude);
    if (!c) problems.push('coordenadas inválidas');
    else ({ lat, lon } = c);
  }
  const state = input.state ? String(input.state).trim().toUpperCase() : null;
  if (state && !UF.test(state)) problems.push('UF inválida');
  const license = text(input.license, 120);
  if (!license) problems.push('licença ausente');
  if (problems.length) return { value: null, problems };

  const stamp = now().toISOString();
  const e = {
    id: `${source}:${sourceId}`,
    name,
    type,
    description: text(input.description, 1000),
    latitude: lat,
    longitude: lon,
    address: text(input.address, 300),
    city: text(input.city, 120),
    state, // UF brasileira (2 letras); fora do Brasil use `region`
    region: text(input.region, 120),
    country: text(input.country, 2)?.toUpperCase() ?? (state ? 'BR' : null), // UF implica Brasil; sem país informado fica desconhecido
    phone: text(input.phone, 60),
    website: url(input.website),
    facilities: input.facilities && typeof input.facilities === 'object' ? input.facilities : null,
    source,
    source_id: sourceId,
    source_url: url(input.source_url),
    license,
    attribution: text(input.attribution, 200),
    origin_kind: input.origin_kind === ORIGIN_KIND.COMMERCIAL ? ORIGIN_KIND.COMMERCIAL : ORIGIN_KIND.OPEN,
    last_verified_at: iso(input.last_verified_at),
    last_synced_at: iso(input.last_synced_at) ?? stamp,
    status: Object.values(ESTABLISHMENT_STATUS).includes(input.status) ? input.status : ESTABLISHMENT_STATUS.UNVERIFIED,
    extra: input.extra && typeof input.extra === 'object' ? input.extra : null,
  };
  e.content_hash = contentHash(e);
  return { value: e, problems: [] };
}

const PRICE_TYPES = ['current', 'historical', 'estimated', 'published'];

/** Observação de preço. Valor ausente/inválido → rejeitada; nunca vira zero. */
export function createPriceObservation(input = {}) {
  const amount = typeof input.amount === 'number' ? input.amount : Number(String(input.amount ?? '').replace(',', '.'));
  const problems = [];
  if (!Number.isFinite(amount) || amount <= 0) problems.push('valor ausente ou inválido');
  if (!/^[A-Z]{3}$/.test(String(input.currency ?? ''))) problems.push('moeda inválida');
  if (!PRICE_TYPES.includes(input.price_type)) problems.push('tipo de preço inválido');
  if (!text(input.entity_id)) problems.push('entidade ausente');
  if (!text(input.source)) problems.push('fonte ausente');
  if (!iso(input.observed_at)) problems.push('data da observação ausente');
  if (problems.length) return { value: null, problems };
  return {
    value: {
      entity_id: text(input.entity_id), entity_type: text(input.entity_type, 40), amount, currency: input.currency,
      price_type: input.price_type, observed_at: iso(input.observed_at), valid_for_date: iso(input.valid_for_date),
      source: text(input.source, 40), source_url: url(input.source_url), conditions: text(input.conditions, 300),
    },
    problems: [],
  };
}

/** Observação de disponibilidade. `available` desconhecido é null; só aceita true/false explícitos. */
export function createAvailabilityObservation(input = {}) {
  const problems = [];
  if (!text(input.entity_id)) problems.push('entidade ausente');
  if (!text(input.source)) problems.push('fonte ausente');
  if (!iso(input.observed_at)) problems.push('data da observação ausente');
  if (problems.length) return { value: null, problems };
  const quantity = Number.isInteger(input.quantity) && input.quantity >= 0 ? input.quantity : null;
  return {
    value: {
      entity_id: text(input.entity_id), entity_type: text(input.entity_type, 40),
      available: input.available === true ? true : input.available === false ? false : null,
      quantity, observed_at: iso(input.observed_at), valid_for_date: iso(input.valid_for_date), source: text(input.source, 40),
    },
    problems: [],
  };
}
