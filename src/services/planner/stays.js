// Hospedagens guardadas no rascunho da viagem (campings e work exchange), com custo e transporte
// separados em "conhecido" e "não informado/não calculado". O rascunho é local ao navegador do próprio
// usuário (um dispositivo, sem sincronização) — não é persistência multiusuário.
import { parseBRL } from '../../api/fx.js';
import { computeBudget } from '../trip/budget.js';
import { createPrice, unknownPrice } from '../trip/price.js';

export const COST_STATUS = Object.freeze({
  FREE: 'free', // gratuito segundo a fonte
  EXCHANGE: 'exchange', // hospedagem em troca de trabalho
  PAID_REFERENCE: 'paid_reference', // há valor de referência, mas unidade/noites não estão definidas
  PAID_UNKNOWN: 'paid_unknown', // pago, valor desconhecido
  UNKNOWN: 'unknown',
});

export const TRANSPORT_STATUS = Object.freeze({
  NOT_CALCULATED: 'not_calculated',
  CONFIRMED: 'confirmed', // confirmado pelo próprio usuário
});

function campingCost(c) {
  if (c.fee === 'free') return { status: COST_STATUS.FREE, price: null };
  if (c.fee === 'paid') {
    return c.price
      ? { status: COST_STATUS.PAID_REFERENCE, price: c.price, text: c.chargeText }
      : { status: COST_STATUS.PAID_UNKNOWN, price: null, text: c.chargeText };
  }
  return { status: COST_STATUS.UNKNOWN, price: null };
}

/** Monta a entrada do planejador a partir de um camping ou de uma oportunidade de work exchange. */
export function buildStayEntry(place, kind, now = new Date()) {
  const isWork = kind === 'work_exchange';
  const base = {
    id: `${kind}:${place.id}`,
    kind,
    name: (isWork ? place.hostName : place.name) ?? 'Local sem nome',
    lat: place.lat,
    lon: place.lon,
    city: place.city ?? null,
    state: place.state ?? null,
    addedAt: now.toISOString(),
    dates: { from: isWork ? place.startDate ?? '' : '', to: isWork ? place.endDate ?? '' : '' },
    contact: isWork
      ? { website: place.externalUrl, phone: null, email: null }
      : { website: place.website, phone: place.phone, email: place.email },
    transport: { status: TRANSPORT_STATUS.NOT_CALCULATED },
    note: '',
  };
  if (isWork) {
    return {
      ...base,
      cost: { status: COST_STATUS.EXCHANGE, price: null, text: place.expenses },
      source: { name: place.source.name, license: place.source.license, verifiedAt: place.approvedAt ?? place.updatedAt },
    };
  }
  const s = place.source;
  return {
    ...base,
    cost: campingCost(place),
    source: { name: `${s.name} (${s.license})`, license: s.license, attribution: s.attribution, url: s.sourceUrl, verifiedAt: s.collectedAt },
  };
}

export function addStay(draft, entry) {
  const stays = draft.stays ?? [];
  if (stays.some((s) => s.id === entry.id)) return { draft, added: false };
  return { draft: { ...draft, stays: [...stays, entry] }, added: true };
}

export const removeStay = (draft, id) => ({ ...draft, stays: (draft.stays ?? []).filter((s) => s.id !== id) });
export const updateStay = (draft, id, patch) => ({
  ...draft,
  stays: (draft.stays ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
});

/** Situação do valor de um item do plano. Sem `status` (ou "manual") = valor digitado por você. */
export const ITEM_STATUS = Object.freeze({ MANUAL: 'manual', CONFIRMED: 'confirmed', PUBLISHED: 'published', ESTIMATE: 'estimate', STALE: 'stale', UNKNOWN: 'unknown' });

const PLAN_UNIT = { basis: 'group', period: 'once' };
const CATEGORY_KEY = { Transporte: 'transport', Hospedagem: 'lodging', Comida: 'food', Passeios: 'activities', Extras: 'other' };

// Valor do item como preço do motor de orçamento: estimativa e desatualizado contam como ESTIMADO; o resto como conhecido.
function itemPrice(item, amount, nowIso) {
  const estimated = item.status === ITEM_STATUS.ESTIMATE || item.status === ITEM_STATUS.STALE;
  if (estimated) return createPrice({ status: 'estimate', amount, currency: 'BRL', unit: PLAN_UNIT, note: 'Estimativa vinda da descoberta (não é preço confirmado).' });
  return createPrice({
    status: 'confirmed', amount, currency: 'BRL', unit: PLAN_UNIT, collectedAt: nowIso,
    origin: { sourceId: 'plano', name: item.status === ITEM_STATUS.PUBLISHED || item.status === ITEM_STATUS.CONFIRMED ? 'Descoberta' : 'Informado por você' },
  });
}

/**
 * Resumo do plano, calculado pelo MESMO motor de orçamento da tela Descubra (`computeBudget`): confirmado/informado,
 * estimado, reserva de imprevistos, mínimo e se cabe no limite. Mantém os campos antigos:
 * `knownTotal` = tudo que tem número (confirmado + informado + estimado); `unknown` = o que ficou sem valor.
 */
export function planSummary(draft, now = new Date()) {
  const lines = [];
  for (const [i, it] of (draft.items ?? []).entries()) {
    const label = it.label?.trim() || it.category;
    const n = parseBRL(it.amount ?? '');
    lines.push({
      key: `item-${i}`, category: CATEGORY_KEY[it.category] ?? 'other', label, essential: false,
      price: Number.isFinite(n) ? itemPrice(it, n, now.toISOString()) : unknownPrice(), reasonIfUnknown: 'valor não informado',
    });
  }
  for (const s of draft.stays ?? []) {
    if (s.cost.status === COST_STATUS.FREE || s.cost.status === COST_STATUS.EXCHANGE) continue;
    lines.push({ key: `stay-${s.id}`, category: 'lodging', label: `Hospedagem: ${s.name}`, essential: false, price: unknownPrice(), reasonIfUnknown: 'valor não informado' });
  }
  for (const s of draft.stays ?? []) {
    if (s.transport.status !== TRANSPORT_STATUS.CONFIRMED) {
      lines.push({ key: `transport-${s.id}`, category: 'transport', label: `Transporte até ${s.name}`, essential: false, price: unknownPrice(), reasonIfUnknown: 'transporte não calculado' });
    }
  }
  const limit = parseBRL(draft.budget ?? '');
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const b = computeBudget(
    { budget: hasLimit ? limit : null, currency: 'BRL', people: 1, rooms: 1, nights: 1, days: 1, legs: 1, lines, requiredCategories: [], contingencyPct: 10 },
    now,
  );
  const unknown = b.pending.map((p) => p.label);
  return {
    knownTotal: Math.round((b.knownTotal + b.estimatedTotal) * 100) / 100,
    confirmedTotal: b.knownTotal,
    estimatedTotal: b.estimatedTotal,
    contingency: b.contingency,
    minimumTotal: b.minimumTotal,
    fit: b.fit,
    finalCostClaim: b.finalCostClaim,
    unknown,
    empty: (draft.items ?? []).length + (draft.stays ?? []).length === 0,
    complete: unknown.length === 0,
    limit: hasLimit ? limit : null,
  };
}
