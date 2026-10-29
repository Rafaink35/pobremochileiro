// Hospedagens guardadas no rascunho da viagem (campings e work exchange), com custo e transporte
// separados em "conhecido" e "não informado/não calculado". O rascunho é local ao navegador do próprio
// usuário (um dispositivo, sem sincronização) — não é persistência multiusuário.
import { parseBRL } from '../../api/fx.js';

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

/**
 * Resumo do plano. O total só soma valores efetivamente informados em BRL; tudo o que é desconhecido
 * entra em `unknown` e impede tratar o total como completo.
 */
export function planSummary(draft) {
  let knownTotal = 0;
  const unknown = [];
  for (const it of draft.items ?? []) {
    const n = parseBRL(it.amount ?? '');
    if (Number.isFinite(n)) knownTotal += n;
    else unknown.push(it.label?.trim() || it.category);
  }
  for (const s of draft.stays ?? []) {
    if (s.cost.status === COST_STATUS.FREE || s.cost.status === COST_STATUS.EXCHANGE) continue;
    unknown.push(`Hospedagem: ${s.name}`);
  }
  for (const s of draft.stays ?? []) {
    if (s.transport.status !== TRANSPORT_STATUS.CONFIRMED) unknown.push(`Transporte até ${s.name}`);
  }
  const limit = parseBRL(draft.budget ?? '');
  return {
    knownTotal,
    unknown,
    empty: (draft.items ?? []).length + (draft.stays ?? []).length === 0,
    complete: unknown.length === 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}
