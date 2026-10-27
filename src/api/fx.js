// Câmbio de referência via AwesomeAPI (pública, sem chave). Valores em BRL por 1 unidade da moeda.
const PAIRS = ['USD', 'EUR', 'GBP', 'ARS', 'CLP'];
const CACHE_KEY = 'pobre-mochileiro:fx';
const MAX_AGE_MS = 60 * 60 * 1000;

function readCache() {
  try {
    const c = JSON.parse(window.localStorage.getItem(CACHE_KEY));
    return c && Date.now() - c.savedAt < MAX_AGE_MS ? c : null;
  } catch {
    return null;
  }
}

export async function fetchRates() {
  const cached = readCache();
  if (cached) return cached;
  const res = await fetch(
    `https://economia.awesomeapi.com.br/json/last/${PAIRS.map((c) => `${c}-BRL`).join(',')}`,
  );
  if (!res.ok) throw new Error(`câmbio ${res.status}`);
  const json = await res.json();
  const rates = {};
  let updatedAt = null;
  for (const code of PAIRS) {
    const row = json[`${code}BRL`];
    const bid = row && Number(row.bid);
    if (bid > 0) {
      rates[code] = bid;
      updatedAt = row.create_date || updatedAt;
    }
  }
  const data = { rates, updatedAt, savedAt: Date.now() };
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // sem cache: tudo bem
  }
  return data;
}

// "1.500,50" | "1500" | "1500.5" -> number (NaN se vazio/inválido)
export function parseBRL(text) {
  let s = String(text).replace(/[^\d.,]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
