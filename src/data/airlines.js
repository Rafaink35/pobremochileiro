// Códigos IATA de companhias aéreas mais comuns nas rotas do app. Código desconhecido continua aparecendo como está.
const AIRLINES = {
  TP: 'TAP Air Portugal', LA: 'LATAM', G3: 'GOL', AD: 'Azul', JJ: 'LATAM', AF: 'Air France', KL: 'KLM', IB: 'Iberia',
  UX: 'Air Europa', AA: 'American Airlines', UA: 'United', DL: 'Delta', CM: 'Copa Airlines', AV: 'Avianca', AR: 'Aerolíneas Argentinas',
  H2: 'Sky Airline', JA: 'JetSMART', EK: 'Emirates', QR: 'Qatar Airways', TK: 'Turkish Airlines', LH: 'Lufthansa',
  BA: 'British Airways', AZ: 'ITA Airways', SQ: 'Singapore Airlines', KE: 'Korean Air', AM: 'Aeroméxico', LX: 'Swiss',
  OS: 'Austrian', SN: 'Brussels Airlines', AC: 'Air Canada', ET: 'Ethiopian Airlines', MH: 'Malaysia Airlines', TG: 'Thai Airways',
};

/** "TP" → "TAP Air Portugal (TP)"; desconhecido → o próprio código; vazio → "". */
export function airlineName(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return '';
  return AIRLINES[c] ? `${AIRLINES[c]} (${c})` : c;
}
