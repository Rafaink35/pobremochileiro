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

/** Política de uso do Overpass público: ver docs/stay-finder.md ("Políticas de uso e licenças"). */
export const OVERPASS_POLICY = Object.freeze({ retries: 1, baseMs: 60_000, requestTimeoutMs: 65_000, deadlineMs: 70_000, sourceTimeoutMs: 75_000, minAttemptMs: 5_000 });

export function createDefaultStayService(env = process.env, { fetchImpl, limiter, sleep, now, searchOptions } = {}) {
  const contact = env.OVERPASS_CONTACT || null;
  const f = { ...(fetchImpl && { fetchImpl }), ...(limiter && { limiter }), ...(sleep && { sleep }), ...(now && { now }) };
  return createStaySearch({
    ...(now && { now }),
    sourceTimeoutMs: { osm: OVERPASS_POLICY.sourceTimeoutMs },
    ...(searchOptions ?? {}),
    resolver: createDestinationResolver({ endpoint: env.GEOCODER_URL || DEFAULT_GEOCODER_URL, contact: env.GEOCODER_CONTACT || contact, ...f }),
    sources: [
      // Overpass: UM endpoint (OVERPASS_URL), no máximo 1 nova tentativa (espera mínima de 30 s ou o Retry-After), cada requisição
      // com 65 s, prazo total de 70 s (nova tentativa só se a espera + 5 s úteis couberem) e sem consulta de status nem alternância
      // automática entre espelhos. Geocodificador e Wikivoyage têm prazos próprios (20 s e 24 s) dentro dos 25 s de cada fonte.
      createOsmStaySource({ adapter: createOsmAdapter({ endpoint: env.OVERPASS_URL || DEFAULT_OVERPASS_URL, contact, cache: { get: () => undefined, set: () => {} }, retries: OVERPASS_POLICY.retries, baseMs: OVERPASS_POLICY.baseMs, maxMs: OVERPASS_POLICY.baseMs, requestTimeoutMs: OVERPASS_POLICY.requestTimeoutMs, deadlineMs: OVERPASS_POLICY.deadlineMs, minAttemptMs: OVERPASS_POLICY.minAttemptMs, ...f }), ...(now && { now }) }),
      createWikivoyageSource({ contact, ...f }),
      createCadasturStaySource({ adapter: createCadasturAdapter({ csvUrl: env.CADASTUR_CSV_URL || null, ...(fetchImpl && { fetchImpl }) }) }),
      createCommunityStaySource(),
    ],
  });
}
