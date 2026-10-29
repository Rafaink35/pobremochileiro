// Ferramentas que a IA pode chamar. Cada uma devolve DADOS REAIS das fontes e registra cada resultado
// em `sources` com um id; o roteiro só pode usar valores que batam com esses ids (ver verify.js).
import { affiliateLinks, withPassengers } from '../../../netlify/functions/flights.mjs';
import { fetchOsmCampings } from '../lodging/osmCamping.js';
import { dedupeLodgings } from '../lodging/lodgingModel.js';
import { filterOpportunities } from '../workExchange/opportunity.js';

export const TOOL_DEFINITIONS = [
  {
    name: 'get_fx_rate',
    description: 'Cotação de uma moeda em reais (BRL por 1 unidade). Moedas: USD, EUR, GBP, ARS, CLP.',
    input_schema: {
      type: 'object',
      properties: { currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'ARS', 'CLP'] } },
      required: ['currency'],
    },
  },
  {
    name: 'search_flights',
    description:
      'Voos mais baratos (preços de cache de até 48h, em reais) entre dois aeroportos por código IATA. Cada resultado traz um id para citar.',
    input_schema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'IATA de 3 letras, ex.: GRU' },
        destination: { type: 'string', description: 'IATA de 3 letras, ex.: BOG' },
        month: { type: 'string', description: 'AAAA-MM (opcional)' },
        adults: { type: 'integer', minimum: 1, maximum: 9 },
        one_way: { type: 'boolean' },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'search_campings',
    description: 'Campings e áreas de motorhome do OpenStreetMap numa cidade, região ou estado. Preço quase sempre não informado.',
    input_schema: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] },
  },
  {
    name: 'list_work_exchange',
    description: 'Oportunidades de trabalho em troca de hospedagem já aprovadas no app, filtradas por lugar (pode estar vazio).',
    input_schema: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] },
  },
];

const IATA = /^[A-Za-z]{3}$/;
const FX_URL = 'https://economia.awesomeapi.com.br/json/last/';

/** Cria o executor de ferramentas, com dependências injetáveis (testes) e registro das fontes. */
export function createToolbox({ env, fetchImpl, now = () => new Date() }) {
  const sources = new Map();
  let seq = 0;
  const register = (kind, data) => {
    const id = `${kind}-${(seq += 1)}`;
    sources.set(id, { kind, ...data });
    return id;
  };

  const handlers = {
    async get_fx_rate({ currency }) {
      const res = await fetchImpl(`${FX_URL}${encodeURIComponent(currency)}-BRL`);
      if (!res.ok) return { error: `câmbio indisponível (${res.status})` };
      const row = (await res.json())[`${currency}BRL`];
      const bid = row && Number(row.bid);
      if (!(bid > 0)) return { error: 'cotação não encontrada' };
      return { currency, brl_per_unit: bid, as_of: row.create_date ?? null, note: 'referência, sem taxas nem IOF' };
    },

    async search_flights({ origin, destination, month, adults = 1, one_way = false }) {
      if (!IATA.test(origin) || !IATA.test(destination)) return { error: 'use códigos IATA de 3 letras' };
      if (!env.TRAVELPAYOUTS_TOKEN || !env.TRAVELPAYOUTS_MARKER) return { error: 'busca de voos não configurada' };
      const n = Math.min(9, Math.max(1, Number(adults) || 1));
      const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
      url.search = new URLSearchParams({
        origin: origin.toUpperCase(), destination: destination.toUpperCase(), currency: 'brl',
        sorting: 'price', limit: '5', unique: 'false',
        ...(month && /^\d{4}-\d{2}$/.test(month) && { departure_at: month }),
        ...(one_way && { one_way: 'true' }),
      });
      const res = await fetchImpl(url, { headers: { 'x-access-token': env.TRAVELPAYOUTS_TOKEN } });
      if (!res.ok) return { error: `serviço de voos respondeu ${res.status}` };
      const rows = ((await res.json()).data ?? []).slice(0, 5);
      if (!rows.length) return { results: [], note: 'nenhum preço guardado para essa rota' };
      const links = await affiliateLinks(rows.map((r) => withPassengers(r.link, n)), {
        token: env.TRAVELPAYOUTS_TOKEN, marker: env.TRAVELPAYOUTS_MARKER, trs: env.TRAVELPAYOUTS_TRS,
      });
      return {
        note: 'preços de cache (até 48h); total para todos os passageiros',
        results: rows.map((r, i) => {
          const total = Math.round(r.price * n * 100) / 100;
          const id = register('voo', { priceBRL: total, url: links[i], name: 'Aviasales', label: `${origin}→${destination}` });
          return { id, total_brl: total, per_person_brl: r.price, airline: r.airline, departure_at: r.departure_at, return_at: r.return_at ?? null, transfers: r.transfers };
        }),
      };
    },

    async search_campings({ place }) {
      const r = await fetchOsmCampings(place, { fetchImpl, now });
      if (r.status !== 'ok') return { results: [], note: r.message };
      return {
        note: '© OpenStreetMap contributors (ODbL). Não garante que o local está aberto.',
        results: dedupeLodgings(r.records).slice(0, 8).map((c) => {
          const priceBRL = c.fee === 'free' ? 0 : c.price?.currency === 'BRL' ? c.price.amount : null;
          const id = register('camping', { priceBRL, url: c.source.sourceUrl, name: 'OpenStreetMap', label: c.name ?? 'Camping sem nome' });
          return { id, name: c.name, kind: c.kind, city: c.city, fee: c.fee, price_brl: priceBRL, price_unit_known: false, website: c.website };
        }),
      };
    },

    async list_work_exchange({ place }) {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { results: [], note: 'cadastro de work exchange não configurado' };
      const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/work_exchange_opportunities?status=eq.approved&select=*&limit=100`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
      });
      if (!res.ok) return { results: [], note: `cadastro indisponível (${res.status})` };
      const { opportunities } = filterOpportunities(await res.json(), { place, now: now() });
      return {
        results: opportunities.slice(0, 8).map((o) => {
          const id = register('troca', { priceBRL: null, url: o.externalUrl, name: o.hostName, label: o.hostName });
          return { id, host: o.hostName, city: o.city, state: o.state, hours_per_week: o.hoursPerWeek, accommodation: o.accommodation, meals: o.meals, expenses: o.expenses };
        }),
      };
    },
  };

  return {
    sources,
    async run(name, input) {
      const fn = handlers[name];
      if (!fn) return { error: `ferramenta desconhecida: ${name}` };
      try {
        return await fn(input ?? {});
      } catch (err) {
        return { error: err?.message || 'falha na ferramenta' };
      }
    },
  };
}
