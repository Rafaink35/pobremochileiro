// Provedor GTFS Schedule: importa um ZIP autorizado, valida e responde buscas de viagens DIRETAS
// (sem baldeação) entre paradas, em memória. Não há preços nem tempo real inventados:
// tarifa só aparece quando fare_attributes/fare_rules a determinam sem ambiguidade.
import { unzipSync, strFromU8 } from 'fflate';
import { createSourceMetadata } from './sourceMetadata.js';
import {
  createTravelOption,
  durationSeconds,
  formatServiceTime,
  gtfsRouteTypeToMode,
  normalizePrice,
  parseGtfsTime,
} from './normalizers.js';
import { SEARCH_STATUS, searchResult } from './transportProvider.js';
import { haversineMeters, parseLatLon } from '../geo.js';

const REQUIRED = ['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'];
const OPTIONAL = ['calendar.txt', 'calendar_dates.txt', 'fare_attributes.txt', 'fare_rules.txt'];

/** CSV simples com aspas (RFC 4180), tolerante a BOM e a \r\n. */
export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// Hash FNV-1a do conteúdo, para detectar o mesmo conjunto importado novamente.
export function contentHash(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const ymd = (date) => String(date).replaceAll('-', '');

/** O serviço opera na data? (calendar.txt + exceções de calendar_dates.txt). */
export function serviceActive(dataset, serviceId, date) {
  const day = ymd(date);
  const exception = dataset.calendarDates.get(serviceId)?.get(day);
  if (exception === '1') return true;
  if (exception === '2') return false;
  const cal = dataset.calendar.get(serviceId);
  if (!cal || day < cal.start || day > cal.end) return false;
  const d = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`);
  const key = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()];
  return cal[key] === '1';
}

/**
 * Importa um ZIP GTFS. Nunca lança: erros de validação vão em `errors` e `dataset` fica null.
 * `registry` (Map hash->dataset) evita duplicar um conjunto idêntico importado outra vez.
 */
export function importGtfsZip(zipBytes, metaInput = {}, registry = new Map()) {
  const errors = [];
  const warnings = [];
  let files;
  try {
    files = unzipSync(zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes));
  } catch {
    return { dataset: null, duplicate: false, errors: ['Arquivo não é um ZIP válido.'], warnings };
  }

  // Aceita arquivos na raiz ou dentro de uma única pasta.
  const byName = new Map(Object.entries(files).map(([path, data]) => [path.split('/').pop(), data]));
  const missing = REQUIRED.filter((f) => !byName.has(f));
  if (missing.length) errors.push(`Arquivos obrigatórios ausentes: ${missing.join(', ')}`);
  if (!byName.has('calendar.txt') && !byName.has('calendar_dates.txt')) {
    errors.push('É preciso calendar.txt ou calendar_dates.txt.');
  }
  if (errors.length) return { dataset: null, duplicate: false, errors, warnings };

  const hash = contentHash(zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes));
  if (registry.has(hash)) {
    return { dataset: registry.get(hash), duplicate: true, errors: [], warnings: ['Conjunto já importado.'] };
  }

  const read = (name) => (byName.has(name) ? parseCsv(strFromU8(byName.get(name))) : []);
  const agencies = read('agency.txt');
  const stops = read('stops.txt');
  const routes = read('routes.txt');
  const trips = read('trips.txt');
  const stopTimes = read('stop_times.txt');

  const stopById = new Map(stops.map((s) => [s.stop_id, s]));
  const routeById = new Map(routes.map((r) => [r.route_id, r]));
  const agencyById = new Map(agencies.map((a) => [a.agency_id || '', a]));
  const tripById = new Map(trips.map((t) => [t.trip_id, t]));

  const calendar = new Map(read('calendar.txt').map((c) => [c.service_id, c]));
  const calendarDates = new Map();
  for (const c of read('calendar_dates.txt')) {
    if (!calendarDates.has(c.service_id)) calendarDates.set(c.service_id, new Map());
    calendarDates.get(c.service_id).set(c.date, c.exception_type);
  }

  // Validação de referências: registra e ignora linhas inválidas.
  let badRoutes = 0;
  for (const t of trips) {
    if (!routeById.has(t.route_id)) badRoutes += 1;
    else if (!calendar.has(t.service_id) && !calendarDates.has(t.service_id)) {
      warnings.push(`Viagem ${t.trip_id}: service_id ${t.service_id} sem calendário.`);
    }
  }
  if (badRoutes) warnings.push(`${badRoutes} viagem(ns) referenciam route_id inexistente e serão ignoradas.`);

  const timesByTrip = new Map();
  let badStopTimes = 0;
  for (const st of stopTimes) {
    if (!tripById.has(st.trip_id) || !stopById.has(st.stop_id)) {
      badStopTimes += 1;
      continue;
    }
    const arrival = parseGtfsTime(st.arrival_time);
    const departure = parseGtfsTime(st.departure_time);
    if (!timesByTrip.has(st.trip_id)) timesByTrip.set(st.trip_id, []);
    timesByTrip.get(st.trip_id).push({
      stopId: st.stop_id,
      seq: Number(st.stop_sequence),
      arrival: arrival ?? departure, // horários vazios (intermediários) ficam null
      departure: departure ?? arrival,
    });
  }
  if (badStopTimes) warnings.push(`${badStopTimes} linha(s) de stop_times com viagem ou parada inexistente foram ignoradas.`);
  for (const list of timesByTrip.values()) list.sort((a, b) => a.seq - b.seq);

  if (stops.length === 0 || trips.length === 0) errors.push('Conjunto sem paradas ou sem viagens.');
  if (errors.length) return { dataset: null, duplicate: false, errors, warnings };

  const fares = new Map(read('fare_attributes.txt').map((f) => [f.fare_id, f]));
  const fareRules = read('fare_rules.txt');

  const dataset = {
    hash,
    importedAt: new Date().toISOString(),
    meta: createSourceMetadata({ ...metaInput, obtainedAt: metaInput.obtainedAt ?? new Date().toISOString() }),
    hasFares: fares.size > 0,
    optionalFiles: OPTIONAL.filter((f) => byName.has(f)),
    agencies: agencyById,
    stops: stopById,
    routes: routeById,
    trips: tripById,
    timesByTrip,
    calendar,
    calendarDates,
    fares,
    fareRules,
    counts: { stops: stops.length, routes: routes.length, trips: trips.length, stopTimes: stopTimes.length },
  };
  registry.set(hash, dataset);
  return { dataset, duplicate: false, errors, warnings };
}

/** Tarifa de uma viagem, somente se houver UMA tarifa aplicável sem ambiguidade; senão null. */
export function fareForRoute(dataset, routeId) {
  const ids = new Set(
    dataset.fareRules.filter((r) => r.route_id === routeId || (!r.route_id && !r.origin_id && !r.destination_id)).map((r) => r.fare_id),
  );
  const only = ids.size === 1 ? dataset.fares.get([...ids][0]) : null;
  return only ? normalizePrice(only.price, only.currency_type) : null;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export const NEARBY_STOP_RADIUS_M = 800;

/**
 * Paradas que correspondem ao texto: "lat,lon" (paradas num raio de 800 m) ou nome/stop_id (sem geocodificação).
 */
export function findStops(dataset, text) {
  const point = parseLatLon(text);
  if (point) {
    return [...dataset.stops.values()].filter((s) => {
      const c = { lat: Number(s.stop_lat), lon: Number(s.stop_lon) };
      return Number.isFinite(c.lat) && Number.isFinite(c.lon) && haversineMeters(point, c) <= NEARBY_STOP_RADIUS_M;
    });
  }
  const q = norm(text);
  if (!q) return [];
  return [...dataset.stops.values()].filter((s) => s.stop_id === text || norm(s.stop_name).includes(q));
}

/** Provedor que atende buscas sobre os conjuntos GTFS importados. */
export function createGtfsProvider() {
  const registry = new Map();
  return {
    id: 'gtfs',
    name: 'Dados GTFS importados',
    registry,
    importZip: (bytes, meta) => importGtfsZip(bytes, meta, registry),
    isConfigured: () => registry.size > 0,
    /** Modalidades realmente presentes nos conjuntos importados (derivadas de routes.txt). */
    describeCoverage() {
      const modes = new Set();
      for (const d of registry.values()) for (const r of d.routes.values()) modes.add(gtfsRouteTypeToMode(r.route_type));
      return modes.size
        ? { modes: [...modes], text: `Modalidades nesta fonte: ${[...modes].join(', ')}. Não presuma que cobre outros modos ou operadores.` }
        : { modes: [], text: 'Nenhum conjunto GTFS importado.' };
    },
    getSource() {
      const metas = [...registry.values()].map((d) => d.meta);
      return metas.length === 1 ? metas[0] : null;
    },
    async search({ origin, destination, date }) {
      const options = [];
      let lastSource = null;
      for (const ds of registry.values()) {
        lastSource = ds.meta;
        const fromIds = new Set(findStops(ds, origin).map((s) => s.stop_id));
        const toIds = new Set(findStops(ds, destination).map((s) => s.stop_id));
        if (!fromIds.size || !toIds.size) continue;
        for (const [tripId, times] of ds.timesByTrip) {
          const trip = ds.trips.get(tripId);
          const route = ds.routes.get(trip.route_id);
          if (!route) continue;
          if (date && !serviceActive(ds, trip.service_id, date)) continue;
          const i = times.findIndex((t) => fromIds.has(t.stopId));
          if (i < 0) continue;
          const j = times.findIndex((t, k) => k > i && toIds.has(t.stopId));
          if (j < 0) continue;
          const start = times[i].departure;
          const end = times[j].arrival;
          const agency = ds.agencies.get(route.agency_id || '') ?? [...ds.agencies.values()][0];
          options.push(
            createTravelOption(
              {
                id: `${ds.hash}:${tripId}`,
                origin: ds.stops.get(times[i].stopId).stop_name,
                destination: ds.stops.get(times[j].stopId).stop_name,
                mode: gtfsRouteTypeToMode(route.route_type),
                departure: start,
                arrival: end,
                departureText: formatServiceTime(start),
                arrivalText: formatServiceTime(end),
                durationSeconds: durationSeconds(start, end),
                price: fareForRoute(ds, route.route_id),
                operator: agency?.agency_name ?? null,
                lineName: route.route_short_name || route.route_long_name || null,
                url: agency?.agency_url ?? null,
                partial: start === null || end === null,
              },
              ds.meta,
            ),
          );
        }
      }
      options.sort((a, b) => (a.departure ?? Infinity) - (b.departure ?? Infinity));
      return searchResult(options.length ? SEARCH_STATUS.OK : SEARCH_STATUS.EMPTY, {
        options,
        source: lastSource,
        message: options.length ? null : 'Nenhuma viagem direta encontrada nos dados importados.',
      });
    },
  };
}
