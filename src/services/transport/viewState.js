// Estados visuais da pesquisa de transporte, sem lógica de React (testável isoladamente).
import { SEARCH_STATUS } from './transportProvider.js';
import { isStale } from './normalizers.js';

export const VIEW_STATE = Object.freeze({
  LOADING: 'loading',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
  NOT_CONFIGURED: 'not_configured',
  STALE: 'stale',
  RESULTS: 'results',
});

const COPY = {
  [VIEW_STATE.LOADING]: 'Procurando nas fontes configuradas…',
  [VIEW_STATE.EMPTY]: 'Nenhuma rota encontrada nas fontes configuradas.',
  [VIEW_STATE.UNAVAILABLE]: 'Fonte indisponível no momento. Tente de novo mais tarde.',
  [VIEW_STATE.NOT_CONFIGURED]: 'Esta fonte ainda não está configurada.',
  [VIEW_STATE.STALE]: 'Dados possivelmente desatualizados: confirme com o operador.',
  [VIEW_STATE.RESULTS]: null,
};

/** Estado de um provedor a partir da resposta de `searchAll`. */
export function describeProviderState(result, now = new Date()) {
  if (!result) return { state: VIEW_STATE.LOADING, text: COPY[VIEW_STATE.LOADING] };
  let state;
  switch (result.status) {
    case SEARCH_STATUS.OK:
      state = result.source && isStale(result.source.updatedAt ?? result.source.obtainedAt, now)
        ? VIEW_STATE.STALE
        : VIEW_STATE.RESULTS;
      break;
    case SEARCH_STATUS.EMPTY:
      state = VIEW_STATE.EMPTY;
      break;
    case SEARCH_STATUS.NOT_CONFIGURED:
      state = VIEW_STATE.NOT_CONFIGURED;
      break;
    default:
      state = VIEW_STATE.UNAVAILABLE;
  }
  return { state, text: result.message || COPY[state] };
}

/** Rótulo do preço: ausente nunca vira "R$ 0". */
export function priceLabel(price) {
  if (!price) return 'Preço não informado';
  try {
    return price.amount.toLocaleString('pt-BR', { style: 'currency', currency: price.currency });
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}
