// Campings via OpenStreetMap (Overpass API): tourism=camp_site e tourism=caravan_site.
// Nada é inferido: tag ausente = informação desconhecida (null), nunca "não" nem "grátis".
import { normalizePrice } from '../transport/normalizers.js';
import { SEARCH_STATUS } from '../transport/transportProvider.js';
import { validateCoordinates } from '../geo.js';

export const OSM_SOURCE = Object.freeze({
  provider: 'osm',
  name: 'OpenStreetMap',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '© OpenStreetMap contributors',
  copyrightUrl: 'https://www.openstreetmap.org/copyright',
});

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Escapa texto para uso dentro de aspas e regex no Overpass QL. */
export function escapeOverpass(text) {
  return String(text).replace(/[\\.^$*+?()[\]{}|]/g, '\\$&').replace(/"/g, '\\"');
}

export function validatePlaceQuery(place) {
  const text = String(place ?? '').trim();
  if (text.length < 2 || text.length > 80) return null;
  if (/[\u0000-\u001f]/.test(text)) return null;
  return text;
}

/** Consulta todos os campings e áreas de motorhome dentro das áreas administrativas com esse nome. */
export function buildOverpassQuery(place) {
  const name = escapeOverpass(place);
  return `[out:json][timeout:25];
area["boundary"="administrative"]["name"~"^${name}$",i]->.a;
(
  nwr["tourism"="camp_site"](area.a);
  nwr["tourism"="caravan_site"](area.a);
);
out center meta;`;
}

const triState = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const httpUrl = (v) => {
  const t = clean(v);
  return t && /^https?:\/\/[^\s]+$/i.test(t) ? t : null;
};

/** "20 BRL", "R$ 25,50", "10 EUR": só aceita valor com moeda explícita; senão preço fica null. */
export function parseCharge(text) {
  const t = clean(text);
  if (!t) return null;
  const m = /^(?:(R\$|BRL|EUR|€|USD)\s*)?(\d+(?:[.,]\d+)?)\s*(R\$|BRL|EUR|€|USD)?(?=$|[\s/])/i.exec(t);
  if (!m) return null;
  const sym = (m[1] || m[3] || '').toUpperCase();
  const currency = { 'R$': 'BRL', BRL: 'BRL', EUR: 'EUR', '€': 'EUR', USD: 'USD' }[sym];
  return currency ? normalizePrice(m[2], currency) : null;
}

/** Converte um elemento do Overpass em registro de camping. Retorna null sem coordenadas válidas. */
export function normalizeOsmElement(el, { collectedAt }) {
  const tags = el.tags ?? {};
  const kind = tags.tourism === 'caravan_site' ? 'caravan_site' : tags.tourism === 'camp_site' ? 'camp_site' : null;
  if (!kind) return null;
  const coords = validateCoordinates(el.lat ?? el.center?.lat, el.lon ?? el.center?.lon);
  if (!coords) return null;

  const fee = tags.fee === 'yes' ? 'paid' : tags.fee === 'no' ? 'free' : 'unknown';
  const wifi = tags.internet_access;
  const originalId = `${el.type}/${el.id}`;
  const source = {
    ...OSM_SOURCE,
    originalId,
    sourceUrl: `https://www.openstreetmap.org/${originalId}`,
    collectedAt,
    lastEditedAt: el.timestamp ?? null,
  };
  return {
    id: `osm:${originalId}`,
    kind,
    name: clean(tags.name),
    lat: coords.lat,
    lon: coords.lon,
    state: clean(tags['addr:state']),
    city: clean(tags['addr:city']) ?? clean(tags['addr:municipality']),
    amenities: {
      toilets: triState(tags.toilets),
      shower: triState(tags.shower),
      drinkingWater: triState(tags.drinking_water),
      power: triState(tags.power_supply),
      kitchen: triState(tags.kitchen),
      wifi: wifi === 'no' ? false : wifi ? true : null,
      dumpStation: triState(tags.sanitary_dump_station),
    },
    tents: triState(tags.tents),
    caravans: triState(tags.caravans),
    fee, // 'free' | 'paid' | 'unknown'
    price: parseCharge(tags.charge), // só com moeda explícita; unidade (noite, pessoa, barraca) não é inferida
    chargeText: clean(tags.charge),
    website: httpUrl(tags.website) ?? httpUrl(tags['contact:website']) ?? httpUrl(tags.url),
    phone: clean(tags.phone) ?? clean(tags['contact:phone']),
    email: clean(tags.email) ?? clean(tags['contact:email']),
    openingHours: clean(tags.opening_hours),
    access: clean(tags.access),
    openStatus: 'unknown', // o OSM não garante que o local está aberto ou aceita hóspedes hoje
    source,
    sources: [source],
  };
}

export function parseOverpassResponse(json, { collectedAt }) {
  const elements = Array.isArray(json?.elements) ? json.elements : null;
  if (!elements) throw new Error('resposta inesperada do Overpass');
  if (elements.length === 0 && json.remark) throw new Error('o Overpass não concluiu a consulta');
  const records = [];
  let skipped = 0;
  for (const el of elements) {
    const r = normalizeOsmElement(el, { collectedAt });
    if (r) records.push(r);
    else skipped += 1;
  }
  return { records, skipped, dataTimestamp: json.osm3s?.timestamp_osm_base ?? null };
}

/** Busca campings numa área nomeada. Nunca lança: falhas viram status "unavailable". */
export async function fetchOsmCampings(
  place,
  { fetchImpl = (...a) => fetch(...a), endpoint = DEFAULT_OVERPASS_URL, now = () => new Date() } = {},
) {
  const name = validatePlaceQuery(place);
  if (!name) {
    return { status: SEARCH_STATUS.EMPTY, records: [], skipped: 0, message: 'Digite o nome de uma cidade, região ou estado.' };
  }
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildOverpassQuery(name))}`,
    });
    if (!res.ok) throw new Error(`o serviço respondeu ${res.status}`);
    const collectedAt = now().toISOString();
    const { records, skipped, dataTimestamp } = parseOverpassResponse(await res.json(), { collectedAt });
    return {
      status: records.length ? SEARCH_STATUS.OK : SEARCH_STATUS.EMPTY,
      records,
      skipped,
      collectedAt,
      dataTimestamp,
      message: records.length ? null : 'Nenhum camping cadastrado no OpenStreetMap para essa área.',
    };
  } catch (err) {
    return {
      status: SEARCH_STATUS.UNAVAILABLE,
      records: [],
      skipped: 0,
      message: `Fonte OpenStreetMap indisponível: ${err?.message || 'erro desconhecido'}`,
    };
  }
}
