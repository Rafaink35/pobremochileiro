// DADOS FICTÍCIOS, só para testes (nomes, coordenadas aproximadas e preços inventados). Nunca importar fora de __tests__.
export const NOW = new Date('2026-11-10T12:00:00Z');
const FRESH = '2026-10-20T10:00:00Z'; // 21 dias antes de NOW
const OLD = '2025-12-01T10:00:00Z'; // mais de 180 dias antes de NOW

const el = (id, tags, lat, lon, timestamp = FRESH, type = 'node') => ({ type, id, lat, lon, timestamp, tags: { ...tags } });

export const place = (osm_id, name, lat, lon, { country, countryCode, state, nameEn, kind = 'city', importance = 0.7, bbox, regionCode } = {}) => ({
  osm_type: 'relation', osm_id, lat: String(lat), lon: String(lon), display_name: `${name}, ${country}`, name, type: 'administrative', addresstype: kind, importance,
  boundingbox: bbox ?? [String(lat - 0.06), String(lat + 0.06), String(lon - 0.08), String(lon + 0.08)],
  address: { country, country_code: countryCode.toLowerCase(), ...(state && { state }), ...(regionCode && { 'ISO3166-2-lvl4': regionCode }) },
  namedetails: { name, ...(nameEn && { 'name:en': nameEn }) },
});

// Cada cidade: resultado do geocodificador + elementos do Overpass, com nomes em alfabetos diferentes.
export const CITIES = {
  lisboa: {
    query: 'Lisboa', nominatim: [place(1001, 'Lisboa', 38.7167, -9.1333, { country: 'Portugal', countryCode: 'PT', nameEn: 'Lisbon' })],
    elements: [
      el(1, { tourism: 'hostel', name: 'Hostel Exemplo Alfama', charge: '18 EUR per person per night', website: 'https://alfama-exemplo.test', 'addr:country': 'PT' }, 38.7110, -9.1290),
      el(2, { tourism: 'camp_site', name: 'Parque de Campismo Fictício', fee: 'no' }, 38.7500, -9.1800),
      el(3, { tourism: 'guest_house', name: 'Casa de Hóspedes Teste' }, 38.7140, -9.1400),
      el(4, { tourism: 'hotel', name: 'Hotel Fictício Chiado', charge: '90 EUR/room/night' }, 38.7105, -9.1420, OLD),
    ],
  },
  buenosAires: {
    query: 'Buenos Aires', nominatim: [place(1002, 'Buenos Aires', -34.6037, -58.3816, { country: 'Argentina', countryCode: 'AR', nameEn: 'Buenos Aires' })],
    elements: [
      el(11, { tourism: 'hostel', name: 'Albergue Ejemplo Palermo', charge: 'ARS 12.500 por persona por noche' }, -34.5880, -58.4300),
      el(12, { tourism: 'hostel', name: 'Hostel Sin Precio San Telmo' }, -34.6210, -58.3720),
      el(13, { tourism: 'guest_house', name: 'Posada de Prueba' }, -34.6000, -58.3900),
    ],
  },
  santiago: {
    // Ambíguo: Santiago (Chile) e Santiago de Compostela (Espanha) com importância parecida.
    query: 'Santiago',
    nominatim: [
      place(1003, 'Santiago', -33.4489, -70.6693, { country: 'Chile', countryCode: 'CL', nameEn: 'Santiago', importance: 0.75 }),
      place(1004, 'Santiago de Compostela', 42.8805, -8.5457, { country: 'España', countryCode: 'ES', nameEn: 'Santiago de Compostela', importance: 0.7 }),
    ],
    elements: [
      el(21, { tourism: 'hostel', name: 'Hostal Ejemplo Bellavista', charge: '15000 CLP per person per night' }, -33.4300, -70.6350),
      el(22, { tourism: 'camp_site', name: 'Camping Ficticio Cajón', fee: 'yes' }, -33.4600, -70.6000),
    ],
  },
  paraty: {
    query: 'Paraty', nominatim: [place(1005, 'Paraty', -23.2178, -44.7131, { country: 'Brasil', countryCode: 'BR', state: 'Rio de Janeiro', nameEn: 'Paraty', regionCode: 'BR-RJ' })],
    elements: [
      el(31, { tourism: 'camp_site', name: 'Camping Exemplo Trindade', charge: 'R$ 50 por pessoa por noite', 'addr:city': 'Paraty' }, -23.3560, -44.7240),
      el(32, { tourism: 'guest_house', name: 'Pousada Fictícia do Centro', charge: 'R$ 280 por quarto por noite', 'addr:city': 'Paraty' }, -23.2200, -44.7150),
      el(33, { tourism: 'guest_house', name: 'Pousada Sem Preço', 'addr:city': 'Paraty' }, -23.2190, -44.7160),
      el(34, { tourism: 'hostel', name: 'Hostel Exemplo Paraty', charge: 'R$ 70 por pessoa por noite', 'addr:city': 'Paraty' }, -23.2170, -44.7140),
    ],
  },
  tokyo: {
    // Primeiro resultado é a província (ampla); há uma cidade equivalente: o resolvedor usa a cidade.
    query: '東京',
    nominatim: [
      place(1006, '東京都', 35.6762, 139.6503, { country: '日本', countryCode: 'JP', nameEn: 'Tokyo', kind: 'province', importance: 0.9, bbox: ['20.4', '35.9', '136.0', '153.9'] }),
      place(1007, '東京', 35.6895, 139.6917, { country: '日本', countryCode: 'JP', nameEn: 'Tokyo', kind: 'city', importance: 0.6 }),
    ],
    elements: [
      el(41, { tourism: 'hostel', name: '渋谷ゲストハウス', charge: '3500 JPY per person per night' }, 35.6580, 139.7010),
      el(42, { tourism: 'hostel', name: 'ホステル浅草', 'name:en': 'Hostel Asakusa' }, 35.7110, 139.7970),
      el(43, { tourism: 'guest_house', name: 'ゲストハウス上野' }, 35.7140, 139.7740),
      el(44, { tourism: 'camp_site', name: 'キャンプ場 多摩', fee: 'no' }, 35.7600, 139.4000),
    ],
  },
};

export const overpassBody = (elements) => ({ version: 0.6, osm3s: { timestamp_osm_base: '2026-11-10T11:00:00Z' }, elements });
export const jsonResponse = (body, { status = 200 } = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body });

/** fetch simulado: Nominatim, Overpass e Wikivoyage por URL. Conta as chamadas. */
export function fakeFetch({ cities = CITIES, wikivoyage = null, overpassStatus = 200 } = {}) {
  const calls = { nominatim: 0, overpass: 0, wikivoyage: 0 };
  const impl = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('nominatim')) {
      calls.nominatim += 1;
      const q = new URL(u).searchParams.get('q');
      const city = Object.values(cities).find((c) => c.query === q);
      return jsonResponse(city?.nominatim ?? []);
    }
    if (u.includes('overpass')) {
      calls.overpass += 1;
      if (overpassStatus !== 200) return jsonResponse({}, { status: overpassStatus });
      const body = decodeURIComponent(String(init.body ?? ''));
      const m = /around:\d+,(-?[\d.]+),(-?[\d.]+)/.exec(body);
      const city = Object.values(cities).find((c) => c.nominatim.some((n) => Math.abs(Number(n.lat) - Number(m?.[1])) < 0.2 && Math.abs(Number(n.lon) - Number(m?.[2])) < 0.2));
      const wanted = /\^\((.*?)\)\$/.exec(body)?.[1]?.split('|') ?? [];
      return jsonResponse(overpassBody((city?.elements ?? []).filter((e) => wanted.includes(e.tags.tourism))));
    }
    if (u.includes('wikivoyage')) {
      calls.wikivoyage += 1;
      return wikivoyage ? jsonResponse(wikivoyage) : jsonResponse({ query: { pages: [{ title: 'X', missing: true }] } });
    }
    throw new Error(`URL inesperada no teste: ${u}`);
  };
  return Object.assign(impl, { calls });
}
