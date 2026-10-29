// Normalização de resultados de transporte. Regra central: preço desconhecido é `null`, nunca 0.

export const MODES = Object.freeze({
  BUS: 'bus',
  TRAIN: 'train',
  SUBWAY: 'subway',
  FERRY: 'ferry',
  WALK: 'walk',
  MULTIMODAL: 'multimodal',
  OTHER: 'other',
});

// route_type do GTFS (valores básicos e estendidos mais comuns) -> modalidade.
export function gtfsRouteTypeToMode(routeType) {
  const t = Number(routeType);
  if (t === 3 || (t >= 700 && t < 800)) return MODES.BUS;
  if (t === 2 || (t >= 100 && t < 200)) return MODES.TRAIN;
  if (t === 1 || t === 0 || (t >= 400 && t < 500)) return MODES.SUBWAY; // metrô/bonde/VLT
  if (t === 4 || (t >= 1000 && t < 1100)) return MODES.FERRY;
  return MODES.OTHER;
}

// OTP: modo do trecho -> modalidade.
export function otpModeToMode(mode) {
  switch (String(mode || '').toUpperCase()) {
    case 'BUS':
      return MODES.BUS;
    case 'RAIL':
    case 'TRAIN':
      return MODES.TRAIN;
    case 'SUBWAY':
    case 'TRAM':
      return MODES.SUBWAY;
    case 'FERRY':
      return MODES.FERRY;
    case 'WALK':
      return MODES.WALK;
    default:
      return MODES.OTHER;
  }
}

/**
 * Converte "HH:MM:SS" do GTFS em segundos desde o início do dia de serviço.
 * Aceita horas >= 24 (viagens que passam da meia-noite). Retorna null se inválido ou vazio.
 */
export function parseGtfsTime(value) {
  if (typeof value !== 'string') return null;
  const m = /^\s*(\d{1,3}):([0-5]\d):([0-5]\d)\s*$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Formata segundos desde o início do dia de serviço: "25:10" vira "01:10 (+1 dia)". */
export function formatServiceTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const days = Math.floor(seconds / 86400);
  const rest = seconds % 86400;
  const hh = String(Math.floor(rest / 3600)).padStart(2, '0');
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, '0');
  return `${hh}:${mm}${days > 0 ? ` (+${days} dia${days > 1 ? 's' : ''})` : ''}`;
}

/** Duração em segundos entre dois horários de serviço; null se faltar algum ou ficar negativa. */
export function durationSeconds(startSeconds, endSeconds) {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return null;
  const d = endSeconds - startSeconds;
  return d >= 0 ? d : null;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** Preço normalizado: só existe com valor numérico >= 0 e moeda; qualquer outra coisa vira null. */
export function normalizePrice(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.'));
  const cur = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  if (!Number.isFinite(n) || n < 0 || !/^[A-Z]{3}$/.test(cur)) return null;
  return { amount: n, currency: cur };
}

/** Dados considerados desatualizados se a data de atualização for mais antiga que `maxAgeDays`. */
export function isStale(updatedAt, now = new Date(), maxAgeDays = 180) {
  if (!updatedAt) return true; // sem data conhecida: tratar como não confiável
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > maxAgeDays * 86400000;
}

/**
 * Cria uma opção de viagem no formato comum a todos os provedores.
 * `incomplete` indica dados faltando; `estimated` indica valores calculados/aproximados.
 */
export function createTravelOption(raw, source) {
  const price = normalizePrice(raw.price?.amount ?? raw.priceAmount, raw.price?.currency ?? raw.priceCurrency);
  const duration =
    Number.isFinite(raw.durationSeconds) && raw.durationSeconds >= 0 ? raw.durationSeconds : null;
  const url = typeof raw.url === 'string' && /^https?:\/\//i.test(raw.url) ? raw.url : null;
  const issues = [];
  if (!price) issues.push('Preço não informado');
  if (duration === null) issues.push('Duração não disponível');
  if (!raw.departure) issues.push('Horário de partida não disponível');
  if (raw.partial) issues.push('Rota parcial ou incompleta');

  return {
    id: raw.id ?? null,
    origin: raw.origin ?? null,
    destination: raw.destination ?? null,
    mode: Object.values(MODES).includes(raw.mode) ? raw.mode : MODES.OTHER,
    legs: Array.isArray(raw.legs) ? raw.legs : [],
    departure: raw.departure ?? null,
    arrival: raw.arrival ?? null,
    departureText: raw.departureText ?? null, // horário já formatado pelo provedor (fuso da fonte)
    arrivalText: raw.arrivalText ?? null,
    durationSeconds: duration,
    price,
    operator: raw.operator ?? null,
    lineName: raw.lineName ?? null,
    url,
    estimated: Boolean(raw.estimated),
    incomplete: issues.length > 0,
    issues,
    source: source ?? null,
  };
}
