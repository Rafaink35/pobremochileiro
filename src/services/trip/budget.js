// Motor de orçamento: funções puras. Não soma unidades incompatíveis nem trata custo desconhecido como zero.
import { PRICE_STATUS, effectiveStatus } from './price.js';

const round2 = (n) => Math.round(n * 100) / 100;
const positive = (n) => Number.isFinite(n) && n > 0;

export const ESSENTIAL_CATEGORIES = Object.freeze(['transport', 'lodging', 'food']);
export const CATEGORY_LABEL = {
  transport: 'Transporte',
  lodging: 'Hospedagem',
  food: 'Alimentação',
  activities: 'Atividades',
  local_transport: 'Deslocamentos locais',
  other: 'Outros',
};

/**
 * Quantas vezes o preço se aplica, a partir do contexto da viagem.
 * ctx: { people, rooms, nights, days, legs }. Retorna { count } ou { reason } se faltar um número necessário.
 */
export function multiplierFor(unit, ctx) {
  const basisCount = { person: ctx.people, group: 1, room: ctx.rooms }[unit.basis];
  if (!positive(basisCount)) {
    return { reason: unit.basis === 'room' ? 'número de quartos não informado' : 'número de pessoas não informado' };
  }
  const periodCount = { once: 1, round_trip: 1, night: ctx.nights, day: ctx.days, leg: ctx.legs }[unit.period];
  if (!positive(periodCount)) {
    const what = { night: 'noites', day: 'dias', leg: 'trechos' }[unit.period];
    return { reason: `número de ${what} não informado ou zero` };
  }
  return { count: basisCount * periodCount };
}

/**
 * Custo de UMA linha para a viagem. Estados do resultado:
 *  - status 'confirmed' | 'published' | 'estimate' | 'stale' com `amount` em `ctx.currency`;
 *  - status 'unknown' com `amount: null` e o `reason` (preço desconhecido, unidade sem número, moeda sem cotação...).
 */
export function lineTotal(price, ctx, now = new Date(), maxAgeDays) {
  const currency = ctx.currency ?? 'BRL';
  if (!price || price.status === PRICE_STATUS.UNKNOWN || price.amount === null) {
    return { status: 'unknown', amount: null, reason: 'preço desconhecido' };
  }
  const m = multiplierFor(price.unit, ctx);
  if (m.reason) return { status: 'unknown', amount: null, reason: m.reason };

  let status = effectiveStatus(price, now, maxAgeDays);
  let unitAmount = price.amount;
  let converted = false;
  if (price.currency !== currency) {
    const rate = ctx.fx?.[price.currency];
    if (!positive(rate)) return { status: 'unknown', amount: null, reason: `preço em ${price.currency} sem cotação para ${currency}` };
    unitAmount *= rate;
    converted = true;
    if (status !== 'stale') status = PRICE_STATUS.ESTIMATE; // conversão é aproximada
  }
  return { status, amount: round2(unitAmount * m.count), reason: null, converted, multiplier: m.count };
}

/**
 * Orçamento da viagem.
 * input: { budget, currency, people, rooms, nights, days, legs, fx, contingencyPct, lines:[{key,category,label,price,essential?}], requiredCategories }
 */
export function computeBudget(input, now = new Date()) {
  const currency = input.currency ?? 'BRL';
  const ctx = {
    currency, fx: input.fx, people: input.people, rooms: input.rooms, nights: input.nights, days: input.days, legs: input.legs ?? 2,
  };
  const required = input.requiredCategories ?? ESSENTIAL_CATEGORIES;
  const lines = (input.lines ?? []).map((l) => {
    const total = lineTotal(l.price, ctx, now, input.maxAgeDays);
    return { ...l, essential: l.essential ?? required.includes(l.category), total };
  });

  let knownTotal = 0; // confirmado ou publicado e dentro da validade
  let estimatedTotal = 0; // estimativa, preço desatualizado ou convertido
  const pending = [];
  for (const l of lines) {
    if (l.total.status === 'unknown') {
      const reason = l.total.reason === 'preço desconhecido' && l.reasonIfUnknown ? l.reasonIfUnknown : l.total.reason;
      pending.push({ key: l.key, category: l.category, label: l.label, reason, essential: l.essential });
    } else if (l.total.status === PRICE_STATUS.CONFIRMED || l.total.status === PRICE_STATUS.PUBLISHED) {
      knownTotal += l.total.amount;
    } else {
      estimatedTotal += l.total.amount;
    }
  }
  // Categoria essencial sem nenhuma linha também é custo pendente.
  for (const cat of required) {
    if (!lines.some((l) => l.category === cat)) {
      pending.push({ key: `missing-${cat}`, category: cat, label: CATEGORY_LABEL[cat], reason: 'nenhum custo registrado', essential: true });
    }
  }
  knownTotal = round2(knownTotal);
  estimatedTotal = round2(estimatedTotal);

  const pct = input.contingencyPct ?? 10;
  const base = knownTotal + estimatedTotal;
  const contingency = { pct, amount: base > 0 ? round2((base * pct) / 100) : null, appliedTo: 'total conhecido + estimado' };
  const minimumTotal = round2(base + (contingency.amount ?? 0)); // piso: pendentes só podem aumentar
  const essentialPending = pending.filter((p) => p.essential).length;
  const anyValue = lines.some((l) => l.total.status !== 'unknown');

  const hasBudget = positive(input.budget);
  let fit = 'no_budget';
  if (hasBudget) {
    if (!anyValue) fit = 'unknown';
    else if (minimumTotal > input.budget) fit = 'over';
    else fit = pending.length === 0 ? 'within' : 'within_partial';
  }

  let finalCostClaim = 'incomplete';
  if (pending.length === 0) finalCostClaim = estimatedTotal > 0 ? 'estimated' : 'confirmed';

  return {
    currency,
    budget: hasBudget ? input.budget : null,
    lines,
    knownTotal,
    estimatedTotal,
    contingency,
    minimumTotal,
    pending,
    essentialPending,
    complete: pending.length === 0,
    finalCostClaim, // 'confirmed' | 'estimated' | 'incomplete': só "confirmed" pode ser apresentado como custo final
    balance: hasBudget
      ? { amount: round2(input.budget - minimumTotal), kind: pending.length === 0 ? (estimatedTotal > 0 ? 'estimated' : 'exact') : 'upper_bound' }
      : null, // 'upper_bound': com custos pendentes, o saldo real pode ser menor
    fit,
  };
}
