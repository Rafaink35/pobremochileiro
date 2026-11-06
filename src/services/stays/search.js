// Orquestrador do Stay Finder: destino → fontes em paralelo (cada uma isolada, com cache de 24 h, interruptor e tempo limite)
// → deduplicação → classificação de preço → ranking. Falha de uma fonte nunca derruba a resposta: ela aparece na lista de fontes.
import { COMMUNITY_ONLY_CATEGORIES, parseCategories, UNCLASSIFIED } from './categories.js';
import { createBreaker, createStaleCache } from './cache.js';
import { destinationFrom, MAX_RADIUS_M, MIN_RADIUS_M, RESOLVE_STATUS } from './destination.js';
import { groupDuplicates } from './dedupe.js';
import { rankStays } from './rank.js';
import { hasName, normalizeLimit, selectForDisplay } from './display.js';
import { haversineMeters, validateCoordinates } from '../geo.js';

const withTimeout = (promise, ms) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('tempo esgotado'), { timeout: true })), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
};
const BUSY_STATUS = new Set([429, 502, 503, 504]);
const friendly = (err, name = 'A fonte') => (err?.timeout || err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'tempo esgotado' : BUSY_STATUS.has(err?.status) ? `${name} ocupado ou indisponível (HTTP ${err.status})` : err?.status ? `a fonte respondeu ${err.status}` : `sem resposta da fonte${err?.cause?.code ? ` (${err.cause.code})` : err?.code ? ` (${err.code})` : ''}`);
const GEOCODER_SOURCE = Object.freeze({ id: 'nominatim', name: 'Nominatim (OpenStreetMap)', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', url: 'https://operations.osmfoundation.org/policies/nominatim/' });

const CATEGORY_NOTE = {
  ecovila: 'Não há fonte aberta confiável de ecovilas: nenhuma é listada sem cadastro aprovado. Use o diretório da Global Ecovillage Network nos links abaixo.',
  colaborativa: 'Hospedagem colaborativa (Couchsurfing, Worldpackers, Workaway...) não tem dados abertos: use os sites diretamente. As oportunidades aprovadas de trabalho em troca estão na aba própria.',
};

/**
 * Monta o resultado a partir dos registros já normalizados: deduplicação, distância ao centro, separação de registros sem nome (P3),
 * classificação de preço e ranking, e seleção do que é exibido (P2). É a MESMA função usada pela pesquisa e pelo script de análise
 * local (`scripts/analyze-overpass-json.mjs`), para que a análise exercite o código real.
 */
export function assembleResults({ records, categories, center, limit, now = new Date() }) {
  const wanted = new Set(categories);
  // Registros "não classificados" entram na deduplicação (podem ser o mesmo local de um registro classificado) e só
  // aparecem sozinhos se a categoria "não classificada" foi pedida.
  const allGroups = groupDuplicates(records.filter((r) => wanted.has(r.category) || r.category === UNCLASSIFIED));
  const unclassifiedHidden = allGroups.filter((g) => !wanted.has(g.category)).length;
  const grouped = allGroups.filter((g) => wanted.has(g.category)).map((g) => ({ ...g, distanceM: g.lat != null ? Math.round(haversineMeters(center, { lat: g.lat, lon: g.lon })) : null }));
  // P3: registros sem nome seguem no processamento (agrupamento e classificação de preço), mas não entram na lista nem no ranking.
  const named = grouped.filter(hasName);
  const unnamedItems = grouped.filter((g) => !hasName(g));
  const ranking = rankStays(named, now);
  // P2: no máximo `limit` resultados no total (padrão 100), por proximidade; "mostrar mais" pede um limite maior.
  const view = selectForDisplay(ranking, unnamedItems, normalizeLimit(limit), now);
  return { grouped, named, unnamedItems, ranking, view, unclassifiedHidden };
}

/**
 * Tempo máximo por fonte: `timeoutMs` (25 s) ou o valor de `sourceTimeoutMs[id]` (ex.: Overpass, 75 s). As fontes rodam em paralelo,
 * então o tempo total da pesquisa (depois de localizar o destino) é o maior desses limites.
 */
export function createStaySearch({ resolver, sources, cache = createStaleCache(), breaker = createBreaker(), now = () => new Date(), timeoutMs = 25_000, sourceTimeoutMs = {}, resolveTimeoutMs = 25_000 }) {
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
    // Cada fonte tem um sinal de cancelamento: ao terminar, estourar o tempo ou falhar, ele é acionado e a fonte não faz mais
    // nenhuma consulta (nem nova tentativa, nem chamada que estava na fila do limitador de taxa).
    const ctrl = new AbortController();
    try {
      const out = await withTimeout(source.search({ destination, categories, signal: ctrl.signal }), sourceTimeoutMs[meta.id] ?? timeoutMs);
      cache.set(key, out);
      breaker.success(meta.id);
      return { ...base, status: 'ok', records: out.records, note: out.note ?? null, collectedAt: out.collectedAt, fromCache: false, rejected: out.rejected ?? 0 };
    } catch (err) {
      breaker.failure(meta.id);
      return hit ? { ...fromHit('stale'), error: friendly(err, meta.name) } : { ...base, status: 'failed', error: friendly(err, meta.name), records: [] };
    } finally {
      ctrl.abort(); // operação desta fonte encerrada
    }
  }

  return {
    async search({ query, lat, lon, label, name, nameEn, countryCode, regionCode, radiusM, categories: rawCategories, limit: rawLimit } = {}) {
      const categories = parseCategories(rawCategories);
      if (!categories) return { status: 'invalid', message: 'Categoria inválida.', groups: null };
      let destination;
      const chosen = validateCoordinates(lat, lon);
      if (chosen && !String(query ?? '').trim()) {
        const r = Math.round(Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Number(radiusM) || 5000)));
        destination = destinationFrom({ name: String(name ?? label ?? 'Destino escolhido').slice(0, 120), nameEn: nameEn ? String(nameEn).slice(0, 120) : null, label: String(label ?? name ?? '').slice(0, 200), lat: chosen.lat, lon: chosen.lon, radiusM: r, countryCode: /^[A-Za-z]{2}$/.test(countryCode ?? '') ? countryCode.toUpperCase() : null, regionCode: /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(regionCode ?? '') ? regionCode : null, id: name ? 'escolhido' : null });
      } else {
        // Localizar o destino também tem prazo (25 s) e é cancelado ao estourar: sem consulta depois do fim.
        const geoCtrl = new AbortController();
        let res;
        try {
          res = await withTimeout(resolver.resolve(query, { signal: geoCtrl.signal }), resolveTimeoutMs);
        } catch {
          res = { status: RESOLVE_STATUS.UNAVAILABLE, message: 'Não foi possível localizar o destino agora (tempo esgotado).', candidates: [] };
        } finally {
          geoCtrl.abort();
        }
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

      const center = { lat: destination.lat, lon: destination.lon };
      const records = usable.flatMap((r) => r.records);
      const { grouped, named, ranking, view, unnamedItems, unclassifiedHidden } = assembleResults({ records, categories, center, limit: rawLimit, now: now() });
      const failed = results.filter((r) => r.status === 'failed' || r.status === 'stale').length;
      const emptyMessage = !named.length && unnamedItems.length
        ? `As fontes só trazem ${unnamedItems.length} local(is) sem nome nesta área: eles não são listados porque não dá para identificá-los.`
        : 'Nenhum estabelecimento encontrado nas fontes consultadas. Isso não prova que não existam: as fontes podem não ter cadastro nesta área.';
      return {
        ...common,
        status: failed ? 'partial' : 'ok',
        message: !attempted.length ? 'Nenhuma fonte disponível para as categorias pedidas.' : named.length ? null : emptyMessage,
        groups: view.groups,
        unnamed: view.unnamed,
        rankKey: ranking.rankKey, rankNotes: ranking.notes,
        counts: { ...view.counts, duplicatesGrouped: grouped.reduce((n, g) => n + g.groupSize - 1, 0), possibleDuplicates: grouped.filter((g) => g.possibleDuplicates.length).length, unclassifiedHidden },
      };
    },
  };
}
