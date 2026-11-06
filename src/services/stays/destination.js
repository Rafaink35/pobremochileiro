// Resolvedor global de destinos. Texto livre (qualquer idioma ou alfabeto) → centro + raio de busca, via Nominatim (OSM),
// SEM suposição quando há ambiguidade: "Paris" ou "Santiago" devolvem a lista de candidatos para a pessoa escolher.
// Política do Nominatim (confirmar a vigente): uso moderado, identificação por User-Agent, cache. Aqui: no máximo 1 consulta
// por segundo, cache de 24 h por texto e uso somente no servidor.
import { haversineMeters, parseLatLon, validateCoordinates } from '../geo.js';
import { createCache, createRateLimiter, HttpError, parseRetryAfter, requestSignal, withBackoff } from '../datalayer/cache.js';
import { normText } from './unicode.js';

export const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
export const MIN_RADIUS_M = 2000;
export const MAX_RADIUS_M = 25000;
const TOO_BROAD_HALF_DIAGONAL_M = 60_000;
// Recusados sempre: um país ou continente inteiro não é destino.
const NEVER_KINDS = new Set(['country', 'continent', 'archipelago', 'ocean', 'sea']);
// Áreas administrativas amplas (estado, província, região, condado): a pessoa confirma uma pesquisa a 15 km do ponto de referência.
const ADMIN_BROAD_KINDS = new Set(['state', 'region', 'province', 'county', 'state_district']);
const BROAD_KINDS = new Set([...NEVER_KINDS, ...ADMIN_BROAD_KINDS]);

export const RESOLVE_STATUS = Object.freeze({ OK: 'ok', AMBIGUOUS: 'ambiguous', BROAD: 'broad', NOT_FOUND: 'not_found', TOO_BROAD: 'too_broad', INVALID: 'invalid', UNAVAILABLE: 'unavailable' });
export const BROAD_REFERENCE_RADIUS_M = 15_000;

export function validateQuery(q) {
  const t = String(q ?? '').normalize('NFC').trim();
  if ([...t].length < 2 || [...t].length > 80 || /[\u0000-\u001f<>{}]/.test(t)) return null;
  return t;
}

const radiusFromBbox = (bbox) => {
  if (!bbox) return null;
  const [s, w, n, e] = bbox;
  return haversineMeters({ lat: s, lon: w }, { lat: n, lon: e }) / 2;
};

const toNum = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));

/** Resultado do Nominatim → candidato. Descarta o que não tem coordenadas válidas. */
export function toCandidate(r) {
  const c = validateCoordinates(toNum(r?.lat), toNum(r?.lon));
  if (!c || !r?.osm_type || !r?.osm_id) return null;
  const bb = Array.isArray(r.boundingbox) && r.boundingbox.length === 4 ? r.boundingbox.map(Number) : null; // [sul, norte, oeste, leste]
  const bbox = bb && bb.every(Number.isFinite) ? [bb[0], bb[2], bb[1], bb[3]] : null; // [sul, oeste, norte, leste]
  const half = radiusFromBbox(bbox);
  const a = r.address ?? {};
  const names = r.namedetails ?? {};
  return {
    id: `${r.osm_type}/${r.osm_id}`,
    name: String(r.name || a.city || a.town || a.village || String(r.display_name ?? '').split(',')[0] || '').trim(),
    nameEn: names['name:en'] ?? names.name ?? null,
    nameEnExplicit: names['name:en'] ?? null,
    label: String(r.display_name ?? '').slice(0, 200),
    kind: String(r.addresstype || r.type || ''),
    country: a.country ?? null,
    countryCode: /^[A-Za-z]{2}$/.test(a.country_code ?? '') ? a.country_code.toUpperCase() : null,
    region: a.state ?? a.region ?? null,
    regionCode: a['ISO3166-2-lvl4'] ?? null,
    lat: c.lat,
    lon: c.lon,
    bbox,
    halfDiagonalM: half,
    radiusM: Math.round(Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, half ?? 5000))),
    importance: Number.isFinite(Number(r.importance)) ? Number(r.importance) : 0,
    placeRank: Number.isFinite(Number(r.place_rank)) ? Number(r.place_rank) : null,
  };
}

/**
 * Ambíguo: dois lugares DISTINTOS (países diferentes ou a mais de 30 km) com importância comparável (o segundo tem pelo menos 75%
 * da importância do primeiro). Um lugar bem mais importante que o resto não é ambíguo ("Paris" resolve para a França).
 */
export function isAmbiguous(cands) {
  if (cands.length < 2) return false;
  const [a, b] = cands;
  const distinct = (a.countryCode && b.countryCode && a.countryCode !== b.countryCode) || haversineMeters({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) > 30_000;
  return distinct && b.importance >= 0.75 * a.importance;
}

/** O nome do próprio lugar (primeiro trecho do nome completo) é o que foi digitado? Resultados achados só por nome alternativo ficam atrás. */
export function directMatch(c, query) {
  const q = normText(query);
  // Só o nome completo do lugar e o nome em inglês EXPLÍCITO contam (o campo `name` do resultado pode ser o nome alternativo achado).
  return [String(c.label ?? '').split(',')[0], c.nameEnExplicit].some((n) => normText(n) === q);
}

const CITY_KINDS = new Set(['city', 'town', 'village', 'suburb', 'municipality', 'borough', 'city_district', 'quarter', 'neighbourhood', 'hamlet']);

/** Cidade ou bairro nunca é "área ampla" (o raio é limitado a 25 km do centro); região, estado e país são. */
export function isTooBroad(c) {
  if (CITY_KINDS.has(c.kind)) return false;
  return BROAD_KINDS.has(c.kind) || (c.halfDiagonalM ?? 0) > TOO_BROAD_HALF_DIAGONAL_M;
}

/** Remove áreas administrativas amplas quando há uma cidade com o mesmo nome (ex.: o distrito "Lisboa" ao lado da cidade de Lisboa). */
export function dropShadowingAdmin(cands) {
  const cityNames = new Set(cands.filter((c) => CITY_KINDS.has(c.kind)).map((c) => normText(c.name)));
  return cands.filter((c) => !(ADMIN_BROAD_KINDS.has(c.kind) && cityNames.has(normText(c.name))));
}

/** Se o primeiro resultado é uma região (ex.: "Tóquio" como província) e há uma cidade com o mesmo lugar nos resultados, usa a cidade. */
export function preferCity(cands) {
  const top = cands[0];
  if (!top || !BROAD_KINDS.has(top.kind)) return cands;
  const city = cands.find((c) => CITY_KINDS.has(c.kind) && haversineMeters({ lat: top.lat, lon: top.lon }, { lat: c.lat, lon: c.lon }) <= 40_000);
  return city ? [city, ...cands.filter((c) => c !== city)] : cands;
}

/** Destino a partir de um candidato já escolhido (ou de coordenadas): é o que as fontes recebem. */
export const destinationFrom = (c) => ({
  id: c.id ?? null, name: c.name, nameEn: c.nameEn ?? null, label: c.label ?? c.name, country: c.country ?? null, countryCode: c.countryCode ?? null,
  region: c.region ?? null, regionCode: c.regionCode ?? null, lat: c.lat, lon: c.lon, radiusM: c.radiusM,
});

export function createDestinationResolver({
  fetchImpl = (...a) => fetch(...a),
  endpoint = DEFAULT_GEOCODER_URL,
  contact = null, // e-mail ou URL de contato, no User-Agent (identificação exigida pelo serviço público)
  lang = 'pt-BR,en',
  now = () => new Date(),
  cache = createCache({ ttlMs: 24 * 3600_000 }),
  limiter = createRateLimiter({ minIntervalMs: 1100 }),
  sleep,
  retries = 2,
  requestTimeoutMs = 15_000, deadlineMs = 20_000, minAttemptMs = 3_000, // dentro dos 25 s da localização do destino
} = {}) {
  async function geocode(q, signal) {
    const key = `${endpoint}|${lang}|${normText(q)}`;
    const hit = cache.get(key);
    if (hit) return { results: hit, fromCache: true };
    const url = `${endpoint}?${new URLSearchParams({ q, format: 'jsonv2', limit: '5', addressdetails: '1', namedetails: '1', 'accept-language': lang })}`;
    const results = await limiter.run(() => {
      signal?.throwIfAborted(); // na fila do limitador quando a operação acabou: não sai
      const deadlineAt = now().getTime() + deadlineMs;
      return withBackoff(async () => {
        const remaining = deadlineAt - now().getTime();
        if (remaining <= 0) throw Object.assign(new Error('prazo total esgotado'), { name: 'TimeoutError' });
        const sig = requestSignal(Math.min(requestTimeoutMs, remaining), signal);
        const res = await fetchImpl(url, { headers: { 'user-agent': `PobreMochileiro/0.3${contact ? ` (${contact})` : ''}`, accept: 'application/json' }, ...(sig && { signal: sig }) });
        if (!res.ok) throw new HttpError(res.status, parseRetryAfter(res.headers?.get?.('retry-after'), () => now().getTime()));
        const json = await res.json();
        if (!Array.isArray(json)) throw new HttpError(502);
        return json;
      }, { retries, sleep, now: () => now().getTime(), deadlineAt, minAttemptMs, signal });
    });
    cache.set(key, results);
    return { results, fromCache: false };
  }

  return {
    async resolve(input, { signal } = {}) {
      const coords = parseLatLon(input);
      if (coords) {
        const c = { id: null, name: 'Coordenadas informadas', label: `${coords.lat}, ${coords.lon}`, lat: coords.lat, lon: coords.lon, radiusM: 5000 };
        return { status: RESOLVE_STATUS.OK, destination: destinationFrom(c), candidates: [], fromCache: false };
      }
      const q = validateQuery(input);
      if (!q) return { status: RESOLVE_STATUS.INVALID, message: 'Digite o nome de uma cidade ou região (2 a 80 caracteres).', candidates: [] };
      let out;
      try {
        out = await geocode(q, signal);
      } catch (err) {
        return { status: RESOLVE_STATUS.UNAVAILABLE, message: `Não foi possível localizar o destino agora (${err?.status ? `serviço respondeu ${err.status}` : 'sem resposta'}).`, candidates: [] };
      }
      const mapped = out.results.map(toCandidate).filter(Boolean);
      // Resultados cujo nome é o digitado vêm antes dos achados só por nome alternativo; depois, por importância.
      const direct = mapped.filter((c) => directMatch(c, q));
      const pool = dropShadowingAdmin(direct.length ? direct : mapped).sort((a, b) => b.importance - a.importance);
      const candidates = preferCity(pool);
      if (!candidates.length) return { status: RESOLVE_STATUS.NOT_FOUND, message: `Não encontrei "${q}". Confira a grafia ou inclua o país.`, candidates: [], fromCache: out.fromCache };
      if (isAmbiguous(candidates)) {
        return { status: RESOLVE_STATUS.AMBIGUOUS, message: `Há mais de um lugar chamado "${q}". Escolha um.`, candidates, fromCache: out.fromCache };
      }
      const top = candidates[0];
      if (ADMIN_BROAD_KINDS.has(top.kind) && !CITY_KINDS.has(top.kind)) {
        // Ex.: "Tóquio" no OSM é uma província enorme: pergunta se pode pesquisar perto do ponto de referência, sem fingir que cobre tudo.
        const ref = { ...top, radiusM: BROAD_REFERENCE_RADIUS_M, referencePoint: true };
        return { status: RESOLVE_STATUS.BROAD, message: `"${top.name}" é uma área administrativa ampla (${top.kind}). Posso pesquisar num raio de ${BROAD_REFERENCE_RADIUS_M / 1000} km do ponto de referência dela, que não cobre a área inteira. Para outra parte, informe uma cidade ou bairro.`, candidates: [ref], fromCache: out.fromCache };
      }
      if (isTooBroad(top)) {
        return { status: RESOLVE_STATUS.TOO_BROAD, message: `"${top.name}" é uma área muito grande (${top.kind || 'região'}). Informe uma cidade ou localidade.`, candidates: [top], fromCache: out.fromCache };
      }
      return { status: RESOLVE_STATUS.OK, destination: destinationFrom(top), candidates: [top], fromCache: out.fromCache };
    },
  };
}
