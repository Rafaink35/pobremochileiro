// Adaptador OpenStreetMap/Overpass para a camada nacional. Consulta por UF, região, município ou caixa geográfica,
// com endpoint configurável, cache, espera entre requisições e recuo exponencial. Reaproveita a normalização já
// testada de lodging/osmCamping.js. Ausência de dado no OSM NÃO significa que o estabelecimento não existe.
import { normalizeOsmElement, OSM_SOURCE, escapeOverpass } from '../../lodging/osmCamping.js';
import { createEstablishment } from '../model.js';
import { validateCoordinates } from '../../geo.js';
import { createCache, createRateLimiter, HttpError, parseRetryAfter, withBackoff } from '../cache.js';

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OSM_TOURISM = ['hotel', 'motel', 'guest_house', 'hostel', 'camp_site', 'caravan_site'];
const TYPE_MAP = { hotel: 'hotel', motel: 'hotel', guest_house: 'guest_house', hostel: 'hostel', camp_site: 'camping', caravan_site: 'caravan_site' };

export const REGIONS = Object.freeze({
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
});
export const ALL_UFS = Object.values(REGIONS).flat().sort();

/** Escopos de sincronização: { kind: 'uf'|'region'|'municipio'|'bbox', ... } → lista de escopos simples. */
export function expandScope(scope) {
  if (scope.kind === 'region') {
    const ufs = REGIONS[scope.name];
    if (!ufs) throw new Error(`região desconhecida: ${scope.name}`);
    return ufs.map((uf) => ({ kind: 'uf', uf }));
  }
  if (scope.kind === 'uf') {
    if (!ALL_UFS.includes(scope.uf)) throw new Error(`UF desconhecida: ${scope.uf}`);
    return [scope];
  }
  if (scope.kind === 'municipio') {
    if (!ALL_UFS.includes(scope.uf) || !scope.name || scope.name.length > 80) throw new Error('município inválido');
    return [scope];
  }
  if (scope.kind === 'around') {
    // Destino em qualquer país: centro + raio (metros), com filtro de categorias opcional (subconjunto de OSM_TOURISM).
    const ok = validateCoordinates(scope.lat, scope.lon) && Number.isFinite(scope.radiusM) && scope.radiusM >= 500 && scope.radiusM <= 30000;
    const tourism = scope.tourism ?? OSM_TOURISM;
    if (!ok) throw new Error('área circular inválida (centro e raio entre 500 e 30000 m)');
    if (!Array.isArray(tourism) || !tourism.length || !tourism.every((t) => OSM_TOURISM.includes(t))) throw new Error('categorias OSM inválidas');
    return [scope];
  }
  if (scope.kind === 'bbox') {
    const b = scope.bbox;
    const ok = Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && b[0] >= -90 && b[2] <= 90 && b[1] >= -180 && b[3] <= 180;
    if (!ok) throw new Error('caixa geográfica inválida (use sul, oeste, norte, leste)');
    return [scope];
  }
  throw new Error(`escopo desconhecido: ${scope.kind}`);
}

export const scopeLabel = (s) => (s.kind === 'around' ? `around:${s.lat},${s.lon},${s.radiusM}` : s.kind === 'uf' ? `uf:${s.uf}` : s.kind === 'municipio' ? `municipio:${s.uf}:${s.name}` : `bbox:${s.bbox.join(',')}`);

/** Consulta Overpass para um escopo simples (uf, municipio ou bbox). */
export function buildQuery(scope, { timeoutSec = 180 } = {}) {
  const filter = `["tourism"~"^(${(scope.kind === 'around' ? scope.tourism ?? OSM_TOURISM : OSM_TOURISM).join('|')})$"]`;
  const head = `[out:json][timeout:${scope.kind === 'around' ? Math.min(timeoutSec, 60) : timeoutSec}];`;
  if (scope.kind === 'around') return `${head}\nnwr${filter}(around:${Math.round(scope.radiusM)},${scope.lat},${scope.lon});\nout center meta;`;
  if (scope.kind === 'bbox') {
    const [s, w, n, e] = scope.bbox;
    return `${head}\nnwr${filter}(${s},${w},${n},${e});\nout center meta;`;
  }
  const uf = `area["ISO3166-2"="BR-${scope.uf}"]["boundary"="administrative"]->.uf;`;
  if (scope.kind === 'municipio') {
    return `${head}\n${uf}\narea["boundary"="administrative"]["name"~"^${escapeOverpass(scope.name)}$",i](area.uf)->.m;\nnwr${filter}(area.m);\nout center meta;`;
  }
  return `${head}\n${uf}\nnwr${filter}(area.uf);\nout center meta;`;
}

function addressOf(tags) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  return [street, tags['addr:suburb']].filter(Boolean).join(' - ') || null;
}

/** Converte elementos Overpass em Establishment. Devolve { records, rejected }. */
export function normalizeElements(elements, { scope, collectedAt, now }) {
  const records = [];
  const rejected = [];
  for (const el of elements) {
    const id = `${el.type}/${el.id}`;
    const base = normalizeOsmElement(el, { collectedAt });
    if (!base) {
      rejected.push({ id, reason: 'sem coordenadas válidas ou tipo fora do escopo' });
      continue;
    }
    const tags = el.tags ?? {};
    const { value, problems } = createEstablishment(
      {
        name: base.name,
        type: TYPE_MAP[base.kind],
        latitude: base.lat,
        longitude: base.lon,
        address: addressOf(tags),
        city: base.city,
        // UF só quando a consulta foi por UF (dentro da área consultada); fora do Brasil o estado vai em `region` (texto livre).
        state: scope.kind === 'uf' || scope.kind === 'municipio' ? scope.uf : /^[A-Za-z]{2}$/.test(base.state ?? '') && String(tags['addr:country'] ?? '').toUpperCase() === 'BR' ? base.state.toUpperCase() : null,
        region: scope.kind === 'uf' || scope.kind === 'municipio' ? null : base.state,
        country: /^[A-Za-z]{2}$/.test(tags['addr:country'] ?? '') ? tags['addr:country'] : scope.kind === 'uf' || scope.kind === 'municipio' ? 'BR' : null,
        phone: base.phone,
        website: base.website,
        facilities: { ...base.amenities, tents: base.tents, caravans: base.caravans, fee: base.fee, charge: base.chargeText, opening_hours: base.openingHours },
        source: 'osm',
        source_id: id,
        source_url: base.source.sourceUrl,
        license: OSM_SOURCE.license,
        attribution: OSM_SOURCE.attribution,
        last_verified_at: null, // data de edição no OSM não prova que o local está aberto
        status: 'unverified',
        extra: { osm_tourism: tags.tourism, osm_last_edit: el.timestamp ?? null, stars: base.stars ?? null },
        last_synced_at: collectedAt,
      },
      { now },
    );
    if (value) records.push(value);
    else rejected.push({ id, reason: problems.join('; ') });
  }
  return { records, rejected };
}

export function createOsmAdapter({
  fetchImpl = (...a) => fetch(...a),
  endpoint = DEFAULT_OVERPASS_URL,
  contact = null, // ex.: e-mail de contato, enviado no User-Agent (boa prática para o servidor público)
  now = () => new Date(),
  cache = createCache({ ttlMs: 24 * 3600_000 }),
  limiter = createRateLimiter({ minIntervalMs: 5000 }),
  sleep,
  retries = 3,
} = {}) {
  async function fetchRaw(scope) {
    const query = buildQuery(scope);
    const key = `${endpoint}|${query}`;
    const hit = cache.get(key);
    if (hit) return { elements: hit, fromCache: true };
    const elements = await limiter.run(() =>
      withBackoff(
        async () => {
          const res = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', ...(contact && { 'user-agent': `PobreMochileiro/0.2 (${contact})` }) },
            body: `data=${encodeURIComponent(query)}`,
          });
          if (!res.ok) throw new HttpError(res.status, parseRetryAfter(res.headers?.get?.('retry-after'), () => now().getTime()));
          const json = await res.json();
          if (!Array.isArray(json?.elements)) throw new HttpError(502);
          if (json.elements.length === 0 && /runtime error|timed out|out of memory/i.test(json.remark ?? '')) throw new HttpError(504);
          return json.elements;
        },
        { retries, sleep },
      ),
    );
    cache.set(key, elements);
    return { elements, fromCache: false };
  }

  return {
    id: 'osm',
    name: 'OpenStreetMap (Overpass)',
    originKind: 'open',
    getSource: () => ({ ...OSM_SOURCE, endpoint }),
    isConfigured: () => Boolean(endpoint),
    expandScope,
    /** Busca bruta de um escopo simples. */
    fetch: fetchRaw,
    /** Elementos → Establishments validados + rejeitados (com motivo). */
    normalize: (elements, scope, collectedAt = now().toISOString()) => normalizeElements(elements, { scope, collectedAt, now }),
    /** Já validado dentro de normalize (createEstablishment); mantido por contrato. */
    validate: (records) => ({ valid: records.filter((r) => r?.id), rejected: records.filter((r) => !r?.id).length }),
  };
}
