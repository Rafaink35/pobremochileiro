// Oportunidades de troca de trabalho por hospedagem. Só aparecem como disponíveis as publicadas
// E aprovadas (status "approved"), não encerradas e com vaga. Nada é inventado para preencher campos.
import { validateCoordinates } from '../geo.js';

export const OPPORTUNITY_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  CLOSED: 'closed',
  REJECTED: 'rejected',
});

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const list = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
const date = (v) => (text(v) && !Number.isNaN(Date.parse(v)) ? text(v).slice(0, 10) : null);
const httpUrl = (v) => (text(v) && /^https?:\/\/[^\s]+$/i.test(v.trim()) ? v.trim() : null);

/** Converte uma linha do banco (snake_case) no formato interno. */
export function normalizeOpportunity(row) {
  const coords = validateCoordinates(row.lat, row.lon);
  return {
    id: row.id,
    hostName: text(row.host_name),
    placeName: text(row.place_name),
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    city: text(row.city),
    state: text(row.state),
    hostType: text(row.host_type),
    tasks: list(row.tasks),
    skills: list(row.skills),
    hoursPerWeek: num(row.hours_per_week),
    daysOffPerWeek: num(row.days_off_per_week),
    accommodation: text(row.accommodation),
    meals: text(row.meals),
    startDate: date(row.start_date),
    endDate: date(row.end_date),
    spots: num(row.spots),
    requirements: text(row.requirements),
    expenses: text(row.expenses),
    conditions: text(row.conditions),
    externalUrl: httpUrl(row.external_url),
    status: Object.values(OPPORTUNITY_STATUS).includes(row.status) ? row.status : OPPORTUNITY_STATUS.PENDING,
    approvedAt: row.approved_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    source: { name: 'Pobre Mochileiro (anfitrião cadastrado)', license: null, verifiedAt: row.approved_at ?? null },
  };
}

/** Disponível = aprovada, não encerrada por data e com vaga (vagas não informadas não bloqueiam). */
export function isAvailable(op, now = new Date()) {
  if (op.status !== OPPORTUNITY_STATUS.APPROVED) return false;
  if (op.endDate && op.endDate < now.toISOString().slice(0, 10)) return false;
  if (op.spots !== null && op.spots <= 0) return false;
  return true;
}

export function filterOpportunities(rows, { place = '', now = new Date() } = {}) {
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = norm(place).trim();
  const normalized = rows.map(normalizeOpportunity);
  const available = normalized.filter((o) => isAvailable(o, now));
  const matches = q
    ? available.filter((o) => [o.city, o.state, o.placeName, o.hostName].some((f) => norm(f).includes(q)))
    : available;
  return { opportunities: matches, hiddenUnavailable: normalized.length - available.length };
}
