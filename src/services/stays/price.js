// Preço de hospedagem: leitura de texto de fonte aberta e classificação. Regras:
//  - Só vale preço com valor, moeda e DATA DE OBSERVAÇÃO da própria fonte. Sem isso, o preço é "indisponível".
//  - Nunca estimativa: o Stay Finder não mostra valor que nenhuma fonte informou.
//  - Confirmado vale 30 dias; publicado (não confirmado) vale 180 dias; depois disso é "desatualizado".
//  - Unidade (por pessoa/quarto e por noite) só vale se estiver escrita no texto da fonte; nunca é presumida.
export const VALIDITY_DAYS = Object.freeze({ confirmed: 30, published: 180 });
export const PRICE_CLASS = Object.freeze({ CONFIRMED: 'confirmed', PUBLISHED: 'published', STALE: 'stale', UNAVAILABLE: 'unavailable' });
export const PRICE_CLASS_LABEL = Object.freeze({
  confirmed: 'Confirmado', published: 'Publicado, não confirmado', stale: 'Desatualizado', unavailable: 'Preço indisponível',
});
const DAY_MS = 86_400_000;

export const CURRENCY_CODES = new Set(['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'ARS', 'CLP', 'UYU', 'PYG', 'BOB', 'COP', 'PEN', 'MXN', 'CAD', 'AUD', 'NZD', 'CHF', 'THB', 'VND', 'IDR', 'INR', 'KRW', 'TRY', 'ZAR', 'MAD', 'EGP', 'AED', 'CZK', 'PLN', 'HUF', 'SEK', 'NOK', 'DKK', 'RON', 'ISK', 'PHP', 'MYR', 'SGD', 'HKD', 'TWD']);
// Símbolos sem ambiguidade. "$" e "¥" sozinhos são ambíguos (vários países): não viram moeda.
const SYMBOLS = [['R$', 'BRL'], ['US$', 'USD'], ['A$', 'AUD'], ['C$', 'CAD'], ['NZ$', 'NZD'], ['€', 'EUR'], ['£', 'GBP'], ['₩', 'KRW'], ['₹', 'INR'], ['฿', 'THB'], ['₫', 'VND'], ['zł', 'PLN'], ['Kč', 'CZK']];

function parseAmount(raw) {
  const t = String(raw).trim().replace(/[.,]+$/, '');
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  let normalized;
  if (dots && commas) {
    // Os dois separadores: o último é o decimal; o outro é de milhar.
    const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    normalized = t.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (dots > 1 || commas > 1) normalized = t.replace(/[.,]/g, ''); // vários iguais: milhar
  else if (dots + commas === 1) {
    const [intPart, frac] = t.split(/[.,]/);
    normalized = frac.length === 3 && intPart.length <= 3 ? `${intPart}${frac}` : `${intPart}.${frac}`; // "1.500" = 1500; "25,50" = 25.5
  } else normalized = t;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const NIGHT = /(?:^|[^\p{L}])(night|noche|noite|nuit|nacht|notte|晩|泊)(?![\p{L}])/iu;
const PERSON = /(?:^|[^\p{L}])(person|persona|pessoa|personne|pp|pax|pers|人)(?![\p{L}])/iu;
const ROOM = /(?:^|[^\p{L}])(room|quarto|habitaci[oó]n|chambre|zimmer|camera|部屋)(?![\p{L}])/iu;

/**
 * Lê "30 BRL", "€20 per night", "R$ 25,50/pessoa/noite". Devolve { amount, currency, unit|null, text } ou null.
 * Mais de um número (faixa, "20-30", "dorm 15 / privado 40") é ambíguo: null. Moeda ausente ou ambígua: null.
 */
export function parseStayCharge(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t || t.length > 120) return null;
  const numbers = t.match(/\d[\d.,]*/g) ?? [];
  if (numbers.length !== 1) return null;
  let currency = null;
  for (const [sym, code] of SYMBOLS) if (t.includes(sym)) { currency = code; break; }
  if (!currency) {
    const code = (/(?:^|[^A-Za-z])([A-Za-z]{3})(?![A-Za-z])/.exec(t.replace(/\d[\d.,]*/g, ' '))?.[1] ?? '').toUpperCase();
    if (CURRENCY_CODES.has(code)) currency = code;
  }
  if (!currency) return null;
  const amount = parseAmount(numbers[0]);
  if (amount === null) return null;
  const rest = t.replace(numbers[0], ' ');
  const person = PERSON.test(rest);
  const room = ROOM.test(rest);
  const night = NIGHT.test(rest);
  // Qualquer palavra que sobre além de valor, moeda e unidade ("From R$115", "about 20 EUR", "R$300 including breakfast",
  // "check out high/low season prices") muda o sentido do número (mínimo, aproximado, condicionado): texto ambíguo não vira preço.
  let leftover = rest;
  for (const [sym] of SYMBOLS) leftover = leftover.split(sym).join(' ');
  leftover = leftover.replace(new RegExp(`(?:^|[^A-Za-z])${currency}(?![A-Za-z])`, 'i'), ' ');
  for (const re of [PERSON, ROOM, NIGHT]) leftover = leftover.replace(new RegExp(re.source, 'giu'), ' ');
  leftover = leftover.replace(/(?:^|[^\p{L}])(per|por|pro|pour|par|a|de|la|le|el|la)(?![\p{L}])/giu, ' ');
  if (/[\p{L}\p{N}]/u.test(leftover)) return null;
  const basis = person && !room ? 'person' : room && !person ? 'room' : null;
  return { amount, currency, unit: basis && night ? { basis, period: 'night' } : null, text: t };
}

const isoOrNull = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * Classifica UM preço observado. `price`: { status: 'confirmed'|'published', amount, currency, unit, observedAt, validUntil }.
 * Estimativa não é aceita. Não existe preço "gratuito" ou zero: valor precisa ser maior que zero (a tag `fee` do OSM nunca entra aqui).
 * Devolve { class, label, amount, currency, unit, observedAt, expiresAt, ageDays, comparable }.
 */
export function classifyStayPrice(price, now = new Date()) {
  const unavailable = { class: PRICE_CLASS.UNAVAILABLE, label: PRICE_CLASS_LABEL.unavailable, amount: null, currency: null, unit: null, observedAt: null, expiresAt: null, ageDays: null, comparable: false };
  if (!price || !['confirmed', 'published'].includes(price.status)) return unavailable;
  const observedAt = isoOrNull(price.observedAt);
  if (!observedAt) return unavailable; // sem data da fonte não dá para saber a idade do preço
  const nowMs = now.getTime();
  if (Date.parse(observedAt) > nowMs + DAY_MS) return unavailable; // data no futuro: dado inválido
  const amount = Number(price.amount);
  if (!(Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(String(price.currency ?? '')))) return unavailable;
  const maxDays = VALIDITY_DAYS[price.status];
  let expiresMs = Date.parse(observedAt) + maxDays * DAY_MS;
  const validUntil = isoOrNull(price.validUntil);
  if (validUntil) expiresMs = Math.min(expiresMs, Date.parse(validUntil));
  const stale = nowMs > expiresMs;
  const cls = stale ? PRICE_CLASS.STALE : price.status === 'confirmed' ? PRICE_CLASS.CONFIRMED : PRICE_CLASS.PUBLISHED;
  const unit = price.unit && ['person', 'room'].includes(price.unit.basis) && price.unit.period === 'night' ? { basis: price.unit.basis, period: 'night' } : null;
  return {
    class: cls, label: PRICE_CLASS_LABEL[cls], amount, currency: price.currency, unit,
    observedAt, expiresAt: new Date(expiresMs).toISOString(), ageDays: Math.floor((nowMs - Date.parse(observedAt)) / DAY_MS),
    originalStatus: price.status, comparable: Boolean(unit),
  };
}

const CLASS_ORDER = { confirmed: 0, published: 1, stale: 2, unavailable: 3 };

/** Entre os preços de um local (de fontes diferentes), o melhor para exibir: confirmado atual > publicado atual > desatualizado mais recente. */
export function bestPrice(prices, now = new Date()) {
  const scored = (prices ?? []).map((p) => ({ ...classifyStayPrice(p, now), source: p.source ?? null, text: p.text ?? null })).filter((p) => p.class !== PRICE_CLASS.UNAVAILABLE);
  scored.sort((a, b) => CLASS_ORDER[a.class] - CLASS_ORDER[b.class] || Date.parse(b.observedAt) - Date.parse(a.observedAt));
  return scored[0] ?? { ...classifyStayPrice(null, now), source: null, text: null };
}
