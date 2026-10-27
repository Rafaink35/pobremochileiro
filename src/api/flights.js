// Passagens via função de servidor /api/flights (a chave do Travelpayouts fica lá).
export async function fetchFlights({ origin, destination, month }) {
  const params = new URLSearchParams({ origin, destination });
  if (month) params.set('departure_at', month);
  const res = await fetch(`/api/flights?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `voos ${res.status}`);
  return data;
}
