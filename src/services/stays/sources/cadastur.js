// Fonte Cadastur (Ministério do Turismo): complementar e SÓ para o Brasil. Registro oficial, sem coordenadas, preço ou
// disponibilidade. Lê o CSV configurado pelo dono do projeto (CADASTUR_CSV_URL); sem ele a fonte aparece como "não configurada".
// O formato real e a licença do arquivo não foram validados (ver docs/stay-finder.md).
import { createCadasturAdapter, CADASTUR_SOURCE } from '../../datalayer/sources/cadastur.js';
import { createStaleCache } from '../cache.js';
import { normText } from '../unicode.js';

const CATEGORY = { hostel: 'hostel', pousada: 'pousada', guest_house: 'pousada', camping: 'camping', caravan_site: 'camping', hotel: 'hotel' };

export function toStayRecord(e, { collectedAt }) {
  const category = CATEGORY[e.type];
  if (!category) return null;
  const source = { provider: 'cadastur', name: 'Cadastur', license: e.license, licenseUrl: null, attribution: e.attribution, copyrightUrl: CADASTUR_SOURCE.url, originalId: e.source_id, sourceUrl: e.source_url, collectedAt, lastEditedAt: e.last_verified_at };
  return {
    id: `cadastur:${e.source_id}`, provider: 'cadastur', sourceId: e.source_id, name: e.name, category, osmKind: null, lat: null, lon: null, address: e.address,
    city: e.city, region: e.state, country: 'BR', website: e.website, phone: e.phone, email: null, stars: null, openingHours: null, access: null,
    amenities: {}, tents: null, caravans: null, feeTag: null, priceText: null, openStatus: 'unknown', registry: 'cadastur', prices: [], sources: [source],
  };
}

export function createCadasturStaySource({ adapter = createCadasturAdapter({ csvUrl: process.env.CADASTUR_CSV_URL || null }), cache = createStaleCache(), now = () => new Date() } = {}) {
  const loadAll = async () => {
    const hit = cache.get('csv');
    if (hit?.fresh) return hit.value;
    try {
      const { elements } = await adapter.fetch();
      const collectedAt = now().toISOString();
      const { records } = adapter.normalize(elements, null, collectedAt);
      cache.set('csv', { records, collectedAt });
      return { records, collectedAt };
    } catch (err) {
      if (hit) return hit.value; // fonte fora do ar: usa a última cópia
      throw err;
    }
  };
  return {
    id: 'cadastur',
    describe: () => ({ id: 'cadastur', name: 'Cadastur (Ministério do Turismo)', license: adapter.getSource().license, licenseUrl: null, attribution: CADASTUR_SOURCE.attribution, url: CADASTUR_SOURCE.url }),
    supports(categories, destination) {
      if (!adapter.isConfigured()) return { ok: false, notConfigured: true, reason: 'arquivo do Cadastur não configurado (CADASTUR_CSV_URL)' };
      if (destination.countryCode && destination.countryCode !== 'BR') return { ok: false, reason: 'o Cadastur só cobre o Brasil' };
      return categories.some((c) => ['camping', 'hostel', 'pousada', 'hotel'].includes(c)) ? { ok: true } : { ok: false, reason: 'categorias sem registro no Cadastur' };
    },
    async search({ destination, categories }) {
      const { records: all, collectedAt } = await loadAll();
      const city = normText(destination.name);
      const uf = /^BR-[A-Z]{2}$/.test(destination.regionCode ?? '') ? destination.regionCode.slice(3) : null;
      const wanted = new Set(categories);
      const records = [];
      for (const e of all) {
        if (normText(e.city) !== city || (uf && e.state && e.state !== uf)) continue;
        const r = toStayRecord(e, { collectedAt });
        if (r && wanted.has(r.category)) records.push(r);
      }
      return { records, rejected: 0, collectedAt };
    },
  };
}
