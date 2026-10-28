// Datas flexíveis: menor preço (cache Travelpayouts) por dia de ida dentro de um intervalo.
// Busca 1 consulta por mês coberto (até 1000 preços cada) e agrupa por dia, em vez de uma consulta por dia.
import { affiliateLinks, withPassengers } from './flights.mjs';

const IATA = /^[A-Za-z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' },
  });

const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / 86400000);

function monthsBetween(from, to) {
  const out = [];
  const end = to.slice(0, 7);
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export default async function handler(request) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  if (!token || !marker) return json(503, { error: 'voos não configurados no servidor' });

  const q = new URL(request.url).searchParams;
  const origin = q.get('origin') || '';
  const destination = q.get('destination') || '';
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const adults = Math.min(9, Math.max(1, parseInt(q.get('adults'), 10) || 1));
  const oneWay = q.get('one_way') === 'true';
  const minStay = parseInt(q.get('min_stay'), 10) || 0;
  const maxStay = parseInt(q.get('max_stay'), 10) || 365;

  if (!IATA.test(origin) || !IATA.test(destination)) {
    return json(400, { error: 'use códigos IATA de 3 letras (ex.: GRU, BOG)' });
  }
  if (!DAY.test(from) || !DAY.test(to) || to < from) {
    return json(400, { error: 'informe o período de ida (de/até) em AAAA-MM-DD' });
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return json(400, { error: `o período pode ter no máximo ${MAX_RANGE_DAYS} dias` });
  }

  const fetchMonth = async (month) => {
    const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    url.search = new URLSearchParams({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_at: month,
      currency: 'brl',
      sorting: 'price',
      limit: '1000',
      unique: 'false',
      ...(oneWay && { one_way: 'true' }),
    });
    const res = await fetch(url, { headers: { 'x-access-token': token } });
    if (!res.ok) throw new Error(`serviço de voos respondeu ${res.status}`);
    const body = await res.json();
    return Array.isArray(body.data) ? body.data : [];
  };

  let rows;
  try {
    rows = (await Promise.all(monthsBetween(from, to).map(fetchMonth))).flat();
  } catch (err) {
    return json(502, { error: err.message || 'serviço de voos indisponível' });
  }

  // Menor preço por dia de ida, respeitando o período e o tempo de estadia.
  const bestByDay = new Map();
  for (const r of rows) {
    const day = String(r.departure_at || '').slice(0, 10);
    if (!DAY.test(day) || day < from || day > to) continue;
    if (!oneWay) {
      const back = String(r.return_at || '').slice(0, 10);
      if (!DAY.test(back)) continue;
      const stay = daysBetween(day, back);
      if (stay < minStay || stay > maxStay) continue;
    }
    const cur = bestByDay.get(day);
    if (!cur || r.price < cur.price) bestByDay.set(day, r);
  }

  const picked = [...bestByDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const links = await affiliateLinks(
    picked.map(([, r]) => withPassengers(r.link, adults)),
    { token, marker, trs: process.env.TRAVELPAYOUTS_TRS },
  );
  const days = picked.map(([day, r], i) => ({
    day,
    returnDay: oneWay ? null : String(r.return_at).slice(0, 10),
    stayDays: oneWay ? null : daysBetween(day, String(r.return_at).slice(0, 10)),
    price: r.price,
    total: r.price * adults,
    passengers: adults,
    airline: r.airline,
    transfers: r.transfers,
    link: links[i],
  }));
  const best = days.length ? Math.min(...days.map((d) => d.price)) : null;
  return json(200, {
    currency: 'BRL',
    best,
    days: days.map((d) => ({ ...d, isBest: d.price === best })),
    note: 'Preços de cache (até 48h); dias sem preço guardado não aparecem.',
  });
}
