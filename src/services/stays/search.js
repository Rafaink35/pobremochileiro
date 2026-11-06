// Orquestrador do Stay Finder: destino → fontes em paralelo (cada uma isolada, com cache de 24 h, interruptor e tempo limite)
// → deduplicação → classificação de preço → ranking. Falha de uma fonte nunca derruba a resposta: ela aparece na lista de fontes.
import { COMMUNITY_ONLY_CATEGORIES, parseCategories, UNCLASSIFIED } from './categories.js';
import { createBreaker, createStaleCache } from './cache.js';
import { destinationFrom, MAX_RADIUS_M, MIN_RADIUS_M, RESOLVE_STATUS } from './destination.js';
import { groupDuplicates } from './dedupe.js';
import { rankStays } from './rank.js';
import { haversineMeters, validateCoordinates } from '../geo.js';

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('tempo esgotado'), { timeout: true })), ms))]);
const friendly = (err) => (err?.timeout ? 'tempo esgotado' : err?.status ? `a fonte respondeu ${err.status}` : `sem resposta da fonte${err?.cause?.code ? ` (${err.cause.code})` : err?.code ? ` (${err.code})` : ''}`);
const GEOCODER_SOURCE = Object.freeze({ id: 'nominatim', name: 'Nominatim (OpenStreetMap)', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', url: 'https://operations.osmfoundation.org/policies/nominatim/' });

const CATEGORY_NOTE = {
  ecovila: 'Não há fonte aberta confiável de ecovilas: nenhuma é listada sem cadastro aprovado. Use o diretório da Global Ecovillage Network nos links abaixo.',
  colaborativa: 'Hospedagem colaborativa (Couchsurfing, Worldpackers, Workaway...) não tem dados abertos: use os sites diretamente. As oportunidades aprovadas de trabalho em troca estão na aba própria.',
};

export function createStaySearch({ resolver, sources, cache = createStaleCache(), breaker = createBreaker(), now = () => new Date(), timeoutMs = 25_000 }) {
  async function runSource(source, { destination, categories }) {
    const meta = source.describe();
    const base = { id: meta.id, name: meta.name, license: meta.license, licenseUrl: meta.licenseUrl ?? null, attribution: meta.attribution, url: meta.url ?? null };
    const sup = source.supports(categories, destination);
    if (!sup.ok) return { ...base, status: sup.notConfigured ? 'not_configured' : 'skipped', reason: sup.reason, records: [] };
    const key = `${meta.id}|${destination.lat.toFixed(3)},${destination.lon.toFixed(3)}|${destination.radiusM}|${[...categories].sort().join(',')}`;
    const hit = cache.get(key);
    const fromHit = (status) => ({ ...base, status, records: hit.value.records, note: hit.value.note ?? null, collectedAt: hit.value.collectedAt, fromCache: true, cachedAt: new Date(hit.at).toISOString() });
    if (hit?.fresh) return fromHit('ok');
    if (breaker.isOpen(meta.id)) return hit ? fromHit('stale') : { ...base, status: 'failed', error: 'fonte em pausa após falhas seguidas', records: [] };
    try {
      const out = await withTimeout(source.search({ destination, categories }), timeoutMs);
      cache.set(key, out);
      breaker.success(meta.id);
      return { ...base, status: 'ok', records: out.records, note: out.note ?? null, collectedAt: out.collectedAt, fromCache: false, rejected: out.rejected ?? 0 };
    } catch (err) {
      breaker.failure(meta.id);
      return hit ? { ...fromHit('stale'), error: friendly(err) } : { ...base, status: 'failed', error: friendly(err), records: [] };
    }
  }

  return {
    async search({ query, lat, lon, label, name, nameEn, countryCode, regionCode, radiusM, categories: rawCategories } = {}) {
      const categories = parseCategories(rawCategories);
      if (!categories) return { status: 'invalid', message: 'Categoria inválida.', groups: null };
      let destination;
      const chosen = validateCoordinates(lat, lon);
      if (chosen && !String(query ?? '').trim()) {
        const r = Math.round(Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Number(radiusM) || 5000)));
        destination = destinationFrom({ name: String(name ?? label ?? 'Destino escolhido').slice(0, 120), nameEn: nameEn ? String(nameEn).slice(0, 120) : null, label: String(label ?? name ?? '').slice(0, 200), lat: chosen.lat, lon: chosen.lon, radiusM: r, countryCode: /^[A-Za-z]{2}$/.test(countryCode ?? '') ? countryCode.toUpperCase() : null, regionCode: /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(regionCode ?? '') ? regionCode : null, id: name ? 'escolhido' : null });
      } else {
        const res = await resolver.resolve(query);
        if (res.status !== RESOLVE_STATUS.OK) return { status: res.status, message: res.message, candidates: res.candidates ?? [], groups: null };
        destination = res.destination;
      }

      const results = await Promise.all(sources.map((s) => runSource(s, { destination, categories })));
      const attempted = results.filter((r) => !['skipped', 'not_configured'].includes(r.status));
      const usable = results.filter((r) => r.status === 'ok' || r.status === 'stale');
      const categoryNotes = categories.filter((c) => COMMUNITY_ONLY_CATEGORIES.includes(c)).map((c) => CATEGORY_NOTE[c]);
      const sourceInfo = results.map(({ records, ...info }) => ({ ...info, count: records.length }));
      const common = { destination, destinationSource: GEOCODER_SOURCE, categories, collectedAt: now().toISOString(), sources: sourceInfo, categoryNotes };

      if (attempted.length && !usable.length) return { ...common, status: 'unavailable', message: 'As fontes de dados não responderam agora. Tente de novo em alguns minutos.', groups: null };

      const wanted = new Set(categories);
      const center = { lat: destination.lat, lon: destination.lon };
      // Registros "não classificados" entram na deduplicação (podem ser o mesmo local de um registro classificado) e só
      // aparecem sozinhos se a categoria "não classificada" foi pedida.
      const records = usable.flatMap((r) => r.records).filter((r) => wanted.has(r.category) || r.category === UNCLASSIFIED);
      const allGroups = groupDuplicates(records);
      const unclassifiedHidden = allGroups.filter((g) => !wanted.has(g.category)).length;
      const grouped = allGroups.filter((g) => wanted.has(g.category)).map((g) => ({ ...g, distanceM: g.lat != null ? Math.round(haversineMeters(center, { lat: g.lat, lon: g.lon })) : null }));
      const ranking = rankStays(grouped, now());
      const failed = results.filter((r) => r.status === 'failed' || r.status === 'stale').length;
      return {
        ...common,
        status: failed ? 'partial' : 'ok',
        message: !attempted.length ? 'Nenhuma fonte disponível para as categorias pedidas.' : grouped.length ? null : 'Nenhum estabelecimento encontrado nas fontes consultadas. Isso não prova que não existam: as fontes podem não ter cadastro nesta área.',
        groups: { ranked: ranking.ranked, withPrice: ranking.withPrice, stalePrice: ranking.stalePrice, noPrice: ranking.noPrice },
        rankKey: ranking.rankKey, rankNotes: ranking.notes,
        counts: { total: grouped.length, ranked: ranking.ranked.length, withPrice: ranking.withPrice.length, stalePrice: ranking.stalePrice.length, noPrice: ranking.noPrice.length, duplicatesGrouped: grouped.reduce((n, g) => n + g.groupSize - 1, 0), possibleDuplicates: grouped.filter((g) => g.possibleDuplicates.length).length, unclassifiedHidden },
      };
    },
  };
}
