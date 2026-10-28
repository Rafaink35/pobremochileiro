// Menor preço em cache de cada um dos próximos 12 meses para uma rota (Travelpayouts).
// Mesma regra de chaves do flights.mjs: só variáveis de ambiente do servidor.
const IATA = /^[A-Za-z]{3}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });

function nextMonths(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export default async function handler(request) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return json(503, { error: 'voos não configurados no servidor' });

  const q = new URL(request.url).searchParams;
  const origin = q.get('origin') || '';
  const destination = q.get('destination') || '';
  if (!IATA.test(origin) || !IATA.test(destination)) {
    return json(400, { error: 'use códigos IATA de 3 letras (ex.: GRU, LIS)' });
  }
  const oneWay = q.get('one_way') === 'true';

  const cheapest = async (month) => {
    const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    url.search = new URLSearchParams({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_at: month,
      currency: 'brl',
      sorting: 'price',
      limit: '1',
      unique: 'false',
      ...(oneWay && { one_way: 'true' }),
    });
    try {
      const res = await fetch(url, { headers: { 'x-access-token': token } });
      if (!res.ok) return { month, price: null, failed: true };
      const body = await res.json();
      const row = Array.isArray(body.data) ? body.data[0] : null;
      return { month, price: row ? row.price : null, airline: row?.airline, departureAt: row?.departure_at };
    } catch {
      return { month, price: null, failed: true };
    }
  };

  const months = await Promise.all(nextMonths(12).map(cheapest));
  if (months.every((m) => m.failed)) return json(502, { error: 'serviço de voos indisponível' });
  const prices = months.map((m) => m.price).filter((p) => p != null);
  const best = prices.length ? Math.min(...prices) : null;
  return json(200, {
    currency: 'BRL',
    best,
    months: months.map(({ failed, ...m }) => ({ ...m, isBest: best != null && m.price === best })),
  });
}
