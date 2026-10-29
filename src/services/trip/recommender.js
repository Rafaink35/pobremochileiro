// Recomendador determinístico. Ordena por regras explícitas (não por "nota"), usando só dados da base de conhecimento.
// Ordem de desempate, nesta sequência (cada critério só decide se o anterior empatar):
//  1. compatibilidade com o orçamento  2. qualidade e atualidade dos preços  3. preferências do viajante
//  4. disponibilidade conhecida de transporte e hospedagem  5. menos custos essenciais desconhecidos
//  6. menor custo mínimo  7. nome (ordem alfabética).
import { computeBudget, lineTotal } from './budget.js';
import { PRICE_STATUS, effectiveStatus, unitLabel, unknownPrice } from './price.js';
import { TRANSPORT_MODES, isEmptyKnowledgeBase, knownOrigins, normKey, resolveOrigin, sourceOf } from './knowledge.js';

export const RECOMMEND_STATUS = Object.freeze({
  OK: 'ok',
  INSUFFICIENT_DATA: 'insufficient_data',
  UNKNOWN_ORIGIN: 'unknown_origin',
  UNKNOWN_DESTINATION: 'unknown_destination',
  INVALID_REQUEST: 'invalid_request',
  NONE_WITHIN_BUDGET: 'none_within_budget',
});

const MODE_LABEL = { bus: 'Ônibus', flight: 'Voo', train: 'Trem', ferry: 'Balsa', car: 'Carro' };
const KIND_LABEL = { camping: 'Camping', caravan_site: 'Área de motorhome', hostel: 'Hostel', hotel: 'Hotel', guesthouse: 'Pousada', work_exchange: 'Trabalho em troca', other: 'Hospedagem' };
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FIT_ORDER = { within: 0, within_partial: 1, unknown: 2, over: 3, no_budget: 2 };

export function normalizeRequest(req = {}) {
  const issues = [];
  const budget = Number(req.budget);
  const days = Number(req.days);
  if (!(budget > 0)) issues.push('Informe o orçamento.');
  if (!Number.isInteger(days) || days < 1 || days > 60) issues.push('Informe a duração em dias (1 a 60).');
  if (!String(req.origin ?? '').trim()) issues.push('Informe a origem.');
  const people = Number.isInteger(Number(req.people)) && Number(req.people) >= 1 ? Number(req.people) : 1;
  const hasCar = req.hasCar === true ? true : req.hasCar === false ? false : null;
  let modes = (Array.isArray(req.modes) && req.modes.length ? req.modes : ['bus', 'flight', 'train', 'ferry']).filter((m) => TRANSPORT_MODES.includes(m));
  if (hasCar === true && !modes.includes('car')) modes = [...modes, 'car'];
  if (hasCar === false) modes = modes.filter((m) => m !== 'car'); // sem carro: nunca sugerir carro
  return {
    issues,
    request: {
      budget, days, nights: days - 1, people, rooms: Number(req.rooms) >= 1 ? Number(req.rooms) : Math.ceil(people / 2),
      origin: String(req.origin ?? '').trim(), preferences: [...new Set((req.preferences ?? []).map(normKey).filter(Boolean))],
      modes, hasCar, contingencyPct: Number.isFinite(req.contingencyPct) ? req.contingencyPct : 10,
      includeOver: Boolean(req.includeOver), destinationId: req.destinationId ?? null,
    },
  };
}

const evidenceOf = (kb, price, label) => ({ label, sourceName: price.origin?.name ?? null, license: sourceOf(kb, price)?.license ?? null, url: price.referenceUrl, collectedAt: price.collectedAt, status: price.status });

function pickCheapest(candidates, ctx, now) {
  const scored = candidates.map((c) => ({ c, total: lineTotal(c.price, ctx, now) }));
  const priced = scored.filter((s) => s.total.amount !== null).sort((a, b) => a.total.amount - b.total.amount || String(a.c.id).localeCompare(String(b.c.id)));
  return priced[0]?.c ?? scored.sort((a, b) => String(a.c.id).localeCompare(String(b.c.id)))[0]?.c ?? null;
}

const workAvailable = (w, now) => w.status === 'approved' && (!w.endDate || w.endDate >= now.toISOString().slice(0, 10)) && w.spots !== 0;

function buildCandidate(kb, dest, req, origin, now) {
  const ctx = { currency: 'BRL', people: req.people, rooms: req.rooms, nights: req.nights, days: req.days, legs: 2 };
  const lines = [];
  const evidence = [];
  const notes = [];

  // Transporte: a opção mais barata entre as permitidas para a origem.
  const transports = kb.transportOptions.filter((t) => t.destinationId === dest.id && t.originKey === origin.key && req.modes.includes(t.mode));
  const t = pickCheapest(transports, ctx, now);
  lines.push({
    key: 'transport', category: 'transport', label: t ? `${MODE_LABEL[t.mode]} ${origin.name} ⇄ ${dest.name}` : `Transporte até ${dest.name}`,
    price: t ? t.price : unknownPrice(), reasonIfUnknown: t ? undefined : `nenhum transporte (${req.modes.map((m) => MODE_LABEL[m]).join(', ')}) cadastrado a partir de ${origin.name}`,
  });
  if (t?.price.amount !== null && t) evidence.push(evidenceOf(kb, t.price, 'transporte'));

  // Hospedagem (só se houver noites).
  let lodgingChoice = null;
  if (req.nights > 0) {
    let options = [
      ...kb.lodgings.filter((l) => l.destinationId === dest.id).map((l) => ({ ...l, display: KIND_LABEL[l.kind] })),
      ...kb.workExchanges.filter((w) => w.destinationId === dest.id && workAvailable(w, now)).map((w) => ({ id: w.id, name: w.hostName, kind: 'work_exchange', price: w.price, display: KIND_LABEL.work_exchange, hoursPerWeek: w.hoursPerWeek, tags: [] })),
    ];
    const wantCamp = req.preferences.includes('camping');
    const wantWork = req.preferences.includes('work exchange') || req.preferences.includes('work_exchange');
    if (wantWork && options.some((o) => o.kind === 'work_exchange')) options = options.filter((o) => o.kind === 'work_exchange');
    else if (wantCamp && options.some((o) => o.kind === 'camping' || o.kind === 'caravan_site')) options = options.filter((o) => o.kind === 'camping' || o.kind === 'caravan_site');
    lodgingChoice = pickCheapest(options, ctx, now);
    lines.push({
      key: 'lodging', category: 'lodging', label: lodgingChoice ? `${lodgingChoice.display}: ${lodgingChoice.name}` : `Hospedagem em ${dest.name}`,
      price: lodgingChoice ? lodgingChoice.price : unknownPrice(), reasonIfUnknown: lodgingChoice ? undefined : 'nenhuma hospedagem cadastrada no destino',
    });
    if (lodgingChoice?.price.amount !== null && lodgingChoice) evidence.push(evidenceOf(kb, lodgingChoice.price, 'hospedagem'));
  }

  lines.push({ key: 'food', category: 'food', label: 'Alimentação', price: dest.dailyFood, reasonIfUnknown: 'custo diário de alimentação não cadastrado para o destino' });
  if (dest.dailyFood.amount !== null) evidence.push(evidenceOf(kb, dest.dailyFood, 'alimentação'));
  lines.push({ key: 'local', category: 'local_transport', label: 'Deslocamentos locais', price: dest.localTransportDaily, essential: false, reasonIfUnknown: 'custo de deslocamento local não cadastrado' });
  if (dest.localTransportDaily.amount !== null) evidence.push(evidenceOf(kb, dest.localTransportDaily, 'deslocamento local'));

  // Atividades que combinam com as preferências (até 3, as de menor custo conhecido primeiro).
  const matchedActivities = kb.activities
    .filter((a) => a.destinationId === dest.id && a.tags.some((tag) => req.preferences.includes(tag)))
    .map((a) => ({ a, total: lineTotal(a.price, { ...ctx }, now).amount }))
    .sort((x, y) => (x.total ?? Infinity) - (y.total ?? Infinity) || x.a.name.localeCompare(y.a.name, 'pt-BR'))
    .slice(0, 3);
  for (const { a } of matchedActivities) {
    lines.push({ key: `act-${a.id}`, category: 'activities', label: a.name, price: a.price, essential: false });
    if (a.price.amount !== null) evidence.push(evidenceOf(kb, a.price, `atividade: ${a.name}`));
  }
  if (req.preferences.length && !matchedActivities.length) notes.push('Nenhuma atração cadastrada combina com as preferências; custo de atividades não está no total.');

  const budget = computeBudget({
    budget: req.budget, currency: 'BRL', people: req.people, rooms: req.rooms, nights: req.nights, days: req.days, legs: 2,
    contingencyPct: req.contingencyPct, lines, requiredCategories: req.nights > 0 ? ['transport', 'lodging', 'food'] : ['transport', 'food'],
  }, now);
  const matchedPreferences = req.preferences.filter((p) => dest.tags.includes(p) || matchedActivities.some(({ a }) => a.tags.includes(p)) || (lodgingChoice && (lodgingChoice.kind === p || (p === 'work exchange' && lodgingChoice.kind === 'work_exchange'))));

  const valued = budget.lines.filter((l) => l.total.status !== 'unknown');
  const fresh = valued.filter((l) => l.total.status === PRICE_STATUS.CONFIRMED || l.total.status === PRICE_STATUS.PUBLISHED).length;
  const quality = { total: budget.lines.length, fresh, estimatedOrStale: valued.length - fresh, unknown: budget.lines.length - valued.length };
  quality.freshShare = quality.total ? fresh / quality.total : 0;

  return {
    destination: dest, transportChoice: t, lodgingChoice, budget, quality, matchedPreferences, evidence, notes,
    availability: { transport: Boolean(t), lodging: req.nights === 0 ? null : Boolean(lodgingChoice) },
  };
}

function reasonsFor(c, req, kb, now) {
  const b = c.budget;
  const out = [];
  if (b.fit === 'over') out.push({ code: 'over_budget', text: `Custo mínimo ${brl(b.minimumTotal)} passa do orçamento de ${brl(req.budget)}.`, evidence: [] });
  else if (b.fit === 'unknown') out.push({ code: 'no_data', text: 'Não há valores conhecidos para comparar com o orçamento.', evidence: [] });
  else {
    const saldoTxt = b.balance.kind === 'upper_bound' ? `saldo de no máximo ${brl(b.balance.amount)} (há custos pendentes)` : `saldo de ${brl(b.balance.amount)}`;
    out.push({ code: b.complete ? 'within_budget' : 'within_budget_partial', text: `Custo mínimo ${brl(b.minimumTotal)} (inclui ${b.contingency.pct}% de reserva sobre o conhecido) dentro do orçamento de ${brl(req.budget)}: ${saldoTxt}.`, evidence: [] });
  }
  for (const l of b.lines.filter((x) => x.total.amount !== null && ['transport', 'lodging', 'food'].includes(x.category))) {
    const mult = l.total.multiplier;
    out.push({ code: `cost_${l.category}`, text: `${l.label}: ${brl(l.total.amount)} (${brl(l.price.amount)} ${unitLabel(l.price.unit)}${mult ? `, ${mult}×` : ''}; ${statusText(l.total.status)}).`, evidence: c.evidence.filter((e) => e.label === { transport: 'transporte', lodging: 'hospedagem', food: 'alimentação' }[l.category]) });
  }
  if (c.matchedPreferences.length) out.push({ code: 'preferences', text: `Combina com: ${c.matchedPreferences.join(', ')}.`, evidence: [] });
  else if (req.preferences.length) out.push({ code: 'preferences_none', text: `Nenhuma preferência (${req.preferences.join(', ')}) encontrada nos dados deste destino.`, evidence: [] });
  if (c.lodgingChoice?.kind === 'work_exchange') out.push({ code: 'work_exchange', text: `Hospedagem em troca de trabalho${c.lodgingChoice.hoursPerWeek ? ` (${c.lodgingChoice.hoursPerWeek} h/semana)` : ''}; despesas do voluntário só contam se informadas pelo anfitrião.`, evidence: [] });
  for (const p of b.pending) out.push({ code: 'pending', text: `Pendente (${p.essential ? 'essencial' : 'não essencial'}): ${p.label}, ${p.reason}.`, evidence: [] });
  const stale = b.lines.filter((l) => l.total.status === 'stale');
  for (const l of stale) out.push({ code: 'stale_price', text: `Preço desatualizado, tratado como estimativa: ${l.label}.`, evidence: [] });
  const dates = c.evidence.map((e) => e.collectedAt).filter(Boolean).sort();
  if (dates.length) out.push({ code: 'data_dates', text: `Preços coletados entre ${dates[0].slice(0, 10)} e ${dates.at(-1).slice(0, 10)}.`, evidence: [] });
  for (const n of c.notes) out.push({ code: 'note', text: n, evidence: [] });
  return out;
}

const statusText = (s) => ({ confirmed: 'confirmado', published: 'publicado, não reconfirmado', estimate: 'estimativa', stale: 'desatualizado, tratado como estimativa' }[s] ?? s);

function compare(a, b) {
  const ka = rankKey(a);
  const kb = rankKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}
function rankKey(c) {
  const avail = (c.availability.transport ? 0 : 1) + (c.availability.lodging === false ? 1 : 0);
  return [FIT_ORDER[c.budget.fit], -c.quality.freshShare, -c.matchedPreferences.length, avail, c.budget.essentialPending, c.budget.minimumTotal, c.destination.name.toLocaleLowerCase('pt-BR')];
}

/** Recomenda destinos. Nunca inventa dados: sem base ou sem origem conhecida, devolve o motivo. */
export function recommend(rawRequest, kb, now = new Date()) {
  const { issues, request: req } = normalizeRequest(rawRequest);
  if (issues.length) return { status: RECOMMEND_STATUS.INVALID_REQUEST, results: [], hidden: { over: 0 }, message: issues.join(' '), issues };
  if (isEmptyKnowledgeBase(kb)) {
    return { status: RECOMMEND_STATUS.INSUFFICIENT_DATA, results: [], hidden: { over: 0 }, message: 'A base de viagens ainda está vazia: não há destinos, preços nem fontes cadastrados.' };
  }
  const origins = knownOrigins(kb);
  const origin = resolveOrigin(kb, req.origin);
  if (!origin) {
    return {
      status: RECOMMEND_STATUS.UNKNOWN_ORIGIN, results: [], hidden: { over: 0 }, knownOrigins: origins.map((o) => o.name),
      message: origins.length ? `Não tenho dados saindo de "${req.origin}". Origens com dados: ${origins.map((o) => o.name).join(', ')}.` : 'A base ainda não tem nenhuma origem com transporte cadastrado.',
    };
  }
  let dests = kb.destinations;
  if (req.destinationId) {
    dests = dests.filter((d) => d.id === req.destinationId);
    if (!dests.length) return { status: RECOMMEND_STATUS.UNKNOWN_DESTINATION, results: [], hidden: { over: 0 }, message: 'Destino não encontrado na base.' };
  }
  const all = dests.map((d) => buildCandidate(kb, d, req, origin, now));
  const visible = all.filter((c) => req.includeOver || c.budget.fit !== 'over');
  const ranked = visible.sort(compare).map((c, i) => ({ rank: i + 1, ...c, reasons: reasonsFor(c, req, kb, now) }));
  const hiddenOver = all.length - visible.length;
  return {
    status: ranked.length ? RECOMMEND_STATUS.OK : RECOMMEND_STATUS.NONE_WITHIN_BUDGET,
    results: ranked, hidden: { over: hiddenOver }, request: req, origin: origin.name,
    message: ranked.length ? null : `Nenhum destino da base cabe em ${brl(req.budget)} com os dados atuais (${hiddenOver} acima do orçamento).`,
    assumptions: [`${req.people} pessoa(s) em ${req.rooms} quarto(s)`, `${req.days} dias e ${req.nights} noite(s)`, 'transporte contado em 2 trechos (ida e volta)'],
  };
}
