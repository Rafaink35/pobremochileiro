// Montagem do serviço padrão do servidor: fontes reais, caches em memória (24 h) e identificação por contato.
// Nenhuma chave é necessária. Variáveis opcionais (não secretas): OVERPASS_URL, OVERPASS_CONTACT, GEOCODER_URL, GEOCODER_CONTACT, CADASTUR_CSV_URL.
import { createOsmAdapter, DEFAULT_OVERPASS_URL } from '../datalayer/sources/osm.js';
import { createCadasturAdapter } from '../datalayer/sources/cadastur.js';
import { createDestinationResolver, DEFAULT_GEOCODER_URL } from './destination.js';
import { createOsmStaySource } from './sources/osm.js';
import { createWikivoyageSource } from './sources/wikivoyage.js';
import { createCadasturStaySource } from './sources/cadastur.js';
import { createCommunityStaySource } from './sources/community.js';
import { createStaySearch } from './search.js';

export function createDefaultStayService(env = process.env, { fetchImpl, limiter, sleep, now, searchOptions } = {}) {
  const contact = env.OVERPASS_CONTACT || null;
  const f = { ...(fetchImpl && { fetchImpl }), ...(limiter && { limiter }), ...(sleep && { sleep }), ...(now && { now }) };
  return createStaySearch({
    ...(now && { now }),
    ...(searchOptions ?? {}),
    resolver: createDestinationResolver({ endpoint: env.GEOCODER_URL || DEFAULT_GEOCODER_URL, contact: env.GEOCODER_CONTACT || contact, ...f }),
    sources: [
      createOsmStaySource({ adapter: createOsmAdapter({ endpoint: env.OVERPASS_URL || DEFAULT_OVERPASS_URL, contact, cache: { get: () => undefined, set: () => {} }, ...f }), ...(now && { now }) }),
      createWikivoyageSource({ contact, ...f }),
      createCadasturStaySource({ adapter: createCadasturAdapter({ csvUrl: env.CADASTUR_CSV_URL || null, ...(fetchImpl && { fetchImpl }) }) }),
      createCommunityStaySource(),
    ],
  });
}
