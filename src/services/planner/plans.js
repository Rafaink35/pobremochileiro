// Vários planos (cenários) para comparar qual sai mais barato. O plano ATIVO continua em draft.items e draft.stays
// (assim todo o resto do app segue igual); os outros ficam guardados em draft.plans. Tudo local ao navegador.
import { parseBRL } from '../../api/fx.js';
import { planSummary } from './stays.js';

export const CATEGORIES = ['Transporte', 'Hospedagem', 'Comida', 'Passeios', 'Extras'];
const DEFAULT_ID = 'p1';
const MAX_PLANS = 6;
const clean = (s) => String(s ?? '').trim().slice(0, 40);

export const activePlanId = (d) => d.activePlanId ?? DEFAULT_ID;
export const activePlanName = (d) => d.activePlanName ?? 'Plano A';
const order = (d) => (d.planOrder?.length ? d.planOrder : [activePlanId(d)]);

const stash = (d) => ({ ...(d.plans ?? {}), [activePlanId(d)]: { name: activePlanName(d), items: d.items ?? [], stays: d.stays ?? [] } });

/** Todos os planos, na ordem de criação, com o ativo lido do rascunho. */
export function listPlans(d) {
  const all = stash(d);
  return order(d)
    .filter((id) => all[id])
    .map((id) => ({ id, name: all[id].name, items: all[id].items ?? [], stays: all[id].stays ?? [], active: id === activePlanId(d) }));
}

function nextName(d) {
  const used = new Set(listPlans(d).map((p) => p.name));
  for (let i = 0; i < 26; i += 1) {
    const name = `Plano ${String.fromCharCode(65 + i)}`;
    if (!used.has(name)) return name;
  }
  return `Plano ${used.size + 1}`;
}

/** Cria um plano novo (vazio ou cópia do ativo) e o torna ativo. Máximo de 6 planos. */
export function createPlan(d, { name, copy = false, id } = {}) {
  if (listPlans(d).length >= MAX_PLANS) return { draft: d, created: false };
  const newId = id ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const finalName = clean(name) || nextName(d);
  return {
    created: true,
    draft: {
      ...d,
      plans: stash(d),
      planOrder: [...order(d), newId],
      activePlanId: newId,
      activePlanName: finalName,
      items: copy ? (d.items ?? []).map((i) => ({ ...i })) : [],
      stays: copy ? (d.stays ?? []).map((s) => ({ ...s })) : [],
    },
  };
}

export function switchPlan(d, id) {
  if (id === activePlanId(d)) return d;
  const all = stash(d);
  const target = all[id];
  if (!target) return d;
  const { [id]: _removed, ...rest } = all;
  return { ...d, plans: rest, planOrder: order(d), activePlanId: id, activePlanName: target.name, items: target.items ?? [], stays: target.stays ?? [] };
}

export function renamePlan(d, name) {
  const n = clean(name);
  return n ? { ...d, activePlanName: n, planOrder: order(d) } : d;
}

/** Apaga o plano ativo e passa para o primeiro que sobrar. Nunca apaga o último. */
export function deletePlan(d) {
  const ids = order(d);
  if (ids.length <= 1) return d;
  const { [activePlanId(d)]: _gone, ...rest } = stash(d);
  const left = ids.filter((i) => i !== activePlanId(d));
  const target = rest[left[0]];
  const { [left[0]]: _t, ...others } = rest;
  return { ...d, plans: others, planOrder: left, activePlanId: left[0], activePlanName: target.name, items: target.items ?? [], stays: target.stays ?? [] };
}

/** Acrescenta itens ao plano ativo (usado por todas as telas). */
export function addPlanItems(d, rows, category = 'Transporte') {
  return {
    ...d,
    items: [
      ...(d.items ?? []),
      ...[rows].flat().map((r) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category, ...r })),
    ],
  };
}

/**
 * Compara os planos. "Mais barato" só vale entre planos COMPLETOS (sem valor faltando): um plano com itens sem preço
 * parece barato porque falta somar. Sem plano completo, mostra só o menor total parcial, com aviso.
 */
export function comparePlans(d) {
  const days = Number(d.days) > 0 ? Number(d.days) : null;
  const rows = listPlans(d).map((p) => {
    const s = planSummary({ items: p.items, stays: p.stays, budget: d.budget });
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    for (const it of p.items) {
      const n = parseBRL(it.amount ?? '');
      if (Number.isFinite(n) && byCategory[it.category] !== undefined) byCategory[it.category] += n;
    }
    return {
      id: p.id, name: p.name, active: p.active,
      itemCount: p.items.length, stayCount: p.stays.length,
      total: s.knownTotal, complete: s.complete, empty: s.empty, unknown: s.unknown,
      perDay: days && s.knownTotal > 0 ? s.knownTotal / days : null,
      byCategory, limit: s.limit,
      overLimit: s.limit !== null && s.knownTotal > s.limit,
      leftover: s.limit !== null ? s.limit - s.knownTotal : null,
    };
  });
  const filled = rows.filter((r) => !r.empty);
  const complete = filled.filter((r) => r.complete);
  // Só dá para afirmar que um plano é o mais barato se ele está completo E nenhum outro plano pode ser mais barato:
  // o total parcial de um plano incompleto é só o mínimo, o custo real dele é maior ou igual.
  const best = complete.length ? complete.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const cheapest = best && filled.length > 1 && filled.every((r) => r.id === best.id || r.total >= best.total) ? best : null;
  const lowestPartial = !cheapest && filled.length > 1 ? filled.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  return { rows, cheapestId: cheapest?.id ?? null, lowestPartialId: lowestPartial?.id ?? null, comparable: filled.length > 1 && filled.every((r) => r.complete) };
}
