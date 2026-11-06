// Fonte OpenStreetMap (Overpass) para o Stay Finder: busca por centro + raio em QUALQUER país, reaproveitando o adaptador da
// camada nacional (cache de rede, limite de taxa e recuo exponencial). Tag ausente = desconhecido. O OSM não informa se o
// local está aberto ou tem vaga. Preço só vale quando a tag `charge` traz valor e moeda; a data do preço é a da última
// edição do elemento no OSM (a idade real do preço é desconhecida).
import { normalizeOsmElement, OSM_SOURCE } from '../../lodging/osmCamping.js';
import { createOsmAdapter, DEFAULT_OVERPASS_URL } from '../../datalayer/sources/osm.js';
import { categoryOfOsmTourism, OSM_TOURISM_BY_CATEGORY } from '../categories.js';
import { parseStayCharge } from '../price.js';

export const OSM_STAY_SOURCE = Object.freeze({
  id: 'osm', name: 'OpenStreetMap (Overpass)', license: 'ODbL 1.0', licenseUrl: OSM_SOURCE.licenseUrl,
  attribution: OSM_SOURCE.attribution, url: OSM_SOURCE.copyrightUrl,
});

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Elemento Overpass → registro do Stay Finder (ou null). */
export function toStayRecord(el, { collectedAt }) {
  const base = normalizeOsmElement(el, { collectedAt });
  const tags = el.tags ?? {};
  const category = categoryOfOsmTourism(tags.tourism);
  if (!base || !category) return null;
  const observedAt = base.source.lastEditedAt ?? null;
  const source = { ...base.source, provider: 'osm', name: OSM_STAY_SOURCE.name };
  const priceSource = { provider: 'osm', name: OSM_STAY_SOURCE.name, license: OSM_STAY_SOURCE.license, attribution: OSM_STAY_SOURCE.attribution, url: base.source.sourceUrl };
  const prices = [];
  if (base.fee === 'free') prices.push({ status: 'published', free: true, observedAt, source: priceSource, text: 'Gratuito (tag fee=no)' });
  else if (base.chargeText) {
    const parsed = parseStayCharge(base.chargeText);
    if (parsed) prices.push({ status: 'published', amount: parsed.amount, currency: parsed.currency, unit: parsed.unit, observedAt, source: priceSource, text: parsed.text });
  }
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
  return {
    id: base.id, provider: 'osm', sourceId: source.originalId, name: base.name, category, osmKind: tags.tourism,
    lat: base.lat, lon: base.lon, address: street || null, city: base.city, region: base.state,
    country: /^[A-Za-z]{2}$/.test(tags['addr:country'] ?? '') ? tags['addr:country'].toUpperCase() : null,
    website: base.website, phone: base.phone, email: base.email, stars: base.stars, openingHours: base.openingHours, access: base.access,
    amenities: base.amenities, tents: base.tents, caravans: base.caravans, fee: base.fee, priceText: base.chargeText,
    openStatus: 'unknown', prices, sources: [source],
  };
}

export function createOsmStaySource({ adapter = createOsmAdapter({ cache: { get: () => undefined, set: () => {} } }), now = () => new Date() } = {}) {
  return {
    id: OSM_STAY_SOURCE.id,
    describe: () => ({ ...OSM_STAY_SOURCE, endpoint: adapter.getSource?.().endpoint ?? DEFAULT_OVERPASS_URL }),
    supports(categories) {
      const wanted = categories.flatMap((c) => OSM_TOURISM_BY_CATEGORY[c] ?? []);
      return wanted.length ? { ok: true } : { ok: false, reason: 'o OpenStreetMap não tem marcação confiável para as categorias pedidas' };
    },
    async search({ destination, categories }) {
      const tourism = [...new Set(categories.flatMap((c) => OSM_TOURISM_BY_CATEGORY[c] ?? []))];
      const [scope] = adapter.expandScope({ kind: 'around', lat: destination.lat, lon: destination.lon, radiusM: destination.radiusM, tourism });
      const { elements } = await adapter.fetch(scope);
      const collectedAt = now().toISOString();
      const records = [];
      let rejected = 0;
      for (const el of elements) {
        const r = toStayRecord(el, { collectedAt });
        if (r) records.push(r);
        else rejected += 1;
      }
      return { records, rejected, collectedAt };
    },
  };
}
