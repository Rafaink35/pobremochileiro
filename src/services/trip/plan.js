// Converte um resultado do recomendador em itens do planejador. Custos pendentes entram SEM valor (contam como desconhecidos).
const PLAN_CATEGORY = { transport: 'Transporte', lodging: 'Hospedagem', food: 'Comida', activities: 'Passeios', local_transport: 'Transporte', other: 'Extras' };

export function planFromResult(result, request) {
  const items = result.budget.lines.map((l, i) => {
    const t = l.total;
    const suffix = t.status === 'estimate' || t.status === 'stale' ? ' (estimativa)' : '';
    return {
      id: `trip-${result.destination.id}-${l.key}-${i}`,
      category: PLAN_CATEGORY[l.category] ?? 'Extras',
      label: `${l.label}${suffix}`,
      amount: t.amount !== null ? t.amount.toFixed(2).replace('.', ',') : '',
      url: l.price.referenceUrl ?? '',
      source: l.price.origin?.name ?? 'Motor de recomendação',
    };
  });
  return {
    tripName: result.destination.name,
    origin: request.origin,
    days: String(request.days),
    budget: String(request.budget).replace('.', ','),
    items,
  };
}
