// Cidades com aeroporto principal (código IATA) para a busca "De A para B".
// `osm` = nome da cidade como aparece no OpenStreetMap, usado para achar hotéis e hostels.
export const CITIES = [
  ['São Paulo', 'GRU', 'BR'], ['Rio de Janeiro', 'GIG', 'BR'], ['Brasília', 'BSB', 'BR'], ['Salvador', 'SSA', 'BR'],
  ['Recife', 'REC', 'BR'], ['Fortaleza', 'FOR', 'BR'], ['Belo Horizonte', 'CNF', 'BR'], ['Porto Alegre', 'POA', 'BR'],
  ['Curitiba', 'CWB', 'BR'], ['Florianópolis', 'FLN', 'BR'], ['Manaus', 'MAO', 'BR'], ['Belém', 'BEL', 'BR'],
  ['Natal', 'NAT', 'BR'], ['Foz do Iguaçu', 'IGU', 'BR'], ['Maceió', 'MCZ', 'BR'], ['Goiânia', 'GYN', 'BR'],
  ['Buenos Aires', 'EZE', 'AR'], ['Santiago', 'SCL', 'CL'], ['Montevidéu', 'MVD', 'UY'], ['Lima', 'LIM', 'PE'],
  ['Cusco', 'CUZ', 'PE'], ['La Paz', 'LPB', 'BO'], ['Bogotá', 'BOG', 'CO'], ['Cartagena', 'CTG', 'CO'],
  ['Quito', 'UIO', 'EC'], ['Assunção', 'ASU', 'PY'], ['Cancún', 'CUN', 'MX'], ['Cidade do México', 'MEX', 'MX'],
  ['Lisboa', 'LIS', 'PT'], ['Porto', 'OPO', 'PT'], ['Madri', 'MAD', 'ES', 'Madrid'], ['Barcelona', 'BCN', 'ES'],
  ['Paris', 'CDG', 'FR'], ['Londres', 'LHR', 'GB', 'London'], ['Roma', 'FCO', 'IT', 'Roma'], ['Amsterdã', 'AMS', 'NL', 'Amsterdam'],
  ['Berlim', 'BER', 'DE', 'Berlin'], ['Istambul', 'IST', 'TR', 'İstanbul'], ['Marrakech', 'RAK', 'MA'], ['Cidade do Cabo', 'CPT', 'ZA', 'Cape Town'],
  ['Nova York', 'JFK', 'US', 'New York'], ['Miami', 'MIA', 'US'], ['Bangkok', 'BKK', 'TH', 'กรุงเทพมหานคร'], ['Kuala Lumpur', 'KUL', 'MY'],
  ['Singapura', 'SIN', 'SG', 'Singapore'], ['Tóquio', 'NRT', 'JP', '東京都'],
].map(([city, iata, country, osm]) => ({ city, iata, country, osm: osm ?? city, label: `${city} (${iata})` }));

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Aceita "Lisboa", "Lisboa (LIS)" ou "lis". Devolve a cidade do catálogo ou null. */
export function findCity(text) {
  const t = norm(text);
  if (!t) return null;
  return CITIES.find((c) => norm(c.label) === t || norm(c.city) === t || norm(c.iata) === t) ?? null;
}
