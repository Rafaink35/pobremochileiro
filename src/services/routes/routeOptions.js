// Monta a lista "maneiras de ir de A para B" só com o que tem fonte. Preço sem fonte fica null (nunca zero)
// e vai para o fim da lista, sem "melhor". Nada aqui chama a rede: recebe os voos já buscados.
export const OPTION_KIND = Object.freeze({ FLIGHT: 'flight', GROUND: 'ground' });

const price = (f) => (Number.isFinite(f?.total) && f.total > 0 ? f.total : null);

export function buildRouteOptions({ origin, destination, flights = [], maxFlights = 4 }) {
  const sameCountry = origin.country === destination.country;
  const flightOptions = flights
    .filter((f) => price(f) !== null && f.link)
    .sort((a, b) => a.total - b.total)
    .slice(0, maxFlights)
    .map((f) => ({
      id: `flight:${f.link}`,
      kind: OPTION_KIND.FLIGHT,
      title: `Voo ${origin.iata} → ${destination.iata}`,
      airline: f.airline ?? null,
      modes: ['plane'],
      price: f.total,
      perPerson: f.passengers > 1 ? f.price : null,
      durationText: null, // a fonte de voos não informa a duração
      detail: [f.airline, f.transfers === 0 ? 'direto' : `${f.transfers} escala(s)`].filter(Boolean).join(' · '),
      date: f.departureAt ?? null,
      url: f.link,
      source: 'Aviasales (Travelpayouts) · preço de cache, até 48 h',
    }));
  if (flightOptions.length) flightOptions[0].best = true;

  const ground = {
    id: 'ground',
    kind: OPTION_KIND.GROUND,
    title: sameCountry ? 'Ônibus entre as cidades' : 'Trem e ônibus (trechos terrestres)',
    modes: ['bus'],
    price: null,
    durationText: null,
    detail: 'Sem fonte de preço e horário ainda: confira nos sites abaixo.',
    sameCountry,
  };
  return [...flightOptions, ground];
}
