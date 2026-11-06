// Adapta um item do Stay Finder ao formato que a tela de Hospedagem, o detalhe e o planejador já usam (sem recriar componentes).
import { legacyKindOf } from './categories.js';
import { PRICE_CLASS } from './price.js';

const fmtMoney = (amount, currency) => {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount); } catch { return `${amount} ${currency}`; }
};
const UNIT_TEXT = { person: 'por pessoa', room: 'por quarto' };

/** Texto do preço classificado: "R$ 25,00 por pessoa por noite · Publicado, não confirmado, observado em 2026-05-01 (OpenStreetMap)". */
export function describePricing(p) {
  if (!p || p.class === PRICE_CLASS.UNAVAILABLE) return null;
  const value = p.free ? 'Gratuito (segundo a fonte)' : `${fmtMoney(p.amount, p.currency)}${p.unit ? ` ${UNIT_TEXT[p.unit.basis]} por noite` : ' (unidade não informada pela fonte)'}`;
  return `${value} · ${p.label}, observado em ${String(p.observedAt).slice(0, 10)}${p.source?.name ? ` (${p.source.name})` : ''}`;
}

export function toLegacyRecord(item, section = null) {
  const p = item.pricing;
  const usable = p && (p.class === PRICE_CLASS.CONFIRMED || p.class === PRICE_CLASS.PUBLISHED);
  const hasPrice = p && p.class !== PRICE_CLASS.UNAVAILABLE;
  const described = describePricing(p);
  return {
    ...item,
    kind: legacyKindOf(item.category, item.osmKind),
    state: item.region ?? null,
    amenities: item.amenities ?? {},
    fee: usable && p.free ? 'free' : hasPrice && !p.free ? 'paid' : item.fee === 'paid' ? 'paid' : 'unknown',
    price: usable && !p.free ? { amount: p.amount, currency: p.currency } : null,
    chargeText: described ?? item.priceText ?? null,
    source: item.sources?.[0] ?? null,
    section,
  };
}

/** Itens agrupados da resposta da API → lista plana de registros legados, com a seção de cada um. */
export function flattenGroups(groups) {
  return [
    ...groups.ranked.map((i) => toLegacyRecord(i, 'ranked')),
    ...groups.withPrice.map((i) => toLegacyRecord(i, 'withPrice')),
    ...groups.stalePrice.map((i) => toLegacyRecord(i, 'stalePrice')),
    ...groups.noPrice.map((i) => toLegacyRecord(i, 'noPrice')),
  ];
}
