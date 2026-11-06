// Cadastro próprio de estabelecimentos e preços COM MODERAÇÃO: regras puras, sem banco e sem painel (fase posterior).
// Nada vai ao público sem aprovação; preço "confirmado" exige data e evidência; contato do proponente nunca é público.
import { STAY_CATEGORIES } from './categories.js';
import { CURRENCY_CODES } from './price.js';
import { validateCoordinates } from '../geo.js';

export const SUBMISSION_STATUS = Object.freeze({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' });
const text = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const url = (v) => (/^https:\/\/[^\s]+$/i.test(String(v ?? '').trim()) ? String(v).trim() : null);
const iso = (v) => { const t = Date.parse(v); return v && !Number.isNaN(t) ? new Date(t).toISOString() : null; };

/** Proposta de estabelecimento. Exige consentimento de quem propõe (dono ou autorizado) para publicar. */
export function validateEstablishmentSubmission(input = {}) {
  const problems = [];
  const name = text(input.name);
  if (!name) problems.push('nome ausente');
  if (!STAY_CATEGORIES.includes(input.category)) problems.push('categoria inválida');
  const hasCoord = input.lat !== undefined && input.lat !== null && input.lat !== '';
  const coords = hasCoord ? validateCoordinates(input.lat, input.lon) : null;
  if (hasCoord && !coords) problems.push('coordenadas inválidas');
  if (!coords && !text(input.city)) problems.push('informe coordenadas ou cidade');
  if (!/^[A-Za-z]{2}$/.test(input.country ?? '')) problems.push('país inválido (use o código de 2 letras)');
  if (input.consent !== true) problems.push('consentimento para publicar ausente');
  if (!text(input.contact, 200)) problems.push('contato do proponente ausente (não será público)');
  if (problems.length) return { value: null, problems };
  return {
    value: {
      status: SUBMISSION_STATUS.PENDING, name, category: input.category, lat: coords?.lat ?? null, lon: coords?.lon ?? null, city: text(input.city),
      region: text(input.region), country: input.country.toUpperCase(), address: text(input.address, 300), website: url(input.website),
      evidenceUrl: url(input.evidenceUrl), contact: text(input.contact, 200),
    },
    problems: [],
  };
}

/** Proposta de preço. "confirmed" só com evidência (link ou descrição) e data; sem evidência vira "published". */
export function validateStayPriceSubmission(input = {}, now = new Date()) {
  const problems = [];
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) problems.push('valor ausente ou inválido');
  if (!CURRENCY_CODES.has(String(input.currency ?? ''))) problems.push('moeda inválida');
  if (!['person', 'room'].includes(input.unit?.basis) || input.unit?.period !== 'night') problems.push('unidade inválida (por pessoa ou por quarto, por noite)');
  const observedAt = iso(input.observedAt);
  if (!observedAt) problems.push('data da observação ausente');
  else if (Date.parse(observedAt) > now.getTime() + 86_400_000) problems.push('data da observação no futuro');
  if (!text(input.establishmentId)) problems.push('estabelecimento ausente');
  const evidence = url(input.evidenceUrl) || text(input.evidenceNote, 300);
  if (problems.length) return { value: null, problems };
  return {
    value: {
      status: SUBMISSION_STATUS.PENDING, requested: input.requested === 'confirmed' && evidence ? 'confirmed' : 'published', establishmentId: text(input.establishmentId),
      amount, currency: input.currency, unit: { basis: input.unit.basis, period: 'night' }, observedAt, evidenceUrl: url(input.evidenceUrl), evidenceNote: text(input.evidenceNote, 300),
    },
    problems: [],
  };
}

/** Decisão da moderação. Rejeitar exige motivo. Aprovar preço "confirmado" define a validade de 30 dias a partir da observação. */
export function moderate(submission, { decision, moderator, note } = {}, now = new Date()) {
  if (submission.status !== SUBMISSION_STATUS.PENDING) return { value: null, problems: ['proposta já foi decidida'] };
  if (!['approve', 'reject'].includes(decision) || !text(moderator)) return { value: null, problems: ['decisão ou moderador ausente'] };
  if (decision === 'reject' && !text(note)) return { value: null, problems: ['rejeitar exige um motivo'] };
  const out = { ...submission, status: decision === 'approve' ? SUBMISSION_STATUS.APPROVED : SUBMISSION_STATUS.REJECTED, moderatedBy: moderator, moderatedAt: now.toISOString(), moderationNote: text(note, 300) };
  if (decision === 'approve' && submission.requested) {
    out.status = SUBMISSION_STATUS.APPROVED;
    out.approved = true;
    out.priceStatus = submission.requested;
    if (submission.requested === 'confirmed') out.validUntil = new Date(Date.parse(submission.observedAt) + 30 * 86_400_000).toISOString();
  }
  return { value: out, problems: [] };
}

/** Versão pública: sem contato, moderador ou notas internas. */
export function toPublic(submission) {
  const { contact, moderatedBy, moderationNote, ...rest } = submission; // eslint-disable-line no-unused-vars
  return rest;
}
