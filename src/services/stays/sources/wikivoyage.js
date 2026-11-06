// Fonte Wikivoyage (candidata): lê as listagens "Sleep" da página do destino na MediaWiki API pública.
// Licença CC BY-SA 4.0 (política vigente de Wikivoyage:Copyleft, verificada em 06/11/2026; conteúdo antigo pode estar em 3.0): atribuição obrigatória e compartilhamento pela mesma licença; por isso os
// registros daqui NUNCA têm campos misturados com os do OpenStreetMap (ODbL): ficam separados, cada um com sua atribuição.
// Limites: só a página principal do destino (bairros ficam em subpáginas); a listagem NÃO traz o tipo do local e o tipo não é
// deduzido do nome: o registro fica "não classificado" (e só ganha categoria se for o mesmo local de um registro classificado
// por fonte estruturada); o preço só vale com valor e moeda explícitos E com a data do campo `lastedit` da própria listagem:
// a data da revisão da página NÃO prova a idade do preço (qualquer edição na página a atualiza), então sem `lastedit` o preço
// fica indisponível (o texto original continua visível).
import { validateCoordinates, haversineMeters } from '../../geo.js';
import { createRateLimiter, HttpError, parseRetryAfter, withBackoff } from '../../datalayer/cache.js';
import { UNCLASSIFIED } from '../categories.js';
import { parseStayCharge } from '../price.js';

export const WIKIVOYAGE_SOURCE = Object.freeze({
  id: 'wikivoyage', name: 'Wikivoyage', license: 'CC BY-SA 4.0 (conteúdo antigo pode estar em 3.0)', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Wikivoyage contributors', url: 'https://en.wikivoyage.org/',
});
export const DEFAULT_WIKIVOYAGE_API = 'https://en.wikivoyage.org/w/api.php';

/** Extrai as predefinições {{...}} do wikitexto, respeitando aninhamento. Devolve [{ name, params }]. */
export function parseTemplates(wikitext) {
  const text = String(wikitext ?? '');
  const out = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] !== '{' || text[i + 1] !== '{') continue;
    let depth = 0;
    let j = i;
    for (; j < text.length - 1; j += 1) {
      if (text[j] === '{' && text[j + 1] === '{') { depth += 1; j += 1; } else if (text[j] === '}' && text[j + 1] === '}') { depth -= 1; j += 1; if (depth === 0) break; }
    }
    if (depth !== 0) break; // predefinição não fechada: para
    const inner = text.slice(i + 2, j - 1);
    const parts = [];
    let cur = '';
    let d = 0;
    for (let k = 0; k < inner.length; k += 1) {
      const two = inner.slice(k, k + 2);
      if (two === '{{' || two === '[[') { d += 1; cur += two; k += 1; } else if (two === '}}' || two === ']]') { d -= 1; cur += two; k += 1; } else if (inner[k] === '|' && d === 0) { parts.push(cur); cur = ''; } else cur += inner[k];
    }
    parts.push(cur);
    const params = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    }
    out.push({ name: parts[0].trim().toLowerCase(), params });
    i = j;
  }
  return out;
}

const plain = (v) => String(v ?? '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/<[^>]*>/g, '').trim() || null;
const httpUrl = (v) => (/^https?:\/\/[^\s]+$/i.test(String(v ?? '').trim()) ? String(v).trim() : null);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) && !Number.isNaN(Date.parse(v)) ? new Date(`${String(v).trim()}T00:00:00Z`).toISOString() : null);

/** Listagens de hospedagem do wikitexto → registros. `revisionAt` = data da revisão da página (fallback do preço). */
export function parseSleepListings(wikitext, { title, revisionAt, destination, collectedAt }) {
  const records = [];
  const skipped = { noCoordinates: 0, outsideArea: 0, noName: 0 };
  let n = 0;
  for (const t of parseTemplates(wikitext)) {
    const isSleep = t.name === 'sleep' || (t.name === 'listing' && String(t.params.type ?? '').toLowerCase() === 'sleep');
    if (!isSleep) continue;
    n += 1;
    const name = plain(t.params.name);
    if (!name) { skipped.noName += 1; continue; }
    const c = validateCoordinates(t.params.lat, t.params.long ?? t.params.lon);
    if (!c) { skipped.noCoordinates += 1; continue; }
    if (destination && haversineMeters(c, destination) > destination.radiusM * 1.5) { skipped.outsideArea += 1; continue; }
    const pageUrl = `https://en.wikivoyage.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
    const source = { provider: 'wikivoyage', name: WIKIVOYAGE_SOURCE.name, license: WIKIVOYAGE_SOURCE.license, licenseUrl: WIKIVOYAGE_SOURCE.licenseUrl, attribution: WIKIVOYAGE_SOURCE.attribution, copyrightUrl: WIKIVOYAGE_SOURCE.url, originalId: `${title}#${n}`, sourceUrl: pageUrl, collectedAt, lastEditedAt: isoDate(t.params.lastedit), pageRevisionAt: revisionAt ?? null };
    const priceText = plain(t.params.price);
    const parsed = parseStayCharge(priceText ?? '');
    const prices = parsed
      ? [{ status: 'published', amount: parsed.amount, currency: parsed.currency, unit: parsed.unit, observedAt: source.lastEditedAt /* só o `lastedit` da listagem */, text: parsed.text, source: { provider: 'wikivoyage', name: WIKIVOYAGE_SOURCE.name, license: WIKIVOYAGE_SOURCE.license, attribution: WIKIVOYAGE_SOURCE.attribution, url: pageUrl } }]
      : [];
    records.push({
      id: `wikivoyage:${title}#${n}`, provider: 'wikivoyage', sourceId: `${title}#${n}`, name, category: UNCLASSIFIED, osmKind: null, lat: c.lat, lon: c.lon,
      address: plain(t.params.address), city: null, region: null, country: destination?.countryCode ?? null,
      website: httpUrl(t.params.url), phone: plain(t.params.phone), email: plain(t.params.email), stars: null, openingHours: null, access: null,
      amenities: {}, tents: null, caravans: null, feeTag: null, priceText, openStatus: 'unknown', prices, sources: [source],
    });
  }
  return { records, skipped, listings: n };
}

export function createWikivoyageSource({
  fetchImpl = (...a) => fetch(...a), endpoint = DEFAULT_WIKIVOYAGE_API, contact = null, now = () => new Date(),
  limiter = createRateLimiter({ minIntervalMs: 1000 }), sleep, retries = 2,
} = {}) {
  return {
    id: WIKIVOYAGE_SOURCE.id,
    describe: () => ({ ...WIKIVOYAGE_SOURCE, endpoint }),
    supports(categories, destination) {
      if (!destination.id && !destination.name) return { ok: false, reason: 'sem nome de destino (coordenadas informadas)' };
      return categories.some((c) => ['camping', 'hostel', 'pousada', 'hotel', UNCLASSIFIED].includes(c)) ? { ok: true } : { ok: false, reason: 'categorias sem listagem no Wikivoyage' };
    },
    async search({ destination, categories }) {
      const title = destination.nameEn || destination.name;
      const url = `${endpoint}?${new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content|timestamp', rvslots: 'main', titles: title, format: 'json', formatversion: '2', redirects: '1' })}`;
      const json = await limiter.run(() => withBackoff(async () => {
        const res = await fetchImpl(url, { headers: { 'user-agent': `PobreMochileiro/0.3${contact ? ` (${contact})` : ''}`, accept: 'application/json' } });
        if (!res.ok) throw new HttpError(res.status, parseRetryAfter(res.headers?.get?.('retry-after'), () => now().getTime()));
        const body = await res.json();
        if (!body?.query) throw new HttpError(502);
        return body;
      }, { retries, sleep }));
      const page = json.query.pages?.[0];
      const rev = page?.revisions?.[0];
      const collectedAt = now().toISOString();
      if (!page || page.missing || !rev) return { records: [], rejected: 0, collectedAt, note: `Sem página "${title}" no Wikivoyage.` };
      const wikitext = rev.slots?.main?.content ?? rev.content ?? '';
      const { records, skipped, listings } = parseSleepListings(wikitext, { title: page.title ?? title, revisionAt: rev.timestamp ?? null, destination, collectedAt });
      const parts = [];
      if (skipped.noCoordinates) parts.push(`${skipped.noCoordinates} sem coordenadas`);
      if (skipped.outsideArea) parts.push(`${skipped.outsideArea} fora da área`);
      return { records, rejected: listings - records.length, collectedAt, listings, note: parts.length ? `Wikivoyage: ${parts.join('; ')} (não exibidos).` : null };
    },
  };
}
