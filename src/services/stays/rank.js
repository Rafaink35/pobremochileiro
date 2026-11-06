// Ranking das melhores opções. Só concorre quem tem preço verificável (confirmado ou publicado, dentro do prazo),
// com valor comparável: mesma moeda, mesma unidade (por pessoa ou por quarto, por noite). Nunca há "mais barato" sem preço.
// 1 opção verificável: mostra 1; 2: mostra 2; 3 ou mais: as 3 melhores.
import { bestPrice, PRICE_CLASS } from './price.js';

const keyOf = (p) => `${p.currency}|${p.unit.basis}|${p.unit.period}`;
const completeness = (i) => ['website', 'phone', 'city', 'openingHours'].filter((f) => i[f]).length + (i.lat != null ? 1 : 0);
const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR');

export function rankStays(items, now = new Date(), { limit = 3 } = {}) {
  const all = items.map((i) => ({ ...i, pricing: bestPrice(i.prices, now) }));
  const fresh = all.filter((i) => i.pricing.class === PRICE_CLASS.CONFIRMED || i.pricing.class === PRICE_CLASS.PUBLISHED);
  const stalePrice = all.filter((i) => i.pricing.class === PRICE_CLASS.STALE).sort(byName);
  const noPrice = all.filter((i) => i.pricing.class === PRICE_CLASS.UNAVAILABLE).sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || byName(a, b));

  const rankable = fresh.filter((i) => i.pricing.comparable);
  const groups = new Map();
  for (const i of rankable) groups.set(keyOf(i.pricing), [...(groups.get(keyOf(i.pricing)) ?? []), i]);
  // Compara só dentro de um grupo (mesma moeda e unidade): o maior; empate: ordem alfabética da chave.
  const [rankKey, pool] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0] ?? [null, []];
  const sorted = [...pool].sort((a, b) => a.pricing.amount - b.pricing.amount
    || (a.pricing.class === 'confirmed' ? 0 : 1) - (b.pricing.class === 'confirmed' ? 0 : 1)
    || Date.parse(b.pricing.observedAt) - Date.parse(a.pricing.observedAt)
    || completeness(b) - completeness(a) || byName(a, b));
  const ranked = sorted.slice(0, limit).map((i, idx) => ({ ...i, rank: idx + 1 }));
  const rankedIds = new Set(ranked.map((i) => i.id));
  const withPrice = [...sorted.slice(limit), ...fresh.filter((i) => !i.pricing.comparable || !pool.includes(i))]
    .filter((i, idx, arr) => !rankedIds.has(i.id) && arr.findIndex((x) => x.id === i.id) === idx)
    .sort((a, b) => (a.pricing.comparable === b.pricing.comparable ? 0 : a.pricing.comparable ? -1 : 1) || (a.pricing.amount ?? 0) - (b.pricing.amount ?? 0) || byName(a, b));

  const notCompared = withPrice.filter((i) => !i.pricing.comparable || (rankKey && keyOf(i.pricing) !== rankKey)).length;
  const notes = [];
  if (!fresh.length) notes.push('Nenhuma opção com preço verificável: não há ranking de preço.');
  else if (!ranked.length) notes.push('Há preços verificáveis, mas nenhum comparável (falta moeda ou unidade por noite na fonte): não há ranking.');
  else if (ranked.length < limit) notes.push(ranked.length === 1 ? 'Só 1 opção com preço verificável comparável: mostrando a única.' : `Só ${ranked.length} opções com preço verificável comparável: mostrando as ${ranked.length} únicas.`);
  if (notCompared > 0 && ranked.length) notes.push(`${notCompared} opção(ões) com preço não entraram no ranking (unidade ou moeda diferente, ou sem unidade informada).`);
  return { ranked, withPrice, stalePrice, noPrice, rankKey, notes };
}
