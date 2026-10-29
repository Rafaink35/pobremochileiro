// Utilitários de coordenadas e links externos de mapa.

export function validateCoordinates(lat, lon) {
  const la = typeof lat === 'string' ? Number(lat.trim()) : lat;
  const lo = typeof lon === 'string' ? Number(lon.trim()) : lon;
  if (typeof lat === 'string' && !lat.trim()) return null;
  if (typeof lon === 'string' && !lon.trim()) return null;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lon: lo };
}

/** Lê "lat,lon". Retorna null se não for um par de coordenadas válido. */
export function parseLatLon(text) {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(text ?? ''));
  return m ? validateCoordinates(m[1], m[2]) : null;
}

export function haversineMeters(a, b) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Links para abrir o destino em serviços externos de mapa. Retornam null com coordenadas inválidas.
 * Esses links NÃO são rotas validadas pelo Pobre Mochileiro.
 */
export function externalMapLinks(lat, lon) {
  const c = validateCoordinates(lat, lon);
  if (!c) return null;
  return {
    openStreetMap: `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=15/${c.lat}/${c.lon}`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${c.lat}%2C${c.lon}`,
  };
}
