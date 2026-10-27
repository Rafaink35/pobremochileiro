// Passagens mais baratas via Travelpayouts (Aviasales Data API). Roda só no servidor:
// TRAVELPAYOUTS_TOKEN e TRAVELPAYOUTS_MARKER vêm de variáveis de ambiente (nunca VITE_).
// TRAVELPAYOUTS_TRS (opcional) = ID do projeto, para converter links via Partner Links API.
const AVIASALES = 'https://www.aviasales.com';
const IATA = /^[A-Za-z]{3}$/;
const MONTH = /^\d{4}-\d{2}(-\d{2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// O link do Aviasales termina com o nº de passageiros (ex.: /search/GRU2711LIS1): ajusta
// para a quantidade pedida e pede os preços em reais.
function withPassengers(path, adults) {
  const fixed = path.replace(/^(\/search\/[A-Z]{3}\d{4}[A-Z]{3}(?:\d{4})?)\d+/, `$1${adults}`);
  const url = new URL(`${AVIASALES}${fixed}`);
  url.searchParams.set('currency', 'brl');
  return url.toString();
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' },
  });

// Tenta a Partner Links API; se falhar, cai para o parâmetro ?marker= no link do Aviasales.
async function affiliateLinks(urls, { token, marker, trs }) {
  const fallback = urls.map((u) => `${u}${u.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}`);
  if (!trs) return fallback;
  try {
    const res = await fetch('https://api.travelpayouts.com/links/v1/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-token': token },
      body: JSON.stringify({
        trs: Number(trs),
        marker: Number(marker),
        shorten: true,
        links: urls.map((url) => ({ url })),
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const rows = data?.result?.links;
    return urls.map((_, i) => rows?.[i]?.partner_url || fallback[i]);
  } catch {
    return fallback;
  }
}

export default async function handler(request) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  if (!token || !marker) return json(503, { error: 'voos não configurados no servidor' });

  const q = new URL(request.url).searchParams;
  const origin = q.get('origin') || '';
  const destination = q.get('destination') || '';
  const when = q.get('departure_at') || '';
  const back = q.get('return_at') || '';
  const adults = Math.min(9, Math.max(1, parseInt(q.get('adults'), 10) || 1));
  if (!IATA.test(origin) || !IATA.test(destination)) {
    return json(400, { error: 'use códigos IATA de 3 letras (ex.: GRU, LIS)' });
  }
  if (when && !MONTH.test(when)) return json(400, { error: 'data inválida (AAAA-MM ou AAAA-MM-DD)' });
  if (back && !DAY.test(back)) return json(400, { error: 'data de volta inválida (AAAA-MM-DD)' });

  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  url.search = new URLSearchParams({
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    currency: 'brl',
    sorting: 'price',
    limit: '5',
    unique: 'false',
    ...(when && { departure_at: when }),
    ...(back && { return_at: back }),
    ...(q.get('one_way') === 'true' && { one_way: 'true' }),
  });

  let upstream;
  try {
    upstream = await fetch(url, { headers: { 'x-access-token': token } });
  } catch {
    return json(502, { error: 'serviço de voos indisponível' });
  }
  if (!upstream.ok) return json(502, { error: `serviço de voos respondeu ${upstream.status}` });
  const body = await upstream.json();
  const rows = Array.isArray(body.data) ? body.data : [];

  const links = await affiliateLinks(
    rows.map((r) => withPassengers(r.link, adults)),
    { token, marker, trs: process.env.TRAVELPAYOUTS_TRS },
  );
  const flights = rows.map((r, i) => ({
    price: r.price,
    total: r.price * adults,
    passengers: adults,
    airline: r.airline,
    departureAt: r.departure_at,
    returnAt: r.return_at,
    transfers: r.transfers,
    link: links[i],
  }));
  return json(200, { currency: 'BRL', note: 'Preços de cache (até 48h); confirme no site.', flights });
}
