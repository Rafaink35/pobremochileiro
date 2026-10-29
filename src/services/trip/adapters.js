// Adaptadores dos modelos já existentes no app para a base de conhecimento. Preços só entram se a fonte os der.
import { createPrice, unknownPrice, PRICE_STATUS } from './price.js';

/** Camping do OpenStreetMap -> hospedagem. `fee=no` vira preço publicado 0; preço com unidade desconhecida fica desconhecido. */
export function lodgingFromCamping(c, destinationId) {
  const s = c.source;
  const origin = { sourceId: 'osm', name: s.name };
  const common = { origin, referenceUrl: s.sourceUrl, collectedAt: s.collectedAt };
  let price = unknownPrice(c.chargeText ? `valor do OSM: "${c.chargeText}" (unidade não informada)` : null);
  if (c.fee === 'free') {
    price = createPrice({ ...common, status: PRICE_STATUS.PUBLISHED, amount: 0, currency: 'BRL', unit: { basis: 'group', period: 'once' }, note: 'fee=no no OpenStreetMap' });
  }
  return {
    id: c.id, destinationId, name: c.name ?? 'Camping sem nome', kind: c.kind === 'caravan_site' ? 'caravan_site' : 'camping',
    tags: [], lat: c.lat, lon: c.lon, acceptsTents: c.tents, website: c.website, price, openStatus: 'unknown',
    licenseSourceId: 'osm',
  };
}

/** Oportunidade de work exchange aprovada -> registro da base. A hospedagem em troca não tem preço em reais. */
export function workExchangeFromOpportunity(o, destinationId) {
  return {
    id: String(o.id), destinationId, hostName: o.hostName, hostType: o.hostType, hoursPerWeek: o.hoursPerWeek,
    accommodation: o.accommodation, meals: o.meals, expenses: o.expenses, status: o.status, endDate: o.endDate, spots: o.spots,
    updatedAt: o.updatedAt, externalUrl: o.externalUrl,
    price: o.expenses
      ? unknownPrice(`despesas do voluntário (texto do anfitrião): ${o.expenses}`)
      : unknownPrice('despesas do voluntário não informadas'),
  };
}
