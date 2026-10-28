// Passagens via função de servidor /api/flights (a chave do Travelpayouts fica lá).
export async function fetchFlights({ origin, destination, date, month, returnDate, oneWay, adults }) {
  const params = new URLSearchParams({ origin, destination, adults: String(adults || 1) });
  if (date || month) params.set('departure_at', date || month);
  if (returnDate && !oneWay) params.set('return_at', returnDate);
  if (oneWay) params.set('one_way', 'true');
  const res = await fetch(`/api/flights?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `voos ${res.status}`);
  return data;
}

// Menor preço de cada mês dos próximos 12 para a rota.
export async function fetchCalendar({ origin, destination, oneWay }) {
  const params = new URLSearchParams({ origin, destination });
  if (oneWay) params.set('one_way', 'true');
  const res = await fetch(`/api/calendar?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `calendário ${res.status}`);
  return data;
}

// Datas flexíveis: menor preço por dia de ida dentro de um período.
export async function fetchFlex({ origin, destination, from, to, minStay, maxStay, oneWay, adults }) {
  const params = new URLSearchParams({ origin, destination, from, to, adults: String(adults || 1) });
  if (oneWay) params.set('one_way', 'true');
  else {
    if (minStay) params.set('min_stay', String(minStay));
    if (maxStay) params.set('max_stay', String(maxStay));
  }
  const res = await fetch(`/api/flex?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `datas flexíveis ${res.status}`);
  return data;
}
