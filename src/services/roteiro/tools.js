// Ferramentas que a IA pode chamar. Cada uma devolve DADOS REAIS das fontes e registra cada resultado
// em `sources` com um id; o roteiro só pode usar valores que batam com esses ids (ver verify.js).
import { affiliateLinks, withPassengers } from '../../../netlify/functions/flights.mjs';
import { fetchOsmCampings } from '../lodging/osmCamping.js';
import { dedupeLodgings } from '../lodging/lodgingModel.js';
import { filterOpportunities } from '../workExchange/opportunity.js';
import { planSummary } from '../planner/stays.js';
import { verifyRoteiro } from './verify.js';

const IATA_PROP = { type: 'string', description: 'IATA de 3 letras, ex.: GRU' };

// Ferramentas extras do chat (precisam do contexto da conversa).
export const CHAT_TOOL_DEFINITIONS = [
  {
    name: 'record_user_value',
    description:
      'Registra um valor em reais que o PRÓPRIO usuário informou (ex.: preço do ônibus que ele pesquisou). Só use com valor dito pelo usuário. Devolve um id para citar.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'string' }, amount_brl: { type: 'number', minimum: 0 } },
      required: ['label', 'amount_brl'],
    },
  },
  {
    name: 'get_plan',
    description: 'Lê o plano atual do usuário (itens, hospedagens guardadas, orçamento, total parcial e o que falta). Cada item com valor recebe um id.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_flex_dates',
    description:
      'Dias de ida mais baratos (cache de até 48h) num período de até 62 dias, com mínimo e máximo de dias fora para ida e volta.',
    input_schema: {
      type: 'object',
      properties: {
        origin: IATA_PROP, destination: IATA_PROP,
        from: { type: 'string', description: 'AAAA-MM-DD' }, to: { type: 'string', description: 'AAAA-MM-DD' },
        min_stay: { type: 'integer' }, max_stay: { type: 'integer' },
        adults: { type: 'integer', minimum: 1, maximum: 9 }, one_way: { type: 'boolean' },
      },
      required: ['origin', 'destination', 'from', 'to'],
    },
  },
  {
    name: 'compare_combo',
    description:
      'Compara voo direto de uma cidade com ônibus até outra cidade + voo de lá. O custo do ônibus (por pessoa) DEVE ter sido informado pelo usuário.',
    input_schema: {
      type: 'object',
      properties: {
        destination: IATA_PROP, direct_from: IATA_PROP, hub_from: IATA_PROP,
        ground_cost_brl: { type: 'number', minimum: 0, description: 'ônibus por pessoa, informado pelo usuário' },
        month: { type: 'string', description: 'AAAA-MM (opcional)' }, adults: { type: 'integer', minimum: 1, maximum: 9 },
      },
      required: ['destination', 'direct_from', 'hub_from', 'ground_cost_brl'],
    },
  },
  {
    name: 'propose_plan_items',
    description:
      'Propõe itens para o plano do usuário. O servidor verifica cada valor contra os resultados das ferramentas e devolve o total confirmado; o usuário decide se adiciona. Use fonte_id de um resultado real; valor_brl null quando não houver fonte.',
    input_schema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              categoria: { type: 'string', enum: ['Transporte', 'Hospedagem', 'Comida', 'Passeios', 'Extras'] },
              descricao: { type: 'string' }, fonte_id: { type: ['string', 'null'] }, valor_brl: { type: ['number', 'null'] },
              observacao: { type: 'string' },
            },
            required: ['categoria', 'descricao'],
          },
        },
      },
      required: ['itens'],
    },
  },
];

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
export function createToolbox({ env, fetchImpl, now = () => new Date(), plan = null, extraAllowed = [] }) {
  const sources = new Map();
  const proposals = [];
  const allowed = new Set(extraAllowed.filter((n) => Number.isFinite(n)));
  let seq = 0;
  // Todo número em reais que sai de uma ferramenta passa a ser um valor citável na conversa.
  const collect = (value, key = '') => {
    if (typeof value === 'number' && /brl$/i.test(key)) allowed.add(Math.round(value * 100) / 100);
    else if (Array.isArray(value)) value.forEach((v) => collect(v, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => collect(v, k));
  };
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
        // Chave nova (sb_publishable_...) não é JWT e vai só em `apikey`; a antiga (anon, JWT) também vai em Authorization.
        headers: { apikey: env.SUPABASE_ANON_KEY, ...(env.SUPABASE_ANON_KEY.startsWith('eyJ') && { authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }) },
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

  Object.assign(handlers, {
    async record_user_value({ label, amount_brl }) {
      if (!(Number.isFinite(amount_brl) && amount_brl >= 0)) return { error: 'valor inválido' };
      const id = register('usuario', { priceBRL: amount_brl, url: null, name: 'Informado por você', label: String(label ?? '').slice(0, 100) });
      return { id, amount_brl };
    },

    async get_plan() {
      if (!plan) return { items: [], note: 'plano não enviado' };
      const summary = planSummary(plan);
      const items = (plan.items ?? []).map((it) => {
        const n = Number(String(it.amount ?? '').replace(/\./g, '').replace(',', '.'));
        const id = Number.isFinite(n) && String(it.amount ?? '').trim() !== ''
          ? register('plano', { priceBRL: n, url: null, name: 'Seu plano', label: it.label || it.category })
          : null;
        return { id, category: it.category, label: it.label, amount_brl: id ? n : null };
      });
      const stayCats = (plan.stays ?? []).length ? ['Hospedagem'] : [];
      const covered = new Set([...(plan.items ?? []).map((i) => i.category), ...stayCats]);
      const missingCategories = ['Transporte', 'Hospedagem', 'Comida'].filter((c) => !covered.has(c));
      return {
        budget_brl: summary.limit,
        known_total_brl: summary.knownTotal,
        complete: summary.complete && missingCategories.length === 0,
        missing_categories: missingCategories,
        note: 'o plano só tem o que o usuário lançou; categorias ausentes ainda não têm valor',
        missing: summary.unknown,
        items,
        stays: (plan.stays ?? []).map((s) => ({ name: s.name, kind: s.kind, cost_status: s.cost.status, transport_status: s.transport.status })),
      };
    },

    async search_flex_dates({ origin, destination, from, to, min_stay = 0, max_stay = 365, adults = 1, one_way = false }) {
      const D = /^\d{4}-\d{2}-\d{2}$/;
      if (!IATA.test(origin) || !IATA.test(destination)) return { error: 'use códigos IATA de 3 letras' };
      if (!D.test(from) || !D.test(to) || to < from) return { error: 'período inválido' };
      if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) return { error: 'o período pode ter no máximo 62 dias' };
      if (!env.TRAVELPAYOUTS_TOKEN || !env.TRAVELPAYOUTS_MARKER) return { error: 'busca de voos não configurada' };
      const n = Math.min(9, Math.max(1, Number(adults) || 1));
      const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
      const rows = [];
      for (const month of months) {
        const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
        url.search = new URLSearchParams({
          origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_at: month, currency: 'brl',
          sorting: 'price', limit: '1000', unique: 'false', ...(one_way && { one_way: 'true' }),
        });
        const res = await fetchImpl(url, { headers: { 'x-access-token': env.TRAVELPAYOUTS_TOKEN } });
        if (!res.ok) return { error: `serviço de voos respondeu ${res.status}` };
        rows.push(...((await res.json()).data ?? []));
      }
      const byDay = new Map();
      for (const r of rows) {
        const day = String(r.departure_at ?? '').slice(0, 10);
        if (day < from || day > to) continue;
        if (!one_way) {
          const back = String(r.return_at ?? '').slice(0, 10);
          const stay = Math.round((Date.parse(back) - Date.parse(day)) / 86400000);
          if (!Number.isFinite(stay) || stay < min_stay || stay > max_stay) continue;
        }
        if (!byDay.has(day) || r.price < byDay.get(day).price) byDay.set(day, r);
      }
      const best = [...byDay.entries()].sort(([, a], [, b]) => a.price - b.price).slice(0, 5);
      if (!best.length) return { results: [], note: 'nenhum preço guardado nesse período' };
      const links = await affiliateLinks(best.map(([, r]) => withPassengers(r.link, n)), {
        token: env.TRAVELPAYOUTS_TOKEN, marker: env.TRAVELPAYOUTS_MARKER, trs: env.TRAVELPAYOUTS_TRS,
      });
      return {
        note: 'preços de cache (até 48h); total para todos os passageiros',
        results: best.map(([day, r], i) => {
          const total = Math.round(r.price * n * 100) / 100;
          const id = register('voo', { priceBRL: total, url: links[i], name: 'Aviasales', label: `${origin}→${destination} ${day}` });
          return { id, departure_day: day, return_day: r.return_at ? String(r.return_at).slice(0, 10) : null, total_brl: total, per_person_brl: r.price, airline: r.airline };
        }),
      };
    },

    async compare_combo({ destination, direct_from, hub_from, ground_cost_brl, month, adults = 1 }) {
      if (!(Number.isFinite(ground_cost_brl) && ground_cost_brl >= 0)) return { error: 'informe o custo do ônibus' };
      const n = Math.min(9, Math.max(1, Number(adults) || 1));
      const [direct, hub] = await Promise.all(
        [direct_from, hub_from].map((o) => handlers.search_flights({ origin: o, destination, month, adults: n })),
      );
      if (direct.error || hub.error) return { error: direct.error || hub.error };
      const d = direct.results?.[0] ?? null;
      const h = hub.results?.[0] ?? null;
      const groundTotal = Math.round(ground_cost_brl * n * 100) / 100;
      const out = { direct: d, hub_flight: h, ground_total_brl: groundTotal, note: 'valores de cache; ônibus informado pelo usuário' };
      if (d && h) {
        out.combo_total_brl = Math.round((h.total_brl + groundTotal) * 100) / 100;
        out.cheaper = out.combo_total_brl < d.total_brl ? 'combo' : 'direct';
        out.difference_brl = Math.round(Math.abs(out.combo_total_brl - d.total_brl) * 100) / 100;
      }
      return out;
    },

    async propose_plan_items({ itens }) {
      const verified = verifyRoteiro({ itens: Array.isArray(itens) ? itens : [] }, sources);
      proposals.push(...verified.items);
      return {
        known_total_brl: verified.knownTotal,
        accepted: verified.items.filter((i) => i.verified).length,
        without_confirmed_value: verified.items.filter((i) => i.amount === null).map((i) => ({ label: i.label, note: i.note })),
        note: 'o usuário escolhe o que adicionar ao plano',
      };
    },
  });

  return {
    sources,
    proposals,
    allowedAmounts: () => allowed,
    async run(name, input) {
      const fn = handlers[name];
      if (!fn) return { error: `ferramenta desconhecida: ${name}` };
      try {
        const out = await fn(input ?? {});
        collect(out);
        return out;
      } catch (err) {
        return { error: err?.message || 'falha na ferramenta' };
      }
    },
  };
}
