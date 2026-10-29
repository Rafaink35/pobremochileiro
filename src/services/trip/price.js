// Modelo de preço da base de conhecimento. Regras centrais:
//  - Um preço sempre diz o QUE é (status), QUANTO (valor+moeda), POR QUÊ UNIDADE (base × período) e DE ONDE veio.
//  - Valor ausente ou inválido vira "unknown" com amount = null. Nunca vira zero.
//  - Preço publicado não é preço reconfirmado, e preço antigo deixa de contar como confirmado.

export const PRICE_STATUS = Object.freeze({
  CONFIRMED: 'confirmed', // reconfirmado junto à fonte (ou em contato direto)
  PUBLISHED: 'published', // publicado pela fonte, ainda não reconfirmado
  ESTIMATE: 'estimate', // estimativa explicada (ex.: informada pelo viajante); não é preço de fonte
  UNKNOWN: 'unknown',
});

/** Sobre quem/o quê o valor incide. */
export const PRICE_BASIS = Object.freeze(['person', 'group', 'room']);
/** Em que período o valor se repete. `leg` = por trecho; `round_trip` = ida e volta num preço só; `day` = diária. */
export const PRICE_PERIODS = Object.freeze(['once', 'night', 'day', 'leg', 'round_trip']);

const BASIS_LABEL = { person: 'por pessoa', group: 'por grupo', room: 'por quarto' };
const PERIOD_LABEL = { once: '', night: 'por noite', day: 'por diária', leg: 'por trecho', round_trip: 'ida e volta' };

export function unitLabel(unit) {
  if (!unit) return 'unidade não informada';
  return [BASIS_LABEL[unit.basis], PERIOD_LABEL[unit.period]].filter(Boolean).join(' ');
}

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isoDate = (v) => (text(v) && !Number.isNaN(Date.parse(v)) ? text(v) : null);
const httpUrl = (v) => (text(v) && /^https?:\/\/[^\s]+$/i.test(v.trim()) ? v.trim() : null);

/**
 * Cria um preço validado. Nunca lança: entrada incompleta degrada para `unknown` e registra o motivo em `issues`.
 * input: { status, amount, currency, unit:{basis,period}, origin:{sourceId,name}, referenceUrl, collectedAt, validUntil, note }
 */
export function createPrice(input = {}) {
  const issues = [];
  let status = Object.values(PRICE_STATUS).includes(input.status) ? input.status : PRICE_STATUS.UNKNOWN;
  const raw = input.amount;
  const blank = raw === null || raw === undefined || raw === '';
  const amount = blank ? null : Number(raw);
  const currency = text(input.currency)?.toUpperCase() ?? null;
  const unit =
    input.unit && PRICE_BASIS.includes(input.unit.basis) && PRICE_PERIODS.includes(input.unit.period)
      ? { basis: input.unit.basis, period: input.unit.period }
      : null;
  const originName = text(input.origin?.name);
  const origin = originName || text(input.origin?.sourceId) ? { sourceId: text(input.origin?.sourceId), name: originName } : null;
  const collectedAt = isoDate(input.collectedAt);

  if (status !== PRICE_STATUS.UNKNOWN) {
    if (blank) issues.push('valor ausente');
    else if (!Number.isFinite(amount) || amount < 0) issues.push('valor inválido');
    if (!currency || !/^[A-Z]{3}$/.test(currency)) issues.push('moeda ausente ou inválida');
    if (!unit) issues.push('unidade (base e período) ausente ou inválida');
    if (status !== PRICE_STATUS.ESTIMATE) {
      if (!origin) issues.push('origem do preço ausente');
      if (!collectedAt) issues.push('data de coleta ausente');
    } else if (!text(input.note)) {
      issues.push('estimativa sem explicação (note)');
    }
    if (issues.length) status = PRICE_STATUS.UNKNOWN; // dado incompleto não vale como preço
  }

  const known = status !== PRICE_STATUS.UNKNOWN;
  return {
    status,
    amount: known ? amount : null,
    currency: known ? currency : null,
    unit: known ? unit : null,
    origin: known ? origin : null,
    referenceUrl: httpUrl(input.referenceUrl),
    collectedAt: known ? collectedAt : null,
    validUntil: isoDate(input.validUntil),
    note: text(input.note),
    issues,
  };
}

export const unknownPrice = (note = null) => createPrice({ status: PRICE_STATUS.UNKNOWN, note });

/** Idade máxima padrão (dias) de um preço publicado/confirmado antes de deixar de contar como tal. */
export const DEFAULT_MAX_AGE_DAYS = 30;

/** Preço publicado/confirmado vencido (validUntil) ou coletado há mais de `maxAgeDays`. Estimativa e desconhecido: false. */
export function isStalePrice(price, now = new Date(), maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  if (price.status !== PRICE_STATUS.CONFIRMED && price.status !== PRICE_STATUS.PUBLISHED) return false;
  if (price.validUntil) return now.getTime() > Date.parse(price.validUntil);
  if (!price.collectedAt) return true;
  return now.getTime() - Date.parse(price.collectedAt) > maxAgeDays * 86400000;
}

/** Status que vale para o total: preço desatualizado é rebaixado para "stale" (contado como estimativa). */
export function effectiveStatus(price, now, maxAgeDays) {
  if (isStalePrice(price, now, maxAgeDays)) return 'stale';
  return price.status;
}
